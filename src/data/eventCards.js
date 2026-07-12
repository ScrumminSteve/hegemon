// HEGEMON event decks (I–III) — IP-NEUTRAL DATA transcribed from the owner's
// card-reference photo (Jul 2026). Names live in theme packs.
//
// effect: mechanical descriptor consumed by the M2 event engine.
//   muster            — every faction musters at its forts/citadels, initiative order
//   supplyUpdate      — recalc supply positions from board icons, then reconcile armies
//   collectAuthority  — 1 authority per coin icon controlled + 1 per friendly
//                       occupied harbor with no enemy warships in the adjacent sea
//   bidTracks         — clear all three influence tracks; bid per track, initiative first
//   incursion         — invaders attack at current threat strength; all factions bid
//   banOrder          — the named order class cannot be assigned next Planning Phase
//   holderChoice      — the named token's holder picks one of the listed effects
//   nothing           — no effect
//   reshuffle         — shuffle this deck (this card included), draw again, repeat if redrawn
//
// count: copies per deck — OWNER-VERIFIED against deck photos (Jul 2026).
// threatIcon: whether this card bears the invader icon that advances the
//   threat track on reveal — read directly off the photographed card faces.

export const EVENT_DECKS = {
  I: [
    { id: 'E1-muster',   effect: { type: 'muster' },        count: 3, threatIcon: false },
    { id: 'E1-supply',   effect: { type: 'supplyUpdate' },  count: 3, threatIcon: false },
    { id: 'E1-choice',   effect: { type: 'holderChoice', token: 'sovereign',
                                    options: ['muster', 'supplyUpdate', 'nothing'] },
                          count: 2, threatIcon: true },
    { id: 'E1-nothing',  effect: { type: 'nothing' },       count: 1, threatIcon: true },
    { id: 'E1-shuffle',  effect: { type: 'reshuffle' },     count: 1, threatIcon: false },
  ],
  II: [
    { id: 'E2-bid',      effect: { type: 'bidTracks' },        count: 3, threatIcon: false },
    { id: 'E2-collect',  effect: { type: 'collectAuthority' }, count: 3, threatIcon: false },
    { id: 'E2-choice',   effect: { type: 'holderChoice', token: 'courier',
                                    options: ['bidTracks', 'collectAuthority', 'nothing'] },
                          count: 2, threatIcon: true },
    { id: 'E2-nothing',  effect: { type: 'nothing' },          count: 1, threatIcon: true },
    { id: 'E2-shuffle',  effect: { type: 'reshuffle' },        count: 1, threatIcon: false },
  ],
  III: [
    { id: 'E3-incursion',   effect: { type: 'incursion' },                 count: 3, threatIcon: false },
    { id: 'E3-banMarchUp',  effect: { type: 'banOrder', order: 'marchPlusOne' }, count: 1, threatIcon: true },
    { id: 'E3-banDefend',   effect: { type: 'banOrder', order: 'defend' },  count: 1, threatIcon: true },
    { id: 'E3-banRaid',     effect: { type: 'banOrder', order: 'raid' },    count: 1, threatIcon: true },
    { id: 'E3-banRally',    effect: { type: 'banOrder', order: 'rally' },   count: 1, threatIcon: true },
    { id: 'E3-banSupport',  effect: { type: 'banOrder', order: 'support' }, count: 1, threatIcon: true },
    { id: 'E3-choice',      effect: { type: 'holderChoice', token: 'blade',
                                       options: ['banOrder:marchPlusOne', 'banOrder:defend', 'nothing'] },
                             count: 2, threatIcon: false },
  ],
};

// Incursion resolution constants (Rules pp.22–23 + FAQ v2.0).
export const INCURSION_RULES = Object.freeze({
  maxThreat: 12,                 // reaching 12 triggers an immediate incursion
  defenderWinReset: 0,           // defender victory: threat token to 0
  invaderWinSetback: 2,          // invader victory: token back 2 (min 0)
  buryUsedCard: 'bottomOfDeck',  // used invader card goes facedown under the deck
  tieBreaker: 'sovereignHolder', // bid ties decided by the Initiative-token holder
  penaltyOrder: 'lowestFirstThenInitiative', // FAQ errata
  attackAtZeroStrength: 'resolvedGuaranteedDefense', // FAQ: still bid, cannot lose
  bidsDiscardedToPool: true,     // win or lose, all bids leave play
  reshuffleIncludesDiscard: true, // Winter-class errata: shuffle deck AND discard pile
});
