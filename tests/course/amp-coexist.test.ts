/**
 * Every empirical claim in the "AMP and Wi-Fi share 2.4 GHz" lesson, measured
 * against the lesson's own scenario and its three variants. Each assertion
 * quotes the sentence it guards verbatim from the shipped prose (EN unless the
 * claim only exists in ZH); standard constants are checked against the engine's
 * exports (src/engine/phy.ts, src/engine/amp.ts) rather than re-typed.
 */
import { describe, it, expect } from 'vitest'
import { ampCoexist, ampCoexistScenario } from '../../src/course/amp/amp-coexist'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { AMP_SIFS_NS, ampDlPpduNs, ampTriggerBytes, ampUlPpduNs, ampRespBytes, AMP_ACK_BYTES } from '../../src/engine/amp'
import { CCA_ED_DBM, CTS_BYTES, EDCA_PARAMS, ERP_2G, aifsNs, txTimeNs } from '../../src/engine/phy'
import { LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { linkPlanFor } from '../../src/model/caps'
import { rssiOn } from './rssi'
import { decodeFrame } from '../../src/model/frameFields'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { lessonTexts } from '../../src/course/readability'
import { zhNumeral } from './coverage'
import { lessonShapeSuite } from './kit'

const MS = 1_000_000
const US = 1_000
/** 20 rounds at one round every 100 ms. Everything below is measured over these two seconds. */
const ROUNDS = 20
const RUN_NS = 2000 * MS

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(ampCoexist, { runNs: RUN_NS })

const AP = 'ap#2g'
const CAM = 'cam#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g']

const NONE = 0, POLL20 = 1, WIFI_ONLY = 2

const memo = new Map<string, TLRecord[]>()
const run = (s: Scenario, key: string): TLRecord[] => {
  if (!memo.has(key)) memo.set(key, [...new Simulation(s).runUntil(RUN_NS).records])
  return memo.get(key)!
}
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const s = variant === undefined ? ampCoexist.scenario() : ampCoexist.variants![variant].scenario()
  return run(s, String(variant ?? 'base'))
}

const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[]) => ofType(rs, 'TX_START')
/** The AP's round protection frame: a CTS it addresses to itself. */
const roundCts = (rs: TLRecord[]) =>
  txs(rs).filter((r) => r.node === AP && r.frame.kind === 'cts' && r.frame.dst === r.frame.src)
const slots = (rs: TLRecord[]) => ofType(rs, 'AMP_SLOT')
const results = (rs: TLRecord[]) => ofType(rs, 'AMP_RESULT')
const acked = (rs: TLRecord[]) => results(rs).filter((r) => r.acked).length
/** NAV the camera took from the round's CTS-to-self. */
const camNav = (rs: TLRecord[]) =>
  ofType(rs, 'NAV_SET').filter((r) => r.node === CAM && r.source === 'cts:ap')
/** Camera transmissions that begin inside one of the round's uplink slots. */
const camInSlot = (rs: TLRecord[]) => {
  const ss = slots(rs)
  return txs(rs).filter((r) => r.node === CAM && ss.some((s) => r.t >= s.t && r.t < s.untilNs))
}
/** Every microsecond of AMP PPDU in the run: the round's protection, trigger, Acks and the tags' responses. */
const ampAirNs = (rs: TLRecord[]) => txs(rs)
  .filter((r) => (r.node === AP && (r.frame.kind.startsWith('amp') || (r.frame.kind === 'cts' && r.frame.dst === r.frame.src)))
    || TAGS.includes(r.node))
  .reduce((a, r) => a + r.frame.txTimeNs, 0)
/** MSDUs a node had acknowledged, i.e. dequeued without ever being dropped. */
function delivered(rs: TLRecord[], node: string): number {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  return ofType(rs, 'DEQUEUE').filter((r) => r.node === node && !dropped.has(r.msduId)).length
}
/**
 * Goodput in Mb/s over the measured window. MSDU sizes are taken from the
 * engine's own ENQUEUE records, never from a size re-typed in this file.
 */
function mbps(rs: TLRecord[], node: string): number {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const bytes = new Map(ofType(rs, 'ENQUEUE').filter((r) => r.node === node).map((r) => [r.msduId, r.bytes]))
  let bits = 0
  for (const r of ofType(rs, 'DEQUEUE')) {
    if (r.node === node && !dropped.has(r.msduId)) bits += 8 * (bytes.get(r.msduId) ?? 0)
  }
  return bits / (RUN_NS / 1e9) / 1e6
}
const camMbps = (rs: TLRecord[]) => mbps(rs, CAM)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
/** How late each round's CTS-to-self went out, against the poll clock's k × pollIntervalMs. */
const lateUs = (rs: TLRecord[], pollMs: number) =>
  roundCts(rs).map((c, i) => (c.t - i * pollMs * MS) / US)

describe('amp-coexist · lesson shape', () => {
  it('the scenario and all three variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(ampCoexist.scenario())).not.toThrow()
    for (const v of ampCoexist.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(ampCoexist.variants!.length).toBe(3)
  })

  it('every jump predicate matches a record in the run it points at', () => {
    // The jumps, in declaration order: CTS-to-self, the camera's NAV from it, the
    // unanswered camera RTS, the unacknowledged tag response, the 5 GHz video frame.
    expect(ampCoexist.jumps.length).toBe(5)
    const rs = recs()
    ampCoexist.jumps.forEach((j, i) => expect(rs.some(j.find), `jump ${i}`).toBe(true))
    // the two the no-protection variant is there to show happen in it too
    expect(recs(NONE).some(ampCoexist.jumps[2].find)).toBe(true)
    expect(recs(NONE).some(ampCoexist.jumps[3].find)).toBe(true)
  })

  it('the scene is a router with two radios, two tags, a 2.4 GHz camera and a 5 GHz phone', () => {
    // "The router sits in the study at (3, 4) with two radios … Two tags … A camera … uploads on
    //  2.4 GHz … and a phone in the living room streams video on 5 GHz."
    const s = ampCoexist.scenario()
    expect(s.nodes.map((n) => n.id)).toEqual(['ap', 'cam', 'phone', 'tag-1', 'tag-2'])
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', 'sta', 'sta', 'amp', 'amp'])
    // the coordinates the prose quotes: (3, 4), (6, 4), (12, 4), (2, 2), (4, 6)
    expect(s.nodes.map((n) => [n.pos.x, n.pos.y])).toEqual([[3, 4], [6, 4], [12, 4], [2, 2], [4, 6]])
    // the AP declares no link of its own: it joins every link something else uses
    expect(s.nodes.map((n) => n.linkId)).toEqual([undefined, '2g', undefined, '2g', '2g'])
    expect(s.nodes[1].profiles).toEqual(['saturated'])
    expect(s.nodes[2].profiles).toEqual(['video'])
    expect(s.nodes[0].ampAp).toMatchObject({
      pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline',
    })
    // the three variants: no protection, a 20 ms poll clock, and the same flat with no AMP at all
    expect(ampCoexist.variants![NONE].scenario().nodes[0].ampAp).toMatchObject({ protection: 'none', pollIntervalMs: 100 })
    expect(ampCoexist.variants![POLL20].scenario().nodes[0].ampAp).toMatchObject({ protection: 'ctsSelf', pollIntervalMs: 20 })
    const wifi = ampCoexist.variants![WIFI_ONLY].scenario()
    expect(wifi.nodes.map((n) => n.id)).toEqual(['ap', 'cam', 'phone'])
    expect(wifi.nodes[0].ampAp).toBeUndefined()
    // the AP's radios are the same in both: only the polling function differs
    expect(wifi.nodes[0].caps).toEqual(ampCoexist.scenario().nodes[0].caps)
  })
})

describe('amp-coexist · standard constants', () => {
  it('the round waits AIFS[BK] = 73 µs where the camera waits AIFS[BE] = 37 µs', () => {
    // "On 2.4 GHz a slot is 9 µs and SIFS is 10 µs, so the round's AC_BK waits 10 + 7 × 9 = 73 µs before
    //  it may even start counting down, and the camera's AC_BE waits 10 + 3 × 9 = 37 µs."
    expect(ERP_2G.sifsNs).toBe(10 * US)
    expect(ERP_2G.slotNs).toBe(9 * US)
    expect(EDCA_PARAMS[0].name).toBe('BK')
    expect(EDCA_PARAMS[0].aifsn).toBe(7)
    expect(EDCA_PARAMS[1].name).toBe('BE')
    expect(EDCA_PARAMS[1].aifsn).toBe(3)
    expect(aifsNs(7, ERP_2G)).toBe(73 * US)
    expect(aifsNs(3, ERP_2G)).toBe(37 * US)
    expect(10 + 7 * 9).toBe(73)
    expect(10 + 3 * 9).toBe(37)
    // and those are the AIFS the two EDCAFs really arm in the base run
    const ifs = ofType(recs(), 'IFS_START').filter((r) => r.kind === 'AIFS' && r.untilNs > r.t)
    expect(new Set(ifs.filter((r) => r.node === AP && r.ac === 0).map((r) => r.untilNs - r.t))).toEqual(new Set([73 * US]))
    expect(new Set(ifs.filter((r) => r.node === CAM && r.ac === 1).map((r) => r.untilNs - r.t))).toEqual(new Set([37 * US]))
  })

  it('the round is the same 4190 µs as lesson 1, and the CTS-to-self reserves 4140 µs of it', () => {
    // "The round itself has not changed since the first AMP lesson — 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) =
    //  4190 µs — of which the CTS-to-self's Duration field covers the 4140 µs that follow it."
    const ext = ERP_2G.signalExtNs
    expect(txTimeNs(CTS_BYTES, 6) + ext).toBe(50 * US)
    expect(ampDlPpduNs(250, ampTriggerBytes(0), ext)).toBe(618 * US)
    expect(ampUlPpduNs(250, ampRespBytes(true))).toBe(528 * US)
    expect(ampDlPpduNs(250, AMP_ACK_BYTES, ext)).toBe(330 * US)
    expect(AMP_SIFS_NS).toBe(10 * US)
    expect(50 + 10 + 618 + 4 * (10 + 528 + 10 + 330)).toBe(4190)
    const cts = roundCts(recs())
    expect(cts.length).toBe(ROUNDS)
    for (const c of cts) {
      expect(c.frame.mbps).toBe(6)
      expect(c.frame.bytes).toBe(CTS_BYTES)
      expect(c.frame.txTimeNs).toBe(50 * US)
      expect(c.frame.durationFieldNs).toBe(4140 * US)
    }
  })

  it('a tag is far below the camera’s energy-detection threshold: −65.7 and −71.7 dBm against −62', () => {
    // "A tag transmits at 0 dBm, so from the camera's corner of the study the plant tag arrives at
    //  −65.7 dBm and the window tag at −71.7 dBm, both under the −62 dBm energy-detection threshold."
    const s = ampCoexist.scenario()
    expect(s.nodes.filter((n) => n.kind === 'amp').map((n) => n.txPowerDbm)).toEqual([0, 0])
    // the 2.4 GHz link adds its band offset on top of the band-neutral link table
    expect(LINK_EXTRA_LOSS_DB['2g']).toBe(-6.5)
    expect(LINK_EXTRA_LOSS_DB['5g']).toBe(0)
    const links = buildLinkTable(s.nodes, s.walls)
    const atCam = (from: string) => rssiOn('2g', links, from, 'cam')
    expect(atCam('tag-2').toFixed(1)).toBe('-65.7')
    expect(atCam('tag-1').toFixed(1)).toBe('-71.7')
    expect(CCA_ED_DBM).toBe(-62)
    for (const t of ['tag-1', 'tag-2']) expect(atCam(t)).toBeLessThan(CCA_ED_DBM)
    // and beside the plant tag it is well above it — the second "try this"
    const moved = ampCoexistScenario({ protection: 'none', cam: { x: 4, y: 5.6 } })
    const near = rssiOn('2g', buildLinkTable(moved.nodes, moved.walls), 'tag-2', 'cam')
    expect(near).toBeGreaterThan(CCA_ED_DBM)
  })
})

