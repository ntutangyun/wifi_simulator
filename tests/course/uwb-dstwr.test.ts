/**
 * Every empirical claim in the "Two round trips cancel the clock" lesson,
 * measured against the lesson's own scenario and its variant. Each assertion
 * quotes the sentence it guards; formulas, frame sizes and session constants
 * come from the engine's own exports (src/uwb/ranging.ts, src/uwb/phy.ts,
 * src/uwb/session.ts, src/uwb/clock.ts) rather than being re-typed here.
 */
import { describe, it, expect } from 'vitest'
import { uwbDstwr, uwbDstwrScenario } from '../../src/course/uwb/uwb-dstwr'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n } from '../../src/course/lessonKit'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM } from '../../src/uwb/position'
import { dsTwr, metresToNs, rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import { roundPlan } from '../../src/uwb/session'
import {
  C_M_PER_NS, RCTU_NS, RMI_REPORT_IE_BYTES, RRTI_IE_BYTES, RS_BLOCK_BITS, UWB_FCS_BYTES, UWB_MHR_BYTES,
  UWB_PPM_MAX, UWB_REPORT_BYTES, rmiFinalIeBytes, uwbFinalBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes,
} from '../../src/uwb/phy'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** The ring the scene is built on: every anchor is exactly this far from the tag. */
const RING_M = 3.5
const ANCHORS = 4

/** The scenario each part of the lesson runs: the base, then variant 0. */
const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbDstwr.scenario() : uwbDstwr.variants![variant].scenario()
/** The crystal offsets of a scene, read back from the scene itself. */
function ppmOf(variant?: number): { tag: number; anchors: number } {
  const nodes = scenarioOf(variant).nodes
  return {
    tag: nodes.find((n) => n.uwb!.role === 'tag')!.uwb!.ppm!,
    anchors: nodes.find((n) => n.uwb!.role === 'anchor')!.uwb!.ppm!,
  }
}
/** The session's noise model and slot length, likewise read back rather than re-typed. */
const SESSION = uwbDstwr.scenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)

/**
 * 1-σ of one DS-TWR range from the session's timestamp noise. Three noisy
 * receive stamps enter the result — the anchor's of the Poll, the phone's of
 * the Response, the anchor's of the Final — with sensitivities r2/S, ½ and
 * r1/S, where r1 and r2 are the two reply times and S their total, the whole
 * round measured twice. ("weighted by the reply times they come to about
 * 1.9 cm of 1-σ")
 */
function dsSigmaM(slot: number): number {
  const r1 = slot * PLAN.slotNs
  const r2 = (ANCHORS + 1 - slot) * PLAN.slotNs
  const s = 2 * (r1 + r2)
  return Math.hypot(r2 / s, 0.5, r1 / s) * (SESSION.tsNoisePs / 1000) * C_M_PER_NS
}

const memo = new Map<string, TLRecord[]>()
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) memo.set(key, [...new Simulation(scenarioOf(variant)).runUntil(RUN_NS).records])
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const ranges = (variant?: number) => ofType(recs(variant), 'UWB_RANGE')
const tagRanges = (variant?: number) => ranges(variant).filter((r) => r.node === 'tag-1')
const anchorRanges = (variant?: number) => ranges(variant).filter((r) => r.node.startsWith('anchor'))

/** The four times of one anchor's double-sided exchange, read off the UWB_TS records. */
function fourTimes(anchorId: string, variant?: number): {
  tround1: number; treply1: number; tround2: number; treply2: number
} {
  const ts = ofType(recs(variant), 'UWB_TS')
  const a = ts.filter((r) => r.node === anchorId)
  const tag = ts.filter((r) => r.node === 'tag-1')
  const txPoll = tag.find((r) => r.dir === 'tx' && r.frameKind === 'uwbPoll')!.counter
  const txFinal = tag.find((r) => r.dir === 'tx' && r.frameKind === 'uwbFinal')!.counter
  const rxResp = tag.find((r) => r.dir === 'rx' && r.peer === anchorId)!.counter
  const [rxPoll, txResp, rxFinal] = [a[0].counter, a[1].counter, a[2].counter]
  return {
    tround1: counterDiff(rxResp, txPoll),
    treply1: counterDiff(txResp, rxPoll),
    tround2: counterDiff(rxFinal, txResp),
    treply2: counterDiff(txFinal, rxResp),
  }
}

