/**
 * The P802.15.4ab frame builders: what a fragment and a narrowband control message weigh, how
 * long they hold the air, and which of the two radios they belong to.
 *
 * Every expected number is derived from `mms.ts` / `nb.ts` rather than written out twice, so a
 * retune of the PHY moves the test with the model; the values in the comments are what those
 * functions produce today.
 */
import { describe, expect, it } from 'vitest'
import {
  isMmsFragment, isNbFrame, makeNbPoll, makeNbReport, makeNbResp, makeRif, makeRsf, NB_MBPS,
} from '../../src/uwb/frames'
import { MMS_DRAFT_DEFAULTS, mmsFragmentDbm, rifNs, rsfNs, type MmsPhy } from '../../src/uwb/mms'
import { NB_MSG_ID, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES, nbCenterMhz, nbPpduNs } from '../../src/uwb/nb'

/** The draft's own ranging-cycle default train. 4ab draft 15-22/0381r5 Table 1.2.3.3 */
const PHY: MmsPhy = { rsfs: 8, rifs: 2, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS }

describe('MMS fragment frames', () => {
  it('carries no octets, no rate, its own airtime and its own burst power', () => {
    const rsf = makeRsf('t', 'a', 3, PHY, 1, 0, 10)
    expect(rsf.kind).toBe('uwbRsf')
    expect(isMmsFragment(rsf.kind)).toBe(true)
    // A fragment is a raw sequence, not a PSDU: the timeline must show air, never bytes ÷ rate.
    expect(rsf.bytes).toBe(0)
    expect(rsf.mbps).toBe(0)
    expect(rsf.durationFieldNs).toBe(0)
    // 40 × 4 × (128 + 2·64) = 40 960 chips at 499.2 Mchip/s
    expect(rsf.txTimeNs).toBe(rsfNs(PHY.nMsr, PHY.gap))
    expect(rsf.txTimeNs / 1000).toBeCloseTo(82.05, 2)
    // 37 nJ spent inside 82.05 µs
    expect(rsf.uwb?.mms?.txDbm).toBe(mmsFragmentDbm(rsf.txTimeNs))
    expect(rsf.uwb?.mms?.txDbm).toBeCloseTo(-3.46, 2)
    expect(rsf.uwb?.mms).toMatchObject({ kind: 'rsf', index: 3, of: PHY.rsfs, nMsr: 40, gap: 64 })
    expect(rsf.uwb?.mms?.stsLen).toBeUndefined()
    expect(rsf.uwb).toMatchObject({ sp: 1, method: 'ss', block: 1, round: 0, slot: 10, ies: [] })
    expect(rsf.src).toBe('t')
    expect(rsf.dst).toBe('a')
  })

  it('sizes an RIF from its STS segment, and a shorter fragment is a louder one', () => {
    const rif = makeRif('a', 't', 1, PHY, 1, 0, 26)
    expect(rif.kind).toBe('uwbRif')
    expect(rif.bytes).toBe(0)
    expect(rif.mbps).toBe(0)
    // 64 × 512 = 32 768 chips
    expect(rif.txTimeNs).toBe(rifNs(PHY.stsLen))
    expect(rif.txTimeNs / 1000).toBeCloseTo(65.64, 2)
    expect(rif.uwb?.mms).toMatchObject({ kind: 'rif', index: 1, of: PHY.rifs, stsLen: 64 })
    expect(rif.uwb?.mms?.nMsr).toBeUndefined()
    // the same 37 nJ in a shorter burst: 0.97 dB louder than the RSF above
    expect(rif.uwb?.mms?.txDbm).toBeCloseTo(-2.49, 2)
    expect(rif.uwb!.mms!.txDbm).toBeGreaterThan(makeRsf('t', 'a', 0, PHY, 1, 0, 10).uwb!.mms!.txDbm)
  })
})

