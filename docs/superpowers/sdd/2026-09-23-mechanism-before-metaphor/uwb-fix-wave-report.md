# UWB track fix wave — report

Date: 2026-09-23. Worktree `.claude/worktrees/feat-link-2g`, branch `feat/uwb-ranging`.
Work list: `uwb-track-review.md` (8 Important, 13 Minor).
Scope held to `src/course/uwb/*.ts` and `tests/course/uwb-*.test.ts`.

Gate: `npx vitest run tests/course` — **2459 passed, 0 failed**, readability suite included
(every UWB id green, and the Wi-Fi ids are green too as of this run). `npx tsc -b --noEmit`
clean. Both dumps read end to end in EN and ZH for every lesson touched.

---

## Important

### I1 — the MMS fragment train is spaced `(R+1) × slot`, not one millisecond

Confirmed against the engine before touching a word. `roundPlan` on the base scene
(`uwbMmsScenario('base')`, three responders, 600 RSTU slot):

```
slots 52 · slotNs 500 000 · fragGapNs 2 000 000 · rsfs 8 → span 14 ms
ratioSigma(100 ps, 14 ms) = 0.0101 ppm ; on a 0.5 ms reply that is 0.76 mm
pairwise round: fragGapNs 1 000 000 — a true millisecond, which is why the claim looked true
```

Every instance the review listed, and three more it did not:

| where | was | now |
|---|---|---|
| `uwb-mms` step 3 | "one fragment a device a millisecond" | "a device's own fragments are four slots — two milliseconds — apart" |
| `uwb-mms` worked cell | `4/ms` | `4 per 2 ms` |
| `uwb-mms` step 4 | "Only the first fragment of a train is stamped" | "The receiver stamps two of them — the first it heard and the last" |
| `uwb-mms-numbers` picture heading | "A ruler a millisecond long" | "A ruler fourteen milliseconds long" |
| `uwb-mms-numbers` picture text | "fragments leave exactly a millisecond apart" | "one round-gap apart … four slots, two milliseconds, here" |
| `uwb-mms-numbers` formula | `((j − i) × 1 ms)` | `((j − i) × gap)`, both terms |
| `uwb-mms-numbers` note | "Over the 7 ms … σ_ratio = 0.0202 ppm" | "The gap here is 2 ms, so the 14 ms … σ_ratio = 0.0101 ppm" |
| `uwb-mms-numbers` table row | "The train's 0.0202 ppm \| 1.5 mm" | "The train's 0.0101 ppm \| 0.76 mm" |
| `uwb-mms-numbers` **deeper** (not in the review) | "taken 7 ms apart, give 0.0202 ppm" | "taken 14 ms apart, give 0.0101 ppm" |
| `uwb-mms-numbers` **quiz option** (not in the review) | "a millisecond apart … over 7 ms" | "one round-gap — two milliseconds here — … over 14 ms" |
| `uwb-mms-numbers` **quiz explain** (not in the review) | "That span gives 1.5 mm" | "gives 0.76 mm" |
| `uwb-mms-numbers` **file docstring** | "the millisecond-long ruler" | "the fourteen-millisecond ruler" |
| `uwb-capstone` picture | "a fragment from every device in every millisecond it lasts" | "every gap in the train carries a fragment from every device in the round" |

Unchanged on purpose: the `1.7 ppm` over one 82 µs fragment (the fragment length did not move),
and the term `fragment` — "one millisecond's piece of that packet" is still true, because a
fragment spends one millisecond's *energy allowance*; what is two milliseconds is the spacing.

**The vacuous pin is gone.** `tests/course/uwb-mms-numbers.test.ts` hard-coded
`ratioSigma(tsNoisePs, 7)`, so `'0.0202'` was arithmetic about the literal `7`. It now derives:

```ts
const plan = roundPlan(uwbMmsScenario('base').uwb!, ANCHORS.length)
const spanMs = ((plan.mms!.phy.rsfs - 1) * plan.mms!.fragGapNs) / MS
const sigmaPpm = () => ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, spanMs) * 1e6
```
with `fragGapNs === (responders + 1) * slotNs` asserted, `spanMs === 14` asserted, and the
pairwise round's `1 * MS` asserted beside it so the two rounds cannot be confused again.
`uwb-mms.test.ts` gained the same derivation on step 3 (`gapSlots === ANCHORS.length + 1`).

