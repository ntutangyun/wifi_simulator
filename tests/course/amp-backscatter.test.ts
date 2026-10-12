/**
 * Every empirical claim in 《反向散射：标签靠反射说话》, measured against the lesson's own
 * scenario and its four variants at 1000 ms. Standard and model constants are checked against
 * the engine's exports (src/engine/ampBs.ts, src/model/scenario.ts) rather than re-typed, and
 * the two reach figures are the engine's own closed forms rather than arithmetic repeated here.
 *
 * The lesson exists because the backscatter tier — 878 lines across `ampBs.ts`, `ampBsSta.ts`
 * and `ampReader.ts`, with five record types of its own — had engine tests and no course
 * scenario: the census behind docs/wifi-feature-coverage.md §11 ran all 251 scenarios of the
 * course for 5 000 ms and got zero records of any of the five. So the first thing this file
 * asserts is that the scene produces all five, and that assertion is the one the lesson is for.
 *
 * It also carries this slice's inert-config ruling (docs/inert-config-contract.md): the
 * reader's `write` flag is byte-for-byte inert at the default `txopMs: 4`, and it is PINNED
 * rather than refused, because it is scenario-dependent (10 ms of TXOP and the Writes appear,
 * asserted below) and because the lesson now teaches that fact.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ampBackscatter, ampBackscatterScenario } from '../../src/course/amp/amp-backscatter'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_AMP_BS, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_BS_ACTIVATION_DBM, AMP_BS_ISOLATION_DB, AMP_BS_LOSS_DB, AMP_BS_READER_DR_DB,
  AMP_BS_REQ_SNR_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_UL_SYNC_CHIPS, AMP_BS_WRITE_T3_NS,
  AMP_BS_BST_MIN_NS, AMP_BS_WUP_MIN_NS, GEN2_REPLY_BYTES, activationReachM, ampBsDlPpduNs,
  bsPathLossDb, bsReplyDbm, bsReplyNs, bstNs, freeSpacePl0Db, monoLeakDbm, monoReachM,
  readerFloorDbm, FREQ_24G_MHZ,
} from '../../src/engine/ampBs'
import { ERP_2G } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { applyRecord, initViewState } from '../../src/model/view'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { lessonTexts } from '../../src/course/readability'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'

const MS = 1_000_000
const RUN_NS = 1000 * MS
const AP = 'ap#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g', 'tag-3#2g', 'tag-4#2g', 'tag-5#2g', 'tag-6#2g'] as const
/** The five record types the coverage census measured at zero across all 251 course scenarios. */
const BS_RECORDS = ['AMP_RFID', 'AMP_BS_COUNTER', 'AMP_BS_REPLY', 'AMP_INVENTORY', 'AMP_BS_BOOT'] as const

/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(ampBackscatter, variant, RUN_NS)
/** A scratch scenario, over the same second the lesson's own runs cover. */
const run = (s: Scenario): TLRecord[] => [...new Simulation(s).runUntil(RUN_NS).records]

const inv = (rs: TLRecord[]) => ofType(rs, 'AMP_INVENTORY')
const replies = (rs: TLRecord[], kind: string) => ofType(rs, 'AMP_BS_REPLY').filter((r) => r.kind === kind)
const epcCount = (rs: TLRecord[], node: string): number => replies(rs, 'epc').filter((r) => r.node === node).length
const rfidAirtimeNs = (rs: TLRecord[]): number => ofType(rs, 'TX_START')
  .filter((r) => r.frame.kind === 'ampRfid').reduce((n, r) => n + r.frame.txTimeNs, 0)
const tally = (rs: TLRecord[]) => inv(rs).reduce(
  (a, x) => ({ off: a.off + x.slotsOffered, read: a.read + x.read.length, col: a.col + x.collisions, emp: a.emp + x.empties }),
  { off: 0, read: 0, col: 0, emp: 0 },
)

lessonShapeSuite(ampBackscatter, { runNs: RUN_NS })

describe('amp-backscatter · the lesson’s own scene', () => {
  it('is the fifth lesson of the AMP module, and assumes the slotted-access one', () => {
    expect(MODULES[ampBackscatter.module].title).toBe('环境能量物联网（802.11bp）')
    expect(ampBackscatter.needs).toEqual(['amp-slots'])
    expect(ampBackscatter.terms!.map((t) => t.term))
      .toEqual(['backscatter', 'mono-static', 'WUP-Excitation', 'BST-Excitation', 'EPC', 'Q'])
  })

  it('the scenario and all four variants pass the scenario schema', () => {
    // and in particular the cross-node rule: a backscatter tag with no reader is refused
    // (scenario.ts's superRefine), so a scene of these tags is only legal with the reader on.
    expect(ampBackscatter.scenario()).toEqual(ampBackscatterScenario())
    expect(() => ScenarioSchema.parse(ampBackscatter.scenario())).not.toThrow()
    for (const v of ampBackscatter.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    const noReader: Scenario = {
      ...ampBackscatter.scenario(),
      nodes: ampBackscatter.scenario().nodes.map((n) => (n.kind === 'ap' ? { ...n, ampAp: undefined } : n)),
    }
    expect(() => ScenarioSchema.parse(noReader)).toThrow()
  })

  it('is one reader and six tags at three distances, the reader at the tags’ own height', () => {
    // picture: "六张标签围着它，四张在 15 cm 上，一张在 28 cm，一张在 40 cm" /
    //          "读写器和标签同在 1 m 高度上"
    const s = ampBackscatter.scenario()
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', 'amp', 'amp', 'amp', 'amp', 'amp', 'amp'])
    expect(s.nodes[0].caps.generation).toBe('eht')
    expect(s.nodes[0].ampAp!.backscatter).toEqual(DEFAULT_AMP_BS)
    expect(s.nodes.every((n) => n.pos.z === 1)).toBe(true)
    expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
    const ap = s.nodes[0].pos
    const d = (i: number): number => {
      const p = s.nodes[i].pos
      return Math.round(Math.hypot(p.x - ap.x, p.y - ap.y, p.z - ap.z) * 100) / 100
    }
    expect([d(1), d(2), d(3), d(4), d(5), d(6)]).toEqual([0.15, 0.15, 0.15, 0.15, 0.28, 0.4])
    // the tags have no transmitter of their own and no Wi-Fi capability to speak of
    expect(s.nodes.slice(1).every((n) => n.txPowerDbm === 0 && n.ampTag!.mode === 'backscatter')).toBe(true)
    expect(s.nodes.slice(1).every((n) => n.linkId === '2g')).toBe(true)
  })

  it('the four variants are exactly one reader field each', () => {
    const bsOf = (s: Scenario) => s.nodes[0].ampAp!.backscatter!
    const over = ampBackscatter.variants!.map((v) => bsOf(v.scenario()))
    expect(over).toEqual([
      { ...DEFAULT_AMP_BS, chargeDbm: 20 },
      { ...DEFAULT_AMP_BS, ulKbps: 1000 },
      { ...DEFAULT_AMP_BS, q: 0 },
      { ...DEFAULT_AMP_BS, write: true },
    ])
  })
})

describe('amp-backscatter · the five record types the course had never produced', () => {
  // The whole reason this lesson exists: docs/wifi-feature-coverage.md §11's census ran all 251
  // course scenarios for 5 000 ms and got zero of these. A lesson that introduced the feature
  // without producing a record would be the waste this assertion refuses.
  it('the base scene emits all five, in quantity', () => {
    const rs = recs()
    const n = Object.fromEntries(BS_RECORDS.map((t) => [t, rs.filter((r) => r.type === t).length]))
    expect(n).toEqual({
      AMP_RFID: 77, AMP_BS_COUNTER: 50, AMP_BS_REPLY: 87, AMP_INVENTORY: 26, AMP_BS_BOOT: 130,
    })
  })

  it('every variant emits all five too, so no variant is a scene without the feature', () => {
    for (let v = 0; v < ampBackscatter.variants!.length; v++) {
      for (const t of BS_RECORDS) {
        expect(recs(v).filter((r) => r.type === t).length, `${ampBackscatter.variants![v].label} / ${t}`)
          .toBeGreaterThan(0)
      }
    }
  })

  it('all five reach the view reducer and the log formatter without falling through', () => {
    // The prerequisite docs/wifi-course-backlog.md §W5 named: these five have no exhaustiveness
    // guard in the main record reduction, and this lesson is the first to put them on a reader's
    // timeline. So both renderers are exercised on every one of them, on real records.
    const st = initViewState(ampBackscatter.scenario())
    const seen = new Set<string>()
    for (const r of recs()) {
      applyRecord(st, r)
      if ((BS_RECORDS as readonly string[]).includes(r.type)) {
        seen.add(r.type)
        expect(fmtRecord(r).length, r.type).toBeGreaterThan(10)
      }
    }
    expect([...seen].sort()).toEqual([...BS_RECORDS].sort())
  })
})

describe('amp-backscatter · the two reaches, and why only one of them grows', () => {
  it('the constants behind 「余量 = 64 − 2 × 路损」', () => {
    // picture formula: "激励 − 20（天线隔离）−50（接收动态范围）" / "64 − 2 × 路损"
    expect(AMP_BS_LOSS_DB).toBe(6)
    expect(AMP_BS_ISOLATION_DB).toBe(20)
    expect(AMP_BS_READER_DR_DB).toBe(50)
    expect(AMP_BS_ISOLATION_DB + AMP_BS_READER_DR_DB - AMP_BS_LOSS_DB).toBe(64)
    // numbers: "250 kb/s 的回应要 3 dB 信噪比" / activation at −20 dBm / 40.2 dB first metre
    expect(AMP_BS_REQ_SNR_DB[250]).toBe(3)
    expect(AMP_BS_REQ_SNR_DB[1000]).toBe(9)
    expect(AMP_BS_ACTIVATION_DBM).toBe(-20)
    expect(freeSpacePl0Db(FREQ_24G_MHZ)).toBeCloseTo(40.2, 1)
  })

  it('0.309 m powers a tag and 0.328 m decodes one, and only the first grows with the power', () => {
    // numbers: "这条线落在 0.309 m" / "对应 0.328 m" / "随之推到 0.978 m" / "一动不动，还是 0.328 m"
    expect(activationReachM(DEFAULT_AMP_BS.chargeDbm)).toBeCloseTo(0.309, 3)
    expect(activationReachM(20)).toBeCloseTo(0.978, 3)
    expect(monoReachM(DEFAULT_AMP_BS.bsDbm, 250)).toBeCloseTo(0.328, 3)
    expect(monoReachM(DEFAULT_AMP_BS.bsDbm, 1000)).toBeCloseTo(0.232, 3)
    // the cancellation itself, as an identity over the whole legal range rather than one point
    for (const dbm of [-10, 0, 10, 20, 30]) {
      expect(monoReachM(dbm, 250)).toBeCloseTo(monoReachM(0, 250), 12)
    }
    // …and it is not vacuous: the activation reach really does move over the same range
    expect(activationReachM(30)).toBeGreaterThan(10 * activationReachM(10))
  })

  it('the three distances of the scene straddle the two lines in the order the prose says', () => {
    const act = activationReachM(DEFAULT_AMP_BS.chargeDbm)
    const dec = monoReachM(DEFAULT_AMP_BS.bsDbm, 250)
    expect(0.15).toBeLessThan(act)
    expect(0.28).toBeLessThan(act)
    expect(0.4).toBeGreaterThan(dec)
    expect(0.28).toBeLessThan(dec)
    // "本课六张标签分别落在两条线的内侧、内侧和外侧" — and 28 cm is inside the decode line only
    // because 1 Mb/s is not asked for: that variant is what moves it out.
    expect(0.28).toBeGreaterThan(monoReachM(DEFAULT_AMP_BS.bsDbm, 1000))
  })
})

describe('amp-backscatter · the table of six tags, measured', () => {
  const rs = recs()
  const boot = (node: string) => ofType(rs, 'AMP_BS_BOOT').filter((r) => r.node === node)

  it('the incident power each tag harvests, to two decimals', () => {
    // table: "−13.72 dBm" / "−19.14 dBm" / "−22.24 dBm（没醒过）"
    expect(boot(TAGS[0])[0].incidentDbm).toBeCloseTo(-13.72, 2)
    expect(boot(TAGS[4])[0].incidentDbm).toBeCloseTo(-19.14, 2)
    // 40 cm: below AMP_BS_ACTIVATION_DBM, so the PPDU never decodes at the tag and the tag
    // leaves no record at all — not even the `powered: false` one
    expect(boot(TAGS[5])).toEqual([])
    expect(rs.filter((r) => 'node' in r && r.node === TAGS[5])).toEqual([])
    // what it WOULD have harvested, from the law rather than from a record
    const chargeDbm = DEFAULT_AMP_BS.chargeDbm
    expect(chargeDbm - (freeSpacePl0Db(FREQ_24G_MHZ) + 20 * Math.log10(0.4))).toBeCloseTo(-22.24, 2)
    // every boot in this run is a successful one
    expect(ofType(rs, 'AMP_BS_BOOT').every((r) => r.powered)).toBe(true)
  })

  it('what comes back at the reader, and with how much margin', () => {
    // table: "−53.43 dBm / 16.57 dB" and "−64.28 dBm / 5.72 dB"
    const near = ofType(rs, 'AMP_BS_REPLY').filter((r) => r.node === TAGS[0])[0]
    const far = ofType(rs, 'AMP_BS_REPLY').filter((r) => r.node === TAGS[4])[0]
    expect(near.rxDbmAtAp).toBeCloseTo(-53.43, 2)
    expect(near.snrDb).toBeCloseTo(16.57, 2)
    expect(far.rxDbmAtAp).toBeCloseTo(-64.28, 2)
    expect(far.snrDb).toBeCloseTo(5.72, 2)
    // numbers: "近的那张高出 10.8 dB"
    expect(near.snrDb - far.snrDb).toBeCloseTo(10.84, 2)
    // the four 15 cm tags are within a hundredth of a decibel of each other — the `limits`
    // entry's 「永远精确等距、等功率」
    const atRing = TAGS.slice(0, 4).map((t) => ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === t)!.snrDb)
    expect(Math.max(...atRing) - Math.min(...atRing)).toBeLessThan(0.01)
  })

  it('how many readings each tag yields in one second', () => {
    // table: "4、6、5、6 次" / "2 次" / "0 次"
    expect(TAGS.map((t) => epcCount(rs, t))).toEqual([4, 6, 5, 6, 2, 0])
    // observe: "一秒钟 50 次 RN16 只换来 23 次读到"
    expect(replies(rs, 'rn16').length).toBe(50)
    expect(replies(rs, 'epc').length).toBe(23)
    // every tag that is awake answers once a session, ten sessions in the second
    for (const t of TAGS.slice(0, 5)) {
      expect(replies(rs, 'rn16').filter((r) => r.node === t).length, t).toBe(10)
    }
  })
})

