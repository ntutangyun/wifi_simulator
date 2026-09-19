# UWB slices 3–6: 6 GHz coexistence, contention-based rounds, TDoA, angle of arrival — design

Date: 2026-09-19
Status: continuation of `2026-09-18-uwb-ranging-design.md` (its "Out of scope" list, items 1–4). Slice 7 (IEEE
802.15.4ab) gets its own spec once the TG4ab corpus is searchable.

## Purpose

The first two UWB plans built a ranging engine that lives in its own band and knows one way to range (time-scheduled
two-way ranging) and one way to locate (trilateration). Real deployments are neither so quiet nor so simple. This
spec adds, in four independent slices that each ship working software and one or more lessons:

3. **6 GHz coexistence** — UWB channel 5 (6 240–6 739 MHz) overlaps Wi-Fi 6E. A Wi-Fi 6 GHz PPDU is in-band
   interference for a UWB receiver, and a UWB frame raises the noise floor of a Wi-Fi 6 GHz receiver. The two engines
   learn to hear each other.
4. **Contention-based rounds** — the controller does not know which anchors exist; responders pick a response slot at
   random (§10.32.2 schedule mode 0, RCPS / RCMA IEs). Collisions, capture and retries, the way the AMP module taught
   them for Wi-Fi.
5. **One-way ranging (TDoA)** — a tag that only listens (DL-TDoA) or only blinks (UL-TDoA); hyperbolic positioning;
   why it scales to any number of tags and what it costs in synchronisation (§10.29.1.2.5).
6. **Angle of arrival** — a two-antenna anchor measures the phase difference of arrival and reports an azimuth; one
   anchor with range and angle is a fix (§10.29.1.1 lists AoA among ranging results; the PDoA method is model /
   FiRa-style).

Each slice follows the same rules as before: standard numbers tagged **standard §…**, FiRa profile values tagged
**FiRa**, our choices tagged **model**; every lesson sentence pinned by a test; existing scenarios replay
bit-identically (the coupling of slice 3 is off unless a scenario turns it on).

### Course placement

A second UWB tier: `TIERS[5] = { track: 'uwb', en: 'UWB Tier 2 · Sessions in the real world', zh: 'UWB 第二阶段 ·
真实环境中的会话' }`; modules `{ tier: 5, 'Coexistence' / '共存' }` (index 13) and `{ tier: 5, 'Other ranging modes' /
'其他测距模式' }` (index 14). `COURSE_ORDER` appends `uwb-coexist`, `uwb-contention`, `uwb-dl-tdoa`, `uwb-ul-tdoa`,
`uwb-aoa` after `uwb-position`.

## Slice 3 — Wi-Fi 6E and UWB channel 5

### The 6 GHz Wi-Fi operating channel

The Wi-Fi engine's 6 GHz link has had no centre frequency. `Scenario.sixGhzCenterMhz` (default **5 985**, the first
80 MHz block, 802.11ax 6 GHz channel 7) names it; the link's width comes from the negotiated channel width as today.
Overlap with UWB channel 5 is the fraction of the Wi-Fi channel inside 6 240–6 739.2 MHz: 0 at the default, 1.0 for
channel 71 (6 305 MHz, 80 MHz: 6 265–6 345) — the coexistence lesson's setting. UWB channel 9 (7 987.2 MHz) never
overlaps. With overlap 0, or without both engines, nothing below runs and no record changes.

### The coupling (`src/engine/spectrum.ts`, core)

A `Spectrum` object is created by `Simulation` when a scenario has both a 6 GHz Wi-Fi link and a UWB session on
channel 5 with overlap > 0. Each channel registers its live emissions and asks for foreign power:

```ts
interface Emission { txId: string; startNs: Ns; endNs: Ns; eirpDbm: number; bandLoMhz: number; bandHiMhz: number; pos: Vec3 }
class Spectrum {
  /** Called by a channel when one of its transmissions starts/ends. Notifies the other channel's listener. */
  emit(source: 'wifi' | 'uwb', e: Emission): void; retire(source, e): void
  onChange(target: 'wifi' | 'uwb', fn: (t: Ns) => void): void
  /** Foreign power (mW) at a receiver, inside [loMhz, hiMhz], summed over the other technology's live emissions. */
  foreignMw(target: 'wifi' | 'uwb', rxPos: Vec3, loMhz: number, hiMhz: number, walls: Wall[]): number
}
```

