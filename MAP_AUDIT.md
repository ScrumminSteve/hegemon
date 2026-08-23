# MAP AUDIT — region names vs real British geography (m3e45)

Owner directive: Percy's story does not bend; the map eventually must.
This audit sizes the repair BEFORE any decision. Method: every named
land region's canvas position (x,y from src/data/map.js) was rank-
compared against its real-world location (lat/lon), both axes. Rank
distance separates true misplacements from mere canvas compression.
Raw table at the bottom; curated findings first.

## Findings, curated

**WRONG-SIDE ERRORS (the name sits on the wrong side of the island):**

1. **L28 "Alnwick" [F5 Percy HOME] — the anchor error.** Canvas: far
   SOUTHEAST corner. Real Alnwick: Northumberland, beside Bamburgh in
   the far NORTHEAST (which the map has correctly placed). N-S off by
   33 ranks of 38 — the largest possible class of error. Entangled
   with Percy's home seat: cannot be fixed by renaming alone without
   breaking the owner's story ruling.

2. **L27 "The Cornish Coast" — wrong coast entirely.** Canvas: south-
   EAST (x748). Real Cornwall: the far southWEST. E-W off by 31 ranks.
   NOT a home seat — freely fixable by rename (the canvas position is
   the Sussex/Kent shore; "The Sussex Coast", "Pevensey", or "The
   Cinque Ports" would all be historically apt). Cornwall then simply
   lives off-canvas beyond Exeter, which the art already implies.

3. **L36 "Lancaster" [F2 Lancaster HOME].** Real Lancaster: ~54°N, the
   island's northern third, west coast. Canvas: the southern half,
   mid-west (the real position of Shrewsbury/the Welsh border). N-S
   off by 10 ranks. Entangled with the house name itself — the
   heaviest story linkage on the board.

4. **L22 "Carisbrooke" [F3 Tudor HOME].** Real: Isle of Wight, south-
   central coast. Canvas: far EAST at mid latitude. High rank error,
   LOW story damage: it is an offshore island wherever it floats, and
   Tudor's exile-across-the-water narrative (fleet in the Solent,
   landings on the mainland) works identically. Recommend: accept as
   licensed fiction, lowest repair priority despite the score.

**CANVAS COMPRESSION (art-level, not name-level):**

5. **L01 "York" [F1 HOME]** scores high (N-S 10) but the name is not
   misplaced — the canvas compresses the far north, pinning York
   nearly beside Berwick when real York sits well south of the
   Northumberland cluster. A future canvas rework could stretch the
   north; no rename is meaningful here. Same class, milder: The
   Pennines (pinned east of the real spine), St Albans (drawn west of
   London; really almost due north of it), The Wash, Lundy.

**CLEAN (25 of 38 regions):** the entire northern cluster (Berwick,
Bamburgh, Newcastle, Cumbrian Coast, Furness, Scarborough, Isle of
Man), the midlands belt (Ludlow, Kenilworth, Trent, Midlands, Welsh
Marches, Gloucester), and most of the south (London, Dover, The Weald,
The Downs, Exeter, Salisbury, Glastonbury, Bristol, Thornbury) sit
where Britain put them. The map is ~70% faithful; the errors are few
and specific, not systemic.

## Repair tiers (decision remains DEFERRED per owner)

- **TIER A — free, name-only, no mechanics, no story cost:** rename
  L27 ("The Sussex Coast" or similar). Optionally retitle L12 to a
  spine-neutral name. One-line theme edits; zero corpus impact. Can
  ship any build.
- **TIER B — story-true home realignment (Percy north, Lancaster
  northwest):** moves SETUP home seats → rules-revision event → the
  ENTIRE verified corpus (20+ wins) goes stale. The only path that
  makes the feud geographically real. If ever taken: bundle with any
  other planned setup changes to pay the staleness cost once.
- **TIER C — canvas rework (stretch the compressed north):** art
  project over the unchanged graph; fixes York/Pennines class
  cosmetically; does not require but pairs well with Tier B.

## Raw rank table
(sorted by combined rank error; ✗✗ ≥20, ✗ ≥12)

✗✗ L28 Alnwick [F5] — N-S 33, E-W 15
✗✗ L27 The Cornish Coast — N-S 1, E-W 31
✗✗ L22 Carisbrooke [F3] — N-S 18, E-W 12
✗✗ L01 York [F1] — N-S 10, E-W 14
✗✗ L16 St Albans — N-S 5, E-W 18
✗✗ L12 The Pennines — N-S 7, E-W 13
✗  L17 The Thames Valley — 7, 8 · L20 The Weald — 9, 6 · L33 The Welsh
Marches — 7, 6 · L19 London — 4, 8 · L31 Bristol — 3, 9 · L36
Lancaster [F2] — 10, 2
(remaining 26 regions: rank error ≤ 11 combined; see tools output)

Method note: rank distance in a 38-item list inflates for the packed
middle latitudes; single-digit scores are noise. Only the curated
findings above warrant action.
