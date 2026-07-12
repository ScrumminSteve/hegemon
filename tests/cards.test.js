// Golden tests — M1.5a: leader cards (Rules p.19–20).

import { createGame, serialize, deserialize, controllerOf } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { orderableRegions } from '../src/engine/planning.js';
import { viewFor } from '../src/engine/views.js';
import { LEADER_CARDS } from '../src/data/leaderCards.js';
import { eq, ok, throws } from './assert.js';

const M  = (mod = 0) => ({ type: 'march', mod, starred: mod === 1 });
const D  = (mod = 1) => ({ type: 'defend', mod, starred: mod === 2 });
const SU = (mod = 0) => ({ type: 'support', mod, starred: mod === 1 });
const CP = (starred = false) => ({ type: 'rally', mod: 0, starred });

const FILL = [CP(), CP(), D(1), D(1), SU(0), SU(0), M(-1), M(0)];
function stage({ plants = {}, strip = [], orders = {}, mutate }, seed = 7) {
  let s = createGame(6, { seed }); // leader cards ON (strict default)
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
    for (const rid of orderableRegions(s, fid)) if (!full[rid]) full[rid] = pool.shift();
    s = applyAction(s, { type: 'submitOrders', faction: fid, orders: full }).state;
  }
  return applyAction(s, { type: 'courierDecision', faction: 'F2', decision: 'pass' }).state;
}

// F1 (K+F, str 3) attacks planted F3 footmen at L07; both then pick cards.
function openBattle(defUnits = [['F3', 'infantry'], ['F3', 'infantry']], mutate) {
  const s = stage({ plants: { L07: defUnits }, orders: { F1: { L01: M(0) } }, mutate });
  return applyAction(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
    moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] }).state;
}
const pick = (s, fid, card) => applyAction(s, { type: 'chooseLeaderCard', faction: fid, card }).state;

