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
import { renderMap, portAnchor, cameraCenterOn, cameraZoomBy, cameraReset } from '../map-view.js';
import { ICON_SETS } from '../icons.js';
import { legalActions, currentQuery } from '../engine/legal.js';
import { createRandomAgent, botRng } from '../agents/random.js';
import { createHeuristicAgent } from '../agents/heuristic.js';
import { viewFor } from '../engine/views.js';

// Bumped every delivered drop; shown beside the seed so a stale deploy or a
// cached module is visible at a glance (owner finding, Jul 2026: an entire
// icon milestone was invisible — cache vs code was undiagnosable remotely).
export const BUILD_ID = 'm3d7';

// ---------------------------------------------------------------------------
// Spectate (M3.a, owner decision c; heuristic policy M3.b): bots play EVERY
// seat while you watch — same legalActions seam the headless fuzzer proves,
// same dispatch path a human uses, so the log, stage, and episode machinery
// all run for free. A speed slider, a policy select (random | heuristic —
// heuristic seats get seeded per-seat jitter, so each faction has its own
// personality), a toggle, nothing else.
// ---------------------------------------------------------------------------
const spectate = { on: false, timer: null, agents: null, policy: null, rng: null };

// ---------------------------------------------------------------------------
// Mixed-seat mode (M3.c, owner decisions Jul 2026): ONE human seat, bots play
// the rest. The entire display path reads shown() — viewFor(game, humanSeat)
// whenever a bot is at the table — so hidden information (unrevealed order
// faces, sealed bids, foreign peeks, pre-reveal card picks) is masked by the
// same code path that protects it from AI seats. Architectural, not audited:
// the render layer CANNOT leak what it never receives. Table mode (no bots)
// renders raw state exactly as before — the operator-trust exception stays
// the exception, per the banked information-access contract.
// ---------------------------------------------------------------------------
const mixed = { human: null, policy: 'heuristic', agents: null, key: null, rng: null, timer: null };
const isBotSeat = fid => !!mixed.human && fid !== mixed.human;

let _viewCache = null;
function shown() {
  if (!game || !mixed.human) return game;
  return (_viewCache ||= viewFor(game, mixed.human));
}

/** The pending queries this operator may see and answer. */
function visibleQueries() {
  const all = shown()?.pendingQueries || [];
  return mixed.human ? all.filter(q => q.faction === mixed.human) : all;
}

function mixedAgents() {
  const seed = game.config?.seed ?? 1;
  const key = `${mixed.policy}|${seed}|${mixed.human}`;
  if (mixed.agents && mixed.key === key) return mixed.agents;
  mixed.key = key;
  const jitterBase = (seed * 131) | 0;
  mixed.agents = Object.fromEntries(game.factions.map((fid, i) =>
    [fid, isBotSeat(fid)
      ? (mixed.policy === 'heuristic'
          ? createHeuristicAgent({ jitterSeed: jitterBase + i })
          : createRandomAgent())
      : null]));
  return mixed.agents;
}

/** Bots answer their pending queries on the spectate-slider cadence (owner
    decision). Human queries stop the pump; dispatch → render → pump chains. */
function botPump() {
  clearTimeout(mixed.timer); mixed.timer = null;
  if (!mixed.human || !game || game.phase === 'gameOver' || spectate.on) return;
  const q = game.pendingQueries.find(x => isBotSeat(x.faction));
  if (!q) return; // the table waits on you
  const ms = Number($('#spectate-speed')?.value || 600);
  mixed.timer = setTimeout(() => {
    mixed.timer = null;
    const q2 = game.pendingQueries.find(x => isBotSeat(x.faction));
    if (!q2 || spectate.on || game.phase === 'gameOver') return;
    try {
      const menu = legalActions(game, q2);
      mixed.rng = mixed.rng || botRng((((game.config?.seed ?? 1) * 977) + 41) | 0);
      dispatch(mixedAgents()[q2.faction].decide(viewFor(game, q2.faction), q2, menu, mixed.rng));
    } catch (e) {
      console.error('bot halted:', e);
      flash(`Bot error (${q2.faction}): ${e.message}`);
    }
  }, ms);
}

function spectateAgents() {
  const policy = $('#spectate-policy')?.value || 'heuristic';
  const seed = game.config?.seed ?? 1;
  if (spectate.agents && spectate.policy === policy && spectate.seed === seed) return spectate.agents;
  spectate.policy = policy; spectate.seed = seed;
  const jitterBase = (seed * 131) | 0;
  spectate.agents = Object.fromEntries(game.factions.map((fid, i) =>
    [fid, policy === 'heuristic'
      ? createHeuristicAgent({ jitterSeed: jitterBase + i })
      : createRandomAgent()]));
  return spectate.agents;
}

function spectateTick() {
  if (!spectate.on) return;
  if (game.phase === 'gameOver') { toggleSpectate(false); return; }
  const q = currentQuery(game);
  if (!q) return; // engine settling; next tick
  try {
    const menu = legalActions(game, q);
    dispatch(spectateAgents()[q.faction].decide(viewFor(game, q.faction), q, menu, spectate.rng));
  } catch (e) {
    console.error('spectate halted:', e);
    toggleSpectate(false);
  }
}

function toggleSpectate(onOff) {
  spectate.on = onOff ?? !spectate.on;
  clearInterval(spectate.timer);
  spectate.timer = null;
  if (spectate.on) {
    spectate.rng = spectate.rng || botRng((game.config?.seed ?? 1) * 977 + 13);
    const ms = Number($('#spectate-speed')?.value || 600);
    spectate.timer = setInterval(spectateTick, ms);
  }
  const btn = $('#btn-spectate');
  if (btn) btn.textContent = spectate.on ? 'Spectating…' : 'Spectate';
  if (!spectate.on) botPump(); // mixed games resume when spectate ends (M3.c)
}
import { createGame, serialize, deserialize, region, seatsControlled, STAR_ALLOWANCE, controllerOf, regionProps } from '../engine/state.js';
import { applyAction, beginPlanning, orderClasses, orderableRegions, starLimit, ORDER_TOKENS, maxPlaceableOrders, episodeRecord } from '../engine/engine.js';
import { combatStrengths } from '../engine/combat.js';
import { transportReachable, landAreasControlled } from '../engine/actionPhase.js';
import { SETUP } from '../data/setup.js';
const SETUP_VICTORY_TARGET = SETUP.victoryTarget;

const THEMES = { core: THEME_CORE, asoiaf: THEME_ASOIAF, modern2026: THEME_2026 };
const ADJ = buildAdjacency();
const byId = Object.fromEntries([...REGIONS, ...PORTS].map(r => [r.id, r]));
const factionById = Object.fromEntries(FACTIONS.map(f => [f.id, f]));

let theme = THEME_CORE;
let game = null;

// M2.f.0 — a theme owns the whole chrome: its palette is written onto the
// CSS custom-property space and its texture keys the body weave.
const PALETTE_VARS = { ink: '--ink', ink2: '--ink-2', sea: '--sea', slate: '--slate',
  slate2: '--slate-2', accent: '--brass', text: '--bone', textDim: '--bone-dim', hair: '--hair' };
function applyThemeVisuals() {
  const v = theme.visuals || {};
  const root = document.documentElement;
  for (const [k, cssVar] of Object.entries(PALETTE_VARS)) {
    if (v.palette?.[k]) root.style.setProperty(cssVar, v.palette[k]);
  }
  document.body.dataset.texture = v.texture || 'linen';
}

// M2.f.1 — stage state lives OUTSIDE `ui` (which resets on every dispatch).
// seen: log watermark for the presentation queue; batch: the pending 3-card
// event-phase reveal; minimized: decision demoted to the side panel; quiet:
// passive reveals go to the Chronicle only.
const stageState = { seen: 0, batch: null, minimized: false, quiet: false };
let inspectorFid = 'F1';

// Dramatic decisions pop out on stage; table work (planning, order
// resolution, mustering) stays beside the map where the geography is.
const STAGE_TYPES = new Set(['eventChoice', 'bid', 'bidTieBreak', 'threatPeekPlacement',
  'invaderBid', 'invaderTieBreak', 'incursionUnits', 'incursionTrack', 'incursionCard',
  'incursionOption', 'incursionMusterSite',
  'declareSupport', 'useBlade', 'retreat', 'chooseLeaderCard', 'chooseCasualties',
  'useCardAbility', 'cardTarget']);
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
const tokenLabel = o => o?.hidden ? 'face-down order' : `${orderName(o.type)}${o.mod ? (o.mod > 0 ? ` +${o.mod}` : ` ${o.mod}`) : ''}${o.starred ? ' ★' : ''}`;
const unitName = t => ({ infantry: theme.terms.unitInfantry, cavalry: theme.terms.unitCavalry, warship: theme.terms.unitWarship, siege_engine: theme.terms.unitSiege }[t]);

