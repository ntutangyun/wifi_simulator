/**
 * `@uwb-mms`, in the standard-first shape (2026-11-10).
 *
 * ① cites the TG4ab document each point comes from (15-22/0205r0, 15-23/0100r2, 15-22/0381r5) and
 * never the simulator; ② says, row by row, what the engine does, and each row is checked against
 * the engine here — including the one that differs (a one-to-many round spaces a device's
 * fragments (R + 1) slots apart, not the proposal's 1 200 RSTU; audit #22, open under W5); ③'s
 * figures are read back out of the lesson text and compared with a run, so editing a number
 * without the engine agreeing turns this red, and so does an engine change that moves one.
 */
import { describe, expect, it } from 'vitest'
import { ANCHOR_Z, MMS_ANCHORS, TAG_POS, TAG_Z, uwbMms, uwbMmsScenario, type UwbMmsVariant } from '../../src/course/uwb/uwb-mms'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { WALL_LOSS_DB } from '../../src/engine/propagation'
import { C_M_PER_NS, UWB_NLOS_NS, UWB_PL_EXP, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM, fomText, rstuNs, uwbPl0Db } from '../../src/uwb/phy'
import { UWB_MS_BUDGET_NJ, combineGainDb, mmrsSymbolChips, rsfChips, rsfNs } from '../../src/uwb/mms'
import { roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = 'tag-1'
const ANCHORS = MMS_ANCHORS.map((a) => a.id)
const V: Record<Exclude<UwbMmsVariant, 'base'>, number> = { four: 0, rsf1: 1, twr: 2, pairwise: 3 }
const recs = (v: UwbMmsVariant): TLRecord[] => runOf(uwbMms, v === 'base' ? undefined : V[v], RUN_NS)

const distTo = (a: { x: number; y: number }): number => Math.hypot(a.x - TAG_POS.x, a.y - TAG_POS.y, ANCHOR_Z - TAG_Z)
const neg = (s: string): string => s.replace(/^-/, '−')
const signed = (x: number, d = 2): string => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`

const lab = (heading: string): Lab => {
  const l = uwbMms.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbMms.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbMms.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** The tag-side train verdicts of the first round, anchor order. */
const firstTrains = (v: UwbMmsVariant) =>
  ANCHORS.map((p) => ofType(recs(v), 'UWB_MMS_TRAIN').find((t) => t.node === TAG && t.peer === p)!)
/** The send times of one node's fragments in the first round. */
const fragTimes = (v: UwbMmsVariant, node: string): number[] =>
  ofType(recs(v), 'TX_START').filter((r) => r.frame.kind === 'uwbRsf' && r.node === node && r.t < 14 * MS).map((r) => r.t)

lessonShapeSuite(uwbMms, { runNs: RUN_NS })

describe('uwb-mms · the lesson', () => {
  it('is in the standard-first shape, in the multi-millisecond module', () => {
    expect(isStandardFirst(uwbMms)).toBe(true)
    expect(MODULES[uwbMms.module].title).toBe('多毫秒片段')
    expect(uwbMms.needs).toEqual(['uwb-blocks', 'uwb-dstwr', 'uwb-geometry'])
    expect(uwbMms.terms!.map((t) => t.term)).toEqual(['MMS', 'fragment', 'RSF', 'RIF', 'sensitivity', 'margin'])
    expect(uwbMms.limits).toEqual([])
    expect(uwbMms.observe).toEqual([])
    expect(uwbMms.tryThis).toEqual([])
    for (const v of uwbMms.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('① says which TG4ab document each point comes from, and that none of it is the published standard', () => {
    const std = stdText()
    for (const doc of ['15-22/0205r0', '15-23/0100r2', '15-22/0381r5', 'P802.15.4ab', '§10.29.1.7']) expect(std, doc).toContain(doc)
    expect(std).toContain('IEEE Std 802.15.4-2024 里没有多毫秒测距')
    // the proposal's own numbers, as ① states them
    for (const s of ['37 nJ', '1 200 RSTU（ranging scheduling time unit，1 ms）', '300 RSTU（250 µs）', '600 RSTU（0.5 ms）', '0x10', '0x07']) expect(std, s).toContain(s)
    expect(rstuNs(1200)).toBe(MS)
    expect(rstuNs(300)).toBe(250_000)
  })

  it('the why states the run’s conclusions', () => {
    const why = uwbMms.why!
    expect(why).toContain(`${UWB_MS_BUDGET_NJ} nJ`)
    const t = firstTrains('base')[0]
    expect(why).toContain(`低约 ${Math.round(UWB_RX_SENS_DBM - t.rxDbm)} dB`)
    expect(why).toContain(`超过灵敏度 ${t.marginDb.toFixed(2)} dB`)
    expect(why).toContain(`每道墙延迟 ${UWB_NLOS_NS.brick} ns`)
    expect(why).toContain(`${(2 * UWB_NLOS_NS.brick * C_M_PER_NS).toFixed(3)} m`)
  })
})

describe('uwb-mms · ② says what the engine does, and the engine does it', () => {
  it('a fragment: 40 repeats of 4 × (128 + 2 × 64) chips, 40 960 chips, 82.051 µs, 0 bytes', () => {
    const s = uwbMmsScenario('base').uwb!.mms
    expect([s.nMsr, s.gap]).toEqual([40, 64])
    expect(mmrsSymbolChips(64)).toBe(4 * (128 + 2 * 64))
    expect(rsfChips(40, 64)).toBe(40_960)
    expect(rsfNs(40, 64)).toBe(82_051)
    const sim = implRow('片段的长度').sim
    expect(sim).toContain('重复 40 次')
    expect(sim).toContain('40 960 个码片')
    expect(sim).toContain('82.051 µs')
    for (const f of ofType(recs('base'), 'TX_START').filter((r) => r.frame.kind === 'uwbRsf')) {
      expect(f.frame.bytes).toBe(0)
      expect(f.frame.txTimeNs).toBe(82_051)
    }
  })

  it('X = 8 in the base, 4 and 16 in the two variants', () => {
    expect(uwbMmsScenario('base').uwb!.mms.rsfs).toBe(8)
    expect(uwbMmsScenario('four').uwb!.mms.rsfs).toBe(4)
    expect(uwbMmsScenario('rsf1').uwb!.mms.rsfs).toBe(16)
    expect(implRow('片段数').kind).toBe('value')
  })

  // 2026-11-11 (audit #22): one sub-round per responder (15-25/0213r2), 1 ms apart, the responder
  // 500 µs behind (15-24/0633r1). It used to be (R + 1) slots — 2 ms here.
  it('faithful: a device’s fragments are 1 ms apart in both round shapes, the responder half a millisecond behind', () => {
    expect(implRow('同一台设备两个片段的间隔').kind).toBe('faithful')
    const otm = fragTimes('base', TAG)
    const pair = fragTimes('pairwise', TAG)
    expect(otm[1] - otm[0]).toBe(rstuNs(1200))
    expect(pair[1] - pair[0]).toBe(rstuNs(1200))
    const anc = ofType(recs('base'), 'TX_START').find((r) => r.frame.kind === 'uwbRsf' && r.node === ANCHORS[0])!
    expect(anc.t - otm[0]).toBe(rstuNs(600))
    expect(implRow('同一台设备两个片段的间隔').sim).toContain('锚点晚一个时隙（500 µs）')
  })

  it('the transmit stamp is the first fragment; no receive stamp before the verdict', () => {
    const rs = recs('base')
    const first = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbRsf')!
    expect(ofType(rs, 'UWB_TS').find((r) => r.dir === 'tx')!.t).toBe(first.t)
    const verdict = ofType(rs, 'UWB_MMS_TRAIN')[0].t
    expect(ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx' && r.t < verdict)).toEqual([])
  })

  it('the verdict: first fragment’s level + 10·log10(heard) − (−93 dBm)', () => {
    expect(UWB_RX_SENS_DBM).toBe(-93)
    for (const t of ofType(recs('base'), 'UWB_MMS_TRAIN')) {
      expect(t.gainDb).toBeCloseTo(combineGainDb(t.heard), 9)
      expect(t.marginDb).toBeCloseTo(t.rxDbm + t.gainDb - UWB_RX_SENS_DBM, 9)
      expect(t.detected).toBe(t.marginDb >= 0)
    }
    expect(implRow('接收机怎样合并与判决').sim).toContain('−93 dBm')
  })

  it('600 RSTU slots, 500 µs; a 200 ms block; channel 3', () => {
    const u = uwbMmsScenario('base').uwb!
    expect(u.slotRstu).toBe(600)
    expect(rstuNs(u.slotRstu)).toBe(500_000)
    expect(roundPlan(u, ANCHORS.length).blockNs).toBe(200 * MS)
    expect(implRow('时隙长度').sim).toContain('600 RSTU，即 500 µs')
    expect(implRow('时隙长度').sim).toContain('200 ms')
    expect(u.mms.nbChannels).toEqual([3])
    const bad = { ...uwbMmsScenario('base'), uwb: { ...u, slotRstu: 700 } }
    expect(ScenarioSchema.safeParse(bad).success).toBe(false)
  })

  it('a brick wall: 12 dB and 2 ns; NLOS FoM printed as 「75 % within 12 ns」', () => {
    expect(WALL_LOSS_DB.brick).toBe(12)
    expect(UWB_NLOS_NS.brick).toBe(2)
    expect(implRow('穿墙的首径').sim).toContain('12 dB')
    expect(implRow('穿墙的首径').sim).toContain('2 ns')
    const r = ofType(recs('base'), 'UWB_RANGE')[0]
    expect(fomText(r.fom)).toBe('75 % within 12 ns')
    expect(implRow('品质因数').sim).toContain(fomText(r.fom))
  })

  it('only the anchors report, and the tag computes the range; no RIF is sent', () => {
    const tx = ofType(recs('base'), 'TX_START')
    expect(new Set(tx.filter((r) => r.frame.kind === 'nbReport').map((r) => r.node))).toEqual(new Set(ANCHORS))
    expect(new Set(ofType(recs('base'), 'UWB_RANGE').map((r) => r.node))).toEqual(new Set([TAG]))
    expect(uwbMmsScenario('base').uwb!.mms.rifs).toBe(0)
    expect(ofType(recs('base'), 'UWB_MMS_TRAIN').filter((t) => t.kind === 'rif')).toEqual([])
  })
})

describe('uwb-mms · ③ every figure the labs print is the run', () => {
  it('lab 1: 4z — no range, 42 timeouts, a poll at −110.80 dBm, 17.8 dB under', () => {
    const l = lab('普通双向测距穿不过这个房间')
    const rs = recs('twr')
    expect(ofType(rs, 'UWB_RANGE')).toEqual([])
    const outs = ofType(rs, 'UWB_TIMEOUT')
    const poll = outs.filter((o) => o.expected === 'uwbPoll').length
    const resp = outs.filter((o) => o.expected === 'uwbResp').length
    expect(l.expect).toContain(`超时记录 ${outs.length} 条：${poll} 条是锚点等不到 Poll，${resp} 条是标签等不到应答`)
    const d = distTo(MMS_ANCHORS[0])
    const rx = UWB_TX_POWER_DBM - (uwbPl0Db(9) + 10 * UWB_PL_EXP * Math.log10(d) + 2 * WALL_LOSS_DB.brick)
    expect(l.expect).toContain(`${neg(rx.toFixed(2))} dBm`)
    expect(l.expect).toContain(`低 ${(UWB_RX_SENS_DBM - rx).toFixed(1)} dB`)
    expect(RUN_NS / MS / 1000).toBe(1.3)
  })

  it('lab 2: the round’s log lines are the records, line for line', () => {
    const l = lab('一轮测距的时间线')
    const rows = tableOf(l, '第 0 块的那一轮').rows
    const rs = recs('base')
    const tx = ofType(rs, 'TX_START')
    const picks: TLRecord[] = [
      tx.find((r) => r.frame.kind === 'nbPoll')!,
      tx.find((r) => r.frame.kind === 'nbResp')!,
      tx.find((r) => r.frame.kind === 'uwbRsf')!,
      ofType(rs, 'UWB_MMS_TRAIN').find((t) => t.node === 'anchor-1')!,
      tx.find((r) => r.frame.kind === 'nbReport')!,
      ofType(rs, 'UWB_RANGE')[0],
      tx.filter((r) => r.frame.kind === 'nbPoll')[1] as TLRecord,
      ofType(rs, 'UWB_POSITION')[0],
    ]
    expect(rows).toHaveLength(picks.length)
    picks.forEach((r, i) => {
      expect(rows[i][1], `row ${i}`).toBe(fmtRecord(r))
      expect(rows[i][0], `row ${i}`).toBe(r.t === 0 ? '0 ms' : `${(r.t / MS).toFixed(3)} ms`)
    })
    // the expect line's figures
    const plan = roundPlan(uwbMmsScenario('base').uwb!, ANCHORS.length)
    expect(l.expect).toContain(`共 ${plan.slots} 个时隙、${plan.roundNs / MS} ms，按三个锚点分成三个子轮，每个 ${plan.slots / 3} 个时隙`)
    expect(l.expect).toContain(`anchor-1 的 Response 在 ${picks[1].t / MS} ms`)
    expect(l.expect).toContain(`窄带 Poll 在 0 ms 发出，${tx[0].frame.bytes} 字节`)
    expect(l.expect).toContain(`第一个片段在 ${picks[2].t / MS} ms`)
    for (const i of [3, 4, 5]) expect(l.expect).toContain(`${(picks[i].t / MS).toFixed(3)} ms`)
    const polls = tx.filter((r) => r.frame.kind === 'nbPoll' && r.t < plan.roundNs)
    expect(l.expect).toContain(`后两个子轮的 Poll 在 ${polls[1].t / MS} ms 与 ${polls[2].t / MS} ms，各 ${polls[1].frame.bytes} 字节`)
    expect([polls[0].frame.bytes, polls[1].frame.bytes, polls[2].frame.bytes]).toEqual([21, 12, 12])
  })

  it('lab 3: eight fragments clear the receiver by 1.77 dB, four miss it by 1.24 dB', () => {
    const l = lab('一串片段的判定：八个与四个')
    const rows = tableOf(l, '同一个锚点的判定，两种片段数').rows
    for (const [v, row] of [['base', rows[0]], ['four', rows[1]]] as const) {
      const t = firstTrains(v)[0]
      expect(row[0], v).toBe(String(t.fragments))
      expect(row[1], v).toBe(`${t.heard}/${t.fragments}`)
      expect(row[2], v).toBe(`${neg(t.rxDbm.toFixed(2))} dBm`)
      expect(row[3], v).toBe(`${signed(t.gainDb)} dB`)
      expect(row[4], v).toBe(`${signed(t.marginDb)} dB`)
      expect(row[5], v).toBe(t.detected ? '检出' : '丢失')
      expect(row[6], v).toBe(String(ofType(recs(v), 'UWB_RANGE').length))
    }
    expect(ofType(recs('base'), 'UWB_RANGE')).toHaveLength(BLOCKS * ANCHORS.length)
    expect(l.expect).toContain(`相差 ${(combineGainDb(8) - combineGainDb(4)).toFixed(2)} dB`)
  })

  it('lab 4: 1 ms in both, one 84-slot round against three of 28, the fix at the same instant', () => {
    const rows = tableOf(lab('一对多与成对：片段间隔与一块的长度'), '同一个块，两种安排').rows
    const otm = fragTimes('base', TAG)
    const pair = fragTimes('pairwise', TAG)
    expect(rows[0].slice(1)).toEqual([`${(otm[1] - otm[0]) / MS} ms`, `${(pair[1] - pair[0]) / MS} ms`])
    const pBase = roundPlan(uwbMmsScenario('base').uwb!, ANCHORS.length)
    const pPair = roundPlan(uwbMmsScenario('pairwise').uwb!, ANCHORS.length)
    expect(rows[1].slice(1)).toEqual([String(pBase.slots), String(pPair.slots)])
    expect(rows[2].slice(1)).toEqual([`${pBase.roundNs / MS} ms`, `${pPair.roundNs / MS} ms`])
    const perBlock = (v: UwbMmsVariant) => ofType(recs(v), 'UWB_ROUND').length / BLOCKS
    expect(rows[3].slice(1)).toEqual([String(perBlock('base')), String(perBlock('pairwise'))])
    const fix = (v: UwbMmsVariant) => ofType(recs(v), 'UWB_POSITION')[0].t / MS
    expect(rows[4].slice(1)).toEqual([`${fix('base')} ms`, `${fix('pairwise')} ms`])
    const e = lab('一对多与成对：片段间隔与一块的长度').expect
    expect(fix('base')).toBe(fix('pairwise'))
    expect(e).toContain(`两者都在 ${fix('base')} ms 得出定位`)
  })

  it('lab 5: every range is long by about 1.2 m; the bias is 1.199 m; the fix is off by 1.24 m', () => {
    const e = lab('测得距离，但偏长').expect
    const first = ofType(recs('base'), 'UWB_RANGE').slice(0, 3)
    expect(e).toContain(`三条距离 ${first.map((r) => r.distM.toFixed(2)).join('、')} m`)
    expect(e).toContain(`真值 ${first.map((r) => r.trueDistM.toFixed(2)).join('、')} m`)
    for (const r of first) expect((r.distM - r.trueDistM).toFixed(1)).toBe('1.2')
    const bias = 2 * UWB_NLOS_NS.brick * C_M_PER_NS
    expect(e).toContain(`偏差是 ${bias.toFixed(3)} m`)
    const fix = ofType(recs('base'), 'UWB_POSITION')[0]
    expect(e).toContain(`定位 (${fix.x.toFixed(2)}, ${fix.y.toFixed(2)}) m`)
    expect(e).toContain(`误差 ${Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY).toFixed(2)} m`)
  })
})
