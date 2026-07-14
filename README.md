# HEGEMON

A data-driven digital adaptation of a classic area-control / hidden-orders war game.
PC (browser) first, mobile later. All intellectual property lives in **theme packs** —
the engine, the data model, and every identifier in code use generic warfare terminology.

> Codename "HEGEMON" is a working title. Rename freely; nothing in code depends on it.

---

## Architecture (three layers)

1. **Engine** (`src/engine/`) — headless, deterministic rules engine. No DOM, no rendering.
   `applyAction(state, action) -> { state, legalActions }`. Fully serializable state
   (save/load, replay, async play come free).
2. **Data** (`src/data/`, validated by `schemas/`) — the map graph, faction definitions,
   card definitions. Pure structure. **No display names here** — only stable IDs.
3. **Presentation** (`index.html`, `src/app.js`, `src/map-view.js`) — SVG map renderer
   and UI. Reads display strings exclusively through the active theme pack.

Theme packs (`src/themes/`) map stable IDs → display names, flavor terms, and palette.
Shipping themes: `core` (original generic IP) and `asoiaf` (fan theme). Swapping the
theme re-skins the entire product.

## Terminology glossary (binding for all code)

| Generic (used in code)        | ASOIAF equivalent (theme-only)     |
|-------------------------------|------------------------------------|
| Faction                       | House                              |
| Leader card                   | House card                         |
| Event Phase / Event Decks I–III | Westeros Phase / Westeros decks  |
| Invaders / Threat Track / Incursion | Wildlings / Wildling track / Wildling attack |
| Initiative Track              | Iron Throne track                  |
| Prowess Track                 | Fiefdoms track                     |
| Command Track (star orders)   | King's Court track                 |
| Sovereign Token               | Iron Throne token                  |
| Blade Token                   | Valyrian Steel Blade               |
| Courier Token                 | Messenger Raven                    |
| Authority tokens              | Power tokens                       |
| Orders: March / Defend / Support / Raid / Rally | ... / Consolidate Power |
| Units: Infantry / Cavalry / Warship / Siege Engine / Behemoth | Footman / Knight / Ship / Siege Engine / Dragon |
| Fort (muster 1) / Citadel (muster 2) | Castle / Stronghold          |
| Supply icons / Coin icons     | Supply barrels / Crowns            |
| Vassal faction                | Vassal house (MoD)                 |
| The Lender (loans)            | Iron Bank (MoD)                    |

Rule: if a name would tell you which IP you're looking at, it belongs in a theme pack,
not in code or data.

## Repo layout

```
hegemon/
  index.html            Map atlas / setup reference — GitHub Pages entry point
  game.html             TABLE MODE — the playable game (one operator, all factions)
  styles.css
  src/
    app.js               UI bootstrap, theme switching, info panel
    map-view.js          SVG renderer (regions, edges, ports, markers)
    data/
      map.js             Region graph: ids, kind, muster/supply/coin, adjacency, layout
      factions.js        Faction ids, home regions, palette
    themes/
      core.js            Generic IP theme (default)
      asoiaf.js          ASOIAF fan theme
    engine/
      types.js           JSDoc typedefs + enums — the engine vocabulary (M1 seed)
  schemas/               JSON Schema documents for map / factions / themes
```

No build step. Plain ES modules — works on GitHub Pages as-is. `preview.html`
(generated) is a single-file bundle of the same app for quick sharing/inspection.

## M0 status & exit criteria

- [x] Repo structure + naming conventions established
- [x] Schemas for map, factions, themes
- [x] Full base map encoded as data (37 land, 12 maritime, 8 ports)
- [x] SVG map renders from data; theme swap re-skins everything live
- [x] Region inspector (click) + adjacency highlighter (hover) for visual QA
- [ ] **Adjacency validation pass** — the adjacency list is a best-effort DRAFT.
      Verify every edge against the physical board / reference app using the hover
      highlighter, and correct `EDGES` in `src/data/map.js`.
- [ ] **Icon audit** — muster/supply/coin values per region are DRAFT. Verify against
      the board and correct in `src/data/map.js`.

## Workflow notes

Designed for editing via GitHub web UI (mobile-friendly): small files, one concern per
file, data changes never require touching renderer code. Enable GitHub Pages on `main`
and the viewer is live at the repo's Pages URL.

## Testing

`npm test` (no dependencies) runs the golden suite in `tests/`. Every rule the
engine implements gets a test whose name cites the reference rulebook page or
the owner-verified source. The suite must pass before any zip ships.

## Milestones

M0 map & theming foundation ✅ (owner-audited) → **M1 engine core (in progress:
M1.a state/setup/views ✅ · M1.b planning ✅ · M1.c action phase ✅ · M1.d combat ✅ · M1.e table-mode UI ✅)** →
M2 full base game hot-seat → M3 AI factions → M4 expansion systems (8th faction,
extended map, vassals, loans, behemoths) → M5 mobile port.


