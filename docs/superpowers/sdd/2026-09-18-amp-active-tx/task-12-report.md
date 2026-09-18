# Task 12 report — lesson `amp-coexist` ("AMP and Wi-Fi share 2.4 GHz")

Branch `feat/amp-active-tx` in `D:\wifi_sim\.claude\worktrees\feat-link-2g`.
Commits: `b7a898c` (engine fix), `121e8f0` (the lesson).

## What was done

- `src/course/amp/amp-coexist.ts` — module 7 lesson, EN + ZH, 1968 EN words, 25 minutes.
  Exported `ampCoexistScenario({ protection, pollIntervalMs, polling, cam })`.
  Base scenario: `longApartment()`, `ampAp('ap','Router',3,4)` with defaults (100 ms, 4 slots,
  ACWE 2, `ctsSelf`) and features `{edca, txop, ampdu}`; camera `node('cam','Camera','sta',6,4,'he',…)`
  with `linkId: '2g'`; phone `node('phone','Phone','sta',12,4,'eht','video')` on 5 GHz; tags at
  (2, 2) and (4, 6). Variants: no protection; 20 ms poll; **Wi-Fi only** (no ampAp, no tags) as the
  throughput baseline. 5 jumps, 3 observe, 2 try-this, 3 quiz.
- `tests/course/amp-coexist.test.ts` — 28 `it`s, one per claim, each quoting the sentence it guards.
- `src/course/lessons.ts` — registered in `AUTHORED`.
- `tests/fixtures/lesson-hashes.json` — 4 keys added (`amp-coexist`, `#0`, `#1`, `#2`); `git diff`
  shows **additions only**, no existing hash moved.
- `src/engine/mac.ts` + `tests/engine/amp-ap.test.ts` — engine fix, see "Engine bug" below.

## Engine bug found and fixed (commit b7a898c)

