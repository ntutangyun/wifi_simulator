### Task 2: Per-frame PHY in the UWB channel, `Emission.lossDb`, coupling gate

**Files:** modify `src/engine/spectrum.ts`, `src/engine/channel.ts` (pass `lossDb: wifiToUwbPathLossDb` in its
emissions), `src/uwb/channel.ts`, `src/uwb/frames.ts` (kinds + builders), `src/model/frames.ts` (if `FrameKind`
lives there), `src/engine/simulation.ts` (the mediator gate), `src/uwb/network.ts` (pass `mms` + seed to the channel);
tests `tests/engine/spectrum.test.ts` (+3), `tests/uwb/channel.test.ts` (+4), `tests/engine/simulation*.test.ts` (+2),
`tests/uwb/frames.test.ts` (+2).

**Interfaces:**

```ts
// spectrum.ts
export interface Emission { txId: string; eirpDbm: number; bandLoMhz: number; bandHiMhz: number; pos: Vec3;
  /** Path loss (dB) of THIS emission at distance dM through wallsDb of walls — the transmitter's own law. */
  lossDb: (dM: number, wallsDb: number) => number }
// delete uwbChannelOf / UWB_CHANNEL_MATCH_MHZ; emit() no longer validates a band; foreignMw uses e.lossDb.
// frames.ts
export type UwbFrameKind = 'uwbPoll' | 'uwbResp' | 'uwbFinal' | 'uwbReport' | 'uwbBlink' | 'uwbRsf' | 'uwbRif' | 'nbPoll' | 'nbResp' | 'nbReport'
export interface UwbMmsFrag { kind: 'rsf' | 'rif'; index: number; of: number; nMsr?: number; gap?: number; stsLen?: number; txDbm: number }
export interface UwbNbMsg { channel: number; centerMhz: number; msgId: number; replyRctu?: number; roundTripRctu?: number }
// UwbInfo gains mms?: UwbMmsFrag; nb?: UwbNbMsg
export function makeRsf(src: string, dst: string, index: number, phy: MmsPhy, block: number, round: number, slot: number): FrameDesc // bytes 0, mbps 0, txTimeNs rsfNs, uwb.mms
export function makeRif(src, dst, index, phy, block, round, slot): FrameDesc
export function makeNbPoll(tag: string, anchor: string, channel: number, block: number, round: number): FrameDesc   // bytes 12, mbps 0.25, txTimeNs nbPpduNs(12), uwb.nb
export function makeNbResp(anchor, tag, channel, block, round): FrameDesc
export function makeNbReport(src, dst, channel, block, round, slot, times: { replyRctu?: number; roundTripRctu?: number }): FrameDesc // bytes 13
export const isNbFrame = (k: UwbFrameKind) => k.startsWith('nb'); export const isMmsFragment = (k) => k === 'uwbRsf' || k === 'uwbRif'
// uwb/channel.ts — UwbChannelCfg gains `mms?: MmsPhy` (unused by the channel itself) and nothing else; per-frame dispatch:
//   txDbm(from, frame) = nb ? NB_TX_DBM : frame.uwb?.mms ? frame.uwb.mms.txDbm : node.txPowerDbm
//   pl0(frame) = nb ? nbPl0Db(frame.uwb.nb.channel) : uwbPl0Db(channel)
//   sensFor(frame) = nb ? NB_RX_SENS_DBM : fragment ? UWB_RX_SENS_DBM − MMS_COMBINE_MAX_DB : UWB_RX_SENS_DBM
//   sirMinFor(frame) = nb ? NB_SIR_MIN_DB : UWB_SIR_MIN_DB
//   bandFor(frame) = nb ? nbBand(channel) : UWB_BAND_MHZ[channel]   (emission band AND the receiver's foreign-power query band)
//   lossDbFor(frame) = nb ? (d, w) => nbPl0Db(ch) + 10·UWB_PL_EXP·log10(max(d, 0.1)) + w : (d, w) => uwbToWifiPathLossDb(d, w, channel)
//   UwbRxInfo gains `rxDbm` alias? No — `rssiDbm` already is the per-frame received power; keep it.
//   New: lbtBusy(id: string, channel: number): { busy: boolean; foreignDbm: number } — spectrum ? foreignDbm('uwb', pos, nbBand) ≥ NB_LBT_THRESHOLD_DBM : clear.
//   `UWB_INTERFERED` is emitted for NB frames too (same record; `from` says which).
// simulation.ts: build the Spectrum also when sc.uwb?.mode === 'mms' && sc.uwb.mms.nbChannels.some(n => bandOverlapMhz(nbBand(n).lo, .hi, wifiLo, wifiHi) > 0) for the 6 GHz link (same width rule as today).
```

- [ ] Tests: the coexistence lesson's three scenes produce the same `UWB_INTERFERED` counts and the fixture is
  unchanged (the refactor is bit-exact); a Wi-Fi emission still uses `wifiToUwbPathLossDb`; an NB frame at 10 dBm
  over channel 200 is seen by a 6 GHz Wi-Fi receiver at the free-space law (number pinned); the mediator exists for
  `nbChannels: [200]` + a 6 GHz link at 6305 and not for `[3]`; a fragment at −100 dBm is delivered, at −106 dBm is
  not, a 4z frame at −100 dBm is not; an NB frame at −99 dBm is delivered; NB frames' foreign-power query uses the
  NB band (a Wi-Fi PPDU outside it leaves `foreignDbm` −Infinity); `lbtBusy` at 8 m from a 20 dBm 80 MHz PPDU is
  busy and at 9.5 m is clear (spec: 8.6 m crossing); builders' sizes and durations.
- [ ] Commit `feat(uwb): per-frame PHY in the UWB channel, emissions carry their own loss law, NB coupling gate`.

---

