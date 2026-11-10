/**
 * `@backoff`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 §10.3.3 / §10.3.4.3 for the DCF backoff; ② says what the engine
 * does, and the rows are pinned against the engine; ③'s figures are read back out of the lesson
 * text and compared with a 300 ms run of the lesson's own scene (two saturated legacy stations).
 */
import { describe, it, expect } from 'vitest'
import { backoff, backoffTiming } from '../../src/course/tier1/backoff'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { CW_MAX, CW_MIN, DIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { hasFeature } from '../../src/model/caps'

const MS = 1_000_000
const US = 1_000
/** 300 ms: the window labs 2 and 3 count over. */
const RUN_NS = 300 * MS
const BOTH = ['sta-1', 'sta-2']

const recs = (): TLRecord[] => runOf(backoff, undefined, RUN_NS)
const draws = () => ofType(recs(), 'BACKOFF_DRAW')
const floorDraws = () => draws().filter((r) => r.cw === CW_MIN).map((r) => r.value)

const lab = (heading: string): Lab => {
  const l = backoff.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = backoff.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => backoff.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(backoff, { runNs: RUN_NS })

describe('backoff · the lesson', () => {
  it('is in the standard-first shape, in the waiting-and-backoff module', () => {
    expect(isStandardFirst(backoff)).toBe(true)
    expect(MODULES[backoff.module].title).toBe('等待与退避')
    expect(backoff.needs).toEqual(['ifs'])
    expect(backoff.terms!.map((t) => t.term)).toEqual(['backoff', 'CW'])
    expect(backoff.limits).toEqual([])
    expect(backoff.observe).toEqual([])
    expect(backoff.tryThis).toEqual([])
  })

  it('keeps its scene and its one jump', () => {
    expect(() => ScenarioSchema.parse(backoff.scenario())).not.toThrow()
    expect(backoff.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    expect(backoff.jumps.map((j) => j.label)).toEqual(['第一次退避冻结'])
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§10.3.3', '式 10-1', '§10.3.4.3', '表 17-24']) expect(std, c).toContain(c)
    expect(std).toContain(`aCWmin 为 ${CW_MIN}，aCWmax 为 ${CW_MAX}`)
    expect(std).toContain(`0 到 ${CW_MIN}，共十六个值`)
    expect(std).toContain(`aSlotTime 为 ${SLOT_NS / US} µs`)
  })

  it('the `why` prints the run’s own draw count, mean and mean wait', () => {
    const v = floorDraws()
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    expect(backoff.why).toContain(`从 CW = ${CW_MIN} 选取了 ${v.length} 次，平均 ${mean.toFixed(2)} 个时隙，约 ${Math.round(mean * SLOT_NS / US)} µs`)
    expect(mean * SLOT_NS).toBeGreaterThan(1.75 * DIFS_NS)
    expect(mean * SLOT_NS).toBeLessThan(2 * DIFS_NS)
  })
})

describe('backoff · ② says what the engine does, and the engine does it', () => {
  it('every draw is in [0, CW]', () => {
    for (const d of draws()) {
      expect(d.value).toBeGreaterThanOrEqual(0)
      expect(d.value).toBeLessThanOrEqual(d.cw)
    }
  })

  it('a decrement only ever happens one slot after the last one, never through a busy slot', () => {
    type Step = Extract<TLRecord, { type: 'BACKOFF_DEC' | 'BACKOFF_FREEZE' | 'BACKOFF_DRAW' | 'BACKOFF_RESUME' }>
    for (const n of BOTH) {
      const ev = recs().filter((r): r is Step => (r.type === 'BACKOFF_DEC' || r.type === 'BACKOFF_FREEZE'
        || r.type === 'BACKOFF_DRAW' || r.type === 'BACKOFF_RESUME') && r.node === n)
      let checked = 0
      for (let i = 0; i + 1 < ev.length; i++) {
        const [a, b] = [ev[i]!, ev[i + 1]!]
        // the first decrement after a draw or a resume is one slot after the DIFS ends
        if (b.type === 'BACKOFF_DEC' && a.type !== 'BACKOFF_FREEZE') { expect(b.t - a.t, `${n} at ${b.t}`).toBe(SLOT_NS); checked++ }
      }
      expect(checked).toBeGreaterThan(1000)
    }
  })

  it('the draw happens at the end of the DIFS after the answer, not at the end of the answer', () => {
    expect(implRow('何时抽取退避值').kind).toBe('differs')
    const ifsEnds = new Set(ofType(recs(), 'IFS_START').filter((r) => r.kind === 'DIFS').map((r) => `${r.node}@${r.untilNs}`))
    const ackEnds = new Set(ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'ack').map((r) => r.t + r.frame.txTimeNs))
    let atDifsEnd = 0
    for (const d of draws()) {
      if (ifsEnds.has(`${d.node}@${d.t}`)) atDifsEnd++
      expect(ackEnds.has(d.t), `${d.node} drew at an answer's end, ${d.t}`).toBe(false)
    }
    expect(atDifsEnd).toBe(draws().length)
  })

  it('every transmission owes a fresh draw: no station sends twice without one', () => {
    for (const n of BOTH) {
      let owed = true // the first frame of the run goes out on an idle channel with no draw
      let frames = 0
      for (const r of recs()) {
        if (!('node' in r) || r.node !== n) continue
        if (r.type === 'BACKOFF_DRAW') { owed = true; continue }
        if (r.type !== 'TX_START' || r.frame.kind !== 'data' || r.frame.retryFlag) continue
        expect(owed, `${n} sent at ${r.t} without drawing`).toBe(true)
        owed = false
        frames++
      }
      expect(frames).toBeGreaterThan(300)
    }
  })

  it('the stations are nonht: no EDCA, no TXOP, one frame a win', () => {
    for (const n of backoff.scenario().nodes.filter((x) => x.id !== 'ap')) {
      expect(n.caps.generation).toBe('nonht')
      for (const f of ['edca', 'txop'] as const) expect(hasFeature(n, f), `${n.id} ${f}`).toBe(false)
    }
    expect(implRow('一次竞争发送几帧').sim).toContain('没有传输机会（transmit opportunity, TXOP）')
  })

  it('no detection delay: the freeze lands on the neighbour’s first nanosecond', () => {
    expect(implRow('判忙的时刻').kind).toBe('differs')
    const starts = new Set(ofType(recs(), 'TX_START').map((r) => r.t))
    for (const f of ofType(recs(), 'BACKOFF_FREEZE')) expect(starts.has(f.t), `freeze at ${f.t}`).toBe(true)
  })
})

describe('backoff · ③ every figure the labs print is the run', () => {
  const freeze = () => ofType(recs(), 'BACKOFF_FREEZE')[0]!

  it('lab 1: the figure is the run’s first freeze, span for span', () => {
    const fig = (lab('一次冻结').blocks!.find((b) => b.kind === 'diagram') as { spec: TimingSpec }).spec
    expect(fig).toEqual(backoffTiming())
    const f = freeze()
    expect([f.node, f.t, f.value]).toEqual(['sta-1', 498_000, 3])
    const neighbour = ofType(recs(), 'TX_START').find((r) => r.t === f.t && r.node !== f.node)!
    const ack = ofType(recs(), 'TX_START').find((r) => r.t > f.t && r.frame.kind === 'ack')!
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === f.node && r.t > f.t)!
    const mine = ofType(recs(), 'TX_START').find((r) => r.node === f.node && r.t > f.t)!
    const lane = (l: string) => fig.lanes.find((x) => x.label === l)!.spans
    expect(lane('空口').map((s) => s.fromUs)).toEqual([neighbour.t / US, ack.t / US, mine.t / US])
    expect(lane('空口')[0]!.toUs).toBe((neighbour.t + neighbour.frame.txTimeNs) / US)
    expect(lane('空口')[1]!.toUs).toBe((ack.t + ack.frame.txTimeNs) / US)
    expect(lane('STA-1 计数')[1]!.label).toBe(`冻结在 ${f.value}`)
    expect(lane('STA-1 间隙')[0]!.toUs).toBe(resume.t / US)
  })

  it('lab 1: every row of the instants table is a record', () => {
    const rows = tableOf(lab('一次冻结'), '第一次冻结前后').rows
    const f = freeze()
    const decs = ofType(recs(), 'BACKOFF_DEC').filter((r) => r.node === f.node && r.t <= f.t).slice(-3)
    const neighbour = ofType(recs(), 'TX_START').find((r) => r.t === f.t && r.node !== f.node)!
    const ack = ofType(recs(), 'TX_START').find((r) => r.t > f.t && r.frame.kind === 'ack')!
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === f.node && r.t > f.t)!
    const mine = ofType(recs(), 'TX_START').find((r) => r.node === f.node && r.t > f.t)!
    const expected: [number, number][] = [
      ...decs.map((d) => [d.t, d.value] as [number, number]),
      [neighbour.t + neighbour.frame.txTimeNs, f.value],
      [ack.t + ack.frame.txTimeNs, f.value],
      [resume.t, resume.value],
      [mine.t, 0],
    ]
    expect(rows.map((r) => [Number(r[0]!.replace(' µs', '')) * US, Number(r[2])])).toEqual(expected)
    expect(decs[2]!.t).toBe(f.t)
    expect(resume.value).toBe(f.value)
    expect((mine.t - resume.t) / SLOT_NS).toBe(f.value)
    expect(rows[6]![1]).toContain(`又过了三个空闲时隙`)
    const ifs1 = ofType(recs(), 'IFS_START').find((r) => r.node === f.node && r.t === ack.t + ack.frame.txTimeNs)!
    expect(ifs1.untilNs).toBe(resume.t)
    expect(ifs1.untilNs - ifs1.t).toBe(DIFS_NS)
  })

  it('lab 1: 「你应该看到」 is the same five instants', () => {
    const e = lab('一次冻结').expect
    const f = freeze()
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === f.node && r.t > f.t)!
    const mine = ofType(recs(), 'TX_START').find((r) => r.node === f.node && r.t > f.t)!
    expect(e).toContain(`在 ${f.t / US} µs 冻结在 ${f.value}`)
    expect(e).toContain(`到 ${resume.t / US} µs 从同一个 ${resume.value} 继续，在 ${mine.t / US} µs 发出`)
    // 「冻结期间计数一次也没有变化」
    expect(ofType(recs(), 'BACKOFF_DEC').filter((r) => r.node === f.node && r.t > f.t && r.t < resume.t)).toEqual([])
  })

  it('lab 2: 770 draws from 15, mean 7.15, all sixteen values, 61 zeros, about 64 µs', () => {
    const e = lab('选取的退避值').expect
    const v = floorDraws()
    const mean = v.reduce((a, b) => a + b, 0) / v.length
    expect(e).toContain(`CW = ${CW_MIN} 时共选取 ${v.length} 次，平均 ${mean.toFixed(2)} 个时隙`)
    expect(e).toContain(`取值从 ${Math.min(...v)} 到 ${Math.max(...v)}`)
    expect(new Set(v).size).toBe(CW_MIN + 1)
    expect(e).toContain(`其中 0 出现 ${v.filter((x) => x === 0).length} 次`)
    expect(e).toContain(`每个时隙 ${SLOT_NS / US} µs 计，平均等待约 ${Math.round(mean * SLOT_NS / US)} µs`)
  })

  it('lab 3: 770 freeze/resume pairs, each at its own value; an unbroken countdown equals the draw', () => {
    let pairs = 0
    for (const n of BOTH) {
      const ev = recs().filter((r): r is Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }> =>
        (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === n)
      for (let i = 0; i + 1 < ev.length; i++) {
        if (ev[i]!.type === 'BACKOFF_FREEZE' && ev[i + 1]!.type === 'BACKOFF_RESUME') {
          expect(ev[i + 1]!.value).toBe(ev[i]!.value)
          pairs++
        }
      }
    }
    expect(lab('冻结与恢复成对出现').expect).toContain(`300 ms 内共 ${pairs} 组冻结与恢复`)
    const last = new Map<string, { t: number; v: number; frozen: boolean }>()
    let checked = 0
    for (const r of recs()) {
      if (r.type === 'BACKOFF_DRAW') last.set(r.node, { t: r.t, v: r.value, frozen: false })
      if (r.type === 'BACKOFF_FREEZE' && last.has(r.node)) last.get(r.node)!.frozen = true
      if (r.type === 'TX_START' && r.frame.kind === 'data' && last.has(r.node)) {
        const d = last.get(r.node)!
        if (!d.frozen) { expect(r.t - d.t).toBe(d.v * SLOT_NS); checked++ }
        last.delete(r.node)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})
