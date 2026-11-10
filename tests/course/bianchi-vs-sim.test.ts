/**
 * `@bianchi-vs-sim`, in the standard-first shape (2026-11-11).
 *
 * ① is what IEEE Std 802.11-2024 says about the places the run and the model part company: a
 * sender counts failures, not collisions (§10.3.2.11, §10.3.4.3); the counter is frozen for the
 * whole busy period (§10.3.4.3); a station that detected a frame it could not receive waits EIFS
 * (§10.3.3, §10.3.7 Eq. (10-7)). ② says what the engine does with each, and ③'s figures are read
 * back out of the lesson text and compared with ten-second runs and with ./bianchiModel.ts.
 *
 * On this scene the access point's RX_MISS count and the RETRY count are the SAME number, so
 * nothing is ever captured and the measured retry rate really is the collision rate the model
 * defines. The old slot-clock probe figure (≈ 47.9 %, from a patched MAC) is no longer printed:
 * the lesson states only its direction, which the comparison table pins.
 */
import { describe, it, expect } from 'vitest'
import { lessonShapeSuite } from './kit'
import { bianchiVsSim, bianchiVsSimJumps, bianchiVsSimVariants } from '../../src/course/tier1/bianchi-vs-sim'
import { bianchi } from '../../src/course/tier1/bianchi'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { ACK_TIMEOUT_NS, DIFS_NS, EIFS_NS, SIFS_NS, SLOT_NS, dataRateFor } from '../../src/engine/phy'
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
  eifs: number
  perStationP: number[]
  rateMix: Map<number, number>
  records: TLRecord[]
}

const memo = new Map<string, Stats>()
function measure(key: string, scenario: Scenario): Stats {
  const hit = memo.get(key)
  if (hit) return hit
  const records = [...new Simulation(scenario).runUntil(RUN_NS).records]
  const attemptsBy = new Map<string, number>()
  const retriesBy = new Map<string, number>()
  const rateMix = new Map<number, number>()
  let acks = 0
  let eifs = 0
  for (const r of records) {
    if (r.type === 'TX_START' && r.frame.kind === 'data') {
      attemptsBy.set(r.node, (attemptsBy.get(r.node) ?? 0) + 1)
      rateMix.set(r.frame.mbps, (rateMix.get(r.frame.mbps) ?? 0) + 1)
    } else if (r.type === 'TX_START' && r.frame.kind === 'ack') acks++
    else if (r.type === 'RETRY') retriesBy.set(r.node, (retriesBy.get(r.node) ?? 0) + 1)
    else if (r.type === 'IFS_START' && r.kind === 'EIFS') eifs++
  }
  let attempts = 0
  let collided = 0
  const perStationP: number[] = []
  for (const [id, a] of attemptsBy) {
    attempts += a
    collided += retriesBy.get(id) ?? 0
    perStationP.push((retriesBy.get(id) ?? 0) / a)
  }
  const out: Stats = { attempts, collided, p: collided / attempts, acks, mbps: (acks * PAYLOAD_BITS) / SECS / 1e6, eifs, perStationP, rateMix, records }
  memo.set(key, out)
  return out
}
const arc5 = () => measure('arc5', bianchiVsSim.variants![0].scenario())
const arc20 = () => measure('arc20', bianchiVsSim.variants![1].scenario())
const arcN = (n: number): Stats => n === 5 ? arc5() : n === 20 ? arc20()
  : measure(`n${n}`, bianchi.variants![n === 2 ? 0 : 1].scenario())
const misses = (s: Stats): number => s.records.filter((r) => r.type === 'RX_MISS' && r.node === 'ap').length

const pct = (x: number, d = 2) => `${(100 * x).toFixed(d)} %`
const t6 = dcfTimes(1500, 6)
const model = (n: number, tcNs = t6.tcNs) => {
  const sol = solveBianchi({ n, ...PARAMS })
  return { ...sol, mbps: saturationThroughput({ n, tau: sol.tau, slotNs: SLOT_NS, tsNs: t6.tsNs, tcNs, payloadBits: PAYLOAD_BITS }).mbps }
}

