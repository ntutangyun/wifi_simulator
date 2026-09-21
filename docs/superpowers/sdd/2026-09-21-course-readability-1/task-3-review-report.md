# Task 3 review — `amp-intro` rewritten, `amp-ppdu` split out

**Diff under review:** `fe99177..d7078c7` (8 files, +754/−302), read from
`.superpowers/sdd/2026-09-21-course-readability-1/task-3-review.md` in seven passes.
Uncommitted work by the concurrent AMP fix-wave implementer (`src/engine/**`,
`src/model/view.ts`, `src/ui/{Inspector,glossary,i18n}`) was ignored throughout; none
of it touches the eight paths this task owns.

### Spec Compliance

- ✅ **Spec compliant.** Every item of the brief's two content contracts is present, the
  eight listed paths are exactly the eight the commit touches, and the three controller
  rulings are honoured as ruled.
- ⚠️ **Cannot verify from this diff:** whether the prose reads as a beginner's first
  lesson, and whether the ZH is written rather than translated — the separate beginner
  reader's seat. I judged correctness, pins and contract only.

#### Gates I ran

| command | result |
|---|---|
| `npx vitest run tests/course tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | **33 files, 815 tests passed**, exit 0, output pristine — no warnings, no stderr |
| `npx tsc -b --noEmit` | clean, exit 0, no output |
| `npx vite-node` measuring the two lessons | `amp-intro` 1285 words / 15 min; `amp-ppdu` 1284 / 15; terms 4 / 6; picture 8 / 7; numbers 7 / 5; deeper 4 / 0; jumps 5 / 3 — the CAUTION headers state the truth |

`readability.test.ts` runs 31 tests (17 before), i.e. 7 rules × 4 migrated lessons + 3
bookkeeping, so both new lessons really are graded by the contract test.

#### Constraint 1 — pins: inventory of `tests/course/amp-intro.test.ts` @ `fe99177`

6 describes / **33** `it`s at base → 25 (`amp-intro`) + 17 (`amp-ppdu`) = 42 at head.
All 33 accounted for; none dropped, none weakened:

| old `it` @ fe99177 | at d7078c7 |
|---|---|
| the scenario and the variant pass the scenario schema | amp-intro:75 — strengthened (now also `toEqual(ampIntroScenario({250,250}))`) |
| the computed study time … 15–25 minute target | amp-intro:81, retitled to the spec's window; keeps the `lessonMinutes` formula assertion |
| every jump target occurs in the base run | amp-intro:96 / amp-ppdu:85 — strengthened (watch→jump indices resolved) |
| the scene is one router and two tags, and nothing else | amp-intro:130 (kept whole); amp-ppdu pins scenario identity instead |
| AMP SIFS is 10 µs … | amp-intro:147 |
| padding is 20 / 36 µs, every frame here unprotected | **amp-ppdu:145** (whole, incl. the 50-frame loop); amp-intro:157 keeps the two constants for its `deeper` sentence |
| the downlink PPDU is 32 µs of legacy preamble … | **amp-ppdu:121** — strengthened (exact 8-segment order, first three sum to 32 µs) |
| the uplink PPDU has no legacy preamble … | **amp-ppdu:158** |
| the three frames are 13, 4 and 15 octets | **amp-ppdu:172** |
| at 250 kb/s the airtimes are 618, 330, 528 … | **amp-ppdu:181** |
| trigger longest, Ack shortest, only the response scales by four | **amp-ppdu:192** |
| the CTS-to-self is 44 µs at 6 Mb/s plus 6 µs | **amp-ppdu:222** — strengthened (`CTS_BYTES`, the run's own CTS, `330 > 6 × 50`) |
| the model values −72 / 8 / 10 / −94 | amp-intro:166 |
| the round opens with a CTS-to-self one SIFS before the trigger | amp-intro:179 |
| the CTS Duration of 4140 µs … 4190 µs | amp-intro:192 |
| slot 1 one AMP SIFS after the trigger, slot 2 after Ack₁ | amp-intro:203 |
| the first round runs to the timeline table | amp-intro:217 |
| the round costs 4190 µs, 4.19 % | amp-intro:237 |
| 3044 / 90 / 1056 µs | amp-intro:247 |
| at 1 Mb/s the same round is 1670 µs | **amp-ppdu:281** |
| one second holds ten rounds … sixteen naming a tag | amp-intro:262 |
| each tag answers all ten rounds: eight / two | amp-intro:276 |
| the inspector counters 10 / 8 / 2 | amp-intro:288 |
| a draw of 3 lands in slot 4, ACW + 1 = N | amp-intro:298 |
| the two losses are the two same-slot rounds | amp-intro:320 |
| the tags never carrier-sense, back off or wait an IFS | amp-intro:345 |
| no lane ever sets a NAV | amp-intro:358 |
| the link budget | amp-intro:368 |
| a Door tag deafened past −37.4 dBm | amp-intro:394 |
| the Ack's ID field names the tag, or the AP | **amp-ppdu:242** |
| the Ack spends 128 µs of its 330 µs | **amp-ppdu:212** |
| the log prints the ABOC draw / round / outcome | amp-intro:417 |
| the trigger's six-octet body | **amp-ppdu:258** |

New shape blocks, both files: `isMigrated` ✓, `module` ✓, `needs` ✓, `terms` list ✓,
no picture table (amp-intro) ✓, first `watch` index < 3 ✓, 500–1300 words ✓, ≤ 20 min ✓,
every jump found in the run ✓, bilingual walk over every `L10n` including `deeper` and
`sources` ✓. `amp-ppdu` adds two genuinely new pins: the 8-segment strip
`[16,4,12,80,64,416,20,6]` and the scenario-identity assertion.

Numbers audit: every quantity in either lesson's `why`/`terms`/`picture`/`numbers`/
`deeper`/`observe`/`tryThis`/`quiz` traces to a named pin. The one exception is noted
under Minor 2.

#### Constraint 2 — truth against the engine

Read at `d7078c7`: `src/engine/amp.ts`, `ampAp.ts`, `ampSta.ts`, `channel.ts`,
`rng.ts`, `traffic.ts`.

| lesson sentence | engine |
|---|---|
| CTS-to-self as the "keep quiet" reservation | `ampAp.ts:95-105` — `durationFieldNs = roundNs() + sifs`, sent only when `protection === 'ctsSelf'` ✓ |
| the trigger opens the slots | `ampAp.ts:126` — `slotStart(1)` at trigger end + `AMP_SIFS_NS` ✓ |
| tags cannot decode the CTS | `channel.ts:171-173` — a `'tag'` radio decodes only DL AMP PPDUs ✓ |
| the ABOC draw, uniform, slot = ABOC + 1 | `ampSta.ts:74-76` + `rng.ts:26` (`int` is inclusive `[0, acw]`) ✓ |
| the Acks pace the slots | `ampSta.ts:104-106` — the tag arms on `acksSeen === slot − 1`; `ampAp.ts:141` schedules the next slot from the Ack's end ✓ |
| "Miss one and the round is lost" | `ampSta.ts:56-59` — `onRxCorrupt` → `giveUp()` ✓ |
| an Ack for an empty slot names the AP | `ampAp.ts:136` — `dst = received.get(k) ?? nodeId` ✓ |
| the padding buys the tag its thinking time inside one gap | `amp.ts:18` + `ampSta.ts:80` ✓ |
| "no legacy preamble on the uplink, so Wi-Fi only energy-detects" | `channel.ts` `detectFloorDbm`: `frame.amp?.dir === 'ul'` returns `null` for a non-`ampCapable` radio — it can hold CCA busy by energy only, never acquire the PPDU ✓ |
| the response scales with rate, the fixed overhead does not | `amp.ts:44-51` — `ampUlPpduNs` is sync+bits, both rate-scaled; `ampDlPpduNs` carries 138 µs that is not ✓ |
| "the router takes the channel on its lowest-priority access function" | `traffic.ts:84` (`'idle'` → AC 0 = AC_BK) + the pin `IFS_START.ac === 0` ✓ |
| "protected means encrypted, pads 36 µs" | `amp.ts:19` ✓ |
| the 32 µs legacy opening = 16 + 4 + 12 | `amp.ts:15` comment (L-STF 8 + L-LTF 8 + L-SIG 4 + RL-SIG 4 + U-SIG 8) and the pinned strip ✓ |

No mechanism sentence is false. One is a simplification worth tightening (Minor 3).

#### Constraint 3 — contract (the untested rules)

- **one idea per paragraph** — holds across all 15 picture paragraphs; the closest calls
  (`amp-intro.ts:92` collision → who learns; `amp-ppdu.ts:90` overhead → the Ack) are
  single causal chains, not two ideas.
- **each term spelled out at first use inside `picture`** — holds for AMP, tag, slot,
  ABOC, OOK, Manchester, preamble, padding. **Fails for AMP-Sync and AMP-SIG** → Important 1.
- **`amp-intro` terms ≤ 4 and no picture table** — measured 4 terms, no table; also
  enforced now that `trackOf` returns `'amp'` for module 7 and `amp-intro` is the track's
  first non-MIGRATING lesson (`readability.test.ts` `firstOfTrack`) ✓.
- **citations only in `sources` and `numbers` table cells** — the padding table's "Where"
  column is the only cited cell; scanned `deeper` (untested by `readability.test.ts`)
  for `§ / Clause / IEEE Std / P802. / 11-2x/ / PM- / D0. / D1. / draft / TBD /
  model choice / 草案 / 标准正文 / 模型取值` — clean ✓.
- **`needs`** — `['radio-primer','frame-anatomy']` and `['amp-intro']`, both pinned and
  both satisfying the precede-and-track rule ✓.
- **quiz answerable from why→numbers** — all six: amp-intro Q1/Q3 from `picture`, Q2 from
  `picture` + the link-margin paragraph; amp-ppdu Q1 from "Why the frame is padded",
  Q2 from "Where an Ack's 330 µs goes", Q3 from "Uplink: the mirror image". Nothing needs
  `deeper` or `sources` ✓ (as the controller's ruling requires).
- **Wi-Fi reminders** — carrier sense and NAV glossed at `amp-intro.ts:65`, CTS at `:70`,
  legacy preamble at `amp-ppdu.ts:70`. TXOP is never used. SIFS is deliberately called
  "one gap" on the main path with the identity in `sources` — legitimate, since `SIFS` is
  in `TIER1_BASELINE` and the value is stated in `numbers` ✓.
- **no numeric quantity in any `picture` paragraph** in either language (measured: 0 for
  every EN paragraph; grep for digits in every ZH picture string: none) — well inside the
  two-per-paragraph cap ✓.

#### Constraint 4 — fixtures

`tests/fixtures/lesson-hashes.json` +2 lines and nothing else: `"amp-ppdu": "f1e44e52"`,
`"amp-ppdu#0": "94328b86"` — byte-equal to `amp-intro` / `amp-intro#0`, which the new
`amp-ppdu.test.ts:64` proves is not a coincidence (`ampPpdu.scenario()` deep-equals
`ampIntroScenario({250,250})`). `tests/fixtures/uwb-record-hashes.json` is absent from the
diff and its 39 tests pass ✓.

