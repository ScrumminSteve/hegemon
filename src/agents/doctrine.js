// ---------------------------------------------------------------------------
// DOCTRINE BOOKS (m3e55) — hand-authored opening lines, layered OVER the
// mined book (books.js is GENERATED and re-mined; this file is the one place
// opening doctrine is written by hand, per owner ruling).
//
// FIRST ENTRY — THE LONDON GAMBIT. Owner ruling, Aug 25 2026 (verbatim):
// "Tudor, round one, ninety percent of the time, should TAKE LONDON. It
// gives the stronger starting position — more than any other house, it's
// the go-to opener." Direct medicine for F3, the lineage's worst seat
// (5-7/100 on every pool block). The Weald (L20) is London's gateway; the
// placement line marches the home host at the city while the port fleet
// screens. Destination choice remains the scorer's — with reach, seat
// hunger, and an unheld citadel one step away, the march finds London.
//
// Activation is GATED like everything else: this layer is inert while
// bookBias is 0 (the shipped default). runs/tudor-book.json wakes it for
// F3 only; G10 decides whether it ships on.
// ---------------------------------------------------------------------------

export const DOCTRINE_BOOKS = {
  F3: {
    1: {
      doctrine: 'THE LONDON GAMBIT — owner ruling Aug 25 2026',
      regions: {
        // prior weights, same scale as mined priors (top mined lines ≈ 1)
        L20: { 'march': 1.0, 'march+1*': 0.9 },
        L22: { 'rally*': 0.7, 'rally': 0.5 },
        S04: { 'march-1': 0.6, 'defend+1': 0.4 },
      },
      sets: [
        { orders: {
            L20: { type: 'march', mod: 0, starred: false },
            L22: { type: 'rally', mod: 0, starred: true },
            S04: { type: 'march', mod: -1, starred: false },
          },
          n: 9, doctrine: true },
      ],
    },
  },
};

export function doctrineLines(fid, round) {
  return DOCTRINE_BOOKS[fid]?.[round]?.sets ?? [];
}

export function doctrinePrior(fid, round, rid, tokenKey) {
  return DOCTRINE_BOOKS[fid]?.[round]?.regions?.[rid]?.[tokenKey] ?? 0;
}
