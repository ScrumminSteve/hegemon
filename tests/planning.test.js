// Golden tests — M1.b: Planning Phase (Rules p.11–13).

import { createGame, serialize, deserialize } from '../src/engine/state.js';
import { applyAction, beginPlanning, legalActions, orderableRegions, starLimit } from '../src/engine/engine.js';
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
  F2: { L36: M(0), L16: CP(false), S10: SU(0) },
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

  { name: 'sea areas accept orders; effect nullity is resolution\'s concern (Rules p.13)', fn() {
    const g = freshPlanning();
    const { state } = applyAction(g, { type: 'submitOrders', faction: 'F1',
      orders: { L01: M(0), L04: D(1), S02: CP(false) } });
    eq(state.ordersByRegion.S02.type, 'rally');
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

  { name: 'threat-deck peek is a logged no-op until M2', fn() {
    const s = submitAll(freshPlanning());
    const { state, events } = applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'peekThreatDeck' });
    ok(events.some(e => e.event === 'courierPeekUnavailable'));
    eq(state.phase, 'action');
  }},

  { name: 'legalActions describes the decision space for the querying faction only', fn() {
    const g = freshPlanning();
    const la = legalActions(g, 'F1');
    eq(la.length, 1);
    eq(la[0].regions, ['L01', 'L04', 'S02']);
    eq(la[0].starLimit, 3);
    const s = submitAll(g);
    eq(legalActions(s, 'F1'), []);
    eq(legalActions(s, 'F2')[0].type, 'courierDecision');
  }},

  { name: 'mid-planning state serializes and round-trips losslessly', fn() {
    const g = freshPlanning();
    const { state } = applyAction(g, { type: 'submitOrders', faction: 'F1', orders: SUBMISSIONS.F1 });
    eq(deserialize(serialize(state)), state);
  }},

];
