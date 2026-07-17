// HEGEMON engine — central reducer (M1.b).
// applyAction(state, action) -> { state, events }: pure with respect to its
// inputs (the incoming state is never mutated), deterministic, serializable.

import { beginPlanning, submitOrders, courierDecision, threatPeekPlacement, orderClasses, orderableRegions, starLimit, ORDER_TOKENS, maxPlaceableOrders } from './planning.js';
import { eventChoice, reconcileSupply, muster, bid, bidTieBreak } from './eventPhase.js';
import { beginActionPhase, resolveRaid, resolveMarch, resolveRally } from './actionPhase.js';
import { declareSupport, useBlade, retreat, replacePortShips, chooseCasualties, progressCombat, useCardAbility, cardTarget } from './combat.js';
import { chooseLeaderCard } from './cards.js';
import { checkInstantVictory } from './victory.js';
import { invaderBid, invaderTieBreak, incursionUnits, incursionTrack, incursionCard, incursionOption, incursionMusterSite } from './invaders.js';
import { createGame, seatsControlled, serialize } from './state.js';

export { beginPlanning, beginActionPhase, orderClasses, orderableRegions, starLimit, ORDER_TOKENS, maxPlaceableOrders };

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
  invaderBid(state, action) {
    invaderBid(state, action.faction, action.amount);
  },
  invaderTieBreak(state, action) {
    invaderTieBreak(state, action.faction, action.chosen);
  },
  incursionUnits(state, action) {
    incursionUnits(state, action.faction, action.units || []);
  },
  incursionTrack(state, action) {
    incursionTrack(state, action.faction, action.track);
  },
  incursionCard(state, action) {
    incursionCard(state, action.faction, action.card);
  },
  incursionOption(state, action) {
    incursionOption(state, action.faction, action.option);
  },
  incursionMusterSite(state, action) {
    incursionMusterSite(state, action.faction, action.region);
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
  if (state.phase === 'gameOver') throw new Error('The game is over — no further actions (Rules p.25)');
  const handler = HANDLERS[action.type];
  if (!handler) throw new Error(`Unknown action type: ${action.type}`);

  const next = structuredClone(state);
  const logStart = next.log.length;
  const stamp = { _round: next.round, _phase: next.phase }; // when the action was ISSUED
  handler(next, action);
  // Instant victory (Rules p.25): checked once the action settles, never
  // mid-combat — see victory.js for the gates.
  checkInstantVictory(next);
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
// Bumped whenever a fix CHANGES legal behavior (not just adds features), so
// the M3 corpus can filter episodes recorded under superseded rules.
// 2: m2e-fb3 — retreat-to-port family (squadron capacity, routed-first
//    supply toll, routed-only order sweep). Episodes with rulesRevision < 2
//    (or without the field) may contain over-capacity ports and garrison
//    sacrifices that the current engine correctly forbids.
// 3: threat-track granularity (owner board check Jul 2026) — icons advance
//    +2 (one space on the seven-space 0/2/4…12 track) and invader victory
//    sets the token back two spaces (-4). Episodes with rulesRevision < 3
//    ran the invader subsystem at half pressure: threat trajectories and
//    incursion strengths are systematically low.
// 4: harbor adjacency made symmetric (owner finding Jul 2026) — sea->port
//    marches are now reachable, harbor support orders now back adjacent sea
//    battles, march-in respects the 3-ship cap, and Bordeaux (L35) borders
//    The Mediterranean (S07). Episodes < 4 were played on a board where
//    none of those moves existed.
export const RULES_REVISION = 7; // 7: replacePortShips supply check (Rules p.8). 6: support terrain gate (Rules p.18) — land cannot back sea battles, ports cannot back land. 5: Rules p.12 Not-Enough-Order-Tokens

export function episodeRecord(state, meta = {}) {
  return {
    schema: 'hegemon-episode/1',
    engine: state.version,
    rulesRevision: RULES_REVISION,
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
 * Describe a faction's decision space right now — DESCRIPTORS, not complete
 * action objects. RENAMED from `legalActions` (M3.b): the M3.a menu
 * enumerator in legal.js owns that name — two same-named exports with
 * different contracts silently shadowed each other at import sites, which
 * is exactly how a golden ended up testing the wrong function.
 */
export function decisionDescriptors(state, faction) {
  if (state.phase === 'gameOver') return []; // nothing left to decide (Rules p.25)
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
    } else if (q.type === 'muster') {
      out.push({ type: 'muster', region: q.region, points: q.points, source: q.source ?? 'card' });
    } else if (q.type === 'bid') {
      out.push({ type: 'bid', track: q.track, max: q.max });
    } else if (q.type === 'bidTieBreak') {
      out.push({ type: 'bidTieBreak', track: q.track, tied: q.tied });
    } else if (q.type === 'invaderBid') {
      out.push({ type: 'invaderBid', max: q.max, strength: q.strength });
    } else if (q.type === 'invaderTieBreak') {
      out.push({ type: 'invaderTieBreak', side: q.side, options: q.tied });
    } else if (q.type === 'incursionUnits') {
      out.push({ type: 'incursionUnits', purpose: q.purpose, count: q.count,
        optional: !!q.optional, unitType: q.unitType ?? null,
        regions: q.regions ?? null, constraint: q.constraint ?? null });
    } else if (q.type === 'incursionTrack') {
      out.push({ type: 'incursionTrack', mode: q.mode, options: q.options, amount: q.amount ?? null });
    } else if (q.type === 'incursionCard') {
      out.push({ type: 'incursionCard', purpose: q.purpose, from: q.from, options: q.options });
    } else if (q.type === 'incursionOption') {
      out.push({ type: 'incursionOption', options: q.options });
    } else if (q.type === 'incursionMusterSite') {
      out.push({ type: 'incursionMusterSite', options: q.options });
    }
  }
  return out;
}
