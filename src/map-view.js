// Map renderer. Pure presentation: reads structure from data, names from theme.

import { REGIONS, PORTS, EDGES, buildAdjacency } from './data/map.js';
import { FACTIONS } from './data/factions.js';

const W = 1100, H = 1610;
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

/**
 * A port's anchor: pinned to its LAND region's edge, nudged toward the sea.
 * The raw land↔sea midpoint (the old formula) drifts far offshore when the sea
 * region's center is distant — P01/P02 rendered nearer to the WRONG land hex.
 * 62px = hex radius (46) + diamond clearance; the diamond visibly belongs to
 * its harbor town. app.js posOf uses this same helper so units, taps, and
 * overlays stay glued to the diamond.
 */
export function portAnchor(land, sea) {
  const dx = sea.x - land.x, dy = sea.y - land.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: land.x + (dx / d) * 62, y: land.y + (dy / d) * 62 };
}

export function renderMap(svg, theme, { onSelect } = {}) {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const pos = Object.fromEntries(REGIONS.map(r => [r.id, r]));

  // M2.f.2 — painted theme canvas. The art is composited by
  // tools/build-map.py FROM this same map data, so anchors align by
  // construction: the image spans the compositor's exact working window.
  const canvas = theme.visuals?.canvas;
  svg.classList.toggle('has-canvas', !!canvas);
  if (canvas) {
    const img = svgEl('image', { x: canvas.x, y: canvas.y, width: canvas.w, height: canvas.h });
    img.setAttribute('href', canvas.background);
    img.setAttribute('preserveAspectRatio', 'none');
    svg.appendChild(img);
  }

  // chart graticule (vector themes only; ghosted over art)
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
  // All names live in a dedicated layer appended LAST (owner P2, Jul 2026):
  // text always paints above diamonds, seals, and unit clusters.
  const labels = svgEl('g', { class: 'labels' });
  const labelQueue = [];

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
      if (r.muster > 0) {
        // Interim fortified marker (owner request, Jul 2026): a second inner
        // ring makes muster-value regions readable at a glance in every
        // theme. Replaced by themed castle/citadel icons in M2.f.3.
        g.appendChild(svgEl('polygon', { points: hexPath(r.x, r.y, 39), class: 'hex-fort' }));
      }
      if (home) {
        // Grander seat seal (owner P2, Jul 2026): larger disc, ceremonial ring.
        g.appendChild(svgEl('circle', { cx: r.x, cy: r.y - 15, r: 20, class: 'home-ring', style: `stroke:${home.color}` }));
        g.appendChild(svgEl('circle', { cx: r.x, cy: r.y - 15, r: 16.5, class: 'home-seal', style: `fill:${home.color}` }));
        const glyph = svgEl('text', { x: r.x, y: r.y - 9, class: 'home-glyph' });
        glyph.textContent = theme.factions[r.home]?.glyph || '●';
        g.appendChild(glyph);
      }
      iconRow(g, r, r.x, r.y + (home ? 14 : 2));
    }

    const label = svgEl('text', { x: r.x, y: r.y + (r.kind === 'maritime' ? 58 : 66), class: 'label' });
    label.textContent = name;
    labelQueue.push(label);

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
  for (const l of labelQueue) labels.appendChild(l);
  svg.appendChild(labels);

  // ports as diamonds pinned to their land region's seaward edge
  for (const p of PORTS) {
    const { x: mx, y: my } = portAnchor(pos[p.landId], pos[p.seaId]);
    const g = svgEl('g', { class: 'region port', 'data-id': p.id, tabindex: 0, role: 'button' });
    g.appendChild(svgEl('rect', { x: mx - 12, y: my - 12, width: 24, height: 24, class: 'shape port-diamond', transform: `rotate(45 ${mx} ${my})` }));
    const pl = svgEl('text', { x: mx, y: my + 3.5, class: 'port-mark' });
    pl.textContent = '⚓';
    g.appendChild(pl);
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
