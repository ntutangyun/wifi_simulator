# Task 2 report — Channel physics for excitation PPDUs and backscattered replies (AMP slice 2)

**Commit:** `f5d36e8` — `feat(amp): the channel radiates excitation at two powers and hears backscatter against the reader's own leakage`
**Branch:** `feat/uwb-ranging` (worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`)
**Parent:** `4299134` (Task 1's review fixes, committed by the other agent while I worked — my tree
was rebuilt and re-tested on top of it before committing)
**Status:** DONE_WITH_CONCERNS (three deviations from the letter of the brief, all argued below;
nothing left broken)

---

## What I built

Everything is in `src/engine/channel.ts`. `src/engine/phy.ts` was not touched: no helper belonged
there. No other file changed.

### Per-instant transmit power

```ts
export function bsDataEndNs(frame: FrameDesc): Ns | null
export function txDbmAt(frame: FrameDesc, offsetNs: Ns): number | null
```

`bsDataEndNs` measures the end of AMP-Data **forward** from the start of the PPDU —
`AMP_LEGACY_PREAMBLE_NS + wupNs + AMP_BS_DL_SYNC_NS + ampBitsNs(ampRfidBytes(cmd) · 8, 250)` —
rather than backward from `txTimeNs`, because the signal extension is a property of the *link*
(`PhyTiming.signalExtNs`) and is not carried on the frame. For the pinned Query-with-1 ms-WUP
PPDU that is 1 368 000 ns, leaving exactly the 142 400 ns BST and the 6 µs extension inside the
1 516 400 ns total (asserted in the tests).

`txDbmAt` returns `chargeDbm` before that instant and `bsDbm` from it to the end of the PPDU, and
`null` for every other frame — a frame that radiates one power throughout does not carry it, so
the caller uses the EIRP it already has. The three consumers of the brief: (a) the reply path uses
it (below); (b) Wi-Fi energy detection still takes the link-table value, i.e. max over the PPDU,
which the brief explicitly allows; (c) the `Spectrum` emission is unreachable on 2.4 GHz and is
untouched.

### Geometry for the links that are not Wi-Fi links

```ts
export interface BsGeometry { posOf: (id: string) => Vec3; walls: Wall[] }
new Channel(q, now, linkTable, emit, spectrum?, bsGeometry?)   // 6th arg, optional
```

A new optional constructor argument, in the shape of the existing `ChannelSpectrum` hook. The
channel computes `bsPathLossDb(FREQ_24G_MHZ, d, wallLossDb(a, b, walls))` itself and memoises it
per ordered pair (nodes do not move during a run). Absent it, any backscatter power query throws
`channel: a>b needs backscatter geometry` — loud, because a silent −200 dBm would look like a
physics result. Every link that existed before this slice passes no geometry and never asks.

`private rxDbmOf(tx, rxId)` is now the single answer to "what does this PPDU deliver here", and
replaced `linkDbm` at all five power call sites (arrivals, `othersMw`, `interferenceMw`,
`overlappersOf`, `updateAllCca`). It falls through to `linkDbm` for everything except:

- an `ampRfid` at a `'bsTag'` → `txDbmAt(frame, 0) − bsPathLossDb(...)`, i.e. Friis at `chargeDbm`;
- an `ampBsReply` at **any** receiver → `incidentDbm − AMP_BS_LOSS_DB − bsPathLossDb(tag→rx)`.

A Wi-Fi radio receiving an `ampRfid` goes down the unchanged branch: link table, `CCA_PD_DBM`,
`sinrThreshDb(6)`, busy for `txTimeNs`. That is asserted, not assumed.

### The `'bsTag'` radio

`RadioOpts.kind` / `RadioState.kind` gain `'bsTag'`. `register` defaults such a radio's
`floorDbm` to `AMP_BS_ACTIVATION_DBM` (−20 dBm) instead of `AMP_TAG_DL_SENS_DBM`. `detectFloorDbm`
(now a method, because a reply's floor depends on the receiver's own transmission) returns the
tag's floor for an `ampRfid` and **null for everything else** — no Wi-Fi PPDU, no Active Tx AMP
PPDU, no other tag's reply. `decodeThreshDb`'s DL branch became `r.kind !== 'wifi'`, so a bsTag
needs `AMP_DL_REQ_SINR_DB` against Wi-Fi interference exactly as an Active Tx tag does. It emits
no CCA (registered `cca: false`, as today's tags are).

### The reply, and the reader's own leakage

- `fillIncidentDbm` runs at the top of `startTx`: if a reply does not already state
  `amp.bs.incidentDbm`, the channel reads the reader's in-flight excitation with `txDbmAt` and
  writes `bsDbm − bsPathLossDb(ap→tag)` onto the frame, before `TX_START` is emitted. A reply that
  states its own incident power keeps it.
- `private bsFloorDbm(rid, frame)` = `readerFloorDbm(monoLeakDbm(txDbmAt(own PPDU, now)))`. It is
  both the reply's **detection floor** and, through `noiseFloorMw`, the **noise term** that
  replaces thermal noise in `interferenceMw` and in preamble detection. Wi-Fi interferers still
  add into the same sum, so the spec's "must also clear `AMP_BS_REQ_SNR_DB` against Wi-Fi power in
  the AP's receive band" holds.
- `decodeThreshDb` returns `AMP_BS_REQ_SNR_DB[kbps]` for an `ampBsReply`.
- `captureWindowNs` gained explicit `ampRfid` (preamble + WUP + 16 µs sync) and `ampBsReply`
  (`AMP_BS_UL_SYNC_CHIPS × AMP_BS_UL_CHIP_NS`) cases. The reply's value is numerically what the
  old `dir === 'ul'` branch produced (Task 1's noted 48×/24× coincidence); stating it explicitly
  stops that coincidence being load-bearing. The 5 dB capture margin is untouched.

### The receive window — what Task 3 consumes

```ts
export interface InFlightTx { frame: FrameDesc; startNs: Ns; endNs: Ns }
currentTx(nodeId: string): InFlightTx | null
bstOpenAt(nodeId: string, t: Ns): boolean
bsRxDbm(txId: string, rxId: string, txDbm: number): number
```

**`bstOpenAt(nodeId, t)` is the name for "is this node transmitting an `ampRfid` PPDU inside its
BST window".** `currentTx` is the general form the brief suggested and what `bstOpenAt` is built
on. `bsRxDbm` is the backscatter-law power query — Task 3 needs it for `AMP_BS_BOOT`'s
`incidentDbm` (the tag's own harvested power, which `onRxOk` does not carry).

`private listening(t, rid, r, frame)` replaces the two bare `!r.transmitting` tests in
`applyOneTx`. It is `true` when the radio is not transmitting, and — the one exception in the
engine — when the frame is an `ampBsReply`, the radio is `ampCapable`, and `bstOpenAt(rid, t)`.
A reply landing anywhere else in the PPDU, or outside it, is not received.

### Early resolution at the end of AMP-Data (a deviation — see below)

`startTx` schedules `endAmpData(tx)` at `t + bsDataEndNs(frame)`, which resolves **`'bsTag'`
radios' locks only**, through a `resolveLock` extracted verbatim from `endTx`. Wi-Fi radios and
Active Tx tags still resolve at the end of the PPDU. No CCA re-evaluation: nothing joined or left
the air.

---

## Deviations from the brief (all deliberate, all argued)

1. **A backscatter tag's reception ends where the command ends, not where the PPDU ends.** The
   brief does not mention it; the slice cannot work without it. The spec says the reply starts
   "T1 = 16 µs after the end of AMP-Data", which is *inside* the PPDU the tag is receiving — so
   with resolution at PPDU end the tag would learn the command 148 µs after it had to answer, and
   `startTx`'s half-duplex rule would emit a spurious `RX_FAIL(txDuringRx)` on every single reply.
   Physically the excitation after AMP-Data is carrier, not information. The test asserts the tag
   hears the Query at exactly 1 368 000 ns and that no `txDuringRx` failure is ever recorded.

2. **A reply is acquired at `AMP_BS_REQ_SNR_DB`, not at `PREAMBLE_DETECT_SINR_DB`.** The 4 dB
   preamble-detection gate is ns-3's model of a receiver *hunting* for a preamble it had no
   warning of. A mono-static reader opened the excitation itself and knows when the reflection is
   due. Left at 4 dB, the 250 kb/s reach would silently be 0.309 m instead of the 0.328 m the
   lesson quotes and `monoReachM` computes (the 1 Mb/s 9 dB rate is unaffected). `detectThreshDb`
   is per-frame and returns `PREAMBLE_DETECT_SINR_DB` for everything else. The tests pin the
   channel's boundary at `monoReachM` to the millimetre.

3. **The reader's floor replaces thermal noise for a reply rather than adding to it.** The
   leakage residue is ~37 dB above thermal in the reply's bandwidth, so the sum differs by
   0.001 dB; using the floor alone makes the channel's reach *exactly* `monoReachM`'s closed form
   instead of a hair inside it. Wi-Fi interference still adds on top.

Minor, and within the brief: `incidentDbm` is filled in by the channel when the reply does not
state it (the brief's own `?? the last DL PPDU's bsDbm` fallback, implemented as "read it off the
excitation in flight"). Task 3 may still set it and the channel will not overwrite it.

---

## Tests — `tests/engine/amp-bs-channel.test.ts` (new, 14 tests)

### RED

Test file written first, against names that did not exist yet
(`npx vitest run tests/engine/amp-bs-channel.test.ts`):

```
❯ tests/engine/amp-bs-channel.test.ts (14 tests | 11 failed)
  × radiates the charge power through its command and the BS power through its excitation
  × boots and decodes the Query at 0.3 m and is unpowered at 0.35 m
  × a reader turned up to 20 dBm wakes a tag at 0.9 m that it still could never hear
  × hears nothing but a downlink RFID PPDU
  × is heard from 0.3 m and not from 0.35 m at 250 kb/s
  × stops exactly at monoReachM — 0.328 m at 250 kb/s
  × reaches only 0.232 m at 1 Mb/s, where the tag must be 6 dB louder
  × does not move when the excitation goes up: the reader's own floor rises with it
  × carries the incident excitation the channel measured, and never fails the tag for replying
  × two replies in one slot collide; a 6 dB louder one is captured
  × is inaudible at a Wi-Fi station a metre from the tag
 Tests  11 failed | 3 passed (14)
```

The three that passed are the ones whose expectation is "nothing happens": the Wi-Fi-station CCA
test (that path was already correct and had to stay correct — it is a regression guard, not a new
behaviour), the Active Tx regression test, and "a reply outside the BST window is ignored", which
passed vacuously because replies were not received at all yet. Every test that asserts new
behaviour failed first.

### GREEN

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

One expectation was corrected between RED and GREEN: the incident power at 0.3 m is −29.738 dBm
and I had written −29.739 (`toBeCloseTo(_, 3)` is ±0.0005). The value came from the
implementation, so it is evidence of arithmetic agreement rather than of a behaviour I chose
after the fact — the surrounding assertions (the two boundaries either side of it) were written
before and did not move.

### The boundaries pinned

| What | Inside | Outside |
|---|---|---|
| Activation at 10 dBm charge (`activationReachM` 0.3092 m) | tag at 0.30 m decodes the Query | tag at 0.35 m hears nothing |
| Activation at 20 dBm (0.9777 m) | tag at 0.90 m decodes it… | …and its reply is still never heard |
| Reply at 250 kb/s (`monoReachM` 0.3275 m) | 0.300 m, **0.327 m** | **0.328 m**, 0.350 m |
| Reply at 1 Mb/s (0.2319 m) | 0.231 m | 0.233 m, 0.300 m |
| Both, at `bsDbm` ∈ {0, 10, 20} | unchanged at every power | unchanged at every power |

Plus: a Wi-Fi station holds CCA busy from t = 0 to exactly `txTimeNs` = 1 516 400 ns with cause
`preamble` (one BUSY, one IDLE) and decodes the `ampRfid` as a legacy PPDU; two replies from tags
at 0.25 m collide (no reception, one `COLLISION` record) while a tag 6 dB louder
(0.2 m vs 0.2·10^0.15 m) is received; a reply is inaudible (no `CCA_BUSY`, no reception) at a
station 1 m from the tag with the excitation at its loudest, and — so the assertion is not
vacuous — the *same* reply does hold CCA busy at 3 cm; a reply starting at 500 µs, at
`dataEnd − 1`, or at `dataEnd + bstNs` is ignored by the reader; a `'bsTag'` hears neither an
`ampTrigger`, nor another tag's reply, nor a CTS, and raises no CCA; an Active Tx tag still
decodes a trigger at −70 dBm **at the end of the PPDU** and the AP still decodes an `ampResp`
at −93 dBm.

### Gates

| Gate | Result |
|---|---|
| `npx tsc -b --noEmit` | clean |
| `npm run build` | `✓ built in 3.05s` |
| `npx vitest run` (whole suite) | **120 files, 1802 tests, 0 failed** |
| `tests/engine/lesson-hashes.test.ts` | passed, fixture untouched (never appeared in `git status`) |
| `tests/engine/uwb-record-hashes.test.ts` | passed, fixture untouched |
| i18n / editor / course files | not touched |

No `any`, no `@ts-ignore`, no `as unknown as`. The `as AmpBsUlKbps` casts follow the file's
existing `as AmpUlKbps` pattern for `amp.kbps`, which is typed `number`.

---

## Files changed

| File | |
|---|---|
| `src/engine/channel.ts` | +345 −46 |
| `tests/engine/amp-bs-channel.test.ts` | new, 307 lines |

---

## Self-review findings (found and fixed while reading my own diff)

1. Two comments still claimed preamble detection needs "4 dB" after `detectThreshDb` made it
   per-frame; both now name the function and say where the 4 dB applies.
2. Added a `v3` paragraph to the module header — the file's own convention is to record what each
   slice added to the medium, and three things about it are no longer true of "the" channel.
3. `captureWindowNs`'s new `ampBsReply` case is numerically identical to the branch it shadows. I
   kept it anyway and said why in the comment: Task 1's report flagged that equality as a fragile
   coincidence, and a reader should not have to rediscover it.

## Concerns / hand-offs to Task 3

1. **A reply is gated at its start, not over its whole length.** If a `bstNs` were ever too short
   for the reply it is sized for, the tail would fall outside the carrier and the channel would
   not notice. `bstNs` is sized `1.1 ×` the reply by construction, so nothing in this slice can
   do it — but a hand-written BST in a future scenario could.
2. **`bsRxDbm` and `bstOpenAt` are the whole contract.** If Task 3 needs a reply's SNR for the
   `AMP_BS_REPLY` record it should compute `readerFloorDbm(monoLeakDbm(bsDbm))` from `ampBs.ts`
   directly; the channel does not publish per-reception SINR to anyone today and I did not add a
   channel for it.
3. **A `'tag'` (Active Tx) radio can still receive an `ampRfid` PPDU** at −72 dBm under the Wi-Fi
   law, because the `amp.dir === 'dl'` branch does not discriminate. Nothing in this slice builds
   a scenario mixing both tag modes under one AP, so I left slice 1's branch alone rather than
   changing behaviour outside my task. If Task 3 or a later lesson mixes them, that branch needs
   a `kind === 'tag' && frame.kind === 'ampRfid' → null`.
4. **The concurrent Task-1 fix commit `4299134` landed in this worktree mid-task.** All my test
   runs and both gates above are against the tree including it; my commit stages only
   `src/engine/channel.ts` and the new test file.

---

# Fix round 1

**Commit:** `c782ec2` — `fix(amp): channel review — one PPDU prefix, no reply decode while the reader is idle`
(3 files: `src/engine/ampBs.ts`, `src/engine/channel.ts`, `tests/engine/amp-bs-channel.test.ts`).
`f5d36e8` was not amended. Hand-off 3 above is now **fixed**, see Minor 11.

## Important 1 — one composition for the DL PPDU prefix

`git diff --stat src/engine/ampBs.ts` was **clean** (Task 3 was in `mac.ts`, `simulation.ts`,
`records.ts` and their two new modules), so the helper went where the reviewer asked and the file
was staged immediately:

```ts
// src/engine/ampBs.ts
export function ampBsSyncEndNs(wupNs: Ns): Ns                    // preamble + WUP + AMP-Sync
export function ampBsDataEndNs(cmd: Gen2Cmd, wupNs: Ns): Ns      // + the command
export function ampBsDlPpduNs(cmd, wupNs, bstNs, signalExtNs)    // = ampBsDataEndNs + bst + ext
```

`ampBsDlPpduNs` now *composes* `ampBsDataEndNs` instead of restating its four terms, and
`channel.ts` consumes both: `bsDataEndNs(frame)` is `ampBsDataEndNs(r.cmd, r.wupNs)` and
`captureWindowNs`'s `ampRfid` branch is `ampBsSyncEndNs(wupNs)`. The three copies are one, and
`txTimeNs` and the offset into it are now the same derivation by construction — the existing
`expect(f.txTimeNs - SIGNAL_EXT_NS - DATA_END_NS).toBe(142_400)` is structural rather than a
coincidence held up by two independent sums. `AMP_BS_DL_KBPS`, `AMP_BS_DL_SYNC_NS`,
`ampRfidBytes` and `ampBitsNs` are no longer imported by `channel.ts`.

`tests/engine/amp-bs-model.test.ts` (Task 1's, which pins all ten DL PPDU airtimes) passes
unchanged: 15/15.

## Important 2 — the BST window is now a positive gate, enforced for an idle reader too

`detectFloorDbm` is the single gate:

```ts
if (frame.kind === 'ampBsReply') {
  return r.ampCapable && this.bstOpenAt(rid, t) ? this.bsFloorDbm(rid, frame) : null
}
```

and `listening` no longer duplicates the window test — it is now just the half-duplex rule plus
"an `ampBsReply` may arrive inside my own PPDU", with a comment saying the window belongs to
`detectFloorDbm` and is asked of an idle reader too. `detectFloorDbm` gained the `t` parameter so
the window is evaluated at the arrival instant rather than via `now()`.

Two tests, both verified to bite by reverting the gate to `r.ampCapable ? … : null` (**2 of 17
failed**, exactly these two; the gate was then restored):

- the existing window test gained a fourth start instant, `txTimeNs + 1` — after the reader has
  stopped transmitting, with `incidentDbm` **pre-set on the frame**, which is precisely the case
  the reviewer identified as slipping past the −200 dBm residual guard once Task 3 starts setting
  `incidentDbm` itself;
- *"is never heard by a reader that is not transmitting at all, even from 0.05 m"* — a tag at the
  path-loss clamp, a −40 dBm reply, no reader PPDU anywhere: no `RX_START`, no reception.

## Minor findings

| # | | |
|---|---|---|
| 3 | constructor is six positional parameters | **Declined this round — carried.** Task 3 was wiring `src/engine/simulation.ts` to the six-argument form while I worked; changing the signature underneath an in-flight implementer is exactly the concurrency the coordinator warned about, and the reviewer's own framing ("before Task 3 wires simulation.ts") is no longer available. Worth one mechanical commit before A3 adds a seventh hook. |
| 4 | `round()` drives replies from tags that could not be powered | Done — the helper's doc comment says why (a channel unit test isolates the reply boundary) and names the consequence: at 10 dBm charge activation stops at 0.309 m, *inside* the 0.328 m reply reach, so activation is the binding constraint in a real scene. |
| 5 | "is captured" names the wrong mechanism | Done — renamed to "a 6 dB louder one survives the other", with a comment on what actually happens (strongest-first batch; the quieter one fails the 5 dB test and becomes interference). |
| 6 | no test for the SNR against **Wi-Fi interference** | Done — *"must clear its SNR against Wi-Fi in the band, not only against the reader's leakage"*: a station transmitting across the BST window at −70 dBm at the AP eats the reply's 4.5 dB margin (reply lost, `COLLISION` names `sta` and `tag`); the identical geometry with the station 30 dB quieter decodes. Self-bracketing, so it cannot pass vacuously. |
| 7 | `ampNoiseBwMhz` gives a reply the Active Tx width | Done as the reviewer's second option (tag the reuse), deliberately not the first: a narrower width would be a new model number with no source behind it, and it cannot affect this slice (a mono-static reader hears every reply against its leakage floor, never thermal). The doc comment now states the chip-rate mismatch and flags in bold that **A4's bistatic receiver falls back to thermal and must give a reply its own width**. |
| 8 | unchecked `as AmpBsUlKbps` narrowings | Done — one `bsUlKbps(frame)` helper that throws `channel: <n> kb/s is not a backscatter uplink rate` rather than yielding `undefined`/`NaN`; used by `detectThreshDb`, `decodeThreshDb` and `captureWindowNs`. The remaining `as AmpUlKbps` casts are the pre-existing Active Tx ones, untouched. |
| 9 | `fillIncidentDbm` mutates the caller's frame | Done — three lines at the call site in `startTx`, naming the ordering (before `TX_START`) and the hazard (a reused frame object keeps the previous round's `incidentDbm`). |
| 10 | move the two pure functions to `ampBs.ts` | **Partially done, rest declined.** The *composition* moved (Important 1), which the reviewer said this finding was mostly about. `bsDataEndNs` and `txDbmAt` stay exported from `channel.ts` as thin frame-level wrappers: my Task-2 report handed Task 3 those two names as channel exports and Task 3 was writing against them in `ampReader.ts`/`ampBsSta.ts` while this round ran. It is a two-line move whenever the controller wants it; mid-flight it breaks an implementer's imports for no behavioural gain. |
| 11 | an Active Tx `'tag'` still decodes an `ampRfid` | Done — `if (r.kind === 'tag' && frame.kind === 'ampRfid') return null` in `detectFloorDbm`, with the physical reason (an Active Tx tag syncs on 40 chips and an AMP-SIG; a mono-static command has neither). Unreachable in today's scenarios, so no existing behaviour moves; mutation-checked (removing the clause fails the new test, 1 of 17). New test *"an Active Tx tag does not hear a mono-static command it could never sync to"*. |

## Gates

| Gate | Result |
|---|---|
| `npx vitest run tests/engine/amp-bs-channel.test.ts` | **17 passed** (was 14; +3) |
| `… amp-bs-channel + amp-bs-model + lesson-hashes + uwb-record-hashes` | 4 files, **71 passed**, both fixtures untouched |
| `npx vitest run` (whole suite) | 123 files, **1825 passed, 6 failed — all 6 in `tests/engine/amp-reader.test.ts`**, Task 3's untracked, in-progress file |
| `npx tsc -b --noEmit` | **2 errors, both outside my files** |

### The failures that are not mine

- **tsc:** `src/scene/nodes.ts(20,69)` and `src/ui/format.ts(27,41)`, both "function lacks ending
  return statement" — exhaustive switches over `MacStateName`, which Task 3 is extending with the
  spec's new `bsWait` value from `src/engine/mac.ts` (dirty in their working tree). Neither file is
  in my diff and neither error mentions `channel.ts`, `ampBs.ts` or my test file. Reported, not
  fixed.
- **vitest:** the 6 failures are Task 3's reader-round sequencing mid-implementation (`['query',
  'queryRep', 'ack']` where their test expects `['query', 'ack', 'read']`, counter draws, a TXOP
  budget, a scene node). I checked they are not my gate: their own `tests/engine/amp-bs-sta.test.ts`
  — the tag side, which drives real replies through the new window gate — passes 10/10, and their
  failing sequence itself shows an RN16 *is* decoded at the reader (the third command is the
  `ack`). Every tracked test file in the repo passes.

## Carried items for the controller

1. **Minor 3** — fold `spectrum` and `bsGeometry` into one `opts` object before A3 adds a third hook.
2. **Minor 10 remainder** — move `bsDataEndNs`/`txDbmAt` from `channel.ts` to `ampBs.ts` once
   Task 3's imports have settled.
3. **⚠️ 1 from the review** (the reviewer's own carry) — decide whether the AP's Wi-Fi `txPowerDbm`
   tracks `chargeDbm`, or the two powers stay independent. A lesson that says "the reader turns up
   to 20 dBm" while Wi-Fi neighbours keep deferring at the old level is stated-vs-simulated drift.
4. **Minor 7's A4 note** — a bistatic receiver must give an `ampBsReply` its own noise bandwidth.
