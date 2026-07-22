// Golden tests — M1.c: Action Phase (Rules p.14–16, p.23–26).

import { createGame, controllerOf } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { unitStrength, checkSupply, transportReachable } from '../src/engine/actionPhase.js';
import { eq, ok, throws } from './assert.js';

const M  = (mod = 0) => ({ type: 'march', mod, starred: mod === 1 });
const D  = (mod = 1) => ({ type: 'defend', mod, starred: mod === 2 });
const SU = (mod = 0) => ({ type: 'support', mod, starred: mod === 1 });
const R  = (starred = false) => ({ type: 'raid', mod: 0, starred });
const CP = (starred = false) => ({ type: 'rally', mod: 0, starred });

// Reach the action phase with chosen orders per faction.
function toAction(orderSets, seed = 21) {
  let s = createGame(6, { seed, ruleset: { leaderCards: false } });
  beginPlanning(s);
  const defaults = {
    F1: { L01: D(1), L04: D(1), S02: SU(0) },
    F2: { L36: D(1), L16: SU(0), S10: SU(0), P04: D(1) },
    F3: { L22: D(1), L20: SU(0), S04: SU(0) },
    F4: { L30: D(1), L33: SU(0), S08: SU(0) },
    F5: { L28: D(1), L27: SU(0), S05: SU(0) },
    F6: { L37: D(1), L08: D(1), S11: SU(0), P03: SU(0) },
  };
  for (const [f, orders] of Object.entries({ ...defaults, ...orderSets })) {
    s = applyAction(s, { type: 'submitOrders', faction: f, orders }).state;
  }
  return applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' }).state;
}

const q = (s) => s.pendingQueries[0];

