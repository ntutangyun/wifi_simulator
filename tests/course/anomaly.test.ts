/**
 * `@anomaly`, in the standard-first shape (2026-11-11).
 *
 * ① is IEEE Std 802.11-2024's backoff draw, the frozen counter, DIFS and EIFS, the data rate the
 * standard leaves open and the receiver minimum sensitivity; ② says what the engine does — its own
 * rate control, its hard-threshold receiver and its capture rule — and is checked here against the
 * engine; ③'s four runs print figures, and every one of them is read back out of the lesson text and
 * compared with a run of the lesson's own scene (a long apartment, one station beside the access
 * point and one behind a wall at the far end, both saturated).
 *
 * Carried over from the old shape against the same runs: the worked table (209/154 turns, 248/795
 * µs, 25.9/61.2 %, 135 acknowledged, 12.8/8.3 Mb/s), the rate table and the three far lengths, the
 * timing figure against its TX_STARTs, the 166 EIFS waits all at the far station, the t = 0 start
 * with only the near frame decoded and no collision mark, and the 510 / 234 one-station rooms. The
 * old pins on `limits` (two `seeAlso`, one `until`) left with that section: what they said is now in
 * ② (「数据帧速率的选择」, 「本课场景」).
 */
import { describe, it, expect } from 'vitest'
import { anomaly, anomalyTiming } from '../../src/course/tier1/anomaly'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { FAILURES_TO_STEP_DOWN } from '../../src/engine/rate'
import {
  ACK_BYTES, ACK_TX_TIME_6M_NS, CW_MAX, CW_MIN, DIFS_NS, EIFS_NS, RATES, RATE_MARGIN_DB, SIFS_NS, SLOT_NS, ctrlRespRateFor, mcsForRssi, txTimeNs,
} from '../../src/engine/phy'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from './coverage'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
const US = 1_000
/** 200 ms: the window every figure of the labs is counted over. */
const RUN_NS = 200 * MS
const BYTES = 1528

const recs = (): TLRecord[] => runOf(anomaly, undefined, RUN_NS)
const txs = (rs: TLRecord[], p: (r: Tx) => boolean = () => true): Tx[] => ofType(rs, 'TX_START').filter(p)
const data = (rs: TLRecord[], n: string): Tx[] => txs(rs, (r) => r.node === n && r.frame.kind === 'data')
const acked = (rs: TLRecord[], n: string): number => txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === n).length
const air = (rs: TLRecord[], n: string): number => txs(rs, (r) => r.node === n).reduce((a, r) => a + r.frame.txTimeNs, 0)
const aloneRuns = new Map<string, TLRecord[]>()
const without = (id: string): TLRecord[] => {
  const hit = aloneRuns.get(id)
  if (hit) return hit
  const sc = anomaly.scenario()
  sc.nodes = sc.nodes.filter((n) => n.id !== id)
  const made = [...new Simulation(sc).runUntil(RUN_NS).records]
  aloneRuns.set(id, made)
  return made
}
const links = () => { const sc = anomaly.scenario(); return buildLinkTable(sc.nodes, sc.walls) }

