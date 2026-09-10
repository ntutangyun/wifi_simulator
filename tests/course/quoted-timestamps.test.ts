import { it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
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
