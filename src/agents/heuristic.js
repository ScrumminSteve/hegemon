// Heuristic agent (M3.b) — the first policy that WANTS something.
//
// Contract is identical to random-v1: decide(view, query, menu, rng) → action.
// The agent scores every engine-offered menu item and argmaxes; the bot RNG is
// used ONLY to break exact score ties, so play is deterministic per seed pair.
// Parity is preserved by construction: every returned action IS a menu item,
// and every feature is computed from the viewFor redaction through the same
// derived helpers the UI reads (one-lens contract, banked Jul 2026). No
// lookahead: the view's decks are 'hidden' strings, so simulation is
// impossible by design — scoring is structural.
//
// WEIGHTS is one flat, tunable vector — the exact surface the M3.d/M3.e
// self-play optimization (hill-climb/SPSA per the banked M3.L design) will
// perturb. createHeuristicAgent accepts overrides and a jitterSeed: seeded
// multiplicative jitter differentiates bot-vs-bot seats (owner decision,
// M3.b session) and the EFFECTIVE weights are exposed on the agent for
// episode recording.

import { regionProps, region, controllerOf, seatsControlled, adjacency } from '../engine/state.js';
import { unitStrength } from '../engine/actionPhase.js';
import { card } from '../engine/cards.js';
import { botRng } from './random.js';

const ADJ = adjacency();

export const WEIGHTS_V1 = Object.freeze({
  // unit values (casualty / supply-loss avoidance; muster preference)
  vInfantry: 1.0, vCavalry: 2.2, vWarship: 1.5, vSiege: 2.6,
  // territory value
  wSeat: 8.0,          // a fortified region = a victory seat
  wCitadelBonus: 3.0,  // muster-2 seats over muster-1
  wIcons: 1.0,         // per supply/coin icon
  wLand: 1.5,          // any land capture
  wSea: 0.8,           // sea control
  // planning
  pDefend: 1.6, pSupport: 1.1, pMarch: 1.4, pRally: 1.2, pRaid: 0.9,
  pRallyFort: 1.5,     // rally on a muster-capable region
  pStarBonus: 0.4,     // starred token placed where its star matters
  // marching
  mAttackMargin: 1.6,  // reward per point of favorable margin (capped)
  mOverreach: 2.2,     // penalty per point of unfavorable margin
  mStandDown: 0.3,     // baseline for marching nowhere
  mAbandonSeat: 3.0,   // emptying an owned fortified region under pressure
  mLeaveControl: 0.8,  // authority token on a vacated seat
  // rally resolution & mustering
  rMusterPoint: 2.0,   // value per muster point exercised
  rAuthority: 1.0,     // value per authority from consolidate
  muSpend: 2.0,        // muster: value per point spent
  muCavalry: 0.5, muShip: 0.4,
  // raids
  raidHit: 2.0, raidSupport: 1.0, raidConsolidate: 0.6,
  // bidding
  bidSpendFrac: 0.4,   // fraction of authority worth committing at full stakes
  bidReserve: 2,       // authority floor to protect
  bidOverspend: 1.5,
  bidInitiative: 1.0, bidProwess: 0.75, bidCommand: 0.9,
  // invaders
  invSpendFrac: 0.5, invReserve: 1, invThreatScale: 1.0, invOverspend: 1.2,
  // combat
  cStakeScale: 1.0,    // leader-card strength spent proportional to stakes
  cHoard: 0.5,         // penalty for burning strength in low-stakes fights
  cSwords: 0.6, cForts: 0.5,
  cBlade: 1.0,         // inclination to use the blade
  cAbility: 1.0,       // inclination to use card abilities
  // retreats
  rtSafety: 1.5,       // per adjacent enemy strength avoided
  rtHome: 1.2,         // friendly-controlled destination
  // misc
  courierPeek: 1.2, courierPass: 1.0, courierSwap: 0.3,
  peekBury: 1.0,       // threat peek: prefer bottom
  portShips: 0.8,      // per replaced port ship
});