// ---------- lifecycle ----------
function newGame(seed) {
  resetTelemetry();
  // Seat assignment takes effect on New game (M3.c): 'table' = classic
  // all-seats operator mode; a faction id = you vs five bots.
  const seatSel = $('#seat-select')?.value || 'table';
  mixed.human = seatSel === 'table' ? null : seatSel;
  mixed.policy = $('#spectate-policy')?.value || 'heuristic';
  mixed.agents = null; mixed.key = null; mixed.rng = null;
  clearTimeout(mixed.timer); mixed.timer = null;
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
  stageState.seen = 0; stageState.batch = null; stageState.minimized = false;
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
    _viewCache = null;
    // Aligned by transcript index: timings[i] annotates actionLog[i].
    telemetry.timings.push({ i: game.actionLog.length - 1, type: action.type, faction: action.faction, thinkMs });
    history.push(serialize(game));
    if (history.length > 200) history.shift();
    ui = {};
    stageState.minimized = false; // each new decision earns its own entrance
    render();
  } catch (e) {
    telemetry.rejections.push({ atAction: game.actionLog.length, type: action.type, faction: action.faction, error: e.message, thinkMs });
    flash(e.message);
  }
}


function restoreFromText(text) {
  const parsed = JSON.parse(text);
  if (parsed && parsed.save === 'hegemon-save/2') {
    game = deserialize(JSON.stringify(parsed.engine));
    mixed.human = parsed.controllers?.human ?? null;
    mixed.policy = parsed.controllers?.policy ?? 'heuristic';
  } else {
    game = deserialize(text);
    mixed.human = null; // raw saves restore as table mode
  }
  mixed.agents = null; mixed.key = null; mixed.rng = null;
  clearTimeout(mixed.timer); mixed.timer = null;
  _viewCache = null;
  history = [serialize(game)];
  ui = {};
  resetTelemetry();
}

function undo() {
  if (history.length < 2) return;
  // Mixed mode (M3.c): rewind THROUGH intervening bot actions back to before
  // your own last decision — undoing onto a bot's turn would just watch the
  // pump replay it. Bots re-decide forward from your changed move (the bot
  // RNG stream is not rewound, so they may reconsider — noted in README).
  do {
    const undoneAction = game.actionLog[game.actionLog.length - 1];
    history.pop();
    game = deserialize(history[history.length - 1]);
    _viewCache = null;
    // Keep the sidecar aligned with the shrunken transcript — but record the
    // retraction itself: hesitation is signal even when the move is erased.
    const undone = telemetry.timings.pop();
    telemetry.undos.push({ atAction: game.actionLog.length, undone: undone ? { type: undone.type, faction: undone.faction } : null });
    if (!mixed.human) break;
    if (undoneAction && undoneAction.faction === mixed.human) break;
  } while (history.length >= 2);
  ui = {};
  stageState.seen = game.log.length; // never re-stage the rewound past
  stageState.batch = null;
  stageState.minimized = false;
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
  return portAnchor(byId[r.landId], byId[r.seaId]); // must match the diamond
};

/** M2.f.3 — themed unit silhouette. The symbol set is swapped per theme by
    injectIcons(); ids are stable, so this never cares which theme is live.
    currentColor = the faction tint; symbol-internal details use var(--ink). */
function unitGlyph(u, x, y) {
  const use = el('use', { x: x - 9, y: y - 9, width: 18, height: 18, class: 'unit-ic' });
  use.setAttribute('href', `#i-unit-${u.type}`);
  use.style.color = fColor(u.faction);
  if (u.routed) use.setAttribute('opacity', '0.45');
  return use;
}

function marchCandidates(fid, from) {
  const out = { peaceful: [], battle: [] };
  const units = (shown().unitsByRegion[from] || []).filter(u => u.faction === fid && !u.routed);
  if (!units.length) return out;
  const hasLand = units.some(u => u.type !== 'warship');
  const hasShips = units.some(u => u.type === 'warship');
  const cand = new Set([...(ADJ[from] || [])]);
  if (hasLand) {
    for (const r of REGIONS) {
      if (r.kind === 'land' && r.id !== from && transportReachable(shown(), fid, from, r.id)) cand.add(r.id);
    }
  }
  for (const rid of cand) {
    const r = region(rid);
    if (r.kind === 'land' && !hasLand) continue;
    if (r.kind === 'maritime' && !hasShips) continue;
    if (r.kind === 'port') {
      // Owner finding (Jul 2026): symmetric adjacency now surfaces EVERY
      // port of the sea (the old .find() offered only the first). A port is
      // only ever a peaceful destination: own harbor, entered from its sea,
      // with a berth free (Rules p.25) — the validator enforces exact counts.
      if (!hasShips) continue;
      const pdef = PORTS.find(pp => pp.id === rid);
      if (!pdef || pdef.seaId !== from) continue;
      if (controllerOf(shown(), pdef.landId) !== fid) continue;
      if ((shown().unitsByRegion[rid] || []).length >= 3) continue;
      out.peaceful.push(rid);
      continue;
    }
    const n = shown().neutrals?.[rid];
    if (n?.insurmountable) continue;
    const there = shown().unitsByRegion[rid] || [];
    const enemyUnits = there.some(u => u.faction !== fid);
    const enemyGarrison = shown().garrisons[rid] && shown().garrisons[rid].faction !== fid && !there.some(u => u.faction === fid);
    if (enemyUnits || enemyGarrison || n) out.battle.push(rid);
    else out.peaceful.push(rid);
  }
  return out;
}

function overlayHighlights(g) {
  // #1 — spotlight the decider whose panel is OPEN (during planning all six
  // seats hold queries at once; follow the tab the operator selected).
  // Mixed mode (M3.c): the tab list is the HUMAN's queries only — index
  // parity with the panel is what keeps the spotlight honest.
  const qs = visibleQueries();
  const activeQ = ui.activeQuery != null ? qs[Math.min(ui.activeQuery, qs.length - 1)] : qs[0];
  const focus = activeQ?.faction;
  if (focus) {
    const held = new Set();
    for (const [rid, units] of Object.entries(shown().unitsByRegion)) {
      if ((units || []).some(u => u.faction === focus)) held.add(rid);
    }
    for (const r of REGIONS) {
      if (r.kind === 'land' && controllerOf(shown(), r.id) === focus) held.add(r.id);
    }
    for (const rid of held) {
      const { x, y } = posOf(rid);
      g.appendChild(el('circle', { cx: x, cy: y, r: 52, class: 'ov-focus',
        style: `stroke:${fColor(focus)}; fill:${fColor(focus)}` }));
    }
  }
  // #3 — march projections (owner P2, Jul 2026): the green/red destination
  // rings come up the moment a march step is in front of you — not only
  // after entering composition. Red = a battle would begin there.
  const marchRegion = (ui.mode === 'march' && ui.region) ? ui.region
    : (activeQ?.type === 'resolveOrder' && activeQ.step === 'march') ? (ui.region || activeQ.regions[0]) : null;
  if (marchRegion && activeQ) {
    const { peaceful, battle } = marchCandidates(activeQ.faction, marchRegion);
    const ringR = rid => region(rid).kind === 'port' ? 22 : 46;
    for (const rid of peaceful) {
      const { x, y } = posOf(rid);
      g.appendChild(el('circle', { cx: x, cy: y, r: ringR(rid), class: 'ov-target' }));
    }
    for (const rid of battle) {
      const { x, y } = posOf(rid);
      g.appendChild(el('circle', { cx: x, cy: y, r: ringR(rid), class: 'ov-battle' }));
    }
  }

  // Raid resolution (owner P2): ring the raider and every reachable enemy order.
  if (activeQ?.type === 'resolveOrder' && activeQ.step === 'raid') {
    const src = ui.region || activeQ.regions[0];
    const { x, y } = posOf(src);
    g.appendChild(el('circle', { cx: x, cy: y, r: 50, class: 'ov-raider' }));
    for (const rid of ADJ[src] || []) {
      const o = shown().ordersByRegion[rid];
      if (o && o.faction !== activeQ.faction) {
        const p = posOf(rid);
        g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 46, class: 'ov-battle' }));
      }
    }
  }
  // Battle presentation (owner P2): every participating territory reads at a
  // glance — battlefield (pulsing ring exists below), the attacker's origin,
  // and each declared supporter tinted by the side it backs.
  if (shown().combat) {
    const c = shown().combat;
    const o = posOf(c.origin);
    g.appendChild(el('circle', { cx: o.x, cy: o.y, r: 50, class: 'ov-origin',
      style: `stroke:${fColor(c.attacker)}` }));
    for (const sp of c.supports) {
      const p = posOf(sp.region);
      g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 48, class: 'ov-support',
        style: `stroke:${fColor(sp.side === 'attacker' ? c.attacker : c.defender)}` }));
    }
  }
}

