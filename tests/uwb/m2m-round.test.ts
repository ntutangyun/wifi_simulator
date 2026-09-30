/**
 * Task 4 of docs/superpowers/specs/2026-09-30-many-to-many-design.md: the device and the network
 * layer of many-to-many ranging (standard §10.32.6 SS / §10.32.7 DS) — and the acceptance
 * measurement for the whole slice.
 *
 * Every test here **runs a whole round and reads the records it produced**. That is deliberate:
 * this slice's headline is a number about a round (N slots against N², design §1/§8.1), and the
 * two features before it on this branch each looked finished while doing nothing at all, which
 * only running a round exposed. So nothing below asserts on a helper or a constant — if a test
 * fails with *no record at all*, the round did not reach the point that produces one, and the
 * round is what to fix.
 *
 * Design §1 (the N-times number), §2 (only the earlier participant of a pair can compute the
 * range), §3 (DS is two passes), §5 (the participant order) and §6 (an arrival nobody heard is
 * simply a range that does not exist).
 */
import { describe, expect, it } from 'vitest'
import { hashStr } from '../../src/engine/hash'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, type NodeCfg, type Scenario, type UwbSessionCfg, type Wall,
} from '../../src/model/scenario'
import { UWB_TX_POWER_DBM, uwbM2mBytes } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'

const MS = 1_000_000

/**
 * A run long enough to hold exactly one ranging block's first round and nothing else: the block
 * is 240 000 RSTU (200 ms) and the longest round below is a six-participant DS round (12 slots of
 * 2 ms = 24 ms), so 100 ms contains that round complete and no second block.
 */
const RUN_NS = 100 * MS

/** Six places with no two pairwise distances alike, all inside one 20 × 16 m room and all well
 * inside the 26 m a −14 dBm UWB frame reaches against a −93 dBm receiver: what is measured here
 * is the routing of four times, so every link has to be one that works. */
const PLACES: { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 7, y: 2 }, { x: 3, y: 6 }, { x: 11, y: 9 }, { x: 5, y: 13 }, { x: 15, y: 4 },
]

/** One crystal offset per participant, in ppm — distinct, and spread most of the ±20 ppm the
 * standard allows (§16.4.9). Only the DS-against-SS test switches them on; every other run holds
 * them at zero so that what is left in a range is the route its times took. */
const PPM = [0, 18, -14, 9, -20, 5]

/** Participant ids sort by `byCodeUnit` into exactly this order, so participant i of design §2 is
 * `p-i` and `PLACES[i]` is where it stands. The order is the round's slot order (design §5). */
const idOf = (i: number): string => `p-${i}`

function uwbNode(i: number, role: 'anchor' | 'tag', ppm: number): NodeCfg {
  return {
    id: idOf(i), kind: 'uwb', name: idOf(i), pos: { ...PLACES[i], z: 1 },
    txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
    caps: { generation: 'nonht', features: {} },
    uwb: { role, ppm },
  }
}

/** No timestamp noise, no carrier-offset estimator noise, no excess delay: a range that is wrong
 * here is wrong because a time went the wrong way, not because a draw moved it. */
const QUIET: Partial<UwbSessionCfg> = { nlos: false, tsNoisePs: 0, cfoNoisePpm: 0 }

function scenario(nodes: NodeCfg[], session: Partial<UwbSessionCfg>, walls: Wall[] = []): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'lab' }],
    walls,
    nodes,
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb: { ...DEFAULT_UWB_SESSION, ...session },
  }
}

const run = (sc: Scenario): TLRecord[] => new Simulation(sc).runUntil(RUN_NS).records
const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type) as never

/** One unordered pair, as a key — the quantity design §1's table counts. A many-to-many round
 * measures each pair once; taking turns as the tag measures each of them twice (once in each
 * device's own round), so the pairs have to be counted as pairs for the two arrangements to be
 * comparable at all. */
const pairKey = (a: string, b: string): string => [a, b].sort().join('~')

