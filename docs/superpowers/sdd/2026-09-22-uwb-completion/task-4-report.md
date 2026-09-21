# T4 — uwb-sts, uwb-capstone, and the 4ab lessons on one-to-many

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.

## Engine knobs added (the smallest that would do)

`src/model/scenario.ts` · `UwbSessionCfg`, both **optional and absent by default**, so no
scenario that never named them serialises or replays differently:

- `attacker?: { advanceNs: number }` — model: a relay between the two radios that makes
  **every** reception of the session land `advanceNs` earlier than the geometry allows.
  Schema: `z.object({ advanceNs: z.number().min(0).max(10_000) }).optional()`.
- `stsOff?: boolean` — model: the frames carry no scrambled timestamp sequence, so the relayed
  leading edge is stamped at face value. Schema: `z.boolean().optional()`.

`src/uwb/device.ts` · `onRxOk`, in the two-way branch only (after the MMS early return):

- attacker set and `stsOff` not set → emit `UWB_STS_REJECT`, take no stamp, return to the
  waiting state exactly as `onRxFail` does. The slot deadline then reports the miss, so a
  defended round under attack produces `UWB_TIMEOUT` and no range.
- attacker set and `stsOff` true → `extraNs` gains `− advanceNs`; nothing else moves, so the
  random stream is untouched.

New record `UWB_STS_REJECT { node, peer, frameKind, advanceNs }` (`src/uwb/records.ts`),
formatted in `src/uwb/format.ts` and routed in `src/ui/format.ts`; `src/uwb/view.ts` needs no
change (its switch has a `default`). `src/uwb/network.ts` spreads the two fields onto
`UwbDeviceCfg` only when the session carries them.

One cosmetic change to T3's output: `UWB_MMS_TRAIN`'s one-to-many tail now prints
`· responders: a, b, c` (colon added). Nothing pinned the old spelling; the colon was needed
because the kit's bilingual walk treats `responders anchor-1` in a language-neutral table cell
as untranslated English prose.

## Physics the lesson rests on