## M1.5a — Leader cards (core)
See CHANGE NOTES above; icon counts pending owner audit (F5-3, F3-2a).

(See FAQ compliance notes in the changelog.)


## Expansion readiness (audited Jul 2026 vs. AFFC / ADWD / MoD)

**Holds as designed (M0 decisions paying rent):** IP-neutral data + theme packs; faction
roster as data with `seatCount` (Arryn F7 / Targaryen F8 are new entries); `unitStrength`
as a function of context (dragon strength = round-schedule counter); `BEHEMOTH` unit type
reserved since M0; the query/decision stack (a vassal's commander and an AI answer queries
identically); `viewFor` redaction (secret objectives, hidden bids); hook-descriptor cards
(ADWD's 42 alternates are a data file); seeded RNG (vassal 3-card draws, loan deck,
Deck IV); per-faction order-token inventories as data (sea orders are more tokens).

**Seams cut now, before M2 consumed them:**
1. `regionProps(state, id)` — effective muster/supply/coin merging `state.areaMods`
   (MoD improvement/degradation). All rules code reads through it; M2's mustering,
   supply update, and coin collection MUST build on this accessor.
2. `state.scenario` — composition root ({cardSet, eventDecks: [...], victory, maxRounds})
   resolved via `src/data/registry.js`. The M2 event engine iterates
   `scenario.eventDecks` (MoD adds 'IV'; AFFC swaps Deck I), and victory checks
   dispatch on `scenario.victory`.
3. `orderClasses(order)` — ban-class event cards test order classes, never raw types
   (MoD dual-mode vassal tokens are two classes at once; FAQ: Iron Bank order is not
   rally-class, vassal Defense/Muster is defend-class).

**Known M4 seams (documented, deliberately deferred):**
- Map composition: base + overlay patches (Essos board, Eyrie/Bite overlays) — assemble
  regions/edges per scenario; engine already reaches the map through `region()`/`adjacency()`.
- Victory as per-faction strategy: mixed win conditions in one game (Targaryen loyalty
  track vs. seat count; AFFC victory points). Design: `victoryScore(state, fid)` +
  instant-win dispatch.
- Vassals: commander mapping (`state.commanders`), 4-token order sets with per-vassal
  2-token cap, shared 7-card temporary-hand combat deck (generalize `leaderHands` access
  behind `handOf(state, fid)`), commander +1 authority on vassal win, dominance skip-over,
  invader-bid exemption.
- Per-faction unit pools (Targaryen: no siege engines, 3 dragons) — reshape
  `SETUP.unitPool` to per-faction with default when M2.b mustering lands.
- Dragon flight (march to any land; no flight on retreat) — branch in
  `validateDestination` keyed on unit capability.
- The Lender (loans): loan track shift/recycle, interest at event-phase start, Blade-holder
  unit destruction on default, Braavos cost token; sea-order domain validation
  (sea/port only, swept from land after the Courier step).
- Track extension: 8th position locked to one faction; star allowance tables per roster.

- **M2.a** complete · **M2.b** complete · **M2.c** complete · **M2.d** complete (this drop).


## M2.d — Invaders & incursions (this drop)

The two `incursionPending` stubs are now the real thing (Rules pp.22–23; FAQ):
`src/engine/invaders.js` runs both triggers — threat-max (immediate, resolved
BEFORE any revealed card's effect) and the Deck III incursion card (at current
threat strength) — through one flow: sealed simultaneous bids from every
participating faction (masked by `viewFor` exactly like Clash bids, recorded in
`privateKnowledge.lastBid`), reveal, total-vs-strength outcome, sovereign-holder
tie-break (naming ONE faction), and only THEN the invader-card draw — the
ordering that makes the Courier's peek worth authority. All nine owner-
transcribed cards implemented, win and loss sides, with queries where the rules
grant choices (unit picks incl. the single-fortified-area constraint, track
choices, hand/discard picks, the Preemptive poison-pick, victory mustering via
the existing muster machinery with `source: 'incursion'`). Defender win resets
threat to 0; invader win sets it back 2 (min 0); used card is buried at the
bottom; every draw voids all `privateKnowledge.threatDeck` peeks (the banked
M3 contract). The Preemptive re-attack chains a second incursion at strength 6
with the prior highest bidder excluded. Strength-0 attacks are still bid and
cannot be lost (FAQ). New suite: `tests/invaders.test.js` (27 goldens incl.
masking-as-anti-cheat, penalty ordering, serialization mid-effect, and a
transcript-replay determinism check on an unrigged seed). Suite total: 186.

