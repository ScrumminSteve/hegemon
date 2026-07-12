// HEGEMON content registries — the composition seam for expansion scenarios.
//
// state.scenario selects entries by id; the engine resolves content through
// these tables rather than importing data modules directly. Adding an
// alternate 42-card set, an alternate Event Deck I, a fourth event deck, or
// an alternate setup is a new registry entry + data file — no engine changes.

import { LEADER_CARDS, HAND_BY_FACTION } from './leaderCards.js';
import { EVENT_DECKS } from './eventCards.js';
import { INVADER_CARDS } from './invaderCards.js';
import { SETUP } from './setup.js';

export const CARD_SETS = {
  base: { cards: LEADER_CARDS, hands: HAND_BY_FACTION },
  // adwd: alternate 42-card set (expansion) — data drop-in
};

export const EVENT_DECK_SETS = {
  base: EVENT_DECKS,
  // affc: alternate Deck I variant; mod: adds Deck IV — data drop-ins
};

export const INVADER_SETS = {
  base: INVADER_CARDS,
};

export const SETUP_VARIANTS = {
  base: SETUP,
  // adwd / affc / mod: alternate deployments, rosters, tracks — data drop-ins
};
