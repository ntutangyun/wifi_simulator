/**
 * `@uwb-coexist`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites and the figures it states against the engine's constants
 * (the channel table, the −45 dBm/MHz input, the −62 dBm energy detection); ② row by row against the
 * engine (the band arithmetic, the two path-loss laws, the −12 dB floor, no CCA on the UWB side, ED
 * over the whole channel); ③ by reading every figure each lab prints back out of the lesson text and
 * comparing it with a run — the base scene, its four variants, the saturated scene with the session
 * removed, and the two Wi-Fi centres the last lab has the reader type in.
 */
import { describe, it, expect } from 'vitest'
import {
  CLEAR_6G_CENTER_MHZ, WIFI_6G_CENTER_MHZ, uwbCoexist, uwbCoexistScenario,
} from '../../src/course/uwb/uwb-coexist'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, sixGhzChannelNo, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { MODULES } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { CCA_ED_DBM, noiseDbm } from '../../src/engine/phy'
import { uwbToWifiPathLossDb, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import {
  UWB_BAND_MHZ, UWB_MAX_INPUT_DBM_PER_MHZ, UWB_PL_EXP, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
  tsSigmaNs, uwbBandOverlap, uwbBandOverlapMhz, uwbInBandDbm, uwbPl0Db,
} from '../../src/uwb/phy'
import { applyRecord, initViewState } from '../../src/model/view'
import { STRINGS } from '../../src/ui/i18n'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Five seconds: twenty-five 200 ms ranging blocks, and long enough for the backup to burst eight times. */
const RUN_NS = 5000 * MS
const BLOCKS = 25
const SEC = RUN_NS / 1e9

const TAG = { x: 4, y: 3.5, z: 1.0 }
const AP = { x: 5, y: 0.7, z: 2.0 }
const LAPTOP = { x: 7, y: 5, z: 1.0 }
const ANCHOR_Z = 2.2
const CORNERS: [string, number, number][] = [
  ['anchor-1', 0.5, 0.5], ['anchor-2', 9.5, 0.5], ['anchor-3', 0.5, 7.5], ['anchor-4', 9.5, 7.5],
]
const UWB_IDS = new Set([...CORNERS.map(([id]) => id), 'uwb-1'])
const WIFI_VIDS = ['ap#6g', 'laptop#6g']
const CH9 = 0, WIFI7 = 1, SAT = 2, NO_UWB = 3

const BASE = uwbCoexistScenario()
const WIDTH_MHZ = BASE.nodes.find((n) => n.id === 'laptop')!.caps.widthMhz!
const AP_DBM = BASE.nodes.find((n) => n.id === 'ap')!.txPowerDbm
const LAPTOP_DBM = BASE.nodes.find((n) => n.id === 'laptop')!.txPowerDbm

lessonShapeSuite(uwbCoexist, { runNs: RUN_NS })

const recs = (variant?: number): TLRecord[] => runOf(uwbCoexist, variant, RUN_NS)
const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbCoexist.scenario() : uwbCoexist.variants![variant].scenario()
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
/** A fixed-point figure as the lesson prints it, with the typographic minus. */
const mn = (n: number, d = 2): string => n.toFixed(d).replace('-', '−')

const interfered = (variant?: number) => ofType(recs(variant), 'UWB_INTERFERED')
const fixes = (variant?: number) => ofType(recs(variant), 'UWB_POSITION')
const tagRanges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE').filter((r) => r.node === 'uwb-1')
const fixErr = (f: Extract<TLRecord, { type: 'UWB_POSITION' }>) => Math.hypot(f.x - f.trueX, f.y - f.trueY)
const nodeOf = (r: TLRecord): string | undefined =>
  typeof (r as { node?: unknown }).node === 'string' ? (r as { node: string }).node : undefined
const isUwbSide = (r: TLRecord): boolean => {
  const n = nodeOf(r)
  return r.type.startsWith('UWB_') || (n !== undefined && UWB_IDS.has(n))
}
const airNs = (rs: TLRecord[], ids: (id: string) => boolean): number =>
  ofType(rs, 'TX_START').filter((r) => ids(r.node)).reduce((a, r) => a + r.frame.txTimeNs, 0)
const wifiAirPct = (variant?: number) => airNs(recs(variant), (id) => WIFI_VIDS.includes(id)) / RUN_NS * 100
function mbps(rs: TLRecord[], node: string): number {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const bytes = new Map(ofType(rs, 'ENQUEUE').filter((r) => r.node === node).map((r) => [r.msduId, r.bytes]))
  let bits = 0
  for (const r of ofType(rs, 'DEQUEUE')) if (r.node === node && !dropped.has(r.msduId)) bits += 8 * (bytes.get(r.msduId) ?? 0)
  return bits / SEC / 1e6
}

/** In-band level (dBm) a Wi-Fi transmitter of `eirpDbm` puts into the UWB band at `at`. */
const wifiAt = (from: typeof TAG, eirpDbm: number, at: typeof TAG, center = WIFI_6G_CENTER_MHZ): number =>
  eirpDbm + 10 * Math.log10(uwbBandOverlap(center, WIDTH_MHZ, 5)) - wifiToUwbPathLossDb(dist(from, at), 0)
/** In-band level (dBm) one UWB frame puts into the Wi-Fi channel at `at`. */
const uwbAt = (from: typeof TAG, at: typeof TAG): number =>
  uwbInBandDbm(UWB_TX_POWER_DBM, uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)) - uwbToWifiPathLossDb(dist(from, at), 0, 5)
