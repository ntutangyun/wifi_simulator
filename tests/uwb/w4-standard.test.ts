/**
 * W4 (2026-11-11): one-way ranging and angle of arrival brought to IEEE Std 802.15.4-2024 — one test
 * per fix, each citing the clause it pins. See docs/superpowers/specs/2026-11-11-w4-design.md.
 *
 * 1. DL-TDoA is §10.29.1.2.5's second case in Figure 10-225's "<OWR>" round: the controller's RCM (ARC
 *    Ranging Round Usage = 0, Table 10-164; RR; RDM, §10.32.9.8), then one bare ranging message per
 *    synchronized anchor at a known offset. No transmit-time, receive-times or clock-offset IE.
 * 2. The UL-TDoA blink is §10.29.1.2.5's 12-octet multipurpose frame (§7.3.5), no IE.
 * 3. The bearing an SRRR RAOA bit asks for is the RMI IE's AOA Azimuth field (§10.29.8.4), no IE of its own.
 * 4. An SS-TWR responder that sets the RRMC TOF Request field gets its range in the initiator's RMI
 *    report (§10.29.8.3, §10.32.4 Figure 10-235).
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { DEFAULT_UWB_SESSION, ScenarioSchema, type NodeCfg, type Scenario, type UwbSessionCfg } from '../../src/model/scenario'
import { anchor, oneRoom, uwbSc, uwbTag } from '../../src/course/lessonKit'
import { makeBlink, makeSsDefer } from '../../src/uwb/frames'
import { uwbSessionRepair, uwbSsTofRequestAllowed } from '../../src/uwb/ui/UwbSessionFields'
import {
  RMI_AOA_AZIMUTH_BYTES, UWB_BLINK_BYTES, UWB_OWR_MSG_BYTES, UWB_SS_DEFER_BYTES, uwbOwrRcmBytes, uwbSlotsPerTag,
  uwbSp3ReportBytes, uwbSsTofReportBytes,
} from '../../src/uwb/phy'

const MS = 1_000_000
const run = (s: Scenario, ns = 200 * MS - 1): TLRecord[] => [...new Simulation(s).runUntil(ns).records]
const of = <K extends TLRecord['type']>(rs: TLRecord[], t: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === t)

const corners = (): NodeCfg[] => [
  anchor('a1', 'A1', 0.5, 0.5, 2.2), anchor('a2', 'A2', 9.5, 0.5, 2.2),
  anchor('a3', 'A3', 0.5, 7.5, 2.2), anchor('a4', 'A4', 9.5, 7.5, 2.2),
]
const scene = (nodes: NodeCfg[], session: Partial<UwbSessionCfg>): Scenario => uwbSc(oneRoom(), nodes, session)

describe('W4 · DL-TDoA is standard §10.29.1.2.5\'s second case (Figure 10-225 "<OWR>")', () => {
  const rs = run(scene([...corners(), uwbTag('t1', 'T1', 4, 3.5, 1)], { mode: 'dl-tdoa', nlos: false }))

  it('the round is the controller\'s RCM (ARC Ranging Round Usage 0, RR, RDM) then one bare message per anchor', () => {
    const tx = of(rs, 'TX_START')
    expect(tx.map((r) => [r.node, r.frame.kind, r.frame.uwb?.slot])).toEqual([
      ['a1', 'uwbRcm', 0], ['a1', 'uwbResp', 1], ['a2', 'uwbResp', 2], ['a3', 'uwbResp', 3], ['a4', 'uwbResp', 4],
    ])
    const rcm = tx[0].frame
    expect(rcm.uwb?.arc?.roundUsage).toBe(0) // Table 10-164: OWR
    expect(rcm.uwb?.ies).toEqual(['ARC', 'RR', 'RDM'])
    expect(rcm.bytes).toBe(uwbOwrRcmBytes(4))
    for (const r of tx.slice(1)) {
      expect(r.frame.uwb?.ies).toEqual([])
      expect(r.frame.bytes).toBe(UWB_OWR_MSG_BYTES)
    }
  })

  it('no frame carries a time, and the tag still fixes from the known offsets', () => {
    for (const r of of(rs, 'TX_START')) {
      for (const ie of ['TXT', 'RXT', 'COFF']) expect(r.frame.uwb?.ies ?? []).not.toContain(ie)
    }
    expect(of(rs, 'UWB_TDOA')).toHaveLength(3)
    expect(of(rs, 'UWB_POSITION')).toHaveLength(1)
  })

  it('the anchors are synchronized: a crystal written on an anchor changes no record', () => {
    // Both scenes write a ppm on every anchor, so both skip the same crystal draw (`UwbClock.fromRng`)
    // and only the value differs.
    const at = (ppm: number[]) => corners().map((n, i) => ({ ...n, uwb: { ...n.uwb!, ppm: ppm[i] } }))
    const sc = (ppm: number[]) => scene([...at(ppm), uwbTag('t1', 'T1', 4, 3.5, 1)], { mode: 'dl-tdoa', nlos: false })
    expect(run(sc([15, -15, 7, -3]))).toEqual(run(sc([0, 0, 0, 0])))
  })
})

describe('W4 · the UL-TDoA blink is the 12-octet multipurpose frame of §10.29.1.2.5', () => {
  it('has no IE and is 12 octets on the air', () => {
    const b = makeBlink('t1', 0, 0)
    expect(b.bytes).toBe(12)
    expect(UWB_BLINK_BYTES).toBe(12)
    expect(b.uwb?.ies).toEqual([])
    const rs = run(scene([...corners(), uwbTag('t1', 'T1', 4, 3.5, 1)], { mode: 'ul-tdoa', nlos: false }))
    expect(of(rs, 'TX_START').map((r) => [r.frame.kind, r.frame.bytes])).toEqual([['uwbBlink', 12]])
  })
})

describe('W4 · the RAOA bearing is the RMI IE\'s AOA Azimuth field (§10.29.8.4)', () => {
  it('rides the same RMI element, two octets more, no extra IE', () => {
    const f = makeSsDefer('a1', 't1', 1000, 0, 0, 3, -12.5)
    expect(f.uwb?.ies).toEqual(['RMI'])
    expect(f.bytes).toBe(UWB_SS_DEFER_BYTES + RMI_AOA_AZIMUTH_BYTES)
    expect(uwbSp3ReportBytes(true)).toBe(f.bytes)
  })
})

describe('W4 · SS-TWR TOF request (§10.29.8.3, §10.32.4 Figure 10-235)', () => {
  const nodes = (): NodeCfg[] => [anchor('a1', 'A1', 0.5, 0.5, 2.2), anchor('a2', 'A2', 9.5, 0.5, 2.2), uwbTag('t1', 'T1', 4, 3.5, 1)]

  it('adds one slot and one 15 + 6N broadcast RMI report, and each responder ranges from it', () => {
    expect(uwbSlotsPerTag('ss', 2, 'time', 8, 'twr', undefined, undefined, 'embedded', undefined, true))
      .toBe(uwbSlotsPerTag('ss', 2) + 1)
    const rs = run(scene(nodes(), { method: 'ss', ssTofRequest: true, nlos: false }))
    const rep = of(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbReport')
    expect(rep).toHaveLength(1)
    expect(rep[0].frame.bytes).toBe(uwbSsTofReportBytes(2))
    expect(rep[0].frame.uwb?.tofList?.map((e) => e.id)).toEqual(['a1', 'a2'])
    expect(of(rs, 'UWB_RANGE').filter((r) => r.node !== 't1').map((r) => r.node)).toEqual(['a1', 'a2'])
  })

  it('the schema refuses it outside a time-scheduled SP1 SS-TWR round, and the editor repairs it away', () => {
    const bad = scene(nodes(), { method: 'ds', ssTofRequest: true })
    expect(() => ScenarioSchema.parse(bad)).toThrow(/ssTofRequest/)
    const s = { ...DEFAULT_UWB_SESSION, method: 'ds' as const, ssTofRequest: true }
    expect(uwbSsTofRequestAllowed(s)).toBe(false)
    expect(uwbSessionRepair(s, 2).ssTofRequest).toBe(false)
    expect(uwbSsTofRequestAllowed({ ...s, method: 'ss' })).toBe(true)
  })
})
