// HEGEMON engine — state model & setup builder (M1.a).
// Headless, deterministic, IP-neutral. All display strings live in theme packs.
// State is plain JSON: it must round-trip losslessly through serialize/deserialize.

import { REGIONS, PORTS, buildAdjacency } from '../data/map.js';
import { FACTIONS } from '../data/factions.js';
import { SETUP } from '../data/setup.js';
import { HAND_BY_FACTION } from '../data/leaderCards.js';
import { EVENT_DECK_SETS, INVADER_SETS } from '../data/registry.js';
import { shuffle } from './rng.js';
import { Phase } from './types.js';

export const ENGINE_VERSION = 1;

// Star-order allowance per Command-track position (Rules p.11).
// 6-seat values read from the board photo; other counts use the Court overlay
// and are NOT yet verified — hence only 6 is populated.
export const STAR_ALLOWANCE = {
  6: [3, 3, 2, 1, 0, 0],
};

export const DEFAULT_RULESET = Object.freeze({
  id: 'strict',
  leaderCards: true,   // engine-internal: combat-core tests disable to isolate M1.d math
  // Named house-rule/ambiguity flags are minted here as they arise (M1 charter).
});

const regionById = Object.fromEntries([...REGIONS, ...PORTS].map(r => [r.id, r]));
const ADJ = buildAdjacency();

export function adjacency() { return ADJ; }
/**
 * Effective region properties: printed icons merged with any improvement or
 * degradation modifiers in play (MoD-class expansions). ALL rules code that
 * cares about muster/supply/coin values must read through this accessor —
 * never the printed data directly.
 */
export function regionProps(state, id) {
  const r = region(id);
  const mod = state.areaMods?.[id] || {};
  return {
    muster: Math.max(0, (r.muster || 0) + (mod.muster || 0)),
    supply: Math.max(0, (r.supply || 0) + (mod.supply || 0)),
    coin:   Math.max(0, (r.coin   || 0) + (mod.coin   || 0)),
  };
}

export function region(id) { return regionById[id]; }

/**
 * Build the round-1 game state.
 * @param {number} seatCount  Only 6 is supported until reduced-seat data is verified.
 * @param {object} opts       { seed, ruleset }
 */
