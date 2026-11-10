/**
 * `@uwb-ancillary`, in the standard-first shape (2026-11-10).
 *
 * ① is checked for the clauses it cites; ② row by row against what the engine does; ③ by reading
 * every figure the labs print back out of the lesson text and comparing it with a run, so editing a
 * number in the lesson without the engine agreeing turns this red, and so does an engine change that
 * moves a number the lesson still prints.
 *
 * Until 2026-11-10 this lesson carried an `until` to `uwb-ancillary-request` in its `limits`; the
 * standard-first shape has no `limits`, and the Request = 1 half is now pointed at from ① and ② (the
 * ledger row in tests/course/limits.test.ts went with it). The ruler stays here: this lesson's four
 * scenes never set the request, and the target's base scene does.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, BYTES, CONTEND_STARTS, FRAMES, IE, MS, NS, PLACES, SENDER_ID, SLOTS, TAG, TAG_ID, VALIDITY,
  idOf, ms, uwbAncillary, uwbAncillaryOffScenario, uwbAncillaryScenario,
} from '../../src/course/uwb/uwb-ancillary'
import { uwbAncillaryRequest } from '../../src/course/uwb/uwb-ancillary-request'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'
import { ANCILLARY_SENDER_INDEX } from '../../src/uwb/device.ancillary'
import { UWB_MHR_BYTES, raictIeBytes, uwbAncillaryBytes, uwbAncillaryRcmBytes, uwbPpduNs } from '../../src/uwb/phy'
import { ancillarySlots, roundPlan, roundsPerInitiator } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS_NS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth. */
const RUN_NS = 1300 * MS_NS
const BLOCKS = 7
lessonShapeSuite(uwbAncillary, { runNs: RUN_NS })

const PLAN = roundPlan(uwbAncillaryScenario().uwb!, ANCHORS)
const recs = (variant?: number): TLRecord[] => runOf(uwbAncillary, variant, RUN_NS)
const txAnc = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbAncillary')
const txRcm = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbRcm')

