// Clash of Kings — hidden simultaneous bidding on the three influence tracks
// (Rules p.14–15). M2.c.
//
// Sequence per track (initiative, then prowess, then command):
//   1. Every faction secretly and simultaneously bids 0..authority.
//   2. All bids are revealed together and ALL are paid to the pool — win or
//      lose (Rules p.15).
//   3. New positions are assigned highest bid first. Ties are broken by the
//      CURRENT sovereign-token holder, who may order the tied factions freely
//      — including placing themselves (Rules p.15). The holder decided by the
//      token as it stands when the tie is broken, so winning the first track
//      changes who breaks ties on the next two.
//   4. The track's dominance token passes to the new first position.
//
// Sealed bids live in state.eventPhase.bidding.bids and are masked to their
// owner by viewFor until the reveal; each faction's own sealed bid is also
// recorded in privateKnowledge (M3 parity contract: what you did is yours to
// remember).

import { STAR_ALLOWANCE } from './state.js';

export const BID_TRACKS = ['initiative', 'prowess', 'command'];
const TOKEN_FOR = { initiative: 'sovereign', prowess: 'blade', command: 'courier' };

export function beginBidding(state, cardId) {
  state.eventPhase.bidding = { card: cardId, trackIndex: 0, bids: {}, phase: 'sealed' };
  openTrackBids(state);
  return false; // blocking until all three tracks resolve
}

function currentTrack(state) {
  return BID_TRACKS[state.eventPhase.bidding.trackIndex];
}

function openTrackBids(state) {
  const b = state.eventPhase.bidding;
  b.bids = {};
  b.phase = 'sealed';
  const track = currentTrack(state);
  for (const fid of state.factions) {
    state.pendingQueries.push({ type: 'bid', faction: fid, track, max: state.authority[fid] });
  }
  state.log.push({ round: state.round, event: 'biddingOpened', track });
}

/** A faction seals its bid. When the last bid arrives, the track resolves. */
export function bid(state, fid, track, amount) {
  const b = state.eventPhase?.bidding;
  if (!b) throw new Error('No bidding in progress');
  const qi = state.pendingQueries.findIndex(q => q.type === 'bid' && q.faction === fid && q.track === track);
  if (qi === -1) throw new Error(`${fid} has no pending bid on ${track}`);
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Bids are whole tokens, zero or more');
  if (amount > state.authority[fid]) throw new Error(`Bid ${amount} exceeds ${fid}'s ${state.authority[fid]} authority (Rules p.15)`);

  state.pendingQueries.splice(qi, 1);
  b.bids[fid] = amount;
  state.privateKnowledge[fid].lastBid = { track, amount, round: state.round };

  if (Object.keys(b.bids).length === state.factions.length) revealTrack(state);
}

function revealTrack(state) {
  const b = state.eventPhase.bidding;
  const track = currentTrack(state);
  b.phase = 'revealed';

  // All bids are paid, win or lose (Rules p.15).
  for (const [fid, amt] of Object.entries(b.bids)) {
    state.authority[fid] -= amt;
  }
  state.log.push({ round: state.round, event: 'bidsRevealed', track, bids: { ...b.bids } });

  // Group by bid, descending; singletons place immediately, ties queue for
  // the sovereign holder's judgment.
  const groups = {};
  for (const [fid, amt] of Object.entries(b.bids)) (groups[amt] = groups[amt] || []).push(fid);
  b.slots = Object.entries(groups)
    .sort((x, y) => Number(y[0]) - Number(x[0]))
    .map(([amt, fids]) => ({ amount: Number(amt), fids: fids.sort() }));
  b.newOrder = [];
  settleSlots(state);
}

function settleSlots(state) {
  const b = state.eventPhase.bidding;
  const track = currentTrack(state);
  while (b.slots.length) {
    const slot = b.slots[0];
    if (slot.fids.length === 1) {
      b.newOrder.push(slot.fids[0]);
      b.slots.shift();
      continue;
    }
    // Tie: the CURRENT sovereign holder orders the tied factions (Rules p.15).
    state.pendingQueries.push({
      type: 'bidTieBreak', faction: state.tokens.sovereign, track,
      tied: [...slot.fids], amount: slot.amount,
    });
    return; // resumes via bidTieBreak
  }
  finishTrack(state);
}

/** The sovereign holder submits a full ordering of one tied group. */
export function bidTieBreak(state, fid, track, order) {
  const qi = state.pendingQueries.findIndex(q => q.type === 'bidTieBreak' && q.faction === fid && q.track === track);
  if (qi === -1) throw new Error(`${fid} holds no tie to break on ${track}`);
  const q = state.pendingQueries[qi];
  const want = [...q.tied].sort().join(',');
  const got = [...order].sort().join(',');
  if (want !== got) throw new Error(`Tie-break must order exactly [${q.tied.join(', ')}]`);

  state.pendingQueries.splice(qi, 1);
  const b = state.eventPhase.bidding;
  b.newOrder.push(...order);
  b.slots.shift();
  state.log.push({ round: state.round, event: 'tieBroken', track, by: fid, order: [...order] });
  settleSlots(state);
}

function finishTrack(state) {
  const b = state.eventPhase.bidding;
  const track = currentTrack(state);
  state.tracks[track] = b.newOrder;
  const token = TOKEN_FOR[track];
  const holder = b.newOrder[0];
  const passed = state.tokens[token] !== holder;
  state.tokens[token] = holder;
  state.log.push({ round: state.round, event: 'trackRebuilt', track, order: [...b.newOrder], token, holder, passed });

  b.trackIndex += 1;
  if (b.trackIndex < BID_TRACKS.length) {
    openTrackBids(state);
    return;
  }
  // All three tracks settled: enforce the new command-track star allowance is
  // simply read live by planning (STAR_ALLOWANCE), nothing to do here.
  delete state.eventPhase.bidding;
  state.log.push({ round: state.round, event: 'biddingClosed' });
  state.eventPhase.step += 1;
  // progressEventPhase is invoked by the caller (eventPhase owns the loop).
}

export function biddingActive(state) {
  return !!state.eventPhase?.bidding;
}
