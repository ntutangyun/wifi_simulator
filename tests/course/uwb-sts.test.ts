/**
 * Every empirical claim in "A timestamp nobody can fake", measured against the
 * lesson's own scenes.
 *
 * The base is `uwb-intro`'s own scene — the same builder, the same five metres —
 * so the fixture entry for `uwb-sts` is uwb-intro's, value for value, and the
 * assertion that says so lives here rather than in the kit (the kit's
 * `sameSceneAs` also insists the variant lists match, and this lesson's variants
 * are its own: a relay in the room, with and without the sequence).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { uwbSts, uwbStsScenario, uwbStsSequence, HONEST_20_M, SPOOFED_M, RELAY_ADVANCE_NS } from '../../src/course/uwb/uwb-sts'
import { uwbIntro, uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import { DEFAULT_UWB_SESSION, ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  C_M_PER_NS, PSYM_CHIPS, RCTU_NS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS, UWB_CHIP_HZ,
} from '../../src/uwb/phy'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
import { chipsToNs } from '../../src/uwb/units'
import { ratioSigma } from '../../src/uwb/mms'
import { counterDiff } from '../../src/uwb/clock'
import { rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import { fmtRecord } from '../../src/ui/format'
import type { Block } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** Variant indices: the relay with the sequence off, the same relay with it on, and the
 * honest 20 m room the counter table compares both of them against. */
const V_OFF = 0
const V_ON = 1
const V_HONEST_20 = 2

const recs = (variant?: number): TLRecord[] => runOf(uwbSts, variant, RUN_NS)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The prose window is 1200 rather than 820 since the 2026-09-23 amendment
// ("mechanism before metaphor"): `numbers` now carries what the receiver does
// with the sequence, step by step, in the order src/uwb/device.ts does it, and
// the picture separates what real hardware does from what this simulator does.
lessonShapeSuite(uwbSts, { runNs: RUN_NS })

describe('uwb-sts · the lesson', () => {
  it('follows uwb-frame in module 11 and names its three new words', () => {
    expect(uwbSts.id).toBe('uwb-sts')
    expect(MODULES[uwbSts.module].title).toBe('飞行时间')
    expect(uwbSts.needs).toEqual(['uwb-frame'])
    expect(uwbSts.terms!.map((t) => t.term)).toEqual(['relay attack', 'key', 'STS'])
    expect(uwbSts.jumps).toHaveLength(4)
    expect(uwbSts.variants).toHaveLength(3)
    expect(uwbSts.observe).toHaveLength(3)
    expect(uwbSts.tryThis).toHaveLength(2)
    expect(uwbSts.quiz).toHaveLength(3)
  })

  it('loads uwb-intro’s own scene, so its base costs the reader no new room', () => {
    expect(uwbSts.scenario()).toEqual(uwbIntroScenario(5))
    expect(uwbSts.scenario()).toEqual(uwbIntro.scenario())
    // and the fixtures say so: the base entry is uwb-intro's, value for value
    for (const f of ['lesson-hashes.json', 'uwb-record-hashes.json']) {
      const rec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures', f), 'utf8')) as Record<string, string>
      expect(rec['uwb-sts'], f).toBe(rec['uwb-intro'])
    }
  })

  it('the two attacked variants are the same room at 20 m, with a relay in it', () => {
    const base20 = uwbIntroScenario(20)
    for (const [i, stsOff] of [[V_OFF, true], [V_ON, false]] as [number, boolean][]) {
      const sc = uwbSts.variants![i].scenario()
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
      expect(sc).toEqual(uwbStsScenario(stsOff))
      // nothing but the session's two security fields differs from the honest 20 m scene
      expect(sc.nodes).toEqual(base20.nodes)
      expect(sc.uwb!.attacker).toEqual({ advanceNs: 50 })
      expect(sc.uwb!.stsOff).toBe(stsOff ? true : undefined)
      expect({ ...sc.uwb!, attacker: undefined, stsOff: undefined })
        .toEqual({ ...base20.uwb!, attacker: undefined, stsOff: undefined })
    }
    expect(RELAY_ADVANCE_NS).toBe(50)
  })

  it('the honest 20 m room is loadable from this lesson, and is uwb-intro’s own variant', () => {
    // Review I6: the counter table and the first experiment both compare against the honest
    // 20 m run, so the learner has to be able to load it here.
    const honest = uwbSts.variants![V_HONEST_20].scenario()
    expect(honest).toEqual(uwbIntroScenario(20))
    expect(honest).toEqual(uwbIntro.variants![0].scenario())
    expect(honest.uwb!.attacker).toBeUndefined()
    expect(honest.uwb!.stsOff).toBeUndefined()
    // scenario for scenario, so the fixture addition is a copy of uwb-intro's variant entry
    for (const f of ['lesson-hashes.json', 'uwb-record-hashes.json']) {
      const rec = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures', f), 'utf8')) as Record<string, string>
      expect(rec['uwb-sts#2'], f).toBe(rec['uwb-intro#0'])
    }
  })
})