**Owner-audit items from this drop (verify against your cards/rulebook):**
- Dominance tokens follow position 1 whenever an invader card reorders a track
  (kingBeyond drops/rises, preemptive track-shift). Implemented uniformly;
  confirm the FAQ agrees for the *drop* cases, not just the explicit
  take-the-token victory text.
- Massing (loss): if the forced discard empties the hand, the discard returns
  to hand, mirroring the last-card recycle. Confirm FAQ wording.
- Horde (loss) reading: both destroyed units must come from ONE of the lowest
  bidder's fortified areas (not split across two). Confirm card text.
- Threat-track granularity: the engine steps +1 per icon to a max of 12
  (golden-tested since M2.a). If your physical track moves in steps of 2
  (positions 0/2/4…12), icons-to-attack and the −2 setback are half the
  board's pace. Self-consistent as built — flag only if you want board parity.

## M3 information-access contract (banked Jul 2026)

An AI seat's entire world is `viewFor(state, fid)` + `legalActions(state, fid)` —
never raw state. Parity with a remote human player is the invariant:

1. **No omniscience.** Deck order, unrevealed orders, others' pre-reveal picks and
   bids are masked by the same code path that protects human hidden info; every
   masking test doubles as an anti-cheat test.
2. **No amnesia.** Earned secrets persist in `state.privateKnowledge[fid]`, merged
   into that faction's view only (first client: the Courier's deck peek). Anything
   a human would remember, the view must carry. M2.c bids and any future
   spy/peek effects write here. M2.d invalidates `threatDeck` entries on every
   invader-deck draw (implemented; golden-tested).
3. **One lens.** UI panels and AI reasoning read the same derived helpers
   (`seatsControlled`, `starLimit`, `regionProps`, track arrays) so what the
   player sees and what the robot knows can never drift apart.
4. **Table mode is the exception, not the API.** The single-operator UI renders
   full state by design; AI seats in mixed games are constructed on views.


## Telemetry doctrine (monitor positioning, banked Jul 2026)

The engine is deterministic, so the recording question is always: *what is lost
forever if not captured at the source?* Three tiers, three homes:

1. **Engine state — replayable facts only.** `config` + `actionLog`. Anything
   derivable by replay (legal alternatives, views, board situations, deck states)
   is deliberately NOT logged: replay reconstructs it losslessly, and keeping
   wall-clock or device data out of engine state protects the determinism hash.
