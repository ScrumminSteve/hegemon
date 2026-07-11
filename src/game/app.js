// HEGEMON table mode (M1.e). One operator plays all factions with full
// visibility; every UI form is generated from the engine's pendingQueries,
// and every button dispatches through applyAction. The UI holds no rules.

import { REGIONS, PORTS, buildAdjacency } from '../data/map.js';
import { FACTIONS } from '../data/factions.js';
import { THEME_CORE } from '../themes/core.js';
import { THEME_ASOIAF } from '../themes/asoiaf.js';
import { renderMap } from '../map-view.js';
import { createGame, serialize, deserialize, region, seatsControlled } from '../engine/state.js';
import { applyAction, beginPlanning, orderableRegions, starLimit, ORDER_TOKENS } from '../engine/engine.js';
import { combatStrengths } from '../engine/combat.js';

const THEMES = { core: THEME_CORE, asoiaf: THEME_ASOIAF };
const ADJ = buildAdjacency();
const byId = Object.fromEntries([...REGIONS, ...PORTS].map(r => [r.id, r]));
const factionById = Object.fromEntries(FACTIONS.map(f => [f.id, f]));

let theme = THEME_CORE;
let game = null;
let history = [];
let ui = {};              // transient form state; never rules, never truth

const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// ---------- naming ----------
const fName = fid => theme.factions[fid]?.name || fid;
const fGlyph = fid => theme.factions[fid]?.glyph || '●';
const fColor = fid => factionById[fid].color;
function rName(rid) {
  const r = byId[rid];
  return r.kind === 'port' ? `${theme.terms.port} of ${theme.regions[r.landId]}` : (theme.regions[rid] || rid);
}
const orderName = t => ({ march: 'March', defend: 'Defend', support: 'Support', raid: 'Raid', rally: theme.terms.orderRally }[t]);
const tokenLabel = o => `${orderName(o.type)}${o.mod ? (o.mod > 0 ? ` +${o.mod}` : ` ${o.mod}`) : ''}${o.starred ? ' ★' : ''}`;
const unitName = t => ({ infantry: theme.terms.unitInfantry, cavalry: theme.terms.unitCavalry, warship: theme.terms.unitWarship, siege_engine: theme.terms.unitSiege }[t]);

// ---------- lifecycle ----------
function newGame() {
  game = createGame(6, { seed: Math.floor(Math.random() * 1e9) });
  beginPlanning(game);
  history = [serialize(game)];
  ui = {};
  render();
}

function dispatch(action) {
  try {
    const r = applyAction(game, action);
    game = r.state;
    history.push(serialize(game));
    if (history.length > 200) history.shift();
    ui = {};
    render();
  } catch (e) {
    flash(e.message);
  }
}

function undo() {
  if (history.length < 2) return;
  history.pop();
  game = deserialize(history[history.length - 1]);
  ui = {};
  render();
}

function flash(msg) {
  const el = $('#turn-panel');
  const div = document.createElement('div');
  div.className = 'flash';
  div.textContent = msg;
  el.prepend(div);
  setTimeout(() => div.remove(), 4200);
}

