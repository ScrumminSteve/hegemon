// M3.b goldens — the heuristic agent.
//
// Same law as M3.a: every pick is a menu item (parity + zero rejection by
// construction), play is deterministic per (game seed, bot seed, jitter seed),
// and the agent's whole world is viewFor + the engine-computed menu. The
// strength proof (10/12 wins, mean rank 1.42 vs 3.5 uniform over rotating
// seats) lives in tools/tournament.mjs — a rank assertion in-suite would be
// a coin-flip golden; completion and determinism are the in-suite contract.

import { createGame } from '../src/engine/state.js';
import { beginPlanning, applyAction, stateHash } from '../src/engine/engine.js';
import { viewFor } from '../src/engine/views.js';
import { legalActions, currentQuery } from '../src/engine/legal.js';
import { createHeuristicAgent, jitterWeights, WEIGHTS } from '../src/agents/heuristic.js';
import { createRandomAgent, botRng } from '../src/agents/random.js';
import { eq, ok } from './assert.js';

function playMixed(seed, botSeed, mix) {
  let s = createGame(6, { seed });
  beginPlanning(s);
  const agents = {};
  s.factions.forEach((fid, i) => {
    agents[fid] = mix[i] === 'h'
      ? createHeuristicAgent({ jitterSeed: botSeed * 131 + i })
      : createRandomAgent();
  });
  const rng = botRng(botSeed);
  let steps = 0;
  while (s.phase !== 'gameOver') {
    if (++steps > 6000) throw new Error(`seed ${seed}: stuck after ${steps} actions`);
    const q = currentQuery(s);
    const menu = legalActions(s, q);
    const action = agents[q.faction].decide(viewFor(s, q.faction), q, menu, rng);
    ok(menu.includes(action), 'the heuristic returns a MENU ITEM, never a constructed action');
    s = applyAction(s, action).state; // any throw = zero-rejection breach
  }
  return { state: s, steps };
}

export const tests = [
  { name: 'HEURISTIC FUZZ: all-heuristic and mixed tables play full games with zero rejections (M3.b sanity; strength proof in tools/tournament.mjs)', fn() {
    const a = playMixed(9101, 9101 * 31 + 7, 'hhhhhh');
    eq(a.state.phase, 'gameOver', 'all-heuristic table completes');
    ok(a.steps > 100, `a real game happened (${a.steps} actions)`);
    const b = playMixed(9102, 9102 * 31 + 7, 'hrrhrr');
    eq(b.state.phase, 'gameOver', 'mixed table completes');
  }},

  { name: 'determinism: same (game seed, bot seed, jitter seeds) = identical transcript and final state', fn() {
    const a = playMixed(9101, 424242, 'hhhhhh');
    const b = playMixed(9101, 424242, 'hhhhhh');
    eq(a.steps, b.steps, 'same action count');
    eq(stateHash(a.state), stateHash(b.state), 'same final state hash');
  }},

  { name: 'jitter: same seed = same personality, different seed = different; effective weights are exposed for episode recording', fn() {
    const w1 = jitterWeights(WEIGHTS, 555);
    const w2 = jitterWeights(WEIGHTS, 555);
    const w3 = jitterWeights(WEIGHTS, 556);
    eq(JSON.stringify(w1), JSON.stringify(w2), 'jitter is deterministic');
    ok(JSON.stringify(w1) !== JSON.stringify(w3), 'a different seed is a different personality');
    ok(Object.keys(w1).every(k => Math.abs(w1[k] - WEIGHTS[k]) <= Math.abs(WEIGHTS[k]) * 0.2 + 1e-9),
      'jitter stays inside the magnitude envelope');
    const agent = createHeuristicAgent({ jitterSeed: 555 });
    eq(agent.id, 'heuristic-v1+j555', 'the id names the personality');
    eq(JSON.stringify(agent.weights), JSON.stringify(w1), 'effective weights ride on the agent');
  }},

  { name: 'behavior: casualties spare the strong — the cheapest legal multiset is chosen', fn() {
    const agent = createHeuristicAgent();
    const q = { type: 'chooseCasualties', faction: 'F1', count: 1, available: { infantry: 2, cavalry: 1 } };
    const menu = [
      { type: 'chooseCasualties', faction: 'F1', units: { cavalry: 1 } },
      { type: 'chooseCasualties', faction: 'F1', units: { infantry: 1 } },
    ];
    const pick = agent.decide({}, q, menu, botRng(1));
    eq(JSON.stringify(pick.units), '{"infantry":1}', 'infantry dies before cavalry');
  }},

  { name: 'behavior: invader bids scale with attack strength (same purse, bigger threat, bigger bid)', fn() {
    const agent = createHeuristicAgent();
    const view = { threat: 0 };
    const mkMenu = q => Array.from({ length: q.max + 1 }, (_, a) => ({ type: 'invaderBid', faction: 'F1', amount: a }));
    const low = agent.decide(view, { type: 'invaderBid', faction: 'F1', max: 10, strength: 2 }, mkMenu({ max: 10 }), botRng(1));
    const high = agent.decide(view, { type: 'invaderBid', faction: 'F1', max: 10, strength: 12 }, mkMenu({ max: 10 }), botRng(1));
    ok(high.amount > low.amount, `strength 12 bid (${high.amount}) exceeds strength 2 bid (${low.amount})`);
  }},

  { name: 'behavior: mustering spends the budget — a fuller build beats an empty one', fn() {
    const agent = createHeuristicAgent();
    const q = { type: 'muster', faction: 'F1', region: 'L01', points: 2 };
    const menu = [
      { type: 'muster', faction: 'F1', region: 'L01', builds: [] },
      { type: 'muster', faction: 'F1', region: 'L01', builds: [{ type: 'cavalry', to: 'L01' }] },
    ];
    const pick = agent.decide({}, q, menu, botRng(1));
    eq(pick.builds.length, 1, 'the spending build wins');
  }},
];

