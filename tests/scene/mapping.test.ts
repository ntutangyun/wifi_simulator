import { describe, it, expect } from 'vitest'
import { flightProgress, frameColor } from '../../src/scene/effects'
import { haloColor, statusText } from '../../src/scene/nodes'
import { wallSolidSpans } from '../../src/scene/house'
import type { FrameDesc } from '../../src/model/frames'
import type { NodeView } from '../../src/model/view'

const mkFrame = (kind: FrameDesc['kind'], src: string): FrameDesc => ({
  kind, src, dst: 'x', bytes: 100, mbps: 6, durationFieldNs: 0, txTimeNs: 100_000,
})

describe('scene mappings', () => {
  it('haloColor covers states with NAV override', () => {
    expect(haloColor('idle', false)).toBe(0x555555)
    expect(haloColor('backoff', false)).toBe(0xf59e0b)
    expect(haloColor('tx', false)).toBe(0x3b82f6)
    expect(haloColor('backoff', true)).toBe(0x9333ea) // NAV wins
    expect(haloColor('tx', true)).toBe(0x3b82f6) // …except while transmitting
  })

  it('frameColor by kind and direction', () => {
    expect(frameColor(mkFrame('data', 'ap'), 'ap')).toBe(0x3b82f6)
    expect(frameColor(mkFrame('data', 'sta-1'), 'ap')).toBe(0x22c55e)
    expect(frameColor(mkFrame('ack', 'ap'), 'ap')).toBe(0xffffff)
    expect(frameColor(mkFrame('rts', 'sta-1'), 'ap')).toBe(0xf97316)
  })

  it('flightProgress clamps to [0,1]', () => {
    const f = { from: 'a', frame: mkFrame('data', 'a'), startNs: 100, endNs: 200 }
    expect(flightProgress(50, f)).toBe(0)
    expect(flightProgress(150, f)).toBe(0.5)
    expect(flightProgress(500, f)).toBe(1)
  })

  it('wallSolidSpans splits around openings', () => {
    const spans = wallSolidSpans({ x1: 0, y1: 0, x2: 0, y2: 8, material: 'drywall', openings: [{ from: 3.5, to: 4.4 }] })
    expect(spans).toEqual([{ a: 0, b: 3.5 }, { a: 4.4, b: 8 }])
  })

  it('statusText prioritizes backoff then IFS then NAV', () => {
    const base: NodeView = {
      state: 'backoff', ccaBusy: false, backoff: 5, cw: 15, ssrc: 0, slrc: 0,
      navUntilNs: 0, ifs: null, queue: [], currentTx: null, currentRx: null,
      stats: { txOk: 0, txFail: 0, retries: 0, drops: 0, bytesDelivered: 0, airtimeNs: 0, collisions: 0 },
      acs: null, txopUntilNs: 0, txopAc: -1,
    }
    expect(statusText(base, 0)).toBe('bo:5')
    expect(statusText({ ...base, state: 'defer', backoff: null, ifs: { kind: 'DIFS', untilNs: 34_000 } }, 0)).toBe('DIFS 34µs')
    expect(statusText({ ...base, state: 'defer', backoff: null, navUntilNs: 90_000 }, 0)).toBe('NAV 90µs')
  })
})
