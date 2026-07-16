#!/usr/bin/env python3
"""HEGEMON map compositor (M2.f.2).

Geometry from code, materials from art: the landmass is generated from
src/data/map.js (via tools/dump-map.mjs) with machine-verified guarantees —
every land anchor on land, every sea anchor on ocean-connected water, one
mainland, graph-derived islands separated, every harbor on a coast, no
enclosed lakes. Owner swatches (assets/art-src/) paint it; terrain stamps are
cut from the owner's stamp sheet and scattered per-biome, clear of every
game anchor. Outputs assets/map-asoiaf.webp and assets/map-2026.webp within
budget, and prints the theme `canvas` blocks.

Biomes: tools/map-config.json carries the per-region terrain table. On first
run the latitude+noise default is written back into it — edit the table and
re-run to repaint. Deterministic: same inputs, same pixels.

Usage: python3 tools/build-map.py [--budget-kb 600]
"""
import json, math, subprocess, sys, io
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageOps, ImageEnhance
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / 'tools'
ASSETS = ROOT / 'assets'
SRC = ASSETS / 'art-src'
PAD, S = 130, 1.6
BUDGET_KB = int(sys.argv[sys.argv.index('--budget-kb') + 1]) if '--budget-kb' in sys.argv else 600

# ---------- topology ----------
subprocess.run(['node', str(TOOLS / 'dump-map.mjs')], check=True, cwd=ROOT)
d = json.loads((TOOLS / 'mapdata.json').read_text())
regions, ports, edges = d['regions'], d['ports'], d['edges']
pos = {r['id']: (r['x'], r['y']) for r in regions}
kind = {r['id']: r['kind'] for r in regions}
land_ids = [r['id'] for r in regions if r['kind'] == 'land']
sea_ids = [r['id'] for r in regions if r['kind'] == 'maritime']
has_land_nbr = set()
for a, b in edges:
    if kind.get(a) == 'land' and kind.get(b) == 'land':
        has_land_nbr.update([a, b])
islands = [i for i in land_ids if i not in has_land_nbr]
mainland_ids = [i for i in land_ids if i not in islands]
sea_sea = [(a, b) for a, b in edges if kind.get(a) == 'maritime' and kind.get(b) == 'maritime']
land_land = [(a, b) for a, b in edges if kind.get(a) == 'land' and kind.get(b) == 'land']
OX, OY = d['minX'] - PAD, d['minY'] - PAD
W = int((d['maxX'] - d['minX'] + 2 * PAD) * S)
H = int((d['maxY'] - d['minY'] + 2 * PAD) * S)
P = lambda x, y: ((x - OX) * S, (y - OY) * S)
dist = lambda a, b: math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1])
nearest = lambda i, grp: min(dist(i, o) for o in grp if o != i)

def portpt(p):
    lx, ly = pos[p['landId']]; sx, sy = pos[p['seaId']]
    n = math.hypot(sx - lx, sy - ly) or 1
    return P(lx + (sx - lx) / n * 62, ly + (sy - ly) / n * 62)

