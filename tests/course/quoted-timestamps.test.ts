import { it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import { RateControl } from '../../src/engine/rate'
import type { TLRecord } from '../../src/model/records'
import { nssOf } from '../../src/model/caps'
import { ppduTiming } from '../../src/engine/phy'

function run(id: string, untilNs: number): TLRecord[] {
  const lesson = LESSONS.find((l) => l.id === id)!
  const sim = new Simulation(lesson.scenario())
  return [...sim.runUntil(untilNs).records]
}

/**
 * One `width` variant with the laptop moved, **memoised**.
 *
 * Three `it`s below ask for the same scenes: the far-corner experiment runs each of the four
 * variants at (15, 7) and the airtime check runs three of them again at the same spot. The suite's
 * simulated work is bounded (tests/simCost.ts, `EVENT_CEILING`), and the engine is deterministic,
 * so the second ask is answered from the first rather than simulated again. Nothing about what is
 * measured changes.
 */
const movedRuns = new Map<string, TLRecord[]>()
function widthAt(variant: number, x: number, y: number): TLRecord[] {
  const key = `${variant}@${x},${y}`
  const hit = movedRuns.get(key)
  if (hit) return hit
  const l = LESSONS.find((x2) => x2.id === 'width')!
  const sc = l.variants![variant].scenario()
  sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x, y, z: 1 }
  const recs = [...new Simulation(sc).runUntil(200_000_000).records]
  movedRuns.set(key, recs)
  return recs
}

it('quoted lesson timestamps still hold', () => {
  const l3 = run('backoff', 400_000)
  expect(l3.find((x) => x.type === 'COLLISION')?.t).toBe(248_000)
  expect(l3.find((x) => x.type === 'ACK_TIMEOUT')?.t).toBe(293_000)

  const l4 = run('nav', 1_000_000)
  expect(l4.find((x) => x.type === 'BACKOFF_FREEZE' && x.node === 'sta-1' && x.t > 400_000)?.t).toBe(498_000)
  expect((l4.find((x) => x.type === 'NAV_SET' && x.node === 'sta-1' && x.t > 400_000) as { untilNs?: number })?.untilNs).toBe(790_000)
  expect(l4.find((x) => x.type === 'BACKOFF_RESUME' && x.node === 'sta-1' && x.t > 700_000)?.t).toBe(824_000)

  const l5 = run('hidden', 3_000_000)
  // A's data frame now runs slower after rate adaptation steps it down from
  // repeated hidden-node collisions (Task 5), so B's freeze-for-the-ACK and
  // resume land later than before.
  expect(l5.find((x) => x.type === 'BACKOFF_FREEZE' && x.node === 'sta-2' && x.t > 1_900_000)?.t).toBe(2_325_000)
  expect(l5.find((x) => x.type === 'BACKOFF_RESUME' && x.node === 'sta-2' && x.t > 1_900_000)?.t).toBe(2_387_000)

  const l6 = run('anomaly', 2_000_000)
  expect(l6.filter((x) => x.type === 'TX_START' && x.t === 0).length).toBe(2)
  expect(l6.find((x) => x.type === 'ACK_TIMEOUT' && x.node === 'sta-2')?.t).toBe(749_000)
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
  nss: number
  mcs: number
  mbps: number
  airtimeNs: number
  symbols: number
  /** PSDU_LENGTH: the A-MPDU padded with EOF subframes to fill the last symbol (§10.12.6). */
  psduBytes: number
}

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
  // 2026-11-11: every EHT PSDU is an A-MPDU (IEEE Std 802.11be-2024 §9.7.3), so the one 1530-octet
  // QoS MPDU goes out with a 4-octet MPDU delimiter: 1534 octets before EOF padding, which is what
  // the airtime is computed from. `frame.bytes` is now PSDU_LENGTH, padded to fill the last symbol
  // (§10.12.6), so it depends on the width and the streams. The airtimes did not move.
  expect(one(data.map((r) => r.frame.apepBytes)), `${q.label}: A-MPDU octets before padding`).toBe(1534)
  expect(one(data.map((r) => r.frame.bytes)), `${q.label}: PSDU_LENGTH`).toBe(q.psduBytes)
  expect(one(data.map((r) => r.frame.widthMhz)), `${q.label}: width`).toBe(q.widthMhz)
  expect(one(data.map((r) => r.frame.mcs)), `${q.label}: MCS`).toBe(q.mcs)
  expect(one(data.map((r) => r.frame.mbps)), `${q.label}: rate line`).toBe(q.mbps)
  expect(one(data.map((r) => r.frame.txTimeNs)), `${q.label}: airtime`).toBe(q.airtimeNs)
  // 2026-11-11 (W6): the airtime is 802.11be's TXTIME — the EHT preamble (with its EHT-LTFs), the
  // LDPC symbol count and the packet extension, rounded up to a whole microsecond (Eq 36-110) — so
  // the symbol count is read from that computation rather than from (airtime − preamble) / T_SYM.
  // 2026-11-11 (W6 merged with W7a): TXTIME is computed from APEP_LENGTH (1534, delimiter included),
  // and PSDU_LENGTH is what PLME-TXTIME.confirm returns for it (Eq 36-112 / 36-113).
  const pt = ppduTiming('eht', 1534, q.mcs, { widthMhz: q.widthMhz, nss: q.nss })
  expect(pt.totalNs, `${q.label}: TXTIME`).toBe(q.airtimeNs)
  expect(pt.nsym, `${q.label}: symbols`).toBe(q.symbols)
  expect(pt.psduLength, `${q.label}: PSDU_LENGTH by Eq 36-112/36-113`).toBe(q.psduBytes)
  // "The white ACK is identical in all four variants."
  const acks = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
    r.type === 'TX_START' && r.frame.kind === 'ack')
  expect(one(acks.map((r) => r.frame.txTimeNs)), `${q.label}: ACK airtime`).toBe(28_000)
}

