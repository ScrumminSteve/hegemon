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

  // The seed is engine-internal; a peeking client could predict shuffles.
  delete v.seed;
  return v;
}
