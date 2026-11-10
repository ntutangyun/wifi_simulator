/**
 * `@uwb-m2m`, in the standard-first shape. Rewritten 2026-11-11 (W3, audit #2): the engine now runs
 * the standard's many-to-many round (IEEE Std 802.15.4-2024 §10.32.6/§10.32.7) — a controller's RCM
 * with ARC Multi-node Mode 2 and an RDM IE, M initiators' ranging initiation messages, N responders'
 * responses, and in DS the initiators' final frames — so ② says 照标准 where it said 与标准不同, and
 * every row is checked against the engine here.
 *
 * Every figure the labs print is read back out of the lesson's own text and compared with a run.
 */
import { describe, expect, it } from 'vitest'
import {
  INITIATORS, INITIATOR_PLACES, RESPONDERS, RESPONDER_PLACES, TABLE_ROWS, initiatorId, responderId, uwbM2m, uwbM2mScenario,
} from '../../src/course/uwb/uwb-m2m'
import { Simulation } from '../../src/engine/simulation'
import { COURSE_ORDER, MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  C_M_PER_NS, UWB_MAX_PSDU_BYTES, rstuNs, uwbFinalBytes, uwbInitBytes, uwbM2mRcmBytes, uwbM2mRespBytes,
} from '../../src/uwb/phy'
import { m2mRoles } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** One block is 200 ms and holds one many-to-many round; 30 ms holds the DS round whole. */
const RUN_NS = 30 * MS

lessonShapeSuite(uwbM2m, { runNs: RUN_NS })

const run = (sc: Scenario): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

const base = runOf(uwbM2m, undefined, RUN_NS)
const dsRun = runOf(uwbM2m, 0, RUN_NS)
const respWalled = runOf(uwbM2m, 1, RUN_NS)
const ctrlWalled = runOf(uwbM2m, 2, RUN_NS)
const ranges = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE')
const air = (rs: TLRecord[]) => ofType(rs, 'TX_START')
const errsOf = (rs: TLRecord[]): number[] => ranges(rs).map((r) => Math.abs(r.distM - r.trueDistM))
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const ALL = [...Array.from({ length: INITIATORS }, (_, k) => initiatorId(k)), ...Array.from({ length: RESPONDERS }, (_, j) => responderId(j))]
const heldBy = (rs: TLRecord[], ids: string[]): number[] => ids.map((id) => ranges(rs).filter((r) => r.node === id).length)
/** Slots one run's exchange used: one frame a slot, read off the frames on the air in block 0. */
const busy = (rs: TLRecord[]): number => air(rs).filter((r) => r.frame.uwb?.block === 0).length

/** Each of the m initiators taking a turn as the tag of a one-to-many SS round over the same n anchors. */
function takingTurns(m: number, n: number): { slots: number; records: number } {
  const from = uwbM2mScenario('ss', 'none', m, n)
  let slots = 0
  let records = 0
  for (let k = 0; k < m; k++) {
    const nodes: NodeCfg[] = from.nodes.filter((x) => x.uwb!.role === 'anchor' || x.id === initiatorId(k))
    const rs = run({ ...from, nodes, uwb: { ...from.uwb!, mode: 'twr', method: 'ss', replyTime: 'embedded' } })
    expect(ofType(rs, 'UWB_ROUND').filter((r) => r.block === 0), `taking turns ${initiatorId(k)}`).toHaveLength(1)
    slots += busy(rs)
    records += ranges(rs).length
  }
  return { slots, records }
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
    expect(uwbM2m.title).toBe('多对多测距：M + N 帧测出 M × N 个距离')
  })

  it('① teaches the standard procedure, cites its clauses, and holds no simulator content', () => {
    for (const clause of ['§10.32.6', '§10.32.7', '§10.29.8.1', '§10.29.8.3', '§10.29.8.4', '§10.32.9.1', '§10.32.9.8', '§16.2.7.1']) {
      expect(STD, clause).toContain(clause)
    }
    expect(STD).toContain('M + N 帧')
    expect(STD).toContain('M × N 对')
    expect(STD).toContain('由响应方计算')
    expect(STD).toContain('2M + N 帧')
    for (const sim of ['本仿真器', '本课', 'TXT', 'RXT', '参与者']) expect(STD, sim).not.toContain(sim)
  })

  it('the scene: tags are the initiators, anchors the responders; no two of the eight distances alike', () => {
    const roles = m2mRoles(uwbM2m.scenario().nodes)
    expect(roles.initiators).toEqual(ALL.slice(0, INITIATORS))
    expect(roles.responders).toEqual(ALL.slice(INITIATORS))
    const d = new Set<number>()
    for (const t of INITIATOR_PLACES.slice(0, INITIATORS)) for (const a of RESPONDER_PLACES) d.add(Math.round(Math.hypot(t.x - a.x, t.y - a.y) * 1000))
    expect(d.size).toBe(INITIATORS * RESPONDERS)
  })
})

