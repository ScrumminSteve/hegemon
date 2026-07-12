// HEGEMON engine — leader cards, M1.5a (Rules p.19–20).
// Covers: hand lifecycle (7 cards, recycle after the last is spent), mandatory
// hidden simultaneous selection, reveal, passive strength/icon hooks, and
// casualty resolution from sword/fortification icons. Interactive text
// abilities ship in M1.5b; until then they are logged and inert.

import { LEADER_CARDS, HAND_BY_FACTION } from '../data/leaderCards.js';
import { region, regionProps } from './state.js';

export function card(id) { return LEADER_CARDS[id]; }

export const IMMEDIATE_HOOKS = ['cancelOpponentCard', 'swapSelfForAuthority',
  'destroyEnemyInfantry', 'removeAdjacentEnemyOrder', 'moveOpponentToTrackBottom'];

export function initLeaderHands(state) {
  state.leaderHands = {};
  state.leaderDiscards = {};
  for (const fid of state.factions) {
    state.leaderHands[fid] = HAND_BY_FACTION[fid].slice();
    state.leaderDiscards[fid] = [];
  }
}

/** Both combatants with non-empty hands must choose a card (Rules p.19). */
export function queueCardSelection(state) {
  const c = state.combat;
  c.cards = {};
  c.stage = 'cards';
  let queued = 0;
  for (const fid of [c.attacker, c.defender]) {
    if ((state.leaderHands[fid] || []).length) {
      state.pendingQueries.push({ type: 'chooseLeaderCard', faction: fid, hand: state.leaderHands[fid].slice() });
      queued++;
    } else {
      c.cards[fid] = null; // fought without a card — possible only mid-recycle edge
    }
  }
  return queued > 0;
}

export function chooseLeaderCard(state, fid, cardId) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'chooseLeaderCard' && q.faction === fid);
  if (qi === -1) throw new Error(`${fid} has no pending leader-card choice`);
  const q = state.pendingQueries[qi];
  if (!q.hand.includes(cardId)) {
    throw new Error(`${cardId} is not available (Rules p.19: choose from your eligible cards)`);
  }
  state.pendingQueries.splice(qi, 1);
  state.combat.cards[fid] = cardId;

  if (q.repick) {
    // A cancel/swap replacement is revealed openly, and its own
    // "immediately" ability fires at this point in the window.
    revealSingle(state, fid, cardId);
    const h = card(cardId).hook;
    if (h && IMMEDIATE_HOOKS.includes(h.type)) {
      state.combat.immediates.unshift({ faction: fid, type: h.type });
    }
    return;
  }

  state.log.push({ round: state.round, event: 'leaderCardChosen', faction: fid });
  if (!state.pendingQueries.some(q2 => q2.type === 'chooseLeaderCard')) revealCards(state);
}

export function revealSingle(state, fid, id) {
  state.leaderHands[fid] = state.leaderHands[fid].filter(x => x !== id);
  state.leaderDiscards[fid].push(id);
  state.log.push({ round: state.round, event: 'leaderCardRevealed', faction: fid, card: id });
}

function revealCards(state) {
  const c = state.combat;
  c.cardsRevealed = true;
  for (const fid of [c.attacker, c.defender]) {
    if (c.cards[fid]) revealSingle(state, fid, c.cards[fid]);
  }
}

/** Recycle: a player who spent their 7th card takes the other six back (Rules p.19). */
export function recycleHands(state) {
  for (const fid of [state.combat.attacker, state.combat.defender]) {
    if ((state.leaderHands[fid] || []).length === 0 && state.leaderDiscards[fid].length === 7) {
      const last = state.combat.cards[fid];
      state.leaderHands[fid] = state.leaderDiscards[fid].filter(x => x !== last);
      state.leaderDiscards[fid] = [last];
      state.log.push({ round: state.round, event: 'leaderHandRecycled', faction: fid });
    }
  }
}

