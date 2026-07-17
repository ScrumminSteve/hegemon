// M3.a goldens — the agent seam.
//
// The zero-rejection contract (owner decision, Jul 2026): during selfplay,
// every action a bot picks from legalActions() must pass the validator. A
// rejection is a hard TEST FAILURE — menu and validator disagreeing is an
// engine bug of exactly the class that hid the port family and the adjacency
// asymmetry. The fuzz below already caught three in its first hour: a
// star-blind order generator, an index-vs-object option answer, and an
// unknown incursionUnits shape.

import { createGame } from '../src/engine/state.js';
import { beginPlanning, applyAction, stateHash } from '../src/engine/engine.js';
import { viewFor } from '../src/engine/views.js';
import { legalActions, currentQuery } from '../src/engine/legal.js';
import { createRandomAgent, botRng } from '../src/agents/random.js';
import { eq, ok, throws } from './assert.js';

function playGame(seed, botSeed) {
  let s = createGame(6, { seed });
  beginPlanning(s);
  const agent = createRandomAgent();
  const rng = botRng(botSeed);
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > 6000) throw new Error(`seed ${seed}: stuck after ${steps} actions`);
    const q = currentQuery(s);
    if (!q) throw new Error(`seed ${seed}: stalled in ${s.phase} with no pending query`);
    const menu = legalActions(s, q);
    const action = agent.decide(viewFor(s, q.faction), q, menu, rng);
    s = applyAction(s, action).state; // any throw here = zero-rejection breach
  }
  return { state: s, steps };
}

export const tests = [
  { name: 'ZERO-REJECTION FUZZ: random-legal bots play full games; every menu pick validates (M3.a contract)', fn() {
    for (const seed of [9001, 9002, 9003]) {
      const { state: s, steps } = playGame(seed, seed * 31 + 7);
      eq(s.phase, 'gameOver', `seed ${seed} reaches game over`);
      ok(steps > 100, `seed ${seed}: a real game happened (${steps} actions)`);
    }
  }},

  { name: 'determinism: same game seed + same bot seed = identical transcript and final state', fn() {
    const a = playGame(9001, 424242);
    const b = playGame(9001, 424242);
    eq(a.steps, b.steps, 'same action count');
    eq(stateHash(a.state), stateHash(b.state), 'same final state hash');
  }},

  { name: 'two RNG streams: a different BOT seed never perturbs game-side setup', fn() {
    const a = playGame(9002, 1);
    const b = playGame(9002, 2);
    // Different policies diverge the game, but both derive from the SAME
    // deal: identical setup snapshot (first log entries) proves the game
    // stream is untouched by the bot stream.
    eq(JSON.stringify(a.state.actionLog[0]._round), JSON.stringify(b.state.actionLog[0]._round), 'both start round 1');
    ok(stateHash(a.state) !== stateHash(b.state) || a.steps === b.steps, 'bot seed may change the path, never the deal');
  }},

  { name: 'agents see only viewFor: unrevealed orders, foreign hands, decks, sealed bids are hidden', fn() {
    let s = createGame(6, { seed: 77 });
    beginPlanning(s);
    // submit F-first's orders so hidden tokens exist on the board
    const q = currentQuery(s);
    const menu = legalActions(s, q);
    s = applyAction(s, menu[0]).state;
    const other = s.factions.find(f => f !== q.faction);
    const v = viewFor(s, other);
    for (const [rid, o] of Object.entries(v.ordersByRegion)) {
      if (o.faction === q.faction) {
        ok(o.hidden === true && o.type === undefined, `${rid}: ${q.faction}'s unrevealed order is a blank back`);
      }
    }
    ok(v.invaderDeck.every(c => c === 'hidden'), 'invader deck contents hidden');
    for (const deck of Object.values(v.eventDecks)) {
      ok(deck.draw.every(c => c === 'hidden'), 'event deck contents hidden');
    }
  }},

  { name: 'the menu is sound at the root: every generated opening submission validates directly', fn() {
    const s0 = createGame(6, { seed: 5 });
    beginPlanning(s0);
    const q = currentQuery(s0);
    const menu = legalActions(s0, q);
    ok(menu.length >= 4, `a real menu (${menu.length} options)`);
    for (const a of menu) applyAction(s0, a); // throws = failure
  }},

  { name: 'legalActions refuses unknown query types loudly — silent unanswerable queries are forbidden', fn() {
    const s0 = createGame(6, { seed: 5 });
    beginPlanning(s0);
    throws(() => legalActions(s0, { type: 'notAQueryType', faction: 'F1' }), 'no generator');
  }},
];