describe('uwb-m2m · ② says what the engine does, and the engine does it', () => {
  it('has rows of the honest kinds, and no row calls the engine a deviation any more', () => {
    const kinds = new Set(uwbM2m.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'value', 'choice', 'absent'] as const) expect(kinds.has(k), k).toBe(true)
    expect(kinds.has('differs')).toBe(false)
    for (const r of uwbM2m.implementation!) expect(r.sim, r.topic).not.toMatch(/待改正|TXT|RXT/)
  })

  it('控制消息: the controller\'s RCM in slot 0 with ARC Multi-node Mode 2, RR, RDM, RRMC', () => {
    const rcm = air(base)[0]
    expect(rcm.node).toBe(initiatorId(0))
    expect(rcm.frame.uwb!.slot).toBe(0)
    expect(rcm.frame.uwb!.ies).toEqual(['ARC', 'RR', 'RDM', 'RRMC'])
    expect(rcm.frame.uwb!.arc!.multiNode).toBe(2)
    const [bytes] = fig(implRow('控制消息').sim, /这一帧 (\d+) 字节/, '② on the RCM')
    expect(rcm.frame.bytes).toBe(Number(bytes))
    expect(Number(bytes)).toBe(uwbM2mRcmBytes(INITIATORS, RESPONDERS))
  })

  it('谁担任控制器 and 角色: the first tag by id controls; the RDM gives the others their roles', () => {
    const rdm = air(base)[0].frame.uwb!.rdm!
    expect(rdm.map((e) => [e.id, e.initiator])).toEqual([
      ...ALL.slice(1, INITIATORS).map((id) => [id, true]), ...ALL.slice(INITIATORS).map((id) => [id, false]),
    ])
  })

  it('时隙顺序: initiators, then responders, then (DS) the finals in initiation order', () => {
    expect(air(base).map((r) => r.node)).toEqual(ALL)
    expect(air(dsRun).map((r) => r.node)).toEqual([...ALL, ...ALL.slice(0, INITIATORS)])
    expect(air(dsRun).map((r) => r.frame.uwb!.slot)).toEqual(air(dsRun).map((_r, i) => i))
  })

  it('没收到控制消息的设备: a responder without the RCM neither transmits nor waits past slot 0', () => {
    expect(air(respWalled).some((r) => r.node === responderId(0))).toBe(false)
    expect(ofType(respWalled, 'UWB_TIMEOUT').filter((r) => r.node === responderId(0)).map((r) => r.slot)).toEqual([0])
  })

  it('启动消息, 单边形态的应答, 双边形态的应答与最终帧: the frames and their lengths', () => {
    const [init] = fig(implRow('启动消息').sim, /只带 RRMC，(\d+) 字节/, '② on the initiation')
    const tx = air(base)
    expect(tx[1].frame.kind).toBe('uwbInit')
    expect(tx[1].frame.uwb!.ies).toEqual(['RRMC'])
    expect(tx[1].frame.bytes).toBe(Number(init))
    expect(Number(init)).toBe(uwbInitBytes())
    const [resp] = fig(implRow('单边形态的应答').sim, /本课场景里 (\d+) 字节/, '② on the SS response')
    for (const r of tx.filter((x) => x.frame.kind === 'uwbResp')) {
      expect(r.frame.uwb!.ies).toEqual(['RRTI'])
      expect(r.frame.bytes).toBe(Number(resp))
    }
    expect(Number(resp)).toBe(uwbM2mRespBytes('ss', INITIATORS))
    const [dsResp, fin] = fig(implRow('双边形态的应答与最终帧').sim, /应答只带 RRMC，(\d+) 字节；最终帧.*本课场景里 (\d+) 字节/, '② on DS')
    for (const r of air(dsRun).filter((x) => x.frame.kind === 'uwbResp')) {
      expect(r.frame.uwb!.ies).toEqual(['RRMC'])
      expect(r.frame.bytes).toBe(Number(dsResp))
    }
    for (const r of air(dsRun).filter((x) => x.frame.kind === 'uwbFinal')) {
      expect(r.frame.uwb!.ies).toEqual(['RMI', 'RRTI'])
      expect(r.frame.bytes).toBe(Number(fin))
    }
    expect(Number(fin)).toBe(uwbFinalBytes(RESPONDERS))
  })

  it('一个 RRTI 还是多个: one RRTI IE lists every initiator, each element addressed', () => {
    for (const r of air(base).filter((x) => x.frame.kind === 'uwbResp')) {
      expect(r.frame.uwb!.ies.filter((ie) => ie === 'RRTI')).toHaveLength(1)
      expect(r.frame.uwb!.rrti!.map((e) => e.id)).toEqual(ALL.slice(0, INITIATORS))
    }
  })

  it('谁计算, 测距结果上报: initiators in SS, responders in DS, and no report frame', () => {
    expect(new Set(ranges(base).map((r) => r.node))).toEqual(new Set(ALL.slice(0, INITIATORS)))
    expect(new Set(ranges(dsRun).map((r) => r.node))).toEqual(new Set(ALL.slice(INITIATORS)))
    for (const rs of [base, dsRun]) expect(air(rs).filter((r) => r.frame.kind === 'uwbReport')).toEqual([])
  })

  it('竞争发送, SP3: refused by the editor; 定位: none solved', () => {
    const s = uwbM2m.scenario()
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, schedule: 'contention' } }).success).toBe(false)
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, sp3: true } }).success).toBe(false)
    expect(ofType(base, 'UWB_POSITION')).toEqual([])
  })

  it('一帧的长度上限: ① names the PSDU limit, and the editor refuses a group whose frame outgrows it', () => {
    const [psdu] = fig(STD, /PSDU 最多 (\d+) 字节/, '① on the PSDU')
    expect(Number(psdu)).toBe(UWB_MAX_PSDU_BYTES)
    const s = uwbM2m.scenario()
    const tag = s.nodes[0]
    let m = 1
    while (uwbM2mRespBytes('ss', m + 1) <= UWB_MAX_PSDU_BYTES) m++
    const crowd = (k: number): Scenario => ({
      ...s,
      nodes: [
        ...Array.from({ length: k }, (_v, i) => ({ ...tag, id: `t-${String(i).padStart(2, '0')}`, name: `T${i}`, pos: { x: 1 + (i % 18), y: 3 + Math.floor(i / 18), z: 1 } })),
        ...s.nodes.filter((x) => x.uwb!.role === 'anchor'),
      ],
      uwb: { ...s.uwb!, slotRstu: 6000, blockRstu: 600_000 },
    })
    expect(ScenarioSchema.safeParse(crowd(m)).success).toBe(true)
    expect(ScenarioSchema.safeParse(crowd(m + 1)).success).toBe(false)
  })

  it('时隙长度 and 单边测距的残余误差: 2 ms, 0.2 ppm, 0.06 m a slot, nothing else switched on', () => {
    const s = uwbM2m.scenario().uwb!
    const [slotMs] = fig(implRow('时隙长度').sim, /^(\d+) ms/, '② on the slot')
    expect(rstuNs(s.slotRstu)).toBe(Number(slotMs) * MS)
    const [ppm, perSlotMs, perSlotM] = fig(implRow('单边测距的残余误差').sim,
      /即 ([\d.]+) ppm：回复时延每长一个 (\d+) ms 的时隙，误差约多 ([\d.]+) m/, '② on the residual')
    expect(Number(ppm)).toBe(s.cfoNoisePpm)
    expect(Number(perSlotMs)).toBe(Number(slotMs))
    expect((rstuNs(s.slotRstu) * s.cfoNoisePpm * 1e-6 * C_M_PER_NS / 2).toFixed(2)).toBe(perSlotM)
    expect(s.tsNoisePs).toBe(0)
    expect(s.nlos).toBe(false)
  })
})

