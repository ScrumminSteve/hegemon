// HEGEMON engine — Combat (M1.d).
// Rules p.17–21, p.25–26. The combat sequence (p.17): call for support ->
// initial strength -> [leader cards: EMPTY SOCKET until M1.5] -> blade token ->
// final strength -> resolution (victor, casualties*, retreats/routing, cleanup).
// *Casualties come from leader-card icons, so with the socket empty they are 0.

import { region, regionProps, adjacency, controllerOf } from './state.js';
import { SETUP } from '../data/setup.js';
import { PORTS, REGIONS } from '../data/map.js';
import { unitStrength, checkSupply, advanceAction } from './actionPhase.js';
import { transportReachable } from './actionPhase.js';
import { queueCardSelection, recycleHands, cardStrength, unitOverride, shipsZeroed, defenseOrderMultiplier, casualtyCount, card, revealSingle, IMMEDIATE_HOOKS } from './cards.js';

const ADJ = adjacency();
const REGIONS_ALL = REGIONS;
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
  const siegeCounts = side === 'attacker' && regionProps(state, embattled).muster > 0;
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
  const c0 = state.combat;
  if ((fid === c0.attacker && side === 'defender') || (fid === c0.defender && side === 'attacker')) {
    throw new Error('A combatant cannot support against themselves (FAQ v2.0)');
  }
  state.pendingQueries.splice(qi, 1);

  if (side !== 'refuse') {
    const strength = supportStrength(state, fid, rid, side, state.combat.region);
    state.combat.supports.push({ faction: fid, region: rid, side });
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
  state.combat.bladeDecided = true;
  progressCombat(state);
}

// ---------- strength & resolution ----------

export function combatStrengths(state) {
  const c = state.combat;
  const fortified = regionProps(state, c.region).muster > 0;
  const combatantOf = side => side === 'attacker' ? c.attacker : c.defender;

  // Per-unit value with card hooks applied (overrides, ship-zeroing, siege rules).
  const unitVal = (u, side, siegeCounts) => {
    if (u.type === 'warship' && shipsZeroed(state, u.faction)) return 0;
    const ov = unitOverride(state, combatantOf(side));
    if (ov && u.type === ov.unit && u.faction === combatantOf(side)) return ov.bonus;
    return unitStrength(u, { fortified: siegeCounts });
  };

  let atk = c.mod + cardStrength(state, c.attacker);
  for (const u of c.attackingUnits) atk += unitVal(u, 'attacker', fortified);

  let def = cardStrength(state, c.defender);
  for (const u of state.unitsByRegion[c.region] || []) {
    if (u.faction === c.defender && !u.routed) def += unitVal(u, 'defender', false);
  }
  const g = state.garrisons[c.region];
  if (g && g.faction === c.defender) def += g.strength;
  const dOrder = state.ordersByRegion[c.region];
  if (dOrder && dOrder.faction === c.defender && dOrder.type === 'defend') {
    def += dOrder.mod * defenseOrderMultiplier(state, c.defender);
  }

  for (const sp of c.supports) {
    // A removed support order withdraws its units' strength too (FAQ v2.0).
    const o = state.ordersByRegion[sp.region];
    if (!o || o.type !== 'support' || o.faction !== sp.faction) continue;
    let val = o.mod;
    const siegeCounts = sp.side === 'attacker' && fortified;
    for (const u of state.unitsByRegion[sp.region] || []) {
      if (u.faction !== sp.faction || u.routed) continue;
      val += u.type === 'siege_engine' && !siegeCounts ? 0 : unitVal(u, sp.side, siegeCounts);
    }
    (sp.side === 'attacker') ? (atk += val) : (def += val);
  }
  if (c.bladeBonus) (c.bladeBonus.faction === c.attacker) ? (atk += 1) : (def += 1);
  return { attacker: Math.max(0, atk), defender: Math.max(0, def) }; // no negative finals (FAQ v2.0)
}

