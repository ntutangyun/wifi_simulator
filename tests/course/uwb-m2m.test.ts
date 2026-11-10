/**
 * `@uwb-m2m`, in the standard-first shape (2026-11-10).
 *
 * ① teaches the standard's many-to-many procedure (§10.32.6/§10.32.7: separate initiator and
 * responder roles, RRTI IEs in the responses, M + N frames for M × N pairs). ② says the engine
 * differs — no control message, every device both roles, the invented TXT/RXT IEs — and this file
 * checks each ② row against what the engine really does, so the day W3 brings the engine to the
 * standard, the rows that call it a deviation turn red here and have to be rewritten.
 *
 * Every figure the labs print is read back out of the lesson's own text and compared with a run:
 * editing a number without the engine agreeing turns this red, and so does an engine change that
 * moves a number the lesson still prints.
 */
import { describe, expect, it } from 'vitest'
import {
  PARTICIPANTS, PLACES, TABLE_NS, WALLED_PARTICIPANTS, idOf, pairsOf, uwbM2m, uwbM2mScenario,
} from '../../src/course/uwb/uwb-m2m'
import { Simulation } from '../../src/engine/simulation'
import { COURSE_ORDER, MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  C_M_PER_NS, RRMC_IE_BYTES, TX_TIME_IE_BYTES, UWB_FCS_BYTES, UWB_MAX_PSDU_BYTES, UWB_MHR_BYTES,
  rstuNs, rxTimesIeBytes, uwbM2mBytes, uwbMaxParticipants,
} from '../../src/uwb/phy'
import { m2mParticipants } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** One block is 200 ms and holds one many-to-many round; 30 ms holds the DS round (24 ms) whole. */
const RUN_NS = 30 * MS

lessonShapeSuite(uwbM2m, { runNs: RUN_NS })

const run = (sc: Scenario): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}
const pairKey = (a: string, b: string): string => [a, b].sort().join('~')

const base = runOf(uwbM2m, undefined, RUN_NS)
const dsRun = runOf(uwbM2m, 0, RUN_NS)
const walledRun = runOf(uwbM2m, 1, RUN_NS)
const ranges = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE')
const air = (rs: TLRecord[]) => ofType(rs, 'TX_START')
const errsOf = (rs: TLRecord[]): number[] => ranges(rs).map((r) => Math.abs(r.distM - r.trueDistM))
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const heldBy = (rs: TLRecord[], ids: string[]): number[] =>
  ids.map((id) => ranges(rs).filter((r) => r.node === id).length)

/** Each device taking a turn as the tag while the rest answer as anchors, summed over all N rounds. */
function takingTurns(n: number): { slots: number; records: number; pairs: Set<string> } {
  const from = uwbM2mScenario('ss', n)
  let slots = 0
  let records = 0
  const pairs = new Set<string>()
  for (let k = 0; k < n; k++) {
    const nodes: NodeCfg[] = from.nodes.map((node, i) => ({
      ...node, uwb: { ...node.uwb!, role: i === k ? 'tag' : 'anchor' },
    }))
    const rs = run({ ...from, nodes, uwb: { ...from.uwb!, mode: 'twr', method: 'ss', replyTime: 'embedded' } })
    const rounds = ofType(rs, 'UWB_ROUND')
    expect(rounds, `taking turns N=${n}, ${idOf(k)}'s turn`).toHaveLength(1)
    slots += rounds[0].slots
    for (const r of ranges(rs)) {
      records += 1
      pairs.add(pairKey(r.node, r.peer))
    }
  }
  return { slots, records, pairs }
}

