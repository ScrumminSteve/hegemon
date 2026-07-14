// HEGEMON engine — Invaders & Incursions, M2.d (Rules pp.22–23; FAQ v2.0).
//
// An incursion (however triggered) runs one sealed, simultaneous bid across
// all participating factions, compares the pooled total to the invader
// strength, and resolves the top card of the invader deck — victory text for
// the highest bidder on a defense, defeat texts (lowest bidder first, then
// the rest in initiative order — FAQ) on a breach. The card is revealed only
// AFTER the bids: that ordering is the entire value of the Courier's peek.
//
// Constants live in data (INCURSION_RULES): defender win resets the threat
// to 0; an invader win sets it back 2 (min 0); every bid is paid win or
// lose; the used card is buried at the bottom of the deck; ties on either
// end are settled by the sovereign-token holder choosing ONE faction.
//
// M3 parity notes honored here:
//   - sealed incursion bids are masked by viewFor exactly like Clash bids;
//   - drawing the invader card invalidates every faction's remembered peek
//     (privateKnowledge.threatDeck) — the banked M2.d contract;
//   - dominance tokens follow track position 1 whenever a card effect
//     reorders a track (owner-audit item: see README).

import { regionProps, controllerOf } from './state.js';
import { INVADER_SETS } from '../data/registry.js';
import { INCURSION_RULES } from '../data/eventCards.js';
import { LEADER_CARDS } from '../data/leaderCards.js';
import { SETUP } from '../data/setup.js';
import { REGIONS as REGION_LIST } from '../data/map.js';
// Tolerated ESM cycle (precedent: combat↔actionPhase, eventPhase↔bidding).
import { progressEventPhase, supplyViolations, fortifiedControlled, inPlay } from './eventPhase.js';

const TOKEN_FOR = { initiative: 'sovereign', prowess: 'blade', command: 'courier' };
const ALL_TRACKS = ['initiative', 'prowess', 'command'];

export function invaderCardDef(state, id) {
  const set = INVADER_SETS[state.scenario.invaderSet || 'base'];
  const c = set[id];
  if (!c) throw new Error(`Unknown invader card ${id}`);
  return c;
}

// ---------- lifecycle ----------

/**
 * Open an incursion: sealed bids from every non-excluded faction.
 * trigger: 'card' | 'threatMax' | 'reattack'. Returns false (always blocking).
 */
export function beginIncursion(state, { trigger, strength, excluded = [], fromCardStep = false } = {}) {
  const s = strength ?? state.threat;
  state.eventPhase.incursion = {
    trigger, strength: s, excluded: [...excluded], fromCardStep,
    phase: 'sealed', bids: {}, outcome: null, highest: null, lowest: null,
    card: null, effectQueue: null, reattack: null,
  };
  const bidders = state.factions.filter(f => !excluded.includes(f));
  for (const fid of bidders) {
    state.pendingQueries.push({ type: 'invaderBid', faction: fid, max: state.authority[fid], strength: s });
  }
  state.log.push({ round: state.round, event: 'incursionBegan', trigger, strength: s,
    ...(excluded.length ? { excluded: [...excluded] } : {}) });
  return false;
}

