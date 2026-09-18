/**
 * Every empirical claim in the "A station that never contends" lesson, measured
 * against the lesson's own scenario and variant. Each assertion quotes the
 * sentence it guards; standard constants are checked against the engine's
 * exports (src/engine/amp.ts, src/engine/phy.ts) rather than re-typed.
 */
import { describe, it, expect } from 'vitest'
import { ampIntro } from '../../src/course/amp/amp-intro'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import {
  AMP_ACK_BYTES, AMP_DL_SIG_BYTES, AMP_DL_SYNC_NS, AMP_DL_REQ_SINR_DB, AMP_LEGACY_PREAMBLE_NS,
  AMP_PADDING_NS, AMP_PADDING_PROTECTED_NS, AMP_SIFS_NS, AMP_TAG_DL_SENS_DBM, AMP_UL_CHIP_NS,
  AMP_UL_REQ_SINR_DB, AMP_UL_SYNC_CHIPS, ampBitsNs, ampDlPpduNs, ampRespBytes, ampTriggerBytes,
  ampUlPpduNs, ampUlSensDbm,
} from '../../src/engine/amp'
import { ACK_TX_TIME_6M_NS, CCA_PD_DBM, CTS_BYTES, ERP_2G, SLOT_NS, txTimeNs } from '../../src/engine/phy'
import { LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { rssiOn } from './rssi'
import { decodeFrame, ppduLayout } from '../../src/model/frameFields'
import { applyRecord, initViewState } from '../../src/model/view'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS

const AP = 'ap#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g'] as const
/** Exactly the record types the prose names as absent from a tag and present at the AP. */
const CONTENTION_RECORDS = ['CCA_BUSY', 'BACKOFF_DRAW', 'IFS_START'] as const

const memo = new Map<string, TLRecord[]>()
function run(s: Scenario): TLRecord[] {
  return [...new Simulation(s).runUntil(RUN_NS).records]
}
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const s: Scenario = variant === undefined ? ampIntro.scenario() : ampIntro.variants![variant].scenario()
    memo.set(key, run(s))
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const aboc = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_ABOC').filter((r) => r.node === node)
const results = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_RESULT').filter((r) => r.node === node)
const countAt = (rs: TLRecord[], node: string, type: string) =>
  rs.filter((r) => 'node' in r && r.node === node && r.type === type).length

