# HEGEMON Panel — UI/UX Study (m3e37)

Owner verdict, Aug 2026: "the panel needs a UI/UX study and fix." This is the
study; phase 1 shipped in m3e37. Evidence base: two instrumented sessions
(first-time tester + owner), 20 rejections and ~40 minutes of measured
hesitation between them, plus the owner's three named offenders.

## Findings (evidence-ranked)

**F1 — The law is invisible at the moment of decision.** 9 of 20 recorded
rejections were supply-limit refusals inside muster/march. A ladder HINT
already existed in muster — and both testers crashed anyway, because it
described the current position, not the consequence of the staged plan.
Diagnosis: hints describe; decisions need *projection*.
→ Phase 1: predictive `supplyProjection` mirroring the engine's checkSupply,
warning inside both forms before dispatch. SHIPPED.

**F2 — Focus is fractured across surfaces.** Map, region mentions in the
panel, and the active form each held their own idea of "here." Owner: "I
click and expect the focus to be at all three levels."
→ Phase 1: `focusRegion(rid, source)` — single focus authority. Map taps
select + spotlight + feed the form; panel taps on any `[data-rid]` name fly
the camera and flash the mentions; march origin picks fly the camera.
SHIPPED (rLink coverage: march origin/destinations, muster staged rows —
extend per F5).

**F3 — Accessibility was hover-only and punishing.** The adjacency system
existed but never fired on touch, and its dim was opacity .28 (the owner's
"everything darkens illegibly"). The march form literally said "Tap a
destination on the map…" over a map showing nothing tappable.
→ Phase 1: persistent tap `spotlight` with ground-truth accessible sets
(marchCandidates — amphibious landings included), brightness-based recession
instead of opacity crush, luminous lift on reachable regions. SHIPPED.

**F4 — The first planning screen carries the whole learning burden.** 21
minutes (tester) and 21 minutes (owner, tense midgame) on single planning
thinks. The screen offers every region + every token with no guidance
hierarchy.
→ Phase 2 (proposed): a "suggested opening" ghost overlay for first-time
players (the book's top line, dismissible); token-count progress ("2 of 3
orders placed"); per-region token affordance when a region is focused.

**F5 — Region mentions are inert text in most of the panel.** Phase 1 made
march/muster mentions live; the chronicle, battle cards, seat inspector, and
event text still name places without focusing them.
→ Phase 2: rLink everywhere a region is named. The delegation listener
already handles any `[data-rid]` — remaining work is markup only.

**F6 — Hierarchy: the active decision competes with everything else.** Query
tabs now stick to the panel top (phase 1, small). The stage/panel split is
sound; the panel below the stage still interleaves hints, decree chips, and
forms at one visual weight.
→ Phase 2: three weights only — DECIDE (form), KNOW (state that constrains
the form: ladder, decree, bans), NOTICE (everything else, collapsed by
default on mobile).

## Principles going forward
1. **Project, don't describe** — any rule that can refuse an action gets a
   live projection inside the form that risks it.
2. **One focus, all surfaces** — nothing may hold a private selection.
3. **Ground truth on the map** — highlights derive from the same functions
   the engine/menus use, never re-derived approximations.
4. **Three visual weights, no more** (F6).
5. **Every place-name is a control** (F5).

## Phase ledger
- Phase 1 (m3e37, shipped): F1 F2 F3 + sticky tabs. Goldens: spotlight
  honesty, tap-focus, projection-mirrors-engine.
- Phase 2 (next UI session): F4 F5 F6 — needs owner eyes on-device for the
  visual weight pass; the 2× icon request rides along there.
