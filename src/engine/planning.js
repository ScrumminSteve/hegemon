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

/**
 * How many orders this faction can physically place this round: occupied
 * areas, capped by the LEGAL token supply — inventory minus decree-banned
 * classes, with starred tokens usable only up to the Command-track allowance.
 * The one lens for the validator, the M3.a generator, and the planning UI
 * (Rules p.12 "Not Enough Order Tokens"; ban classes per Rules p.22).
 */
export function maxPlaceableOrders(state, faction) {
  const banned = state.roundFlags.bannedOrders || [];
  const legal = ORDER_TOKENS.filter(t =>
    !orderClasses(t).some(c => banned.includes(c)) &&
    !(banned.includes('starred') && t.starred));
  const plain = legal.filter(t => !t.starred).length;
  const starred = legal.length - plain;
  const cap = plain + Math.min(starred, starLimit(state, faction));
  return Math.min(orderableRegions(state, faction).length, cap);
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
  // Event-phase restrictions (Rules p.22 ban-class cards; classes, not raw types).
  const banned = state.roundFlags.bannedOrders || [];
  if (banned.length) {
    for (const [rid, o] of Object.entries(orders)) {
      const hit = orderClasses(o).find(c => banned.includes(c));
      if (hit) throw new Error(`${o.type}${o.starred ? '★' : ''} at ${rid}: ${hit} orders are forbidden this round (event card)`);
    }
  }
  const eligible = orderableRegions(state, faction);
  const keys = Object.keys(orders).sort();

  for (const rid of keys) {
    if (!eligible.includes(rid)) {
      throw new Error(`${faction} has no units in ${rid} — orders go only where you have units (Rules p.12)`);
    }
  }
  // Coverage is mandatory: every area with your units must receive an order
  // (Rules p.12 "each player must place exactly one Order token on each area")
  // — UNLESS the legal token supply falls short (decree bans, star limit, or
  // more areas than tokens), in which case the player places as many as the
  // supply allows and chooses which areas go without (Rules p.12 "Not Enough
  // Order Tokens"; found live by the M3.b heuristic fuzz: 11 areas, defend
  // banned, star allowance 0 → only 8 legal tokens). [owner-audit: confirm
  // p.12 wording requires placing the MAXIMUM possible, not "up to".]
  const required = maxPlaceableOrders(state, faction);
  if (keys.length !== required) {
    if (required < eligible.length) {
      throw new Error(`${faction} must place exactly ${required} orders — ${eligible.length} occupied areas but only ${required} legal tokens after decree bans and the star limit (Rules p.12 Not Enough Order Tokens); got ${keys.length}`);
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
export function threatPeekPlacement(state, faction, placement) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'threatPeekPlacement' && q.faction === faction);
  if (qi === -1) throw new Error(`${faction} has no pending threat peek`);
  if (!['top', 'bottom'].includes(placement)) throw new Error(`placement must be top or bottom`);
  state.pendingQueries.splice(qi, 1);
  const card = state.invaderDeck[0];
  if (placement === 'bottom') {
    state.invaderDeck.push(state.invaderDeck.shift());
  }
  // Placement itself is public; the card identity stays with the holder — and
  // persists as earned knowledge so views (human or AI) can recall it later.
  // M2.d must clear these entries whenever the invader deck is drawn or shuffled.
  state.privateKnowledge[faction].threatDeck = { card, placement, round: state.round };
  state.log.push({ round: state.round, event: 'threatPeekPlaced', faction, placement });
}

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
    // Peek at the top card of the invader deck; the holder may leave it on
    // top or move it to the bottom (Rules p.11). Card identity is holder-only
    // information — viewFor masks it from other factions. The peek CONSUMES
    // the courier decision: it is swap OR peek, never both (Rules p.11).
    state.pendingQueries.splice(qi, 1);
    state.pendingQueries.push({
      type: 'threatPeekPlacement', faction,
      card: state.invaderDeck[0],
      options: ['top', 'bottom'],
    });
    state.log.push({ round: state.round, event: 'courierPeeked', faction });
    return; // action phase begins after placement
  } else if (decision === 'pass') {
    state.log.push({ round: state.round, event: 'courierPassed', faction });
  } else {
    throw new Error(`Unknown courier decision: ${decision}`);
  }

  state.pendingQueries.splice(qi, 1);
  state.phase = 'action';
  state.log.push({ round: state.round, event: 'actionPhaseBegan' });
}
