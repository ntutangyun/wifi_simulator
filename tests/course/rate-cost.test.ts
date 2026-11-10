/**
 * `@rate-cost`, in the standard-first shape (2026-11-11).
 *
 * ① gives what the standard fixes that the bill is made of — the PPDU duration follows from the MCS
 * (802.11be-2024 §36.4.3), the backoff does not decrement while the medium is busy (§10.23.2.4),
 * the Ack goes out a SIFS after the data (§10.3.2.11), and the rate choice is open (§10.6.1). ②
 * says what the engine does with each, and this file checks those rows against the run. ③'s
 * figures are read back out of the lesson text and compared with the same three-second run
 * `rate` and `rate-fallback` use (shared memo key), plus the two edited scenes of lab 3.
 *
 * The old `limits` entry pointing at `wan-rtt` (`seeAlso`) left with the `limits` section; its
 * row in tests/course/limits.test.ts went with it. The ② row 「业务源」 now states the open-ended
 * saturated source next to 「标准不规定上层业务的行为」.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { rate } from '../../src/course/tier2/rate'
import { rateCost } from '../../src/course/tier2/rate-cost'
import { rateFallback } from '../../src/course/tier2/rate-fallback'
import { rateScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'

const MS = 1_000_000
/** The three seconds every figure in this lesson is measured over — the parent's own window. */
const RUN_NS = 3_000 * MS
const JUMP_NS = 200 * MS
/** The far station's ceiling on this scene. */
const CEILING = 2

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const round1 = (x: number): number => Math.round(x * 10) / 10
const pct = (a: number, b: number): number => round1((a / b) * 100)
const air = (xs: Tx[]): number => xs.reduce((a, r) => a + r.frame.txTimeNs, 0)
const us1 = (ns: number): string =>
  (ns / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The shared run: the same key `rate` and `rate-fallback` ask for, so it is simulated once. */
const rs = runOf(rate, undefined, RUN_NS)
const far = data(rs, 'sta-2')
const near = data(rs, 'sta-1')
const below = far.filter((r) => r.frame.mcs! < CEILING)
const airAt = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.txTimeNs
const atCeiling = airAt(CEILING)

/** One freeze of the near station: when it started, how long it lasted, and whether it resumed at the same value. */
interface Hold { t: number; dur: number; same: boolean }
const holds: Hold[] = (() => {
  type Bo = Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }>
  const evs = rs.filter((r): r is Bo =>
    (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === 'sta-1')
  const out: Hold[] = []
  for (let i = 0; i + 1 < evs.length; i++) {
    if (evs[i].type === 'BACKOFF_FREEZE' && evs[i + 1].type === 'BACKOFF_RESUME')
      out.push({ t: evs[i].t, dur: evs[i + 1].t - evs[i].t, same: evs[i].value === evs[i + 1].value })
  }
  return out
})()

/** How long a freeze that starts inside one of the far station's frames at `mcs` lasts — one value, every time. */
const holdBehind = (mcs: number): number => {
  const spans = far.filter((r) => r.frame.mcs === mcs).map((r) => [r.t, r.t + r.frame.txTimeNs] as const)
  const hs = holds.filter((h) => spans.some(([a, b]) => h.t >= a && h.t <= b))
  expect(hs.length, `holds behind MCS ${mcs}`).toBeGreaterThan(50)
  expect(new Set(hs.map((h) => h.dur)).size, `one hold length behind MCS ${mcs}`).toBe(1)
  return hs[0].dur
}

/** The lesson's scene with one thing changed, run three seconds, memoised by the name of the change. */
const changedRuns = new Map<string, ReturnType<typeof changeScene>>()
function changeScene(mut: (sc: ReturnType<typeof rateScenario>) => void) {
  const sc = rateCost.scenario()
  mut(sc)
  const recs = [...new Simulation(sc).runUntil(RUN_NS).records]
  const xs = data(recs, 'sta-2')
  const ceiling = Math.max(...xs.map((r) => r.frame.mcs!))
  const lower = xs.filter((r) => r.frame.mcs! < ceiling)
  const base = xs.find((r) => r.frame.mcs === ceiling)!.frame.txTimeNs
  const extra = air(lower) - lower.length * base
  return { frames: xs.length, ceiling, below: lower.length, extraMs: round1(extra / MS), extraPct: pct(extra, RUN_NS) }
}
const changedOf = (key: string, mut: (sc: ReturnType<typeof rateScenario>) => void) => {
  const hit = changedRuns.get(key)
  if (hit) return hit
  const made = changeScene(mut)
  changedRuns.set(key, made)
  return made
}
const quiet = () => changedOf('quiet', (sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle'] })
/** Two metres of the far station's distance straight towards the access point. */
const closer = () => changedOf('closer', (sc) => {
  const ap = rateCost.scenario().nodes.find((n) => n.id === 'ap')!.pos
  const far0 = rateCost.scenario().nodes.find((n) => n.id === 'sta-2')!.pos
  const dx = ap.x - far0.x, dy = ap.y - far0.y, len = Math.hypot(dx, dy)
  const n = sc.nodes.find((x) => x.id === 'sta-2')!
  n.pos = { x: far0.x + (dx / len) * 2, y: far0.y + (dy / len) * 2, z: n.pos.z }
})

const val = (x: string): number => Number(x.replace(/[\s,%]/g, '').replace(/[−–]/g, '-'))
const lab = (heading: string): Lab => {
  const l = rateCost.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = rateCost.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const grab = (text: string, re: RegExp, what: string): string[] => {
  const m = re.exec(text)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}

lessonShapeSuite(rateCost, { sameSceneAs: 'rate-fallback', runNs: JUMP_NS })

describe('rate-cost · the lesson', () => {
  it('is in the standard-first shape, after its parent in the capacity module', () => {
    expect(isStandardFirst(rateCost)).toBe(true)
    expect(MODULES[rateCost.module].title).toBe('容量参数与速率控制')
    expect(trackOf(rateCost)).toBe('wifi')
    expect(rateCost.needs).toEqual(['rate-fallback'])
    expect(rateCost.terms!.map((t) => t.term)).toEqual(['airtime tax', 'backoff freeze'])
    expect(rateCost.limits).toEqual([])
    expect(rateCost.observe).toEqual([])
    expect(rateCost.tryThis).toEqual([])
  })

  it('is the parent’s scene, undivided, and has no variant of its own', () => {
    const sc = rateCost.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc).toEqual(rateFallback.scenario())
    expect(sc).toEqual(rateScenario())
    expect(rateCost.variants).toBeUndefined()
  })

  it('cites each clause it teaches in ①, and keeps the paper out of it', () => {
    const std = rateCost.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§36.4.3', '式 36-110', '§10.23.2.4', '§10.3.2.11', '§10.6.1']) expect(std, clause).toContain(clause)
    expect(std).not.toContain('Heusse')
    expect(std).not.toContain('速率异常')
  })

  it('② is not all faithful', () => {
    const kinds = new Set(rateCost.implementation!.map((r) => r.kind))
    expect(kinds.has('faithful') && kinds.has('differs') && kinds.has('choice')).toBe(true)
  })
})

describe('rate-cost · ② says what the engine does, and the engine does it', () => {
  it('介质忙时退避不递减: every freeze resumes at its value', () => {
    expect(holds.length).toBeGreaterThan(2_000)
    expect(holds.every((h) => h.same)).toBe(true)
  })

  it('冻结从何时开始: a freeze starts the very nanosecond a far frame does', () => {
    const starts = new Set(far.map((r) => r.t))
    const at = holds.filter((h) => starts.has(h.t))
    expect(at.length).toBeGreaterThan(1_000)
    // and so the hold behind each rung is one length, every time (holdBehind asserts it)
    for (const m of [0, 1, 2]) expect(holdBehind(m)).toBeGreaterThan(airAt(m))
  })

  it('一帧的空口时间: 48 µs plus 13.6 µs a symbol, no PE — 537.6, 768.8 and 1,489.6 µs', () => {
    const sim = implRow('一帧的空口时间').sim
    const [pre, sym] = grab(sim, /前导码取代表值 ([\d.]+) µs，加上 ([\d.]+) µs 乘以数据符号数/, '② on the formula').map(val)
    // 2026-11-11 (W7a): an EHT PSDU is always an A-MPDU (§10.12.5); the one 1530-octet MPDU goes out
    // as an S-MPDU (§10.12.7) behind a 4-octet delimiter, and the airtime is computed from that
    // APEP_LENGTH (§10.12.6), 1534 octets.
    const [mpdu, bytes, a2, a1, a0] = grab(sim, /(\d+) 字节的帧连同 4 字节的定界符（MPDU delimiter）共 (\d+) 字节，在 MCS 2、1、0 上分别是 ([\d.]+)、([\d.]+)、([\d,.]+) µs/, '② on the three airtimes')
    expect(val(bytes)).toBe(val(mpdu) + 4)
    const ndbps = [117, 234, 351]
    for (const mcs of [0, 1, 2]) {
      const nsym = Math.ceil((16 + 8 * val(bytes) + 6) / ndbps[mcs])
      expect(airAt(mcs), `MCS ${mcs}`).toBe(Math.round((pre + sym * nsym) * 1000))
    }
    expect(new Set(far.map((r) => r.frame.smpdu))).toEqual(new Set([true]))
    expect(new Set(far.map((r) => r.frame.apepBytes))).toEqual(new Set([val(bytes)]))
    expect([a2, a1, a0]).toEqual([us1(airAt(2)), us1(airAt(1)), us1(airAt(0))])
  })

  it('业务源: the saturated source keeps twenty frames queued from the first instant', () => {
    const [n] = grab(implRow('业务源').sim, /队列（queue）始终保持 (\d+) 帧/, '② on the window').map(val)
    const first = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'sta-2' && r.t === 0)
    expect(first.length).toBe(n)
  })

  it('生存期: the scene sets no lifetime and no queue cap, and nothing is ever dropped', () => {
    expect(implRow('生存期（MSDU lifetime）').kind).toBe('differs')
    expect(ofType(rs, 'DROP')).toHaveLength(0)
    for (const n of rateCost.scenario().nodes) {
      expect(JSON.stringify(n).includes('ifetime'), n.id).toBe(false)
    }
  })
})

describe('rate-cost · ③ every figure the labs print is the run', () => {
  it('lab 1: the freeze behind each rung, beside that rung’s airtime', () => {
    const t = tableOf(lab('一次冻结有多长'), '近端站点的退避被远端站点的一帧冻结多久')
    for (const [label, frame, hold] of t.rows) {
      const mcs = val(grab(label, /^MCS (\d+)/, 'the row’s rung')[0])
      expect(frame, `airtime at MCS ${mcs}`).toBe(`${us1(airAt(mcs))} µs`)
      expect(hold, `freeze behind MCS ${mcs}`).toBe(`${us1(holdBehind(mcs))} µs`)
    }
  })

  it('lab 1: 「你应该看到」', () => {
    const e = lab('一次冻结有多长').expect
    const [f2, h2, f0, h0, more, nearFrames, nearMcs] = grab(e,
      /上限上 ([\d.]+) µs 的帧使近端冻结 ([\d.]+) µs，最低一级 ([\d,.]+) µs 的帧使它冻结 ([\d,.]+) µs，每帧多等 ([\d.]+) µs[^]*?近端站点自己三秒内 ([\d,]+) 帧没有一次失败，级别始终是 MCS (\d+)/,
      'lab 1 「你应该看到」')
    expect([f2, h2]).toEqual([us1(airAt(2)), us1(holdBehind(2))])
    expect([f0, h0]).toEqual([us1(airAt(0)), us1(holdBehind(0))])
    expect(more).toBe(us1(holdBehind(0) - holdBehind(2)))
    expect(val(nearFrames)).toBe(near.length)
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1')).toHaveLength(0)
    expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([val(nearMcs)]))
  })

  it('lab 2: the bill table, row by row', () => {
    const t = tableOf(lab('跌落的代价'), '远端站点的三秒：跌落中的帧及其代价')
    const row = (needle: string): string => t.rows.find((r) => r[0].includes(needle))![1]
    const extra = air(below) - below.length * atCeiling
    expect(val(row('以低于上限的级别发送的帧数'))).toBe(below.length)
    expect(val(row('占它三秒内发出的帧数'))).toBe(pct(below.length, far.length))
    expect(val(row('占它三秒内的空口时间'))).toBe(pct(air(below), air(far)))
    expect(row('这些帧实际占用的空口时间')).toBe(`${round1(air(below) / MS)} ms`)
    expect(row('同样这些帧若以上限发送')).toBe(`${round1((below.length * atCeiling) / MS)} ms`)
    expect(row('因此多占用')).toBe(`${round1(extra / MS)} ms`)
    expect(val(row('占整段三秒仿真'))).toBe(pct(extra, RUN_NS))
    const [ten0, ten2] = grab(row('本次最短的一次'), /^([\d.]+) ms，而在上限上只需 ([\d.]+) ms$/, 'the last row').map(val)
    expect(ten0).toBe(round1((10 * airAt(0)) / MS))
    expect(ten2).toBe(round1((10 * atCeiling) / MS))
    // and the shortest bottom-rung excursion really is ten frames
    const runs: number[] = []
    let len = 0
    for (const r of far) { if (r.frame.mcs === 0) len++; else if (len > 0) { runs.push(len); len = 0 } }
    expect(Math.min(...runs)).toBe(10)
  })

  it('lab 2: 「你应该看到」, and why it is 1.67 times and not three', () => {
    const e = lab('跌落的代价').expect
    const [n, share, airShare, extraMs, runShare, bytes, n1, over1, n0, over0, times] = grab(e,
      /(\d+) 帧只占帧数的 ([\d.]+)%，却占了空口时间的 ([\d.]+)%，多占 ([\d.]+) ms，约为三秒的 ([\d.]+)%。每一帧都是 (\d+) 字节[^]*?(\d+) 帧在 MCS 1 上，每帧多 (\d+)%；只有 (\d+) 帧降到最低一级，每帧多 (\d+)%，所以合计只是以上限发送的 ([\d.]+) 倍/,
      'lab 2 「你应该看到」').map(val)
    const extra = air(below) - below.length * atCeiling
    expect(n).toBe(below.length)
    expect(share).toBe(pct(below.length, far.length))
    expect(airShare).toBe(pct(air(below), air(far)))
    expect(extraMs).toBe(round1(extra / MS))
    expect(runShare).toBe(pct(extra, RUN_NS))
    // 2026-11-11 (W7a): the printed size is the MPDU; the S-MPDU adds its 4-octet delimiter (§10.12.7).
    expect(new Set(far.map((r) => r.frame.apepBytes! - 4))).toEqual(new Set([bytes]))
    const atRung = (mcs: number): number => far.filter((r) => r.frame.mcs === mcs).length
    expect([n1, n0]).toEqual([atRung(1), atRung(0)])
    const over = (ns: number): number => Math.round((ns / atCeiling - 1) * 100)
    expect([over1, over0]).toEqual([over(airAt(1)), over(airAt(0))])
    expect(times).toBe(Math.round((air(below) / (below.length * atCeiling)) * 100) / 100)
    // 「而不是将近三倍」
    expect(Math.round((airAt(0) / atCeiling) * 10) / 10).toBe(2.8)
  })

  it('lab 3: an idle neighbour removes the bill; two metres closer halves it', () => {
    const e = lab('去掉竞争，或把远端站点移近').expect
    const [quietFrames, ceilingMcs, before, after, was, now, nowPct] = grab(e,
      /远端站点三秒发出 ([\d,]+) 帧，每一帧都以上限发送，多占用的时间为 0[^]*?上限升到 MCS (\d+)，三秒发出的帧从 ([\d,]+) 增加到 ([\d,]+)，多占用的时间从 ([\d.]+) ms 降到 ([\d.]+) ms，占仿真的 ([\d.]+)%/,
      'lab 3 「你应该看到」').map(val)
    const q = quiet()
    expect(q.frames).toBe(quietFrames)
    expect(q.ceiling).toBe(CEILING)
    expect(q.below).toBe(0)
    expect(q.extraMs).toBe(0)
    const c = closer()
    expect(c.ceiling).toBe(ceilingMcs)
    expect(before).toBe(far.length)
    expect(c.frames).toBe(after)
    expect(was).toBe(round1((air(below) - below.length * atCeiling) / MS))
    expect(c.extraMs).toBe(now)
    expect(c.extraPct).toBe(nowPct)
    expect(c.below).toBeGreaterThan(0)
  })

  it('the quiz figures are lab 1’s and lab 2’s', () => {
    const [q1a] = grab(rateCost.quiz[0].options[0], /^([\d,.]+) µs/, 'quiz 1 option a')
    expect(q1a).toBe(us1(airAt(0)))
    const [q1b] = grab(rateCost.quiz[0].options[1], /^([\d,.]+) µs/, 'quiz 1 option b')
    expect(q1b).toBe(us1(holdBehind(0)))
    const [q1c] = grab(rateCost.quiz[0].explain, /只需等待 ([\d.]+) µs/, 'quiz 1 explain')
    expect(q1c).toBe(us1(holdBehind(2)))
    const [s, a] = grab(rateCost.quiz[1].q, /([\d.]+)%，为什么占用了 ([\d.]+)%/, 'quiz 2').map(val)
    expect([s, a]).toEqual([pct(below.length, far.length), pct(air(below), air(far))])
    const [m, c] = grab(rateCost.quiz[1].explain, /合计占用 ([\d.]+) ms，而它们若都以上限发送只需 ([\d.]+) ms/, 'quiz 2 explain').map(val)
    expect([m, c]).toEqual([round1(air(below) / MS), round1((below.length * atCeiling) / MS)])
  })
})
