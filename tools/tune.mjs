#!/usr/bin/env node
// M3.d weight tuner — SPSA in log-space over the shared WEIGHTS vector.
// The first learning loop (owner decisions Jul 2026: maximize WIN RATE,
// guardrail secondaries, design for unattended overnight runs, shared
// vector first with per-faction deltas ready in the schema).
//
//   node tools/tune.mjs --run runs/night1.json [--iters 60] [--games 40]
//                       [--check-every 5] [--check-games 120] [--workers N]
//   node tools/tune.mjs --resume runs/night1.json
//
// Why SPSA: ~50 weights would cost 50+ evaluations per coordinate sweep;
// SPSA estimates the full gradient with TWO evaluations per iteration
// regardless of dimension — perturb every weight simultaneously
// (multiplicatively, hence log-space: weights are positive scales), score
// both perturbations on the SAME seed block (paired), step along the
// difference. Seed blocks rotate per iteration so we tune the policy, not
// the draws.
//
// Guardrails (owner decision): every check-eval must not degrade worst-seat
// mean rank beyond tolerance and must not fall behind best-so-far win rate;
// a breach REVERTS to the best checkpoint and halves the step size.
//
// Unattended by construction: every iteration checkpoints atomically;
// --resume continues mid-run; the run ends with a VERIFICATION pass on
// held-out seeds at larger N — the honest number (best-so-far over noisy
// evals flatters itself; winner's curse is priced in, not ignored).

import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { WEIGHTS } from '../src/agents/heuristic.js';
import { evaluate } from './eval.mjs';

const KEYS = Object.keys(WEIGHTS);

// ---------------------------------------------------------------------------
// pure helpers (golden-tested)
// ---------------------------------------------------------------------------

export const toTheta = w => KEYS.map(k => Math.log(w[k]));
export const toWeights = th => Object.fromEntries(KEYS.map((k, i) => [k, Math.exp(th[i])]));

/** Deterministic Rademacher perturbation for iteration k of a run. */
export function rademacher(runSeed, k, n = KEYS.length) {
  let x = (runSeed * 2654435761 + k * 40503) >>> 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    out.push(x & 1 ? 1 : -1);
  }
  return out;
}

/** Standard SPSA gains. */
export const gainA = (k, a0 = 0.06, A = 8) => a0 / Math.pow(k + 1 + A, 0.602);
export const gainC = (k, c0 = 0.15) => c0 / Math.pow(k + 1, 0.101);

/** One SPSA update: maximize y. Returns the new theta. */
export function spsaStep(theta, delta, yPlus, yMinus, a, c) {
  const g = (yPlus - yMinus) / (2 * c);
  return theta.map((t, i) => t + a * g * delta[i]);
}

// ---------------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------------

function saveCheckpoint(path, cp) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(cp, null, 1));
  renameSync(tmp, path); // atomic on the same filesystem — a killed run never corrupts
}

