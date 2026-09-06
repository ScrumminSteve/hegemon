# STRATEGY.md — The Owner's Doctrine
*Ten-question interview, banked Sat Aug 22, 2026. Source for the human-method opponent pool and the blunder bank's mirror (virtues). Owner's stated limit: this captures what he can articulate; table-reading and mid-game adaptation remain uncaptured.*

---

## 1. The opening (rounds 1–2)
- Build the army: muster toward mass before contact.
- Take one **strategic anchor** — a sea or castle chosen for later strategy, not printed value.
- Spend on nothing else.

## 2. Choosing the anchor
- Value = **connectivity**: access to other territories multiplied, or opponent access denied (chokepoint logic).
- **Muster-2 strongholds compound** — an engine, not a seat.
- Bots value icons; the owner values edges.

## 3. Battle selection — the counted fight
- Full pre-battle arithmetic: opponent's **remaining leader cards**, total strength, sword (+1 attack), likely support, defense icons, march ±1.
- Thresholds:
  - **Auto-no** if any card 2+ beats him.
  - **Dice-roll territory** only if solely their best card beats him.
  - **Tie ≠ tie**: Marshal tiebreaker checked *before* committing — a held tiebreaker converts ties to wins in the math.
- On defense: forced to fight, but card choice still made against their known remaining hand.
- *Bot gap: bots do not track spent cards at all. The counted tie is the owner's standing exploit.*

## 4. Conversion trigger (build → take)
- Readiness gates: armies staged in multiple places; track strength (Marshal/sea) confirmed; opponent hands depleted.
- **Default temperament is rush-and-kill.** Patience (the crescendo) is a deliberate *costume*, worn against strong opposition or when objectives demand it.
- The owner is a **style switcher**: blitz, denial, crescendo are personas, each packageable as a distinct opponent profile.

## 5. Elastic control (the "holding failure" reframed)
Releasing a taken seat is deliberate, three tools:
1. **Elastic control** — release what is retakable at will; skip the garrison cost.
2. **Bait** — surrender a lesser position to pull an enemy off a greater one.
3. **Threat management** — shed the leader's silhouette so the table doesn't unite on him.
- *Honest note: hold-marks (neverFell, winner-holding) are priced against exactly this habit. Mark on the line → the costume must be "garrison miser."*

## 6. The auction
- **Bots' bid function is reverse-engineered**: sweet spot ~2 coins, reluctance to spend below reserve → bids predictable to the coin. The 8/6/4 exact-top wardenships were arithmetic, not luck.
- **Tracks priced by current phase, not printed value**: mustering round → Livery; attack round → Marshal top; one seat from seven → King. Overbid as needed.

## 7. Closing the kill
- **Round clock is a position check, not a risk dial**: by rounds 8–9 he must already be at or near the top.
- **Multi-seat closes are opportunistic, never engineered** — but never declined when open.

## 8. The six houses (opponent-pool skeleton)
| House | Method |
|---|---|
| **York** | Muster the isolated pair of seats; spend the full-deck retrieve as a tempo weapon. |
| **Neville** | Most dangerous round one: 2–3 seats + Marshal, blitz the soft table. Score-cancel card is the crown jewel. |
| **Lancaster** | One eye fixed on Neville; cancel-order as the scalpel. |
| **Stafford** | Round-one stronghold grab + Percy-border foothold; double attack saved to break a spine; cancel-order also strong. |
| **Percy** | The flexible house — patience or blitz; defense via muster + carracks in the Lyme and eastern sea; track-demotion as sabotage. |
| **Tudor** | London early; card-kill aimed at an opponent's best leader. |