# ---------- landmask (verified) ----------
def build_mask():
    m = Image.new('L', (W, H), 0); md = ImageDraw.Draw(m)
    for i in land_ids:
        x, y = P(*pos[i])
        r = (min(50, 0.40 * nearest(i, land_ids), 0.55 * nearest(i, sea_ids)) if i in islands
             else min(max(64, 0.58 * nearest(i, land_ids)), 138, 0.88 * nearest(i, sea_ids))) * S
        md.ellipse([x - r, y - r, x + r, y + r], fill=255)
    for i in sea_ids:
        x, y = P(*pos[i]); r = min(96, 0.70 * nearest(i, land_ids)) * S
        md.ellipse([x - r, y - r, x + r, y + r], fill=0)
    for a, b in sea_sea: md.line([*P(*pos[a]), *P(*pos[b])], fill=0, width=int(96 * S))
    for a, b in land_land: md.line([*P(*pos[a]), *P(*pos[b])], fill=255, width=int(72 * S))
    for i in sea_ids:
        x, y = P(*pos[i]); r = min(46, 0.5 * nearest(i, land_ids)) * S
        md.ellipse([x - r, y - r, x + r, y + r], fill=0)
    for i in islands:
        x, y = P(*pos[i])
        r = (min(50, 0.40 * nearest(i, land_ids), 0.55 * nearest(i, sea_ids)) + 30) * S
        md.ellipse([x - r, y - r, x + r, y + r], outline=0, width=int(28 * S))
    for i in land_ids:
        x, y = P(*pos[i])
        core = (40 if i in islands else min(56, 0.45 * nearest(i, sea_ids))) * S
        md.ellipse([x - core, y - core, x + core, y + core], fill=255)
    m = m.filter(ImageFilter.MedianFilter(15))
    m = m.filter(ImageFilter.GaussianBlur(18)).point(lambda v: 255 if v > 118 else 0)
    m = m.filter(ImageFilter.GaussianBlur(5)).point(lambda v: 255 if v > 128 else 0)
    fill_enclosed(m)
    for _ in range(3):  # harbors that lost their coast get a natural bay
        px = m.load()
        bad = [p for p in ports if not port_on_coast(px, p)]
        if not bad: break
        md = ImageDraw.Draw(m)
        for p in bad:
            hx, hy = portpt(p)
            tgt = None
            for rad in range(20, 700, 8):
                for k in range(24):
                    t = k * math.pi / 12
                    x, y = hx + rad * math.cos(t), hy + rad * math.sin(t)
                    if 0 <= x < W and 0 <= y < H and px[int(x), int(y)] == 0:
                        tgt = (x, y); break
                if tgt: break
            if tgt:
                md.line([hx, hy, *tgt], fill=0, width=int(46 * S))
                md.ellipse([hx - 30 * S, hy - 30 * S, hx + 30 * S, hy + 30 * S], fill=0)
        m = m.filter(ImageFilter.GaussianBlur(6)).point(lambda v: 255 if v > 128 else 0)
        fill_enclosed(m)
    return m

def fill_enclosed(m):
    wf = m.copy(); ImageDraw.floodfill(wf, (2, 2), 128)
    mp = np.array(m); wp = np.array(wf)
    mp[wp == 0] = 255
    m.paste(Image.fromarray(mp, 'L'))

def port_on_coast(px, p):
    hx, hy = portpt(p)
    vals = {px[int(min(max(hx + 45 * S * math.cos(t), 0), W - 1)),
               int(min(max(hy + 45 * S * math.sin(t), 0), H - 1))]
            for t in [k * math.pi / 8 for k in range(16)]}
    return vals == {0, 255}

def verify(m):
    px = m.load(); fails = []
    for i in land_ids:
        x, y = P(*pos[i])
        if px[int(x), int(y)] != 255: fails.append(f'{i} not on land')
    for i in sea_ids:
        x, y = P(*pos[i])
        if px[int(x), int(y)] != 0: fails.append(f'{i} not on water')
    ff = m.copy(); ImageDraw.floodfill(ff, tuple(int(v) for v in P(*pos[mainland_ids[0]])), 128)
    fpx = ff.load()
    for i in mainland_ids[1:]:
        x, y = P(*pos[i])
        if fpx[int(x), int(y)] != 128: fails.append(f'{i} split from mainland')
    for i in islands:
        x, y = P(*pos[i])
        if fpx[int(x), int(y)] == 128: fails.append(f'{i} welded to mainland')
    for p in ports:
        if not port_on_coast(px, p): fails.append(f"{p['id']} not on a coast")
    return fails

