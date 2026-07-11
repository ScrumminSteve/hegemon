// HEGEMON engine — Combat (M1.d).
// Rules p.17–21, p.25–26. The combat sequence (p.17): call for support ->
// initial strength -> [leader cards: EMPTY SOCKET until M1.5] -> blade token ->
// final strength -> resolution (victor, casualties*, retreats/routing, cleanup).
// *Casualties come from leader-card icons, so with the socket empty they are 0.

import { region, adjacency } from './state.js';
import { SETUP } from '../data/setup.js';
import { PORTS } from '../data/map.js';
import { unitStrength, checkSupply, advanceAction } from './actionPhase.js';

const ADJ = adjacency();
const PORT_CAPACITY = 3; // Rules p.25

// ---------- initiation ----------

/**
 * Called by resolveMarch when a destination is contested. Attacking units are
 * lifted out of the origin into the combat record; they land in the embattled
 * area only on victory (Rules p.15: combat resolves before movement completes).
 */
export function initiateCombat(state, { attacker, origin, target, units, mod, leaveControl }) {
  const enemyUnits = (state.unitsByRegion[target] || []).filter(u => u.faction !== attacker);
  const garrison = state.garrisons[target];
  const defender = enemyUnits.length ? enemyUnits[0].faction : garrison.faction;

  // Lift the attacking force out of the origin.
  const lifted = [];
  for (const [t, n] of Object.entries(units)) {
    let taken = 0;
    state.unitsByRegion[origin] = (state.unitsByRegion[origin] || []).filter(u => {
      if (taken < n && u.faction === attacker && u.type === t && !u.routed) { taken++; lifted.push(u); return false; }
      return true;
    });
  }
  if ((state.unitsByRegion[origin] || []).length === 0) delete state.unitsByRegion[origin];

  state.combat = {
    attacker, defender, origin, region: target, mod, leaveControl,
    attackingUnits: lifted,
    supports: [],            // { faction, region, side, mod, strength }
    bladeBonus: null,        // { faction } when used
    stage: 'support',
  };
  state.log.push({ round: state.round, event: 'combatBegan', attacker, defender, region: target });

  // Call for support (Rules p.17–18): every adjacent support order, declared
  // in initiative order. Combatants may support themselves.
  const calls = [];
  for (const fid of state.tracks.initiative) {
    for (const [rid, o] of Object.entries(state.ordersByRegion)) {
      if (o.faction === fid && o.type === 'support' && ADJ[target].has(rid)) {
        calls.push({ type: 'declareSupport', faction: fid, region: rid, options: ['attacker', 'defender', 'refuse'] });
      }
    }
  }
  state.pendingQueries.push(...calls);
  progressCombat(state);
}

// ---------- support ----------

function supportStrength(state, fid, rid, side, embattled) {
  // Siege engines lend support only when backing an attack on a fortified
  // area (Rules p.18); everything else supports at printed strength.
  const siegeCounts = side === 'attacker' && region(embattled).muster > 0;
  let total = state.ordersByRegion[rid].mod;
  for (const u of state.unitsByRegion[rid] || []) {
    if (u.faction !== fid || u.routed) continue;
    total += unitStrength(u, { fortified: siegeCounts });
  }
  return total;
}

export function declareSupport(state, fid, rid, side) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'declareSupport' && q.faction === fid && q.region === rid);
  if (qi === -1) throw new Error(`${fid} has no pending support declaration at ${rid}`);
  if (!['attacker', 'defender', 'refuse'].includes(side)) throw new Error(`Invalid support side: ${side}`);
  state.pendingQueries.splice(qi, 1);

  if (side !== 'refuse') {
    const strength = supportStrength(state, fid, rid, side, state.combat.region);
    state.combat.supports.push({ faction: fid, region: rid, side, strength });
    state.log.push({ round: state.round, event: 'supportDeclared', faction: fid, region: rid, side, strength });
  } else {
    state.log.push({ round: state.round, event: 'supportRefused', faction: fid, region: rid });
  }
  progressCombat(state);
}

// ---------- blade ----------

