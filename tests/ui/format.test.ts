import { describe, it, expect } from 'vitest'
import { decodeFrame, fmtLatency, fmtNs, fmtRecord } from '../../src/ui/format'
import type { FrameDesc } from '../../src/model/frames'

describe('fmtNs', () => {
  it('formats grouped nanosecond times', () => {
    expect(fmtNs(0)).toBe('0.000 000 000')
    expect(fmtNs(1234)).toBe('0.000 001 234')
    expect(fmtNs(1_234_567)).toBe('0.001 234 567')
    expect(fmtNs(12_345_678_901)).toBe('12.345 678 901')
  })
})

const frame: FrameDesc = {
  kind: 'data', src: 'ap', dst: 'sta-1', bytes: 1428, mbps: 54,
  durationFieldNs: 60_000, txTimeNs: 232_000, seqNo: 42, retryFlag: true, msduId: 7,
}

describe('fmtRecord', () => {
  it('renders TX_START with rate, airtime and retry flag', () => {
    const s = fmtRecord({ t: 0, seq: 0, type: 'TX_START', node: 'ap', frame })
    expect(s).toContain('ap → sta-1 DATA 1428 B @54 Mbps')
    expect(s).toContain('RETRY')
  })
  it('renders backoff and NAV records', () => {
    expect(fmtRecord({ t: 0, seq: 0, type: 'BACKOFF_DEC', node: 'sta-2', value: 6 })).toBe('sta-2 backoff → 6')
    expect(fmtRecord({ t: 0, seq: 0, type: 'NAV_SET', node: 'sta-2', untilNs: 293_000, source: 'data:sta-1' }))
      .toContain('NAV set until 0.000 293 000')
  })

  it('formats the four AMP records', () => {
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ROUND', node: 'ap#2g', phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250, untilNs: 3_000_000 })).toBe('ap#2g AMP round (random): 4 slots × 272.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_SLOT', node: 'ap#2g', slot: 2, untilNs: 1_000_000 })).toBe('ap#2g AMP slot 2 until 0.001 000 000')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 1, acw: 3, slot: 2 })).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 3, acw: 3, slot: null })).toBe('tag-1#2g ABOC 3 of [0, 3] → sits out')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: true })).toBe('tag-1#2g slot 2: acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: false })).toBe('tag-1#2g slot 2: not acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 3, sent: false, acked: false })).toBe('tag-1#2g slot 3: missed its cue')
  })
})

describe('decodeFrame', () => {
  it('lists MAC header fields', () => {
    const rows = decodeFrame(frame)
    const get = (f: string) => rows.find((r) => r.field === f)?.value
    expect(get('RA / Address 1')).toBe('sta-1')
    expect(get('Sequence number')).toBe('42')
    expect(get('Retry flag')).toBe('1')
    expect(get('TXTIME')).toBe('232.0 µs')
  })
})

describe('fmtLatency', () => {
  it('shows mean / max in ms, or a dash when nothing has been delivered', () => {
    expect(fmtLatency({ n: 0, sumNs: 0, maxNs: 0 })).toBe('—')
    expect(fmtLatency({ n: 2, sumNs: 1_000_000, maxNs: 700_000 })).toBe('0.50 / 0.70 ms')
    expect(fmtLatency({ n: 4, sumNs: 50_000_000, maxNs: 31_250_000 })).toBe('12.5 / 31.3 ms')
  })
})
