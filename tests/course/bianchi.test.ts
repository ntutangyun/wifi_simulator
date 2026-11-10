/**
 * `@bianchi`, in the standard-first shape (2026-11-11).
 *
 * The lesson is built on an analytic model. ① is the DCF procedure the model abstracts, checked
 * against IEEE Std 802.11-2024; ② says what the engine does with each of those rules, and its
 * behavioural rows are checked against a run here; ③ introduces the model as Bianchi's paper (in
 * Wu et al.'s finite-retry form), never as the standard, and every figure it prints is read back
 * out of the lesson text and compared with ./bianchiModel.ts or with a ten-second run.
 *
 * The solver is pinned against an independent brute-force iteration, as before. The old
 * `limits` entry promising `fading` left with the `limits` section (the standard-first shape has
 * none); its rows in tests/course/limits.test.ts and tests/course/fading.test.ts went with it.
 */
import { describe, it, expect } from 'vitest'
import { lessonShapeSuite } from './kit'
import { bianchi, bianchiSlotTiming } from '../../src/course/tier1/bianchi'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { dcfTimes, saturationThroughput, solveBianchi, tauOf } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_TIMEOUT_NS, CW_MAX, CW_MIN, DIFS_NS, MANDATORY_MBPS, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
  ctrlRespRateFor, dataRateFor, noiseDbm,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'

const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

interface Stats {
  attempts: number
  collided: number
  p: number
  acks: number
  mbps: number
  rateMix: Map<number, number>
  drops: Record<string, number>
  records: TLRecord[]
}

const memo = new Map<string, Stats>()
function measure(key: string, scenario: Scenario): Stats {
  const hit = memo.get(key)
  if (hit) return hit
  const records = [...new Simulation(scenario).runUntil(RUN_NS).records]
  const rateMix = new Map<number, number>()
  const drops: Record<string, number> = {}
  let attempts = 0
  let collided = 0
  let acks = 0
  for (const r of records) {
    if (r.type === 'TX_START' && r.frame.kind === 'data') {
      attempts++
      rateMix.set(r.frame.mbps, (rateMix.get(r.frame.mbps) ?? 0) + 1)
    } else if (r.type === 'TX_START' && r.frame.kind === 'ack') acks++
    else if (r.type === 'RETRY') collided++
    else if (r.type === 'DROP') drops[r.reason] = (drops[r.reason] ?? 0) + 1
  }
  const out: Stats = { attempts, collided, p: collided / attempts, acks, mbps: (acks * PAYLOAD_BITS) / SECS / 1e6, rateMix, drops, records }
  memo.set(key, out)
  return out
}
const base = () => measure('n5', bianchi.scenario())
const variant = (i: number) => measure(`v${i}`, bianchi.variants![i].scenario())

const pct = (x: number, d = 2) => `${(100 * x).toFixed(d)} %`
const t6 = dcfTimes(1500, 6)
const t54 = dcfTimes(1500, 54)
const S = (n: number, t: { tsNs: number; tcNs: number }) => {
  const { tau } = solveBianchi({ n, ...PARAMS })
  return saturationThroughput({ n, tau, slotNs: SLOT_NS, tsNs: t.tsNs, tcNs: t.tcNs, payloadBits: PAYLOAD_BITS })
}

