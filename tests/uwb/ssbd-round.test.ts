/**
 * Spectrum sensing based deferral over a whole round (standard §10.45 — a P802.15.4ab **draft**
 * clause; see `phy.ts`'s `ssbdBoundNs` and design doc
 * `docs/superpowers/specs/2026-10-03-ssbd-design.md` §0.1 for why it is tagged "draft").
 *
 * **What this slice replaces.** `ssbd` off, a busy narrowband reading is not a back-off at all:
 * `device.mms.ts#nbClear` sets the device's `nbSkipBlock`, and that device sends nothing
 * narrowband for the rest of a 200 ms ranging block — no POLL, no cycle, the block gone. The
 * first test below pins that behaviour, because it must not move. Every test after it is the
 * per-slot channel access §10.39.8.3 actually asks for: one of CSMA-CA or SSBD, run by initiator
 * and responder independently, **in every transmission slot**.
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
  nbBand, NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES, NB_REPORT_BYTES, nbLbtRequired,
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
/** The algorithm's own worst-case latency at those defaults: 74 µs, computed, never typed. */
const BOUND_NS = ssbdBoundNs(DEFAULTS)
/** The room a POLL's own two-slot window leaves once the PPDU is paid for: 424 µs, computed. */
const POLL_SLACK_NS = nbSlotSlackNs(SLOT_NS, NB_POLL_BYTES)

/**
 * Every record but the SSBD ones, with the instant dropped and **grouped by the device it
 * belongs to** — "the same devices doing the same things in the same order, only later inside
 * their slots". The instants are compared separately, against a computed bound.
 *
 * Per node rather than one flat list, and that is a measured distinction rather than a
 * convenience: a transmission that moves `backoffNs` into its own window is still the same
 * transmission, but it now falls *after* the far end's listen window opened in that same slot
 * instead of before it. The two runs hold the same records, node for node and in each node's own
 * order; what the backoff reorders is only which of two devices appears first at one instant.
 */
const shape = (rs: TLRecord[]): Record<string, unknown[]> => {
  const by: Record<string, unknown[]> = {}
  for (const r of rs) {
    if (r.type === 'UWB_SSBD') continue
    const { t, seq, ...rest } = r as { t: number; seq?: number; node?: string }
    const key = rest.node ?? '—'
    by[key] = [...(by[key] ?? []), rest as unknown]
  }
  return by
}

