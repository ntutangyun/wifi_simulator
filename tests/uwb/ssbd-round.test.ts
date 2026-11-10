/**
 * Spectrum sensing based deferral over a whole round (standard §10.45 — a P802.15.4ab **draft**
 * clause; see `phy.ts`'s `ssbdBoundNs` and design doc
 * `docs/superpowers/specs/2026-10-03-ssbd-design.md` §0.1 for why it is tagged "draft").
 *
 * **Both paths are per slot now** (2026-11-11, audit #19): `ssbd` off runs CSMA-CA (standard
 * §6.3.2.1), `ssbd` on runs §10.45, and either one is applied by initiator and responder
 * independently **in every transmission slot**, as §10.39.8.3 asks. (The engine used to latch a busy
 * reading for the rest of the 200 ms block when `ssbd` was off.) Every CCA lasts phyCcaDuration,
 * 128 µs (audit #20), so at the defaults `ssbdBoundNs` (788 µs) is longer than a POLL's window.
 *
 * **The instrument, said out loud.** A `Spectrum` with one Wi-Fi emission parked over the control
 * channel for the whole run, at an EIRP chosen so the two questions come apart:
 *   - 0 dBm — `foreignDbm` reads −61.96 dBm at these nodes, above the −71.02 dBm energy-detection
 *     threshold, so **every CCA is busy** — and still far enough under a narrowband frame's own
 *     received power that no frame is lost to it. A busy channel whose traffic survives is what
 *     lets a round with SSBD on run to completion and be compared, frame for frame, with the same
 *     round that never listened.
 *   - no emission — nothing foreign on the air at all, so every CCA is clear and the algorithm
 *     ends on its first one. This is where the backoff is read off the timeline.
 * Nothing below asserts a number this file does not either read out of the run or compute from
 * the engine's own exports (`ssbdBoundNs`, `nbSlotSlackNs`, `NB_POLL_BYTES`, `rstuNs`).
 */
import { describe, it, expect } from 'vitest'
import { uwbNbaScenario } from '../../src/course/uwb/uwb-nba'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { Spectrum, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, UwbMmsSchema,
  type NodeCfg, type UwbMmsCfg, type UwbSessionCfg, type UwbSsbdCfg,
} from '../../src/model/scenario'
import { UwbNetwork } from '../../src/uwb/network'
import {
  nbBand, NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES, nbLbtRequired,
} from '../../src/uwb/nb'
import { nbSlotSlackNs, rstuNs, ssbdBoundNs, SSBD_BF_UNIT_MAX, UWB_TX_POWER_DBM } from '../../src/uwb/phy'

const MS = 1_000_000
const US = 1_000
/** The session's own ranging slot: the shortest an MMS round may legally use. */
const SLOT_RSTU = 600
const SLOT_NS = rstuNs(SLOT_RSTU)
/** The control channel every run below hops to — the session default, and a UNII-3 one, where
 * the regulation does **not** oblige a device to listen first (`nbLbtRequired(3, 'auto')`). */
const NB_CHANNEL = DEFAULT_UWB_SESSION.mms.nbChannels[0]
/** One ranging block, so "per block" and "per slot" can be told apart by eye. */
const BLOCK_NS = 200 * MS
/** The coexistence lesson's own window: seven whole blocks. */
const LESSON_RUN_NS = 1300 * MS
const NB_KINDS = new Set(['nbPoll', 'nbResp', 'nbReport'])
/** Busy for the energy detect, harmless to a narrowband frame — see the file comment. */
const BUSY_EIRP_DBM = 0

const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T, node?: string): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type && (node === undefined || (r as { node?: string }).node === node)) as never

const nbTx = (rs: TLRecord[], node?: string): Extract<TLRecord, { type: 'TX_START' }>[] =>
  of(rs, 'TX_START', node).filter((r) => NB_KINDS.has(r.frame.kind))

const uwbNode = (id: string, x: number, y: number, role: 'anchor' | 'tag', ppm: number): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM, profiles: ['idle'],
  caps: { generation: 'nonht', features: {} }, uwb: { role, ppm },
})

interface RunOpts {
  /** The session's `ssbd`, parsed through the real schema so no test can run a configuration the
   * editor would refuse. `undefined` leaves it off. */
  ssbd?: Partial<UwbSsbdCfg>
  nbLbt?: UwbMmsCfg['nbLbt']
  /** EIRP of the emission parked over the control channel; null leaves the air empty. */
  eirpDbm?: number | null
  /** No mediator at all — a scenario with no 6 GHz Wi-Fi link (design doc §5, first row). */
  noSpectrum?: boolean
  runNs?: number
}

