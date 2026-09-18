# Task 5 review — lesson 4 "Blocks, rounds and slots" (`uwb-blocks`)

Reviewed: commit `3f73852` (review package `task-5-review.diff`, `f7334a9..3f73852`), against
`task-5-brief.md`, `task-5-report.md`, the controller's three rulings, and the house style of
`src/course/uwb/uwb-dstwr.ts` / `tests/course/uwb-dstwr.test.ts` plus the reviews
`docs/superpowers/sdd/2026-09-18-uwb-core/task-8-review.md` … `task-10-review.md`.
Read only; no file was edited. The untracked `tests/course/zzprobe.test.ts` belongs to the
concurrent lesson-5 work (it imports `brick`/`Wall`) and was ignored.

## Commands run

- `npx vitest run tests/course/uwb-blocks.test.ts tests/engine/lesson-hashes.test.ts`
  → **2 files / 24 tests passed** (uwb-blocks 23, lesson-hashes 1), exit 0.
- `npx tsc -b` → clean, exit 0, no diagnostics at all (so nothing from the lesson-5 files either).
- Independent measurement of the size claim: `lessonWords(uwbBlocks)` = **1708**,
  `lessonMinutes(uwbBlocks)` = **25** — exactly what the file header and the report state, 16 words
  under the pinned 1724 ceiling.

## Verdict

Spec: APPROVED
Quality: CHANGES REQUIRED

The brief's scene, shape, body list, jumps, pin list and fixture rule are all met, and all three
controller rulings are implemented and pinned. The two blocking findings are prose numbers that
contradict the lesson's own pinned measurements — the stated-vs-simulated drift this project treats
as the recurring bug class — so they land on the quality axis, the same split Task 9 and Task 10 used.

## What was verified as correct

**Scene — the brief, coordinate for coordinate.** `uwbBlocksScenario(slotRstu)`
(`src/course/uwb/uwb-blocks.ts:43-53`) is `uwbSc(oneRoom(), …, { method: 'ds', nlos: false, slotRstu })`
with lesson 2's ring — `anchor-1` (8.5, 4), `anchor-2` (5, 7.5), `anchor-3` (1.5, 4), `anchor-4`
(5, 0.5), all z 2.2 — and `uwb-1` (5, 4), `uwb-2` (3, 2.5), `uwb-3` (7.5, 6) at z 1.0. The test pins
the room, node order, roles, z, the 3-D hypotenuse to 3.5 m at 12 digits, the three tag positions,
`ppm === undefined` on every node (drawn, not set), idle profiles, empty `servers`, and
`{ ...DEFAULT_UWB_SESSION, method: 'ds', nlos: false, slotRstu: 2400 }` with `slotRstu`/`blockRstu`
asserted equal to the schema defaults, so "defaults" is an oracle rather than a re-typed constant
(`test:185-207`). Variant `slotRstu: 600`, labels "0.5 ms slots" / "0.5 ms 时隙" verbatim, with a
`JSON.stringify` comparison proving nothing but the slot differs (`test:209-219`).

**Shape and registration.** `id: 'uwb-blocks'`, `module: 12`, already listed in `COURSE_ORDER`
(`src/course/curriculum.ts:84`); 5 jumps / 4 observe / 2 tryThis / 3 quiz pinned (`test:115-121`);
`lessonMinutes` pinned to the formula, to the [15, 25] band and to the 1724-word ceiling with the
1725→30 tipping point spelled out (`test:99-112`). `src/course/lessons.ts` gains exactly the import
and the `AUTHORED` entry (2 lines). `src/course/lessonKit.ts` gains one line, `firstUwbRoundEnd`,
in the existing UWB predicate block — the brief anticipated it was missing.

**Jumps.** Five, chronological, all pure record predicates: `firstUwbPoll` (0),
`firstUwbPosition` (20 ms), `firstUwbRoundEnd` (20 ms), the local `secondTagRound` (20 ms),
the local `nextBlock` (200 ms). `secondTagRound` and `nextBlock` (`uwb-blocks.ts:33,35`) are
one-line `TLRecord` predicates with no closure over run state, in the house style of lesson 3's
`firstAnchorRange`. The test finds all five in the base run, asserts their record indices are
non-decreasing, and pins the three 20 ms instants and the 200 ms one against `PLAN.roundNs` /
`PLAN.blockNs` rather than literals (`test:123-137`).

