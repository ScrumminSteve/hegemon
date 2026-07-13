// Golden tests — theme pack completeness. A theme with a missing key would
// leak raw ids (or worse, ASOIAF names via fallback) into the UI.

import { THEME_CORE } from '../src/themes/core.js';
import { THEME_ASOIAF } from '../src/themes/asoiaf.js';
import { THEME_2026 } from '../src/themes/modern2026.js';
import { LEADER_CARDS } from '../src/data/leaderCards.js';
import { REGIONS } from '../src/data/map.js';
import { eq, ok } from './assert.js';

const PACKS = { asoiaf: THEME_ASOIAF, modern2026: THEME_2026 };

export const tests = [

  { name: 'every theme pack mirrors the core key space exactly (terms, factions, events, cards, regions)', fn() {
    for (const [id, pack] of Object.entries(PACKS)) {
      for (const section of ['terms', 'factions', 'eventCards', 'cards', 'regions']) {
        const want = Object.keys(THEME_CORE[section]).sort();
        const got = Object.keys(pack[section]).sort();
        eq(got, want, `${id}.${section} keys:`);
      }
      ok(pack.id && pack.title, `${id} has identity`);
    }
  }},

  { name: 'theme card names cover all 42 leader cards; region names cover the whole map', fn() {
    for (const [id, pack] of Object.entries(PACKS)) {
      for (const cid of Object.keys(LEADER_CARDS)) {
        ok(typeof pack.cards[cid] === 'string' && pack.cards[cid].length > 0, `${id} names ${cid}`);
      }
      for (const r of REGIONS) {
        if (r.kind === 'port') continue; // ports auto-label from their land
        ok(typeof pack.regions[r.id] === 'string' && pack.regions[r.id].length > 0, `${id} names ${r.id}`);
      }
      const names = Object.values(pack.cards);
      eq(new Set(names).size, names.length, `${id} card names are unique:`);
    }
  }},

];