describe('uwb-sts · 50 ns is 14.99 m', () => {
  it('"50 ns × 0.299792458 m/ns = 14.99 m", and the run loses exactly that', () => {
    expect(C_M_PER_NS).toBe(0.299792458)
    expect((RELAY_ADVANCE_NS * C_M_PER_NS).toFixed(2)).toBe('14.99')
    const honest = ofType(recs(V_HONEST_20), 'UWB_RANGE')[0]
    const spoofed = ofType(recs(V_OFF), 'UWB_RANGE')[0]
    expect(honest.trueDistM).toBe(20)
    expect(spoofed.trueDistM).toBe(20)
    expect(honest.distM.toFixed(2)).toBe('19.95')
    expect(spoofed.distM.toFixed(2)).toBe('4.96')
    expect((honest.distM - spoofed.distM).toFixed(2)).toBe('14.99')
    // the formula's note: "one advance of 50 ns is subtracted from the flight once, whole"
    expect(uwbSts.numbers!.some((b) => b.kind === 'formula'
      && b.text === '50 ns × 0.299792458 m/ns = 14.99 m')).toBe(true)
  })

  it('both receive counters come back 3195 RCTU low — 50.0 ns each', () => {
    const rx = (rs: TLRecord[]) => ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx').map((r) => r.counter)
    const honest = rx(recs(V_HONEST_20))
    const spoofed = rx(recs(V_OFF))
    expect(honest).toEqual([26_381_601_449, 336_335_294_125])
    expect(spoofed).toEqual([26_381_598_254, 336_335_290_930])
    for (const [i, h] of honest.entries()) expect(h - spoofed[i]).toBe(3195)
    expect((3195 * RCTU_NS).toFixed(1)).toBe('50.0')
    // the raw flights the table quotes, and their difference
    const raw = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE')[0].tofRawRctu!
    expect(raw(recs(V_HONEST_20))).toBe(4267)
    expect(raw(recs(V_OFF))).toBe(1072)
    expect(4267 - 1072).toBe(3195)
  })
})

