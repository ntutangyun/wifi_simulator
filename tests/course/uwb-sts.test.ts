/**
 * `@uwb-sts`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites; ② row by row against the engine — above all the
 * honest half of it: the engine holds no seed and correlates nothing, and with no attacker in
 * the scene it runs no check at all; ③ figure by figure: every number the labs print is read
 * back out of the lesson text and compared with a run.
 */
import { describe, it, expect } from 'vitest'
import { uwbSts, uwbStsScenario, uwbStsSequence, HONEST_20_M, SPOOFED_M, RELAY_ADVANCE_NS } from '../../src/course/uwb/uwb-sts'
import { uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { C_M_PER_NS, RCTU_NS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, UWB_STS_CHIPS } from '../../src/uwb/phy'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
import { fmtRecord } from '../../src/ui/format'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
const V_OFF = 0
const V_ON = 1
const V_HONEST_20 = 2

const recs = (variant?: number): TLRecord[] => runOf(uwbSts, variant, RUN_NS)

lessonShapeSuite(uwbSts, { runNs: RUN_NS })

const lab = (heading: string): Lab => {
  const l = uwbSts.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbSts.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const num = (s: string): number => Number(s.replace(/ /g, ''))
const rxCounters = (rs: TLRecord[]) => ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx').map((r) => r.counter)

describe('uwb-sts · the lesson', () => {
  it('follows uwb-frame, in the standard-first shape', () => {
    expect(isStandardFirst(uwbSts)).toBe(true)
    expect(MODULES[uwbSts.module].title).toBe('飞行时间')
    expect(uwbSts.needs).toEqual(['uwb-frame'])
    expect(uwbSts.terms!.map((t) => t.term)).toEqual(['relay attack', 'key', 'STS'])
    expect(uwbSts.limits).toEqual([])
    expect(uwbSts.observe).toEqual([])
    expect(uwbSts.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and ① says nothing of the simulator', () => {
    const std = JSON.stringify(uwbSts.standard)
    for (const c of ['§16.2.9.1', '§16.2.9.2', '§16.2.9.3', '表 16-17', '表 16-1', '§8.3.2.3', '§10.29.6.1', '§6.6.2', '§10.29.8.2']) {
      expect(std, c).toContain(c)
    }
    for (const sim of ['50 ns', 'UWB_STS_REJECT', 'UWB_TIMEOUT', '转发', '本仿真器', '本课']) expect(std, sim).not.toContain(sim)
  })

  it('the base is uwb-intro’s scene; the variants are the 20 m room with and without a relay', () => {
    expect(uwbSts.scenario()).toEqual(uwbIntroScenario(5))
    expect(uwbSts.variants![V_HONEST_20].scenario()).toEqual(uwbIntroScenario(20))
    for (const [v, off] of [[V_OFF, true], [V_ON, false]] as const) {
      const s = uwbSts.variants![v].scenario()
      expect(s).toEqual(uwbStsScenario(off))
      expect(() => ScenarioSchema.parse(s)).not.toThrow()
      expect(s.uwb!.attacker).toEqual({ advanceNs: RELAY_ADVANCE_NS })
      expect(s.uwb!.stsOff === true).toBe(off)
      expect({ ...s, uwb: { ...s.uwb!, attacker: undefined, stsOff: undefined } })
        .toEqual({ ...uwbIntroScenario(20), uwb: { ...uwbIntroScenario(20).uwb!, attacker: undefined, stsOff: undefined } })
    }
  })
})

describe('uwb-sts · ② says what the engine does, and the engine does it', () => {
  it('the STS and its two gaps are counted into the frame: 33 792 chips', () => {
    expect(UWB_STS_CHIPS).toBe(STS_GAP_CHIPS + STS_ACTIVE_CHIPS + STS_GAP_CHIPS)
    const sim = implRow('STS 的位置与长度').sim
    expect(num(/共 ([\d ]+) 码片/.exec(sim)![1])).toBe(UWB_STS_CHIPS)
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    expect(uwbPpduLayout(poll.frame).map((s) => s.key).slice(1, 6)).toEqual(['sfd', 'stsGap', 'sts', 'stsGap', 'phr'])
  })

  it('no attacker, no check: the honest scene is never verified against anything', () => {
    expect(implRow('接收端的互相关').kind).toBe('absent')
    expect(implRow('接收端的互相关').sim).toContain('没有转发时不做任何判断')
    for (const v of [undefined, V_HONEST_20]) expect(ofType(recs(v), 'UWB_STS_REJECT')).toHaveLength(0)
    // and the honest base is uwb-intro's round, stamp for stamp
    expect(rxCounters(recs())).toEqual([26_381_598_252, 336_335_290_928])
  })

  it('a rejection is one UWB_STS_REJECT, no answer, and the two slots time out', () => {
    const rs = recs(V_ON)
    expect(implRow('是否采用').sim).toContain('UWB_STS_REJECT')
    expect(ofType(rs, 'UWB_STS_REJECT')).toHaveLength(1)
    expect(ofType(rs, 'UWB_STS_REJECT')[0].node).toBe('anchor-1')
    expect(ofType(rs, 'TX_START').map((r) => r.frame.kind)).toEqual(['uwbPoll'])
    const to = ofType(rs, 'UWB_TIMEOUT')
    expect(to.map((r) => `${r.node} ${r.slot}`)).toEqual(['anchor-1 0', 'tag-1 1'])
    expect(implRow('拒绝之后').sim).toContain('两条 UWB_TIMEOUT')
    expect(ofType(rs, 'UWB_RANGE')).toHaveLength(0)
  })

  it('「序列关闭」 keeps configuration 1’s length: the frame is the same, only the check is off', () => {
    expect(implRow('关闭序列').kind).toBe('differs')
    const len = (v: number) => ofType(recs(v), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame.txTimeNs
    expect(len(V_OFF)).toBe(len(V_HONEST_20))
    expect(len(V_ON)).toBe(len(V_HONEST_20))
  })

  it('the relay is one fixed advance on every reception', () => {
    expect(implRow('转发设备').sim).toContain(`${RELAY_ADVANCE_NS} ns`)
    // both receptions of the round land the advance early: same counter shift on both sides
    const h = rxCounters(recs(V_HONEST_20))
    const s = rxCounters(recs(V_OFF))
    expect(h[0] - s[0]).toBe(h[1] - s[1])
    expect((h[0] - s[0]) * RCTU_NS).toBeCloseTo(RELAY_ADVANCE_NS, 0)
  })
})

describe('uwb-sts · ③ every figure the labs print is the run', () => {
  it('lab 1: the honest base reads 4.95 m against 5.00 m, with no rejection', () => {
    const r = ofType(recs(), 'UWB_RANGE')[0]
    const e = lab('没有转发的一轮').expect
    expect(e).toContain(`测距行报出 ${r.distM.toFixed(2)} m，真值 ${r.trueDistM.toFixed(2)} m`)
    expect(e).toContain('没有 UWB_STS_REJECT')
  })

  it('lab 2: the figure’s two ranges are the two runs’', () => {
    const spec = uwbStsSequence()
    expect(blockOf(lab('序列关闭时，转发缩短了 15 m'), 'diagram', '无转发的一轮，和被转发的一轮').spec).toEqual(spec)
    expect(HONEST_20_M).toBe(`${ofType(recs(V_HONEST_20), 'UWB_RANGE')[0].distM.toFixed(2)} m`)
    expect(SPOOFED_M).toBe(`${ofType(recs(V_OFF), 'UWB_RANGE')[0].distM.toFixed(2)} m`)
    expect(spec.messages.map((m) => m.at)).toEqual([HONEST_20_M, undefined, SPOOFED_M])
    expect(spec.messages[2].label).toContain(String(RELAY_ADVANCE_NS))
    // 「只要预测出一帧开头公开的 SYNC 与 SFD」: the two segments in front of the STS
    const poll = ofType(recs(V_OFF), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    expect(uwbPpduLayout(poll.frame).slice(0, 2).map((s) => s.key)).toEqual(['sync', 'sfd'])
    expect(blockOf(lab('序列关闭时，转发缩短了 15 m'), 'diagram', '无转发的一轮，和被转发的一轮').caption).toContain(`${RELAY_ADVANCE_NS} ns`)
  })

  it('lab 2: the counter table is the two runs, cell for cell', () => {
    const rows = blockOf(lab('序列关闭时，转发缩短了 15 m'), 'table', '同一次相减，换成计数单位').rows
    const rsH = recs(V_HONEST_20)
    const rsS = recs(V_OFF)
    const tsH = ofType(rsH, 'UWB_TS').filter((r) => r.dir === 'rx')
    const tsS = ofType(rsS, 'UWB_TS').filter((r) => r.dir === 'rx')
    for (const i of [0, 1]) {
      expect(fmtRecord(tsH[i]).split(': counter ')[0]).toBe(rows[i][0])
      expect(num(rows[i][1])).toBe(tsH[i].counter)
      expect(num(rows[i][2])).toBe(tsS[i].counter)
    }
    const rH = ofType(rsH, 'UWB_RANGE')[0]
    const rS = ofType(rsS, 'UWB_RANGE')[0]
    expect(rows[2][1]).toBe(`${rH.tofRawRctu} RCTU`)
    expect(rows[2][2]).toBe(`${rS.tofRawRctu} RCTU`)
    expect(rows[3][1]).toBe(`${rH.distM.toFixed(2)} m`)
    expect(rows[3][2]).toBe(`${rS.distM.toFixed(2)} m`)
  })

  it('lab 2: 50 ns is 14.99 m, and the run loses exactly that', () => {
    const f = blockOf(lab('序列关闭时，转发缩短了 15 m'), 'formula', '50 ns 对应多少距离')
    const m = /(\d+) ns × ([\d.]+) m\/ns = ([\d.]+) m\n(\d+) − (\d+) = (\d+) RCTU；([\d.]+) m − ([\d.]+) m = ([\d.]+) m/.exec(f.text)!
    expect(Number(m[1])).toBe(RELAY_ADVANCE_NS)
    expect(Number(m[2])).toBe(C_M_PER_NS)
    expect(m[3]).toBe((RELAY_ADVANCE_NS * C_M_PER_NS).toFixed(2))
    const rH = ofType(recs(V_HONEST_20), 'UWB_RANGE')[0]
    const rS = ofType(recs(V_OFF), 'UWB_RANGE')[0]
    expect([Number(m[4]), Number(m[5])]).toEqual([rH.tofRawRctu, rS.tofRawRctu])
    expect(Number(m[6])).toBe(rH.tofRawRctu! - rS.tofRawRctu!)
    expect([m[7], m[8]]).toEqual([rH.distM.toFixed(2), rS.distM.toFixed(2)])
    expect(m[9]).toBe((rH.distM - rS.distM).toFixed(2))
    expect(m[9]).toBe(m[3])
    expect(f.note).toContain(`${RELAY_ADVANCE_NS} ns`)
  })

  it('lab 2: the expectation — 3195 RCTU low on both receptions, 50.0 ns, and 4.96 m against 20.00 m', () => {
    const e = lab('序列关闭时，转发缩短了 15 m').expect
    const m = /小 (\d+) RCTU，即 ([\d.]+) ns；测距行报出 ([\d.]+) m，而真值是 ([\d.]+) m/.exec(e)!
    const h = rxCounters(recs(V_HONEST_20))
    const s = rxCounters(recs(V_OFF))
    for (const i of [0, 1]) expect(h[i] - s[i]).toBe(Number(m[1]))
    expect(m[2]).toBe((Number(m[1]) * RCTU_NS).toFixed(1))
    const rS = ofType(recs(V_OFF), 'UWB_RANGE')[0]
    expect(m[3]).toBe(rS.distM.toFixed(2))
    expect(m[4]).toBe(rS.trueDistM.toFixed(2))
  })

  it('lab 3: the outcome table’s three rooms are the three runs', () => {
    const rows = blockOf(lab('序列开启时，这一轮没有距离'), 'table', '同一轮的三种结果').rows
    const describeRun = (rs: TLRecord[]): string => {
      const parts: string[] = []
      const n = (t: 'UWB_RANGE' | 'UWB_STS_REJECT' | 'UWB_TIMEOUT') => ofType(rs, t).length
      if (n('UWB_RANGE')) parts.push(`${n('UWB_RANGE')} × UWB_RANGE`)
      if (n('UWB_STS_REJECT')) parts.push(`${n('UWB_STS_REJECT')} × UWB_STS_REJECT`)
      if (n('UWB_TIMEOUT')) parts.push(`${n('UWB_TIMEOUT')} × UWB_TIMEOUT`)
      return parts.join(', ')
    }
    for (const [row, v] of [[rows[0], undefined], [rows[1], V_OFF], [rows[2], V_ON]] as const) {
      const rs = recs(v)
      const truth = (v === undefined ? uwbSts.scenario() : uwbSts.variants![v].scenario()).nodes
      const d = Math.hypot(truth[1].pos.x - truth[0].pos.x, truth[1].pos.y - truth[0].pos.y)
      expect(row[1]).toBe(`${d} m`)
      const r = ofType(rs, 'UWB_RANGE')[0]
      expect(row[2]).toBe(r ? `${r.distM.toFixed(2)} m` : '没有')
      expect(row[3]).toBe(describeRun(rs))
    }
  })

  it('lab 3: the rejection and the two timeouts, at the instants the expectation names', () => {
    const rs = recs(V_ON)
    const e = lab('序列开启时，这一轮没有距离').expect
    const m = /随后在 ([\d ]+) ns 与 ([\d ]+) ns 各有一条 UWB_TIMEOUT/.exec(e)!
    expect(ofType(rs, 'UWB_TIMEOUT').map((r) => r.t)).toEqual([num(m[1]), num(m[2])])
    expect(ofType(rs, 'UWB_STS_REJECT')[0].frameKind).toBe('uwbPoll')
    expect(e).toContain('没有测距行')
  })

  it('the quiz’s 14.99 m is the formula’s', () => {
    expect(uwbSts.quiz[1].explain).toContain(`${(RELAY_ADVANCE_NS * C_M_PER_NS).toFixed(2)} m`)
    expect(uwbSts.quiz[1].q).toContain(`${RELAY_ADVANCE_NS} ns`)
  })
})