**Global doctrine:** almost never vacate a sea unless zero threat of capture within 1–2 rounds. *(Independently confirms blunder fix #10, mSeaTenure.)*

## 9. What beats him
- **The recorded loss**: a fast rider too far away to stop — distance discounted the threat until distance was gone. (The human twin of the bots' former transported-reach blindness, F3/F6.)
- **The predator-among-prey theorem**: one strong opponent + four weak is *harder* than five strong — the strong one farms the weak and compounds faster than any symmetric table. Harder still when strength distribution is hidden.
  - *Methodology consequence: all eval gates to date measure uniform tables. Mixed-strength hidden-composition tables are a different, harder test — the strongest argument for the opponent pool.*

## 10. The evaluator gap
- Asked how he sizes up the table mid-game: **"I don't."** No opponent has ever been threatening enough to require it.
- **ADDENDUM (Aug 24, the Neville raid game):** the first documented exception. Owner: "This may [be] one of the only times I actually glanced and saw Lancaster at 5 and diverted to attack him." Verified in-episode: r5, action #313, Lancaster reaches 5 seats; owner diverts, Lancaster finishes with 2; Neville wins r7. The glance fired for the first time in project history — the bots' improvement finally forced the skill into existence, and the owner's response was **the leader punch, performed by hand** (see-leader → divert → strike). The bot term awaiting its gate is a copy of a move its author had never needed until this week.
- Consequences:
  1. The sharpest indictment of current bot strength on record.
  2. Package C cannot be seeded from articulated human judgment — the judgment doesn't exist. It must come from data: honest losses, per-round credit mining, self-play.
  3. Explains the corpus's zero honest losses: no pressure, no losses.

---

## Derived candidate scorer terms (blunder bank's mirror)
1. **Connectivity value** — score regions by edges (access granted / denied), not icons alone.
2. **Card counting** — track opponents' spent leader cards; battle odds vs actual remaining hands; tiebreaker-aware tie valuation.
3. **Phase-aware bidding** — bid weight conditioned on this round's plan (mustering / attacking / one-from-seven), plus bid *variance* to kill predictability.
4. **Elastic control / bait** — value retakability; discount garrison duty on seats adjacent to own mass (tension with hold-marks noted — bots don't chase marks).
5. **Threat-silhouette management** — awareness of appearing strongest; the table's counter-uniting instinct (requires opponent modeling).
6. **Leader-punch gating** — attack the strongest *only when not winning* (partially exists as seat hunger; the "unless I'm winning" gate does not).

## Opponent-pool implications
- Package personas, not one style: **blitz / denial / crescendo** as separate profiles.
- Six per-house profiles per §8.
- Build **mixed-strength, hidden-composition tables** for tuning and gates — the predator-among-prey environment is the hardest test the owner knows.

---

## ADDENDUM — THE EXPANSIONIST DOCTRINE (owner, Aug 25 2026, post-Win-Scan)

1. **Multi-grabs are not just for mates**: more territories = higher P(win);
   general aggressive expansion beats conservatism. Split-marches belong in
   ORDINARY menus (scored options), not only the forced win line.
2. **Fortune favors the bold**: battle selection should be probability math
   — P(my card beats theirs) over remaining hands and tendencies — and take
   calculated risks, not only counted-certain fights.
3. **Observed bot sins (blunder-bank candidates #12-15)**:
   - #12 livery/consolidate orders placed ON SEAS (no income there);
   - #13 defend orders on territories with zero threat vectors;
   - #14 questionable march-mod selection (+1/-1 chosen poorly);
   - #15 bid timidity — bots should ZERO OUT bids on low-value contests
     and bank the coin.
4. **Category risk dials**: separate risk-tolerance knobs for battling,
   bidding, expansion, etc. — persona-ready, tuner-ready, and the Shadow
   Crown's difficulty dial.
5. **THE ANCHOR MAP — house-specific strategic captures** (destination
   doctrine, generalized): London→Tudor (shipped as the Gambit);
   Ludlow/"Mercy"→Neville/Lancaster; Exeter→Stafford/Percy;
   Bristol→Stafford; East Anglia/Furness/Great Road→York (per chosen
   attack vector); Dover→Percy; "and possibly a lot more. Seas too."
   Owner to enumerate the full map; doctrine.js is its home.
