/**
 * Task 3 of docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md: the device and
 * network layer of multiple-message receipt confirmation (IEEE Std 802.15.4-2024 §10.36), and the
 * acceptance measurement for the whole slice.
 *
 * What the slice buys is the answer to the question slice 3 (many-to-many) left open: a device
 * knows what *it* worked out and **does not know who heard it**. The request is free — MMRCR is
 * bit 15 of the ARC IE control word every control message already carries (§10.32.9.1) — and the
 * answer costs one frame, an MMRCM carrying an RMMRC IE with one list entry per initiator, each
 * an address plus a receipt bitmap over the current RCM validity window's openers (design §3.3).
 *
 * **Every test here runs whole blocks and reads the records they produced.** If one fails with no
 * record at all, the window did not reach the point that produces one — fix the window first. This
 * branch has three times shipped a feature that looked finished and did nothing, and a whole run is
 * the only instrument that caught it.
 *
 * The headline is the first test, and its rule is that **the bitmap has to come from the receiver's
 * own experience, not from a replay of the records**: the zero bits are compared against the
 * missing `RX_OK` records bit for bit, and the comparison is built from the run rather than typed
 * in. The mutation that proves it bites — making the implementation report "all received" — is
 * recorded in the task report.
 */
import { describe, expect, it } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { UWB_TX_POWER_DBM, uwbMmrcmBytes } from '../../src/uwb/phy'
import { mmrcmResponders, roundPlan } from '../../src/uwb/session'

const MS = 1_000_000

/** The block length of every session below, read off the plan rather than retyped: 240 000 RSTU
 * is 200 ms. */
const BLOCK_NS = roundPlan(DEFAULT_UWB_SESSION, 3).blockNs
/** The validity window every two-way session here runs: four blocks, so the bitmap is four bits
 * wide and has room to be partly zero. `mmrcr` with `rcmValidityRounds: 1` is refused outright by
 * the schema for `'twr'` (a one-bit bitmap says what a Response's own presence already says). */
const R = 4
/** Four blocks: 0, 1, 2 and 3 — exactly one window, closing on block 3, which is the block that
 * carries the MMRCM. One millisecond short of block 4, which must not open. */
const RUN_NS = R * BLOCK_NS - MS

function uwbNode(
  id: string, x: number, y: number, role: 'anchor' | 'tag', txPowerDbm = UWB_TX_POWER_DBM,
): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 },
    txPowerDbm, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ppm: 0 },
  }
}

function scenario(nodes: NodeCfg[], session: Partial<UwbSessionCfg>): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 40, h: 30, name: 'hall' }],
    walls: [],
    nodes,
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...session },
  }
}

const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never

/** No timestamp noise, no carrier-offset noise, no excess delay: nothing below is about a draw. */
const QUIET: Partial<UwbSessionCfg> = { nlos: false, tsNoisePs: 0, cfoNoisePpm: 0 }

// --- The scene: one initiator that is quieter than its responders -----------------
//
// What the bitmap needs is a responder that **misses some of the window's openers and can still be
// heard**, so the link has to be asymmetric. The one lever this engine has for that is per-node
// transmit power: the tag transmits 10 dB below the anchors (both at or under the model's own
// −14 dBm default). Link budget at channel 9 (pl0 ≈ 50.5 dB, free space squared, floor −93 dBm),
// the same budget tests/uwb/rmnr-round.test.ts already measured this engine with:
//
//   tag −24 dBm → 5 m    = −88.5 dBm   heard
//   tag −24 dBm → 16 m   = −98.6 dBm   lost      ← the opener never arrives
//   anchor −14 dBm → 16 m = −88.6 dBm  heard     ← but its own frames still do
//
// `anc-walk` is moved between the two distances block by block; `anc-1` and `anc-2` never move, so
// a loss at `anc-walk` is that one anchor's and not the scene falling over for everybody.

const TAG_DBM = UWB_TX_POWER_DBM - 10
const NEAR = { x: 3, y: 4 } // 5 m from the tag
const FAR = { x: 0, y: 16 } // 16 m from the tag