#### Constraint 5 — bilingual

Both lessons pass a walk over every `L10n` in every field, with an `en !== zh` guard on
multi-word English. I diffed the four `sources` items and the four `deeper` items of
`amp-intro` and the four `sources` of `amp-ppdu` fact by fact: draft status and dates,
11-24/1613r20, 11-26/1519r5, 11-26/1889r4 §39.4, SFD PM-96, §10.23.2.8, §39.3.2.2, the
model values (−72, 8 dB, 10 dB, −94), the U-SIG/Wi-Fi 7 rationale, the energizer and
AMP-enabled STA absences, ACW + 1 > N, the 12 dB rate-for-sensitivity trade, the 4140/50/
4190 chain and the NAV_SET explanation — all carried on both sides ✓.

#### Constraint 6 — copyright

No SFD/PDT prose anywhere, `sources` included: every citation is a document number, a
clause number or a motion id attached to a paraphrase of the rule. Checked all eight
`sources` entries in both languages ✓.

#### Constraint 7 — files

Exactly the brief's eight paths, no others ✓.

### Strengths

- **The split is proved, not asserted.** `amp-ppdu.test.ts:64-71` pins that both lessons'
  base scenario and variant deep-equal `ampIntroScenario`, which is precisely what makes
  the duplicated hash pair correct rather than a copy-paste. This is the right test to
  have written.
