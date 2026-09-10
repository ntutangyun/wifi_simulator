import { it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { RateControl } from '../../src/engine/rate'
import type { TLRecord } from '../../src/model/records'
import { nssOf } from '../../src/model/caps'

function run(id: string, untilNs: number): TLRecord[] {
  const lesson = LESSONS.find((l) => l.id === id)!
  const sim = new Simulation(lesson.scenario())
  return [...sim.runUntil(untilNs).records]
}

it('quoted lesson timestamps still hold', () => {
  const l3 = run('backoff', 400_000)
  expect(l3.find((x) => x.type === 'COLLISION')?.t).toBe(248_000)
  expect(l3.find((x) => x.type === 'ACK_TIMEOUT')?.t).toBe(293_000)

  const l4 = run('nav', 1_000_000)
  expect(l4.find((x) => x.type === 'BACKOFF_FREEZE' && x.node === 'sta-1' && x.t > 400_000)?.t).toBe(464_000)
  expect((l4.find((x) => x.type === 'NAV_SET' && x.node === 'sta-1' && x.t > 400_000) as { untilNs?: number })?.untilNs).toBe(756_000)
  expect(l4.find((x) => x.type === 'BACKOFF_RESUME' && x.node === 'sta-1' && x.t > 700_000)?.t).toBe(790_000)

  const l5 = run('hidden', 3_000_000)
  // A's data frame now runs slower after rate adaptation steps it down from
  // repeated hidden-node collisions (Task 5), so B's freeze-for-the-ACK and
  // resume land later than before.
  expect(l5.find((x) => x.type === 'BACKOFF_FREEZE' && x.node === 'sta-2' && x.t > 2_300_000)?.t).toBe(2_735_000)
  expect(l5.find((x) => x.type === 'BACKOFF_RESUME' && x.node === 'sta-2' && x.t > 2_400_000)?.t).toBe(2_797_000)

  const l6 = run('anomaly', 2_000_000)
  expect(l6.filter((x) => x.type === 'TX_START' && x.t === 0).length).toBe(2)
  expect(l6.find((x) => x.type === 'ACK_TIMEOUT' && x.node === 'sta-2')?.t).toBe(1_089_000)
})

/**
 * Module 4 prints airtimes, symbol counts, MCS indices and rate-line figures in
 * its prose. Each one below is quoted verbatim in lesson 15 or 16, so drift in
 * the PHY, the propagation model or the scenarios must fail here rather than in
 * a reader's face. Each value is asserted over EVERY data frame of the
 * run, not just the first: the lessons say "the frame", so all of them must agree.
 */
interface PhyQuote {
  label: string
  widthMhz: number
  mcs: number
  mbps: number
  airtimeNs: number
  symbols: number
}

const PREAMBLE_NS = 48_000
const SYM_NS = 13_600

function checkVariant(sc: ReturnType<(typeof LESSONS)[0]['scenario']>, q: PhyQuote): void {
  const recs = [...new Simulation(sc).runUntil(200_000_000).records]
  const data = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
    r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.bytes > 1000)
  expect(data.length, `${q.label}: data frames`).toBeGreaterThan(100)
  const one = (xs: unknown[]): unknown => {
    const s = new Set(xs.map((x) => JSON.stringify(x)))
    expect(s.size, `${q.label}: one distinct value, got ${[...s].join()}`).toBe(1)
    return xs[0]
  }
  expect(one(data.map((r) => r.frame.bytes)), `${q.label}: octets on the air`).toBe(1530)
  expect(one(data.map((r) => r.frame.widthMhz)), `${q.label}: width`).toBe(q.widthMhz)
  expect(one(data.map((r) => r.frame.mcs)), `${q.label}: MCS`).toBe(q.mcs)
  expect(one(data.map((r) => r.frame.mbps)), `${q.label}: rate line`).toBe(q.mbps)
  expect(one(data.map((r) => r.frame.txTimeNs)), `${q.label}: airtime`).toBe(q.airtimeNs)
  expect((q.airtimeNs - PREAMBLE_NS) / SYM_NS, `${q.label}: symbols`).toBe(q.symbols)
  // "The white ACK is identical in all four variants."
  const acks = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
    r.type === 'TX_START' && r.frame.kind === 'ack')
  expect(one(acks.map((r) => r.frame.txTimeNs)), `${q.label}: ACK airtime`).toBe(28_000)
}