const lab = (heading: string): Lab => {
  const l = anomaly.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = anomaly.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const figs = (text: string, re: RegExp, what: string): number[] => {
  const m = re.exec(text)
  expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
  return m!.slice(1).map((x) => Number(x.replace(/[\s,]/g, '').replace(/−/g, '-')))
}

lessonShapeSuite(anomaly, { runNs: RUN_NS })

describe('anomaly · the lesson', () => {
  it('is in the standard-first shape, leans on airtime and collisions, and names the anomaly', () => {
    expect(isStandardFirst(anomaly)).toBe(true)
    expect(MODULES[anomaly.module].title).toBe('隐藏节点与帧丢失')
    expect(anomaly.needs).toEqual(['airtime', 'collisions-cw'])
    expect(anomaly.terms!.map((t) => t.term)).toEqual(['airtime share', 'performance anomaly', 'rate control'])
    expect(anomaly.limits).toEqual([])
    expect(anomaly.observe).toEqual([])
    expect(anomaly.tryThis).toEqual([])
  })

  it('names 空口占比 in the row that explains it, in the word the prose uses', () => {
    const main = lessonStrings({ why: anomaly.why, outcomes: anomaly.outcomes, quiz: anomaly.quiz }).join('\n')
    expect(main).toContain('空口占比')
    expect(anomaly.terms!.find((t) => t.term === 'airtime share')!.plain).toContain('空口占比')
  })

  it('the scenario is unchanged: a near station and a far one across the apartment', () => {
    const sc = anomaly.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    expect(sc.nodes.filter((n) => n.kind === 'sta').every((n) => n.caps.generation === 'nonht')).toBe(true)
    expect(sc.fading).toBeUndefined()
  })

  it('cites each clause it teaches in ①, with the standard’s own figures', () => {
    const std = anomaly.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.3.3', '§10.3.4.3', '§10.3.2.3.5', '§10.3.2.3.7', '§10.3.7', '§10.6.5.8', '§17.3.10.2', '表 17-21', '§17.4.3']) {
      expect(std, clause).toContain(clause)
    }
    const [cwMin, cwMax] = figs(std, /分别是 (\d+) 与 (\d+)/, 'aCWmin and aCWmax')
    expect([cwMin, cwMax]).toEqual([CW_MIN, CW_MAX])
    const [sifs, two, slot, difs] = figs(std, /即 (\d+) \+ (\d+) × (\d+) = (\d+) µs/, 'DIFS')
    expect([sifs * US, slot * US, difs * US, two]).toEqual([SIFS_NS, SLOT_NS, DIFS_NS, 2])
    for (const m of std.matchAll(/(\d+) Mb\/s 是 (−\d+) dBm/g)) {
      expect(RATES.find((r) => r.mbps === Number(m[1]))!.sensDbm, `${m[1]} Mb/s`).toBe(Number(m[2].replace('−', '-')))
    }
    expect([...std.matchAll(/(\d+) Mb\/s 是 (−\d+) dBm/g)].length).toBe(4)
    // the anomaly is a paper's, and the lesson says so where it cites it
    expect(std).not.toContain('Heusse')
    expect(anomaly.sources!.join('\n')).toContain('INFOCOM 2003')
  })

  it('② is not all faithful', () => {
    const kinds = anomaly.implementation!.map((r) => r.kind)
    expect(kinds).toContain('differs')
    expect(kinds).toContain('choice')
  })
})

