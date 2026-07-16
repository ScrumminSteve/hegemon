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
  { id: 'L01', kind: 'land', x: 462, y: 198,  muster: 2, supply: 1, coin: 1, home: 'F1' },
  { id: 'L02', kind: 'land', x: 693, y: 165,  muster: 0, supply: 0, coin: 1 },
  { id: 'L03', kind: 'land', x: 292, y: 264,  muster: 0, supply: 1, coin: 0 },
  { id: 'L04', kind: 'land', x: 622, y: 303,  muster: 1, supply: 0, coin: 0 },
  { id: 'L05', kind: 'land', x: 787, y: 314,  muster: 0, supply: 1, coin: 0 },
  { id: 'L06', kind: 'land', x: 274, y: 412,  muster: 1, supply: 0, coin: 0 },
  { id: 'L07', kind: 'land', x: 498, y: 398,  muster: 1, supply: 0, coin: 0 },
  { id: 'L08', kind: 'land', x: 377, y: 484,  muster: 0, supply: 1, coin: 0 },
  { id: 'L09', kind: 'land', x: 591, y: 504,  muster: 0, supply: 0, coin: 1 },
  { id: 'L10', kind: 'land', x: 495, y: 565,  muster: 2, supply: 1, coin: 0 },
  { id: 'L11', kind: 'land', x: 787, y: 460,  muster: 0, supply: 1, coin: 0 },
  { id: 'L12', kind: 'land', x: 694, y: 569,  muster: 0, supply: 1, coin: 0 },
  { id: 'L13', kind: 'land', x: 838, y: 657,  muster: 1, supply: 1, coin: 1 },
  { id: 'L14', kind: 'land', x: 418, y: 665,  muster: 2, supply: 1, coin: 1 },
  { id: 'L15', kind: 'land', x: 571, y: 693,  muster: 1, supply: 0, coin: 1 },
  { id: 'L16', kind: 'land', x: 483, y: 788,  muster: 0, supply: 0, coin: 1 },
  { id: 'L17', kind: 'land', x: 576, y: 839,  muster: 0, supply: 2, coin: 0 },
  { id: 'L18', kind: 'land', x: 732, y: 741,  muster: 1, supply: 0, coin: 0 },
  { id: 'L19', kind: 'land', x: 682, y: 870,  muster: 2, supply: 0, coin: 2 },
  { id: 'L20', kind: 'land', x: 722, y: 996,  muster: 0, supply: 1, coin: 1 },
  { id: 'L21', kind: 'land', x: 821, y: 1077,  muster: 1, supply: 0, coin: 0 },
  { id: 'L22', kind: 'land', x: 931, y: 774,  muster: 2, supply: 1, coin: 1, home: 'F3', garrison: 2 },
  { id: 'L23', kind: 'land', x: 695, y: 1164, muster: 0, supply: 0, coin: 1 },
  { id: 'L24', kind: 'land', x: 573, y: 1227, muster: 0, supply: 1, coin: 1 },
  { id: 'L25', kind: 'land', x: 452, y: 1346, muster: 1, supply: 1, coin: 0 },
  { id: 'L26', kind: 'land', x: 677, y: 1306, muster: 1, supply: 0, coin: 0 },
  { id: 'L27', kind: 'land', x: 748, y: 1430, muster: 0, supply: 1, coin: 0 },
  { id: 'L28', kind: 'land', x: 888, y: 1375, muster: 2, supply: 1, coin: 1, home: 'F5', garrison: 2 },
  { id: 'L29', kind: 'land', x: 555, y: 986,  muster: 1, supply: 0, coin: 0 },
  { id: 'L30', kind: 'land', x: 354, y: 1110, muster: 2, supply: 2, coin: 0, home: 'F4', garrison: 2 },
  { id: 'L31', kind: 'land', x: 270, y: 1244, muster: 2, supply: 0, coin: 0 },
  { id: 'L32', kind: 'land', x: 347, y: 1369, muster: 0, supply: 1, coin: 0 },
  { id: 'L33', kind: 'land', x: 461, y: 1108, muster: 0, supply: 0, coin: 1 },
  { id: 'L34', kind: 'land', x: 297, y: 982,  muster: 0, supply: 1, coin: 0 },
  { id: 'L35', kind: 'land', x: 127, y: 1483, muster: 0, supply: 0, coin: 1 },
  { id: 'L36', kind: 'land', x: 330, y: 847,  muster: 2, supply: 2, coin: 0, home: 'F2', garrison: 2 },
  { id: 'L37', kind: 'land', x: 234, y: 538,  muster: 2, supply: 1, coin: 1, home: 'F6', garrison: 2 },
  { id: 'L38', kind: 'land', x: 556, y: 83,   muster: 0, supply: 0, coin: 1 },

  // ---- Maritime ----
  { id: 'S01', kind: 'maritime', x: 182, y: 143 },
  { id: 'S02', kind: 'maritime', x: 880, y: 143 },
  { id: 'S03', kind: 'maritime', x: 930, y: 528 },
  { id: 'S04', kind: 'maritime', x: 941, y: 979 },
  { id: 'S05', kind: 'maritime', x: 784, y: 1285 },
  { id: 'S06', kind: 'maritime', x: 946, y: 1507 },
  { id: 'S07', kind: 'maritime', x: 418, y: 1530 },
  { id: 'S08', kind: 'maritime', x: 240, y: 1373 },
  { id: 'S09', kind: 'maritime', x: 105,  y: 770 },
  { id: 'S10', kind: 'maritime', x: 187, y: 946 },
  { id: 'S11', kind: 'maritime', x: 320, y: 615 },
  { id: 'S12', kind: 'maritime', x: 836, y: 827 },
];

