// Golden tests — M1.b: Planning Phase (Rules p.11–13).

import { createGame, serialize, deserialize } from '../src/engine/state.js';
import { applyAction, beginPlanning, decisionDescriptors, orderableRegions, starLimit, maxPlaceableOrders, cpAllowedAt } from '../src/engine/engine.js';
import { legalActions } from '../src/engine/legal.js';
import { viewFor } from '../src/engine/views.js';
import { eq, ok, throws } from './assert.js';

const M  = (mod = 0) => ({ type: 'march', mod, starred: mod === 1 });
const D  = (mod = 1) => ({ type: 'defend', mod, starred: mod === 2 });
const SU = (mod = 0) => ({ type: 'support', mod, starred: mod === 1 });
const R  = (starred = false) => ({ type: 'raid', mod: 0, starred });
const CP = (starred = false) => ({ type: 'rally', mod: 0, starred });

function freshPlanning() {
  const g = createGame(6, { seed: 9 });
  beginPlanning(g);
  return g;
}

// A legal full submission for each faction's starting position.
const SUBMISSIONS = {
  F1: { L01: M(0), L04: D(1), S02: SU(0) },
  F2: { L36: M(0), L16: CP(false), S10: SU(0), P04: D(1) },
  F3: { L22: D(1), L20: M(0), S04: SU(0) },
  F4: { L30: M(0), L33: R(false), S08: SU(0) },
  F5: { L28: D(1), L27: M(0), S05: SU(0) },
  F6: { L37: D(1), L08: M(0), S11: SU(0), P03: R(false) },
};

function submitAll(g) {
  let s = g;
  for (const [f, orders] of Object.entries(SUBMISSIONS)) {
    s = applyAction(s, { type: 'submitOrders', faction: f, orders }).state;
  }
  return s;
}