const anchorAtTag = (x: number, y: number): number =>
  UWB_TX_POWER_DBM - (uwbPl0Db(5) + 20 * Math.log10(dist({ x, y, z: ANCHOR_Z }, TAG)))
const noiseRiseDb = (interfDbm: number): number =>
  10 * Math.log10(1 + 10 ** ((interfDbm - noiseDbm(WIDTH_MHZ)) / 10))

function inspectorAfter(variant: number | undefined, id: string) {
  const vs = initViewState(scenarioOf(variant))
  for (const r of recs(variant)) applyRecord(vs, r)
  return vs.nodes[id].uwb!
}

const lab = (heading: string): Lab => {
  const l = uwbCoexist.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbCoexist.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
/** The one capture of `re` in `s`, as a number (typographic minus and spaced thousands read as one figure). */
const num = (s: string, re: RegExp, what: string): number => {
  const m = re.exec(s)
  expect(m, `${what}: 「${re.source}」 not found`).not.toBeNull()
  return Number(m![1]!.replace(/\s/g, '').replace(/[−–]/g, '-'))
}
const stdText = (): string => uwbCoexist.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-coexist · the lesson', () => {
  it('is in the standard-first shape, in the coexistence module', () => {
    expect(isStandardFirst(uwbCoexist)).toBe(true)
    expect(MODULES[uwbCoexist.module].title).toBe('共存')
    expect(uwbCoexist.needs).toEqual(['uwb-blocks', 'uwb-geometry'])
    expect(uwbCoexist.limits).toEqual([])
    expect(uwbCoexist.observe).toEqual([])
    expect(uwbCoexist.tryThis).toEqual([])
  })

  it('cites each clause ① teaches, and ② is not all faithful', () => {
    for (const c of ['§16.4.1', '表 16-27', '§11.1.3.5', '§11.2.8', '§16.4.5', '§16.4.10', '§16.4.11', '§16.4', '式 27-148', '§27.3.22.6.3']) {
      expect(stdText(), c).toContain(c)
    }
    const kinds = new Set(uwbCoexist.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'value', 'choice', 'differs', 'absent'] as const) expect(kinds, k).toContain(k)
  })

  it('why states the standard\'s figures and the model\'s, as the engine has them', () => {
    const why = uwbCoexist.why!
    expect(num(why, /([\d.]+) MHz 的带宽/, 'width')).toBe(Number((UWB_BAND_MHZ[5].hi - UWB_BAND_MHZ[5].lo).toFixed(1)))
    expect(num(why, /不低于 ([−\d]+) dBm\/MHz/, 'max input')).toBe(UWB_MAX_INPUT_DBM_PER_MHZ)
    expect(num(why, /本仿真器取的 ([−\d]+) dB 门限/, 'floor')).toBe(UWB_SIR_MIN_DB)
    expect(num(why, /判忙所需的 ([−\d]+) dBm/, 'ED')).toBe(CCA_ED_DBM)
  })

  it('① states the channel table and the two standards\' thresholds the engine uses', () => {
    const s = stdText()
    // centre ± 249.6 MHz is the band the engine uses
    for (const [ch, centre] of [[5, num(s, /5 号信道中心频率 ([\d.]+) MHz/, 'c5')], [9, num(s, /9 号信道 ([\d.]+) MHz/, 'c9')]] as const) {
      expect(((UWB_BAND_MHZ[ch].lo + UWB_BAND_MHZ[ch].hi) / 2).toFixed(1), `ch ${ch}`).toBe(centre.toFixed(1))
    }
    expect(s).toContain(`5 号信道占 ${UWB_BAND_MHZ[5].lo.toFixed(1)} 至 ${UWB_BAND_MHZ[5].hi.toFixed(1)} MHz`)
    expect(s).toContain(`9 号信道占 ${UWB_BAND_MHZ[9].lo.toFixed(1)} 至 ${UWB_BAND_MHZ[9].hi.toFixed(1)} MHz`)
    expect(num(s, /最大输入应不低于 ([−\d]+) dBm\/MHz/, 'max')).toBe(UWB_MAX_INPUT_DBM_PER_MHZ)
    expect(num(s, /达到 ([−\d]+) dBm 的任何信号/, 'ED')).toBe(CCA_ED_DBM)
    // 「80 MHz 信道的中心编号是 7、23、39、55、71……」: the engine's numbering of 80 MHz centres
    const listed = /中心编号是 ([\d、]+)……/.exec(s)![1].split('、').map(Number)
    expect(listed).toEqual([5985, 6065, 6145, 6225, 6305].map(sixGhzChannelNo))
  })
})

