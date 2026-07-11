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
  index.html            Map viewer (M0 deliverable) — GitHub Pages entry point
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
M1.a state model/setup/views ✅)** →
M2 full base game hot-seat → M3 AI factions → M4 expansion systems (8th faction,
extended map, vassals, loans, behemoths) → M5 mobile port.