export const tests = [

  { name: 'beginPlanning queues one submission query per faction (Rules p.12)', fn() {
    const g = freshPlanning();
    eq(g.pendingQueries.filter(q => q.type === 'submitOrders').length, 6);
  }},

  { name: 'orderable regions: F1 = {L01, L04, S02}; F6 includes its port (Rules p.12, p.25)', fn() {
    const g = freshPlanning();
    eq(orderableRegions(g, 'F1'), ['L01', 'L04', 'S02']);
    eq(orderableRegions(g, 'F6'), ['L08', 'L37', 'P03', 'S11']);
  }},

  { name: 'star limits follow Command-track positions 3/3/2/1/0/0 (Rules p.11)', fn() {
    const g = freshPlanning();
    eq(starLimit(g, 'F2'), 3); eq(starLimit(g, 'F1'), 3); eq(starLimit(g, 'F5'), 2);
    eq(starLimit(g, 'F3'), 1); eq(starLimit(g, 'F4'), 0); eq(starLimit(g, 'F6'), 0);
  }},

  { name: 'a legal submission is stored face-down and consumes the query', fn() {
    const g = freshPlanning();
    const { state } = applyAction(g, { type: 'submitOrders', faction: 'F1', orders: SUBMISSIONS.F1 });
    eq(state.ordersByRegion.L01, { faction: 'F1', type: 'march', mod: 0, starred: false, revealed: false });
    eq(state.pendingQueries.filter(q => q.type === 'submitOrders').length, 5);
    // applyAction is non-mutating: the input state is untouched
    eq(g.ordersByRegion, {});
  }},

  { name: 'rejects an order where the faction has no units (Rules p.12)', fn() {
    const g = freshPlanning();
    throws(() => applyAction(g, { type: 'submitOrders', faction: 'F1',
      orders: { ...SUBMISSIONS.F1, L19: R() } }));
  }},

  { name: 'rejects incomplete coverage — every occupied area must be ordered (Rules p.12)', fn() {
    const g = freshPlanning();
    throws(() => applyAction(g, { type: 'submitOrders', faction: 'F1',
      orders: { L01: M(0), L04: D(1) } }));
  }},

  { name: 'rejects using the same physical token twice (Rules p.12–13 inventory)', fn() {
    const g = freshPlanning();
    throws(() => applyAction(g, { type: 'submitOrders', faction: 'F1',
      orders: { L01: M(-1), L04: M(-1), S02: SU(0) } }));
  }},

  { name: 'rejects starred orders beyond the Command allowance — F6 has 0 stars (Rules p.11)', fn() {
    const g = freshPlanning();
    throws(() => applyAction(g, { type: 'submitOrders', faction: 'F6',
      orders: { L37: D(2), L08: M(0), S11: SU(0), P03: R(false) } }));
  }},

  { name: 'sea areas accept non-rally orders; rally alone is terrain-bound (Rules p.13; doctrine updated m3d8)', fn() {
    const g = freshPlanning();
    const { state } = applyAction(g, { type: 'submitOrders', faction: 'F1',
      orders: { L01: M(0), L04: D(1), S02: SU(0) } });
    eq(state.ordersByRegion.S02.type, 'support', 'support sails fine');
  }},

  { name: 'opponents see a face-down token\'s presence, not its face (Rules p.27)', fn() {
    const g = freshPlanning();
    const { state } = applyAction(g, { type: 'submitOrders', faction: 'F1', orders: SUBMISSIONS.F1 });
    const v = viewFor(state, 'F2');
    ok(v.ordersByRegion.L01.hidden === true, 'masked for opponent');
    eq(viewFor(state, 'F1').ordersByRegion.L01.type, 'march');
  }},

  { name: 'final submission triggers reveal and queues the Courier decision for its holder (Rules p.12)', fn() {
    const s = submitAll(freshPlanning());
    ok(Object.values(s.ordersByRegion).every(o => o.revealed === true), 'all revealed');
    eq(s.pendingQueries, [{ type: 'courierDecision', faction: 'F2', options: ['pass', 'swapOrder', 'peekThreatDeck'] }]);
    eq(viewFor(s, 'F5').ordersByRegion.L01.type, 'march');
  }},

  { name: 'courier pass hands off to a live Action Phase: first raid query queued (Rules p.12, p.14)', fn() {
    const s = submitAll(freshPlanning());
    const { state } = applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' });
    eq(state.phase, 'action');
    // SUBMISSIONS contain raids for F4 and F6; F6 precedes F4 in initiative order.
    eq(state.pendingQueries, [{ type: 'resolveOrder', step: 'raid', faction: 'F6', regions: ['P03'] }]);
  }},

  { name: 'courier swap replaces one own order with an unused token (Rules p.11)', fn() {
    const s = submitAll(freshPlanning());
    const { state } = applyAction(s, { type: 'courierDecision', faction: 'F2',
      decision: 'swapOrder', swap: { region: 'L16', newOrder: M(-1) } });
    eq(state.ordersByRegion.L16, { faction: 'F2', type: 'march', mod: -1, starred: false, revealed: true });
    eq(state.phase, 'action');
  }},

  { name: 'courier swap cannot duplicate an already-placed token', fn() {
    const s = submitAll(freshPlanning());
    throws(() => applyAction(s, { type: 'courierDecision', faction: 'F2',
      decision: 'swapOrder', swap: { region: 'L16', newOrder: M(0) } }));  // M(0) already at L36
  }},

  { name: 'courier swap cannot touch another faction\'s order (Rules p.11)', fn() {
    const s = submitAll(freshPlanning());
    throws(() => applyAction(s, { type: 'courierDecision', faction: 'F2',
      decision: 'swapOrder', swap: { region: 'L01', newOrder: M(-1) } }));
  }},

  { name: 'only the Courier holder gets the decision', fn() {
    const s = submitAll(freshPlanning());
    throws(() => applyAction(s, { type: 'courierDecision', faction: 'F1', decision: 'pass' }));
  }},

  { name: 'the Courier decision is swap OR peek, never both (Rules p.11)', fn() {
    let s = submitAll(freshPlanning());
    s = applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'peekThreatDeck' }).state;
    throws(() => applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'swapOrder',
      swap: { region: 'L36', newOrder: { type: 'march', mod: 0, starred: false } } }),
      'swap after peek');
    throws(() => applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'peekThreatDeck' }),
      'double peek');
  }},

  { name: 'the Courier may peek at the top invader card and bury or keep it (Rules p.11)', fn() {
    let s = submitAll(freshPlanning());
    const top = s.invaderDeck[0];
    s = applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'peekThreatDeck' }).state;
    const q = s.pendingQueries.find(x => x.type === 'threatPeekPlacement' && x.faction === 'F2');
    ok(q, 'placement query pends for the Courier holder');
    eq(q.card, top);
    // Hidden information: other seats must not see the card identity.
    const spy = viewFor(s, 'F5');
    const sq = spy.pendingQueries.find(x => x.type === 'threatPeekPlacement');
    ok(sq && sq.card === undefined, 'card masked from non-holders');
    s = applyAction(s, { type: 'threatPeekPlacement', faction: 'F2', placement: 'bottom' }).state;
    eq(s.invaderDeck[s.invaderDeck.length - 1], top, 'buried to the bottom');
    eq(s.phase, 'action', 'action phase opens after placement');
    // Earned knowledge persists in the holder's view — and only there (M3 parity).
    const later = viewFor(s, 'F2');
    eq(later.privateKnowledge.F2.threatDeck.card, top, 'the holder remembers');
    eq(later.privateKnowledge.F2.threatDeck.placement, 'bottom');
    const rival = viewFor(s, 'F5');
    ok(!rival.privateKnowledge.F2, 'rivals see no trace of the secret');
  }},

  { name: 'decisionDescriptors describes the decision space for the querying faction only', fn() {
    const g = freshPlanning();
    const la = decisionDescriptors(g, 'F1');
    eq(la.length, 1);
    eq(la[0].regions, ['L01', 'L04', 'S02']);
    eq(la[0].starLimit, 3);
    const s = submitAll(g);
    eq(decisionDescriptors(s, 'F1'), []);
    eq(decisionDescriptors(s, 'F2')[0].type, 'courierDecision');
  }},

  { name: 'mid-planning state serializes and round-trips losslessly', fn() {
    const g = freshPlanning();
    const { state } = applyAction(g, { type: 'submitOrders', faction: 'F1', orders: SUBMISSIONS.F1 });
    eq(deserialize(serialize(state)), state);
  }},

];