/** All the cells of the lesson's nth table, as English strings. */
const tableCells = (n: number): string[] => {
  const tables = uwbDstwr.body.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')
  return tables[n].rows.flat().map((c) => c.en)
}
/** Everything the learner reads, joined — for "is this number actually printed?" checks. */
const prose = (): string => {
  const out: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x !== 'object') return
    const o = x as Record<string, unknown>
    if (typeof o.en === 'string') { out.push(o.en); return }
    for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
  }
  walk({ body: uwbDstwr.body, observe: uwbDstwr.observe, tryThis: uwbDstwr.tryThis, quiz: uwbDstwr.quiz })
  return out.join('\n')
}

describe('uwb-dstwr · lesson shape', () => {
  it('the scenario and the variant pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbDstwr.scenario())).not.toThrow()
    expect(uwbDstwr.variants).toHaveLength(1)
    for (const v of uwbDstwr.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbDstwr) / 150
      + OBSERVE_MINUTES * uwbDstwr.observe.length + TRY_MINUTES * uwbDstwr.tryThis.length
    expect(lessonMinutes(uwbDstwr)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbDstwr)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbDstwr)).toBeLessThanOrEqual(25)
    // the module it belongs to: UWB Tier 1, "Time of flight"
    expect(uwbDstwr.module).toBe(11)
    expect(uwbDstwr.id).toBe('uwb-dstwr')
  })

  it('it offers five jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbDstwr.jumps).toHaveLength(5)
    expect(uwbDstwr.observe).toHaveLength(4)
    expect(uwbDstwr.tryThis).toHaveLength(2)
    expect(uwbDstwr.quiz).toHaveLength(3)
    for (const q of uwbDstwr.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, in the order the list gives them', () => {
    const rs = recs()
    const at: number[] = []
    for (const j of uwbDstwr.jumps) {
      const i = rs.findIndex(j.find)
      expect(i, j.label.en).toBeGreaterThanOrEqual(0)
      at.push(i)
    }
    expect(at).toEqual([...at].sort((a, b) => a - b))
    // "an anchor computes the range" is on an anchor lane, and it happens before the first report
    const anchorJump = rs[at[2]]
    expect(anchorJump.type).toBe('UWB_RANGE')
    if (anchorJump.type !== 'UWB_RANGE') throw new Error('unreachable')
    expect(anchorJump.node.startsWith('anchor')).toBe(true)
    expect(anchorJump.t).toBeLessThan(rs[at[3]].t)
  })

  it('every string a learner reads exists in both languages', () => {
    // A cell of numbers, log lines or protocol names reads the same in both (N());
    // anything holding two consecutive English words is prose and must be translated.
    const seen: L10n[] = []
    const isL10n = (o: Record<string, unknown>): o is Record<string, unknown> & L10n =>
      typeof o.en === 'string' && typeof o.zh === 'string'
    const walk = (x: unknown): void => {
      if (x == null || typeof x === 'function') return
      if (Array.isArray(x)) { x.forEach(walk); return }
      if (typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (isL10n(o)) { seen.push(o); return }
      for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
    }
    walk({ title: uwbDstwr.title, body: uwbDstwr.body, observe: uwbDstwr.observe, tryThis: uwbDstwr.tryThis, quiz: uwbDstwr.quiz, variants: uwbDstwr.variants, jumps: uwbDstwr.jumps })
    expect(seen.length).toBeGreaterThan(50)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('names the standard clauses it leans on and the numbers that are model', () => {
    // the source-status sentence, first block of the body
    const first = uwbDstwr.body[0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    for (const s of ['IEEE Std 802.15.4-2024', '§10.29.1.2.3', 'Figure 10-199', '§10.32.5', '§16.4.9']) {
      expect(en, s).toContain(s)
    }
    for (const s of ['100 ps', '2 ms ranging slot', 'FiRa', '3 + 6N octets', '40-bit ranging counter']) {
      expect(en, s).toContain(s)
    }
  })
})

describe('uwb-dstwr · the scene', () => {
  it('is lesson 2’s scene measured double-sided: four anchors on a 3.50 m ring, all at 2.20 m', () => {
    // "four anchors on a 3.50 m ring around a phone at the centre of a 10 × 8 m lab, every device
    //  at 2.20 m, so all four true distances are exactly 3.50 m. Only the session changes"
    const s = uwbDstwr.scenario()
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    expect(s.nodes.map((n) => n.id)).toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'anchor-4', 'tag-1'])
    expect(s.nodes.map((n) => n.uwb!.role)).toEqual(['anchor', 'anchor', 'anchor', 'anchor', 'tag'])
    expect(s.nodes.every((n) => n.pos.z === 2.2)).toBe(true)
    const t = s.nodes[4].pos
    expect([t.x, t.y]).toEqual([5, 4])
    for (const a of s.nodes.slice(0, 4)) {
      expect(Math.hypot(a.pos.x - t.x, a.pos.y - t.y, a.pos.z - t.z), a.id).toBeCloseTo(RING_M, 12)
    }
    // no AP, no stations, no Wi-Fi traffic at all
    expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
    expect(s.servers).toEqual([])
    expect(s.uwb).toMatchObject({ method: 'ds', nlos: false, slotRstu: 2400, tsNoisePs: 100 })
  })

  it('the base run is the phone 10 ppm fast against anchors 10 ppm slow', () => {
    // "the phone 10 ppm fast, every anchor 10 ppm slow"
    expect(ppmOf()).toEqual({ tag: 10, anchors: -10 })
    expect(uwbDstwr.scenario().nodes.map((n) => n.uwb!.ppm)).toEqual([-10, -10, -10, -10, 10])
    expect(uwbDstwr.scenario()).toEqual(uwbDstwrScenario({ tag: 10, anchors: -10 }))
  })

  it('the variant doubles both crystal offsets to the ±20 ppm the standard allows, and nothing else', () => {
    // "Load “Worst-case crystals, ±20 ppm”, which doubles both offsets and changes nothing else."
    expect(uwbDstwr.variants![0].label).toEqual({ en: 'Worst-case crystals, ±20 ppm', zh: '最差晶振，±20 ppm' })
    expect(ppmOf(0)).toEqual({ tag: 20, anchors: -20 })
    expect(Math.abs(ppmOf(0).tag)).toBe(UWB_PPM_MAX)
    expect(ppmOf(0).tag).toBe(2 * ppmOf().tag)
    expect(ppmOf(0).anchors).toBe(2 * ppmOf().anchors)
    expect(uwbDstwr.variants![0].scenario()).toEqual(uwbDstwrScenario({ tag: 20, anchors: -20 }))
    const strip = (s: Scenario): string =>
      JSON.stringify({ ...s, nodes: s.nodes.map((n) => ({ ...n, uwb: { role: n.uwb!.role } })) })
    expect(strip(uwbDstwr.variants![0].scenario())).toEqual(strip(uwbDstwr.scenario()))
  })
})