export function useBlade(state, fid, use) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'useBlade' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending blade decision`);
  state.pendingQueries.splice(qi, 1);
  if (use) {
    state.combat.bladeBonus = { faction: fid };
    state.roundFlags.bladeUsed = true;
    state.log.push({ round: state.round, event: 'bladeUsed', faction: fid });
  }
  state.combat.stage = 'resolve';
  progressCombat(state);
}

// ---------- strength & resolution ----------

export function combatStrengths(state) {
  const c = state.combat;
  const fortified = region(c.region).muster > 0;

  let atk = c.mod;
  for (const u of c.attackingUnits) atk += unitStrength(u, { fortified });

  let def = 0;
  for (const u of state.unitsByRegion[c.region] || []) {
    if (u.faction === c.defender && !u.routed) def += unitStrength(u, { fortified: false });
  }
  const g = state.garrisons[c.region];
  if (g && g.faction === c.defender) def += g.strength;
  const dOrder = state.ordersByRegion[c.region];
  if (dOrder && dOrder.faction === c.defender && dOrder.type === 'defend') def += dOrder.mod;

  for (const s of c.supports) (s.side === 'attacker') ? (atk += s.strength) : (def += s.strength);
  // [M1.5 SOCKET] leader cards: chooseLeaderCard / resolveCardAbilities add here.
  if (c.bladeBonus) (c.bladeBonus.faction === c.attacker) ? (atk += 1) : (def += 1);
  return { attacker: atk, defender: def };
}

function progressCombat(state) {
  const c = state.combat;
  if (!c) return;
  if (state.pendingQueries.some(q => ['declareSupport', 'useBlade', 'retreat', 'replacePortShips'].includes(q.type))) return;

  if (c.stage === 'support') {
    // [M1.5 SOCKET] chooseLeaderCard queries slot in between support and blade.
    const holder = state.tokens.blade;
    if (!state.roundFlags.bladeUsed && (holder === c.attacker || holder === c.defender)) {
      c.stage = 'blade';
      state.pendingQueries.push({ type: 'useBlade', faction: holder, options: [true, false] });
      return;
    }
    c.stage = 'resolve';
  }
  if (c.stage === 'resolve') resolveCombat(state);
}

function prowessRank(state, fid) { return state.tracks.prowess.indexOf(fid); }

function resolveCombat(state) {
  const c = state.combat;
  const s = combatStrengths(state);
  const victor = s.attacker !== s.defender
    ? (s.attacker > s.defender ? c.attacker : c.defender)
    : (prowessRank(state, c.attacker) < prowessRank(state, c.defender) ? c.attacker : c.defender);
  c.victor = victor;
  state.log.push({ round: state.round, event: 'combatResolved', ...s, victor, tie: s.attacker === s.defender });
  // [M1.5 SOCKET] applyCasualtyIcons(victorCard, defeatedCard) resolves here.

  if (victor === c.attacker) {
    // Garrison defeated in combat is permanently removed (Rules p.26).
    if (state.garrisons[c.region] && state.garrisons[c.region].faction === c.defender) {
      delete state.garrisons[c.region];
      state.log.push({ round: state.round, event: 'garrisonDestroyed', region: c.region });
    }
    const defenders = (state.unitsByRegion[c.region] || []).filter(u => u.faction === c.defender);
    if (defenders.length) {
      const options = legalRetreats(state, c.defender, c.region, c.origin);
      if (options.length === 0) {
        destroyDefenders(state);
        finishAttackerWin(state);
      } else {
        c.stage = 'retreat';
        state.pendingQueries.push({ type: 'retreat', faction: c.defender, options });
      }
    } else {
      finishAttackerWin(state);
    }
  } else {
    // Defeated attacker: survivors bounce back to the origin, routed (Rules p.21).
    state.unitsByRegion[c.origin] = state.unitsByRegion[c.origin] || [];
    for (const u of c.attackingUnits) {
      if (u.type === 'siege_engine') { // siege engines cannot retreat (Rules p.21)
        state.log.push({ round: state.round, event: 'siegeDestroyedRetreating', faction: c.attacker });
        continue;
      }
      u.routed = true;
      state.unitsByRegion[c.origin].push(u);
    }
    state.log.push({ round: state.round, event: 'attackerRepelled', region: c.region });
    endCombat(state);
  }
}

// ---------- retreats (Rules p.21) ----------

export function legalRetreats(state, fid, from, attackOrigin) {
  const retreating = (state.unitsByRegion[from] || []).filter(u => u.faction === fid);
  const naval = retreating.every(u => u.type === 'warship');
  const out = [];
  for (const rid of ADJ[from]) {
    if (rid === attackOrigin) continue;                       // never toward the attack
    const r = region(rid);
    if (naval ? r.kind !== 'maritime' : r.kind !== 'land') continue;
    if (state.neutrals[rid]) continue;
    const units = state.unitsByRegion[rid] || [];
    const enemyUnits = units.some(u => u.faction !== fid);
    const enemyMarker = state.controlMarkers[rid] && state.controlMarkers[rid] !== fid;
    const enemyGarrison = state.garrisons[rid] && state.garrisons[rid].faction !== fid;
    if (enemyUnits || enemyMarker || enemyGarrison) continue;
    out.push(rid);
  }
  return out.sort();
}

export function retreat(state, fid, to) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'retreat' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending retreat`);
  const q = state.pendingQueries[qi];
  if (!q.options.includes(to)) throw new Error(`${to} is not a legal retreat (options: ${q.options.join(', ')})`);
  state.pendingQueries.splice(qi, 1);

  const c = state.combat;
  const movers = (state.unitsByRegion[c.region] || []).filter(u => u.faction === fid);
  state.unitsByRegion[c.region] = (state.unitsByRegion[c.region] || []).filter(u => u.faction !== fid);
  state.unitsByRegion[to] = state.unitsByRegion[to] || [];
  for (const u of movers) {
    if (u.type === 'siege_engine') { state.log.push({ round: state.round, event: 'siegeDestroyedRetreating', faction: fid }); continue; }
    if (u.routed) { state.log.push({ round: state.round, event: 'routedUnitDestroyed', faction: fid }); continue; } // Rules p.21
    u.routed = true;
    state.unitsByRegion[to].push(u);
  }
  // Forced supply compliance: destroy retreating units until legal (Rules p.21).
  destroyForSupply(state, fid, to);
  state.log.push({ round: state.round, event: 'retreated', faction: fid, from: c.region, to });
  finishAttackerWin(state);
}