describe('amp-coexist · the round contends for the channel', () => {
  const rs = recs()

  it('the poll clock asks for 20 rounds and gets 20, an average of 5.17 ms late', () => {
    // "Twenty rounds are due in the two seconds and twenty go out, but the poll clock is not a schedule:
    //  the CTS-to-self leaves on average 5.17 ms after the round fell due, and once 12.86 ms after."
    expect(ofType(rs, 'AMP_ROUND').length).toBe(ROUNDS)
    expect(roundCts(rs).length).toBe(ROUNDS)
    const late = lateUs(rs, 100)
    expect(mean(late).toFixed(1)).toBe('5169.8')
    expect((mean(late) / 1000).toFixed(2)).toBe('5.17')
    expect((Math.max(...late) / 1000).toFixed(2)).toBe('12.86')
    expect(Math.min(...late)).toBe(0)
  })

  it('exactly two rounds leave on the tick: the one at t = 0 and the one at 1.8 s', () => {
    // "Only twice in the twenty does it leave on the tick — the first round, because at t = 0 nothing has
    //  a backoff yet and the router's CTS-to-self and the camera's RTS both start at 0 µs, and one round
    //  at 1.8 s that finds the channel free with its backoff already spent."
    const late = lateUs(rs, 100)
    const onTime = late.map((x, i) => [i, x] as const).filter(([, x]) => x === 0)
    expect(onTime.map(([i]) => i)).toEqual([0, 18])
    expect(roundCts(rs)[0].t).toBe(0)
    expect(roundCts(rs)[18].t).toBe(1800 * MS)
    // at t = 0 both EDCAFs fire together: nothing has drawn a backoff yet
    expect(txs(rs).filter((r) => r.node === CAM && r.t === 0).map((r) => r.frame.kind)).toEqual(['rts'])
    expect(ofType(rs, 'BACKOFF_DRAW').filter((r) => r.t <= 0).length).toBe(0)
  })
})

describe('amp-coexist · CTS-to-self is an announcement, not a fence', () => {
  const rs = recs()

  it('the camera takes a 4140 µs NAV from 17 of the 20 rounds', () => {
    // "The camera decodes 17 of the 20 and sets its NAV for the 4140 µs the Duration field asks for."
    const nav = camNav(rs)
    expect(nav.length).toBe(17)
    for (const n of nav) expect(n.untilNs - n.t).toBe(4140 * US)
    // each NAV starts at the end of a round's CTS-to-self
    const ends = new Set(roundCts(rs).map((c) => c.t + c.frame.txTimeNs))
    for (const n of nav) expect(ends.has(n.t)).toBe(true)
  })

  it('the three rounds it misses are the three where it was transmitting at that very instant', () => {
    // "In all three the camera's own RTS starts at the same nanosecond as the CTS-to-self: a half-duplex
    //  radio that is talking cannot hear, and a station that never heard the Duration never sets a NAV."
    const nav = camNav(rs)
    const missed = roundCts(rs).filter((c) => !nav.some((n) => n.t === c.t + c.frame.txTimeNs))
    expect(missed.length).toBe(3)
    for (const m of missed) {
      const cam = txs(rs).filter((r) => r.node === CAM && r.t === m.t)
      expect(cam.map((r) => r.frame.kind), `round at ${m.t}`).toEqual(['rts'])
    }
    expect(missed.map((m) => m.t / US)).toEqual([0, 1003241.4, 1100232.2])
  })

  it('nine camera frames start inside a slot, all of them RTS, and all in those three rounds', () => {
    // "Nine camera frames start inside an uplink slot in the whole run — every one of them an RTS, every
    //  one of them in a round the camera never heard announced."
    const inside = camInSlot(rs)
    expect(inside.length).toBe(9)
    expect(new Set(inside.map((r) => r.frame.kind))).toEqual(new Set(['rts']))
    const nav = camNav(rs)
    const unprotected = roundCts(rs)
      .filter((c) => !nav.some((n) => n.t === c.t + c.frame.txTimeNs))
      .map((c) => ({ from: c.t, to: c.t + c.frame.txTimeNs + c.frame.durationFieldNs }))
    for (const r of inside) expect(unprotected.some((w) => r.t >= w.from && r.t <= w.to)).toBe(true)
    // "The router answers none of them: it is running a round, and a round is not interruptible."
    for (const r of inside) {
      const answer = txs(rs).find((c) => c.node === AP && c.frame.kind === 'cts' && c.frame.dst === 'cam'
        && c.t > r.t && c.t < r.t + 100 * US)
      expect(answer, `RTS at ${r.t}`).toBeUndefined()
    }
    // "Eight of the nine end in a CTS timeout; the ninth ends earlier, when an AMP Ack arrives inside the
    //  timeout window and the camera gives the attempt up on the spot. Either way it doubles its
    //  contention window."
    const timeouts = ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM)
    expect(timeouts.length).toBe(8)
    const timedOut = inside.filter((r) => timeouts.some((t) => t.t === r.t + r.frame.txTimeNs + ERP_2G.ackTimeoutNs))
    expect(timedOut.length).toBe(8)
    // the ninth: an AMP Ack decoded at the camera ends the attempt before the timeout could fire
    const [odd] = inside.filter((r) => !timedOut.includes(r))
    const end = odd.t + odd.frame.txTimeNs
    const amp = ofType(rs, 'RX_OK').find((r) => r.node === CAM && r.t > end && r.frame.kind.startsWith('amp'))!
    const retry = ofType(rs, 'RETRY').find((r) => r.node === CAM && r.t === amp.t)
    expect(retry, `attempt after the RTS at ${odd.t}`).toBeDefined()
    expect(timeouts.some((t) => t.t > end && t.t <= amp.t)).toBe(false)
    // every one of the nine doubles the camera's contention window at the instant it gives up
    for (const at of [...timeouts.map((t) => t.t), amp.t]) {
      const before = ofType(rs, 'CW_CHANGE').filter((c) => c.node === CAM && c.ac === 1 && c.t < at).pop()!
      const after = ofType(rs, 'CW_CHANGE').find((c) => c.node === CAM && c.ac === 1 && c.t === at)!
      expect(after.cw, `attempt failed at ${at}`).toBe(2 * before.cw + 1)
    }
  })

  it('29 of the 40 responses are acknowledged: 8 lost to each other, 3 lost to the camera', () => {
    // "Of the 40 responses the tags send, 29 come back acknowledged — 72.5 %. Eight are lost because both
    //  tags drew the same slot, four times in twenty rounds; the other three are lost to the camera."
    expect(results(rs).length).toBe(2 * ROUNDS)
    expect(acked(rs)).toBe(29)
    expect(((29 / 40) * 100).toFixed(1)).toBe('72.5')
    expect(TAGS.map((t) => results(rs).filter((r) => r.node === t && r.acked).length)).toEqual([15, 14])
    const both = ofType(rs, 'COLLISION').filter((c) => TAGS.every((t) => c.nodes.includes(t)) && !c.nodes.includes(CAM))
    expect(both.length).toBe(4)
    const toCam = ofType(rs, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision')
    expect(toCam.length).toBe(3)
    expect(29 + 4 * 2 + 3).toBe(40)
    // "and all three fall in the rounds it never heard announced"
    const nav = camNav(rs)
    const unprotected = roundCts(rs)
      .filter((c) => !nav.some((n) => n.t === c.t + c.frame.txTimeNs))
      .map((c) => ({ from: c.t, to: c.t + c.frame.txTimeNs + c.frame.durationFieldNs }))
    for (const f of toCam) expect(unprotected.some((w) => f.t >= w.from && f.t <= w.to)).toBe(true)
  })

  it('the four slots of every round are mostly silence: 44 of the 80 carry nothing', () => {
    // "Two tags in four slots leave most of the round empty: of the 80 slots, 44 are silent, 32 carry one
    //  response and 4 carry both."
    const resp = txs(rs).filter((r) => r.frame.kind === 'ampResp')
    const per = slots(rs).map((s) => resp.filter((r) => r.t >= s.t && r.t < s.untilNs).length)
    expect(per.length).toBe(4 * ROUNDS)
    expect([per.filter((n) => n === 0).length, per.filter((n) => n === 1).length, per.filter((n) => n === 2).length])
      .toEqual([44, 32, 4])
  })
})

describe('amp-coexist · what the round costs the Wi-Fi', () => {
  it('the round reserves 4.19 % of the second and puts 3.044 % of it on the air', () => {
    // "Each round reserves 4190 µs of every 100 ms — 4.19 % — but only 3044 µs of that is ever modulated:
    //  30 440 µs a second, 3.044 % of the channel. The difference is the empty slots."
    expect(((4190 / 100_000) * 100).toFixed(2)).toBe('4.19')
    expect(50 + 618 + 4 * 330).toBe(1988)
    expect(1988 + 2 * 528).toBe(3044)
    const air = ampAirNs(recs())
    expect(air / US).toBe(3044 * ROUNDS)
    expect(air / US / 2).toBe(30_440)
    expect(((air / RUN_NS) * 100).toFixed(3)).toBe('3.044')
  })

  it('the camera pays 5.13 % of its throughput for the polling', () => {
    // "The camera gets 99.89 Mb/s through with the polling running and 105.29 Mb/s in the same flat with
    //  the tags taken away: it pays 5.13 % of its throughput for a round that spends 3.044 % of the air."
    expect(delivered(recs(), CAM)).toBe(16_649)
    expect(delivered(recs(WIFI_ONLY), CAM)).toBe(17_549)
    expect(camMbps(recs()).toFixed(2)).toBe('99.89')
    expect(camMbps(recs(WIFI_ONLY)).toFixed(2)).toBe('105.29')
    expect(((1 - 16_649 / 17_549) * 100).toFixed(2)).toBe('5.13')
  })
})