const BLOCKING = ['declareSupport', 'chooseLeaderCard', 'useCardAbility', 'cardTarget',
  'useBlade', 'chooseCasualties', 'retreat', 'replacePortShips'];

export function progressCombat(state) {
  const c = state.combat;
  if (!c) return;
  if (state.pendingQueries.some(q => BLOCKING.includes(q.type))) return;

  if (c.stage === 'support') {
    c.stage = 'cards';
    if (state.ruleset.leaderCards) {
      if (queueCardSelection(state)) return;
      c.cardsRevealed = true; // both hands somehow empty: fight cardless
    }
  }
  if (c.stage === 'cards') {
    if (c.cards && !c.cardsRevealed) return; // picks outstanding
    if (!processImmediates(state)) return;
    c.stage = 'blade';
  }
  if (c.stage === 'blade' && !c.bladeDecided) {
    const holder = state.tokens.blade;
    if (!state.roundFlags.bladeUsed && (holder === c.attacker || holder === c.defender)) {
      c.bladeDecided = true;
      state.pendingQueries.push({ type: 'useBlade', faction: holder, options: [true, false] });
      return;
    }
  }
  if (c.stage === 'blade') c.stage = 'resolve';
  if (c.stage === 'resolve') { computeVictor(state); c.stage = 'casualties'; }
  if (c.stage === 'casualties') {
    if (!settleCasualties(state)) return;
    c.stage = 'post';
  }
  if (c.stage === 'post') {
    if (!processPostTriggers(state)) return;
    c.stage = 'conclude';
  }
  if (c.stage === 'conclude') concludeCombat(state);
}

// ---------- immediate card abilities (on reveal; M1.5b) ----------
// Ruleset note (strict): cancel/swap windows resolve first, then the other
// "immediately" abilities in initiative order — matching the digital edition.

function opponentOf(state, fid) {
  const c = state.combat;
  return fid === c.attacker ? c.defender : c.attacker;
}

function hookOf(state, fid) {
  const id = state.combat.cards?.[fid];
  return id ? card(id).hook : null;
}

export function buildImmediates(state) {
  const c = state.combat;
  const order = state.tracks.initiative.filter(f => f === c.attacker || f === c.defender);
  const phase = t => (t === 'cancelOpponentCard' || t === 'swapSelfForAuthority') ? 0 : 1;
  const list = [];
  for (const fid of order) {
    const h = hookOf(state, fid);
    if (h && IMMEDIATE_HOOKS.includes(h.type)) list.push({ faction: fid, type: h.type });
  }
  return list.sort((a, b) => phase(a.type) - phase(b.type));
}

function processImmediates(state) {
  const c = state.combat;
  if (!state.ruleset.leaderCards || !c.cards) return true;
  if (!c.immediates) c.immediates = buildImmediates(state);

  while (c.immediates.length) {
    const t = c.immediates[0];
    const opp = opponentOf(state, t.faction);
    if (t.type === 'cancelOpponentCard') {
      if (!c.cards[opp]) { c.immediates.shift(); continue; } // nothing to cancel
      state.pendingQueries.push({ type: 'useCardAbility', faction: t.faction,
        ability: t.type, card: c.cards[t.faction], options: [true, false] });
      return false;
    }
    if (t.type === 'swapSelfForAuthority') {
      const h = hookOf(state, t.faction);
      if (state.authority[t.faction] < h.cost || state.leaderHands[t.faction].length === 0) {
        c.immediates.shift(); continue; // "if able"
      }
      state.pendingQueries.push({ type: 'useCardAbility', faction: t.faction,
        ability: t.type, card: c.cards[t.faction], cost: h.cost, options: [true, false] });
      return false;
    }
    if (t.type === 'destroyEnemyInfantry') {
      c.immediates.shift();
      const pool = opp === c.attacker ? c.attackingUnits
        : (state.unitsByRegion[c.region] || []).filter(u => u.faction === opp);
      const i = pool.findIndex(u => u.type === 'infantry');
      if (i !== -1) {
        if (opp === c.attacker) c.attackingUnits.splice(i, 1);
        else {
          const all = state.unitsByRegion[c.region];
          all.splice(all.indexOf(pool[i]), 1);
        }
        state.log.push({ round: state.round, event: 'cardUnitDestroyed', faction: opp, unit: 'infantry', by: c.cards[t.faction] });
      }
      continue;
    }
    if (t.type === 'removeAdjacentEnemyOrder') {
      c.immediates.shift();
      const options = [...ADJ[c.region]].filter(rid =>
        state.ordersByRegion[rid] && state.ordersByRegion[rid].faction === opp).sort();
      if (!options.length) continue;
      state.pendingQueries.push({ type: 'cardTarget', faction: t.faction,
        ability: t.type, card: c.cards[t.faction], options });
      return false;
    }
    if (t.type === 'moveOpponentToTrackBottom') {
      c.immediates.shift();
      state.pendingQueries.push({ type: 'cardTarget', faction: t.faction,
        ability: t.type, card: c.cards[t.faction], options: ['initiative', 'prowess', 'command'] });
      return false;
    }
    c.immediates.shift(); // unknown: never wedge the battle
  }
  return true;
}

