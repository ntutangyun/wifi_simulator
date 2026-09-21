# Review package: 9f3b878..a5a452f

## Commits
a5a452f test(uwb): NB emission and per-reception band coverage; frame-kind predicates take FrameKind

## Files changed
 src/uwb/frames.ts                 |  16 ++++--
 tests/uwb/channel-coexist.test.ts | 104 +++++++++++++++++++++++++++++++++++++-
 tests/uwb/channel.test.ts         |   8 ++-
 tests/uwb/frames.test.ts          |  21 ++++++--
 4 files changed, 140 insertions(+), 9 deletions(-)

## Diff
diff --git a/src/uwb/frames.ts b/src/uwb/frames.ts
index 8adc714..5b39ba2 100644
--- a/src/uwb/frames.ts
+++ b/src/uwb/frames.ts
@@ -1,40 +1,44 @@
 /**
  * HRP UWB ranging frames: SP1 PPDUs (standard §16.2, Table 16-1 and Figure 16-3)
  * carrying the ranging IEs of §10.29.8 and §10.32.9.
  * They travel through the same FrameDesc the Wi-Fi engine uses, so the
  * timeline, the frame inspector and the 3-D scene need no second frame type.
  */
-import type { FrameDesc } from '../model/frames'
+import type { FrameDesc, FrameKind } from '../model/frames'
 import type { Ns } from '../model/types'
 import { mmsFragmentDbm, rifNs, rsfNs, type MmsPhy } from './mms'
 import {
   NB_MSG_ID, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES, nbCenterMhz, nbPpduNs,
 } from './nb'
 import {
   UWB_BLINK_BYTES, UWB_REPORT_BYTES, uwbDlFinalBytes, uwbDlPollBytes, uwbDlRespBytes,
   uwbFinalBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes,
 } from './phy'
 
 export type UwbFrameKind =
   | 'uwbPoll' | 'uwbResp' | 'uwbFinal' | 'uwbReport' | 'uwbBlink'
   // P802.15.4ab: the two multi-millisecond fragment kinds and the three narrowband messages of
   // the control plane. 4ab draft 15-23/0100r2 §2.3.2 / 15-22/0381r5 Table 1.6.3.1
   | 'uwbRsf' | 'uwbRif' | 'nbPoll' | 'nbResp' | 'nbReport'
 
+// Both predicates take the whole `FrameKind` union, not just the UWB half: their callers hold a
+// `FrameDesc.kind` (a lane, the timeline, a decoder), and narrowing at the call site would only
+// push a cast onto every one of them.
+
 /** True of the three narrowband control messages — the frames that travel on the 4ab
  * narrowband radio rather than on the UWB one. */
-export const isNbFrame = (k: UwbFrameKind): boolean => k === 'nbPoll' || k === 'nbResp' || k === 'nbReport'
+export const isNbFrame = (k: FrameKind): boolean => k === 'nbPoll' || k === 'nbResp' || k === 'nbReport'
 
 /** True of the two multi-millisecond fragment kinds: one member of a train, not a frame that
  * stands on its own. */
