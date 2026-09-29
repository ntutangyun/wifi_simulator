/**
 * Task 4: the device layer, and the acceptance measurement for the whole reply-time slice.
 *
 * IEEE Std 802.15.4-2024 §10.29.6 lists five two-way ranging procedures. They measure the same
 * physical distance with the same four times and the same arithmetic (`src/uwb/ranging.ts`, which
 * this slice does not touch); what differs is **the route each of those times takes from the
 * device that produced it to the device that needs it** (design §2). So every test here runs a
 * whole round and reads the records it produced — not a helper, not a constant.
 *
 * See `docs/superpowers/specs/2026-09-29-reply-time-design.md` §2, §6/§6.1, §7 and §9.
 */
import { describe, expect, it } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { hashStr } from '../../src/engine/hash'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { UwbNetwork } from '../../src/uwb/network'
import { DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg } from '../../src/model/scenario'
import type { UwbReplyTime } from '../../src/uwb/phy'
import { RCTU_NS, UWB_TX_POWER_DBM, uwbPollBytes, uwbPpduNs } from '../../src/uwb/phy'
import { rangeSigmaM } from '../../src/uwb/position'
import { roundPlan } from '../../src/uwb/session'

const MS = 1_000_000
/** Anchor at the origin, tag 5 m down the x axis — the distance every test below measures. */
const TRUE_DIST_M = 5

function uwbNode(id: string, x: number, role: 'anchor' | 'tag', ppm: number, y = 0): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z: 1 },
    txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ppm },
  }
}

/** One anchor, one tag, nothing else in the scenario: the shortest round that still has a Poll,
 * a Response and (in DS) a Final and a Report in it. */
function scenario(
  session: Partial<UwbSessionCfg>, ppm: { anchor: number; tag: number } = { anchor: 0, tag: 0 },
): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 12, h: 10, name: 'lab' }],
    walls: [],
    nodes: [uwbNode('anc-1', 0, 'anchor', ppm.anchor), uwbNode('tag-1', TRUE_DIST_M, 'tag', ppm.tag)],
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...session },
  }
}

/** A block is 200 ms and holds one round per tag, so 40 ms is round 0 of block 0 and nothing
 * else — the longest of the five shapes (DS, 4 slots) is 8 ms. */
const RUN_NS = 40 * MS
const run = (sc: Scenario): TLRecord[] => new Simulation(sc).runUntil(RUN_NS).records
const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never

/**
 * The same round, run straight off `UwbNetwork` with no scenario schema in front of it.
 *
 * The schema refuses a fixed reply time outside design §6.1's two-sided bound, and refusing it is
 * exactly its job — so the only way to watch what a round *does* when the bound is broken is to
 * build the round without it. Everything else about this run is the run above.
 */
function runRaw(session: Partial<UwbSessionCfg>): TLRecord[] {
  const q = new EventQueue()
  let now = 0
  const recs: TLRecord[] = []
  const nodes = [uwbNode('anc-1', 0, 'anchor', 0), uwbNode('tag-1', TRUE_DIST_M, 'tag', 0)]
  new UwbNetwork(
    q, () => now, nodes, [], { ...DEFAULT_UWB_SESSION, ...session }, new Rng(7),
    makeEmitter((x) => recs.push(x as TLRecord)),
  )
  for (;;) {
    const t = q.peekTime()
    if (t === null || t > RUN_NS) break
    const e = q.pop()!
    now = e.t
    e.fn()
  }
  return recs
}

interface Shape { name: string; method: 'ss' | 'ds'; replyTime: UwbReplyTime }

/** The five procedures of §10.29.6, in the order design §4 tabulates them. `ds` + `fixed` is not
 * one of them and the schema refuses it (design §3.1), which is why there are five and not six. */
const SHAPES: Shape[] = [
  { name: 'SS embedded (§10.29.6.4)', method: 'ss', replyTime: 'embedded' },
  { name: 'SS fixed (§10.29.6.5)', method: 'ss', replyTime: 'fixed' },
  { name: 'SS deferred (§10.29.6.3)', method: 'ss', replyTime: 'deferred' },
  { name: 'DS embedded (§10.29.6.7)', method: 'ds', replyTime: 'embedded' },
  { name: 'DS deferred (§10.29.6.6)', method: 'ds', replyTime: 'deferred' },
]

