/**
 * `@uwb-sp3`, in the standard-first shape (2026-11-10).
 *
 * ① teaches the SP3 packet, the time-scheduling rule, the three phases of §10.32.8.2 and the SRRR
 * IE's four request bits. ② says what this engine does — the faithful one-to-many SS shape, the
 * absent STS check / MLME-STS / RSSD, and the RAOA IE the standard does not define (W4) — and each
 * row is checked here against the engine.
 *
 * Every figure the labs print is read back out of the lesson's own text and compared with a run.
 * The ruler for a round's airtime is each `TX_START`'s own `frame.txTimeNs`, summed over block 0.
 * The A = 1…6 table is measured on a live round at every A; the crossover with RRTT on (A = 11) lies
 * beyond the six places the sweep has, so it is searched on the frame-size formula after that
 * formula has been required to equal the live round at all six.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, PLACES, SWEEP, TAG, TAG_ID, idOf, uwbSp3, uwbSp3Scenario, uwbSp3SweepScenario,
} from '../../src/course/uwb/uwb-sp3'
import { Simulation } from '../../src/engine/simulation'
import { COURSE_ORDER, MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  SRRR_IE_BYTES, UWB_IE_HDR_BYTES, UWB_PHR_CHIPS, UWB_SHR_CHIPS, RMI_AOA_AZIMUTH_BYTES,
  UWB_SS_DEFER_BYTES, UWB_STS_CHIPS, rstuNs, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSp3Chips,
  uwbSp3InitReportBytes, uwbSp3Ns, uwbSp3PollBytes, uwbSp3ReportBytes,
} from '../../src/uwb/phy'
import { roundPlan, slotAction } from '../../src/uwb/session'
import { lessonShapeSuite, ofType } from './kit'

const MS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS
/** A window that holds exactly block 0's one round. */
const ONE_ROUND_NS = 150 * MS

lessonShapeSuite(uwbSp3, { runNs: RUN_NS })

const run = (sc: Scenario): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(ONE_ROUND_NS).records]
}
type Tx = Extract<TLRecord, { type: 'TX_START' }>
const air = (rs: TLRecord[]): Tx[] => ofType(rs, 'TX_START')
  .filter((r) => (r.frame.uwb?.block ?? -1) === 0)
  .sort((a, b) => (a.frame.uwb?.slot ?? 0) - (b.frame.uwb?.slot ?? 0))
const roundNs = (rs: TLRecord[]): number => air(rs).reduce((n, r) => n + r.frame.txTimeNs, 0)
const us = (ns: number): string => (ns / 1000).toFixed(3).replace('-', '−')

const base = run(uwbSp3Scenario())
const deferred = run(uwbSp3.variants![0].scenario())
const embedded = run(uwbSp3.variants![1].scenario())
const both = run(uwbSp3.variants![2].scenario())

