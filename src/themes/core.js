// Theme pack: CORE — original generic IP. This is the default skin and the
// template for any future pivot. Everything display-facing lives here.

export const THEME_CORE = {
  id: 'core',
  title: 'The Sundered Realm',

  // M2.f presentation contract. Palette keys override the CSS custom-property
  // space in styles.css 1:1 — every surface in the app reads these tokens, so
  // a theme swap restyles chrome, forms, stage, and Chronicle in one move.
  // canvas (per-theme map art + anchors) lands in M2.f.2; unitIcons in M2.f.3.
  visuals: {
    texture: 'linen',                 // chart-room weave
    palette: {
      ink: '#0B111C', ink2: '#101a29', sea: '#14283C',
      slate: '#37424F', slate2: '#2C3641',
      accent: '#C9A84C', text: '#D9D2C0', textDim: '#9aa3ad',
      hair: 'rgba(217, 210, 192, 0.14)',
    },
    canvas: null,      // M2.f.2: { w, h, background, anchors }
    unitIcons: null,   // M2.f.3: per-theme SVG symbol ids
  },
  terms: {
    threat: 'Invader Threat',
    leaderCard: 'Leader Card',
    faction: 'Faction', factions: 'Factions',
    leaderCard: 'Leader Card',
    eventPhase: 'Muster & Omens Phase',
    invaders: 'The Horde', threatTrack: 'Threat Track', incursion: 'Incursion',
    trackInitiative: 'Initiative', trackProwess: 'Prowess', trackCommand: 'Command',
    tokenSovereign: 'Sovereign Token', tokenBlade: "Champion's Blade", tokenCourier: 'Courier Token',
    authority: 'Authority',
    orderRally: 'Rally',
    fort: 'Fort', citadel: 'Citadel',
    unitInfantry: 'Infantry', unitCavalry: 'Cavalry', unitWarship: 'Warship',
    unitSiege: 'Siege Engine', unitBehemoth: 'Behemoth',
    land: 'Land', maritime: 'Sea', port: 'Harbor',
  },
  factions: {
    F1: { name: 'The Boreal Compact', glyph: '❄' },
    F2: { name: 'The Gilded Order',   glyph: '◆' },
    F3: { name: 'The Storm Legion',   glyph: '⚡' },
    F4: { name: 'The Verdant League', glyph: '✿' },
    F5: { name: 'The Dune Covenant',  glyph: '☀' },
    F6: { name: 'The Corsair Fleet',  glyph: '⚓' },
  },
  eventCards: {
    "E1-muster": "Call to Banners", "E1-supply": "The Harvest", "E1-choice": "The Sovereign Decrees",
    "E1-nothing": "Quiet Season", "E1-shuffle": "The Turning Year", "E2-bid": "Contest of Crowns",
    "E2-collect": "Tithe and Tribute", "E2-choice": "Word from the Couriers", "E2-nothing": "Quiet Season",
    "E2-shuffle": "The Turning Year", "E3-incursion": "The Horde Attacks", "E3-banMarchUp": "Mired Roads",
    "E3-banDefend": "Broken Walls", "E3-banRaid": "Storm-Tossed Seas", "E3-banRally": "Lean Times",
    "E3-banSupport": "Seeds of Distrust", "E3-choice": "The Champion Decrees", "W-silence": "The Long Silence",
    "W-kingBeyond": "A Warlord Crowned", "W-mammoth": "Beast Riders", "W-massing": "Gathering at the Fords",
    "W-horde": "The Horde Descends", "W-rattleshirt": "Bone-Rattle Raiders", "W-preemptive": "The First Strike",
    "W-crowKillers": "Slayers of Sentinels", "W-skinchanger": "The Shape-Taker",
  },
  cards: {
    "F1-4": "Warden Kaelric", "F1-3": "Ashka Wolfsworn", "F1-2a": "Lord Vexley", "F1-2b": "Torvald the Vast", "F1-1a": "Castellan Bram", "F1-1b": "The Greyheron", "F1-0": "Lady Maren",
    "F2-4": "Chancellor Auric", "F2-3": "The Gravemaker", "F2-2a": "Ser Lucen Gold", "F2-2b": "The Mastiff", "F2-1a": "Vintas the Small", "F2-1b": "Marshal Corben", "F2-0": "Queen Sabelle",
    "F3-4": "Lord Commander Sturm", "F3-3": "Prince Rovan", "F3-2a": "Dame Berrick", "F3-2b": "Pilot Corwin", "F3-1a": "Zafir the Freesail", "F3-1b": "The Red Oracle", "F3-0": "Motley the Fool",
    "F4-4": "Lord Petrarch", "F4-3": "Ser Lorello", "F4-2a": "Ser Gavric", "F4-2b": "Marshal Thane", "F4-1a": "Lord Aldwyn", "F4-1b": "Lady Maribel", "F4-0": "The Thorned Dowager",
    "F5-4": "The Crimson Asp", "F5-3": "Captain Ottone", "F5-2a": "Nightblade Vex", "F5-2b": "Sera the Spear", "F5-1a": "Nyra of the Dunes", "F5-1b": "Princess Aveline", "F5-0": "Prince Corvus",
    "F6-4": "Storm-Eye Vane", "F6-3": "Admiral Vayric", "F6-2a": "Tavin Reaverborn", "F6-2b": "King Morrec", "F6-1a": "Asha Stormdaughter", "F6-1b": "Cleft Hagar", "F6-0": "The Drowned Priest",
  },
  regions: {
    L01: 'Frosthold',      L02: 'The Rimefells',   L03: 'Greyshore',
    L04: 'Harborgate',     L05: 'Eastcliff',        L06: 'Fenpoint',
    L07: 'The Causeway',   L08: 'Mirebank',         L09: 'Tollbridge',
    L10: 'Seawall',        L11: 'The Spurs',        L12: 'Highpass',
    L13: 'Skyreach',       L14: 'Riverhold',        L15: 'Lakemoor',
    L16: 'Millford',       L17: 'Rushfields',       L18: 'Thornpoint',
    L19: 'Crownhaven',     L20: 'Greenwood',        L21: 'Stormgate',
    L22: 'Emberrock',      L23: 'The Defile',       L24: 'Sandpass',
    L25: 'Duskfall',       L26: 'Stonevale',        L27: 'Saltmere',
    L28: 'Sunhold',        L29: 'The Heartlands',   L30: 'Verdant Hall',
    L31: 'Old Quay',       L32: 'Threespire',       L33: 'The Marches',
    L34: 'Westmarch',      L35: 'The Vinery',       L36: 'Goldport',
    L37: 'Reaverhold',      L38: 'Coldwatch',
    S01: 'Frozen Bay',     S02: 'The Pale Sea',     S03: 'The Slender Sea',
    S04: 'Wreckwater Bay', S05: 'The Amber Gulf',   S06: 'The Farwater',
    S07: 'The Verge Sea',  S08: "Vintner's Strait", S09: 'The Sundown Deep',
    S10: 'Gilded Sound',   S11: "Reaver's Bay",     S12: 'Crown Bay',
  },
};