/**
 * Three anchors and one tag, driven by hand so a `Spectrum` can be built around them: the
 * simulator makes its own, and a CCA has nothing to read without one. Pair rounds, so a block
 * holds a round per anchor and the tag has a POLL **and** a REPORT window of its own in each —
 * which is how many narrowband transmit slots one block really has.
 */
function run(o: RunOpts = {}): TLRecord[] {
  const nodes = [
    uwbNode('anc-1', 1, 1, 'anchor', 5),
    uwbNode('anc-2', 4, 1, 'anchor', -7),
    uwbNode('anc-3', 1, 4, 'anchor', 11),
    uwbNode('tag-1', 4, 4, 'tag', -15),
  ]
  const q = new EventQueue()
  let now = 0
  const recs: TLRecord[] = []
  const emit = makeEmitter((x) => recs.push(x as TLRecord))
  const sp = o.noSpectrum ? null : new Spectrum([], q, () => now)
  const eirpDbm = o.eirpDbm ?? null
  if (sp && eirpDbm !== null) {
    const band = nbBand(NB_CHANNEL)
    sp.emit('wifi', {
      txId: 'ap', eirpDbm, bandLoMhz: band.lo - 10, bandHiMhz: band.hi + 10,
      pos: { x: 5, y: 5, z: 1 }, lossDb: wifiToUwbPathLossDb,
    })
  }
  const mms = UwbMmsSchema.parse({
    ...DEFAULT_UWB_SESSION.mms,
    nbLbt: o.nbLbt ?? 'on',
    ...(o.ssbd ? { ssbd: o.ssbd } : {}),
  })
  const cfg: UwbSessionCfg = {
    ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: SLOT_RSTU, aoa: false, nlos: false, mms,
  }
  new UwbNetwork(q, () => now, nodes, [], cfg, new Rng(7), emit, sp, 7)
  for (;;) {
    const t = q.peekTime()
    if (t === null || t > (o.runNs ?? BLOCK_NS + 10 * MS)) break
    const e = q.pop()!
    now = e.t
    e.fn()
  }
  return recs
}

/**
 * The coexistence lesson's own scene, with `ssbd` patched in and the whole scenario re-parsed, so
 * the configuration under test is one the editor would accept. `'pairwise'` is the four-anchor
 * pair-round variant on control channel 200 — inside the router's 80 MHz — and `'noLbt'` is the
 * same scene with listen-before-talk switched off, which is what SSBD is measured against.
 * Memoised: 1.3 s of Wi-Fi is the most expensive thing in this file.
 */
const lessonRuns = new Map<string, TLRecord[]>()
function lesson(variant: 'pairwise' | 'noLbt', ssbd: Partial<UwbSsbdCfg> | null): TLRecord[] {
  const key = `${variant}|${JSON.stringify(ssbd)}`
  const hit = lessonRuns.get(key)
  if (hit) return hit
  const base = uwbNbaScenario(variant)
  // Checked rather than asserted away: the helper is only meaningful for a scene that has a
  // ranging session, and `Scenario.uwb` is optional for the scenes that do not.
  if (!base.uwb) throw new Error(`uwb-nba's ${variant} scene has no ranging session`)
  const sc = ScenarioSchema.parse({
    ...base, uwb: { ...base.uwb, mms: { ...base.uwb.mms, ...(ssbd ? { ssbd } : {}) } },
  })
  const rs = [...new Simulation(sc).runUntil(LESSON_RUN_NS).records]
  lessonRuns.set(key, rs)
  return rs
}

/** The five fields at the draft's own defaults — what `ssbd: {}` parses to. */
const DEFAULTS: UwbSsbdCfg = UwbMmsSchema.parse({ ...DEFAULT_UWB_SESSION.mms, ssbd: {} }).ssbd!
/** The algorithm's own worst-case latency at those defaults: 788 µs, computed, never typed. */
const BOUND_NS = ssbdBoundNs(DEFAULTS)
/** The room a POLL's own two-slot window leaves once the PPDU is paid for: 424 µs, computed. */
const POLL_SLACK_NS = nbSlotSlackNs(SLOT_NS, NB_POLL_BYTES)