- **Two pins came back stronger than they left.** `amp-ppdu.test.ts:137-140` now asserts
  the real 8-segment order and that `legacyPreamble + signal + usig` sums to the 32 µs the
  prose calls "the legacy opening" — the implementer's self-review caught that the engine
  splits what the old test treated as one segment, and turned the correction into the new
  `observe` item's pin (`:268`). `amp-ppdu.test.ts:222` likewise caught that
  `frame.txTimeNs` already folds in the signal extension.
- **Every moved pin carries its sentence, re-quoted.** With one exception (Minor 1) every
  test comment quotes the final prose, including the `deeper:` / `numbers:` / `observe:`
  prefixes saying which section the sentence now lives in. That is what makes a pin
  inventory checkable at all.
- **The depth moved to `deeper` is the depth that had to move**, and it is still pinned:
  the sit-out condition, the 12 dB trade and the NAV_SET explanation each keep the
  assertion that guarded them, and no quiz answer depends on any of them.
- **Truth against the engine held under scrutiny** at every point the plain-language
  rewrite could have slipped: the CTS reservation, the random draw, the Ack-as-clock, the
  empty-slot Ack, the uplink's undetectability. I went looking for a false simplification
  and found one soft edge, not a falsehood.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

**1. `src/course/amp/amp-ppdu.ts:74` (and `:86`) — `AMP-Sync` and `AMP-SIG` are never
spelled out inside `picture`.**
The spec's First-use rule (`docs/superpowers/specs/2026-09-21-course-readability-design.md:81-83`)
requires the first sentence inside `picture` that uses a `terms` entry to read naturally
"without the reader having memorised the table". Both terms first appear as bare labels in
the watch block — "then AMP-Sync, AMP-SIG, the data octets, and the padding at the end" —
and the only later use (`:86`, "just its own short AMP-Sync") does not gloss them either.
Their plain meaning exists solely in the `terms` table and in the `numbers` note. This is
the lesson whose whole subject is those two fields, so it is the one place the rule most
needs to hold. Fix: gloss in place, e.g. "then AMP-Sync — a run of flashes that lets the
tag find the beat — then AMP-SIG, two octets saying what follows and how long it is, the
data octets, and the padding". With 16 words of headroom, delete a clause elsewhere in the
same block (the block currently runs well under the 90-word cap, so the paragraph rule is
not the constraint — the word budget is).

