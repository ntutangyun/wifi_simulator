import { describe, it, expect } from 'vitest'
import { recordsToSpans, topSpanAt, xForT, type LaneSpan } from '../../src/ui/laneLayout'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import type { FrameDesc } from '../../src/model/frames'

const frame: FrameDesc = {
  kind: 'data', src: 'sta-1', dst: 'ap', bytes: 1428, mbps: 54, durationFieldNs: 60_000, txTimeNs: 232_000,
}

function recs(rs: Parameters<EmitFn>[0][]): TLRecord[] {
  const out: TLRecord[] = []
  const emit = makeEmitter((r) => out.push(r))
  rs.forEach(emit)
  return out
}

describe('recordsToSpans', () => {
  it('folds TX pairs and MAC states into spans', () => {
    const spans = recordsToSpans(recs([
      { t: 100, type: 'MAC_STATE', node: 'sta-1', state: 'backoff' },
      { t: 500, type: 'MAC_STATE', node: 'sta-1', state: 'tx' },
      { t: 500, type: 'TX_START', node: 'sta-1', frame },
      { t: 732, type: 'TX_END', node: 'sta-1', frame },
    ]), ['sta-1'], 0, 1000)
    expect(spans).toContainEqual(expect.objectContaining({ kind: 'backoff', startNs: 100, endNs: 500 }))
    expect(spans).toContainEqual(expect.objectContaining({ kind: 'tx', frameKind: 'data', startNs: 500, endNs: 732 }))
  })

  it('clips to the window and extends open spans to b', () => {
    const spans = recordsToSpans(recs([
      { t: 100, type: 'MAC_STATE', node: 'sta-1', state: 'defer' },
    ]), ['sta-1'], 200, 1000)
    expect(spans).toEqual([expect.objectContaining({ kind: 'defer', startNs: 200, endNs: 1000 })])
  })

  it('tracks NAV as an independent overlay span', () => {
    const spans = recordsToSpans(recs([
      { t: 100, type: 'NAV_SET', node: 'sta-2', untilNs: 800, source: 'data:sta-1' },
      { t: 800, type: 'NAV_CLEAR', node: 'sta-2' },
    ]), ['sta-2'], 0, 1000)
    expect(spans).toEqual([expect.objectContaining({ kind: 'nav', startNs: 100, endNs: 800 })])
  })

  it('xForT is linear in the window', () => {
    expect(xForT(50, 0, 100, 200)).toBe(100)
    expect(xForT(0, 0, 100, 200)).toBe(0)
    expect(xForT(100, 0, 100, 200)).toBe(200)
  })
})

describe('topSpanAt', () => {
  const spans: LaneSpan[] = [
    { nodeId: 'sta-1', kind: 'backoff', startNs: 0, endNs: 1000 },
    { nodeId: 'sta-1', kind: 'tx', frameKind: 'data', frame, startNs: 200, endNs: 400 },
    { nodeId: 'sta-2', kind: 'nav', startNs: 200, endNs: 400 },
    { nodeId: 'sta-2', kind: 'rx', frameKind: 'data', frame, startNs: 200, endNs: 400 },
  ]

  it('prefers tx over an underlying state span', () => {
    expect(topSpanAt(spans, 'sta-1', 300)?.kind).toBe('tx')
  })

  it('falls back to the state span outside the tx interval', () => {
    expect(topSpanAt(spans, 'sta-1', 100)?.kind).toBe('backoff')
  })

  it('prefers rx over the nav overlay', () => {
    expect(topSpanAt(spans, 'sta-2', 300)?.kind).toBe('rx')
  })

  it('returns null off-lane or outside every span', () => {
    expect(topSpanAt(spans, 'sta-2', 100)).toBeNull()
    expect(topSpanAt(spans, 'nope', 300)).toBeNull()
  })
})
