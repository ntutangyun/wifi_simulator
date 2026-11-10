/**
 * `@tier1-project-review`, in the standard-first shape (2026-11-11).
 *
 * The second half of the Tier 1 project, taken from a 10 s run of `tier1-project`'s own scene and
 * its three variants — the same builder and the same variant array, so the recorded timeline
 * hashes are the same run twice. ① is IEEE Std 802.11-2024 / 802.11be-2024 only (CCA, EIFS, the
 * ACK timeout, the Retry subfield, and the two things the standard leaves open). ② says what the
 * engine does, and this file checks it. ③'s every figure is read back out of the lesson and
 * compared with the run, or, for the prediction column, recomputed from the engine's own functions
 * and the Bianchi solver exactly as the first half's test does.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { tier1ProjectReview } from '../../src/course/tier1/tier1-project-review'
import { projectFlat, projectJumps, projectVariants } from '../../src/course/tier1/tier1-project'
import { saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { Simulation, timingFor } from '../../src/engine/simulation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_BYTES, CCA_ED_DBM, CCA_PD_DBM, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, SIFS_NS, SLOT_NS, ACK_TIMEOUT_NS,
  RX_START_DELAY_NS, ctrlRespRateForMode, mcsRateMbps, noiseDbm, reqSinrDb, txTimeModeNs, txTimeNs, EIFS_NS,
} from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite } from './kit'

const MS = 1_000_000
/** The Wi-Fi 7 laptops' ACK timeout: SIFS + slot + 24 µs (§6.7.4.4, Table 27-61; 2026-11-11, W6). */
const EHT_ACK_TIMEOUT_NS = timingFor('5g', 'eht').ackTimeoutNs
const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const MSDU = 1500
const PARAMS = { W: 16, m: 6, attempts: 7 } as const
const STUDY = 'sta-1'
const LIVING = 'sta-2'

function times(mcs: number): { dataNs: number; tsNs: number; tcNs: number } {
  const dataNs = txTimeModeNs('eht', MSDU + MAC_HDR_BYTES + FCS_BYTES, mcs, { widthMhz: 20 })
  const ackNs = txTimeNs(ACK_BYTES, ctrlRespRateForMode('eht', mcs, mcsRateMbps('eht', mcs)))
  return { dataNs, tsNs: dataNs + SIFS_NS + ackNs + DIFS_NS, tcNs: dataNs + EHT_ACK_TIMEOUT_NS + DIFS_NS }
}
const mix = (ts: number[]): number => ts.reduce((a, b) => a + b, 0) / ts.length
function modelS(n: number, tsNs: number, tcNs: number): number {
  const { tau } = solveBianchi({ n, ...PARAMS })
  return saturationThroughput({ n, tau, slotNs: SLOT_NS, tsNs, tcNs, payloadBits: PAYLOAD_BITS }).mbps
}

