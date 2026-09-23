# U5 — the four 802.15.4ab lessons teach the mechanism as a procedure

Base: 89f152f. Files touched: `src/course/uwb/uwb-mms.ts`, `uwb-mms-numbers.ts`, `uwb-nba.ts`,
`uwb-nba-coexist.ts` and their four tests. Nothing else.

Grader (clean for all four ids):
`MECHANISM_INCLUDE=uwb-mms,uwb-mms-numbers,uwb-nba,uwb-nba-coexist npx vitest run tests/course/readability.test.ts`

---

## uwb-mms — "Sixteen milliseconds of energy"

Budget: `picture 628/900 · numbers 549/550 · practice 329/450 · total 1506 (1506 words, 25 min)`

**The procedure** (7 steps, `numbers`, closing the lesson) is the one-to-many round in the order
`mmsLayout` lays it out and `device.mms.ts` runs it: the block draws its narrowband channel
(`nbChannelForBlock`) and the Poll opens slot 0 → a Response window per anchor (`respSlot`) and
only a primed pair listens → the ranging phase, R+1 slots to a millisecond with the initiator's
fragment first (`fragmentSlot`) → what a fragment is and that only fragment 0 is stamped, at its
first pulse (`txOwnTrainFragment`) → `combineGainDb` + `trainDetected` against `UWB_RX_SENS_DBM` →
two report windows an anchor (`reportSlot`) → the three checks `ScenarioSchema` makes on the slot
(`% 300`, `uwbSlotFitNs`, `2 × slot ≥ uwbNbSlotFitNs`).

**The worked example** is a new eight-row table under the steps, the same seven steps on this
scene: `slot 0 · 23 B · 928.0 µs`, `slots 2, 4, 6 · 12 B · 576.0 µs`, `slots 8–39 · 4/ms ·
8 fragments`, `40 × 1 024 = 40 960 chips · 82.051 µs · 37 nJ`, `−100.26 + 9.03 = −91.23 dBm ·
+1.77 dB`, `slots 40, 44, 48 · 13 B · 608.0 µs`, `600 % 300 = 0 · 82.3 < 500.0 · 928.2 <
1000.0 µs`, and the fourth anchor's `1024.2 > 1000.0 µs`.

Cut to pay for it: the "Where the slots go" paragraph (now steps 1/3/6), the anchor-placement
clause in the room note (it is already in `deeper`), and the one-stamp-a-train clause of the
airtime paragraph (now step 4).

Terms added: none. Naming fixes for rule 4: the fragment is now named by a naming clause
("…stripped to the bone, **is a fragment**"), RSF is bracketed (`ranging sequence fragment (RSF)`
/ `测距序列片段（RSF）`), and the picture heading "One fragment, then another" became "One piece,
then another" — as a heading it was the *first* EN use of the term and so was defeating the rule.

**Standing facts kept and now pinned**: the slot floor for an MMS round is 600 RSTU, with the
`% 300` rule and the fragment-fit rule both stated on it (step 7 and the worked table); the Poll
grows 3 octets a responder and two 600 RSTU slots must hold it, which caps a round at three
(`nbOtmPollBytes(4) = 26` → 1024.2 µs, and the schema refuses it — asserted by parsing a
four-anchor scenario). The RIF rule is now written where the RIFs are discussed, in `deeper`:
integrity fragment y, counted from zero, starts at millisecond **X + Z + y − 1**, pinned against
`rifStartMs`.

