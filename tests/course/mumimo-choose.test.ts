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
import { readFileSync } from 'node:fs'
import { PHY_MODES, toneRatio } from '../../src/engine/phy'
import { RU26_TONES } from '../../src/engine/selectivity'
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

/**
 * **"Mixing the two divisions inside one PPDU" is a named feature of the standard, not a
 * scheduler being clever — and this engine makes the two mutually exclusive** (slice 4b, design
 * §4.5 and §7.4; the `out-of-scope` entry used to end at 「甚至可以…混着用」, which reads as the
 * former).
 *
 * The three standard facts the entry now states, each verified against the corpus rather than
 * taken from the design doc (which had itself been "corrected" in the wrong direction once):
 *
 *  - **It has a name and capability bits.** `DL MU-MIMO within OFDMA` / `UL MU-MIMO within
 *    OFDMA` occur 11 times in IEEE Std 802.11-2024 and 9 in 802.11be-2024, including the PICS
 *    rows HEP2.3.5/.6 and HEP2.4.5/.6, the `Partial Bandwidth DL/UL MU-MIMO` subfields of the HE
 *    PHY Capabilities Information field, and MIB variables of their own
 *    (`dot11HEPartialBW…MUMIMOImplemented`, `dot11EHTPartialBW{DL,UL}MUMIMOImplemented`).
 *  - **HE's floor is 106 tones**, in four places that say it in so many words: §27.1's overview
 *    ("on resource units greater than or equal to 106 tones"), §27.3.3.1.1 (DL) and §27.3.3.2.2
 *    (UL, twice — AP receive and non-AP transmit), and the DL MU-MIMO beamforming clause.
 *  - **EHT's floor is 242 tones**: §36.1.1's overview sentence and the three Partial BW DL/UL
 *    MU-MIMO capability clauses. Folded into 26-tone bins that is 4 bins and 9 bins, which is
 *    why this configuration can never land on the one, two or three bins where `ru-diversity`'s
 *    effect is largest.
 *
 * The engine half is the part that is measurable here, and it is measured: `muKind` is one value
 * per PPDU, and on the MU-MIMO variant every member holds the whole channel.
 */