Checked the rest of the track for the same claim: no other lesson repeats it.

**Engine comments still say "a millisecond"** at `src/uwb/mms.ts:120` and
`src/uwb/device.mms.ts:455-457` ("The fragments are a millisecond apart on the transmitter's
clock"). They are outside this wave's pathspec so I left them; the paragraph at `mms.ts:131-133`
already contradicts them, and they are the last place the wrong sentence survives.

### I2 — `uwb-capstone` denied the redundancy `uwb-position` teaches

`deeper` now reads: *"A least-squares fix over three ranges has one measurement to spare over
its two unknowns — the floor coordinates, the height being held — and one degree of freedom is
not enough for the fit to notice a lie."* The ZH was already right about the two unknowns and
now matches the EN clause for clause. Pinned in `uwb-capstone.test.ts`: the new sentence is
there, `three unknowns` and `no redundancy at all` are not, and the explanation is asserted to
agree with `uwbPosition`'s quiz, which is the lesson that owns the claim.

### I3 — "residual" named two mechanisms

The fit residual keeps the name (`uwb-position`, `uwb-geometry`). The clock-offset leftover is
now **leftover** everywhere, EN and ZH:

- EN: `uwb-contention` ×2, `uwb-dl-tdoa` ×2 (+ docstring), `uwb-ul-tdoa` ×6 (+ 2 docstrings),
  `uwb-dstwr`'s *residue*, `uwb-sstwr`'s sources.
- ZH was **worse than the review recorded**: `uwb-sstwr` already used 残差 for the clock term in
  six places while its EN said "leftover". The ZH name is now 剩余误差 (and 校准剩余误差 for
  `uwb-ul-tdoa`'s calibration term) across all five lessons; 残差 is left to the fit alone.

### I4 — `uwb-sstwr` said the fix is weighted by a 1-σ

Step 7 now reads *"The 1-σ the error ellipse is drawn from is computed apart … The fix itself
weighs every range alike."* Pinned by a new assertion that runs `solvePosition` twice on the
same four ranges with σ and 10σ and asserts the answer and the residual are identical — only
the ellipse and GDOP move. That agrees with `uwb-geometry`, which said it correctly twice.

### I5 — `uwb-position` promised a residual no record carries

- `outcomes[2]`: *"say what the fit cannot explain — the residual — and why the log never
  prints it"* (was "use … to tell a good round from a spoiled one").
- picture, "The fourth ring is the check", now carries `uwb-geometry`'s half-sentence at the
  point of use: *"…and the solver knows that without being told which range lied — but no
  record carries the figure, so on screen nothing moves."*
- Pinned: the picture contains that clause, the outcome is the new one, and `UWB_POSITION` has
  no `residualM` key.

### I6 — `uwb-mms` stated the integrity fragment's security property as fact

`deeper` now says, at the sentence where the reader meets the claim: *"This simulator does not
do that: it generates no such sequence and compares nothing. In this simulator an integrity
verdict is a detection outcome — whether the integrity train cleared sensitivity — and a relay
cannot be run against a multi-millisecond round at all, because these receptions never reach
the attacker branch."* (Wording avoids `draft`/草案, which `CITATION` bans outside `sources`.)

Pinned by running the base scene again with `attacker: { advanceNs: 100 }` and asserting every
range comes back identical to three decimals — the MMS branch returns before the attacker
branch (`src/uwb/device.ts:465-472`).

### I7 — rule 2 could not fail

The rule itself was repaired by the controller (d9092ec, direct `needs` instead of the
closure). Six lessons then failed; all six are fixed:

| lesson | fix |
|---|---|
| `uwb-blocks` | new term `margin`, and the picture now names it where it first says it ("…with a little to spare — that spare room is the margin" / "这点余地就是余量") |
| `uwb-mms` | new terms `sensitivity` (whose gloss carries `threshold`/门限) and `margin` |
| `uwb-mms-numbers` | inherits both from `uwb-mms`, its only `need` |
| `uwb-coexist` | new terms `threshold` and `noise floor`, each named where the picture first pictures it, split across two paragraphs so the density rule still holds |
| `uwb-nba` | no term: the ZH said 门限 where the EN said "what the receiver needs". The ZH now says 电平, which is what the engine compares — the EN/ZH mismatch was the defect |
| `uwb-nba-coexist` | new term `threshold`, named in place in the LBT paragraph |

Adding those terms tripped a *different* rule — A4, "needs is honest about what the picture
leans on": `threshold` became `uwb-coexist`'s word, and `uwb-mms`/`uwb-mms-numbers` are not in
its `needs` closure. Rather than bolt `uwb-coexist` onto the MMS needs (which would be a false
promise), those three picture sentences now say what they actually mean — the receiver's own
*sensitivity*, which `uwb-mms` owns and `uwb-mms-numbers` inherits.

### I8 — the Chinese arm of the naming rule

Rule repaired by the controller. Two lessons failed it and are fixed:

- `uwb-intro`: 超宽带 first appeared in `why` with no naming clause. Reworded to
  *"…；这就是超宽带——"* / *"…and that is ultra-wideband:"*. The lesson is held to 1000 words as a
  track opener, so the rewording was made to *shrink* it: 1008 → 998.
- `uwb-ul-tdoa`: the ZH had 就是 *after* the term (*"这种上行形态就是 UL-TDoA"*). Now
  *"只有标签发送的这种做法，就是上行形态（UL-TDoA）"*.

---

## Minor

- **M1** — 28 ASCII `"` characters inside ZH strings converted to “ ” across `uwb-sstwr`,
  `uwb-dstwr`, `uwb-frame`, `uwb-sts`, `uwb-intro`. The two quoted **log lines** the reader is
  sent to find on screen (`"10 slots × 2000.0 µs"`, `"(97 % within 0.5 ns)"`) keep ASCII, as
  the review allows. (The review counted 16; a paired `"` is two characters.)
- **M2** — partially fixed; see "Not fixed" below. `uwb-nba`'s `asker` (10 uses, used nowhere
  else in the track) is now *the phone*, matching `uwb-nba-coexist`, which shares the scene and
  said "the phone" nine times. `uwb-contention`'s internal mix is resolved to *the phone*
  (picture and steps now agree). `uwb-geometry`'s jump label is now "the phone's Poll", matching
  `uwb-position`'s on the same scene.
- **M3** — the `uwb-mms-numbers` row is renamed: *"The floor two receive stamps put under any
  range, 21 of them"*. "Noise floor" now names only the RF level, in `uwb-coexist`.
- **M4** — `uwb-mms` step 7: "it divides the millisecond" → "it is a whole number of 300 RSTU",
  which is what `scenario.ts:692` checks and what the worked cell `600 % 300 = 0` prints.
- **M5** — `uwb-nba` sources: 28-slot → 52-slot, pinned against `roundPlan(...).slots`.
- **M6** — `uwb-blocks` step 1: *"Two of the three are set before a frame flies and never
  renegotiated: the block and the slot. The round falls out of them — the method gives the slot
  count, two per anchor plus two, and the round is that many slots."* Pinned beside the existing
  `rstuNs(PLAN.slots * SESSION.slotRstu) === PLAN.roundNs`.
- **M7** — heading renamed to *"Three cures — and what "partial" buys"* / 三个办法，以及“部分重叠”
  买得到什么. The translated-English ZH bullet flagged in the review preamble
  (还是那些帧在还是那些块里丢掉) is rewritten as 丢的仍然是同样那几帧，丢在同样那几个块里.
- **M8** — `uwb-coexist` step 4 gains the soft branch: *"That level also widens the timestamp
  noise, so a surviving frame is stamped less precisely."* Pinned with
  `tsSigmaNs(100, uwbSinrDb(-85, -80)) > tsSigmaNs(100, uwbSinrDb(-85, -Infinity))`. The
  track-wide "100 ps is a floor, not a constant" note went into `uwb-coexist`'s `sources`
  (provenance belongs there, and `numbers` had no room).
- **M9** — `uwb-blocks` sources: the nine-anchor cap moved out of "model choices" and is
  derived — *"a 14 + 12N Final at ten anchors is 134 octets, past the 127-octet limit on a
  payload"* — with the arithmetic pinned both ways around `UWB_MAX_ANCHORS`.
- **M10** — `uwb-dstwr` deeper now reads *"GDOP 1.00 (the price the anchors' own layout puts on
  that error)"*, the same parenthesis `uwb-position` uses.
