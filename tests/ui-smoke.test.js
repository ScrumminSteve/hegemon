// UI boot smoke (added after the f.3 invisibility incident, Jul 2026).
//
// Two failures compounded to ship a build with a blank map: a patch whose
// import-line replace silently no-opped, and a "parse check" that only caught
// SYNTAX errors — a ReferenceError at render time sailed through. Golden
// tests exercise the engine; nothing exercised the UI boot path. This suite
// boots game.html + app.js in jsdom and asserts the map actually renders,
// the themed icon defs are present, and the build stamp is written.
//
// jsdom is a devDependency; when it isn't installed the suite reports a
// single skipped-pass so the golden runner stays hermetic offline.

import { readFileSync } from 'node:fs';
import { ok } from './assert.js';

async function boot() {
  const { JSDOM } = await import('jsdom');
  const html = readFileSync(new URL('../game.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/game.html', pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;
  if (!('navigator' in global) || global.navigator !== dom.window.navigator) {
    try { Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* node owns it */ }
  }
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  global.requestAnimationFrame = cb => setTimeout(cb, 0);
  await import('../src/game/app.js');
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  return dom;
}

let dom = null, bootError = null, skipped = false;
try {
  dom = await boot();
} catch (e) {
  if (/Cannot find (package|module) 'jsdom'/.test(e.message)) skipped = true;
  else bootError = e;
}

export const tests = skipped ? [
  { name: 'UI smoke skipped — jsdom not installed (npm i to enable)', fn() { ok(true); } },
] : [
  { name: 'the app boots without throwing — a blank map is a failed test, not a shipped build', fn() {
    ok(!bootError, bootError ? `boot threw: ${bootError.message}` : 'booted');
  }},

  { name: 'the map renders: layers exist and region nodes are populated', fn() {
    ok(!bootError, 'boot ok');
    const svg = dom.window.document.querySelector('#map');
    ok(svg && svg.childNodes.length >= 4, 'map has layers');
    ok(svg.querySelectorAll('.nodes > g').length >= 40, 'regions rendered');
  }},

  { name: 'the themed icon system is live: defs injected, seat marks and port marks placed (M2.f.3)', fn() {
    ok(!bootError, 'boot ok');
    const svg = dom.window.document.querySelector('#map');
    ok(svg.querySelector('defs symbol[id="i-unit-infantry"]'), 'unit symbols in defs');
    ok(svg.querySelector('defs symbol[id="i-ord-march"]'), 'order glyphs in defs');
    ok(svg.querySelectorAll('use.ic-fort').length >= 15, 'castle/citadel marks on seats');
    ok(svg.querySelectorAll('use.ic-port').length >= 8, 'themed port marks');
    ok(svg.querySelectorAll('use.unit-ic').length >= 10, 'setup units render as themed silhouettes');
  }},

  { name: 'the spectate controls exist — a silent markup no-op cannot ship a phantom feature again (m3a2)', fn() {
    ok(!bootError, 'boot ok');
    ok(dom.window.document.querySelector('#btn-spectate'), 'Spectate button in the chronicle row');
    ok(dom.window.document.querySelector('#spectate-speed'), 'speed slider present');
  }},

  { name: 'the build stamp is written — cache vs code is diagnosable at a glance', fn() {
    ok(!bootError, 'boot ok');
    const sl = dom.window.document.querySelector('#seed-line');
    ok(sl && /build m\d\w*/.test(sl.textContent), `seed line stamps the build (got: ${sl?.textContent})`);
  }},
];

// --- M3.c: mixed-seat mode smoke -------------------------------------------
// The leak-regression tests: pick a seat, start a game, and assert the
// operator surface shows ONLY the human's decisions while bot hidden info
// renders as face-down backs — the viewFor routing proven in the DOM.

if (!skipped) tests.push(
  { name: 'mixed-seat controls exist: seat select is populated with all six factions plus table mode (M3.c)', fn() {
    const sel = dom.window.document.querySelector('#seat-select');
    ok(sel, 'seat select present');
    ok(sel.options.length === 7, `7 options (got ${sel.options.length})`);
    ok(sel.options[0].value === 'table', 'table mode is the default');
  }},

  { name: 'mixed game: the panel renders ONLY the human seat\'s form — no tabs, bids, or picks for bot seats (M3.c leak regression)', async fn() {
    const doc = dom.window.document;
    doc.querySelector('#seat-select').value = 'F2';
    doc.querySelector('#btn-new').click();
    await new Promise(r => setTimeout(r, 30));
    const panel = doc.querySelector('#turn-panel');
    ok(!panel.querySelector('.query-tabs'), 'no multi-seat tab strip in mixed mode');
    const chips = panel.querySelectorAll('[data-row]');
    ok(chips.length > 0, 'the human seat\'s planning territories render');
    ok(!panel.textContent.includes('undefined'), 'no undefined leaks in the form');
  }},

  { name: 'mixed game: bots act on the pump and their committed orders render as face-down backs, zero faces (M3.c)', async fn() {
    const doc = dom.window.document;
    // Speed the pump up so the smoke stays fast.
    const slider = doc.querySelector('#spectate-speed');
    slider.value = '120';
    doc.querySelector('#seat-select').value = 'F2';
    doc.querySelector('#btn-new').click();
    await new Promise(r => setTimeout(r, 1400)); // ≥5 bot decisions at 120ms + render slack
    const backs = doc.querySelectorAll('#map .ov-order-back').length;
    const faces = doc.querySelectorAll('#map .ov-order:not(.ov-staged)').length;
    ok(backs > 0, `bot orders landed as backs (got ${backs})`);
    ok(faces === 0, `no order FACE is visible before the reveal (got ${faces})`);
  }},
);

if (!skipped) tests.push(
  { name: 'm3e6 UI sprint smoke: chronicle toggle exists, fort marks carry owned/vacant classes, unit silhouettes are phone-size', fn() {
    const doc = dom.window.document;
    ok(doc.querySelector('#log-toggle'), 'chronicle toggle present');
    const forts = doc.querySelectorAll('#map use.ic-fort');
    ok(forts.length > 0, 'fort marks placed');
    ok([...forts].every(f => f.classList.contains('fort-owned') || f.classList.contains('fort-vacant')),
      'every pentagon declares owned or vacant');
    const u = doc.querySelector('#map .unit-ic');
    ok(u && u.getAttribute('width') === '30', 'unit silhouettes at 30px');
  }},
);
