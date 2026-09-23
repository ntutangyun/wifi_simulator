# C4 review — mlo, capstone

Reviewer pass over commit 877ec45, batch report `.superpowers/sdd/2026-09-23-mechanism-before-metaphor/C4-report.md`.
Read-only: no files edited, nothing committed. Verified against `git log` that
`877ec45` touched only `src/course/tier2/mlo.ts`, `tests/course/mlo.test.ts`,
`src/course/tier2/capstone.ts`, `tests/course/capstone.test.ts`, and the C4
report — confirmed by the diff of that commit and by the files this review
reads.

## Summary of method

1. Read `mlo.ts`/`mlo.test.ts` against `src/engine/simulation.ts` (`primaryVid`,
   `primaryMac`, `pokeAccess`), `src/engine/mac.ts` (`pokeAccess`, `claim`,
   `failMsdus`, `bumpQsrc`, `assignSeq`), `src/engine/queues.ts` (`AcQueues`),
   and the constants in `src/engine/phy.ts`.
2. Reproduced the worked example directly: ran `mlo.scenario()` through
   `Simulation.runUntil(300ms)` in a scratch script and checked every one of
   the five rows' timestamps, node ids, byte counts, MCS and MSDU-id ranges by
   hand against the emitted `TLRecord`s. All five rows reproduced exactly as
   written, including the 88 µs BACKOFF_DEC gap.
3. Confirmed the `deeper` caveat: ran a DROP-record scan over the same 300 ms
   run (0 drops) and read `failMsdus`/`AcQueues.restore` to see how a
   cross-link retry would actually work if one occurred.
4. Read `capstone.ts`/`capstone.test.ts` as a learner would carry out the
   method, checked the scenario's node generations, and confirmed the three
   "candidate changes" are the same edits the test's `mod()` closures make
   (`profiles = ['idle']`, `caps.features.mlo = false`,
   `caps.generation = 'he'; caps.features.ofdma = true`).
5. Ran both dumps in both languages: `npx tsx scripts/lesson-dump.ts mlo en|zh`
   and `capstone en|zh`. Read end to end.
6. Ran `MECHANISM_INCLUDE=mlo,capstone npx vitest run tests/course/readability.test.ts tests/course/mlo.test.ts tests/course/capstone.test.ts`.

## Findings

### Important — mlo, step 6: the procedure states an unconditional queue-return that the engine does not always do

**Lesson text** (`src/course/tier2/mlo.ts:127`, `numbers`, steps block, step 6):

> "Unacknowledged, each takes one retry against a limit of 7 and the set
> returns to the front of the shared queue — so the retry falls to whichever
> link reaches zero next, not necessarily the one that failed."

(ZH, line 128: "没等到确认，每一帧记一次重传（上限 7 次），整批退回同一条共享队列的队首——于是这次重传落在下一个数到零的链路头上，未必是刚刚失败的那条。")

**What the engine does** (`src/engine/mac.ts:1114-1133`, `failMsdus`):

```ts
for (const m of msdus) {
  m.retries = (m.retries ?? 0) + 1
  if (m.retries >= SHORT_RETRY_LIMIT) {
    this.emit({ ..., type: 'DROP', ..., reason: 'retryLimit', ... })
    this.emit({ ..., type: 'DEQUEUE', ... })
    this.hooks.onDequeue?.(m.id, false)
  } else {
    keep.push(m)
  }
}
if (keep.length) this.queues.restore(ei, keep)
```

An MSDU whose retry count reaches `SHORT_RETRY_LIMIT` (7) is **dropped and
permanently dequeued**, not returned to the queue. Only the subset that has
not yet reached the limit ("keep") is restored to the front. The lesson's "the
set returns to the front of the shared queue" describes the whole failed
batch returning, with no mention of the drop branch — so as a general
statement of "how a frame gets a link, step by step" it is not the procedure
the engine runs; it is the procedure the engine runs *only when no member of
the failed batch has exhausted its retries*.

This 300 ms run never exercises the drop branch (`DROP` record count is 0),
so the worked example does not contradict it, and the pinned unit test
(`tests/course/mlo.test.ts`, "step 6 — a failed set goes back to the FRONT of
the same shared queue") only ever restores two fresh MSDUs (retries never
incremented), so it cannot catch the gap either. But the step block is written
as the general rule ("How a frame gets a link, step by step"), not as "in this
run", and as written it is wrong for the case the engine explicitly codes for
using the same constant (7) the lesson quotes.

**What it should say instead**: name the drop branch alongside the restore,
e.g. "...each takes one retry; the one in seven that would exceed the limit
is dropped instead and permanently dequeued, and the rest of the set returns
to the front of the shared queue." (Wording is illustrative — the point is
the branch must appear, not the exact phrasing.) A cheap way to pin it: add a
unit test on `AcQueues`/`failMsdus`-equivalent behaviour (or a targeted
engine test) that pushes a frame to its 7th retry and asserts it is dropped,
not restored — mirroring the existing "front of queue" test but on the
drop path.

### Minor — mlo: "station" appears once, unglossed, where every other lesson glosses it at first use

**Lesson text** (`src/course/tier2/mlo.ts:103`, `numbers`):

> "...and the two stations end up level..."

(ZH, line 104: "...最后两台站点各自发出的帧数一样多...")