it('lesson 15 quotes the airtimes, symbol counts and MCS its own variants produce', () => {
  const l = LESSONS.find((x) => x.id === 'width')!
  const quotes: PhyQuote[] = [
    { label: '20 MHz', widthMhz: 20, mcs: 13, mbps: 172.1, airtimeNs: 129_600, symbols: 6 },
    { label: '40 MHz', widthMhz: 40, mcs: 13, mbps: 172.1, airtimeNs: 88_800, symbols: 3 },
    { label: '80 MHz', widthMhz: 80, mcs: 13, mbps: 172.1, airtimeNs: 75_200, symbols: 2 },
    // the 9 dB a 160 MHz channel costs, arriving: MCS 13 → 12 at the same desk
    { label: '160 MHz', widthMhz: 160, mcs: 12, mbps: 154.9, airtimeNs: 61_600, symbols: 1 },
  ]
  l.variants!.forEach((v, i) => checkVariant(v.scenario(), quotes[i]))
  // "Load opens the widest case, 160 MHz" — and Open in editor hands over that one.
  checkVariant(l.scenario(), quotes[3])
})

it('lesson 16 quotes the airtimes its own variants produce, and negotiates down', () => {
  const l = LESSONS.find((x) => x.id === 'streams')!
  const quotes: PhyQuote[] = [
    { label: '1 stream', widthMhz: 20, mcs: 13, mbps: 172.1, airtimeNs: 129_600, symbols: 6 },
    { label: '2 streams', widthMhz: 20, mcs: 13, mbps: 172.1, airtimeNs: 88_800, symbols: 3 },
    { label: '4 streams', widthMhz: 20, mcs: 13, mbps: 172.1, airtimeNs: 75_200, symbols: 2 },
    // a four-stream router and a two-stream phone make a two-stream link
    { label: 'Router 4 · Phone 2', widthMhz: 20, mcs: 13, mbps: 172.1, airtimeNs: 88_800, symbols: 3 },
    // widest channel + most streams: still one symbol, so still lesson 15's 61.6 µs
    { label: '160 MHz · 4 streams', widthMhz: 160, mcs: 12, mbps: 154.9, airtimeNs: 61_600, symbols: 1 },
  ]
  l.variants!.forEach((v, i) => checkVariant(v.scenario(), quotes[i]))
  checkVariant(l.scenario(), quotes[0])
  // the negotiated variant really is 4-on-the-router, 2-on-the-phone
  const mixed = l.variants![3].scenario()
  expect(nssOf(mixed.nodes.find((n) => n.id === 'ap')!)).toBe(4)
  expect(nssOf(mixed.nodes.find((n) => n.id === 'sta-1')!)).toBe(2)
})

it('lesson 15’s far-corner experiment breaks the wide channels and only the wide channels', () => {
  const l = LESSONS.find((x) => x.id === 'width')!
  // "drag the laptop into the far corner of the living room, through the brick wall"
  const far = (i: number) => {
    const sc = l.variants![i].scenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x: 15, y: 7, z: 1 }
    const recs = [...new Simulation(sc).runUntil(200_000_000).records]
    return {
      acks: recs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'ack').length,
      drops: recs.filter((r) => r.type === 'DROP').length,
    }
  }
  // 20 and 40 MHz still deliver from that corner…
  expect(far(0).acks).toBeGreaterThan(50)
  expect(far(1).acks).toBeGreaterThan(50)
  // …80 and 160 MHz deliver nothing at all: "not one ACK comes back".
  for (const i of [2, 3]) {
    expect(far(i).acks, `variant ${l.variants![i].label.en} must be dead in the corner`).toBe(0)
    expect(far(i).drops).toBeGreaterThan(0)
  }
})

/**
 * Lesson 15's "When wider is slower" paragraph and the first half of its second
 * experiment quote a second laptop position: seven and a half squares right of
 * the router and two down, (10.5, 6), just inside the living room. That claim is
 * far more fragile than the desk one — the RSSI band in which 80 MHz is genuinely
 * slower than 40 MHz while both still decode is only about 1 dB wide (-70.98 to
 * -69.98 dBm), and this position sits at -70.51, near its centre with ~0.5 dB to
 * either edge. A silent drift of half a decibel would turn the paragraph into a
 * lie, so the whole ladder is pinned, MCS included.
 */