describe('uwb-coexist · ② says what the engine does, and the engine does it', () => {
  it('the two bands and the two Wi-Fi channels', () => {
    const band = implRow('信道与带宽').sim
    expect(band).toContain(`5 号信道 ${UWB_BAND_MHZ[5].lo.toFixed(1)} 至 ${UWB_BAND_MHZ[5].hi.toFixed(1)} MHz`)
    expect(band).toContain(`9 号信道 ${UWB_BAND_MHZ[9].lo.toFixed(1)} 至 ${UWB_BAND_MHZ[9].hi.toFixed(1)} MHz`)
    const ch = implRow('Wi-Fi 信道编号').sim
    expect(num(ch, /的 (\d+) MHz 是/, 'base')).toBe(WIFI_6G_CENTER_MHZ)
    expect(num(ch, /MHz 是 (\d+) 号信道，变体/, 'base no')).toBe(sixGhzChannelNo(WIFI_6G_CENTER_MHZ))
    expect(num(ch, /变体的 (\d+) MHz/, 'clear')).toBe(CLEAR_6G_CENTER_MHZ)
    expect(num(ch, /变体的 \d+ MHz 是 (\d+) 号信道/, 'clear no')).toBe(sixGhzChannelNo(CLEAR_6G_CENTER_MHZ))
  })

  it('the transmit powers are the scene\'s', () => {
    const sim = implRow('发射功率').sim
    expect(num(sim, /测距设备 ([−\d]+) dBm/, 'uwb')).toBe(UWB_TX_POWER_DBM)
    expect(num(sim, /分布在 ([\d.]+) MHz/, 'width')).toBe(Number((UWB_BAND_MHZ[5].hi - UWB_BAND_MHZ[5].lo).toFixed(1)))
    expect(num(sim, /路由器 (\d+) dBm/, 'ap')).toBe(AP_DBM)
    expect(num(sim, /笔记本 (\d+) dBm/, 'laptop')).toBe(LAPTOP_DBM)
  })

  it('the two path-loss laws are the engine\'s', () => {
    const sim = implRow('路径损耗').sim
    const [w0, w6] = [num(sim, /一米处 ([\d.]+) dB，6 GHz/, 'w0'), num(sim, /再加 ([\d.]+) dB/, 'w6')]
    expect((w0 + w6).toFixed(1)).toBe(wifiToUwbPathLossDb(1, 0).toFixed(1))
    expect(num(sim, /衰减指数 (\d)/, 'n wifi') * 10).toBe(Number((wifiToUwbPathLossDb(10, 0) - wifiToUwbPathLossDb(1, 0)).toFixed(6)))
    expect(num(sim, /5 号信道一米处 ([\d.]+) dB/, 'u0').toFixed(2)).toBe(uwbPl0Db(5).toFixed(2))
    expect(num(sim, /自由空间指数 (\d)/, 'n uwb')).toBe(UWB_PL_EXP)
    expect(uwbToWifiPathLossDb(10, 0, 5) - uwbToWifiPathLossDb(1, 0, 5)).toBeCloseTo(10 * UWB_PL_EXP, 9)
  })

  it('the SIR floor is the engine\'s, and every loss is under it', () => {
    expect(num(implRow('干扰下能否解出').sim, /达到或高于 ([−\d]+) dB/, 'floor')).toBe(UWB_SIR_MIN_DB)
    for (const r of interfered()) expect(r.sirDb).toBeLessThan(UWB_SIR_MIN_DB)
  })

  it('the timestamp noise floor grows up to tenfold below 20 dB of SINR', () => {
    const sim = implRow('时间戳精度').sim
    const ps = num(sim, /(\d+) ps 的噪声/, 'ps')
    const ref = num(sim, /降到 (\d+) dB 以下/, 'ref')
    expect(tsSigmaNs(ps, ref + 5)).toBe(ps / 1000)
    expect(tsSigmaNs(ps, ref)).toBeCloseTo(ps / 1000, 9)
    expect(tsSigmaNs(ps, ref - 1)).toBeGreaterThan(ps / 1000)
    expect(sim).toContain('最多乘上十倍')
    expect(tsSigmaNs(ps, -100) / (ps / 1000)).toBeCloseTo(10, 9)
  })

  it('the session does no CCA: no UWB node ever emits a CCA record', () => {
    expect(implRow('空闲信道评估').kind).toBe('choice')
    expect(recs().filter((r) => (r.type === 'CCA_BUSY' || r.type === 'CCA_IDLE') && UWB_IDS.has(nodeOf(r) ?? ''))).toEqual([])
  })

  it('energy detection is compared over the whole channel (differs)', () => {
    const row = implRow('Wi-Fi 的能量检测')
    expect(row.kind).toBe('differs')
    expect(num(row.sim, /整条 (\d+) MHz 信道/, 'width')).toBe(WIDTH_MHZ)
    expect(num(row.sim, /与 ([−\d]+) dBm 比较/, 'ED')).toBe(CCA_ED_DBM)
  })

  it('no retry inside the block: one timeout per loss, the anchor missing from that block', () => {
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(interfered().length)
    const f = interfered()[0]
    const lostBlock = fixes().find((p) => p.t > f.t)!.block
    expect(tagRanges().filter((r) => r.peer === 'anchor-4' && r.block === lostBlock)).toHaveLength(0)
  })
})

