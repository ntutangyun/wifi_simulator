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
import { C_M_PER_NS, RCTU_NS } from '../../src/uwb/phy'
import { fmtRecord } from '../../src/ui/format'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 30 * MS
/** Variant indices: the relay with the sequence off, then the same relay with it on. */
const V_OFF = 0
const V_ON = 1

const recs = (variant?: number): TLRecord[] => runOf(uwbSts, variant, RUN_NS)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
lessonShapeSuite(uwbSts, { proseMax: 800, runNs: RUN_NS })

describe('uwb-sts · the lesson', () => {
  it('follows uwb-frame in module 11 and names its three new words', () => {
    expect(uwbSts.id).toBe('uwb-sts')
    expect(uwbSts.module).toBe(11)
    expect(uwbSts.needs).toEqual(['uwb-frame'])
    expect(uwbSts.terms!.map((t) => t.term)).toEqual(['relay attack', 'key', 'STS'])
    expect(uwbSts.jumps).toHaveLength(4)
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

  it('the two variants are the same room at 20 m, with a relay in it', () => {
    expect(uwbSts.variants!.map((v) => v.label.en))
      .toEqual(['A relay, and the sequence off', 'The same relay, the sequence on'])
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
})

describe('uwb-sts · 50 ns is 14.99 m', () => {
  it('"50 ns × 0.299792458 m/ns = 14.99 m", and the run loses exactly that', () => {
    expect(C_M_PER_NS).toBe(0.299792458)
    expect((RELAY_ADVANCE_NS * C_M_PER_NS).toFixed(2)).toBe('14.99')
    const honest = ofType(runOf(uwbIntro, 0, RUN_NS), 'UWB_RANGE')[0]
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
    const honest = rx(runOf(uwbIntro, 0, RUN_NS))
    const spoofed = rx(recs(V_OFF))
    expect(honest).toEqual([26_381_601_449, 336_335_294_125])
    expect(spoofed).toEqual([26_381_598_254, 336_335_290_930])
    for (const [i, h] of honest.entries()) expect(h - spoofed[i]).toBe(3195)
    expect((3195 * RCTU_NS).toFixed(1)).toBe('50.0')
    // the raw flights the table quotes, and their difference
    const raw = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE')[0].tofRawRctu!
    expect(raw(runOf(uwbIntro, 0, RUN_NS))).toBe(4267)
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

describe('uwb-sts · what the try-this experiments ask for', () => {
  it('the relay at 5 m would take the range below zero', () => {
    // the second experiment: "It steals the same 14.99 m, so the range comes out below zero."
    const honest = ofType(recs(), 'UWB_RANGE')[0].distM
    expect(honest - RELAY_ADVANCE_NS * C_M_PER_NS).toBeLessThan(0)
    expect(uwbSts.tryThis[1].en).toContain('the range comes out below zero')
    expect(uwbSts.tryThis[0].en).toContain('3195 RCTU')
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
