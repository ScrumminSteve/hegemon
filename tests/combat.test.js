// Golden tests — M1.d: Combat (Rules p.17–21, p.25–26).

import { createGame, serialize, deserialize, controllerOf } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { combatStrengths, legalRetreats } from '../src/engine/combat.js';
import { legalActions } from '../src/engine/legal.js';
import { orderableRegions } from '../src/engine/planning.js';
import { eq, ok, throws } from './assert.js';
import { PORTS, EDGES, buildAdjacency } from '../src/data/map.js';

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

/** Benignly resolve preceding orders until fid's march at rid is queued. */
function driveToMarch(s, fid, rid) {
  for (let i = 0; i < 40; i++) {
    const q = s.pendingQueries.find(x => x.type === 'resolveOrder');
    if (!q) break;
    if (q.step === 'march' && q.faction === fid && q.regions.includes(rid)) return s;
    const r0 = q.regions[0];
    if (q.step === 'rally') s = applyAction(s, { type: 'resolveRally', faction: q.faction, region: r0 }).state;
    else if (q.step === 'raid') s = applyAction(s, { type: 'resolveRaid', faction: q.faction, region: r0, target: null }).state;
    else s = applyAction(s, { type: 'resolveMarch', faction: q.faction, region: r0, moves: [] }).state;
  }
  throw new Error(`${fid}'s march at ${rid} never came up`);
}

// F1 (K+F at L01) attacks F3 infantry planted at L07.
function l07Scenario(defUnits = [['F3', 'infantry'], ['F3', 'infantry']]) {
  return stage({
    plants: { L07: defUnits },
    orders: { F1: { L01: M(0) } },
  });
}

