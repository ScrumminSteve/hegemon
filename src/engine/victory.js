// HEGEMON engine — Victory, M2.e (Rules p.25; FAQ v2.0 tie-breaker errata).
//
// Two ways a game ends, both owned here:
//   1. INSTANT — the moment a faction controls the seat target (7 fortified
//      regions) during the Action Phase, the game is over on the spot:
//      unresolved orders stay unresolved, pending battles never happen
//      (Rules p.25 "immediately"). The check is gated on settled state —
//      never mid-combat, since the embattled area's controller is transient
//      until casualties and retreat resolve (FAQ).
//   2. ROUNDS — after the final round's clean-up, the standings decide it:
//      most seats; ties by total land areas, then supply, then the higher
//      Initiative-track position (FAQ v2.0, superseding Rules p.16).
//
// Victory MODES dispatch on `state.scenario.victory` (default 'seats') — the
// composition seam banked in the README's expansion-readiness notes. AFFC's
// secret-objective scoring or a points variant is a new entry in VICTORY_MODES
// (per-faction `score`, its own `instantWinner`), not an engine rewrite.

import { seatsControlled, landAreasControlled } from './state.js';
import { SETUP } from '../data/setup.js';

export const VICTORY_MODES = {
  seats: {
    target: state => state.scenario.victoryTarget ?? SETUP.victoryTarget ?? 7,
    /** The faction at the target, else null. Two factions cannot reach it in one settled state. */
    instantWinner(state) {
      const t = this.target(state);
      return state.factions.find(f => seatsControlled(state, f) >= t) ?? null;
    },
    /** Full standings, best first (Rules p.25; FAQ tie-breakers). */
    ranking(state) {
      return state.factions.slice().sort((a, b) =>
        (seatsControlled(state, b) - seatsControlled(state, a)) ||
        (landAreasControlled(state, b) - landAreasControlled(state, a)) ||
        (state.supply[b] - state.supply[a]) ||
        (state.tracks.initiative.indexOf(a) - state.tracks.initiative.indexOf(b)));
    },
  },
  // affc-objectives (M4): secret objective cards, per-faction scoring —
  // masked by viewFor like every other hidden hand.
};

function mode(state) {
  const m = VICTORY_MODES[state.scenario.victory ?? 'seats'];
  if (!m) throw new Error(`Unknown victory mode ${state.scenario.victory}`);
  return m;
}

/**
 * Instant-victory gate, called by the dispatcher after every settled action.
 * Returns the winner if the game just ended, else null. Never fires mid-combat
 * (transient control) or outside the Action Phase (control cannot be GAINED in
 * planning or the Event Phase — mustering only reinforces regions already
 * held, and disbands only vacate).
 */
export function checkInstantVictory(state) {
  if (state.phase !== 'action' || state.combat) return null;
  const w = mode(state).instantWinner(state);
  if (!w) return null;
  endGame(state, { reason: 'seats', winner: w });
  return w;
}

/** End-of-rounds scoring (called by cleanUp after the final round). */
export function endGameByRounds(state) {
  endGame(state, { reason: 'rounds' });
}

function endGame(state, { reason, winner = null }) {
  const m = mode(state);
  const standings = m.ranking(state);
  state.phase = 'gameOver';
  state.winner = winner ?? standings[0];
  // The game ends on the spot: outstanding decisions are void (Rules p.25).
  state.pendingQueries = [];
  state.log.push({ round: state.round, event: 'gameOver', winner: state.winner, reason,
    standings, seats: Object.fromEntries(standings.map(f => [f, seatsControlled(state, f)])) });
}
