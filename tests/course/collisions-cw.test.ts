/**
 * `@collisions-cw`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 for the AckTimeout, the window sequence and the retry limit; ②
 * says what the engine does, and the rows are pinned against the engine; ③'s figures are read back
 * out of the lesson text and compared with a 300 ms run of `backoff`'s scene, which this lesson
 * shares.
 */
import { describe, it, expect } from 'vitest'
import { collisionsCw, collisionTiming } from '../../src/course/tier1/collisions-cw'
import { backoff } from '../../src/course/tier1/backoff'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import {
  ACK_TIMEOUT_NS, CW_MAX, CW_MIN, DIFS_NS, RX_START_DELAY_NS, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS,
} from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
/** 300 ms: the window lab 3 counts over. */
const RUN_NS = 300 * MS
const BOTH = ['sta-1', 'sta-2']

const recs = (): TLRecord[] => runOf(collisionsCw, undefined, RUN_NS)
const draws = () => ofType(recs(), 'BACKOFF_DRAW')
const data = () => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'data')
const meanOf = (cw: number): number => {
  const v = draws().filter((r) => r.cw === cw).map((r) => r.value)
  return v.reduce((a, b) => a + b, 0) / v.length
}

const lab = (heading: string): Lab => {
  const l = collisionsCw.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = collisionsCw.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => collisionsCw.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(collisionsCw, { runNs: RUN_NS, sameSceneAs: 'backoff' })

describe('collisions-cw · the lesson', () => {
  it('is in the standard-first shape, the second half of `backoff`', () => {
    expect(isStandardFirst(collisionsCw)).toBe(true)
    expect(MODULES[collisionsCw.module].title).toBe('等待与退避')
    expect(collisionsCw.module).toBe(backoff.module)
    expect(collisionsCw.needs).toEqual(['backoff'])
    expect(collisionsCw.terms!.map((t) => t.term)).toEqual(['ACK timeout', 'retry', 'CW'])
    expect(collisionsCw.limits).toEqual([])
    expect(collisionsCw.observe).toEqual([])
    expect(collisionsCw.tryThis).toEqual([])
  })

  it('loads `backoff`’s scene and takes the three jumps the first half gave up', () => {
    expect(() => ScenarioSchema.parse(collisionsCw.scenario())).not.toThrow()
    expect(collisionsCw.scenario()).toEqual(backoff.scenario())
    expect(collisionsCw.jumps.map((j) => j.label)).toEqual(['第一次碰撞', '第一次重传', '第一次 CW 翻倍'])
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§10.3.2.2', '§10.3.2.1', '§10.3.2.11', '表 17-24', '§10.3.3', '§10.3.4.4', '§10.3.4.3', '§10.3.2.3.7', 'dot11ShortRetryLimit']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain(`三项分别为 ${SIFS_NS / US}、${SLOT_NS / US}、${RX_START_DELAY_NS / US} µs，AckTimeout 为 ${ACK_TIMEOUT_NS / US} µs`)
    expect(std).toContain(`默认值为 ${SHORT_RETRY_LIMIT}`)
  })

  it('the `why` prints the run’s own frames, collisions and widest window', () => {
    expect(collisionsCw.why).toContain(`${SIFS_NS / US} + ${SLOT_NS / US} + ${RX_START_DELAY_NS / US} = ${ACK_TIMEOUT_NS / US} µs`)
    expect(collisionsCw.why).toContain(`300 ms 内发出 ${data().length} 帧、碰撞 ${ofType(recs(), 'COLLISION').length} 次，最宽只用到 CW = ${Math.max(...draws().map((d) => d.cw))}`)
    expect(meanOf(31)).toBeGreaterThan(2 * meanOf(15))
  })
})

describe('collisions-cw · ② says what the engine does, and the engine does it', () => {
  it('the deadline is 16 + 9 + 20 = 45 µs', () => {
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
    expect(implRow('ACK 超时').sim).toContain(`${SIFS_NS / US} + ${SLOT_NS / US} + ${RX_START_DELAY_NS / US} = ${ACK_TIMEOUT_NS / US} µs`)
  })

  it('the window ladder is 2^n − 1 from 15 to 1023, and every change in the run is a step of it or a reset', () => {
    expect([CW_MIN, CW_MAX, SHORT_RETRY_LIMIT]).toEqual([15, 1023, 7])
    const ladder = [CW_MIN]
    while (ladder[ladder.length - 1]! < CW_MAX) ladder.push(Math.min(2 * ladder[ladder.length - 1]! + 1, CW_MAX))
    expect(ladder).toEqual([15, 31, 63, 127, 255, 511, 1023])
    for (const n of BOTH) {
      let cw = CW_MIN
      for (const c of ofType(recs(), 'CW_CHANGE').filter((r) => r.node === n)) {
        expect([CW_MIN, Math.min(2 * cw + 1, CW_MAX)], `${n} at ${c.t}`).toContain(c.cw)
        cw = c.cw
      }
    }
  })

  it('every retransmission carries the Retry bit, and every first transmission does not', () => {
    const seen = new Set<string>()
    for (const d of data()) {
      const key = `${d.node}#${d.frame.msduId}`
      expect(!!d.frame.retryFlag, `${d.node} at ${d.t}`).toBe(seen.has(key))
      seen.add(key)
    }
    expect(data().filter((d) => d.frame.retryFlag).length).toBeGreaterThan(40)
  })

  it('the retry waits a DIFS counted from the deadline, not from the frame end', () => {
    expect(implRow('重传前的等待').kind).toBe('choice')
    for (const t of ofType(recs(), 'ACK_TIMEOUT')) {
      const w = ofType(recs(), 'IFS_START').find((r) => r.node === t.node && r.t === t.t)
      expect(w, `${t.node} at ${t.t}`).toBeDefined()
      expect(w!.untilNs - w!.t).toBe(DIFS_NS)
    }
  })

  it('a collision is never a reception that fails: the access point locks neither preamble, so no EIFS', () => {
    for (const c of ofType(recs(), 'COLLISION')) {
      const starts = data().filter((r) => r.t < c.t && r.t + r.frame.txTimeNs >= c.t)
      expect(starts.length).toBe(2)
      expect(starts[0]!.t).toBe(starts[1]!.t)
      expect(ofType(recs(), 'RX_MISS').filter((r) => r.node === 'ap' && r.t === starts[0]!.t).map((r) => r.from).sort()).toEqual(BOTH)
    }
    expect(ofType(recs(), 'RX_FAIL').some((r) => r.node === 'ap')).toBe(false)
    expect(ofType(recs(), 'IFS_START').some((r) => r.kind === 'EIFS')).toBe(false)
  })

  it('another seed gives other draws and the same rough rate', () => {
    for (const seed of [1, 2, 3]) {
      const s: Scenario = { ...collisionsCw.scenario(), seed }
      const rs = [...new Simulation(s).runUntil(RUN_NS).records]
      const d = rs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'data').length
      const c = rs.filter((r) => r.type === 'COLLISION').length
      expect(c / d, `seed ${seed}`).toBeGreaterThan(0.04)
      expect(c / d, `seed ${seed}`).toBeLessThan(0.08)
    }
  })
})

