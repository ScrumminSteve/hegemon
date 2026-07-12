// HEGEMON engine — Action Phase (M1.c).
// Rules p.14–16: raids, then marches, then rallies, resolved one order at a
// time cycling in initiative order; then clean-up and the next round.
// Combat initiation (marching onto enemy units or garrisons) lands in M1.d.

import { region, regionProps, adjacency, controllerOf, seatsControlled } from './state.js';
import { REGIONS, PORTS } from '../data/map.js';
import { SETUP } from '../data/setup.js';
import { beginPlanning } from './planning.js';
import { beginEventPhase } from './eventPhase.js';
import { initiateCombat } from './combat.js';

const ADJ = adjacency();
const STEPS = ['raid', 'march', 'rally'];
const AUTHORITY_CAP = 20; // token supply per faction (Rules p.2)

/** Combat strength of one unit (Rules p.17). fortified: target has fort/citadel. */
export function unitStrength(unit, { fortified = false } = {}) {
  switch (unit.type) {
    case 'infantry': return 1;
    case 'cavalry': return 2;
    case 'warship': return 1;
    case 'siege_engine': return fortified ? 4 : 0;
    default: throw new Error(`No strength rule for unit type ${unit.type}`);
  }
}

// ---------- supply ----------

/** Army sizes (2+ units sharing an area, Rules p.8) for a faction. */
export function armiesOf(state, fid) {
  return Object.values(state.unitsByRegion)
    .map(units => units.filter(u => u.faction === fid).length)
    .filter(n => n >= 2)
    .sort((a, b) => b - a);
}

/** Throw if a faction's armies exceed its supply limits (Rules p.8). */
export function checkSupply(state, fid) {
  const limits = SETUP.supplyLimits[state.supply[fid]].slice().sort((a, b) => b - a);
  const armies = armiesOf(state, fid);
  if (armies.length > limits.length) {
    throw new Error(`${fid} fields ${armies.length} armies; supply ${state.supply[fid]} allows ${limits.length} (Rules p.8)`);
  }
  armies.forEach((size, i) => {
    if (size > limits[i]) {
      throw new Error(`${fid} army of ${size} exceeds supply-${state.supply[fid]} limits [${limits}] (Rules p.8)`);
    }
  });
}

// ---------- ship transport ----------

/** Can fid's land units march from -> to using chains of friendly-ship seas? (Rules p.23) */
export function transportReachable(state, fid, from, to) {
  const friendlySea = (rid) =>
    region(rid).kind === 'maritime' &&
    (state.unitsByRegion[rid] || []).some(u => u.faction === fid && u.type === 'warship');
  const frontier = [...ADJ[from]].filter(friendlySea);
  const seen = new Set(frontier);
  while (frontier.length) {
    const sea = frontier.pop();
    if (ADJ[sea].has(to)) return true;
    for (const n of ADJ[sea]) {
      if (!seen.has(n) && friendlySea(n)) { seen.add(n); frontier.push(n); }
    }
  }
  return false;
}

// ---------- action-phase turn cycling ----------

function ordersOfStep(state, fid, step) {
  return Object.entries(state.ordersByRegion)
    .filter(([, o]) => o.faction === fid && o.type === step)
    .map(([rid]) => rid)
    .sort();
}

export function beginActionPhase(state) {
  state.phase = 'action';
  state.actionCursor = { stepIdx: 0, lastIdx: -1 };
  advance(state);
}

export function advanceAction(state) { advance(state); }

function advance(state) {
  const order = state.tracks.initiative;
  const c = state.actionCursor;
  while (c.stepIdx < STEPS.length) {
    const step = STEPS[c.stepIdx];
    for (let i = 1; i <= order.length; i++) {
      const idx = (c.lastIdx + i) % order.length;
      const fid = order[idx];
      const regions = ordersOfStep(state, fid, step);
      if (regions.length) {
        c.lastIdx = idx;
        state.pendingQueries.push({ type: 'resolveOrder', step, faction: fid, regions });
        return;
      }
    }
    c.stepIdx += 1;
    c.lastIdx = -1;
  }
  cleanUp(state);
}

