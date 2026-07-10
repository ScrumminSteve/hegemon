import { REGIONS, PORTS, buildAdjacency } from './data/map.js';
import { FACTIONS } from './data/factions.js';
import { THEME_CORE } from './themes/core.js';
import { THEME_ASOIAF } from './themes/asoiaf.js';
import { renderMap, markSelected } from './map-view.js';

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

function renderAll() {
  document.title = `HEGEMON — ${theme.title}`;
  $('#theme-title').textContent = theme.title;
  renderMap(svg, theme, { onSelect: select });
  markSelected(svg, selectedId);
  renderInspector();
  renderLegend();
}

function select(id) {
  selectedId = id === selectedId ? null : id;
  markSelected(svg, selectedId);
  renderInspector();
}

$('#theme-select').addEventListener('change', e => {
  theme = THEMES[e.target.value];
  renderAll();
});

renderAll();