export const tests = [

  // ---------- harbors in the adjacency web (owner finding, Jul 2026) ----------
  { name: 'adjacency is symmetric: every sea and land knows its harbor (the one-way version hid all sea->port marches)', fn() {
    const adj = buildAdjacency();
    for (const p of PORTS) {
      ok(adj[p.seaId].has(p.id), `${p.seaId} lists ${p.id}`);
      ok(adj[p.landId].has(p.id), `${p.landId} lists ${p.id}`);
    }
    ok(EDGES.some(([a, b]) => (a === 'S07' && b === 'L35') || (a === 'L35' && b === 'S07')),
      'Bordeaux borders The Mediterranean (owner map ruling)');
  }},

  { name: 'ships may march from the sea into their own harbor (Rules p.25)', fn() {
    let s = stage({
      plants: {
        L21: [['F3', 'infantry']],                    // owns the harbor town
        S04: [['F3', 'warship'], ['F3', 'warship']],
      },
      orders: { F3: { S04: M(0) } },
    });
    s = driveToMarch(s, 'F3', 'S04');
    s = applyAction(s, { type: 'resolveMarch', faction: 'F3', region: 'S04',
      moves: [{ to: 'P07', units: { warship: 2 } }] }).state;
    eq((s.unitsByRegion['P07'] || []).filter(u => u.faction === 'F3').length, 2, 'both ships moor');
    ok(!s.combat, 'entering your own harbor is never a battle');
  }},

  { name: 'the harbor cap holds on the march too: never a fourth ship (Rules p.25)', fn() {
    let s = stage({
      plants: {
        L21: [['F3', 'infantry']],
        P07: [['F3', 'warship'], ['F3', 'warship']],  // two already moored
        S04: [['F3', 'warship'], ['F3', 'warship']],
      },
      orders: { F3: { S04: M(0) } },
    });
    s = driveToMarch(s, 'F3', 'S04');
    throws(() => applyAction(s, { type: 'resolveMarch', faction: 'F3', region: 'S04',
      moves: [{ to: 'P07', units: { warship: 2 } }] }), 'cannot moor');
    s = applyAction(s, { type: 'resolveMarch', faction: 'F3', region: 'S04',
      moves: [{ to: 'P07', units: { warship: 1 } }] }).state;
    eq((s.unitsByRegion['P07'] || []).length, 3, 'exactly to the cap');
  }},

  // ---------- retreat-to-port supply & order hygiene (owner P1 repro, Jul 2026) ----------
  { name: 'a retreat that breaks supply sheds the ROUTED arrivals — never the healthy harbor garrison or its order (Rules p.21; owner repro)', fn() {
    let s = stage({
      plants: {
        L21: [['F3', 'infantry']],                       // owns the harbor town
        P07: [['F3', 'warship']],                        // the healthy occupant
        S04: [['F3', 'warship'], ['F3', 'warship']],     // the doomed defenders
        S12: [['F1', 'warship'], ['F1', 'warship'], ['F1', 'warship']],
      },
      orders: { F1: { S12: M(0) }, F3: { P07: D(1) } },  // the port bears an order
    });
    s.supply.F3 = 0;                                     // a 3-ship port army cannot stand
    s = driveToMarch(s, 'F1', 'S12');
    s = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'S12',
      moves: [{ to: 'S04', units: { warship: 3 } }] }).state;
    const q = s.pendingQueries.find(x => x.type === 'retreat' && x.faction === 'F3');
    ok(q && q.options.includes('P07'), 'the whole squadron fits the harbor (1+2 = cap)');
    s = applyAction(s, { type: 'retreat', faction: 'F3', to: 'P07' }).state;
    const shed = s.log.filter(e => e.event === 'destroyedForSupply' && e.faction === 'F3');
    eq(shed.length, 1, 'one ship pays the supply toll');
    ok(shed[0].routed === true && shed[0].unit === 'warship', 'and it is a routed arrival');
    const harbor = s.unitsByRegion['P07'].filter(u => u.faction === 'F3');
    eq(harbor.length, 2);
    ok(harbor.some(u => !u.routed), 'the healthy occupant still stands');
    ok(s.ordersByRegion['P07'] && s.ordersByRegion['P07'].type === 'defend', 'its order survives with it');
  }},

  { name: 'a harbor left with only routed wrecks cannot hold an order — it is swept at combat end (FAQ v2.0; owner repro)', fn() {
    let s = stage({
      plants: {
        L21: [['F3', 'infantry']],
        P07: [['F3', 'warship']],
        S04: [['F3', 'warship'], ['F3', 'warship']],
        S12: [['F1', 'warship'], ['F1', 'warship'], ['F1', 'warship']],
      },
      orders: { F1: { S12: M(0) }, F3: { P07: D(1) } },
    });
    s.unitsByRegion['P07'][0].routed = true;             // the occupant is already a wreck
    s.supply.F3 = 0;
    s = driveToMarch(s, 'F1', 'S12');
    s = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'S12',
      moves: [{ to: 'S04', units: { warship: 3 } }] }).state;
    s = applyAction(s, { type: 'retreat', faction: 'F3', to: 'P07' }).state;
    ok(s.unitsByRegion['P07'].every(u => u.routed), 'only wrecks remain in the harbor');
    ok(!s.ordersByRegion['P07'], 'routed units cannot execute orders: the order is gone');
    ok(s.log.some(e => e.event === 'orderSwept' && e.region === 'P07'), 'and the Chronicle says so');
  }},

  { name: 'a port is no retreat when the whole squadron cannot fit the 3-ship cap (Rules p.25)', fn() {
    let s = stage({
      plants: {
        L21: [['F3', 'infantry']],
        P07: [['F3', 'warship'], ['F3', 'warship']],     // two already moored
        S04: [['F3', 'warship'], ['F3', 'warship']],     // two would arrive: 4 > 3
        S12: [['F1', 'warship'], ['F1', 'warship'], ['F1', 'warship']],
      },
      orders: { F1: { S12: M(0) } },
    });
    s = driveToMarch(s, 'F1', 'S12');
    s = applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'S12',
      moves: [{ to: 'S04', units: { warship: 3 } }] }).state;
    const q = s.pendingQueries.find(x => x.type === 'retreat' && x.faction === 'F3');
    ok(q, 'a retreat is owed');
    ok(!q.options.includes('P07'), 'the crowded harbor is not among the options');
  }},

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

// --- P1 (owner screenshot, Jul 2026): support terrain gate (Rules p.18) -----
// Land never backs a sea battle; dockbound ships (ports) never back a land
// battle. Sea backs both; ports back only their connected sea.

