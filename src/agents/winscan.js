// ---------------------------------------------------------------------------
// THE WIN-SCAN (m3e56) — mate-in-one detection. Owner diagnosis, Aug 25 2026:
// bot-Percy sat on a ONE-ORDER WIN for three rounds (five seats, a two-unit
// army at L30, Exeter AND Salisbury open behind chained friendly seas) and
// never saw it — because placement scores locally, resolution menus never
// enumerate split-marches, and NOTHING anywhere asks "does a winning
// combination exist right now?"
//
// This module asks exactly that question, deterministically, above the
// scoring machinery. Phase one: GUARANTEED closes only — open, ungarrisoned
// seats reachable by adjacency or chained warship transport. No weights, no
// tuning, no sampling: mate-in-one is played because it is mate-in-one.
// Contested closes (risk appetite), the two-round setup, and the bell-mode
// standings closer are phase two, pending the owner interview.
// ---------------------------------------------------------------------------

import { seatsControlled, controllerOf } from '../engine/state.js';
import { REGIONS, buildAdjacency } from '../data/map.js';

const ADJ = buildAdjacency();
const adj = rid => [...(ADJ[rid] ?? [])];
const REGION = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const kind = rid => REGION[rid]?.kind;

const VICTORY_TARGET = 7;

/** Open seat = fort/citadel land region with no units, no controller, and
    NO standing neutral force (Rules p.26/28: a march must overmatch the
    garrison — a one-unit walk-in cannot, so phase one treats garrisoned
    neutrals as closed doors; overmatching them is a phase-two contested
    close). This guard is what keeps every forced action engine-legal. */
function openSeats(state) {
  const out = [];
  for (const r of REGIONS) {
    if (r.kind !== 'land' || !r.muster) continue;
    if ((state.unitsByRegion[r.id] || []).length) continue;
    if (controllerOf(state, r.id)) continue;
    if (state.neutrals?.[r.id]?.strength > 0) continue;
    out.push(r.id);
  }
  return out;
}

/** Landing zones for an army at rid: adjacency + chained friendly-warship
    seas (the engine's own transport rule, mirrored — same math that found
    the L30 double-landing). */
function reachFrom(state, rid, fid) {
  const hasShips = sea => (state.unitsByRegion[sea] || [])
    .some(u => u.faction === fid && u.type === 'warship' && !u.routed);
  const zones = new Set(adj(rid).filter(n => kind(n) !== 'maritime'));
  const seen = new Set();
  for (const sea0 of adj(rid)) {
    if (kind(sea0) !== 'maritime' || !hasShips(sea0) || seen.has(sea0)) continue;
    const comp = [sea0]; seen.add(sea0);
    for (let i = 0; i < comp.length; i++) for (const n of adj(comp[i])) {
      if (!seen.has(n) && kind(n) === 'maritime' && hasShips(n)) { seen.add(n); comp.push(n); }
    }
    for (const sea of comp) for (const n of adj(sea)) {
      if (n !== rid && kind(n) !== 'maritime') zones.add(n);
    }
  }
  return zones;
}

/** Would marching EVERY land unit out of rid cost fid a seat? (The Caersws
    rule, encoded: a marker or home-reversion keeps it; bare unit-control
    does not.) */
function seatLostIfEmptied(state, rid, fid) {
  const r = REGION[rid];
  if (!r || r.kind !== 'land' || !r.muster) return false;
  if (controllerOf(state, rid) !== fid) return false;
  if (state.controlMarkers?.[rid] === fid) return false;
  if (r.home === fid) return false;
  return true; // control rides on the departing units alone
}

/**
 * The one question that matters: can fid reach VICTORY_TARGET seats THIS
 * round with guaranteed takes only?
 * Returns null, or a plan:
 *   { origins: [{ region, moves: [{ to }] , holdOne: bool }], takes: [rids] }
 * Greedy assignment with the largest-reach armies last kept flexible;
 * table sizes are tiny (≤ a handful of armies, ≤ ~6 open seats).
 */
export function findWinNow(state, fid, target = VICTORY_TARGET) {
  const have = seatsControlled(state, fid);
  const need = target - have;
  if (need <= 0) return null; // already won — nothing to plan
  const open = openSeats(state);
  if (open.length < need) return null;

  // armies: land units per controlled-by-fid stack
  const armies = [];
  for (const [rid, units] of Object.entries(state.unitsByRegion)) {
    if (kind(rid) !== 'land') continue;
    const mine = units.filter(u => u.faction === fid && u.type !== 'warship' && u.type !== 'siege_engine' && !u.routed);
    if (!mine.length) continue;
    const reach = reachFrom(state, rid, fid);
    const targets = open.filter(t => reach.has(t));
    if (targets.length) armies.push({ rid, count: mine.length, targets, types: mine.map(u => u.type) });
  }
  if (!armies.length) return null;

  // Try assignments: seats covered must be DISTINCT; an army covers up to
  // `count` of its own targets. If emptying the origin would forfeit ITS
  // seat (the Caersws rule), two honest outs exist: PAY the leave-control
  // marker (1 authority, Rules p.24 — the move bot-Percy owed Caersws) and
  // send everyone, or hold one unit home. The solver tries the marker
  // first while the purse lasts.
  armies.sort((a, b) => a.targets.length - b.targets.length); // constrained first
  const purse = { authority: state.authority?.[fid] ?? 0 };
  const chosen = new Map(); // seat -> army
  function assign(i) {
    if (chosen.size >= need) return true;
    if (i >= armies.length) return false;
    const a = armies[i];
    const lossIfEmptied = seatLostIfEmptied(state, a.rid, fid);
    const free = a.targets.filter(t => !chosen.has(t));
    const options = [];
    if (!lossIfEmptied) options.push({ maxSend: a.count, marker: false });
    else {
      if (purse.authority >= 1) options.push({ maxSend: a.count, marker: true });
      options.push({ maxSend: Math.max(0, a.count - 1), marker: false });
    }
    for (const opt of options) {
      if (opt.marker) purse.authority -= 1;
      const sendable = Math.min(opt.maxSend, free.length);
      for (let k = sendable; k >= 0; k--) {
        // sending zero never needs a marker — skip the paid variant of k=0
        if (opt.marker && k === 0) continue;
        const picked = free.slice(0, k);
        for (const t of picked) chosen.set(t, a);
        if (assign(i + 1)) {
          if (k > 0) { a._send = picked; a._marker = opt.marker && k === a.count; }
          if (opt.marker && !(k === a.count)) purse.authority += 1; // marker only needed when truly emptied
          return true;
        }
        for (const t of picked) chosen.delete(t);
      }
      if (opt.marker) purse.authority += 1;
    }
    return false;
  }
  if (!assign(0)) return null;

  const origins = armies.filter(a => a._send?.length).map(a => ({
    region: a.rid,
    moves: a._send.map(to => ({ to })),
    leaveControl: !!a._marker,
    types: a.types,
  }));
  const takes = [...chosen.keys()];
  return { origins, takes, have, need };
}

/** Build the engine action for one origin of a win plan: a split march,
    one land unit per gangplank, favoring cheap infantry first. */
export function winMarchAction(plan, region, fid) {
  const o = plan.origins.find(x => x.region === region);
  if (!o) return null;
  const pool = [...o.types].sort((a, b) => (a === 'infantry' ? -1 : 1) - (b === 'infantry' ? -1 : 1));
  const moves = o.moves.map(m => {
    const t = pool.shift() ?? 'infantry';
    return { to: m.to, units: { [t]: 1 } };
  });
  return { faction: fid, type: 'resolveMarch', region, moves, leaveControl: !!o.leaveControl };
}