it('lesson 15’s second experiment position really inverts 40 → 80 MHz, with every frame delivered', () => {
  const l = LESSONS.find((x) => x.id === 'width')!
  const walk = (i: number) => {
    const sc = l.variants![i].scenario()
    sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x: 10.5, y: 6, z: 1 }
    const recs = [...new Simulation(sc).runUntil(200_000_000).records]
    const data = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.bytes > 1000)
    const airtimes = new Set(data.map((r) => r.frame.txTimeNs))
    const mcss = new Set(data.map((r) => r.frame.mcs))
    expect(airtimes.size, `variant ${i}: one airtime`).toBe(1)
    expect(mcss.size, `variant ${i}: one MCS`).toBe(1)
    return {
      airtimeNs: [...airtimes][0]!,
      mcs: [...mcss][0]!,
      acks: recs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'ack').length,
      retries: recs.filter((r) => r.type === 'RETRY').length,
      drops: recs.filter((r) => r.type === 'DROP').length,
    }
  }
  const [w20, w40, w80, w160] = [0, 1, 2, 3].map(walk)

  // "415.2 µs at 20 MHz, 292.8 at 40, and then back up to 401.6 at 80 … 224.8 µs"
  expect(w20.airtimeNs).toBe(415_200)
  expect(w40.airtimeNs).toBe(292_800)
  expect(w80.airtimeNs).toBe(401_600)
  expect(w160.airtimeNs).toBe(224_800)
  // the inversion itself, stated as the property rather than as four constants
  expect(w80.airtimeNs).toBeGreaterThan(w40.airtimeNs)

  // "two modulation steps at that spot, MCS 2 down to MCS 0" — the 2 dB rungs
  // in EHT_SENS (-79 → -77) let a single 3 dB width penalty skip two indices.
  expect([w20.mcs, w40.mcs, w80.mcs, w160.mcs]).toEqual([3, 2, 0, 0])

  // "every width still delivers — no retries, no drops": this is what separates
  // this experiment from the far-corner one, where the wide channels go silent.
  for (const [name, r] of [['20', w20], ['40', w40], ['80', w80], ['160', w160]] as const) {
    expect(r.acks, `${name} MHz must be acknowledged`).toBeGreaterThan(300)
    expect(r.retries, `${name} MHz must not retry`).toBe(0)
    expect(r.drops, `${name} MHz must not drop`).toBe(0)
  }
  // "it still delivers everything, 224.8 µs a frame" (the lesson opens at 160 MHz)
  expect(w160.acks).toBeGreaterThan(500)
})

/**
 * Lesson 17's table and its "the MU-MIMO group is never three" paragraph
 * quote one clean OFDMA PPDU (all three members carrying the same 4,308 B) and
 * one clean MU-MIMO PPDU (both survivors carrying the same 4,308 B), plus the
 * structural claim that MU-MIMO here never groups more than two, the derived
 * per-member rates, the 3-data-symbol / 1-data-symbol split behind the 92.8 vs
 * 65.6 µs figures (fix round 1, F2), and the measured share of trimmed members
 * that get their own single-user PPDU immediately after (fix round 1, F1).
 */
