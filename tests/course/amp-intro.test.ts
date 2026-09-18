/**
 * Every empirical claim in the "A station that never contends" lesson, measured
 * against the lesson's own scenario and variant. Each assertion quotes the
 * sentence it guards; standard constants are checked against the engine's
 * exports (src/engine/amp.ts, src/engine/phy.ts) rather than re-typed.
 */
import { describe, it, expect } from 'vitest'
import { ampIntro } from '../../src/course/amp/amp-intro'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_ACK_BYTES, AMP_DL_SYNC_NS, AMP_DL_REQ_SINR_DB, AMP_LEGACY_PREAMBLE_NS, AMP_PADDING_NS,
  AMP_PADDING_PROTECTED_NS, AMP_SIFS_NS, AMP_TAG_DL_SENS_DBM, AMP_UL_CHIP_NS, AMP_UL_REQ_SINR_DB,
  AMP_DL_SIG_BYTES, AMP_UL_SYNC_CHIPS, ampBitsNs, ampDlPpduNs, ampRespBytes, ampTriggerBytes, ampUlPpduNs, ampUlSensDbm,
} from '../../src/engine/amp'
import { ACK_TX_TIME_6M_NS, CTS_BYTES, ERP_2G, SLOT_NS, txTimeNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { decodeFrame } from '../../src/model/frameFields'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS

const AP = 'ap#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g'] as const

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const s: Scenario = variant === undefined ? ampIntro.scenario() : ampIntro.variants![variant].scenario()
    memo.set(key, [...new Simulation(s).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const aboc = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_ABOC').filter((r) => r.node === node)
const results = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_RESULT').filter((r) => r.node === node)

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

  it('the scene is one AP and two tags, and nothing else', () => {
    // "The scene: one Wi-Fi 7 router, two battery-free tags and no Wi-Fi traffic at all."
    const s = ampIntro.scenario()
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', 'amp', 'amp'])
    // "Here a Wi-Fi 7 router, because the downlink AMP PPDU carries a U-SIG field."
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
    // "a clock good enough to count 9 µs slots" — the DCF slot a contending station lives by
    expect(SLOT_NS).toBe(9 * US)
    expect(ERP_2G.slotNs).toBe(SLOT_NS)
  })

  it('the trigger and Ack carry 20 µs of padding, 36 µs when protected', () => {
    // "The padding buys that time where it costs only airtime: 20 µs unprotected, 36 µs protected"
    expect(AMP_PADDING_NS).toBe(20 * US)
    expect(AMP_PADDING_PROTECTED_NS).toBe(36 * US)
  })

  it('the downlink PPDU is 32 µs of legacy preamble, 80 µs of AMP-Sync, then OOK', () => {
    // "32 µs of legacy preamble … 80 µs of AMP-Sync … AMP-SIG, two octets: 64 µs at 250 kb/s and 16 µs at 1 Mb/s …
    //  the 13 octets of the trigger take 416 µs … 6 µs of signal extension"
    expect(AMP_LEGACY_PREAMBLE_NS).toBe(32 * US)
    expect(AMP_DL_SYNC_NS).toBe(80 * US)
    expect(AMP_DL_SIG_BYTES).toBe(2)
    expect(ampBitsNs(2 * 8, 250)).toBe(64 * US)
    expect(ampBitsNs(2 * 8, 1000)).toBe(16 * US)
    expect(ampBitsNs(13 * 8, 250)).toBe(416 * US)
    expect(ERP_2G.signalExtNs).toBe(6 * US)
    expect(32 + 80 + 64 + 416 + 20 + 6).toBe(618)
  })

  it('the uplink PPDU has no preamble: 48 sync chips, then the data', () => {
    // "48 chips of AMP-Sync — 48 µs at 250 kb/s, 12 µs at 1 Mb/s — and then the data octets"
    expect(AMP_UL_SYNC_CHIPS).toBe(48)
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[250]).toBe(48 * US)
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[1000]).toBe(12 * US)
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

  it('the CTS-to-self is 44 µs at 6 Mb/s plus the 6 µs 2.4 GHz signal extension', () => {
    // "a non-HT CTS-to-self — 44 µs at 6 Mb/s plus the band’s 6 µs signal extension, 50 µs in all"
    expect(txTimeNs(CTS_BYTES, 6)).toBe(44 * US)
    expect(ACK_TX_TIME_6M_NS).toBe(44 * US)
    expect(txTimeNs(CTS_BYTES, 6) + ERP_2G.signalExtNs).toBe(50 * US)
  })

  it('the model values: −72 dBm tag sensitivity, 8 dB downlink SINR, 10 dB uplink SINR, −94 dBm uplink floor', () => {
    // "the tag’s −72 dBm downlink sensitivity, the OOK SINR thresholds (8 dB down, 10 dB up at 250 kb/s) … are
    //  model choices, not standard values" / "the AP’s −94 dBm floor for a 250 kb/s OOK response"
    expect(AMP_TAG_DL_SENS_DBM).toBe(-72)
    expect(AMP_DL_REQ_SINR_DB).toBe(8)
    expect(AMP_UL_REQ_SINR_DB[250]).toBe(10)
    expect(Math.round(ampUlSensDbm(250))).toBe(-94)
  })
})

