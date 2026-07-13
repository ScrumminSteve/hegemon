// Golden tests — Mustering & directed retreats, M2.b (Rules p.9, p.22, p.25; FAQ v2.0).

import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { orderableRegions } from '../src/engine/planning.js';
import { eq, ok, throws } from './assert.js';

const M  = (mod = 0) => ({ type: 'march', mod, starred: mod === 1 });
const D  = (mod = 1) => ({ type: 'defend', mod, starred: mod === 2 });
const SU = (mod = 0) => ({ type: 'support', mod, starred: mod === 1 });
const CP = (starred = false) => ({ type: 'rally', mod: 0, starred });

function rig(s, tops) {
  for (const [deck, id] of Object.entries(tops)) {
    const d = s.eventDecks[deck].draw;
    d.splice(d.indexOf(id), 1);
    d.unshift(id);
  }
}
function runRound(s) {
  beginPlanning(s);
  const FILL = [D(1), D(1), SU(0), SU(0), CP(), CP(), M(-1), M(0)];
  for (const fid of s.factions) {
    const pool = FILL.slice();
    const orders = {};
    for (const rid of orderableRegions(s, fid)) orders[rid] = pool.shift();
    s = applyAction(s, { type: 'submitOrders', faction: fid, orders }).state;
  }
  s = applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' }).state;
  for (let i = 0; i < 40 && s.phase === 'action'; i++) {
    const q = s.pendingQueries.find(x => x.type === 'resolveOrder');
    if (!q) break;
    const rid = q.regions[0];
    if (q.step === 'rally') s = applyAction(s, { type: 'resolveRally', faction: q.faction, region: rid }).state;
    else if (q.step === 'raid') s = applyAction(s, { type: 'resolveRaid', faction: q.faction, region: rid, target: null }).state;
    else s = applyAction(s, { type: 'resolveMarch', faction: q.faction, region: rid, moves: [] }).state;
  }
  return s;
}
const act = (s, a) => applyAction(s, a).state;
const musterQ = s => s.pendingQueries.find(x => x.type === 'muster');

/** Drive the Westeros muster to the point where `fid` (or anyone) must decide. */
function toMuster(seed = 11) {
  let s = createGame(6, { seed });
  rig(s, { I: 'E1-muster', II: 'E2-nothing', III: 'E3-banRaid' });
  return runRound(s);
}
function passUntil(s, fid) {
  for (let i = 0; i < 30; i++) {
    const q = musterQ(s);
    if (!q) return s;
    if (!fid || q.faction === fid) return s;
    s = act(s, { type: 'muster', faction: q.faction, region: q.region, builds: [] });
  }
  return s;
}