interface Measured {
  /** Ranging slots the arrangement spent, read off the `UWB_ROUND` records the run emitted — the
   * round's own account of its length, never a constant from `phy.ts`. */
  slots: number
  /** Distinct pairs that ended up with a range. */
  pairs: Set<string>
  ranges: Extract<TLRecord, { type: 'UWB_RANGE' }>[]
  records: TLRecord[]
}

/** One many-to-many round: N participants, one round, one slot each (SS) or two passes of N (DS). */
function manyToMany(
  n: number, session: Partial<UwbSessionCfg> = {}, walls: Wall[] = [], ppm: number[] = PPM.map(() => 0),
): Measured {
  const nodes = Array.from({ length: n }, (_, i) => uwbNode(i, 'tag', ppm[i]))
  const rs = run(scenario(nodes, { mode: 'm2m', method: 'ss', ...QUIET, ...session }, walls))
  const rounds = of(rs, 'UWB_ROUND')
  if (rounds.length === 0) throw new Error('many-to-many: the run emitted no UWB_ROUND at all')
  // Every participant opens the round it is in — there is no listener in this mode — so they all
  // report the same length; one round, one slot count.
  const slots = new Set(rounds.map((r) => r.slots))
  if (slots.size !== 1) throw new Error(`many-to-many: participants disagree on the round length: ${[...slots]}`)
  const ranges = of(rs, 'UWB_RANGE')
  return { slots: rounds[0].slots, pairs: new Set(ranges.map((r) => pairKey(r.node, r.peer))), ranges, records: rs }
}

/**
 * The same N devices, ranged the way the engine could already do it: each of them takes a turn as
 * the tag while the other N−1 answer as anchors, which is N separate one-to-many rounds. Every
 * pair is measured twice — once in each device's own round — so the pairs are counted as pairs,
 * and the slots are summed over all N rounds, because all N of them have to happen.
 */
function takingTurns(n: number): Measured {
  let slots = 0
  const pairs = new Set<string>()
  const ranges: Extract<TLRecord, { type: 'UWB_RANGE' }>[] = []
  const records: TLRecord[] = []
  for (let k = 0; k < n; k++) {
    const nodes = Array.from({ length: n }, (_, i) => uwbNode(i, i === k ? 'tag' : 'anchor', 0))
    const rs = run(scenario(nodes, { mode: 'twr', method: 'ss', replyTime: 'embedded', ...QUIET }))
    const rounds = of(rs, 'UWB_ROUND')
    if (rounds.length !== 1) throw new Error(`taking turns: ${idOf(k)}'s turn ran ${rounds.length} rounds, not 1`)
    slots += rounds[0].slots
    for (const r of of(rs, 'UWB_RANGE')) {
      pairs.add(pairKey(r.node, r.peer))
      ranges.push(r)
    }
    records.push(...rs)
  }
  return { slots, pairs, ranges, records }
}

describe('acceptance: every pair in N slots, where taking turns needs N² (design §1, §8.1)', () => {
  it('measures every pair in N slots where one-to-many needs N squared', () => {
    for (const n of [3, 4, 6]) {
      const m2m = manyToMany(n)
      const otm = takingTurns(n)
      const pairs = (n * (n - 1)) / 2
      // If either of these is empty the round never reached the point that produces a range.
      expect(m2m.pairs.size, `m2m N=${n}: pairs measured`).toBe(pairs)
      expect(otm.pairs.size, `taking turns N=${n}: pairs measured`).toBe(pairs)
      // …and a many-to-many round measures each pair exactly once, which is the other half of
      // why one transmission does two jobs: there is no second, redundant reading anywhere.
      expect(m2m.ranges, `m2m N=${n}: one range per pair`).toHaveLength(pairs)
      expect(otm.ranges, `taking turns N=${n}: each pair measured twice`).toHaveLength(n * (n - 1))
      // The number this slice exists for.
      expect(m2m.slots, `m2m N=${n}: slots`).toBe(n)
      expect(otm.slots, `taking turns N=${n}: slots`).toBe(n * n)
      expect(otm.slots / m2m.slots, `N=${n}: the slot ratio`).toBe(n)
    }
  })
})