**2. `tests/course/amp-intro.test.ts:106-128` and `tests/course/amp-ppdu.test.ts:95-117` —
the bilingual walk is duplicated verbatim for the fourth time (brief-mandated).**
The same ~20-line `isL10n` + `walk` + `seen` block already exists at
`tests/course/uwb-intro.test.ts:139-155` and `tests/course/uwb-frame.test.ts:104-120`, and
a fifth near-copy is `textsOf` in `tests/course/readability.test.ts:33-46`. The brief's
Step 1 says "Add the shape block to both (as in Task 2)", so the implementer followed
instructions — I am reporting it per the calibration rule that a plan-mandated defect is
still a finding, because the plan has ~40 more lessons to migrate and this block is copied
into every one of them. Fix (a controller decision, not this task's): export the walk once
— `paragraphTexts` already lives in `src/course/readability.ts`, so an `allTexts(lesson)`
beside it would serve the lesson tests and let `readability.test.ts` drop `textsOf` too —
then have the four lesson tests call it. Secondary, same cause: the `recs` / `ofType` /
`txs` / `ends` helpers are duplicated between `amp-intro.test.ts:38-60` and
`amp-ppdu.test.ts:28-46`, and `amp-ppdu.test.ts` re-runs the identical 1-second simulation
`amp-intro.test.ts` already ran.

#### Minor (Nice to Have)

**1. `tests/course/amp-intro.test.ts:152` — a stale quote guarding no prose.**
The comment reads `// "a clock good enough to count 9 µs slots" (the picture's carrier-sense
reminder)`, but that sentence was cut: "9 µs" now appears nowhere in either lesson (the
picture says only "no dependable sense of time between frames"). The two assertions it
introduces (`SLOT_NS === 9 µs`, `ERP_2G.slotNs === SLOT_NS`) are true but pin nothing the
reader reads, and the report's claim that "every test comment was re-quoted against the
final prose" is false for this one. Fix: either drop the two lines, or restore a clock
clause to `amp-intro.ts:65` and re-quote.

**2. `src/course/amp/amp-ppdu.ts:151` — `4190 µs` and `4.19 %` are pinned only next door.**
The `tryThis` item contrasts the 1 Mb/s round with the 250 kb/s one, but
`amp-ppdu.test.ts:281` asserts only the 1670 µs / 1.67 % side; 4190 and 4.19 % are pinned
in `tests/course/amp-intro.test.ts:237`. Since both lessons provably load the same
scenario this is sound, but a reader of `amp-ppdu.test.ts` alone cannot see it. Fix: one
line in `amp-ppdu.test.ts:281` asserting the base run's 4190 µs, or a comment naming the
sibling pin.

**3. `src/course/amp/amp-intro.ts:101` — "the end of each acknowledgement opens the next"
drops the gap.**
`ampAp.ts:141` schedules the next slot at the Ack's end **plus one AMP SIFS**, and
`numbers` (`:120`) states that exactly ("slot 2 one gap after Ack₁ stops"). The picture
sentence as written would put the next slot flush against the Ack. It is a simplification
the very next section corrects, not a falsehood, but "so the next slot opens just after
each acknowledgement ends" costs two words and is true.

**4. `src/course/amp/amp-intro.ts:2` and `amp-ppdu.ts:2` — the module label now disagrees
with its neighbours.**
Both headers say "M7", where `amp-slots.ts:2`, `amp-coexist.ts:2` and the comment at
`src/course/curriculum.ts:82` say "M8" for the same module. The migrated UWB lessons use
the raw `module` index (`uwb-intro.ts:2` says M11 for module 11), so M7 follows the new
convention and the old AMP files are the stragglers — but the `amp/` folder now mixes
both. Worth a one-line fix in `curriculum.ts:82` when `amp-slots` migrates.

**5. `.superpowers/sdd/2026-09-21-course-readability-1/task-3-report.md` — the baseline
count is wrong.** The report states the old `amp-intro.test.ts` had "5 describes, 22 `it`s";
it had 6 describes and 33 `it`s. The report's own moved/kept tables are complete and
nothing was lost, so this is a bookkeeping slip — but it is the number a reviewer would
check the inventory against, and it does not add up to the 42 the same paragraph claims.

**6. `tests/course/amp-intro.test.ts:126` / `amp-ppdu.test.ts:115` —
`expect(seen.length).toBeGreaterThan(40)` is a smoke bound, not a count.** The lessons
have far more than 40 `L10n`s, so a large deletion could pass. Not worth fixing alone;
worth folding into the shared helper of Important 2, where a single sensible floor can
live.

### Assessment

**Task quality:** Approved with fixes — **Needs fixes** on Important 1 (a spec rule this
task is the last one able to apply cheaply); Important 2 is a controller decision about
the migration pattern, not a defect of this task's craft.

**Reasoning:** Every pin the base commit held is present and several came back stronger,
the split's central promise (one scenario, two lessons, identical hashes) is proved by an
assertion rather than asserted in prose, and every mechanism sentence survived a read of
`amp.ts`/`ampAp.ts`/`ampSta.ts`/`channel.ts` — including the two most falsifiable claims,
the Ack-as-clock and the uplink a Wi-Fi radio can only energy-detect. The one real gap is
that the lesson about AMP-Sync and AMP-SIG never says in `picture` what they are.