describe('uwb-dstwr · ten slots and the frames that fill them', () => {
  it('a DS round is 2N + 2 slots: ten of 2 ms, ending at 20 000 000 ns', () => {
    // "A DS round is 2N + 2 slots where the single-sided round was N + 1: ten slots of 2 ms for
    //  four anchors, 20 ms instead of 10." / "The round line reads “10 slots × 2000.0 µs” and the
    //  last one ends at 20 000 000 ns"
    expect(PLAN.slots).toBe(2 * ANCHORS + 2)
    expect(PLAN.slots).toBe(10)
    expect(roundPlan({ ...SESSION, method: 'ss' }, ANCHORS).slots).toBe(ANCHORS + 1)
    expect(PLAN.slotNs).toBe(2 * MS)
    expect(PLAN.roundNs).toBe(20 * MS)
    const round = ofType(recs(), 'UWB_ROUND')
    expect(round).toHaveLength(1)
    expect(round[0]).toMatchObject({ method: 'ds', slots: 10, slotNs: 2 * MS, untilNs: 20 * MS })
    expect(fmtRecord(round[0])).toBe('tag-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs')
    expect(ofType(recs(), 'UWB_SLOT').map((r) => r.t))
      .toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18].map((ms) => ms * MS))
    expect(ofType(recs(), 'UWB_TIMEOUT')).toHaveLength(0)
  })

  it('Poll in slot 0, four Responses, the Final in slot 5 at 10 ms, four reports in slots 6 to 9', () => {
    // "Poll in slot 0, responses in slots 1 to 4, the Final in slot 5 at 10 ms, reports in slots 6 to 9."
    expect(ofType(recs(), 'TX_START').map((r) => `${r.node}/${r.frame.kind}@${r.t / MS}`)).toEqual([
      'tag-1/uwbPoll@0',
      'anchor-1/uwbResp@2', 'anchor-2/uwbResp@4', 'anchor-3/uwbResp@6', 'anchor-4/uwbResp@8',
      'tag-1/uwbFinal@10',
      'anchor-1/uwbReport@12', 'anchor-2/uwbReport@14', 'anchor-3/uwbReport@16', 'anchor-4/uwbReport@18',
    ])
  })

  it('the frame table’s octets and airtimes are the engine’s own', () => {
    // the "Frame / Count / Octets / Airtime each" table
    const cells = tableCells(1)
    const rows: [string, number, number][] = [
      ['Poll', uwbPollBytes(ANCHORS), 1],
      ['Response', uwbRespBytes('ds'), ANCHORS],
      ['Final', uwbFinalBytes(ANCHORS), 1],
      ['Report', UWB_REPORT_BYTES, ANCHORS],
    ]
    expect(rows.map((r) => r[1])).toEqual([39, 14, 62, 24])
    expect(rows.map((r) => uwbPpduNs(r[1]))).toEqual([206_859, 181_218, 236_603, 191_474])
    for (const [label, octets, count] of rows) {
      expect(cells, label).toContain(String(octets))
      expect(cells, label).toContain(String(count))
      expect(cells, label).toContain(`${(uwbPpduNs(octets) / 1000).toFixed(2)} µs`)
    }
    // "Round total | 10 | 253 | 1 934.23 µs"
    const octets = rows.reduce((sum, [, b, n]) => sum + b * n, 0)
    expect(octets).toBe(253)
    expect(cells).toContain('253')
    const airtime = ofType(recs(), 'TX_START').reduce((sum, r) => sum + r.frame.txTimeNs, 0)
    expect(airtime).toBe(206_859 + 4 * 181_218 + 236_603 + 4 * 191_474)
    expect(airtime).toBe(1_934_230)
    expect((airtime / 1000).toFixed(2)).toBe('1934.23')
    expect(cells).toContain('1 934.23 µs')
  })

  it('the round radiates 9.67 % of its 20 ms, against 9.56 % for the single-sided round', () => {
    // "1 934.23 µs of radiation inside a 20 000 µs round is 9.67 % of it, against 9.56 % for
    //  lesson 2’s single-sided round."
    const airtime = ofType(recs(), 'TX_START').reduce((sum, r) => sum + r.frame.txTimeNs, 0)
    expect((airtime / PLAN.roundNs * 100).toFixed(2)).toBe('9.67')
    const ssPlan = roundPlan({ ...SESSION, method: 'ss' }, ANCHORS)
    const ssAir = uwbPpduNs(uwbPollBytes(ANCHORS)) + ANCHORS * uwbPpduNs(uwbRespBytes('ss'))
    expect((ssAir / ssPlan.roundNs * 100).toFixed(2)).toBe('9.56')
    expect(ssPlan.roundNs).toBe(10 * MS)
  })

  it('the Final is 14 + 12N octets — an RMI entry and an RRTI entry per anchor, two RS blocks', () => {
    // "14 + 12N octets, an RMI entry and an RRTI entry per anchor — 62 octets here, 496 bits, two
    //  Reed–Solomon blocks." / "62 octets, one RMI IE of 27 holding four Tround1 values, and four
    //  RRTI IEs of 6" / "a single 13-octet RMI IE with Treply1 and Tround2"
    for (const n of [3, 4, 5]) expect(uwbFinalBytes(n)).toBe(14 + 12 * n)
    expect(uwbFinalBytes(ANCHORS)).toBe(62)
    expect(rmiFinalIeBytes(ANCHORS)).toBe(27)
    expect(RRTI_IE_BYTES).toBe(6)
    expect(UWB_MHR_BYTES + rmiFinalIeBytes(ANCHORS) + ANCHORS * RRTI_IE_BYTES + UWB_FCS_BYTES).toBe(62)
    expect(RMI_REPORT_IE_BYTES).toBe(13)
    expect(UWB_MHR_BYTES + RMI_REPORT_IE_BYTES + UWB_FCS_BYTES).toBe(UWB_REPORT_BYTES)
    expect(8 * uwbFinalBytes(ANCHORS)).toBe(496)
    expect(Math.ceil(496 / RS_BLOCK_BITS)).toBe(2)
    // "A fifth anchor would add 12 octets to the Final and two more slots — 4 ms — to the round."
    expect(uwbFinalBytes(5) - uwbFinalBytes(4)).toBe(12)
    const five = roundPlan(SESSION, 5)
    expect(five.slots - PLAN.slots).toBe(2)
    expect(five.roundNs - PLAN.roundNs).toBe(4 * MS)
  })
})