function overlayState(svg) {
  svg.querySelector('.game-overlay')?.remove();
  const g = el('g', { class: 'game-overlay' });
  overlayHighlights(g);

  for (const [rid, units] of Object.entries(shown().unitsByRegion)) {
    const { x, y } = posOf(rid);
    const isPort = region(rid).kind === 'port';
    const step = 15, x0 = x - ((units.length - 1) * step) / 2;
    // Port clusters hug the diamond so harbors read as occupied (owner P2).
    units.forEach((u, i) => g.appendChild(unitGlyph(u, x0 + i * step, y - (isPort ? 19 : 32))));
  }
  const staged = (ui.mode === 'planning' && ui.assignments) ? ui.assignments : null;
  const stagedFor = staged ? visibleQueries()[Math.min(ui.activeQuery ?? 0, Math.max(0, visibleQueries().length - 1))]?.faction : null;
  for (const [rid, o] of Object.entries(shown().ordersByRegion)) {
    if (staged && rid in staged) continue; // the live pick supersedes any committed badge
    drawOrderBadge(g, rid, o, o.revealed ? 'ov-order' : 'ov-order-back');
  }
  if (staged) {
    // Owner P2: see your picks land on the map as you assign them.
    for (const [rid, o] of Object.entries(staged)) {
      if (o) drawOrderBadge(g, rid, { ...o, faction: stagedFor, revealed: true }, 'ov-order ov-staged');
    }
  }
  // Defense badges live bottom-LEFT (owner overlap finding, Jul 2026): the
  // old top-right spot collided with the new castle marks and unit rows;
  // bottom-center belongs to the control marker. (x-30, y+33) threads every
  // lane: order badge above-left, icon row inboard, label below, marker center.
  for (const [rid, gar] of Object.entries(shown().garrisons)) {
    const { x, y } = posOf(rid);
    g.appendChild(el('circle', { cx: x - 30, cy: y + 33, r: 10, class: 'ov-garrison', style: `stroke:${fColor(gar.faction)}` }));
    const t = el('text', { x: x - 30, y: y + 37.5, class: 'ov-num' }); t.textContent = gar.strength; g.appendChild(t);
  }
  // Setup defense bonuses only: one badge per neutral force, styled like the
  // seat garrisons (same size, same numerals), gray ring for "no owner".
  for (const [rid, n] of Object.entries(shown().neutrals)) {
    const { x, y } = posOf(rid);
    g.appendChild(el('circle', { cx: x, cy: y - 32, r: 10, class: 'ov-neutral' }));
    const t = el('text', { x, y: y - 27.5, class: 'ov-num' });
    t.textContent = n.insurmountable ? '~' : n.strength;
    g.appendChild(t);
  }
  for (const [rid, fid] of Object.entries(shown().controlMarkers)) {
    const { x, y } = posOf(rid);
    g.appendChild(el('rect', { x: x - 6, y: y + 22, width: 12, height: 12, rx: 2, style: `fill:${fColor(fid)}`, class: 'ov-marker' }));
  }
  if (shown().combat) {
    const { x, y } = posOf(shown().combat.region);
    g.appendChild(el('circle', { cx: x, cy: y, r: 54, class: 'ov-battle' }));
  }
  svg.appendChild(g);
}

/**
 * One order badge. Committed face-down orders (planning secrecy, Rules p.12 —
 * owner P1, Jul 2026) render as a blank token back: presence is public on the
 * physical table, the face is not. Revealed orders get a labeled token with a
 * full-name tooltip; staged picks render dashed (not yet committed).
 */
/** M2.f.3 — themed order tokens (owner "graphics" item, banked from m2e).
    The token FRAME follows the theme (round for chart/parchment, square chip
    for 2026); the FACE is a glyph symbol, not an initial — "Consolidate
    Influence" no longer collides with anything in any language. Face-down
    tokens keep the blank-back secrecy contract (P1, Rules p.12). */
function drawOrderBadge(g, rid, o, cls) {
  const { x, y } = posOf(rid);
  const isPort = region(rid).kind === 'port';
  const bx = isPort ? x : x - 34, by = isPort ? y + 16 : y - 19;
  const back = cls.includes('ov-order-back');
  const square = (ICON_SETS[theme.visuals?.unitIcons]?.token || 'circle') === 'square';
  const frame = square
    ? el('rect', { x: bx - 10, y: by - 10, width: 20, height: 20, rx: 3, class: cls + ' tok', style: `stroke:${fColor(o.faction)}` })
    : el('circle', { cx: bx, cy: by, r: 11, class: cls + ' tok', style: `stroke:${fColor(o.faction)}` });
  const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  tip.textContent = back ? `${fName(o.faction)} — order placed (face-down)`
    : `${fName(o.faction)} — ${orderName(o.type)}${o.mod ? (o.mod > 0 ? ' +' + o.mod : ' ' + o.mod) : ''}${o.starred ? ' ★' : ''}`;
  frame.appendChild(tip);
  g.appendChild(frame);
  const face = el('use', { x: bx - 6.5, y: by - 6.5, width: 13, height: 13, class: back ? 'tok-back' : 'tok-face' });
  face.setAttribute('href', back ? '#i-ord-back' : `#i-ord-${o.type}`);
  g.appendChild(face);
  if (!back && (o.mod || o.starred)) {
    const t = el('text', { x: bx + 13, y: by + 3.5, class: 'ov-order-mod' });
    t.textContent = (o.mod ? (o.mod > 0 ? '+' + o.mod : String(o.mod)) : '') + (o.starred ? '★' : '');
    g.appendChild(t);
  }
}

/** Castle/citadel marks take the controller's color, brass when unowned
    (owner request, Jul 2026 — "like units"). Runs each render: control moves. */
function tintForts() {
  for (const rg of document.querySelectorAll('#map .region[data-id]')) {
    const u = rg.querySelector('use.ic-fort');
    if (!u) continue;
    const c = controllerOf(shown(), rg.dataset.id);
    u.style.color = c ? fColor(c) : 'var(--brass)';
  }
}

/** Inline panel icon: <use> against the map's injected defs. */
function pic(id, color = 'var(--brass)') {
  return `<svg class="pic" style="color:${color}"><use href="#${id}"/></svg>`;
}

/** Fly the camera to a region (owner P2: panel → map sync; now camera-based). */
function centerMap(rid) {
  const svg = $('#map');
  if (!svg) return;
  const { x, y } = posOf(rid);
  cameraCenterOn(svg, x, y);
}

// ---------- region taps feed the active form ----------
function handleRegionTap(rid) {
  if (ui.awaitTokenFor === undefined && ui.mode === 'planning' && ui.assignments && rid in ui.assignments) {
    ui.awaitTokenFor = rid; renderTurnPanel(); return;
  }
  if (ui.mode === 'march' && ui.awaitDest) {
    // Default: every remaining unassigned unit that CAN go there (adjust down).
    const kind = region(rid).kind;
    const naval = kind !== 'land';
    const assigned = {};
    for (const mv of ui.moves) for (const [t, n] of Object.entries(mv.units)) assigned[t] = (assigned[t] || 0) + n;
    const q = shown().pendingQueries[ui.activeQuery != null ? Math.min(ui.activeQuery, shown().pendingQueries.length - 1) : 0];
    const units = {};
    for (const u of (shown().unitsByRegion[ui.region] || [])) {
      if (u.faction !== q?.faction || u.routed) continue;
      if (naval !== (u.type === 'warship')) continue;
      units[u.type] = (units[u.type] || 0) + 1;
    }
    for (const [t, n] of Object.entries(units)) {
      units[t] = Math.max(0, n - (assigned[t] || 0));
      if (!units[t]) delete units[t];
    }
    ui.moves.push({ to: rid, units });
    ui.awaitDest = false; renderTurnPanel(); return;
  }
}

// ---------- turn panel ----------
function renderTurnPanel() {
  overlayState($('#map'));
  const panel = $('#turn-panel');
  if (!shown()) { panel.innerHTML = ''; return; }

  renderBatchCard($('#stage')); // cheap; overwritten below if a decision takes the stage
  if (shown().phase === 'gameOver') {
    const over = shown().log.find(e => e.event === 'gameOver');
    panel.innerHTML = `<div class="victory">👑 ${esc(fName(shown().winner))} rules the realm
      <span>(${seatsControlled(shown(), shown().winner)} seats · ${over?.reason === 'seats' ? 'instant victory' : 'won on standings, round ' + shown().round})</span></div>` +
      (over?.standings ? `<div class="hint">${over.standings.map((f, i) => `${i + 1}. ${fGlyph(f)} ${esc(fName(f))} (${over.seats?.[f] ?? 0})`).join(' · ')}</div>` : '');
    return;
  }

  const qsAll = shown().pendingQueries;
  const qs = visibleQueries();
  if (!qsAll.length) { panel.innerHTML = '<p class="hint">No pending decisions.</p>'; return; }
  if (mixed.human && !qs.length) {
    // Bots hold the table (M3.c). Their queries NEVER render as forms — the
    // sealed-bid slip, the card pick, the peek all stay off this screen.
    const thinking = [...new Set(qsAll.map(q => q.faction))];
    panel.innerHTML = `<div class="hint bot-wait">⏳ ${thinking.map(f =>
      `<span class="fchip" style="background:${fColor(f)}"></span> ${esc(fName(f))}`).join(' · ')} deciding…</div>`;
    return;
  }

  // Active query: explicit selection, else the first.
  const active = ui.activeQuery != null ? qs[Math.min(ui.activeQuery, qs.length - 1)] : qs[0];

  let html = '';
  if (qs.length > 1) {
    html += `<div class="query-tabs">` + qs.map((q, i) =>
      `<button class="tab ${q === active ? 'on' : ''}" data-q="${i}" style="border-color:${fColor(q.faction)}">
        ${fGlyph(q.faction)} ${esc(qLabel(q))}</button>`).join('') + `</div>`;
  }

  // Placement (M2.f.1): batch reveals hold the stage first; then a dramatic
  // decision takes it, unless the operator minimized it back to this panel.
  // The stage is never modal — the map stays live either way.
  const stageEl = $('#stage');
  const wantsStage = STAGE_TYPES.has(active.type);
  const stageBound = wantsStage && !stageState.minimized && !stageState.batch;

  if (stageBound) {
    html += `<div class="hint">⤢ ${fGlyph(active.faction)} ${esc(qLabel(active))} — deciding on stage.</div>`;
    panel.innerHTML = html;
    stageEl.innerHTML = `<div class="stage-card">
      <div class="stage-head"><span class="stage-title">${esc(qLabel(active))}</span>
        <button class="stage-min" data-stage-min>▾ to panel</button></div>
      <div class="stage-body">${formFor(active)}</div></div>`;
    stageEl.querySelector('[data-stage-min]').addEventListener('click', () => {
      stageState.minimized = true; renderTurnPanel();
    });
    bindForm(stageEl.querySelector('.stage-body'), active);
  } else {
    if (wantsStage && stageState.minimized && !stageState.batch) {
      html += `<button class="stage-reopen" data-stage-open>⤢ Return to stage</button>`;
    }
    html += formFor(active);
    panel.innerHTML = html;
    panel.querySelector('[data-stage-open]')?.addEventListener('click', () => {
      stageState.minimized = false; renderTurnPanel();
    });
    renderBatchCard(stageEl);
    bindForm(panel, active);
  }

  panel.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    ui = { activeQuery: +b.dataset.q }; renderTurnPanel();
  }));
}