describe('the distances themselves (design §8.2)', () => {
  it('gets every distance right', () => {
    for (const n of [3, 4, 6]) {
      const m2m = manyToMany(n)
      expect(m2m.ranges.length, `N=${n}`).toBeGreaterThan(0)
      for (const r of m2m.ranges) {
        // Each record carries the geometry it was measured against, so no truth table is
        // rebuilt here — a pair is scored against its own `trueDistM`.
        expect(Math.abs(r.distM - r.trueDistM), `N=${n} ${r.node}→${r.peer}`).toBeLessThan(0.01)
      }
      // …and they really were different distances, so a round that answered one number for every
      // pair could not have passed the loop above.
      expect(new Set(m2m.ranges.map((r) => Math.round(r.trueDistM * 100))).size).toBe(m2m.ranges.length)
    }
  })
})

describe('only the earlier participant of a pair can compute the range (design §2)', () => {
  it('gives participant i exactly N-1-i ranges, because only the earlier one can compute', () => {
    for (const n of [3, 4, 6]) {
      const m2m = manyToMany(n)
      const got = Array.from({ length: n }, (_, i) => m2m.ranges.filter((r) => r.node === idOf(i)).length)
      expect(got, `N=${n}`).toEqual(Array.from({ length: n }, (_, i) => n - 1 - i))
      // The two ends of design §2's argument, stated as themselves: participant 0 holds every
      // one of the N−1 ranges it takes part in, and participant N−1 — which sends the longest
      // frame of the whole round — holds none at all.
      expect(got[0], `N=${n}: participant 0`).toBe(n - 1)
      expect(got[n - 1], `N=${n}: participant N−1`).toBe(0)
      expect(got.reduce((a, b) => a + b, 0), `N=${n}: the total`).toBe((n * (n - 1)) / 2)
      // …and every range it does hold names a participant later than itself in the round.
      for (const r of m2m.ranges) expect(r.node < r.peer, `${r.node}→${r.peer}`).toBe(true)
    }
  })

  it('makes the last participant send the longest frame of the round and compute nothing', () => {
    // Ruling 5 of the slice ledger, and the half of design §2 worth a lesson: participant i
    // reports i arrival times, so the frames of one round grow monotonically — and the biggest of
    // them belongs to the participant the arithmetic gives nothing. The device that talks the most
    // learns the least; everything in that frame is service to the others.
    const n = 6
    const m2m = manyToMany(n)
    const air = of(m2m.records, 'TX_START')
    expect(air, 'one transmission per participant').toHaveLength(n)
    expect(air.map((r) => r.node)).toEqual(Array.from({ length: n }, (_, i) => idOf(i)))
    const bytes = air.map((r) => r.frame.bytes)
    // Read off the air, and checked against `uwbM2mBytes` — the one function Task 1 sized this
    // frame with — rather than against a copied table of octet counts.
    expect(bytes).toEqual(Array.from({ length: n }, (_, i) => uwbM2mBytes(i)))
    expect(Math.max(...bytes)).toBe(bytes[n - 1])
    expect(m2m.ranges.filter((r) => r.node === idOf(n - 1))).toHaveLength(0)
  })
})