describe('amp-intro · lesson shape', () => {
  it('the scenario and the variant pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(ampIntro.scenario())).not.toThrow()
    for (const v of ampIntro.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(ampIntro) / 150
      + OBSERVE_MINUTES * ampIntro.observe.length + TRY_MINUTES * ampIntro.tryThis.length
    expect(lessonMinutes(ampIntro)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(ampIntro)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(ampIntro)).toBeLessThanOrEqual(25)
  })

  it('every jump target occurs in the base run', () => {
    const rs = recs()
    for (const j of ampIntro.jumps) expect(rs.some(j.find), j.label.en).toBe(true)
  })

  it('the scene is one router and two tags, and nothing else', () => {
    // "The scene is one router and two battery-free tags, with no Wi-Fi traffic at all, so the round
    //  stands alone." / "here a Wi-Fi 7 router, because the downlink AMP PPDU carries a U-SIG field."
    const s = ampIntro.scenario()
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', 'amp', 'amp'])
    expect(s.nodes[0].caps.generation).toBe('eht')
    expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
    expect(s.nodes[0].ampAp).toMatchObject({ pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline' })
    // "The tag transmits at 0 dBm against the router’s 20 dBm"
    expect(s.nodes[0].txPowerDbm).toBe(20)
    expect(s.nodes.slice(1).map((n) => n.txPowerDbm)).toEqual([0, 0])
    // the variant labelled "1 Mb/s both ways"
    expect(ampIntro.variants![0].scenario().nodes[0].ampAp).toMatchObject({ dlKbps: 1000, ulKbps: 1000, slots: 4, acwe: 2 })
  })
})

describe('amp-intro · standard constants', () => {
  it('AMP SIFS is 10 µs, exactly the 2.4 GHz SIFS a Wi-Fi radio already uses', () => {
    // "In 2.4 GHz that SIFS is 10 µs, exactly the AMP SIFS the draft specifies (SFD PM-96)"
    expect(AMP_SIFS_NS).toBe(10 * US)
    expect(ERP_2G.sifsNs).toBe(AMP_SIFS_NS)
    // "a clock good enough to count 9 µs slots"
    expect(SLOT_NS).toBe(9 * US)
    expect(ERP_2G.slotNs).toBe(SLOT_NS)
  })

  it('padding is 20 µs unprotected and 36 µs protected, and every frame here is unprotected', () => {
    // "The padding buys that time where it costs only airtime: 20 µs unprotected, 36 µs protected" /
    // "Every AMP frame in this slice is unprotected, so every one pads 20 µs." / "a protected AMP frame,
    //  which means an encrypted one and pads 36 µs instead of 20"
    expect(AMP_PADDING_NS).toBe(20 * US)
    expect(AMP_PADDING_PROTECTED_NS).toBe(36 * US)
    const dl = ofType(recs(), 'TX_START').filter((r) => r.frame.amp?.dir === 'dl')
    expect(dl.length).toBe(50) // 10 triggers + 40 Acks
    for (const r of dl) expect(r.frame.amp!.padNs).toBe(AMP_PADDING_NS)
    expect(dl.some((r) => r.frame.amp!.padNs === AMP_PADDING_PROTECTED_NS)).toBe(false)
  })

  it('the downlink PPDU is 32 µs of legacy preamble, 80 µs of AMP-Sync, then OOK', () => {
    // "32 µs of ordinary legacy preamble … 80 µs of AMP-Sync … an AMP-SIG of two octets (64 µs at
    //  250 kb/s, 16 µs at 1 Mb/s) … the 6 µs signal extension every 2.4 GHz PPDU with a legacy preamble
    //  carries" / "= 32 + 80 + 64 + 416 + 20 + 6 = 618 µs"
    expect(AMP_LEGACY_PREAMBLE_NS).toBe(32 * US)
    expect(AMP_DL_SYNC_NS).toBe(80 * US)
    expect(AMP_DL_SIG_BYTES).toBe(2)
    expect(ampBitsNs(2 * 8, 250)).toBe(64 * US)
    expect(ampBitsNs(2 * 8, 1000)).toBe(16 * US)
    expect(ampBitsNs(13 * 8, 250)).toBe(416 * US)
    expect(ERP_2G.signalExtNs).toBe(6 * US)
    expect(32 + 80 + 64 + 416 + 20 + 6).toBe(618)
    // "the 32 + 80 + 20 + 6 = 138 µs of preamble, sync, padding and extension does not [shrink]"
    expect(32 + 80 + 20 + 6).toBe(138)
  })

  it('the uplink PPDU has no legacy preamble and therefore no signal extension', () => {
    // "no legacy preamble at all, and therefore no signal extension either — just 48 chips of AMP-Sync
    //  (48 µs at 250 kb/s, 12 µs at 1 Mb/s) and then the octets"
    expect(AMP_UL_SYNC_CHIPS).toBe(48)
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[250]).toBe(48 * US)
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[1000]).toBe(12 * US)
    const resp = txs(recs(), 'ampResp')[0]
    const ul = ppduLayout(resp.frame).map((s) => s.key)
    expect(ul).toEqual(['ampSync', 'ampData'])
    expect(ul).not.toContain('legacyPreamble')
    expect(ul).not.toContain('signalExt')
    // the downlink frame has both
    const dl = ppduLayout(txs(recs(), 'ampTrigger')[0].frame).map((s) => s.key)
    expect(dl).toContain('legacyPreamble')
    expect(dl).toContain('signalExt')
  })

  it('the three frames are 13, 4 and 15 octets', () => {
    // the "Octets" column of the three-AMP-frames table, and "an identity-only one is 7 octets"
    expect(ampTriggerBytes(0)).toBe(13)
    expect(AMP_ACK_BYTES).toBe(4)
    expect(ampRespBytes(true)).toBe(15)
    expect(ampRespBytes(false)).toBe(7)
  })

  it('at 250 kb/s the airtimes are 618, 330 and 528 µs; at 1 Mb/s, 258, 186 and 132 µs', () => {
    // the "250 kb/s" and "1 Mb/s" columns of the three-AMP-frames table
    const ext = ERP_2G.signalExtNs
    expect(ampDlPpduNs(250, ampTriggerBytes(0), ext)).toBe(618 * US)
    expect(ampDlPpduNs(250, AMP_ACK_BYTES, ext)).toBe(330 * US)
    expect(ampUlPpduNs(250, ampRespBytes(true))).toBe(528 * US)
    expect(ampDlPpduNs(1000, ampTriggerBytes(0), ext)).toBe(258 * US)
    expect(ampDlPpduNs(1000, AMP_ACK_BYTES, ext)).toBe(186 * US)
    expect(ampUlPpduNs(1000, ampRespBytes(true))).toBe(132 * US)
  })

  it('at 250 kb/s the trigger is longest and the Ack shortest, but only the response scales by four', () => {
    // "At 250 kb/s the trigger is still the longest frame and the Ack the shortest — but the response is
    //  the one the low rate punishes most. With no fixed preamble to dilute it, its airtime tracks the
    //  rate exactly: 528 µs becomes 132 µs at 1 Mb/s, a clean factor of four. The trigger carries 138 µs
    //  that no rate can touch, so it only falls from 618 to 258 µs."
    const ext = ERP_2G.signalExtNs
    const trig250 = ampDlPpduNs(250, ampTriggerBytes(0), ext)
    const ack250 = ampDlPpduNs(250, AMP_ACK_BYTES, ext)
    const resp250 = ampUlPpduNs(250, ampRespBytes(true))
    expect(trig250).toBeGreaterThan(resp250)
    expect(resp250).toBeGreaterThan(ack250)
    // the response is pure payload: a four-fold rate step is a four-fold airtime step
    expect(resp250 / ampUlPpduNs(1000, ampRespBytes(true))).toBe(4)
    // the trigger is not, because 138 µs of it is rate-independent (padding does not shrink either)
    const fixedNs = AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS + AMP_PADDING_NS + ext
    expect(fixedNs).toBe(138 * US)
    const trig1000 = ampDlPpduNs(1000, ampTriggerBytes(0), ext)
    expect(trig250 / trig1000).toBeLessThan(4)
    expect(trig250 - fixedNs).toBe(4 * (trig1000 - fixedNs))
  })

  it('the CTS-to-self is 44 µs at 6 Mb/s plus the 6 µs 2.4 GHz signal extension', () => {
    // "a non-HT CTS-to-self — 44 µs at 6 Mb/s plus the band’s 6 µs signal extension, 50 µs in all"
    expect(txTimeNs(CTS_BYTES, 6)).toBe(44 * US)
    expect(ACK_TX_TIME_6M_NS).toBe(44 * US)
    expect(txTimeNs(CTS_BYTES, 6) + ERP_2G.signalExtNs).toBe(50 * US)
  })

  it('the model values: −72 dBm tag sensitivity, 8 dB downlink SINR, 10 dB uplink SINR, −94 dBm uplink floor', () => {
    // "the tag’s −72 dBm downlink sensitivity, the OOK SINR thresholds (8 dB down, 10 dB up at 250 kb/s)
    //  … are model choices, not standard values" / "the AP’s −94 dBm floor for a 250 kb/s OOK response"
    expect(AMP_TAG_DL_SENS_DBM).toBe(-72)
    expect(AMP_DL_REQ_SINR_DB).toBe(8)
    expect(AMP_UL_REQ_SINR_DB[250]).toBe(10)
    expect(Math.round(ampUlSensDbm(250))).toBe(-94)
  })
})