// ---------- M2.f.1 — presentation queue ----------
// Scan newly logged events once per dispatch; an Event Phase's reveals become
// one 3-card stage batch (the physical table's "flip all three" moment).
// Engine state has ALREADY advanced — this is presentation only, invisible to
// replay and to headless agents.
const BATCH_SKIP = new Set(['eventCardRevealed', 'eventPhaseBegan', 'planningBegan']);
function scanForStage() {
  if (!shown()) return;
  const fresh = shown().log.slice(stageState.seen);
  stageState.seen = shown().log.length;
  if (stageState.quiet) return;
  const beganAt = fresh.findIndex(e => e.event === 'eventPhaseBegan');
  if (beganAt === -1) return;
  const slice = fresh.slice(beganAt);
  const reveals = slice.filter(e => e.event === 'eventCardRevealed')
    .map(e => ({ deck: e.deck, card: e.card }));
  if (!reveals.length) return;
  const icons = new Set(slice.filter(e => e.event === 'threatAdvanced').map(e => e.card));
  const lines = slice.filter(e => !BATCH_SKIP.has(e.event)).map(logLine).filter(Boolean).slice(0, 12);
  stageState.batch = { round: slice[0].round, reveals, icons: [...icons], lines };
}

function renderBatchCard(stageEl) {
  if (!stageState.batch) { stageEl.innerHTML = ''; return; }
  const b = stageState.batch;
  stageEl.innerHTML = `<div class="stage-card">
    <div class="stage-head"><span class="stage-title">Round ${b.round} — the decks speak</span></div>
    <div class="reveal-row">${b.reveals.map(r => `
      <div class="reveal-card">
        <div class="reveal-deck">Deck ${esc(r.deck)}</div>
        <div class="reveal-name">${esc(eventCardName(r.card))}</div>
        <div class="reveal-icon">${b.icons.includes(r.card) ? '⚠ ' + esc(theme.terms.threat || 'threat') : ''}</div>
      </div>`).join('')}</div>
    <div class="stage-lines">${b.lines.map(l => `<div>${l}</div>`).join('')}</div>
    <button class="stage-ok" data-stage-ok>Continue</button></div>`;
  stageEl.querySelector('[data-stage-ok]').addEventListener('click', () => {
    stageState.batch = null; renderTurnPanel();
  });
}

// ---------- M2.f.1 — seat inspector ----------
// Mid-decision reference: any seat's hand, discard, and vitals, without
// leaving the stage. Table mode renders full state by design (contract §4);
// mixed human/bot games (M3.c) will scope this to viewFor.
function renderInspector() {
  const el = $('#inspector-body');
  if (!el || !shown()) return;
  const f = inspectorFid;
  const hand = shown().leaderHands[f] || [];
  const discard = shown().leaderDiscards[f] || [];
  el.innerHTML = `
    <div class="insp-chips">${shown().factions.map(x =>
      `<button class="insp-chip ${x === f ? 'on' : ''}" data-insp="${x}" style="border-left:3px solid ${fColor(x)}">${fGlyph(x)}</button>`).join('')}</div>
    <div class="insp-stats">${fGlyph(f)} <b>${esc(fName(f))}</b> ·
      ${pic('i-fort-castle')}${seatsControlled(shown(), f)} seats · ${pic('i-supply', 'var(--bone-dim)')}${shown().supply[f]} supply ·
      ${pic('i-coin')}${shown().authority[f]} ${esc(theme.terms.authority)} ·
      ${esc(theme.terms.threat || 'threat')} ${shown().threat}/12</div>
    <div class="insp-cards">${hand.map(id => cardChip(id, { withText: false })).join('') || '<span class="dim">no cards in hand</span>'}</div>
    ${discard.length ? `<div class="insp-stats" style="margin-top:6px">spent: ${discard.map(id => esc(theme.cards?.[id] ?? id)).join(', ')}</div>` : ''}`;
  el.querySelectorAll('[data-insp]').forEach(b => b.addEventListener('click', () => {
    inspectorFid = b.dataset.insp; renderInspector();
  }));
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
      threatPeekPlacement: 'deck peek', muster: 'muster',
      bid: 'sealed bid', bidTieBreak: 'break the tie',
      invaderBid: 'incursion bid', invaderTieBreak: 'name the ' + (q.side === 'highest' ? 'victor' : 'fallen'),
      incursionUnits: { destroy: 'losses', downgrade: 'losses', upgrade: 'promotions' }[q.purpose] || 'units',
      incursionTrack: 'track choice', incursionCard: q.purpose === 'retrieve' ? 'retrieve a card' : 'discard a card',
      incursionOption: 'choose your fate', incursionMusterSite: 'muster site' }[q.type]);
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
    const units = (shown().unitsByRegion[rid] || []).filter(u => u.faction === q.faction);
    const types = [...new Set(units.map(u => u.type))];
    return `<div class="stepper-row"><b>${esc(rName(rid))}</b> (${units.length} units): ` +
      types.map(t => `<button class="opt" data-region="${rid}" data-unit="${t}">destroy ${esc(unitName(t) || t)}</button>`).join(' ') +
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

function trackName(t) {
  return theme.terms['track' + t[0].toUpperCase() + t.slice(1)] ?? t;
}
function bidForm(q) {
  const amt = Math.min(ui.bidAmount ?? 0, q.max);
  return header(q, `seal your bid — ${esc(trackName(q.track))}`) +
    `<div class="stepper-row big-stepper">
      <button class="opt" data-bid-step="-1" ${amt <= 0 ? 'disabled' : ''}>−</button>
      <b class="bid-amt">${amt}</b>
      <button class="opt" data-bid-step="1" ${amt >= q.max ? 'disabled' : ''}>+</button>
      <span class="dim">of ${q.max} ${esc(theme.terms.authority)}</span>
    </div>
    <button class="primary" data-bid-commit>Seal ${amt} — hidden until all reveal</button>
    <div class="hint">Every revealed bid is paid to the pool, win or lose (Rules p.15). Highest bid takes the top seat; the ${esc(theme.terms.tokenSovereign)} holder breaks ties.</div>`;
}
function bidTieBreakForm(q) {
  const placed = ui.tieOrder || [];
  const remaining = q.tied.filter(f => !placed.includes(f));
  return header(q, `order the tie at ${q.amount} — ${esc(trackName(q.track))}`) +
    (placed.length ? `<div class="hint">Placed so far: ${placed.map(f => fGlyph(f)).join(' → ')}</div>` : '') +
    `<div class="btn-col">` +
    remaining.map(f => `<button data-tie-pick="${f}">${fGlyph(f)} ${esc(fName(f))} ${placed.length === 0 ? '(highest)' : ''}</button>`).join('') +
    `</div>` +
    (placed.length ? `<button class="opt" data-tie-reset>start over</button>` : '') +
    `<div class="hint">You hold the ${esc(theme.terms.tokenSovereign)}: tap the tied ${esc(theme.terms.factions.toLowerCase())} from best seat to worst — yourself included (Rules p.15).</div>`;
}