const lab = (heading: string): Lab => {
  const l = bianchiVsSim.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = bianchiVsSim.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => bianchiVsSim.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(bianchiVsSim, { runNs: RUN_NS })

describe('bianchi-vs-sim · the lesson', () => {
  it('is in the standard-first shape, right after the model lesson, sharing its scene with rate-vs-model', () => {
    expect(isStandardFirst(bianchiVsSim)).toBe(true)
    expect(bianchiVsSim.limits).toEqual([])
    expect(bianchiVsSim.observe).toEqual([])
    expect(bianchiVsSim.tryThis).toEqual([])
    expect(COURSE_ORDER.indexOf('bianchi-vs-sim')).toBe(COURSE_ORDER.indexOf('bianchi') + 1)
    expect(bianchiVsSim.needs).toEqual(['bianchi', 'anomaly'])
    expect(bianchiVsSim.terms!.map((t) => t.term)).toEqual(['capture', 'residual'])
    // 估计量 is in ZH_TERMS_EXCLUDED; the outcome names it in place
    expect(bianchiVsSim.outcomes!.join('\n')).toContain('这就是估计量')
    expect(bianchiVsSim.variants).toBe(bianchiVsSimVariants)
    expect(bianchiVsSim.jumps).toBe(bianchiVsSimJumps)
  })

  it('① cites the clauses and the EIFS arithmetic, and holds no model', () => {
    for (const c of ['§10.3.2.11', '§10.3.4.3', '§10.3.3', '§10.3.7']) expect(stdText(), c).toContain(c)
    expect(EIFS_NS).toBe(SIFS_NS + t6.ackNs + DIFS_NS)
    expect(stdText()).toContain(`${SIFS_NS / 1000} + ${t6.ackNs / 1000} + ${DIFS_NS / 1000} = ${EIFS_NS / 1000} µs，而 DIFS 是 ${DIFS_NS / 1000} µs`)
    expect(stdText()).not.toContain('Bianchi')
    expect(stdText()).not.toContain('τ')
  })
})

describe('bianchi-vs-sim · ② says what the engine does, and the engine does it', () => {
  it('equal levels on the arc, so misses and retries are the same number and nothing is captured', () => {
    for (const scen of [bianchiVsSim.variants![0].scenario(), bianchiVsSim.variants![1].scenario()]) {
      const table = buildLinkTable(scen.nodes, scen.walls)
      const levels = scen.nodes.filter((n) => n.kind === 'sta').map((n) => table.get(n.id)!.get('ap')!)
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(0.01)
      expect(dataRateFor(levels[0])).toBe(6)
    }
    expect(misses(arc5())).toBe(arc5().collided)
    expect(misses(arc20())).toBe(arc20().collided)
    expect(arc5().records.some((r) => r.type === 'RX_FAIL' && r.node === 'ap')).toBe(false)
    expect(implRow('两帧重叠时').sim).toContain('错失数与重传数完全相等')
  })

  it('EIFS is 94 µs and is used; a failed exchange is the frame + the 45 µs timeout + DIFS', () => {
    expect(EIFS_NS).toBe(94_000)
    expect(implRow('EIFS').sim).toContain(`${EIFS_NS / 1000} µs`)
    expect(arc5().eifs).toBeGreaterThan(0)
    expect(t6.tcNs).toBe(t6.dataNs + ACK_TIMEOUT_NS + DIFS_NS)
    expect(implRow('失败之后的等待').sim).toContain(`比一次成功短 ${(t6.tsNs - t6.tcNs) / 1000} µs`)
  })

  it('the rate on both arcs never moves off 6 Mb/s', () => {
    expect([...arc5().rateMix.keys()]).toEqual([6])
    expect([...arc20().rateMix.keys()]).toEqual([6])
  })

  it('not every row is faithful', () => {
    expect(bianchiVsSim.implementation!.some((x) => x.kind === 'faithful')).toBe(true)
    expect(bianchiVsSim.implementation!.some((x) => x.kind !== 'faithful')).toBe(true)
  })
})

describe('bianchi-vs-sim · ③ every figure the labs print is the run or the model', () => {
  it('lab 1: misses against retries at n = 5 and n = 20, and good receptions equal answers', () => {
    const e = lab('圆弧上没有捕获').expect
    expect(e).toContain(`十秒内接入点记录 ${misses(arc5())} 次错失，各站点共 ${arc5().collided} 次重传`)
    expect(e).toContain(`二十台站点是 ${misses(arc20())} 对 ${arc20().collided}`)
    const rxOk = arc5().records.filter((r) => r.type === 'RX_OK' && r.node === 'ap').length
    expect(rxOk).toBe(arc5().acks)
  })

  it('lab 2: the comparison table, four rows of one method, and the bounds its expectation states', () => {
    const rows = tableOf(lab('预测与十秒实测'), '圆弧场景：预测与十秒实测的对照').rows
    expect(rows.map((r) => r[0])).toEqual(['2', '5', '10', '20'])
    let worstP = 0
    let worstS = 0
    for (const [nStr, p, pHat, s, sHat] of rows) {
      const n = Number(nStr)
      const m = model(n)
      const run = arcN(n)
      expect(p, `n=${n}`).toBe(pct(m.p))
      expect(pHat, `n=${n}`).toBe(pct(run.p))
      expect(s, `n=${n}`).toBe(m.mbps.toFixed(3))
      expect(sHat, `n=${n}`).toBe(`${run.mbps.toFixed(3)} Mb/s`)
      worstP = Math.max(worstP, Math.abs(run.p - m.p) / m.p)
      worstS = Math.max(worstS, Math.abs(run.mbps - m.mbps) / m.mbps)
      expect([...run.rateMix.keys()], `n=${n}`).toEqual([6])
    }
    const e = lab('预测与十秒实测').expect
    expect(worstP).toBeLessThan(0.10)
    expect(worstS).toBeLessThan(0.05)
    expect(e).toContain('每个碰撞比例都落在预测值的 10% 以内，每个吞吐量都在 5% 以内')
    for (const n of [5, 10, 20]) expect(arcN(n).p, `n=${n}`).toBeLessThan(model(n).p)
    expect(arcN(2).p).toBeGreaterThan(model(2).p)
    expect(e).toContain(`实测 ${pct(arcN(2).p)}，预测 ${pct(model(2).p)}`)
    // the inputs the steps name
    expect(lab('预测与十秒实测').steps[1]).toContain(`W = ${PARAMS.W}、m = ${PARAMS.m}、L = ${PARAMS.attempts}`)
  })

  it('lab 3: three waits, the EIFS count, and the cost of a pile-up under both conventions', () => {
    const e = lab('同一次碰撞之后的三种等待').expect
    expect(e).toContain(`碰撞的站点各自等待 ${ACK_TIMEOUT_NS / 1000} µs 的 ACK 超时`)
    expect(e).toContain(`等待 ${EIFS_NS / 1000} µs 的 EIFS`)
    expect(e).toContain(`只等待 ${DIFS_NS / 1000} µs 的 DIFS`)
    expect(e).toContain(`十秒内共有 ${arc5().eifs} 次 EIFS，每一次都使那个邻居比其他站点多等 ${(EIFS_NS - DIFS_NS) / 1000} µs`)
    expect(e).toContain(`一次碰撞比一次成功早结束 ${(t6.tsNs - t6.tcNs) / 1000} µs，约占一次交互的 ${((t6.tsNs - t6.tcNs) / t6.tsNs * 100).toFixed(1)}%`)
    const S20 = (tc: number) => model(20, tc).mbps
    expect(e).toContain(`二十台时对预测吞吐量的影响为 ${((S20(t6.tcNs) - S20(t6.tsNs)) / S20(t6.tsNs) * 100).toFixed(1)}%`)
    // the paper's own collision cost, frame + DIFS, moves the prediction the other way
    const paper = (S20(t6.tcNs) - S20(t6.dataNs + DIFS_NS)) / S20(t6.dataNs + DIFS_NS) * 100
    expect(paper).toBeLessThan(0)
    expect(e).toContain(`预测反而向另一方向偏移 ${Math.abs(paper).toFixed(1)}%`)
    expect(implRow('失败之后的等待').sim).toContain('论文取数据帧 + DIFS')
  })

  it('lab 4: n = 20 pooled against predicted, and the per-station spread', () => {
    const s = arc20()
    const e = lab('残差，以及模型不能回答的问题').expect
    expect(e).toContain(`总的实测碰撞比例是 ${pct(s.p)}，预测 ${pct(model(20).p)}`)
    expect(e).toContain(`分布在 ${pct(Math.min(...s.perStationP), 1)} 到 ${pct(Math.max(...s.perStationP), 1)} 之间`)
  })

  it('the why’s figures: the 15 µs, and the quiz’s 1370', () => {
    expect(bianchiVsSim.why).toContain(`一次碰撞比一次成功早结束 ${(t6.tsNs - t6.tcNs) / 1000} µs`)
    expect(bianchiVsSim.quiz[0].explain).toContain(`${misses(arc5())} 次错失对应 ${arc5().collided} 次重传`)
  })
})