describe('amp-backscatter · one TXOP, one slot', () => {
  it('the three PPDUs of a slot, and the 16 µs between them', () => {
    // formula: "Query 1516 + 16 + ACK 1009 + 16 + Read 1064 + 16 = 3637 µs"
    const sigExt = 6_000
    const wup = Math.round(DEFAULT_AMP_BS.wupMs * MS)
    const query = ampBsDlPpduNs('query', wup, bstNs('rn16', 250), sigExt)
    const ack = ampBsDlPpduNs('ack', 0, bstNs('epc', 250), sigExt)
    const read = ampBsDlPpduNs('read', 0, bstNs('read', 250), sigExt)
    expect(Math.round(query / 1000)).toBe(1516)
    expect(Math.round(ack / 1000)).toBe(1009)
    expect(Math.round(read / 1000)).toBe(1064)
    expect(AMP_BS_T1_NS).toBe(16_000)
    expect(AMP_BS_T2_NS).toBe(16_000)
    expect(Math.round((query + ack + read + 3 * AMP_BS_T2_NS) / 1000)).toBe(3637)
    // numbers: "头一帧前面还挂着 1 ms 的 WUP-Excitation"
    expect(AMP_BS_WUP_MIN_NS).toBe(MS)
    expect(wup).toBe(MS)
    // …and the reserve that stops the next slot being opened: "还要为可能到来的 RN16 预留 16 + 1009 µs"
    expect(Math.round((AMP_BS_T2_NS + ack) / 1000)).toBe(1025)
    const queryRep = ampBsDlPpduNs('queryRep', 0, bstNs('rn16', 250), sigExt)
    expect(query + ack + read + 3 * AMP_BS_T2_NS + queryRep + AMP_BS_T2_NS + ack)
      .toBeGreaterThan(DEFAULT_AMP_BS.txopMs * MS)
    // numbers: "Read 的回应是 8 个字节的存储内容，464 µs" / "一帧 Write 的下行 PPDU 长 2964 µs"
    expect(bsReplyNs('read', 250)).toBe(464_000)
    expect(Math.round(ampBsDlPpduNs('write', 0, bstNs('write', 250, AMP_BS_WRITE_T3_NS), sigExt) / 1000)).toBe(2964)
    expect(AMP_BS_WRITE_T3_NS).toBe(2 * MS)
    // the uplink sync the reply airtime is built on, so 464 µs is not a bare number
    expect(AMP_BS_UL_SYNC_CHIPS).toBe(24)
  })

  it('a Q = 2 session really takes four TXOPs and 14.9 ms', () => {
    // numbers: "Q = 2 的一轮要四次传输机会、14.9 ms 才清点完"
    const first = inv(recs()).filter((r) => r.session === 1)
    expect(first.length).toBe(4)
    expect(first.map((r) => r.slotsOffered)).toEqual([1, 1, 1, 1])
    expect(first.map((r) => r.complete)).toEqual([false, false, false, true])
    expect(first[3].t / MS).toBeCloseTo(14.93, 2)
    expect(DEFAULT_AMP_BS.q).toBe(2)
    expect(2 ** DEFAULT_AMP_BS.q).toBe(first.reduce((n, r) => n + r.slotsOffered, 0))
    // every TXOP is inside the 4 ms budget
    for (const r of inv(recs())) expect(r.txopNs).toBeLessThanOrEqual(DEFAULT_AMP_BS.txopMs * MS)
  })

  it('ten sessions a second, all of them finished, and 8.3 % of the air', () => {
    const rs = recs()
    // numbers: "一秒钟 77 帧命令占掉 82.8 ms，也就是 8.3 %"
    expect(ofType(rs, 'AMP_RFID').length).toBe(77)
    expect(rfidAirtimeNs(rs) / MS).toBeCloseTo(82.838, 3)
    expect(Math.round((rfidAirtimeNs(rs) / RUN_NS) * 1000) / 10).toBe(8.3)
    expect(new Set(inv(rs).map((r) => r.session)).size).toBe(10)
    expect(inv(rs).filter((r) => r.complete).length).toBe(10)
    // the four counters of the round: 23 read + 9 collided + 8 empty = the 40 slots offered
    expect(tally(rs)).toEqual({ off: 40, read: 23, col: 9, emp: 8 })
    expect(tally(rs).read + tally(rs).col + tally(rs).emp).toBe(tally(rs).off)
  })
})

describe('amp-backscatter · 「读不出」不等于「两张一起答」', () => {
  it('a 10.8 dB difference is read, and an equal pair is not', () => {
    const rs = recs()
    // numbers: "collisions 只有 9" against 50 answers and 23 readings — so most lost answers are
    // not collisions at all, they are the weaker tag of a pair the reader resolved.
    expect(tally(rs).col).toBe(9)
    expect(ofType(rs, 'RX_MISS').length).toBe(20)
    expect(ofType(rs, 'RX_MISS').every((r) => r.reason === 'preambleSinr')).toBe(true)
    // and no capture-effect RX_FAIL anywhere: the capture is a lock the reader never had to
    // abandon, because both reflections start in the same instant
    expect(ofType(rs, 'RX_FAIL')).toEqual([])
  })

  it('Q = 0 is the one run where every slot collides, and nothing is read', () => {
    // observe: "五张醒着的标签全部抽到 0 …… 一秒钟读到 0 张，十个槽十次读不出" /
    //          "这是全部五种跑法里唯一一个 collisions 等于开出槽数的"
    const rs = recs(2)
    expect(ofType(rs, 'AMP_BS_COUNTER').every((r) => r.counter === 0 && r.q === 0)).toBe(true)
    expect(tally(rs)).toEqual({ off: 10, read: 0, col: 10, emp: 0 })
    expect(replies(rs, 'rn16').length).toBe(50)
    expect(replies(rs, 'epc')).toEqual([])
    const runs = [undefined, 0, 1, 2, 3].map((v) => tally(recs(v)))
    expect(runs.filter((t) => t.col === t.off).length).toBe(1)
    expect(runs.map((t) => t.read)).toEqual([23, 22, 21, 0, 23])
  })
})