const MUSTER_COSTS_UI = { infantry: 1, warship: 1, cavalry: 2, siege_engine: 2, upgrade: 1 };
function musterForm(q) {
  const staged = ui.musterBuilds || [];
  const spent = staged.reduce((a, b) => a + MUSTER_COSTS_UI[b.type], 0);
  const left = q.points - spent;
  const port = PORTS.find(pp => pp.landId === q.region);
  // Offer only destinations the engine will accept: seas holding another
  // faction's ships are closed to mustering (Rules p.25 — owner P1, Jul 2026).
  const seas = [...(ADJ[q.region] || [])].filter(x => region(x).kind === 'maritime'
    && !(shown().unitsByRegion[x] || []).some(u => u.faction !== q.faction));
  const harborOpen = port && !(shown().unitsByRegion[port.id] || []).some(u => u.faction !== q.faction);
  const hasInf = (shown().unitsByRegion[q.region] || [])
    .filter(u => u.faction === q.faction && u.type === 'infantry' && !u.routed).length
    > staged.filter(b => b.type === 'upgrade').length;
  const btn = (label, cost, data, on = true) =>
    `<button class="opt" data-mbuild='${data}' ${cost > left || !on ? 'disabled' : ''}>${label} <span class="dim">(${cost})</span></button>`;
  const stagedRows = staged.map((b, i) =>
    `<div class="stepper-row">${b.type === 'upgrade' ? `upgrade → ${esc(unitName(b.to || 'cavalry'))}` : esc(unitName(b.type) || b.type)}${b.type !== 'upgrade' && b.to ? ' → ' + esc(rName(b.to)) : ''} <button class="opt" data-munstage="${i}">✕</button></div>`).join('');
  return header(q, `${q.source === 'rally' ? 'rally ' : ''}muster at ${esc(rName(q.region))} — ${left}/${q.points} points`) +
    battleless() +
    btn(`${esc(unitName('infantry'))}`, 1, JSON.stringify({ type: 'infantry', to: q.region })) +
    btn(`${esc(unitName('cavalry'))}`, 2, JSON.stringify({ type: 'cavalry', to: q.region })) +
    btn(`${esc(unitName('siege_engine'))}`, 2, JSON.stringify({ type: 'siege_engine', to: q.region })) +
    btn(`upgrade ${esc(unitName('infantry'))} → ${esc(unitName('cavalry'))}`, 1, JSON.stringify({ type: 'upgrade', to: 'cavalry' }), hasInf) +
    btn(`upgrade ${esc(unitName('infantry'))} → ${esc(unitName('siege_engine'))}`, 1, JSON.stringify({ type: 'upgrade', to: 'siege_engine' }), hasInf) +
    (port && harborOpen ? btn(`${esc(unitName('warship'))} → harbor`, 1, JSON.stringify({ type: 'warship', to: port.id })) : '') +
    seas.map(sid => btn(`${esc(unitName('warship'))} → ${esc(rName(sid))}`, 1, JSON.stringify({ type: 'warship', to: sid }))).join('') +
    (stagedRows ? `<div class="hint">Staged:</div>` + stagedRows : '') +
    `<button class="opt commit" data-mcommit>1 ${staged.length ? 'muster ' + staged.length + ' build(s)' : 'muster nothing (pass)'}</button>`
      .replace('>1 ', '>') +
    `<div class="hint">Costs: ${esc(unitName('infantry'))}/${esc(unitName('warship'))} 1 · ${esc(unitName('cavalry'))}/${esc(unitName('siege_engine'))} 2 · upgrade 1. Supply and pools are enforced on commit.</div>`;
}
function battleless() { return ''; }

// ---------- incursion (M2.d) ----------
function incursionBanner() {
  const inc = shown().eventPhase?.incursion;
  if (!inc) return '';
  const sealed = inc.phase === 'sealed';
  const bidders = shown().factions.filter(f => !inc.excluded.includes(f));
  const cell = f => sealed
    ? `<span class="card-chip ghost">${fGlyph(f)} ${inc.bids[f] !== undefined ? '✊' : '…'}</span>`
    : `<span class="card-chip">${fGlyph(f)} <b>${inc.bids[f] ?? 0}</b></span>`;
  let html = `<div class="battle">
    <div class="battle-side">${esc(theme.terms.invaders)}<b>${inc.strength}</b></div>
    <div class="battle-vs">${esc(theme.terms.incursion)}</div>
    <div class="battle-side">${sealed ? 'sealed bids' : `bids <b>${inc.total ?? 0}</b>`}</div>
  </div>
  <div class="battle-cards"><div>${bidders.map(cell).join(' ')}</div></div>`;
  if (inc.excluded.length) {
    html += `<div class="hint">${inc.excluded.map(f => fGlyph(f) + ' ' + esc(fName(f))).join(', ')} stand${inc.excluded.length === 1 ? 's' : ''} apart from this attack.</div>`;
  }
  if (inc.card) {
    const def = INVADER_CARDS[inc.card];
    const held = inc.outcome === 'defenders';
    html += `<div class="card-text"><b>${esc(eventCardName(inc.card))}</b> — the wall ${held ? 'holds' : 'is breached'}.
      <div class="hint">${esc(invaderText(held ? def.winText : def.lossText))}</div></div>`;
  }
  return html;
}

function invaderBidForm(q) {
  const amt = Math.min(ui.bidAmount ?? 0, q.max);
  return incursionBanner() + header(q, `seal your bid — strength ${q.strength}`) +
    `<div class="stepper-row big-stepper">
      <button class="opt" data-bid-step="-1" ${amt <= 0 ? 'disabled' : ''}>−</button>
      <b class="bid-amt">${amt}</b>
      <button class="opt" data-bid-step="1" ${amt >= q.max ? 'disabled' : ''}>+</button>
      <span class="dim">of ${q.max} ${esc(theme.terms.authority)}</span>
    </div>
    <button class="primary" data-invbid-commit>Seal ${amt} — hidden until all reveal</button>
    <div class="hint">If the combined bids reach ${q.strength}, the realm holds and the highest bidder is rewarded; if not, the lowest bidder suffers worst. Every bid is paid, win or lose (Rules p.22–23).</div>`;
}

function invaderTieBreakForm(q) {
  const label = q.side === 'highest' ? 'takes the reward' : 'suffers the worst';
  return incursionBanner() + header(q, `tie at ${q.amount} — name who ${label}`) +
    `<div class="btn-col">` +
    q.tied.map(f => `<button data-invtie="${f}">${fGlyph(f)} ${esc(fName(f))}</button>`).join('') +
    `</div>
    <div class="hint">You hold the ${esc(theme.terms.tokenSovereign)}: choose ONE of the tied ${esc(theme.terms.factions.toLowerCase())} — yourself included (Rules p.23).</div>`;
}

function incUnitLabel(purpose) {
  return { destroy: 'destroy', downgrade: 'degrade', upgrade: 'promote' }[purpose];
}
function incursionUnitsForm(q) {
  const picks = ui.incUnits || [];
  const lockRegion = q.constraint === 'singleRegion' && picks.length ? picks[0].region : null;
  const rows = [];
  for (const [rid, units] of Object.entries(shown().unitsByRegion)) {
    if (q.regions && !q.regions.includes(rid)) continue;
    const mine = units.filter(u => u.faction === q.faction && (!q.unitType || u.type === q.unitType));
    if (!mine.length) continue;
    const types = {};
    for (const u of mine) types[u.type] = (types[u.type] || 0) + 1;
    const chosenHere = t => picks.filter(p => p.region === rid && p.type === t).length;
    rows.push(`<div class="stepper-row"><b>${esc(rName(rid))}</b>: ` +
      Object.entries(types).map(([t, n]) => {
        const c = chosenHere(t);
        const disabled = picks.length >= q.count || c >= n || (lockRegion && lockRegion !== rid);
        return `<button class="opt" data-incpick='${JSON.stringify({ region: rid, type: t })}' ${disabled ? 'disabled' : ''}>` +
          `${incUnitLabel(q.purpose)} ${esc(unitName(t) || t)}${c ? ` <b>×${c}</b>` : ''} <span class="dim">(${n})</span></button>`;
      }).join(' ') + `</div>`);
  }
  const ready = q.optional ? true : picks.length === q.count;
  return incursionBanner() + header(q, `${incUnitLabel(q.purpose)} ${q.optional ? 'up to ' : ''}${q.count} unit(s)`) +
    rows.join('') +
    (picks.length ? `<div class="hint">Chosen: ${picks.map(p => `${esc(unitName(p.type))} @ ${esc(rName(p.region))}`).join(', ')} <button class="opt" data-increset>start over</button></div>` : '') +
    `<button class="primary" data-inccommit ${ready ? '' : 'disabled'}>${q.optional && !picks.length ? 'Promote none (pass)' : 'Confirm ' + picks.length}</button>` +
    (q.constraint === 'singleRegion' ? `<div class="hint">All losses must come from ONE fortified area (card text).</div>` : '');
}

function incursionTrackForm(q) {
  const verb = { toBottom: 'fall to the bottom of', toTop: 'rise to the top of', shiftDown: `fall ${q.amount} places on` }[q.mode];
  return incursionBanner() + header(q, `${verb} which track?`) +
    `<div class="btn-col">` +
    q.options.map(t => `<button data-inctrack="${t}">${esc(trackName(t))}</button>`).join('') +
    `</div>` +
    (q.mode === 'toTop' ? `<div class="hint">You take the chosen track's token with the seat.</div>` : '');
}

function incursionCardForm(q) {
  const verb = q.purpose === 'retrieve' ? 'Retrieve from your discard' : 'Discard from your hand';
  return incursionBanner() + header(q, verb.toLowerCase()) +
    `<div class="btn-col">` +
    q.options.map(id => `<button data-inccard="${id}">${cardChip(id, { withText: false })}</button>`).join('') +
    `</div>`;
}

const INC_OPTION_LABELS = {
  destroyUnits: o => `destroy ${o.count} of your units${o.where === 'anywhere' ? ' (anywhere)' : ''}`,
  trackShift: o => `fall ${Math.abs(o.amount)} places on your highest track`,
};
function incursionOptionForm(q) {
  return incursionBanner() + header(q, 'choose your fate') +
    `<div class="btn-col">` +
    q.options.map((o, i) => `<button data-incopt="${i}">${esc((INC_OPTION_LABELS[o.type] || (() => o.type))(o))}</button>`).join('') +
    `</div>`;
}