// --- m3e1: blunder-bank behavioral goldens ----------------------------------
const bp2 = beginPlanning, vf2 = viewFor; // already imported at top

tests.push(
  { name: 'behavior: sea rallies are shunned — the same set with support at sea outranks it (owner ruling m3e1)', fn() {
    const g = createGame(6, { seed: 21 });
    bp2(g);
    const agent = createHeuristicAgent();
    const base = { L01: { type: 'march', mod: 0, starred: false }, L04: { type: 'defend', mod: 1, starred: false } };
    const menu = [
      { type: 'submitOrders', faction: 'F1', orders: { ...base, S02: { type: 'rally', mod: 0, starred: false } } },
      { type: 'submitOrders', faction: 'F1', orders: { ...base, S02: { type: 'support', mod: 0, starred: false } } },
    ];
    const pick = agent.decide(vf2(g, 'F1'), { type: 'submitOrders', faction: 'F1' }, menu, botRng(3));
    eq(pick.orders.S02.type, 'support', 'the wasted rally never wins the argmax');
  }},

  { name: 'behavior: pointless raids are penalized — raiding empty borders loses to rallying the citadel (blunder #3)', fn() {
    const g = createGame(6, { seed: 21 });
    bp2(g);
    const agent = createHeuristicAgent();
    const base = { L04: { type: 'defend', mod: 1, starred: false }, S02: { type: 'support', mod: 0, starred: false } };
    const menu = [
      { type: 'submitOrders', faction: 'F1', orders: { ...base, L01: { type: 'raid', mod: 0, starred: false } } },
      { type: 'submitOrders', faction: 'F1', orders: { ...base, L01: { type: 'rally', mod: 0, starred: false } } },
    ];
    const pick = agent.decide(vf2(g, 'F1'), { type: 'submitOrders', faction: 'F1' }, menu, botRng(3));
    eq(pick.orders.L01.type, 'rally', 'no enemies adjacent = the raid token is dead weight');
  }},

  { name: 'behavior: a starred rally off-fort loses to the plain rally (blunder #6 — stars are for musters)', fn() {
    const g = createGame(6, { seed: 21 });
    bp2(g);
    const agent = createHeuristicAgent();
    // L04 is fortified at this seed — plant an outpost on plain ground instead.
    g.unitsByRegion['L03'] = [{ faction: 'F1', type: 'infantry', routed: false }];
    const base = { L01: { type: 'march', mod: 0, starred: false }, L04: { type: 'defend', mod: 1, starred: false }, S02: { type: 'support', mod: 0, starred: false } };
    const menu = [
      { type: 'submitOrders', faction: 'F1', orders: { ...base, L03: { type: 'rally', mod: 0, starred: true } } },
      { type: 'submitOrders', faction: 'F1', orders: { ...base, L03: { type: 'rally', mod: 0, starred: false } } },
    ];
    const pick = agent.decide(vf2(g, 'F1'), { type: 'submitOrders', faction: 'F1' }, menu, botRng(3));
    ok(!pick.orders.L03.starred, 'the star waits for fortified ground');
  }},

  { name: 'behavior: sovereign tie-breaks put self first and the seat leader last (blunder #4)', fn() {
    const g = createGame(6, { seed: 21 });
    bp2(g);
    // F4 gets two extra fortified holdings so it clearly leads on seats.
    for (const rid of ['L31', 'L34']) {
      g.unitsByRegion[rid] = [{ faction: 'F4', type: 'infantry', routed: false }];
    }
    const agent = createHeuristicAgent();
    const v = vf2(g, 'F1');
    const selfIn = agent.decide(v, { type: 'bidTieBreak', faction: 'F1', track: 'initiative' }, [
      { type: 'bidTieBreak', faction: 'F1', order: ['F1', 'F4'] },
      { type: 'bidTieBreak', faction: 'F1', order: ['F4', 'F1'] },
    ], botRng(3));
    eq(selfIn.order[0], 'F1', 'self as early as the tie allows');
    const noSelf = agent.decide(v, { type: 'bidTieBreak', faction: 'F1', track: 'initiative' }, [
      { type: 'bidTieBreak', faction: 'F1', order: ['F4', 'F5'] },
      { type: 'bidTieBreak', faction: 'F1', order: ['F5', 'F4'] },
    ], botRng(3));
    eq(noSelf.order[0], 'F5', 'the leader eats the back of the line');
  }},
);

