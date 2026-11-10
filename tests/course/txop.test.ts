/**
 * `@txop`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 for the TXOP, multiple frame exchanges, the TXOP limit, CF-End and
 * the backoff after the final PPDU; ② is pinned against the engine; ③'s figures are read back out
 * of the lesson text and compared with a 300 ms run of the lesson's scene (and, for lab 4, the same
 * scene with TXOP turned off on the AP).
 */
import { describe, it, expect } from 'vitest'
import { txop, txopBurstTiming } from '../../src/course/tier2/txop'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { EDCA_PARAMS, OFDM_5G, aifsNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS
const AP = 'ap'

const recs = (): TLRecord[] => runOf(txop, undefined, RUN_NS)
const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
const thousands = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')

const lab = (heading: string): Lab => {
  const l = txop.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = txop.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => txop.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** The AP's bursts: start, end (null if still open at the end of the run) and data frames sent. */
const bursts = (rs: TLRecord[]) => {
  const starts = ofType(rs, 'TXOP_START').filter((r) => r.node === AP)
  const ends = ofType(rs, 'TXOP_END').filter((r) => r.node === AP)
  const data = ofType(rs, 'TX_START').filter((r) => r.node === AP && r.frame.kind === 'data')
  return starts.map((s, i) => {
    const end = ends.find((e) => e.t >= s.t && (i + 1 >= starts.length || e.t <= starts[i + 1].t))?.t ?? null
    return { start: s.t, until: s.untilNs, end, frames: data.filter((d) => d.t >= s.t && (end === null || d.t < end)).length }
  })
}

lessonShapeSuite(txop, { runNs: RUN_NS })

describe('txop · the lesson', () => {
  it('is in the standard-first shape, in the QoS module', () => {
    expect(isStandardFirst(txop)).toBe(true)
    expect(MODULES[txop.module].title).toBe('QoS 与效率')
    expect(txop.needs).toEqual(['edca', 'ampdu'])
    expect(txop.terms!.map((t) => t.term)).toEqual(['TXOP', 'TXOP limit'])
    expect(txop.limits).toEqual([])
    expect(txop.observe).toEqual([])
    expect(txop.tryThis).toEqual([])
  })

  it('keeps its scene: an AP and two video receivers', () => {
    expect(() => ScenarioSchema.parse(txop.scenario())).not.toThrow()
    expect(txop.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§10.23.1', '§10.23.2.8', '§10.23.2.7', '§10.23.2.9', '表 9-194', '§10.23.2.10', '§10.23.2.2', '§10.29', '§10.23.2.4']) expect(std, c).toContain(c)
  })

  it('① prints the default limits the engine uses', () => {
    const rows = tableOf(txop.standard!, 'TXOP 上限的默认值（表 9-194，第 17、18、19、21、27 章的物理层（physical layer, PHY））').rows
    for (const [ac, lim] of rows) expect(lim, ac).toBe(`${(by(ac.slice(3)).txopLimitNs / MS).toFixed(3)} ms`)
    expect(txop.why).toContain(`视频 ${(by('VI').txopLimitNs / MS).toFixed(3)} ms、语音 ${(by('VO').txopLimitNs / MS).toFixed(3)} ms、尽力而为与后台 ${(by('BE').txopLimitNs / MS).toFixed(3)} ms`)
  })
})

describe('txop · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('the deadline is the first frame plus the AC_VI limit, and every exchange ends before it', () => {
    for (const b of bursts(rs)) {
      expect(b.until - b.start).toBe(by('VI').txopLimitNs)
      if (b.end !== null) expect(b.end).toBeLessThanOrEqual(b.until)
    }
  })

  it('consecutive exchanges are a SIFS apart: no AIFS and no countdown inside a burst', () => {
    for (const b of bursts(rs).filter((x) => x.frames === 2 && x.end !== null)) {
      const inside = rs.filter((r) => 'node' in r && r.node === AP && r.t > b.start && r.t < b.end!)
      expect(inside.some((r) => r.type === 'IFS_START' || r.type === 'BACKOFF_DRAW'), `burst at ${b.start}`).toBe(false)
    }
  })

  it('a backoff after every burst end, whether or not anything is queued', () => {
    expect(implRow('交还之后的退避').kind).toBe('faithful')
    const ends = ofType(rs, 'TXOP_END').filter((r) => r.node === AP)
    const draws = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === AP)
    expect(draws).toHaveLength(ends.length)
    for (const [i, d] of draws.entries()) {
      expect(d.t - ends[i].t, `draw ${i}`).toBe(aifsNs(by('VI').aifsn, OFDM_5G))
      expect(d.cw).toBe(by('VI').cwMin)
    }
  })

  it('no CF-End in this scene', () => {
    expect(ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'cfend')).toEqual([])
  })
})