describe('SSBD over a round — standard §10.45 (draft)', () => {
  it('still goes silent for the whole block when ssbd is off', () => {
    // Two whole blocks and no more: block 2 would open exactly at 2 × 200 ms.
    const rs = run({ eirpDbm: BUSY_EIRP_DBM, runNs: 2 * BLOCK_NS - 1 })
    const lbt = of(rs, 'UWB_NB_LBT')
    // One busy reading per device per block, and nothing per slot: the device stops asking.
    expect(lbt.map((r) => [r.node, r.block])).toEqual([['tag-1', 0], ['tag-1', 1]])
    expect(of(rs, 'UWB_SSBD')).toEqual([])
    for (const l of lbt) {
      expect(l.foreignDbm).toBeGreaterThanOrEqual(NB_LBT_THRESHOLD_DBM)
      expect(l.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
      // …and after it, no narrowband transmission of that node for the rest of its block.
      const after = nbTx(rs, l.node).filter((x) => x.t > l.t && x.t < (l.block + 1) * BLOCK_NS)
      expect(after).toEqual([])
    }
    // The whole block is gone with the POLL, at both ends.
    expect(nbTx(rs)).toEqual([])
    expect(of(rs, 'UWB_RANGE')).toEqual([])
  })

  it('runs once per narrowband slot, not once per block', () => {
    const on = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: {} })
    const off = run({ eirpDbm: BUSY_EIRP_DBM })
    // The per-block path is not taken at all: no UWB_NB_LBT, and the record it is replaced by
    // appears once for every narrowband transmission the block really holds.
    expect(of(on, 'UWB_NB_LBT')).toEqual([])
    const recs = of(on, 'UWB_SSBD')
    const tx = nbTx(on)
    expect(tx.length).toBeGreaterThan(of(off, 'UWB_NB_LBT').length)
    expect(recs).toHaveLength(tx.length)
    // Each record is its own transmission's: same node, and the transmission follows it inside
    // the algorithm's computed bound.
    recs.forEach((r, i) => {
      expect(r.node).toBe(tx[i].node)
      expect(tx[i].t - r.t).toBeGreaterThanOrEqual(0)
      expect(tx[i].t - r.t).toBeLessThanOrEqual(BOUND_NS)
    })
    // …and no two of one device's attempts share a slot of one round, while a round holds more
    // than one of them — which is the whole of "per slot, not per block".
    const perRound = new Map<string, number[]>()
    for (const r of recs) {
      const key = `${r.node}|${r.block}|${r.round}`
      perRound.set(key, [...(perRound.get(key) ?? []), r.slot])
    }
    for (const [key, slots] of perRound) {
      expect(new Set(slots).size, key).toBe(slots.length)
    }
    const tagRound = [...perRound].filter(([k]) => k.startsWith('tag-1|0|'))
    expect(tagRound.length).toBeGreaterThan(1)
    expect(Math.max(...tagRound.map(([, s]) => s.length))).toBeGreaterThan(1)
  })

  it('is the same transmissions as turning listen-before-talk off, at the defaults', () => {
    // The lesson's first sentence: 74 µs cannot outwait anything, so the backoffs are exhausted
    // and the default end action transmits regardless.
    const ssbd = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: {} })
    const noLbt = run({ eirpDbm: BUSY_EIRP_DBM, nbLbt: 'off' })
    const lbtOn = run({ eirpDbm: BUSY_EIRP_DBM })
    expect(shape(ssbd)).toEqual(shape(noLbt))
    expect(shape(lbtOn)).not.toEqual(shape(noLbt))
    // Nothing was prevented: no attempt ended in a channel-access failure, and the ones that did
    // find the channel busy ran out of backoffs and transmitted anyway. Both outcomes appear
    // because the CCA is each device's own reading at its own position — the emission is 1.4 m
    // from the tag and 5.7 m from the far anchors, so the two ends of this round genuinely
    // disagree about the channel, which is §10.39.8.3's "independently at initiator and
    // responder" showing up as data.
    const outcomes = of(ssbd, 'UWB_SSBD')
    expect(outcomes.filter((r) => r.outcome === 'failOnEnd')).toEqual([])
    expect(outcomes.filter((r) => r.outcome === 'clamped')).toEqual([])
    expect(outcomes.filter((r) => r.outcome === 'txOnEnd').length).toBeGreaterThan(0)
    for (const r of outcomes.filter((x) => x.outcome === 'txOnEnd')) {
      expect(r.nb).toBe(DEFAULTS.maxBackoffs)
      expect(r.foreignDbm).toBeGreaterThanOrEqual(NB_LBT_THRESHOLD_DBM)
    }
    // The one thing that did move is where inside its slot each message went out, and it moved
    // by less than the algorithm's own bound.
    const a = nbTx(ssbd)
    const b = nbTx(noLbt)
    expect(a).toHaveLength(b.length)
    a.forEach((x, i) => {
      expect(x.t - b[i].t).toBeGreaterThanOrEqual(0)
      expect(x.t - b[i].t).toBeLessThanOrEqual(BOUND_NS)
    })
    expect(Math.max(...a.map((x, i) => x.t - b[i].t))).toBeGreaterThan(0)
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

  it('still loses to the longest Wi-Fi frame in the scene', () => {
    // The coexistence scene itself, not the synthetic emission: a Wi-Fi 7 router and a saturated
    // laptop on 6 GHz channel 71, with the control channel inside their 80 MHz, over 1.3 s.
    const BF = 7
    const biggest = Math.floor(POLL_SLACK_NS / US / BF)
    const off = lesson('noLbt', null)
    const perBlock = lesson('pairwise', null)
    const defaults = lesson('pairwise', {})
    const maxWait = lesson('pairwise', { minBf: BF, maxBf: BF, unitBackoffUs: biggest })
    const ranges = (rs: TLRecord[]): number => of(rs, 'UWB_RANGE').length
    // What the per-block rule costs, which is what this slice replaces: almost every cycle.
    expect(ranges(perBlock)).toBeLessThan(ranges(off) / 10)
    // At the defaults SSBD recovers them — because it defers nothing it cannot outwait and the
    // end action transmits regardless, which is the same thing as not listening.
    expect(ranges(defaults)).toBeGreaterThan(ranges(perBlock) * 10)
    expect(Math.abs(ranges(defaults) - ranges(off))).toBeLessThan(ranges(off) / 10)
    // And the biggest backoff that fits its own window does **not** improve on that. It is paid
    // inside the window the message still has to fit in, so the message goes out at the end of
    // its window instead of the start — against a neighbour whose longest frame is longer than
    // the whole window's room.
    const longest = Math.max(...of(off, 'TX_START')
      .filter((r) => r.frame.kind === 'data').map((r) => r.frame.txTimeNs))
    expect(longest).toBeGreaterThan(POLL_SLACK_NS)
    expect(longest).toBeGreaterThan(BF * biggest * US)
    expect(ranges(maxWait)).toBeLessThanOrEqual(ranges(off))
    expect(ranges(maxWait)).toBeLessThan(ranges(defaults))
    // …and a backoff sized for the POLL's window does not even fit the REPORT's, the REPORT being
    // the longer message of the two: 392 µs of room against 424 µs, both computed.
    const clamped = of(maxWait, 'UWB_SSBD').filter((r) => r.outcome === 'clamped')
    expect(clamped.length).toBeGreaterThan(0)
    expect(BF * biggest * US).toBeGreaterThan(nbSlotSlackNs(SLOT_NS, NB_REPORT_BYTES))
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
    const fail = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: { txOnEnd: false } })
    const recs = of(fail, 'UWB_SSBD')
    expect(recs.length).toBeGreaterThan(0)
    expect([...new Set(recs.map((r) => r.outcome))]).toEqual(['failOnEnd'])
    expect(nbTx(fail)).toEqual([])
    // …and it is still not the per-block path: that one asks once a block, this one asks in
    // every slot it had a message for.
    expect(of(fail, 'UWB_NB_LBT')).toEqual([])
    expect(recs.length).toBeGreaterThan(of(run({ eirpDbm: BUSY_EIRP_DBM }), 'UWB_NB_LBT').length)
  })

  it('sends no UWB_SSBD at all when ssbd is null', () => {
    for (const o of [
      { eirpDbm: BUSY_EIRP_DBM }, { eirpDbm: null }, { noSpectrum: true }, { nbLbt: 'off' as const },
    ]) {
      expect(of(run(o), 'UWB_SSBD'), JSON.stringify(o)).toEqual([])
    }
  })
})
