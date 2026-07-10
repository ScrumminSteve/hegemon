// Theme pack: ASOIAF — fan theme. The ONLY file in the codebase permitted to
// contain A Song of Ice and Fire names. Deleting this file must leave a fully
// functional product under the core theme.

export const THEME_ASOIAF = {
  id: 'asoiaf',
  title: 'The War of Five Kings',
  terms: {
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
    L37: 'Pyke',
    S01: 'Bay of Ice',        S02: 'The Shivering Sea',  S03: 'The Narrow Sea',
    S04: 'Shipbreaker Bay',   S05: 'Sea of Dorne',       S06: 'East Summer Sea',
    S07: 'West Summer Sea',   S08: 'Redwyne Straights',  S09: 'Sunset Sea',
    S10: 'The Golden Sound',  S11: "Ironman's Bay",      S12: 'Blackwater Bay',
  },
};
