import { REGIONS, PORTS, buildAdjacency } from './data/map.js';
import { FACTIONS } from './data/factions.js';
import { THEME_CORE } from './themes/core.js';
import { THEME_ASOIAF } from './themes/asoiaf.js';
import { renderMap, markSelected } from './map-view.js';
import { SETUP } from './data/setup.js';

const THEMES = { core: THEME_CORE, asoiaf: THEME_ASOIAF };
const ADJ = buildAdjacency();
const byId = Object.fromEntries([...REGIONS, ...PORTS].map(r => [r.id, r]));

let theme = THEME_CORE;
let selectedId = null;

const $ = s => document.querySelector(s);
const svg = $('#map');

function portName(p) {
  return `${theme.terms.port} of ${theme.regions[p.landId]}`;
}
function regionName(id) {
  const r = byId[id];
  return r.kind === 'port' ? portName(r) : (theme.regions[id] || id);
}

function renderInspector() {
  const box = $('#inspector');
  if (!selectedId) {
    box.innerHTML = `<p class="hint">Select a region to inspect it. Hovering highlights its neighbors — use this to validate adjacency against the reference board.</p>`;
    return;
  }
  const r = byId[selectedId];
  const t = theme.terms;
  const rows = [];
  const kindLabel = r.kind === 'land' ? t.land : r.kind === 'maritime' ? t.maritime : t.port;
  rows.push(['Kind', kindLabel]);
  if (r.kind === 'land') {
    rows.push(['Muster', r.muster === 2 ? t.citadel : r.muster === 1 ? t.fort : '—']);
    rows.push(['Supply', r.supply || 0]);
    rows.push(['Coin', r.coin || 0]);
    if (r.home) rows.push([t.faction, `${theme.factions[r.home].glyph} ${theme.factions[r.home].name}`]);
    if (r.garrison) rows.push(['Garrison', r.garrison]);
  }
  if (r.kind === 'port') {
    rows.push(['Attached to', `${regionName(r.landId)} / ${regionName(r.seaId)}`]);
  }
  const neighbors = [...(ADJ[selectedId] || [])].sort().map(id =>
    `<button class="chip" data-goto="${id}">${id} · ${regionName(id)}</button>`).join('');
  box.innerHTML = `
    <div class="insp-head"><span class="idtag-ui">${r.id}</span><h2>${regionName(r.id)}</h2></div>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <h3>Adjacent <span class="draft-flag">draft — verify</span></h3>
    <div class="chips">${neighbors || '<em>none</em>'}</div>`;
  box.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', () => select(b.dataset.goto)));
}

function renderLegend() {
  $('#legend').innerHTML = FACTIONS.map(f => {
    const tf = theme.factions[f.id];
    return `<div class="legend-row"><span class="swatch" style="background:${f.color}"></span>
      <span class="legend-glyph">${tf.glyph}</span> ${tf.name}
      <span class="legend-home">${regionName(f.homeRegionId)}</span></div>`;
  }).join('');
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const posOf = (id) => {
  const r = byId[id];
  if (r.kind !== 'port') return { x: r.x, y: r.y };
  const a = byId[r.landId], b = byId[r.seaId];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

function unitGlyph(type, x, y, color) {
  const common = { fill: color, stroke: 'var(--ink)', 'stroke-width': 1 };
  if (type === 'cavalry')  return el('polygon', { ...common, points: `${x},${y-6} ${x-6},${y+5} ${x+6},${y+5}` });
  if (type === 'warship')  return el('rect', { ...common, x: x-8, y: y-3.5, width: 16, height: 7, rx: 3 });
  if (type === 'siege_engine') return el('rect', { ...common, x: x-5, y: y-5, width: 10, height: 10, transform: `rotate(45 ${x} ${y})` });
  return el('circle', { ...common, cx: x, cy: y, r: 5 }); // infantry
}

function renderSetupOverlay() {
  svg.querySelector('.setup-overlay')?.remove();
  if (!$('#setup-toggle')?.checked) return;
  const g = el('g', { class: 'setup-overlay' });

  for (const [fid, fs] of Object.entries(SETUP.factions)) {
    const color = FACTIONS.find(f => f.id === fid).color;
    for (const [rid, types] of Object.entries(fs.deploy)) {
      const { x, y } = posOf(rid);
      const step = 16, x0 = x - ((types.length - 1) * step) / 2;
      types.forEach((t, i) => g.appendChild(unitGlyph(t, x0 + i * step, y - 32, color)));
    }
    for (const [rid, strength] of Object.entries(fs.garrison)) {
      const { x, y } = posOf(rid);
      g.appendChild(el('circle', { cx: x + 30, cy: y - 30, r: 10, class: 'ov-garrison', style: `stroke:${color}` }));
      const t = el('text', { x: x + 30, y: y - 25.5, class: 'ov-num' });
      t.textContent = strength; g.appendChild(t);
    }
  }
  const nset = SETUP.seatVariants[6].neutralSet;
  for (const n of (nset ? SETUP.neutralForces[nset] : [])) {
    const { x, y } = posOf(n.region);
    g.appendChild(el('circle', { cx: x, cy: y - 32, r: 11, class: 'ov-neutral' }));
    const t = el('text', { x, y: y - 27.5, class: 'ov-num' });
    t.textContent = n.strength ?? '?'; g.appendChild(t);
  }
  svg.appendChild(g);
}

function renderAll() {
  document.title = `HEGEMON — ${theme.title}`;
  $('#theme-title').textContent = theme.title;
  renderMap(svg, theme, { onSelect: select });
  markSelected(svg, selectedId);
  renderInspector();
  renderLegend();
  renderSetupOverlay();
}

function select(id) {
  selectedId = id === selectedId ? null : id;
  markSelected(svg, selectedId);
  renderInspector();
}

$('#setup-toggle').addEventListener('change', renderSetupOverlay);

$('#theme-select').addEventListener('change', e => {
  theme = THEMES[e.target.value];
  renderAll();
});

renderAll();
