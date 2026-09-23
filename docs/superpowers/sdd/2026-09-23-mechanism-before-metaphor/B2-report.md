# B2 report — airtime, ifs, backoff, nav

Base commit de14765, branch feat/uwb-ranging.

Grading command, green on all four:

```
MECHANISM_INCLUDE=airtime,ifs,backoff,nav npx vitest run tests/course/readability.test.ts
→ 854 passed (854)
```

`npx tsc -b --noEmit` clean. `npx vitest run tests/course` is green except for three
lessons that are not mine and were being edited concurrently in this worktree
(`anomaly`, `hidden`, `retries-queues`, each over its own test's `proseMax`).
My four test files pass on their own: 63 passed.

---

## airtime

Budget line: `airtime picture 533/900 · numbers 434/550 · practice 291/450 · total 1258 (1258 words, 20 min)`
(was 529 / 176 / 291 / 996.)

**Procedure written** — `numbers`, "How the duration is worked out, step by step" /
«这个时长是怎么算出来的，一步一步», six steps, plus a six-row worked-example table
"The first data frame, value by value" that runs the same arithmetic on the run's own
frame and ends at 169.6 µs.

**Where it comes from in the engine**: `txTimeModeNs` in `src/engine/phy.ts`, line by line —

```ts
const nsym = Math.ceil((16 + 8 * lengthBytes + 6) / ndbps)
return m.preambleNs + (opts.mu ? m.muExtraPreambleNs : 0) + m.symNs * nsym
```

so the steps are: bytes on the air (1430) → bits with the 16 service and 6 tail bits
(11 462) → ÷ the rung's N_DBPS (`PHY_MODES.he.ndbps[11]` = 1950 at 20 MHz, one stream),
rounded **up** (6 symbols, the rounding being why the last symbol is part padding) →
× `symNs` 13.6 µs (81.6 µs) + `preambleNs` 44.0 µs = 125.6 µs. Then the same formula for
the answer at its own rate: the run's ACK goes out at 24 Mb/s (`RATES` N_DBPS 96), giving
two 4 µs symbols behind the 20 µs legacy preamble = 28 µs, plus the 16 µs SIFS.

**Terms added**: none (ACK, preamble, payload unchanged; the four-word opener cap still holds).

**Naming at the stand-in**: `a station (STA)` in the first picture paragraph;
`the access point (AP)` / 接入点（AP）in the watch block.

**Pins added** (`tests/course/airtime.test.ts`):
- `the steps are the engine’s own: bits, bits per symbol, symbols, preamble` — pins
  N_DBPS 1950, the 11 462-bit count, the ceil to 6, and then **proves the step order
  against `txTimeModeNs` over a spread of frame sizes** (14 … 3000 B) rather than
  asserting the one value.
- `the answer is timed by the same formula, two symbols at 24 Mb/s` — the run's ACK rate,
  `PHY_MODES.nonht` preamble/symbol, `RATES` N_DBPS 96, `txTimeNs(14, 24) === 28_000`.
- `lessonShapeSuite` raised to `proseMax: 1000, totalMax: 1300` (was 750 / 1000), with a
  comment saying why; still well inside the amended `BUDGETS`.

---

## ifs

Budget line: `ifs picture 600/900 · numbers 508/550 · practice 285/450 · total 1393 (1393 words, 25 min)`
(was 599 / 232 / 285 / 1116.)

**The existing steps block did not satisfy rule 3.** "One ladder, three rungs" listed the
three gaps in order of length — it is a ranking, not a procedure — so I changed its kind to
`list` (where it belongs, and it still closes the picture) and wrote the real procedure as a
six-step `steps` block in `numbers`: "How a station decides it may start" /
«站点怎么判定自己可以开口».

**Where it comes from in the engine**: `startAccessAc` → `beginIfsAc` → `onIfsEndAc` in
`src/engine/mac.ts`, plus `mediumBusy()` and `scheduleResponse`:

1. the question is only asked when `hasWork(e)`;
2. `mediumBusy()` is `ch.isCcaBusy(nodeId) || now < navUntil` — sensing **or** a NAV — and a
   busy medium sets `needDraw` on the spot;
3. the gap is `T.difsNs`, or `T.eifsNs − T.difsNs + aifs` when `corruptLast`, and
   `corruptLast` is cleared only when the station itself transmits (line 1037);
4. `const end = Math.max(t, this.lastBusyEndNs + dur)` — **idle time already elapsed counts**,
   and `lastBusyEndNs` starts at `NEVER = −10_000_000`, which is why this run's first frame
   leaves at t = 0 with a zero-length gap;
5. `onIfsEndAc` with `backoff === null && !needDraw` → `markReady` **with no draw at all**
   (basic access, §10.3.4.2);
6. `onCcaBusy`/`updateNav` cancel the IFS and set `needDraw`, so a deferred attempt must
   draw when the gap is walked again;
7. a response is not contended: `scheduleResponse` arms a `T.sifsNs` timer and transmits.

Steps 4, 5 and 6 (elapsed idle counting, basic access, the response bypassing contention)
are engine facts the old prose never stated. Nothing in the engine contradicted the old
lesson.

**Terms added**: none (slot, SIFS, DIFS, EIFS unchanged).

**Naming at the stand-in**: `A station (STA)` / 站点（STA）in `why`. (The lesson never says
"access point" on the main path, so that stand-in is vacuous here.)

**Pins added** (`tests/course/ifs.test.ts`):
- `silence already elapsed counts, so the very first gap is zero long` — exactly one
  zero-length `IFS_START`, at t = 0, kind DIFS; every other gap in the run is a full 34 µs.
- `an uninterrupted first gap is basic access: the frame goes out with no draw` — the first
  data frame precedes the first `BACKOFF_DRAW`.
- `the answer never contends: no gap is even started between the frame and its ACK` — for
  every one of the run's ACKs, exactly one SIFS after the data end **and** no `IFS_START`
  for that node in between.
- `lessonShapeSuite` `proseMax` 850 → 1150.

---

## backoff

Budget line: `backoff picture 540/900 · numbers 458/550 · practice 296/450 · total 1294 (1294 words, 25 min)`
(was 538 / 197 / 296 / 1031.)

**Procedure written** — `numbers`, "The draw and the countdown, exactly" / «抽数与倒数，精确版»,
seven steps.

**Where it comes from in the engine**: `Edcaf` init (`cw: params.cwMin`), `onIfsEndAc`
(`e.backoff = this.rng.int(e.cw)`, and `rng.int` is documented as *uniform integer in
[0, maxInclusive]* — so the draw is over [0, CW] **inclusive**, sixteen values at CW 15),
`onSlotTick`/`decrement` (one per idle slot of `T.slotNs` = 9 µs; DCF decrements at the end
of each idle slot, and transmits on the slot that reaches zero), `onCcaBusy` and
`updateNav` (both cancel the tick and emit `BACKOFF_FREEZE` at the current value),
`bumpQsrc` (`qsrc++`; `cw = min(2*cw + 1, cwMax)`, `CW_MAX` 1023; at
`SHORT_RETRY_LIMIT` = 7 the counter resets and `cw` drops back to `cwMin`), `resetQsrc` on
success, and `releaseTxop` / `failAttemptCore` (`e.backoff = null; e.needDraw = true` —
**post-transmission backoff**, §10.3.4.3).

Two engine facts the old prose did not state: the draw includes both endpoints (zero is a
legal draw), and every transmission owes a fresh draw, so nobody sends twice without
contending again. Nothing contradicted the old lesson.

**Terms added**: none (backoff, CW, ACK timeout unchanged).

**Naming at the stand-in**: `two stations (STA)` / 站点（STA）in `why`; `the access point (AP)`
in the watch block, and its Chinese bare `AP` became 接入点（AP）.

**Pins added** (`tests/course/backoff.test.ts`):
- `the window ladder is the engine’s: floor 15, twice plus one, ceiling 1023, reset at seven` —
  `CW_MIN`/`CW_MAX`/`SHORT_RETRY_LIMIT`, the **whole** ladder 15 … 1023 derived from the
  rule (not just the 15 → 31 this run reaches), and every `CW_CHANGE` of both stations
  checked to be either that widening or a reset to the floor.
- `the draw spans the whole window, both ends included` — at CW 15 the run's draws hit 0 and
  15 and cover all sixteen values.
- `every transmission owes a fresh draw: no station sends twice without one` — over the whole
  300 ms run, per station, allowing the first frame of an idle channel and retries of the
  same MSDU.
- `lessonShapeSuite` `proseMax` 800 → 1050.

---

## nav

Budget line: `nav picture 570/900 · numbers 422/550 · practice 257/450 · total 1249 (1249 words, 20 min)`
(was 569 / 177 / 257 / 1003.)

**Procedure written** — `numbers`, closing the lesson: "From a field in a header to a frozen
station" / «从帧头里的一个字段，到一台冻住的站点», seven steps.

**Where it comes from in the engine**: `buildDataFrame` writes
`duration = T.sifsNs + respTime` (the TXOP remainder instead, under multiple protection) into
`durationFieldNs`; an ACK is built with `durationFieldNs: 0`. On the receive side,
`onRxOk` routes a frame whose `dst` is somebody else to `updateNav`:

```ts
const until = t + frame.durationFieldNs
if (until <= this.navUntil || frame.durationFieldNs <= 0) return
```

— the later-of rule and the zero-Duration guard, both explicit. Setting it then freezes every
running counter (`BACKOFF_FREEZE`), cancels a gap in progress and sets `needDraw`, exactly as
`onCcaBusy` does. Access is gated by `mediumBusy()` = `ch.isCcaBusy(nodeId) || now < navUntil`,
which is the "NAV set versus a physically idle channel" question in one line. `onNavClear`
resumes access if sensing is idle.

The two early-release paths (`onCfEnd`, and the RTS early-release timer in `updateNav`) are
mentioned as "two ways, in a later lesson" rather than named: `RTS` and `CF-End` belong to
`hidden`, which comes **after** `nav` in `COURSE_ORDER`, so naming them would break the
acronym rule.

**Terms added**: none (Duration, NAV, virtual carrier sense unchanged).

**Naming at the stand-in**: `a station (STA)` / 站点（STA）in `why`.

**Pins added** (`tests/course/nav.test.ts`):
- `a countdown is only ever pushed further out, and never by an answer` — every `NAV_SET` in
  the run beats the value that node already held, and no `NAV_SET` has an `ack:` source.
- `while a countdown runs the station neither counts down nor transmits` — a sweep of the
  whole record stream: no `BACKOFF_DEC` and no `TX_START` for a node while its NAV is in the
  future. This is the "busy because you were told so" claim proved rather than asserted.
- `the countdown expiring is what restarts the gap` — a NAV_CLEAR for Talker A is followed at
  the same instant by an `IFS_START` in the majority of cases (it is not always, because
  sensing can still be busy at that instant — which is itself the rule).
- `lessonShapeSuite` `proseMax` 800 → 1000.

---

## Anything the engine contradicted

Nothing. In all four lessons the engine agreed with the old prose; what it added was detail
the prose had left out (listed per lesson above).

## Anything that did not fit

Nothing had to be dropped, and no lesson needed splitting: the widest is `ifs` at 1393 words
against the 1800 ceiling, with `numbers` at 508/550 its tightest section. If `ifs` is revised
again, `numbers` is the section with the least room left.

## Notes for the controller

- Other implementers were editing `radio-primer`, `frame-anatomy`, `anomaly`, `hidden` and
  `retries-queues` in this same worktree while B2 ran; the three `tests/course` failures in
  the full-suite run above are theirs, not B2's, and B2 staged only its own eight files.
- `ifs`'s picture block "One ladder, three rungs" changed kind from `steps` to `list`. It is
  a ranking of the three gaps, not a procedure, and it was passing rule 3 on a technicality.

---

## Fix round, 2026-09-23 — nav's bare 3

**Finding (Important)**: the last cell of `nav`'s "One long freeze, taken apart" table read
"and then A resumes at 3" / «之后 A 从 3 继续数». The 3 is Talker A's frozen backoff counter —
the idle slots it still owed when the air went busy — and no prose before the table said so.

**Fix** — `src/course/tier1/nav.ts`, that cell only:

> and then A resumes its backoff counter at 3 — the idle slots it still owed when the air went busy
> 之后 A 的退避计数从 3 继续——那是空口变忙时它还欠着的空闲时隙数

The number, the scenario, the fixture and every existing pin are untouched.

**Pin added** — `tests/course/nav.test.ts`, `the 3 is idle slots owed: A sends three slots
after it resumes`: the gloss is only true if those three are counted off as slots, so the
test checks that A's next frame starts exactly `3 × SLOT_NS` after the resume at 824 µs and
that the three `BACKOFF_DEC` records in between read 2, 1, 0. `proseMax` 1000 → 1050.

New budget line: `nav picture 570/900 · numbers 442/550 · practice 257/450 · total 1269 (1269 words, 20 min)`.

Verified: `MECHANISM_INCLUDE=airtime,ifs,backoff,nav npx vitest run tests/course/readability.test.ts`
→ 854 passed; `npx vitest run tests/course/nav.test.ts` → 14 passed; `npx tsc -b --noEmit` clean.

**Commit accident, reported per the brief's "leave it and say so"**: the fix commit
`70ed2be` carries eight files, not two. Another batch (B1: `radio-primer`,
`frame-anatomy`, `frame-anatomy-bytes` and their tests) had already staged its work in this
worktree's shared index, and `git commit` swept those staged paths in under my message.
Nothing was lost or overwritten — B1's content is intact and committed exactly as they
staged it — but it is filed under a `nav` message. I did not amend or reset, as the brief
forbids both. The controller may want to note this in the ledger, and B1 should be told
their work is already on the branch at `70ed2be`.

## Naming fix round (2026-09-23, after ef74e20)

Rule 4's checker had been blind (`\b` in a template literal), so B2 was reviewed
against a vacuous pass. With the checker fixed, these first uses named nothing and
were rewritten — one of the three admitted shapes each, in both languages:

- `airtime` · **MAC** — "Everything the MAC does is about who gets the next slice."
  → "Deciding who gets the next slice is the whole job of the MAC — the part of the
  radio that picks the moment to send." / 「下一段归谁，全由 MAC——射频里决定什么时候开口的那一部分——说了算。」
- `ifs` · **DIFS** — "a DIFS, which is the short gap plus two slots" → "that longer
  wait is the DIFS: the short gap plus two slots" / 「而这段更长的等待就是 DIFS：短间隙再加两个时隙」
- `backoff` · **backoff** (EN) — "a count of idle slots to sit through: its backoff"
  → "…to sit through; that count is the backoff"
- `backoff` · **CW** — "doubles its CW" → "doubles the top of the range it draws from
  (its contention window, CW)" / 「把自己抽签范围的上限（竞争窗口，CW）翻倍」
- `nav` · **NAV** (EN) — "starts a countdown, the NAV, including…" → "starts a
  countdown of its own (the NAV), including…"

One test comment was re-quoted to the new wording: `tests/course/ifs.test.ts`'s
"the picture's 'that longer wait is the DIFS: the short gap plus two slots'". No
number, scenario, variant, jump, fixture or pin changed.

**Budgets** (all well inside): `airtime` picture 547/900 · numbers 434/550 · total
1272; `ifs` 603 · 508 · total 1396; `backoff` 554 · 458 · total 1308; `nav` 573 ·
442 · total 1272.

**Gate.** `MECHANISM_INCLUDE=<the seven> npx vitest run tests/course/readability.test.ts`
878/878, the seven lesson test files 130/130, `npx tsc -b --noEmit` clean.
