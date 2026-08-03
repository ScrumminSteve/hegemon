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

  // House briefings (owner request, m3e15): a hook of history and marching
  // orders a new player can hold in one hand. Objectives are GLORY-MARKS —
  // guidance, not engine rules; the crown still falls at 7 seats.
  briefings: {
    F1: {
      title: 'The Sun in Splendour',
      story: [
        'Twice Protector of the Realm, twice cast aside — Richard of York asked only what the law owed him, and the Queen answered at Wakefield with his head on a spike wearing a paper crown.',
        'Now his son Edward — eighteen years old, six foot four, undefeated — watches three suns rise over the morning of battle and calls it an omen.',
        'The north is yours. The road south is long. At the end of it sits a throne held by a sleeping king and the she-wolf who rules through him.',
      ],
      objectives: [
        '⚔ MARCH SOUTH — take St Albans, the twice-bloodied gateway. Every crown won this century passed through it.',
        '👑 BE CROWNED — take London and hold it. The realm follows whoever the city cheers.',
        '🏰 NEVER AGAIN WAKEFIELD — York must not fall while you campaign. Garrison the home your father died defending.',
      ],
      closing: 'These are marks of glory, not chains — the crown falls to whoever holds seven seats, by any road. But history is watching, Edward.',
    },
    F2: {
      title: 'The She-Wolf of France',
      story: [
        'Your husband the king sleeps with his eyes open — a saint, they say, which is another word for useless. Fine. England does not need him awake; England has you.',
        'They put a paper crown on York\'s severed head at Wakefield because you ordered it so, and the realm learned what the she-wolf does to those who touch her son\'s inheritance.',
        'Now York\'s giant boy calls himself king, half the lords smell which way the wind blows, and the only crown that matters is the one your Edward will wear — or none shall wear any at all.',
      ],
      objectives: [
        '🌹 THE KING MUST BE KEPT — Lancaster is the dynasty\'s heart: garrison it, and never let the home fires fall while you campaign.',
        '⚔ BREAK THE PRETENDER — carry the red rose to St Albans as you did before, and then to the city of York itself. Let them keep the paper crown.',
        '👑 THE SON\'S INHERITANCE — this house does not yield. Take the seven seats if the field allows — and if it does not, stand highest when the final round closes. Margaret fights to the last day of the last year.',
      ],
      closing: 'They call you the she-wolf as an insult, madam. Wear it as the wolves do.',
    },
    F3: {
      title: 'The Last Dragon',
      story: [
        'You have been in exile since you were a boy — a Welsh name, a thin claim, and a mother who has spent twenty years turning both into a crown with nothing but letters and patience.',
        'The men across the water call you the last hope of a broken cause. The men around you call you something better: unbeaten. No one has ever beaten Henry Tudor, because Henry Tudor has never fought.',
        'You get one landing. One. The dynasties that rule England have armies, castles, generations of dead ancestors in every church. You have a fleet, an omen, and a red dragon on a white-and-green field. It was enough for Cadwaladr. It will be enough.',
      ],
      objectives: [
        '⚓ THE FLEET BEFORE THE THRONE — do not leave Carisbrooke before the fourth year. Build the ships, count the coin, let them forget you exist.',
        '🐉 ONE LANDING — when you descend, descend once: take a beachhead on the mainland and NEVER lose it. There is no second fleet.',
        '⚔ BOSWORTH — find whichever head currently wears the crown highest, and bring it down in open battle. Kingdoms change hands in an afternoon.',
      ],
      closing: 'Twenty years of letters, Henry. Try to be worth them.',
    },
    F4: {
      title: 'The Swan Between Millstones',
      story: [
        'Your blood runs from Edward III down both sides of your family, which in this England is less an honor than a death sentence pending scheduling.',
        'To your north the roses tear each other apart; to your coasts the fleets prowl; and every house that ever reached too high has learned what the grinding stones do to grain.',
        'But the Stafford swan has outlived bolder birds by knowing the oldest truth of the middle lands: you need not be the strongest house in England. You need only be standing, and owed favors, when the strong have bled each other white.',
      ],
      objectives: [
        '🦢 THE SWAN ENDURES — hold both your home seats to the very last round. The millstones grind whoever lets go of the ground.',
        '🕊 FRIEND TO ALL, SERVANT TO NONE — never be at war with more than one house in the same year. Feuds are for houses that can afford them.',
        '⚖ THE THIRD MILLSTONE — when the roses have ground each other fine, stand above them BOTH when the final round closes. Let them keep their war; you keep the realm.',
      ],
      closing: 'Patience, your grace. Swans look serene precisely because the work happens beneath the water.',
    },
    F5: {
      title: 'Esperance',
      story: [
        'Yours is the oldest fighting name in the north — Wardens of the Marches since before the roses learned to hate each other, the house that stood between England and the reivers when the crowns were too busy killing cousins to notice.',
        'And what has the realm paid you for it? Neville bears carried fire to Alnwick. Dragons have hunted your knights for sport. Every chronicle of every war seems to spend a chapter breaking Percy — and yet here Percy stands, because the Marches do not fall, they endure.',
        'Your battle cry is Esperance. It means hope. On Percy lips it has always meant something harder: we have been burned before, and we are still here, and now it is our turn.',
      ],
      objectives: [
        '🛡 WARDEN OF THE MARCHES — the Border is YOUR charge: when the Reivers bid opens, no house pays more than Percy. Top every invader bid, alone or tied, all game.',
        '🐻 THE FEUD REPAID — they came to Alnwick once. Carry the blue lion to Middleham, and hold the bear\'s own seat when the game ends.',
        '🦁 ALNWICK ENDURES — twice in living memory the banners burned. NEVER AGAIN: Alnwick does not fall, not for one round, from first year to last.',
      ],
      closing: 'Esperance, my lord. Say it the old way — through your teeth.',
    },
    F6: {
      title: 'The Kingmaker',
      story: [
        'You are the richest subject in England, captain of the narrow seas — and twice now a king has worn his crown because you decided he should.',
        'From the Isle of Man your carracks reach every coast; your table feeds half of London; your name opens gates that armies cannot.',
        'But gratitude runs short in kings, and the boy you crowned grows tired of owing you. Perhaps it is time he learned: what the Kingmaker gives, the Kingmaker takes away.',
      ],
      objectives: [
        '🌊 RULE THE NARROW SEAS — the Manx Sea stays yours, and no coast in the realm sleeps safe from your raids.',
        '🐻 SETTLE THE FEUD — hold Middleham against all comers, and carry the bear and ragged staff to Alnwick. Percy has held the north over your family long enough.',
        '👑 MAKE A KING — OR BE ONE — win the Crown at bid and order the realm as its sovereign. And when they forget what they owe you, take the seven seats yourself.',
      ],
      closing: 'Kings are made by stronger men than kings, my lord. The fog at Barnet is not yet written.',
    },
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