it('`width` quotes the airtimes, symbol counts and MCS its own variants produce', () => {
  const l = LESSONS.find((x) => x.id === 'width')!
  const quotes: PhyQuote[] = [
    { label: '20 MHz', widthMhz: 20, nss: 1, mcs: 13, mbps: 172.1, airtimeNs: 137_000, symbols: 6, psduBytes: 1535 },
    { label: '40 MHz', widthMhz: 40, nss: 1, mcs: 13, mbps: 172.1, airtimeNs: 104_000, symbols: 3, psduBytes: 1618 },
    { label: '80 MHz', widthMhz: 80, nss: 1, mcs: 13, mbps: 172.1, airtimeNs: 87_000, symbols: 2, psduBytes: 1823 },
    // the 9 dB of extra noise a 160 MHz channel takes in is still affordable on this desk:
    // 48.8 dB of SNR against the 48.0 MCS 13 asks for, so the modulation holds
    { label: '160 MHz', widthMhz: 160, nss: 1, mcs: 13, mbps: 172.1, airtimeNs: 77_000, symbols: 1, psduBytes: 1843 },
  ]
  l.variants!.forEach((v, i) => checkVariant(v.scenario(), quotes[i]))
  // "Load opens the widest case, 160 MHz" — and Open in editor hands over that one.
  checkVariant(l.scenario(), quotes[3])
})

it('`streams` quotes the airtimes its own variants produce, and negotiates down', () => {
  const l = LESSONS.find((x) => x.id === 'streams')!
  const quotes: PhyQuote[] = [
    // 2026-11-11 (W6): each extra stream adds EHT-LTFs to the preamble (1, 2, 4 for 1, 2, 4 streams).
  // psduBytes (W6 merged): PSDU_LENGTH by Eq 36-113 — LDPC, so no tail bits, and EOF padding only up
  // to the a_init boundary of the last symbol — measured, not quoted by the lessons.
    { label: '1 stream', widthMhz: 20, nss: 1, mcs: 13, mbps: 172.1, airtimeNs: 137_000, symbols: 6, psduBytes: 1535 },
    { label: '2 streams', widthMhz: 20, nss: 2, mcs: 13, mbps: 172.1, airtimeNs: 112_000, symbols: 3, psduBytes: 1618 },
    { label: '4 streams', widthMhz: 20, nss: 4, mcs: 13, mbps: 172.1, airtimeNs: 108_000, symbols: 2, psduBytes: 1768 },
    // a four-stream router and a two-stream phone make a two-stream link
    { label: 'Router 4 · Phone 2', widthMhz: 20, nss: 2, mcs: 13, mbps: 172.1, airtimeNs: 112_000, symbols: 3, psduBytes: 1618 },
    // widest channel + most streams: still one symbol, but four EHT-LTFs: 91 µs, not the 77 µs of one stream
    { label: '160 MHz · 4 streams', widthMhz: 160, nss: 4, mcs: 13, mbps: 172.1, airtimeNs: 91_000, symbols: 1, psduBytes: 2458 },
  ]
  l.variants!.forEach((v, i) => checkVariant(v.scenario(), quotes[i]))
  checkVariant(l.scenario(), quotes[0])
  // the negotiated variant really is 4-on-the-router, 2-on-the-phone
  const mixed = l.variants![3].scenario()
  expect(nssOf(mixed.nodes.find((n) => n.id === 'ap')!)).toBe(4)
  expect(nssOf(mixed.nodes.find((n) => n.id === 'sta-1')!)).toBe(2)
})

