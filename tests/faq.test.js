// Golden tests — FAQ v2.0 errata & rulings compliance.

import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { orderableRegions } from '../src/engine/planning.js';
import { eq, ok, throws } from './assert.js';
import { cpAllowedAt } from '../src/engine/planning.js';

const dealOrder = (pool, rid) => { // m3d8: rally never at sea (Rules p.13)
  const i = pool.findIndex(o => cpAllowedAt(rid) || o.type !== 'rally');
  return pool.splice(i === -1 ? 0 : i, 1)[0];
};


const M  = (mod = 0) => ({ type: 'march', mod, starred: mod === 1 });
const D  = (mod = 1) => ({ type: 'defend', mod, starred: mod === 2 });
const SU = (mod = 0) => ({ type: 'support', mod, starred: mod === 1 });
const CP = (starred = false) => ({ type: 'rally', mod: 0, starred });

const FILL = [CP(), CP(), D(1), D(1), SU(0), SU(0), M(-1), M(0)];
function stage({ plants = {}, strip = [], orders = {}, mutate, ruleset }, seed = 7) {
  let s = createGame(6, { seed, ruleset });
  for (const rid of strip) delete s.unitsByRegion[rid];
  for (const [rid, units] of Object.entries(plants)) {
    s.unitsByRegion[rid] = units.map(([faction, type]) => ({ faction, type, routed: false }));
  }
  if (mutate) mutate(s);
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
    for (const rid of orderableRegions(s, fid)) if (!full[rid]) full[rid] = dealOrder(pool, rid);
    s = applyAction(s, { type: 'submitOrders', faction: fid, orders: full }).state;
  }
  return applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' }).state;
}
const act  = (s, a) => applyAction(s, a).state;
const pick = (s, fid, card) => act(s, { type: 'chooseLeaderCard', faction: fid, card });
const NO_CARDS = { leaderCards: false };

export const tests = [

  { name: 'a defeated fleet may retreat into its own harbor, capacity permitting (Rules p.25)', fn() {
    const s0 = stage({
      plants: {
        S10: [['F2', 'warship']],
        S09: [['F6', 'warship'], ['F6', 'warship']],
      },
      orders: { F6: { S09: M(0) } },
      ruleset: NO_CARDS,
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F6', region: 'S09',
      moves: [{ to: 'S10', units: { warship: 2 } }] });
    s = act(s, { type: 'useBlade', faction: 'F6', use: false });
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    ok(rq, 'defender retreats');
    ok(rq.options.includes('P04'), 'the home harbor is a legal shelter');
    s = act(s, { type: 'retreat', faction: 'F2', to: 'P04' });
    const inPort = (s.unitsByRegion['P04'] || []).filter(u => u.faction === 'F2');
    eq(inPort.length, 2, 'errata ship + refugee');
    ok(inPort.every(u => u.type === 'warship'));
  }},


  { name: 'errata: F2 begins with a warship in its home harbor (FAQ v2.0 setup errata)', fn() {
    const g = createGame(6);
    const port = (g.unitsByRegion['P04'] || []).filter(u => u.faction === 'F2' && u.type === 'warship');
    eq(port.length, 1);
  }},

  { name: 'siege engines can never be chosen as icon casualties (FAQ v2.0)', fn() {
    const s0 = stage({
      plants: { L07: [['F3', 'cavalry'], ['F3', 'siege_engine']] },
      orders: { F1: { L01: M(0) } },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] });
    s = pick(s, 'F1', 'F1-4');            // two swords
    s = pick(s, 'F3', 'F3-1b');           // no forts: 2 casualties owed
    const cas = s.log.find(e => e.event === 'casualtiesTaken');
    ok(!('siege_engine' in cas.units), 'siege exempt from icon casualties');
    eq(cas.units, { cavalry: 1 });        // the only eligible unit
  }},

  { name: 'a defeated defender may retreat via friendly ship transport (FAQ v2.0)', fn() {
    const s0 = stage({
      plants: {
        L06: [['F1', 'infantry']],
        L08: [['F6', 'cavalry'], ['F6', 'cavalry']],
        S01: [['F1', 'warship']],
      },
      orders: { F6: { L08: M(0) } },
      ruleset: NO_CARDS,
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F6', region: 'L08',
      moves: [{ to: 'L06', units: { cavalry: 2 } }] });
    s = act(s, { type: 'useBlade', faction: 'F6', use: false });
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    ok(rq, 'defender retreats');
    ok(rq.options.includes('L03'), 'reachable only across the F1 warship bridge in S01 (not adjacent to L06)');
  }},

  { name: 'a combatant cannot support against themselves (FAQ v2.0)', fn() {
    const s0 = stage({
      plants: { L07: [['F3', 'infantry']], S03: [['F3', 'warship']] },
      orders: { F1: { L01: M(0) }, F3: { S03: SU(0) } },
      ruleset: NO_CARDS,
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] });
    ok(s.pendingQueries.some(x => x.type === 'declareSupport' && x.faction === 'F3'));
    throws(() => act(s, { type: 'declareSupport', faction: 'F3', region: 'S03', side: 'attacker' }),
      'defender backing its own attacker');
    s = act(s, { type: 'declareSupport', faction: 'F3', region: 'S03', side: 'defender' });
    ok(s.log.some(e => e.event === 'combatResolved'));
  }},

  { name: 'combat cleanup sweeps order tokens from unit-less areas (FAQ v2.0 errata)', fn() {
    let s = stage({
      plants: { L07: [['F3', 'infantry']] },
      orders: { F1: { L01: M(0) } },
    });
    s = act(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] });
    // Mid-combat, F5's ordered garrison at L27 evaporates (synthetic).
    ok(s.ordersByRegion['L27'], 'F5 has an order at L27');
    delete s.unitsByRegion['L27'];
    s = pick(s, 'F1', 'F1-4');
    s = pick(s, 'F3', 'F3-1b');           // F1 wins; both swords land; combat closes
    ok(!s.ordersByRegion['L27'], 'orphaned order swept at cleanup');
    ok(s.log.some(e => e.event === 'orderSwept' && e.region === 'L27'));
  }},

  { name: 'forcing out the 7th card via an after-combat discard recycles the hand (FAQ v2.0)', fn() {
    let s = stage({
      plants: { L07: [['F3', 'infantry'], ['F3', 'infantry']] },
      orders: { F1: { L01: M(0) } },
      mutate: g => {
        g.leaderDiscards.F1 = g.leaderHands.F1.filter(x => x !== 'F1-4' && x !== 'F1-3');
        g.leaderHands.F1 = ['F1-3', 'F1-4'];
      },
    });
    s = act(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] });
    s.pendingQueries.find(x => x.type === 'chooseLeaderCard' && x.faction === 'F1').hand = ['F1-3', 'F1-4'];
    s = pick(s, 'F1', 'F1-4');            // 6th card played
    s = pick(s, 'F3', 'F3-0');            // Patchface-class arms the after-combat window
    const q = s.pendingQueries.find(x => x.type === 'cardTarget' && x.ability === 'afterCombatDiscardOpponentCard');
    eq(q.options, ['F1-3'], 'only the 7th card remains in hand');
    s = act(s, { type: 'cardTarget', faction: 'F3', target: 'F1-3' });
    // The forced discard counts as the last card played: it stays down, six return.
    ok(s.log.some(e => e.event === 'leaderHandRecycled' && e.faction === 'F1'));
    eq(s.leaderDiscards.F1, ['F1-3']);
    eq(s.leaderHands.F1.length, 6);
    ok(!s.leaderHands.F1.includes('F1-3'));
  }},

];
