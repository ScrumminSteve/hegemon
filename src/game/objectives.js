// HEGEMON — marks-of-glory scorer (m3e36, owner request: "score objectives
// met at the end in stars ⭐").
//
// Briefing objectives were pure prose until now; this module gives each one
// a machine-checkable predicate evaluated UI-SIDE over the FINAL state and
// its log (never engine-side: the log lives inside the episode hash, and a
// new engine field would stale the whole corpus — the roundsVerdict lesson).
//
// HONESTY NOTES, per predicate, on what the log can and cannot prove:
//  - "took"  = placed a control marker there, or won a battle attacking it,
//    or holds it at the end. A quiet walk into an empty region leaves no log
//    event, so a fleeting unopposed visit may be missed — acceptable: marks
//    of glory should be TAKEN loudly.
//  - "never fell" = no enemy control marker there, no defended battle lost
//    there, and held at the end. A bloodless enemy walk-through while the
//    owner was absent is invisible to the log; the end-state check catches
//    any occupation that mattered.
//  - The Crown timeline is EXACT: every event-phase rebuild logs the holder,
//    so "beat the crown holder in battle" pairs each battle with the crown
//    as it stood that round.

import { createGame, seatsControlled, landAreasControlled, controllerOf, region } from '../engine/state.js';

// A house's HOME is its starting footprint, derived from setup (fixed unit
// placement, seed-independent) — never hand-listed. Learned the hard way
// (m3e36b): Tudor STARTS with a garrison in The Weald, and a hand-listed
// home of {Carisbrooke, Solent} convicted Henry of "invading" his own
// starting ground when a leaveControl marker was planted there in round 3.
let HOME_CACHE = null;
export function startingFootprint(fid) {
  if (!HOME_CACHE) {
    const s0 = createGame(6, { seed: 1 });
    HOME_CACHE = {};
    for (const f of s0.factions) HOME_CACHE[f] = [];
    for (const r of Object.keys(s0.unitsByRegion)) {
      const c = controllerOf(s0, r);
      if (c) HOME_CACHE[c].push(r);
    }
    for (const rgn of ['P01','P02','P03','P04','P05','P06','P07','P08']) {
      const c = controllerOf(s0, rgn);
      if (c && !HOME_CACHE[c].includes(rgn)) HOME_CACHE[c].push(rgn);
    }
  }
  return HOME_CACHE[fid] ?? [];
}

// ---------------------------------------------------------------------------
// log scanners (all pure over state.log)
// ---------------------------------------------------------------------------

const battles = state => {
  const out = [];
  let open = null;
  for (const e of state.log) {
    if (e.event === 'combatBegan') open = e;
    if (e.event === 'combatResolved' && open) {
      out.push({ round: e.round, region: open.region,
        attacker: open.attacker, defender: open.defender,
        victor: e.victor, loser: e.victor === open.attacker ? open.defender : open.attacker });
      open = null;
    }
  }
  return out;
};

const tookEver = (state, fid, rid) =>
  state.log.some(e => e.event === 'controlEstablished' && e.faction === fid && e.region === rid) ||
  battles(state).some(b => b.victor === fid && b.attacker === fid && b.region === rid) ||
  controllerOf(state, rid) === fid;

const fellEver = (state, fid, rid) =>
  state.log.some(e => e.event === 'controlEstablished' && e.faction !== fid && e.region === rid) ||
  battles(state).some(b => b.defender === fid && b.victor !== fid && b.region === rid);

const heldThroughout = (state, fid, rid) =>
  !fellEver(state, fid, rid) && controllerOf(state, rid) === fid;

const crownHolderAt = (state, logIndex) => {
  let holder = null;
  for (let i = 0; i < logIndex; i++) {
    const e = state.log[i];
    if (e.event === 'trackRebuilt' && e.track === 'initiative') holder = e.holder;
  }
  return holder;
};

const ranking = state => state.factions.slice().sort((a, b) =>
  (seatsControlled(state, b) - seatsControlled(state, a)) ||
  (landAreasControlled(state, b) - landAreasControlled(state, a)) ||
  (state.supply[b] - state.supply[a]) ||
  (state.tracks.initiative.indexOf(a) - state.tracks.initiative.indexOf(b)));

// ---------------------------------------------------------------------------
// predicate vocabulary
// ---------------------------------------------------------------------------

