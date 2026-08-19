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
import { ok, eq } from './assert.js';

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
  { name: 'mixed-seat controls exist: seat select is populated with all six factions plus table mode and random (M3.c; F1 m3e11)', fn() {
    const sel = dom.window.document.querySelector('#seat-select');
    ok(sel, 'seat select present');
    ok(sel.options.length === 8, `8 options — table + random + six houses (got ${sel.options.length})`);
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

if (!skipped) tests.push(
  { name: 'm3e11: the Wars of the Roses pack loads — selector option present, theme switch renders York at York (owner flagship candidate)', async fn() {
    const doc = dom.window.document;
    const sel = doc.querySelector('#theme-select');
    ok([...sel.options].some(o => o.value === 'warroses'), 'warroses selectable');
    sel.value = 'warroses';
    sel.dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 30));
    const html = doc.body.innerHTML;
    ok(html.includes('House of York') || html.includes('York'), 'York on the board');
    ok(!/undefined/.test(doc.querySelector('#turn-panel')?.textContent || ''), 'no undefined leaks in the panel');
    // warroses IS the default now (owner decision, Aug 2026) — nothing to restore
    await new Promise(r => setTimeout(r, 20));
  }},
);

if (!skipped) tests.push(
  { name: 'm3e15: a Roses game as York opens on the Sun in Splendour briefing — story, objectives, Continue (owner intro)', async fn() {
    const doc = dom.window.document;
    doc.querySelector('#theme-select').value = 'warroses';
    doc.querySelector('#theme-select').dispatchEvent(new dom.window.Event('change'));
    await new Promise(r => setTimeout(r, 30));
    doc.querySelector('#seat-select').value = 'F1';
    doc.querySelector('#btn-new').click();
    await new Promise(r => setTimeout(r, 60));
    const stage = doc.body.innerHTML;
    ok(stage.includes('The Sun in Splendour'), 'briefing title on stage');
    ok(stage.includes('St Albans') && stage.includes('London'), 'objectives name their ground');
    ok(stage.includes('Wakefield'), 'and history has its hook');
    // restore for later tests
    doc.querySelector('[data-stage-ok]')?.click();
    doc.querySelector('#theme-select').value = 'warroses';
    doc.querySelector('#theme-select').dispatchEvent(new dom.window.Event('change'));
    doc.querySelector('#seat-select').value = 'table';
    await new Promise(r => setTimeout(r, 30));
  }},
);

