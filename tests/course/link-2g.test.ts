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
import { MODULES, lessonMinutes, trackOf } from '../../src/course/curriculum'
import { LESSONS, lessonIndex } from '../../src/course/lessons'
import { link2gScenario, longApartment, sc } from '../../src/course/wifiScenes'
import { brick, node } from '../../src/course/lessonKit'
import { Simulation, LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { CCA_PD_DBM, mcsForRssi, mcsRateMbps, noiseDbm } from '../../src/engine/phy'
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
    // and it is the last lesson of the Wi-Fi track, so 「next」 leaves Wi-Fi rather than re-entering it
    const wifi = LESSONS.filter((l) => trackOf(l) === 'wifi')
    expect(wifi[wifi.length - 1].id).toBe('link-2g')
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