describe('amp-intro · the shape of one round', () => {
  const rs = recs()

  it('the round opens with a CTS-to-self one SIFS before the trigger', () => {
    // the timeline table's "CTS-to-self … 0 µs → 50 µs" and "AMP Trigger … 60 µs" rows, and
    // "One SIFS later the trigger goes out."
    const cts = txs(rs, 'cts')[0]
    const ctsEnd = ends(rs, 'cts')[0]
    const trig = txs(rs, 'ampTrigger')[0]
    expect(cts.t).toBe(0)
    expect(cts.node).toBe(AP)
    expect(ctsEnd.t).toBe(50 * US)
    expect(trig.t).toBe(60 * US)
    expect(trig.t - ctsEnd.t).toBe(ERP_2G.sifsNs)
  })

  it('the CTS Duration of 4140 µs ends exactly where the round’s last Ack ends, at 4190 µs', () => {
    // "The CTS-to-self carries a Duration of 4140 µs. It ends at 50 µs, so the NAV expires at 4190 µs —
    //  the very microsecond the fourth Ack stops transmitting."
    const cts = txs(rs, 'cts')[0]
    expect(cts.frame.durationFieldNs).toBe(4140 * US)
    const navEnd = ends(rs, 'cts')[0].t + cts.frame.durationFieldNs
    expect(navEnd).toBe(4190 * US)
    const lastAck = ends(rs, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t).toBe(navEnd)
  })

  it('slot 1 starts one AMP SIFS after the trigger ends, and slot 2 one AMP SIFS after Ack₁', () => {
    // "Slot 1 opens one AMP SIFS after the trigger’s last symbol, at 678 + 10 = 688 µs; every later slot
    //  opens one AMP SIFS after the previous Ack stops, so slot 2 starts at 1556 + 10 = 1566 µs."
    const trigEnd = ends(rs, 'ampTrigger')[0]
    const slots = ofType(rs, 'AMP_SLOT').filter((r) => r.t < 5 * MS)
    expect(trigEnd.t).toBe(678 * US)
    expect(slots[0].t).toBe(688 * US)
    expect(slots[0].t - trigEnd.t).toBe(AMP_SIFS_NS)
    const ack1 = txs(rs, 'ampAck')[0], ack1End = ends(rs, 'ampAck')[0]
    expect([ack1.t, ack1End.t]).toEqual([1226 * US, 1556 * US])
    expect(slots[1].t).toBe(1566 * US)
    expect(slots[1].t - ack1End.t).toBe(AMP_SIFS_NS)
  })

  it('the first round runs to the timeline table, slot by slot and Ack by Ack', () => {
    // every "From"/"To" cell of "The first round on the AP’s lane", and
    // "AMP Trigger, 4 slots × 528 µs"
    const slots = ofType(rs, 'AMP_SLOT').filter((r) => r.t < 5 * MS)
    expect(slots.map((r) => r.slot)).toEqual([1, 2, 3, 4])
    expect(slots.map((r) => [r.t / US, r.untilNs / US])).toEqual([[688, 1216], [1566, 2094], [2444, 2972], [3322, 3850]])
    const ackSpans = txs(rs, 'ampAck').filter((r) => r.t < 5 * MS)
      .map((r) => [r.t / US, (r.t + r.frame.txTimeNs) / US])
    expect(ackSpans).toEqual([[1226, 1556], [2104, 2434], [2982, 3312], [3860, 4190]])
    expect(new Set(slots.map((r) => r.untilNs - r.t))).toEqual(new Set([528 * US]))
    expect(new Set(txs(rs, 'ampAck').map((r) => r.frame.txTimeNs))).toEqual(new Set([330 * US]))
    // the table's Ack rows: "AMP Ack₁ → Door tag", "AMP Ack₂ → Fridge tag", then two "→ Router"
    const round1Acks = txs(rs, 'ampAck').filter((r) => r.t < 5 * MS)
    expect(round1Acks.map((r) => r.frame.dst)).toEqual(['tag-2', 'tag-1', 'ap', 'ap'])
    const round = ofType(rs, 'AMP_ROUND')[0]
    expect(round.slots).toBe(4)
    expect(round.slotNs).toBe(528 * US)
    expect(round.acwe).toBe(2)
  })

  it('the round costs 4190 µs of channel, 4.19 % of each 100 ms', () => {
    // "round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 4.19 % of 100 ms"
    const total = 50 + 10 + 618 + 4 * (10 + 528 + 10 + 330)
    expect(total).toBe(4190)
    const cts = txs(rs, 'cts')[0]
    const lastAck = ends(rs, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t - cts.t).toBe(4190 * US)
    expect(((4190 / 100_000) * 100).toFixed(2)).toBe('4.19')
  })

  it('of those 4190 µs, 3044 µs are PPDU, 90 µs are SIFS gaps and 1056 µs are two silent slots', () => {
    // "Of those 4190 µs only 3044 µs is PPDU actually on the air. 90 µs is the nine SIFS gaps, and
    //  1056 µs is the two slots nobody used."
    const first = [...txs(rs, 'cts'), ...txs(rs, 'ampTrigger'), ...txs(rs, 'ampAck'), ...txs(rs, 'ampResp')]
      .filter((r) => r.t < 5 * MS)
    expect(first.reduce((s, r) => s + r.frame.txTimeNs, 0)).toBe(3044 * US)
    expect(9 * (AMP_SIFS_NS / US)).toBe(90)
    expect(2 * 528).toBe(1056)
    expect(3044 + 90 + 1056).toBe(4190)
  })

  it('at 1 Mb/s the same round is 1670 µs, 1.67 % of each 100 ms', () => {
    // "the round is 1670 µs instead of 4190 µs, 1.67 % of each 100 ms instead of 4.19 % … It now ends at
    //  318 µs and slot 1 opens at 328 µs … check the CTS Duration: 1620 µs."
    const fast = recs(0)
    const total = 50 + 10 + 258 + 4 * (10 + 132 + 10 + 186)
    expect(total).toBe(1670)
    const cts = txs(fast, 'cts')[0]
    expect(cts.frame.durationFieldNs).toBe(1620 * US)
    const lastAck = ends(fast, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t - cts.t).toBe(1670 * US)
    expect(((1670 / 100_000) * 100).toFixed(2)).toBe('1.67')
    expect(ends(fast, 'ampTrigger')[0].t).toBe(318 * US)
    expect(ofType(fast, 'AMP_SLOT')[0].t).toBe(328 * US)
    expect(ofType(fast, 'AMP_ROUND')[0].slotNs).toBe(132 * US)
  })
})

