// legalActions — the enumeration seam (M3.a).
//
// The engine has always VALIDATED actions (propose → accept or throw); agents
// need it to ENUMERATE them. This module returns, for the current pending
// query (or planning submission), a menu of COMPLETE action objects with one
// contract: **soundness** — every returned action passes applyAction. The
// zero-rejection fuzz golden turns that contract into a proof: menu and
// validator can never drift apart silently, and any drift is an engine bug
// surfaced loudly (historically our best bug class: the port family, the
// adjacency asymmetry — both were menu/validator disagreements found by hand).
//
// Completeness is honest, not absolute: option-carrying queries (retreats,
// cards, bids, tracks…) enumerate fully; combinatorial queries (planning
// assignments, march move-sets, musters, casualty splits, unit picks) use
// BOUNDED, SEEDED generation — a deterministic sample that always includes
// the simplest legal answers. Full-breadth enumeration is an M3.e (training
// corpus) concern, not a parity concern.
//
// Mechanism: candidates are built STRUCTURALLY per query, then pre-validated
// by simulation — applyAction against a log-stripped clone, discard the
// result, keep the action. No rules logic is duplicated here; the engine
// itself is the arbiter of its own menu. Cost is clones; fine at fuzz scale,
// optimizable per-type if RL throughput ever demands it.

import { applyAction } from './engine.js';
import { orderableRegions, ORDER_TOKENS, starLimit } from './planning.js';
import { REGIONS, PORTS, buildAdjacency } from '../data/map.js';

const ADJ = buildAdjacency();
const regionById = Object.fromEntries([...REGIONS, ...PORTS].map(r => [r.id, r]));

/** Deterministic small PRNG for bounded generation (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (arr, r) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** One stripped base per menu; applyAction clones internally per candidate. */
function simulator(state) {
  const base = structuredClone(state);
  base.log = []; base.actionLog = [];
  return action => {
    try { applyAction(base, action); return true; }
    catch { return false; }
  };
}

/** The query an agent must answer now, or a synthetic planning marker. */
export function currentQuery(state) {
  if (state.phase === 'gameOver') return null;
  return state.pendingQueries[0] ?? null;
}

/**
 * Menu of complete, engine-validated actions for the current query.
 * Every item satisfies: applyAction(state, item) does not throw.
 */
export function legalActions(state, query = currentQuery(state)) {
  if (!query) return [];
  const gen = GENERATORS[query.type];
  if (!gen) throw new Error(`legalActions: no generator for query type '${query.type}' — every query MUST be enumerable (M3.a contract)`);
  const r = rng((state.actionLog.length * 2654435761) ^ (state.round * 97) ^ query.type.length);
  const sim = simulator(state);
  const menu = gen(state, query, r).filter(sim);
  if (!menu.length) {
    throw new Error(`legalActions: EMPTY menu for ${query.type} (${query.faction}) — either the generator is incomplete or the engine posed an unanswerable query. Both are bugs.`);
  }
  return menu;
}

// ---------------------------------------------------------------------------
// generators — structural candidates; the simulator prunes, never patches
// ---------------------------------------------------------------------------

const pick = (q, extra) => ({ faction: q.faction, ...extra });
const fromOptions = field => (state, q) => q.options.map(o => pick(q, { type: q.type, [field]: o }));

