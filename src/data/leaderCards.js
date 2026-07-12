// HEGEMON leader cards — IP-NEUTRAL DATA transcribed from owner card photos
// (Jul 2026). Names live in theme packs; `text` is neutral rules language with
// {term} placeholders resolved against the active theme's terms table.
//
// icons: swords cause casualties when this card's owner WINS; forts prevent
// casualties when this card's owner LOSES (Rules p.19–20).
// hook: mechanical descriptor — all 42 implemented as of M1.5b.
// ⚠ icon counts verified:false pending owner audit (see README).

export const LEADER_CARDS = {
  // ---- F1 (north) ----
  'F1-4':  { faction: 'F1', strength: 4, swords: 2, forts: 0 },
  'F1-3':  { faction: 'F1', strength: 3, swords: 0, forts: 0,
             hook: { type: 'onWinChooseEnemyRetreat' },
             text: 'If you win this combat, you choose the area your opponent retreats to (a legal area where they lose the fewest units).' },
  'F1-2a': { faction: 'F1', strength: 2, swords: 0, forts: 0,
             hook: { type: 'onLoseRecoverDiscard' },
             text: 'If you lose this combat, return your entire leader-card discard pile to your hand (including this card).' },
  'F1-2b': { faction: 'F1', strength: 2, swords: 1, forts: 0 },
  'F1-1a': { faction: 'F1', strength: 1, swords: 0, forts: 2 },
  'F1-1b': { faction: 'F1', strength: 1, swords: 0, forts: 0,
             hook: { type: 'casualtyImmunity' },
             text: 'You take no casualties in this combat from leader-card abilities or combat icons.' },
  'F1-0':  { faction: 'F1', strength: 0, swords: 0, forts: 0,
             hook: { type: 'doubleDefenseOrder' },
             text: 'If you have a Defend order in the embattled area, its value is doubled.' },

  // ---- F2 (gilded) ----
  'F2-4':  { faction: 'F2', strength: 4, swords: 0, forts: 0,
             hook: { type: 'onWinGainAuthority', amount: 2 },
             text: 'If you win this combat, gain two {authority} tokens.' },
  'F2-3':  { faction: 'F2', strength: 3, swords: 3, forts: 0 },
  'F2-2a': { faction: 'F2', strength: 2, swords: 1, forts: 0 },
  'F2-2b': { faction: 'F2', strength: 2, swords: 0, forts: 2 },
  'F2-1a': { faction: 'F2', strength: 1, swords: 0, forts: 0,
             hook: { type: 'cancelOpponentCard' },
             text: "You may immediately cancel your opponent's chosen leader card; they reveal a different one (or none, if their hand is empty)." },
  'F2-1b': { faction: 'F2', strength: 1, swords: 0, forts: 0,
             hook: { type: 'unitBonusOverride', unit: 'infantry', bonus: 2, when: 'attacking' },
             text: 'If you are attacking, all of your participating {unitInfantry} (including supporting friendly ones) add +2 combat strength instead of +1.' },
  'F2-0':  { faction: 'F2', strength: 0, swords: 0, forts: 0,
             hook: { type: 'onWinRemoveEnemyOrder' },
             text: "If you win this combat, you may remove one of the loser's order tokens from anywhere on the board." },

  // ---- F3 (storm) ----
  'F3-4':  { faction: 'F3', strength: 4, swords: 0, forts: 0,
             hook: { type: 'strengthBonusIfOpponentHigher', track: 'initiative', amount: 1 },
             text: 'If your opponent holds a higher position on the {trackInitiative} track, this card gains +1 combat strength.' },
  'F3-3':  { faction: 'F3', strength: 3, swords: 0, forts: 0,
             hook: { type: 'onWinUpgradeInfantry' },
             text: 'If you win this combat, you may upgrade one participating (or supporting friendly) {unitInfantry} to a {unitCavalry}.' },
  'F3-2a': { faction: 'F3', strength: 2, swords: 1, forts: 1 },
  'F3-2b': { faction: 'F3', strength: 2, swords: 0, forts: 0,
             hook: { type: 'selfBuffIfCardInDiscard', card: 'F3-4', strength: 1, swords: 1 },
             text: 'If your strength-4 leader card is in your discard pile, this card gains +1 combat strength and a sword icon.' },
  'F3-1a': { faction: 'F3', strength: 1, swords: 0, forts: 0,
             hook: { type: 'zeroShipsIfSupported' },
             text: 'If you are being supported in this combat, the combat strength of all non-friendly {unitWarship}s is reduced to 0.' },
  'F3-1b': { faction: 'F3', strength: 1, swords: 1, forts: 0 },
  'F3-0':  { faction: 'F3', strength: 0, swords: 0, forts: 0,
             hook: { type: 'afterCombatDiscardOpponentCard' },
             text: "After combat, look at your opponent's hand and discard one leader card of your choice." },

  // ---- F4 (verdant) ----
  'F4-4':  { faction: 'F4', strength: 4, swords: 0, forts: 0,
             hook: { type: 'destroyEnemyInfantry' },
             text: "Immediately destroy one of your opponent's attacking or defending {unitInfantry} units." },
  'F4-3':  { faction: 'F4', strength: 3, swords: 0, forts: 0,
             hook: { type: 'onWinReuseMarchOrder' },
             text: 'If you attack and win, move the March order into the conquered area instead of discarding it; it may be resolved again this round.' },
  'F4-2a': { faction: 'F4', strength: 2, swords: 2, forts: 0 },
  'F4-2b': { faction: 'F4', strength: 2, swords: 1, forts: 0 },
  'F4-1a': { faction: 'F4', strength: 1, swords: 0, forts: 1 },
  'F4-1b': { faction: 'F4', strength: 1, swords: 0, forts: 1 },
  'F4-0':  { faction: 'F4', strength: 0, swords: 0, forts: 0,
             hook: { type: 'removeAdjacentEnemyOrder' },
             text: "Immediately remove one of your opponent's order tokens in an area adjacent to the embattled area (not the March order that began this combat)." },

  // ---- F5 (dune) ----
  'F5-4':  { faction: 'F5', strength: 4, swords: 2, forts: 1 },
  'F5-3':  { faction: 'F5', strength: 3, swords: 0, forts: 1 },
  'F5-2a': { faction: 'F5', strength: 2, swords: 1, forts: 0 },
  'F5-2b': { faction: 'F5', strength: 2, swords: 1, forts: 0 },
  'F5-1a': { faction: 'F5', strength: 1, swords: 0, forts: 0,
             hook: { type: 'conditionalIcon' },
             text: 'If you are defending, this card gains a fortification icon. If you are attacking, it gains a sword icon.' },
  'F5-1b': { faction: 'F5', strength: 1, swords: 0, forts: 0,
             hook: { type: 'onLoseDefendingBlockAdvance' },
             text: 'If you defend and lose, your opponent may not advance into the embattled area; their units return whence they marched. Your units must still retreat.' },
  'F5-0':  { faction: 'F5', strength: 0, swords: 0, forts: 0,
             hook: { type: 'moveOpponentToTrackBottom' },
             text: 'Immediately move your opponent to the bottom of one influence track of your choice.' },

  // ---- F6 (corsair) ----
  'F6-4':  { faction: 'F6', strength: 4, swords: 1, forts: 0 },
  'F6-3':  { faction: 'F6', strength: 3, swords: 0, forts: 0,
             hook: { type: 'unitBonusOverride', unit: 'warship', bonus: 2, when: 'attacking' },
             text: 'If you are attacking, all of your participating {unitWarship}s (including supporting friendly ones) add +2 combat strength instead of +1.' },
  'F6-2a': { faction: 'F6', strength: 2, swords: 0, forts: 0,
             hook: { type: 'selfBuffIfDefendingFortified', strength: 1, swords: 1 },
             text: 'If you are defending an area containing a {fort} or {citadel}, this card gains +1 combat strength and a sword icon.' },
  'F6-2b': { faction: 'F6', strength: 2, swords: 0, forts: 0,
             hook: { type: 'zeroOpponentPrintedStrength' },
             text: "The printed combat strength of your opponent's leader card is reduced to 0." },
  'F6-1a': { faction: 'F6', strength: 1, swords: 0, forts: 0,
             hook: { type: 'selfBuffIfUnsupported', swords: 2, forts: 1 },
             text: 'If you are not being supported in this combat, this card gains two sword icons and one fortification icon.' },
  'F6-1b': { faction: 'F6', strength: 1, swords: 1, forts: 1 },
  'F6-0':  { faction: 'F6', strength: 0, swords: 0, forts: 0,
             hook: { type: 'swapSelfForAuthority', cost: 2 },
             text: 'You may discard two available {authority} tokens to discard this card and choose a different leader card from your hand (if able).' },
};

export const HAND_BY_FACTION = (() => {
  const out = {};
  for (const [id, c] of Object.entries(LEADER_CARDS)) {
    (out[c.faction] = out[c.faction] || []).push(id);
  }
  for (const list of Object.values(out)) list.sort();
  return out;
})();