export function createGame(seatCount = 6, opts = {}) {
  if (!SETUP.seatCounts.includes(seatCount)) {
    throw new Error(`Unsupported seat count: ${seatCount}`);
  }
  if (seatCount !== 6) {
    throw new Error(
      `Seat count ${seatCount} is defined but its neutral-force data is unverified (setup.js); ` +
      `M1 targets 6-seat games.`);
  }

  const variant = SETUP.seatVariants[seatCount];
  const active = FACTIONS.map(f => f.id).filter(id => !variant.excluded.includes(id));

  const unitsByRegion = {};
  const garrisons = {};
  const authority = {};
  const supply = {};

  for (const fid of active) {
    const fs = SETUP.factions[fid];
    for (const [rid, types] of Object.entries(fs.deploy)) {
      if (!regionById[rid]) throw new Error(`Setup deploys ${fid} to unknown region ${rid}`);
      unitsByRegion[rid] = unitsByRegion[rid] || [];
      for (const t of types) unitsByRegion[rid].push({ faction: fid, type: t, routed: false });
    }
    for (const [rid, strength] of Object.entries(fs.garrison)) {
      garrisons[rid] = { faction: fid, strength };
    }
    authority[fid] = SETUP.startingAuthority;
    supply[fid] = fs.supply;
  }

  const neutrals = {};
  const set = variant.neutralSet ? SETUP.neutralForces[variant.neutralSet] : [];
  for (const n of set) {
    if (n.strength == null) throw new Error(`Neutral force at ${n.region} has no transcribed strength`);
    neutrals[n.region] = { strength: n.strength, insurmountable: !!n.insurmountable };
  }

  const trackOrder = (key) =>
    active.slice().sort((a, b) => SETUP.factions[a].tracks[key] - SETUP.factions[b].tracks[key]);

  const tracks = {
    initiative: trackOrder('initiative'),
    prowess: trackOrder('prowess'),
    command: trackOrder('command'),
  };

  const state = {
    version: ENGINE_VERSION,
    // Frozen creation parameters: (config, actionLog) is a complete, exact
    // replay of the game — the substrate for M3.L learning episodes.
    config: { seatCount, seed: opts.seed ?? 42, ruleset: { ...DEFAULT_RULESET, ...(opts.ruleset || {}) },
              scenario: 'base' },
    actionLog: [],
    ruleset: { ...DEFAULT_RULESET, ...(opts.ruleset || {}), seatCount },
    seed: opts.seed ?? 42,
    round: SETUP.firstRound,
    phase: Phase.PLANNING,            // Event Phase is skipped on round 1 (Rules p.7)
    factions: active,
    unitsByRegion,
    garrisons,                        // home-seat defense tokens (Rules p.26)
    neutrals,                         // neutral force tokens (Rules p.26, p.28)
    controlMarkers: {},               // authority tokens left on vacated regions (Rules p.24)
    authority,
    supply,
    tracks,
    tokens: {                         // dominance tokens follow track position 1 (Rules p.11)
      sovereign: tracks.initiative[0],
      blade: tracks.prowess[0],
      courier: tracks.command[0],
    },
    threat: SETUP.threatTrackStart,   // (Rules p.4 step 2)
    roundFlags: { bladeUsed: false }, // once-per-round token uses (Rules p.11)
    areaMods: {},        // improvement/degradation deltas per region (expansion seam)
    privateKnowledge: Object.fromEntries(active.map(f => [f, {}])), // earned secrets,
                         // merged into that faction's view ONLY (M3 AI parity seam)
    scenario: { id: 'base', cardSet: 'base', eventDecks: ['I', 'II', 'III'],
                victory: 'seats', maxRounds: SETUP.maxRounds }, // composition root (expansion seam)
    leaderHands: Object.fromEntries(active.map(f => [f, HAND_BY_FACTION[f].slice()])),
    leaderDiscards: Object.fromEntries(active.map(f => [f, []])),
    eventDecks: null,    // filled below (seeded shuffle)
    invaderDeck: null,
    ordersByRegion: {},               // Planning Phase: { regionId: { faction, type, starred } }
    pendingQueries: [],               // decision stack (drives UI and, later, AI)
    log: [],
  };

  // Seeded event decks + invader deck (M2.a). The whole game's card order is
  // determined here; replays and the Courier's peek come for free.
  const deckSet = EVENT_DECK_SETS[state.scenario.eventDeckSet || 'base'];
  state.eventDecks = {};
  for (const deckId of state.scenario.eventDecks) {
    const ids = deckSet[deckId].flatMap(c => Array(c.count).fill(c.id));
    const r = shuffle(state.seed, ids);
    state.seed = r.seed;
    state.eventDecks[deckId] = { draw: r.value, discard: [] };
  }
  const inv = shuffle(state.seed, Object.keys(INVADER_SETS[state.scenario.invaderSet || 'base']));
  state.seed = inv.seed;
  state.invaderDeck = inv.value;
  return state;
}

/** Which faction controls a region right now (units > control marker > printed home). */
export function controllerOf(state, rid) {
  const units = state.unitsByRegion[rid];
  if (units && units.length) return units[0].faction;
  if (state.controlMarkers[rid]) return state.controlMarkers[rid];
  const r = regionById[rid];
  if (r && r.home && state.factions.includes(r.home)) return r.home;
  return null;
}

/** Fort/citadel regions controlled — the victory metric (Rules p.16). */
export function seatsControlled(state, fid) {
  return REGIONS.filter(r => r.kind === 'land' && r.muster > 0 && controllerOf(state, r.id) === fid).length;
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(json) {
  const s = JSON.parse(json);
  if (s.version !== ENGINE_VERSION) {
    throw new Error(`Save version ${s.version} != engine version ${ENGINE_VERSION}`);
  }
  return s;
}
