/**
 * `@uwb-acquisition`, in the standard-first shape (2026-11-10).
 *
 * ① teaches the standard's SHR (§16.2.6), the draft's UWB-driven MMS packet and the proposal
 * 15-25/0066r1 — its problem statement and the RSF with SFD bit, adoption unconfirmed. ② says how
 * the engine implements it, including the acquisition rule the engine chose and audit #18 (an SP0
 * control phase is treated as having acquired, a differs row).
 *
 * Every figure the labs print is read back out of the lesson text here and compared with a run or
 * with the engine's own constants.
 */
import { describe, expect, it } from 'vitest'
import {
  ACQ_6G_CENTER_MHZ, ACQ_HEARD, ACQ_N_MSR, EDGE_ANCHOR_X, EDGE_TAG_X,
  uwbAcquisition, uwbAcquisitionScenario, uwbAcquisitionTiming,
} from '../../src/course/uwb/uwb-acquisition'
import { DEFAULT_UWB_SESSION, ScenarioSchema, UwbMmsSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import {
  MMRS_LEN, MMS_RSF_SFD_N_MSR, MMS_SP0_SEGMENT_NS, MMS_SPREAD, UWB_MS_BUDGET_NJ,
  combineGainDb, mmsFragmentDbm, rsfAirNs, rsfChips, rsfNs,
} from '../../src/uwb/mms'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'
import { UWB_SIR_MIN_DB } from '../../src/uwb/phy'
import { LESSON_6G_WIDTH_MHZ, isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { fmtRecord } from '../../src/ui/format'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven ranging blocks — the window the lesson's tables are counted over. */
const RUN_NS = 1300 * MS
/** Three blocks: the edge scene has six trains, which is the whole claim. */
const EDGE_NS = 450 * MS
const SFD = 0
const NBA = 1
const CLEAR = 2
const EDGE = 3

const recs = (v?: number) => runOf(uwbAcquisition, v, RUN_NS)
const trains = (v?: number) => ofType(recs(v), 'UWB_MMS_TRAIN')
const ms3 = (ns: number): string => (ns / MS).toFixed(3)
const minus = (x: number, d: number): string => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const at = (v: number | undefined, ms: number) => {
  const t = trains(v).find((x) => Math.abs(x.t - ms * MS) < MS / 2)
  expect(t, `train at ${ms} ms`).toBeDefined()
  return t!
}

const PHY = { ...DEFAULT_UWB_SESSION.mms, nMsr: ACQ_N_MSR }
const FRAG_NS = rsfAirNs({ ...PHY, rsfSfd: false })
const SFD_FRAG_NS = rsfAirNs({ ...PHY, rsfSfd: true })
const SFD_COST_DB = mmsFragmentDbm(SFD_FRAG_NS) - mmsFragmentDbm(FRAG_NS)

const side = new Map<string, TLRecord[]>()
const recordsOf = (sc: Scenario, ns: number): TLRecord[] => {
  const k = `${ns}|${JSON.stringify(sc)}`
  if (!side.has(k)) side.set(k, [...new Simulation(sc).runUntil(ns).records])
  return side.get(k)!
}
const edgeWithout = (): Scenario => {
  const sc = uwbAcquisitionScenario('edge')
  return { ...sc, uwb: { ...sc.uwb!, mms: { ...sc.uwb!.mms, rsfSfd: false } } }
}

const lab = (heading: string): Lab => {
  const l = uwbAcquisition.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbAcquisition.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbAcquisition.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(uwbAcquisition, { runNs: RUN_NS })

describe('uwb-acquisition · the lesson', () => {
  it('is in the standard-first shape, right after uwb-uwbd', () => {
    expect(isStandardFirst(uwbAcquisition)).toBe(true)
    expect(MODULES[uwbAcquisition.module].title).toBe('另一种控制面与子轮')
    expect(COURSE_ORDER.indexOf('uwb-acquisition')).toBe(COURSE_ORDER.indexOf('uwb-uwbd') + 1)
    expect(uwbAcquisition.needs).toEqual(['uwb-uwbd', 'uwb-mms-numbers'])
    expect([uwbAcquisition.limits, uwbAcquisition.observe, uwbAcquisition.tryThis]).toEqual([[], [], []])
    const all = [uwbAcquisition.scenario(), ...uwbAcquisition.variants!.map((v) => v.scenario())]
    for (const sc of all) expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  })

  it('① names the standard clauses, the proposal and its status, and both conditions', () => {
    const std = stdText()
    for (const s of ['§16.2.6', '图 16-5', '§16.2.6.2', '§16.2.6.3', 'P802.15.4ab', '15-25/0066r1', '采纳状态未确认', '§10.38.9.3.10', 'phyUwbMmsRsfSfd']) {
      expect(std, s).toContain(s)
    }
    expect(std).toContain('Sequence Code Index 为 9–32，且 RSF 片段长度为 32 或 64')
    expect(MMS_RSF_SFD_N_MSR.map(String)).toEqual(['32', '64'])
  })
})

describe('uwb-acquisition · ② says what the engine does, and the engine does it', () => {
  it('is not all faithful, and audit #18 is a differs row', () => {
    expect(implRow('有 SP0 控制阶段时').kind).toBe('differs')
    expect(implRow('RSF with SFD').kind).toBe('faithful')
  })

  it('the editor refuses the attribute off the two fragment lengths', () => {
    const mms = uwbAcquisitionScenario('sfd').uwb!.mms
    expect([mms.nMsr, mms.rsfSfd, mms.control, mms.uwbdControl]).toEqual([ACQ_N_MSR, true, 'uwbd', 'none'])
    expect(UwbMmsSchema.safeParse({ ...mms, nMsr: 40 }).success).toBe(false)
  })

  it('the SFD length, the fragment before and after, and the 46 400 ns a train', () => {
    const sim = implRow('SFD 的时长').sim
    const sfdNs = SFD_FRAG_NS - FRAG_NS
    expect(sfdNs).toBe(MMS_SP0_SEGMENT_NS.sfd)
    expect(stdText().length).toBeGreaterThan(0)
    expect(implRow('SFD 的时长').standard).toContain(`${(sfdNs / 1000).toFixed(1)} µs`)
    expect(sim).toContain(`取 ${sfdNs.toLocaleString('en').replace(',', ' ')} ns`)
    expect(sim).toContain(`从 ${(FRAG_NS / 1000).toFixed(3)} µs 变为 ${(SFD_FRAG_NS / 1000).toFixed(3)} µs`)
    expect(sim).toContain(`多占 ${(8 * sfdNs).toLocaleString('en').replace(',', ' ')} ns`)
    // the round does not move by a nanosecond
    const bounds = (rs: TLRecord[]) => rs.filter((r) => r.type === 'UWB_ROUND' || r.type === 'UWB_ROUND_END').map((r) => [r.type, r.t])
    expect(bounds(recs(SFD))).toEqual(bounds(recs()))
  })

  it('the peak-power cost, both fragment lengths, from the energy budget', () => {
    const sim = implRow('片段的峰值功率').sim
    expect(sim).toContain(`${UWB_MS_BUDGET_NJ} nJ`)
    expect(sim).toContain(`从 ${minus(mmsFragmentDbm(FRAG_NS), 3)} dBm 降到 ${minus(mmsFragmentDbm(SFD_FRAG_NS), 3)} dBm，低 ${(-SFD_COST_DB).toFixed(3)} dB`)
    const p32 = { ...DEFAULT_UWB_SESSION.mms, nMsr: 32 as const }
    const c32 = mmsFragmentDbm(rsfAirNs({ ...p32, rsfSfd: false })) - mmsFragmentDbm(rsfAirNs({ ...p32, rsfSfd: true }))
    expect(sim).toContain(`32 长的片段低 ${c32.toFixed(3)} dB`)
  })

  it('acquisition: −93 dBm on one fragment; interference: −12 dB SIR', () => {
    expect(implRow('捕获判定').sim).toContain(`${minus(UWB_RX_SENS_DBM, 0)} dBm`)
    expect(implRow('Wi-Fi 干扰').sim).toContain(`${minus(UWB_SIR_MIN_DB, 0)} dB`)
  })

  it('the RMARKER does not move: on the interference-free scene, every stamp and range is the same', () => {
    const clear = uwbAcquisitionScenario('clear')
    const withSfd: Scenario = { ...clear, uwb: { ...clear.uwb!, mms: { ...clear.uwb!.mms, rsfSfd: true } } }
    const stamps = (sc: Scenario) => recordsOf(sc, RUN_NS).filter((r) => r.type === 'UWB_TS').map((r) => [r.t, r.node, r.counter])
    expect(stamps(withSfd)).toEqual(stamps(clear))
    expect(stamps(clear).length).toBeGreaterThan(0)
  })
})

describe('uwb-acquisition · ③ every figure the labs print is the run', () => {
  it('lab 1: the interference line as the log prints it, and the fragment level', () => {
    const l = lab('一个片段被 Wi-Fi 干扰而丢失')
    const m = /([\d.]+) ms 写着 “([^”]+)”：干扰有 −([\d.]+) dBm，而一个片段只有 −([\d.]+) dBm/.exec(l.expect)
    expect(m).not.toBeNull()
    const first = ofType(recs(), 'UWB_INTERFERED')[0]
    expect(fmtRecord(first)).toBe(m![2])
    expect(m![1]).toBe(ms3(first.t))
    expect(`-${m![3]}`).toBe(first.foreignDbm.toFixed(1))
    expect(`-${m![4]}`).toBe(trains()[0].rxDbm.toFixed(2))
    const rows = tableOf(l, '这个房间').rows
    const sc = uwbAcquisition.scenario()
    const p = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
    expect(rows[0][1]).toBe(`${Math.hypot(p('tag-1').x - p('anchor-1').x, p('tag-1').y - p('anchor-1').y).toFixed(2)} m`)
    expect(rows[1][1]).toBe(`${ACQ_6G_CENTER_MHZ} MHz · ${LESSON_6G_WIDTH_MHZ} MHz，整条在测距信道之内`)
    const gap = DEFAULT_UWB_SESSION.mms.gap
    expect(rows[2][1]).toBe(`${ACQ_N_MSR} × ${MMS_SPREAD} × (${MMRS_LEN} + 2 × ${gap}) = ${rsfChips(ACQ_N_MSR, gap).toLocaleString('en').replace(',', ' ')} 码片（chip） · ${(rsfNs(ACQ_N_MSR, gap) / 1000).toFixed(3)} µs`)
    expect(rows[3][1]).toBe(`${minus(trains()[0].rxDbm, 2)} dBm`)
  })

  it('lab 2: the discarded train — its count, margin, verdict and the fragments it heard', () => {
    const l = lab('余量充足，整列却作废')
    const m = /([\d.]+) ms 那一行收到 (\d)\/(\d)、余量 ([\d.]+) dB，结论却是 lost；收到的是片段 ([\d, ]+)，片段 0 没有到达/.exec(l.expect)
    expect(m).not.toBeNull()
    const firstLost = trains().find((t) => !t.detected)!
    expect(m![1]).toBe(ms3(firstLost.t))
    expect([firstLost.heard, firstLost.fragments].map(String)).toEqual([m![2], m![3]])
    expect(firstLost.marginDb.toFixed(1)).toBe(m![4])
    const heardAt = recs().filter((r) => r.type === 'RX_OK' && r.node === 'anchor-1' && r.frame.kind === 'uwbRsf'
      && r.t >= 200 * MS && r.t < 212 * MS).map((r) => Math.round((r.t - 200 * MS) / MS))
    expect(heardAt).toEqual([...ACQ_HEARD])
    expect(m![5]).toBe(ACQ_HEARD.join(', '))
    // the formula: five fragments combined clear the threshold
    const f = l.blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    expect(f.text).toContain(`${minus(firstLost.rxDbm, 2)} dBm + 10·log10(${firstLost.heard}) = ${minus(firstLost.rxDbm + combineGainDb(firstLost.heard), 2)} dBm ≥ ${minus(UWB_RX_SENS_DBM, 0)} dBm`)
  })

  it('lab 2: the figure lays the same indices, and the SFD lane one SFD longer', () => {
    const spec = uwbAcquisitionTiming()
    expect(spec.lanes[0].spans.filter((s) => s.tone === 'muted').map((s) => s.fromUs / 1000)).toEqual([0, 1, 2, 3, 6])
    expect(spec.lanes[2].spans.map((s) => s.fromUs / 1000)).toEqual([...ACQ_HEARD])
    for (const s of spec.lanes[2].spans) expect(s.toUs - s.fromUs).toBeCloseTo(SFD_FRAG_NS / 1000, 6)
  })

  it('lab 3: the four scenes, cell for cell', () => {
    const rows = tableOf(lab('每个 RSF 带 SFD'), '四个场景，同一个房间').rows
    const heard = (v?: number) => trains(v).map((t) => t.heard).join(',')
    const cells = (v?: number) => [`${trains(v).filter((t) => t.detected).length} / ${trains(v).length}`, String(ofType(recs(v), 'UWB_RANGE').length)]
    expect(rows[0][1]).toBe(heard())
    expect(heard(SFD)).toBe(heard())
    expect(rows[1][1]).toBe('与上一行完全相同的十四组')
    expect(trains().length).toBe(14)
    expect(rows[2][1]).toBe(heard(NBA))
    expect(rows[3][1]).toBe(heard(CLEAR))
    for (const [i, v] of [undefined, SFD, NBA, CLEAR].entries()) expect(rows[i].slice(2), String(v)).toEqual(cells(v))
  })

  it('lab 3: the same row with the attribute on, and the band of the seven discarded trains', () => {
    const e = lab('每个 RSF 带 SFD').expect
    const m = /置 1 之后 ([\d.]+) ms 那一行收到的还是 (\d)\/8，余量低了 ([\d.]+) dB（([\d.]+) dB，不是 ([\d.]+) dB），结论变为检出/.exec(e)
    expect(m).not.toBeNull()
    const base = at(undefined, Number(m![1]))
    const sfd = at(SFD, Number(m![1]))
    expect([String(sfd.heard), String(base.heard)]).toEqual([m![2], m![2]])
    expect(sfd.marginDb.toFixed(1)).toBe(m![4])
    expect(base.marginDb.toFixed(1)).toBe(m![5])
    expect((base.marginDb - sfd.marginDb).toFixed(2)).toBe(m![3])
    expect([base.detected, sfd.detected]).toEqual([false, true])
    const lost = trains().filter((t) => !t.detected)
    expect(e).toContain(`被丢弃的${['', '一', '二', '三', '四', '五', '六', '七', '八'][lost.length]}列`)
    const margins = lost.map((t) => t.marginDb)
    expect(e).toContain(`余量在 ${Math.min(...margins).toFixed(1)} 到 ${Math.max(...margins).toFixed(1)} dB 之间`)
    // and the why's 「19 dB 以上」 is the floor of that band (2026-11-11: re-measured after W6)
    expect(Math.min(...margins)).toBeGreaterThan(19)
    expect(uwbAcquisition.why).toContain('19 dB 以上')
  })

  it('lab 4: the cost table, both fragment lengths', () => {
    const rows = tableOf(lab('余量小于代价的链路'), '这个设置的代价：两个允许的片段长度').rows
    for (const [i, n] of [[0, 64], [1, 32]] as const) {
      const p = { ...DEFAULT_UWB_SESSION.mms, nMsr: n }
      const off = rsfAirNs({ ...p, rsfSfd: false })
      const on = rsfAirNs({ ...p, rsfSfd: true })
      expect(rows[i].slice(1)).toEqual([
        `${(off / 1000).toFixed(3)} µs`, `${(on / 1000).toFixed(3)} µs`,
        `${minus(mmsFragmentDbm(off), 3)} → ${minus(mmsFragmentDbm(on), 3)} dBm，低 ${(mmsFragmentDbm(off) - mmsFragmentDbm(on)).toFixed(3)} dB`,
      ])
    }
    expect(uwbAcquisition.why).toContain(`峰值就低 ${(-SFD_COST_DB).toFixed(3)} dB`)
  })

  it('lab 4: the edge link — its level, its margin, both verdicts and the timestamps', () => {
    const l = lab('余量小于代价的链路')
    const rows = tableOf(l, '隔着两道砖墙的 5.40 m').rows
    expect(Math.abs(EDGE_TAG_X - EDGE_ANCHOR_X).toFixed(2)).toBe('5.40')
    const off = ofType(recordsOf(edgeWithout(), EDGE_NS), 'UWB_MMS_TRAIN')
    const on = ofType(runOf(uwbAcquisition, EDGE, EDGE_NS), 'UWB_MMS_TRAIN')
    expect(rows[0][1]).toBe(`${minus(off[0].rxDbm, 2)} dBm，灵敏度 ${minus(UWB_RX_SENS_DBM, 0)} dBm`)
    expect(rows[1][1]).toBe(`${(off[0].rxDbm - UWB_RX_SENS_DBM).toFixed(2)} dB，比 SFD 的 ${(-SFD_COST_DB).toFixed(3)} dB 还小`)
    const zh = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
    const stampsOff = recordsOf(edgeWithout(), EDGE_NS).filter((r) => r.type === 'UWB_TS')
    const stampsOn = runOf(uwbAcquisition, EDGE, EDGE_NS).filter((r) => r.type === 'UWB_TS')
    expect(off.every((t) => t.detected)).toBe(true)
    expect(on.every((t) => !t.detected)).toBe(true)
    expect(rows[2][1]).toBe(`${zh[off.length]}列全部捕获，${zh[stampsOff.length]}条时间戳`)
    expect(rows[3][1]).toBe(`${zh[on.length]}列没有一列捕获，没有接收时间戳`)
    expect(stampsOn.filter((r) => r.type === 'UWB_TS' && r.dir === 'rx')).toHaveLength(0)
    expect(on.every((t) => t.heard === t.fragments && t.fragments === 8)).toBe(true)
    expect(l.expect).toContain(`${zh[on.length]}列片段每列都收到 8/8`)
    // no range either way
    expect(ofType(recordsOf(edgeWithout(), EDGE_NS), 'UWB_RANGE')).toHaveLength(0)
    expect(ofType(runOf(uwbAcquisition, EDGE, EDGE_NS), 'UWB_RANGE')).toHaveLength(0)
  })

  it('the why: seven of fourteen thrown away, and ranges 3 → 6', () => {
    const w = uwbAcquisition.why!
    expect(w).toContain(`距离从 ${ofType(recs(), 'UWB_RANGE').length} 个增加到 ${ofType(recs(SFD), 'UWB_RANGE').length} 个`)
    expect(w).toContain(`没有到 ${trains().length} 个`)
    expect(w).toContain('十四列片段中有七列')
    expect([trains().length, trains().filter((t) => !t.detected).length]).toEqual([14, 7])
  })
})
