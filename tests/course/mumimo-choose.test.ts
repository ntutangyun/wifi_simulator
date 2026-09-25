/**
 * Every empirical claim of "by frequency or by space: which this turn takes",
 * the second half of `mumimo`, measured against the scene the two share.
 *
 * What arrived here with the prose (2026-09-26): the two rows of the comparison
 * table, the per-member rates, the 52 µs opening and the three-symbols-against-one
 * split behind 92.8 / 65.6 µs, the 1.41 end to end, the combined 12,918 against
 * 8,612 bytes, and the rule the engine actually picks by — every candidate has
 * negotiated MU-MIMO and every candidate's head frame is at least 1,000 bytes.
 *
 * The lesson is not registered yet (the controller does that), so the shape and
 * the terminology are graded here by importing it directly.
 */
import { describe, it, expect } from 'vitest'
import { mumimoChoose } from '../../src/course/tier2/mumimo-choose'
import { mumimo } from '../../src/course/tier2/mumimo'
import { mumimoScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { PHY_MODES, toneRatio } from '../../src/engine/phy'
import { ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure } from '../../src/course/readability'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 500 * MS
/** The fixed opening of a multi-user send: the EHT preamble plus the per-user map. */
const OPENING_NS = PHY_MODES.eht.preambleNs + PHY_MODES.eht.muExtraPreambleNs
/** The engine's own floor for dividing space instead of frequency (mac.ts). */
const MUMIMO_MIN_BYTES = 1_000

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const muSends = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)
/** The first send of a variant in which every member carries the same 4,306 B: the table's row. */
const cleanSend = (rs: TLRecord[], members: number): Tx => {
  const hit = muSends(rs).find((r) => r.frame.muParts!.length === members
    && new Set(r.frame.muParts!.map((p) => p.bytes)).size === 1
    && r.frame.muParts![0].bytes === 4_306)
  expect(hit, `a clean ${members}-member send`).toBeDefined()
  return hit!
}

lessonShapeSuite(mumimoChoose, { sameSceneAs: 'mumimo', runNs: RUN_NS })

