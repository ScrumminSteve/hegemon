// HEGEMON engine — Event Phase, M2.a (Rules p.9–10, p.22; FAQ v2.0).
//
// Each round from round 2: reveal one card per deck in scenario order
// (reshuffle-class cards resolve immediately on draw, per FAQ), advance the
// threat token for each revealed invader icon, then resolve the revealed
// cards in deck order. Card queries pause the pipeline exactly like combat.
//
// M2.a implements: supplyUpdate (with owner-chosen army reconciliation),
// collectAuthority (incl. the harbor trade bonus), banOrder restrictions,
// holderChoice, nothing, reshuffle, and threat advancement.
// Logged-but-inert until their own drops: muster (M2.b), bidTracks (M2.c),
// incursion (M2.d).

import { region, regionProps, controllerOf, adjacency } from './state.js';
import { EVENT_DECK_SETS, INVADER_SETS } from '../data/registry.js';
import { PORTS, REGIONS as REGION_LIST } from '../data/map.js';
const ADJ_M2B = adjacency();
import { shuffle } from './rng.js';
import { beginPlanning } from './planning.js';
import { SETUP } from '../data/setup.js';
import { advanceAction } from './actionPhase.js'; // tolerated ESM cycle (as combat↔actionPhase)
import { beginBidding, bid as sealBid, bidTieBreak as breakTie, biddingActive } from './bidding.js';
import { beginIncursion, advanceIncursionQueue } from './invaders.js'; // tolerated ESM cycle

const BLOCKING = ['eventChoice', 'reconcileSupply', 'muster', 'bid', 'bidTieBreak',
  'invaderBid', 'invaderTieBreak', 'incursionUnits', 'incursionTrack',
  'incursionCard', 'incursionOption', 'incursionMusterSite'];

function cardDef(state, id) {
  for (const cards of Object.values(EVENT_DECK_SETS[state.scenario.eventDeckSet || 'base'])) {
    const c = cards.find(x => x.id === id);
    if (c) return c;
  }
  throw new Error(`Unknown event card ${id}`);
}

// ---------- phase driver ----------

export function beginEventPhase(state) {
  state.phase = 'event';
  state.eventPhase = { revealed: [], step: 0 };
  state.log.push({ round: state.round, event: 'eventPhaseBegan' });

  // Step 1–3: reveal one card per deck; reshuffle-class cards resolve
  // immediately upon draw and are replaced (FAQ v2.0), their icons counting.
  for (const deckId of state.scenario.eventDecks) {
    const cardId = drawEventCard(state, deckId);
    state.eventPhase.revealed.push({ deck: deckId, card: cardId });
    const def = cardDef(state, cardId);
    state.log.push({ round: state.round, event: 'eventCardRevealed', deck: deckId, card: cardId });
    if (def.threatIcon) advanceThreat(state, cardId);
  }
  progressEventPhase(state);
}

function drawEventCard(state, deckId) {
  const deck = state.eventDecks[deckId];
  for (;;) {
    if (deck.draw.length === 0) reshuffleDeck(state, deckId, null);
    const cardId = deck.draw.shift();
    const def = cardDef(state, cardId);
    if (def.effect.type !== 'reshuffle') {
      deck.discard.push(cardId);
      return cardId;
    }
    // Reshuffle-class: resolves immediately on draw (FAQ v2.0); its icon
    // (none on the base cards) would count here via the caller's loop.
    if (def.threatIcon) advanceThreat(state, cardId);
    reshuffleDeck(state, deckId, cardId);
  }
}

function reshuffleDeck(state, deckId, includeCardId) {
  const deck = state.eventDecks[deckId];
  const pool = [...deck.draw, ...deck.discard]; // deck AND discard (FAQ errata)
  if (includeCardId) pool.push(includeCardId);
  const r = shuffle(state.seed, pool);
  state.seed = r.seed;
  deck.draw = r.value;
  deck.discard = [];
  state.log.push({ round: state.round, event: 'eventDeckReshuffled', deck: deckId });
}

export function advanceThreat(state, by) {
  if (state.threat >= 12) return;
  state.threat = Math.min(12, state.threat + 1);
  state.log.push({ round: state.round, event: 'threatAdvanced', threat: state.threat, card: by });
  if (state.threat >= 12) {
    // Reaching 12 triggers an immediate incursion, resolved BEFORE any of the
    // revealed cards' effects (Rules p.22). progressEventPhase honors the flag
    // ahead of its card loop.
    state.eventPhase.threatMaxIncursion = true;
  }
}