- **M12** — `uwb-mms-numbers` deeper now says the scene's own train is not one of the
  seventeen: *"X = 8 at 40 repetitions and a 64-zero gap matches no named set"*, pinned by
  scanning `MMS_SETS` for a match and asserting there is none.

---

## Not fixed, and why

- **M2, the rest of it.** `phone` / `tag` / `badge` remain three names for the thing being
  located across the track, `responder` is still never introduced on a main path, and
  *"a tag — anything being located"* is still glossed three times (`uwb-intro`, `uwb-dl-tdoa`,
  `uwb-ul-tdoa`). Fixing that properly is a scene-name pass over all eighteen lessons, their
  jump labels, their quiz options and their pins — a rewrite in its own right, well past a
  Minor finding, and it would collide with whatever the controller wants the three scenes to be
  called. I fixed only the three places where one lesson contradicted **itself or its own
  scene partner**, which is the part that can mislead a reader inside one sitting.
- **M11** — stale rule bookkeeping (`CELL_RULE_CARRIES = {}` and its TODO comment) lives in
  `tests/course/readability.test.ts`, the controller's file and outside this wave's pathspec.
  Still true: the comment names `uwb-ul-tdoa` and `uwb-mms-numbers` as printing English into
  neutral cells, the rule no longer reports them, and `uwb-ul-tdoa` still prints
  *"1 slot of 2 ms, 1 frame"*. Controller's call: delete the comment or re-point the rule.