it('lesson 17 quotes the OFDMA and MU-MIMO PPDUs its own variants produce', () => {
  const l = LESSONS.find((x) => x.id === 'mumimo')!
  type MuTx = Extract<TLRecord, { type: 'TX_START' }> & { frame: { muParts: NonNullable<Extract<TLRecord, { type: 'TX_START' }>['frame']['muParts']> } }
  const muRecords = (v: NonNullable<(typeof l)['variants']>[number]): MuTx[] => {
    const recs = [...new Simulation(v.scenario()).runUntil(500_000_000).records]
    return recs.filter((r): r is MuTx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.muParts !== undefined)
  }

  const ofdma = muRecords(l.variants![0])
  const mumimo = muRecords(l.variants![1])

  // "the MU-MIMO group is never three" — every MU-MIMO PPDU in this house has
  // exactly two members; OFDMA reaches three.
  expect(new Set(mumimo.map((r) => r.frame.muParts.length))).toEqual(new Set([2]))
  expect(new Set(ofdma.map((r) => r.frame.muParts.length)).has(3)).toBe(true)

  // "92.8 µs … 12,924 B" — the first equal-payload 3-member OFDMA PPDU.
  const ofdmaClean = ofdma.find((r) => r.frame.muParts.length === 3 && new Set(r.frame.muParts.map((p) => p.bytes)).size === 1)!
  expect(ofdmaClean.t).toBe(5_638_200)
  expect(ofdmaClean.frame.txTimeNs).toBe(92_800)
  expect(ofdmaClean.frame.bytes).toBe(12_924)
  expect(ofdmaClean.frame.muParts.every((p) => p.bytes === 4_308)).toBe(true)

  // "65.6 µs … 8,616 B" — the first equal-payload 2-member MU-MIMO PPDU.
  const mumimoClean = mumimo.find((r) => new Set(r.frame.muParts.map((p) => p.bytes)).size === 1 && r.frame.muParts[0].bytes === 4_308)!
  expect(mumimoClean.t).toBe(5_591_800)
  expect(mumimoClean.frame.txTimeNs).toBe(65_600)
  expect(mumimoClean.frame.bytes).toBe(8_616)

  // "371.4 Mb/s … 525.4 Mb/s" — per-member rate = bytes×8 / PPDU duration.
  const ofdmaRate = (ofdmaClean.frame.muParts[0].bytes * 8) / (ofdmaClean.frame.txTimeNs / 1000)
  const mumimoRate = (mumimoClean.frame.muParts[0].bytes * 8) / (mumimoClean.frame.txTimeNs / 1000)
  expect(Math.round(ofdmaRate * 10) / 10).toBe(371.4)
  expect(Math.round(mumimoRate * 10) / 10).toBe(525.4)

  // "exactly 3 data symbols (40.8 µs) … exactly 1 (13.6 µs)" — the fixed 52 µs
  // preamble (48 µs EHT + 4 µs multi-user SIG) does not scale with the data.
  const MU_PREAMBLE_NS = 52_000
  const EHT_SYM_NS = 13_600
  expect((ofdmaClean.frame.txTimeNs - MU_PREAMBLE_NS) / EHT_SYM_NS).toBe(3)
  expect((mumimoClean.frame.txTimeNs - MU_PREAMBLE_NS) / EHT_SYM_NS).toBe(1)
  // "only about 1.4×, not 3×" end to end.
  expect(Math.round((ofdmaClean.frame.txTimeNs / mumimoClean.frame.txTimeNs) * 100) / 100).toBe(1.41)

  // "125 times (68%) … 45 times (24%) … and neither of those 14 times (8%)" — where the
  // trimmed member actually turns up next. The lesson used to present this as a two-way
  // split; it is not exhaustive, and the third case is what this pins (fix round 2, I5).
  const allApData = [...new Simulation(l.variants![1].scenario()).runUntil(500_000_000).records]
    .filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data')
  const twoMember = allApData.filter((r) => r.frame.muParts?.length === 2)
  let followedByTrimmedSu = 0, sweptIntoNextMu = 0, neither = 0
  for (const mu of twoMember) {
    const members = new Set(mu.frame.muParts!.map((p) => p.dst))
    const trimmed = ['sta-1', 'sta-2', 'sta-3'].find((s) => !members.has(s))!
    const i = allApData.indexOf(mu)
    const next = allApData[i + 1]
    if (next && next.frame.muParts === undefined && next.frame.dst === trimmed) { followedByTrimmedSu++; continue }
    // "swept up into whichever MU-MIMO pairing forms next": the next MU PPDU, whenever it comes
    const nextMu = allApData.slice(i + 1).find((r) => r.frame.muParts !== undefined)
    if (nextMu && nextMu.frame.muParts!.some((p) => p.dst === trimmed)) sweptIntoNextMu++
    else neither++
  }
  expect(twoMember.length).toBe(184)
  expect(followedByTrimmedSu).toBe(125)
  expect(sweptIntoNextMu).toBe(45)
  expect(neither).toBe(14)
  // the three cases are exhaustive, and the quoted percentages round to 68 / 24 / 8
  expect(followedByTrimmedSu + sweptIntoNextMu + neither).toBe(twoMember.length)
  const share3 = [followedByTrimmedSu, sweptIntoNextMu, neither].map((n) => Math.round((n / twoMember.length) * 100))
  expect(share3).toEqual([68, 24, 8])
})