function incursionMusterSiteForm(q) {
  return incursionBanner() + header(q, 'muster at which stronghold?') +
    `<div class="btn-col">` +
    q.options.map(site => `<button data-incsite="${site.region}">${esc(rName(site.region))} <span class="dim">(${site.points} pts)</span></button>`).join('') +
    `</div>`;
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
  if (q.type === 'chooseLeaderCard') return leaderCardForm(q);
  if (q.type === 'chooseCasualties') return casualtyForm(q);
  if (q.type === 'useCardAbility') return abilityForm(q);
  if (q.type === 'cardTarget') return targetForm(q);
  if (q.type === 'eventChoice') return eventChoiceForm(q);
  if (q.type === 'reconcileSupply') return reconcileForm(q);
  if (q.type === 'muster') return musterForm(q);
  if (q.type === 'bid') return bidForm(q);
  if (q.type === 'bidTieBreak') return bidTieBreakForm(q);
  if (q.type === 'threatPeekPlacement') return peekForm(q);
  if (q.type === 'invaderBid') return invaderBidForm(q);
  if (q.type === 'invaderTieBreak') return invaderTieBreakForm(q);
  if (q.type === 'incursionUnits') return incursionUnitsForm(q);
  if (q.type === 'incursionTrack') return incursionTrackForm(q);
  if (q.type === 'incursionCard') return incursionCardForm(q);
  if (q.type === 'incursionOption') return incursionOptionForm(q);
  if (q.type === 'incursionMusterSite') return incursionMusterSiteForm(q);
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
  if (t === 'embattled') return `The embattled area — ${rName(shown().combat.region)}`;
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
    for (const rid of orderableRegions(shown(), q.faction)) ui.assignments[rid] = null;
  }
  const limit = starLimit(shown(), q.faction);
  // The row being re-picked returns its token to the pool (mirrors the
  // click handler exactly — index parity is what makes picks WYSIWYG).
  const poolBasis = Object.entries(ui.assignments)
    .filter(([r, o]) => o && r !== ui.awaitTokenFor).map(([, o]) => o);
  const used = Object.values(ui.assignments).filter(Boolean);
  const stars = poolBasis.filter(o => o.starred).length;
  const remaining = remainingTokens(poolBasis);

  let html = header(q, 'assign orders');
  html += `<div class="star-budget">★ ${used.filter(o => o.starred).length}/${limit}</div>
    <div class="sec-label">Territories</div><div class="order-rows">`;
  for (const [rid, o] of Object.entries(ui.assignments)) {
    html += `<button class="order-row ${ui.awaitTokenFor === rid ? 'picking' : ''}" data-row="${rid}">
      <span>${esc(rName(rid))}</span><span class="tok">${o ? esc(tokenLabel(o)) : '—'}</span></button>`;
  }
  html += `</div>`;
  if (ui.awaitTokenFor) {
    const banned = shown().roundFlags.bannedOrders || [];
    html += `<div class="sec-label sec-orders">Orders — assign to ${esc(rName(ui.awaitTokenFor))}</div><div class="token-grid">` + remaining.map((t, i) => {
      const ban = banned.length && orderClasses(t).find(c => banned.includes(c));
      return `<button class="token" data-tok="${i}" ${ban || (t.starred && stars >= limit) ? 'disabled' : ''}
        ${ban ? `title="forbidden this round (event card)"` : ''}>
        ${esc(tokenLabel(t))}${ban ? ' ⃠' : ''}</button>`;
    }).join('') + `</div>`;
    if (banned.length) html += `<div class="hint">Event decree: ${banned.map(esc).join(', ')} orders are forbidden this round.</div>`;
  }
  // Shortage-aware gating (Rules p.12 Not Enough Order Tokens): when decree
  // bans + the star limit leave fewer legal tokens than occupied areas, the
  // commit target drops to the placeable maximum — the operator chooses which
  // areas go without, exactly as the validator now demands.
  const requiredN = maxPlaceableOrders(shown(), q.faction);
  const placedN = Object.values(ui.assignments).filter(Boolean).length;
  const complete = placedN === requiredN;
  if (requiredN < Object.keys(ui.assignments).length) {
    html += `<div class="hint">Token shortage: only ${requiredN} of ${Object.keys(ui.assignments).length} areas can receive orders this round — you choose which go without.</div>`;
  }
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
    const mine = Object.entries(shown().ordersByRegion).filter(([, o]) => o.faction === q.faction);
    if (!ui.swapRegion) {
      html += `<p class="hint">Replace which order?</p><div class="btn-col">` + mine.map(([rid, o]) =>
        `<button data-swapr="${rid}">${esc(rName(rid))} · ${esc(tokenLabel(o))}</button>`).join('') + `</div>`;
    } else {
      const used = mine.filter(([rid]) => rid !== ui.swapRegion).map(([, o]) => o);
      html += `<p class="hint">New order for ${esc(rName(ui.swapRegion))}:</p><div class="token-grid">` +
        remainingTokens(used).map((t, i) => {
          const banned = shown().roundFlags.bannedOrders || [];
          const ban = banned.length && orderClasses(t).find(c => banned.includes(c));
          return `<button class="token" data-swapt="${i}" ${ban ? 'disabled title="forbidden this round (event card)"' : ''}>${esc(tokenLabel(t))}${ban ? ' ⃠' : ''}</button>`;
        }).join('') + `</div>`;
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
    const o = shown().ordersByRegion[rid];
    return o && o.faction !== q.faction;
  }).sort();
  html += `<p class="hint">Raiding from <b>${esc(rName(ui.region))}</b></p><div class="btn-col">` +
    targets.map(rid => `<button data-target="${rid}">${esc(rName(rid))} · ${esc(tokenLabel(shown().ordersByRegion[rid]))}
      <span class="fchip" style="background:${fColor(shown().ordersByRegion[rid].faction)}"></span></button>`).join('') +
    `<button data-target="" class="ghost">Spend with no target</button></div>`;
  return html;
}

