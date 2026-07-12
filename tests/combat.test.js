// Golden tests — M1.d: Combat (Rules p.17–21, p.25–26).

import { createGame, serialize, deserialize, controllerOf } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { combatStrengths, legalRetreats } from '../src/engine/combat.js';
import { orderableRegions } from '../src/engine/planning.js';
import { eq, ok, throws } from './assert.js';

const M  = (mod = 0) => ({ type: 'march', mod, starred: mod === 1 });
const D  = (mod = 1) => ({ type: 'defend', mod, starred: mod === 2 });
const SU = (mod = 0) => ({ type: 'support', mod, starred: mod === 1 });
const CP = (starred = false) => ({ type: 'rally', mod: 0, starred });

// Fill every faction's mandatory coverage, applying explicit overrides, with a
// raid-free, march-free token preference so only the scenario's marches queue.
const FILL = [CP(), CP(), D(1), D(1), SU(0), SU(0), M(-1), M(0)];
function stage({ plants = {}, strip = [], orders = {} }, seed = 5) {
  let s = createGame(6, { seed, ruleset: { leaderCards: false } });
  for (const rid of strip) delete s.unitsByRegion[rid];
  for (const [rid, units] of Object.entries(plants)) {
    s.unitsByRegion[rid] = units.map(([faction, type]) => ({ faction, type, routed: false }));
  }
  beginPlanning(s);
  for (const fid of s.factions) {
    const explicit = orders[fid] || {};
    const used = Object.values(explicit).map(o => `${o.type}|${o.mod}|${o.starred}`);
    const pool = FILL.filter(o => {
      const k = `${o.type}|${o.mod}|${o.starred}`;
      const i = used.indexOf(k);
      if (i !== -1) { used.splice(i, 1); return false; }
      return true;
    });
    const full = { ...explicit };
    for (const rid of orderableRegions(s, fid)) {
      if (!full[rid]) full[rid] = pool.shift();
    }
    s = applyAction(s, { type: 'submitOrders', faction: fid, orders: full }).state;
  }
  return applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' }).state;
}

// F1 (K+F at L01) attacks F3 infantry planted at L07.
function l07Scenario(defUnits = [['F3', 'infantry'], ['F3', 'infantry']]) {
  return stage({
    plants: { L07: defUnits },
    orders: { F1: { L01: M(0) } },
  });
}

