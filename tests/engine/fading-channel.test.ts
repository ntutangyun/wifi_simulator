/**
 * Fading where it meets the medium: the channel asking for a level, and — the part
 * that matters — a whole round run twice and read, rather than arithmetic checked.
 *
 * Per the design's §6 the last two cases are the acceptance criteria. An arithmetic
 * test cannot tell a wired-up feature from a dead one: the two layers in
 * `fading.ts` were already proved to have the right distributions, and would go on
 * passing if nothing ever asked them for a number. So a still scene is run to its
 * end and its records counted, because that is the only evidence that turning
 * fading on changes what the simulator does.
 */
import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { FADING_DEFAULTS, type FadingCfg } from '../../src/engine/fading'
import { txTimeNs } from '../../src/engine/phy'
import { Simulation } from '../../src/engine/simulation'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { defaultScenario, type Scenario } from '../../src/model/scenario'

const MS = 1_000_000
const RUN_NS = 300 * MS

/** The static level of the one link both directions of these channel cases use. */
const STATIC_DBM = -60

const frame = (src: string, dst: string): FrameDesc => ({
  kind: 'data', src, dst, bytes: 1428, mbps: 54, durationFieldNs: 0, txTimeNs: txTimeNs(1428, 54),
})

const DEAF: PhyListener = {
  onCcaBusy: () => {}, onCcaIdle: () => {}, onRxStart: () => {}, onRxOk: () => {}, onRxCorrupt: () => {},
}

/**
 * A channel with one link at `STATIC_DBM` in both directions, and a hand on the clock:
 * these cases put a PPDU on the air and then ask the channel for its level over and
 * over, at instants of their own choosing, which is what the real callers do.
 */
function oneLink(fading?: { cfg: FadingCfg; seed: number }) {
  const q = new EventQueue()
  let now = 0
  const table = new Map([
    ['ap', new Map([['sta', STATIC_DBM]])],
    ['sta', new Map([['ap', STATIC_DBM]])],
  ])
  const ch = new Channel(q, () => now, table, makeEmitter(() => {}), undefined, undefined, fading)
  ch.register('ap', DEAF)
  ch.register('sta', DEAF)
  /**
   * What the channel itself would measure for the PPDU `ap` has on the air — the
   * private path every one of its own questions goes down, reached the way
   * `widgetModel.test.ts` reaches the link table, so that the hundred asks below
   * are the very asks carrier sense, capture and SINR make.
   */
  const askLevel = (): number => {
    const inner = ch as unknown as {
      active: unknown[]
      rxDbmOf: (tx: unknown, rxId: string) => number
    }
    return inner.rxDbmOf(inner.active[inner.active.length - 1], 'sta')
  }
  /** Drain the queue to `t` — enough to let one PPDU end before the next begins. */
  const runUntil = (t: number): void => {
    for (;;) {
      const pt = q.peekTime()
      if (pt === null || pt > t) break
      const e = q.pop()!
      now = e.t
      e.fn()
    }
    now = t
  }
  const startFrame = (at: number): void => {
    runUntil(at)
    ch.startTx('ap', frame('ap', 'sta'))
  }
  return { askLevel, startFrame, setNow: (t: number) => { now = t } }
}

/**
 * The default house with one station left in it, saturated, standing where it always
 * stood — 3.7 m from the AP across an open room, which the propagation model says
 * carries the top MCS with room to spare.
 *
 * Nothing else transmits, so there is nothing to collide with, and the geometry alone
 * loses no frame: measured over 300 ms this scene produces **zero** RX_FAIL and zero
 * RETRY. That zero is what makes the count below a proof rather than a measurement —
 * every failure a faded run holds has to have come from the link varying, because
 * there is nothing else left in the scene to blame.
 */
function stillScene(fading?: Record<string, unknown>): Scenario {
  const base = defaultScenario()
  const sc = {
    ...base,
    nodes: [base.nodes[0], { ...base.nodes[1], profiles: ['saturated'] }],
    ...(fading ? { fading } : {}),
  }
  return sc as Scenario
}

/**
 * Fading on, at a coherence time short enough that one 300 ms run crosses many
 * intervals of shadowing rather than sitting inside one.
 *
 * Written the way a plan on disk holds it — the schema's *input* shape, three fields
 * absent and filled from `FADING_DEFAULTS` by the parse. That is deliberate on two
 * counts: it is the opt-in `FadingSchema` was designed around, and it is the only
 * shape a Rayleigh section can have, since the cross-field rule refuses a K factor
 * written beside a distribution that would never read it while `FadingCfg` requires
 * one. Hence the cast, and hence the engine reading the parsed section.
 */
