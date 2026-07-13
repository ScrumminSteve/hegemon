// HEGEMON table mode (M1.e). One operator plays all factions with full
// visibility; every UI form is generated from the engine's pendingQueries,
// and every button dispatches through applyAction. The UI holds no rules.

import { REGIONS, PORTS, buildAdjacency } from '../data/map.js';
import { FACTIONS } from '../data/factions.js';
import { INVADER_CARDS } from '../data/invaderCards.js';
import { LEADER_CARDS } from '../data/leaderCards.js';
import { THEME_CORE } from '../themes/core.js';
import { THEME_ASOIAF } from '../themes/asoiaf.js';
import { THEME_2026 } from '../themes/modern2026.js';
import { renderMap } from '../map-view.js';
import { createGame, serialize, deserialize, region, seatsControlled, STAR_ALLOWANCE, controllerOf } from '../engine/state.js';
import { applyAction, beginPlanning, orderableRegions, starLimit, ORDER_TOKENS, episodeRecord } from '../engine/engine.js';
import { combatStrengths } from '../engine/combat.js';
import { transportReachable } from '../engine/actionPhase.js';

const THEMES = { core: THEME_CORE, asoiaf: THEME_ASOIAF, modern2026: THEME_2026 };
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
function newGame(seed) {
  resetTelemetry();
  if (Number.isFinite(seed)) {
    game = createGame(6, { seed: Math.floor(seed) });
    beginPlanning(game);
    history = [serialize(game)];
    ui = {};
    render();
    return;
  }
  game = createGame(6, { seed: Math.floor(Math.random() * 1e9) });
  beginPlanning(game);
  history = [serialize(game)];
  ui = {};
  render();
}

// Observational telemetry — signals the deterministic engine can never
// reconstruct by replay. Lives strictly OUTSIDE engine state (never hashed,
// never needed for replay); exported as an episode sidecar.
let telemetry = { timings: [], undos: [], rejections: [] };
let lastRenderAt = performance.now();
function resetTelemetry() { telemetry = { timings: [], undos: [], rejections: [] }; lastRenderAt = performance.now(); }

function dispatch(action) {
  const thinkMs = Math.round(performance.now() - lastRenderAt);
  try {
    const r = applyAction(game, action);
    game = r.state;
    // Aligned by transcript index: timings[i] annotates actionLog[i].
    telemetry.timings.push({ i: game.actionLog.length - 1, type: action.type, faction: action.faction, thinkMs });
    history.push(serialize(game));
    if (history.length > 200) history.shift();
    ui = {};
    render();
  } catch (e) {
    telemetry.rejections.push({ atAction: game.actionLog.length, type: action.type, faction: action.faction, error: e.message, thinkMs });
    flash(e.message);
  }
}