/** No timestamp noise, no carrier-offset estimator noise, line of sight: what is left in a range
 * is the route the times took and nothing else, so five equal numbers mean five equal routes. */
const QUIET: Partial<UwbSessionCfg> = { nlos: false, tsNoisePs: 0, cfoNoisePpm: 0 }

function tagRangesOf(
  s: Shape, over: Partial<UwbSessionCfg> = QUIET, ppm?: { anchor: number; tag: number },
): number[] {
  const rs = run(scenario({ method: s.method, replyTime: s.replyTime, ...over }, ppm))
  return of(rs, 'UWB_RANGE').filter((r) => r.node === 'tag-1').map((r) => r.distM)
}

describe('acceptance: five reply-time procedures measure one distance (design §9.1)', () => {
  it('measures the same distance five different ways', () => {
    const got = SHAPES.map((s) => {
      const ds = tagRangesOf(s)
      // If this is empty the round never reached the point that produces a range: fix the round,
      // do not go looking for an arithmetic bug in something that never ran.
      expect(ds, `${s.name}: no UWB_RANGE at the tag`).toHaveLength(1)
      return { name: s.name, distM: ds[0] }
    })
    for (const g of got) expect(Math.abs(g.distM - TRUE_DIST_M), g.name).toBeLessThan(0.01)
    const spread = Math.max(...got.map((g) => g.distM)) - Math.min(...got.map((g) => g.distM))
    expect(spread).toBeLessThan(0.01)
  })

  it('measures the same distance five ways with crystals 35 ppm apart', () => {
    // Design §8: the clock-offset correction applies to the fixed reply time exactly as it does
    // to an embedded one, because the "fixed" delay is counted on the responder's own crystal —
    // so `ssTwrCorrected`'s (1 − coffs) is still the right conversion. DS-TWR cancels the offset
    // by construction. At 20 ppm over a 2 ms reply an uncorrected reading is out by 6 m.
    const ppm = { anchor: 20, tag: -15 }
    for (const s of SHAPES) {
      const ds = tagRangesOf(s, QUIET, ppm)
      expect(ds, `${s.name}: no UWB_RANGE at the tag`).toHaveLength(1)
      expect(Math.abs(ds[0] - TRUE_DIST_M), s.name).toBeLessThan(0.05)
    }
  })

  it('measures the same distance five ways with the session default timestamp noise', () => {
    // The same five routes with the receiver noise the lesson scenes actually run: each range is
    // its own draw, so they no longer agree exactly — they agree to the noise.
    const sigma = rangeSigmaM(DEFAULT_UWB_SESSION.tsNoisePs)
    for (const s of SHAPES) {
      const ds = tagRangesOf(s, { nlos: false, cfoNoisePpm: 0 })
      expect(ds, `${s.name}: no UWB_RANGE at the tag`).toHaveLength(1)
      expect(Math.abs(ds[0] - TRUE_DIST_M), s.name).toBeLessThan(5 * sigma)
    }
  })
})

describe('the frames the round actually put on the air (design §5, acceptance §9.2)', () => {
  /** Every PPDU of one round of one shape, as the timeline recorded it — read off `TX_START`, not
   * off the octet constants in `phy.ts`, because what is being checked is that the round chose the
   * right frame and not that the arithmetic in the constant is self-consistent. */
  const airOf = (s: Shape): { kind: string; bytes: number }[] =>
    of(run(scenario({ method: s.method, replyTime: s.replyTime, ...QUIET })), 'TX_START')
      .map((r) => ({ kind: r.frame.kind, bytes: r.frame.bytes }))

  it('puts the reply time in the Response only when it is embedded there', () => {
    const resp = (s: Shape): number[] => airOf(s).filter((f) => f.kind === 'uwbResp').map((f) => f.bytes)
    // 20 octets embedded (MHR + RRMC + RRTI + FCS), 14 without the RRTI IE — the six octets the
    // deferred and fixed shapes save on every Response of every round (design §5).
    expect(resp(SHAPES[0])).toEqual([20])
    expect(resp(SHAPES[1])).toEqual([14])
    expect(resp(SHAPES[2])).toEqual([14])
  })

  it('sends one deferred reply-time message per anchor, and only when deferred', () => {
    expect(airOf(SHAPES[2]).filter((f) => f.kind === 'uwbSsDefer')).toEqual([{ kind: 'uwbSsDefer', bytes: 17 }])
    for (const s of [SHAPES[0], SHAPES[1], SHAPES[3], SHAPES[4]]) {
      expect(airOf(s).filter((f) => f.kind === 'uwbSsDefer'), s.name).toHaveLength(0)
    }
  })

  it('shrinks the deferred DS Final from 14 + 12A to 14 + 2A', () => {
    const final = (s: Shape): number[] => airOf(s).filter((f) => f.kind === 'uwbFinal').map((f) => f.bytes)
    expect(final(SHAPES[3])).toEqual([14 + 12]) // one anchor, embedded
    expect(final(SHAPES[4])).toEqual([14 + 2]) // …and the same round with the times taken out
  })
})

