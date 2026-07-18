// Golden tests — Clash of Kings bidding, M2.c (Rules p.14–15).

import { createGame, STAR_ALLOWANCE } from '../src/engine/state.js';
import { viewFor } from '../src/engine/views.js';
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
const CP = () => ({ type: 'rally', mod: 0, starred: false });

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

/** A round rigged to reach the Clash: returns state with 6 sealed-bid queries open. */
function toClash(seed = 11) {
  let s = createGame(6, { seed });
  rig(s, { I: 'E1-nothing', II: 'E2-bid', III: 'E3-banRaid' });
  return runRound(s);
}
function bidAll(s, table) {
  const track = s.pendingQueries.find(q => q.type === 'bid')?.track;
  for (const fid of Object.keys(table)) {
    s = act(s, { type: 'bid', faction: fid, track, amount: table[fid] });
  }
  return s;
}

export const tests = [

  { name: 'the Clash opens sealed, simultaneous bids for all six seats (Rules p.14)', fn() {
    const s = toClash();
    const qs = s.pendingQueries.filter(q => q.type === 'bid');
    eq(qs.length, 6, 'every seat bids at once');
    ok(qs.every(q => q.track === 'initiative'), 'the Iron-Throne-analog track goes first');
    ok(qs.every(q => q.max === s.authority[q.faction]), "ceiling is each seat's authority");
  }},

  { name: 'sealed bids are secret to their owners; the reveal is public (Rules p.15)', fn() {
    let s = toClash();
    s = act(s, { type: 'bid', faction: 'F1', track: 'initiative', amount: 3 });
    const mine = viewFor(s, 'F1');
    const theirs = viewFor(s, 'F5');
    eq(mine.eventPhase.bidding.bids.F1, 3, 'own sealed bid visible to self');
    eq(theirs.eventPhase.bidding.bids.F1, 'sealed', 'and a closed fist to everyone else');
    eq(mine.privateKnowledge.F1.lastBid.amount, 3, 'earned secret recorded');
    ok(!theirs.privateKnowledge.F1, 'and not leaked');
  }},

  { name: 'a bid above your authority is rejected; every revealed bid is paid, win or lose (Rules p.15)', fn() {
    let s = toClash();
    throws(() => act(s, { type: 'bid', faction: 'F1', track: 'initiative', amount: 99 }), 'over-bid');
    const before = { ...s.authority };
    s = bidAll(s, { F1: 5, F2: 4, F3: 3, F4: 2, F5: 1, F6: 0 });
    for (const [fid, amt] of Object.entries({ F1: 5, F2: 4, F3: 3, F4: 2, F5: 1, F6: 0 })) {
      eq(s.authority[fid], before[fid] - amt, `${fid} paid ${amt}`);
    }
    eq(s.tracks.initiative.join(','), 'F1,F2,F3,F4,F5,F6', 'highest bid leads');
    eq(s.tokens.sovereign, 'F1', 'the sovereign token passes to the new head');
  }},

  { name: 'ties are ordered by the CURRENT sovereign holder — self-placement included (Rules p.15)', fn() {
    let s = toClash();
    // F3 holds the sovereign token at setup. Everyone bids 1: total tie.
    s = bidAll(s, { F1: 1, F2: 1, F3: 1, F4: 1, F5: 1, F6: 1 });
    const tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    ok(tq && tq.faction === 'F3', 'the sovereign judges');
    eq(tq.tied.length, 6, 'the whole table is tied');
    throws(() => act(s, { type: 'bidTieBreak', faction: 'F3', track: 'initiative',
      order: ['F3', 'F3', 'F1', 'F2', 'F4', 'F5'] }), 'not a permutation');
    s = act(s, { type: 'bidTieBreak', faction: 'F3', track: 'initiative',
      order: ['F3', 'F6', 'F5', 'F4', 'F2', 'F1'] });
    eq(s.tracks.initiative[0], 'F3', 'the judge crowned themselves');
    eq(s.tokens.sovereign, 'F3');
  }},

  { name: 'winning the first track changes who breaks ties on the next (Rules p.15)', fn() {
    let s = toClash();
    // Track 1: F5 outbids everyone → sovereign passes to F5.
    s = bidAll(s, { F1: 0, F2: 1, F3: 2, F4: 3, F5: 4, F6: 0 });
    // F1/F6 tied at 0 → judged by the OLD holder? No: the token moved the
    // moment the track rebuilt? It rebuilds only after ALL slots settle —
    // the tie inside track 1 is judged by the setup holder F3.
    let tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    eq(tq.faction, 'F3', 'track-1 ties belong to the incumbent');
    s = act(s, { type: 'bidTieBreak', faction: 'F3', track: 'initiative', order: ['F6', 'F1'] });
    eq(s.tokens.sovereign, 'F5', 'the crown moved');
    // Track 2 (prowess) opens; a fresh tie is now judged by F5.
    s = bidAll(s, { F1: 2, F2: 2, F3: 0, F4: 0, F5: 0, F6: 1 });
    tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    eq(tq.faction, 'F5', 'the NEW sovereign judges track 2');
    eq(tq.track, 'prowess');
    s = act(s, { type: 'bidTieBreak', faction: 'F5', track: 'prowess', order: ['F2', 'F1'] });
    tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    eq(tq.faction, 'F5', 'and the trailing zero-tie too');
    s = act(s, { type: 'bidTieBreak', faction: 'F5', track: 'prowess', order: ['F5', 'F4', 'F3'] });
    eq(s.tracks.prowess.join(','), 'F2,F1,F6,F5,F4,F3');
    eq(s.tokens.blade, 'F2', 'the blade follows first place');
  }},

  { name: 'three tracks run on a shrinking purse; the round then proceeds (Rules p.14)', fn() {
    let s = toClash();
    const purse = { ...s.authority };
    s = bidAll(s, { F1: purse.F1, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0 }); // F1 all-in on track 1
    let tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    s = act(s, { type: 'bidTieBreak', faction: tq.faction, track: 'initiative', order: ['F3', 'F2', 'F4', 'F5', 'F6'] });
    eq(s.authority.F1, 0, 'broke');
    throws(() => act(s, { type: 'bid', faction: 'F1', track: 'prowess', amount: 1 }), 'cannot bid what you lack');
    s = bidAll(s, { F1: 0, F2: 1, F3: 2, F4: 3, F5: 4, F6: 0 });
    tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    if (tq) s = act(s, { type: 'bidTieBreak', faction: tq.faction, track: tq.track, order: tq.tied });
    s = bidAll(s, { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 1 });
    tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    if (tq) s = act(s, { type: 'bidTieBreak', faction: tq.faction, track: tq.track, order: tq.tied });
    ok(!s.eventPhase?.bidding, 'the auction closed');
    eq(s.phase, 'planning', 'the world turns');
    eq(s.tracks.command[0], 'F6', 'the courier auction went to the last coin');
    eq(s.tokens.courier, 'F6');
  }},

  { name: 'the rebuilt command track re-prices the stars for the next planning (Rules p.11)', fn() {
    let s = toClash();
    // Hand the command crown to F6 (0 stars today) with a decisive purse.
    s = bidAll(s, { F1: 1, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0 }); // initiative
    let tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    s = act(s, { type: 'bidTieBreak', faction: tq.faction, track: 'initiative', order: ['F2', 'F3', 'F4', 'F5', 'F6'] });
    s = bidAll(s, { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 1 }); // prowess
    tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    s = act(s, { type: 'bidTieBreak', faction: tq.faction, track: 'prowess', order: ['F1', 'F2', 'F3', 'F4', 'F5'] });
    s = bidAll(s, { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 3 }); // command — F6 seizes it
    tq = s.pendingQueries.find(q => q.type === 'bidTieBreak');
    s = act(s, { type: 'bidTieBreak', faction: tq.faction, track: 'command', order: ['F1', 'F2', 'F3', 'F4', 'F5'] });
    eq(s.tracks.command[0], 'F6');
    eq(STAR_ALLOWANCE[6][s.tracks.command.indexOf('F6')], 3, 'zero-star Norway now prices three stars');
    eq(s.phase, 'planning');
  }},

];
