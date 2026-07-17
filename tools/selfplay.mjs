#!/usr/bin/env node
// Headless selfplay runner (M3.a; agent mixes M3.b).
//
//   node tools/selfplay.mjs [games=10] [seed0=1000] [seats=6] [mix=random]
//
//   mix: 'random' | 'heuristic' | per-seat list 'h,r,r,h,r,r'
//
// Owner decisions baked in: a validator rejection is a HARD FAILURE (exit 1) —
// menu and validator disagreeing is an engine bug, never something to retry
// around. Heuristic seats get seeded per-seat weight jitter (owner decision,
// M3.b) so bot-vs-bot games aren't mirror matches; jitter seeds are recorded
// in episode config for exact replay. Episodes land in episodes/ (git-ignored):
// full config, both seeds, per-seat agent ids, rulesRevision, transcript,
// result, state hash.

import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning, stateHash, RULES_REVISION } from '../src/engine/engine.js';
import { viewFor } from '../src/engine/views.js';
import { legalActions, currentQuery } from '../src/engine/legal.js';
import { createRandomAgent, botRng } from '../src/agents/random.js';
import { createHeuristicAgent } from '../src/agents/heuristic.js';

const MAX_ACTIONS = 6000; // a stuck game is a bug, not patience

/** Build the per-faction agent roster for one game. */
export function buildAgents(factions, mix, botSeed) {
  const kinds = mix.includes(',')
    ? mix.split(',').map(s => s.trim())
    : factions.map(() => mix);
  if (kinds.length !== factions.length) {
    throw new Error(`mix has ${kinds.length} seats; game has ${factions.length}`);
  }
  const agents = {};
  factions.forEach((fid, i) => {
    const k = kinds[i][0].toLowerCase();
    agents[fid] = k === 'h'
      ? createHeuristicAgent({ jitterSeed: botSeed * 131 + i })
      : createRandomAgent();
  });
  return agents;
}

export function playGame(seed, botSeed, seatCount = 6, mix = 'random') {
  let s = createGame(seatCount, { seed });
  beginPlanning(s);
  const agents = buildAgents(s.factions, mix, botSeed);
  const rng = botRng(botSeed);
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > MAX_ACTIONS) throw new Error(`seed ${seed}: exceeded ${MAX_ACTIONS} actions — the game is stuck (engine bug)`);
    const q = currentQuery(s);
    if (!q) throw new Error(`seed ${seed}: no pending query but game not over (phase ${s.phase}) — the engine stalled`);
    const menu = legalActions(s, q);
    const action = agents[q.faction].decide(viewFor(s, q.faction), q, menu, rng);
    try {
      s = applyAction(s, action).state;
    } catch (e) {
      // The zero-rejection contract: this is the fuzz finding an engine bug.
      e.message = `REJECTION seed=${seed} step=${steps} agent=${agents[q.faction].id} query=${q.type} action=${JSON.stringify(action)} :: ${e.message}`;
      throw e;
    }
  }
  return { state: s, steps, agents };
}

// Windows-safe CLI detection (owner bug report, Jul 2026): `file://` +
// argv[1] never matches on Windows paths (C:\ + backslashes) — the tool
// loaded, matched nothing, and exited silently with a 0-byte redirect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [games = 10, seed0 = 1000, seats = 6] = process.argv.slice(2, 5).map(Number);
  const mix = process.argv[5] || 'random';
  mkdirSync(new URL('../episodes/', import.meta.url), { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i, botSeed = seed * 31 + 7;
    const { state: s, steps, agents } = playGame(seed, botSeed, seats, mix);
    const ep = {
      config: {
        seed, botSeed, seatCount: seats, mix,
        agents: Object.fromEntries(Object.entries(agents).map(([f, a]) => [f, a.id])),
      },
      rulesRevision: RULES_REVISION,
      result: s.log.filter(e => /victory|gameOver|roundLimit/i.test(e.event)).slice(-3),
      rounds: s.round, actions: s.actionLog, stateHash: stateHash(s),
    };
    const path = new URL(`../episodes/ep-${seed}-${botSeed}.json`, import.meta.url);
    writeFileSync(path, JSON.stringify(ep));
    console.log(`seed ${seed}: ${steps} actions, ${s.round} rounds -> episodes/ep-${seed}-${botSeed}.json`);
  }
  console.log(`${games} games (mix=${mix}), zero rejections, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