// ---------- map overlay ----------
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const posOf = rid => {
  const r = byId[rid];
  if (r.kind !== 'port') return { x: r.x, y: r.y };
  const a = byId[r.landId], b = byId[r.seaId];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

function unitGlyph(u, x, y) {
  const color = fColor(u.faction);
  const attrs = { fill: color, stroke: 'var(--ink)', 'stroke-width': 1 };
  let g;
  if (u.type === 'cavalry') g = el('polygon', { ...attrs, points: `${x},${y - 6} ${x - 6},${y + 5} ${x + 6},${y + 5}` });
  else if (u.type === 'warship') g = el('rect', { ...attrs, x: x - 8, y: y - 3.5, width: 16, height: 7, rx: 3 });
  else if (u.type === 'siege_engine') g = el('rect', { ...attrs, x: x - 5, y: y - 5, width: 10, height: 10, transform: `rotate(45 ${x} ${y})` });
  else g = el('circle', { ...attrs, cx: x, cy: y, r: 5 });
  if (u.routed) g.setAttribute('opacity', '0.4');
  return g;
}

function overlayState(svg) {
  svg.querySelector('.game-overlay')?.remove();
  const g = el('g', { class: 'game-overlay' });

  for (const [rid, units] of Object.entries(game.unitsByRegion)) {
    const { x, y } = posOf(rid);
    const step = 15, x0 = x - ((units.length - 1) * step) / 2;
    units.forEach((u, i) => g.appendChild(unitGlyph(u, x0 + i * step, y - 32)));
  }
  for (const [rid, o] of Object.entries(game.ordersByRegion)) {
    const { x, y } = posOf(rid);
    const disc = el('circle', { cx: x - 34, cy: y - 10, r: 11, class: 'ov-order', style: `stroke:${fColor(o.faction)}` });
    g.appendChild(disc);
    const t = el('text', { x: x - 34, y: y - 5.5, class: 'ov-order-txt' });
    t.textContent = orderName(o.type)[0] + (o.mod ? (o.mod > 0 ? '+' + o.mod : o.mod) : '') + (o.starred ? '★' : '');
    g.appendChild(t);
  }
  for (const [rid, gar] of Object.entries(game.garrisons)) {
    const { x, y } = posOf(rid);
    g.appendChild(el('circle', { cx: x + 30, cy: y - 30, r: 10, class: 'ov-garrison', style: `stroke:${fColor(gar.faction)}` }));
    const t = el('text', { x: x + 30, y: y - 25.5, class: 'ov-num' }); t.textContent = gar.strength; g.appendChild(t);
  }
  for (const [rid, n] of Object.entries(game.neutrals)) {
    const { x, y } = posOf(rid);
    g.appendChild(el('circle', { cx: x, cy: y - 32, r: 11, class: 'ov-neutral' }));
    const t = el('text', { x, y: y - 27.5, class: 'ov-num' }); t.textContent = n.strength; g.appendChild(t);
  }
  for (const [rid, fid] of Object.entries(game.controlMarkers)) {
    const { x, y } = posOf(rid);
    g.appendChild(el('rect', { x: x - 6, y: y + 22, width: 12, height: 12, rx: 2, style: `fill:${fColor(fid)}`, class: 'ov-marker' }));
  }
  if (game.combat) {
    const { x, y } = posOf(game.combat.region);
    g.appendChild(el('circle', { cx: x, cy: y, r: 54, class: 'ov-battle' }));
  }
  svg.appendChild(g);
}

// ---------- region taps feed the active form ----------
function handleRegionTap(rid) {
  if (ui.awaitTokenFor === undefined && ui.mode === 'planning' && ui.assignments && rid in ui.assignments) {
    ui.awaitTokenFor = rid; renderTurnPanel(); return;
  }
  if (ui.mode === 'march' && ui.awaitDest) {
    ui.moves.push({ to: rid, units: {} });
    ui.awaitDest = false; renderTurnPanel(); return;
  }
}

// ---------- turn panel ----------
function renderTurnPanel() {
  const panel = $('#turn-panel');
  if (!game) { panel.innerHTML = ''; return; }

  if (game.phase === 'gameOver') {
    panel.innerHTML = `<div class="victory">👑 ${esc(fName(game.winner))} rules the realm
      <span>(${seatsControlled(game, game.winner)} seats)</span></div>`;
    return;
  }

  const qs = game.pendingQueries;
  if (!qs.length) { panel.innerHTML = '<p class="hint">No pending decisions.</p>'; return; }

  // Active query: explicit selection, else the first.
  const active = ui.activeQuery != null ? qs[Math.min(ui.activeQuery, qs.length - 1)] : qs[0];

  let html = '';
  if (qs.length > 1) {
    html += `<div class="query-tabs">` + qs.map((q, i) =>
      `<button class="tab ${q === active ? 'on' : ''}" data-q="${i}" style="border-color:${fColor(q.faction)}">
        ${fGlyph(q.faction)} ${esc(qLabel(q))}</button>`).join('') + `</div>`;
  }
  html += formFor(active);
  panel.innerHTML = html;

  panel.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    ui = { activeQuery: +b.dataset.q }; renderTurnPanel();
  }));
  bindForm(panel, active);
}

