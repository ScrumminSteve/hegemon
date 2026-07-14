// Faction views (M1.a). UI and AI consume views, never raw state — hidden
// information is enforced architecturally, not cosmetically (Rules p.27).

/**
 * A redacted projection of the state for one faction.
 * During the Planning Phase, other factions' unrevealed orders are masked:
 * their presence is visible (a face-down token on the board is public) but
 * their type is not.
 */
export function viewFor(state, factionId) {
  const v = structuredClone(state);
  v.viewer = factionId;

  const masked = {};
  for (const [rid, order] of Object.entries(v.ordersByRegion)) {
    if (order.revealed || order.faction === factionId) {
      masked[rid] = order;
    } else {
      masked[rid] = { faction: order.faction, hidden: true };
    }
  }
  v.ordersByRegion = masked;

  // Unrevealed leader-card picks are hidden from the other side (Rules p.19).
  if (v.combat?.cards && !v.combat.cardsRevealed) {
    for (const [fid, id] of Object.entries(v.combat.cards)) {
      if (fid !== factionId && id) v.combat.cards[fid] = { hidden: true };
    }
  }

  // Deck order is hidden information: lengths are public (piles are visible
  // on the table), contents are not. Discard piles are face-up and public.
  if (v.eventDecks) {
    for (const deck of Object.values(v.eventDecks)) {
      deck.draw = deck.draw.map(() => 'hidden');
    }
  }
  if (v.invaderDeck) v.invaderDeck = v.invaderDeck.map(() => 'hidden');

  // Sealed bids are each faction's own secret until revealed together
  // (Rules p.15). Presence is public (a fist over the table); value is not.
  if (v.eventPhase?.bidding?.phase === 'sealed') {
    const mine = v.eventPhase.bidding.bids[factionId];
    v.eventPhase.bidding.bids = Object.fromEntries(
      Object.keys(v.eventPhase.bidding.bids).map(f =>
        [f, f === factionId ? mine : 'sealed']));
  }

  // Incursion bids seal under the same law (Rules p.22).
  if (v.eventPhase?.incursion?.phase === 'sealed') {
    const mine = v.eventPhase.incursion.bids[factionId];
    v.eventPhase.incursion.bids = Object.fromEntries(
      Object.keys(v.eventPhase.incursion.bids).map(f =>
        [f, f === factionId ? mine : 'sealed']));
  }

  // A Courier peek reveals the card to the holder alone.
  for (const q of v.pendingQueries) {
    if (q.type === 'threatPeekPlacement' && q.faction !== factionId) delete q.card;
  }

  // The transcript replays hidden decisions verbatim (sealed orders, bids) —
  // engine-internal, like the seed. Learning consumes it server-side only.
  delete v.actionLog;
  delete v.config;

  // Earned secrets travel only in their owner's view (M3 AI parity contract:
  // an AI's whole world is viewFor + legalActions — nothing else).
  if (v.privateKnowledge) {
    v.privateKnowledge = { [factionId]: v.privateKnowledge[factionId] || {} };
  }

  // The seed is engine-internal; a peeking client could predict shuffles.
  delete v.seed;
  return v;
}
