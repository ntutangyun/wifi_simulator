/**
 * `link-2g` — every figure the lesson prints, measured here.
 *
 * The split between the two kinds of assertion in this file is the lesson's own
 * subject, so it is worth stating once. A duration, an interval, an MCS rung, a
 * negotiated width and the KIND of a record are deterministic: this engine
 * produces one value and the test pins it exactly. A throughput is not, and not
 * because of noise — flipping `linkId` flips the MAC's random stream. The
 * station's backoff generator is forked on `hashStr(virtualId(id, link))`
 * (`simulation.ts`), and `virtualId` keeps the bare id only on 5 GHz
 * (`caps.ts`), so `sta-1` and `sta-1#2g` draw different sequences from the same
 * seed. A single-seed A/B over this lesson's subject therefore measures the
 * draw, not the band: the design document behind this slice reports being
 * fooled by exactly that once, measuring 「2.4 GHz is 0.37 Mb/s slower」 on one
 * seed, a difference that vanished over thirty. Every throughput claim below is
 * a mean over ten to thirty seeds, and the one that carries the lesson's
 * argument is pinned as a RATIO LOWER BOUND rather than as a mean, because the
 * mean moves with the seed set while the ratio is the claim.
 */
import { describe, it, expect } from 'vitest'
import { link2g } from '../../src/course/tier3/link-2g'
import { MODULES, TIERS, lessonMinutes, trackOf } from '../../src/course/curriculum'
import { LESSONS, lessonIndex } from '../../src/course/lessons'
import { link2gScenario, longApartment, sc } from '../../src/course/wifiScenes'
import { brick, node } from '../../src/course/lessonKit'
import { Simulation, LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import {
  ACK_BYTES, CCA_ED_DBM, CCA_PD_DBM, CW_MIN, EDCA_PARAMS, ERP_2G, OFDM_5G, PHY_MODES, mcsForRssi,
  mcsRateMbps, noiseDbm,
} from '../../src/engine/phy'
import { lessonTexts } from '../../src/course/readability'
import { negotiatedWidth, widthOf, virtualId } from '../../src/model/caps'
import { ScenarioSchema, type NodeCfg, type Wall } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType } from './kit'

const MS = 1_000_000
type Band = '2g' | '5g'
type Shape = 'pair' | 'single' | 'burst' | 'wide'

/** The lesson's own run: 200 ms is what every throughput figure it prints was measured over. */
const RUN_MS = 200

const vid = (band: Band, id: string): string => virtualId(id, band)

function recordsOf(shape: Shape, band: Band, seed: number, ms = RUN_MS): TLRecord[] {
  return [...new Simulation(link2gScenario(shape, band, { seed })).runUntil(ms * MS).records]
}

/** Megabits of MSDU payload the access point took delivery of, per second. */
function throughputMbps(shape: Shape, band: Band, seed: number, ms = RUN_MS): number {
  const ap = vid(band, 'ap')
  const bits = ofType(recordsOf(shape, band, seed, ms), 'RX_OK')
    .filter((r) => r.node === ap && r.frame.kind === 'data')
    // the MSDU inside, not the PSDU: 24 octets of MAC header and 4 of FCS are not payload
    .reduce((n, r) => n + (r.frame.bytes - 28) * 8, 0)
  return bits / (ms / 1000) / 1e6
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const seeds = (n: number): number[] => Array.from({ length: n }, (_x, i) => i + 1)

lessonShapeSuite(link2g)

describe('link-2g · where it sits in the course', () => {
  it('opens tier 3 as its only module, and reads as a Wi-Fi lesson', () => {
    expect(link2g.module).toBe(12)
    expect(MODULES[link2g.module].title).toBe('2.4 GHz 这条链路')
    expect(MODULES[link2g.module].tier).toBe(2)
    // The tier it opens: a Wi-Fi tier, checked against the published revision, and the first
    // tier whose modules a reader could not see at all before this lesson existed — CoursePanel
    // filters out a tier with no module carrying a lesson.
    expect(trackOf(link2g)).toBe('wifi')
    expect(MODULES.filter((m) => m.tier === 2)).toHaveLength(1)
    expect(MODULES[link2g.module].basis).toBeUndefined()
  })

  it('every prerequisite it names is a lesson the reader has already passed', () => {
    // `needs` is only true if it is also EARLIER: a forward reference reads as a prerequisite
    // and is not one. Named here as well as in the shared rule because this lesson is the first
    // of a tier, which is the position where 「earlier」 is easiest to get wrong.
    expect(link2g.needs).toEqual(['ifs', 'cca', 'hidden', 'width'])
    const mine = lessonIndex('link-2g')
    expect(mine).toBeGreaterThan(0)
    for (const id of link2g.needs!) {
      const at = lessonIndex(id)
      expect(at, `@${id} must exist`).toBeGreaterThanOrEqual(0)
      expect(at, `@${id} must come before @link-2g`).toBeLessThan(mine)
    }
    // It was the last lesson of the Wi-Fi track until slice W12b put `@uhr-rate-ladder` under
    // tier 4 behind it. What the claim was FOR survives the change and is what is asserted now:
    // the Wi-Fi run is unbroken and ends immediately before the UWB track, so 「next」 leaves
    // Wi-Fi once and never re-enters it.
    //
    // **W12b's rewrite named the lesson that happened to be last (`@uhr-rate-ladder`) and that
    // half went red on the very next slice**, when W13 appended `@claim-to-contribution` under the
    // same module — a true sentence about an incidental fact, which is the shape this file keeps
    // finding. So the position claims are now about THIS lesson, whose position is the thing the
    // `it` is named for, plus the unbrokenness of the run; which lesson is last is not asserted,
    // because appending a Wi-Fi lesson is not a defect and must not read like one.
    const wifi = LESSONS.filter((l) => trackOf(l) === 'wifi')
    expect(wifi.map((l) => l.id)).toContain('link-2g')
    // Measured over the TIERS rather than over `trackOf`, because the five AMP lessons teach
    // their own radio from inside the Wi-Fi tiers and so legitimately interrupt a `trackOf` run.
    const onWifiTier = LESSONS.map((l) => TIERS[MODULES[l.module].tier].track === 'wifi')
    expect(onWifiTier.lastIndexOf(true) - onWifiTier.indexOf(true) + 1,
      'the Wi-Fi tiers hold one unbroken run of lessons in COURSE_ORDER')
      .toBe(onWifiTier.filter(Boolean).length)
    // and the run really does end before the UWB track rather than at the end of the course
    expect(TIERS[MODULES[LESSONS[onWifiTier.lastIndexOf(true) + 1].module].tier].track).toBe('uwb')
    // This lesson is still the last of tier 2, which is the claim about its own position.
    const tier2 = LESSONS.filter((l) => MODULES[l.module].tier === 2)
    expect(tier2.map((l) => l.id)).toEqual(['link-2g'])
  })

  it('states 25 minutes', () => {
    expect(lessonMinutes(link2g)).toBe(25)
  })

  it('every scene it builds is a scenario the schema accepts', () => {
    const all = [link2g.scenario(), ...link2g.variants!.map((v) => v.scenario())]
    expect(all).toHaveLength(8)
    for (const s of all) expect(() => ScenarioSchema.parse(s)).not.toThrow()
  })

  it('pins the access point to the band as well as the stations', () => {
    // The trap `wifiScenes.ts` warns about: `linkPlanFor` gives the access point every link one
    // of its stations uses, so a scene that moved only the stations would build a TWO-link cell
    // and the comparison would stop being one. Asserted on the data rather than trusted.
    for (const shape of ['pair', 'single', 'burst', 'wide'] as const) {
      const two = link2gScenario(shape, '2g')
      expect(two.nodes.every((n) => n.linkId === '2g'), shape).toBe(true)
      const five = link2gScenario(shape, '5g')
      expect(five.nodes.every((n) => n.linkId === undefined), shape).toBe(true)
    }
  })
})

describe('link-2g · the four interframe figures, and why their net sum is zero', () => {
  /** The one exchange, segment by segment, as the timeline reports it. */
  function exchange(shape: 'single' | 'burst', band: Band): {
    difs: number; data: number; sifs: number; resp: number; total: number; bytes: number
  } {
    const rs = recordsOf(shape, band, 7, 50)
    const sta = vid(band, 'sta-1')
    const ap = vid(band, 'ap')
    const ifs = ofType(rs, 'IFS_START').filter((r) => r.node === sta && r.kind === 'DIFS')
    // A MAC reports a zero-length IFS when the medium has long been idle; the real wait is the
    // one it takes off a busy medium, and it is the only other value this run produces.
    const difsLens = [...new Set(ifs.map((r) => r.untilNs - r.t))].sort((a, b) => a - b)
    expect(difsLens, `${shape}/${band}: DIFS is one value plus the degenerate zero`).toHaveLength(2)
    expect(difsLens[0]).toBe(0)
    const dataTx = ofType(rs, 'TX_START').filter((r) => r.node === sta && r.frame.kind === 'data')
    const dataLens = [...new Set(dataTx.map((r) => r.frame.txTimeNs))]
    expect(dataLens, `${shape}/${band}: every data PPDU is the same length`).toHaveLength(1)
    const respTx = ofType(rs, 'TX_START')
      .filter((r) => r.node === ap && (r.frame.kind === 'ack' || r.frame.kind === 'ba'))
    const respLens = [...new Set(respTx.map((r) => r.frame.txTimeNs))]
    expect(respLens, `${shape}/${band}: every response PPDU is the same length`).toHaveLength(1)
    const gaps = new Set<number>()
    for (const end of ofType(rs, 'TX_END').filter((r) => r.node === sta && r.frame.kind === 'data')) {
      const resp = respTx.find((r) => r.t >= end.t)
      if (resp) gaps.add(resp.t - end.t)
    }
    expect([...gaps], `${shape}/${band}: the SIFS is one value`).toHaveLength(1)
    const difs = difsLens[1]
    const data = dataLens[0]
    const sifs = [...gaps][0]
    const resp = respLens[0]
    return { difs, data, sifs, resp, total: difs + data + sifs + resp, bytes: dataTx[0].frame.bytes }
  }

  it('one frame and one acknowledgement: 217.2 µs on both links, and the lesson prints the four segments', () => {
    const a = exchange('single', '5g')
    const b = exchange('single', '2g')
    expect(a).toMatchObject({ difs: 34_000, data: 139_200, sifs: 16_000, resp: 28_000, bytes: 1528 })
    expect(b).toMatchObject({ difs: 28_000, data: 145_200, sifs: 10_000, resp: 34_000, bytes: 1528 })
    // the claim, as an equality, because the zero IS this lesson's argument
    expect(a.total).toBe(217_200)
    expect(b.total).toBe(217_200)
    expect(b.total - a.total).toBe(0)
    // and the zero decomposed, so a reader of the red sees which segment moved
    expect(b.difs - a.difs).toBe(-6_000)
    expect(b.sifs - a.sifs).toBe(-6_000)
    expect(b.data - a.data).toBe(+6_000)
    expect(b.resp - a.resp).toBe(+6_000)
  })

  it('a twenty-MSDU A-MPDU and one BlockAck: 1 853.2 µs on both links, so the zero is not a coincidence of frame count', () => {
    // The cell the design document predicted would come out POSITIVE, on the reasoning that an
    // aggregate pays one DIFS and one SIFS while 「a pile of frames each pay 6 µs」. Measured, it
    // is zero again, and the prediction's premise is what was wrong: the signal extension is
    // charged to the PPDU (§10.3.8 attaches it to a PPDU format), and twenty MSDUs in one
    // A-MPDU are one PPDU. So it is paid once, exactly as in the single-frame cell.
    const a = exchange('burst', '5g')
    const b = exchange('burst', '2g')
    expect(a).toMatchObject({ difs: 34_000, data: 1_771_200, sifs: 16_000, resp: 32_000, bytes: 30_718 })
    expect(b).toMatchObject({ difs: 28_000, data: 1_777_200, sifs: 10_000, resp: 38_000, bytes: 30_718 })
    expect(a.total).toBe(1_853_200)
    expect(b.total).toBe(1_853_200)
    expect(b.total - a.total).toBe(0)
    // the aggregate really is one PPDU carrying twenty MSDUs, which is the whole argument
    expect(a.bytes).toBe(30_718)
    const rs = recordsOf('burst', '2g', 7, 50)
    expect(ofType(rs, 'TX_START').some((r) => r.frame.kind === 'ba')).toBe(true)
  })

  it('the two exchange shapes have the same support set floor, measured rather than derived', () => {
    // The cycle a reader can see on the timeline: data PPDU start to the next one. The MINIMUM
    // is the zero-backoff exchange, and it is equal across the bands in both shapes. The rest of
    // the histogram is backoff, which is where §5.1's warning lives: the two bands draw
    // different sequences, so the SUPPORT above the floor is not comparable and is not asserted.
    const floor = (shape: 'single' | 'burst', band: Band): number => {
      const sta = vid(band, 'sta-1')
      const starts = ofType(recordsOf(shape, band, 7, 50), 'TX_START')
        .filter((r) => r.node === sta && r.frame.kind === 'data').map((r) => r.t)
      const gaps: number[] = []
      for (let i = 1; i < starts.length; i += 1) gaps.push(starts[i] - starts[i - 1])
      expect(gaps.length, `${shape}/${band}`).toBeGreaterThan(5)
      return Math.min(...gaps)
    }
    expect(floor('single', '5g')).toBe(217_200)
    expect(floor('single', '2g')).toBe(217_200)
    expect(floor('burst', '5g')).toBe(1_941_200)
    expect(floor('burst', '2g')).toBe(1_941_200)
  })

  it('the one exchange whose net sum is NOT zero is the failed one, and 2.4 GHz is 6 µs faster', () => {
    // Where the identity breaks, and the lesson says so: a frame nobody acknowledges ends in an
    // AckTimeout instead of a response PPDU, so the band pays one fewer signal extension while
    // still collecting one shorter DIFS and one shorter timeout. 39 µs against 45 µs.
    // Built here rather than shipped as a variant: the scene is a station out of range, which
    // is `@rate-fallback`'s subject and not this lesson's.
    const far = (band: Band) => {
      // the long flat's far living room, past one brick wall: −89.3 dBm, where the data frame
      // does not reach the router at all and every attempt ends in a timeout
      const feats = { edca: false }
      const ap = node('ap', 'Router', 'ap', 3, 4, 'he', 'idle', feats)
      const laptop = node('sta-1', 'Laptop', 'sta', 16, 2, 'he', 'saturated', feats)
      const pin = (n: NodeCfg): NodeCfg => (band === '2g' ? { ...n, linkId: '2g' } : n)
      const rs = [...new Simulation(sc(longApartment(), [ap, laptop].map(pin), { seed: 7 }))
        .runUntil(50 * MS).records]
      const sta = vid(band, 'sta-1')
      const ends = ofType(rs, 'TX_END').filter((r) => r.node === sta && r.frame.kind === 'data')
      const tos = ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === sta)
      expect(tos.length, `${band}: the far station must actually time out`).toBeGreaterThan(5)
      const iv = new Set<number>()
      for (const to of tos) {
        const end = [...ends].reverse().find((e) => e.t <= to.t)
        if (end) iv.add(to.t - end.t)
      }
      expect([...iv], `${band}: the timeout interval is deterministic`).toHaveLength(1)
      const difs = [...new Set(ofType(rs, 'IFS_START')
        .filter((r) => r.node === sta && r.kind === 'DIFS').map((r) => r.untilNs - r.t))]
        .filter((x) => x > 0)
      expect(difs, `${band}: one real DIFS length`).toHaveLength(1)
      const data = [...new Set(ofType(rs, 'TX_START')
        .filter((r) => r.node === sta && r.frame.kind === 'data').map((r) => r.frame.txTimeNs))]
      expect(data, `${band}: one data PPDU length`).toHaveLength(1)
      return { timeout: [...iv][0], total: difs[0] + data[0] + [...iv][0] }
    }
    const a = far('5g')
    const b = far('2g')
    expect(a.timeout).toBe(45_000)
    expect(b.timeout).toBe(39_000)
    expect(b.total - a.total).toBe(-6_000)
  })
})

