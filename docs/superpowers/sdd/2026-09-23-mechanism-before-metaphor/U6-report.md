# U6 — `uwb-capstone` teaches the mechanism as a procedure

Files touched: `src/course/uwb/uwb-capstone.ts`, `tests/course/uwb-capstone.test.ts`. Nothing else.

## Budget line

```
uwb-capstone     picture  633/900 · numbers  548/550 · practice  330/450 · total 1511 (1511 words, 20 min)
```

No split needed. `numbers` is the binding section and sits two words under the
ceiling; the room for the `steps` block was bought by transposing the four-scene
table's labels, tightening the rubric cells and the two `numbers` paragraphs —
no mechanism was compressed out, and every pinned claim survived.

`lessonShapeSuite`'s declared `proseMax` moves 965 → 1185 (picture + numbers is
now 1181). That is the per-lesson declaration in this test file, not a contract
ceiling; `BUDGETS` is untouched and every `BUDGETS` assertion still passes.

## The procedure, and where in the engine it comes from

This is a project lesson, so the five steps are the **learner's method**, not the
engine's loop. Each one is carryable in the simulator exactly as it stands, and
each names the record, row or counter it is read from:

1. **Take the baseline.** Load the flat as it stands, open the phone's inspector:
   the position section prints the latest fix, the truth and the error between
   them (`uwbFixRow`, `src/uwb/ui/rows.ts` — `estimate`, `truth`, `error`,
   `gdop`, `ellipse`); the ranges table prints one row an anchor — measured,
   true, error, quality byte (`uwbRangeRows`).
2. **Find the one-sided error first.** Block after block, measured against true
   in that same ranges table. Two anchors stay within centimetres, `anchor-3`
   reads half a metre long every block, and its quality byte is `FOM_NLOS`
   against `FOM_LOS` (`src/uwb/phy.ts`; the delay is `UWB_NLOS_NS.brick`).
3. **Write the first table's figures down, then change one thing at a time** —
   one variant from the menu, never two. The three variants are the three
   decisions; the scenario builder is unchanged and controller-owned.
4. **Compare row against row.** A decision is priced by what it left alone as
   much as by what it moved.
5. **Hold the ranking against the brief, then hand in.** The four sentences,
   including what the flat does not model.

The four-scene table is now **transposed**: a row is a figure and names its
source (`UWB_POSITION` lines · lines naming three anchors · the inspector's
`UWB_TIMEOUT` counter · `UWB_INTERFERED` beside it · `TX_START` of the phone and
anchors · those frames' transmit time added up), a column is a scene. It is the
worked example the amendment asks for: the procedure run on four real scenes,
value by value. The three-range table's head names its source too ("Anchor, in
the phone's ranges table").

## Terms added

None. `brief` and `duty cycle` were already there; both are now **named where
they are pictured**, which is what rule 4 wanted:

- EN: "What you are working to is called the brief: …" (naming clause), and
  "What doubles is the share of the time the session spends transmitting, that
  is the duty cycle, …".
- ZH: 任务书（brief）— the bracketed name at the stand-in.

## Pointer phrase removed

`这笔账` in "decision two" (rule 1). The sentence now names the quantity and who
pays: 翻倍的只是会话真正在发射的时间占比，也就是占空比；而为它让路的吞吐量，是别人的。

Also, while in the ZH: five straight `"…"` quote pairs became full-width `“…”`.

## Pins added (`tests/course/uwb-capstone.test.ts`)

New describe, "the method the learner carries out":

- the `steps` block is five items and is the **last** block of `numbers` (and
  `deeper` carries no steps);
- step 1 against `uwbFixRow`/`uwbRangeRows` replayed through the player's own
  reducer (`initViewState` + `applyRecord`, the `inspectorAfter` helper borrowed
  from `uwb-geometry`'s test): the truth row is `(8.00, 4.00) m`, the estimate
  is the record's own `x`/`y` and the error is the distance between them — i.e.
  the figure the method calls the quality figure is the one the screen prints;
  the two counters exist on that panel and read 0/0 at the first block;
- step 2 against the run: every `anchor-1`/`anchor-2` error is under 5 cm and
  every `anchor-3` error over 0.5 m, and the inspector's own `fom` strings are
  `fomText(FOM_NLOS)` against `fomText(FOM_LOS)`;
- step 3: each record name in a table label is a record the run really carries;
- step 4: the fast block's air is > 1.8× the base and the three-range fix error
  moves by less than 5 cm.

The two four-scene-table tests now read the transposed table (`scene(i)`), same
figures, same run. The rubric's "The brief" row is repinned (below).

## What the engine contradicted

- **The residual.** The rubric asked the write-up to "report the residual".
  `solvePosition` computes one, no record carries it and no inspector row prints
  it, so the learner cannot read one off the screen. The row now asks for *the
  error the inspector prints* against the truth it prints beside it, a test
  asserts no `residual` appears anywhere in `picture` or `numbers` and that
  `UWB_POSITION` has no such key, and the `deeper` sentence that said "the
  residual the solver reports stays small" now says "nothing the inspector
  prints says so".
- **"Two wander either side of zero"** — my first draft of step 2. Not true:
  `anchor-1`'s five errors are all slightly negative (−0.002 … −0.044 m). The
  step says "Two stay within centimetres" instead, which is what the run shows.
- Left alone deliberately: the MMS slot floor stays "600 RSTU is the shortest
  slot this simulator allows an MMS round, because two slots must hold the
  round's longest narrowband message" (`src/uwb/session.ts`, `MmsRoundPlan`),
  and the one-to-many round still costs **more** transmissions (294 against 44),
  never fewer.

## Did not fit

Nothing was dropped. `numbers` is at 548/550, so the next change to this lesson
has to buy its words from somewhere.

## Verification

- `MECHANISM_INCLUDE=uwb-capstone READABILITY_INCLUDE=uwb-capstone npx vitest run tests/course/readability.test.ts` — 1018 passed (the three amendment rules were the three failures; all green).
- `npx vitest run tests/course` — 58 files, 2453 tests, all passed.
- `npx tsc -b --noEmit` — clean.
- Both dumps read end to end, EN and ZH.