describe('amp-intro · the shape of one round', () => {
  const rs = recs()

  it('the round opens with a CTS-to-self one SIFS before the trigger', () => {
    // "The first CTS-to-self goes out at 0 µs and ends at 50 µs; the trigger starts at 60 µs, one 10 µs SIFS later."
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
    // "Its Duration field is 4140 µs, so the NAV it sets expires at 4190 µs — the very microsecond the
    //  fourth Ack stops transmitting."
    const cts = txs(rs, 'cts')[0]
    expect(cts.frame.durationFieldNs).toBe(4140 * US)
    const navEnd = ends(rs, 'cts')[0].t + cts.frame.durationFieldNs
    expect(navEnd).toBe(4190 * US)
    const lastAck = ends(rs, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t).toBe(navEnd)
  })

  it('slot 1 starts one AMP SIFS after the trigger ends, and slot 2 one AMP SIFS after Ack₁', () => {
    // "The trigger ends at 678 µs and slot 1 opens at 688 µs … Ack₁ runs from 1226 µs to 1556 µs and slot 2
    //  opens at 1566 µs"
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

  it('all four slots are 528 µs long and all four Acks 330 µs, whoever answered', () => {
    // the "Slot / Ack" columns of the first round's timeline table, and
    // "Every slot is the same 528 µs and every Ack the same 330 µs, whether a tag answered or not."
    const slots = ofType(rs, 'AMP_SLOT').filter((r) => r.t < 5 * MS)
    expect(slots.map((r) => r.slot)).toEqual([1, 2, 3, 4])
    expect(slots.map((r) => [r.t / US, r.untilNs / US])).toEqual([[688, 1216], [1566, 2094], [2444, 2972], [3322, 3850]])
    const ackSpans = txs(rs, 'ampAck').filter((r) => r.t < 5 * MS)
      .map((r) => [r.t / US, (r.t + r.frame.txTimeNs) / US])
    expect(ackSpans).toEqual([[1226, 1556], [2104, 2434], [2982, 3312], [3860, 4190]])
    expect(new Set(slots.map((r) => r.untilNs - r.t))).toEqual(new Set([528 * US]))
    expect(new Set(txs(rs, 'ampAck').map((r) => r.frame.txTimeNs))).toEqual(new Set([330 * US]))
    const round = ofType(rs, 'AMP_ROUND')[0]
    expect(round.slots).toBe(4)
    expect(round.slotNs).toBe(528 * US)
    expect(round.acwe).toBe(2)
  })

  it('the round costs 4190 µs of channel, 4.19 % of each 100 ms', () => {
    // "CTS 50 + SIFS 10 + trigger 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs … 4.19 % of every 100 ms"
    const total = 50 + 10 + 618 + 4 * (10 + 528 + 10 + 330)
    expect(total).toBe(4190)
    const cts = txs(rs, 'cts')[0]
    const lastAck = ends(rs, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t - cts.t).toBe(4190 * US)
    expect(((4190 / 100_000) * 100).toFixed(2)).toBe('4.19')
  })

  it('of those 4190 µs, 3044 µs are PPDU, 90 µs are SIFS gaps and 1056 µs are two silent slots', () => {
    // "3044 µs of it is PPDU on the air, 90 µs is the nine SIFS gaps, and 1056 µs is the two slots nobody used."
    const first = [...txs(rs, 'cts'), ...txs(rs, 'ampTrigger'), ...txs(rs, 'ampAck'), ...txs(rs, 'ampResp')]
      .filter((r) => r.t < 5 * MS)
    expect(first.reduce((s, r) => s + r.frame.txTimeNs, 0)).toBe(3044 * US)
    expect(9 * (AMP_SIFS_NS / US)).toBe(90)
    expect(2 * 528).toBe(1056)
    expect(3044 + 90 + 1056).toBe(4190)
  })

  it('at 1 Mb/s the same round is 1670 µs, 1.67 % of each 100 ms', () => {
    // "the whole round shrinks to 1670 µs — 1.67 % of every 100 ms"
    const fast = recs(0)
    const total = 50 + 10 + 258 + 4 * (10 + 132 + 10 + 186)
    expect(total).toBe(1670)
    const cts = txs(fast, 'cts')[0]
    expect(cts.frame.durationFieldNs).toBe(1620 * US)
    const lastAck = ends(fast, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t - cts.t).toBe(1670 * US)
    expect(((1670 / 100_000) * 100).toFixed(2)).toBe('1.67')
    // "the trigger now ends at 318 µs and slot 1 opens at 328 µs"
    expect(ends(fast, 'ampTrigger')[0].t).toBe(318 * US)
    expect(ofType(fast, 'AMP_SLOT')[0].t).toBe(328 * US)
    expect(ofType(fast, 'AMP_ROUND')[0].slotNs).toBe(132 * US)
  })
})

describe('amp-intro · a second of polling', () => {
  const rs = recs()

  it('one second holds ten rounds, forty slots and forty Acks, sixteen of them naming a tag', () => {
    // "In one second the AP runs ten rounds, opens forty slots and sends forty Acks; sixteen name a tag and
    //  twenty-four name the AP itself."
    expect(ofType(rs, 'AMP_ROUND').length).toBe(10)
    expect(ofType(rs, 'AMP_ROUND').map((r) => r.t)[1]).toBe(100 * MS + 60 * US)
    expect(ofType(rs, 'AMP_SLOT').length).toBe(40)
    const acks = txs(rs, 'ampAck')
    expect(acks.length).toBe(40)
    expect(acks.filter((r) => r.frame.dst !== r.frame.src).length).toBe(16)
    expect(acks.filter((r) => r.frame.dst === r.frame.src).length).toBe(24)
    // "the router starts a round every 100 ms on the dot"
    expect(txs(rs, 'cts').map((r) => r.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => k * 100 * MS))
  })

  it('each tag answers all ten rounds: eight acknowledged and two lost', () => {
    // "Each tag answers in all ten rounds; eight of its responses are acknowledged and two are lost."
    for (const tag of TAGS) {
      const rr = results(rs, tag)
      expect(rr.length).toBe(10)
      expect(rr.every((r) => r.sent)).toBe(true)
      expect(rr.filter((r) => r.acked).length).toBe(8)
      expect(rr.filter((r) => !r.acked).length).toBe(2)
    }
    expect(txs(rs, 'ampResp').length).toBe(20)
    expect(ofType(rs, 'AMP_RESULT').filter((r) => r.acked).length).toBe(16)
  })

  it('neither tag ever sits a round out: ACW is 3 and every draw lands in one of the four slots', () => {
    // "ACWE 2 makes ACW = 2² − 1 = 3, so the draw is one of 0, 1, 2, 3 and can never reach the fourth slot's
    //  index — with four slots on offer no draw is ever wasted, and in these ten rounds neither tag sits out once."
    expect(2 ** 2 - 1).toBe(3)
    for (const tag of TAGS) {
      const a = aboc(rs, tag)
      expect(a.length).toBe(10)
      expect(new Set(a.map((r) => r.acw))).toEqual(new Set([3]))
      expect(a.every((r) => r.aboc >= 0 && r.aboc <= 3)).toBe(true)
      expect(a.filter((r) => r.slot === null).length).toBe(0)
      expect(a.every((r) => r.slot === r.aboc + 1)).toBe(true)
    }
  })

  it('the two losses are the two rounds in which both tags drew the same slot', () => {
    // "Twice in ten rounds both tags draw the same number: at 201 216 µs (slot 1) and 502 972 µs (slot 3) the
    //  two responses overlap, the AP records a collision, and the Ack that follows names the AP itself."
    const coll = ofType(rs, 'COLLISION')
    expect(coll.length).toBe(2)
    expect(coll.map((r) => r.t)).toEqual([201_216 * US, 502_972 * US])
    for (const c of coll) expect([...c.nodes].sort()).toEqual([...TAGS])
    const fail = ofType(rs, 'RX_FAIL').filter((r) => r.node === AP)
    expect(fail.length).toBe(2)
    expect(fail.every((r) => r.reason === 'collision')).toBe(true)
    // the slots the two collisions happened in
    const lost = ofType(rs, 'AMP_RESULT').filter((r) => !r.acked)
    expect(lost.map((r) => r.slot)).toEqual([1, 1, 3, 3])
    expect([...new Set(lost.map((r) => r.t))]).toEqual([201_556 * US, 503_312 * US])
    // the Ack closing a collided slot names the AP, not a tag
    for (const c of coll) {
      const ack = txs(rs, 'ampAck').find((r) => r.t > c.t)!
      expect(ack.frame.dst).toBe(ack.frame.src)
    }
  })

  it('the tags never carrier-sense, never set a NAV and never draw a backoff', () => {
    // "In a whole second of records neither tag produces a single CCA_BUSY, NAV_SET, BACKOFF_DRAW or IFS_START
    //  — it has no carrier sense, no NAV and no contention window. The AP's own lane has all of them."
    const silent = ['CCA_BUSY', 'CCA_IDLE', 'NAV_SET', 'BACKOFF_DRAW', 'BACKOFF_DEC', 'BACKOFF_FREEZE', 'IFS_START', 'IFS_END', 'CW_CHANGE', 'RETRY']
    for (const tag of TAGS) {
      for (const type of silent) {
        expect(rs.filter((r) => 'node' in r && r.node === tag && r.type === type).length, `${tag} ${type}`).toBe(0)
      }
      // what a tag does emit
      expect(rs.filter((r) => 'node' in r && r.node === tag && r.type === 'TX_START').length).toBe(10)
    }
    for (const type of ['CCA_BUSY', 'BACKOFF_DRAW', 'IFS_START', 'CW_CHANGE']) {
      expect(rs.filter((r) => 'node' in r && r.node === AP && r.type === type).length, `ap ${type}`).toBeGreaterThan(0)
    }
    // "the round is won by the AP's AC_BK access function"
    expect(ofType(rs, 'IFS_START').every((r) => r.ac === 0)).toBe(true)
  })

  it('the link budget leaves both tags far above the thresholds that matter', () => {
    // "the router reaches the Door tag at −43.9 dBm, 28.1 dB above the −72 dBm a tag needs; the tag's own
    //  0 dBm reply arrives at −63.9 dBm, 30.1 dB above the AP's −94 dBm floor for a 250 kb/s response."
    const s = ampIntro.scenario()
    const links = buildLinkTable(s.nodes, s.walls)
    const dl = links.get('ap')!.get('tag-2')!
    const ul = links.get('tag-2')!.get('ap')!
    expect(dl.toFixed(1)).toBe('-43.9')
    expect(ul.toFixed(1)).toBe('-63.9')
    expect((dl - AMP_TAG_DL_SENS_DBM).toFixed(1)).toBe('28.1')
    expect((ul - ampUlSensDbm(250)).toFixed(1)).toBe('30.1')
  })
})

describe('amp-intro · what the UI shows', () => {
  const rs = recs()
  const CTX = { apId: 'ap', isEdca: false }

  it('the Ack’s ID field names the tag it acknowledges, or the AP when the slot was empty', () => {
    // "Open an Ack in frame detail: its ID field is two octets and reads the tag's 16-bit identifier … an Ack
    //  for an empty slot carries the AP's own id instead"
    const toTag = txs(rs, 'ampAck').find((r) => r.frame.dst !== r.frame.src)!
    const idField = decodeFrame(toTag.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ampId')!
    expect(idField.bytes).toBe(2)
    expect(idField.node).toBe('tag-2')
    const empty = txs(rs, 'ampAck').find((r) => r.frame.dst === r.frame.src)!
    expect(empty.t).toBe(2982 * US)
    expect(decodeFrame(empty.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ampId')!.node).toBe('ap')
  })

  it('the Ack PPDU spends 128 µs of its 330 µs on the four octets it carries', () => {
    // "Four octets at 250 kb/s are 128 µs of the 330 µs; the other 202 µs are preamble, sync, SIG, padding
    //  and signal extension — overhead a shorter Ack cannot escape."
    const toTag = txs(rs, 'ampAck').find((r) => r.frame.dst !== r.frame.src)!
    const ppdu = decodeFrame(toTag.frame, CTX).ppdu
    expect(ppdu.find((s) => s.key === 'ampData')!.durNs).toBe(128 * US)
    expect(ppdu.reduce((s, x) => s + x.durNs, 0)).toBe(330 * US)
    expect(330 - 128).toBe(202)
  })

  it('the log prints the ABOC draw and the round summary the lesson quotes', () => {
    // "the log reads “ABOC 1 of [0, 3] → slot 2”" / "“AMP round (random): 4 slots × 528.0 µs, ACW 3,
    //  DL 250 kb/s, UL 250 kb/s”"
    const first = ofType(rs, 'AMP_ABOC')[0]
    expect(fmtRecord(first)).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord(ofType(rs, 'AMP_ROUND')[0]))
      .toBe('ap#2g AMP round (random): 4 slots × 528.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
    expect(fmtRecord(ofType(rs, 'AMP_RESULT')[0])).toBe('tag-2#2g slot 1: acknowledged')
  })

  it('the trigger’s body carries the four numbers the round is built from', () => {
    // "Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading"
    const trig = txs(rs, 'ampTrigger')[0]
    const body = decodeFrame(trig.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'body')!
    expect(body.bytes).toBe(6)
    expect(body.value).toBe('Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading')
    expect(trig.frame.dst).toBe('*amp')
  })
})