describe('amp-intro · a second of polling', () => {
  const rs = recs()

  it('one second holds ten rounds, forty slots and forty Acks, sixteen of them naming a tag', () => {
    // "The router starts a round every 100 ms on the dot, so one second holds ten rounds: forty slots,
    //  forty Acks, twenty tag responses. Sixteen Acks name a tag; twenty-four name the router itself."
    expect(ofType(rs, 'AMP_ROUND').length).toBe(10)
    expect(ofType(rs, 'AMP_ROUND').map((r) => r.t)[1]).toBe(100 * MS + 60 * US)
    expect(ofType(rs, 'AMP_SLOT').length).toBe(40)
    const acks = txs(rs, 'ampAck')
    expect(acks.length).toBe(40)
    expect(acks.filter((r) => r.frame.dst !== r.frame.src).length).toBe(16)
    expect(acks.filter((r) => r.frame.dst === r.frame.src).length).toBe(24)
    expect(txs(rs, 'ampResp').length).toBe(20)
    expect(txs(rs, 'cts').map((r) => r.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => k * 100 * MS))
  })

  it('each tag answers all ten rounds: eight acknowledged and two lost', () => {
    // "Each tag answers in all ten rounds — eight acknowledged, two lost."
    for (const tag of TAGS) {
      const rr = results(rs, tag)
      expect(rr.length).toBe(10)
      expect(rr.every((r) => r.sent)).toBe(true)
      expect(rr.filter((r) => r.acked).length).toBe(8)
      expect(rr.filter((r) => !r.acked).length).toBe(2)
    }
    expect(ofType(rs, 'AMP_RESULT').filter((r) => r.acked).length).toBe(16)
  })

  it('the inspector counters a tag ends the second with are 10 / 8 / 2', () => {
    // "The inspector shows a tag’s ABOC, ACW, armed slot and its sent / acknowledged / lost counters,
    //  — 10 / 8 / 2 after one second."
    const vs = initViewState(ampIntro.scenario())
    for (const r of rs) applyRecord(vs, r)
    for (const tag of TAGS) {
      expect(vs.nodes[tag].amp, tag).toMatchObject({ sent: 10, acked: 8, lost: 2, roundsHeard: 10, roundsSatOut: 0 })
    }
  })

  it('a draw of 3 lands in slot 4, so with ACW + 1 = N neither tag ever sits a round out', () => {
    // "each tag draws an ABOC uniformly from 0, 1, 2, 3 and transmits in slot ABOC + 1 — a draw of 3
    //  lands in slot 4, the last one there is. A tag sits a round out only when the draw can land past
    //  the last slot, that is when ACW + 1 > N; here ACW + 1 = 4 = N, so neither tag ever sits out."
    const acw = 2 ** 2 - 1
    const slots = ampIntro.scenario().nodes[0].ampAp!.slots
    expect(acw).toBe(3)
    expect(acw + 1).toBe(slots)
    expect(acw + 1 > slots).toBe(false)
    for (const tag of TAGS) {
      const a = aboc(rs, tag)
      expect(a.length).toBe(10)
      expect(new Set(a.map((r) => r.acw))).toEqual(new Set([acw]))
      expect(a.every((r) => r.aboc >= 0 && r.aboc <= acw)).toBe(true)
      expect(a.every((r) => r.slot === r.aboc + 1)).toBe(true)
      expect(a.filter((r) => r.slot === null).length).toBe(0)
    }
    // "a draw of 3 lands in slot 4, the last one there is" — it happens in this run
    expect(ofType(rs, 'AMP_ABOC').some((r) => r.aboc === acw && r.slot === slots)).toBe(true)
  })

  it('the two losses are the two rounds in which both tags drew the same slot', () => {
    // "twice in ten rounds both tags draw the same number and collide, in the slot ending at 201 216 µs
    //  and the one ending at 502 972 µs. The AP records a collision, the closing Ack names the router,
    //  and each tag learns at 201 556 µs and 503 312 µs that its reading never arrived."
    const coll = ofType(rs, 'COLLISION')
    expect(coll.length).toBe(2)
    // the COLLISION is stamped at the instant the overlapping slot ends
    expect(coll.map((r) => r.t)).toEqual([201_216 * US, 502_972 * US])
    for (const c of coll) {
      expect([...c.nodes].sort()).toEqual([...TAGS])
      const slot = ofType(rs, 'AMP_SLOT').find((r) => r.untilNs === c.t)!
      expect(slot.untilNs).toBe(c.t)
    }
    const fail = ofType(rs, 'RX_FAIL').filter((r) => r.node === AP)
    expect(fail.length).toBe(2)
    expect(fail.every((r) => r.reason === 'collision')).toBe(true)
    const lost = ofType(rs, 'AMP_RESULT').filter((r) => !r.acked)
    expect(lost.map((r) => r.slot)).toEqual([1, 1, 3, 3])
    expect([...new Set(lost.map((r) => r.t))]).toEqual([201_556 * US, 503_312 * US])
    for (const c of coll) {
      const ack = txs(rs, 'ampAck').find((r) => r.t > c.t)!
      expect(ack.frame.dst).toBe(ack.frame.src)
    }
  })

  it('the tags never carrier-sense, never back off and never wait out an IFS; the AP does all three', () => {
    // "neither tag emits one CCA_BUSY, BACKOFF_DRAW or IFS_START record — it has none of those things to
    //  record, and its entire contribution to the timeline is ten transmissions. The router’s lane has
    //  all three."
    for (const tag of TAGS) {
      for (const type of CONTENTION_RECORDS) expect(countAt(rs, tag, type), `${tag} ${type}`).toBe(0)
      expect(countAt(rs, tag, 'TX_START')).toBe(10)
    }
    for (const type of CONTENTION_RECORDS) expect(countAt(rs, AP, type), `ap ${type}`).toBeGreaterThan(0)
    // "the AP wins the channel with its AC_BK access function"
    expect(ofType(rs, 'IFS_START').every((r) => r.ac === 0)).toBe(true)
  })

  it('no lane in this scene ever sets a NAV', () => {
    // "What no lane here holds is a NAV_SET: a CTS-to-self sets a NAV in the nodes that hear it, never
    //  in its own sender, and there is no other Wi-Fi node to send one back."
    expect(ofType(rs, 'NAV_SET').length).toBe(0)
    expect(countAt(rs, AP, 'NAV_SET')).toBe(0)
    // the Duration is nonetheless on the air for anyone who might arrive
    expect(txs(rs, 'cts')[0].frame.durationFieldNs).toBe(4140 * US)
  })

  it('the link budget leaves both tags far above the thresholds that matter', () => {
    // "The router reaches the Door tag at −37.4 dBm, 34.6 dB above the −72 dBm a tag needs here … its
    //  reply still arrives at −57.4 dBm, 36.6 dB above the AP’s −94 dBm floor … −94 dBm is about 12 dB
    //  below the −82 dBm preamble-detect gate an OFDM frame has to clear to be received at all."
    const s = ampIntro.scenario()
    const links = buildLinkTable(s.nodes, s.walls)
    // the engine gives 2.4 GHz 6.5 dB less path loss than the band-neutral table
    expect(LINK_EXTRA_LOSS_DB['2g']).toBe(-6.5)
    const dl = rssiOn('2g', links, 'ap', 'tag-2')
    const ul = rssiOn('2g', links, 'tag-2', 'ap')
    expect(dl.toFixed(1)).toBe('-37.4')
    expect(ul.toFixed(1)).toBe('-57.4')
    expect((dl - AMP_TAG_DL_SENS_DBM).toFixed(1)).toBe('34.6')
    expect((ul - ampUlSensDbm(250)).toFixed(1)).toBe('36.6')
    expect(CCA_PD_DBM).toBe(-82)
    expect(Math.round(CCA_PD_DBM - ampUlSensDbm(250))).toBe(12)
  })
})

