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
import { describe, it, expect } from 'vitest'
import { ampBackscatter, ampBackscatterScenario } from '../../src/course/amp/amp-backscatter'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_AMP_BS, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_BS_ACTIVATION_DBM, AMP_BS_ISOLATION_DB, AMP_BS_LOSS_DB, AMP_BS_READER_DR_DB,
  AMP_BS_REQ_SNR_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_UL_SYNC_CHIPS, AMP_BS_WRITE_T3_NS,
  AMP_BS_WUP_MIN_NS, activationReachM, ampBsDlPpduNs, bsReplyNs, bstNs, freeSpacePl0Db,
  monoReachM, FREQ_24G_MHZ,
} from '../../src/engine/ampBs'
import { MODULES } from '../../src/course/curriculum'
import { applyRecord, initViewState } from '../../src/model/view'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

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