interface Stats {
  records: TLRecord[]
  attempts: Map<string, number>
  retries: Map<string, number>
  overlaps: Map<string, number>
  txOk: Map<string, number>
  airtimeNs: Map<string, number>
  firstMcs: Map<string, number>
  eifs: number
  pairTotal: Map<string, number>
  pairLate: Map<string, number>
}
const memo = new Map<string, Stats>()
function measure(key: string, scenario: Scenario): Stats {
  const hit = memo.get(key)
  if (hit) return hit
  const sim = new Simulation(scenario)
  const records = [...sim.runUntil(RUN_NS).records]
  const attempts = new Map<string, number>()
  const retries = new Map<string, number>()
  const overlaps = new Map<string, number>()
  const firstMcs = new Map<string, number>()
  const pairTotal = new Map<string, number>()
  const pairLate = new Map<string, number>()
  const lastStart = new Map<string, number>()
  let eifs = 0
  const bump = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1) }
  for (const r of records) {
    if (r.type === 'TX_START') {
      lastStart.set(r.node, r.t)
      if (r.frame.kind === 'data') {
        bump(attempts, r.node)
        if (!firstMcs.has(r.node)) firstMcs.set(r.node, r.frame.mcs ?? -1)
      }
    } else if (r.type === 'RETRY') bump(retries, r.node)
    else if (r.type === 'IFS_START' && r.kind === 'EIFS') eifs++
    else if (r.type === 'COLLISION') {
      for (const n of r.nodes) bump(overlaps, n)
      if (r.nodes.length === 2) {
        const ns = [...r.nodes].sort()
        const k2 = ns.join('+')
        bump(pairTotal, k2)
        if (Math.abs((lastStart.get(ns[0]!) ?? 0) - (lastStart.get(ns[1]!) ?? 0)) > 1000) bump(pairLate, k2)
      }
    }
  }
  const txOk = new Map<string, number>()
  const airtimeNs = new Map<string, number>()
  for (const [id, n] of Object.entries(sim.view.nodes)) {
    txOk.set(id, n.stats.txOk)
    airtimeNs.set(id, n.stats.airtimeNs)
  }
  const out: Stats = { records, attempts, retries, overlaps, txOk, airtimeNs, firstMcs, eifs, pairTotal, pairLate }
  memo.set(key, out)
  return out
}
const base = (): Stats => measure('base', tier1ProjectReview.scenario())
const vMoved = (): Stats => measure('moved', tier1ProjectReview.variants![0].scenario())
const vThird = (): Stats => measure('third', tier1ProjectReview.variants![1].scenario())
const vAlone = (): Stats => measure('alone', tier1ProjectReview.variants![2].scenario())
const mbps = (s: Stats, id: string): number => ((s.txOk.get(id) ?? 0) * PAYLOAD_BITS) / SECS / 1e6
const pooled = (s: Stats, ids: string[], m: Map<string, number>): number =>
  ids.reduce((a, id) => a + (m.get(id) ?? 0), 0) / ids.reduce((a, id) => a + (s.attempts.get(id) ?? 0), 0)
const sum = (m: Map<string, number>, ids: string[]): number => ids.reduce((a, id) => a + (m.get(id) ?? 0), 0)
const links = () => { const sc = projectFlat(); return buildLinkTable(sc.nodes, sc.walls) }
const atAp = (id: string): number => links().get(id)!.get('ap')!
const mutual = (): number => links().get(STUDY)!.get(LIVING)!
const predicted = (): number => modelS(2, mix([times(13).tsNs, times(2).tsNs]), mix([times(13).tcNs, times(2).tcNs]))
const pModel = (n: number): number => solveBianchi({ n, ...PARAMS }).p