const SCENE: NodeCfg[] = [
  uwbNode('anc-1', 0, 0.5, 'anchor'),
  uwbNode('anc-2', 0, 4, 'anchor'),
  uwbNode('anc-walk', NEAR.x, NEAR.y, 'anchor'),
  uwbNode('tag-1', 0, 0.001, 'tag', TAG_DBM),
]
const ANCHORS = 3

/**
 * Run four blocks with `anc-walk` standing wherever `at[block]` says during block `block`.
 *
 * This engine has no mobility of its own and does not need any: `UwbChannel` resolves every
 * position through the very node objects the scenario handed it, at the instant it needs them, and
 * `Simulation.runUntil` is resumable. So moving the node between two `runUntil` calls *is* the
 * scene change, and each move lands in the 185 ms gap between one block's round and the next.
 *
 * A **moving** anchor rather than a wall: a wall is static, so it would take every block's opener
 * or none of them, and a bitmap that is all ones or all zeros cannot be compared bit for bit
 * against anything. The loss has to be selective, and the position is this engine's only selective
 * instrument.
 */
function runWalk(
  at: { x: number; y: number }[], session: Partial<UwbSessionCfg>, blocks = R,
): TLRecord[] {
  const nodes = SCENE.map((n) => ({ ...n, pos: { ...n.pos } }))
  const sim = new Simulation(scenario(nodes, session))
  const walker = nodes.find((n) => n.id === 'anc-walk')
  if (!walker) throw new Error('runWalk: anc-walk is not in the scene')
  const out: TLRecord[] = []
  for (let block = 0; block < blocks; block++) {
    const p = at[block % at.length]
    // In place, because the device holds the very Vec3 its scenario node does — which is what a
    // device that moved means.
    walker.pos.x = p.x
    walker.pos.y = p.y
    out.push(...sim.runUntil((block + 1) * BLOCK_NS - MS).records)
  }
  return out
}

/** The session every two-way run below uses, bar the one switch under test. */
const twrSession = (mmrcr: boolean): Partial<UwbSessionCfg> => ({
  ...QUIET, method: 'ss', replyTime: 'embedded', rcmValidityRounds: R, mmrcr,
})

/**
 * **The referee**: which of blocks 0…R−1 this responder actually decoded an opener of, read off
 * the `RX_OK` records of the run itself. Not off the positions the test set, not off the
 * implementation's own state — off the receptions the medium delivered.
 */
