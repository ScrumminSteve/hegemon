// HEGEMON base map — IP-NEUTRAL DATA. Display names live in theme packs, keyed by id.
//
// ⚠ DRAFT STATUS (M0 exit criteria in README):
//   1. EDGES (adjacency) are best-effort and MUST be validated against the reference
//      board using the hover highlighter in the viewer, then corrected here.
//   2. muster/supply/coin values per region are best-effort DRAFT — audit required.
//
// kind: 'land' | 'maritime' | 'port'
// muster: 0 none, 1 fort, 2 citadel      supply/coin: icon counts
// home: faction id whose home seat this is
// x,y: layout coordinates on a 1000 x 1460 canvas (viewer only; engine ignores)

export const REGIONS = [
  // ---- Land ----
  { id: 'L01', kind: 'land', x: 420, y: 180,  muster: 2, supply: 1, coin: 1, home: 'F1' },
  { id: 'L02', kind: 'land', x: 630, y: 150,  muster: 0, supply: 0, coin: 1 },
  { id: 'L03', kind: 'land', x: 265, y: 240,  muster: 0, supply: 1, coin: 0 },
  { id: 'L04', kind: 'land', x: 565, y: 275,  muster: 1, supply: 0, coin: 0 },
  { id: 'L05', kind: 'land', x: 715, y: 285,  muster: 0, supply: 1, coin: 0 },
  { id: 'L06', kind: 'land', x: 245, y: 385,  muster: 1, supply: 0, coin: 0 },
  { id: 'L07', kind: 'land', x: 460, y: 365,  muster: 1, supply: 0, coin: 0 },
  { id: 'L08', kind: 'land', x: 350, y: 445,  muster: 0, supply: 1, coin: 0 },
  { id: 'L09', kind: 'land', x: 530, y: 455,  muster: 0, supply: 0, coin: 1 },
  { id: 'L10', kind: 'land', x: 425, y: 525,  muster: 1, supply: 1, coin: 0 },
  { id: 'L11', kind: 'land', x: 705, y: 425,  muster: 0, supply: 1, coin: 0 },
  { id: 'L12', kind: 'land', x: 645, y: 525,  muster: 0, supply: 1, coin: 0 },
  { id: 'L13', kind: 'land', x: 720, y: 600,  muster: 1, supply: 0, coin: 1 },
  { id: 'L14', kind: 'land', x: 405, y: 610,  muster: 2, supply: 1, coin: 1 },
  { id: 'L15', kind: 'land', x: 545, y: 620,  muster: 1, supply: 0, coin: 1 },
  { id: 'L16', kind: 'land', x: 430, y: 705,  muster: 0, supply: 0, coin: 1 },
  { id: 'L17', kind: 'land', x: 525, y: 760,  muster: 0, supply: 2, coin: 0 },
  { id: 'L18', kind: 'land', x: 675, y: 685,  muster: 1, supply: 0, coin: 0 },
  { id: 'L19', kind: 'land', x: 635, y: 790,  muster: 2, supply: 0, coin: 2, garrison: 2 },
  { id: 'L20', kind: 'land', x: 660, y: 890,  muster: 0, supply: 1, coin: 1 },
  { id: 'L21', kind: 'land', x: 725, y: 975,  muster: 1, supply: 0, coin: 0 },
  { id: 'L22', kind: 'land', x: 845, y: 705,  muster: 2, supply: 0, coin: 1, home: 'F3', garrison: 2 },
  { id: 'L23', kind: 'land', x: 645, y: 1065, muster: 1, supply: 0, coin: 0 },
  { id: 'L24', kind: 'land', x: 520, y: 1105, muster: 0, supply: 1, coin: 1 },
  { id: 'L25', kind: 'land', x: 405, y: 1225, muster: 1, supply: 1, coin: 0 },
  { id: 'L26', kind: 'land', x: 585, y: 1185, muster: 1, supply: 0, coin: 0 },
  { id: 'L27', kind: 'land', x: 665, y: 1290, muster: 0, supply: 1, coin: 0 },
  { id: 'L28', kind: 'land', x: 790, y: 1245, muster: 2, supply: 1, coin: 1, home: 'F5', garrison: 2 },
  { id: 'L29', kind: 'land', x: 490, y: 910,  muster: 0, supply: 0, coin: 0 },
  { id: 'L30', kind: 'land', x: 350, y: 1005, muster: 2, supply: 2, coin: 0, home: 'F4', garrison: 2 },
  { id: 'L31', kind: 'land', x: 250, y: 1135, muster: 2, supply: 0, coin: 0 },
  { id: 'L32', kind: 'land', x: 305, y: 1240, muster: 0, supply: 1, coin: 0 },
  { id: 'L33', kind: 'land', x: 455, y: 1015, muster: 0, supply: 1, coin: 0 },
  { id: 'L34', kind: 'land', x: 280, y: 900,  muster: 0, supply: 1, coin: 1 },
  { id: 'L35', kind: 'land', x: 150, y: 1330, muster: 0, supply: 1, coin: 0 },
  { id: 'L36', kind: 'land', x: 300, y: 770,  muster: 2, supply: 2, coin: 0, home: 'F2', garrison: 2 },
  { id: 'L37', kind: 'land', x: 225, y: 480,  muster: 2, supply: 1, coin: 1, home: 'F6', garrison: 2 },

  // ---- Maritime ----
  { id: 'S01', kind: 'maritime', x: 165, y: 130 },
  { id: 'S02', kind: 'maritime', x: 800, y: 130 },
  { id: 'S03', kind: 'maritime', x: 845, y: 480 },
  { id: 'S04', kind: 'maritime', x: 855, y: 890 },
  { id: 'S05', kind: 'maritime', x: 705, y: 1165 },
  { id: 'S06', kind: 'maritime', x: 860, y: 1370 },
  { id: 'S07', kind: 'maritime', x: 380, y: 1400 },
  { id: 'S08', kind: 'maritime', x: 195, y: 1265 },
  { id: 'S09', kind: 'maritime', x: 95,  y: 700 },
  { id: 'S10', kind: 'maritime', x: 170, y: 860 },
  { id: 'S11', kind: 'maritime', x: 300, y: 555 },
  { id: 'S12', kind: 'maritime', x: 750, y: 750 },
];

