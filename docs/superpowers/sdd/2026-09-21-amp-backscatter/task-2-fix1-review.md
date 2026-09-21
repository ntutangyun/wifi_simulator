# Review package: f5d36e8..c782ec2

## Commits
c782ec2 fix(amp): channel review — one PPDU prefix, no reply decode while the reader is idle

## Files changed
 src/engine/ampBs.ts                 | 35 ++++++++++----
 src/engine/channel.ts               | 93 ++++++++++++++++++++++++++-----------
 tests/engine/amp-bs-channel.test.ts | 81 +++++++++++++++++++++++++++++---
 3 files changed, 166 insertions(+), 43 deletions(-)

## Diff
diff --git a/src/engine/ampBs.ts b/src/engine/ampBs.ts
index eecd4ec..568412f 100644
--- a/src/engine/ampBs.ts
+++ b/src/engine/ampBs.ts
@@ -177,30 +177,49 @@ export function bsReplyNs(reply: Gen2Reply, kbps: AmpBsUlKbps): Ns {
 export function bstNs(reply: Gen2Reply | null, kbps: AmpBsUlKbps, delayedT3Ns?: Ns): Ns {
   if (reply === null) return Math.max(AMP_BS_BST_MIN_NS, Math.round(BST_T1_MARGIN * AMP_BS_T1_NS))
   const replyNs = bsReplyNs(reply, kbps)
   if (delayedT3Ns !== undefined) {
     return Math.round(BST_REPLY_MARGIN * delayedT3Ns + BST_DELAYED_SLACK_NS + BST_REPLY_MARGIN * replyNs)
   }
   return Math.max(AMP_BS_BST_MIN_NS, Math.round(BST_T1_MARGIN * AMP_BS_T1_NS + BST_REPLY_MARGIN * replyNs))
 }
 
 /**
- * The whole downlink PPDU, excitations included: legacy preamble + U-SIG (whose L-SIG LENGTH
- * covers all of this, so Wi-Fi defers for the lot), the WUP-Excitation that boots the tags — a
- * millisecond at minimum, and only on the first PPDU of a TXOP, so `wupNs` is 0 afterwards —
- * the mono-static AMP-Sync, the command at 250 kb/s Manchester OOK, the BST-Excitation and the
- * signal extension. There is no AMP-SIG in mono-static and no padding field. SFD PM-38, PM-63,
- * PM-65 note, PM-72, PM-73
+ * Where the AMP-Sync of a downlink PPDU ends and the command begins: the legacy preamble +
+ * U-SIG, then the WUP-Excitation that boots the tags — a millisecond at minimum, and only on the
+ * first PPDU of a TXOP, so `wupNs` is 0 afterwards — then the mono-static AMP-Sync.
+ * SFD PM-38, PM-63, PM-72, PM-73
  */
-export function ampBsDlPpduNs(cmd: Gen2Cmd, wupNs: Ns, bstNs: Ns, signalExtNs: Ns): Ns {
+export function ampBsSyncEndNs(wupNs: Ns): Ns {
   return AMP_LEGACY_PREAMBLE_NS + wupNs + AMP_BS_DL_SYNC_NS
-    + ampBitsNs(ampRfidBytes(cmd) * 8, AMP_BS_DL_KBPS) + bstNs + signalExtNs
+}
+
+/**
+ * Where AMP-Data ends: the sync, then the command at 250 kb/s Manchester OOK. There is no
+ * AMP-SIG in mono-static and no padding field.
+ *
+ * This is the instant the BST-Excitation starts, the tag's answer becomes due (T1 later) and the
+ * radiated power drops from `chargeDbm` to `bsDbm` — so the medium needs it as much as the
+ * airtime does, and both take it from here rather than each composing the prefix for itself.
+ * SFD PM-65 note; 11-25/0061r0 (single DL rate)
+ */
+export function ampBsDataEndNs(cmd: Gen2Cmd, wupNs: Ns): Ns {
+  return ampBsSyncEndNs(wupNs) + ampBitsNs(ampRfidBytes(cmd) * 8, AMP_BS_DL_KBPS)
+}
+
+/**
+ * The whole downlink PPDU, excitations included: everything up to the end of AMP-Data (whose
+ * L-SIG LENGTH covers all of this, so Wi-Fi defers for the lot), the BST-Excitation and the
+ * signal extension. SFD PM-38, PM-63, PM-65 note, PM-72, PM-73
+ */
+export function ampBsDlPpduNs(cmd: Gen2Cmd, wupNs: Ns, bstNs: Ns, signalExtNs: Ns): Ns {
+  return ampBsDataEndNs(cmd, wupNs) + bstNs + signalExtNs
 }
 
 export interface AmpRfidArgs {
   src: string; dst: string; cmd: Gen2Cmd; session: number; q?: number; rn16?: number; slot: number
   ulKbps: AmpBsUlKbps; wupNs: Ns; bstNs: Ns; chargeDbm: number; bsDbm: number; signalExtNs: Ns
   /** The addressed tag's EPC, when the scenario configured one. Left out for a broadcast command
    * and for a tag that takes the EPC `epcOf` derives from its node id. */
   epc?: string
 }
 
diff --git a/src/engine/channel.ts b/src/engine/channel.ts
index 8a34afa..c326412 100644
--- a/src/engine/channel.ts
+++ b/src/engine/channel.ts
@@ -23,34 +23,32 @@ import { wallLossDb } from './propagation'
 import { wifiToUwbPathLossDb, type Emission, type Spectrum } from './spectrum'
 import {
   AMP_DL_REQ_SINR_DB,
   AMP_DL_SYNC_NS,
   AMP_LEGACY_PREAMBLE_NS,
   AMP_TAG_DL_SENS_DBM,
   AMP_UL_BW_MHZ,
   AMP_UL_CHIP_NS,
   AMP_UL_REQ_SINR_DB,
   AMP_UL_SYNC_CHIPS,
-  ampBitsNs,
   ampUlSensDbm,
   type AmpUlKbps,
 } from './amp'
 import {
   AMP_BS_ACTIVATION_DBM,
-  AMP_BS_DL_KBPS,
-  AMP_BS_DL_SYNC_NS,
   AMP_BS_LOSS_DB,
   AMP_BS_REQ_SNR_DB,
   AMP_BS_UL_CHIP_NS,
   AMP_BS_UL_SYNC_CHIPS,
   FREQ_24G_MHZ,
-  ampRfidBytes,
+  ampBsDataEndNs,
+  ampBsSyncEndNs,
   bsPathLossDb,
   monoLeakDbm,
   readerFloorDbm,
   type AmpBsUlKbps,
 } from './ampBs'
 
 export interface PhyListener {
   onCcaBusy(t: Ns): void
   onCcaIdle(t: Ns): void
   /** PHY-RXSTART.indication: receiver locked a preamble (§10.3.2.9 timeout semantics). */
@@ -102,29 +100,30 @@ export interface BsGeometry {
 
 /** A PPDU a node has on the air right now, and where in it we are. */
 export interface InFlightTx {
   frame: FrameDesc
   startNs: Ns
   endNs: Ns
 }
 
 /**
  * Where AMP-Data ends inside a downlink RFID PPDU — the instant the command is complete, the
- * BST-Excitation starts and a tag's answer becomes due (T1 later). Measured forward from the
- * start of the PPDU so it needs no knowledge of the link's signal extension. null for every
- * frame that is not an `ampRfid`. SFD PM-38, PM-63, PM-72…PM-75
+ * BST-Excitation starts and a tag's answer becomes due (T1 later).
+ *
+ * The composition is `ampBsDataEndNs`'s, the same one `ampBsDlPpduNs` builds the airtime out of,
+ * so the frame's `txTimeNs` and this offset into it cannot drift apart when the PPDU gains a
+ * field. Measured forward from the start, so it needs no knowledge of the link's signal
+ * extension. null for every frame that is not an `ampRfid`.
  */
 export function bsDataEndNs(frame: FrameDesc): Ns | null {
   const r = frame.kind === 'ampRfid' ? frame.amp?.rfid : undefined
-  if (r === undefined) return null
-  return AMP_LEGACY_PREAMBLE_NS + r.wupNs + AMP_BS_DL_SYNC_NS
-    + ampBitsNs(ampRfidBytes(r.cmd) * 8, AMP_BS_DL_KBPS)
+  return r === undefined ? null : ampBsDataEndNs(r.cmd, r.wupNs)
 }
 
 /**
  * The EIRP a PPDU radiates `offsetNs` into its own transmission.
  *
  * Only a downlink RFID PPDU has one: it charges the tags at `chargeDbm` through its preamble,
  * its WUP-Excitation and the command, then drops to `bsDbm` for the BST-Excitation it expects
  * to hear a reflection inside — and stays there through the signal extension that trails it
  * (model). Every other PPDU radiates its node's one EIRP throughout and does not carry it, so
  * this returns null and the caller uses what it already knows.
@@ -209,56 +208,80 @@ const OVERLAP_MIN_DBM = -92
 const CAPTURE_MARGIN_DB = 5
 
 /**
  * How long a reception stays re-syncable: its preamble, during which the radio
  * is still doing AGC and timing acquisition. Once into the payload it is
  * committed, and a stronger signal can only corrupt it.
  */
 const captureWindowNs = (frame: FrameDesc): Ns => {
   // A backscatter DL PPDU syncs on 8 chips after its WUP-Excitation, not on the Active Tx tier's
   // 40; a reply on [S, S, S] rather than 48 chips. Same arithmetic, different fields.
-  if (frame.kind === 'ampRfid') {
-    return AMP_LEGACY_PREAMBLE_NS + frame.amp!.rfid!.wupNs + AMP_BS_DL_SYNC_NS
-  }
+  if (frame.kind === 'ampRfid') return ampBsSyncEndNs(frame.amp!.rfid!.wupNs)
   if (frame.kind === 'ampBsReply') {
-    return AMP_BS_UL_SYNC_CHIPS * AMP_BS_UL_CHIP_NS[frame.amp!.kbps as AmpBsUlKbps]
+    return AMP_BS_UL_SYNC_CHIPS * AMP_BS_UL_CHIP_NS[bsUlKbps(frame)]
   }
   if (frame.amp?.dir === 'dl') return AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS
   if (frame.amp?.dir === 'ul') return AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[frame.amp.kbps as AmpUlKbps]
   return PHY_MODES[frame.mode ?? 'nonht'].preambleNs
 }
 
+/**
+ * The uplink rate of a backscattered reply, narrowed rather than asserted.
+ *
+ * `amp.kbps` is a plain number and the Active Tx union admits 4000, which a backscatter tag
+ * cannot produce: left as a cast, such a frame would index both the SNR table and the chip table
+ * with a missing key and be silently undetectable (undefined compares false) with a NaN capture
+ * window. `ampBsReplyFrame`'s signature makes that unreachable, so this is a loud floor under a
+ * programming error, not a runtime case.
+ */
+function bsUlKbps(frame: FrameDesc): AmpBsUlKbps {
+  const kbps = frame.amp?.kbps
+  if (kbps !== 250 && kbps !== 1000) {
+    throw new Error(`channel: ${kbps} kb/s is not a backscatter uplink rate`)
+  }
+  return kbps
+}
+
 const sameGroup = (a: FrameDesc, b: FrameDesc): boolean =>
   a.orthogonalGroup !== undefined && a.orthogonalGroup === b.orthogonalGroup
 
-/** Noise bandwidth for a PPDU: an AMP UL PPDU uses its OOK-rate-dependent width; everything else the PPDU's width. */
+/**
+ * Noise bandwidth for a PPDU: an AMP UL PPDU uses its OOK-rate-dependent width; everything else
+ * the PPDU's width.
+ *
+ * A backscattered reply takes the Active Tx widths too, although its chip rate is half the
+ * Active Tx one at 250 kb/s (`AMP_BS_UL_CHIP_NS` 2 µs against `AMP_UL_CHIP_NS` 1 µs). It costs
+ * nothing here — a mono-static reader hears every reply against its own leakage floor, not
+ * against thermal noise, so this width never enters the answer — and it is deliberate rather
+ * than overlooked, because a narrower width would be a new model number with no source behind
+ * it. **A bistatic receiver (A4) falls back to thermal, and would inherit a ~3 dB optimism from
+ * this line: give a reply its own width there.**
+ */
 function ampNoiseBwMhz(frame: FrameDesc): number {
   return frame.amp?.dir === 'ul' ? AMP_UL_BW_MHZ[frame.amp.kbps as AmpUlKbps] : frame.widthMhz ?? 20
 }
 
 /**
  * How far above the noise a preamble has to stand to be acquired at all.
  *
  * A Wi-Fi receiver is hunting for a preamble it had no warning of, hence ns-3's 4 dB. A
  * mono-static reader is not hunting: it opened the excitation itself and knows to the
  * microsecond when the reflection is due, so acquiring one is not gated any harder than
  * decoding it — which is what keeps the channel's reach exactly the `monoReachM` the lesson
  * quotes (3 dB at 250 kb/s), instead of quietly pulling it in to the 4 dB of a blind search.
  */
 const detectThreshDb = (frame: FrameDesc): number =>
-  frame.kind === 'ampBsReply'
-    ? AMP_BS_REQ_SNR_DB[frame.amp!.kbps as AmpBsUlKbps]
-    : PREAMBLE_DETECT_SINR_DB
+  frame.kind === 'ampBsReply' ? AMP_BS_REQ_SNR_DB[bsUlKbps(frame)] : PREAMBLE_DETECT_SINR_DB
 
 /** Decode SINR threshold for a frame as seen by receiver rid. */
 function decodeThreshDb(frame: FrameDesc, rid: string, r: RadioState): number {
-  if (frame.kind === 'ampBsReply') return AMP_BS_REQ_SNR_DB[frame.amp!.kbps as AmpBsUlKbps]
+  if (frame.kind === 'ampBsReply') return AMP_BS_REQ_SNR_DB[bsUlKbps(frame)]
   if (frame.amp?.dir === 'ul') return AMP_UL_REQ_SINR_DB[frame.amp.kbps as AmpUlKbps]
   if (frame.amp?.dir === 'dl') return r.kind !== 'wifi' ? AMP_DL_REQ_SINR_DB : sinrThreshDb(6)
   // Only a multi-user data PPDU is decoded per user; a Trigger or M-BA carries
   // per-user scheduling information but is itself one non-HT frame.
   if (frame.muParts && frame.kind === 'data') {
     const part = frame.muParts.find((p) => p.dst === rid)
     const mode = frame.mode ?? 'he'
     // addressed: own part's MCS; overhearers only need the (robust) preamble/header
     return reqSinrDb(mode, part ? part.mcs : 0)
   }
@@ -424,46 +447,60 @@ export class Channel {
 
   /** The noise a reception stands against: thermal in the PPDU's bandwidth, except at a reader
    * listening for a reflection, where its own leakage is tens of dB above thermal and is the floor. */
   private noiseFloorMw(rid: string, frame: FrameDesc): number {
     return frame.kind === 'ampBsReply'
       ? mw(this.bsFloorDbm(rid, frame))
       : mw(noiseDbm(ampNoiseBwMhz(frame)))
   }
 
   /** Lowest RSSI at which this radio can acquire this PPDU, or null when it cannot see it as a PPDU at all. */
-  private detectFloorDbm(rid: string, r: RadioState, frame: FrameDesc): number | null {
+  private detectFloorDbm(t: Ns, rid: string, r: RadioState, frame: FrameDesc): number | null {
     // A backscatter tag has an envelope detector and no oscillator: the reader's commands are
     // the only thing it can see, and it must be powered by them to see them at all.
     if (r.kind === 'bsTag') return frame.kind === 'ampRfid' ? r.floorDbm : null
-    if (frame.kind === 'ampBsReply') return r.ampCapable ? this.bsFloorDbm(rid, frame) : null
+    // An Active Tx tag syncs on 40 chips and an AMP-SIG; a mono-static command has neither, so
+    // it cannot see one even though both are downlink AMP PPDUs.
+    if (r.kind === 'tag' && frame.kind === 'ampRfid') return null
+    // A reflection exists only while the reader's own excitation is on the air. The window is
+    // the gate, not half-duplex: an idle reader has nothing being reflected off anything, and
+    // must not decode a reply against thermal noise.
+    if (frame.kind === 'ampBsReply') {
+      return r.ampCapable && this.bstOpenAt(rid, t) ? this.bsFloorDbm(rid, frame) : null
+    }
     if (frame.amp?.dir === 'ul') return r.ampCapable ? ampUlSensDbm(frame.amp.kbps as AmpUlKbps) : null
     if (frame.amp?.dir === 'dl') return r.kind === 'tag' ? r.floorDbm : CCA_PD_DBM
     return r.kind === 'tag' ? null : CCA_PD_DBM
   }
 
   /**
    * Can this radio hear anything at all right now? Half-duplex says no while it transmits — with
    * one exception, the mono-static reader. A backscattered reply *is* the reader's own excitation
-   * coming back off a tag, so it arrives inside the PPDU the reader is still transmitting, and
-   * only inside that PPDU's BST-Excitation.
+   * coming back off a tag, so it necessarily arrives inside the PPDU the reader is transmitting.
+   *
+   * Whether an excitation is actually radiating at that instant is `detectFloorDbm`'s question,
+   * not this one: it asks it of an idle reader too, so the BST window is one positive gate
+   * rather than a half-duplex side effect that stops applying the moment the reader stops
+   * transmitting.
    */
-  private listening(t: Ns, rid: string, r: RadioState, frame: FrameDesc): boolean {
-    if (!r.transmitting) return true
-    return frame.kind === 'ampBsReply' && r.ampCapable && this.bstOpenAt(rid, t)
+  private listening(r: RadioState, frame: FrameDesc): boolean {
+    return !r.transmitting || frame.kind === 'ampBsReply'
   }
 
   startTx(nodeId: string, frame: FrameDesc): void {
     const t = this.now()
     const me = this.radios.get(nodeId)!
     if (me.transmitting) throw new Error(`${nodeId} startTx while transmitting`)
     me.transmitting = true
+    // The medium writes on the frame it is handed: a backscattered reply has its incident power
+    // filled in here, before TX_START carries the frame into the records. Hand a fresh frame per
+    // transmission — a reused one would keep the previous round's `incidentDbm`.
     this.fillIncidentDbm(t, nodeId, frame)
 
     // Half-duplex: transmitting kills any reception in progress.
     for (const lock of me.locks) {
       this.emit({ t, type: 'RX_FAIL', node: nodeId, from: lock.from, reason: 'txDuringRx' })
     }
     me.locks = []
 
     const tx: ActiveTx = { txId: nodeId, frame, endNs: t + frame.txTimeNs }
     this.active.push(tx)
@@ -520,22 +557,22 @@ export class Channel {
         .sort((x, y) => y.p - x.p || byCodeUnit(x.tx.txId, y.tx.txId))
       for (const { tx, p } of arrivals) {
         if (!r.transmitting) r.observed.add(tx.txId)
         this.applyOneTx(t, rid, r, tx, p)
       }
     }
     this.updateAllCca(t)
   }
 
   private applyOneTx(t: Ns, rid: string, r: RadioState, tx: ActiveTx, p: number): void {
-    const floor = this.detectFloorDbm(rid, r, tx.frame)
-    const listening = this.listening(t, rid, r, tx.frame)
+    const floor = this.detectFloorDbm(t, rid, r, tx.frame)
+    const listening = this.listening(r, tx.frame)
     const canCoexist = r.locks.every((l) => sameGroup(l.frame, tx.frame))
     if (r.locks.length > 0 && !canCoexist) {
       if (listening && floor !== null && p >= floor && this.canCapture(t, r, p)) {
         // Capture: abandon the weak reception and re-sync to this preamble.
         // The dropped frame never reaches PHY-RXEND, so no error is indicated
         // and no EIFS is armed — the new lock's outcome decides the deferral.
         for (const lost of r.locks) {
           this.emit({ t, type: 'RX_FAIL', node: rid, from: lost.from, reason: 'capture' })
         }
         r.locks = []
diff --git a/tests/engine/amp-bs-channel.test.ts b/tests/engine/amp-bs-channel.test.ts
index 1e6dae0..632a19b 100644
--- a/tests/engine/amp-bs-channel.test.ts
+++ b/tests/engine/amp-bs-channel.test.ts
@@ -162,21 +162,29 @@ describe('a backscatter tag under the excitation', () => {
     })
     w.at(4_000_000, () => w.ch.startTx('ap', {
       kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000,
     }))
     w.run(5_000_000)
     expect(w.heard.tag).toEqual([])
     expect(w.recs('CCA_BUSY', 'tag')).toEqual([])
   })
 })
 
-/** Drive one command and one reply T1 into its excitation, and say whether the reader heard it. */
+/**
+ * Drive one command and one reply T1 into its excitation, and say whether the reader heard it.
+ *
+ * The reply is scheduled unconditionally, whether or not that tag could have been powered: the
+ * channel does not gate a reply on activation and should not, and these tests are after the
+ * *reply* boundary on its own. Worth knowing which one binds in a real scene, though — at the
+ * default 10 dBm charge, activation stops at 0.309 m, inside the 0.328 m the reply reaches, so a
+ * tag placed at 0.327 m here would in truth never have woken up to answer.
+ */
 function round(
   tagM: number, opts: { chargeDbm?: number; bsDbm?: number; kbps?: AmpBsUlKbps; walls?: Wall[] } = {},
 ): { heard: boolean; records: TLRecord[] } {
   const kbps = opts.kbps ?? 250
   const w = world([
     { id: 'ap', pos: at(0), opts: reader },
     { id: 'tag', pos: at(tagM), opts: bsTag },
   ], {}, opts.walls ?? [])
   w.at(0, () => w.ch.startTx('ap', query(opts.chargeDbm ?? 10, opts.bsDbm ?? 0, kbps)))
   w.at(DATA_END_NS + T1_NS, () => w.ch.startTx('tag', reply('tag', 'rn16', kbps)))
@@ -213,38 +221,86 @@ describe('a backscattered reply at the reader', () => {
   })
 
   it('carries the incident excitation the channel measured, and never fails the tag for replying', () => {
     const r = round(0.3)
     expect(r.records.some((x) => x.type === 'RX_FAIL' && x.reason === 'txDuringRx')).toBe(false)
     const tx = r.records.find((x) => x.type === 'TX_START' && x.frame.kind === 'ampBsReply')
     // bsDbm 0 − bsPathLossDb(2440, 0.3) = −29.74 dBm reaching the tag.
     expect((tx as { frame: FrameDesc }).frame.amp!.bs!.incidentDbm).toBeCloseTo(-29.738, 3)
   })
 
-  it('is ignored when it lands outside the BST-Excitation', () => {
-    for (const startNs of [500_000, DATA_END_NS - 1, DATA_END_NS + 142_400]) {
+  it('is ignored when it lands outside the BST-Excitation, or after the PPDU altogether', () => {
+    // The last two start after the reader has stopped transmitting: nothing is being reflected
+    // off anything, so an idle reader must not hear a reply however loud it claims to be.
+    const f = query()
+    for (const startNs of [500_000, DATA_END_NS - 1, DATA_END_NS + 142_400, f.txTimeNs + 1]) {
       const w = world([
         { id: 'ap', pos: at(0), opts: reader },
         { id: 'tag', pos: at(0.3), opts: bsTag },
       ])
       w.at(0, () => w.ch.startTx('ap', query()))
       w.at(startNs, () => {
-        const f = reply('tag')
-        f.amp!.bs!.incidentDbm = -29.74
-        w.ch.startTx('tag', f)
+        const r = reply('tag')
+        r.amp!.bs!.incidentDbm = -29.738
+        w.ch.startTx('tag', r)
       })
       w.run(3_000_000)
       expect(w.heard.ap).toEqual([])
     }
   })
 
-  it('two replies in one slot collide; a 6 dB louder one is captured', () => {
+  it('is never heard by a reader that is not transmitting at all, even from 0.05 m', () => {
+    // 0.05 m is the path-loss clamp: −20 dBm incident, a −40 dBm reply. Against thermal noise
+    // that is a 70 dB margin; against an excitation that is not on the air it is no reply at all.
+    const w = world([
+      { id: 'ap', pos: at(0), opts: reader },
+      { id: 'tag', pos: at(0.05), opts: bsTag },
+    ])
+    w.at(0, () => {
+      const r = reply('tag')
+      r.amp!.bs!.incidentDbm = 10 - 14.176 // the 10 dBm excitation, had one been radiating
+      w.ch.startTx('tag', r)
+    })
+    w.run(1_000_000)
+    expect(w.heard.ap).toEqual([])
+    expect(w.recs('RX_START', 'ap')).toEqual([])
+  })
+
+  it('must clear its SNR against Wi-Fi in the band, not only against the reader\'s leakage', () => {
+    const noisy = (staDbmAtAp: number) => {
+      const w = world([
+        { id: 'ap', pos: at(0), opts: reader },
+        { id: 'tag', pos: at(0.3), opts: bsTag },
+        { id: 'sta', pos: at(4) },
+      ], { 'sta>ap': staDbmAtAp })
+      w.at(0, () => w.ch.startTx('ap', query()))
+      // A Wi-Fi PPDU right across the excitation — what the lesson's `none` variant shows.
+      w.at(DATA_END_NS - 10_000, () => w.ch.startTx('sta', {
+        kind: 'data', src: 'sta', dst: 'ap', bytes: 1500, mbps: 6, durationFieldNs: 0,
+        txTimeNs: 300_000,
+      }))
+      w.at(DATA_END_NS + T1_NS, () => w.ch.startTx('tag', reply('tag')))
+      w.run(3_000_000)
+      return w
+    }
+    // The reply at 0.3 m sits 4.5 dB over the reader's floor: −70 dBm of Wi-Fi in the band eats
+    // that margin and the reply is lost, and the collision names the station that did it.
+    const lost = noisy(-70)
+    expect(lost.heard.ap.some((h) => h.what === 'ampBsReply:tag')).toBe(false)
+    expect(lost.recs('COLLISION').some((r) => r.nodes.includes('sta') && r.nodes.includes('tag'))).toBe(true)
+    // The same geometry with the station 30 dB quieter: the reply survives.
+    expect(noisy(-100).heard.ap.some((h) => h.what === 'ampBsReply:tag')).toBe(true)
+  })
+
+  // Not capture: the louder reply is detected first (same-instant starts are applied strongest
+  // first) and the quieter one fails the 5 dB capture test and becomes interference.
+  it('two replies in one slot collide; a 6 dB louder one survives the other', () => {
     const both = (aM: number, bM: number) => {
       const w = world([
         { id: 'ap', pos: at(0), opts: reader },
         { id: 'a', pos: at(aM), opts: bsTag },
         { id: 'b', pos: at(bM), opts: bsTag },
       ])
       w.at(0, () => w.ch.startTx('ap', query()))
       w.at(DATA_END_NS + T1_NS, () => {
         w.ch.startTx('a', reply('a'))
         w.ch.startTx('b', reply('b'))
@@ -297,11 +353,22 @@ describe('the Active Tx tier is untouched', () => {
       acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: SIGNAL_EXT_NS,
     })
     w.at(0, () => w.ch.startTx('ap', trigger))
     w.at(2_000_000, () => w.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
     w.run(4_000_000)
     expect(w.heard.tag.map((h) => h.what)).toEqual(['ampTrigger:ap'])
     expect(w.heard.ap.map((h) => h.what)).toEqual(['ampResp:tag'])
     // The DL reception still resolves at the end of the PPDU, not early.
     expect(w.heard.tag[0].t).toBe(trigger.txTimeNs)
   })
+
+  it('an Active Tx tag does not hear a mono-static command it could never sync to', () => {
+    const w = world([
+      { id: 'ap', pos: at(0), opts: reader },
+      { id: 'tag', pos: at(0.3), opts: { kind: 'tag', cca: false } },
+    ], { 'ap>tag': -40 })
+    w.at(0, () => w.ch.startTx('ap', query()))
+    w.run(3_000_000)
+    expect(w.heard.tag).toEqual([])
+    expect(w.recs('RX_START', 'tag')).toEqual([])
+  })
 })