describe('uwb-sts · the figure of the two rounds', () => {
  // §4 gives this lesson a `sequence` figure — the honest round, and the round with the box
  // in the middle — and it replaces the paragraph 「为什么帧的开头是一份礼物」 (§5.2 deletes that
  // metaphor). Both ranges it prints are the runs' own, and the middle column is the relay,
  // which is a scenario field rather than a node: the figure is the only place it is drawn.
  const spec = uwbStsSequence()

  it('three columns, and the two the log names are the scene’s own nodes', () => {
    expect(spec.columns.map((c) => c.id)).toEqual(['tag-1', 'box', 'anchor-1'])
    const ids = uwbSts.variants![V_OFF].scenario().nodes.map((n) => n.id)
    expect(ids).toEqual(['anchor-1', 'tag-1'])
    // the box is not a node: it is `scenario.uwb.attacker`, one number
    expect(ids).not.toContain('box')
    expect(uwbSts.variants![V_OFF].scenario().uwb!.attacker).toEqual({ advanceNs: RELAY_ADVANCE_NS })
  })

  it('the two ranges on the arrows are the honest run’s and the spoofed run’s', () => {
    expect(HONEST_20_M).toBe(`${ofType(recs(V_HONEST_20), 'UWB_RANGE')[0].distM.toFixed(2)} m`)
    expect(SPOOFED_M).toBe(`${ofType(recs(V_OFF), 'UWB_RANGE')[0].distM.toFixed(2)} m`)
    expect(spec.messages.map((m) => m.at)).toEqual([HONEST_20_M, undefined, SPOOFED_M])
    // the honest arrow goes straight across; the relayed one is the emphasised pair
    expect(spec.messages[0]).toMatchObject({ from: 'tag-1', to: 'anchor-1' })
    expect(spec.messages[1]).toMatchObject({ from: 'tag-1', to: 'box' })
    expect(spec.messages[2]).toMatchObject({ from: 'box', to: 'anchor-1', tone: 'accent' })
    expect(spec.messages[2].label).toContain(String(RELAY_ADVANCE_NS))
  })

  it('the caption’s claim: what the relay can pre-send is SYNC and SFD, and no more', () => {
    // "the box has only to guess the two public patterns that open a frame" — in this
    // grouping the predictable run ends at the first chip of the STS, which is what the
    // depth says and what the layout shows.
    const poll = ofType(recs(V_OFF), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    const layout = uwbPpduLayout(poll.frame)
    expect(layout.slice(0, 2).map((s) => s.key)).toEqual(['sync', 'sfd'])
    expect(layout[3].key).toBe('sts')
  })
})

describe('uwb-sts · with the sequence on, nothing is measured', () => {
  it('one rejection, two timeouts and no range at all', () => {
    const rs = recs(V_ON)
    const rejects = ofType(rs, 'UWB_STS_REJECT')
    expect(rejects).toHaveLength(1)
    expect(ofType(rs, 'UWB_RANGE')).toHaveLength(0)
    expect(ofType(rs, 'UWB_TIMEOUT')).toHaveLength(2)
    // the anchor is the one that says no, on the round's first reception: the poll
    const [r] = rejects
    expect([r.node, r.peer, r.frameKind, r.advanceNs]).toEqual(['anchor-1', 'tag-1', 'uwbPoll', 50])
    expect(fmtRecord(r))
      .toBe('anchor-1 rejects the poll from tag-1: STS did not verify (leading edge 50 ns early)')
    // and no receive stamp was taken from the frame it threw away
    expect(ofType(rs, 'UWB_TS').filter((x) => x.dir === 'rx')).toEqual([])
  })

  it('the STS segment really is about as long as the SYNC that opens the frame', () => {
    // Review I5: depth may be dense, not wrong. 64 × 512 against 64 × 508.
    expect(STS_ACTIVE_CHIPS).toBe(32_768)
    expect(SYNC_SYMBOLS * PSYM_CHIPS).toBe(32_512)
    expect(STS_ACTIVE_CHIPS / (SYNC_SYMBOLS * PSYM_CHIPS)).toBeCloseTo(1.008, 3)
  })

  it('the outcome table’s three ranges are the three runs’ own', () => {
    // The two ranges the table prints are the runs': the honest 5 m scene and the
    // spoofed 20 m one with the sequence off. The third row has no range at all,
    // and its counter cell names the two record types that replace it.
    const table = uwbSts.numbers!.find((b) => b.kind === 'table')!
    expect(table.rows).toHaveLength(3)
    expect(table.rows[0][2]).toBe(`${ofType(recs(), 'UWB_RANGE')[0].distM.toFixed(2)} m`)
    expect(table.rows[1][2]).toBe(`${ofType(recs(V_OFF), 'UWB_RANGE')[0].distM.toFixed(2)} m`)
    expect(ofType(recs(V_ON), 'UWB_RANGE')).toHaveLength(0)
    expect(table.rows[2][3]).toBe('1 × UWB_STS_REJECT, 2 × UWB_TIMEOUT')
  })

  it('the base scene is honest: one range, within centimetres, and no rejection', () => {
    const rs = recs()
    expect(ofType(rs, 'UWB_STS_REJECT')).toHaveLength(0)
    const range = ofType(rs, 'UWB_RANGE')[0]
    expect(range.t).toBe(2_187_389)
    expect(range.distM.toFixed(2)).toBe('4.95')
    expect(range.trueDistM).toBe(5)
  })
})

describe('uwb-sts · what the receiver does with the sequence', () => {
  // The steps block of `numbers` is the receive path of src/uwb/device.ts, in its order: the
  // attacker branch fires first (a UWB_STS_REJECT and no reading at all when the sequence is on),
  // then `advanceNs` is subtracted from the measured RMARKER instant when it is off, then the
  // counter is taken, and `onResponse` halves the difference of the two subtractions.
  const steps = uwbSts.numbers!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>

  it('the lesson states the procedure as six steps, in the numbers', () => {
    expect(steps).toBeDefined()
    expect(steps.items).toHaveLength(6)
  })

  it('step 1: the sequence sits after the SFD, between two gaps of 512 chips', () => {
    // "the sender places it after the SFD, between two silent gaps of 512 chips"
    const poll = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'uwbPoll')!
    const layout = uwbPpduLayout(poll.frame)
    expect(layout.map((s) => s.key)).toEqual(['sync', 'sfd', 'stsGap', 'sts', 'stsGap', 'phr', 'psdu'])
    expect(STS_GAP_CHIPS).toBe(512)
    // the RMARKER is the first chip after the SFD, so the sequence follows the instant it defends
    const stamped = layout.findIndex((s) => s.rmarkerNs !== undefined)
    expect(layout.slice(0, stamped).map((s) => s.key)).toEqual(['sync', 'sfd'])
    expect(layout.findIndex((s) => s.key === 'sts')).toBeGreaterThan(stamped)
  })

  it('no attacker, no check: the honest scene is never verified against anything', () => {
    // The gate's other half, and the reason the prose cannot say "the check passed": with no
    // relay configured the branch never runs, so an honest round is accepted without any
    // sequence being looked at. Both the 5 m base scene and the honest 20 m variant carry the
    // sequence switched ON.
    for (const [label, v] of [['base', undefined], ['honest 20 m', V_HONEST_20]] as const) {
      const sc = v === undefined ? uwbSts.scenario() : uwbSts.variants![v].scenario()
      expect(sc.uwb!.stsOff, label).toBeUndefined()
      expect(sc.uwb!.attacker, label).toBeUndefined()
      const rs = recs(v)
      expect(ofType(rs, 'UWB_STS_REJECT'), label).toHaveLength(0)
      expect(ofType(rs, 'UWB_RANGE'), label).toHaveLength(1)
    }
  })

  it('step 2: the relay makes every reception of the round land 50 ns early', () => {
    // "The box in the middle re-emits what it hears, so every reception of the round lands
    //  50 ns early." Both receptions move, by the same amount, and nothing else does.
    const rx = (rs: TLRecord[]) => ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx').map((r) => r.counter)
    const honest = rx(recs(V_HONEST_20))
    const spoofed = rx(recs(V_OFF))
    expect(honest).toHaveLength(2)
    expect(spoofed).toHaveLength(2)
    for (const [i, h] of honest.entries()) expect(((h - spoofed[i]) * RCTU_NS).toFixed(1)).toBe('50.0')
    // the transmit stamps, which no relay can touch, do not move at all
    const tx = (rs: TLRecord[]) => ofType(rs, 'UWB_TS').filter((r) => r.dir === 'tx').map((r) => r.counter)
    expect(tx(recs(V_OFF))).toEqual(tx(recs(V_HONEST_20)))
  })

  it('steps 3 and 4: with the sequence on, one rejection, no reading, and the slots run out', () => {
    // "it finds noise there, writes one UWB_STS_REJECT, and takes no reading at all" /
    // "the round ends with two UWB_TIMEOUT lines and no range"
    const rs = recs(V_ON)
    expect(ofType(rs, 'UWB_STS_REJECT')).toHaveLength(1)
    expect(ofType(rs, 'UWB_TS').filter((r) => r.dir === 'rx')).toEqual([])
    expect(ofType(rs, 'UWB_TIMEOUT')).toHaveLength(2)
    expect(ofType(rs, 'UWB_RANGE')).toHaveLength(0)
    // the rejection precedes both timeouts: it is what leaves the slots empty
    expect(ofType(rs, 'UWB_STS_REJECT')[0].t)
      .toBeLessThan(Math.min(...ofType(rs, 'UWB_TIMEOUT').map((r) => r.t)))
  })

  it('steps 5 and 6: 3195 ticks low on both sides, and the halving hands one advance back', () => {
    // "the receiver subtracts the 50 ns from the arrival it measured and stamps 3195 ticks low" /
    // "The round trip falls by 3195 ticks and the reply time rises by 3195, so halving their
    //  difference hands the whole advance back: 14.99 m"
    const stamps = (rs: TLRecord[]) => ofType(rs, 'UWB_TS').map((r) => r.counter)
    const [hTxPoll, hRxPoll, hTxResp, hRxResp] = stamps(recs(V_HONEST_20))
    const [sTxPoll, sRxPoll, sTxResp, sRxResp] = stamps(recs(V_OFF))
    const hRound = counterDiff(hRxResp, hTxPoll)
    const sRound = counterDiff(sRxResp, sTxPoll)
    const hReply = counterDiff(hTxResp, hRxPoll)
    const sReply = counterDiff(sTxResp, sRxPoll)
    expect(hRound - sRound).toBe(3195)
    expect(sReply - hReply).toBe(3195)
    // the difference therefore moves by twice the advance, and the halving leaves exactly one
    expect((hRound - hReply) - (sRound - sReply)).toBe(2 * 3195)
    expect(ssTwrRaw(hRound, hReply) - ssTwrRaw(sRound, sReply)).toBe(3195)
    expect(rctuToMetres(3195).toFixed(2)).toBe('14.99')
    expect((RELAY_ADVANCE_NS * C_M_PER_NS).toFixed(2)).toBe('14.99')
  })
})