describe('link-2g · the 6.5 dB, and what it is worth where', () => {
  it('the offset is the engine constant the lesson names, and the ladder moves two or three rungs', () => {
    expect(LINK_EXTRA_LOSS_DB['2g']).toBe(-6.5)
    // The table the lesson prints, recomputed from the engine's own rung chooser rather than
    // copied: Wi-Fi 6 at 20 MHz, the same 5 GHz arrival level, with and without the offset.
    const rung = (rssi: number, band: Band): number =>
      mcsForRssi('he', rssi - LINK_EXTRA_LOSS_DB[band], undefined, 20)
    const rows: [number, number, number, number][] = [
      [-46.7, 11, 11, 0],
      [-60, 7, 10, 3],
      [-70, 4, 7, 3],
      [-75, 2, 4, 2],
      [-80, 0, 3, 3],
    ]
    for (const [rssi, five, two, delta] of rows) {
      expect(rung(rssi, '5g'), `${rssi} dBm on 5 GHz`).toBe(five)
      expect(rung(rssi, '2g'), `${rssi} dBm on 2.4 GHz`).toBe(two)
      expect(two - five, `${rssi} dBm delta`).toBe(delta)
    }
    // the rates beside those rungs, also from the engine
    expect(mcsRateMbps('he', 11)).toBe(143.4)
    expect(mcsRateMbps('he', 10)).toBe(129)
    expect(mcsRateMbps('he', 7)).toBe(86)
    expect(mcsRateMbps('he', 4)).toBe(51.6)
    expect(mcsRateMbps('he', 3)).toBe(34.4)
    expect(mcsRateMbps('he', 2)).toBe(25.8)
    expect(mcsRateMbps('he', 0)).toBe(8.6)
    // and 「none on the desk」 is the lesson's second claim about the same number
    expect(rung(-46.7, '2g') - rung(-46.7, '5g')).toBe(0)
  })

  it('on the desk the two links are indistinguishable over thirty seeds', () => {
    // The claim that keeps the lesson from reading as an advertisement, and it has to be a
    // cross-seed claim: a single seed here differs by more than the effect does.
    const five = seeds(30).map((s) => throughputMbps('single', '5g', s))
    const two = seeds(30).map((s) => throughputMbps('single', '2g', s))
    const mf = mean(five)
    const mt = mean(two)
    const sd = Math.sqrt(mean(five.map((x) => (x - mf) ** 2)))
    expect(mf).toBeGreaterThan(41.5)
    expect(mf).toBeLessThan(42.7)
    expect(mt).toBeGreaterThan(41.5)
    expect(mt).toBeLessThan(42.7)
    //「within one standard deviation」, as the assertion rather than as a remark
    expect(Math.abs(mt - mf)).toBeLessThan(sd)
    // both links sit at the top of the Wi-Fi 6 ladder here, which is WHY there is nothing to see
    for (const band of ['5g', '2g'] as const) {
      const sta = vid(band, 'sta-1')
      const mcs = [...new Set(ofType(recordsOf('single', band, 7, 50), 'TX_START')
        .filter((r) => r.node === sta && r.frame.kind === 'data').map((r) => r.frame.mcs))]
      expect(mcs, band).toEqual([11])
    }
  })
})