function takeQuery(state, fid, step) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'resolveOrder' && q.faction === fid && q.step === step);
  if (qi === -1) throw new Error(`${fid} has no pending ${step} resolution`);
  state.pendingQueries.splice(qi, 1);
}

function orderAt(state, fid, rid, type) {
  const o = state.ordersByRegion[rid];
  if (!o || o.faction !== fid || o.type !== type) {
    throw new Error(`${fid} has no ${type} order at ${rid}`);
  }
  return o;
}

// ---------- raids (Rules p.14, p.25) ----------

export function resolveRaid(state, fid, rid, target) {
  takeQuery(state, fid, 'raid');
  const raid = orderAt(state, fid, rid, 'raid');

  if (target != null) {
    const t = state.ordersByRegion[target];
    if (!t) throw new Error(`No order at ${target}`);
    if (t.faction === fid) throw new Error('Raids target enemy orders only (Rules p.14)');
    if (!ADJ[rid].has(target)) throw new Error(`${target} is not adjacent to ${rid}`);

    const ok = region(rid).kind === 'land' ? region(target).kind === 'land'
             : region(rid).kind === 'maritime' ? true
             : /* port */ target === region(rid).seaId;
    if (!ok) throw new Error(`A ${region(rid).kind} raid cannot reach ${target} (Rules p.14, p.25)`);

    const raidable = ['support', 'raid', 'rally', ...(raid.starred ? ['defend'] : [])];
    if (!raidable.includes(t.type)) {
      throw new Error(`${raid.starred ? 'Starred raids' : 'Raids'} cannot remove ${t.type} orders (Rules p.14, p.22)`);
    }

    if (t.type === 'rally') { // pillage (Rules p.14)
      if (state.authority[t.faction] > 0) state.authority[t.faction] -= 1;
      state.authority[fid] = Math.min(AUTHORITY_CAP, state.authority[fid] + 1);
      state.log.push({ round: state.round, event: 'pillaged', by: fid, victim: t.faction });
    }
    delete state.ordersByRegion[target];
    state.log.push({ round: state.round, event: 'raided', by: fid, from: rid, target });
  } else {
    state.log.push({ round: state.round, event: 'raidSpent', by: fid, from: rid });
  }

  delete state.ordersByRegion[rid];
  advance(state);
}

// ---------- marches (Rules p.15, p.23, p.26) ----------

function validateDestination(state, fid, from, to, types) {
  const dest = region(to);
  const hasShips = types.has('warship');
  const hasLand = [...types].some(t => t !== 'warship');
  if (hasShips && hasLand) throw new Error('Ships and land units resolve to different terrain; split the move');

  if (hasShips) {
    if (dest.kind === 'maritime') {
      const fromR = region(from);
      const okFrom = fromR.kind === 'maritime' ? ADJ[from].has(to)
                   : fromR.kind === 'port' ? fromR.seaId === to
                   : false;
      if (!okFrom) throw new Error(`Ships cannot move ${from} -> ${to} (Rules p.15, p.25)`);
    } else if (dest.kind === 'port') {
      if (region(from).kind !== 'maritime' || dest.seaId !== from) {
        throw new Error(`Ships enter a port only from its connected sea (Rules p.25)`);
      }
      const owner = controllerOf(state, dest.landId);
      if (owner !== fid) throw new Error(`Ships may never enter another faction's port (Rules p.25)`);
    } else {
      throw new Error('Ships never enter land areas (Rules p.15)');
    }
  }
  if (hasLand) {
    if (dest.kind !== 'land') throw new Error('Land units move to land areas only (Rules p.15)');
    if (region(from).kind !== 'land') throw new Error('Land units march from land areas');
    if (!ADJ[from].has(to) && !transportReachable(state, fid, from, to)) {
      throw new Error(`${to} is neither adjacent to ${from} nor reachable by ship transport (Rules p.23)`);
    }
  }
}

/**
 * moves: [{ to, units: { type: count } }]; leaveControl: place an authority
 * token on the vacated land origin (Rules p.15, p.24).
 */