export function progressEventPhase(state) {
  const ep = state.eventPhase;
  if (!ep) return;
  if (ep.incursion) return; // resumes via the incursion pipeline
  if (state.pendingQueries.some(q => BLOCKING.includes(q.type))) return;

  // A threat-max incursion interrupts BEFORE any card effect (Rules p.22).
  if (ep.threatMaxIncursion) {
    delete ep.threatMaxIncursion;
    beginIncursion(state, { trigger: 'threatMax', fromCardStep: false });
    return;
  }

  while (ep.step < ep.revealed.length) {
    const { deck, card } = ep.revealed[ep.step];
    if (!ep.began) { /* marker unused; kept simple */ }
    const done = resolveEventCard(state, deck, card);
    if (!done) return; // a query is pending; resume via its handler
    ep.step += 1;
  }
  delete state.eventPhase;
  beginPlanning(state);
}

// Returns true when fully resolved, false when paused on a query.
function resolveEventCard(state, deckId, cardId, chosen) {
  const def = cardDef(state, cardId);
  const effect = chosen || def.effect;
  switch (effect.type) {
    case 'nothing':
      state.log.push({ round: state.round, event: 'eventNothing', card: cardId });
      return true;
    case 'banOrder':
      state.roundFlags.bannedOrders = [...(state.roundFlags.bannedOrders || []), effect.order];
      state.log.push({ round: state.round, event: 'ordersBanned', order: effect.order, card: cardId });
      return true;
    case 'collectAuthority':
      return resolveCollectAuthority(state, cardId);
    case 'supplyUpdate':
      return resolveSupplyUpdate(state, cardId);
    case 'holderChoice': {
      const holder = state.tokens[effect.token];
      state.pendingQueries.push({ type: 'eventChoice', faction: holder, card: cardId,
        deck: deckId, options: effect.options });
      return false;
    }
    case 'muster':
      return resolveMusterCard(state, cardId);
    case 'bidTracks':
      return beginBidding(state, cardId);
    case 'incursion':
      // Invaders attack at the current threat strength (Rules p.22).
      return beginIncursion(state, { trigger: 'card', fromCardStep: true });
    default:
      state.log.push({ round: state.round, event: 'eventUnhandled', card: cardId });
      return true;
  }
}

