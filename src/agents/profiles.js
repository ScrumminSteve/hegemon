// ---------------------------------------------------------------------------
// HUMAN-METHOD OPPONENT POOL v1 (m3e46) — packaged from STRATEGY.md
//
// The owner's interview (Aug 2026) established two doctrines this file
// implements:
//   1. He is a STYLE SWITCHER — blitz (default temperament), crescendo
//      (the patience costume), denial (sea lanes + raids) are personas,
//      each packageable as a fixed opponent profile.
//   2. The PREDATOR-AMONG-PREY theorem: one strong opponent + four weak is
//      HARDER than five strong, because the strong one farms the weak —
//      harder still when composition is hidden. Uniform tables (every gate
//      to date) never test this. The pool seats mixed-strength,
//      hidden-composition tables.
//
// Profiles are OBSTACLES, never objectives (standing doctrine): human play
// enters the machine only as material. Overlays are MULTIPLICATIVE on the
// shipped champion so they inherit every future weight bake for free.
// ---------------------------------------------------------------------------

import { createHeuristicAgent, WEIGHTS, WEIGHTS_M3E, WEIGHTS_V1 } from './heuristic.js';
import { botRng } from './random.js';

/** Merged active default — same merge createHeuristicAgent performs. */
export function championWeights() {
  return { ...WEIGHTS_M3E, ...WEIGHTS };
}

/** Multiply overlay keys onto a base vector; untouched keys pass through. */
export function overlayWeights(base, overlay) {
  const out = { ...base };
  for (const [k, mult] of Object.entries(overlay || {})) {
    out[k] = (out[k] ?? 0) * mult;
  }
  return out;
}

export const PROFILES = Object.freeze({
  // The shipped champion, unmodified — the pool's honest yardstick.
  v3: { desc: 'the shipped champion (WEIGHTS_V3 + M3E), unmodified', overlay: null },

  // The prey. The predator-among-prey environment REQUIRES weak animals:
  // the G1 legacy construction (frozen V1 weights, adjacency-only threat,
  // unguided menus, no book) — the weakest documented bot in the lineage.
  prey: { desc: 'the farm animal: G1 legacy (V1 weights, adjacency-only threat, unguided)', legacy: true },

  // Owner default temperament: "usually I'm more for the rush and kill."
  // Fights sooner, fears overreach less, hungers harder for seats, arms
  // for the counted tie.
  blitz: {
    desc: 'rush-and-kill: early aggression, seat hunger, war-priced bids',
    overlay: {
      mAttackMargin: 1.4, mOverreach: 0.7, mStandDown: 0.5,
      pMarch: 1.3, mSeatHunger: 1.5, bidWarUrgency: 1.5,
    },
  },

  // The patience costume (worn "against strong opponents"): build the army,
  // prize the muster-2 engine, decline bad fights, price the Courier.
  crescendo: {
    desc: 'the patience costume: muster-first, engine seats, no bad fights',
    overlay: {
      muSpend: 1.3, rMusterPoint: 1.3, pRally: 1.2, pDefend: 1.3,
      wCitadelBonus: 1.3, mAttackMargin: 0.8, mOverreach: 1.5,
      bidMusterUrgency: 1.4,
    },
  },

  // The third documented winning arc: sea control and the raiding war —
  // "almost never vacate seas."
  denial: {
    desc: 'sea lanes and raids: warships, tenure, harassment',
    overlay: {
      wSea: 1.6, vWarship: 1.4, mSeaTenure: 1.6,
      pRaid: 1.2, raidHit: 1.3, raidSupport: 1.2,
    },
  },
});

/** Agent-construction options for one named profile. */
export function profileAgentOpts(name) {
  const p = PROFILES[name];
  if (!p) throw new Error(`unknown profile '${name}' — known: ${Object.keys(PROFILES).join(', ')}`);
  if (p.legacy) return { guided: false, weights: { ...WEIGHTS_V1, tTransport: 0, bookBias: 0 } };
  if (!p.overlay) return {};
  return { weights: overlayWeights(championWeights(), p.overlay) };
}

/**
 * Seeded seat assignment: draw one profile per opponent seat from the
 * roster, composition HIDDEN (varies per seed), every roster member
 * guaranteed at least one seat when seats >= roster size.
 */
export function poolAssignment(roster, seed, seats = 5) {
  if (!roster.length) throw new Error('poolAssignment: empty roster');
  const r = botRng((seed >>> 0) * 2654435761 + 97);
  const picks = [];
  // guarantee coverage first, then free draws
  const guaranteed = roster.slice(0, Math.min(roster.length, seats));
  for (const g of guaranteed) picks.push(g);
  while (picks.length < seats) picks.push(roster[Math.floor(r() * roster.length)]);
  // seeded shuffle so the guaranteed block's ORDER is hidden too
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
}

/** Build the agents for one pool game's opponent seats. */
export function poolAgents(roster, seed, seats = 5) {
  return poolAssignment(roster, seed, seats).map(name => ({
    name, agent: createHeuristicAgent(profileAgentOpts(name)),
  }));
}
