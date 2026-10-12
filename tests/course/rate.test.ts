/**
 * Every empirical claim in "Rate control — picking how fast to talk", measured
 * against the lesson's own scene.
 *
 * The lesson was 2 009 words and became two (plan ruling 2): this half owns the
 * ceiling, the three rungs the far station uses and the near station that never
 * has to choose; `rate-fallback` owns the loop itself and what it costs the
 * room. Neither half changes `rateScenario`, so the recorded hash is untouched.
 *
 * Re-paced on 2026-09-25 (§2 M9: the lesson stays whole and gives up its `steps`
 * block). §5.1.3 deletes the ARF rule from this lesson, so the pins that guarded
 * it — a lone failure moving nothing, the two failures in a row at attempts 192
 * and 193, and the ten answered frames that climb back — moved with the prose to
 * tests/course/rate-fallback.test.ts. What is pinned here instead is the
 * procedure this lesson does own: the five steps of the ceiling itself, from
 * `mcsForPeer` in src/engine/simulation.ts and `mcsForRssi` in
 * src/engine/phy.ts, including the capability cap that is step 3.
 *
 * The old lesson had no test file of its own: its pins lived in
 * tests/course/quoted-timestamps.test.ts (the airtimes, the excursions, the
 * loss rates, the freezes, the two experiments) and one shape check in
 * tests/course/lessons.test.ts. Those files are untouched and stay green — they
 * read `l.scenario()` only, never prose. What is pinned here is what this
 * half's own sentences say. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { Simulation } from '../../src/engine/simulation'
import { rate } from '../../src/course/tier2/rate'
import { rateScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { buildLinkTable } from '../../src/engine/propagation'
import { negotiated, negotiatedNss, negotiatedWidth } from '../../src/model/caps'
import {
  ACK_TIMEOUT_NS, NOISE_FIGURE_DB, PHY_MODES, RATE_MARGIN_DB, mcsForRssi, noiseDbm, reqSinrDb,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
/** The three seconds every number in this lesson is measured over. */
const RUN_NS = 3_000 * MS
/** Long enough for all three jump targets; the shape suite asks for no more. */
const JUMP_NS = 200 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const pct = (a: number, b: number): number => Math.round((a / b) * 1000) / 10

/**
 * The far station's run after moving it `d` metres straight towards the router — the two
 * experiments of `tryThis`, memoised because both the experiments below and the read-back at the
 * bottom of this file ask for the same four distances, and each one is a three-second run.
 */
const movedRuns = new Map<number, { frames: number; ceiling: number; zero: number; trace: string }>()
/**
 * A digest rather than the trace itself: four of these are now kept for the whole file, and a
 * three-second trace is megabytes of string. 「一帧不差地重来一遍」 is an equality either way.
 */
const digest = (s: string): string => createHash('sha1').update(s).digest('hex')
const moved = (d: number) => {
  const hit = movedRuns.get(d)
  if (hit) return hit
  const sc = rate.scenario()
  const ap = sc.nodes.find((x) => x.id === 'ap')!.pos
  const n = sc.nodes.find((x) => x.id === 'sta-2')!
  const len = Math.hypot(ap.x - n.pos.x, ap.y - n.pos.y)
  n.pos = {
    x: n.pos.x + ((ap.x - n.pos.x) / len) * d,
    y: n.pos.y + ((ap.y - n.pos.y) / len) * d,
    z: n.pos.z,
  }
  const recs = [...new Simulation(sc).runUntil(RUN_NS).records]
  const far = data(recs, 'sta-2')
  const out = {
    frames: far.length,
    ceiling: Math.max(...far.map((r) => r.frame.mcs!)),
    zero: far.filter((r) => r.frame.mcs === 0).length,
    trace: digest(JSON.stringify(recs.map((r) => (r.type === 'TX_START'
      ? [r.t, r.node, r.frame.mcs, r.frame.txTimeNs] : null)).filter(Boolean))),
  }
  movedRuns.set(d, out)
  return out
}

lessonShapeSuite(rate, { runNs: JUMP_NS })

