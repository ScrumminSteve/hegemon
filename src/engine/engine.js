// HEGEMON engine — central reducer (M1.b).
// applyAction(state, action) -> { state, events }: pure with respect to its
// inputs (the incoming state is never mutated), deterministic, serializable.

import { beginPlanning, submitOrders, courierDecision, threatPeekPlacement, orderableRegions, starLimit, ORDER_TOKENS } from './planning.js';
import { eventChoice, reconcileSupply, muster, bid, bidTieBreak } from './eventPhase.js';
import { beginActionPhase, resolveRaid, resolveMarch, resolveRally } from './actionPhase.js';
import { declareSupport, useBlade, retreat, replacePortShips, chooseCasualties, progressCombat, useCardAbility, cardTarget } from './combat.js';
import { chooseLeaderCard } from './cards.js';
import { createGame, seatsControlled, serialize } from './state.js';

export { beginPlanning, beginActionPhase, orderableRegions, starLimit, ORDER_TOKENS };

const HANDLERS = {
  submitOrders(state, action) {
    submitOrders(state, action.faction, action.orders);
  },
  courierDecision(state, action) {
    courierDecision(state, action.faction, action.decision, action.swap);
    // A deck peek pauses the handoff until the holder places the card.
    if (!state.pendingQueries.some(q => q.type === 'threatPeekPlacement')) {
      beginActionPhase(state); // planning hands off to the action phase
    }
  },
  threatPeekPlacement(state, action) {
    threatPeekPlacement(state, action.faction, action.placement);
    beginActionPhase(state);
  },
  eventChoice(state, action) {
    eventChoice(state, action.faction, action.option);
  },
  reconcileSupply(state, action) {
    reconcileSupply(state, action.faction, action.region, action.unitType);
  },
  muster(state, action) {
    muster(state, action.faction, action.region, action.builds || []);
  },
  bid(state, action) {
    bid(state, action.faction, action.track, action.amount);
  },
  bidTieBreak(state, action) {
    bidTieBreak(state, action.faction, action.track, action.order);
  },
  resolveRaid(state, action) {
    resolveRaid(state, action.faction, action.region, action.target ?? null);
  },
  resolveMarch(state, action) {
    resolveMarch(state, action.faction, action.region, action.moves ?? [], action.leaveControl ?? false);
  },
  resolveRally(state, action) {
    resolveRally(state, action.faction, action.region, { muster: action.muster ?? false });
  },
  declareSupport(state, action) {
    declareSupport(state, action.faction, action.region, action.side);
  },
  useBlade(state, action) {
    useBlade(state, action.faction, action.use);
  },
  retreat(state, action) {
    retreat(state, action.faction, action.to);
  },
  replacePortShips(state, action) {
    replacePortShips(state, action.faction, action.count);
  },
  chooseLeaderCard(state, action) {
    chooseLeaderCard(state, action.faction, action.card);
    progressCombat(state);
  },
  chooseCasualties(state, action) {
    chooseCasualties(state, action.faction, action.units);
  },
  useCardAbility(state, action) {
    useCardAbility(state, action.faction, action.use);
  },
  cardTarget(state, action) {
    cardTarget(state, action.faction, action.target);
  },
};

export function applyAction(state, action) {
  const handler = HANDLERS[action.type];
  if (!handler) throw new Error(`Unknown action type: ${action.type}`);

  const next = structuredClone(state);
  const logStart = next.log.length;
  const stamp = { _round: next.round, _phase: next.phase }; // when the action was ISSUED
  handler(next, action);
  next.actionLog.push({ ...action, ...stamp }); // transcript: replayable, sliceable (M3.L)
  return { state: next, events: next.log.slice(logStart) };
}

/** Reconstruct a game exactly from its transcript (determinism contract). */
export function replayGame(config, actions) {
  let s = createGame(config.seatCount, { seed: config.seed, ruleset: config.ruleset });
  beginPlanning(s);
  for (const a of actions) s = applyAction(s, a).state;
  return s;
}

/** Deterministic digest of a game state (corpus integrity, replay checks). */
export function stateHash(state) {
  const str = serialize(state);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Flatten a finished (or in-flight) game into a learning episode record. */
export function episodeRecord(state, meta = {}) {
  return {
    schema: 'hegemon-episode/1',
    engine: state.version,
    meta,               // free-form: { title, author, notes, tags: ['opener','F1'] }
    hash: stateHash(state),   // digest of the final state this transcript reaches
    config: state.config,
    actions: state.actionLog,
    outcome: {
      winner: state.winner ?? null,
      round: state.round,
      phase: state.phase,
      perFaction: Object.fromEntries(state.factions.map(f => [f, {
        seats: seatsControlled(state, f),
        supply: state.supply[f],
        authority: state.authority[f],
        initiative: state.tracks.initiative.indexOf(f) + 1,
      }])),
    },
  };
}

/**
 * Enumerate what a faction may do right now — the single interface the UI
 * and (in M3) the AI consume. Descriptors, not exhaustive enumerations:
 * order placement is combinatorial, so we describe the decision space.
 */
export function legalActions(state, faction) {
  const out = [];
  for (const q of state.pendingQueries) {
    if (q.faction !== faction) continue;
    if (q.type === 'submitOrders') {
      out.push({
        type: 'submitOrders',
        regions: orderableRegions(state, faction),
        tokens: ORDER_TOKENS,
        starLimit: starLimit(state, faction),
      });
    } else if (q.type === 'courierDecision') {
      out.push({ type: 'courierDecision', options: q.options });
    } else if (q.type === 'threatPeekPlacement') {
      out.push({ type: 'threatPeekPlacement', options: q.options });
    } else if (q.type === 'eventChoice') {
      out.push({ type: 'eventChoice', card: q.card, options: q.options });
    } else if (q.type === 'reconcileSupply') {
      out.push({ type: 'reconcileSupply', regions: q.regions });
    } else if (q.type === 'resolveOrder') {
      out.push({ type: 'resolve' + q.step[0].toUpperCase() + q.step.slice(1), regions: q.regions });
    } else if (q.type === 'declareSupport') {
      out.push({ type: 'declareSupport', region: q.region, options: q.options });
    } else if (q.type === 'useBlade') {
      out.push({ type: 'useBlade', options: q.options });
    } else if (q.type === 'retreat') {
      out.push({ type: 'retreat', options: q.options });
    } else if (q.type === 'replacePortShips') {
      out.push({ type: 'replacePortShips', port: q.port, max: q.max });
    } else if (q.type === 'chooseLeaderCard') {
      out.push({ type: 'chooseLeaderCard', hand: q.hand });
    } else if (q.type === 'chooseCasualties') {
      out.push({ type: 'chooseCasualties', count: q.count, available: q.available });
    } else if (q.type === 'useCardAbility') {
      out.push({ type: 'useCardAbility', ability: q.ability, options: [true, false] });
    } else if (q.type === 'cardTarget') {
      out.push({ type: 'cardTarget', ability: q.ability, options: q.skippable ? [...q.options, 'skip'] : q.options });
    }
  }
  return out;
}
