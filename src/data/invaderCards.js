// HEGEMON invader deck — IP-NEUTRAL DATA transcribed verbatim-in-substance from
// the owner's card photos (Jul 2026). Names live in theme packs. 9 cards.
//
// Each card: what happens on invader victory (lowestBidder + everyoneElse) and
// on defender victory (highestBidder). Effects are hook descriptors for M2.d.

export const INVADER_CARDS = {
  'W-silence': {   // "nothing happens" across the board
    loss:  { lowest: { type: 'nothing' }, others: { type: 'nothing' } },
    win:   { highest: { type: 'nothing' } },
  },
  'W-kingBeyond': {
    loss:  { lowest: { type: 'tracksToBottomAll' },
             others: { type: 'chooseTrackToBottom', tracks: ['prowess', 'command'] } },
    win:   { highest: { type: 'trackToTopChoice', takeToken: true } },
  },
  'W-mammoth': {
    loss:  { lowest: { type: 'destroyUnits', count: 3, where: 'anywhere' },
             others: { type: 'destroyUnits', count: 2, where: 'anywhere' } },
    win:   { highest: { type: 'retrieveLeaderCard' } }, // any 1 card from own discard
  },
  'W-massing': {
    loss:  { lowest: { type: 'discardHighestLeaderCards' },   // if hand > 1: discard ALL cards tied for highest strength
             others: { type: 'discardChosenLeaderCard' } },    // if hand > 1: choose and discard one
    win:   { highest: { type: 'recoverLeaderDiscard' } },      // entire discard pile returns to hand
  },
  'W-horde': {
    loss:  { lowest: { type: 'destroyUnits', count: 2, where: 'ownFortified', fallback: 'anywhere' },
             others: { type: 'destroyUnits', count: 1, where: 'anywhere' } },
    win:   { highest: { type: 'musterOneFortifiedArea' } },    // normal mustering rules, one controlled fort/citadel
  },
  'W-rattleshirt': {
    loss:  { lowest: { type: 'supplyShift', amount: -2, min: 0, reconcile: true },
             others: { type: 'supplyShift', amount: -1, min: 0, reconcile: true } },
    win:   { highest: { type: 'supplyShift', amount: 1, max: 6 } },
  },
  'W-preemptive': {
    loss:  { lowest: { type: 'choice', options: [
               { type: 'destroyUnits', count: 2, where: 'anywhere' },
               { type: 'trackShift', track: 'highestOwn', amount: -2 },
             ] },
             others: { type: 'nothing' } },
    win:   { highest: { type: 'immediateReattack', strength: 6, excludeHighest: true } },
  },
  'W-crowKillers': {
    loss:  { lowest: { type: 'downgradeCavalry', count: 'all' },   // cavalry -> infantry from pool; unreplaceable destroyed
             others: { type: 'downgradeCavalry', count: 2 } },
    win:   { highest: { type: 'upgradeInfantry', count: 2 } },     // up to 2 infantry -> cavalry, pool permitting
  },
  'W-skinchanger': {
    loss:  { lowest: { type: 'discardAuthority', count: 'all' },
             others: { type: 'discardAuthority', count: 2 } },     // or as many as able
    win:   { highest: { type: 'refundBid' } },
  },
};
