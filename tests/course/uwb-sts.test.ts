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
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { C_M_PER_NS, PSYM_CHIPS, RCTU_NS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS } from '../../src/uwb/phy'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
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
