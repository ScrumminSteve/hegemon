// Dumps the map topology as JSON for tools/build-map.py (single source: map.js).
import { REGIONS, PORTS, EDGES } from '../src/data/map.js';
import { writeFileSync } from 'node:fs';
const xs = REGIONS.map(r => r.x), ys = REGIONS.map(r => r.y);
writeFileSync(new URL('./mapdata.json', import.meta.url), JSON.stringify({
  regions: REGIONS, ports: PORTS, edges: EDGES,
  minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys),
}));
console.log('mapdata.json written');
