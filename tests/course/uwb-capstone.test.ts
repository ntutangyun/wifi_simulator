/**
 * `@uwb-capstone`, in the standard-first shape (2026-11-10).
 *
 * ① teaches what IEEE Std 802.15.4-2024 specifies for the brief — ranging blocks, one-to-many
 * DS-TWR, the Ranging FoM, and AoA only as a request and a report (RMI IE §10.29.8.4, SRRR IE
 * §10.32.9.9; no measurement method, and nothing in chapter 16) — and that positioning is not in the
 * standard and MMS is a draft. ② says what this simulator chose for each gap.
 *
 * Every figure the labs print is read back out of the lesson text here and compared with a run.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHOR_Z, CAPSTONE_ANCHORS, FAR_ANCHOR, FAST_BLOCK_RSTU, TAG_POS, TAG_Z,
  uwbCapstone, uwbCapstoneScenario,
} from '../../src/course/uwb/uwb-capstone'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { C_M_PER_NS, FOM_LOS, FOM_NLOS, UWB_NLOS_NS, UWB_SIR_MIN_DB, rstuNs } from '../../src/uwb/phy'
import { solvePosition } from '../../src/uwb/position'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** The window every UWB lesson measures over: seven 200 ms blocks. */
const RUN_NS = 1300 * MS
const TAG = 'uwb-1'
const ANCHORS = CAPSTONE_ANCHORS.map((a) => a.id)
const V_FAR = 0
const V_FAST = 1
const V_OTM = 2

const recs = (variant?: number): TLRecord[] => runOf(uwbCapstone, variant, RUN_NS)
const count = (variant: number | undefined, type: TLRecord['type']): number => recs(variant).filter((r) => r.type === type).length
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const UWB_NODES = new Set([...ANCHORS, TAG])
const onAir = (variant?: number) => {
  const tx = ofType(recs(variant), 'TX_START').filter((r) => UWB_NODES.has(r.node))
  return { n: tx.length, ms: (tx.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS).toFixed(1) }
}
const threeRange = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
  .filter((f) => f.anchors.length === 3)
  .map((f) => ({ f, err: Math.hypot(f.x - f.trueX, f.y - f.trueY) }))
const signed = (x: number): string => `${x > 0 ? '+' : x < 0 || Object.is(x, -0) || x.toFixed(2) === '-0.00' ? '−' : ''}${Math.abs(x).toFixed(2)}`
const hex = (b: number): string => `0x${b.toString(16)}`