export function resolveMarch(state, fid, rid, moves = [], leaveControl = false) {
  takeQuery(state, fid, 'march');
  const order = orderAt(state, fid, rid, 'march');

  // Availability at the origin.
  const have = {};
  for (const u of state.unitsByRegion[rid] || []) {
    if (u.faction === fid && !u.routed) have[u.type] = (have[u.type] || 0) + 1;
  }
  const want = {};
  for (const mv of moves) {
    for (const [t, n] of Object.entries(mv.units)) want[t] = (want[t] || 0) + n;
  }
  for (const [t, n] of Object.entries(want)) {
    if ((have[t] || 0) < n) throw new Error(`${fid} lacks ${n} ${t} at ${rid}`);
  }

  // Hostility scan: at most one contested destination (Rules p.15).
  let hostile = 0;
  let combatMove = null;
  for (const mv of moves) {
    const enemyUnits = (state.unitsByRegion[mv.to] || []).some(u => u.faction !== fid);
    const enemyGarrison = state.garrisons[mv.to] && state.garrisons[mv.to].faction !== fid
      && !(state.unitsByRegion[mv.to] || []).some(u => u.faction === fid);
    const neutral = state.neutrals[mv.to];
    if (enemyUnits || enemyGarrison) {
      hostile += 1;
      combatMove = mv;
      validateDestination(state, fid, rid, mv.to, new Set(Object.keys(mv.units)));
      continue;
    }
    if (neutral) {
      hostile += 1;
      if (neutral.insurmountable) throw new Error(`${mv.to} cannot be entered (Rules p.4 "~" token)`);
      const fortified = regionProps(state, mv.to).muster > 0;
      let strength = order.mod;
      for (const [t, n] of Object.entries(mv.units)) {
        strength += unitStrength({ type: t }, { fortified }) * n;
      }
      if (strength < neutral.strength) {
        throw new Error(`Strength ${strength} < neutral force ${neutral.strength} at ${mv.to} — march may not be attempted (Rules p.26)`);
      }
    }
    validateDestination(state, fid, rid, mv.to, new Set(Object.keys(mv.units)));
  }
  if (hostile > 1) throw new Error('Only one march destination may be contested (Rules p.15)');

  // Apply non-combat movement first (Rules p.15: combat resolves last).
  for (const mv of moves) {
    if (mv === combatMove) continue;
    // Marching into an area holding only an enemy control marker discards it
    // without combat (Rules p.24).
    if (state.controlMarkers[mv.to] && state.controlMarkers[mv.to] !== fid) {
      state.log.push({ round: state.round, event: 'controlMarkerDiscarded', region: mv.to, was: state.controlMarkers[mv.to] });
      delete state.controlMarkers[mv.to];
    }
    if (state.neutrals[mv.to]) {
      delete state.neutrals[mv.to];
      state.log.push({ round: state.round, event: 'neutralDestroyed', by: fid, region: mv.to });
    }
    for (const [t, n] of Object.entries(mv.units)) {
      let moved = 0;
      state.unitsByRegion[rid] = (state.unitsByRegion[rid] || []).filter(u => {
        if (moved < n && u.faction === fid && u.type === t && !u.routed) { moved++; return false; }
        return true;
      });
      state.unitsByRegion[mv.to] = state.unitsByRegion[mv.to] || [];
      for (let i = 0; i < n; i++) state.unitsByRegion[mv.to].push({ faction: fid, type: t, routed: false });
    }
  }
  if ((state.unitsByRegion[rid] || []).length === 0) delete state.unitsByRegion[rid];

  // Vacated-origin control (Rules p.15, p.24). Home areas keep printed control.
  // (When a combat move exists, occupation is unresolved; combat.js handles it.)
  const combatPending = !!combatMove;
  const vacated = !combatPending && !(state.unitsByRegion[rid] || []).some(u => u.faction === fid);
  if (vacated && leaveControl) {
    const r = region(rid);
    if (r.kind !== 'land') throw new Error('Control markers go on land areas only (Rules p.24)');
    if (r.home === fid) throw new Error('Home areas keep control without a token (Rules p.24)');
    if (state.authority[fid] < 1) throw new Error('No authority available to establish control (Rules p.24)');
    state.authority[fid] -= 1;
    state.controlMarkers[rid] = fid;
    state.log.push({ round: state.round, event: 'controlEstablished', faction: fid, region: rid });
  }

  if (vacated) {
    // Ships in a port whose connected land became uncontrolled are destroyed;
    // if the land is an enemy home, control reverts to that enemy (FAQ v2.0).
    const port = PORTS.find(pp => pp.landId === rid);
    if (port) {
      const owner = controllerOf(state, rid); // after any control marker above
      const shipsHere = (state.unitsByRegion[port.id] || []).filter(u => u.faction === fid);
      if (shipsHere.length && owner !== fid) {
        state.unitsByRegion[port.id] = (state.unitsByRegion[port.id] || []).filter(u => u.faction !== fid);
        state.log.push({ round: state.round, event: 'portShipsLost', port: port.id, faction: fid, count: shipsHere.length, revertedTo: owner || null });
      }
    }
  }

  state.log.push({ round: state.round, event: 'marched', faction: fid, from: rid, moves });
  delete state.ordersByRegion[rid];

  if (combatMove) {
    initiateCombat(state, {
      attacker: fid, origin: rid, target: combatMove.to,
      units: combatMove.units, mod: order.mod, leaveControl,
    });
    return; // combat's cleanup hands back to advance()
  }
  checkSupply(state, fid);
  advance(state);
}

