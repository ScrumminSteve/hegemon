#!/usr/bin/env node
// Headless selfplay runner (M3.a).
//
//   node tools/selfplay.mjs [games=10] [seed0=1000] [seats=6]
//
// Random-legal agents in every seat, to completion. Owner decisions baked in:
// a validator rejection is a HARD FAILURE (exit 1) — menu and validator
// disagreeing is an engine bug, never something to retry around. Episodes
// land in episodes/ (git-ignored): full config, both seeds, rulesRevision,
// action transcript, result, state hash.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning, stateHash, RULES_REVISION } from '../src/engine/engine.js';
import { viewFor } from '../src/engine/views.js';
import { legalActions, currentQuery } from '../src/engine/legal.js';
import { createRandomAgent, botRng } from '../src/agents/random.js';

const [games = 10, seed0 = 1000, seats = 6] = process.argv.slice(2).map(Number);
const MAX_ACTIONS = 6000; // a stuck game is a bug, not patience

mkdirSync(new URL('../episodes/', import.meta.url), { recursive: true });

export function playGame(seed, botSeed, seatCount = 6) {
  let s = createGame(seatCount, { seed });
  beginPlanning(s);
  const agent = createRandomAgent();
  const rng = botRng(botSeed);
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > MAX_ACTIONS) throw new Error(`seed ${seed}: exceeded ${MAX_ACTIONS} actions — the game is stuck (engine bug)`);
    const q = currentQuery(s);
    if (!q) throw new Error(`seed ${seed}: no pending query but game not over (phase ${s.phase}) — the engine stalled`);
    const menu = legalActions(s, q);
    const action = agent.decide(viewFor(s, q.faction), q, menu, rng);
    try {
      s = applyAction(s, action).state;
    } catch (e) {
      // The zero-rejection contract: this is the fuzz finding an engine bug.
      e.message = `REJECTION seed=${seed} step=${steps} query=${q.type} action=${JSON.stringify(action)} :: ${e.message}`;
      throw e;
    }
  }
  return { state: s, steps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i, botSeed = seed * 31 + 7;
    const { state: s, steps } = playGame(seed, botSeed, seats);
    const ep = {
      config: { seed, botSeed, seatCount: seats, agents: 'random-v1' },
      rulesRevision: RULES_REVISION,
      result: s.log.filter(e => /victory|gameOver|roundLimit/i.test(e.event)).slice(-3),
      rounds: s.round, actions: s.actionLog, stateHash: stateHash(s),
    };
    const path = new URL(`../episodes/ep-${seed}-${botSeed}.json`, import.meta.url);
    writeFileSync(path, JSON.stringify(ep));
    console.log(`seed ${seed}: ${steps} actions, ${s.round} rounds -> episodes/ep-${seed}-${botSeed}.json`);
  }
  console.log(`${games} games, zero rejections, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