describe('who ends up holding the range (design §7)', () => {
  it('gives the anchor a range only in the embedded DS round', () => {
    for (const s of SHAPES) {
      const rs = run(scenario({ method: s.method, replyTime: s.replyTime, ...QUIET }))
      const nodes = of(rs, 'UWB_RANGE').map((r) => r.node)
      expect(nodes.filter((n) => n === 'tag-1'), `${s.name}: the tag always ranges`).toHaveLength(1)
      const anchorRanges = nodes.filter((n) => n === 'anc-1').length
      const expected = s.method === 'ds' && s.replyTime === 'embedded' ? 1 : 0
      expect(anchorRanges, `${s.name}: anchor-side ranges`).toBe(expected)
    }
  })
})

describe('SS deferred: the reply time arrives in a message of its own (§10.29.6.3)', () => {
  const rs = run(scenario({ method: 'ss', replyTime: 'deferred', ...QUIET }))
  const tagRx = (kind: string): { t: number }[] =>
    of(rs, 'UWB_TS').filter((r) => r.node === 'tag-1' && r.dir === 'rx' && r.frameKind === kind)

  it('the deferred SS range does not exist until the deferred message lands', () => {
    const resp = tagRx('uwbResp')
    const defer = tagRx('uwbSsDefer')
    expect(resp, 'the tag stamped the Response').toHaveLength(1)
    expect(defer, 'the tag stamped the deferred reply-time message').toHaveLength(1)
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(1)
    // The Response went by a whole slot earlier and produced nothing: the reply time was not in it.
    const slotNs = roundPlan({ ...DEFAULT_UWB_SESSION }, 1).slotNs
    expect(defer[0].t - resp[0].t).toBeGreaterThan(slotNs / 2)
    expect(ranges[0].t).toBeGreaterThan(resp[0].t)
    expect(ranges[0].t).toBeGreaterThanOrEqual(defer[0].t)
  })

  it('the embedded SS range exists at the Response itself', () => {
    const emb = run(scenario({ method: 'ss', replyTime: 'embedded', ...QUIET }))
    const resp = of(emb, 'UWB_TS').filter((r) => r.node === 'tag-1' && r.dir === 'rx' && r.frameKind === 'uwbResp')
    const ranges = of(emb, 'UWB_RANGE')
    expect(resp).toHaveLength(1)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].t).toBe(resp[0].t)
    // …and no deferred message was ever sent.
    expect(of(emb, 'UWB_TS').filter((r) => r.frameKind === 'uwbSsDefer')).toHaveLength(0)
  })
})

