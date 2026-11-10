/**
 * `@rate-fallback`, in the standard-first shape (2026-11-11).
 *
 * ① says what IEEE Std 802.11-2024 specifies about choosing a rate — nothing about the algorithm
 * (§10.6.1), only the receiver's supported set (§10.6.5.8), the failure test (§10.3.2.11,
 * §10.23.2.2), retransmission (§10.23.2.12) and an optional MCS feedback (§26.13). ② says what
 * the engine does, and this file checks each row against the run: the two-down/ten-up rule
 * reproduces every one of the far station's 3,003 attempts, the timeout is 45 µs, no frame is
 * dropped, every freeze resumes at its value, and nothing ever collides at the router.
 *
 * Every figure the labs print is read back out of the lesson text and compared with the same
 * three-second run `rate` uses (shared memo key), so an edited number or an engine change that
 * moves one turns this red.
 *
 * The old `limits` entry promising `fading` left with the `limits` section; its ledger row in
 * tests/course/limits.test.ts went with it. The ② row 「链路电平」 now says the scene has no
 * fading section and points at the editor's section and the `fading` lesson instead.
 */
import { describe, it, expect } from 'vitest'
import { rate } from '../../src/course/tier2/rate'
import { rateFallback, fallbackExcursionTiming } from '../../src/course/tier2/rate-fallback'
import { rateScenario } from '../../src/course/wifiScenes'
import type { TLRecord } from '../../src/model/records'
import { ACK_TIMEOUT_NS } from '../../src/engine/phy'
import { FAILURES_TO_STEP_DOWN } from '../../src/engine/rate'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

const MS = 1_000_000
const RUN_NS = 3_000 * MS
const JUMP_NS = 200 * MS
/** The far station's ceiling on this scene, and the rule's two thresholds. */
const CEILING = 2
const DOWN_AFTER = 2
const UP_AFTER = 10

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const round1 = (x: number): number => Math.round(x * 10) / 10
const pct = (a: number, b: number): number => round1((a / b) * 100)

/** The shared run: the same key `rate`'s test asks for, so it is simulated once. */
const rs = runOf(rate, undefined, RUN_NS)
const far = data(rs, 'sta-2')
const near = data(rs, 'sta-1')
const timeouts = ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2')

/**
 * When an attempt of the far station's failed: a RETRY (or a DROP, of which this run has none)
 * for it, between the end of that attempt and the start of the next one. This is the signal the
 * rate controller itself acts on, and deliberately NOT the ACK-timeout window: 254 of the 337
 * failures end in an ACK timeout record, the other 83 are declared at the end of a reception that
 * was already under way when the answer came due (§10.3.2.11's second branch).
 */
const retryTs = ofType(rs, 'RETRY').filter((r) => r.node === 'sta-2').map((r) => r.t)
const dropTs = ofType(rs, 'DROP').filter((r) => r.node === 'sta-2').map((r) => r.t)
const badTs = [...retryTs, ...dropTs].sort((a, b) => a - b)
const lostAt: boolean[] = far.map((t, i) => {
  const end = t.t + t.frame.txTimeNs
  const next = i + 1 < far.length ? far[i + 1].t : Number.POSITIVE_INFINITY
  return badTs.some((x) => x >= end && x < next)
})
/** The index (0-based) of the second of the first two failures in a row. */
const pair = lostAt.findIndex((x, i) => i > 0 && x && lostAt[i - 1])

const runsAt = (want: number): number[] => {
  const out: number[] = []
  let len = 0
  for (const m of far.map((r) => r.frame.mcs)) {
    if (m === want) len++
    else if (len > 0) { out.push(len); len = 0 }
  }
  if (len > 0) out.push(len)
  return out
}
const excursions = (): number => {
  let n = 0, below = 0
  for (const m of far.map((r) => r.frame.mcs)) {
    if (m !== CEILING) below++
    else if (below > 0) { n++; below = 0 }
  }
  return below > 0 ? n + 1 : n
}
const perRung = (mcs: number) => {
  const idx = far.map((_r, i) => i).filter((i) => far[i].frame.mcs === mcs)
  const c = idx.filter((i) => lostAt[i]).length
  return { n: idx.length, c, pct: pct(c, idx.length) }
}
const airAt = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.txTimeNs
const freezes = () => {
  type Bo = Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }>
  const evs = rs.filter((r): r is Bo =>
    (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === 'sta-1')
  let held = 0, same = 0
  for (let i = 0; i + 1 < evs.length; i++) {
    if (evs[i].type === 'BACKOFF_FREEZE' && evs[i + 1].type === 'BACKOFF_RESUME') {
      held++
      if (evs[i].value === evs[i + 1].value) same++
    }
  }
  return { held, same }
}