describe('amp-coexist · with no protection at all', () => {
  const rs = recs(NONE)

  it('no CTS-to-self, no NAV, and the camera starts inside 79 of the 80 slots', () => {
    // "Take the CTS-to-self away and the camera never hears about the round at all: no NAV in the whole
    //  run, and 79 camera frames start inside an uplink slot instead of nine."
    expect(roundCts(rs).length).toBe(0)
    expect(camNav(rs).length).toBe(0)
    expect(ofType(rs, 'NAV_SET').filter((r) => r.node === CAM).length).toBe(0)
    expect(ofType(rs, 'AMP_ROUND').length).toBe(ROUNDS)
    expect(slots(rs).length).toBe(4 * ROUNDS)
    const inside = camInSlot(rs)
    expect(inside.length).toBe(79)
    expect(new Set(inside.map((r) => r.frame.kind))).toEqual(new Set(['rts']))
    expect(inside[0].t).toBe(817 * US)
  })

  it('the acknowledged share falls from 72.5 % to 17.5 % and the router logs 25 collisions', () => {
    // "Seven of the 40 responses survive — 17.5 %, against 72.5 % with the CTS-to-self — and the router
    //  records 25 receptions that failed with reason collision, against 3."
    expect(results(rs).length).toBe(2 * ROUNDS)
    expect(acked(rs)).toBe(7)
    expect(((7 / 40) * 100).toFixed(1)).toBe('17.5')
    expect(TAGS.map((t) => results(rs).filter((r) => r.node === t && r.acked).length)).toEqual([4, 3])
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length).toBe(25)
    expect(ofType(recs(), 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length).toBe(3)
  })

  it('the camera is worse off too: 78 unanswered RTS and 94.08 Mb/s instead of 99.89', () => {
    // "The camera does not win what the tags lose. Its RTS goes unanswered 78 times instead of 8, and its
    //  own throughput falls to 94.08 Mb/s — below the 99.89 Mb/s it managed while it was being kept out."
    expect(ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM).length).toBe(78)
    expect(delivered(rs, CAM)).toBe(15_680)
    expect(camMbps(rs).toFixed(2)).toBe('94.08')
    expect(camMbps(rs)).toBeLessThan(camMbps(recs()))
    expect(((1 - 15_680 / 17_549) * 100).toFixed(2)).toBe('10.65')
  })
})

describe('amp-coexist · polling five times as often', () => {
  const rs = recs(POLL20)

  it('a 20 ms poll clock reserves 20.95 % of the channel and modulates 15.22 % of it', () => {
    // "At 20 ms the same 4190 µs round reserves 20.95 % of the channel and its 3044 µs of PPDU become
    //  152 200 µs a second, 15.22 %."
    expect(ofType(rs, 'AMP_ROUND').length).toBe(5 * ROUNDS)
    expect(((4190 / 20_000) * 100).toFixed(2)).toBe('20.95')
    const air = ampAirNs(rs)
    expect(air / US / 2).toBe(152_200)
    expect(((air / RUN_NS) * 100).toFixed(2)).toBe('15.22')
  })

  it('the camera drops to 77.41 Mb/s, 26.49 % below the no-AMP run', () => {
    // "The camera drops to 77.41 Mb/s — 26.49 % below the 105.29 Mb/s of the Wi-Fi-only run — while the
    //  tags do slightly worse per round than before: 139 of 200 responses acknowledged, 69.5 %."
    expect(delivered(rs, CAM)).toBe(12_901)
    expect(camMbps(rs).toFixed(2)).toBe('77.41')
    expect(((1 - 12_901 / 17_549) * 100).toFixed(2)).toBe('26.49')
    expect(results(rs).length).toBe(2 * 5 * ROUNDS)
    expect(acked(rs)).toBe(139)
    expect(((139 / 200) * 100).toFixed(1)).toBe('69.5')
    // the "Two seconds, four runs" table's last row: 33 camera frames land inside a slot
    expect(camInSlot(rs).length).toBe(33)
    expect(camNav(rs).length).toBe(90)
  })
})

describe('amp-coexist · the other band never notices', () => {
  it('the 5 GHz phone delivers exactly the same 2365 frames in all four runs', () => {
    // "The phone is on the router's 5 GHz radio, and it delivers exactly 2365 video frames — 13.24 Mb/s —
    //  in the base run, with no protection, at a 20 ms poll clock and with no AMP at all. Not one frame
    //  of difference: the two links share a router, not a channel."
    const counts = [recs(), recs(NONE), recs(POLL20), recs(WIFI_ONLY)].map((rs) => delivered(rs, 'ap'))
    expect(counts).toEqual([2365, 2365, 2365, 2365])
    for (const rs of [recs(), recs(NONE), recs(POLL20), recs(WIFI_ONLY)]) {
      expect(mbps(rs, 'ap').toFixed(2)).toBe('13.24')
    }
    // and the phone's own lane really is the 5 GHz one, untouched by 2.4 GHz records
    const phoneRx = ofType(recs(), 'RX_OK').filter((r) => r.node === 'phone' && r.frame.kind === 'data')
    expect(phoneRx.length).toBe(2365)
    expect(txs(recs()).filter((r) => r.node === 'ap' && r.frame.kind === 'data')[0].t).toBe(883_111)
  })
})

describe('amp-coexist · observe', () => {
  it('the camera’s first NAV is the second round’s, at 111.914 ms', () => {
    // "Then jump to the camera's first NAV, at 111.914 ms — the second round's — and watch it sit out
    //  the whole 4140 µs."
    const nav = camNav(recs())
    expect((nav[0].t / MS).toFixed(3)).toBe('111.914')
    const cts = roundCts(recs())
    expect(nav[0].t).toBe(cts[1].t + cts[1].frame.txTimeNs)
  })

  it('the jump the observe step uses really lands on the record the sentence describes', () => {
    // "jump to the first camera RTS the router never answers, at 73 µs: it started at 0 µs, with the
    //  trigger, and the router was transmitting."
    const rs = recs(NONE)
    const jump = ampCoexist.jumps[2] // the unanswered camera RTS
    const first = rs.find(jump.find)!
    expect(first.type).toBe('CTS_TIMEOUT')
    expect(first.t).toBe(73 * US)
    const itsRts = txs(rs).filter((r) => r.node === CAM && r.frame.kind === 'rts' && r.t < first.t).pop()!
    expect(itsRts.t).toBe(0)
    const trigger = txs(rs).find((r) => r.frame.kind === 'ampTrigger')!
    expect(trigger.t).toBe(0)
    expect(first.t).toBe(itsRts.t + itsRts.frame.txTimeNs + ERP_2G.ackTimeoutNs)
    // and slot 1 has not even opened yet at that point
    expect(slots(rs)[0].t).toBe(628 * US)
  })

  it('the second timeout, at 890 µs, is the in-slot one: RX_FAIL at 1156 µs, Ack naming the router', () => {
    // "Step to the next timeout, at 890 µs — its RTS started at 817 µs, inside slot 1 over a tag's
    //  response, so the router logs an RX_FAIL with reason collision at 1156 µs and the closing Ack
    //  names itself."
    const rs = recs(NONE)
    const second = ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM)[1]
    expect(second.t).toBe(890 * US)
    const rts = camInSlot(rs)[0]
    expect(rts.t).toBe(817 * US)
    expect(rts.frame.kind).toBe('rts')
    expect(second.t).toBe(rts.t + rts.frame.txTimeNs + ERP_2G.ackTimeoutNs)
    const slot = slots(rs).find((s) => rts.t >= s.t && rts.t < s.untilNs)!
    expect(slot.slot).toBe(1)
    const resp = txs(rs).filter((r) => r.frame.kind === 'ampResp' && r.t >= slot.t && r.t < slot.untilNs)
    expect(resp.length).toBe(1)
    const fail = ofType(rs, 'RX_FAIL').find((r) => r.node === AP && r.t >= slot.t && r.t <= slot.untilNs)!
    expect(fail.reason).toBe('collision')
    expect(fail.t).toBe(1156 * US)
    const ack = txs(rs).find((r) => r.frame.kind === 'ampAck' && r.t >= slot.untilNs)!
    expect(ack.frame.amp!.ackFor).toBe(1)
    expect(ack.frame.dst).toBe(ack.frame.src)
  })

  it('the phone’s lane starts at 883.111 µs in every run', () => {
    // "2365 frames, the first at 883.111 µs"
    for (const rs of [recs(), recs(NONE), recs(POLL20), recs(WIFI_ONLY)]) {
      const first = txs(rs).filter((r) => r.node === 'ap' && r.frame.kind === 'data')[0]
      expect((first.t / US).toFixed(3)).toBe('883.111')
    }
  })
})

describe('amp-coexist · what the UI shows', () => {
  it('the log prints the three lines the lesson tells the reader to look for', () => {
    // "“AIFS wait until … [AC_BK]” before every round, “NAV set until … (cts:ap)” at the camera,
    //  “CTS timeout” when it walks into one"
    const rs = recs()
    const aifs = ofType(rs, 'IFS_START').find((r) => r.node === AP && r.ac === 0 && r.untilNs > r.t)!
    expect(fmtRecord(aifs)).toBe('ap#2g AIFS wait until 0.004 263 000 [AC_BK]')
    expect(fmtRecord(camNav(rs)[0])).toBe('cam#2g NAV set until 0.116 053 600 (cts:ap)')
    expect(fmtRecord(ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM)[0])).toBe('cam#2g CTS timeout')
    // "The CTS-to-self: open it and read the Duration field — 4140 µs, exactly the round that follows."
    const cts = roundCts(rs)[0]
    const fields = decodeFrame(cts.frame, { apId: 'ap', isEdca: true }).users[0].subframes[0].mpdu.fields
    expect(fields.find((f) => f.key === 'duration')!.value).toContain('4140')
  })
})

describe('amp-coexist · try this', () => {
  it('moving the camera beside Tag 2 lets carrier sense do the protection’s job', () => {
    // "Drag the camera to (4, 5.6), 40 cm from the plant tag, and reload the no-protection variant: the
    //  camera now hears the tag's own signal well above −62 dBm, defers on it, and the router records not
    //  one collision instead of 25. 26 readings are acknowledged where 7 were."
    const rs = run(ampCoexistScenario({ protection: 'none', cam: { x: 4, y: 5.6 } }), 'moved')
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length).toBe(0)
    expect(acked(rs)).toBe(26)
    expect(acked(recs(NONE))).toBe(7)
    // "the price is seven rounds in which a tag cannot decode the trigger because the camera beside it
    //  is transmitting, and never answers at all"
    expect(results(rs).length).toBe(33)
    expect(2 * ROUNDS - 33).toBe(7)
  })

  it('the no-protection variant also costs the camera: 78 unanswered RTS and 94.08 Mb/s', () => {
    // "The acknowledged share falls from 72.5 % to 17.5 % and the camera frames landing inside a slot go
    //  from 9 to 79 — but look at the camera too: 78 unanswered RTS instead of 8, and 94.08 Mb/s instead
    //  of 99.89."
    expect([acked(recs()), acked(recs(NONE))]).toEqual([29, 7])
    expect([camInSlot(recs()).length, camInSlot(recs(NONE)).length]).toEqual([9, 79])
    const timeouts = (rs: TLRecord[]) => ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM).length
    expect([timeouts(recs()), timeouts(recs(NONE))]).toEqual([8, 78])
    expect([camMbps(recs()).toFixed(2), camMbps(recs(NONE)).toFixed(2)]).toEqual(['99.89', '94.08'])
  })
})

