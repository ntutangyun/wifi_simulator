# U2 — uwb-sstwr, uwb-dstwr, uwb-blocks

Base: 40bf57d. Grading command used throughout:
`MECHANISM_INCLUDE=uwb-sstwr,uwb-dstwr,uwb-blocks npx vitest run tests/course/readability.test.ts` — green (942/942).

---

## uwb-sstwr — "The clock inside the reply time"

Budget line: `uwb-sstwr  picture 634/900 · numbers 537/550 · practice 399/450 · total 1570 (1570 words, 25 min)`

**Procedure written** (`numbers`, 7 steps, "One range, step by step"). Source: `src/uwb/device.ts`
(`transmitFor` → `uwbPoll`/`uwbResp`, `onResponse`), `src/uwb/clock.ts` (`UwbClock.counter`,
`counterDiff`), `src/uwb/ranging.ts` (`ssTwrRaw`, `ssTwrCorrected`, `rctuToMetres`),
`src/uwb/device.report.ts` (`reportRange`) and `src/uwb/position.ts` (`rangeSigmaM`).

1. slot 0, the phone stamps its Poll's RMARKER on its own counter; every anchor stamps it arriving;
2. the anchor stamps its Response leaving, subtracts its own pair, writes Treply into the frame;
3. the phone stamps the Response arriving and subtracts its own pair: Tround — four stamps, two at
   each end, neither end subtracting the other's;
4. the same reception's carrier lock gives Coffs, −20.24 ppm here (20 ppm of crystal + the 0.2 ppm
   `cfoNoisePpm` residual);
5. halve the difference — 2028 counts raw, 734.6 corrected;
6. × one count (15.65 ps) × c → 3.45 m against a true 3.50 m;
7. what is reported: `UWB_RANGE` carries the corrected figure, the raw one beside it and a Figure of
   Merit byte — **no error bar**. The 1-σ the round's fix is weighted by is computed apart, from the
   timestamp noise alone: `rangeSigmaM` = c × 100 ps / √2 = 2.1 cm.

**Worked example table**: anchor 1, value by value — the four counters straight off the run's
`UWB_TS` records, the two differences, Coffs, and both half-differences in counts and metres.

**Terms added**: none (the five were already right; the cap is six).

**Naming fixed** (rule 4): `crystal`, `ppm`, `SS-TWR`, `Coffs` were each used before being named —
now `the crystal — the sliver of quartz a radio counts its time on —`, `parts per million (ppm)` /
`百万分之几（ppm）`, `single-sided two-way ranging (SS-TWR)` / `单边双向测距（SS-TWR）`, and
`its clock-offset estimate (Coffs)`.

**Pins added** (`tests/course/uwb-sstwr.test.ts`, new describe "the procedure, step by step", 7 its):
steps live in `numbers` and not `deeper`; the step order is the engine's; the four worked cells are
the run's own `UWB_TS` counters; Treply/Tround are `counterDiff`'s own output and Treply is one whole
2 ms slot; Coffs inverted out of the record agrees with the two crystals to inside 4× the estimator
residual; the two half-differences are `ssTwrRaw` / `ssTwrCorrected` and their metres `rctuToMetres`;
the count is `RCTU_NS` and metres = counts × RCTU × c **proven over every range of all three
variants**; and the record carries `fom` and no sigma field while `rangeSigmaM` is the 2.1 cm.