it('`width`’s far-corner experiment breaks the two widest channels and only those', () => {
  const l = LESSONS.find((x) => x.id === 'width')!
  // "drag the laptop into the far corner of the living room, through the brick wall"
  const far = (i: number) => {
    const recs = widthAt(i, 15, 7)
    return {
      acks: recs.filter((r) => r.type === 'TX_START' && r.frame.kind === 'ack').length,
      drops: recs.filter((r) => r.type === 'DROP').length,
    }
  }
  // 20 and 40 MHz still deliver from that corner…
  for (const i of [0, 1]) expect(far(i).acks, `variant ${l.variants![i].label}`).toBeGreaterThan(50)
  // …80 and 160 MHz deliver nothing at all (2026-11-11, W6: the primary 20 MHz channel's share of
  // the PPDU falls below the −82 dBm preamble-detection level, so the router never starts to receive).
  for (const i of [2, 3]) {
    expect(far(i).acks, `variant ${l.variants![i].label} must be dead in the corner`).toBe(0)
    expect(far(i).drops).toBeGreaterThan(0)
  }
  // "20 MHz at 545.0 µs a frame, 40 MHz at 780.0, and 80 MHz … 409.0" (2026-11-11, W6 merged:
  // 802.11be's TXTIME with packet extension, rounded up to a whole µs, Eq 36-110, from the
  // 1534-octet APEP_LENGTH that includes the MPDU delimiter, §9.7.3).
  const airtime = (i: number) => {
    const recs = widthAt(i, 15, 7)
    const data = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.bytes > 1000)
    return new Set(data.map((r) => r.frame.txTimeNs))
  }
  expect([...airtime(0)]).toEqual([545_000])
  expect([...airtime(1)]).toEqual([780_000])
  expect([...airtime(2)]).toEqual([409_000])
})

/**
 * Lesson 15's "When wider is slower" paragraph and the first half of its second
 * experiment quote a second laptop position: seven and a half squares right of
 * the router and two down, (10.5, 6), just inside the living room. That claim is
 * far more fragile than the desk one — the RSSI band in which 160 MHz is genuinely
 * slower than 80 MHz while both still decode is only about 1 dB wide (-70.98 to
 * -69.97 dBm), and this position sits at -70.51, near its centre with ~0.5 dB to
 * either edge. A silent drift of half a decibel would turn the paragraph into a
 * lie, so the whole ladder is pinned, MCS included.
 */
