/**
 * `@width`, in the standard-first shape (2026-11-11).
 *
 * ① is what IEEE Std 802.11be-2024 says about channel width — the subcarrier counts of Table
 * 36-19, N_DBPS and the symbol, TXTIME, the LDPC-only rungs, the 3 dB-per-doubling sensitivity
 * table, the per-TXOP width choice of §10.23.2.5 and CCA on the primary 20 MHz channel; ② marks
 * the engine against each; ③ is four runs. Every figure the labs, `why` and the quiz print is read
 * back out of the lesson text here and compared with the engine (`PHY_MODES`, `noiseDbm`, the link
 * table, `mcsForRssi`, `txTimeModeNs`) or with a run, so a number edited in the lesson without the
 * engine agreeing turns this red, and so does an engine change that moves a number still printed.
 *
 * `width` no longer has `limits`, so its old `until: 'selectivity'` promise left the ledger in
 * tests/course/limits.test.ts; ②'s row 「信道模型」 points the reader at `selectivity` instead,
 * and the last `it` below pins that pointer.
 */
import { describe, it, expect } from 'vitest'
import { width, widthAirtimeTiming } from '../../src/course/tier2/width'
import { widthScenario } from '../../src/course/wifiScenes'
import { MODULES, COURSE_ORDER } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { LESSONS } from '../../src/course/lessons'
import { ZH_TERMS, gradedProseTexts, zhAkaViolations, zhTermFailure } from '../../src/course/readability'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { negotiatedWidth } from '../../src/model/caps'
import {
  CCA_ED_DBM, CCA_PD_DBM, NOISE_FIGURE_DB, PHY_MODES, RATE_MARGIN_DB, TDFT_EHT_NS, TGI_NS, TLTF_2X_NS,
  mcsForRssi, noiseDbm, ppduTiming, reqSinrDb, toneRatio, txTimeModeNs,
} from '../../src/engine/phy'
import { ppduLayout } from '../../src/model/frameFields'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
/**
 * 1500 bytes of payload leave the station as a 1530-octet MPDU. 2026-11-11 (W7a): an EHT PSDU is
 * always an A-MPDU (§10.12.5), so the one MPDU goes out as an S-MPDU (§10.12.7) behind a 4-octet
 * delimiter, and the airtime is computed from APEP_LENGTH = 1534 octets (§10.12.6).
 */
const MPDU = 1530
const OCTETS = MPDU + 4
const WIDTHS = [20, 40, 80, 160] as const
const TONES_20 = 234

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  ofType(rs, 'TX_START').filter(pred)
const bigData = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.bytes > 1000)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
const neg = (v: number, d: number): string => v.toFixed(d).replace('-', '−')
const us1 = (ns: number): string => (ns / US).toFixed(1)
const cell = (rows: string[][], first: string): string[] => {
  const r = rows.find((x) => x[0] === first)
  expect(r, `row 「${first}」`).toBeDefined()
  return r!
}

const lab = (heading: string): Lab => {
  const l = width.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = width.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => width.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** One of the four width variants with the laptop moved, memoised. */
const movedRuns = new Map<string, TLRecord[]>()
function moved(variant: number, x: number, y: number, ns: number): TLRecord[] {
  const key = `${variant}@${x},${y}/${ns}`
  if (!movedRuns.has(key)) {
    const sc: Scenario = width.variants![variant].scenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x, y, z: 1 }
    movedRuns.set(key, [...new Simulation(sc).runUntil(ns).records])
  }
  return movedRuns.get(key)!
}
const rssiAt = (x?: number, y?: number): number => {
  const sc = width.scenario()
  if (x !== undefined) sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x, y: y!, z: 1 }
  return buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
}

lessonShapeSuite(width, { runNs: RUN_NS })