describe('mumimo-choose · the lesson’s own scene', () => {
  it('is the second half of mumimo: same module, same house, same two variants', () => {
    expect(MODULES[mumimoChoose.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mumimoChoose.needs).toEqual(['mumimo'])
    expect(mumimoChoose.terms!.map((t) => t.term)).toEqual(['symbol', 'MU', 'OFDMA'])
    expect(mumimoChoose.scenario()).toEqual(mumimo.scenario())
    expect(mumimoChoose.variants!.map((v) => v.label)).toEqual(mumimo.variants!.map((v) => v.label))
    expect(mumimoChoose.variants!.map((v) => v.scenario()))
      .toEqual([mumimoScenario(false), mumimoScenario(true)])
    for (const v of mumimoChoose.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('§4 gives it no diagram: the comparison table is the lesson', () => {
    const blocks = [...mumimoChoose.picture!, ...mumimoChoose.numbers!]
    expect(blocks.filter((b) => b.kind === 'diagram')).toEqual([])
    expect(blocks.filter((b) => b.kind === 'table').length).toBeGreaterThanOrEqual(2)
  })

  it('brackets every official term at its first Chinese use', () => {
    // the contract's own walk (tests/course/readability.test.ts), run here because the
    // controller has not registered this lesson yet
    const zh = [mumimoChoose.why!, ...mumimoChoose.outcomes!]
      .concat(paragraphTexts(mumimoChoose.picture!), cellTexts(mumimoChoose.picture!))
      .concat(paragraphTexts(mumimoChoose.numbers!), cellTexts(mumimoChoose.numbers!))
      .concat(mumimoChoose.observe, mumimoChoose.tryThis,
        mumimoChoose.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
      .join(' ')
    const failures: string[] = []
    for (const t of ZH_TERMS.filter((x) => !x.track || x.track === 'wifi')) {
      const why = zhTermFailure(zh, t)
      if (why) failures.push(why)
      failures.push(...zhAkaViolations(zh, t))
    }
    expect(failures).toEqual([])
  })
})

describe('mumimo-choose · one send of each kind', () => {
  const ofdma = cleanSend(runOf(mumimo, 0, RUN_NS), 3)
  const mimo = cleanSend(runOf(mumimo, 1, RUN_NS), 2)

  it('the table’s two rows: 3 and 2 members, 4,306 B each, 92.8 µs and 65.6 µs', () => {
    expect(ofdma.frame.muParts!.length).toBe(3)
    expect(mimo.frame.muParts!.length).toBe(2)
    expect(ofdma.frame.txTimeNs).toBe(92.8 * US)
    expect(mimo.frame.txTimeNs).toBe(65.6 * US)
    expect(ofdma.frame.muKind).toBe('ofdma')
    expect(mimo.frame.muKind).toBe('mumimo')
    // each OFDMA member is on a third of the channel; each MU-MIMO member on all of it
    expect(new Set(ofdma.frame.muParts!.map((p) => p.ruFraction))).toEqual(new Set([1 / 3]))
    expect(new Set(mimo.frame.muParts!.map((p) => p.nss))).toEqual(new Set([2]))
  })

  it('"Rate per member": 371.2 and 525.1 Mb/s, payload over the length of the send', () => {
    const rate = (r: Tx): number => Math.round(((r.frame.muParts![0].bytes * 8) / (r.frame.txTimeNs / 1000)) * 10) / 10
    expect(rate(ofdma)).toBe(371.2)
    expect(rate(mimo)).toBe(525.1)
    expect(rate(mimo)).toBeGreaterThan(rate(ofdma))
  })

  it('the formula: a fixed 52 µs opening plus three data symbols against one', () => {
    expect(OPENING_NS).toBe(52 * US)
    expect(PHY_MODES.eht.preambleNs).toBe(48 * US)
    expect(PHY_MODES.eht.muExtraPreambleNs).toBe(4 * US)
    expect(PHY_MODES.eht.symNs).toBe(13.6 * US)
    expect((ofdma.frame.txTimeNs - OPENING_NS) / PHY_MODES.eht.symNs).toBe(3)
    expect((mimo.frame.txTimeNs - OPENING_NS) / PHY_MODES.eht.symNs).toBe(1)
    // "a clean threefold gain" on the data, "only 1.41 times" end to end
    expect((ofdma.frame.txTimeNs - OPENING_NS) / (mimo.frame.txTimeNs - OPENING_NS)).toBe(3)
    expect(Math.round((ofdma.frame.txTimeNs / mimo.frame.txTimeNs) * 100) / 100).toBe(1.41)
  })

  it('"Three members deliver 12,918 bytes against two members’ 8,612"', () => {
    expect(ofdma.frame.bytes).toBe(12_918)
    expect(mimo.frame.bytes).toBe(8_612)
    expect(3 * 4_306).toBe(12_918)
    expect(2 * 4_306).toBe(8_612)
  })
})

describe('mumimo-choose · the rule the engine picks by', () => {
  const nssOf = (id: string): number => mumimo.scenario().nodes.find((n) => n.id === id)!.caps.nss ?? 1

  it('step 2: every member of every send by space clears the 1,000-byte floor', () => {
    const sends = muSends(runOf(mumimo, 1, RUN_NS))
    expect(sends.length).toBeGreaterThan(50)
    for (const r of sends) {
      for (const p of r.frame.muParts!) expect(p.bytes).toBeGreaterThanOrEqual(MUMIMO_MIN_BYTES)
    }
  })

  it('step 2’s other side: the variant with MU-MIMO off divides frequency every time', () => {
    const sends = muSends(runOf(mumimo, 0, RUN_NS))
    expect(sends.length).toBeGreaterThan(50)
    for (const r of sends) {
      expect(r.frame.muKind).toBe('ofdma')
      for (const p of r.frame.muParts!) expect(p.ruFraction).toBe(1 / r.frame.muParts!.length)
    }
  })

  it.each([[0, 'by frequency'], [1, 'by space']] as const)('steps 4 and 5 hold for every send of variant %i (%s)', (v, _name) => {
    const sends = muSends(runOf(mumimo, v, RUN_NS))
    for (const r of sends) {
      const parts = r.frame.muParts!
      // the opening once, then 13.6 µs for as many symbols as the longest member needs.
      // A slicing member keeps its own stream count as well: only `ruFraction` is recorded
      // on the part, so the stream count is read back off the scenario.
      const mode = r.frame.mode!
      const symbolsOf = (p: typeof parts[number]): number => {
        const bps = PHY_MODES[mode].ndbps[p.mcs] * toneRatio(mode, r.frame.widthMhz ?? 20)
          * (p.nss ?? nssOf(p.dst)) * (p.ruFraction ?? 1)
        return Math.ceil((16 + 8 * p.bytes + 6) / bps)
      }
      expect(r.frame.txTimeNs).toBe(OPENING_NS + PHY_MODES[mode].symNs * Math.max(...parts.map(symbolsOf)))
    }
  })

  it('the worked table’s own two columns: a third of the tones against all of them', () => {
    // 4,306 B at EHT MCS 13 on 160 MHz: three symbols on a third of the tones, one on all
    const bps = (frac: number, nss: number): number =>
      PHY_MODES.eht.ndbps[13] * toneRatio('eht', 160) * nss * frac
    expect(Math.ceil((16 + 8 * 4_306 + 6) / bps(1 / 3, 2))).toBe(3)
    expect(Math.ceil((16 + 8 * 4_306 + 6) / bps(1, 2))).toBe(1)
    expect(OPENING_NS + 3 * PHY_MODES.eht.symNs).toBe(92.8 * US)
    expect(OPENING_NS + 1 * PHY_MODES.eht.symNs).toBe(65.6 * US)
  })
})
