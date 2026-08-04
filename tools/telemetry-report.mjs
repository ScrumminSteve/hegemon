#!/usr/bin/env node
// HEGEMON tester telemetry report (m3e34) — the reader for the Tier-2
// sidecar the UI has been recording all along (per-action thinkMs, undos,
// rejections). Feed it a tester's exported episode; get the hesitation map.
//
//   node tools/telemetry-report.mjs episode-*.json
//
// For each episode: total human think time, the top-10 slowest human
// decisions with full context (round · phase · what was being asked),
// every rejection (a rejection = the UI let them try something illegal —
// each one is an interface finding), and undo usage. Bot actions are
// filtered out; sub-second human actions are noise and skipped in the map.

import { readFileSync } from 'node:fs';
import { createGame } from '../src/engine/state.js';
import { applyAction, beginPlanning } from '../src/engine/engine.js';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node tools/telemetry-report.mjs <episode.json...>'); process.exit(2); }

const fmt = ms => ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
  : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

for (const file of files) {
  const ep = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`\n══ ${file}`);
  if (!ep.telemetry?.timings?.length) {
    console.log('   no telemetry sidecar — episode predates the recorder, or was hand-edited');
    continue;
  }
  const humans = new Set(Object.entries(ep.meta?.seatControllers ?? {})
    .filter(([, v]) => v === 'human').map(([k]) => k));

  // Replay to know WHERE each action index sat (round + phase at the moment
  // the decision was made — i.e. the state BEFORE the action applied).
  const context = [];
  let s = createGame(ep.config.seatCount, { seed: ep.config.seed, ruleset: ep.config.ruleset });
  beginPlanning(s);
  for (const a of ep.actions) {
    context.push({ round: s.round, phase: s.phase });
    try { s = applyAction(s, a).state; } catch { break; }
  }

  const t = ep.telemetry;
  const human = t.timings.filter(x => humans.has(x.faction));
  const totalMs = human.reduce((n, x) => n + x.thinkMs, 0);
  console.log(`   human seat(s): ${[...humans].join(', ') || '(none?)'} · ${human.length} decisions · ${fmt(totalMs)} total think time`);

  const slow = human.filter(x => x.thinkMs >= 1000)
    .sort((a, b) => b.thinkMs - a.thinkMs).slice(0, 10);
  if (slow.length) {
    console.log('   hesitation map (slowest decisions):');
    for (const x of slow) {
      const ctx = context[x.i] ?? {};
      console.log(`     ${fmt(x.thinkMs).padStart(7)} · r${ctx.round ?? '?'} ${ctx.phase ?? '?'} · ${x.type} (${x.faction})`);
    }
  }

  if (t.rejections?.length) {
    console.log(`   REJECTIONS (${t.rejections.length}) — each one is an interface finding:`);
    for (const r of t.rejections) {
      const ctx = context[r.atAction] ?? {};
      console.log(`     r${ctx.round ?? '?'} ${ctx.phase ?? '?'} · tried ${r.type} after ${fmt(r.thinkMs)} → "${r.error}"`);
    }
  } else console.log('   rejections: none');

  if (t.undos?.length) console.log(`   undos: ${t.undos.length}`);
}