const lab = (heading: string): Lab => {
  const l = uwbCapstone.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbCapstone.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbCapstone.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** anchor-3's mean error, and the block-0 fix re-solved with it taken off. */
const bias = (): number => mean(ofType(recs(), 'UWB_RANGE').filter((r) => r.node === TAG && r.peer === 'anchor-3').map((r) => r.distM - r.trueDistM))
const corrected = (): number => {
  const ranges = ofType(recs(), 'UWB_RANGE').filter((r) => r.node === TAG)
  const inBlock = ranges.filter((r) => r.block === threeRange()[0].f.block)
  expect(inBlock).toHaveLength(3)
  const fix = solvePosition(
    CAPSTONE_ANCHORS.map((a) => ({ id: a.id, x: a.x, y: a.y, z: ANCHOR_Z })),
    inBlock.map((r) => ({ id: r.peer, distM: r.distM - (r.peer === 'anchor-3' ? bias() : 0) })),
    TAG_Z, 0.021,
  )!
  return Math.hypot(fix.x - TAG_POS.x, fix.y - TAG_POS.y)
}

lessonShapeSuite(uwbCapstone, { runNs: RUN_NS })

describe('uwb-capstone · the lesson', () => {
  it('is in the standard-first shape and closes the UWB track', () => {
    expect(isStandardFirst(uwbCapstone)).toBe(true)
    expect(MODULES[uwbCapstone.module].title).toBe('测距综合实践')
    expect(uwbCapstone.needs).toEqual(['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist'])
    expect(uwbCapstone.terms!.map((t) => t.term)).toEqual(['brief', 'duty cycle'])
    expect([uwbCapstone.limits, uwbCapstone.observe, uwbCapstone.tryThis]).toEqual([[], [], []])
    for (const sc of [uwbCapstone.scenario(), ...uwbCapstone.variants!.map((v) => v.scenario())]) {
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    }
    expect(uwbCapstoneScenario('farAnchor').nodes.find((n) => n.id === 'anchor-3')!.pos).toEqual({ x: FAR_ANCHOR.x, y: FAR_ANCHOR.y, z: ANCHOR_Z })
    expect(rstuNs(FAST_BLOCK_RSTU)).toBe(100 * MS)
    expect(uwbCapstoneScenario('oneToMany').uwb!.aoa).toBe(false)
  })

  it('① cites the clauses, gives AoA only as request and report, and says what the standard leaves out', () => {
    const std = stdText()
    for (const s of ['§10.32.2', '§10.29.1.5', '§10.32.5', '§10.29.1.2.4', '§10.29.1.7', '图 10-200', '§10.29.8.4', '§10.32.9.9', 'RAOA', 'P802.15.4ab']) {
      expect(std, s).toContain(s)
    }
    expect(std).toContain('标准只规定到达角怎样请求与上报')
    expect(std).toContain('第 16 章的物理层（physical layer, PHY）也没有规定到达角的测量')
    expect(std).toContain('标准不定义定位')
    expect(std).not.toContain('§10.32 与第 16 章')
  })
})

describe('uwb-capstone · ② says what the engine does, and the engine does it', () => {
  it('one-to-many DS-TWR: the IEs of the poll, the final and the reports', () => {
    expect(implRow('一对多 DS-TWR').kind).toBe('faithful')
    const tx = ofType(recs(), 'TX_START').filter((r) => UWB_NODES.has(r.node))
    const ies = (kind: string) => tx.find((r) => r.frame.kind === kind)!.frame.uwb!.ies.join('、')
    const sim = implRow('一对多 DS-TWR').sim
    expect(sim).toContain(`轮询帧带 ${ies('uwbPoll')}`)
    expect(sim).toContain(`最终帧带 ${ies('uwbFinal').replace('、', ' 与 ')}`)
    expect(ies('uwbReport')).toBe('RMI')
    // the anchors compute, then the phone has the range
    const ranges = ofType(recs(), 'UWB_RANGE')
    expect(ranges.some((r) => r.node === 'anchor-1' && r.method === 'ds')).toBe(true)
    expect(ranges.some((r) => r.node === TAG && r.peer === 'anchor-1')).toBe(true)
  })

  it('FoM: two fixed bytes, by whether the direct path crosses a wall', () => {
    expect(implRow('品质因数').sim).toContain(`直视 ${hex(FOM_LOS)}，穿墙 ${hex(FOM_NLOS)}`)
    const fom = (peer: string) => ofType(recs(), 'UWB_RANGE').find((r) => r.node === TAG && r.peer === peer)!.fom
    expect([fom('anchor-1'), fom('anchor-3')]).toEqual([FOM_LOS, FOM_NLOS])
  })

  it('AoA is measured and used at the anchor; the MMS scene measures none', () => {
    expect(implRow('到达角').kind).toBe('choice')
    const aoaFixes = ofType(recs(), 'UWB_POSITION').filter((f) => f.method === 'aoa')
    expect(aoaFixes.length).toBeGreaterThan(0)
    expect(aoaFixes.every((f) => f.anchors.length === 1 && f.node === f.anchors[0])).toBe(true)
    expect(ofType(recs(V_OTM), 'UWB_AOA')).toHaveLength(0)
  })

  it('the values: a brick wall is 2.0 ns, a timestamp 100 ps, Wi-Fi loses below −12 dB', () => {
    expect(implRow('遮挡').sim).toContain(`晚 ${UWB_NLOS_NS.brick.toFixed(1)} ns`)
    expect(implRow('时间戳噪声与 Wi-Fi 干扰').sim).toContain(`${uwbCapstoneScenario().uwb!.tsNoisePs} ps`)
    expect(implRow('时间戳噪声与 Wi-Fi 干扰').sim).toContain(`低于 −${Math.abs(UWB_SIR_MIN_DB)} dB`)
    expect(implRow('测距块与时隙').sim).toContain(`测距块 ${rstuNs(uwbCapstoneScenario().uwb!.blockRstu) / MS} ms`)
    expect(implRow('测距块与时隙').sim).toContain(`时隙 ${rstuNs(uwbCapstoneScenario().uwb!.slotRstu) / MS} ms`)
    expect(implRow('测距块与时隙').sim).toContain(`时隙取 ${uwbCapstoneScenario('oneToMany').uwb!.slotRstu} RSTU`)
  })
})

describe('uwb-capstone · ③ every figure the labs print is the run', () => {
  it('lab 1: the three ranges — truth, mean error, and the wall behind the one that is long', () => {
    const rows = tableOf(lab('基线：三个距离与一次定位'), '现状下的三个距离').rows
    for (const [i, a] of ANCHORS.entries()) {
      const rs = ofType(recs(), 'UWB_RANGE').filter((r) => r.node === TAG && r.peer === a)
      expect(rows[i][0]).toBe(a)
      expect(rows[i][1], a).toBe(`${rs[0].trueDistM.toFixed(2)} m`)
      expect(rows[i][2], a).toBe(`${signed(mean(rs.map((r) => r.distM - r.trueDistM)))} m`)
    }
    expect((UWB_NLOS_NS.brick * C_M_PER_NS).toFixed(2)).toBe(bias().toFixed(2))
    expect(ofType(recs(), 'UWB_RANGE').filter((r) => r.peer === 'anchor-3' && r.node === TAG).every((r) => r.distM > r.trueDistM)).toBe(true)
  })

  it('lab 1: the formula, the FoM bytes, and the correction that meets the brief', () => {
    const l = lab('基线：三个距离与一次定位')
    const three = threeRange()
    const errs = three.map((x) => x.err)
    const f = l.blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    expect(f.text).toBe(`三距离交汇的定位：平均误差 ${mean(errs).toFixed(2)} m，最差 ${Math.max(...errs).toFixed(2)} m，GDOP ${three[0].f.gdop.toFixed(2)}`)
    expect(l.expect).toContain(`平均 +${bias().toFixed(2)} m`)
    expect(l.expect).toContain(`品质因数是 ${hex(FOM_NLOS)}，另外两条是 ${hex(FOM_LOS)}`)
    expect(l.expect).toContain(`定位误差平均 ${mean(errs).toFixed(2)} m`)
    expect(l.expect).toContain(`扣除 ${bias().toFixed(2)} m 后重新解算，这个块的误差是 ${corrected().toFixed(2)} m`)
    expect(l.meaning).toContain(`${UWB_NLOS_NS.brick.toFixed(1)} ns`)
    expect(uwbCapstone.why).toContain(`偏长约 ${bias().toFixed(2)} m`)
  })

  it('lab 2: the four-scene table, scene by scene, by the record each row names', () => {
    const rows = tableOf(lab('三项决定，四个场景'), '四个场景，七个块').rows
    for (const [col, v] of [undefined, V_FAR, V_FAST, V_OTM].entries()) {
      const fixes = ofType(recs(v), 'UWB_POSITION')
      const air = onAir(v)
      expect(rows.map((r) => r[col + 1]), String(v)).toEqual([
        String(fixes.length), String(fixes.filter((f) => f.anchors.length === 3).length),
        String(count(v, 'UWB_TIMEOUT')), String(count(v, 'UWB_INTERFERED')),
        String(air.n), `${air.ms} ms`,
      ])
    }
  })

  it('lab 2: what the expect line says about the four columns', () => {
    const e = lab('三项决定，四个场景').expect
    expect(threeRange(V_FAR)).toHaveLength(0)
    expect(e).toContain(`超时从 ${count(undefined, 'UWB_TIMEOUT')} 增加到 ${count(V_FAR, 'UWB_TIMEOUT')}`)
    expect(count(V_FAST, 'UWB_TIMEOUT')).toBe(2 * count(undefined, 'UWB_TIMEOUT'))
    expect(count(V_FAST, 'UWB_INTERFERED')).toBe(2 * count(undefined, 'UWB_INTERFERED'))
    expect(e).toContain('恰好翻倍')
    // 2026-11-11 (audit #22): the one-to-many round is a sub-round per anchor, the tag's train sent once
    // to each — nine times the transmissions, where the shared-train round was six.
    expect(Math.floor(onAir(V_OTM).n / onAir().n)).toBe(9)
    expect(e).toContain('九倍以上')
    // every fix that is not a three-range fix is one anchor's range plus its bearing
    for (const v of [undefined, V_FAR, V_FAST]) {
      expect(ofType(recs(v), 'UWB_POSITION').filter((f) => f.anchors.length !== 3).every((f) => f.method === 'aoa' && f.anchors.length === 1), String(v)).toBe(true)
    }
    // the why's 「超时多了一倍以上」 and 「定位次数减半」
    expect(count(V_FAR, 'UWB_TIMEOUT')).toBeGreaterThan(2 * count(undefined, 'UWB_TIMEOUT'))
    expect(ofType(recs(V_FAR), 'UWB_POSITION').length * 2).toBe(ofType(recs(), 'UWB_POSITION').length)
  })

  it('lab 3: no scene meets half a metre, and the offset alone is over it', () => {
    for (const v of [undefined, V_FAST, V_OTM]) expect(Math.max(...threeRange(v).map((x) => x.err)), String(v)).toBeGreaterThan(0.5)
    expect(lab('对照任务书').expect).toContain(`仅那个偏移就有 ${bias().toFixed(2)} m`)
    expect(bias()).toBeGreaterThan(0.5)
    expect(corrected()).toBeLessThan(0.05)
  })
})