tests.push(
  { name: 'TERRAIN GATE: a sea battle calls sea and port supporters, never adjacent land (Rules p.18; P1)', fn() {
    let s = stage({
      strip: ['S02', 'S03', 'S04', 'L04', 'L05', 'P02'],
      plants: {
        S03: [['F1', 'warship']],                 // defender fleet
        S02: [['F2', 'warship'], ['F2', 'warship']], // attacker fleet
        S04: [['F3', 'warship']],                 // sea supporter — eligible
        P02: [['F5', 'warship']],                 // port supporter — eligible (its sea)
        L04: [['F5', 'infantry']],                // F5 owns the land, so the dock is F5's
        L05: [['F4', 'infantry']],                // land supporter — NOT eligible
      },
      orders: {
        F2: { S02: M(0) },
        F3: { S04: SU(0) },
        F4: { L05: SU(0) },
        F5: { P02: SU(0) },
      },
    });
    s = driveToMarch(s, 'F2', 'S02');
    s = applyAction(s, { type: 'resolveMarch', faction: 'F2', region: 'S02', moves: [{ to: 'S03', units: { warship: 2 } }] }).state;
    ok(s.combat && s.combat.region === 'S03', 'sea battle began at S03');
    const calls = s.pendingQueries.filter(q => q.type === 'declareSupport').map(q => q.region).sort();
    eq(JSON.stringify(calls), JSON.stringify(['P02', 'S04']),
      'exactly the fleet supporters are called; L04/L05 land support orders stay silent');
  }},

  { name: 'TERRAIN GATE: a land battle calls land and sea supporters, never the port (Rules p.18; P1)', fn() {
    let s = stage({
      strip: ['S03', 'L04', 'L05', 'L07', 'P02'],
      plants: {
        L04: [['F1', 'infantry']],                // defender — who also owns the dock
        L05: [['F2', 'infantry'], ['F2', 'infantry']], // attacker
        L07: [['F3', 'infantry']],                // land supporter — eligible
        S03: [['F4', 'warship']],                 // sea supporter — eligible (shore bombardment)
        P02: [['F1', 'warship']],                 // the DEFENDER'S OWN dock — still not eligible
      },
      orders: {
        F2: { L05: M(0) },
        F3: { L07: SU(0) },
        F4: { S03: SU(0) },
        F1: { P02: SU(0) },
      },
    });
    s = driveToMarch(s, 'F2', 'L05');
    s = applyAction(s, { type: 'resolveMarch', faction: 'F2', region: 'L05', moves: [{ to: 'L04', units: { infantry: 2 } }] }).state;
    ok(s.combat && s.combat.region === 'L04', 'land battle began at L04');
    const calls = s.pendingQueries.filter(q => q.type === 'declareSupport').map(q => q.region).sort();
    eq(JSON.stringify(calls), JSON.stringify(['L07', 'S03']),
      'land and sea supporters are called; even the defender\'s own P02 dock stays out of the fight');
  }},
);

tests.push(
  { name: 'SUPPLY GATE: refitted port ships are new units — a refit that fields an illegal army is refused (Rules p.8; M3.d eval fuzz, seed 7016)', fn() {
    // F4 at supply 1 (limits [3,2]): post-march the 3-cavalry stack at L36
    // is army #1 (size 3) and the parked pair at L02 is army #2 (size 2) —
    // exactly at cap. Two enemy ships sit in P04 — refitting BOTH would
    // stand up a third army; refitting ONE ship (not an army) is fine.
    const s = stage({
      strip: ['L30', 'L33', 'S08'], // F4's default stacks — the rig owns the count
      plants: {
        L34: [['F4', 'cavalry'], ['F4', 'cavalry'], ['F4', 'cavalry'], ['F4', 'infantry']],
        L02: [['F4', 'infantry'], ['F4', 'infantry']],
        P04: [['F2', 'warship'], ['F2', 'warship']],
      },
      orders: { F4: { L34: M(0) } },
    }, 11);
    s.supply.F4 = 1;
    let r = applyAction(s, { type: 'resolveMarch', faction: 'F4', region: 'L34',
      moves: [{ to: 'L36', units: { cavalry: 3 } }] }).state;
    const rq = r.pendingQueries.find(x => x.type === 'retreat');
    r = applyAction(r, { type: 'retreat', faction: 'F2', to: rq.options[0] }).state;
    const q = r.pendingQueries.find(x => x.type === 'replacePortShips');
    eq(q.max, 2, 'two ships were burned, two may be refit — physically');
    // The menu the engine offers must already respect the gate (M3.a contract):
    const menu = legalActions(r, q);
    const counts = menu.map(a => a.count).sort();
    eq(JSON.stringify(counts), JSON.stringify([0, 1]), 'count 2 is pruned from the menu; the menu is not empty');
    throws(() => applyAction(structuredClone(r), { type: 'replacePortShips', faction: 'F4', count: 2 }),
      /supply|armies/, 'the two-ship refit is refused loudly');
    r = applyAction(r, { type: 'replacePortShips', faction: 'F4', count: 1 }).state;
    eq(r.unitsByRegion['P04'].filter(u => u.faction === 'F4').length, 1, 'a single-ship refit sails');
  }},
);

