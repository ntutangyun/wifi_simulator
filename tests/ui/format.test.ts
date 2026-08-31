import { describe, it, expect } from 'vitest'
import { decodeFrame, fmtNs, fmtRecord } from '../../src/ui/format'
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
