// Map renderer. Pure presentation: reads structure from data, names from theme.

import { injectIcons } from './icons.js';
import { EDGE_ROUTES } from './data/edgeRoutes.js';
import { REGIONS, PORTS, EDGES, buildAdjacency } from './data/map.js';
import { FACTIONS } from './data/factions.js';

const W = 1100, H = 1660; // H bumped: S07 moved to y=1568 (owner, Jul 2026)
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
  // muster tier is carried by the seat mark (castle/citadel) — not repeated here
  for (let i = 0; i < (region.supply || 0); i++) marks.push('supply');
  for (let i = 0; i < (region.coin || 0); i++) marks.push('coin');
  const total = marks.length;
  if (!total) return;
  const step = 20, x0 = cx - ((total - 1) * step) / 2; // unit-sized icons (owner, Jul 2026)
  marks.forEach((m, i) => {
    const x = x0 + i * step;
    const use = svgEl('use', { x: x - 9, y: cy - 9, width: 18, height: 18,
      class: m === 'supply' ? 'ic-supply' : 'ic-coin' });
    use.setAttribute('href', m === 'supply' ? '#i-supply' : '#i-coin');
    g.appendChild(use);
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

// ---------- M2.f.2b — camera ----------
// The viewBox is a camera: pan by dragging, zoom by wheel/trackpad-pinch or
// two-finger touch, persistent across re-renders (every dispatch re-renders,
// so a per-render reset would snap the view home on each action).
const CAM = { x: 0, y: 0, w: 0, h: 0, min: 0.92, max: 4 };
function applyCam(svg) {
  svg.setAttribute('viewBox', `${CAM.x} ${CAM.y} ${CAM.w} ${CAM.h}`);
}
function clampCam() {
  CAM.w = Math.max(W / CAM.max, Math.min(W / CAM.min, CAM.w));
  CAM.h = CAM.w * (H / W);
  CAM.x = Math.max(-W * 0.08, Math.min(W * 1.08 - CAM.w, CAM.x));
  CAM.y = Math.max(-H * 0.08, Math.min(H * 1.08 - CAM.h, CAM.y));
}
export function cameraReset(svg) {
  CAM.x = 0; CAM.y = 0; CAM.w = W; CAM.h = H;
  if (svg) applyCam(svg);
}
export function cameraCenterOn(svg, x, y, zoom = null) {
  if (zoom) { CAM.w = W / zoom; CAM.h = CAM.w * (H / W); }
  CAM.x = x - CAM.w / 2; CAM.y = y - CAM.h / 2;
  clampCam(); applyCam(svg);
}
export function cameraZoomBy(svg, factor, cx = null, cy = null) {
  const px = cx ?? CAM.x + CAM.w / 2, py = cy ?? CAM.y + CAM.h / 2;
  const rx = (px - CAM.x) / CAM.w, ry = (py - CAM.y) / CAM.h;
  CAM.w /= factor; CAM.h = CAM.w * (H / W);
  CAM.x = px - rx * CAM.w; CAM.y = py - ry * CAM.h;
  clampCam(); applyCam(svg);
}
/** Meet-aware: the viewBox letterboxes inside the element, so use the real
    rendered scale, not the element rect, or pans drift and zooms miss. */
function camScale(svg) {
  const r = svg.getBoundingClientRect();
  const scale = Math.min(r.width / CAM.w, r.height / CAM.h);
  // With a fixed camera aspect, the rendered map size in px is constant
  // across zoom (scale*CAM.w = min(r.w, r.h*W/H)) — so are the letterbox
  // offsets. That is what makes the anchor solve below exact.
  return { r, scale,
    rw: CAM.w * scale, rh: CAM.h * scale,
    ox: (r.width - CAM.w * scale) / 2, oy: (r.height - CAM.h * scale) / 2 };
}
function svgPoint(svg, clientX, clientY) {
  const { r, scale, ox, oy } = camScale(svg);
  return { x: CAM.x + (clientX - r.left - ox) / scale,
           y: CAM.y + (clientY - r.top - oy) / scale };
}
let gesturesBound = null;
function bindGestures(svg) {
  if (gesturesBound === svg) return;
  gesturesBound = svg;
  const ptrs = new Map();
  let mode = 'idle';               // 'pan' | 'pinch' | 'idle'
  let panPrev = null, moved = 0;
  let pinch = null;                // { d0, w0, anchor } — anchor is a WORLD point
  svg.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      mode = 'pan'; panPrev = { x: e.clientX, y: e.clientY }; moved = 0;
    } else if (ptrs.size === 2) {
      // Lock the world point under the finger midpoint ONCE, at gesture
      // start. Recomputing it through the moving camera each frame (the old
      // code) is a feedback loop — the source of the mobile chaos.
      const [a, b] = [...ptrs.values()];
      mode = 'pinch';
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, w0: CAM.w,
                anchor: svgPoint(svg, (a.x + b.x) / 2, (a.y + b.y) / 2) };
      for (const id of ptrs.keys()) { try { svg.setPointerCapture?.(id); } catch { /* released pointer */ } }
    } else {
      mode = 'idle';
    }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      // Damped ratio: soften tiny finger jitter without lagging real intent.
      const raw = pinch.d0 / d;
      CAM.w = pinch.w0 * Math.sign(raw) * Math.pow(Math.abs(raw), 0.9);
      CAM.h = CAM.w * (H / W);
      clampCam(); // clamp ZOOM first so the anchor solve uses the final size
      const { r, rw, rh, ox, oy } = camScale(svg);
      const fu = ((a.x + b.x) / 2 - r.left - ox) / rw;
      const fv = ((a.y + b.y) / 2 - r.top - oy) / rh;
      CAM.x = pinch.anchor.x - fu * CAM.w;
      CAM.y = pinch.anchor.y - fv * CAM.h;
      clampCam(); applyCam(svg);
    } else if (mode === 'pan' && ptrs.size === 1 && panPrev) {
      const cur = { x: e.clientX, y: e.clientY };
      const { scale } = camScale(svg);
      moved += Math.abs(cur.x - panPrev.x) + Math.abs(cur.y - panPrev.y);
      if (moved > 6) svg.setPointerCapture?.(e.pointerId); // past tap threshold: it's a pan
      CAM.x -= (cur.x - panPrev.x) / scale;
      CAM.y -= (cur.y - panPrev.y) / scale;
      panPrev = cur;
      clampCam(); applyCam(svg);
    }
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (mode === 'pinch' && ptrs.size < 2) {
      // A pinch ends the whole gesture: no pan handoff to the surviving
      // finger with a stale reference — lift everything to start fresh.
      mode = 'idle'; pinch = null;
    }
    if (ptrs.size === 0) {
      if (moved > 6) { // a drag, not a tap: swallow the click on regions
        const stop = ev => { ev.stopPropagation(); svg.removeEventListener('click', stop, true); };
        svg.addEventListener('click', stop, true);
        setTimeout(() => svg.removeEventListener('click', stop, true), 0);
      }
      mode = 'idle'; panPrev = null; moved = 0;
    }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // Safari: keep the BROWSER's pinch off the map. touch-action:none covers
  // modern engines; the gesture* events catch Safari's page-zoom path; the
  // non-passive touchmove preventDefault is the final belt-and-suspenders.
  // (Page zoom elsewhere stays untouched — accessibility intact.)
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
    svg.addEventListener(t, e => e.preventDefault());
  }
  svg.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const pt = svgPoint(svg, e.clientX, e.clientY);
    cameraZoomBy(svg, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), pt.x, pt.y);
  }, { passive: false });
}

