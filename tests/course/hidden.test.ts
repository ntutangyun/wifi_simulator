/**
 * Every empirical claim in "Hidden nodes & RTS/CTS", measured against the
 * lesson's own scene: an access point in a hallway with one saturated legacy
 * station in each end room, and the same scene again with the protected
 * exchange switched on above 500 bytes.
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts — the
 * far station counting straight through the near one's data frame, its freeze
 * for the access point's ACK, the zero Duration of a closing ACK, and the
 * collision cut the protected variant buys — are re-asserted here beside the
 * sentences that now carry them (the asymmetry table and the two-variant table
 * of `numbers`, and the stragglers in `deeper`); the originals stay where they
 * are, so no pin is lost. The lesson never had a `.body!` site in any test.
 *
 * The old "first RTS" jump target is gone: `lessonShapeSuite` requires every
 * jump to occur in the BASE run, and the base scene never sends an RTS. The
 * second `watch` call-out now sends the reader to the variant instead, and
 * tests/course/lessons.test.ts still pins that the variant really does send
 * one.
 */
import { describe, it, expect } from 'vitest'
import { hidden } from '../../src/course/tier1/hidden'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { buildLinkTable } from '../../src/engine/propagation'
import { CCA_PD_DBM, SLOT_NS } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
/** 300 ms: the window both columns of the "with the exchange off and on" table are counted over. */
const RUN_NS = 300 * MS

const base = (): TLRecord[] => runOf(hidden, undefined, RUN_NS)
const prot = (): TLRecord[] => runOf(hidden, 0, RUN_NS)
const txs = (rs: TLRecord[], p: (r: Tx) => boolean = () => true): Tx[] =>
  ofType(rs, 'TX_START').filter(p)
const acked = (rs: TLRecord[], n: string): number =>
  txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === n).length

/** The frame the receiver had locked when a collision was reported, and the ones that ruined it. */
function collisionFrames(rs: TLRecord[], c: Extract<TLRecord, { type: 'COLLISION' }>): { locked: Tx; others: Tx[] } {
  const all = txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
  const locked = all.filter((r) => r.t + r.frame.txTimeNs === c.t)[0]
  const others = all.filter((r) => r.node !== locked.node && r.t + r.frame.txTimeNs > locked.t)
  return { locked, others }
}
const collisions = (rs: TLRecord[]): { locked: Tx; others: Tx[] }[] =>
  ofType(rs, 'COLLISION').map((c) => collisionFrames(rs, c))
const caughtData = (rs: TLRecord[]): { locked: Tx; others: Tx[] }[] =>
  collisions(rs).filter(({ locked, others }) => [locked, ...others].some((f) => f.frame.kind === 'data'))

lessonShapeSuite(hidden, { proseMax: 860, runNs: RUN_NS })