-export const isMmsFragment = (k: UwbFrameKind): boolean => k === 'uwbRsf' || k === 'uwbRif'
+export const isMmsFragment = (k: FrameKind): boolean => k === 'uwbRsf' || k === 'uwbRif'
 
 /**
  * DL-TDoA message content (model, the RMI-style times of §10.29.8.4): what the sender did on its
  * own clock, so that a tag which only listens can put every anchor's transmit instant on anchor
  * 0's timebase. Each time is a 4-octet ranging counter in RCTU.
  */
 export interface UwbDlTimes {
   /** The sender's own TX counter for this very frame (stamped at its RMARKER). */
   txCounter: number
   /** RX counters the sender holds, by peer id: the Poll's at a responder, each Response's at
@@ -337,18 +341,24 @@ export function makeNbResp(anchor: string, tag: string, channel: number, block:
 /**
  * A narrowband REPORT, in the report slot its sender owns. The responder's carries the
  * ReplyTime it measured and the initiator's the TurnAroundTime, and that is what names the
  * message: the two differ only in their message-ID octet and in which time is present.
  * 4ab draft 15-22/0381r5 Table 1.6.3.1 / 1.6.3.2
  */
 export function makeNbReport(
   src: string, dst: string, channel: number, block: number, round: number, slot: number,
   times: { replyRctu?: number; roundTripRctu?: number },
 ): FrameDesc {
+  // A REPORT exists to carry one of the two times, and which one is there is what names the
+  // message. With neither, the message id would be a guess and the receiver would have nothing
+  // to range with, so the caller is told at the call site rather than in the ranging arithmetic.
+  if (times.replyRctu === undefined && times.roundTripRctu === undefined) {
+    throw new Error(`makeNbReport: ${src} built a REPORT with neither a reply nor a round-trip time`)
+  }
   return nbFrame('nbReport', src, dst, NB_REPORT_BYTES, block, round, slot, {
     channel,
     msgId: times.replyRctu !== undefined ? NB_MSG_ID.reportResponder : NB_MSG_ID.reportInitiator,
     // Absent, not undefined, so a REPORT compares equal to a hand-built one.
     ...(times.replyRctu !== undefined ? { replyRctu: times.replyRctu } : {}),
     ...(times.roundTripRctu !== undefined ? { roundTripRctu: times.roundTripRctu } : {}),
   })
 }
diff --git a/tests/uwb/channel-coexist.test.ts b/tests/uwb/channel-coexist.test.ts
index 71eb8eb..d9ad9ea 100644
--- a/tests/uwb/channel-coexist.test.ts
+++ b/tests/uwb/channel-coexist.test.ts
@@ -15,21 +15,22 @@ import { Spectrum, uwbToWifiPathLossDb, wifiToUwbPathLossDb, type Emission } fro
 import type { FrameDesc } from '../../src/model/frames'
 import { makeEmitter, type RxFailReason, type TLRecord } from '../../src/model/records'
 import type { NodeCfg } from '../../src/model/scenario'
 import type { Ns, Vec3 } from '../../src/model/types'
 import { UwbChannel, type UwbRadio, type UwbRxInfo } from '../../src/uwb/channel'
 import { makeNbPoll, makePoll } from '../../src/uwb/frames'
 import {
   NB_LBT_THRESHOLD_DBM, NB_SIR_MIN_DB, NB_TX_DBM, nbBand, nbPl0Db,
 } from '../../src/uwb/nb'
 import {
-  UWB_CAPTURE_DB, UWB_PL_EXP, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM, uwbInBandDbm, uwbPl0Db,
+  UWB_BAND_MHZ, UWB_CAPTURE_DB, UWB_PL_EXP, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM, uwbInBandDbm,
+  uwbPl0Db,
 } from '../../src/uwb/phy'
 
 /** 6 GHz channel 71: 6305 MHz centre, 80 MHz — wholly inside UWB channel 5's band. */
 const WIFI_LO_MHZ = 6305 - 40
 const WIFI_HI_MHZ = 6305 + 40
 
 const node = (id: string, p: Vec3, role: 'anchor' | 'tag'): NodeCfg => ({
   id, kind: 'uwb', name: id, pos: p, txPowerDbm: UWB_TX_POWER_DBM,
   profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role },
 })
@@ -305,10 +306,111 @@ describe('UwbChannel . listen before talk on the narrowband channel', () => {
 
     const loud = harness(true, lbtNodes)
     loud.s.emit('wifi', wifiEmission(20))
     // the same PPDU, a UNII-3 channel: nothing of it lands in the band at all
     expect(loud.ch.lbtBusy('near', NB_UNII3)).toEqual({ busy: false, foreignDbm: -Infinity })
 
     const uncoupled = harness(false, lbtNodes)
     expect(uncoupled.ch.lbtBusy('near', NB_UNII5)).toEqual({ busy: false, foreignDbm: -Infinity })
   })
 })