function undo() {
  if (history.length < 2) return;
  history.pop();
  game = deserialize(history[history.length - 1]);
  // Keep the sidecar aligned with the shrunken transcript — but record the
  // retraction itself: hesitation is signal even when the move is erased.
  const undone = telemetry.timings.pop();
  telemetry.undos.push({ atAction: game.actionLog.length, undone: undone ? { type: undone.type, faction: undone.faction } : null });
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

function marchCandidates(fid, from) {
  const out = { peaceful: [], battle: [] };
  const units = (game.unitsByRegion[from] || []).filter(u => u.faction === fid && !u.routed);
  if (!units.length) return out;
  const hasLand = units.some(u => u.type !== 'warship');
  const hasShips = units.some(u => u.type === 'warship');
  const cand = new Set([...(ADJ[from] || [])]);
  if (hasLand) {
    for (const r of REGIONS) {
      if (r.kind === 'land' && r.id !== from && transportReachable(game, fid, from, r.id)) cand.add(r.id);
    }
  }
  const myPort = PORTS.find(pp => pp.seaId === from);
  if (hasShips && myPort && controllerOf(game, myPort.landId) === fid) cand.add(myPort.id);
  for (const rid of cand) {
    const r = region(rid);
    if (r.kind === 'land' && !hasLand) continue;
    if (r.kind === 'maritime' && !hasShips) continue;
    const n = game.neutrals?.[rid];
    if (n?.insurmountable) continue;
    const there = game.unitsByRegion[rid] || [];
    const enemyUnits = there.some(u => u.faction !== fid);
    const enemyGarrison = game.garrisons[rid] && game.garrisons[rid].faction !== fid && !there.some(u => u.faction === fid);
    if (enemyUnits || enemyGarrison || n) out.battle.push(rid);
    else out.peaceful.push(rid);
  }
  return out;
}

function overlayHighlights(g) {
  // #1 — spotlight the decider whose panel is OPEN (during planning all six
  // seats hold queries at once; follow the tab the operator selected).
  const qs = game.pendingQueries;
  const activeQ = ui.activeQuery != null ? qs[Math.min(ui.activeQuery, qs.length - 1)] : qs[0];
  const focus = activeQ?.faction;
  if (focus) {
    const held = new Set();
    for (const [rid, units] of Object.entries(game.unitsByRegion)) {
      if ((units || []).some(u => u.faction === focus)) held.add(rid);
    }
    for (const r of REGIONS) {
      if (r.kind === 'land' && controllerOf(game, r.id) === focus) held.add(r.id);
    }
    for (const rid of held) {
      const { x, y } = posOf(rid);
      g.appendChild(el('circle', { cx: x, cy: y, r: 52, class: 'ov-focus',
        style: `stroke:${fColor(focus)}; fill:${fColor(focus)}` }));
    }
  }
  // #3 — while composing a march, ring the possible destinations; red = battle.
  if (ui.mode === 'march' && ui.region && activeQ) {
    const { peaceful, battle } = marchCandidates(activeQ.faction, ui.region);
    for (const rid of peaceful) {
      const { x, y } = posOf(rid);
      g.appendChild(el('circle', { cx: x, cy: y, r: 46, class: 'ov-target' }));
    }
    for (const rid of battle) {
      const { x, y } = posOf(rid);
      g.appendChild(el('circle', { cx: x, cy: y, r: 46, class: 'ov-battle' }));
    }
  }
}

function overlayState(svg) {
  svg.querySelector('.game-overlay')?.remove();
  const g = el('g', { class: 'game-overlay' });
  overlayHighlights(g);

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
  // Setup defense bonuses only: one badge per neutral force, styled like the
  // seat garrisons (same size, same numerals), gray ring for "no owner".
  for (const [rid, n] of Object.entries(game.neutrals)) {
    const { x, y } = posOf(rid);
    g.appendChild(el('circle', { cx: x, cy: y - 32, r: 10, class: 'ov-neutral' }));
    const t = el('text', { x, y: y - 27.5, class: 'ov-num' });
    t.textContent = n.insurmountable ? '~' : n.strength;
    g.appendChild(t);
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
  overlayState($('#map'));
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
      declareSupport: 'support', useBlade: 'blade', retreat: 'retreat', replacePortShips: 'port',
      chooseLeaderCard: 'leader card', chooseCasualties: 'casualties',
      useCardAbility: 'card ability', cardTarget: 'card target',
      eventChoice: 'event decree', reconcileSupply: 'supply losses',
      threatPeekPlacement: 'deck peek', muster: 'muster' }[q.type]);
}

function header(q, title) {
  return `<div class="form-head" style="border-color:${fColor(q.faction)}">
    <span class="fchip" style="background:${fColor(q.faction)}"></span>
    <b>${fGlyph(q.faction)} ${esc(fName(q.faction))}</b> — ${esc(title)}</div>`;
}

function cardText(id) {
  const c = LEADER_CARDS[id];
  if (!c?.text) return '';
  return c.text.replace(/\{(\w+)\}/g, (_, k) => theme.terms[k] ?? k);
}
function cardChip(id, { withText = true } = {}) {
  const c = LEADER_CARDS[id];
  const icons = '⚔'.repeat(c.swords) + '🛡'.repeat(c.forts);
  const nm = theme.cards?.[id] ?? id;
  return `<span class="card-chip"><b>${c.strength}</b> ${esc(nm)}${icons ? ' ' + icons : ''}</span>` +
    (withText && c.text ? `<div class="card-text">${esc(cardText(id))}${c.implemented === false ? ' <em>(ability lands in M1.5b)</em>' : ''}</div>` : '');
}