describe('rate · the lesson’s own scene', () => {
  it('is the Tier 2 rate lesson, and names the lessons its words come from', () => {
    expect(MODULES[rate.module].title).toBe('容量旋钮与速率控制')
    // §6 of the re-pacing plan: the rung ladder and the alibi for the rate anomaly are
    // their own lessons now, so those are the ids this lesson's words come from.
    expect(rate.needs).toEqual(['mcs-ladder', 'retries-queues', 'rate-vs-model', 'width'])
    // MCS is mcs-ladder's word, ACK and ACK timeout come through retries-queues;
    // these two are this lesson's own.
    expect(rate.terms!.map((t) => t.term)).toEqual(['ceiling', 'attempt'])
  })

  it('keeps the scenario builder untouched, and has no variants', () => {
    expect(rate.scenario()).toEqual(rateScenario())
    expect(rate.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(rate.scenario())).not.toThrow()
  })

  it('"two stations upload flat out": one beside the router, one behind a brick wall', () => {
    const sc = rate.scenario()
    const near = sc.nodes.find((n) => n.id === 'sta-1')!
    const far = sc.nodes.find((n) => n.id === 'sta-2')!
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    expect([near.profiles, far.profiles]).toEqual([['saturated'], ['saturated']])
    // "a metre from the router" / "in the far corner"
    expect(Math.round(Math.hypot(near.pos.x - ap.pos.x, near.pos.y - ap.pos.y))).toBe(1)
    expect(Math.hypot(far.pos.x - ap.pos.x, far.pos.y - ap.pos.y)).toBeGreaterThan(10)
    expect(sc.walls.length).toBeGreaterThan(0)
  })
})

describe('rate · the far station’s three rungs', () => {
  const far = data(runOf(rate, undefined, RUN_NS), 'sta-2')
  const atRung = (mcs: number): Tx => far.find((r) => r.frame.mcs === mcs)!
  const share = (mcs: number): number => pct(far.filter((r) => r.frame.mcs === mcs).length, far.length)

  it('the table is that run: 524.0, 768.8 and 1,476.0 µs at 25.8, 17.2 and 8.6 Mb/s', () => {
    expect(far.length).toBe(3_003)
    for (const r of far) expect(r.frame.bytes).toBe(1_530)
    expect([atRung(2).frame.txTimeNs, atRung(1).frame.txTimeNs, atRung(0).frame.txTimeNs])
      .toEqual([524_000, 768_800, 1_476_000])
    expect([atRung(2).frame.mbps, atRung(1).frame.mbps, atRung(0).frame.mbps])
      .toEqual([25.8, 17.2, 8.6])
    // the "Share of its frames" column
    expect([share(2), share(1), share(0)]).toEqual([79.8, 17.2, 3.0])
    expect(new Set(far.map((r) => r.frame.mcs))).toEqual(new Set([0, 1, 2]))
  })

  it('"almost three times the air at the bottom rung", and each step down halves the bits', () => {
    expect(Math.round((1_476_000 / 524_000) * 10) / 10).toBe(2.8)
    // "each step down halves, or nearly halves, the bits every chunk of signal carries":
    // the airtime of a fixed payload is inversely proportional to that, less the preamble.
    const payload = (ns: number): number => ns - 48_000
    expect(payload(768_800) / payload(524_000)).toBeGreaterThan(1.4)
    expect(payload(1_476_000) / payload(768_800)).toBeGreaterThan(1.9)
  })

  it('"the ceiling itself never moves: it does not send above MCS 2 once"', () => {
    expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(2)
  })
})

describe('rate · the station that never has to choose', () => {
  const rs = runOf(rate, undefined, RUN_NS)
  const near = data(rs, 'sta-1')

  it('4,010 frames in three seconds, every one at MCS 11, and not one goes unanswered', () => {
    expect(near.length).toBe(4_010)
    expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([11]))
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1')).toHaveLength(0)
  })

  it('MCS 11 is where the agreed capabilities stop, not where the signal does', () => {
    // "That rung is not where its signal runs out — 58.7 dB would carry the top rung — but
    //  where the two ends' agreed capabilities stop: neither of them offered the two densest
    //  rungs on this scene, so the ceiling is capped below them."
    const sc = rate.scenario()
    for (const n of sc.nodes) expect(n.caps.features?.qam4k ?? false, n.id).toBeFalsy()
    expect(negotiated(sc.nodes.find((n) => n.id === 'sta-1')!, sc.nodes.find((n) => n.id === 'ap')!, 'qam4k')).toBe(false)
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
    expect(Math.round((rssi - noiseDbm(20)) * 10) / 10).toBe(58.7)
    // the engine's own cap: `mcsForPeer` passes 11 when the pair has not negotiated 4096-QAM
    expect(mcsForRssi('eht', rssi, 11, 20)).toBe(11)
    expect(mcsForRssi('eht', rssi, 13, 20)).toBe(13)
  })
})

