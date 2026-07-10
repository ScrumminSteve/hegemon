// HEGEMON starting setup — transcribed from the reference game's house screens
// and rulebook setup pages (owner-supplied photos, Jul 2026). IP-NEUTRAL ids.
//
// Confidence: 6-seat deployments & track positions transcribed from house
// screens = HIGH. Neutral-force values for 3/4/5 seats = DRAFT (small print
// on Rules p.28 diagrams); entries carry verified:false until audited.
//
// Rules citations refer to the reference rulebook page numbers.

export const SETUP = {
  seatCounts: [3, 4, 5, 6],
  firstRound: 1,
  skipEventPhaseOnRound1: true,   // Rules p.7
  threatTrackStart: 2,            // Rules p.4, setup step 2
  startingAuthority: 5,           // Rules p.5, setup step 11
  maxRounds: 10,
  victoryTarget: 7,               // seats (fort/citadel areas) controlled

  // Per-faction unit pool limits (Rules p.2 component list)
  unitPool: { infantry: 10, cavalry: 5, warship: 6, siege_engine: 2 },

  factions: {
    F1: { // wolf sigil screen
      deploy: { L01: ['cavalry', 'infantry'], L04: ['infantry'], S02: ['warship'] },
      tracks: { initiative: 3, prowess: 4, command: 2 },
      supply: 1,
      garrison: { L01: 2 },
    },
    F2: { // lion sigil screen
      deploy: { L36: ['cavalry', 'infantry'], L16: ['infantry'], S10: ['warship'] },
      tracks: { initiative: 2, prowess: 6, command: 1 },
      supply: 2,
      garrison: { L36: 2 },
    },
    F3: { // stag sigil screen
      deploy: { L22: ['cavalry', 'infantry'], L20: ['infantry'], S04: ['warship', 'warship'] },
      tracks: { initiative: 1, prowess: 5, command: 4 },
      supply: 2,
      garrison: { L22: 2 },
    },
    F4: { // rose sigil screen
      deploy: { L30: ['cavalry', 'infantry'], L33: ['infantry'], S08: ['warship'] },
      tracks: { initiative: 6, prowess: 2, command: 6 },
      supply: 2,
      garrison: { L30: 2 },
    },
    F5: { // sun sigil screen
      deploy: { L28: ['cavalry', 'infantry'], L27: ['infantry'], S05: ['warship'] },
      tracks: { initiative: 4, prowess: 3, command: 3 },
      supply: 2,
      garrison: { L28: 2 },
    },
    F6: { // kraken sigil screen
      deploy: { L37: ['cavalry', 'infantry'], L08: ['infantry'], S11: ['warship'], P03: ['warship'] },
      tracks: { initiative: 5, prowess: 1, command: 5 },
      supply: 2,
      garrison: { L37: 2 },
    },
  },

  // Reduced seat counts (Rules p.28). Excluded factions' regions receive
  // neutral garrisons; influence tracks compress leftward (Rules p.4 step 8).
  seatVariants: {
    3: { excluded: ['F5', 'F4', 'F6'], neutralSet: 'three' },
    4: { excluded: ['F5', 'F4'],       neutralSet: 'four' },
    5: { excluded: ['F5'],             neutralSet: 'five' },
    6: { excluded: [],                 neutralSet: null },
  },

  // Neutral force tokens (Rules p.26, p.28). strength null = illegible in
  // photos, needs transcription from tokens. insurmountable = the "~" tokens
  // (area cannot be entered). ⚠ ALL entries verified:false pending audit.
  neutralForces: {
    five: [ // tokens marked "4-6" and "4-5"
      { region: 'L28', strength: 5, verified: false },   // excluded home seat
      { region: 'L13', strength: 6, verified: false },
      { region: 'L19', strength: 5, verified: false },
      { region: 'L23', strength: 3, verified: false },   // visible on Rules p.26 example
      { region: 'L31', strength: 3, verified: false },
      { region: 'L38', strength: null, verified: false },
    ],
    four: [ // adds tokens marked "4"
      { region: 'L28', strength: 5, verified: false },
      { region: 'L30', strength: 5, verified: false },
      { region: 'L13', strength: 6, verified: false },
      { region: 'L19', strength: 5, verified: false },
      { region: 'L23', strength: 3, verified: false },
      { region: 'L31', strength: 3, verified: false },
      { region: 'L38', strength: null, verified: false },
      { region: 'L35', strength: null, verified: false },
    ],
    three: [ // tokens marked "3"; several are insurmountable "~"
      { region: 'L28', strength: null, insurmountable: true, verified: false },
      { region: 'L30', strength: 5, verified: false },
      { region: 'L37', strength: null, insurmountable: true, verified: false },
      { region: 'L13', strength: 6, verified: false },
      { region: 'L19', strength: 5, verified: false },
      { region: 'L31', strength: 3, verified: false },
      { region: 'L25', strength: 3, verified: false },   // visible on Rules p.4
      { region: 'L38', strength: null, verified: false },
    ],
  },
};
