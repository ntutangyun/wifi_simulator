/**
 * `@uwb-aoa`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites and for keeping simulator behaviour out; ② row by row against
 * the engine's own exports and runs — including the two rows the W4 fix (2026-11-11) made faithful:
 * the SP3 report's bearing in the RMI AOA Azimuth field, and an SS-TWR responder's range via the RRMC
 * TOF Request and the initiator's RMI TOF report; ③ by reading every figure the labs print back out of
 * the lesson text and comparing it with a run.
 */
import { describe, it, expect } from 'vitest'
import {
  ANCHOR_X, ANCHOR_Y, ANCHOR_Z, SPOTS, TAG_Z, YAW_IN,
  tagXY, uwbAoa, uwbAoaScenario, type UwbAoaVariant,
} from '../../src/course/uwb/uwb-aoa'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_UWB_SESSION, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { MODULES } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import {
  AOA_SIGMA_CLAMP_DEG, AOA_SIGMA_PHI_RAD, antennaSpacingM, aoaSigmaDeg, azimuthFromPdoaDeg,
  pdoaRad, trueAzimuthDeg, wavelengthM,
} from '../../src/uwb/aoa'
import { rangeSigmaM } from '../../src/uwb/position'
import { RMI_AOA_AZIMUTH_BYTES, UWB_SS_DEFER_BYTES, uwbPpduNs, uwbSp3ReportBytes, uwbSsTofReportBytes } from '../../src/uwb/phy'
import { makeSsDefer } from '../../src/uwb/frames'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const ANC = 'anc-1'
const TAG = 'badge-1'
const V: Record<Exclude<UwbAoaVariant, 'base'>, number> = { off45: 0, off60: 1, behind: 2, ss: 3 }

lessonShapeSuite(uwbAoa)

