// HEGEMON engine — Planning Phase (M1.b).
// Rules p.12–13: each faction secretly assigns exactly one order token to every
// area containing at least one of its units; all orders are then revealed;
// the Courier token holder may act (Rules p.11, p.12 step 3).

import { STAR_ALLOWANCE } from './state.js';

// The 15-token order inventory every faction owns (Rules p.12: 10 regular +
// 5 special "starred" tokens). mod = printed combat modifier.
/**
 * Order classification for restriction effects (ban-class event cards) and,
 * later, dual-mode expansion tokens. Ban cards must test classes through
 * here — never raw type equality. A token may carry several classes
 * (e.g. a raid/support dual token is both).
 */
export function orderClasses(order) {
  const cls = [order.type];
  if (order.type === 'march' && order.mod === 1) cls.push('marchPlusOne');
  if (order.modes) cls.push(...order.modes); // expansion dual-mode tokens
  return cls;
}

export const ORDER_TOKENS = Object.freeze([
  { type: 'march',   mod: -1, starred: false },
  { type: 'march',   mod:  0, starred: false },
  { type: 'march',   mod:  1, starred: true  },
  { type: 'defend',  mod:  1, starred: false },
  { type: 'defend',  mod:  1, starred: false },
  { type: 'defend',  mod:  2, starred: true  },
  { type: 'support', mod:  0, starred: false },
  { type: 'support', mod:  0, starred: false },
  { type: 'support', mod:  1, starred: true  },
  { type: 'raid',    mod:  0, starred: false },
  { type: 'raid',    mod:  0, starred: false },
  { type: 'raid',    mod:  0, starred: true  },
  { type: 'rally',   mod:  0, starred: false },
  { type: 'rally',   mod:  0, starred: false },
  { type: 'rally',   mod:  0, starred: true  },
]);

const tokenKey = (o) => `${o.type}|${o.mod}|${o.starred}`;

/** Regions (incl. ports) where the faction currently has at least one unit. */
export function orderableRegions(state, faction) {
  return Object.entries(state.unitsByRegion)
    .filter(([, units]) => units.some(u => u.faction === faction))
    .map(([rid]) => rid)
    .sort();
}

/** Max starred orders for a faction from its Command-track position (Rules p.11). */
export function starLimit(state, faction) {
  const allowance = STAR_ALLOWANCE[state.ruleset.seatCount];
  if (!allowance) throw new Error(`No star allowance table for ${state.ruleset.seatCount} seats`);
  const pos = state.tracks.command.indexOf(faction);
  if (pos === -1) throw new Error(`${faction} not on command track`);
  return allowance[pos];
}

/**
 * Validate a full order submission for one faction.
 * orders: { regionId: { type, mod, starred } }
 * Throws with a rule citation on the first violation.
 */
export function validateOrders(state, faction, orders) {
  const eligible = orderableRegions(state, faction);
  const keys = Object.keys(orders).sort();

  for (const rid of keys) {
    if (!eligible.includes(rid)) {
      throw new Error(`${faction} has no units in ${rid} — orders go only where you have units (Rules p.12)`);
    }
  }
  // Coverage is mandatory: every area with your units must receive an order
  // (Rules p.12 "each player must place exactly one Order token on each area").
  // The "Not Enough Order Tokens" rarity (Rules p.12) cannot trigger before
  // mustering exists, so it is deferred with an explicit guard.
  if (keys.length !== eligible.length) {
    if (eligible.length > ORDER_TOKENS.length) {
      throw new Error('Not-enough-order-tokens edge case not yet implemented (Rules p.12) — deferred until mustering (M2)');
    }
    const missing = eligible.filter(r => !keys.includes(r));
    throw new Error(`${faction} must order every occupied area; missing: ${missing.join(', ')} (Rules p.12)`);
  }

  // Token inventory: each physical token used at most once.
  const pool = new Map();
  for (const t of ORDER_TOKENS) pool.set(tokenKey(t), (pool.get(tokenKey(t)) || 0) + 1);
  for (const rid of keys) {
    const k = tokenKey(orders[rid]);
    const left = pool.get(k) || 0;
    if (left === 0) throw new Error(`Order ${k} at ${rid} is not an available token (Rules p.12–13 inventory)`);
    pool.set(k, left - 1);
  }

  // Star allowance from the Command track (Rules p.11).
  const stars = keys.filter(rid => orders[rid].starred).length;
  const limit = starLimit(state, faction);
  if (stars > limit) {
    throw new Error(`${faction} placed ${stars} starred orders; Command-track allowance is ${limit} (Rules p.11)`);
  }
}

/** Enter the Planning Phase: queue a submission query for every faction. */
export function beginPlanning(state) {
  state.phase = 'planning';
  state.ordersByRegion = {};
  state.pendingQueries = state.factions.map(f => ({ type: 'submitOrders', faction: f }));
  state.log.push({ round: state.round, event: 'planningBegan' });
}

/** Record one faction's face-down orders; reveal when the last one lands. */
export function submitOrders(state, faction, orders) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'submitOrders' && q.faction === faction);
  if (qi === -1) throw new Error(`${faction} has no pending order submission`);
  validateOrders(state, faction, orders);

  for (const [rid, o] of Object.entries(orders)) {
    state.ordersByRegion[rid] = { faction, type: o.type, mod: o.mod, starred: o.starred, revealed: false };
  }
  state.pendingQueries.splice(qi, 1);
  state.log.push({ round: state.round, event: 'ordersSubmitted', faction });

  if (!state.pendingQueries.some(q => q.type === 'submitOrders')) revealOrders(state);
}

function revealOrders(state) {
  for (const o of Object.values(state.ordersByRegion)) o.revealed = true;
  state.log.push({ round: state.round, event: 'ordersRevealed' });
  state.pendingQueries.push({
    type: 'courierDecision',
    faction: state.tokens.courier,
    options: ['pass', 'swapOrder', 'peekThreatDeck'],
  });
}

/** Courier token decision (Rules p.11, p.12 step 3). */
export function courierDecision(state, faction, decision, swap) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'courierDecision' && q.faction === faction);
  if (qi === -1) throw new Error(`${faction} does not hold a pending courier decision`);

  if (decision === 'swapOrder') {
    const { region, newOrder } = swap || {};
    const existing = state.ordersByRegion[region];
    if (!existing || existing.faction !== faction) {
      throw new Error(`Courier swap must replace one of ${faction}'s own orders (Rules p.11)`);
    }
    // The replacement must be validated against the full post-swap set.
    const post = {};
    for (const [rid, o] of Object.entries(state.ordersByRegion)) {
      if (o.faction === faction) post[rid] = { type: o.type, mod: o.mod, starred: o.starred };
    }
    post[region] = newOrder;
    validateOrders(state, faction, post);
    state.ordersByRegion[region] = { faction, ...newOrder, revealed: true };
    state.log.push({ round: state.round, event: 'courierSwapped', faction, region });
  } else if (decision === 'peekThreatDeck') {
    // Threat deck arrives with the Event Phase (M2); until then this is a no-op.
    state.log.push({ round: state.round, event: 'courierPeekUnavailable', note: 'threat deck lands in M2' });
  } else if (decision === 'pass') {
    state.log.push({ round: state.round, event: 'courierPassed', faction });
  } else {
    throw new Error(`Unknown courier decision: ${decision}`);
  }

  state.pendingQueries.splice(qi, 1);
  state.phase = 'action';
  state.log.push({ round: state.round, event: 'actionPhaseBegan' });
}