// --- M3.b: Not Enough Order Tokens (Rules p.12) ------------------------------
// Found live by the heuristic fuzz (seed 7000, round 8): 11 occupied areas,
// defend class banned by decree, star allowance 0 — only 8 legal tokens.
// The validator must accept exactly the placeable maximum and no other count;
// the M3.a generator must produce a non-empty menu of exactly that shape.

function riggedShortage() {
  const g = createGame(6, { seed: 9 });
  beginPlanning(g);
  // F1 to the command-track bottom: star allowance 0 (6-seat table).
  g.tracks.command = g.tracks.command.filter(f => f !== 'F1').concat('F1');
  // Decree: no defend orders this round (E3-banDefend class ban).
  g.roundFlags.bannedOrders = ['defend'];
  // Spread F1 to 11 areas (march/support/raid/rally ×2 = 8 legal tokens).
  const spread = ['L02', 'L05', 'L06', 'L07', 'L09', 'L10', 'L11', 'L12'];
  for (const rid of spread) {
    (g.unitsByRegion[rid] = g.unitsByRegion[rid] || []).push({ faction: 'F1', type: 'infantry', routed: false });
  }
  return g;
}

tests.push(
  { name: 'not-enough-tokens: maxPlaceableOrders caps at the legal supply (Rules p.12; decree + star limit)', fn() {
    const g = riggedShortage();
    eq(orderableRegions(g, 'F1').length, 11, '11 occupied areas');
    eq(starLimit(g, 'F1'), 0, 'command-track bottom: no stars');
    eq(maxPlaceableOrders(g, 'F1'), 8, '8 legal tokens: 4 classes x 2 plain each');
  }},

  { name: 'not-enough-tokens: the validator accepts exactly the placeable maximum, rejects short and full-coverage-with-banned (Rules p.12, p.22)', fn() {
    const g = riggedShortage();
    const areas = orderableRegions(g, 'F1');
    const legal = {};
    const toks = [M(0), M(-1), SU(0), SU(0), R(false), R(false), CP(false), CP(false)];
    areas.slice(0, 8).forEach((rid, i) => { legal[rid] = toks[i]; });
    applyAction(g, { type: 'submitOrders', faction: 'F1', orders: legal }); // must not throw
    const short = Object.fromEntries(Object.entries(legal).slice(0, 7));
    throws(() => applyAction(riggedShortage(), { type: 'submitOrders', faction: 'F1', orders: short }),
      /exactly 8/, 'placing fewer than the max is refused');
    const withBanned = { ...Object.fromEntries(Object.entries(legal).slice(0, 7)), [areas[8]]: D(1) };
    throws(() => applyAction(riggedShortage(), { type: 'submitOrders', faction: 'F1', orders: withBanned }),
      /forbidden this round/, 'a decree-banned token never sneaks in via the shortage');
  }},

  { name: 'not-enough-tokens: decisionDescriptors serves a sound, non-empty menu at the shortage (M3.a contract regression)', fn() {
    const g = riggedShortage();
    const q = g.pendingQueries.find(x => x.type === 'submitOrders' && x.faction === 'F1');
    const menu = legalActions(g, q);
    ok(menu.length > 0, 'the seed-7000 crash class: the menu must never be empty here');
    for (const a of menu) {
      eq(Object.keys(a.orders).length, 8, 'every item places exactly the maximum');
      ok(!Object.values(a.orders).some(o => o.type === 'defend'), 'no banned class in any item');
    }
  }},
);

