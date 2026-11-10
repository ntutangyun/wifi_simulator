/**
 * `@uwb-sensing`, in the standard-first shape (2026-11-10).
 *
 * ① says IEEE Std 802.15.4-2024 defines no sensing, names where the P802.15.4ab draft and the
 * TG4ab consensus proposal put it, and gives the ranging side's one RMARKER receive time per
 * RFRAME. ② says the echo model is the simulator's own channel model, and the rows are checked
 * against the engine. Every figure the labs and the summary print is read back out of the lesson
 * and compared with a run — the echo records, the direct path `UwbChannel` computes, and the
 * ranges of the scene with nothing in the room.
 */
import { describe, expect, it } from 'vitest'
import { PAIR_SPAN_M, uwbSensing, type UwbSensingVariant } from '../../src/course/uwb/uwb-sensing'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { EventQueue } from '../../src/engine/events'
import { directDelayNs } from '../../src/engine/scatter'
import { NEW_SCATTERER_EXTRA_LOSS_DB } from '../../src/editor/planOps'
import { makeEmitter } from '../../src/model/records'
import type { TLRecord } from '../../src/model/records'
import type { Scenario } from '../../src/model/scenario'
import type { Ns } from '../../src/model/types'
import { UwbChannel } from '../../src/uwb/channel'
import { C_M_PER_NS, UWB_CHIP_HZ, UWB_CHIP_NS } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const ANC = 'anc-1'
const TAG = 'tag-1'
const V: Record<Exclude<UwbSensingVariant, 'base'>, number> = { nearLine: 0, empty: 1 }

const scenarioOf = (v: UwbSensingVariant): Scenario =>
  v === 'base' ? uwbSensing.scenario() : uwbSensing.variants![V[v]].scenario()
const recs = (v: UwbSensingVariant): TLRecord[] => runOf(uwbSensing, v === 'base' ? undefined : V[v], RUN_NS)
type Echo = Extract<TLRecord, { type: 'UWB_ECHO' }>
const echoes = (v: UwbSensingVariant): Echo[] => ofType(recs(v), 'UWB_ECHO')

/** The direct path's level, from `UwbChannel` itself. */
function directDbm(sc: Scenario): number {
  const q = new EventQueue()
  const now = (): Ns => 0 as Ns
  const ch = new UwbChannel(q, now, sc.nodes, sc.walls, sc.uwb!, () => 0, makeEmitter(() => {}), null, undefined)
  return ch.rssiDbm(TAG, ANC)
}
function directNs(sc: Scenario): number {
  const pos = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
  return directDelayNs(pos(TAG), pos(ANC))
}
const dbm = (x: number): string => `${x.toFixed(1).replace('-', '−')} dBm`
const rangeLine = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): string =>
  [r.t, r.node, r.peer, r.distM, r.trueDistM, r.method, r.fom, r.block, r.round].join('|')

const lab = (heading: string): Lab => {
  const l = uwbSensing.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbSensing.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(uwbSensing, { runNs: RUN_NS })

describe('uwb-sensing · the lesson', () => {
  it('is in the standard-first shape, in the sensing module', () => {
    expect(isStandardFirst(uwbSensing)).toBe(true)
    expect(uwbSensing.module).toBe(27)
    expect(uwbSensing.needs).toEqual(['uwb-dstwr', 'uwb-geometry'])
    expect(uwbSensing.terms!.map((t) => t.term)).toEqual(['scatterer', 'echo', 'bistatic range', 'sensing'])
    expect(uwbSensing.limits).toEqual([])
    expect(uwbSensing.observe).toEqual([])
    expect(uwbSensing.tryThis).toEqual([])
  })

  it('① says the standard has no sensing, names the draft clause and the proposal, and cites the ranging clauses', () => {
    const std = uwbSensing.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const s of ['没有定义感知', '第 10.40 条', '15-26/0179r1', '15-23/0284r1', '§10.29.1.1', '§10.29.5', '表 8-28']) expect(std, s).toContain(s)
    for (const sim of ['回波', '散射体', '衣柜', '首径']) expect(std, sim).not.toContain(sim)
  })

  it('② is not all faithful: the draft\'s sensing procedure is absent', () => {
    expect(uwbSensing.implementation!.filter((r) => r.kind !== 'faithful').length).toBe(uwbSensing.implementation!.length)
    expect(implRow('感知过程').kind).toBe('absent')
  })
})

describe('uwb-sensing · ② says what the engine does, and the engine does it', () => {
  it('one echo per transmission per receiver: the transmitter never hears its own', () => {
    // a double-sided round is four PPDUs and there are two devices: each frame has one receiver
    expect(echoes('base')).toHaveLength(4 * BLOCKS)
    const tx = ofType(recs('base'), 'TX_START')
    for (const e of echoes('base')) expect(e.node).not.toBe(tx.filter((r) => r.t <= e.t).at(-1)!.node)
  })

  it('the level: two legs, the aperture taken back once, and the wardrobe\'s −10 dB', () => {
    expect(NEW_SCATTERER_EXTRA_LOSS_DB).toBe(-10)
    expect(implRow('回波的电平').sim).toContain('衣柜取 −10 dB')
    expect(implRow('回波的电平').sim).toContain('10·log10(4π/λ²)')
    for (const v of ['base', 'nearLine'] as UwbSensingVariant[]) {
      for (const s of scenarioOf(v).scatterers!) expect(s.extraLossDb).toBe(NEW_SCATTERER_EXTRA_LOSS_DB)
    }
  })

  it('ranging locks the first path: the object adds no reception and moves no range', () => {
    const rx = (v: UwbSensingVariant) => recs(v).filter((r) => r.type === 'RX_START' || r.type === 'RX_OK').length
    expect(rx('base')).toBe(rx('empty'))
    expect(rx('nearLine')).toBe(rx('empty'))
  })

  it('the resolution threshold is one chip of §16.2.4, c × Tc', () => {
    expect(UWB_CHIP_HZ).toBe(499.2e6)
    const resM = C_M_PER_NS * UWB_CHIP_NS
    expect(implRow('分辨门限').sim).toContain(`超过 ${resM.toFixed(2)} m`)
    for (const e of echoes('base')) expect(e.resolutionM).toBeCloseTo(resM, 12)
  })
})

