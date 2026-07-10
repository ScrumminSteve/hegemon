// Map renderer. Pure presentation: reads structure from data, names from theme.

import { REGIONS, PORTS, EDGES, buildAdjacency } from './data/map.js';
import { FACTIONS } from './data/factions.js';

const W = 1000, H = 1460;
const ADJ = buildAdjacency();
const factionById = Object.fromEntries(FACTIONS.map(f => [f.id, f]));

const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function hexPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function iconRow(g, region, cx, cy) {
  const marks = [];
  for (let i = 0; i < region.muster; i++) marks.push('muster');
  for (let i = 0; i < (region.supply || 0); i++) marks.push('supply');
  for (let i = 0; i < (region.coin || 0); i++) marks.push('coin');
  const total = marks.length;
  if (!total) return;
  const step = 16, x0 = cx - ((total - 1) * step) / 2;
  marks.forEach((m, i) => {
    const x = x0 + i * step;
    if (m === 'muster') g.appendChild(svgEl('rect', { x: x - 5.5, y: cy - 5.5, width: 11, height: 11, class: 'ic-muster' }));
    else if (m === 'supply') g.appendChild(svgEl('rect', { x: x - 5, y: cy - 6, width: 10, height: 12, rx: 3, class: 'ic-supply' }));
    else g.appendChild(svgEl('circle', { cx: x, cy, r: 5.5, class: 'ic-coin' }));
  });
}

export function renderMap(svg, theme, { onSelect } = {}) {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const pos = Object.fromEntries(REGIONS.map(r => [r.id, r]));

  // chart graticule
  const grid = svgEl('g', { class: 'graticule' });
  for (let x = 100; x < W; x += 100) grid.appendChild(svgEl('line', { x1: x, y1: 0, x2: x, y2: H }));
  for (let y = 100; y < H; y += 100) grid.appendChild(svgEl('line', { x1: 0, y1: y, x2: W, y2: y }));
  svg.appendChild(grid);

  // edges
  const edges = svgEl('g', { class: 'edges' });
  for (const [a, b] of EDGES) {
    const A = pos[a], B = pos[b];
    if (!A || !B) continue;
    const sea = a.startsWith('S') || b.startsWith('S');
    edges.appendChild(svgEl('line', {
      x1: A.x, y1: A.y, x2: B.x, y2: B.y,
      class: sea ? 'edge edge-sea' : 'edge edge-land',
      'data-a': a, 'data-b': b,
    }));
  }
  svg.appendChild(edges);

  const nodes = svgEl('g', { class: 'nodes' });
  svg.appendChild(nodes);

  for (const r of REGIONS) {
    const g = svgEl('g', { class: `region ${r.kind}`, 'data-id': r.id, tabindex: 0, role: 'button' });
    const name = theme.regions[r.id] || r.id;

    if (r.kind === 'maritime') {
      g.appendChild(svgEl('circle', { cx: r.x, cy: r.y, r: 42, class: 'shape sea-outer' }));
      g.appendChild(svgEl('circle', { cx: r.x, cy: r.y, r: 32, class: 'shape sea-inner' }));
    } else {
      const home = r.home ? factionById[r.home] : null;
      const poly = svgEl('polygon', { points: hexPath(r.x, r.y, 46), class: 'shape land-hex' });
      if (home) poly.style.stroke = home.color;
      g.appendChild(poly);
      if (home) {
        g.appendChild(svgEl('circle', { cx: r.x, cy: r.y - 16, r: 13, class: 'home-seal', style: `fill:${home.color}` }));
        const glyph = svgEl('text', { x: r.x, y: r.y - 11.5, class: 'home-glyph' });
        glyph.textContent = theme.factions[r.home]?.glyph || '●';
        g.appendChild(glyph);
      }
      iconRow(g, r, r.x, r.y + (home ? 14 : 2));
    }

    const label = svgEl('text', { x: r.x, y: r.y + (r.kind === 'maritime' ? 58 : 66), class: 'label' });
    label.textContent = name;
    g.appendChild(label);

    const idTag = svgEl('text', { x: r.x, y: r.y + (r.kind === 'maritime' ? 4 : (r.home ? 34 : 24)), class: 'idtag' });
    idTag.textContent = r.id;
    g.appendChild(idTag);

    g.addEventListener('click', () => onSelect?.(r.id));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(r.id); } });
    g.addEventListener('mouseenter', () => highlight(svg, r.id, true));
    g.addEventListener('mouseleave', () => highlight(svg, r.id, false));
    g.addEventListener('focus', () => highlight(svg, r.id, true));
    g.addEventListener('blur', () => highlight(svg, r.id, false));
    nodes.appendChild(g);
  }

  // ports as diamonds on the land↔sea midpoint
  for (const p of PORTS) {
    const A = pos[p.landId], B = pos[p.seaId];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const g = svgEl('g', { class: 'region port', 'data-id': p.id, tabindex: 0, role: 'button' });
    g.appendChild(svgEl('rect', { x: mx - 9, y: my - 9, width: 18, height: 18, class: 'shape port-diamond', transform: `rotate(45 ${mx} ${my})` }));
    g.addEventListener('click', () => onSelect?.(p.id));
    g.addEventListener('mouseenter', () => highlight(svg, p.id, true));
    g.addEventListener('mouseleave', () => highlight(svg, p.id, false));
    nodes.appendChild(g);
  }
}

export function markSelected(svg, id) {
  svg.querySelectorAll('.region.selected').forEach(el => el.classList.remove('selected'));
  if (id) svg.querySelector(`.region[data-id="${id}"]`)?.classList.add('selected');
}

function highlight(svg, id, on) {
  const neighbors = ADJ[id] || new Set();
  svg.querySelectorAll('.region').forEach(el => {
    const rid = el.dataset.id;
    el.classList.toggle('hl', on && rid === id);
    el.classList.toggle('adj', on && neighbors.has(rid));
    el.classList.toggle('dim', on && rid !== id && !neighbors.has(rid));
  });
  svg.querySelectorAll('.edge').forEach(el => {
    el.classList.toggle('edge-hl', on && (el.dataset.a === id || el.dataset.b === id));
  });
}