function destroyForSupply(state, fid, at) {
  const order = ['infantry', 'warship', 'cavalry', 'siege_engine'];
  for (let guard = 0; guard < 12; guard++) {
    try { checkSupply(state, fid); return; } catch {
      const units = state.unitsByRegion[at] || [];
      const idx = order.map(t => units.findIndex(u => u.faction === fid && u.type === t)).find(i => i !== -1);
      if (idx === undefined) return;
      units.splice(idx, 1);
      state.log.push({ round: state.round, event: 'destroyedForSupply', faction: fid, region: at });
    }
  }
}

function destroyDefenders(state) {
  const c = state.combat;
  const n = (state.unitsByRegion[c.region] || []).filter(u => u.faction === c.defender).length;
  state.unitsByRegion[c.region] = (state.unitsByRegion[c.region] || []).filter(u => u.faction !== c.defender);
  state.log.push({ round: state.round, event: 'defendersDestroyed', faction: c.defender, region: c.region, count: n });
}

// ---------- attacker occupation & cleanup ----------

function finishAttackerWin(state) {
  const c = state.combat;

  // Defender's order, control marker, and any stray defender units' claim end here (Rules p.21).
  const o = state.ordersByRegion[c.region];
  if (o && o.faction === c.defender) delete state.ordersByRegion[c.region];
  if (state.controlMarkers[c.region] === c.defender) delete state.controlMarkers[c.region];

  // Attackers occupy.
  state.unitsByRegion[c.region] = state.unitsByRegion[c.region] || [];
  for (const u of c.attackingUnits) state.unitsByRegion[c.region].push(u);

  // Vacated-origin control option carried through the march (Rules p.24).
  const originVacated = !(state.unitsByRegion[c.origin] || []).some(u => u.faction === c.attacker);
  if (originVacated && c.leaveControl) {
    const r = region(c.origin);
    if (r.kind === 'land' && r.home !== c.attacker && state.authority[c.attacker] >= 1) {
      state.authority[c.attacker] -= 1;
      state.controlMarkers[c.origin] = c.attacker;
      state.log.push({ round: state.round, event: 'controlEstablished', faction: c.attacker, region: c.origin });
    }
  }
  checkSupply(state, c.attacker);

  // Port capture: enemy ships in the fallen land's port are removed; the
  // victor may replace them with available ships (Rules p.25).
  const port = PORTS.find(p => p.landId === c.region);
  if (port) {
    const enemyShips = (state.unitsByRegion[port.id] || []).filter(u => u.faction !== c.attacker);
    if (enemyShips.length) {
      state.unitsByRegion[port.id] = (state.unitsByRegion[port.id] || []).filter(u => u.faction === c.attacker);
      const inPlay = Object.values(state.unitsByRegion).flat().filter(u => u.faction === c.attacker && u.type === 'warship').length;
      const max = Math.min(enemyShips.length, SETUP.unitPool.warship - inPlay, PORT_CAPACITY);
      state.log.push({ round: state.round, event: 'portShipsRemoved', port: port.id, count: enemyShips.length });
      if (max > 0) {
        c.stage = 'port';
        state.pendingQueries.push({ type: 'replacePortShips', faction: c.attacker, port: port.id, max });
        return;
      }
    }
  }
  endCombat(state);
}

export function replacePortShips(state, fid, count) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'replacePortShips' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending port decision`);
  const q = state.pendingQueries[qi];
  if (!Number.isInteger(count) || count < 0 || count > q.max) throw new Error(`Replace 0–${q.max} ships`);
  state.pendingQueries.splice(qi, 1);
  state.unitsByRegion[q.port] = state.unitsByRegion[q.port] || [];
  for (let i = 0; i < count; i++) state.unitsByRegion[q.port].push({ faction: fid, type: 'warship', routed: false });
  if (count) state.log.push({ round: state.round, event: 'portShipsReplaced', port: q.port, faction: fid, count });
  endCombat(state);
}

function endCombat(state) {
  const c = state.combat;
  delete state.combat;
  state.log.push({ round: state.round, event: 'combatEnded', region: c.region });
  advanceAction(state); // hand back to the action-phase cycler
}