function qLabel(q) {
  return { submitOrders: 'orders', courierDecision: theme.terms.tokenCourier,
    resolveOrder: q => q.step, declareSupport: 'support', useBlade: theme.terms.tokenBlade,
    retreat: 'retreat', replacePortShips: theme.terms.port }[q.type] instanceof Function
    ? q.step : ({ submitOrders: 'orders', courierDecision: 'courier', resolveOrder: q.step,
      declareSupport: 'support', useBlade: 'blade', retreat: 'retreat', replacePortShips: 'port' }[q.type]);
}

function header(q, title) {
  return `<div class="form-head" style="border-color:${fColor(q.faction)}">
    <span class="fchip" style="background:${fColor(q.faction)}"></span>
    <b>${fGlyph(q.faction)} ${esc(fName(q.faction))}</b> — ${esc(title)}</div>`;
}

function formFor(q) {
  if (q.type === 'submitOrders') return planningForm(q);
  if (q.type === 'courierDecision') return courierForm(q);
  if (q.type === 'resolveOrder' && q.step === 'raid') return raidForm(q);
  if (q.type === 'resolveOrder' && q.step === 'march') return marchForm(q);
  if (q.type === 'resolveOrder' && q.step === 'rally') return rallyForm(q);
  if (q.type === 'declareSupport') return supportForm(q);
  if (q.type === 'useBlade') return bladeForm(q);
  if (q.type === 'retreat') return retreatForm(q);
  if (q.type === 'replacePortShips') return portForm(q);
  return `<pre>${esc(JSON.stringify(q))}</pre>`;
}

// --- planning ---
function planningForm(q) {
  if (ui.mode !== 'planning' || ui.faction !== q.faction) {
    ui = { activeQuery: ui.activeQuery, mode: 'planning', faction: q.faction, assignments: {} };
    for (const rid of orderableRegions(game, q.faction)) ui.assignments[rid] = null;
  }
  const limit = starLimit(game, q.faction);
  const used = Object.values(ui.assignments).filter(Boolean);
  const stars = used.filter(o => o.starred).length;
  const remaining = remainingTokens(used);

  let html = header(q, 'assign orders');
  html += `<div class="star-budget">★ ${stars}/${limit}</div><div class="order-rows">`;
  for (const [rid, o] of Object.entries(ui.assignments)) {
    html += `<button class="order-row ${ui.awaitTokenFor === rid ? 'picking' : ''}" data-row="${rid}">
      <span>${esc(rName(rid))}</span><span class="tok">${o ? esc(tokenLabel(o)) : '—'}</span></button>`;
  }
  html += `</div>`;
  if (ui.awaitTokenFor) {
    html += `<div class="token-grid">` + remaining.map((t, i) =>
      `<button class="token" data-tok="${i}" ${t.starred && stars >= limit && !(ui.assignments[ui.awaitTokenFor]?.starred) ? 'disabled' : ''}>
        ${esc(tokenLabel(t))}</button>`).join('') + `</div>`;
  }
  const complete = Object.values(ui.assignments).every(Boolean);
  html += `<button class="primary" id="do-submit" ${complete ? '' : 'disabled'}>Commit orders</button>`;
  return html;
}

function remainingTokens(used) {
  const pool = ORDER_TOKENS.map(t => ({ ...t }));
  for (const u of used) {
    const i = pool.findIndex(t => t.type === u.type && t.mod === u.mod && t.starred === u.starred);
    if (i !== -1) pool.splice(i, 1);
  }
  // Dedupe identical tokens for display, keep counts.
  const out = [];
  for (const t of pool) {
    const hit = out.find(o => o.type === t.type && o.mod === t.mod && o.starred === t.starred);
    hit ? hit.count++ : out.push({ ...t, count: 1 });
  }
  return out;
}

// --- courier ---
function courierForm(q) {
  let html = header(q, theme.terms.tokenCourier);
  if (ui.mode === 'courier-swap') {
    const mine = Object.entries(game.ordersByRegion).filter(([, o]) => o.faction === q.faction);
    if (!ui.swapRegion) {
      html += `<p class="hint">Replace which order?</p><div class="btn-col">` + mine.map(([rid, o]) =>
        `<button data-swapr="${rid}">${esc(rName(rid))} · ${esc(tokenLabel(o))}</button>`).join('') + `</div>`;
    } else {
      const used = mine.filter(([rid]) => rid !== ui.swapRegion).map(([, o]) => o);
      html += `<p class="hint">New order for ${esc(rName(ui.swapRegion))}:</p><div class="token-grid">` +
        remainingTokens(used).map((t, i) => `<button class="token" data-swapt="${i}">${esc(tokenLabel(t))}</button>`).join('') + `</div>`;
    }
    html += `<button data-swapback>← back</button>`;
  } else {
    html += `<div class="btn-col">
      <button data-courier="pass" class="primary">Pass</button>
      <button data-courier="swap">Swap one order</button>
      <button data-courier="peekThreatDeck">Peek threat deck <em>(M2)</em></button></div>`;
  }
  return html;
}