describe('uwb-dstwr · the four times', () => {
  it('anchor 1’s three counters give Treply1 and Tround2; the phone’s pair gives Tround1 and Treply2', () => {
    // "Anchor 1 stamps three counters: 26 381 597 885, 26 509 391 059 and 27 020 567 485. They give
    //  Treply1 = 127 793 174 and Tround2 = 511 176 426 RCTU. The phone’s pair for the same anchor is
    //  Tround1 = 127 797 230 and Treply2 = 511 185 160."
    const a1 = ofType(recs(), 'UWB_TS').filter((r) => r.node === 'anchor-1')
    expect(a1.map((r) => `${r.dir}/${r.frameKind}`))
      .toEqual(['rx/uwbPoll', 'tx/uwbResp', 'rx/uwbFinal', 'tx/uwbReport'])
    // the three the formula uses are the first three; the fourth only carries them to the phone
    expect(a1.slice(0, 3).map((r) => r.counter)).toEqual([26_381_597_885, 26_509_391_059, 27_020_567_485])
    expect(fourTimes('anchor-1')).toEqual({
      tround1: 127_797_230, treply1: 127_793_174, tround2: 511_176_426, treply2: 511_185_160,
    })
  })

  it('the two differences are +63 ns and −137 ns where both should be twice 11.675 ns', () => {
    // "Tround1 − Treply1 = +4 056 RCTU, Tround2 − Treply2 = −8 734. That is +63 ns and −137 ns where
    //  both should be twice the 11.675 ns of flight."
    const { tround1, treply1, tround2, treply2 } = fourTimes('anchor-1')
    expect(tround1 - treply1).toBe(4_056)
    expect(tround2 - treply2).toBe(-8_734)
    expect(Math.round((tround1 - treply1) * RCTU_NS)).toBe(63)
    expect(Math.round((tround2 - treply2) * RCTU_NS)).toBe(-137)
    expect(metresToNs(RING_M).toFixed(3)).toBe('11.675')
    // what both differences would be with perfect crystals: 2·Tprop, 23.3 ns
    expect((2 * metresToNs(RING_M)).toFixed(1)).toBe('23.3')
  })

  it('the denominator is the whole exchange: 10 ms on each clock, about 1 277 952 000 RCTU', () => {
    // "it is the entire exchange, the 10 ms the phone timed from Poll to Final plus the 10 ms the
    //  anchor timed, about 1 277 952 000 RCTU"
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1, tround2, treply2 } = fourTimes(`anchor-${i}`)
      // the phone's two intervals tile its Poll→Final, the anchor's tile its own
      expect(Math.abs((tround1 + treply2) * RCTU_NS - 10 * MS), `phone ${i}`).toBeLessThan(200)
      expect(Math.abs((treply1 + tround2) * RCTU_NS - 10 * MS), `anchor ${i}`).toBeLessThan(200)
      const sum = tround1 + treply1 + tround2 + treply2
      expect(Math.round(sum / 1000) * 1000, `sum ${i}`).toBe(1_277_952_000)
      expect(Math.abs(sum * RCTU_NS - 2 * PLAN.roundNs / 2), `sum ns ${i}`).toBeLessThan(400)
    }
  })

  it('both lanes are the engine’s dsTwr of those same four counters', () => {
    // "it is the same four counters through the same function"
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1, tround2, treply2 } = fourTimes(`anchor-${i}`)
      const tof = dsTwr(tround1, treply1, tround2, treply2)
      expect(tagRanges()[i - 1].tofRctu, `tag ${i}`).toBe(tof)
      expect(anchorRanges()[i - 1].tofRctu, `anchor ${i}`).toBe(tof)
    }
  })
})

