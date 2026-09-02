import { describe, it, expect } from 'vitest'
import { ifsAt, recordsToSpans, spanTooltip, topSpanAt, xForT, type LaneSpan } from '../../src/ui/laneLayout'
import { STRINGS } from '../../src/ui/i18n'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import { initViewState } from '../../src/model/view'
import { defaultScenario } from '../../src/model/scenario'
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

  it('keeps unclipped times so tooltips report the true duration', () => {
    const spans = recordsToSpans(recs([
      { t: 100_000, type: 'MAC_STATE', node: 'sta-1', state: 'defer' },
      { t: 500_000, type: 'MAC_STATE', node: 'sta-1', state: 'backoff' },
    ]), ['sta-1'], 200_000, 1_000_000)
    const defer = spans.find((s) => s.kind === 'defer')!
    expect(defer.startNs).toBe(200_000) // drawn from the window edge…
    expect(defer.fullStartNs).toBe(100_000) // …but the real span is known
    // tooltip duration = 500-100 = 400 µs, not the visible 300 µs
    expect(spanTooltip(defer, STRINGS.en.tooltips)[0]).toContain('400.0 µs')
  })

  it('keeps every IFS in a defer block and labels the one under the cursor', () => {
    // Lesson 6, sta-2: it fails to decode sta-1's frame (EIFS at 1425), then
    // receives the AP's ACK correctly, which truncates the EIFS into a plain
    // DIFS at 1469 (§10.3.2.3.7). One defer block, two different answers.
    const spans = recordsToSpans(recs([
      { t: 1_177_000, type: 'MAC_STATE', node: 'sta-2', state: 'defer' },
      { t: 1_425_000, type: 'IFS_START', node: 'sta-2', kind: 'EIFS', untilNs: 1_519_000 },
      { t: 1_469_000, type: 'IFS_START', node: 'sta-2', kind: 'DIFS', untilNs: 1_503_000 },
      { t: 1_503_000, type: 'MAC_STATE', node: 'sta-2', state: 'backoff' },
    ]), ['sta-2'], 0, 2_000_000)
    const defer = spans.find((s) => s.kind === 'defer')!
    expect(defer.ifs.map((x) => x.kind)).toEqual(['EIFS', 'DIFS'])
    expect(ifsAt(defer, 1_200_000)).toBeNull() // before either IFS is armed
    expect(ifsAt(defer, 1_426_000)?.kind).toBe('EIFS')
    expect(ifsAt(defer, 1_480_000)?.kind).toBe('DIFS')
    // …and the tooltip must agree with the 3D view at each instant.
    expect(spanTooltip(defer, STRINGS.en.tooltips, 1_426_000)[0]).toContain('EIFS')
    expect(spanTooltip(defer, STRINGS.en.tooltips, 1_480_000)[0]).toContain('DIFS')
    expect(spanTooltip(defer, STRINGS.en.tooltips, 1_426_000)).toContainEqual(
      expect.stringContaining('EIFS → DIFS'),
    )
  })

  it('captures the IFS that opens a block, emitted just before the state record', () => {
    // idle→defer emits IFS_START first, so it arrives with no span open yet.
    const spans = recordsToSpans(recs([
      { t: 1_089_000, type: 'MAC_STATE', node: 'sta-2', state: 'idle' },
      { t: 1_089_000, type: 'IFS_START', node: 'sta-2', kind: 'DIFS', untilNs: 1_123_000 },
      { t: 1_089_000, type: 'MAC_STATE', node: 'sta-2', state: 'defer' },
      { t: 1_123_000, type: 'MAC_STATE', node: 'sta-2', state: 'backoff' },
    ]), ['sta-2'], 0, 2_000_000)
    const defer = spans.find((s) => s.kind === 'defer')!
    expect(defer.ifs.map((x) => x.kind)).toEqual(['DIFS'])
    expect(spanTooltip(defer, STRINGS.en.tooltips, 1_100_000)[0]).toContain('DIFS')
  })

  it('reports the true duration when a span crosses the right window edge', () => {
    const spans = recordsToSpans(recs([
      { t: 100_000, type: 'MAC_STATE', node: 'sta-1', state: 'defer' },
      { t: 500_000, type: 'MAC_STATE', node: 'sta-1', state: 'backoff' },
    ]), ['sta-1'], 0, 300_000, 600_000) // closing record beyond b but within the horizon
    const defer = spans.find((s) => s.kind === 'defer')!
    expect(defer.endNs).toBe(300_000) // drawn to the window edge…
    expect(defer.fullEndNs).toBe(500_000) // …but the real end is known
    expect(defer.openEnded).toBe(false)
    expect(spanTooltip(defer, STRINGS.en.tooltips)[0]).toContain('400.0 µs')
  })

  it('seeds spans whose opening record predates the fetched records', () => {
    // A state that has run for longer than the fetch margin has no opening
    // record in view — the seed snapshot at the fetch start supplies it.
    const view = initViewState(defaultScenario())
    view.nodes['sta-1'].state = 'defer'
    const spans = recordsToSpans(recs([
      { t: 900_000, type: 'MAC_STATE', node: 'sta-1', state: 'backoff' },
    ]), ['sta-1'], 800_000, 1_000_000, 1_000_000, { view, t: 700_000 })
    const defer = spans.find((s) => s.kind === 'defer')!
    expect(defer.startNs).toBe(800_000)
    expect(defer.fullStartNs).toBe(700_000)
    expect(defer.fullEndNs).toBe(900_000)
    expect(defer.openStart).toBe(true) // real start unknown — only "at least"
    expect(spanTooltip(defer, STRINGS.en.tooltips)[0]).toContain('≥')
  })

  it('marks spans still open at the horizon as in progress', () => {
    const spans = recordsToSpans(recs([
      { t: 100_000, type: 'MAC_STATE', node: 'sta-1', state: 'defer' },
    ]), ['sta-1'], 0, 300_000, 600_000)
    const defer = spans.find((s) => s.kind === 'defer')!
    expect(defer.openEnded).toBe(true)
    expect(spanTooltip(defer, STRINGS.en.tooltips)[0]).toContain('≥')
  })

  it('drops the span-wide AC tag when several ACs shared the block', () => {
    const spans = recordsToSpans(recs([
      { t: 0, type: 'MAC_STATE', node: 'sta-1', state: 'defer' },
      { t: 0, type: 'IFS_START', node: 'sta-1', kind: 'AIFS', untilNs: 43_000, ac: 3 },
      { t: 10_000, type: 'IFS_START', node: 'sta-1', kind: 'AIFS', untilNs: 79_000, ac: 1 },
      { t: 79_000, type: 'MAC_STATE', node: 'sta-1', state: 'backoff' },
    ]), ['sta-1'], 0, 100_000)
    const defer = spans.find((s) => s.kind === 'defer')!
    expect(defer.ac).toBeUndefined() // no single AC owns this block
    // …but each instant still knows its own AC via the segment under the cursor.
    expect(spanTooltip(defer, STRINGS.en.tooltips, 5_000)[0]).toContain('AC_VO')
    expect(spanTooltip(defer, STRINGS.en.tooltips, 50_000)[0]).toContain('AC_BE')
  })

  it('tracks simultaneous receptions separately (UL OFDMA at the AP)', () => {
    const f1: FrameDesc = { ...frame, src: 'sta-1' }
    const f2: FrameDesc = { ...frame, src: 'sta-2' }
    const spans = recordsToSpans(recs([
      { t: 100, type: 'RX_START', node: 'ap', from: 'sta-1', frame: f1 },
      { t: 100, type: 'RX_START', node: 'ap', from: 'sta-2', frame: f2 },
      { t: 900, type: 'RX_OK', node: 'ap', from: 'sta-1', frame: f1 },
      { t: 900, type: 'RX_OK', node: 'ap', from: 'sta-2', frame: f2 },
    ]), ['ap'], 0, 1000)
    const rx = spans.filter((s) => s.kind === 'rx')
    expect(rx.map((s) => s.frameSrc).sort()).toEqual(['sta-1', 'sta-2'])
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
  const sp = (s: Omit<LaneSpan, 'fullStartNs' | 'fullEndNs' | 'ifs' | 'openStart' | 'openEnded'> & { ifs?: LaneSpan['ifs'] }): LaneSpan =>
    ({ ifs: [], openStart: false, openEnded: false, ...s, fullStartNs: s.startNs, fullEndNs: s.endNs })
  const spans: LaneSpan[] = [
    sp({ nodeId: 'sta-1', kind: 'backoff', startNs: 0, endNs: 1000 }),
    sp({ nodeId: 'sta-1', kind: 'tx', frameKind: 'data', frame, startNs: 200, endNs: 400 }),
    sp({ nodeId: 'sta-2', kind: 'nav', startNs: 200, endNs: 400 }),
    sp({ nodeId: 'sta-2', kind: 'rx', frameKind: 'data', frame, startNs: 200, endNs: 400 }),
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
