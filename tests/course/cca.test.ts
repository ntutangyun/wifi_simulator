/**
 * `@cca`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 §10.3.2.1, §17.3.10.6.1 and §27.3.22.6.3; ② says what
 * `updateAllCca` (src/engine/channel.ts) does, and the rows are pinned against the engine; ③'s
 * figures are read back out of the lesson text and compared with a 300 ms run of `backoff`'s
 * scene, which this lesson shares.
 */
import { describe, it, expect } from 'vitest'
import { cca, ccaTiming, CCA_NEIGHBOUR_DBM } from '../../src/course/tier1/cca'
import { backoff } from '../../src/course/tier1/backoff'
import { isStandardFirst, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { buildLinkTable } from '../../src/engine/propagation'
import { CCA_ED_DBM, CCA_PD_DBM } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { rssiOn } from './rssi'

const MS = 1_000_000
const US = 1_000
/** 300 ms: the window lab 3 counts over — `backoff`'s own window. */
const RUN_NS = 300 * MS

const recs = (): TLRecord[] => runOf(cca, undefined, RUN_NS)
const busy = () => ofType(recs(), 'CCA_BUSY')

/** Every node's own transmissions as half-open intervals, built once. */
const airtimeOf = (() => {
  let by: Map<string, [number, number][]> | null = null
  return (): Map<string, [number, number][]> => {
    if (by) return by
    by = new Map()
    for (const r of ofType(recs(), 'TX_START')) {
      const list = by.get(r.node) ?? []
      list.push([r.t, r.t + r.frame.txTimeNs])
      by.set(r.node, list)
    }
    return by
  }
})()
const transmittingAt = (node: string, t: number): boolean =>
  (airtimeOf().get(node) ?? []).some(([a, b]) => t >= a && t < b)

const lab = (heading: string): Lab => {
  const l = cca.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const implRow = (topic: string) => {
  const row = cca.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => cca.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
const neighbourDbm = (): number => {
  const s = cca.scenario()
  return rssiOn('5g', buildLinkTable(s.nodes, s.walls), 'sta-2', 'sta-1')
}

lessonShapeSuite(cca, { sameSceneAs: 'backoff', runNs: RUN_NS })

describe('cca · the lesson', () => {
  it('is in the standard-first shape, in the waiting module, after ifs', () => {
    expect(isStandardFirst(cca)).toBe(true)
    expect(MODULES[cca.module].title).toBe('等待与退避')
    expect(cca.needs).toEqual(['ifs'])
    expect(cca.terms!.map((t) => t.term)).toEqual(['CCA', 'preamble detection', 'energy detection'])
    expect(cca.limits).toEqual([])
    expect(cca.observe).toEqual([])
    expect(cca.tryThis).toEqual([])
  })

  it('borrows backoff’s scene, and its three jumps land where the labs say', () => {
    expect(() => ScenarioSchema.parse(cca.scenario())).not.toThrow()
    expect(cca.scenario()).toEqual(backoff.scenario())
    expect(cca.variants).toBeUndefined()
    const first = busy().find(cca.jumps[0]!.find as (r: TLRecord) => boolean)!
    expect([first.node, first.t, first.cause]).toEqual(['sta-1', 498_000, 'preamble'])
    const energy = busy().find(cca.jumps[1]!.find as (r: TLRecord) => boolean)!
    expect([energy.t, energy.cause]).toEqual([0, 'energy'])
    const ap = busy().find(cca.jumps[2]!.find as (r: TLRecord) => boolean)!
    expect([ap.node, ap.t, ap.cause]).toEqual(['ap', 0, 'preamble'])
  })

  it('cites each clause it teaches in ①, with the two levels and the 4 µs', () => {
    const std = stdText()
    for (const c of ['§10.3.2.1', '§17.3.10.6.1', '§27.3.22.6.3', '§27.3.22.6.4']) expect(std, c).toContain(c)
    expect(std).toContain(`${CCA_PD_DBM} dBm`.replace('-', '−'))
    expect(std).toContain(`${CCA_ED_DBM} dBm`.replace('-', '−'))
    expect(std).toContain('4 µs')
    expect(std).toContain('超过 90% 的概率')
  })

  it('the `why` prints the two levels, the twenty decibels and the neighbour’s level', () => {
    expect(CCA_ED_DBM - CCA_PD_DBM).toBe(20)
    expect(Math.pow(10, (CCA_ED_DBM - CCA_PD_DBM) / 10)).toBeCloseTo(100, 9)
    expect(cca.why).toContain('相差二十分贝，即一百倍的功率')
    expect(cca.why).toContain(`${neighbourDbm().toFixed(2).replace('-', '−')} dBm`)
  })
})

describe('cca · ② says what the engine does, and the engine does it', () => {
  it('the two thresholds are the engine’s constants', () => {
    expect([CCA_PD_DBM, CCA_ED_DBM]).toEqual([-82, -62])
    expect(implRow('前导检测').sim).toContain('−82 dBm')
    expect(implRow('能量检测').sim).toContain('−62 dBm')
  })

  it('every 「energy」 busy is the radio’s own transmission, and every other busy is a preamble', () => {
    const energy = busy().filter((r) => r.cause === 'energy')
    expect(energy.length).toBeGreaterThan(1000)
    for (const e of energy) expect(transmittingAt(e.node, e.t), `${e.node} at ${e.t}`).toBe(true)
    const others = busy().filter((r) => !transmittingAt(r.node, r.t))
    for (const o of others) expect(o.cause, `${o.node} at ${o.t}`).toBe('preamble')
  })

  it('no detection delay: every busy is at the instant some transmission starts', () => {
    expect(implRow('判忙的时延').kind).toBe('differs')
    const starts = new Set(ofType(recs(), 'TX_START').map((r) => r.t))
    for (const b of busy()) expect(starts.has(b.t), `${b.node} busy at ${b.t}`).toBe(true)
  })

  it('the energy sum covers the whole channel, and this scene is 20 MHz throughout', () => {
    expect(implRow('能量检测的范围').kind).toBe('faithful') // 2026-11-11 (W6): primary 20 MHz
    for (const r of ofType(recs(), 'TX_START')) expect(r.frame.widthMhz ?? 20).toBe(20)
  })

  it('no fading in this scene', () => {
    expect(cca.scenario().fading).toBeUndefined()
  })
})

describe('cca · ③ every figure the labs print is the run', () => {
  it('lab 1: the figure is the run, and the margins are the neighbour’s level against the two lines', () => {
    const fig = (lab('一次前导检测判忙').blocks!.find((b) => b.kind === 'diagram') as { spec: TimingSpec }).spec
    expect(fig).toEqual(ccaTiming())
    const level = neighbourDbm()
    expect(Number(level.toFixed(2))).toBe(CCA_NEIGHBOUR_DBM)
    const lane = (l: string) => fig.lanes.find((x) => x.label === l)!.spans
    expect(lane('前导检测')[0]!.label).toBe(`忙 · 高出 ${Math.round(level - CCA_PD_DBM)} dB`)
    expect(lane('能量检测')[0]!.label).toBe(`忙 · 高出 ${Math.round(level - CCA_ED_DBM)} dB`)
    const tx = ofType(recs(), 'TX_START').find((r) => r.t === 498_000)!
    const ack = ofType(recs(), 'TX_START').find((r) => r.t > tx.t && r.frame.kind === 'ack')!
    expect(lane('空口').map((s) => [s.fromUs, s.toUs])).toEqual([
      [tx.t / US, (tx.t + tx.frame.txTimeNs) / US], [ack.t / US, (ack.t + ack.frame.txTimeNs) / US],
    ])
  })

  it('lab 1: 498 busy by preamble with the freeze, 746 idle, 762–790 busy again, −46.01 dBm, 36 and 16 dB', () => {
    const e = lab('一次前导检测判忙').expect
    const b0 = busy().find((r) => r.node === 'sta-1' && r.cause === 'preamble')!
    const idle = ofType(recs(), 'CCA_IDLE').filter((r) => r.node === 'sta-1' && r.t > b0.t)
    const b1 = busy().filter((r) => r.node === 'sta-1' && r.t > b0.t)[0]!
    expect(ofType(recs(), 'BACKOFF_FREEZE').some((r) => r.node === 'sta-1' && r.t === b0.t)).toBe(true)
    expect(e).toContain(`邻居的数据帧在 ${b0.t / US} µs 开始，STA-1 在同一时刻判忙，原因是前导码`)
    expect(e).toContain(`${idle[0]!.t / US} µs 邻居的帧结束，STA-1 回到空闲`)
    expect(e).toContain(`${b1.t / US} 到 ${idle[1]!.t / US} µs 接入点的确认帧使它再判忙一次`)
    const level = neighbourDbm()
    expect(e).toContain(`电平是 ${level.toFixed(2).replace('-', '−')} dBm，比 −82 dBm 高 ${Math.round(level - CCA_PD_DBM)} dB，比 −62 dBm 高 ${Math.round(level - CCA_ED_DBM)} dB`)
  })

  it('lab 2: at 0 µs both stations start and both report busy by 「energy」', () => {
    const at0 = busy().filter((r) => r.t === 0 && r.node !== 'ap')
    expect(at0.map((r) => r.node).sort()).toEqual(['sta-1', 'sta-2'])
    for (const b of at0) {
      expect(b.cause).toBe('energy')
      expect(transmittingAt(b.node, b.t)).toBe(true)
    }
    expect(lab('本站发送时的判忙').expect).toContain('0 µs 时两台站点同时开始发送，各自在这一时刻判忙，记录的原因是能量')
  })

  it('lab 3: 1587 busy for STA-1, 1164 by preamble, 423 by energy, every one of those while it sends', () => {
    const e = lab('每一次判忙是哪一种').expect
    const mine = busy().filter((r) => r.node === 'sta-1')
    const pre = mine.filter((r) => r.cause === 'preamble')
    const en = mine.filter((r) => r.cause === 'energy')
    expect(e).toContain(`300 ms 内 STA-1 判忙 ${mine.length} 次，其中 ${pre.length} 次是前导检测，${en.length} 次是能量`)
    expect(e).toContain(`这 ${en.length} 次每一次都发生在它自己正在发送时`)
    for (const x of en) expect(transmittingAt('sta-1', x.t)).toBe(true)
    expect(ofType(recs(), 'CCA_IDLE').length).toBe(busy().length)
  })

  it('lab 4: the access point is busy by preamble at 0 µs on two frames it never locked', () => {
    const ap = busy().find((r) => r.node === 'ap')!
    expect([ap.t, ap.cause]).toEqual([0, 'preamble'])
    const misses = ofType(recs(), 'RX_MISS').filter((r) => r.node === 'ap' && r.t === 0)
    expect(misses.map((r) => r.from).sort()).toEqual(['sta-1', 'sta-2'])
    expect(lab('判忙不等于解调').expect).toContain(`接入点在 ${ap.t / US} µs 判忙，原因是前导码；同一时刻它对两帧各记一条 RX_MISS`)
  })
})