describe('rate · the ceiling, as the engine computes it', () => {
  const rs = runOf(rate, undefined, RUN_NS)
  const far = data(rs, 'sta-2')

  it('steps 1, 2 and 4: the ceiling of the far link is MCS 2, and the table’s arithmetic says why', () => {
    // "RSSI −75.46 dBm · less the noise floor, 20 MHz −93.99 · = SNR 18.53 dB · MCS 2 asks
    //  13.99 + 3 = 16.99 ✓ · MCS 3 asks 16.99 + 3 = 19.99 ✗ · so the ceiling is MCS 2"
    const sc = rate.scenario()
    const rssi = buildLinkTable(sc.nodes, sc.walls).get('sta-2')!.get('ap')!
    const r2 = (x: number) => Math.round(x * 100) / 100
    expect(r2(rssi)).toBe(-75.46)
    expect(r2(noiseDbm(20))).toBe(-93.99)
    expect(r2(rssi - noiseDbm(20))).toBe(18.53)
    expect(RATE_MARGIN_DB).toBe(3)
    expect([r2(reqSinrDb('eht', 2)), r2(reqSinrDb('eht', 3))]).toEqual([13.99, 16.99])
    expect(r2(reqSinrDb('eht', 2) + RATE_MARGIN_DB)).toBe(16.99)
    expect(r2(reqSinrDb('eht', 3) + RATE_MARGIN_DB)).toBe(19.99)
    expect(rssi - noiseDbm(20)).toBeGreaterThan(reqSinrDb('eht', 2) + RATE_MARGIN_DB)
    expect(rssi - noiseDbm(20)).toBeLessThan(reqSinrDb('eht', 3) + RATE_MARGIN_DB)
    expect(mcsForRssi('eht', rssi, 11, 20)).toBe(2)
  })

  it('step 3: the cap is a capability, not a signal — 4096-QAM is not negotiated here', () => {
    // "if the two ends have not both offered 4096-QAM the ceiling is capped at MCS 11 first,
    //  and this step looks at capabilities alone": the cap `mcsForPeer` passes to mcsForRssi.
    const sc = rate.scenario()
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    for (const id of ['sta-1', 'sta-2']) {
      expect(negotiated(sc.nodes.find((n) => n.id === id)!, ap, 'qam4k'), id).toBe(false)
    }
    // the cap binds the near link (which has signal to spare) and not the far one, which the
    // signal stops two rungs lower — the table's own two rows
    const table = buildLinkTable(sc.nodes, sc.walls)
    expect(mcsForRssi('eht', table.get('sta-1')!.get('ap')!, 11, 20)).toBe(11)
    expect(mcsForRssi('eht', table.get('sta-2')!.get('ap')!, 11, 20)).toBe(2)
  })

  it('step 5: the working rung is pulled down to the ceiling, so the first frame goes out there', () => {
    // "the working rung is pulled down to the ceiling the moment it sits above it — the first
    //  frame ever": RateControl.mcsFor clamps on every read, and the run's first frame shows it.
    expect(far[0].frame.mcs).toBe(2)
    expect(Math.max(...far.map((r) => r.frame.mcs!))).toBe(2)
  })
})