describe('uwb-m2m · ③ every figure the labs print is the run', () => {
  const kindName: Record<string, string> = { uwbPoll: '测距控制消息与启动消息', uwbInit: '启动消息', uwbResp: '应答' }

  it('lab 1: the six frames, their senders, lengths and IEs; the RDM; eight ranges', () => {
    const l = lab('六帧，八个距离')
    const rows = tableOf(l, '单边形态的一轮').rows
    const frames = air(base)
    expect(rows).toHaveLength(frames.length)
    rows.forEach(([slot, node, kind, bytes, ies], i) => {
      const f = frames[i]
      expect(Number(slot)).toBe(f.frame.uwb!.slot)
      expect(node).toBe(f.node)
      expect(kind).toBe(kindName[f.frame.kind])
      expect(Number(bytes)).toBe(f.frame.bytes)
      expect(ies).toBe(f.frame.uwb!.ies.join('、'))
    })
    const rdm = frames[0].frame.uwb!.rdm!
    const [listed, ini, iniSlot, r0, rN, s0, sN, per, total] = fig(l.expect,
      /RDM 列出 (\d+) 台设备，(t-\d) 是发起方、时隙 (\d+)，(a-\d) 到 (a-\d) 是响应方、时隙 (\d+) 到 (\d+)；每个应答的 RRTI 信息单元有 (\d+) 个元素.*得到 (\d+) 个距离/, 'lab 1 expect')
    expect(Number(listed)).toBe(rdm.length)
    const i1 = rdm.find((e) => e.initiator)!
    expect([ini, Number(iniSlot)]).toEqual([i1.id, i1.slot])
    const rsp = rdm.filter((e) => !e.initiator)
    expect([r0, rN, Number(s0), Number(sN)]).toEqual([rsp[0].id, rsp[rsp.length - 1].id, rsp[0].slot, rsp[rsp.length - 1].slot])
    expect(Number(per)).toBe(INITIATORS)
    expect(Number(total)).toBe(ranges(base).length)
    expect(Number(total)).toBe(INITIATORS * RESPONDERS)
  })

  it('lab 2: the first range lands with the first response, and the counts per device', () => {
    const l = lab('每一对由谁算出')
    const t = tableOf(l, '每台设备算出的距离（单边形态）')
    expect(t.head.slice(1)).toEqual(ALL)
    expect(t.rows[0].slice(1).map(Number)).toEqual(heldBy(base, ALL))
    const [ms, slot, resp, who, peer] = fig(l.expect, /第一条测距行出现在 ([\d.]+) ms，即时隙 (\d+) 里 (a-\d) 的应答接收完毕时，是 (t-\d) 算出的它到 (a-\d) 的距离/, 'lab 2 expect')
    const first = ranges(base)[0]
    expect((first.t / MS).toFixed(3)).toBe(ms)
    const firstResp = air(base).find((r) => r.frame.kind === 'uwbResp')!
    expect([firstResp.frame.uwb!.slot, firstResp.node]).toEqual([Number(slot), resp])
    expect([first.node, first.peer]).toEqual([who, peer])
    const [each] = fig(l.expect, /每个发起方 (\d+) 条/, 'lab 2 per initiator')
    for (const id of ALL.slice(0, INITIATORS)) expect(ranges(base).filter((r) => r.node === id)).toHaveLength(Number(each))
  })

  it('lab 3: taking turns against many-to-many, measured for each (M, N)', () => {
    const rows = tableOf(lab('与轮流担任标签相比'), '同一组设备，两种做法').rows
    expect(rows.map((r) => [Number(r[0]), Number(r[1])])).toEqual(TABLE_ROWS.map(([m, n]) => [m, n]))
    for (const [mCell, nCell, turnsCell, ssCell, dsCell, pairsCell] of rows) {
      const m = Number(mCell)
      const n = Number(nCell)
      const turns = takingTurns(m, n)
      const ss = run(uwbM2mScenario('ss', 'none', m, n))
      const ds = run(uwbM2mScenario('ds', 'none', m, n))
      expect(turnsCell).toBe(`${turns.slots} 个时隙`)
      expect(ssCell).toBe(`${busy(ss)} 个时隙`)
      expect(dsCell).toBe(`${busy(ds)} 个时隙`)
      expect(pairsCell).toBe(`${ranges(ss).length} 条`)
      // 「轮流担任标签要 M(N + 1) 个时隙，多对多单边只要 M + N 个」「测到的距离一样多」
      expect(turns.slots).toBe(m * (n + 1))
      expect(busy(ss)).toBe(m + n)
      expect(busy(ds)).toBe(2 * m + n)
      expect(turns.records).toBe(ranges(ss).length)
      expect(ranges(ds)).toHaveLength(m * n)
    }
  })

  it('lab 4: the DS frames, who holds the ranges, the errors and the worst pair', () => {
    const l = lab('双边形态：响应方算出距离')
    const rows = tableOf(l, '同样八对，两种形态').rows
    const byName: Record<string, TLRecord[]> = { 单边: base, 双边: dsRun }
    for (const [name, slots, max, avg] of rows) {
      const rs = byName[name]
      const errs = errsOf(rs)
      expect(Number(slots), name).toBe(busy(rs))
      const dp = (s: string) => (s.replace(' m', '').split('.')[1] ?? '').length
      expect(max, name).toBe(`${Math.max(...errs).toFixed(dp(max))} m`)
      expect(avg, name).toBe(`${mean(errs).toFixed(dp(avg))} m`)
    }
    const [respBytes, finBytes, perResp] = fig(l.expect, /应答只带 RRMC、(\d+) 字节，t-0 与 t-1 各发一帧 (\d+) 字节的最终帧；八条测距行都在响应方上，每个响应方 (\d+) 条/, 'lab 4 frames')
    for (const r of air(dsRun).filter((x) => x.frame.kind === 'uwbResp')) expect(r.frame.bytes).toBe(Number(respBytes))
    const finals = air(dsRun).filter((x) => x.frame.kind === 'uwbFinal')
    expect(finals.map((r) => r.node)).toEqual(ALL.slice(0, INITIATORS))
    for (const r of finals) expect(r.frame.bytes).toBe(Number(finBytes))
    expect(heldBy(dsRun, ALL.slice(INITIATORS))).toEqual(ALL.slice(INITIATORS).map(() => Number(perResp)))
    const [ssMax, dsMax, ratio] = fig(l.expect, /最大误差从 ([\d.]+) m 降到 ([\d.]+) m，约 (\d+) 倍/, 'lab 4 expect')
    expect(ssMax).toBe(Math.max(...errsOf(base)).toFixed(4))
    expect(dsMax).toBe(Math.max(...errsOf(dsRun)).toFixed(6))
    expect(Math.round(Math.max(...errsOf(base)) / Math.max(...errsOf(dsRun)))).toBe(Number(ratio))
    const [a, b] = fig(l.expect, /误差最大的一对是 (t-\d) 与 (a-\d)/, 'lab 4 worst pair')
    const worst = ranges(base).reduce((x, y) => (Math.abs(y.distM - y.trueDistM) > Math.abs(x.distM - x.trueDistM) ? y : x))
    expect([worst.node, worst.peer]).toEqual([a, b])
  })

  it('lab 5: the walled responder: frames, ranges, timeouts, and which pairs are lost', () => {
    const l = lab('一台响应方未被接收')
    const t = tableOf(l, '隔离 a-0 之后（单边形态）')
    const cell = (name: string) => t.rows.find((r) => r[0] === name)!
    expect(cell('一轮的帧数').slice(1).map(Number)).toEqual([busy(base), busy(respWalled)])
    expect(cell('距离条数').slice(1).map(Number)).toEqual([ranges(base).length, ranges(respWalled).length])
    const to = ofType(respWalled, 'UWB_TIMEOUT')
    expect(to.filter((r) => r.node === responderId(0)).map((r) => r.slot)).toEqual([0])
    const [slot] = fig(l.expect, /t-0 与 t-1 在时隙 (\d+) 各记一次超时/, 'lab 5 timeouts')
    for (const id of ALL.slice(0, INITIATORS)) {
      expect(to.filter((r) => r.node === id).map((r) => r.slot)).toEqual([Number(slot)])
    }
    const [left, lost] = fig(l.expect, /剩下 (\d+) 个距离，丢失的 (\d+) 个是 a-0 与两个发起方之间的/, 'lab 5 expect')
    expect(Number(left)).toBe(ranges(respWalled).length)
    expect(Number(lost)).toBe(ranges(base).length - ranges(respWalled).length)
    for (const r of ranges(respWalled)) expect(r.peer).not.toBe(responderId(0))
  })

  it('lab 6: the walled controller: one frame, five slot-0 timeouts, no range', () => {
    const l = lab('控制器未被接收')
    const t = tableOf(l, '隔离 t-0 之后（单边形态）')
    const cell = (name: string) => Number(t.rows.find((r) => r[0] === name)![1])
    expect(cell('一轮的帧数')).toBe(busy(ctrlWalled))
    expect(air(ctrlWalled).filter((r) => r.frame.uwb?.block === 0).map((r) => r.node)).toEqual([initiatorId(0)])
    const slot0 = ofType(ctrlWalled, 'UWB_TIMEOUT').filter((r) => r.slot === 0 && r.t < 200 * MS)
    expect(cell('时隙 0 的超时')).toBe(slot0.length)
    expect(new Set(slot0.map((r) => r.node))).toEqual(new Set(ALL.slice(1)))
    expect(cell('距离条数')).toBe(ranges(ctrlWalled).length)
    const [n] = fig(l.expect, /其余 (\d+) 台设备在时隙 0 各记一次超时/, 'lab 6 expect')
    expect(Number(n)).toBe(slot0.length)
  })
})