describe('uwb-dstwr · two wrong halves', () => {
  it('the halves table is the two single-sided estimates the same counters give', () => {
    // "anchor-1 | 2 ms − Tprop | 9.51 m | −20.49 m | 3.51 m" … and the three rows under it
    const cells = tableCells(0)
    const first = ['9.51', '15.47', '21.49', '27.42']
    const second = ['−20.49', '−14.48', '−8.43', '−2.55']
    const ds = ['3.51', '3.49', '3.54', '3.45']
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1, tround2, treply2 } = fourTimes(`anchor-${i}`)
      const fmt = (rctu: number): string => rctuToMetres(rctu).toFixed(2).replace('-', '−')
      expect(fmt(ssTwrRaw(tround1, treply1)), `first half ${i}`).toBe(first[i - 1])
      expect(fmt(ssTwrRaw(tround2, treply2)), `second half ${i}`).toBe(second[i - 1])
      expect(fmt(dsTwr(tround1, treply1, tround2, treply2)), `ds ${i}`).toBe(ds[i - 1])
      for (const s of [first, second, ds]) expect(cells, s[i - 1]).toContain(`${s[i - 1]} m`)
      expect(cells, `Treply1 ${i}`).toContain(`${2 * i} ms − Tprop`)
    }
  })

  it('the first half is lesson 2’s raw ramp: 6 m per slot of waiting', () => {
    // "(Tround1 − Treply1)/2 is exactly lesson 2’s raw SS-TWR estimate, wrong by the same ramp of
    //  6 m per slot of waiting."
    const ppm = ppmOf()
    const tpropNs = metresToNs(RING_M)
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround1, treply1 } = fourTimes(`anchor-${i}`)
      const errM = rctuToMetres(ssTwrRaw(tround1, treply1)) - RING_M
      const predicted = (tpropNs * ppm.tag * 1e-6
        + ((i * PLAN.slotNs - tpropNs) * (ppm.tag - ppm.anchors) * 1e-6) / 2) * C_M_PER_NS
      expect(predicted.toFixed(1), `slot ${i}`).toBe((6 * i).toFixed(1))
      expect(Math.abs(errM - predicted), `slot ${i}`).toBeLessThan(0.15)
    }
  })

  it('the second half is negative, and averaging the two gives −5.49 m rather than 3.51 m', () => {
    // "averaging anchor 1’s two halves gives −5.49 m"
    for (let i = 1; i <= ANCHORS; i++) {
      const { tround2, treply2 } = fourTimes(`anchor-${i}`)
      expect(ssTwrRaw(tround2, treply2), `slot ${i}`).toBeLessThan(0)
    }
    const { tround1, treply1, tround2, treply2 } = fourTimes('anchor-1')
    const mean = (ssTwrRaw(tround1, treply1) + ssTwrRaw(tround2, treply2)) / 2
    expect(rctuToMetres(mean).toFixed(2)).toBe('-5.49')
    expect(rctuToMetres(dsTwr(tround1, treply1, tround2, treply2)).toFixed(2)).toBe('3.51')
  })
})