// ---------- hook-aware combat math ----------

function side(state, fid) { return fid === state.combat.attacker ? 'attacker' : 'defender'; }

/** Effective printed strength + conditional bonuses for a combatant's card. */
export function cardStrength(state, fid) {
  const c = state.combat;
  const id = c.cards?.[fid];
  if (!id || !c.cardsRevealed) return 0;
  const me = card(id);
  const opp = fid === c.attacker ? c.defender : c.attacker;
  const oppCard = c.cards?.[opp] ? card(c.cards[opp]) : null;

  let s = me.strength;
  if (oppCard?.hook?.type === 'zeroOpponentPrintedStrength') s = 0;

  const h = me.hook;
  if (!h) return s;
  if (h.type === 'strengthBonusIfOpponentHigher') {
    const t = state.tracks[h.track];
    if (t.indexOf(opp) < t.indexOf(fid)) s += h.amount;
  }
  if (h.type === 'selfBuffIfCardInDiscard' && state.leaderDiscards[fid].includes(h.card)) s += h.strength;
  if (h.type === 'selfBuffIfDefendingFortified' && side(state, fid) === 'defender' && regionProps(state, c.region).muster > 0) s += h.strength;
  return s;
}

/** Per-unit strength override from a revealed card (e.g. +2 units when attacking). */
export function unitOverride(state, fid) {
  const id = state.combat?.cards?.[fid];
  if (!id || !state.combat.cardsRevealed) return null;
  const h = card(id).hook;
  const want = h?.when === 'attacking' ? 'attacker' : 'defender';
  if (h?.type === 'unitBonusOverride' && side(state, fid) === want) return { unit: h.unit, bonus: h.bonus };
  return null;
}

/** Do any revealed cards zero warship contributions for this faction's units? */
export function shipsZeroed(state, unitFaction) {
  const c = state.combat;
  if (!c?.cardsRevealed) return false;
  for (const fid of [c.attacker, c.defender]) {
    const id = c.cards?.[fid];
    if (id && card(id).hook?.type === 'zeroShipsIfSupported' && unitFaction !== fid
        && c.supports.some(s => s.side === side(state, fid))) {
      return true;
    }
  }
  return false;
}

/** Defense-order multiplier (doubling hook). */
export function defenseOrderMultiplier(state, fid) {
  const id = state.combat?.cards?.[fid];
  return id && state.combat.cardsRevealed && card(id).hook?.type === 'doubleDefenseOrder' ? 2 : 1;
}

// ---------- casualties (Rules p.20) ----------

function effectiveIcons(state, fid) {
  const c = state.combat;
  const id = c.cards?.[fid];
  if (!id) return { swords: 0, forts: 0 };
  const me = card(id);
  let { swords, forts } = me;
  const h = me.hook;
  const mySide = side(state, fid);
  if (h?.type === 'conditionalIcon') (mySide === 'attacker') ? swords++ : forts++;
  if (h?.type === 'selfBuffIfUnsupported' && !c.supports.some(s => s.side === mySide)) { swords += h.swords; forts += h.forts; }
  if (h?.type === 'selfBuffIfDefendingFortified' && mySide === 'defender' && regionProps(state, c.region).muster > 0) swords += h.swords || 0;
  if (h?.type === 'selfBuffIfCardInDiscard' && state.leaderDiscards[fid].includes(h.card)) swords += h.swords || 0;
  return { swords, forts };
}

/** Casualty count owed by the defeated: victor swords − defeated forts (Rules p.20). */
export function casualtyCount(state, victor) {
  const c = state.combat;
  const defeated = victor === c.attacker ? c.defender : c.attacker;
  const defId = c.cards?.[defeated];
  if (defId && card(defId).hook?.type === 'casualtyImmunity') return 0;
  const n = effectiveIcons(state, victor).swords - effectiveIcons(state, defeated).forts;
  return Math.max(0, n);
}
