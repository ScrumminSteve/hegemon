// M3.d goldens — the eval harness and the tuning mechanics.
//
// The harness is the fitness function every later learning stage (M3.e
// corpus statistics, M3.f small nets) trusts, so its own math and
// determinism are golden-locked. Real tuning runs live in tools/ (owner
// decision: unattended overnight); in-suite we lock the pure parts and one
// tiny paired evaluation.

import { wilson, evaluateSerial, aggregate } from '../tools/eval.mjs';
import { toTheta, toWeights, rademacher, spsaStep } from '../tools/tune.mjs';
import { effectiveWeights, WEIGHTS } from '../src/agents/heuristic.js';
import { eq, ok } from './assert.js';

export const tests = [
  { name: 'wilson interval: known values, degenerate cases, and honest small-N width', fn() {
    const c = wilson(5, 10);
    ok(Math.abs(c.p - 0.5) < 1e-9 && c.lo > 0.23 && c.lo < 0.24 && c.hi > 0.76 && c.hi < 0.77,
      `5/10 → [~.237, ~.763], got [${c.lo.toFixed(3)}, ${c.hi.toFixed(3)}]`);
    const zero = wilson(0, 20);
    ok(zero.lo === 0 && zero.hi > 0 && zero.hi < 0.2, '0/20 keeps a nonzero upper bound');
    const none = wilson(0, 0);
    ok(none.lo === 0 && none.hi === 1, 'no data = no claim');
    ok(wilson(50, 100).hi - wilson(50, 100).lo < wilson(5, 10).hi - wilson(5, 10).lo,
      'more games, tighter interval');
  }},

  { name: 'effectiveWeights: legacy flat, shared, and multiplicative per-faction deltas all resolve (M3.d schema)', fn() {
    eq(effectiveWeights(null, 'F1').wSeat, WEIGHTS.wSeat, 'null = stock v1');
    eq(effectiveWeights({ wSeat: 12 }, 'F1').wSeat, 12, 'legacy flat overrides');
    const cfg = { shared: { wSeat: 10 }, perFaction: { F6: { wSeat: 1.5 } } };
    eq(effectiveWeights(cfg, 'F1').wSeat, 10, 'shared applies to everyone');
    eq(effectiveWeights(cfg, 'F6').wSeat, 15, 'a faction delta multiplies on top');
    eq(effectiveWeights(cfg, 'F6').vCavalry, WEIGHTS.vCavalry, 'untouched keys fall through to stock');
  }},

  { name: 'aggregate: win rate, seat stats, worst-seat guardrail computed correctly on synthetic results', fn() {
    const stats = aggregate([
      { hero: 'F1', won: true, rank: 1, rounds: 8 },
      { hero: 'F1', won: false, rank: 3, rounds: 10 },
      { hero: 'F2', won: false, rank: 6, rounds: 9 },
      { hero: 'F2', won: false, rank: 6, rounds: 9 },
    ]);
    eq(stats.winRate, 0.25);
    eq(stats.seatStats.F1.meanRank, 2);
    eq(stats.seatStats.F2.meanRank, 6);
    eq(stats.worstSeatMeanRank, 6, 'the guardrail sees the worst seat');
    eq(stats.meanRounds, 9);
  }},

  { name: 'HARNESS DETERMINISM: the same seed block yields the identical aggregate, twice (common random numbers)', fn() {
    const a = evaluateSerial(null, { games: 2, seedBase: 9500 });
    const b = evaluateSerial(null, { games: 2, seedBase: 9500 });
    eq(JSON.stringify(a), JSON.stringify(b), 'paired evaluation is exactly reproducible');
    ok(a.games === 2 && a.ci.lo >= 0 && a.ci.hi <= 1, 'a real aggregate came back');
  }},

  { name: 'SPSA mechanics: log-space roundtrip, deterministic perturbations, gradient sign (M3.d)', fn() {
    const th = toTheta(WEIGHTS);
    const back = toWeights(th);
    ok(Object.keys(WEIGHTS).every(k => Math.abs(back[k] - WEIGHTS[k]) < 1e-9), 'theta roundtrips');
    eq(JSON.stringify(rademacher(7, 2)), JSON.stringify(rademacher(7, 2)), 'same (run, iter) = same perturbation');
    ok(JSON.stringify(rademacher(7, 2)) !== JSON.stringify(rademacher(7, 3)), 'different iter = different perturbation');
    ok(rademacher(7, 2).every(d => d === 1 || d === -1), 'strictly ±1');
    const stepped = spsaStep([0, 0], [1, -1], 0.4, 0.2, 0.5, 0.1);
    ok(stepped[0] > 0 && stepped[1] < 0, 'the step climbs toward the better perturbation');
  }},
];