// --- raid ---
function raidForm(q) {
  if (ui.mode !== 'raid') ui = { activeQuery: ui.activeQuery, mode: 'raid', region: q.regions.length === 1 ? q.regions[0] : null };
  let html = header(q, `resolve a Raid`);
  if (!ui.region) {
    html += `<div class="btn-col">` + q.regions.map(r => `<button data-pick="${r}">${esc(rName(r))}</button>`).join('') + `</div>`;
    return html;
  }
  const targets = [...ADJ[ui.region]].filter(rid => {
    const o = game.ordersByRegion[rid];
    return o && o.faction !== q.faction;
  }).sort();
  html += `<p class="hint">Raiding from <b>${esc(rName(ui.region))}</b></p><div class="btn-col">` +
    targets.map(rid => `<button data-target="${rid}">${esc(rName(rid))} · ${esc(tokenLabel(game.ordersByRegion[rid]))}
      <span class="fchip" style="background:${fColor(game.ordersByRegion[rid].faction)}"></span></button>`).join('') +
    `<button data-target="" class="ghost">Spend with no target</button></div>`;
  return html;
}

// --- march ---
function marchForm(q) {
  if (ui.mode !== 'march') ui = { activeQuery: ui.activeQuery, mode: 'march', region: q.regions.length === 1 ? q.regions[0] : null, moves: [], leaveControl: false, awaitDest: false };
  let html = header(q, 'resolve a March');
  if (!ui.region) {
    html += `<div class="btn-col">` + q.regions.map(r => `<button data-pick="${r}">${esc(rName(r))}</button>`).join('') + `</div>`;
    return html;
  }
  const avail = {};
  for (const u of game.unitsByRegion[ui.region] || []) {
    if (u.faction === q.faction && !u.routed) avail[u.type] = (avail[u.type] || 0) + 1;
  }
  const committed = {};
  for (const mv of ui.moves) for (const [t, n] of Object.entries(mv.units)) committed[t] = (committed[t] || 0) + n;

  html += `<p class="hint">Marching from <b>${esc(rName(ui.region))}</b> — ${Object.entries(avail).map(([t, n]) => `${n} ${esc(unitName(t))}`).join(', ') || 'no units'}</p>`;
  ui.moves.forEach((mv, mi) => {
    html += `<div class="move-card"><b>→ ${esc(rName(mv.to))}</b>`;
    for (const t of Object.keys(avail)) {
      const n = mv.units[t] || 0;
      html += `<div class="stepper"><span>${esc(unitName(t))}</span>
        <button data-dec="${mi}:${t}">−</button><b>${n}</b><button data-inc="${mi}:${t}">+</button></div>`;
    }
    html += `<button class="ghost" data-delmove="${mi}">remove destination</button></div>`;
  });
  html += `<button data-adddest ${ui.awaitDest ? 'class="picking"' : ''}>${ui.awaitDest ? 'Tap a destination on the map…' : '+ Add destination'}</button>`;
  const wouldVacate = Object.keys(avail).every(t => (committed[t] || 0) >= avail[t]) && Object.keys(avail).length > 0;
  if (wouldVacate && byId[ui.region].kind === 'land' && byId[ui.region].home !== q.faction) {
    html += `<label class="toggle-label"><input type="checkbox" id="leave-control" ${ui.leaveControl ? 'checked' : ''}>
      Leave a control marker (1 ${esc(theme.terms.authority)})</label>`;
  }
  html += `<button class="primary" id="do-march">Resolve march</button>`;
  return html;
}

