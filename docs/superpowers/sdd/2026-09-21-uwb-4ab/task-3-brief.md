### Task 3: The pairwise MMS cycle — session, network, device, records, view, log, inspector, frame decoder

**Files:** modify `src/uwb/session.ts` (`RoundPlan.mms?: MmsPhy & { layout: MmsLayout; report: NbReportMode; nbChannels; nbLbt }`,
`SlotAction` for MMS), `src/uwb/network.ts` (pair rounds, NB channel per block, block-fix hook), `src/uwb/device.ts`
(MMS branch), `src/uwb/records.ts`, `src/uwb/view.ts`, `src/uwb/format.ts`, `src/ui/format.ts` (labels), `src/uwb/ui/rows.ts`,
`src/uwb/ui/UwbInspector.tsx`, `src/uwb/frameFields.ts`, `src/model/lanes.ts` / `src/model/caps.ts` (kinds, colours),
`src/ui/i18n.ts` (record/inspector strings); tests `tests/uwb/network.test.ts` (+10), `tests/uwb/view.test.ts` (+2),
`tests/ui/uwb-format.test.ts` (+2), `tests/uwb/frameFields.test.ts` (+2), `tests/uwb/session.test.ts` (+2).

**Interfaces:**

```ts
// session.ts
export type SlotAction = … | { kind: 'nbPoll'; tx: 'tag' } | { kind: 'nbResp'; tx: 'anchor'; anchor: number }
  | { kind: 'uwbRsf' | 'uwbRif'; tx: 'tag' | 'anchor'; anchor: number; index: number }
  | { kind: 'nbReport'; tx: 'tag' | 'anchor'; anchor: number } | { kind: 'idle' }   // the second slot of each two-slot NB window, and unused rp slots
// roundPlan(cfg, anchors): mode 'mms' → slots = layout.slots, roundsPerBlock = floor(block/round), plan.mms set. slotAction(p, slot) for 'mms' follows the spec table; `anchor` is always 0 in the action — the network maps pair round r → anchor r mod A.
// network.ts: for 'mms', tags.forEach((tagId, t) => anchors.forEach((anchorId, k) => runRound(block, t·A + k, tagId, [tagId, anchorId]))); peers for a pair round = { tag, anchors: [anchorId] };
//   the NB channel of the block = nbChannelForBlock(cfg.mms.nbChannels, scenario seed, block), passed in beginRound via plan or a per-block arg;
//   at endRound of round t·A + A − 1 the tag solves its block fix before endRound clears (device does it; network only guarantees the order).
// records.ts
| { type: 'UWB_NB_LBT'; node: string; channel: number; foreignDbm: number; thresholdDbm: number; block: number; round: number }
| { type: 'UWB_MMS_TRAIN'; node: string; peer: string; kind: 'rsf' | 'rif'; fragments: number; heard: number; rxDbm: number; gainDb: number; marginDb: number; detected: boolean; ratioPpm: number | null; block: number; round: number }
// UWB_RANGE gains integrity?: boolean; UWB_TS.frameKind and UWB_TIMEOUT.expected take the widened UwbFrameKind.
// device.ts (MMS, both roles), state per pair round: primed: boolean; nbChannel; frags: { rsf: Map<index, { arrivalNs; rssiDbm }>; rif: … } of the peer; txRmarker counters; rxRmarker counter; ratio: number | null; reply/roundTrip; ranges kept across the block on the tag: blockRanges: Map<anchorId, range>.
//   onSlot: 'nbPoll' (tag): if nbLbtRequired and channel.lbtBusy → emit UWB_NB_LBT, nbSkipBlock = block, do nothing; else transmit makeNbPoll and expect nbResp in slot 2 (deadline slot 4).
//           'nbResp' (anchor, only if it received the POLL this round): LBT likewise; transmit; primed = true. Tag: on RX of nbResp → primed = true.
//           'uwbRsf'/'uwbRif' (own side): if primed (or, for the anchor, if it sent RESP) transmit makeRsf/makeRif with slot; emit UWB_TS tx at index 0 with counter = clock.counter(txStartNs) (NO UWB_RMARKER_NS offset). Peer side: if primed, listen (state uwbWait, expectation kind/from, open: false but no UWB_TIMEOUT for a missed fragment — a lost fragment is counted, not reported).
//           At the slot after the peer's last fragment of a kind: evaluateTrain(kind) → UWB_MMS_TRAIN; if detected and kind decides the RMARKER (rsf, or rif when X = 0): draws in the spec's order, rxRmarker counter, ratio (or null), UWB_TS rx.
//           'nbReport': the side that reports transmits makeNbReport with its times (responder: replyRctu = txRmarker − rxRmarker; initiator: roundTripRctu = rxRmarker − txRmarker); a side that lacks a detected train sends no report (and the other side times out: UWB_TIMEOUT expected 'nbReport').
//   onRxOk nbReport: compute range = ssTwrCorrected(roundTrip, reply, coffs) where coffs = ratio − 1 from the OWN train measurement when ratio !== null, else the NB carrier draw (gaussian·cfoNoisePpm·1e-6 + true offset) taken once at this point; emit UWB_RANGE { method: 'ss', integrity: Y > 0 ? rifDetected : undefined, tofRawRctu … } on the own lane; the tag stores it in blockRanges.
//   endRound: tag at its last pair round of the block → solvePosition from blockRanges (≥ 3) → UWB_POSITION { method: 'twr', block }, clear blockRanges; every MMS round ends with UWB_ROUND_END as today.
// view.ts: UwbNodeView.mms = { trains: Record<peer, { kind; heard; fragments; marginDb; detected; ratioPpm }>; nbChannel: number | null; lbtBusy: number; skippedBlocks: number } (skippedBlocks = distinct blocks with a busy LBT on this node); ranges keep `integrity`.
// format.ts / ui/format.ts: 'UWB_NB_LBT' → `${node} NB LBT busy on ch ${channel}: ${foreignDbm} dBm ≥ ${threshold} — skipping the block`; 'UWB_MMS_TRAIN' → `${node} ${kind.toUpperCase()} train ← ${peer}: ${heard}/${fragments} heard, ${rxDbm} dBm + ${gainDb} dB = margin ${marginDb} dB → ${detected ? 'detected' : 'lost'}${ratioPpm !== null ? `, ratio ${ratioPpm} ppm` : ''}`.
// frameFields.ts: fragment rows (kind, index / of, N_MSR, gap or STS length, length µs, TX power); NB rows (msg id, channel, centre MHz, reply / round-trip RCTU when present). lanes/caps: the five kinds with a colour for fragments and one for NB.
```