/**
 * The two additional STS markers this engine declines to read
 * (`docs/superpowers/specs/2026-10-03-leftovers-design.md` §1, which reclassified them from
 * 未偿的债 to 范围决定). Both numbers the `limits` entry prints are computed here from the
 * constants the engine already holds — there is no SRMARKER constant, and the ruling is that
 * there should not be one.
 */
describe('uwb-sts · the SRMARKERs the engine does not read', () => {
  /** 66 667 → '66 667', the way the lesson spaces a five-digit nanosecond figure. */
  const spaced = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  it('puts SRMARKER1 one gap plus one segment after the RMARKER', () => {
    // SRMARKER0 is the RMARKER itself in both packet configurations this engine builds (§16.2.9.4),
    // and the only other marker that exists in a one-segment BPRF parameter set sits on the
    // 512-chip gap at the end of that segment.
    const span = chipsToNs(STS_GAP_CHIPS + STS_ACTIVE_CHIPS)
    expect(STS_GAP_CHIPS + STS_ACTIVE_CHIPS).toBe(33_280)
    expect(span).toBe(66_667)
    const entry = uwbSts.limits.find((l) => l.text.includes('SRMARKER'))!
    expect(entry.kind).toBe('out-of-scope')
    expect(entry.text).toContain(`${spaced(span)} ns`)
  })

  it('measures the clock ratio that span would buy, and it is ten times worse than the session’s', () => {
    // §10.29.1.1's use for the markers is the engine's own `ratioSigma`, over a span 15 times
    // shorter than the fragment train the course already teaches it on.
    const span = chipsToNs(STS_GAP_CHIPS + STS_ACTIVE_CHIPS)
    const ppm = ratioSigma(DEFAULT_UWB_SESSION.tsNoisePs, span / 1e6) * 1e6
    expect(DEFAULT_UWB_SESSION.tsNoisePs).toBe(100)
    expect(ppm.toFixed(1)).toBe('2.1')
    expect(ppm / DEFAULT_UWB_SESSION.cfoNoisePpm).toBeGreaterThan(10)
    const entry = uwbSts.limits.find((l) => l.text.includes('SRMARKER'))!
    expect(entry.text).toContain(`${ppm.toFixed(1)} ppm`)
    expect(entry.text).toContain(`${DEFAULT_UWB_SESSION.cfoNoisePpm} ppm`)
  })
})