/** Dominance tokens follow the track leaders (Rules p.10). */
function reassignDominanceTokens(state) {
  state.tokens.sovereign = state.tracks.initiative[0];
  state.tokens.blade = state.tracks.prowess[0];
  state.tokens.courier = state.tracks.command[0];
}

export function useCardAbility(state, fid, use) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'useCardAbility' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending card-ability decision`);
  const q = state.pendingQueries[qi];
  state.pendingQueries.splice(qi, 1);
  const c = state.combat;
  c.immediates.shift();

  if (use && q.ability === 'cancelOpponentCard') {
    const opp = opponentOf(state, fid);
    const canceledId = c.cards[opp];
    // The canceled card returns to hand but may not be re-chosen this combat.
    state.leaderDiscards[opp] = state.leaderDiscards[opp].filter(x => x !== canceledId);
    state.leaderHands[opp].push(canceledId);
    state.leaderHands[opp].sort();
    c.cards[opp] = null;
    c.immediates = c.immediates.filter(t => t.faction !== opp); // its ability dies with it
    state.log.push({ round: state.round, event: 'cardCanceled', faction: opp, card: canceledId, by: q.card });
    const options = state.leaderHands[opp].filter(x => x !== canceledId);
    if (options.length) {
      state.pendingQueries.push({ type: 'chooseLeaderCard', faction: opp, hand: options, repick: true });
      return; // progress resumes after the re-pick
    }
    state.log.push({ round: state.round, event: 'foughtCardless', faction: opp });
  }
  if (use && q.ability === 'swapSelfForAuthority') {
    state.authority[fid] -= q.cost;
    c.cards[fid] = null; // the discarded card stays in the discard pile
    state.log.push({ round: state.round, event: 'cardSwapped', faction: fid, card: q.card, cost: q.cost });
    state.pendingQueries.push({ type: 'chooseLeaderCard', faction: fid,
      hand: state.leaderHands[fid].slice(), repick: true });
    return;
  }
  progressCombat(state);
}

export function cardTarget(state, fid, target) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'cardTarget' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending card target`);
  const q = state.pendingQueries[qi];
  if (![...q.options, ...(q.skippable ? ['skip'] : [])].includes(target)) {
    throw new Error(`${target} is not a legal target (options: ${q.options.join(', ')}${q.skippable ? ', skip' : ''})`);
  }
  state.pendingQueries.splice(qi, 1);
  const c = state.combat;

  if (target !== 'skip') {
    if (q.ability === 'removeAdjacentEnemyOrder') {
      const victim = state.ordersByRegion[target].faction;
      delete state.ordersByRegion[target];
      state.log.push({ round: state.round, event: 'orderRemovedByCard', region: target, faction: victim, by: q.card });
    } else if (q.ability === 'moveOpponentToTrackBottom') {
      const opp = opponentOf(state, fid);
      state.tracks[target] = [...state.tracks[target].filter(f => f !== opp), opp];
      reassignDominanceTokens(state);
      state.log.push({ round: state.round, event: 'trackDemoted', faction: opp, track: target, by: q.card });
    } else if (q.ability === 'onWinRemoveEnemyOrder') {
      const victim = state.ordersByRegion[target].faction;
      delete state.ordersByRegion[target];
      state.log.push({ round: state.round, event: 'orderRemovedByCard', region: target, faction: victim, by: q.card });
    } else if (q.ability === 'onWinUpgradeInfantry') {
      const pool = target === 'embattled'
        ? (fid === c.attacker ? c.attackingUnits : (state.unitsByRegion[c.region] || []).filter(u => u.faction === fid))
        : (state.unitsByRegion[target] || []).filter(u => u.faction === fid);
      const u = pool.find(x => x.type === 'infantry');
      u.type = 'cavalry';
      state.log.push({ round: state.round, event: 'cardUnitUpgraded', faction: fid, region: target === 'embattled' ? c.region : target, by: q.card });
    } else if (q.ability === 'afterCombatDiscardOpponentCard') {
      const opp = q.opponent;
      state.leaderHands[opp] = state.leaderHands[opp].filter(x => x !== target);
      state.leaderDiscards[opp].push(target);
      state.log.push({ round: state.round, event: 'cardDiscardedByCard', faction: opp, card: target, by: q.card });
      // Forcing out the 7th card counts as the last card played: it stays
      // discarded and the other six return (FAQ v2.0).
      if (state.leaderHands[opp].length === 0 && state.leaderDiscards[opp].length === 7) {
        state.leaderHands[opp] = state.leaderDiscards[opp].filter(x => x !== target);
        state.leaderDiscards[opp] = [target];
        state.log.push({ round: state.round, event: 'leaderHandRecycled', faction: opp });
      }
    }
  }
  if (q.ability === 'afterCombatDiscardOpponentCard') { c.afterCombatDone = true; endCombat(state); return; }
  if (c.postQueue && q.post) { c.postQueue.shift(); }
  progressCombat(state);
}

