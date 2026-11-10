/**
 * `@uwb-acquisition`, in the standard-first shape (2026-11-10).
 *
 * ① teaches the standard's SHR (§16.2.6), the draft's UWB-driven MMS packet and the proposal
 * 15-25/0066r1 — its problem statement, and its RSF with SFD bit, whose CID 963 was withdrawn
 * (15-25/0082r8). ② (2026-11-11, W5, audit #18): with an SP0 control phase the packet's leading
 * SYNC+SFD fragment still has to be acquired, and the withdrawn attribute is gone.
 *
 * Every figure the labs print is read back out of the lesson text here and compared with a run or
 * with the engine's own constants.
 */
import { describe, expect, it } from 'vitest'
import {
  ACQ_6G_CENTER_MHZ, ACQ_HEARD, ACQ_N_MSR,
  uwbAcquisition, uwbAcquisitionScenario, uwbAcquisitionTiming,
} from '../../src/course/uwb/uwb-acquisition'
import { DEFAULT_UWB_SESSION, ScenarioSchema } from '../../src/model/scenario'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { MMRS_LEN, MMS_SPREAD, combineGainDb, rsfChips, rsfNs } from '../../src/uwb/mms'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'
import { UWB_SIR_MIN_DB } from '../../src/uwb/phy'
import { LESSON_6G_WIDTH_MHZ, isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { fmtRecord } from '../../src/ui/format'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven ranging blocks — the window the lesson's tables are counted over. */
const RUN_NS = 1300 * MS
const SP0 = 0
const NBA = 1
const CLEAR = 2

const recs = (v?: number) => runOf(uwbAcquisition, v, RUN_NS)
const trains = (v?: number) => ofType(recs(v), 'UWB_MMS_TRAIN')
const ms3 = (ns: number): string => (ns / MS).toFixed(3)
const minus = (x: number, d: number): string => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`
const at = (v: number | undefined, ms: number) => {
  const t = trains(v).find((x) => Math.abs(x.t - ms * MS) < MS / 2)
  expect(t, `train at ${ms} ms`).toBeDefined()
  return t!
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

  it('① names the standard clauses, the proposal, and the withdrawal of CID 963', () => {
    const std = stdText()
    for (const s of ['§16.2.6', '图 16-5', '§16.2.6.2', '§16.2.6.3', 'P802.15.4ab', '15-25/0066r1', '15-25/0194r0',
      '15-25/0082r8', 'CID 963', '已由提出者撤回', '§10.38.9.3.10', 'phyUwbMmsRsfSfd']) {
      expect(std, s).toContain(s)
    }
  })
})

describe('uwb-acquisition · ② says what the engine does, and the engine does it', () => {
  // 2026-11-11 (audit #18): the SP0 path judges the leading fragment like the zero-length one.
  it('the SP0 control phase is faithful now, and the withdrawn attribute is absent', () => {
    expect(implRow('有 SP0 控制阶段时').kind).toBe('faithful')
    expect(implRow('RSF 附加 SFD').kind).toBe('absent')
    const mms = uwbAcquisitionScenario('sp0').uwb!.mms as unknown as Record<string, unknown>
    expect([mms.control, mms.uwbdControl]).toEqual(['uwbd', 'sp0'])
    expect('rsfSfd' in mms).toBe(false)
  })

  it('acquisition: −93 dBm on one fragment; interference: −12 dB SIR', () => {
    expect(implRow('捕获判定').sim).toContain(`${minus(UWB_RX_SENS_DBM, 0)} dBm`)
    expect(implRow('Wi-Fi 干扰').sim).toContain(`${minus(UWB_SIR_MIN_DB, 0)} dB`)
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

  it('lab 2: the figure lays the same indices, and the one opener', () => {
    const spec = uwbAcquisitionTiming()
    expect(spec.lanes[0].spans.filter((s) => s.tone === 'muted').map((s) => s.fromUs / 1000)).toEqual([0, 1, 2])
    expect(spec.lanes[1].spans.map((s) => s.fromUs / 1000)).toEqual([0])
    for (const l of spec.lanes) for (const s of l.spans) expect(s.toUs - s.fromUs).toBeCloseTo(rsfNs(ACQ_N_MSR, DEFAULT_UWB_SESSION.mms.gap) / 1000, 6)
  })

  it('lab 3: the four scenes, cell for cell', () => {
    const rows = tableOf(lab('带上 SP0 控制包也一样'), '四个场景，同一个房间').rows
    const heard = (v?: number) => trains(v).map((t) => t.heard).join(',')
    const cells = (v?: number) => [`${trains(v).filter((t) => t.detected).length} / ${trains(v).length}`, String(ofType(recs(v), 'UWB_RANGE').length)]
    expect(trains().length).toBe(14)
    for (const [i, v] of [undefined, SP0, NBA, CLEAR].entries()) {
      expect(rows[i][1], String(v)).toBe(heard(v))
      expect(rows[i].slice(2), String(v)).toEqual(cells(v))
    }
  })

  it('lab 3: SP0 received, the head lost, and the train still thrown away', () => {
    const e = lab('带上 SP0 控制包也一样').expect
    const m = /带 SP0 控制相位时 ([\d.]+) ms 那一行收到 (\d)\/8、余量 ([\d.]+) dB，结论仍是 lost/.exec(e)
    expect(m).not.toBeNull()
    const t = at(SP0, Number(m![1]))
    expect(String(t.heard)).toBe(m![2])
    expect(t.marginDb.toFixed(1)).toBe(m![3])
    expect(t.detected).toBe(false)
    // the SP0 POLL of that round did arrive at the anchor, so priming was not what failed
    const rs = recs(SP0)
    const pollOk = rs.filter((r) => r.type === 'RX_OK' && r.node === 'anchor-1' && r.frame.kind === 'uwbSp0' && r.t < t.t)
    expect(pollOk.length).toBeGreaterThan(0)
    // complete SP0 exchanges: blocks where the tag received the anchor's RESP
    const resp = new Set(rs.filter((r) => r.type === 'RX_OK' && r.node === 'tag-1' && r.frame.kind === 'uwbSp0'
      && r.frame.uwb?.sp0?.role === 'resp').map((r) => Math.floor(r.t / (200 * MS))))
    const zh = ['零', '一', '二', '三', '四', '五', '六', '七']
    expect(e).toContain(`七个块里只有${zh[resp.size]}轮的 SP0 一问一答完整成功`)
    expect(e).toContain(`八列片段检出${zh[trains(SP0).filter((x) => x.detected).length]}列`)
    expect(trains(SP0).length).toBe(8)
    expect(ofType(rs, 'UWB_RANGE')).toHaveLength(0)
  })

  it('the why: seven of fourteen thrown away, the 22 dB floor, 3 ranges, and none with SP0', () => {
    const w = uwbAcquisition.why!
    const lost = trains().filter((t) => !t.detected)
    expect([trains().length, lost.length]).toEqual([14, 7])
    expect(w).toContain('十四列片段中有七列')
    expect(Math.min(...lost.map((t) => t.marginDb))).toBeGreaterThan(22)
    expect(w).toContain('22 dB 以上')
    expect(w).toContain(`1.3 秒只得到 ${ofType(recs(), 'UWB_RANGE').length} 个距离`)
    expect(w).toContain(`八列里只检出三列`)
    expect(w).toContain(`全部 ${ofType(recs(NBA), 'UWB_RANGE').length} 个距离`)
  })
})