describe('amp-backscatter · turning the reader up, and speeding it up, both read less', () => {
  it('激励 20 dBm wakes the 40 cm tag, never hears it, and costs one reading', () => {
    // numbers: "40 cm 上那张标签醒了，一秒钟抽了 10 次计数、反射了 10 次 RN16" /
    //          "余量是 −0.47 dB，一次也没被解出" / "从 23 降到 22"
    const rs = recs(0)
    const far = ofType(rs, 'AMP_BS_BOOT').filter((r) => r.node === TAGS[5])
    // one boot per TXOP, because a tag unpowers between them — 25 TXOPs in this variant
    expect(far.length).toBe(25)
    expect(inv(rs).length).toBe(25)
    expect(far[0].incidentDbm).toBeCloseTo(-12.24, 2)
    expect(ofType(rs, 'AMP_BS_COUNTER').filter((r) => r.node === TAGS[5]).length).toBe(10)
    expect(replies(rs, 'rn16').filter((r) => r.node === TAGS[5]).length).toBe(10)
    expect(epcCount(rs, TAGS[5])).toBe(0)
    expect(ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === TAGS[5])!.snrDb).toBeCloseTo(-0.47, 2)
    expect(tally(rs).read).toBe(22)
    expect(tally(recs()).read).toBe(23)
    // the extra reading lost is a slot that became a collision
    expect(tally(rs).col).toBe(10)
  })

  it('回应 1 Mb/s loses the 28 cm tag outright and buys back 25.7 ms of air', () => {
    // tryThis: "28 cm 上那张标签彻底读不到了，次数降到 21" /
    //          "命令占掉的空口时间从 82.8 ms 降到 57.1 ms"
    const rs = recs(1)
    expect(replies(rs, 'rn16').filter((r) => r.node === TAGS[4]).length).toBe(10)
    expect(epcCount(rs, TAGS[4])).toBe(0)
    expect(tally(rs).read).toBe(21)
    expect(rfidAirtimeNs(rs) / MS).toBeCloseTo(57.105, 3)
    expect((rfidAirtimeNs(recs()) - rfidAirtimeNs(rs)) / MS).toBeCloseTo(25.733, 3)
    // and the 15 cm tags are untouched, because 16.57 dB clears the 9 dB the faster rate needs
    expect(TAGS.slice(0, 4).map((t) => epcCount(rs, t))).toEqual([4, 6, 5, 6])
    expect(AMP_BS_REQ_SNR_DB[1000]).toBeLessThan(16.57)
  })
})

/**
 * The inert-config ruling of this slice, per docs/inert-config-contract.md.
 *
 * Step one (is a lesson demonstrating it?) is answered by this very file: the variant 「打开
 * Write」 is a teaching device, and the sentence it teaches is that the flag changes nothing at
 * the default TXOP. Step two's first case therefore applies, so the outcome is **pin, not
 * refuse** — and step three agrees independently: `write` is not unreadable on this path, it is
 * a 3 ms command that does not fit a 4 ms budget, which is arithmetic about the scenario and
 * not a wiring fault. Step four's evidence is the second assertion below: the same flag at
 * `txopMs: 10` produces thirteen Writes, which is what makes the first assertion a measurement
 * of a configuration rather than of an impossibility.
 */
describe('amp-backscatter · `write: true` is inert at the default TXOP, and pinned so', () => {
  it('the whole record stream is identical to the base run, byte for byte', () => {
    // numbers: "这一秒的记录流和基础场景逐条相同——4 ms 的传输机会里，一个 Write 也排不进去"
    expect(JSON.stringify(recs(3))).toBe(JSON.stringify(recs()))
    expect(ofType(recs(3), 'AMP_RFID').filter((r) => r.cmd === 'write')).toEqual([])
    expect(ampBackscatter.variants![3].scenario().nodes[0].ampAp!.backscatter!.write).toBe(true)
    expect(DEFAULT_AMP_BS.write).toBe(false)
    expect(DEFAULT_AMP_BS.txopMs).toBe(4)
  })

  it('…and it is not inert at 10 ms, which is why this is a pin and not a refusal', () => {
    // tryThis: "把读写器的 TXOP 从 4 ms 改成 10 ms，再把 Write 打开 …… 一轮清点从四次传输机会缩到两次"
    const longer = run(ampBackscatterScenario({ write: true, txopMs: 10 }))
    expect(ofType(longer, 'AMP_RFID').filter((r) => r.cmd === 'write').length).toBe(13)
    expect(inv(longer).filter((r) => r.session === 1).length).toBe(2)
    // and the same 10 ms TXOP without the flag produces none, so the Writes are the flag's
    const longerNoWrite = run(ampBackscatterScenario({ txopMs: 10 }))
    expect(ofType(longerNoWrite, 'AMP_RFID').filter((r) => r.cmd === 'write')).toEqual([])
    expect(JSON.stringify(longer)).not.toBe(JSON.stringify(longerNoWrite))
  })
})

describe('amp-backscatter · the tags have no transmitter and no contention', () => {
  it('no tag ever draws a backoff, senses the channel or holds a NAV', () => {
    // picture: "标签没有载波侦听（carrier sense），也没有时钟"
    const rs = recs()
    for (const t of TAGS) {
      for (const type of ['BACKOFF_DRAW', 'CCA_BUSY', 'IFS_START', 'NAV_SET'] as const) {
        expect(rs.filter((r) => r.type === type && 'node' in r && r.node === t), `${t} / ${type}`)
          .toEqual([])
      }
    }
    // the reader does all of it, because its round competes like any other transmission
    expect(rs.filter((r) => r.type === 'BACKOFF_DRAW' && r.node === AP).length).toBeGreaterThan(0)
  })

  it('every uplink frame in the run is a reflection, and every downlink an RFID command', () => {
    const kinds = new Set(ofType(recs(), 'TX_START').map((r) => r.frame.kind))
    expect([...kinds].sort()).toEqual(['ampBsReply', 'ampRfid', 'cts'])
    // the reflections carry no power of their own: the tag's own txPowerDbm is 0 dBm and the
    // level the reader sees comes from the excitation, not from it
    expect(ampBackscatter.scenario().nodes[1].txPowerDbm).toBe(0)
  })
})

/**
 * **The lesson's own copies, read back out of the lesson.**
 *
 * Everything above is thorough about the ENGINE: every figure the lesson prints has an assertion,
 * and each one quotes the lesson's sentence in a comment next to the literal it checks. That is
 * the arrangement this repository keeps finding the hole in — it catches an engine change and
 * misses a prose change. The comment 「// table: "−13.72 dBm"」 is not a comparison with the table.
 *
 * `@amp-backscatter` carries 86 hand-typed figures in its graded prose with **none** interpolated,
 * second only to `@amp-coexist`, and it was on the list of lessons whose test never touched their
 * own prose (`tests/course/prose-readback.test.ts`). So this describe reads the table and the
 * figure-bearing sentences out of the lesson and compares them with the same quantities the
 * assertions above measure. Nothing here is a new measurement; it is the other half of each one.
 */