const val = (x: string): number => Number(x.replace(/[\s,%]/g, '').replace(/[−–]/g, '-'))
const lab = (heading: string): Lab => {
  const l = rateFallback.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = rateFallback.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const grab = (text: string, re: RegExp, what: string): string[] => {
  const m = re.exec(text)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}

lessonShapeSuite(rateFallback, { runNs: JUMP_NS, sameSceneAs: 'rate' })

describe('rate-fallback · the lesson', () => {
  it('is in the standard-first shape, second in the rate pair', () => {
    expect(isStandardFirst(rateFallback)).toBe(true)
    expect(MODULES[rateFallback.module].title).toBe('容量参数与速率控制')
    expect(rateFallback.needs).toEqual(['rate', 'anomaly'])
    expect(rateFallback.terms!.map((t) => t.term)).toEqual(['ARF', 'excursion'])
    expect(rateFallback.limits).toEqual([])
    expect(rateFallback.observe).toEqual([])
    expect(rateFallback.tryThis).toEqual([])
  })

  it('reuses `rate`’s builder with no variant of its own', () => {
    expect(rateFallback.scenario()).toEqual(rateScenario())
    expect(rateFallback.variants).toBeUndefined()
  })

  it('cites each clause it teaches in ①, and says the algorithm is out of scope', () => {
    const std = rateFallback.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.6.1', '§10.6.5.8', '§10.3.2.11', '§10.23.2.2', '§10.23.2.12', '§10.23.2.4', '§26.13', '§35.19', '表 17-24'])
      expect(std, clause).toContain(clause)
    expect(std).toContain('速率切换的算法不在本标准范围之内')
    // ARF is a paper's algorithm and is never taught in ① as the standard's
    expect(std).not.toContain('ARF')
    expect(std).not.toContain('十次')
  })

  it('names 跌落 in the row that explains it, in the word the prose uses', () => {
    expect(JSON.stringify(rateFallback.labs)).toContain('跌落')
    expect(rateFallback.terms!.find((t) => t.term === 'excursion')!.plain).toContain('跌落')
  })

  it('② is not all faithful, and the MCS feedback is said to be absent', () => {
    const kinds = new Set(rateFallback.implementation!.map((r) => r.kind))
    expect(kinds.has('choice') && kinds.has('value') && kinds.has('absent')).toBe(true)
    expect(implRow('MCS 反馈').kind).toBe('absent')
    expect(implRow('速率选择算法').kind).toBe('choice')
  })
})

describe('rate-fallback · ② says what the engine does, and the engine does it', () => {
  it('速率选择算法: the rule reproduces the run attempt for attempt, all 3,003 of them', () => {
    expect(far.length).toBe(3_003)
    let rung = CEILING, fails = 0, succ = 0
    for (let i = 0; i < far.length; i++) {
      expect(far[i].frame.mcs, `attempt ${i} at t=${far[i].t}`).toBe(rung)
      if (lostAt[i]) {
        succ = 0
        if (++fails === DOWN_AFTER) { rung = Math.max(0, rung - 1); fails = 0 }
      } else {
        fails = 0
        if (++succ === UP_AFTER) { rung = Math.min(CEILING, rung + 1); succ = 0 }
      }
    }
    // 「每次只调整一级，不跳级」
    const mcss = far.map((r) => r.frame.mcs!)
    for (let i = 1; i < mcss.length; i++) {
      if (mcss[i] !== mcss[i - 1]) expect(Math.abs(mcss[i] - mcss[i - 1]), `at ${i}`).toBe(1)
    }
  })

  it('两个门限: 2 and 10, the engine’s constants', () => {
    expect(FAILURES_TO_STEP_DOWN).toBe(DOWN_AFTER)
    const [down, up] = grab(implRow('两个门限').sim, /降级 (\d+) 次、升级 (\d+) 次/, '② on the thresholds').map(val)
    expect([down, up]).toEqual([DOWN_AFTER, UP_AFTER])
  })

  it('可用的级别与上限: the far station never exceeds MCS 2, however long its run of successes', () => {
    const [printed] = grab(implRow('可用的级别与上限').sim, /上限是 MCS (\d+)/, '② on the ceiling').map(val)
    expect(printed).toBe(CEILING)
    expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(CEILING)
    expect(far[0].frame.mcs, 'the working rung starts at the ceiling').toBe(CEILING)
    const streaks: number[] = []
    let n = 0
    for (let i = 0; i < far.length; i++) { if (lostAt[i]) { streaks.push(n); n = 0 } else n++ }
    streaks.push(n)
    expect(Math.max(...streaks)).toBeGreaterThan(UP_AFTER)
    expect(implRow('可用的级别与上限').sim).toContain('减去 3 dB')
  })

  it('失败的判定: the timeout is 45 µs, and both shapes of failure feed the rule', () => {
    expect(ACK_TIMEOUT_NS).toBe(45_000)
    expect(implRow('失败的判定').sim).toContain(`共 ${ACK_TIMEOUT_NS / 1000} µs`)
    expect(timeouts.length).toBeLessThan(far.filter((_, i) => lostAt[i]).length)
  })

  it('失败之后: retransmitted, never dropped at a retry limit in three seconds', () => {
    expect(dropTs).toHaveLength(0)
    expect(retryTs.length).toBe(far.filter((_, i) => lostAt[i]).length)
  })

  it('介质忙时退避不递减: every freeze of the near station resumes at its value', () => {
    const [printed] = grab(implRow('介质忙时退避不递减').sim, /近端站点 ([\d,]+) 次冻结/, '② on the freezes').map(val)
    const f = freezes()
    expect(printed).toBe(f.held)
    expect(f.same).toBe(f.held)
  })

  it('两帧重叠时的接收: no collision at the router, and almost every loss starts as a tie', () => {
    expect(ofType(rs, 'COLLISION')).toHaveLength(0)
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === 'ap' && r.reason === 'collision')).toHaveLength(0)
    const lostFrames = far.filter((_t, i) => lostAt[i])
    const sameSlot = lostFrames.filter((f) => near.some((n) => n.t === f.t))
    expect(sameSlot.length / lostFrames.length).toBeGreaterThan(0.9)
  })

  it('链路电平: the scene writes no fading section', () => {
    expect(rateFallback.scenario().fading).toBeUndefined()
    expect(implRow('链路电平').sim).toContain('时变链路（衰落）')
  })
})

