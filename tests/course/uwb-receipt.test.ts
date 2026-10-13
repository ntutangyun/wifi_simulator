/**
 * Every empirical claim in 「谁听见了我」, measured against runs.
 *
 * The lesson prints a 21-octet frame with two list entries and an 18-octet one with a single
 * four-bit entry, two opener lengths that the request does not change, a slot count per responder,
 * a ranging-record count that is identical with the request on and off, and the two bits of one
 * many-to-many frame. Every one of them is read back out of a simulation or recomputed from the
 * engine's own exports — nothing here is a number typed twice.
 *
 * **The scene claims are asserted before the numbers that depend on them.** The base scene only
 * teaches anything if `p-3` really is unheard while hearing everybody, so that is checked off the
 * run's own `RX_OK` records first; a bitmap of all ones or all zeros would match an implementation
 * that ignored the receptions entirely.
 *
 * One run the lesson's own scenarios cannot provide is built here: the five-block two-way span, because
 * `uwb-record-hashes` runs seven blocks while the window the lesson talks about is four, and the
 * fifth block is where the reader sees the window turn over.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, BITS, BLOCKS, BYTES, CAP, ENTRY_BYTES, LIST, M2M, M2M_ENTRIES, PARTICIPANTS, PLACES,
  QUIET_DB, QUIET_ID, RCM_BYTES, INIT_BYTES, SLOTS, TWR, TWR_ENTRIES, VALIDITY, idOf,
  uwbReceipt, uwbReceiptFields, uwbReceiptScenario, uwbReceiptTwrScenario,
} from '../../src/course/uwb/uwb-receipt'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MODULES, basisOf } from '../../src/course/curriculum'
import { diagramTexts } from '../../src/course/diagram'
import {
  RMMRC_ADDR_BYTES, RMMRC_FIXED_BYTES, UWB_FCS_BYTES, UWB_MHR_BYTES, UWB_TX_POWER_DBM,
  rmmrcBitmapBytes, rmmrcEntryBytes, uwbInitBytes, uwbMaxMmrcmInitiators, uwbMmrcmBytes,
  uwbMmrcmSlots, uwbPollBytes,
} from '../../src/uwb/phy'
import { mmrcmResponders, roundPlan } from '../../src/uwb/session'
import { uwbRcmValidity } from '../../src/course/uwb/uwb-rcm-validity'
import { uwbAncillary } from '../../src/course/uwb/uwb-ancillary'
import { uwbAncillaryRequest } from '../../src/course/uwb/uwb-ancillary-request'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS
/** One block, read off the plan rather than retyped. */
const BLOCK_NS = roundPlan(uwbReceiptScenario().uwb!, PARTICIPANTS).blockNs
/** One many-to-many block: in that mode every block is its own validity window. */
const ONE_BLOCK = BLOCK_NS - MS
/** Four blocks of a two-way window plus the one that opens the next (design §3.3). */
const TWR_NS = BLOCKS * BLOCK_NS - MS

lessonShapeSuite(uwbReceipt, { runNs: RUN_NS })

const run = (sc: Scenario, ns: number): TLRecord[] => {
  expect(() => ScenarioSchema.parse(sc)).not.toThrow()
  return [...new Simulation(sc).runUntil(ns).records]
}

/** Every confirmation frame the air carried, with its list as the frame built it. */
const sent = (rs: TLRecord[]): {
  node: string; dst: string; bytes: number; block: number; slot: number; ies: string[]
  list: { initiator: string; bits: string }[]
}[] =>
  ofType(rs, 'TX_START')
    .filter((r) => r.frame.kind === 'uwbMmrcm')
    .map((r) => ({
      node: r.node, dst: r.frame.dst, bytes: r.frame.bytes,
      block: r.frame.uwb?.block ?? -1, slot: r.frame.uwb?.slot ?? -1,
      ies: [...(r.frame.uwb?.ies ?? [])],
      list: (r.frame.uwb?.mmrc ?? []).map((e) => ({
        initiator: e.initiator, bits: e.received.map((b) => (b ? '1' : '0')).join(''),
      })),
    }))

/** Which of `from`'s transmissions `node` actually decoded — the referee, off the medium's own
 * `RX_OK` records rather than off the implementation's state or the positions the scene set. */
const decoded = (rs: TLRecord[], node: string, from: string): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === node && r.from === from).length

