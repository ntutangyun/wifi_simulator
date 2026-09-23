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
import { uwbSts, uwbStsScenario, RELAY_ADVANCE_NS } from '../../src/course/uwb/uwb-sts'
import { uwbIntro, uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { C_M_PER_NS, PSYM_CHIPS, RCTU_NS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS } from '../../src/uwb/phy'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
import { counterDiff } from '../../src/uwb/clock'
import { rctuToMetres, ssTwrRaw } from '../../src/uwb/ranging'
import { fmtRecord } from '../../src/ui/format'
import type { Block } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** Variant indices: the relay with the sequence off, the same relay with it on, and the
 * honest 20 m room the counter table compares both of them against. */
const V_OFF = 0
const V_ON = 1
const V_HONEST_20 = 2

const recs = (variant?: number): TLRecord[] => runOf(uwbSts, variant, RUN_NS)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The prose window is 1050 rather than 820 since the 2026-09-23 amendment
// ("mechanism before metaphor"): `numbers` now carries what the receiver does
// with the sequence, step by step, in the order src/uwb/device.ts does it.
lessonShapeSuite(uwbSts, { proseMax: 1050, runNs: RUN_NS })

describe('uwb-sts · the lesson', () => {
  it('follows uwb-frame in module 11 and names its three new words', () => {
    expect(uwbSts.id).toBe('uwb-sts')
    expect(uwbSts.module).toBe(11)
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
    expect(uwbSts.variants!.map((v) => v.label.en))
      .toEqual(['A relay, and the sequence off', 'The same relay, the sequence on', 'Honest, at 20 m'])
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
    // and the prose sends the reader to it by name
    const counters = uwbSts.numbers!.filter((b) => b.kind === 'table')[1]
    expect(counters.head[1].en).toBe('Honest, at 20 m (third variant)')
    expect(uwbSts.tryThis[0].en).toContain('the third, the honest 20 m room')
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
      && b.text.en === '50 ns × 0.299792458 m/ns = 14.99 m')).toBe(true)
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

  it('the numbers prose and the quiz describe the subtraction the same way', () => {
    // Review I4: the prose used to say the two halves "pull the same way"; they do not.
    const p = uwbSts.numbers!.find((b): b is Extract<Block, { kind?: 'p' }> =>
      (b.kind ?? 'p') === 'p' && b.heading?.en === 'The same subtraction, in counter units')!
    expect(p.text.en).toContain('makes the round trip shorter and the reply time longer')
    expect(p.text.en).toContain('their difference falls by twice the advance')
    expect(p.text.en).not.toContain('pull the same way')
    expect(uwbSts.quiz[1].explain.en).toContain('One reading falls and the other rises')
    // the two say the same thing: one shorter, one longer, difference doubled, halving leaves one
    for (const s of [p.text.en, uwbSts.quiz[1].explain.en]) {
      expect(/short|fall/i.test(s) && /long|rise/i.test(s), s).toBe(true)
      expect(/twice|two/i.test(s), s).toBe(true)
    }
  })

  it('the STS segment really is about as long as the SYNC that opens the frame', () => {
    // Review I5: depth may be dense, not wrong. 64 × 512 against 64 × 508.
    expect(STS_ACTIVE_CHIPS).toBe(32_768)
    expect(SYNC_SYMBOLS * PSYM_CHIPS).toBe(32_512)
    expect(STS_ACTIVE_CHIPS / (SYNC_SYMBOLS * PSYM_CHIPS)).toBeCloseTo(1.008, 3)
    const deeper = (uwbSts.deeper ?? []).map((b) => (b as { text: { en: string } }).text.en).join('\n')
    expect(deeper).toContain('about as long as the SYNC that opens the frame, which is 32 512 chips')
    expect(deeper).not.toContain('two thirds as long again')
  })

  it('the observations quote the three outcomes the table lists', () => {
    expect(uwbSts.observe[0].en).toContain('4.95 m against a true 5.00 m')
    expect(uwbSts.observe[1].en).toContain('4.96 m against a true 20.00 m')
    expect(uwbSts.observe[2].en).toContain('one UWB_STS_REJECT at anchor-1 on the poll')
    const table = uwbSts.numbers!.find((b) => b.kind === 'table')!
    expect(table.rows.map((row) => row[2].en)).toEqual(['4.95 m', '4.96 m', 'none'])
    expect(table.rows[2][3].en).toBe('1 × UWB_STS_REJECT, 2 × UWB_TIMEOUT')
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

describe('uwb-sts · what the try-this experiments ask for', () => {
  it('the relay at 5 m would take the range below zero', () => {
    // the second experiment: "It steals the same 14.99 m, so the range comes out below zero."
    const honest = ofType(recs(), 'UWB_RANGE')[0].distM
    expect(honest - RELAY_ADVANCE_NS * C_M_PER_NS).toBeLessThan(0)
    expect(uwbSts.tryThis[1].en).toContain('the range comes out below zero')
    expect(uwbSts.tryThis[0].en).toContain('3195 RCTU')
  })

  it('the counter table tags the advance itself as the simulator’s own number', () => {
    // "The advance itself | — | 50 ns | scenario.uwb.attacker, a model choice": the steps say
    // what the relay does, and the table says whose number it is.
    const counters = uwbSts.numbers!.filter((b) => b.kind === 'table')[1]
    const row = counters.rows.find((r) => r[0].en === 'The advance itself')!
    expect(row[2].en).toBe('50 ns')
    expect(row[3].en).toContain('scenario.uwb.attacker')
    expect(row[3].en).toContain('model choice')
    expect(uwbStsScenario(true).uwb!.attacker!.advanceNs).toBe(RELAY_ADVANCE_NS)
  })

  it('names the standard, the model choices and the units in `sources`', () => {
    const src = uwbSts.sources!.map((s) => s.en).join('\n')
    expect(src).toContain('IEEE Std 802.15.4-2024')
    expect(src).toContain('scenario.uwb.attacker')
    expect(src).toContain('scenario.uwb.stsOff')
    expect(src).toContain('15.650 ps')
    expect(src).toContain('0.299792458 m/ns')
  })
})
