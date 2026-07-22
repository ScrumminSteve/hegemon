// Theme pack: THE WARS OF THE ROSES — historical theme (owner flagship
// candidate, m3e11). All names are 15th-century historical persons, places,
// and terms of art: no licensed material anywhere in this file. The map art
// is the owner's own (assets/map-asoiaf.webp — MJ + Claude, owner copyright);
// only nomenclature differs between packs.
//
// House seats follow the map's geometry, latitude for latitude:
//   F1 York (the north) · F2 Lancaster (the west) · F3 Tudor (island in the
//   Solent — the dynasty that came by sea) · F4 Stafford (the rich middle) ·
//   F5 Percy (the far corner marches) · F6 Neville (the Isle of Man — the
//   Kingmaker's fleet raids every coast).

export const THEME_WARROSES = {
  id: 'warroses',
  title: 'The Wars of the Roses',

  visuals: {
    texture: 'parchment',
    palette: {
      ink: '#141018', ink2: '#1c1520', sea: '#1e1a26',
      slate: '#3e3448', slate2: '#2e2736',
      accent: '#B03A3A', text: '#EADFD0', textDim: '#a4948a',
      hair: 'rgba(234, 223, 208, 0.16)',
    },
    // Same board, same anchors — the owner's own art carries both packs.
    canvas: { background: 'assets/map-asoiaf.webp', x: -48, y: -47, w: 1124, h: 1745 },
    unitIcons: 'asoiaf', // the medieval silhouette set: billmen, knights, bombards
  },

  terms: {
    threat: 'Border Threat',
    leaderCard: 'Retinue Card',
    faction: 'House', factions: 'Houses',
    eventPhase: 'Parliament Phase',
    invaders: 'Scots Reivers', threatTrack: 'Border Track', incursion: 'Border Invasion',
    trackInitiative: 'The Crown', trackProwess: 'The Marshalcy', trackCommand: 'The Privy Council',
    tokenSovereign: 'The Crown Token', tokenBlade: 'The Sword of State', tokenCourier: "The King's Herald",
    authority: 'Livery',
    orderRally: 'Consolidate Livery',
    fort: 'Castle', citadel: 'Great Castle',
    unitInfantry: 'Billman', unitCavalry: 'Knight', unitWarship: 'Carrack',
    unitSiege: 'Bombard', unitBehemoth: 'Great Bombard',
    land: 'Land', maritime: 'Sea', port: 'Port',
  },

  factions: {
    F1: { name: 'House of York',      glyph: '☀' },  // the Sun in Splendour
    F2: { name: 'House of Lancaster', glyph: '🌹' },  // the red rose
    F3: { name: 'House Tudor',        glyph: '🐉' },  // the red dragon of Cadwaladr
    F4: { name: 'House Stafford',     glyph: '🦢' },  // the Bohun swan
    F5: { name: 'House Percy',        glyph: '🦁' },  // the blue lion of Alnwick
    F6: { name: 'House Neville',      glyph: '🐻' },  // the bear and ragged staff
  },

  eventCards: {
    'E1-muster': 'Commissions of Array', 'E1-supply': 'The Harvest',
    'E1-choice': 'A Parliament of Devils', 'E1-nothing': 'An Uneasy Peace',
    'E1-shuffle': 'The Wheel of Fortune', 'E2-bid': 'The Crown Contested',
    'E2-collect': 'Crown Revenues', 'E2-choice': 'The Loveday',
    'E2-nothing': 'An Uneasy Peace', 'E2-shuffle': 'The Wheel of Fortune',
    'E3-incursion': 'The Reivers Descend', 'E3-banMarchUp': 'Autumn Rains',
    'E3-banDefend': 'Bill of Attainder', 'E3-banRaid': "The King's Peace",
    'E3-banRally': 'Livery Forbidden', 'E3-banSupport': 'Ancient Grudges',
    'E3-choice': 'To the Block', 'W-silence': 'Quiet on the Border',
    'W-kingBeyond': 'The Auld Enemy', 'W-mammoth': 'The Great Raid',
    'W-massing': 'Massing on the Tweed', 'W-horde': 'The Host Descends',
    'W-rattleshirt': 'Moss-Troopers', 'W-preemptive': 'Lightning Foray',
    'W-crowKillers': 'March-Wardens Slain', 'W-skinchanger': 'A Spy in the Marches',
  },

  cards: {
    'F1-4': 'Edward of March', 'F1-3': 'Richard of York', 'F1-2a': 'Richard of Gloucester',
    'F1-2b': 'Lord Fauconberg', 'F1-1a': 'Sir William Herbert', 'F1-1b': 'Lord Hastings',
    'F1-0': 'Cecily Neville',
    'F2-4': 'Margaret of Anjou', 'F2-3': 'The Duke of Somerset', 'F2-2a': 'Lord Clifford',
    'F2-2b': 'Andrew Trollope', 'F2-1a': 'The Duke of Exeter', 'F2-1b': 'Lord Roos',
    'F2-0': 'Henry VI',
    'F3-4': 'Henry Tudor', 'F3-3': 'The Earl of Oxford', 'F3-2a': 'Jasper Tudor',
    'F3-2b': 'Rhys ap Thomas', 'F3-1a': 'Sir Gilbert Talbot', 'F3-1b': 'Bishop Morton',
    'F3-0': 'Margaret Beaufort',
    'F4-4': 'The Duke of Buckingham', 'F4-3': 'Sir Henry Stafford', 'F4-2a': 'Humphrey of Grafton',
    'F4-2b': 'Sir William Knyvet', 'F4-1a': 'Lord Berners', 'F4-1b': 'Sir Nicholas Latimer',
    'F4-0': 'Duchess Anne',
    'F5-4': 'The Earl of Northumberland', 'F5-3': 'Lord Egremont', 'F5-2a': 'Sir Ralph Percy',
    'F5-2b': 'Lord Poynings', 'F5-1a': 'Sir Richard Percy', 'F5-1b': 'Sir William Bertram',
    'F5-0': 'Eleanor Percy',
    'F6-4': 'Warwick the Kingmaker', 'F6-3': 'The Earl of Salisbury', 'F6-2a': 'Lord Montagu',
    'F6-2b': 'The Bastard of Fauconberg', 'F6-1a': 'Sir John Conyers', 'F6-1b': 'The Archbishop of York',
    'F6-0': 'Anne Beauchamp',
  },

  regions: {
    L01: 'York',              L02: 'Bamburgh',           L03: 'The Cumbrian Coast',
    L04: 'Newcastle',         L05: 'Scarborough',        L06: 'Furness',
    L07: 'The Great North Road', L08: 'Middleham',       L09: 'The Trent Crossings',
    L10: 'The Mersey',        L11: 'The Wash',           L12: 'The Pennines',
    L13: 'Nottingham',        L14: 'Ludlow',             L15: 'Kenilworth',
    L16: 'St Albans',         L17: 'The Thames Valley',  L18: 'East Anglia',
    L19: 'London',            L20: 'The Weald',          L21: 'Dover',
    L22: 'Carisbrooke',       L23: 'The Downs',          L24: 'The Cotswolds',
    L25: 'Exeter',            L26: 'Salisbury',          L27: 'The Cornish Coast',
    L28: 'Alnwick',           L29: 'The Midlands',       L30: 'Thornbury',
    L31: 'Bristol',           L32: 'Glastonbury',        L33: 'The Welsh Marches',
    L34: 'Gloucester',        L35: 'Lundy',              L36: 'Lancaster',
    L37: 'The Isle of Man',   L38: 'Berwick',
    S01: 'The Firth of Forth', S02: 'The North Sea',     S03: 'The Narrow Sea',
    S04: 'The Solent',        S05: 'Lyme Bay',           S06: 'The Channel Approaches',
    S07: 'The Celtic Sea',    S08: 'The Bristol Channel', S09: 'The Irish Sea',
    S10: 'Morecambe Bay',     S11: 'The Manx Sea',       S12: 'The Thames Estuary',
  },
};