/**
 * **The lesson's own figures, read back out of the lesson.**
 *
 * `@amp-coexist` prints more hand-typed figures into its graded prose than any other lesson in the
 * course — 111 on the 2026-10-12 sweep, with **zero** interpolated from a computed constant — and
 * it was one of the eighteen lessons whose test never touched its prose at all
 * (`tests/course/prose-readback.test.ts`). Everything above measures the engine and compares it to
 * literals written HERE, which catches an engine change and misses a prose change.
 *
 * Every figure checked below was already exact. What this buys is that the lesson's copy is now the
 * thing under test: editing 99.89 to 99.98 in the lesson stops shipping green.
 *
 * One figure needed its definition recovered before it could be compared, and the definition is
 * the interesting part: 「每个轮都要在每 100 ms 里预留 4190 µs」 is NOT the round's own span
 * (`untilNs − t` = 4 130 µs) and not the camera's NAV (4 140 µs). It is the CTS-to-self's first
 * microsecond to the round's last — the whole stretch the camera is held out of, protection frame
 * included — and it is 4 190 µs on all twenty rounds. A figure whose convention is not written
 * down cannot be re-measured; this one now has both.
 */
describe('amp-coexist · the figures the lesson prints are read back out of it', () => {
  /** Each row label of the four-run table against the variant it names. */
  const ROWS: readonly (readonly [string, number | undefined])[] = [
    ['只有 Wi-Fi（没有标签）', WIFI_ONLY],
    ['轮询 + CTS-to-self', undefined],
    ['轮询 + 无保护', NONE],
    ['CTS-to-self，每 20 ms 轮询', POLL20],
  ]

  const tableRows = (): string[][] => {
    const b = ampCoexist.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes('四种跑法'))
    expect(b, 'the four-run table is gone from `numbers`').toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }
  const prose = (): string => JSON.stringify(ampCoexist.numbers)
  /** 「105.29 Mb/s」 → 105.29; 「9」 → 9. */
  const val = (cell: string): number => Number(cell.replace(/\s|Mb\/s/g, ''))
  /** The phone's video is downlink, so its goodput is keyed on the ENQUEUE destination. */
  const phoneMbps = (rs: TLRecord[]): number => {
    const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
    const mine = new Map(ofType(rs, 'ENQUEUE').filter((r) => r.dst === 'phone').map((r) => [r.msduId, r.bytes]))
    let bits = 0
    for (const r of ofType(rs, 'DEQUEUE')) {
      if (mine.has(r.msduId) && !dropped.has(r.msduId)) bits += 8 * (mine.get(r.msduId) ?? 0)
    }
    return bits / (RUN_NS / 1e9) / 1e6
  }

  it('the four-run table: every cell of every row, against the run the reader loads', () => {
    const rows = tableRows()
    expect(rows.map((r) => r[0]), 'the row labels the lesson prints')
      .toEqual(ROWS.map(([label]) => label))
    for (const [i, [label, variant]] of ROWS.entries()) {
      const rs = recs(variant)
      const row = rows[i]
      const res = results(rs)
      if (row[1] === '—') {
        expect(res, `${label}: the dash means there are no tag responses to count`).toHaveLength(0)
        expect(row[2], `${label}: and no camera frames can land in a slot there either`).toBe('—')
        expect(camInSlot(rs), `${label}: camera transmissions inside an uplink slot`).toHaveLength(0)
      } else {
        const m = /^(\d+) \/ (\d+) \(([\d.]+) %\)$/.exec(row[1])
        expect(m, `${label}: the 读数被确认 cell is not in the shape 「a / b (c %)」`).not.toBeNull()
        expect([Number(m![1]), Number(m![2])], `${label}: acknowledged of sent`)
          .toEqual([acked(rs), res.length])
        expect(Number(m![3]), `${label}: and the percentage it states of those two`)
          .toBe(Number(((100 * acked(rs)) / res.length).toFixed(1)))
        expect(val(row[2]), `${label}: camera frames beginning inside an uplink slot`)
          .toBe(camInSlot(rs).length)
      }
      expect(val(row[3]), `${label}: the camera's goodput`).toBe(Number(camMbps(rs).toFixed(2)))
      expect(val(row[4]), `${label}: the 5 GHz phone's goodput`).toBe(Number(phoneMbps(rs).toFixed(2)))
    }
    // the phone column is the same figure four times, which is the table's whole point: the round
    // happens on 2.4 GHz and the 5 GHz link never notices
    expect(new Set(rows.map((r) => r[4])), 'the phone column must be one value, not four')
      .toEqual(new Set([rows[0][4]]))
  })

  it('the slot census: eighty slots, and where all forty responses went', () => {
    // The counts in the second half are Chinese numerals, not digits, so `zhNumeral` reads them
    // — the same parser `wifi-coverage.test.ts` uses on 「最近九门新课」.
    const m = /标签一共送出 (\d+) 帧回应，(\d+) 帧拿到了确认——([\d.]+) %。丢掉的([一-鿿]+)帧里，([一-鿿]+)帧是两个标签抽到了同一个时隙，([一-鿿]+)轮里发生了([一-鿿]+)次；另外([一-鿿]+)帧输给了摄像头/
      .exec(prose())
    expect(m, 'the slot-census sentence is gone, or its shape changed').not.toBeNull()
    const rs = recs()
    const res = results(rs)
    expect(Number(m![1]), 'responses sent').toBe(res.length)
    expect(Number(m![2]), 'responses acknowledged').toBe(acked(rs))
    expect(Number(m![3]), 'and the percentage of the two').toBe(Number(((100 * acked(rs)) / res.length).toFixed(1)))
    // the eleven lost frames split two ways, and the split is measurable
    const ss = slots(rs)
    const responses = txs(rs).filter((r) => TAGS.includes(r.node))
    const perSlot = ss.map((s) => responses.filter((r) => r.t >= s.t && r.t < s.untilNs).length)
    const doubled = perSlot.filter((x) => x === 2).length
    const zh = (i: number): number => {
      const v = zhNumeral(m![i])
      expect(v, `group ${i} 「${m![i]}」 is not a Chinese numeral this parser reads`).not.toBeNull()
      return v!
    }
    expect(zh(4), 'the lost total the sentence names').toBe(res.length - acked(rs))
    expect(zh(7), 'slots that drew two responses').toBe(doubled)
    expect(zh(5), 'and the frames lost in them, two per slot').toBe(2 * doubled)
    expect(zh(6), 'rounds in the run').toBe(ofType(rs, 'AMP_ROUND').length)
    expect(zh(5) + zh(8), 'the two causes account for every lost frame')
      .toBe(res.length - acked(rs))
    // 「三次都落在它没听见公告的那几个轮里」: rounds whose CTS the camera never heard
    expect(roundCts(rs).length - camNav(rs).length, 'rounds the camera took no NAV from')
      .toBe(zh(8))

    const census = /(\d+) 个时隙里 (\d+) 个安静无声，(\d+) 个装着一帧回应，(\d+) 个装着两帧/.exec(prose())
    expect(census, 'the 80-slot census is gone from the same paragraph').not.toBeNull()
    expect(Number(census![1]), 'slots in the run').toBe(ss.length)
    expect([Number(census![2]), Number(census![3]), Number(census![4])], 'empty, one, two')
      .toEqual([perSlot.filter((x) => x === 0).length, perSlot.filter((x) => x === 1).length, doubled])
    expect(Number(census![2]) + Number(census![3]) + Number(census![4]), 'and they are all the slots')
      .toBe(ss.length)
  })

  it('the airtime paragraph: what is reserved, what is modulated, and both percentages', () => {
    const m = /每 100 ms 里预留 (\d+) µs——([\d.]+) %——但其中真正被调制（modulation）到空口上的只有 (\d+) µs：每秒 ([\d\s]+) µs，占信道的 ([\d.]+) %/
      .exec(prose())
    expect(m, 'the airtime paragraph is gone, or its shape changed').not.toBeNull()
    const rs = recs()
    // **The reserved stretch is the CTS-to-self's first microsecond to the round's last.** Not the
    // round span (4 130 µs) and not the camera's NAV (4 140 µs) — the figure's convention, which
    // was nowhere until this test.
    const rounds = ofType(rs, 'AMP_ROUND')
    const cts = roundCts(rs)
    const reserved = [...new Set(rounds.map((r, i) => (r.untilNs - cts[i].t) / US))]
    expect(reserved, 'every round reserves the same stretch').toHaveLength(1)
    expect(Number(m![1]), 'the reserved stretch the lesson states').toBe(reserved[0])
    expect(Number(m![2]), 'as a percentage of the 100 ms poll interval')
      .toBe(Number(((100 * reserved[0]) / (100 * 1000)).toFixed(2)))
    const perRound = ampAirNs(rs) / rounds.length / US
    expect(Number(m![3]), 'the microseconds actually modulated in one round').toBe(perRound)
    expect(Number(m![4].replace(/\s/g, '')), 'and per second over the run')
      .toBe(ampAirNs(rs) / US / (RUN_NS / 1e9))
    expect(Number(m![5]), 'which is this share of the channel')
      .toBe(Number(((100 * ampAirNs(rs)) / RUN_NS).toFixed(3)))
    // the reserved stretch really is the bigger of the two, which is the paragraph's point
    expect(Number(m![1]), 'reserved exceeds modulated').toBeGreaterThan(Number(m![3]))
  })

  it('the formula under it adds up, and each term is one frame of the round', () => {
    const f = ampCoexist.numbers!.find((x) => x.kind === 'formula') as { text: string } | undefined
    expect(f, 'the per-round formula is gone from `numbers`').toBeDefined()
    const m = /每轮：(\d+)（CTS）\+ (\d+)（触发帧）\+ (\d+) × (\d+)（Ack）= (\d+) µs，再加 (\d+) × (\d+)（两帧回应）= (\d+) µs/
      .exec(f!.text)
    expect(m, 'the formula no longer states its terms in the shape this reads').not.toBeNull()
    const n = m!.slice(1).map(Number)
    expect(n[0] + n[1] + n[2] * n[3], 'the lesson’s own first subtotal').toBe(n[4])
    expect(n[4] + n[5] * n[6], 'and its total').toBe(n[7])
    // every term against the frame it names, once per round
    const rs = recs()
    const rounds = ofType(rs, 'AMP_ROUND').length
    const each = (pred: (r: ReturnType<typeof txs>[number]) => boolean): [number, number] => {
      const hits = txs(rs).filter(pred)
      const sizes = [...new Set(hits.map((r) => r.frame.txTimeNs / US))]
      expect(sizes, 'one frame length per kind').toHaveLength(1)
      return [hits.length / rounds, sizes[0]]
    }
    expect(each((r) => r.node === AP && r.frame.kind === 'cts' && r.frame.dst === r.frame.src),
      'the protection CTS: one per round, and its length').toEqual([1, n[0]])
    expect(each((r) => r.node === AP && r.frame.kind === 'ampTrigger'),
      'the trigger frame').toEqual([1, n[1]])
    expect(each((r) => r.node === AP && r.frame.kind === 'ampAck'),
      'the Acks: four per round').toEqual([n[2], n[3]])
    expect(each((r) => TAGS.includes(r.node)), 'the two responses').toEqual([n[5], n[6]])
  })

  it('the cost sentence: both throughputs, and the percentage it draws from them', () => {
    const m = /轮询开着时摄像头能送出 ([\d.]+) Mb\/s，把标签从同一间屋子里拿掉后是 ([\d.]+) Mb\/s：为了一个只占 ([\d.]+) % 空口时间的轮，它付出了 ([\d.]+) % 的吞吐/
      .exec(prose())
    expect(m, 'the cost sentence is gone, or its shape changed').not.toBeNull()
    const withRound = Number(camMbps(recs()).toFixed(2))
    const without = Number(camMbps(recs(WIFI_ONLY)).toFixed(2))
    expect(Number(m![1]), 'the camera with the round running').toBe(withRound)
    expect(Number(m![2]), 'and with the tags taken out of the flat').toBe(without)
    expect(Number(m![3]), 'the airtime share, same figure as the paragraph above')
      .toBe(Number(((100 * ampAirNs(recs())) / RUN_NS).toFixed(3)))
    expect(Number(m![4]), 'the throughput it costs, drawn from the lesson’s own two figures')
      .toBe(Number(((100 * (without - withRound)) / without).toFixed(2)))
    // and the sentence’s point: the throughput cost is the larger of the two
    expect(Number(m![4])).toBeGreaterThan(Number(m![3]))
  })

  it('taking the protection away: the camera stops hearing the round, and both counts move', () => {
    const m = /落进上行时隙的摄像头帧从九帧涨到 (\d+) 帧。(\d+) 帧回应只有 (\d+) 帧成功——([\d.]+) %，而有 CTS-to-self 时是 ([\d.]+) %——路由器记下了 (\d+) 次原因为 collision 的接收失败，而此前只有 (\d+) 次/
      .exec(prose())
    expect(m, 'the no-protection paragraph is gone, or its shape changed').not.toBeNull()
    const bare = recs(NONE)
    const prot = recs()
    expect(camInSlot(bare).length, 'camera frames inside a slot with no protection').toBe(Number(m![1]))
    expect(camInSlot(prot).length, 'and the nine the sentence compares them with').toBe(9)
    expect(results(bare).length, 'responses sent').toBe(Number(m![2]))
    expect(acked(bare), 'responses acknowledged').toBe(Number(m![3]))
    expect(Number(m![4]), 'the unprotected success rate')
      .toBe(Number(((100 * acked(bare)) / results(bare).length).toFixed(1)))
    expect(Number(m![5]), 'the protected one, same figure as the table')
      .toBe(Number(((100 * acked(prot)) / results(prot).length).toFixed(1)))
    const coll = (rs: TLRecord[]): number =>
      ofType(rs, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length
    expect(coll(bare), 'collision failures at the router without protection').toBe(Number(m![6]))
    expect(coll(prot), 'and with it').toBe(Number(m![7]))
    // 「彻底不知道轮的存在」: not a reduced NAV count, zero
    expect(camNav(bare), 'the camera takes no NAV from a round it cannot hear').toHaveLength(0)
    expect(camNav(prot).length, 'while with protection it takes one most rounds').toBeGreaterThan(0)
  })
})

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **The four-run table is read out of the lesson above; the prose around it is not.** The sweep
 * of 2026-10-13 plants one edit per printed figure and runs this file: of the 161 figures this
 * lesson prints, PLACEHOLDER could be edited with the suite green. `picture` (35 of them), the
 * paragraphs of `numbers` (77), `observe`, `tryThis` and the quiz (20) were the whole remainder.
 *
 * Nothing new is measured below. Every assertion calls the same `recs`, `roundCts`, `lateUs`,
 * `camInSlot`, `camNav`, `acked`, `camMbps` the tests above call, and the figure comes out of the
 * prose. Where a figure is printed in three places — 72.5 % is in the table, in a paragraph under
 * it and in `tryThis` — every occurrence is read.
 */
