#!/usr/bin/env node
// HEGEMON corpus miner (M3.e Package B) — "the bots learn from the teacher."
//
//   node tools/mine.mjs <episodes-dir|files...> [--rounds 3] [--out src/agents/books.js] [--dry]
//
// Mines per-faction OPENING BOOKS from human-won episodes. Doctrine
// (banked with check-episode.mjs, Jul 2026): a hash mismatch means the
// engine's behavior changed since recording — the episode is STALE for
// training and is QUARANTINED, never silently learned from. This miner
// enforces that doctrine mechanically:
//
//   admit an episode iff:
//     1. schema is hegemon-episode and outcome.winner exists (a finished win);
//     2. meta.seatControllers[winner] === 'human' (the teacher won the seat —
//        ground truth over titles, per the export-discipline ruling);
//     3. stepwise replay under the CURRENT engine reproduces the recorded
//        final hash (legality + fidelity, rev drift caught regardless of the
//        recorded rulesRevision number).
//
//   mine, from admitted episodes, ONLY the winning human seat:
//     - per (round ≤ R, region): the placement distribution — order type,
//       mod, starred, with counts (the book's priors);
//     - per round: the full order-set signature (the M2 "bot openings match
//       book priors at a stated rate" measurement needs exact sets);
//     - round-tagging comes from the replay itself (state.round at the moment
//       each action is accepted), not from any annotation the UI stamped.
//
// Output is a GENERATED ES module (default src/agents/books.js) carrying the
// book plus full provenance: every source file with its verified hash, the
// engine revision that admitted it, and the quarantine list with reasons —
// the book can always answer "why do you believe this?"

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning, stateHash, RULES_REVISION } from '../src/engine/engine.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  if (i === -1) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const dry = args.includes('--dry');
if (dry) args.splice(args.indexOf('--dry'), 1);
const ROUNDS = +flag('--rounds', 3);
const OUT = flag('--out', new URL('../src/agents/books.js', import.meta.url).pathname);

const inputs = args.length ? args : [new URL('../corpus/episodes', import.meta.url).pathname];
const files = inputs.flatMap(p => {
  try {
    return statSync(p).isDirectory()
      ? readdirSync(p).filter(f => f.endsWith('.json')).map(f => join(p, f)).sort()
      : [p];
  } catch { console.error(`mine: cannot read ${p}`); process.exit(2); }
});
if (!files.length) { console.error('mine: no episode files found'); process.exit(2); }

// ---------------------------------------------------------------------------
// admission + stepwise mining
// ---------------------------------------------------------------------------

const quarantine = [];   // { file, reason }
const admitted = [];     // { file, hash, winner, rounds, recordedRev }
const book = {};         // fid -> { games, rounds: { r: { regions: {rid: {sigCounts}}, sets: {} } } }

const tokenKey = o => `${o.type}${o.mod > 0 ? '+1' : o.mod < 0 ? '-1' : ''}${o.starred ? '*' : ''}`;
const setSignature = orders =>
  Object.entries(orders).map(([rid, o]) => `${rid}:${tokenKey(o)}`).sort().join(' ');

function mineEpisode(file) {
  let ep;
  try { ep = JSON.parse(readFileSync(file, 'utf8')); }
  catch { return { reason: 'unparseable JSON' }; }
  if (!ep.schema?.startsWith('hegemon-episode')) return { reason: 'not a hegemon-episode' };
  const winner = ep.outcome?.winner;
  if (!winner) return { reason: 'no winner (unfinished or bug-report episode)' };
  const controller = ep.meta?.seatControllers?.[winner];
  if (controller !== 'human') return { reason: `winner ${winner} controlled by ${controller ?? 'unknown'} — not a human win` };

  // Stepwise replay: reconstruct the round each action lands in, harvest the
  // human winner's planning submissions as we go, verify the final hash.
  let s;
  try { s = createGame(ep.config.seatCount, { seed: ep.config.seed, ruleset: ep.config.ruleset }); beginPlanning(s); }
  catch (e) { return { reason: `setup failed: ${e.message}` }; }
  const mined = []; // { round, orders }
  try {
    for (const a of ep.actions) {
      if (a.faction === winner && a.type === 'submitOrders' && s.round <= ROUNDS) {
        mined.push({ round: s.round, orders: a.orders });
      }
      s = applyAction(s, a).state;
    }
  } catch (e) { return { reason: `replay rejected: ${e.message}` }; }
  const h = stateHash(s);
  if (ep.hash && h !== ep.hash) return { reason: `hash mismatch (recorded ${ep.hash}, replayed ${h}) — STALE, rules moved under it` };
  if (!ep.hash) return { reason: 'no recorded hash — raw save; re-export as a sealed episode' };

  return { winner, hash: h, mined, rounds: s.round, recordedRev: ep.rulesRevision };
}