// Ports: sub-areas joining one land region and one maritime region.
export const PORTS = [
  { id: 'P01', kind: 'port', landId: 'L01', seaId: 'S01' },
  { id: 'P02', kind: 'port', landId: 'L04', seaId: 'S03' },
  { id: 'P03', kind: 'port', landId: 'L37', seaId: 'S11' },
  { id: 'P04', kind: 'port', landId: 'L36', seaId: 'S10' },
  { id: 'P05', kind: 'port', landId: 'L31', seaId: 'S08' },
  { id: 'P06', kind: 'port', landId: 'L28', seaId: 'S05' },
  { id: 'P07', kind: 'port', landId: 'L21', seaId: 'S04' },
  { id: 'P08', kind: 'port', landId: 'L22', seaId: 'S04' },
];

// Undirected adjacency. ⚠ DRAFT — validate every edge (see README).
export const EDGES = [
  // land–land
  ['L01','L02'], ['L01','L03'], ['L01','L04'], ['L01','L07'],
  ['L02','L04'], ['L03','L06'], ['L04','L05'], ['L04','L07'],
  ['L06','L08'], ['L07','L08'], ['L07','L09'], ['L08','L10'],
  ['L09','L10'], ['L09','L11'], ['L10','L14'], ['L11','L12'],
  ['L12','L13'], ['L12','L15'], ['L13','L18'], ['L14','L15'],
  ['L14','L16'], ['L14','L36'], ['L15','L16'], ['L15','L17'],
  ['L15','L18'], ['L16','L17'], ['L16','L36'], ['L17','L19'],
  ['L17','L29'], ['L18','L19'], ['L19','L20'], ['L19','L29'],
  ['L20','L21'], ['L21','L23'], ['L23','L24'], ['L23','L26'],
  ['L24','L25'], ['L24','L26'], ['L24','L33'], ['L25','L26'],
  ['L25','L32'], ['L26','L27'], ['L26','L28'], ['L27','L28'],
  ['L29','L30'], ['L29','L33'], ['L29','L34'], ['L30','L31'],
  ['L30','L33'], ['L30','L34'], ['L31','L32'], ['L31','L33'],
  ['L34','L36'],
  // land–maritime (coastlines)
  ['S01','L01'], ['S01','L03'],
  ['S02','L02'], ['S02','L05'], ['S02','L01'],
  ['S03','L04'], ['S03','L05'], ['S03','L11'], ['S03','L13'], ['S03','L18'],
  ['S04','L20'], ['S04','L21'], ['S04','L22'],
  ['S05','L21'], ['S05','L26'], ['S05','L27'], ['S05','L28'],
  ['S06','L27'], ['S06','L28'],
  ['S07','L25'], ['S07','L32'],
  ['S08','L31'], ['S08','L32'], ['S08','L35'],
  ['S09','L03'], ['S09','L06'], ['S09','L34'],
  ['S10','L34'], ['S10','L36'],
  ['S11','L06'], ['S11','L08'], ['S11','L10'], ['S11','L37'],
  ['S12','L18'], ['S12','L19'], ['S12','L20'], ['S12','L22'],
  // maritime–maritime
  ['S01','S09'], ['S02','S03'], ['S03','S04'], ['S04','S06'],
  ['S04','S12'], ['S05','S06'], ['S06','S07'], ['S07','S08'],
  ['S07','S09'], ['S08','S09'], ['S09','S10'], ['S09','S11'],
  ['S10','S11'],
];

export function buildAdjacency() {
  const adj = {};
  for (const r of [...REGIONS, ...PORTS]) adj[r.id] = new Set();
  for (const [a, b] of EDGES) { adj[a].add(b); adj[b].add(a); }
  for (const p of PORTS) { adj[p.id].add(p.landId); adj[p.id].add(p.seaId); }
  return adj;
}