const recs = (v: UwbAoaVariant): TLRecord[] => runOf(uwbAoa, v === 'base' ? undefined : V[v], RUN_NS)
const extra = new Map<string, TLRecord[]>()
const runExtra = (key: string, build: () => Scenario): TLRecord[] => {
  if (!extra.has(key)) extra.set(key, [...new Simulation(build()).runUntil(RUN_NS).records])
  return extra.get(key)!
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const cm = (m: number): string => (m * 100).toFixed(1)
const fixErrM = (rs: TLRecord[]): number[] =>
  ofType(rs, 'UWB_POSITION').map((f) => Math.hypot(f.x - f.trueX, f.y - f.trueY))
const ancRangeErrM = (rs: TLRecord[]): number[] =>
  ofType(rs, 'UWB_RANGE').filter((r) => r.node === ANC).map((r) => Math.abs(r.distM - r.trueDistM))
const crossSigmaM = (v: UwbAoaVariant): number =>
  SPOTS[v].rangeM * aoaSigmaDeg(SPOTS[v].offBoresightDeg) * (Math.PI / 180)

const lab = (heading: string): Lab => {
  const l = uwbAoa.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === kind && b.heading === heading)
  expect(t, `${kind} 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbAoa.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

describe('uwb-aoa · the lesson', () => {
  it('is in the standard-first shape, closing its module', () => {
    expect(isStandardFirst(uwbAoa)).toBe(true)
    expect(MODULES[uwbAoa.module]).toBeDefined()
    expect(uwbAoa.needs).toEqual(['uwb-dstwr', 'uwb-geometry'])
    expect(uwbAoa.limits).toEqual([])
    expect(uwbAoa.observe).toEqual([])
    expect(uwbAoa.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and puts no simulator behaviour there', () => {
    const std = uwbAoa.standard!.map((b) =>
      `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''} ${'rows' in b ? b.rows.flat().join(' ') : ''}`).join(' ')
    for (const c of ['§10.29.1.1', '§10.29.8.3', '图 10-211', '§10.29.8.4', '图 10-212', '图 10-213', '§10.32.9.9', '§10.32.8.2']) {
      expect(std, c).toContain(c)
    }
    expect(std).not.toContain('本仿真器')
    expect(std).not.toContain('本课')
    expect(std).toContain('RAOA 是请求位，不是信息单元')
    expect(std).toContain('标准不规定到达角怎样测量')
  })

  // 2026-11-11 (W4, audit #16 and the RAOA IE): both rows that said "differs" are faithful now.
  it('② has no "differs" row; the SP3 report and the SS-TWR range are faithful, the bearing report absent', () => {
    expect(uwbAoa.implementation!.map((r) => r.kind)).not.toContain('differs')
    expect(implRow('SP3 测距里的报告').kind).toBe('faithful')
    expect(implRow('SP3 测距里的报告').sim).toContain('AOA Azimuth 字段')
    expect(implRow('单边测距下的距离').kind).toBe('faithful')
    expect(implRow('本课场景里的报告').kind).toBe('absent')
    expect(uwbAoa.why).not.toContain('待改正')
    expect(uwbAoa.why).toContain('TOF Request')
  })
})

describe('uwb-aoa · ② says what the engine does, and the engine does it', () => {
  it('测量方法: half-wavelength antennas on channel 9, π·sin θ, no wrap inside the field of view', () => {
    const row = implRow('测量方法').sim
    expect(row).toContain(`波长 ${(wavelengthM(9) * 100).toFixed(2)} cm`)
    expect(row).toContain(`天线间距 ${(antennaSpacingM(9) * 100).toFixed(2)} cm`)
    expect(antennaSpacingM(9)).toBeCloseTo(wavelengthM(9) / 2, 12)
    expect(pdoaRad(90, 9)).toBeCloseTo(Math.PI, 12)
    expect(pdoaRad(-90, 9)).toBeCloseTo(-Math.PI, 12)
    for (const t of [0, -45, -60, 30]) expect(azimuthFromPdoaDeg(pdoaRad(t, 9), 9)).toBeCloseTo(t, 9)
  })

  it('相位噪声: 0.15 rad ≈ 8.6°, inverting to 2.74°, 3.87° and 5.47°', () => {
    const row = implRow('相位噪声').sim
    expect(AOA_SIGMA_PHI_RAD).toBe(0.15)
    expect(row).toContain(`σ_φ = ${AOA_SIGMA_PHI_RAD} rad（约 ${(AOA_SIGMA_PHI_RAD * 180 / Math.PI).toFixed(1)}°）`)
    for (const t of [0, 45, 60]) expect(row, String(t)).toContain(`${aoaSigmaDeg(-t).toFixed(2)}°`)
    for (const t of [0, -45, -60, 30]) {
      expect(aoaSigmaDeg(t)).toBeCloseTo((AOA_SIGMA_PHI_RAD / (Math.PI * Math.cos(t * Math.PI / 180))) * 180 / Math.PI, 12)
    }
  })

  it('两处截断: ±90° and 45°, untouched at the three spots, biting at 80° and 4 m', () => {
    const row = implRow('两处截断').sim
    expect(azimuthFromPdoaDeg(Math.PI * 1.4, 9)).toBe(90)
    expect(AOA_SIGMA_CLAMP_DEG).toBe(45)
    expect(aoaSigmaDeg(90)).toBe(AOA_SIGMA_CLAMP_DEG)
    for (const v of ['base', 'off45', 'off60'] as UwbAoaVariant[]) {
      expect(ofType(recs(v), 'UWB_AOA').some((a) => Math.abs(a.thetaDeg) === 90), v).toBe(false)
    }
    const far = { x: ANCHOR_X + 4 * Math.sin(80 * Math.PI / 180), y: ANCHOR_Y + 4 * Math.cos(80 * Math.PI / 180) }
    const base = uwbAoaScenario('base')
    const run80 = runExtra('off80', () => ({
      ...base,
      nodes: base.nodes.map((n): NodeCfg => (n.id === TAG ? { ...n, pos: { ...n.pos, ...far } } : n)),
    }))
    const bearings = ofType(run80, 'UWB_AOA')
    expect(row).toContain(`σ_θ 为 ${aoaSigmaDeg(-80).toFixed(2)}°`)
    expect(row).toContain(`十四个方位角中有六个`)
    expect(bearings).toHaveLength(14)
    expect(bearings.filter((b) => b.thetaDeg === -90)).toHaveLength(6)
  })

  it('天线方向图与多径: the badge behind the anchor is received exactly as well as in front', () => {
    expect(ancRangeErrM(recs('behind'))).toEqual(ancRangeErrM(recs('base')))
    expect(ofType(recs('behind'), 'UWB_AOA')).toHaveLength(2 * BLOCKS)
  })

  it('在哪些帧上测角 / 零点: two bearings a round, both by the anchor, zero on the boresight', () => {
    const rs = recs('base')
    const as = ofType(rs, 'UWB_AOA')
    expect(as).toHaveLength(2 * BLOCKS)
    expect(as.every((a) => a.node === ANC && a.peer === TAG)).toBe(true)
    expect(as.every((a) => a.trueThetaDeg === 0)).toBe(true)
    expect(ofType(recs('off45'), 'UWB_AOA').every((a) => a.trueThetaDeg < 0)).toBe(true)
  })

  it('本课场景里的报告: no frame of the lesson\'s scenes carries a bearing', () => {
    for (const v of ['base', 'off45', 'off60', 'behind', 'ss'] as UwbAoaVariant[]) {
      const frames = ofType(recs(v), 'TX_START').map((r) => r.frame)
      expect(frames.some((f) => f.uwb?.aoaThetaDeg !== undefined), v).toBe(false)
      expect(frames.some((f) => (f.uwb?.ies ?? []).includes('RAOA')), v).toBe(false)
    }
  })

  // 2026-11-11 (W4): the bearing is the RMI IE's AOA Azimuth field (standard §10.29.8.4, Figure 10-213),
  // two octets inside the same list element — no IE of its own.
  it('SP3 测距里的报告: the bearing rides the RMI IE\'s AOA Azimuth field, two octets, no extra IE', () => {
    const f = makeSsDefer(ANC, TAG, 0, 0, 0, 1, 2.3)
    expect(f.uwb?.ies).toEqual(['RMI'])
    expect(f.uwb?.aoaThetaDeg).toBe(2.3)
    expect(RMI_AOA_AZIMUTH_BYTES).toBe(2)
    expect(uwbSp3ReportBytes(true) - UWB_SS_DEFER_BYTES).toBe(RMI_AOA_AZIMUTH_BYTES)
    expect(implRow('SP3 测距里的报告').sim).toContain(`AOA Azimuth Present 置 1，${RMI_AOA_AZIMUTH_BYTES} 字节`)
  })

  // 2026-11-11 (W4, audit #16): standard §10.29.8.3, §10.32.4 Figure 10-235 — the responder requests the
  // TOF in its Response's RRMC IE and the initiator reports it in an RMI IE; the anchor then has a range.
  it('单边测距下的距离: on SS-TWR with the TOF request the anchor gets its range back, and fixes alone', () => {
    const ss = recs('ss')
    const tx = ofType(ss, 'TX_START')
    expect(tx.filter((r) => r.frame.kind === 'uwbResp').every((r) => r.frame.uwb?.tofRequest === true)).toBe(true)
    const reports = tx.filter((r) => r.frame.kind === 'uwbReport')
    expect(reports).toHaveLength(BLOCKS)
    expect(reports.every((r) => r.node === TAG && r.frame.dst === '*' && r.frame.bytes === uwbSsTofReportBytes(1))).toBe(true)
    expect(implRow('单边测距下的距离').sim).toContain(`共 ${uwbSsTofReportBytes(1)} 字节`)
    const tagRanges = ofType(ss, 'UWB_RANGE').filter((r) => r.node === TAG)
    const ancRanges = ofType(ss, 'UWB_RANGE').filter((r) => r.node === ANC)
    expect(ancRanges).toHaveLength(BLOCKS)
    // the anchor's TOF is the tag's, rounded to whole RCTU (the RMI TOF field is an integer)
    ancRanges.forEach((a, i) => expect(a.tofRctu).toBe(Math.round(tagRanges[i].tofRctu)))
    const fixes = ofType(ss, 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    expect(fixes.every((f) => f.node === ANC && f.method === 'aoa')).toBe(true)
    // without the request the anchor never learns its range: the standard's procedure is what buys it
    const base = uwbAoaScenario('ss')
    const noReq = runExtra('ss-noreq', () => ({ ...base, uwb: { ...base.uwb!, ssTofRequest: false } }))
    expect(ofType(noReq, 'UWB_RANGE').filter((r) => r.node === ANC)).toEqual([])
    expect(ofType(noReq, 'UWB_POSITION')).toEqual([])
    expect(ofType(noReq, 'TX_START').filter((r) => r.frame.kind === 'uwbReport')).toEqual([])
  })

  it('定位 / 测距噪声: one anchor, GDOP 1.00, the plan leg, and 2.12 cm', () => {
    const fixes = ofType(recs('base'), 'UWB_POSITION')
    expect(fixes).toHaveLength(BLOCKS)
    expect(fixes.every((f) => f.anchors.length === 1 && f.anchors[0] === ANC && f.gdop === 1 && f.method === 'aoa')).toBe(true)
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect(implRow('测距噪声').sim).toContain(`${(rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs) * 100).toFixed(2)} cm`)
  })
})

describe('uwb-aoa · ③ every figure the labs print is the run', () => {
  it('lab 1: the round\'s log lines, at the instants printed', () => {
    const l = lab('一轮里的方位角、距离与定位')
    const rows = blockOf(l, 'table', '基准场景第 0 轮的日志').rows
    const rs = recs('base')
    const as = ofType(rs, 'UWB_AOA')
    expect(as[0].block).toBe(0)
    const at = rs.filter((r) => r.t === as[1].t && (r.type === 'UWB_AOA' || r.type === 'UWB_RANGE' || r.type === 'UWB_POSITION'))
    expect(at.map((r) => r.type)).toEqual(['UWB_AOA', 'UWB_RANGE', 'UWB_POSITION'])
    expect(rows.map((r) => r[1])).toEqual([fmtRecord(as[0]), ...at.map((r) => fmtRecord(r))])
    expect(rows[0][0]).toBe(`${(as[0].t / 1000).toFixed(3)} µs`)
    for (const r of rows.slice(1)) expect(r[0]).toBe(`${(as[1].t / 1e6).toFixed(6)} ms`)
    expect(l.expect).toContain(`约 ${(as[0].t / 1e6).toFixed(1)} ms`)
    expect(l.expect).toContain(`方位角 ${as[0].thetaDeg.toFixed(1)}°`)
    expect(l.expect).toContain(`第二个方位角 ${as[1].thetaDeg.toFixed(1)}°`)
    const fix = at[2] as Extract<TLRecord, { type: 'UWB_POSITION' }>
    expect(l.expect).toContain(`定位误差 ${Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY).toFixed(2)} m`)
  })

  it('lab 2: the worked example is the engine\'s arithmetic on round 0', () => {
    const l = lab('一个锚点，一次定位：逐步计算')
    const rows = blockOf(l, 'table', 'badge-1，基准场景，第 0 轮').rows
    const w = (i: number) => rows[i][1]
    const rs = recs('base')
    const bearings = ofType(rs, 'UWB_AOA').slice(0, 2)
    const range = ofType(rs, 'UWB_RANGE')[0]
    const fix = ofType(rs, 'UWB_POSITION')[0]
    const theta = bearings[1].thetaDeg
    const dz = ANCHOR_Z - TAG_Z
    const horiz = Math.sqrt(range.distM ** 2 - dz * dz)
    const truth = trueAzimuthDeg({ x: ANCHOR_X, y: ANCHOR_Y, z: ANCHOR_Z }, YAW_IN, { ...tagXY('base'), z: TAG_Z })
    expect(w(0)).toBe(`${truth.toFixed(3)}°`)
    expect(w(1)).toBe('π·sin 0° = 0.000 rad')
    const phi = Math.PI * Math.sin(theta * (Math.PI / 180))
    expect(w(2)).toBe(`${phi.toFixed(4)} rad`)
    expect(w(3)).toBe(`${theta.toFixed(3)}°`)
    expect(w(4)).toBe(`${range.distM.toFixed(4)} m, true ${range.trueDistM.toFixed(4)}`)
    expect(dz.toFixed(2)).toBe('1.20')
    expect(w(5)).toBe(`√(${range.distM.toFixed(4)}² − 1.20²) = ${horiz.toFixed(4)} m`)
    const b = (YAW_IN + theta) * (Math.PI / 180)
    expect(ANCHOR_X + horiz * Math.cos(b)).toBeCloseTo(fix.x, 9)
    expect(ANCHOR_Y + horiz * Math.sin(b)).toBeCloseTo(fix.y, 9)
    expect(w(6)).toBe(`(${fix.x.toFixed(3)}, ${fix.y.toFixed(3)}) m, true (${fix.trueX.toFixed(3)}, ${fix.trueY.toFixed(3)})`)
    const across = horiz * aoaSigmaDeg(theta) * (Math.PI / 180)
    const along = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)
    expect(fix.ellipse.a).toBeCloseTo(across, 12)
    expect(fix.ellipse.b).toBeCloseTo(along, 12)
    expect(w(7)).toBe(`across ${cm(across)} cm, along ${cm(along)} cm`)
    // the expect line repeats the same figures
    for (const s of [`${theta.toFixed(3)}°`, `${range.distM.toFixed(4)} m`, `${horiz.toFixed(4)} m`,
      `(${fix.x.toFixed(3)}, ${fix.y.toFixed(3)}) m`, `${cm(across)} cm`, `${cm(along)} cm`]) {
      expect(l.expect, s).toContain(s)
    }
  })

  it('lab 3: the three-spot table is what seven rounds produce at each spot', () => {
    const l = lab('误差横在视线上')
    const rows = blockOf(l, 'table', '三个位置，各七轮').rows
    const SPOT_ROWS: [UwbAoaVariant, number][] = [['base', 0], ['off45', 1], ['off60', 2]]
    for (const [v, i] of SPOT_ROWS) {
      const run = recs(v)
      const row = rows[i]
      const as = ofType(run, 'UWB_AOA')
      expect(row[1], v).toBe(`${as[0].trueThetaDeg.toFixed(1).replace('-', '−')}°`)
      expect(row[2], v).toBe(`${aoaSigmaDeg(SPOTS[v].offBoresightDeg).toFixed(2)}°`)
      expect(row[3], v).toBe(`${cm(crossSigmaM(v))} cm`)
      const re = ancRangeErrM(run)
      expect(re, v).toHaveLength(BLOCKS)
      expect(row[4], v).toBe(`${cm(mean(re))} cm`)
      const fe = fixErrM(run)
      expect(row[5], v).toBe(`${cm(Math.min(...fe))}–${cm(Math.max(...fe))} cm，平均 ${cm(mean(fe))}`)
      const f0 = ofType(run, 'UWB_POSITION')[0]
      expect(row[6], v).toBe(`${cm(f0.ellipse.a)} × ${cm(f0.ellipse.b)} cm`)
    }
    expect(l.expect).toContain(`${rows[0][3]} 增大到 ${rows[2][3]}`)
    expect(l.expect).toContain(`从 ${cm(mean(fixErrM(recs('base'))))} cm 增大到 ${cm(mean(fixErrM(recs('off60'))))} cm`)
    // the height correction quoted for the middle spot
    const t = tagXY('off45')
    const slant = Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y, ANCHOR_Z - TAG_Z)
    expect(l.expect).toContain(`斜距是 ${slant.toFixed(3)} m`)
    expect(l.expect).toContain(`平面距离是 ${Math.hypot(t.x - ANCHOR_X, t.y - ANCHOR_Y).toFixed(3)} m`)
    expect(l.expect).toContain(`偏远 ${cm(slant - 4)} cm`)
  })

  it('lab 4: behind the anchor — the same bearings, the fixes outside the room', () => {
    const l = lab('锚点背后的胸牌')
    const behind = ofType(recs('behind'), 'UWB_AOA')
    const base = ofType(recs('base'), 'UWB_AOA')
    expect(behind).toHaveLength(base.length)
    behind.forEach((a, i) => expect(a.thetaDeg, String(i)).toBeCloseTo(base[i].thetaDeg, 12))
    expect(behind.every((a) => a.trueThetaDeg === 180)).toBe(true)
    expect(l.expect).toContain(`真值变为 ${behind[0].trueThetaDeg.toFixed(1)}°`)
    expect(l.expect).toContain(`十四个读数`)
    expect(behind).toHaveLength(14)
    expect(l.expect).toContain(`第一个仍是 ${behind[0].thetaDeg.toFixed(1)}°`)
    const fs = ofType(recs('behind'), 'UWB_POSITION')
    expect(l.expect).toContain(`(${fs[0].x.toFixed(2)}, ${fs[0].y.toFixed(2)}) m`.replace('-', '−'))
    const errs = fixErrM(recs('behind'))
    expect(l.expect).toContain(`${Math.min(...errs).toFixed(2)} 到 ${Math.max(...errs).toFixed(2)} m`)
    expect(mean(errs)).toBeCloseTo(2 * SPOTS.behind.rangeM, 1)
    expect(fs.every((f) => f.y < 0)).toBe(true)
    expect(l.expect).toContain(`测距误差仍是 ${cm(mean(ancRangeErrM(recs('behind'))))} cm`)
    expect(fs.map((f) => f.ellipse.a)).toEqual(ofType(recs('base'), 'UWB_POSITION').map((f) => f.ellipse.a))
    // sin(180° − θ) = sin θ, in the model
    for (const t of [0, 20, 45, 60]) expect(pdoaRad(180 - t, 9)).toBeCloseTo(pdoaRad(t, 9), 12)
    expect(uwbAoaScenario('behind').nodes[0].uwb!.yawDeg).toBe(-90)
    expect(tagXY('behind')).toEqual(tagXY('base'))
  })

  it('lab 5: SS-TWR with the TOF request — the three frames, the TOF, the anchor\'s range and fix', () => {
    const l = lab('单边测距：锚点请求飞行时间')
    expect(uwbAoa.variants![l.variant!].label).toBe('单边测距，请求飞行时间')
    const rows = blockOf(l, 'table', '第 0 轮的三帧').rows
    const rs = recs('ss')
    const r0 = ofType(rs, 'TX_START').filter((r) => r.t < 200 * MS)
    expect(r0.map((r) => [r.frame.uwb?.slot, r.node, r.frame.kind])).toEqual([[0, TAG, 'uwbPoll'], [1, ANC, 'uwbResp'], [2, TAG, 'uwbReport']])
    r0.forEach((r, i) => {
      expect(rows[i][0]).toBe(String(r.frame.uwb!.slot))
      expect(rows[i][1]).toBe(r.node)
      expect(rows[i][3]).toBe(`${r.frame.bytes} B`)
      expect(r.frame.txTimeNs).toBe(uwbPpduNs(r.frame.bytes))
    })
    expect(rows[0][4]).toBe(r0[0].frame.uwb!.ies.join('、'))
    expect(r0[1].frame.uwb!.ies).toEqual(['RRMC', 'RRTI'])
    expect(r0[2].frame.uwb!.ies).toEqual(['RMI'])
    const tof = r0[2].frame.uwb!.tofList![0]
    expect(tof.id).toBe(ANC)
    expect(rows[2][4]).toContain(`${tof.tof} RCTU`)
    const tagRange = ofType(rs, 'UWB_RANGE').find((r) => r.node === TAG)!
    const ancRange = ofType(rs, 'UWB_RANGE').find((r) => r.node === ANC)!
    const fix = ofType(rs, 'UWB_POSITION')[0]
    expect(l.expect).toContain(`算出距离 ${tagRange.distM.toFixed(2)} m`)
    expect(l.expect).toContain(`飞行时间 ${tof.tof} RCTU`)
    expect(l.expect).toContain(`同一个距离 ${ancRange.distM.toFixed(2)} m`)
    expect(ancRange.t).toBe(fix.t)
    expect(l.expect).toContain(`定位 (${fix.x.toFixed(2)}, ${fix.y.toFixed(2)}) m，误差 ${Math.hypot(fix.x - fix.trueX, fix.y - fix.trueY).toFixed(2)} m`)
    expect(l.expect).toContain(`平均定位误差为 ${cm(mean(fixErrM(rs)))} cm`)
    expect(l.expect).toContain(`基准场景为 ${cm(mean(fixErrM(recs('base'))))} cm`)
  })
})