tests.push(
  { name: 'behavior: port defends are shunned — battles cannot reach a dock, so the token goes where it works (owner ruling; blunder #1 closed)', fn() {
    const g = createGame(6, { seed: 21 });
    bp2(g);
    const agent = createHeuristicAgent();
    const base = { L36: { type: 'defend', mod: 1, starred: false }, L16: { type: 'rally', mod: 0, starred: false }, S10: { type: 'march', mod: 0, starred: false } };
    const menu = [
      { type: 'submitOrders', faction: 'F2', orders: { ...base, P04: { type: 'defend', mod: 1, starred: false } } },
      { type: 'submitOrders', faction: 'F2', orders: { ...base, P04: { type: 'support', mod: 0, starred: false } } },
    ];
    const pick = agent.decide(vf2(g, 'F2'), { type: 'submitOrders', faction: 'F2' }, menu, botRng(3));
    eq(pick.orders.P04.type, 'support', 'the dock supports its sea instead of defending nothing');
  }},
);


tests.push(
  { name: 'behavior: decrees are weapons — a ban always outranks "nothing" (blunder #8)', fn() {
    const g = createGame(6, { seed: 21 });
    bp2(g);
    const agent = createHeuristicAgent();
    const menu = [
      { type: 'eventChoice', faction: 'F1', option: 'nothing' },
      { type: 'eventChoice', faction: 'F1', option: 'banOrder:marchPlusOne' },
      { type: 'eventChoice', faction: 'F1', option: 'banOrder:raid' },
    ];
    const pick = agent.decide(vf2(g, 'F1'), { type: 'eventChoice', faction: 'F1' }, menu, botRng(3));
    ok(pick.option !== 'nothing', 'passivity never wins the argmax');
    eq(pick.option, 'banOrder:marchPlusOne', 'the tempo class is the priority denial');
  }},
);