- [ ] Tests (`network.test.ts`, end to end on small scenes): the default pair round is 28 slots and the UWB_ROUND
  says `mode: 'mms'`; slot actions match the layout; the TX `UWB_TS` counter equals the clock's counter at the first
  fragment's TX instant (no SHR offset); an LOS 5 m scene ranges within 3 cm on every pair and the block fix lands
  after the last pair round with `method: 'twr'`; the two-wall scene (spec lesson geometry, X = 8) detects with margin
  1–2 dB and X = 4 does not (`UWB_MMS_TRAIN.detected` false, no `UWB_RANGE`); `ratioPpm` within 4σ (σ = 0.0202 ppm)
  of the true crystal difference; the corrected range error over 20 rounds is consistent with σ_r ≈ 2.1 cm (the
  timestamp floor), i.e. the ratio residual is invisible; X = 1 falls back to the NB carrier draw (the RNG stream
  advances by exactly one more draw than X = 2 per train — assert via a fresh `Rng` replay as the TDoA tests do);
  dropping the first fragment (a test hook or a wall of exactly the right loss) still yields an RMARKER within noise;
  mixed set 'mixed-5' sets `integrity: true`, and a RIF train pushed under threshold (extra wall) gives `integrity:
  false` with the range still present; report 'responder' → ranges on the tag lane only, 'initiator' → anchor only,
  'bi' → both with equal `distM` to 1 mm; `nbLbt: 'on'` with a mocked-busy spectrum (a tiny Spectrum with one live
  Wi-Fi emission) → `UWB_NB_LBT`, no POLL, the anchor's `UWB_TIMEOUT { expected: 'nbPoll' }`, and no further NB
  frame from that tag in the block; `nbChannels: [100, 150, 200, 210]` lands each block on `nbChannelForBlock`'s
  channel (read from the POLL's `uwb.nb.channel`); `mode: 'twr'` scenes unchanged (fixture). View/format/rows/
  frameFields/lanes: one test each.
- [ ] Commit `feat(uwb): the pairwise MMS ranging cycle — narrowband control and report, fragment trains, train-derived clock ratio, block fix`.

---