describe('SSBD over a round — standard §10.45 (draft)', () => {
  it('runs CSMA-CA in every slot when ssbd is off, instead of silencing the block', () => {
    const rs = run({ eirpDbm: BUSY_EIRP_DBM, runNs: 2 * BLOCK_NS - 1 })
    const lbt = of(rs, 'UWB_NB_LBT')
    expect(of(rs, 'UWB_SSBD')).toEqual([])
    // Every pair round of both blocks tries its POLL again (no latch): three rounds a block.
    for (const b of [0, 1]) {
      const rounds = new Set(lbt.filter((r) => r.block === b).map((r) => r.round))
      expect(rounds.size).toBe(3)
    }
    for (const l of lbt.filter((r) => r.outcome !== 'noRoom')) {
      expect(l.foreignDbm).toBeGreaterThanOrEqual(NB_LBT_THRESHOLD_DBM)
      expect(l.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
    }
    // The channel never clears, so every attempt ends without sending: no cycle, no range.
    expect(nbTx(rs)).toEqual([])
    expect(of(rs, 'UWB_RANGE')).toEqual([])
  })

  it('runs once per narrowband slot, not once per block', () => {
    const on = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: {} })
    expect(of(on, 'UWB_NB_LBT')).toEqual([])
    const recs = of(on, 'UWB_SSBD')
    expect(recs.length).toBeGreaterThan(0)
    // No two of one device's attempts share a slot of one round, and a block holds an attempt in
    // every one of its rounds — which is the whole of "per slot, not per block".
    const perRound = new Map<string, number[]>()
    for (const r of recs) {
      const key = `${r.node}|${r.block}|${r.round}`
      perRound.set(key, [...(perRound.get(key) ?? []), r.slot])
    }
    for (const [key, slots] of perRound) expect(new Set(slots).size, key).toBe(slots.length)
    expect([...perRound.keys()].filter((k) => k.startsWith('tag-1|0|'))).toHaveLength(3)
  })

  it('runs the window out at the defaults against a channel that never clears', () => {
    // Six CCAs of 128 µs (maxBackoffs + 1) are more than a POLL's 424 µs of room: the attempt
    // ends `noRoom` before the end action is ever reached, so nothing is sent — where with a
    // 9 µs instantaneous CCA the defaults ran out of backoffs and transmitted anyway (TxOnEnd).
    expect(BOUND_NS).toBeGreaterThan(POLL_SLACK_NS)
    const ssbd = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: {} })
    const outcomes = of(ssbd, 'UWB_SSBD')
    expect([...new Set(outcomes.map((r) => r.outcome))]).toEqual(['noRoom'])
    expect(nbTx(ssbd)).toEqual([])
    // Not listening at all is what still ranges.
    expect(of(run({ eirpDbm: BUSY_EIRP_DBM, nbLbt: 'off' }), 'UWB_RANGE').length).toBeGreaterThan(0)
  })

  it('moves the transmission inside its slot as the backoff unit rises', () => {
    // A clear channel, so the algorithm ends on its first CCA and the only thing on the timeline
    // is the one backoff it drew before it. The factor is pinned top and bottom so every attempt
    // draws against the same BF, and the unit is swept to what the slot's own room allows.
    const BF = 7
    const maxUnit = Math.floor(POLL_SLACK_NS / US / BF)
    expect(maxUnit).toBeLessThanOrEqual(SSBD_BF_UNIT_MAX)
    const units = [1, Math.floor(maxUnit / 4), Math.floor(maxUnit / 2), maxUnit]
    const offsets = units.map((unitBackoffUs) => {
      const rs = run({ ssbd: { minBf: BF, maxBf: BF, unitBackoffUs } })
      const slots = new Map<string, number>()
      for (const s of of(rs, 'UWB_SLOT', 'tag-1')) slots.set(`${s.slot}@${s.t}`, s.t)
      const starts = [...slots.values()].sort((x, y) => x - y)
      return nbTx(rs, 'tag-1').filter((r) => r.frame.kind === 'nbPoll').map((r) => {
        const start = starts.filter((s) => s <= r.t).pop()!
        return r.t - start
      })
    })
    // Every POLL, at every unit, sits inside its own window's room.
    for (const row of offsets) {
      expect(row.length).toBeGreaterThan(1)
      for (const off of row) {
        expect(off).toBeGreaterThanOrEqual(0)
        expect(off).toBeLessThanOrEqual(POLL_SLACK_NS)
      }
    }
    // …and it moves later as the unit rises: no POLL ever earlier than at the unit below, and the
    // block's transmissions later in total every time.
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toHaveLength(offsets[0].length)
      offsets[i].forEach((off, k) => expect(off).toBeGreaterThanOrEqual(offsets[i - 1][k]))
      const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
      expect(sum(offsets[i])).toBeGreaterThan(sum(offsets[i - 1]))
    }
  })

  it('clamps the draw to the slot it has to fit in, and says so', () => {
    // One backoff unit past what the window holds: the draw is unaffordable, the wait is cut to
    // the room there is, and the record carries both numbers.
    const BF = 7
    const unitBackoffUs = Math.floor(POLL_SLACK_NS / US / BF) + 1
    const rs = run({ ssbd: { minBf: BF, maxBf: BF, unitBackoffUs } })
    const clamped = of(rs, 'UWB_SSBD').filter((r) => r.outcome === 'clamped')
    expect(clamped.length).toBeGreaterThan(0)
    for (const r of clamped) {
      expect(r.drawnUnits * unitBackoffUs * US).toBeGreaterThan(r.backoffNs)
      expect(r.backoffNs).toBeLessThanOrEqual(POLL_SLACK_NS)
    }
    // Nothing waits past its own window, whatever it drew.
    for (const r of of(rs, 'UWB_SSBD')) expect(r.backoffNs).toBeLessThanOrEqual(POLL_SLACK_NS)
  })

  // 2026-11-11 (audit #19, #20): in the coexistence scene every CCA averages the router's traffic
  // over 128 µs and reads busy; the window runs out before any end action, with SSBD or CSMA-CA.
  it('still loses to the router in the coexistence scene, whatever the backoff', () => {
    const BF = 7
    const biggest = Math.floor(POLL_SLACK_NS / US / BF)
    const off = lesson('noLbt', null)
    const csma = lesson('pairwise', null)
    const defaults = lesson('pairwise', {})
    const maxWait = lesson('pairwise', { minBf: BF, maxBf: BF, unitBackoffUs: biggest })
    const ranges = (rs: TLRecord[]): number => of(rs, 'UWB_RANGE').length
    expect(ranges(off)).toBeGreaterThan(0)
    expect([ranges(csma), ranges(defaults), ranges(maxWait)]).toEqual([0, 0, 0])
    expect(new Set(of(defaults, 'UWB_SSBD').map((r) => r.outcome))).toEqual(new Set(['noRoom']))
    // the biggest backoff that fits the POLL's window is still clamped against the room CCAs leave
    expect(of(maxWait, 'UWB_SSBD').filter((r) => r.outcome === 'clamped').length).toBeGreaterThan(0)
  })

  it('leaves UWB_RANGE field-for-field identical when the channel is always clear', () => {
    const on = run({ ssbd: {} })
    const off = run()
    const strip = (rs: TLRecord[]): unknown[] =>
      of(rs, 'UWB_RANGE').map(({ t, seq, ...rest }) => rest as unknown)
    expect(strip(on)).toEqual(strip(off))
    expect(strip(on).length).toBeGreaterThan(0)
    // Every CCA came back clear, so the algorithm ended on its first one at NB = 0.
    const recs = of(on, 'UWB_SSBD')
    expect(recs.length).toBeGreaterThan(0)
    for (const r of recs) {
      expect(r.outcome).toBe('idle')
      expect(r.nb).toBe(0)
      expect(r.bf).toBe(DEFAULTS.minBf)
      expect(r.backoffNs).toBeLessThanOrEqual(DEFAULTS.minBf * DEFAULTS.unitBackoffUs * US)
    }
  })

  it('senses on a UNII-3 channel too, where the regulation does not require listening', () => {
    // Not an empty configuration: the draft lets the same method be used for coexistence where
    // no regulation obliges a device to listen (§10.39.8.3's last sentence), and `auto` on this
    // channel is exactly that case.
    expect(nbLbtRequired(NB_CHANNEL, 'auto')).toBe(false)
    const rs = run({ nbLbt: 'auto', eirpDbm: BUSY_EIRP_DBM, ssbd: {} })
    expect(of(rs, 'UWB_SSBD').length).toBeGreaterThan(0)
    expect(of(rs, 'UWB_NB_LBT')).toEqual([])
  })

  it('reports a channel-access failure, and sends nothing, when the end action is FailOnEnd', () => {
    // maxBackoffs 1: two 128 µs CCAs fit the POLL's window, so the end action is reached.
    const fail = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: { txOnEnd: false, maxBackoffs: 1 } })
    const recs = of(fail, 'UWB_SSBD')
    expect(recs.length).toBeGreaterThan(0)
    expect([...new Set(recs.map((r) => r.outcome))]).toEqual(['failOnEnd'])
    expect(nbTx(fail)).toEqual([])
    expect(of(fail, 'UWB_NB_LBT')).toEqual([])
  })

  it('sends no UWB_SSBD at all when ssbd is null', () => {
    for (const o of [
      { eirpDbm: BUSY_EIRP_DBM }, { eirpDbm: null }, { noSpectrum: true }, { nbLbt: 'off' as const },
    ]) {
      expect(of(run(o), 'UWB_SSBD'), JSON.stringify(o)).toEqual([])
    }
  })
})