describe('link-2g · the band change moves one ray across one threshold', () => {
  it('the scene is built so that exactly one link crosses CCA_PD_DBM, and the margin is 1.58 dB', () => {
    const s = link2gScenario('pair', '5g')
    const table = buildLinkTable(s.nodes, s.walls)
    const between = table.get('sta-1')!.get('sta-2')!
    expect(between).toBeCloseTo(-83.58, 2)
    expect(CCA_PD_DBM).toBe(-82)
    // under the threshold on 5 GHz, over it on 2.4 GHz — the whole geometry is for this
    expect(between).toBeLessThan(CCA_PD_DBM)
    expect(between - CCA_PD_DBM).toBeCloseTo(-1.58, 2)
    expect(between - LINK_EXTRA_LOSS_DB['2g']).toBeGreaterThan(CCA_PD_DBM)
    expect(between - LINK_EXTRA_LOSS_DB['2g']).toBeCloseTo(-77.08, 2)
    // and the two station-to-router links do NOT cross it, on either band, so nothing else moved
    for (const id of ['sta-1', 'sta-2']) {
      const up = table.get(id)!.get('ap')!
      expect(up, id).toBeCloseTo(-64.14, 2)
      expect(up, id).toBeGreaterThan(CCA_PD_DBM)
      expect(up - LINK_EXTRA_LOSS_DB['2g'], id).toBeGreaterThan(CCA_PD_DBM)
    }
    // the two stations are equidistant from the router by construction, so no printed
    // difference can be the floor plan rather than the band
    expect(table.get('sta-1')!.get('ap')).toBe(table.get('sta-2')!.get('ap'))
  })

  it('EIFS exists on 2.4 GHz only, is 88 µs with no exception, and the failure reason flips with it', () => {
    const five = recordsOf('pair', '5g', 7)
    const two = recordsOf('pair', '2g', 7)
    const eifs = (rs: TLRecord[]) => ofType(rs, 'IFS_START').filter((r) => r.kind === 'EIFS')
    // 「a record that cannot appear on the other link」 — the lesson's own watch target
    expect(eifs(five)).toHaveLength(0)
    expect(eifs(two).length).toBeGreaterThan(100)
    expect([...new Set(eifs(two).map((r) => r.untilNs - r.t))]).toEqual([88_000])
    // and the mechanism behind it, as the record reasons rather than as prose
    const reasons = (rs: TLRecord[]) => [...new Set(ofType(rs, 'RX_FAIL').map((r) => r.reason))].sort()
    expect(reasons(five)).toEqual(['collision'])
    expect(reasons(two)).toEqual(['lowSinr'])
    // the stations are the ones failing to decode on 2.4 GHz, not the router
    expect([...new Set(ofType(two, 'RX_FAIL').map((r) => r.node))].sort())
      .toEqual(['sta-1#2g', 'sta-2#2g'])
  })

  it('the reversal is at least five-fold across ten seeds, as a ratio and not as a mean', () => {
    // Pinned as a LOWER BOUND on the ratio, deliberately. The means below are what the lesson
    // prints and they move with the seed set; the claim is that the band change turns two
    // mutually hidden stations into two that defer, and a ratio floor is that claim. Measured at
    // 10.5× on seeds 1–10, so the floor of 5 leaves room rather than pinning the measurement.
    const five = seeds(10).map((s) => throughputMbps('pair', '5g', s))
    const two = seeds(10).map((s) => throughputMbps('pair', '2g', s))
    expect(mean(two) / mean(five)).toBeGreaterThan(5)
    // the figures the lesson prints, as bands wide enough for an ordinary engine edit
    expect(mean(five)).toBeGreaterThan(3.2)
    expect(mean(five)).toBeLessThan(4.3)
    expect(mean(two)).toBeGreaterThan(38)
    expect(mean(two)).toBeLessThan(40.5)
    // and the counts behind it, which is where the mechanism is legible
    let okFive = 0; let okTwo = 0; let collFive = 0; let collTwo = 0
    for (const s of seeds(10)) {
      const a = recordsOf('pair', '5g', s)
      const b = recordsOf('pair', '2g', s)
      okFive += ofType(a, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
      okTwo += ofType(b, 'RX_OK').filter((r) => r.node === 'ap#2g' && r.frame.kind === 'data').length
      collFive += ofType(a, 'COLLISION').length
      collTwo += ofType(b, 'COLLISION').length
    }
    expect(okTwo / okFive).toBeGreaterThan(5)
    // deferring costs collisions, which is the half of the story a throughput number hides
    expect(collTwo).toBeLessThan(collFive / 2)
  })

  it('the reversal is a knife edge: widen the stairwell enough and it stops happening', () => {
    // The lesson's own `tryThis`, as an assertion — because 「this is a knife edge and not a
    // staircase」 is a claim about what happens OUTSIDE the shipped scene, and a lesson that
    // says so without measuring it is asking to be believed.
    // The same plan with the stairwell at another width — rebuilt rather than patched, which is
    // how `stairHouse()` itself is built, so the outer shell moves with the inner walls.
    const between = (gapM: number): number => {
      const far = 4 + gapM
      const right = 8 + gapM
      const walls: Wall[] = [
        brick(0, 0, right, 0), brick(right, 0, right, 8), brick(right, 8, 0, 8), brick(0, 8, 0, 0),
        brick(4, 0, 4, 8), brick(far, 0, far, 8),
      ]
      const feats = { edca: false }
      const nodes = [
        node('ap', 'Router', 'ap', 4 + gapM / 2, 4, 'he', 'idle', feats),
        node('sta-1', 'Laptop A', 'sta', 1, 2, 'he', 'saturated', feats),
        node('sta-2', 'Laptop B', 'sta', right - 1, 2, 'he', 'saturated', feats),
      ]
      return buildLinkTable(nodes, walls).get('sta-1')!.get('sta-2')!
    }
    // the shipped width reproduces the shipped figure, so this helper IS the same plan
    expect(between(2.5)).toBeCloseTo(-83.58, 2)
    const at4 = between(4)
    expect(at4).toBeCloseTo(-85.7, 1)
    // still over the threshold once the band's 6.5 dB is added: the lesson says 「this cell is
    // still there」 at 4 m, and that is the half of the experiment a reader can check
    expect(at4 - LINK_EXTRA_LOSS_DB['2g']).toBeGreaterThan(CCA_PD_DBM)
    // and far enough apart the offset no longer reaches the threshold at all
    const far = between(12)
    expect(far).toBeLessThan(-88.5)
    expect(far - LINK_EXTRA_LOSS_DB['2g']).toBeLessThan(CCA_PD_DBM)
  })
})

describe('link-2g · the 40 MHz cap, the counterweight', () => {
  it('widthOf caps 2.4 GHz at 40 MHz — and only when it is told which link it is on', () => {
    const s = link2gScenario('wide', '2g')
    const [ap, sta] = s.nodes
    expect(negotiatedWidth(ap, sta, '2g')).toBe(40)
    expect(negotiatedWidth(ap, sta, '5g')).toBe(160)
    // The ruler trap the design document hit: with no `link` argument the ceiling defaults to
    // 320 MHz and the cap does not apply, so a test that forgets it measures a width no station
    // in this scene ever uses. Pinned so nobody has to remember.
    expect(widthOf(sta)).toBe(160)
    expect(widthOf(sta, '2g')).toBe(40)
    expect(negotiatedWidth(ap, sta)).toBe(160)
  })

  it('the same frame costs 61.6 µs at 160 MHz and 94.8 µs at 40 MHz, and the exchange is no longer equal', () => {
    const seg = (band: Band) => {
      const rs = recordsOf('wide', band, 7, 50)
      const sta = vid(band, 'sta-1')
      const tx = ofType(rs, 'TX_START').filter((r) => r.node === sta && r.frame.kind === 'data')
      const lens = [...new Set(tx.map((r) => r.frame.txTimeNs))]
      expect(lens, band).toHaveLength(1)
      const starts = tx.map((r) => r.t)
      const gaps: number[] = []
      for (let i = 1; i < starts.length; i += 1) gaps.push(starts[i] - starts[i - 1])
      return {
        data: lens[0],
        mcs: [...new Set(tx.map((r) => r.frame.mcs))],
        width: [...new Set(tx.map((r) => r.frame.widthMhz))],
        bytes: tx[0].frame.bytes,
        floor: Math.min(...gaps),
      }
    }
    const a = seg('5g')
    const b = seg('2g')
    expect(a).toMatchObject({ data: 61_600, mcs: [9], width: [160], bytes: 1528, floor: 139_600 })
    expect(b).toMatchObject({ data: 94_800, mcs: [13], width: [40], bytes: 1528, floor: 166_800 })
    // The point of the cell: the four interframe figures still net to zero, so the whole of the
    // remaining 27.2 µs is bandwidth. 33.2 µs of PPDU, less the 6 µs extension, is 27.2.
    expect(b.floor - a.floor).toBe(27_200)
    expect(b.data - a.data - 6_000).toBe(27_200)
    // and this one number is larger than every interframe difference in the lesson put together
    expect(b.data - a.data).toBeGreaterThan(5 * 6_000)
  })

  it('2.4 GHz holds the higher rung and still loses 11.5 % over twenty seeds', () => {
    const five = mean(seeds(20).map((s) => throughputMbps('wide', '5g', s)))
    const two = mean(seeds(20).map((s) => throughputMbps('wide', '2g', s)))
    expect(five).toBeGreaterThan(two)
    expect(five).toBeGreaterThan(57.3)
    expect(five).toBeLessThan(58.5)
    expect(two).toBeGreaterThan(50.7)
    expect(two).toBeLessThan(51.9)
    // the figure the lesson prints, as a band on the percentage rather than on either mean
    const loss = (five - two) / five * 100
    expect(loss).toBeGreaterThan(10.5)
    expect(loss).toBeLessThan(12.5)
    // The two opposite things the lesson says happen at once, from the engine's own formula:
    // a 160 MHz channel lifts the noise floor by 9.03 dB and a 40 MHz one by 3.01 dB, which is
    // why the capped link holds the TOP rung of the ladder and the wide one does not.
    expect(noiseDbm(160) - noiseDbm(20)).toBeCloseTo(9.03, 2)
    expect(noiseDbm(40) - noiseDbm(20)).toBeCloseTo(3.01, 2)
  })
})

describe('link-2g · the printed tables are read back out of the lesson and re-measured', () => {
  /**
   * The drift this guards against is the one this repository keeps producing: a figure that was
   * true when it was typed and is now only typed. Every assertion above measures the engine and
   * compares it to a literal in THIS file, which catches an engine change and misses a prose
   * change — somebody editing 217.2 to 217.3 in the lesson would ship it. So the two net-sum
   * tables are parsed out of `link2g.numbers` and every cell is checked against the same run the
   * reader loads. The lesson's prose is the thing under test here, not the engine.
   */
  const tableWithHeading = (fragment: string): string[][] => {
    const b = link2g.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }

  /** 「139.2 µs」 → 139 200 ns; 「−6.0」 → −6 000 ns. Full-width minus included. */
  const ns = (cell: string): number =>
    Math.round(Number(cell.replace(/\s|µs/g, '').replace(/[−–]/, '-')) * 1000)

  it('the one-frame table says what the one-frame run does, cell by cell', () => {
    const rows = tableWithHeading('一次零退避的交换')
    expect(rows).toHaveLength(5)
    const five = recordsOf('single', '5g', 7, 50)
    const two = recordsOf('single', '2g', 7, 50)
    const seg = (rs: TLRecord[], band: Band) => {
      const sta = vid(band, 'sta-1')
      const ap = vid(band, 'ap')
      const difs = [...new Set(ofType(rs, 'IFS_START')
        .filter((r) => r.node === sta && r.kind === 'DIFS').map((r) => r.untilNs - r.t))].filter((x) => x > 0)[0]
      const data = ofType(rs, 'TX_START').find((r) => r.node === sta && r.frame.kind === 'data')!
      const end = ofType(rs, 'TX_END').find((r) => r.node === sta && r.frame.kind === 'data')!
      const ack = ofType(rs, 'TX_START').find((r) => r.node === ap && r.frame.kind === 'ack' && r.t >= end.t)!
      return [difs, data.frame.txTimeNs, ack.t - end.t, ack.frame.txTimeNs]
    }
    const a = seg(five, '5g')
    const b = seg(two, '2g')
    for (const [i, row] of rows.entries()) {
      if (i === 4) {
        // the total row: the lesson's own sum, against the sum of the four it printed above
        expect(ns(row[1]), 'printed 5 GHz total').toBe(a.reduce((x, y) => x + y, 0))
        expect(ns(row[2]), 'printed 2.4 GHz total').toBe(b.reduce((x, y) => x + y, 0))
        expect(ns(row[3]), 'printed net difference').toBe(0)
        continue
      }
      expect(ns(row[1]), `row ${i} 5 GHz`).toBe(a[i])
      expect(ns(row[2]), `row ${i} 2.4 GHz`).toBe(b[i])
      expect(ns(row[3]), `row ${i} difference`).toBe(b[i] - a[i])
    }
    // the PSDU length the first table's row label quotes, which is the other number in it
    expect(rows[1][0]).toContain('1 528')
    expect(ofType(five, 'TX_START').find((r) => r.frame.kind === 'data')!.frame.bytes).toBe(1528)
  })

  it('the aggregation table says what the aggregation run does, cell by cell', () => {
    const rows = tableWithHeading('换成开了聚合的那一格')
    expect(rows).toHaveLength(5)
    const seg = (band: Band) => {
      const rs = recordsOf('burst', band, 7, 50)
      const sta = vid(band, 'sta-1')
      const ap = vid(band, 'ap')
      const difs = [...new Set(ofType(rs, 'IFS_START')
        .filter((r) => r.node === sta && r.kind === 'DIFS').map((r) => r.untilNs - r.t))].filter((x) => x > 0)[0]
      const data = ofType(rs, 'TX_START').find((r) => r.node === sta && r.frame.kind === 'data')!
      const end = ofType(rs, 'TX_END').find((r) => r.node === sta && r.frame.kind === 'data')!
      const ba = ofType(rs, 'TX_START').find((r) => r.node === ap && r.frame.kind === 'ba' && r.t >= end.t)!
      return { segs: [difs, data.frame.txTimeNs, ba.t - end.t, ba.frame.txTimeNs], bytes: data.frame.bytes }
    }
    const a = seg('5g')
    const b = seg('2g')
    for (const [i, row] of rows.entries()) {
      if (i === 4) {
        expect(ns(row[1])).toBe(a.segs.reduce((x, y) => x + y, 0))
        expect(ns(row[2])).toBe(b.segs.reduce((x, y) => x + y, 0))
        expect(ns(row[3])).toBe(0)
        continue
      }
      expect(ns(row[1]), `row ${i} 5 GHz`).toBe(a.segs[i])
      expect(ns(row[2]), `row ${i} 2.4 GHz`).toBe(b.segs[i])
    }
    expect(rows[1][0]).toContain('30 718')
    expect(a.bytes).toBe(30_718)
    expect(b.bytes).toBe(30_718)
  })

  it('the 40 MHz table says what the wide run does', () => {
    const rows = tableWithHeading('40 兆赫上限')
    const a = recordsOf('wide', '5g', 7, 50)
    const b = recordsOf('wide', '2g', 7, 50)
    const txOf = (rs: TLRecord[], band: Band) => ofType(rs, 'TX_START')
      .find((r) => r.node === vid(band, 'sta-1') && r.frame.kind === 'data')!.frame
    // 协商到的信道带宽 / 选中的 MCS / 数据 PPDU, as the lesson numbered them
    expect(rows[0][1]).toContain(String(txOf(a, '5g').widthMhz))
    expect(rows[0][2]).toContain(String(txOf(b, '2g').widthMhz))
    expect(rows[1][1]).toBe(String(txOf(a, '5g').mcs))
    expect(rows[1][2]).toBe(String(txOf(b, '2g').mcs))
    expect(ns(rows[2][1])).toBe(txOf(a, '5g').txTimeNs)
    expect(ns(rows[2][2])).toBe(txOf(b, '2g').txTimeNs)
  })

  it('the MCS-rung table says what the engine chooses, rung by rung', () => {
    const rows = tableWithHeading('6.5 分贝换来几级')
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (const row of rows) {
      const rssi = Number(row[0].replace(/[−–]/, '-').replace(/[^0-9.-]/g, ''))
      const five = mcsForRssi('he', rssi, undefined, 20)
      const two = mcsForRssi('he', rssi + 6.5, undefined, 20)
      expect(row[1], `${rssi} dBm, 5 GHz cell`).toContain(`MCS ${five}`)
      expect(row[1]).toContain(String(mcsRateMbps('he', five)))
      expect(row[2], `${rssi} dBm, 2.4 GHz cell`).toContain(`MCS ${two}`)
      expect(row[2]).toContain(String(mcsRateMbps('he', two)))
      expect(Number(row[3]), `${rssi} dBm, printed rung delta`).toBe(two - five)
    }
  })
})

describe('link-2g · the ruler this lesson had to be measured with', () => {
  it('flipping the band flips the backoff stream, which is why no claim here is single-seed', () => {
    // The warning in this file's docblock, as an executable fact rather than a remark: the same
    // station on the two bands is two different virtual ids, and the MAC's random stream is
    // forked on that id. So a single-seed A/B is not a measurement of the band.
    expect(virtualId('sta-1', '5g')).toBe('sta-1')
    expect(virtualId('sta-1', '2g')).toBe('sta-1#2g')
    // and the consequence, measured: on the desk, where the band provably changes nothing a
    // reader can see, single seeds still disagree in both directions
    const diffs = seeds(10).map((s) => throughputMbps('single', '2g', s) - throughputMbps('single', '5g', s))
    expect(diffs.some((d) => d > 0), 'some seed favours 2.4 GHz').toBe(true)
    expect(diffs.some((d) => d < 0), 'some seed favours 5 GHz').toBe(true)
    // the spread between single seeds is wider than the thirty-seed difference between the bands
    const spread = Math.max(...diffs) - Math.min(...diffs)
    expect(spread).toBeGreaterThan(Math.abs(mean(diffs)))
  })

  it('EDCA is off in every scene, which is what makes a DIFS appear at all', () => {
    // Stated in `wifiScenes.ts` and asserted here: with EDCA on, `IFS_START` carries `AIFS` and
    // the 28-against-34 this lesson is about never reaches the timeline. A scene that quietly
    // gained EDCA would not fail any other test in this file — the figures would simply be
    // measured off `AIFS` records and come out 37 and 43.
    for (const shape of ['pair', 'single', 'burst', 'wide'] as const) {
      for (const band of ['2g', '5g'] as const) {
        const s = link2gScenario(shape, band)
        for (const n of s.nodes) expect(n.caps.features.edca, `${shape}/${band}/${n.id}`).toBe(false)
      }
    }
    const kinds = [...new Set(ofType(recordsOf('single', '2g', 7, 50), 'IFS_START').map((r) => r.kind))]
    expect(kinds).toContain('DIFS')
    expect(kinds).not.toContain('AIFS')
  })
})

/**
 * **The figures this lesson states in PROSE, which the two table read-backs above do not reach.**
 *
 * The describe above parses `numbers`' two tables and re-measures every cell. The lesson also
 * states figures in sentences — throughput means over ten seeds, two arrival levels after an
 * editor edit, a single-station mean — and a sweep of all 91 lessons against all 293 test files on
 * 2026-10-12 found seven of this lesson's prose figures appearing in no test anywhere. Five are
 * pinned here. All five were already exact; this is wiring, not a correction.
 *
 * The sixth and seventh are 「整段从 1 551.0 µs 降到 1 545.0 µs」 and they are deliberately left
 * out, with an argument rather than a date (the lesson of §17's bucket table, see
 * `tests/course/wifi-coverage.test.ts`):
 *
 *   That pair describes a **hypothetical** 20-MSDU A-MPDU — the sentence's own subject, 「20 个
 *   MSDU 装进一个 A-MPDU，只付一次 6 微秒」 — and no scene in this lesson builds one. `burst`
 *   aggregates up to `MAX_AMPDU_MPDUS` (64) and its PPDU measures 1 771.2 µs on 5 GHz against
 *   1 777.2 on 2.4 GHz, not the 1 472 / 1 478 the pair implies. Pinning the absolute figures needs
 *   the MAC's own `airModeNs` over a 20-MPDU PSDU, which is reachable but is a different slice.
 *   What IS pinned below is everything the sentence claims that can be measured: the two waits
 *   (45 µs and 39 µs), and that the two totals it prints differ by exactly the 6 µs of signal
 *   extension with 2.4 GHz the faster one. And the pair is credible: the implied preamble follows
 *   from the single-MSDU PPDU this lesson already pins — (1 472 − P) / (139.2 − P) = 20 gives
 *   P = 69.05 µs, an HE SU preamble, so 1 472 µs really is twenty of these frames.
 */
describe('link-2g · the figures the lesson states in sentences, not in its tables', () => {
  const num = (s: string): number => Number(s.replace('−', '-'))

  it('the ten-seed hidden-node means, both bands, as `numbers` states them', () => {
    const text = JSON.stringify(link2g.numbers)
    const m = /5 GHz 上两台笔记本互为隐藏节点，吞吐均值 ([\d.]+) Mb\/s[^]*?搬到 2\.4 GHz：均值 ([\d.]+) Mb\/s/
      .exec(text)
    expect(m, 'the hidden-node paragraph no longer states the two means in the shape this reads')
      .not.toBeNull()
    const heading = /十个种子/.test(text)
    expect(heading, 'the paragraph still says the means are over ten seeds').toBe(true)
    const ten = seeds(10)
    expect(Number(mean(ten.map((s) => throughputMbps('pair', '5g', s))).toFixed(3)),
      'the 5 GHz hidden-node mean the lesson prints').toBe(num(m![1]))
    expect(Number(mean(ten.map((s) => throughputMbps('pair', '2g', s))).toFixed(3)),
      'the 2.4 GHz hidden-node mean the lesson prints').toBe(num(m![2]))
  })

  it('the single-station means land where `tryThis` says, within one standard deviation', () => {
    const m = /两条链路的均值都落在 ([\d.]+) Mb\/s 附近，差不到一个标准差/.exec(link2g.tryThis[1])
    expect(m, 'tryThis[1] no longer states the single-station mean in the shape this reads')
      .not.toBeNull()
    const sd = (xs: number[]): number => {
      const m2 = mean(xs)
      return Math.sqrt(xs.reduce((a, b) => a + (b - m2) ** 2, 0) / xs.length)
    }
    const ten = seeds(10)
    const five = ten.map((s) => throughputMbps('single', '5g', s))
    const two = ten.map((s) => throughputMbps('single', '2g', s))
    // 「落在 X 附近」: the lesson prints one decimal, so both means round to it
    expect(Number(mean(five).toFixed(1)), '5 GHz single-station mean').toBe(num(m![1]))
    expect(Number(mean(two).toFixed(1)), '2.4 GHz single-station mean').toBe(num(m![1]))
    // 「差不到一个标准差」 — the claim that makes the sentence worth printing
    expect(Math.abs(mean(five) - mean(two)), 'the gap between the two means')
      .toBeLessThan(Math.min(sd(five), sd(two)))
  })

  it('widening the stairwell to 4 m lands on the two levels `tryThis` states', () => {
    // The editor edit the sentence asks for, replayed: the stairwell is `rooms[1]`, x 4 to 6.5, so
    // taking it to 4 m pushes bedroom B and the laptop in it out by 1.5 m. Nothing else moves.
    // **That reconstruction is confirmed by the figures themselves** — it reproduces both to the
    // last digit, which no other reading of 「把楼梯间的宽度拉到 4 米」 would.
    const m = /站点之间掉到 [−-]([\d.]+) dBm，加上 6\.5 分贝是 [−-]([\d.]+)/.exec(link2g.tryThis[0])
    expect(m, 'tryThis[0] no longer states the two levels in the shape this reads').not.toBeNull()
    const base = link2gScenario('pair', '5g')
    const shift = 1.5
    const widened = {
      nodes: base.nodes.map((n) => (n.id === 'sta-2'
        ? { ...n, pos: { ...n.pos, x: n.pos.x + shift } } : n)),
      walls: base.walls.map((w) => ({
        ...w,
        x1: w.x1 >= 6.5 ? w.x1 + shift : w.x1,
        x2: w.x2 >= 6.5 ? w.x2 + shift : w.x2,
      })),
    }
    const between = buildLinkTable(widened.nodes, widened.walls).get('sta-1')!.get('sta-2')!
    expect(Number(between.toFixed(2)), 'the station-to-station level after the widening')
      .toBe(-num(m![1]))
    expect(Number((between - LINK_EXTRA_LOSS_DB['2g']).toFixed(2)), 'and the same level on 2.4 GHz')
      .toBe(-num(m![2]))
    // the sentence's point: still above the threshold, so the EIFS column survives the edit
    expect(between - LINK_EXTRA_LOSS_DB['2g']).toBeGreaterThan(CCA_PD_DBM)
  })

  it('the failed exchange: both waits measured, and the 6 µs the printed pair differs by', () => {
    const m = /5 GHz 等 (\d+) 微秒而 2\.4 GHz 等 (\d+) 微秒，整段从 ([\d\s.]+) µs 降到 ([\d\s.]+) µs，2\.4 GHz 反而快 (\d+) 微秒/
      .exec(JSON.stringify(link2g.numbers))
    expect(m, 'the failed-exchange sentence is gone from `numbers`').not.toBeNull()
    const wait = (band: Band): number => {
      const rs = recordsOf('pair', band, 7)
      const sta = vid(band, 'sta-1')
      const to = ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === sta)[0]
      const end = ofType(rs, 'TX_END').filter((r) => r.node === sta && r.t <= to.t).pop()!
      return (to.t - end.t) / 1000
    }
    expect(wait('5g'), 'the 5 GHz wait the lesson states').toBe(Number(m![1]))
    expect(wait('2g'), 'the 2.4 GHz wait the lesson states').toBe(Number(m![2]))
    // the two totals are arithmetic over a hypothetical 20-MSDU aggregate (see this describe's
    // docblock); what the engine settles is the DIFFERENCE, which is one signal extension.
    const five = Number(m![3].replace(/\s/g, ''))
    const two = Number(m![4].replace(/\s/g, ''))
    expect(five - two, 'the printed pair differs by the gap the same sentence names')
      .toBeCloseTo(Number(m![5]), 6)
    expect(two, 'and 2.4 GHz is the faster one, which is the sentence’s point').toBeLessThan(five)
    // that 6 µs is the signal extension, measured where it is visible: one PPDU, two bands
    const ppdu = (band: Band): number => {
      const rs = recordsOf('burst', band, 7)
      const sta = vid(band, 'sta-1')
      return ofType(rs, 'TX_START').find((r) => r.node === sta && r.frame.kind === 'data')!.frame.txTimeNs
    }
    expect((ppdu('2g') - ppdu('5g')) / 1000, 'one PPDU costs 6 µs more on 2.4 GHz')
      .toBe(Number(m![5]))
  })
})