describe('mumimo-choose · the two divisions are exclusive here, and the standard names the mix', () => {
  const t = mumimoChoose.limits.find((l) => l.text.includes('within OFDMA'))

  it('declares the feature, its capability bits and both RU floors', () => {
    expect(t, 'no limit mentions MU-MIMO within OFDMA').toBeDefined()
    expect(t!.kind).toBe('out-of-scope')
    for (const s of ['DL MU-MIMO within OFDMA', 'UL MU-MIMO within OFDMA', '能力位', 'MIB 变量',
      'HE 不小于 106 音调', 'EHT 不小于 242 音调', '最少四格与九格', 'useMumimo', '建成了互斥']) {
      expect(t!.text, s).toContain(s)
    }
    // …and it no longer reads as "a real scheduler could be cleverer".
    expect(t!.text).not.toContain('甚至可以在同一个 PPDU 里把两种划分混着用')
  })

  it('keeps the clause numbers in `sources`, each under its own document', () => {
    const src = mumimoChoose.sources!.join('\n')
    expect(src).toContain('IEEE Std 802.11-2024 §27.1')
    expect(src).toContain('§27.3.3.1.1')
    expect(src).toContain('§27.3.3.2.2')
    expect(src).toContain('IEEE Std 802.11be-2024 §36.1.1')
  })

  it('and the engine really never mixes them: one `muKind` per send, whole channel on space', () => {
    for (const [v, want] of [[0, 'ofdma'], [1, 'mumimo']] as const) {
      const sends = muSends(runOf(mumimo, v, RUN_NS))
      expect(sends.length, `variant ${v} built no multi-user send`).toBeGreaterThan(0)
      expect(new Set(sends.map((r) => r.frame.muKind))).toEqual(new Set([want]))
      // A space-divided member's share is the whole channel — `frac = 1` — so no member of
      // either variant ever holds a share AND shares its bins with another station.
      for (const r of sends) {
        const fracs = new Set(r.frame.muParts!.map((p) => p.ruFraction ?? 1))
        expect(fracs.size, 'a send with two different shares').toBe(1)
        if (want === 'mumimo') expect([...fracs]).toEqual([1])
        else expect([...fracs][0]).toBeLessThan(1)
      }
    }
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(ofdma.frame.txTimeNs).toBe(92.8 * US)` — with the lesson's row quoted in the `it`
 * name. So the engine is pinned and the prose is not: the sampling sweep of 2026-10-12 planted
 * six of this lesson's figures and **five went unnoticed**. Here every figure is parsed out of
 * the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **both tables are read row by row against the two sends**, by the division each row names:
 *    members, per-member payload, data symbols, frame length and per-member rate on one, and the
 *    step-by-step column on the other — including the two arithmetic cells, which are read as
 *    arithmetic (`52 + 13.6 × 3 = 92.8`), not as text.
 *  - **the symbol-count formula is read against the engine's own `txTime`**: the service bits,
 *    the tail bits and the eight bits of a byte are the three constants `phy.ts` divides by
 *    `ndbps`, so a planted one makes the lesson's own ceiling disagree with the frame.
 *  - **the two resource-unit floors are read as the grid they fold onto**: 106 and 242 tones are
 *    the standard's (class (a)), and what is read is 「折成 26 音调的格就是最少四格与九格」 —
 *    the floors over this engine's own bin, in Chinese numerals.
 */
describe('mumimo-choose · every figure the prose prints, read back out of it', () => {
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
  const WHY = [mumimoChoose.why!, ...mumimoChoose.outcomes!].join('\n')
  const TERMS = blockText(mumimoChoose.terms)
  const PIC = blockText(mumimoChoose.picture)
  const NUMS = blockText(mumimoChoose.numbers)
  const LIM = blockText(mumimoChoose.limits)
  const SRC = blockText(mumimoChoose.sources)
  const OBS = blockText(mumimoChoose.observe)
  const QUIZ = blockText(mumimoChoose.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const cn = (s: string): number => '零一二三四五六七八九十'.indexOf(s === '两' ? '二' : s)
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    mumimoChoose.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]
  const ofdma = cleanSend(runOf(mumimo, 0, RUN_NS), 3)
  const mimo = cleanSend(runOf(mumimo, 1, RUN_NS), 2)
  const sendOf = (label: string): Tx => (label.includes('频率') ? ofdma : mimo)
  const rateOf = (r: Tx): number => (r.frame.muParts![0]!.bytes * 8) / (r.frame.txTimeNs / 1000)
  const symbolsOf = (r: Tx): number => (r.frame.txTimeNs - OPENING_NS) / PHY_MODES.eht.symNs

  it('reads the first table row by row, by the division each row names', () => {
    const tb = tables()[0]!
    // 「160 MHz，每部手机两条流」 — the heading names the scene both rows come from
    const [widthMhz] = figs(tb.heading!, /(\d+) MHz/, 'the table’s own heading')
    const [streamsCn] = raw(tb.heading!, /每部手机(.)条流/, 'the heading on the streams')
    const sc = mumimoChoose.scenario()
    const phones = sc.nodes.filter((n) => n.kind === 'sta' && (n.profiles ?? []).includes('video'))
    expect(sc.nodes.find((n) => n.kind === 'ap')!.caps.widthMhz, 'the channel this scene runs')
      .toBe(widthMhz)
    for (const p of phones) {
      expect(p.caps.nss, `${p.id}: the streams it negotiated`).toBe(cn(streamsCn!))
    }
    for (const row of tb.rows) {
      const [label, members, payload, symbols, length, rate] = row as string[]
      const send = sendOf(label!)
      expect(val(members!), `${label}: the members that send really carries`)
        .toBe(send.frame.muParts!.length)
      for (const part of send.frame.muParts!) {
        expect(val(payload!.replace(' B', '')), `${label}: every member’s payload`).toBe(part.bytes)
      }
      expect(val(symbols!), `${label}: the data symbols it takes`).toBe(symbolsOf(send))
      same(length!.replace(' µs', ''), send.frame.txTimeNs / 1000, `${label}: its length`)
      same(rate!.replace(' Mb/s', ''), rateOf(send), `${label}: and the rate one member sees`)
    }
  })

  it('reads the length formula, its two addends and the 1.41 it ends in', () => {
    // 「整帧长度 = 52 µs + 13.6 µs × 数据符号数」
    const formula = mumimoChoose.numbers!.find((b) => b.kind === 'formula') as unknown as
      { text: string; note: string }
    const [opening, perSymbol] = figs(formula.text,
      /整帧长度 = ([\d.]+) µs \+ ([\d.]+) µs × 数据符号数/, 'the formula line')
    expect(opening! * US, 'the opening every multi-user send pays').toBe(OPENING_NS)
    expect(perSymbol! * US, 'and one data symbol').toBe(PHY_MODES.eht.symNs)
    for (const send of [ofdma, mimo]) {
      expect(opening! * US + perSymbol! * US * symbolsOf(send), 'the formula gives that send’s length')
        .toBe(send.frame.txTimeNs)
    }
    // 「这里的 52 µs，是 Wi-Fi 7 帧的 48 µs 前导码加上 4 µs 的…分配表」
    const [again, preamble, extra] = figs(formula.note,
      /这里的 ([\d.]+) µs，是 Wi-Fi \d 帧的 ([\d.]+) µs 前导码加上 ([\d.]+) µs/,
      'the note on the opening')
    expect(again, 'the same opening, named twice').toBe(opening)
    expect(preamble! * US, 'the preamble this mode really has').toBe(PHY_MODES.eht.preambleNs)
    expect(extra! * US, 'and what the multi-user signalling adds')
      .toBe(PHY_MODES.eht.muExtraPreambleNs)
    expect(preamble! + extra!, 'which together are the opening').toBe(opening)
    // 「可整帧算下来只差 1.41 倍」 — in the note, in an outcome and in `observe`
    const ratios = [
      figs(formula.note, /只差 ([\d.]+) 倍/, 'the note on the ratio')[0]!,
      figs(WHY, /整帧为什么只差 ([\d.]+) 倍/, 'the outcome on the same ratio')[0]!,
      figs(OBS, /只有 ([\d.]+) 倍/, '`observe` on the same ratio')[0]!,
    ]
    expect(new Set(ratios).size, 'one ratio, three places').toBe(1)
    same(String(ratios[0]), ofdma.frame.txTimeNs / mimo.frame.txTimeNs, 'the two lengths’ ratio')
    // 「干净的三倍增益」 — the data段 alone, in Chinese
    const [threeCn] = raw(formula.note, /干净的(.)倍增益/, 'the note on the data gain')
    expect((ofdma.frame.txTimeNs - OPENING_NS) / (mimo.frame.txTimeNs - OPENING_NS),
      'the data segments’ own ratio').toBe(cn(threeCn!))
    // 「本仿真器为 Wi-Fi 7 帧取 13.6 µs」 — the term says it again
    const [termSym] = figs(TERMS, /本仿真器为 Wi-Fi \d 帧取 ([\d.]+) µs/, 'the term on the symbol')
    expect(termSym, 'the same symbol, a fourth time').toBe(perSymbol)
  })

  it('reads the symbol-count formula against the engine’s own TXTIME', () => {
    /*
     * 「⌈(16 + 8 × 字节数 + 6) ÷ 每符号比特数⌉」 — the three constants `phy.ts` divides by
     * `ndbps`, read by rebuilding the ceiling with them and requiring it to be the symbol count
     * the frame really took.
     */
    const [service, bits, tail] = figs(NUMS,
      /⌈\((\d+) \+ (\d) × 字节数 \+ (\d)\) ÷ 每符号比特数⌉/, '`numbers` on the symbol count')
    const PHY_SRC = readFileSync(new URL('../../src/engine/phy.ts', import.meta.url), 'utf8')
    const [srcService, srcBits, srcTail] = figs(PHY_SRC,
      /Math\.ceil\(\((\d+) \+ (\d) \* lengthBytes \+ (\d)\) \/ ndbps\)/,
      'the engine’s own ceiling')
    expect([service, bits, tail], 'the three constants the engine really divides')
      .toEqual([srcService, srcBits, srcTail])
    for (const send of [ofdma, mimo]) {
      const part = send.frame.muParts![0]!
      const ndbps = ((part.bytes * 8) + service! + tail!) / symbolsOf(send)
      expect(Math.ceil((service! + bits! * part.bytes + tail!) / ndbps),
        'the ceiling gives the symbols that send really took').toBe(symbolsOf(send))
    }
    // 「按频率划分时，每符号比特数要乘上它分到的子载波占比」
    const [shareCn] = raw(NUMS, /每个成员拿到的子载波.*?(三分之一)/s, 'the table on the share')
    expect(shareCn, 'a third of the sub-carriers').toBe('三分之一')
    expect(new Set(ofdma.frame.muParts!.map((p) => p.ruFraction)), 'which the parts really carry')
      .toEqual(new Set([1 / ofdma.frame.muParts!.length]))
    expect(new Set(mimo.frame.muParts!.map((p) => p.ruFraction ?? 1)), 'while the other takes it all')
      .toEqual(new Set([1]))
  })

  it('reads the step-by-step table, including its two arithmetic cells', () => {
    const tb = tables()[1]!
    expect(tb.heading, 'the table is about one payload, twice')
      .toContain(`${ofdma.frame.muParts![0]!.bytes.toLocaleString('en-US')} 字节`)
    const cell = (needle: string): string[] => tb.rows.find((r) => r[0]!.includes(needle))!.slice(1)
    for (const [c, label] of tb.head.slice(1).entries()) {
      const send = sendOf(label!)
      // 「裁完后的成员数」 and 「每个成员的符号数」
      expect(val(cell('裁完后的成员数')[c]!), `${label}: the members left`)
        .toBe(send.frame.muParts!.length)
      expect(val(cell('每个成员的符号数')[c]!), `${label}: the symbols each takes`)
        .toBe(symbolsOf(send))
      // 「于是这次发送的长度是」: read as the arithmetic it prints
      const [open, per, syms, total] = figs(cell('于是这次发送的长度是')[c]!,
        /([\d.]+) \+ ([\d.]+) × (\d+) = ([\d.]+) µs/, `${label}: the length cell`)
      expect(open! * US, `${label}: the opening`).toBe(OPENING_NS)
      expect(per! * US, `${label}: the symbol`).toBe(PHY_MODES.eht.symNs)
      expect(syms, `${label}: the symbols`).toBe(symbolsOf(send))
      same(String(total), send.frame.txTimeNs / 1000, `${label}: and the product plus the opening`)
      expect(open! + per! * syms!, `${label}: the arithmetic the cell prints`).toBe(total)
      // 「这一次合起来交付」
      same(cell('这一次合起来交付')[c]!.replace(' B', ''), send.frame.bytes,
        `${label}: what the send delivers altogether`)
      // 「都协商过 MU-MIMO，且队首都有 1,000 字节」: a yes/no cell, and the threshold in its label
      expect(cell('都协商过 MU-MIMO')[c], `${label}: whether every candidate qualified`)
        .toBe(send.frame.muKind === 'mumimo' ? '是' : '否')
    }
    // 「12,918 字节，两个成员是 8,612 字节」 — the paragraph prints both deliveries again
    const [three, two] = figs(NUMS, /三个成员一次交付 ([\d,]+) 字节，两个成员是 ([\d,]+) 字节/,
      '`numbers` on the two deliveries')
    expect([three, two], 'the two sends’ own totals')
      .toEqual([ofdma.frame.bytes, mimo.frame.bytes])
  })

  it('reads the threshold, the group cap and the resource-unit floors', () => {
    /*
     * 「MUMIMO_MIN_BYTES = 1000，看的是每个候选队首那一帧有多大（mac.ts）」 — the threshold is
     * read off the file `limits` names, and the figure is printed in four more places.
     */
    const MAC_SRC = readFileSync(new URL('../../src/engine/mac.ts', import.meta.url), 'utf8')
    const [name, value] = raw(LIM, /(MUMIMO_MIN_BYTES) = (\d+)/, '`limits` on the threshold')
    const [inEngine] = figs(MAC_SRC, new RegExp(`const ${name} = ([\\d_]+)`), 'the engine’s own line')
    expect(val(value!), 'the threshold the engine really uses').toBe(inEngine)
    for (const [text, re, what] of [
      [PIC, /低于 ([\d,]+) 字节，它就按频率划分/, '`picture` on the threshold'],
      [NUMS, /每一部队首那一帧都有 ([\d,]+) 字节吗/, 'the step on the threshold'],
      [SRC, /([\d,]+) 字节的门槛/, '`sources` on the threshold'],
      [QUIZ, /队首那一帧不到 ([\d,]+) 字节/, 'the quiz on the threshold'],
    ] as [string, RegExp, string][]) {
      expect(figs(text, re, what)[0], what).toBe(val(value!))
    }
    // 「一组最多四个成员…`muDsts.slice(0, 4)`」
    const [from, cap] = figs(SRC, /muDsts\.slice\((\d), (\d)\)/, '`sources` on the group cap')
    expect(MAC_SRC, 'the engine really slices that way').toContain(`muDsts.slice(${from}, ${cap})`)
    const [capCn] = raw(SRC, /一组最多(.)个成员/, '`sources` on the same cap')
    expect(cn(capCn!), 'the cap, in characters and in digits').toBe(cap)
    for (const send of [ofdma, mimo]) {
      expect(send.frame.muParts!.length, 'and no send exceeds it').toBeLessThanOrEqual(cap!)
    }
    /*
     * **Exempt, class (a): the two tone floors.** 「HE 不小于 106 音调，EHT 不小于 242 音调」 are
     * the standard's own and no corpus ships with this repo; `sources` cites the clauses. What is
     * read is the sentence that follows them — 「折成 26 音调的格就是最少四格与九格」 — which is
     * those floors over this engine's own bin, and the bin is `RU26_TONES`.
     */
    const [he, eht, bin] = figs(LIM,
      /HE 不小于 (\d+) 音调，EHT 不小于 (\d+) 音调，折成 (\d+) 音调的格/, '`limits` on the floors')
    expect(bin, 'the grid this engine splits a channel into').toBe(RU26_TONES)
    const [fourCn, nineCn] = raw(LIM, /就是最少(.)格与(.)格/, '`limits` on the two counts')
    expect(Math.floor(he! / bin!), 'the HE floor, in bins').toBe(cn(fourCn!))
    expect(Math.floor(eht! / bin!), 'and the EHT floor').toBe(cn(nineCn!))
    // `sources` prints the same two floors
    const [srcHe] = figs(SRC, /资源单元不小于 (\d+) 音调/, '`sources` on the HE floor')
    const [srcEht] = figs(SRC, /不小于 (\d+) 音调）。/, '`sources` on the EHT floor')
    expect([srcHe, srcEht], 'the same two floors, a second time').toEqual([he, eht])
  })

  it('reads the three figures of the opening wherever they are printed again', () => {
    /*
     * **Nine of this lesson's figures were second printings** (sweep of 2026-10-14): the step that
     * repeats the opening, the row label that repeats the threshold, `limits` repeating the ratio
     * and `sources` repeating all three parts of the length. Each is read against the same
     * measurement its first printing was read against — 「同一个数印第二遍就是第二个窝」.
     */
    // 「48 µs 前导码，加 4 µs 分配表，然后每个符号 13.6 µs」 (a step) and the same in `sources`
    for (const [text, re, what] of [
      [NUMS, /([\d.]+) µs 前导码，加 ([\d.]+) µs 分配表，然后每个符号 ([\d.]+) µs/, 'the step on the length'],
      [SRC, /([\d.]+) µs 前导码、多用户信令多出的 ([\d.]+) µs 以及 ([\d.]+) µs 的符号/,
        '`sources` on the same three'],
    ] as [string, RegExp, string][]) {
      const [preamble, extra, perSymbol] = figs(text, re, what)
      expect(preamble! * US, `${what}: the preamble`).toBe(PHY_MODES.eht.preambleNs)
      expect(extra! * US, `${what}: the signalling`).toBe(PHY_MODES.eht.muExtraPreambleNs)
      expect(perSymbol! * US, `${what}: and the symbol`).toBe(PHY_MODES.eht.symNs)
      expect((preamble! + extra!) * US, `${what}: which together are the opening`).toBe(OPENING_NS)
    }
    // 「两条路上，4,306 字节分别要三个符号和一个符号」
    const [bytes] = figs(NUMS, /两条路上，([\d,]+) 字节分别要/, 'the step on the payload')
    const [manyCn, oneCn] = raw(NUMS, /分别要(.)个符号和(.)个符号/, 'the step on the two counts')
    for (const send of [ofdma, mimo]) {
      for (const part of send.frame.muParts!) {
        expect(part.bytes, 'the payload every member of either send carries').toBe(bytes)
      }
    }
    expect([cn(manyCn!), cn(oneCn!)], 'the symbols the two sends really take')
      .toEqual([symbolsOf(ofdma), symbolsOf(mimo)])
    /*
     * 「都协商过 MU-MIMO，且队首都有 1,000 字节」 — the threshold again, in a row label this time,
     * and it is read as what it decides: the division each column really used.
     */
    const tb = tables()[1]!
    const label = tb.rows.find((r) => r[0]!.includes('都协商过 MU-MIMO'))![0]!
    const [rowThreshold] = figs(label, /队首都有 ([\d,]+) 字节/, 'the row label on the threshold')
    const MAC_SRC = readFileSync(new URL('../../src/engine/mac.ts', import.meta.url), 'utf8')
    const [inEngine] = figs(MAC_SRC, /const MUMIMO_MIN_BYTES = ([\d_]+)/, 'the engine’s own line')
    expect(rowThreshold, 'the threshold the engine really applies').toBe(inEngine)
    for (const send of [ofdma, mimo]) {
      if (send.frame.muKind !== 'mumimo') continue
      for (const part of send.frame.muParts!) {
        expect(part.bytes, 'and the spatial send’s members really clear it')
          .toBeGreaterThanOrEqual(rowThreshold!)
      }
    }
    // 「所以「1.41 倍」是一个纯时间的比值」 — the ratio, a fourth time
    const [limRatio] = figs(LIM, /所以「([\d.]+) 倍」是一个纯时间的比值/, '`limits` on the ratio')
    same(String(limRatio), ofdma.frame.txTimeNs / mimo.frame.txTimeNs, 'the two lengths’ ratio')
  })

  it('reads `observe` against the same two sends', () => {
    // 「每份各占三分之一条信道，单成员速率 371.2 Mb/s；…525.1 Mb/s」
    const [ofdmaRate, mimoRate] = figs(OBS,
      /单成员速率 ([\d.]+) Mb\/s；第二个变体里，同样的块只装两份，各自独占整条信道，([\d.]+) Mb\/s/,
      '`observe` on the two rates')
    same(String(ofdmaRate), rateOf(ofdma), 'the rate one member of the wider group sees')
    same(String(mimoRate), rateOf(mimo), 'and of the narrower one')
    // 「同一份 4,306 字节，一边要三个数据符号，一边只要一个」
    const [bytes] = figs(OBS, /同一份 ([\d,]+) 字节/, '`observe` on the payload')
    expect(bytes, 'the payload both sends carry per member').toBe(ofdma.frame.muParts![0]!.bytes)
    const [manyCn, oneCn] = raw(OBS, /一边要(.)个数据符号，一边只要(.)个/,
      '`observe` on the two symbol counts')
    expect([cn(manyCn!), cn(oneCn!)], 'the symbols the two sends really take')
      .toEqual([symbolsOf(ofdma), symbolsOf(mimo)])
    // 「92.8 µs 对 65.6 µs」
    const [longUs, shortUs] = figs(OBS, /([\d.]+) µs 对 ([\d.]+) µs/, '`observe` on the two lengths')
    same(String(longUs), ofdma.frame.txTimeNs / 1000, 'the longer send')
    same(String(shortUs), mimo.frame.txTimeNs / 1000, 'and the shorter one')
  })
})
