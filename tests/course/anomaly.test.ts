/**
 * Every empirical claim in "Rate anomaly — fairness gone wrong", measured
 * against the lesson's own scene: a long apartment with one station beside the
 * access point and one behind a wall at the far end, both saturated.
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts — the
 * comparable turn counts against the lopsided airtime, the 510 frames the near
 * station manages alone, the capture table's decibels, the destroyed 704 µs
 * frame, the deadline at 749 µs and the fifteen silent losses — are
 * re-asserted here beside the sentences that now carry them (the two tables of
 * `numbers`, and the capture material in `deeper`); the originals stay where
 * they are, so no pin is lost. The lesson never had a `.body!` site in any
 * test.
 */
import { describe, it, expect } from 'vitest'
import { anomaly } from '../../src/course/tier1/anomaly'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { ACK_BYTES, CW_MIN, DIFS_NS, SIFS_NS, SLOT_NS, sinrThreshDb } from '../../src/engine/phy'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite, ofType, runOf } from './kit'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
/** 200 ms: the window every figure in both tables of `numbers` is counted over. */
const RUN_NS = 200 * MS
const BYTES = 1528

const recs = (): TLRecord[] => runOf(anomaly, undefined, RUN_NS)
const txs = (rs: TLRecord[], p: (r: Tx) => boolean = () => true): Tx[] => ofType(rs, 'TX_START').filter(p)
const data = (rs: TLRecord[], n: string): Tx[] => txs(rs, (r) => r.node === n && r.frame.kind === 'data')
const acked = (rs: TLRecord[], n: string): number => txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === n).length
const air = (rs: TLRecord[], n: string): number => txs(rs, (r) => r.node === n).reduce((a, r) => a + r.frame.txTimeNs, 0)
/** Megabits a second of delivered payload: what the table's "Delivered" column prints. */
const mbps = (rs: TLRecord[], n: string): string => (acked(rs, n) * BYTES * 8 / (RUN_NS / 1e9) / 1e6).toFixed(1)
const runFor = (mod: (sc: ReturnType<typeof anomaly.scenario>) => void): TLRecord[] => {
  const sc = anomaly.scenario()
  mod(sc)
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

lessonShapeSuite(anomaly, { runNs: RUN_NS })

describe('anomaly · the lesson’s own scene', () => {
  it('leans on airtime and backoff, and names the anomaly itself', () => {
    expect(anomaly.module).toBe(1)
    expect(anomaly.needs).toEqual(['airtime', 'backoff'])
    // Whole-track review M3: one name for the loop of src/engine/rate.ts. `rate adaptation`
    // was a third name beside `rate control` (bianchi-vs-sim, and the title of `rate`).
    expect(anomaly.terms!.map((t) => t.term)).toEqual(['airtime share', 'performance anomaly', 'rate control'])
  })

  it('the scenario is unchanged: a near station and a far one across the apartment', () => {
    expect(() => ScenarioSchema.parse(anomaly.scenario())).not.toThrow()
    expect(anomaly.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    const sc = anomaly.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    // "One of the two sits across the apartment, behind a wall. Its signal arrives at the
    //  access point weak" — 40 dB weaker, which is the gap `deeper` takes apart.
    expect(lt.get('sta-1')!.get('ap')!).toBeGreaterThan(lt.get('sta-2')!.get('ap')!)
  })
})

describe('anomaly · two hundred milliseconds in this apartment', () => {
  it('the turns, the mean turn, the airtime share and the delivered rate of each station', () => {
    // the table: Near & fast · 209 · 248 µs · 25.9 % · 12.8 Mb/s
    //            Far & slow  · 154 · 795 µs · 61.2 % ·  8.3 Mb/s
    const rs = recs()
    const near = data(rs, 'sta-1'), far = data(rs, 'sta-2')
    expect([near.length, far.length]).toEqual([209, 154])
    const mean = (xs: Tx[]): number => Math.round(xs.reduce((a, r) => a + r.frame.txTimeNs, 0) / xs.length / 1000)
    expect([mean(near), mean(far)]).toEqual([248, 795])
    const share = (n: string): string => (air(rs, n) / RUN_NS * 100).toFixed(1)
    expect([share('sta-1'), share('sta-2')]).toEqual(['25.9', '61.2'])
    expect([mbps(rs, 'sta-1'), mbps(rs, 'sta-2')]).toEqual(['12.8', '8.3'])
    // the picture: "the two win the air about equally often" — comparable turns …
    expect(near.length / far.length).toBeLessThan(1.5)
    // … against airtime that is anything but ("more than twice the airtime")
    expect(air(rs, 'sta-2') / air(rs, 'sta-1')).toBeGreaterThan(2)
    expect(air(rs, 'sta-2') / air(rs, 'sta-1')).toBeLessThan(3)
  })

  it('every frame is 1528 bytes, and a turn’s length is the rate alone', () => {
    // the table "Where a turn’s length comes from": 54 Mb/s · 1528 · 248 µs /
    //  18 Mb/s · 1528 · 704 µs / 9 Mb/s · 1528 · 1384 µs
    const rs = recs()
    const byRate = new Map<number, Set<number>>()
    for (const d of [...data(rs, 'sta-1'), ...data(rs, 'sta-2')]) {
      expect(d.frame.bytes).toBe(BYTES)
      const s = byRate.get(d.frame.mbps!) ?? new Set<number>()
      s.add(d.frame.txTimeNs)
      byRate.set(d.frame.mbps!, s)
    }
    for (const [rate, times] of byRate) expect(times.size, `${rate} Mb/s`).toBe(1)
    const at = (rate: number): number => [...byRate.get(rate)!][0]
    expect(at(54)).toBe(248_000)
    expect(at(18)).toBe(704_000)
    expect(at(9)).toBe(1_384_000)
    // the near station never leaves its rate; the far one steps down twice (rate adaptation)
    expect([...new Set(data(rs, 'sta-1').map((d) => d.frame.mbps))]).toEqual([54])
    expect([...new Set(data(rs, 'sta-2').map((d) => d.frame.mbps))].sort((a, b) => b! - a!)).toEqual([18, 12, 9])
    // the observation: "they come in three lengths — 704, 1044 and 1384 µs"
    expect([...new Set(data(rs, 'sta-2').map((d) => d.frame.txTimeNs))].sort((a, b) => a - b))
      .toEqual([704_000, 1_044_000, 1_384_000])
  })

  it('together they hold the air more than nine tenths of the time', () => {
    // the observation: "the two hold the air more than nine tenths of the time, and still
    //  deliver less than the near station did on its own"
    const rs = recs()
    const busy = air(rs, 'sta-1') + air(rs, 'sta-2') + air(rs, 'ap')
    expect(busy / RUN_NS).toBeGreaterThan(0.9)
    const alone = runFor((sc) => { sc.nodes = sc.nodes.filter((n) => n.id !== 'sta-2') })
    expect(acked(rs, 'sta-1') + acked(rs, 'sta-2')).toBeLessThan(acked(alone, 'sta-1'))
  })
})

describe('anomaly · what the room costs the fast station', () => {
  it('510 frames alone against 209 together, and 234 for the far station alone', () => {
    // "Delete the far station and the near one delivers 510 frames over the same 200 ms
    //  instead of 209 … Left alone, the far station manages 234 frames of its own"
    const rs = recs()
    expect(acked(rs, 'sta-1')).toBe(209)
    expect(acked(rs, 'sta-2')).toBe(135)
    const nearAlone = runFor((sc) => { sc.nodes = sc.nodes.filter((n) => n.id !== 'sta-2') })
    const farAlone = runFor((sc) => { sc.nodes = sc.nodes.filter((n) => n.id !== 'sta-1') })
    expect(acked(nearAlone, 'sta-1')).toBe(510)
    expect(acked(farAlone, 'sta-2')).toBe(234)
    // "which is more than either of them gets while they share the room"
    expect(acked(farAlone, 'sta-2')).toBeGreaterThan(acked(rs, 'sta-1'))
    expect(acked(farAlone, 'sta-2')).toBeGreaterThan(acked(rs, 'sta-2'))
  })

  it('moving the far station closer shortens its turns and lifts the near one’s count', () => {
    // tryThis: "Move the far station closer to the access point, a metre at a time, and
    //  watch its green blocks shorten in steps as the rate climbs — and the near station’s
    //  count climb with them."
    const at = (x: number): { turn: number; near: number } => {
      const rs = runFor((sc) => { sc.nodes.find((n) => n.id === 'sta-2')!.pos = { x, y: 7, z: 1 } })
      return { turn: data(rs, 'sta-2')[0].frame.txTimeNs, near: acked(rs, 'sta-1') }
    }
    const steps = [15, 13, 11, 9, 7].map(at)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].turn, `step ${i}`).toBeLessThanOrEqual(steps[i - 1].turn)
      expect(steps[i].near, `step ${i}`).toBeGreaterThanOrEqual(steps[i - 1].near)
    }
    expect(steps[steps.length - 1].turn).toBeLessThan(steps[0].turn)
    expect(steps[steps.length - 1].near).toBeGreaterThan(steps[0].near)
  })
})