Path loss for a foreign emission uses the **transmitter's** model (a Wi-Fi 6 GHz frame reaches a UWB receiver with the
Wi-Fi table's law: 46.7 dB + 30·log10 d + walls + 1.2 dB; a UWB frame reaches a Wi-Fi receiver with UWB's law:
50.5 or 48.7 dB + 20·log10 d + walls). Only the overlapping part of the emitter's band counts: a Wi-Fi PPDU's power
times its overlap fraction; a UWB frame's −14 dBm EIRP spread over 499.2 MHz gives −14 + 10·log10(W_overlap / 499.2)
dBm inside a Wi-Fi channel W wide (−22 dBm for 80 MHz fully inside). Model, stated in the lesson.

- **Wi-Fi side.** `Channel.interferenceMw(rid, lock)` adds `spectrum.foreignMw('wifi', pos, lo, hi)`; when the
  spectrum reports a change, every open lock's `maxInterfMw` is re-evaluated (the existing max-over-time rule). CCA:
  foreign energy joins the energy-detect sum (a UWB frame is far below −62 dBm past 30 cm, so this never trips in the
  lesson — and the lesson says so). Preamble detection uses the same SINR test as today, with foreign power in the
  noise term.
- **UWB side.** `UwbChannel` tracks, per open reception, the maximum foreign Wi-Fi power inside 6 240–6 739 MHz
  seen at the receiver; at the reception's end, if `rssi − maxForeignDbm < UWB_SIR_MIN_DB` the frame fails with
  `RX_FAIL { reason: 'lowSinr' }`. `UWB_SIR_MIN_DB = −12` (model: a UWB receiver's correlation gain lets it decode
  under interference up to 12 dB above the wanted signal; the standard specifies only the −45 dBm/MHz maximum input,
  §16.4.10). New `UwbRxInfo.foreignDbm` for the log; a new record `UWB_INTERFERED { node, from, foreignDbm, sirDb }`
  when a frame is lost to Wi-Fi, so the lesson can count them.
- Determinism: spectrum changes are applied in the same event phase as the channels' own propagation effects
  (phase 1), ordered by the event queue's seq.

### Lesson `uwb-coexist` — "Sharing 6 GHz" / 共享 6 GHz (module 13)

Scenario: the four-corner anchor lab of lesson 5 with one tag, DS-TWR on **channel 5**, plus a Wi-Fi 7 AP (6 GHz link,
80 MHz, `sixGhzCenterMhz: 6305`) with a laptop running a saturated download. Variants: UWB channel 9 (no overlap);
Wi-Fi channel 7 (`sixGhzCenterMhz: 5985`, no overlap); Wi-Fi idle. Pinned: the overlap fractions; the in-band
power the tag sees from the AP's PPDUs at its distance; the count of `UWB_INTERFERED` per second and the resulting
missed positions; the same tag on channel 9 losing nothing; the laptop's throughput with and without UWB rounds
(the noise rise in dB at the laptop while a UWB frame is on air and its effect, if any, on the MCS chosen); the
statement that CCA never sees UWB (no CCA_BUSY caused by UWB frames).

## Slice 4 — Contention-based rounds

### Configuration and behaviour

`UwbSessionCfg.schedule: 'time' | 'contention'` (default `'time'`); `contentionSlots` (default 8, the RCPS IE's
response-phase window, model default); `maxAttempts` (default 3, RCMA IE, model default). Contention applies to
SS-TWR rounds (the response is the only anchor-originated frame); a DS-TWR session with contention is rejected by the
schema (the report phase would need a second contention window — later, if ever).

Round layout with contention: slot 0 poll (RCM & I1 with RCPS IE `[1, contentionSlots]` and RCMA IE); slots
1…contentionSlots: each anchor that decoded the poll draws a slot uniformly from its own RNG stream and answers there
(RRTI embedded as today). Two anchors in one slot collide at the tag under the channel's 6 dB rule; an anchor whose
response was not heard (no `UWB_RANGE` for it — the tag's Final does not exist in SS, so the anchor learns nothing;
model: the anchor retries in the next round up to `maxAttempts` rounds, then sits out one round) — the lesson says
the standard leaves the filtering of wrong results to the upper layer (§10.32.1 NOTE). The tag's position uses the
anchors it heard. Records: `UWB_CONTEND { node: anchor, slot, attempt }` when the anchor draws; `COLLISION` from the
channel as today; `UWB_ROUND.slots` reflects the contention window.

### Lesson `uwb-contention` — "When the controller does not know who is there" / 控制器不知道有谁在场 (module 14)