describe('uwb-coexist · ③ every figure the labs print is the run', () => {
  it('lab 1: the band table', () => {
    const rows = tableOf(lab('两侧各自接收到的电平'), '各信道的频率范围').rows
    expect(rows[0][1]).toBe(`${UWB_BAND_MHZ[5].lo.toFixed(1)} to ${UWB_BAND_MHZ[5].hi.toFixed(1)} MHz`)
    expect(rows[0][2]).toBe(`${(UWB_BAND_MHZ[5].hi - UWB_BAND_MHZ[5].lo).toFixed(1)} MHz wide`)
    expect(rows[1][0]).toContain(`Wi-Fi ${sixGhzChannelNo(WIFI_6G_CENTER_MHZ)} 号`)
    expect(rows[1][1]).toBe(`${WIFI_6G_CENTER_MHZ - WIDTH_MHZ / 2} to ${WIFI_6G_CENTER_MHZ + WIDTH_MHZ / 2} MHz`)
    expect(rows[1][2]).toBe(`${uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)} of ${WIDTH_MHZ} MHz · overlap ${uwbBandOverlap(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5).toFixed(2)}`)
    expect(rows[2][0]).toContain(`Wi-Fi ${sixGhzChannelNo(CLEAR_6G_CENTER_MHZ)} 号`)
    expect(rows[2][1]).toBe(`${CLEAR_6G_CENTER_MHZ - WIDTH_MHZ / 2} to ${CLEAR_6G_CENTER_MHZ + WIDTH_MHZ / 2} MHz`)
    expect(rows[2][2]).toBe(`${uwbBandOverlapMhz(CLEAR_6G_CENTER_MHZ, WIDTH_MHZ, 5)} MHz · overlap ${uwbBandOverlap(CLEAR_6G_CENTER_MHZ, WIDTH_MHZ, 5).toFixed(2)}`)
    expect(rows[3][1]).toBe(`${UWB_BAND_MHZ[9].lo.toFixed(1)} to ${UWB_BAND_MHZ[9].hi.toFixed(1)} MHz`)
  })

  it('lab 1: the in-band formula is the engine\'s arithmetic', () => {
    const l = lab('两侧各自接收到的电平')
    const f = l.blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    const share = uwbBandOverlapMhz(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5)
    const uwbIn = uwbInBandDbm(UWB_TX_POWER_DBM, share)
    expect(f.text).toBe(`in-band EIRP = EIRP + 10·log10(W_overlap / W_own)      Wi-Fi: ${AP_DBM} + 10·log10(${share}/${WIDTH_MHZ}) = ${AP_DBM + 10 * Math.log10(uwbBandOverlap(WIFI_6G_CENTER_MHZ, WIDTH_MHZ, 5))} dBm      UWB: ${mn(UWB_TX_POWER_DBM, 0)} + 10·log10(${share}/${(UWB_BAND_MHZ[5].hi - UWB_BAND_MHZ[5].lo).toFixed(1)}) = ${mn(uwbIn)} dBm`)
    expect(num(f.note!, /就已损失 ([\d.]+) dB/, 'lost')).toBe(Number((UWB_TX_POWER_DBM - uwbIn).toFixed(2)))
  })

  it('lab 1: what each side hears, and the expect line under it', () => {
    const l = lab('两侧各自接收到的电平')
    const rows = tableOf(l, '两侧各自接收到的电平').rows
    const at = CORNERS.map(([, x, y]) => anchorAtTag(x, y))
    const ds = CORNERS.map(([, x, y]) => dist({ x, y, z: ANCHOR_Z }, TAG))
    const weakest = Math.min(...at)
    const sir = weakest - wifiAt(LAPTOP, LAPTOP_DBM, TAG)
    const loudest = Math.max(...[TAG, ...CORNERS.map(([, x, y]) => ({ x, y, z: ANCHOR_Z }))].flatMap((p) => [uwbAt(p, AP), uwbAt(p, { ...LAPTOP })]))
    expect(loudest).toBe(uwbAt(TAG, AP))
    expect(rows).toEqual([
      ['uwb-1', `路由器，相距 ${dist(AP, TAG).toFixed(2)} m`, `${mn(wifiAt(AP, AP_DBM, TAG))} dBm`],
      ['uwb-1', `笔记本，相距 ${dist(LAPTOP, TAG).toFixed(2)} m`, `${mn(wifiAt(LAPTOP, LAPTOP_DBM, TAG))} dBm`],
      ['uwb-1', `四个锚点，相距 ${Math.min(...ds).toFixed(2)} 至 ${Math.max(...ds).toFixed(2)} m`, `${mn(Math.max(...at))} to ${mn(weakest)} dBm`],
      ['uwb-1', '最弱的锚点相对笔记本', `SIR ${mn(sir)} dB · floor ${mn(UWB_SIR_MIN_DB, 0)} dB`],
      ['ap', `手机，相距 ${dist(TAG, AP).toFixed(2)} m`, `${mn(loudest)} dBm`],
      ['ap', `它自己 ${WIDTH_MHZ} MHz 上的噪声`, `${mn(noiseDbm(WIDTH_MHZ))} dBm · rise ${noiseRiseDb(loudest).toFixed(2)} dB`],
      ['ap', '能量检测门限（energy detection threshold）', `${mn(CCA_ED_DBM, 0)} dBm · ${(CCA_ED_DBM - loudest).toFixed(2)} dB above`],
    ])
    // the expect line's figures
    expect(num(l.expect, /比最强的锚点高 ([\d.]+) dB/, 'gap')).toBe(Number((wifiAt(AP, AP_DBM, TAG) - Math.max(...at)).toFixed(2)))
    expect(num(l.expect, /信干比是 ([−\d.]+) dB/, 'sir')).toBe(Number(sir.toFixed(2)))
    expect(num(l.expect, /距 ([−\d]+) dB 的门限/, 'floor')).toBe(UWB_SIR_MIN_DB)
    expect(num(l.expect, /还差 ([\d.]+) dB/, 'short')).toBe(Number((UWB_SIR_MIN_DB - sir).toFixed(1)))
    expect(num(l.expect, /噪声抬高 ([\d.]+) dB/, 'rise')).toBe(Number(noiseRiseDb(loudest).toFixed(2)))
    expect(num(l.expect, /比 ([−\d]+) dBm 低/, 'ED')).toBe(CCA_ED_DBM)
    expect(num(l.expect, /dBm 低 ([\d.]+) dB/, 'under')).toBe(Number((CCA_ED_DBM - loudest).toFixed(2)))
    // 「约 40 cm（计算得 0.37 m）」: where the in-band level of one ranging frame meets −62 dBm
    const crossoverM = 10 ** ((uwbInBandDbm(UWB_TX_POWER_DBM, WIDTH_MHZ) - uwbPl0Db(5) - CCA_ED_DBM) / (10 * UWB_PL_EXP))
    expect(num(l.expect, /计算得 ([\d.]+) m/, 'crossover')).toBe(Number(crossoverM.toFixed(2)))
    expect(num(l.expect, /约 (\d+) cm/, 'rounded up') / 100).toBe(Math.ceil(crossoverM * 10) / 10)
  })

  it('lab 2: the first loss, its log line, its timeout, and the worked figures', () => {
    const l = lab('一个应答如何丢失')
    const rs = recs()
    const f = interfered()[0]
    const line = /“([^”]+)”/.exec(l.expect)![1]
    expect(fmtRecord(f)).toBe(line)
    expect(num(l.expect, /^([\d.]+) ms 处/, 't')).toBe(Number((f.t / MS).toFixed(3)))
    const before = rs[rs.indexOf(f) - 1] as Extract<TLRecord, { type: 'RX_FAIL' }>
    expect([before.type, before.node, before.reason]).toEqual(['RX_FAIL', 'uwb-1', 'lowSinr'])
    const to = ofType(rs, 'UWB_TIMEOUT').find((r) => r.t > f.t)!
    expect([to.node, to.peer, to.expected]).toEqual(['uwb-1', 'anchor-4', 'uwbReport'])
    expect(num(l.expect, /([\d.]+) ms 之后那个时隙超时/, 'to')).toBe(Number(((to.t - f.t) / MS).toFixed(1)))
    expect(wifiAt(LAPTOP, LAPTOP_DBM, TAG)).toBeCloseTo(f.foreignDbm, 6)
    const gaps = new Set(interfered().slice(1).map((r, i) => r.t - interfered()[i].t))
    expect([...gaps]).toEqual([num(l.expect, /每 (\d+) ms 出现一次/, 'period') * MS])
    expect(new Set(interfered().map((r) => r.from))).toEqual(new Set(['anchor-4']))
    expect(new Set(ofType(rs, 'UWB_TIMEOUT').map((r) => r.expected))).toEqual(new Set(['uwbReport']))
    // the worked table
    const rows = tableOf(l, '第一次丢失的逐项数值').rows
    const rssi = anchorAtTag(9.5, 7.5)
    expect(rows[0]).toEqual([`${f.from} 的报告帧到达电平`, `${mn(rssi)} dBm`])
    expect(rows[1][1]).toBe(`${mn(f.foreignDbm)} dBm`)
    expect(rows[2][1]).toBe(`${mn(rssi)} − (${mn(f.foreignDbm)}) = ${mn(f.sirDb)} dB`)
    expect(rssi - f.foreignDbm).toBeCloseTo(f.sirDb, 6)
    expect(rows[3][0]).toContain(`${mn(UWB_SIR_MIN_DB, 0)} dB`)
    const after = fixes().find((p) => p.t > f.t)!
    expect(rows[4][1]).toBe(`GDOP ${after.gdop.toFixed(2)}, ${after.anchors.length} anchors`)
    // the steps name channel 5's own band and the engine's floor
    const steps = (l.blocks!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>).items.join(' ')
    expect(steps).toContain(`${UWB_BAND_MHZ[5].lo.toFixed(1)} 至 ${UWB_BAND_MHZ[5].hi.toFixed(1)} MHz`)
    expect(steps).toContain(`${mn(UWB_SIR_MIN_DB, 0)} dB`)
  })

  it('lab 3: the two position lines, and the inspector rows', () => {
    const l = lab('只用三个锚点的那次定位')
    const rows = tableOf(l, '相隔两个块的两行定位').rows
    const four = fixes()[0]
    const three = fixes().find((f) => f.anchors.length === 3)!
    expect(three.block - four.block).toBe(2)
    expect(rows[0][1]).toBe(fmtRecord(four))
    expect(rows[1][1]).toBe(fmtRecord(three))
    expect(l.expect).toContain(`误差仍是 ${fixErr(three).toFixed(2)} m`)
    expect(l.expect).toContain(`GDOP 从 ${four.gdop.toFixed(2)} 升到 ${three.gdop.toFixed(2)}`)
    expect(l.expect).toContain(`“${STRINGS.uwb.interfered}”`)
    const tag = inspectorAfter(undefined, 'uwb-1')
    expect(num(l.expect, /”是 (\d+)，与它的超时次数相同/, 'count')).toBe(tag.interfered)
    expect(tag.timeouts).toBe(tag.interfered)
    for (const [id] of CORNERS) expect(inspectorAfter(undefined, id).interfered, id).toBe(0)
  })

  it('lab 4: four runs, the table and the expect line', () => {
    const l = lab('五秒，四种运行')
    expect(uwbCoexist.variants!.map((v) => v.label).every((x) => l.steps[0].includes(x))).toBe(true)
    const rows = tableOf(l, '五秒，二十五个块').rows
    for (const [row, v] of [[rows[0], undefined], [rows[1], CH9], [rows[2], WIFI7], [rows[3], SAT]] as const) {
      expect(row[1], row[0]).toBe(`${wifiAirPct(v).toFixed(2)} %`)
      expect(row[2], row[0]).toBe(String(interfered(v).length))
      expect(row[3], row[0]).toBe(`${tagRanges(v).length} / ${4 * BLOCKS}`)
      expect(row[4], row[0]).toBe(String(fixes(v).length))
    }
    // 「后台备份每三个块丢失一帧」, 「八次只用三个锚点，误差都在 4.2 cm 以内」
    expect(fixes().filter((f) => f.anchors.length === 3).map((f) => f.block)).toEqual([2, 5, 8, 11, 14, 17, 20, 23])
    expect(l.expect).toContain(`其中${'零一二三四五六七八九'[fixes().filter((f) => f.anchors.length === 3).length]}次只用三个锚点`)
    expect(num(l.expect, /误差都在 ([\d.]+) cm/, 'cm')).toBe(Number((Math.max(...fixes().map(fixErr)) * 100).toFixed(1)))
    // 「9 号信道与 7 号信道两次运行的测距记录逐字段相同」
    expect(recs(WIFI7).filter(isUwbSide)).toEqual(recs(CH9).filter(isUwbSide))
    // throughput
    expect(num(l.expect, /都是 ([\d.]+) Mb\/s/, 'backup')).toBe(Number(mbps(recs(), 'laptop#6g').toFixed(3)))
    expect(mbps(recs(NO_UWB), 'laptop#6g').toFixed(3)).toBe(mbps(recs(), 'laptop#6g').toFixed(3))
    const { uwb: _session, ...sat } = scenarioOf(SAT)
    const alone: Scenario = { ...sat, nodes: sat.nodes.filter((n) => n.kind !== 'uwb') }
    expect(() => ScenarioSchema.parse(alone)).not.toThrow()
    const without = [...new Simulation(alone).runUntil(RUN_NS).records]
    const a = mbps(recs(SAT), 'laptop#6g')
    const b = mbps(without, 'laptop#6g')
    expect(num(l.expect, /（([\d.]+) 对/, 'sat')).toBe(Number(a.toFixed(3)))
    expect(num(l.expect, /对 ([\d.]+) Mb\/s）/, 'alone')).toBe(Number(b.toFixed(3)))
    expect(num(l.expect, /低 ([\d.]+) %/, 'pct')).toBe(Number(((b - a) / b * 100).toFixed(2)))
  })

  it('lab 5: the three cures, measured', () => {
    const l = lab('三种办法的定量比较')
    const rows = tableOf(l, '三种办法的定量比较').rows
    // row 0: the laptop in the far corner
    const room = BASE.rooms[0]
    let far = 0
    for (let x = 0; x <= room.w + 1e-9; x += 0.05) for (let y = 0; y <= room.h + 1e-9; y += 0.05) far = Math.max(far, dist({ x, y, z: LAPTOP.z }, TAG))
    expect(rows[0][0]).toContain(`${far.toFixed(2)} m`)
    const foreign = LAPTOP_DBM - wifiToUwbPathLossDb(far, 0)
    const best = Math.max(...CORNERS.map(([, x, y]) => anchorAtTag(x, y))) - foreign
    expect(rows[0][1]).toBe(`foreign ${mn(foreign)} dBm · best SIR ${mn(best)} dB`)
    const needed = (rssi: number): number => {
      let lo = 0.1, hi = 1000
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2
        if (rssi - (LAPTOP_DBM - wifiToUwbPathLossDb(mid, 0)) < UWB_SIR_MIN_DB) lo = mid; else hi = mid
      }
      return hi
    }
    expect(rows[0][2]).toContain(`需要 ${needed(anchorAtTag(0.5, 0.5)).toFixed(2)} m`)
    expect(rows[0][2]).toContain(`则需要 ${needed(anchorAtTag(9.5, 7.5)).toFixed(2)} m`)
    // row 1: partial overlap
    const PARTIAL = num(rows[1][0], /移到 (\d+) MHz/, 'partial')
    expect(rows[1][0]).toContain(`${sixGhzChannelNo(PARTIAL)} 号信道`)
    const ov = uwbBandOverlapMhz(PARTIAL, WIDTH_MHZ, 5)
    expect(rows[1][1]).toBe(`${ov} of ${WIDTH_MHZ} MHz · ${(ov / WIDTH_MHZ * 100).toFixed(0)} % · ${(-10 * Math.log10(ov / WIDTH_MHZ)).toFixed(2)} dB`)
    const partial = [...new Simulation({ ...BASE, sixGhzCenterMhz: PARTIAL }).runUntil(RUN_NS).records]
    const hit = ofType(partial, 'UWB_INTERFERED')
    expect(hit).toHaveLength(interfered().length)
    expect(new Set(hit.map((r) => r.sirDb.toFixed(2)))).toEqual(new Set([num(rows[1][2], /信干比 ([−\d.]+) dB/, 'sir').toFixed(2)]))
    expect(rows[1][2]).toContain(`那${'零一二三四五六七八九'[hit.length]}次丢失`)
    // row 2: clear of the band
    const CLEAR = num(rows[2][0], /移到 (\d+) MHz/, 'clear')
    expect(rows[2][0]).toContain(`${sixGhzChannelNo(CLEAR)} 号信道`)
    expect(uwbBandOverlapMhz(CLEAR, WIDTH_MHZ, 5)).toBe(0)
    const clear = [...new Simulation({ ...BASE, sixGhzCenterMhz: CLEAR }).runUntil(RUN_NS).records]
    expect(ofType(clear, 'UWB_INTERFERED')).toEqual([])
    expect(ofType(clear, 'UWB_RANGE').filter((r) => r.node === 'uwb-1')).toHaveLength(4 * BLOCKS)
    // row 3: channel 9, and the gap the expect line prints
    expect(interfered(CH9)).toEqual([])
    const top = num(l.expect, /最高中心频率 (\d+) MHz/, 'top')
    const width = num(l.expect, /开一条 (\d+) MHz/, 'width')
    expect(() => ScenarioSchema.parse({ ...BASE, sixGhzCenterMhz: top })).not.toThrow()
    expect(() => ScenarioSchema.parse({ ...BASE, sixGhzCenterMhz: top + 5 })).toThrow()
    expect(num(l.expect, /上边沿也只到 (\d+) MHz/, 'edge')).toBe(top + width / 2)
    expect(num(l.expect, /还有 ([\d.]+) MHz/, 'gap')).toBe(Number((UWB_BAND_MHZ[9].lo - (top + width / 2)).toFixed(1)))
    for (const w of [20, 40, 80, 160, 320]) expect(uwbBandOverlapMhz(top, w, 9), `${w}`).toBe(0)
  })
})