describe('anomaly · the procedure, step by step', () => {
  it('step 1: the wait before a draw is one DIFS — 16 µs plus two 9 µs slots, 34 µs', () => {
    // steps: "a 16 µs gap plus two slots of 9 µs, so 34 µs"
    expect(DIFS_NS).toBe(SIFS_NS + 2 * SLOT_NS)
    expect(DIFS_NS).toBe(34_000)
    // Every IFS the two stations wait is a DIFS or, after a reception they could not decode,
    // an EIFS — the step's one exception. All 166 EIFS waits belong to the far station, which
    // is the only one whose receptions are ever wrecked.
    const ifs = ofType(recs(), 'IFS_START').filter((r) => r.node !== 'ap')
    expect(ifs.length).toBeGreaterThan(300)
    for (const r of ifs) expect(['DIFS', 'EIFS']).toContain(r.kind)
    expect(ifs.filter((r) => r.kind === 'EIFS').every((r) => r.node === 'sta-2')).toBe(true)
    const difs = ifs.filter((r) => r.kind === 'DIFS')
    expect(difs.length).toBeGreaterThan(ifs.length / 2)
    expect(difs.some((r) => r.untilNs - r.t === DIFS_NS)).toBe(true)
  })

  it('step 2: both stations draw from the same window, which starts at 15', () => {
    // steps: "between zero and its contention window, which starts at 15 … Both draw from the
    //  same window, so over a long run each reaches zero about as often as the other."
    const rs = recs()
    const draws = ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node !== 'ap')
    expect(draws.length).toBeGreaterThan(300)
    expect(Math.min(...draws.map((r) => r.cw!))).toBe(CW_MIN)
    for (const d of draws) expect(d.value).toBeLessThanOrEqual(d.cw!)
    // both stations meet the same smallest window, and neither is handed a different ladder
    for (const n of ['sta-1', 'sta-2']) {
      expect(draws.filter((r) => r.node === n && r.cw === CW_MIN).length, n).toBeGreaterThan(50)
    }
  })

  it('steps 3–6: the arithmetic of the worked table, row by row', () => {
    // the table: turns 209 / 154 · 248 µs / 795 µs · 51.8 ms 25.9 % / 122.4 ms 61.2 % ·
    //  acknowledged 209 / 135 · 1045 / 675 per second · 12.8 / 8.3 Mb/s
    const rs = recs()
    const row = (n: string) => {
      const turns = data(rs, n)
      const airNs = turns.reduce((a, r) => a + r.frame.txTimeNs, 0)
      const perTurn = Math.round(airNs / turns.length / 1000)
      return {
        turns: turns.length,
        perTurn,
        airMs: (airNs / MS).toFixed(1),
        share: (airNs / RUN_NS * 100).toFixed(1),
        ok: acked(rs, n),
        perSec: acked(rs, n) / (RUN_NS / 1e9),
        mbps: mbps(rs, n),
      }
    }
    expect(row('sta-1')).toEqual({ turns: 209, perTurn: 248, airMs: '51.8', share: '25.9', ok: 209, perSec: 1045, mbps: '12.8' })
    expect(row('sta-2')).toEqual({ turns: 154, perTurn: 795, airMs: '122.4', share: '61.2', ok: 135, perSec: 675, mbps: '8.3' })
    // step 6 is arithmetic, not a measurement: delivered frames a second × 1528 B × 8 bits
    for (const [n, want] of [['sta-1', 12.8], ['sta-2', 8.3]] as const) {
      expect(Number((acked(rs, n) / 0.2 * BYTES * 8 / 1e6).toFixed(1))).toBe(want)
    }
    // "of those turns, acknowledged": the near station loses none, the far one 19
    expect(data(rs, 'sta-1').length - acked(rs, 'sta-1')).toBe(0)
    expect(data(rs, 'sta-2').length - acked(rs, 'sta-2')).toBe(19)
  })

  it('step 5: the acknowledgement is 14 bytes, and every frame of the run is 1528', () => {
    // steps: "The access point answers with a 14-byte acknowledgement" / "It is 1528 bytes either way"
    const rs = recs()
    const acks = txs(rs, (r) => r.frame.kind === 'ack')
    expect(acks.length).toBeGreaterThan(300)
    for (const a of acks) expect(a.frame.bytes).toBe(ACK_BYTES)
    for (const d of [...data(rs, 'sta-1'), ...data(rs, 'sta-2')]) expect(d.frame.bytes).toBe(BYTES)
  })
})

