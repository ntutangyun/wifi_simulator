/**
 * `@uwb-contention`, in the standard-first shape (2026-11-10).
 *
 * The lesson was rewritten after the standard audit (docs/uwb-standard-audit.md): the engine no
 * longer closes a feedback loop at the end of each round or makes an anchor sit a round out —
 * neither is in IEEE Std 802.15.4-2024. §10.32.9.6 gives only a cap on response attempts under one
 * control message, no larger than the RCM Validity Rounds; this scene sends a control message
 * every round, so the cap is 1 and every anchor answers once per round.
 *
 * Every figure the lesson prints is read back out of its own text here and compared with a run,
 * so editing a number in the lesson without the engine agreeing turns this red, and so does an
 * engine change that moves a number the lesson still prints.
 */
import { describe, expect, it } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  CONTENTION_ANCHORS, CONTENTION_SLOTS, uwbContention, uwbContentionScenario, type UwbContentionVariant,
} from '../../src/course/uwb/uwb-contention'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 5900 * MS
const ROUNDS = 30
const TAG = 'uwb-1'
const C = 299_792_458

const VARIANTS: UwbContentionVariant[] = ['base', 'slots4', 'slots16']
const variantIndex = (v: UwbContentionVariant): number | undefined =>
  v === 'base' ? undefined : v === 'slots4' ? 0 : 1

const cache = new Map<string, TLRecord[]>()
const recs = (v: UwbContentionVariant): TLRecord[] => {
  if (!cache.has(v)) cache.set(v, runOf(uwbContention, variantIndex(v), RUN_NS))
  return cache.get(v)!
}
const timeScheduled = (): TLRecord[] => {
  if (!cache.has('time')) {
    const s = uwbContentionScenario('base')
    cache.set('time', [...new Simulation({ ...s, uwb: { ...s.uwb!, schedule: 'time' } }).runUntil(RUN_NS).records])
  }
  return cache.get('time')!
}

const tagRounds = (rs: TLRecord[]) => ofType(rs, 'UWB_ROUND').filter((r) => r.node === TAG)
const tagRanges = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG)
const rms = (xs: number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)
const errCm = (rs: TLRecord[]) => tagRanges(rs).map((r) => Math.abs(r.distM - r.trueDistM) * 100)

const lab = (heading: string): Lab => {
  const l = uwbContention.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbContention.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(uwbContention, { runNs: RUN_NS })

describe('uwb-contention · the lesson', () => {
  it('is in the standard-first shape, in the contention module', () => {
    expect(isStandardFirst(uwbContention)).toBe(true)
    expect(MODULES[uwbContention.module].title).toBe('竞争式测距')
    expect(uwbContention.limits).toEqual([])
    expect(uwbContention.observe).toEqual([])
    expect(uwbContention.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①', () => {
    const std = uwbContention.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.32.1', '§10.32.2', '§10.32.9.5', '§10.32.9.6', '§10.32.9.1']) expect(std, clause).toContain(clause)
    expect(std).toContain('没有任何消息告诉应答方')
  })
})

describe('uwb-contention · ② says what the engine does, and the engine does it', () => {
  it('poll: schedule mode 0 with ARC, RCPS, RCMA and RRMC, and no RDM', () => {
    expect(implRow('调度模式 0').sim).toContain('ARC、RCPS、RCMA、RRMC')
    const poll = ofType(recs('base'), 'TX_START').find((r) => r.node === TAG)!.frame
    expect(poll.uwb?.ies).toEqual(['ARC', 'RCPS', 'RCMA', 'RRMC'])
    expect(poll.uwb?.schedule).toBeUndefined()
  })

  it('the cap is 1 here because the validity is 1, so every anchor answers once per round', () => {
    const s = uwbContentionScenario('base').uwb!
    expect(s.rcmValidityRounds).toBe(1)
    expect(s.maxAttempts).toBe(1)
    expect(implRow('尝试次数上限').sim).toContain('上限只能是 1')
    for (const v of VARIANTS) {
      const contends = ofType(recs(v), 'UWB_CONTEND')
      expect(contends.length, v).toBe(ROUNDS * CONTENTION_ANCHORS)
      expect(contends.every((r) => r.slot !== null && r.attempt === 1), v).toBe(true)
    }
  })

  it('the editor refuses more attempts than the validity allows (§10.32.9.6)', () => {
    const s: Scenario = uwbContentionScenario('base')
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, maxAttempts: 3 } }).success).toBe(false)
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, maxAttempts: 3, rcmValidityRounds: 3 } }).success).toBe(true)
  })

  it('no timeout is written for an empty or collided slot', () => {
    for (const v of VARIANTS) expect(ofType(recs(v), 'UWB_TIMEOUT'), v).toEqual([])
  })

  it('the one-sided error grows 3.0 cm per millisecond of waiting, 6.0 cm per 2 ms slot', () => {
    const s = uwbContentionScenario('base').uwb!
    const perMsCm = (C * s.cfoNoisePpm * 1e-6 * 1e-3 / 2) * 100
    expect(perMsCm.toFixed(1)).toBe('3.0')
    expect((perMsCm * 2).toFixed(1)).toBe('6.0')
    expect(implRow('单边测距的残余误差').sim).toContain('3.0 cm')
    expect(implRow('单边测距的残余误差').sim).toContain('6.0 cm')
  })
})