describe('narrowband control frames', () => {
  it('sizes the three compressed PSDUs and times them at 250 kb/s', () => {
    const poll = makeNbPoll('t', 'a', 200, 4, 1)
    const resp = makeNbResp('a', 't', 200, 4, 1)
    const report = makeNbReport('a', 't', 200, 4, 1, 26, { replyRctu: 1234 })

    expect([poll.kind, resp.kind, report.kind]).toEqual(['nbPoll', 'nbResp', 'nbReport'])
    expect([poll.kind, resp.kind, report.kind].every(isNbFrame)).toBe(true)

    expect(poll.bytes).toBe(NB_POLL_BYTES)
    expect(resp.bytes).toBe(NB_RESP_BYTES)
    expect(report.bytes).toBe(NB_REPORT_BYTES)
    for (const f of [poll, resp, report]) expect(f.mbps).toBe(NB_MBPS)

    // (10 SHR + 2 PHR + 2 per octet) × 16 µs: 576 µs for 12 octets, 608 µs for 13
    expect(poll.txTimeNs).toBe(nbPpduNs(NB_POLL_BYTES))
    expect(poll.txTimeNs).toBe(576_000)
    expect(resp.txTimeNs).toBe(576_000)
    expect(report.txTimeNs).toBe(608_000)
  })

  it('carries the channel, its centre, the message id and whichever time the message holds', () => {
    // channel 200: 5926.25 + 2.5 × 150 = 6301.25 MHz, inside the 6 GHz Wi-Fi band
    expect(nbCenterMhz(200)).toBeCloseTo(6301.25, 6)

    const poll = makeNbPoll('t', 'a', 200, 4, 1)
    expect(poll.uwb?.nb).toEqual({ channel: 200, centerMhz: nbCenterMhz(200), msgId: NB_MSG_ID.poll })
    expect(poll.uwb).toMatchObject({ sp: 1, method: 'ss', block: 4, round: 1, slot: 0, ies: [] })

    const resp = makeNbResp('a', 't', 3, 4, 1)
    expect(resp.uwb?.nb).toEqual({ channel: 3, centerMhz: nbCenterMhz(3), msgId: NB_MSG_ID.resp })
    // the RESP answers in the third control slot
    expect(resp.uwb?.slot).toBe(2)

    // the responder's REPORT carries its ReplyTime; the initiator's its TurnAroundTime, and the
    // message-id octet follows from which one is there
    const fromResponder = makeNbReport('a', 't', 3, 4, 1, 26, { replyRctu: 1234 })
    expect(fromResponder.uwb?.nb).toEqual({
      channel: 3, centerMhz: nbCenterMhz(3), msgId: NB_MSG_ID.reportResponder, replyRctu: 1234,
    })
    const fromInitiator = makeNbReport('t', 'a', 3, 4, 1, 28, { roundTripRctu: 9876 })
    expect(fromInitiator.uwb?.nb).toEqual({
      channel: 3, centerMhz: nbCenterMhz(3), msgId: NB_MSG_ID.reportInitiator, roundTripRctu: 9876,
    })
    // absent, not undefined, so a REPORT compares equal to a hand-built one
    expect('roundTripRctu' in fromResponder.uwb!.nb!).toBe(false)
    expect('replyRctu' in fromInitiator.uwb!.nb!).toBe(false)
    expect(fromInitiator.uwb?.slot).toBe(28)
  })
})

describe('the kind predicates', () => {
  it('separate the two 4ab radios from the 4z frames', () => {
    // They take the whole FrameKind union, so a caller holding a FrameDesc.kind needs no cast.
    expect((['nbPoll', 'nbResp', 'nbReport'] as const).every(isNbFrame)).toBe(true)
    expect((['uwbRsf', 'uwbRif'] as const).every(isMmsFragment)).toBe(true)
    for (const k of ['uwbPoll', 'uwbResp', 'uwbFinal', 'uwbReport', 'uwbBlink'] as const) {
      expect(isNbFrame(k)).toBe(false)
      expect(isMmsFragment(k)).toBe(false)
    }
    expect(isMmsFragment('nbPoll')).toBe(false)
    expect(isNbFrame('uwbRsf')).toBe(false)
    // and a Wi-Fi frame is neither, which is the reason the parameter is FrameKind
    for (const k of ['data', 'ack', 'trigger', 'ampResp'] as const) {
      expect(isNbFrame(k)).toBe(false)
      expect(isMmsFragment(k)).toBe(false)
    }
  })

  it('refuses a REPORT that carries neither time', () => {
    expect(() => makeNbReport('a', 't', 3, 4, 1, 26, {})).toThrow(/neither a reply nor a round-trip time/)
    // the two well-formed shapes still build
    expect(makeNbReport('a', 't', 3, 4, 1, 26, { replyRctu: 1 }).kind).toBe('nbReport')
    expect(makeNbReport('t', 'a', 3, 4, 1, 28, { roundTripRctu: 1 }).kind).toBe('nbReport')
  })
})
