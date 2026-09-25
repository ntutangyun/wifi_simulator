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
import { rssiOn } from './rssi'
import { decodeFrame } from '../../src/model/frameFields'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const US = 1_000
/** 20 rounds at one round every 100 ms. Everything below is measured over these two seconds. */
const ROUNDS = 20
const RUN_NS = 2000 * MS

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
    // "the price is seven rounds in which a tag, deafened by the camera beside it, never answers at all"
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
