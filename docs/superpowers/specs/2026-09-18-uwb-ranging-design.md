# UWB ranging (IEEE 802.15.4-2024 HRP UWB, SS-TWR / DS-TWR, ranging blocks) and the core/technology seam: design

Date: 2026-09-18
Status: approved direction (unified Wi-Fi + AMP + UWB platform, one repo); this spec covers the first UWB slice and
the core/technology seam it needs ("sub-project zero").

## Purpose

Add the second radio technology to the simulator and the course: ultra-wideband ranging. A UWB radio does not compete
for airtime; it measures time. The slice models the **HRP UWB PHY** of IEEE Std 802.15.4-2024 (Clause 16, the 4z
enhanced-ranging device, BPRF mode), the **ranging measurements** of §10.29 (RMARKER, ranging counter, SS-TWR, DS-TWR,
FoM) and the **ranging block / round / slot** structure of §10.32 (controller and controlees, initiator and
responders, one-to-many SS-TWR and three-message DS-TWR, time-scheduled). On top of the exchange it computes what the
next higher layer computes in a real product: ranges from counters, and a 2-D position with an error ellipse from
several ranges. The FiRa-style defaults (2 ms slots, 200 ms blocks, one tag per round) are labelled as such.

What the slice is not: 802.15.4ab (multi-millisecond, narrowband-assisted, sensing), one-way TDoA, angle of arrival,
contention-based rounds, STS key management, LRP UWB, and Wi-Fi 6E / UWB channel-5 coexistence. Those are later
slices (see the end).

### Where this lives in the platform

The agreed layout is `src/core` (house, editor, scene, timeline, course kit, i18n), `src/wifi` (engine, records,
lessons) and `src/uwb`. Main currently holds another session's uncommitted edits in `src/ui/App.tsx` and
`src/ui/i18n.ts`, so **this slice does not move Wi-Fi files**. It builds the seam instead: UWB code lives in
`src/uwb/` from the start (engine, records, view reducer, frame fields, formatting, scene overlay, lessons), and the
core files gain one hook each where a technology plugs in. Moving `src/engine`, `src/course/tier1`, `src/course/amp`
under `src/wifi/` becomes a mechanical `git mv` once main is quiet; nothing in this slice depends on it.

The seams (each is a task in the plan):

1. **Engines.** `Simulation` hosts two engines. The Wi-Fi engine runs when the scenario has an AP; the UWB engine runs
   when it has UWB nodes. A scenario may have either or both. The schema requires an AP only when a station or an AMP
   tag exists.
2. **Records.** `TLRecord` is the union of core records (TX/RX, MAC_STATE, COLLISION), the Wi-Fi records, the AMP
   records and `UwbRecord` (defined in `src/uwb/records.ts`).
3. **View.** `applyRecord` delegates every record whose type starts with `UWB_` to `applyUwbRecord`; `NodeView.uwb?`
   holds a UWB node's live state; `initViewState` creates a lane per UWB node.
4. **Lanes.** `laneIds(nodes)` in `src/model/lanes.ts` = the Wi-Fi link plan's virtual ids followed by the UWB node
   ids (a UWB node has one lane, its bare id). The timeline strip and the view use it.
5. **Frames.** `FrameDesc.kind` gains the four UWB kinds and `FrameDesc.uwb?: UwbInfo`, the way AMP added `amp?`.
6. **UI hooks.** Event log, inspector, frame detail, timeline colours, 3-D scene and editor each call one UWB function
   (`fmtUwbRecord`, `UwbInspector`, `uwbFrameFields` / `uwbPpduLayout`, `UWB_FRAME_COLORS`, `UwbOverlay`,
   `UwbNodeFields` / `UwbSessionFields`) when they meet a UWB record, frame or node.
7. **No-AP audit.** Nine files assume an AP exists (`FrameDetail`, `TimelineStrip`, `effects`, `nodes`,
   `FloorPlanEditor`, `lessonKit`, `caps`, `scenario`, `view`). Each site becomes null-safe; the editor allows a
   scenario with no AP when it has no station or AMP tag.
8. **Course tracks.** `TIERS` entries gain `track: 'wifi' | 'uwb'`; the course panel prints a track heading when the
   track changes. The UWB tier is index 4.

### Source status and honesty rule

