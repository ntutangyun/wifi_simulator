# Task 2 report — Per-frame PHY in the UWB channel, `Emission.lossDb`, coupling gate

**Commit:** `9f3b878` — `feat(uwb): per-frame PHY in the UWB channel, emissions carry their own loss law, NB coupling gate`
**Branch:** `feat/uwb-ranging` (worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`)
**Gates:** `npx tsc -b` clean · `npx vite build` clean (2.85 s) · `npx vitest run` **112 files, 1504 tests, all green**
**Byte identity:** `tests/fixtures/lesson-hashes.json` is **unchanged** (not in the diff); `tests/engine/lesson-hashes.test.ts` and
`tests/course/uwb-coexist.test.ts` pass untouched.

---

## What was built

### 1. `Emission` carries its own path-loss law (`src/engine/spectrum.ts`)

- `Emission` gains `lossDb: (dM: number, wallsDb: number) => number`.
- `uwbChannelOf`, `UWB_CHANNEL_MATCH_MHZ` and the `UWB_CHANNELS` nearest-centre heuristic are **deleted**.
- `emit()` no longer validates a band at all (any band is now meaningful, because the law travels with the emission).
- `foreignMw()` calls `e.lossDb(d, wallsDb)` instead of branching on the source side.
- `wifiToUwbPathLossDb`, `uwbToWifiPathLossDb` and `bandOverlapMhz` are unchanged and still exported.

The refactor is bit-exact because the *same functions* are passed with the *same arguments* as before:
`src/engine/channel.ts` puts `lossDb: wifiToUwbPathLossDb` on every Wi-Fi PPDU, and `src/uwb/channel.ts` binds
`uwbToWifiPathLossDb(·, ·, sessionChannel)` to every 4z frame and fragment.

### 2. New 4ab frame kinds, shapes and builders (`src/uwb/frames.ts`)

- `UwbFrameKind` += `'uwbRsf' | 'uwbRif' | 'nbPoll' | 'nbResp' | 'nbReport'`.
- `isNbFrame(k)` / `isMmsFragment(k)` exported (kind predicates, for Task 3).
- `UwbMmsFrag` and `UwbNbMsg` exported; `UwbInfo` gains `mms?` and `nb?`.
- `makeRsf` / `makeRif`: `bytes 0`, `mbps 0`, `durationFieldNs 0`, `txTimeNs` from `rsfNs(nMsr, gap)` / `rifNs(stsLen)`,
  `uwb.mms.txDbm = mmsFragmentDbm(txTimeNs)`. No number is re-derived — every one comes from `mms.ts`.
- `makeNbPoll` / `makeNbResp` / `makeNbReport`: `mbps NB_MBPS (0.25)`, bytes from `NB_*_BYTES`, `txTimeNs = nbPpduNs(bytes)`,
  `uwb.nb = { channel, centerMhz: nbCenterMhz(channel), msgId, replyRctu?|roundTripRctu? }`.
  POLL sits in control slot 0 and RESP in slot 2 (`RcpPollSlot 2 + RcpResponseSlot 2`, 0381r5 §1.1); the REPORT takes its slot
  from the caller.
- Both families set `uwb: { sp: 1, method: 'ss', block, round, slot, ies: [] }` as the shape `UwbInfo` requires.

**One design decision inside the contract:** `makeNbReport` picks its message-ID octet from which time is present —
`replyRctu` ⇒ `NB_MSG_ID.reportResponder`, otherwise `NB_MSG_ID.reportInitiator` — which is exactly how 0381r5
Table 1.6.3.1 distinguishes them (ReplyTime vs TurnAroundTime). Absent keys are omitted rather than set to `undefined`,
so a built REPORT compares equal to a hand-built one.

### 3. Per-frame PHY in the UWB medium (`src/uwb/channel.ts`)

Six private helpers, all keyed on `frame.uwb?.nb` / `frame.uwb?.mms` (**never** on a kind string):

| helper | NB frame | MMS fragment | everything else |
|---|---|---|---|
| `txDbmFor` | `NB_TX_DBM` | `frame.uwb.mms.txDbm` | node's `txPowerDbm` |
| `pl0For` | `nbPl0Db(ch)` | `uwbPl0Db(session)` | `uwbPl0Db(session)` |
| `sensFor` | `NB_RX_SENS_DBM` | `UWB_RX_SENS_DBM − MMS_COMBINE_MAX_DB` | `UWB_RX_SENS_DBM` |
| `sirMinFor` | `NB_SIR_MIN_DB` | `UWB_SIR_MIN_DB` | `UWB_SIR_MIN_DB` |
| `bandFor` | `nbBand(ch)` | `UWB_BAND_MHZ[session]` | `UWB_BAND_MHZ[session]` |
| `lossDbFor` | NB free space at `nbPl0Db(ch)` + `UWB_PL_EXP` + walls | `uwbToWifiPathLossDb(·,·,session)` | same |

Wired into: the emission built in `transmit()`, the sensitivity gate in `startRx()`, the reception's initial
`foreignMw` query band, the SIR floor in `endRx()`, and the `Spectrum.onChange` re-take — which now asks **per
reception** using `bandFor(rx.frame)` (resolution 4), so an NB reception and a UWB reception at the same node do not
share a foreign term.

`rssiDbm(from, to, frame?)` gained an **optional** third argument; called with no frame it answers exactly as before
(node power, session channel), which is why every existing call site and test is unchanged.

New: `lbtBusy(id, channel): { busy, foreignDbm }` — one instantaneous `spectrum.foreignDbm('uwb', pos, nbBand)` reading
against `NB_LBT_THRESHOLD_DBM`; with no mediator it returns `{ busy: false, foreignDbm: -Infinity }` and touches nothing.
**No draws anywhere**, and nothing is scheduled: determinism is untouched.

`UwbChannelCfg` gained `mms?: MmsPhy`, passed by `src/uwb/network.ts` (only in `mode: 'mms'`). The medium reads nothing
from it — it is there for Task 3's devices, per the brief.

`UWB_INTERFERED` is emitted for NB frames too, same record shape (resolution 5).

### 4. The mediator gate (`src/engine/simulation.ts`)

The 6 GHz gate is now "`sc.uwb` and some UWB node exists", then:

```
uwbCoupled = sc.uwb.channel === 5 && uwbBandOverlap(centre, max(width,160), 5) > 0   // today's rule
nbCoupled  = sc.uwb.mode === 'mms' && sc.uwb.mms.nbChannels.some(n =>
               bandOverlapMhz(nbBand(n).lo, nbBand(n).hi, centre − W/2, centre + W/2) > 0)   // W = max(width,160)
```

Same width rule as before. A UNII-3 allow list (channels < 50, the default `[3]`) can never couple, so the default
session is gated exactly as it was whether or not a 6 GHz link exists.

---

## Tests — RED / GREEN evidence

**RED.** After all tests were written, the new behaviour was temporarily neutralised in `src/uwb/channel.ts`
(`sensFor`/`sirMinFor`/`bandFor`/`txDbmFor`/`pl0For` forced back to the session answers, `lbtBusy` forced clear) and in
`src/engine/simulation.ts` (`nbCoupled` forced `false`), then the covering files were run:

```
× a narrowband reception … > sees no Wi-Fi at all on a UNII-3 control channel the AP cannot reach
× a narrowband reception … > loses a UNII-5 message to the same PPDU, and says so with UWB_INTERFERED
× listen before talk …    > is busy inside 8.6 m of a transmitting 6E AP and clear outside it
× listen before talk …    > reads nothing but the mediator: a silent AP, a UNII-3 channel and no mediator are all clear
× per-frame PHY …         > hands a fragment to its device twelve decibels below 4z sensitivity
× per-frame PHY …         > drops a fragment no train could rescue
× per-frame PHY …         > delivers a narrowband message down to its own −100 dBm receiver
× Simulation · the Spectrum … > couples an MMS session whose narrowband allow list reaches into UNII-5
Test Files  3 failed (3)      Tests  8 failed | 28 passed (36)
```

Two of the new tests are deliberate **controls** and stayed green under the mutation: "still drops a 4z frame at
−100 dBm" (proves the allowance is the fragment's alone) and "leaves a UNII-3 allow list uncoupled".

The source was then restored byte-for-byte from a backup and the full suite re-run.

**GREEN.** `npx vitest run` → **112 files, 1504 tests passed** (was 111 / 1488 before; +1 file, +16 tests).

### The new tests

`tests/uwb/frames.test.ts` (new, 5 tests)
- an RSF carries 0 bytes / 0 Mb/s, `txTimeNs === rsfNs(40, 64)` (82.05 µs) and `txDbm === mmsFragmentDbm(txTimeNs)` (−3.46 dBm);
- an RIF is sized from its STS segment (65.64 µs) and, being shorter, is **louder** (−2.49 dBm);
- the three NB PSDUs are 12 / 12 / 13 octets and 576 / 576 / 608 µs;
- channel, centre (6301.25 MHz for channel 200), message id and the one time each REPORT holds;
- `isNbFrame` / `isMmsFragment` over every kind.

`tests/uwb/channel.test.ts` (+4)
- `MMS_COMBINE_MAX_DB = 12.041`, floor `−105.04 dBm`; a fragment at −100 dBm is **delivered**;
- a fragment at −106 dBm is dropped with no record at all;
- a 4z Poll at −100 dBm is still dropped (the control);
- an NB POLL at −99 dBm is delivered at `NB_TX_DBM` and `nbPl0Db(200)`, and at −101 dBm is not.
  Distances are solved from the channel's own law (`distanceForRx`), not written out.

`tests/uwb/channel-coexist.test.ts` (+4)
- an NB reception on UNII-3 channel 3 sees `foreignDbm === -Infinity` from the AP's 6305 MHz PPDU (the band query is the
  NB channel's 2.5 MHz, not the session band);
- an NB reception on UNII-5 channel 200 is lost to the same AP at 30 dBm and emits `UWB_INTERFERED` with the pinned
  foreign level; `NB_SIR_MIN_DB = 0 > UWB_SIR_MIN_DB`;
- **the 8.6 m crossing**: a 20 dBm 80 MHz PPDU is −70.04 dBm in 2.5 MHz at 8 m (**busy**) and −72.28 dBm at 9.5 m
  (**clear**) against `NB_LBT_THRESHOLD_DBM = −71.02`;
- `lbtBusy` is clear with a silent AP, clear on a UNII-3 channel, and clear with no mediator at all.

`tests/engine/spectrum.test.ts` (+3, 2 rewritten)
- the Wi-Fi PPDU at a UWB receiver is pinned to `20 − wifiToUwbPathLossDb(3, 0)` to 12 decimals (the byte-identity anchor);
- a 10 dBm NB message on channel 200 reaches a 6 GHz Wi-Fi receiver at `10 − nbPl0Db(200) − 20·log10 4` = **−50.48 dBm**
  (`nbPl0Db(200) = 48.44`);
- "applies each emission's own law, whatever band it names" — a 2.5 MHz band far from every UWB centre is now accepted and
  its own `lossDb` is called with `(d, wallsDb)`. This **replaces** the old "refuses to guess a channel" test, which asserted
  behaviour this task deletes; "accepts channel 9 as well as channel 5" became "carries a channel-9 law as easily as a
  channel-5 one".

`tests/engine/channel-spectrum.test.ts` (+2)
- `nbChannels: [200]` + UWB channel **9** + a 6 GHz link at 6305 MHz ⇒ `sim.spectrum instanceof Spectrum` (only the
  narrowband side can couple there, since channel 9 never meets 6 GHz);
- `nbChannels: [3]` and `[0, 49]` ⇒ `sim.spectrum === null`, and the default allow list is asserted to be `[3]`.

---

## Files changed

| File | Why |
|---|---|
| `src/engine/spectrum.ts` | `Emission.lossDb`; `uwbChannelOf` + `UWB_CHANNEL_MATCH_MHZ` deleted; `emit` no longer validates |
| `src/engine/channel.ts` | Wi-Fi PPDUs carry `lossDb: wifiToUwbPathLossDb` |
| `src/engine/simulation.ts` | the NB arm of the mediator gate |
| `src/uwb/frames.ts` | five kinds, `UwbMmsFrag`/`UwbNbMsg`, five builders, two predicates, `NB_MBPS` |
| `src/uwb/channel.ts` | per-frame PHY dispatch, per-reception foreign band, `lbtBusy`, `cfg.mms` |
| `src/uwb/network.ts` | passes `mms` to the channel in MMS mode |
| `src/model/frames.ts` | `FrameKind` += the five kinds (resolution 1) |
| `src/uwb/format.ts` | `KIND_SHORT` (exhaustive `Record<UwbFrameKind, …>`) |
| `src/uwb/frameFields.ts` | `SUBTYPE` (exhaustive `Record<UwbFrameKind, …>`) |
| `src/scene/effects.ts` | `frameColor` switch (exhaustive; placeholder colours) |
| `src/ui/i18n.ts` | `kindName` / `whatIs` / `next` are `Record<FrameKind, string>` — EN **and** ZH |

### Additions forced by resolution 1 (minimal, flagged for Task 3)

Extending `FrameKind` made four exhaustive structures incomplete, so each got the five kinds:

1. `src/uwb/format.ts` `KIND_SHORT` — `RSF`, `RIF`, `nb-poll`, `nb-resp`, `nb-report`.
2. `src/uwb/frameFields.ts` `SUBTYPE` — "MMS Ranging Fragment", "Narrowband POLL", …
3. `src/scene/effects.ts` `frameColor` — fragments take the initiator amber `0xf59e0b`, NB messages the responder shade
   `0xfbbf24`. **These are placeholders; Task 3 owns the palette** (the spec asks for a distinct fragment colour).
4. `src/ui/i18n.ts` `kindName`, `whatIs` and `next` are `Record<FrameKind, string>`, so 5 × 3 × 2 = **30 new strings**
   (EN + ZH, every one written in both). They are short but real and correct; Task 3 may rewrite them with the lesson's
   wording. This is the one place where the task added user-visible strings despite the brief expecting none — the type
   left no alternative short of weakening `Record` to `Partial<Record>`, which would have hidden a real gap.

---

## Self-review findings

1. **Byte identity verified three ways**: `lesson-hashes.json` is absent from the diff; `tests/engine/lesson-hashes.test.ts`
   passes; the whole pre-existing suite (1488 tests) passes untouched apart from the two spectrum tests that asserted the
   deleted `uwbChannelOf` behaviour.
2. **`rssiDbm` stayed source-compatible.** Adding an *optional* third parameter rather than a required one kept
   `tests/uwb/channel.test.ts`'s two existing call sites and the 4z path identical. With no frame the two helpers
   (`txDbmFor`, `pl0For`) reduce to the exact expressions that were inlined before.
3. **Dispatch is on fields, not strings** (resolution 2), so a frame that happens to be named `nbPoll` but carries no
   `uwb.nb` cannot mislead the medium, and the kind predicates stay purely a Task 3 concern.
4. **The gate's common prefix moved.** `centerMhz` / `widthMhz` are now computed whenever `sc.uwb` exists and a UWB node is
   present, instead of only for channel 5. That is pure computation with no side effect; the `hook` is still built only when
   `uwbCoupled || nbCoupled`.
5. **`uwbNodes.length > 0` retained** as a precondition of the whole gate. Strictly the brief's OR does not mention it, but
   without UWB nodes no `UwbNetwork` is built at all, so a mediator would have an empty UWB side; keeping the guard means the
   gate never differs from "a mediator that can actually mediate".
6. **`UwbChannelCfg.mms` is dead weight inside the channel** (the brief says so explicitly). It is passed only in
   `mode: 'mms'`, so a non-MMS session's channel config is byte-identical to before.
7. **No new draws, no new scheduling.** `lbtBusy` is a pure read of the Spectrum. The only new `q.schedule` in the diff is
   none.
8. **No `any`, no `@ts-ignore`, no `as unknown as`.** Every new constant is tagged at its definition (`4ab draft …`,
   `standard Clause 12`, `model`), and no draft text is pasted.

## Concerns / hand-off notes for Task 3

1. **`src/ui/laneLayout.ts` labels the five new kinds wrongly.** Its label chain is a ternary ladder ending in
   `T.cts(dst)`, so an `nbPoll` on the timeline would be captioned as a CTS. Nothing produces these frames yet (Task 3
   builds the cycle), so no test can hit it, and labels/colours are explicitly Task 3's — but it must be fixed before any
   MMS scenario is rendered. Same for `src/uwb/frameFields.ts`, whose decoder body still parses every UWB frame as a 4z MHR;
   the spec asks it to print a fragment's index/length/power and an NB message's id/channel/centre.
2. **Capture between the two radios.** `startRx` still runs the capture rule across *every* open reception at a node,
   regardless of which radio the frames belong to. A real NBA-UWB device has two receivers, so an NB message and a UWB
   fragment overlapping in time should not collide. The 4ab slot layout keeps the control and ranging phases disjoint, so
   this cannot bite as long as Task 3 follows `mmsLayout`, but a device that transmits NB during the ranging phase would see
   a spurious collision. Worth a per-radio `open` list if that ever happens.
3. **`makeNbReport`'s msgId rule** (ReplyTime ⇒ responder, otherwise initiator) is mine, not the brief's. If Task 3 ever
   needs a REPORT carrying both times, the rule needs an explicit `from` argument instead.
4. **Placeholder frame colours** in `src/scene/effects.ts` (see above): fragments currently share the 4z amber, and the spec
   wants them distinct.

---

# Fix report — review round 1

**Commit:** `a5a452f` — `test(uwb): NB emission and per-reception band coverage; frame-kind predicates take FrameKind`
**Files touched (only these; Task 3 was concurrently editing `device.ts` / `session.ts` / `network.ts` / view / format /
rows / `frameFields.ts` / `laneLayout.ts` / `effects.ts`, and also `src/uwb/mms.ts` + `src/uwb/nb.ts`, all of which were
left alone and unstaged):

- `src/uwb/frames.ts`
- `tests/uwb/channel-coexist.test.ts`
- `tests/uwb/channel.test.ts`
- `tests/uwb/frames.test.ts`

## 1. (Important) The NB emission path, end to end

New describe block `UwbChannel . the narrowband PPDU it puts on the shared air` in
`tests/uwb/channel-coexist.test.ts`, mirroring the existing 4z `is live for exactly the PPDU` test:

- **`radiates a narrowband message at its own power, over its own 2.5 MHz, under its own law`** — drives
  `UwbChannel.transmit('t', makeNbPoll('t', 'a', 200, 0, 0))` at t = 50 µs against a real `Spectrum`, and reads
  `s.foreignDbm('wifi', {x:0,y:2,z:0}, 6265, 6345)` at 0, 50 000, 300 000 and 700 000 ns.
  - `−Infinity` **before** TX_START (t = 0) and **after** TX_END (t = 700 000; TX_END is 50 000 + 576 000);
  - during the PPDU, `NB_TX_DBM − (nbPl0Db(200) + 10·UWB_PL_EXP·log10(2))` = 10 − (48.4363 + 6.0206) = **−44.46 dBm**
    (literal pinned in the assertion and in the comment). All 2.5 MHz of channel 200 lies inside the AP's 80 MHz, so no
    spectral slice is taken — which is what makes this number a clean read of `txDbmFor` (+10, not the node's −14),
    `bandFor` (2.5 MHz, not 499.2 MHz) and `lossDbFor`'s NB branch at once;
  - two guards that the number could not have come from the 4z path: `NB_TX_DBM !== UWB_TX_POWER_DBM`, and the value is
    **not** close to `NB_TX_DBM − uwbToWifiPathLossDb(2, 0, 5)`.
- **`leaves a 4z frame in the same scene at exactly the number it always had`** — the same harness, the same receiver,
  a 4z Poll: `uwbInBandDbm(−14, 80) − uwbToWifiPathLossDb(2, 0, 5)` = **−76.66 dBm**, asserted with `toEqual`.

## 2. (Important) The `onChange` per-reception band

New describe block `UwbChannel . a narrowband reception re-takes foreign power over its own band`. Both tests emit the
Wi-Fi PPDU at **t = 100 µs**, i.e. 100 µs into a 576 µs NB reception that opened at t ≈ 17 ns with zero foreign power —
so the only code that can raise `maxForeignMw` is the `Spectrum.onChange` listener at `src/uwb/channel.ts:130-141`.

- **`counts a Wi-Fi PPDU that only starts in the middle of a UNII-5 reception`** — NB channel 200, AP at 30 dBm.
  Asserts `RX_START` precedes the emission, `lowSinr`, a `UWB_INTERFERED` record, and — the load-bearing part — that its
  `foreignDbm` is the **2.5 MHz** slice `−47.27 dBm`, with the UWB-band reading `−32.21 dBm` computed alongside it so the
  two are visibly different; `sirDb` is pinned to `nbRssiDbm(200) − overNbBand`.
- **`ignores a mid-reception PPDU that misses the narrowband channel, though it fills the UWB band`** (the converse) —
  NB channel 3 (UNII-3), AP at 20 dBm. The test first asserts the geometry that makes it a real test — the AP's channel is
  wholly **inside** `UWB_BAND_MHZ[5]` and wholly **outside** `nbBand(3)` — then that the reception ends `RX_OK` with
  `info.foreignDbm === -Infinity`, no `UWB_INTERFERED` and no failures.

**Reverting `src/uwb/channel.ts:137` from `this.bandFor(rx.frame)` to `this.band` breaks BOTH new tests** (verified, then
restored byte-for-byte from a backup):

```
× counts a Wi-Fi PPDU that only starts in the middle of a UNII-5 reception
  → expected -32.21363764158988 to be close to -47.26513742478894, difference 15.0515 (the 10·log10(2.5/80) slice)
× ignores a mid-reception PPDU that misses the narrowband channel, though it fills the UWB band
  → expected undefined to be defined        (the reception was lost to lowSinr instead of decoding)
Tests  2 failed | 13 passed (15)
```

The converse test is the decisive one: under the revert the message is not merely mis-measured, it is lost.

## 3. (Minor) `isNbFrame` / `isMmsFragment` take `FrameKind`

`src/uwb/frames.ts` now imports `type FrameKind` and both predicates take it, with a comment saying why (callers hold a
`FrameDesc.kind`; narrowing at the signature would push a cast onto every call site). The three casts/tautologies in
`tests/uwb/frames.test.ts` are gone — `isMmsFragment(rsf.kind)`, `[poll.kind, resp.kind, report.kind].every(isNbFrame)`,
`(['nbPoll', 'nbResp', 'nbReport'] as const).every(isNbFrame)` — and a new loop asserts both predicates are `false` for
`data` / `ack` / `trigger` / `ampResp`, which is the justification for the wider parameter.

## 4. (Minor) `makeNbReport` refuses an empty `times`

`makeNbReport` throws `makeNbReport: <src> built a REPORT with neither a reply nor a round-trip time` when both
`replyRctu` and `roundTripRctu` are absent — otherwise the message-id octet would be a silent guess
(`reportInitiator`) and the receiver would have nothing to range with. New test
`refuses a REPORT that carries neither time` asserts the throw and that both well-formed shapes still build.

## 5. (Minor) The pinned 4z value in the NB delivery test

`tests/uwb/channel.test.ts` — `.not.toBeCloseTo(-99, 3)` is replaced by the real number: the receiver sits at
`distanceForRx(NB_TX_DBM, nbPl0Db(200), -99)` = **1067.05 m**, and `ch.rssiDbm('t', 'a')` asked with no frame is
`−14 − uwbPl0Db(9) − 10·UWB_PL_EXP·log10(1067.05)` = **−125.06 dBm**, asserted both as the expression and as the literal.

## Verification

```
$ npx tsc -b
TSC OK

$ npx vitest run tests/uwb/channel-coexist.test.ts tests/uwb/channel.test.ts \
                 tests/uwb/frames.test.ts tests/engine/spectrum.test.ts \
                 tests/engine/lesson-hashes.test.ts tests/course/uwb-coexist.test.ts
 Test Files  6 passed (6)
      Tests  82 passed (82)
```

`tests/fixtures/lesson-hashes.json` is still **unchanged** — it does not appear in `git status`, and both the
lesson-hash test and the coexistence lesson tests pass. Net new coverage this round: +6 tests
(`channel-coexist` 11 → 15, `frames` 5 → 6), and two of the four new ones are proven to fail without the code they cover.

## Concerns from the first report that still stand

Findings 1 and 4 of the original report (the `laneLayout.ts` / `frameFields.ts` labels and decoder, and the placeholder
`effects.ts` colours) are unchanged — those files belong to Task 3 and were deliberately not touched. Concerns 2 (capture
across the two radios at one node) and 3 (`makeNbReport`'s msgId rule) stand as written, though 4 above now makes the
degenerate case of concern 3 a loud failure rather than a silent guess.