function eventCardName(id) { return theme.eventCards?.[id] ?? id; }

const EVENT_OPTION_LABELS = {
  muster: () => `everyone recruits (${(theme.terms.rally || 'rally')} the banners)`,
  supplyUpdate: () => 'everyone updates supply and reconciles armies',
  bidTracks: () => 'everyone bids on the three tracks',
  collectAuthority: () => `everyone collects ${theme.terms.authority || 'authority'}`,
  nothing: () => 'no effect',
};
function eventOptionLabel(opt) {
  if (opt.startsWith('banOrder:')) {
    const cls = opt.split(':')[1];
    return cls === 'marchPlusOne' ? 'forbid +1 march orders this round' : `forbid ${cls} orders this round`;
  }
  return (EVENT_OPTION_LABELS[opt] || (() => opt))();
}

function eventChoiceForm(q) {
  return header(q, `${eventCardName(q.card)} — decree`) +
    q.options.map(o => `<button class="opt" data-opt="${esc(o)}">${esc(eventOptionLabel(o))}</button>`).join('') +
    `<div class="hint">The ${q.deck ? 'Deck ' + q.deck + ' ' : ''}card grants its holder the decision.</div>`;
}

function reconcileForm(q) {
  const rows = q.regions.map(rid => {
    const units = (game.unitsByRegion[rid] || []).filter(u => u.faction === q.faction);
    const types = [...new Set(units.map(u => u.type))];
    return `<div class="stepper-row"><b>${esc(rName(rid))}</b> (${units.length} units): ` +
      types.map(t => `<button class="opt" data-region="${rid}" data-unit="${t}">destroy ${esc(theme.terms[t] || t)}</button>`).join(' ') +
      `</div>`;
  }).join('');
  return header(q, 'supply exceeded — choose losses') + rows +
    `<div class="hint">Destroy one unit at a time until your armies fit your supply.</div>`;
}

function invaderText(t) {
  return (t || '').replace(/\{(\w+)\}/g, (_, k) => theme.terms[k] ?? k);
}
function peekForm(q) {
  const c = q.card ? INVADER_CARDS[q.card] : null;
  const known = q.card ? `<div class="card-text">Top of the threat deck: <b>${esc(eventCardName(q.card))}</b>
    <div class="hint">${esc(invaderText(c?.winText))}</div>
    <div class="hint">${esc(invaderText(c?.lossText))}</div></div>` : '';
  return header(q, `${theme.terms.tokenCourier} — deck peek`) + known +
    `<button class="opt" data-opt="top">leave it on top</button>` +
    `<button class="opt" data-opt="bottom">bury it at the bottom</button>`;
}

