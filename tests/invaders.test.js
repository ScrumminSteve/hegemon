// Golden tests — Invaders & Incursions, M2.d (Rules pp.22–23; FAQ v2.0).

import { createGame } from '../src/engine/state.js';
import { viewFor } from '../src/engine/views.js';
import { applyAction, beginPlanning, replayGame, stateHash, legalActions } from '../src/engine/engine.js';
import { orderableRegions } from '../src/engine/planning.js';
import { SETUP } from '../src/data/setup.js';
import { LEADER_CARDS } from '../src/data/leaderCards.js';
import { eq, ok, throws } from './assert.js';

const M  = (mod = 0) => ({ type: 'march', mod, starred: mod === 1 });
const D  = (mod = 1) => ({ type: 'defend', mod, starred: mod === 2 });
const SU = (mod = 0) => ({ type: 'support', mod, starred: mod === 1 });
const CP = () => ({ type: 'rally', mod: 0, starred: false });

function rig(s, tops) {
  for (const [deck, id] of Object.entries(tops)) {
    const d = s.eventDecks[deck].draw;
    d.splice(d.indexOf(id), 1);
    d.unshift(id);
  }
}
function rigInvader(s, id) {
  s.invaderDeck.splice(s.invaderDeck.indexOf(id), 1);
  s.invaderDeck.unshift(id);
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

/** Reach open incursion bids: threat rigged, invader top card rigged. */
function toIncursion({ seed = 11, threat = 0, invaderTop = null, decks = null } = {}) {
  let s = createGame(6, { seed });
  rig(s, decks || { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
  if (invaderTop) rigInvader(s, invaderTop);
  // Base rigged so the default two icons (+2 each) land at strength 4 —
  // the suite's canonical small attack. Breach tests pass threat: 6 → 10.
  s.threat = threat;
  return runRound(s);
}
/** Seal every pending incursion bid from a {fid: amount} table (default 0). */
function bidAll(s, table = {}) {
  for (const q of s.pendingQueries.filter(x => x.type === 'invaderBid')) {
    s = act(s, { type: 'invaderBid', faction: q.faction, amount: table[q.faction] ?? 0 });
  }
  return s;
}
function myUnits(s, fid, type = null) {
  const out = [];
  for (const [rid, units] of Object.entries(s.unitsByRegion)) {
    for (const u of units) if (u.faction === fid && (!type || u.type === type)) out.push({ region: rid, type: u.type });
  }
  return out;
}

// Rigged decks put threat at 4 when the incursion card turns (base 0 + two
// icons at +2). A defenders' hold: one faction bids the full strength. A
// breach: threat 6 pre-round (10 at the bid) so small bids still fall short.

export const tests = [

  { name: 'sealed incursion bids are secret to their owners; the reveal is public (Rules p.22, M3 parity)', fn() {
    let s = toIncursion();
    s = act(s, { type: 'invaderBid', faction: 'F1', amount: 2 });
    const spy = viewFor(s, 'F3');
    eq(spy.eventPhase.incursion.bids.F1, 'sealed', 'another faction sees a fist, not a number');
    const own = viewFor(s, 'F1');
    eq(own.eventPhase.incursion.bids.F1, 2, 'your own sealed bid is yours to see');
    s = bidAll(s, { F2: 4 });
    ok(s.log.some(e => e.event === 'incursionBidsRevealed' && e.bids.F1 === 2), 'the reveal is public record');
  }},

  { name: 'a bid above your authority is rejected; every bid is paid, win or lose (Rules p.22–23)', fn() {
    let s = toIncursion();
    throws(() => act(s, { type: 'invaderBid', faction: 'F1', amount: 99 }), 'cannot bid beyond your purse');
    const before = { ...s.authority };
    s = bidAll(s, { F2: 4, F3: 1 });
    eq(s.authority.F2, before.F2 - 4, 'the winning bid is paid');
    eq(s.authority.F3, before.F3 - 1, 'a losing bid is paid all the same');
  }},

  { name: 'total >= strength holds the wall: highest bidder rewarded, threat resets to 0, card buried (Rules p.23)', fn() {
    let s = toIncursion({ invaderTop: 'W-silence' });
    eq(s.pendingQueries.find(q => q.type === 'invaderBid').strength, 4);
    s = bidAll(s, { F2: 4 });
    ok(s.log.some(e => e.event === 'incursionOutcome' && e.outcome === 'defenders' && e.total === 4));
    ok(s.log.some(e => e.event === 'incursionNothing' && e.faction === 'F2'), 'silence rewards no one — but names the highest');
    eq(s.threat, 0, 'defender victory resets the threat');
    eq(s.invaderDeck[s.invaderDeck.length - 1], 'W-silence', 'the used card is buried at the bottom');
    eq(s.phase, 'planning', 'the round then proceeds');
  }},

  { name: 'total < strength breaches the wall: threat falls 2 (min 0); penalties run lowest first, then initiative order (FAQ)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-skinchanger' });
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 }); // F3 lowest at 0, total 5 < 10
    ok(s.log.some(e => e.event === 'incursionOutcome' && e.outcome === 'invaders'));
    eq(s.threat, 6, 'the token falls back two spaces (-4) from 10');
    const hits = s.log.filter(e => e.event === 'incursionAuthorityLost').map(e => e.faction);
    eq(hits[0], 'F3', 'the lowest bidder suffers first');
    eq(hits.slice(1), s.tracks.initiative.filter(f => f !== 'F3'), 'the rest suffer in initiative order');
  }},

  { name: 'a tie for the decisive bid is settled by the sovereign holder naming ONE faction (Rules p.23)', fn() {
    let s = toIncursion({ invaderTop: 'W-silence' });
    s = bidAll(s, { F2: 4, F5: 4 });
    const q = s.pendingQueries.find(x => x.type === 'invaderTieBreak');
    ok(q && q.side === 'highest' && q.faction === s.tokens.sovereign, 'the sovereign judges');
    eq(q.tied, ['F2', 'F5']);
    throws(() => act(s, { type: 'invaderTieBreak', faction: q.faction, chosen: 'F1' }), 'must pick from the tie');
    s = act(s, { type: 'invaderTieBreak', faction: q.faction, chosen: 'F5' });
    ok(s.log.some(e => e.event === 'incursionNothing' && e.faction === 'F5'), 'the named faction takes the reward');
  }},

  { name: 'drawing the invader card voids every remembered peek (banked M3 contract)', fn() {
    let s = toIncursion({ invaderTop: 'W-silence' });
    s.privateKnowledge.F2.threatDeck = { card: 'W-silence', placement: 'top', round: 1 };
    s = bidAll(s, { F2: 4 });
    ok(!s.privateKnowledge.F2.threatDeck, 'the deck the courier saw no longer exists');
  }},

  { name: 'a strength-0 incursion is still bid and cannot be lost (FAQ)', fn() {
    let s = toIncursion({ threat: 0, invaderTop: 'W-silence',
      decks: { I: 'E1-supply', II: 'E2-collect', III: 'E3-incursion' } });
    const bids = s.pendingQueries.filter(x => x.type === 'invaderBid');
    eq(bids.length, 6, 'the ritual holds even against nothing');
    eq(bids[0].strength, 0);
    s = bidAll(s); // all zeros: total 0 >= 0
    ok(s.log.some(e => e.event === 'incursionOutcome' && e.outcome === 'defenders'), 'a guaranteed defense');
    const q = s.pendingQueries.find(x => x.type === 'invaderTieBreak');
    ok(q && q.side === 'highest', 'all tied at 0: the sovereign still names a highest bidder');
  }},

  { name: 'threat 12 and an incursion card in one reveal: the immediate attack resolves first, the card attacks at the reset strength (Rules p.22)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
    rigInvader(s, 'W-silence');
    s.threat = 10; // one space below the break
    s = runRound(s);
    eq(s.pendingQueries.find(q => q.type === 'invaderBid').strength, 12, 'the break comes at full strength');
    s = bidAll(s, { F2: 5, F3: 4, F4: 3 }); // 12 >= 12: held, F2 uniquely highest
    eq(s.threat, 0);
    const second = s.pendingQueries.find(q => q.type === 'invaderBid');
    ok(second, 'the incursion card still resolves');
    eq(second.strength, 0, 'but the horde is spent');
  }},

  // ---------- the nine cards ----------

  { name: 'W-skinchanger: lowest loses all authority, others lose 2; victory refunds the highest bid (card text)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-skinchanger' });
    const before = { ...s.authority };
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 }); // F3 lowest
    eq(s.authority.F3, 0, 'the lowest purse is emptied');
    eq(s.authority.F1, before.F1 - 1 - 2, 'others pay the bid and then 2 more');

    let w = toIncursion({ invaderTop: 'W-skinchanger' });
    const purse = w.authority.F2;
    w = bidAll(w, { F2: 4 });
    eq(w.authority.F2, purse, 'the winning bid comes home');
    ok(w.log.some(e => e.event === 'incursionBidRefunded' && e.faction === 'F2' && e.amount === 4));
  }},

  { name: 'W-rattleshirt: supply falls 2 for the lowest and 1 for the rest (min 0); victory raises the highest bidder 1 (card text)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-rattleshirt' });
    const sup = { ...s.supply };
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    eq(s.supply.F3, Math.max(0, sup.F3 - 2), 'the lowest starves twice');
    eq(s.supply.F1, Math.max(0, sup.F1 - 1));
    eq(s.phase, 'planning', 'no starting army breaks at these limits — the round proceeds');

    let w = toIncursion({ invaderTop: 'W-rattleshirt' });
    const before = w.supply.F2;
    w = bidAll(w, { F2: 4 });
    eq(w.supply.F2, Math.min(6, before + 1), 'the highest bidder eats well');
  }},

  { name: 'W-rattleshirt: an army broken by the supply loss is reconciled by its owner, then the incursion proceeds (Rules p.10 analogue)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
    rigInvader(s, 'W-rattleshirt');
    s.threat = 6; // strength 10 at the bid (two icons at +2)
    // Give F3 a second sizeable army so supply 1 -> 0 cannot hold it.
    const home = Object.keys(s.unitsByRegion).find(r => (s.unitsByRegion[r] || []).some(u => u.faction === 'F3'));
    s.unitsByRegion[home].push({ faction: 'F3', type: 'infantry', routed: false },
                               { faction: 'F3', type: 'infantry', routed: false });
    s = runRound(s);
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 }); // F3 lowest
    let q = s.pendingQueries.find(x => x.type === 'reconcileSupply' && x.faction === 'F3');
    ok(q && q.source === 'incursion', 'the loser reconciles their own losses');
    for (let i = 0; i < 6 && q; i++) {
      s = act(s, { type: 'reconcileSupply', faction: 'F3', region: q.regions[0], unitType: 'infantry' });
      q = s.pendingQueries.find(x => x.type === 'reconcileSupply' && x.faction === 'F3');
    }
    ok(s.log.filter(e => e.event === 'destroyedForSupply' && e.faction === 'F3').length >= 1);
    eq(s.phase, 'planning', 'the queue drains on through the other penalties');
  }},

  { name: 'W-mammoth: lowest destroys 3 units anywhere, others 2, each choosing their own (card text)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-mammoth' });
    const before = myUnits(s, 'F3').length;
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    let q = s.pendingQueries.find(x => x.type === 'incursionUnits');
    eq(q.faction, 'F3', 'the lowest chooses first');
    eq(q.count, Math.min(3, before));
    throws(() => act(s, { type: 'incursionUnits', faction: 'F3', units: [] }), 'the toll is exact');
    s = act(s, { type: 'incursionUnits', faction: 'F3', units: myUnits(s, 'F3').slice(0, q.count) });
    eq(myUnits(s, 'F3').length, before - q.count, 'the units are gone');
    q = s.pendingQueries.find(x => x.type === 'incursionUnits');
    eq(q.faction, s.tracks.initiative.find(f => f !== 'F3'), 'then the rest, in initiative order, losing 2');
    eq(q.count, 2);
  }},

  { name: 'W-mammoth victory: the highest bidder retrieves one leader card from their discard (card text)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
    rigInvader(s, 'W-mammoth');
    s.threat = 0; // strength 4 at the bid — the suite's canonical hold
    const spent = s.leaderHands.F2[0];
    s.leaderHands.F2 = s.leaderHands.F2.slice(1);
    s.leaderDiscards.F2 = [spent];
    s = runRound(s);
    s = bidAll(s, { F2: 4 });
    const q = s.pendingQueries.find(x => x.type === 'incursionCard');
    ok(q && q.from === 'discard' && q.options.includes(spent));
    s = act(s, { type: 'incursionCard', faction: 'F2', card: spent });
    ok(s.leaderHands.F2.includes(spent), 'the card returns to hand');
    eq(s.leaderDiscards.F2, []);
  }},

  { name: 'W-massing: the lowest discards every card tied for their highest strength; others choose one to discard (card text)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-massing' });
    const top = Math.max(...s.leaderHands.F3.map(id => LEADER_CARDS[id].strength));
    const doomed = s.leaderHands.F3.filter(id => LEADER_CARDS[id].strength === top);
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    for (const id of doomed) ok(s.leaderDiscards.F3.includes(id), `${id} is discarded`);
    ok(!s.leaderHands.F3.some(id => LEADER_CARDS[id].strength === top), 'the best leaders are lost');
    let q = s.pendingQueries.find(x => x.type === 'incursionCard');
    ok(q && q.from === 'hand' && q.faction !== 'F3', 'the rest choose their own sacrifice');
    const pick = q.options[0];
    s = act(s, { type: 'incursionCard', faction: q.faction, card: pick });
    ok(s.leaderDiscards[q.faction].includes(pick));
  }},

  { name: 'W-massing victory: the entire leader discard returns to hand (card text)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
    rigInvader(s, 'W-massing');
    s.threat = 0; // strength 4 at the bid — the suite's canonical hold
    const spent = s.leaderHands.F2.slice(0, 2);
    s.leaderHands.F2 = s.leaderHands.F2.slice(2);
    s.leaderDiscards.F2 = spent;
    s = runRound(s);
    s = bidAll(s, { F2: 4 });
    eq(s.leaderDiscards.F2, [], 'the discard empties');
    for (const id of spent) ok(s.leaderHands.F2.includes(id), `${id} returns`);
    eq(s.leaderHands.F2.length, 7, 'the hand is whole again');
  }},

  { name: 'W-horde: the lowest loses 2 units from ONE fortified area — never split across two (card text)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
    rigInvader(s, 'W-horde');
    s.threat = 8;
    // Ensure F3's home fort holds at least 2 units and give it a second fortified holding.
    const forts = Object.keys(s.unitsByRegion).filter(r =>
      (s.unitsByRegion[r] || []).some(u => u.faction === 'F3'));
    s.unitsByRegion[forts[0]].push({ faction: 'F3', type: 'infantry', routed: false });
    s = runRound(s);
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    const q = s.pendingQueries.find(x => x.type === 'incursionUnits' && x.faction === 'F3');
    ok(q && q.constraint === 'singleRegion' && q.regions.length >= 1, 'losses come from a fortified holding');
    if (q.regions.length >= 2) {
      const mix = [{ region: q.regions[0], type: 'infantry' }, { region: q.regions[1], type: 'infantry' }];
      throws(() => act(s, { type: 'incursionUnits', faction: 'F3', units: mix }), 'no splitting the toll');
    }
    const rid = q.regions.find(r => (s.unitsByRegion[r] || []).filter(u => u.faction === 'F3').length >= q.count);
    const picks = (s.unitsByRegion[rid] || []).filter(u => u.faction === 'F3').slice(0, q.count)
      .map(u => ({ region: rid, type: u.type }));
    s = act(s, { type: 'incursionUnits', faction: 'F3', units: picks });
    ok(s.log.some(e => e.event === 'incursionUnitsDestroyed' && e.faction === 'F3'));
  }},

  { name: 'W-horde victory: the highest bidder musters at one controlled fortified area under normal rules (card text)', fn() {
    let s = toIncursion({ invaderTop: 'W-horde' });
    s = bidAll(s, { F2: 4 });
    let q = s.pendingQueries.find(x => x.type === 'incursionMusterSite' && x.faction === 'F2')
         || s.pendingQueries.find(x => x.type === 'muster' && x.faction === 'F2');
    ok(q, 'a mustering opens for the victor');
    if (q.type === 'incursionMusterSite') {
      s = act(s, { type: 'incursionMusterSite', faction: 'F2', region: q.options[0].region });
      q = s.pendingQueries.find(x => x.type === 'muster' && x.faction === 'F2');
    }
    eq(q.source, 'incursion');
    const before = myUnits(s, 'F2', 'infantry').length;
    s = act(s, { type: 'muster', faction: 'F2', region: q.region,
      builds: [{ type: 'infantry', to: q.region }] });
    eq(myUnits(s, 'F2', 'infantry').length, before + 1, 'the banners answer');
    eq(s.phase, 'planning', 'and the incursion closes out');
  }},

  { name: 'W-crowKillers: every cavalry of the lowest degrades to infantry, destroyed when the pool runs dry (card text)', fn() {
    let s = createGame(6, { seed: 11 });
    rig(s, { I: 'E1-nothing', II: 'E2-nothing', III: 'E3-incursion' });
    rigInvader(s, 'W-crowKillers');
    s.threat = 8;
    const cavBefore = myUnits(s, 'F3', 'cavalry').length;
    ok(cavBefore >= 1, 'setup gives F3 cavalry');
    // Drain F3's infantry pool so exactly one downgrade can be honored.
    const room = SETUP.unitPool.infantry - myUnits(s, 'F3', 'infantry').length;
    const dump = Object.keys(s.unitsByRegion).find(r => (s.unitsByRegion[r] || []).some(u => u.faction === 'F3'));
    for (let i = 0; i < room - 1; i++) s.unitsByRegion[dump].push({ faction: 'F3', type: 'infantry', routed: false });
    s = runRound(s);
    const cavNow = myUnits(s, 'F3', 'cavalry').length;
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    eq(myUnits(s, 'F3', 'cavalry').length, 0, 'no cavalry survives');
    const ev = s.log.find(e => e.event === 'incursionUnitsDowngraded' && e.faction === 'F3');
    eq(ev.changes.filter(c => !c.destroyed).length, 1, 'one downgrade fits the pool');
    eq(ev.changes.filter(c => c.destroyed).length, cavNow - 1, 'the rest are destroyed outright');
  }},

  { name: 'W-crowKillers victory: up to 2 infantry become cavalry — fewer is legal, pool permitting (card text)', fn() {
    let s = toIncursion({ invaderTop: 'W-crowKillers' });
    s = bidAll(s, { F2: 4 });
    const q = s.pendingQueries.find(x => x.type === 'incursionUnits' && x.faction === 'F2');
    ok(q && q.purpose === 'upgrade' && q.optional, '"up to" means a choice');
    const inf = myUnits(s, 'F2', 'infantry');
    const cavBefore = myUnits(s, 'F2', 'cavalry').length;
    s = act(s, { type: 'incursionUnits', faction: 'F2', units: [inf[0]] });
    eq(myUnits(s, 'F2', 'cavalry').length, cavBefore + 1, 'one footman is knighted');
  }},

  { name: 'W-kingBeyond victory: the highest bidder tops a chosen track and takes its token (card text)', fn() {
    let s = toIncursion({ invaderTop: 'W-kingBeyond' });
    s = bidAll(s, { F2: 4 });
    const q = s.pendingQueries.find(x => x.type === 'incursionTrack' && x.faction === 'F2');
    ok(q && q.mode === 'toTop');
    eq(q.options, ['initiative', 'prowess', 'command']);
    s = act(s, { type: 'incursionTrack', faction: 'F2', track: 'prowess' });
    eq(s.tracks.prowess[0], 'F2', 'F2 stands atop the prowess track');
    eq(s.tokens.blade, 'F2', 'and holds its token');
  }},

  { name: 'W-kingBeyond defeat: the lowest falls to the bottom of every track; others drop on prowess or command, their choice (card text)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-kingBeyond' });
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    for (const t of ['initiative', 'prowess', 'command']) {
      eq(s.tracks[t][s.tracks[t].length - 1], 'F3', `F3 is last on ${t}`);
    }
    let q = s.pendingQueries.find(x => x.type === 'incursionTrack');
    ok(q && q.mode === 'toBottom' && q.faction !== 'F3');
    eq(q.options, ['prowess', 'command']);
    throws(() => act(s, { type: 'incursionTrack', faction: q.faction, track: 'initiative' }), 'initiative is not on offer');
    const fid = q.faction;
    s = act(s, { type: 'incursionTrack', faction: fid, track: 'command' });
    eq(s.tracks.command[s.tracks.command.length - 1], fid);
  }},

  { name: 'W-preemptive defeat: the lowest picks their poison — 2 units, or 2 places on their best track (card text)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-preemptive' });
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    const q = s.pendingQueries.find(x => x.type === 'incursionOption' && x.faction === 'F3');
    ok(q, 'the lowest must choose');
    eq(s.pendingQueries.filter(x => x.type === 'incursionOption').length, 1, 'the rest are spared');
    const bestBefore = Math.min(...['initiative', 'prowess', 'command'].map(t => s.tracks[t].indexOf('F3')));
    s = act(s, { type: 'incursionOption', faction: 'F3', option: 1 }); // fall on the best track
    const finish = s2 => { // an ambiguous "best" asks which track
      const tq = s2.pendingQueries.find(x => x.type === 'incursionTrack' && x.faction === 'F3');
      return tq ? act(s2, { type: 'incursionTrack', faction: 'F3', track: tq.options[0] }) : s2;
    };
    s = finish(s);
    const bestAfter = Math.min(...['initiative', 'prowess', 'command'].map(t => s.tracks[t].indexOf('F3')));
    ok(bestAfter >= Math.min(bestBefore + 2, 5), 'two places surrendered');
    eq(s.phase, 'planning');
  }},

  { name: 'W-preemptive victory: the invaders return at strength 6 and the highest bidder stands apart (card text)', fn() {
    let s = toIncursion({ invaderTop: 'W-preemptive' });
    s = bidAll(s, { F2: 4 });
    ok(s.log.some(e => e.event === 'incursionReattack' && e.strength === 6));
    const again = s.pendingQueries.filter(x => x.type === 'invaderBid');
    eq(again.length, 5, 'five factions face the second wave');
    ok(!again.some(x => x.faction === 'F2'), 'the highest bidder is exempt');
    eq(again[0].strength, 6);
    s = bidAll(s, { F1: 4, F3: 2 }); // 6 >= 6: held again, F1 uniquely highest
    ok(s.log.filter(e => e.event === 'incursionResolved').length === 2, 'both waves resolve');
    eq(s.threat, 0);
    eq(s.phase, 'planning');
  }},

  { name: 'W-silence: nothing happens on defeat, for lowest and others alike (card text)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-silence' });
    const units = s.factions.map(f => myUnits(s, f).length);
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    eq(s.factions.map(f => myUnits(s, f).length), units, 'not a soul is touched');
    eq(s.log.filter(e => e.event === 'incursionNothing').length, 6, 'each faction is named and spared');
    eq(s.phase, 'planning');
  }},

  // ---------- architecture invariants ----------

  { name: 'legalActions surfaces the incursion decision space (M3 parity)', fn() {
    let s = toIncursion();
    const la = legalActions(s, 'F4');
    ok(la.some(a => a.type === 'invaderBid' && a.strength === 4), 'an AI seat sees the bid it owes');
  }},

  { name: 'a full incursion replays byte-identically from its transcript (determinism contract)', fn() {
    // Seed 14 reaches an incursion with no rigging: E1-nothing, E2-collect,
    // E3-incursion at threat 3, W-rattleshirt on top. Only untouched games
    // replay from (config, actions) — that IS the contract.
    let s = createGame(6, { seed: 14 });
    s = runRound(s);
    ok(s.pendingQueries.some(x => x.type === 'invaderBid'), 'the horde arrives unprompted'); // seed 14: one icon, strength 2+2=4
    s = bidAll(s, { F2: 4 }); // 4 >= 4: held, F2 uniquely highest, supply reward is automatic
    eq(s.phase, 'planning');
    const replayed = replayGame(s.config, s.actionLog);
    eq(stateHash(replayed), stateHash(s), 'the transcript rebuilds the exact state');
  }},

  { name: 'a paused incursion survives serialization (architecture invariant)', fn() {
    let s = toIncursion({ threat: 6, invaderTop: 'W-mammoth' });
    s = bidAll(s, { F1: 1, F2: 1, F4: 1, F5: 1, F6: 1 });
    ok(s.pendingQueries.some(x => x.type === 'incursionUnits'), 'paused mid-effect');
    s = JSON.parse(JSON.stringify(s));
    const q = s.pendingQueries.find(x => x.type === 'incursionUnits');
    s = act(s, { type: 'incursionUnits', faction: q.faction, units: myUnits(s, q.faction).slice(0, q.count) });
    ok(s.pendingQueries.some(x => x.type === 'incursionUnits' && x.faction !== q.faction), 'the queue marches on');
  }},
];