describe('anomaly · ② says what the engine does, and the engine does it', () => {
  it('backoff: CW starts at 15, and this run reaches 15, 31 and 63', () => {
    const cws = figs(implRow('退避与 CW').sim, /CW 取过 (\d+)、(\d+)、(\d+)/, 'the windows')
    expect(new Set(ofType(recs(), 'CW_CHANGE').map((r) => r.cw))).toEqual(new Set(cws))
    const draws = ofType(recs(), 'BACKOFF_DRAW').filter((r) => r.node !== 'ap')
    expect(Math.min(...draws.map((r) => r.cw!))).toBe(CW_MIN)
    for (const d of draws) expect(d.value).toBeLessThanOrEqual(d.cw!)
    for (const n of ['sta-1', 'sta-2']) expect(draws.filter((r) => r.node === n && r.cw === CW_MIN).length, n).toBeGreaterThan(50)
  })

  it('EIFS is 16 + 44 + 34 µs, and 166 of 833 waits are EIFS, all at the far station', () => {
    const row = implRow('DIFS 与 EIFS')
    const [sifs, ack, difs, eifs] = figs(row.sim, /EIFS = (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/, 'EIFS')
    expect([sifs * US, ack * US, difs * US, eifs * US]).toEqual([SIFS_NS, ACK_TX_TIME_6M_NS, DIFS_NS, EIFS_NS])
    expect(sifs + ack + difs).toBe(eifs)
    expect(txTimeNs(ACK_BYTES, 6)).toBe(ack * US)
    const [waits, eifsN] = figs(row.sim, /共 (\d+) 次等待中有 (\d+) 次是 EIFS/, 'the waits')
    const ifs = ofType(recs(), 'IFS_START').filter((r) => r.node !== 'ap')
    expect(ifs.length).toBe(waits)
    for (const r of ifs) expect(['DIFS', 'EIFS']).toContain(r.kind)
    const e = ifs.filter((r) => r.kind === 'EIFS')
    expect(e.length).toBe(eifsN)
    expect(e.every((r) => r.node === 'sta-2')).toBe(true)
    expect(new Set(e.map((r) => r.untilNs - r.t))).toEqual(new Set([EIFS_NS]))
  })

  it('rate control: the ceiling is sensitivity plus 3 dB, two failures step down', () => {
    const row = implRow('数据帧速率的选择')
    expect(row.kind).toBe('choice')
    const [margin] = figs(row.sim, /高出 (\d+) dB 以上的最高一级是上限/, 'the margin')
    expect(RATE_MARGIN_DB).toBe(margin)
    // the far station's ceiling is the rung its first frame goes out at: 18 Mb/s, MCS 3 of nonht
    const farLevel = links().get('sta-2')!.get('ap')!
    expect(RATES[mcsForRssi('nonht', farLevel)].mbps).toBe(data(recs(), 'sta-2')[0].frame.mbps)
    expect(Math.max(...data(recs(), 'sta-2').map((d) => d.frame.mbps))).toBe(RATES[mcsForRssi('nonht', farLevel)].mbps)
    expect(row.sim).toContain('连续两次失败降一档')
    expect(FAILURES_TO_STEP_DOWN).toBe(2)
    const rate = readFileSync(resolve(ROOT, 'src/engine/rate.ts'), 'utf8')
    expect(rate).toContain('const SUCCESSES_TO_STEP_UP = 10')
  })

  it('capture: a simultaneous start keeps only a preamble 4 dB clear; the near one is ~40 dB clear', () => {
    const row = implRow('两帧同时开始')
    const [need, gap] = figs(row.sim, /强出 (\d+) dB 以上.*强约 (\d+) dB/, 'capture')
    expect(PREAMBLE_DETECT_SINR_DB).toBe(need)
    const lt = links()
    expect(Math.round(lt.get('sta-1')!.get('ap')! - lt.get('sta-2')!.get('ap')!)).toBe(gap)
    expect(ofType(recs(), 'RX_START').filter((r) => r.node === 'ap' && r.t === 0).map((r) => r.from)).toEqual(['sta-1'])
    expect(ofType(recs(), 'COLLISION')).toEqual([])
  })

  it('acknowledgements: 14 bytes, at the highest mandatory rate not above the frame’s', () => {
    const [bytes] = figs(implRow('确认帧的速率').sim, /确认帧 (\d+) 个字节/, 'the ack')
    expect(bytes).toBe(ACK_BYTES)
    const rs = recs()
    for (const a of txs(rs, (r) => r.frame.kind === 'ack')) {
      expect(a.frame.bytes).toBe(ACK_BYTES)
      const d = data(rs, a.frame.dst).filter((x) => x.t + x.frame.txTimeNs + SIFS_NS === a.t)[0]
      expect(a.frame.mbps, `ack @ ${a.t}`).toBe(ctrlRespRateFor(d.frame.mbps))
    }
  })

  it('the scene: one frame a turn, no TXOP, no aggregation', () => {
    expect(implRow('本课场景').sim).toContain('每轮只发一帧')
    for (const n of ['sta-1', 'sta-2']) expect(new Set(data(recs(), n).map((r) => r.frame.bytes))).toEqual(new Set([BYTES]))
    expect(txs(recs(), (r) => r.frame.kind === 'ba')).toEqual([])
  })
})

describe('anomaly · ③ every figure the labs print is the run', () => {
  it('lab 1: both start at 0 µs, 248 against 704 µs, only the near one decoded, a timeout at 749 µs', () => {
    const l = lab('同时开始的两帧')
    expect(anomaly.jumps[l.jump!].label).toBe('第一个数据帧')
    const rs = recs()
    const [start, bytes, nMbps, nUs, fMbps, fUs, to] = figs(l.expect,
      /都在 (\d+) µs 开始发送 (\d+) 字节的数据帧：近端 (\d+) Mb\/s，(\d+) µs；远端 (\d+) Mb\/s，(\d+) µs。接入点只解出近端的帧；远端在 (\d+) µs 因 ACK 超时（ACK timeout）判定失败/, 'lab 1')
    const near = data(rs, 'sta-1')[0], far = data(rs, 'sta-2')[0]
    expect([near.t, far.t]).toEqual([start * US, start * US])
    expect([near.frame.bytes, far.frame.bytes]).toEqual([bytes, bytes])
    expect([near.frame.mbps, near.frame.txTimeNs]).toEqual([nMbps, nUs * US])
    expect([far.frame.mbps, far.frame.txTimeNs]).toEqual([fMbps, fUs * US])
    expect(ofType(rs, 'BACKOFF_DRAW').some((r) => r.t === 0)).toBe(false)
    expect(txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')[0].t).toBe(near.t + near.frame.txTimeNs + SIFS_NS)
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2')[0].t).toBe(to * US)
    expect(ofType(rs, 'COLLISION')).toEqual([])
  })

  it('lab 2: the rate table is the three rungs, and the far station shows three lengths', () => {
    const l = lab('一轮的时长')
    const rows = tableOf(l, '一轮时长的由来').rows
    const rs = recs()
    for (const [, rate, bytes, us] of rows) {
      const mbps = Number(/^(\d+) Mb\/s$/.exec(rate)![1])
      expect(txTimeNs(Number(bytes), mbps), `${mbps} Mb/s`).toBe(Number(/^(\d+) µs$/.exec(us)![1]) * US)
      expect(Number(bytes)).toBe(BYTES)
    }
    expect(new Set(data(rs, 'sta-1').map((d) => d.frame.mbps))).toEqual(new Set([Number(/^(\d+)/.exec(rows[0][1])![1])]))
    expect(Math.max(...data(rs, 'sta-2').map((d) => d.frame.mbps))).toBe(Number(/^(\d+)/.exec(rows[1][1])![1]))
    expect(Math.min(...data(rs, 'sta-2').map((d) => d.frame.mbps))).toBe(Number(/^(\d+)/.exec(rows[2][1])![1]))
    const [n54] = figs(l.expect, /近端的每一帧都是 (\d+) Mb\/s/, 'near')
    expect(new Set(data(rs, 'sta-1').map((d) => d.frame.mbps))).toEqual(new Set([n54]))
    const lens = figs(l.expect, /远端的帧有 (\d+)、(\d+)、(\d+) µs 三种长度，对应 (\d+)、(\d+)、(\d+) Mb\/s/, 'far')
    const far = data(rs, 'sta-2')
    for (let i = 0; i < 3; i++) {
      const at = far.filter((d) => d.frame.mbps === lens[i + 3])
      expect(at.length, `${lens[i + 3]} Mb/s`).toBeGreaterThan(0)
      expect(new Set(at.map((d) => d.frame.txTimeNs))).toEqual(new Set([lens[i] * US]))
    }
    expect(new Set(far.map((d) => d.frame.txTimeNs)).size).toBe(3)
  })

  it('lab 2: the timing figure — three turns each, every span a TX_START', () => {
    const l = lab('一轮的时长')
    const fig = (l.blocks ?? []).find((b) => b.kind === 'diagram') as Extract<Block, { kind: 'diagram' }>
    expect(fig.spec).toEqual(anomalyTiming())
    const rs = recs()
    const spec = anomalyTiming()
    for (const [label, node] of [['近端·快', 'sta-1'], ['远端·慢', 'sta-2']] as const) {
      const spans = spec.lanes.find((x) => x.label === label)!.spans
      expect(spans).toHaveLength(3)
      for (const s of spans) {
        const tx = data(rs, node).find((r) => r.t === s.fromUs * US)
        expect(tx, `${node} @ ${s.fromUs}`).toBeDefined()
        expect(tx!.t + tx!.frame.txTimeNs).toBe(s.toUs * US)
      }
    }
    const [n, f] = figs(fig.caption!, /近端每轮 (\d+) µs，远端每轮 (\d+) µs/, 'the caption')
    expect(spec.lanes[0].spans[0].toUs - spec.lanes[0].spans[0].fromUs).toBe(n)
    expect(spec.lanes[1].spans[0].toUs - spec.lanes[1].spans[0].fromUs).toBe(f)
    const [b] = figs(fig.caption!, /承载的都是 (\d+) 字节/, 'bytes')
    expect(b).toBe(BYTES)
  })

  it('lab 3: the worked table row by row, both stations at once', () => {
    const l = lab('按轮次与按时间')
    const rows = tableOf(l, '同样的 200 ms：逐行计算').rows
    const rs = recs()
    for (const [col, n] of [[1, 'sta-1'], [2, 'sta-2']] as const) {
      const turns = data(rs, n)
      const airNs = turns.reduce((a, r) => a + r.frame.txTimeNs, 0)
      expect(Number(rows[0][col]), `${n} turns`).toBe(turns.length)
      expect(rows[1][col], `${n} per turn`).toBe(`${Math.round(airNs / turns.length / US)} µs`)
      expect(rows[2][col], `${n} airtime`).toBe(`${(airNs / MS).toFixed(1)} ms · ${(airNs / RUN_NS * 100).toFixed(1)} %`)
      expect(Number(rows[3][col]), `${n} acked`).toBe(acked(rs, n))
      expect(Number(rows[4][col]), `${n} per second`).toBe(acked(rs, n) / (RUN_NS / 1e9))
      expect(rows[5][col], `${n} Mb/s`).toBe(`${(acked(rs, n) / (RUN_NS / 1e9) * BYTES * 8 / 1e6).toFixed(1)} Mb/s`)
    }
    const [busy] = figs(l.expect, /有 ([\d.]+)% 的时间被占用/, 'busy')
    expect(((air(rs, 'sta-1') + air(rs, 'sta-2') + air(rs, 'ap')) / RUN_NS * 100).toFixed(1)).toBe(busy.toFixed(1))
    expect(air(rs, 'sta-2') / air(rs, 'sta-1')).toBeGreaterThan(2)
    expect(air(rs, 'sta-2') / air(rs, 'sta-1')).toBeLessThan(3)
    expect(data(rs, 'sta-1').length).toBeGreaterThan(data(rs, 'sta-2').length)
    const [turns, ok] = figs(l.expect, /远端 (\d+) 轮中只有 (\d+) 轮被确认/, 'the far turns')
    expect([turns, ok]).toEqual([data(rs, 'sta-2').length, acked(rs, 'sta-2')])
  })

  it('lab 4: 510 alone against 209, 234 for the far station alone, 344 together', () => {
    const l = lab('删除远端站点')
    const rs = recs()
    const [alone, together, farAlone, both] = figs(l.expect, /近端独占房间时送达 (\d+) 帧，与远端共处时只有 (\d+) 帧.*远端独占房间时送达 (\d+) 帧.*合计 (\d+) 帧/, 'lab 4')
    expect(acked(without('sta-2'), 'sta-1')).toBe(alone)
    expect(acked(rs, 'sta-1')).toBe(together)
    expect(together * 2).toBeLessThan(alone)
    expect(acked(without('sta-1'), 'sta-2')).toBe(farAlone)
    expect(farAlone).toBeGreaterThan(acked(rs, 'sta-1'))
    expect(farAlone).toBeGreaterThan(acked(rs, 'sta-2'))
    expect(acked(rs, 'sta-1') + acked(rs, 'sta-2')).toBe(both)
    expect(both).toBeLessThan(alone)
  })

  it('why quotes the same turns and shares', () => {
    const [n, f, sn, sf] = figs(anomaly.why!, /竞争成功 (\d+) 轮与 (\d+) 轮，空口占比却是 ([\d.]+)% 与 ([\d.]+)%/, 'why')
    const rs = recs()
    expect([n, f]).toEqual([data(rs, 'sta-1').length, data(rs, 'sta-2').length])
    expect((air(rs, 'sta-1') / RUN_NS * 100).toFixed(1)).toBe(sn.toFixed(1))
    expect((air(rs, 'sta-2') / RUN_NS * 100).toFixed(1)).toBe(sf.toFixed(1))
    const [bytes] = figs(anomaly.why!, /同样 (\d+) 字节的一帧/, 'why bytes')
    expect(bytes).toBe(BYTES)
  })
})