export const tests = [

  { name: 'every faction starts with its 7 leader cards in hand (Rules p.19)', fn() {
    const g = createGame(6);
    for (const f of g.factions) {
      eq(g.leaderHands[f].length, 7, `${f}:`);
      eq(g.leaderDiscards[f], []);
    }
  }},

  { name: 'combat calls for a hidden simultaneous card from each combatant (Rules p.19)', fn() {
    const s = openBattle();
    const qs = s.pendingQueries.filter(q => q.type === 'chooseLeaderCard');
    eq(qs.map(q => q.faction).sort(), ['F1', 'F3']);
  }},

  { name: 'the card must come from your hand', fn() {
    const s = openBattle();
    throws(() => pick(s, 'F1', 'F2-4'), 'foreign card');
    throws(() => pick(s, 'F1', 'nope'), 'unknown card');
  }},

  { name: 'a committed pick is masked from the opponent until both are down (Rules p.19, p.27)', fn() {
    let s = openBattle();
    s = pick(s, 'F1', 'F1-4');
    ok(viewFor(s, 'F3').combat.cards.F1.hidden === true, 'masked for F3');
    eq(viewFor(s, 'F1').combat.cards.F1, 'F1-4', 'visible to owner');
    s = pick(s, 'F3', 'F3-1b');
    const revealed = s.log.filter(e => e.event === 'leaderCardRevealed');
    eq(revealed.map(e => e.card).sort(), ['F1-4', 'F3-1b'], 'public after reveal');
  }},

  { name: 'revealed cards leave the hand for the discard pile (Rules p.19)', fn() {
    let s = openBattle();
    s = pick(s, 'F1', 'F1-4');
    s = pick(s, 'F3', 'F3-1b');
    ok(!s.leaderHands.F1.includes('F1-4'));
    eq(s.leaderDiscards.F1, ['F1-4']);
  }},

  { name: 'printed strengths join the totals; sword casualties fall on the defeated (Rules p.19–20)', fn() {
    let s = openBattle();               // atk units 3 vs def units 2
    s = pick(s, 'F1', 'F1-4');          // 4, two swords
    s = pick(s, 'F3', 'F3-1b');         // 1, one sword
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 7); eq(r.defender, 3); eq(r.victor, 'F1');
    // 2 swords − 0 forts = 2 casualties: both defenders die before any retreat.
    eq(s.log.find(e => e.event === 'casualtiesTaken').units, { infantry: 2 });
    eq(controllerOf(s, 'L07'), 'F1');
    ok(!s.pendingQueries.some(q => q.type === 'retreat'), 'nobody left to retreat');
  }},

  { name: 'fortification icons absorb sword casualties (Rules p.20)', fn() {
    let s = openBattle([['F3', 'infantry'], ['F3', 'infantry'], ['F3', 'infantry']]);
    s = pick(s, 'F1', 'F1-4');          // two swords
    s = pick(s, 'F3', 'F3-2a');         // 2, one sword one fort
    // atk 3+4=7 vs def 3+2=5: F1 wins; casualties 2−1=1.
    eq(s.log.find(e => e.event === 'casualtiesTaken').units, { infantry: 1 });
    ok(s.pendingQueries.some(q => q.type === 'retreat'), 'survivors retreat');
  }},

  { name: 'casualty immunity blanks icon losses entirely (F1-1b hook)', fn() {
    // F3 storms F1's footman at L04 with 3 planted cavalry.
    const s0 = stage({
      plants: { L05: [['F3', 'cavalry'], ['F3', 'cavalry'], ['F3', 'cavalry']] },
      orders: { F3: { L05: M(0) } },
    });
    let s = applyAction(s0, { type: 'resolveMarch', faction: 'F3', region: 'L05',
      moves: [{ to: 'L04', units: { cavalry: 3 } }] }).state;
    s = pick(s, 'F3', 'F3-1b');         // sword icon on the eventual victor
    s = pick(s, 'F1', 'F1-1b');         // immunity
    eq(s.log.find(e => e.event === 'combatResolved').victor, 'F3');
    ok(!s.log.some(e => e.event === 'casualtiesTaken'), 'no icon casualties');
  }},

  { name: 'mixed survivors get a casualty choice; the count is binding (Rules p.20)', fn() {
    // F6-2a defending a fort gains +1 str & a sword; the losing attacker has K+F.
    const s0 = stage({
      strip: ['L04'],
      plants: { L04: [['F6', 'infantry']] },
      orders: { F1: { L01: M(0) } },
    });
    let s = applyAction(s0, { type: 'resolveMarch', faction: 'F1', region: 'L01',
      moves: [{ to: 'L04', units: { cavalry: 1, infantry: 1 } }] }).state;
    s = pick(s, 'F1', 'F1-0');          // 0 printed
    s = pick(s, 'F6', 'F6-2a');         // 2+1=3 defending a fort, gains a sword
    s = applyAction(s, { type: 'useBlade', faction: 'F6', use: false }).state;
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 3); eq(r.defender, 4); eq(r.victor, 'F6');
    const q = s.pendingQueries.find(x => x.type === 'chooseCasualties');
    eq(q.faction, 'F1'); eq(q.count, 1); eq(q.available, { cavalry: 1, infantry: 1 });
    throws(() => applyAction(s, { type: 'chooseCasualties', faction: 'F1', units: { cavalry: 1, infantry: 1 } }), 'too many');
    s = applyAction(s, { type: 'chooseCasualties', faction: 'F1', units: { infantry: 1 } }).state;
    // Survivor bounces home routed.
    eq((s.unitsByRegion['L01'] || []).length, 1);
    eq(s.unitsByRegion['L01'][0].type, 'cavalry');
    ok(s.unitsByRegion['L01'][0].routed);
  }},

  { name: 'attacking-unit bonus override: F2-1b makes footmen count 2 (card text)', fn() {
    const s0 = stage({
      plants: { L17: [['F4', 'infantry']] },
      orders: { F2: { L16: M(0) } },
    });
    let s = applyAction(s0, { type: 'resolveMarch', faction: 'F2', region: 'L16',
      moves: [{ to: 'L17', units: { infantry: 1 } }] }).state;
    s = pick(s, 'F2', 'F2-1b');         // footman counts 2; card 1
    s = pick(s, 'F4', 'F4-1a');         // 1, one fort
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 3); eq(r.defender, 2); eq(r.victor, 'F2');
  }},

  { name: 'zeroing the opponent\'s printed strength (F6-2b) spares card bonuses only', fn() {
    const s0 = stage({
      plants: { L06: [['F6', 'infantry']] },
      orders: { F1: { L01: D(1), L04: D(1), S02: M(0) } },
    });
    // Naval-free variant: attack L06 by land needs adjacency — use F2 from L16? L16-L06 not adjacent.
    // Simplest: F6 defends L06 vs F1? L06 borders L03/L08/S01/S09/S11 — F1 lacks adjacency.
    // Use F6 as DEFENDER against F2 at L17 instead:
    const s1 = stage({
      plants: { L17: [['F6', 'infantry']] },
      orders: { F2: { L16: M(0) } },
    });
    let s = applyAction(s1, { type: 'resolveMarch', faction: 'F2', region: 'L16',
      moves: [{ to: 'L17', units: { infantry: 1 } }] }).state;
    s = pick(s, 'F2', 'F2-4');          // printed 4 -> zeroed
    s = pick(s, 'F6', 'F6-2b');         // 2
    s = applyAction(s, { type: 'useBlade', faction: 'F6', use: false }).state;
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 1); eq(r.defender, 3); eq(r.victor, 'F6');
    void s0;
  }},

  { name: 'conditional strength vs track position (F3-4) reads the live track', fn() {
    // Mutate initiative so F1 outranks F3; then F3's strength-4 card gains +1.
    const s0 = stage({
      plants: { L05: [['F3', 'cavalry']] },
      orders: { F3: { L05: M(0) } },
      mutate: g => { g.tracks.initiative = ['F1', 'F2', 'F3', 'F5', 'F6', 'F4']; g.tokens.sovereign = 'F1'; },
    });
    let s = applyAction(s0, { type: 'resolveMarch', faction: 'F3', region: 'L05',
      moves: [{ to: 'L04', units: { cavalry: 1 } }] }).state;
    s = pick(s, 'F3', 'F3-4');
    s = pick(s, 'F1', 'F1-0');
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 2 + 4 + 1, 'cavalry + printed + track bonus:');
  }},

  { name: 'the seventh card recycles the hand: six return, the last stays discarded (Rules p.19)', fn() {
    let s = openBattle();
    s.leaderHands.F1 = ['F1-4'];
    s.leaderDiscards.F1 = ['F1-0', 'F1-1a', 'F1-1b', 'F1-2a', 'F1-2b', 'F1-3'];
    // Refresh the pending query's advertised hand to match the surgery.
    s.pendingQueries.find(q => q.type === 'chooseLeaderCard' && q.faction === 'F1').hand = ['F1-4'];
    s = pick(s, 'F1', 'F1-4');
    s = pick(s, 'F3', 'F3-1b');
    ok(s.log.some(e => e.event === 'leaderHandRecycled'));
    eq(s.leaderHands.F1.length, 6);
    eq(s.leaderDiscards.F1, ['F1-4']);
    ok(!s.leaderHands.F1.includes('F1-4'));
  }},

  { name: 'every text ability is implemented — the M1.5b ledger is closed', fn() {
    ok(!Object.values(LEADER_CARDS).some(c => c.implemented === false));
  }},

  { name: 'mid-selection state serializes losslessly', fn() {
    let s = openBattle();
    s = pick(s, 'F1', 'F1-4');
    eq(deserialize(serialize(s)), s);
  }},

  { name: 'card data audit hooks: 42 cards, 7 per faction, strengths 4/3/2/2/1/1/0', fn() {
    const byF = {};
    for (const c of Object.values(LEADER_CARDS)) (byF[c.faction] = byF[c.faction] || []).push(c.strength);
    for (const [f, arr] of Object.entries(byF)) {
      eq(arr.sort((a, b) => b - a), [4, 3, 2, 2, 1, 1, 0], `${f}:`);
    }
  }},

];