export function renderMap(svg, theme, { onSelect } = {}) {
  svg.innerHTML = '';
  if (!CAM.w) cameraReset(null);
  applyCam(svg);
  bindGestures(svg);
  injectIcons(svg, theme.visuals?.unitIcons || 'core'); // M2.f.3 themed symbols
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
  // Routed edges (owner finding, Jul 2026): long routes — sea lanes
  // especially — used to slice straight through unrelated territories.
  // Any edge passing near a foreign anchor now takes waypoints pushed
  // perpendicular, AWAY from each offender: curved sea lanes around
  // landmasses, exactly like a printed board. Pure rendering; data untouched.
  const CLEAR_EDGE = 42;
  function routedPoints(a, b) {
    const A = pos[a], B = pos[b];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len2 = dx * dx + dy * dy || 1;
    const way = [];
    for (const r of REGIONS) {
      if (r.id === a || r.id === b) continue;
      const t = Math.max(0.08, Math.min(0.92, ((r.x - A.x) * dx + (r.y - A.y) * dy) / len2));
      const px2 = A.x + t * dx, py2 = A.y + t * dy;
      const d = Math.hypot(r.x - px2, r.y - py2);
      if (d >= CLEAR_EDGE) continue;
      const nx = px2 - r.x, ny = py2 - r.y;
      const n = Math.hypot(nx, ny) || 1;
      const push = 58 + (CLEAR_EDGE - d);
      way.push({ t, x: r.x + (nx / n) * push, y: r.y + (ny / n) * push });
    }
    way.sort((u, v) => u.t - v.t);
    // merge waypoints that crowd each other
    const merged = [];
    for (const w of way) {
      const last = merged[merged.length - 1];
      if (last && Math.hypot(w.x - last.x, w.y - last.y) < 46) {
        last.x = (last.x + w.x) / 2; last.y = (last.y + w.y) / 2;
      } else merged.push(w);
    }
    return [{ x: A.x, y: A.y }, ...merged, { x: B.x, y: B.y }];
  }
  for (const [a, b] of EDGES) {
    if (!pos[a] || !pos[b]) continue;
    const sea = a.startsWith('S') || b.startsWith('S');
    // Water-routed lanes come precomputed from the build tool's A* over the
    // land mask (owner: sea connectors travel over sea). JS anchor-avoidance
    // remains the fallback for land-land edges and unrouted pairs.
    const routed = EDGE_ROUTES[`${a}|${b}`] || EDGE_ROUTES[`${b}|${a}`];
    const pts = routed ? routed.map(([x, y]) => ({ x, y })) : routedPoints(a, b);
    const cls = sea ? 'edge edge-sea' : 'edge edge-land';
    if (pts.length === 2) {
      edges.appendChild(svgEl('line', {
        x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y,
        class: cls, 'data-a': a, 'data-b': b,
      }));
    } else {
      // smooth through the waypoints with quadratic midpoint curves
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const mx2 = (pts[i].x + pts[i + 1].x) / 2, my2 = (pts[i].y + pts[i + 1].y) / 2;
        d += ` Q ${pts[i].x} ${pts[i].y} ${mx2} ${my2}`;
      }
      d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
      edges.appendChild(svgEl('path', { d, class: cls, fill: 'none', 'data-a': a, 'data-b': b }));
    }
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
        // M2.f.3 — themed seat marks: castle (muster 1) vs citadel (muster 2),
        // distinguishable at a glance (owner request). Replaces the interim ring.
        const fort = svgEl('use', { x: r.x + 12, y: r.y - 46, width: 21, height: 21, class: 'ic-fort' });
        fort.setAttribute('href', r.muster >= 2 ? '#i-fort-citadel' : '#i-fort-castle');
        g.appendChild(fort);
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
    const pm = svgEl('use', { x: mx - 8, y: my - 8, width: 16, height: 16, class: 'ic-port' });
    pm.setAttribute('href', '#i-port');
    g.appendChild(pm);
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