describe('uwb-dstwr · why the crystals cancel', () => {
  /** The four true intervals of anchor `slot`'s exchange, in RCTU, before any clock error. */
  function trueTimes(slot: number): { tround1: number; treply1: number; tround2: number; treply2: number } {
    const tprop = metresToNs(RING_M) / RCTU_NS
    const treply1 = (slot * PLAN.slotNs) / RCTU_NS - tprop
    const treply2 = ((ANCHORS + 1 - slot) * PLAN.slotNs) / RCTU_NS - tprop
    return { tround1: treply1 + 2 * tprop, treply1, tround2: treply2 + 2 * tprop, treply2 }
  }

  it('the numerator scales by (1 + eA)(1 + eB) and the denominator by 1 + (eA + eB)/2', () => {
    // "Each product in the numerator therefore carries exactly one factor from each clock, so the
    //  whole numerator scales by (1 + eA)(1 + eB) — whatever the reply times are. The denominator …
    //  scales by 1 + (eA + eB)/2."
    for (const [eA, eB] of [[20e-6, -20e-6], [20e-6, 20e-6], [10e-6, -10e-6], [-5e-6, 20e-6]]) {
      for (const slot of [1, 2, 3, 4]) {
        const t = trueTimes(slot)
        const num = (x: typeof t): number => x.tround1 * x.tround2 - x.treply1 * x.treply2
        const den = (x: typeof t): number => x.tround1 + x.tround2 + x.treply1 + x.treply2
        // the phone measures tround1 and treply2; the anchor measures treply1 and tround2
        const m = {
          tround1: t.tround1 * (1 + eA), treply2: t.treply2 * (1 + eA),
          treply1: t.treply1 * (1 + eB), tround2: t.tround2 * (1 + eB),
        }
        expect(num(m) / num(t), `num ${eA} ${eB} ${slot}`).toBeCloseTo((1 + eA) * (1 + eB), 10)
        expect(den(m) / den(t), `den ${eA} ${eB} ${slot}`).toBeCloseTo(1 + (eA + eB) / 2, 6)
      }
    }
  })

  it('what survives is Tprop·(eA + eB)/2: 0.23 ps, 0.07 mm, at the worst crystals allowed', () => {
    // "What survives is Tprop·(eA + eB)/2 — the flight time scaled by ppm, not the reply. At the
    //  worst pair the standard allows, both crystals 20 ppm out the same way, that is 0.23 ps: 0.07 mm."
    const e = UWB_PPM_MAX * 1e-6
    for (const slot of [1, 4]) {
      const t = trueTimes(slot)
      const tprop = metresToNs(RING_M) / RCTU_NS
      const est = dsTwr(t.tround1 * (1 + e), t.treply1 * (1 + e), t.tround2 * (1 + e), t.treply2 * (1 + e))
      const errPs = (est - tprop) * RCTU_NS * 1000
      expect(errPs.toFixed(2), `slot ${slot}`).toBe('0.23')
      expect(((est - tprop) * RCTU_NS * C_M_PER_NS * 1000).toFixed(2), `slot ${slot}`).toBe('0.07')
      expect(errPs).toBeCloseTo(metresToNs(RING_M) * e * 1000, 6)
    }
    // and with the two crystals opposed, as in this scene, it is nanometres
    for (const slot of [1, 4]) {
      const t = trueTimes(slot)
      const tprop = metresToNs(RING_M) / RCTU_NS
      const est = dsTwr(t.tround1 * (1 + e), t.treply1 * (1 - e), t.tround2 * (1 - e), t.treply2 * (1 + e))
      expect(Math.abs(rctuToMetres(est - tprop)), `slot ${slot}`).toBeLessThan(1e-8)
    }
  })
})