// --- every figure the lesson's PROSE prints ----------------------------------------------------

/**
 * **The two net-sum tables above are read out of the lesson; its prose is not.** This file's own
 * docblock says 「every figure the lesson prints, measured here」, and for the tables it is true —
 * but `scripts/figure-planting.ts` counts **235 plantable figures** in this lesson and the tables
 * hold 74 of them. The rest are in `terms`, `picture`, `numbers`' paragraphs, `deeper`,
 * `sources`, `limits`, `observe`, `tryThis` and the quiz, and a six-figure sample on 2026-10-12
 * noticed none of six.
 *
 * So every figure is read at every site it is printed, which is the order this programme arrived
 * at: a lesson states its band offset six times and its EIFS three, and a read that takes only
 * the site where the figure is derived leaves the other five free.
 *
 * **A band name in prose is semantics, not a quantity.** 「这门课量到现在的每一个数，都是在
 * 5 GHz 上量的」 says WHICH BAND a sentence is about, and editing the 5 to a 6 makes the
 * sentence wrong without making any measurement wrong — there is no quantity in this engine the
 * figure has to equal. What is checkable, and what the first test below checks, is that every
 * band this lesson names is one the engine HAS: the keys of `LINK_EXTRA_LOSS_DB`. The sweep goes
 * on reporting those sites as unpinned, which is correct, and that is the fourth exemption class
 * of `docs/course-figure-pinning.md`.
 *
 * Two more exemptions, each with its argument:
 *  - 「真实世界里 2.4 GHz 与 5 GHz 在自由空间中的路径损耗差约为 6.6 分贝」 is about the real world,
 *    not about this engine — the whole point of the sentence is that the engine's −6.5 dB is a
 *    chosen constant beside it. What is checkable is the comparison, and it is: the two differ by
 *    less than a decibel.
 *  - 「ERP-DSSS/CCK 的 1、2、5.5、11 Mb/s 四档速率」 are the rates this engine does **not** build
 *    (`limits` says so in the same sentence), so there is nothing here to check them against.
 */