const MUSTER_COSTS_UI = { infantry: 1, warship: 1, cavalry: 2, siege_engine: 2, upgrade: 1 };
function musterForm(q) {
  const staged = ui.musterBuilds || [];
  const spent = staged.reduce((a, b) => a + MUSTER_COSTS_UI[b.type], 0);
  const left = q.points - spent;
  const port = PORTS.find(pp => pp.landId === q.region);
  const seas = [...(ADJ[q.region] || [])].filter(x => region(x).kind === 'maritime');
  const hasInf = (game.unitsByRegion[q.region] || [])
    .filter(u => u.faction === q.faction && u.type === 'infantry' && !u.routed).length
    > staged.filter(b => b.type === 'upgrade').length;
  const btn = (label, cost, data, on = true) =>
    `<button class="opt" data-mbuild='${data}' ${cost > left || !on ? 'disabled' : ''}>${label} <span class="dim">(${cost})</span></button>`;
  const stagedRows = staged.map((b, i) =>
    `<div class="stepper-row">${esc(theme.terms[b.type] || b.type)}${b.to ? ' → ' + esc(rName(b.to)) : ''} <button class="opt" data-munstage="${i}">✕</button></div>`).join('');
  return header(q, `${q.source === 'rally' ? 'rally ' : ''}muster at ${esc(rName(q.region))} — ${left}/${q.points} points`) +
    battleless() +
    btn(`${esc(theme.terms.infantry)}`, 1, JSON.stringify({ type: 'infantry', to: q.region })) +
    btn(`${esc(theme.terms.cavalry)}`, 2, JSON.stringify({ type: 'cavalry', to: q.region })) +
    btn(`${esc(theme.terms.siege_engine)}`, 2, JSON.stringify({ type: 'siege_engine', to: q.region })) +
    btn(`upgrade ${esc(theme.terms.infantry)} → ${esc(theme.terms.cavalry)}`, 1, JSON.stringify({ type: 'upgrade' }), hasInf) +
    (port ? btn(`${esc(theme.terms.warship)} → harbor`, 1, JSON.stringify({ type: 'warship', to: port.id })) : '') +
    seas.map(sid => btn(`${esc(theme.terms.warship)} → ${esc(rName(sid))}`, 1, JSON.stringify({ type: 'warship', to: sid }))).join('') +
    (stagedRows ? `<div class="hint">Staged:</div>` + stagedRows : '') +
    `<button class="opt commit" data-mcommit>1 ${staged.length ? 'muster ' + staged.length + ' build(s)' : 'muster nothing (pass)'}</button>`
      .replace('>1 ', '>') +
    `<div class="hint">Costs: ${esc(theme.terms.infantry)}/${esc(theme.terms.warship)} 1 · ${esc(theme.terms.cavalry)}/${esc(theme.terms.siege_engine)} 2 · upgrade 1. Supply and pools are enforced on commit.</div>`;
}
function battleless() { return ''; }

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
  if (q.type === 'chooseLeaderCard') return leaderCardForm(q);
  if (q.type === 'chooseCasualties') return casualtyForm(q);
  if (q.type === 'useCardAbility') return abilityForm(q);
  if (q.type === 'cardTarget') return targetForm(q);
  if (q.type === 'eventChoice') return eventChoiceForm(q);
  if (q.type === 'reconcileSupply') return reconcileForm(q);
  if (q.type === 'muster') return musterForm(q);
  if (q.type === 'threatPeekPlacement') return peekForm(q);
  return `<pre>${esc(JSON.stringify(q))}</pre>`;
}

// --- leader cards (M1.5a) ---
function leaderCardForm(q) {
  const rows = q.hand.map(id =>
    `<button class="opt card-opt" data-lcard="${id}">${cardChip(id)}</button>`).join('');
  return `<p>${fGlyph(q.faction)} choose a ${esc(theme.terms.leaderCard)} — face-down until both sides commit.</p>
    <div class="card-list">${rows}</div>`;
}

function casualtyForm(q) {
  if (ui.mode !== 'casualties') ui = { activeQuery: ui.activeQuery, mode: 'casualties', pick: {} };
  const chosen = Object.values(ui.pick).reduce((a, b) => a + b, 0);
  const rows = Object.entries(q.available).map(([t, max]) => {
    const n = ui.pick[t] || 0;
    return `<div class="stepper-row">${esc(unitName(t))} (${max} in the field)
      <span class="stepper"><button data-cdec="${t}">−</button><b>${n}</b><button data-cinc="${t}" data-max="${max}">+</button></span></div>`;
  }).join('');
  return `<p>${fGlyph(q.faction)} the swords fall: choose <b>${q.count}</b> casualt${q.count === 1 ? 'y' : 'ies'}.</p>
    ${rows}<button class="go" id="do-casualties" ${chosen === q.count ? '' : 'disabled'}>Accept losses</button>`;
}

function abilityForm(q) {
  const cost = q.cost ? ` (costs ${q.cost} ${esc(theme.terms.authority)})` : '';
  return `<p>${fGlyph(q.faction)} ${cardChip(q.card)}</p>
    <p>Invoke the ability${esc(cost)}?</p>
    <div class="btn-col">
      <button data-ability="1">Use it</button>
      <button data-ability="0" class="ghost">Let it pass</button>
    </div>`;
}