IEEE Std 802.15.4-2024 is a published standard, so most numbers here are **standard**. Where the standard leaves a
value to the implementer or to the higher layer, the number is tagged **FiRa** (a value the FiRa Consortium profiles
use and that the lessons say is FiRa's, not IEEE's) or **model** (our choice, stated in the lesson). Every constant in
`src/uwb/phy.ts` carries its tag in a comment; every lesson says in one sentence which numbers are which.

## Part A — the HRP UWB PHY (`src/uwb/phy.ts`)

### Clock and units (standard)

| Constant | Value | Source |
|---|---|---|
| Chip rate / peak PRF | 499.2 MHz, Tc = 2.003205 ns | §16.2.4 |
| Ranging counter time unit (RCTU) | Tc / 128 = 15.650 ps | §10.29.1.4 |
| Ranging scheduling time unit (RSTU) | 416 chips = 833.333 ns | §10.29.1.5, Table 10-145 |
| Speed of light | 299 792 458 m/s = 0.299792 m/ns; 1 m = 3.3356 ns = 213.1 RCTU | physics |
| Preamble symbol, code length 127, BPRF (L = 4, 508 chips) | Tpsym = 1017.63 ns | Table 16-5 |
| PHR symbol at the 850 kb/s nominal rate | 512 chips = 1025.64 ns | Table 16-4, Table 16-14 |
| Data symbol at 6.8 Mb/s | 64 chips = 128.21 ns | Table 16-4 |
| STS gap | 512 chips | §16.2.9.1 |
| Channels | 5 (6489.6 MHz), 9 (7987.2 MHz) | Table 11-9; channel 9 is mandatory in the high band |
| Ranging counter width | 40 bits, wraps every 17.2 s (differences are taken mod 2⁴⁰) | model; the standard says "at minimum 32-bit" |

Internally every duration is a whole number of chips; the engine converts to integer ns once per PPDU
(`Math.round(chips × 1000 / 499.2)`) for the event clock, and keeps the exact chip count for the ranging maths.

### PPDU (standard): BPRF set 3, STS packet configuration 1 (SP1)