/**
 * Lesson 17's "try this" tells the reader to add a fourth and a fifth phone. The engine caps a
 * multi-user group at four members (`muDsts.slice(0, 4)` in mac.ts), so OFDMA does NOT keep
 * absorbing them with ever-thinner slices: the group stops at four and no slice goes below a
 * quarter, while MU-MIMO stays at two however many phones there are (fix round 2, I1).
 */
it('lesson 17’s added-phones experiment caps the OFDMA group at four and MU-MIMO at two', () => {
  const l = LESSONS.find((x) => x.id === 'mumimo')!
  const withPhones = (variant: number, extra: number) => {
    const base = l.variants![variant].scenario()
    const sc = { ...base, nodes: [...base.nodes] }
    const tpl = sc.nodes.find((n) => n.id === 'sta-1')!
    const spots = [[4, 5.5], [6, 5.5]]
    for (let i = 0; i < extra; i++) {
      const c = JSON.parse(JSON.stringify(tpl)) as typeof tpl
      c.id = `sta-extra-${i}`
      c.name = `Phone ${4 + i}`
      c.pos = { x: spots[i][0], y: spots[i][1], z: 1 }
      sc.nodes.push(c)
    }
    const recs = [...new Simulation(sc).runUntil(500_000_000).records]
    const mu = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.muParts !== undefined)
    expect(mu.length, `variant ${variant} + ${extra}: some MU PPDUs`).toBeGreaterThan(50)
    return Math.max(...mu.map((r) => r.frame.muParts!.length))
  }
  // OFDMA: three phones reach three, a fourth reaches four — and a fifth still only four.
  expect(withPhones(0, 0)).toBe(3)
  expect(withPhones(0, 1)).toBe(4)
  expect(withPhones(0, 2)).toBe(4)
  // MU-MIMO: two, whatever you add.
  for (const extra of [0, 1, 2]) expect(withPhones(1, extra), `MU-MIMO + ${extra}`).toBe(2)
})

/**
 * Lesson 18's body and observe list quote the far station's per-MCS airtime,
 * its MCS 1 ceiling, the shape of its MCS-0 excursions over a 3 s run, and
 * the near station's distinct MCS set and its share of frames at the ceiling
 * (fix round 1, F3). Pinned here so a PHY or traffic drift breaks this test,
 * not a reader's trust in the prose.
 */
it('lesson 18 quotes the far station’s airtimes/excursions and the near station’s ceiling share', () => {
  const l = LESSONS.find((x) => x.id === 'rate')!
  const recs = [...new Simulation(l.scenario()).runUntil(3_000_000_000).records]
  const far = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
    r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')

  // "768.8 µs at MCS 1 and 1,476.0 µs at MCS 0"
  const atMcs = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.txTimeNs
  expect(atMcs(1)).toBe(768_800)
  expect(atMcs(0)).toBe(1_476_000)

  // "here MCS 1, decided purely by distance and the wall" — the far
  // station's signal-strength ceiling: it never exceeds MCS 1 under contention.
  expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(1)

  // "thirteen times … more than half … exactly ten frames … up to 41"
  const mcss = far.map((r) => r.frame.mcs)
  const runs: number[] = []
  let cur = mcss[0]
  let len = 0
  for (const m of mcss) {
    if (m === cur) len++
    else { runs.push(cur === 0 ? len : -1); cur = m; len = 1 }
  }
  runs.push(cur === 0 ? len : -1)
  const zeroRuns = runs.filter((n) => n >= 0)
  expect(zeroRuns.length).toBe(13)
  expect(zeroRuns.filter((n) => n === 10).length).toBeGreaterThan(zeroRuns.length / 2)
  expect(Math.max(...zeroRuns)).toBe(41)

  // "distinct MCS {9, 10, 11}" and "spends almost the whole run at its
  // ceiling" (~88%) — the near station.
  const near = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
    r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data')
  const nearMcss = near.map((r) => r.frame.mcs)
  expect(new Set(nearMcss)).toEqual(new Set([9, 10, 11]))
  const atCeiling = nearMcss.filter((m) => m === 11).length
  expect(near.length).toBe(2_513)
  expect(atCeiling).toBe(2_210)
  expect(Math.round((atCeiling / near.length) * 1000) / 1000).toBe(0.879)

  // "17.2 Mb/s becomes 8.6 Mb/s" — the rate line for the same 1,530 octets.
  const rateLine = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.mbps!
  expect(rateLine(1)).toBe(17.2)
  expect(rateLine(0)).toBe(8.6)
})