describe('uwb-receipt · where it sits in the course', () => {
  it('is the receipt-confirmation lesson of its own module, checked against the published standard alone', () => {
    expect(MODULES[uwbReceipt.module].title).toBe('多消息收妥确认')
    expect(MODULES[uwbReceipt.module].tier).toBe(5)
    // 「本课完全不依赖任何草案」: the module inherits the published revision from its tier and
    // declares nothing of its own, so the two can never drift apart.
    expect(MODULES[uwbReceipt.module].basis).toBeUndefined()
    expect(basisOf(uwbReceipt.module)).toEqual(['ieee-802-15-4-2024'])
    // it follows both lessons it builds on: the question comes from one and the window from the other
    expect(uwbReceipt.needs).toEqual(['uwb-m2m', 'uwb-rcm-validity'])
    const src = uwbReceipt.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
    // the two clauses the lesson rests on, and the figure the standard draws for one of them
    expect(src).toContain('§10.36')
    expect(src).toContain('§10.32.9.1')
    expect(src).toContain('Figure 10-272')
  })

  it('declares five limits, each about something this engine does not do', () => {
    expect(uwbReceipt.limits).toHaveLength(5)
    expect(uwbReceipt.limits.map((l) => l.kind))
      .toEqual(['model-value', 'unmodelled', 'out-of-scope', 'out-of-scope', 'model-value'])
    const text = uwbReceipt.limits.map((l) => l.text).join('\n')
    // the window is this simulator's choice, and the limit names the two functions that make it so
    expect(text).toContain('rmmrcBitmapBytes')
    expect(text).toContain('receiptIn')
    // the short address is the only one built, though the standard allows two sizes
    expect(text).toContain('RMMRC_ADDR_BYTES')
    expect(text).toContain('Address Size')
    // no multicast downlink: one frame per responder, addressed by the mode's own rule
    expect(text).toContain('onMmrcmSlot')
    // §10.35 is a separate slice, and the reason is the scheduling structure, NOT lack of evidence
    expect(text).toContain('§10.35')
    expect(text).toContain('RAICT')
    expect(text).toContain('roundPlan')
    expect(text).toContain('举证不足')
    expect(text).toContain('排程能不能被请求改变')
    // …and §10.35's Request = 0 half IS built now (`@uwb-ancillary`: one message segmented across
    // several frames, each carrying how many are left), so this limit says so rather than leaving
    // a false claim standing — the slice that falsifies a statement is the slice that updates it.
    // The cut itself is unchanged and still narrower than the clause: Request = 1 only, for scope
    // rather than for lack of evidence.
    expect(text).toContain('Request 置 0 的那一半')
    expect(text).toContain('@uwb-ancillary')
    expect(text).toContain('没建的是 Request 置 1 的那一半')
    // the phrasing that is now false, in both spellings this repo has used for it
    expect(text).not.toContain('§10.35 的测距辅助信息还没建')
    expect(text).not.toContain('§10.35 的辅助信息交换还没建')
    // the honest limitation: neither mode exercises both dimensions of the IE
    expect(text).toContain('rcmValidityRounds')
    // the banned sentence, in both spellings
    expect(text).not.toContain('有简化')
    expect(text).not.toContain('简化之处')
  })
})

