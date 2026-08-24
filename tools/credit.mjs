// ---------------------------------------------------------------------------
// PACKAGE C · SESSION ONE (m3e48) — THE CREDIT MINER
//
// Replays every episode in a directory, scores all six factions at every
// round boundary with the position evaluator, and reports:
//   - the eventual winner's evaluator RANK at each round (did the glance
//     see it coming?)
//   - the CROSSOVER round: when the winner first took the evaluator lead
//     and never gave it back
//   - per-episode verdicts against the pre-registered bars
//
// This is what turns LOSSES into signal: a losing game's curves show where
// the position bled, round by round, with no one needing to win for the
// data to count.
//
// usage:
//   node tools/credit.mjs corpus/inbox
//   node tools/credit.mjs corpus/episodes --json runs/credit.json
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';
import { rankFactions } from '../src/agents/evaluate.js';

function mineEpisode(path) {
  const ep = JSON.parse(readFileSync(path, 'utf8'));
  let s = createGame(ep.config.seatCount, { seed: ep.config.seed, ruleset: ep.config.ruleset });
  beginPlanning(s);
  const curves = {}; // fid -> [{round, score, rank}]
  const snap = () => {
    const ranked = rankFactions(s);
    ranked.forEach((r, i) => (curves[r.fid] ||= []).push({ round: s.round, score: Math.round(r.score * 10) / 10, rank: i + 1 }));
  };
  let lastRound = s.round;
  snap();
  for (const a of ep.actions) {
    const r = applyAction(s, a); s = r.state ?? s;
    if (s.round !== lastRound) { lastRound = s.round; snap(); }
  }
  snap(); // final position
  const winner = s.winner ?? ep.outcome?.winner ?? null;
  const wCurve = winner ? curves[winner] : null;
  const ranksByRound = wCurve ? wCurve.map(p => `r${p.round}:${p.rank}`).join(' ') : '—';
  // crossover: first round after which the winner held rank 1 to the end
  let crossover = null;
  if (wCurve) {
    for (let i = wCurve.length - 1; i >= 0; i--) {
      if (wCurve[i].rank !== 1) break;
      crossover = wCurve[i].round;
    }
  }
  const rounds = s.round;
  const mid = Math.ceil(rounds / 2);
  const midPoint = wCurve?.filter(p => p.round <= mid).at(-1);
  return {
    file: path.split('/').pop(),
    winner, rounds,
    human: Object.entries(ep.meta?.seatControllers || {}).find(([, v]) => v === 'human')?.[0] ?? null,
    winnerRanks: ranksByRound,
    crossover,
    top2ByMid: midPoint ? midPoint.rank <= 2 : null,
    curves,
  };
}

const dir = process.argv[2] || 'corpus/inbox';
const jsonIdx = process.argv.indexOf('--json');
const jsonOut = jsonIdx !== -1 ? process.argv[jsonIdx + 1] : null;

const files = readdirSync(dir).filter(f => f.endsWith('.json') && statSync(join(dir, f)).isFile());
const results = [];
for (const f of files) {
  try { results.push(mineEpisode(join(dir, f))); }
  catch (e) { console.error(`  ✗ ${f}: ${e.message}`); }
}

console.log(`— credit curves: ${results.length} episode(s) from ${dir} —`);
let passTop2 = 0, total = 0;
for (const r of results) {
  if (r.top2ByMid !== null) { total++; if (r.top2ByMid) passTop2++; }
  const tag = r.human ? (r.human === r.winner ? 'human WIN ' : `human ${r.human} LOSS`) : 'all-bot    ';
  console.log(`${r.file}\n  ${tag} · winner ${r.winner} in r${r.rounds} · winner's evaluator rank by round: ${r.winnerRanks}`);
  console.log(`  crossover (led ever after): ${r.crossover ? 'r' + r.crossover : 'never held to the end'} · top-2 by mid-game: ${r.top2ByMid === null ? '—' : r.top2ByMid ? 'YES' : 'NO'}`);
}
console.log(`\nBAR — winner top-2 by mid-game: ${passTop2}/${total} episodes${total ? ` (${Math.round(100 * passTop2 / total)}%)` : ''}`);
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(results, null, 1)); console.log(`→ ${jsonOut}`); }
