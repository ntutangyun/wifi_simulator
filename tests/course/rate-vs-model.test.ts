/**
 * `@rate-vs-model`, in the standard-first shape (2026-11-11).
 *
 * The second half of `bianchi-vs-sim`: the same five stations moved to a 1 m circle round the
 * access point, where the model is out by a factor of five and the cause is the engine's rate
 * control, not contention. It loads its parent's scene and its two variants rather than declaring
 * any of its own, so `lessonShapeSuite(..., { sameSceneAs: 'bianchi-vs-sim' })` proves the two ids
 * replay the same timeline.
 *
 * ① is IEEE Std 802.11-2024 only (backoff §10.3.3, retry limit §10.3.4.4, acknowledgment and its
 * timeout §10.3.2.11, Table 17-24, control response rate §10.6.6.5.2, and §10.6.1's 「the algorithm
 * for performing rate switching is beyond the scope of this standard」). ② says what the engine
 * does for each; this file checks the engine does it. ③'s figures are read back out of the lesson
 * text and compared with a 10 s run, so a number edited without the engine agreeing turns this
 * red, and so does an engine change that moves a number the lesson still prints.
 */
import { describe, it, expect } from 'vitest'
import { rateVsModel } from '../../src/course/tier1/rate-vs-model'
import { bianchiVsSim, bianchiVsSimJumps, bianchiVsSimVariants } from '../../src/course/tier1/bianchi-vs-sim'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { MODULES } from '../../src/course/curriculum'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import {
  ACK_TIMEOUT_NS, CW_MAX, CW_MIN, DIFS_NS, SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS, RX_START_DELAY_NS,
  RATES, ctrlRespRateFor, dataRateFor, noiseDbm,
} from '../../src/engine/phy'
import { FAILURES_TO_STEP_DOWN, RateControl } from '../../src/engine/rate'
import { buildLinkTable } from '../../src/engine/propagation'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite } from './kit'

const SECS = 10
const RUN_NS = SECS * 1e9
const PAYLOAD_BITS = 12_000
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

interface Stats {
  records: TLRecord[]
  attempts: number
  collided: number
  p: number
  mbps: number
  meanDataNs: number
  rateMix: Map<number, number>
}

const memo = new Map<string, Stats>()
function measure(key: string, scenario: Scenario): Stats {
  const hit = memo.get(key)
  if (hit) return hit
  const records = [...new Simulation(scenario).runUntil(RUN_NS).records]
  const rateMix = new Map<number, number>()
  let attempts = 0
  let collided = 0
  let acks = 0
  let dataAirNs = 0
  for (const r of records) {
    if (r.type === 'TX_START' && r.frame.kind === 'data') {
      attempts++
      dataAirNs += r.frame.txTimeNs
      rateMix.set(r.frame.mbps, (rateMix.get(r.frame.mbps) ?? 0) + 1)
    } else if (r.type === 'TX_START' && r.frame.kind === 'ack') acks++
    else if (r.type === 'RETRY') collided++
  }
  const out: Stats = {
    records, attempts, collided, p: collided / attempts,
    mbps: (acks * PAYLOAD_BITS) / SECS / 1e6, meanDataNs: dataAirNs / attempts, rateMix,
  }
  memo.set(key, out)
  return out
}
const near = (): Stats => measure('near', rateVsModel.scenario())
const arc5 = (): Stats => measure('arc5', rateVsModel.variants![0].scenario())

const tau = (): number => solveBianchi({ n: 5, ...PARAMS }).tau
const paperMbps = (): number => {
  const t54 = dcfTimes(1500, 54)
  return saturationThroughput({ n: 5, tau: tau(), slotNs: SLOT_NS, tsNs: t54.tsNs, tcNs: t54.tcNs, payloadBits: PAYLOAD_BITS }).mbps
}
/** The same fixed point with the run's own mean airtime in place of the assumed one; the ACK at 6 Mb/s. */
const replacedMbps = (): number => {
  const m = near().meanDataNs
  const ackNs = dcfTimes(1500, 6).ackNs
  return saturationThroughput({
    n: 5, tau: tau(), slotNs: SLOT_NS, payloadBits: PAYLOAD_BITS,
    tsNs: m + SIFS_NS + ackNs + DIFS_NS, tcNs: m + ACK_TIMEOUT_NS + DIFS_NS,
  }).mbps
}
const level = (): number => {
  const s = rateVsModel.scenario()
  return buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
}
const shareOf = (s: Stats, mbps: number): number => 100 * (s.rateMix.get(mbps) ?? 0) / s.attempts