if (!skipped) tests.push(
  { name: 'm3e17: no bare ladderHint tokens survive — the shared helper is defined once and only called (P1 regression, Kingmaker freeze)', fn() {
    const src = readFileSync(new URL('../src/game/app.js', import.meta.url), 'utf8');
    const bare = src.match(/\$\{ladderHint\}/g) || [];
    ok(bare.length === 0, 'no orphaned template tokens');
    ok((src.match(/function ladderHintFor/g) || []).length === 1, 'one helper, by name');
    ok((src.match(/ladderHintFor\(/g) || []).length >= 4, 'called from muster, march, and losses at least');
  }},
);

if (!skipped) tests.push(
  { name: 'm3e18: EPISODES ARE SAVES — pasting an episode into the Load box resumes the game at its round with the human seat restored', async fn() {
    const doc = dom.window.document;
    const ep = JSON.stringify({
      schema: 'hegemon-episode/1', engine: 'x', rulesRevision: 11,
      meta: { seatControllers: { F1: 'bot', F2: 'human', F3: 'bot', F4: 'bot', F5: 'bot', F6: 'bot' } },
      config: { seatCount: 6, seed: 4242 }, actions: [],
    });
    doc.querySelector('#btn-load').click();
    const box = doc.querySelector('#load-text');
    box.value = ep;
    doc.querySelector('#btn-load-confirm').click();
    await new Promise(r => setTimeout(r, 60));
    const body = doc.body.textContent;
    ok(/seed 4242/.test(body), 'the episode game is live (seed on the status line)');
    ok(!/Can't find variable|undefined is not/.test(body), 'no render crashes');
  }},
);

if (!skipped) tests.push(
  { name: 'm3e19: exports survive sandboxed viewers — the Episode button raises the copy-paste overlay with the full JSON; and the victory line lost its shown()', async fn() {
    const doc = dom.window.document;
    const realPrompt = globalThis.prompt;
    globalThis.prompt = () => 'smoke-test';
    dom.window.prompt = globalThis.prompt;
    doc.querySelector('#btn-episode').click();
    await new Promise(r => setTimeout(r, 40));
    globalThis.prompt = realPrompt;
    const ta = doc.querySelector('.export-text');
    ok(ta, 'overlay raised');
    ok(ta.value.includes('"schema"') && ta.value.includes('seatControllers'), 'the full episode is in the box');
    doc.querySelector('#exp-close').click();
    const src = readFileSync(new URL('../src/game/app.js', import.meta.url), 'utf8');
    ok(!src.includes('the shown() ends'), 'the war ends at once — as it should');
  }},
);

tests.push(
  { name: 'm3e34: the tie beat shows the track verdict AND the card arithmetic — swords vs shields, casualties named or shields hold', async fn() {
    const { tieBeat } = await import('../src/game/app.js');
    const fake = {
      tracks: { prowess: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'] },
      combat: { attacker: 'F1', defender: 'F2', cards: { F1: 'F1-4', F2: 'F2-2b' } },
    };
    const beat = tieBeat(fake, { tie: true, victor: 'F1', attacker: 7, defender: 7 });
    ok(beat && /Tied battle/.test(beat.title), 'the beat exists and headlines the tie');
    ok(/prevails/.test(beat.lines[0]) && /#1/.test(beat.lines[0]), 'the track verdict is spelled out');
    ok(/⚔⚔/.test(beat.lines[1]) && /🛡🛡/.test(beat.lines[1]), "both cards' icons shown (F1-4 ⚔2 vs F2-2b 🛡2)");
    ok(/shields hold/.test(beat.lines[2]), '2 swords − 2 shields = no casualties, said plainly');
    fake.combat.cards.F2 = 'F2-3';
    const bloody = tieBeat(fake, { tie: true, victor: 'F1', attacker: 7, defender: 7 });
    ok(/loses 2 units/.test(bloody.lines[2]), 'swords minus nothing = 2 casualties, named');
    ok(tieBeat(fake, { tie: false, victor: 'F1' }) === null, 'ordinary victories stay off the tie stage');
  }},
);

tests.push(
  { name: 'm3e36 (restored): the standings verdict shows its arithmetic — the Tudor 4-4-4 game names land areas (10 vs 5 vs 4) with the tied rivals', async fn() {
    const { roundsVerdict } = await import('../src/game/app.js');
    const { readFileSync } = await import('node:fs');
    const { createGame } = await import('../src/engine/state.js');
    const { applyAction, beginPlanning } = await import('../src/engine/engine.js');
    const ep = JSON.parse(readFileSync(new URL('../corpus/inbox/episode-tudor-awesomesauce-r10.json', import.meta.url), 'utf8'));
    let s = createGame(ep.config.seatCount, { seed: ep.config.seed, ruleset: ep.config.ruleset });
    beginPlanning(s);
    for (const a of ep.actions) s = applyAction(s, a).state;
    const v = roundsVerdict(s);
    ok(v && /land areas held/.test(v) && /10 vs 5 vs 4|10 vs 4 vs 5/.test(v), `true criterion + arithmetic (got: ${v})`);
    ok(/Stafford/.test(v) && /Neville/.test(v) && /tied at 4 seats/.test(v), 'rivals and the tie itself named');
  }},
  { name: 'm3e36 (restored): marks of glory — the derived footprint acquits Henry (⭐⭐⭐ on awesomesauce), Percy fun grades 3/3, checks align with every briefing', async fn() {
    const { scoreGlory, starLine, GLORY_CHECKS, startingFootprint } = await import('../src/game/objectives.js');
    const { readFileSync } = await import('node:fs');
    const { createGame } = await import('../src/engine/state.js');
    const { applyAction, beginPlanning } = await import('../src/engine/engine.js');
    const replay = f => {
      const ep = JSON.parse(readFileSync(new URL('../corpus/inbox/' + f, import.meta.url), 'utf8'));
      let s = createGame(ep.config.seatCount, { seed: ep.config.seed, ruleset: ep.config.ruleset });
      beginPlanning(s);
      for (const a of ep.actions) s = applyAction(s, a).state;
      return s;
    };
    ok(startingFootprint('F3').includes('L20'), 'The Weald IS Tudor home ground — the false conviction stays fixed');
    const tudor = scoreGlory(replay('episode-tudor-awesomesauce-r10.json'), 'F3');
    eq(JSON.stringify(tudor.map(m => m.met)), '[true,true,true]', 'Tudor: waited, landed, Bosworth — ⭐⭐⭐');
    const percy = scoreGlory(replay('episode-percy-fun-r10.json'), 'F5');
    eq(JSON.stringify(percy.map(m => m.met)), '[true,true,true]', 'Percy: warden of every incursion, Middleham held, Alnwick endured');
    ok(/3 of 3/.test(starLine(percy)), 'the star line counts honestly');
    const { THEME_WARROSES } = await import('../src/themes/warroses.js');
    for (const fid of Object.keys(GLORY_CHECKS)) {
      eq(GLORY_CHECKS[fid].length, THEME_WARROSES.briefings[fid].objectives.length, `${fid} checks align with its briefing`);
    }
  }},
);

tests.push(
  { name: 'm3e37: tap-spotlight is sticky and honest — origin lit, accessible lifted, the rest receded gently; clear restores everything (owner UI offender #2)', async fn() {
    const { spotlight, clearSpotlight } = await import('../src/map-view.js');
    const svg = dom.window.document.querySelector('#map');
    ok(svg && svg.querySelectorAll('.region').length > 30, 'the booted map is populated');
    spotlight(svg, 'L01', new Set(['L05']));
    const at = id => svg.querySelector(`.region[data-id="${id}"]`);
    ok(at('L01').classList.contains('spot-hl'), 'origin takes the spotlight');
    ok(at('L05').classList.contains('spot-adj'), 'the accessible region is lifted');
    ok(at('L19').classList.contains('spot-dim'), 'the rest recede');
    clearSpotlight(svg);
    ok(!at('L01').classList.contains('spot-hl') && !at('L19').classList.contains('spot-dim'), 'clear restores the whole map');
  }},
  { name: 'm3e37: a map tap focuses all three surfaces — the tapped region is selected AND spotlit without hover (owner UI offender #1)', async fn() {
    const doc = dom.window.document;
    const node = doc.querySelector('.region[data-id="L01"]');
    node.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    ok(node.classList.contains('selected'), 'tap selects');
    ok(node.classList.contains('spot-hl'), 'tap spotlights persistently — no mouse required');
  }},
  { name: 'm3e37: the supply projection mirrors the engine law — legal plans stay quiet, an illegal split warns BEFORE dispatch (the double-tester finding)', async fn() {
    const { supplyProjection } = await import('../src/game/app.js');
    const clean = supplyProjection('F1', []);
    ok(!clean.over, 'the standing position is legal');
    // Pile hypothetical units into new regions until the army count must break.
    const flood = ['L05','L09','L13','L17','L23','L29'].map(r => ({ region: r, add: 3 }));
    const broken = supplyProjection('F1', flood);
    ok(broken.over, 'six new 3-stacks cannot be legal at starting supply');
    ok(broken.armies.length > broken.limits.length || broken.armies.some((n,i) => n > broken.limits[i]),
      'the projection exposes WHICH law broke');
  }},
);

tests.push(
  { name: 'm3e38: leader-card choice shows the armies (battleBanner precedes the hand) and the muster menu hides pool-spent unit types — verified structurally', async fn() {
    const src = readFileSync(new URL('../src/game/app.js', import.meta.url), 'utf8');
    ok(/leaderCardForm\(q\) \{[\s\S]{0,400}battleBanner\(\)/.test(src), 'the card form opens with the army-vs-army banner');
    ok(/poolLeft\(poolType\) <= 0 \? '' :/.test(src), 'pool-exhausted options render as NOTHING, not as taps that fail');
    ok(/SETUP\.unitPool\[t\]/.test(src), 'pool math reads the Rules p.2 component list, not a copy');
  }},
  { name: 'm3e38: Game options exists at the bottom with the house selector inside; the tracks scoreboard is collapsible — the panel-study inputs landed', async fn() {
    const doc = dom.window.document;
    const go = doc.querySelector('details#game-options');
    ok(go, 'Game options is a collapsible area');
    ok(go.querySelector('#seat-select') && go.querySelector('#theme-select'), 'house + theme selectors live inside it');
    ok(doc.querySelector('details#score-detail #tracks-panel'), 'the influence tracks collapse as a group');
  }},
);
