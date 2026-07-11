// HEGEMON engine — central reducer (M1.b).
// applyAction(state, action) -> { state, events }: pure with respect to its
// inputs (the incoming state is never mutated), deterministic, serializable.

import { beginPlanning, submitOrders, courierDecision, orderableRegions, starLimit, ORDER_TOKENS } from './planning.js';
import { beginActionPhase, resolveRaid, resolveMarch, resolveRally } from './actionPhase.js';
import { declareSupport, useBlade, retreat, replacePortShips } from './combat.js';

export { beginPlanning, beginActionPhase, orderableRegions, starLimit, ORDER_TOKENS };

const HANDLERS = {
  submitOrders(state, action) {
    submitOrders(state, action.faction, action.orders);
  },
  courierDecision(state, action) {
    courierDecision(state, action.faction, action.decision, action.swap);
    beginActionPhase(state); // planning hands off to the action phase
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
};

export function applyAction(state, action) {
  const handler = HANDLERS[action.type];
  if (!handler) throw new Error(`Unknown action type: ${action.type}`);

  const next = structuredClone(state);
  const logStart = next.log.length;
  handler(next, action);
  return { state: next, events: next.log.slice(logStart) };
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
    }
  }
  return out;
}