**Standard citations.** §10.32.2 (block/round/slot), §10.29.1.5 + Table 10-145 (RSTU),
§10.32.9.1 (ARC IE), §10.32.9.8 (RDM IE), IEEE Std 802.15.4-2024 — all six strings pinned
(`test:163-166`) and all six match the clause set this branch already had corrected and verified in
`docs/superpowers/sdd/2026-09-18-uwb-core/branch-review.md:97-99` and carried into `README.md:66,73,74`,
`src/model/scenario.ts:171-180` and `src/ui/glossary.ts:628`. The lesson's "counts a block and a slot
in whole 3-RSTU units" is the same claim `scenario.ts:179` and `UwbSessionFields.tsx:120` (`to3`)
already make, and the schema enforces it (`scenario.ts:386-387`). The source paragraph correctly
separates the three provenances the house style asks for: standard clauses, FiRa profile numbers
(2 ms slot, 200 ms block) and model numbers (200 ns guard, 300 RSTU floor, 9 anchors), each of the
latter three pinned to its engine constant (`test:167-180`).

**Controller ruling 1 — schedule share vs radio share.** Both are taught, both are pinned, and the
distinction is the strongest thing in the lesson. Schedule share: `test:341-343`
(20/200 = 10 %, 3 × 20 ms = 60 ms = 30 %). Radio share, measured by integrating the `MAC_STATE` lane
out of `idle` (`test:71-86`): tag 1 934 334 ns / 0.97 %, anchor 2 448 546 ns / 1.22 %
(`test:346-366`), including the two cross-checks that make it a measurement and not a fit — the
tag's total decomposed as round airtime 1 934 230 ns + 8 × 13 ns of flight (`test:369-379`) and the
anchor's ten-slot state trace pinned transition by transition, `0:uwbWait / 13:rx / 206872:idle /
2000000:tx / … / 12191474:idle`, with the derived list of non-idle slots `[0,0,1,5,5,6]`
(`test:381-400`). Every table cell of both tables is pinned by position and the ns cells parsed back
to the measured numbers (`test:236-246`, `test:355-361`).

**Controller ruling 2 — the 300 RSTU floor.** `test:420-448`: 282 RSTU = 235 000 ns gives exactly two
schema issues, one of them the floor message and one naming both 235.0 µs and 236.8 µs; 285 RSTU =
237 500 ns gives exactly the floor message and clears the fit rule by exactly 697 ns; 300 RSTU parses
clean. It also pins that 282 and 285 are both multiples of 3, which is what makes quiz 3's first
distractor honest, and that the fit rule stays under the floor for 1–5 anchors and first overtakes it
at six (267 572 ns → 324 RSTU). The oracle is `ScenarioSchema.safeParse` of the lesson's own scenario,
never a re-typed rule.

**Controller ruling 3 — "rounds per block 12".** `test:496-505` pins `roundPlan(SESSION, 3)` →
8 slots = 2N + 2, 16 ms round, `roundsPerBlock` 12, and `uwbFinalBytes(4) − uwbFinalBytes(3)` = 12.
I checked the UI side independently: `src/ui/i18n.ts:354` renders exactly
`slots per round ${slots} · rounds per block ${rounds}`, `src/uwb/ui/UwbSessionFields.tsx:81` renders
it from `roundPlan(session, anchors)` with `anchors` taken live from the scenario
(`src/editor/FloorPlanEditor.tsx:482`), and `canDeleteNode` (`src/editor/planOps.ts:266-271`) permits
deleting an anchor, so the quoted string is literally what the learner will read. The 285→300 snap is
also real: the slot field is an `RstuInput` with `lo = 300` that clamps on blur (`UwbSessionFields.tsx:99-121`).

**Everything else the brief asked to be pinned.** `UWB_ROUND` at 0/20/40 ms and 200/220/240 ms with
node and round index, `UWB_ROUND_END` at 20/40/60 ms, no `UWB_TIMEOUT`, the `fmtRecord` round line
verbatim (`test:249-270`); every `TX_START` in block 0 a multiple of `slotNs` plus the whole first
round as a `node/kind@ms` list, and zero `BACKOFF_DRAW`/`IFS_START`/`NAV_SET` (`test:297-314`); the
Poll's 39 octets with the ARC and RDM widths taken from `ARC_IE_BYTES`/`rdmIeBytes` and both rendered
IE values verbatim (`test:316-334`); the three `UWB_POSITION` lines verbatim from `fmtRecord`, with a
4-σ guard so a reseed cannot quietly falsify "2 cm out or better" (`test:272-295`); the whole variant
— 500 000 ns slot, 5 ms round, 40 rounds, round-ends and fixes at 5/10/15 ms, identical frame list,
identical round airtime, 2.5 % schedule share, radio-on identical to the nanosecond (`test:458-494`).
`lesson-hashes.json` adds exactly two keys and changes none.

**Types.** No `any`, no `as unknown as`, no `@ts-` directive in either file; the only casts are
`x as Record<string, unknown>` inside the two `unknown`-typed walkers and the `is`-predicate filters
used for `Block` narrowing, which is the same shape lesson 3's test uses.

## Findings

### Blocking

**1. `src/course/uwb/uwb-blocks.ts:76` (EN) and `:77` (ZH) — "which seven to sleep through" is six.**
The Poll paragraph ends "One Poll tells an anchor which slot to answer in, and which seven to sleep
through" / "以及可以安睡过哪七个时隙". An anchor is awake in four of the ten slots — slot 0 (hears the
Poll), slot 1 (sends its Response), slot 5 (hears the Final), slot 6 (sends its Report) — so it sleeps
through **six**. This is not a judgement call: the lesson's own table cell says `4 of 10 × 3`
(`:92`), its own body says "four wake-ups in ten slots" (`:95`), and the test pins the anchor's
non-idle slots as `[0,0,1,5,5,6]` (`test:395`) with the comment "deaf in slots 1–4 except its own,
and in slots 6–9 except its own" (`test:394`). A learner who counts gets a different answer from the
sentence two paragraphs later. Fix: "six" in EN and 六 in ZH; the word count does not move. While
there, "which slot to answer in" is singular but an anchor owns two slots (Response *i*, Report
5 + *i*) — "which slots to answer in" would be both shorter to defend and consistent with the table.

**2. `src/course/uwb/uwb-blocks.ts:95` (EN) and `:96` (ZH) — "Three rounds of that make 2 448 546 ns"
does not multiply out.** The sentence gives the per-round figure as 816 180 ns and then says three of
them make 2 448 546 ns, but 3 × 816 180 = 2 448 **540**. The 6 ns gap is real and understood — it is
the longer flight to the two off-centre phones, `uwb-2` (3, 2.5) and `uwb-3` (7.5, 6), in the anchor's
second and third rounds — and the test knows it, pinning `3 * 816_180 < 2_448_546` and the difference
as `< 200` rather than as an equality (`test:397-399`). So the measurement is right and the prose is
wrong, in a lesson whose whole rhetorical move is "to the nanosecond" (`:114`). Fix: either say what
the extra 6 ns is ("Three rounds of that, with a little more flight to the two phones off the ring's
centre, make 2 448 546 ns") or quote the per-round figure as the block average (816 182 ns) and say
the first round is 816 180. Any wording must respect the 16-word headroom noted in the file header,
and `test:381-399`'s quoted comment should be re-copied to match.

### Minor

**3. `src/course/uwb/uwb-blocks.ts:84` (EN) / `:85` (ZH) — "they differ tenfold" / "相差十倍" holds for
the tag only.** The sentence introduces both shares and then claims one ratio. Tag: 10 % → 0.97 % is
10.3×. Anchor: 30 % → 1.22 % is 24.6× (`test:341-343` against `test:351-354`). "Tenfold and more", or
"by one to two orders of magnitude", costs the same words and is true of both rows of the table it
introduces.

**4. `src/course/uwb/uwb-blocks.ts:110` (EN) / `:111` (ZH) — "what this model does not simulate …
the drift between devices whose clocks last agreed a block ago".** The model very much does simulate
crystal drift: `UwbClock.fromRng` draws ppm uniform in ±`UWB_PPM_MAX` when `ppm` is undefined, which
is exactly this scenario (`src/uwb/clock.ts:19-33`, `src/uwb/phy.ts:73`), and removing its effect is
the subject of lessons 2 and 3. What the model does not drift is the *schedule*: slot boundaries are
true-time and a `TX_START` is an exact multiple of `slotNs`, which the test pins (`test:301`). As
written the clause tells the learner the opposite of lesson 3. Fix: name the right thing — "and the
schedule drift this model does not have, because here a slot boundary is exact: 20 ppm across 200 ms
is 4 µs each way". The 4 µs arithmetic itself is fine and pinned (`test:454`).

**5. `src/course/uwb/uwb-blocks.ts:72` — "A fourth tag would cost nothing but round 3; the block
breaks only at the eleventh" is unpinned.** It is a claim about `ScenarioSchema`'s
`tags > fits` rule (`src/model/scenario.ts:413-421`), and it is true — `fits` is
`floor(240000 / (10 × 2400))` = 10 — but the test only pins `roundsPerBlock === 10` (`test:253`), and
the lesson's standard is that the schema is the oracle for every schema claim (it is, three paragraphs
later, for 282/285/300). Add one line to the existing `schemaIssues` helper's test: a scenario with
eleven tags produces the "the UWB block fits 10 tags" issue and one with ten does not.

**6. `tests/course/uwb-blocks.test.ts:278`, `:484` — three pins narrower than the sentence they
guard.** (a) "Each phone gets exactly one fix per block … once per block" (`:72`, observe `:136`) is
pinned for block 0 only; the run covers 300 ms, so `block === 1` has three fixes available and the
brief asked for "a `UWB_POSITION` for each tag every block". Assert the per-tag count for block 1 too.
(b) TryThis 1 says "each tag's radio-on still 1 934 334 ns" (`:140`) but the variant assertion covers
`uwb-1` alone (`test:484`); the base run does check all three (`test:363`), so mirroring that loop is
two lines. (c) TryThis 2's "type 285 into the slot field and leave it: it snaps to 300" is verified by
reading `UwbSessionFields.tsx:99-121` but nothing pins it; `to3(clampField('285', 300, 60_000, true))`
→ 300 is a one-line unit assertion and stops a future editor change from silently falsifying an
instruction the learner is told to carry out.

**7. `tests/course/uwb-blocks.test.ts` — the quoted comments no longer match the shipped strings.**
The file's own docblock promises "Each assertion quotes the sentence it guards, copied from the
shipped string", and that is the audit trail a reviewer reads; a late tightening pass over the prose
left roughly a dozen comments behind. Examples: `:250` "Ten rounds fit inside the block**,** and this
scene holds three tags" (shipped has no comma) and `:252` "Rounds 3 to 9 never open **at all**";
`:273` "Each phone **therefore** gets"; `:274` "at 20 ms **with a GDOP of** 1.06" vs shipped ", GDOP
1.06"; `:339` "**while** the anchors serve every round that has a tag **in it**" vs shipped "and …
that has a tag"; `:382` "**transmits** its Response … **transmits** its Report" vs shipped "sends";
`:384` "**entirely**"; `:421` "refused twice **over, once** by the floor **and once** by the fit rule";
`:441` "only **becomes the binding one** once the Final grows … 324 RSTU **and** past the floor" vs
shipped "only binds … , past the floor"; `:451` "leaves the Final **occupying** 11.8 %" vs shipped
"on 11.8 %"; `:482` "does not move **at all**"; `:168` "the RSTU **itself at** 416 chips" vs shipped
"fix the RSTU at 416 chips"; and `:475` quotes "the coloured spans are the same ten frames four times
closer together", a sentence that is not in the lesson in either place. Re-copy them from the source.

**8. `src/course/uwb/uwb-blocks.ts:140` — tryThis 1 does not say where "the session section" is.**
The plan line it tells the learner to read renders only inside the editor's Properties panel
(`src/uwb/ui/UwbSessionFields.tsx:81`, reached from `src/editor/FloorPlanEditor.tsx:480`). TryThis 2
gets this right ("Open the scenario editor, … read the UWB session section"); tryThis 1 comes first and
does not. Two words ("in the editor") fix it.

**9. `src/course/uwb/uwb-blocks.ts:115` (ZH) — one clause that is not in the EN.** The ZH of the
"Shorter slots" paragraph reads "…而不再是 20、40、60 ms，**而且还是同样的定位**：同样十帧，只是挨得更紧",
where the EN is "instead of 20, 40 and 60 — the same ten frames, closer together". The pair is
otherwise sentence-for-sentence across the whole lesson, and the extra clause is redundant with the
colon that follows it. Cosmetic; drop it if the paragraph is touched for finding 3 anyway.

## Claim → pin table

Every number and empirical sentence in the EN body, observe, tryThis and quiz. "§" rows are
provenance claims, checked against the branch's already-verified clause set rather than re-derived.

| # | Claim (uwb-blocks.ts line) | Pin | Status |
|---|---|---|---|
| 1 | IEEE Std 802.15.4-2024; §10.32.2; §10.29.1.5 + Table 10-145; §10.32.9.1 ARC; §10.32.9.8 RDM (`:57`) | `test:163-166`; corpus-verified set in `branch-review.md:97-99`, `README.md:66,73,74` | ✓ |
| 2 | "counts a block and a slot in whole 3-RSTU units" (`:57`) | `ScenarioSchema` `v % 3 === 0` (`scenario.ts:386-387`), `to3` (`UwbSessionFields.tsx:120`); `test:438-440` | ✓ |
| 3 | RSTU = 416 chips = 833.333 ns at 499.2 Mchip/s (`:57`) | `test:169-171` (`RSTU_CHIPS`, recomputed) | ✓ |
| 4 | 2 ms slot / 200 ms block are FiRa profile numbers (`:57`) | `test:167` (string); external provenance, correctly tagged as not the standard's | ✓ |
| 5 | 200 ns flight guard is the model's (`:57`) | `test:174-175` (`UWB_SLOT_GUARD_NS`) | ✓ |
| 6 | 300 RSTU floor is the schema's (`:57`) | `test:176-178` (`schemaIssues(297)` / `(300)`) | ✓ |
| 7 | nine anchors one Final can list (`:57`) | `test:179-180` (`UWB_MAX_ANCHORS`) | ✓ |
| 8 | "no backoff, no NAV, no retry" (`:61`) | `test:311-313` (0 `BACKOFF_DRAW` / `IFS_START` / `NAV_SET`) | ✓ |
| 9 | Block 240 000 RSTU = 200.0 ms (`:67`) | `test:225-227,244` vs `PLAN.blockNs`, `SESSION.blockRstu` | ✓ |
| 10 | Round 24 000 RSTU = 20.0 ms, 10 slots (`:68`) | `test:228-233,245` vs `uwbSlotsPerTag('ds',4)` | ✓ |
| 11 | Slot 2 400 RSTU = 2 000.0 µs (`:69`) | `test:230-231,246` vs `rstuNs` | ✓ |
| 12 | Ten rounds fit the block (`:72`) | `test:253` (`roundsPerBlock`) | ✓ |
| 13 | Rounds 0/1/2 → uwb-1/2/3 (`:72`) | `test:257-261` (`UWB_ROUND` node/round/ms) | ✓ |
| 14 | Rounds 3–9 empty = 140 ms (`:72`, observe `:130`) | `test:255,261` | ✓ |
| 15 | One fix per block, five a second (`:72`, observe `:136`) | `test:276,278` — block 0 only | ⚠ finding 6a |
| 16 | "a fourth tag costs round 3; the block breaks at the eleventh" (`:72`) | none (derivable from `roundsPerBlock` 10 + `scenario.ts:413-421`) | ⚠ finding 5 |
| 17 | Poll = 39 octets (`:76`, observe `:134`) | `test:321-322` (`uwbPollBytes(4)`) | ✓ |
| 18 | ARC IE 10 octets, "SP1 · DS-TWR · block 0 · round 0 · 4 responders" (`:76`, `:134`) | `test:326-328` (`ARC_IE_BYTES`, rendered value) | ✓ |
| 19 | RDM IE 15 octets, "4 devices: anchor-1 slot 1 …" (`:76`, `:134`) | `test:329-331` (`rdmIeBytes(4)`, rendered value) | ✓ |
| 20 | three octets per device (`:76`) | `test:333` (`rdmIeBytes(5) − rdmIeBytes(4)`) | ✓ |
| 21 | "which **seven** to sleep through" (`:76`) | `test:388-395` → awake in slots 0,1,5,6 ⇒ **six** asleep | ✗ finding 1 |
| 22 | TX_START = slot start; Polls at 0 / 20 000 000 / 40 000 000 ns (`:80`, observe `:132`) | `test:301-303` | ✓ |
| 23 | "the standard allows a transmission offset; this model uses none" (`:80`) | model side: `test:301`; standard side: §10.32.2 | ✓ |
| 24 | Schedule share 10 % (tag), 60 ms / 30 % (anchor) (`:84`, quiz 1 `:147`) | `test:341-343` | ✓ |
| 25 | "they differ tenfold" (`:84`) | tag 10.3×, anchor 24.6× (`test:341-343` vs `351-354`) | ⚠ finding 3 |
| 26 | Radio share = `MAC_STATE` uwbWait + rx + tx only (`:84`) | `radioOnNs`, `test:71-86` | ✓ |
| 27 | Table: uwb-1 · 1 of 10 · 10 of 10 · 1 934 334 ns · 0.97 % (`:91`) | `test:351,353,355-360` | ✓ |
| 28 | Table: anchor-1 · 3 of 10 · 4 of 10 × 3 · 2 448 546 ns · 1.22 % (`:92`) | `test:352,354,355-361` | ✓ |
| 29 | Receiver armed at slot start, off when the frame lands (`:95`, quiz 1 `:150`) | `test:388-393` (state trace, ns by ns) | ✓ |
| 30 | Tag takes part in all ten slots (`:95`) | `test:375-378` (total = whole-round airtime) | ✓ |
| 31 | 1 934 334 = 1 934 230 + 8 × 13 ns (`:95`, quiz 1 `:154`) | `test:369-379` | ✓ |
| 32 | Anchor: four wake-ups in ten slots, 816 180 ns, deaf elsewhere (`:95`, `:154`) | `test:385-395` | ✓ |
| 33 | "Three rounds of that **make** 2 448 546 ns" (`:95`) | `test:397-399` → 3 × 816 180 = 2 448 540 | ✗ finding 2 |
| 34 | Final = 62 octets at four anchors, 236 603 ns (`:99`) | `test:411-412` (`uwbFinalBytes`, `uwbPpduNs`) | ✓ |
| 35 | 200 ns guard = 60 m of flight (`:99`) | `test:416-417` (and the string itself via `prose()`) | ✓ |
| 36 | slot ≥ PPDU(Final,N) + 200 = 236 803 ns at N = 4 (`:103`, quiz 3 `:167`) | `test:407-414` (`uwbSlotFitNs`) | ✓ |
| 37 | 282 RSTU = 235.0 µs, refused twice (floor + fit) (`:106`, `:174`) | `test:425,428-432` | ✓ |
| 38 | 285 RSTU = 237.5 µs, clears fit by 697 ns, refused by floor alone (`:106`, `:167`, `:174`) | `test:426,433-435` | ✓ |
| 39 | 285 = 95 × 3; 282 also a multiple of 3 (`:174`, distractor `:169`) | `test:438-440` | ✓ |
| 40 | Shortest accepted slot = 300 RSTU = 250.0 µs (`:106`, `:171`) | `test:427,436` | ✓ |
| 41 | Fit binds first at six anchors: 267 572 ns = 324 RSTU (`:106`, `:174`) | `test:443-447` (incl. 321 too short, 1–5 anchors under the floor) | ✓ |
| 42 | "a short slot is caught before the run; at run time the deadline fires first and the log says only that nobody answered" (`:106`) | `src/uwb/phy.ts:159-160`, `scenario.ts:422-424` (engine's own rationale; unmeasurable because the schema refuses the scenario) | ✓ |
| 43 | Final occupies 11.8 % of a 2 ms slot (`:110`) | `test:453` | ✓ |
| 44 | 20 ppm across 200 ms = 4 µs each way (`:110`) | `test:454`; `UWB_PPM_MAX = 20` (`phy.ts:73`) | ✓ |
| 45 | "the drift … is what this model does not simulate" (`:110`) | contradicted by `clock.ts:19-33`; what is undrifted is the schedule (`test:301`) | ⚠ finding 4 |
| 46 | Variant: 600 RSTU → 5.0 ms round (`:114`, quiz 2 `:161`) | `test:463-464` | ✓ |
| 47 | Variant: all three tags done 15 ms in; fixes at 5 / 10 / 15 ms (`:114`, tryThis `:140`) | `test:468-471` | ✓ |
| 48 | Variant: 40 rounds fit where 10 did (`:114`, `:140`, `:161`) | `test:467` | ✓ |
| 49 | Variant: same ten frames, four times closer (`:114`, `:140`) | `test:473-478` | ✓ |
| 50 | Variant: radio-on unchanged, 1 934 334 ns = 0.97 %, to the nanosecond (`:114`, `:140`, `:161`) | `test:484-486`; round airtime equality `test:491-493` | ✓ |
| 51 | "each tag's radio-on still 1 934 334 ns" in the variant (`:140`) | `test:484` — `uwb-1` only | ⚠ finding 6b |
| 52 | Variant round share 2.5 % (ruling: schedule share) (`:114` context) | `test:489` | ✓ |
| 53 | Round log line "uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs" (observe `:130`) | `test:265` (`fmtRecord`), variant line `test:473-474` | ✓ |
| 54 | Rounds at 0/20/40 ms, repeat at 200/220/240 ms (observe `:130`) | `test:257-263` | ✓ |
| 55 | Three positions: (5.01, 3.99)/1.06, (3.01, 2.52)/1.08, (7.50, 6.01)/1.06 at 20/40/60 ms (observe `:136`) | `test:279-285` (`fmtRecord` lines verbatim) | ✓ |
| 56 | "Each phone is 2 cm out or better" (observe `:136`) | `test:286-294` (block 0 < 0.025 m; all fixes < 0.08 m as a reseed guard) | ✓ |
| 57 | "the session section plans 40 rounds per block instead of 10" (tryThis `:140`) | `test:467` + `i18n.ts:354` + `UwbSessionFields.tsx:81`; location of the panel not stated to the learner | ⚠ finding 8 |
| 58 | "slots per round 8 · rounds per block 12" after deleting an anchor (tryThis `:142`) | `test:500-503`; string format `i18n.ts:354`; deletion allowed `planOps.ts:266-271` | ✓ |
| 59 | DS round = 2N + 2 slots; 16 ms round; Final 12 octets shorter (tryThis `:142`) | `test:501-504` | ✓ |
| 60 | "type 285 into the slot field and it snaps to 300" (tryThis `:142`) | `UwbSessionFields.tsx:99-121` (`lo = 300`, clamp on blur, `to3`) — read, not pinned | ⚠ finding 6c |
| 61 | Quiz 2: radio-on does not fall to a quarter (distractor `:159`) | `test:484-485` (identical to the nanosecond) | ✓ |
| 62 | Quiz 3: the fit rule is computed from the Final, not the Poll (distractor `:170`) | `test:411-414` (`uwbSlotFitNs` = `uwbPpduNs(uwbFinalBytes(N)) + guard`) | ✓ |

## Re-review

Findings 1 and 2 are single-sentence prose edits plus the matching ZH and the two test comments;
findings 3–9 are small. None of them touches a scenario, so the two fixture hashes stay as they are
(`tests/engine/lesson-hashes.test.ts` hashes the replayed timeline, not the prose) — do **not**
regenerate them. Re-run `npx vitest run tests/course/uwb-blocks.test.ts
tests/engine/lesson-hashes.test.ts` and `npx tsc -b` afterwards, and keep `lessonWords` at or under
1724: it is 1708 today, and findings 1, 3 and 9 each free a word or two.

---

# Re-review (fix round 1)

Reviewed: commit `69ebb08` (package `task-5-fix1.diff`, `3f73852..69ebb08`) and the "Fix round 1"
section of `task-5-report.md`, against the nine findings above. Read only; no file was edited.
The commit touches exactly `src/course/uwb/uwb-blocks.ts` (24 lines) and
`tests/course/uwb-blocks.test.ts` (138 lines) — no scenario, no fixture, nothing of lesson 5's.

## Commands run

- `npx vitest run tests/course/uwb-blocks.test.ts` → **26 tests passed**, exit 0 (23 before, +3).
- Independent size measurement: `lessonWords(uwbBlocks)` = **1714**, `lessonMinutes(uwbBlocks)` =
  **25** — matching the report and the updated file header, 10 words under the pinned 1724 ceiling
  and inside the brief's [15, 25] band.

## Verdict

Spec: APPROVED
Quality: APPROVED

## Ruling by ruling

**Blocking 1 — "seven" → "six". Fixed.** `uwb-blocks.ts:76` now reads "which slots to answer in, and
which six to sleep through", `:77` "该在哪几个时隙作答，以及可以安睡过哪六个时隙". Both halves of the
finding were taken: the count and the singular "slot". It now agrees with the table cell
`4 of 10 × 3` (`:92`), with "four wake-ups in ten slots" (`:95`) and with the pinned non-idle slot
list `[0,0,1,5,5,6]`. The quiz distractor at `:151` still says "the block's **seven** empty rounds",
which is correct and unrelated — rounds 3 to 9 are seven.

**Blocking 2 — the three-round total. Fixed, and more thoroughly than asked.** The prose now reads
"four wake-ups in ten slots, 816 180 ns in the first — and is deaf through the other anchors' slots.
Three rounds, differing by nanoseconds of flight, make 2 448 546 ns" (`:95`), ZH "第一轮 816 180 ns …
三轮之间因飞行时间差着几纳秒，合计 2 448 546 ns" (`:96`). The test replaces the old inequality with
equalities: `radioOnNs` gained a `fromNs` window (documented as safe because every participant is
idle on a round boundary, which the pinned state trace shows), the per-round triple is asserted as
`[816_180, 816_194, 816_172]`, its sum as `2_448_546`, and the block total as the same number. I
checked the arithmetic: 816 180 + 816 194 + 816 172 = 2 448 546 exactly, and the two guard
assertions ("tens of ns apart", "not all equal") keep "differing by nanoseconds of flight" honest.
The claim a learner can check with a calculator now closes.

**Minor 3 — "tenfold". Fixed.** "tenfold and more" / "相差十倍以上", with a new test pinning the
ratios as measured quantities: tag 10.3×, anchor 24.5×, both ≥ 10, anchor > tag. The report is right
that my 24.6 came from dividing the rounded percentages; 60 ms / 2 448 546 ns = 24.505 → 24.5. The
measured figure is the correct one.

**Minor 4 — the drift sentence. Fixed.** "what this model leaves out: … and schedule drift — here a
slot boundary is exact, but 20 ppm across 200 ms is 4 µs each way" (`:110`), ZH
"以及调度本身的漂移——这里的时隙边界是精确的" (`:111`). It no longer contradicts `UwbClock.fromRng`,
and the new assertion pins every `TX_START` of the whole 300 ms run to an exact multiple of `slotNs`
directly under the sentence, which is the right oracle for "a slot boundary is exact".

**Minor 5 — the eleventh tag. Fixed.** `schemaIssues` takes an `extraTags` count and the new test
pins 4 tags clean, 10 tags clean, and 11 tags producing exactly the schema's own sentence
`the UWB block fits 10 tags at 10 slots each (found 11); lengthen blockRstu or shorten slotRstu`,
built from `PLAN.roundsPerBlock` and `PLAN.slots` rather than re-typed. The schema is the oracle, as
it already was for the slot lengths.

**Minor 6 — narrow pins. All three widened.** (a) the per-tag fix count is asserted for blocks 0 and
1, with the block-1 instants 220 / 240 / 260 ms; (b) the variant's radio-on is checked for all three
tags and against each tag's own base-run figure, not just `uwb-1`; (c) the editor snap is pinned as
`to3(clampField('285', 300, 60_000, true)) === 300` with `clampField` imported from
`src/editor/planOps`, plus the 282 case and the matching schema floor.

**Minor 7 — quoted comments. Re-copied.** I diffed every comment against the shipped string: the
twelve listed above now match character for character, including the stale "the coloured spans are
the same ten frames four times closer together", replaced by the two sentences that do exist. Two
test titles that quoted the old wording were updated with them.

**Minor 8 — tryThis 1. Fixed.** "the **editor's** session section" / "**编辑器里**会话那一栏".

**Minor 9 — the stray ZH clause. Dropped.** `:115` now runs "…而不再是 20、40、60 ms——同样十帧，只是
挨得更紧", sentence-for-sentence with the EN.

## EN/ZH parity and size

Every edited string was changed in both languages and nowhere else: six / 六, "tenfold and more" /
"十倍以上", "816 180 ns in the first" / "第一轮 816 180 ns", "Three rounds, differing by nanoseconds
of flight" / "三轮之间因飞行时间差着几纳秒", "what this model leaves out … a slot boundary is exact" /
"本模型略去的那些东西 … 这里的时隙边界是精确的", "the editor's session section" / "编辑器里会话那一栏".
No EN-only or ZH-only edit remains. `lessonWords` 1714 → `lessonMinutes` 25, ten words of headroom,
and the file header states 1714. No `any`, no `as unknown as`, no `@ts-` directive in either file.

## Residual observations (no action required, not findings)

- `uwb-blocks.ts:95`, "four wake-ups in ten slots, 816 180 ns in the first": in EN "the first" can be
  read for a beat as the first wake-up rather than the first round, until the next sentence says
  "Three rounds". The ZH ("第一轮") is unambiguous. Not worth one of the ten remaining words.
- `tests/course/uwb-blocks.test.ts` re-implements `to3` locally because it is private to
  `UwbSessionFields.tsx`. The load-bearing half of the claim — the 300 floor — comes from the real
  `clampField`, so the pin is sound; exporting `to3` some day would make it exact.

## Fixture

`tests/fixtures/lesson-hashes.json` is untouched by `69ebb08`, which is correct: the hashes cover the
replayed timeline, not the prose, and no scenario changed. The report's note that a full
`lesson-hashes` run currently fails only on lesson 5's three new keys is consistent with what I saw
before this round — `uwb-blocks` and `uwb-blocks#0` still carry `8c34bc07` / `b1d9cf3`.