// --- M3.d.2 (owner insight, Jul 2026): the march menu must offer transports --
// The validator has accepted ship-transported marches since M1; the M3.a menu
// never offered them, so no bot ever shipped an army — structurally strangling
// island-capital factions (the seat-bias study's F3/F6 signal).

tests.push(
  { name: 'TRANSPORT MENU: an island army with a friendly warship chain is OFFERED sea-borne marches, and they apply (Rules p.15; M3.d.2)', fn() {
    const s = stage({
      strip: ['L22', 'S04'],
      plants: {
        L22: [['F3', 'infantry'], ['F3', 'infantry']], // an island army
        S04: [['F3', 'warship']],                      // the ferry
      },
      orders: { F3: { L22: M(0) } },
    }, 13);
    const r = driveToMarch(s, 'F3', 'L22');
    const q = r.pendingQueries.find(x => x.type === 'resolveOrder' && x.step === 'march' && x.faction === 'F3');
    const menu = legalActions(r, q);
    const dests = new Set(menu.flatMap(a => a.moves.map(mv => mv.to)));
    const transported = [...dests].filter(d => d !== 'S04' && d !== 'P08' && d.startsWith('L'));
    ok(transported.length > 0, `sea-borne land destinations are on the menu (got: ${[...dests].join(', ')})`);
    const pick = menu.find(a => a.moves.length === 1 && transported.includes(a.moves[0].to));
    const applied = applyAction(structuredClone(r), pick).state;
    ok((applied.unitsByRegion[pick.moves[0].to] || []).some(u => u.faction === 'F3'),
      `the army actually landed at ${pick.moves[0].to}`);
  }},
);

tests.push(
  { name: 'SUPPLY AT DECLARATION: an attack whose victory would field an illegal army is refused at march time; the menu still offers alternatives (Rules p.8, FAQ; seed 99893)', fn() {
    // F4 at supply 1 (limits [3,2]): a parked 3-stack is army #1 at its cap.
    // Attacking L36 with 3 cavalry would, on full-survival victory, stand up
    // a SECOND size-3 army — illegal. The march must die at declaration,
    // never in the defender's retreat.
    const s = stage({
      strip: ['L30', 'L33', 'S08'],
      plants: {
        L30: [['F4', 'infantry'], ['F4', 'infantry'], ['F4', 'infantry']],
        L34: [['F4', 'cavalry'], ['F4', 'cavalry'], ['F4', 'cavalry']],
      },
      orders: { F4: { L34: M(0) } },
    }, 11);
    s.supply.F4 = 1;
    const r = driveToMarch(s, 'F4', 'L34');
    throws(() => applyAction(structuredClone(r), { type: 'resolveMarch', faction: 'F4', region: 'L34',
      moves: [{ to: 'L36', units: { cavalry: 3 } }] }),
      /supply|army/, 'the doomed attack is refused before combat exists');
    const q = r.pendingQueries.find(x => x.type === 'resolveOrder' && x.step === 'march' && x.faction === 'F4');
    const menu = legalActions(r, q);
    ok(menu.length > 0, 'the menu survives: stand-down and smaller moves remain');
    ok(!menu.some(a => a.moves.some(mv => mv.to === 'L36' && (mv.units.cavalry || 0) === 3)),
      'no menu item offers the illegal full-stack assault');
  }},
);
