/**
 * Every empirical claim of "OFDMA downlink — one send, several phones",
 * measured against the lesson's own scenario.
 *
 * What is pinned here is what this lesson's own sentences say: the two rows of
 * the "one way and the other" table (the single-user frame and the multi-user
 * one, their openings, symbols, airtimes and answers), the symbol arithmetic of
 * the formula, the whole-run table with OFDMA on and off, the 40 µs saved
 * against the 8 µs handed back, the picture's claim that a television left out
 * of a group had nothing waiting for it, and the two experiments.
 *
 * `tests/course/lesson-claims.test.ts` keeps its own pin on this lesson (every
 * multi-user PPDU serves two televisions and their BlockAcks start together one
 * SIFS later); this file does not duplicate it. The lesson never had a `.body!`
 * site in any test.
 */
import { describe, it, expect } from 'vitest'
import { ofdmaDl, muPpduFields, MU_SYMBOLS } from '../../src/course/tier2/ofdma-dl'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { PHY_MODES, toneRatio } from '../../src/engine/phy'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
/** The window every number in this lesson is measured over. */
const RUN_NS = 300 * MS
const PHONES = ['sta-1', 'sta-2', 'sta-3']

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const muPpdus = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)
const suData = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts === undefined)
const airNs = (xs: Tx[]): number => xs.reduce((a, r) => a + r.frame.txTimeNs, 0)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
/** The lesson's scene with OFDMA switched off on the nodes named: the experiments. */
function without(...ids: string[]): TLRecord[] {
  const sc: Scenario = ofdmaDl.scenario()
  for (const n of sc.nodes) {
    if (ids.includes(n.id)) n.caps.features = { ...n.caps.features, ofdma: false }
  }
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

lessonShapeSuite(ofdmaDl, { runNs: RUN_NS })

describe('ofdma-dl · the lesson’s own scene', () => {
  it('is a Tier 2 lesson that needs the two lessons its words come from', () => {
    expect(MODULES[ofdmaDl.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(ofdmaDl.needs).toEqual(['width', 'txop'])
    expect(ofdmaDl.terms!.map((t) => t.term)).toEqual(['OFDMA', 'resource unit', 'RU', 'MU'])
  })

  it('is the same room it always was: one access point and three Wi-Fi 6 televisions', () => {
    const sc = ofdmaDl.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', ...PHONES])
    for (const id of PHONES) {
      const n = sc.nodes.find((x) => x.id === id)!
      expect(n.caps.generation).toBe('he')
      expect(n.profiles).toEqual(['video'])
    }
    expect(ofdmaDl.variants).toBeUndefined()
  })
})

describe('ofdma-dl · two video frames on the air, one way and the other', () => {
  const rs = runOf(ofdmaDl, undefined, RUN_NS)
  const mu = muPpdus(rs)
  const su = suData(rs)

  it('the "one at a time" row: 44 µs of opening, six symbols, 125.6 µs, a 28 µs ACK', () => {
    expect(su.length).toBeGreaterThan(500)
    expect(one(su.map((r) => r.frame.mode))).toBe('he')
    expect(one(su.map((r) => r.frame.txTimeNs))).toBe(125.6 * US)
    expect(PHY_MODES.he.preambleNs).toBe(44 * US)
    expect((125.6 * US - PHY_MODES.he.preambleNs) / PHY_MODES.he.symNs).toBe(6)
    const acks = txs(rs, (r) => r.frame.kind === 'ack')
    expect(acks.length).toBe(su.length)
    expect(one(acks.map((r) => r.frame.txTimeNs))).toBe(28 * US)
  })

  it('the "one MU PPDU" row: 48 µs of opening, twelve symbols, 211.2 µs, two 32 µs BlockAcks', () => {
    expect(mu.length).toBe(45)
    expect(one(mu.map((r) => r.frame.txTimeNs))).toBe(211.2 * US)
    expect(one(mu.map((r) => r.frame.muKind))).toBe('ofdma')
    // "the opening grows by the four microseconds that carry the map"
    const muPreambleNs = PHY_MODES.he.preambleNs + PHY_MODES.he.muExtraPreambleNs
    expect(muPreambleNs).toBe(48 * US)
    expect((211.2 * US - muPreambleNs) / PHY_MODES.he.symNs).toBe(12)
    // the answers: one BlockAck per member, all starting one SIFS after the send
    for (const m of mu) {
      const bas = txs(rs, (r) => r.frame.kind === 'ba' && r.t === m.t + m.frame.txTimeNs + 16 * US)
      expect(bas.length).toBe(m.frame.muParts!.length)
      expect(one(bas.map((r) => r.frame.txTimeNs))).toBe(32 * US)
    }
  })

  it('"two frames leave in 211.2 µs where one after the other they would need 251.2"', () => {
    expect(2 * 125.6 * US - 211.2 * US).toBe(40 * US)
    expect(2 * 125.6).toBe(251.2)
    // and the larger answers give 8 µs of that back
    expect(2 * 32 * US - 2 * 28 * US).toBe(8 * US)
  })

  it('the formula: half the sub-carriers, twice the symbols', () => {
    // "symbols = ⌈(16 + 8·bytes + 6) ÷ (bits per symbol × RU share)⌉"
    const ndbps = PHY_MODES.he.ndbps[11]
    const symbols = (bytes: number, share: number): number =>
      Math.ceil((16 + 8 * bytes + 6) / (ndbps * toneRatio('he', 20) * share))
    const suBytes = one(su.map((r) => r.frame.bytes))
    const muBytes = one(mu.flatMap((r) => r.frame.muParts!.map((p) => p.bytes)))
    expect(suBytes).toBe(1430)
    expect(muBytes).toBe(1434)
    expect(symbols(suBytes, 1)).toBe(6)
    expect(symbols(muBytes, 0.5)).toBe(12)
    // every member of every group really is on half the channel
    expect(one(mu.flatMap((r) => r.frame.muParts!.map((p) => p.ruFraction)))).toBe(0.5)
    expect(PHY_MODES.he.preambleNs + 6 * PHY_MODES.he.symNs).toBe(125.6 * US)
    expect(PHY_MODES.he.preambleNs + PHY_MODES.he.muExtraPreambleNs + 12 * PHY_MODES.he.symNs).toBe(211.2 * US)
  })

  it('a television left out of a group had nothing waiting for it at that instant', () => {
    // the picture's "The devices it did not take are not refused — there was simply nothing
    // in their queue to put in", measured against the access point's own queue records.
    const dstOf = new Map<number, string>()
    for (const r of rs) if (r.type === 'ENQUEUE' && r.node === 'ap') dstOf.set(r.msduId, r.dst)
    const pending = new Set<number>()
    let checked = 0
    for (const r of rs) {
      if (r.type === 'ENQUEUE' && r.node === 'ap') pending.add(r.msduId)
      if (r.type === 'DEQUEUE' && r.node === 'ap') pending.delete(r.msduId)
      if (r.type !== 'TX_START' || r.frame.kind !== 'data' || r.frame.muParts === undefined) continue
      const members = new Set(r.frame.muParts.map((p) => p.dst))
      for (const left of PHONES.filter((p) => !members.has(p))) {
        checked++
        expect([...pending].filter((id) => dstOf.get(id) === left).length, `${left} at ${r.t}`).toBe(0)
      }
    }
    expect(checked).toBe(45)
    // and the group is never the four the engine would allow, so the cap is not what bounds it
    expect(new Set(mu.map((r) => r.frame.muParts!.length))).toEqual(new Set([2]))
  })
})

describe('ofdma-dl · the figure of one MU PPDU', () => {
  // The `fields` diagram replaced the paragraph that narrated the preamble accounting
  // (re-pacing §4), so the boxes have to be the run's own send, box for box.
  const spec = muPpduFields()
  const rs = runOf(ofdmaDl, undefined, RUN_NS)

  it('the three boxes are the preamble, the per-user map and the members’ payload', () => {
    expect(spec.unit).toBe('µs')
    expect(spec.fields.map((f) => f.size)).toEqual([44, 4, 163.2])
    expect(PHY_MODES.he.preambleNs).toBe(44 * US)
    expect(PHY_MODES.he.muExtraPreambleNs).toBe(4 * US)
    expect(MU_SYMBOLS * PHY_MODES.he.symNs).toBe(163.2 * US)
  })

  it('and they add up to the length of every multi-user send of the run', () => {
    const sum = spec.fields.reduce((n, f) => n + f.size, 0)
    expect(Math.round(sum * 10) / 10).toBe(211.2)
    expect(spec.total).toBe('共 211.2 µs')
    expect(one(muPpdus(rs).map((r) => r.frame.txTimeNs))).toBe(sum * US)
    // the 12 symbols the payload box is drawn from are the members' own
    for (const r of muPpdus(rs)) {
      const opening = PHY_MODES.he.preambleNs + PHY_MODES.he.muExtraPreambleNs
      expect((r.frame.txTimeNs - opening) / PHY_MODES.he.symNs).toBe(MU_SYMBOLS)
    }
  })
})

describe('ofdma-dl · the procedure, run against every multi-user send there is', () => {
  const rs = runOf(ofdmaDl, undefined, RUN_NS)
  const mu = muPpdus(rs)
  const SIFS_NS = 16 * US

  it('step 2: the group is between two and four, and each member gets 1/n of the tones', () => {
    expect(mu.length).toBeGreaterThan(0)
    for (const r of mu) {
      const parts = r.frame.muParts!
      expect(parts.length).toBeGreaterThanOrEqual(2)
      expect(parts.length).toBeLessThanOrEqual(4)
      for (const p of parts) expect(p.ruFraction).toBe(1 / parts.length)
    }
  })

  it('steps 3 to 5: bits per symbol, the symbol count and the length, derived for every send', () => {
    // "1950 for these televisions", the bits one HE symbol carries at 20 MHz on one stream
    expect(PHY_MODES.he.ndbps[11]).toBe(1950)
    expect(PHY_MODES.he.muExtraPreambleNs).toBe(4 * US)
    for (const r of mu) {
      const parts = r.frame.muParts!
      const symbolsOf = (p: typeof parts[number]): number => {
        const bps = PHY_MODES.he.ndbps[p.mcs] * toneRatio('he', r.frame.widthMhz ?? 20) * (p.nss ?? 1) * p.ruFraction!
        return Math.ceil((16 + 8 * p.bytes + 6) / bps)
      }
      const longest = Math.max(...parts.map(symbolsOf))
      expect(r.frame.txTimeNs).toBe(
        PHY_MODES.he.preambleNs + PHY_MODES.he.muExtraPreambleNs + PHY_MODES.he.symNs * longest)
    }
    // the worked example's own row: 975 bits a symbol, 11,494 bits to carry, twelve symbols
    expect(PHY_MODES.he.ndbps[11] * 0.5).toBe(975)
    expect(16 + 8 * 1434 + 6).toBe(11_494)
    expect(Math.ceil(11_494 / 975)).toBe(12)
    expect(44 * US + 4 * US + 13.6 * US * 12).toBe(211.2 * US)
  })

  it('step 6: one 16 µs gap later every member answers, and every answer is 32 µs', () => {
    for (const r of mu) {
      const bas = txs(rs, (x) => x.frame.kind === 'ba' && x.t === r.t + r.frame.txTimeNs + SIFS_NS)
      expect(bas.map((x) => x.node).sort()).toEqual(r.frame.muParts!.map((p) => p.dst).sort())
      for (const b of bas) expect(b.frame.txTimeNs).toBe(32 * US)
    }
  })
})

describe('ofdma-dl · the whole run, with OFDMA and without', () => {
  const on = runOf(ofdmaDl, undefined, RUN_NS)
  const off = without('ap', ...PHONES)
  const delivered = (rs: TLRecord[]): number[] => PHONES.map((p) =>
    suData(rs).filter((r) => r.frame.dst === p).length
    + muPpdus(rs).flatMap((r) => r.frame.muParts!).filter((m) => m.dst === p).length)

  it('the router sends 1016 times with OFDMA and 1061 without, 45 of them carrying two', () => {
    const apOn = txs(on, (r) => r.node === 'ap' && r.frame.kind === 'data')
    const apOff = txs(off, (r) => r.node === 'ap' && r.frame.kind === 'data')
    expect(apOn.length).toBe(1016)
    expect(apOn.filter((r) => r.frame.muParts !== undefined).length).toBe(45)
    expect(apOff.length).toBe(1061)
    expect(apOff.filter((r) => r.frame.muParts !== undefined).length).toBe(0)
  })

  it('each television receives exactly the same frames either way: 352 / 355 / 354', () => {
    expect(delivered(on)).toEqual([352, 355, 354])
    expect(delivered(off)).toEqual([352, 355, 354])
  })

  it('"Film delivered to each, per second": 13.1 / 13.3 / 13.2 Mb/s, the same either way', () => {
    // one video frame is 1400 B of payload; the table's Mb/s is that over the 300 ms run
    const payload = new Set(suData(on).flatMap((r) => r.frame.msduBytes ?? []))
    expect(payload).toEqual(new Set([1400]))
    const mbps = (frames: number[]): number[] =>
      frames.map((n) => Math.round(((n * 1400 * 8) / (RUN_NS / 1000)) * 10) / 10)
    expect(mbps(delivered(on))).toEqual([13.1, 13.3, 13.2])
    expect(mbps(delivered(off))).toEqual([13.1, 13.3, 13.2])
  })

  it('the air is busy 161.5 ms of the 300 with OFDMA and 163.0 ms without — 1.44 ms given back', () => {
    const busyOn = airNs(txs(on))
    const busyOff = airNs(txs(off))
    expect(Math.round(busyOn / (MS / 10)) / 10).toBe(161.5)
    expect(Math.round(busyOff / (MS / 10)) / 10).toBe(163.0)
    // "Each pair saves 40 µs of opening and hands 8 µs of it back on the larger answers,
    //  and the 45 pairs of this run come to 1.44 ms"
    expect(busyOff - busyOn).toBe(45 * (40 * US - 8 * US))
    expect((busyOff - busyOn) / MS).toBe(1.44)
  })
})

describe('ofdma-dl · the two experiments', () => {
  it('turning OFDMA off on television 1 leaves the other two pairing 11 times', () => {
    const rs = without('sta-1')
    const mu = muPpdus(rs)
    expect(mu.length).toBe(11)
    expect(new Set(mu.flatMap((r) => r.frame.muParts!.map((p) => p.dst)))).toEqual(new Set(['sta-2', 'sta-3']))
    // "television 1 is served on its own from then on"
    expect(suData(rs).filter((r) => r.frame.dst === 'sta-1').length).toBeGreaterThan(300)
  })

  it('turning it off everywhere: 1061 single-user sends, the same frames, 1.44 ms more air', () => {
    const off = without('ap', ...PHONES)
    expect(muPpdus(off).length).toBe(0)
    expect(txs(off, (r) => r.node === 'ap' && r.frame.kind === 'data').length).toBe(1061)
    expect(airNs(txs(off)) - airNs(txs(runOf(ofdmaDl, undefined, RUN_NS)))).toBe(1.44 * MS)
  })
})