const CHECKS = {
  controlAtEnd: (s, fid, c) => c.regions.every(r => controllerOf(s, r) === fid),
  everTook: (s, fid, c) => c.regions.every(r => tookEver(s, fid, r)),
  neverFell: (s, fid, c) => c.regions.every(r => heldThroughout(s, fid, r)),
  isWinner: (s, fid) => s.winner === fid,

  stayHomeBefore: (s, fid, c) => {
    const home = c.home ?? startingFootprint(fid);
    const early = e => e.round < c.round;
    if (s.log.some(e => early(e) && e.event === 'controlEstablished' && e.faction === fid && !home.includes(e.region))) return false;
    return !battles(s).some(b => early(b) && b.attacker === fid && !home.includes(b.region));
  },

  beachhead: (s, fid, c) => {
    const home = c?.home ?? startingFootprint(fid);
    const cands = new Set();
    for (const e of s.log) if (e.event === 'controlEstablished' && e.faction === fid && !home.includes(e.region) && region(e.region)?.kind === 'land') cands.add(e.region);
    for (const b of battles(s)) if (b.victor === fid && b.attacker === fid && !home.includes(b.region) && region(b.region)?.kind === 'land') cands.add(b.region);
    return [...cands].some(r => !fellEver(s, fid, r) && controllerOf(s, r) === fid);
  },

  beatCrownHolder: (s, fid) => {
    let open = null, idx = -1;
    for (let i = 0; i < s.log.length; i++) {
      const e = s.log[i];
      if (e.event === 'combatBegan') { open = e; idx = i; }
      if (e.event === 'combatResolved' && open) {
        const loser = e.victor === open.attacker ? open.defender : open.attacker;
        if (e.victor === fid && loser === crownHolderAt(s, idx)) return true;
        open = null;
      }
    }
    return false;
  },

  warDiscipline: (s, fid, c) => {
    const perRound = {};
    for (const b of battles(s)) {
      if (b.attacker !== fid && b.defender !== fid) continue;
      const foe = b.attacker === fid ? b.defender : b.attacker;
      (perRound[b.round] ??= new Set()).add(foe);
    }
    return Object.values(perRound).every(set => set.size <= (c.max ?? 1));
  },

  outrankAtEnd: (s, fid, c) => {
    const r = ranking(s);
    return c.over.every(f => r.indexOf(fid) < r.indexOf(f));
  },

  topInvaderBids: (s, fid) => {
    const reveals = s.log.filter(e => e.event === 'incursionBidsRevealed');
    if (!reveals.length) return true; // no incursions came — the watch held
    return reveals.every(e => {
      const mine = e.bids?.[fid] ?? 0;
      return Object.entries(e.bids ?? {}).every(([f, amt]) => f === fid || amt <= mine);
    });
  },

  seaAndRaids: (s, fid, c) => {
    const fleetHome = (s.unitsByRegion[c.sea] || []).some(u => u.faction === fid && u.type === 'warship');
    const raids = s.log.filter(e => e.event === 'raided' && e.by === fid).length;
    return fleetHome && raids >= (c.raids ?? 3);
  },

  wonCrownOrRealm: (s, fid) =>
    s.winner === fid ||
    s.log.some(e => e.event === 'trackRebuilt' && e.track === 'initiative' && e.holder === fid),

  any: (s, fid, c) => c.of.some(sub => CHECKS[sub.type](s, fid, sub)),
  all: (s, fid, c) => c.of.every(sub => CHECKS[sub.type](s, fid, sub)),
};

// ---------------------------------------------------------------------------
// the Wars of the Roses marks (region ids per src/themes/warroses.js)
// ---------------------------------------------------------------------------
// Kept HERE rather than in the theme pack: predicates are game semantics
// keyed to engine region ids; the theme keeps the poetry, this keeps the law.

export const GLORY_CHECKS = {
  F1: [
    { type: 'everTook', regions: ['L16'] },                                   // St Albans
    { type: 'controlAtEnd', regions: ['L19'] },                               // London held
    { type: 'neverFell', regions: ['L01'] },                                  // York never falls
  ],
  F2: [
    { type: 'neverFell', regions: ['L36'] },                                  // Lancaster kept
    { type: 'everTook', regions: ['L16', 'L01'] },                            // St Albans AND York
    { type: 'isWinner' },                                                     // by seats or standings
  ],
  F3: [
    { type: 'stayHomeBefore', round: 4 },                                     // the fleet before the throne (home = derived footprint)
    { type: 'beachhead' },                                                    // one landing, never lost
    { type: 'beatCrownHolder' },                                              // Bosworth
  ],
  F4: [
    { type: 'neverFell', regions: ['L30', 'L34'] },                           // Thornbury AND Gloucester
    { type: 'warDiscipline', max: 1 },                                        // one feud at a time
    { type: 'outrankAtEnd', over: ['F1', 'F2'] },                             // above both roses
  ],
  F5: [
    { type: 'topInvaderBids' },                                               // warden of the marches
    { type: 'controlAtEnd', regions: ['L08'] },                               // hold Middleham at end
    { type: 'neverFell', regions: ['L28'] },                                  // Alnwick endures
  ],
  F6: [
    { type: 'seaAndRaids', sea: 'S11', raids: 3 },                            // the Manx Sea + raids
    { type: 'all', of: [{ type: 'controlAtEnd', regions: ['L08'] }, { type: 'everTook', regions: ['L28'] }] }, // hold Middleham, carry to Alnwick
    { type: 'wonCrownOrRealm' },                                              // make a king — or be one
  ],
};

/** Score a faction's marks of glory over a FINISHED game.
    Returns [{ index, met }] aligned with the theme briefing's objectives. */
export function scoreGlory(state, fid, checks = GLORY_CHECKS[fid]) {
  if (!checks) return null;
  return checks.map((c, index) => ({ index, met: !!CHECKS[c.type](state, fid, c) }));
}

export const starLine = marks =>
  marks ? marks.map(m => (m.met ? '⭐' : '☆')).join('') + ` ${marks.filter(m => m.met).length} of ${marks.length}` : '';