/** A faction seals its incursion bid; the last one triggers the reveal. */
export function invaderBid(state, fid, amount) {
  const inc = state.eventPhase?.incursion;
  if (!inc) throw new Error('No incursion in progress');
  const qi = state.pendingQueries.findIndex(q => q.type === 'invaderBid' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending incursion bid`);
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Bids are whole tokens, zero or more');
  if (amount > state.authority[fid]) throw new Error(`Bid ${amount} exceeds ${fid}'s ${state.authority[fid]} authority (Rules p.22)`);

  state.pendingQueries.splice(qi, 1);
  inc.bids[fid] = amount;
  state.privateKnowledge[fid].lastBid = { track: 'incursion', amount, round: state.round };

  const bidders = state.factions.filter(f => !inc.excluded.includes(f));
  if (Object.keys(inc.bids).length === bidders.length) revealIncursionBids(state);
}

function revealIncursionBids(state) {
  const inc = state.eventPhase.incursion;
  inc.phase = 'revealed';

  // Every bid is paid to the pool, win or lose (Rules p.23).
  for (const [fid, amt] of Object.entries(inc.bids)) state.authority[fid] -= amt;
  const total = Object.values(inc.bids).reduce((a, b) => a + b, 0);
  inc.total = total;
  state.log.push({ round: state.round, event: 'incursionBidsRevealed', bids: { ...inc.bids }, total, strength: inc.strength });

  // Defenders hold on total >= strength; a strength-0 incursion therefore
  // cannot be lost, but is still bid and resolved (FAQ).
  inc.outcome = total >= inc.strength ? 'defenders' : 'invaders';
  state.log.push({ round: state.round, event: 'incursionOutcome', outcome: inc.outcome, total, strength: inc.strength });

  settleExtreme(state);
}

/** Identify the relevant highest/lowest bidder, querying the sovereign on ties. */
function settleExtreme(state) {
  const inc = state.eventPhase.incursion;
  const side = inc.outcome === 'defenders' ? 'highest' : 'lowest';
  const amounts = Object.values(inc.bids);
  const target = side === 'highest' ? Math.max(...amounts) : Math.min(...amounts);
  const tied = Object.entries(inc.bids).filter(([, a]) => a === target).map(([f]) => f).sort();

  if (tied.length === 1) {
    inc[side] = tied[0];
    resolveOutcome(state);
    return;
  }
  // The sovereign-token holder names ONE faction from the tie (Rules p.23).
  state.pendingQueries.push({
    type: 'invaderTieBreak', faction: state.tokens.sovereign, side, tied, amount: target,
  });
}

export function invaderTieBreak(state, fid, chosen) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'invaderTieBreak' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} holds no incursion tie to break`);
  const q = state.pendingQueries[qi];
  if (!q.tied.includes(chosen)) throw new Error(`Choose one of [${q.tied.join(', ')}]`);
  state.pendingQueries.splice(qi, 1);
  const inc = state.eventPhase.incursion;
  inc[q.side] = chosen;
  state.log.push({ round: state.round, event: 'incursionTieBroken', by: fid, side: q.side, chosen });
  resolveOutcome(state);
}

/** Bids settled: NOW the card turns over, effects queue up, and peeks expire. */
function resolveOutcome(state) {
  const inc = state.eventPhase.incursion;

  inc.card = state.invaderDeck.shift();
  // A draw invalidates every remembered peek (banked M3 contract): the deck
  // a faction saw is no longer the deck that exists.
  for (const fid of state.factions) delete state.privateKnowledge[fid]?.threatDeck;
  state.log.push({ round: state.round, event: 'incursionCardRevealed', card: inc.card, outcome: inc.outcome });

  const def = invaderCardDef(state, inc.card);
  if (inc.outcome === 'defenders') {
    inc.effectQueue = [{ faction: inc.highest, effect: def.win.highest, role: 'highest' }];
  } else {
    // Lowest bidder suffers first, then the rest in initiative order (FAQ).
    inc.effectQueue = [{ faction: inc.lowest, effect: def.loss.lowest, role: 'lowest' }];
    for (const fid of state.tracks.initiative) {
      if (fid === inc.lowest || inc.excluded.includes(fid)) continue;
      inc.effectQueue.push({ faction: fid, effect: def.loss.others, role: 'others' });
    }
  }
  progressIncursion(state);
}

const INCURSION_QUERIES = ['invaderBid', 'invaderTieBreak', 'incursionUnits',
  'incursionTrack', 'incursionCard', 'incursionOption', 'incursionMusterSite'];

/** Drain the effect queue; pause whenever an effect opens a query. */
export function progressIncursion(state) {
  const inc = state.eventPhase?.incursion;
  if (!inc || !inc.effectQueue) return;
  if (state.pendingQueries.some(q => INCURSION_QUERIES.includes(q.type)
      || (q.type === 'muster' && q.source === 'incursion')
      || (q.type === 'reconcileSupply' && q.source === 'incursion'))) return;

  while (inc.effectQueue.length) {
    const { faction, effect } = inc.effectQueue[0];
    const done = applyIncursionEffect(state, faction, effect);
    if (!done) return; // resumes via the query's handler
    inc.effectQueue.shift();
  }
  finishIncursion(state);
}

function finishIncursion(state) {
  const inc = state.eventPhase.incursion;

  // The used card is buried facedown at the bottom of the deck (Rules p.23).
  state.invaderDeck.push(inc.card);

  // Track consequences (Rules p.23): reset on a defense, setback on a breach.
  const from = state.threat;
  state.threat = inc.outcome === 'defenders'
    ? INCURSION_RULES.defenderWinReset
    : Math.max(0, state.threat - INCURSION_RULES.invaderWinSetback);
  if (state.threat !== from) {
    state.log.push({ round: state.round, event: 'threatReset', from, to: state.threat, outcome: inc.outcome });
  }
  state.log.push({ round: state.round, event: 'incursionResolved', card: inc.card, outcome: inc.outcome });

  const { reattack, fromCardStep } = inc;
  delete state.eventPhase.incursion;

  if (reattack) {
    // Preemptive strike: the invaders come again at fixed strength, the
    // previous highest bidder standing apart (card text, owner-transcribed).
    state.log.push({ round: state.round, event: 'incursionReattack', strength: reattack.strength,
      excluded: [...reattack.excluded] });
    beginIncursion(state, { trigger: 'reattack', strength: reattack.strength,
      excluded: reattack.excluded, fromCardStep });
    return;
  }
  if (fromCardStep) state.eventPhase.step += 1;
  progressEventPhase(state);
}

// ---------- track helpers (token follows position 1 — owner-audit item) ----------

function passTokenIfNeeded(state, track) {
  const token = TOKEN_FOR[track];
  const holder = state.tracks[track][0];
  if (state.tokens[token] !== holder) {
    state.tokens[token] = holder;
    state.log.push({ round: state.round, event: 'tokenPassed', track, token, holder });
  }
}

function trackToBottom(state, fid, track) {
  const arr = state.tracks[track];
  arr.splice(arr.indexOf(fid), 1);
  arr.push(fid);
  state.log.push({ round: state.round, event: 'incursionTrackMoved', faction: fid, track, to: 'bottom' });
  passTokenIfNeeded(state, track);
}

function trackToTop(state, fid, track) {
  const arr = state.tracks[track];
  arr.splice(arr.indexOf(fid), 1);
  arr.unshift(fid);
  state.log.push({ round: state.round, event: 'incursionTrackMoved', faction: fid, track, to: 'top' });
  passTokenIfNeeded(state, track);
}

function trackShiftDown(state, fid, track, n) {
  const arr = state.tracks[track];
  const i = arr.indexOf(fid);
  arr.splice(i, 1);
  arr.splice(Math.min(i + n, arr.length), 0, fid);
  state.log.push({ round: state.round, event: 'incursionTrackMoved', faction: fid, track, to: `down${n}` });
  passTokenIfNeeded(state, track);
}

/** Tracks where fid sits at its own best (lowest index) position. */
function highestOwnTracks(state, fid) {
  const pos = ALL_TRACKS.map(t => ({ t, i: state.tracks[t].indexOf(fid) }));
  const best = Math.min(...pos.map(p => p.i));
  return pos.filter(p => p.i === best).map(p => p.t);
}

// ---------- unit helpers ----------

function unitsOf(state, fid, type = null) {
  const out = [];
  for (const [rid, units] of Object.entries(state.unitsByRegion)) {
    for (const u of units) {
      if (u.faction === fid && (!type || u.type === type)) out.push({ region: rid, type: u.type });
    }
  }
  return out;
}

function removeUnit(state, fid, rid, type) {
  const arr = state.unitsByRegion[rid] || [];
  const i = arr.findIndex(u => u.faction === fid && u.type === type);
  if (i === -1) throw new Error(`No ${type} of ${fid} at ${rid}`);
  arr.splice(i, 1);
}

/** Fortified land areas of fid that contain fid units (loss constraint). */
function fortifiedWithUnits(state, fid) {
  const out = [];
  for (const r of REGION_LIST) {
    if (r.kind !== 'land' || regionProps(state, r.id).muster <= 0) continue;
    if (controllerOf(state, r.id) !== fid) continue;
    if ((state.unitsByRegion[r.id] || []).some(u => u.faction === fid)) out.push(r.id);
  }
  return out.sort();
}

// ---------- effect application ----------

// Returns true when fully applied, false when paused on a query.
function applyIncursionEffect(state, fid, effect) {
  switch (effect.type) {
    case 'nothing':
      state.log.push({ round: state.round, event: 'incursionNothing', faction: fid });
      return true;

    case 'tracksToBottomAll':
      for (const t of ALL_TRACKS) trackToBottom(state, fid, t);
      return true;

    case 'chooseTrackToBottom':
      state.pendingQueries.push({ type: 'incursionTrack', faction: fid, mode: 'toBottom', options: [...effect.tracks] });
      return false;

    case 'trackToTopChoice':
      state.pendingQueries.push({ type: 'incursionTrack', faction: fid, mode: 'toTop', options: [...ALL_TRACKS] });
      return false;

    case 'destroyUnits': {
      let regions = null; // null: anywhere
      if (effect.where === 'ownFortified') {
        const forts = fortifiedWithUnits(state, fid);
        if (forts.length) regions = forts; // all losses from ONE of these
      }
      const eligible = regions
        ? regions.flatMap(rid => unitsOf(state, fid).filter(u => u.region === rid))
        : unitsOf(state, fid);
      if (eligible.length === 0) {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'noUnits' });
        return true;
      }
      const count = Math.min(effect.count, regions
        ? Math.max(...regions.map(rid => eligible.filter(u => u.region === rid).length))
        : eligible.length);
      state.pendingQueries.push({ type: 'incursionUnits', faction: fid, purpose: 'destroy',
        count, ...(regions ? { regions, constraint: 'singleRegion' } : {}) });
      return false;
    }

    case 'retrieveLeaderCard': {
      const pile = state.leaderDiscards[fid] || [];
      if (!pile.length) {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'emptyDiscard' });
        return true;
      }
      state.pendingQueries.push({ type: 'incursionCard', faction: fid, from: 'discard',
        purpose: 'retrieve', options: pile.slice() });
      return false;
    }

    case 'discardHighestLeaderCards': {
      const hand = state.leaderHands[fid] || [];
      if (hand.length <= 1) {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'singleCard' });
        return true;
      }
      const top = Math.max(...hand.map(id => LEADER_CARDS[id].strength));
      const gone = hand.filter(id => LEADER_CARDS[id].strength === top);
      state.leaderHands[fid] = hand.filter(id => !gone.includes(id));
      state.leaderDiscards[fid].push(...gone);
      state.log.push({ round: state.round, event: 'incursionCardsDiscarded', faction: fid, cards: gone });
      // Forced down to an empty hand: the discard returns, mirroring the
      // last-card refresh (Rules p.19 analogue; FAQ — owner-audit item).
      if (state.leaderHands[fid].length === 0) {
        state.leaderHands[fid] = state.leaderDiscards[fid];
        state.leaderDiscards[fid] = [];
        state.log.push({ round: state.round, event: 'leaderHandRecycled', faction: fid });
      }
      return true;
    }

    case 'discardChosenLeaderCard': {
      const hand = state.leaderHands[fid] || [];
      if (hand.length <= 1) {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'singleCard' });
        return true;
      }
      state.pendingQueries.push({ type: 'incursionCard', faction: fid, from: 'hand',
        purpose: 'discard', options: hand.slice() });
      return false;
    }

    case 'recoverLeaderDiscard': {
      const pile = state.leaderDiscards[fid] || [];
      if (pile.length) {
        state.leaderHands[fid].push(...pile);
        state.leaderDiscards[fid] = [];
        state.log.push({ round: state.round, event: 'incursionDiscardRecovered', faction: fid, count: pile.length });
      } else {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'emptyDiscard' });
      }
      return true;
    }

    case 'musterOneFortifiedArea': {
      const sites = fortifiedControlled(state, fid);
      if (!sites.length) {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'noFortified' });
        return true;
      }
      if (sites.length === 1) {
        state.pendingQueries.push({ type: 'muster', faction: fid, region: sites[0].region,
          points: sites[0].points, source: 'incursion' });
        state.log.push({ round: state.round, event: 'incursionMusterAwarded', faction: fid, region: sites[0].region });
        return false;
      }
      state.pendingQueries.push({ type: 'incursionMusterSite', faction: fid, options: sites });
      return false;
    }

    case 'supplyShift': {
      const from = state.supply[fid];
      const to = Math.max(effect.min ?? 0, Math.min(effect.max ?? 6, from + effect.amount));
      if (to !== from) {
        state.supply[fid] = to;
        state.log.push({ round: state.round, event: 'supplyAdjusted', faction: fid, from, to, card: 'incursion' });
      }
      if (effect.reconcile) {
        const bad = supplyViolations(state, fid);
        if (bad.length) {
          state.pendingQueries.push({ type: 'reconcileSupply', faction: fid, regions: bad.sort(), source: 'incursion' });
          return false;
        }
      }
      return true;
    }

    case 'choice':
      state.pendingQueries.push({ type: 'incursionOption', faction: fid, options: effect.options });
      return false;

    case 'trackShift': {
      if (effect.track !== 'highestOwn') throw new Error(`Unknown trackShift target ${effect.track}`);
      const candidates = highestOwnTracks(state, fid);
      const n = Math.abs(effect.amount);
      if (candidates.length === 1) {
        trackShiftDown(state, fid, candidates[0], n);
        return true;
      }
      state.pendingQueries.push({ type: 'incursionTrack', faction: fid, mode: 'shiftDown',
        amount: n, options: candidates });
      return false;
    }

    case 'downgradeCavalry': {
      const cav = unitsOf(state, fid, 'cavalry');
      if (!cav.length) {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'noCavalry' });
        return true;
      }
      const n = effect.count === 'all' ? cav.length : Math.min(effect.count, cav.length);
      if (effect.count === 'all' || n === cav.length) {
        downgradeCavalryUnits(state, fid, cav);
        return true;
      }
      // More cavalry than the toll: the owner chooses which are affected.
      state.pendingQueries.push({ type: 'incursionUnits', faction: fid, purpose: 'downgrade',
        count: n, unitType: 'cavalry' });
      return false;
    }

    case 'upgradeInfantry': {
      const inf = unitsOf(state, fid, 'infantry');
      const room = SETUP.unitPool.cavalry - inPlay(state, fid, 'cavalry');
      const max = Math.min(effect.count, inf.length, Math.max(0, room));
      if (max === 0) {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'noUpgrade' });
        return true;
      }
      state.pendingQueries.push({ type: 'incursionUnits', faction: fid, purpose: 'upgrade',
        count: max, unitType: 'infantry', optional: true }); // "up to" — fewer is legal
      return false;
    }

    case 'discardAuthority': {
      const n = effect.count === 'all' ? state.authority[fid] : Math.min(effect.count, state.authority[fid]);
      if (n > 0) {
        state.authority[fid] -= n;
        state.log.push({ round: state.round, event: 'incursionAuthorityLost', faction: fid, amount: n });
      } else {
        state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'noAuthority' });
      }
      return true;
    }

    case 'refundBid': {
      const inc = state.eventPhase.incursion;
      const amt = inc.bids[fid] || 0;
      if (amt > 0) {
        state.authority[fid] += amt;
        state.log.push({ round: state.round, event: 'incursionBidRefunded', faction: fid, amount: amt });
      }
      return true;
    }

    case 'immediateReattack': {
      const inc = state.eventPhase.incursion;
      inc.reattack = { strength: effect.strength,
        excluded: effect.excludeHighest ? [inc.highest] : [] };
      state.log.push({ round: state.round, event: 'incursionNothing', faction: fid, reason: 'reattackExempt' });
      return true;
    }

    default:
      throw new Error(`Unhandled incursion effect ${effect.type}`);
  }
}

/** Downgrade the given cavalry, spilling into destruction when the infantry pool runs dry. */
function downgradeCavalryUnits(state, fid, picks) {
  const changes = [];
  for (const { region } of picks) {
    const room = SETUP.unitPool.infantry - inPlay(state, fid, 'infantry');
    const arr = state.unitsByRegion[region] || [];
    const u = arr.find(x => x.faction === fid && x.type === 'cavalry');
    if (!u) throw new Error(`No cavalry of ${fid} at ${region}`);
    if (room > 0) {
      u.type = 'infantry';
      changes.push({ region, destroyed: false });
    } else {
      arr.splice(arr.indexOf(u), 1); // no infantry left in the pool (card text)
      changes.push({ region, destroyed: true });
    }
  }
  state.log.push({ round: state.round, event: 'incursionUnitsDowngraded', faction: fid, changes });
}

// ---------- query handlers (dispatched from engine.js) ----------

/** picks: [{ region, type }] — destroy / downgrade / upgrade unit selections. */
export function incursionUnits(state, fid, picks = []) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'incursionUnits' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending incursion unit choice`);
  const q = state.pendingQueries[qi];

  if (q.optional ? picks.length > q.count : picks.length !== q.count) {
    throw new Error(q.optional ? `Choose up to ${q.count} units` : `Choose exactly ${q.count} unit(s)`);
  }
  if (q.unitType && picks.some(p => p.type !== q.unitType)) {
    throw new Error(`Only ${q.unitType} may be chosen here`);
  }
  if (q.constraint === 'singleRegion') {
    const rids = [...new Set(picks.map(p => p.region))];
    if (rids.length > 1) throw new Error('All losses must come from ONE fortified area (card text)');
    if (rids.length && !q.regions.includes(rids[0])) {
      throw new Error(`Losses must come from one of: ${q.regions.join(', ')}`);
    }
  }
  // Validate multiset availability before touching state.
  const need = {};
  for (const p of picks) need[`${p.region}|${p.type}`] = (need[`${p.region}|${p.type}`] || 0) + 1;
  for (const [key, n] of Object.entries(need)) {
    const [rid, t] = key.split('|');
    const have = (state.unitsByRegion[rid] || []).filter(u => u.faction === fid && u.type === t).length;
    if (have < n) throw new Error(`Only ${have} ${t} of ${fid} at ${rid}`);
  }

  state.pendingQueries.splice(qi, 1);

  if (q.purpose === 'destroy') {
    for (const p of picks) removeUnit(state, fid, p.region, p.type);
    state.log.push({ round: state.round, event: 'incursionUnitsDestroyed', faction: fid, units: picks });
  } else if (q.purpose === 'downgrade') {
    downgradeCavalryUnits(state, fid, picks);
  } else if (q.purpose === 'upgrade') {
    for (const p of picks) {
      const u = (state.unitsByRegion[p.region] || []).find(x => x.faction === fid && x.type === 'infantry');
      u.type = 'cavalry';
    }
    state.log.push({ round: state.round, event: 'incursionUnitsUpgraded', faction: fid,
      regions: picks.map(p => p.region) });
  } else {
    throw new Error(`Unknown incursion unit purpose ${q.purpose}`);
  }
  advanceIncursionQueue(state);
}

