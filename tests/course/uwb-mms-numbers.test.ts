/**
 * `@uwb-mms-numbers`, in the standard-first shape (2026-11-10).
 *
 * ① names the regulation, the three TG4ab documents and the two clauses of IEEE Std
 * 802.15.4-2024 each point comes from, and says the proposals leave the combining, the verdict
 * and the clock-ratio estimate open; ② labels each of those as the simulator's own and is checked
 * against the engine's exports; ③'s figures — the six-step budget, the three trains, the clock
 * ratio over 14 ms and the split of the 19.57 dB — are read back out of the lesson and compared
 * with a run, so a figure edited without the engine agreeing turns this red.
 */
import { describe, expect, it } from 'vitest'
import { uwbMmsNumbers } from '../../src/course/uwb/uwb-mms-numbers'
import { ANCHOR_Z, MMS_ANCHORS, TAG_POS, TAG_Z, uwbMmsScenario, type UwbMmsVariant } from '../../src/course/uwb/uwb-mms'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { DEFAULT_UWB_SESSION } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { WALL_LOSS_DB } from '../../src/engine/propagation'
import { C_M_PER_NS, UWB_NLOS_NS, UWB_PPM_MAX, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM, uwbPl0Db, uwbPollBytes, uwbPpduNs } from '../../src/uwb/phy'
import { UWB_PL_EXP, RCTU_NS } from '../../src/uwb/units'
import { MMS_SETS, UWB_MS_BUDGET_NJ, combineGainDb, mmsFragmentDbm, mmsSet, ratioSigma, rsfChips, rsfNs } from '../../src/uwb/mms'
import { rangeSigmaM } from '../../src/uwb/position'
import { rctuToMetres } from '../../src/uwb/ranging'
import { roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const TAG = 'tag-1'
const ANCHORS = MMS_ANCHORS.map((a) => a.id)
const V: Record<Exclude<UwbMmsVariant, 'base'>, number> = { four: 0, rsf1: 1, twr: 2, pairwise: 3 }
const recs = (v: UwbMmsVariant): TLRecord[] => runOf(uwbMmsNumbers, v === 'base' ? undefined : V[v], RUN_NS)

const distTo = (a: { x: number; y: number }): number => Math.hypot(a.x - TAG_POS.x, a.y - TAG_POS.y, ANCHOR_Z - TAG_Z)
const neg = (s: string): string => s.replace(/^-/, '−')
const signed = (x: number, d = 2): string => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`
const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length

const lab = (heading: string): Lab => {
  const l = uwbMmsNumbers.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === kind && b.heading === heading)
  expect(t, `${kind} 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbMmsNumbers.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const firstTrains = (v: UwbMmsVariant) =>
  ANCHORS.map((p) => ofType(recs(v), 'UWB_MMS_TRAIN').find((t) => t.node === TAG && t.peer === p)!)

/** The figures every lab leans on, from the engine. */
const E_DBM = -41.3 + 10 * Math.log10(499.2)
const FRAG_NS = rsfNs(40, 64)
const P_DBM = mmsFragmentDbm(FRAG_NS)
const PL0 = uwbPl0Db(9)
const DIST_DB = 10 * UWB_PL_EXP * Math.log10(distTo(MMS_ANCHORS[0]))
const WALLS_DB = 2 * WALL_LOSS_DB.brick
const POLL_NS = uwbPpduNs(uwbPollBytes(ANCHORS.length))
const POLL_DBM = UWB_TX_POWER_DBM - (PL0 + DIST_DB + WALLS_DB)
const plan = roundPlan(uwbMmsScenario('base').uwb!, ANCHORS.length)
const SPAN_MS = ((plan.mms!.phy.rsfs - 1) * plan.mms!.fragGapNs) / MS
const SIGMA_PPM = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, SPAN_MS) * 1e6
const C_M_PER_S = C_M_PER_NS * 1e9
const HALF_REPLY_S = 0.5 * 0.5e-3

