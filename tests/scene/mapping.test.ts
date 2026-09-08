import { describe, it, expect } from 'vitest'
import { flightProgress, frameColor } from '../../src/scene/effects'
import { haloColor, labelText, statusText, txopText } from '../../src/scene/nodes'
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
      navUntilNs: 0, ifs: null, queue: [], currentTx: null, currentRx: null, rxSeq: {},
      stats: {
        txOk: 0, txFail: 0, retries: 0, drops: 0, bytesDelivered: 0, airtimeNs: 0, collisions: 0,
        txLatency: { n: 0, sumNs: 0, maxNs: 0 }, rxLatency: { n: 0, sumNs: 0, maxNs: 0 },
        appRtt: { n: 0, sumNs: 0, maxNs: 0 },
      },
      acs: null, txopUntilNs: 0, txopAc: -1,
    }
    expect(statusText(base, 0)).toBe('bo:5')
    expect(statusText({ ...base, state: 'defer', backoff: null, ifs: { kind: 'DIFS', untilNs: 34_000 } }, 0)).toBe('DIFS 34µs')
    expect(statusText({ ...base, state: 'defer', backoff: null, navUntilNs: 90_000 }, 0)).toBe('NAV 90µs')
  })
})

describe('TXOP holder annotation', () => {
  const base = { state: 'waitAck', ccaBusy: false, backoff: null, cw: 15, ssrc: 0, slrc: 0, navUntilNs: 0, ifs: null,
    queue: [], currentTx: null, currentRx: null, rxSeq: {}, stats: { bytesDelivered: 0, txOk: 0, retries: 0, drops: 0, collisions: 0, airtimeNs: 0 },
    acs: null, txopUntilNs: 0, txopAc: -1 } as unknown as Parameters<typeof txopText>[0]

  it('names the AC and counts the TXOP down while it is held', () => {
    expect(txopText({ ...base, txopUntilNs: 2_500_000, txopAc: 2 }, 1_000_000)).toBe('TXOP VI 1500µs')
    expect(txopText({ ...base, txopUntilNs: 2_500_000, txopAc: 1 }, 2_499_400)).toBe('TXOP BE 1µs')
  })

  it('is empty once the TXOP has ended or was never held', () => {
    expect(txopText({ ...base, txopUntilNs: 2_500_000, txopAc: 2 }, 2_500_000)).toBe('')
    expect(txopText(base, 5)).toBe('')
  })

  it('the 3D label stacks the TXOP line under the state', () => {
    expect(labelText({ ...base, txopUntilNs: 2_500_000, txopAc: 2 }, 1_000_000)).toBe('wait ACK\nTXOP VI 1500µs')
    expect(labelText({ ...base, state: 'idle' }, 1_000_000)).toBe('')
  })
})

it('a TXOP with no state text still lands on line two', () => {
  const nv = { state: 'tx', ccaBusy: true, backoff: null, cw: 15, ssrc: 0, slrc: 0, navUntilNs: 0, ifs: null, queue: [], currentTx: null, currentRx: null,
    rxSeq: {}, stats: { bytesDelivered: 0, txOk: 0, retries: 0, drops: 0, collisions: 0, airtimeNs: 0 }, acs: null, txopUntilNs: 2_000_000, txopAc: 2 } as unknown as Parameters<typeof labelText>[0]
  expect(labelText(nv, 1_000_000)).toBe('\nTXOP VI 1000µs')
})

describe('appLine: the apps shown under a station’s name in the 3D view', () => {
  it('lists each stream with an icon in the chosen language; AP and idle stations show nothing', async () => {
    const { appLine } = await import('../../src/scene/nodes')
    const sta = { id: 's', kind: 'sta', name: 'P', pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15, profiles: ['gaming', 'video'], caps: { generation: 'he', features: {} } } as const
    expect(appLine({ ...sta, profiles: ['gaming', 'video'] }, 'en')).toBe('🎮 game · 📺 video')
    expect(appLine({ ...sta, profiles: ['gaming', 'video'] }, 'zh')).toBe('🎮 游戏 · 📺 视频')
    expect(appLine({ ...sta, profiles: ['idle'] }, 'en')).toBe('')
    expect(appLine({ ...sta, kind: 'ap', profiles: ['idle'] }, 'en')).toBe('')
  })
})