// --- reading the lesson -------------------------------------------------------------------------
const STD = tier1ProjectReview.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join('\n')
const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
const raw = (text: string, re: RegExp, what: string): string[] => {
  const m = re.exec(text)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
const same = (printed: string, measured: number, what: string): void => {
  const f = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
  const dp = (f.split('.')[1] ?? '').length
  expect(Number(f), `${what} (to ${dp} decimals)`).toBe(Number(measured.toFixed(dp)))
}
const lab = (heading: string): Lab => {
  const l = tier1ProjectReview.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableNamed = (heading: string): Extract<Block, { kind: 'table' }> => {
  const t = tier1ProjectReview.labs!.flatMap((l) => l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const rowOf = (heading: string, starts: string): string[] => {
  const r = tableNamed(heading).rows.find((x) => x[0]!.startsWith(starts))
  expect(r, `row 「${starts}」 of 「${heading}」`).toBeDefined()
  return r!
}
const implRow = (topic: string) => {
  const row = tierRows().find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const tierRows = () => tier1ProjectReview.implementation!

lessonShapeSuite(tier1ProjectReview, { runNs: 30 * MS, sameSceneAs: 'tier1-project' })

describe('tier1-project-review · the lesson', () => {
  it('is standard-first, the second half of the project, owning one word', () => {
    expect(isStandardFirst(tier1ProjectReview)).toBe(true)
    expect(MODULES[tier1ProjectReview.module].title).toBe('第一阶段项目')
    expect(tier1ProjectReview.needs).toEqual(['tier1-project', 'cca', 'hidden', 'anomaly'])
    expect(COURSE_ORDER.indexOf('cca')).toBeLessThan(COURSE_ORDER.indexOf('tier1-project-review'))
    expect(COURSE_ORDER.indexOf('tier1-project-review')).toBe(COURSE_ORDER.indexOf('tier1-project') + 1)
    expect(tier1ProjectReview.terms!.map((t) => t.term)).toEqual(['estimator'])
    expect(tier1ProjectReview.limits).toEqual([])
    expect(tier1ProjectReview.observe).toEqual([])
    expect(tier1ProjectReview.tryThis).toEqual([])
  })

  it('loads tier1-project’s own scene and its three variants, object for object', () => {
    expect(tier1ProjectReview.scenario()).toEqual(projectFlat())
    expect(tier1ProjectReview.variants).toBe(projectVariants)
    expect(tier1ProjectReview.jumps).toBe(projectJumps)
  })

  it('cites each clause it teaches in ①', () => {
    for (const c of ['§17.3.10.6.1', '§36.3.21.6.3', '§10.3.2.3.7', '式 10-7', '§10.3.2.11', '表 17-24', '表 27-61', '§10.3.4.4', '§17.3.10', '§10.6.1']) {
      expect(STD, c).toContain(c)
    }
  })

  it('① prints the two CCA thresholds, the EIFS sum and the aRxPHYStartDelay the engine uses', () => {
    const [pd, ed] = figs(STD, /不低于 (−\d+) dBm 的一次 OFDM 传输的开始[\s\S]*?即不低于 (−\d+) dBm 的信号/, '① on CCA')
    expect([pd, ed]).toEqual([CCA_PD_DBM, CCA_ED_DBM])
    expect(ed! - pd!).toBe(figs(STD, /任何能量比这高 (\d+) dB/, '① on the 20 dB')[0])
    const [s, ack, d, e] = figs(STD, /EIFS = (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/, '① on EIFS')
    expect([s! * 1000, ack! * 1000, d! * 1000, e! * 1000]).toEqual([SIFS_NS, txTimeNs(ACK_BYTES, 6), DIFS_NS, EIFS_NS])
    const [cl17, he] = figs(STD, /第 17 章为 (\d+) µs（表 17-24），HE 为 (\d+) µs（表 27-61）/, '① on aRxPHYStartDelay')
    expect(cl17! * 1000).toBe(RX_START_DELAY_NS)
    expect(he).toBe(24)
  })
})

describe('tier1-project-review · ② says what the engine does, and the engine does it', () => {
  it('has rows of several kinds, and since W6 (2026-11-11) none of them `differs`', () => {
    expect(tierRows().filter((r) => r.kind === 'differs').map((r) => r.topic)).toEqual([])
    expect(new Set(tierRows().map((r) => r.kind)).size).toBeGreaterThan(2)
  })

  it('a frame that began during our own transmission is energy only, and −72.64 dBm is below −62', () => {
    const [lv] = raw(implRow('没有听到开头的帧').sim, /互相接收到的电平是 (−[\d.]+) dBm，达不到 (−\d+) dBm/, '② on the pair')
    same(lv!, mutual(), 'the level the laptops hear each other at')
    expect(mutual()).toBeGreaterThan(CCA_PD_DBM)
    expect(mutual()).toBeLessThan(CCA_ED_DBM)
    expect(val(/达不到 (−\d+) dBm/.exec(implRow('没有听到开头的帧').sim)![1]!)).toBe(CCA_ED_DBM)
    // and the run shows it: the study laptop starts again inside the living-room frame
    const starts = base().records.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.frame.kind === 'data')
    const living = starts.find((r) => r.node === LIVING)!
    expect(starts.filter((r) => r.node === STUDY)[1]!.t).toBeLessThan(living.t + living.frame.txTimeNs)
  })

  it('EIFS is 94 µs; the ACK timeout is HE’s 49 µs', () => {
    expect(figs(implRow('EIFS').sim, /取 (\d+) µs/, '② on EIFS')[0]! * 1000).toBe(EIFS_NS)
    const [s, sl, d, t] = figs(implRow('ACK 超时').sim, /ACK 超时为 (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/, '② on the ACK timeout')
    expect([s! * 1000, sl! * 1000, d! * 1000, t! * 1000]).toEqual([SIFS_NS, SLOT_NS, 24_000, EHT_ACK_TIMEOUT_NS])
    expect(implRow('ACK 超时').kind).toBe('faithful')
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS) // a clause 17 STA's, for contrast
    // and the run waits exactly that long after a frame whose Ack never comes
    const rs = base().records
    const to = rs.find((r) => r.type === 'ACK_TIMEOUT' && r.node === STUDY)!
    const end = rs.filter((r): r is Extract<TLRecord, { type: 'TX_END' }> => r.type === 'TX_END' && r.node === STUDY && r.t <= to.t).pop()!
    expect(to.t - end.t).toBe(EHT_ACK_TIMEOUT_NS)
  })

  it('capture: 5 dB and 4 dB, the constants `channel.ts` really holds', () => {
    const [cap, det] = figs(implRow('捕获').sim, /强 (\d+) dB 以上[\s\S]*?高 (\d+) dB 才被检测到/, '② on capture')
    const CH = readFileSync(new URL('../../src/engine/channel.ts', import.meta.url), 'utf8')
    expect(cap).toBe(figs(CH, /CAPTURE_MARGIN_DB = (\d+)/, 'channel.ts')[0])
    expect(det).toBe(PREAMBLE_DETECT_SINR_DB)
    const [pct, lo, hi] = figs(implRow('捕获').sim, /约 (\d+)% 的重叠帧仍被收下”是这两个数的函数，换成 (\d+) dB 或 (\d+) dB/, '② on the share')
    const s = base()
    expect(Math.round(100 * (1 - sum(s.retries, [STUDY, LIVING]) / sum(s.overlaps, [STUDY, LIVING])))).toBe(pct)
    expect(lo).toBeLessThan(cap!)
    expect(hi).toBeGreaterThan(cap!)
  })

  it('the levels are fixed: no fading section in any of this lesson’s scenes', () => {
    for (const sc of [tier1ProjectReview.scenario(), ...tier1ProjectReview.variants!.map((v) => v.scenario())]) expect(sc.fading).toBeUndefined()
    same(raw(implRow('电平是定数').sim, /(−[\d.]+) dBm 始终落在/, '② on the level')[0]!, mutual(), 'the level')
  })
})

describe('tier1-project-review · ③ every figure the labs print is the run', () => {
  it('lab 1: the headline table, predicted against measured', () => {
    const s = base()
    const ids = [STUDY, LIVING]
    expect(figs(rowOf('预测对实测：这户人家的十秒钟', '等级')[1]!, /MCS (\d+) \/ MCS (\d+)/, 'predicted rungs')).toEqual([13, 2])
    expect(figs(rowOf('预测对实测：这户人家的十秒钟', '等级')[2]!, /MCS (\d+) \/ MCS (\d+)/, 'measured rungs')).toEqual(ids.map((id) => s.firstMcs.get(id)))
    const frames = rowOf('预测对实测：这户人家的十秒钟', '数据帧')
    const [p1, p2] = raw(frames[1]!, /^([\d.]+) \/ ([\d.]+) µs$/, 'predicted frames')
    same(p1!, times(13).dataNs / 1000, 'predicted short'); same(p2!, times(2).dataNs / 1000, 'predicted long')
    const [g1, g2] = raw(frames[2]!, /全程均值 ([\d.]+) \/ ([\d.]+) µs/, 'measured frames')
    same(g1!, s.airtimeNs.get(STUDY)! / s.attempts.get(STUDY)! / 1000, 'mean short')
    same(g2!, s.airtimeNs.get(LIVING)! / s.attempts.get(LIVING)! / 1000, 'mean long')
    const coll = rowOf('预测对实测：这户人家的十秒钟', '碰撞概率')
    same(coll[1]!.replace(' %', ''), 100 * pModel(2), 'predicted p')
    const [ov, rt] = raw(coll[2]!, /([\d.]+) % 的尝试重叠；([\d.]+) % 以重传收场/, 'two estimators')
    same(ov!, 100 * pooled(s, ids, s.overlaps), 'overlap rate'); same(rt!, 100 * pooled(s, ids, s.retries), 'retry rate')
    const tot = rowOf('预测对实测：这户人家的十秒钟', '合计交付')
    same(tot[1]!.replace(' Mb/s', ''), predicted(), 'predicted S')
    same(tot[2]!.replace(' Mb/s', ''), mbps(s, STUDY) + mbps(s, LIVING), 'measured S')
    expect(figs(rowOf('预测对实测：这户人家的十秒钟', '各自帧数')[2]!, /([\d,]+) \/ ([\d,]+)/, 'frames')).toEqual(ids.map((id) => s.txOk.get(id)))
    const air = rowOf('预测对实测：这户人家的十秒钟', '空口占比')
    const [pa, pb] = raw(air[1]!, /([\d.]+) % \/ ([\d.]+) %/, 'predicted share')
    same(pa!, 100 * times(13).dataNs / (times(13).dataNs + times(2).dataNs), 'pred share a')
    same(pb!, 100 * times(2).dataNs / (times(13).dataNs + times(2).dataNs), 'pred share b')
    const a1 = s.airtimeNs.get(STUDY)!; const a2 = s.airtimeNs.get(LIVING)!
    const [ma, mb] = raw(air[2]!, /([\d.]+) % \/ ([\d.]+) %/, 'measured share')
    same(ma!, 100 * a1 / (a1 + a2), 'share a'); same(mb!, 100 * a2 / (a1 + a2), 'share b')
    const solo = rowOf('预测对实测：这户人家的十秒钟', '书房笔记本独占')
    same(solo[1]!.replace(' Mb/s', ''), PAYLOAD_BITS / ((times(13).tsNs + 7.5 * SLOT_NS) * 1e-9) / 1e6, 'solo predicted')
    same(solo[2]!.replace(' Mb/s', ''), mbps(vAlone(), STUDY), 'solo measured')

    const [es, ep, short, er, ep2, eo] = raw(lab('四次运行，一张答题纸').expect, /合计交付 ([\d.]+) Mb\/s，比预测的 ([\d.]+) 少 ([\d.]+)%；([\d.]+)% 的尝试以重传收场，看上去接近预测的 ([\d.]+)%，而实际有 ([\d.]+)% 的尝试发生了重叠/, 'lab 1 expect')
    const got = mbps(s, STUDY) + mbps(s, LIVING)
    same(es!, got, 'expect: S'); same(ep!, predicted(), 'expect: predicted')
    same(short!, 100 * (predicted() - got) / predicted(), 'expect: shortfall')
    same(er!, 100 * pooled(s, ids, s.retries), 'expect: retry'); same(ep2!, 100 * pModel(2), 'expect: p')
    same(eo!, 100 * pooled(s, ids, s.overlaps), 'expect: overlap')
    // the `why`'s 「两倍多」 and 「近一半」
    expect(pooled(s, ids, s.overlaps) / pModel(2)).toBeGreaterThan(2)
    const kept = 1 - sum(s.retries, ids) / sum(s.overlaps, ids)
    expect(kept).toBeGreaterThan(0.4); expect(kept).toBeLessThan(0.5)
  })

  it('lab 1: the three variants’ rows, sums included', () => {
    const moved = rowOf('三个变体的运行结果', '书房笔记本搬到客厅')
    const [pS, pP] = raw(moved[1]!, /([\d.]+) Mb\/s · ([\d.]+) %/, 'moved predicted')
    same(pS!, modelS(2, mix([times(3).tsNs, times(2).tsNs]), mix([times(3).tcNs, times(2).tcNs])), 'moved S'); same(pP!, 100 * pModel(2), 'moved p')
    const [t, a, b, o] = raw(moved[2]!, /([\d.]+) = ([\d.]+) \+ ([\d.]+) Mb\/s · ([\d.]+) %/, 'moved measured')
    const m = vMoved()
    same(a!, mbps(m, STUDY), 'moved a'); same(b!, mbps(m, LIVING), 'moved b'); same(t!, mbps(m, STUDY) + mbps(m, LIVING), 'moved sum')
    same(o!, 100 * pooled(m, [STUDY, LIVING], m.overlaps), 'moved overlap')
    expect(Math.abs(pooled(m, [STUDY, LIVING], m.overlaps) - pModel(2))).toBeLessThan(0.01)
    const third = rowOf('三个变体的运行结果', '多一台平板')
    const [tS, tP] = raw(third[1]!, /([\d.]+) Mb\/s · ([\d.]+) %/, 'third predicted')
    const S3 = modelS(3, mix([times(13).tsNs, times(13).tsNs, times(2).tsNs]), mix([times(13).tcNs, times(13).tcNs, times(2).tcNs]))
    same(tS!, S3, 'third S'); same(tP!, 100 * pModel(3), 'third p')
    const th = vThird()
    const ids3 = [STUDY, LIVING, 'sta-4']
    const [t3, x, y, z, r3] = raw(third[2]!, /([\d.]+) = ([\d.]+) \+ ([\d.]+) \+ ([\d.]+) Mb\/s · ([\d.]+) %/, 'third measured')
    same(x!, mbps(th, STUDY), 'third a'); same(y!, mbps(th, LIVING), 'third b'); same(z!, mbps(th, 'sta-4'), 'third c')
    const tot3 = ids3.reduce((acc, id) => acc + mbps(th, id), 0)
    same(t3!, tot3, 'third sum'); same(r3!, 100 * pooled(th, ids3, th.retries), 'third retry rate')
    expect(Math.round(100 * (S3 - tot3) / S3)).toBe(figs(third[3]!, /少了 (\d+) %/, 'third shortfall')[0])
    const mcs0 = th.records.filter((r) => r.type === 'TX_START' && r.node === LIVING && r.frame.kind === 'data' && r.frame.mcs === 0).length
    expect(figs(third[3]!, /（MCS）(\d+)/, 'third rung')[0]).toBe(0)
    expect(mcs0).toBeGreaterThan(1000)
    const alone = rowOf('三个变体的运行结果', '客厅笔记本离线')
    same(alone[1]!.replace(' Mb/s', ''), PAYLOAD_BITS / ((times(13).tsNs + 7.5 * SLOT_NS) * 1e-9) / 1e6, 'alone predicted')
    const [aS, aR] = raw(alone[2]!, /([\d.]+) Mb\/s · ([\d.]+) %/, 'alone measured')
    same(aS!, mbps(vAlone(), STUDY), 'alone S'); same(aR!, 100 * pooled(vAlone(), [STUDY], vAlone().retries), 'alone retries')
  })

  it('lab 2: the late start in the first millisecond, and 1,254 of 2,271', () => {
    const l = lab('第一次碰撞之后：没有听到开头的帧')
    expect(l.jump).toBe(1)
    const s = base()
    const starts = s.records.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.frame.kind === 'data')
    const study = starts.filter((r) => r.node === STUDY)
    const living = starts.find((r) => r.node === LIVING)!
    expect([study[0]!.t, living.t]).toEqual([0, 0])
    const [first, again, long, lv, total, late] = raw(l.expect, /书房笔记本 ([\d.]+) µs 的色块结束，然后在 ([\d.]+) µs 又发送了一次——此时客厅笔记本那个 ([\d.]+) µs 的帧仍在传送。两台互相接收到的电平是 (−[\d.]+) dBm；十秒内 ([\d,]+) 次笔记本之间的碰撞中有 ([\d,]+) 次/, 'lab 2 expect')
    same(first!, study[0]!.frame.txTimeNs / 1000, 'the first short frame')
    same(again!, study[1]!.t / 1000, 'the second start')
    same(long!, living.frame.txTimeNs / 1000, 'the long frame')
    expect(study[1]!.t).toBeLessThan(living.t + living.frame.txTimeNs)
    same(lv!, mutual(), 'the mutual level')
    expect(val(total!)).toBe(s.pairTotal.get(`${STUDY}+${LIVING}`))
    expect(val(late!)).toBe(s.pairLate.get(`${STUDY}+${LIVING}`))
    same(raw(l.meaning, /而 (−[\d.]+) dBm 达不到/, 'lab 2 meaning')[0]!, mutual(), 'meaning: level')
  })

  it('lab 3: the gap table, and the 34.4 dB between the two arrivals', () => {
    const s = base()
    const ids = [STUDY, LIVING]
    const cap = rowOf('差距出在哪里', '捕获效应')
    const [ov, rt] = figs(cap[1]!, /^([\d,]+) 次重叠 → ([\d,]+) 次重传$/, 'capture counts')
    expect([ov, rt]).toEqual([sum(s.overlaps, ids), sum(s.retries, ids)])
    const [kept, apart] = figs(cap[2]!, /约 (\d+) % 的重叠帧仍被收下；两台相差 (\d+) dB/, 'capture share')
    expect(Math.round(100 * (1 - rt! / ov!))).toBe(kept)
    expect(Math.round(atAp(STUDY) - atAp(LIVING))).toBe(apart)
    const late = rowOf('差距出在哪里', '没有听到开头的帧')
    const [tot, lt] = figs(late[1]!, /^([\d,]+) 次笔记本之间的碰撞中有 ([\d,]+) 次$/, 'late starts')
    expect([tot, lt]).toEqual([s.pairTotal.get(`${STUDY}+${LIVING}`), s.pairLate.get(`${STUDY}+${LIVING}`)])
    const [from, to] = raw(late[2]!, /^([\d.]+) % → ([\d.]+) %$/, 'estimator')
    same(from!, 100 * pModel(2), 'model'); same(to!, 100 * pooled(s, ids, s.overlaps), 'overlap rate')
    const longer = rowOf('差距出在哪里', '帧在速率控制下变长')
    const [gs, ps, gl, pl] = raw(longer[1]!, /^([\d.]+) vs ([\d.]+) µs · ([\d.]+) vs ([\d.]+) µs$/, 'four lengths')
    same(gs!, s.airtimeNs.get(STUDY)! / s.attempts.get(STUDY)! / 1000, 'mean short'); same(ps!, times(13).dataNs / 1000, 'pred short')
    same(gl!, s.airtimeNs.get(LIVING)! / s.attempts.get(LIVING)! / 1000, 'mean long'); same(pl!, times(2).dataNs / 1000, 'pred long')
    const got = mbps(s, STUDY) + mbps(s, LIVING)
    same(raw(longer[2]!, /吞吐减少的 ([\d.]+) %/, 'shortfall')[0]!, 100 * (1 - got / predicted()), 'shortfall')
    const l = lab('捕获：重叠多，重传少')
    const [eo, er, ek, ed, det] = raw(l.expect, /([\d,]+) 次重叠只带来 ([\d,]+) 次重传，约 (\d+)% 的重叠帧仍被收下；两台到达路由器的电平相差 ([\d.]+) dB，书房那一路远超 (\d+) dB 的检测门限/, 'lab 3 expect')
    expect([val(eo!), val(er!)]).toEqual([ov, rt])
    expect(val(ek!)).toBe(kept)
    same(ed!, atAp(STUDY) - atAp(LIVING), 'the gap at the router')
    expect(val(det!)).toBe(PREAMBLE_DETECT_SINR_DB)
    expect(atAp(STUDY) - atAp(LIVING)).toBeGreaterThan(PREAMBLE_DETECT_SINR_DB)
  })

  it('lab 4: the three waits after one frame: 49, 94 and 34 µs', () => {
    const s = base()
    expect(figs(rowOf('同一帧之后，各自要等多久', '碰撞的一方')[2]!, /^(\d+) µs$/, 'ack timeout')[0]! * 1000).toBe(EHT_ACK_TIMEOUT_NS)
    const eifsRow = rowOf('同一帧之后，各自要等多久', '客厅笔记本')
    const [got, need] = raw(eifsRow[1]!, /^([\d.]+) dB，而这一帧要求 ([\d.]+) dB$/, 'two SINRs')
    same(got!, mutual() - noiseDbm(20), 'what the living-room laptop gets')
    same(need!, reqSinrDb('eht', s.firstMcs.get(STUDY)!), 'what MCS 13 asks for')
    const [eu, ec] = figs(eifsRow[2]!, /EIFS，(\d+) µs——共 ([\d,]+) 次/, 'EIFS')
    expect(eu! * 1000).toBe(EIFS_NS)
    expect(ec).toBe(s.eifs)
    expect(figs(rowOf('同一帧之后，各自要等多久', '什么都没检出的')[2]!, /DIFS, (\d+) µs/, 'DIFS')[0]! * 1000).toBe(DIFS_NS)
    const l = lab('同一帧之后，各自要等多久')
    const [e1, d1, count, to] = figs(l.expect, /写的是 (\d+) µs，而不是 (\d+)[\s\S]*?这样的等待有 ([\d,]+) 次。碰撞的一方等的是 (\d+) µs/, 'lab 4 expect')
    expect([e1! * 1000, d1! * 1000, count, to! * 1000]).toEqual([EIFS_NS, DIFS_NS, s.eifs, EHT_ACK_TIMEOUT_NS])
    const [m49] = figs(l.meaning, /ACK 超时取 (\d+) µs，同样照标准/, 'lab 4 meaning')
    expect(m49! * 1000).toBe(EHT_ACK_TIMEOUT_NS)
  })

  it('lab 5: the rubric’s figures and the lengthening', () => {
    const s = base()
    const l = lab('还差的那一点，以及写报告')
    const rubric = (l.blocks!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>).items.join('\n')
    const [near, far] = raw(rubric, /都应落在 (−[\d.]+) 与 (−[\d.]+) dBm 的一个分贝之内/, 'rubric levels')
    same(near!, atAp(STUDY), 'near arrival'); same(far!, atAp(LIVING), 'far arrival')
    const [a, b] = raw(rubric, /屏幕上是 ([\d.]+) 与 ([\d.]+) µs/, 'rubric frames')
    same(a!, times(13).dataNs / 1000, 'short'); same(b!, times(2).dataNs / 1000, 'long')
    const a1 = s.airtimeNs.get(STUDY)!; const a2 = s.airtimeNs.get(LIVING)!
    const [x, y] = raw(rubric, /占用的空口却是 ([\d.]+)% 与 ([\d.]+)%/, 'rubric share')
    same(x!, 100 * a1 / (a1 + a2), 'share a'); same(y!, 100 * a2 / (a1 + a2), 'share b')
    const [ms, ml, ps, pl, short] = raw(l.expect, /全程均值 ([\d.]+) µs、客厅笔记本 ([\d.]+) µs，都比按第一帧等级算出的 ([\d.]+) 与 ([\d.]+) µs 长；吞吐比预测少 ([\d.]+)%/, 'lab 5 expect')
    same(ms!, a1 / s.attempts.get(STUDY)! / 1000, 'mean short'); same(ml!, a2 / s.attempts.get(LIVING)! / 1000, 'mean long')
    same(ps!, times(13).dataNs / 1000, 'pred short'); same(pl!, times(2).dataNs / 1000, 'pred long')
    const got = mbps(s, STUDY) + mbps(s, LIVING)
    same(short!, 100 * (1 - got / predicted()), 'shortfall')
  })
})

describe('tier1-project-review · the quiz prints the same run', () => {
  it('the predicted chance, the retry rate, the overlap rate, the capture share, the level', () => {
    const s = base()
    const ids = [STUDY, LIVING]
    const quiz = tier1ProjectReview.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
    const [pred, retry] = raw(quiz, /你预测的碰撞概率是 ([\d.]+) %，实跑中 ([\d.]+) %/, 'quiz question')
    same(pred!, 100 * pModel(2), 'p'); same(retry!, 100 * pooled(s, ids, s.retries), 'retry rate')
    same(raw(quiz, /实际有 ([\d.]+) % 的尝试重叠/, 'overlap')[0]!, 100 * pooled(s, ids, s.overlaps), 'overlap rate')
    expect(Math.round(100 * (1 - sum(s.retries, ids) / sum(s.overlaps, ids)))).toBe(figs(quiz, /其中约 (\d+) % 因捕获/, 'capture share')[0])
    expect(Math.round(atAp(STUDY) - atAp(LIVING))).toBe(figs(quiz, /两台笔记本之间相差 (\d+) dB/, 'gap')[0])
    same(raw(quiz, /而 (−[\d.]+) dBm 达不到/, 'quiz level')[0]!, mutual(), 'mutual level')
    for (const v of [...quiz.matchAll(/(−\d+) dBm 的能量门限|达到 (−\d+) dBm 才能/g)].map((m) => m[1] ?? m[2]!)) expect(val(v)).toBe(CCA_ED_DBM)
    expect(figs(quiz, /对 (−\d+) dBm 的检测要求/, 'quiz PD')[0]).toBe(CCA_PD_DBM)
    const [qc, qd] = figs(quiz, /(\d+) dB 捕获门限与 (\d+) dB 前导码检测门限/, 'quiz thresholds')
    expect([qc, qd]).toEqual([5, PREAMBLE_DETECT_SINR_DB])
  })

  it('`sources` names the two constants of channel.ts', () => {
    const src = tier1ProjectReview.sources!.join('\n')
    const [c, d] = figs(src, /捕获门限 (\d+) dB 与前导码检测门限 (\d+) dB/, '`sources`')
    expect([c, d]).toEqual([5, PREAMBLE_DETECT_SINR_DB])
    // 2026-11-11 (W6): the ACK timeout is the standard's now, so `sources` no longer lists it among the engine's values
    expect(src).not.toMatch(/µs ACK 超时/)
  })
})