export const tests = [

  { name: 'unit strengths: 1/2/1, siege 4 vs fortifications else 0 (Rules p.17)', fn() {
    eq(unitStrength({ type: 'infantry' }), 1);
    eq(unitStrength({ type: 'cavalry' }), 2);
    eq(unitStrength({ type: 'warship' }), 1);
    eq(unitStrength({ type: 'siege_engine' }, { fortified: true }), 4);
    eq(unitStrength({ type: 'siege_engine' }, { fortified: false }), 0);
  }},

  { name: 'raids resolve first, cycling from the Sovereign holder in initiative order (Rules p.14)', fn() {
    const s = toAction({
      F1: { L01: R(), L04: D(1), S02: SU(0) },
      F5: { L28: R(), L27: SU(0), S05: SU(0) },
    });
    eq(q(s), { type: 'resolveOrder', step: 'raid', faction: 'F1', regions: ['L01'] });
    // F1 (initiative 3) precedes F5 (initiative 4); F3/F2 hold no raids and are skipped.
  }},

  { name: 'a raid removes an adjacent enemy support order; both orders leave the board (Rules p.14)', fn() {
    // F2 raids from Gilded Sound (S10) against F6's support in Reaver's Bay (S11) — adjacent seas.
    const s = toAction({ F2: { L36: D(1), L16: SU(0), S10: R(), P04: D(1) } });
    const r = applyAction(s, { type: 'resolveRaid', faction: 'F2', region: 'S10', target: 'S11' });
    ok(r.state.ordersByRegion['S11'] === undefined, 'target removed');
    ok(r.state.ordersByRegion['S10'] === undefined, 'raid removed');
  }},


  { name: 'a land raid cannot reach a sea order (Rules p.14)', fn() {
    const s = toAction({
      F1: { L01: D(1), L04: R(), S02: SU(0) },
      F6: { L37: D(1), L08: SU(0), S11: D(1), P03: SU(0) },
    });
    // F1's raid resolves first; L04 is coastal to S02/S03 but those hold F1's own order or none.
    throws(() => applyAction(s, { type: 'resolveRaid', faction: 'F1', region: 'L04', target: 'S11' }));
  }},

  { name: 'only a starred raid removes a defense order (Rules p.22)', fn() {
    const base = {
      F6: { L37: D(1), L08: D(1), S11: SU(0), P03: SU(0) },
      F2: { L36: D(1), L16: SU(0), S10: SU(0), P04: D(1) },
    };
    const plain = toAction({ ...base, F6: { ...base.F6, S11: R(false) } });
    throws(() => applyAction(plain, { type: 'resolveRaid', faction: 'F6', region: 'S11', target: 'L37' }), 'own order');
    // Target an enemy defense: F6 raid S11 -> F2 has no adjacent defense; use F1 raid vs F6 defense:
    // S02 not adjacent S11. Keep it direct with the starred case on a legal pair:
    const starred = toAction({
      F2: { L36: D(1), L16: SU(0), S10: R(true), P04: D(1) },
      F6: { L37: D(1), L08: D(1), S11: SU(0), P03: SU(0) },
    });
    // S10 adj S11 (sea–sea): starred raid vs support is legal; vs defense needs star — S11 holds support.
    // Direct defense test: F6's L08? S10 not adjacent L08. Validate the rule at validation level:
    throws(() => applyAction(toAction({
      F2: { L36: D(1), L16: SU(0), S10: R(false), P04: D(1) },
      F6: { L37: D(1), L08: SU(0), S11: D(1), P03: SU(0) },
    }), { type: 'resolveRaid', faction: 'F2', region: 'S10', target: 'S11' }), 'plain raid vs defense');
    const okCase = applyAction(toAction({
      F2: { L36: D(1), L16: SU(0), S10: R(true), P04: D(1) },
      F6: { L37: D(1), L08: SU(0), S11: D(1), P03: SU(0) },
    }), { type: 'resolveRaid', faction: 'F2', region: 'S10', target: 'S11' });
    ok(okCase.state.ordersByRegion['S11'] === undefined, 'starred raid removed defense');
    void starred;
  }},

  { name: 'a raid may be spent with no target (Rules p.14)', fn() {
    const s = toAction({ F1: { L01: R(), L04: D(1), S02: SU(0) } });
    const r = applyAction(s, { type: 'resolveRaid', faction: 'F1', region: 'L01', target: null });
    ok(r.state.ordersByRegion['L01'] === undefined);
    ok(r.events.some(e => e.event === 'raidSpent'));
  }},

  { name: 'a march moves all, some, or none; split destinations; order removed (Rules p.15)', fn() {
    const s = toAction({ F1: { L01: M(0), L04: D(1), S02: SU(0) } });
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L02', units: { cavalry: 1 } }, { to: 'L07', units: { infantry: 1 } }] });
    eq((r.state.unitsByRegion['L02'] || []).length, 1);
    eq((r.state.unitsByRegion['L07'] || []).length, 1);
    ok(r.state.unitsByRegion['L01'] === undefined, 'origin emptied');
    ok(r.state.ordersByRegion['L01'] === undefined, 'order removed');
  }},

  { name: 'marching onto enemy units initiates combat instead of completing the move (Rules p.15)', fn() {
    const s = toAction({ F1: { L01: D(1), L04: M(0), S02: SU(0) } });
    s.unitsByRegion['L05'] = [{ faction: 'F3', type: 'infantry', routed: false }];
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L04',
      moves: [{ to: 'L05', units: { infantry: 1 } }] }).state;
    ok(r.combat, 'combat opened');
    eq(r.combat.region, 'L05');
  }},

  { name: 'ships move sea-to-sea and port-to-connected-sea; never onto land (Rules p.15, p.25)', fn() {
    const s = toAction({
      F6: { L37: D(1), L08: SU(0), S11: SU(0), P03: M(0) },
      F1: { L01: D(1), L04: D(1), S02: SU(0) },
    });
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F6', region: 'P03',
      moves: [{ to: 'S11', units: { warship: 1 } }] });
    eq((r.state.unitsByRegion['S11'] || []).filter(u => u.faction === 'F6').length, 2);
    const s2 = toAction({ F1: { L01: D(1), L04: D(1), S02: M(0) } });
    throws(() => applyAction(s2, { type: 'resolveMarch', faction: 'F1', region: 'S02',
      moves: [{ to: 'L02', units: { warship: 1 } }] }), 'ship onto land');
  }},

  { name: 'ship transport bridges land marches through friendly-ship seas (Rules p.23)', fn() {
    const s = toAction({ F1: { L01: D(1), L04: M(0), S02: SU(0) } });
    ok(transportReachable(s, 'F1', 'L04', 'L38'), 'L04 -> S02(ship) -> L38');
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L04',
      moves: [{ to: 'L38', units: { infantry: 1 } }] });
    eq((r.state.unitsByRegion['L38'] || []).length, 1);
  }},

  { name: 'no friendly ship, no transport (Rules p.23)', fn() {
    const s = toAction({ F3: { L22: D(1), L20: M(0), S04: SU(0) },
      F4: { L30: M(0), L33: SU(0), S08: SU(0) } }); // later-initiative march holds round 1 open
    // F3 ships sit in S04; L20 -> L38 has no bridge.
    ok(!transportReachable(s, 'F3', 'L20', 'L38'));
    throws(() => applyAction(s, { type: 'resolveMarch', faction: 'F3', region: 'L20',
      moves: [{ to: 'L38', units: { infantry: 1 } }] }));
  }},

  { name: 'attacking a neutral force needs strength >= token; success destroys it (Rules p.26)', fn() {
    // The Eyrie (L13, neutral 6) via L12. Surgery: stage 3 F1 cavalry in L12 (str 6).
    const s = toAction({ F1: { L01: M(0), L04: D(1), S02: SU(0) } });
    s.unitsByRegion['L12'] = [
      { faction: 'F1', type: 'cavalry', routed: false },
      { faction: 'F1', type: 'cavalry', routed: false },
      { faction: 'F1', type: 'cavalry', routed: false },
    ];
    s.ordersByRegion['L12'] = { faction: 'F1', type: 'march', mod: 0, starred: false, revealed: true };
    s.pendingQueries = [{ type: 'resolveOrder', step: 'march', faction: 'F1', regions: ['L01', 'L12'] }];
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L12',
      moves: [{ to: 'L13', units: { cavalry: 3 } }] });
    ok(r.state.neutrals['L13'] === undefined, 'neutral destroyed');
    eq(controllerOf(r.state, 'L13'), 'F1');
    // Insufficient: 2 cavalry (4) < 6.
    const s2 = toAction({ F1: { L01: M(0), L04: D(1), S02: SU(0) } });
    s2.unitsByRegion['L12'] = [
      { faction: 'F1', type: 'cavalry', routed: false },
      { faction: 'F1', type: 'cavalry', routed: false },
    ];
    s2.ordersByRegion['L12'] = { faction: 'F1', type: 'march', mod: 0, starred: false, revealed: true };
    s2.pendingQueries = [{ type: 'resolveOrder', step: 'march', faction: 'F1', regions: ['L01', 'L12'] }];
    throws(() => applyAction(s2, { type: 'resolveMarch', faction: 'F1', region: 'L12',
      moves: [{ to: 'L13', units: { cavalry: 2 } }] }));
  }},

  { name: 'vacating a non-home land area may leave a control marker for 1 authority (Rules p.24)', fn() {
    const s = toAction({ F3: { L22: D(1), L20: M(0), S04: SU(0) },
      F4: { L30: M(0), L33: SU(0), S08: SU(0) } }); // later-initiative march holds round 1 open
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F3', region: 'L20',
      moves: [{ to: 'L21', units: { infantry: 1 } }], leaveControl: true });
    eq(r.state.controlMarkers['L20'], 'F3');
    eq(r.state.authority.F3, 4);
    eq(controllerOf(r.state, 'L20'), 'F3');
  }},

  { name: 'home areas keep control when vacated — no token needed or allowed (Rules p.24)', fn() {
    const s = toAction({ F1: { L01: M(0), L04: D(1), S02: SU(0) } });
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L02', units: { cavalry: 1, infantry: 1 } }] });
    eq(controllerOf(r.state, 'L01'), 'F1', 'printed home control persists');
    const s2 = toAction({ F1: { L01: M(0), L04: D(1), S02: SU(0) } });
    throws(() => applyAction(s2, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L02', units: { cavalry: 1, infantry: 1 } }], leaveControl: true }));
  }},

  { name: 'supply limits bind after every march (Rules p.8)', fn() {
    const s = toAction({ F1: { L01: D(1), L04: M(0), S02: SU(0) } });
    // F1 supply 1 -> limits [3,2,2]. Surgery: two 3-armies would violate.
    s.unitsByRegion['L07'] = [
      { faction: 'F1', type: 'infantry', routed: false },
      { faction: 'F1', type: 'infantry', routed: false },
      { faction: 'F1', type: 'infantry', routed: false },
    ];
    checkSupply(s, 'F1'); // [3,2] fits [3,2,2]
    throws(() => applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L04',
      moves: [{ to: 'L07', units: { infantry: 1 } }] }), 'army of 4 under supply 1');
  }},

  { name: 'rally collects 1 + coin icons on land; nothing at sea (Rules p.16; m3e1 doctrine)', fn() {
    const s = toAction({ F2: { L36: D(1), L16: CP(), S10: SU(0), P04: D(1) },
      F4: { L30: D(1), L33: CP(), S08: SU(0) } }); // later-initiative rally holds round 1 open
    const r = applyAction(s, { type: 'resolveRally', faction: 'F2', region: 'L16' });
    eq(r.state.authority.F2, 7, 'Millford/Stoney Sept: 1 + 1 coin:');
    // m3e1: sea rally is legal again (owner ruling) — and collects NOTHING.
    const s2 = toAction({ F2: { L36: D(1), L16: SU(0), S10: CP(), P04: D(1) },
      F4: { L30: D(1), L33: CP(), S08: SU(0) } });
    const r2 = applyAction(s2, { type: 'resolveRally', faction: 'F2', region: 'S10' });
    eq(r2.state.authority.F2, 5, 'sea rally collects nothing');
  }},

  { name: 'the starred rally may muster in its own fortified area (Rules p.22)', fn() {
    let s = toAction({ F2: { L36: CP(true), L16: SU(0), S10: SU(0), P04: D(1) },
      F4: { L30: D(1), L33: CP(), S08: SU(0) } }); // later-initiative rally holds round 1 open
    s = applyAction(s, { type: 'resolveRally', faction: 'F2', region: 'L36', muster: true }).state;
    const q = s.pendingQueries.find(x => x.type === 'muster' && x.faction === 'F2');
    ok(q && q.region === 'L36' && q.points === 2 && q.source === 'rally', 'citadel offers 2 points');
    s = applyAction(s, { type: 'muster', faction: 'F2', region: 'L36',
      builds: [{ type: 'warship', to: 'P04' }] }).state;
    eq((s.unitsByRegion['P04'] || []).filter(u => u.faction === 'F2').length, 2, 'harbor ship joined the errata ship');
    ok(!s.pendingQueries.some(x => x.type === 'muster'), 'cycler resumes');
  }},

  { name: 'unstarred rallies cannot muster; nor can a starred rally without a fort (Rules p.22)', fn() {
    let s = toAction({ F2: { L36: D(1), L16: CP(true), S10: SU(0), P04: D(1) },
      F4: { L30: D(1), L33: CP(), S08: SU(0) } });
    throws(() => applyAction(structuredClone(s), { type: 'resolveRally', faction: 'F2', region: 'L16', muster: true }),
      /fort/, 'starred rally on unfortified ground cannot muster');
    s = applyAction(s, { type: 'resolveRally', faction: 'F2', region: 'L16' }).state; // take the authority instead
    throws(() => applyAction(s, { type: 'resolveRally', faction: 'F4', region: 'L33', muster: true }),
      'unstarred');
  }},

  { name: 'orders cycle one-at-a-time in initiative order within each step (Rules p.14)', fn() {
    let s = toAction({
      F3: { L22: CP(), L20: CP(), S04: SU(0) },
      F1: { L01: CP(), L04: D(1), S02: SU(0) },
    });
    eq(q(s).faction, 'F3', 'sovereign first');
    s = applyAction(s, { type: 'resolveRally', faction: 'F3', region: 'L22' }).state;
    eq(q(s).faction, 'F1', 'then next in initiative');
    s = applyAction(s, { type: 'resolveRally', faction: 'F1', region: 'L01' }).state;
    eq(q(s).faction, 'F3', 'cycles back for the second order');
    eq(q(s).regions, ['L20']);
  }},

  { name: 'a resolved action phase cleans up into the round-2 Event Phase, then planning (Rules p.7, p.16)', fn() {
    let s = toAction({}); // defaults: no raid/march/rally orders at all
    // With nothing to resolve, cleanup fires and the Event Phase reveals its cards.
    eq(s.round, 2);
    ok(s.log.some(e => e.event === 'eventPhaseBegan'));
    eq(s.log.filter(e => e.event === 'eventCardRevealed').length, 3, 'one card per deck:');
    // Drain any holder choices with the safe option; reconcile nothing (no armies moved).
    for (let i = 0; i < 6 && s.pendingQueries.some(x => x.type === 'eventChoice'); i++) {
      const q = s.pendingQueries.find(x => x.type === 'eventChoice');
      const opt = q.options.includes('nothing') ? 'nothing' : q.options[0];
      s = applyAction(s, { type: 'eventChoice', faction: q.faction, option: opt }).state;
    }
    eq(s.phase, 'planning');
    eq(s.ordersByRegion, {});
    eq(s.pendingQueries.filter(x => x.type === 'submitOrders').length, 6);
  }},

];

