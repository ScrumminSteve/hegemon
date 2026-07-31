// The offline artifact must never rot: build it, boot it from file://.
// (Owner request m3e13: "encapsulate this game so I can play it offline".)
import { ok } from './assert.js';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const tests = [];

let deps = true;
try { await import('esbuild'); await import('jsdom'); } catch { deps = false; }

if (deps) tests.push(
  { name: 'dist/hegemon.html builds and BOOTS from file:// — regions render, panel lives, no asset paths leak', async fn() {
    execSync('node tools/build-standalone.mjs', { stdio: 'pipe' });
    const html = readFileSync('dist/hegemon.html', 'utf8');
    ok(!/assets\/map-[a-z0-9]+\.webp/.test(html), 'no un-embedded asset paths remain');
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'file:///hegemon.html' });
    await new Promise(r => setTimeout(r, 400));
    const doc = dom.window.document;
    ok(doc.querySelectorAll('#map .region').length > 40, 'the board renders offline');
    ok((doc.querySelector('#turn-panel')?.textContent || '').length > 10, 'the panel lives offline');
  }},
);