describe('uwb-receipt · the base scene really is what the lesson says', () => {
  const rs = run(uwbReceiptScenario(), ONE_BLOCK)

  it(`builds the scene it claims to: ${QUIET_ID} hears everybody and nobody hears it`, () => {
    // Asserted first, because every bit below is only worth reading if this holds.
    expect(decoded(rs, idOf(0), QUIET_ID), `${idOf(0)} ← ${QUIET_ID}`).toBe(0)
    expect(decoded(rs, idOf(1), QUIET_ID), `${idOf(1)} ← ${QUIET_ID}`).toBe(0)
    for (const from of [idOf(0), idOf(1)]) {
      expect(decoded(rs, QUIET_ID, from), `${QUIET_ID} ← ${from}`).toBeGreaterThan(0)
    }
    // …and the one lever that makes it so is the transmit power, not a wall: the hall has no
    // partition in it, so nothing else in the scene is selective.
    const nodes = uwbReceiptScenario().nodes
    expect(nodes.find((n) => n.id === QUIET_ID)!.txPowerDbm).toBe(UWB_TX_POWER_DBM - QUIET_DB)
    for (const id of [idOf(0), idOf(1)]) {
      expect(nodes.find((n) => n.id === id)!.txPowerDbm).toBe(UWB_TX_POWER_DBM)
    }
    expect(PLACES).toHaveLength(PARTICIPANTS)
  })

  it(`「${SLOTS.m2mRound} 次发送之后，多出 ${SLOTS.m2mExtra} 个时隙」, one per responder`, () => {
    const plan = roundPlan(uwbReceiptScenario().uwb!, PARTICIPANTS)
    expect(SLOTS.m2mRound).toBe(plan.slots)
    expect(SLOTS.m2mRound).toBe(PARTICIPANTS)
    // one slot per RESPONDER, which in this mode is every participant (design §6.1)
    expect(SLOTS.m2mExtra).toBe(mmrcmResponders(plan))
    expect(SLOTS.m2mExtra).toBe(uwbMmrcmSlots('m2m', PARTICIPANTS, true))
    expect(SLOTS.m2mExtra).toBe(PARTICIPANTS)
    expect(SLOTS.off).toBe(0)
    // off the air: the confirmations sit in the slots after the round, one each
    const frames = sent(rs)
    expect(frames.map((f) => f.slot)).toEqual([SLOTS.m2mRound, SLOTS.m2mRound + 1, SLOTS.m2mRound + 2])
    expect(frames.map((f) => f.node)).toEqual([idOf(0), idOf(1), idOf(2)])
    expect(frames).toHaveLength(M2M.frames)
  })

  it(`「每帧 ${BYTES.m2m} 字节」, with ${M2M_ENTRIES} entries and one bit each`, () => {
    for (const f of sent(rs)) {
      expect(f.bytes, f.node).toBe(BYTES.m2m)
      expect(f.bytes, f.node).toBe(uwbMmrcmBytes(M2M_ENTRIES, 1))
      expect(f.bytes, f.node).toBe(21)
      expect(f.ies, f.node).toEqual(['RMMRC'])
      expect(f.list.length, f.node).toBe(M2M_ENTRIES)
      for (const e of f.list) expect(e.bits.length, `${f.node} → ${e.initiator}`).toBe(BITS.m2m)
    }
    expect(BITS.m2m).toBe(1)
    expect(M2M_ENTRIES).toBe(PARTICIPANTS - 1)
    // 「每个发起方一帧」 would need this many frames, and the round has `SLOTS.m2mExtra` slots
    expect(PARTICIPANTS * M2M_ENTRIES).toBe(6)
    expect(PARTICIPANTS * M2M_ENTRIES).toBeGreaterThan(SLOTS.m2mExtra)
  })

  it('「两个条目一个是 1、一个是 0」: one frame, two entries, two different answers', () => {
    const mine = sent(rs).find((f) => f.node === M2M.frameFrom)
    expect(mine, M2M.frameFrom).toBeDefined()
    expect(mine!.list).toEqual([
      { initiator: idOf(1), bits: '1' },
      { initiator: QUIET_ID, bits: '0' },
    ])
    // …and the bits are the receiver's own experience, compared against the medium's records
    for (const e of mine!.list) {
      expect(e.bits === '1', `${M2M.frameFrom} ← ${e.initiator}`)
        .toBe(decoded(rs, M2M.frameFrom, e.initiator) > 0)
    }
  })

  it(`「${QUIET_ID} 从另外两帧里各读到一个 0」, which no other frame in this mode ever tells it`, () => {
    const atQuiet = ofType(rs, 'UWB_MMRCM').filter((r) => r.node === QUIET_ID)
    expect(atQuiet.map((r) => r.peer).sort()).toEqual([idOf(0), idOf(1)])
    for (const r of atQuiet) expect(r.received, r.peer).toEqual([false])
    // its own frame went out and reached nobody, so only four of the nine answers land
    expect(sent(rs).some((f) => f.node === QUIET_ID)).toBe(true)
    expect(ofType(rs, 'UWB_MMRCM')).toHaveLength(M2M.confirmations)
    expect(M2M.confirmations).toBe(4)
    // the opposite bit, from the same mechanism, in the other direction
    const atFirst = ofType(rs, 'UWB_MMRCM').filter((r) => r.node === idOf(0))
    expect(atFirst.map((r) => [r.peer, r.received])).toEqual([[idOf(1), [true]]])
  })

  it(`「整块只有 ${M2M.ranges} 条测距行，不是 ${M2M.pairs} 条」`, () => {
    expect(ofType(rs, 'UWB_RANGE')).toHaveLength(M2M.ranges)
    expect(M2M.pairs).toBe((PARTICIPANTS * (PARTICIPANTS - 1)) / 2)
    // with everybody at full power the same round measures all three pairs and every bit is 1,
    // which is what says the missing two and the zero bits above are the same fact
    const open = run(uwbReceiptScenario(true, false), ONE_BLOCK)
    expect(ofType(open, 'UWB_RANGE')).toHaveLength(M2M.pairs)
    for (const r of ofType(open, 'UWB_MMRCM')) expect(r.received, r.peer).toEqual([true])
    expect(ofType(open, 'UWB_MMRCM')).toHaveLength(PARTICIPANTS * M2M_ENTRIES)
  })
})

