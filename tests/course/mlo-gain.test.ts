/**
 * `@mlo-gain`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11be-2024 for what bears on the second link's worth (independent contention,
 * any mapped link, link management); ② says what the engine does instead of the AP-side steering
 * the standard offers; ③'s three labs print three tables and their prose, and every figure is read
 * back out of the lesson and compared with the run it describes: the base 300 ms, the laptop with
 * MLO off, and the neighbour with two radios too. The two comparison runs are editor edits, as
 * the labs' steps say, and are measured here exactly as those steps describe.
 */
import { describe, it, expect } from 'vitest'
import { Simulation, LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { mloGain } from '../../src/course/tier2/mlo-gain'
import { mlo } from '../../src/course/tier2/mlo'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** The 300 ms every number in this lesson is measured over. */
const RUN_NS = 300 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const airMs = (xs: Tx[]): number => xs.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS

interface View {
  rs: TLRecord[]
  /** Share of the clock this lane held, per cent — the inspector's own figure (includes responses). */
  air: (id: string) => number
  /** Mean wait from enqueue to the start of sending, ms. */
  wait: (id: string) => number
}

/** One run of a modified copy of the scene, memoised by name (the suite's simulated work is bounded). */
const views = new Map<string, View>()
function viewOf(key: string, mod: (sc: Scenario) => void = () => {}): View {
  const hit = views.get(key)
  if (hit) return hit
  const sc = mloGain.scenario()
  mod(sc)
  const sim = new Simulation(sc)
  const rs = [...sim.runUntil(RUN_NS).records]
  const st = (id: string) => sim.view.nodes[id].stats
  const v: View = {
    rs,
    air: (id) => (st(id).airtimeNs / RUN_NS) * 100,
    wait: (id) => st(id).txLatency.sumNs / st(id).txLatency.n / MS,
  }
  views.set(key, v)
  return v
}
const base = (): View => viewOf('base')
const off = (): View => viewOf('off', (sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo = false })
const both = (): View => viewOf('both', (sc) => {
  const n = sc.nodes.find((x) => x.id === 'sta-2')!
  n.caps.generation = 'eht'
  n.caps.features.mlo = true
})

const lab = (heading: string): Lab => {
  const l = mloGain.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table')
  expect(t, `the table of 「${l.heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = mloGain.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const same = (printed: string, measured: number, what: string): void => {
  const fig = printed.replace(/[\s,%]/g, '')
  const dp = (fig.split('.')[1] ?? '').length
  expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`).toBe(Number(measured.toFixed(dp)))
}
const zh = (s: string): number => '零一二三四五六七八九十'.indexOf(s)

lessonShapeSuite(mloGain, { sameSceneAs: 'mlo', runNs: RUN_NS })

describe('mlo-gain · the lesson', () => {
  it('is the second half of mlo, in the standard-first shape: same module, same scene, no variants', () => {
    expect(isStandardFirst(mloGain)).toBe(true)
    expect(MODULES[mloGain.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mloGain.needs).toEqual(['mlo'])
    expect(mloGain.terms!.map((t) => t.term)).toEqual(['link', 'MLO'])
    expect(mloGain.variants).toBeUndefined()
    expect(mloGain.scenario()).toEqual(mlo.scenario())
    expect(() => ScenarioSchema.parse(mloGain.scenario())).not.toThrow()
    expect(mloGain.limits).toEqual([])
    expect(mloGain.observe).toEqual([])
    expect(mloGain.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①', () => {
    const std = mloGain.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const c of ['§35.3.16.1', '§35.3.7.2.1', '§35.3.7.2.2', '§35.3.7.1', '§35.3.7.2.3', '§35.3.7.4']) expect(std, c).toContain(c)
    expect(std).toContain('标准没有规定在这组链路中选哪一条')
    expect(std).toContain('平衡负载')
  })

  it('② names the engine’s choice as a choice and the AP-side steering as absent', () => {
    expect(implRow('选哪一条链路').kind).toBe('choice')
    expect(implRow('链路推荐').kind).toBe('absent')
    expect(implRow('TID 到链路的映射').kind).toBe('absent')
    expect(mloGain.implementation!.some((r) => r.kind !== 'faithful')).toBe(true)
  })
})

describe('mlo-gain · ② says what the engine does, and the engine does it', () => {
  it('6 GHz is charged 1.2 dB more path loss than 5 GHz, whatever the distance', () => {
    const m = /6 GHz 的路径损耗（path loss）一律比 5 GHz 多计 ([\d.]+) dB/.exec(implRow('两个频段的传播差别').sim)!
    same(m[1], LINK_EXTRA_LOSS_DB['6g'] - LINK_EXTRA_LOSS_DB['5g'], 'the extra 6 GHz loss')
    // 「在本课的距离上，两条链路使用同一级 MCS」
    const mcs = new Set([...data(base().rs, 'sta-1'), ...data(base().rs, 'sta-1#6g')].map((r) => r.frame.mcs))
    expect(mcs.size).toBe(1)
  })

  it('exactly one access point per scene: 6 GHz holds only the laptop and the AP', () => {
    const sc = mloGain.scenario()
    expect(ScenarioSchema.safeParse({ ...sc, nodes: [...sc.nodes, { ...sc.nodes[0], id: 'ap-2' }] }).success).toBe(false)
    const on6 = new Set(base().rs.flatMap((r) => (r.type === 'TX_START' && r.node.includes('#6g') ? [r.node] : [])))
    expect([...on6].sort()).toEqual(['ap#6g', 'sta-1#6g'])
  })
})

describe('mlo-gain · ③ every figure the labs print is the run', () => {
  it('lab 1: the lane table, the MCS and rate, the four-in-five and the neighbour', () => {
    const l = lab('帧流向空闲的那个频段')
    const v = base()
    const lane = (band: string): string => (band.startsWith('6') ? 'sta-1#6g' : 'sta-1')
    for (const [band, frames, air, share] of tableOf(l).rows) {
      const xs = data(v.rs, lane(band))
      expect(Number(frames), band).toBe(xs.length)
      same(air.replace(' ms', ''), airMs(xs), `${band}: airtime`)
      same(share, v.air(lane(band)), `${band}: share of the band`)
    }
    const all = [...data(v.rs, 'sta-1'), ...data(v.rs, 'sta-1#6g')]
    const e = /都以 MCS (\d+)、([\d.]+) Mb\/s 发送；6 GHz 上 (\d+) 帧，5 GHz 上 (\d+) 帧，每(.)帧中有(.)帧从 6 GHz 发出。邻居发出 (\d+) 帧，占用 5 GHz ([\d.]+)% 的时间/.exec(l.expect)!
    expect(e).not.toBeNull()
    expect(new Set(all.map((r) => r.frame.mcs))).toEqual(new Set([Number(e[1])]))
    expect(new Set(all.map((r) => r.frame.mbps))).toEqual(new Set([Number(e[2])]))
    expect([Number(e[3]), Number(e[4])]).toEqual([data(v.rs, 'sta-1#6g').length, data(v.rs, 'sta-1').length])
    const share = data(v.rs, 'sta-1#6g').length / all.length
    expect(Math.abs(share / (zh(e[6]) / zh(e[5])) - 1)).toBeLessThan(0.05)
    expect(Number(e[7])).toBe(data(v.rs, 'sta-2').length)
    same(e[8], v.air('sta-2'), 'the neighbour’s share of 5 GHz')
  })

  it('lab 2: the MLO-off table, row by row, and the two equal counts', () => {
    const l = lab('关闭第二条链路')
    const on = base(), o = off()
    const rows = tableOf(l).rows
    const row = (label: string) => rows.find((r) => r[0].startsWith(label))!
    expect(Number(row('笔记本的数据帧')[1])).toBe(data(on.rs, 'sta-1').length + data(on.rs, 'sta-1#6g').length)
    expect(Number(row('笔记本的数据帧')[2])).toBe(data(o.rs, 'sta-1').length)
    expect(data(o.rs, 'sta-1#6g')).toHaveLength(0)
    const [w5, w6] = row('笔记本发送前的平均等待')[1].replace(' ms', '').split(' / ')
    same(w5, on.wait('sta-1'), 'the 5 GHz wait with MLO on')
    same(w6, on.wait('sta-1#6g'), 'the 6 GHz wait with MLO on')
    same(row('笔记本发送前的平均等待')[2].replace(' ms', ''), o.wait('sta-1'), 'the one lane’s wait with MLO off')
    expect(Number(row('邻居的数据帧')[1])).toBe(data(on.rs, 'sta-2').length)
    expect(Number(row('邻居的数据帧')[2])).toBe(data(o.rs, 'sta-2').length)
    same(row('邻居发送前的平均等待')[1].replace(' ms', ''), on.wait('sta-2'), 'the neighbour’s wait, MLO on')
    same(row('邻居发送前的平均等待')[2].replace(' ms', ''), o.wait('sta-2'), 'and with MLO off')
    // 「笔记本只剩一条泳道，116 帧，平均等待增加到两倍以上；邻居也降到 116 帧」
    const e = /笔记本只剩一条泳道，(\d+) 帧，平均等待增加到两倍以上；邻居也降到 (\d+) 帧/.exec(l.expect)!
    expect([Number(e[1]), Number(e[2])]).toEqual([data(o.rs, 'sta-1').length, data(o.rs, 'sta-2').length])
    expect(o.wait('sta-1')).toBeGreaterThan(2 * Math.max(on.wait('sta-1'), on.wait('sta-1#6g')))
    // 「长期平均下来各得一半」
    for (const id of ['sta-1', 'sta-2']) {
      expect(o.air(id), id).toBeGreaterThan(40)
      expect(o.air(id), id).toBeLessThan(55)
    }
  })

  it('lab 3: the two-radio table, and the total it ends on', () => {
    const l = lab('给邻居也配备两条链路')
    const b = both(), on = base()
    for (const [band, laptop, neighbour] of tableOf(l).rows) {
      const suffix = band.startsWith('6') ? '#6g' : ''
      expect(Number(laptop), band).toBe(data(b.rs, `sta-1${suffix}`).length)
      expect(Number(neighbour), band).toBe(data(b.rs, `sta-2${suffix}`).length)
    }
    const e = /总量从 (\d+) 帧降到 (\d+) 帧/.exec(l.expect)!
    expect(Number(e[1])).toBe(data(on.rs, 'sta-1').length + data(on.rs, 'sta-1#6g').length)
    expect(Number(e[2])).toBe(data(b.rs, 'sta-1').length + data(b.rs, 'sta-1#6g').length)
  })

  it('the why and the quiz print the same counts the labs do', () => {
    const on = base(), o = off(), b = both()
    const total = (v: View) => data(v.rs, 'sta-1').length + data(v.rs, 'sta-1#6g').length
    const w = /从 (\d+) 个降到 (\d+) 个.*也从 (\d+) 帧降到 (\d+) 帧.*总量降到 (\d+) 帧/.exec(mloGain.why!)!
    expect(w.slice(1).map(Number)).toEqual([total(on), data(o.rs, 'sta-1').length, data(on.rs, 'sta-2').length, data(o.rs, 'sta-2').length, total(b)])
    const q = mloGain.quiz.flatMap((x) => [...x.options, x.explain]).join(' ')
    const q1 = /邻居从 (\d+) 帧降到 (\d+) 帧/.exec(q)!
    expect([Number(q1[1]), Number(q1[2])]).toEqual([data(on.rs, 'sta-2').length, data(o.rs, 'sta-2').length])
    const q2 = /总量从 (\d+) 帧降到 (\d+)/.exec(q)!
    expect([Number(q2[1]), Number(q2[2])]).toEqual([total(on), total(b)])
  })
})