describe('DS many-to-many: two passes, and better when the crystals differ (design §3, §8.4)', () => {
  it('needs two passes for DS and is more accurate than SS when the crystals differ', () => {
    for (const n of [3, 4, 6]) {
      const ds = manyToMany(n, { method: 'ds' })
      expect(ds.slots, `N=${n}: DS slots`).toBe(2 * n)
      expect(ds.pairs.size, `N=${n}: DS pairs`).toBe((n * (n - 1)) / 2)
      for (const r of ds.ranges) {
        expect(r.method, `N=${n} ${r.node}→${r.peer}`).toBe('ds')
        expect(Math.abs(r.distM - r.trueDistM), `N=${n} ${r.node}→${r.peer}`).toBeLessThan(0.01)
      }
    }
    // The same six devices, crystals pulled apart, with the carrier-offset estimator's own
    // residual left on (the session default, 0.2 ppm). SS-TWR has to convert the other end's
    // reply interval into its own timebase with that estimate, and a many-to-many reply interval
    // is whole slots long — 2 ms per slot between the pair, so the residual is worth centimetres
    // to decimetres. DS-TWR cancels the offset by construction and never estimates it at all.
    // `cfoNoisePpm` is named explicitly, at the session default, because `QUIET` zeroes it: with a
    // perfect offset estimate SS-TWR's correction is exact and there is nothing for DS to be
    // better than (measured: 1.5 mm either way, which is the counter quantisation and not a
    // crystal at all). The residual on that estimate is the whole of the difference this test is
    // about, so it has to be switched back on, and said out loud where it is.
    const withPpm: Partial<UwbSessionCfg> = {
      nlos: false, tsNoisePs: 0, cfoNoisePpm: DEFAULT_UWB_SESSION.cfoNoisePpm,
    }
    const ss = manyToMany(6, { method: 'ss', ...withPpm }, [], PPM)
    const ds = manyToMany(6, { method: 'ds', ...withPpm }, [], PPM)
    const err = (m: Measured): number => Math.max(...m.ranges.map((r) => Math.abs(r.distM - r.trueDistM)))
    expect(ss.ranges).toHaveLength(15)
    expect(ds.ranges).toHaveLength(15)
    // Both numbers are reported in the task report; the assertion is the ordering plus a floor
    // under SS's own error, so that "DS is better" cannot pass on two equal, tiny numbers.
    expect(err(ss), 'SS carries the clock-offset residual').toBeGreaterThan(0.02)
    expect(err(ds), 'DS cancels it').toBeLessThan(err(ss) / 5)
  })
})

describe('an arrival nobody heard is a range that does not exist (design §6, §8.5)', () => {
  /** Three brick walls across every path out of the corner `p-0` stands in: 36 dB of loss against
   * the 79 dB the link budget has for a 6 m hop, so nothing of participant 0 is heard and it
   * hears nothing. They cross no other pair's path — every other participant is out at x + y ≥ 9,
   * and these segments only reach x + y = 3.4. */
  const CLOSET: Wall[] = [0, 0.2, 0.4].map((d) => ({
    x1: 0, y1: 3 + d, x2: 3 + d, y2: 0, material: 'brick' as const, openings: [],
  }))

  it('loses exactly the pairs it could not hear', () => {
    const n = 4
    const open = manyToMany(n)
    const walled = manyToMany(n, {}, CLOSET)
    // Participant 0 is the one design §6 is about: it is first in the round, so the ranges it
    // loses by going unheard are the ones between it and *everyone after it* — N−1 of them from
    // a single lost transmission, where a one-to-many round loses one range per lost anchor.
    expect(open.pairs.size).toBe((n * (n - 1)) / 2)
    expect(open.pairs.size - walled.pairs.size, 'pairs lost').toBe(n - 1)
    // What is left is precisely the many-to-many round of the participants that can still hear
    // each other: N−1 of them, so (N−1)(N−2)/2 pairs, and participant i of *that* group holds
    // (N−1)−1−i of them.
    const rest = ((n - 1) * (n - 2)) / 2
    expect(walled.pairs.size, 'pairs left').toBe(rest)
    expect(walled.ranges, 'ranges left').toHaveLength(rest)
    const got = Array.from({ length: n }, (_, i) => walled.ranges.filter((r) => r.node === idOf(i)).length)
    expect(got, 'per participant, with p-0 unheard').toEqual([0, n - 2, n - 3, 0])
    // Not one of the surviving ranges names the silenced participant, at either end.
    for (const r of walled.ranges) expect([r.node, r.peer]).not.toContain(idOf(0))
    // …and the ranges that do survive are still right, so the walls removed pairs rather than
    // corrupting the ones left.
    for (const r of walled.ranges) expect(Math.abs(r.distM - r.trueDistM), `${r.node}→${r.peer}`).toBeLessThan(0.01)
  })
})