// ---------- rallies (Rules p.16, p.22, p.25) ----------

export function resolveRally(state, fid, rid, { muster = false } = {}) {
  takeQuery(state, fid, 'rally');
  const order = orderAt(state, fid, rid, 'rally');

  if (muster) {
    if (!order.starred) throw new Error('Only the starred rally may muster (Rules p.22)');
    throw new Error('Rally-mustering shares the Event Phase muster machinery — lands in M2');
  }

  const r = region(rid);
  let gain = 0;
  if (r.kind === 'land') {
    gain = 1 + regionProps(state, rid).coin;
  } else if (r.kind === 'port') {
    const enemyShips = (state.unitsByRegion[r.seaId] || []).some(u => u.faction !== fid && u.type === 'warship');
    gain = enemyShips ? 0 : 1; // removed without effect if the sea is enemy-held (Rules p.25)
  } // sea: no effect (Rules p.13)

  state.authority[fid] = Math.min(AUTHORITY_CAP, state.authority[fid] + gain);
  delete state.ordersByRegion[rid];
  state.log.push({ round: state.round, event: 'rallied', faction: fid, region: rid, gain });
  advance(state);
}

// ---------- clean-up & round advance (Rules p.16) ----------

function cleanUp(state) {
  state.ordersByRegion = {};
  state.roundFlags = { bladeUsed: false }; // blade token refreshes (Rules p.11, p.16)
  for (const units of Object.values(state.unitsByRegion)) {
    for (const u of units) u.routed = false; // routed units stand (Rules p.16)
  }
  delete state.actionCursor;
  state.log.push({ round: state.round, event: 'cleanUp' });

  if (state.round >= SETUP.maxRounds) {
    endGame(state);
    return;
  }
  state.round += 1;
  // Event Phase (Rules p.7) lands in M2; until then rounds go straight to planning.
  beginEventPhase(state); // Event Phase precedes planning from round 2 (Rules p.7)
}

function landAreasControlled(state, fid) {
  let n = 0;
  for (const r of REGIONS) {
    if (r.kind === 'land' && controllerOf(state, r.id) === fid) n++;
  }
  return n;
}

function endGame(state) {
  // Victory: seats; ties by total land areas, then Supply, then the
  // Initiative track (FAQ v2.0 errata, superseding Rules p.16).
  const ranked = state.factions.slice().sort((a, b) =>
    (seatsControlled(state, b) - seatsControlled(state, a)) ||
    (landAreasControlled(state, b) - landAreasControlled(state, a)) ||
    (state.supply[b] - state.supply[a]) ||
    (state.tracks.initiative.indexOf(a) - state.tracks.initiative.indexOf(b)));
  state.phase = 'gameOver';
  state.winner = ranked[0];
  state.log.push({ round: state.round, event: 'gameOver', winner: state.winner });
}
