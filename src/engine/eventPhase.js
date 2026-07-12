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

import { region, regionProps, controllerOf } from './state.js';
import { EVENT_DECK_SETS, INVADER_SETS } from '../data/registry.js';
import { PORTS, REGIONS as REGION_LIST } from '../data/map.js';
import { shuffle } from './rng.js';
import { beginPlanning } from './planning.js';
import { SETUP } from '../data/setup.js';

const BLOCKING = ['eventChoice', 'reconcileSupply'];

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
    // Reaching 12 triggers an immediate incursion (Rules p.22) — M2.d.
    state.log.push({ round: state.round, event: 'incursionPending', trigger: 'threatMax', note: 'M2.d' });
  }
}

export function progressEventPhase(state) {
  const ep = state.eventPhase;
  if (!ep) return;
  if (state.pendingQueries.some(q => BLOCKING.includes(q.type))) return;

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
      state.log.push({ round: state.round, event: 'musteringPending', card: cardId, note: 'M2.b' });
      return true;
    case 'bidTracks':
      state.log.push({ round: state.round, event: 'bidPending', card: cardId, note: 'M2.c' });
      return true;
    case 'incursion':
      state.log.push({ round: state.round, event: 'incursionPending', trigger: 'card', card: cardId, note: 'M2.d' });
      return true;
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

function supplyViolations(state, fid) {
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

  const done = resolveSupplyUpdate(state, null);
  if (done) {
    state.eventPhase.step += 1;
    progressEventPhase(state);
  }
}