describe('uwb-sensing · ③ every figure the labs and the summary print is the run', () => {
  it('lab 1: the two arrivals of one transmission, and the instants and counts the reader is sent to', () => {
    const l = lab('一次发送，两个到达')
    const rows = tableOf(l, '本课场景，一次发送的两个到达').rows
    const sc = scenarioOf('base')
    const e = echoes('base')[0]
    expect(e.scattererId).toBe('wardrobe')
    for (const x of echoes('base')) expect([x.pathM, x.rssiDbm]).toEqual([e.pathM, e.rssiDbm])
    const direct = directDbm(sc)
    expect(rows[0].slice(1)).toEqual([`${PAIR_SPAN_M.toFixed(2)} m`, `${directNs(sc).toFixed(2)} ns`, dbm(direct)])
    expect(rows[1].slice(1)).toEqual([`${e.pathM.toFixed(2)} m`, `${e.propNs.toFixed(2)} ns`, dbm(e.rssiDbm)])
    expect(rows[2][1]).toBe(`${e.excessM.toFixed(2)} m`)
    expect(rows[2][2]).toBe(`${(Number(e.propNs.toFixed(2)) - Number(directNs(sc).toFixed(2))).toFixed(2)} ns`)
    expect(rows[2][3]).toBe(`${(direct - e.rssiDbm).toFixed(1)} dB`)
    // 「回波记录落在第 10 纳秒，同一次发送的直达路径落在第 7 纳秒」
    expect(l.expect).toContain(`回波记录落在第 ${e.t % (2 * MS)} 纳秒`)
    expect(l.expect).toContain(`直达路径落在第 ${Math.ceil(directNs(sc))} 纳秒`)
    expect(e.t % (2 * MS)).toBe(Math.ceil(e.propNs))
    // the two legs and their sum
    const leg = Math.hypot(PAIR_SPAN_M / 2, 1)
    expect(l.expect).toContain(`两段各 √(1² + 1²) = ${leg.toFixed(2)} 米，合计 ${e.pathM.toFixed(2)} 米，比直线长 ${e.excessM.toFixed(2)} 米`)
    expect((2 * leg).toFixed(2)).toBe(e.pathM.toFixed(2))
    expect(l.expect).toContain(`七个块共 ${echoes('base').length} 条`)
  })

  it('lab 2: later in both places, 1.0 dB under the direct ray at 1 m and 4.7 dB over it at 0.2 m', () => {
    const l = lab('更晚是定理，更弱不是')
    expect(uwbSensing.variants![l.variant!].label).toBe('把它移到连线附近')
    const rows = tableOf(l, '同一个衣柜，两个位置').rows
    const direct = directDbm(scenarioOf('base'))
    expect(directDbm(scenarioOf('nearLine'))).toBe(direct)
    const cases: [UwbSensingVariant, number, string][] = [['base', 0, '1.0'], ['nearLine', 1, '0.2']]
    for (const [v, i, offM] of cases) {
      const e = echoes(v)[0]
      const sObj = scenarioOf(v).scatterers![0]
      expect((sObj.pos.y - scenarioOf(v).nodes.find((n) => n.id === ANC)!.pos.y).toFixed(1)).toBe(offM)
      expect(rows[i][0]).toBe(`${offM} m`)
      expect(rows[i][1]).toBe(`${e.excessM.toFixed(2)} m`)
      expect(rows[i][2]).toBe(dbm(e.rssiDbm))
      expect(rows[i][3]).toBe(`${e.rssiDbm < direct ? '低' : '高'} ${Math.abs(direct - e.rssiDbm).toFixed(1)} dB`)
      for (const x of echoes(v)) expect(x.propNs, v).toBeGreaterThan(directNs(scenarioOf(v)))
    }
    const over = (echoes('nearLine')[0].rssiDbm - direct).toFixed(1)
    expect(l.expect).toContain(`回波反而比直达路径高 ${over} dB`)
    // the summary quotes both figures
    expect(uwbSensing.why).toContain(`比直达路径低 ${(direct - echoes('base')[0].rssiDbm).toFixed(1)} dB`)
    expect(uwbSensing.why).toContain(`反而高 ${over} dB`)
  })

  it('lab 3: no echo in the empty room, and the same 14 ranges field for field', () => {
    const l = lab('测距不受回波影响')
    expect(uwbSensing.variants![l.variant!].label).toBe('房间里空无一物')
    expect(echoes('empty')).toHaveLength(0)
    const without = ofType(recs('empty'), 'UWB_RANGE').map(rangeLine)
    expect(l.expect).toContain(`两个场景的 ${without.length} 个距离逐字相同`)
    expect(ofType(recs('base'), 'UWB_RANGE').map(rangeLine)).toEqual(without)
    expect(ofType(recs('nearLine'), 'UWB_RANGE').map(rangeLine)).toEqual(without)
  })
})
