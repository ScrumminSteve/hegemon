#!/usr/bin/env node
// M3.d eval harness — the fitness function (owner decisions, Jul 2026:
// maximize WIN RATE with guardrail secondaries; design for unattended runs).
//
//   node tools/eval.mjs [--games 60] [--seed 7000] [--challenger file.json]
//                       [--incumbent v1|random] [--workers N] [--json out.json]
//
// The standard matchup: ONE challenger seat vs five incumbents, challenger
// rotating through all six factions, seed advancing per game — matching the
// real victory condition (win a six-player table; null hypothesis 1/6).
// Common random numbers: a fixed (seedBase, games) pair defines an exact
// game block, so two candidates evaluated on the same block are PAIRED and
// their difference is policy, not draw. Jitter is OFF here by design: a
// candidate is its exact weights; jitter stays a play-variety feature.
//
// Guardrail secondaries ride on every report: mean rank, worst-seat mean
// rank, mean rounds (a degenerate staller shows up here), and rejections —
// which are a HARD ABORT, never a statistic (the zero-rejection contract).

import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { viewFor } from '../src/engine/views.js';
import { legalActions, currentQuery } from '../src/engine/legal.js';
import { createHeuristicAgent, effectiveWeights } from '../src/agents/heuristic.js';
import { createRandomAgent, botRng } from '../src/agents/random.js';

const MAX_ACTIONS = 6000;

/** Wilson 95% score interval — honest about small N. */
export function wilson(wins, n, z = 1.96) {
  if (!n) return { p: 0, lo: 0, hi: 1 };
  const p = wins / n, z2 = z * z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / den;
  return { p, lo: Math.max(0, mid - half), hi: Math.min(1, mid + half) };
}

/** Play one evaluation game. challengerCfg: weights config ({shared,perFaction}
    or flat) — null means stock v1. incumbent: 'v1' | 'random'. */
export function playEvalGame({ seed, challengerSeat, challengerCfg = null, incumbent = 'v1' }) {
  let s = createGame(6, { seed });
  beginPlanning(s);
  const hero = s.factions[challengerSeat];
  const agents = {};
  for (const fid of s.factions) {
    if (fid === hero) agents[fid] = createHeuristicAgent({ weights: effectiveWeights(challengerCfg, fid) });
    else agents[fid] = incumbent === 'random' ? createRandomAgent() : createHeuristicAgent({});
  }
  const rng = botRng(seed * 31 + 7);
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > MAX_ACTIONS) throw new Error(`eval seed ${seed}: stuck after ${steps} actions`);
    const q = currentQuery(s);
    const menu = legalActions(s, q);
    // Any applyAction throw aborts the whole run — an engine bug found by
    // eval is a P1, not a data point to average over.
    s = applyAction(s, agents[q.faction].decide(viewFor(s, q.faction), q, menu, rng)).state;
  }
  const over = s.log.filter(e => e.event === 'gameOver').pop();
  return {
    seed, hero, seat: challengerSeat,
    won: over.standings[0] === hero,
    rank: over.standings.indexOf(hero) + 1,
    rounds: s.round,
  };
}

export function aggregate(results) {
  const n = results.length;
  const wins = results.filter(r => r.won).length;
  const bySeat = {};
  for (const r of results) {
    (bySeat[r.hero] ||= { games: 0, wins: 0, rankSum: 0 });
    bySeat[r.hero].games++; bySeat[r.hero].rankSum += r.rank;
    if (r.won) bySeat[r.hero].wins++;
  }
  const seatStats = Object.fromEntries(Object.entries(bySeat).map(([f, s]) =>
    [f, { games: s.games, wins: s.wins, meanRank: +(s.rankSum / s.games).toFixed(3) }]));
  const worstSeatMeanRank = Math.max(...Object.values(seatStats).map(s => s.meanRank));
  return {
    games: n, wins, winRate: +(wins / n).toFixed(4), ci: wilson(wins, n),
    meanRank: +(results.reduce((a, r) => a + r.rank, 0) / n).toFixed(3),
    worstSeatMeanRank,
    meanRounds: +(results.reduce((a, r) => a + r.rounds, 0) / n).toFixed(2),
    seatStats,
  };
}

/** Serial evaluation — deterministic, hermetic; the goldens use this. */
export function evaluateSerial(challengerCfg, { games = 60, seedBase = 7000, incumbent = 'v1' } = {}) {
  const results = [];
  for (let i = 0; i < games; i++) {
    results.push(playEvalGame({ seed: seedBase + i, challengerSeat: i % 6, challengerCfg, incumbent }));
  }
  return aggregate(results);
}

/** Parallel evaluation over worker_threads; falls back to serial at 1 worker.
    Determinism holds either way: every game is fully seeded and independent. */
export async function evaluate(challengerCfg, opts = {}) {
  const { games = 60, seedBase = 7000, incumbent = 'v1' } = opts;
  const workers = Math.max(1, opts.workers ?? (cpus().length - 1));
  if (workers === 1) return evaluateSerial(challengerCfg, { games, seedBase, incumbent });
  const { Worker } = await import('node:worker_threads');
  const specs = Array.from({ length: games }, (_, i) =>
    ({ seed: seedBase + i, challengerSeat: i % 6, challengerCfg, incumbent }));
  const results = [];
  await Promise.all(Array.from({ length: workers }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL('./eval-worker.mjs', import.meta.url));
    const feed = () => {
      const spec = specs.pop();
      if (!spec) { w.terminate(); resolve(); return; }
      w.postMessage(spec);
    };
    w.on('message', m => {
      if (m.error) { w.terminate(); reject(new Error(m.error)); return; }
      results.push(m.result); feed();
    });
    w.on('error', reject);
    feed();
  })));
  return aggregate(results);
}

// ---------------------------------------------------------------------------
// Windows-safe CLI detection (owner bug report, Jul 2026): `file://` +
// argv[1] never matches on Windows paths (C:\ + backslashes) — the tool
// loaded, matched nothing, and exited silently with a 0-byte redirect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? d : process.argv[i + 1]; };
  const games = Number(arg('games', 60)), seedBase = Number(arg('seed', 7000));
  const incumbent = arg('incumbent', 'v1');
  const challengerFile = arg('challenger', null);
  const challengerCfg = challengerFile ? JSON.parse((await import('node:fs')).readFileSync(challengerFile, 'utf8')) : null;
  const workers = Number(arg('workers', Math.max(1, cpus().length - 1)));
  const t0 = Date.now();
  const stats = await evaluate(challengerCfg, { games, seedBase, incumbent, workers });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`challenger ${challengerFile || 'v1 (stock)'} vs ${incumbent} — ${games} games, ${workers} worker(s), ${secs}s`);
  console.log(`win rate ${(stats.winRate * 100).toFixed(1)}% [${(stats.ci.lo * 100).toFixed(1)}–${(stats.ci.hi * 100).toFixed(1)}] (null 16.7%)`);
  console.log(`mean rank ${stats.meanRank} · worst seat ${stats.worstSeatMeanRank} · mean rounds ${stats.meanRounds}`);
  console.log('per seat:', Object.entries(stats.seatStats).map(([f, s]) => `${f} ${s.wins}/${s.games} r${s.meanRank}`).join('  '));
  const out = arg('json', null);
  if (out) { writeFileSync(out, JSON.stringify(stats, null, 1)); console.log(`→ ${out}`); }
}
