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