describe('hidden · the lesson’s own scene', () => {
  it('follows nav and owns RTS and CTS', () => {
    expect(hidden.module).toBe(1)
    expect(hidden.needs).toEqual(['backoff', 'nav'])
    // the owner table of the readability programme gives this lesson RTS and CTS; the
    // hidden node itself and the size at which a station starts asking come with them.
    expect(hidden.terms!.map((t) => t.term)).toEqual(['hidden node', 'RTS', 'CTS', 'RTS threshold'])
  })

  it('the scenario and its one variant are unchanged', () => {
    expect(() => ScenarioSchema.parse(hidden.scenario())).not.toThrow()
    expect(hidden.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    // `deeper`: "the same scene with the threshold left at 3000 — above every frame in the room"
    expect(hidden.scenario().rtsThresholdBytes).toBe(3000)
    expect(hidden.variants!.length).toBe(1)
    expect(() => ScenarioSchema.parse(hidden.variants![0].scenario())).not.toThrow()
    // `deeper`: "The variant sets its RTS threshold at 500 bytes"
    expect(hidden.variants![0].scenario().rtsThresholdBytes).toBe(500)
  })

  it('the two stations cannot hear each other, but both reach the access point', () => {
    // the picture: "what arrives at the far antenna is weaker than the level a radio will
    //  call a signal at all", and "Both stations reach it without trouble"
    const sc = hidden.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    expect(lt.get('sta-1')!.get('sta-2')!).toBeLessThan(CCA_PD_DBM)
    expect(lt.get('sta-2')!.get('sta-1')!).toBeLessThan(CCA_PD_DBM)
    for (const n of ['sta-1', 'sta-2']) expect(lt.get(n)!.get('ap')!).toBeGreaterThan(CCA_PD_DBM)
  })
})

describe('hidden · what the far station hears of a whole exchange', () => {
  it('it counts straight through the near station’s frame, 106 down to 66', () => {
    // the table row: "The near station’s 1528-byte data frame · 1.95 – 2.31 ms · Two ·
    //  Counts straight through it — 106, 105, … 66 — and on through the gap after it"
    const rs = base()
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 1_900_000)[0]
    expect(a.frame.bytes).toBe(1528)
    expect(Math.round(a.t / 10_000) / 100).toBe(1.95)
    expect(Math.round((a.t + a.frame.txTimeNs) / 10_000) / 100).toBe(2.31)
    const decs = ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-2' && r.t >= a.t && r.t <= a.t + a.frame.txTimeNs)
    expect(decs[0].value).toBe(106)
    expect(decs[decs.length - 1].value).toBe(66)
    expect(ofType(rs, 'BACKOFF_FREEZE')
      .some((r) => r.node === 'sta-2' && r.t >= a.t && r.t < a.t + a.frame.txTimeNs)).toBe(false)
    // "and on through the gap after it": it keeps counting between the frame and the ACK
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    expect(ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-2' && r.t > a.t + a.frame.txTimeNs && r.t < ack.t).length).toBeGreaterThan(0)
  })

  it('it freezes at 64 for the 28 µs ACK, waits 34 µs and resumes at 64 at 2387 µs', () => {
    // the table row: "The access point’s ACK · 2325 – 2353 µs · One · Freezes at 64, sits out
    //  the 28 µs ACK and a 34 µs wait, resumes at 64 at 2387 µs"
    const rs = base()
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 1_900_000)[0]
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    expect([ack.t, ack.t + ack.frame.txTimeNs]).toEqual([2_325_000, 2_353_000])
    expect(ack.frame.txTimeNs).toBe(28_000)
    expect(ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-2' && r.t === ack.t)?.value).toBe(64)
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-2' && r.t === 2_353_000)!
    expect(ifs.untilNs - ifs.t).toBe(34_000)
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-2' && r.t === ifs.untilNs)!
    expect(resume.t).toBe(2_387_000)
    expect(resume.value).toBe(64)
  })

  it('the closing ACK announces nothing, so the freeze guards nothing', () => {
    // "its Duration is zero and no timer is set anywhere. Moments later the near station
    //  starts its next frame and the far one, deaf again, counts straight through it."
    const rs = base()
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 1_900_000)[0]
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    expect(ack.frame.durationFieldNs).toBe(0)
    expect(ofType(rs, 'NAV_SET').some((r) => r.node === 'sta-2')).toBe(false)
    const next = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > ack.t)[0]
    const end = next.t + next.frame.txTimeNs
    expect(ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-2' && r.t > next.t && r.t < end).length).toBeGreaterThan(10)
    expect(ofType(rs, 'BACKOFF_FREEZE').some((r) => r.node === 'sta-2' && r.t > next.t && r.t < end)).toBe(false)
  })

  it('no freeze in either room ever falls inside a frame sent from the other', () => {
    // the observation: "Across the whole run, not one freeze falls inside a frame sent by
    //  the station in the other room."
    const rs = base()
    for (const [me, other] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      const frames = txs(rs, (r) => r.node === other)
      for (const f of ofType(rs, 'BACKOFF_FREEZE').filter((r) => r.node === me)) {
        expect(frames.some((x) => f.t >= x.t && f.t < x.t + x.frame.txTimeNs), `${me} @ ${f.t}`).toBe(false)
      }
    }
    // the observation: "Each station does freeze for the access point’s ACKs"
    const apAcks = new Set(txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack').map((r) => r.t))
    for (const n of ['sta-1', 'sta-2']) {
      const mine = ofType(rs, 'BACKOFF_FREEZE').filter((r) => r.node === n)
      expect(mine.length).toBeGreaterThan(10)
      expect(mine.every((f) => apAcks.has(f.t))).toBe(true)
    }
  })
})

describe('hidden · three hundred milliseconds, off and on', () => {
  it('126 collisions, every one of them on a data frame, and 45 frames delivered', () => {
    // the table column "Off": Collisions 126 · ones that caught a data frame 126 ·
    //  data frames delivered 45; and the observation "126 of them in 300 ms, and every
    //  single one has a data frame caught in it"
    const rs = base()
    expect(ofType(rs, 'COLLISION').length).toBe(126)
    expect(caughtData(rs).length).toBe(126)
    expect(acked(rs, 'sta-1') + acked(rs, 'sta-2')).toBe(45)
    expect(txs(rs, (r) => r.frame.kind === 'rts').length).toBe(0)
  })

  it('32 collisions with the exchange on, 7 of them on a data frame, and 329 delivered', () => {
    // the table column "On": 32 · 7 · 329
    const rs = prot()
    expect(ofType(rs, 'COLLISION').length).toBe(32)
    expect(caughtData(rs).length).toBe(7)
    expect(acked(rs, 'sta-1') + acked(rs, 'sta-2')).toBe(329)
  })

  it('a cut of about 94% in the collisions that catch a data frame, and seven times the frames', () => {
    // "Turning the exchange on cuts the collisions that catch a data frame by about 94% …
    //  the room delivers seven times as many frames as it did without them."
    const cut = 1 - caughtData(prot()).length / caughtData(base()).length
    expect(Math.round(cut * 100)).toBe(94)
    const ratio = (acked(prot(), 'sta-1') + acked(prot(), 'sta-2'))
      / (acked(base(), 'sta-1') + acked(base(), 'sta-2'))
    expect(ratio).toBeGreaterThan(7)
    expect(ratio).toBeLessThan(8)
  })

  it('the question is 20 bytes and the answer 14, and the answer covers the exchange to come', () => {
    // "Every long frame now pays for a 20-byte question and a 14-byte answer before it may
    //  start", and the picture's "The CTS carries a Duration covering the rest of the exchange"
    const rs = prot()
    const rts = txs(rs, (r) => r.frame.kind === 'rts')
    const cts = txs(rs, (r) => r.frame.kind === 'cts')
    expect(rts.length).toBeGreaterThan(300)
    expect(cts.length).toBeGreaterThan(300)
    for (const f of rts) expect(f.frame.bytes).toBe(20)
    for (const f of cts) expect(f.frame.bytes).toBe(14)
    // both are tiny beside the 1528-byte frame they protect, whatever rate they go out at
    const longest = Math.max(...txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.txTimeNs))
    for (const f of [...rts, ...cts]) expect(f.frame.txTimeNs).toBeLessThan(longest / 4)
    // the answer always promises more time than it takes, and always comes from the access point
    for (const c of cts) {
      expect(c.node).toBe('ap')
      expect(c.frame.durationFieldNs).toBeGreaterThan(c.frame.txTimeNs)
    }
    // the first answer of the run reserves the air to the end of the exchange it protects
    const first = cts[0]
    const nav = ofType(rs, 'NAV_SET').find((r) => r.t === first.t + first.frame.txTimeNs)!
    expect(nav.untilNs - nav.t).toBe(first.frame.durationFieldNs)
  })

  it('245 reservations land on the far station in 300 ms', () => {
    // the observation: "the other room’s station shows a reservation running to the end of
    //  the exchange — 245 of them in 300 ms"
    expect(ofType(prot(), 'NAV_SET').filter((r) => r.node === 'sta-2').length).toBe(245)
  })

  it('about 42 collision ticks per 100 ms with the exchange off, about 11 with it on', () => {
    // tryThis: "about 42 with the exchange off, about 11 with it on"
    expect(Math.round(ofType(base(), 'COLLISION').length / 3)).toBe(42)
    expect(Math.round(ofType(prot(), 'COLLISION').length / 3)).toBe(11)
  })
})

