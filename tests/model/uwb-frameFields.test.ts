import { describe, it, expect } from 'vitest'
import { decodeFrame, ppduLayout, type DecodedFrame } from '../../src/model/frameFields'
import type { FrameDesc } from '../../src/model/frames'
import { uwbFrameFields, uwbPpduLayout } from '../../src/uwb/frameFields'
import { makeBlink, makeFinal, makePoll, makeReport, makeResp } from '../../src/uwb/frames'
import {
  ARC_IE_BYTES, BLINK_IE_BYTES, chipsToNs, DL_COFFS_IE_BYTES, DL_TX_TIME_IE_BYTES, dlRxTimesIeBytes,
  PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, RCMA_IE_BYTES, RCPS_IE_BYTES, rdmIeBytes,
  rmiFinalIeBytes, RMI_REPORT_IE_BYTES, RRMC_IE_BYTES, RRTI_IE_BYTES, SFD_SYMBOLS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS,
  SYNC_SYMBOLS, UWB_BLINK_BYTES, uwbDlFinalBytes, uwbDlPollBytes, uwbDlRespBytes, uwbRespBytes,
} from '../../src/uwb/phy'

const FINAL_TIMES = [
  { id: 'a1', tround1: 1_278_030, treply2: 1_277_900 },
  { id: 'a2', tround1: 1_278_040, treply2: 1_277_910 },
  { id: 'a3', tround1: 1_278_050, treply2: 1_277_920 },
  { id: 'a4', tround1: 1_278_060, treply2: 1_277_930 },
]

const POLL = makePoll('tag', ['a1', 'a2', 'a3', 'a4'], 'ds', 0, 0)
const RESP = makeResp('a1', 'tag', 'ss', 0, 0, 1, 127_803)
const RESP_DS = makeResp('a1', 'tag', 'ds', 0, 0, 1)
const FINAL = makeFinal('tag', FINAL_TIMES, 0, 0, 5)
const REPORT = makeReport('a1', 'tag', 1_277_800, 1_278_100, 0, 0, 6)
const ALL: FrameDesc[] = [POLL, RESP, RESP_DS, FINAL, REPORT]

const fieldSum = (d: DecodedFrame): number =>
  d.users[0].subframes[0].mpdu.fields.reduce((s, f) => s + f.bytes, 0)
const fields = (f: FrameDesc) => uwbFrameFields(f).users[0].subframes[0].mpdu.fields
const keyed = (f: FrameDesc, key: string) => fields(f).find((x) => x.key === key)

