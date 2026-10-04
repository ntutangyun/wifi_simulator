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
import { lessonChars, lessonMinutes } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { PHY_MODES, SIFS_NS, toneRatio } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { RU26_PER_20MHZ, selBinWidthMhz, selBins, selMemberBins } from '../../src/engine/selectivity'

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
    const rs = [...new Simulation(s).runUntil(150 * MS_NS).records]
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
