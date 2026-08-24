// ---------------------------------------------------------------------------
// PACKAGE C · SESSION ONE (m3e48) — THE POSITION EVALUATOR
//
// The glance the owner never needed. Interview Q10, asked how he sizes up
// the table mid-game: "Simple answer is I don't — there has never been a
// situation where an opponent has been threatening enough that I've really
// been paying attention." The bots cannot inherit a judgment that was never
// forced into existence, so this file builds it from the board instead:
// interpretable weighted features, every number auditable, no black box.
//
// Design constraints (pre-registered before code):
//   - Must flag F2 (the owner) as the table's top threat by round 3 of the
//     five-round Lancaster blitz (corpus/inbox/episode-lancaster-lots-of-
//     territories-r5.json) — an evaluator that cannot see THAT coming is
//     not worth shipping.
//   - Must rank eventual winners top-2 by mid-game in the majority of the
//     banked corpus (measured by tools/credit.mjs, reported per episode).
//   - Monotone sanity: an extra seat never lowers a score, all else equal.
//
// Depends only on state.js + map.js — heuristic.js imports US (for the
// leader-punch gate), never the reverse.
// ---------------------------------------------------------------------------

import { seatsControlled, landAreasControlled, controllerOf } from '../engine/state.js';
import { REGIONS, buildAdjacency } from '../data/map.js';

const ADJ = buildAdjacency();

/** EVAL_V0 — hand-set feature weights, the evaluator's first vector.
    Deliberately coarse; tuning these against mined credit curves is the
    designated NEXT surface once the miner has curves to fit. */
export const EVAL_V0 = Object.freeze({
  eSeat: 10,        // the victory metric itself — dominant by design
  eCitadel: 2.5,    // a muster-2 seat is an engine, not a seat (owner, Q2)
  eLand: 1.2,       // footprint breadth (also the first standings tiebreak)
  eArmy: 1.0,       // fielded strength, casualty-value weighted
  eCash: 0.8,       // authority on hand — purchasing power at the auction
  eIncome: 1.5,     // coin icons controlled — the SNOWBALL (owner beat the
                    //   V4 auction not by prediction but by being richer)
  eSupply: 1.4,     // supply headroom bounds every future army
  eTracks: 0.9,     // influence positions, top-weighted
  eThreat: 1.1,     // enemy strength standing next to my seats (subtracts)
});

/** EVAL_V1 (m3e49) — V0 plus REACH: potential seats within one march,
    INCLUDING ship transport over connected friendly-warship sea chains
    (the same landing rule the bots use). Spec'd by the full-corpus harvest:
    Tudor went 0-for-4 against the V0 bar because a seat-heavy material
    glance cannot see an island house's parked strike force — reach is the
    feature that lights the fleet up rounds before it sails. V0 stands
    frozen above, lineage discipline as with the bot vectors. */
export const EVAL_V1 = Object.freeze({
  ...EVAL_V0,
  eReach: 3.0,      // per unheld seat we could take next round with the
                    //   stronger force — conquest potential, not conquest
});

const REGION_BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const regionKind = rid => REGION_BY_ID[rid]?.kind;

const UNIT_VAL = { infantry: 1, cavalry: 2, warship: 1.5, siege_engine: 2.5 };

function strengthIn(state, rid, fid) {
  let v = 0;
  for (const u of state.unitsByRegion[rid] || []) {
    if (u.faction === fid && !u.routed) v += UNIT_VAL[u.type] ?? 1;
  }
  return v;
}

