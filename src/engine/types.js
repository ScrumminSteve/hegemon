// HEGEMON engine vocabulary — M1 seed.
// Headless, deterministic, IP-neutral. No DOM. No display strings.
// All display text is resolved by the presentation layer via theme packs.

/** Region kinds. Ports are sub-areas attached to a land region + a maritime region. */
export const RegionKind = Object.freeze({
  LAND: 'land',
  MARITIME: 'maritime',
  PORT: 'port',
});

/** Muster capacity of a region's fortification. */
export const Fortification = Object.freeze({
  NONE: 0,   // no mustering
  FORT: 1,   // musters 1 point
  CITADEL: 2 // musters 2 points
});

/** Unit types. Strength is a function of (unit, state) — never a constant.
 *  BEHEMOTH exists now so expansion content is data, not surgery. */
export const UnitType = Object.freeze({
  INFANTRY: 'infantry',
  CAVALRY: 'cavalry',
  WARSHIP: 'warship',
  SIEGE_ENGINE: 'siege_engine',
  BEHEMOTH: 'behemoth',
});

/** Order tokens placed face-down during the Planning Phase. */
export const OrderType = Object.freeze({
  MARCH: 'march',
  DEFEND: 'defend',
  SUPPORT: 'support',
  RAID: 'raid',
  RALLY: 'rally',      // gain authority / muster (starred)
});

/** Round structure. */
export const Phase = Object.freeze({
  EVENT: 'event',       // draw from Event Decks I–III, resolve, advance threat
  PLANNING: 'planning', // simultaneous hidden order placement
  ACTION: 'action',     // resolve raids, marches, rallies in initiative order
});

/** Influence tracks. */
export const Track = Object.freeze({
  INITIATIVE: 'initiative', // turn order + arbiter of ties (holder: Sovereign Token)
  PROWESS: 'prowess',       // combat ties (holder: Blade Token)
  COMMAND: 'command',       // star-order allowance (holder: Courier Token)
});

/** Dominance tokens, one per track. */
export const TrackToken = Object.freeze({
  SOVEREIGN: 'sovereign',
  BLADE: 'blade',
  COURIER: 'courier',
});

/**
 * @typedef {Object} Region
 * @property {string} id            Stable id, e.g. "L14" | "S03" | "P02"
 * @property {string} kind          RegionKind
 * @property {number} muster        Fortification level (land only)
 * @property {number} supply        Supply icons (land only)
 * @property {number} coin          Coin icons (land only)
 * @property {?string} home         Faction id whose home seat this is
 * @property {?number} garrison     Neutral/home garrison strength
 * @property {?string} landId       (port) attached land region
 * @property {?string} seaId        (port) attached maritime region
 */

/**
 * @typedef {Object} Faction
 * @property {string} id            e.g. "F1"
 * @property {string} homeRegionId
 * @property {string} color         Default hex; themes may override
 * @property {number} seatCount     Player count at which this faction enters play
 */

/**
 * @typedef {Object} GameState
 * @property {number} round
 * @property {string} phase                 Phase
 * @property {Object<string, string[]>} unitsByRegion
 * @property {Object<string, string>} ordersByRegion   Hidden until reveal
 * @property {Object<string, number>} authorityByFaction
 * @property {string[]} initiativeOrder     Faction ids, position 0 holds SOVEREIGN
 * @property {string[]} prowessOrder
 * @property {string[]} commandOrder
 * @property {number} threatLevel           Invader pressure (0..12)
 * @property {number} seedState             PRNG state — determinism requirement
 */

// Contract (M1): applyAction(state, action) -> { state, events, legalActions }
// - Pure function of (state, action). All randomness flows through seedState.
// - Any state must serialize to JSON and round-trip losslessly.