// --- reading the lesson -------------------------------------------------------------------------
const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
const fig = (text: string, re: RegExp, what: string): string[] => {
  const m = re.exec(text)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
/** A printed figure against a measurement, at the precision the lesson prints it to. */
const same = (printed: string, measured: number, what: string): void => {
  const f = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
  const dp = (f.split('.')[1] ?? '').length
  expect(Number(f), `${what} (to ${dp} decimals)`).toBe(Number(measured.toFixed(dp)))
}
const CN = '零一二三四五六七八九十'
const cn = (ch: string): number => CN.indexOf(ch)
const lab = (heading: string): Lab => {
  const l = rateVsModel.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = rateVsModel.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const STD = rateVsModel.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join('\n')

lessonShapeSuite(rateVsModel, { sameSceneAs: 'bianchi-vs-sim', runNs: RUN_NS })

describe('rate-vs-model · the lesson', () => {
  it('is standard-first, in the model module, behind its own first half', () => {
    expect(isStandardFirst(rateVsModel)).toBe(true)
    expect(MODULES[rateVsModel.module].title).toBe('在纸上预测 DCF')
    expect(rateVsModel.needs).toEqual(['bianchi-vs-sim', 'anomaly'])
    expect(rateVsModel.terms!.map((t) => t.term)).toEqual(['rate control', 'CARA'])
    expect(rateVsModel.limits).toEqual([])
    expect(rateVsModel.observe).toEqual([])
    expect(rateVsModel.tryThis).toEqual([])
    for (const q of rateVsModel.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('loads bianchi-vs-sim’s own scene, variant array and jumps, object for object', () => {
    expect(() => ScenarioSchema.parse(rateVsModel.scenario())).not.toThrow()
    expect(rateVsModel.scenario()).toEqual(bianchiVsSim.scenario())
    expect(rateVsModel.variants).toBe(bianchiVsSimVariants)
    expect(rateVsModel.jumps).toBe(bianchiVsSimJumps)
  })

  it('cites each clause it teaches in ①, and keeps the paper out of it', () => {
    for (const c of ['§10.3.2.11', '§10.3.3', '§10.3.4.3', '§10.3.4.4', '表 17-24', '式 10-6', '§10.6.1', '§10.6.5.8', '§10.6.6.5.2', '§17.1.1']) {
      expect(STD, c).toContain(c)
    }
    expect(STD).toContain('执行速率切换的算法不在本标准范围之内')
    expect(STD).toContain('Bianchi 模型出自论文，不是标准内容')
    // the paper's formula lives in ③, labelled as a paper
    const f = lab('近处的五台站点：预测与实测相差五倍').blocks!.find((b) => b.kind === 'formula')!
    expect(f.heading).toBe('Bianchi 模型（论文，不是标准）')
  })

  it('① prints the standard’s own constants, and the engine uses them', () => {
    const [slot, sifs, rxStart, cwMin, cwMax] = fig(STD,
      /aSlotTime 为 (\d+) µs，aSIFSTime 为 (\d+) µs，aRxPHYStartDelay 为 (\d+) µs，aCWmin 为 (\d+)，aCWmax 为 (\d+)/, '① on Table 17-24').map(val)
    expect([slot, sifs, rxStart, cwMin, cwMax]).toEqual([SLOT_NS / 1000, SIFS_NS / 1000, RX_START_DELAY_NS / 1000, CW_MIN, CW_MAX])
    const [difs] = fig(STD, /2 × aSlotTime = (\d+) µs/, '① on DIFS').map(val)
    expect(difs).toBe(DIFS_NS / 1000)
    const [a, b, c, timeout] = fig(STD, /ACK 超时 = (\d+) \+ (\d+) \+ (\d+) = (\d+) µs/, '① on the ACK timeout').map(val)
    expect([a, b, c]).toEqual([sifs, slot, rxStart])
    expect(timeout).toBe(ACK_TIMEOUT_NS / 1000)
    const [retry] = fig(STD, /dot11ShortRetryLimit（默认值 (\d+)/, '① on the retry limit').map(val)
    expect(retry).toBe(SHORT_RETRY_LIMIT)
    const [r1, r2, r3] = fig(STD, /强制速率是 (\d+)、(\d+)、(\d+) Mb\/s/, '① on the mandatory rates').map(val)
    // every response the engine picks is one of the three
    expect(new Set(RATES.map((r) => ctrlRespRateFor(r.mbps)))).toEqual(new Set([r1, r2, r3]))
  })
})

describe('rate-vs-model · ② says what the engine does, and the engine does it', () => {
  it('has rows of more than one kind', () => {
    const kinds = new Set(rateVsModel.implementation!.map((r) => r.kind))
    expect(kinds.size).toBeGreaterThan(1)
    expect(implRow('速率选择算法').kind).toBe('choice')
  })

  it('backoff: CW 15 … 1023, doubling on each failure', () => {
    expect(implRow('退避与竞争窗口').sim).toContain('15、31、63……1023')
    const cws = new Set(near().records.filter((r): r is Extract<TLRecord, { type: 'CW_CHANGE' }> => r.type === 'CW_CHANGE').map((r) => r.cw))
    for (const cw of cws) expect([15, 31, 63, 127, 255, 511, 1023], `CW ${cw}`).toContain(cw)
    const draws = near().records.filter((r): r is Extract<TLRecord, { type: 'BACKOFF_DRAW' }> => r.type === 'BACKOFF_DRAW')
    expect(draws.every((d) => d.value >= 0 && d.value <= d.cw)).toBe(true)
  })

  it('retry limit 7, and a ten-minute lifetime that keeps the stations saturated', () => {
    expect(SHORT_RETRY_LIMIT).toBe(7)
    expect(rateVsModel.scenario().queue?.lifetimeMs).toBe(600_000)
    expect(implRow('重传上限').sim).toContain('10 分钟')
  })

  it('the rate rule: two failures down a rung, ten successes up, capped by the ceiling', () => {
    expect(FAILURES_TO_STEP_DOWN).toBe(2)
    const rc = new RateControl()
    expect(rc.mcsFor('p', 5)).toBe(5)
    rc.mcsFor('p', 7) // the ceiling rises; the working rung does not move by itself
    rc.onFailure('p')
    expect(rc.mcsFor('p', 7)).toBe(5)
    rc.onFailure('p')
    expect(rc.mcsFor('p', 7)).toBe(4)
    for (let i = 0; i < 9; i++) rc.onSuccess('p')
    expect(rc.mcsFor('p', 7)).toBe(4)
    rc.onSuccess('p')
    expect(rc.mcsFor('p', 7)).toBe(5)
    // any success clears the failure count
    rc.onFailure('p'); rc.onSuccess('p'); rc.onFailure('p')
    expect(rc.mcsFor('p', 7)).toBe(5)
    expect(implRow('速率选择算法').sim).toContain('连续两次失败降一档，连续十次成功升一档')
  })

  it('the ceiling: −36.215 dBm and 54 Mb/s, three decibels above that rung’s sensitivity', () => {
    const [lv] = fig(implRow('速率上限').sim, /到达 (−[\d.]+) dBm，上限为 (\d+) Mb\/s/, '② on the ceiling')
    same(lv!, level(), 'the level close in')
    const [, top] = fig(implRow('速率上限').sim, /到达 (−[\d.]+) dBm，上限为 (\d+) Mb\/s/, '② on the ceiling')
    expect(dataRateFor(level())).toBe(val(top!))
    const s54 = RATES.find((r) => r.mbps === 54)!.sensDbm
    expect(dataRateFor(s54 + 3)).toBe(54)
    expect(dataRateFor(s54 + 2.9)).toBeLessThan(54)
  })

  it('the ACK rate: the highest of 6 / 12 / 24 not above the data rate', () => {
    expect([54, 18, 9, 6].map(ctrlRespRateFor)).toEqual([24, 12, 6, 6])
  })

  it('overlap: equal levels, so the access point captures nothing and misses equal retries', () => {
    const misses = near().records.filter((r) => r.type === 'RX_MISS' && r.node === 'ap').length
    const [m1, m2] = fig(implRow('两帧重叠时的接收').sim, /接入点 (\d+) 次“错失”，恰好对应 (\d+) 次重传/, '② on the misses').map(val)
    expect([m1, m2]).toEqual([misses, near().collided])
    expect(near().records.some((r) => r.type === 'RX_FAIL' && r.node === 'ap')).toBe(false)
    const [lv] = fig(implRow('两帧重叠时的接收').sim, /电平完全相同（(−[\d.]+) dBm）/, '② on the level')
    same(lv!, level(), 'the level every station arrives at')
    const s = rateVsModel.scenario()
    const t = buildLinkTable(s.nodes, s.walls)
    const levels = s.nodes.filter((n) => n.kind === 'sta').map((n) => t.get(n.id)!.get('ap')!)
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(0.002)
  })

  it('the link level does not move: no fading section in any of this lesson’s scenes', () => {
    for (const sc of [rateVsModel.scenario(), ...rateVsModel.variants!.map((v) => v.scenario())]) expect(sc.fading).toBeUndefined()
  })
})

describe('rate-vs-model · ③ every figure the labs print is the run', () => {
  it('lab 1: the model’s fixed point and the alibi table, three columns, four rows', () => {
    const l = lab('近处的五台站点：预测与实测相差五倍')
    const note = (l.blocks!.find((b) => b.kind === 'formula') as { note: string }).note
    const [w, mm, att, n, tauP, pP, ts] = fig(note, /W = (\d+)，m = (\d+)，最多 (\d+) 次尝试）：n = (\d+) 时 τ = ([\d.]+)，p = ([\d.]+)%。[\s\S]*?54 Mb\/s 的 (\d+) µs/, 'the formula note')
    expect([val(w!), val(mm!), val(att!)]).toEqual([PARAMS.W, PARAMS.m, PARAMS.attempts])
    expect(val(n!)).toBe(rateVsModel.scenario().nodes.filter((x) => x.kind === 'sta').length)
    same(tauP!, tau(), 'τ')
    same(pP!, 100 * solveBianchi({ n: 5, ...PARAMS }).p, 'p')
    expect(val(ts!)).toBe(dcfTimes(1500, 54).dataNs / 1000)

    const t = tableOf(l, '同样的五台站点移到近处')
    expect(t.head).toEqual(['近处实测', '圆弧上', '预测'])
    const row = (k: string) => t.rows.find((r) => r[0]!.includes(k))!
    same(fig(row('碰撞')[0]!, /：([\d.]+) %/, 'near p')[0]!, 100 * near().p, 'near p')
    same(fig(row('碰撞')[1]!, /^([\d.]+) %$/, 'arc p')[0]!, 100 * arc5().p, 'arc p')
    same(fig(row('碰撞')[2]!, /^([\d.]+) %$/, 'model p')[0]!, 100 * solveBianchi({ n: 5, ...PARAMS }).p, 'model p')
    same(fig(row('吞吐')[0]!, /：([\d.]+) Mb\/s/, 'near S')[0]!, near().mbps, 'near S')
    same(fig(row('吞吐')[1]!, /^([\d.]+) Mb\/s$/, 'arc S')[0]!, arc5().mbps, 'arc S')
    same(fig(row('吞吐')[2]!, /^([\d.]+) Mb\/s$/, 'model S')[0]!, paperMbps(), 'model S')
    same(fig(row('平均帧长')[0]!, /：([\d.]+) µs/, 'near mean')[0]!, near().meanDataNs / 1000, 'near mean')
    same(fig(row('平均帧长')[1]!, /^([\d.]+) µs$/, 'arc mean')[0]!, arc5().meanDataNs / 1000, 'arc mean')
    same(fig(row('平均帧长')[2]!, /按假设 ([\d.]+) µs/, 'assumed')[0]!, dcfTimes(1500, 54).dataNs / 1000, 'assumed')
    const bottom = (s: Stats): number => shareOf(s, Math.min(...s.rateMix.keys()))
    same(fig(row('以最慢速率')[0]!, /：([\d.]+) %/, 'near floor share')[0]!, bottom(near()), 'near floor share')
    same(fig(row('以最慢速率')[1]!, /^([\d.]+) %$/, 'arc floor share')[0]!, bottom(arc5()), 'arc floor share')
    expect(row('以最慢速率')[2]).toContain('零')
    // the heading's 「五台」
    expect(cn(fig(t.heading!, /同样的(.)台站点/, 'heading')[0]!)).toBe(5)

    const [ep, pp, ap, es, ps] = fig(l.expect, /碰撞比例是 ([\d.]+)%，预测是 ([\d.]+)%，比圆弧上的 ([\d.]+)% 还接近；吞吐量却只有 ([\d.]+) Mb\/s，而模型给出 ([\d.]+) Mb\/s，相差(.)倍以上/, 'lab 1 expect')
    same(ep!, 100 * near().p, 'expect: near p')
    same(pp!, 100 * solveBianchi({ n: 5, ...PARAMS }).p, 'expect: model p')
    same(ap!, 100 * arc5().p, 'expect: arc p')
    same(es!, near().mbps, 'expect: near S')
    same(ps!, paperMbps(), 'expect: model S')
    expect(Math.abs(near().p - solveBianchi({ n: 5, ...PARAMS }).p)).toBeLessThan(Math.abs(arc5().p - solveBianchi({ n: 5, ...PARAMS }).p))
    const fold = /相差(.)倍以上/.exec(l.expect)![1]!
    expect(paperMbps() / near().mbps).toBeGreaterThan(cn(fold))
  })

  it('lab 2: the run opens on the ceiling and first drops at 7.661 ms; the arc has one rung', () => {
    const l = lab('色块的长度在变：速率在降档')
    const data = near().records.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.frame.kind === 'data')
    const top = Math.max(...near().rateMix.keys())
    const bot = Math.min(...near().rateMix.keys())
    expect(data.slice(0, 5).every((r) => r.frame.mbps === top)).toBe(true)
    const [opening] = fig(l.steps.join('\n'), /开头几帧都是 (\d+) µs，即 (\d+) Mb\/s/, 'lab 2 step 1').map(val)
    expect(opening).toBe(dcfTimes(1500, top).dataNs / 1000)
    expect(val(/即 (\d+) Mb\/s/.exec(l.steps[0]!)![1]!)).toBe(top)
    for (const us of fig(l.steps.join('\n'), /在 (\d+) µs、(\d+) µs、(\d+) µs 等长度/, 'lab 2 step 2').map(val)) {
      expect([...near().rateMix.keys()].some((m) => dcfTimes(1500, m).dataNs / 1000 === us), `${us} µs`).toBe(true)
    }
    const [ms, fast, slow, arcUs] = fig(l.expect, /([\d.]+) ms 处出现第一帧降档的帧[\s\S]*?最快一级 (\d+) µs，最慢一级 (\d+) µs。圆弧上每个色块都是 (\d+) µs/, 'lab 2 expect')
    same(ms!, data.find((r) => r.frame.mbps < top)!.t / 1e6, 'the first drop')
    expect(val(fast!)).toBe(dcfTimes(1500, top).dataNs / 1000)
    expect(val(slow!)).toBe(dcfTimes(1500, bot).dataNs / 1000)
    expect([...arc5().rateMix.keys()]).toEqual([6])
    expect(val(arcUs!)).toBe(arc5().meanDataNs / 1000)
  })

  it('lab 3: all 6,248 frames are in the histogram, row for row, and the SNR is 57.8 dB', () => {
    const l = lab('一张速率直方图')
    const t = tableOf(l, '这十秒内 6248 帧在各速率档位上的分布')
    expect(cn(fig(t.heading!, /这(.)秒内/, 'heading seconds')[0]!)).toBe(SECS)
    expect(val(fig(t.heading!, /秒内 (\d+) 帧/, 'heading frames')[0]!)).toBe(near().attempts)
    const rungs = [...near().rateMix.keys()].sort((a, b) => b - a)
    expect(t.rows.length).toBe(rungs.length)
    for (const [i, [rate, count, share, us]] of t.rows.entries()) {
      const mbps = val(fig(rate!, /^(\d+) Mb\/s/, `row ${i}`)[0]!)
      expect(mbps, `row ${i}`).toBe(rungs[i])
      expect(val(count!), `${mbps} count`).toBe(near().rateMix.get(mbps))
      same(fig(share!, /^([\d.]+) %$/, 'share')[0]!, shareOf(near(), mbps), `${mbps} share`)
      expect(val(fig(us!, /^(\d+) µs$/, 'us')[0]!), `${mbps} airtime`).toBe(dcfTimes(1500, mbps).dataNs / 1000)
    }
    expect(t.rows[0]![0]).toContain('上限')
    expect(rungs[0]).toBe(dataRateFor(level()))
    expect(t.rows.at(-1)![0]).toContain('最慢')
    const [snr, cap, topShare, over, under] = fig(l.expect, /信噪比（SNR）为 ([\d.]+) dB，足以支持 (\d+) Mb\/s，但只有 ([\d.]+)% 的帧使用了这一级；(.)分之(.)的帧降到了最慢的一级/, 'lab 3 expect')
    same(snr!, level() - noiseDbm(20), 'the SNR')
    expect(val(cap!)).toBe(rungs[0])
    same(topShare!, shareOf(near(), rungs[0]!), 'the ceiling’s share')
    expect(shareOf(near(), rungs.at(-1)!) / 100).toBeGreaterThanOrEqual(cn(under!) / cn(over!))
  })

  it('lab 4: the measured mean replaces the assumed one, and the model lands 0.24 % away', () => {
    const l = lab('换上实测的平均帧长，再算一次')
    const [ackUs, tauS] = fig(l.steps.join('\n'), /按 6 Mb\/s 发送的 (\d+) µs 确认帧[\s\S]*?τ 仍取 ([\d.]+)/, 'lab 4 steps')
    expect(val(ackUs!)).toBe(dcfTimes(1500, 6).ackNs / 1000)
    same(tauS!, tau(), 'the untouched τ')
    const t = tableOf(l, '只换一个输入')
    const air = t.rows.find((r) => r[0] === '数据帧的空口时间')!
    expect(val(fig(air[1]!, /^(\d+) µs$/, 'assumed')[0]!)).toBe(dcfTimes(1500, 54).dataNs / 1000)
    same(fig(air[2]!, /^([\d.]+) µs$/, 'measured')[0]!, near().meanDataNs / 1000, 'the measured mean')
    const pred = t.rows.find((r) => r[0] === '预测吞吐量')!
    same(fig(pred[1]!, /^([\d.]+) Mb\/s$/, 'paper')[0]!, paperMbps(), 'the paper figure')
    same(fig(pred[2]!, /^([\d.]+) Mb\/s$/, 'replaced')[0]!, replacedMbps(), 'the repriced figure')
    const gap = t.rows.find((r) => r[0]!.startsWith('与实测'))!
    same(fig(gap[0]!, /与实测 ([\d.]+) Mb\/s/, 'measured')[0]!, near().mbps, 'the measurement')
    expect(paperMbps() / near().mbps).toBeGreaterThan(cn(/(.)倍以上/.exec(gap[1]!)![1]!))
    const residual = 100 * Math.abs(replacedMbps() - near().mbps) / near().mbps
    same(fig(gap[2]!, /^([\d.]+) %$/, 'residual')[0]!, residual, 'the residual')

    const [mean, assumed, fold, rep, meas, res] = fig(l.expect, /平均帧长是 ([\d.]+) µs，约为模型假设的 (\d+) µs 的(.)倍；换上它，模型给出 ([\d.]+) Mb\/s，实测是 ([\d.]+)——相差 ([\d.]+)%/, 'lab 4 expect')
    same(mean!, near().meanDataNs / 1000, 'expect: mean')
    expect(val(assumed!)).toBe(dcfTimes(1500, 54).dataNs / 1000)
    expect(Math.round(near().meanDataNs / dcfTimes(1500, 54).dataNs)).toBe(cn(fold!))
    same(rep!, replacedMbps(), 'expect: repriced')
    same(meas!, near().mbps, 'expect: measured')
    same(res!, residual, 'expect: residual')
    same(fig(l.meaning, /剩下的 ([\d.]+)% 才是真正的残差/, 'lab 4 meaning')[0]!, residual, 'meaning: residual')
  })
})

describe('rate-vs-model · `why`, the quiz and `sources` print the same run', () => {
  it('`why`: 29.5 against 5.5, nine times the link rate, two thirds on the floor, seven times the frame', () => {
    const why = rateVsModel.why!
    const [paper, run] = fig(why, /吞吐量应为 ([\d.]+) Mb\/s。实测只有 ([\d.]+)/, '`why`')
    same(paper!, paperMbps(), '`why`: model')
    same(run!, near().mbps, '`why`: run')
    expect(54 / 6).toBe(cn(fig(why, /速率立即提高到(.)倍/, '`why` nine')[0]!))
    const [over, under] = fig(why, /(.)分之(.)的帧降到最慢的一级/, '`why` floor')
    expect(shareOf(near(), 6) / 100).toBeGreaterThanOrEqual(cn(under!) / cn(over!))
    expect(Math.round(near().meanDataNs / dcfTimes(1500, 54).dataNs)).toBe(cn(fig(why, /模型假设值的(.)倍/, '`why` seven')[0]!))
    // 「只相差千分之二左右」
    expect(Math.round(1000 * Math.abs(replacedMbps() - near().mbps) / near().mbps)).toBe(cn(fig(why, /千分之(.)左右/, '`why` residual')[0]!))
  })

  it('the quiz quotes the ceiling’s share, the mean, the repriced figure and the residual', () => {
    const qs = rateVsModel.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
    const [over, under] = fig(qs, /只交付了预测值的约(.)分之(.)/, 'quiz fraction')
    expect(near().mbps / paperMbps()).toBeCloseTo(cn(under!) / cn(over!), 1)
    same(fig(qs, /只有 ([\d.]+)% 的帧使用了链路支持的最高速率/, 'quiz share')[0]!, shareOf(near(), 54), 'quiz: ceiling share')
    same(fig(qs, /换成实测的 ([\d.]+) µs/, 'quiz mean')[0]!, near().meanDataNs / 1000, 'quiz: mean')
    same(fig(qs, /预测就落到 ([\d.]+) Mb\/s/, 'quiz repriced')[0]!, replacedMbps(), 'quiz: repriced')
    const residual = 100 * Math.abs(replacedMbps() - near().mbps) / near().mbps
    const rs = [...qs.matchAll(/还剩 ([\d.]+)% 的差距|([\d.]+)% 才是残差/g)].map((m) => m[1] ?? m[2]!)
    expect(rs.length).toBe(2)
    for (const r of rs) same(r, residual, 'quiz: residual')
  })

  it('`sources` names the scene: 15 dBm, seed 7, ten seconds', () => {
    const src = rateVsModel.sources!.join('\n')
    const [dbm, seed] = fig(src, /(\d+) dBm 的近处场景、种子 (\d+)/, '`sources` scene').map(val)
    const scen = rateVsModel.scenario()
    for (const st of scen.nodes.filter((x) => x.kind === 'sta')) expect(st.txPowerDbm).toBe(dbm)
    expect(scen.seed).toBe(seed)
    expect(cn(fig(src, /(.)秒采样窗口/, '`sources` window')[0]!)).toBe(SECS)
  })
})