const openersDecoded = (rs: TLRecord[], node: string): boolean[] => {
  const got = new Set(
    of(rs, 'RX_OK')
      .filter((r) => r.node === node && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
      .map((r) => r.frame.uwb?.block),
  )
  return Array.from({ length: R }, (_, i) => got.has(i))
}

describe('acceptance: the bitmap is the receiver\'s own experience, bit for bit (design §5.1)', () => {
  // Heard, missed, heard, missed — and the MMRCM goes out from the far position in block 3, which
  // is the whole reason the link has to be asymmetric.
  const WALK = [NEAR, FAR, NEAR, FAR]
  const rs = runWalk(WALK, twrSession(true))

  it('reports exactly the openers that arrived, bit for bit', () => {
    const confirmations = of(rs, 'UWB_MMRCM')
    // No record at all means the window never reached the block that produces one.
    expect(confirmations.length, 'the window-closing block produced no confirmation at all')
      .toBeGreaterThan(0)

    const walked = confirmations.filter((r) => r.peer === 'anc-walk')
    expect(walked.map((r) => [r.node, r.block]), 'one confirmation, from the window-closing block')
      .toEqual([['tag-1', R - 1]])

    // The comparison, built from the run and not typed in.
    const truth = openersDecoded(rs, 'anc-walk')
    expect(walked[0].received, 'the bitmap against the RX_OK records, bit for bit').toEqual(truth)
    // …and it is a comparison with something in it: a bitmap that is all ones or all zeros would
    // match a reducer that ignored the receptions entirely.
    expect(truth, 'the scene really did lose some openers and keep others').toEqual([true, false, true, false])
    expect(walked[0].received, 'some bit is zero').toContain(false)
    expect(walked[0].received, 'some bit is one').toContain(true)
    // The width is the window's, which is what `makeMmrcm` refuses to let drift.
    expect(walked[0].received).toHaveLength(R)
    expect(walked[0].windowRounds).toBe(R)
  })

  it('reports all four bits set for the two responders that never moved', () => {
    for (const id of ['anc-1', 'anc-2']) {
      const seen = of(rs, 'UWB_MMRCM').filter((r) => r.peer === id)
      expect(seen.map((r) => r.block), id).toEqual([R - 1])
      expect(seen[0].received, id).toEqual(openersDecoded(rs, id))
      expect(seen[0].received, `${id} heard every opener`).toEqual([true, true, true, true])
    }
  })

  it('puts one 15 + 3N octet frame per responder on the air, in the window-closing block', () => {
    const sent = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(sent.map((r) => r.node).sort()).toEqual(['anc-1', 'anc-2', 'anc-walk'])
    for (const r of sent) {
      // One initiator per two-way round, so one list entry: 15 + 3 × 1 octets at a window of
      // eight rounds or fewer (design §3.3). Measured against `phy.ts`, not against a literal.
      expect(r.frame.bytes, r.node).toBe(uwbMmrcmBytes(1, R))
      expect(r.frame.bytes, r.node).toBe(18)
      expect(r.frame.uwb?.ies, r.node).toEqual(['RMMRC'])
      expect(r.frame.uwb?.block, r.node).toBe(R - 1)
      expect(r.frame.uwb?.mmrc?.map((e) => e.initiator), r.node).toEqual(['tag-1'])
      // Unicast to the one initiator the round has (design §6: no multicast is modelled).
      expect(r.frame.dst, r.node).toBe('tag-1')
    }
  })
})

describe('the request costs nothing on the air; the answer is what costs a frame (design §3.1)', () => {
  it('asks for nothing on the air: the RCM is the same size with MMRCR set', () => {
    const openers = (mmrcr: boolean): { kind: string; bytes: number; ies: string[] }[] =>
      of(runWalk([NEAR], twrSession(mmrcr)), 'TX_START')
        .filter((r) => r.node === 'tag-1' && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
        .map((r) => ({ kind: r.frame.kind, bytes: r.frame.bytes, ies: [...(r.frame.uwb?.ies ?? [])] }))
    const off = openers(false)
    const on = openers(true)
    expect(off.length, 'one opener per block, four blocks').toBe(R)
    // MMRCR is bit 15 of the Content Control word the ARC IE already carries, so it is not a
    // field the frame grows for — the control message is the same octets either way, IE for IE.
    expect(on).toEqual(off)
    expect(on[0].ies).toEqual(['ARC', 'RDM', 'RRMC'])
  })

  it('sends no MMRCM when MMRCR is clear', () => {
    const rs = runWalk([NEAR, FAR, NEAR, FAR], twrSession(false))
    expect(of(rs, 'UWB_MMRCM')).toHaveLength(0)
    expect(of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbMmrcm')).toHaveLength(0)
    // …and the run really did reach the block that would have carried one.
    expect(of(rs, 'UWB_RANGE').filter((r) => r.peer === 'anc-1').map((r) => r.block)).toEqual([0, 1, 2, 3])
  })
})

describe('a receipt confirmation is an extra message, not part of the measurement (design §5.4)', () => {
  it('leaves every UWB_RANGE field-for-field identical', () => {
    const WALK = [NEAR, FAR, NEAR, FAR]
    // `seq` is a position in the record stream rather than a field of the measurement; `t` is
    // kept, because an MMRCM takes no ranging counter and no random draw, so it must not move a
    // single instant of the ranging that came before it (`src/uwb/ranging.ts` is untouched).
    const ranges = (mmrcr: boolean): unknown[] =>
      of(runWalk(WALK, twrSession(mmrcr)), 'UWB_RANGE').map(({ seq, ...rest }) => rest)
    const off = ranges(false)
    expect(off.length, 'SS embedded: a range per heard anchor per block, at the tag').toBeGreaterThan(0)
    expect(ranges(true)).toEqual(off)
  })

  it('adds slots only on the window last block', () => {
    const slotsPerBlock = (mmrcr: boolean): number[] => {
      const rs = runWalk([NEAR], twrSession(mmrcr))
      // The slot records of the one node that emits them, grouped by the block its round was in.
      const high = new Map<number, number>()
      let block = 0
      for (const r of rs) {
        if (r.type === 'UWB_ROUND' && r.node === 'tag-1') block = r.block
        if (r.type === 'UWB_SLOT' && r.node === 'tag-1') {
          high.set(block, Math.max(high.get(block) ?? 0, r.slot))
        }
      }
      return Array.from({ length: R }, (_, b) => (high.get(b) ?? -1) + 1)
    }
    const plan = roundPlan({ ...DEFAULT_UWB_SESSION, ...twrSession(true) }, ANCHORS)
    const extra = mmrcmResponders(plan)
    expect(extra, 'one slot per responder — an anchor is what sends an MMRCM').toBe(ANCHORS)
    // Blocks 0…R−2 are the `mmrcr: false` round slot for slot; only block R−1 grows.
    expect(slotsPerBlock(false)).toEqual([plan.slots, plan.slots, plan.slots, plan.slots])
    expect(slotsPerBlock(true)).toEqual([plan.slots, plan.slots, plan.slots, plan.slots + extra])
  })
})

// --- Two initiators, and the defect slice 3 shipped fifteen frames of ------------
//
// An anchor's receipt state for tag 1 must never answer tag 2. Slice 3 keyed the same kind of
// cross-round state by nothing at all, and an anchor that had decoded tag 1's control message
// answered **tag 2's** round with a frame whose whole meaning is "I did receive your control
// message" — from a tag it had never decoded a single frame of. `tag-far` here is 14 dB below
// `tag-1` and stands across the hall, so no anchor ever decodes an opener of its own.

const TWO_TAGS: NodeCfg[] = [
  uwbNode('anc-1', 0, 0.5, 'anchor'),
  uwbNode('anc-2', 0, 4, 'anchor'),
  uwbNode('anc-3', 3, 4, 'anchor'),
  uwbNode('tag-1', 0, 0.001, 'tag', TAG_DBM),
  uwbNode('tag-far', 30, 25, 'tag', TAG_DBM - 14),
]

describe('never answers an initiator it has not heard from', () => {
  const rs = new Simulation(scenario(TWO_TAGS, twrSession(true))).runUntil(RUN_NS).records

  it('builds the scene it claims to: every anchor hears tag-1 and none ever hears tag-far', () => {
    for (const id of ['anc-1', 'anc-2', 'anc-3']) {
      const heard = of(rs, 'RX_OK').filter((r) => r.node === id)
      expect(heard.filter((r) => r.from === 'tag-1').length, `${id} ← tag-1`).toBeGreaterThan(0)
      expect(heard.filter((r) => r.from === 'tag-far'), `${id} ← tag-far`).toHaveLength(0)
    }
    // …and tag-far's round really did run, so its silence is a decision rather than a schedule
    // that never reached it.
    expect(of(rs, 'UWB_ROUND').filter((r) => r.node === 'tag-far').length).toBe(R)
  })

  it('gives tag-far no bitmap at all, and never names it in anyone else\'s', () => {
    expect(of(rs, 'UWB_MMRCM').filter((r) => r.node === 'tag-far')).toHaveLength(0)
    // Read off the air, not off the records: no MMRCM frame anywhere carries an entry for an
    // initiator its sender never decoded a frame of.
    const sent = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(sent.length, 'tag-1\'s round is still confirmed').toBeGreaterThan(0)
    for (const r of sent) {
      expect(r.frame.uwb?.mmrc?.map((e) => e.initiator), r.node).toEqual(['tag-1'])
      expect(r.frame.dst, r.node).toBe('tag-1')
    }
  })

  it('still confirms tag-1\'s own window, all four bits', () => {
    const mine = of(rs, 'UWB_MMRCM').filter((r) => r.node === 'tag-1')
    expect(mine.map((r) => r.peer).sort()).toEqual(['anc-1', 'anc-2', 'anc-3'])
    for (const r of mine) expect(r.received, r.peer).toEqual([true, true, true, true])
  })

  it('does not run tag-far\'s round on top of tag-1\'s extra slots', () => {
    // Two tags is what makes the round *stride* matter (`session.ts#blockSlotStartNs`): the extra
    // slots are appended to each round, so a stride left at `plan.roundNs` would put tag-1's three
    // confirmation slots exactly on tag-far's slots 0…2 of the same block. Measured off the records,
    // so it is the schedule that actually ran rather than the arithmetic that describes it.
    const lastConfirmation = Math.max(
      ...of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbMmrcm').map((r) => r.t),
    )
    const farRound = of(rs, 'UWB_ROUND').filter((r) => r.node === 'tag-far' && r.block === R - 1)
    expect(farRound, 'tag-far opened its own round in the window-closing block').toHaveLength(1)
    expect(farRound[0].t, 'tag-far\'s round starts after the last confirmation of tag-1\'s')
      .toBeGreaterThan(lastConfirmation)
    // …and tag-1 kept ranging with every anchor in every block, which a collision would have cost.
    for (const id of ['anc-1', 'anc-2', 'anc-3']) {
      expect(
        of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1' && r.peer === id).map((r) => r.block), id,
      ).toEqual([0, 1, 2, 3])
    }
  })
})

// --- Two initiators a responder hears *differently* ------------------------------
//
// The scene above proves the floor: an initiator never heard is never answered. It does **not**
// prove the keying, because with only one audible tag an un-keyed bitmap would still be that tag's.
// So here both tags are audible and `anc-walk` loses **tag-1's** openers in blocks 1 and 3 while
// keeping every one of **tag-2's**: `tag-2` stands midway, at full power, within reach of both of
// `anc-walk`'s positions. One device, one window, two initiators, two different bitmaps — which a
// single un-keyed array cannot produce, and which is the shape slice 3 shipped fifteen frames of.

const BOTH_HEARD: NodeCfg[] = [
  uwbNode('anc-1', 0, 0.5, 'anchor'),
  uwbNode('anc-2', 0, 4, 'anchor'),
  uwbNode('anc-walk', NEAR.x, NEAR.y, 'anchor'),
  uwbNode('tag-1', 0, 0.001, 'tag', TAG_DBM),
  uwbNode('tag-2', 1, 10, 'tag'),
]

describe('two initiators, one responder, two different bitmaps', () => {
  const nodes = BOTH_HEARD.map((n) => ({ ...n, pos: { ...n.pos } }))
  const sim = new Simulation(scenario(nodes, twrSession(true)))
  const walker = nodes.find((n) => n.id === 'anc-walk')
  if (!walker) throw new Error('anc-walk is not in the scene')
  const rs: TLRecord[] = []
  for (const [block, p] of [NEAR, FAR, NEAR, FAR].entries()) {
    walker.pos.x = p.x
    walker.pos.y = p.y
    rs.push(...sim.runUntil((block + 1) * BLOCK_NS - MS).records)
  }

  /** `node`'s own receipts of `from`'s openers, off the run's RX_OK records. */
  const decoded = (node: string, from: string): boolean[] => {
    const got = new Set(
      of(rs, 'RX_OK')
        .filter((r) => r.node === node && r.from === from
          && (r.frame.kind === 'uwbPoll' || r.frame.kind === 'uwbInit'))
        .map((r) => r.frame.uwb?.block),
    )
    return Array.from({ length: R }, (_, i) => got.has(i))
  }

  it('builds the scene it claims to: anc-walk loses tag-1 in two blocks and tag-2 in none', () => {
    expect(decoded('anc-walk', 'tag-1')).toEqual([true, false, true, false])
    expect(decoded('anc-walk', 'tag-2')).toEqual([true, true, true, true])
  })

  it('answers each initiator with its own bitmap, from the same device and the same window', () => {
    const got = new Map(
      of(rs, 'UWB_MMRCM').filter((r) => r.peer === 'anc-walk').map((r) => [r.node, r.received]),
    )
    expect([...got.keys()].sort(), 'anc-walk confirmed both initiators').toEqual(['tag-1', 'tag-2'])
    expect(got.get('tag-1')).toEqual(decoded('anc-walk', 'tag-1'))
    expect(got.get('tag-2')).toEqual(decoded('anc-walk', 'tag-2'))
    // …and the two really do differ, so the assertions above are not one claim written twice.
    expect(got.get('tag-1')).not.toEqual(got.get('tag-2'))
    // The two anchors that never moved answer both initiators with every bit set, which is what
    // says the difference above belongs to the responder that moved and not to the window.
    for (const id of ['anc-1', 'anc-2']) {
      for (const tag of ['tag-1', 'tag-2']) {
        const seen = of(rs, 'UWB_MMRCM').filter((r) => r.peer === id && r.node === tag)
        expect(seen.map((r) => r.received), `${id} → ${tag}`).toEqual([[true, true, true, true]])
      }
    }
  })
})

// --- Many-to-many: one frame, several initiators, one bit each -------------------
//
// The mode design §2 opens with, and the one the schema keeps `mmrcr` for even at
// `rcmValidityRounds: 1` — a participant's transmission is only ever echoed *forward*
// (`UwbM2mTimes.rxCounters`), never back to the sender, so this one bit is the only thing in the
// mode that ever tells a participant it was heard. Here `p-3` transmits 14 dB down: the other two
// never decode it, and it decodes them — so its own confirmations come back all-zero while the
// same frame's other entry is one. **One frame, two entries, two different answers** is what a
// receipt state keyed by nothing at all could not produce.

const M2M: NodeCfg[] = [
  uwbNode('p-1', 1, 1, 'anchor'),
  uwbNode('p-2', 7, 2, 'anchor'),
  uwbNode('p-3', 3, 6, 'tag', UWB_TX_POWER_DBM - 14),
]

describe('many-to-many: one frame per responder, one entry per initiator', () => {
  const session: Partial<UwbSessionCfg> = {
    ...QUIET, mode: 'm2m', method: 'ss', rcmValidityRounds: 1, mmrcr: true,
  }
  const rs = new Simulation(scenario(M2M, session)).runUntil(100 * MS).records

  it('builds the scene it claims to: p-3 is heard by nobody and hears everybody', () => {
    expect(of(rs, 'RX_OK').filter((r) => r.from === 'p-3'), 'nobody decodes p-3').toHaveLength(0)
    for (const from of ['p-1', 'p-2']) {
      expect(of(rs, 'RX_OK').filter((r) => r.node === 'p-3' && r.from === from), `p-3 ← ${from}`)
        .not.toHaveLength(0)
    }
  })

  it('carries one entry per other participant, with the heard and the unheard side by side', () => {
    const sent = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(sent.map((r) => r.node).sort()).toEqual(['p-1', 'p-2', 'p-3'])
    for (const r of sent) {
      // N − 1 entries, a one-bit bitmap each (the window is one round in this mode).
      expect(r.frame.bytes, r.node).toBe(uwbMmrcmBytes(2, 1))
      expect(r.frame.uwb?.mmrc?.length, r.node).toBe(2)
      for (const e of r.frame.uwb?.mmrc ?? []) expect(e.received, `${r.node} → ${e.initiator}`).toHaveLength(1)
    }
    // p-1's own frame: it heard p-2 and not p-3, in the same frame, from the same state.
    const one = sent.find((r) => r.node === 'p-1')
    expect(one?.frame.uwb?.mmrc).toEqual([
      { initiator: 'p-2', received: [true] },
      { initiator: 'p-3', received: [false] },
    ])
  })

  it('tells p-3 what it could not learn any other way: nobody heard it', () => {
    const atFar = of(rs, 'UWB_MMRCM').filter((r) => r.node === 'p-3')
    expect(atFar.map((r) => r.peer).sort(), 'both other participants answered it').toEqual(['p-1', 'p-2'])
    for (const r of atFar) expect(r.received, r.peer).toEqual([false])
    // …and the answer in the other direction is the opposite bit, from the same mechanism.
    const atOne = of(rs, 'UWB_MMRCM').filter((r) => r.node === 'p-1' && r.peer === 'p-2')
    expect(atOne).toHaveLength(1)
    expect(atOne[0].received).toEqual([true])
  })
})