describe('uwb-dstwr · the same number on two lanes', () => {
  it('the anchors finish at the Final, 10 236 615 ns; the phone at each report, from 12 191 486 ns', () => {
    // "An anchor can finish the moment the Final arrives, at 10 236 615 ns; the phone must wait for
    //  that anchor’s report — 12 191 486 ns for anchor 1, almost two milliseconds later." /
    // "All four anchor-lane ranges appear at 10 236 615 ns … the tag-lane ones follow at 12, 14, 16 and 18 ms"
    expect(anchorRanges()).toHaveLength(ANCHORS)
    expect(tagRanges()).toHaveLength(ANCHORS)
    expect(anchorRanges().map((r) => r.t)).toEqual([10_236_615, 10_236_615, 10_236_615, 10_236_615])
    expect(tagRanges().map((r) => r.t)).toEqual([12_191_486, 14_191_486, 16_191_486, 18_191_486])
    expect(tagRanges()[0].t - anchorRanges()[0].t).toBeGreaterThan(1.9 * MS)
    expect(tagRanges()[0].t - anchorRanges()[0].t).toBeLessThan(2 * MS)
  })

  it('each pair carries the same distance, identical to the last digit of tofRctu', () => {
    // "The log carries the same distance on both lanes, identical to the last digit of tofRctu" /
    // "Each pair reads the same distance: 3.51, 3.49, 3.54 and 3.45 m against a true 3.50 m."
    for (let i = 0; i < ANCHORS; i++) {
      const a = anchorRanges()[i]
      const t = tagRanges()[i]
      expect(a.peer).toBe('tag-1')
      expect(t.peer).toBe(a.node)
      expect(t.tofRctu, a.node).toBe(a.tofRctu)
      expect(Math.abs(t.distM - a.distM), a.node).toBeLessThan(1e-9)
      // DS-TWR reports no raw figure: there is no uncorrected estimate to show
      expect(t.method).toBe('ds')
      expect(t.tofRawRctu).toBeUndefined()
      expect(t.trueDistM).toBe(RING_M)
    }
    expect(tagRanges().map((r) => fmtRecord(r))).toEqual([
      'tag-1 range → anchor-1 (DS): 3.51 m (true 3.50 m)',
      'tag-1 range → anchor-2 (DS): 3.49 m (true 3.50 m)',
      'tag-1 range → anchor-3 (DS): 3.54 m (true 3.50 m)',
      'tag-1 range → anchor-4 (DS): 3.45 m (true 3.50 m)',
    ])
  })

  it('the round ends in one fix, 2 cm out, with a GDOP of 1.00', () => {
    // "At the round’s end the four ranges become a fix at (5.01, 3.98) m against a true (5.00, 4.00)
    //  — 2 cm out, GDOP 1.00 for this symmetric ring."
    const fixes = ofType(recs(), 'UWB_POSITION')
    expect(fixes).toHaveLength(1)
    const f = fixes[0]
    expect(f.t).toBe(PLAN.roundNs)
    expect(f.anchors).toHaveLength(ANCHORS)
    expect(f.gdop.toFixed(2)).toBe('1.00')
    expect(Math.hypot(f.x - f.trueX, f.y - f.trueY)).toBeLessThan(0.2)
    expect(fmtRecord(f)).toBe(
      'tag-1 position (5.01, 3.98) m, true (5.00, 4.00), error 0.02 m, GDOP 1.00, 4 anchors')
  })
})

