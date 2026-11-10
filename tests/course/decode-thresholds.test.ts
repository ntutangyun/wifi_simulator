/**
 * `@decode-thresholds`, in the standard-first shape (2026-11-11).
 *
 * ① is what IEEE Std 802.11-2024 specifies about reception: a minimum input sensitivity as a
 * conformance requirement, PHY-RXEND.indication, the FCS check, the acknowledgement after SIFS
 * and EIFS after an error, and the §3.1 link margin — and nothing about how a receiver decides.
 * ② is this simulator's decision. ③ is `radio-primer`'s scene plus the far wall at 40, 80 and
 * 160 MHz. Every figure the labs and the quiz print is read back out of the lesson text and
 * compared with the engine: `PHY_MODES`, `reqSinrDb`, `noiseDbm`, the link table and the run.
 */
import { describe, it, expect } from 'vitest'
import { decodeThresholds } from '../../src/course/tier1/decode-thresholds'
import { primerScenario } from '../../src/course/tier1/radioLink'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import {
  CCA_ED_DBM, CCA_PD_DBM, EIFS_NS, PHY_MODES, RATE_MARGIN_DB, SIFS_NS, noiseDbm, reqSinrDb,
} from '../../src/engine/phy'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { buildLinkTable } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { NodeCfg, Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 100 * MS

const lab = (heading: string): Lab => {
  const l = decodeThresholds.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = decodeThresholds.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => decodeThresholds.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

const neg = (v: number, d: number): string => v.toFixed(d).replace('-', '−')
const db2 = (v: number): string => `${v.toFixed(2)} dB`
const upDbm = (s: Scenario): number => buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
const withWidth = (s: Scenario, w: number): Scenario =>
  ({ ...s, nodes: s.nodes.map((n) => ({ ...n, caps: { ...n.caps, widthMhz: w as NodeCfg['caps']['widthMhz'] } })) })
const txOf = (rs: TLRecord[], node: string, kind: string) =>
  ofType(rs, 'TX_START').filter((r) => r.node === node && r.frame.kind === kind)
const farRuns = new Map<number, TLRecord[]>()
const farRecs = (w: number): TLRecord[] => {
  if (!farRuns.has(w)) farRuns.set(w, [...new Simulation(withWidth(primerScenario(14), w)).runUntil(RUN_NS).records])
  return farRuns.get(w)!
}

lessonShapeSuite(decodeThresholds, { sameSceneAs: 'radio-primer', runNs: RUN_NS })

describe('decode-thresholds · the lesson', () => {
  it('is in the standard-first shape, third in M1', () => {
    expect(isStandardFirst(decodeThresholds)).toBe(true)
    expect(MODULES[decodeThresholds.module].title).toBe('信号与链路')
    expect(decodeThresholds.needs).toEqual(['radio-primer', 'noise-floor'])
    expect(decodeThresholds.terms!.map((t) => t.term)).toEqual(['MCS', 'sensitivity', 'rate margin'])
    expect(decodeThresholds.limits).toEqual([])
    expect(decodeThresholds.observe).toEqual([])
    expect(decodeThresholds.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and says the standard does not decide', () => {
    const std = stdText()
    for (const c of ['§17.3.10.2', '表 17-21', '§27.3.22.2', '表 27-58', '§36.3.21.2', '表 36-67', '§3.1',
      '§8.3.5.15', '§9.2.4.9', '§10.3.2.11', '§10.3.2.3.7', '§17.3.10.6']) expect(std, c).toContain(c)
    expect(std).toContain('不超过 10%')
    expect(std).toContain('1000 个八位组')
    expect(std).toContain('4096 个八位组')
    expect(std).toContain('接收机怎样判决')
    for (const sim of ['90.99', '8.99', '4 dB', '3 dB']) expect(std, sim).not.toContain(sim)
  })

  it('①: the sensitivities it quotes are the ones the engine stores', () => {
    const std = stdText()
    const he = PHY_MODES.he.sensDbm, eht = PHY_MODES.eht.sensDbm
    expect(std).toContain(`MCS 0 到 ${he.length - 1} 从 ${neg(he[0], 0)} dBm 到 ${neg(he[he.length - 1], 0)} dBm`)
    expect(std).toContain(`${neg(eht[12], 0)} 与 ${neg(eht[13], 0)} dBm`)
    // Table 17-21's two ends, which the clause-17 table in phy.ts starts and ends with
    expect(std).toContain('BPSK（binary phase-shift keying）1/2 是 −82 dBm，64-QAM（quadrature amplitude modulation）3/4 是 −65 dBm')
    expect(std).toContain(`${neg(CCA_PD_DBM, 0)} dBm`)
  })

  it('marks what differs and what is absent', () => {
    // 2026-11-11 (W6): both thresholds are measured within the primary 20 MHz channel now
    // (§27.3.22.6.3, §36.3.21.6.3).
    expect(implRow('能量检测（energy detection, ED）').kind).toBe('faithful')
    expect(implRow('前导检测的电平').kind).toBe('faithful')
    // 2026-11-11 (W7a): an A-MPDU is judged MPDU by MPDU and the BlockAck bitmap reports each
    // (§9.7.2, §9.3.1.8.2); this row used to pin one decision per PPDU.
    expect(implRow('聚合帧').kind).toBe('faithful')
    expect(implRow('帧校验序列').kind).toBe('absent')
    expect(implRow('灵敏度表').kind).toBe('faithful')
  })
})

describe('decode-thresholds · ② says what the engine does, and the engine does it', () => {
  it('a required SINR is the sensitivity plus 90.99 dB, whatever the width', () => {
    const k = -noiseDbm(20, 10)
    expect(k.toFixed(2)).toBe('90.99')
    for (let i = 0; i < PHY_MODES.eht.sensDbm.length; i++) expect(reqSinrDb('eht', i)).toBeCloseTo(PHY_MODES.eht.sensDbm[i] + k, 9)
    const sim = implRow('所需 SINR').sim
    expect(sim).toContain(`灵敏度 + ${k.toFixed(2)} dB`)
    expect(sim).toContain(`第 0 级是 ${db2(reqSinrDb('eht', 0))}`)
  })

  it('the sensitivity rows are the standard’s 20 MHz column', () => {
    expect(PHY_MODES.he.sensDbm).toEqual([-82, -79, -77, -74, -70, -66, -65, -64, -59, -57, -54, -52])
    expect(PHY_MODES.eht.sensDbm.slice(12)).toEqual([-49, -46])
    expect(implRow('灵敏度表').sim).toContain('−82 到 −52 dBm')
  })

  it('preamble detection: −82 dBm and 4 dB; energy detection: −62 dBm', () => {
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    expect(CCA_PD_DBM).toBe(-82)
    expect(CCA_ED_DBM).toBe(-62)
    expect(implRow('前导检测（preamble detection）的比值').sim).toContain(`SINR 不低于 ${PREAMBLE_DETECT_SINR_DB} dB`)
    expect(implRow('能量检测（energy detection, ED）').sim).toContain(`${neg(CCA_ED_DBM, 0)} dBm`)
    // a 160 MHz PPDU's primary 20 MHz holds an eighth of its power
    expect(implRow('前导检测的电平').sim).toContain(`低 ${(10 * Math.log10(8)).toFixed(2)} dB`)
  })

  it('every PSDU of the scene is an S-MPDU, answered by an Ack', () => {
    for (const i of [0, 1, 2, 3]) {
      const rs = runOf(decodeThresholds, i, RUN_NS)
      const data = txOf(rs, 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(50)
      expect(data.every((r) => r.frame.smpdu === true && r.frame.ampdu === undefined)).toBe(true)
      expect(txOf(rs, 'ap', 'ba')).toEqual([])
    }
    expect(implRow('聚合帧').sim).toContain('本课场景的每个 PSDU 都是只装一个 MPDU 的 A-MPDU，由确认帧回复')
  })

  it('the acknowledgement follows after SIFS, and the margin is 3 dB', () => {
    expect(SIFS_NS).toBe(16_000)
    expect(implRow('确认与 EIFS').sim).toContain(`${SIFS_NS / 1000} µs`)
    expect(EIFS_NS).toBeGreaterThan(SIFS_NS)
    expect(RATE_MARGIN_DB).toBe(3)
    expect(implRow('速率余量').sim).toContain(`+ ${RATE_MARGIN_DB} dB`)
  })
})

describe('decode-thresholds · ③ every figure the labs print is the run', () => {
  it('lab 1: the living room’s first frame decodes, and the ACK follows 16 µs later', () => {
    const l = lab('客厅那一帧解码成功')
    const rows = tableOf(l, '客厅那台笔记本的第一帧').rows
    const rs = runOf(decodeThresholds, undefined, RUN_NS)
    const d = txOf(rs, 'sta-1', 'data')[0]
    const ack = txOf(rs, 'ap', 'ack')[0]
    const mcs = d.frame.mcs!
    const sinr = upDbm(decodeThresholds.scenario()) - noiseDbm(20)
    expect(rows[0][1]).toBe(`MCS ${mcs}`)
    expect(rows[1][1]).toBe(`${neg(PHY_MODES.eht.sensDbm[mcs], 0)} dBm`)
    expect(rows[2][1]).toBe(db2(reqSinrDb('eht', mcs)))
    expect(rows[3][1]).toBe(db2(sinr))
    expect(rows[4][1]).toContain(`${(ack.t - d.t - d.frame.txTimeNs) / 1000} µs 后`)
    expect(ofType(rs, 'RX_OK').some((r) => r.node === 'ap' && r.from === 'sta-1')).toBe(true)
    expect(l.expect).toContain(`${db2(sinr)} 高于 ${db2(reqSinrDb('eht', mcs))}`)
    expect(l.expect).toContain(`${((d.t + d.frame.txTimeNs) / 1000).toFixed(1)} µs 结束`)
    expect(l.expect).toContain(`${(ack.t / 1000).toFixed(1)} µs 开始`)
  })

  it('lab 2: four places, no failure, and the margin above every requirement', () => {
    const l = lab('四个位置都没有失败')
    const rows = tableOf(l, '四个位置，100 ms').rows
    rows.forEach((row, i) => {
      const rs = runOf(decodeThresholds, i, RUN_NS)
      const mcs = txOf(rs, 'sta-1', 'data')[0].frame.mcs!
      const snr = upDbm(decodeThresholds.variants![i].scenario()) - noiseDbm(20)
      expect(row[1]).toBe(String(mcs))
      expect(row[2]).toBe(db2(reqSinrDb('eht', mcs)))
      expect(row[3]).toBe(`${snr.toFixed(1)} dB`)
      expect(snr - reqSinrDb('eht', mcs)).toBeGreaterThanOrEqual(RATE_MARGIN_DB)
      expect(row[4]).toBe(String(ofType(rs, 'RX_FAIL').length))
      expect(row[5]).toBe(String(txOf(rs, 'ap', 'ack').length))
      expect(ofType(rs, 'RETRY')).toEqual([])
      expect(ofType(rs, 'ACK_TIMEOUT')).toEqual([])
    })
  })

  it('lab 3: the far wall at 20, 40, 80 and 160 MHz', () => {
    // 2026-11-11 (W6): the −82 dBm preamble threshold is compared with the power inside the
    // primary 20 MHz channel (§27.3.22.6.3), so from 80 MHz on this link's preamble is not
    // detected at all — it used to be detected at 160 MHz and fail its decode instead.
    const l = lab('远端墙边加宽到 40、80 与 160 MHz')
    expect(l.variant).toBe(3)
    const rows = tableOf(l, '同一位置，四种带宽，100 ms').rows
    const rx = upDbm(primerScenario(14))
    const req0 = reqSinrDb('eht', 0)
    const p20 = (w: number): number => rx - 10 * Math.log10(w / 20)
    const W = [20, 40, 80, 160]
    W.forEach((w, i) => {
      const [width, prim, floor, snr, need] = rows[i]
      expect(width).toBe(`${w} MHz`)
      expect(prim).toBe(`${neg(p20(w), 2)} dBm`)
      expect(floor).toBe(`${neg(noiseDbm(w), 2)} dBm`)
      expect(snr).toBe(db2(rx - noiseDbm(w)))
      expect(need).toBe(db2(req0))
    })
    const runs = W.map(farRecs)
    for (const i of [0, 1]) {
      const rs = runs[i]!
      expect(p20(W[i]!)).toBeGreaterThanOrEqual(CCA_PD_DBM)
      expect(rows[i]![5]).toBe(`以 MCS ${txOf(rs, 'sta-1', 'data')[0].frame.mcs} 发送，${txOf(rs, 'ap', 'ack').length} 帧被确认`)
      expect(ofType(rs, 'RX_FAIL')).toEqual([])
    }
    for (const i of [2, 3]) {
      const rs = runs[i]!
      expect(p20(W[i]!)).toBeLessThan(CCA_PD_DBM)
      // nothing starts at the router: no RX_START, no RX_FAIL, no ACK
      expect(ofType(rs, 'RX_START').filter((r) => r.node === 'ap')).toEqual([])
      expect(ofType(rs, 'RX_FAIL')).toEqual([])
      expect(txOf(rs, 'ap', 'ack')).toEqual([])
      expect(rows[i]![5]).toBe(`前导码未检出，${ofType(rs, 'ACK_TIMEOUT').length} 次 ACK 超时`)
    }
    expect(l.expect).toContain(`到达电平都是 ${neg(rx, 2)} dBm`)
    expect(l.expect).toContain(`40 MHz 时主 20 MHz 信道内的电平是 ${neg(p20(40), 2)} dBm，仍不低于 ${neg(CCA_PD_DBM, 0)} dBm`)
    expect(l.expect).toContain(`即 ${neg(p20(80), 2)} dBm，低于 ${neg(CCA_PD_DBM, 0)} dBm`)
    expect(l.expect).toContain(`发送方 ${ofType(runs[2]!, 'ACK_TIMEOUT').length} 次等到 ACK 超时`)
    expect(l.expect).toContain(`80 MHz 的 SNR ${db2(rx - noiseDbm(80))} 其实高于 MCS 0 所需的 ${db2(req0)}`)
    expect(l.expect).toContain(`160 MHz 时主 20 MHz 信道内只有 ${neg(p20(160), 2)} dBm`)
  })
})

describe('decode-thresholds · the quiz is the run', () => {
  it('the 80 MHz question and the margin question carry the lab’s figures', () => {
    const rx = upDbm(primerScenario(14))
    const q2 = decodeThresholds.quiz[1]
    expect(q2.answer).toBe(0)
    expect(q2.explain).toContain(`到达电平 ${neg(rx, 2)} dBm`)
    expect(q2.explain).toContain(`只有 ${neg(rx - 10 * Math.log10(4), 2)} dBm，低于前导检测的 ${neg(CCA_PD_DBM, 0)} dBm`)
    expect(q2.explain).toContain(`SNR ${db2(rx - noiseDbm(80))} 虽然高于 MCS 0 所需的 ${db2(reqSinrDb('eht', 0))}`)
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    const q3 = decodeThresholds.quiz[2]
    // the living room: 21.66 dB at MCS 3; MCS 4 plus the 3 dB margin is out of reach
    const living = upDbm(primerScenario(9)) - noiseDbm(20)
    expect(q3.explain).toContain(`${db2(living)} 比 MCS 3 所需的 ${db2(reqSinrDb('eht', 3))} 高 ${db2(living - reqSinrDb('eht', 3))}`)
    expect(reqSinrDb('eht', 4) + RATE_MARGIN_DB).toBeGreaterThan(living)
    expect(decodeThresholds.quiz[0].options[decodeThresholds.quiz[0].answer]).toContain('不得超过 10%')
  })
})
