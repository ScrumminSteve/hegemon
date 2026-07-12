// HEGEMON invader deck — IP-NEUTRAL DATA transcribed verbatim-in-substance from
// the owner's card photos (Jul 2026). Names live in theme packs. 9 cards.
//
// Each card: what happens on invader victory (lowestBidder + everyoneElse) and
// on defender victory (highestBidder). Effects are hook descriptors for M2.d.

export const INVADER_CARDS = {
  'W-silence': {   // "nothing happens" across the board
    lossText: 'Defeat — nothing happens, for lowest and others alike.',
    winText: 'Victory — nothing happens; the realm exhales.',
    loss:  { lowest: { type: 'nothing' }, others: { type: 'nothing' } },
    win:   { highest: { type: 'nothing' } },
  },
  'W-kingBeyond': {
    lossText: 'Defeat — lowest bidder: drop to the bottom of every track; others: drop to the bottom of the {prowess} or {command} track (your choice).',
    winText: 'Victory — highest bidder: move to the top of any one track, taking its token.',
    loss:  { lowest: { type: 'tracksToBottomAll' },
             others: { type: 'chooseTrackToBottom', tracks: ['prowess', 'command'] } },
    win:   { highest: { type: 'trackToTopChoice', takeToken: true } },
  },
  'W-mammoth': {
    lossText: 'Defeat — lowest bidder: destroy 3 of your units anywhere; others: destroy 2 units.',
    winText: 'Victory — highest bidder: retrieve one leader card of your choice from your discard.',
    loss:  { lowest: { type: 'destroyUnits', count: 3, where: 'anywhere' },
             others: { type: 'destroyUnits', count: 2, where: 'anywhere' } },
    win:   { highest: { type: 'retrieveLeaderCard' } }, // any 1 card from own discard
  },
  'W-massing': {
    lossText: 'Defeat — lowest bidder: discard every leader card tied for your highest strength (if you hold more than one card); others: discard one card of your choice.',
    winText: 'Victory — highest bidder: your entire leader discard returns to your hand.',
    loss:  { lowest: { type: 'discardHighestLeaderCards' },   // if hand > 1: discard ALL cards tied for highest strength
             others: { type: 'discardChosenLeaderCard' } },    // if hand > 1: choose and discard one
    win:   { highest: { type: 'recoverLeaderDiscard' } },      // entire discard pile returns to hand
  },
  'W-horde': {
    lossText: 'Defeat — lowest bidder: destroy 2 units from one of your fortified areas (anywhere if none); others: destroy 1 unit anywhere.',
    winText: 'Victory — highest bidder: recruit in one fortified area you control.',
    loss:  { lowest: { type: 'destroyUnits', count: 2, where: 'ownFortified', fallback: 'anywhere' },
             others: { type: 'destroyUnits', count: 1, where: 'anywhere' } },
    win:   { highest: { type: 'musterOneFortifiedArea' } },    // normal mustering rules, one controlled fort/citadel
  },
  'W-rattleshirt': {
    lossText: 'Defeat — lowest bidder: reduce your supply 2 steps (minimum 0) and reconcile armies; others: reduce supply 1 step and reconcile.',
    winText: 'Victory — highest bidder: raise your supply 1 step (maximum 6).',
    loss:  { lowest: { type: 'supplyShift', amount: -2, min: 0, reconcile: true },
             others: { type: 'supplyShift', amount: -1, min: 0, reconcile: true } },
    win:   { highest: { type: 'supplyShift', amount: 1, max: 6 } },
  },
  'W-preemptive': {
    lossText: 'Defeat — lowest bidder chooses: destroy 2 of your units anywhere, or fall 2 spaces on your highest track; others: nothing.',
    winText: 'Victory — highest bidder is exempt as the invaders immediately attack again at strength 6.',
    loss:  { lowest: { type: 'choice', options: [
               { type: 'destroyUnits', count: 2, where: 'anywhere' },
               { type: 'trackShift', track: 'highestOwn', amount: -2 },
             ] },
             others: { type: 'nothing' } },
    win:   { highest: { type: 'immediateReattack', strength: 6, excludeHighest: true } },
  },
  'W-crowKillers': {
    lossText: 'Defeat — lowest bidder: all your {cavalry} degrade to {infantry} (destroyed if the pool runs dry); others: degrade 2 {cavalry}.',
    winText: 'Victory — highest bidder: upgrade up to 2 of your {infantry} to {cavalry}, pool permitting.',
    loss:  { lowest: { type: 'downgradeCavalry', count: 'all' },   // cavalry -> infantry from pool; unreplaceable destroyed
             others: { type: 'downgradeCavalry', count: 2 } },
    win:   { highest: { type: 'upgradeInfantry', count: 2 } },     // up to 2 infantry -> cavalry, pool permitting
  },
  'W-skinchanger': {
    lossText: 'Defeat — lowest bidder: discard all your {authority}; others: discard 2 {authority}.',
    winText: 'Victory — highest bidder: your bid is returned to you.',
    loss:  { lowest: { type: 'discardAuthority', count: 'all' },
             others: { type: 'discardAuthority', count: 2 } },     // or as many as able
    win:   { highest: { type: 'refundBid' } },
  },
};
