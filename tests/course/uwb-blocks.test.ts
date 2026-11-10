/**
 * `@uwb-blocks`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites and the two field widths it states against the engine's
 * own constants; ② row by row against what the engine does; ③ by reading every figure each lab
 * prints back out of the lesson text and comparing it with a run. Editing a number in the lesson
 * without the engine agreeing turns this red, and so does an engine change that moves a number the
 * lesson still prints.
 *
 * The lesson used to carry a `limits` entry promising that `uwb-contention` lifts 「the controller
 * knows every controlee」; the standard-first shape has no `limits`, and ① now states both schedule
 * modes itself (§10.32.1), so the promise and its row in tests/course/limits.test.ts went with it.
 */
import { describe, it, expect } from 'vitest'
import { FIG, uwbBlocks, uwbBlocksScenario } from '../../src/course/uwb/uwb-blocks'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, uwbTag, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { fmtRecord } from '../../src/ui/format'
import { STRINGS } from '../../src/ui/i18n'
import { uwbFrameFields } from '../../src/uwb/frameFields'
import { roundPlan } from '../../src/uwb/session'
import {
  RR_IE_BYTES, RSTU_CHIPS, UWB_IE_HDR_BYTES, rdmIeBytes, rstuNs, uwbPollBytes, uwbSlotsPerTag,
} from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** Two blocks and a little more, so the repeat is visible and the second block's rounds all close. */
const RUN_NS = 300 * MS
const ANCHORS = 4
const TAGS = ['uwb-1', 'uwb-2', 'uwb-3']

const SESSION = uwbBlocks.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)
const recs = (variant?: number): TLRecord[] => runOf(uwbBlocks, variant, RUN_NS)

lessonShapeSuite(uwbBlocks, { runNs: RUN_NS })

/** A figure as the lesson prints it: thousands separated by a space. */
const grp = (n: number): string => n.toLocaleString('en-US').replace(/,/g, ' ')
/** The frame names the lesson prints, by the engine's frame kind. */
const NAME: Record<string, string> = { uwbPoll: 'Poll', uwbResp: 'Response', uwbFinal: 'Final', uwbReport: 'Report' }

/** Nanoseconds a node's radio spends out of `idle` inside [fromNs, untilNs), off the MAC_STATE lane. */
function radioOnNs(rs: TLRecord[], node: string, untilNs: number, fromNs = 0): number {
  let state: string = 'idle'
  let since = fromNs
  let on = 0
  for (const r of ofType(rs, 'MAC_STATE')) {
    if (r.node !== node || r.t >= untilNs || r.t < fromNs) continue
    if (state !== 'idle') on += r.t - since
    state = r.state
    since = r.t
  }
  if (state !== 'idle') on += untilNs - since
  return on
}

const lab = (heading: string): Lab => {
  const l = uwbBlocks.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbBlocks.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
/** The one capture of `re` in `s`, as a number; the lesson's spaced thousands are read as one figure. */
const num = (s: string, re: RegExp, what: string): number => {
  const m = re.exec(s)
  expect(m, `${what}: 「${re.source}」 not found`).not.toBeNull()
  return Number(m![1]!.replace(/\s/g, ''))
}
const stdText = (): string => uwbBlocks.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-blocks · the lesson', () => {
  it('is in the standard-first shape, in the sessions module', () => {
    expect(isStandardFirst(uwbBlocks)).toBe(true)
    expect(MODULES[uwbBlocks.module].title).toBe('会话网格')
    expect(uwbBlocks.needs).toEqual(['uwb-frame', 'uwb-dstwr'])
    expect(uwbBlocks.limits).toEqual([])
    expect(uwbBlocks.observe).toEqual([])
    expect(uwbBlocks.tryThis).toEqual([])
    // the 0.5 ms variant stays: `uwb-slot-budget` loads this scene and its variant unchanged
    expect(uwbBlocks.variants!.map((v) => v.scenario().uwb!.slotRstu)).toEqual([600])
  })

  it('cites each clause ① teaches, and ② is not all faithful', () => {
    for (const c of ['§10.32.1', '§10.32.2', '§10.32.3.3', '§10.32.3.4', '§10.32.9.1', '§10.32.9.3', '§10.32.9.8', '§10.29.1.5']) {
      expect(stdText(), c).toContain(c)
    }
    const kinds = new Set(uwbBlocks.implementation!.map((r) => r.kind))
    expect(kinds.size).toBeGreaterThan(1)
    for (const k of ['faithful', 'value', 'choice', 'differs', 'absent'] as const) expect(kinds, k).toContain(k)
  })

  it('① states the RSTU and the RR IE width the engine uses', () => {
    // 「HRP UWB 下为 416 个码片，约 833.33 ns」
    expect(num(stdText(), /为 (\d+) 个码片/, 'RSTU chips')).toBe(RSTU_CHIPS)
    expect(num(stdText(), /约 ([\d.]+) ns/, 'RSTU ns')).toBe(Number((rstuNs(1_000_000) / 1_000_000).toFixed(2)))
    // 「RR 信息单元依次是块号（2 个字节）、跳变模式（1 位）与轮号（15 位）、发送偏移（2 个字节），共 6 个字节」
    expect(num(stdText(), /发送偏移（2 个字节），共 (\d+) 个字节/, 'RR content')).toBe(RR_IE_BYTES - UWB_IE_HDR_BYTES)
  })
})