export function incursionTrack(state, fid, track) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'incursionTrack' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending incursion track choice`);
  const q = state.pendingQueries[qi];
  if (!q.options.includes(track)) throw new Error(`Choose one of [${q.options.join(', ')}]`);
  state.pendingQueries.splice(qi, 1);

  if (q.mode === 'toBottom') trackToBottom(state, fid, track);
  else if (q.mode === 'toTop') trackToTop(state, fid, track);
  else if (q.mode === 'shiftDown') trackShiftDown(state, fid, track, q.amount);
  else throw new Error(`Unknown incursion track mode ${q.mode}`);
  advanceIncursionQueue(state);
}

export function incursionCard(state, fid, cardId) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'incursionCard' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending incursion card choice`);
  const q = state.pendingQueries[qi];
  if (!q.options.includes(cardId)) throw new Error(`${cardId} is not among [${q.options.join(', ')}]`);
  state.pendingQueries.splice(qi, 1);

  if (q.purpose === 'retrieve') {
    state.leaderDiscards[fid] = state.leaderDiscards[fid].filter(x => x !== cardId);
    state.leaderHands[fid].push(cardId);
    state.log.push({ round: state.round, event: 'incursionCardRetrieved', faction: fid, card: cardId });
  } else if (q.purpose === 'discard') {
    state.leaderHands[fid] = state.leaderHands[fid].filter(x => x !== cardId);
    state.leaderDiscards[fid].push(cardId);
    state.log.push({ round: state.round, event: 'incursionCardsDiscarded', faction: fid, cards: [cardId] });
  } else {
    throw new Error(`Unknown incursion card purpose ${q.purpose}`);
  }
  advanceIncursionQueue(state);
}