const lab = (heading: string): Lab => {
  const l = uwbSp3.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === kind && b.heading === heading)
  expect(t, `${kind} 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbSp3.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const fig = (text: string, re: RegExp, what: string): string[] => {
  const m = re.exec(text)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
const STD = uwbSp3.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** The round airtime on the engine's frame-size functions, checked below against live rounds. */
const marker = uwbSp3Ns()
const sp3Formula = (a: number, rrtt: boolean): number => uwbPpduNs(uwbSp3PollBytes(a)) + (a + 1) * marker
  + a * uwbPpduNs(uwbSp3ReportBytes(false)) + (rrtt ? uwbPpduNs(uwbSp3InitReportBytes(a)) : 0)
const deferredFormula = (a: number): number => uwbPpduNs(uwbPollBytes(a))
  + a * uwbPpduNs(uwbRespBytes('ss', 'deferred')) + a * uwbPpduNs(UWB_SS_DEFER_BYTES)
const crossover = (rrtt: boolean): number => {
  for (let a = 1; a <= 200; a++) if (sp3Formula(a, rrtt) <= deferredFormula(a)) return a
  throw new Error('no crossover')
}

describe('uwb-sp3 · the lesson', () => {
  it('is in the standard-first shape, in the SP3 module', () => {
    expect(isStandardFirst(uwbSp3)).toBe(true)
    expect(MODULES[uwbSp3.module].title).toBe('SP3 分组测距')
    expect(basisOf(uwbSp3.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbSp3.needs).toEqual(['uwb-reply-time', 'uwb-receipt'])
    expect(COURSE_ORDER.indexOf('uwb-sp3')).toBeGreaterThan(COURSE_ORDER.indexOf('uwb-receipt'))
    expect(uwbSp3.limits).toEqual([])
    expect(uwbSp3.observe).toEqual([])
    expect(uwbSp3.tryThis).toEqual([])
    expect(uwbSp3.sources!.join('\n')).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
  })

  it('① cites its clauses, names all four request bits, and holds no simulator content', () => {
    for (const c of ['§10.29.1.1', '§6.6.2', '§10.32.2', '§10.32.8.2', '§10.32.9.9', '§10.29.8.4', '§10.32.8.1', '图 10-242', '图 10-255']) {
      expect(STD, c).toContain(c)
    }
    expect(STD).toContain('RAOA、RRT、RRTT、RTOF 四个请求位')
    for (const sim of ['本仿真器', '本课']) expect(STD, sim).not.toContain(sim)
  })

  it('the scene: four anchors and a tag, no two distances to the tag alike, the residual off', () => {
    const sc = uwbSp3Scenario()
    expect(sc.nodes.map((n) => n.id)).toEqual([...Array.from({ length: ANCHORS }, (_v, i) => idOf(i)), TAG_ID])
    const ds = PLACES.map((p) => Math.hypot(p.x - TAG.x, p.y - TAG.y).toFixed(3))
    expect(new Set(ds).size).toBe(PLACES.length)
    expect(sc.uwb!.cfoNoisePpm).toBe(0)
    expect(sc.uwb!.nlos).toBe(false)
    expect(sc.uwb!.tsNoisePs).toBeGreaterThan(0)
  })
})

describe('uwb-sp3 · ② says what the engine does, and the engine does it', () => {
  // 2026-11-11 (W4): the RAOA row was the lesson's one "differs"; the bearing is now the RMI AOA Azimuth
  // field (standard §10.29.8.4), so the row is faithful and no row is "differs".
  it('has rows of the honest kinds, and the RAOA row is faithful', () => {
    const kinds = new Set(uwbSp3.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'choice', 'absent', 'value'] as const) expect(kinds.has(k), k).toBe(true)
    expect(kinds.has('differs')).toBe(false)
    expect(implRow('到达角的报告').kind).toBe('faithful')
    expect(implRow('到达角的报告').sim).not.toContain('RAOA 信息单元')
  })

  it('SP3 包的结构: the chips, no PHR, zero octets, no element', () => {
    const [chips, shr, sts, phr] = fig(implRow('SP3 包的结构').sim,
      /一个 SP3 包 ([\d ]+) 个码片（chip），即同步头 ([\d ]+) 加 STS ([\d ]+)，没有物理头的 ([\d ]+) 个码片/, '② on the packet')
      .map((x) => Number(x.replace(/ /g, '')))
    expect([chips, shr, sts, phr]).toEqual([uwbSp3Chips(), UWB_SHR_CHIPS, UWB_STS_CHIPS, UWB_PHR_CHIPS])
    expect(chips).toBe(shr! + sts!)
    for (const r of air(base).filter((x) => x.frame.kind === 'uwbSp3')) {
      expect(r.frame.bytes).toBe(0)
      expect(r.frame.uwb?.ies ?? []).toEqual([])
    }
  })

  it('只能按时间调度: contention refused; every marker filed under its slot\'s owner', () => {
    const s = uwbSp3Scenario()
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, schedule: 'contention' } }).success).toBe(false)
    const plan = roundPlan(s.uwb!, ANCHORS)
    const owner = (slot: number): string => {
      const a = slotAction(plan, slot)
      return 'tx' in a && a.tx === 'tag' ? TAG_ID : idOf((a as { anchor: number }).anchor)
    }
    const sp3 = ofType(base, 'UWB_SP3')
    expect(sp3.length).toBeGreaterThan(0)
    for (const r of sp3) expect(r.peer, `slot ${r.slot}`).toBe(owner(r.slot))
  })

  it('控制消息 and SRRR 的格式: 62 octets with four SRRR, 42 without; 5 octets each, rrt on, rtof off', () => {
    const [n, withSp3, without] = fig(implRow('控制消息').sim, /和 (\d+) 个 SRRR 信息单元，(\d+) 字节；不用 SP3 时同一条控制消息 (\d+) 字节/, '② on the RCM')
    const poll = air(base)[0]
    expect(poll.frame.kind).toBe('uwbPoll')
    expect(poll.frame.uwb?.ies).toEqual(['ARC', 'RR', 'RDM', 'RRMC', 'SRRR'])
    expect(poll.frame.bytes).toBe(Number(withSp3))
    expect(air(deferred)[0].frame.bytes).toBe(Number(without))
    expect(poll.frame.uwb?.srrr).toHaveLength(Number(n))
    for (const e of poll.frame.uwb!.srrr!) {
      expect(e.rrt).toBe(true)
      expect(e.rtof).toBe(false)
    }
    expect(poll.frame.uwb!.srrr!.map((e) => e.provider)).toEqual(Array.from({ length: ANCHORS }, (_v, i) => idOf(i)))
    const [size, hdr, ctl, addr] = fig(implRow('SRRR 的格式').sim, /共 (\d+) 字节（单元头 (\d+)、控制 (\d+)、短地址 (\d+)）/, '② on SRRR').map(Number)
    expect(size).toBe(SRRR_IE_BYTES)
    expect(hdr).toBe(UWB_IE_HDR_BYTES)
    expect(hdr! + ctl! + addr!).toBe(size)
    expect(Number(withSp3) - Number(without)).toBe(Number(n) * size!)
  })

  it('发起方的 SP3 包 and 回复时延的报告: slot 1 is the tag\'s marker; reports are 19 octets of RMI', () => {
    expect(implRow('发起方的 SP3 包').sim).toContain('第 1 个时隙')
    const m = air(base).find((r) => r.frame.kind === 'uwbSp3')!
    expect([m.node, m.frame.uwb?.slot]).toEqual([TAG_ID, 1])
    const [bytes] = fig(implRow('回复时延的报告').sim, /发一帧 (\d+) 字节的报告，带 RMI 信息单元/, '② on the report')
    const reports = air(base).filter((r) => r.frame.kind === 'uwbSsDefer')
    expect(reports).toHaveLength(ANCHORS)
    for (const r of reports) {
      expect(r.frame.bytes).toBe(Number(bytes))
      expect(r.frame.uwb?.ies).toEqual(['RMI'])
    }
  })

  // 2026-11-11 (W4): standard §10.29.8.4, Figure 10-213 — the bearing is the AOA Azimuth field (2 octets)
  // of the report's RMI List element, not an IE of its own.
  it('到达角的报告: the bearing travels in the RMI IE\'s 2-octet AOA Azimuth field', () => {
    expect(implRow('到达角的报告').kind).toBe('faithful')
    const [b] = fig(implRow('到达角的报告').sim, /AOA Azimuth 字段（(\d+) 字节）/, '② on the azimuth field')
    expect(Number(b)).toBe(RMI_AOA_AZIMUTH_BYTES)
    const rep = air(both).filter((r) => r.frame.kind === 'uwbSsDefer')
    for (const r of rep) {
      expect(r.frame.uwb?.ies).toEqual(['RMI'])
      expect(r.frame.uwb?.aoaThetaDeg).toBeDefined()
    }
    expect(uwbSp3ReportBytes(true) - uwbSp3ReportBytes(false)).toBe(Number(b))
  })

  it('没有报告阶段的 SP3 and 多发起方: refused by the editor', () => {
    const s = uwbSp3Scenario()
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, replyTime: 'embedded' } }).success).toBe(false)
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, mode: 'm2m' } }).success).toBe(false)
  })

  it('时隙与块: 2 ms and 200 ms', () => {
    const [slot, blk] = fig(implRow('时隙与块').sim, /每个时隙 (\d+) ms，每块 (\d+) ms/, '② on the grid')
    const plan = roundPlan(uwbSp3Scenario().uwb!, ANCHORS)
    expect(plan.slotNs).toBe(Number(slot) * MS)
    expect(rstuNs(uwbSp3Scenario().uwb!.slotRstu)).toBe(Number(slot) * MS)
    expect(plan.blockNs).toBe(Number(blk) * MS)
  })
})

describe('uwb-sp3 · ③ every figure the labs print is the run', () => {
  it('lab 1: the ten slots of block 0, and the first range', () => {
    const l = lab('一轮 SP3 的十个时隙')
    const rows = blockOf(l, 'table', '第 0 块的一轮').rows
    const tx = air(base)
    expect(rows).toHaveLength(tx.length)
    const kindName: Record<string, string> = { uwbPoll: '控制消息', uwbSp3: 'SP3 包', uwbSsDefer: '报告' }
    rows.forEach(([slot, node, kind, bytes, ies, t], i) => {
      const f = tx[i]
      expect(Number(slot)).toBe(f.frame.uwb?.slot)
      expect(node).toBe(f.node)
      expect(kind).toBe(kindName[f.frame.kind])
      expect(Number(bytes)).toBe(f.frame.bytes)
      expect(ies).toBe((f.frame.uwb?.ies ?? []).length ? f.frame.uwb!.ies!.join('、') : '—')
      expect(t).toBe(`${us(f.frame.txTimeNs)} µs`)
    })
    const [n, each, ms, who] = fig(l.expect, /控制消息之后是 (\d+) 个 0 字节的 SP3 包，每个 ([\d.]+) µs；第一条测距行在 ([\d.]+) ms 出现，是 (anc-\d) 的报告收到之后/, 'lab 1 expect')
    const markers = tx.filter((r) => r.frame.kind === 'uwbSp3')
    expect(markers).toHaveLength(Number(n))
    for (const m of markers) expect(us(m.frame.txTimeNs)).toBe(each)
    const first = ofType(base, 'UWB_RANGE')[0]
    expect((first.t / MS).toFixed(3)).toBe(ms)
    expect(first.peer).toBe(who)
    const lastMarkerEnd = Math.max(...markers.map((m) => m.t + m.frame.txTimeNs))
    expect(first.t).toBeGreaterThan(lastMarkerEnd)
  })

/** Slots a run's first round of exchange used: one frame a slot, read off the air. 2026-11-11 (W2b): the
 * `UWB_ROUND` record's own length now also counts the idle slots that stretch a round to a whole divisor
 * of the block (standard §10.32.2). */
const busy = (rs: TLRecord[]): number =>
  ofType(rs, 'TX_START').filter((r) => r.frame.uwb?.block === 0 && r.frame.uwb.round === 0).length

  it('lab 2: three round shapes, their slots and airtime, and the two differences', () => {
    const l = lab('SP3 与两种 SP1')
    const rows = blockOf(l, 'table', '同一个大厅、同样 4 个锚点').rows
    const runs: Record<string, TLRecord[]> = { 'SP1，回复时延嵌在帧里': embedded, 'SP1，回复时延延后': deferred, SP3: base }
    for (const [name, slots, t] of rows) {
      const rs = runs[name]
      expect(rs, name).toBeDefined()
      expect(Number(slots), name).toBe(busy(rs))
      expect(t, name).toBe(`${us(roundNs(rs))} µs`)
    }
    const [shorter, longer, n] = fig(l.expect, /SP3 比延后的 SP1 短 ([\d.]+) µs，比嵌在帧里的 SP1 长 ([\d.]+) µs；三种轮形都测得 (\d+) 条距离/, 'lab 2 expect')
    expect(us(roundNs(deferred) - roundNs(base))).toBe(shorter)
    expect(us(roundNs(base) - roundNs(embedded))).toBe(longer)
    for (const rs of [base, deferred, embedded]) expect(ofType(rs, 'UWB_RANGE').filter((r) => r.block === 0)).toHaveLength(Number(n))
    expect(Number(n)).toBe(ANCHORS)
  })

  it('lab 3: the A = 1…6 differences, each a live round, and the arithmetic of the crossover', () => {
    const l = lab('到第几个响应方才持平')
    const t = blockOf(l, 'table', '整轮空口时间之差（µs）')
    expect(t.head.slice(1).map(Number)).toEqual([...SWEEP])
    const vsDef = t.rows.find((r) => r[0] === 'SP3 − 延后的 SP1')!
    const vsEmb = t.rows.find((r) => r[0] === 'SP3 − 嵌在帧里的 SP1')!
    const gaps: number[] = []
    SWEEP.forEach((a, i) => {
      const sp3 = roundNs(run(uwbSp3SweepScenario(a, 'sp3')))
      const def = roundNs(run(uwbSp3SweepScenario(a, 'deferred')))
      const emb = roundNs(run(uwbSp3SweepScenario(a, 'embedded')))
      const rrtt = roundNs(run(uwbSp3SweepScenario(a, 'sp3-rrtt')))
      expect(vsDef[i + 1], `A = ${a}`).toBe(us(sp3 - def))
      expect(vsEmb[i + 1], `A = ${a}`).toBe(us(sp3 - emb))
      gaps.push(sp3 - def)
      // the formula the RRTT crossover is searched on equals the live round at every A
      expect(sp3Formula(a, false), `A = ${a}`).toBe(sp3)
      expect(sp3Formula(a, true), `A = ${a}`).toBe(rrtt)
      expect(deferredFormula(a), `A = ${a}`).toBe(def)
    })
    const [from] = fig(l.expect, /差值从 A = (\d+) 起变为负/, 'lab 3 expect')
    expect(gaps.findIndex((g) => g < 0) + 1).toBe(Number(from))
    expect(gaps.slice(Number(from) - 1).every((g) => g < 0)).toBe(true)
    const emb = vsEmb.slice(1).map(Number)
    for (let i = 1; i < emb.length; i++) expect(emb[i]).toBeGreaterThan(emb[i - 1]!)
    expect(crossover(false)).toBe(Number(from))
    // the formula: 42.051 − 5.128 = 36.923 µs；140.962 ÷ 36.923 = 3.82
    const f = blockOf(l, 'formula', '每个响应方的净节省，与发起方多出的那个 SP3 包')
    const [save, srrr, net, mk, net2, ratio] = fig(f.text, /([\d.]+) − ([\d.]+) = ([\d.]+) µs；([\d.]+) ÷ ([\d.]+) = ([\d.]+)/, 'the formula')
    const one = run(uwbSp3SweepScenario(1, 'sp3'))
    const oneDef = run(uwbSp3SweepScenario(1, 'deferred'))
    const markerNs = air(one).find((r) => r.frame.kind === 'uwbSp3')!.frame.txTimeNs
    const respNs = air(oneDef).find((r) => r.frame.kind === 'uwbResp')!.frame.txTimeNs
    const srrrNs = air(one)[0].frame.txTimeNs - air(oneDef)[0].frame.txTimeNs
    expect(save).toBe(us(respNs - markerNs))
    expect(srrr).toBe(us(srrrNs))
    expect(net).toBe(us(respNs - markerNs - srrrNs))
    expect(net2).toBe(net)
    expect(mk).toBe(us(markerNs))
    expect(ratio).toBe((markerNs / (respNs - markerNs - srrrNs)).toFixed(2))
    expect(Math.ceil(Number(ratio))).toBe(Number(from))
    const [respBytes] = fig(f.note!, /延后 SP1 的 (\d+) 字节应答/, 'the note')
    expect(air(oneDef).find((r) => r.frame.kind === 'uwbResp')!.frame.bytes).toBe(Number(respBytes))
    for (const x of [save, srrr, mk]) expect(f.note, x).toContain(`${x} µs`)
  })

  it('lab 4: both request bits on — one more slot, longer responder reports, the RRTT crossover', () => {
    const l = lab('两个请求位都打开')
    const rows = blockOf(l, 'table', '报告阶段的两种帧').rows
    const initRep = air(both).find((r) => r.frame.kind === 'uwbReport' && r.node === TAG_ID)!
    const respRep = air(both).filter((r) => r.frame.kind === 'uwbSsDefer')
    const [, ib, iies] = rows.find((r) => r[0] === '发起方的报告')!
    expect(Number(ib)).toBe(initRep.frame.bytes)
    expect(iies).toBe(initRep.frame.uwb!.ies!.join('、'))
    const [, rb, ries] = rows.find((r) => r[0] === '响应方的报告')!
    for (const r of respRep) {
      expect(Number(rb)).toBe(r.frame.bytes)
      expect(ries).toBe(r.frame.uwb!.ies!.join('、'))
    }
    const [s0, s1, r0, r1, total, cross] = fig(l.expect,
      /时隙从 (\d+) 个变成 (\d+) 个，多出的是发起方的报告；每个响应方的报告从 (\d+) 字节变成 (\d+) 字节，多了 RMI 信息单元里的方位角字段；整轮 ([\d.]+) µs。只请求往返时间时，交叉点后移到 A = (\d+)/,
      'lab 4 expect')
    expect(Number(s0)).toBe(busy(base))
    expect(Number(s1)).toBe(busy(both))
    expect(Number(r0)).toBe(air(base).find((r) => r.frame.kind === 'uwbSsDefer')!.frame.bytes)
    expect(Number(r1)).toBe(Number(rb))
    expect(us(roundNs(both))).toBe(total)
    expect(crossover(true)).toBe(Number(cross))
  })

  it('the jump label prints the run\'s own figure', () => {
    const [b] = fig(uwbSp3.jumps[0].label, /(\d+) 字节/, 'jump label')
    expect(air(base).find((r) => r.frame.kind === 'uwbSp3')!.frame.bytes).toBe(Number(b))
  })

  it('sources prints the chip count the engine uses', () => {
    const [c] = fig(uwbSp3.sources!.join('\n'), /SP3 包 ([\d ]+) 个码片/, 'sources on the chips')
    expect(Number(c.replace(/ /g, ''))).toBe(uwbSp3Chips())
  })
})
