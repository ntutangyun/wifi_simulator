import { describe, it, expect } from 'vitest'
import {
  AMP_ACK_BYTES, AMP_SIFS_NS, ampAckFrame, ampDlPpduNs, ampId16, ampRespBytes, ampRespFrame, ampTriggerBytes, ampTriggerFrame, ampUlPpduNs, ampUlSensDbm,
} from '../../src/engine/amp'
import { noiseDbm } from '../../src/engine/phy'

describe('AMP PHY airtimes (SFD 11-24/1613r20, PDT 11-26/1519r5)', () => {
  it('AMP SIFS is 10 µs (PM-96)', () => expect(AMP_SIFS_NS).toBe(10_000))
  it('frame sizes', () => {
    expect(ampTriggerBytes(0)).toBe(13)
    expect(ampTriggerBytes(3)).toBe(19)
    expect(AMP_ACK_BYTES).toBe(4)
    expect(ampRespBytes(false)).toBe(7)
    expect(ampRespBytes(true)).toBe(15)
  })
  it('DL PPDU: 32 + 80 + SIG + data + 20 padding + 6 extension', () => {
    expect(ampDlPpduNs(250, 13, 6_000)).toBe(618_000)
    expect(ampDlPpduNs(1000, 13, 6_000)).toBe(258_000)
    expect(ampDlPpduNs(250, 4, 6_000)).toBe(330_000)
    expect(ampDlPpduNs(1000, 4, 6_000)).toBe(186_000)
    expect(ampDlPpduNs(250, 13, 0)).toBe(612_000)
  })
  it('UL PPDU: 48 sync chips + data, no preamble', () => {
    expect(ampUlPpduNs(250, 7)).toBe(272_000)
    expect(ampUlPpduNs(250, 15)).toBe(528_000)
    expect(ampUlPpduNs(1000, 7)).toBe(68_000)
    expect(ampUlPpduNs(1000, 15)).toBe(132_000)
    expect(ampUlPpduNs(4000, 7)).toBe(20_000)
    expect(ampUlPpduNs(4000, 15)).toBe(36_000)
  })
  it('AP sensitivity for UL OOK = noise in the OOK bandwidth + required SINR (model)', () => {
    expect(Math.round(ampUlSensDbm(250))).toBe(Math.round(noiseDbm(2) + 10))
    expect(Math.round(ampUlSensDbm(1000))).toBe(Math.round(noiseDbm(4) + 12))
    expect(Math.round(ampUlSensDbm(4000))).toBe(Math.round(noiseDbm(8) + 15))
    expect(ampUlSensDbm(250)).toBeCloseTo(-94, 0)
    expect(ampUlSensDbm(1000)).toBeCloseTo(-89, 0)
    expect(ampUlSensDbm(4000)).toBeCloseTo(-83, 0)
  })
  it('frame builders fill the FrameDesc consistently', () => {
    const tr = ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 1_000_000, signalExtNs: 6_000 })
    expect(tr).toMatchObject({ kind: 'ampTrigger', src: 'ap', dst: '*amp', bytes: 13, mbps: 0.25, txTimeNs: 618_000, durationFieldNs: 0 })
    expect(tr.amp).toMatchObject({ dir: 'dl', kbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, padNs: 20_000 })
    expect(tr.amp).toMatchObject({ ulKbps: 250 })
    const ack = ampAckFrame('ap', 'tag-1', 250, 2, 6_000)
    expect(ack).toMatchObject({ kind: 'ampAck', dst: 'tag-1', bytes: 4, txTimeNs: 330_000 })
    expect(ack.amp).toMatchObject({ dir: 'dl', ackFor: 2 })
    const resp = ampRespFrame('tag-1', 'ap', 250, 3, 2, true)
    expect(resp).toMatchObject({ kind: 'ampResp', src: 'tag-1', dst: 'ap', bytes: 15, mbps: 0.25, txTimeNs: 528_000 })
    expect(resp.amp).toMatchObject({ dir: 'ul', slot: 3, aboc: 2, reading: true })
  })
  it('16-bit ids are stable, non-zero and never the broadcast value', () => {
    expect(ampId16('tag-1')).toBe(ampId16('tag-1'))
    expect(ampId16('tag-1')).not.toBe(ampId16('tag-2'))
    for (const id of ['a', 'tag-1', 'tag-2', 'sensor-9']) {
      const v = ampId16(id)
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(0xffff)
    }
  })
})
