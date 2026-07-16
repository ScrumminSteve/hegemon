// Theme pack: ASOIAF — fan theme. The ONLY file in the codebase permitted to
// contain A Song of Ice and Fire names. Deleting this file must leave a fully
// functional product under the core theme.

export const THEME_ASOIAF = {
  id: 'asoiaf',
  title: 'The War of Five Kings',

  // M2.f presentation contract — aged parchment and candlelight.
  visuals: {
    texture: 'parchment',
    palette: {
      ink: '#171008', ink2: '#20170c', sea: '#2a1f10',
      slate: '#4a3a22', slate2: '#382c19',
      accent: '#C98A3B', text: '#E8DCC4', textDim: '#a89878',
      hair: 'rgba(232, 220, 196, 0.16)',
    },
    // Rendered by tools/build-map.py from map.js — anchors align by construction.
    canvas: { background: 'assets/map-asoiaf.webp', x: -48, y: -47, w: 1124, h: 1745 },
    unitIcons: 'asoiaf', // M2.f.3 symbol set (src/icons.js)
  },
  terms: {
    threat: 'Wildling Threat',
    leaderCard: 'House Card',
    faction: 'House', factions: 'Houses',
    leaderCard: 'House Card',
    eventPhase: 'Westeros Phase',
    invaders: 'Wildlings', threatTrack: 'Wildling Track', incursion: 'Wildling Attack',
    trackInitiative: 'Iron Throne', trackProwess: 'Fiefdoms', trackCommand: "King's Court",
    tokenSovereign: 'Iron Throne Token', tokenBlade: 'Valyrian Steel Blade', tokenCourier: 'Messenger Raven',
    authority: 'Power',
    orderRally: 'Consolidate Power',
    fort: 'Castle', citadel: 'Stronghold',
    unitInfantry: 'Footman', unitCavalry: 'Knight', unitWarship: 'Ship',
    unitSiege: 'Siege Engine', unitBehemoth: 'Dragon',
    land: 'Land', maritime: 'Sea', port: 'Port',
  },
  factions: {
    F1: { name: 'House Stark',     glyph: '🐺' },
    F2: { name: 'House Lannister', glyph: '🦁' },
    F3: { name: 'House Baratheon', glyph: '🦌' },
    F4: { name: 'House Tyrell',    glyph: '🌹' },
    F5: { name: 'House Martell',   glyph: '☀' },
    F6: { name: 'House Greyjoy',   glyph: '🦑' },
  },
  eventCards: {
    "E1-muster": "Mustering", "E1-supply": "Supply", "E1-choice": "A Throne of Blades",
    "E1-nothing": "Last Days of Summer", "E1-shuffle": "Winter Is Coming", "E2-bid": "Clash of Kings",
    "E2-collect": "Game of Thrones", "E2-choice": "Dark Wings, Dark Words", "E2-nothing": "Last Days of Summer",
    "E2-shuffle": "Winter Is Coming", "E3-incursion": "Wildlings Attack", "E3-banMarchUp": "Rains of Autumn",
    "E3-banDefend": "Storm of Swords", "E3-banRaid": "Sea of Storms", "E3-banRally": "Feast for Crows",
    "E3-banSupport": "Web of Lies", "E3-choice": "Put to the Sword", "W-silence": "Silence at the Wall",
    "W-kingBeyond": "A King Beyond the Wall", "W-mammoth": "Mammoth Riders", "W-massing": "Massing on the Milkwater",
    "W-horde": "The Horde Descends", "W-rattleshirt": "Rattleshirt's Raiders", "W-preemptive": "Preemptive Raid",
    "W-crowKillers": "Crow Killers", "W-skinchanger": "Skinchanger Scout",
  },
  cards: {
    "F1-4": "Eddard Stark", "F1-3": "Robb Stark", "F1-2a": "Roose Bolton", "F1-2b": "Greatjon Umber", "F1-1a": "Ser Rodrik Cassel", "F1-1b": "The Blackfish", "F1-0": "Catelyn Stark",
    "F2-4": "Tywin Lannister", "F2-3": "Ser Gregor Clegane", "F2-2a": "Ser Jaime Lannister", "F2-2b": "The Hound", "F2-1a": "Tyrion Lannister", "F2-1b": "Ser Kevan Lannister", "F2-0": "Cersei Lannister",
    "F3-4": "Stannis Baratheon", "F3-3": "Renly Baratheon", "F3-2a": "Brienne of Tarth", "F3-2b": "Ser Davos Seaworth", "F3-1a": "Salladhor Saan", "F3-1b": "Melisandre", "F3-0": "Patchface",
    "F4-4": "Mace Tyrell", "F4-3": "Ser Loras Tyrell", "F4-2a": "Ser Garlan Tyrell", "F4-2b": "Randyll Tarly", "F4-1a": "Alester Florent", "F4-1b": "Margaery Tyrell", "F4-0": "Queen of Thorns",
    "F5-4": "The Red Viper", "F5-3": "Areo Hotah", "F5-2a": "Darkstar", "F5-2b": "Obara Sand", "F5-1a": "Nymeria Sand", "F5-1b": "Arianne Martell", "F5-0": "Doran Martell",
    "F6-4": "Euron Crow's Eye", "F6-3": "Victarion Greyjoy", "F6-2a": "Theon Greyjoy", "F6-2b": "Balon Greyjoy", "F6-1a": "Asha Greyjoy", "F6-1b": "Dagmar Cleftjaw", "F6-0": "Aeron Damphair",
  },
  regions: {
    L01: 'Winterfell',        L02: 'Karhold',            L03: 'The Stony Shore',
    L04: 'White Harbor',      L05: "Widow's Watch",      L06: "Flint's Finger",
    L07: 'Moat Cailin',       L08: 'Greywater Watch',    L09: 'The Twins',
    L10: 'Seagard',           L11: 'The Fingers',        L12: 'The Mountains of the Moon',
    L13: 'The Eyrie',         L14: 'Riverrun',           L15: 'Harrenhal',
    L16: 'Stoney Sept',       L17: 'Blackwater',         L18: 'Crackclaw Point',
    L19: "King's Landing",    L20: 'The Kingswood',      L21: "Storm's End",
    L22: 'Dragonstone',       L23: 'The Boneway',        L24: "Prince's Pass",
    L25: 'Starfall',          L26: 'Yronwood',           L27: 'Salt Shore',
    L28: 'Sunspear',          L29: 'The Reach',          L30: 'Highgarden',
    L31: 'Oldtown',           L32: 'Three Towers',       L33: 'The Dornish Marches',
    L34: 'Searoad Marches',   L35: 'The Arbor',          L36: 'Lannisport',
    L37: 'Pyke',              L38: 'Castle Black',
    S01: 'Bay of Ice',        S02: 'The Shivering Sea',  S03: 'The Narrow Sea',
    S04: 'Shipbreaker Bay',   S05: 'Sea of Dorne',       S06: 'East Summer Sea',
    S07: 'West Summer Sea',   S08: 'Redwyne Straights',  S09: 'Sunset Sea',
    S10: 'The Golden Sound',  S11: "Ironman's Bay",      S12: 'Blackwater Bay',
  },
};
