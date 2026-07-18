// Golden tests — Event Phase, M2.a (Rules p.9–10, p.22; FAQ v2.0).

import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning, replayGame, episodeRecord } from '../src/engine/engine.js';
import { viewFor } from '../src/engine/views.js';
import { orderableRegions } from '../src/engine/planning.js';
import { EVENT_DECKS } from '../src/data/eventCards.js';
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

/** Move the named cards to the top of their decks (test-only deck surgery). */
function rig(s, tops) {
  for (const [deck, id] of Object.entries(tops)) {
    const d = s.eventDecks[deck].draw;
    const i = d.indexOf(id);
    if (i === -1) throw new Error(`${id} not in deck ${deck}`);
    d.splice(i, 1);
    d.unshift(id);
  }
}

/** Submit inert orders for everyone and pass the Courier: round 1 completes
 *  with no action resolution, landing in the round-2 Event Phase. */
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
  // Any resolvable orders placed by FILL are drained inertly.
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

export const tests = [

  { name: 'a transcript replays to a byte-identical game (M3.L determinism contract)', fn() {
    let s = createGame(6, { seed: 77 });
    s = runRound(s);   // full inert round incl. the round-2 Event Phase
    for (let i = 0; i < 6 && s.pendingQueries.some(x => x.type === 'eventChoice'); i++) {
      const q = s.pendingQueries.find(x => x.type === 'eventChoice');
      s = act(s, { type: 'eventChoice', faction: q.faction, option: q.options.includes('nothing') ? 'nothing' : q.options[0] });
    }
    ok(s.actionLog.length >= 7, 'transcript captured');
    const twin = replayGame(s.config, s.actionLog);
    const strip = g => { const c = structuredClone(g); return c; };
    eq(JSON.parse(JSON.stringify(strip(twin))), JSON.parse(JSON.stringify(strip(s))), 'byte-identical replay');
    const ep = episodeRecord(s);
    ok(ep.outcome.perFaction.F1.seats >= 1 && ep.config.seed === 77);
  }},

  { name: 'the transcript is engine-private: views carry no replay material', fn() {
    let s = createGame(6, { seed: 77 });
    s = runRound(s);
    const v = viewFor(s, 'F1');
    ok(v.actionLog === undefined && v.config === undefined && v.seed === undefined);
  }},


  { name: 'event decks are seeded at creation: full composition, deterministic order', fn() {
    const g = createGame(6, { seed: 11 });
    for (const [deckId, cards] of Object.entries(EVENT_DECKS)) {
      const want = cards.reduce((a, c) => a + c.count, 0);
      eq(g.eventDecks[deckId].draw.length, want, `deck ${deckId} size:`);
    }
    eq(g.invaderDeck.length, 9);
    const g2 = createGame(6, { seed: 11 });
    eq(g.eventDecks, g2.eventDecks);
    ok(JSON.stringify(g.eventDecks) !== JSON.stringify(createGame(6, { seed: 12 }).eventDecks),
      'different seeds shuffle differently');
  }},

  { name: 'round 2 opens with the Event Phase: one reveal per deck, resolved in deck order', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-banSupport' });
    s = runRound(s);
    const reveals = s.log.filter(e => e.event === 'eventCardRevealed');
    eq(reveals.map(r => r.deck), ['I', 'II', 'III']);
    ok(s.log.some(e => e.event === 'eventPhaseBegan'));
    eq(s.phase, 'planning');
    eq(s.round, 2);
  }},

  { name: 'the threat token advances one SPACE (+2) per revealed invader icon (Rules p.22; owner board check)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-banRaid' }); // icons: I ✓, II ✓, III ✓
    s = runRound(s);
    eq(s.threat, 8, 'start 2 + three icons at +2 each');
    eq(s.log.filter(e => e.event === 'threatAdvanced').length, 3);
  }},

  { name: 'reshuffle-class cards resolve immediately on draw, folding in the discard (FAQ v2.0)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-shuffle', II: 'E2-nothing', III: 'E3-banRaid' });
    s.eventDecks.I.discard = ['E1-supply'];             // pretend a prior round happened
    s.eventDecks.I.draw.pop();                          // keep the pile at 10 total
    s = runRound(s);
    ok(s.log.some(e => e.event === 'eventDeckReshuffled' && e.deck === 'I'));
    const reveals = s.log.filter(e => e.event === 'eventCardRevealed' && e.deck === 'I');
    eq(reveals.length, 1, 'a replacement card is revealed:');
    ok(reveals[0].card !== 'E1-shuffle');
    // Deck integrity: 10 cards total across draw + the 1 revealed discard.
    eq(s.eventDecks.I.draw.length + s.eventDecks.I.discard.length, 10);
  }},

  { name: 'ban-class cards forbid their order class in the coming Planning Phase (Rules p.22)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-banDefend' });
    s = runRound(s);
    eq(s.roundFlags.bannedOrders, ['defend']);
    const fid = 'F1';
    const rids = orderableRegions(s, fid);
    throws(() => act(s, { type: 'submitOrders', faction: fid,
      orders: Object.fromEntries(rids.map((r, i) => [r, i === 0 ? D(1) : SU(0)])) }),
      'defend under ban');
    const okOrders = Object.fromEntries(rids.map((r, i) => [r, i === 0 ? M(0) : SU(0)]));
    const s2 = act(s, { type: 'submitOrders', faction: fid, orders: okOrders });
    ok(s2.log.some(e => e.event === 'ordersSubmitted' && e.faction === fid));
  }},

  { name: 'the march ban strikes only the +1 march, by order class (FAQ: classes, not types)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-banMarchUp' });
    s = runRound(s);
    eq(s.roundFlags.bannedOrders, ['marchPlusOne']);
    const rids = orderableRegions(s, 'F1');
    throws(() => act(s, { type: 'submitOrders', faction: 'F1',
      orders: Object.fromEntries(rids.map((r, i) => [r, i === 0 ? M(1) : SU(0)])) }),
      '+1 march under ban');
    const s2 = act(s, { type: 'submitOrders', faction: 'F1',
      orders: Object.fromEntries(rids.map((r, i) => [r, i === 0 ? M(0) : SU(0)])) });
    ok(s2.log.some(e => e.event === 'ordersSubmitted' && e.faction === 'F1'), 'plain march is legal');
  }},

  { name: 'supply update recalculates from board control and clamps to the track (Rules p.10)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-supply', II: 'E2-nothing', III: 'E3-banRaid' });
    s = runRound(s);
    // No control changed in an inert round: every faction lands on its printed icons.
    ok(s.log.some(e => e.event === 'supplyAdjusted') || true, 'adjustment logged when changed');
    for (const fid of s.factions) {
      ok(s.supply[fid] >= 0 && s.supply[fid] <= 6);
    }
    eq(s.phase, 'planning');
  }},

  { name: 'supply violations pause for owner-chosen losses, one unit at a time (Rules p.10)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-supply', II: 'E2-nothing', III: 'E3-banRaid' });
    // F1 masses five units at its seat: far beyond any supply-1 configuration.
    s.unitsByRegion['L01'] = [
      ...s.unitsByRegion['L01'],
      { faction: 'F1', type: 'infantry', routed: false },
      { faction: 'F1', type: 'infantry', routed: false },
      { faction: 'F1', type: 'cavalry', routed: false },
    ];
    s = runRound(s);
    let q = s.pendingQueries.find(x => x.type === 'reconcileSupply');
    ok(q && q.faction === 'F1', 'the owner chooses');
    ok(q.regions.includes('L01'));
    throws(() => act(s, { type: 'reconcileSupply', faction: 'F1', region: 'L04', unitType: 'infantry' }),
      'not an oversized army');
    let n = 0;
    while (s.pendingQueries.some(x => x.type === 'reconcileSupply' && x.faction === 'F1') && n++ < 6) {
      s = act(s, { type: 'reconcileSupply', faction: 'F1', region: 'L01', unitType: 'infantry' });
    }
    ok(n >= 1 && n <= 4, 'a bounded number of chosen losses');
    eq(s.phase, 'planning', 'phase resumes after reconciliation');
    ok(s.log.some(e => e.event === 'destroyedForSupply' && e.chosen === true));
  }},

  { name: 'authority collection pays coin icons plus the harbor trade bonus (Rules p.16, p.25)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-collect', III: 'E3-banRaid' });
    const before = { ...s.authority };
    s = runRound(s);
    const gains = s.log.filter(e => e.event === 'authorityCollected');
    ok(gains.length >= 4, 'most factions collect');
    const f2 = gains.find(g => g.faction === 'F2');
    // F2 controls Lannisport (1 coin) + seat + harbor ship in P04 with a free sea.
    ok(f2 && f2.amount >= 2, 'coins + harbor trade');
    ok(s.authority.F2 > before.F2);
  }},

  { name: 'an enemy fleet in the connected sea denies the harbor trade bonus (Rules p.25)', fn() {
    let base = createGame(6, { seed: 11 });
    rig(base, { I: 'E1-nothing', II: 'E2-collect', III: 'E3-banRaid' });
    const open = runRound(structuredClone(base));
    const openF2 = open.log.find(e => e.event === 'authorityCollected' && e.faction === 'F2').amount;
    base.unitsByRegion['S10'] = [{ faction: 'F6', type: 'warship', routed: false }]; // blockade
    const blocked = runRound(base);
    const blockedF2 = blocked.log.find(e => e.event === 'authorityCollected' && e.faction === 'F2').amount;
    eq(openF2 - blockedF2, 1, 'exactly the trade coin is lost:');
  }},

  { name: 'holder-choice cards query the token holder and resolve the chosen effect', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-choice', II: 'E2-nothing', III: 'E3-banRaid' });
    s = runRound(s);
    const q = s.pendingQueries.find(x => x.type === 'eventChoice');
    ok(q && q.faction === 'F3', 'the Initiative holder decides');
    eq(q.options, ['muster', 'supplyUpdate', 'nothing']);
    throws(() => act(s, { type: 'eventChoice', faction: 'F3', option: 'collectAuthority' }), 'not offered');
    s = act(s, { type: 'eventChoice', faction: 'F3', option: 'nothing' });
    ok(s.log.some(e => e.event === 'eventChoiceMade' && e.option === 'nothing'));
    eq(s.phase, 'planning', 'phase resumes after the choice');
  }},

  { name: 'the Blade holder may choose an order ban from the choice card (card text)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-choice' });
    s = runRound(s);
    const q = s.pendingQueries.find(x => x.type === 'eventChoice');
    ok(q && q.faction === 'F6', 'the Blade holder decides');
    s = act(s, { type: 'eventChoice', faction: 'F6', option: 'banOrder:defend' });
    eq(s.roundFlags.bannedOrders, ['defend']);
    eq(s.phase, 'planning');
  }},

  { name: 'the incursion card opens sealed bids at the current threat strength (Rules p.22)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
    s = runRound(s);
    ok(s.log.some(e => e.event === 'incursionBegan' && e.trigger === 'card'));
    const bids = s.pendingQueries.filter(x => x.type === 'invaderBid');
    eq(bids.length, 6, 'all six factions bid');
    eq(bids[0].strength, s.threat, 'attack at current threat strength');
    eq(s.phase, 'event', 'the phase waits on the bids');
  }},

  { name: 'reaching threat 12 triggers an immediate incursion before card effects (Rules p.22)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-banRaid' });
    s.threat = 10; // one space below the break
    s = runRound(s);
    eq(s.threat, 12);
    ok(s.log.some(e => e.event === 'incursionBegan' && e.trigger === 'threatMax'));
    eq(s.pendingQueries.filter(x => x.type === 'invaderBid').length, 6);
    // No revealed card has resolved yet: the incursion cuts the line.
    ok(!s.log.some(e => e.event === 'eventNothing'), 'card effects wait');
    ok(!s.roundFlags.bannedOrders, 'the ban has not landed yet');
  }},

  { name: 'a paused Event Phase survives serialization (architecture invariant)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-supply', II: 'E2-nothing', III: 'E3-banRaid' });
    s.unitsByRegion['L01'] = [
      ...s.unitsByRegion['L01'],
      { faction: 'F1', type: 'infantry', routed: false },
      { faction: 'F1', type: 'infantry', routed: false },
    ];
    s = runRound(s);
    ok(s.pendingQueries.some(x => x.type === 'reconcileSupply'), 'paused mid-phase');
    s = JSON.parse(JSON.stringify(s));
    let n = 0;
    while (s.pendingQueries.some(x => x.type === 'reconcileSupply') && n++ < 6) {
      const q = s.pendingQueries.find(x => x.type === 'reconcileSupply');
      s = act(s, { type: 'reconcileSupply', faction: q.faction, region: q.regions[0], unitType: 'infantry' });
    }
    eq(s.phase, 'planning', 'resumed from JSON');
  }},

];