+
+
+describe('UwbChannel . the narrowband PPDU it puts on the shared air', () => {
+  /** A Wi-Fi receiver 2 m from the tag, listening over the AP's whole 80 MHz channel. */
+  const AT_2M: Vec3 = { x: 0, y: 2, z: 0 }
+
+  it('radiates a narrowband message at its own power, over its own 2.5 MHz, under its own law', () => {
+    const h = harness(true)
+    const seen = (): number => h.s.foreignDbm('wifi', AT_2M, WIFI_LO_MHZ, WIFI_HI_MHZ)
+    const readings: { t: Ns; dbm: number }[] = []
+    // the POLL leaves at 50 us, so there is an instant before TX_START to read as well
+    h.at(50_000, () => h.ch.transmit('t', makeNbPoll('t', 'a', NB_UNII5, 0, 0)))
+    for (const t of [0, 50_000, 300_000, 700_000]) h.at(t, () => { readings.push({ t, dbm: seen() }) })
+    h.runUntil(10_000_000)
+
+    const txStart = h.records.find((r) => r.type === 'TX_START')!.t
+    const txEnd = h.records.find((r) => r.type === 'TX_END')!.t
+    expect(txStart).toBe(50_000)
+    expect(txEnd).toBe(50_000 + 576_000) // one 12-octet O-QPSK PPDU
+
+    // All 2.5 MHz of channel 200 sits inside the AP's 6265-6345 MHz channel, so no spectral
+    // slice is taken: NB_TX_DBM - (nbPl0Db(200) + 10*UWB_PL_EXP*log10(2) + 0 dB of walls)
+    // = 10 - (48.4363 + 6.0206) = -44.46 dBm.
+    const expected = NB_TX_DBM - (nbPl0Db(NB_UNII5) + 10 * UWB_PL_EXP * Math.log10(2))
+    expect(expected).toBeCloseTo(-44.46, 2)
+    expect(readings.find((r) => r.t === 0)?.dbm).toBe(-Infinity) // before TX_START
+    expect(readings.filter((r) => r.t >= txStart && r.t < txEnd).map((r) => r.dbm))
+      .toEqual([expected, expected])
+    expect(readings.find((r) => r.t > txEnd)?.dbm).toBe(-Infinity) // after TX_END
+
+    // The power really is the narrowband radio's, not the node's: the tag is a -14 dBm UWB
+    // transmitter and this PPDU left at +10 dBm.
+    expect(NB_TX_DBM).not.toBe(UWB_TX_POWER_DBM)
+    // and the law really is the narrowband one, not the session channel's
+    expect(expected).not.toBeCloseTo(NB_TX_DBM - uwbToWifiPathLossDb(2, 0, 5), 2)
+  })
+
+  it('leaves a 4z frame in the same scene at exactly the number it always had', () => {
+    const h = harness(true)
+    const readings: number[] = []
+    h.at(0, () => h.ch.transmit('t', poll()))
+    h.at(1000, () => readings.push(h.s.foreignDbm('wifi', AT_2M, WIFI_LO_MHZ, WIFI_HI_MHZ)))
+    h.runUntil(10_000_000)
+    // 80 MHz of the Poll's 499.2 MHz at -14 dBm, 2 m away under the UWB channel-5 law
+    const expected = uwbInBandDbm(UWB_TX_POWER_DBM, WIFI_HI_MHZ - WIFI_LO_MHZ) - uwbToWifiPathLossDb(2, 0, 5)
+    expect(expected).toBeCloseTo(-76.66, 2)
+    expect(readings).toEqual([expected])
+  })
+})
+
+describe('UwbChannel . a narrowband reception re-takes foreign power over its own band', () => {
+  /** The NB POLL is 576 us of air; at 100 us the anchor is long since locked on to it and the
+   * foreign power it saw at arrival was zero, so only the mediator's change listener can raise
+   * it — and it must do so over the narrowband channel, not over the session's UWB band. */
+  const MID_RECEPTION_NS = 100_000
+
+  it('counts a Wi-Fi PPDU that only starts in the middle of a UNII-5 reception', () => {
+    const eirp = 30
+    const h = harness(true)
+    h.at(0, () => h.ch.transmit('t', makeNbPoll('t', 'a', NB_UNII5, 0, 0)))
+    h.at(MID_RECEPTION_NS, () => h.s.emit('wifi', wifiEmission(eirp)))
+    h.runUntil(10_000_000)
+
+    const rxStart = h.records.find((r) => r.type === 'RX_START' && r.node === 'a')
+    expect(rxStart?.t).toBeLessThan(MID_RECEPTION_NS)
+    const interfered = h.records.find((r) => r.type === 'UWB_INTERFERED')
+    expect(interfered).toMatchObject({ type: 'UWB_INTERFERED', node: 'a', from: 't' })
+    expect(h.radioOf('a').fails.map((f) => f.reason)).toEqual(['lowSinr'])
+
+    // The level is the 2.5 MHz slice of the AP's 80 MHz, -47.27 dBm, against the message's own
+    // -52.42 dBm. Over the UWB band the same PPDU would read -32.21 dBm: this pins which band
+    // the change listener asked for.
+    const overNbBand = foreignInNbChannel(eirp)
+    const overUwbBand = eirp - wifiToUwbPathLossDb(AP_DIST_M, 0)
+    expect(overNbBand).toBeCloseTo(-47.27, 2)
+    expect(overUwbBand).toBeCloseTo(-32.21, 2)
+    expect(interfered && 'foreignDbm' in interfered ? interfered.foreignDbm : 0)
+      .toBeCloseTo(overNbBand, 9)
+    expect(interfered && 'sirDb' in interfered ? interfered.sirDb : 0)
+      .toBeCloseTo(nbRssiDbm(NB_UNII5) - overNbBand, 9)
+  })
+
+  it('ignores a mid-reception PPDU that misses the narrowband channel, though it fills the UWB band', () => {
+    const h = harness(true)
+    h.at(0, () => h.ch.transmit('t', makeNbPoll('t', 'a', NB_UNII3, 0, 0)))
+    h.at(MID_RECEPTION_NS, () => h.s.emit('wifi', wifiEmission(20)))
+    h.runUntil(10_000_000)
+
+    // The AP's channel is wholly inside UWB channel 5's band and wholly outside NB channel 3's,
+    // so a listener that re-took over the session band would find this PPDU and lose the message.
+    expect(WIFI_LO_MHZ).toBeGreaterThan(UWB_BAND_MHZ[5].lo)
+    expect(WIFI_HI_MHZ).toBeLessThan(UWB_BAND_MHZ[5].hi)
+    expect(nbBand(NB_UNII3).hi).toBeLessThan(WIFI_LO_MHZ)
+
+    const ok = h.radioOf('a').oks[0]
+    expect(ok).toBeDefined()
+    expect(ok.info.foreignDbm).toBe(-Infinity)
+    expect(h.records.some((r) => r.type === 'UWB_INTERFERED')).toBe(false)
+    expect(h.radioOf('a').fails).toEqual([])
+  })
+})
diff --git a/tests/uwb/channel.test.ts b/tests/uwb/channel.test.ts
index bd4ad3f..930eec2 100644
--- a/tests/uwb/channel.test.ts
+++ b/tests/uwb/channel.test.ts
@@ -270,16 +270,22 @@ describe('UwbChannel per-frame PHY: the delivery floor', () => {
   })
 
   it('delivers a narrowband message down to its own \u2212100 dBm receiver, at its own power and its own band', () => {
     const nb = makeNbPoll('t', 'a', 200, 0, 0)
     expect(NB_RX_SENS_DBM).toBe(-100)
     // the NB radio runs at NB_TX_DBM whatever the node's UWB power is, and its 1 m loss is the
     // narrowband channel's, not the UWB channel's
     const ok = atLevel(nb, NB_TX_DBM, nbPl0Db(200), -99)
     expect(ok.rec('RX_OK', 'a')).toHaveLength(1)
     expect(ok.of('a').oks[0].frame.kind).toBe('nbPoll')
-    expect(ok.ch.rssiDbm('t', 'a')).not.toBeCloseTo(-99, 3) // the 4z answer is a different one
+    // asked without a frame the same channel answers for the session's UWB radio instead: the
+    // node's −14 dBm at uwbPl0Db(9) over the same 1067.05 m, which is −125.06 dBm
+    const d = distanceForRx(NB_TX_DBM, nbPl0Db(200), -99)
+    expect(d).toBeCloseTo(1067.05, 2)
+    expect(ok.ch.rssiDbm('t', 'a'))
+      .toBeCloseTo(-14 - uwbPl0Db(9) - 10 * UWB_PL_EXP * Math.log10(d), 9)
+    expect(ok.ch.rssiDbm('t', 'a')).toBeCloseTo(-125.06, 2)
 
     const lost = atLevel(makeNbPoll('t', 'a', 200, 0, 0), NB_TX_DBM, nbPl0Db(200), -101)
     expect(lost.rec('RX_START', 'a')).toHaveLength(0)
   })
 })