describe('determinism, and every other mode byte-identical (design §8.7)', () => {
  /** Captured from this branch's HEAD before any of Task 4 was written. These four modes have no
   * many-to-many code path in them, so they must produce the identical record stream afterwards;
   * the test is expected to pass before the implementation as well as after — it is the guard,
   * not the goal. (The shipped scenes are pinned by `tests/fixtures/lesson-hashes.json` and
   * `uwb-record-hashes.json`; this pins the bare N-node round these tests vary, which no fixture
   * covers.) */
  const BEFORE: Record<string, string> = {
    'twr/ss': '52772af9', 'twr/ds': '9318f0fe', 'dl-tdoa': 'ed319bdd', 'ul-tdoa': 'f1136783',
  }

  const streamOf = (sc: Scenario): string => hashStr(JSON.stringify(
    run(sc).filter((r) => r.type.startsWith('UWB_') || r.type === 'MAC_STATE'),
  )).toString(16)

  it('is deterministic, and every other mode is byte-identical', () => {
    // Deterministic: the same many-to-many scenario, run twice, record for record.
    for (const method of ['ss', 'ds'] as const) {
      for (const n of [3, 6]) {
        const nodes = Array.from({ length: n }, (_, i) => uwbNode(i, 'tag', PPM[i]))
        const sc = scenario(nodes, { mode: 'm2m', method })
        expect(streamOf(sc), `m2m ${method} N=${n}`).toBe(streamOf(sc))
      }
    }
    // …and nothing else moved. Four nodes, because one-way ranging needs four anchors.
    const four = (role: (i: number) => 'anchor' | 'tag'): NodeCfg[] =>
      Array.from({ length: 5 }, (_, i) => uwbNode(i, role(i), PPM[i]))
    const twoWay = four((i) => (i === 4 ? 'tag' : 'anchor'))
    expect(streamOf(scenario(twoWay, { mode: 'twr', method: 'ss' })), 'twr/ss').toBe(BEFORE['twr/ss'])
    expect(streamOf(scenario(twoWay, { mode: 'twr', method: 'ds' })), 'twr/ds').toBe(BEFORE['twr/ds'])
    expect(streamOf(scenario(twoWay, { mode: 'dl-tdoa', method: 'ds' })), 'dl-tdoa').toBe(BEFORE['dl-tdoa'])
    expect(streamOf(scenario(twoWay, { mode: 'ul-tdoa', method: 'ss' })), 'ul-tdoa').toBe(BEFORE['ul-tdoa'])
  })
})

/**
 * Ruling 8 of the slice's ledger. `RoundPlan` carries both `anchors` and `participants`, set from
 * the one constructor argument — and the trap is not the duplication, it is that **`anchors`
 * means two different things by mode**: in a two-way round it counts the devices *other than* the
 * tag (three anchors is four devices), and in many-to-many it counts everyone (three participants
 * is three devices). Anything reading `plan.anchors` in `m2m` while meaning "the devices besides
 * the initiator" is wrong by one.
 *
 * `participants` is the field every m2m path reads. The aliasing is pinned here rather than left
 * incidental, so that the day the two numbers have to diverge, this test is what says so.
 */
describe('Ruling 8: participants and anchors alias each other, and it is checked', () => {
  it('holds participants === anchors in m2m, and a round of exactly that many slots', () => {
    for (const method of ['ss', 'ds'] as const) {
      for (const n of [2, 3, 6, 12]) {
        const plan = roundPlan({ ...DEFAULT_UWB_SESSION, mode: 'm2m', method }, n)
        expect(plan.participants, `${method} N=${n}`).toBe(n)
        expect(plan.participants, `${method} N=${n}: the aliasing`).toBe(plan.anchors)
        expect(plan.slots, `${method} N=${n}: slots`).toBe(method === 'ss' ? n : 2 * n)
        // One round per block, for the whole group (design §5) — not one per tag, of which m2m
        // has none.
        expect(plan.roundsPerBlock, `${method} N=${n}: rounds per block`).toBe(1)
      }
    }
  })

  it('and the m2m round the network actually runs has plan.participants devices in it', () => {
    // Read off the round, not off the plan: the participant count the schedule laid out is the
    // one the devices were dispatched against, which is the claim `anchors` cannot make here.
    const n = 4
    const m2m = manyToMany(n)
    expect(new Set(of(m2m.records, 'UWB_ROUND').map((r) => r.node)).size).toBe(n)
    expect(of(m2m.records, 'TX_START')).toHaveLength(n)
  })
})


