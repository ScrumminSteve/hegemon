#!/usr/bin/env node
// Heuristic-vs-random tournament (M3.b strength proof).
//
//   node tools/tournament.mjs [games=12] [seed0=7000]
//
// One heuristic seat (rotating across factions so no seat bias survives)
// against five random-legal seats. Reports win rate and mean finishing rank
// for both policies. The M3.d eval harness generalizes this; for M3.b it is
// the headline number that says the heuristic actually wants to win.

import { playGame } from './selfplay.mjs';

const [games = 12, seed0 = 7000] = process.argv.slice(2).map(Number);

let hWins = 0, hRankSum = 0, rRankSum = 0, rSeats = 0;
const t0 = Date.now();

for (let i = 0; i < games; i++) {
  const seed = seed0 + i, botSeed = seed * 31 + 7;
  const hSeat = i % 6; // rotate the heuristic through every faction
  const mix = Array.from({ length: 6 }, (_, k) => (k === hSeat ? 'h' : 'r')).join(',');
  const { state: s } = playGame(seed, botSeed, 6, mix);
  const over = s.log.filter(e => e.event === 'gameOver').pop();
  const standings = over.standings;
  const hero = s.factions[hSeat];
  const hRank = standings.indexOf(hero) + 1;
  hRankSum += hRank;
  if (standings[0] === hero) hWins++;
  for (const f of s.factions) {
    if (f !== hero) { rRankSum += standings.indexOf(f) + 1; rSeats++; }
  }
  console.log(`seed ${seed}: heuristic=${hero} (seat ${hSeat + 1}) rank ${hRank}/6, winner ${standings[0]}${over.reason ? ` (${over.reason})` : ''}`);
}

const expected = 3.5; // uniform-rank baseline in a 6-seat game
console.log(`\n${games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`heuristic: ${hWins}/${games} wins (${(100 * hWins / games).toFixed(0)}%), mean rank ${(hRankSum / games).toFixed(2)} (uniform baseline ${expected})`);
console.log(`random   : mean rank ${(rRankSum / rSeats).toFixed(2)} across ${rSeats} seats`);