function targetLabel(q, t) {
  if (t === 'embattled') return `The embattled area — ${rName(game.combat.region)}`;
  if (['initiative', 'prowess', 'command'].includes(t)) {
    return theme.terms['track' + t[0].toUpperCase() + t.slice(1)] ?? t;
  }
  if (LEADER_CARDS[t]) return `${LEADER_CARDS[t].strength} · ${theme.cards?.[t] ?? t}`;
  return rName(t);
}

function targetForm(q) {
  const rows = q.options.map(t =>
    `<button data-ctarget="${t}">${esc(targetLabel(q, t))}</button>`).join('');
  return `<p>${fGlyph(q.faction)} ${cardChip(q.card)}</p>
    <p>Choose a target:</p><div class="btn-col">${rows}
    ${q.skippable ? '<button data-ctarget="skip" class="ghost">Decline</button>' : ''}</div>`;
}

// --- planning ---
function planningForm(q) {
  if (ui.mode !== 'planning' || ui.faction !== q.faction) {
    ui = { activeQuery: ui.activeQuery, mode: 'planning', faction: q.faction, assignments: {} };
    for (const rid of orderableRegions(game, q.faction)) ui.assignments[rid] = null;
  }
  const limit = starLimit(game, q.faction);
  // The row being re-picked returns its token to the pool (mirrors the
  // click handler exactly — index parity is what makes picks WYSIWYG).
  const poolBasis = Object.entries(ui.assignments)
    .filter(([r, o]) => o && r !== ui.awaitTokenFor).map(([, o]) => o);
  const used = Object.values(ui.assignments).filter(Boolean);
  const stars = poolBasis.filter(o => o.starred).length;
  const remaining = remainingTokens(poolBasis);

  let html = header(q, 'assign orders');
  html += `<div class="star-budget">★ ${used.filter(o => o.starred).length}/${limit}</div><div class="order-rows">`;
  for (const [rid, o] of Object.entries(ui.assignments)) {
    html += `<button class="order-row ${ui.awaitTokenFor === rid ? 'picking' : ''}" data-row="${rid}">
      <span>${esc(rName(rid))}</span><span class="tok">${o ? esc(tokenLabel(o)) : '—'}</span></button>`;
  }
  html += `</div>`;
  if (ui.awaitTokenFor) {
    html += `<div class="token-grid">` + remaining.map((t, i) =>
      `<button class="token" data-tok="${i}" ${t.starred && stars >= limit ? 'disabled' : ''}>
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
  html += `<button data-repick>↩ choose a different raid</button>`;
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
  if (q.regions.length > 1) html += `<button data-repick>↩ choose a different march</button>`;
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
  </div>` + battleCards(c);
}

function battleCards(c) {
  if (!c.cards) return '';
  const cell = fid => {
    const id = c.cards[fid];
    if (!id) return c.cardsRevealed ? '<span class="card-chip ghost">no card</span>' : '<span class="card-chip ghost">choosing…</span>';
    return c.cardsRevealed ? cardChip(id) : '<span class="card-chip ghost">🂠 face-down</span>';
  };
  return `<div class="battle-cards"><div>${cell(c.attacker)}</div><div>${cell(c.defender)}</div></div>`;
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
  if (q.type === 'eventChoice') {
    panel.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'eventChoice', faction: q.faction, option: b.dataset.opt })));
    return;
  }
  if (q.type === 'threatPeekPlacement') {
    panel.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'threatPeekPlacement', faction: q.faction, placement: b.dataset.opt })));
    return;
  }
  if (q.type === 'reconcileSupply') {
    panel.querySelectorAll('[data-region]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'reconcileSupply', faction: q.faction, region: b.dataset.region, unitType: b.dataset.unit })));
    return;
  }
  if (q.type === 'muster') {
    panel.querySelectorAll('[data-mbuild]').forEach(b => b.addEventListener('click', () => {
      (ui.musterBuilds = ui.musterBuilds || []).push(JSON.parse(b.dataset.mbuild));
      renderTurnPanel();
    }));
    panel.querySelectorAll('[data-munstage]').forEach(b => b.addEventListener('click', () => {
      ui.musterBuilds.splice(+b.dataset.munstage, 1);
      renderTurnPanel();
    }));
    panel.querySelector('[data-mcommit]')?.addEventListener('click', () =>
      dispatch({ type: 'muster', faction: q.faction, region: q.region, builds: ui.musterBuilds || [] }));
    return;
  }

  panel.querySelector('#do-submit')?.addEventListener('click', () =>
    dispatch({ type: 'submitOrders', faction: q.faction, orders: ui.assignments }));

  panel.querySelectorAll('[data-row]').forEach(b => b.addEventListener('click', () => {
    ui.awaitTokenFor = b.dataset.row; renderTurnPanel();
  }));
  panel.querySelectorAll('[data-tok]').forEach(b => b.addEventListener('click', () => {
    const poolBasis = Object.entries(ui.assignments)
      .filter(([r, o]) => o && r !== ui.awaitTokenFor).map(([, o]) => o);
    const t = remainingTokens(poolBasis)[+b.dataset.tok];
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
  panel.querySelector('[data-repick]')?.addEventListener('click', () => {
    ui.region = null; ui.moves = []; ui.leaveControl = false; ui.awaitDest = false;
    renderTurnPanel();
  });
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

  panel.querySelectorAll('[data-lcard]').forEach(b => b.addEventListener('click', () =>
    dispatch({ type: 'chooseLeaderCard', faction: q.faction, card: b.dataset.lcard })));
  panel.querySelectorAll('[data-cinc]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.cinc;
    ui.pick[t] = Math.min(+b.dataset.max, (ui.pick[t] || 0) + 1); renderTurnPanel();
  }));
  panel.querySelectorAll('[data-cdec]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.cdec;
    ui.pick[t] = Math.max(0, (ui.pick[t] || 0) - 1); renderTurnPanel();
  }));
  panel.querySelectorAll('[data-ability]').forEach(b => b.addEventListener('click', () =>
    dispatch({ type: 'useCardAbility', faction: q.faction, use: b.dataset.ability === '1' })));
  panel.querySelectorAll('[data-ctarget]').forEach(b => b.addEventListener('click', () =>
    dispatch({ type: 'cardTarget', faction: q.faction, target: b.dataset.ctarget })));

  panel.querySelector('#do-casualties')?.addEventListener('click', () =>
    dispatch({ type: 'chooseCasualties', faction: q.faction, units: Object.fromEntries(Object.entries(ui.pick).filter(([, n]) => n > 0)) }));

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
    case 'eventPhaseBegan': return `— Round ${e.round}: the ${esc(theme.terms.eventPhase || 'Event Phase')} —`;
    case 'eventCardRevealed': return `Deck ${e.deck}: <b>${esc(eventCardName(e.card))}</b>.`;
    case 'eventDeckReshuffled': return `Deck ${e.deck} was shuffled anew, discards and all.`;
    case 'threatAdvanced': return `The ${esc(theme.terms.threat || 'threat')} grows: ${e.threat} of 12.`;
    case 'eventNothing': return `${esc(eventCardName(e.card))}: nothing happens.`;
    case 'ordersBanned': return `${esc(eventCardName(e.card))}: ${e.order === 'marchPlusOne' ? '+1 march' : esc(e.order)} orders are forbidden this round.`;
    case 'eventChoiceMade': return `${F(e.faction)} decreed: ${esc(e.option.startsWith('banOrder:') ? 'forbid ' + e.option.split(':')[1] + ' orders' : e.option)}.`;
    case 'supplyAdjusted': return `${F(e.faction)} supply ${e.from} → ${e.to}.`;
    case 'destroyedForSupply': return e.chosen
      ? `${F(e.faction)} disbanded a ${esc(theme.terms[e.unit] || e.unit)} at ${esc(rName(e.region))} to meet supply.`
      : `${F(e.faction)} lost units to supply at ${esc(rName(e.region))}.`;
    case 'authorityCollected': return `${F(e.faction)} collected ${e.amount} ${esc(theme.terms.authority)}.`;
    case 'courierPeeked': return `${F(e.faction)} peeked at the threat deck.`;
    case 'threatPeekPlaced': return `${F(e.faction)} ${e.placement === 'bottom' ? 'buried the card' : 'left the card on top'}.`;
    case 'musteringBegan': return `The banners are called: ${e.sites} strongholds may recruit.`;
    case 'mustered': return e.builds.length
      ? `${F(e.faction)} recruited at ${esc(rName(e.region))} (${e.spent} pts).`
      : `${F(e.faction)} held recruitment at ${esc(rName(e.region))}.`;
    case 'rallyMusterOpened': return `${F(e.faction)}'s ★ rally raises banners at ${esc(rName(e.region))}.`;
    case 'bidPending': return `<em>${esc(eventCardName(e.card))} — track bidding arrives in M2.c.</em>`;
    case 'incursionPending': return `<em>${e.trigger === 'threatMax' ? 'The threat breaks!' : esc(eventCardName(e.card || ''))} — incursions arrive in M2.d.</em>`;
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
    case 'leaderCardChosen': return `${F(e.faction)} slides a ${esc(theme.terms.leaderCard)} face-down.`;
    case 'leaderCardRevealed': return `${F(e.faction)} reveals ${esc(theme.cards?.[e.card] ?? e.card)}.`;
    case 'cardCanceled': return `${esc(theme.cards?.[e.by] ?? e.by)} cancels ${F(e.faction)}'s ${esc(theme.cards?.[e.card] ?? e.card)} — it returns to hand.`;
    case 'foughtCardless': return `${F(e.faction)} must fight without a ${esc(theme.terms.leaderCard)}.`;
    case 'cardSwapped': return `${F(e.faction)} pays ${e.cost} ${esc(theme.terms.authority)} to set aside ${esc(theme.cards?.[e.card] ?? e.card)}.`;
    case 'cardUnitDestroyed': return `${esc(theme.cards?.[e.by] ?? e.by)} strikes down a ${esc(unitName(e.unit))} of ${F(e.faction)}.`;
    case 'orderRemovedByCard': return `${esc(theme.cards?.[e.by] ?? e.by)} sweeps ${F(e.faction)}'s order off ${esc(rName(e.region))}.`;
    case 'trackDemoted': return `${esc(theme.cards?.[e.by] ?? e.by)} casts ${F(e.faction)} to the bottom of the ${esc(theme.terms['track' + e.track[0].toUpperCase() + e.track.slice(1)] ?? e.track)} track.`;
    case 'authorityFromCard': return `${esc(theme.cards?.[e.by] ?? e.by)} claims ${e.amount} ${esc(theme.terms.authority)} in victory.`;
    case 'discardRecovered': return `${esc(theme.cards?.[e.by] ?? e.by)} gathers ${F(e.faction)}'s spent leaders back to hand.`;
    case 'cardUnitUpgraded': return `${esc(theme.cards?.[e.by] ?? e.by)} knights a ${esc(unitName('infantry'))} at ${esc(rName(e.region))} — it fights on as ${esc(unitName('cavalry'))}.`;
    case 'cardMarchMoved': return `${esc(theme.cards?.[e.by] ?? e.by)} carries the march order into ${esc(rName(e.region))} — it may sound again.`;
    case 'advanceBlocked': return `${esc(theme.cards?.[e.by] ?? e.by)} bars the gates: ${F(e.faction)} may not advance into ${esc(rName(e.region))}.`;
    case 'cardDiscardedByCard': return `${esc(theme.cards?.[e.by] ?? e.by)} plucks ${esc(theme.cards?.[e.card] ?? e.card)} from ${F(e.faction)}'s hand.`;
    case 'casualtiesTaken': return `${F(e.faction)} loses ${esc(Object.entries(e.units).map(([t, n]) => `${n} ${unitName(t)}`).join(', '))} to the swords.`;
    case 'leaderHandRecycled': return `${F(e.faction)}'s leaders return to the fold — the hand is fresh.`;
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
function renderHouses() {
  const el = $('#houses-panel');
  if (!el) return;
  const active = new Set(game.pendingQueries.map(q => q.faction));
  el.innerHTML = game.factions.map(f => `
    <div class="house-row ${active.has(f) ? 'house-active' : ''}" style="border-left-color:${fColor(f)}">
      <span class="house-name">${fGlyph(f)} ${esc(fName(f))}</span>
      <span title="seats (win at 7)">⌂${seatsControlled(game, f)}</span>
      <span title="supply">⛁${game.supply[f]}</span>
      <span title="${esc(theme.terms.authority)}">◈${game.authority[f]}</span>
    </div>`).join('');
}

