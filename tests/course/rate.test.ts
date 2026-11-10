/**
 * `@rate`, in the standard-first shape (2026-11-11).
 *
 * ① is what the standard says about choosing a rate — constraints only (§10.6.5.8, §35.14.4.1),
 * MCS 10–13 optional (§36.1.1), success known from the Ack within AckTimeout (§10.3.2.11), the
 * MRQ/MFB feedback a receiver may send (§26.13, §35.19), and the sensitivity table as a test
 * requirement (§36.3.21.2). ② is this simulator's ceiling and loop. ③ four runs of the 3 s scene
 * `rate-fallback` also loads. Every figure the labs, `why` and the quiz print is read back out of
 * the lesson text here and compared with the engine or with that run.
 */
import { describe, it, expect } from 'vitest'
import { rate } from '../../src/course/tier2/rate'
import { rateScenario } from '../../src/course/wifiScenes'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ZH_TERMS, gradedProseTexts, zhAkaViolations, zhTermFailure } from '../../src/course/readability'
import type { TLRecord } from '../../src/model/records'
import { buildLinkTable } from '../../src/engine/propagation'
import { FAILURES_TO_STEP_DOWN } from '../../src/engine/rate'
import {
  ACK_TIMEOUT_NS, PHY_MODES, RATE_MARGIN_DB, RX_START_DELAY_NS, SIFS_NS, SLOT_NS, mcsForRssi, noiseDbm, reqSinrDb,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 3000 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const recs = (): TLRecord[] => runOf(rate, undefined, RUN_NS)
const dataOf = (node: string): Tx[] => ofType(recs(), 'TX_START').filter((r) => r.node === node && r.frame.kind === 'data')
const neg = (v: number, d: number): string => v.toFixed(d).replace('-', '−')
const us1 = (ns: number): string => (ns / US).toFixed(1)
const pct1 = (a: number, b: number): string => (a / b * 100).toFixed(1)
const rssi = (node: string): number => {
  const sc = rateScenario()
  return buildLinkTable(sc.nodes, sc.walls).get(node)!.get('ap')!
}

const lab = (heading: string): Lab => {
  const l = rate.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = rate.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => rate.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** The far station's frames that an ACK timeout followed: the frame ends, the timeout lands within 50 µs. */
const lostFar = (): Tx[] => {
  const timeouts = ofType(recs(), 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2').map((r) => r.t)
  return dataOf('sta-2').filter((f) => {
    const end = f.t + f.frame.txTimeNs
    return timeouts.some((x) => x > end && x <= end + 50 * US)
  })
}

lessonShapeSuite(rate, { runNs: 30 * MS })

describe('rate · the lesson', () => {
  it('is in the standard-first shape, in M9, and keeps the scene `rate-fallback` loads', () => {
    expect(isStandardFirst(rate)).toBe(true)
    expect(MODULES[rate.module].title).toBe('容量参数与速率控制')
    expect(rate.needs).toEqual(['mcs-ladder', 'retries-queues', 'rate-vs-model', 'width'])
    expect(rate.scenario()).toEqual(rateScenario())
    expect(rate.limits).toEqual([])
    expect(rate.observe).toEqual([])
    expect(rate.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and keeps the simulator out of it', () => {
    const std = stdText()
    for (const c of ['§10.6.5.8', '§36.1.1', '§35.14.4.1', '§10.3.2.11', '§26.13', '§35.19', '§36.3.21.2', '表 36-67']) expect(std, c).toContain(c)
    for (const sim of ['3 dB', '上限', '本仿真器']) expect(std, sim).not.toContain(sim)
  })

  it('marks what the engine does not do, and does not call it faithful', () => {
    expect(implRow('链路自适应反馈').kind).toBe('absent')
    expect(implRow('速率选择算法').kind).toBe('choice')
    expect(implRow('上限的计算').kind).toBe('value')
    expect(rate.implementation!.filter((r) => r.kind !== 'faithful').length).toBeGreaterThan(3)
  })

  it('brackets every official term at its first Chinese use', () => {
    const zh = gradedProseTexts(rate).join(' ')
    const failures: string[] = []
    for (const t of ZH_TERMS.filter((x) => !x.track || x.track === 'wifi')) {
      const why = zhTermFailure(zh, t)
      if (why) failures.push(why)
      failures.push(...zhAkaViolations(zh, t))
    }
    expect(failures).toEqual([])
  })
})

describe('rate · ② says what the engine does, and the engine does it', () => {
  it('two failures down, ten successes up, as `why` and the row print them', () => {
    expect(FAILURES_TO_STEP_DOWN).toBe(2)
    expect(implRow('速率选择算法').sim).toContain(`连续 ${FAILURES_TO_STEP_DOWN} 次失败降一级，连续 10 次成功升一级`)
    expect(rate.why).toContain(`连续 ${FAILURES_TO_STEP_DOWN} 次失败降一级，连续 10 次成功升一级`)
  })

  it('the 3 dB margin and the 10 dB noise figure behind every requirement', () => {
    expect(RATE_MARGIN_DB).toBe(3)
    // reqSinr = sensitivity at 20 MHz − (kTB at 20 MHz + 10 dB)
    expect(reqSinrDb('eht', 0)).toBeCloseTo(PHY_MODES.eht.sensDbm[0] - (-174 + 10 * Math.log10(20e6) + 10), 9)
    expect(implRow('上限的计算').sim).toContain(`「所需信噪比 + ${RATE_MARGIN_DB} dB ≤ SNR」`)
  })

  it('AckTimeout is 16 + 9 + 20 = 45 µs', () => {
    expect([SIFS_NS, SLOT_NS, RX_START_DELAY_NS].map((x) => x / US)).toEqual([16, 9, 20])
    expect(ACK_TIMEOUT_NS).toBe(45 * US)
    expect(implRow('成败的判定').sim).toContain('16 + 9 + 20 = 45 µs')
  })

  it('without 4096-QAM negotiated the ceiling is capped at MCS 11', () => {
    expect(PHY_MODES.eht.qam4kFromMcs).toBe(12)
    expect(rateScenario().nodes.every((n) => !n.caps.features?.qam4k)).toBe(true)
  })
})

describe('rate · ③ every figure the labs print is the run', () => {
  it('lab 1: the far station’s three rungs, and never above its ceiling', () => {
    const l = lab('远端站点的三个级别')
    const far = dataOf('sta-2')
    const rows = tableOf(l, '远端站点 3 s 内的帧：1530 字节，20 MHz，单流').rows
    const atMcs = (m: number) => far.filter((r) => r.frame.mcs === m)
    ;[2, 1, 0].forEach((m, i) => {
      const xs = atMcs(m)
      expect(new Set(xs.map((r) => r.frame.txTimeNs)).size).toBe(1)
      expect(rows[i][0].startsWith(`MCS ${m}`)).toBe(true)
      expect(rows[i].slice(1)).toEqual([`${xs[0].frame.mbps.toFixed(1)} Mb/s`, `${us1(xs[0].frame.txTimeNs)} µs`, `${pct1(xs.length, far.length)} %`])
    })
    expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(2)
    const ratio = (atMcs(0)[0].frame.txTimeNs / atMcs(2)[0].frame.txTimeNs).toFixed(1)
    expect(l.expect).toContain(`远端站点 3 s 内发出 ${far.length} 个数据帧，没有一帧高于 MCS 2`)
    expect(l.expect).toContain(`一帧从 ${us1(atMcs(2)[0].frame.txTimeNs)} µs 变成 ${us1(atMcs(1)[0].frame.txTimeNs)} µs，降到 MCS 0 是 ${us1(atMcs(0)[0].frame.txTimeNs)} µs，为上限时的 ${ratio} 倍`)
    expect(rate.why).toContain(`3 s 里 ${pct1(atMcs(2).length, far.length)} % 的帧以上限发送`)
    expect(rate.why).toContain(`上限时的 ${ratio} 倍`)
  })

  it('lab 2: the ceiling worked step by step from the link table', () => {
    const l = lab('按步骤算出远端的上限')
    const rows = tableOf(l, '远端链路的上限').rows
    const rx = rssi('sta-2')
    const snr = rx - noiseDbm(20)
    const cap = PHY_MODES.eht.qam4kFromMcs! - 1
    const ceiling = mcsForRssi('eht', rx, cap, 20)
    const req = (m: number) => `${reqSinrDb('eht', m).toFixed(2)} + ${RATE_MARGIN_DB} = ${(reqSinrDb('eht', m) + RATE_MARGIN_DB).toFixed(2)} dB`
    expect(rows).toEqual([
      ['平均接收电平', `${neg(rx, 2)} dBm`],
      ['20 MHz 的噪声地板', `${neg(noiseDbm(20), 2)} dBm`],
      ['SNR', `${snr.toFixed(2)} dB`],
      ['能力上限：两端都未启用 4096-QAM', `MCS ${cap}`],
      [`MCS ${ceiling} 的要求（含余量）`, `${req(ceiling)}，满足`],
      [`MCS ${ceiling + 1} 的要求（含余量）`, `${req(ceiling + 1)}，不满足`],
      ['上限', `MCS ${ceiling}`],
    ])
    expect(Math.max(...dataOf('sta-2').map((r) => r.frame.mcs!))).toBe(ceiling)
    expect(l.expect).toContain(`SNR 是 ${snr.toFixed(2)} dB，满足 MCS ${ceiling} 的 ${(reqSinrDb('eht', ceiling) + RATE_MARGIN_DB).toFixed(2)} dB，不满足 MCS ${ceiling + 1} 的 ${(reqSinrDb('eht', ceiling + 1) + RATE_MARGIN_DB).toFixed(2)} dB`)
    expect(rate.quiz[2].explain).toContain(`SNR ${snr.toFixed(2)} dB 不满足 MCS ${ceiling + 1} 的 ${(reqSinrDb('eht', ceiling + 1) + RATE_MARGIN_DB).toFixed(2)} dB`)
  })

  it('lab 3: the near station — 4010 frames, all MCS 11, no timeout', () => {
    const l = lab('近端站点不需要选择')
    const near = dataOf('sta-1')
    expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([11]))
    expect(ofType(recs(), 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1')).toEqual([])
    const snr = rssi('sta-1') - noiseDbm(20)
    expect(mcsForRssi('eht', rssi('sta-1'))).toBe(13)
    expect(l.expect).toContain(`近端站点 3 s 内发出 ${near.length} 个数据帧，全部是 MCS 11，没有一次 ACK 超时`)
    expect(l.expect).toContain(`SNR 是 ${snr.toFixed(2)} dB，高于 MCS 13 要求的 ${(reqSinrDb('eht', 13) + RATE_MARGIN_DB).toFixed(2)} dB`)
  })

  it('lab 4: the first ACK timeout, and how many timeouts share a start with the near station', () => {
    const l = lab('一次 ACK 超时')
    const first = ofType(recs(), 'ACK_TIMEOUT')[0]
    expect(first.node).toBe('sta-2')
    const frame = dataOf('sta-2').filter((r) => r.t < first.t).at(-1)!
    expect(frame.t + frame.frame.txTimeNs + ACK_TIMEOUT_NS).toBe(first.t)
    expect(dataOf('sta-1').some((n) => n.t === frame.t)).toBe(true)
    expect(l.expect).toContain(`两台站点都在 ${us1(frame.t).replace('.0', '')} µs 开始发送；远端那一帧以 MCS ${frame.frame.mcs} 发送，${us1(frame.t + frame.frame.txTimeNs)} µs 结束，${ACK_TIMEOUT_NS / US} µs 后即 ${us1(first.t)} µs 记下 ACK 超时`)
    const timeouts = ofType(recs(), 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2')
    const lost = lostFar()
    expect(lost).toHaveLength(timeouts.length)
    const same = lost.filter((f) => dataOf('sta-1').some((n) => n.t === f.t)).length
    expect(l.expect).toContain(`3 s 内远端共有 ${timeouts.length} 次 ACK 超时，其中 ${same} 次发生在与近端站点同时开始的帧上`)
    expect(rate.why).toContain(`远端的 ${timeouts.length} 次 ACK 超时（ACK timeout）中，有 ${same} 次发生在它与近端站点同时开始发送的帧上`)
    expect(rate.quiz[0].explain).toContain(`${timeouts.length} 次超时中有 ${same} 次`)
  })
})