describe('uwb-blocks · ② says what the engine does, and the engine does it', () => {
  it('the three levels and the unit, figure by figure', () => {
    const sim = implRow('三层结构与时间单位').sim
    expect(num(sim, /一个块 ([\d ]+) RSTU/, 'block RSTU')).toBe(SESSION.blockRstu)
    expect(num(sim, /RSTU（([\d.]+) ms），可容纳/, 'block ms') * MS).toBe(PLAN.blockNs)
    expect(num(sim, /可容纳 (\d+) 轮/, 'rounds')).toBe(PLAN.roundsPerBlock)
    expect(num(sim, /一轮 (\d+) 个时隙/, 'slots')).toBe(PLAN.slots)
    expect(num(sim, /一个时隙 ([\d ]+) RSTU/, 'slot RSTU')).toBe(SESSION.slotRstu)
    expect(num(sim, /RSTU（([\d .]+) µs）/, 'slot µs') * 1000).toBe(PLAN.slotNs)
    expect(num(sim, /RSTU 取 (\d+) 个码片/, 'chips')).toBe(RSTU_CHIPS)
    expect(num(sim, /即 ([\d.]+) ns/, 'RSTU ns')).toBe(Number((rstuNs(1000) / 1000).toFixed(3)))
    expect(rstuNs(SESSION.blockRstu)).toBe(PLAN.blockNs)
  })

  it('a round is two slots per anchor plus two, 20.0 ms', () => {
    const sim = implRow('一轮有几个时隙').sim
    expect(num(sim, /四个锚点时一轮 (\d+) 个时隙/, 'slots')).toBe(uwbSlotsPerTag('ds', ANCHORS))
    expect(PLAN.slots).toBe(2 * ANCHORS + 2)
    expect(num(sim, /即 ([\d.]+) ms/, 'round ms') * MS).toBe(PLAN.roundNs)
  })

  it('one anchor fewer leaves the block a fractional number of rounds, floored (differs)', () => {
    const row = implRow('块长不是轮长的整数倍时')
    expect(row.kind).toBe('differs')
    const three = roundPlan(SESSION, ANCHORS - 1)
    expect(num(row.sim, /一轮 (\d+) ms/, 'round') * MS).toBe(three.roundNs)
    expect(num(row.sim, /(\d+) ms 的块/, 'block') * MS).toBe(three.blockNs)
    expect(num(row.sim, /容纳 (\d+) 轮/, 'rounds')).toBe(three.roundsPerBlock)
    expect(num(row.sim, /余下 (\d+) ms/, 'left') * MS).toBe(three.blockNs - three.roundsPerBlock * three.roundNs)
    expect(three.blockNs % three.roundNs).not.toBe(0)
  })

  it('the block structure is not in the frame: Content Control 0', () => {
    expect(implRow('块结构怎样告知').sim).toContain('Content Control 为 0')
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame
    const arc = uwbFrameFields(poll).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ieArc')!
    expect(arc.value).toContain('Content Control 0x00')
  })

  it('RR: block and round as they are, hopping 0, offset 0, eight octets', () => {
    const sim = implRow('RR 信息单元').sim
    expect(num(sim, /共 (\d+) 个字节/, 'RR')).toBe(RR_IE_BYTES)
    expect(num(sim, /(\d+) 个字节的信息单元头/, 'hdr')).toBe(UWB_IE_HDR_BYTES)
    for (const p of ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbPoll')) {
      const rr = uwbFrameFields(p.frame).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ieRr')!
      expect(rr.value).toBe(`Ranging Block Index ${p.frame.uwb!.block} · Hopping Mode 0 · Round Index ${p.frame.uwb!.round} · Transmission Offset 0`)
    }
  })

  it('RDM: sent in the standard\'s format, but the anchors answer in list order (differs)', () => {
    const row = implRow('RDM 信息单元')
    expect(row.kind).toBe('differs')
    expect(num(row.sim, /每个条目 (\d+) 个字节/, 'entry')).toBe(rdmIeBytes(ANCHORS + 1) - rdmIeBytes(ANCHORS))
    expect(num(row.sim, /共 (\d+) 个字节/, 'RDM')).toBe(rdmIeBytes(ANCHORS))
    // the responders answer in the order of the scene's anchor list, slot 1 onwards
    const resp = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs && r.frame.kind === 'uwbResp')
    expect(resp.map((r) => [r.node, r.t / PLAN.slotNs])).toEqual([['anchor-1', 1], ['anchor-2', 2], ['anchor-3', 3], ['anchor-4', 4]])
  })

  it('round k is phone k in every block, offset 0', () => {
    const rounds = ofType(recs(), 'UWB_ROUND')
    expect(new Set(rounds.map((r) => r.block)).size).toBeGreaterThan(1)
    for (const r of rounds) expect(r.round, `${r.node} b${r.block}`).toBe(TAGS.indexOf(r.node))
  })

  it('an anchor\'s radio is on in its four slots only', () => {
    expect(implRow('接收机何时开启').kind).toBe('faithful')
    for (const s of [2, 3, 4, 7, 8, 9]) {
      const from = s * PLAN.slotNs
      expect(radioOnNs(recs(), 'anchor-1', from + PLAN.slotNs, from), `slot ${s}`).toBe(0)
    }
    for (const s of [0, 1, 5, 6]) {
      const from = s * PLAN.slotNs
      expect(radioOnNs(recs(), 'anchor-1', from + PLAN.slotNs, from), `slot ${s}`).toBeGreaterThan(0)
    }
  })

  it('every slot boundary is exact for every device (no synchronisation modelled)', () => {
    expect(implRow('设备之间的时间同步').kind).toBe('absent')
    for (const r of ofType(recs(), 'TX_START')) expect(r.t % PLAN.slotNs, `${r.node}@${r.t}`).toBe(0)
  })

  it('a missed frame is a UWB_TIMEOUT, the round goes on, and the Final leaves the anchor out', () => {
    expect(implRow('预期的帧没有到达').sim).toContain('UWB_TIMEOUT')
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(0)
    const sc = uwbBlocksScenario(2400)
    const far = { ...sc, nodes: sc.nodes.map((n) => (n.id === 'anchor-1' ? { ...n, pos: { ...n.pos, x: 60 } } : n)) }
    const rs = [...runOf({ ...uwbBlocks, id: 'uwb-blocks#far', scenario: () => far }, undefined, 60 * MS)]
    expect(ofType(rs, 'UWB_TIMEOUT').length).toBeGreaterThan(0)
    expect(ofType(rs, 'UWB_SLOT').filter((r) => r.node === 'uwb-1' && r.t < PLAN.roundNs)).toHaveLength(PLAN.slots)
    const finals = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbFinal')
    expect(finals[0].frame.uwb!.finalTimes!.map((e) => e.id)).not.toContain('anchor-1')
  })

  it('the list is fixed: one round a phone, and the block holds ten phones before it breaks', () => {
    const issues = (extra: number): string[] => {
      const base = uwbBlocksScenario(2400)
      const nodes = [...base.nodes, ...Array.from({ length: extra }, (_, i) =>
        uwbTag(`uwb-${TAGS.length + i + 1}`, `Phone ${TAGS.length + i + 1}`, 5, 4, 1.0))]
      const p = ScenarioSchema.safeParse({ ...base, nodes })
      return p.success ? [] : p.error.issues.map((i) => i.message)
    }
    expect(issues(PLAN.roundsPerBlock - TAGS.length)).toEqual([])
    expect(issues(PLAN.roundsPerBlock - TAGS.length + 1)).toHaveLength(1)
  })
})