Six anchors around one tag, SS-TWR, `contentionSlots` 4 / 8 / 16 as variants. The small analytic model as in the AMP
slots lesson: with N anchors and S slots, P(a given anchor's slot is uncontested) = (1 − 1/S)^(N−1); expected
successful responses per round N·(1 − 1/S)^(N−1); measured over 30 rounds against the formula within a stated
tolerance. Pinned: per-round counts for the first rounds, the 30-round success fraction, the slot count and round
duration per variant, that a captured response (6 dB) counts as a success.

## Slice 5 — One-way ranging: DL-TDoA and UL-TDoA

### DL-TDoA (the tag listens)

`UwbSessionCfg.mode: 'twr' | 'dl-tdoa' | 'ul-tdoa'` (default `'twr'`). In DL-TDoA the **anchors** run the round
(FiRa-style, model): anchor 0 is the initiator/controller and sends the poll in slot 0; anchors 1…N−1 respond in
slots 1…N−1; anchor 0 sends a Final in slot N. Every message carries the sender's TX counter and the RX counters it
holds for the others (the RMI-style content, sized like the existing IEs: 4 octets per time). A tag never transmits:
it listens to the whole round, timestamps each arrival on its own clock, and computes for each responder i the
time-difference of arrival relative to anchor 0:

```
Δ_i = (rx_i − rx_0)_tag − (tx_i − tx_0)_common
```

where the anchors' transmit instants are put on anchor 0's timebase by the anchors themselves from the poll/response
exchange (each responder's reply time on its own clock, corrected by its clock offset to anchor 0, plus the known
anchor-to-anchor flight time; model, this is what real DL-TDoA does out of band). The tag's own clock rate does
**not** cancel: the differences span up to a whole round, and 20 ppm over 20 ms is 0.4 µs, i.e. 120 m. So the tag
corrects its rate first: it measures the poll-to-Final interval on its own clock and compares it with the true
interval the anchors report (slot arithmetic in anchor 0's timebase); the ratio is its rate error, and the residual
after correction is the offset-estimate noise (0.2 ppm × 20 ms = 4 ns = 1.2 m worst case at the end of the round,
much less for the early responders — the lesson quotes the measured values). The lesson makes this its centrepiece:
with an uncorrected tag clock DL-TDoA is useless; with the correction it works to decimetres, and TWR remains the
centimetre method.

Position: hyperbolic least squares in `position.ts` — `solveTdoa(anchors, deltas: {id, dtNs}[], zTag, sigma)`,
Gauss–Newton on (x, y) with residuals `(‖p − a_i‖ − ‖p − a_0‖) − c·Δ_i`, ≥ 3 differences (4 anchors), GDOP and
ellipse from the difference Jacobian. Records: `UWB_TDOA { node: tag, ref, peer, dtNs, trueDtNs, block, round }`,
`UWB_POSITION` with `method: 'dl-tdoa'`. Any number of tags listen to the same round: `tags ≤ roundsPerBlock` no longer
applies in this mode (every tag positions itself every round).

### UL-TDoA (the tag blinks)

The tag sends one short blink (SP1, 14-octet frame: MHR + FCS + a 3-octet blink IE, model) in its round's slot 0 and
nothing else. Anchors timestamp it; the anchors share a timebase (model: anchor 0's clock, the others calibrated to
it — "wired sync"; the lesson says real systems do this over the air or with a cable). The infrastructure (anchor 0's
lane) computes the differences and the position: `UWB_TDOA` records on anchor 0 with `peer` = each anchor, and
`UWB_POSITION { node: anchor0, method: 'ul-tdoa', of: tagId }` — the view stores it on the **tag's** lane too (the
`of` field routes it) so the overlay draws it at the tag. Round cost: one slot per tag; a block holds
`blockRstu / slotRstu` tags (240 000 / 2 400 = 100).

### Lessons

- `uwb-dl-tdoa` — "Listen-only positioning" / 只听不发的定位 (module 14): four anchors, three tags listening; the
  clock-correction centrepiece (variant: correction off, pinned error in metres); position error and GDOP for the
  hyperbolic geometry (worse near the anchors' baseline than TWR); privacy and scale (no uplink, unlimited tags).
- `uwb-ul-tdoa` — "One blink per tag" / 每个标签一次闪发 (module 14): ten tags blinking in ten slots; positions on the
  infrastructure side; the cost per tag (one 181 µs frame every 200 ms); what perfect sync buys (variant: 1 ns of
  residual sync error per anchor, model, pinned position error).

## Slice 6 — Angle of arrival

### Model

`UwbNodeCfg.yawDeg` (anchors; default 0 = boresight along +x; the editor exposes it) and `UwbSessionCfg.aoa: boolean`
(default false). An AoA-capable anchor has two antennas spaced `d = λ/2` at the session's channel (λ = c/f: 3.75 cm on
channel 9, 4.62 cm on channel 5). For a frame from a tag at true azimuth θ (from boresight, −90…+90°), the anchor
measures a phase difference `Δφ = 2π·(d/λ)·sin θ + N(0, σ_φ)` with `σ_φ = 0.15 rad` (model), unwraps nothing (d = λ/2
is unambiguous over ±90°), and reports `θ̂ = asin(Δφ / (2π d/λ))` clamped to ±90°. Behind the anchor (|θ| > 90°) the
estimate is mirrored — the lesson shows it and the editor's yaw fixes it. The angle error is `σ_θ ≈ σ_φ / (π cos θ)`:
2.7° at boresight, 5.4° at 60°.

Records: `UWB_AOA { node: anchor, peer: tag, thetaDeg, trueThetaDeg, block, round }` on every response the anchor
receives (SS or DS); with `aoa` on, the anchor also computes a single-anchor fix from its range and angle,
`p = a + r·(cos(yaw + θ̂), sin(yaw + θ̂))`, and emits `UWB_POSITION { node: anchor, method: 'aoa', of: tagId }` with an
ellipse whose semi-axes are `σ_r` along the bearing and `r·σ_θ` across it. The tag's own trilateration continues
unchanged.

### Lesson `uwb-aoa` — "One anchor is enough" / 一个锚点就够了 (module 14)

One anchor at the room's centre wall facing in, one tag moving through three positions across variants (boresight
2 m, 45° at 4 m, 70° at 6 m); pinned: the phase difference and angle for each, the angle error band, the cross-range
error `r·σ_θ` growing with distance while the range error stays 2 cm, the mirrored estimate for a tag behind the
anchor, and the two-antenna spacing in centimetres per channel.