describe('hidden · what `deeper` adds', () => {
  it('25 of the 32 remaining collisions are a question meeting a question', () => {
    // `deeper`: "Of the 32 collisions left in the protected run, 25 are a question meeting a
    //  question … The other 7 catch a data frame"
    const rs = prot()
    const cs = collisions(rs)
    const rtsOnly = cs.filter(({ locked, others }) => [locked, ...others].every((f) => f.frame.kind === 'rts'))
    expect(rtsOnly.length).toBe(25)
    expect(cs.length - rtsOnly.length).toBe(7)
    // "two hidden stations whose counters reach zero within four slots of each other"
    for (const { locked, others } of rtsOnly) {
      const o = others.find((f) => f.frame.kind === 'rts')!
      expect(Math.abs(o.t - locked.t)).toBeLessThanOrEqual(4 * SLOT_NS)
    }
    // "A question is twenty bytes, so each of those costs a small fraction of what a ruined
    //  data frame costs"
    for (const { locked } of rtsOnly) expect(locked.frame.bytes).toBe(20)
  })

  it('every data frame in the scene is above the variant’s threshold and below the base one’s', () => {
    // `deeper`: "every data frame in this scene is 1528, so all of them ask first", against
    //  "the same scene with the threshold left at 3000 — above every frame in the room"
    const rs = prot()
    const data = txs(rs, (r) => r.frame.kind === 'data')
    expect(data.length).toBeGreaterThan(300)
    for (const d of data) expect(d.frame.bytes).toBe(1528)
    expect(hidden.variants![0].scenario().rtsThresholdBytes!).toBeLessThan(1528)
    expect(hidden.scenario().rtsThresholdBytes!).toBeGreaterThan(1528)
  })
})

describe('hidden · the door experiment', () => {
  it('a door on the stations’ line of sight un-hides them; a door lower down does not', () => {
    // tryThis: "punch a door near the top of a hallway wall, on the stations’ line of sight
    //  (y ≈ 7.2) … they hear each other again. A door lower down changes nothing."
    const link = (from: number | null): number => {
      const sc = hidden.scenario()
      if (from !== null) sc.walls.find((w) => w.x1 === 4 && w.x2 === 4)!.openings = [{ from, to: from + 0.9 }]
      return buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('sta-2')!
    }
    expect(link(null)).toBeLessThan(CCA_PD_DBM)
    expect(link(6.8)).toBeGreaterThan(CCA_PD_DBM)
    expect(link(1)).toBe(link(null))
    expect(link(3.5)).toBe(link(null))
  })
})