const lab = (heading: string): Lab => {
  const l = uwbM2m.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbM2m.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const fig = (text: string, re: RegExp, what: string): string[] => {
  const m = re.exec(text)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
const STD = uwbM2m.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-m2m · the lesson', () => {
  it('is in the standard-first shape, in the many-to-many module, after the contention lesson', () => {
    expect(isStandardFirst(uwbM2m)).toBe(true)
    expect(MODULES[uwbM2m.module].title).toBe('多对多测距')
    expect(basisOf(uwbM2m.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbM2m.needs).toEqual(['uwb-sstwr', 'uwb-dstwr'])
    expect(COURSE_ORDER.indexOf('uwb-m2m')).toBe(COURSE_ORDER.indexOf('uwb-contention') + 1)
    expect(uwbM2m.limits).toEqual([])
    expect(uwbM2m.observe).toEqual([])
    expect(uwbM2m.tryThis).toEqual([])
    expect(uwbM2m.sources!.join('\n')).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
  })

  it('① teaches the standard procedure, cites its clauses, and holds no simulator content', () => {
    for (const clause of ['§10.32.6', '§10.32.7', '§10.29.8.1', '§10.29.8.3', '§10.29.8.4', '§10.32.9.1', '§10.32.9.8', '§16.2.7.1']) {
      expect(STD, clause).toContain(clause)
    }
    expect(STD).toContain('M + N 帧')
    expect(STD).toContain('M × N 对')
    expect(STD).toContain('由响应方计算')
    for (const sim of ['本仿真器', 'TXT', 'RXT', '参与者', '设备编号']) expect(STD, sim).not.toContain(sim)
  })

  it('the scene: six devices at six places, no two pairwise distances alike', () => {
    const sc = uwbM2m.scenario()
    expect(sc.nodes.map((n) => n.id)).toEqual(PLACES.map((_p, i) => idOf(i)))
    const d = (i: number, j: number) => Math.hypot(PLACES[i].x - PLACES[j].x, PLACES[i].y - PLACES[j].y)
    const all: number[] = []
    for (let i = 0; i < PARTICIPANTS; i++) for (let j = i + 1; j < PARTICIPANTS; j++) all.push(Math.round(d(i, j) * 1000))
    expect(new Set(all).size).toBe(pairsOf(PARTICIPANTS))
  })
})

describe('uwb-m2m · ② says what the engine does, and the engine does it', () => {
  it('has rows of every honest kind, and the deviations say they are deviations', () => {
    const kinds = new Set(uwbM2m.implementation!.map((r) => r.kind))
    for (const k of ['differs', 'value', 'choice', 'absent', 'faithful'] as const) expect(kinds.has(k), k).toBe(true)
    expect(implRow('控制消息').sim).toContain('待改正')
    expect(implRow('帧里的信息单元').sim).toContain('标准里没有的 TXT 与 RXT')
  })

  it('控制消息: no control message, every UWB device takes part, nobody joins or leaves', () => {
    expect(implRow('控制消息').kind).toBe('differs')
    expect(implRow('控制消息').sim).toContain('没有任何设备能中途加入或退出')
    const kinds = new Set(air(base).map((r) => r.frame.kind))
    expect([...kinds]).toEqual(['uwbM2m'])
    const sc = uwbM2m.scenario()
    expect(m2mParticipants(sc.nodes)).toEqual(sc.nodes.map((n) => n.id))
  })

  it('角色 and 帧里的信息单元: every device sends one frame, RRMC + TXT (+ RXT), never RRTI', () => {
    expect(air(base).map((r) => r.node)).toEqual(PLACES.map((_p, i) => idOf(i)))
    for (const r of air(base)) {
      expect(r.frame.uwb?.ies?.slice(0, 2)).toEqual(['RRMC', 'TXT'])
      expect(r.frame.uwb?.ies).not.toContain('RRTI')
    }
    // and every device both asks (its frame is heard by later ones) and answers (it carries arrivals)
    expect(air(base).filter((r) => r.frame.uwb?.ies?.includes('RXT')).length).toBe(PARTICIPANTS - 1)
  })

  it('帧数与距离数 and 谁计算: N frames for N(N−1)/2 pairs (2N under DS), the earlier device computes', () => {
    expect(air(base)).toHaveLength(PARTICIPANTS)
    expect(air(dsRun)).toHaveLength(2 * PARTICIPANTS)
    for (const rs of [base, dsRun]) {
      expect(ranges(rs)).toHaveLength(pairsOf(PARTICIPANTS))
      for (const r of ranges(rs)) expect(r.node < r.peer, `${r.node}→${r.peer}`).toBe(true)
    }
  })

  it('一帧的长度上限: the PSDU limit, the cap it gives, and the editor refusing one more', () => {
    const [psdu] = fig(STD, /PSDU 最多 (\d+) 字节/, '① on the PSDU')
    expect(Number(psdu)).toBe(UWB_MAX_PSDU_BYTES)
    const [cap, cap2, fits, over, overBytes] = fig(implRow('一帧的长度上限').sim,
      /一轮最多 (\d+) 台：(\d+) 台时最后一帧 (\d+) 字节，(\d+) 台时 (\d+) 字节/, '② on the cap')
    expect(Number(cap)).toBe(uwbMaxParticipants('ss'))
    expect(uwbMaxParticipants('ds')).toBe(Number(cap))
    expect(Number(cap2)).toBe(Number(cap))
    expect(Number(over)).toBe(Number(cap) + 1)
    expect(Number(fits)).toBe(uwbM2mBytes(Number(cap) - 1))
    expect(Number(overBytes)).toBe(uwbM2mBytes(Number(cap)))
    expect(Number(fits)).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(Number(overBytes)).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    const crowd = uwbM2mScenario('ss')
    const res = ScenarioSchema.safeParse({
      ...crowd,
      nodes: Array.from({ length: Number(cap) + 1 }, (_v, i) => ({
        ...crowd.nodes[0], id: `q-${String(i).padStart(2, '0')}`, name: `Q${i}`,
        pos: { x: 1 + (i % 14), y: 1 + Math.floor(i / 14), z: 1 },
      })),
    })
    expect(res.success).toBe(false)
  })

  it('字段宽度: the five widths are the engine\'s', () => {
    const [mhr, rrmc, txt, rxtHdr, perRx, fcs] = fig(implRow('字段宽度').sim,
      /帧头（MAC header）(\d+) 字节、RRMC (\d+) 字节、TXT (\d+) 字节、RXT 的单元头 (\d+) 字节加每个到达时刻 (\d+) 字节、帧校验 (\d+) 字节/,
      '② on the widths').map(Number)
    expect([mhr, rrmc, txt, fcs]).toEqual([UWB_MHR_BYTES, RRMC_IE_BYTES, TX_TIME_IE_BYTES, UWB_FCS_BYTES])
    expect(rxTimesIeBytes(1) - perRx!).toBe(rxtHdr)
    expect(rxTimesIeBytes(2) - rxTimesIeBytes(1)).toBe(perRx)
    expect(uwbM2mBytes(0)).toBe(mhr! + rrmc! + txt! + fcs!)
    // sources lists the same widths
    expect(uwbM2m.sources!.join('\n')).toContain(`帧头 ${mhr} 字节、RRMC ${rrmc} 字节、TXT ${txt} 字节、到达时刻每个 ${perRx} 字节、帧校验 ${fcs} 字节`)
  })

  it('时隙长度 and 单边测距的残余误差: 2 ms, 0.2 ppm, 0.06 m a slot, nothing else switched on', () => {
    const s = uwbM2m.scenario().uwb!
    const [slotMs] = fig(implRow('时隙长度').sim, /^(\d+) ms/, '② on the slot')
    expect(rstuNs(s.slotRstu)).toBe(Number(slotMs) * MS)
    const [ppm, perSlotMs, perSlotM] = fig(implRow('单边测距的残余误差').sim,
      /即 ([\d.]+) ppm：回复间隔每多一个 (\d+) ms 的时隙，误差约多 ([\d.]+) m/, '② on the residual')
    expect(Number(ppm)).toBe(s.cfoNoisePpm)
    expect(Number(perSlotMs)).toBe(Number(slotMs))
    expect((rstuNs(s.slotRstu) * s.cfoNoisePpm * 1e-6 * C_M_PER_NS / 2).toFixed(2)).toBe(perSlotM)
    expect(s.tsNoisePs).toBe(0)
    expect(s.nlos).toBe(false)
  })

  it('SP3 is refused in this mode, and no position is solved', () => {
    const s = uwbM2m.scenario()
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, sp3: true, replyTime: 'deferred' } }).success).toBe(false)
    expect(ofType(base, 'UWB_POSITION')).toEqual([])
  })
})