/**
 * WEIGHTS-v2 — the first LEARNED vector (SPSA run night1, Jul 2026).
 * Provenance: runSeed 267783951, 60 iterations x paired 40-game blocks on
 * the owner's desktop (15 workers), best at iteration 15; VERIFIED on 720
 * held-out games pooled across two batches: 141 wins, 19.58% [16.85-22.64]
 * vs the 16.67% null (ship bar: CI lower bound above null — MET). Guardrails
 * green: mean rank 3.41 vs 3.72 v1 baseline, worst-seat 4.73 vs 5.0.
 * WEIGHTS_V1 stays frozen forever as the non-regression anchor; every
 * future candidate must beat it on this same harness.
 */
export const WEIGHTS_V2 = Object.freeze({
  vInfantry: 0.991,
  vCavalry: 2.255,
  vWarship: 1.5008,
  vSiege: 2.6871,
  wSeat: 7.7052,
  wCitadelBonus: 3.09,
  wIcons: 0.9845,
  wLand: 1.5547,
  wSea: 0.811,
  pDefend: 1.632,
  pSupport: 1.1091,
  pMarch: 1.3983,
  pRally: 1.24,
  pRaid: 0.8891,
  pRallyFort: 1.4675,
  pStarBonus: 0.396,
  mAttackMargin: 1.6092,
  mOverreach: 2.1889,
  mStandDown: 0.3013,
  mAbandonSeat: 2.962,
  mLeaveControl: 0.802,
  rMusterPoint: 2.0222,
  rAuthority: 1.0069,
  muSpend: 2.0296,
  muCavalry: 0.5,
  muShip: 0.3981,
  raidHit: 1.9746,
  raidSupport: 1.0031,
  raidConsolidate: 0.5964,
  bidSpendFrac: 0.4072,
  bidReserve: 1.9725,
  bidOverspend: 1.4747,
  bidInitiative: 0.9954,
  bidProwess: 0.7775,
  bidCommand: 0.9243,
  invSpendFrac: 0.4906,
  invReserve: 0.9961,
  invThreatScale: 0.9714,
  invOverspend: 1.1498,
  cStakeScale: 1.0081,
  cHoard: 0.5005,
  cSwords: 0.5982,
  cForts: 0.5095,
  cBlade: 1.003,
  cAbility: 0.9762,
  rtSafety: 1.4523,
  rtHome: 1.2136,
  courierPeek: 1.1916,
  courierPass: 1.0152,
  courierSwap: 0.2986,
  peekBury: 1.0089,
  portShips: 0.7837,
});

/** The ACTIVE default vector — what shipped bots play. */
export const WEIGHTS = WEIGHTS_V2;


/** Seeded multiplicative jitter over a weight vector (M3.b owner decision):
    every seat gets its own personality; same jitterSeed = same personality,
    recorded in episode config for exact replay. */
export function jitterWeights(base, jitterSeed, magnitude = 0.2) {
  const r = botRng(jitterSeed);
  const out = {};
  for (const k of Object.keys(base)) out[k] = base[k] * (1 + magnitude * (2 * r() - 1));
  return out;
}

export function createHeuristicAgent(opts = {}) {
  const { weights = {}, jitterSeed = null, jitterMagnitude = 0.2 } = opts;
  let W = { ...WEIGHTS, ...weights };
  if (jitterSeed !== null && jitterSeed !== undefined) W = jitterWeights(W, jitterSeed, jitterMagnitude);
  return {
    id: jitterSeed != null ? `heuristic-v1+j${jitterSeed}` : 'heuristic-v1',
    weights: W,
    decide(view, query, menu, rng) {
      const scorer = SCORERS[query.type] || (() => 0);
      let best = [], bestScore = -Infinity;
      for (const a of menu) {
        const s = scorer(view, query, a, W);
        if (s > bestScore + 1e-9) { bestScore = s; best = [a]; }
        else if (s > bestScore - 1e-9) best.push(a);
      }
      return best[Math.floor(rng() * best.length)];
    },
  };
}

// ---------------------------------------------------------------------------
// features — every read goes through the same helpers the UI uses (one lens)
// ---------------------------------------------------------------------------