it('`width`’s second experiment position really inverts 80 → 160 MHz, with every frame delivered', () => {
  const walk = (i: number) => {
    const recs = widthAt(i, 10.5, 6)
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

  // "427.0 µs at 20 MHz, 246.0 at 40, 182.0 at 80, and then back up to 240.0 at 160" (2026-11-11, W6
  // merged: the 20 MHz frame gains a symbol from W7a's 4-octet MPDU delimiter, §9.7.3)
  expect(w20.airtimeNs).toBe(427_000)
  expect(w40.airtimeNs).toBe(246_000)
  expect(w80.airtimeNs).toBe(182_000)
  expect(w160.airtimeNs).toBe(240_000)
  // the inversion itself, stated as the property rather than as four constants
  expect(w160.airtimeNs).toBeGreaterThan(w80.airtimeNs)
  // "Against 40 MHz the widest channel still wins, just barely"
  expect(w160.airtimeNs).toBeLessThan(w40.airtimeNs)

  // "two modulation steps at that spot, MCS 2 down to MCS 0" — the 2 dB rungs
  // in EHT_SENS let a single 3 dB width penalty skip straight over MCS 1.
  expect([w20.mcs, w40.mcs, w80.mcs, w160.mcs]).toEqual([3, 3, 2, 0])

  // "every width still delivers — no retries, no drops": this is what separates
  // this experiment from the far-corner one, where the wide channels go silent.
  for (const [name, r] of [['20', w20], ['40', w40], ['80', w80], ['160', w160]] as const) {
    expect(r.acks, `${name} MHz must be acknowledged`).toBeGreaterThan(300)
    expect(r.retries, `${name} MHz must not retry`).toBe(0)
    expect(r.drops, `${name} MHz must not drop`).toBe(0)
  }
  // "it still delivers everything, 240.0 µs a frame" (the lesson opens at 160 MHz)
  expect(w160.acks).toBeGreaterThan(450) // 489 measured 2026-11-11 after W6 (the frame is 240.0 µs, not 224.8)
})

/**
 * Lesson 17 (`mumimo`) quotes the first multi-user PPDU of each variant — both at 2604.0 µs: a
 * 116.0 µs OFDMA PPDU with all three phones and a 107.0 µs MU-MIMO PPDU with phones 2 and 3 —
 * plus the structural claim that MU-MIMO here never groups more than two, and where the trimmed
 * member turns up next. (2026-11-11, W6: the standard-first lesson no longer quotes the
 * "clean equal-payload" PPDUs, their per-member rates or the 1.4× ratio; with 802.11be's TXTIME —
 * EHT-SIG symbols, one EHT-LTF per stream, LDPC and packet extension — those figures moved, and
 * this file now guards what the lesson prints.)
 */
it('the scheduled-Wi-Fi lessons quote the OFDMA and MU-MIMO PPDUs its own variants produce', () => {
  const l = LESSONS.find((x) => x.id === 'mumimo')!
  type MuTx = Extract<TLRecord, { type: 'TX_START' }> & { frame: { muParts: NonNullable<Extract<TLRecord, { type: 'TX_START' }>['frame']['muParts']> } }
  /*
   * **One run per variant, memoised.** The MU-MIMO variant is asked for twice in this `it` —
   * once for its multi-user PPDUs and once, further down, for every downlink the access point
   * sends — and a 500 ms run of this house is the most expensive thing in the file. The suite's
   * simulated work is bounded (tests/simCost.ts), and the engine is deterministic, so the second
   * ask is answered from the first.
   */
  const muRuns = new Map<number, TLRecord[]>()
  const muRun = (i: number): TLRecord[] => {
    const hit = muRuns.get(i)
    if (hit) return hit
    const rs = [...new Simulation(l.variants![i].scenario()).runUntil(500_000_000).records]
    muRuns.set(i, rs)
    return rs
  }
  const muRecords = (i: number): MuTx[] => muRun(i)
    .filter((r): r is MuTx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.muParts !== undefined)

  const ofdma = muRecords(0)
  const mumimo = muRecords(1)

  // "the MU-MIMO group is never three" — every MU-MIMO PPDU in this house has
  // exactly two members; OFDMA reaches three.
  expect(new Set(mumimo.map((r) => r.frame.muParts.length))).toEqual(new Set([2]))
  expect(new Set(ofdma.map((r) => r.frame.muParts.length)).has(3)).toBe(true)

  // "2595.0 µs … 一个 116.0 µs 的 OFDMA 发送 … 发送长 107.0 µs" — the first multi-user PPDU of each
  // variant, at the same instant (2026-11-11, W6 merged: 802.11be's TXTIME with EHT-SIG, one EHT-LTF
  // per stream, LDPC and packet extension, Eq 36-110, over APEP_LENGTH; the AP on
  // dot11QAPEDCATable, W7b).
  expect([ofdma[0].t, ofdma[0].frame.txTimeNs, ofdma[0].frame.muParts.length]).toEqual([2_595_000, 116_000, 3])
  expect([mumimo[0].t, mumimo[0].frame.txTimeNs]).toEqual([2_595_000, 107_000])
  expect(mumimo[0].frame.muParts.map((p) => p.dst).sort()).toEqual(['sta-2', 'sta-3'])

  // "100（36%）… 172（62%）… 6（2%）" — where the
  // trimmed member actually turns up next. The lesson used to present this as a two-way
  // split; it is not exhaustive, and the third case is what this pins (fix round 2, I5).
  const allApData = muRun(1)
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
  // 2026-11-11: re-measured after W7a (DL MU acknowledged by TB BlockAcks, §26.5.2.3.4), after W7b
  // (the AP on dot11QAPEDCATable) and again with W6 merged (the TB PPDU per §26.5.2.3.4 with its
  // packet extension, PSDU_LENGTH per Eq 36-112/36-113): the lesson's table reads 100 (36%) /
  // 172 (62%) / 6 (2%) of 278 — the trimmed phone now mostly lands in the next pairing.
  expect(twoMember.length).toBe(278)
  expect(followedByTrimmedSu).toBe(100)
  expect(sweptIntoNextMu).toBe(172)
  expect(neither).toBe(6)
  // the three cases are exhaustive, and the percentages round to 36 / 62 / 2
  expect(followedByTrimmedSu + sweptIntoNextMu + neither).toBe(twoMember.length)
  const share3 = [followedByTrimmedSu, sweptIntoNextMu, neither].map((n) => Math.round((n / twoMember.length) * 100))
  expect(share3).toEqual([36, 62, 2])
})

/**
 * Lesson 17's "try this" tells the reader to add a fourth and a fifth phone. The engine caps a
 * multi-user group at four members (`muDsts.slice(0, 4)` in mac.ts), so OFDMA does NOT keep
 * absorbing them with ever-thinner slices: the group stops at four and no slice goes below a
 * quarter, while MU-MIMO stays at two however many phones there are (fix round 2, I1).
 */
it('the added-phones experiment caps the OFDMA group at four and MU-MIMO at two', () => {
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
 * `rate`, `rate-fallback` and `rate-cost` quote the far station's per-MCS airtime, its MCS 2
 * ceiling, the shape of its excursions below that ceiling over a 3 s run, and the near
 * station's unmoving MCS 11. The airtime tax below belongs to `rate-cost` since M9 was
 * re-paced; the scene is unchanged, so the assertions are too. Pinned here so a PHY or traffic
 * drift breaks this test, not a reader's trust in the prose; each lesson also holds its own
 * claims in its own test file.
 */
it('the rate lessons quote the far station\u2019s airtimes/excursions and the near station\u2019s unmoving ceiling', () => {
  const l = LESSONS.find((x) => x.id === 'rate')!
  const recs = [...new Simulation(l.scenario()).runUntil(3_000_000_000).records]
  const far = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
    r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')

  // "545.0 µs at its MCS 2 ceiling, 784.0 µs one step down at MCS 1 and 1,497.0 µs at MCS 0"
  // (2026-11-11, W6 merged: 802.11be's TXTIME with the packet extension, rounded up to a whole µs,
  // Eq 36-110, over the 1534-octet APEP_LENGTH that includes the MPDU delimiter, §9.7.3)
  const atMcs = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.txTimeNs
  expect(atMcs(2)).toBe(545_000)
  expect(atMcs(1)).toBe(784_000)
  expect(atMcs(0)).toBe(1_497_000)
  // "2.7 times the airtime at the bottom rung" (2.8 before the packet extension)
  expect(Math.round((atMcs(0) / atMcs(2)) * 10) / 10).toBe(2.7)

  // "The far station cannot use a rung above its ceiling however it tries \u2026 Distance and
  // the wall decided that" \u2014 it never exceeds MCS 2 under contention.
  expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(2)

  // "27 excursions below MCS 2 in three seconds, nine of which reach the bottom rung"
  // (2026-11-11, W6 merged)
  const mcss = far.map((r) => r.frame.mcs)
  const runs: [number, number][] = []
  let cur = mcss[0]
  let len = 0
  for (const m of mcss) {
    if (m === cur) len++
    else { runs.push([cur!, len]); cur = m; len = 1 }
  }
  runs.push([cur!, len])
  let excursions = 0
  let below = 0
  for (const m of mcss) {
    if (m !== 2) below++
    else if (below > 0) { excursions++; below = 0 }
  }
  if (below > 0) excursions++
  // 2026-11-11 (W6 merged), re-measured: 27 excursions, nine reaching the bottom rung, lasting
  // 10, 10, 10, 10, 14, 14, 23, 23 and 25 frames — `rate-fallback`'s lab 2 table
  expect(excursions).toBe(27)
  const zeroRuns = runs.filter(([m]) => m === 0).map(([, n]) => n)
  expect(zeroRuns.sort((a, b) => a - b)).toEqual([10, 10, 10, 10, 14, 14, 23, 23, 25])

  // "3,844 frames in three seconds, every one of them at its MCS 11 ceiling" \u2014 the near
  // station, which "wins every simultaneous start it takes part in".
  const near = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
    r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data')
  expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([11]))
  expect(near.length).toBe(3_844) // 2026-11-11 (W6 merged): `rate` and `rate-fallback` quote 3,844
  expect(recs.filter((r) => r.type === 'ACK_TIMEOUT' && r.node === 'sta-1')).toHaveLength(0)

  // the rungs table's rate line for the same 1,530 bytes: 25.8, 17.2 and 8.6 Mb/s.
  const rateLine = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.mbps!
  expect([rateLine(2), rateLine(1), rateLine(0)]).toEqual([25.8, 17.2, 8.6])
})

/**
 * The lesson this run belongs to used to teach a collision death spiral \u2014 a lower rate makes
 * frames longer, longer frames are exposed to collision for longer, so the rate spirals down.
 * Backoff freezes while the medium is busy (IEEE 802.11-2024 \u00a710.23.2.4, `onCcaBusy` in mac.ts),
 * so a longer frame gives no other station's counter extra time to expire, and the spiral is not
 * in the data.
 *
 * Note what a "loss" is here, and what it is not. This walk counts ONLY the attempts followed by
 * an ACK timeout, 254 of them: a real but partial view. `rate-fallback` counts every failure the
 * engine's `onFailure` fires on (254 timeouts + 83 late retries = 337) and reports a flat
 * 11.1 / 11.8 / 11.1 % per rung, which is what that lesson now says; the per-rung percentages
 * below are this subset's, not the lesson's. With the near station 40 dB stronger at the access
 * point, a same-slot tie is not a mutual collision: the access point decodes the near preamble
 * and only the far frame dies, so the run contains no COLLISION record at all.
 */
it('the rate lessons\u2019 per-attempt loss rates, the backoff freeze and the airtime tax', () => {
  const l = LESSONS.find((x) => x.id === 'rate')!
  const recs = [...new Simulation(l.scenario()).runUntil(3_000_000_000).records]
  type Tx = Extract<TLRecord, { type: 'TX_START' }>
  const far = recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
  const near = recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data')
  const timeouts = recs.filter((r) => r.type === 'ACK_TIMEOUT' && r.node === 'sta-2').map((r) => r.t)
  const lost = (t: Tx): boolean => {
    const end = t.t + t.frame.txTimeNs
    return timeouts.some((x) => x > end && x <= end + 50_000)
  }

  // "no reception at the access point ever failed" \u2014 hence no collision is drawn anywhere in this run
  expect(recs.filter((r) => r.type === 'COLLISION')).toHaveLength(0)
  expect(recs.filter((r) => r.type === 'RX_FAIL' && r.node === 'ap' && r.reason === 'collision')).toHaveLength(0)

  // the timeout-only subset, per rung — 2026-11-11 (W6 merged), re-measured: 2,130 attempts at the
  // MCS 2 ceiling of which 173 time out (8.1%), 566 at MCS 1 of which 46 do (8.1%), and 139 at MCS 0
  // of which 7 do (5.0%). The attempt counts are `rate-fallback`'s lab 2 table (whose failure column
  // also counts the losses that end without an ACK_TIMEOUT record).
  const perMcs = (mcs: number) => {
    const xs = far.filter((r) => r.frame.mcs === mcs)
    const c = xs.filter(lost).length
    return { n: xs.length, c, pct: Math.round((c / xs.length) * 1000) / 10 }
  }
  const m0 = perMcs(0), m1 = perMcs(1), m2 = perMcs(2)
  expect(m2).toEqual({ n: 2_130, c: 173, pct: 8.1 })
  expect(m1).toEqual({ n: 566, c: 46, pct: 8.1 })
  expect(m0).toEqual({ n: 139, c: 7, pct: 5 })
  expect(m0.c + m1.c + m2.c).toBe(timeouts.length) // 226: the attribution is exhaustive
  // the death-spiral direction (loss rising rung by rung as the rate falls) is not in the data.
  // 2026-11-11 (W6 merged): the ceiling and MCS 1 now tie at 8.1%, so the old "the middle rung loses
  // less than the ceiling" no longer holds; what the lessons claim is that the longest frame does not
  // fail more (`rate-fallback`, pooled over ten seeds in tests/course/rate-fallback.test.ts).
  expect(m0.pct).toBeLessThanOrEqual(m2.pct)
  expect(m0.pct > m1.pct && m1.pct > m2.pct).toBe(false)

  // "221 of the far station's 226 losses in this run start in the very same instant as a
  // near-station frame" \u2014 and the near station never detects that preamble (it was
  // transmitting), so it "counts straight through the far station's frame and starts a second
  // one inside it".
  const lostFrames = far.filter(lost)
  expect(lostFrames).toHaveLength(226) // 2026-11-11 (W6 merged): `rate`'s 226 timeouts
  const sameSlot = lostFrames.filter((f) => near.some((n) => n.t === f.t))
  expect(sameSlot).toHaveLength(221) // `rate`'s "221 fall on frames that start together"
  expect(sameSlot.every((f) => near.some((n) => n.t > f.t && n.t < f.t + f.frame.txTimeNs))).toBe(true)

  // "all 2,498 of the near station's freezes in this run come back at the value they went in
  // at" \u2014 the freeze rule itself, and the reason a longer frame widens nobody's window.
  type Bo = Extract<TLRecord, { type: 'BACKOFF_FREEZE' | 'BACKOFF_RESUME' }>
  const evs = recs.filter((r): r is Bo =>
    (r.type === 'BACKOFF_FREEZE' || r.type === 'BACKOFF_RESUME') && r.node === 'sta-1')
  const holds: { t: number; dur: number; same: boolean }[] = []
  for (let i = 0; i + 1 < evs.length; i++) {
    if (evs[i].type === 'BACKOFF_FREEZE' && evs[i + 1].type === 'BACKOFF_RESUME')
      holds.push({ t: evs[i].t, dur: evs[i + 1].t - evs[i].t, same: evs[i].value === evs[i + 1].value })
  }
  expect(holds.length).toBe(2_498) // 2026-11-11 (W6 merged): `rate-fallback` quotes 2,498
  expect(holds.every((h) => h.same)).toBe(true)

  // "held for 636.0 \u00b5s behind a ceiling frame, 875.0 \u00b5s behind an MCS-1 one and 1,600.0 \u00b5s
  // behind an MCS-0 one \u2026 964.0 \u00b5s longer" \u2014 the airtime the neighbour pays for each step down.
  // 2026-11-11 (W6 merged): 636.0, 875.0 and 1,600.0 µs (`rate-cost` lab 1) — the frame (Eq 36-110)
  // plus the near station's AIFS-less resumption; the difference is still 964.0
  const holdBehind = (mcs: number): number => {
    const spans = far.filter((r) => r.frame.mcs === mcs).map((r) => [r.t, r.t + r.frame.txTimeNs] as const)
    const hs = holds.filter((h) => spans.some(([a, b]) => h.t >= a && h.t <= b))
    expect(hs.length, `holds behind MCS ${mcs}`).toBeGreaterThan(50)
    expect(new Set(hs.map((h) => h.dur)).size, `one hold length behind MCS ${mcs}`).toBe(1)
    return hs[0].dur
  }
  expect(holdBehind(2)).toBe(636_000)
  expect(holdBehind(1)).toBe(875_000)
  expect(holdBehind(0)).toBe(1_600_000)
  expect(holdBehind(0) - holdBehind(2)).toBe(964_000)

  // "705 below-ceiling frames \u2026 24.9% of the frames it sends but 36.0% of the air \u2026 651.8 ms,
  // where the same 705 frames at MCS 2 would have taken 384.2 ms \u2026 267.6 ms \u2026 8.9% of the run"
  // (`rate-cost`, 2026-11-11 after W6)
  const air = (xs: Tx[]) => xs.reduce((a, r) => a + r.frame.txTimeNs, 0)
  const below = far.filter((r) => r.frame.mcs! < 2)
  const atMcsCeiling = far.find((r) => r.frame.mcs === 2)!.frame.txTimeNs
  expect(atMcsCeiling).toBe(545_000)
  // 2026-11-11 (W6 merged), `rate-cost` lab 2: 705 frames, 24.9% of them, 36.0% of the air, 651.8 ms
  // against 384.2 ms at the 545.0 µs ceiling frame, 267.6 ms more, 8.9% of the run
  const RUN_NS = 3_000_000_000
  expect(below.length).toBe(705)
  expect(Math.round((below.length / far.length) * 1000) / 10).toBe(24.9)
  expect(Math.round((air(below) / air(far)) * 1000) / 10).toBe(36)
  expect(Math.round(air(below) / 100_000) / 10).toBe(651.8)
  const wouldBe = below.length * atMcsCeiling
  expect(Math.round(wouldBe / 100_000) / 10).toBe(384.2)
  expect(Math.round((air(below) - wouldBe) / 100_000) / 10).toBe(267.6)
  expect(Math.round(((air(below) - wouldBe) / RUN_NS) * 1000) / 10).toBe(8.9)
})

/**
 * Lesson 18's "try this" tells the reader to move the far station closer. Half a metre changes
 * nothing at all (the run is frame-for-frame identical); two metres raises the ceiling. Both
 * halves of the bullet, and the third-uploader experiment, are pinned here.
 */
it('`rate-cost`\u2019s try-this really needs two metres, and a third uploader really floors the rate', () => {
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
  const d0 = closer(0), dHalf = closer(0.5), d2 = closer(2), d5 = closer(5)

  // "Half a metre does nothing at all \u2026 the run comes back frame for frame identical."
  expect(dHalf.trace).toBe(d0.trace)
  expect([dHalf.frames, dHalf.ceiling, dHalf.zero]).toEqual([d0.frames, d0.ceiling, d0.zero])

  // "the ceiling rises from MCS 2 to MCS 3, the bottom rung falls from 3.0% of its frames to
  // 0.3%, and it delivers 3,712 frames in the three seconds instead of 3,003" — 2026-11-11,
  // re-measured: from 8.9% to 0.3%, and 3,693 frames instead of 2,779 — and again with W6 merged:
  // "上限升到 MCS 3，三秒发出的帧从 2,835 增加到 3,596" (`rate-cost` lab 3); the bottom rung falls
  // from 4.9% of the frames to none.
  expect(d0.ceiling).toBe(2)
  expect(d2.ceiling).toBe(3)
  expect(d0.frames).toBe(2_835)
  expect(d2.frames).toBe(3_596)
  expect(d0.zeroPct).toBe(4.9)
  expect(d2.zeroPct).toBe(0)

  // Five metres: measured, and no longer quoted by a lesson since the standard-first rewrite.
  // Before W6 it read 0 frames at MCS 0, W6 alone gave 10, and with W6 merged it is 0 again: the
  // count is a property of one draw, pinned only so a change to it is seen.
  expect(d5.zero).toBe(0)

  // "26.3% of its frames with the newcomer beside the near station, and 36\u201342% at every other
  // spot tried" \u2014 a third saturated uploader, cloned from the near one.
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
  // 2026-11-11, re-measured: 30.7% beside the near station, and 32.1, 32.5 and 42.8% at the other
  // three spots — no longer "26.3% and 36–42%"; the lesson's sentence needs rewriting by its owner
  // 2026-11-11 (W7b, the AP on dot11QAPEDCATable, per-frame UP): the second spot is now 42.9%.
  // 2026-11-11 (W6 merged): 31.6% beside the near station, 37.7, 22.9 and 42.7% elsewhere — measured,
  // not quoted by a lesson.
  const beside = withThird(5.5, 4.3)
  expect(beside).toBe(31.6) // beside the near station
  const others = [withThird(9, 5), withThird(14, 6.5), withThird(3, 5)]
  expect(others).toEqual([37.7, 22.9, 42.7])
  // and every one of them is far worse than the two-station baseline: more than three times its 4.9%
  for (const p of [beside, ...others]) expect(p).toBeGreaterThan(d0.zeroPct * 3)
})

/**
 * Lesson 18's rule block now notes that every exchange reports an outcome, single-user or
 * multi-user (`onTxOutcome` is called from `resolveDlMu`'s per-member loop in mac.ts, in
 * addition to the two single-user call sites). Measured by counting what the rate controller
 * is actually told during lesson 17's OFDMA run (followups: symmetric MU downlink reporting).
 */
it('the rate lessons’ claim that multi-user PPDUs report an outcome to the rate controller', () => {
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

    // "169 multi-user PPDUs carrying 492 parts addressed to phones … 620 outcome reports for
    // those phones in total, 128 from ordinary single-user frames and 492 from multi-user
    // parts (597 successes, 23 failures)" — 2026-11-11, re-measured: 172 PPDUs, 496 parts, 646
    // reports, 150 single-user, 644 successes and 2 failures — and again 2026-11-11 (W7b, the AP on
    // dot11QAPEDCATable): 180 PPDUs, 517 parts, 679 reports, 162 single-user, 674 and 5 — and again
    // with W6 merged: 182 PPDUs (`mumimo`'s 182 OFDMA sends), 513 parts, 706 reports, 193 single-user,
    // 705 successes and 1 failure
    expect(muPpdus.length).toBe(182)
    expect(muParts.length).toBe(513)
    expect(su.length).toBe(193)
    expect(forPhones.length).toBe(706)
    // one report per single-user frame, and one per multi-user part addressed to a phone —
    // success or failure, symmetrically, which is what lets a rate used only inside
    // multi-user PPDUs adapt at all.
    expect(forPhones.length - su.length).toBe(muParts.length)
    expect(forPhones.filter((p) => p.ok).length).toBe(705)
    expect(forPhones.filter((p) => !p.ok).length).toBe(1)
  } finally {
    RateControl.prototype.onSuccess = okOrig
    RateControl.prototype.onFailure = failOrig
  }
})