// Ports: sub-areas joining one land region and one maritime region.
export const PORTS = [
  { id: 'P01', kind: 'port', landId: 'L01', seaId: 'S01' },
  { id: 'P02', kind: 'port', landId: 'L04', seaId: 'S03' },
  { id: 'P03', kind: 'port', landId: 'L37', seaId: 'S11' },
  { id: 'P04', kind: 'port', landId: 'L36', seaId: 'S10' },
  { id: 'P05', kind: 'port', landId: 'L31', seaId: 'S08' },
  { id: 'P06', kind: 'port', landId: 'L28', seaId: 'S06' },
  { id: 'P07', kind: 'port', landId: 'L21', seaId: 'S04' },
  { id: 'P08', kind: 'port', landId: 'L22', seaId: 'S04' },
];

// Undirected adjacency. ⚠ DRAFT — validate every edge (see README).
export const EDGES = [
  // land–land
  ['L01','L02'], ['L01','L03'], ['L01','L04'], ['L01','L07'], ['L01','L38'],
  ['L04','L05'], ['L04','L07'],
  ['L06','L08'], ['L07','L08'], ['L07','L09'], ['L07','L10'], ['L08','L10'],
  ['L09','L10'], ['L09','L11'], ['L09','L12'], ['L10','L14'], ['L11','L12'],
  ['L12','L13'], ['L12','L18'], ['L14','L15'],
  ['L14','L16'], ['L14','L36'], ['L15','L16'], ['L15','L17'],
  ['L15','L18'], ['L16','L17'], ['L16','L34'], ['L16','L36'],
  ['L17','L18'], ['L17','L19'], ['L17','L29'], ['L17','L34'],
  ['L18','L19'], ['L19','L20'], ['L19','L29'],
  ['L20','L21'], ['L20','L23'], ['L20','L29'],
  ['L21','L23'], ['L23','L24'], ['L23','L26'], ['L23','L29'], ['L23','L33'],
  ['L24','L25'], ['L24','L26'], ['L24','L32'], ['L24','L33'], ['L25','L26'],
  ['L25','L27'], ['L26','L27'], ['L26','L28'], ['L27','L28'],
  ['L29','L30'], ['L29','L33'], ['L29','L34'], ['L30','L31'],
  ['L30','L33'], ['L30','L34'], ['L31','L32'], ['L31','L33'], ['L32','L33'],
  ['L34','L36'],
  ['L38','L02'],
  // land–maritime (coastlines)
  ['S01','L38'], ['S02','L38'],
  ['S01','L01'], ['S01','L03'], ['S01','L06'], ['S01','L08'],
  ['S02','L02'], ['S02','L05'], ['S02','L01'], ['S02','L04'],
  ['S03','L04'], ['S03','L05'], ['S03','L07'], ['S03','L09'], 
  ['S03','L11'], ['S03','L12'], ['S03','L13'], ['S03','L18'],
  ['S04','L18'], ['S04','L20'], ['S04','L21'], ['S04','L22'],
  ['S05','L21'], ['S05','L26'], ['S05','L23'], ['S05','L28'],
  ['S06','L21'], ['S06','L25'], ['S06','L27'], ['S06','L28'],
  ['S07','L25'], ['S07','L30'], ['S07','L32'], ['S07','L34'],
  ['S08','L30'], ['S08','L31'], ['S08','L32'], ['S08','L35'],
  ['S07','L35'], // owner finding Jul 2026: Bordeaux borders The Mediterranean
  ['S09','L06'], ['S09','L34'],
  ['S10','L14'], ['S10','L34'], ['S10','L36'],
  ['S11','L06'], ['S11','L08'], ['S11','L10'], ['S11','L14'], ['S11','L37'],
  ['S12','L18'], ['S12','L19'], ['S12','L20'],
  // maritime–maritime
  ['S01','S09'], ['S02','S03'], ['S03','S04'], ['S04','S06'],
  ['S04','S12'], ['S05','S06'], ['S06','S07'], ['S07','S08'],
  ['S07','S09'], ['S09','S10'], ['S09','S11'],
  ['S10','S11'],
];

export function buildAdjacency() {
  const adj = {};
  for (const r of [...REGIONS, ...PORTS]) adj[r.id] = new Set();
  for (const [a, b] of EDGES) { adj[a].add(b); adj[b].add(a); }
  for (const p of PORTS) {
    // SYMMETRIC (owner finding, Jul 2026): the sea and land must know their
    // port too — the one-way version silently hid every sea->port march and
    // kept harbor support orders out of sea battles (combat's port-support
    // guard existed but could never fire).
    adj[p.id].add(p.landId); adj[p.id].add(p.seaId);
    adj[p.landId].add(p.id); adj[p.seaId].add(p.id);
  }
  return adj;
}