describe('anomaly · the capture effect in `deeper`', () => {
  it('both start at t = 0 with no draw at all, and only the near one is decoded', () => {
    // "Both stations find the medium idle from the start, so neither draws a backoff at all,
    //  and both transmit at t = 0 … the access point decodes the near station’s frame
    //  perfectly and acknowledges it, while the far station gets nothing."
    const rs = recs()
    expect(txs(rs, (r) => r.t === 0).map((r) => r.node).sort()).toEqual(['sta-1', 'sta-2'])
    expect(ofType(rs, 'BACKOFF_DRAW').some((r) => r.t === 0)).toBe(false)
    expect(ofType(rs, 'RX_START').filter((r) => r.node === 'ap' && r.t === 0).map((r) => r.from)).toEqual(['sta-1'])
    expect(txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')[0].t).toBeLessThan(749_000)
  })

  it('the decibels of the capture table, and the 4 dB a preamble needs', () => {
    // the table: "Near data at the access point · −35 dBm · far station, −75 dBm · 40 dB ·
    //  26 dB for 54 Mb/s" and "ACK at the near station · −30 dBm · −74 dBm · 44 dB ·
    //  17 dB for the 24 Mb/s ACK"
    const sc = anomaly.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    const near = lt.get('sta-1')!.get('ap')!, far = lt.get('sta-2')!.get('ap')!
    const apAtNear = lt.get('ap')!.get('sta-1')!, farAtNear = lt.get('sta-2')!.get('sta-1')!
    expect([Math.round(near), Math.round(far), Math.round(near - far)]).toEqual([-35, -75, 40])
    expect(Math.round(sinrThreshDb(54))).toBe(26)
    expect([Math.round(apAtNear), Math.round(farAtNear), Math.round(apAtNear - farAtNear)]).toEqual([-30, -74, 44])
    const ack = txs(recs(), (r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')[0]
    expect(ack.frame.mbps).toBe(24)
    expect(Math.round(sinrThreshDb(ack.frame.mbps!))).toBe(17)
    // "a preamble is detected only if it stands at least 4 dB above everything else on the air"
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    expect(near - far).toBeGreaterThan(PREAMBLE_DETECT_SINR_DB)
  })

  it('a 704 µs frame destroyed, a deadline at 749 µs, fifteen silent losses and no collision mark', () => {
    // "The far station’s 704 µs frame is destroyed in full. It learns nothing until its
    //  acknowledgement deadline expires at 749 µs … the whole run records none. Fifteen of
    //  these silent losses hit the far station in 200 ms, and none at all hit the near one"
    const rs = recs()
    expect(txs(rs, (r) => r.t === 0 && r.node === 'sta-2')[0].frame.txTimeNs).toBe(704_000)
    const timeouts = ofType(rs, 'ACK_TIMEOUT')
    expect(timeouts.filter((r) => r.node === 'sta-2')[0].t).toBe(749_000)
    expect(timeouts.filter((r) => r.node === 'sta-2').length).toBe(15)
    expect(timeouts.filter((r) => r.node === 'sta-1').length).toBe(0)
    expect(ofType(rs, 'COLLISION').length).toBe(0)
    // "then retries with a doubled window"
    const retry = txs(rs, (r) => r.node === 'sta-2' && r.frame.kind === 'data' && r.t > 749_000)[0]
    expect(retry.frame.retryFlag).toBe(true)
    expect(ofType(rs, 'CW_CHANGE').find((r) => r.node === 'sta-2' && r.t === 749_000)!.cw).toBeGreaterThan(15)
  })
})
