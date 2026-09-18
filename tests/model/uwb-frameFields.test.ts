import { describe, it, expect } from 'vitest'
import { decodeFrame, ppduLayout, type DecodedFrame } from '../../src/model/frameFields'
import type { FrameDesc } from '../../src/model/frames'
import { uwbFrameFields, uwbPpduLayout } from '../../src/uwb/frameFields'
import { makeFinal, makePoll, makeReport, makeResp } from '../../src/uwb/frames'
import { chipsToNs, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, SFD_SYMBOLS, STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS } from '../../src/uwb/phy'

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
    expect(fields(FINAL).filter((x) => x.key.startsWith('ie')).map((x) => x.key)).toEqual(['ieRmi', 'ieRrti'])
    expect(fields(REPORT).filter((x) => x.key.startsWith('ie')).map((x) => x.key)).toEqual(['ieRmi'])
  })

  it('spells the IE contents out in words', () => {
    expect(keyed(RESP, 'ieRrti')!.value).toBe('reply time 127 803 RCTU = 2.000 µs')
    expect(keyed(POLL, 'ieRdm')!.value).toBe('4 devices: a1 slot 1, a2 slot 2, a3 slot 3, a4 slot 4')
    expect(keyed(REPORT, 'ieRmi')!.value).toContain('treply1')
    expect(keyed(FINAL, 'ieRmi')!.value).toContain('a1')
  })

  it('is what decodeFrame returns for a UWB frame', () => {
    for (const f of ALL) expect(decodeFrame(f, { apId: '', isEdca: false })).toEqual(uwbFrameFields(f))
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

  it('the 60-octet Final spends 234 551 ns, all but the SHR, STS and PHR of it on the PSDU', () => {
    expect(FINAL.bytes).toBe(60)
    expect(FINAL.txTimeNs).toBe(234_551)
    const psdu = uwbPpduLayout(FINAL).find((s) => s.key === 'psdu')!
    // SHR 73 269 + STS (2 × 1 026 + 65 641) + PHR 19 487; each segment rounds to the nearest ns on its own.
    expect(psdu.durNs).toBe(234_551 - 73_269 - 67_693 - 19_487)
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