describe('uwb-contention · ③ every figure the labs print is the run', () => {
  it('lab 1: the six draws of round 0, and the two ranges they leave', () => {
    const rs = recs('base')
    const end = tagRounds(rs)[1].t
    const draws = new Map(ofType(rs, 'UWB_CONTEND').filter((r) => r.t < end).map((r) => [r.node, r.slot]))
    const ranged = new Set(tagRanges(rs).filter((r) => r.t < end).map((r) => r.peer))
    const rows = tableOf(lab('六个锚点各选一个时隙'), '第 0 轮：六次抽取，两次测距').rows
    expect(rows).toHaveLength(CONTENTION_ANCHORS)
    for (const [anchor, slot, result] of rows) {
      expect(slot, anchor).toBe(`slot ${draws.get(anchor)}`)
      expect(result.startsWith('测到'), anchor).toBe(ranged.has(anchor))
    }
    expect(lab('六个锚点各选一个时隙').expect).toContain([...ranged].sort().join(' 与 '))
    expect(ofType(rs, 'UWB_POSITION').filter((r) => r.t < end)).toEqual([])
  })

  it('lab 2: the first collision is in slot 4, one record for it', () => {
    const first = ofType(recs('base'), 'UWB_CONTEND_COLLISION')[0]
    expect(first.slot).toBe(4)
    expect(lab('一次碰撞在日志里是什么样').expect).toContain(`第 ${first.slot} 号时隙一条碰撞记录`)
  })

  it('lab 3: thirty rounds under each window, and the roll call', () => {
    const rows = tableOf(lab('竞争阶段的宽窄'), '三十轮，三种竞争阶段').rows
    for (const v of VARIANTS) {
      const S = CONTENTION_SLOTS[v]
      const row = rows.find((r) => r[0] === String(S))!
      const rs = recs(v)
      expect(tagRounds(rs), v).toHaveLength(ROUNDS)
      expect(row[1], v).toBe(`${(S + 1) * 2} ms`)
      expect(row[2], v).toBe((CONTENTION_ANCHORS * (1 - 1 / S) ** (CONTENTION_ANCHORS - 1)).toFixed(2))
      expect(row[3], v).toBe((tagRanges(rs).length / ROUNDS).toFixed(2))
      expect(row[4], v).toBe(String(ofType(rs, 'UWB_CONTEND_COLLISION').length))
      expect(row[5], v).toBe(`${ofType(rs, 'UWB_POSITION').length} / ${ROUNDS}`)
    }
    const roll = rows.find((r) => r[0].startsWith('按时间调度'))!
    const ts = timeScheduled()
    expect(roll[1]).toBe(`${tagRounds(ts)[0].slots * 2} ms`)
    expect(roll[3]).toBe((tagRanges(ts).length / ROUNDS).toFixed(2))
    expect(roll[4]).toBe(String(ofType(ts, 'UWB_CONTEND_COLLISION').length))
    expect(roll[5]).toBe(`${ofType(ts, 'UWB_POSITION').length} / ${ROUNDS}`)
  })

  it('lab 4: the price of a wide window is the one-sided error', () => {
    const rows = tableOf(lab('宽竞争阶段的代价'), '竞争阶段越宽，单边测距误差越大').rows
    for (const v of VARIANTS) {
      const S = CONTENTION_SLOTS[v]
      const row = rows.find((r) => r[0] === String(S))!
      expect(row[1], v).toBe(`${((S + 1) / 2).toFixed(1)} 个时隙`)
      expect(row[2], v).toBe(`${rms(errCm(recs(v))).toFixed(1)} cm`)
    }
    const roll = rows.find((r) => r[0].startsWith('按时间调度'))!
    expect(roll[2]).toBe(`${rms(errCm(timeScheduled())).toFixed(1)} cm`)
    // 「16 个时隙的误差约是 4 个时隙的三倍」
    expect(Math.round(rms(errCm(recs('slots16'))) / rms(errCm(recs('slots4'))))).toBe(3)
  })
})
