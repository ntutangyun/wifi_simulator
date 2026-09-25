/**
 * Every empirical claim in "NAV — reserving the channel with one field",
 * measured against the lesson's own scene (two saturated talkers, one browsing
 * listener).
 *
 * Re-paced on 2026-09-25, and kept whole (§2 M4). One pin changed shape: the
 * three-row 「把一段长长的冻结拆开」table became the timing figure, so the
 * assertion that used to read the table's cells now reads `navTiming()`'s spans
 * and compares each with the run. The same four instants and the same
 * 248 + 44 + 34 = 326 are asserted; what is gained is that the figure the reader
 * sees cannot drift from the simulator. The diagram's geometry is checked here
 * too, because tests/course/diagram.test.ts pins its own fixtures rather than
 * walking the course.
 *
 * The claims this lesson shares with tests/course/lesson-claims.test.ts — the
 * 248 + 44 + 34 = 326 µs freeze, and "NAV ends exactly when the ACK ends, and
 * data Duration = SIFS + ACK airtime" — are re-asserted here beside the
 * sentences that now carry them; the originals stay where they are.
 */
import { describe, it, expect } from 'vitest'
import { nav, navTiming } from '../../src/course/tier1/nav'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { DIFS_NS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
/** 200 ms: the window the "576 data frames" and "513 countdowns" sentences are counted over. */
const RUN_NS = 200 * MS

const recs = (): TLRecord[] => runOf(nav, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)
const lane = (label: string): TimingLane => navTiming().lanes.find((l) => l.label === label)!

lessonShapeSuite(nav, { runNs: RUN_NS })

describe('nav · the lesson’s own scene', () => {
  it('follows backoff and owns the reservation', () => {
    expect(MODULES[nav.module].title).toBe('等待与退避')
    expect(nav.needs).toEqual(['backoff'])
    // the owner table of the readability programme gives this lesson NAV; `Duration` and
    // `virtual carrier sense` are the field it reads and the name for what it does.
    expect(nav.terms!.map((t) => t.term)).toEqual(['Duration', 'NAV', 'virtual carrier sense'])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(nav.scenario())).not.toThrow()
    expect(nav.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2', 'sta-3'])
  })
})

describe('nav · where the 44 µs comes from', () => {
  it('a data frame announces the pause plus the answer, and the answer announces nothing', () => {
    // the "where the 44 µs comes from" table: pause 16 µs, answer 28 µs, data frame writes
    //  44 µs, answer writes 0 µs — and 「576 个数据帧写下的都是同一个 44 µs」
    const data = txs('data')
    const acks = txs('ack')
    expect(data.length).toBe(576)
    expect(new Set(data.map((r) => r.frame.durationFieldNs))).toEqual(new Set([44_000]))
    expect(new Set(acks.map((r) => r.frame.txTimeNs))).toEqual(new Set([28_000]))
    expect(new Set(acks.map((r) => r.frame.bytes))).toEqual(new Set([14]))
    expect(new Set(acks.map((r) => r.frame.durationFieldNs))).toEqual(new Set([0]))
    expect(SIFS_NS + 28_000).toBe(44_000)
    // and it really is the answer each frame expects, not a constant that happens to match
    for (const d of data) {
      const ack = acks.find((a) => a.t > d.t)
      if (ack) expect(d.frame.durationFieldNs).toBe(SIFS_NS + ack.frame.txTimeNs)
    }
  })

  it('the Listener’s 513 countdowns end at the exact nanosecond the answer ends', () => {
    // 「旁听者的倒计时恰好在回答结束的那一纳秒到期——513 次无一例外」and the observation
    //  "check any of the Listener's 513 of them"
    const navs = ofType(recs(), 'NAV_SET').filter((r) => r.node === 'sta-3')
    expect(navs.length).toBe(513)
    for (const n of navs) {
      expect(n.untilNs - n.t).toBe(44_000)
      const ack = ofType(recs(), 'TX_END').find((r) => r.frame.kind === 'ack' && r.t > n.t)!
      expect(ack.t).toBe(n.untilNs)
    }
    // the Listener is never the addressee: every one of them comes from somebody else's data
    expect(new Set(navs.map((r) => r.source))).toEqual(new Set(['data:sta-1', 'data:sta-2']))
  })
})

describe('nav · the procedure, against the engine', () => {
  it('a countdown is only ever pushed further out, and never by an answer', () => {
    // the procedure's steps 2 and 4, against updateNav in src/engine/mac.ts: it returns
    // early unless `t + durationFieldNs` beats the value already held and the Duration is
    // above zero.
    const held = new Map<string, number>()
    let sets = 0
    for (const r of recs()) {
      if (r.type === 'NAV_SET') {
        expect(r.untilNs, `${r.node} at ${r.t}`).toBeGreaterThan(held.get(r.node) ?? 0)
        expect(r.untilNs).toBeGreaterThan(r.t)
        held.set(r.node, r.untilNs)
        sets++
      }
      if (r.type === 'NAV_CLEAR') held.set(r.node, 0)
    }
    expect(sets).toBeGreaterThan(500)
    // an acknowledgement announces nothing, so it arms nobody
    expect(ofType(recs(), 'NAV_SET').some((r) => r.source.startsWith('ack'))).toBe(false)
  })

  it('while a countdown runs the station neither counts down nor transmits', () => {
    // the procedure's steps 5 and 6: `mediumBusy()` is CCA busy OR now < navUntil, so a
    // physically idle channel does not release a station whose timer is still running.
    const until = new Map<string, number>()
    let covered = 0
    for (const r of recs()) {
      const node = 'node' in r ? r.node : undefined
      if (r.type === 'NAV_SET') { until.set(r.node, r.untilNs); continue }
      if (r.type === 'NAV_CLEAR') { until.set(r.node, 0); continue }
      if (node === undefined || r.t >= (until.get(node) ?? 0)) continue
      expect(r.type, `${node} at ${r.t}`).not.toBe('BACKOFF_DEC')
      expect(r.type, `${node} at ${r.t}`).not.toBe('TX_START')
      covered++
    }
    expect(covered).toBeGreaterThan(100)
  })

  it('the countdown expiring is what restarts the gap', () => {
    // the procedure's step 7, "if sensing reports idle then, the station starts its gap and
    //  access resumes from the frozen value"
    const clears = ofType(recs(), 'NAV_CLEAR').filter((r) => r.node === 'sta-1')
    expect(clears.length).toBeGreaterThan(100)
    const ifss = ofType(recs(), 'IFS_START').filter((r) => r.node === 'sta-1')
    const started = clears.filter((c) => ifss.some((r) => r.t === c.t))
    expect(started.length / clears.length).toBeGreaterThan(0.5)
  })
})

describe('nav · one long freeze, taken apart', () => {
  it('the figure’s three spans are 248 + 44 + 34 = 326 µs, and Talker A resumes at 3', () => {
    // What the deleted 「把一段长长的冻结拆开」table used to assert, now read out of the
    // spec the reader is actually shown, plus the caption's four instants.
    const air = lane('空口').spans
    const dur = lane('Duration').spans[0]
    const a = lane('A 在熬的').spans

    const freeze = ofType(recs(), 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === 498_000)!
    expect(freeze.value).toBe(3)
    expect(a[0].fromUs).toBe(freeze.t / 1000)

    // segment 1: B's frame, which A's own ear can account for
    const bTx = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-2' && r.t === 498_000)!
    const bEnd = ofType(recs(), 'TX_END').find((r) => r.node === 'sta-2' && r.t > 498_000)!
    expect(bEnd.t).toBe(746_000)
    expect(air[0].fromUs).toBe(bTx.t / 1000)
    expect(air[0].toUs).toBe(bEnd.t / 1000)
    expect(a[0].toUs).toBe(bEnd.t / 1000)
    expect((a[0].toUs - a[0].fromUs) * 1000).toBe(248_000)

    // segment 2: the reservation, trusted only once the frame decoded
    const rxOk = ofType(recs(), 'RX_OK').find((r) => r.node === 'sta-1' && r.t === 746_000)!
    expect(rxOk.from).toBe('sta-2')
    expect(ofType(recs(), 'RX_FAIL').some((r) => r.node === 'sta-1' && r.t === 746_000)).toBe(false)
    const navSet = ofType(recs(), 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === 746_000)!
    expect(navSet.untilNs).toBe(790_000)
    expect(dur.fromUs).toBe(navSet.t / 1000)
    expect(dur.toUs).toBe(navSet.untilNs / 1000)
    expect((dur.toUs - dur.fromUs) * 1000).toBe(44_000)
    expect([a[1].fromUs, a[1].toUs]).toEqual([dur.fromUs, dur.toUs])
    expect(a[1].tone).toBe('muted')
    // the answer really is on the air inside that span, from the access point
    const ack = txs('ack').find((r) => r.t > 746_000)!
    expect(air[1].fromUs).toBe(ack.t / 1000)
    expect(air[1].toUs).toBe((ack.t + ack.frame.txTimeNs) / 1000)
    expect([air[1].fromUs, air[1].toUs]).toEqual([762, 790])

    // segment 3: a real DIFS, and the resume at the same 3
    const difs = ofType(recs(), 'IFS_START').find((r) => r.node === 'sta-1' && r.t === 790_000)!
    expect(difs.kind).toBe('DIFS')
    expect(difs.untilNs).toBe(824_000)
    expect(a[2].fromUs).toBe(difs.t / 1000)
    expect(a[2].toUs).toBe(difs.untilNs / 1000)
    expect((a[2].toUs - a[2].fromUs) * 1000).toBe(DIFS_NS)
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === 824_000)!
    expect(resume.value).toBe(3)
    expect(resume.t - freeze.t).toBe(326_000)

    // and the three spans really do add to the total the caption prints
    expect((a[2].toUs - a[0].fromUs) * 1000).toBe(326_000)
    expect(248_000 + 44_000 + 34_000).toBe(326_000)
  })

  it('the 3 is idle slots owed: A sends three slots after it resumes', () => {
    // the caption's last clause, "A's backoff counter carries on from 3 — the idle slots it
    //  still owed when the air went busy". The gloss is only true if those three are counted
    //  off as slots and the frame follows immediately, so that is what is checked.
    const resume = ofType(recs(), 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === 824_000)!
    expect(resume.value).toBe(3)
    const tx = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-1' && r.t > resume.t)!
    expect(tx.t - resume.t).toBe(resume.value * SLOT_NS)
    const decs = ofType(recs(), 'BACKOFF_DEC').filter((r) => r.node === 'sta-1' && r.t > resume.t && r.t <= tx.t)
    expect(decs.map((r) => r.value)).toEqual([2, 1, 0])
  })

  it('three quarters of the wait is over before its length can be worked out', () => {
    // `deeper`: "the 326 µs total first becomes computable at 746 µs, by which point 248 µs
    //  — about three quarters of the wait — has already gone by", and the last ingredient
    //  being the 34 µs that could still be extended
    expect(248_000 / 326_000).toBeGreaterThan(0.7)
    expect(248_000 / 326_000).toBeLessThan(0.8)
    expect(326_000 - 248_000 - 44_000).toBe(DIFS_NS)
  })

  it('the figure lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(navTiming())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(5)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})