function prowessRank(state, fid) { return state.tracks.prowess.indexOf(fid); }

function computeVictor(state) {
  const c = state.combat;
  const s = combatStrengths(state);
  let victor;
  if (s.attacker !== s.defender) {
    victor = s.attacker > s.defender ? c.attacker : c.defender;
  } else {
    // Ties break to the better Prowess position (Rules p.20).
    victor = prowessRank(state, c.attacker) < prowessRank(state, c.defender) ? c.attacker : c.defender;
  }
  c.victor = victor;
  const defeated = victor === c.attacker ? c.defender : c.attacker;
  state.log.push({ round: state.round, event: 'combatResolved', ...s, victor, tie: s.attacker === s.defender });

  if (state.ruleset.leaderCards && c.cards) {
    applyAutoResultTriggers(state, victor, defeated);
    recycleHands(state);
    c.postQueue = buildPostQueue(state, victor, defeated);
  }
}

// Automatic win/lose card effects, before casualties (M1.5b).
function applyAutoResultTriggers(state, victor, defeated) {
  const c = state.combat;
  const vh = c.cards[victor] ? card(c.cards[victor]).hook : null;
  const lh = c.cards[defeated] ? card(c.cards[defeated]).hook : null;

  if (vh?.type === 'onWinGainAuthority') {
    state.authority[victor] += vh.amount;
    state.log.push({ round: state.round, event: 'authorityFromCard', faction: victor, amount: vh.amount, by: c.cards[victor] });
  }
  if (vh?.type === 'onWinChooseEnemyRetreat') c.retreatChooser = victor;
  if (vh?.type === 'onWinReuseMarchOrder' && victor === c.attacker) c.reuseMarch = true;

  if (lh?.type === 'onLoseRecoverDiscard') {
    // The entire discard pile (this card included) returns to hand.
    state.leaderHands[defeated].push(...state.leaderDiscards[defeated]);
    state.leaderHands[defeated].sort();
    state.leaderDiscards[defeated] = [];
    state.log.push({ round: state.round, event: 'discardRecovered', faction: defeated, by: c.cards[defeated] });
  }
  if (lh?.type === 'onLoseDefendingBlockAdvance' && defeated === c.defender) c.blockAdvance = true;

  // "After combat" windows arm for either combatant, win or lose.
  for (const fid of [c.attacker, c.defender]) {
    const h = c.cards[fid] ? card(c.cards[fid]).hook : null;
    if (h?.type === 'afterCombatDiscardOpponentCard') c.afterCombat = { faction: fid };
  }
}

