#!/usr/bin/env node
// M3.d seat-bias study — the F6 question, answered properly.
//
//   node tools/seatbias.mjs [--games 60] [--seed 300000] [--workers N]
//
// The IDENTICAL un-jittered heuristic in every seat: any deviation from a
// 1/6 win share per faction is pure map/turn-order structure, not policy.
// Wilson CIs keep small-N honest. Feeds the per-faction delta decision
// (schema already live in effectiveWeights).

import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { viewFor } from '../src/engine/views.js';
import { legalActions, currentQuery } from '../src/engine/legal.js';
import { createHeuristicAgent } from '../src/agents/heuristic.js';
import { botRng } from '../src/agents/random.js';
import { wilson } from './eval.mjs';

export function playSymmetricGame(seed) {
  let s = createGame(6, { seed });
  beginPlanning(s);
  const agent = createHeuristicAgent({}); // one mind, six bodies
  const rng = botRng(seed * 31 + 7);
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > 6000) throw new Error(`seatbias seed ${seed}: stuck`);
    const q = currentQuery(s);
    s = applyAction(s, agent.decide(viewFor(s, q.faction), q, legalActions(s, q), rng)).state;
  }
  const over = s.log.filter(e => e.event === 'gameOver').pop();
  return { winner: over.standings[0], standings: over.standings, rounds: s.round };
}

// Windows-safe CLI detection (owner bug report, Jul 2026): `file://` +
// argv[1] never matches on Windows paths (C:\ + backslashes) — the tool
// loaded, matched nothing, and exited silently with a 0-byte redirect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? d : process.argv[i + 1]; };
  const games = Number(arg('games', 60)), seedBase = Number(arg('seed', 300000));
  const t0 = Date.now();
  const wins = {}, rankSum = {};
  let factions = null;
  for (let i = 0; i < games; i++) {
    let r;
    try { r = playSymmetricGame(seedBase + i); }
    catch (e) {
      // Diagnosability (owner runs, Jul 2026): a crash NAMES its seed, and it
      // lands on stderr so a stdout redirect never swallows it.
      console.error(`\nCRASH at seed ${seedBase + i} (game ${i + 1}/${games}) — report this seed:\n${e.message}`);
      process.exit(1);
    }
    if ((i + 1) % 25 === 0) console.error(`…${i + 1}/${games} games (seed ${seedBase + i})`);
    factions = factions || [...r.standings].sort();
    wins[r.winner] = (wins[r.winner] || 0) + 1;
    r.standings.forEach((f, idx) => { rankSum[f] = (rankSum[f] || 0) + idx + 1; });
  }
  console.log(`${games} symmetric games, ${((Date.now() - t0) / 1000).toFixed(1)}s (null: ${(100 / 6).toFixed(1)}% each)\n`);
  for (const f of factions) {
    const w = wins[f] || 0, ci = wilson(w, games);
    const flag = ci.lo > 1 / 6 ? '  ↑ FAVORED' : ci.hi < 1 / 6 ? '  ↓ DISFAVORED' : '';
    console.log(`${f}: ${w}/${games} wins (${(ci.p * 100).toFixed(1)}% [${(ci.lo * 100).toFixed(1)}–${(ci.hi * 100).toFixed(1)}]) · mean rank ${(rankSum[f] / games).toFixed(2)}${flag}`);
  }
  console.log('\nA faction flagged only when its 95% CI clears 1/6 entirely.');
}