## Records and view (summary of additions)

| Record | Emitted by | Fields |
|---|---|---|
| `UWB_INTERFERED` | UWB channel | node, from, foreignDbm, sirDb |
| `UWB_CONTEND` | anchor | node, slot, attempt |
| `UWB_TDOA` | tag (DL) / anchor 0 (UL) | node, ref, peer, dtNs, trueDtNs, block, round |
| `UWB_AOA` | anchor | node, peer, thetaDeg, trueThetaDeg, block, round |
| `UWB_POSITION` | as before + `method: 'twr' \| 'dl-tdoa' \| 'ul-tdoa' \| 'aoa'`, optional `of` | |

`UwbNodeView` gains `interfered`, `contend: { slot, attempt } | null`, `tdoa: Record<peer, {dtNs, trueDtNs}>`,
`aoa: Record<peer, {thetaDeg, trueThetaDeg, n}>`; `position` gains `method`. The overlay keeps rings for TWR; for
TDoA it draws the fix and ellipse only (hyperbolae are a later nicety); for AoA it draws a bearing line from the anchor
at `yaw + θ̂`, length r. Inspector rows for each. Event-log lines for
each. Editor: `sixGhzCenterMhz` in the plan settings (with the 6E channel number it equals), `yawDeg` on anchors,
`schedule` / `contentionSlots` / `maxAttempts` / `mode` / `aoa` in the session section.

## Testing (per slice)

- Slice 3: overlap fraction function; foreign power arithmetic at a receiver for both directions; a Wi-Fi PPDU
  overlapping a UWB reception fails it exactly when `rssi − foreign < −12 dB`; a UWB frame raises the Wi-Fi lock's
  `maxInterfMw` by the computed amount; no record changes when overlap is 0; every existing lesson hash unchanged;
  the coexistence lesson's claims.
- Slice 4: schema (contention only with SS); slot draw uniform and deterministic; collision at the tag under the 6 dB
  rule; retries and sit-outs; the analytic formula vs 30-round measurement; the lesson's claims.
- Slice 5: `solveTdoa` closed forms (exact recovery, GDOP on the square, null with < 3 differences); the tag-clock
  correction (error with/without); DL-TDoA end to end for three tags; UL-TDoA end to end for ten tags; `of` routing in
  the view; the two lessons' claims.
- Slice 6: phase model and its inverse; `σ_θ` growth; mirrored estimate; single-anchor fix ellipse; the lesson's claims.

## Out of scope (after these four)

IEEE 802.15.4ab (multi-millisecond UWB, narrowband-assisted MMS, sensing) — own spec; hyperbola drawing; round
hopping and interval-based mode; STS key management; LRP UWB.
