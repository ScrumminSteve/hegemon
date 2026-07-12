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

- **M2.a** complete (see above).