// --- rally ---
function rallyForm(q) {
  if (ui.mode !== 'rally') ui = { activeQuery: ui.activeQuery, mode: 'rally', region: q.regions.length === 1 ? q.regions[0] : null };
  let html = header(q, `resolve ${theme.terms.orderRally}`);
  if (!ui.region) {
    html += `<div class="btn-col">` + q.regions.map(r => `<button data-pick="${r}">${esc(rName(r))}</button>`).join('') + `</div>`;
    return html;
  }
  const o = game.ordersByRegion[ui.region];
  html += `<p class="hint">${esc(rName(ui.region))}</p><div class="btn-col">
    <button class="primary" data-rally>Collect ${esc(theme.terms.authority)}</button>
    ${o?.starred ? `<button disabled title="Mustering lands in M2">Muster units (M2)</button>` : ''}</div>`;
  return html;
}

// --- combat forms ---
function battleBanner() {
  const c = game.combat;
  const s = combatStrengths(game);
  return `<div class="battle">
    <div class="battle-side" style="border-color:${fColor(c.attacker)}">${fGlyph(c.attacker)} ${esc(fName(c.attacker))}<b>${s.attacker}</b></div>
    <div class="battle-vs">⚔ ${esc(rName(c.region))}</div>
    <div class="battle-side" style="border-color:${fColor(c.defender)}">${fGlyph(c.defender)} ${esc(fName(c.defender))}<b>${s.defender}</b></div>
  </div>`;
}

function supportForm(q) {
  return battleBanner() + header(q, `support from ${rName(q.region)}`) + `<div class="btn-col">
    <button data-support="attacker">Back the attacker</button>
    <button data-support="defender">Back the defender</button>
    <button data-support="refuse" class="ghost">Refuse</button></div>`;
}

function bladeForm(q) {
  return battleBanner() + header(q, theme.terms.tokenBlade) + `<div class="btn-col">
    <button data-blade="1" class="primary">Use it (+1)</button>
    <button data-blade="0" class="ghost">Hold it</button></div>`;
}

function retreatForm(q) {
  return battleBanner() + header(q, 'retreat') + `<div class="btn-col">` +
    q.options.map(rid => `<button data-retreat="${rid}">${esc(rName(rid))}</button>`).join('') + `</div>`;
}

function portForm(q) {
  if (ui.count === undefined) ui.count = q.max;
  return header(q, `refit ${rName(q.port)}`) + `
    <div class="stepper"><span>${esc(theme.terms.unitWarship)}s</span>
      <button data-pdec>−</button><b>${ui.count}</b><button data-pinc>+</button></div>
    <button class="primary" data-port>Confirm</button>`;
}