const lab = (heading: string): Lab => {
  const l = uwbAncillary.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbAncillary.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbAncillary.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''} ${'rows' in b ? b.rows.flat().join(' ') : ''}`).join(' ')

describe('uwb-ancillary · the lesson', () => {
  it('is in the standard-first shape, in the ancillary-information module, on the published standard', () => {
    expect(isStandardFirst(uwbAncillary)).toBe(true)
    expect(MODULES[uwbAncillary.module].title).toBe('测距辅助信息')
    expect(basisOf(uwbAncillary.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbAncillary.limits).toEqual([])
    expect(uwbAncillary.observe).toEqual([])
    expect(uwbAncillary.tryThis).toEqual([])
    expect(uwbAncillary.sources!.join('\n')).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+/)
  })

  it('cites each clause it teaches in ①, and puts no simulator behaviour there', () => {
    const std = stdText()
    for (const c of ['§10.35.1', '§10.35.2.1', '图 10-271', '§10.32.9.1', '表 10-164', '§10.32.9.8', '§10.32.9.5', '表 10-170', '§10.32.3.3']) {
      expect(std, c).toContain(c)
    }
    expect(std).not.toContain('本仿真器')
    expect(std).not.toContain('本课')
    // Figure 10-271: two control bits, no presence bit for Frames Remaining, no message type field
    expect(std).toContain('剩余帧数字段没有存在位')
    expect(std).toContain('图 10-271 里没有类型字段')
  })

  it('② is not all faithful, and names what is not implemented', () => {
    const kinds = new Set(uwbAncillary.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'value', 'choice', 'absent'] as const) expect(kinds.has(k), k).toBe(true)
    expect(implRow('重传').kind).toBe('absent')
  })
})

describe('uwb-ancillary · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('辅助信息轮: an RCM with ARC (usage 3, validity 1), RR and RDM in slot 0 of its own round', () => {
    const rcms = txRcm(rs)
    expect(rcms).toHaveLength(BLOCKS)
    for (const r of rcms) {
      expect(r.node).toBe(TAG_ID)
      expect(r.frame.uwb?.ies).toEqual(['ARC', 'RR', 'RDM'])
      expect(r.frame.uwb?.arc?.roundUsage).toBe(3)
      expect(r.frame.uwb?.arc?.validityRounds).toBe(1)
      expect(r.frame.uwb?.round).toBe(SLOTS.ancRound)
      expect(r.frame.uwb?.slot).toBe(0)
      expect(r.frame.bytes).toBe(BYTES.rcm)
    }
    expect(implRow('辅助信息轮').sim).toContain(`${BYTES.rcm} 字节`)
    // and the ranging round's poll says usage 1 (SS-TWR)
    const poll = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    expect(poll.frame.uwb?.arc?.roundUsage).toBe(1)
  })

  it('位置与数目 / 轮长: one ancillary round per block after the ranging round, rounds of one length', () => {
    expect(SLOTS.ancRound).toBe(1)
    expect(roundsPerInitiator(PLAN)).toBe(2)
    expect(SLOTS.used).toBe(2 * SLOTS.round)
    expect(SLOTS.ranging).toBe(PLAN.rangingSlots)
    expect(implRow('轮长').sim).toContain(`每一轮 ${SLOTS.round} 个时隙`)
    expect(new Set(txAnc(rs).map((r) => r.frame.uwb?.round))).toEqual(new Set([SLOTS.ancRound]))
  })

  it('时隙分配: the RDM IE lists one element per assigned slot, slots 1…FRAMES, to the sender', () => {
    for (const r of txRcm(rs)) {
      const rdm = r.frame.uwb?.rdm ?? []
      expect(rdm).toHaveLength(FRAMES)
    }
    expect(SLOTS.window).toBe(ancillarySlots(PLAN))
    expect(SLOTS.window).toBe(FRAMES)
    expect(BYTES.rcm).toBe(uwbAncillaryRcmBytes('time', FRAMES))
    expect(implRow('时隙分配').sim).toContain(`共 ${FRAMES} 个元素`)
  })

  it('由哪台设备发送: always responder 0, received by the tag', () => {
    expect(SENDER_ID).toBe(idOf(ANCILLARY_SENDER_INDEX))
    expect(new Set(txAnc(rs).map((r) => r.node))).toEqual(new Set([SENDER_ID]))
    expect(new Set(ofType(rs, 'UWB_ANCILLARY').map((r) => `${r.node}<-${r.peer}`))).toEqual(new Set([`${TAG_ID}<-${SENDER_ID}`]))
  })

  it('RAICT 的格式 / 消息类型 / 消息编号: Figure 10-271, no type, block mod 256', () => {
    for (const r of txAnc(rs)) {
      expect(r.frame.uwb?.ies).toEqual(['RAICT'])
      expect(r.frame.bytes).toBe(BYTES.frame)
      expect(r.frame.uwb?.raict?.messageNumber).toBe((r.frame.uwb?.block ?? -1) % 256)
    }
    for (const r of ofType(rs, 'UWB_ANCILLARY')) expect('messageKind' in r).toBe(false)
    expect(BYTES.ieFull).toBe(raictIeBytes(true, true))
    expect(implRow('RAICT 的格式').sim).toContain(`信息单元 ${BYTES.ieFull} 字节`)
  })

  it('帧头: the frame is MHR + RAICT + FCS, and its airtime is the one ② prints', () => {
    expect(BYTES.mhr).toBe(UWB_MHR_BYTES)
    expect(BYTES.frame).toBe(BYTES.mhr + BYTES.ieFull + BYTES.fcs)
    expect(NS.frame).toBe(uwbPpduNs(BYTES.frame))
    expect(txAnc(rs)[0].frame.txTimeNs).toBe(NS.frame)
    expect(implRow('帧头（MAC header）').sim).toContain(`${ms(NS.frame)} ms`)
  })

  it('重传: absent — no frame is ever sent twice, and no request goes back to the sender', () => {
    const sent = txAnc(rs).map((r) => `${r.frame.uwb?.block}/${r.frame.uwb?.raict?.framesRemaining}`)
    expect(new Set(sent).size).toBe(sent.length)
    expect(sent).toHaveLength(BLOCKS * FRAMES)
  })
})

describe('uwb-ancillary · ③ every figure the labs print is the run', () => {
  it('lab 1: block 0\'s ancillary round, slot for slot', () => {
    const l = lab('测距轮之后的辅助信息轮')
    const rows = tableOf(l, '块 0 的辅助信息轮').rows
    const rs = recs()
    const block0 = ofType(rs, 'TX_START').filter((r) => r.frame.uwb?.block === 0 && r.frame.uwb?.round === SLOTS.ancRound)
    expect(block0.map((r) => [String(r.frame.uwb?.slot), r.node, String(r.frame.bytes),
      r.frame.uwb?.raict?.framesRemaining === undefined ? '—' : String(r.frame.uwb.raict.framesRemaining)]))
      .toEqual(rows.map((r) => [r[0], r[1], r[3], r[4]]))
    expect(rows[0][2]).toContain(block0[0].frame.uwb!.ies!.join('、'))
    // the expect line: the ranging round's length, the RCM, the countdown, and no timeout
    const ranging0 = ofType(rs, 'TX_START').filter((r) => r.frame.uwb?.block === 0 && r.frame.uwb?.round === 0)
    expect(ranging0).toHaveLength(SLOTS.ranging)
    expect(l.expect).toContain(`${SLOTS.ranging} 个时隙的测距轮`)
    expect(l.expect).toContain(`${BYTES.rcm} 字节控制消息`)
    const cd = block0.slice(1).map((r) => r.frame.uwb?.raict?.framesRemaining).join('、')
    expect(l.expect).toContain(`剩余帧数依次为 ${cd}`)
    expect(ofType(rs, 'UWB_TIMEOUT')).toEqual([])
  })

  it('lab 2: four combinations, three lengths, and the run sends the longest', () => {
    const l = lab('帧长由两个可选字段决定')
    const rows = tableOf(l, '四种组合，三种长度').rows
    for (const r of rows) {
      const n = r[0] === '带', f = r[1] === '带'
      expect(r[2]).toBe(`${raictIeBytes(n, f)} 字节`)
      expect(r[3]).toBe(`${uwbAncillaryBytes(n, f)} 字节`)
    }
    expect(new Set(rows.map((r) => r[3])).size).toBe(3)
    expect(uwbAncillaryBytes(true, false)).toBe(uwbAncillaryBytes(false, true))
    expect(new Set(txAnc(recs()).map((r) => r.frame.bytes))).toEqual(new Set([uwbAncillaryBytes(true, true)]))
    expect(l.expect).toContain(`整帧 ${IE.frame(true, true)} 字节`)
    expect(l.expect).toContain(`${IE.frame(true, false)} 字节`)
    expect(l.expect).toContain(`${IE.frame(false, false)} 字节`)
  })

  it('lab 3: the sender is anc-1, the records are the tag\'s, and the zero completes the message', () => {
    const l = lab('发送辅助信息的是测距中的应答方')
    const rs = recs()
    const block0 = ofType(rs, 'TX_START').filter((r) => r.frame.uwb?.block === 0 && r.frame.uwb?.round === SLOTS.ancRound)
    expect(block0.filter((r) => r.node === TAG_ID).map((r) => r.frame.kind)).toEqual(['uwbRcm'])
    const got = ofType(rs, 'UWB_ANCILLARY')
    expect(got).toHaveLength(BLOCKS * FRAMES)
    expect(got.filter((r) => r.complete).map((r) => r.framesRemaining)).toEqual(Array(BLOCKS).fill(0))
    expect(l.expect).toContain(`四帧都由 ${SENDER_ID} 发出`)
  })

  it('lab 4: the contention variant\'s RCM, round length and drawn start slots', () => {
    const l = lab('竞争式：起点由发送方选取')
    const rs = recs(0)
    const rcms = txRcm(rs)
    expect(rcms).toHaveLength(BLOCKS)
    for (const r of rcms) {
      expect(r.frame.uwb?.ies).toEqual(['ARC', 'RR', 'RCPS'])
      expect(r.frame.bytes).toBe(BYTES.rcmContend)
      expect(r.frame.uwb?.contention).toMatchObject({ firstSlot: 1, lastSlot: SLOTS.contendWindow, phase: 0 })
    }
    const starts: number[] = []
    for (let b = 0; b < BLOCKS; b++) {
      const fs = txAnc(rs).filter((r) => r.frame.uwb?.block === b).map((r) => r.frame.uwb!.slot!)
      expect(fs, `block ${b}`).toHaveLength(FRAMES)
      expect(fs, `block ${b} contiguous`).toEqual(fs.map((_s, i) => fs[0] + i))
      starts.push(fs[0])
    }
    expect(starts).toEqual([...CONTEND_STARTS])
    expect(tableOf(l, '七个块的起点').rows[0].slice(1)).toEqual(starts.map(String))
    expect(roundPlan(uwbAncillaryScenario({ schedule: 'contention' }).uwb!, ANCHORS).slots).toBe(SLOTS.contendRound)
    expect(l.expect).toContain(`每一轮变为 ${SLOTS.contendRound} 个时隙`)
    expect(l.expect).toContain(`控制消息为 ${BYTES.rcmContend} 字节`)
    expect(l.expect).toContain(`第 1 到第 ${SLOTS.contendWindow} 个时隙`)
  })

  it(`lab 5: one control message for ${VALIDITY} ranging rounds, and the ancillary round has its own`, () => {
    const rs = recs(1)
    const b0 = ofType(rs, 'TX_START').filter((r) => r.frame.uwb?.block === 0 && r.node === TAG_ID)
    const openers = b0.filter((r) => r.frame.uwb?.slot === 0)
    expect(openers.map((r) => r.frame.kind)).toEqual(['uwbPoll', ...Array(VALIDITY - 1).fill('uwbInit'), 'uwbRcm'])
    expect(openers[0].frame.uwb?.arc?.validityRounds).toBe(VALIDITY)
    const rcm = openers[VALIDITY]
    expect(rcm.frame.uwb?.round).toBe(VALIDITY)
    expect(rcm.frame.uwb?.arc).toMatchObject({ roundUsage: 3, validityRounds: 1 })
    const frames = txAnc(rs).filter((r) => r.frame.uwb?.block === 0)
    expect(frames.map((r) => [r.frame.uwb?.round, r.frame.uwb?.slot]))
      .toEqual(Array.from({ length: FRAMES }, (_v, i) => [VALIDITY, SLOTS.firstSlot + i]))
  })
})

describe('uwb-ancillary · the scenes', () => {
  it(`is ${ANCHORS} anchors and one tag in the 22 × 8 m hall, the exchange off in the last variant`, () => {
    const sc = uwbAncillaryScenario()
    expect(sc.nodes.map((n) => n.id)).toEqual([...PLACES.map((_p, i) => idOf(i)), TAG_ID])
    expect([sc.nodes[ANCHORS].pos.x, sc.nodes[ANCHORS].pos.y]).toEqual([TAG.x, TAG.y])
    expect(sc.uwb).toMatchObject({ ancillary: true, ancillaryFrames: FRAMES, method: 'ss', schedule: 'time', nlos: false })
    expect(MS.slot).toBe(PLAN.slotNs / 1e6)
    expect(txAnc(runOf(uwbAncillary, 2, RUN_NS))).toEqual([])
    expect(uwbAncillaryOffScenario().uwb!.ancillary).toBe(false)
  })

  // The ruler the old `until` to uwb-ancillary-request left behind: this lesson's scenes never ask the
  // controller for slots; the target's base scene does.
  it('sets the request in none of its scenes, while uwb-ancillary-request sets it', () => {
    for (const sc of [uwbAncillary.scenario(), ...(uwbAncillary.variants ?? []).map((v) => v.scenario())]) {
      expect(sc.uwb!.ancillaryRequest).toBe(false)
    }
    expect(uwbAncillaryRequest.scenario().uwb!.ancillaryRequest).toBe(true)
  })
})