// Win/lose effects that need a decision, after casualties (M1.5b).
function buildPostQueue(state, victor, defeated) {
  const c = state.combat;
  const vh = c.cards[victor] ? card(c.cards[victor]).hook : null;
  const queue = [];
  if (vh?.type === 'onWinRemoveEnemyOrder') queue.push({ faction: victor, type: vh.type, loser: defeated });
  if (vh?.type === 'onWinUpgradeInfantry') queue.push({ faction: victor, type: vh.type });
  return queue;
}

function processPostTriggers(state) {
  const c = state.combat;
  if (!c.postQueue) return true;
  while (c.postQueue.length) {
    const t = c.postQueue[0];
    if (t.type === 'onWinRemoveEnemyOrder') {
      const options = Object.keys(state.ordersByRegion)
        .filter(rid => state.ordersByRegion[rid].faction === t.loser).sort();
      if (!options.length) { c.postQueue.shift(); continue; }
      state.pendingQueries.push({ type: 'cardTarget', faction: t.faction, ability: t.type,
        card: c.cards[t.faction], options, skippable: true, post: true });
      return false;
    }
    if (t.type === 'onWinUpgradeInfantry') {
      const fid = t.faction;
      const onBoard = Object.values(state.unitsByRegion).flat()
        .filter(u => u.faction === fid && u.type === 'cavalry').length
        + c.attackingUnits.filter(u => u.faction === fid && u.type === 'cavalry').length;
      if (onBoard >= SETUP.unitPool.cavalry) { c.postQueue.shift(); continue; }
      const options = [];
      const participants = fid === c.attacker ? c.attackingUnits
        : (state.unitsByRegion[c.region] || []).filter(u => u.faction === fid);
      if (participants.some(u => u.type === 'infantry')) options.push('embattled');
      for (const sp of c.supports) {
        if (sp.faction !== fid) continue; // only your own supporting units (card text)
        if ((state.unitsByRegion[sp.region] || []).some(u => u.faction === fid && u.type === 'infantry')) {
          options.push(sp.region);
        }
      }
      if (!options.length) { c.postQueue.shift(); continue; }
      state.pendingQueries.push({ type: 'cardTarget', faction: fid, ability: t.type,
        card: c.cards[fid], options: [...new Set(options)].sort(), skippable: true, post: true });
      return false;
    }
    c.postQueue.shift();
  }
  return true;
}

/** Casualty settlement: auto when forced, a query when there's a real choice. */
function settleCasualties(state) {
  const c = state.combat;
  if (c.casualtiesSettled || !state.ruleset.leaderCards || !c.cards) return true;
  c.casualtiesSettled = true;
  const victor = c.victor;
  const defeated = victor === c.attacker ? c.defender : c.attacker;
  const n = casualtyCount(state, victor);
  if (n <= 0) return true;
  // Siege engines can never be chosen as casualties (FAQ v2.0).
  const pool = (defeated === c.attacker
    ? c.attackingUnits
    : (state.unitsByRegion[c.region] || []).filter(u => u.faction === defeated)
  ).filter(u => u.type !== 'siege_engine');
  const byType = {};
  for (const u of pool) byType[u.type] = (byType[u.type] || 0) + 1;
  if (!pool.length) return true;
  if (pool.length <= n || Object.keys(byType).length === 1) {
    applyCasualties(state, defeated, autoPick(byType, Math.min(n, pool.length)));
    return true;
  }
  state.pendingQueries.push({ type: 'chooseCasualties', faction: defeated, count: n, available: byType });
  return false;
}