describe('uwbFrameFields', () => {
  it('decodes every UWB kind into fields that add up to the frame size', () => {
    for (const f of ALL) {
      const d = uwbFrameFields(f)
      expect(fieldSum(d), `${f.kind} ${f.bytes} B`).toBe(f.bytes)
      expect(d.bytes, f.kind).toBe(f.bytes)
    }
  })

  it('reports an 802.15.4 ranging frame, never an 802.11 control frame', () => {
    for (const f of ALL) {
      expect(uwbFrameFields(f).users[0].subframes[0].mpdu.typeName, f.kind).toBe('Ranging')
    }
  })

  it('breaks the MHR out into the five 802.15.4 header fields', () => {
    const keys = fields(POLL).map((x) => x.key)
    expect(keys.slice(0, 5)).toEqual(['fc', 'seqNo', 'dstPan', 'dstAddr16', 'srcAddr16'])
    expect(keys[keys.length - 1]).toBe('fcs')
    expect(keyed(POLL, 'dstAddr16')!.node).toBe('*')
    expect(keyed(POLL, 'srcAddr16')!.node).toBe('tag')
  })

  it('carries one field per payload IE, in the order the frame lists them', () => {
    expect(fields(POLL).filter((x) => x.key.startsWith('ie')).map((x) => x.key)).toEqual(['ieArc', 'ieRdm', 'ieRrmc'])
    expect(fields(RESP).filter((x) => x.key.startsWith('ie')).map((x) => x.key)).toEqual(['ieRrmc', 'ieRrti'])
    expect(fields(RESP_DS).filter((x) => x.key.startsWith('ie')).map((x) => x.key)).toEqual(['ieRrmc'])
    // one RRTI IE per anchor, each holding that anchor's reply time (standard §10.29.8.1)
    expect(fields(FINAL).filter((x) => x.key.startsWith('ie')).map((x) => x.key))
      .toEqual(['ieRmi', 'ieRrti', 'ieRrti', 'ieRrti', 'ieRrti'])
    expect(fields(REPORT).filter((x) => x.key.startsWith('ie')).map((x) => x.key)).toEqual(['ieRmi'])
  })

  it('sizes every IE at the width the engine states, with nothing absorbed as a remainder', () => {
    expect(keyed(POLL, 'ieArc')!.bytes).toBe(ARC_IE_BYTES)
    expect(keyed(POLL, 'ieRdm')!.bytes).toBe(rdmIeBytes(4))
    expect(keyed(POLL, 'ieRrmc')!.bytes).toBe(RRMC_IE_BYTES)
    expect(keyed(RESP, 'ieRrmc')!.bytes).toBe(RRMC_IE_BYTES)
    expect(keyed(RESP, 'ieRrti')!.bytes).toBe(RRTI_IE_BYTES)
    expect(keyed(RESP_DS, 'ieRrmc')!.bytes).toBe(RRMC_IE_BYTES)
    // The Final carries one reply time per anchor: MHR 9 + (3 + 6N) + N × 6 + FCS 2 = 14 + 12N.
    expect(keyed(FINAL, 'ieRmi')!.bytes).toBe(rmiFinalIeBytes(4))
    const rrti = fields(FINAL).filter((x) => x.key === 'ieRrti')
    expect(rrti).toHaveLength(4)
    expect(rrti.every((x) => x.bytes === RRTI_IE_BYTES)).toBe(true)
    expect(rrti.reduce((s, x) => s + x.bytes, 0)).toBe(4 * RRTI_IE_BYTES)
    expect(keyed(REPORT, 'ieRmi')!.bytes).toBe(RMI_REPORT_IE_BYTES)
  })

  it('refuses to decode a frame whose engine size the fields cannot account for', () => {
    expect(() => uwbFrameFields({ ...FINAL, bytes: 60 })).toThrow(/62 B decoded, engine size 60 B/)
  })

  it('spells the IE contents out in words', () => {
    expect(keyed(RESP, 'ieRrti')!.value).toBe('reply time 127 803 RCTU = 2.000 µs')
    expect(keyed(POLL, 'ieRdm')!.value).toBe('4 devices: a1 slot 1, a2 slot 2, a3 slot 3, a4 slot 4')
    expect(keyed(REPORT, 'ieRmi')!.value).toContain('treply1')
    expect(keyed(FINAL, 'ieRmi')!.value).toContain('a1')
    expect(keyed(FINAL, 'ieRmi')!.value).not.toContain('treply2') // that is the RRTI IEs' job
    expect(fields(FINAL).filter((x) => x.key === 'ieRrti').map((x) => x.value!.split(':')[0])).toEqual(['a1', 'a2', 'a3', 'a4'])
  })

  it('is what decodeFrame returns for a UWB frame', () => {
    for (const f of ALL) expect(decodeFrame(f, { apId: '', isEdca: false })).toEqual(uwbFrameFields(f))
  })

  it('decodes a UL-TDoA blink: MHR 9 + blink IE 3 + FCS 2 = 14 octets', () => {
    const blink = makeBlink('tag-1', 3, 7)
    expect(blink.bytes).toBe(14)
    expect(blink.bytes).toBe(UWB_BLINK_BYTES)
    expect(blink.dst).toBe('*')
    const d = uwbFrameFields(blink)
    expect(fieldSum(d)).toBe(14)
    expect(d.users[0].subframes[0].mpdu.subtypeName).toBe('UWB Blink')
    expect(fields(blink).map((x) => x.key))
      .toEqual(['fc', 'seqNo', 'dstPan', 'dstAddr16', 'srcAddr16', 'ieBlink', 'fcs'])
    expect(keyed(blink, 'ieBlink')!.bytes).toBe(BLINK_IE_BYTES)
    expect(keyed(blink, 'ieBlink')!.value).toBe('blink · block 3 · round 7')
    // The shortest frame the simulator puts on the air, and the cheapest position there is.
    expect(blink.bytes).toBeLessThan(uwbRespBytes('ds') + 1)
    expect(ppduLayout(blink).reduce((s, p) => s + p.durNs, 0)).toBe(blink.txTimeNs)
  })

  it('decodes the three DL-TDoA messages: ranging times at 4 octets each, IE headers counted', () => {
    const dlPoll = makePoll('anc-0', ['anc-1', 'anc-2', 'anc-3'], 'ds', 0, 0, 'time', 8, 3, {
      txCounter: 1_000_000, rxCounters: {},
    })
    const dlResp = makeResp('anc-1', '*', 'ds', 0, 0, 1, undefined, {
      // a fraction, as the engine stores it: 1.5 ppm
      txCounter: 1_200_000, rxCounters: { 'anc-0': 1_100_000 }, coffs: 1.5e-6,
    })
    const dlFinal = makeFinal('anc-0', [], 0, 0, 4, {
      txCounter: 1_900_000,
      rxCounters: { 'anc-1': 1_300_000, 'anc-2': 1_500_000, 'anc-3': 1_700_000 },
    })
    // Poll: the time-scheduled Poll over 3 responders (36) + the TX-time IE (2 + 4).
    expect(dlPoll.bytes).toBe(uwbDlPollBytes(3))
    expect(dlPoll.bytes).toBe(42)
    // Response: the DS Response (14) + TX time (6) + one RX time (2 + 4) + clock offset (2 + 2).
    expect(dlResp.bytes).toBe(uwbDlRespBytes())
    expect(dlResp.bytes).toBe(30)
    // Final: MHR 9 + RRMC 3 + FCS 2 + TX time 6 + three RX times (2 + 12). It carries no
    // two-way times at all, so it does not grow the way the DS-TWR Final does.
    expect(dlFinal.bytes).toBe(uwbDlFinalBytes(3))
    expect(dlFinal.bytes).toBe(34)
    expect(dlFinal.bytes).toBeLessThan(FINAL.bytes)

    for (const f of [dlPoll, dlResp, dlFinal]) {
      const d = uwbFrameFields(f)
      expect(fieldSum(d), `${f.kind} ${f.bytes} B`).toBe(f.bytes)
      expect(ppduLayout(f).reduce((s, p) => s + p.durNs, 0), f.kind).toBe(f.txTimeNs)
    }
    expect(fields(dlPoll).filter((x) => x.key.startsWith('ie')).map((x) => x.key))
      .toEqual(['ieArc', 'ieRdm', 'ieRrmc', 'ieTxTime'])
    expect(fields(dlResp).filter((x) => x.key.startsWith('ie')).map((x) => x.key))
      .toEqual(['ieRrmc', 'ieTxTime', 'ieRxTimes', 'ieCoffs'])
    expect(fields(dlFinal).filter((x) => x.key.startsWith('ie')).map((x) => x.key))
      .toEqual(['ieRrmc', 'ieTxTime', 'ieRxTimes'])
    expect(keyed(dlPoll, 'ieTxTime')!.bytes).toBe(DL_TX_TIME_IE_BYTES)
    expect(keyed(dlResp, 'ieRxTimes')!.bytes).toBe(dlRxTimesIeBytes(1))
    expect(keyed(dlResp, 'ieCoffs')!.bytes).toBe(DL_COFFS_IE_BYTES)
    expect(keyed(dlFinal, 'ieRxTimes')!.bytes).toBe(dlRxTimesIeBytes(3))
    // Four octets per ranging time, exactly as an RRTI IE sizes one.
    expect(dlRxTimesIeBytes(3) - dlRxTimesIeBytes(2)).toBe(4)
    expect(keyed(dlResp, 'ieCoffs')!.value).toBe('clock offset 1.50 ppm to anchor 0')
    expect(keyed(dlFinal, 'ieRxTimes')!.value).toContain('3 RX times: anc-1 1 300 000')

    // One definition per frame: the builders size at the same phy.ts functions the schema's
    // slot-fit rule measures, content for content — a message that grew an RX time would grow in
    // both places or in neither.
    expect(dlPoll.bytes).toBe(uwbDlPollBytes(3, 0, false))
    expect(dlResp.bytes).toBe(uwbDlRespBytes(1, true))
    expect(dlFinal.bytes).toBe(uwbDlFinalBytes(3, false))
    const pollWithRx = makePoll('anc-0', ['anc-1', 'anc-2', 'anc-3'], 'ds', 0, 0, 'time', 8, 3, {
      txCounter: 1_000_000, rxCounters: { 'anc-1': 999_000 }, coffs: 0.25e-6,
    })
    expect(pollWithRx.bytes).toBe(uwbDlPollBytes(3, 1, true))
    expect(pollWithRx.bytes).toBe(dlPoll.bytes + dlRxTimesIeBytes(1) + DL_COFFS_IE_BYTES)
    expect(fieldSum(uwbFrameFields(pollWithRx))).toBe(pollWithRx.bytes)
    const respNoCoffs = makeResp('anc-1', '*', 'ds', 0, 0, 1, undefined, {
      txCounter: 1_200_000, rxCounters: { 'anc-0': 1_100_000 },
    })
    expect(respNoCoffs.bytes).toBe(uwbDlRespBytes(1, false))
    expect(fieldSum(uwbFrameFields(respNoCoffs))).toBe(respNoCoffs.bytes)
  })

  it('decodes a contention Poll: ARC + RCPS + RCMA + RRMC summing to 31 octets', () => {
    const cPoll = makePoll('tag', ['a1', 'a2'], 'ss', 0, 0, 'contention', 8, 3)
    expect(cPoll.bytes).toBe(31)
    const d = uwbFrameFields(cPoll)
    expect(fieldSum(d)).toBe(31)
    expect(fields(cPoll).filter((x) => x.key.startsWith('ie')).map((x) => x.key))
      .toEqual(['ieArc', 'ieRcps', 'ieRcma', 'ieRrmc'])
    expect(keyed(cPoll, 'ieRcps')!.bytes).toBe(RCPS_IE_BYTES)
    expect(keyed(cPoll, 'ieRcma')!.bytes).toBe(RCMA_IE_BYTES)
    expect(keyed(cPoll, 'ieRcps')!.value).toBe('response phase slots 1…8')
    expect(keyed(cPoll, 'ieRcma')!.value).toBe('max attempts 3')
  })
})