export async function tune(path, cfg = {}) {
  let cp;
  try {
    cp = JSON.parse(readFileSync(path, 'utf8'));
    console.log(`resuming ${path} at iteration ${cp.iter}`);
  } catch {
    const runSeed = cfg.runSeed ?? Math.floor(Math.random() * 1e9);
    cp = {
      config: {
        runSeed, iters: cfg.iters ?? 60, games: cfg.games ?? 40,
        checkEvery: cfg.checkEvery ?? 5, checkGames: cfg.checkGames ?? 120,
        workers: cfg.workers, incumbent: 'v1', seedBase: cfg.seedBase ?? 100000,
        worstSeatTol: cfg.worstSeatTol ?? 0.5, winRateTol: cfg.winRateTol ?? 0.03,
        aScale: 1,
      },
      iter: 0,
      theta: toTheta(WEIGHTS),
      best: null,     // { theta, stats, iter }
      baseline: null, // v1-vs-v1 guardrail anchors on the check block
      history: [],
    };
    mkdirSync(new URL('../runs/', import.meta.url), { recursive: true });
  }
  const C = cp.config;
  const evalOpts = extra => ({ workers: C.workers, incumbent: C.incumbent, ...extra });

  if (!cp.baseline) {
    console.log('measuring the v1 baseline on the check block…');
    cp.baseline = await evaluate(null, evalOpts({ games: C.checkGames, seedBase: C.seedBase - C.checkGames }));
    cp.best = { theta: [...cp.theta], stats: cp.baseline, iter: 0 };
    saveCheckpoint(path, cp);
    console.log(`baseline: win ${(cp.baseline.winRate * 100).toFixed(1)}% · worst seat ${cp.baseline.worstSeatMeanRank}`);
  }

  while (cp.iter < C.iters) {
    const k = cp.iter;
    const a = gainA(k) * C.aScale, c = gainC(k);
    const delta = rademacher(C.runSeed, k);
    const block = C.seedBase + k * C.games; // rotating paired block
    const wPlus = toWeights(cp.theta.map((t, i) => t + c * delta[i]));
    const wMinus = toWeights(cp.theta.map((t, i) => t - c * delta[i]));
    const t0 = Date.now();
    const sPlus = await evaluate({ shared: wPlus }, evalOpts({ games: C.games, seedBase: block }));
    const sMinus = await evaluate({ shared: wMinus }, evalOpts({ games: C.games, seedBase: block }));
    cp.theta = spsaStep(cp.theta, delta, sPlus.winRate, sMinus.winRate, a, c);
    cp.iter++;
    cp.history.push({ k, block, plus: sPlus.winRate, minus: sMinus.winRate, secs: +((Date.now() - t0) / 1000).toFixed(1) });
    console.log(`iter ${cp.iter}/${C.iters}: y+ ${(sPlus.winRate * 100).toFixed(1)}% y- ${(sMinus.winRate * 100).toFixed(1)}% (${cp.history.at(-1).secs}s)`);

    if (cp.iter % C.checkEvery === 0 || cp.iter === C.iters) {
      const stats = await evaluate({ shared: toWeights(cp.theta) },
        evalOpts({ games: C.checkGames, seedBase: C.seedBase - C.checkGames }));
      const bestWin = cp.best.stats.winRate;
      const guardBreach = stats.worstSeatMeanRank > cp.baseline.worstSeatMeanRank + C.worstSeatTol;
      const regressed = stats.winRate < bestWin - C.winRateTol;
      console.log(`  check: win ${(stats.winRate * 100).toFixed(1)}% [${(stats.ci.lo * 100).toFixed(1)}–${(stats.ci.hi * 100).toFixed(1)}] worst-seat ${stats.worstSeatMeanRank}${guardBreach ? ' GUARDRAIL BREACH' : ''}${regressed ? ' REGRESSED' : ''}`);
      if (guardBreach || regressed) {
        cp.theta = [...cp.best.theta];
        C.aScale *= 0.5;
        console.log(`  reverted to best (iter ${cp.best.iter}); step scale now ${C.aScale}`);
      } else if (stats.winRate > bestWin) {
        cp.best = { theta: [...cp.theta], stats, iter: cp.iter };
        console.log('  new best.');
      }
    }
    saveCheckpoint(path, cp);
  }

  // Verification: held-out seeds, larger N — the number that ships.
  console.log('verification pass (held-out seeds)…');
  const verify = await evaluate({ shared: toWeights(cp.best.theta) },
    evalOpts({ games: C.checkGames * 2, seedBase: C.seedBase + 1e6 }));
  cp.verified = verify;
  cp.bestWeights = { shared: toWeights(cp.best.theta), perFaction: {} };
  saveCheckpoint(path, cp);
  console.log(`VERIFIED: win ${(verify.winRate * 100).toFixed(1)}% [${(verify.ci.lo * 100).toFixed(1)}–${(verify.ci.hi * 100).toFixed(1)}] vs null 16.7% · worst seat ${verify.worstSeatMeanRank}`);
  console.log(`best weights in ${path} under .bestWeights — feed to eval.mjs --challenger or bake as WEIGHTS-v2`);
  return cp;
}

// ---------------------------------------------------------------------------
// Windows-safe CLI detection (owner bug report, Jul 2026): `file://` +
// argv[1] never matches on Windows paths (C:\ + backslashes) — the tool
// loaded, matched nothing, and exited silently with a 0-byte redirect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (kk, d) => { const i = process.argv.indexOf(`--${kk}`); return i === -1 ? d : process.argv[i + 1]; };
  const path = arg('resume', null) || arg('run', null);
  if (!path) { console.error('usage: node tools/tune.mjs --run runs/x.json | --resume runs/x.json'); process.exit(1); }
  await tune(path, {
    iters: Number(arg('iters', 60)), games: Number(arg('games', 40)),
    checkEvery: Number(arg('check-every', 5)), checkGames: Number(arg('check-games', 120)),
    workers: arg('workers', null) ? Number(arg('workers')) : undefined,
    runSeed: arg('run-seed', null) ? Number(arg('run-seed')) : undefined,
  });
}