describe('uwb-dstwr · what the timestamp noise leaves', () => {
  it('every range is inside three sigma of its own slot, in both scenes', () => {
    for (const v of [undefined, 0]) {
      for (const [i, r] of tagRanges(v).entries()) {
        const bound = 3 * dsSigmaM(i + 1)
        expect(Math.abs(r.distM - RING_M), `${String(v)} ${r.peer} inside ${bound.toFixed(3)} m`).toBeLessThan(bound)
        expect(Math.abs(r.distM - r.trueDistM), `${String(v)} ${r.peer}`).toBeLessThan(0.15)
      }
    }
  })

  it('the four errors of this run are +1.4, −0.9, +3.7 and −5.2 cm — all inside 6 cm', () => {
    // "The four errors here are +1.4, −0.9, +3.7 and −5.2 cm." / "anchor 4 waits 8 ms before its
    //  Response while the phone waits 2 ms before the Final, the reverse of anchor 1, and both land
    //  inside 6 cm"
    expect(tagRanges().map((r) => ((r.distM - RING_M) * 100).toFixed(1))).toEqual(['1.4', '-0.9', '3.7', '-5.2'])
    for (const r of tagRanges()) expect(Math.abs(r.distM - RING_M), r.peer).toBeLessThan(0.06)
  })

  it('the 1-σ is 1.9 cm in slots 1 and 4, 1.8 cm in slots 2 and 3, and does not ramp', () => {
    // "weighted by the reply times: 1.9 cm of 1-σ in slots 1 and 4, 1.8 cm in slots 2 and 3. Unlike
    //  lesson 2’s residual it does not ramp; anchor 4 waited four times as long and gets the same figure."
    const sigmas = [1, 2, 3, 4].map(dsSigmaM)
    expect(sigmas.map((s) => (s * 100).toFixed(1))).toEqual(['1.9', '1.8', '1.8', '1.9'])
    expect(dsSigmaM(4)).toBeCloseTo(dsSigmaM(1), 15)
    expect(Math.max(...sigmas) / Math.min(...sigmas)).toBeLessThan(1.06)
    // …and it is smaller than the single-sided range noise of lesson 2, not larger
    expect(Math.max(...sigmas)).toBeLessThan(rangeSigmaM(SESSION.tsNoisePs))
    // measured over a hundred seeds, each slot's RMS matches that prediction within a quarter
    const rms = [0, 0, 0, 0]
    const SEEDS = 100
    for (let seed = 1; seed <= SEEDS; seed++) {
      const sc = { ...scenarioOf(), seed }
      const rs = [...new Simulation(sc).runUntil(25 * MS).records]
      const rg = rs.filter((r): r is Extract<TLRecord, { type: 'UWB_RANGE' }> =>
        r.type === 'UWB_RANGE' && r.node === 'tag-1')
      expect(rg, `seed ${seed}`).toHaveLength(ANCHORS)
      rg.forEach((r, i) => { rms[i] += (r.distM - r.trueDistM) ** 2 })
    }
    rms.forEach((sq, i) => {
      const measured = Math.sqrt(sq / SEEDS)
      expect(measured / dsSigmaM(i + 1), `slot ${i + 1} rms ${(measured * 100).toFixed(2)} cm`)
        .toBeGreaterThan(0.75)
      expect(measured / dsSigmaM(i + 1), `slot ${i + 1} rms ${(measured * 100).toFixed(2)} cm`)
        .toBeLessThan(1.25)
    })
  })
})

describe('uwb-dstwr · the ±20 ppm variant', () => {
  it('the halves blow up while the DS ranges move by less than 3 mm', () => {
    // "anchor 1 now reads 15.51 m and −44.47 m where it read 9.51 and −20.49. The DS ranges become
    //  3.52, 3.49, 3.54 and 3.45 m — each within 3 mm of the base run"
    const { tround1, treply1, tround2, treply2 } = fourTimes('anchor-1', 0)
    expect(rctuToMetres(ssTwrRaw(tround1, treply1)).toFixed(2)).toBe('15.51')
    expect(rctuToMetres(ssTwrRaw(tround2, treply2)).toFixed(2)).toBe('-44.47')
    expect(tagRanges(0).map((r) => fmtRecord(r))).toEqual([
      'tag-1 range → anchor-1 (DS): 3.52 m (true 3.50 m)',
      'tag-1 range → anchor-2 (DS): 3.49 m (true 3.50 m)',
      'tag-1 range → anchor-3 (DS): 3.54 m (true 3.50 m)',
      'tag-1 range → anchor-4 (DS): 3.45 m (true 3.50 m)',
    ])
    tagRanges(0).forEach((r, i) => {
      expect(Math.abs(r.distM - tagRanges()[i].distM), r.peer).toBeLessThan(0.003)
    })
  })

  it('the fix is still 2 cm out', () => {
    // "the fix is still 2 cm out. Doubling the crystal error did not cost a centimetre."
    const f = ofType(recs(0), 'UWB_POSITION')
    expect(f).toHaveLength(1)
    expect(Math.hypot(f[0].x - f[0].trueX, f[0].y - f[0].trueY).toFixed(2)).toBe('0.02')
    expect(f[0].gdop.toFixed(2)).toBe('1.00')
  })
})

describe('uwb-dstwr · the quiz', () => {
  it('the quiz keys its answers to the numbers the lesson prints', () => {
    // every distractor that quotes a figure quotes one the prose also carries
    const text = prose()
    for (const s of ['0.23 ps', '9.67 %', '9.56 %', '−5.49 m', '1.9 cm', '100 ps']) {
      expect(text, s).toContain(s)
    }
    expect(uwbDstwr.quiz.map((q) => q.answer)).toEqual([1, 1, 1])
  })
})