describe('width · the lesson', () => {
  it('is in the standard-first shape, in M9, after the Tier 1 lessons its words come from', () => {
    expect(isStandardFirst(width)).toBe(true)
    expect(MODULES[width.module].title).toBe('容量参数与速率控制')
    expect(width.needs).toEqual(['mcs-ladder', 'noise-floor', 'airtime'])
    expect(width.limits).toEqual([])
    expect(width.observe).toEqual([])
    expect(width.tryThis).toEqual([])
  })

  it('keeps the scene and the four variants, so the recorded hashes stay', () => {
    expect(width.scenario()).toEqual(widthScenario(160, 1))
    expect(width.variants!.map((v) => v.scenario())).toEqual(WIDTHS.map((w) => widthScenario(w, 1)))
    for (const v of width.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('cites each clause it teaches in ①, and keeps the simulator out of it', () => {
    const std = stdText()
    for (const c of ['§36.1.1', '表 36-18', '表 36-19', '表 36-76', '式 36-122', '式 36-123', '式 36-110',
      '式 36-49', '§36.3.13.3.3', '§36.3.21.2', '表 36-67', '§10.23.2.5', '§10.6.5.8', '§36.3.21.6', '§35.14.4.1']) {
      expect(std, c).toContain(c)
    }
    for (const sim of ['48 µs', '−93.99', '3.01', '7 dB', '本仿真器']) expect(std, sim).not.toContain(sim)
  })

  it('marks what the engine does not do, and does not call it faithful', () => {
    expect(implRow('带宽怎样确定').kind).toBe('differs')
    // 2026-11-11 (W6): the preamble, the symbol count and CCA follow the standard; the packet
    // extension rests on the simulator's stated nominal packet padding.
    expect(implRow('前导码的时长').kind).toBe('faithful')
    expect(implRow('数据符号的个数').kind).toBe('faithful')
    expect(implRow('空闲信道评估').kind).toBe('faithful')
    expect(implRow('包扩展').kind).toBe('value')
    expect(width.implementation!.filter((r) => r.kind !== 'faithful').length).toBeGreaterThan(4)
  })

  it('brackets every official term at its first Chinese use', () => {
    const zh = gradedProseTexts(width).join(' ')
    const failures: string[] = []
    for (const t of ZH_TERMS.filter((x) => !x.track || x.track === 'wifi')) {
      const why = zhTermFailure(zh, t)
      if (why) failures.push(why)
      failures.push(...zhAkaViolations(zh, t))
    }
    expect(failures).toEqual([])
  })
})

describe('width · ① the standard’s numbers are the ones the engine holds', () => {
  it('Table 36-19: data and pilot subcarriers, and the totals they make', () => {
    const std = stdText()
    const data = [234, 468, 980, 1960, 3920]
    const pilots = [8, 16, 16, 32, 64]
    // the engine's tone ratio reproduces the data column at every width it builds
    for (const [i, w] of [20, 40, 80, 160, 320].entries()) expect(TONES_20 * toneRatio('eht', w)).toBe(data[i])
    expect(std).toContain(`分别有 ${data.join('、')} 根数据子载波`)
    expect(std).toContain(`${pilots.join('、')} 根导频子载波`)
    expect(std).toContain(`合计 ${data.map((d, i) => d + pilots[i]).join('、')} 根`)
    expect(width.why).toContain(`20 MHz 有 ${data[0]} 根，40、80、160 MHz 分别有 ${data.slice(1, 4).join('、')} 根`)
  })

  it('Table 36-76 and Table 36-18: 2340 bits, 172.1 Mb/s, a 13.6 µs symbol', () => {
    const std = stdText()
    expect(PHY_MODES.eht.ndbps[13]).toBe(2340)
    expect(PHY_MODES.eht.mbps[13]).toBe(172.1)
    expect(TDFT_EHT_NS + TGI_NS.base).toBe(13_600)
    expect(PHY_MODES.eht.symNs).toBe(13_600)
    expect(std).toContain('MCS 13（4096-QAM（quadrature amplitude modulation）5/6）的 N_DBPS 是 2340，0.8 µs 保护间隔下的速率是 172.1 Mb/s')
    expect(std).toContain('0.8 µs 保护间隔时为 13.6 µs')
  })

  it('Table 36-67: the BPSK 1/2 and the MCS 13 rows climb 3 dB a doubling from the engine’s 20 MHz entries', () => {
    const std = stdText()
    const row = (mcs: number) => [0, 1, 2, 3, 4].map((k) => neg(PHY_MODES.eht.sensDbm[mcs] + 3 * k, 0)).join('、')
    expect(std).toContain(`320 MHz 上是 ${row(0)} dBm`)
    expect(std).toContain(`MCS 13 是 ${row(13)} dBm`)
  })
})

describe('width · ② says what the engine does, and the engine does it', () => {
  it('a link runs the narrower end’s width, the whole run long', () => {
    const sc = widthScenario(160, 1)
    const [ap, sta] = sc.nodes
    expect(negotiatedWidth(ap, { ...sta, caps: { ...sta.caps, widthMhz: 80 } })).toBe(80)
    for (const i of [0, 1, 2, 3]) expect(one(bigData(runOf(width, i, RUN_NS)).map((r) => r.frame.widthMhz))).toBe(WIDTHS[i])
    expect(implRow('带宽怎样确定').sim).toContain('两端配置的较小值')
  })

  it('80 MHz is 4.19 times 20 MHz, as the row prints it', () => {
    expect(implRow('数据子载波数').sim).toContain(`980 ÷ 234 = ${toneRatio('eht', 80).toFixed(2)} 倍`)
  })

  it('the preamble is the fields of Table 36-18 added up: 51.2 µs', () => {
    // 2026-11-11 (W6): L-STF 8 + L-LTF 8 + L-SIG 4 + RL-SIG 4 + U-SIG 8 + two EHT-SIG symbols 8
    // + EHT-STF 4 + one 2x EHT-LTF 7.2
    expect(implRow('前导码的时长').kind).toBe('faithful')
    const fields = 8 + 8 + 4 + 4 + 8 + 2 * 4 + 4 + (TLTF_2X_NS + TGI_NS.base) / US
    expect(fields.toFixed(1)).toBe('51.2')
    expect(PHY_MODES.eht.preambleNs).toBe(Math.round(fields * US))
    expect(implRow('前导码的时长').sim).toContain(`是 ${fields.toFixed(1)} µs`)
  })

  it('LDPC where it is mandatory, the symbol counts 6, 3, 2, 1, and the packet extension', () => {
    expect(implRow('数据符号的个数').kind).toBe('faithful')
    const sim = implRow('数据符号的个数').sim
    const ldpc = 8 * OCTETS + 16
    const bcc = 16 + 8 * OCTETS + 6
    expect(sim).toContain(`按 LDPC 计数（${ldpc} 位`)
    expect(sim).toContain(`用 BCC（${bcc} 位）`)
    const t = WIDTHS.map((w) => ppduTiming('eht', OCTETS, 13, { widthMhz: w }))
    expect(t.every((x) => x.coding === 'ldpc')).toBe(true)
    expect(sim).toContain(`四档的符号数是 ${t.map((x) => x.nsym).join('、')}`)
    expect(implRow('包扩展').kind).toBe('value')
    expect(implRow('包扩展').sim).toContain(`四档依次是 ${t.map((x) => x.peNs / US).join('、')} µs`)
  })

  it('the noise floor and the requirement the rows print', () => {
    expect(NOISE_FIGURE_DB).toBe(7)
    const step = noiseDbm(40) - noiseDbm(20)
    expect(implRow('噪声随带宽').sim).toContain(`升高 ${step.toFixed(2)} dB；20 MHz 上是 ${neg(noiseDbm(20), 2)} dBm`)
    expect(implRow('每一级所需的信噪比').sim).toContain(`MCS 13 是 ${reqSinrDb('eht', 13).toFixed(2)} dB；选级时再加 ${RATE_MARGIN_DB} dB`)
    expect(width.why).toContain(`带宽每加倍升高 ${step.toFixed(2)} dB`)
  })

  it('carrier sense: the two thresholds, measured within the primary 20 MHz channel', () => {
    expect(implRow('空闲信道评估').kind).toBe('faithful')
    const sim = implRow('空闲信道评估').sim
    expect(sim).toContain(`主 20 MHz 信道内的电平与 ${neg(CCA_PD_DBM, 0)} dBm 比较`)
    expect(sim).toContain(`总功率与 ${neg(CCA_ED_DBM, 0)} dBm 比较`)
  })

  it('the flat channel row hands the reader to `selectivity`, the very next lesson', () => {
    const sel = LESSONS.find((l) => l.id === 'selectivity')!
    expect(implRow('信道模型').sim).toContain(`《${sel.title.split('——')[0]}》`)
    expect(COURSE_ORDER.indexOf('selectivity')).toBe(COURSE_ORDER.indexOf('width') + 1)
    expect(width.scenario().fading).toBeUndefined()
    expect(width.scenario().selectivity).toBeUndefined()
  })
})

describe('width · ③ every figure the labs print is the run', () => {
  it('lab 1: one frame at four widths, and the timing figure drawn from the same run', () => {
    const l = lab('同一帧，四种带宽')
    const rows = tableOf(l, '1530 字节的帧，Wi-Fi 7，单流，书桌上').rows
    const air: number[] = []
    WIDTHS.forEach((w, i) => {
      const rs = runOf(width, i, RUN_NS)
      const data = bigData(rs)
      expect(one(data.map((r) => r.frame.smpdu))).toBe(true)
      expect(one(data.map((r) => r.frame.apepBytes))).toBe(OCTETS)
      const t = one(data.map((r) => r.frame.txTimeNs))
      air.push(t)
      const [label, tones, mcs, rate, syms, airtime] = rows[i]
      expect(label).toBe(`${w} MHz`)
      expect(tones).toBe(String(TONES_20 * toneRatio('eht', w)))
      expect(mcs).toBe(String(one(data.map((r) => r.frame.mcs))))
      expect(rate).toBe(`${one(data.map((r) => r.frame.mbps)).toFixed(1)} Mb/s`)
      expect(syms).toBe(String(ppduLayout(data[0]!.frame).find((s) => s.key === 'data')!.symbols))
      expect(airtime).toBe(`${us1(t)} µs`)
      expect(txTimeModeNs('eht', OCTETS, 13, { widthMhz: w })).toBe(t)
      expect(one(txs(rs, (r) => r.frame.kind === 'ack').map((r) => r.frame.txTimeNs))).toBe(28 * US)
    })
    expect(l.expect).toContain(`空口时间依次是 ${air.map(us1).join('、')} µs`)
    expect(l.expect).toContain(`即 ${rows.map((r) => r[4]).join('、')} 个数据符号，加 ${PHY_MODES.eht.preambleNs / US} µs 的前导码与包扩展`)
    expect(l.expect).toContain('四档的确认帧都是 28 µs')
    expect(l.meaning).toContain(`前导码已占整帧的 ${(PHY_MODES.eht.preambleNs / air[3] * 100).toFixed(1)} %`)
    // the figure: preamble, data symbols, then packet extension + rounding up to the airtime
    const spec = widthAirtimeTiming()
    spec.lanes.forEach((lane, i) => {
      const t = ppduTiming('eht', OCTETS, 13, { widthMhz: WIDTHS[i] })
      expect(lane.label).toBe(`${WIDTHS[i]} MHz`)
      expect(lane.spans[0].toUs).toBe(PHY_MODES.eht.preambleNs / US)
      expect(lane.spans[1].toUs).toBeCloseTo((t.preambleNs + t.nsym * t.symNs) / US, 9)
      expect(lane.spans[2].toUs).toBeCloseTo(air[i] / US, 9)
    })
    // `why` and the quiz: 129.6 → 61.6 µs, 8.38 times the data tones, 47.5 %
    expect(width.why).toContain(`从 20 MHz 的 ${us1(air[0])} µs 缩短到 160 MHz 的 ${us1(air[3])} µs`)
    expect(width.why).toContain(`数据子载波是 ${toneRatio('eht', 160).toFixed(2)} 倍，时间只缩短到 ${(air[3] / air[0] * 100).toFixed(1)} %`)
    const q = width.quiz[0]
    expect(q.q).toContain(`20 MHz 要 ${us1(air[0])} µs；到 160 MHz，数据子载波是 ${toneRatio('eht', 160).toFixed(2)} 倍，却仍要 ${us1(air[3])} µs`)
    expect(q.explain).toContain(`已占整帧的 ${(PHY_MODES.eht.preambleNs / air[3] * 100).toFixed(1)} %`)
  })

  it('lab 2: the desk’s level, four floors and four SNRs against what MCS 13 asks', () => {
    const l = lab('书桌上的噪声代价')
    const rows = tableOf(l, '同一位置，四种带宽').rows
    const rx = rssiAt()
    const need = reqSinrDb('eht', 13) + RATE_MARGIN_DB
    WIDTHS.forEach((w, i) => {
      expect(rows[i]).toEqual([`${w} MHz`, `${neg(noiseDbm(w), 2)} dBm`, `${(rx - noiseDbm(w)).toFixed(1)} dB`, `${need.toFixed(1)} dB`])
      expect(rx - noiseDbm(w)).toBeGreaterThan(need)
    })
    expect(l.expect).toContain(`到达电平是 ${neg(rx, 2)} dBm`)
    expect(l.expect).toContain(`升高 ${(noiseDbm(40) - noiseDbm(20)).toFixed(2)} dB`)
    expect(l.expect).toContain(`只剩 ${(rx - noiseDbm(160)).toFixed(1)} dB，仍高于 MCS 13 要求的 ${need.toFixed(1)} dB`)
  })

  it('lab 3: the living room — 3, 3, 2, 0 and the inversion, step by step', () => {
    const l = lab('客厅中间：更宽反而更慢')
    expect(l.steps[0]).toContain('x = 10.5、y = 6')
    const rows = tableOf(l, '笔记本在客厅中间').rows
    const got = WIDTHS.map((_w, i) => {
      const rs = moved(i, 10.5, 6, 50 * MS)
      const d = bigData(rs)
      expect(d.length).toBeGreaterThan(20)
      expect(ofType(rs, 'DROP')).toEqual([])
      return { mcs: one(d.map((r) => r.frame.mcs)), air: one(d.map((r) => r.frame.txTimeNs)), retries: ofType(rs, 'RETRY').length }
    })
    WIDTHS.forEach((w, i) => expect(rows[i]).toEqual([`${w} MHz`, String(got[i].mcs), `${us1(got[i].air)} µs`, String(got[i].retries)]))
    expect(l.expect).toContain(`MCS 依次是 ${got.map((g) => g.mcs).join('、')}，空口时间 ${got.map((g) => us1(g.air)).join('、')} µs`)
    expect(got[3].air).toBeGreaterThan(got[2].air)

    // the worked table, value for value, from the functions ② names
    const rx = rssiAt(10.5, 6)
    const steps = tableOf(l, '最宽两档，按 ② 逐步计算').rows
    const r2 = (x: number) => x.toFixed(2)
    const m80 = mcsForRssi('eht', rx, 13, 80), m160 = mcsForRssi('eht', rx, 13, 160)
    expect([m80, m160]).toEqual([got[2].mcs, got[3].mcs])
    expect(cell(steps, '到达电平').slice(1)).toEqual([`${neg(rx, 2)} dBm`, `${neg(rx, 2)} dBm`])
    expect(cell(steps, '噪声地板').slice(1)).toEqual([`${neg(noiseDbm(80), 2)} dBm`, `${neg(noiseDbm(160), 2)} dBm`])
    expect(cell(steps, 'SNR').slice(1)).toEqual([`${r2(rx - noiseDbm(80))} dB`, `${r2(rx - noiseDbm(160))} dB`])
    expect(cell(steps, '可用的最高一级').slice(1)).toEqual([`MCS ${m80}`, `MCS ${m160}`])
    const req = (m: number) => `${r2(reqSinrDb('eht', m))} + ${RATE_MARGIN_DB} = ${r2(reqSinrDb('eht', m) + RATE_MARGIN_DB)} dB`
    expect(cell(steps, '它的要求（含余量）').slice(1)).toEqual([req(m80), req(m160)])
    expect(cell(steps, '上一级的要求').slice(1)).toEqual([req(m80 + 1), req(m160 + 1)])
    const nd = (m: number, w: number) => PHY_MODES.eht.ndbps[m] * toneRatio('eht', w)
    expect(cell(steps, '每符号比特数').slice(1)).toEqual([
      `${PHY_MODES.eht.ndbps[m80]} × ${toneRatio('eht', 80).toFixed(2)} = ${nd(m80, 80)}`,
      `${PHY_MODES.eht.ndbps[m160]} × ${toneRatio('eht', 160).toFixed(2)} = ${nd(m160, 160)}`,
    ])
    // 80 and 160 MHz are wider than a 242-tone RU: LDPC, no tail bits (§36.3.13.3.3)
    const bits = 16 + 8 * OCTETS
    expect(cell(steps, `数据符号（LDPC，没有尾比特）：⌈${bits} ÷ 每符号比特数⌉`).slice(1))
      .toEqual([String(Math.ceil(bits / nd(m80, 80))), String(Math.ceil(bits / nd(m160, 160)))])
    const t80 = ppduTiming('eht', OCTETS, m80, { widthMhz: 80 }), t160 = ppduTiming('eht', OCTETS, m160, { widthMhz: 160 })
    expect([t80.nsym, t160.nsym]).toEqual([Math.ceil(bits / nd(m80, 80)), Math.ceil(bits / nd(m160, 160))])
    expect(cell(steps, '包扩展').slice(1)).toEqual([`${t80.peNs / US} µs`, `${t160.peNs / US} µs`])
    const airCell = (t: typeof t80, measured: number): string => {
      const raw = Number(((t.preambleNs + t.nsym * t.symNs + t.peNs) / US).toFixed(1))
      const head = `${t.preambleNs / US} + ${Number((t.nsym * t.symNs / US).toFixed(1))} + ${t.peNs / US} = ${raw}`
      return t.roundNs > 0 ? `${head}，取整 ${us1(measured)} µs` : `${head.replace(/ = [\d.]+$/, '')} = ${us1(measured)} µs`
    }
    expect(cell(steps, '空口时间：51.2 + 13.6 × 符号数 + 包扩展，取整').slice(1)).toEqual([airCell(t80, got[2].air), airCell(t160, got[3].air)])
    // 「差 0.54 dB」 and 「MCS 2 的要求只比 MCS 1 高 2 dB」
    expect(l.expect).toContain(`差 ${r2(reqSinrDb('eht', m160 + 1) + RATE_MARGIN_DB - (rx - noiseDbm(160)))} dB`)
    expect(reqSinrDb('eht', 2) - reqSinrDb('eht', 1)).toBeCloseTo(2, 9)
    expect(noiseDbm(160) - noiseDbm(80)).toBeGreaterThan(2)
    expect(PHY_MODES.eht.ndbps[2] / PHY_MODES.eht.ndbps[0]).toBe(3)
  })

  it('lab 4: the far corner — 80 and 160 MHz get nothing back, the narrower two deliver', () => {
    // 2026-11-11 (W6): the −82 dBm preamble threshold is compared with the primary 20 MHz share.
    const l = lab('最远的角落')
    expect(l.steps[0]).toContain('x = 15、y = 7')
    const rows = tableOf(l, '笔记本在最远的角落').rows
    const rx = rssiAt(15, 7)
    const drops: number[] = []
    WIDTHS.forEach((w, i) => {
      const rs = moved(i, 15, 7, 200 * MS)
      const d = bigData(rs)
      const acks = txs(rs, (r) => r.frame.kind === 'ack').length
      expect(rows[i]).toEqual([`${w} MHz`, String(one(d.map((r) => r.frame.mcs))), `${us1(one(d.map((r) => r.frame.txTimeNs)))} µs`, String(acks)])
      const p20 = rx - 10 * Math.log10(w / 20)
      if (w >= 80) {
        expect(p20).toBeLessThan(CCA_PD_DBM)
        expect(acks).toBe(0)
        expect(ofType(rs, 'RX_START').filter((r) => r.node === 'ap')).toEqual([])
        drops.push(ofType(rs, 'DROP').length)
        expect(l.expect).toContain(`${w} MHz 时${w === 80 ? '落在主 20 MHz 信道内的' : ''}只有 ${neg(p20, 2)} dBm`)
      } else {
        expect(p20).toBeGreaterThanOrEqual(CCA_PD_DBM)
        expect(acks).toBeGreaterThan(200)
        expect(ofType(rs, 'DROP')).toEqual([])
      }
    })
    expect(l.expect).toContain(`200 ms 内分别丢弃了 ${drops[0]} 与 ${drops[1]} 个帧`)
    expect(l.expect).toContain(`到达电平是 ${neg(rx, 2)} dBm`)
    expect(l.expect).toContain(`SNR 只有 ${(rx - noiseDbm(160)).toFixed(2)} dB，本来也低于 MCS 0 要求的 ${reqSinrDb('eht', 0).toFixed(2)} dB`)
    expect(rx - noiseDbm(160)).toBeLessThan(reqSinrDb('eht', 0))
    const q = width.quiz[2]
    expect(q.explain).toContain(`SNR 是 ${(rx - noiseDbm(160)).toFixed(2)} dB，低于 MCS 0 要求的 ${reqSinrDb('eht', 0).toFixed(2)} dB`)
    expect(q.explain).toContain(`低 ${(noiseDbm(160) - noiseDbm(80)).toFixed(2)} dB`)
  })
})
