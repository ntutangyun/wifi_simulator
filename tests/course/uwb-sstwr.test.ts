/**
 * Every empirical claim in the "The clock inside the reply time" lesson,
 * measured against the lesson's own scenario and both of its variants. Each
 * assertion quotes the sentence it guards; the formulas and constants are
 * checked against the engine's own exports (src/uwb/ranging.ts, src/uwb/phy.ts,
 * src/uwb/clock.ts) rather than re-typed.
 */
import { describe, it, expect } from 'vitest'
import { uwbSstwr, uwbSstwrScenario } from '../../src/course/uwb/uwb-sstwr'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import type { Block, L10n } from '../../src/course/lessonKit'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { fmtRecord } from '../../src/ui/format'
import { counterDiff } from '../../src/uwb/clock'
import { rangeSigmaM } from '../../src/uwb/position'
import { metresToNs, rctuToMetres, ssTwrCorrected, ssTwrRaw } from '../../src/uwb/ranging'
import { C_M_PER_NS, FOM_LOS, RCTU_NS, UWB_PPM_MAX, fomDecode, fomText } from '../../src/uwb/phy'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** The ring the scene is built on: every anchor is exactly this far from the tag. */
const RING_M = 3.5

/** The scenario each part of the lesson runs: the base, then variant 0 and variant 1. */
const scenarioOf = (variant?: number): Scenario =>
  variant === undefined ? uwbSstwr.scenario() : uwbSstwr.variants![variant].scenario()
/** The crystal offsets of a scene, read back from the scene itself: tag, anchors, and eA − eB. */
function ppmOf(variant?: number): { tag: number; anchors: number; delta: number } {
  const nodes = scenarioOf(variant).nodes
  const tag = nodes.find((n) => n.uwb!.role === 'tag')!.uwb!.ppm!
  const anchors = nodes.find((n) => n.uwb!.role === 'anchor')!.uwb!.ppm!
  return { tag, anchors, delta: tag - anchors }
}
const BASE_PPM = ppmOf()
const PERFECT_PPM = ppmOf(0)
const TCXO_PPM = ppmOf(1)
/** The session's noise model, likewise read back rather than re-typed. */
const SESSION = uwbSstwr.scenario().uwb!
/** 1-σ of one SS-TWR range at the session's 100 ps timestamp noise: 42.4 mm. */
const SIGMA_R = rangeSigmaM(SESSION.tsNoisePs)
/** 1-σ of what the correction leaves behind for an anchor answering in slot i: ½·Treply·σ_cfo. */
const residualSigmaM = (slot: number): number =>
  ((slot * 2 * MS - metresToNs(RING_M)) * SESSION.cfoNoisePpm * 1e-6) / 2 * C_M_PER_NS