This is the only occurrence of "station"/"站点" in the lesson, and it carries
no `(STA)`/`（STA）` gloss. The batch report notes only that `AP` was added at
first mention; it does not mention `STA`. Every other lesson in the tree that
uses the word glosses it at its own first use — e.g. `airtime.ts:45` ("a
station (STA) does not buy bandwidth"), `anomaly.ts:23`, `backoff.ts:21`,
`hidden.ts:26`, `ifs.ts:19`, `nav.ts:20`, `bianchi.ts:62`,
`bianchi-vs-sim.ts:56`, `frame-anatomy.ts:126` — each re-introduces `(STA)` on
its own first mention, independent of whether an earlier lesson already
glossed it. The batch brief's naming rule ("the first 站点 / 'station' carries
（STA）") reads as a per-lesson requirement, matching that precedent, and mlo
is the one place in this batch that skips it.

**What it should say instead**: "...and the two stations (STA) end up
level..." / "...最后两台站点（STA）各自发出的帧数一样多..." — or move the
gloss to wherever "station" would naturally read first if the sentence order
changes. Free of charge: this does not need new budget, since it replaces
nothing and the acronym linter (`acronyms()` in `src/course/readability.ts`)
does not currently catch this case (it only fires on a literal `STA` token
appearing unglossed, not on the plain word "station"), so this was not caught
by `MECHANISM_INCLUDE=mlo,capstone npx vitest run tests/course/readability.test.ts`.

## Everything else checked clean

- **mlo procedure vs. engine** (review item 1): steps 1–5 and the non-drop
  half of step 6 all match the code, in the code's order, with its constants
  (`MAX_AMPDU_MPDUS = 64` at `phy.ts:325`, `SHORT_RETRY_LIMIT = 7` at
  `phy.ts:41`, the shared `AcQueues` per physical node at
  `simulation.ts:118-123`, `primaryVid`/`primaryMac` at
  `simulation.ts:300-306`, `pokeAccess` waking siblings at
  `simulation.ts:318-321` and `mac.ts:373`, `AcQueues.claim` at
  `queues.ts:98-120`, `AcQueues.nextSeq` at `queues.ts:33-38`).
- **Worked example** (review item 2): all five rows of "MSDU 66 through those
  steps" reproduce exactly against a fresh run — 4.424 ms ARRIVAL+ENQUEUE on
  `sta-1` (id 66, 1500 B, depth 1); 4.512 ms TX_START on `sta-1#6g` (ids
  66–85, 30,718 B, MCS 13); the same-instant BACKOFF_DEC on `sta-1` at value
  2 (88 µs behind); 6.0176 ms BlockAck TX_START on `ap#6g` (32 B); 6.0496 ms
  twenty DEQUEUEs on `sta-1#6g` with none of 66–85 ever appearing on 5 GHz.
- **The `deeper` caveat** (review item 3): confirmed 0 `DROP` records and 0
  cross-lane MSDUs in the 300 ms run; the "why a failure on one link can be
  retried on the other" paragraph is written as a structural fact about the
  shared `AcQueues` (no mention of the timeline, no invitation to "watch"),
  and its test pin (`tests/course/mlo.test.ts`, "step 6 — a failed set goes
  back to the FRONT of the same shared queue") is a synthetic `AcQueues`
  unit test, not a run assertion. This satisfies the instruction to keep the
  claim at the queue level.
- **capstone as a learner's method** (review item 4): all three edits in step
  3 are exactly what `tests/course/capstone.test.ts`'s `backupStopped`,
  `radioOff` and `tabletNew` scene modifiers do, so each is carriable in the
  simulator/editor as described. The four-way table's rows each name their
  lane and counter ("bytes delivered on lanes ap and ap#6g", "mean receive
  wait, lane sta-2", "mean receive wait, lane sta-4", "mean send wait, lane
  sta-3") and are pinned cell-by-cell against `air`/`rxWait`/`txWait`/`upMb`
  in the test. `sta-5` is confirmed the only `nonht` node (oldest radio) and
  `sta-4` (tablet) is `vht`; `capstone.variants` is `undefined`, confirming
  the three options are editor edits, not loadable variants.
- **Beginner read, both languages** (review item 5): read `mlo` and
  `capstone` end to end in `en` and `zh` via `lesson-dump.ts`. No sentence
  stopped comprehension; no quantity is pointed at without being named at the
  same spot; no banned pointer phrase (这笔账/留在手里/不含余量的那个要求/之类/
  "kept in hand"/"head arithmetic"/"the bare requirement") appears in either
  lesson.
- **Rules and pins** (review item 6): `MECHANISM_INCLUDE=mlo,capstone npx
  vitest run tests/course/readability.test.ts tests/course/mlo.test.ts
  tests/course/capstone.test.ts` → mlo.test.ts 28/28 and capstone.test.ts
  23/23 pass; the single readability.test.ts failure (`bianchi-vs-sim`,
  numbers 577/550) is pre-existing, unrelated red from another in-flight
  change to `src/course/tier1/bianchi.ts` (uncommitted in this worktree,
  confirmed by `git status`/`git log` — not touched by 877ec45). New pins are
  derivations over the run (e.g. "no MSDU carried by both lanes" checked
  across 300+ MSDUs, the `AcQueues.claim`/`restore` unit tests) rather than
  constants copied from prose. Both lessons sit within the 550-word `numbers`
  ceiling (547/550, 549/550) — no split needed, and neither the Important nor
  the Minor finding above requires new prose long enough to force a trade
  against the ceiling (a short clause added to step 6, and one `(STA)`
  parenthetical, both fit inside the remaining 1–3 words without extra
  padding — this may still require trimming a word or two elsewhere in
  `numbers`; the report already flags both lessons as one or two words under
  the ceiling).

## Verdict

NEEDS FIXES: 1 Important, 1 Minor.

Worst finding: mlo's step 6 states as a general rule that a failed batch of
frames "returns to the front of the shared queue," but `failMsdus`
(`src/engine/mac.ts:1114-1133`) drops any frame that reaches the
`SHORT_RETRY_LIMIT` of 7 instead of restoring it — the same constant the
lesson quotes — so the procedure the lesson teaches is not, in that case, the
procedure the engine runs.