describe('link-2g · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(link2g).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
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
  /** The lesson's own tables, by a fragment of their heading — the other describe has its own. */
  const tableWithHeading = (fragment: string): string[][] => {
    const b = link2g.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }
  /** 「139.2 µs」 → 139 200 ns; 「−6.0」 → −6 000 ns. Full-width minus included. */
  const ns = (cell: string): number =>
    Math.round(Number(cell.replace(/\s|µs/g, '').replace(/[−–]/, '-')) * 1000)
  /** The band a 「N GHz」 names. The KEYS are pinned to the engine's own set below. */
  const BAND_GHZ: Record<keyof typeof LINK_EXTRA_LOSS_DB, number> = { '2g': 2.4, '5g': 5, '6g': 6 }

  it('every 「N GHz」 is a band this engine has, and every offset is the one it charges', () => {
    expect(Object.keys(BAND_GHZ).sort(), 'the engine’s own three links')
      .toEqual(Object.keys(LINK_EXTRA_LOSS_DB).sort())
    for (const v of everyFig(/([\d.]+) GHz/g, 'a band', 20)) {
      expect(Object.values(BAND_GHZ), `${v} GHz is a band this engine has`).toContain(val(v))
    }
    // 「2.4 GHz 是 −6.5 分贝、6 GHz 是 +1.2 分贝、5 GHz 是 0」 — the whole table, in one sentence
    const [b1, off1, b2, off2, b3, off3] = raw(EVERYWHERE,
      /([\d.]+) GHz 是 −([\d.]+) 分贝、([\d.]+) GHz 是 \+([\d.]+) 分贝、([\d.]+) GHz 是 (\d)/,
      'the band offsets, all three')
    type Link = keyof typeof LINK_EXTRA_LOSS_DB
    const keyOf = (ghz: string): Link =>
      (Object.keys(BAND_GHZ) as Link[]).find((k) => BAND_GHZ[k] === val(ghz))!
    same(`-${off1}`, LINK_EXTRA_LOSS_DB[keyOf(b1)], `the offset on ${b1} GHz`)
    same(off2, LINK_EXTRA_LOSS_DB[keyOf(b2)], `the offset on ${b2} GHz`)
    same(off3, LINK_EXTRA_LOSS_DB[keyOf(b3)], `the offset on ${b3} GHz`)
    // and every other site that names the 2.4 GHz offset — six of them
    const offset = Math.abs(LINK_EXTRA_LOSS_DB['2g' as keyof typeof LINK_EXTRA_LOSS_DB])
    for (const v of everyFig(
      /−([\d.]+) 分贝是本仿真器|加 ([\d.]+) 分贝变成|往右推 ([\d.]+) 分贝|那 ([\d.]+) 分贝做了什么|（\+([\d.]+) 分贝）|([\d.]+) 分贝换来几级|([\d.]+) 分贝就跨不过去|这条硬线两侧的那 ([\d.]+) 分贝|−([\d.]+) 分贝的频段路损偏移/g,
      'the band offset', 6)) {
      same(v, offset, 'the offset this engine charges 2.4 GHz')
    }
    // 「真实世界里…约为 6.6 分贝」: the exemption's own comparison
    const [real] = figs(EVERYWHERE, /路径损耗差约为 ([\d.]+) 分贝/, 'the real-world difference')
    expect(Math.abs(real - offset), 'the engine’s constant is within a decibel of it')
      .toBeLessThan(1)
  })

  it('the six timing constants of 2.4 GHz, and the two interval figures they produce', () => {
    // 「aSIFSTime 10 µs、短时隙 9 µs、aSignalExtension 6 µs、aRxPHYStartDelay（ERP-OFDM）20 µs、
    //  aCWmin 15」
    const [sifs, slot, ext, rxDelay, cwMin] = figs(EVERYWHERE,
      /aSIFSTime (\d+) µs、短时隙 (\d+) µs、aSignalExtension (\d+) µs、aRxPHYStartDelay（ERP-OFDM）(\d+) µs、aCWmin (\d+)/,
      '`sources` on the six constants')
    expect([sifs * 1000, slot * 1000, ext * 1000, rxDelay * 1000],
      'the four this engine holds for 2.4 GHz')
      .toEqual([ERP_2G.sifsNs, ERP_2G.slotNs, ERP_2G.signalExtNs, ERP_2G.rxStartDelayNs])
    expect(cwMin, 'and the window it starts from').toBe(CW_MIN)
    // every statement of the signal extension — `terms`, `sources`, and the 「5/6 GHz 为 0」 pair
    for (const v of everyFig(/多算的 (\d+) 微秒静默期|aSignalExtension (\d+) µs|GHz 为 (\d+) µs/g,
      'the signal extension', 3)) {
      expect(val(v) * 1000, 'the extension 2.4 GHz pays').toBe(ERP_2G.signalExtNs)
    }
    for (const v of everyFig(/GHz 上它是 (\d)|GHz 为 (\d)，/g, 'the extension the other bands pay', 2)) {
      expect(val(v) * 1000, 'which is none').toBe(OFDM_5G.signalExtNs)
    }
    // 「两条链路的时隙都是 9 微秒」 and 「固定用 9 微秒的短时隙」
    for (const v of everyFig(/时隙都是 (\d+) 微秒|固定用 (\d+) 微秒的短时隙/g, 'the slot', 2)) {
      expect(val(v) * 1000, 'the slot both links count in').toBe(ERP_2G.slotNs)
      expect(ERP_2G.slotNs, 'and 5 GHz has the same one').toBe(OFDM_5G.slotNs)
    }
    // 「5 GHz 等 45 微秒而 2.4 GHz 等 39 微秒」, and `limits` on what the standard would give
    const [five, two] = figs(EVERYWHERE, /(\d+) 微秒而 2\.4 GHz 等 (\d+) 微秒/,
      'the two ACK timeouts')
    expect([five * 1000, two * 1000], 'the timeouts this engine applies')
      .toEqual([OFDM_5G.ackTimeoutNs, ERP_2G.ackTimeoutNs])
    const [stdSifs, stdSlot, stdDelay, stdSum] = figs(EVERYWHERE,
      /于是 (\d+) \+ (\d+) \+ (\d+) = (\d+)/, '`limits` on the standard’s own sum')
    expect(stdSifs + stdSlot + stdDelay, 'the lesson’s own arithmetic').toBe(stdSum)
    expect([stdSifs * 1000, stdSlot * 1000], 'its first two terms are the engine’s')
      .toEqual([ERP_2G.sifsNs, ERP_2G.slotNs])
    expect(stdDelay * 1000, 'and the third is the one the engine does NOT use')
      .not.toBe(ERP_2G.rxStartDelayNs)
    expect(stdSum * 1000 - ERP_2G.ackTimeoutNs, 'the whole difference is that third term')
      .toBe(stdDelay * 1000 - ERP_2G.rxStartDelayNs)
    // every 「39 微秒」 and every 「88 微秒」
    for (const v of everyFig(/确认帧超时 (\d+) 微秒|站点，(\d+) 微秒就是标准值/g,
      'the 2.4 GHz timeout, restated', 2)) {
      expect(val(v) * 1000, 'the timeout this engine applies').toBe(ERP_2G.ackTimeoutNs)
    }
    for (const v of everyFig(/它的长度是 (\d+) 微秒|长度全是 (\d+) 微秒|长度都是 (\d+) 微秒/g,
      'the EIFS', 3)) {
      expect(val(v) * 1000, 'the EIFS 2.4 GHz has').toBe(ERP_2G.eifsNs)
    }
  })

  it('the three levels, the two thresholds and the two margins of the stairwell', () => {
    const s = link2gScenario('pair', '5g', { seed: 7 })
    const t = buildLinkTable(s.nodes, s.walls)
    const between5 = t.get('sta-1')!.get('sta-2')!
    const up5 = t.get('sta-1')!.get('ap')!
    /*
     * `buildLinkTable` does not know about the band: `simulation.ts` adds
     * `LINK_EXTRA_LOSS_DB` to the whole table when it builds the run, which is why the same
     * geometry reads −83.58 dBm here and −77.08 dBm on 2.4 GHz. That offset is the lesson's own
     * subject, so the 2.4 GHz level is formed exactly the way the engine forms it.
     */
    const between2 = between5 - LINK_EXTRA_LOSS_DB['2g' as keyof typeof LINK_EXTRA_LOSS_DB]
    // every 「−83.58 dBm」, 「−64.14 dBm」 and 「−77.08 dBm」
    for (const v of everyFig(/−([\d.]+) dBm，而前导检测|之间是 −([\d.]+) dBm|算出 −([\d.]+) dBm/g,
      'the level between the two stations on 5 GHz', 2)) {
      same(`-${v}`, between5, 'what one station hears of the other on 5 GHz')
    }
    for (const v of everyFig(/都是 −([\d.]+) dBm，一模一样/g, 'the level up to the router', 1)) {
      same(`-${v}`, up5, 'what the router hears of either station')
    }
    for (const v of everyFig(/分贝变成 −([\d.]+) dBm/g, 'the same path on 2.4 GHz', 1)) {
      same(`-${v}`, between2, 'what one station hears of the other on 2.4 GHz')
    }
    expect(Number((between2 - between5).toFixed(2)), 'which is the offset, exactly')
      .toBe(Number(Math.abs(LINK_EXTRA_LOSS_DB['2g']).toFixed(2)))
    // every 「−82 dBm」 and 「−62 dBm」
    for (const v of everyFig(/门限是 −(\d+) dBm|低于 −(\d+) dBm 的前导检测|前导检测 −(\d+) dBm|前导检测在本仿真器里是 −(\d+) dBm/g,
      'the preamble-detection threshold', 3)) {
      expect(-val(v), 'the threshold this engine applies').toBe(CCA_PD_DBM)
    }
    for (const v of everyFig(/另一半是 −(\d+) dBm 的能量检测|能量检测 −(\d+) dBm/g,
      'the energy-detection threshold', 2)) {
      expect(-val(v), 'the other half of CCA').toBe(CCA_ED_DBM)
    }
    // 「差 1.58 分贝，刚好在门限之下」 and 「高出门限 4.92 分贝」
    for (const v of everyFig(/——差 ([\d.]+) 分贝|门限之下 ([\d.]+) 分贝处/g,
      'how far below the threshold the 5 GHz path sits', 2)) {
      same(v, CCA_PD_DBM - between5, 'the margin below the threshold')
    }
    for (const v of everyFig(/高出门限 ([\d.]+) 分贝/g, 'and how far above it the 2.4 GHz path sits', 1)) {
      same(v, between2 - CCA_PD_DBM, 'the margin above the threshold')
    }
    // 「让它低于门限 10 分贝，6.5 分贝就跨不过去」: the counterfactual, as an inequality
    const [deeper] = figs(EVERYWHERE, /低于门限 (\d+) 分贝/, 'the counterfactual `limits` names')
    expect(deeper, 'which is more than the offset could cross')
      .toBeGreaterThan(Math.abs(LINK_EXTRA_LOSS_DB['2g']))
  })

  it('the room, and the two distances the picture gives it', () => {
    const s = link2gScenario('pair', '5g', { seed: 7 })
    const at = (id: string) => s.nodes.find((n) => n.id === id)!.pos
    const [gap] = figs(EVERYWHERE, /中间一道 ([\d.]+) 米宽的砖砌楼梯间/, 'the stairwell’s width')
    const xs = [...new Set(s.walls.filter((w) => w.x1 === w.x2).map((w) => w.x1))].sort((a, b) => a - b)
    const inner = xs.filter((x) => x > Math.min(at('sta-1').x, at('sta-2').x)
      && x < Math.max(at('sta-1').x, at('sta-2').x))
    expect(inner, 'two inner walls, which are the stairwell').toHaveLength(2)
    same(String(gap), inner[1] - inner[0], 'the gap between them')
    const [apart] = figs(EVERYWHERE, /相距 ([\d.]+) 米/, 'how far apart the two laptops are')
    same(String(apart), Math.abs(at('sta-1').x - at('sta-2').x), 'their separation')
  })

  it('`observe`: the four segments on each link, and the exchange they come to', () => {
    const obs = link2g.observe.join('\n')
    const [difs5, difs2, data5, data2, sifs5, sifs2, ack5, ack2] = raw(obs,
      /DIFS 从 ([\d.]+) 变成 ([\d.]+) 微秒，数据 PPDU 从 ([\d.]+) 变成 ([\d.]+)，SIFS 从 ([\d.]+) 变成 ([\d.]+)，确认帧从 ([\d.]+) 变成 ([\d.]+)/,
      '`observe` on the eight segments')
    const rows = tableWithHeading('一次零退避的交换')
    // the eight figures `observe` quotes are the eight cells of the table above it
    const cell = (row: number, col: number): string => rows[row][col]
    for (const [i, pair] of [[difs5, difs2], [data5, data2], [sifs5, sifs2], [ack5, ack2]].entries()) {
      same(pair[0], ns(cell(i, 1)) / 1000, `row ${i}: the 5 GHz segment`)
      same(pair[1], ns(cell(i, 2)) / 1000, `row ${i}: and the 2.4 GHz one`)
    }
    const [exchange] = raw(obs, /一次交换都是 ([\d.]+) 微秒/, 'the exchange both links come to')
    same(exchange, ns(cell(4, 1)) / 1000, 'the total the table prints')
    expect(ns(cell(4, 1)), 'and the two totals really are equal').toBe(ns(cell(4, 2)))
    // 「每个 IFS 短 6 µs，每个 PPDU 长 6 µs」: the lesson's own account of why the sum is zero
    const [shorter, longer] = figs(EVERYWHERE, /每个 IFS 短 (\d+) µs，每个 PPDU 长 (\d+) µs/,
      'the two halves of the cancellation')
    expect([shorter * 1000, longer * 1000], 'the signal extension, twice')
      .toEqual([ERP_2G.signalExtNs, ERP_2G.signalExtNs])
    expect(ns(cell(0, 1)) - ns(cell(0, 2)), 'the IFS really is shorter by it')
      .toBe(shorter * 1000)
    expect(ns(cell(1, 2)) - ns(cell(1, 1)), 'and the PPDU longer by it').toBe(longer * 1000)
  })

  it('the hidden-node pair: the two means, the two counts and the ten-fold the lesson claims', () => {
    const tally = (band: Band) => {
      let ok = 0
      let coll = 0
      let eifs = 0
      let bits = 0
      for (const s of seeds(10)) {
        for (const r of recordsOf('pair', band, s)) {
          if (r.type === 'RX_OK' && r.node === vid(band, 'ap') && r.frame.kind === 'data') {
            ok += 1
            bits += (r.frame.bytes - 28) * 8
          } else if (r.type === 'COLLISION') coll += 1
          else if (r.type === 'IFS_START' && r.kind === 'EIFS') eifs += 1
        }
      }
      return { ok, coll, eifs, mbps: bits / seeds(10).length / (RUN_MS / 1000) / 1e6 }
    }
    const five = tally('5g')
    const two = tally('2g')
    const [m5, ok5, coll5, eifs5] = raw(EVERYWHERE,
      /吞吐均值 ([\d.]+) Mb\/s，路由器收下 ([\d\s]+) 帧，碰撞 ([\d\s]+) 次，EIFS 记录 (\d+) 条/,
      'the 5 GHz figures the lesson prints')
    same(m5, five.mbps, 'the 5 GHz mean')
    expect([val(ok5), val(coll5), val(eifs5)], 'the three counts behind it')
      .toEqual([five.ok, five.coll, five.eifs])
    const [m2, ok2, coll2, eifs2] = raw(EVERYWHERE,
      /均值 ([\d.]+) Mb\/s，收下 ([\d\s]+) 帧，碰撞降到 ([\d\s]+) 次，EIFS 记录 ([\d\s]+) 条/,
      'the 2.4 GHz figures')
    same(m2, two.mbps, 'the 2.4 GHz mean')
    expect([val(ok2), val(coll2), val(eifs2)], 'and its three counts')
      .toEqual([two.ok, two.coll, two.eifs])
    expect(val(eifs2), 'one EIFS for every frame the router took').toBe(two.ok)
    const [ratio] = raw(EVERYWHERE, /收下的帧数差 ([\d.]+) 倍/, 'the ratio of the two counts')
    same(ratio, two.ok / five.ok, 'the ratio the lesson prints')
  })

  it('the rate ladder, cell by cell, and the two rungs 6.5 dB buys', () => {
    const rows = tableWithHeading('分贝换来几级')
    expect(rows.length, 'the ladder still has its rows').toBeGreaterThan(3)
    const offset = Math.abs(LINK_EXTRA_LOSS_DB['2g' as keyof typeof LINK_EXTRA_LOSS_DB])
    for (const row of rows) {
      const [, lvl] = /−([\d.]+) dBm/.exec(row[0]) ?? []
      if (!lvl) continue
      const at5 = -val(lvl)
      const read = (cell: string): [number, number] => {
        const [, idx, mbps] = /MCS (\d+) · ([\d.]+) Mb\/s/.exec(cell)!
        expect(mcsRateMbps('he', val(idx)), `MCS ${idx}’s own rate`).toBe(val(mbps))
        return [val(idx), val(mbps)]
      }
      const [idx5] = read(row[1])
      const [idx2] = read(row[2])
      expect(idx5, `${at5} dBm on 5 GHz`).toBe(mcsForRssi('he', at5, undefined, 20))
      expect(idx2, `${at5} dBm plus the offset on 2.4 GHz`)
        .toBe(mcsForRssi('he', at5 + offset, undefined, 20))
      expect(idx2, 'and 2.4 GHz is never the lower rung').toBeGreaterThanOrEqual(idx5)
    }
  })

  it('the wide-channel arm: the floor it raises, the rungs it costs, and the points it loses', () => {
    // 「从 5 GHz 开到 160 兆赫，噪声地板跟着抬高 9.03 分贝…2.4 GHz 守在 40 兆赫上只抬 3.01 分贝」
    const [wideMhz, riseDb] = raw(EVERYWHERE,
      /开到 (\d+) 兆赫，噪声地板（noise floor）跟着抬高 ([\d.]+) 分贝/, 'the wide channel and its floor')
    const [capMhz, capRise] = raw(EVERYWHERE,
      /守在 (\d+) 兆赫上只抬 ([\d.]+) 分贝/, 'the capped channel and its floor')
    same(riseDb, noiseDbm(val(wideMhz)) - noiseDbm(20), `the floor at ${wideMhz} MHz over 20`)
    same(capRise, noiseDbm(val(capMhz)) - noiseDbm(20), `and at ${capMhz} MHz`)
    const capped = widthOf(link2gScenario('wide', '2g', { seed: 7 }).nodes[1], '2g')
    expect(val(capMhz), 'the cap is what `widthOf` gives 2.4 GHz').toBe(capped)
    // 「把它压到 MCS 9」 and 「一路爬到阶梯顶上的 MCS 13」
    /*
     * The rung is read off the run rather than recomputed: the lesson's own words are 「把它压到
     * MCS 9」 and 「一路爬到阶梯顶上的 MCS 13」, which is what the rate control selected, and the
     * selection takes the band offset and the negotiated width together.
     */
    const rungOf = (band: Band): number => {
      const rs = recordsOf('wide', band, 7, 50)
      const tx = ofType(rs, 'TX_START')
        .find((r) => r.node === vid(band, 'sta-1') && r.frame.kind === 'data')!
      return tx.frame.mcs!
    }
    const [pressed] = figs(EVERYWHERE, /把它压到 MCS (\d+)/, 'the rung the wide channel costs')
    const [top] = figs(EVERYWHERE, /爬到阶梯顶上的 MCS (\d+)/, 'and the rung the capped one keeps')
    expect(pressed, 'the rung 160 MHz leaves').toBe(rungOf('5g'))
    expect(top, 'the rung 40 MHz leaves').toBe(rungOf('2g'))
    expect(top, 'which is the top of this ladder').toBe(PHY_MODES.eht.sensDbm.length - 1)
    expect(top, 'and it really is above the wide channel’s').toBeGreaterThan(pressed)
  })

  it('the 40 MHz table, cell by cell, and the points it loses in spite of the higher rung', () => {
    const rows = tableWithHeading('反方向的砝码')
    expect(rows, 'the table still has its five rows').toHaveLength(5)
    const row = (starts: string): string[] => {
      const r = rows.find((x) => x[0].startsWith(starts))
      expect(r, `the row 「${starts}」 is gone`).toBeDefined()
      return r!
    }
    const seg = (band: Band) => {
      const rs = recordsOf('wide', band, 7, 50)
      const sta = vid(band, 'sta-1')
      const tx = ofType(rs, 'TX_START').filter((r) => r.node === sta && r.frame.kind === 'data')
      const starts = tx.map((r) => r.t)
      const gaps = starts.slice(1).map((t, i) => t - starts[i])
      return {
        width: tx[0].frame.widthMhz, mcs: tx[0].frame.mcs,
        data: tx[0].frame.txTimeNs, floor: Math.min(...gaps),
      }
    }
    const five = seg('5g')
    const two = seg('2g')
    const [w5, w2] = [row('协商到的信道带宽')[1], row('协商到的信道带宽')[2]]
      .map((c) => val(/(\d+) 兆赫/.exec(c)![1]))
    expect([w5, w2], 'the widths the two links negotiate').toEqual([five.width, two.width])
    const [m5, m2] = [row('选中的 MCS')[1], row('选中的 MCS')[2]].map(val)
    expect([m5, m2], 'the rungs they hold').toEqual([five.mcs, two.mcs])
    same(row('同一帧的数据 PPDU')[1].replace(' µs', ''), five.data / 1000, 'the 5 GHz PPDU')
    same(row('同一帧的数据 PPDU')[2].replace(' µs', ''), two.data / 1000, 'and the 2.4 GHz one')
    same(row('一次交换')[1].replace(' µs', ''), five.floor / 1000, 'the 5 GHz exchange')
    same(row('一次交换')[2].replace(' µs', ''), two.floor / 1000, 'and the 2.4 GHz one')
    // the two means over the twenty seeds the heading names, and the points between them
    const mean5 = mean(seeds(20).map((s) => throughputMbps('wide', '5g', s)))
    const mean2 = mean(seeds(20).map((s) => throughputMbps('wide', '2g', s)))
    same(row('吞吐均值')[1].replace(' Mb/s', ''), mean5, 'the 5 GHz mean over those seeds')
    same(row('吞吐均值')[2].replace(' Mb/s', ''), mean2, 'and the 2.4 GHz one')
    const [points] = raw(EVERYWHERE, /还是输 ([\d.]+) 个百分点/, 'the points the capped link loses')
    same(points, 100 * (1 - mean2 / mean5), 'the loss between the two means')
    expect(two.mcs!, 'while holding the higher rung').toBeGreaterThan(five.mcs!)
  })

  it('`deeper`: the two interframe figures EDCA would hide, and the two it points at instead', () => {
    const deep = (link2g.deeper ?? [])
      .map((b) => `${b.heading ?? ''}\n${'text' in b ? b.text : ''}`).join('\n')
    // 「这一课要对照的那个 28 对 34」: the two DIFS values, which is the lesson's own first table
    const [two, five] = figs(deep, /那个 (\d+) 对 (\d+) 就从记录里消失了/,
      '`deeper` on the pair EDCA would hide')
    expect([two * 1000, five * 1000], 'the DIFS of the two links')
      .toEqual([ERP_2G.difsNs, OFDM_5G.difsNs])
    // 「AC_BE 的 37 微秒与 AC_BK 的 73 微秒」: the AIFS those categories would use on 2.4 GHz
    const [be, bk] = figs(deep, /AC_BE 的 (\d+) 微秒与 AC_BK 的 (\d+) 微秒/,
      '`deeper` on the two AIFS it points at instead')
    const aifs = (name: string): number => {
      const ac = EDCA_PARAMS.find((p) => p.name === name)!
      return ERP_2G.sifsNs + ac.aifsn * ERP_2G.slotNs
    }
    expect([be * 1000, bk * 1000], 'the AIFS of those two categories on this link')
      .toEqual([aifs('BE'), aifs('BK')])
  })

  /**
   * **What the first pass left, and what is left after this one.** The sweep of the mop-up above
   * reported 27 of the 102, and they fall into four groups:
   *
   *  - **nine band names** (「都是在 5 GHz 上量的」, 「搬回 5 GHz」, 「5/6 GHz 为 0」 …): the fourth
   *    exemption class, for the reason in this block's own docblock.
   *  - **four widths and two caps** stated in shapes the reads above did not match, plus the
   *    offset and the signal extension each twice more. Those are read here, at every site.
   *  - **the ladder table's own levels.** −46.7 dBm is the desk link's measured level and is read
   *    as one; the other four rows (−60, −70, −75, −80) are round numbers a reader can hold in
   *    their head, and the rung PAIR at each of them is what the table is for — which the read
   *    above already checks. Editing −75 to −76 leaves both rungs where they are, so the figure
   *    is a reader-facing choice and not a measurement: the second exemption class.
   *  - **three counts** — the ACK's own octets, the twenty MSDUs of the burst, and the rung both
   *    links reach on the desk — each of which has an engine quantity, and is read against it.
   */
  it('the widths, the offset and the extension at every site, and the three counts', () => {
    const offset = Math.abs(LINK_EXTRA_LOSS_DB['2g' as keyof typeof LINK_EXTRA_LOSS_DB])
    // every 「N 兆赫」 is a width this engine has, and the two this lesson turns on are its own
    const wide = negotiatedWidth(
      link2gScenario('wide', '5g', { seed: 7 }).nodes[0],
      link2gScenario('wide', '5g', { seed: 7 }).nodes[1], '5g')
    const capped = widthOf(link2gScenario('wide', '2g', { seed: 7 }).nodes[1], '2g')
    const ladderWidth = 20
    for (const v of everyFig(/(\d+) 兆赫/g, 'a channel width', 6)) {
      expect([wide, capped, ladderWidth], `${v} 兆赫 is a width this lesson turns on`)
        .toContain(val(v))
    }
    expect(capped, 'and the cap really is below the width the other link gets').toBeLessThan(wide)
    // the offset, at the two sites the reads above did not match
    for (const v of everyFig(/path loss）小 ([\d.]+) 分贝|说出 ([\d.]+) 分贝的频段路损偏移/g,
      'the band offset, where `why` and `outcomes` state it', 2)) {
      same(v, offset, 'the offset this engine charges 2.4 GHz')
    }
    // the signal extension, likewise
    for (const v of everyFig(/末尾多挂 (\d+) 微秒|只付一次 (\d+) 微秒/g,
      'the signal extension, where `why` and `numbers` state it', 2)) {
      expect(val(v) * 1000, 'the extension 2.4 GHz pays').toBe(ERP_2G.signalExtNs)
    }
    // the ACK's own octets, and the MSDUs one burst carries
    for (const v of everyFig(/确认帧 PPDU（(\d+) 字节）/g, 'the answer’s own octets', 1)) {
      expect(val(v), 'the ACK this engine builds').toBe(ACK_BYTES)
    }
    const burst = ofType(recordsOf('burst', '5g', 7, 50), 'TX_START')
      .find((r) => r.node === 'sta-1' && r.frame.kind === 'data')!
    for (const v of everyFig(/一个装 (\d+) 个 MSDU|：(\d+) 个 MSDU 装进一个/g,
      'the MSDUs one burst carries', 2)) {
      expect(val(v), 'the subframes the engine aggregates').toBe(burst.frame.ampdu!.mpduCount)
    }
    // 「两边都跑到 MCS 11」: the rung the desk link reaches on both bands
    const desk = link2gScenario('single', '5g', { seed: 7 })
    const deskRssi = buildLinkTable(desk.nodes, desk.walls).get('sta-1')!.get('ap')!
    for (const v of everyFig(/两边都跑到 MCS (\d+)/g, 'the rung both links reach on the desk', 1)) {
      expect(val(v), 'the rung this level supports').toBe(mcsForRssi('he', deskRssi, undefined, 20))
      expect(val(v), 'and the offset does not change it')
        .toBe(mcsForRssi('he', deskRssi + offset, undefined, 20))
    }
    // 「−46.7 dBm（桌上）」: the first row of the ladder is the desk link's own level
    const [onDesk] = raw(EVERYWHERE, /−([\d.]+) dBm（桌上）/, 'the level the ladder starts from')
    same(`-${onDesk}`, deskRssi, 'the desk link’s own level')
  })
})