describe('rate-fallback · ③ every figure the labs print is the run', () => {
  it('lab 1: the first two failures in a row, the step down and the ten-frame climb', () => {
    const l = lab('一次跌落与回升')
    const [a, b, down, was, now, upAt] = grab(l.expect,
      /第 (\d+) 与第 (\d+) 次尝试连续没有答复，第 (\d+) 次以 MCS 1 发送，每帧从 ([\d.]+) µs 变为 ([\d.]+) µs；此后十帧全部收到答复，第 (\d+) 次回到 MCS 2/,
      'lab 1 「你应该看到」').map(val)
    // counting from one
    expect([a, b]).toEqual([pair, pair + 1])
    expect(lostAt[a - 1] && lostAt[b - 1]).toBe(true)
    expect(far[down - 1].frame.mcs).toBe(CEILING - 1)
    expect(was).toBe(far[pair - 1].frame.txTimeNs / 1000)
    expect(now).toBe(far[pair + 1].frame.txTimeNs / 1000)
    const back = far.findIndex((r, i) => i > pair && r.frame.mcs === CEILING)
    expect(upAt).toBe(back + 1)
    expect(back - (pair + 1)).toBe(UP_AFTER)
    expect(lostAt.slice(pair + 1, back).filter(Boolean)).toHaveLength(0)
    // 「单独丢一帧时，下一帧的级别不变」
    const lone = far.map((_r, i) => i).filter((i) => lostAt[i] && !lostAt[i - 1] && !lostAt[i + 1] && i + 1 < far.length)
    expect(lone.length).toBeGreaterThan(50)
    for (const i of lone) expect(far[i + 1].frame.mcs, `after the lone loss at ${i}`).toBe(far[i].frame.mcs)
  })

  it('lab 1: the ladder table walks down and back up at the rungs’ own airtimes', () => {
    const t = tableOf(lab('一次跌落与回升'), '一次降到最低一级的逐步过程')
    let rungNow = CEILING
    for (const [event, after, us] of t.rows) {
      if (event.includes('连续两次')) rungNow -= 1
      else if (event.includes('连续十次')) rungNow += 1
      expect(after, `the rung after 「${event}」`).toBe(`MCS ${rungNow}`)
      expect(us).toBe(`${(airAt(rungNow) / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} µs`)
    }
    expect(rungNow).toBe(CEILING)
  })

  it('lab 1: the diagram’s caption is the run', () => {
    const d = lab('一次跌落与回升').blocks!.find((b) => b.kind === 'diagram') as Extract<Block, { kind: 'diagram' }>
    const [rung, was, now] = grab(d.caption!, /下一帧就降到 MCS (\d+)：每帧从 ([\d.]+) µs 变为 ([\d.]+) µs/, 'the caption').map(val)
    expect(rung).toBe(CEILING - 1)
    expect(was).toBe(airAt(CEILING) / 1000)
    expect(now).toBe(airAt(CEILING - 1) / 1000)
  })

  it('lab 2: the three rung rows are one attribution of every failure', () => {
    const t = tableOf(lab('三秒内的失败率与跌落'), '远端站点的三秒：尝试次数与其中的失败次数')
    let attempts = 0, failures = 0
    for (const [label, n, c, p] of t.rows) {
      const mcs = val(grab(label, /^MCS (\d+)/, 'the row’s rung')[0])
      const r = perRung(mcs)
      expect(val(n), `attempts at MCS ${mcs}`).toBe(r.n)
      expect(val(c), `failures at MCS ${mcs}`).toBe(r.c)
      expect(val(p), `rate at MCS ${mcs}`).toBe(r.pct)
      attempts += val(n)
      failures += val(c)
    }
    expect(attempts).toBe(far.length)
    expect(failures).toBe(far.filter((_, i) => lostAt[i]).length)
    const [p2, p1, p0] = grab(lab('三秒内的失败率与跌落').expect, /失败率是 ([\d.]+)%、([\d.]+)% 与 ([\d.]+)%/, 'lab 2 on the three rates').map(val)
    expect([p2, p1, p0]).toEqual([perRung(2).pct, perRung(1).pct, perRung(0).pct])
    expect(Math.max(p2, p1, p0) - Math.min(p2, p1, p0)).toBeLessThan(1)
    expect(p0).toBeLessThanOrEqual(p1)
  })

  it('lab 2: 25 excursions, six of them to the bottom rung, and how long each lasts', () => {
    const t = tableOf(lab('三秒内的失败率与跌落'), '同样这三秒内，以低于上限的级别发送的情况')
    const row = (needle: string): string => t.rows.find((r) => r[0].includes(needle))![1]
    const bottom = runsAt(0)
    expect(val(row('降到上限以下的次数'))).toBe(excursions())
    expect(val(row('其中一直降到最低一级的'))).toBe(bottom.length)
    expect(row('这六次各持续了多少帧').split(', ').map(val)).toEqual([...bottom].sort((a, b) => a - b))
    expect(row('规则允许的最短回升')).toBe(`${UP_AFTER} 帧`)
    const e = lab('三秒内的失败率与跌落').expect
    const [all, deep] = grab(e, /(\d+) 次跌落里有 (\d+) 次降到最低一级/, 'lab 2 on the excursions').map(val)
    expect([all, deep]).toEqual([excursions(), bottom.length])
    expect(bottom.filter((n) => n === UP_AFTER)).toHaveLength(3)
    expect(e).toContain('其中三次用了规则允许的最短十帧')
    const rest = grab(e, /持续 (\d+)、(\d+)、(\d+) 帧/, 'lab 2 on the other three').map(val)
    expect(rest).toEqual(bottom.filter((n) => n !== UP_AFTER).sort((a, b) => a - b))
  })

  it('lab 3: the two shapes of a failure, and the near station that has none', () => {
    const [all, viaTimeout, viaReception, nearFrames] = grab(lab('一次失败的两种形式').expect,
      /(\d+) 次尝试失败：(\d+) 次以一条 ACK 超时记录结束，另外 (\d+) 次[^]*?近端站点三秒内发出 ([\d,]+) 帧，没有一次 ACK 超时/,
      'lab 3 「你应该看到」').map(val)
    expect(all).toBe(far.filter((_, i) => lostAt[i]).length)
    expect(viaTimeout).toBe(timeouts.length)
    expect(viaTimeout + viaReception).toBe(all)
    expect(nearFrames).toBe(near.length)
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1')).toHaveLength(0)
    expect(ofType(rs, 'COLLISION')).toHaveLength(0)
  })

  it('the quiz’s three rates are lab 2’s', () => {
    const q = rateFallback.quiz[1]
    const [m1, m0] = grab(q.options[1], /([\d.]+)% 对 ([\d.]+)%/, 'quiz 2').map(val)
    expect([m1, m0]).toEqual([perRung(1).pct, perRung(0).pct])
    const [a, b, c] = grab(q.explain, /([\d.]+)%、([\d.]+)%、([\d.]+)%/, 'quiz 2 explain').map(val)
    expect([a, b, c]).toEqual([perRung(2).pct, perRung(1).pct, perRung(0).pct])
  })
})