const UNIT_VALUE = W => ({ infantry: W.vInfantry, cavalry: W.vCavalry, warship: W.vWarship, siege_engine: W.vSiege });

function myStrengthAt(view, rid, fid) {
  let s = 0;
  for (const u of view.unitsByRegion[rid] || []) {
    if (u.faction === fid && !u.routed) s += unitStrength(u, { fortified: false });
  }
  return s;
}

function enemyStrengthAt(view, rid, fid) {
  let s = 0;
  for (const u of view.unitsByRegion[rid] || []) {
    if (u.faction !== fid && !u.routed) s += unitStrength(u, { fortified: false });
  }
  if (view.neutrals?.[rid]) s = Math.max(s, view.neutrals[rid].insurmountable ? 99 : view.neutrals[rid].strength);
  return s;
}

/** Hostile strength on a region's borders — the defend/support signal. */
function pressureOn(view, rid, fid) {
  let p = 0;
  for (const nbr of ADJ[rid] || []) p += enemyStrengthAt(view, nbr, fid);
  return p;
}

/** What owning this region is worth to fid. */
function regionValue(view, rid, W) {
  const r = region(rid);
  if (!r) return 0;
  if (r.kind === 'maritime') return W.wSea;
  const p = regionProps(view, rid);
  let v = W.wLand + (p.supply + p.coin) * W.wIcons;
  if (p.muster > 0) v += W.wSeat + (p.muster > 1 ? W.wCitadelBonus : 0);
  return v;
}

/** Capture prospects of marching myStr into `to` (margin-scaled, overreach-punished). */
function attackScore(view, to, myStr, fid, W) {
  const enemy = enemyStrengthAt(view, to, fid);
  const owner = controllerOf(view, to);
  const gain = owner === fid ? 0 : regionValue(view, to, W);
  if (enemy === 0) return gain; // a walk-in
  const margin = myStr - enemy;
  if (margin > 0) return gain * Math.min(1, margin / 2) * W.mAttackMargin;
  return -(1 - margin) * W.mOverreach;
}

// ---------------------------------------------------------------------------
// scorers — one per query type; unknown types fall through to uniform random
// ---------------------------------------------------------------------------