Every RFRAME in this slice is BPRF set 3 of Table 16-31: SYNC 64 symbols, SFD 8 symbols (SFD #2), one STS segment of
64 × 512 chips, PHR at 850 kb/s, PSDU at 6.8 Mb/s, STS between SFD and PHR (Figure 16-3, configuration 1).

| Field | Chips | Duration |
|---|---|---|
| SYNC (64 × 508) | 32 512 | 65.128 µs |
| SFD (8 × 508) | 4 064 | 8.141 µs |
| STS: gap 512 + active 64 × 512 + gap 512 | 33 792 | 67.692 µs |
| PHR: 19 symbols × 512 | 9 728 | 19.487 µs |
| PSDU: (8·N + 48 RS parity + 2 tail) symbols × 64 | 64·(8N + 50) | 128.21 ns per symbol |

`uwbPpduChips(octets) = 80 096 + 64·(8·octets + 50)` and `uwbPpduNs(octets)` is its rounding. The Reed-Solomon
(63,55) code adds 48 parity bits per block of up to 330 bits (§16.3.3.2); only the 62-octet four-anchor Final (496 bits) spans two blocks; the
function adds 48 per started block. Worked values, pinned by tests: 14 octets 181.218 µs, 20 octets 187.372 µs,
24 octets 191.474 µs, 30 octets 197.628 µs, 39 octets 206.859 µs, 62 octets 236.603 µs (two RS blocks).

**RMARKER** (§10.29.1.1): the time the first chip after the SFD is at the antenna, i.e. 36 576 chips = 73.269 µs after
the PPDU start (`UWB_RMARKER_CHIPS`). Every ranging counter value refers to it.

### Frames (standard format, model sizing)

MHR = Frame Control 2 + Sequence Number 1 + Destination PAN 2 + Destination short address 2 + Source short address 2
= 9 octets; FCS 2 octets; every payload IE has a 2-octet header. IE content sizes are model choices made from the
field lists of §10.29.8 and §10.32.9 and are constants in `phy.ts`:

| Frame (`FrameKind`) | Contents | Octets |
|---|---|---|
| `uwbPoll` — RCM and ranging initiation message merged (Figure 10-225, "RCM & I1") | MHR 9 + ARC IE 10 (control 2, block 2, round 2, slot 2) + RDM IE 3 + 3N (count 1; address 2 + slot 1 per device) + RRMC IE 3 + FCS 2 | 27 + 3N |
| `uwbResp` — ranging response | SS-TWR: MHR 9 + RRMC IE 3 + RRTI IE 6 (reply time 4) + FCS 2. DS-TWR: without the RRTI IE | 20 (SS) / 14 (DS) |
| `uwbFinal` — ranging final (DS-TWR only) | MHR 9 + RMI IE 3 + 6N (address 2 + round-trip time 4 per responder) + N × RRTI IE 6 + FCS 2 | 14 + 12N |
| `uwbReport` — measurement report (DS-TWR only, responder → initiator) | MHR 9 + RMI IE 13 (address 2, reply time 4, round-trip time 4) + FCS 2 | 24 |

`durationFieldNs` is 0 (a 15.4 RFRAME sets no NAV), `mbps` 6.81, `mode` undefined. `FrameDesc.uwb` carries the SP
configuration, the block/round/slot the frame was sent in, the IE names present, and the numbers the IEs carry
(reply times, round-trip times) in RCTU.

### Propagation and reception (`src/uwb/channel.ts`, model unless stated)

- **Propagation delay is real.** A frame transmitted at t reaches a node at distance d at `t + Math.ceil(d / c)` ns
  (RX_START phase 1). The Wi-Fi channel has no delay; here it is the whole point.
- Path loss: free-space loss at 1 m = 20·log10(4π·f / c) — 48.7 dB on channel 5, 50.5 dB on channel 9 — plus
  20·log10(d) (exponent 2.0: UWB indoor line-of-sight, model) plus the existing per-wall table (drywall 5, brick 12,
  glass 3 dB, model). Noise is not modelled as such: reception is a sensitivity test.
- Transmit power default −14 dBm (FCC/ETSI mean EIRP −41.3 dBm/MHz over the 499.2 MHz channel; model default in the
  editor). Receiver sensitivity `UWB_RX_SENS_DBM = −93` at 6.8 Mb/s BPRF (model, typical of commercial HRP chips).
  Budget: 26.6 m on channel 9 with no wall, 6.7 m through one brick wall.
- A node hears only when it is listening (its device says so); a sleeping node gets no record.
- Two frames overlapping at a listening receiver: the stronger is received if it is ≥ 6 dB above the other
  (`UWB_CAPTURE_DB`, model), otherwise both fail with RX_FAIL `collision`. Time-scheduled rounds never collide in this
  slice; the rule exists so a second session or a misconfigured schedule behaves.
- **NLOS excess delay.** Each wall on the direct path adds a positive delay to the arrival time the receiver measures
  (the first path is attenuated and the receiver locks to a later one): drywall 0.5 ns, brick 2.0 ns, glass 0.2 ns
  (`UWB_NLOS_NS`, model). It biases the counter, not the event clock.
- No interaction with the Wi-Fi channel in this slice (different bands; 6 GHz coexistence is a later slice).

### Clocks and ranging counters (`src/uwb/clock.ts`)

Each UWB node has a crystal with offset `ppm` (configured, or drawn uniformly in [−20, +20] ppm from its seeded RNG:
§16.4.9 allows ±20 ppm) and an arbitrary counter origin (uniform in [0, 2⁴⁰) RCTU; it cancels in every difference).
For an RMARKER event at true time T (float ns):

```
counter(T) = (origin + T · (1 + ppm·1e−6) / RCTU_NS + noise) mod 2⁴⁰, rounded to an integer RCTU
```

- Transmit counters are exact (`noise = 0`: the device knows when it transmits; `phyTxRmarkerOffset` is calibrated).
- Receive counters add Gaussian noise with σ = `tsNoisePs` (default 100 ps ≈ 3 cm, model) and the NLOS excess delay
  of the path.
- A receiver also estimates the transmitter's clock offset relative to its own, `coffs = (ppm_tx − ppm_rx)·1e−6 +
  N(0, cfoNoisePpm·1e−6)` (default σ 0.2 ppm, model), the standard's ranging tracking offset / interval
  (§10.29.1.6) collapsed to one number.

All draws come from the node's own RNG stream (`root.fork(hashStr(id + '#uwb'))`), so replays are bit-identical and
existing Wi-Fi scenarios keep their streams.

### Two-way ranging maths (`src/uwb/ranging.ts`, pure functions, standard formulas)

With A the initiator and B the responder, times in RCTU:

- **SS-TWR** (§10.29.1.2.2): `Tround = rxResp_A − txPoll_A`, `Treply = txResp_B − rxPoll_B`,
  `tofRaw = (Tround − Treply) / 2`. Clock error: `tofRaw − Tprop = Tprop·eA + ½·Treply·(eA − eB)`; with a 2 ms reply
  and 20 ppm between the crystals that is 20 ns = 6.0 m, growing with the reply time.
- **SS-TWR corrected** with the measured offset: `tof = (Tround − Treply·(1 − coffs)) / 2`, where coffs is B's clock
  rate relative to A's as A's receiver estimated it (derivation: `Treply·(1 − coffs)` is B's reply time expressed in
  A's units). The residual is `½·Treply·σ_cfo` ≈ 0.2 ns for the defaults.
- **DS-TWR, three messages** (§10.29.1.2.3, Figure 10-199): A measures `Tround1 = rxResp_A − txPoll_A` and
  `Treply2 = txFinal_A − rxResp_A`; B measures `Treply1 = txResp_B − rxPoll_B` and `Tround2 = rxFinal_B − txResp_B`;
  `tof = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)`. Symmetric reply times are not
  required; the clock error is in the low picoseconds ("IEEE 802.15.8-2017 Annex D").
- Every difference is taken mod 2⁴⁰. `metres(tofRctu) = tof · RCTU_NS · c`.
- **FoM** (§10.29.1.7, Figure 10-200, Tables 10-146…148) is encoded per receive counter: line-of-sight path → confidence
  level 97 %, interval 1 ns, scaling 0.5 (byte 0x16: "97 % within 0.5 ns"); a path through any wall → 75 %, 3 ns,
  scaling 4.0 (0x7B: "75 % within 12 ns"). Model mapping; reported, not used in the solver.

### Position (`src/uwb/position.ts`, pure functions, model)

`solvePosition(anchors: {id, x, y, z}[], ranges: {id, distM}[], zTag)` — Gauss–Newton on (x, y) with the tag's z
known, residual `r_i = ‖p − a_i‖ − d_i`, start at the anchors' centroid, 20 iterations or a step under 1 mm; needs ≥ 3
ranges. Returns the estimate, `gdop = √trace((JᵀJ)⁻¹)` (horizontal), and the 1-σ error ellipse from
`Σ = σ_r²·(JᵀJ)⁻¹` with `σ_r = √2·c·tsNoisePs` (two noisy receive counters per range): semi-axes `√λ₁, √λ₂` and the
major axis angle. The lesson quotes the closed forms for a square of anchors (at the centre, in the plane: JᵀJ = 2I,
GDOP 1.0, a circular ellipse of radius σ_r / √2); the test computes them from the same function.

## Part B — the ranging session (`src/uwb/session.ts`, `src/uwb/device.ts`, `src/uwb/network.ts`)

### Nodes and configuration

- `NodeKind` gains `'uwb'`. `NodeCfg.uwb: { role: 'anchor' | 'tag'; ppm?: number }` (required when `kind === 'uwb'`).
  Anchors are fixed and their positions are known to every tag (out-of-band, as in every deployment); tags are the
  devices whose position is wanted. `txPowerDbm` defaults to −14. `pos.z` is honoured (anchors near the ceiling, tags
  at hand height): ranges are 3-D, positions are solved in 2-D with the tag's z as configured (model).
- `Scenario.uwb?: UwbSessionCfg`, present whenever there are UWB nodes:

```ts
interface UwbSessionCfg {
  method: 'ss' | 'ds'        // default 'ds' (FiRa's default ranging round usage is DS-TWR deferred)
  blockRstu: number          // default 240 000 = 200 ms (FiRa)
  slotRstu: number           // default 2 400 = 2 ms (FiRa); ≥ 300 and a multiple of 3 so the slot is whole ns
  channel: 5 | 9             // default 9
  tsNoisePs: number          // default 100 (model)
  cfoNoisePpm: number        // default 0.2 (model)
  nlos: boolean              // default true: walls add excess delay (model); false for an ideal-timestamp lab
}
```

Schema rules: ≥ 1 anchor and ≥ 1 tag; every tag needs a round: `tags ≤ floor(blockRstu / (slots·slotRstu))`; ranges
are reported for every anchor, positions only when ≥ 3 anchors answered in the round.

### Roles and schedule (§10.32.2, time-scheduled)

The **tag is controller and initiator**; every anchor is a controlee and responder (the phone-and-anchors deployment;
the RDM IE in the poll assigns the slots, and the ARC IE carries the block structure). Round k of every block belongs to
tag k (ranging round index = tag index in scenario order; round hopping is out of scope). Transmission offset 0: every
frame starts at its slot boundary.

Round layout, N anchors:

| Slot | SS-TWR (N + 1 slots) | DS-TWR (2N + 2 slots) |
|---|---|---|
| 0 | Poll (RCM & I1, RRMC IE(0) with reply-time request) from the tag | Poll with RRMC IE(2) |
| 1 … N | Response from anchor i in slot i, RRTI IE = its reply time | Response from anchor i in slot i, RRMC IE(3) |
| N + 1 | — | Final from the tag: RMI IE (Tround1 per anchor), RRTI IE (Treply2 per anchor) |
| N + 2 … 2N + 1 | — | Measurement report from anchor i in slot N + 1 + i: RMI IE with Treply1 and Tround2 |

`roundNs = slots × slotNs`, `roundsPerBlock = floor(blockNs / roundNs)`; block b, round k, slot s starts at
`b·blockNs + k·roundNs + s·slotNs`. Between its round and the next block a tag is idle (radio off): the block structure
is what makes a coin cell last, and the lesson counts the radio-on time.

Who computes (§10.32.4, §10.32.5):

- SS-TWR: the tag, on each response (RRTI IE embedded): `UWB_RANGE` with `tofRaw` and the corrected `tof`.
- DS-TWR: each anchor after the Final (it holds all four times) — `UWB_RANGE` on the anchor lane — and the tag after
  each measurement report (which carries Treply1 and Tround2) — `UWB_RANGE` on the tag lane, the same number.
- Position: the tag, at the end of its round, from the anchors that answered (corrected SS ranges or DS ranges).

Missing frames: a device that expects a frame in a slot listens (state `uwbWait`, shown as a `slot` span) until the
slot ends, then emits `UWB_TIMEOUT` and drops that anchor from the round (no response → no Final entry → no report;
a lost Final → no report from that anchor → the tag times out on the report slot).

### Records (`src/uwb/records.ts`; the `UWB_` prefix is the dispatch key)

- `UWB_ROUND { node: tag, block, round, slots, slotNs, method, untilNs }` at the poll's slot start.
- `UWB_SLOT { node: tag, slot, untilNs }` at each slot start of its round (ticks on the tag lane).
- `UWB_TS { node, dir: 'tx' | 'rx', peer, frameKind, counter, fom? }` — a ranging counter value at an RMARKER (the
  event-log line is how a learner sees the counters that the formulas consume).
- `UWB_RANGE { node, peer, method, tofRctu, tofRawRctu?, distM, trueDistM, fom, block, round }`.
- `UWB_POSITION { node: tag, x, y, trueX, trueY, gdop, ellipse: { a, b, thetaRad }, anchors: string[], block }`.
- `UWB_TIMEOUT { node, slot, peer, expected: FrameKind }`.
- `MAC_STATE` with the new `MacStateName` `'uwbWait'`; the existing `idle`, `rx`, `tx` otherwise.
- The core `TX_START / TX_END / RX_START / RX_OK / RX_FAIL` carry the UWB frames as they carry Wi-Fi ones.

### View (`src/uwb/view.ts`)

```ts
interface UwbNodeView {
  role: 'anchor' | 'tag'
  block: number; round: number; slot: number | null
  rounds: number; timeouts: number
  /** Per peer: the latest range and its truth, and how many rounds contributed. */
  ranges: Record<string, { distM: number; trueDistM: number; method: 'ss' | 'ds'; fom: number; n: number }>
  /** Tags: the latest position solution. */
  position: { x: number; y: number; trueX: number; trueY: number; gdop: number; ellipse: { a: number; b: number; thetaRad: number }; n: number } | null
}
```

The reducer applies the six records; snapshot/replay equivalence covers them.

## Part C — UI

- **Lanes**: a UWB node is one lane (bare id). Spans: `tx`, `rx`, `slot` (armed), nothing when idle. Slot ticks on the
  tag lane from `UWB_SLOT`. UWB frames get one colour family (amber) in `laneLayout` and the scene wavefronts.
- **Event log**: lines for the six UWB records (`fmtUwbRecord`), e.g. `tag-1 RX RMARKER ← anchor-2 resp: counter
  184467440737 (97 % within 0.5 ns)` and `tag-1 range → anchor-2 (DS): 5.03 m (true 5.00 m)`.
- **Inspector** (`UwbInspector`): role, block / round / slot, a per-anchor table (measured, true, error, FoM, rounds),
  and for a tag its position (estimate, true, error, GDOP, ellipse axes).
- **Frame detail**: `uwbFrameFields` (Frame Control, Sequence Number, Destination PAN, addresses, each IE with its
  fields and values, FCS: octet sums equal `frame.bytes`) and `uwbPpduLayout` (SYNC, SFD, STS gap / active / gap, PHR,
  PSDU: durations sum to `frame.txTimeNs`, with the RMARKER position marked).
- **3-D scene** (`UwbOverlay`): anchors are small boxes at their z, tags a flat slab; after a round, a thin ring of
  radius = measured range around each anchor that answered (fades over the block), a cross at the tag's estimate and
  its 1-σ ellipse drawn on the floor. Range rings are the picture of trilateration; the ellipse is the picture of GDOP.
- **Editor**: node kinds **UWB anchor** and **UWB tag** (place, drag, name, z, crystal ppm, tx power); a **UWB
  session** section (method, block, slot, channel, timestamp noise, clock-estimate noise, NLOS) shown when the plan has
  UWB nodes; the spawn tool can add both; a scenario may have no AP if it has no station and no AMP tag (the AP row's
  delete button follows that rule). Editor guide text for the new objects.
- **Guide** tab: section "11 · UWB ranging" (EN/ZH). **Glossary** group `uwb`: UWB, HRP UWB PHY, RMARKER, ranging
  counter / RCTU, RSTU, STS, SP1, SS-TWR, DS-TWR, ranging block / round / slot, controller / controlee, initiator /
  responder, RRTI / RMI / ARC / RDM IE, FoM, NLOS, GDOP, error ellipse.
- **i18n**: every new string in both tables.

## Part D — course

A new track. `TIERS[4] = { track: 'uwb', en: 'UWB Tier 1 · Ranging foundations', zh: 'UWB 第一阶段 · 测距基础' }`;
`MODULES` gain `{ tier: 4, 'Time of flight' / '飞行时间' }` (index 11) and `{ tier: 4, 'Ranging sessions and
positioning' / '测距会话与定位' }` (index 12). `COURSE_ORDER` appends the five ids after `capstone`. Lesson kit
gains `anchor()`, `uwbTag()`, `uwbSc()` builders and `firstUwb*` jump predicates.

1. **`uwb-intro` — Timestamps, not throughput** / 时间戳，而非吞吐量. One anchor and one tag 5.00 m apart, SS-TWR,
   both crystals set to 0 ppm so the raw formula is exact, NLOS off. Concept: a chip of 2 ns, a counter unit of
   15.65 ps, the SP1 frame anatomy and the RMARKER, why a 5 m link shows RX_START 17 ns after TX_START (the
   Wi-Fi engine never showed a delay), the SS-TWR formula. Variant: 20 m apart. Pinned: the constants table, the
   PPDU field durations and the 30-octet poll airtime, the RMARKER offset, the 17 ns / 67 ns arrival delays, the
   measured distance within 3σ_r of the truth (σ_r = √2·c·100 ps = 4.2 cm), and the formula recomputed from the
   `UWB_TS` records.
2. **`uwb-sstwr` — The clock inside the reply time** / 回复时间里藏着的时钟. Four anchors in slots 1–4, one tag; tag
   crystal +10 ppm, anchors −10 ppm; SS-TWR. Concept: Treply is measured by the other side's clock, the error
   `½·Treply·(eA − eB)`, why it grows with the slot index, the tracking offset and the corrected formula. Variants:
   0 ppm; ±1 ppm (a TCXO). Pinned: raw errors of 6.0 / 12.0 / 18.0 / 24.0 m (± noise) for anchors 1–4, corrected
   errors within 3σ, the 0 ppm variant's raw error within noise.
3. **`uwb-dstwr` — Two round trips cancel the clock** / 两次往返，抵消时钟. Same scene, DS-TWR. Concept: the
   three-message exchange, the Final's RMI and RRTI IEs, the formula and why the asymmetry does not matter, the cost
   (2N + 2 = 10 slots, 20 ms, versus 5 slots). Pinned: every anchor's error within 3σ at ±10 ppm, the round's slot
   count and duration, the Final's 62 octets and 236.6 µs, the four airtimes of a DS round.
4. **`uwb-blocks` — Blocks, rounds and slots** / 块、轮与时隙. Three tags, four anchors, block 200 ms, DS-TWR.
   Concept: the FiRa block, tag k owns round k, the ARC / RDM IEs, transmission at the slot boundary, and the radio-on
   time: a tag's radio is on for its own round only. Variant: 600 RSTU slots (a 5 ms round). Pinned: round k start
   = k × 20 ms, block period 200 ms, a block's total airtime and channel occupancy, a tag's radio-on share (10 % at
   2 ms slots, 2.5 % at 0.5 ms), positions for all three tags every block.
5. **`uwb-position` — From four ranges to a point** / 从四个距离到一个点. Four anchors in the corners of the
   one-room lab, a tag near the centre, DS-TWR, then a variant with a brick wall between the tag and one anchor and a
   variant with three anchors. Concept: trilateration as least squares, the range rings in the scene, GDOP, the
   error ellipse, what a wall does (a 2 ns bias is 0.6 m on one range and a smaller, directional shift of the fix).
   Pinned: the LOS position error within the 3σ ellipse, GDOP at the centre (closed form), the NLOS anchor's bias of
   0.60 m ± noise and the resulting position error band, the three-anchor GDOP.

Every empirical claim is pinned by `tests/course/uwb-*.test.ts`. The lesson contract (EN + ZH, concept → scenario →
observe → try this → quiz, 15–25 minutes by `lessonMinutes`) applies unchanged. The five scenarios join the
timeline-hash fixture.

## Testing

- `tests/uwb/phy.test.ts`: every constant and airtime above; RMARKER offset; chips-to-ns rounding.
- `tests/uwb/clock.test.ts`: counter = origin + T·(1 + ppm) / RCTU; wrap at 2⁴⁰ and mod-2⁴⁰ differences; TX exact,
  RX noisy; determinism from the seed.
- `tests/uwb/ranging.test.ts`: SS raw and corrected against closed forms with synthetic counters; DS with asymmetric
  reply times and ±20 ppm within 1 ps; FoM byte encoding.
- `tests/uwb/position.test.ts`: exact recovery from exact ranges (square and triangle); GDOP and ellipse closed forms
  at the centre of a square; the three-anchor case; fewer than three ranges → null.
- `tests/uwb/channel.test.ts`: RX_START at ceil(d / c); sensitivity cut-off at −93 dBm; wall loss and NLOS bias;
  capture at 6 dB else collision; a non-listening node hears nothing.
- `tests/uwb/session.test.ts`: slot times for block / round / slot; SS and DS round layouts; who emits `UWB_RANGE`;
  timeouts when an anchor is out of range; three tags in three rounds; the tag's idle time.
- `tests/uwb/network.test.ts`: end-to-end SS and DS ranges within tolerance; positions; two scenarios with the same
  seed replay identically; a Wi-Fi + UWB scenario runs both engines and the Wi-Fi records are unchanged.
- Model: schema rules; view reducer snapshot/replay equivalence with UWB records; `uwbFrameFields` and
  `uwbPpduLayout` sums; `laneIds`.
- UI: `fmtUwbRecord` lines; lane spans for `uwbWait`; colours defined for the four kinds.
- Existing: every lesson hash unchanged (`tests/engine/lesson-hashes.test.ts`), 753 tests green.

## Out of scope (next UWB slices, in order)

1. Wi-Fi 6E and UWB channel 5: the 6 GHz Wi-Fi PPDU as UWB interference (the receiver's −45 dBm/MHz limit and
   detection loss), UWB frames as Wi-Fi energy detect.
2. Contention-based rounds (RCPS IE), round hopping, interval-based mode, RCUM / RIUM.
3. One-way ranging: DL-TDoA (synchronised anchors, the tag only listens) and UL-TDoA (blinks).
4. Angle of arrival (two-antenna phase difference) and the SP3 packet.
5. IEEE 802.15.4ab: multi-millisecond UWB, narrowband-assisted ranging, sensing.
