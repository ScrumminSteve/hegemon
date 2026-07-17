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
