# B2 review — airtime, ifs, backoff, nav

Reviewer: read-only, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, commit
6041b35 on `feat/uwb-ranging` (base de14765). No files edited, no git state changed.

## 1. Procedure vs. engine

Checked all four `steps` blocks against the engine code that actually owns the
decision:

- **airtime** — `txTimeModeNs` in `src/engine/phy.ts:236-243` and `txTimeNs` at
  `phy.ts:103-106`. Every step (bytes → bits with 16 service + 6 tail bits →
  ÷ N_DBPS rounded up with `Math.ceil` → × symNs + preambleNs → same formula
  for the ACK at 24 Mb/s, N_DBPS 96) matches the code's order and constants
  (`HE_NDBPS[11] = 1950`, `symNs = 13_600`, `preambleNs = 44_000`, ACK preamble
  20 000 + 2×4000 = 28 000). No disagreement.
- **ifs** — `startAccessAc` / `beginIfsAc` / `onIfsEndAc` in `src/engine/mac.ts`
  (lines 386-461 and around 1004/1037). Confirmed: `mediumBusy()` is
  `isCcaBusy() || now < navUntil` (mac.ts:386-388); elapsed idle counts via
  `Math.max(t, lastBusyEndNs + dur)` (mac.ts:436), with `lastBusyEndNs` seeded
  at `NEVER` so the first gap is zero (mac.ts:122, 432-435); basic access is
  `backoff === null && !needDraw → markReady` with no draw (mac.ts:449-453);
  the response bypasses contention (`scheduleResponse`, SIFS timer). All seven
  steps of "How a station decides it may start" are steps the code takes, in
  the code's order. No disagreement.
- **backoff** — `Edcaf` init (`cw: params.cwMin`, mac.ts:237), `rng.int(e.cw)`
  (mac.ts:455) against `Rng.int`'s own doc comment "Uniform integer in
  [0, maxInclusive]" (`src/engine/rng.ts:26-28`) — confirms the draw is [0, CW]
  inclusive; `onSlotTick`/freeze at `onCcaBusy`/`updateNav`; `bumpQsrc`
  (mac.ts:1090-1099, `cw = min(2*cw+1, cwMax)`, reset at `SHORT_RETRY_LIMIT`);
  `CW_MIN = 15`, `CW_MAX = 1023` (`phy.ts:38-39`). All seven steps match. No
  disagreement.
- **nav** — `updateNav` (mac.ts:1568-1607): `until = t + frame.durationFieldNs`,
  the later-of guard `if (until <= this.navUntil || frame.durationFieldNs <= 0)
  return`, freezing running counters and gaps, `mediumBusy()` reused. All seven
  steps of "From a field in a header to a frozen station" match the code's
  order and the code's guard conditions exactly. No disagreement.

No step in any of the four lessons tells a story the code does not follow.
B2's report's engine citations are accurate.

## 2. Beginner read, both languages

Read all four dumps (`en` and `zh`) end to end as someone who has only the
earlier Tier‑1 lessons. Three of four read cleanly, no stalls, no English word
order in the Chinese, correct full-width punctuation, and every quantity used
on the main path is introduced before use — with one exception:

**Important — `nav`, "One long freeze, taken apart" table, last cell.**
> en: `Total | 326 | and then A resumes at 3`
> zh: `合计 | 326 | 之后 A 从 3 继续数`

This is a bare, unglossed quantity — exactly the defect class the amendment
exists to remove. Nowhere earlier in the lesson (picture, numbers, or the
"From a field in a header to a frozen station" steps) does the prose say that
Talker A's backoff counter had reached 3 when it froze, or that "3" means
"three idle slots still owed." A reader hits this cell having been told the
total freeze lasts 326 µs and then, with no antecedent, is told "A resumes at
3" — a number with no stated unit or referent. It is pinned correctly against
the engine (`tests/course/nav.test.ts:129-141`, `freeze.value` and
`resume.value` both `3`, from a real `BACKOFF_FREEZE`/`BACKOFF_RESUME` pair),
so the number itself is not wrong — the prose simply never names what it is.
Fix: state A's frozen counter value the first time it is used, e.g. "and then
A resumes its countdown at 3 — the three idle slots it still owed when B's
frame interrupted it," in both languages, or drop the bare "at 3" from the
table and only state it once the reader has been told what it counts.

No other stalls found. `airtime`, `ifs`, and `backoff` read as intended in
both languages: no pointer phrases, no anaphora-only Chinese, terms used are
either defined in this lesson's `terms` or an earlier lesson's (SIFS/DIFS/EIFS
in `ifs`; CW/backoff/ACK timeout in `backoff`; Duration/NAV/virtual carrier
sense in `nav`; ACK/preamble/payload in `airtime`).

Minor observation, not a defect: in `ifs`'s "One ladder, three rungs" the
kind was correctly changed from `steps` to `list` per the B2 report — verified
in the file, and it reads as a ranking, not a procedure, which is correct.

## 3. Pins

`git show 6041b35 -- tests/course/{airtime,ifs,backoff,nav}.test.ts`: the only
deleted (`-`) lines across all four files are import-statement lines (widened
imports) and the old `lessonShapeSuite(...)` budget calls, replaced by wider
budgets in the same commit. No pinned assertion (`it(...)` block or `expect`)
was removed. Every pre-existing pinned claim survives.

The new procedure/worked-example pins are proofs against the engine or the
run, not constants copied from prose:
- airtime: `txTimeNs` checked across a size sweep (14…3000 B), not just the
  one worked value; ACK formula checked via `PHY_MODES.nonht` + `RATES`.
- ifs: zero-length first gap, basic-access-with-no-draw, and "no IFS_START
  between frame and ACK" are all swept over the whole run's records.
- backoff: the CW ladder is derived from `CW_MIN`/`CW_MAX`/`SHORT_RETRY_LIMIT`
  and checked against every `CW_CHANGE` event in the run, not just the one
  ladder step reached; the draw's inclusive range is checked by observing 0
  and CW both drawn in the run.
- nav: the "later-of, never pulled back" rule and "busy while NAV runs, never
  transmits" are swept over the whole record stream, not asserted once.

This matches the brief's instruction to prefer proving a claim over asserting
it.

## 4. Rules

```
MECHANISM_INCLUDE=airtime,ifs,backoff,nav npx vitest run tests/course/readability.test.ts
```
854 tests, 853 passed, 1 failed: `retries-queues` (`numbers: expected 552 to
be less than or equal to 550`) — not one of B2's four lessons, owned by a
different batch in flight per the dispatch's instruction to ignore it.

```
npx vitest run tests/course/airtime.test.ts tests/course/ifs.test.ts tests/course/backoff.test.ts tests/course/nav.test.ts
```
63/63 passed, all four files green on their own.

## Summary

One Important finding (the unglossed "3" in `nav`'s freeze-breakdown table,
both languages) and no Minor findings. Everything else — engine fidelity,
budgets, pins, and the readability/unit test suites for these four lessons —
checks out.