At 20 m, a 50 ns advance on both receptions of an SS-TWR round moves each receive counter down
by 3195 RCTU (= 50.0 ns), so `(Tround − Treply)/2` falls by 50 ns: the reported range goes from
19.95 m to 4.96 m, a constant **14.99 m** whatever the true distance. Hence the variants stand
at 20 m — at 5 m the same relay gives a negative range. With the sequence on, the **anchor**
rejects the poll (the round's first reception): 1 × `UWB_STS_REJECT`, 2 × `UWB_TIMEOUT`,
0 × `UWB_RANGE` in a 30 ms run.

## Lessons

### A. `uwb-sts` "A timestamp nobody can fake" (module 11, after `uwb-frame`)

- `needs: ['uwb-frame']`; terms `relay attack`, `key`, `STS`.
- Base scene = `uwbIntroScenario(5)`, deep-equal to `uwb-intro`'s, so both fixtures carry
  `uwb-sts` = `uwb-intro`'s value. Variants: the honest 20 m scene plus the relay, once with
  `stsOff` and once without.
- Pins (`tests/course/uwb-sts.test.ts`, 14 tests): the 50 ns → 14.99 m claim against the two
  runs; the 3195 RCTU per counter and 4267 → 1072 raw flight; the reject count, its node, peer
  and frame kind, and the absence of any receive stamp; the base hash equality read out of both
  fixture files.

### B. `uwb-capstone` "Locate the phone in this flat" (module 16, last in COURSE_ORDER)

New module `MODULES[16] = { tier: 6, 'The ranging capstone' }`.

- `needs: ['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist']`; terms `brief`, `duty cycle`.
- Scene: `hallwayHouse()`, a Wi-Fi 7 router in the hallway on 6 GHz channel 71 (inside UWB
  channel 5) and a laptop backing up; anchors 1 and 2 in Room B with the phone, anchor 3 across
  the brick wall at x = 6; DS-TWR + AoA, NLOS on. Variants: anchor 3 into the far room; a block
  every 100 ms; one round for all three (MMS one-to-many, 3 responders at the default 600 RSTU).
- Rubric table in the tier1-project style, every row pinned to a run number.
- Pins (`tests/course/uwb-capstone.test.ts`, 16 tests): the four-scene table (fixes /
  three-range fixes / timeouts / `UWB_INTERFERED`) read cell by cell against the runs; the
  anchor-3 offset (+0.60 m = one brick wall each way, every block, `FOM_NLOS` against
  `FOM_LOS`); the three-range fix's 0.55 / 0.57 m and GDOP 1.25; the fast block doubling rounds
  and interference while leaving the error alone; the far anchor leaving no three-range fix;
  the one-to-many round's responder list.

### C. The four 4ab lessons re-based on one-to-many

`uwbMmsScenario` and `uwbNbaScenario` take a new `'pairwise'` variant, **appended last**, that
reproduces the old base byte for byte; only the base becomes `oneToMany: true`.

Correction taken mid-task: an MMS slot must be a multiple of 300 RSTU and must fit the
608.2 µs REPORT in two slots, so **600 RSTU is the shortest legal slot** and no one-to-many
round can have a true 1 ms fragment spacing. Every one-to-many scene therefore runs at 600 RSTU
with **at most three** responders; fragments are one slot per responder plus one apart.

- `uwb-mms` / `uwb-mms-numbers`: the three-anchor hall, now one 52-slot / 26 ms round a block
  instead of three 28-slot / 14 ms pair rounds. New base numbers: POLL 23 B / 928.0 µs, three
  NBRESP at 1/2/3 ms, 32 fragments, narrowband air 4.480 ms of the round's 7.106 ms, first
  train verdict 18.500 ms, first range 20.608 ms, block fix at 26 ms (was 42 ms), ratios
  39.985 / 19.996 / 9.984 ppm. A new `numbers` table compares the two rounds row by row and
  carries the responder-limit rule ("two 600 RSTU slots must hold the Poll, which grows by
  3 octets per responder"). The old figures move to the pairwise variant's pins.
- `uwb-nba` / `uwb-nba-coexist`: the four-anchor ring cannot be a one-to-many round at any
  legal slot (the 4-responder POLL needs 1024.2 µs against two slots), so **the base scene uses
  the first three anchors** and every pair-round variant keeps all four — which is why only the
  base hash moved. New base numbers: the same 52-slot round, anchor-2 losing its narrowband
  window to the router (LBT busy at 2.000 ms), the phone's own busy check at 21.000 ms, four
  distances over two of the seven blocks, 21 timeouts, 10 narrowband messages and 6 Wi-Fi
  receptions lost behind them.

## Word budgets after the change (`scripts/lesson-dump.ts <id> en`)

| lesson | picture /650 | numbers /350 | practice /400 | total | minutes |
|---|---|---|---|---|---|
| `uwb-sts` | 618 | 173 | 384 | 1175 | 20 |
| `uwb-capstone` | 602 | 305 | 364 | 1271 | 20 |
| `uwb-mms` | 628 | 313 | 333 | 1274 | 20 |
| `uwb-mms-numbers` | 552 | 350 | 389 | 1291 | 20 |
| `uwb-nba` | 602 | 292 | 341 | 1235 | 20 |
| `uwb-nba-coexist` | 618 | 325 | 346 | 1289 | 20 |

`uwb-mms` paid for the comparison table by trimming five picture paragraphs and dropping the
inspector experiment (its claim moved to a third observation). `uwb-nba`'s content-contract
prose window in its own test went 850 → 900 for the extra table row; the spec's section budgets
and the 1300-word cap are unchanged and met.

## Fixture keys

`tests/fixtures/lesson-hashes.json` and `tests/fixtures/uwb-record-hashes.json`, the same four
keys moved in each:

| key | why |
|---|---|
| `uwb-mms` | base scene is now a one-to-many round (`mms.oneToMany: true`) |
| `uwb-mms-numbers` | same scene as `uwb-mms`, so it moves with it |
| `uwb-nba` | base is one-to-many and drops the fourth anchor (a 4-responder POLL does not fit two slots at any legal MMS slot) |
| `uwb-nba-coexist` | same scene as `uwb-nba` |

Additions: `uwb-sts` (= `uwb-intro`'s value) + `uwb-sts#0`, `#1`; `uwb-capstone` + `#0`…`#2`;
and `uwb-mms#3`, `uwb-mms-numbers#3`, `uwb-nba#3`, `uwb-nba-coexist#3`, each carrying the
**old** base hash of its lesson unchanged — the pairwise variant is the previous base, value for
value. No other key changed.

## Pins that moved rather than died

- The 28-slot / 14 ms round, its 1.760 ms of narrowband air in 3.073 ms, the 42 ms block fix and
  the four-per-block round structure: now asserted on the `pairwise` variant (`uwb-mms`,
  `uwb-nba`).
- rsf-1's "three rounds take 60 ms instead of 42" is measured against the pairwise round, since
  rsf-1 is itself a pair round.
- `tests/uwb/mms-one-to-many.test.ts` "replays the uwb-mms lesson scene to its recorded fixture
  hash" now replays `uwb-mms`'s last variant against `uwb-mms#3` — the same scenario it was
  guarding, under its new key.
- `tests/course/lessons.test.ts` `MODULES.map(m => m.tier)` gains the 17th module.

## Gates

`npx tsc -b --noEmit` clean; `npx vitest run` 136 files / 2346 tests green.

---

# Fix wave — the whole-branch review (bbc5233..909706c)

All six Important findings fixed; the Minors that live in `src/course` or `tests/course` fixed;
everything else listed below with a reason.

## Important

**I1 — the capstone's decision three claimed the opposite of the run.** The picture paragraph
and the rubric cell now say what is true: one exchange instead of three, *bought with* far more
time on the air, and the variant drops the bearings because it is the multi-millisecond mode.
The four-scene table gained two columns, `Transmissions` and `Air` — 44 / 8.5 ms for the base
against 294 / 62.5 ms for one round for all three (34 / 6.5 and 81 / 15.7 for the other two) —
pinned cell by cell against the UWB nodes' own `TX_START` records. The false "a lost fragment
costs every anchor at once" is replaced, and a `deeper` entry says where the claim went wrong:
loss is decided per receiver and per fragment, so what costs all three at once is the phone's
own message — the Poll, or its busy check. A test asserts neither phrase survives anywhere in
the picture or the rubric.

**I2 — the half-metre brief is now closed.** A new `numbers` paragraph, "Does anything meet the
brief?", says no scene keeps every fix inside half a metre (the offset alone is 0.60 m) and
that the second experiment does. The rubric's last row is now "The brief". Pinned: the worst
three-range error exceeds 0.5 m in all three scenes that have one (`farAnchor` has none at
all), the anchor-3 offset is 0.60 m, and the bias-corrected re-solve of the same block through
`solvePosition` lands 0.02 m from the truth.

**I3 — "one distance" is gone from both narrowband lessons.** `uwb-nba-coexist`'s two quiz
questions, its first explanation and its header comment, and `uwb-nba`'s "happens exactly once"
and its jump label, all now say four distances in two of seven blocks. The quiz *question*
strings are pinned (not only the answers), as are the picture sentence, the jump label and the
run's own `[0, 4]` blocks with four tag ranges.

**I4 — `uwb-sts` numbers prose agreed with the quiz.** "the two halves of the formula pull the
same way" became "That makes the round trip shorter and the reply time longer, so their
difference falls by twice the advance, and the halving leaves exactly one." A test compares the
sign words of the prose and of the quiz explanation, and asserts the old phrase is gone.

**I5 — the STS/SYNC ratio.** "two thirds as long again as the pattern that opens the frame"
became "about as long as the SYNC that opens the frame, which is 32 512 chips". Pinned:
`STS_ACTIVE_CHIPS` = 32 768 against `SYNC_SYMBOLS × PSYM_CHIPS` = 32 512, ratio 1.008.

**I6 — the honest 20 m run is loadable.** `uwb-sts` gains a third variant, "Honest, at 20 m"
(`uwbIntroScenario(20)`), which is `uwb-intro`'s own variant scenario for scenario; the counter
table's column and the first experiment name it ("the third variant"). Both fixture files gain
`uwb-sts#2` equal to `uwb-intro#0`, and a test reads that equality out of the files. The two
counter-comparison tests now run the lesson's own variant instead of reaching into `uwb-intro`.

## Minors fixed (in `src/course` / `tests/course`)

- **M1** `curriculum.ts` COURSE_ORDER comment M15 to M16; the capstone rubric's hedges swapped —
  "roughly doubles the timeouts" is now on the far-anchor row (18 to 40) and "all double
  exactly" on the block rate (18 to 36, 6 to 12), both pinned against the runs.
- **M2** `uwb-mms` says which fix it quotes: "The inspector shows the last block's, (14.22,
  4.05) m…", with the log table's block-0 "(14.24, 4.08)" pinned beside it.
- **M9** ZH prose no longer carries the everyday English terms: 中继攻击, 密钥 and 占空比 in the
  Chinese sentences, the English `term` kept in the "New words" table (the kit matches a term
  against either language, so nothing in the contract objects).
- **M10** `uwb-mms` comparison-table label "Responders one slot allows" became "Responders the
  Poll window holds".

## Skipped, with reasons

| finding | why |
|---|---|
| **M3** `README.md`, `src/uwb/channel.ts` — the "250 µs shortest slot" line | outside `src/course` and `tests/course`; engine/docs half of the T3 I1 correction |
| **M4** `src/uwb/device.mms.ts` foreign-power doc | outside the course; the review itself splits the behaviour half to carry C2 |
| **M5** `src/model/scenario.ts` attacker JSDoc (MMS is out of the model's reach) | outside the course; noted here instead, and the lesson only uses two-way ranging |
| **M6** `src/ui/i18n.ts` stale one-to-many hints | outside the course |
| **M7** `tests/uwb/ts-noise.test.ts` stale comment about `variants[1]` | `tests/uwb`, not `tests/course` |
| **M8** duplicated `hashOf` between `tests/uwb` and `tests/engine` | neither file is in `tests/course` |
| **C1…C6** | carries the review defers by design; C2 and C6 would move hashes or need a kit change |

## Budgets after the wave (`scripts/lesson-dump.ts <id> en`)

| lesson | picture /650 | numbers /350 | practice /400 | total | minutes |
|---|---|---|---|---|---|
| `uwb-sts` | 618 | 186 | 386 | 1190 | 20 |
| `uwb-capstone` | 615 | 348 | 330 | 1293 | 20 |
| `uwb-mms` | 628 | 317 | 329 | 1274 | 20 |
| `uwb-mms-numbers` | 552 | 350 | 389 | 1291 | 20 |
| `uwb-nba` | 602 | 296 | 341 | 1239 | 20 |
| `uwb-nba-coexist` | 618 | 325 | 356 | 1299 | 20 |

To pay for I1 and I2 the capstone dropped its timeout observation (the four-scene table's own
second column said it already) and its cost figures went into two table columns rather than a
formula and a note; its own content-contract prose window moved 950 to 965 and `uwb-sts`'s
800 to 820. The spec's section budgets, the 1300-word cap and the 20-minute cap are met by
every lesson.

## Fixtures

Additions only: `uwb-sts#2` = `1acca385` in `lesson-hashes.json` and `98180104` in
`uwb-record-hashes.json`, both equal to `uwb-intro#0`. Both hash suites were run without
`UPDATE_HASHES` first (63 tests green) and nothing else moved.

## Gates

`npx tsc -b --noEmit` clean; `npx vitest run` 136 files / 2357 tests green.