// --- march ---
function marchForm(q) {
  if (ui.mode !== 'march') ui = { activeQuery: ui.activeQuery, mode: 'march', region: q.regions.length === 1 ? q.regions[0] : null, moves: [], leaveControl: false, awaitDest: q.regions.length === 1 };
  let html = header(q, 'resolve a March');
  if (!ui.region) {
    html += `<div class="btn-col">` + q.regions.map(r => `<button data-pick="${r}">${esc(rName(r))}</button>`).join('') + `</div>`;
    return html;
  }
  const avail = {};
  if (q.regions.length > 1) html += `<button data-repick>↩ choose a different march</button>`;
  for (const u of shown().unitsByRegion[ui.region] || []) {
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
  const o = shown().ordersByRegion[ui.region];
  const r = region(ui.region);
  const pts = r.kind === 'land' ? regionProps(shown(), ui.region).muster : 0;
  const canMuster = o?.starred && pts > 0;
  const why = !o?.starred ? 'requires the ★ order'
    : pts <= 0 ? `no ${theme.terms.fort.toLowerCase()} here (Rules p.22)` : '';
  html += `<p class="hint">${esc(rName(ui.region))}</p><div class="btn-col">
    <button class="primary" data-rally>Collect ${esc(theme.terms.authority)}</button>
    ${o?.starred ? `<button data-rally-muster ${canMuster ? '' : 'disabled'} title="${esc(why)}">Muster units (${pts} pts)</button>` : ''}</div>`;
  return html;
}

// --- combat forms ---
function battleBanner() {
  const c = shown().combat;
  const s = combatStrengths(shown());
  return `<div class="battle">
    <div class="battle-side" style="border-color:${fColor(c.attacker)}">${fGlyph(c.attacker)} ${esc(fName(c.attacker))}<b>${s.attacker}</b></div>
    <div class="battle-vs">⚔ ${esc(rName(c.region))}</div>
    <div class="battle-side" style="border-color:${fColor(c.defender)}">${fGlyph(c.defender)} ${esc(fName(c.defender))}<b>${s.defender}</b></div>
  </div>` + battleCards(c) +
    `<div class="hint">⚔ Battle for <b>${esc(rName(c.region))}</b> — ${fGlyph(c.attacker)} marching from ${esc(rName(c.origin))}.` +
    (c.supports.length ? `<br>Backing: ${c.supports.map(sp =>
      `${esc(rName(sp.region))} (${fGlyph(sp.faction)} → ${sp.side === 'attacker' ? fGlyph(c.attacker) : fGlyph(c.defender)})`).join(' · ')}` : '') +
    `</div>`;
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
  const c = shown().combat;
  const who = f => q.faction === f ? 'yourself' : fName(f);
  return battleBanner() + header(q, `support from ${rName(q.region)}`) + `<div class="btn-col">
    <button data-support="attacker">Back the attacker — ${fGlyph(c.attacker)} ${esc(who(c.attacker))}</button>
    <button data-support="defender">Back the defender — ${fGlyph(c.defender)} ${esc(who(c.defender))}</button>
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
  if (q.type === 'bid') {
    panel.querySelectorAll('[data-bid-step]').forEach(b => b.addEventListener('click', () => {
      ui.bidAmount = Math.max(0, Math.min(q.max, (ui.bidAmount ?? 0) + Number(b.dataset.bidStep)));
      renderTurnPanel();
    }));
    panel.querySelector('[data-bid-commit]')?.addEventListener('click', () => {
      const amount = Math.min(ui.bidAmount ?? 0, q.max);
      ui.bidAmount = 0;
      dispatch({ type: 'bid', faction: q.faction, track: q.track, amount });
    });
    return;
  }
  if (q.type === 'bidTieBreak') {
    panel.querySelectorAll('[data-tie-pick]').forEach(b => b.addEventListener('click', () => {
      const placed = (ui.tieOrder = ui.tieOrder || []);
      placed.push(b.dataset.tiePick);
      if (placed.length === q.tied.length) {
        const order = placed.slice();
        ui.tieOrder = null;
        dispatch({ type: 'bidTieBreak', faction: q.faction, track: q.track, order });
      } else renderTurnPanel();
    }));
    panel.querySelector('[data-tie-reset]')?.addEventListener('click', () => { ui.tieOrder = null; renderTurnPanel(); });
    return;
  }
  if (q.type === 'invaderBid') {
    panel.querySelectorAll('[data-bid-step]').forEach(b => b.addEventListener('click', () => {
      ui.bidAmount = Math.max(0, Math.min(q.max, (ui.bidAmount ?? 0) + Number(b.dataset.bidStep)));
      renderTurnPanel();
    }));
    panel.querySelector('[data-invbid-commit]')?.addEventListener('click', () => {
      const amount = Math.min(ui.bidAmount ?? 0, q.max);
      ui.bidAmount = 0;
      dispatch({ type: 'invaderBid', faction: q.faction, amount });
    });
    return;
  }
  if (q.type === 'invaderTieBreak') {
    panel.querySelectorAll('[data-invtie]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'invaderTieBreak', faction: q.faction, chosen: b.dataset.invtie })));
    return;
  }
  if (q.type === 'incursionUnits') {
    panel.querySelectorAll('[data-incpick]').forEach(b => b.addEventListener('click', () => {
      (ui.incUnits = ui.incUnits || []).push(JSON.parse(b.dataset.incpick));
      renderTurnPanel();
    }));
    panel.querySelector('[data-increset]')?.addEventListener('click', () => { ui.incUnits = null; renderTurnPanel(); });
    panel.querySelector('[data-inccommit]')?.addEventListener('click', () => {
      const units = ui.incUnits || [];
      ui.incUnits = null;
      dispatch({ type: 'incursionUnits', faction: q.faction, units });
    });
    return;
  }
  if (q.type === 'incursionTrack') {
    panel.querySelectorAll('[data-inctrack]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'incursionTrack', faction: q.faction, track: b.dataset.inctrack })));
    return;
  }
  if (q.type === 'incursionCard') {
    panel.querySelectorAll('[data-inccard]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'incursionCard', faction: q.faction, card: b.dataset.inccard })));
    return;
  }
  if (q.type === 'incursionOption') {
    panel.querySelectorAll('[data-incopt]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'incursionOption', faction: q.faction, option: +b.dataset.incopt })));
    return;
  }
  if (q.type === 'incursionMusterSite') {
    panel.querySelectorAll('[data-incsite]').forEach(b => b.addEventListener('click', () =>
      dispatch({ type: 'incursionMusterSite', faction: q.faction, region: b.dataset.incsite })));
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
    dispatch({ type: 'submitOrders', faction: q.faction,
      orders: Object.fromEntries(Object.entries(ui.assignments).filter(([, o]) => o)) }));

  panel.querySelectorAll('[data-row]').forEach(b => b.addEventListener('click', () => {
    centerMap(b.dataset.row);
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
    const mine = Object.entries(shown().ordersByRegion).filter(([, o]) => o.faction === q.faction);
    const used = mine.filter(([rid]) => rid !== ui.swapRegion).map(([, o]) => o);
    const t = remainingTokens(used)[+b.dataset.swapt];
    dispatch({ type: 'courierDecision', faction: q.faction, decision: 'swapOrder',
      swap: { region: ui.swapRegion, newOrder: { type: t.type, mod: t.mod, starred: t.starred } } });
  }));
  panel.querySelector('[data-swapback]')?.addEventListener('click', () => { ui.mode = null; ui.swapRegion = null; renderTurnPanel(); });

  panel.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    ui.region = b.dataset.pick;
    if (ui.mode === 'march') ui.awaitDest = true; // straight into destination picking
    renderTurnPanel();
  }));
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
  panel.querySelector('[data-rally-muster]')?.addEventListener('click', () =>
    dispatch({ type: 'resolveRally', faction: q.faction, region: ui.region, muster: true }));

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
  const availTotal = (shown().unitsByRegion[ui.region] || []).filter(u => u.faction === q.faction && u.type === t && !u.routed).length;
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
      ? `${F(e.faction)} disbanded a ${esc(unitName(e.unit) || e.unit)} at ${esc(rName(e.region))} to meet supply.`
      : `${F(e.faction)} lost units to supply at ${esc(rName(e.region))}.`;
    case 'authorityCollected': return `${F(e.faction)} collected ${e.amount} ${esc(theme.terms.authority)}.`;
    case 'courierPeeked': return `${F(e.faction)} peeked at the threat deck.`;
    case 'threatPeekPlaced': return `${F(e.faction)} ${e.placement === 'bottom' ? 'buried the card' : 'left the card on top'}.`;
    case 'musteringBegan': return `The banners are called: ${e.sites} strongholds may recruit.`;
    case 'mustered': return e.builds.length
      ? `${F(e.faction)} recruited at ${esc(rName(e.region))} (${e.spent} pts).`
      : `${F(e.faction)} held recruitment at ${esc(rName(e.region))}.`;
    case 'rallyMusterOpened': return `${F(e.faction)}'s ★ rally raises banners at ${esc(rName(e.region))}.`;
    case 'biddingOpened': return `Sealed bids open for the ${esc(trackName(e.track))} track.`;
    case 'bidsRevealed': return `Bids revealed — ${shown().factions.map(f => `${fGlyph(f)} ${e.bids[f] ?? 0}`).join(' · ')}.`;
    case 'tieBroken': return `${F(e.by)} orders the tie: ${e.order.map(f => fGlyph(f)).join(' → ')}.`;
    case 'trackRebuilt': return `The ${esc(trackName(e.track))} track stands anew: ${e.order.map(f => fGlyph(f)).join(' → ')}${e.passed ? ` — the ${esc(theme.terms['token' + e.token[0].toUpperCase() + e.token.slice(1)] ?? e.token)} passes to ${F(e.holder)}` : ''}.`;
    case 'biddingClosed': return `<em>The auction closes; the new order of powers holds.</em>`;
    case 'incursionBegan': return `<b>⚠ ${esc(theme.terms.incursion)}!</b> ${e.trigger === 'threatMax' ? 'The threat breaks at its peak' : e.trigger === 'reattack' ? `${esc(theme.terms.invaders)} come again` : `${esc(theme.terms.invaders)} attack`} — strength ${e.strength}.${e.excluded ? ` ${e.excluded.map(f => F(f)).join(', ')} stand apart.` : ''}`;
    case 'incursionBidsRevealed': return `Bids revealed — ${Object.keys(e.bids).map(f => `${fGlyph(f)} ${e.bids[f]}`).join(' · ')} — ${e.total} against strength ${e.strength}.`;
    case 'incursionOutcome': return e.outcome === 'defenders'
      ? `<b>The realm holds</b> (${e.total} ≥ ${e.strength}).`
      : `<b>The defenses are breached</b> (${e.total} < ${e.strength}).`;
    case 'incursionTieBroken': return `${F(e.by)} names ${F(e.chosen)} as the ${e.side === 'highest' ? 'highest' : 'lowest'} bidder.`;
    case 'incursionCardRevealed': return `The ${esc(theme.terms.invaders)} reveal: <b>${esc(eventCardName(e.card))}</b>.`;
    case 'incursionNothing': return `${F(e.faction)} ${{
      noUnits: 'has no units to lose', emptyDiscard: 'has no spent leaders to reclaim',
      singleCard: 'holds too few cards to pay', noCavalry: `has no ${esc(theme.terms.unitCavalry.toLowerCase())} to lose`,
      noUpgrade: 'can promote no one', noFortified: 'holds no stronghold to muster at',
      noAuthority: `has no ${esc(theme.terms.authority.toLowerCase())} left to lose`,
      reattackExempt: 'stands apart as the invaders regroup' }[e.reason] || 'is spared'}.`;
    case 'incursionTrackMoved': return `${F(e.faction)} ${e.to === 'top' ? 'rises to the top of' : e.to === 'bottom' ? 'falls to the bottom of' : `falls ${e.to.replace('down', '')} places on`} the ${esc(trackName(e.track))} track.`;
    case 'tokenPassed': return `The ${esc(theme.terms['token' + e.token[0].toUpperCase() + e.token.slice(1)] ?? e.token)} passes to ${F(e.holder)}.`;
    case 'incursionUnitsDestroyed': return `${F(e.faction)} loses ${esc(e.units.map(u => `${unitName(u.type)} @ ${rName(u.region)}`).join(', '))} to the ${esc(theme.terms.invaders.toLowerCase())}.`;
    case 'incursionUnitsDowngraded': return `${F(e.faction)}'s ${esc(theme.terms.unitCavalry.toLowerCase())} ${e.changes.every(c => c.destroyed) ? 'are cut down' : e.changes.some(c => c.destroyed) ? 'are unhorsed — some cut down where no footman could stand' : 'are unhorsed, fighting on as ' + esc(theme.terms.unitInfantry.toLowerCase())}.`;
    case 'incursionUnitsUpgraded': return `${F(e.faction)} promotes ${e.regions.length} ${esc(theme.terms.unitInfantry.toLowerCase())} to ${esc(theme.terms.unitCavalry.toLowerCase())} in victory.`;
    case 'incursionCardsDiscarded': return `${F(e.faction)} discards ${e.cards.map(c => esc(theme.cards?.[c] ?? c)).join(', ')} to the ${esc(theme.terms.invaders.toLowerCase())}.`;
    case 'incursionCardRetrieved': return `${F(e.faction)} reclaims ${esc(theme.cards?.[e.card] ?? e.card)} from the discard.`;
    case 'incursionDiscardRecovered': return `${F(e.faction)}'s spent leaders return to hand (${e.count}).`;
    case 'incursionMusterAwarded': return `${F(e.faction)} may raise banners at ${esc(rName(e.region))} in victory.`;
    case 'incursionAuthorityLost': return `${F(e.faction)} forfeits ${e.amount} ${esc(theme.terms.authority)}.`;
    case 'incursionBidRefunded': return `${F(e.faction)}'s bid of ${e.amount} comes home in victory.`;
    case 'incursionOptionChosen': return `${F(e.faction)} chooses: ${e.option === 'destroyUnits' ? 'sacrifice units' : 'surrender standing'}.`;
    case 'threatReset': return `The ${esc(theme.terms.threat || 'threat')} ${e.outcome === 'defenders' ? 'is thrown back' : 'recedes'}: ${e.from} → ${e.to}.`;
    case 'incursionResolved': return `<em>The ${esc(theme.terms.incursion.toLowerCase())} passes. ${esc(eventCardName(e.card))} is buried beneath the deck.</em>`;
    case 'incursionReattack': return `<b>⚠ ${esc(theme.terms.invaders)} strike again</b> — strength ${e.strength}!`;
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
    case 'gameOver': return `👑 ${F(e.winner)} ${e.reason === 'seats' ? `seizes a ${SETUP_VICTORY_TARGET}th seat — the shown() ends at once` : 'holds the most seats as the final round closes'}!${e.standings ? ` Final standings: ${e.standings.map(f => `${fGlyph(f)} ${e.seats?.[f] ?? ''}`).join(' · ')}.` : ''}`;
    default: return null;
  }
}