export const tests = [

  { name: 'a contested march initiates combat: attackers lifted from the origin (Rules p.15, p.17)', fn() {
    const s = l07Scenario();
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    ok(r.combat, 'combat record exists');
    eq(r.combat.attacker, 'F1'); eq(r.combat.defender, 'F3'); eq(r.combat.region, 'L07');
    eq(r.combat.attackingUnits.length, 2);
    ok(r.unitsByRegion['L01'] === undefined, 'origin emptied into the combat');
    eq((r.unitsByRegion['L07'] || []).length, 2, 'defenders still stand');
  }},

  { name: 'adjacent support orders are called in initiative order; combatants may back themselves (Rules p.17–18)', fn() {
    // L07 borders L01/L04/L08/L09/L10/S03. F6's fill puts a defend at L08 —
    // give F6 an explicit support there instead, plus F1's own at L04.
    const s = stage({
      plants: { L07: [['F3', 'infantry'], ['F3', 'infantry']] },
      orders: { F1: { L01: M(0), L04: SU(0) }, F6: { L08: SU(0) } },
    });
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    const calls = r.pendingQueries.filter(q => q.type === 'declareSupport');
    eq(calls.map(c => [c.faction, c.region]), [['F1', 'L04'], ['F6', 'L08']], 'initiative order: F1 before F6');
  }},

  { name: 'support adds the area\'s full strength to the chosen side (Rules p.18)', fn() {
    const s = stage({
      plants: { L07: [['F3', 'infantry'], ['F3', 'infantry']] },
      orders: { F1: { L01: M(0), L04: SU(0) } },
    });
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    r = applyAction(r, { type: 'declareSupport', faction: 'F1', region: 'L04', side: 'attacker' }).state;
    // Combat resolved immediately (no blade holder among combatants):
    // atk = cavalry2+infantry1 + mod0 + support(footman1+mod0) = 4; def = 2.
    const resolved = r.log.find(e => e.event === 'combatResolved');
    eq(resolved.attacker, 4); eq(resolved.defender, 2); eq(resolved.victor, 'F1');
  }},

  { name: 'refused support contributes nothing (Rules p.18)', fn() {
    const s = stage({
      plants: { L07: [['F3', 'infantry'], ['F3', 'infantry'], ['F3', 'infantry']] },
      orders: { F1: { L01: M(0), L04: SU(0) } },
    });
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    r = applyAction(r, { type: 'declareSupport', faction: 'F1', region: 'L04', side: 'refuse' }).state;
    const resolved = r.log.find(e => e.event === 'combatResolved');
    eq(resolved.attacker, 3); eq(resolved.defender, 3);
  }},

  { name: 'ties go to the better Prowess position (Rules p.20)', fn() {
    // 3 vs 3 above: F1 sits 4th on prowess, F3 5th -> attacker takes the tie.
    const s = stage({
      plants: { L07: [['F3', 'infantry'], ['F3', 'infantry'], ['F3', 'infantry']] },
      orders: { F1: { L01: M(0), L04: SU(0) } },
    });
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    r = applyAction(r, { type: 'declareSupport', faction: 'F1', region: 'L04', side: 'refuse' }).state;
    const resolved = r.log.find(e => e.event === 'combatResolved');
    ok(resolved.tie === true, 'tie flagged');
    eq(resolved.victor, 'F1');
  }},

  { name: 'defeated defenders retreat routed to a legal area of their choice (Rules p.21)', fn() {
    const s = l07Scenario();
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    // atk 3 > def 2 -> retreat query. L07 borders: L01(origin, barred), L04(F1),
    // L08(F6), L09/L10 empty, S03 sea (barred for land units).
    const q = r.pendingQueries.find(x => x.type === 'retreat');
    eq(q.faction, 'F3'); eq(q.options, ['L09', 'L10']);
    r = applyAction(r, { type: 'retreat', faction: 'F3', to: 'L09' }).state;
    ok(r.unitsByRegion['L09'].every(u => u.routed === true), 'retreated units routed');
    eq(r.unitsByRegion['L09'].length, 2);
    eq(controllerOf(r, 'L07'), 'F1', 'attacker occupies');
    ok(r.combat === undefined, 'combat closed');
  }},

  { name: 'retreats may never move toward the attack or into hostile areas (Rules p.21)', fn() {
    const s = l07Scenario();
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    throws(() => applyAction(r, { type: 'retreat', faction: 'F3', to: 'L01' }), 'attack origin');
    throws(() => applyAction(r, { type: 'retreat', faction: 'F3', to: 'L08' }), 'enemy-held');
    throws(() => applyAction(r, { type: 'retreat', faction: 'F3', to: 'S03' }), 'land units to sea');
  }},

  { name: 'no legal retreat destroys the defenders (Rules p.21)', fn() {
    // Defender planted at L05: borders L04(F1), S02/S03 (sea) — and origin L04. Nowhere to go.
    const s = stage({
      plants: { L05: [['F3', 'infantry']] },
      orders: { F1: { L04: M(0) } },
    });
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L04',
      moves: [{ to: 'L05', units: { infantry: 1 } }] }).state;
    // atk 1 + F1 defends tie? def = 1; tie -> F1 wins on prowess; no retreat options.
    ok(r.log.some(e => e.event === 'defendersDestroyed'));
    eq(controllerOf(r, 'L05'), 'F1');
  }},

  { name: 'siege engines cannot retreat and are destroyed instead (Rules p.21)', fn() {
    const s = l07Scenario([['F3', 'infantry'], ['F3', 'siege_engine']]);
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    // def = infantry1 + siege0 (defending) = 1 < 3.
    r = applyAction(r, { type: 'retreat', faction: 'F3', to: 'L09' }).state;
    eq(r.unitsByRegion['L09'].length, 1, 'only the footman survives');
    ok(r.log.some(e => e.event === 'siegeDestroyedRetreating'));
  }},

  { name: 'a defeated attacker bounces home routed (Rules p.21)', fn() {
    const s = stage({
      plants: { L07: [['F3', 'cavalry'], ['F3', 'cavalry']] }, // def 4
      orders: { F1: { L01: M(0) } },
    });
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state; // atk 3
    eq((r.unitsByRegion['L01'] || []).length, 2, 'survivors back home');
    ok(r.unitsByRegion['L01'].every(u => u.routed), 'routed');
    eq(controllerOf(r, 'L07'), 'F3', 'defender holds');
    ok(r.combat === undefined);
  }},

  { name: 'garrisons defend their seat and are destroyed forever when it falls (Rules p.26)', fn() {
    // F5 storms Verdant Hall (L30: K+F=3, garrison 2) from L29 with 3 cavalry +1 march.
    const base = { plants: { L29: [['F5', 'cavalry'], ['F5', 'cavalry'], ['F5', 'cavalry']] } };
    const weak = stage({ ...base, orders: { F5: { L29: M(0) } } });
    const rw = applyAction(weak, { type: 'resolveMarch', faction: 'F5', region: 'L29',
      moves: [{ to: 'L30', units: { cavalry: 2 } }] }).state; // atk 4 vs def 5
    ok(rw.garrisons['L30'], 'garrison held');
    const home = rw.unitsByRegion['L29'] || [];
    eq(home.length, 3, 'all cavalry back home:');
    eq(home.filter(u => u.routed).length, 2, 'the two that marched are routed:');

    const strong = stage({ ...base, orders: { F5: { L29: M(1) } } });
    let rs = applyAction(strong, { type: 'resolveMarch', faction: 'F5', region: 'L29',
      moves: [{ to: 'L30', units: { cavalry: 3 } }] }).state; // atk 7 vs def 5
    const q = rs.pendingQueries.find(x => x.type === 'retreat');
    ok(q, 'F4 retreats');
    rs = applyAction(rs, { type: 'retreat', faction: 'F4', to: q.options[0] }).state;
    ok(rs.garrisons['L30'] === undefined, 'garrison permanently removed');
    eq(controllerOf(rs, 'L30'), 'F5');
  }},

  { name: 'the Blade holder in combat may spend it for +1, once per round (Rules p.11, p.20)', fn() {
    // F6 (blade holder) attacks a planted F2 footman at L06 from L08: 1 vs 1.
    const s = stage({
      plants: { L06: [['F2', 'infantry']] },
      orders: { F6: { L08: M(0) } },
    });
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F6', region: 'L08',
      moves: [{ to: 'L06', units: { infantry: 1 } }] }).state;
    const q = r.pendingQueries.find(x => x.type === 'useBlade');
    eq(q.faction, 'F6', 'holder is asked');
    r = applyAction(r, { type: 'useBlade', faction: 'F6', use: true }).state;
    const resolved = r.log.find(e => e.event === 'combatResolved');
    eq(resolved.attacker, 2); eq(resolved.victor, 'F6');
    ok(r.roundFlags.bladeUsed === true, 'spent for the round');
  }},

  { name: 'capturing a land area removes enemy ships from its port; victor may replace them (Rules p.25)', fn() {
    // F4 takes Goldport (L36: K+F=3 + garrison 2 = 5) from L34 with 3 cavalry (6); F2 ship sits in P04.
    const s = stage({
      plants: {
        L34: [['F4', 'cavalry'], ['F4', 'cavalry'], ['F4', 'cavalry'], ['F4', 'infantry']],
        P04: [['F2', 'warship']],
      },
      orders: { F4: { L34: M(0) } },
    }, 11);
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F4', region: 'L34',
      moves: [{ to: 'L36', units: { cavalry: 3 } }] }).state;
    let q = r.pendingQueries.find(x => x.type === 'retreat');
    eq(q.faction, 'F2');
    r = applyAction(r, { type: 'retreat', faction: 'F2', to: q.options[0] }).state;
    ok(r.log.some(e => e.event === 'portShipsRemoved'), 'enemy port ships removed');
    q = r.pendingQueries.find(x => x.type === 'replacePortShips');
    eq(q.max, 1);
    r = applyAction(r, { type: 'replacePortShips', faction: 'F4', count: 1 }).state;
    eq(r.unitsByRegion['P04'].filter(u => u.faction === 'F4' && u.type === 'warship').length, 1);
    ok(r.combat === undefined);
  }},

  { name: 'mid-combat state stays serializable (determinism contract)', fn() {
    const s = l07Scenario();
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    ok(r.combat, 'combat active');
    eq(deserialize(serialize(r)), r);
  }},

  { name: 'combatStrengths exposes the running totals for the UI (M1.e contract)', fn() {
    const s = l07Scenario();
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    eq(combatStrengths(r), { attacker: 3, defender: 2 });
  }},

  { name: 'legalRetreats is pure and inspectable (AI/M3 contract)', fn() {
    const s = l07Scenario();
    const r = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
    eq(legalRetreats(r, 'F3', 'L07', 'L01'), ['L09', 'L10']);
  }},

];