export function incursionOption(state, fid, index) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'incursionOption' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending incursion choice`);
  const q = state.pendingQueries[qi];
  if (!Number.isInteger(index) || index < 0 || index >= q.options.length) {
    throw new Error(`Choose an option index 0..${q.options.length - 1}`);
  }
  state.pendingQueries.splice(qi, 1);
  state.log.push({ round: state.round, event: 'incursionOptionChosen', faction: fid, option: q.options[index].type });

  const done = applyIncursionEffect(state, fid, q.options[index]);
  if (done) advanceIncursionQueue(state);
  // else: the sub-effect opened its own query; its handler resumes the queue.
}

export function incursionMusterSite(state, fid, rid) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'incursionMusterSite' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending muster-site choice`);
  const q = state.pendingQueries[qi];
  const site = q.options.find(s => s.region === rid);
  if (!site) throw new Error(`Choose one of: ${q.options.map(s => s.region).join(', ')}`);
  state.pendingQueries.splice(qi, 1);
  state.pendingQueries.push({ type: 'muster', faction: fid, region: site.region,
    points: site.points, source: 'incursion' });
  state.log.push({ round: state.round, event: 'incursionMusterAwarded', faction: fid, region: site.region });
  // The muster handler resumes the queue on commit.
}

/**
 * Pop the settled effect and keep draining. Exported: the incursion-sourced
 * muster and supply-reconciliation handlers in eventPhase.js resume through
 * here once their queries fully settle.
 */
export function advanceIncursionQueue(state) {
  const inc = state.eventPhase?.incursion;
  if (inc?.effectQueue?.length) inc.effectQueue.shift();
  progressIncursion(state);
}
