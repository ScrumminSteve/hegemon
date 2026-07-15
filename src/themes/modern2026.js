// Theme pack: 2026 — a modern-day great-powers reskin. Fan theme; naming
// convention: leader cards use each nation's HISTORICAL titans (all deceased),
// matched to the mechanical hook of their slot rather than raw fame.

export const THEME_2026 = {
  id: 'modern2026',
  title: '2026: The Concert of Powers',

  // M2.f presentation contract — carbon, steel, and cold signal light.
  visuals: {
    texture: 'carbon',
    palette: {
      ink: '#080b0e', ink2: '#0e1319', sea: '#12202b',
      slate: '#2e3a44', slate2: '#232d36',
      accent: '#5FAECD', text: '#D4DAE0', textDim: '#8b98a3',
      hair: 'rgba(212, 218, 224, 0.14)',
    },
    // Rendered by tools/build-map.py from map.js — anchors align by construction.
    canvas: { background: 'assets/map-2026.webp', x: -25, y: -47, w: 1101, h: 1707 },
    unitIcons: null,
  },
  terms: {
    threat: 'Crisis Index',
    leaderCard: 'Leader Card',
    faction: 'Nation', factions: 'Nations',
    eventPhase: 'The World Stage',
    invaders: 'Rogue Powers', threatTrack: 'Crisis Track', incursion: 'Global Crisis',
    trackInitiative: 'Security Council', trackProwess: 'High Command', trackCommand: 'Intelligence Network',
    tokenSovereign: 'The Council Gavel', tokenBlade: 'First Strike Authority', tokenCourier: 'The Red Phone',
    authority: 'Influence',
    orderRally: 'Consolidate Influence',
    fort: 'Military Base', citadel: 'Fortress Capital',
    unitInfantry: 'Infantry', unitCavalry: 'Armor', unitWarship: 'Destroyer',
    unitSiege: 'Siege Artillery', unitBehemoth: 'Stealth Bomber',
    land: 'Land', maritime: 'Sea', port: 'Port',
  },
  factions: {
    F1: { name: 'Russia',             glyph: '🐻' },
    F2: { name: 'Germany',            glyph: '🦅' },
    F3: { name: 'The United Kingdom', glyph: '🦁' },
    F4: { name: 'France',             glyph: '⚜️' },
    F5: { name: 'Iran',               glyph: '☀' },
    F6: { name: 'Norway',             glyph: '🪓' },
  },
  eventCards: {
    "E1-muster": "Mobilization", "E1-supply": "Logistics Review", "E1-choice": "Emergency Session",
    "E1-nothing": "Uneasy Peace", "E1-shuffle": "Black Swan", "E2-bid": "Summit of Powers",
    "E2-collect": "Balance of Power", "E2-choice": "Intelligence Briefing", "E2-nothing": "Uneasy Peace",
    "E2-shuffle": "Black Swan", "E3-incursion": "Global Crisis", "E3-banMarchUp": "Fuel Shortage",
    "E3-banDefend": "War of Movement", "E3-banRaid": "Maritime Accords", "E3-banRally": "Austerity Measures",
    "E3-banSupport": "Alliance Fracture", "E3-choice": "Ultimatum", "W-silence": "False Alarm",
    "W-kingBeyond": "Rogue Superpower", "W-mammoth": "Proxy War", "W-massing": "Succession Crisis",
    "W-horde": "Homeland Strike", "W-rattleshirt": "Supply Chain Collapse", "W-preemptive": "First Strike Doctrine",
    "W-crowKillers": "Arms Embargo", "W-skinchanger": "Cyber Intrusion",
  },
  cards: {
    // Russia — the winter colossus. Kutuzov holds the retreat-direction slot
    // (he chose Napoleon's road home); Peter the Great rebuilds from defeat.
    "F1-4": "Georgy Zhukov", "F1-3": "Mikhail Kutuzov", "F1-2a": "Peter the Great",
    "F1-2b": "Alexander Suvorov", "F1-1a": "General Winter", "F1-1b": "Alexander Nevsky",
    "F1-0": "Dmitry Pozharsky",
    // Germany — Bismarck converts victories into influence (+2 on win);
    // Canaris the spymaster cancels the enemy's card; Scharnhorst's reforms
    // make the infantry count double on the attack.
    "F2-4": "Otto von Bismarck", "F2-3": "Frederick Barbarossa", "F2-2a": "Frederick the Great",
    "F2-2b": "Gebhard von Blücher", "F2-1a": "Wilhelm Canaris", "F2-1b": "Gerhard von Scharnhorst",
    "F2-0": "Konrad Adenauer",
    // The UK — Churchill strongest against the ascendant power; Elizabeth I
    // knights footmen on the field; Nelson annihilates supported fleets;
    // Turing reads the opponent's next card out of their hand.
    "F3-4": "Winston Churchill", "F3-3": "Elizabeth I", "F3-2a": "Bernard Montgomery",
    "F3-2b": "Sir Francis Drake", "F3-1a": "Horatio Nelson", "F3-1b": "Boudica",
    "F3-0": "Alan Turing",
    // France — Robespierre's guillotine falls before the battle is joined;
    // Napoleon's tempo re-uses the march; Richelieu unpicks adjacent plans.
    "F4-4": "Maximilien Robespierre", "F4-3": "Napoleon Bonaparte", "F4-2a": "Charlemagne",
    "F4-2b": "Marshal Turenne", "F4-1a": "Joan of Arc", "F4-1b": "Charles de Gaulle",
    "F4-0": "Cardinal Richelieu",
    // Iran — Nader Shah the Persian Napoleon; Hassan-i Sabbah's blade appears
    // where you least expect it; Babak's land resists even in defeat; Cyrus,
    // King of Kings, makes rivals kneel at the bottom of the track.
    "F5-4": "Nader Shah", "F5-3": "Shapur I", "F5-2a": "Hassan-i Sabbah",
    "F5-2b": "Surena", "F5-1a": "Artemisia I", "F5-1b": "Babak Khorramdin",
    "F5-0": "Cyrus the Great",
    // Norway — Hardrada, Thunderbolt of the North, unmakes legends; the naval
    // hero Tordenskjold; Haakon VII who said "No" from his fortress; Leif
    // Erikson strongest sailing beyond all support; Snorri trades words for power.
    "F6-4": "Harald Hardrada", "F6-3": "Peter Tordenskjold", "F6-2a": "Haakon VII",
    "F6-2b": "Harald Fairhair", "F6-1a": "Leif Erikson", "F6-1b": "Olav Tryggvason",
    "F6-0": "Snorri Sturluson",
  },
  regions: {
    // Russia (the North)
    L01: 'Moscow',            L02: 'Murmansk',           L03: 'Karelia',
    L04: 'St. Petersburg',    L05: 'Arkhangelsk',        L06: 'Kaliningrad',
    L07: 'Belarus',           L08: 'The Pripet Marshes', L09: 'Warsaw',
    L10: 'Gdańsk',            L11: 'Denmark',            L12: 'The Alps',
    L13: 'Switzerland',       L14: 'Prague',             L15: 'Vienna',
    L16: 'Frankfurt',         L17: 'The Rhineland',      L18: 'The Netherlands',
    L19: 'Brussels',          L20: 'Normandy',           L21: 'Dover',
    L22: 'London',            L23: 'The Caucasus',       L24: 'The Zagros Pass',
    L25: 'Shiraz',            L26: 'Isfahan',            L27: 'Bandar Abbas',
    L28: 'Tehran',            L29: 'The Loire Valley',   L30: 'Paris',
    L31: 'Marseille',         L32: 'Toulouse',           L33: 'Anatolia',
    L34: 'Brittany',          L35: 'Bordeaux',           L36: 'Berlin',
    L37: 'Oslo',              L38: 'Svalbard',
    S01: 'The Barents Sea',   S02: 'The Baltic Sea',     S03: 'The North Sea',
    S04: 'The English Channel', S05: 'The Caspian Sea',  S06: 'The Persian Gulf',
    S07: 'The Mediterranean', S08: 'The Gulf of Lion',   S09: 'The Atlantic',
    S10: 'The German Bight',  S11: 'The Skagerrak',      S12: 'The Frisian Coast',
  },
};