tests.push(
  { name: 'B1: a second leave-control on ground already marked is FREE — no double charge (owner transcript: L31, L07 twice)', fn() {
    // March out leaving a marker; return; march out again "leaving" it again.
    let s = toAction({ F2: { L36: D(1), L16: M(0), S10: SU(0), P04: D(1) },
      F4: { L30: D(1), L33: CP(), S08: SU(0) } });
    s = applyAction(s, { type: 'resolveMarch', faction: 'F2', region: 'L16',
      moves: [{ to: 'L15', units: { infantry: 1 } }], leaveControl: true }).state;
    const afterFirst = s.authority.F2;
    eq(s.controlMarkers['L16'], 'F2', 'marker planted');
    // hand-carry the unit back and march out again with leaveControl
    s.unitsByRegion['L16'] = [{ faction: 'F2', type: 'infantry', routed: false }];
    s.unitsByRegion['L15'] = [];
    s.pendingQueries.push({ type: 'resolveOrder', step: 'march', faction: 'F2', regions: ['L16'] });
    s.ordersByRegion['L16'] = { type: 'march', mod: 0, starred: false, faction: 'F2' };
    s = applyAction(s, { type: 'resolveMarch', faction: 'F2', region: 'L16',
      moves: [{ to: 'L15', units: { infantry: 1 } }], leaveControl: true }).state;
    eq(s.authority.F2, afterFirst, 'the standing marker costs NOTHING to keep');
    eq(s.controlMarkers['L16'], 'F2', 'and it still stands');
    ok(s.log.some(e => e.event === 'controlAlreadyHeld'), 'the free pass is chronicled');
  }},
);