describe('uwbPpduLayout', () => {
  const SYNC = chipsToNs(SYNC_SYMBOLS * PSYM_CHIPS)
  const SFD = chipsToNs(SFD_SYMBOLS * PSYM_CHIPS)
  const GAP = chipsToNs(STS_GAP_CHIPS)
  const STS = chipsToNs(STS_ACTIVE_CHIPS)
  const PHR = chipsToNs(PHR_SYMBOLS * PHR_SYMBOL_CHIPS)

  it('uses the SP1 chip constants for the five segments before the PSDU', () => {
    expect([SYNC, SFD, GAP, STS, PHR]).toEqual([65_128, 8_141, 1_026, 65_641, 19_487])
    expect(uwbPpduLayout(POLL).map((s) => s.key)).toEqual(['sync', 'sfd', 'stsGap', 'sts', 'stsGap', 'phr', 'psdu'])
    expect(uwbPpduLayout(POLL).slice(0, 6).map((s) => s.durNs)).toEqual([SYNC, SFD, GAP, STS, GAP, PHR])
  })

  it('gives the PSDU the rest of the airtime, so the segments sum to txTimeNs', () => {
    for (const f of ALL) {
      const segs = uwbPpduLayout(f)
      expect(segs.reduce((s, p) => s + p.durNs, 0), f.kind).toBe(f.txTimeNs)
      expect(segs[segs.length - 1].key).toBe('psdu')
    }
  })

  it('the 62-octet Final spends 236 603 ns, all but the SHR, STS and PHR of it on the PSDU', () => {
    expect(FINAL.bytes).toBe(62)
    expect(FINAL.txTimeNs).toBe(236_603)
    const psdu = uwbPpduLayout(FINAL).find((s) => s.key === 'psdu')!
    // SHR 73 269 + STS (2 × 1 026 + 65 641) + PHR 19 487; each segment rounds to the nearest ns on its own.
    expect(psdu.durNs).toBe(236_603 - 73_269 - 67_693 - 19_487)
  })

  it('marks where the RMARKER falls: the first chip after the SFD', () => {
    const seg = uwbPpduLayout(POLL).find((s) => s.rmarkerNs !== undefined)!
    expect(seg.key).toBe('stsGap')
    expect(seg.rmarkerNs).toBe(SYNC + SFD)
  })

  it('is what ppduLayout returns for a UWB frame', () => {
    for (const f of ALL) expect(ppduLayout(f)).toEqual(uwbPpduLayout(f))
  })
})