describe('amp-intro · the try-this experiments', () => {
  const withSens = (dlSensDbm: number): Scenario => {
    const base = ampIntro.scenario()
    return { ...base, nodes: base.nodes.map((n: NodeCfg) => (n.id === 'tag-2' ? { ...n, ampTag: { dlSensDbm } } : n)) }
  }

  it('a Door tag deafened past its received −37.4 dBm answers nothing, and the round is unchanged', () => {
    // "In the editor raise the Door tag’s downlink sensitivity threshold above the −37.4 dBm it actually
    //  receives, and reload. It stops decoding triggers, so it never draws an ABOC and never transmits —
    //  while the round keeps its forty slots and forty Acks a second, unchanged."
    // −36 dBm is above what it receives, −38 dBm below: the bracket measures the received power itself.
    expect(run(withSens(-38)).filter((r) => 'node' in r && r.node === 'tag-2#2g' && r.type === 'AMP_ABOC').length).toBe(10)
    const rs = run(withSens(-36))
    expect(countAt(rs, 'tag-2#2g', 'AMP_ABOC')).toBe(0)
    expect(countAt(rs, 'tag-2#2g', 'TX_START')).toBe(0)
    expect(countAt(rs, 'tag-2#2g', 'AMP_RESULT')).toBe(0)
    // the round itself does not notice
    expect(ofType(rs, 'AMP_SLOT').length).toBe(40)
    expect(txs(rs, 'ampAck').length).toBe(40)
    expect(ofType(rs, 'AMP_ROUND').length).toBe(10)
    // the Fridge tag keeps answering, and now nothing collides with it
    expect(countAt(rs, 'tag-1#2g', 'AMP_ABOC')).toBe(10)
    expect(results(rs, 'tag-1#2g').filter((r) => r.acked).length).toBe(10)
  })
})