describe('amp-backscatter · the printed table and sentences are read back out of the lesson', () => {
  const rs = recs()
  const prose = (): string => JSON.stringify(ampBackscatter.numbers)
  const boot = (node: string) => ofType(rs, 'AMP_BS_BOOT').filter((r) => r.node === node)
  const reply = (node: string) => ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === node)
  /** 「−13.72 dBm」 → −13.72; 「16.57 dB」 → 16.57; 「15 cm」 → 15. Full-width minus included. */
  const val = (cell: string): number =>
    Number(cell.replace(/−/g, '-').replace(/[^\d.-]/g, ''))

  const sixTags = (): string[][] => {
    const b = ampBackscatter.numbers!.find((x) => x.kind === 'table'
      && (x.heading ?? '').includes('六张标签'))
    expect(b, 'the six-tag table is gone from `numbers`').toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }

  it('the six-tag table: distance, incident power, return, margin and the reads per second', () => {
    const rows = sixTags()
    expect(rows, 'the lesson prints three rows: the ring of four, the middle one, the dead one')
      .toHaveLength(3)
    // row 0 is the four tags at the same radius, row 1 is Tag 5, row 2 is Tag 6
    const representative = [TAGS[0], TAGS[4], TAGS[5]]
    for (const [i, row] of rows.entries()) {
      const node = representative[i]
      const cm = val(row[1])
      // the distance is the scene's, and it is what both reaches are compared against
      expect(cm, `row ${i}: the lesson prints a distance in centimetres`).toBeGreaterThan(0)
      const incident = DEFAULT_AMP_BS.chargeDbm
        - (freeSpacePl0Db(FREQ_24G_MHZ) + 20 * Math.log10(cm / 100))
      expect(val(row[2]), `row ${i}: the incident power at ${cm} cm, from the law`)
        .toBe(Number(incident.toFixed(2)))
      const b = boot(node)[0]
      if (b) {
        // and for a tag that actually woke, the same figure out of its own record
        expect(val(row[2]), `row ${i}: and from ${node}'s own AMP_BS_BOOT record`)
          .toBe(Number(b.incidentDbm.toFixed(2)))
      }
      const r = reply(node)
      if (row[3] === '（没醒过）') {
        expect(b, `row ${i} says the tag never woke, so it may leave no boot record`).toBeUndefined()
        expect(r, 'and no reply either').toBeUndefined()
        expect(row[4], 'so its margin cell is a dash, not a number').toBe('—')
        expect(incident, 'and the law agrees it is under the activation floor')
          .toBeLessThan(AMP_BS_ACTIVATION_DBM)
      } else {
        expect(val(row[3]), `row ${i}: what comes back at the reader`)
          .toBe(Number(r!.rxDbmAtAp.toFixed(2)))
        expect(val(row[4]), `row ${i}: and with how much margin`).toBe(Number(r!.snrDb.toFixed(2)))
      }
      // the reads-per-second cell: one count per tag the row covers
      const counts = row[5].replace(/\s*次$/, '').split('、').map(Number)
      const nodes = i === 0 ? TAGS.slice(0, 4) : [node]
      expect(counts, `row ${i}: one reading count per tag the row covers`).toHaveLength(nodes.length)
      expect(counts, `row ${i}: the readings each tag yielded in the second`)
        .toEqual(nodes.map((t) => epcCount(rs, t)))
    }
    // the three rows account for all six tags, which is what 「六张标签的下场」 claims
    const covered = sixTags().reduce((n, _row, i) => n + (i === 0 ? 4 : 1), 0)
    expect(covered, 'the table covers every tag in the scene').toBe(TAGS.length)
  })

  it('the 20 dBm variant: one reach moves, the other does not, and the total goes DOWN', () => {
    const m = /把激励抬了 (\d+) dB。上电那条线随之推到 ([\d.]+) m[^]*?抽了 (\d+) 次计数、反射了 (\d+) 次 RN16。读得到那条线一动不动，还是 ([\d.]+) m[^]*?余量是 [−-]([\d.]+) dB[^]*?从 (\d+) 降到 (\d+)/
      .exec(prose())
    expect(m, 'the 20 dBm paragraph is gone, or its shape changed').not.toBeNull()
    const lift = Number(m![1])
    const base = DEFAULT_AMP_BS.chargeDbm
    const strong = base + lift
    expect(Number(m![2]), 'the activation reach at the raised excitation')
      .toBe(Number(activationReachM(strong).toFixed(3)))
    expect(Number(m![5]), 'and the decode reach, which does not move')
      .toBe(Number(monoReachM(base, 250).toFixed(3)))
    // **「一动不动」 is a claim about the physics, so it is asserted as one.** `monoReachM` returns
    // the same reach at EVERY excitation — the reader's own leakage sets its noise floor, so the
    // budget cancels. That makes its first argument provably inert in the output, which is the
    // shape `docs/inert-config-contract.md` says to refuse or pin; here it is neither a bug nor a
    // dead parameter but the lesson's whole sentence, so it is pinned over a wide band. (The
    // assertion above this describe passes `bsDbm` = 0 where the scene excites at 10 and still
    // gets 0.328 — true, and only because of this.)
    for (const dbm of [-20, 0, base, strong, 100]) {
      expect(Number(monoReachM(dbm, 250).toFixed(3)), `the decode reach at ${dbm} dBm excitation`)
        .toBe(Number(m![5]))
    }
    expect(activationReachM(strong), 'while the activation reach really does grow')
      .toBeGreaterThan(activationReachM(base))
    // the far tag wakes and answers, and still is never decoded
    const loud = recs(0)
    const far = ofType(loud, 'AMP_BS_REPLY').filter((r) => r.node === TAGS[5])
    expect(far.length, 'RN16 reflections from the 40 cm tag once it wakes').toBe(Number(m![4]))
    expect(ofType(loud, 'AMP_BS_COUNTER').filter((r) => r.node === TAGS[5]).length,
      'and the counts it drew').toBe(Number(m![3]))
    expect(-Number(m![6]), 'its margin at the reader, which is negative')
      .toBe(Number(far[0].snrDb.toFixed(2)))
    expect(epcCount(loud, TAGS[5]), 'so it is never once decoded').toBe(0)
    // 「反而少读到一次」: the whole point of the paragraph
    expect(Number(m![7]), 'readings in the second at the normal excitation').toBe(tally(rs).read)
    expect(Number(m![8]), 'and at the raised one').toBe(tally(loud).read)
    expect(Number(m![8]), 'which is fewer, not more').toBeLessThan(Number(m![7]))
  })

  it('the slot formula adds up, and each term is one PPDU of the slot', () => {
    const f = ampBackscatter.numbers!.find((x) => x.kind === 'formula') as
      { text: string; note?: string } | undefined
    expect(f, 'the slot formula is gone from `numbers`').toBeDefined()
    const m = /Query (\d+) \+ (\d+) \+ ACK (\d+) \+ (\d+) \+ Read (\d+) \+ (\d+) = (\d+) µs/.exec(f!.text)
    expect(m, 'the formula no longer states its six terms and the total').not.toBeNull()
    const n = m!.slice(1).map(Number)
    expect(n[0] + n[1] + n[2] + n[3] + n[4] + n[5], 'the lesson’s own arithmetic').toBe(n[6])
    // the three gaps the lesson writes as 16 are the engine's T2, not a typed constant
    expect([n[1], n[3], n[5]], 'the three inter-frame gaps').toEqual([
      AMP_BS_T2_NS / 1_000, AMP_BS_T2_NS / 1_000, AMP_BS_T2_NS / 1_000,
    ])
    // and the reserve the note names, which is why a second slot does not fit
    const note = /为可能到来的 RN16 预留 (\d+) \+ (\d+) µs/.exec(f!.note ?? '')
    expect(note, 'the note no longer states the reserve').not.toBeNull()
    expect(Number(note![1]), 'the gap before the reserved reply').toBe(AMP_BS_T2_NS / 1_000)
    expect(Number(note![2]), 'and the reply itself, the same length as the ACK above').toBe(n[2])
  })

  it('the airtime sentence: the command count, the milliseconds and the share', () => {
    const m = /一秒钟 (\d+) 帧命令占掉 ([\d.]+) ms，也就是 ([\d.]+) %/.exec(prose())
    expect(m, 'the airtime sentence is gone, or its shape changed').not.toBeNull()
    expect(Number(m![1]), 'command PPDUs in the second').toBe(ofType(rs, 'AMP_RFID').length)
    expect(Number(m![2]), 'the milliseconds they occupy')
      .toBe(Number((rfidAirtimeNs(rs) / MS).toFixed(1)))
    expect(Number(m![3]), 'and their share of the second')
      .toBe(Number(((100 * rfidAirtimeNs(rs)) / RUN_NS).toFixed(1)))
  })

  it('the collisions sentence: fifty answers, twenty-three readings, nine collisions', () => {
    const m = /一秒钟 (\d+) 次 RN16 只换来 (\d+) 次读到，而 collisions 只有 (\d+)/.exec(prose())
    expect(m, 'the collisions sentence is gone, or its shape changed').not.toBeNull()
    const t = tally(rs)
    expect(Number(m![1]), 'RN16 reflections in the second').toBe(replies(rs, 'rn16').length)
    expect(Number(m![2]), 'readings').toBe(t.read)
    expect(Number(m![3]), 'collided slots').toBe(t.col)
    // the sentence's argument: the collisions are far fewer than the lost answers, because the
    // reader resolved most pairs by capture rather than losing both
    expect(Number(m![3]), 'collisions are the minority of the lost answers')
      .toBeLessThan(Number(m![1]) - Number(m![2]))
    const gap = /近的那张高出 ([\d.]+) dB/.exec(prose())
    expect(gap, 'the capture-margin sentence is gone').not.toBeNull()
    const near = reply(TAGS[0])!
    const far = reply(TAGS[4])!
    expect(Number(gap![1]), 'the margin between the near pair and the far one')
      .toBe(Number((near.snrDb - far.snrDb).toFixed(1)))
  })

  it('the Read and Write airtimes the last paragraph prints', () => {
    const m = /Read 的回应是 (\d+) 个字节的存储内容，(\d+) µs[^]*?标签要 (\d+) ms 才答得出来[^]*?长 (\d+) µs/
      .exec(prose())
    expect(m, 'the Read/Write paragraph is gone, or its shape changed').not.toBeNull()
    expect(Number(m![2]), 'the Read reply airtime').toBe(bsReplyNs('read', 250) / 1_000)
    expect(Number(m![3]) * MS, 'the Write turnaround the tag needs').toBe(AMP_BS_WRITE_T3_NS)
    // The scene is 2.4 GHz, so the signal extension comes from `ERP_2G` rather than being typed —
    // the assertions above this describe write `const sigExt = 6_000` by hand.
    const sigExt = ERP_2G.signalExtNs
    expect(sigExt, 'the 2.4 GHz signal extension, from the timing table').toBe(6_000)
    expect(Number(m![4]), 'and the downlink PPDU a Write therefore becomes')
      .toBe(Math.round(ampBsDlPpduNs('write', 0, bstNs('write', 250, AMP_BS_WRITE_T3_NS), sigExt) / 1_000))
  })
})

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **`numbers` is read back out of the lesson above; the rest of its prose is not.** The sweep of
 * 2026-10-13 plants one edit per printed figure and runs this file: of the 170 figures this
 * lesson prints, PLACEHOLDER could be edited with the suite green. `picture`, `terms`, the steps,
 * `limits`, `sources`, `observe`, `tryThis` and the quiz were the whole of the remainder.
 *
 * Nothing new is measured here: every assertion calls the same `recs`, `inv`, `replies`,
 * `activationReachM`, `monoReachM`, `bsReplyNs` the tests above call, and the figure comes out of
 * the prose instead of out of this file. Where one figure is printed in five places — the 6 dB of
 * reflection loss is in `picture`, in the formula, in `limits`, in `sources` and in a quiz
 * explanation — every occurrence is read.
 */
