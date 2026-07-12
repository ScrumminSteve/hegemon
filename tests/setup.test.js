// Golden tests — M1.a: setup, determinism, serialization, hidden information.
// Test names cite the reference rulebook page or the owner-verified source.

import { createGame, serialize, deserialize, seatsControlled, controllerOf, STAR_ALLOWANCE } from '../src/engine/state.js';
import { viewFor } from '../src/engine/views.js';
import { SETUP } from '../src/data/setup.js';
import { eq, ok, throws } from './assert.js';

export const tests = [

  { name: 'six-seat game deploys every faction exactly per house screens', fn() {
    const g = createGame(6);
    for (const [fid, fs] of Object.entries(SETUP.factions)) {
      for (const [rid, types] of Object.entries(fs.deploy)) {
        const mine = (g.unitsByRegion[rid] || []).filter(u => u.faction === fid).map(u => u.type).sort();
        eq(mine, types.slice().sort(), `${fid} at ${rid}:`);
      }
    }
  }},

  { name: 'starting unit count is 27 across all factions (screens + FAQ v2.0 Lannister port ship)', fn() {
    const g = createGame(6);
    const total = Object.values(g.unitsByRegion).flat().length;
    eq(total, 27, 'total units:');
  }},

  { name: 'influence tracks match screen positions; F3/F6/F2 hold the tokens (Rules p.11)', fn() {
    const g = createGame(6);
    eq(g.tracks.initiative, ['F3','F2','F1','F5','F6','F4'], 'initiative:');
    eq(g.tracks.prowess,    ['F6','F4','F5','F1','F3','F2'], 'prowess:');
    eq(g.tracks.command,    ['F2','F1','F5','F3','F4','F6'], 'command:');
    eq(g.tokens, { sovereign: 'F3', blade: 'F6', courier: 'F2' }, 'dominance tokens:');
  }},

  { name: 'starting supply per screens (F1=1, others=2)', fn() {
    const g = createGame(6);
    eq(g.supply, { F1:1, F2:2, F3:2, F4:2, F5:2, F6:2 }, 'supply:');
  }},

  { name: 'starting authority is 5 for every faction (Rules p.5 step 11)', fn() {
    const g = createGame(6);
    for (const f of g.factions) eq(g.authority[f], 5, `${f} authority:`);
  }},

  { name: 'home garrisons of strength 2 at all six seats (Rules p.26)', fn() {
    const g = createGame(6);
    eq(Object.keys(g.garrisons).sort(), ['L01','L22','L28','L30','L36','L37'], 'garrison regions:');
    for (const gv of Object.values(g.garrisons)) eq(gv.strength, 2, 'garrison strength:');
  }},

  { name: 'the high-mountain seat carries a neutral force of 6 at full seats (owner-verified)', fn() {
    const g = createGame(6);
    eq(g.neutrals['L13'], { strength: 6, insurmountable: false }, 'L13 neutral:');
  }},

  { name: 'round 1 begins in the Planning Phase — Event Phase skipped (Rules p.7)', fn() {
    const g = createGame(6);
    eq(g.round, 1); eq(g.phase, 'planning');
  }},

  { name: 'threat track starts at 2 (Rules p.4 step 2)', fn() {
    eq(createGame(6).threat, 2);
  }},

  { name: 'starting seats: F1 holds 2 (home + fort deployment), all others 1 (derived from owner-audited map)', fn() {
    const g = createGame(6);
    const expect = { F1: 2, F2: 1, F3: 1, F4: 1, F5: 1, F6: 1 };
    for (const f of g.factions) eq(seatsControlled(g, f), expect[f], `${f} seats:`);
  }},

  { name: 'control resolution: units > printed home; empty non-home is uncontrolled (Rules p.24)', fn() {
    const g = createGame(6);
    eq(controllerOf(g, 'L01'), 'F1', 'home seat with units:');
    eq(controllerOf(g, 'L20'), 'F3', 'occupied non-home:');
    eq(controllerOf(g, 'L19'), null, 'empty non-home:');
  }},

  { name: 'six-seat star allowance is 3/3/2/1/0/0 (Rules p.11, board photo)', fn() {
    eq(STAR_ALLOWANCE[6], [3,3,2,1,0,0]);
  }},

  { name: 'state serializes and round-trips losslessly', fn() {
    const g = createGame(6, { seed: 1234 });
    const back = deserialize(serialize(g));
    eq(back, g, 'round-trip:');
  }},

  { name: 'determinism: same seed → identical state', fn() {
    eq(serialize(createGame(6, { seed: 7 })), serialize(createGame(6, { seed: 7 })));
  }},

  { name: 'viewFor masks other factions\' unrevealed orders but not your own (Rules p.27)', fn() {
    const g = createGame(6);
    g.ordersByRegion['L01'] = { faction: 'F1', type: 'march', starred: false };
    g.ordersByRegion['L36'] = { faction: 'F2', type: 'defend', starred: false };
    const v = viewFor(g, 'F1');
    eq(v.ordersByRegion['L01'].type, 'march', 'own order visible:');
    ok(v.ordersByRegion['L36'].hidden === true, 'opponent order masked');
    ok(v.ordersByRegion['L36'].type === undefined, 'opponent order type not leaked');
    ok(v.seed === undefined, 'seed not exposed to clients');
  }},

  { name: 'viewFor shows revealed orders to everyone (Rules p.12 step 2)', fn() {
    const g = createGame(6);
    g.ordersByRegion['L36'] = { faction: 'F2', type: 'defend', starred: false, revealed: true };
    eq(viewFor(g, 'F1').ordersByRegion['L36'].type, 'defend');
  }},

  { name: 'reduced seat counts refuse to start until their data is verified', fn() {
    for (const n of [3, 4, 5]) throws(() => createGame(n), `expected throw for ${n} seats`);
    throws(() => createGame(7), 'expected throw for 7 seats');
  }},

];
