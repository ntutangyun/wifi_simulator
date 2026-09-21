# Review package: 926e10e..0eaac5e

## Commits
0eaac5e fix(amp): inventory review — the reader floor gates collision energy, no slot is cut after its RN16

## Files changed
 src/engine/ampBsSta.ts          |  6 +++-
 src/engine/ampReader.ts         | 42 ++++++++++++++++++++-----
 src/engine/mac.ts               | 41 ++++++++++++++++++++++---
 src/model/records.ts            | 10 ++++++
 src/model/view.ts               |  9 +++++-
 tests/engine/amp-reader.test.ts | 68 +++++++++++++++++++++++++++++++++++++----
 6 files changed, 156 insertions(+), 20 deletions(-)

## Diff
diff --git a/src/engine/ampBsSta.ts b/src/engine/ampBsSta.ts
index bd3df10..4a0ddb6 100644
--- a/src/engine/ampBsSta.ts
+++ b/src/engine/ampBsSta.ts
@@ -79,21 +79,25 @@ export class AmpBsStaMac implements PhyListener {
   onCcaIdle(): void {}
 
   /**
    * A downlink PPDU has started. The tag knows how long it will last, so this is where it arms
    * the moment it will fall over: the end of this PPDU plus the hold, cancelled the instant the
    * next one starts.
    */
   onRxStart(t: Ns, frame: FrameDesc, _from: string): void {
     if (this.powerHandle) this.q.cancel(this.powerHandle)
     this.powerHandle = this.q.schedule(t + frame.txTimeNs + AMP_BS_POWER_HOLD_NS, () => this.unpower())
-    if (this.state === 'idle' || this.state === 'bsWait') this.setState('rx')
+    // An unpowered tag is not receiving, it is inert: it shows `rx` only for a PPDU it can act
+    // on — one already charging it, or one whose WUP-Excitation is about to. Otherwise the lane
+    // would draw a reception for a tag the model says is not thinking at all.
+    const wakes = (frame.amp?.rfid?.wupNs ?? 0) >= AMP_BS_WUP_MIN_NS
+    if ((this.powered || wakes) && (this.state === 'idle' || this.state === 'bsWait')) this.setState('rx')
   }
 
   /**
    * The command is complete — the medium resolves a backscatter tag's reception at the end of
    * AMP-Data, because everything after it is carrier the tag has to answer *into*.
    */
   onRxOk(t: Ns, frame: FrameDesc, from: string): void {
     const r = frame.kind === 'ampRfid' ? frame.amp?.rfid : undefined
     if (from !== this.cfg.apId || r === undefined) { this.settle(); return }
     // The reader charges at `chargeDbm` up to here; the backscatter law says what reaches us.
diff --git a/src/engine/ampReader.ts b/src/engine/ampReader.ts
index cfcf8e2..21228ef 100644
--- a/src/engine/ampReader.ts
+++ b/src/engine/ampReader.ts
@@ -9,22 +9,22 @@
  * a time, each one waiting `AMP_BS_T2_NS` after the last PPDU (excitation included) ended.
  *
  * The round owns nothing but its own timers: frames go out through `deps.transmit`, the end of a
  * TXOP is reported through `deps.done`, and the MAC decides how that fits into EDCA.
  *
  * Sources. SFD MM-10 / MM-29 adopt EPC Gen2 (ISO/IEC 18000-63) by reference; the slot algorithm,
  * the persistence of counters across TXOPs and the TXOP budget are `model`, following
  * TGbp 11-25/0061r0 (contribution). Nothing of the draft's text is reproduced.
  */
 import {
-  AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WRITE_T3_NS, ampRfidFrame, bsReplyNs, bstNs, epcOf,
-  type AmpBsUlKbps, type Gen2Cmd, type Gen2Reply,
+  AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WRITE_T3_NS, ampBsDlPpduNs, ampRfidFrame, bsReplyNs, bstNs,
+  epcOf, type AmpBsUlKbps, type Gen2Cmd, type Gen2Reply,
 } from './ampBs'
 import type { AmpApDeps } from './ampAp'
 import { bsDataEndNs } from './channel'
 import { CTS_BYTES, txTimeNs } from './phy'
 import type { FrameDesc } from '../model/frames'
 import type { AmpApCfg, AmpBackscatterCfg } from '../model/scenario'
 import type { Ns } from '../model/types'
 
 /** An AP configured as a mono-static reader: `backscatter` is what makes it one. */
 export type AmpReaderCfg = AmpApCfg & { backscatter: NonNullable<AmpApCfg['backscatter']> }
@@ -52,21 +52,27 @@ interface Command {
   /** Query only: the slot count it announces, as 2^Q. */
   q?: number
   /** ACK / Read / Write: the handle the addressed tag backscattered. */
   rn16?: number
   dst: string
   epc?: string
   /** True when sending this command opens a new slot of the inventory. */
   opensSlot: boolean
 }
 
+/** The destination a Query or QueryRep carries: it addresses no tag, because the whole point of
+ * an inventory is that the reader does not yet know who is there. A sentinel, not physics. model */
 const BROADCAST = '*tags'
+/** Inventory session numbers roll 1…255. EPC Gen2's own sessions are S0–S3 and mean something
+ * else (which flag a tag keeps); this is a rolling id for "which inventory is this", wide enough
+ * that a tag cannot confuse two of them inside one run. model */
+const SESSION_MODULUS = 255
 
 export class AmpInventoryRound {
   private running = false
   private session = 0
   /** Slots of this inventory not yet offered. 2^Q at the start of a session, 0 when it is done. */
   private remaining = 0
   /** The slot the reader is in, 1-based within the session. */
   private slot = 0
   /** Commands still owed inside the current slot: ACK → Read → Write. */
   private queued: Command[] = []
@@ -120,21 +126,21 @@ export class AmpInventoryRound {
     this.running = true
     this.txopStartNs = this.deps.now()
     this.txopSlots = 0
     this.txopRead = []
     this.txopCollisions = 0
     this.txopEmpties = 0
     this.wupPending = true
     // A TXOP that resumes an unfinished session keeps its number, and the tags keep the counters
     // they drew under it (11-25/0061r0's "Extend", model); only an exhausted one starts over.
     if (this.remaining === 0) {
-      this.session = (this.session % 255) + 1
+      this.session = (this.session % SESSION_MODULUS) + 1
       this.remaining = 2 ** this.bs.q
       this.slot = 0
     }
     if (this.cfg.protection !== 'ctsSelf') {
       this.step()
       return
     }
     // CTS-to-self (§10.23.2.8) reserving the whole TXOP: the Wi-Fi stations in the room cannot
     // hear a tag at all, and a reflection landing under their data is simply lost.
     const t = this.deps.now()
@@ -164,35 +170,57 @@ export class AmpInventoryRound {
   private build(c: Command, wupNs: Ns, slot: number): FrameDesc {
     return ampRfidFrame({
       src: this.deps.nodeId, dst: c.dst, cmd: c.cmd, session: this.session, q: c.q, rn16: c.rn16,
       slot, ulKbps: this.bs.ulKbps as AmpBsUlKbps, wupNs,
       bstNs: bstNs(c.reply, this.bs.ulKbps as AmpBsUlKbps, c.delayedT3Ns),
       chargeDbm: this.bs.chargeDbm, bsDbm: this.bs.bsDbm,
       signalExtNs: this.deps.timing.signalExtNs, epc: c.epc,
     })
   }
 
+  /**
+   * The air a slot needs before the reader may open it: the command PPDU itself, and — against
+   * the chance that a tag answers in it — the turnaround and the ACK PPDU whose own excitation
+   * carries the EPC back.
+   *
+   * Reserving it is what stops a slot being cut in half. An RN16 the reader hears and can never
+   * acknowledge is a tag lost for the rest of the session (it spent its counter answering) and a
+   * slot that lands in none of the three tallies, so the reader would report fewer outcomes than
+   * slots it offered. Better to leave the slot unopened: the next TXOP offers it whole.
+   *
+   * The Read and the Write that may follow an EPC are deliberately *not* reserved. By then the
+   * tag has been read and counted; losing its 8 octets of memory to a TXOP boundary costs the
+   * inventory nothing, and reserving 1.1 ms (or 3 ms) more per slot would empty most TXOPs.
+   */
+  private slotReserveNs(): Ns {
+    const kbps = this.bs.ulKbps as AmpBsUlKbps
+    const ackNs = ampBsDlPpduNs('ack', 0, bstNs('epc', kbps), this.deps.timing.signalExtNs)
+    return AMP_BS_T2_NS + ackNs
+  }
+
   /** Send the next command, or close the TXOP because the session is done or the budget is spent. */
   private step(): void {
     const c = this.nextCommand()
     if (c === null) {
       this.endTxop()
       return
     }
     const wupNs = this.wupPending ? Math.round(this.bs.wupMs * 1_000_000) : 0
     const slot = c.opensSlot ? this.slot + 1 : this.slot
     const frame = this.build(c, wupNs, slot)
     const t = this.deps.now()
-    if (t + frame.txTimeNs > this.txopStartNs + this.txopNs) {
-      // Not enough air left for this PPDU. A command that would have opened a slot has not
-      // opened it, so the next TXOP offers it; one owed inside a slot is dropped, because the
-      // tag's handle only lives as long as the carrier that lit it.
+    const needNs = frame.txTimeNs + (c.opensSlot ? this.slotReserveNs() : 0)
+    if (t + needNs > this.txopStartNs + this.txopNs) {
+      // Not enough air left. A command that would have opened a slot has not opened it, so the
+      // next TXOP offers it whole; one owed inside a slot can only be an access command after an
+      // EPC already read, and is dropped, because the tag's handle only lives as long as the
+      // carrier that lit it.
       if (!c.opensSlot) this.queued = []
       this.endTxop()
       return
     }
     this.wupPending = false
     if (c.opensSlot) {
       this.slot = slot
       this.remaining--
       this.txopSlots++
     }
diff --git a/src/engine/mac.ts b/src/engine/mac.ts
index d3a6e91..266ef81 100644
--- a/src/engine/mac.ts
+++ b/src/engine/mac.ts
@@ -11,20 +11,21 @@
  *    orthogonal groups on the channel).
  * Legacy nodes run a single pseudo-EDCAF with DIFS parameters (exact v1 DCF).
  */
 import type { FrameDesc, MuPart } from '../model/frames'
 import { ampduPsduBytes, dataPsduBytes } from '../model/frames'
 import type { EmitFn, MacStateName } from '../model/records'
 import type { AmpApCfg, TamperCfg } from '../model/scenario'
 import type { Ns } from '../model/types'
 import type { TxopProtection } from '../model/scenario'
 import { AmpApRound } from './ampAp'
+import { AMP_BS_LOSS_DB, bsDecodes, monoLeakDbm, readerFloorDbm, type AmpBsUlKbps } from './ampBs'
 import { AmpInventoryRound } from './ampReader'
 import type { Channel, PhyListener } from './channel'
 import { EventQueue } from './events'
 import {
   ACK_BYTES, BA_BYTES, CF_END_BYTES, CTS_BYTES, DCF_PARAMS,
   EDCA_PARAMS, MAX_AMPDU_MPDUS, MAX_PPDU_NS, OFDM_5G, PHY_MODES,
   QOS_HDR_BYTES, FCS_BYTES, RTS_BYTES, SHORT_RETRY_LIMIT,
   aifsNs, ctrlRespRateFor, ctrlRespRateForMode, mcsRateMbps, multiStaBaBytes, triggerBytes, toneRatio, txTimeModeNs, txTimeNs,
   type AcParams, type PhyMode, type PhyTiming, type TxTimeOpts,
 } from './phy'
@@ -233,32 +234,60 @@ export class WifiMac implements PhyListener {
     this.T = cfg.timing ?? OFDM_5G
     this.queues = sharedQueues ?? new AcQueues(cfg.queueLimit)
     this.edcafs = effectiveParams(cfg.edca ? EDCA_PARAMS : [DCF_PARAMS], cfg.tamper).map((params) => ({
       params, cw: params.cwMin, backoff: null, needDraw: false,
       qsrc: 0, ifsHandle: 0, tickHandle: 0,
     }))
     const ampDeps = {
       nodeId, q, now, emit, timing: this.T,
       transmit: (f: FrameDesc) => this.transmitFrame(f, false),
       done: () => this.onAmpDone(),
-      bstEnergy: () => (cfg.ampBsTagIds ?? []).some((id) => ch.currentTx(id) !== null),
+      bstEnergy: () => this.bstEnergy(),
     }
     // Which tiers exist decides which rounds this MAC owns. An unstated `ampTiers` is Active Tx
     // alone: that is every AMP scenario written before the backscatter tier.
     const tiers = cfg.ampTiers ?? { active: true, backscatter: false }
     this.ampRound = cfg.ampAp && tiers.active ? new AmpApRound(cfg.ampAp, ampDeps) : null
     this.ampInventory = cfg.ampAp?.backscatter && tiers.backscatter
       ? new AmpInventoryRound({ ...cfg.ampAp, backscatter: cfg.ampAp.backscatter }, ampDeps)
       : null
     if (this.ampRound || this.ampInventory) this.scheduleAmpPoll(0)
   }
 
+  /**
+   * Energy detection inside the reader's own BST-Excitation: is anything reflecting that this
+   * receiver could actually measure?
+   *
+   * A reader's energy detector sits on the same self-leakage floor as its demodulator, so a
+   * reflection below that floor is not energy — it is indistinguishable from the reader's own
+   * transmission leaking into its receiver. That distinction is the whole point of the query: a
+   * slot two tags answered in is a collision, while a slot whose tag booted and was never heard
+   * (the charge power reaches far further than a reflection does) is a slot with no answer in it.
+   *
+   * It is not addressing. The inventory exists precisely because the reader does not know who is
+   * out there; this asks the medium "is any reflection above my floor right now", which is what a
+   * real EPC Gen2 reader measures per slot.
+   */
+  private bstEnergy(): boolean {
+    const bs = this.cfg.ampAp?.backscatter
+    if (bs === undefined) return false
+    const floorDbm = readerFloorDbm(monoLeakDbm(bs.bsDbm))
+    return (this.cfg.ampBsTagIds ?? []).some((id) => {
+      if (this.ch.currentTx(id) === null) return false
+      // The same round trip the channel walks: out at the excitation power, reflected
+      // AMP_BS_LOSS_DB down, back over the same path.
+      const incidentDbm = this.ch.bsRxDbm(this.nodeId, id, bs.bsDbm)
+      const atMeDbm = this.ch.bsRxDbm(id, this.nodeId, incidentDbm - AMP_BS_LOSS_DB)
+      return bsDecodes(atMeDbm, floorDbm, bs.ulKbps as AmpBsUlKbps)
+    })
+  }
+
   /**
    * Which round the next poll TXOP runs.
    *
    * With one tier of tag on the link there is no choice. With both — Active Tx tags and
    * backscatter tags under one reader — the poll **alternates strictly**: even polls run the
    * Active Tx round, odd polls the RFID inventory. The draft says nothing about sharing a reader
    * between the two tiers, and alternation is the one rule that is fair, deterministic and
    * legible straight off a timeline. `model`
    */
   private pickAmpRound(): AmpApRound | AmpInventoryRound | null {
@@ -1280,27 +1309,29 @@ export class WifiMac implements PhyListener {
     } else {
       this.updateNav(t, frame, from)
     }
   }
 
   private isAwaitedResponse(frame: FrameDesc): boolean {
     if (!this.awaiting || frame.dst !== this.nodeId) return false
     return this.awaiting.kind === 'cts' ? frame.kind === 'cts' : frame.kind === 'ack' || frame.kind === 'ba'
   }
 
-  onRxCorrupt(_t: Ns): void {
+  onRxCorrupt(t: Ns): void {
     // An empty or collided AMP slot is not a reason to arm EIFS: the AP owns
     // the medium until the round's last Ack and answers on AMP SIFS.
     if (!this.ampActive) this.corruptLast = true
-    // A reflection that did not decode is the inventory's business: it is the difference
-    // between a slot two tags answered in and one nobody did.
-    this.ampInventory?.onRxFail()
+    // A reflection that did not decode is the inventory's business — but only a reflection.
+    // Anything corrupted in one of the 16 µs turnaround gaps between commands is a Wi-Fi frame
+    // talking over the reader, not a tag answering, and must not turn an empty slot into a
+    // collision. The BST window is the test: it is the only place a reply can exist at all.
+    if (this.ch.bstOpenAt(this.nodeId, t)) this.ampInventory?.onRxFail()
     if (this.awaiting !== null) this.failAttempt()
   }
 
   private noteDelivered(id: number): boolean {
     if (this.delivered.has(id)) return false
     this.delivered.add(id)
     this.deliveredOrder.push(id)
     if (this.deliveredOrder.length > 512) this.delivered.delete(this.deliveredOrder.shift()!)
     return true
   }
diff --git a/src/model/records.ts b/src/model/records.ts
index 5c4cb31..228f4bd 100644
--- a/src/model/records.ts
+++ b/src/model/records.ts
@@ -69,20 +69,30 @@ export type TLRecord = { t: Ns; seq: number } & (
    * A tag backscattered an answer. It carries no power of its own, so what the reader gets is
    * `rxDbmAtAp` — the excitation twice through the path loss and 6 dB down — and `snrDb` is that
    * against the reader's own self-leakage floor, which is the whole story of mono-static reach.
    */
   | { type: 'AMP_BS_REPLY'; node: string; kind: Gen2Reply; slot: number; rxDbmAtAp: number; snrDb: number }
   /**
    * The reader's tally at the end of one inventory TXOP. `session` and `complete` describe the
    * inventory as a whole (complete once 2^Q slots have been offered); `slotsOffered`, `read`,
    * `collisions`, `empties` and `txopNs` describe this TXOP alone, so a session spread over
    * several TXOPs is the sum of its records.
+   *
+   * Every slot offered lands in exactly one of the three columns, so
+   * `read.length + collisions + empties === slotsOffered` holds for every record: the reader
+   * never opens a slot it has not reserved the air to finish.
+   *
+   * `collisions` is a slot the reader *heard* something in and could not read — two reflections
+   * on top of each other, or one spoiled by Wi-Fi. `empties` is a slot with no answer the reader
+   * could hear, which covers both silence and a tag that booted and answered from beyond the
+   * reply reach: the charge power carries much further than a reflection does, so those are not
+   * the same distance, and neither is a collision.
    */
   | { type: 'AMP_INVENTORY'; node: string; session: number; slotsOffered: number; read: string[]; collisions: number; empties: number; txopNs: Ns; complete: boolean }
   /**
    * A backscatter tag woke up (or could not). `powered: true` is a tag that harvested
    * `incidentDbm` through a WUP-Excitation; `powered: false` is one that heard a command with no
    * wake-up preamble in front of it and had nothing to think with.
    *
    * A tag too far away to be powered at all emits **no record**: the medium never delivers the
    * PPDU to it (a backscatter radio's floor *is* `AMP_BS_ACTIVATION_DBM`), so the tag has no way
    * to know it was addressed. A lane with no boot record is a tag out of range — the absence is
diff --git a/src/model/view.ts b/src/model/view.ts
index e2846b5..f97ae9c 100644
--- a/src/model/view.ts
+++ b/src/model/view.ts
@@ -104,21 +104,28 @@ export interface AmpTagView {
   roundsSatOut: number
   /** Backscatter tags only: the inventory state an Active Tx tag has no equivalent of. */
   bs?: AmpBsTagView
 }
 
 /** The reader's live inventory, on the AP lane, beside the Active Tx round's own fields. */
 export interface AmpInventoryView {
   session: number
   /** The slot the reader is offering, 1-based within the session. */
   slot: number
-  /** EPCs read, slots two tags answered in, and slots nobody answered in — this TXOP. */
+  /**
+   * EPCs read, slots the reader heard two answers in, and slots with no answer it could hear —
+   * **this TXOP**, and filled in at its end, because `AMP_INVENTORY` is the only record that
+   * carries the reader's own energy judgement. The row therefore reads 0 / 0 / 0 while a TXOP is
+   * running and lands complete when it closes; `slot` is what moves live. Deriving `read` early
+   * from the ACK commands would fill one column of three and leave the other two at zero, which
+   * reads as a result rather than as "not yet".
+   */
   read: number
   collisions: number
   empties: number
 }
 
 /** The AP lane's live AMP round: the poll's shape and which tags have replied so far. */
 export interface AmpRoundView {
   phase: 'random' | 'scheduled'
   slot: number
   slots: number
diff --git a/tests/engine/amp-reader.test.ts b/tests/engine/amp-reader.test.ts
index 81cc89e..78e43e3 100644
--- a/tests/engine/amp-reader.test.ts
+++ b/tests/engine/amp-reader.test.ts
@@ -1,15 +1,17 @@
 import { describe, it, expect } from 'vitest'
 import {
-  AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WRITE_T3_NS, epcOf,
+  AMP_BS_REQ_SNR_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WRITE_T3_NS, epcOf,
 } from '../../src/engine/ampBs'
 import { bsDataEndNs } from '../../src/engine/channel'
+import { hashStr } from '../../src/engine/hash'
+import { Rng } from '../../src/engine/rng'
 import { Simulation } from '../../src/engine/simulation'
 import type { TLRecord } from '../../src/model/records'
 import { DEFAULT_AMP_AP, DEFAULT_AMP_BS, type NodeCfg, type Scenario } from '../../src/model/scenario'
 import { bsScenario, bsTag, ofType } from './amp-bs-helpers'
 
 const MS = 1_000_000
 /**
  * A seed whose single tag at 0.2 m draws slot counter 0, so it answers inside the Query's own
  * excitation. The counter is a pure function of the seed and the node id, so the tests that need
  * the "answered in slot 1" shape state the seed they need rather than asserting a draw.
@@ -130,31 +132,31 @@ describe('the reader’s RFID inventory round', () => {
     }
     // both tags drew slot 0 out of the single slot Q = 0 offers, and both backscattered
     expect(ofType(rs, 'AMP_BS_COUNTER', 'tag-1#2g').every((c) => c.counter === 0 && c.q === 0)).toBe(true)
     expect(ofType(rs, 'AMP_BS_COUNTER', 'tag-2#2g').every((c) => c.counter === 0)).toBe(true)
     expect(ofType(rs, 'AMP_BS_REPLY', 'tag-2#2g').length).toBeGreaterThan(0)
     expect(ofType(rs, 'AMP_RFID', 'ap#2g').some((c) => c.cmd === 'ack')).toBe(false)
   })
 
   it('Q = 2 with four tags: each draws its counter once per session from its own stream', () => {
     const tags = [bsTag('tag-1', 0.1), bsTag('tag-2', 0.2), bsTag('tag-3', 0.3), bsTag('tag-4', 0.1, 'y')]
-    // `read: false` keeps a full four-slot inventory inside one 10 ms TXOP, so every slot's
-    // outcome lands in one AMP_INVENTORY and none is cut off by a TXOP boundary.
-    const rs = new Simulation(bsScenario({ pollIntervalMs: 40, txopMs: 10, read: false }, tags)).runUntil(60 * MS).records
+    const sc = bsScenario({ pollIntervalMs: 40, txopMs: 10 }, tags)
+    const rs = new Simulation(sc).runUntil(60 * MS).records
     const session = ofType(rs, 'AMP_RFID', 'ap#2g')[0].session
     const inSession = (n: string) => ofType(rs, 'AMP_BS_COUNTER', n).filter((c) => c.t < 40 * MS)
     for (const id of ['tag-1', 'tag-2', 'tag-3', 'tag-4']) {
       const draws = inSession(`${id}#2g`)
       expect(draws.length, `${id} draws exactly once in session ${session}`).toBe(1)
       expect(draws[0].q).toBe(2)
-      expect(draws[0].counter).toBeGreaterThanOrEqual(0)
-      expect(draws[0].counter).toBeLessThanOrEqual(3)
+      // Replayed from the tag's own stream, built the way simulation.ts forks it: this is what
+      // catches a change in the fork wiring, which reading the record back never would.
+      expect(draws[0].counter, id).toBe(new Rng(sc.seed).fork(hashStr(`${id}#2g`)).int(3))
     }
     const counters = ['tag-1', 'tag-2', 'tag-3', 'tag-4'].map((id) => inSession(`${id}#2g`)[0].counter)
     const inv = ofType(rs, 'AMP_INVENTORY', 'ap#2g').filter((i) => i.t < 40 * MS)
     const collisions = inv.reduce((s, i) => s + i.collisions, 0)
     const empties = inv.reduce((s, i) => s + i.empties, 0)
     const read = inv.flatMap((i) => i.read)
     // Every slot resolves as exactly one of: read alone, a collision, or an empty.
     const perSlot = [0, 1, 2, 3].map((c) => counters.filter((x) => x === c).length)
     expect(collisions).toBe(perSlot.filter((n) => n >= 2).length)
     expect(empties).toBe(perSlot.filter((n) => n === 0).length)
@@ -164,20 +166,74 @@ describe('the reader’s RFID inventory round', () => {
 
   it('a tag at 0.35 m is out of activation range and never boots at all', () => {
     const rs = new Simulation(bsScenario({}, [bsTag('near', 0.2), bsTag('far', 0.35, 'y')])).runUntil(40 * MS).records
     expect(ofType(rs, 'AMP_BS_BOOT', 'near#2g').length).toBeGreaterThan(0)
     expect(ofType(rs, 'AMP_BS_BOOT', 'near#2g')[0].powered).toBe(true)
     expect(ofType(rs, 'AMP_BS_BOOT', 'far#2g')).toEqual([])
     expect(ofType(rs, 'AMP_BS_COUNTER', 'far#2g')).toEqual([])
     expect(ofType(rs, 'AMP_BS_REPLY', 'far#2g')).toEqual([])
   })
 
+  it('a tag that boots but cannot be heard leaves an empty slot, not a collision', () => {
+    // At 20 dBm charge the activation reach is 0.978 m but the reply reach does not move: a tag
+    // at 0.5 m wakes, draws, and backscatters an answer 7 dB under the reader's own leakage
+    // floor. That is not energy the reader can measure, so the slot has no answer in it.
+    const rs = new Simulation(bsScenario({ chargeDbm: 20, q: 0, pollIntervalMs: 20 }, [bsTag('lonely', 0.5)])).runUntil(100 * MS).records
+    expect(ofType(rs, 'AMP_BS_BOOT', 'lonely#2g')[0]).toMatchObject({ powered: true })
+    expect(ofType(rs, 'AMP_BS_COUNTER', 'lonely#2g')[0]).toMatchObject({ counter: 0 })
+    const replies = ofType(rs, 'AMP_BS_REPLY', 'lonely#2g')
+    expect(replies.length).toBeGreaterThan(0)
+    expect(replies[0].snrDb).toBeLessThan(AMP_BS_REQ_SNR_DB[250]) // under the reader's floor
+    expect(ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampBsReply')).toEqual([])
+    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
+    expect(invs.length).toBeGreaterThan(2)
+    for (const i of invs) expect(i).toMatchObject({ slotsOffered: 1, read: [], collisions: 0, empties: 1 })
+
+    // …and the same reader, at the same charge power, still calls a real two-tag pile-up a
+    // collision: the floor gates the energy, it does not switch the detector off.
+    const both = new Simulation(bsScenario({ chargeDbm: 20, q: 0, pollIntervalMs: 20 }, [bsTag('near-1', 0.15), bsTag('near-2', 0.15, 'y')])).runUntil(100 * MS).records
+    const collided = ofType(both, 'AMP_INVENTORY', 'ap#2g')
+    expect(collided.length).toBeGreaterThan(2)
+    for (const i of collided) expect(i).toMatchObject({ slotsOffered: 1, read: [], collisions: 1, empties: 0 })
+  })
+
+  it('never opens a slot it cannot finish: no RN16 is left unacknowledged and every slot is tallied', () => {
+    // A four-slot inventory with Read on needs ~3.6 ms per tag answered, so a 10 ms TXOP cannot
+    // hold all four: the boundary falls in the middle of the round, which is exactly where a
+    // slot used to be cut in half after its RN16.
+    for (const txopMs of [4, 6, 8, 10]) {
+      const tags = [bsTag('tag-1', 0.1), bsTag('tag-2', 0.2), bsTag('tag-3', 0.3), bsTag('tag-4', 0.1, 'y')]
+      const rs = new Simulation(bsScenario({ pollIntervalMs: 60, txopMs }, tags)).runUntil(300 * MS).records
+      const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
+      expect(invs.length, `${txopMs} ms`).toBeGreaterThan(2)
+      for (const i of invs) {
+        // Every slot offered lands in exactly one column — the invariant a cut slot broke.
+        expect(i.read.length + i.collisions + i.empties, `${txopMs} ms TXOP at ${i.t}`).toBe(i.slotsOffered)
+      }
+      // Every RN16 the reader decoded is answered by an ACK carrying it, inside the same TXOP.
+      const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.amp?.bs?.reply === 'rn16')
+      const acks = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.amp?.rfid?.cmd === 'ack')
+      expect(heard.length, `${txopMs} ms`).toBeGreaterThan(0)
+      for (const h of heard) {
+        const ack = acks.find((a) => a.t > h.t && a.frame.amp!.rfid!.rn16 === h.frame.amp!.bs!.rn16)
+        expect(ack, `${txopMs} ms: the RN16 heard at ${h.t} is acknowledged`).toBeDefined()
+        expect(ack!.t - h.t, `${txopMs} ms: acknowledged in the very next command`).toBeLessThan(2 * MS)
+      }
+      // …and a session that completes has offered all 2^Q of its slots, whatever it cost in TXOPs.
+      const done = invs.filter((i) => i.complete)
+      expect(done.length, `${txopMs} ms`).toBeGreaterThan(0)
+      for (const d of done) {
+        expect(invs.filter((i) => i.session === d.session).reduce((n, i) => n + i.slotsOffered, 0)).toBe(4)
+      }
+    }
+  })
+
   it('a Wi-Fi station on 2.4 GHz defers for every RFID PPDU, excitation included', () => {
     const rs = new Simulation(bsScenario({}, [bsTag('tag-1', 0.2)], [camera()])).runUntil(40 * MS).records
     const ppdus = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampRfid')
     const camTx = ofType(rs, 'TX_START', 'cam#2g')
     expect(ppdus.length).toBeGreaterThan(2)
     expect(camTx.length).toBeGreaterThan(10) // the camera really is busy
     let acquired = 0
     for (const p of ppdus) {
       const straddling = camTx.some((c) => c.t <= p.t && c.t + c.frame.txTimeNs > p.t)
       if (straddling) continue // the camera was already on the air: nothing to defer to yet
