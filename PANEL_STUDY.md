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

---

## SESSION 3 — ARMAN, FIRST-TIME PLAYER (m3e46 era, Aug 23 2026)
*Episode: corpus/inbox/episode-arman-1-percy-l-r10.json — Percy, 10 rounds,
lost a 4-seat/4-supply standings TIE to a bot (F2 Stafford, authority 6 v 0).
111 decisions, median think 22s, ~90 min of thought. 1 undo, 10 rejections.*

### F7 · SEV-1 · THE IMPOSSIBLE-TARGET LOOP
Action 578: six consecutive attempts at the SAME illegal march (L25 → L32,
"neither adjacent nor reachable by ship transport"), think time climbing
44s → 52 → 64 → 83 → 114 → 131s — **eight minutes stuck on one move** —
then a seventh attempt died on the supply cap instead. The map spotlight
(m3e37) shows legal candidates, but nothing TEACHES why the desired target
is out: the rejection line states the rule, not the remedy. Candidates:
(a) rejection toast names the nearest legal stepping-stone or missing
transport link; (b) the destination PICKER excludes unreachable regions
outright instead of letting the map alone carry the knowledge; (c) after
2 identical rejections, escalate: draw the reachable frontier.

### F8 · Battle screen: unit icons in/on the score box (tester ask, verbatim).
The tally should show WHAT is fighting, not just totals.

### F9 · Icon legibility: bombard and unoccupied castle/stronghold read
poorly at table distance. Overlaps phase-2 "2× icons" item — Arman
independently confirms the m3e45 map-audit deferral is costing testers.

### F10 · Active-decision emphasis: the current action window (march,
orders, raid, muster…) should be highlighted and re-centered.
scrollToDecision (m3e39) brings it into view ONCE; a novice loses it again.
Candidate: persistent glow/border on the live decision card + auto-recenter
on each new query, owner-toggleable ("quiet" mode exempts).

### F11 · Onboarding is invisible to the corpus: the training/introduction
was not recorded. Ruling requested: record the trainer segment for every
new tester (feeds the trainer/tutorial workstream with real material).

### UNDO TELEMETRY — ALREADY LIVE, RULING AVAILABLE
The episode format has recorded undos with the undone action since the
telemetry patch: Arman's single undo = chooseLeaderCard @ action 283.
The "limit the button" lever needs no new plumbing when the owner rules —
the data to justify any cap is already accumulating per episode.

### NOTE FOR THE RECORD
First HUMAN LOSS in the corpus. A novice loss, not the owner's — but a
bot won a standings tie against a human at a live table, and mine.mjs
correctly refused to book it (books learn only from human wins).

---

## SESSION 4 — OWNER, NEVILLE RAID GAME (m3e50 era, Aug 24 2026)
*Episode: corpus/inbox/episode-neville-raid-r7.json — F6 Neville human WIN
r7, ⭐⭐⭐, 23 raid events — the corpus's first sea-and-raids campaign.*

### E1 · ENGINE · PORT SHIPS SURVIVE CONQUEST (owner screenshot, Alnwick)
Traced in-episode: r5 action #292, F5 (Percy) took L28 Alnwick from F3
(Tudor) by battle — F3's warship in P06 remained, leaving an enemy ship
in Percy's port (the owner's screenshot). The vacate-path purge exists
(actionPhase.js ~324, FAQ v2.0) but NO purge runs on ownership change by
CONQUEST / retreat-loss / reversion; trace also shows a vacate at #285
that failed to purge — the guard needs to move from "the marcher's origin
housekeeping" to "any L28-owner change." RULING NEEDED before fix:
rev bump 11→12; episodes whose replays gain portShipsLost events go
stale — including this raid game itself.

### F12 · King's tiebreaker view: house strength inline (seats; possibly
supply + coin) next to each name — judge relative strength at a glance
when breaking ties.
### F13 · Status icons prefixed everywhere names are listed (crown/king,
sword/marshal, small-council top) — not just the tiebreaker view.
### F14 · Nanne Beauchamp at house level should surface the battle
scoreboard.
### F15 · Supply-shortfall destruction railroads by name order — let the
player pick WHICH territory loses the unit. (Same railroad family as F7.)
### F16 · Reaver card: keep the flipped card visible while assigning
loser penalty / winner benefit.
### F17 · Raid order options: never list invalid choices (no march order
when march unavailable; no defend without a raid star). (F7 family:
the menu should know the law.)