export function eventChoice(state, fid, option) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'eventChoice' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending event choice`);
  const q = state.pendingQueries[qi];
  if (!q.options.includes(option)) throw new Error(`${option} is not offered (options: ${q.options.join(', ')})`);
  state.pendingQueries.splice(qi, 1);
  state.log.push({ round: state.round, event: 'eventChoiceMade', faction: fid, card: q.card, option });

  const effect = option.startsWith('banOrder:')
    ? { type: 'banOrder', order: option.split(':')[1] }
    : { type: option };
  const done = resolveEventCard(state, q.deck, q.card, effect);
  if (done) {
    state.eventPhase.step += 1;
    progressEventPhase(state);
  }
}

// ---------- Clash of Kings plumbing (module: bidding.js) ----------

export function bid(state, fid, track, amount) {
  sealBid(state, fid, track, amount);
  if (!biddingActive(state)) progressEventPhase(state);
}

export function bidTieBreak(state, fid, track, order) {
  breakTie(state, fid, track, order);
  if (!biddingActive(state)) progressEventPhase(state);
}

// ---------- Mustering (Rules p.9, p.25; FAQ v2.0) ----------

export const MUSTER_COSTS = { infantry: 1, warship: 1, cavalry: 2, siege_engine: 2, upgrade: 1 };

export function fortifiedControlled(state, fid) {
  const out = [];
  for (const r of REGION_LIST) {
    if (r.kind !== 'land') continue;
    const pts = regionProps(state, r.id).muster;
    if (pts > 0 && controllerOf(state, r.id) === fid) out.push({ region: r.id, points: pts });
  }
  return out.sort((a, b) => a.region < b.region ? -1 : 1);
}

function resolveMusterCard(state, cardId) {
  if (!state.eventPhase.musterQueue) {
    state.eventPhase.musterQueue = [];
    for (const fid of state.tracks.initiative) {
      for (const site of fortifiedControlled(state, fid)) {
        state.eventPhase.musterQueue.push({ faction: fid, ...site });
      }
    }
    state.log.push({ round: state.round, event: 'musteringBegan', card: cardId, sites: state.eventPhase.musterQueue.length });
  }
  const next = state.eventPhase.musterQueue.shift();
  if (!next) {
    delete state.eventPhase.musterQueue;
    return true;
  }
  state.pendingQueries.push({ type: 'muster', faction: next.faction, region: next.region, points: next.points });
  return false;
}

export function inPlay(state, fid, type) {
  let n = 0;
  for (const units of Object.values(state.unitsByRegion)) {
    for (const u of units) if (u.faction === fid && u.type === type) n++;
  }
  return n;
}

/**
 * Apply one area's muster. builds: array of
 *   { type: 'infantry'|'cavalry'|'siege_engine', to: musterRegion }
 *   { type: 'warship', to: portId | adjacentSeaId }
 *   { type: 'upgrade', at: musterRegion }   // one infantry → cavalry
 * An empty array passes. Costs: infantry/warship 1, cavalry/siege 2, upgrade 1.
 */
export function muster(state, fid, rid, builds = []) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'muster' && q.faction === fid && q.region === rid);
  if (qi === -1) throw new Error(`${fid} has no pending muster at ${rid}`);
  const q = state.pendingQueries[qi];

  const cost = builds.reduce((a, b) => a + (MUSTER_COSTS[b.type] ?? NaN), 0);
  if (Number.isNaN(cost)) throw new Error('Unknown build type in muster');
  if (cost > q.points) throw new Error(`Muster costs ${cost}, but ${rid} provides ${q.points} points (Rules p.9)`);

  // Validate destinations before touching state.
  const port = PORTS.find(pp => pp.landId === rid);
  const seas = [...(ADJ_M2B[rid] || [])].filter(x => region(x).kind === 'maritime');
  const pooled = { infantry: 0, cavalry: 0, warship: 0, siege_engine: 0 };
  let portAdds = 0;
  for (const b of builds) {
    if (b.type === 'upgrade') {
      const target = b.to || 'cavalry'; // footman → knight OR siege engine (Rules p.9)
      if (target !== 'cavalry' && target !== 'siege_engine') throw new Error(`Cannot upgrade infantry to ${target}`);
      const inf = (state.unitsByRegion[rid] || []).filter(u => u.faction === fid && u.type === 'infantry' && !u.routed);
      const upgrades = builds.filter(x => x.type === 'upgrade').length;
      if (inf.length < upgrades) throw new Error(`Not enough unrouted infantry at ${rid} to upgrade`);
      pooled[target] += 1; pooled.infantry -= 1;
      continue;
    }
    if (b.type === 'warship') {
      const toPort = port && b.to === port.id;
      const toSea = seas.includes(b.to);
      if (!toPort && !toSea) throw new Error(`Warships muster into ${rid}'s harbor or an adjacent sea (Rules p.25)`);
      if (toPort) {
        const occ = state.unitsByRegion[port.id] || [];
        if (occ.some(u => u.faction !== fid)) throw new Error(`${port.id} is not yours to muster into`);
        portAdds += 1;
        if (occ.length + portAdds > 3) throw new Error(`${port.id} holds at most 3 ships (Rules p.25)`);
        // NOTE: mustering into the harbor is legal even under an enemy blockade
        // of the connected sea — the defining power of harbors (Rules p.25).
      } else {
        const units = state.unitsByRegion[b.to] || [];
        if (units.some(u => u.faction !== fid)) throw new Error(`${b.to} is enemy-held; warships must muster into the harbor instead (Rules p.25)`);
      }
      pooled.warship += 1;
      continue;
    }
    if (b.to !== rid) throw new Error(`Land units muster in ${rid} itself (Rules p.9)`);
    pooled[b.type] += 1;
  }
  for (const [t, add] of Object.entries(pooled)) {
    if (add > 0 && inPlay(state, fid, t) + add > SETUP.unitPool[t]) {
      throw new Error(`Unit pool exhausted for ${t} (${SETUP.unitPool[t]} total)`);
    }
  }

  // Apply.
  state.pendingQueries.splice(qi, 1);
  const applied = [];
  for (const b of builds) {
    if (b.type === 'upgrade') {
      const u = (state.unitsByRegion[rid] || []).find(x => x.faction === fid && x.type === 'infantry' && !x.routed);
      u.type = b.to || 'cavalry';
      applied.push({ upgrade: rid, to: u.type });
    } else {
      state.unitsByRegion[b.to] = state.unitsByRegion[b.to] || [];
      state.unitsByRegion[b.to].push({ faction: fid, type: b.type, routed: false });
      applied.push({ [b.type]: b.to });
    }
  }

  // Supply is a hard ceiling during mustering (Rules p.9).
  const bad = supplyViolations(state, fid);
  if (bad.length) {
    // Roll back: rebuild is simpler than partial undo — reject atomically.
    for (const b of builds.slice().reverse()) {
      if (b.type === 'upgrade') {
        const t = b.to || 'cavalry';
        const u = (state.unitsByRegion[rid] || []).find(x => x.faction === fid && x.type === t && !x.routed);
        if (u) u.type = 'infantry';
      } else {
        const arr = state.unitsByRegion[b.to] || [];
        const i = arr.findIndex(x => x.faction === fid && x.type === b.type);
        if (i !== -1) arr.splice(i, 1);
      }
    }
    state.pendingQueries.splice(qi, 0, q);
    throw new Error(`Muster would break supply at ${bad.join(', ')} (Rules p.9)`);
  }

  state.log.push({ round: state.round, event: 'mustered', faction: fid, region: rid, builds: applied, spent: cost });

  if (q.source === 'rally') {
    advanceAction(state); // starred-rally muster hands back to the action cycler
    return;
  }
  if (q.source === 'incursion') {
    advanceIncursionQueue(state); // invader-card muster hands back to the incursion queue
    return;
  }
  const done = resolveMusterCard(state, null);
  if (done) {
    state.eventPhase.step += 1;
    progressEventPhase(state);
  }
}