for (const file of files) {
  const r = mineEpisode(file);
  const name = basename(file);
  if (r.reason) { quarantine.push({ file: name, reason: r.reason }); continue; }
  admitted.push({ file: name, hash: r.hash, winner: r.winner, rounds: r.rounds, recordedRev: r.recordedRev });
  const fb = (book[r.winner] ??= { games: 0, rounds: {} });
  fb.games++;
  for (const { round, orders } of r.mined) {
    const rb = (fb.rounds[round] ??= { regions: {}, sets: {} });
    for (const [rid, o] of Object.entries(orders)) {
      const reg = (rb.regions[rid] ??= {});
      reg[tokenKey(o)] = (reg[tokenKey(o)] ?? 0) + 1;
    }
    const sig = setSignature(orders);
    const line = rb.sets[sig] ??= { orders, n: 0 };
    line.n++;
  }
}

// ---------------------------------------------------------------------------
// digest
// ---------------------------------------------------------------------------

console.log(`mine: ${files.length} files · ${admitted.length} admitted · ${quarantine.length} quarantined · rev ${RULES_REVISION} · rounds ≤ ${ROUNDS}`);
for (const q of quarantine) console.log(`  ✗ ${q.file}\n      ${q.reason}`);
console.log('');
for (const a of admitted) console.log(`  ✓ ${a.file} — ${a.winner} wins r${a.rounds} (recorded rev ${a.recordedRev}, hash ${a.hash})`);
console.log('\n— book yield —');
for (const [fid, fb] of Object.entries(book).sort()) {
  console.log(`${fid}: ${fb.games} game(s)`);
  for (const [round, rb] of Object.entries(fb.rounds)) {
    const placements = Object.values(rb.regions).reduce((n, reg) => n + Object.values(reg).reduce((a, b) => a + b, 0), 0);
    const top = Object.entries(rb.regions)
      .map(([rid, reg]) => {
        const [tok, n] = Object.entries(reg).sort((x, y) => y[1] - x[1])[0];
        return `${rid}:${tok}${n > 1 ? `×${n}` : ''}`;
      }).slice(0, 6).join('  ');
    console.log(`  r${round}: ${placements} placements, ${Object.keys(rb.sets).length} distinct set(s) · ${top}`);
  }
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

if (!dry) {
  const provenance = {
    minedAt: new Date().toISOString(),
    rulesRevision: RULES_REVISION,
    rounds: ROUNDS,
    admitted,
    quarantined: quarantine,
  };
  const src = `// GENERATED by tools/mine.mjs — do not edit by hand; re-mine instead.
// Per-faction opening books from hash-verified human wins (M3.e Package B).
// Every admitted source replayed clean under rules revision ${RULES_REVISION} and
// reproduced its recorded hash; stale episodes are listed in provenance,
// quarantined per the check-episode doctrine (never silently learned from).

export const BOOK_PROVENANCE = ${JSON.stringify(provenance, null, 2)};

export const BOOKS = ${JSON.stringify(book, null, 2)};

/** Placement prior: how often the teacher put \`tokenKey\` on \`rid\` in \`round\`,
    as a fraction of that faction+round's games. 0 when the book is silent. */
export function bookPrior(fid, round, rid, tokenKey) {
  const fb = BOOKS[fid];
  const reg = fb?.rounds?.[round]?.regions?.[rid];
  if (!reg || !fb.games) return 0;
  return (reg[tokenKey] ?? 0) / fb.games;
}

/** All book placements for a faction+round: { rid: { tokenKey: count } } */
export function bookRegions(fid, round) {
  return BOOKS[fid]?.rounds?.[round]?.regions ?? null;
}

/** The teacher's distinct GRADED LINES for a faction+round:
    [{ orders, n }] — n = how many admitted wins played exactly this set.
    Sorted strongest grade first. */
export function bookLines(fid, round) {
  const sets = BOOKS[fid]?.rounds?.[round]?.sets;
  if (!sets) return [];
  return Object.values(sets).sort((a, b) => b.n - a.n);
}
`;
  writeFileSync(OUT, src);
  console.log(`\nwrote ${OUT}`);
}
void pathToFileURL;