`WifiMac.onRxOk` returned early for `ampResp`/`ampTrigger`/`ampAck` **before** the
"this is not the response I awaited → `failAttempt()`" check. `onRxStart` had already cancelled the
CTS/ACK timeout for that reception (§10.3.2.9), so a Wi-Fi station whose RTS ended just before an
AMP Ack was left in `waitCts` with `awaiting` set and no timer — permanently. In the lesson's
no-protection variant the camera stopped transmitting for good at 408 ms of a 2 s run; in the base
variant it stalled up to 100 ms at a time (until the next round's CTS-to-self happened to unstick it).

Fix: fail the attempt before the AMP-only branches return. Verified by reverting the fix and watching
the new regression test fail. No existing lesson timeline hash changed; all 744 tests pass.

Every measured number in this lesson was taken **after** the fix.

## Deviation from the brief

The brief's scenario line gives the camera profile `'backup'`, but `'backup'` maps to **AC_BK**
(`src/engine/traffic.ts:82`) — the same AC as the AMP round — which would erase the AIFSN 7 vs 3
contrast the brief's claim 2 and the design spec (`amp-tier-design.md` §Course 3: "a 2.4 GHz camera
uploads at AC_BE") both require. I used `'saturated'`, which is AC_BE and is a backlogged uplink,
matching the brief's own parenthetical "(saturated-ish upload at AC_BE)". Everything else in the
scenario is as specified.

## Measured values (2 s runs, seed 7)

Base (ctsSelf, 100 ms):
- 20 rounds, 20 CTS-to-self (14 B @ 6 Mb/s, 50 µs, Duration 4140 µs); round = 4190 µs.
- Camera NAV from **17 of 20** rounds. The 3 it misses are the 3 where its own RTS starts at the
  *same nanosecond* as the CTS-to-self (t = 0, 1 003 241.4 µs, 1 100 232.2 µs) — half-duplex.
- **9** camera frames start inside an uplink slot, all RTS, all inside those 3 rounds; 8 CTS timeouts.
- 80 slots: 44 empty / 32 one response / 4 both. 40 responses, **29 acked (72.5 %)**, per tag 15 / 14;
  8 lost to tag-tag collisions, 3 to the camera (3 `RX_FAIL` collision at the AP).
- Round delay from due: mean **5169.8 µs (5.17 ms)**, max **12 862 µs**, min 0.
- AMP air **30 440 µs/s = 3.044 %**; reservation 4190/100 000 = **4.19 %**.
- Camera **16 649 MSDUs = 99.89 Mb/s**; phone 2365 MSDUs = 13.24 Mb/s.

Other runs:
| Run | acked | cam frames in a slot | camera | phone |
|---|---|---|---|---|
| Wi-Fi only | — | — | 17 549 MSDU, 105.29 Mb/s | 2365 |
| ctsSelf 100 ms | 29/40 (72.5 %) | 9 | 16 649, 99.89 Mb/s (−5.13 %) | 2365 |
| none 100 ms | 7/40 (17.5 %) | 79 (first at 817 µs) | 15 680, 94.08 Mb/s (−10.65 %) | 2365 |
| ctsSelf 20 ms | 139/200 (69.5 %) | 33 | 12 901, 77.41 Mb/s (−26.49 %) | 2365 |

- `none`: 0 NAV, 25 `RX_FAIL` collision at the AP (vs 3), 78 CTS timeouts at the camera (vs 8).
- 20 ms: air 152 200 µs/s = 15.22 %; reservation 20.95 %.
- Try-this 2 (`cam` at (4, 5.6), `none`): 0 collision RX_FAILs, 26 readings acked (vs 7), but only
  35 AMP_RESULTs — five rounds in which a tag, deafened by the camera 40 cm away, never answers.
- Link budget: tag TX 0 dBm; at the camera the plant tag is −65.7 dBm and the window tag −71.7 dBm
  (band-neutral link table **plus** the `LINK_EXTRA_LOSS_DB['2g'] = −6.5` offset), both below
  `CCA_ED_DBM = −62` — which is *why* the camera's carrier sense does not see the slots, and why
  moving it beside a tag changes everything. Pinned in the test.

## Where the brief's expected claims did not hold

Measured, then pinned as measured, and the prose says so:
- Claim 1 "NAV_SET count = rounds" → 17 of 20.
- Claim 1 "no camera frame starts inside any slot with ctsSelf" → no *data* frame, but 9 RTS do.
- Claim 1 "every response acked unless two tags collided" → 3 more are lost to the camera.

This turned into the strongest section of the lesson ("CTS-to-self is an announcement, not a fence").

## Suites run

- `npx vitest run tests/course tests/engine/lesson-hashes.test.ts` — green.
- `npx vitest run` (whole repo) — **75 files, 744 tests, all pass**, output pristine.
- `npx tsc -b` — clean.
- `UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts` — diff is 4 added lines only.
- `tests/course/amp-intro.test.ts` passes (lesson 1 was committed as `a03c8de` / `f93c8e9` meanwhile).

## Self-review

- Every number in the prose, both languages, has an assertion; the table rows, the observe
  timestamps (111.914 ms, 817 µs, 883.111 µs), the try-this figures and the three quoted log lines
  are all pinned.
- Study time 25 min (1968 EN words, 3 observe, 2 try-this) — inside 15–25, asserted.
- All five jumps occur in the base run; the two the no-protection variant is there to show are
  additionally asserted in that variant.
- Quiz answers are consistent with the prose (AIFS 73/37, the three missed CTS-to-self, the untouched
  5 GHz lane).
- Probe files deleted; only the six intended files are in the two commits.

## Concerns

1. **The engine fix is outside the task's nominal file list.** It was a prerequisite: without it the
   `none` variant measures a permanently wedged station. It is committed separately so it can be
   reviewed (or reverted) on its own. It does change the base run's numbers versus a pre-fix
   measurement, so any earlier hand-measured figures for this scenario are stale.
2. **The `'backup'` → `'saturated'` deviation** (see above) should be confirmed by the controller.
3. The camera is a *fully backlogged* AC_BE uplink (~86 % of the air). That is a stress test, not a
   typical camera; the lesson says "as hard as the channel will let it" rather than claiming realism.
4. The three unprotected rounds and the 9 in-slot RTS are seed-dependent in their exact timestamps;
   they are pinned as exact values, so a future engine change that alters 2.4 GHz backoff will fail
   these tests loudly (intended).

---

# Fix round 1 — commit `8d6fb95`

`fix(course): amp-coexist — observe target, ZH split, pins; tighten the wedge regression test`
Files: `src/course/amp/amp-coexist.ts`, `tests/course/amp-coexist.test.ts`, `tests/engine/amp-ap.test.ts`.
The lesson-hash fixture is **unchanged** (`git status --short tests/fixtures/lesson-hashes.json` → empty).

## Item by item

**1. Observe #2 pointed at the wrong record (important).** Confirmed: in the no-protection run the
first `CTS_TIMEOUT` on `cam#2g` is at **73 µs** — its RTS started at 0 µs, at the same instant as the
trigger, with the router transmitting; slot 1 does not open until 628 µs. The in-slot RTS at 817 µs
produces the **second** timeout, at 890 µs, and the AP's `RX_FAIL` (collision) lands at 1156 µs.

Kept the jump (it is a correct "unanswered RTS" target in both runs) and reworded the observe step to
walk both events. Two new tests:
- `the jump the observe step uses really lands on the record the sentence describes` — resolves
  `ampCoexist.jumps[...].find` against the no-protection run, asserts the first hit is a
  `CTS_TIMEOUT` at 73 µs, that its RTS is the one at t = 0, that the trigger also starts at 0, that
  73 µs = RTS end + `ERP_2G.ackTimeoutNs`, and that `AMP_SLOT[0].t === 628 µs`.
- `the second timeout, at 890 µs, is the in-slot one` — 890 µs = the 817 µs RTS's end + AckTimeout,
  slot 1, one tag response in it, `RX_FAIL` reason `collision` at 1156 µs, closing Ack `dst === src`.

**2. ZH-only 50/50 split (important).** Removed. ZH now mirrors the EN's unquantified wording
("多出来的那部分来自两处：一是预留……二是它一头撞进去的那三个轮").

**3. Nine in-slot frames vs eight CTS timeouts.** Measured: the ninth in-slot RTS (at 1 103 144.2 µs)
has its attempt failed at 1 103 544.2 µs by the `RX_OK` of the round's AMP Ack — `RETRY` +
`CW_CHANGE`, no `CTS_TIMEOUT` (this is the engine fix from `b7a898c` doing its job). Prose now says
so in one clause, both languages. Pinned: 8 of the 9 RTS have a timeout at exactly
`end + ackTimeoutNs`; the odd one has an AMP `RX_OK` with a `RETRY` at the same instant and no
timeout in between; all nine double the camera's CW at the instant the attempt is given up.

**4. Saturated-camera simplification named** — new short paragraph after the scene: "The camera is a
stress load: it always has the next frame ready, so the round's cost shows up as lost throughput. A
lighter camera would pay the same microseconds in latency." (EN + ZH.)

**5. Wedge regression test tightened.** It now finds the first camera RTS whose CTS window is covered
by an AMP downlink PPDU (first `RX_OK` at `cam#2g` after the RTS is an `amp*` frame, with no timeout
before it) and asserts at that instant: exactly one `RETRY`, exactly one `CW_CHANGE`, **no**
`CTS_TIMEOUT` for that attempt, the camera's `MAC_STATE` is no longer `waitCts`, and it is still
entering `waitCts`/transmitting in the last tenth of the run. The `// so the camera's uplink
aggregates…` comment now correctly says the **AP** needs Block Ack. Re-verified by reverting the
`mac.ts` fix: the test fails on the `RETRY` assertion (`expected +0 to be 1`) and passes again with
the fix restored. Runtime cut from 7.7 s to 0.7 s by early-exiting the scan.

**6. Coordinates and "on time" pinned — and a claim corrected.** `(3,4) (6,4) (12,4) (2,2) (4,6)` are
now asserted. The prose said "Only the first round is on time"; measurement shows **two** of the
twenty leave exactly on the tick (index 0 at t = 0 and index 18 at 1.8 s). Prose corrected in both
languages; the test asserts the on-time indices are exactly `[0, 18]`, that `roundCts[18].t` is
1800 ms, and that no `BACKOFF_DRAW` exists at or before t = 0.

**7. ZH idiom.** 提高五倍 → 提高到五倍 (heading), 多五倍 → 变成五倍 (body). Removed the ZH-only
opening sentence of quiz 1's `explain` so it mirrors the EN.

**8. MSDU sizes from the engine.** New `mbps(rs, node)` helper sums `8 × ENQUEUE.bytes` over the
delivered `msduId`s; nothing re-types 1500 or 1400. The phone's 13.24 Mb/s is now asserted for all
four runs through the same helper.

Study time: 1981 EN words → 25 min (trimmed one redundant sentence, one formula note and a few
clauses to absorb the additions).

## Commands and output

- `npx tsc -b` → clean.
- `npx vitest run tests/course tests/engine/amp-ap.test.ts tests/engine/lesson-hashes.test.ts`
  → **17 files, 347 tests, all pass**.
- `npx vitest run` (whole repo) → **75 files, 745 tests, all pass** (one more than before: the
  observe-jump test split into two).
- `git status --short tests/fixtures/lesson-hashes.json` → no output (fixture untouched).
- Bug-catch check: with the `mac.ts` fix reverted,
  `npx vitest run tests/engine/amp-ap.test.ts` → 1 failed / 8 passed, on the new mechanism assertion.

## Remaining concerns

Unchanged from the first report: the `'backup'` → `'saturated'` profile deviation still wants a
controller ack, and the exact timestamps (73 / 817 / 890 / 1156 µs, the three unprotected rounds,
the on-time indices `[0, 18]`) are seed-dependent and pinned exactly, by design.