describe('uwb-blocks · ③ every figure the labs print is the run', () => {
  it('lab 1: the ten frames of round 0, slot by slot', () => {
    const l = lab('第一轮：十个时隙，十帧')
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)
    const rows = tableOf(l, '第 0 块第 0 轮的十帧').rows
    expect(rows).toHaveLength(tx.length)
    rows.forEach(([slot, who, kind, at], i) => {
      expect(Number(slot), `row ${i}`).toBe(tx[i].t / PLAN.slotNs)
      expect(who, `row ${i}`).toBe(tx[i].node)
      expect(kind, `row ${i}`).toBe(NAME[tx[i].frame.kind])
      expect(at, `row ${i}`).toBe(`${tx[i].t / MS} ms`)
    })
    expect(new Set(tx.map((r) => r.t)).size).toBe(tx.length)
    expect(ofType(recs(), 'BACKOFF_DRAW')).toHaveLength(0)
    expect(ofType(recs(), 'IFS_START')).toHaveLength(0)
  })

  it('lab 1: the figure and its caption are the engine\'s plan and the run\'s air times', () => {
    const d = lab('第一轮：十个时隙，十帧').blocks!.find((b) => b.kind === 'diagram') as Extract<Block, { kind: 'diagram' }>
    const cap = d.caption!
    expect(num(cap, /一个块 ([\d ]+) RSTU/, 'block')).toBe(SESSION.blockRstu)
    expect(num(cap, /RSTU，([\d.]+) ms，可容纳/, 'block ms') * MS).toBe(PLAN.blockNs)
    expect(cap).toContain(`可容纳${'零一二三四五六七八九十'[PLAN.roundsPerBlock]}轮`)
    expect(cap).toContain(`划分为${'零一二三四五六七八九十'[PLAN.slots]}个时隙`)
    expect(num(cap, /一轮 ([\d ]+) RSTU/, 'round')).toBe(PLAN.slots * SESSION.slotRstu)
    expect(num(cap, /一轮 [\d ]+ RSTU，([\d.]+) ms/, 'round ms') * MS).toBe(PLAN.roundNs)
    expect(num(cap, /每个 ([\d ]+) RSTU/, 'slot')).toBe(SESSION.slotRstu)
    expect(num(cap, /每个 [\d ]+ RSTU，([\d .]+) µs/, 'slot µs') * 1000).toBe(PLAN.slotNs)
    expect([FIG.blockRstu, FIG.roundRstu, FIG.slotRstu]).toEqual([SESSION.blockRstu, PLAN.slots * SESSION.slotRstu, SESSION.slotRstu])
    const tx = ofType(recs(), 'TX_START').filter((r) => r.t < PLAN.roundNs)
    expect(FIG.frames.map((f) => [f.slot, Math.round(f.airUs * 1000)])).toEqual(tx.map((r) => [r.t / PLAN.slotNs, r.frame.txTimeNs]))
    expect((d.spec as TimingSpec).axis.toUs * 1000).toBe(PLAN.roundNs)
  })

  it('lab 2: the opener\'s three IEs are what the frame inspector prints', () => {
    const l = lab('首帧带来了什么')
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!.frame
    const t = (l.blocks![0] as Extract<Block, { kind: 'table' }>)
    expect(num(t.heading!, /整帧 (\d+) 字节/, 'poll')).toBe(poll.bytes)
    expect(poll.bytes).toBe(uwbPollBytes(ANCHORS))
    const fields = uwbFrameFields(poll).users[0].subframes[0].mpdu.fields
    const key: Record<string, string> = { ARC: 'ieArc', RR: 'ieRr', RDM: 'ieRdm' }
    expect(t.rows.map((r) => r[0])).toEqual(['ARC', 'RR', 'RDM'])
    for (const [name, bytes, value] of t.rows) {
      const f = fields.find((x) => x.key === key[name])!
      expect(bytes, name).toBe(`${f.bytes} 字节`)
      expect(value, name).toBe(f.value)
    }
    expect(l.expect).toContain('Content Control 为 0x00')
    expect(l.expect).toContain('块号 0、轮号 0')
  })

  it('lab 3: three rounds in each block, one fix each, the other seven rounds never open', () => {
    const l = lab('三部手机，三轮，一个块')
    const rounds = ofType(recs(), 'UWB_ROUND')
    const fixes = ofType(recs(), 'UWB_POSITION')
    for (const [tag, round, b0, b1, fix] of tableOf(l, '前两个块里的三轮').rows) {
      const mine = rounds.filter((r) => r.node === tag)
      expect(Number(round), tag).toBe(mine[0].round)
      expect(b0, tag).toBe(`${mine.find((r) => r.block === 0)!.t / MS} ms`)
      expect(b1, tag).toBe(`${mine.find((r) => r.block === 1)!.t / MS} ms`)
      const f = fixes.find((x) => x.node === tag && x.block === 0)!
      expect(fmtRecord(f), tag).toContain(`position ${fix.split(' at ')[0]}`)
      expect(fix.split(' at ')[1], tag).toBe(`${f.t / MS} ms`)
    }
    // 「十轮里只使用了三轮，其余七轮（每块 140 ms）始终没有开启」
    expect(new Set(rounds.map((r) => r.round)).size).toBe(TAGS.length)
    expect(num(l.expect, /七轮（每块 (\d+) ms）/, 'unused') * MS).toBe((PLAN.roundsPerBlock - TAGS.length) * PLAN.roundNs)
    // 「每部手机每秒得到五次定位，误差都在 3 cm 以内」 (the old 「2 cm」 was false: uwb-2 is 2.26 cm out in block 0)
    expect(1e9 / PLAN.blockNs).toBe(5)
    for (const b of [0, 1]) for (const tag of TAGS) expect(fixes.filter((f) => f.node === tag && f.block === b), `${tag} b${b}`).toHaveLength(1)
    for (const f of fixes) expect(Math.hypot(f.x - f.trueX, f.y - f.trueY) * 100, `${f.node} b${f.block}`).toBeLessThan(num(l.expect, /误差都在 (\d+) cm/, 'cm'))
    // 「定位在自己那一轮的末尾给出」
    for (const f of fixes) {
      const open = rounds.find((r) => r.node === f.node && r.block === f.block)!
      expect(f.t).toBe(open.t + PLAN.roundNs)
    }
  })

  it('lab 4: phone 2\'s round, as arithmetic and as the log', () => {
    const rows = tableOf(lab('用编号算出发送时刻'), '第 2 部手机的那一轮').rows
    const open = ofType(recs(), 'UWB_ROUND').find((r) => r.node === 'uwb-2' && r.block === 0)!
    expect(rows[0][1]).toBe(`${open.block} · ${open.round}`)
    expect(rows[1][1]).toBe(`${open.round} × ${(PLAN.roundNs / MS).toFixed(1)} ms = ${open.t / MS} ms`)
    const slots = ofType(recs(), 'UWB_SLOT').filter((r) => r.node === 'uwb-2' && r.t < PLAN.blockNs)
    expect(rows[2][1]).toBe(`${grp(slots[0].t)} ns`)
    expect(rows[3][1]).toBe(`${grp(slots[5].t)} ns`)
    expect(ofType(recs(), 'TX_START').find((r) => r.node === 'uwb-2' && r.frame.kind === 'uwbFinal')!.t).toBe(slots[5].t)
    const end = ofType(recs(), 'UWB_ROUND_END').find((r) => r.node === 'uwb-2')!
    expect(rows[4][1]).toBe(`${grp(end.t)} ns`)
    expect(ofType(recs(), 'UWB_POSITION').find((r) => r.node === 'uwb-2')!.t).toBe(end.t)
  })

  it('lab 5: one anchor fewer, the plan line the editor prints', () => {
    const l = lab('少一个锚点')
    const three = roundPlan(SESSION, ANCHORS - 1)
    expect(l.expect).toContain(`“${STRINGS.editor.uwbPlan(three.slots, three.roundsPerBlock)}”`)
    expect(num(l.expect, /从 (\d+) ms 缩短/, 'from') * MS).toBe(PLAN.roundNs)
    expect(num(l.expect, /缩短到 (\d+) ms/, 'to') * MS).toBe(three.roundNs)
    expect(num(l.expect, /块长保持 (\d+) ms/, 'block') * MS).toBe(three.blockNs)
    expect(num(l.meaning, /取 (\d+) 轮/, 'rounds')).toBe(three.roundsPerBlock)
    expect(num(l.meaning, /余下 (\d+) ms/, 'left') * MS).toBe(three.blockNs - three.roundsPerBlock * three.roundNs)
  })
})