2. **UI sidecar — non-reconstructable observations.** Decision latency per action
   (`timings`, aligned to transcript indices, popped on Undo to stay aligned),
   undo retractions, and rejected actions with their errors. Lives outside engine
   state; exported as `episode.telemetry`; optional (self-play episodes won't have it).
3. **Episode provenance.** Engine version + integrity hash + `meta.seatControllers`
   (every seat self-declares human or policy id — today's corpus is explicitly
   all-human, so it can never be confused with robot play later).

## M3.L — Learning module (design banked; substrate live as of M2.a)

**Episode schema (`hegemon-episode/1`):** `{schema, engine, meta{title,notes,tags},
hash, config{seatCount,seed,ruleset,scenario}, actions[+_round/_phase stamps], outcome}`.
Recording workflow for opener scripts: play the scripted moves in `game.html` (Undo
erases missteps from the transcript too — recorded transcripts stay clean), then
**Episode** exports a labeled JSON. Validate and slice with
`node tools/check-episode.mjs episode.json --rounds 3` — replays against the current
engine, verifies the integrity hash (mismatch ⇒ engine behavior changed since recording
⇒ episode is stale for training and must be quarantined), and prints the per-faction
opener digest. Raw Save files also work as unsealed episodes.

**Substrate (implemented now):** the engine is deterministic under a seeded RNG, so a
complete game is `(state.config, state.actionLog)` — a few KB that replays byte-identically
via `replayGame(config, actions)` (golden-tested). `episodeRecord(state)` flattens a game
into `{config, actions, outcome}` with per-faction terminal metrics. Transcripts contain
sealed information (orders, future bids) and are engine-private: stripped from `viewFor`
alongside the seed.

**Learning design (M3.L, after the M3 baseline policies exist):**
1. **Policy interface** — `decide(view, legalActions) → action`. Every seat, human or
   robot, is a policy; the parity contract above is the AI's entire sensory world.
   Policy-0 is uniform-random-legal: the "infancy" player.
2. **Self-play harness** — a Node script pits policy mixes across seeded seats
   (`tools/selfplay.js`), emitting JSONL episode files. Deterministic seeds make every
   training game reproducible and every regression bisectable; CI can farm games.
3. **Learning loop, staged by ambition:**
   a. *Tunable heuristics* — an evaluation function over view-derived features (seats,
      supply headroom, track positions, threat exposure, army dispersion) with weights
      optimized by self-play tournaments (hill-climbing/SPSA). Cheap, legible, strong.
   b. *Statistics tables* — opening order-placement frequencies and bid distributions
      conditioned on seat/position, mined from winning episodes.
   c. *Policy models* — optional later: small nets (tf.js) trained on
      (view-features, action, credit) tuples from the same episode corpus.
4. **Credit assignment** — terminal outcome (win/rank) plus shaped intermediate signals
   already captured per round in the log (seat count deltas, supply, authority).
5. **Hygiene** — training data is views-plus-transcripts only; a learned policy can never
   memorize information a player couldn't see. Episode `config.seed` keeps train/eval
   splits honest (no seed leakage between them).


## P1 queue (stored, fix next engine session)
*(empty)*

- ~~Muster upgrade offers only one path~~ **SHIPPED (m2.c):** engine accepts
  `{ type: 'upgrade', to: 'cavalry' | 'siege_engine' }` (default 'cavalry' for
  episode compatibility), pool-checked per target; UI shows both buttons;
  goldens cover the siege path and pool exhaustion. Original note: The upgrade build converts a footman
  to a knight only; the owner expects BOTH upgrade options — footman → knight The upgrade build converts a footman
  to a knight only; the owner expects BOTH upgrade options — footman → knight
  and footman → siege engine, each for 1 point (verify exact Rules p.9 wording
  at fix time; owner's physical-board expectation is both). Engine change:
  upgrade entries become `{ type: 'upgrade', to: 'cavalry' | 'siege_engine' }`
  (cost 1 either way, pool-checked per target, default 'cavalry' for
  compatibility with recorded episodes); UI shows two upgrade buttons. Extend
  the upgrade golden test to cover the siege path. Note: currently masked by
  the "undefined" term-key P1 — same form, fix together.
- ~~Muster form renders "undefined" everywhere~~ **SHIPPED (m2.c):** all three
  call sites now go through `unitName(type)`. Original note: the
  muster form (plus `reconcileForm` and the `destroyedForSupply` Chronicle line)
  read `theme.terms.infantry` / `.cavalry` / `.warship` / `.siege_engine`, but
  theme term keys are `unitInfantry` / `unitCavalry` / `unitWarship` /
  `unitSiege`. The existing `unitName(type)` helper (app.js:41) does the mapping
  — swap all three call sites to it. Trivial; bundle with the next drop.
- ~~Split march: reinforced support prong~~ **VERIFIED CORRECT (M2.c session):**
  golden test from the owner's repro passes — non-combat prongs land first and
  the reinforced support counts (attacker 6). The observed miss was the battle
  score line rendering before support declaration; it now says "support not
  yet declared". Original report: Marching two prongs —
  one into battle, one into an adjacent friendly territory bearing your support
  order for that same battle — should raise the support contribution by the
  arriving units' strength. FAQ timing: non-combat portions of a march complete
  FIRST, then the combat resolves, so the arrivals are legally present when
  support strength is tallied. Investigation notes: `resolveMarch` is believed
  to apply non-combat moves before `initiateCombat`, and `combatStrengths`
  reads supporting units live from `unitsByRegion` — so the observed miss
  likely hides in (a) combat initiating before all non-combat prongs land,
  (b) the support-declaration query snapshotting strength, or (c) the arriving
  units being flagged in a way the support tally filters (routed? move-marker?).
  Write the golden test from the owner's repro first: same-march reinforce,
  assert the battle total includes the arrivals.

<!-- FIXED (M2.b-final): Support vs neutral forces: support orders contribute nothing to a march
  against a neutral force token — a London→Brussels march at strength 3 with an
  adjacent Normandy S+1 (infantry + order = 2 more) is rejected against the 5
  instead of tying it. Neutral resolution in `resolveMarch` counts only the
  marching units + march modifier. Implementation notes: (a) confirm exact
  wording on Rules p.28 — own adjacent support orders certainly count; whether
  OTHER players' support may be lent to a neutral assault ties into the
  support accept/decline protocol gap; (b) neutral conquest succeeds on
  equal-or-exceed; (c) no leader cards vs neutrals — strength only. -->

## UX backlog (accepted, not yet scheduled)
*(empty — status-strip standings order, march auto-destination, all-units
destination default, and file-picker Load all shipped in M2.b-final)*

<!-- FIXED (M2.d session): Port diamonds rendered at the raw land↔sea midpoint,
which drifted far offshore when the sea center was distant — P01 landed nearer
L03, P02 nearer L11. New shared `portAnchor(land, sea)` in map-view.js pins
each port to its land hex's seaward edge (46px hex radius + 16px clearance);
app.js posOf uses the same helper, so diamonds, units-in-harbor glyphs, and
tap targets stay aligned. Verified: every port anchor is now nearest its own
land region; no two anchors within 30px. -->
