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
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ofdmaDl, muPpduFields, MU_SYMBOLS } from '../../src/course/tier2/ofdma-dl'
import { lessonChars, lessonMinutes } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { PHY_MODES, SIFS_NS, toneRatio } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { RU26_PER_20MHZ, RU26_TONES, selBinWidthMhz, selBins, selMemberBins } from '../../src/engine/selectivity'

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
/**
 * The lesson's scene with OFDMA switched off on the nodes named: the experiments.
 *
 * **Memoised, because the suite's simulated work is bounded** (tests/simCost.ts): four `it`s of
 * this file ask for the same two variants, and an unmemoised helper ran each of them again.
 */
const offRuns = new Map<string, TLRecord[]>()
function without(...ids: string[]): TLRecord[] {
  const key = [...ids].sort().join(',')
  const hit = offRuns.get(key)
  if (hit) return hit
  const sc: Scenario = ofdmaDl.scenario()
  for (const n of sc.nodes) {
    if (ids.includes(n.id)) n.caps.features = { ...n.caps.features, ofdma: false }
  }
  const rs = [...new Simulation(sc).runUntil(RUN_NS).records]
  offRuns.set(key, rs)
  return rs
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

  /**
   * **The worked table's last row, bound to the fact two assertions up.** It used to read
   * `2 × 32 µs`, and every other cell in that column is an arithmetic expression
   * (`1950 × 0.5 = 975`, `44 + 4 + 13.6 × 12 = 211.2 µs`), so in that position `2 × 32` could
   * only be read as 64 µs — and a reader adding the column up would get `211.2 + 16 + 64`,
   * which deletes the entire point of the lesson: the two answers do not add, they are side by
   * side in frequency. The lesson says so correctly in three other places (`:83` the timing
   * figure, `:104` the steps, `:147` the observe line); this row was the one that did not.
   *
   * So the row is now pinned against what the records say rather than left as unguarded prose:
   * the two BlockAcks start at the same instant, each is 32 µs, and the time that passes is one
   * of them — not their sum.
   */
  it('the worked table says 32 µs, not 2 × 32: the two answers are parallel, not summed', () => {
    const row = (ofdmaDl.numbers!
      .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
      .find((b) => b.heading?.includes('照着步骤走一遍'))!)
      .rows.find((r) => r[0].includes('确认是'))!
    const first = mu[0]
    const bas = txs(rs, (x) => x.frame.kind === 'ba' && x.t === first.t + first.frame.txTimeNs + SIFS_NS)
    // two of them, at one instant, each 32 µs: the cell may name that airtime and no multiple
    expect(bas.length).toBe(2)
    expect(new Set(bas.map((b) => b.t)).size).toBe(1)
    expect(new Set(bas.map((b) => b.frame.txTimeNs))).toEqual(new Set([32 * US]))
    expect(row[1]).toContain(`${(bas[0].frame.txTimeNs / US).toFixed(0)} µs`)
    expect(row[1]).not.toContain('2 ×')
    expect(row[1]).not.toContain('64')
    // and the cell has to say why it is not a multiple, or the next editor puts the 2 back
    expect(row[1]).toContain('不是相加')
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

/**
 * **Slice 4b landed, so this lesson's `limits` entry states what the engine now does.** A
 * multi-user member reads the bins of its OWN share: the channel's bin count times its
 * `ruFraction`, truncated to whole bins (`selMemberBins`), starting where the members ahead of
 * it ended (`selBinStart`). 4a's overestimate — the whole channel's bins for every member — is
 * gone, and so is the sentence that promised a later slice would remove it.
 *
 * What is still out of scope is the UNEVEN allocation: `mac.ts` only ever divides evenly, so
 * the bin the truncation drops belongs to nobody, where a real scheduler would hand it to
 * another member or absorb it in a multi-RU allocation such as 52+26.
 *
 * **The instruments, because the limit prints two figures.** 9 bins at 20 MHz and 4 of them per
 * member are `selBins`/`selMemberBins`, asserted below against the same functions the prose
 * interpolates — so neither can drift from the other. And the engine really does hand THIS
 * lesson's members those 4 bins: measured over every multi-user reception of one 150 ms round of
 * this lesson's own scene with `fading` + `selectivity` added, which is the condition the limit
 * opens with (the shipped scene has neither section, which the last test here still pins).
 */
describe('ofdma-dl · a member reads its own share’s bins (slice 4b landed)', () => {
  /*
   * Selected by what it says, not by where it sits (review of 2026-10-03, finding 5): Task 7 and
   * slice 4b both still add to this array, and a last-index lookup would silently start grading a
   * different entry. The whole `kinds` column is asserted alongside it, the way
   * tests/course/uwb-rcm-validity.test.ts does, so an insertion is visible here rather than
   * absorbed.
   */
  const found = ofdmaDl.limits.filter((l) => l.text.includes('selCombine'))
  const lim = found[0]

  /** This lesson's own scene with the two sections the limit names, and nothing else changed. */
  const binned = (): TLRecord[] => [...new Simulation({
    ...ofdmaDl.scenario(),
    fading: { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' },
    selectivity: {},
  }).runUntil(150 * MS).records]

  it('is the one limit about the bin count, and the lesson declares eight', () => {
    expect(found).toHaveLength(1)
    // Six since the solicitation warning moved out of `sources` and into `limits`, where a
    // reader reads a warning as one; seven since the `deeper` counts got a limit saying they
    // are one run's (course-fix-queue, 2026-10-03/04). The whole column is asserted so an
    // insertion is visible here rather than absorbed.
    // Eight since the guard-interval slice added the one about the fixed 12-symbol MU PPDU.
    expect(ofdmaDl.limits).toHaveLength(8)
    expect(ofdmaDl.limits.map((l) => l.kind)).toEqual([
      'out-of-scope',
      'model-value', 'model-value', 'model-value',
      'unmodelled', 'unmodelled', 'unmodelled', 'model-value',
    ])
  })

  /**
   * **Where the `deeper` counts come from, declared as a model value rather than left reading
   * like a general result.**
   *
   * 30 pairs misclassified one way and 34 the other are this run's integers: three identical
   * televisions, one arrival period, one seed. 41 and 45 are too. What is NOT a property of the
   * run is the identity — the per-frame criterion's count equals the number of multi-user sends
   * — because that is the same event counted twice, and the test above pins it in that form
   * (`toBe(apData.filter(mu).length)`) rather than as the literal 45.
   *
   * The direction the entry gives is the grouping condition's own monotonicity (two queues
   * non-empty at one instant), and it says in so many words that the lesson measured no figure
   * for it. A `limits` entry is the right place for a direction without a number; the prose is
   * not.
   */
  it('declares that the `deeper` counts are one run of one scene, and what survives a reseed', () => {
    const one_run = ofdmaDl.limits.filter((l) => l.text.includes('同一个种子'))
    expect(one_run, 'the counts are printed with no provenance limit').toHaveLength(1)
    expect(one_run[0].kind).toBe('model-value')
    const t = one_run[0].text
    // the figures it covers, named rather than gestured at
    for (const n of ['30 对', '34 对', '41 对', '45 对', '747 µs']) {
      expect(t, `the limit never names ${n}`).toContain(n)
    }
    // the thing a reseed does not move, and why
    expect(t).toContain('永远等于装着两台的发送次数')
    expect(t).toContain('同一件事数两遍')
    // the direction, and the admission that no figure was measured for it
    expect(t).toContain('更容易变大')
    expect(t).toContain('本课一个数也没有量过')
    // …and it must not promise the ratio holds elsewhere
    expect(t).toContain('不是「任何房子里都是 4.4 %」')
  })

  /**
   * **The solicitation the engine does not model, and the only half of it that is useful: which
   * way it leans — which is opposite on the standard's two paths.**
   *
   * It used to be a line of `sources`, where a reader reads provenance rather than a warning,
   * and it named neither direction. §26.5.2.2.4 puts the two paths side by side: the TRS Control
   * subfield rides in an A-Control of a frame that was going out anyway (a few bytes, so the
   * engine's shortcut is nearly exact there), while a Trigger frame is a whole extra frame that
   * §26.5.2.2.3 additionally pads (neither of which the engine pays, so OFDMA looks better than
   * it should against that path). Two more things are skipped entirely: a station may legitimately
   * not answer (§26.5.2.3.2 exists for that case) while this engine's two BlockAcks are
   * unconditional, and what comes back is an ordinary BlockAck rather than the HE TB PPDU whose
   * TXVECTOR §26.5.2.3.3/.4 specify.
   */
  it('declares the solicitation it does not model, in `limits`, with both directions', () => {
    const sol = ofdmaDl.limits.filter((l) => l.text.includes('§26.5.2.2.4'))
    expect(sol, 'the solicitation warning is not a limit').toHaveLength(1)
    expect(sol[0].kind).toBe('unmodelled')
    for (const s of ['TRS Control', 'Trigger 帧', '§26.5.2.2.3', '§26.5.2.3.2', '§26.5.2.3.3/.4']) {
      expect(sol[0].text, `the limit never names ${s}`).toContain(s)
    }
    // the two directions, which is the half that was missing
    expect(sol[0].text).toContain('几乎是精确的')
    expect(sol[0].text).toContain('显得比它该有的样子更好')
    // …and `sources` keeps the provenance without carrying the warning
    const src = ofdmaDl.sources!.join('\n')
    expect(src).toContain('§26.5.2.2')
    expect(src).toContain('代价写在 limits 里')
    expect(src).not.toContain('按同样的空口时间计费')
  })

  it('is a model-value limit, and no longer promises a later slice will fix the bin count', () => {
    // `model-value` since Task 6 (design §7.4): nothing in the entry is out of the model's
    // validity any more — what is left is two CHOSEN values, the equal split (`frac = 1/n`) and
    // the truncation to whole bins, plus the leftover bin they imply. The scenario class this
    // used to declare out of scope (a member credited with the whole channel's bins) stopped
    // existing when slice 4b landed, and 6a took the sentence out.
    expect(lim.kind).toBe('model-value')
    expect(lim.text).toContain('selCombine')
    expect(lim.text).toContain(`${selBinWidthMhz()} MHz 一格`)
    // what the engine does now: the member's own share, truncated, placed after the members ahead
    expect(lim.text).toContain('读到的是它自己那一片的格数')
    expect(lim.text).toContain('截到整数格')
    expect(lim.text).toContain('起始格由排在它前面各成员的格数之和给出')
    // 4a's three retired claims, each one a sentence this file used to require
    expect(lim.text).not.toContain('拿到的是整条信道的格数')
    expect(lim.text).not.toContain('并不问')
    expect(lim.text).not.toContain('高估')
    expect(lim.text).not.toContain('切片 4b')
    /*
     * **And it still carries no `until` — Task 6 declined the one design §7.4 asked for, and
     * this is the record of why.** `until` renders as 「（这一条在《…》里会被解除）」
     * (`ui/i18n.ts`'s `limitUntil`), so it is a promise that the named lesson LIFTS the
     * simplification — which is what the field's own doc comment says too. `ru-diversity` lifts
     * neither of the two this entry is now made of: its own `limits` re-declare the equal split
     * (「成员数的倒数，再截到整数格」) and the leftover bin (「在引擎里就是不存在」) verbatim.
     * It measures what the thin share COSTS; it does not remove it.
     *
     * **2026-10-05 (slice 4e landed; this paragraph used to describe the world before it).**
     * The census Task 6c measured — ten `until` uses pointing at seven lessons, three of them
     * lifting nothing — has been acted on, and the count is now EIGHT. `until` was narrowed to
     * `kind: 'out-of-scope'` and a `seeAlso` field added for "that lesson goes deeper but does
     * not lift it". The derivation needs no new field: of `LimitKind`'s four values only
     * `out-of-scope` names a class of SCENARIO, the other three describe the ENGINE, and every
     * lesson runs the same engine — so an `until` on one of those three cannot be met at all.
     * `anomaly`'s two and `mcs-ladder`'s engine half became `seeAlso`; `anomaly`'s TXOP limit
     * and `width`'s flat-channel limit turned out to be kept promises whose `kind` was wrong,
     * and were re-kinded. `mcs-ladder`'s and `width`'s were compound and were split rather than
     * deleted, so neither lost a promise that was in fact kept.
     *
     * Three things in `tests/course/limits.test.ts` now hold what this comment used to assert on
     * its own: criterion A (an `until` only ever on `out-of-scope`), criterion B (the eight sites
     * frozen in a table whose fourth column is the axis that opens each one, so an eleventh
     * promise cannot be added quietly), and the `seeAlso` rules including mutual exclusion with
     * `until`. **What is still NOT tested is whether a given promise is true** — B pins that
     * someone judged it, not that they judged it right.
     *
     * The navigation either pointer would buy here is nil anyway, which is why this entry takes
     * neither: `ru-diversity` is the very next id in `COURSE_ORDER` and lists `ofdma-dl` in
     * `needs`, so a reader is already being sent there.
     */
    expect(lim.until).toBeUndefined()
    expect(lim.seeAlso, 'the next lesson by id, already in `needs`: no pointer earns its keep').toBeUndefined()
  })

  it('prints both bin figures off the engine’s own functions rather than typing them', () => {
    // 9 bins per 20 MHz, and 9 26-tone RUs per 20 MHz: one bin IS one 26-tone resource unit.
    expect(selBins(20)).toBe(RU26_PER_20MHZ)
    expect(selMemberBins(20, 1 / 2)).toBe(4)
    expect(lim.text).toContain(`${selBins(20)} 格里的 ${selMemberBins(20, 1 / 2)} 格`)
    expect(lim.text).toContain('26 音调资源单元恰好就是一格')
    // the truncation is the standard's tone table, and the bin it drops is nobody's
    expect(lim.text).toContain('截到整数不是凑整')
    expect(lim.text).toContain('不属于任何成员')
    // what is still out of scope: the even split, named by the constant that makes it even
    expect(lim.text).toContain('frac = 1 / 成员数')
    // and position buys no physics while the bins are independent draws
    expect(lim.text).toContain('彼此独立的抽样')
  })

  it('and the engine hands this scene’s members 4 of 9, with one bin left to nobody', () => {
    const sels = ofType(binned(), 'WIFI_SEL')
    const members = sels.filter((s) => s.ruFraction !== undefined)
    expect(members.length, 'no multi-user reception to read').toBeGreaterThan(20)
    for (const m of members) {
      expect(m.widthMhz).toBe(20)
      expect(m.ruFraction).toBe(1 / 2)
      expect(m.bins).toBe(selMemberBins(20, 1 / 2))
    }
    // two consecutive runs, bins 0-3 and 4-7, so bin 8 is claimed by no one
    expect(new Set(members.map((m) => m.binStart))).toEqual(new Set([0, 4]))
    expect(selBins(20) - Math.max(...members.map((m) => m.binStart + m.bins))).toBe(1)
    // while a single-user PPDU is still read across the whole channel
    const whole = sels.filter((s) => s.ruFraction === undefined)
    expect(whole.length).toBeGreaterThan(members.length)
    for (const w of whole) expect(w.bins).toBe(selBins(20))
  })

  it('and this lesson’s own scene does not turn the feature on', () => {
    expect(ofdmaDl.scenario().selectivity).toBeUndefined()
  })
})

/**
 * **Why only 45 of 1016 sends carry two televisions** — the question the lesson's `deeper`
 * answers beside 「分组是见机行事的，而机会在队列里，不在电台里」, and the one a reader asks the
 * moment they read that row.
 *
 * The grouping window is the gap between a frame landing in the AP's queue and the AP's next
 * transmission, because `buildMuParts` looks at the queue at exactly that instant (mac.ts:587).
 * Measured over this run's 1061 downlink MSDUs, keyed by `msduId` so no frame is matched to the
 * wrong arrival: median **9.6 µs**, 506 of them out inside one microsecond, the longest wait
 * **185.2 µs** — one exchange, never more. Each television's next frame is 747–947 µs away
 * (`scheduleVideo`, traffic.ts), so a second television joins the group only when its own frame
 * lands inside that window.
 *
 * **The ruler that makes this look impossible, pinned from the wrong side too.** The obvious
 * measurement — how long an MSDU sits in the queue, `DEQUEUE − ENQUEUE` — cannot be the window:
 * an MSDU stays in the queue until its ACK removes it (model/view.ts says so in those words), so
 * its floor is the frame's own airtime plus SIFS plus the ACK, 125.6 + 16 + 28 = 169.6 µs, which
 * is asserted below. Read that way the window looks like ~184 µs, 37.1 % of consecutive
 * cross-television arrivals fall inside it, and the 4.4 % of sends that actually carry two looks
 * ten times too small. It is the instrument that is wrong, not the engine — and the air being
 * busy 161.5 ms of the 300 ms does not widen the window either, because what it is busy with is
 * almost always the AP's own previous exchange.
 */
describe('ofdma-dl · why the chance to group is rare', () => {
  const rs = runOf(ofdmaDl, undefined, RUN_NS)
  const enqs = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap')
  const byId = new Map(enqs.map((e) => [e.msduId, e]))
  const apData = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'data')

  /** Every downlink MSDU's arrival-to-transmission gap, in ns, ascending. */
  const windows = (): number[] => {
    const out: number[] = []
    for (const t of apData) {
      const ids = t.frame.muParts
        ? t.frame.muParts.flatMap((p) => p.msduIds ?? [])
        : [t.frame.msduId!]
      for (const id of ids) {
        const e = byId.get(id)
        expect(e, `MSDU ${id} was sent with no ENQUEUE`).toBeDefined()
        out.push(t.t - e!.t)
      }
    }
    return out.sort((a, b) => a - b)
  }

  it('empties the queue within 9.6 µs of a frame arriving, and 185.2 µs at the very worst', () => {
    const w = windows()
    expect(w.length).toBe(1061)
    expect(w[Math.floor(w.length / 2)]).toBe(9628)
    expect(w[w.length - 1]).toBe(185_170)
    expect(w.filter((x) => x <= 1 * US).length).toBe(506)
    // half of them are gone inside ten microseconds: the AP is the only station with data
    expect(w.filter((x) => x <= 10 * US).length / w.length).toBeCloseTo(0.5, 2)
  })

  /**
   * **The 145.3 µs the text names, which is the window's ninth decile and nothing else.**
   *
   * It had no assertion anywhere in the repo until now — `145` matched exactly one site in
   * `src/` and none in `tests/`, and the enumeration below listed the other eight figures of
   * that paragraph and skipped this one. It also read as "the tail is 145 µs long", two
   * sentences after the same paragraph says the longest wait is 185.2 µs; it is a quantile, so
   * the text now says which one and this test pins it as one.
   *
   * Measured here rather than copied: p90 = 145 340 ns, with 106 of the 1061 windows above it.
   */
  it('names the 145.3 µs as the window-s ninth decile, and it is one', () => {
    const w = windows()
    const p90 = w[Math.floor(w.length * 0.9)]
    expect(p90).toBe(145_340)
    // a decile, not a length: a tenth of the frames are past it, and the maximum is elsewhere
    expect(w.filter((x) => x > p90).length).toBe(106)
    expect(w.filter((x) => x > p90).length / w.length).toBeLessThan(0.105)
    expect(p90).toBeLessThan(w[w.length - 1])
    const t = ofdmaDl.deeper!.map((b) => JSON.stringify(b)).join('\n')
    expect(t).toContain(`${(p90 / US).toFixed(1)} µs`)
    expect(t).toContain('上十分位')
    // the old wording, which read as a duration rather than a quantile
    expect(t).not.toContain('145 µs 的那条尾巴')
  })

  it('and the two counts that explain 45: 4.4 % of sends against 3.9 % of close arrivals', () => {
    const arrivals = enqs.map((e) => ({ t: e.t, dst: e.dst })).sort((a, b) => a.t - b.t)
    let close = 0, cross = 0, within184 = 0
    for (let i = 1; i < arrivals.length; i++) {
      if (arrivals[i].dst === arrivals[i - 1].dst) continue
      cross++
      const gap = arrivals[i].t - arrivals[i - 1].t
      if (gap < 14 * US) close++
      if (gap < 184 * US) within184++
    }
    expect([close, cross]).toEqual([41, 1058])
    expect((close / cross * 100).toFixed(1)).toBe('3.9')
    const mu = apData.filter((r) => r.frame.muParts !== undefined)
    expect((mu.length / apData.length * 100).toFixed(1)).toBe('4.4')
    // the wrong ruler's answer, pinned so the lesson's "ten times too big" is a measurement
    expect((within184 / cross * 100).toFixed(1)).toBe('37.1')
    // both denominators are printed, so a reader can check either percentage and not just one
    const t = ofdmaDl.deeper!.map((b) => JSON.stringify(b)).join('\n')
    expect(t).toContain('1058')
    expect(t).toContain('1016')
  })

  /**
   * **The exact criterion the fixed 14 µs threshold was only a proxy for.**
   *
   * Judge each arrival against *its own* window — did the next cross-television frame land
   * before this one was transmitted? — and the count is **45**, the engine's own number of
   * multi-user sends, pair for pair. So the explanation does not rest on a proxy at all, and
   * the proxy's standing is stated rather than assumed: it nets four pairs low (41 against 45)
   * while misclassifying sixty-odd — 30 pairs it counts whose first frame was already gone
   * (half of all frames leave inside a microsecond), and 34 it drops whose first frame was
   * waiting out an exchange and whose window therefore ran into the 145 µs decile above. Its
   * agreement is partly cancellation, which is why the lesson leads with the per-frame count
   * and calls the threshold a check on the order of magnitude.
   *
   * The 14 µs stays a measurement parameter and gets no constant in `src/`: the engine reads no
   * such number, and giving it one would put a figure in the model that no model uses. What the
   * text owed was where it came from, and it now says so — the order of magnitude of the
   * window's own median.
   */
  it('reproduces the engine-s 45 exactly when each frame is judged by its own window', () => {
    const arrivals = enqs.map((e) => ({ t: e.t, dst: e.dst, id: e.msduId })).sort((a, b) => a.t - b.t)
    const txAt = new Map<number, number>()
    for (const t of apData) {
      const ids = t.frame.muParts ? t.frame.muParts.flatMap((q) => q.msduIds ?? []) : [t.frame.msduId!]
      for (const id of ids) txAt.set(id, t.t)
    }
    let perFrame = 0, falsePos = 0, falseNeg = 0
    for (let i = 1; i < arrivals.length; i++) {
      const a = arrivals[i - 1], b = arrivals[i]
      if (a.dst === b.dst) continue
      const out = txAt.get(a.id)
      const groupable = out !== undefined && b.t < out
      const underThreshold = b.t - a.t < 14 * US
      if (groupable) perFrame++
      if (underThreshold && !groupable) falsePos++
      if (!underThreshold && groupable) falseNeg++
    }
    // pair for pair with the engine's own grouping decision
    expect(perFrame).toBe(apData.filter((r) => r.frame.muParts !== undefined).length)
    expect(perFrame).toBe(45)
    expect([falsePos, falseNeg]).toEqual([30, 34])
    const t = ofdmaDl.deeper!.map((b) => JSON.stringify(b)).join('\n')
    for (const n of ['45 对', '41 对', '30 对', '34 对', '一对不差']) {
      expect(t, `the explanation never names ${n}`).toContain(n)
    }
    // and the threshold's provenance, which is the one thing the text owed
    expect(t).toContain('按窗口中位数 9.6 µs 的量级取 14 µs')
    expect(t).toContain('引擎里没有这个数')
  })

  it('pins the floor that makes the queue-residence time the wrong ruler', () => {
    const deqs = ofType(rs, 'DEQUEUE').filter((r) => r.node === 'ap')
    const held: number[] = deqs.map((d) => d.t - byId.get(d.msduId)!.t).sort((a, b) => a - b)
    const su: number = one(suData(rs).map((r) => r.frame.txTimeNs))
    const ack: number = one(txs(rs, (r) => r.frame.kind === 'ack').map((r) => r.frame.txTimeNs))
    // 125.6 + 16 + 28 = 169.6 µs, and an MSDU cannot leave the queue before its ACK arrives
    expect(su + SIFS_NS + ack).toBe(169.6 * US)
    expect(held[0]).toBe(su + SIFS_NS + ack)
    expect(ofdmaDl.deeper!.map((b) => JSON.stringify(b)).join('\n')).toContain('169.6 µs')
  })

  it('says all of that in `deeper`, beside the sentence it completes, in two blocks', () => {
    const d = ofdmaDl.deeper!.map((b) => (b as { heading?: string; text?: string }))
    const i = d.findIndex((b) => b.heading === '那个机会为什么稀罕')
    expect(i, 'the explanation is missing').toBeGreaterThanOrEqual(0)
    // right after the sentence it completes, not in a section of its own somewhere else
    expect(d[i - 1].text).toContain('分组是见机行事的，而机会在队列里，不在电台里')
    /*
     * The split, pinned as a split: one block answers the question (the window, then the
     * per-frame count against the threshold), the next one holds the two misreadings. It was
     * one 560-character block, which is four subjects in one paragraph; `deeper` does not count
     * towards `lessonMinutes`, so there was never a reason to compress it instead of splitting.
     */
    const next = d[i + 1]
    expect(next.heading).toBe('这个窗口有两处容易读反')
    // each half holds its own half: the measurement in the first, the two traps in the second
    expect(d[i].text).toContain('逐帧那一遍才是准的')
    expect(d[i].text).not.toContain('169.6 µs')
    expect(next.text).toContain('169.6 µs')
    expect(next.text).toContain('145.3 µs')
    expect(next.text).not.toContain('45 对')
    const t = [d[i].text!, next.text!].join('\n')
    // Every figure of that paragraph, this time including the one the first version of this
    // list skipped: 145.3 µs was the only number in it with no assertion anywhere in the repo.
    for (const n of [
      '9.6 µs', '145.3 µs', '185.2 µs', '506', '747 到 947 µs',
      '1016', '1058', '4.4 %', '3.9 %', '169.6 µs', '37 %',
    ]) {
      expect(t, `the explanation never names ${n}`).toContain(n)
    }
    // …and nothing else: any other "N.N µs" in the paragraph is a figure no test here measured
    for (const m of t.matchAll(/(\d+\.\d+) µs/g)) {
      expect(['9.6', '145.3', '185.2', '169.6', '125.6'], `unpinned figure ${m[1]} µs`)
        .toContain(m[1])
    }
  })
})

/**
 * The guard interval against this lesson's fixed-length MU PPDU (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §7.3, §6.1 item 6).
 *
 * **The figures here are re-measured against the built feature, and two of them differ from the
 * design's.** The design's instrument B set `PHY_MODES.he.symNs` and `preambleNs` by hand; it
 * did not change `maxPsduBytesFor`, `captureWindowNs` or `FrameDesc.mbps`, which the
 * implementation does. Its base figures reproduce exactly (80.55 ms, 2 269 938 octets); its
 * quadruple tier does not (it reported 88.10 ms and +0.002 %, the built feature gives 92.43 ms
 * and +0.005 %). The instrument is the ruler, and the lesson quotes the one that matches the
 * code a reader will run.
 */
describe('ofdma-dl · the guard interval only changes how long the MU PPDU is', () => {
  const MS_NS = 1_000_000
  const tier = (gi?: 'double' | 'quad') => {
    const base = ofdmaDl.scenario()
    const s = gi ? ({ ...base, guardInterval: { gi } } as Scenario) : base
    /*
     * **The base tier is a prefix of this file's own run**, record for record — the engine is
     * deterministic, so a shorter run of the same scene is the longer one cut off — and the
     * suite's simulated work is bounded (tests/simCost.ts), so it is taken rather than re-run.
     */
    const rs = gi
      ? [...new Simulation(s).runUntil(150 * MS_NS).records]
      : runOf(ofdmaDl, undefined, RUN_NS).filter((r) => r.t < 150 * MS_NS)
    const ppdus = rs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START')
      .map((r) => r.frame).filter((f) => !f.amp && !f.uwb)
    // **Dequeued MSDUs, not the sum of received octets.** A DL MU PPDU is received once per
    // member, so summing `frame.bytes` over RX_OK counts the same payload several times and
    // moves when the member count does — which is a property of the grouping, not of the guard
    // interval. `DEQUEUE` is one record per MSDU that actually got through.
    return {
      dequeued: rs.filter((r) => r.type === 'DEQUEUE').length,
      muPpduNs: [...new Set(ppdus.filter((f) => f.kind === 'data' && f.muParts).map((f) => f.txTimeNs))],
      airMs: +(ppdus.reduce((a, f) => a + f.txTimeNs, 0) / 1e6).toFixed(2),
      rxFail: rs.filter((r) => r.type === 'RX_FAIL').length,
    }
  }

  it('carries an out-of-scope limit with its own instrument beside its own figures', () => {
    const lim = ofdmaDl.limits.find((x) => x.text.includes('保护间隔'))
    expect(lim, 'no limit mentions the guard interval').toBeDefined()
    expect(lim!.kind).toBe('out-of-scope')
    expect(lim!.until).toBeUndefined()
    expect(lim!.text).toContain(String(MU_SYMBOLS))
    expect(lim!.text).toContain('150 ms')
  })

  it('and the three figures it quotes are what the scene really does', () => {
    const base = tier()
    const quad = tier('quad')
    expect(base.airMs).toBe(80.55)
    expect(quad.airMs).toBe(92.43)
    // The MU PPDU is a fixed 12 symbols, so its own length follows the symbol exactly…
    expect(base.muPpduNs).toEqual([211_200])
    expect(quad.muPpduNs).toEqual([248_800])
    // …and what got through does not move at all.
    expect(quad.dequeued).toBe(base.dequeued)
    expect(base.dequeued).toBe(529)
    expect(base.rxFail).toBe(0)
    expect(quad.rxFail).toBe(0)
    const lim = ofdmaDl.limits.find((x) => x.text.includes('保护间隔'))!
    expect(lim.text).toContain('80.55')
    expect(lim.text).toContain('92.43')
    expect(lim.text).toContain('211.2')
    expect(lim.text).toContain('248.8')
    expect(lim.text).toContain('529')
    expect(lim.text).toContain((((quad.airMs / base.airMs) - 1) * 100).toFixed(1))
    expect(lim.text).toContain((((quad.muPpduNs[0] / base.muPpduNs[0]) - 1) * 100).toFixed(1))
  })

  it('does not move the stated minutes: limits are outside mainPathChars', () => {
    // 2 107 since 2026-10-05: `why` gained the sentence that names 下行（downlink, DL）,
    // which the reach rule's title arm asks of this lesson — its own title says 下行 and
    // its graded main path never did. The stated minutes did not move and there were 203
    // characters of room before they would have.
    expect(lessonChars(ofdmaDl)).toBe(2107)
    expect(lessonMinutes(ofdmaDl)).toBe(20)
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file measures the whole lesson — the two-row comparison, the symbol arithmetic, the
 * pairing statistics, both experiments — and compares every one of them against a figure typed
 * on **this** side. The sampling sweep of 2026-10-12 scored the lesson 5 of 6.
 *
 * **The reads worth naming:**
 *
 *  - **the symbol arithmetic is read as one chain**, from the rung's bits per symbol through the
 *    share, the bits to carry, the symbols that takes and the length that buys: 「1950 × 0.5 =
 *    975」, 「⌈11494 ÷ 975⌉ = 12」, 「44 + 4 + 13.6 × 12 = 211.2 µs」. Every factor is parsed out
 *    and every product has to be the next line's input.
 *  - **the two savings are read against each other.** 「每凑成一对，就省下 40 µs 的前导码，又因为
 *    确认帧变大而还回去 8 µs；这段仿真里的 45 对，合起来是 1.44 ms」 is four figures and one
 *    multiplication, and the 1.44 ms has to be the airtime difference the two runs really show.
 *  - **the pairing statistics are read as the two rulers they are.** 4.4 % of sends against
 *    3.9 % of close arrivals, 41 pairs against 45, and the 30 and 34 the proxy misclassifies —
 *    each against the same window computation the tests above make.
 *  - **the `limits` entry about the guard interval is read as its own two-column comparison**:
 *    211.2 → 248.8 µs and 80.55 → 92.43 ms, with both percentages recomputed from the pairs.
 */
describe('ofdma-dl · every figure the prose prints, read back out of it', () => {
  const rs = runOf(ofdmaDl, undefined, RUN_NS)
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const PIC = blockText(ofdmaDl.picture)
  const NUMS = blockText(ofdmaDl.numbers)
  const DEEP = blockText(ofdmaDl.deeper)
  const SRC = blockText(ofdmaDl.sources)
  const LIM = blockText(ofdmaDl.limits)
  const OBS = blockText(ofdmaDl.observe)
  const TRY = blockText(ofdmaDl.tryThis)
  const QUIZ = blockText(ofdmaDl.quiz)

  /** The two engine files whose own source answers figures this lesson has no record for. */
  const PHY_SRC = readFileSync(new URL('../../src/engine/phy.ts', import.meta.url), 'utf8')
  const TRAFFIC_SRC = readFileSync(new URL('../../src/engine/traffic.ts', import.meta.url), 'utf8')
  const MAC_SRC = readFileSync(new URL('../../src/engine/mac.ts', import.meta.url), 'utf8')
  const SEL_SRC = readFileSync(new URL('../../src/engine/selectivity.ts', import.meta.url), 'utf8')

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tableOf = (needle: string): { head: string[]; rows: string[][]; heading?: string } => {
    const b = ofdmaDl.numbers!.find((x) => x.kind === 'table'
      && (x as { heading?: string }).heading?.includes(needle))
    expect(b, `no table whose heading contains 「${needle}」`).toBeDefined()
    return b as { head: string[]; rows: string[][] }
  }
  /**
   * The width `phy.ts` tabulates bits per symbol for — and falls back to when a caller names no
   * width, which is every call this lesson's scene makes, since no node of it asks for one.
   */
  const REF_WIDTH_MHZ = figs(PHY_SRC, /toneRatio\(mode, opts\.widthMhz \?\? (\d+)\)/,
    '`phy.ts` on its own default width')[0]!

  const mu = muPpdus(rs)
  const su = suData(rs)

  it('reads the two-row comparison, every cell of it', () => {
    const t = tableOf('两种发法')
    /*
     * **This table runs the other way**: the two ways of sending are its ROWS, and what is being
     * compared is its COLUMNS. So a figure is addressed by the column heading that names it, and
     * `pair(h)[1]` / `[2]` are the one-at-a-time and the all-at-once cell of that column.
     */
    const pair = (needle: string): string[] => {
      const i = t.head.findIndex((h) => h.includes(needle))
      expect(i, `no column 「${needle}」`).toBeGreaterThan(0)
      return ['', t.rows[0]![i]!, t.rows[1]![i]!]
    }
    const row = pair
    const suFrame = one(su.map((r) => r.frame.txTimeNs))
    const muFrame = one(mu.map((r) => r.frame.txTimeNs))
    // 「44 µs × 2」 against 「48 µs」: the opening, once per send or once for both.
    const [suPre, suTimes] = figs(row('前导码')[1]!, /(\d+) µs × (\d+)/, 'the single-user opening')
    expect(suPre! * US, 'a single-user preamble').toBe(PHY_MODES.he.preambleNs)
    expect(suTimes, 'paid once per television').toBe(2)
    const [muPre] = figs(row('前导码')[2]!, /^(\d+) µs$/, 'the multi-user opening')
    // A multi-user opening is the single-user one plus the per-user map the steps price.
    expect(muPre! - suPre!, 'what the per-user map adds to the opening')
      .toBe(figs(NUMS, /再加 (\d+) µs 装“这一发里有谁”的分配表/, 'the map in the steps')[0])
    // 「6 + 6」 against 「12」: the symbols, each way.
    const [a, b] = figs(row('数据符号')[1]!, /(\d+) \+ (\d+)/, 'the single-user symbol counts')
    const [both] = figs(row('数据符号')[2]!, /^(\d+)$/, 'the multi-user symbol count')
    expect(a! + b!, 'the same symbols, paid in two sends').toBe(both)
    // 「125.6 µs × 2」 against 「211.2 µs」: the airtime, each way.
    const [suLen, suLenTimes] = figs(row('占用空口')[1]!, /([\d.]+) µs × (\d+)/, 'the single-user airtime')
    same(String(suLen), suFrame / US, 'one single-user send')
    expect(suLenTimes, 'twice').toBe(2)
    same(raw(row('占用空口')[2]!, /^([\d.]+) µs$/, 'the multi-user airtime')[0]!, muFrame / US,
      'one multi-user send')
    // 「两个确认帧，各 28 µs，一前一后」 against 「两个块确认帧，各 32 µs，同一瞬间」
    const [ackUs] = figs(row('确认')[1]!, /各 (\d+) µs/, 'the single-user acknowledgement')
    const [baUs] = figs(row('确认')[2]!, /各 (\d+) µs/, 'the multi-user one')
    const acks = txs(rs, (r) => r.frame.kind === 'ack')
    const bas = txs(rs, (r) => r.frame.kind === 'ba' || r.frame.kind === 'mba')
    same(String(ackUs), one(acks.map((r) => r.frame.txTimeNs)) / US, 'an acknowledgement')
    expect(bas.length, 'and the run really sends block acknowledgements too').toBeGreaterThan(0)
    same(String(baUs), one(bas.filter((r) => r.t > mu[0]!.t).slice(0, 2)
      .map((r) => r.frame.txTimeNs)) / US, 'a block acknowledgement')
    // 「两帧一起走只要 211.2 µs，而一前一后地发要 251.2 µs」
    const [together, apart] = figs(NUMS, /两帧一起走只要 ([\d.]+) µs，而一前一后地发要 ([\d.]+) µs/,
      '`numbers` on the two totals')
    same(String(together), muFrame / US, 'the two frames together')
    expect(apart, 'and the same two one after the other')
      .toBe(Number(((2 * suFrame) / US).toFixed(1)))
    expect(together, 'which is the longer of the two').toBeLessThan(apart!)
  })

  it('reads the symbol arithmetic as the chain it is', () => {
    const t = tableOf('照着步骤走')
    const cell = (needle: string): string => t.rows.find((r) => r[0]!.includes(needle))![1]!
    // 「1950 × 0.5 = 975」
    const [perSym, share, mine] = figs(cell('每个成员每符号比特数'), /(\d+) × ([\d.]+) = (\d+)/,
      'the bits per symbol of one member')
    const rung = one(mu.map((r) => r.frame.mcs))
    expect(perSym, 'the bits one symbol carries at this rung, over the whole channel')
      .toBe(PHY_MODES.he.ndbps[rung!] * toneRatio('he', 20))
    expect(share, 'the share each member gets').toBe(1 / one(mu.map((r) => r.frame.muParts!.length))!)
    expect(perSym! * share!, 'and the product the cell prints').toBe(mine)
    // 「⌈11494 ÷ 975⌉ = 12」
    const [bits, divisor, symbols] = figs(cell('每个成员的符号数'), /⌈(\d+) ÷ (\d+)⌉ = (\d+)/,
      'the symbols one member’s bytes take')
    expect(divisor, 'divided by the bits one of its symbols carries').toBe(mine)
    expect(Math.ceil(bits! / divisor!), 'the ceiling the cell prints').toBe(symbols)
    // …and the bits are the member's own bytes, through the formula the lesson states.
    const [svc, perByte, tail] = figs(NUMS, /⌈\((\d+) \+ (\d+) × 字节数 \+ (\d+)\) ÷ 每符号比特数⌉/,
      'the formula the steps state')
    const memberBytes = one(mu.map((r) => r.frame.muParts!.map((p) => p.bytes)))![0]!
    expect(svc! + perByte! * memberBytes + tail!, 'the bits that formula gives this member')
      .toBe(bits)
    // 「44 + 4 + 13.6 × 12 = 211.2 µs」
    const [pre, map, sym, count, total] = figs(cell('这次发送的长度'),
      /(\d+) \+ (\d+) \+ ([\d.]+) × (\d+) = ([\d.]+) µs/, 'the airtime the symbols buy')
    expect(pre! * US, 'the single-user preamble').toBe(PHY_MODES.he.preambleNs)
    expect(sym! * US, 'one symbol').toBe(PHY_MODES.he.symNs)
    expect(count, 'the symbols, as the row above counts them').toBe(symbols)
    expect(pre! + map! + sym! * count!, 'the sum the cell prints').toBeCloseTo(total!, 3)
    same(String(total), one(mu.map((r) => r.frame.txTimeNs))! / US, 'the send the engine builds')
    // The same four figures in the steps' prose, and the gap and answer that follow.
    const [proPre, proMap, proSym] = figs(NUMS,
      /(\d+) µs 前导码，再加 (\d+) µs 装“这一发里有谁”的分配表，然后每个符号 ([\d.]+) µs/,
      'the steps on the three terms')
    expect([proPre, proMap, proSym], 'the same three').toEqual([pre, map, sym])
    const [gapUs, baUs] = figs(NUMS, /结束后隔 (\d+) µs，每个成员各在自己的资源单元上回一个 (\d+) µs 的块确认/,
      'the steps on the gap and the answer')
    expect(gapUs! * US, 'one short interframe space').toBe(SIFS_NS)
    // The worked table states the gap in its own ROW LABEL, and the answer in the cell.
    const ackRow = t.rows.find((r) => r[0]!.includes('之后回来的确认'))!
    const [cellGap] = figs(ackRow[0]!, /^(\d+) µs 之后回来的确认是$/, 'the worked table’s own gap')
    expect(cellGap, 'the same gap').toBe(gapUs)
    const [cellBa] = figs(ackRow[1]!, /(\d+) µs（两个并排/, 'the worked table’s own answer')
    expect(cellBa, 'and the same answer').toBe(baUs)
    // …and the bytes the same table gives one member.
    const [cellBytes] = figs(cell('装进去的字节'), /^([\d,]+) B$/, 'the worked table’s own payload')
    expect(cellBytes, 'the bytes one member carries')
      .toBe(one(mu.map((r) => r.frame.muParts!.map((p) => p.bytes)))![0])
    const [queued] = figs(cell('队列里有东西的设备'), /^(\d+)$/, 'the devices with something queued')
    expect(queued, 'the members the first group takes').toBe(one(mu.map((r) => r.frame.muParts!.length)))
    // 「先取它那一级在 20 MHz 信道、单流下的比特数——这几台电视是 1950——再乘上它分到的子载波占比，
    //   这里正好折半，得到 975」
    const [width, bitsPerSym, half] = figs(NUMS,
      /在 (\d+) MHz 信道、单流下的比特数——这几台电视是 (\d+)——[^]*?得到 (\d+)/,
      'the steps on the bits per symbol')
    /*
     * **No node of this scene states a width**, and `phy.ts` is why the sentence can still name
     * one: `ndbps` is tabulated per 20 MHz, and `bitsPerSymbol` falls back to that same 20 when
     * the caller gives no width — which is what every figure of this lesson was computed at.
     */
    expect(ofdmaDl.scenario().nodes.every((n) => n.caps.widthMhz === undefined),
      'no node of this scene asks for a width').toBe(true)
    expect(width, 'so the channel the bits per symbol are tabulated for').toBe(REF_WIDTH_MHZ)
    expect([bitsPerSym, half], 'the same two figures the table prints').toEqual([perSym, mine])
  })

  it('reads the whole-run table and the airtime the pairing gives back', () => {
    const t = tableOf('整段仿真')
    const flat = t.rows.map((r) => r.join(' · ')).join('\n')
    const [windowMs] = figs(t.heading!, /(\d+) ms/, 'the window the table is measured over')
    expect(windowMs! * MS, 'the window every figure of this lesson is measured over').toBe(RUN_NS)
    const off = without(...PHONES)
    // 「161.5 ms」 against 「163.0 ms」: the air each way.
    const [withOf, withoutOf] = figs(flat, /([\d.]+) ms[^]*?([\d.]+) ms/, 'the two airtimes')
    // 「空口忙碌的总时间」 is every frame of the run — acknowledgements included.
    same(String(withOf), airNs(txs(rs)) / MS, 'the air this run uses')
    same(String(withoutOf), airNs(txs(off)) / MS, 'and the air the same room uses with no grouping')
    // 「每凑成一对，就省下 40 µs 的前导码，又因为确认帧变大而还回去 8 µs；这段仿真里的 45 对，
    //   合起来是 1.44 ms」
    const [saved, paid, pairs, net] = figs(NUMS,
      /就省下 (\d+) µs 的前导码，又因为确认帧变大而还回去 (\d+) µs；这段仿真里的 (\d+) 对，合起来是 ([\d.]+) ms/,
      '`numbers` on the two savings')
    expect(pairs, 'the pairs this run makes').toBe(mu.length)
    same(String(net), (airNs(txs(off)) - airNs(txs(rs))) / MS, 'the air the pairing gives back')
    expect(((saved! - paid!) * pairs! * US) / MS, 'which is what the two per-pair figures predict')
      .toBeCloseTo(net!, 2)
    // The same 1.44 ms in `tryThis` and in the quiz.
    for (const [ms] of every([TRY, QUIZ].join('\n'), /([\d.]+) ms 的空口|空口多忙了 ([\d.]+) ms/g,
      'the air the pairing gives back, twice more', 2).map((g) => [g.find((x) => x !== undefined)!])) {
      expect(val(ms!), 'the same figure').toBe(net)
    }
    const [quizMs] = figs(QUIZ, /在 (\d+) ms 内还回去/, 'the quiz on the window')
    expect(quizMs! * MS, 'over the same window').toBe(RUN_NS)
  })

  it('reads the pairing statistics as the two rulers they are', () => {
    const enqs = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap')
    const byId = new Map(enqs.map((e) => [e.msduId, e]))
    const apData = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'data')
    const windows = (): number[] => {
      const out: number[] = []
      for (const tx of apData) {
        const ids = tx.frame.muParts
          ? tx.frame.muParts.flatMap((p) => p.msduIds ?? [])
          : [tx.frame.msduId!]
        for (const id of ids) out.push(tx.t - byId.get(id)!.t)
      }
      return out.sort((a, b) => a - b)
    }
    const w = windows()
    // 「中位数只有 9.6 µs——1061 帧里有 506 帧在一微秒之内就上了空口」
    const [median, frames, quick] = figs(DEEP,
      /中位数只有 ([\d.]+) µs——(\d+) 帧里有 (\d+) 帧在一微秒之内/, '`deeper` on the window')
    same(String(median), w[Math.floor(w.length / 2)]! / US, 'the window’s own median')
    expect(frames, 'the frames of the run').toBe(w.length)
    expect(quick, 'the ones gone inside a microsecond').toBe(w.filter((x) => x <= US).length)
    // 「等得最久的那一帧也只等了 185.2 µs」 and the same figure again further down.
    for (const [us] of every(DEEP, /([\d.]+) µs(?:，一次交互的长度|，窗口并不因此变宽)/g,
      'the longest wait, printed twice', 2)) {
      same(us!, w[w.length - 1]! / US, 'the longest a frame waits')
    }
    // 「上十分位：十帧里有一帧等到了 145.3 µs 以上」
    same(raw(DEEP, /一帧等到了 ([\d.]+) µs 以上/, '`deeper` on the ninth decile')[0]!,
      w[Math.floor(w.length * 0.9)]! / US, 'the window’s ninth decile')
    // 「相邻两次发往不同电视的到达一共 1058 对」, 「接入点总共发了 1016 次」, 「45 次装着两台（4.4 %）」
    const arrivals = enqs.map((e) => ({ t: e.t, dst: e.dst })).sort((a, b) => a.t - b.t)
    let close = 0
    let cross = 0
    for (let i = 1; i < arrivals.length; i++) {
      if (arrivals[i]!.dst === arrivals[i - 1]!.dst) continue
      cross++
      if (arrivals[i]!.t - arrivals[i - 1]!.t < 14 * US) close++
    }
    const [crossPairs] = figs(DEEP, /发往不同电视的到达一共 (\d+) 对/, '`deeper` on the cross arrivals')
    expect(crossPairs, 'the arrivals that cross from one television to another').toBe(cross)
    const [sends] = figs(DEEP, /接入点总共发了 (\d+) 次/, '`deeper` on the sends')
    expect(sends, 'the sends the access point makes').toBe(apData.length)
    const [paired, pct] = figs(DEEP, /就是那 (\d+) 次装着两台（([\d.]+) %）/, '`deeper` on the share')
    expect(paired, 'the sends that carried two').toBe(mu.length)
    same(String(pct), (100 * mu.length) / apData.length, 'their share of every send')
    // 「按窗口中位数 9.6 µs 的量级取 14 µs 这个整数」, 「会数出 41 对（1058 对里的 3.9 %）」
    const [proxyUs] = figs(DEEP, /的量级取 (\d+) µs 这个整数/, '`deeper` on the proxy threshold')
    expect(proxyUs, 'the threshold the proxy uses').toBe(14)
    const [proxyPairs, proxyOf, proxyPct] = figs(DEEP, /会数出 (\d+) 对（(\d+) 对里的 ([\d.]+) %）/,
      '`deeper` on the proxy’s count')
    expect(proxyPairs, 'the pairs the proxy counts').toBe(close)
    expect(proxyOf, 'out of the same denominator').toBe(cross)
    same(String(proxyPct), (100 * close) / cross, 'and their share')
    expect(proxyPairs, 'which is four short of the engine’s own count').toBeLessThan(paired!)
  })

  it('reads the two counts the proxy misclassifies, and the floor that makes it the wrong ruler', () => {
    // 「30 对被门限数了进来，而第二帧……34」 and the queue-residence floor.
    const [counted, dropped] = figs(DEEP,
      /(\d+) 对被门限数了进来，而第一帧其实早就走了；另有 (\d+) 对被门限筛掉/,
      'the proxy’s two misclassifications')
    /*
     * **Both are measured against the per-frame criterion the paragraph calls the accurate one.**
     * A pair the proxy counts but the window does not is one whose first frame had already left;
     * a pair the window counts but the proxy does not is one whose first frame was waiting out
     * an exchange. The two are computed here the same way the test above computes the 45.
     */
    const enq2 = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap')
    const apTx = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'data')
    const txAt = new Map<number, number>()
    for (const tx of apTx) {
      const ids = tx.frame.muParts ? tx.frame.muParts.flatMap((p) => p.msduIds ?? []) : [tx.frame.msduId!]
      for (const id of ids) txAt.set(id, tx.t)
    }
    const arr = enq2.map((e) => ({ t: e.t, dst: e.dst, id: e.msduId })).sort((a, b) => a.t - b.t)
    let proxyOnly = 0
    let windowOnly = 0
    for (let i = 1; i < arr.length; i++) {
      if (arr[i]!.dst === arr[i - 1]!.dst) continue
      const gap = arr[i]!.t - arr[i - 1]!.t
      const byProxy = gap < 14 * US
      const byWindow = (txAt.get(arr[i - 1]!.id) ?? 0) > arr[i]!.t
      if (byProxy && !byWindow) proxyOnly++
      if (!byProxy && byWindow) windowOnly++
    }
    expect(counted, 'the pairs the proxy counts and the window does not').toBe(proxyOnly)
    expect(dropped, 'and the ones the window counts and the proxy does not').toBe(windowOnly)
    // 「那个数自带 125.6 + 16 + 28 = 169.6 µs 的下限，按它算会得出 37 % 这种答案」
    const [len, gap, ack, floor] = figs(DEEP, /自带 ([\d.]+) \+ (\d+) \+ (\d+) = ([\d.]+) µs 的下限/,
      '`deeper` on the floor')
    same(String(len), one(su.map((r) => r.frame.txTimeNs)) / US, 'one single-user send')
    expect(gap! * US, 'one gap').toBe(SIFS_NS)
    same(String(ack), one(txs(rs, (r) => r.frame.kind === 'ack').map((r) => r.frame.txTimeNs)) / US,
      'and one acknowledgement')
    expect(len! + gap! + ack!, 'the sum the sentence prints').toBeCloseTo(floor!, 3)
    const [wrongPct] = figs(DEEP, /会得出 (\d+) % 这种答案/, '`deeper` on the wrong ruler’s answer')
    const enqs = ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap')
    const arrivals = enqs.map((e) => ({ t: e.t, dst: e.dst })).sort((a, b) => a.t - b.t)
    let within = 0
    let cross = 0
    for (let i = 1; i < arrivals.length; i++) {
      if (arrivals[i]!.dst === arrivals[i - 1]!.dst) continue
      cross++
      if (arrivals[i]!.t - arrivals[i - 1]!.t < 184 * US) within++
    }
    expect(wrongPct, 'the answer that floor would give, as the sentence rounds it')
      .toBe(Math.round((100 * within) / cross))
    // 「单用户发送的前导码是 44 µs，多用户是 48 µs」
    const [suPre, muPre] = figs(DEEP, /单用户发送的前导码是 (\d+) µs，多用户是 (\d+) µs/,
      '`deeper` on the two preambles')
    expect(suPre! * US, 'the single-user preamble').toBe(PHY_MODES.he.preambleNs)
    expect(muPre! - suPre!, 'and what the per-user map adds')
      .toBe(figs(NUMS, /再加 (\d+) µs 装“这一发里有谁”的分配表/, 'the map’s own cost')[0])
    // 「每台电视的下一帧要 747 到 947 µs 之后才来」 and the same period in `limits`.
    const [from, to] = figs(DEEP, /下一帧要 (\d+) 到 (\d+) µs 之后才来/, '`deeper` on the period')
    const [base, jLo, jHi] = figs(LIM, /（(\d+) µs 加上 (\d+) 到 (\d+) µs 的抖动）/,
      '`limits` on the same period')
    /*
     * **The period is the video generator's, not this scene's**: `scheduleVideo` schedules the
     * next frame at `747 µs + floor(rng × 200 µs)`, so the base and the span are read out of
     * `traffic.ts`, the floor of the draw is the 0, and `deeper`'s two ends are their sum.
     */
    const [srcBase, srcSpan] = figs(TRAFFIC_SRC,
      /const next = t \+ (\d+) \* US \+ Math\.floor\(this\.rng\.next\(\) \* (\d+) \* US\)/,
      'the video generator’s own period')
    expect([base, jHi], 'the period and the span `limits` prints').toEqual([srcBase, srcSpan])
    expect(jLo, 'and the floor of a `Math.floor` draw').toBe(0)
    expect(from, 'the shortest gap between two frames for one television').toBe(base! + jLo!)
    expect(to, 'and the longest').toBe(base! + jHi!)
  })

  it('reads the guard-interval entry’s own two comparisons', () => {
    // 「211.2 → 248.8 µs，涨 17.8 %——12 个符号从 13.6 变 16 µs，再加上 4× LTF 给前导码添的那 8.8 µs」
    const [was, now, pct, symbols, symWas, symNow, ltf] = figs(LIM,
      /([\d.]+) → ([\d.]+) µs，涨 ([\d.]+) %——(\d+) 个符号从 ([\d.]+) 变 (\d+) µs，再加上 4× LTF 给前导码添的那 ([\d.]+) µs/,
      '`limits` on the longer PPDU')
    same(String(was), one(mu.map((r) => r.frame.txTimeNs)) / US, 'the send this engine builds')
    expect(symbols, 'the symbols it carries')
      .toBe(figs(NUMS, /× (\d+) = [\d.]+ µs/, 'the symbol count')[0])
    expect(symWas! * US, 'a symbol at this guard interval').toBe(PHY_MODES.he.symNs)
    expect(symbols! * (symNow! - symWas!) + ltf!, 'what the longer interval would add')
      .toBeCloseTo(now! - was!, 3)
    same(String(pct), (100 * (now! - was!)) / was!, 'the share that is of the send')
    // 「80.55 → 92.43 ms，涨 14.7 %」
    const [airWas, airNow, airPct] = figs(LIM, /([\d.]+) → ([\d.]+) ms，涨 ([\d.]+) %/,
      '`limits` on the whole run’s air')
    /*
     * **That entry names its own instrument**: `runUntil(150 ms)`, not this file's 300 ms. So the
     * figure is measured over that window, which is also the window its MSDU count is about.
     */
    const [entryMs] = figs(LIM, /runUntil\((\d+) ms\)/, '`limits` on its own window')
    /*
     * **The prefix of this file's own run is that window**, record for record — the engine is
     * deterministic and a shorter run is a prefix of a longer one — so the figures are measured
     * without paying for a second simulation (tests/simCost.ts bounds the suite's).
     */
    const short150 = rs.filter((r) => r.t < entryMs! * MS)
    same(String(airWas), airNs(txs(short150)) / MS, 'the air every PPDU of that window takes')
    same(String(airPct), (100 * (airNow! - airWas!)) / airWas!, 'and the share the longer one adds')
    expect(airPct, 'which is smaller than the per-send figure').toBeLessThan(pct!)
    // 「这 150 ms 里真正送出去的 MSDU：两档都是 529 个」 and 「RX_FAIL 也都是 0」
    const [ms] = figs(LIM, /这 (\d+) ms 里真正送出去的/, '`limits` on the MSDU window')
    expect(ms, 'which is the same window the entry names at the top').toBe(entryMs)
    const [msdus] = figs(LIM, /两档都是 (\d+) 个/, '`limits` on the MSDUs')
    const short = short150
    /*
     * **The entry names its own criterion and this read has to obey it**: 「数的是出队的 MSDU，
     * 不是各接收端收到的字节之和」. Counting receptions instead gives 1 521 for the same window,
     * because all three televisions decode every send — which is the mistake the sentence warns
     * about, so it is measured here too, and has to be the larger of the two.
     */
    const dequeued = ofType(short, 'DEQUEUE').filter((r) => r.node === 'ap').length
    expect(msdus, 'the MSDUs that window really sends out').toBe(dequeued)
    const received = ofType(short, 'RX_OK').filter((r) => r.frame.kind === 'data' && r.from === 'ap').length
    expect(received, 'while summing over the receivers counts the same payloads several times')
      .toBeGreaterThan(dequeued)
    const [fails] = figs(LIM, /RX_FAIL 也都是 (\d+)/, '`limits` on the failures')
    expect(fails, 'and the failures it has').toBe(ofType(short, 'RX_FAIL').length)
    // 「12 个符号（MU_SYMB…）」 and 「frac = 1 / 成员数」
    const [fixed] = figs(LIM, /是定长的 (\d+) 个符号/, '`limits` on the fixed symbol count')
    expect(fixed, 'the symbols every multi-user send of this scene carries').toBe(symbols)
    const [num] = figs(LIM, /frac = (\d+) \/ 成员数/, '`limits` on the share’s numerator')
    expect(num / one(mu.map((r) => r.frame.muParts!.length))!,
      'the share each member gets').toBe(one(mu.map((r) => r.frame.muParts![0]!.ruFraction))!)
  })

  it('reads the observe lines, the experiments and the picture’s own payload', () => {
    // 「为两台电视各装了 1434 字节」, in `observe` and in `picture`.
    for (const [bytes] of every([PIC, OBS].join('\n'), /各装 ?了? ?([\d,]+) 字节/g,
      'the payload each member carries, printed twice', 2)) {
      expect(val(bytes!), 'the bytes one member of a group carries')
        .toBe(one(mu.map((r) => r.frame.muParts!.map((p) => p.bytes)))![0])
    }
    /*
     * 「跳到第一次多用户发送。那个宽蓝块长 211.2 µs」 — the 「第」 rule change of 2026-10-14
     * uncovered this one: the MU PPDU's airtime is asserted three times in the describes above
     * and read in the step block, but `observe`'s own printing of it was only ever a comment.
     * Read against the block the sentence sends the reader to: the FIRST multi-user send of the
     * run, which is the one the jump lands on.
     */
    const [wide] = figs(OBS, /那个宽蓝块长 ([\d.]+) µs/, '`observe` on the wide block')
    expect(wide! * US, 'the airtime of the first multi-user send')
      .toBe(mu[0]!.frame.txTimeNs)
    // 「两个 32 µs 的确认帧」, 「整段仿真里接入点向下发了 1016 次，其中只有 45 次装着两台电视」
    const apData = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'data')
    const [sends, paired] = figs(OBS, /接入点向下发了 ([\d,]+) 次，其中只有 (\d+) 次装着两台电视/,
      '`observe` on the two counts')
    expect(sends, 'the sends the access point makes').toBe(apData.length)
    expect(paired, 'and the ones that carried two').toBe(mu.length)
    // `tryThis`: one television out, and all three out.
    const [whichTv, pairs] = figs(TRY, /关掉电视 (\d) 的 OFDMA[^]*?整段仿真里凑了 (\d+) 次/,
      '`tryThis` on the first experiment')
    const one1 = without(`sta-${whichTv}`)
    expect(pairs, 'the pairs the other two still make')
      .toBe(muPpdus(one1).length)
    const [outTv] = figs(TRY, /而电视 (\d) 从此只被单独服务/, '`tryThis` on the one left out')
    expect(outTv, 'the same television the experiment switches off').toBe(whichTv)
    expect(muPpdus(one1).some((r) => r.frame.muParts!.some((p) => p.dst === `sta-${outTv}`)),
      'and no group of that variant ever contains it again').toBe(false)
    const [allOff] = figs(TRY, /共 ([\d,]+) 次/, '`tryThis` on the second experiment')
    // 「把四台设备的 OFDMA 全部关掉」 is all four, the access point included — which is the
    // scene the test above already built, so the memo answers it.
    const allOffRun = without('ap', ...PHONES)
    expect(allOff, 'the sends it takes with no grouping at all')
      .toBe(txs(allOffRun, (r) => r.node === 'ap' && r.frame.kind === 'data').length)
  })

  it('reads the formula block, the row that names the three televisions, and both 32 µs', () => {
    /*
     * **The formula is printed twice and the two printings differ**: the steps write it with
     * 「每符号比特数」 already folded, the `formula` block spells out 「× RU 占比」. Both are read
     * here, their three constants have to agree, and the three together have to turn this run's
     * own payload into the bit count the worked table divides.
     */
    const [svc, perByte, tail] = figs(NUMS,
      /符号数 = ⌈\((\d+) \+ (\d+)·字节数 \+ (\d+)\) ÷ \(每符号比特数 × RU 占比\)⌉/,
      'the `formula` block’s own three terms')
    const steps = figs(NUMS, /⌈\((\d+) \+ (\d+) × 字节数 \+ (\d+)\) ÷ 每符号比特数⌉/,
      'the same formula in the steps')
    expect([svc, perByte, tail], 'the same three constants, both times').toEqual(steps)
    const t2 = tableOf('照着步骤走')
    const cell = (needle: string): string => t2.rows.find((r) => r[0]!.includes(needle))![1]!
    const [bits] = figs(cell('每个成员的符号数'), /⌈(\d+) ÷/, 'the bits the worked table divides')
    const memberBytes = one(mu.map((r) => r.frame.muParts!.map((p) => p.bytes)))![0]!
    expect(svc! + perByte! * memberBytes + tail!, 'what those three make of this member’s payload')
      .toBe(bits)
    // 「电视 1 / 2 / 3 收到的帧数」 — the row label names the scene's three stations, in order.
    const label = figs(NUMS, /电视 (\d) \/ (\d) \/ (\d) 收到的帧数/,
      'the row label’s three televisions')
    expect(label, 'the three televisions of this scene, in the order the scenario lists them')
      .toEqual(PHONES.map((id) => Number(id.split('-')[1])))
    // 「本课的测试把它钉成这个恒等式，而不是钉成 45」 — the identity's own value, this run.
    const [notPinned] = figs(LIM, /而不是钉成 (\d+)）/, '`limits` on the count it refuses to pin')
    expect(notPinned, 'the paired sends of this one run, which is what that identity comes to')
      .toBe(mu.length)
    /*
     * **Both remaining 32 µs are the same answer**, and neither has a record of its own on the
     * test side: `limits` quotes it as the length `mac.ts` writes into the duration field, and
     * `observe` tells the reader to look at it on the timeline. So both are read against the
     * block acknowledgements the run really sends inside a group.
     */
    const groupBas = txs(rs, (r) => (r.frame.kind === 'ba' || r.frame.kind === 'mba')
      && r.frame.orthogonalGroup !== undefined)
    expect(groupBas.length, 'the run answers its groups with block acknowledgements')
      .toBe(2 * mu.length)
    const baUs = one(groupBas.map((r) => r.frame.txTimeNs))! / US
    const [limBa] = figs(LIM, /一个短帧间间隔加一个 (\d+) µs 的块确认/,
      '`limits` on the answer the engine hard-codes')
    const [obsBa] = figs(OBS, /两个 (\d+) µs 的确认帧/, '`observe` on the same answer')
    same(String(limBa), baUs, 'the block acknowledgement `limits` prices')
    same(String(obsBa), baUs, 'and the one `observe` points at')
  })

  it('reads `sources` and the tone table `limits` quotes', () => {
    // 「44 µs 的前导码、多用户信令多出的 4 µs 以及 13.6 µs 的符号」
    const [pre, map, sym] = figs(SRC, /(\d+) µs 的前导码、多用户信令多出的 (\d+) µs 以及 ([\d.]+) µs 的符号/,
      '`sources` on the three model values')
    expect(pre! * US, 'the preamble').toBe(PHY_MODES.he.preambleNs)
    expect(sym! * US, 'and the symbol').toBe(PHY_MODES.he.symNs)
    expect(map, 'the per-user map’s own cost')
      .toBe(figs(NUMS, /再加 (\d+) µs 装“这一发里有谁”的分配表/, 'the map in the steps')[0])
    // 「muDsts.slice(0, 4)」, printed in `sources` and again in `limits`
    const [srcFrom, srcTo] = figs(MAC_SRC, /muDsts\.slice\((\d+), (\d+)\)/,
      'the slice `mac.ts` really takes')
    for (const [from, to] of every([SRC, LIM].join('\n'), /muDsts\.slice\((\d+), (\d+)\)/g,
      'the slice the engine takes, printed twice', 2)) {
      expect([val(from!), val(to!)], 'both ends, as the engine writes them').toEqual([srcFrom, srcTo])
    }
    expect(srcTo, 'a cap this scene never reaches')
      .toBeGreaterThan(one(mu.map((r) => r.frame.muParts!.length))!)
    // 「资源单元最小可到 26 个子载波」 and the discrete tone table in `limits`
    const [smallest] = figs(SRC, /资源单元最小可到 (\d+) 个子载波/, '`sources` on the smallest RU')
    expect(smallest, 'the tones of the smallest resource unit').toBe(RU26_TONES)
    const tones = figs(LIM, /（(\d+)、(\d+)、(\d+)、(\d+)、(\d+)、(\d+)……）/, '`limits` on the tone table')
    expect(tones[0], 'the table opens with that same smallest one').toBe(smallest)
    expect(tones[1], 'and doubles').toBe(2 * smallest!)
    /*
     * **The 106 is counted out of the engine's own ranges**, the way `@ru-diversity` reads the
     * same table: `selectivity.ts` writes each resource unit of Tables 27-8 and 27-9 as a tone
     * range, and the span of the widest of them is the 106 this list prints. The 242 and the 484
     * hold each other up — the standard's table doubles there, so moving either breaks the pair.
     * **The 996 is exempt, class (a)**, by the argument `@ru-diversity` files for it: of the six
     * it is the one entry that neither doubles its neighbour nor counts out of a range this
     * repository holds, and 802.11 prose is not in the corpus.
     */
    const SPANS = [...SEL_SRC.matchAll(/`\[(-?\d+):(-?\d+)\]`/g)].map(([, a, b]) => val(b!) - val(a!) + 1)
    expect(tones[2], 'the 106-tone RU, as `selectivity.ts` spans it')
      .toBe([...new Set(SPANS)].find((x) => x > 100))
    expect(tones[4], 'the fifth entry, twice the fourth').toBe(2 * tones[3]!)
    for (let i = 1; i < tones.length; i++) {
      expect(tones[i]!, `the table is increasing at ${tones[i]}`).toBeGreaterThan(tones[i - 1]!)
    }
    // 「802.11ax 在 20 MHz 上用 26 音调的资源单元就能装九个成员」 — the tones, and the Chinese
    // numeral beside them, which is `RU26_PER_20MHZ` itself.
    const [axWidth, axTones] = figs(LIM, /在 (\d+) MHz 上用 (\d+) 音调的资源单元/,
      '`limits` on what a 20 MHz channel of smallest RUs holds')
    expect(axTones, 'the smallest resource unit again').toBe(smallest)
    const [cn] = raw(LIM, /就能装(.)个成员/, '`limits` on how many of them fit')
    expect('零一二三四五六七八九'.indexOf(cn!), 'as many members as that width has such RUs')
      .toBe(RU26_PER_20MHZ)
    expect(axWidth, 'on the width that count is per').toBe(REF_WIDTH_MHZ)
    const [smallGrant] = figs(LIM, /一块 (\d+) 音调的/, '`limits` on the small grant')
    expect(smallGrant, 'which is the smallest the scheduler could hand out').toBe(smallest)
    // 「320 MHz 上的资源单元有……」
    const [wide] = figs(LIM, /而 (\d+) MHz 上的资源单元/, '`limits` on the widest channel')
    expect(Number.isInteger(selBins(wide!)), 'a width this engine splits into whole bins').toBe(true)
  })
})