describe('uwb-receipt · asking is free, answering costs a frame', () => {
  const on = run(uwbReceiptTwrScenario(true), TWR_NS)
  const off = run(uwbReceiptTwrScenario(false), TWR_NS)

  /** The frame the tag opened each block with, as the air carried it. */
  const openers = (rs: TLRecord[]): { block: number; kind: string; bytes: number; ies: string[] }[] =>
    ofType(rs, 'TX_START')
      .filter((r) => r.node === 'uwb-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
      .map((r) => ({
        block: r.frame.uwb?.block ?? -1, kind: r.frame.kind, bytes: r.frame.bytes,
        ies: [...(r.frame.uwb?.ies ?? [])],
      }))

  it(`「第一块 ${RCM_BYTES} 字节、其余各块 ${INIT_BYTES} 字节」, the same either way, IE for IE`, () => {
    expect(openers(off).map((o) => o.block)).toEqual([0, 1, 2, 3, 4])
    expect(openers(off).map((o) => o.bytes)).toEqual([RCM_BYTES, INIT_BYTES, INIT_BYTES, INIT_BYTES, RCM_BYTES])
    expect(openers(off).map((o) => o.bytes)).toEqual([36, 14, 14, 14, 36])
    expect(RCM_BYTES).toBe(uwbPollBytes(ANCHORS))
    expect(INIT_BYTES).toBe(uwbInitBytes())
    // the request is a bit of a word the ARC IE already carries, so the frame does not grow
    expect(openers(on)).toEqual(openers(off))
    expect(openers(on)[0].ies).toEqual(['ARC', 'RDM', 'RRMC'])
  })

  it(`「${TWR.confirmations} 帧，各 ${BYTES.twr} 字节」, from the window-closing block only`, () => {
    const frames = sent(on)
    expect(frames.map((f) => f.node)).toEqual(['anchor-1', 'anchor-2', 'anchor-3'])
    expect(frames).toHaveLength(TWR.confirmations)
    expect(TWR.confirmations).toBe(ANCHORS)
    for (const f of frames) {
      expect(f.bytes, f.node).toBe(BYTES.twr)
      expect(f.bytes, f.node).toBe(uwbMmrcmBytes(TWR_ENTRIES, VALIDITY))
      expect(f.bytes, f.node).toBe(18)
      expect(f.block, f.node).toBe(TWR.block)
      expect(f.block, f.node).toBe(VALIDITY - 1)
      // one entry — the round's single initiator — and it is addressed to it, not multicast
      expect(f.list.map((e) => e.initiator), f.node).toEqual(['uwb-1'])
      expect(f.list[0].bits, f.node).toBe('1'.repeat(BITS.twr))
      expect(f.dst, f.node).toBe('uwb-1')
    }
    expect(BITS.twr).toBe(VALIDITY)
    expect(TWR_ENTRIES).toBe(1)
    expect(sent(off)).toHaveLength(0)
    expect(ofType(off, 'UWB_MMRCM')).toHaveLength(0)
  })

  it(`「轮走完之后多出 ${SLOTS.twrExtra} 个时隙」, and only on the window-closing block`, () => {
    const plan = roundPlan(uwbReceiptTwrScenario(true).uwb!, ANCHORS)
    expect(SLOTS.twrRound).toBe(plan.slots)
    expect(SLOTS.twrExtra).toBe(mmrcmResponders(plan))
    expect(SLOTS.twrExtra).toBe(ANCHORS)
    const perBlock = (rs: TLRecord[]): number[] => {
      const high = new Map<number, number>()
      let block = 0
      for (const r of rs) {
        if (r.type === 'UWB_ROUND' && r.node === 'uwb-1') block = r.block
        if (r.type === 'UWB_SLOT' && r.node === 'uwb-1') {
          high.set(block, Math.max(high.get(block) ?? 0, r.slot))
        }
      }
      return Array.from({ length: BLOCKS }, (_v, b) => (high.get(b) ?? -1) + 1)
    }
    expect(perBlock(off)).toEqual(Array(BLOCKS).fill(SLOTS.twrRound))
    expect(perBlock(on)).toEqual([
      SLOTS.twrRound, SLOTS.twrRound, SLOTS.twrRound,
      SLOTS.twrRound + SLOTS.twrExtra, SLOTS.twrRound,
    ])
  })

  it(`「${TWR.ranges} 条测距结果逐字段相同」: the answer is not part of the measurement`, () => {
    // `seq` is a position in the record stream rather than a field of the measurement; `t` is
    // kept, because an MMRCM takes no ranging counter and no random draw, so it must not move a
    // single instant of the ranging that came before it.
    const ranges = (rs: TLRecord[]): unknown[] =>
      ofType(rs, 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    expect(ranges(off)).toHaveLength(TWR.ranges)
    expect(TWR.ranges).toBe(2 * ANCHORS * BLOCKS)
    expect(TWR.ranges).toBe(30)
    expect(ranges(on)).toEqual(ranges(off))
    expect(ofType(on, 'UWB_TIMEOUT')).toHaveLength(0)
  })
})

describe('uwb-receipt · the frame-length law, and the figure of it', () => {
  it('「15 + 3N」: the fixed part, one entry per initiator, and the cap', () => {
    expect(uwbMmrcmBytes(0, VALIDITY)).toBe(UWB_MHR_BYTES + RMMRC_FIXED_BYTES + UWB_FCS_BYTES)
    expect(uwbMmrcmBytes(0, VALIDITY)).toBe(15)
    expect(ENTRY_BYTES.twr).toBe(rmmrcEntryBytes(VALIDITY))
    expect(ENTRY_BYTES.twr).toBe(RMMRC_ADDR_BYTES + rmmrcBitmapBytes(VALIDITY))
    expect(ENTRY_BYTES.twr).toBe(3)
    expect(ENTRY_BYTES.m2m).toBe(3)
    for (const n of LIST) expect(uwbMmrcmBytes(n, VALIDITY), `N=${n}`).toBe(15 + 3 * n)
    expect(LIST.map((n) => uwbMmrcmBytes(n, VALIDITY))).toEqual([18, 21, 24, 33])
    // the cap is searched against the frame-size function, never typed
    expect(CAP).toBe(uwbMaxMmrcmInitiators(VALIDITY))
    expect(CAP).toBe(37)
    expect(BITS.octets).toBe(rmmrcBitmapBytes(VALIDITY))
    expect(BITS.octets).toBe(1)
  })

  it(`draws the base scene's own frame, ${BYTES.m2m} octets, with one box per entry`, () => {
    const fig = uwbReceiptFields()
    expect(fig.unit).toBe('B')
    expect(fig.fields.reduce((n, f) => n + f.size, 0)).toBe(BYTES.m2m)
    // one box per list entry, because that count is the first thing §10.36 has two of
    expect(fig.fields.filter((f) => f.label.startsWith('条目'))).toHaveLength(M2M_ENTRIES)
    expect(fig.fields.filter((f) => f.label.startsWith('条目')).map((f) => f.size))
      .toEqual(Array(M2M_ENTRIES).fill(ENTRY_BYTES.m2m))
    expect(fig.fields[0].size).toBe(UWB_MHR_BYTES)
    expect(fig.fields[fig.fields.length - 1].size).toBe(UWB_FCS_BYTES)
    // every label is text a reader meets, which is what puts them in front of the term rule
    for (const s of diagramTexts(fig)) expect(s.trim().length, s).toBeGreaterThan(0)
  })
})

describe('uwb-receipt · the base run the fixture replays', () => {
  const rs = runOf(uwbReceipt, undefined, RUN_NS)

  it('confirms every block, because every block of this mode is its own window', () => {
    const blocks = [...new Set(sent(rs).map((f) => f.block))].sort((a, b) => a - b)
    expect(blocks).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(sent(rs)).toHaveLength(7 * M2M.frames)
    expect(ofType(rs, 'UWB_MMRCM')).toHaveLength(7 * M2M.confirmations)
    // and the two bits never change, because nothing in the scene moves
    for (const f of sent(rs).filter((x) => x.node === M2M.frameFrom)) {
      expect(f.list.map((e) => e.bits), `block ${f.block}`).toEqual(['1', '0'])
    }
  })

  it('every jump the lesson offers lands on the frame it names', () => {
    const first = ofType(rs, 'TX_START').filter(uwbReceipt.jumps[0].find)
    expect(first.length).toBeGreaterThan(0)
    expect(first[0].frame.kind).toBe('uwbMmrcm')
    expect(first[0].frame.bytes).toBe(BYTES.m2m)
    expect(first[0].node).toBe(M2M.frameFrom)
    const longest = ofType(rs, 'TX_START').filter(uwbReceipt.jumps[2].find)
    expect(longest.length).toBeGreaterThan(0)
    expect(longest[0].node).toBe(QUIET_ID)
    // it really is the round's longest transmission, and nobody decoded it
    const round = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbM2m' && r.frame.uwb?.block === 0)
    expect(Math.max(...round.map((r) => r.frame.bytes))).toBe(longest[0].frame.bytes)
    expect(decoded(rs, M2M.frameFrom, QUIET_ID)).toBe(0)
    const quiet = ofType(rs, 'TX_START').filter(uwbReceipt.jumps[3].find)
    expect(quiet.length).toBeGreaterThan(0)
    expect(quiet[0].frame.kind).toBe('uwbMmrcm')
    expect(quiet[0].node).toBe(QUIET_ID)
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Every byte count, slot count and frame count here is interpolated from this lesson's own module
 * and the file above measures those against runs. What is typed is the **bit** this clause turns
 * on, the convention a bitmap is read with, the widths `limits` names, and the figures `sources`
 * lists — and the sweep of 2026-10-14 could see several of them for the first time (「第 15 位」
 * used to count as a name).
 *
 * **The reads worth naming:**
 *
 *  - **the bit index is read against the field it sits beside.** 「ARC 信息单元控制字段里的第 15
 *    位」 is one past the six-bit validity field `@uwb-rcm-validity` reads bit for bit, so the two
 *    lessons' accounts of the same control word have to agree.
 *  - **「收到记 1」 and 「读出哪几位是 0」 are read as the bitmap the run really builds**, against
 *    the medium's own `RX_OK` records rather than against the implementation's state.
 *  - **「置 1 与不置 1 的控制消息字节数完全相同」 is read as the two prices**, which is the whole
 *    claim of this lesson's first table.
 */
describe('uwb-receipt · every figure the prose prints, read back out of it', () => {
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const TERMS = blockText(uwbReceipt.terms)
  const PIC = blockText(uwbReceipt.picture)
  const LIM = blockText(uwbReceipt.limits)
  const SRC = blockText(uwbReceipt.sources)
  const QUIZ = blockText(uwbReceipt.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    uwbReceipt.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]

  it('reads the bit this clause turns on, beside the field the lesson before it reads', () => {
    // 「ARC 信息单元控制字段里的第 15 位：置 1 就是请求对方回一次收妥确认」
    const bits = [...[TERMS, PIC, SRC].join('\n').matchAll(/第 (\d+) 位/g)].map((m) => val(m[1]!))
    expect(bits.length, 'the bit, named in the term, the step and the sources')
      .toBeGreaterThanOrEqual(3)
    expect(new Set(bits).size, 'and it is the same bit every time').toBe(1)
    /*
     * The validity field of `@uwb-rcm-validity` is the six bits below it, and that lesson reads
     * its own indices off its own `sources`. So the two accounts of one control word are read
     * against each other: this bit is the one immediately above that field.
     */
    const neighbour = uwbRcmValidity.sources!.join('\n')
    const [, upper] = figs(neighbour, /字段里的第 (\d+) 到 (\d+) 位/,
      'the neighbouring lesson on the validity field')
    expect(bits[0], 'immediately above the validity field').toBe(upper! + 1)
    // 「置 1 就是请求对方回一次收妥确认」, and `picture` says it again
    const [termSet] = figs(TERMS, /位：置 (\d) 就是请求对方回一次收妥确认/, 'the term on the value')
    const [picSet] = figs(PIC, /位置 (\d)。这一位和有效轮次那六位/, '`picture` on the same value')
    expect(picSet, 'set, both times').toBe(termSet)
    /*
     * A set bit is written as the figure a true flag encodes as — read that way rather than as
     * 「truthy」, because every figure above zero is truthy and only one of them is the bit.
     */
    expect(termSet, 'the figure a set flag is written as')
      .toBe(Number(uwbReceiptScenario(true).uwb!.mmrcr))
    expect(Number(uwbReceiptScenario(false).uwb!.mmrcr), 'and the quiet scene writes the other')
      .toBe(1 - termSet!)
  })

  it('reads the bitmap’s own convention against the medium’s records', () => {
    // 「窗口的第一条开场消息在最左，一位一条，收到记 1」
    const [got] = figs(TERMS, /一位一条，收到记 (\d)/, 'the term on the bitmap')
    /*
     * One block, because in this mode every block is its own validity window: the bitmap is one
     * bit wide, and that bit is 「收到记 1」 for the initiator the entry names. Read against the
     * medium's own `RX_OK` records, which is the referee the file above uses too.
     */
    const rs = run(uwbReceiptScenario(), ONE_BLOCK)
    const frames = sent(rs)
    expect(frames.length, 'the run really carries confirmations').toBeGreaterThan(0)
    expect(got, 'a received block is written as the figure a true flag encodes as').toBe(Number(true))
    for (const f of frames) {
      for (const e of f.list) {
        const ones = [...e.bits].filter((b) => b === String(got)).length
        expect(ones > 0, `${f.node} on ${e.initiator}: set exactly when it decoded that opener`)
          .toBe(decoded(rs, f.node, e.initiator) > 0)
      }
    }
    // 「从自己那个条目里读出哪几位是 0」 — the complement, on the same frames
    const [missed] = figs(PIC, /从自己那个条目里读出哪几位是 (\d)/, '`picture` on what a reader reads')
    expect(missed, 'the other value of the same bit').not.toBe(got)
    for (const f of frames) {
      for (const e of f.list) {
        const zeros = [...e.bits].filter((b) => b === String(missed)).length
        const ones = [...e.bits].filter((b) => b === String(got)).length
        expect(zeros + ones, `${f.node} on ${e.initiator}: every bit is one or the other`)
          .toBe(e.bits.length)
        expect(zeros > 0, `${f.node} on ${e.initiator}: a zero means it missed that opener`)
          .toBe(decoded(rs, f.node, e.initiator) === 0)
      }
    }
  })

  it('reads the first table: what the request costs and what the answer costs', () => {
    const tb = tables().find((x) => x.head[0] === '量什么')!
    const row = (needle: string): string[] => tb.rows.find((r) => r[0]!.includes(needle))!.slice(1)
    const on = run(uwbReceiptTwrScenario(true), TWR_NS)
    const off = run(uwbReceiptTwrScenario(false), TWR_NS)
    const openerOf = (rs: TLRecord[], kind: string): number => ofType(rs, 'TX_START')
      .filter((r) => r.frame.kind === kind)[0]!.frame.bytes
    // 「窗口第一块的开场消息」 and 「窗口其余各块的开场消息」 — the same price either way
    const [offFirst, onFirst] = row('窗口第一块的开场消息').map((c) => val(c.replace(' 字节', '')))
    expect(onFirst, 'the control message costs the same with the request on').toBe(offFirst)
    expect(openerOf(off, 'uwbPoll'), 'and that is what it really costs').toBe(offFirst)
    expect(openerOf(on, 'uwbPoll'), 'both ways').toBe(onFirst)
    const [offRest, onRest] = row('窗口其余各块的开场消息').map((c) => val(c.replace(' 字节', '')))
    expect([openerOf(off, 'uwbInit'), openerOf(on, 'uwbInit')], 'and so does the initiation message')
      .toEqual([offRest, onRest])
    // 「回来的 MMRCM」: none when the request is off, and this many when it is on
    const [offFrames] = row('回来的 MMRCM').map((c) => val(c.replace(' 帧', '')))
    expect(sent(off).length, 'no confirmation comes back unasked').toBe(offFrames)
    const [onFrames, onBytes] = figs(row('回来的 MMRCM')[1]!, /(\d+) 帧，各 (\d+) 字节/,
      'the row on what comes back')
    expect(sent(on).length, 'and this many when it is asked for').toBe(onFrames)
    for (const f of sent(on)) expect(f.bytes, 'each of that size').toBe(onBytes)
    // the quiz says the same thing about the request's price, twice
    const [q1, q2] = figs(QUIZ, /置 (\d) 与不置 (\d) 的控制消息字节数完全相同/,
      'the quiz on the request’s price')
    expect(q2, 'one bit, two mentions').toBe(q1)
    expect(openerOf(on, 'uwbPoll') - openerOf(off, 'uwbPoll'), 'and the prices really are equal')
      .toBe(0)
  })

  it('reads the two dimensions table, the figure’s own labels, and the borrowed request bit', () => {
    /*
     * 「两个维度，没有哪个场景同时撑开」 — a row per scene, and each row's two figures are read on
     * that scene's own run: how many entries a confirmation carries there, and how many bits each
     * entry's bitmap is.
     */
    const tb = tables().find((x) => x.head[0] === '场景')!
    for (const row of tb.rows) {
      const [scene, entries, width] = row as [string, string, string]
      const m2mRow = scene.includes('多对多')
      const rs = m2mRow ? run(uwbReceiptScenario(), ONE_BLOCK) : run(uwbReceiptTwrScenario(true), TWR_NS)
      const frames = sent(rs)
      expect(frames.length, `${scene}: that scene really answers`).toBeGreaterThan(0)
      for (const f of frames) {
        expect(f.list.length, `${scene}: the entries one frame carries`)
          .toBe(val(entries.replace(' 个', '')))
        for (const e of f.list) {
          expect(e.bits.length, `${scene}: and the width of each bitmap`)
            .toBe(val(width.replace(' 位', '')))
        }
      }
    }
    /*
     * 「固定部分 15 字节，之后每个发起方 6 字节」 — the caption's two figures, read against the
     * drawing's own boxes: the fixed ones add up to the first, and each entry box is the second.
     */
    const diagram = uwbReceipt.picture!.find((b) => b.kind === 'diagram') as unknown as
      { caption: string; spec: { fields: { label?: string; size: number }[] } }
    const [fixed, perEntry] = figs(diagram.caption,
      /固定部分 (\d+) 字节，之后每个发起方 (\d+) 字节/, 'the caption on the two parts')
    const boxes = diagram.spec.fields
    const entryBoxes = boxes.filter((f) => /条目/.test(f.label ?? ''))
    expect(entryBoxes.length, 'the drawing shows one box per entry').toBeGreaterThan(0)
    for (const b of entryBoxes) expect(b.size, 'each as wide as the caption says').toBe(perEntry)
    expect(boxes.filter((f) => !entryBoxes.includes(f)).reduce((a, b) => a + b.size, 0),
      'and the rest of the boxes are the fixed part').toBe(fixed)
    expect(fixed, 'which is the engine’s own fixed part')
      .toBe(UWB_MHR_BYTES + RMMRC_FIXED_BYTES + UWB_FCS_BYTES)
    expect(perEntry, 'and its own per-initiator entry').toBe(rmmrcEntryBytes(1))
    /*
     * 「Request 置 1 时那一帧是向控制器请求…」 — this lesson only mentions the ancillary clause's
     * bit, so every mention of it is read as one of that bit's two values, each on the lesson
     * that runs it.
     */
    const halves = [...LIM.matchAll(/Request 置 (\d)/g)].map((m) => val(m[1]!))
    expect(halves.length, 'the bit is mentioned').toBeGreaterThanOrEqual(2)
    expect(new Set(halves), 'and every mention is one of its two values').toEqual(new Set([0, 1]))
    const [asks] = figs(LIM, /Request 置 (\d) 时那一帧是向控制器请求/, '`limits` on the asking half')
    expect(uwbAncillaryRequest.scenario().uwb!.ancillaryRequest,
      'the lesson that asks really sets it').toBe(Boolean(asks))
    expect(uwbAncillary.scenario().uwb!.ancillaryRequest,
      'and the one before it does not').toBe(!asks)
  })

  it('reads what a long address would cost, which is the one figure this repo cannot check', () => {
    /*
     * **Exempt, class (a): the long address's own width.** 「真实设备用长地址时每个条目要宽 6 个
     * 字节」 is the difference between the standard's extended address and the short one this
     * engine builds, and no corpus ships with this repo — nothing here states the extended
     * width, so 7 would read the same. What is read is the claim around it: the entry this
     * engine does build is the short one, the formula the lesson prints is that entry's, and a
     * wider address would make the entry wider by a positive amount.
     */
    const [wider] = figs(LIM, /真实设备用长地址时每个条目要宽 (\d) 个字节/,
      '`limits` on the long address')
    expect(wider, 'wider, by something').toBeGreaterThan(0)
    expect(RMMRC_ADDR_BYTES, 'while this engine builds the short one').toBeLessThan(
      RMMRC_ADDR_BYTES + wider!)
    const [fixed, perEntry] = figs(LIM, /而本课的 (\d+) \+ (\d)N 这条式子算不出那一种/,
      '`limits` on the formula it does fit')
    expect(perEntry, 'the entry that formula prices is the short-address one')
      .toBe(rmmrcEntryBytes(1))
    expect(uwbMmrcmBytes(1, 1), 'and one entry really prices that way').toBe(fixed! + perEntry!)
  })

  it('reads the widths `limits` names and the figures `sources` lists', () => {
    // 「RMMRC_ADDR_BYTES 恒为 2 字节的短地址」
    const [addr] = figs(LIM, /RMMRC_ADDR_BYTES 恒为 (\d) 字节的短地址/, '`limits` on the address')
    expect(addr, 'the address width this engine always uses').toBe(RMMRC_ADDR_BYTES)
    // 「本课的 15 + 3N 这条式子算不出那一种」
    const [fixed, perEntry] = figs(LIM, /而本课的 (\d+) \+ (\d)N 这条式子算不出那一种/,
      '`limits` on this lesson’s own formula')
    expect(fixed, 'the fixed part of a confirmation frame')
      .toBe(UWB_MHR_BYTES + RMMRC_FIXED_BYTES + UWB_FCS_BYTES)
    expect(perEntry, 'and what one initiator adds to it').toBe(rmmrcEntryBytes(1))
    expect(uwbMmrcmBytes(2, 1), 'so the formula really prices the frame')
      .toBe(fixed! + 2 * perEntry!)
    // 「rcmValidityRounds 只能是 1」 — the many-to-many constraint, read off the schema
    const [onlyOne] = figs(LIM, /rcmValidityRounds 只能是 (\d)/, '`limits` on the m2m window')
    const m2m = uwbReceiptScenario()
    expect(m2m.uwb!.rcmValidityRounds, 'that mode’s own window').toBe(onlyOne)
    const wider = { ...m2m, uwb: { ...m2m.uwb!, rcmValidityRounds: onlyOne! + 1 } }
    expect(ScenarioSchema.safeParse(wider).success, 'and the schema refuses a wider one')
      .toBe(false)
    /*
     * 「所以那里位图永远只有一位——撑开的是列表那一维，一帧里 N−1 个条目」 — the dimension that
     * does open up, read as the arithmetic it prints: a participant hears everybody but itself,
     * so a frame of that mode carries that many fewer entries than there are participants.
     */
    const [less] = figs(LIM, /一帧里 N−(\d) 个条目/, '`limits` on the list dimension')
    const m2mFrames = sent(run(uwbReceiptScenario(), ONE_BLOCK))
    expect(m2mFrames.length, 'that mode really answers').toBeGreaterThan(0)
    for (const f of m2mFrames) {
      expect(f.list.length, 'and a frame carries that many fewer entries than participants')
        .toBe(PARTICIPANTS - less!)
    }
    // 「2 ms 的测距时隙与 200 ms 的块来自 FiRa 的缺省配置」
    const [slotMs, blockMs] = figs(SRC, /(\d+) ms 的测距时隙与 (\d+) ms 的块来自 FiRa/,
      '`sources` on the two defaults')
    expect(roundPlan(m2m.uwb!, PARTICIPANTS).slotNs, 'the slot this scene runs').toBe(slotMs! * MS)
    expect(roundPlan(m2m.uwb!, PARTICIPANTS).blockNs, 'and its block').toBe(blockMs! * MS)
    /*
     * 「基础场景是 20 × 16 m 大厅里 3 个多对多参与者…两个变体是 22 × 8 m 大厅里 3 个锚点…功率
     * 低 14 dB」 — two halls and one power offset, each read off the scene it belongs to.
     */
    const [wideM, deepM, parts] = figs(SRC, /基础场景是 (\d+) × (\d+) m 大厅里 (\d) 个多对多参与者/,
      '`sources` on the base hall')
    expect([m2m.rooms[0]!.w, m2m.rooms[0]!.h], 'the base hall').toEqual([wideM, deepM])
    expect(m2m.nodes.filter((n) => n.uwb !== undefined).length, 'and its participants').toBe(parts)
    const [wideT, deepT] = figs(SRC, /两个变体是 (\d+) × (\d+) m 大厅/, '`sources` on the other hall')
    const twr = uwbReceiptTwrScenario(true)
    expect([twr.rooms[0]!.w, twr.rooms[0]!.h], 'the two-way hall').toEqual([wideT, deepT])
    const [downDb] = figs(SRC, /功率低 (\d+) dB/, '`sources` on the quiet participant')
    const powers = m2m.nodes.filter((n) => n.uwb !== undefined).map((n) => n.txPowerDbm ?? 0)
    expect(Math.max(...powers) - Math.min(...powers), 'the gap between the loudest and the quietest')
      .toBe(downDb)
  })
})