function renderTracks() {
  const el = $('#tracks-panel');
  if (!el) return;
  const rows = [
    ['initiative', theme.terms.trackInitiative, 'sovereign', theme.terms.tokenSovereign],
    ['prowess',    theme.terms.trackProwess,    'blade',     theme.terms.tokenBlade],
    ['command',    theme.terms.trackCommand,    'courier',   theme.terms.tokenCourier],
  ];
  const stars = STAR_ALLOWANCE[game.ruleset.seatCount] || [];
  el.innerHTML = rows.map(([track, label, token, tokenName]) => {
    const seats = game.tracks[track].map((f, i) => {
      const star = track === 'command' && stars[i] ? `<sup>${'★'.repeat(stars[i])}</sup>` : '';
      const holder = i === 0 ? `<span class="tok-dot" title="${esc(tokenName)}">●</span>` : '';
      const hot = game.pendingQueries.some(q => q.faction === f) ? ' seat-active' : '';
      return `<span class="track-seat${hot}" style="border-color:${fColor(f)}" title="${esc(fName(f))} — position ${i + 1}">${fGlyph(f)}${star}${holder}</span>`;
    }).join('');
    return `<div class="track-row"><span class="track-name" title="${esc(tokenName)} to the leader">${esc(label)}</span>${seats}</div>`;
  }).join('');
}

