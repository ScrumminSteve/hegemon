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

---

## SESSION 4 — THE OWNER'S ANNOTATED PASS (m3e54 era, Aug 25 2026)
*Source: annotated Percy playthrough, rounds 0-4 (pre-pivot block). The
first Playob-2 delivery: reasoning per round, UI findings inline.*

### F12 · Influence-track ownership legibility
Marshal track scoreboard doesn't show which house's shield corresponds to
unit contribution/supply status. Wants own house's +1 reflected on the
track, possibly color-coded for supply/no-supply.

### F13 · Round-overview card language
Remove "deck one/two/three" in favor of numbered card slots. Each card
leads with its TITLE ("The Harvest") then a tight description in the
King's Piece style — current text repetitive. Echo the border-threat
growth graphic on the overview, color-coded before/after (e.g. 2-of-12
growing to 6).

### F14 · Seat Inspector: threats need composition
Card details/special abilities visible from the Seat Inspector; attacker
UNIT COMPOSITION (not just count) when inspecting a threat.

### F15 · Seat Inspector: card-line ambiguity
When multiple cards share a line, hard to tell which order/shield belongs
to which card. Want CLICKABLE leader cards with artwork + full ability
text (leader cards priority; round/opening cards lower).

### F16 · Territory highlight should brighten its units
Highlighting a territory should also brighten the unit icons WITHIN it —
currently hard to distinguish units near harbors.

### F17 · Planning-round opener info inconsistent
"Harvest Contested" showed open bids but not other expected info.
Better than before, not yet consistent — another revisit pass.

### F18 · Restricted-order indicator per round
No visual sign that March +1 was disabled this round. Want a clear icon
on the round board showing which order types are restricted.

### DESIGN NOTES (owner, banked)
- Objectives currently push a single path per pull; wants multiple
  objective paths — feeds the diplomacy/story-mode upgrade.
- Home-base-defense objectives rejected on principle: holding your home
  is table stakes for every house, never a scored mark.
- Mid-game the owner DEPRIORITIZED objectives entirely ("just play to
  win") — marks are garnish even for their author.

### STRATEGY GOLD (STRATEGY.md addenda)
- Minimum-card discipline, on film: won battles with a "1" and a "3"
  while holding better — spend the least card that wins the COUNTED
  fight ("confirmed Tudor's max was 3"; "Tudor's only remaining card was
  a 0, won with Lord Poynings").
- The double decapitation: spotted TWO undefended home bases, struck both
  in the same round, eliminated Tudor outright at r4.
- "Banked castle": an unclaimed castle nobody can reach quickly is
  already yours — no urgency to physically take it.

### OWNER RULING — THE TUDOR OPENER (banked, implementation pending)
"Tudor, round one, ninety percent of the time, should TAKE LONDON. It
gives the stronger starting position — more than any other house, it's
the go-to opener." Direct medicine for F3, the lineage's worst seat
(5-7/100 across every pool block). Implementation candidates: a Tudor
book line (book machinery exists, ships inert) or a perFaction opening
bias; either way it gates like everything else.

---

## SESSION 4b — THE STAFFORD PIVOT ANNOTATIONS (rounds 5-10, Aug 25 2026)
*Source: hegemon_stafford_pivot_rounds_5-10.txt — the first owner loss,
fully annotated. Companion to Session 4 (rounds 0-4).*

### BUGS (investigate before fixing — next build turn opens here)
- **B12 · Retreat prompt for a destroyed unit** (r6 Bristol, re-confirmed
  r7): bombard fully destroyed in battle, game still issued a retreat
  order for the nonexistent unit. Owner logged intent to check battle
  logs; engine-side investigation required.
- **B13 · Card-cancel notification arrives late** — appears behind/after
  the NEXT card-selection prompt; owner confused about what happened.
  Part of a broader battle-screen revision pass (tracked).
- **B14 · Battle-log illegibility**: a retreat resolved alongside a
  sword-type card without the expected kill — may be rules-correct but
  unreadable; log review owed.
- **Q3 · Supply swing question**: Percy and York jumped 0→6 supply in one
  event window (Parliament/Reaver resolution?); owner wants the supply
  history explained. Verify mechanics + surface the cause in the log.

### UI (F19-F22)
- **F19** · Proper post-battle results view: tiebreaker shown but no
  retreat/aftermath summary.
- **F20** · Floating status windows flash distractingly while bots decide
  during round planning.
- **F21** · Reaver/bid-type cards resolve SILENTLY — want an explicit
  reveal/result screen with click-through, same treatment as battles.
- **F22** · House-icon hover tooltip works but appears with noticeable
  delay — latency polish.
- **F18 re-confirmed** (March+1 forbidden again, still invisible) —
  priority raised.

### DESIGN RULINGS (banked)
- **Configurable game length** (15/20 rounds): set at game creation only,
  never mid-game; non-default-length episodes EXCLUDED from trainer and
  corpus data.
- **The closing-weakness thesis, now thrice-documented in one game**:
  bot-Percy had a clinchable win open for 3+ rounds (Exeter + Salisbury
  open, one coin away) and never closed; York/Percy stretched an
  elimination they could finish; and the fatal own-goal — Percy VACATED
  Caersws chasing a 5th seat with no token left behind, home-reversion
  flipped it (Tudor "resurrected"), 5→4, game lost. mAbandonSeat and
  mLeaveControl exist and were tuned; they are insufficient. CLOSING is
  a planning skill, not a weight.
- **Card-waste feedback**: bot-Percy burned a high card in an unwinnable
  capital exchange — card-counting absence, again.

### STRATEGY ADDENDA (owner, from the loss)
- Token preservation: held the last token past two marginal bids to keep
  it for a territory play (lost it later without the benefit — logged
  honestly).
- Deliberate card-baiting: checked the capital FIRST to force Percy to
  burn a "2" in an unwinnable exchange; left a defender at Midlands to
  force York to pay in cards rather than take it free.
- The spoiler doctrine: "Stafford is Vengeance" — once out of contention,
  play to deny the feud enemy and shape which rival wins.
- Personal misplay, self-logged: holding the double-sword for the Duke of
  Exeter would have killed two units instead of one.

---

## SESSION 5 — FIRST CONTACT WITH THE SHADOW CROWN (m3e55b, Aug 25 2026)
*Witness: the owner, Lancaster, r6 instant win (episode-shadow-lancaster-r6).*

### Concealment verdict: TOTAL — possibly too total
Owner noticed NEITHER omen and could not infer the host from behavior.
The 4.2s flash is easily missed during bot churn. Design note for the
detection layer: omens should be discoverable AFTER the fact — a
persistent UI-side chronicle line (never in the hashed engine log), so an
observant player can review "when did the wind turn" between rounds.
Detection-by-behavior currently impossible; that is acceptable for v1
(the crown brain isn't yet distinctive) and will matter more once the
closer brain makes the possessed house play differently.

### F23 · Pending-control limbo reads as LOSS (the 25-undo mystery)
Marching out of a captured home territory (Thornbury → Bristol): the
retain-control token does not appear until march/battle resolution, and
in the interim controllerOf falls through to HOME REVERSION — the map
truthfully showed the territory back in Stafford's colors. Owner read it
as a bug/loss and burned ~25 undos probing it. It resolved correctly
after the battle, but "correct later" is not "legible now."
Fix candidates: (a) optimistic interim marker ("⏳ your banner, pending")
on the vacated region until the leaveControl decision resolves; (b) a
distinct "contested/pending" tint instead of the full enemy reversion;
(c) surface the leaveControl offer at march declaration, not resolution.
Family: the m3e43 Middleham phantom leave-control fix.
