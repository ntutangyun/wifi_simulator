/**
 * `@uwb-ancillary-request`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites; ② row by row against the engine; ③ by reading every figure
 * the labs print back out of the lesson text and comparing it with a run.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, ASKER_ID, BYTES, CAPS, FIRST_FRAMES, MS, OVER_REQUEST, REQUEST, SLOTS, TAG_ID,
  uwbAncillaryRequest, uwbAncillaryRequestScenario,
} from '../../src/course/uwb/uwb-ancillary-request'
import { uwbAncillary } from '../../src/course/uwb/uwb-ancillary'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'
import { ancillaryRequestRefusals } from '../../src/model/scenario'
import { raictIeBytes, uwbAncillaryBytes, uwbAncillaryRcmBytes, uwbPpduNs } from '../../src/uwb/phy'
import { ancillaryGrantFits, roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS_NS = 1_000_000
const RUN_NS = 1300 * MS_NS
const BLOCKS = 7
lessonShapeSuite(uwbAncillaryRequest, { runNs: RUN_NS })

const PLAN = roundPlan(uwbAncillaryRequestScenario().uwb!, ANCHORS)
const recs = (variant?: number): TLRecord[] => runOf(uwbAncillaryRequest, variant, RUN_NS)
const txAnc = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbAncillary')
const txRcm = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbRcm')
const msgFrames = (rs: TLRecord[], block: number) =>
  txAnc(rs).filter((r) => r.frame.uwb?.block === block && r.frame.uwb?.raict?.request !== true)
const reqRecs = (rs: TLRecord[]) => ofType(rs, 'UWB_ANCILLARY').filter((r) => r.requestedSlots !== undefined)
const stripSeq = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE').map(({ seq: _s, ...rest }) => rest)

const lab = (heading: string): Lab => {
  const l = uwbAncillaryRequest.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbAncillaryRequest.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

describe('uwb-ancillary-request · the lesson', () => {
  it('is in the standard-first shape, in the same module as the Request = 0 half', () => {
    expect(isStandardFirst(uwbAncillaryRequest)).toBe(true)
    expect(uwbAncillaryRequest.module).toBe(uwbAncillary.module)
    expect(MODULES[uwbAncillaryRequest.module].title).toBe('测距辅助信息')
    expect(uwbAncillaryRequest.needs).toEqual(['uwb-ancillary'])
    expect(uwbAncillaryRequest.limits).toEqual([])
    expect(uwbAncillaryRequest.observe).toEqual([])
    expect(uwbAncillaryRequest.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, and puts no simulator behaviour there', () => {
    const std = uwbAncillaryRequest.standard!.map((b) =>
      `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const c of ['§10.35.1', '§10.35.2.1', '§10.32.9.8', '§10.32.9.5', '§10.32.3.3']) expect(std, c).toContain(c)
    expect(std).not.toContain('本仿真器')
    expect(std).not.toContain('本课')
    expect(std).toContain('没有批复、没有拒绝，也没有任何应答帧')
  })

  it('② is not all faithful: the grant policy, its timing and the refusal are the simulator\'s', () => {
    for (const t of ['是否批准', '批准何时生效', '拒绝', '请求帧的位置与长度']) expect(implRow(t).kind, t).toBe('choice')
    expect(implRow('批准怎样传达').kind).toBe('faithful')
    expect(implRow('请求几个时隙').kind).toBe('value')
  })
})

describe('uwb-ancillary-request · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('请求的编码 / 位置与长度: Request 1, the count in Frames Remaining, the last assigned slot, no number', () => {
    const reqs = txAnc(rs).filter((r) => r.frame.uwb?.raict?.request === true)
    expect(reqs).toHaveLength(BLOCKS)
    for (const r of reqs) {
      expect(r.node).toBe(ASKER_ID)
      expect(r.frame.uwb?.raict).toEqual({ request: true, framesRemaining: REQUEST })
      expect(r.frame.bytes).toBe(BYTES.request)
      // the last slot the block's RCM assigned
      const rcm = txRcm(rs).find((x) => x.frame.uwb?.block === r.frame.uwb?.block)!
      expect(r.frame.uwb?.slot).toBe(rcm.frame.uwb!.rdm!.length)
    }
    expect(BYTES.request).toBe(uwbAncillaryBytes(false, true))
    expect(BYTES.requestIe).toBe(raictIeBytes(false, true))
    expect(BYTES.fragment - BYTES.request).toBe(1)
    expect(implRow('请求帧的位置与长度').sim).toContain(`整帧 ${BYTES.request} 字节`)
  })

  it('谁发出请求: the asker sends the message, the tag sends the RCMs and writes the grant', () => {
    expect(new Set(txAnc(rs).map((r) => r.node))).toEqual(new Set([ASKER_ID]))
    expect(new Set(txRcm(rs).map((r) => r.node))).toEqual(new Set([TAG_ID]))
    expect(new Set(reqRecs(rs).map((r) => r.node))).toEqual(new Set([TAG_ID]))
  })

  it('是否批准: the largest grantable width is walked out of the predicate, and it is the one ② prints', () => {
    expect(CAPS.grant).toBe(PLAN.slots - 2)
    expect(ancillaryGrantFits(PLAN, CAPS.grant)).toBe(true)
    expect(ancillaryGrantFits(PLAN, OVER_REQUEST)).toBe(false)
    expect(implRow('是否批准').sim).toContain(`最多批准 ${CAPS.grant} 个`)
    expect(implRow('是否批准').sim).toContain(`每一轮 ${SLOTS.round} 个时隙`)
    // the round length does not move with a grant
    for (const v of [undefined, 1]) {
      expect(new Set(ofType(recs(v), 'UWB_ROUND').map((r) => r.slots)).size, String(v)).toBe(1)
    }
  })

  it('批准何时生效 / 怎样传达 / 消息长度: block 1\'s RDM assigns REQUEST + 1 slots and the message is REQUEST frames', () => {
    const rdm = txRcm(rs).map((r) => r.frame.uwb!.rdm!.length)
    expect(rdm).toEqual([SLOTS.window, ...Array(BLOCKS - 1).fill(SLOTS.windowGranted)])
    expect(SLOTS.windowGranted).toBe(REQUEST + 1)
    expect(txRcm(rs).map((r) => r.frame.bytes)).toEqual([BYTES.rcm, ...Array(BLOCKS - 1).fill(BYTES.rcmGranted)])
    for (let b = 0; b < BLOCKS; b++) expect(msgFrames(rs, b), String(b)).toHaveLength(b === 0 ? FIRST_FRAMES : REQUEST)
    expect(implRow('批准怎样传达').sim).toContain(`${BYTES.rcm} 字节变为 ${BYTES.rcmGranted} 字节`)
    // no frame other than the RCM carries the grant
    expect(new Set(ofType(rs, 'TX_START').map((r) => r.frame.kind)))
      .toEqual(new Set(['uwbPoll', 'uwbResp', 'uwbRcm', 'uwbAncillary']))
  })

  it('请求方的数目: the scenario refuses the request with two tags', () => {
    const uwb = uwbAncillaryRequestScenario().uwb!
    expect(ancillaryRequestRefusals(uwb, 1)).toEqual([])
    expect(ancillaryRequestRefusals(uwb, 2).length).toBeGreaterThan(0)
  })
})

describe('uwb-ancillary-request · ③ every figure the labs print is the run', () => {
  it('lab 1: block 0\'s ancillary round, slot for slot', () => {
    const l = lab('请求帧：Request 置 1')
    const rows = tableOf(l, '块 0 的辅助信息轮').rows
    const b0 = ofType(recs(), 'TX_START').filter((r) => r.frame.uwb?.block === 0 && r.frame.uwb?.round === 1)
    expect(b0.map((r) => [String(r.frame.uwb?.slot), r.node, String(r.frame.bytes)]))
      .toEqual(rows.map((r) => [r[0], r[1], r[3]]))
    for (const [i, r] of b0.slice(1).entries()) {
      const raict = r.frame.uwb!.raict!
      const cell = rows[i + 1][4]
      expect(cell).toContain(`Request ${raict.request ? 1 : 0}`)
      expect(cell).toContain(`剩余帧数 ${raict.framesRemaining}`)
      if (raict.messageNumber !== undefined) expect(cell).toContain(`消息编号 ${raict.messageNumber}`)
      else expect(cell).not.toContain('消息编号')
    }
    expect(rows[0][2]).toContain(b0[0].frame.uwb!.ies!.join('、'))
    expect(MS.requestFrame).toBe(uwbPpduNs(BYTES.request) / 1e6)
    expect(l.expect).toContain(`${MS.requestFrame.toFixed(2)} ms`)
    expect(l.expect).toContain(`指定 ${b0[0].frame.uwb!.rdm!.length} 个时隙`)
    expect(ofType(recs(), 'UWB_TIMEOUT')).toEqual([])
  })

  it('lab 2: the grant record, and the two rows of the table', () => {
    const l = lab('批准之后，下一块的消息变长')
    const rs = recs()
    const g = reqRecs(rs)[0]
    expect([g.block, g.requestedSlots, g.grantedSlots]).toEqual([0, REQUEST, REQUEST])
    expect(l.expect).toContain(`请求 ${g.requestedSlots} 个、批准 ${g.grantedSlots} 个`)
    const rows = tableOf(l, '请求的全部效果').rows
    for (const [row, block] of [[rows[0], 0], [rows[1], 1]] as const) {
      const rcm = txRcm(rs).find((r) => r.frame.uwb?.block === block)!
      const m = msgFrames(rs, block)
      expect(row[1]).toBe(`${rcm.frame.uwb!.rdm!.length} 个`)
      expect(row[2]).toBe(`${rcm.frame.bytes} 字节`)
      expect(row[3]).toBe(String(m.length))
      expect(row[4]).toBe(`${m[0].frame.uwb!.raict!.framesRemaining} → ${m[m.length - 1].frame.uwb!.raict!.framesRemaining}`)
    }
    expect(l.expect).toContain(`每一轮仍是 ${PLAN.slots} 个时隙`)
  })

  it('lab 3: the over-long request is never granted, and nothing changes', () => {
    const l = lab('请求超过轮长：不批准')
    const rs = recs(1)
    const rq = reqRecs(rs)
    expect(rq).toHaveLength(BLOCKS)
    for (const r of rq) expect([r.requestedSlots, r.grantedSlots]).toEqual([OVER_REQUEST, null])
    expect(txRcm(rs).map((r) => r.frame.bytes)).toEqual(Array(BLOCKS).fill(BYTES.rcm))
    for (let b = 0; b < BLOCKS; b++) expect(msgFrames(rs, b)).toHaveLength(FIRST_FRAMES)
    expect(l.expect).toContain(`请求 ${OVER_REQUEST} 个`)
    expect(l.expect).toContain(`${BYTES.rcm} 字节、指定 ${SLOTS.window} 个时隙`)
  })

  it('lab 4: contention — the RCPS phase is the same width before and after, the message grows', () => {
    const l = lab('竞争式：阶段宽度不变，消息仍然变长')
    const rs = recs(0)
    const rcms = txRcm(rs)
    for (const r of rcms.slice(0, 2)) {
      expect(r.frame.uwb?.contention).toMatchObject({ firstSlot: 1, lastSlot: SLOTS.contendWindow, phase: 0 })
      expect(r.frame.bytes).toBe(uwbAncillaryRcmBytes('contention', SLOTS.contendWindow))
    }
    expect(SLOTS.contendWindowGranted).toBe(SLOTS.contendWindow)
    expect([msgFrames(rs, 0).length, msgFrames(rs, 1).length]).toEqual([FIRST_FRAMES, REQUEST])
    expect(new Set(ofType(rs, 'UWB_ROUND').map((r) => r.slots))).toEqual(new Set([SLOTS.contendRound]))
    expect(l.expect).toContain(`每一轮 ${SLOTS.contendRound} 个时隙`)
    expect(l.expect).toContain(`控制消息都是 ${rcms[0].frame.bytes} 字节`)
  })

  it('lab 5: with the request off the RCM assigns FIRST_FRAMES slots, and the ranges are unchanged', () => {
    const l = lab('关闭请求，测距结果不变')
    const rs = recs(2)
    for (const r of txRcm(rs)) {
      expect(r.frame.uwb!.rdm!.length).toBe(SLOTS.off)
      expect(r.frame.bytes).toBe(BYTES.rcmOff)
    }
    expect(SLOTS.off).toBe(FIRST_FRAMES)
    expect(txAnc(rs).some((r) => r.frame.uwb?.raict?.request === true)).toBe(false)
    expect(stripSeq(rs)).toEqual(stripSeq(recs()))
    expect(l.expect).toContain(`只指定 ${SLOTS.off} 个时隙（${BYTES.rcmOff} 字节）`)
  })
})