const lab = (heading: string): Lab => {
  const l = bianchi.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = bianchi.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => bianchi.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('bianchiModel · the fixed point', () => {
  /** An independent solution: a long truncated sum over stages, iterated p → τ → p until it stops moving. */
  function referenceFixedPoint(n: number, W: number, m: number, stages = 4000): { tau: number; p: number } {
    const tau = (p: number): number => {
      let num = 0
      let den = 0
      for (let i = 0; i < stages; i++) {
        const w = 2 ** Math.min(i, m) * W
        num += p ** i
        den += (p ** i * (w + 1)) / 2
      }
      return num / den
    }
    let p = 0.2
    for (let k = 0; k < 10_000; k++) {
      const next = 1 - (1 - tau(p)) ** (n - 1)
      if (Math.abs(next - p) < 1e-14) break
      p = 0.5 * p + 0.5 * next
    }
    return { tau: tau(p), p }
  }

  it('matches a brute-force iteration for the published W = 32, m = 3, n = 10 case', () => {
    const ref = referenceFixedPoint(10, 32, 3)
    const got = solveBianchi({ n: 10, W: 32, m: 3 })
    expect(got.p).toBeCloseTo(ref.p, 9)
    expect(got.tau).toBeCloseTo(ref.tau, 9)
  })

  it('matches the brute-force iteration for this engine’s W = 16, m = 6', () => {
    for (const n of [2, 5, 10, 20, 50]) {
      const ref = referenceFixedPoint(n, 16, 6)
      const got = solveBianchi({ n, W: 16, m: 6 })
      expect(got.p, `n=${n}`).toBeCloseTo(ref.p, 8)
      expect(got.tau, `n=${n}`).toBeCloseTo(ref.tau, 8)
    }
  })

  it('the closed form and the finite-retry sum agree when retries are plentiful', () => {
    expect(tauOf(0.3, { W: 16, m: 6, attempts: 400 })).toBeCloseTo(tauOf(0.3, { W: 16, m: 6 }), 12)
    expect(tauOf(0.5, { W: 16, m: 6 })).toBeCloseTo(2 / (16 + 1 + 0.5 * 16 * 6), 12)
  })
})

lessonShapeSuite(bianchi, { runNs: RUN_NS })

describe('bianchi · the lesson', () => {
  it('is in the standard-first shape, in the reading order, after its prerequisites', () => {
    expect(isStandardFirst(bianchi)).toBe(true)
    expect(bianchi.limits).toEqual([])
    expect(bianchi.observe).toEqual([])
    expect(bianchi.tryThis).toEqual([])
    expect(bianchi.needs).toEqual(['collisions-cw', 'queues'])
    for (const id of bianchi.needs!) expect(COURSE_ORDER.indexOf(id)).toBeLessThan(COURSE_ORDER.indexOf('bianchi'))
    expect(MODULES[bianchi.module]).toBeDefined()
  })

  it('① cites the DCF clauses, the OFDM constants, and says the standard has no performance formula', () => {
    for (const c of ['§10.3.3', '§10.3.4.3', '§10.3.7', '§10.3.2.11', '§10.3.4.4', '§10.6.6.5.2', '§17.4.3', '§17.4.4']) {
      expect(stdText(), c).toContain(c)
    }
    expect(stdText()).toContain('不给出碰撞概率或吞吐量的计算方法')
    // ① holds no model: neither equation, nor the paper's name
    expect(stdText()).not.toContain('τ')
    expect(stdText()).not.toContain('Bianchi')
    expect(stdText()).toContain(`aCWmin 为 ${CW_MIN}，aCWmax 为 ${CW_MAX}，aSlotTime 为 ${SLOT_NS / 1000} µs，aSIFSTime 为 ${SIFS_NS / 1000} µs`)
    expect(stdText()).toContain(`在 OFDM 物理层上为 ${DIFS_NS / 1000} µs`)
    expect(DIFS_NS).toBe(SIFS_NS + 2 * SLOT_NS)
    expect(stdText()).toContain(`即 ${ACK_TIMEOUT_NS / 1000} µs`)
  })

  it('the paper is named as a paper wherever the model is introduced', () => {
    expect(bianchi.why).toContain('这是论文的模型，不是标准的一部分')
    expect(lab('用计算器解出那一对数').steps[0]).toContain('它们出自论文，不是标准')
    expect(bianchi.sources!.some((s) => s.startsWith('模型出自论文，不是标准'))).toBe(true)
  })
})

describe('bianchi · ② says what the engine does, and the engine does it', () => {
  it('W, m and L are the engine’s window, doublings and retry limit', () => {
    expect(CW_MIN + 1).toBe(PARAMS.W)
    expect(2 ** PARAMS.m * PARAMS.W).toBe(CW_MAX + 1)
    expect(SHORT_RETRY_LIMIT).toBe(PARAMS.attempts)
    expect(implRow('竞争窗口的序列').sim).toContain(`W = ${PARAMS.W}、最多加倍 m = ${PARAMS.m} 次`)
    expect(implRow('重传上限').sim).toContain(`L = ${PARAMS.attempts}`)
  })

  it('a success and a collision cost what the row says, built from the engine’s own constants', () => {
    expect(t6.tsNs).toBe(t6.dataNs + SIFS_NS + t6.ackNs + DIFS_NS)
    expect(t6.tcNs).toBe(t6.dataNs + ACK_TIMEOUT_NS + DIFS_NS)
    expect(implRow('一次成功与一次碰撞的时长').sim).toContain(`${ACK_TIMEOUT_NS / 1000} µs 的 ACK 超时`)
  })

  it('the ACK goes at the highest of 6, 12, 24 Mb/s not above the data rate', () => {
    expect(MANDATORY_MBPS).toEqual([6, 12, 24])
    expect(ctrlRespRateFor(6)).toBe(6)
    expect(ctrlRespRateFor(54)).toBe(24)
    expect(implRow('确认帧的速率').sim).toContain('数据帧 6 Mb/s 时确认帧也是 6 Mb/s，54 Mb/s 时是 24 Mb/s')
    expect([t6.ackNs, t54.ackNs]).toEqual([44_000, 28_000])
  })

  it('the arc: every station at −81.7 dBm, 12.3 dB of SNR, 6 Mb/s, equal levels so no capture', () => {
    const scen = bianchi.scenario()
    const table = buildLinkTable(scen.nodes, scen.walls)
    const levels = scen.nodes.filter((n) => n.kind === 'sta').map((n) => table.get(n.id)!.get('ap')!)
    for (const l of levels) expect(l.toFixed(1)).toBe('-81.7')
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(0.01)
    expect((levels[0] - noiseDbm(20)).toFixed(1)).toBe('12.3')
    expect(dataRateFor(levels[0])).toBe(6)
    for (const n of scen.nodes.filter((x) => x.kind === 'sta')) expect(n.txPowerDbm).toBe(-20)
    expect(implRow('速率选择').sim).toContain('接入点收到 −81.7 dBm')
    expect(implRow('速率选择').sim).toContain('12.3 dB，只够 6 Mb/s')
    for (const s of [base, () => variant(0), () => variant(1), () => variant(2)]) expect([...s().rateMix.keys()]).toEqual([6])
  })

  it('a ten-minute lifetime, so nothing is ever dropped for age or for a full queue', () => {
    expect(bianchi.scenario().queue).toEqual({ limit: 500, lifetimeMs: 600_000 })
    for (const s of [base, () => variant(0), () => variant(1), () => variant(2)]) {
      expect(s().drops.lifetime).toBeUndefined()
      expect(s().drops.queueFull).toBeUndefined()
    }
  })

  it('not every row is faithful', () => {
    expect(bianchi.implementation!.some((x) => x.kind === 'faithful')).toBe(true)
    expect(bianchi.implementation!.some((x) => x.kind !== 'faithful')).toBe(true)
  })
})

describe('bianchi · ③ every figure the labs print is the model or the run', () => {
  it('lab 1: five stations send at t = 0, the pile-up clears at 2064 µs, and the AP never starts a reception it loses', () => {
    const rs = base().records
    expect(rs.filter((r) => r.type === 'TX_START' && r.t === 0).length).toBe(5)
    const first = rs.find((r) => r.type === 'COLLISION') as Extract<TLRecord, { type: 'COLLISION' }>
    expect(first.nodes.length).toBe(5)
    expect(first.t).toBe(t6.dataNs)
    const e = lab('五台站点的第一次碰撞').expect
    expect(e).toContain(`五台站点在 t = 0 同时发送，这次重叠到 ${t6.dataNs / 1000} µs 才结束`)
    expect(rs.some((r) => r.type === 'RX_MISS' && r.node === 'ap')).toBe(true)
    expect(rs.some((r) => r.type === 'RX_FAIL' && r.node === 'ap')).toBe(false)
  })

  it('lab 2: the displayed pair is the finite-retry pair the solver solves', () => {
    const f = blockOf(lab('用计算器解出那一对数'), 'formula', '本课要解的那一对方程')
    expect(f.text).toContain('Σ_{i<L} p^i')
    expect(f.text).toContain('p = 1 − (1−τ)^(n−1)')
    expect(f.text).not.toContain('2(1−2p)')
    expect(f.note).toContain(`L = ${PARAMS.attempts}`)
    expect(f.note).toContain(`W = ${PARAMS.W}、m = ${PARAMS.m}`)
  })

  it('lab 2: the worked example, row by row, and the expectation that quotes it', () => {
    const sol = solveBianchi({ n: 5, ...PARAMS })
    let num = 0
    let den = 0
    for (let i = 0; i < PARAMS.attempts; i++) {
      const w = 2 ** Math.min(i, PARAMS.m) * PARAMS.W
      num += sol.p ** i
      den += (sol.p ** i * (w + 1)) / 2
    }
    expect(num / den).toBeCloseTo(tauOf(sol.p, PARAMS), 12)
    const r = S(5, t6)
    const rows = Object.fromEntries(blockOf(lab('用计算器解出那一对数'), 'table', '五台站点：按步骤计算一遍').rows)
    expect(rows['n、W、m、L']).toBe(`5, ${PARAMS.W}, ${PARAMS.m}, ${PARAMS.attempts}`)
    expect(rows['同时满足两个关系的 p']).toBe(sol.p.toFixed(4))
    expect(rows['分子，p^i 之和']).toBe(num.toFixed(4))
    expect(rows['分母，p^i(W_i + 1)/2 之和']).toBe(den.toFixed(4))
    expect(rows['= τ']).toBe((num / den).toFixed(4))
    expect(rows['1 − (1 − τ)^4']).toBe(`${(1 - (1 - sol.tau) ** 4).toFixed(4)} ✓`)
    expect(rows['P_tr']).toBe(r.ptr.toFixed(4))
    expect(rows['P_s']).toBe(r.ps.toFixed(4))
    expect(rows['平均时隙']).toBe(`${(r.slotMeanNs / 1000).toFixed(1)} µs`)
    expect(rows['吞吐']).toBe(`${r.mbps.toFixed(3)} Mb/s`)
    const e = lab('用计算器解出那一对数').expect
    expect(e).toContain(`p = ${sol.p.toFixed(4)}，此时 τ = ${sol.tau.toFixed(4)}`)
    expect(e).toContain(`平均时隙 ${(r.slotMeanNs / 1000).toFixed(1)} µs，吞吐 ${r.mbps.toFixed(3)} Mb/s`)
    const steps = blockOf(lab('用计算器解出那一对数'), 'steps', '用计算器求出这一对数').items.join(' ')
    expect(steps).toContain(`σ = ${SLOT_NS / 1000} µs`)
    expect(steps).toContain('E[P] = 12,000 比特')
    expect(PAYLOAD_BITS).toBe(1500 * 8)
  })

  it('lab 3: T_s and T_c, term by term, and the figure drawn from the same constants', () => {
    const f = blockOf(lab('一个时隙的三种情形与四种站点数'), 'formula', '一次成功与一次碰撞各占多长时间')
    const u = (ns: number) => ns / 1000
    expect(f.text).toBe(`T_s = ${u(t6.dataNs)} + ${u(SIFS_NS)} + ${u(t6.ackNs)} + ${u(DIFS_NS)} = ${u(t6.tsNs)} µs        T_c = ${u(t6.dataNs)} + ${u(ACK_TIMEOUT_NS)} + ${u(DIFS_NS)} = ${u(t6.tcNs)} µs`)
    expect(f.note).toContain(`在 6 Mb/s 下为 ${u(t6.dataNs)} µs`)
    const spec = bianchiSlotTiming()
    expect(spec.lanes.map((l) => l.label)).toEqual(['空闲', '成功', '碰撞'])
    expect(spec.lanes[0].spans).toEqual([{ label: '9 µs', fromUs: 0, toUs: SLOT_NS / 1000 }])
    expect(spec.lanes[1].spans[1].toUs).toBe(u(t6.tsNs))
    expect(spec.lanes[2].spans[1].toUs).toBe(u(t6.tcNs))
    expect(SLOT_NS / t6.tsNs).toBeLessThan(0.01)
    expect(t6.tcNs / t6.tsNs).toBeGreaterThan(0.99)
  })

  it('lab 3: the model table, four rows, and the classic form beside it', () => {
    const rows = blockOf(lab('一个时隙的三种情形与四种站点数'), 'table', '这两个方程的预测结果').rows
    expect(rows.map((r) => r[0])).toEqual(['2', '5', '10', '20'])
    for (const [n, tau, p, s54, s6] of rows) {
      const sol = solveBianchi({ n: Number(n), ...PARAMS })
      expect(tau, `n=${n}`).toBe(sol.tau.toFixed(4))
      expect(p, `n=${n}`).toBe(pct(sol.p))
      expect(s54, `n=${n}`).toBe(S(Number(n), t54).mbps.toFixed(2))
      expect(s6, `n=${n}`).toBe(`${S(Number(n), t6).mbps.toFixed(3)} Mb/s`)
    }
    const classic = blockOf(lab('一个时隙的三种情形与四种站点数'), 'formula', '论文原版：无限重传')
    expect(classic.text).toContain('2(1−2p)')
    expect(classic.note).toContain(`原式给出 ${pct(solveBianchi({ n: 20, W: 16, m: 6 }).p)}，有限重传形式给出 ${pct(solveBianchi({ n: 20, ...PARAMS }).p)}`)
    const e = lab('一个时隙的三种情形与四种站点数').expect
    expect(e).toContain(`碰撞概率从 ${rows[0][2]} 升到 ${rows[3][2]}`)
    expect(e).toContain(`吞吐从 ${rows[0][4]} 降到 ${rows[3][4]}`)
    expect(e).toContain(`一次碰撞只比一次成功短 ${(t6.tsNs - t6.tcNs) / 1000} µs，一个空闲时隙只有 ${SLOT_NS / 1000} µs`)
    // the lab loads n = 20 and compares n = 2 and n = 10
    expect(bianchi.variants!.map((v) => v.label)).toEqual(['n = 2 台站点', 'n = 10 台站点', 'n = 20 台站点'])
  })

  it('lab 4: the two ten-second runs, cell for cell, and the three seeds', () => {
    const rows = blockOf(lab('预测与实测'), 'table', '十秒实测').rows
    const runs: [string, Stats, number][] = [['n = 5', base(), 5], ['n = 10', variant(1), 10]]
    runs.forEach(([label, s, n], i) => {
      expect(rows[i]).toEqual([
        label, String(s.attempts), String(s.collided), String(s.acks), pct(s.p), pct(solveBianchi({ n, ...PARAMS }).p),
        `${s.mbps.toFixed(3)} Mb/s`, `${S(n, t6).mbps.toFixed(3)} Mb/s`,
      ])
    })
    const e = lab('预测与实测').expect
    const [, b] = runs[0]
    const [, v] = runs[1]
    expect(e).toContain(`五台站点十秒内发送 ${b.attempts} 次，其中 ${b.collided} 次失败，即 ${pct(b.p)}，预测 ${pct(solveBianchi({ n: 5, ...PARAMS }).p)}`)
    expect(e).toContain(`十台站点 ${v.attempts} 次中 ${v.collided} 次失败，${v.acks} 个确认帧，${v.mbps.toFixed(3)} Mb/s，预测 ${S(10, t6).mbps.toFixed(3)} Mb/s`)
    const seeds = [7, 8, 12345].map((seed) => {
      const scen = bianchi.scenario()
      scen.seed = seed
      return pct(measure(`seed${seed}`, scen).p)
    })
    expect(bianchi.scenario().seed).toBe(7)
    expect(e).toContain(`种子 7、8、12345 的五台站点实测碰撞率分别为 ${seeds.join('、')}`)
    // the why's 「比预测低不到两个百分点」
    const gap = solveBianchi({ n: 5, ...PARAMS }).p - b.p
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThan(0.02)
  })
})
