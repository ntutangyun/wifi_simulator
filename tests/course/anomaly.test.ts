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
import { LESSONS } from '../../src/course/lessons'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import {
  ACK_BYTES, CCA_PD_DBM, CW_MIN, DIFS_NS, SIFS_NS, SLOT_NS, sinrThreshDb,
} from '../../src/engine/phy'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'

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
/**
 * The same, **memoised by a name** — the read-back at the end of this file asks for the two
 * one-station rooms this file already runs, and the suite's simulated work is bounded
 * (tests/simCost.ts). The engine is deterministic, so a shared run is the same run.
 */
const aloneRuns = new Map<string, TLRecord[]>()
const runNamed = (key: string, mod: (sc: ReturnType<typeof anomaly.scenario>) => void): TLRecord[] => {
  const hit = aloneRuns.get(key)
  if (hit) return hit
  const made = runFor(mod)
  aloneRuns.set(key, made)
  return made
}
/** The room with only the near station in it, and the room with only the far one. */
const nearAloneRun = (): TLRecord[] =>
  runNamed('near-alone', (sc) => { sc.nodes = sc.nodes.filter((n) => n.id !== 'sta-2') })
const farAloneRun = (): TLRecord[] =>
  runNamed('far-alone', (sc) => { sc.nodes = sc.nodes.filter((n) => n.id !== 'sta-1') })

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

  /**
   * **The glossary row and the prose have to use the same word.**
   *
   * This lesson's `outcomes` line says 「把一台站点的轮次和它的空口占比放在一起比」, and three
   * later lessons (`tier1-project`, `tier1-project-review`, `capstone`) use 空口占比 on their
   * main path on the strength of this one being in their `needs` closure. The row that explains
   * the quantity was headed `airtime share` and its Chinese line never wrote 空口占比, so the
   * reader had to bridge an English heading to a Chinese word themselves — and the first-use
   * bracket rule cannot help, because `ZH_TERMS_EXCLUDED` carries 空口占比 as a model choice
   * ("the simulator's own counter") and switches that rule off for it.
   *
   * Pinned on both sides so the pair cannot come apart again: whichever word the lesson's own
   * main path uses, the row that explains it has to contain it.
   */
  it('names 空口占比 in the row that explains it, in the word the prose uses', () => {
    const main = lessonStrings({
      why: anomaly.why, outcomes: anomaly.outcomes, picture: anomaly.picture,
      numbers: anomaly.numbers, observe: anomaly.observe, tryThis: anomaly.tryThis, quiz: anomaly.quiz,
    }).join('\n')
    expect(main, 'the prose side of the pair').toContain('空口占比')
    const row = anomaly.terms!.find((t) => t.term === 'airtime share')!
    expect(row.plain).toContain('空口占比')
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
    const nearAlone = nearAloneRun()
    const farAlone = farAloneRun()
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

/**
 * **What this lesson's three pointers promise, and which of them is a lift (slice 4e,
 * 2026-10-05).**
 *
 * `until` renders as 「（这一条在《…》里会被解除）」, so it is a promise in the future
 * tense that the named lesson REMOVES the simplification. `tests/course/limits.test.ts`
 * used to check only that the target exists and is not this lesson, and this file —
 * measured over the whole course — never mentioned either target at all. Two of the three
 * promises here were false:
 *
 *  - **The rate-control pointers were not lifts, and are now `seeAlso`.** `rate-vs-model`
 *    does not remove the two-counter controller; its own `limits[0]` RESTATES it (连续两次
 *    失败降一档，连续十次成功涨一档，永不越过查表上限) and its `limits[1]` restates the
 *    collision-vs-fade conflation (没有任何机制去区分两者). It is a lesson ABOUT that
 *    controller, which is real navigation value and exactly what `seeAlso` is for.
 *    Mechanically it could not have been a lift either: `model-value` and `unmodelled`
 *    describe the engine, and every lesson runs the same engine (criterion A).
 *  - **The TXOP pointer IS a lift, and its `kind` was the thing that was wrong.** It was
 *    `unmodelled`, meaning *an effect the engine does not model at all* — but the engine
 *    models TXOP and aggregation, and `txop` spends a whole lesson running them. What this
 *    scene lacks is the capability on its STATIONS, which is a scenario class, so the kind
 *    is `out-of-scope`. `backoff`'s limit says nearly the same sentence and was already
 *    `out-of-scope`; reading the two side by side is how the mislabel showed.
 *
 * The axis is per-node generation, and it is the ruler for this site.
 */
describe('anomaly · which of its limits another lesson actually lifts', () => {
  const byNeedle = (n: string) => anomaly.limits.find((l) => l.text.includes(n))!

  it('points the two rate-control limits at a deeper read, not at a lift', () => {
    for (const needle of ['这里的速率控制只有两个计数', '它分不清碰撞与衰落']) {
      const lim = byNeedle(needle)
      expect(lim.seeAlso, `${needle} should be a deeper read`).toBe('rate-vs-model')
      expect(lim.until, `${needle} is not lifted by any lesson`).toBeUndefined()
    }
  })

  it('and `rate-vs-model` restates both rather than removing them', () => {
    const rvm = LESSONS.find((l) => l.id === 'rate-vs-model')!
    const text = rvm.limits.map((l) => l.text).join(' / ')
    expect(text).toContain('连续两次失败降一档，连续十次成功涨一档')
    expect(text).toContain('没有任何机制去区分两者')
  })

  it('promises the TXOP limit as a lift, on the kind that can be lifted', () => {
    const lim = byNeedle('没有发送机会（TXOP），也不聚合')
    expect(lim.until).toBe('txop')
    // not `unmodelled`: the engine builds both, this scene's stations just cannot use them
    expect(lim.kind).toBe('out-of-scope')
    expect(lim.seeAlso).toBeUndefined()
    // **And it opens on the scene (2026-10-05 fix 1).** Re-kinding changed the rendered
    // prefix to 「这个模型答不了：」, and the sentence used to start 「每一轮的长短只由速率
    // 决定」 — a reader meets 「这个模型答不了：每一轮的长短只由速率决定」 and can conclude
    // the engine does not model frame length, which is the opposite of true. The scope goes
    // first, the way `backoff`'s limit already did (「这个场景里一次成功只换来一帧」); the
    // `width` trunk was fixed for the same reason, and that lesson's test pins it too.
    expect(lim.text.startsWith('本场景的站点不打业务标记')).toBe(true)
    expect(lim.text).toContain('每一轮的长短只由速率决定')
  })

  it('and the axis really is the station generation: nonht here, vht there', () => {
    const stations = (id: string) => LESSONS.find((l) => l.id === id)!.scenario()
      .nodes.filter((n) => n.id !== 'ap')
    for (const n of stations('anomaly')) {
      expect(n.caps.generation, `${n.id} in anomaly`).toBe('nonht')
      // GEN_FEATURES.nonht is the empty set, so nothing negotiates
      for (const flag of ['edca', 'ampdu', 'txop'] as const) {
        expect(hasFeature(n, flag), `${n.id} negotiates ${flag}`).toBe(false)
      }
    }
    for (const n of stations('txop')) {
      expect(n.caps.generation, `${n.id} in txop`).toBe('vht')
      for (const flag of ['edca', 'ampdu', 'txop'] as const) {
        expect(hasFeature(n, flag), `${n.id} is missing ${flag}`).toBe(true)
      }
    }
  })

  it('and `backoff` says nearly the same thing on the same kind, which is how the mislabel showed', () => {
    const bo = LESSONS.find((l) => l.id === 'backoff')!.limits.find((l) => l.until === 'txop')!
    expect(bo.kind).toBe('out-of-scope')
    for (const shared of ['不打业务标记', '没有发送机会（TXOP）', '连发一串']) {
      expect(bo.text, `backoff: ${shared}`).toContain(shared)
      expect(byNeedle('没有发送机会（TXOP），也不聚合').text, `anomaly: ${shared}`).toContain(shared)
    }
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect([near.length, far.length]).toEqual([209, 154])`, with the lesson's own row quoted in
 * a comment above it. So the engine is pinned and the prose is not: the sampling sweep of
 * 2026-10-12 planted six of this lesson's figures and **all six went unnoticed**. Here every
 * figure is parsed out of the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the worked table is read as the arithmetic the steps promise**, row by row and column by
 *    column: turns, the air one turn takes, the air they add up to and its share of the window,
 *    the turns that were answered, the frames a second that makes, and the megabits those frames
 *    carry — each row's figure being the previous row's input, both stations at once.
 *  - **the two rooms with one station in them are read against the room with both.** 「不是 209
 *    帧，而是 510 帧」 and 「远端若独占房间，自己能送出 234 帧」 are three counts from three
 *    runs, and the sentence's claim — that alone is better for both — is read too.
 *  - **the three turn lengths are read as the rate ladder they come from.** 「704、1044、1384
 *    µs」 are the three airtimes the far station's frames really take, and the table's own three
 *    rows give the rate beside two of them, so the pair has to agree.
 *  - **DIFS is read as the sum the steps spell out**, 「16 µs 的间隔加两个 9 µs 的时隙，合 34
 *    µs」, against `SIFS_NS`, `SLOT_NS` and `DIFS_NS` — three constants and one addition.
 */
describe('anomaly · every figure the prose prints, read back out of it', () => {
  const rs = recs()
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
  const NUMS = blockText(anomaly.numbers)
  const LIM = blockText(anomaly.limits)
  const SRC = blockText(anomaly.sources)
  const OBS = blockText(anomaly.observe)
  const TRY = blockText(anomaly.tryThis)

  const val = (x: string): number => Number(x.replace(/[\s,%]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,%]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
  const tables = (): { heading?: string; rows: string[][] }[] =>
    anomaly.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; rows: string[][] }[]
  const caption = (): string =>
    (anomaly.numbers!.find((b) => b.kind === 'diagram') as unknown as { caption: string }).caption
  const diagramHeading = (): string =>
    (anomaly.numbers!.find((b) => b.kind === 'diagram') as unknown as { heading: string }).heading
  /** Everything one station's own figures come to, exactly as the worked table computes them. */
  const stats = (node: string) => {
    const turns = data(rs, node)
    const airNs = turns.reduce((a, r) => a + r.frame.txTimeNs, 0)
    return {
      turns: turns.length,
      perTurnUs: Math.round(airNs / turns.length / 1000),
      airMs: airNs / MS,
      sharePct: (airNs / RUN_NS) * 100,
      ok: acked(rs, node),
      perSec: acked(rs, node) / (RUN_NS / 1e9),
      mbps: (acked(rs, node) * BYTES * 8) / (RUN_NS / 1e9) / 1e6,
    }
  }

  it('reads the figure’s own heading and caption: three turns each, two lengths', () => {
    // 「同一段 3.6 ms 里，两台各三轮」
    const [ms] = figs(diagramHeading(), /同一段 ([\d.]+) ms 里/, 'the figure’s own window')
    const [eachCn] = raw(diagramHeading(), /两台各(.)轮/, 'the figure’s own turn count')
    const spans = anomalyTiming().lanes.map((l) => l.spans.length)
    expect(spans, 'the figure draws that many turns in each lane')
      .toEqual([cn(eachCn!), cn(eachCn!)])
    const axis = anomalyTiming().axis!
    same(String(ms), (axis.toUs - axis.fromUs) / 1000, 'the window the figure is drawn over')
    // 「近端每轮 248 µs，远端每轮 704 µs，两边装的都是 1528 字节」
    const [nearUs, farUs, bytes] = figs(caption(),
      /近端每轮 (\d+) µs，远端每轮 (\d+) µs，两边装的都是 (\d+) 字节/, 'the caption on the two turns')
    expect(nearUs, 'the near station’s turn, as the run really sends it')
      .toBe(stats('sta-1').perTurnUs)
    expect(farUs! * 1000, 'the far station’s best turn, which is its shortest frame')
      .toBe(Math.min(...data(rs, 'sta-2').map((r) => r.frame.txTimeNs)))
    expect(new Set(data(rs, 'sta-1').concat(data(rs, 'sta-2')).map((r) => r.frame.bytes)),
      'and the payload both of them carry').toEqual(new Set([bytes]))
  })

  it('reads the rate table as the three rungs the far station really uses', () => {
    const t = tables()[0]!
    const rows = t.rows.map((r) => ({
      label: r[0]!,
      mbps: figs(r[1]!, /^(\d+) Mb\/s$/, 'the row’s own rate')[0]!,
      bytes: figs(r[2]!, /^(\d+)$/, 'the row’s own payload')[0]!,
      us: figs(r[3]!, /^(\d+) µs$/, 'the row’s own airtime')[0]!,
    }))
    expect(rows, 'three rows: the near station and the far one twice').toHaveLength(3)
    for (const row of rows) {
      const who = row.label.includes('近端') ? 'sta-1' : 'sta-2'
      const hit = data(rs, who).find((r) => r.frame.mbps === row.mbps)
      expect(hit, `${who} really sends at ${row.mbps} Mb/s`).toBeDefined()
      expect(row.us! * 1000, `what ${row.mbps} Mb/s costs this payload`).toBe(hit!.frame.txTimeNs)
      expect(row.bytes, 'the payload never changing').toBe(hit!.frame.bytes)
    }
    // the far station's own two rows are its best rung and the one two steps below it
    const farRows = rows.filter((r) => r.label.includes('远端'))
    expect(farRows, 'two rows for the far station').toHaveLength(2)
    const rungs = [...new Set(data(rs, 'sta-2').map((r) => r.frame.mbps))].sort((a, b) => b - a)
    expect(farRows.map((r) => r.mbps), 'its best rung and the one 「连降两档之后」')
      .toEqual([rungs[0], rungs[2]])
    // 「远端的绿色块…有三种长度——704、1044、1384 µs」
    const three = figs(OBS, /有三种长度——(\d+)、(\d+)、(\d+) µs/, '`observe` on the three lengths')
    expect(three.map((us) => us * 1000).sort((a, b) => a - b),
      'the three airtimes the far station’s frames really take')
      .toEqual([...new Set(data(rs, 'sta-2').map((r) => r.frame.txTimeNs))].sort((a, b) => a - b))
  })

  it('reads the worked table row by row, both stations at once', () => {
    const t = tables()[1]!
    const [windowMs] = figs(t.heading!, /同样的 (\d+) ms/, 'the worked table’s own window')
    expect(windowMs! * MS, 'the window every figure of this lesson is counted over').toBe(RUN_NS)
    const row = (needle: string): string[] => {
      const hit = t.rows.find((r) => r[0]!.includes(needle))
      expect(hit, `no row 「${needle}」`).toBeDefined()
      return hit!
    }
    // **the first row's label carries the window too** (sweep of 2026-10-14)
    const [rowMs] = figs(row('竞争成功的轮次')[0]!, /^(\d+) ms 内竞争成功的轮次$/,
      'the first row’s own window')
    expect(rowMs! * MS, 'the same window the heading names').toBe(RUN_NS)
    // the two value columns of every row, in the order the table puts them
    const columns: [number, string][] = [[1, 'sta-1'], [2, 'sta-2']]
    for (const [i, node] of columns) {
      const s = stats(node)
      const [turns] = figs(row('竞争成功的轮次')[i]!, /^(\d+)$/, `${node}’s turns`)
      expect(turns, `the turns ${node} wins`).toBe(s.turns)
      const [perTurn] = figs(row('每轮的空口时间')[i]!, /^(\d+) µs$/, `${node}’s turn length`)
      expect(perTurn, `the air one of its turns takes`).toBe(s.perTurnUs)
      const [airMs, share] = figs(row('占住的空口时间')[i]!, /^([\d.]+) ms · ([\d.]+) %$/,
        `${node}’s air and share`)
      same(String(airMs), s.airMs, `the air ${node} holds`)
      same(String(share), s.sharePct, 'and its share of the window')
      expect(Math.round((perTurn! * turns!) / 100) / 10, 'which is the two rows above, multiplied')
        .toBeCloseTo(airMs!, 0)
      const [ok] = figs(row('被确认的')[i]!, /^(\d+)$/, `${node}’s answered turns`)
      expect(ok, `the turns of ${node} that were answered`).toBe(s.ok)
      const [perSec] = figs(row('每秒送达的帧数')[i]!, /^(\d+)$/, `${node}’s frames a second`)
      expect(perSec, 'the frames a second that makes').toBe(s.perSec)
      const [mbit] = figs(row('× 1528 字节 × 8 比特')[i]!, /^([\d.]+) Mb\/s$/, `${node}’s throughput`)
      same(String(mbit), s.mbps, `what ${node} delivers`)
    }
    // the row label is itself the arithmetic of the last step
    const [labelBytes, labelBits] = figs(row('× 1528 字节 × 8 比特')[0]!, /× (\d+) 字节 × (\d+) 比特/,
      'the last row’s own label')
    expect(labelBytes, 'the payload it multiplies by').toBe(BYTES)
    expect(labelBits, 'and the bits in an octet').toBe(8)
    const s2 = stats('sta-2')
    expect(Number(((s2.perSec * labelBytes! * labelBits!) / 1e6).toFixed(1)),
      'which is what that multiplication gives').toBe(Number(s2.mbps.toFixed(1)))
  })

  it('reads why the fourth row is not the first, and the failures behind it', () => {
    // 「远端竞争成功 154 轮，被确认的只有 135 轮，其余整帧失败」
    const [turns, ok] = figs(NUMS, /远端竞争成功 (\d+) 轮，被确认的只有 (\d+) 轮/,
      '`numbers` on the far station’s two counts')
    const s = stats('sta-2')
    expect([turns, ok], 'what it wins and what it gets answered').toEqual([s.turns, s.ok])
    // 「远端 154 轮里有 19 轮整帧失败」 — `limits` prints the difference
    const [limTurns, lost] = figs(LIM, /远端 (\d+) 轮里有 (\d+) 轮整帧失败/, '`limits` on the failures')
    expect(limTurns, 'the same turns').toBe(turns)
    expect(lost, 'and the ones that failed whole').toBe(s.turns - s.ok)
    // 「时间轴上一次碰撞都没记」 and 「那个场景里各站点的到达电平相差 34.4 dB」
    expect(ofType(rs, 'COLLISION'), 'and the run really records no collision at all').toEqual([])
    const [spreadDb] = figs(NUMS, /各站点的到达电平相差 ([\d.]+) dB/, '`numbers` on the project’s spread')
    const project = LESSONS.find((l) => l.id === 'tier1-project-review')
    expect(project, 'the lesson that scene belongs to').toBeDefined()
    const sc = project!.scenario()
    const table = buildLinkTable(sc.nodes, sc.walls)
    const levels = sc.nodes.filter((n) => n.kind === 'sta')
      .map((n) => table.get(n.id)!.get('ap')!)
    same(String(spreadDb), Math.max(...levels) - Math.min(...levels),
      'the spread of arriving levels in that other scene')
    /*
     * **Exempt, class (c): the 0.1 dB of 「差 0.1 dB 就全废」.** The sentence's content is that
     * the rung's requirement is a cliff with no tolerance at all, so any shortfall whatever would
     * serve — 0.2 or 0.05 would be just as true (the same argument `@uwb-mms` files for its own
     * 0.1 dB). What is read is the claim: the engine's threshold for the rung this station runs
     * really is a single number, and a reception a tenth of a decibel under it is under it.
     */
    const [epsilon] = figs(LIM, /够就全收、差 ([\d.]+) dB 就全废/, '`limits` on the hard line')
    const rung = data(rs, 'sta-2')[0]!.frame.mbps
    const need = sinrThreshDb(rung)
    expect(need - epsilon!, 'a tenth of a decibel under the requirement is under it')
      .toBeLessThan(need)
    expect(new Set(data(rs, 'sta-2').map((r) => sinrThreshDb(r.frame.mbps))).size,
      'and every rung this station uses has exactly one such number')
      .toBe(new Set(data(rs, 'sta-2').map((r) => r.frame.mbps)).size)
  })

  it('reads what `observe` says about the two lanes, window and all', () => {
    // 「检视器：前 200 ms 里两者的轮次相当，可远端占用的空口时间是近端的两倍多」
    const [obsMs] = figs(OBS, /前 (\d+) ms 里两者的轮次相当/, '`observe` on its own window')
    expect(obsMs! * MS, 'the window every figure of this lesson is counted over').toBe(RUN_NS)
    const near = stats('sta-1')
    const far = stats('sta-2')
    expect(near.turns / far.turns, 'the turns really are comparable').toBeLessThan(1.5)
    expect(far.airMs / near.airMs, 'while the air is more than twice as much').toBeGreaterThan(2)
  })

  it('reads the two rooms with one station in them', () => {
    // 「把远端删掉，同样的 200 ms 里近端送出的就不是 209 帧，而是 510 帧」
    /*
     * **Delivered, not sent** — and the lesson says 「送达」 now because of this read: the near
     * station alone really sends 511 frames over the window, one of which is still in flight when
     * it closes, so 510 is what the acknowledgements count (correction of 2026-10-14; `tryThis`
     * had always said 「送达」 for the same pair).
     */
    const [ms, together, alone] = figs(NUMS,
      /同样的 (\d+) ms 里近端送达的就不是 (\d+) 帧，而是 (\d+) 帧/, '`numbers` on the near station alone')
    expect(ms! * MS, 'the same window').toBe(RUN_NS)
    expect(together, 'what the near station delivers with the far one there').toBe(stats('sta-1').ok)
    expect(alone, 'and what it delivers alone').toBe(acked(nearAloneRun(), 'sta-1'))
    expect(data(nearAloneRun(), 'sta-1').length, 'while it sends one more than that')
      .toBeGreaterThan(alone!)
    expect(alone, 'which is more than twice as much').toBeGreaterThan(2 * together!)
    // 「远端若独占房间，自己能送出 234 帧——比两台共处一室时任何一台都多」
    const [farAlone] = figs(NUMS, /远端若独占房间，自己能送达 (\d+) 帧/,
      '`numbers` on the far station alone')
    expect(farAlone, 'what the far station delivers alone').toBe(acked(farAloneRun(), 'sta-2'))
    expect(farAlone, 'more than either of them manages together')
      .toBeGreaterThan(Math.max(stats('sta-1').turns, stats('sta-2').turns))
    // `tryThis` prints the near station's pair again
    const [tryMs, tryWas, tryNow] = figs(TRY,
      /近端 (\d+) ms 内送达的帧数从 (\d+) 跳到 (\d+)/, '`tryThis` on the same experiment')
    expect(tryMs! * MS, 'the same window again').toBe(RUN_NS)
    expect([tryWas, tryNow], 'the same two counts `numbers` prints')
      .toEqual([stats('sta-1').ok, acked(nearAloneRun(), 'sta-1')])
  })

  it('reads the steps: one DIFS, the window it draws from, and the answer', () => {
    // 「16 µs 的间隔加两个 9 µs 的时隙，合 34 µs」
    const [sifs, slotsCn, slot, difs] = raw(NUMS,
      /(\d+) µs 的间隔加(.)个 (\d+) µs 的时隙，合 (\d+) µs/, 'the steps on the wait before a draw')
    expect(val(sifs!) * 1000, 'the short interframe space').toBe(SIFS_NS)
    expect(val(slot!) * 1000, 'one slot').toBe(SLOT_NS)
    expect(val(sifs!) + cn(slotsCn!) * val(slot!), 'the sum the sentence states').toBe(val(difs!))
    expect(val(difs!) * 1000, 'which is the space the engine applies').toBe(DIFS_NS)
    // 「在 0 到自己的竞争窗口之间抽一个整数时隙数——窗口从 15 起步」
    const [from, start] = figs(NUMS, /在 (\d+) 到自己的竞争窗口（contention window, CW）之间[^]*?窗口从 (\d+) 起步/,
      'the steps on the draw')
    expect(start, 'the window both stations start from').toBe(CW_MIN)
    const draws = ofType(rs, 'BACKOFF_DRAW')
    expect(Math.min(...draws.map((r) => r.value)), 'the lowest draw the run makes')
      .toBeGreaterThanOrEqual(from!)
    expect(Math.max(...draws.filter((r) => r.cw === CW_MIN).map((r) => r.value)),
      'and the highest at the first window').toBeLessThanOrEqual(start!)
    // 「这一轮有多长…近端 248 µs，远端平均 795 µs」
    const [nearUs, farUs] = figs(NUMS, /近端 (\d+) µs，远端平均 (\d+) µs/, 'the steps on the two turns')
    expect(nearUs, 'the near station’s turn').toBe(stats('sta-1').perTurnUs)
    expect(farUs, 'and the far station’s mean turn').toBe(stats('sta-2').perTurnUs)
    // 「接入点回一个 14 字节的确认帧」
    const [ackBytes] = figs(NUMS, /接入点回一个 (\d+) 字节的确认帧/, 'the steps on the answer')
    expect(ackBytes, 'the acknowledgement the engine sends').toBe(ACK_BYTES)
    expect(new Set(txs(rs, (r) => r.frame.kind === 'ack').map((r) => r.frame.bytes)),
      'and every answer of the run is that size').toEqual(new Set([ackBytes]))
    /*
     * **The payload is printed three times in the steps** and the sweep of 2026-10-14 caught the
     * two I had not read: 「两边都是 1528 字节」 where the draw is described, and 「就是那 1528
     * 字节按它自己的速率发完要多久」 where the turn's length is. Both are the one payload every
     * frame of this run carries.
     */
    const payloads = new Set(data(rs, 'sta-1').concat(data(rs, 'sta-2')).map((r) => r.frame.bytes))
    for (const [b] of [...NUMS.matchAll(/(\d+) 字节/g)].map((m) => m.slice(1))) {
      if (val(b!) === 8 || val(b!) === ACK_BYTES) continue
      expect(payloads, `「${b} 字节」 is the payload this scene really sends`)
        .toEqual(new Set([val(b!)]))
    }
    // 「它的吞吐量就是每秒被确认的轮次乘 1528 字节再乘 8 比特」
    const [bytes, bits] = figs(NUMS, /每秒被确认的轮次乘 (\d+) 字节再乘 (\d+) 比特/,
      'the steps on the throughput')
    expect(bytes, 'the payload it multiplies by').toBe(BYTES)
    expect(bits, 'and the bits in an octet').toBe(8)
  })

  it('reads `sources` and the two figures `limits` quotes back', () => {
    // 「这里的速率、1528 字节的帧长与各自的空口时间，出自本仿真器自己的 OFDM 模型；−82 dBm 的
    //   检测底、4 dB 的前导检测余量」
    const [bytes] = figs(SRC, /这里的速率、(\d+) 字节的帧长/, '`sources` on the frame length')
    expect(bytes, 'the payload every frame of this scene carries').toBe(BYTES)
    const [floor, margin] = figs(SRC, /(−\d+) dBm 的检测底、(\d+) dB 的前导检测余量/,
      '`sources` on the two model values')
    expect(margin, 'the preamble-detection margin the engine applies').toBe(PREAMBLE_DETECT_SINR_DB)
    expect(floor, 'and the preamble-detect floor it exports').toBe(CCA_PD_DBM)
    expect(floor, 'which every level in this room is above')
      .toBeLessThan(Math.min(...[...buildLinkTable(anomaly.scenario().nodes, anomaly.scenario().walls)
        .get('sta-2')!.values()]))
    // 「209 对 154 轮、12.8 与 8.3 Mb/s，只在这几条同时成立时才成立」
    const [a, b, m1, m2] = figs(LIM, /(\d+) 对 (\d+) 轮、([\d.]+) 与 ([\d.]+) Mb\/s/,
      '`limits` quoting the table back')
    expect([a, b], 'the two turn counts of the worked table')
      .toEqual([stats('sta-1').turns, stats('sta-2').turns])
    same(String(m1), stats('sta-1').mbps, 'the near station’s throughput')
    same(String(m2), stats('sta-2').mbps, 'and the far station’s')
  })
})