Pins added: a new `uwb-mms · one round, step by step` suite — one `it` per step, each quoting the
shipped step string and checking its figure against `mmsLayout`, `mms.ts`, `nb.ts`, `phy.ts` or
the run, plus the RIF-start test. `proseMax` raised 950 → 1200 (the amendment's window).

## uwb-mms-numbers — "Fragments, budgets and the 12 dB"

Budget: `picture 556/900 · numbers 545/550 · practice 389/450 · total 1490 (1490 words, 20 min)`

**The procedure** (6 steps) is the sum itself, every symbol named where it appears: E (the
millisecond's energy), t (the fragment's length), P (`mmsFragmentDbm`), rx (the level on arrival),
G (`combineGainDb`), and margin = rx + G − S with the verdict. **The worked example** is a new
six-row table giving each line on this scene: `−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm → 37 nJ`,
`40 × 4 × (128 + 2 × 64) = 40 960 chips → 82.051 µs`, `10·log10(37 / 82.051) = −3.46 dBm`,
`−3.46 − (50.50 + 22.30 + 24) = −100.26 dBm`, `+9.03 dB · +6.02 dB`, `+1.77 dB · −1.24 dB`.

Cut to pay for it: the "What one millisecond is worth" formula block, which after step 1 and the
first row of the worked table said the same thing three times. Its `−41.3 … = 37 nJ` line now
lives in the worked table and is pinned there; the remaining two formula blocks shift index.

**An engine disagreement**: my first draft of step 4 wrote the distance term "at exponent 3".
`UWB_PL_EXP` is **2** — the UWB engine propagates in free space; exponent 3 is the *Wi-Fi* indoor
law that `uwb-nba-coexist` quotes. The step and its test now say 2, and the test carries a comment
saying which law is which so the two do not get crossed again.

**The CELL_RULE_CARRIES debt is cleared.** `2.10 cm over 21 ranges` is now the bare value
`2.10 cm`, with "over 21 ranges" moved into the (bilingual) row label. I re-ran both cell rules
over this lesson with the carry disabled: no language-neutral cell reads as English prose, and
every acronym in a neutral cell is glossed in its section. **The controller can drop the
`uwb-mms-numbers` entry from `CELL_RULE_CARRIES`** (`uwb-ul-tdoa` is not mine and still needs it).

Terms added: none. Naming fix: "combining gain" is now named at its first EN appearance, in the
watch block — "what adding them up was worth (the combining gain)".

Pins added: `uwb-mms-numbers · the whole sum, symbol by symbol`, one `it` a step, each checking the
step's words and the worked row against `UWB_MS_BUDGET_NJ`, `rsfChips`/`rsfNs`, `mmsFragmentDbm`,
`uwbPl0Db`/`UWB_PL_EXP`/`WALL_LOSS_DB`, `combineGainDb`, `UWB_RX_SENS_DBM` and both runs (X = 8
and X = 4). The lesson's local budget test now reads `BUDGETS` instead of the old hard-coded
650/350/400/1300.

## uwb-nba — "A second radio does the talking"

Budget: `picture 607/900 · numbers 550/550 · practice 341/450 · total 1498 (1498 words, 25 min)`

**The procedure** (6 steps, in `numbers`; the plain-words 4-step block in `picture` stays) is how
the two radios divide the round: the small radio speaks first and no ranging frame has gone out
yet; a Response window a responder, and that answer is what primes the receiver; only then the
wide radio, carrying fragments and nothing else, one transmit stamp a train; **the two run on one
grid** — a narrowband window is two slots of exactly the length a fragment gets, which is why a
message that will not fit its two slots makes the round illegal; the closing windows go back to
the small radio; the asker subtracts, halves, and has a distance.

**The worked example** is a new six-row table: `slot 0 · 23 B · 928.0 µs`, `slots 2, 4, 6 · 12 B ·
576.0 µs`, `slots 8–39 · 0 B · 0 Mbps`, `52 × 500.0 µs = 26 ms`, `slots 40, 44, 48 · 13 B ·
608.0 µs`, `20.608 ms`.

Terms added: none. Naming fixes: "narrowband" is introduced with a naming clause ("…far-reaching:
**that is the** narrowband radio"), and NB is bracketed — "the log marks everything of its own with
those two letters (NB)" / "都以这两个字母（NB）打头".

Pins added: `uwb-nba · how the two radios divide one round` — slot indices from `mmsLayout`,
message lengths from `nbPpduNs`, the grid from `roundPlan`, the two-slot window from
`layout.controlSlots === 2 × (1 + R)`, and the first distance read off the run at 20.608 ms.

## uwb-nba-coexist — "The narrowband radio shares 6 GHz too"

Budget: `picture 632/900 · numbers 548/550 · practice 356/450 · total 1536 (1536 words, 20 min)`

**这笔账 is gone.** The heading "Who pays / 这笔账谁付" is now "Who pays the difference / 差额由谁
来付", and the arithmetic it gestured at is written out: `407.215 → 362.631 Mb/s`, "which is
**44.58 Mb/s** gone, or **10.95 %** of what it had".

**The procedure** (6 steps) is one busy check in the order `nbClear` runs it: does this channel
oblige the device to listen (`nbLbtRequired` — mandatory in the upper band, optional in the lower)
→ read the power in the channel's 2.5 MHz (`lbtBusy`, one instantaneous reading standing in for
the 9 µs window) → compare with the per-megahertz limit spread over the channel
(`NB_LBT_THRESHOLD_DBM`) → busy is not a back-off: `dev.nbSkipBlock = r.block` and the whole block
goes silent → with no Poll there is no round, the anchors wait and time out → the next block draws
again (`nbChannelForBlock`), which is all hopping buys.

**The worked example** is a new seven-row table ending in the bill: `200 · 6301.25 MHz`,
`−75 dBm/MHz + 10·log10(2.5) = −71.02 dBm`, `−63.72 dBm`, `−63.72 ≥ −71.02 dBm`, `7`, `4 · 0`,
`407.215 → 362.631 Mb/s · −44.58 · 10.95 %`.

Terms added: none. Naming fixes: "allow list" is named with a dash clause and "hop" with "…which
is a hop"; both Chinese halves already named them.

Pins added: `uwb-nba-coexist · one busy check, step by step`, including an explicit test that no
string of the lesson carries 这笔账 / 那笔账 / "head arithmetic", and a test that the hop draw
`[100, 210, 200, 150, 100, 210, 200]` puts exactly three blocks clear and that the run yields
exactly three fixes.

---

## Things worth the controller's attention

1. **`CELL_RULE_CARRIES['uwb-mms-numbers']` can be dropped** (see above). `uwb-ul-tdoa` cannot.
2. **The ≤ 4-quantities-a-paragraph rule applies to `steps` items** (`paragraphTexts` returns them),
   which makes a step that *contains* the arithmetic illegal. The shape that works, and the one all
   four lessons now use, is: steps carry the procedure in words, and a worked-example table
   immediately under them carries the figures (table cells are exempt). Worth saying in the
   amendment, because the first draft of every one of these four lessons failed that rule.
3. **All four `numbers` sections are within a handful of words of the 550 ceiling** (549, 545, 550,
   548). Any future addition to them has to buy its room from something else.
4. `UWB_PL_EXP` is 2, not 3 — see uwb-mms-numbers above. No shipped lesson string said otherwise;
   the correction was to my own draft, but it is an easy one to repeat.
5. `proseMax` in the four lesson suites was raised from 950/900 to 1200, which is the amendment's
   window, not a relaxation of the graded budget (`BUDGETS` still does the real work).
