// Random-legal agent (M3.a) — the parity baseline.
//
// Interface contract for ALL agents: decide(view, query, menu, rng) → action.
// The agent sees ONLY the redacted view (viewFor output) plus the menu the
// engine computed from true state — the same information a human gets from
// the UI. Agents never import state. The random agent ignores even the view:
// its whole job is to walk every corridor of the rules at uniform random and
// let the zero-rejection fuzz prove the corridors are sound.

export function createRandomAgent() {
  return {
    id: 'random-v1',
    decide(view, query, menu, rng) {
      return menu[Math.floor(rng() * menu.length)];
    },
  };
}

/** Deterministic bot RNG — SEPARATE stream from the game seed (M3 design):
    changing bot policy must never perturb game-side randomness, and episodes
    record both seeds for exact replay. */
export function botRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