describe('uwb-coexist · the quiz figures are the run', () => {
  it('question 1: −42.79 against −80.57, 34 dB and 7.95 dB', () => {
    const q = uwbCoexist.quiz[0]
    expect(q.q).toContain(`${mn(wifiAt(AP, AP_DBM, TAG))} dBm`)
    expect(q.q).toContain(`${mn(uwbAt(TAG, AP))} dBm`)
    expect(q.options[1]).toContain(`${AP_DBM - UWB_TX_POWER_DBM} dB`)
    expect(q.options[1]).toContain(`${(UWB_TX_POWER_DBM - uwbInBandDbm(UWB_TX_POWER_DBM, WIDTH_MHZ)).toFixed(2)} dB`)
  })

  it('question 2: 8 of 100, 25 fixes, GDOP 1.05 → 1.26, 1.8 ms, 4.2 cm', () => {
    const q = uwbCoexist.quiz[1]
    expect(q.q).toContain(`在 ${4 * BLOCKS} 次测距里丢失了 ${interfered().length} 次`)
    expect(q.q).toContain(`${fixes().length} 次定位`)
    expect(q.options[1]).toContain(`GDOP 从 ${fixes()[0].gdop.toFixed(2)} 升到 ${fixes().find((f) => f.anchors.length === 3)!.gdop.toFixed(2)}`)
    const to = ofType(recs(), 'UWB_TIMEOUT')[0]
    expect(q.explain).toContain(`${((to.t - interfered()[0].t) / MS).toFixed(1)} ms`)
    expect(q.explain).toContain(`${(Math.max(...fixes().map(fixErr)) * 100).toFixed(1)} cm`)
  })
})