// ---------- form bindings ----------
function bindForm(panel, q) {
  panel.querySelector('#do-submit')?.addEventListener('click', () =>
    dispatch({ type: 'submitOrders', faction: q.faction, orders: ui.assignments }));

  panel.querySelectorAll('[data-row]').forEach(b => b.addEventListener('click', () => {
    ui.awaitTokenFor = b.dataset.row; renderTurnPanel();
  }));
  panel.querySelectorAll('[data-tok]').forEach(b => b.addEventListener('click', () => {
    const used = Object.values(ui.assignments).filter(Boolean).filter((_, k, arr) => true);
    const usedMinus = Object.entries(ui.assignments).filter(([r, o]) => o && r !== ui.awaitTokenFor).map(([, o]) => o);
    const t = remainingTokens(usedMinus)[+b.dataset.tok];
    ui.assignments[ui.awaitTokenFor] = { type: t.type, mod: t.mod, starred: t.starred };
    delete ui.awaitTokenFor;
    renderTurnPanel();
  }));

  panel.querySelectorAll('[data-courier]').forEach(b => b.addEventListener('click', () => {
    const d = b.dataset.courier;
    if (d === 'swap') { ui.mode = 'courier-swap'; renderTurnPanel(); }
    else dispatch({ type: 'courierDecision', faction: q.faction, decision: d });
  }));
  panel.querySelectorAll('[data-swapr]').forEach(b => b.addEventListener('click', () => { ui.swapRegion = b.dataset.swapr; renderTurnPanel(); }));
  panel.querySelectorAll('[data-swapt]').forEach(b => b.addEventListener('click', () => {
    const mine = Object.entries(game.ordersByRegion).filter(([, o]) => o.faction === q.faction);
    const used = mine.filter(([rid]) => rid !== ui.swapRegion).map(([, o]) => o);
    const t = remainingTokens(used)[+b.dataset.swapt];
    dispatch({ type: 'courierDecision', faction: q.faction, decision: 'swapOrder',
      swap: { region: ui.swapRegion, newOrder: { type: t.type, mod: t.mod, starred: t.starred } } });
  }));
  panel.querySelector('[data-swapback]')?.addEventListener('click', () => { ui.mode = null; ui.swapRegion = null; renderTurnPanel(); });

  panel.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { ui.region = b.dataset.pick; renderTurnPanel(); }));
  panel.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () =>
    dispatch({ type: 'resolveRaid', faction: q.faction, region: ui.region, target: b.dataset.target || null })));

  panel.querySelector('[data-adddest]')?.addEventListener('click', () => { ui.awaitDest = !ui.awaitDest; renderTurnPanel(); });
  panel.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => stepUnits(b.dataset.inc, +1, q)));
  panel.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => stepUnits(b.dataset.dec, -1, q)));
  panel.querySelectorAll('[data-delmove]').forEach(b => b.addEventListener('click', () => { ui.moves.splice(+b.dataset.delmove, 1); renderTurnPanel(); }));
  panel.querySelector('#leave-control')?.addEventListener('change', e => { ui.leaveControl = e.target.checked; });
  panel.querySelector('#do-march')?.addEventListener('click', () =>
    dispatch({ type: 'resolveMarch', faction: q.faction, region: ui.region,
      moves: ui.moves.filter(m => Object.values(m.units).some(n => n > 0)), leaveControl: ui.leaveControl }));

  panel.querySelector('[data-rally]')?.addEventListener('click', () =>
    dispatch({ type: 'resolveRally', faction: q.faction, region: ui.region }));

  panel.querySelectorAll('[data-support]').forEach(b => b.addEventListener('click', () =>
    dispatch({ type: 'declareSupport', faction: q.faction, region: q.region, side: b.dataset.support })));
  panel.querySelectorAll('[data-blade]').forEach(b => b.addEventListener('click', () =>
    dispatch({ type: 'useBlade', faction: q.faction, use: b.dataset.blade === '1' })));
  panel.querySelectorAll('[data-retreat]').forEach(b => b.addEventListener('click', () =>
    dispatch({ type: 'retreat', faction: q.faction, to: b.dataset.retreat })));

  panel.querySelector('[data-pinc]')?.addEventListener('click', () => { ui.count = Math.min(q.max, ui.count + 1); renderTurnPanel(); });
  panel.querySelector('[data-pdec]')?.addEventListener('click', () => { ui.count = Math.max(0, ui.count - 1); renderTurnPanel(); });
  panel.querySelector('[data-port]')?.addEventListener('click', () =>
    dispatch({ type: 'replacePortShips', faction: q.faction, count: ui.count }));
}

function stepUnits(key, delta, q) {
  const [mi, t] = key.split(':');
  const mv = ui.moves[+mi];
  const availTotal = (game.unitsByRegion[ui.region] || []).filter(u => u.faction === q.faction && u.type === t && !u.routed).length;
  const elsewhere = ui.moves.reduce((n, m, i) => n + (i === +mi ? 0 : (m.units[t] || 0)), 0);
  mv.units[t] = Math.max(0, Math.min(availTotal - elsewhere, (mv.units[t] || 0) + delta));
  renderTurnPanel();
}