lessonShapeSuite(uwbMmsNumbers, { sameSceneAs: 'uwb-mms', runNs: RUN_NS })

describe('uwb-mms-numbers · the lesson', () => {
  it('is in the standard-first shape, second lesson of the multi-millisecond module', () => {
    expect(isStandardFirst(uwbMmsNumbers)).toBe(true)
    expect(MODULES[uwbMmsNumbers.module].title).toBe('多毫秒片段')
    expect(uwbMmsNumbers.needs).toEqual(['uwb-mms'])
    expect(uwbMmsNumbers.limits).toEqual([])
    expect(uwbMmsNumbers.observe).toEqual([])
    expect(uwbMmsNumbers.tryThis).toEqual([])
  })

  it('① names its sources and the two steps the proposals leave open', () => {
    const std = uwbMmsNumbers.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''}`).join(' ')
    for (const s of ['15-22/0205r0', '15-23/0100r2', '15-23/0502r3', '§16.4.9', '§10.29.1.2.2', '−41.3 dBm/MHz', '37 nJ', '±20 × 10⁻⁶']) expect(std, s).toContain(s)
    expect(std).toContain('都没有规定接收机怎样把一串片段合起来')
    expect(UWB_PPM_MAX).toBe(20)
  })

  it('the why states the run’s figures', () => {
    const why = uwbMmsNumbers.why!
    const t = firstTrains('base')[0]
    const four = firstTrains('four')[0]
    expect(why).toContain(`${UWB_MS_BUDGET_NJ} nJ`)
    expect(why).toContain(`只有 ${(FRAG_NS / 1000).toFixed(3)} µs`)
    expect(why).toContain(`功率就是 ${neg(P_DBM.toFixed(2))} dBm`)
    expect(why).toContain(`${neg(t.rxDbm.toFixed(2))} dBm，八个片段合起来是 ${neg((t.rxDbm + t.gainDb).toFixed(2))} dBm`)
    expect(why).toContain(`高 ${t.marginDb.toFixed(2)} dB`)
    expect(four.detected).toBe(false)
    expect(ofType(recs('four'), 'UWB_RANGE')).toEqual([])
    expect(why).toContain(`只差 ${(t.gainDb - four.gainDb).toFixed(2)} dB`)
    expect(why).toContain(`跨越 ${SPAN_MS} ms`)
    expect(why).toContain(`${SIGMA_PPM.toFixed(4)} ppm`)
    expect(why).toContain(`强 ${(t.rxDbm + t.gainDb - POLL_DBM).toFixed(2)} dB`)
    expect(why).toContain(`只有 ${combineGainDb(8).toFixed(2)} dB`)
    expect(why).toContain(`其余 ${(P_DBM - mmsFragmentDbm(POLL_NS) + (mmsFragmentDbm(POLL_NS) - UWB_TX_POWER_DBM)).toFixed(2)} dB`)
  })
})

describe('uwb-mms-numbers · ② says what the engine does, and the engine does it', () => {
  it('a millisecond is 37 nJ; every fragment spends all of it', () => {
    expect(E_DBM.toFixed(1)).toBe('-14.3')
    expect((10 ** (E_DBM / 10) * 1000).toFixed(0)).toBe(String(UWB_MS_BUDGET_NJ))
    expect(P_DBM).toBeCloseTo(10 * Math.log10(UWB_MS_BUDGET_NJ / (FRAG_NS / 1000)), 9)
    expect(implRow('一毫秒的能量').sim).toContain('−14.3 dBm')
  })

  it('the 4z transmitter holds −14 dBm whatever the frame', () => {
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(implRow('4z 发射机').sim).toContain('−14 dBm')
  })

  it('17 sets; rsf-1 is X = 16, 40 repeats, a 33-zero gap; the base train is none of them', () => {
    expect(Object.keys(MMS_SETS)).toHaveLength(17)
    const r = mmsSet('rsf-1')
    expect([r.rsfs, r.nMsr, r.gap]).toEqual([16, 40, 33])
    expect(implRow('参数集').sim).toContain('共 17 组')
    expect(implRow('参数集').sim).toContain('X = 16，重复 40 次，间隔 33 个零')
    const own = uwbMmsScenario('base').uwb!.mms
    expect([own.rsfs, own.nMsr, own.gap]).toEqual([8, 40, 64])
    expect(Object.values(MMS_SETS).some((m) => m.rsfs === 8 && m.nMsr === 40 && m.gap === 64)).toBe(false)
  })

  it('100 ps stamps, 2.1 cm a range; crystals set at +20 / −20, 0, +10', () => {
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect((rangeSigmaM(100) * 100).toFixed(1)).toBe('2.1')
    expect(implRow('时间戳噪声').sim).toContain('2.1 cm')
    expect(TAG_POS.ppm).toBe(20)
    expect(MMS_ANCHORS.map((a) => a.ppm)).toEqual([-20, 0, 10])
    expect(MMS_ANCHORS.map((a) => TAG_POS.ppm - a.ppm)).toEqual([40, 20, 10])
  })
})

describe('uwb-mms-numbers · ③ every figure the labs print is the run', () => {
  it('lab 1: the six-step budget, and the verdict record it adds up to', () => {
    const l = lab('一个片段的预算，逐项计算')
    const rows = blockOf(l, 'table', '这六项在本场景中的取值').rows
    expect(rows[0][1]).toBe(`−41.3 dBm/MHz × 499.2 MHz = ${neg(E_DBM.toFixed(1))} dBm → ${UWB_MS_BUDGET_NJ} nJ`)
    expect(rsfChips(40, 64)).toBe(40 * 4 * (128 + 2 * 64))
    expect(rows[1][1]).toBe(`40 × 4 × (128 + 2 × 64) = 40 960 chips → ${(FRAG_NS / 1000).toFixed(3)} µs`)
    expect(rows[2][1]).toBe(`10·log10(37 / ${(FRAG_NS / 1000).toFixed(3)}) = ${neg(P_DBM.toFixed(2))} dBm`)
    const t = firstTrains('base')[0]
    expect(P_DBM - (PL0 + DIST_DB + WALLS_DB)).toBeCloseTo(t.rxDbm, 9)
    expect(rows[3][1]).toBe(`${neg(P_DBM.toFixed(2))} − (${PL0.toFixed(2)} + ${DIST_DB.toFixed(2)} + ${WALLS_DB}) = ${neg(t.rxDbm.toFixed(2))} dBm`)
    const four = firstTrains('four')[0]
    expect(rows[4][1]).toBe(`${signed(t.gainDb)} dB · ${signed(four.gainDb)} dB`)
    expect(rows[5][1]).toBe(`${signed(t.marginDb)} dB · ${signed(four.marginDb)} dB`)
    expect(UWB_RX_SENS_DBM).toBe(-93)
    expect(l.expect).toContain(`${t.heard}/${t.fragments} heard、${neg(t.rxDbm.toFixed(1))} dBm + ${t.gainDb.toFixed(1)} dB = margin ${t.marginDb.toFixed(1)} dB`)
    expect(l.expect).toContain(`${neg(t.rxDbm.toFixed(2))} dBm、${signed(t.gainDb)} dB、${signed(t.marginDb)} dB`)
    expect(l.meaning).toContain(`${PL0.toFixed(2)}、${DIST_DB.toFixed(2)} 与 ${WALLS_DB}`)
  })

  it('lab 2: three trains in one room', () => {
    const l = lab('同一个房间里的三种片段串')
    const rows = blockOf(l, 'table', '三种片段串').rows
    const pair = (xs: number[]) => xs.map((x) => x.toFixed(2))
    for (const [v, row] of [['base', rows[0]], ['four', rows[1]], ['rsf1', rows[2]]] as const) {
      const ts = firstTrains(v)
      const phy = uwbMmsScenario(v).uwb!.mms
      expect(row[0], v).toBe(`${phy.rsfs} × ${(rsfNs(phy.nMsr, phy.gap) / 1000).toFixed(3)} µs`)
      const lv = [...new Set(pair(ts.map((t) => t.rxDbm)))]
      expect(row[1], v).toBe(`${lv.map(neg).join(' / ')} dBm`)
      expect(row[2], v).toBe(`${signed(ts[0].gainDb)} dB`)
      const mg = [...new Set(ts.map((t) => signed(t.marginDb)))]
      expect(row[3], v).toBe(`${mg.join(' / ')} dB`)
      expect(row[4], v).toBe(ts.every((t) => t.detected) ? '检出' : '丢失')
      expect(row[5], v).toBe(String(ofType(recs(v), 'UWB_RANGE').length))
    }
    expect(l.expect).toContain(`${(combineGainDb(8) - combineGainDb(4)).toFixed(2)} dB 之差`)
    expect(l.expect).toContain(`${(rsfNs(40, 33) / 1000).toFixed(3)} µs`)
    expect(l.expect).toContain(`高 ${(mmsFragmentDbm(rsfNs(40, 33)) - P_DBM).toFixed(2)} dB`)
    expect(Math.round(firstTrains('rsf1')[0].marginDb)).toBe(6)
  })

  it('lab 3: the ratio over 14 ms, and what it leaves on a 0.5 ms reply', () => {
    const l = lab('十四毫秒跨度上的时钟比值')
    expect(plan.mms!.fragGapNs).toBe(2 * MS)
    const note = blockOf(l, 'formula', '比值与它的不确定度（本仿真器的取法）').note!
    expect(note).toContain(`相隔 ${plan.mms!.fragGapNs / MS} ms`)
    expect(note).toContain(`是 ${SPAN_MS} ms`)
    expect(note).toContain(`σ_ts = ${DEFAULT_UWB_SESSION.tsNoisePs} ps`)
    expect(note).toContain(`σ = ${SIGMA_PPM.toFixed(4)} ppm`)
    const rows = blockOf(l, 'table', '这个比值用于 0.5 ms 的回复').rows
    const ts = firstTrains('base')
    expect(rows[0][1]).toBe(`${ts.map((t) => t.ratioPpm!.toFixed(3)).join(', ')} ppm`)
    for (const t of ts) expect(Math.abs(t.ratioPpm! - (TAG_POS.ppm - MMS_ANCHORS.find((a) => a.id === t.peer)!.ppm))).toBeLessThan(0.02)
    // the reply really is half a millisecond
    const reply = ofType(recs('base'), 'TX_START').map((r) => r.frame.uwb?.nb?.replyRctu).find((x) => x !== undefined)!
    expect((reply * RCTU_NS / MS).toFixed(3)).toBe('0.500')
    const uncorrected = HALF_REPLY_S * 40e-6 * C_M_PER_S
    expect(rows[1][1]).toBe(`${uncorrected.toFixed(2)} m`)
    const gaps = ofType(recs('base'), 'UWB_RANGE').filter((r) => r.peer === 'anchor-1').map((r) => rctuToMetres(r.tofRawRctu!) - r.distM)
    expect(mean(gaps)).toBeCloseTo(uncorrected, 2)
    expect(rows[2][1]).toBe(`${(HALF_REPLY_S * UWB_PPM_MAX * 1e-6 * C_M_PER_S).toFixed(1)} m`)
    expect(rows[3][0]).toContain(`残差 ${DEFAULT_UWB_SESSION.cfoNoisePpm} ppm`)
    expect(rows[3][1]).toBe(`${(HALF_REPLY_S * DEFAULT_UWB_SESSION.cfoNoisePpm * 1e-6 * C_M_PER_S * 100).toFixed(1)} cm`)
    expect(rows[4][0]).toContain(`${SIGMA_PPM.toFixed(4)} ppm`)
    const residualMm = (HALF_REPLY_S * SIGMA_PPM * 1e-6 * C_M_PER_S * 1000).toFixed(2)
    expect(rows[4][1]).toBe(`${residualMm} mm`)
    const bias = 2 * UWB_NLOS_NS.brick * C_M_PER_NS
    const errs = ofType(recs('base'), 'UWB_RANGE').map((r) => r.distM - r.trueDistM - bias)
    expect(rows[5][0]).toContain(`${errs.length} 次`)
    const rmsCm = (Math.sqrt(mean(errs.map((e) => e * e))) * 100).toFixed(2)
    expect(rows[5][1]).toBe(`${rmsCm} cm`)
    expect(l.expect).toContain(`只留下 ${residualMm} mm`)
    expect(l.expect).toContain(`${rmsCm} cm`)
  })

  it('lab 4: 19.57 dB = 9.03 + 4.053 + 6.488', () => {
    const l = lab('那 19.57 dB 从哪里来')
    const rows = blockOf(l, 'table', '一串片段比一帧 Poll 强多少').rows
    const nJ = 10 ** (UWB_TX_POWER_DBM / 10) * (POLL_NS / 1000)
    expect(rows[0][1]).toBe(`${uwbPollBytes(ANCHORS.length)} octets, ${(POLL_NS / 1000).toFixed(3)} µs, ${nJ.toFixed(2)} nJ`)
    const poll = ofType(recs('twr'), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    expect(poll.frame.bytes).toBe(uwbPollBytes(ANCHORS.length))
    expect(poll.frame.txTimeNs).toBe(POLL_NS)
    const t = firstTrains('base')[0]
    const train = t.rxDbm + t.gainDb
    expect(rows[1][1]).toBe(`${neg(POLL_DBM.toFixed(2))} dBm, ${neg(train.toFixed(2))} dBm`)
    const shorter = P_DBM - mmsFragmentDbm(POLL_NS)
    const unspent = mmsFragmentDbm(POLL_NS) - UWB_TX_POWER_DBM
    expect(rows[2][1]).toBe(`${combineGainDb(8).toFixed(2)} dB`)
    expect(rows[3][1]).toBe(`${shorter.toFixed(3)} dB`)
    expect(rows[4][1]).toBe(`${unspent.toFixed(3)} dB`)
    expect(combineGainDb(8) + shorter + unspent).toBeCloseTo(train - POLL_DBM, 6)
    expect(l.expect).toContain(`相差 ${(train - POLL_DBM).toFixed(2)} dB`)
    expect(l.expect).toContain(`合起来 ${(shorter + unspent).toFixed(2)} dB`)
    expect(l.expect).toContain(`${neg(mmsFragmentDbm(POLL_NS).toFixed(2))} dBm`)
    expect(l.expect).toContain(`只有 ${combineGainDb(8).toFixed(2)} dB`)
    expect(l.meaning).toContain(`${UWB_TX_POWER_DBM} dBm`.replace('-', '−'))
  })
})

describe('uwb-mms-numbers · the quiz repeats the run', () => {
  it('quotes the gains and the transmitter figures as computed', () => {
    const text = uwbMmsNumbers.quiz.map((q) => `${q.q} ${q.options.join(' ')} ${q.explain}`).join(' ')
    const t = firstTrains('base')[0]
    expect(text).toContain(`${combineGainDb(4).toFixed(2)} dB 对 ${combineGainDb(8).toFixed(2)} dB`)
    expect(text).toContain(`强 ${(t.rxDbm + t.gainDb - POLL_DBM).toFixed(2)} dB`)
    const shorter = P_DBM - mmsFragmentDbm(POLL_NS)
    const unspent = mmsFragmentDbm(POLL_NS) - UWB_TX_POWER_DBM
    expect(text).toContain(`另外 ${(shorter + unspent).toFixed(2)} dB 是发射功率`)
    expect(text).toContain(`在 ${UWB_MS_BUDGET_NJ} nJ 里只用掉 ${(10 ** (UWB_TX_POWER_DBM / 10) * (POLL_NS / 1000)).toFixed(2)} nJ`)
    expect(text).toContain(`${combineGainDb(16).toFixed(2)} dB，表里最大的那个合成增益`)
  })
})