export const tests = [

  { name: 'own adjacent support carries a neutral assault to the tie, and ties conquer (Rules p.26, p.28)', fn() {
    // The owner's board: London marches on the neutral 5 with 3 on the field
    // and an S+1 footman next door — 3 + 2 = 5 ties, and the token falls.
    let s = createGame(6, { seed: 7 });
    s.unitsByRegion['L18'] = [{ faction: 'F3', type: 'cavalry', routed: false },
                              { faction: 'F3', type: 'infantry', routed: false }];
    s.unitsByRegion['L20'] = [{ faction: 'F3', type: 'infantry', routed: false }];
    beginPlanning(s);
    const FILL = [D(1), D(1), SU(0), SU(0), CP(), CP(), M(-1), M(0)];
    for (const fid of s.factions) {
      const explicit = fid === 'F3' ? { L18: M(0), L20: SU(1) } : (fid === 'F4' ? { L30: M(-1) } : {});
      const pool = FILL.filter(o => !(fid === 'F3' && ((o.type === 'march' && o.mod === 0) || (o.type === 'support' && o.mod === 1)))
        && !(fid === 'F4' && o.type === 'march' && o.mod === -1));
      const orders = { ...explicit };
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = pool.shift();
      s = applyAction(s, { type: 'submitOrders', faction: fid, orders }).state;
    }
    s = act(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' });
    s = act(s, { type: 'resolveMarch', faction: 'F3', region: 'L18',
      moves: [{ to: 'L19', units: { cavalry: 1, infantry: 1 } }] });
    ok(s.log.some(e => e.event === 'neutralDestroyed' && e.region === 'L19'), 'the neutral 5 falls to 3+2');
    ok(s.log.some(e => e.event === 'neutralAssaultSupported' && e.support === 2));
    eq((s.unitsByRegion['L19'] || []).filter(u => u.faction === 'F3').length, 2, 'the column occupies');
  }},

  { name: 'without the support — or with only a RIVAL\'s support — the neutral holds (Rules p.28)', fn() {
    let s = createGame(6, { seed: 7 });
    s.unitsByRegion['L18'] = [{ faction: 'F3', type: 'cavalry', routed: false },
                              { faction: 'F3', type: 'infantry', routed: false }];
    // A rival's two footmen with support: would tie the 5 IF rival aid counted.
    s.unitsByRegion['L20'] = [{ faction: 'F4', type: 'infantry', routed: false },
                              { faction: 'F4', type: 'infantry', routed: false }];
    beginPlanning(s);
    const FILL = [D(1), D(1), SU(0), SU(0), CP(), CP(), M(-1), M(0)];
    for (const fid of s.factions) {
      const explicit = fid === 'F3' ? { L18: M(0) } : (fid === 'F4' ? { L20: SU(0), L30: M(-1) } : {});
      const pool = FILL.filter(o => !(fid === 'F3' && o.type === 'march' && o.mod === 0)
        && !(fid === 'F4' && o.type === 'march' && o.mod === -1));
      const orders = { ...explicit };
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = pool.shift();
      s = applyAction(s, { type: 'submitOrders', faction: fid, orders }).state;
    }
    s = act(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' });
    throws(() => act(s, { type: 'resolveMarch', faction: 'F3', region: 'L18',
      moves: [{ to: 'L19', units: { cavalry: 1, infantry: 1 } }] }),
      'a rival cannot lend arms without consent');
  }},


  { name: 'the muster card queues every controlled fortified area in initiative order (Rules p.9)', fn() {
    let s = toMuster();
    const seen = [];
    for (let i = 0; i < 30; i++) {
      const q = musterQ(s);
      if (!q) break;
      seen.push(q.faction);
      ok(q.points >= 1 && q.points <= 2, 'fort 1 / citadel 2');
      s = act(s, { type: 'muster', faction: q.faction, region: q.region, builds: [] });
    }
    ok(seen.length >= 6, 'every seat mustered at least its home');
    // Initiative order F3 first, and no faction appears before an earlier-initiative one still queued.
    eq(seen[0], 'F3');
    const order = s.tracks.initiative;
    for (let i = 1; i < seen.length; i++) {
      ok(order.indexOf(seen[i]) >= order.indexOf(seen[i - 1]), 'initiative-ordered queue');
    }
    eq(s.phase, 'planning', 'phase resumes when the queue drains');
  }},

  { name: 'builds are budgeted: infantry 1, cavalry 2 — overspending is rejected (Rules p.9)', fn() {
    let s = passUntil(toMuster(), 'F3');
    const q = musterQ(s);
    eq(q.points, 2, 'the seat is a citadel');
    throws(() => act(s, { type: 'muster', faction: 'F3', region: q.region,
      builds: [{ type: 'cavalry', to: q.region }, { type: 'infantry', to: q.region }] }),
      '3 points on a 2-point citadel');
    s = act(s, { type: 'muster', faction: 'F3', region: q.region, builds: [{ type: 'cavalry', to: q.region }] });
    ok(s.log.some(e => e.event === 'mustered' && e.faction === 'F3' && e.spent === 2));
  }},

  { name: 'one point upgrades a footman to a knight in the mustering area (Rules p.9)', fn() {
    let s = passUntil(toMuster(), 'F3');
    const q = musterQ(s);
    const cavBefore = (s.unitsByRegion[q.region] || []).filter(u => u.faction === 'F3' && u.type === 'cavalry').length;
    s = act(s, { type: 'muster', faction: 'F3', region: q.region,
      builds: [{ type: 'upgrade' }, { type: 'infantry', to: q.region }] });
    const units = (s.unitsByRegion[q.region] || []).filter(u => u.faction === 'F3');
    eq(units.filter(u => u.type === 'cavalry').length, cavBefore + 1, 'footman promoted');
  }},

  { name: 'warships muster into the harbor even under an enemy blockade (Rules p.25)', fn() {
    let s0 = createGame(6, { seed: 11 });
    rig(s0, { I: 'E1-muster', II: 'E2-nothing', III: 'E3-banRaid' });
    s0.unitsByRegion['S10'] = [{ faction: 'F6', type: 'warship', routed: false }]; // blockade the Golden Sound
    let s = passUntil(runRound(s0), 'F2');
    const q = musterQ(s);
    // Into the blockaded sea itself: forbidden.
    throws(() => act(s, { type: 'muster', faction: 'F2', region: q.region,
      builds: [{ type: 'warship', to: 'S10' }] }), 'enemy-held sea');
    // Into the harbor: the defining power of ports.
    s = act(s, { type: 'muster', faction: 'F2', region: q.region, builds: [{ type: 'warship', to: 'P04' }] });
    eq((s.unitsByRegion['P04'] || []).filter(u => u.faction === 'F2').length, 2);
  }},

  { name: 'the harbor cap holds during mustering: never a fourth ship (Rules p.25)', fn() {
    let s0 = createGame(6, { seed: 11 });
    rig(s0, { I: 'E1-muster', II: 'E2-nothing', III: 'E3-banRaid' });
    s0.unitsByRegion['P04'].push({ faction: 'F2', type: 'warship', routed: false },
                                 { faction: 'F2', type: 'warship', routed: false });
    let s = passUntil(runRound(s0), 'F2');
    const q = musterQ(s);
    throws(() => act(s, { type: 'muster', faction: 'F2', region: q.region,
      builds: [{ type: 'warship', to: 'P04' }] }), 'fourth ship');
  }},

  { name: 'the unit pool is a hard ceiling (Rules p.9)', fn() {
    let s0 = createGame(6, { seed: 11 });
    rig(s0, { I: 'E1-muster', II: 'E2-nothing', III: 'E3-banRaid' });
    // F3 already fields 5 knights across legal armies: the pool (5) is full.
    s0.unitsByRegion['L20'] = [['F3','cavalry'],['F3','cavalry']].map(([f,t]) => ({ faction: f, type: t, routed: false }));
    s0.unitsByRegion['L21'] = [['F3','cavalry'],['F3','cavalry']].map(([f,t]) => ({ faction: f, type: t, routed: false }));
    let s = passUntil(runRound(s0), 'F3');
    const q = musterQ(s);
    throws(() => act(s, { type: 'muster', faction: 'F3', region: q.region,
      builds: [{ type: 'upgrade' }] }), 'sixth knight');
  }},

  { name: 'mustering may never break supply, and rejection is atomic (Rules p.9)', fn() {
    let s = passUntil(toMuster(), 'F1');
    const q = musterQ(s);           // F1's seat, supply 1 → largest army 3
    const before = (s.unitsByRegion[q.region] || []).filter(u => u.faction === 'F1').length;
    eq(before, 2, 'seat garrison force');
    throws(() => act(s, { type: 'muster', faction: 'F1', region: q.region,
      builds: [{ type: 'infantry', to: q.region }, { type: 'infantry', to: q.region }] }),
      'a 4-strong army at supply 1');
    eq((s.unitsByRegion[q.region] || []).filter(u => u.faction === 'F1').length, before, 'atomic rollback');
    ok(musterQ(s) && musterQ(s).faction === 'F1', 'the decision is still owed');
    s = act(s, { type: 'muster', faction: 'F1', region: q.region, builds: [{ type: 'infantry', to: q.region }] });
    eq((s.unitsByRegion[q.region] || []).filter(u => u.faction === 'F1').length, 3, 'a legal third unit landed');
  }},

  { name: 'the sovereign-choice card can decree a muster through the same machinery', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-choice', II: 'E2-nothing', III: 'E3-banRaid' });
    s = runRound(s);
    s = act(s, { type: 'eventChoice', faction: 'F3', option: 'muster' });
    ok(musterQ(s), 'the muster queue opened from the decree');
  }},

  { name: 'a Robb-class defensive victory directs the beaten attacker, ship bridges included (FAQ v2.0)', fn() {
    let s = createGame(6, { seed: 7 });
    s.unitsByRegion['L06'] = [{ faction: 'F1', type: 'infantry', routed: false },
                              { faction: 'F1', type: 'infantry', routed: false }];
    s.unitsByRegion['L08'] = [{ faction: 'F6', type: 'cavalry', routed: false },
                              { faction: 'F6', type: 'cavalry', routed: false }];
    beginPlanning(s);
    const FILL = [D(1), D(1), SU(0), SU(0), CP(), CP(), M(-1), M(0)];
    for (const fid of s.factions) {
      // F4 keeps an unresolved march so round 1 stays open past the retreat.
      const explicit = fid === 'F6' ? { L08: M(0) } : (fid === 'F4' ? { L30: M(-1) } : {});
      const pool = FILL.filter(o => !(fid === 'F6' && o.type === 'march' && o.mod === 0)
        && !(fid === 'F4' && o.type === 'march' && o.mod === -1));
      const orders = { ...explicit };
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = pool.shift();
      s = applyAction(s, { type: 'submitOrders', faction: fid, orders }).state;
    }
    s = act(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' });
    s = act(s, { type: 'resolveMarch', faction: 'F6', region: 'L08',
      moves: [{ to: 'L06', units: { cavalry: 2 } }] });
    for (let i = 0; i < 8; i++) {
      const sq = s.pendingQueries.find(x => x.type === 'declareSupport');
      if (!sq) break;
      s = act(s, { type: 'declareSupport', faction: sq.faction, region: sq.region, side: 'refuse' });
    }
    // Hand surgery: F1 defends with the retreat-director; F6 fights at strength 0.
    s.pendingQueries.find(x => x.type === 'chooseLeaderCard' && x.faction === 'F1').hand = ['F1-3'];
    s.leaderHands.F1 = ['F1-3'];
    s = act(s, { type: 'chooseLeaderCard', faction: 'F1', card: 'F1-3' });
    s.pendingQueries.find(x => x.type === 'chooseLeaderCard' && x.faction === 'F6').hand = ['F6-0'];
    s.leaderHands.F6 = ['F6-0'];
    s = act(s, { type: 'chooseLeaderCard', faction: 'F6', card: 'F6-0' });
    if (s.pendingQueries.some(x => x.type === 'useBlade')) s = act(s, { type: 'useBlade', faction: 'F6', use: false });
    const rq = s.pendingQueries.find(x => x.type === 'retreat' && x.attackerBounce);
    ok(rq, 'the victor directs the retreat');
    eq(rq.faction, 'F1', 'the DEFENDER chooses');
    ok(rq.options.includes('L08'), 'the origin remains offered');
    ok(rq.options.includes('L37'), 'and the ship-bridged home across S11');
    s = act(s, { type: 'retreat', faction: 'F1', to: 'L37' });
    const exiled = (s.unitsByRegion['L37'] || []).filter(u => u.faction === 'F6' && u.type === 'cavalry' && u.routed);
    eq(exiled.length, 2, 'routed to the chosen exile (beside the home garrison)');
    ok(!s.combat, 'combat closed');
  }},

];