- **M13** — harvesting the UWB track's pointer phrases into `SHORTHAND` means editing
  `src/course/readability.ts`, also the controller's. The review itself files it as a note.
- **I7/I8 rule changes** — already done by the controller in d9092ec; this wave only fixed the
  lessons the repaired rules reported.

## Budgets after the wave

Every lesson is inside its ceiling. Four sit **exactly at 550/550 on `numbers`** —
`uwb-mms`, `uwb-mms-numbers`, `uwb-blocks`, and `uwb-coexist` at 548 — because each had to pay
for a correction inside the same section. Nothing was compressed out: what was cut was
redundancy (`"either all three are heard or none of them is"` → `"all three are heard, or none
is"`, `"still the slow part"` → `"the slow part"`, `"A fourth phone would cost nothing but the
next empty round"` → `"A fourth phone costs the next empty round"`), never a mechanism. But
those four lessons have **no room left**: the next correction in any of their `numbers`
sections needs a split, and the controller should know that before the next wave.

```
uwb-intro         picture 429/900 · numbers 313/550 · practice 256/450 · total  998
uwb-blocks        picture 597/900 · numbers 550/550 · practice 360/450 · total 1507
uwb-sstwr         picture 634/900 · numbers 545/550 · practice 399/450 · total 1578
uwb-position      picture 514/900 · numbers 532/550 · practice 346/450 · total 1392
uwb-coexist       picture 716/900 · numbers 548/550 · practice 326/450 · total 1590
uwb-mms           picture 665/900 · numbers 548/550 · practice 329/450 · total 1542
uwb-mms-numbers   picture 560/900 · numbers 550/550 · practice 394/450 · total 1504
```

Per-lesson `proseMax` ratchets raised deliberately where a term was added:
`uwb-blocks` 1130→1150, `uwb-coexist` 1250→1270, `uwb-mms` 1200→1220,
`uwb-nba-coexist` 1200→1210.

## Where the engine contradicted the lesson

Three times, and the engine won each time:

1. `session.ts:105` `fragGapNs = (responders + 1) * slotNs` against five sentences saying a
   millisecond (I1).
2. `position.ts:124-149` — the normal equations are unweighted, and `rangeSigmaM` enters only
   the covariance at `:170-173` — against `uwb-sstwr`'s "the 1-σ the fix is weighted by" (I4).
3. `device.mms.ts:487` — `integrity` is `p.rifDetected`, a detection outcome — against
   `uwb-mms`'s "cannot be forged by replaying a recording" stated as fact (I6).