// --- m3e1 (owner ruling): sea rally is DUMB-BUT-LEGAL --------------------
// The m3d8 hard ban trapped a human whose token pool was spent (staged sea
// CP + commit rejection + nothing left to swap = undo or nothing). Doctrine
// reverted: placement legal, resolution null, bot avoidance in SCORING.

tests.push(
  { name: 'SEA RALLY DOCTRINE: placement is accepted; nullity is resolution\'s concern (owner ruling m3e1, reverts m3d8)', fn() {
    const g = freshPlanning();
    const { state } = applyAction(g, { type: 'submitOrders', faction: 'F1',
      orders: { L01: M(0), L04: D(1), S02: CP(false) } });
    eq(state.ordersByRegion.S02.type, 'rally', 'the dumb order stands');
  }},

  { name: 'shortage math under decree, flat again (m3e1): an all-sea navy places exactly the supply-capped count, menu non-empty', fn() {
    const h = createGame(6, { seed: 22 });
    beginPlanning(h);
    h.roundFlags.bannedOrders = ['march', 'marchPlusOne', 'defend', 'support'];
    h.tracks.command = h.tracks.command.filter(f => f !== 'F2').concat('F2'); // no stars
    for (const rid of Object.keys(h.unitsByRegion)) {
      h.unitsByRegion[rid] = (h.unitsByRegion[rid] || []).filter(u => u.faction !== 'F2');
    }
    for (const sea of ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09']) {
      (h.unitsByRegion[sea] = h.unitsByRegion[sea] || []).push({ faction: 'F2', type: 'warship', routed: false });
    }
    eq(orderableRegions(h, 'F2').length, 9, 'nine sea areas held');
    const cap = maxPlaceableOrders(h, 'F2');
    eq(cap, 4, 'raid x2 + rally x2 sail (stars capped at 0): exactly 4');
    const q2 = h.pendingQueries.find(x => x.type === 'submitOrders' && x.faction === 'F2');
    const menu2 = legalActions(h, q2);
    ok(menu2.length > 0, 'the navy still gets a menu');
    for (const a of menu2) eq(Object.keys(a.orders).length, cap, 'every item places exactly the cap');
  }},
);