const GENERATORS = {
  // ----- planning -----
  submitOrders(state, q, r) {
    const eligible = orderableRegions(state, q.faction);
    const banned = state.roundFlags.bannedOrders || [];
    const isBanned = t => banned.some(c => c === t.type || (c === 'starred' && t.starred));
    // Star-allowance-aware construction (fuzz finding: with allowance 0 a
    // star-blind generator can produce an all-pruned menu on unlucky seeds).
    const allowance = starLimit(state, q.faction);
    const out = [];
    for (let attempt = 0; attempt < 40 && out.length < 8; attempt++) {
      const pool = shuffled(ORDER_TOKENS.filter(t => !isBanned(t)), r);
      const orders = {};
      let stars = 0, ok = true;
      for (const rid of eligible) {
        const idx = pool.findIndex(t => !t.starred || stars < allowance);
        if (idx === -1) { ok = false; break; }
        const t = pool.splice(idx, 1)[0];
        if (t.starred) stars++;
        orders[rid] = { type: t.type, mod: t.mod, starred: t.starred };
      }
      if (ok) out.push(pick(q, { type: 'submitOrders', orders }));
    }
    return out; // inventory duplicates remain the simulator's concern
  },

  courierDecision(state, q, r) {
    const out = [pick(q, { type: 'courierDecision', decision: 'pass' }),
                 pick(q, { type: 'courierDecision', decision: 'peekThreatDeck' })];
    const mine = Object.entries(state.ordersByRegion).filter(([, o]) => o.faction === q.faction);
    for (const [rid] of shuffled(mine, r).slice(0, 3)) {
      for (const t of shuffled(ORDER_TOKENS, r).slice(0, 4)) {
        out.push(pick(q, { type: 'courierDecision', decision: 'swapOrder',
          swap: { region: rid, newOrder: { type: t.type, mod: t.mod, starred: t.starred } } }));
      }
    }
    return out;
  },

  threatPeekPlacement: fromOptions('placement'),

  // ----- action phase -----
  resolveOrder(state, q, r) {
    const out = [];
    for (const rid of q.regions) {
      if (q.step === 'raid') {
        out.push({ type: 'resolveRaid', faction: q.faction, region: rid, target: null });
        for (const nbr of ADJ[rid] || []) {
          const o = state.ordersByRegion[nbr];
          if (o && o.faction !== q.faction) out.push({ type: 'resolveRaid', faction: q.faction, region: rid, target: nbr });
        }
      } else if (q.step === 'rally') {
        out.push({ type: 'resolveRally', faction: q.faction, region: rid, muster: true });
        out.push({ type: 'resolveRally', faction: q.faction, region: rid, muster: false });
      } else if (q.step === 'march') {
        out.push({ type: 'resolveMarch', faction: q.faction, region: rid, moves: [] }); // stand down
        const mine = (state.unitsByRegion[rid] || []).filter(u => u.faction === q.faction && !u.routed);
        const byType = {};
        for (const u of mine) byType[u.type] = (byType[u.type] || 0) + 1;
        const dests = [...(ADJ[rid] || [])];
        for (const to of dests) {
          if (!regionById[to]) continue;
          for (const lc of [false, true]) {
            out.push({ type: 'resolveMarch', faction: q.faction, region: rid, moves: [{ to, units: { ...byType } }], leaveControl: lc });
          }
          const types = Object.keys(byType);
          if (types.length) { // single-unit probe per destination
            const t = types[Math.floor(r() * types.length)];
            out.push({ type: 'resolveMarch', faction: q.faction, region: rid, moves: [{ to, units: { [t]: 1 } }] });
          }
        }
        if (dests.length >= 2 && mine.length >= 2) { // one seeded two-way split
          const [d1, d2] = shuffled(dests, r);
          const types = Object.keys(byType);
          const t = types[Math.floor(r() * types.length)];
          const rest = { ...byType }; rest[t] -= 1;
          if (rest[t] === 0) delete rest[t];
          if (Object.keys(rest).length) {
            out.push({ type: 'resolveMarch', faction: q.faction, region: rid,
              moves: [{ to: d1, units: { [t]: 1 } }, { to: d2, units: rest }] });
          }
        }
      }
    }
    return out;
  },

  muster(state, q, r) {
    const rid = q.region;
    const port = PORTS.find(pp => pp.landId === rid);
    const seas = [...(ADJ[rid] || [])].filter(x => regionById[x]?.kind === 'maritime');
    const singles = [
      { type: 'infantry', to: rid }, { type: 'cavalry', to: rid },
      { type: 'siege_engine', to: rid },
      { type: 'upgrade', to: rid, upTo: 'cavalry' }, { type: 'upgrade', to: rid, to2: 'siege_engine' },
      ...(port ? [{ type: 'warship', to: port.id }] : []),
      ...seas.map(sx => ({ type: 'warship', to: sx })),
    ].map(b => b.type === 'upgrade' ? { type: 'upgrade', to: b.upTo || b.to2 || 'cavalry' } : b);
    const out = [pick(q, { type: 'muster', region: rid, builds: [] })];
    for (const b of singles) out.push(pick(q, { type: 'muster', region: rid, builds: [b] }));
    for (let k = 0; k < 6; k++) { // seeded greedy fills toward the point budget
      const builds = [];
      let left = q.points;
      for (const b of shuffled(singles, r)) {
        const cost = b.type === 'cavalry' || b.type === 'siege_engine' ? 2 : 1;
        if (cost <= left) { builds.push(b); left -= cost; }
      }
      if (builds.length > 1) out.push(pick(q, { type: 'muster', region: rid, builds }));
    }
    return out;
  },

  reconcileSupply(state, q) {
    const out = [];
    for (const rid of q.regions) {
      const types = new Set((state.unitsByRegion[rid] || [])
        .filter(u => u.faction === q.faction).map(u => u.type));
      for (const t of types) out.push(pick(q, { type: 'reconcileSupply', region: rid, unitType: t }));
    }
    return out;
  },

  // ----- bidding -----
  bid(state, q) {
    const out = [];
    for (let a = 0; a <= q.max; a++) out.push(pick(q, { type: 'bid', track: q.track, amount: a }));
    return out;
  },
  bidTieBreak(state, q, r) {
    const perms = permutations(q.tied);
    return (perms.length > 12 ? shuffled(perms, r).slice(0, 12) : perms)
      .map(order => pick(q, { type: 'bidTieBreak', track: q.track, order }));
  },
  invaderBid(state, q) {
    const out = [];
    for (let a = 0; a <= q.max; a++) out.push(pick(q, { type: 'invaderBid', amount: a }));
    return out;
  },
  invaderTieBreak(state, q) {
    return q.tied.map(f => pick(q, { type: 'invaderTieBreak', chosen: f }));
  },

  // ----- combat -----
  declareSupport(state, q) {
    return q.options.map(side => pick(q, { type: 'declareSupport', region: q.region, side }));
  },
  useBlade: fromOptions('use'),
  useCardAbility: fromOptions('use'),
  cardTarget(state, q) {
    const out = q.options.map(o => pick(q, { type: 'cardTarget', target: o }));
    if (q.skippable) out.push(pick(q, { type: 'cardTarget', target: null }));
    return out;
  },
  chooseLeaderCard(state, q) {
    return q.hand.map(card => pick(q, { type: 'chooseLeaderCard', card }));
  },
  chooseCasualties(state, q, r) {
    const combos = multisets(q.available, q.count);
    return (combos.length > 20 ? shuffled(combos, r).slice(0, 20) : combos)
      .map(units => pick(q, { type: 'chooseCasualties', units }));
  },
  retreat(state, q) {
    return q.options.map(to => pick(q, { type: 'retreat', to }));
  },
  replacePortShips(state, q) {
    const out = [];
    for (let n = 0; n <= q.max; n++) out.push(pick(q, { type: 'replacePortShips', count: n }));
    return out;
  },

  // ----- events & invaders -----
  eventChoice: fromOptions('option'),
  incursionOption(state, q) {
    // The handler takes an INDEX into the options list, not the option object
    // (fuzz finding, seed 2000: "Choose an option index 0..1").
    return q.options.map((_, i) => pick(q, { type: 'incursionOption', option: i }));
  },
  incursionTrack: fromOptions('track'),
  incursionCard: fromOptions('card'),
  incursionMusterSite(state, q) {
    return q.options.map(s => pick(q, { type: 'incursionMusterSite', region: s.region }));
  },
  incursionUnits(state, q, r) {
    // Shapes seen in the wild (fuzz): {unitType, count, optional} for
    // upgrades/downgrades; {purpose:'destroy', count, regions, constraint:
    // 'singleRegion'} for destruction effects. Honor whitelists and the
    // single-region constraint; generate liberally, the simulator prunes.
    const regionScope = q.regions || Object.keys(state.unitsByRegion);
    const pools = {};
    for (const rid of regionScope) {
      for (const u of state.unitsByRegion[rid] || []) {
        if (u.faction === q.faction && (!q.unitType || u.type === q.unitType)) {
          (pools[rid] ||= []).push({ region: rid, type: u.type });
        }
      }
    }
    const flat = Object.values(pools).flat();
    const out = [];
    if (q.optional) out.push(pick(q, { type: 'incursionUnits', units: [] }));
    const sample = units => {
      const n = q.optional ? Math.floor(r() * (Math.min(q.count, units.length) + 1))
                           : Math.min(q.count, units.length);
      return shuffled(units, r).slice(0, n);
    };
    if (q.constraint === 'singleRegion') {
      for (const units of Object.values(pools)) {
        out.push(pick(q, { type: 'incursionUnits', units: units.slice(0, q.count) }));
        for (let k = 0; k < 4; k++) out.push(pick(q, { type: 'incursionUnits', units: sample(units) }));
      }
    } else {
      out.push(pick(q, { type: 'incursionUnits', units: flat.slice(0, q.count) }));
      for (let k = 0; k < 10; k++) out.push(pick(q, { type: 'incursionUnits', units: sample(flat) }));
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) {
      out.push([arr[i], ...rest]);
    }
  }
  return out;
}

/** All {type: n} multisets of a given total drawn from availability caps. */
function multisets(available, total) {
  const types = Object.keys(available).filter(t => available[t] > 0);
  const out = [];
  (function rec(i, left, acc) {
    if (i === types.length) { if (left === 0) out.push({ ...acc }); return; }
    const t = types[i];
    for (let n = 0; n <= Math.min(available[t], left); n++) {
      if (n) acc[t] = n; else delete acc[t];
      rec(i + 1, left - n, acc);
    }
    delete acc[t];
  })(0, total, {});
  return out;
}