// ---------- log ----------
function logLine(e) {
  const F = fid => `${fGlyph(fid)} ${esc(fName(fid))}`;
  switch (e.event) {
    case 'planningBegan': return `— Round ${e.round}: ${esc(theme.terms.factions)} plan in secret —`;
    case 'ordersSubmitted': return `${F(e.faction)} committed orders.`;
    case 'ordersRevealed': return `All orders revealed.`;
    case 'courierSwapped': return `${F(e.faction)} used the ${esc(theme.terms.tokenCourier)} at ${esc(rName(e.region))}.`;
    case 'courierPassed': return `${F(e.faction)} held the ${esc(theme.terms.tokenCourier)}.`;
    case 'raided': return `${F(e.by)} raided ${esc(rName(e.target))} from ${esc(rName(e.from))}.`;
    case 'raidSpent': return `${F(e.by)} let a raid burn out at ${esc(rName(e.from))}.`;
    case 'pillaged': return `${F(e.by)} pillaged ${esc(theme.terms.authority)} from ${F(e.victim)}.`;
    case 'marched': return `${F(e.faction)} marched from ${esc(rName(e.from))}.`;
    case 'neutralDestroyed': return `${F(e.by)} broke the neutral force at ${esc(rName(e.region))}.`;
    case 'controlEstablished': return `${F(e.faction)} left a claim on ${esc(rName(e.region))}.`;
    case 'controlMarkerDiscarded': return `The claim on ${esc(rName(e.region))} was torn down.`;
    case 'combatBegan': return `⚔ ${F(e.attacker)} attacks ${F(e.defender)} at ${esc(rName(e.region))}!`;
    case 'supportDeclared': return `${F(e.faction)} supports the ${e.side} (+${e.strength}) from ${esc(rName(e.region))}.`;
    case 'supportRefused': return `${F(e.faction)} withholds support at ${esc(rName(e.region))}.`;
    case 'bladeUsed': return `${F(e.faction)} wields the ${esc(theme.terms.tokenBlade)} (+1).`;
    case 'combatResolved': return `Battle: ${e.attacker} vs ${e.defender}${e.tie ? ' — tie!' : ''} ${F(e.victor)} prevails.`;
    case 'garrisonDestroyed': return `The garrison of ${esc(rName(e.region))} is no more.`;
    case 'defendersDestroyed': return `${F(e.faction)}'s defenders were annihilated at ${esc(rName(e.region))}.`;
    case 'retreated': return `${F(e.faction)} retreats to ${esc(rName(e.to))}, routed.`;
    case 'attackerRepelled': return `The assault on ${esc(rName(e.region))} is repelled.`;
    case 'siegeDestroyedRetreating': return `A ${esc(unitName('siege_engine'))} is abandoned in the retreat.`;
    case 'routedUnitDestroyed': return `A routed unit is cut down mid-retreat.`;
    case 'destroyedForSupply': return `${F(e.faction)} disbands a unit at ${esc(rName(e.region))} (supply).`;
    case 'portShipsRemoved': return `Enemy ${esc(theme.terms.unitWarship)}s burned at ${esc(rName(e.port))}.`;
    case 'portShipsReplaced': return `${F(e.faction)} refits ${e.count} ${esc(theme.terms.unitWarship)}(s) at ${esc(rName(e.port))}.`;
    case 'rallied': return `${F(e.faction)} gains ${e.gain} ${esc(theme.terms.authority)} at ${esc(rName(e.region))}.`;
    case 'combatEnded': return null;
    case 'cleanUp': return `— Round ${e.round} ends —`;
    case 'eventPhasePending': return `(${esc(theme.terms.eventPhase)} arrives in M2 — straight to planning.)`;
    case 'actionPhaseBegan': return `— The armies move —`;
    case 'gameOver': return `👑 ${F(e.winner)} wins the game!`;
    default: return null;
  }
}

function renderLog() {
  const box = $('#log');
  box.innerHTML = game.log.map(logLine).filter(Boolean).map(l => `<div>${l}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

// ---------- top-level render ----------
function render() {
  const svg = $('#map');
  renderMap(svg, theme, { onSelect: handleRegionTap });
  overlayState(svg);
  renderTurnPanel();
  renderLog();
  const phaseNames = { planning: 'Planning', action: 'Action', gameOver: 'Game over' };
  $('#status-line').textContent = `Round ${game.round} of 10 · ${phaseNames[game.phase] || game.phase} · ` +
    game.factions.map(f => `${fGlyph(f)}${seatsControlled(game, f)}`).join(' ');
}

// ---------- chrome ----------
function init() {
  $('#theme-select').addEventListener('change', e => { theme = THEMES[e.target.value]; render(); });
  $('#btn-new').addEventListener('click', newGame);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-save').addEventListener('click', () => {
    const blob = new Blob([serialize(game)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hegemon-round${game.round}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#btn-load').addEventListener('click', () => $('#load-box').classList.toggle('hidden'));
  $('#btn-load-confirm').addEventListener('click', () => {
    try {
      game = deserialize($('#load-text').value.trim());
      history = [serialize(game)];
      ui = {};
      $('#load-box').classList.add('hidden');
      render();
    } catch (e) { flash(`Could not restore: ${e.message}`); }
  });
  newGame();
}

if (typeof document !== 'undefined') init();