/**
 * Lesson 18 used to teach a collision death spiral — a lower rate makes frames longer, longer
 * frames are exposed to collision for longer, so the rate spirals down. Backoff freezes while
 * the medium is busy (IEEE 802.11-2024 §10.23.2.4, `onCcaBusy` in mac.ts), so a longer frame
 * gives no other station's counter extra time to expire, and the measurement says the opposite
 * of the spiral: the long MCS-0 frames collide slightly LESS often per attempt. The corrected
 * lesson quotes these numbers, so they are pinned here (fix round 2, B1/B2).
 */
it('lesson 18’s per-attempt collision rates, the backoff freeze and the airtime tax', () => {
  const l = LESSONS.find((x) => x.id === 'rate')!
  const recs = [...new Simulation(l.scenario()).runUntil(3_000_000_000).records]
  type Tx = Extract<TLRecord, { type: 'TX_START' }>
  const far = recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
  const collisions = recs.filter((r): r is Extract<TLRecord, { type: 'COLLISION' }> =>
    r.type === 'COLLISION' && r.nodes.includes('sta-2'))
  const collided = (t: Tx): boolean => collisions.some((c) => c.t >= t.t && c.t <= t.t + t.frame.txTimeNs)

  // "2,276 attempts at MCS 1, of which 259 collide — 11.4% — and 222 attempts at MCS 0, of
  // which 19 collide: 8.6%". Every collision event involving the far station is attributed to
  // exactly one of its attempts, so the two counts must add up to the event total.
  const perMcs = (mcs: number) => {
    const xs = far.filter((r) => r.frame.mcs === mcs)
    const c = xs.filter(collided).length
    return { n: xs.length, c, pct: Math.round((c / xs.length) * 1000) / 10 }
  }
  const m0 = perMcs(0), m1 = perMcs(1)
  expect(m1).toEqual({ n: 2_276, c: 259, pct: 11.4 })
  expect(m0).toEqual({ n: 222, c: 19, pct: 8.6 })
  expect(m0.c + m1.c).toBe(collisions.length) // 278: the attribution is exhaustive
  // the death-spiral direction is simply not in the data
  expect(m0.pct).toBeLessThan(m1.pct)

  // "attempts drawn from CW 15 collide 11.8% of the time (261 of 2,217), attempts drawn from
  // the doubled CW 31 only 5.7% (15 of 264)" — the per-attempt rate follows the contention
  // window, not the airtime of the frame that follows.
  const seq = recs.filter((r) => (r.type === 'BACKOFF_DRAW' && r.node === 'sta-2')
    || (r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data'))
  const byCw = new Map<number, { n: number; c: number }>()
  let lastCw: number | null = null
  for (const e of seq) {
    if (e.type === 'BACKOFF_DRAW') { lastCw = e.cw; continue }
    if (lastCw === null) continue // the very first attempt: both stations fire at t = 0
    const b = byCw.get(lastCw) ?? { n: 0, c: 0 }
    b.n++
    if (collided(e as Tx)) b.c++
    byCw.set(lastCw, b)
  }
  const cw15 = byCw.get(15)!, cw31 = byCw.get(31)!
  expect(cw15).toEqual({ n: 2_217, c: 261 })
  expect(cw31).toEqual({ n: 264, c: 15 })
  expect(Math.round((cw15.c / cw15.n) * 1000) / 10).toBe(11.8)
  expect(Math.round((cw31.c / cw31.n) * 1000) / 10).toBe(5.7)

  // "all 2,218 of the near station's freezes in this run come back at the value they went in
  // at" — the freeze rule itself, and the reason a longer frame widens nobody's window.
  type Bo = Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }>
  const evs = recs.filter((r): r is Bo =>
    (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === 'sta-1')
  const holds: { t: number; dur: number; same: boolean }[] = []
  for (let i = 0; i + 1 < evs.length; i++) {
    if (evs[i].type === 'BACKOFF_FREEZE' && evs[i + 1].type === 'BACKOFF_RESUME')
      holds.push({ t: evs[i].t, dur: evs[i + 1].t - evs[i].t, same: evs[i].value === evs[i + 1].value })
  }
  expect(holds.length).toBe(2_218)
  expect(holds.every((h) => h.same)).toBe(true)

  // "held for 859.8 µs behind an MCS-1 frame and 1,579.0 µs behind an MCS-0 one … 719.2 µs
  // longer" — the airtime the neighbour pays for each step down.
  const holdBehind = (mcs: number): number => {
    const spans = far.filter((r) => r.frame.mcs === mcs).map((r) => [r.t, r.t + r.frame.txTimeNs] as const)
    const hs = holds.filter((h) => spans.some(([a, b]) => h.t >= a && h.t <= b))
    expect(hs.length, `holds behind MCS ${mcs}`).toBeGreaterThan(100)
    expect(new Set(hs.map((h) => h.dur)).size, `one hold length behind MCS ${mcs}`).toBe(1)
    return hs[0].dur
  }
  expect(holdBehind(1)).toBe(859_800)
  expect(holdBehind(0)).toBe(1_579_000)
  expect(holdBehind(0) - holdBehind(1)).toBe(719_200)

  // "8.9% of the frames it sends but 15.8% of the air … 327.7 ms, where the same 222 frames at
  // MCS 1 would have taken 170.7 ms … 157.0 ms of extra channel time … 5.2% of all the air"
  const air = (xs: Tx[]) => xs.reduce((a, r) => a + r.frame.txTimeNs, 0)
  const f0 = far.filter((r) => r.frame.mcs === 0)
  const RUN_NS = 3_000_000_000
  expect(Math.round((f0.length / far.length) * 1000) / 10).toBe(8.9)
  expect(Math.round((air(f0) / air(far)) * 1000) / 10).toBe(15.8)
  expect(Math.round(air(f0) / 100_000) / 10).toBe(327.7)
  const wouldBe = f0.length * 768_800
  expect(Math.round(wouldBe / 100_000) / 10).toBe(170.7)
  expect(Math.round((air(f0) - wouldBe) / 100_000) / 10).toBe(157.0)
  expect(Math.round(((air(f0) - wouldBe) / RUN_NS) * 1000) / 10).toBe(5.2)
})

/**
 * Lesson 18's "try this" used to say moving the far station one metre closer raises its ceiling.
 * It does not: a metre does not cross a modulation threshold and the run is frame-for-frame
 * identical, so a reader who ran the experiment saw nothing move. Two metres is the smallest move
 * that does anything. Both halves of the bullet are pinned here (fix round 2, residual).
 */
it('lesson 18’s try-this really needs two metres, and a third uploader really floors the rate', () => {
  const l = LESSONS.find((x) => x.id === 'rate')!
  const RUN = 3_000_000_000
  type Tx = Extract<TLRecord, { type: 'TX_START' }>
  const base = l.scenario()
  const ap = base.nodes.find((n) => n.id === 'ap')!.pos
  const far0 = base.nodes.find((n) => n.id === 'sta-2')!.pos
  const dx = ap.x - far0.x, dy = ap.y - far0.y, len = Math.hypot(dx, dy)

  /** The far station's frames after moving it `d` metres straight toward the AP. */
  const closer = (d: number) => {
    const sc = l.scenario()
    const n = sc.nodes.find((x) => x.id === 'sta-2')!
    n.pos = { x: far0.x + (dx / len) * d, y: far0.y + (dy / len) * d, z: n.pos.z }
    const recs = [...new Simulation(sc).runUntil(RUN).records]
    const far = recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
    const mcss = far.map((r) => r.frame.mcs!)
    const zero = mcss.filter((m) => m === 0).length
    return {
      frames: far.length, ceiling: Math.max(...mcss), zero,
      zeroPct: Math.round((zero / far.length) * 1000) / 10,
      trace: JSON.stringify(recs.map((r) => (r.type === 'TX_START' ? [r.t, r.node, r.frame.mcs, r.frame.txTimeNs] : null)).filter(Boolean)),
    }
  }
  const d0 = closer(0), d1 = closer(1), d2 = closer(2), d4 = closer(4)

  // "One metre does nothing at all … the run comes back frame for frame identical."
  expect(d1.trace).toBe(d0.trace)
  expect([d1.frames, d1.ceiling, d1.zero]).toEqual([d0.frames, d0.ceiling, d0.zero])

  // "the ceiling rises from MCS 1 to MCS 2, the bottom rung falls from 8.9% of its frames to
  // 3.4%, and it delivers 3,226 frames in the three seconds instead of 2,498"
  expect(d0.ceiling).toBe(1)
  expect(d2.ceiling).toBe(2)
  expect(d0.frames).toBe(2_498)
  expect(d2.frames).toBe(3_226)
  expect(d0.zeroPct).toBe(8.9)
  expect(d2.zeroPct).toBe(3.4)

  // "At four metres MCS 0 never occurs at all."
  expect(d4.ceiling).toBe(3)
  expect(d4.zero).toBe(0)

  // "51.4% of its frames with the newcomer beside the near station, and 43–56% at every other
  // spot tried" — a third saturated uploader, cloned from the near one.
  const withThird = (x: number, y: number) => {
    const sc = l.scenario()
    const tpl = sc.nodes.find((n) => n.id === 'sta-1')!
    const c = JSON.parse(JSON.stringify(tpl)) as typeof tpl
    c.id = 'sta-3'
    c.name = 'Third uploader'
    c.pos = { x, y, z: 1 }
    sc.nodes.push(c)
    const far = [...new Simulation(sc).runUntil(RUN).records]
      .filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
    const zero = far.filter((r) => r.frame.mcs === 0).length
    return Math.round((zero / far.length) * 1000) / 10
  }
  expect(withThird(5.5, 4.3)).toBe(51.4) // beside the near station
  const others = [withThird(9, 5), withThird(14, 6.5), withThird(3, 5)]
  for (const p of others) {
    expect(p, `third uploader: ${p}% at MCS 0`).toBeGreaterThanOrEqual(43)
    expect(p, `third uploader: ${p}% at MCS 0`).toBeLessThanOrEqual(56)
  }
  // and every one of them is far worse than the two-station baseline
  for (const p of [51.4, ...others]) expect(p).toBeGreaterThan(d0.zeroPct * 4)
})

/**
 * Lesson 18's rule block now notes that every exchange reports an outcome, single-user or
 * multi-user (`onTxOutcome` is called from `resolveDlMu`'s per-member loop in mac.ts, in
 * addition to the two single-user call sites). Measured by counting what the rate controller
 * is actually told during lesson 17's OFDMA run (followups: symmetric MU downlink reporting).
 */
it('lesson 18’s claim that multi-user PPDUs report an outcome to the rate controller', () => {
  const l = LESSONS.find((x) => x.id === 'mumimo')!
  const PHONES = new Set(['sta-1', 'sta-2', 'sta-3'])
  const reports: { peer: string; ok: boolean }[] = []
  const okOrig = RateControl.prototype.onSuccess, failOrig = RateControl.prototype.onFailure
  RateControl.prototype.onSuccess = function (peer: string) { reports.push({ peer, ok: true }); return okOrig.call(this, peer) }
  RateControl.prototype.onFailure = function (peer: string) { reports.push({ peer, ok: false }); return failOrig.call(this, peer) }
  try {
    const recs = [...new Simulation(l.variants![0].scenario()).runUntil(500_000_000).records]
    const apData = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data')
    const su = apData.filter((r) => r.frame.muParts === undefined && PHONES.has(r.frame.dst!))
    const muPpdus = apData.filter((r) => r.frame.muParts !== undefined)
    const muParts = muPpdus.flatMap((r) => r.frame.muParts!).filter((p) => PHONES.has(p.dst))
    const forPhones = reports.filter((p) => PHONES.has(p.peer))

    // "172 multi-user PPDUs carrying 507 parts addressed to phones … 637 outcome reports for
    // those phones in total, 130 from ordinary single-user frames and 507 from multi-user
    // parts (577 successes, 60 failures)"
    expect(muPpdus.length).toBe(172)
    expect(muParts.length).toBe(507)
    expect(su.length).toBe(130)
    expect(forPhones.length).toBe(637)
    // one report per single-user frame, and one per multi-user part addressed to a phone —
    // success or failure, symmetrically, which is what lets a rate used only inside
    // multi-user PPDUs adapt at all.
    expect(forPhones.length - su.length).toBe(muParts.length)
    expect(forPhones.filter((p) => p.ok).length).toBe(577)
    expect(forPhones.filter((p) => !p.ok).length).toBe(60)
  } finally {
    RateControl.prototype.onSuccess = okOrig
    RateControl.prototype.onFailure = failOrig
  }
})
