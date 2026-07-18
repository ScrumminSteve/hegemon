// Golden tests — Mustering & directed retreats, M2.b (Rules p.9, p.22, p.25; FAQ v2.0).

import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { orderableRegions } from '../src/engine/planning.js';
import { eq, ok, throws } from './assert.js';
import { combatStrengths } from '../src/engine/combat.js';
import { cpAllowedAt } from '../src/engine/planning.js';

const dealOrder = (pool, rid) => { // m3d8: rally never at sea (Rules p.13)
  const i = pool.findIndex(o => cpAllowedAt(rid) || o.type !== 'rally');
  return pool.splice(i === -1 ? 0 : i, 1)[0];
};


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
    for (const rid of orderableRegions(s, fid)) orders[rid] = dealOrder(pool, rid);
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

  { name: 'a split march reinforces support against a NEUTRAL force too — the prong lands before the assault tally (Rules p.28; owner repro Jul 2026)', fn() {
    // Owner repro (m2e campaign): march from L19 sends cavalry into own L18
    // (bearing S+1) and infantry into a neutral force at L17. The assault
    // tally must count the arriving cavalry: 1 (inf) + support (1 order +
    // 1 footman + 2 arriving cav) = 5 vs force 5 — legal only with the prong.
    let s = createGame(6, { seed: 7 });
    s.unitsByRegion['L19'] = [{ faction: 'F3', type: 'cavalry', routed: false },
                              { faction: 'F3', type: 'infantry', routed: false }];
    s.unitsByRegion['L18'] = [{ faction: 'F3', type: 'infantry', routed: false }];
    delete s.unitsByRegion['L17'];
    s.neutrals['L17'] = { strength: 5 };
    beginPlanning(s);
    const FILL = [D(1), D(1), SU(0), SU(0), CP(), CP(), M(-1), M(0)];
    for (const fid of s.factions) {
      const explicit = fid === 'F3' ? { L19: M(0), L18: SU(1) } : {};
      const pool = FILL.filter(o => !(fid === 'F3' && ((o.type === 'march' && o.mod === 0) || (o.type === 'support' && o.mod === 1))));
      const orders = { ...explicit };
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = dealOrder(pool, rid);
      s = applyAction(s, { type: 'submitOrders', faction: fid, orders }).state;
    }
    s = act(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' });
    // Without the reinforcement prong the assault is short (1+2 < 5): rejected.
    throws(() => act(s, { type: 'resolveMarch', faction: 'F3', region: 'L19', moves: [
      { to: 'L17', units: { infantry: 1 } },
    ] }), 'march may not be attempted');
    // With the prong the same order succeeds — regardless of prong order in the array.
    s = act(s, { type: 'resolveMarch', faction: 'F3', region: 'L19', moves: [
      { to: 'L17', units: { infantry: 1 } },
      { to: 'L18', units: { cavalry: 1 } },
    ] });
    ok(s.neutrals['L17'] === undefined, 'the neutral force falls');
    const ev = s.log.find(e => e.event === 'neutralAssaultSupported');
    eq(ev.support, 4, 'order 1 + standing footman 1 + arriving cavalry 2');
    eq((s.unitsByRegion['L18'] || []).filter(u => u.faction === 'F3').length, 2, 'prong landed');
    eq((s.unitsByRegion['L17'] || []).filter(u => u.faction === 'F3').length, 1, 'assault landed');
  }},

  { name: 'a split march reinforces its own supporting territory in the SAME battle (FAQ: non-combat prongs first)', fn() {
    // Owner repro: one march, two prongs — cav+inf into the enemy at L17,
    // one inf into own L18 which bears the S+1 backing that very battle.
    let s = createGame(6, { seed: 7 });
    s.supply.F3 = 4; // headroom: since m3d4 combat marches supply-check at
                     // declaration (full-survival) — this rig's subject is
                     // prong ordering, and defaults + two prongs = 4 armies.
    s.unitsByRegion['L19'] = [{ faction: 'F3', type: 'cavalry', routed: false },
                              { faction: 'F3', type: 'infantry', routed: false },
                              { faction: 'F3', type: 'infantry', routed: false }];
    s.unitsByRegion['L18'] = [{ faction: 'F3', type: 'infantry', routed: false }];
    s.unitsByRegion['L17'] = [{ faction: 'F4', type: 'infantry', routed: false }];
    beginPlanning(s);
    const FILL = [D(1), D(1), SU(0), SU(0), CP(), CP(), M(-1), M(0)];
    for (const fid of s.factions) {
      const explicit = fid === 'F3' ? { L19: M(0), L18: SU(1) }
        : (fid === 'F4' ? { L17: D(1), L30: M(-1) } : {});
      let pool = FILL.filter(o => !(fid === 'F3' && ((o.type === 'march' && o.mod === 0) || (o.type === 'support' && o.mod === 1)))
        && !(fid === 'F4' && o.type === 'march' && o.mod === -1));
      if (fid === 'F4') pool = pool.filter((o, i, a) => !(o.type === 'defend' && a.findIndex(x => x.type === 'defend') === i)); // one D(1) spent explicitly
      const orders = { ...explicit };
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = dealOrder(pool, rid);
      s = applyAction(s, { type: 'submitOrders', faction: fid, orders }).state;
    }
    s = act(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' });
    s = act(s, { type: 'resolveMarch', faction: 'F3', region: 'L19', moves: [
      { to: 'L17', units: { cavalry: 1, infantry: 1 } },   // the battle prong
      { to: 'L18', units: { infantry: 1 } },               // the reinforcement prong
    ] });
    // The reinforcement landed before combat:
    eq((s.unitsByRegion['L18'] || []).filter(u => u.faction === 'F3').length, 2, 'prong landed pre-combat');
    // Declare own support for the attacker, then measure the tally.
    const sq = s.pendingQueries.find(x => x.type === 'declareSupport' && x.faction === 'F3');
    ok(sq, 'own support order is called');
    s = act(s, { type: 'declareSupport', faction: 'F3', region: 'L18', side: 'attacker' });
    for (let i = 0; i < 6; i++) {
      const oq = s.pendingQueries.find(x => x.type === 'declareSupport');
      if (!oq) break;
      s = act(s, { type: 'declareSupport', faction: oq.faction, region: oq.region, side: 'refuse' });
    }
    const st = combatStrengths(s);
    eq(st.attacker, 6, 'cav 2 + inf 1 + march 0 + support (order 1 + TWO footmen) = 6');
  }},


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
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = dealOrder(pool, rid);
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
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = dealOrder(pool, rid);
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

  { name: 'the other upgrade path: a footman becomes a siege engine for the same point (Rules p.9)', fn() {
    let s = passUntil(toMuster(), 'F3');
    const q = musterQ(s);
    s = act(s, { type: 'muster', faction: 'F3', region: q.region,
      builds: [{ type: 'upgrade', to: 'siege_engine' }] });
    const units = (s.unitsByRegion[q.region] || []).filter(u => u.faction === 'F3');
    eq(units.filter(u => u.type === 'siege_engine').length, 1, 'engines rise from the ranks');
    ok(s.log.some(e => e.event === 'mustered' && e.spent === 1));
    // And the pool still binds: the third engine may never exist.
    let s2 = passUntil(toMuster(), 'F1');
    const q2 = musterQ(s2);
    s2.unitsByRegion['L03'] = [{ faction: 'F1', type: 'siege_engine', routed: false },
                               { faction: 'F1', type: 'siege_engine', routed: false }];
    s2.unitsByRegion[q2.region].push({ faction: 'F1', type: 'infantry', routed: false });
    throws(() => act(s2, { type: 'muster', faction: 'F1', region: q2.region,
      builds: [{ type: 'upgrade', to: 'siege_engine' }] }), 'pool of 2');
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
      for (const rid of orderableRegions(s, fid)) if (!orders[rid]) orders[rid] = dealOrder(pool, rid);
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
    // Supply toll at the exile falls on the RETREATING army, never the
    // standing garrison (Rules p.21) — one routed cavalry pays it.
    eq(exiled.length, 1, 'routed to the chosen exile, less the supply toll');
    ok(s.log.some(e => e.event === 'destroyedForSupply' && e.faction === 'F6' && e.routed === true),
      'the toll came from the arrivals');
    ok((s.unitsByRegion['L37'] || []).some(u => u.faction === 'F6' && !u.routed),
      'the home garrison stands untouched');
    ok(!s.combat, 'combat closed');
  }},

];