function autoPick(byType, n) {
  const pick = {};
  for (const [t, c] of Object.entries(byType)) {
    const take = Math.min(n, c);
    if (take) pick[t] = take;
    n -= take;
    if (!n) break;
  }
  return pick;
}

export function chooseCasualties(state, fid, units) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'chooseCasualties' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending casualty choice`);
  const q = state.pendingQueries[qi];
  const total = Object.values(units).reduce((a, b) => a + b, 0);
  if (total !== q.count) throw new Error(`Choose exactly ${q.count} casualties (Rules p.20)`);
  for (const [t, n] of Object.entries(units)) {
    if ((q.available[t] || 0) < n) throw new Error(`Only ${q.available[t] || 0} ${t} available`);
  }
  state.pendingQueries.splice(qi, 1);
  applyCasualties(state, fid, units);
  progressCombat(state);
}

function applyCasualties(state, fid, units) {
  const c = state.combat;
  for (const [t, n] of Object.entries(units)) {
    let left = n;
    if (fid === c.attacker) {
      c.attackingUnits = c.attackingUnits.filter(u => (left && u.type === t) ? (left--, false) : true);
    } else {
      state.unitsByRegion[c.region] = (state.unitsByRegion[c.region] || []).filter(u =>
        (left && u.faction === fid && u.type === t) ? (left--, false) : true);
    }
  }
  state.log.push({ round: state.round, event: 'casualtiesTaken', faction: fid, units });
}

function concludeCombat(state) {
  const c = state.combat;
  const victor = c.victor;
  if (victor === c.attacker) {
    // Garrison defeated in combat is permanently removed (Rules p.26).
    if (state.garrisons[c.region] && state.garrisons[c.region].faction === c.defender) {
      delete state.garrisons[c.region];
      state.log.push({ round: state.round, event: 'garrisonDestroyed', region: c.region });
    }
    const defenders = (state.unitsByRegion[c.region] || []).filter(u => u.faction === c.defender);
    if (defenders.length) {
      let options = legalRetreats(state, c.defender, c.region, c.origin);
      let chooser = c.defender;
      if (options.length && c.retreatChooser) {
        // The victor directs the retreat, but only among the destinations
        // where the loser sheds the fewest units (card text).
        chooser = c.retreatChooser;
        const losses = options.map(to => retreatLosses(state, c.defender, to));
        const min = Math.min(...losses);
        options = options.filter((_, i) => losses[i] === min);
      }
      if (options.length === 0) {
        destroyDefenders(state);
        finishAttackerWin(state);
      } else {
        c.stage = 'retreat';
        state.pendingQueries.push({ type: 'retreat', faction: chooser, retreating: c.defender, options });
      }
    } else {
      finishAttackerWin(state);
    }
  } else {
    // Robb-class ability, defender's win: the victor DIRECTS the attacker's
    // retreat — origin, or any area not controlled by another player, incl.
    // ship-transport-connected land (FAQ v2.0).
    if (c.retreatChooser && c.retreatChooser === c.defender) {
      const attackerNaval = c.attackingUnits.every(u => u.type === 'warship');
      const opts = new Set(legalRetreats(state, c.attacker, c.region, null, attackerNaval));
      const originOwner0 = controllerOf(state, c.origin);
      if (!originOwner0 || originOwner0 === c.attacker) opts.add(c.origin);
      opts.delete(c.region);
      if (opts.size === 0) {
        state.log.push({ round: state.round, event: 'attackersDestroyedNoRetreat', region: c.region, faction: c.attacker, count: c.attackingUnits.length });
        state.log.push({ round: state.round, event: 'attackerRepelled', region: c.region });
        endCombat(state);
        return;
      }
      state.pendingQueries.push({ type: 'retreat', faction: c.retreatChooser,
        retreating: c.attacker, options: [...opts].sort(), attackerBounce: true });
      return; // resolved by the retreat answer
    }
    // Defeated attacker: survivors bounce back to the origin, routed (Rules p.21).
    // If the origin is now hostile (e.g. a vacated enemy home whose control
    // reverted), there is no legal retreat: the force is destroyed (FAQ v2.0).
    const originOwner = controllerOf(state, c.origin);
    if (originOwner && originOwner !== c.attacker) {
      state.log.push({ round: state.round, event: 'attackersDestroyedNoRetreat', region: c.origin, faction: c.attacker, count: c.attackingUnits.length });
      state.log.push({ round: state.round, event: 'attackerRepelled', region: c.region });
      endCombat(state);
      return;
    }
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

export function legalRetreats(state, fid, from, attackOrigin, navalOverride = null) {
  const retreating = (state.unitsByRegion[from] || []).filter(u => u.faction === fid);
  // Beaten attackers are off-board (held in combat state): callers directing
  // their retreat must say what is retreating rather than trust the region.
  const naval = navalOverride ?? (retreating.length > 0 && retreating.every(u => u.type === 'warship'));
  const out = [];
  // Adjacent areas, plus land areas connected by friendly ship transport (FAQ v2.0).
  const candidates = new Set(ADJ[from]);
  if (!naval) {
    for (const r of REGIONS_ALL) {
      if (r.kind === 'land' && r.id !== from && transportReachable(state, fid, from, r.id)) {
        candidates.add(r.id);
      }
    }
  }
  if (naval) {
    for (const pdef of PORTS) {
      if (pdef.seaId !== from) continue;
      if (controllerOf(state, pdef.landId) !== fid) continue;   // must own the harbor
      const occupants = state.unitsByRegion[pdef.id] || [];
      if (occupants.some(u => u.faction !== fid)) continue;
      if (occupants.length >= PORT_CAPACITY) continue;          // 3-ship cap (Rules p.25)
      out.push(pdef.id);
    }
  }
  for (const rid of candidates) {
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
  {
    const qb = state.pendingQueries.find(x => x.type === 'retreat' && x.faction === fid && x.attackerBounce);
    if (qb) {
      if (!qb.options.includes(to)) throw new Error(`${to} is not among the directed retreat options`);
      state.pendingQueries.splice(state.pendingQueries.indexOf(qb), 1);
      const c = state.combat;
      state.unitsByRegion[to] = state.unitsByRegion[to] || [];
      for (const u of c.attackingUnits) { u.routed = true; state.unitsByRegion[to].push(u); }
      state.log.push({ round: state.round, event: 'retreated', faction: c.attacker, from: c.region, to, directedBy: fid, count: c.attackingUnits.length });
      state.log.push({ round: state.round, event: 'attackerRepelled', region: c.region });
      destroyForSupply(state, c.attacker, to);
      endCombat(state);
      return;
    }
  }
  const qi = state.pendingQueries.findIndex(q => q.type === 'retreat' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending retreat`);
  const q = state.pendingQueries[qi];
  if (!q.options.includes(to)) throw new Error(`${to} is not a legal retreat (options: ${q.options.join(', ')})`);
  state.pendingQueries.splice(qi, 1);

  const c = state.combat;
  const rfid = q.retreating || fid;
  const movers = (state.unitsByRegion[c.region] || []).filter(u => u.faction === rfid);
  state.unitsByRegion[c.region] = (state.unitsByRegion[c.region] || []).filter(u => u.faction !== rfid);
  state.unitsByRegion[to] = state.unitsByRegion[to] || [];
  for (const u of movers) {
    if (u.type === 'siege_engine') { state.log.push({ round: state.round, event: 'siegeDestroyedRetreating', faction: rfid }); continue; }
    if (u.routed) { state.log.push({ round: state.round, event: 'routedUnitDestroyed', faction: rfid }); continue; } // Rules p.21
    u.routed = true;
    state.unitsByRegion[to].push(u);
  }
  // Forced supply compliance: destroy retreating units until legal (Rules p.21).
  destroyForSupply(state, rfid, to);
  state.log.push({ round: state.round, event: 'retreated', faction: rfid, from: c.region, to });
  finishAttackerWin(state);
}

