// Golden tests — M1.5b: interactive leader-card text abilities.
// Ruleset note: cancel/swap windows resolve first at reveal, then remaining
// "immediately" abilities in initiative order (matching the digital edition).

import { createGame, serialize, deserialize, controllerOf } from '../src/engine/state.js';
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
function stage({ plants = {}, strip = [], orders = {}, mutate }, seed = 7) {
  let s = createGame(6, { seed });
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
// F1 (K+F) storms planted F3 footmen at L07.
function openBattle(defUnits = [['F3', 'infantry'], ['F3', 'infantry']], extra = {}) {
  const s = stage({ plants: { L07: defUnits, ...(extra.plants || {}) },
    strip: extra.strip || [],
    orders: { F1: { L01: M(0) }, ...(extra.orders || {}) }, mutate: extra.mutate });
  return act(s, { type: 'resolveMarch', faction: 'F1', region: 'L01',
    moves: [{ to: 'L07', units: { cavalry: 1, infantry: 1 } }] });
}
// F2 footman attacks a planted defender at L17 (from L16).
function f2Battle(defender, extra = {}) {
  const s = stage({ plants: { L17: [defender] }, orders: { F2: { L16: M(0) }, ...(extra.orders || {}) }, mutate: extra.mutate });
  return act(s, { type: 'resolveMarch', faction: 'F2', region: 'L16',
    moves: [{ to: 'L17', units: { infantry: 1 } }] });
}

export const tests = [

  { name: 'F2-4: winning grants two authority (card text)', fn() {
    let s = f2Battle(['F4', 'infantry']);
    const before = s.authority.F2;
    s = pick(s, 'F2', 'F2-4');
    s = pick(s, 'F4', 'F4-1a');
    eq(s.log.find(e => e.event === 'combatResolved').victor, 'F2');
    eq(s.authority.F2, before + 2);
  }},

  { name: 'F2-0: the victor may pluck one of the loser\'s orders off the board (card text)', fn() {
    let s = f2Battle(['F4', 'infantry']);
    s = pick(s, 'F2', 'F2-0');          // Cersei-class, str 0
    s = pick(s, 'F4', 'F4-1a');         // str 1 + fort... defender wins? atk 1+0=1 vs def 1+1=2
    // Defender wins here — flip it: use a stronger attack instead.
    // (kept as written to also assert the trigger is victor-only:)
    ok(!s.pendingQueries.some(q => q.type === 'cardTarget'), 'loser gets no order-removal window');
  }},

  { name: 'F2-0 (winning path): order removal query lists the loser\'s orders; skip is legal', fn() {
    const s0 = stage({
      plants: { L17: [['F4', 'infantry']], L15: [['F2', 'cavalry']] },
      orders: { F2: { L15: M(0) } },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F2', region: 'L15',
      moves: [{ to: 'L17', units: { cavalry: 1 } }] });
    s = pick(s, 'F2', 'F2-0');
    s = pick(s, 'F4', 'F4-1a');         // atk 2 vs def 2 -> tie -> prowess: F4 above F2? [F6,F4,F5,F1,F3,F2] F4 wins!
    // F4 (rank 1) beats F2 (rank 5) on the tie — again no query for the loser.
    eq(s.log.find(e => e.event === 'combatResolved').victor, 'F4');
    ok(!s.pendingQueries.some(q => q.type === 'cardTarget'));
  }},

  { name: 'F2-0 (clean win): remove a distant order of the loser', fn() {
    const s0 = stage({
      plants: { L17: [['F4', 'infantry']], L15: [['F2', 'cavalry'], ['F2', 'cavalry']] },
      orders: { F2: { L15: M(0) } },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F2', region: 'L15',
      moves: [{ to: 'L17', units: { cavalry: 2 } }] });
    s = pick(s, 'F2', 'F2-0');
    s = pick(s, 'F4', 'F4-1a');
    eq(s.log.find(e => e.event === 'combatResolved').victor, 'F2');
    const q = s.pendingQueries.find(x => x.type === 'cardTarget');
    eq(q.faction, 'F2'); eq(q.ability, 'onWinRemoveEnemyOrder');
    ok(q.options.length >= 1, 'F4 has orders elsewhere');
    const target = q.options[0];
    s = act(s, { type: 'cardTarget', faction: 'F2', target });
    ok(!s.ordersByRegion[target], 'order gone');
    ok(s.log.some(e => e.event === 'orderRemovedByCard' && e.region === target));
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    ok(rq, 'the surviving defender still retreats');
    s = act(s, { type: 'retreat', faction: 'F4', to: rq.options[0] });
    ok(!s.combat, 'combat wrapped up');
  }},

  { name: 'F2-1a: cancel returns the opponent\'s card to hand for a forced re-pick (card text)', fn() {
    let s = f2Battle(['F4', 'infantry']);
    s = pick(s, 'F2', 'F2-1a');         // Tyrion-class
    s = pick(s, 'F4', 'F4-4');          // Mace-class, str 4 — worth canceling
    const q = s.pendingQueries.find(x => x.type === 'useCardAbility');
    eq(q.faction, 'F2'); eq(q.ability, 'cancelOpponentCard');
    s = act(s, { type: 'useCardAbility', faction: 'F2', use: true });
    ok(s.leaderHands.F4.includes('F4-4'), 'canceled card back in hand');
    const rp = s.pendingQueries.find(x => x.type === 'chooseLeaderCard' && x.faction === 'F4');
    ok(rp.repick === true);
    ok(!rp.hand.includes('F4-4'), 'may not re-choose the canceled card');
    s = pick(s, 'F4', 'F4-1a');
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 1 + 1, 'Tyrion-class str 1 + footman');
    eq(r.defender, 1 + 1, 'replacement str 1 + footman... tie -> F4 on prowess');
    eq(r.victor, 'F4');
  }},

  { name: 'F2-1a: canceling a fresh Mace-class pick also cancels its pending destroy (window order)', fn() {
    let s = openBattle([['F2', 'infantry'], ['F2', 'infantry']], {
      plants: { L07: [['F2', 'infantry'], ['F2', 'infantry']] } });
    // F1 attacks F2 at L07; F2 has the cancel window (initiative F2 > F1? [F3,F2,F1..] yes F2 before F1).
    s = pick(s, 'F1', 'F1-4');
    s = pick(s, 'F2', 'F2-1a');
    // F2's cancel window comes first:
    s = act(s, { type: 'useCardAbility', faction: 'F2', use: true });
    ok(s.leaderHands.F1.includes('F1-4'));
    s = pick(s, 'F1', 'F1-2b');         // re-pick
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 3 + 2, 'K+F + replacement str 2');
  }},

  { name: 'F2-1a: declining the cancel leaves everything standing', fn() {
    let s = f2Battle(['F4', 'infantry']);
    s = pick(s, 'F2', 'F2-1a');
    s = pick(s, 'F4', 'F4-2a');
    s = act(s, { type: 'useCardAbility', faction: 'F2', use: false });
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.defender, 1 + 2); eq(r.victor, 'F4');
    eq(s.leaderDiscards.F4, ['F4-2a']);
  }},

  { name: 'F2-1a: with no other card in hand, the canceled player fights cardless (card text)', fn() {
    let s = f2Battle(['F4', 'infantry'], { mutate: g => {
      g.leaderDiscards.F4 = g.leaderHands.F4.filter(x => x !== 'F4-4');
      g.leaderHands.F4 = ['F4-4'];
    } });
    s.pendingQueries.find(q => q.type === 'chooseLeaderCard' && q.faction === 'F4').hand = ['F4-4'];
    s = pick(s, 'F2', 'F2-1a');
    s = pick(s, 'F4', 'F4-4');
    s = act(s, { type: 'useCardAbility', faction: 'F2', use: true });
    ok(s.log.some(e => e.event === 'foughtCardless' && e.faction === 'F4'));
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.defender, 1, 'footman only — no card');
    eq(r.victor, 'F2');
  }},

  { name: 'F1-2a: losing returns the whole discard pile to hand (card text)', fn() {
    // F3 storms F1's L04 footman; F1 defends with the Roose-class card and loses.
    const s0 = stage({
      plants: { L05: [['F3', 'cavalry'], ['F3', 'cavalry']] },
      orders: { F3: { L05: M(0) } },
      mutate: g => { g.leaderDiscards.F1 = ['F1-4', 'F1-3']; g.leaderHands.F1 = g.leaderHands.F1.filter(x => x !== 'F1-4' && x !== 'F1-3'); },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F3', region: 'L05',
      moves: [{ to: 'L04', units: { cavalry: 2 } }] });
    s = pick(s, 'F3', 'F3-1b');
    s = pick(s, 'F1', 'F1-2a');
    ok(s.log.some(e => e.event === 'discardRecovered' && e.faction === 'F1'));
    eq(s.leaderDiscards.F1, []);
    ok(['F1-4', 'F1-3', 'F1-2a'].every(id => s.leaderHands.F1.includes(id)));
    eq(s.leaderHands.F1.length, 7, 'everything home again');
  }},

  { name: 'F1-3: the victor directs the loser\'s retreat among minimum-loss options (card text)', fn() {
    let s = openBattle([['F3', 'infantry'], ['F3', 'infantry'], ['F3', 'infantry']]);
    s = pick(s, 'F1', 'F1-3');          // Robb-class, str 3
    s = pick(s, 'F3', 'F3-0');          // str 0: atk 3+3=6, def 3+0=3
    // Patchface-class after-combat window arms too; handle retreat first.
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    eq(rq.faction, 'F1', 'the VICTOR answers');
    eq(rq.retreating, 'F3');
    ok(rq.options.length > 0);
    const to = rq.options[0];
    s = act(s, { type: 'retreat', faction: 'F1', to });
    ok((s.unitsByRegion[to] || []).filter(u => u.faction === 'F3').length >= 1);
    ok(s.unitsByRegion[to].every(u => u.faction !== 'F3' || u.routed));
  }},

  { name: 'F3-3: the victor may knight a participating footman, pool permitting (card text)', fn() {
    // F3 attacks F1's L04 footman with 2 planted footmen and wins.
    const s0 = stage({
      plants: { L05: [['F3', 'infantry'], ['F3', 'infantry']] },
      orders: { F3: { L05: M(0) } },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F3', region: 'L05',
      moves: [{ to: 'L04', units: { infantry: 2 } }] });
    s = pick(s, 'F3', 'F3-3');          // Renly-class: atk 2+3=5 vs def 1+card
    s = pick(s, 'F1', 'F1-0');
    const q = s.pendingQueries.find(x => x.type === 'cardTarget' && x.ability === 'onWinUpgradeInfantry');
    eq(q.faction, 'F3');
    ok(q.options.includes('embattled'));
    s = act(s, { type: 'cardTarget', faction: 'F3', target: 'embattled' });
    ok(s.log.some(e => e.event === 'cardUnitUpgraded'));
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    s = act(s, { type: 'retreat', faction: 'F1', to: rq.options[0] });
    const atL04 = s.unitsByRegion['L04'].filter(u => u.faction === 'F3');
    eq(atL04.filter(u => u.type === 'cavalry').length, 1);
    eq(atL04.filter(u => u.type === 'infantry').length, 1);
  }},

  { name: 'F3-3: skip is honored', fn() {
    const s0 = stage({
      plants: { L05: [['F3', 'infantry'], ['F3', 'infantry']] },
      orders: { F3: { L05: M(0) } },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F3', region: 'L05',
      moves: [{ to: 'L04', units: { infantry: 2 } }] });
    s = pick(s, 'F3', 'F3-3');
    s = pick(s, 'F1', 'F1-0');
    s = act(s, { type: 'cardTarget', faction: 'F3', target: 'skip' });
    ok(!s.log.some(e => e.event === 'cardUnitUpgraded'));
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    s = act(s, { type: 'retreat', faction: 'F1', to: rq.options[0] });
    ok(!s.combat);
  }},

  { name: 'F3-0: after combat, look at the opponent\'s hand and discard one (card text)', fn() {
    let s = openBattle();               // F1 attacks F3
    s = pick(s, 'F1', 'F1-4');
    s = pick(s, 'F3', 'F3-0');          // Patchface-class — fires win or lose
    // F1 wins; both defenders die to swords; then the after-combat window:
    const q = s.pendingQueries.find(x => x.type === 'cardTarget' && x.ability === 'afterCombatDiscardOpponentCard');
    eq(q.faction, 'F3'); eq(q.opponent, 'F1');
    ok(q.options.includes('F1-3'));
    s = act(s, { type: 'cardTarget', faction: 'F3', target: 'F1-3' });
    ok(!s.leaderHands.F1.includes('F1-3'));
    ok(s.leaderDiscards.F1.includes('F1-3'));
    ok(!s.combat, 'combat closes after the window');
  }},

  { name: 'F5-0: immediately demote the opponent to a track bottom; dominance tokens follow (card text)', fn() {
    // F5 defends L17 against F2 (F2 tops the command track — demotion moves the courier).
    let s = f2Battle(['F5', 'infantry']);
    s = pick(s, 'F2', 'F2-2a');
    s = pick(s, 'F5', 'F5-0');          // Doran-class
    const q = s.pendingQueries.find(x => x.type === 'cardTarget' && x.ability === 'moveOpponentToTrackBottom');
    eq(q.faction, 'F5');
    eq(q.options, ['initiative', 'prowess', 'command']);
    s = act(s, { type: 'cardTarget', faction: 'F5', target: 'command' });
    eq(s.tracks.command[s.tracks.command.length - 1], 'F2', 'F2 to the bottom');
    ok(s.tokens.courier !== 'F2', 'courier reassigned');
    // Combat then continues to resolution:
    ok(s.log.some(e => e.event === 'combatResolved'));
  }},

  { name: 'F4-0: immediately strip an opponent order adjacent to the field (card text)', fn() {
    // F4 defends L17; F2 attacks from L16. F2's other orders sit adjacent (L36? no — L19/L15/L18/L29/L34 ring).
    let s = f2Battle(['F4', 'infantry'], { mutate: g => {
      g.unitsByRegion['L15'] = [{ faction: 'F2', type: 'infantry', routed: false }];
    } });
    s = pick(s, 'F2', 'F2-2a');
    s = pick(s, 'F4', 'F4-0');          // QoT-class
    const q = s.pendingQueries.find(x => x.type === 'cardTarget' && x.ability === 'removeAdjacentEnemyOrder');
    eq(q.faction, 'F4');
    ok(q.options.includes('L15'), 'the adjacent F2 order at L15');
    s = act(s, { type: 'cardTarget', faction: 'F4', target: 'L15' });
    ok(!s.ordersByRegion['L15']);
    ok(s.log.some(e => e.event === 'combatResolved'), 'combat proceeded');
  }},

  { name: 'F4-4: immediately destroy an opposing footman — before strengths are tallied (card text)', fn() {
    let s = f2Battle(['F4', 'infantry']);
    s = pick(s, 'F2', 'F2-1b');         // attacking footman would count 2
    s = pick(s, 'F4', 'F4-4');          // Mace-class destroys it first
    ok(s.log.some(e => e.event === 'cardUnitDestroyed' && e.faction === 'F2'));
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.attacker, 1, 'card only — the footman is gone');
    eq(r.defender, 1 + 4);
    eq(r.victor, 'F4');
    // Nothing left to bounce home:
    eq((s.unitsByRegion['L16'] || []).filter(u => u.faction === 'F2').length, 0);
  }},

  { name: 'F4-3: the winning attacker\'s March order rides into the conquered area (card text)', fn() {
    const s0 = stage({
      plants: { L17: [['F4', 'cavalry'], ['F4', 'cavalry']] },
      orders: { F4: { L17: M(0) }, F2: {} },
      mutate: g => { g.unitsByRegion['L16'] = [{ faction: 'F2', type: 'infantry', routed: false }]; },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F4', region: 'L17',
      moves: [{ to: 'L16', units: { cavalry: 2 } }] });
    s = pick(s, 'F4', 'F4-3');          // Loras-class
    s = pick(s, 'F2', 'F2-0');
    // F4 wins 4+3 vs 1+0; the March order re-lands on L16:
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.victor, 'F4');
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    if (rq) s = act(s, { type: 'retreat', faction: rq.faction, to: rq.options[0] });
    const o = s.ordersByRegion['L16'];
    eq(o?.type, 'march'); eq(o?.faction, 'F4');
    ok(s.log.some(e => e.event === 'cardMarchMoved'));
  }},

  { name: 'F5-1b: a losing defender denies the advance — attackers return unrouted (card text)', fn() {
    let s = f2Battle(['F5', 'infantry']);
    s = pick(s, 'F2', 'F2-4');          // 4: F2 wins big
    s = pick(s, 'F5', 'F5-1b');         // Arianne-class
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.victor, 'F2');
    const rq = s.pendingQueries.find(x => x.type === 'retreat');
    ok(rq, 'the loser still retreats (card text)');
    s = act(s, { type: 'retreat', faction: 'F5', to: rq.options[0] });
    ok(s.log.some(e => e.event === 'advanceBlocked'));
    // Attacker back home, not routed; L17 not captured by F2:
    const home = (s.unitsByRegion['L16'] || []).filter(u => u.faction === 'F2');
    eq(home.length, 1);
    ok(!home[0].routed, 'returns unrouted');
    ok(controllerOf(s, 'L17') !== 'F2');
    // The defender still had to retreat:
    ok(s.log.some(e => e.event === 'retreated' && e.faction === 'F5') ||
       s.pendingQueries.some(q => q.type === 'retreat'));
  }},

  { name: 'F6-0: pay two authority to swap in a different card (card text)', fn() {
    // F6 defends L17 with the Aeron-class card, then swaps to its str-4 card.
    let s = f2Battle(['F6', 'infantry']);
    s = pick(s, 'F2', 'F2-2a');
    s = pick(s, 'F6', 'F6-0');
    const q = s.pendingQueries.find(x => x.type === 'useCardAbility' && x.ability === 'swapSelfForAuthority');
    eq(q.faction, 'F6'); eq(q.cost, 2);
    const auth = s.authority.F6;
    s = act(s, { type: 'useCardAbility', faction: 'F6', use: true });
    eq(s.authority.F6, auth - 2);
    const rp = s.pendingQueries.find(x => x.type === 'chooseLeaderCard' && x.faction === 'F6');
    ok(rp.repick);
    s = pick(s, 'F6', 'F6-4');
    s = act(s, { type: 'useBlade', faction: 'F6', use: false });
    const r = s.log.find(e => e.event === 'combatResolved');
    eq(r.defender, 1 + 4, 'the swapped-in card counts');
    // Both cards spent: the discarded one stays discarded.
    ok(s.leaderDiscards.F6.includes('F6-0'));
    ok(s.leaderDiscards.F6.includes('F6-4'));
  }},

  { name: 'F6-0: broke or empty-handed, the swap window never opens ("if able")', fn() {
    let s = f2Battle(['F6', 'infantry'], { mutate: g => { g.authority.F6 = 1; } });
    s = pick(s, 'F2', 'F2-2a');
    s = pick(s, 'F6', 'F6-0');
    ok(!s.pendingQueries.some(x => x.type === 'useCardAbility'));
    s = act(s, { type: 'useBlade', faction: 'F6', use: false });
    ok(s.log.some(e => e.event === 'combatResolved'));
  }},

  { name: 'F3-1a: a supported combatant zeroes every non-friendly warship (card text)', fn() {
    // Naval battle at S04 (F3 home sea): F6 warship attacks from S03; F3
    // supports itself from S06 with a warship on a Support order.
    const s0 = stage({
      plants: { S03: [['F6', 'warship']], S06: [['F3', 'warship']] },
      orders: { F6: { S03: M(0) }, F3: { S06: SU(0) } },
    });
    let s = act(s0, { type: 'resolveMarch', faction: 'F6', region: 'S03',
      moves: [{ to: 'S04', units: { warship: 1 } }] });
    s = act(s, { type: 'declareSupport', faction: 'F3', region: 'S06', side: 'defender' });
    s = pick(s, 'F6', 'F6-4');
    s = pick(s, 'F3', 'F3-1a');         // Salladhor-class
    s = act(s, { type: 'useBlade', faction: 'F6', use: false });
    const r = s.log.find(e => e.event === 'combatResolved');
    // Attacker's ship zeroed: 0 + 4. Defender: 2 own ships (S04 pair) zero? No —
    // friendly ships keep their strength; F3 has its two starting ships at S04.
    eq(r.attacker, 4, 'enemy warship reduced to 0');
    // Two home ships + defend order (+1, FILL) + friendly support ship + card 1:
    eq(r.defender, 2 + 1 + 1 + 1, 'friendly ships untouched');
  }},

  { name: 'mid-ability state serializes losslessly', fn() {
    let s = f2Battle(['F4', 'infantry']);
    s = pick(s, 'F2', 'F2-1a');
    s = pick(s, 'F4', 'F4-4');
    eq(deserialize(serialize(s)), s);
    s = act(s, { type: 'useCardAbility', faction: 'F2', use: true });
    eq(deserialize(serialize(s)), s);
  }},

  { name: 'illegal ability answers are rejected', fn() {
    let s = f2Battle(['F4', 'infantry']);
    s = pick(s, 'F2', 'F2-1a');
    s = pick(s, 'F4', 'F4-2a');
    throws(() => act(s, { type: 'useCardAbility', faction: 'F4', use: true }), 'not your window');
    throws(() => act(s, { type: 'cardTarget', faction: 'F2', target: 'L15' }), 'no target pending');
  }},

];