/**
 * The timing figure in lab 1: the run's own first excursion, span for span, and the geometry
 * `diagram.test.ts` checks for every registered lesson.
 */
describe('rate-fallback · the lab 1 figure is the run’s own first excursion', () => {
  const spec = fallbackExcursionTiming()
  const lane = (label: string) => spec.lanes.find((l) => l.label === label)!
  /** The first attempt of the window: three frames before the pair that fails. */
  const first = pair - 3
  const rel = (ns: number): number => Math.round(((ns - far[first].t) / 1_000) * 10) / 10

  it('fifteen frames, at their own times, and the two that went unanswered are the muted pair', () => {
    const spans = lane('远端站点').spans
    expect(spans).toHaveLength(15)
    spans.forEach((sp, i) => {
      const tx = far[first + i]
      expect([sp.fromUs, sp.toUs], `attempt ${first + i}`).toEqual([rel(tx.t), rel(tx.t + tx.frame.txTimeNs)])
    })
    const muted = spans.map((sp, i) => (sp.tone === 'muted' ? first + i : -1)).filter((i) => i >= 0)
    expect(muted).toEqual([pair - 1, pair])
    for (const i of muted) expect(lostAt[i], `attempt ${i}`).toBe(true)
    const accent = spans.map((sp, i) => (sp.tone === 'accent' ? first + i : -1)).filter((i) => i >= 0)
    expect(accent).toHaveLength(UP_AFTER)
    for (const i of accent) expect(far[i].frame.mcs, `attempt ${i}`).toBe(CEILING - 1)
    expect(far[first + 14].frame.mcs).toBe(CEILING)
  })

  it('the rung lane is 2, then 1, then 2 again, changing when the next frame goes out', () => {
    const rung = lane('级别').spans
    expect(rung.map((sp) => sp.label)).toEqual(['MCS 2', 'MCS 1', 'MCS 2'])
    expect(rung[0].fromUs).toBe(0)
    expect(rung[0].toUs).toBe(rel(far[pair + 1].t))
    expect(rung[1].toUs).toBe(rel(far[pair + UP_AFTER + 1].t))
    expect(rung[2].fromUs).toBe(rung[1].toUs)
    expect(rung[2].toUs).toBe(rel(far[pair + UP_AFTER + 1].t + far[pair + UP_AFTER + 1].frame.txTimeNs))
    expect(spec.axis.toUs).toBeGreaterThan(rung[2].toUs)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(spec)
    const ts = lay.shapes.filter((x): x is Extract<Shape, { s: 'text' }> => x.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})
