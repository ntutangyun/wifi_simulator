/**
 * Every empirical claim in "速率异常——“公平”的反面", measured against the lesson's
 * own scene: a long apartment with one station beside the access point and one
 * behind a wall at the far end, both saturated.
 *
 * Re-paced on 2026-09-25 (§2 M5): the lesson stays whole, its summary table is
 * gone (the worked table below carries every column it had) and a timing figure
 * took its place. No pin was deleted — the figures the summary table used to
 * print are asserted here against the worked table, and the figure's own spans
 * are asserted against the TX_STARTs they are drawn from.
 *
 * THE CAPTURE PINS STAY HERE, and batch E (M6/M7) decided that rather than
 * dropping them. §7 of the plan sends the capture-effect material to
 * `rate-vs-model`; it could not go there. Every station in that lesson's scene
 * sits on a 1 m circle round the access point and arrives at exactly
 * −36.215 dBm, so no frame is ever louder than another and capture never fires:
 * over 10 s the access point's RX_MISS count equals the RETRY count exactly
 * (1635), and tests/course/rate-vs-model.test.ts pins that. A mechanism whose
 * own lesson's run refutes it is the bad move §7 exists to prevent, so the
 * MECHANISM went to `tier1-project-review` instead, whose flat really does span
 * 34.4 dB and whose run really does rescue 46 % of the losers; it is pinned
 * there against that run.
 *
 * What is left in this file is what it always was: three facts about THIS scene,
 * which is still the scene that shows a simultaneous start with nothing to
 * separate the winners but signal strength. They guard the sentence `anomaly`
 * kept — 时间轴上一次碰撞都没记，因为两帧同时开始时接入点只锁住了更强的那个前导码 —
 * and its worked table's fourth row (154 turns, 135 acknowledged).
 *
 * The engine truth established here survives: a station that has just failed to
 * decode a reception waits an EIFS rather than a DIFS, and all of this scene's
 * EIFS waits belong to the far station. It is pinned in step 1.
 */
import { describe, it, expect } from 'vitest'
import { anomaly, anomalyTiming } from '../../src/course/tier1/anomaly'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { ACK_BYTES, CW_MIN, DIFS_NS, SIFS_NS, SLOT_NS, sinrThreshDb } from '../../src/engine/phy'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

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
  it('leans on airtime and the collision lesson, and names the anomaly itself', () => {
    expect(MODULES[anomaly.module].title).toBe('听不见的邻居与损失')
    // §6 of the re-pacing plan: `backoff`'s second half owns the deadline and the
    // doubling this lesson's step 2 and its unacknowledged turns lean on.
    expect(anomaly.needs).toEqual(['airtime', 'collisions-cw'])
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
    // the worked table's rows 1-3 and 6, which is the one table the re-pacing kept:
    //   209 / 154 turns · 248 µs / 795 µs · 25.9 % / 61.2 % · 12.8 / 8.3 Mb/s
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
    expect(ifs.length).toBe(833)
    for (const r of ifs) expect(['DIFS', 'EIFS']).toContain(r.kind)
    const eifs = ifs.filter((r) => r.kind === 'EIFS')
    expect(eifs.length).toBe(166)
    expect(eifs.every((r) => r.node === 'sta-2')).toBe(true)
    const difs = ifs.filter((r) => r.kind === 'DIFS')
    expect(difs.length).toBe(667)
    expect(difs.some((r) => r.untilNs - r.t === DIFS_NS)).toBe(true)
    // and every EIFS really is longer than the DIFS the step describes
    for (const r of eifs) expect(r.untilNs - r.t, `EIFS @ ${r.t}`).toBeGreaterThan(DIFS_NS)
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

describe('anomaly · the timing figure is the run', () => {
  it('three turns each, every span a TX_START, the far one nearly three times as long', () => {
    // the figure: 「同一段 3.6 ms 里，两台各三轮」, and its caption's 248 µs / 704 µs
    const sp = anomalyTiming()
    expect(sp.lanes.map((l) => l.label)).toEqual(['近端·快', '远端·慢'])
    // equal turns is the claim the figure exists to make
    expect(sp.lanes[0].spans.length).toBe(3)
    expect(sp.lanes[1].spans.length).toBe(3)
    const rs = recs()
    for (const [lane, nodeId] of [[sp.lanes[0], 'sta-1'], [sp.lanes[1], 'sta-2']] as const) {
      for (const span of lane.spans) {
        const tx = data(rs, nodeId).find((r) => Math.round(r.t / 1000) === span.fromUs)
        expect(tx, `${nodeId} @ ${span.fromUs}`).toBeDefined()
        expect(Math.round((tx!.t + tx!.frame.txTimeNs) / 1000), `${nodeId} @ ${span.fromUs}`).toBe(span.toUs)
        expect(tx!.frame.bytes).toBe(BYTES)
      }
    }
    // every span of the window really is inside the axis it declares
    for (const lane of sp.lanes) {
      for (const span of lane.spans) {
        expect(span.fromUs).toBeGreaterThanOrEqual(sp.axis.fromUs)
        expect(span.toUs).toBeLessThanOrEqual(sp.axis.toUs)
      }
    }
    // 248 µs against 704 µs: the near lane's blocks are the short ones, throughout
    const len = (l: typeof sp.lanes[0]): number[] => l.spans.map((x) => x.toUs - x.fromUs)
    expect(new Set(len(sp.lanes[0]))).toEqual(new Set([248]))
    expect(new Set(len(sp.lanes[1]))).toEqual(new Set([704]))
    expect(704 / 248).toBeGreaterThan(2.8)
    // and no third station's turn hides in the window
    const inWindow = [...data(rs, 'sta-1'), ...data(rs, 'sta-2')]
      .filter((r) => r.t >= 3400 * 1000 && r.t + r.frame.txTimeNs <= 7000 * 1000)
    expect(inWindow.length).toBe(6)
  })
})

/**
 * Why no collision is ever recorded in this scene, in three facts about this run.
 *
 * These are the pins batch 4 parked for `rate-vs-model` and batch 5 sent back
 * (see the file header): they are measured off THIS scenario — 40 dB between the
 * two stations, a 704 µs frame destroyed in silence — and `rate-vs-model`'s own
 * scene has no capture in it at all, so re-aiming them there would have asserted
 * the opposite of what that lesson shows. The capture mechanism is taught and
 * pinned in `tier1-project-review`, whose run has a 34.4 dB spread; these three
 * stay where the run is, guarding the one sentence `anomaly` kept and the fourth
 * row of its worked table.
 */
describe('anomaly · why the timeline records no collision', () => {
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