# ---------- deterministic noise & tiling ----------
def octave_noise(w, h, octaves, seed=0):
    rng = np.random.default_rng(seed)
    acc = np.full((h, w), 128.0)
    for cell, amp in octaves:
        small = rng.integers(0, 256, (max(2, h // cell), max(2, w // cell))).astype(np.uint8)
        layer = np.array(Image.fromarray(small, 'L').resize((w, h), Image.BILINEAR), dtype=np.float64)
        acc = acc * (1 - amp) + layer * amp
    return Image.fromarray(acc.astype(np.uint8), 'L')

def tiled_L(path, scale):
    im = Image.open(path).convert('L')
    seam = abs(np.array(im)[:, 0].astype(int) - np.array(im)[:, -1].astype(int)).mean()
    if seam > 26:
        im2 = Image.new('L', (im.width * 2, im.height * 2))
        im2.paste(im, (0, 0)); im2.paste(ImageOps.mirror(im), (im.width, 0))
        im2.paste(ImageOps.flip(im), (0, im.height))
        im2.paste(ImageOps.mirror(ImageOps.flip(im)), (im.width, im.height))
        im = im2
    im = im.resize((max(2, int(im.width * scale)), max(2, int(im.height * scale))), Image.LANCZOS)
    out = Image.new('L', (W, H))
    for y in range(0, H, im.height):
        for x in range(0, W, im.width): out.paste(im, (x, y))
    return ImageOps.autocontrast(out, cutoff=2)

# ---------- biome table (owner-authorable) ----------
CFG_PATH = TOOLS / 'map-config.json'
cfg = json.loads(CFG_PATH.read_text()) if CFG_PATH.exists() else {'seed': 42, 'terrain': {}}
BIOMES = ['tundra', 'mountain', 'forest', 'plains', 'hills']
if not cfg['terrain']:
    import random as _r
    _r.seed(cfg.get('seed', 42))
    ys = sorted(pos[i][1] for i in land_ids); y0, y1 = ys[0], ys[-1]
    for i in land_ids:
        v = (pos[i][1] - y0) / (y1 - y0) + _r.uniform(-0.14, 0.14)
        if v < 0.14: cfg['terrain'][i] = 'tundra'
        elif v < 0.34: cfg['terrain'][i] = 'forest' if _r.random() < 0.6 else 'mountain'
        elif v < 0.62: cfg['terrain'][i] = _r.choice(['forest', 'forest', 'hills', 'mountain'])
        else: cfg['terrain'][i] = _r.choice(['plains', 'plains', 'plains', 'hills', 'forest'])
    CFG_PATH.write_text(json.dumps(cfg, indent=2, sort_keys=True))
    print('seeded tools/map-config.json — edit the terrain table and re-run to repaint')
assign = cfg['terrain']
for i in land_ids: assert assign.get(i) in BIOMES, f'map-config.json: {i} needs a terrain in {BIOMES}'

def biome_masks_for(mask_img):
    mask_np = np.array(mask_img) > 128
    ax = np.array([P(*pos[i])[0] for i in land_ids]); ay = np.array([P(*pos[i])[1] for i in land_ids])
    yy, xx = np.mgrid[0:H, 0:W]
    best_d = np.full((H, W), 1e18); best_i = np.zeros((H, W), dtype=np.int16)
    for k in range(len(land_ids)):
        dd = (xx - ax[k]) ** 2 + (yy - ay[k]) ** 2
        upd = dd < best_d; best_d[upd] = dd[upd]; best_i[upd] = k
    bmap = np.zeros((H, W), dtype=np.int16)
    for k, rid in enumerate(land_ids): bmap[best_i == k] = BIOMES.index(assign[rid])
    warp = np.array(octave_noise(W, H, [(90, .6), (25, .4)], seed=77), dtype=np.float32)
    out = {}
    for b in BIOMES:
        hard = Image.fromarray(((bmap == BIOMES.index(b)) & mask_np).astype(np.uint8) * 255, 'L')
        soft = np.array(hard.filter(ImageFilter.GaussianBlur(26)), dtype=np.float32)
        out[b] = Image.fromarray(((soft + (warp - 128) * 0.55) > 110).astype(np.uint8) * 255, 'L')
    return out

# ---------- stamps ----------
def extract_stamps():
    sheet = Image.open(SRC / 'stamps.png').convert('RGB')
    a = np.array(sheet).astype(np.int16)
    sh, sw = a.shape[:2]
    bg = np.median(a[0:40, :, :].reshape(-1, 3), axis=0)
    fg = np.sqrt(((a - bg) ** 2).sum(axis=2)) > 46
    fg[int(sh * 0.45):, :] = False
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    icons = {}
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sizes[i] < 260 or sizes[i] > 70000: continue
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if h < 22 or w < 14 or w > 300 or h / w > 4 or w / h > 4: continue
        crop = a[sl].astype(np.uint8); mm = (lab[sl] == i + 1)
        top_row = int(np.argmax(mm.any(axis=1)))
        top_width = mm[min(top_row + max(1, h // 10), h - 1)].sum()
        ratio = h / max(w, 1)
        k = ('pine' if (ratio > 1.15 and top_width < w * 0.3 and w < 70)
             else 'mountain' if w > 62 else 'hill' if ratio < 0.85 else 'tree')
        alpha = (ndimage.binary_dilation(mm, iterations=1) * 255).astype(np.uint8)
        icons.setdefault(k, []).append(Image.fromarray(np.dstack([crop, alpha]), 'RGBA'))
    return icons

def scatter(out, mask_img, zones, icons, plan, seed=9):
    rng = np.random.default_rng(seed)
    anchor_pts = [P(*pos[r['id']]) for r in regions] + [portpt(p) for p in ports]
    CLEAR = 64 * S
    mp = mask_img.load()
    def ok(x, y):
        if not all((x - a) ** 2 + (y - b) ** 2 > CLEAR * CLEAR for a, b in anchor_pts): return False
        for t in range(8):
            x2, y2 = x + 16 * math.cos(t * math.pi / 4), y + 16 * math.sin(t * math.pi / 4)
            if not (0 <= x2 < W and 0 <= y2 < H) or mp[int(x2), int(y2)] == 0: return False
        return True
    for kinds, biome, count, smin, smax, spacing in plan:
        srcs = sum([icons.get(k, []) for k in kinds], [])
        if not srcs: continue
        zone = zones[biome].load()
        pts, tries = [], 0
        while len(pts) < count and tries < count * 120:
            tries += 1
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            if zone[int(x), int(y)] == 0 or not ok(x, y): continue
            if any((x - a) ** 2 + (y - b) ** 2 < (spacing * S) ** 2 for a, b in pts): continue
            pts.append((x, y))
        for (x, y) in sorted(pts, key=lambda q: q[1]):
            src = srcs[int(rng.integers(0, len(srcs)))]
            sc = float(rng.uniform(smin, smax))
            im = ImageEnhance.Brightness(ImageEnhance.Color(src).enhance(0.72)).enhance(0.97)
            im = im.resize((max(6, int(src.width * sc)), max(6, int(src.height * sc))), Image.LANCZOS)
            if rng.random() < 0.5: im = ImageOps.mirror(im)
            out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height)))

# ---------- barriers (owner request, Jul 2026) ----------
# Terrain that EXPLAINS non-adjacency: visually-close territories that do not
# share an edge get a mountain chain or a river across the corridor between
# their anchors. Geometry from tools/map-config.json; verified non-adjacent
# at build time — a barrier between adjacent regions would be a lie.
def barrier_geometry(a, b):
    ax, ay = P(*pos[a]); bx, by = P(*pos[b])
    mx, my = (ax + bx) / 2, (ay + by) / 2
    dx, dy = bx - ax, by - ay
    n = math.hypot(dx, dy) or 1
    px, py = -dy / n, dx / n                      # perpendicular: the wall line
    L = min(max(n * 0.55, 120 * S), 300 * S) / 2
    return mx, my, px, py, L

def check_barriers():
    adj = {tuple(sorted(e)) for e in map(tuple, edges)}
    for bar in cfg.get('barriers', []):
        assert tuple(sorted((bar['a'], bar['b']))) not in adj,             f"barrier {bar['a']}|{bar['b']}: regions ARE adjacent — remove the barrier or the edge"
        assert bar['a'] in pos and bar['b'] in pos, f"barrier names unknown region: {bar}"

def river_layer(mask_img, style):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    rng = np.random.default_rng(31)
    for bar in cfg.get('barriers', []):
        if bar['type'] != 'river': continue
        mx, my, px, py, L = barrier_geometry(bar['a'], bar['b'])
        dx, dy = py, -px                          # along-flow direction for the wiggle
        pts = []
        steps = max(8, int(L / (9 * S)))
        for i in range(-steps, steps + 1):
            t = i / steps * L
            wig = math.sin(i * 0.9) * 7 * S + float(rng.uniform(-2.5, 2.5)) * S
            pts.append((mx + px * t + dx * wig, my + py * t + dy * wig))
        for width, col in style:
            ld.line(pts, fill=col, width=int(width * S), joint='curve')
    # rivers exist on LAND only
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'), mask_img))
    return layer

def mountain_barriers_stamps(out, mask_img, icons):
    rng = np.random.default_rng(37)
    mp = mask_img.load()
    srcs = icons.get('mountain', []) or icons.get('hill', [])
    if not srcs: return
    for bar in cfg.get('barriers', []):
        if bar['type'] != 'mountains': continue
        mx, my, px, py, L = barrier_geometry(bar['a'], bar['b'])
        # Dense, larger, slightly staggered: the chain must read as a WALL,
        # not blend into the ambient scatter — it encodes "not adjacent".
        n_st = max(5, int(L / (12 * S)))
        placed = []
        for i in range(-n_st, n_st + 1):
            t = i / n_st * L * 0.95
            stag = (8 if i % 2 else -8)
            x = mx + px * t + (stag + float(rng.uniform(-4, 4))) * S * 0.4
            y = my + py * t + (stag + float(rng.uniform(-4, 4))) * S * 0.4
            if not (0 <= x < W and 0 <= y < H) or mp[int(x), int(y)] == 0: continue
            placed.append((x, y))
        for (x, y) in sorted(placed, key=lambda q: q[1]):
            src = srcs[int(rng.integers(0, len(srcs)))]
            sc = float(rng.uniform(0.36, 0.52))
            im = ImageEnhance.Brightness(ImageEnhance.Color(src).enhance(0.72)).enhance(0.97)
            im = im.resize((max(6, int(src.width * sc)), max(6, int(src.height * sc))), Image.LANCZOS)
            if rng.random() < 0.5: im = ImageOps.mirror(im)
            out.alpha_composite(im, (int(x - im.width / 2), int(y - im.height)))

def mountain_barriers_ridges(out, mask_img):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    rng = np.random.default_rng(37)
    mp = mask_img.load()
    for bar in cfg.get('barriers', []):
        if bar['type'] != 'mountains': continue
        mx, my, px, py, L = barrier_geometry(bar['a'], bar['b'])
        n_st = max(5, int(L / (13 * S)))
        for i in range(-n_st, n_st + 1):
            t = i / n_st * L * 0.92
            x = mx + px * t + float(rng.uniform(-5, 5)) * S
            y = my + py * t + float(rng.uniform(-5, 5)) * S
            if not (0 <= x < W and 0 <= y < H) or mp[int(x), int(y)] == 0: continue
            w = float(rng.uniform(8, 12)) * S; h = w * 0.62
            ld.line([(x - w / 2, y), (x, y - h), (x + w / 2, y)],
                    fill=(150, 158, 166, 235), width=int(2.1 * S), joint='curve')
    out.alpha_composite(layer)

# ---------- shared finish ----------
def coast_and_vignette(out, m, ink_rgb, vig_rgb):
    coast = ImageChops.subtract(m.filter(ImageFilter.MaxFilter(5)), m.filter(ImageFilter.MinFilter(5))).filter(ImageFilter.GaussianBlur(1.2))
    ink = ImageOps.colorize(Image.new('L', (W, H), 255), black=(0, 0, 0), white=ink_rgb)
    out = Image.composite(ink, out, coast.point(lambda v: min(int(v * 1.1), 200)))
    inner = ImageChops.subtract(m, m.filter(ImageFilter.MinFilter(31))).filter(ImageFilter.GaussianBlur(9))
    out = ImageChops.subtract(out, ImageOps.colorize(inner, black=(0, 0, 0), white=(20, 17, 11)).convert('RGB'))
    vig = Image.new('L', (W, H), 0); vd = ImageDraw.Draw(vig)
    vd.rectangle([0, 0, W, H], fill=44)
    vd.ellipse([-W * 0.25, -H * 0.18, W * 1.25, H * 1.18], fill=0)
    return ImageChops.subtract(out, ImageOps.colorize(vig.filter(ImageFilter.GaussianBlur(160)), black=(0, 0, 0), white=vig_rgb).convert('RGB'))

def waterline(m, alphas):
    rings = Image.new('L', (W, H), 0); grow = m.copy()
    for a in alphas:
        grow = grow.filter(ImageFilter.MaxFilter(15))
        rings = ImageChops.add(rings, ImageChops.subtract(grow, grow.filter(ImageFilter.MinFilter(7))).point(lambda v, aa=a: aa if v > 40 else 0))
    return rings

def save_webp(img, path):
    for q in (82, 74, 66, 58, 50, 42):
        buf = io.BytesIO(); img.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= BUDGET_KB * 1024:
            path.write_bytes(buf.getvalue())
            print(f'{path.name}: q={q}, {buf.tell() // 1024} KB')
            return
    path.write_bytes(buf.getvalue())
    print(f'{path.name}: q={q} STILL {buf.tell() // 1024} KB > budget — raise --budget-kb or shrink')

# ---------- themes ----------
def render_asoiaf(m, zones, icons):
    base = ImageOps.colorize(tiled_L(SRC / 'tex-parchment.png', 0.85), black=(198, 182, 146), white=(240, 230, 202), mid=(221, 207, 172))
    GRAIN = {'plains': ('tex-grass.png', 0.62, (214, 210, 152), (188, 186, 122)),
             'hills': ('tex-grass.png', 0.5, (206, 192, 140), (180, 166, 114)),
             'forest': ('tex-forest.png', 0.55, (152, 170, 124), (108, 134, 90)),
             'mountain': ('tex-rock.png', 0.55, (178, 174, 166), (140, 137, 132)),
             'tundra': ('tex-rock.png', 0.75, (220, 222, 218), (194, 198, 200))}
    land = base.copy()
    for b, (sw, sc, lo, hi) in GRAIN.items():
        tex = ImageOps.colorize(tiled_L(SRC / sw, sc), black=hi, white=(252, 250, 244), mid=lo)
        land = Image.composite(ImageChops.multiply(base, tex), land, zones[b].filter(ImageFilter.GaussianBlur(7)))
    relief = m.filter(ImageFilter.GaussianBlur(30)).filter(ImageFilter.EMBOSS).filter(ImageFilter.GaussianBlur(4))
    land = ImageChops.multiply(land, ImageOps.colorize(relief, black=(162, 154, 138), white=(255, 255, 255)).convert('RGB'))
    sea = ImageOps.colorize(tiled_L(SRC / 'tex-sea.png', 0.7), black=(20, 22, 26), white=(72, 82, 88), mid=(42, 50, 55))
    # Break up the tile repeat (owner note: the swatch's shoal patches echo):
    # a second, mirrored, differently-scaled pass at half strength decorrelates
    # the pattern without losing the wave grain.
    sea2 = ImageOps.colorize(ImageOps.mirror(tiled_L(SRC / 'tex-sea.png', 0.47)), black=(20, 22, 26), white=(72, 82, 88), mid=(42, 50, 55))
    sea = Image.blend(sea, sea2, 0.45)
    sea = Image.composite(ImageOps.colorize(Image.new('L', (W, H), 255), black=(0, 0, 0), white=(206, 188, 142)), sea, waterline(m, [56, 38, 24, 14]).point(lambda v: min(v, 46)))
    out = Image.composite(land, sea, m).convert('RGBA')
    scatter(out, m, zones, icons, [
        (['mountain'], 'mountain', 40, 0.42, 0.72, 40),
        (['pine', 'tree'], 'forest', 150, 0.22, 0.36, 17),
        (['hill', 'tree'], 'hills', 34, 0.3, 0.45, 26),
        (['pine'], 'tundra', 16, 0.18, 0.28, 30)])
    out.alpha_composite(river_layer(m, [(7.5, (46, 38, 24, 255)), (4.2, (58, 74, 84, 255)), (2.0, (96, 120, 128, 255))]))
    mountain_barriers_stamps(out, m, icons)
    return coast_and_vignette(out.convert('RGB'), m, (58, 46, 30), (34, 30, 22))

def render_2026(m, zones):
    # Fully procedural: carbon land relief, cold biome washes, topo-ring sea.
    base = ImageOps.colorize(octave_noise(W, H, [(300, .45), (70, .3), (16, .2)], seed=13), black=(30, 36, 42), white=(58, 68, 76), mid=(43, 51, 58))
    TINT = {'plains': (52, 60, 54), 'hills': (50, 56, 50), 'forest': (40, 54, 46),
            'mountain': (58, 62, 66), 'tundra': (66, 72, 76)}
    land = base.copy()
    for b, rgb in TINT.items():
        wash = ImageChops.multiply(base, Image.new('RGB', (W, H), tuple(min(255, c + 150) for c in rgb)))
        land = Image.composite(wash, land, zones[b].filter(ImageFilter.GaussianBlur(9)))
    ridges = octave_noise(W, H, [(46, .55), (12, .45)], seed=5).filter(ImageFilter.EMBOSS).filter(ImageFilter.GaussianBlur(1.4))
    land = ImageChops.multiply(land, ImageOps.colorize(ridges, black=(150, 152, 156), white=(255, 255, 255)).convert('RGB'))
    sea = ImageOps.colorize(octave_noise(W, H, [(240, .5), (60, .25)], seed=3), black=(7, 10, 13), white=(17, 24, 30), mid=(11, 16, 21))
    glow = waterline(m, [64, 40, 24, 12, 6])
    sea = Image.composite(ImageOps.colorize(Image.new('L', (W, H), 255), black=(0, 0, 0), white=(95, 174, 205)), sea, glow.point(lambda v: min(v, 44)))
    out = Image.composite(land, sea, m).convert('RGBA')
    out.alpha_composite(river_layer(m, [(7, (5, 8, 11, 255)), (3.8, (38, 74, 96, 255)), (1.8, (95, 174, 205, 220))]))
    mountain_barriers_ridges(out, m)
    return coast_and_vignette(out.convert('RGB'), m, (95, 174, 205), (10, 12, 14))

# ---------- run ----------
mask = build_mask()
fails = verify(mask)
if fails:
    print('GEOMETRY FAILS:', '; '.join(fails)); sys.exit(1)
print(f'geometry verified: {len(land_ids)} land ({len(islands)} islands), {len(sea_ids)} seas, {len(ports)} harbors')
check_barriers()
zones = biome_masks_for(mask)
icons = extract_stamps()
print('stamps:', {k: len(v) for k, v in icons.items()})
save_webp(render_asoiaf(mask, zones, icons), ASSETS / 'map-asoiaf.webp')
save_webp(render_2026(mask, zones), ASSETS / 'map-2026.webp')
cv = {'x': OX, 'y': OY, 'w': round(W / S), 'h': round(H / S)}
print('theme canvas block (map units):', json.dumps(cv))