diff --git a/tests/uwb/frames.test.ts b/tests/uwb/frames.test.ts
index 8056731..2610652 100644
--- a/tests/uwb/frames.test.ts
+++ b/tests/uwb/frames.test.ts
@@ -13,21 +13,21 @@ import {
 import { mmsFragmentDbm, rifNs, rsfNs, type MmsPhy } from '../../src/uwb/mms'
 import { NB_MSG_ID, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES, nbCenterMhz, nbPpduNs } from '../../src/uwb/nb'
 
 /** The draft's own ranging-cycle default train. 4ab draft 15-22/0381r5 Table 1.2.3.3 */
 const PHY: MmsPhy = { rsfs: 8, rifs: 2, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1 }
 
 describe('MMS fragment frames', () => {
   it('carries no octets, no rate, its own airtime and its own burst power', () => {
     const rsf = makeRsf('t', 'a', 3, PHY, 1, 0, 10)
     expect(rsf.kind).toBe('uwbRsf')
-    expect(isMmsFragment(rsf.kind === 'uwbRsf' ? 'uwbRsf' : 'uwbRif')).toBe(true)
+    expect(isMmsFragment(rsf.kind)).toBe(true)
     // A fragment is a raw sequence, not a PSDU: the timeline must show air, never bytes ÷ rate.
     expect(rsf.bytes).toBe(0)
     expect(rsf.mbps).toBe(0)
     expect(rsf.durationFieldNs).toBe(0)
     // 40 × 4 × (128 + 2·64) = 40 960 chips at 499.2 Mchip/s
     expect(rsf.txTimeNs).toBe(rsfNs(PHY.nMsr, PHY.gap))
     expect(rsf.txTimeNs / 1000).toBeCloseTo(82.05, 2)
     // 37 nJ spent inside 82.05 µs
     expect(rsf.uwb?.mms?.txDbm).toBe(mmsFragmentDbm(rsf.txTimeNs))
     expect(rsf.uwb?.mms?.txDbm).toBeCloseTo(-3.46, 2)
@@ -54,21 +54,21 @@ describe('MMS fragment frames', () => {
   })
 })
 
 describe('narrowband control frames', () => {
   it('sizes the three compressed PSDUs and times them at 250 kb/s', () => {
     const poll = makeNbPoll('t', 'a', 200, 4, 1)
     const resp = makeNbResp('a', 't', 200, 4, 1)
     const report = makeNbReport('a', 't', 200, 4, 1, 26, { replyRctu: 1234 })
 
     expect([poll.kind, resp.kind, report.kind]).toEqual(['nbPoll', 'nbResp', 'nbReport'])
-    expect([poll.kind, resp.kind, report.kind].every((k) => isNbFrame(k === 'nbPoll' ? 'nbPoll' : k === 'nbResp' ? 'nbResp' : 'nbReport'))).toBe(true)
+    expect([poll.kind, resp.kind, report.kind].every(isNbFrame)).toBe(true)
 
     expect(poll.bytes).toBe(NB_POLL_BYTES)
     expect(resp.bytes).toBe(NB_RESP_BYTES)
     expect(report.bytes).toBe(NB_REPORT_BYTES)
     for (const f of [poll, resp, report]) expect(f.mbps).toBe(NB_MBPS)
 
     // (10 SHR + 2 PHR + 2 per octet) × 16 µs: 576 µs for 12 octets, 608 µs for 13
     expect(poll.txTimeNs).toBe(nbPpduNs(NB_POLL_BYTES))
     expect(poll.txTimeNs).toBe(576_000)
     expect(resp.txTimeNs).toBe(576_000)
@@ -100,20 +100,33 @@ describe('narrowband control frames', () => {
     })
     // absent, not undefined, so a REPORT compares equal to a hand-built one
     expect('roundTripRctu' in fromResponder.uwb!.nb!).toBe(false)
     expect('replyRctu' in fromInitiator.uwb!.nb!).toBe(false)
     expect(fromInitiator.uwb?.slot).toBe(28)
   })
 })
 
 describe('the kind predicates', () => {
   it('separate the two 4ab radios from the 4z frames', () => {
-    expect(['nbPoll', 'nbResp', 'nbReport'].every((k) => isNbFrame(k as 'nbPoll'))).toBe(true)
-    expect(['uwbRsf', 'uwbRif'].every((k) => isMmsFragment(k as 'uwbRsf'))).toBe(true)
+    // They take the whole FrameKind union, so a caller holding a FrameDesc.kind needs no cast.
+    expect((['nbPoll', 'nbResp', 'nbReport'] as const).every(isNbFrame)).toBe(true)
+    expect((['uwbRsf', 'uwbRif'] as const).every(isMmsFragment)).toBe(true)
     for (const k of ['uwbPoll', 'uwbResp', 'uwbFinal', 'uwbReport', 'uwbBlink'] as const) {
       expect(isNbFrame(k)).toBe(false)
       expect(isMmsFragment(k)).toBe(false)
     }
     expect(isMmsFragment('nbPoll')).toBe(false)
     expect(isNbFrame('uwbRsf')).toBe(false)
+    // and a Wi-Fi frame is neither, which is the reason the parameter is FrameKind
+    for (const k of ['data', 'ack', 'trigger', 'ampResp'] as const) {
+      expect(isNbFrame(k)).toBe(false)
+      expect(isMmsFragment(k)).toBe(false)
+    }
+  })
+
+  it('refuses a REPORT that carries neither time', () => {
+    expect(() => makeNbReport('a', 't', 3, 4, 1, 26, {})).toThrow(/neither a reply nor a round-trip time/)
+    // the two well-formed shapes still build
+    expect(makeNbReport('a', 't', 3, 4, 1, 26, { replyRctu: 1 }).kind).toBe('nbReport')
+    expect(makeNbReport('t', 'a', 3, 4, 1, 28, { roundTripRctu: 1 }).kind).toBe('nbReport')
   })
 })