describe('amp-coexist · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(ampCoexist).map((t) => t.text).join('\n')
  const num = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(num)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }
  const blockText = (b: unknown): string => {
    const o = b as { heading?: string; text?: string; items?: string[]; note?: string; caption?: string }
    return [o.heading ?? '', o.text ?? '', (o.items ?? []).join('\n'), o.note ?? '', o.caption ?? '']
      .join('\n')
  }
  const pic = (ampCoexist.picture ?? []).map(blockText).join('\n')
  const nums = (ampCoexist.numbers ?? []).map(blockText).join('\n')
  const obs = ampCoexist.observe.join('\n')
  const trys = ampCoexist.tryThis.join('\n')
  const quizText = ampCoexist.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')

  /*
   * The phone's video is DOWNLINK, so its frames and its goodput are keyed on the destination of
   * the ENQUEUE and not on the node of the DEQUEUE — the AP is the one dequeuing them.
   */
  const phoneFrames = (rs: TLRecord[]): number => {
    const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
    const mine = new Set(ofType(rs, 'ENQUEUE').filter((r) => r.dst === 'phone').map((r) => r.msduId))
    return ofType(rs, 'DEQUEUE').filter((r) => mine.has(r.msduId) && !dropped.has(r.msduId)).length
  }
  const phoneGoodput = (rs: TLRecord[]): number => {
    const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
    const bytes = new Map(ofType(rs, 'ENQUEUE').filter((r) => r.dst === 'phone')
      .map((r) => [r.msduId, r.bytes]))
    let bits = 0
    for (const r of ofType(rs, 'DEQUEUE')) {
      if (bytes.has(r.msduId) && !dropped.has(r.msduId)) bits += 8 * (bytes.get(r.msduId) ?? 0)
    }
    return bits / (RUN_NS / 1e9) / 1e6
  }
  const SCENE = ampCoexist.scenario()
  const NODE = (id: string) => SCENE.nodes.find((n) => n.id === id)!
  const EXT = ERP_2G.signalExtNs
  const POLL_MS = NODE('ap').ampAp!.pollIntervalMs

  it('`picture`: the floor plan, the two bands, and the window every figure is taken over', () => {
    // 「路由器在书房的 (3, 4)」「(2, 2) 的窗磁和 (4, 6) 的植物传感器」「(6, 4) 有一台摄像头」
    const pairs = [...pic.matchAll(/\((\d+(?:\.\d+)?), ?(\d+(?:\.\d+)?)\)/g)]
      .map((m) => [num(m[1]!), num(m[2]!)] as const)
    expect(pairs.length, '`picture` places four things by coordinate').toBeGreaterThanOrEqual(4)
    const placed = SCENE.nodes.map((n) => [n.pos.x, n.pos.y] as const)
    for (const [x, y] of pairs) {
      expect(placed.some((p) => p[0] === x && p[1] === y),
        `(${x}, ${y}) is where this scene really puts something`).toBe(true)
    }
    // 「每 100 ms 回应一次轮询」
    const [pollMs] = figs(pic, /每 (\d+) ms 回应一次轮询/, '`picture` on the poll interval')
    expect(pollMs, 'the interval this scene polls at').toBe(POLL_MS)
    // 「下文每个数字都是在头两秒里量出来的」 — a Chinese numeral, read with the course's reader
    const [secs] = raw(pic, /头(.)秒里量出来的/, '`picture` on the window')
    expect(zhNumeral(secs!.replace(/两/g, '二'))! * 1000 * MS, 'the window this file measures over')
      .toBe(RUN_NS)
    /*
     * Every 「N GHz」 is a band **this scene** puts a radio on — a band name is the fourth
     * exemption class and only checkable as membership, so the set has to be the narrowest one
     * there is. Against every band `LINK_EXTRA_LOSS_DB` knows, 「5 GHz」 could be edited to
     * 「6 GHz」 and stayed green, because the engine has a 6 GHz link too — just not here.
     */
    const GHZ: Record<string, number> = { '2g': 2.4, '5g': 5, '6g': 6 }
    const used = linkPlanFor(SCENE.nodes).links.map((l) => GHZ[l]!)
    expect(used.length, 'this scene really runs on two bands').toBe(2)
    for (const v of everyFig(/([\d.]+) GHz/g, 'a band the prose names', 6)) {
      expect(used, `${v} GHz is a band this scene puts a radio on`).toContain(num(v))
    }
    // 「标签的上行是 250 kb/s 的 OOK」 and 「标签的发射功率是 0 dBm」
    const [kbps] = figs(pic, /上行（uplink, UL）是 (\d+) kb\/s/, '`picture` on the uplink rate')
    expect(kbps, 'the rate this scene’s tags answer at').toBe(NODE('ap').ampAp!.ulKbps)
    const [tagDbm] = figs(pic, /标签的发射功率（transmit power）是 (\d+) dBm/,
      '`picture` on what a tag transmits at')
    expect(tagDbm, 'the power the tags really transmit at').toBe(NODE('tag-1').txPowerDbm)
    // 「植物标签只有 −65.7 dBm，窗磁只有 −71.7 dBm，都低于 −62 dBm 的能量检测门限」
    const links = buildLinkTable(SCENE.nodes, SCENE.walls)
    const [plant, window_, ed] = raw(pic,
      /植物标签只有 (−[\d.]+) dBm，窗磁只有 (−[\d.]+) dBm，都低于 (−\d+) dBm 的能量检测门限/,
      '`picture` on what the camera hears of the tags')
    const atCam = (tag: string): number => rssiOn('2g', links, tag, 'cam')
    same(plant!, atCam('tag-2'), 'the plant tag at the camera')
    same(window_!, atCam('tag-1'), 'and the window sensor')
    expect(num(ed!), 'the threshold `phy.ts` exports').toBe(CCA_ED_DBM)
    for (const tag of ['tag-1', 'tag-2']) {
      expect(atCam(tag), `${tag} is under it, so the camera never senses the slot`)
        .toBeLessThan(CCA_ED_DBM)
    }
  })

  it('the AIFS formula, both access categories, and the 36 µs the round starts behind', () => {
    const f = ampCoexist.picture!.find(
      (b): b is Extract<typeof b, { kind: 'formula' }> => b.kind === 'formula')!
    // 「2.4 GHz：SIFS 10 µs，时隙 9 µs」
    const [sifs, slot] = figs(f.text, /SIFS (\d+) µs，时隙 (\d+) µs/,
      'the formula block on the two constants')
    expect(sifs! * US, 'the SIFS of this band').toBe(ERP_2G.sifsNs)
    expect(slot! * US, 'and its slot').toBe(ERP_2G.slotNs)
    // 「AC_BK 要等 10 + 7 × 9 = 73 µs」 and 「AC_BE 只等 10 + 3 × 9 = 37 µs」
    const [bkS, bkN, bkSlot, bkTotal] = figs(f.note!,
      /AC_BK 要等 (\d+) \+ (\d+) × (\d+) = (\d+) µs/, 'the note on AC_BK’s own AIFS')
    const [beS, beN, beSlot, beTotal] = figs(f.note!,
      /AC_BE 只等 (\d+) \+ (\d+) × (\d+) = (\d+) µs/, 'and on AC_BE’s')
    const acOf = (name: string): number => {
      const i = EDCA_PARAMS.findIndex((p) => p.name === name)
      expect(i, `the standard has an access category called ${name}`).toBeGreaterThanOrEqual(0)
      return i
    }
    for (const [s, n, sl, total, ac] of [
      [bkS, bkN, bkSlot, bkTotal, 'BK'], [beS, beN, beSlot, beTotal, 'BE'],
    ] as const) {
      expect(s! * US, `${ac}: the SIFS term`).toBe(ERP_2G.sifsNs)
      expect(sl! * US, `${ac}: the slot term`).toBe(ERP_2G.slotNs)
      expect(n, `${ac}: the AIFSN the standard gives it`).toBe(EDCA_PARAMS[acOf(ac)]!.aifsn)
      expect(s! + n! * sl!, `${ac}: the lesson’s own product`).toBe(total)
      expect(total! * US, `${ac}: and the AIFS the engine computes`)
        .toBe(aifsNs(EDCA_PARAMS[acOf(ac)]!.aifsn, ERP_2G))
    }
    // 「而这个轮一开始就落后 36 µs」
    const [behind] = figs(f.note!, /一开始就落后 (\d+) µs/, 'the note on how far behind it starts')
    expect(behind! * US, 'the difference between the two AIFS values')
      .toBe(aifsNs(bkN!, ERP_2G) - aifsNs(beN!, ERP_2G))
  })

  it('the twenty rounds: how many, how late, and the two that were not', () => {
    const rs = recs()
    const late = lateUs(rs, POLL_MS)
    // 「两秒里该发二十个轮，也确实发出了二十个」 — both counts in Chinese
    const [should, did] = raw(EVERYWHERE, /该发([一二三四五六七八九十]+)个轮，也确实发出了([一二三四五六七八九十]+)个/,
      '`numbers` on how many rounds the window holds')
    const want = zhNumeral(should!.replace(/两/g, '二'))!
    expect(want, 'the rounds the poll clock asks for').toBe(RUN_NS / (POLL_MS * MS))
    expect(zhNumeral(did!.replace(/两/g, '二')), 'and the rounds the AP really started')
      .toBe(roundCts(rs).length)
    // 「CTS-to-self 平均比「到点」晚 5.17 ms 才出去，最晚的一次晚了 12.86 ms」
    const [avg, worst] = raw(EVERYWHERE, /平均比“到点”晚 ([\d.]+) ms 才出去，最晚的一次晚了 ([\d.]+) ms/,
      '`numbers` on how late the rounds are')
    same(avg!, mean(late) / 1000, 'the mean lateness of the twenty rounds')
    same(worst!, Math.max(...late) / 1000, 'and the worst of them')
    // 「二十个轮里只有两个正好卡在点上」 and the two it names: t = 0 and the one at 1.8 s
    const onTime = late.map((x, i) => [x, i] as const).filter(([x]) => x === 0)
    const [howMany] = raw(EVERYWHERE, /个轮里只有(.)个正好卡在点上/, '`numbers` on how many were on time')
    expect(zhNumeral(howMany!.replace(/两/g, '二')), 'the rounds that went out on the tick')
      .toBe(onTime.length)
    const [t0, firstUs] = figs(EVERYWHERE, /因为 t = (\d) 时谁都还没有退避（backoff）值.*?都在 (\d+) µs 开始发送/,
      '`numbers` on the first of them')
    expect(roundCts(rs)[0]!.t / US, 'the first round goes out at that instant').toBe(firstUs)
    expect(t0, 'which is the instant the run starts').toBe(firstUs)
    const camFirst = txs(rs).find((r) => r.node === CAM)!
    expect(camFirst.t / US, 'and the camera’s own first frame starts there too').toBe(firstUs)
    const [atS] = figs(EVERYWHERE, /还有 ([\d.]+) s 那个轮/, '`numbers` on the other one')
    expect(onTime.map(([, i]) => roundCts(rs)[i]!.t / (1000 * MS)),
      'the rounds that went out on the tick, in seconds').toContain(atS)
  })

  it('the CTS-to-self: its own bytes, its rate, its airtime and the NAV it sets', () => {
    const rs = recs()
    // 「14 个字节、6 Mb/s、占空口 50 µs」
    const [bytes, mbps6, us] = figs(nums, /(\d+) 个字节、(\d+) Mb\/s、占空口 (\d+) µs/,
      '`numbers` on the protection frame')
    expect(bytes, 'the octets a CTS is').toBe(CTS_BYTES)
    expect(us! * US, 'and what it costs on the air at that rate')
      .toBe(txTimeNs(CTS_BYTES, mbps6!) + EXT)
    expect(roundCts(rs)[0]!.frame.txTimeNs, 'which is the frame the run really sends')
      .toBe(us! * US)
    // 「50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs」, and the Duration that covers the rest
    const [cts, s1, trig, nSlots, s2, resp, s3, ack, round] = figs(nums,
      /(\d+) \+ (\d+) \+ (\d+) \+ (\d) × \((\d+) \+ (\d+) \+ (\d+) \+ (\d+)\) = (\d+) µs/,
      '`numbers` on how a round is spent')
    expect(cts, 'the CTS-to-self that opens it, again').toBe(us)
    for (const x of [s1, s2, s3]) expect(x! * US, 'an AMP SIFS').toBe(AMP_SIFS_NS)
    expect(trig! * US, 'the trigger').toBe(ampDlPpduNs(250, ampTriggerBytes(0), EXT))
    expect(nSlots, 'the slots it opens').toBe(NODE('ap').ampAp!.slots)
    expect(resp! * US, 'a response').toBe(ampUlPpduNs(250, ampRespBytes(true)))
    expect(ack! * US, 'and an Ack').toBe(ampDlPpduNs(250, AMP_ACK_BYTES, EXT))
    expect(cts! + s1! + trig! + nSlots! * (s2! + resp! + s3! + ack!), 'its own sum').toBe(round)
    const [cover] = figs(nums, /Duration 字段覆盖了它之后的 (\d+) µs/,
      '`numbers` on what the Duration covers')
    expect(cover, 'the round minus the protection frame itself').toBe(round! - cts!)
    expect(roundCts(rs)[0]!.frame.durationFieldNs, 'which is the Duration the frame really carries')
      .toBe(cover! * US)
    // 「摄像头解出了二十帧里的十七帧，并按 Duration 的要求把 NAV 设了 4140 µs」
    const [of, heard, navUs] = raw(nums,
      /摄像头解出了(.+?)帧里的(.+?)帧，并按 Duration 的要求把 NAV 设了 (\d+) µs/,
      '`numbers` on how many announcements the camera heard')
    expect(zhNumeral(of!.replace(/两/g, '二')), 'the rounds of the run').toBe(roundCts(rs).length)
    expect(zhNumeral(heard!.replace(/两/g, '二')), 'and the ones the camera decoded')
      .toBe(camNav(rs).length)
    expect(num(navUs!) * US, 'the NAV it set from them').toBe(cover! * US)
    for (const n of camNav(rs)) expect(n.untilNs - n.t, 'every one of them').toBe(cover! * US)
    // 「有意思的是漏掉的那三帧」 — and they are the rounds whose CTS started in the same nanosecond
    const [missed] = raw(nums, /漏掉的那(.)帧/, '`numbers` on the ones it missed')
    expect(zhNumeral(missed!.replace(/两/g, '二')), 'the announcements it never decoded')
      .toBe(roundCts(rs).length - camNav(rs).length)
    const clashes = roundCts(rs).filter((c) => txs(rs).some((r) => r.node === CAM && r.t === c.t))
    expect(clashes, 'each of which it was transmitting through')
      .toHaveLength(roundCts(rs).length - camNav(rs).length)
  })

  it('the nine frames that landed in a slot, and the two ways they ended', () => {
    const rs = recs()
    // 「整个运行里只有九帧摄像头的帧落进了上行时隙」
    const [nine] = raw(nums, /只有(.)帧摄像头的帧落进了上行时隙/,
      '`numbers` on the camera frames that landed in a slot')
    const landed = camInSlot(rs)
    expect(zhNumeral(nine!.replace(/两/g, '二')), 'the frames that did').toBe(landed.length)
    for (const r of landed) expect(r.frame.kind, 'every one of them an RTS').toBe('rts')
    // 「九次里有八次以 CTS 超时收场；第九次结束得更早」
    const [all, timeouts] = raw(nums, /(.)次里有(.)次以 CTS 超时收场；第(?:.)次结束得更早/,
      '`numbers` on how they ended')
    expect(zhNumeral(all!.replace(/两/g, '二')), 'all of them').toBe(landed.length)
    const outs = ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM)
    expect(zhNumeral(timeouts!.replace(/两/g, '二')), 'and the ones that timed out')
      .toBe(outs.length)
    expect(landed.length - outs.length, 'while the one that did not is the ninth').toBe(1)
  })

  it('the response tally, and the census of the eighty slots', () => {
    const rs = recs()
    // 「标签一共送出 40 帧回应，29 帧拿到了确认——72.5 %」
    const [sent, ok, pct] = raw(nums, /标签一共送出 (\d+) 帧回应，(\d+) 帧拿到了确认——([\d.]+) %/,
      '`numbers` on the tally')
    expect(num(sent!), 'the responses the tags sent').toBe(results(rs).length)
    expect(num(ok!), 'and the ones that were acknowledged').toBe(acked(rs))
    same(pct!, (100 * acked(rs)) / results(rs).length, 'and the share that is')
    // 「丢掉的十一帧里，八帧是两个标签抽到了同一个时隙，二十轮里发生了四次；另外三帧输给了摄像头」
    const [lostN, pairN, roundsN, timesN, camN] = raw(nums,
      /丢掉的(.+?)帧里，(.)帧是两个标签抽到了同一个时隙，(.+?)轮里发生了(.)次；另外(.)帧输给了摄像头/,
      '`numbers` on where the lost ones went')
    const zh = (s: string): number => zhNumeral(s.replace(/两/g, '二'))!
    expect(zh(lostN!), 'the responses that were not acknowledged')
      .toBe(results(rs).length - acked(rs))
    const doubled = slots(rs).filter(
      (s) => txs(rs).filter((r) => TAGS.includes(r.node) && r.t >= s.t && r.t < s.untilNs).length > 1)
    expect(zh(timesN!), 'the slots two tags both drew').toBe(doubled.length)
    expect(zh(pairN!), 'and the responses lost in them').toBe(doubled.length * 2)
    expect(zh(roundsN!), 'out of that many rounds').toBe(roundCts(rs).length)
    expect(zh(camN!), 'while the rest went to the camera')
      .toBe(results(rs).length - acked(rs) - doubled.length * 2)
    // 「80 个时隙里 44 个安静无声，32 个装着一帧回应，4 个装着两帧」
    const [total, quiet, one, two] = figs(nums,
      /(\d+) 个时隙里 (\d+) 个安静无声，(\d+) 个装着一帧回应，(\d) 个装着两帧/,
      '`numbers` on the census of the slots')
    const per = slots(rs).map(
      (s) => txs(rs).filter((r) => TAGS.includes(r.node) && r.t >= s.t && r.t < s.untilNs).length)
    expect(total, 'the slots the run opened').toBe(per.length)
    expect(total, 'which is the slots of every round').toBe(roundCts(rs).length * NODE('ap').ampAp!.slots!)
    expect([quiet, one, two], 'empty, one response, two responses')
      .toEqual([0, 1, 2].map((n) => per.filter((x) => x === n).length))
    expect(quiet! + one! + two!, 'and those three account for all of them').toBe(total)
  })

  it('the five-times-as-often paragraph, and the band that never notices', () => {
    const fast = recs(POLL20)
    const wifiOnly = recs(WIFI_ONLY)
    /*
     * 「轮询间隔改成 20 ms，同样 4190 µs 的轮就要预留信道的 20.95 %，其中 3044 µs 的 PPDU 变成
     * 每秒 152 200 µs，占 15.22 %」 — the 152 200 was the one figure of this lesson with no equal
     * literal anywhere under `tests/`, in any form the scanner could see.
     */
    const [ms, roundUs, reserved, perRound, perSec, share] = raw(EVERYWHERE,
      /轮询间隔改成 (\d+) ms，同样 (\d+) µs 的轮就要预留信道的 ([\d.]+) %，其中 (\d+) µs 的 PPDU 变成每秒 ([\d\s]+) µs，占 ([\d.]+) %/,
      '`numbers` on what five times the polling costs')
    const interval = ampCoexist.variants![POLL20]!.scenario().nodes[0]!.ampAp!.pollIntervalMs
    expect(num(ms!), 'the interval that variant ships').toBe(interval)
    /*
     * **The round, against the engine — not only against the share it is divided into.** Reading
     * 4190 only through 「预留信道的 20.95 %」 cannot see an edit to it: 4191 µs over 20 ms is
     * 20.955 %, and `(20.955).toFixed(2)` is `'20.95'` in JavaScript, so the planted figure
     * rounds back onto the printed one. A share is a lossy way to read a duration.
     */
    const roundNs = txTimeNs(CTS_BYTES, 6) + EXT + AMP_SIFS_NS
      + ampDlPpduNs(250, ampTriggerBytes(0), EXT)
      + NODE('ap').ampAp!.slots! * (AMP_SIFS_NS + ampUlPpduNs(250, ampRespBytes(true))
        + AMP_SIFS_NS + ampDlPpduNs(250, AMP_ACK_BYTES, EXT))
    expect(num(roundUs!) * US, 'the round this engine lays out, however often it is polled')
      .toBe(roundNs)
    same(reserved!, (100 * num(roundUs!) * US) / (interval * MS), 'the share the round reserves')
    // the PPDU microseconds of one round, and of a second of them
    const rounds = roundCts(fast).length
    same(perRound!, ampAirNs(fast) / rounds / US, 'the PPDU a single round spends')
    same(perSec!, ampAirNs(fast) / (RUN_NS / (1000 * MS)) / US, 'and what a second of them spends')
    same(share!, (100 * ampAirNs(fast)) / RUN_NS, 'which is that share of the air')
    // 「摄像头跌到 77.41 Mb/s——比只有 Wi-Fi 时的 105.29 Mb/s 低 26.49 %」
    const [fell, alone, down] = raw(EVERYWHERE,
      /摄像头跌到 ([\d.]+) Mb\/s——比只有 Wi-Fi 时的 ([\d.]+) Mb\/s 低 ([\d.]+) %/,
      '`numbers` on what it costs the camera')
    same(fell!, camMbps(fast), 'the camera’s goodput at five times the polling')
    same(alone!, camMbps(wifiOnly), 'and with no tags at all')
    same(down!, 100 * (1 - camMbps(fast) / camMbps(wifiOnly)), 'and the drop between them')
    // 「200 帧回应里确认了 139 帧，69.5 %」
    const [sent, ok, pct] = raw(EVERYWHERE, /(\d+) 帧回应里确认了 (\d+) 帧，([\d.]+) %/,
      '`numbers` on the tally at five times the polling')
    expect(num(sent!), 'the responses that run sends').toBe(results(fast).length)
    expect(num(ok!), 'and the ones acknowledged').toBe(acked(fast))
    same(pct!, (100 * acked(fast)) / results(fast).length, 'and the share that is')
    // 「四种跑法下它送达的视频帧都是 2365 帧，13.24 Mb/s，一帧不差」
    const [frames, mbps5] = raw(EVERYWHERE, /四种跑法下它送达的视频帧都是 (\d+) 帧，([\d.]+) Mb\/s/,
      '`numbers` on the phone’s own band')
    for (const v of [undefined, NONE, POLL20, WIFI_ONLY]) {
      expect(phoneFrames(recs(v)), 'the frames the phone takes delivery of, in every run')
        .toBe(num(frames!))
      same(mbps5!, phoneGoodput(recs(v)), 'and its goodput, in every run')
    }
  })

  /*
   * **The figures this lesson prints a second and third time.** 4140 µs is in `numbers` twice and
   * in the steps; the two AIFS values are in the formula's note AND in a quiz explanation; 2365
   * is in a paragraph and in the quiz; the camera's two goodputs are in `tryThis` and in the
   * paragraph that explains them. 「Read somewhere else」 is not read.
   */
  it('every figure this lesson prints more than once, at every one of those places', () => {
    const rs = recs()
    const none = recs(NONE)
    const cover = roundCts(rs)[0]!.frame.durationFieldNs
    // 「4140 µs」: the Duration, wherever it appears
    for (const v of everyFig(/(\d+) µs，正好是后面那个轮|NAV 设了 (\d+) µs|等满 (\d+) µs|覆盖了它之后的 (\d+) µs/g,
      'the Duration the protection frame carries', 3)) {
      expect(num(v) * US, 'what the round reserves after the frame itself').toBe(cover)
    }
    // the two AIFS values and their terms, wherever they appear — the note and the quiz
    const aifsOf = (name: string): number =>
      aifsNs(EDCA_PARAMS.find((p) => p.name === name)!.aifsn, ERP_2G)
    const sums = [...EVERYWHERE.matchAll(/AC_BK 要等 (\d+) \+ (\d+) × (\d+) = (\d+) µs，AC_BE 只等 (\d+) µs/g)]
      .map((m) => m.slice(1).map(num))
    expect(sums.length, 'the lesson works that sum out more than once').toBeGreaterThan(0)
    for (const [sifs, n, slot, bk, be] of sums) {
      expect(sifs! * US, 'the SIFS term').toBe(ERP_2G.sifsNs)
      expect(slot! * US, 'the slot term').toBe(ERP_2G.slotNs)
      expect(n, 'the AIFSN of AC_BK').toBe(EDCA_PARAMS.find((p) => p.name === 'BK')!.aifsn)
      expect(sifs! + n! * slot!, 'its own product').toBe(bk)
      expect(bk! * US, 'the AIFS of the round').toBe(aifsOf('BK'))
      expect(be! * US, 'and of the camera').toBe(aifsOf('BE'))
    }
    // 「2.4 GHz 下时隙是 9 µs，短帧间间隔是 10 µs」 — the prose restating both constants
    const [slotUs, sifsUs] = figs(EVERYWHERE, /下时隙是 (\d+) µs，短帧间间隔（short interframe space, SIFS）是 (\d+) µs/,
      'the prose on the two constants of this band')
    expect(slotUs! * US, 'the slot').toBe(ERP_2G.slotNs)
    expect(sifsUs! * US, 'and the SIFS').toBe(ERP_2G.sifsNs)
    // 「CTS-to-self 用 6 Mb/s 发送」 — the rate, wherever it is named
    for (const v of everyFig(/用 (\d+) Mb\/s 发送|、(\d+) Mb\/s、占空口/g,
      'the rate the protection frame goes out at', 2)) {
      expect(roundCts(rs)[0]!.frame.txTimeNs, 'the frame that rate builds')
        .toBe(txTimeNs(CTS_BYTES, num(v)) + EXT)
    }
    // 「250 kb/s」 — the uplink rate, in `picture` and in a quiz distractor
    for (const v of everyFig(/(\d+) kb\/s/g, 'the uplink rate', 2)) {
      expect(num(v), 'the rate the tags answer at').toBe(NODE('ap').ampAp!.ulKbps)
    }
    // 「从八次无人应答变成 78 次，自己的吞吐反而跌到 94.08 Mb/s——比被 NAV 挡住时的 99.89 Mb/s 还低」
    const [to78, fell, held] = raw(EVERYWHERE,
      /从八次无人应答变成 (\d+) 次，自己的吞吐反而跌到 ([\d.]+) Mb\/s——比被 NAV 挡住时的 ([\d.]+) Mb\/s 还低/,
      '`numbers` on why protecting the round made the camera faster')
    expect(num(to78!), 'the unanswered RTS of the unprotected run')
      .toBe(ofType(none, 'CTS_TIMEOUT').filter((r) => r.node === CAM).length)
    same(fell!, camMbps(none), 'the camera’s goodput there')
    same(held!, camMbps(rs), 'and with the round protected')
    expect(camMbps(none), 'which really is the lower of the two').toBeLessThan(camMbps(rs))
    // 「本课测到的 3 次 collision」 — `limits`, about the base run
    const [cols] = figs((ampCoexist.limits ?? []).map((l) => l.text).join('\n'),
      /本课测到的 (\d+) 次 collision/, '`limits` on the collisions it measured')
    expect(cols, 'the collisions the AP records in the shipped run')
      .toBe(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length)
    // 「每 20 ms 轮询一次」 — the variant's own label
    const [labelMs] = figs(ampCoexist.variants![POLL20]!.label, /每 (\d+) ms 轮询一次/,
      'the variant label')
    expect(labelMs, 'the interval that variant really ships')
      .toBe(ampCoexist.variants![POLL20]!.scenario().nodes[0]!.ampAp!.pollIntervalMs)
    // 「把轮询从 100 ms 改成 20 ms，摄像头损失了 26.49 % 的吞吐」 — the quiz, on both intervals
    const [was, now, lost] = raw(quizText,
      /把轮询从 (\d+) ms 改成 (\d+) ms，摄像头损失了 ([\d.]+) % 的吞吐/,
      'the quiz on what five times the polling costs')
    expect(num(was!), 'the interval the scene ships').toBe(POLL_MS)
    expect(num(now!), 'and the one the variant ships')
      .toBe(ampCoexist.variants![POLL20]!.scenario().nodes[0]!.ampAp!.pollIntervalMs)
    same(lost!, 100 * (1 - camMbps(recs(POLL20)) / camMbps(recs(WIFI_ONLY))),
      'and the throughput it costs the camera')
    // every 「N ms 轮询」 names one of the two intervals this lesson runs
    const intervals = [POLL_MS, ampCoexist.variants![POLL20]!.scenario()
      .nodes[0]!.ampAp!.pollIntervalMs]
    for (const v of everyFig(/(\d+) ms 轮询/g, 'a poll interval the prose names', 3)) {
      expect(intervals, `${v} ms is an interval this lesson runs`).toContain(num(v))
    }
    // 「5.17 ms」 — the question states it, and so does a distractor
    for (const v of everyFig(/就要 ([\d.]+) ms|晚 ([\d.]+) ms 才发出去/g,
      'the mean lateness, wherever it appears', 2)) {
      same(v, mean(lateUs(rs, POLL_MS)) / 1000, 'the mean the run really has')
    }
    // 「26.49 %」 — the question states it, and a distractor claims the phone loses the same
    for (const v of everyFig(/损失了 ([\d.]+) %|同样是 ([\d.]+) %/g,
      'the camera’s loss, wherever it appears', 2)) {
      same(v, 100 * (1 - camMbps(recs(POLL20)) / camMbps(recs(WIFI_ONLY))),
        'what five times the polling costs the camera')
    }
    // and the claim the distractor gets wrong: the phone loses nothing at all
    expect(phoneGoodput(recs(POLL20)), 'while the phone loses none of its own')
      .toBe(phoneGoodput(recs(WIFI_ONLY)))
    // 「四种跑法下它都送达同样的 2365 帧」 — the quiz says it too
    for (const v of everyFig(/都是 (\d+) 帧，|同样的 (\d+) 帧/g, 'the phone’s own frames', 2)) {
      for (const variant of [undefined, NONE, POLL20, WIFI_ONLY]) {
        expect(phoneFrames(recs(variant)), 'the frames the phone takes, in every run')
          .toBe(num(v))
      }
    }
  })

  it('`observe`: every instant, in the run the sentence names', () => {
    const rs = recs()
    const none = recs(NONE)
    // 「跳到 0 µs 的第一帧 CTS-to-self：摄像头的 RTS 在同一瞬间开始」
    const [ctsUs] = figs(obs, /跳到 (\d+) µs 的第一帧 CTS-to-self/, '`observe` on the first round')
    expect(roundCts(rs)[0]!.t / US, 'when the first CTS-to-self goes out').toBe(ctsUs)
    // 「再跳到摄像头第一次设 NAV 的时刻，111.914 ms——那是第二个轮的——看它完整等满 4140 µs」
    const [navMs, navUs] = raw(obs, /第一次设 NAV 的时刻，([\d.]+) ms——那是第二个轮的——看它完整等满 (\d+) µs/,
      '`observe` on the first NAV')
    const first = camNav(rs)[0]!
    same(navMs!, first.t / MS, 'when the camera first sets a NAV')
    expect(num(navUs!) * US, 'and how long it holds it').toBe(first.untilNs - first.t)
    expect(roundCts(rs).findIndex((c) => c.t < first.t && first.t - c.t < 1 * MS),
      'which belongs to the second round').toBe(1)
    // 「跳到第一帧路由器没有回应的摄像头 RTS，时间是 73 µs：它在 0 µs 开始」
    const [outUs, startUs] = figs(obs, /时间是 (\d+) µs：它在 (\d+) µs 开始/,
      '`observe` on the unanswered RTS of the unprotected run')
    const firstOut = ofType(none, 'CTS_TIMEOUT').filter((r) => r.node === CAM)[0]!
    expect(firstOut.t / US, 'when that timeout is recorded').toBe(outUs)
    expect(txs(none).find((r) => r.node === CAM)!.t / US, 'and when the RTS it waited on started')
      .toBe(startUs)
    // 「再走到下一次超时，890 µs——它的 RTS 从 817 µs 开始，正落在时隙 1 里……于是路由器在
    //  1156 µs 记下一条原因为 collision 的 RX_FAIL」
    const [outUs2, rtsUs, slotNo, failUs] = figs(obs,
      /再走到下一次超时，(\d+) µs——它的 RTS 从 (\d+) µs 开始，正落在时隙 (\d) 里.*?于是路由器在 (\d+) µs 记下一条原因为 collision 的 RX_FAIL/,
      '`observe` on the second timeout')
    const outs = ofType(none, 'CTS_TIMEOUT').filter((r) => r.node === CAM)
    expect(outs[1]!.t / US, 'the next timeout').toBe(outUs2)
    const rts = txs(none).filter((r) => r.node === CAM && r.t < outs[1]!.t).pop()!
    expect(rts.t / US, 'the RTS it waited on').toBe(rtsUs)
    const inSlot = slots(none).find((s) => rts.t >= s.t && rts.t < s.untilNs)!
    expect(inSlot.slot, 'the slot it landed in').toBe(slotNo)
    const fail = ofType(none, 'RX_FAIL').find((r) => r.node === AP && r.reason === 'collision')!
    expect(fail.t / US, 'and when the AP recorded the collision').toBe(failUs)
    // 「它那条泳道每次都一模一样——2365 帧，第一帧在 883.111 µs」
    const [frames, firstPhone] = raw(obs, /一模一样——(\d+) 帧，第一帧在 ([\d.]+) µs/,
      '`observe` on the phone’s own lane')
    const phoneTx = (x: TLRecord[]): TLRecord[] =>
      txs(x).filter((r) => r.node === 'ap' && r.frame.kind === 'data')
    expect(num(frames!), 'the frames the phone’s lane carries').toBe(phoneTx(rs).length)
    same(firstPhone!, phoneTx(rs)[0]!.t / US, 'and when its first one goes out')
    for (const v of [NONE, POLL20, WIFI_ONLY]) {
      expect(phoneTx(recs(v)).length, 'the same in every one of the four runs')
        .toBe(num(frames!))
    }
  })

  it('`tryThis`: both experiments, and the quiz’s own two figures', () => {
    const rs = recs()
    const none = recs(NONE)
    // 「确认率从 72.5 % 掉到 17.5 %，落进时隙的摄像头帧从 9 帧涨到 79 帧……无人应答的 RTS 从
    //  8 次变成 78 次，吞吐从 99.89 Mb/s 掉到 94.08 Mb/s」
    const [was, now, inWas, inNow, rtsWas, rtsNow, mbWas, mbNow] = raw(trys,
      /确认率从 ([\d.]+) % 掉到 ([\d.]+) %，落进时隙的摄像头帧从 (\d+) 帧涨到 (\d+) 帧[^]*?无人应答的 RTS 从 (\d+) 次变成 (\d+) 次，吞吐从 ([\d.]+) Mb\/s 掉到 ([\d.]+) Mb\/s/,
      '`tryThis` on the unprotected run')
    const rate = (x: TLRecord[]): number => (100 * acked(x)) / results(x).length
    same(was!, rate(rs), 'the acknowledged share with protection')
    same(now!, rate(none), 'and without it')
    expect(num(inWas!), 'the camera frames inside a slot, with protection').toBe(camInSlot(rs).length)
    expect(num(inNow!), 'and without it').toBe(camInSlot(none).length)
    const timeouts = (x: TLRecord[]): number =>
      ofType(x, 'CTS_TIMEOUT').filter((r) => r.node === CAM).length
    expect(num(rtsWas!), 'the unanswered RTS count, with protection').toBe(timeouts(rs))
    expect(num(rtsNow!), 'and without it').toBe(timeouts(none))
    same(mbWas!, camMbps(rs), 'the camera’s own goodput, with protection')
    same(mbNow!, camMbps(none), 'and without it')
    /*
     * 「把摄像头拖到 (4, 5.6)，离植物标签只有 40 cm，再载入「不加保护」变体」 — the reader's own
     * edit, so the scene is built the way the reader would build it and run.
     */
    const [x, y, cm] = figs(trys, /把摄像头拖到 \(([\d.]+), ([\d.]+)\)，离植物标签只有 (\d+) cm/,
      '`tryThis` on where to drag the camera')
    const plant = NODE('tag-2')
    expect(Math.round(Math.hypot(x! - plant.pos.x, y! - plant.pos.y) * 100),
      'which is that far from the plant tag').toBe(cm)
    const moved: Scenario = (() => {
      const s = ampCoexistScenario({ protection: 'none' })
      return { ...s, nodes: s.nodes.map((n) => (n.id === 'cam' ? { ...n, pos: { ...n.pos, x: x!, y: y! } } : n)) }
    })()
    const movedRs = run(moved, 'moved-cam')
    const [edDbm] = figs(trys, /而且远高于 (−\d+) dBm/, '`tryThis` on what it can now hear')
    expect(edDbm, 'the threshold it is now above').toBe(CCA_ED_DBM)
    expect(rssiOn('2g', buildLinkTable(moved.nodes, moved.walls), 'tag-2', 'cam'),
      'and it really is above it there').toBeGreaterThan(CCA_ED_DBM)
    // 「路由器记下的碰撞从 25 次变成一次也没有，被确认的读数从 7 个涨到 26 个」
    const [colWas, ackWas, ackNow] = figs(trys,
      /路由器记下的碰撞从 (\d+) 次变成一次也没有，被确认的读数从 (\d+) 个涨到 (\d+) 个/,
      '`tryThis` on what moving it buys')
    const collisions = (x: TLRecord[]): number =>
      ofType(x, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length
    expect(colWas, 'the collisions the unprotected run records').toBe(collisions(none))
    expect(collisions(movedRs), 'and none once the camera can hear the tags').toBe(0)
    expect(ackWas, 'the readings the unprotected run gets through').toBe(acked(none))
    expect(ackNow, 'and the readings the moved one gets').toBe(acked(movedRs))
    // 「代价是有七个轮里，某个标签因为身旁的摄像头正在发送而解不出触发帧」
    const [silent] = raw(trys, /代价是有(.)个轮里/, '`tryThis` on the cost of moving it')
    /*
     * 「某个标签……解不出触发帧，整轮都没有作答」: a round where one of the two tags produced no
     * result at all — which is what carrier sense costs the tag standing next to the camera.
     */
    const rounds = ofType(movedRs, 'AMP_ROUND')
    // 「解不出触发帧」 leaves no draw at all: a tag that decoded one records an `AMP_BS_COUNTER`-
    // like draw of its own (`AMP_ABOC`), so a round with fewer draws than tags is a round a tag
    // never heard the trigger in
    const shortRounds = rounds.filter((r) => {
      const drew = new Set(ofType(movedRs, 'AMP_ABOC')
        .filter((x) => x.t >= r.t && x.t < r.untilNs).map((x) => x.node))
      return drew.size < TAGS.length
    }).length
    expect(zhNumeral(silent!.replace(/两/g, '二')), 'the rounds a tag sat out of')
      .toBe(shortRounds)
    // the quiz: 「平均要比轮询时钟「到点」晚 5.17 ms」 and 「AIFS 是 73 µs，而摄像头是 37 µs」
    const [qLate] = raw(quizText, /晚 ([\d.]+) ms 才发出去/, 'the quiz on the lateness')
    same(qLate!, mean(lateUs(rs, POLL_MS)) / 1000, 'the same mean the paragraph states')
    const [qBk, qBe] = figs(quizText, /AIFS 是 (\d+) µs，而摄像头是 (\d+) µs/,
      'the quiz on the two AIFS values')
    const aifsOf = (name: string): number =>
      aifsNs(EDCA_PARAMS.find((p) => p.name === name)!.aifsn, ERP_2G)
    expect(qBk! * US, 'the round’s own AIFS').toBe(aifsOf('BK'))
    expect(qBe! * US, 'and the camera’s').toBe(aifsOf('BE'))
  })
})
