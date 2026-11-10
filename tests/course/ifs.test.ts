/**
 * `@ifs`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 for SIFS, the slot, DIFS, basic access and EIFS; ② says what the
 * engine does with each, and the rows are pinned against the engine; ③'s figures are read back out
 * of the lesson text and compared with a 100 ms run of the lesson's own scene.
 */
import { describe, it, expect } from 'vitest'
import { ifs, ifsTiming } from '../../src/course/tier1/ifs'
import { isStandardFirst, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ACK_TX_TIME_6M_NS, DIFS_NS, EIFS_NS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { hasFeature } from '../../src/model/caps'

const MS = 1_000_000
const US = 1_000
/** 100 ms: the window labs 1 and 2 count over. */
const RUN_NS = 100 * MS

const recs = (): TLRecord[] => runOf(ifs, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)

const lab = (heading: string): Lab => {
  const l = ifs.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const implRow = (topic: string) => {
  const row = ifs.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => ifs.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(ifs, { runNs: RUN_NS })

describe('ifs · the lesson', () => {
  it('is in the standard-first shape, in the waiting-and-backoff module', () => {
    expect(isStandardFirst(ifs)).toBe(true)
    expect(MODULES[ifs.module].title).toBe('等待与退避')
    expect(ifs.needs).toEqual(['airtime'])
    expect(ifs.terms!.map((t) => t.term)).toEqual(['slot', 'SIFS', 'DIFS'])
    expect(ifs.limits).toEqual([])
    expect(ifs.observe).toEqual([])
    expect(ifs.tryThis).toEqual([])
  })

  it('keeps its scene', () => {
    expect(() => ScenarioSchema.parse(ifs.scenario())).not.toThrow()
    expect(ifs.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1'])
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§10.3.2.3.1', '§10.3.2.3.3', '§10.3.7', '表 17-24', '§10.3.2.3.5', '§10.3.2.3.7', '式 10-2', '式 10-3', '式 10-6', '式 10-7', '§10.3.2.1', '§10.3.4.2', '§10.3.3', '§10.3.2.11']) {
      expect(std, c).toContain(c)
    }
  })

  it('① states the values the PHY table gives, and DIFS as their sum', () => {
    const std = stdText()
    expect(std).toContain(`aSIFSTime 为 ${SIFS_NS / US} µs、aSlotTime 为 ${SLOT_NS / US} µs`)
    expect(std).toContain(`DIFS 为 ${(SIFS_NS + 2 * SLOT_NS) / US} µs`)
  })
})

describe('ifs · ② says what the engine does, and the engine does it', () => {
  it('SIFS 16, slot 9, DIFS 34, EIFS 94: the constants the rows print', () => {
    expect([SIFS_NS, SLOT_NS, DIFS_NS]).toEqual([16_000, 9_000, 34_000])
    expect(DIFS_NS).toBe(SIFS_NS + 2 * SLOT_NS)
    expect(implRow('DIFS 的取值').sim).toBe(`${SIFS_NS / US} + 2 × ${SLOT_NS / US} = ${DIFS_NS / US} µs。`)
    expect(EIFS_NS).toBe(SIFS_NS + DIFS_NS + ACK_TX_TIME_6M_NS)
    expect(implRow('EIFS').sim).toContain(`${SIFS_NS / US} + ${DIFS_NS / US} + ${ACK_TX_TIME_6M_NS / US} = ${EIFS_NS / US} µs`)
  })

  it('no EIFS is ever armed in this scene, and every wait but the first is one DIFS', () => {
    const ifsr = ofType(recs(), 'IFS_START')
    expect(new Set(ifsr.map((r) => r.kind))).toEqual(new Set(['DIFS']))
    expect(implRow('EIFS').sim).toContain('一次也没有启用')
    for (const r of ifsr.slice(1)) expect(r.untilNs - r.t).toBe(DIFS_NS)
  })

  it('no detection and no propagation delay: the receiver is busy the nanosecond the sender starts', () => {
    expect(implRow('侦听时延').kind).toBe('differs')
    expect(implRow('传播时延').kind).toBe('differs')
    const starts = new Set(ofType(recs(), 'TX_START').map((r) => r.t))
    const busy = ofType(recs(), 'CCA_BUSY').filter((r) => r.node === 'ap')
    expect(busy.length).toBeGreaterThan(100)
    for (const b of busy) expect(starts.has(b.t), `ap busy at ${b.t}`).toBe(true)
  })

  it('the station is a nonht one, on DCF: no EDCA, one DIFS', () => {
    const sta = ifs.scenario().nodes.find((n) => n.id === 'sta-1')!
    expect(sta.caps.generation).toBe('nonht')
    expect(hasFeature(sta, 'edca')).toBe(false)
  })
})

describe('ifs · ③ every figure the labs print is the run', () => {
  it('lab 1: the first frame and answer, and 254 answers each one SIFS after its frame', () => {
    const e = lab('帧与确认帧之间的 SIFS').expect
    const d = txs('data')[0]!
    const a = txs('ack')[0]!
    expect(e).toContain(`第一个数据帧 ${d.frame.bytes} 字节，从 ${d.t / US} µs 发到 ${(d.t + d.frame.txTimeNs) / US} µs`)
    expect(e).toContain(`确认帧在 ${a.t / US} µs 开始、${(a.t + a.frame.txTimeNs) / US} µs 结束`)
    expect(e).toContain(`前 100 ms 里共 ${txs('ack').length} 个确认帧`)
    expect(e).toContain(`数据帧结束后 ${SIFS_NS / US} µs 开始`)
    const ends = ofType(recs(), 'TX_END').filter((r) => r.frame.kind === 'data')
    for (const x of txs('ack')) expect(x.t - ends.filter((y) => y.t <= x.t).pop()!.t).toBe(SIFS_NS)
  })

  it('lab 2: the figure is the run’s first turn, span for span', () => {
    const l = lab('DIFS 结束才抽取退避')
    const fig = (l.blocks!.find((b) => b.kind === 'diagram') as { spec: TimingSpec; caption: string })
    expect(fig.spec).toEqual(ifsTiming())
    const lane = (label: string) => fig.spec.lanes.find((x) => x.label === label)!
    const d = txs('data')
    const a = txs('ack')[0]!
    const ifs1 = ofType(recs(), 'IFS_START').filter((r) => r.untilNs > r.t)[0]!
    const draw = ofType(recs(), 'BACKOFF_DRAW')[0]!
    expect(lane('空口').spans.map((s) => [s.fromUs, s.toUs]).slice(0, 2))
      .toEqual([[d[0]!.t / US, (d[0]!.t + d[0]!.frame.txTimeNs) / US], [a.t / US, (a.t + a.frame.txTimeNs) / US]])
    expect(lane('空口').spans[2]!.fromUs).toBe(d[1]!.t / US)
    expect([lane('SIFS').spans[0]!.fromUs, lane('SIFS').spans[0]!.toUs]).toEqual([(d[0]!.t + d[0]!.frame.txTimeNs) / US, a.t / US])
    expect([lane('DIFS').spans[0]!.fromUs, lane('DIFS').spans[0]!.toUs]).toEqual([ifs1.t / US, ifs1.untilNs / US])
    expect(lane('退避').spans[0]!.label).toBe(`${draw.value} 个时隙`)
    expect(fig.caption).toContain(`${SIFS_NS / US} µs 与 ${DIFS_NS / US} µs`)
  })

  it('lab 2: 292 → 326, eleven slots, 425; 254 draws each at the end of a 34 µs DIFS, no EIFS', () => {
    const e = lab('DIFS 结束才抽取退避').expect
    const a = txs('ack')[0]!
    const ifs1 = ofType(recs(), 'IFS_START').filter((r) => r.untilNs > r.t)[0]!
    const draw = ofType(recs(), 'BACKOFF_DRAW')[0]!
    const next = txs('data')[1]!
    expect(e).toContain(`确认帧在 ${(a.t + a.frame.txTimeNs) / US} µs 结束，DIFS 持续到 ${ifs1.untilNs / US} µs`)
    expect(e).toContain(`抽到 ${draw.value} 个时隙`)
    expect(e).toContain(`${draw.t / US} + ${draw.value} × ${SLOT_NS / US} = ${next.t / US} µs 开始`)
    expect(draw.t + draw.value * SLOT_NS).toBe(next.t)
    const draws = ofType(recs(), 'BACKOFF_DRAW')
    const waits = ofType(recs(), 'IFS_START').filter((r) => r.untilNs > r.t)
    for (const x of draws) expect(waits.some((w) => w.untilNs === x.t && w.untilNs - w.t === DIFS_NS)).toBe(true)
    expect(e).toContain(`前 100 ms 里共 ${draws.length} 次抽取，每一次都在一个 ${DIFS_NS / US} µs 的 DIFS 结束时`)
    expect(ofType(recs(), 'IFS_START').some((r) => r.kind === 'EIFS')).toBe(false)
  })

  it('lab 3: the first gap is zero long, no draw precedes the first frame, and it is the only one', () => {
    const e = lab('第一帧为什么在 0 µs 发出').expect
    const zero = ofType(recs(), 'IFS_START').filter((r) => r.untilNs === r.t)
    expect(zero).toHaveLength(1)
    expect([zero[0]!.t, zero[0]!.untilNs, zero[0]!.kind]).toEqual([0, 0, 'DIFS'])
    const first = txs('data')[0]!
    expect(first.t).toBe(0)
    expect(ofType(recs(), 'BACKOFF_DRAW').filter((r) => r.t <= first.t)).toEqual([])
    expect(e).toContain(`${zero[0]!.t / US} µs 处的 DIFS 记录起止都是 ${zero[0]!.untilNs / US} µs`)
    expect(e).toContain(`帧在 ${first.t / US} µs 发出`)
    expect(e).toContain('整轮只有这一段间隔长度为零')
  })
})
