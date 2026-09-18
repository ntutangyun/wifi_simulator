# Task 6 report — session schedule, devices, network, Simulation host

Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`.

Created: `src/uwb/session.ts`, `src/uwb/device.ts`, `src/uwb/network.ts`,
`tests/uwb/session.test.ts`, `tests/uwb/network.test.ts`.
Modified: `src/engine/simulation.ts`, `src/model/view.ts`, `src/uwb/frames.ts`,
`tests/engine/simulation.test.ts`.

---

## 1. The schedule (`src/uwb/session.ts`)

Pure functions, no state:

- `rstuNs(rstu)` = `round(rstu · 416 · 1000 / 499.2)` — 1 RSTU = 416 chips at the
  499.2 Mchip/s peak PRF (standard §10.29.1.5). Exact on the three cases the
  lessons use: 600 → 500 µs, 2400 → 2 ms, 240 000 → 200 ms.
- `roundPlan(cfg, anchors)` → `{ method, anchors, slots, slotNs, roundNs, blockNs,
  roundsPerBlock }` with `slots = anchors + 1` (SS) or `2·anchors + 2` (DS), the
  same formula `uwbSlotsPerTag` already validates the scenario with, and
  `roundsPerBlock = floor(blockNs / roundNs)`.
- `slotStartNs(p, block, round, slot)` = `block·blockNs + round·roundNs + slot·slotNs`.
- `slotAction(p, slot)` maps a slot to its transmitter and frame kind, and throws
  on a slot outside the plan (an SS plan asked for slot `anchors + 1` is a
  programming error, not a silent no-op).

For `DEFAULT_UWB_SESSION` with 4 anchors: 10 slots, 2 ms each, 20 ms round,
200 ms block, 10 rounds per block.

## 2. The device state machine (`src/uwb/device.ts`)

`UwbDevice` is both the `UwbRadio` the channel delivers to and the per-node
ranging state machine. It shows Wi-Fi `MAC_STATE` names so one reducer covers
both technologies:

| state | meaning |
|---|---|
| `idle` | between its slots; receiver **off** (`listening() === false`) |
| `uwbWait` | a slot it expects a frame in; receiver on, deadline armed |
| `rx` | a PPDU is arriving |
| `tx` | radiating; half-duplex, `listening() === false` for the whole airtime |

`listening()` is `state === 'uwbWait' || state === 'rx'`. On top of that,
`onRxOk` refuses any delivery that reaches it while the device is in `tx` or
`idle` (the reviewer's point 2: the channel gates deliveries only at the arrival
instant, so a device that started transmitting mid-reception would otherwise
still be handed an `RX_OK`). It also refuses a frame that is not the one the
slot is for (wrong sender or wrong kind) — no ranging counter is ever taken from
an unexpected PPDU.

**Per-slot flow.** `onSlot(slot, action, slotEndNs, peers)`:

1. `closeSlot()` — see §2.1.
2. Tag only: emit `UWB_SLOT { slot, untilNs: slotEndNs }`.
3. If I am the slot's transmitter → `transmitFor(...)`.
4. Else, if the slot's frame is one I care about (a tag cares about `uwbResp`
   and `uwbReport`; an anchor about `uwbPoll` and `uwbFinal`) → `listenFor(...)`:
   state `uwbWait`, deadline armed at `slotEndNs` (phase 0).
5. Else → nothing at all; the receiver stays off. An anchor never listens to
   another anchor's response or report.

**Transmitting** (`send`): state `tx` → `UWB_TS { dir: 'tx', peer: frame.dst,
frameKind, counter: clock.counter(now + UWB_RMARKER_NS) }` → `ch.transmit` →
back to `idle` at `now + txTimeNs`, phase 2 (so `TX_END` precedes the
`MAC_STATE idle`). Broadcast frames (Poll, Final) carry `peer: '*'`, which is
the frame's own `dst`.

The four builders are fed exactly the times the standard's IEs carry:

- **Poll** (slot 0, tag): `makePoll(id, anchors, method, block, round)`; the tag
  stores its own tx counter.
- **Response** (slot 1+i, anchor i): silent if the anchor never received the
  Poll. SS carries `replyRctu = counterDiff(txResp, rxPoll)`; DS carries nothing
  (the key is now absent rather than `undefined`).
- **Final** (slot A+1, tag, DS only): one entry per anchor that answered, with
  `tround1 = counterDiff(rxResp, txPoll)` and `treply2 = counterDiff(txFinal,
  rxResp)`. Anchors that stayed silent are simply left out.
- **Report** (slot A+2+i, anchor i, DS only): only if the anchor received both
  Poll and Final; carries `treply1 = counterDiff(txResp, rxPoll)` and
  `tround2 = counterDiff(rxFinal, txResp)`.

**Receiving** (`onRxOk`), draw order as specified:

```
trueRmarkerNs = info.txStartNs + UWB_RMARKER_NS + info.propNs     (never RX_START.t − TX_START.t:
extraNs       = info.nlosNs + gaussian(rng)·tsNoisePs/1000         the channel rounds arrivals up)
counter       = clock.counter(trueRmarkerNs, extraNs)
emit UWB_TS { dir:'rx', peer, frameKind, counter, fom: fomFor(info.nlos) }
coffs         = (info.txPpm − clock.ppm)·1e-6 + gaussian(rng)·cfoNoisePpm·1e-6
```

then the deadline is cancelled, the state goes `idle`, and the frame is folded
into the round: Poll → store at the anchor; Response → store at the tag and,
for SS, finish the range immediately; Final → the anchor finds its entry and
finishes its own DS range; Report → the tag finishes its DS range.

**`endRound`** (tag): with ≥ 3 ranges, `solvePosition(everyAnchorsSurveyedPos,
ranges, pos.z, rangeSigmaM(tsNoisePs))`. A `null` (too few usable ranges, or
anchor geometry too nearly singular to invert) produces **no** `UWB_POSITION` —
never a fabricated fix. Both roles then drop the round state.

### 2.1 Why `closeSlot()` exists (ordering, not physics)

A slot's deadline is a queued event at `slotEndNs`, phase 0 — but the *next*
slot's start is the same instant, also phase 0, and was queued first (the whole
block is laid out when the block starts), so the queue would run the next slot
before the deadline that belongs to the previous one. `closeSlot()` is therefore
called at the top of `onSlot` and `endRound`: whichever of the two reaches the
instant first emits the `UWB_TIMEOUT` and cancels the other. Both paths emit the
identical record at the identical timestamp, so the behaviour is exactly the
brief's; only the ordering is made deterministic and correct.

## 3. The network (`src/uwb/network.ts`)

Builds the plan from the session config and the anchor count, then one
`UwbChannel` and one `UwbDevice` per node in scenario order. Each node gets
**one** `root.fork(hashStr(id + '#uwb'))`, handed both to `UwbClock.fromRng`
(crystal + counter origin) and to the device (every later noise draw) — so a
node's randomness does not depend on how many other nodes exist. The channel
reads each transmitter's ppm back out of `devices`.

Scheduling is block by block: `startBlock(0)` runs in the constructor (t = 0 is
block 0's start), and each `startBlock(b)` queues

- for every tag k and slot s: an event at `slotStartNs(plan, b, k, s)` that, on
  slot 0, calls `beginRound` on the tag and every anchor and then `onSlot` on
  every participant;
- an `endRound` for all participants at the round's last slot end;
- `startBlock(b + 1)` at `(b + 1)·blockNs`.

So a run of any length only ever holds one block's events, and tag k always owns
round k.

## 4. The Simulation host (`src/engine/simulation.ts`)

- `hashStr` is exported.
- `const ap = sc.nodes.find(n => n.kind === 'ap')` (no `!`) and the whole Wi-Fi
  wiring — link plan, per-link channels, MACs, AMP tags, shared queues, relay,
  traffic sources — now sits inside `if (ap) { … }`. `root`, the emitter, the
  hash plumbing and the snapshot cadence stay unconditional.
- `queuesOf` also skips `kind === 'uwb'`.
- After the Wi-Fi block: `if (uwbNodes.length && sc.uwb) this.uwb = new
  UwbNetwork(this.q, () => this.nowNs, uwbNodes, sc.walls, sc.uwb, root, baseEmit)`.
  `Rng.fork` does not advance the parent, so this cannot perturb the Wi-Fi
  streams; the traffic loop's `i` is still the index in `sc.nodes` and carries a
  comment saying lesson scenarios must list UWB nodes last.
- `readonly uwb?: UwbNetwork` on the class.

`src/uwb/network.ts` importing `hashStr` from `src/engine/simulation.ts` closes
an import cycle. It is safe (the binding is a hoisted function declaration used
only at constructor time, never at module evaluation) and both `tsc -b` and
`vite build` are clean.

### Carry-forward rulings, all applied

- `src/model/view.ts`: `if (applyUwbRecord(vs, r)) return` replaces the
  `startsWith('UWB_')` prefix test.
- `src/uwb/frames.ts`: `makeResp` omits `replyRctu` entirely for DS.
- `null` from `solvePosition` → no `UWB_POSITION` that round.

## 5. Measured numbers

Scene unless stated: four anchors at 5 m on the axes ((5,0), (0,5), (−5,0),
(0,−5), z = 1) around a tag at the origin, `tsNoisePs = 100`,
`cfoNoisePpm = 0.2`, `nlos: false`, seed 7. `rangeSigmaM(100) = 42.40 mm`.

**SS-TWR, tag +10 ppm, anchors −10 ppm.** The raw error is
`Treply · (ppm_tag − ppm_anchor)/2 = (i+1)·2 ms · 10⁻⁵ = (i+1)·20 ns`, i.e.
(i+1)·5.996 m — one anchor's worth of reply delay costs six metres:

| anchor | slot | raw error | corrected error |
|---|---|---|---|
| anc-1 | 1 | **+6.037 m** | −0.031 m |
| anc-2 | 2 | **+11.989 m** | −0.062 m |
| anc-3 | 3 | **+18.011 m** | −0.077 m |
| anc-4 | 4 | **+23.932 m** | +0.013 m |

(predicted 5.996 / 11.992 / 17.988 / 23.983 m; the spread is the 100 ps
timestamp noise.) The corrected residual is *not* noise-free either: it is the
CFO estimator's own 0.2 ppm error times `Treply/2`, which still grows with the
slot index — the reason DS-TWR exists. SS fix: (−0.023, +0.037), GDOP 1.000.

**DS-TWR, same ±10 ppm scene.** Eight `UWB_RANGE` records; the anchor lane and
the tag lane of the same pair report the *identical* value, because symmetric
DS-TWR is computed from the same four counters at both ends:

| pair | error |
|---|---|
| anc-1 ↔ tag | +33.3 mm |
| anc-2 ↔ tag | −3.3 mm |
| anc-3 ↔ tag | +18.3 mm |
| anc-4 ↔ tag | −30.0 mm |

All under 3 σ_r = 127 mm, and the ±10 ppm crystals cost nothing measurable
(0 ppm run: fix error 15.0 mm vs 15.4 mm at ±10 ppm). Fix: (−0.0075, −0.0134),
error **15.4 mm**, GDOP 1.000, error ellipse a = b = 30.0 mm.

**DS round airtime** (4 anchors, 2 ms slots, 20 ms round):

| frame | octets | airtime |
|---|---|---|
| Poll | 39 | 206 859 ns |
| Response ×4 | 14 | 181 218 ns each |
| Final | 60 | **234 551 ns** (480 data bits = 2 RS blocks → 96 parity bits) |
| Report ×4 | 24 | 191 474 ns each |
| **total** | | **1 932 178 ns — 9.7 % of the 20 ms round** |

The rest of the round is guard time; the SHR + STS (36 576 + 33 792 chips
= 141 µs) dominates every one of these frames, which is why a 14-octet Response
and a 60-octet Final differ by only 53 µs.

**Out-of-range anchor.** At 40 m on channel 9 the link budget is −96.5 dBm,
below the −93 dBm sensitivity, so nothing is delivered either way. The tag times
out in slot 4 (`expected: 'uwbResp'`) and slot 9 (`uwbReport`); the far anchor
times out in slot 0 (`uwbPoll`) and slot 5 (`uwbFinal`); the other three anchors
time out never. The Final carries 3 entries and the fix still solves from three
anchors (error < 0.3 m).

## 6. Deviations from the brief, with reasons

1. **`closeSlot()` in addition to the queued deadline** (§2.1) — required for
   correct event ordering at a slot boundary; same record, same timestamp.
2. **An anchor that missed the Poll still listens for the Final**, per the
   brief's "anchors listen to poll and final", so a fully unreachable anchor
   emits two `UWB_TIMEOUT`s per round rather than one. The brief's own test text
   only requires the Poll timeout to be present, and the extra one is
   informative, so this was left as the brief specifies.
3. **"The round's records end before 20 ms"** — every frame is finished by
   18.19 ms, but the round's `UWB_POSITION` is emitted by `endRound` at exactly
   20 ms, the round boundary. The test asserts that: all UWB records ≤ 20 ms,
   every `TX_END`/`RX_OK` strictly before, and the fix exactly at 20 ms.
4. **Three-tag test runs 470 ms, not 450 ms** — tag-3's block-2 round only
   closes at 460 ms, so 450 ms cannot give "each tag a fix per block" for three
   blocks. The `UWB_ROUND` timestamps asserted are the brief's (0/20/40 and
   200/220/240 ms).
5. **`uwbScenario`'s place type carries an optional `ppm`** for anchors as well
   as tags — the ±10 ppm lesson scene needs anchors at −10 ppm.
6. **The "raw within 3 σ of corrected" bound in the 0 ppm test** is derived from
   the CFO estimator, not from the range noise: with perfect crystals the two
   differ only by `treply·coffs/2`, whose 1 σ is `2 ms · 0.2e−6 / 2 · c` =
   60 mm. Measured gap 72 mm, bound 180 mm. Using 3·`rangeSigmaM(100)` = 127 mm
   would have been a bound on the wrong quantity.
7. The added `simulation.test.ts` case builds its UWB-only scenario inline
   rather than importing `uwbScenario`, to keep the brief's file list exact (no
   new shared test-helper module).

## 7. Verification

- `npx tsc -b` — clean.
- `npx vite build` — clean (only the pre-existing 500 kB chunk-size advisory).
- `npx vitest run` — **85 files, 842 tests, all passing**, including
  `tests/engine/lesson-hashes.test.ts` with no regeneration
  (`UPDATE_HASHES` never set) and `tests/model/view.test.ts` after the
  `applyUwbRecord` return-value change.
- New: `tests/uwb/session.test.ts` (6), `tests/uwb/network.test.ts` (19),
  `tests/engine/simulation.test.ts` +1.
- Determinism: two builds of the DS scene produce `toEqual` record arrays.
- Wi-Fi isolation: `defaultScenario()` + 3 anchors + 1 tag, run 100 ms — the
  sequence of non-UWB records (UWB types and UWB-node records filtered, `seq`
  dropped) is identical to `defaultScenario()` alone.

---

# Fix round 1 — review of `bf05b35`

Reviewer verdict: Spec CHANGES REQUIRED (1 blocking), Quality APPROVED (7 minors).
All seven controller rulings applied; finding 8 left as accepted.

**1 (blocking) — an anchor now reports only if the Final listed it.**
`onFinal` records the lookup as `RoundState.finalListedMe` *before* its early
return, and `transmitFor`'s `uwbReport` case guards on it. The path the reviewer
identified is real: `UwbChannel.rssiDbm` uses the **transmitter's** power, so an
anchor weaker than the tag hears the Poll and the Final while its own Response
never arrives — it would have put a Report on the air that produced a
`UWB_TS rx` at the tag and no `UWB_RANGE`. New scene in `network.test.ts`:
four anchors at 5 m, anc-4 at −40 dBm against the tag's −14 dBm (Poll heard at
−78.5 dBm, Response arriving at −104.5 dBm, under the −93 dBm sensitivity). It
asserts anc-4 *does* answer the Poll, is absent from `finalTimes`, never
transmits a `uwbReport`, contributes no `UWB_RANGE` on either lane, and that the
tag's two timeouts are exactly slot 4 (`uwbResp`) and slot 9 (`uwbReport`). The
test was confirmed to fail with the guard removed and pass with it.

**2 — dead state removed.** `pollCoffs`/`pollFom` are gone; the `uwbPoll` branch
carries a comment saying why an anchor keeps only the counter (DS-TWR cancels the
clock offset by construction) and that its range is scored by the *Final's*
first-path quality.

**3 — `UwbDeviceCfg.method` removed**, with a doc comment on the interface
recording that the round's `RoundPlan` is the one truth about the method.

**4 — the unreachable queued deadline deleted.** `listenFor` no longer schedules
anything, `Expectation` lost its `handle`, and both `q.cancel` calls are gone
(with them the `EventQueue.dead` accumulation the reviewer flagged).
`closeSlot()` at the top of `onSlot`/`endRound` is the sole timeout path; the
invariant it depends on is now written out at `startBlock` in `network.ts`
("every slot of a round is followed, at the instant it ends, by another `onSlot`
on the same crowd or by that round's `endRound`"). All existing timeout
assertions stayed green untouched.

**5 — `hashStr` moved to `src/engine/hash.ts`**, a dependency-free module.
`simulation.ts` imports it and re-exports it (`export { hashStr } from './hash'`)
so the old import path still works; `uwb/network.ts` imports it from `hash.ts`.
The `uwb/network.ts → engine/simulation.ts` cycle is gone.

**6 — the TX-end self-timer compares a captured monotonic `txSeq`**, so a stale
timer cannot idle a later transmission.

**7 — `UwbNetwork` asserts `tags.length <= plan.roundsPerBlock`** and throws with
the counts and durations spelled out. Test: two anchors, DS, a 20 ms block that
holds one 12 ms round, two tags → throws. (The scenario schema still gates real
scenarios in RSTU; this catches drift between the two unit systems and direct
construction.)

**8 — no change**, as ruled.

## Verification (fix round 1)

- `npx vitest run tests/uwb tests/engine/simulation.test.ts tests/engine/lesson-hashes.test.ts`
  → 10 files, **81 tests, all passing** (`network.test.ts` 19 → 22).
- `npx vitest run` (whole suite) → 87 of 88 files, **881 passing**. The one
  failing file is `tests/ui/uwb-lanes.test.ts`, which is Task 7's uncommitted
  in-flight work (`src/ui/*`, `src/scene/*`, `src/model/frameFields.ts`,
  `src/uwb/format.ts`, `src/uwb/frameFields.ts`) and is untouched by this fix
  round.
- `npx tsc -b` reports errors only in those same Task 7 files; filtering them out
  leaves no diagnostics in `src/engine`, `src/uwb`, `src/model` or `tests/uwb`.
- `npx vite build` → clean.