/** How many defender units a retreat to `to` would shed to supply (pure probe). */
export function retreatLosses(state, fid, to) {
  const sim = structuredClone(state);
  sim.pendingQueries = [];
  const movers = (sim.unitsByRegion[sim.combat.region] || []).filter(u => u.faction === fid && u.type !== 'siege_engine' && !u.routed);
  sim.unitsByRegion[sim.combat.region] = (sim.unitsByRegion[sim.combat.region] || []).filter(u => u.faction !== fid);
  sim.unitsByRegion[to] = sim.unitsByRegion[to] || [];
  for (const u of movers) sim.unitsByRegion[to].push(u);
  const before = sim.log.length;
  destroyForSupply(sim, fid, to);
  return sim.log.slice(before).filter(e => e.event === 'destroyedForSupply').length;
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

  if (c.blockAdvance) {
    // The loser's card denies the advance: attackers return whence they
    // marched, unrouted; the area is not captured (card text).
    const o0 = state.ordersByRegion[c.region];
    if (o0 && o0.faction === c.defender) delete state.ordersByRegion[c.region];
    state.unitsByRegion[c.origin] = state.unitsByRegion[c.origin] || [];
    for (const u of c.attackingUnits) state.unitsByRegion[c.origin].push(u);
    state.log.push({ round: state.round, event: 'advanceBlocked', region: c.region, faction: c.attacker, by: c.cards[c.defender] });
    checkSupply(state, c.attacker);
    endCombat(state);
    return;
  }

  // Defender's order, control marker, and any stray defender units' claim end here (Rules p.21).
  const o = state.ordersByRegion[c.region];
  if (o && o.faction === c.defender) delete state.ordersByRegion[c.region];
  if (state.controlMarkers[c.region] === c.defender) delete state.controlMarkers[c.region];

  // Attackers occupy.
  state.unitsByRegion[c.region] = state.unitsByRegion[c.region] || [];
  for (const u of c.attackingUnits) state.unitsByRegion[c.region].push(u);

  if (c.reuseMarch) {
    // The victor's card carries the March order into the conquered area,
    // ready to be resolved again this round (card text).
    state.ordersByRegion[c.region] = { faction: c.attacker, type: 'march', mod: c.mod, starred: c.mod === 1 };
    state.log.push({ round: state.round, event: 'cardMarchMoved', faction: c.attacker, region: c.region, by: c.cards[c.attacker] });
  }

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
  if (c.afterCombat && !c.afterCombatDone) {
    const fid = c.afterCombat.faction;
    const opp = fid === c.attacker ? c.defender : c.attacker;
    if (state.leaderHands[opp].length) {
      c.afterCombatDone = false;
      state.pendingQueries.push({ type: 'cardTarget', faction: fid,
        ability: 'afterCombatDiscardOpponentCard', card: c.cards[fid],
        opponent: opp, options: state.leaderHands[opp].slice().sort(), skippable: true });
      return; // resumes via cardTarget -> endCombat
    }
    c.afterCombatDone = true;
  }
  delete state.combat;
  // Combat cleanup: order tokens in areas without units are removed (FAQ v2.0 errata).
  for (const [rid, o] of Object.entries(state.ordersByRegion)) {
    if (!(state.unitsByRegion[rid] || []).some(u => u.faction === o.faction)) {
      delete state.ordersByRegion[rid];
      state.log.push({ round: state.round, event: 'orderSwept', region: rid, faction: o.faction });
    }
  }
  state.log.push({ round: state.round, event: 'combatEnded', region: c.region });
  advanceAction(state); // hand back to the action-phase cycler
}