function renderLog() {
  const box = $('#log');
  box.innerHTML = shown().log.map(logLine).filter(Boolean).map(l => `<div>${l}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

// ---------- top-level render ----------
function renderHouses() {
  const el = $('#houses-panel');
  if (!el) return;
  const active = new Set(shown().pendingQueries.map(q => q.faction));
  el.innerHTML = shown().factions.map(f => `
    <div class="house-row ${active.has(f) ? 'house-active' : ''}" style="border-left-color:${fColor(f)}">
      <span class="house-name">${fGlyph(f)} ${esc(fName(f))}</span>
      <span title="seats (win at 7)">${pic('i-fort-castle')}${seatsControlled(shown(), f)}</span>
      <span title="supply">${pic('i-supply', 'var(--bone-dim)')}${shown().supply[f]}</span>
      <span title="${esc(theme.terms.authority)}">${pic('i-coin')}${shown().authority[f]}</span>
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
  const stars = STAR_ALLOWANCE[shown().ruleset.seatCount] || [];
  el.innerHTML = rows.map(([track, label, token, tokenName]) => {
    const seats = shown().tracks[track].map((f, i) => {
      const star = track === 'command' && stars[i] ? `<sup>${'★'.repeat(stars[i])}</sup>` : '';
      const holder = i === 0 ? `<span class="tok-dot" title="${esc(tokenName)}">●</span>` : '';
      const hot = shown().pendingQueries.some(q => q.faction === f) ? ' seat-active' : '';
      return `<span class="track-seat${hot}" style="border-color:${fColor(f)}" title="${esc(fName(f))} — position ${i + 1}">${fGlyph(f)}${star}${holder}</span>`;
    }).join('');
    return `<div class="track-row"><span class="track-name" title="${esc(tokenName)} to the leader">${esc(label)}</span>${seats}</div>`;
  }).join('');
}

function render() {
  _viewCache = null; // one fresh viewFor per state change (M3.c)
  lastRenderAt = performance.now();
  applyThemeVisuals();
  scanForStage();
  const svg = $('#map');
  renderMap(svg, theme, { onSelect: handleRegionTap });
  tintForts();
  overlayState(svg);
  renderTurnPanel();
  renderHouses();
  renderTracks();
  renderLog();
  renderInspector();
  const sl = $('#seed-line');
  if (sl) sl.textContent = `seed ${game.config?.seed ?? '—'} · build ${BUILD_ID}`;
  const phaseNames = { planning: 'Planning', action: 'Action', event: 'Event Phase', gameOver: 'Game over' };
  $('#status-line').textContent = `Round ${shown().round} of ${shown().scenario.maxRounds ?? 10} · ${phaseNames[shown().phase] || shown().phase}`;
  // P2 (owner, Jul 2026): threat and standings get their own strips instead
  // of riding in the round/phase sentence.
  const vit = $('#vitals-panel');
  if (vit) {
    const t = shown().threat ?? 0;
    const board = shown().factions.slice().sort((a, b) =>
      (seatsControlled(shown(), b) - seatsControlled(shown(), a)) ||
      (landAreasControlled(shown(), b) - landAreasControlled(shown(), a)) ||
      (shown().supply[b] - shown().supply[a]) ||
      (shown().tracks.initiative.indexOf(a) - shown().tracks.initiative.indexOf(b)));
    vit.innerHTML = `
      <div class="vital-row" title="${esc(theme.terms.threat || 'Threat')} — incursion at 12">
        <span class="vital-name">${esc(theme.terms.threat || 'Threat')}</span>
        <span class="threat-meter"><span class="threat-fill${t >= 10 ? ' hot' : ''}" style="width:${(t / 12) * 100}%"></span></span>
        <span class="vital-num">${t}/12</span></div>
      <div class="vital-row" title="standings: seats · land · supply · initiative (Rules p.25)">
        <span class="vital-name">Standing</span>
        <span class="board-row">${board.map((f, i) => `<span class="board-seat" style="border-color:${fColor(f)}" title="${esc(fName(f))} — ${seatsControlled(shown(), f)} seats">${i === 0 ? '👑' : ''}${fGlyph(f)}</span>`).join('')}</span></div>`;
  }
  botPump(); // M3.c: after every repaint, hand the table to any waiting bot
}

// ---------- chrome ----------
function fillSeatSelect() {
  const sel = $('#seat-select');
  if (!sel) return;
  const cur = sel.value || 'table';
  sel.innerHTML = `<option value="table">table mode (all seats)</option>` +
    FACTIONS.map(f => `<option value="${f.id}">play ${esc(fName(f.id))}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : 'table';
}

function init() {
  fillSeatSelect();
  $('#theme-select').addEventListener('change', e => { theme = THEMES[e.target.value]; fillSeatSelect(); render(); });
  $('#btn-new').addEventListener('click', () => newGame());
  $('#seed-line').addEventListener('click', () => {
    const raw = prompt('Start a new game with a specific seed (blank cancels):');
    if (raw && Number.isFinite(+raw)) newGame(+raw);
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-spectate')?.addEventListener('click', () => toggleSpectate());
  $('#spectate-speed')?.addEventListener('input', () => { if (spectate.on) toggleSpectate(true); });
  $('#zoom-in')?.addEventListener('click', () => cameraZoomBy($('#map'), 1.35));
  $('#zoom-out')?.addEventListener('click', () => cameraZoomBy($('#map'), 1 / 1.35));
  $('#zoom-home')?.addEventListener('click', () => cameraReset($('#map')));
  $('#btn-quiet').addEventListener('click', e => {
    stageState.quiet = !stageState.quiet;
    if (stageState.quiet) stageState.batch = null;
    e.target.textContent = `Quiet: ${stageState.quiet ? 'on' : 'off'}`;
    renderTurnPanel();
  });
  $('#btn-save').addEventListener('click', () => {
    // Table-mode saves stay RAW engine state (a raw save is an unsealed
    // episode — keep that true). Mixed games wrap seat config in a v2
    // envelope so Restore puts the same bots back at the table.
    const payload = mixed.human
      ? JSON.stringify({ save: 'hegemon-save/2',
          controllers: { human: mixed.human, policy: mixed.policy },
          engine: JSON.parse(serialize(game)) })
      : serialize(game);
    const blob = new Blob([payload], { type: 'application/json' });
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
      seatControllers: Object.fromEntries(game.factions.map(f =>
        [f, mixed.human ? (f === mixed.human ? 'human' : mixedAgents()[f].id) : 'human'])), // M3.c: bots self-declare
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
  $('#btn-load-file').addEventListener('click', () => $('#load-file').click());
  $('#load-file').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      restoreFromText((await f.text()).trim());
      $('#load-box').classList.add('hidden');
      render();
      flash(`Restored ${f.name}.`);
    } catch (err) { flash(`Could not restore: ${err.message}`); }
    e.target.value = '';
  });
  $('#btn-load-confirm').addEventListener('click', () => {
    try {
      restoreFromText($('#load-text').value.trim());
      $('#load-box').classList.add('hidden');
      render();
    } catch (e) { flash(`Could not restore: ${e.message}`); }
  });
  newGame();
}

if (typeof document !== 'undefined') init();