// ---------- Authority collection (Rules p.16 + p.25 harbor trade) ----------

function resolveCollectAuthority(state, cardId) {
  for (const fid of state.tracks.initiative) {
    let gain = 0;
    for (const r of REGION_LIST) {
      if (r.kind !== 'land') continue;
      if (controllerOf(state, r.id) === fid) gain += regionProps(state, r.id).coin;
    }
    for (const p of PORTS) {
      const mine = (state.unitsByRegion[p.id] || []).some(u => u.faction === fid && u.type === 'warship');
      if (!mine || controllerOf(state, p.landId) !== fid) continue;
      const enemySea = (state.unitsByRegion[p.seaId] || []).some(u => u.faction !== fid && u.type === 'warship');
      if (!enemySea) gain += 1; // harbor trade (Rules p.25)
    }
    if (gain > 0) {
      state.authority[fid] += gain;
      state.log.push({ round: state.round, event: 'authorityCollected', faction: fid, amount: gain, card: cardId });
    }
  }
  return true;
}

// ---------- Supply update + owner-chosen reconciliation (Rules p.10) ----------

function boardSupply(state, fid) {
  let n = 0;
  for (const r of REGION_LIST) {
    if (r.kind === 'land' && controllerOf(state, r.id) === fid) n += regionProps(state, r.id).supply;
  }
  return Math.min(6, n);
}

export function supplyViolations(state, fid) {
  const limits = SETUP.supplyLimits[state.supply[fid]].slice().sort((a, b) => b - a);
  const armies = [];
  for (const [rid, units] of Object.entries(state.unitsByRegion)) {
    const n = (units || []).filter(u => u.faction === fid).length;
    if (n >= 2) armies.push({ region: rid, size: n });
  }
  armies.sort((a, b) => b.size - a.size);
  const bad = [];
  armies.forEach((army, i) => {
    const cap = limits[i] ?? 1; // armies beyond the table must shrink below 2
    if (army.size > cap) bad.push(army.region);
  });
  return bad;
}

function resolveSupplyUpdate(state, cardId) {
  if (!state.eventPhase.supplyAdjusted) {
    state.eventPhase.supplyAdjusted = true;
    for (const fid of state.tracks.initiative) {
      const to = boardSupply(state, fid);
      if (to !== state.supply[fid]) {
        state.log.push({ round: state.round, event: 'supplyAdjusted', faction: fid, from: state.supply[fid], to, card: cardId });
        state.supply[fid] = to;
      }
    }
  }
  // Reconciliation: in initiative order, each violating faction chooses its
  // own losses, one unit at a time (Rules p.10: the player reconciles).
  for (const fid of state.tracks.initiative) {
    const bad = supplyViolations(state, fid);
    if (bad.length) {
      state.pendingQueries.push({ type: 'reconcileSupply', faction: fid, regions: bad.sort() });
      return false;
    }
  }
  delete state.eventPhase.supplyAdjusted;
  return true;
}

export function reconcileSupply(state, fid, rid, unitType) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'reconcileSupply' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending supply reconciliation`);
  const q = state.pendingQueries[qi];
  if (!q.regions.includes(rid)) throw new Error(`${rid} is not an oversized army (options: ${q.regions.join(', ')})`);
  const units = (state.unitsByRegion[rid] || []).filter(u => u.faction === fid);
  const u = units.find(x => x.type === unitType);
  if (!u) throw new Error(`No ${unitType} of ${fid} at ${rid}`);
  state.pendingQueries.splice(qi, 1);
  state.unitsByRegion[rid] = (state.unitsByRegion[rid] || []).filter(x => x !== u);
  state.log.push({ round: state.round, event: 'destroyedForSupply', faction: fid, region: rid, unit: unitType, chosen: true });

  if (q.source === 'incursion') {
    // Invader-card supply loss: reconcile this faction alone, then resume
    // the incursion's effect queue.
    const bad = supplyViolations(state, fid);
    if (bad.length) {
      state.pendingQueries.push({ type: 'reconcileSupply', faction: fid, regions: bad.sort(), source: 'incursion' });
    } else {
      advanceIncursionQueue(state);
    }
    return;
  }

  const done = resolveSupplyUpdate(state, null);
  if (done) {
    state.eventPhase.step += 1;
    progressEventPhase(state);
  }
}