describe('rate · the two experiments', () => {
  it('half a metre changes nothing; two metres raises the ceiling to MCS 3', () => {
    const d0 = moved(0), dHalf = moved(0.5), d2 = moved(2)
    // "it crosses no threshold, and the run comes back frame for frame identical"
    expect(dHalf.trace).toBe(d0.trace)
    // "the ceiling rises from MCS 2 to MCS 3 — 3,712 frames instead of 3,003"
    expect([d0.ceiling, d2.ceiling]).toEqual([2, 3])
    expect([d0.frames, d2.frames]).toEqual([3_003, 3_712])
  })

  it('five metres closer and the bottom rung never occurs at all', () => {
    expect(moved(5).zero).toBe(0)
    expect(moved(0).zero).toBeGreaterThan(0)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine against a literal written in THIS file —
 * `expect(far.length).toBe(3_003)`, `expect(r2(rssi)).toBe(-75.46)`,
 * `expect([share(2), share(1), share(0)]).toEqual([79.8, 17.2, 3.0])`. That is what keeps the
 * engine honest, and it is also why every figure in the lesson could be edited to a neighbouring
 * number with this file still green: the number being compared sits on the test's own side.
 *
 * What follows is the other half of each, with no figure on this side. Both tables are read cell
 * by cell — the rung ladder's three rates, three airtimes and three shares, each to the decimals
 * its own cell carries, and the worked ceiling's seven rows **including the ✓ and the ✗**, which
 * are claims about an inequality and are checked as such. The near station's 一米, its 4,010
 * frames and its 58.7 dB come off their sentence; the 「三秒」 that every census in this lesson is
 * counted over is read as the run length, twice; 「将近上限三倍」 is read the way this programme
 * reads 「接近」 — it rounds to three and is not yet three; and both experiments' distances and
 * frame counts come off `tryThis`.
 *
 * `limits` is read too, and its sharpest figure turns into a measurement of its own: 「差 0.01 dB
 * 就整帧丢掉」 is asserted as one hundredth of a decibel flipping `mcsForRssi` from one rung to
 * the next, which is what a cliff with no transition band means. Beside it: the two decimal
 * places the ceiling is printed to, the 3 dB margin that is this simulator's own pick, and the
 * two noise figures the requirement is derived with and the floor is computed with — the sentence
 * is only worth anything if those two differ, so that is asserted rather than assumed.
 *
 * **Two claims are left unasserted, with their reasons.** 「一次触发回合里回来的 TB PPDU 既不报
 * 成功也不报失败」 is about a scene this lesson does not own (`@ofdma-ul`'s), and measuring it
 * here would mean building that scene in this file; what is checked is that the three names the
 * sentence cites — `onTxOutcome`, `sendMba`, `resolveDlMu` — are code in the file it cites them
 * in. And 「接近减半」 is bounded on one side only, because the sentence bounds it on one side
 * only: no step down ever carries more than half the bits of the rung above it.
 */
describe('rate · every printed figure is read back out of the lesson', () => {
  const rs = runOf(rate, undefined, RUN_NS)
  const far = data(rs, 'sta-2')
  const near = data(rs, 'sta-1')
  const sc = rate.scenario()
  const ap = sc.nodes.find((n) => n.id === 'ap')!
  const links = buildLinkTable(sc.nodes, sc.walls)
  const snrOf = (id: string): number => links.get(id)!.get('ap')! - noiseDbm(20)
  const rungsUsed = [...new Set(far.map((r) => r.frame.mcs!))].sort((a, b) => b - a)

  const tables = rate.numbers!.filter((x) => x.kind === 'table') as
    { heading: string; head: string[]; rows: string[][] }[]
  const prose = (fragment: string): string => {
    const b = rate.numbers!.find((x) => (x as { heading?: string }).heading?.includes(fragment)) as
      { text?: string } | undefined
    expect(b?.text, `no block of \`numbers\` headed 「${fragment}」 with prose in it`).toBeDefined()
    return b!.text!
  }
  const steps = (rate.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const limitText = rate.limits.map((x) => x.text).join('\n')
  const quizText = rate.quiz!.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')

  /** The captures of `re`, as numbers: a full-width minus is a minus, a comma is a group. */
  const figs = (text: string, re: RegExp, what: string): number[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1).map((x) => Number(x.replace(/[\s,]/g, '').replace(/−/g, '-')))
  }
  /** The captures of `re`, as printed: for a figure whose own decimals are part of the claim. */
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1)
  }
  /** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** 「524.0 µs」 → 「524.0」: a cell that is one figure and its unit, and nothing else. */
  const cell = (text: string, unit: string, what: string): string => {
    const m = new RegExp(`^([−\\d,.]+)\\s*${unit}$`).exec(text.trim())
    expect(m, `${what}: the cell 「${text}」 is not a figure followed by ${unit}`).not.toBeNull()
    return m![1]
  }
  /** `zhNumeral` reads 〇–九十九 and not 「两」, which is the form a quantified noun takes. */
  const zhCount = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
    return n!
  }
  const counted = (text: string, re: RegExp, what: string): number =>
    zhCount(raw(text, re, what)[0])

  it('the rung table’s heading: three rungs, one payload, one width, one stream', () => {
    const rungs = counted(tables[0].heading, /([〇一二三四五六七八九十两]+)个级别/, 'the rungs')
    const [bytes, width] = figs(tables[0].heading, /同样的 ([\d,]+) 字节，(\d+) MHz/,
      'the payload and the width every row shares')
    expect(rungsUsed.length).toBe(rungs)
    expect(new Set(far.map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(new Set(far.map((r) => r.frame.widthMhz))).toEqual(new Set([width]))
    expect(negotiatedWidth(sc.nodes.find((n) => n.id === 'sta-2')!, ap)).toBe(width)
    // 「单流」: 单 is the word for one, and the pair never agreed on more than one stream
    expect(tables[0].heading).toContain('单流')
    expect(negotiatedNss(sc.nodes.find((n) => n.id === 'sta-2')!, ap)).toBe(1)
  })

  it('the rung table’s three rows are the rungs, the rates, the airtimes and the shares', () => {
    expect(tables[0].rows, 'the table states exactly the three rows this reads').toHaveLength(3)
    for (const row of tables[0].rows) {
      const [mcs] = figs(row[0], /^MCS (\d+)/, `the rung 「${row[0]}」 names`)
      const mine = far.filter((r) => r.frame.mcs === mcs)
      expect(mine.length, `MCS ${mcs} is a rung this run never uses`).toBeGreaterThan(0)
      expect(new Set(mine.map((r) => r.frame.mbps)).size, `MCS ${mcs} at one rate`).toBe(1)
      expect(new Set(mine.map((r) => r.frame.txTimeNs)).size, `MCS ${mcs} at one airtime`).toBe(1)
      same(cell(row[1], 'Mb/s', `MCS ${mcs}’s rate`), mine[0].frame.mbps, `MCS ${mcs}’s rate`)
      same(cell(row[2], 'µs', `MCS ${mcs}’s airtime`), mine[0].frame.txTimeNs / US,
        `MCS ${mcs}’s airtime in µs`)
      same(cell(row[3], '%', `MCS ${mcs}’s share`), (mine.length / far.length) * 100,
        `MCS ${mcs}’s share of the ${far.length} frames this station sent`)
      // 「它的上限」 and 「最底一级」: the two rows that claim something about the ladder's ends
      if (row[0].includes('上限')) expect(Math.max(...rungsUsed)).toBe(mcs)
      if (row[0].includes('最底')) expect(Math.min(...rungsUsed)).toBe(mcs)
    }
  })

  it('「降一级要付什么」: nearly three times the air at the bottom, never more than a halving', () => {
    const text = prose('降一级要付什么')
    const times = counted(text, /将近上限([〇一二三四五六七八九十两]+)倍/, 'the cost at the bottom rung')
    const airOf = (mcs: number): number => far.find((r) => r.frame.mcs === mcs)!.frame.txTimeNs
    const ratio = airOf(Math.min(...rungsUsed)) / airOf(Math.max(...rungsUsed))
    // 「将近」 is a claim of its own: it rounds to that many times, and it is not yet that many
    expect(Math.round(ratio), `${airOf(Math.min(...rungsUsed)) / US} µs over `
      + `${airOf(Math.max(...rungsUsed)) / US} µs`).toBe(times)
    expect(ratio, '「将近」 says the bottom rung has not reached that multiple').toBeLessThan(times)
    // 「每一块信号能装的比特数就减半或接近减半」: 减半 is to halve, and the sentence bounds the
    // step on one side only — so this does too. No rung carries more than half the one above.
    expect(text).toContain('减半或接近减半')
    const rates = rungsUsed.map((m) => far.find((r) => r.frame.mcs === m)!.frame.mbps)
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i - 1] / rates[i], `${rates[i - 1]} Mb/s over ${rates[i]} Mb/s`)
        .toBeLessThanOrEqual(2)
    }
  })

  it('「那台根本不用做选择的站点」: one metre, three seconds, 4,010 frames, 58.7 dB to spare', () => {
    const text = prose('那台根本不用做选择的站点')
    const metres = counted(text, /离接入点([〇一二三四五六七八九十两]+)米远/, 'how far the near station is')
    const seconds = counted(text, /([〇一二三四五六七八九十两]+)秒里发了/, 'the window it is counted over')
    const [frames] = figs(text, /发了 ([\d,]+) 帧/, 'how many frames it sent')
    const [rung] = figs(text, /帧帧都在 MCS (\d+) 上/, 'the rung it never leaves')
    const rungsLost = counted(text, /谁也没有开出最密的那([〇一二三四五六七八九十两]+)级/,
      'how many rungs the agreed capabilities cost it')

    const nearNode = sc.nodes.find((n) => n.id === 'sta-1')!
    expect(Math.round(Math.hypot(nearNode.pos.x - ap.pos.x, nearNode.pos.y - ap.pos.y))).toBe(metres)
    // the census window: every count in this lesson is three seconds of this scene
    expect(RUN_NS).toBe(seconds * 1_000 * MS)
    expect(near.length).toBe(frames)
    expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([rung]))
    expect(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-1'),
      '「没有一帧等不到答复」').toHaveLength(0)
    // 「58.7 dB 足以支持最高一级」, and the rung it sits on is the capability cap instead —
    // that many rungs below the top, with 4096-QAM never negotiated
    same(raw(text, /([\d.]+) dB 足以支持最高一级/, 'the signal it has to spare')[0],
      snrOf('sta-1'), 'the near link’s signal-to-noise ratio')
    // 「最高一级」 is this mode's last rung, read off the mode rather than written here
    const topRung = PHY_MODES.eht.mbps.length - 1
    const top = mcsForRssi('eht', links.get('sta-1')!.get('ap')!, topRung, 20)
    expect(top, 'that much signal does not carry the top rung after all').toBe(topRung)
    expect(top - rung, 'the rungs the capabilities cost it').toBe(rungsLost)
    expect(negotiated(nearNode, ap, 'qam4k')).toBe(false)
  })

  it('the five steps name the width, the noise floor, the capability cap and the margin', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(5)
    const [width] = figs(steps[1], /两端都是 (\d+) MHz/, 'step 2’s width')
    expect(negotiatedWidth(sc.nodes.find((n) => n.id === 'sta-2')!, ap)).toBe(width)
    same(raw(steps[1], /噪声地板 ([−\d.]+) dBm/, 'step 2’s noise floor')[0], noiseDbm(width),
      `the noise floor of ${width} MHz`)
    const [cap] = figs(steps[2], /上限先被压到 MCS (\d+)/, 'step 3’s capability cap')
    // the cap is "everything below this mode's lowest 4096-QAM rung", which the mode itself
    // carries — a run that measures it needs a link with signal to spare, which is the near
    // one: it sits on the cap and not where its signal would let it go
    expect(PHY_MODES.eht.qam4kFromMcs! - 1, 'the rung below this mode’s first 4096-QAM one').toBe(cap)
    expect(new Set(near.map((r) => r.frame.mcs)), 'the near station sits on that cap')
      .toEqual(new Set([cap]))
    expect(mcsForRssi('eht', links.get('sta-1')!.get('ap')!, cap, 20),
      'the near link, where that cap is the only thing in the way').toBe(cap)
    const [margin] = figs(steps[3], /\+ (\d+) dB 速率余量/, 'step 4’s margin')
    expect(margin).toBe(RATE_MARGIN_DB)
    // step 4 walks the ladder from the bottom and keeps the LAST rung that fits
    const snr = snrOf('sta-2')
    const fits = [...Array(cap + 1).keys()].filter((m) => reqSinrDb('eht', m) + margin <= snr)
    expect(mcsForRssi('eht', links.get('sta-2')!.get('ap')!, cap, 20)).toBe(Math.max(...fits))
  })

  it('the worked table: seven rows, and its ✓ and ✗ are inequalities that hold', () => {
    const rows = tables[1].rows
    expect(rows, 'the table states exactly the seven rows this reads').toHaveLength(7)
    const snr = snrOf('sta-2')
    same(cell(rows[0][1], 'dBm', 'the far link’s RSSI'), links.get('sta-2')!.get('ap')!,
      'the far link’s RSSI')
    const [width] = figs(rows[1][0], /(\d+) MHz 的噪声地板/, 'the width the floor is for')
    same(cell(rows[1][1], 'dBm', 'the noise floor'), noiseDbm(width), 'the noise floor')
    same(cell(rows[2][1], 'dB', 'the SNR'), snr, 'the SNR that is their difference')
    const [cap] = figs(rows[3][1], /^MCS (\d+)$/, 'the capability cap')
    expect(negotiated(sc.nodes.find((n) => n.id === 'sta-2')!, ap, 'qam4k'),
      `the row says neither end offered 4096-QAM, which is why the cap is MCS ${cap}`).toBe(false)
    // and that is the rung below this mode's first 4096-QAM one — the figure is the mode's,
    // not this scene's, which is why the far link's own ceiling lands two rungs lower
    expect(PHY_MODES.eht.qam4kFromMcs! - 1).toBe(cap)
    expect(new Set(near.map((r) => r.frame.mcs)), 'the near station, where the cap is what binds')
      .toEqual(new Set([cap]))

    // 「13.99 + 3 = 16.99 ✓」 and 「16.99 + 3 = 19.99 ✗」: a requirement, the margin, their sum,
    // and a mark that claims whether that sum is under the SNR three rows above
    for (const row of rows.slice(4, 6)) {
      const [mcs] = figs(row[0], /^MCS (\d+) 的要求/, `the rung 「${row[0]}」 is about`)
      const m = /^([\d.]+) \+ (\d+) = ([\d.]+) ([✓✗])$/.exec(row[1])
      expect(m, `「${row[1]}」 is not 「requirement + margin = sum ✓/✗」`).not.toBeNull()
      same(m![1], reqSinrDb('eht', mcs), `MCS ${mcs}’s own requirement`)
      expect(Number(m![2]), 'the margin this row adds').toBe(RATE_MARGIN_DB)
      same(m![3], reqSinrDb('eht', mcs) + RATE_MARGIN_DB, `MCS ${mcs}’s requirement with margin`)
      expect(reqSinrDb('eht', mcs) + RATE_MARGIN_DB <= snr,
        `${row[0]}: the table marks it 「${m![4]}」 against an SNR of ${snr.toFixed(2)} dB`)
        .toBe(m![4] === '✓')
    }
    const [ceiling] = figs(rows[6][1], /^MCS (\d+)$/, 'the ceiling the table arrives at')
    expect(mcsForRssi('eht', links.get('sta-2')!.get('ap')!, cap, 20)).toBe(ceiling)
    expect(Math.max(...rungsUsed), 'and the run never goes above it').toBe(ceiling)
  })

  it('`observe` quotes the three airtimes, the ceiling, and the near station’s census', () => {
    const text = rate.observe!.join('\n')
    const printed = raw(text, /是 ([\d,.]+) µs，降一级是 ([\d,.]+) µs，到最底一级是 ([\d,.]+) µs/,
      '`observe` on the three airtimes')
    for (let i = 0; i < 3; i++) {
      const air = far.find((r) => r.frame.mcs === rungsUsed[i])!.frame.txTimeNs
      same(printed[i], air / US, `the airtime of MCS ${rungsUsed[i]} in µs`)
    }
    const [ceiling] = figs(text, /在上限 MCS (\d+) 上/, '`observe` on the ceiling')
    expect(Math.max(...rungsUsed)).toBe(ceiling)
    // 「一次也没有发到 MCS 2 以上」: the rung it names must BE the ceiling, not merely above
    // it — 「MCS 3 以上」 would also be true of this run, and `scripts/figure-planting.ts` found
    // all four sites that say it editable for exactly that reason.
    const [never] = figs(text, /一次也没有发到 MCS (\d+) 以上/, '`observe` on what it never exceeds')
    expect(far.filter((r) => r.frame.mcs! > never)).toHaveLength(0)
    expect(Math.max(...rungsUsed), 'and that rung is the ceiling itself').toBe(never)
    const seconds = counted(text, /([〇一二三四五六七八九十两]+)秒 [\d,]+ 帧/, '`observe`’s own window')
    const [frames, rung] = figs(text, /秒 ([\d,]+) 帧，全部在 MCS (\d+) 上/,
      '`observe` on the near station')
    expect(RUN_NS).toBe(seconds * 1_000 * MS)
    expect(near.length).toBe(frames)
    expect(new Set(near.map((r) => r.frame.mcs))).toEqual(new Set([rung]))
  })

  it('`tryThis`: half a metre changes nothing, two raise the ceiling, five remove the bottom rung', () => {
    const text = rate.tryThis!.join('\n')
    // 「挪半米」: 半 is the word for a half, and zhNumeral does not read it — the two moves that
    // follow are whole metres and are read as numbers.
    expect(text, 'the first move is no longer half a metre').toContain('朝接入点挪半米')
    const two = counted(text, /挪([〇一二三四五六七八九十两]+)米才管用/, 'the move that does something')
    const five = counted(text, /改成朝接入点挪([〇一二三四五六七八九十两]+)米/, 'the third move')
    const [from, to] = figs(text, /上限从 MCS (\d+) 抬到 MCS (\d+)/, 'the ceiling the second move raises')
    const seconds = counted(text, /([〇一二三四五六七八九十两]+)秒里交付的帧数/, '`tryThis`’s window')
    const [before, after] = figs(text, /帧数从 ([\d,]+) 变成 ([\d,]+)/, 'the frames that move buys')

    expect(RUN_NS).toBe(seconds * 1_000 * MS)
    // 「什么也不会发生：它跨不过任何门限，整段仿真一帧不差地重来一遍」
    expect(moved(0.5).trace, 'half a metre changed the run after all').toBe(moved(0).trace)
    expect(moved(0).ceiling, 'where the ceiling starts').toBe(from)
    expect(moved(0).frames, 'the frames it delivers there').toBe(before)
    expect(moved(two).ceiling, `${two} metres closer`).toBe(to)
    expect(moved(two).frames, `${two} metres closer`).toBe(after)
    // 「这回最底一级一次都不出现了」
    expect(moved(five).zero, `${five} metres closer`).toBe(0)
    expect(moved(0).zero, 'and the bottom rung does occur where it starts').toBeGreaterThan(0)
  })

  it('the quiz: twenty answered frames in a row, and the ceiling still does not move', () => {
    const twenty = counted(quizText, /连着成功了([〇一二三四五六七八九十两]+)次/,
      'the streak the quiz asks about')
    const [ceiling] = figs(quizText, /MCS (\d+) 是那个角落的信号定下的上限/, 'the quiz on the ceiling')
    expect(Math.max(...rungsUsed), 'the quiz names the ceiling itself').toBe(ceiling)
    // the question and the explanation say it twice more, and each has to be that same rung
    for (const m of quizText.matchAll(/MCS (\d+) 以上/g)) {
      expect(Number(m[1]), `「${m[0]}」 in the quiz`).toBe(ceiling)
    }
    // an attempt failed iff its own deadline fired: one ACK timeout, one frame end plus the
    // timeout, which is how `@hidden` pins the same rule
    const timeouts = new Set(ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === 'sta-2').map((r) => r.t))
    let streak = 0
    let best = 0
    for (const f of far) {
      streak = timeouts.has(f.t + f.frame.txTimeNs + ACK_TIMEOUT_NS) ? 0 : streak + 1
      best = Math.max(best, streak)
    }
    expect(best, 'this run never has a streak that long, so the question is hypothetical')
      .toBeGreaterThanOrEqual(twenty)
    expect(far.filter((r) => r.frame.mcs! > ceiling), 'and no streak ever lifts it').toHaveLength(0)
  })

  it('`limits`: one hundredth of a decibel really does decide a whole rung', () => {
    const [cliff] = figs(limitText, /差 ([\d.]+) dB 就整帧丢掉/, '`limits` on how sharp the cliff is')
    // There is no transition band anywhere in this engine: the requirement is a single number,
    // so the rung the signal supports flips across that hundredth of a decibel.
    const next = Math.max(...rungsUsed) + 1
    const justFits = reqSinrDb('eht', next) + RATE_MARGIN_DB + noiseDbm(20)
    expect(mcsForRssi('eht', justFits + cliff, 11, 20), `${cliff} dB above the line`).toBe(next)
    expect(mcsForRssi('eht', justFits - cliff, 11, 20), `${cliff} dB below it`).toBe(next - 1)
    // 「所以上限是一个精确到小数点后两位的数」: the three figures the worked table prints
    const places = counted(limitText, /精确到小数点后([〇一二三四五六七八九十两]+)位/,
      '`limits` on how precisely the ceiling is printed')
    for (const row of tables[1].rows.slice(0, 3)) {
      const printed = row[1].replace(/[^\d.]/g, '')
      expect((printed.split('.')[1] ?? '').length, `the table prints 「${row[1]}」`).toBe(places)
    }
  })

  it('`limits`: the margin is this simulator’s pick, and the two noise figures are not the same', () => {
    const [margin] = figs(limitText, /那 (\d+) dB 速率余量是本仿真器挑的/, '`limits` on the margin')
    expect(margin).toBe(RATE_MARGIN_DB)
    const [clause] = figs(limitText, /拿第 (\d+) 章的最小灵敏度/,
      '`limits` on where the requirements come from')
    expect(rate.sources!.join('\n'), `\`sources\` does not name clause ${clause} too`)
      .toContain(`第 ${clause} 章`)
    const [reversed] = figs(limitText, /按 (\d+) dB 噪声系数算的噪声地板/,
      '`limits` on the noise figure the requirement is derived with')
    const [own] = figs(limitText, /噪声地板自己按 (\d+) dB 算/,
      '`limits` on the noise figure this engine computes with')
    expect(own).toBe(NOISE_FIGURE_DB)
    expect(noiseDbm(20)).toBe(noiseDbm(20, own))
    // the whole point of the sentence is that those two are different numbers
    expect(reversed, 'the two noise figures are the same, so the warning warns about nothing')
      .not.toBe(own)
    // 「换一个余量，远端那条链路的上限就换一个位置」
    const rssi = links.get('sta-2')!.get('ap')!
    expect(mcsForRssi('eht', rssi, 11, 20), 'with the margin this simulator picked')
      .toBe(Math.max(...rungsUsed))
    expect(mcsForRssi('eht', rssi + margin, 11, 20), 'and one margin further up the ladder')
      .toBeGreaterThan(Math.max(...rungsUsed))
  })

  it('`limits` name only code this repository has, in the files they name it in', () => {
    const named = [...limitText.matchAll(/\b([a-z][a-z0-9]*\.ts)\b/g)].map((x) => x[1])
    const src = [...new Set(named)].map((f) => {
      const p = ['src/engine', 'src/model', 'src/course'].map((d) => resolve(ROOT, `${d}/${f}`)).find(existsSync)
      expect(p, `${f} is not a file of this repository`).toBeDefined()
      return readFileSync(p!, 'utf8')
    }).join('\n')
    // `dB` is camelCase by this pattern and is a unit, not a name — the only unit in these
    // five entries that is, and naming it here is cheaper than a pattern that would also have
    // to let `onTxOutcome` through (two letters before its first capital, same as `dB`).
    const UNITS = new Set(['dB', 'dBm', 'dBi'])
    const syms = [...limitText.matchAll(/\b([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)\b/g)]
      .map((x) => x[1]).filter((s) => !UNITS.has(s))
    for (const sym of syms) {
      expect(src.includes(sym), `\`${sym}\` is named here, and by none of the files named with it`).toBe(true)
    }
    expect(named.length, 'the files `limits` cite').toBe(4)
    expect(syms.length, 'the identifiers `limits` name').toBe(5)
  })
})