/** The raw error the formula predicts for slot i: Tprop·eA + ½·Treply·(eA − eB), in metres. */
const predictedRawErrM = (slot: number, ppm: { tag: number; delta: number }): number => {
  const tpropNs = metresToNs(RING_M)
  const treplyNs = slot * 2 * MS - tpropNs
  return (tpropNs * ppm.tag * 1e-6 + (treplyNs * ppm.delta * 1e-6) / 2) * C_M_PER_NS
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
const rawErr = (r: Extract<TLRecord, { type: 'UWB_RANGE' }>): number =>
  rctuToMetres(r.tofRawRctu!) - r.trueDistM

describe('uwb-sstwr · lesson shape', () => {
  it('the scenario and both variants pass the scenario schema', () => {
    expect(() => ScenarioSchema.parse(uwbSstwr.scenario())).not.toThrow()
    expect(uwbSstwr.variants).toHaveLength(2)
    for (const v of uwbSstwr.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('the computed study time follows the formula and stays inside the 15–25 minute target', () => {
    const raw = lessonWords(uwbSstwr) / 150
      + OBSERVE_MINUTES * uwbSstwr.observe.length + TRY_MINUTES * uwbSstwr.tryThis.length
    expect(lessonMinutes(uwbSstwr)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonMinutes(uwbSstwr)).toBeGreaterThanOrEqual(15)
    expect(lessonMinutes(uwbSstwr)).toBeLessThanOrEqual(25)
    // the module it belongs to: UWB Tier 1, "Time of flight"
    expect(uwbSstwr.module).toBe(11)
    expect(uwbSstwr.id).toBe('uwb-sstwr')
  })

  it('it offers four jumps, four things to observe, two experiments and three questions', () => {
    expect(uwbSstwr.jumps).toHaveLength(4)
    expect(uwbSstwr.observe).toHaveLength(4)
    expect(uwbSstwr.tryThis).toHaveLength(2)
    expect(uwbSstwr.quiz).toHaveLength(3)
    for (const q of uwbSstwr.quiz) expect(q.options[q.answer]).toBeDefined()
  })

  it('every jump target occurs in the base run, and the last one is the fourth range', () => {
    const rs = recs()
    for (const j of uwbSstwr.jumps) expect(rs.some(j.find), j.label.en).toBe(true)
    // "the fourth range: raw is 24 m long" — a pure predicate on the record, not a counter
    const fourth = uwbSstwr.jumps[3].find
    expect(rs.filter(fourth)).toHaveLength(1)
    expect(ofType(rs, 'UWB_RANGE').findIndex(fourth)).toBe(3)
  })

  it('the two jump labels that quote a number quote the number the run produces', () => {
    // "the first range: raw is 6 m long" / "the fourth range: raw is 24 m long"
    expect(uwbSstwr.jumps.map((j) => j.label.en)).toEqual([
      'the poll leaves the phone', 'the first anchor answers',
      'the first range: raw is 6 m long', 'the fourth range: raw is 24 m long',
    ])
    expect(Math.round(rawErr(ranges()[0]))).toBe(6)
    expect(Math.round(rawErr(ranges()[3]))).toBe(24)
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
    walk({ title: uwbSstwr.title, body: uwbSstwr.body, observe: uwbSstwr.observe, tryThis: uwbSstwr.tryThis, quiz: uwbSstwr.quiz, variants: uwbSstwr.variants, jumps: uwbSstwr.jumps })
    expect(seen.length).toBeGreaterThan(50)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('names the standard clauses it leans on and the three numbers that are model', () => {
    // the source-status sentence, first block of the body
    const first = uwbSstwr.body[0]
    expect(first.kind ?? 'p').toBe('p')
    const en = (first as Extract<Block, { kind?: 'p' }>).text.en
    for (const s of ['IEEE Std 802.15.4-2024', '§10.29.1.2.2', '§10.29.1.6', '§16.4.9']) {
      expect(en, s).toContain(s)
    }
    for (const s of ['100 ps', '0.2 ppm', '2 ms ranging slot']) expect(en, s).toContain(s)
    expect(en).toContain('FiRa')
  })
})

describe('uwb-sstwr · the scene', () => {
  it('is four anchors on a 3.50 m ring round one phone, all at 2.20 m, in a 10 × 8 m lab', () => {
    // "Four anchors stand on a 3.50 m ring around a phone in the middle of a 10 × 8 m lab, all five
    //  devices at 2.20 m, so every true distance is exactly 3.50 m"
    const s = uwbSstwr.scenario()
    expect(s.rooms).toEqual([{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }])
    expect(s.walls).toHaveLength(4)
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
    expect(s.uwb).toMatchObject({ method: 'ss', nlos: false, slotRstu: 2400, tsNoisePs: 100, cfoNoisePpm: 0.2 })
    // the noise model every bound in this file is built from, taken from the scene, not re-typed
    expect(SESSION.tsNoisePs).toBe(100)
    expect(SESSION.cfoNoisePpm).toBe(0.2)
  })

  it('the base run is the phone 10 ppm fast against anchors 10 ppm slow, inside the ±20 ppm allowed', () => {
    // "The phone runs 10 ppm fast, every anchor 10 ppm slow — well inside the ±20 ppm the standard allows."
    expect(uwbSstwr.scenario().nodes.map((n) => n.uwb!.ppm)).toEqual([-10, -10, -10, -10, 10])
    expect(BASE_PPM).toEqual({ tag: 10, anchors: -10, delta: 20 })
    expect(UWB_PPM_MAX).toBe(20)
    expect(Math.abs(BASE_PPM.tag)).toBeLessThan(UWB_PPM_MAX)
    expect(Math.abs(BASE_PPM.anchors)).toBeLessThan(UWB_PPM_MAX)
  })

  it('the two variants change the crystals and nothing else', () => {
    // "Perfect crystals" / "TCXOs, ±1 ppm" — "which pins both ends to 0 ppm and changes nothing else"
    expect(uwbSstwr.variants!.map((v) => v.label.en)).toEqual(['Perfect crystals', 'TCXOs, ±1 ppm'])
    expect(uwbSstwr.variants!.map((v) => v.label.zh)).toEqual(['理想晶振', '±1 ppm 的温补晶振'])
    expect(uwbSstwr.variants![0].scenario()).toEqual(uwbSstwrScenario({ tag: 0, anchors: 0 }))
    expect(uwbSstwr.variants![1].scenario()).toEqual(uwbSstwrScenario({ tag: 1, anchors: -1 }))
    expect(uwbSstwr.scenario()).toEqual(uwbSstwrScenario({ tag: 10, anchors: -10 }))
    expect(PERFECT_PPM).toEqual({ tag: 0, anchors: 0, delta: 0 })
    expect(TCXO_PPM).toEqual({ tag: 1, anchors: -1, delta: 2 })
    const strip = (s: Scenario): unknown =>
      JSON.stringify({ ...s, nodes: s.nodes.map((n) => ({ ...n, uwb: { role: n.uwb!.role } })) })
    for (const v of uwbSstwr.variants!) expect(strip(v.scenario())).toEqual(strip(uwbSstwr.scenario()))
  })

  it('one poll at 0 ns reaches all four anchors after 12 ns, and the round is five 2 ms slots', () => {
    // "11.675 ns of flight, a 12 ns gap between TX_START and RX_START" / "One poll at 0 ns produces
    //  four RX_START records at 12 ns" / "The round then spends five slots of 2 ms: the poll in slot 0,
    //  one response in each of slots 1 to 4."
    const rs = recs()
    expect(metresToNs(RING_M).toFixed(3)).toBe('11.675')
    expect(Math.ceil(metresToNs(RING_M))).toBe(12)
    const txs = ofType(rs, 'TX_START')
    expect(txs.map((r) => `${r.node}/${r.frame.kind}@${r.t}`)).toEqual([
      'tag-1/uwbPoll@0', 'anchor-1/uwbResp@2000000', 'anchor-2/uwbResp@4000000',
      'anchor-3/uwbResp@6000000', 'anchor-4/uwbResp@8000000',
    ])
    const polls = ofType(rs, 'RX_START').filter((r) => r.t < MS)
    expect(polls).toHaveLength(4)
    for (const r of polls) expect(r.t, r.node).toBe(12)
    const round = ofType(rs, 'UWB_ROUND')
    expect(round).toHaveLength(1)
    expect(round[0].method).toBe('ss')
    expect(round[0].slots).toBe(5)
    expect(round[0].slotNs).toBe(2 * MS)
    expect(ofType(rs, 'UWB_SLOT').map((r) => r.t)).toEqual([0, 2 * MS, 4 * MS, 6 * MS, 8 * MS])
  })
})

describe('uwb-sstwr · the raw error the crystal offset buys', () => {
  it('the formula: the flight term is 35 µm and the reply term 6.0 m per slot', () => {
    // "The first, Tprop·eA, scales a 11.675 ns flight by 10 ppm: 0.12 picoseconds, 35 micrometres" /
    // "The second scales the reply, which at 2 ms is a hundred and seventy thousand times the flight.
    //  At eA − eB = 20 ppm it is ½ × 2 ms × 20 ppm = 20 ns, or 6.0 m of error on a 3.50 m range."
    const tpropNs = metresToNs(RING_M)
    const flightTermNs = tpropNs * BASE_PPM.tag * 1e-6
    expect((flightTermNs * 1000).toFixed(2)).toBe('0.12') // picoseconds
    expect(Math.round(flightTermNs * C_M_PER_NS * 1e6)).toBe(35) // micrometres
    // "a hundred and seventy thousand times the flight": the ratio is 171 306, and it is that
    // number rounded to the nearest ten thousand that the prose speaks
    expect(Math.round((2 * MS) / tpropNs / 10_000) * 10_000).toBe(170_000)
    const replyTermNs = (2 * MS * BASE_PPM.delta * 1e-6) / 2
    expect(replyTermNs).toBe(20)
    expect((replyTermNs * C_M_PER_NS).toFixed(1)).toBe('6.0')
  })

  it('every anchor answers in its own slot, so Treply is i × 2 ms − Tprop — on the anchor’s clock', () => {
    // "The anchor in slot i holds its answer until slot i begins, so its Treply is i × 2 ms − Tprop" /
    // "Treply is a difference of two readings of the anchor’s counter, measured 1 + eB times too long"
    const resp = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbResp')
    expect(resp).toHaveLength(4)
    resp.forEach((r, i) => {
      const treplyNs = r.frame.uwb!.replyRctu! * RCTU_NS
      const trueNs = (i + 1) * 2 * MS - metresToNs(RING_M)
      // the anchors run 10 ppm slow, so each measures the interval 1 + eB times too long
      expect(treplyNs, `slot ${i + 1}`).toBeCloseTo(trueNs * (1 + BASE_PPM.anchors * 1e-6), 0)
      // halved, that shortfall is 3 m per slot — half the raw error; the tag's own +10 ppm on
      // Tround supplies the other half, which is how eA − eB rather than either alone appears
      expect((trueNs - treplyNs) / 2 * C_M_PER_NS, `slot ${i + 1}`).toBeCloseTo((i + 1) * 3, 1)
    })
  })

  it('every cell of the table is either the formula or the run — no free-typed number survives', () => {
    // the four rows "anchor-i | i ms − Tprop | predicted | raw range | raw error"
    const table = uwbSstwr.body.find((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')!
    const cells = table.rows.map((row) => row.map((c) => c.en))
    expect(cells).toHaveLength(4)
    const rs = ranges()
    cells.forEach((row, i) => {
      const slot = i + 1
      const r = rs[i]
      expect(row[0], 'anchor').toBe(r.peer)
      expect(row[1], 'Treply').toBe(`${slot * 2} ms − Tprop`)
      // "Predicted error": the formula, to one decimal — and it lands on exactly i × 6.0 m
      expect(predictedRawErrM(slot, BASE_PPM).toFixed(1)).toBe((slot * 6).toFixed(1))
      expect(row[2], 'predicted').toBe(`${(slot * 6).toFixed(1)} m`)
      // "Raw range" and "Raw error": what the run reports, to two decimals
      expect(row[3], 'raw range').toBe(`${rctuToMetres(r.tofRawRctu!).toFixed(2)} m`)
      expect(row[4], 'raw error').toBe(`${rawErr(r).toFixed(2)} m`)
    })
  })

  it('the four raw ranges are 9.51, 15.47, 21.49 and 27.42 m against a true 3.50 m', () => {
    // the "Raw range" and "Raw error" columns, and "believes it is 9.51 m from one and 27.42 m from another"
    const rs = ranges()
    expect(rs).toHaveLength(4)
    expect(rs.map((r) => r.peer)).toEqual(['anchor-1', 'anchor-2', 'anchor-3', 'anchor-4'])
    expect(rs.every((r) => r.trueDistM === RING_M)).toBe(true)
    expect(rs.map((r) => rctuToMetres(r.tofRawRctu!).toFixed(2))).toEqual(['9.51', '15.47', '21.49', '27.42'])
    expect(rs.map((r) => rawErr(r).toFixed(2))).toEqual(['6.01', '11.97', '17.99', '23.92'])
    // each is within a decimetre of the prediction, and is the engine's own raw figure
    rs.forEach((r, i) => {
      expect(Math.abs(rawErr(r) - predictedRawErrM(i + 1, BASE_PPM)), r.peer).toBeLessThan(0.15)
    })
    // the prose quotes the first and the last of them back at the learner
    const prose = uwbSstwr.body
      .filter((b): b is Extract<Block, { kind?: 'p' }> => (b.kind ?? 'p') === 'p')
      .map((b) => b.text.en).join(' ')
    expect(prose).toContain(`believes it is ${rctuToMetres(rs[0].tofRawRctu!).toFixed(2)} m from one`)
    expect(prose).toContain(`${rctuToMetres(rs[3].tofRawRctu!).toFixed(2)} m from another`)
    // and observe 2 walks the same four figures in order
    expect(uwbSstwr.observe[1].en)
      .toContain(rs.map((r) => rctuToMetres(r.tofRawRctu!).toFixed(2)).join(' → '))
  })

  it('the consecutive raw steps are 5.96, 6.02 and 5.93 m: one 2 ms of waiting costs 6 m', () => {
    // "Take the differences of consecutive raw values: 5.96, 6.02, 5.93 m."
    const raw = ranges().map((r) => rctuToMetres(r.tofRawRctu!))
    expect([1, 2, 3].map((i) => (raw[i] - raw[i - 1]).toFixed(2))).toEqual(['5.96', '6.02', '5.93'])
  })

  it('the raw estimate is exactly ssTwrRaw of the two counter differences', () => {
    // "Find anchor-1’s two UWB_TS counters, 26 381 597 885 and 26 509 391 059. Their difference,
    //  127 793 174 RCTU, is exactly the reply time its response carries."
    const rs = recs()
    const ts = ofType(rs, 'UWB_TS')
    const tagTx = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx')!.counter
    const a1 = ts.filter((r) => r.node === 'anchor-1')
    expect(a1.map((r) => r.counter)).toEqual([26_381_597_885, 26_509_391_059])
    const treply = counterDiff(a1[1].counter, a1[0].counter)
    expect(treply).toBe(127_793_174)
    const resp = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbResp')[0]
    expect(resp.frame.uwb!.replyRctu).toBe(treply)
    const tagRx = ts.find((r) => r.node === 'tag-1' && r.dir === 'rx')!.counter
    expect(ranges()[0].tofRawRctu).toBe(ssTwrRaw(counterDiff(tagRx, tagTx), treply))
  })
})

describe('uwb-sstwr · what the clock-offset correction puts back', () => {
  it('the corrected formula is the engine’s ssTwrCorrected, Treply scaled by (1 − Coffs)', () => {
    // "T̂prop = (Tround − Treply·(1 − Coffs)) / 2" — the formula block
    const formulas = uwbSstwr.body.filter((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
    expect(formulas.some((f) => f.text.en.includes('(Tround − Treply·(1 − Coffs)) / 2'))).toBe(true)
    expect(ssTwrCorrected(1000, 800, 0)).toBe(ssTwrRaw(1000, 800))
    // Coffs is the responder's rate relative to the initiator's: here −20 ppm, and it removes the bias
    const eA = BASE_PPM.tag * 1e-6
    const eB = BASE_PPM.anchors * 1e-6
    const treply = 2 * MS / RCTU_NS
    const tround = treply + 2 * (metresToNs(RING_M) / RCTU_NS)
    const biased = ssTwrRaw(tround * (1 + eA), treply * (1 + eB))
    expect(rctuToMetres(biased) - RING_M).toBeCloseTo(6, 1)
    const fixed = ssTwrCorrected(tround * (1 + eA), treply * (1 + eB), eB - eA)
    expect(rctuToMetres(fixed)).toBeCloseTo(RING_M, 3)
  })

  it('the Coffs the engine actually used is −20 ppm, the responder’s rate minus the initiator’s', () => {
    // "The simulator carries it on every received frame as Coffs — the responder’s clock rate relative
    //  to the initiator’s … positive when the responder runs fast. Here Coffs sits near −20 ppm."
    // Coffs is on no record, so recover it by inverting ssTwrCorrected:
    //   2·tof = Tround − Treply·(1 − Coffs)  ⇒  Coffs = (2·tof − Tround + Treply) / Treply
    const rs = recs()
    const ts = ofType(rs, 'UWB_TS')
    const tagTx = ts.find((r) => r.node === 'tag-1' && r.dir === 'tx')!.counter
    const tagRx = ts.filter((r) => r.node === 'tag-1' && r.dir === 'rx').map((r) => r.counter)
    const replies = ofType(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'uwbResp').map((r) => r.frame.uwb!.replyRctu!)
    const nominal = (BASE_PPM.anchors - BASE_PPM.tag) * 1e-6 // eB − eA = −20 ppm
    expect(nominal).toBeCloseTo(-20e-6, 12)
    ranges().forEach((r, i) => {
      const tround = counterDiff(tagRx[i], tagTx)
      const coffs = (2 * r.tofRctu - tround + replies[i]) / replies[i]
      // within five sigma of the estimator's own 0.2 ppm noise, and "near −20 ppm" to the nearest ppm
      expect(Math.abs(coffs - nominal), `${r.peer}: ${(coffs * 1e6).toFixed(2)} ppm`)
        .toBeLessThan(5 * SESSION.cfoNoisePpm * 1e-6)
      expect(Math.round(coffs * 1e6), r.peer).toBe(-20)
    })
  })

  it('the four corrected ranges read 3.45, 3.42, 3.41 and 3.51 m against a true 3.50 m', () => {
    // "The four range lines now read 3.45, 3.42, 3.41 and 3.51 m against a true 3.50 m — errors of
    //  −5.3, −7.8, −9.5 and +0.5 cm"
    expect(ranges().map((r) => fmtRecord(r))).toEqual([
      'tag-1 range → anchor-1 (SS): 3.45 m (true 3.50 m, raw 9.51 m)',
      'tag-1 range → anchor-2 (SS): 3.42 m (true 3.50 m, raw 15.47 m)',
      'tag-1 range → anchor-3 (SS): 3.41 m (true 3.50 m, raw 21.49 m)',
      'tag-1 range → anchor-4 (SS): 3.51 m (true 3.50 m, raw 27.42 m)',
    ])
    expect(ranges().map((r) => ((r.distM - RING_M) * 100).toFixed(1))).toEqual(['-5.3', '-7.8', '-9.5', '0.5'])
    for (const r of ranges()) expect(rctuToMetres(r.tofRctu)).toBeCloseTo(r.distM, 9)
  })

  it('observe 2’s span holds: the corrected column stays between 3.41 and 3.51 m', () => {
    // "The corrected figures stay between 3.41 and 3.51 m" — anchor 4 is 3.51 m, not "about 3.4 m",
    // and quiz 3 turns on exactly that: it is the most accurate of the four at +0.5 cm.
    const shown = ranges().map((r) => r.distM.toFixed(2))
    const lo = shown.reduce((a, b) => (a < b ? a : b))
    const hi = shown.reduce((a, b) => (a > b ? a : b))
    expect([lo, hi]).toEqual(['3.41', '3.51'])
    expect(uwbSstwr.observe[1].en).toContain(`between ${lo} and ${hi} m`)
    expect(uwbSstwr.observe[1].zh).toContain(`${lo} 与 ${hi} m`)
    // quiz 3: anchor 4 really is the closest to the truth of the four
    const err = ranges().map((r) => Math.abs(r.distM - RING_M))
    expect(err.indexOf(Math.min(...err))).toBe(3)
  })

  it('every corrected error stays inside three sigma of its own slot’s residual', () => {
    // "The residual is then ½·Treply·σ_cfo … 6.0 cm of 1-σ for anchor 1, 24.0 cm for anchor 4. The four
    //  errors above are one draw from those four distributions, which is why they do not increase
    //  monotonically: −9.5 cm at anchor 3 is well inside its sigma"
    expect((residualSigmaM(1) * 100).toFixed(1)).toBe('6.0')
    expect((residualSigmaM(4) * 100).toFixed(1)).toBe('24.0')
    // "3.0 cm per millisecond of reply"
    expect(((SESSION.cfoNoisePpm * 1e-6 * MS) / 2 * C_M_PER_NS * 100).toFixed(1)).toBe('3.0')
    ranges().forEach((r, i) => {
      const bound = 3 * Math.hypot(residualSigmaM(i + 1), SIGMA_R)
      expect(Math.abs(r.distM - RING_M), `${r.peer} inside ${bound.toFixed(3)} m`).toBeLessThan(bound)
    })
    // anchor 3's −9.5 cm is inside one sigma of its own 18.0 cm residual
    expect(Math.abs(ranges()[2].distM - RING_M)).toBeLessThan(residualSigmaM(3))
    // and every corrected error is at least an order of magnitude smaller than its raw error
    for (const r of ranges()) expect(Math.abs(r.distM - RING_M)).toBeLessThan(Math.abs(rawErr(r)) / 40)
  })

  it('the Figure of Merit byte on every received timestamp decodes to 97 % within 0.5 ns', () => {
    // "Every UWB_TS line for a received frame ends in “(97 % within 0.5 ns)”. That is the Figure of
    //  Merit byte, 0x16 here … three bits of confidence level (6 → 97 %), two bits of interval
    //  (2 → 1 ns) and two bits of scale (0 → ×0.5) … 15 cm of one-way flight."
    expect(FOM_LOS).toBe(0x16)
    expect(FOM_LOS & 0x7).toBe(6)
    expect((FOM_LOS >> 3) & 0x3).toBe(2)
    expect((FOM_LOS >> 5) & 0x3).toBe(0)
    expect(fomDecode(FOM_LOS)).toEqual({ levelPct: 97, intervalNs: 0.5 })
    // the two parenthetical lookups separately: interval index 2 is 1 ns (read with the identity
    // scale index 1), and scale index 0 halves it. The tables themselves are module-private, so
    // this is the finest grain the exported fomDecode allows.
    expect(fomDecode((FOM_LOS & 0x1f) | (1 << 5)).intervalNs).toBe(1)
    expect(fomDecode(FOM_LOS).intervalNs).toBe(0.5 * fomDecode((FOM_LOS & 0x1f) | (1 << 5)).intervalNs)
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
    expect(Math.round(0.5 * C_M_PER_NS * 100)).toBe(15)
    const rxTs = ofType(recs(), 'UWB_TS').filter((r) => r.dir === 'rx')
    expect(rxTs).toHaveLength(8)
    for (const r of rxTs) expect(fmtRecord(r), r.node).toContain('(97 % within 0.5 ns)')
    for (const r of ranges()) expect(r.fom).toBe(FOM_LOS)
  })
})

describe('uwb-sstwr · the two variants', () => {
  it('"Perfect crystals": the ramp disappears and only timestamp noise is left', () => {
    // "The raw errors collapse to 1.9, −1.9, 0.7 and −6.1 cm — no ramp at all, because eA − eB is
    //  zero. What remains is timestamp noise, whose 1-σ is 4.2 cm"
    const rs = ranges(0)
    expect(rs).toHaveLength(4)
    expect(rs.map((r) => (rawErr(r) * 100).toFixed(1))).toEqual(['1.9', '-1.9', '0.7', '-6.1'])
    for (const r of rs) expect(Math.abs(rawErr(r)), r.peer).toBeLessThan(0.15)
    expect((SIGMA_R * 100).toFixed(1)).toBe('4.2')
    // nothing about the raw error now depends on the slot
    for (const r of rs) expect(Math.abs(rawErr(r))).toBeLessThan(2 * SIGMA_R)
  })

  it('"TCXOs, ±1 ppm" is a TENTH of the base offset, and gives a tenth of the ramp', () => {
    // "a tenth of the base offset — eA − eB falls from 20 ppm to 2 ppm" / "still about 0.60 m per
    //  slot" / "Better crystals buy an order of magnitude" — all three say the same factor, 10.
    expect(BASE_PPM.delta).toBe(20)
    expect(TCXO_PPM.delta).toBe(2)
    expect(BASE_PPM.delta / TCXO_PPM.delta).toBe(10)
    expect(uwbSstwr.tryThis[1].en).toContain('a tenth of the base offset')
    expect(uwbSstwr.tryThis[1].en).toContain(`from ${BASE_PPM.delta} ppm to ${TCXO_PPM.delta} ppm`)
    expect(uwbSstwr.tryThis[1].zh).toContain('十分之一')
    expect(uwbSstwr.tryThis[1].zh).toContain(`从 ${BASE_PPM.delta} ppm 降到 ${TCXO_PPM.delta} ppm`)
    // the formula's per-slot cost is a tenth too: 0.5996 m against 5.996 m
    for (const slot of [1, 2, 3, 4]) {
      expect(predictedRawErrM(slot, BASE_PPM) / predictedRawErrM(slot, TCXO_PPM)).toBeCloseTo(10, 6)
    }
    expect(predictedRawErrM(1, TCXO_PPM).toFixed(2)).toBe('0.60')
    expect(predictedRawErrM(1, BASE_PPM).toFixed(2)).toBe('6.00')
  })

  it('"TCXOs, ±1 ppm": the ramp survives at 0.60 m per slot, still metres on a 3.50 m range', () => {
    // "The raw errors become 0.62, 1.18, 1.80 and 2.34 m: still a ramp, still about 0.60 m per slot,
    //  still hopeless for a 3.50 m range."
    const rs = ranges(1)
    expect(rs).toHaveLength(4)
    expect(rs.map((r) => rawErr(r).toFixed(2))).toEqual(['0.62', '1.18', '1.80', '2.34'])
    rs.forEach((r, i) => {
      const predictedM = predictedRawErrM(i + 1, TCXO_PPM)
      expect(predictedM.toFixed(2), r.peer).toBe(((i + 1) * 0.5996).toFixed(2))
      expect(Math.abs(rawErr(r) - predictedM), r.peer).toBeLessThan(0.15)
      // and the measured ramp is a tenth of the measured base ramp, to within the timestamp noise
      expect(Math.abs(rawErr(r) * 10 - rawErr(ranges()[i])), r.peer).toBeLessThan(10 * 0.15)
    })
    // "still hopeless for a 3.50 m range": the last one is most of the distance again
    expect(Math.abs(rawErr(rs[3]))).toBeGreaterThan(RING_M / 2)
  })

  it('the correction rescues all three crystal settings alike', () => {
    // the whole point: the corrected column is flat whatever the crystals do
    for (const v of [undefined, 0, 1]) {
      const rs = ranges(v)
      rs.forEach((r, i) => {
        const bound = 3 * Math.hypot(residualSigmaM(i + 1), SIGMA_R)
        expect(Math.abs(r.distM - RING_M), `${String(v)} ${r.peer}`).toBeLessThan(bound)
      })
    }
  })
})