describe('amp-intro · what the UI shows', () => {
  const rs = recs()
  const CTX = { apId: 'ap', isEdca: false }

  it('the Ack’s ID field names the tag it acknowledges, or the AP when the slot was empty', () => {
    // "Open the Ack at 1226 µs in frame detail: its ID field is two octets and names the Door tag. Then
    //  the one at 2982 µs, closing an empty slot — same 330 µs PPDU, four octets again, but the ID field
    //  carries the router’s id."
    const toTag = txs(rs, 'ampAck')[0]
    expect(toTag.t).toBe(1226 * US)
    const idField = decodeFrame(toTag.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ampId')!
    expect(idField.bytes).toBe(2)
    expect(idField.node).toBe('tag-2')
    const empty = txs(rs, 'ampAck').find((r) => r.frame.dst === r.frame.src)!
    expect(empty.t).toBe(2982 * US)
    expect(empty.frame.txTimeNs).toBe(330 * US)
    expect(empty.frame.bytes).toBe(4)
    expect(decodeFrame(empty.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ampId')!.node).toBe('ap')
  })

  it('the Ack PPDU spends 128 µs of its 330 µs on the four octets it carries', () => {
    // "The four octets are 128 µs; the other 202 µs is preamble, AMP-Sync, AMP-SIG, padding and
    //  signal extension"
    const toTag = txs(rs, 'ampAck')[0]
    const ppdu = decodeFrame(toTag.frame, CTX).ppdu
    expect(ppdu.find((s) => s.key === 'ampData')!.durNs).toBe(128 * US)
    expect(ppdu.reduce((s, x) => s + x.durNs, 0)).toBe(330 * US)
    expect(330 - 128).toBe(202)
  })

  it('the log prints the ABOC draw, the round summary and the outcome the lesson quotes', () => {
    // "The log prints the draw as “ABOC 1 of [0, 3] → slot 2” and the outcome as “slot 1: acknowledged”;
    //  the round line names the slots, the ACW and both rates."
    expect(fmtRecord(ofType(rs, 'AMP_ABOC')[0])).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord(ofType(rs, 'AMP_ROUND')[0]))
      .toBe('ap#2g AMP round (random): 4 slots × 528.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
    expect(fmtRecord(ofType(rs, 'AMP_RESULT')[0])).toBe('tag-2#2g slot 1: acknowledged')
  })

  it('the trigger’s six-octet body carries the numbers the round is built from', () => {
    // "Frame detail decodes the trigger’s 6-octet body field by field" — and those fields are the
    // round's own parameters, so the decode is pinned against them.
    const trig = txs(rs, 'ampTrigger')[0]
    const body = decodeFrame(trig.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'body')!
    expect(body.bytes).toBe(6)
    expect(body.value).toBe('Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading')
    expect(trig.frame.dst).toBe('*amp')
  })
})