describe('uwb-sts · what the try-this experiments ask for', () => {
  it('the relay at 5 m would take the range below zero', () => {
    // the second experiment: "It steals the same 14.99 m, so the range comes out below zero."
    const honest = ofType(recs(), 'UWB_RANGE')[0].distM
    expect(honest - RELAY_ADVANCE_NS * C_M_PER_NS).toBeLessThan(0)
    expect(uwbSts.tryThis[0]).toContain('3195 RCTU')
  })

  it('the counter table tags the advance itself as the simulator’s own number', () => {
    // The row is found by its provenance cell, not by its label: the claim is that the
    // 50 ns advance is `scenario.uwb.attacker`, a model choice, and that the scenario
    // builder really puts RELAY_ADVANCE_NS there.
    const counters = uwbSts.numbers!.filter((b) => b.kind === 'table')[1]
    const row = counters.rows.find((r) => r[3].includes('scenario.uwb.attacker'))!
    expect(row).toBeDefined()
    expect(row[2]).toBe('50 ns')
    expect(uwbStsScenario(true).uwb!.attacker!.advanceNs).toBe(RELAY_ADVANCE_NS)
  })

  it('names the standard, the model choices and the units in `sources`', () => {
    const src = uwbSts.sources!.map((s) => s).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('scenario.uwb.attacker')
    expect(src).toContain('scenario.uwb.stsOff')
    expect(src).toContain('15.650 ps')
    expect(src).toContain('0.299792458 m/ns')
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file measures the attack to the tick — and compares it with figures typed here, the
 * lesson's own sentence quoted in a comment. The sampling sweep of 2026-10-12 scored the lesson
 * 5 of 6.
 *
 * **The reads worth naming:**
 *
 *  - **the whole lesson is one figure and its consequences**, so it is read that way: the relay's
 *    advance is the scene's own `stsAdvanceNs`, and every other figure in the lesson is derived
 *    from it — the ticks it is worth, the metres it is worth, the ranges the two rounds report,
 *    and the difference between them.
 *  - **the four counters are read as two subtractions.** 「4267 − 1072 = 3195 RCTU」 is the round
 *    trip against the reply, both read off the table's own cells, and the difference has to be
 *    the advance in ticks.
 *  - **the quiz's three wrong answers are read too**, because each is a figure: 7.5 m is the
 *    advance halved, 15 m is it unhalved, 30 m is it doubled — and the right answer is what the
 *    engine actually loses.
 */
describe('uwb-sts · every figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(uwbSts.picture)
  const NUMS = blockText(uwbSts.numbers)
  const DEEP = blockText(uwbSts.deeper)
  const SRC = blockText(uwbSts.sources)
  const LIM = blockText(uwbSts.limits)
  const OBS = blockText(uwbSts.observe)
  const TRY = blockText(uwbSts.tryThis)
  const QUIZ = blockText(uwbSts.quiz)
  const ALL = [PIC, NUMS, DEEP, SRC, LIM, OBS, TRY, QUIZ].join('\n')

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
  const occ = (text: string, needle: string): number => text.split(needle).length - 1
  /** One counter tick, in picoseconds — the unit this lesson counts the advance in. */
  const TICK_PS = RCTU_NS * 1000
  const tableOf = (needle: string): string[][] => {
    const b = uwbSts.numbers!.find((x) => x.kind === 'table'
      && (x as { heading?: string }).heading?.includes(needle))
    expect(b, `no table whose heading contains 「${needle}」`).toBeDefined()
    return (b as { rows: string[][] }).rows
  }
  /** The advance the relay gives every reception of the round, out of the scene itself. */
  const advanceNs = uwbSts.variants![V_OFF]!.scenario().uwb!.attacker!.advanceNs!
  const rangeOf = (variant?: number): Extract<TLRecord, { type: 'UWB_RANGE' }> | undefined =>
    ofType(recs(variant), 'UWB_RANGE')[0]

  it('reads the advance, every printing of it, and what it is worth in metres', () => {
    // 「50 ns」 is printed nine times across the lesson; each one is the scene's own advance.
    // Only the short ones: the lesson also prints a counter instant in nanoseconds, and that
    // is a figure of its own (read in the observe test below).
    for (const [ns] of every(ALL, /(?<!\d )(?<![\d.])(\d{1,3}(?:\.\d)?) ns/g,
      'every printing of the advance in nanoseconds', 15)) {
      expect([advanceNs, Number(advanceNs.toFixed(1))], `「${ns} ns」`).toContain(val(ns!))
    }
    // 「50 ns × 0.299792458 m/ns = 14.99 m」
    const [ns, c, m] = figs(NUMS, /([\d.]+) ns × ([\d.]+) m\/ns = ([\d.]+) m/, 'the advance in metres')
    expect(ns, 'the advance').toBe(advanceNs)
    expect(c, 'the speed of light').toBe(C_M_PER_NS)
    same(String(m), ns! * c!, 'what the advance is worth in metres')
    // …and that is exactly what the attacked round loses against the honest one.
    const honest = rangeOf(V_HONEST_20)!
    const spoofed = rangeOf(V_OFF)!
    same(String(m), honest.distM - spoofed.distM, 'and what the attacked round really loses')
  })

  it('reads the picture’s own four distances, which the prose prints again later', () => {
    /*
     * **Four of the twelve the sweep of 2026-10-13 found were in `picture`** — the same figures
     * the tables and the formula print, said once more in the opening prose. A second printing is
     * its own site, which is this programme's third-oldest rule and still its most productive.
     */
    const honestM = rangeOf(V_HONEST_20)!.distM
    const spoofedM = rangeOf(V_OFF)!.distM
    same(raw(PIC, /测距行报出 ([\d.]+) m/, '`picture` on the honest range')[0]!, honestM,
      'the honest range, in `picture`')
    same(raw(PIC, /于是同一个房间报出 ([\d.]+) m/, '`picture` on the spoofed range')[0]!, spoofedM,
      'and the spoofed one')
    same(raw(NUMS, /凭空少掉手机从未走过的 ([\d.]+) m/, '`numbers` on what is lost')[0]!,
      honestM - spoofedM, 'what the attack takes off the reading')
    const [roomM] = figs(NUMS, /两个变体都站在 (\d+) m 的原因/, '`numbers` on why both rooms are 20 m')
    expect(roomM, 'the room both attacked variants stand in')
      .toBe(Math.round(rangeOf(V_OFF)!.trueDistM))
  })

  it('reads the ticks the advance is worth, every printing of them', () => {
    // 「时间戳因此偏低 3195 格」 and four more printings of the same figure.
    const inTicks = Math.round((advanceNs * 1000) / TICK_PS)
    for (const [ticks] of every(ALL, /(?<![\d.])(\d{3,4}) (?:格|RCTU)/g,
      'every printing of a figure in ticks', 8)) {
      expect([inTicks, 4267, 1072], `「${ticks}」`).toContain(val(ticks!))
    }
    const [low] = figs(NUMS, /时间戳因此偏低 ([\d,]+) 格/, '`numbers` on the ticks')
    expect(low, 'the ticks fifty nanoseconds is')
      .toBe(Math.round((advanceNs * 1000) / TICK_PS))
    // 「一格就是一个 RCTU……15.650 ps」, and the same tick in the table and in `sources`.
    for (const [ps] of every(ALL, /([\d.]+) ps/g, 'every printing of the tick', 4)) {
      expect([Number(TICK_PS.toFixed(3)), 100], `「${ps} ps」`).toContain(val(ps!))
    }
    // `sources` derives the tick from the chip rate: 「一个 RCTU 是 499.2 MHz 码片的 2⁻⁷」
    const [mhz, base, derived] = figs(SRC,
      /一个 RCTU 是 ([\d.]+) MHz 码片的 (\d+)⁻⁷，即 ([\d.]+) ps/, '`sources` on the tick’s derivation')
    expect(mhz! * 1e6, 'the chip rate').toBe(UWB_CHIP_HZ)
    expect(base, 'a binary fraction of it').toBe(2)
    same(String(derived), (1e12 / (mhz! * 1e6)) / base! ** 7, 'the tick that fraction gives')
    same(String(derived), TICK_PS, 'which is the tick the engine uses')
    // 「往返时间降了 3195 格，作答时间升了 3195 格；两者之差折半」
    const [down, up] = figs(NUMS, /往返时间降了 ([\d,]+) 格，作答时间升了 ([\d,]+) 格/,
      '`numbers` on the two movements')
    expect([down, up], 'both move by the advance’s own ticks').toEqual([low, low])
  })

  it('reads the counter table as the two subtractions it is', () => {
    const rows = tableOf('换成计数单位')
    const flat = rows.map((r) => r.join(' · ')).join('\n')
    /*
     * **The four counter values are the run's own stamps** — and they were the only four figures
     * of this lesson with no equal literal anywhere under `tests/`, which is the sweep's own way
     * of saying nothing had ever looked at them. Each is a `UWB_TS` counter: two rows, two
     * columns, the honest 20 m room against the relayed one.
     */
    const stampsOf = (variant?: number): number[] =>
      ofType(recs(variant), 'UWB_TS').map((r) => r.counter)
    const honest = stampsOf(V_HONEST_20)
    const relayed = stampsOf(V_OFF)
    const rxRows = rows.filter((r) => r[0]!.includes('RX RMARKER'))
    expect(rxRows.length, 'the two receive stamps the table prints').toBe(2)
    rxRows.forEach((row, i) => {
      // The anchor's receive stamp is the second of the four, the tag's the fourth.
      const idx = [1, 3][i]!
      expect(val(row[1]!), `the honest counter of 「${row[0]}」`).toBe(honest[idx])
      expect(val(row[2]!), `and the relayed one`).toBe(relayed[idx])
      expect(counterDiff(honest[idx]!, relayed[idx]!),
        `and the relayed stamp is the advance low`).toBe(Math.round((advanceNs * 1000) / TICK_PS))
    })
    const counters = [...flat.matchAll(/([\d]{2,3}(?: \d{3})+)/g)].map((mm) => val(mm[1]!))
    expect(counters.length, 'the four counters the table prints').toBeGreaterThanOrEqual(4)
    const [roundTrip, reply] = figs(NUMS, /([\d,]+) − ([\d,]+) = ([\d,]+) RCTU/, 'the subtraction')
    const [, , diff] = figs(NUMS, /([\d,]+) − ([\d,]+) = ([\d,]+) RCTU/, 'the subtraction’s result')
    expect(roundTrip! - reply!, 'the arithmetic the line prints').toBe(diff)
    expect(diff, 'which is the advance in ticks').toBe(Math.round((advanceNs * 1000) / TICK_PS))
    // 「3195 RCTU = 50.0 ns」 and 「15.650 ps per RCTU」 in the table's own cells.
    const [tableTicks, tableNs] = figs(flat, /([\d,]+) RCTU = ([\d.]+) ns/, 'the table on the advance')
    expect(tableTicks, 'the ticks').toBe(diff)
    same(String(tableNs), (tableTicks! * TICK_PS) / 1000, 'and the nanoseconds they are')
    same(raw(flat, /([\d.]+) ps per RCTU/, 'the table on the tick')[0]!, TICK_PS, 'one tick')
    // 「19.95 m − 4.96 m = 14.99 m」
    const [honestM, spoofedM, lostM] = figs(NUMS, /([\d.]+) m − ([\d.]+) m = ([\d.]+) m/,
      'the subtraction in metres')
    same(String(honestM), rangeOf(V_HONEST_20)!.distM, 'the honest range')
    same(String(spoofedM), rangeOf(V_OFF)!.distM, 'the spoofed one')
    expect(honestM! - spoofedM!, 'and their difference').toBeCloseTo(lostM!, 2)
    // 「(Tround − Treply) / 2」
    const [half] = figs(NUMS, /und − Treply\) \/ (\d+)/, 'the formula’s own divisor')
    expect(half, 'a round trip is two flights').toBe(2)
  })

  it('reads the three rooms, the three ranges and the outcome table', () => {
    const rows = tableOf('三种结局')
    // 「诚实的 20 m（第三个变体）」 and the two attacked rooms: every room is a measured distance.
    for (const [m] of every(ALL, /(\d+) m 的房间|诚实的 (\d+) m|真值是 ([\d.]+) m|放在 (\d+) m 上/g,
      'every room the lesson names', 6).map((g) => [g.find((x) => x !== undefined)!])) {
      expect([5, 20], `「${m} m」`).toContain(Math.round(val(m!)))
    }
    const honest = rangeOf(V_HONEST_20)!
    expect(Math.round(honest.trueDistM), 'the honest room’s own distance').toBe(20)
    // The table's three ranges, each against its own run.
    /*
     * **The table's three rows are the base scene first**, then the two relayed ones — the
     * honest 20 m room is the counter table's column, not a row of this one. Its third row
     * prints no range at all, which the run has to agree with.
     */
    const want: (number | undefined)[] = [
      rangeOf(undefined)?.distM, rangeOf(V_OFF)?.distM, rangeOf(V_ON)?.distM,
    ]
    for (const [i, row] of rows.entries()) {
      const printed = /([\d.]+) m$/.exec(row[2]!)
      const measured = want[i]
      if (printed === null) {
        expect(row[2], `row ${i} says so in words`).toBe('没有')
        expect(measured, `row ${i} prints no range, so the run must give none`).toBeUndefined()
        continue
      }
      expect(measured, `row ${i} prints a range, so the run must give one`).toBeDefined()
      same(printed[1]!, measured!, `the range of row ${i}`)
      // …and the row's own 「真值」 column is that run's true distance.
      const truth = /^([\d.]+) m$/.exec(row[1]!)
      expect(truth, `row ${i}’s true-distance cell`).not.toBeNull()
      expect(Math.round(val(truth![1]!)), `the true distance of row ${i}`)
        .toBe(Math.round([rangeOf(undefined), rangeOf(V_OFF), rangeOf(V_ON)][i]?.trueDistM
          ?? val(truth![1]!)))
    }
    // 「1 × UWB_STS_REJECT, 2 × UWB_TIMEOUT」
    const [rejects, timeouts] = figs(rows.map((r) => r.join(' · ')).join('\n'),
      /(\d+) × UWB_STS_REJECT, (\d+) × UWB_TIMEOUT/, 'the record counts of the rejected run')
    expect(rejects, 'the rejections the sequence causes')
      .toBe(ofType(recs(V_ON), 'UWB_STS_REJECT').length)
    expect(timeouts, 'and the timeouts that follow')
      .toBe(ofType(recs(V_ON), 'UWB_TIMEOUT').length)
  })

  it('reads the segment lengths, the chips either side of them and the SRMARKERs', () => {
    // 「夹在两段 512 码片的静默」
    const [gap] = figs(NUMS, /夹在两段 ([\d ]+) 码片/, '`numbers` on the gaps')
    expect(gap, 'the gap on each side of the sequence').toBe(STS_GAP_CHIPS)
    // 「32 768 个码片——与开头那段 SYNC 差不多长（SYNC 是 32 512 个码片）」
    const [sts, sync] = figs(DEEP, /放了 ([\d ]+) 个码片[^]*?SYNC 是 ([\d ]+) 个码片/,
      '`deeper` on the two segments')
    expect(sts, 'the chips the sequence occupies').toBe(STS_ACTIVE_CHIPS)
    expect(sync, 'and the chips SYNC does').toBe(SYNC_SYMBOLS * PSYM_CHIPS)
    expect(Math.abs(sts! - sync!) / sync!, 'which really are about the same length').toBeLessThan(0.05)
    // `sources`: the same figure again, and then as 64 × 512.
    same(raw(SRC, /里引用的 ([\d ]+) 个有效码片/, '`sources` on the sequence’s length')[0]!,
      STS_ACTIVE_CHIPS, 'the chips the sequence occupies, in `sources`')
    const [reps, unit] = figs(SRC, /（(\d+) × ([\d ]+) 码片）/, '`sources` on the sequence’s own length')
    expect(reps! * unit!, 'the chips those two factors give').toBe(STS_ACTIVE_CHIPS)
    expect(unit, 'in the same units as the gaps').toBe(STS_GAP_CHIPS)
    // 「32 768 个码片和 32 个码片在这里给出完全相同的结果」
    const [long, short] = figs(LIM, /因为 ([\d ]+) 个码片和 (\d+) 个码片/, '`limits` on the zero cost')
    expect(long, 'the length this engine uses').toBe(STS_ACTIVE_CHIPS)
    expect(short, 'against a thousand-fold shorter one').toBeLessThan(long! / 1000)
    // 「五个附加时标（SRMARKER0 到 SRMARKER4）」
    const [from, to] = figs(LIM, /（SRMARKER(\d) 到 SRMARKER(\d)/, '`limits` on the SRMARKERs')
    expect(to! - from! + 1, 'the five the standard defines').toBe(5)
    // 「66.667 µs 的跨度配 100 ps 的时间戳只给到 2.1 ppm，比……0.2 ppm 差十倍」
    const [spanUs, ps, ppm, sessionPpm] = figs(LIM,
      /([\d.]+) µs 的跨度配 (\d+) ps 的时间戳只给到 ([\d.]+) ppm，比会话直接交出来的 ([\d.]+) ppm/,
      '`limits` on the clock ratio')
    expect(ps, 'the timestamp noise this session quotes')
      .toBe(uwbSts.scenario().uwb!.tsNoisePs)
    expect(sessionPpm, 'and the offset residual it hands out')
      .toBe(uwbSts.scenario().uwb!.cfoNoisePpm)
    // The span itself is the engine's own: one gap plus the sequence, in chips.
    same(String(spanUs), chipsToNs(STS_GAP_CHIPS + STS_ACTIVE_CHIPS) / 1000,
      'the span the two markers would be read over')
    same(String(ppm), 1e6 * ratioSigma(ps!, spanUs! / 1000), 'the ratio that span would buy')
    // 「差十倍」 is a floor: the ratio is 10.5, and the sentence says ten times over.
    expect(Math.floor(ppm! / sessionPpm!), 'ten times worse, as the sentence says').toBe(10)
  })

  it('reads the observe lines, the experiments and the quiz’s four options', () => {
    // 「读 2 187 389 ns 处的 UWB_RANGE：报出 4.95 m，真值 5.00 m」
    const base = ofType(recs(), 'UWB_RANGE')[0]!
    const [atNs, got, truth] = figs(OBS, /读 ([\d ]+) ns 处的 UWB_RANGE：报出 ([\d.]+) m，真值 ([\d.]+) m/,
      '`observe` on the base scene')
    expect(atNs, 'when the base round reports').toBe(base.t)
    same(String(got), base.distM, 'what it reports')
    same(String(truth), base.trueDistM, 'and the truth')
    // 「它现在写着 4.96 m，而真值是 20.00 m」
    const [spoofed, farTruth] = figs(OBS, /它现在写着 ([\d.]+) m，而真值是 ([\d.]+) m/,
      '`observe` on the attacked scene')
    same(String(spoofed), rangeOf(V_OFF)!.distM, 'what the attacked round reports')
    same(String(farTruth), rangeOf(V_OFF)!.trueDistM, 'and its truth')
    // `tryThis`: the two differences and the room that would go negative.
    const [tryTicks, tryNs] = figs(TRY, /两个差都是 ([\d,]+) RCTU，也就是 ([\d.]+) ns/,
      '`tryThis` on the two differences')
    expect(tryTicks, 'the ticks each difference comes to')
      .toBe(Math.round((advanceNs * 1000) / TICK_PS))
    expect(tryTicks, 'which is the figure the counter table prints too').toBeGreaterThan(0)
    same(String(tryNs), (tryTicks! * TICK_PS) / 1000, 'and the nanoseconds they are')
    const [atM, lost] = figs(TRY, /这个转发放在 (\d+) m 上[^]*?缩短量还是那 ([\d.]+) m/,
      '`tryThis` on the five-metre room')
    expect(atM, 'the room the experiment moves the relay to').toBe(5)
    same(String(lost), advanceNs * C_M_PER_NS, 'the shortening, which does not move with the room')
    expect(lost, 'and it is more than that room is wide').toBeGreaterThan(atM!)
    // The quiz: its three wrong options are three different mishandlings of the same advance.
    const [halfM] = figs(QUIZ, /约 ([\d.]+) m：往返要折半/, 'the quiz’s first option')
    const [plainM] = figs(QUIZ, /约 (\d+) m：两次接收都动了，折/, 'the quiz’s second option')
    const [doubleM] = figs(QUIZ, /约 (\d+) m：两次接收都动了，而/, 'the quiz’s third option')
    const advanceM = advanceNs * C_M_PER_NS
    same(String(halfM), advanceM / 2, 'the advance halved, which the first option offers')
    expect(plainM, 'the advance itself, rounded, which the second offers').toBe(Math.round(advanceM))
    expect(doubleM, 'and twice it, which the third offers').toBe(Math.round(2 * advanceM))
    // …and the right answer, which the run gives.
    const [answerM] = figs(QUIZ, /还了回来——([\d.]+) m/, 'the quiz’s own answer')
    same(String(answerM), rangeOf(V_HONEST_20)!.distM - rangeOf(V_OFF)!.distM,
      'what the attacked round really loses')
    // 「一个偏长 15 m 而不是偏短 15 m 的距离」
    const [longM, shortM] = figs(QUIZ, /一个偏长 (\d+) m 而不是偏短 (\d+) m/, 'the quiz’s own symmetry')
    expect([longM, shortM], 'the same figure either way').toEqual([plainM, plainM])
    expect(occ(QUIZ, `${plainM} m`), 'printed three times in the quiz').toBe(3)
  })
})
