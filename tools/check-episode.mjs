#!/usr/bin/env node
// HEGEMON episode checker — corpus integrity + opener digest.
//
//   node tools/check-episode.mjs path/to/episode.json [--rounds 3]
//
// Replays the transcript against the current engine, verifies the integrity
// hash, and prints each faction's opening actions round by round — the raw
// material of an M3 opening book. A hash mismatch means the engine's behavior
// changed since this episode was recorded: the episode is stale for training
// (its actions no longer lead where they led) and should be re-recorded or
// quarantined, not silently learned from.

import { readFileSync } from 'node:fs';
import { replayGame, episodeRecord, stateHash } from '../src/engine/engine.js';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/check-episode.mjs episode.json [--rounds N]'); process.exit(2); }
const roundsArg = process.argv.indexOf('--rounds');
const openerRounds = roundsArg !== -1 ? +process.argv[roundsArg + 1] : 3;

const ep = JSON.parse(readFileSync(file, 'utf8'));
const src = ep.schema?.startsWith('hegemon-episode') ? ep
  : { config: ep.config, actions: ep.actionLog, hash: null, engine: ep.version, meta: {} }; // raw save files work too

console.log(`episode: ${file}`);
if (src.meta && Object.keys(src.meta).length) console.log(`meta:    ${JSON.stringify(src.meta)}`);
console.log(`engine:  recorded ${src.engine ?? '?'}`);
console.log(`config:  seats=${src.config.seatCount} seed=${src.config.seed}`);
console.log(`actions: ${src.actions.length}`);
if (ep.meta?.seatControllers) console.log(`seats:   ${Object.entries(ep.meta.seatControllers).map(([f, c]) => `${f}=${c}`).join(' ')}`);
if (ep.telemetry) {
  const t = ep.telemetry.timings.map(x => x.thinkMs).filter(x => x >= 0).sort((a, b) => a - b);
  const med = t.length ? t[Math.floor(t.length / 2)] : 0;
  console.log(`sidecar: ${ep.telemetry.timings.length} timings (median think ${med}ms) · ${ep.telemetry.undos.length} undos · ${ep.telemetry.rejections.length} rejections`);
}

let final;
try {
  final = replayGame(src.config, src.actions);
} catch (e) {
  console.error(`\nREPLAY FAILED: ${e.message}`);
  console.error('The current engine rejects this transcript — episode is STALE.');
  process.exit(1);
}

const h = stateHash(final);
if (src.hash) {
  console.log(`hash:    recorded ${src.hash} · replayed ${h} · ${h === src.hash ? 'MATCH ✓' : 'MISMATCH ✗ (stale episode)'}`);
  if (h !== src.hash) process.exitCode = 1;
} else {
  console.log(`hash:    ${h} (no recorded hash — raw save; re-export as episode to seal it)`);
}

const out = episodeRecord(final);
console.log(`outcome: round ${out.outcome.round} · phase ${out.outcome.phase} · winner ${out.outcome.winner ?? '—'}`);
for (const [f, m] of Object.entries(out.outcome.perFaction)) {
  console.log(`  ${f}: seats ${m.seats} · supply ${m.supply} · authority ${m.authority} · initiative #${m.initiative}`);
}

console.log(`\n— opener digest (rounds 1–${openerRounds}) —`);
const byFaction = {};
for (const a of src.actions) {
  if ((a._round ?? 1) > openerRounds) continue;
  const f = a.faction ?? '—';
  (byFaction[f] = byFaction[f] || []).push(a);
}
const brief = a => {
  const { type, _round, _phase, faction, ...rest } = a;
  const detail = type === 'submitOrders'
    ? Object.entries(rest.orders).map(([r, o]) => `${r}:${o.type}${o.starred ? '★' : ''}${o.mod > 0 ? '+' + o.mod : o.mod < 0 ? o.mod : ''}`).join(' ')
    : JSON.stringify(rest).slice(0, 90);
  return `r${a._round ?? '?'} ${type} ${detail}`;
};
for (const [f, acts] of Object.entries(byFaction).sort()) {
  console.log(`${f}:`);
  for (const a of acts) console.log(`  ${brief(a)}`);
}