describe('txop · ③ every figure the labs print is the run', () => {
  const rs = recs()

  it('lab 1: the first burst, to scale and step by step', () => {
    const l = lab('第一串突发')
    const fig = l.blocks!.find((b) => b.kind === 'diagram')!
    expect(fig.kind === 'diagram' && fig.spec).toEqual(txopBurstTiming())
    const b = bursts(rs)[0]
    const tx = ofType(rs, 'TX_START').filter((r) => r.t >= b.start && r.t < b.end!)
    expect(tx.map((r) => r.frame.kind)).toEqual(['data', 'ack', 'data', 'ack'])
    const rel = (ns: number) => (ns - b.start) / US
    const spec = txopBurstTiming()
    const ap = spec.lanes[0].spans
    const tv = spec.lanes[1].spans
    expect([ap[0].fromUs, ap[0].toUs, ap[1].fromUs, ap[1].toUs]).toEqual([rel(tx[0].t), rel(tx[0].t + tx[0].frame.txTimeNs), rel(tx[2].t), rel(tx[2].t + tx[2].frame.txTimeNs)])
    expect([tv[0].fromUs, tv[0].toUs, tv[1].fromUs, tv[1].toUs]).toEqual([rel(tx[1].t), rel(tx[1].t + tx[1].frame.txTimeNs), rel(tx[3].t), rel(tx[3].t + tx[3].frame.txTimeNs)])
    expect(spec.lanes[2].spans[0].toUs * US).toBe(by('VI').txopLimitNs)

    const ms3 = (ns: number) => `${(ns / MS).toFixed(3)} ms`
    const rows = tableOf(l.blocks!, '第一串突发，按步骤计算').rows
    const [d1, a1, d2, a2] = tx
    expect(rows[0][1]).toBe(ms3(b.start))
    expect(rows[1][1]).toBe(ms3(b.until))
    expect(rows[2][0]).toContain(`发给电视 2，${d1.frame.txTimeNs / US} µs，再加 16 + ${a1.frame.txTimeNs / US} µs`)
    expect(d1.frame.dst).toBe('sta-2')
    expect(rows[2][1]).toBe(ms3(a1.t + a1.frame.txTimeNs))
    expect(rows[3][1]).toBe(`${(OFDM_5G.sifsNs + d2.frame.txTimeNs + OFDM_5G.sifsNs + a2.frame.txTimeNs) / US} µs`)
    expect(rows[4][0]).toBe(`它在 ${ms3(a2.t + a2.frame.txTimeNs).replace(' ms', '')} ms 结束，早于期限 ${ms3(b.until)}`)
    expect(rows[5][1]).toBe(ms3(d2.t))
    expect(d2.frame.dst).toBe('sta-1')
    expect(d2.t - (a1.t + a1.frame.txTimeNs)).toBe(OFDM_5G.sifsNs)
    expect(rows[6][1]).toBe(ms3(b.end!))
    expect(rows[7][1]).toBe(`${(b.end! - b.start) / US} µs`)
    expect(rows[7][0]).toContain(thousands(by('VI').txopLimitNs / US))
    expect(l.expect).toContain(`接入点在 ${ms3(b.start)} 发出第一帧`)
    expect(l.expect).toContain(`TXOP 在 ${ms3(b.end!)} 结束，共 ${(b.end! - b.start) / US} µs`)
  })

  it('lab 2: what ended each burst', () => {
    const l = lab('每一串突发因何结束')
    const bs = bursts(rs)
    const done = bs.filter((b) => b.end !== null)
    const rows = tableOf(l.blocks!, '300 ms 里接入点的突发').rows
    const cell = (label: string) => rows.find((r) => r[0] === label)![1]
    const lens = done.map((b) => (b.end! - b.start) / US)
    expect(cell('发起的 TXOP')).toBe(String(bs.length))
    expect(cell('已经结束、只发一帧的')).toBe(String(done.filter((b) => b.frames === 1).length))
    expect(cell('已经结束、发两帧的')).toBe(String(done.filter((b) => b.frames === 2).length))
    expect(done.every((b) => b.frames === 1 || b.frames === 2)).toBe(true)
    expect(cell('最短的突发')).toBe(`${Math.min(...lens)} µs`)
    expect(cell('最长的突发')).toBe(`${Math.max(...lens)} µs`)
    expect(cell('平均')).toBe(`${(lens.reduce((a, x) => a + x, 0) / lens.length).toFixed(1)} µs`)
    expect(cell('VI 的 TXOP 上限')).toBe(`${thousands(by('VI').txopLimitNs / US)} µs`)
    expect(bs.length - done.length).toBe(1)
    expect(l.expect).toContain(`已经结束的 ${done.length} 串突发里，${done.filter((b) => b.frames === 1).length} 串只发一帧，${done.filter((b) => b.frames === 2).length} 串发两帧；最长的一串 ${Math.max(...lens)} µs`)
    expect(Math.max(...lens) * 8).toBeLessThan(by('VI').txopLimitNs / US) // 「不到上限的八分之一」
    expect(l.expect).toContain(`第 ${bs.length} 串在 300 ms 结束时还没有结束`)
    // every finished burst ended with the queue empty, never at the limit
    for (const b of done) {
      const depth = ofType(rs, 'DEQUEUE').filter((r) => r.node === AP && r.t === b.end).at(-1)
      expect(depth?.depth, `burst at ${b.start}`).toBe(0)
    }
  })

  it('lab 3: the backoff after the first burst, and the burst that needs none', () => {
    const l = lab('交还之后立即退避')
    const bs = bursts(rs)
    const first = bs[0]
    const draw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === AP)!
    expect(draw.t - first.end!).toBe(aifsNs(by('VI').aifsn, OFDM_5G))
    const second = bs[1]
    const arrival = ofType(rs, 'ENQUEUE').filter((r) => r.node === AP && r.t > first.end!)[0]
    expect(arrival.t).toBe(second.start)
    expect(second.start).toBeGreaterThan(1_500_000)
    expect(txop.jumps[2].find({ type: 'TXOP_START', node: AP, t: second.start, ac: 2, untilNs: second.until, seq: 0 } as TLRecord)).toBe(true)
    // the countdown is finished before the frame arrives
    const lastDec = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === AP && r.t < arrival.t).at(-1)!
    expect(lastDec.value).toBe(0)
    expect(l.expect).toContain(`第一串突发在 ${(first.end! / MS).toFixed(3)} ms 结束，队列已空；${aifsNs(2, OFDM_5G) / US} µs 之后接入点抽到 ${draw.value} 并倒数完毕`)
    expect(l.expect).toContain(`下一帧在 ${(arrival.t / MS).toFixed(3)} ms 到达，在同一纳秒发出`)
    const atArrival = bs.filter((b) => ofType(rs, 'ENQUEUE').some((e) => e.node === AP && e.t === b.start)).length
    const draws = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === AP).length
    expect(l.expect).toContain(`${bs.length} 串突发有 ${atArrival} 串是在帧到达的同一纳秒发出的；抽取一共 ${draws} 次`)
    expect(txop.why).toContain(`${bs.length} 串突发里有 ${atArrival} 串在帧到达的同一纳秒发出`)
  })

  it('lab 4: TXOP off on the AP — the same frames, a draw after each', () => {
    const l = lab('关掉接入点的 TXOP')
    const sc: Scenario = txop.scenario()
    const ap = sc.nodes.find((n) => n.id === AP)!
    ap.caps.features = { ...ap.caps.features, txop: false }
    const off = [...new Simulation(sc).runUntil(RUN_NS).records]
    const dataOf = (x: TLRecord[]) => ofType(x, 'TX_START').filter((r) => r.node === AP && r.frame.kind === 'data').length
    const drawsOf = (x: TLRecord[]) => ofType(x, 'BACKOFF_DRAW').filter((r) => r.node === AP).length
    expect(dataOf(off)).toBe(dataOf(rs))
    expect(l.expect).toContain(`数据帧仍是 ${dataOf(rs)} 帧，但退避抽取从 ${drawsOf(rs)} 次增加到 ${drawsOf(off)} 次`)
    expect(ofType(off, 'TXOP_START').filter((r) => r.node === AP)).toEqual([])
  })
})