const SCORERS = {
  // ----- planning -----
  submitOrders(view, q, a, W) {
    let s = 0;
    for (const [rid, o] of Object.entries(a.orders)) {
      const pressure = pressureOn(view, rid, q.faction);
      const mine = myStrengthAt(view, rid, q.faction);
      const here = regionValue(view, rid, W);
      const props = region(rid)?.kind === 'maritime' ? { muster: 0 } : regionProps(view, rid);
      switch (o.type) {
        case 'defend':
          s += W.pDefend * Math.min(pressure, mine + 2) * (here / W.wLand) * 0.3 + (o.mod || 0) * 0.3;
          break;
        case 'march': {
          let best = 0;
          for (const nbr of ADJ[rid] || []) best = Math.max(best, attackScore(view, nbr, mine + (o.mod || 0), q.faction, W));
          s += W.pMarch * best * 0.4;
          if (pressure > mine) s += 0.5; // an exit when outmatched
          break;
        }
        case 'support': {
          let need = 0;
          for (const nbr of ADJ[rid] || []) {
            if (controllerOf(view, nbr) === q.faction) need = Math.max(need, pressureOn(view, nbr, q.faction));
          }
          s += W.pSupport * Math.min(need, mine) * 0.3;
          break;
        }
        case 'consolidate':
          s += W.pRally * (props.muster > 0 ? W.pRallyFort * props.muster : 1) * (pressure === 0 ? 1 : 0.4);
          break;
        case 'raid': {
          let targets = 0;
          for (const nbr of ADJ[rid] || []) if (enemyStrengthAt(view, nbr, q.faction) > 0) targets++;
          s += W.pRaid * Math.min(targets, 2) * 0.6;
          break;
        }
      }
      if (o.starred) s += W.pStarBonus;
    }
    return s;
  },

  courierDecision(view, q, a, W) {
    if (a.decision === 'peekThreatDeck') return W.courierPeek;
    if (a.decision === 'pass') return W.courierPass;
    return W.courierSwap;
  },

  threatPeekPlacement(view, q, a, W) {
    return a.placement === 'bottom' ? W.peekBury : 0;
  },

  // ----- action phase -----
  resolveOrder(view, q, a, W) {
    if (a.type === 'resolveRaid') {
      if (!a.target) return 0.1;
      const o = view.ordersByRegion[a.target];
      let s = W.raidHit;
      if (o && !o.hidden) {
        if (o.type === 'support') s += W.raidSupport;
        if (o.type === 'consolidate') s += W.raidConsolidate;
      }
      return s;
    }
    if (a.type === 'resolveRally') {
      const p = regionProps(view, a.region);
      return a.muster ? W.rMusterPoint * Math.max(1, p.muster) : W.rAuthority;
    }
    // resolveMarch
    if (!a.moves.length) {
      // standing down is fine when there is nothing worth taking
      return W.mStandDown;
    }
    const UV = UNIT_VALUE(W);
    let s = 0, leftBehind = myStrengthAt(view, a.region, q.faction);
    for (const mv of a.moves) {
      let str = 0;
      for (const [t, n] of Object.entries(mv.units)) {
        str += unitStrength({ type: t }, { fortified: false }) * n;
        leftBehind -= unitStrength({ type: t }, { fortified: false }) * n;
      }
      s += attackScore(view, mv.to, str, q.faction, W);
      void UV;
    }
    // abandoning an owned seat with hostiles on the border
    const props = region(a.region)?.kind === 'maritime' ? { muster: 0 } : regionProps(view, a.region);
    if (props.muster > 0 && leftBehind <= 0 && pressureOn(view, a.region, q.faction) > 0) {
      s -= W.mAbandonSeat;
      if (a.leaveControl) s += W.mLeaveControl;
    }
    return s;
  },

  muster(view, q, a, W) {
    let s = 0, spent = 0, ships = 0;
    for (const b of a.builds) {
      const cost = b.type === 'cavalry' || b.type === 'siege_engine' ? 2 : 1;
      spent += cost;
      if (b.type === 'cavalry' || (b.type === 'upgrade' && b.to === 'cavalry')) s += W.muCavalry;
      if (b.type === 'warship') { s += W.muShip; ships++; }
    }
    void ships;
    return s + spent * W.muSpend;
  },

  reconcileSupply(view, q, a, W) {
    const UV = UNIT_VALUE(W);
    return -(UV[a.unitType] ?? 1);
  },

  // ----- bidding -----
  bid(view, q, a, W) {
    const trackW = { initiative: W.bidInitiative, prowess: W.bidProwess, command: W.bidCommand }[q.track] ?? 0.8;
    const order = view.tracks?.[q.track] || [];
    const idx = Math.max(0, order.indexOf(q.faction));
    const gainFactor = order.length > 1 ? idx / (order.length - 1) : 1; // low on the track = more to win
    const target = Math.min(q.max, Math.round(q.max * W.bidSpendFrac * trackW * (0.4 + 0.6 * gainFactor)));
    let s = -Math.abs(a.amount - target);
    const reserveBreach = a.amount - Math.max(0, q.max - W.bidReserve);
    if (reserveBreach > 0) s -= reserveBreach * W.bidOverspend;
    return s;
  },

  bidTieBreak(view, q, a, W) {
    const i = a.order.indexOf(q.faction);
    if (i !== -1) return -i; // put myself as high as the tie allows
    return -seatsControlled(view, a.order[0]); // else favor the weakest rival on top
  },

  invaderBid(view, q, a, W) {
    const stake = Math.min(1, (q.strength ?? view.threat ?? 0) / 12) * W.invThreatScale;
    const target = Math.min(q.max, Math.round(q.max * W.invSpendFrac * stake));
    let s = -Math.abs(a.amount - target);
    const reserveBreach = a.amount - Math.max(0, q.max - W.invReserve);
    if (reserveBreach > 0) s -= reserveBreach * W.invOverspend;
    return s;
  },

  invaderTieBreak(view, q, a) {
    if (q.side === 'highest') return a.chosen === q.faction ? 1 : 0;   // claim the reward
    return a.chosen === q.faction ? -1 : seatsControlled(view, a.chosen); // penalty on the leader
  },

  // ----- combat -----
  declareSupport(view, q, a, W) {
    const c = view.combat || {};
    if (a.side === 'attacker' && c.attacker === q.faction) return 5;
    if (a.side === 'defender' && c.defender === q.faction) return 5;
    if (a.side === 'refuse') return 1;
    // third party: back the smaller seat count (keep the table flat)
    const backed = a.side === 'attacker' ? c.attacker : c.defender;
    return backed ? 1 - seatsControlled(view, backed) * 0.1 : 0;
  },

  useBlade(view, q, a, W) { return a.use ? W.cBlade : 0; },
  useCardAbility(view, q, a, W) { return a.use ? W.cAbility : 0; },

  chooseLeaderCard(view, q, a, W) {
    const c = card(a.card);
    if (!c) return 0;
    const combat = view.combat;
    let stake = 0.5;
    if (combat?.region) {
      const rv = regionValue(view, combat.region, W);
      stake = Math.min(1, rv / (W.wSeat + W.wCitadelBonus));
    }
    return c.strength * stake * W.cStakeScale
         - c.strength * (1 - stake) * W.cHoard
         + (c.swords || 0) * W.cSwords + (c.forts || 0) * W.cForts;
  },

  chooseCasualties(view, q, a, W) {
    const UV = UNIT_VALUE(W);
    let loss = 0;
    for (const [t, n] of Object.entries(a.units)) loss += (UV[t] ?? 1) * n;
    return -loss;
  },

  retreat(view, q, a, W) {
    const fid = q.faction;
    let s = -pressureOn(view, a.to, fid) * W.rtSafety * 0.2;
    if (controllerOf(view, a.to) === fid) s += W.rtHome;
    return s;
  },

  replacePortShips(view, q, a, W) { return a.count * W.portShips; },

  // ----- events & invaders -----
  incursionTrack(view, q, a, W) {
    const pref = { initiative: 3, command: 2, prowess: 1 };
    // toTop: rise on the most valuable track; toBottom: sacrifice the least valuable
    return q.mode === 'toBottom' ? -(pref[a.track] ?? 0) : (pref[a.track] ?? 0);
  },

  incursionCard(view, q, a) {
    const c = card(a.card);
    if (!c) return 0;
    return q.from === 'hand' ? -c.strength : c.strength; // discard weak, retrieve strong
  },

  incursionMusterSite(view, q, a, W) {
    return regionProps(view, a.region).muster * W.rMusterPoint;
  },

  incursionUnits(view, q, a, W) {
    const UV = UNIT_VALUE(W);
    let v = 0;
    for (const u of a.units) v += UV[u.type] ?? 1;
    return q.purpose === 'upgrade' ? v : -v; // destroy/downgrade cheap; upgrade rich
  },
};

/**
 * M3.d weights schema — per-faction-ready (owner decision, Jul 2026):
 *   { shared: {...full flat vector...}, perFaction: { F1: {...deltas...} } }
 * The optimizer tunes `shared` first; faction deltas are multiplicative
 * overrides layered on top when (M3.d seat-bias study permitting) asymmetry
 * proves real. A flat vector is accepted anywhere a config is, so v1-era
 * weights files never break.
 */
export function effectiveWeights(cfg, fid) {
  if (!cfg) return { ...WEIGHTS };
  if (!cfg.shared && !cfg.perFaction) return { ...WEIGHTS, ...cfg }; // legacy flat
  const out = { ...WEIGHTS, ...(cfg.shared || {}) };
  const delta = cfg.perFaction?.[fid];
  if (delta) for (const k of Object.keys(delta)) out[k] = (out[k] ?? 0) * delta[k];
  return out;
}