describe('fixed reply time: the one transmission that is not slot-aligned (design §6.1)', () => {
  const fixedRun = (fixedReplyRstu: number): TLRecord[] =>
    runRaw({ method: 'ss', replyTime: 'fixed', fixedReplyRstu, ...QUIET })

  it('a fixed reply time that overruns its slot loses the round', () => {
    // Design §6.1's upper bound at this geometry is ≈ 4346 RSTU: past it the Response is cut off
    // by its own slot boundary, the tag's receive window has closed, and the round ends in a
    // UWB_TIMEOUT — with the Poll plainly received. (The schema refuses this scenario; the test
    // builds it directly, because what is being tested is what the round does when it happens.)
    const late = fixedRun(4600)
    expect(of(late, 'UWB_RANGE')).toHaveLength(0)
    expect(of(late, 'UWB_TIMEOUT').length).toBeGreaterThan(0)
  })

  it('a fixed reply time below its lower bound answers in a slot that is not its own', () => {
    // The bound is two-sided (design §6.1 corrects §6): half a slot puts responder 0 on the air
    // inside slot 0, before its own slot has begun, where nobody is listening for it.
    const early = fixedRun(1200)
    expect(of(early, 'UWB_RANGE')).toHaveLength(0)
    expect(of(early, 'UWB_TIMEOUT').length).toBeGreaterThan(0)
  })

  it('and the same round inside the bounds produces a range and no timeout', () => {
    const ok = fixedRun(DEFAULT_UWB_SESSION.fixedReplyRstu)
    expect(of(ok, 'UWB_RANGE')).toHaveLength(1)
    expect(of(ok, 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('answers a fixed interval after the Poll arrived, not at the slot boundary', () => {
    const ok = fixedRun(DEFAULT_UWB_SESSION.fixedReplyRstu)
    const plan = roundPlan({ ...DEFAULT_UWB_SESSION, method: 'ss', replyTime: 'fixed' }, 1)
    const pollNs = uwbPpduNs(uwbPollBytes(1))
    const rxPoll = of(ok, 'UWB_TS').find((r) => r.node === 'anc-1' && r.dir === 'rx' && r.frameKind === 'uwbPoll')
    const txResp = of(ok, 'UWB_TS').find((r) => r.node === 'anc-1' && r.dir === 'tx' && r.frameKind === 'uwbResp')
    expect(rxPoll).toBeDefined()
    expect(txResp).toBeDefined()
    // Its own counter, its own crystal: exactly the configured constant plus the Poll's airtime,
    // to the RCTU, and nothing that varies with the geometry. That is what makes `Treply` a number
    // the tag already knows without being told it. (The constant is counted from the *end* of the
    // Poll's reception — design §6.1 — and the tail of the Poll after its own RMARKER is the
    // airtime term; both ends know it because both handled that PPDU.)
    expect(txResp!.counter - rxPoll!.counter).toBe(Math.round((pollNs + plan.fixedReplyNs) / RCTU_NS))
    // Design §6.1's own worked number: with F = one slot, the Response starts one Poll airtime
    // into slot 1 — at neither edge of the slot it belongs to.
    const startNs = txResp!.t
    expect(startNs - plan.slotNs).toBeGreaterThan(0.9 * pollNs)
    expect(startNs - plan.slotNs).toBeLessThan(1.1 * pollNs)
  })
})

describe('the embedded shapes are byte-identical to what they were before this slice', () => {
  /** Captured from HEAD before any of Task 4 was written: the two shapes that already existed
   * must produce the identical record stream afterwards. The lesson and UWB-record fixtures pin
   * the shipped scenes; this pins the bare two-node round the tests above vary, which no fixture
   * covers. It is expected to pass before the implementation as well as after — it is the guard,
   * not the goal. */
  const BEFORE: Record<'ss' | 'ds', string> = { ss: '17ed177b', ds: '9eb598de' }

  it('is deterministic and byte-identical in the embedded shapes', () => {
    for (const method of ['ss', 'ds'] as const) {
      const rs = run(scenario({ method, nlos: false }))
        .filter((r) => r.type.startsWith('UWB_') || r.type === 'MAC_STATE')
      expect(hashStr(JSON.stringify(rs)).toString(16), method).toBe(BEFORE[method])
    }
  })
})

/**
 * Fix round 1 of Task 4. `contention` + `fixed` is a pairing the schema deliberately allows —
 * design §3.1 calls it the one most worth allowing, because a contention round is exactly where the
 * shortest Response matters most — and Task 4 shipped it with no end-to-end coverage. A
 * configuration the schema permits and no round exercises is one this slice has not modelled.
 *
 * What is genuinely different here, and all this file's other fixed-reply tests miss: the
 * responder's answer slot came from its **own draw** (`r.contendSlot`, standard §10.32.2 schedule
 * mode 0) rather than from the schedule, so the stagger `k` in `fixedReplyRctu` is a number the
 * schedule never decided — and the tag, which was never told the draw, has to read `k` off the slot
 * the answer landed in.
 */
describe('contention + fixed: a responder that chose its own slot (design §3.1)', () => {
  /** A contention round, with the anchors placed where the caller asks and one tag. */
  function contention(places: { x: number; y: number }[], tag: { x: number; y: number }): TLRecord[] {
    return run({
      rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'lab' }],
      walls: [],
      nodes: [
        ...places.map((p, i) => uwbNode(`anc-${i + 1}`, p.x, 'anchor', 0, p.y)),
        uwbNode('tag-1', tag.x, 'tag', 0, tag.y),
      ],
      servers: [],
      seed: 7,
      rtsThresholdBytes: 3000,
      snapshotIntervalMs: 10,
      uwb: { ...DEFAULT_UWB_SESSION, method: 'ss', replyTime: 'fixed', schedule: 'contention', ...QUIET },
    })
  }

  /** The slot each anchor drew, as it announced it on the Poll — read from the round, never
   * hard-coded: the draw comes off that anchor's own generator and is nobody's business to predict. */
  const drawn = (rs: TLRecord[]): Map<string, number> => new Map(
    of(rs, 'UWB_CONTEND').filter((r) => r.slot !== null).map((r) => [r.node, r.slot as number]),
  )

  describe('one anchor', () => {
    const rs = contention([{ x: 0, y: 0 }], { x: 5, y: 0 })
    const slot = drawn(rs).get('anc-1')!
    const plan = roundPlan(
      { ...DEFAULT_UWB_SESSION, method: 'ss', replyTime: 'fixed', schedule: 'contention' }, 1,
    )
    // A contention Poll carries RCPS + RCMA instead of the anchor list, so it is a flat 31 octets
    // whatever the anchor count — a different airtime from the time-scheduled Poll, and the fixed
    // reply time is counted from the end of *this* one.
    const pollNs = uwbPpduNs(uwbPollBytes(1, 'contention'))

    it('ranges it, once, to the same 5 m as every other shape', () => {
      const ranges = of(rs, 'UWB_RANGE')
      expect(ranges).toHaveLength(1)
      expect(ranges[0].node).toBe('tag-1') // SS-TWR: the anchor gets nothing (design §7)
      expect(Math.abs(ranges[0].distM - TRUE_DIST_M)).toBeLessThan(0.01)
      expect(of(rs, 'UWB_TIMEOUT')).toHaveLength(0)
    })

    it('answers in the slot it drew, not in the slot its index would have given it', () => {
      // This is the assertion the whole test exists for. `anc-1` is anchor index 0, so a stagger
      // taken from the index would put its Response in slot 1. It drew a slot of its own instead,
      // and that draw is what spaces the reply — `armFixedReply` reads `r.contendSlot`.
      expect(slot).toBeGreaterThan(1)
      const txResp = of(rs, 'UWB_TS').find((r) => r.node === 'anc-1' && r.dir === 'tx' && r.frameKind === 'uwbResp')
      expect(txResp).toBeDefined()
      const intoSlot = txResp!.t - slot * plan.slotNs
      expect(intoSlot).toBeGreaterThan(0.9 * pollNs)
      expect(intoSlot).toBeLessThan(1.1 * pollNs)
    })

    it('and the tag subtracts the very number the anchor aimed at', () => {
      const rxPoll = of(rs, 'UWB_TS').find((r) => r.node === 'anc-1' && r.dir === 'rx' && r.frameKind === 'uwbPoll')
      const txResp = of(rs, 'UWB_TS').find((r) => r.node === 'anc-1' && r.dir === 'tx' && r.frameKind === 'uwbResp')
      // `fixedReplyRctu(plan, slot, pollNs)`, rebuilt here from the session and the announced draw:
      // the responder hit it on its own counter, and the range above proves the tag subtracted it.
      const expected = Math.round((pollNs + plan.fixedReplyNs + (slot - 1) * plan.slotNs) / RCTU_NS)
      expect(txResp!.counter - rxPoll!.counter).toBe(expected)
    })
  })

  it('gets k right per anchor when three of them draw three different slots', () => {
    // Three anchors at three distances, each answering after a stagger of its own. Nothing tells
    // the tag which anchor drew which slot: it reads the stagger off where each answer landed, so a
    // single wrong `k` would come back as a range wrong by half a slot — 300 km, not 30 cm.
    const places = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }]
    const tag = { x: 3, y: 4 }
    const rs = contention(places, tag)
    const slots = drawn(rs)
    expect(new Set(slots.values()).size, 'three distinct draws, so three distinct staggers').toBe(3)
    const ranges = of(rs, 'UWB_RANGE')
    expect(ranges).toHaveLength(3)
    for (const r of ranges) {
      expect(r.node).toBe('tag-1')
      expect(Math.abs(r.distM - r.trueDistM), `${r.peer} at slot ${slots.get(r.peer)}`).toBeLessThan(0.01)
    }
    // …and they really were different distances, so three equal readings could not have passed.
    expect(new Set(ranges.map((r) => Math.round(r.trueDistM * 100))).size).toBeGreaterThan(1)
  })
})