describe('collisions-cw · ③ every figure the labs print is the run', () => {
  it('lab 1: the figure is the run’s first collision, span for span', () => {
    const fig = (lab('第一次碰撞').blocks!.find((b) => b.kind === 'diagram') as { spec: TimingSpec }).spec
    expect(fig).toEqual(collisionTiming())
    const lane = (l: string) => fig.lanes.find((x) => x.label === l)!.spans[0]!
    for (const n of BOTH) {
      const tx = data().find((r) => r.node === n)!
      const sp = lane(n === 'sta-1' ? 'STA-1' : 'STA-2')
      expect([sp.fromUs, sp.toUs], n).toEqual([tx.t / US, (tx.t + tx.frame.txTimeNs) / US])
    }
    const to = ofType(recs(), 'ACK_TIMEOUT')[0]!
    const w = ofType(recs(), 'IFS_START').find((r) => r.t === to.t)!
    expect([lane('等待应答').fromUs, lane('等待应答').toUs]).toEqual([(to.t - ACK_TIMEOUT_NS) / US, to.t / US])
    expect(lane('等待应答').label).toBe(`${ACK_TIMEOUT_NS / US} µs`)
    expect([lane('重新竞争').fromUs, lane('重新竞争').toUs]).toEqual([w.t / US, w.untilNs / US])
  })

  it('lab 1: the formula is the deadline the run keeps', () => {
    const f = lab('第一次碰撞').blocks!.find((b) => b.kind === 'formula') as { text: string }
    const end = ofType(recs(), 'COLLISION')[0]!.t
    const to = ofType(recs(), 'ACK_TIMEOUT')[0]!.t
    expect(f.text).toBe(`AckTimeout = ${SIFS_NS / US} + ${SLOT_NS / US} + ${RX_START_DELAY_NS / US} = ${ACK_TIMEOUT_NS / US} µs      ${end / US} + ${ACK_TIMEOUT_NS / US} = ${to / US} µs`)
    expect(to - end).toBe(ACK_TIMEOUT_NS)
  })

  it('lab 1: 0 → 248, two RX_MISS, silence, 293, 31, 327, 22 and 19, 498, freeze at 3', () => {
    const e = lab('第一次碰撞').expect
    const first = data().filter((r) => r.t === 0)
    expect(first.map((r) => r.node).sort()).toEqual(BOTH)
    const end = first[0]!.t + first[0]!.frame.txTimeNs
    expect(e).toContain(`两个数据帧都在 ${first[0]!.t / US} µs 开始、${end / US} µs 结束`)
    expect(ofType(recs(), 'RX_MISS').filter((r) => r.node === 'ap' && r.t === 0)).toHaveLength(2)
    expect(e).toContain('接入点（access point, AP）对两帧各记一条 RX_MISS')
    const to = ofType(recs(), 'ACK_TIMEOUT').filter((r) => r.t === end + ACK_TIMEOUT_NS)
    expect(to.map((r) => r.node).sort()).toEqual(BOTH)
    const between = recs().filter((r) => r.t > end && r.t < to[0]!.t)
    expect(between.filter((r) => r.type === 'TX_START')).toEqual([])
    expect(e).toContain(`${end / US} 到 ${to[0]!.t / US} µs 之间空口上没有任何发送`)
    const cw = ofType(recs(), 'CW_CHANGE').filter((r) => r.t === to[0]!.t)
    expect(new Set(cw.map((r) => r.cw)).size).toBe(1)
    const redraw = draws().filter((r) => r.t > end)
    const at = new Map(redraw.filter((r) => r.t === redraw[0]!.t).map((r) => [r.node, r.value]))
    expect(e).toContain(`${to[0]!.t / US} µs 时两台站点同时超时，竞争窗口都变为 ${cw[0]!.cw}，各等一个 DIFS 到 ${redraw[0]!.t / US} µs`)
    expect(e).toContain(`STA-1 抽到 ${at.get('sta-1')}，STA-2 抽到 ${at.get('sta-2')}`)
    const sta2 = data().find((r) => r.node === 'sta-2' && r.t > redraw[0]!.t)!
    expect(sta2.t).toBe(redraw[0]!.t + at.get('sta-2')! * SLOT_NS)
    const freeze = ofType(recs(), 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === sta2.t)!
    expect(freeze.value).toBe(at.get('sta-1')! - at.get('sta-2')!)
    expect(e).toContain(`STA-2 在 ${sta2.t / US} µs 先发送，STA-1 冻结在两者之差 ${freeze.value} 上`)
    // 「两台站点都没有抽取退避值」
    expect(draws().some((r) => r.t < end)).toBe(false)
  })

  it('lab 2: two retries at the deadline, CW 31, and the Retry bit on STA-2’s frame', () => {
    const e = lab('重传帧带重发比特').expect
    const retries = ofType(recs(), 'RETRY').filter((r) => r.t === ofType(recs(), 'RETRY')[0]!.t)
    expect(retries.map((r) => r.node).sort()).toEqual(BOTH)
    const cw = ofType(recs(), 'CW_CHANGE').filter((r) => r.t === retries[0]!.t).map((r) => r.cw)
    expect(e).toContain(`${retries[0]!.t / US} µs 时两台站点各记一条重传记录，竞争窗口都是 ${cw[0]}`)
    const sta2 = data().find((r) => r.node === 'sta-2' && r.t > retries[0]!.t)!
    expect(sta2.frame.retryFlag).toBe(true)
    expect(e).toContain(`STA-2 在 ${sta2.t / US} µs 发出的帧，重发比特为 1`)
  })

  it('lab 3: the three windows, their counts and means; 864 frames, 47 collisions; nothing dropped', () => {
    const rows = tableOf(lab('翻倍在本轮中是否有效'), '300 ms 内三档竞争窗口').rows
    const byCw = new Map<number, number>()
    for (const d of draws()) byCw.set(d.cw, (byCw.get(d.cw) ?? 0) + 1)
    expect(rows.map((r) => Number(r[0]!.replace('CW = ', '')))).toEqual([...byCw.keys()].sort((a, b) => a - b))
    for (const [w, n, m] of rows) {
      const cw = Number(w!.replace('CW = ', ''))
      expect(n, w).toBe(String(byCw.get(cw)))
      expect(m, w).toBe(meanOf(cw).toFixed(2))
    }
    const e = lab('翻倍在本轮中是否有效').expect
    const frames = data().length
    const cols = ofType(recs(), 'COLLISION').length
    expect(e).toContain(`共发出 ${frames} 帧，碰撞 ${cols} 次，约每二十帧一次`)
    expect(Math.round(frames / cols / 5) * 5).toBe(20)
    expect(e).toContain(`只有 ${byCw.get(63)} 次选取来自 CW = 63，没有一次达到 127`)
    expect(byCw.has(127)).toBe(false)
    expect(ofType(recs(), 'DROP')).toEqual([])
    expect(e).toContain(`从 31 选取的平均值 ${meanOf(31).toFixed(2)} 是从 15 选取的 ${meanOf(15).toFixed(2)} 的两倍以上`)
    expect(meanOf(31)).toBeGreaterThan(2 * meanOf(15))
  })

  it('lab 4: the second collision is at about 8.1 ms, both counters reaching zero in one slot', () => {
    const second = ofType(recs(), 'COLLISION')[1]!
    expect(lab('第二次碰撞').expect).toContain(`第二次碰撞在约 ${(Math.round(second.t / 100_000) / 10).toFixed(1)} ms 处`)
    const starts = data().filter((r) => r.t < second.t && r.t + r.frame.txTimeNs >= second.t)
    expect(starts.map((r) => r.node).sort()).toEqual(BOTH)
    expect(starts[0]!.t).toBe(starts[1]!.t)
    for (const n of BOTH) {
      expect(ofType(recs(), 'BACKOFF_DEC').some((r) => r.node === n && r.t === starts[0]!.t && r.value === 0)).toBe(true)
    }
  })
})