/** Every feature, raw and unweighted — the audit surface. */
export function positionFeatures(state, fid) {
  let citadels = 0, income = 0, army = 0, threat = 0;
  for (const r of REGIONS) {
    const mine = controllerOf(state, r.id) === fid;
    if (mine && r.kind === 'land') {
      if (r.muster === 2) citadels++;
      income += r.coin || 0;
    }
    for (const u of state.unitsByRegion[r.id] || []) {
      if (u.faction === fid && !u.routed) army += UNIT_VAL[u.type] ?? 1;
    }
    // threat: enemy strength adjacent to my SEATS (the holdings that decide games)
    if (mine && r.kind === 'land' && r.muster > 0) {
      for (const n of ADJ[r.id] || []) {
        for (const f2 of state.factions) {
          if (f2 !== fid) threat += strengthIn(state, n, f2);
        }
      }
    }
  }
  // tracks: top position worth 1, bottom 0, summed over the three tracks
  let tracks = 0;
  for (const t of ['initiative', 'prowess', 'command']) {
    const order = state.tracks?.[t] || [];
    if (order.length > 1) tracks += (order.length - 1 - Math.max(0, order.indexOf(fid))) / (order.length - 1);
  }
  // reach: unheld SEAT regions this faction could enter next round with
  // strictly greater strength — adjacency plus warship transport chains.
  const landing = new Set();
  const hasShips = sea => (state.unitsByRegion[sea] || []).some(u => u.faction === fid && u.type === 'warship' && !u.routed);
  for (const rid of Object.keys(state.unitsByRegion)) {
    const myStr = strengthIn(state, rid, fid);
    if (!myStr || REGIONS.find(r => r.id === rid)?.kind === 'maritime') continue;
    for (const n of ADJ[rid] || []) landing.add(`${n}|${rid}`);
    const seen = new Set();
    for (const sea0 of ADJ[rid] || []) {
      if (regionKind(sea0) !== 'maritime' || !hasShips(sea0) || seen.has(sea0)) continue;
      const comp = [sea0]; seen.add(sea0);
      for (let i = 0; i < comp.length; i++) for (const n of ADJ[comp[i]] || []) {
        if (!seen.has(n) && regionKind(n) === 'maritime' && hasShips(n)) { seen.add(n); comp.push(n); }
      }
      for (const sea of comp) for (const n of ADJ[sea] || []) {
        if (n !== rid && regionKind(n) !== 'maritime') landing.add(`${n}|${rid}`);
      }
    }
  }
  let reach = 0;
  const counted = new Set();
  for (const key of landing) {
    const [to, from] = key.split('|');
    if (counted.has(to)) continue;
    const r = REGIONS.find(x => x.id === to);
    if (!r || r.kind !== 'land' || !r.muster) continue;
    if (controllerOf(state, to) === fid) continue;
    let def = 0;
    for (const f2 of state.factions) if (f2 !== fid) def += strengthIn(state, to, f2);
    if (strengthIn(state, from, fid) > def) { reach++; counted.add(to); }
  }
  return {
    seats: seatsControlled(state, fid),
    citadels,
    land: landAreasControlled(state, fid),
    army,
    cash: state.authority?.[fid] ?? 0,
    income,
    supply: state.supply?.[fid] ?? 0,
    tracks,
    threat,
    reach,
  };
}

/** The glance: one auditable number. Higher = stronger position. */
export function positionScore(state, fid, W = EVAL_V1) {
  const f = positionFeatures(state, fid);
  return W.eSeat * f.seats + W.eCitadel * f.citadels + W.eLand * f.land
    + W.eArmy * f.army + W.eCash * f.cash + W.eIncome * f.income
    + W.eSupply * f.supply + W.eTracks * f.tracks - W.eThreat * f.threat
    + (W.eReach ?? 0) * f.reach;
}

/** All six factions, strongest first: [{ fid, score, features }]. */
export function rankFactions(state, W = EVAL_V1) {
  return state.factions
    .map(fid => ({ fid, score: positionScore(state, fid, W), features: positionFeatures(state, fid) }))
    .sort((a, b) => b.score - a.score);
}

/** The table's current leader — and whether it's you. */
export function tableLeader(state, W = EVAL_V1) {
  return rankFactions(state, W)[0]?.fid ?? null;
}