function render() {
  lastRenderAt = performance.now();
  const svg = $('#map');
  renderMap(svg, theme, { onSelect: handleRegionTap });
  overlayState(svg);
  renderTurnPanel();
  renderHouses();
  renderTracks();
  renderLog();
  const sl = $('#seed-line');
  if (sl) sl.textContent = `seed ${game.config?.seed ?? '—'}`;
  const phaseNames = { planning: 'Planning', action: 'Action', event: 'Event Phase', gameOver: 'Game over' };
  $('#status-line').textContent = `Round ${game.round} of 10 · ${phaseNames[game.phase] || game.phase} · ${theme.terms.threat || 'Threat'} ${game.threat ?? 0}/12 · ` +
    game.factions.map(f => `${fGlyph(f)}${seatsControlled(game, f)}`).join(' ');
}

// ---------- chrome ----------
function init() {
  $('#theme-select').addEventListener('change', e => { theme = THEMES[e.target.value]; render(); });
  $('#btn-new').addEventListener('click', () => newGame());
  $('#seed-line').addEventListener('click', () => {
    const raw = prompt('Start a new game with a specific seed (blank cancels):');
    if (raw && Number.isFinite(+raw)) newGame(+raw);
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-save').addEventListener('click', () => {
    const blob = new Blob([serialize(game)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hegemon-round${game.round}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#btn-episode').addEventListener('click', () => {
    const title = prompt('Episode title (e.g. "Stark northern clamp — opener v1"):') || '';
    const notes = title ? (prompt('Notes (optional):') || '') : '';
    const ep = episodeRecord(game, {
      title, notes, recordedAt: new Date().toISOString(),
      seatControllers: Object.fromEntries(game.factions.map(f => [f, 'human'])), // robots will self-declare (M3)
    });
    ep.telemetry = telemetry; // Tier-2 sidecar: latency/undo/rejection observations
    const blob = new Blob([JSON.stringify(ep, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `episode-${(title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-r${game.round}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('Episode exported.');
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