`proseMax` ratchet 1000 → 1180 (the amendment's 900 + 550 window; comment updated).

---

## uwb-dstwr — "Two round trips cancel the clock"

Budget line: `uwb-dstwr  picture 591/900 · numbers 547/550 · practice 399/450 · total 1537 (1537 words, 25 min)`

**Procedure written** (`numbers`, 7 steps). The old narrative `steps` block in `picture` became a
prose paragraph ("Three messages and a receipt"), so the one procedure sits where the brief asks.
Source: `src/uwb/device.ts` (`transmitFor` → `uwbFinal`/`uwbReport`, `onFinal`, `onReport`) and
`src/uwb/ranging.ts` (`dsTwr`).

Six stamps — anchor: rx Poll, tx Response, rx Final; phone: tx Poll, rx Response, tx Final — giving
four intervals, each glossed where it is used: `Treply1` (the anchor's wait), `Tround1` (the phone's
round trip), `Treply2` (the phone's wait), `Tround2` (the anchor's round trip). The Final carries
`Tround1` and `Treply2` per anchor; the Report carries `Treply1` and `Tround2`; the anchor finishes
at the Final and the phone at the Report, and **both lanes compute the same number to the last
digit**. The last step is the arithmetic: two products, one subtraction, one division by the sum of
all four — every product carries one interval from each end, so nothing is estimated and no clock
offset is read at all.

Cost in air and in time was already tabulated and survives unchanged (10 slots against 5,
1 934.23 µs of radiation, 9.67 % against 9.56 %, latency and wake-ups doubled).

**Worked example table**: anchor 1 — the six counters, the four intervals (each row naming and
glossing its interval), and the answer, 749.0 counts · 3.51 m, on either lane.

**Terms added**: none.

**Naming fixed**: `DS-TWR` → `Double-sided two-way ranging (DS-TWR)` / `双边双向测距（DS-TWR）`;
`Report` now introduced with a naming dash in the picture paragraph that first pictures it.

**Pins added** (new describe "the procedure, step by step", 5 its): the block is in `numbers` and its
order is the engine's; the six worked cells are the run's six `UWB_TS` counters and the two ends each
stamp three frames in the order named; the four interval cells are `fourTimes`' own `counterDiff`
output; the answer cell is `dsTwr` of those four and both lanes' records carry it identically; and
"no clock offset is read" is proved over **every** range of the run — `method: 'ds'`, no
`tofRawRctu`, and the four times alone reproduce `tofRctu`.

`proseMax` 1000 → 1150.

---

## uwb-blocks — "Blocks, rounds and slots"

Budget line: `uwb-blocks  picture 569/900 · numbers 548/550 · practice 360/450 · total 1477 (1477 words, 25 min)`

**Procedure written** (`numbers`, 6 steps, "How the timetable is written"). Source:
`src/uwb/session.ts` (`roundPlan`, `slotStartNs`, `slotAction`), `src/uwb/phy.ts`
(`uwbSlotsPerTag`, `rstuNs`), `src/uwb/network.ts` (`startBlock`, `runRound`) and
`src/uwb/device.ts` (`onSlot`, `listenFor`, `closeSlot`, `transmitFor`'s `uwbFinal`/`uwbReport`).

1. three lengths fixed before a frame flies — block 240 000 RSTU, slot 2 400 RSTU, and the slot
   count from the method, two per anchor plus two;
2. ten slots make a 20.0 ms round and a 200.0 ms block divides into ten rounds;
3. round k goes to phone k, in every block — rounds 0, 1, 2 here, the other seven never open;
4. a slot's start is one multiplication: block × block + round × round + slot × slot;
5. `slotAction` names the one transmitter (slot 0 Poll, the next four Responses in list order, the
   sixth the Final, the last four the Reports); everyone else compares that name with its own id and
   listens only for what is its own — an anchor's receiver is off through the other anchors' slots;
6. a device that armed its receiver and heard nothing gets **no retry**: the wait expires at the slot
   boundary, `UWB_TIMEOUT` records the slot, the peer and the frame expected, the round walks on, and
   the Final then leaves that anchor out.

**Worked example table**: phone 2's round — block 0 · round 1, opening at 1 × 20.0 ms, Poll in slot 0
at 20 000 000 ns, Final in slot 5 at 30 000 000 ns, round end and fix at 40 000 000 ns.

**Terms added**: none.

**Naming fixed**: `round`, `slot` and `block` were all used before being named (the rule reports
every unnamed term at once) — now `one phone's turn off the log (the ranging round)`,
`a slot (one line of the timetable)`, `The whole schedule is the block`.

**Pins added** (new describe "the procedure, step by step", 6 its): the block is in `numbers` and its
order is the engine's; step 1 against `uwbSlotsPerTag` / `rstuNs`; step 2 against every `UWB_ROUND`
of two blocks (`r.round === TAGS.indexOf(r.node)`); step 3 against **every** `UWB_SLOT` the run
emitted — each one's `t` equals `slotStartNs`'s arithmetic and each lasts exactly `slotNs`; steps 4
and 5 against the run's transmit order, the one-transmitter-per-slot invariant, and `radioOnNs`
measured slot by slot (zero through slots 2, 3, 4, 7, 8, 9; non-zero through 0, 1, 5, 6); step 6 on a
scene deliberately built to lose a frame (anchor 1 moved to x = 60 m) — `UWB_TIMEOUT` names the slot,
peer and expected frame, the round still runs its ten slots, the Final omits that anchor and the
anchor sends no Report; and the worked example against phone 2's own records.

To pay for the procedure inside the 550-word `numbers` budget (this lesson carries five tables) I
removed the "What owns it" column of the "Three nested clocks" table and the first clause of the
paragraph under it — both now said, in more detail, by steps 2, 3 and 5. No claim was lost and no
pinned cell moved.

`proseMax` 950 → 1130. (Also deleted a duplicated comment line above the shape suite.)

---

## CELL_RULE_CARRIES — both fixed, and the carries can be dropped

- `uwb-dstwr`: `Treply1` in the "Two halves and the answer" head is now glossed by the procedure's
  own steps, which are `paragraphTexts` of the same section (`Treply1 (its wait, Poll in to Response
  out)`), and again in the worked-example row labels.
- `uwb-blocks`: `SP1` is now glossed where it stands — the ARC IE cell became bilingual with
  `SP1（加扰时间戳序列分组）` in its Chinese half, which satisfies `definedInPlace` and, because the
  cell is no longer language-neutral, also clears the "neutral cell reads as English prose" rule.
  The second list's cell (`4 devices: anchor-1 slot 1, …`) got the same treatment, since it failed
  the prose rule too and would have turned red the moment the carry was lifted. **Both English
  halves are byte-identical to the inspector's own `arc.value` / `rdm.value`, so the existing pins
  that compare cell to inspector still hold.**

Verified by temporarily deleting both entries from `CELL_RULE_CARRIES` and re-running the suite
(942/942 green), then restoring the controller's file byte-for-byte. `git diff` on
`tests/course/readability.test.ts` shows only another agent's `MECHANISM_DONE` line, none of mine.

---

## The two standing corrections

- **One-to-many rounds with a pairwise variant** — untouched. None of my three lessons is one of the
  four 802.15.4ab lessons; `uwb-blocks` is a 4z DS-TWR session and says nothing about MMS.
- **The slot floor.** My reading of the code *differs* from the brief, so I changed nothing and am
  reporting it. `ScenarioSchema` (`src/model/scenario.ts:595`) puts `z.number().int().min(300)` under
  `slotRstu` for **every** session; the 600 RSTU figure is specific to MMS, where a second rule
  applies (`slotRstu % 300 === 0`, and two slots must hold the 608.2 µs narrowband REPORT — see the
  `fragGapNs` comment in `src/uwb/session.ts`), which makes 600 the shortest *legal MMS* slot.
  `uwb-blocks` is not MMS, so its `deeper`, `sources` and try-this correctly say 300 RSTU / 250.0 µs,
  and `tests/course/uwb-blocks.test.ts` pins that against the schema itself
  (`schemaIssues(300) === []`, `schemaIssues(297)` reports the ≥ 300 error, and typing 285 into the
  editor snaps to 300). I read the correction as being about the four 4ab lessons, where 600 is
  right; if the controller means it to cover 4z ranging rounds too, the schema disagrees and should
  be the thing that changes.

## Anything else the engine contradicted

Nothing else. One small wording reconciliation: the new picture paragraph of `uwb-dstwr` is headed
"Three messages and a receipt" rather than "four messages", so it no longer reads against the
lesson's own outcome ("name the three messages of a double-sided exchange") — the standard's
three-message computation plus the Report frame.

## Tests

- `MECHANISM_INCLUDE=uwb-sstwr,uwb-dstwr,uwb-blocks npx vitest run tests/course/readability.test.ts` — 942 passed.
- `npx vitest run tests/course/uwb-sstwr.test.ts` 38 passed · `uwb-dstwr` 45 passed · `uwb-blocks` 36 passed.
- `npx tsc -b --noEmit` clean.
- `npx vitest run tests/course` — 2299/2301; the one failing file is `uwb-coexist` (numbers 689/550),
  another implementer's lesson, in flight.