describe('amp-backscatter · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(ampBackscatter).map((t) => t.text).join('\n')
  const num = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(num)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  const blockText = (b: unknown): string => {
    const o = b as { heading?: string; text?: string; items?: string[]; note?: string; caption?: string }
    return [o.heading ?? '', o.text ?? '', (o.items ?? []).join('\n'), o.note ?? '', o.caption ?? '']
      .join('\n')
  }
  const pic = (ampBackscatter.picture ?? []).map(blockText).join('\n')
  const terms = (ampBackscatter.terms ?? []).map((t) => `${t.term}：${t.plain}`).join('\n')
  const limitsText = (ampBackscatter.limits ?? []).map((l) => l.text).join('\n')
  const srcText = (ampBackscatter.sources ?? []).join('\n')
  const obs = ampBackscatter.observe.join('\n')
  const trys = ampBackscatter.tryThis.join('\n')
  const quizText = ampBackscatter.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')

  const CFG = DEFAULT_AMP_BS
  const SCENE = ampBackscatterScenario()
  const READER = SCENE.nodes.find((n) => n.kind === 'ap')!
  /** Each tag's distance from the reader, in centimetres, as the scene places it. */
  const CM = SCENE.nodes.filter((n) => n.kind !== 'ap').map((n) => Math.round(
    Math.hypot(n.pos.x - READER.pos.x, n.pos.y - READER.pos.y, (n.pos.z ?? 0) - (READER.pos.z ?? 0)) * 100,
  ))

  it('`picture`: the three radii, the one height, and the loss a reflection takes', () => {
    // 「四张在 15 cm 上，一张在 28 cm，一张在 40 cm」
    const [near, mid, far] = figs(pic, /四张在 (\d+) cm 上，一张在 (\d+) cm，一张在 (\d+) cm/,
      '`picture` on where the six tags are')
    const got = [...CM].sort((a, b) => a - b)
    expect(got.filter((c) => c === near).length, 'four tags at the first radius').toBe(4)
    expect([near, mid, far], 'the three radii this scene really has')
      .toEqual([...new Set(got)])
    // 「读写器和标签同在 1 m 高度上」 — and the claim that follows it: the link is shorter than
    // the way to the ceiling, which is what makes 「差一米就什么也不剩了」 a statement about this room
    const [h] = figs(pic, /同在 (\d+) m 高度上/, '`picture` on the height they share')
    expect(READER.pos.z, 'the reader’s own height').toBe(h)
    for (const n of SCENE.nodes) expect(n.pos.z, `${n.id} is at that height too`).toBe(h)
    expect(Math.max(...CM) / 100, 'and the longest link is shorter than a metre').toBeLessThan(1)
    // 「反射本身比入射低 6 dB」 — `picture`, the formula, `limits`, `sources`, the quiz
    for (const v of everyFig(/低 (\d+) dB|路损 − (\d+)\b|(\d+) dB 的反射损耗|(\d+) dB 取自/g,
      'the reflection loss', 3)) {
      expect(num(v), 'the loss `ampBs.ts` charges a reflection').toBe(AMP_BS_LOSS_DB)
    }
  })

  it('the margin identity, in the formula and in the quiz that restates it', () => {
    const lifted = ampBackscatter.variants!
      .map((v) => v.scenario().nodes[0]!.ampAp!.backscatter!.chargeDbm!)
    const f = ampBackscatter.picture!.find(
      (b): b is Extract<typeof b, { kind: 'formula' }> => b.kind === 'formula')!
    // 「回到读写器 = 激励 − 2 × 路损 − 6」 and 「读写器的本机干扰 = 激励 − 20（天线隔离）−50（接收动态范围）」
    const [twice, loss, iso, dr] = figs(f.text,
      /回到读写器 = 激励 − (\d) × 路损 − (\d+)\s*\n读写器的本机干扰 = 激励 − (\d+)（天线隔离）−(\d+)（接收动态范围）/,
      'the formula block’s two lines')
    expect(loss, 'the reflection loss').toBe(AMP_BS_LOSS_DB)
    expect(iso, 'the antenna isolation').toBe(AMP_BS_ISOLATION_DB)
    expect(dr, 'the receiver’s dynamic range').toBe(AMP_BS_READER_DR_DB)
    // the two lines, as the engine computes them, at one of the scene's own distances
    const d = CM[0]! / 100
    const pl = freeSpacePl0Db(FREQ_24G_MHZ) + 20 * Math.log10(d)
    expect(CFG.chargeDbm - twice! * pl - loss!, 'the return the formula’s first line gives')
      .toBeCloseTo(bsReplyDbm(CFG.chargeDbm, pl), 9)
    expect(CFG.chargeDbm - iso! - dr!, 'and the floor its second line gives')
      .toBeCloseTo(readerFloorDbm(monoLeakDbm(CFG.chargeDbm)), 9)
    // 「余量恒等于 20 + 50 − 6 − 2 × 路损 = 64 − 2 × 路损」 — the note's own subtraction
    const [a, b, c, twice2, sum, twice3] = figs(f.note!,
      /余量恒等于 (\d+) \+ (\d+) − (\d+) − (\d) × 路损 = (\d+) − (\d) × 路损/,
      'the note’s identity')
    expect([a, b, c], 'the three constants it adds up').toEqual([iso, dr, loss])
    expect(a! + b! - c!, 'and their sum is the constant it prints').toBe(sum)
    expect([twice2, twice3], 'both sides carry the same multiple of the path loss')
      .toEqual([twice, twice])
    // and the identity really is independent of the excitation, which is the whole sentence
    for (const excite of [CFG.chargeDbm, CFG.chargeDbm + 10, CFG.chargeDbm - 7]) {
      const margin = bsReplyDbm(excite, pl) - readerFloorDbm(monoLeakDbm(excite))
      expect(margin, `at ${excite} dBm the margin is the lesson’s own identity`)
        .toBeCloseTo(sum! - twice! * pl, 9)
    }
    /*
     * 「把激励抬高 10 dB，它要在上面分辨回应的那个底也抬高 10 dB」, which the quiz says twice more
     * (once in a distractor: 「反射损耗也跟着涨了 10 dB」).
     *
     * **The first version of this read asserted an identity in the figure itself** — that the
     * floor rises by exactly the lift — which is true of EVERY lift, so planting 10 → 11 stayed
     * green. What makes 10 the figure is the variant: it is the lift that variant really applies.
     */
    const lift = Math.max(...lifted) - CFG.chargeDbm
    for (const v of everyFig(
      /抬高 (\d+) dB|抬了 (\d+) dB|跟着激励一起抬了 (\d+) dB|跟着涨了 (\d+) dB/g,
      'the lift the sentence and the quiz talk about', 4)) {
      expect(num(v), 'the lift the 「激励 20 dBm」 variant really applies').toBe(lift)
    }
    // and the two things that do and do not move with it, which is what the quiz asks
    expect(readerFloorDbm(monoLeakDbm(CFG.chargeDbm + lift))
      - readerFloorDbm(monoLeakDbm(CFG.chargeDbm)),
    'the floor rises with the excitation').toBeCloseTo(lift, 9)
    expect(AMP_BS_LOSS_DB, 'while the reflection loss is a constant, as the distractor is not')
      .toBe(AMP_BS_LOSS_DB)
    // the quiz restates the identity verbatim
    const [qSum, qTwice] = figs(quizText, /余量恒等于 (\d+) − (\d) × 路损/,
      'the quiz on the same identity')
    expect([qSum, qTwice], 'the same two numbers the note prints').toEqual([sum, twice])
  })

  it('the steps of a slot: the draw, the random number, the bytes and the gap', () => {
    const steps = (ampBackscatter.picture ?? []).flatMap(
      (b) => ('items' in b ? b.items : []),
    ).join('\n')
    // 「每张醒着的标签在 0 到 2^Q − 1 之间抽一个计数」 and 「抽到 0 的那些立刻……」
    const [lo, base, off] = figs(steps, /在 (\d) 到 (\d)\^Q − (\d) 之间抽一个计数/,
      'the steps on the range a tag draws from')
    const counters = ofType(recs(), 'AMP_BS_COUNTER')
    expect(counters.length, 'the run really draws counters').toBeGreaterThan(0)
    expect(Math.min(...counters.map((r) => r.counter)), 'the smallest counter drawn').toBe(lo)
    // an EQUALITY, not a bound: a round over a second draws the top of the range too, so
    // 「0 到 2^Q − 1」 is checkable as the largest counter and not merely as a ceiling
    expect(Math.max(...counters.map((r) => r.counter)),
      `the largest counter drawn is ${base}^Q − ${off}`).toBe(base! ** CFG.q - off!)
    expect([...new Set(counters.map((r) => r.counter))].sort((a, b) => a - b),
      'and every value in between is drawn').toEqual(
      Array.from({ length: base! ** CFG.q }, (_x, i) => lo! + i))
    const [fires] = figs(steps, /抽到 (\d) 的那些立刻/, 'the steps on which draw answers at once')
    expect(fires, 'the counter that answers in this very frame').toBe(lo)
    // 「反射一个 16 位随机数 RN16」 — and the engine's own RN16 is that wide
    const [rnBits] = figs(steps, /反射一个 (\d+) 位随机数 RN\d+/, 'the steps on the random number')
    const rnName = raw(steps, /随机数 (RN\d+)/, 'the name the steps give it')[0]!
    expect(rnName, 'the name carries its own width').toBe(`RN${rnBits}`)
    expect(rnBits! / 8, 'and that many octets is what a bare RN16 reply is')
      .toBe(GEN2_REPLY_BYTES.rn16)
    expect(replies(recs(), 'rn16').length, 'and the run reflects them').toBeGreaterThan(0)
    // 「标签把 9 个字节的存储内容反射回来」 — against the reply the run really makes
    const [readBytes] = figs(steps, /把 (\d+) 个字节的存储内容反射回来/,
      'the steps on what a Read brings back')
    expect(replies(recs(), 'read').length, 'the scene really reads').toBeGreaterThan(0)
    // the data is what the reply carries beside its header, its RN16 and its CRC — the five
    // octets `GEN2_REPLY_BYTES`' own comment accounts for
    expect(readBytes! + 1 + 2 + 2, 'the whole Read reply those bytes sit in')
      .toBe(GEN2_REPLY_BYTES.read)
    // 「每两帧命令之间只隔 16 µs，而标签能在这 16 µs 里活下来」 — twice in one sentence
    const gaps = figs(steps, /只隔 (\d+) µs，而标签能在这 (\d+) µs 里活下来/,
      'the steps on the gap between two commands')
    expect(gaps[0], 'the gap `ampBs.ts` leaves').toBe(AMP_BS_T1_NS / 1000)
    expect(gaps[1], 'and the same gap, restated in the same sentence').toBe(gaps[0])
  })

  it('`terms`: the EPC’s own width and the slots a Q announces', () => {
    // 「标签身上那 96 位的货品编号」
    const [epcBits] = figs(terms, /那 (\d+) 位的货品编号/, '`terms` on the EPC’s width')
    expect(replies(recs(), 'epc').length, 'the run really reads an EPC').toBeGreaterThan(0)
    // the EPC reply is the code plus PC 2 and CRC-16 2, which is what its width is made of
    expect(epcBits! / 8 + 2 + 2, 'the whole EPC reply that code sits in')
      .toBe(GEN2_REPLY_BYTES.epc)
    // 「本轮一共开出 2^Q 个槽」 — and the run offers exactly that many
    const [slotBase] = figs(terms, /本轮一共开出 (\d)\^Q 个槽/, '`terms` on how many slots a round has')
    const rounds = inv(recs())
    expect(rounds.length, 'the run really runs inventory rounds').toBeGreaterThan(0)
    // one AMP_INVENTORY per transmit opportunity, and a 4 ms one holds a single slot — so the
    // round's own slot count is the sum over the opportunities of one session
    const bySession = new Map<number, number>()
    for (const r of rounds) bySession.set(r.session, (bySession.get(r.session) ?? 0) + r.slotsOffered)
    const complete = rounds.filter((r) => r.complete).map((r) => r.session)
    expect(complete.length, 'the second holds sessions that finished').toBeGreaterThan(0)
    for (const session of complete) {
      expect(bySession.get(session), `a Q = ${CFG.q} session offers that many slots in all`)
        .toBe(slotBase! ** CFG.q)
    }
    // 「一次传输机会的头一帧前面那段载波」 and 「命令发完之后读写器继续点着的那段载波」 — no
    // figures of their own, but the WUP's minimum is printed in `numbers` and in `sources`
    for (const v of everyFig(/(\d) ms 的 WUP-Excitation|(\d) ms 的 WUP 最短长度/g,
      'the WUP length', 2)) {
      expect(num(v) * MS, 'the minimum `ampBs.ts` holds a WUP to').toBe(AMP_BS_WUP_MIN_NS)
    }
  })

  it('the two reaches and the activation floor, at every place the lesson prints them', () => {
    // 「入射功率不到 −20 dBm，它醒不过来；按 10 dBm 的激励算，这条线落在 0.309 m」
    for (const v of everyFig(/−(\d+) dBm[，。]|到 −(\d+) dBm 标签就工作|−(\d+) dBm 的上电门限/g,
      'the activation floor', 3)) {
      expect(-num(v), 'the floor `ampBs.ts` wakes a tag at').toBe(AMP_BS_ACTIVATION_DBM)
    }
    for (const v of everyFig(/按 (\d+) dBm 的激励算|(\d+) dBm 的充电激励/g, 'the charge excitation', 2)) {
      expect(num(v), 'the excitation this scene charges with').toBe(CFG.chargeDbm)
    }
    // the two reaches, wherever they appear: the activation one and the decode one
    for (const v of everyFig(/这条线落在 ([\d.]+) m|推到 ([\d.]+) m/g, 'the activation reach', 2)) {
      const m = num(v)
      const lifted = [CFG.chargeDbm, CFG.chargeDbm + 10]
        .map((e) => Number(activationReachM(e).toFixed(3)))
      expect(lifted, `${m} m is the activation reach at one of the two excitations`).toContain(m)
    }
    for (const v of everyFig(/对应 ([\d.]+) m|还是 ([\d.]+) m|跟着它们变|收到 ([\d.]+) m/g,
      'the decode reach', 2)) {
      if (!/[\d.]/.test(v)) continue
      const m = num(v)
      const both = [250, 1000].map((k) => Number(monoReachM(CFG.chargeDbm, k as 250 | 1000).toFixed(3)))
      expect(both, `${m} m is the decode reach at one of the two uplink rates`).toContain(m)
    }
    // 「250 kb/s 的回应要 3 dB 信噪比」 — and the other rate's requirement, in `tryThis`
    const [kbps, snr] = figs(EVERYWHERE, /(\d+) kb\/s 的回应要 (\d) dB 信噪比/,
      'the SNR the slower uplink needs')
    expect(kbps, 'the uplink rate this scene answers at').toBe(CFG.ulKbps)
    expect(snr, 'and the SNR `ampBs.ts` asks of it').toBe(AMP_BS_REQ_SNR_DB[CFG.ulKbps])
    // 「差 0.1 dB 就一条记录也不留」 — `limits` on how hard the threshold is
    const [eps] = figs(limitsText, /差 ([\d.]+) dB 就一条记录也不留/,
      '`limits` on how sharp the activation floor is')
    const dead = CM[CM.length - 1]! / 100
    const incident = CFG.chargeDbm - (freeSpacePl0Db(FREQ_24G_MHZ) + 20 * Math.log10(dead))
    expect(incident, 'and the tag past it really is under the floor')
      .toBeLessThan(AMP_BS_ACTIVATION_DBM)
    expect(eps, 'an epsilon, so what is checked is that the floor is a hard line')
      .toBeGreaterThan(0)
  })

  it('`sources` and `limits`: every model value they own, against the export each names', () => {
    // 「T1 = 16 µs 与响应窗口的 ±20 % 余量」, 「1 ms 的 WUP 最短长度」, 「[S, S, S] 共 24 个码片」
    const [t1] = figs(srcText, /T1 = (\d+) µs/, '`sources` on T1')
    expect(t1! * 1000, 'the immediate-response time').toBe(AMP_BS_T1_NS)
    const [chips] = figs(srcText, /共 (\d+) 个码片的上行同步/, '`sources` on the uplink sync')
    expect(chips, 'the chips an uplink sync spends').toBe(AMP_BS_UL_SYNC_CHIPS)
    const [slow, fast] = figs(srcText, /(\d+) kb\/s 与 (\d+) Mb\/s 两档上行速率/,
      '`sources` on the two uplink rates')
    expect([slow, fast! * 1000], 'the two rates `ampBs.ts` has a chip time for')
      .toEqual(Object.keys(AMP_BS_REQ_SNR_DB).map(Number))
    // 「10 dBm 的充电激励与 0 dBm 的回应激励」
    const [charge, reply] = figs(srcText, /(\d+) dBm 的充电激励与 (\d+) dBm 的回应激励/,
      '`sources` on the two excitations')
    expect([charge, reply], 'the two the scene ships').toEqual([CFG.chargeDbm, CFG.bsDbm])
    // 「T2 = 16 µs 与 Write 的 T3 = 2 ms」
    const [t2, t3] = figs(srcText, /T2 = (\d+) µs 与 Write 的 T3 = (\d) ms/,
      '`sources` on the two turnarounds')
    expect(t2! * 1000, 'the AP turnaround').toBe(AMP_BS_T2_NS)
    expect(t3! * MS, 'and what a Write waits').toBe(AMP_BS_WRITE_T3_NS)
    // 「2.4 GHz 自由空间第一米的 40.2 dB 用的是 Friis 公式」
    const [pl0] = figs(srcText, /第一米的 ([\d.]+) dB/, '`sources` on the first metre')
    same(String(pl0), freeSpacePl0Db(FREQ_24G_MHZ), 'the free-space loss of the first metre')
    // 「4 ms 的传输机会预算」 — `numbers`, `limits` and `sources`, and 「改到 10 ms」
    for (const v of everyFig(/(\d) ms 的传输机会|是 (\d) ms。一个槽|从 (\d) ms 改成/g,
      'the TXOP budget', 2)) {
      expect(num(v), 'the budget this scene gives a round').toBe(CFG.txopMs)
    }
    // 「6 dB 的反射损耗、20 dB 的天线隔离、50 dB 的接收动态范围这三个数，决定了……那个 64」
    const [l, i, d, sum] = figs(limitsText,
      /(\d+) dB 的反射损耗、(\d+) dB 的天线隔离、(\d+) dB 的接收动态范围这三个数，决定了[^]*?那个 (\d+)/,
      '`limits` on the three constants and the one they decide')
    expect([l, i, d], 'the three `ampBs.ts` exports').toEqual([
      AMP_BS_LOSS_DB, AMP_BS_ISOLATION_DB, AMP_BS_READER_DR_DB,
    ])
    expect(i! + d! - l!, 'and the constant they add up to').toBe(sum)
    // 「0.328 m 这个距离跟着它们变」 — the decode reach, and it really moves with them
    const [reach] = figs(limitsText, /([\d.]+) m 这个距离跟着它们变/,
      '`limits` on which distance those three decide')
    same(String(reach), monoReachM(CFG.chargeDbm, CFG.ulKbps), 'the decode reach')
    // 「标签那 96 位的编号」 and 「把它改到 10 ms，一轮清点就从四次传输机会缩到两次」
    const [bits] = figs(limitsText, /标签那 (\d+) 位的编号/, '`limits` on the EPC width')
    expect(bits! / 8 + 2 + 2, 'the same width `terms` gives, in the same reply')
      .toBe(GEN2_REPLY_BYTES.epc)
  })

  it('`observe`: the two incident levels, Tag 5’s own second, and the Q = 0 run', () => {
    const rs = recs()
    // 「15 cm 是 −13.72 dBm，28 cm 是 −19.14 dBm」
    const [cm1, p1, cm2, p2] = raw(obs,
      /(\d+) cm 是 (−[\d.]+) dBm，(\d+) cm 是 (−[\d.]+) dBm/,
      '`observe` on the two incident powers')
    const bootAt = (cm: number): number => {
      const i = CM.findIndex((c) => c === cm)
      expect(i, `a tag at ${cm} cm`).toBeGreaterThanOrEqual(0)
      const node = SCENE.nodes.filter((n) => n.kind !== 'ap')[i]!.id
      const b = ofType(rs, 'AMP_BS_BOOT').find((r) => r.node.startsWith(node))
      expect(b, `${node} woke up`).toBeDefined()
      return b!.incidentDbm
    }
    same(p1!, bootAt(num(cm1!)), `the incident power at ${cm1} cm`)
    same(p2!, bootAt(num(cm2!)), `and at ${cm2} cm`)
    // 「再去看 40 cm 上那一张，整整一秒钟它一条记录也没有」
    const [deadCm] = figs(obs, /再去看 (\d+) cm 上那一张/, '`observe` on the tag that never woke')
    expect(Math.max(...CM), 'which is the furthest tag of the scene').toBe(deadCm)
    const deadIdx = CM.findIndex((c) => c === deadCm)
    const deadNode = SCENE.nodes.filter((n) => n.kind !== 'ap')[deadIdx]!.id
    expect(rs.filter((r) => 'node' in r && r.node.startsWith(deadNode)),
      'and it leaves no record at all').toHaveLength(0)
    // 「选中 Tag 5（28 cm）……只剩 5.72 dB 余量……一秒钟它只被读到 2 次」
    const [tagNo, tagCm, margin, reads] = raw(obs,
      /选中 Tag (\d)（(\d+) cm）[^]*?只剩 ([\d.]+) dB 余量[^]*?一秒钟它只被读到 (\d) 次/,
      '`observe` on the middle tag’s second')
    const node = `tag-${tagNo}#2g`
    expect(TAGS, `Tag ${tagNo} is a tag of this scene`).toContain(node)
    const idx = SCENE.nodes.filter((n) => n.kind !== 'ap').findIndex((n) => node.startsWith(n.id))
    expect(CM[idx], 'and it is the one at that distance').toBe(num(tagCm!))
    const r5 = ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === node)!
    same(margin!, r5.snrDb, 'the margin its reflection comes back with')
    expect(num(reads!), 'and the readings it yielded in the second').toBe(epcCount(rs, node))
    // 「载入「Q = 0：只开一个槽」变体：五张醒着的标签全部抽到 0……一秒钟读到 0 张，十个槽十次读不出」
    const [q, drew, read, slots, cols] = figs(obs,
      /「Q = (\d)：只开一个槽」变体：五张醒着的标签全部抽到 (\d)[^]*?一秒钟读到 (\d) 张，(十)?个槽(十)?次读不出/,
      '`observe` on the Q = 0 variant') as (number | undefined)[]
    const qZero = ampBackscatter.variants!.findIndex((v) => v.label.includes(`Q = ${q}`))
    expect(qZero, 'the variant that label names').toBeGreaterThanOrEqual(0)
    const zr = recs(qZero)
    expect(ampBackscatter.variants![qZero]!.scenario().nodes[0]!.ampAp!.backscatter!.q,
      'and that variant really ships that Q').toBe(q)
    expect([...new Set(ofType(zr, 'AMP_BS_COUNTER').map((r) => r.counter))],
      'every tag draws the same counter when there is one slot').toEqual([drew])
    const t = tally(zr)
    expect(t.read, 'nothing is read in that run').toBe(read)
    expect(t.col, 'and every slot it offered collided').toBe(t.off)
    expect(slots ?? cols, 'the slot count is written in Chinese, so it is not a figure here')
      .toBeNaN()
  })

  it('`tryThis`: the two knobs, both turned the better way, both reading less', () => {
    // 「前者把上电距离从 0.309 m 推到 0.978 m，读到的次数从 23 降到 22」
    const [was, now, from, to] = raw(trys,
      /把上电距离从 ([\d.]+) m 推到 ([\d.]+) m，读到的次数从 (\d+) 降到 (\d+)/,
      '`tryThis` on the 20 dBm variant')
    const strong = ampBackscatter.variants!.findIndex((v) => v.label.includes('20 dBm'))
    expect(strong, 'the variant it names').toBeGreaterThanOrEqual(0)
    const lifted = ampBackscatter.variants![strong]!.scenario()
      .nodes[0]!.ampAp!.backscatter!.chargeDbm!
    same(was!, activationReachM(CFG.chargeDbm), 'the activation reach the scene ships')
    same(now!, activationReachM(lifted), 'and the one the variant lifts it to')
    expect(num(from!), 'the readings the shipped scene yields').toBe(tally(recs()).read)
    expect(num(to!), 'and the readings the stronger one yields').toBe(tally(recs(strong)).read)
    expect(num(to!), 'which is fewer, and that is the point').toBeLessThan(num(from!))
    // 「后者把读得到的距离从 0.328 m 收到 0.232 m……次数降到 21，而命令占掉的空口时间从 82.8 ms 降到 57.1 ms」
    const [dWas, dNow, dReads, aWas, aNow] = raw(trys,
      /把读得到的距离从 ([\d.]+) m 收到 ([\d.]+) m[^]*?次数降到 (\d+)，而命令占掉的空口时间从 ([\d.]+) ms 降到 ([\d.]+) ms/,
      '`tryThis` on the 1 Mb/s variant')
    const fast = ampBackscatter.variants!.findIndex((v) => v.label.includes('1 Mb/s'))
    expect(fast, 'the variant it names').toBeGreaterThanOrEqual(0)
    const fastKbps = ampBackscatter.variants![fast]!.scenario()
      .nodes[0]!.ampAp!.backscatter!.ulKbps!
    same(dWas!, monoReachM(CFG.chargeDbm, CFG.ulKbps), 'the decode reach at the slower rate')
    same(dNow!, monoReachM(CFG.chargeDbm, fastKbps), 'and at the faster one')
    expect(num(dReads!), 'the readings the faster rate yields').toBe(tally(recs(fast)).read)
    same(aWas!, rfidAirtimeNs(recs()) / MS, 'the air the commands of the shipped scene take')
    same(aNow!, rfidAirtimeNs(recs(fast)) / MS, 'and the air the faster rate takes')
    // 「一轮清点从四次传输机会缩到两次」 — Chinese numerals, read with the course's own reader
    const [four, two] = raw(trys, /一轮清点从(.)次传输机会缩到(.)次/,
      '`tryThis` on what a 10 ms TXOP buys')
    const txops = (ms: number): number => {
      const s = ampBackscatterScenario()
      const cfg = s.nodes[0]!.ampAp!.backscatter!
      const scene: Scenario = {
        ...s,
        nodes: s.nodes.map((n, i) => (i === 0
          ? { ...n, ampAp: { ...n.ampAp!, backscatter: { ...cfg, txopMs: ms, write: true } } }
          : n)),
      }
      const rounds = ofType(run(scene), 'AMP_INVENTORY')
      return rounds.filter((r) => r.session === rounds[0]!.session).length
    }
    expect(zhNumeral(four!.replace(/两/g, '二')), 'the TXOPs a round takes at the shipped budget')
      .toBe(txops(CFG.txopMs))
    expect(zhNumeral(two!.replace(/两/g, '二')), 'and at the budget this experiment sets')
      .toBe(txops(10))
  })

  /*
   * **Every one of these figures is printed a SECOND time**, and a second printing is its own
   * site: the three radii come back in `numbers`, `limits`, `observe`, `tryThis` and the quiz;
   * the two excitations and the two TXOP budgets come back in all five; and the quiz restates
   * both the margin identity and the whole slot budget. 「It is read somewhere else」 is not read.
   */
  it('every distance, every excitation and every budget, at every place the lesson prints one', () => {
    const radii = [...new Set(CM)].sort((a, b) => a - b)
    // 「两条距离，差不到 2 cm」 — the heading's own claim about the two reaches
    const [gapCm] = figs(EVERYWHERE, /两条距离，差不到 (\d+) cm/, 'the heading on the two reaches')
    const gap = (monoReachM(CFG.chargeDbm, CFG.ulKbps) - activationReachM(CFG.chargeDbm)) * 100
    expect(Math.ceil(gap), 'the gap between them, to the centimetre the heading rounds to')
      .toBe(gapCm)
    /*
     * 「5 cm 处的下限是模型取值」 — measured rather than read off a constant, because the clamp is
     * a literal inside `bsPathLossDb`: under it the loss stops falling, over it it still does.
     */
    const [clampCm] = figs(EVERYWHERE, /(\d+) cm 处的下限是模型取值/, '`sources` on the near clamp')
    const at = (m: number): number => bsPathLossDb(FREQ_24G_MHZ, m, 0)
    expect(at(clampCm! / 200), 'half that distance gives the same loss').toBe(at(clampCm! / 100))
    expect(at(clampCm! / 100 + 0.01), 'and a centimetre further does not')
      .toBeGreaterThan(at(clampCm! / 100))
    // every 「N cm」 in the lesson is one of the scene's radii, or one of those two
    for (const v of everyFig(/(?<![\d.−-])(\d+) cm/g, 'a distance in centimetres', 10)) {
      expect([...radii, gapCm, clampCm], `${v} cm is a radius of this scene, or one of the two
        distances the prose derives`).toContain(num(v))
    }
    // every 「N dBm」 is one of the two excitations this lesson runs
    const lifted = ampBackscatter.variants!
      .map((v) => v.scenario().nodes[0]!.ampAp!.backscatter!.chargeDbm!)
        // the lookbehind keeps the 72 of 「−13.72 dBm」 out of it: a decimal's tail is not a figure
    for (const v of everyFig(/(?<![\d.−-])(\d+) dBm/g, 'an excitation', 5)) {
      expect([CFG.chargeDbm, CFG.bsDbm, ...lifted], `${v} dBm is an excitation this lesson uses`)
        .toContain(num(v))
    }
    // every 「N ms」 is a budget, a turnaround or a session the engine really has
    const session = (() => {
      const rounds = inv(recs())
      const first = rounds.filter((r) => r.session === rounds[0]!.session)
      const last = first[first.length - 1]!
      return (last.t + last.txopNs - rounds[0]!.t) / MS
    })()
    for (const v of everyFig(/(?<![\d.−-])([\d.]+) ms/g, 'a duration in milliseconds', 6)) {
      const ms = num(v)
      const airs = [undefined, ...ampBackscatter.variants!.map((_v, i) => i)]
        .map((variant) => Number((rfidAirtimeNs(recs(variant)) / MS).toFixed(1)))
      expect([
        CFG.txopMs, 10, AMP_BS_WUP_MIN_NS / MS, AMP_BS_WRITE_T3_NS / MS,
        Number(session.toFixed(1)), RUN_NS / MS, ...airs,
      ], `${ms} ms is a duration this lesson measures`).toContain(ms)
    }
    // 「于是 Q = 2 的一轮要四次传输机会、14.9 ms 才清点完」
    const [q, ms] = raw(EVERYWHERE, /于是 Q = (\d) 的一轮要四次传输机会、([\d.]+) ms 才清点完/,
      '`numbers` on what a round costs')
    expect(num(q!), 'the Q this scene ships').toBe(CFG.q)
    same(ms!, session, 'and how long one of its sessions takes')
    // 「Tag 1…4」 — the row that covers the ring of four
    const row0 = (ampBackscatter.numbers!.find((x) => x.kind === 'table'
      && (x.heading ?? '').includes('六张标签')) as { rows: string[][] }).rows[0]!
    const [from, to] = figs(row0[0]!, /Tag (\d)…(\d)/, 'the first row’s own label')
    expect(to! - from! + 1, 'the tags that row covers are the ones at the first radius')
      .toBe(CM.filter((c) => c === radii[0]).length)
    for (let i = from!; i <= to!; i++) {
      expect(TAGS, `Tag ${i} is a tag of this scene`).toContain(`tag-${i}#2g`)
    }
    // 「Read 的回应是 8 个字节的存储内容」 — `numbers` says it as well as the steps
    for (const v of everyFig(/是 (\d+) 个字节的存储内容|把 (\d+) 个字节的存储内容/g,
      'the octets a Read brings back', 2)) {
      expect(num(v) + 1 + 2 + 2, 'the whole Read reply they sit in').toBe(GEN2_REPLY_BYTES.read)
    }
    /*
     * 「T1 = 16 µs 与响应窗口的 ±20 % 余量是 PM-75 与 PM-74」. `BST_T1_MARGIN` is file-local to
     * `ampBs.ts`, so the margin is read out of the file the window is built in — the same way
     * `@collisions-cw` reads `CAPTURE_MARGIN_DB`.
     */
    const [pct] = figs(srcText, /响应窗口的 ±(\d+) % 余量/, '`sources` on the response window')
    const amp = readFileSync('src/engine/ampBs.ts', 'utf8')
    const decl = /BST_T1_MARGIN = ([\d.]+)/.exec(amp)
    expect(decl, '`ampBs.ts` no longer declares BST_T1_MARGIN').not.toBeNull()
    expect(Number(decl![1]), 'the margin it builds the window with').toBe(1 + pct! / 100)
    expect(bstNs(null, CFG.ulKbps), 'and the window a command with no reply still holds open')
      .toBe(Math.max(AMP_BS_BST_MIN_NS, Math.round((1 + pct! / 100) * AMP_BS_T1_NS)))
  })

  it('the four figures the prose prints one more time than this file had read', () => {
    // 「决定了「余量 = 64 − 2 × 路损」里的那个 64」 — the quoted formula is its own site
    const [quoted, twice] = figs(limitsText, /「余量 = (\d+) − (\d) × 路损」/,
      '`limits` on the identity it quotes')
    expect(quoted, 'the constant the three it names add up to')
      .toBe(AMP_BS_ISOLATION_DB + AMP_BS_READER_DR_DB - AMP_BS_LOSS_DB)
    const d = CM[0]! / 100
    const pl = freeSpacePl0Db(FREQ_24G_MHZ) + 20 * Math.log10(d)
    expect(quoted! - twice! * pl, 'and the margin that identity gives at one of the scene’s radii')
      .toBeCloseTo(bsReplyDbm(CFG.chargeDbm, pl) - readerFloorDbm(monoLeakDbm(CFG.chargeDbm)), 9)
    // 「2.4 GHz 自由空间第一米的 40.2 dB」 — a band name (the fourth exemption class), but the
    // band the engine computes this link in has to be the one the sentence names
    const [ghz] = figs(srcText, /([\d.]+) GHz 自由空间第一米/, '`sources` on which band')
    expect(FREQ_24G_MHZ, 'the mid-band frequency `ampBs.ts` uses is in that band')
      .toBeGreaterThanOrEqual(ghz! * 1000)
    expect(FREQ_24G_MHZ, 'and not in the next one').toBeLessThan((ghz! + 0.1) * 1000)
    // every 「N Mb/s」 is the faster uplink rate, which one variant ships
    const rates = ampBackscatter.variants!
      .map((v) => v.scenario().nodes[0]!.ampAp!.backscatter!.ulKbps!)
    for (const v of everyFig(/([\d.]+) Mb\/s/g, 'the faster uplink rate', 2)) {
      expect([...rates, CFG.ulKbps], `${v} Mb/s is a rate this lesson runs`)
        .toContain(num(v) * 1000)
    }
    // every 「N^Q」 — `terms`, the steps and `sources` — is the base the slots really come in
    const sessions = new Map<number, number>()
    for (const r of inv(recs())) sessions.set(r.session, (sessions.get(r.session) ?? 0) + r.slotsOffered)
    const whole = inv(recs()).filter((r) => r.complete).map((r) => r.session)
    for (const v of everyFig(/(\d)\^Q/g, 'the base the slot count is a power of', 3)) {
      for (const session of whole) {
        expect(sessions.get(session), `a Q = ${CFG.q} session offers ${v}^Q slots`)
          .toBe(num(v) ** CFG.q)
      }
    }
    // every 「Q = N」 is a Q this lesson runs
    const qs = [CFG.q, ...ampBackscatter.variants!
      .map((v) => v.scenario().nodes[0]!.ampAp!.backscatter!.q!)]
    for (const v of everyFig(/Q = (\d)/g, 'a Q the prose names', 3)) {
      expect(qs, `Q = ${v} is one this lesson runs`).toContain(num(v))
    }
  })

  it('the quiz restates the identity and the whole slot budget, and both are read', () => {
    // 「回到读写器的功率是「激励 − 2 × 路损 − 6」，本机干扰是「激励 − 20 − 50」」
    const [twice, loss, iso, dr] = figs(quizText,
      /激励 − (\d) × 路损 − (\d+)」，本机干扰是「激励 − (\d+) − (\d+)」/,
      'the quiz on the two lines of the identity')
    expect([loss, iso, dr], 'the three constants `ampBs.ts` exports')
      .toEqual([AMP_BS_LOSS_DB, AMP_BS_ISOLATION_DB, AMP_BS_READER_DR_DB])
    const d = CM[0]! / 100
    const pl = freeSpacePl0Db(FREQ_24G_MHZ) + 20 * Math.log10(d)
    expect(CFG.chargeDbm - twice! * pl - loss!, 'and the return those terms give')
      .toBeCloseTo(bsReplyDbm(CFG.chargeDbm, pl), 9)
    // 「把单站读写器的激励从 10 dBm 抬到 20 dBm」 — the two the question names are the two it runs
    const [was, now] = figs(quizText, /激励从 (\d+) dBm 抬到 (\d+) dBm/,
      'the quiz on the two excitations')
    expect(was, 'the one the scene ships').toBe(CFG.chargeDbm)
    expect(ampBackscatter.variants!.map(
      (v) => v.scenario().nodes[0]!.ampAp!.backscatter!.chargeDbm!,
    ), 'and the one a variant lifts it to').toContain(now)
    // 「两者到读写器相差 10.8 dB，捕获效应让它解出了近的那张」
    const [diff] = raw(quizText, /两者到读写器相差 ([\d.]+) dB/, 'the quiz on the two levels')
    const rxOf = (cm: number): number => {
      const i = CM.findIndex((c) => c === cm)
      const node = `tag-${i + 1}#2g`
      const r = ofType(recs(), 'AMP_BS_REPLY').find((x) => x.node === node)
      expect(r, `${node} answers at all`).toBeDefined()
      return r!.rxDbmAtAp
    }
    const [nearCm, farCm] = figs(quizText, /同一个槽里 (\d+) cm 和 (\d+) cm 两张标签一起反射/,
      'the quiz on which two tags collide')
    same(diff!, rxOf(nearCm!) - rxOf(farCm!), 'the difference the two really arrive with')
    // 「Query 1516 + ACK 1009 + Read 1064 再加三段 16 µs 就是 3637 µs，而开下一个槽之前还要为
    //  可能到来的 RN16 预留 16 + 1009 µs」
    const [query, ack, read, gap, total, gap2, ack2] = figs(quizText,
      /Query (\d+) \+ ACK (\d+) \+ Read (\d+) 再加三段 (\d+) µs 就是 (\d+) µs[^]*?预留 (\d+) \+ (\d+) µs/,
      'the quiz on the slot budget')
    const sigExt = ERP_2G.signalExtNs
    const dl = (cmd: 'query' | 'ack' | 'read', wupNs: number, reply: 'rn16' | 'epc' | 'read'): number =>
      ampBsDlPpduNs(cmd, wupNs, bstNs(reply, CFG.ulKbps), sigExt) / 1000
    expect(query, 'the Query, with the WUP in front of it')
      .toBe(Math.round(dl('query', AMP_BS_WUP_MIN_NS, 'rn16')))
    expect(ack, 'the ACK').toBe(Math.round(dl('ack', 0, 'epc')))
    expect(read, 'and the Read').toBe(Math.round(dl('read', 0, 'read')))
    expect(gap, 'the gap between two commands').toBe(AMP_BS_T1_NS / 1000)
    expect(query! + ack! + read! + 3 * gap!, 'the sum the quiz prints is its own arithmetic')
      .toBe(total)
    expect(gap2, 'and the next slot would need that gap again').toBe(gap)
    expect(ack2, 'plus another ACK for the RN16 that might come').toBe(ack)
    expect(total! + gap2! + ack2!, 'which together do not fit the budget')
      .toBeGreaterThan(CFG.txopMs * 1000)
  })
})