const SCENE_FADING = { coherenceMs: 10 }

/** The same figures as `SCENE_FADING`, for the cases that hand the channel a config directly. */
const CH_FADING: FadingCfg = { ...FADING_DEFAULTS, coherenceMs: 10 }

function run(sc: Scenario): TLRecord[] {
  const sim = new Simulation(sc)
  return sim.runUntil(RUN_NS).records
}

function hashOf(sc: Scenario): string {
  const sim = new Simulation(sc)
  sim.runUntil(RUN_NS)
  return sim.timelineHash()
}

/** Every MCS the station sent an uplink data PPDU with, in one run. */
function mcsUsed(records: TLRecord[]): Set<number> {
  const out = new Set<number>()
  for (const r of records) {
    if (r.type !== 'TX_START' || r.node !== 'sta-1') continue
    const f = r.frame
    if (f.kind === 'data' && f.mcs !== undefined) out.add(f.mcs)
  }
  return out
}

const failures = (records: TLRecord[]): number =>
  records.filter((r) => r.type === 'RX_FAIL' || r.type === 'RETRY').length

describe('fading at the channel', () => {
  it('is byte-identical to today when fading is absent', () => {
    // Measured on 7b98a1d, the commit before fading reached the channel at all;
    // `lesson-hashes.json` and `uwb-record-hashes.json` carry the same guarantee
    // for every shipped scenario, and this pins the scene these cases use.
    expect(hashOf(stillScene())).toBe('7074a7b9')
    // And the guard has teeth: turning fading on must move that hash, or the
    // config is being parsed and then ignored.
    expect(hashOf(stillScene(SCENE_FADING))).not.toBe(hashOf(stillScene()))
  })

  it('leaves the table untouched when fading is absent — the same number, not a rounded one', () => {
    const { askLevel, startFrame } = oneLink()
    startFrame(1000)
    expect(askLevel()).toBe(STATIC_DBM)
  })

  it('gives one frame one level however many times the channel asks', () => {
    const { askLevel, startFrame, setNow } = oneLink({ cfg: CH_FADING, seed: 42 })
    startFrame(1000)
    const first = askLevel()
    // Not the static level: a frame that fades by exactly nothing would make the
    // hundred agreeing answers meaningless.
    expect(first).not.toBe(STATIC_DBM)
    for (let i = 0; i < 100; i++) {
      // Carrier sense asks at the start, SINR again later — and a coherence
      // boundary inside the frame must not move the level either.
      setNow(1000 + i * MS)
      expect(askLevel()).toBe(first)
    }
  })

  it('gives the next frame a different level', () => {
    const { askLevel, startFrame } = oneLink({ cfg: CH_FADING, seed: 42 })
    startFrame(1000)
    const first = askLevel()
    startFrame(20 * MS)
    expect(askLevel()).not.toBe(first)
  })

  it('takes the four defaults from a bare `fading: {}` rather than four undefineds', () => {
    // A plan opts in by writing an empty section, and it is the schema that turns that
    // into four numbers. Reading the section as it was handed in instead would multiply
    // by an undefined sigma, make every level NaN and fail every frame in the scene —
    // which the two counting cases below would happily read as "fading works".
    const recs = run(stillScene({}))
    expect(recs.filter((r) => r.type === 'RX_OK').length).toBeGreaterThan(100)
  })

  it('is deterministic: the same scenario and seed twice give the same timeline hash', () => {
    expect(hashOf(stillScene(SCENE_FADING))).toBe(hashOf(stillScene(SCENE_FADING)))
    expect(hashOf({ ...stillScene(SCENE_FADING), seed: 43 })).not.toBe(hashOf(stillScene(SCENE_FADING)))
  })

  it('actually makes frames fail: a still scene with fading on produces RX_FAIL or RETRY', () => {
    expect(failures(run(stillScene()))).toBe(0)
    expect(failures(run(stillScene(SCENE_FADING)))).toBeGreaterThan(0)
  })

  it('actually makes the rate move: one link uses at least two different MCS in one run', () => {
    expect(mcsUsed(run(stillScene())).size).toBe(1)
    expect(mcsUsed(run(stillScene(SCENE_FADING))).size).toBeGreaterThanOrEqual(2)
  })
})