describe('uwb-m2m · ③ every figure the labs print is the run', () => {
  it('lab 1: the six frames, their senders, lengths, elements and arrival counts', () => {
    const l = lab('六台设备，六帧')
    const rows = tableOf(l, '一轮六帧，没有控制消息').rows
    const frames = air(base)
    expect(rows).toHaveLength(frames.length)
    rows.forEach(([slot, node, bytes, ies, arrivals], i) => {
      const f = frames[i]
      expect(Number(slot)).toBe(f.frame.uwb?.slot)
      expect(node).toBe(f.node)
      expect(Number(bytes)).toBe(f.frame.bytes)
      expect(ies).toBe(f.frame.uwb!.ies!.join('、'))
      expect(arrivals).toBe(`${Object.keys(f.frame.uwb!.m2m!.rxCounters).length} 个`)
    })
    const [lo, hi, step] = fig(l.expect, /字节数从 (\d+) 增加到 (\d+)，第一帧不带 RXT，从第三帧起每多一个到达时刻多 (\d+) 字节/, 'lab 1 expect')
    expect(Number(lo)).toBe(frames[0].frame.bytes)
    expect(Number(hi)).toBe(frames[frames.length - 1].frame.bytes)
    expect(frames[0].frame.uwb?.ies).not.toContain('RXT')
    for (let k = 2; k < frames.length; k++) expect(frames[k].frame.bytes - frames[k - 1].frame.bytes).toBe(Number(step))
  })

  it('lab 2: the first range lands with the second frame, and the counts per device', () => {
    const l = lab('每一对由谁算出')
    const ids = m2mParticipants(uwbM2m.scenario().nodes)
    const held = heldBy(base, ids)
    const t = tableOf(l, '每台设备算出的距离')
    expect(t.head.slice(1)).toEqual(ids)
    expect(t.rows[0].slice(1).map(Number)).toEqual(held)
    const [ms, who, peer] = fig(l.expect, /第一条测距行出现在 ([\d.]+) ms，即第二帧接收完毕时，是 (p-\d) 算出的它到 (p-\d) 的距离/, 'lab 2 expect')
    const first = ranges(base)[0]
    expect((first.t / MS).toFixed(3)).toBe(ms)
    expect((ofType(base, 'TX_END')[1].t / MS).toFixed(3)).toBe(ms)
    expect([first.node, first.peer]).toEqual([who, peer])
    const seq = fig(l.expect, /分别是 (\d)、(\d)、(\d)、(\d)、(\d)、(\d) 条/, 'lab 2 sequence').map(Number)
    expect(seq).toEqual(held)
    const [last] = fig(l.expect, /排在最后的 (p-\d) 一条也没有/, 'lab 2 last')
    expect(last).toBe(ids[ids.length - 1])
    expect(held[held.length - 1]).toBe(0)
  })

  it('lab 3: taking turns against this engine\'s many-to-many, measured for N = 3, 4, 6', () => {
    const rows = tableOf(lab('与轮流担任标签相比'), '同一组设备，两种做法').rows
    expect(rows.map((r) => Number(r[0]))).toEqual([...TABLE_NS])
    for (const [nCell, turnsCell, ssCell, dsCell, pairsCell] of rows) {
      const n = Number(nCell)
      const turns = takingTurns(n)
      const ss = run(uwbM2mScenario('ss', n))
      const ds = run(uwbM2mScenario('ds', n))
      expect(turnsCell).toBe(`${turns.slots} 个时隙、${turns.records} 条`)
      expect(ssCell).toBe(`${ofType(ss, 'UWB_ROUND')[0].slots} 个时隙`)
      expect(dsCell).toBe(`${ofType(ds, 'UWB_ROUND')[0].slots} 个时隙`)
      expect(pairsCell).toBe(`${ranges(ss).length} 条`)
      expect(new Set(ranges(ss).map((r) => pairKey(r.node, r.peer))).size).toBe(ranges(ss).length)
      // 「恰好是 N 倍，而且每一对测了两遍」
      expect(turns.slots / ofType(ss, 'UWB_ROUND')[0].slots).toBe(n)
      expect(turns.records).toBe(2 * turns.pairs.size)
      expect(turns.pairs.size).toBe(ranges(ss).length)
    }
  })

  it('lab 4: the two methods\' errors, the ratio, the worst pair, and the second pass\'s frames', () => {
    const l = lab('双边形态：两趟')
    const rows = tableOf(l, '同样十五对，两种形态').rows
    const byName: Record<string, TLRecord[]> = { 单边: base, 双边: dsRun }
    for (const [name, slots, max, avg] of rows) {
      const rs = byName[name]
      const errs = errsOf(rs)
      expect(Number(slots), name).toBe(ofType(rs, 'UWB_ROUND')[0].slots)
      const dp = (s: string) => (s.replace(' m', '').split('.')[1] ?? '').length
      expect(max, name).toBe(`${Math.max(...errs).toFixed(dp(max))} m`)
      expect(avg, name).toBe(`${mean(errs).toFixed(dp(avg))} m`)
    }
    const [ssMax, dsMax, ratio] = fig(l.expect, /最大误差从 ([\d.]+) m 降到 ([\d.]+) m，约 (\d+) 倍/, 'lab 4 expect')
    expect(ssMax).toBe(Math.max(...errsOf(base)).toFixed(4))
    expect(dsMax).toBe(Math.max(...errsOf(dsRun)).toFixed(6))
    expect(Math.round(Math.max(...errsOf(base)) / Math.max(...errsOf(dsRun)))).toBe(Number(ratio))
    const [apart, a, b] = fig(l.expect, /相隔 (\d+) 个时隙的 (p-\d) 与 (p-\d)/, 'lab 4 worst pair')
    const worst = ranges(base).reduce((x, y) => (Math.abs(y.distM - y.trueDistM) > Math.abs(x.distM - x.trueDistM) ? y : x))
    expect([worst.node, worst.peer]).toEqual([a, b])
    expect(Number(worst.peer.slice(2)) - Number(worst.node.slice(2))).toBe(Number(apart))
    // 「每台设备发两次，第二趟的帧与第一趟一样长」
    const bytes = air(dsRun).map((r) => r.frame.bytes)
    expect(bytes.slice(PARTICIPANTS)).toEqual(bytes.slice(0, PARTICIPANTS))
  })

  it('lab 5: the walled round keeps three pairs, and p-1\'s frame is shorter', () => {
    const l = lab('一台设备未被接收')
    const ids = m2mParticipants(uwbM2m.variants![1].scenario().nodes)
    expect(ids).toHaveLength(WALLED_PARTICIPANTS)
    const t = tableOf(l, '隔离 p-0 之后')
    expect(t.head.slice(1)).toEqual(ids)
    expect(t.rows[0].slice(1).map(Number)).toEqual(heldBy(walledRun, ids))
    expect(t.rows[1].slice(1).map(Number)).toEqual(air(walledRun).map((r) => r.frame.bytes))
    const open = run(uwbM2mScenario('ss', WALLED_PARTICIPANTS))
    const [should, left, lost] = fig(l.expect, /本应测得 (\d+) 对，隔离 p-0 之后只剩 (\d+) 对，丢失的 (\d+) 对全是 p-0/, 'lab 5 expect')
    expect(Number(should)).toBe(ranges(open).length)
    expect(Number(left)).toBe(ranges(walledRun).length)
    expect(Number(lost)).toBe(ranges(open).length - ranges(walledRun).length)
    for (const r of ranges(walledRun)) expect([r.node, r.peer]).not.toContain(idOf(0))
    const [was, now] = fig(l.expect, /p-1 的帧从 (\d+) 字节变成 (\d+) 字节/, 'lab 5 p-1')
    expect(Number(was)).toBe(air(open).find((r) => r.node === idOf(1))!.frame.bytes)
    expect(Number(now)).toBe(air(walledRun).find((r) => r.node === idOf(1))!.frame.bytes)
  })
})
