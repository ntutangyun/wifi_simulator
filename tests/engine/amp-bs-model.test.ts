/**
 * Slice A2 — mono-static backscatter in 2.4 GHz. Every number below is pinned by
 * docs/superpowers/specs/2026-09-21-amp-backscatter-energy-design.md; the lesson quotes the same
 * ones, so a retune of the model has to come through here first.
 */
import { describe, it, expect } from 'vitest'
import {
  AMP_BS_ACTIVATION_DBM, AMP_BS_BST_MIN_NS, AMP_BS_DL_KBPS, AMP_BS_ISOLATION_DB, AMP_BS_LOSS_DB,
  AMP_BS_READER_DR_DB, AMP_BS_REQ_SNR_DB, AMP_BS_UL_CHIP_NS, AMP_BS_WRITE_T3_NS, AMP_BS_WUP_MIN_NS,
  FREQ_24G_MHZ, GEN2_CMD_BYTES, GEN2_REPLY_BYTES, activationReachM, ampBsDlPpduNs, ampBsReplyFrame,
  ampRfidBytes, ampRfidFrame, bsDecodes, bsPathLossDb, bsReplyDbm, bsReplyNs, bstNs, crc16Epc, epcOf,
  freeSpacePl0Db, monoLeakDbm, monoReachM, readerFloorDbm,
} from '../../src/engine/ampBs'

const US = 1000

/** The reaches the spec and the lesson quote, to the centimetre they are quoted at (±1 mm). */
function expectReachM(got: number, wantM: number): void {
  expect(Math.abs(got - wantM), `${got.toFixed(4)} m, expected ${wantM} m`).toBeLessThan(0.001)
}

describe('the backscatter propagation law', () => {
  it('is free space at the 2.4 GHz mid-band carrier', () => {
    expect(FREQ_24G_MHZ).toBe(2440)
    expect(freeSpacePl0Db(2440)).toBeCloseTo(40.196, 3)
    // 915.5 MHz and 867.5 MHz are slice A5's carriers; the spec quotes them from the same law.
    expect(freeSpacePl0Db(915.5)).toBeCloseTo(31.68, 2)
    expect(freeSpacePl0Db(867.5)).toBeCloseTo(31.21, 2)
  })

  it('spreads at 20 dB a decade and adds the walls in the way', () => {
    expect(bsPathLossDb(2440, 1, 0)).toBeCloseTo(40.196, 3)
    expect(bsPathLossDb(2440, 0.1, 0)).toBeCloseTo(20.196, 3)
    expect(bsPathLossDb(2440, 0.1, 5)).toBeCloseTo(25.196, 3)
    // Under 5 cm the law is clamped: a tag on the antenna is loud, not infinite.
    expect(bsPathLossDb(2440, 0.01, 0)).toBeCloseTo(bsPathLossDb(2440, 0.05, 0), 9)
  })
})

describe('the reader model', () => {
  it('self-leakage and dynamic range put the floor 70 dB under the excitation', () => {
    expect(AMP_BS_ISOLATION_DB).toBe(20)
    expect(AMP_BS_READER_DR_DB).toBe(50)
    expect(monoLeakDbm(0)).toBe(-20)
    expect(readerFloorDbm(monoLeakDbm(0))).toBe(-70)
    expect(readerFloorDbm(monoLeakDbm(10))).toBe(-60)
  })

  it('reproduces 11-25/0307r0’s mono-static table at 6 dB of modulation loss', () => {
    expect(AMP_BS_LOSS_DB).toBe(6)
    const floor = readerFloorDbm(monoLeakDbm(0)) // −70 dBm
    const at = (d: number) => bsReplyDbm(0, bsPathLossDb(FREQ_24G_MHZ, d, 0))
    expect(at(0.1)).toBeCloseTo(-46.4, 1)
    expect(at(0.2)).toBeCloseTo(-58.4, 1)
    expect(at(0.4)).toBeCloseTo(-70.5, 1)
    expect(at(0.1) - floor).toBeCloseTo(23.6, 1)
    expect(at(0.2) - floor).toBeCloseTo(11.6, 1)
    expect(at(0.4) - floor).toBeCloseTo(-0.5, 1)
  })

  it('decodes a reply that clears the required SNR of its rate', () => {
    expect(AMP_BS_REQ_SNR_DB).toEqual({ 250: 3, 1000: 9 })
    const floor = -70
    expect(bsDecodes(-67, floor, 250)).toBe(true)
    expect(bsDecodes(-67.1, floor, 250)).toBe(false)
    expect(bsDecodes(-61, floor, 1000)).toBe(true)
    expect(bsDecodes(-61.1, floor, 1000)).toBe(false)
  })
})

describe('reach', () => {
  it('is the same however loud the reader is: the floor rises with the excitation', () => {
    for (const bsDbm of [-10, 0, 10, 20, 30]) {
      expectReachM(monoReachM(bsDbm, 250), 0.328)
      expectReachM(monoReachM(bsDbm, 1000), 0.232)
    }
  })

  it('agrees with bsDecodes on both sides of the limit', () => {
    const reach = monoReachM(0, 250)
    const replyAt = (d: number) => bsReplyDbm(0, bsPathLossDb(FREQ_24G_MHZ, d, 0))
    const floor = readerFloorDbm(monoLeakDbm(0))
    expect(bsDecodes(replyAt(reach * 0.999), floor, 250)).toBe(true)
    expect(bsDecodes(replyAt(reach * 1.001), floor, 250)).toBe(false)
  })

  it('activation, unlike reach, does grow with the charge power', () => {
    expect(AMP_BS_ACTIVATION_DBM).toBe(-20)
    expectReachM(activationReachM(10), 0.309)
    expectReachM(activationReachM(20), 0.978)
    // A wall between reader and tag costs both reaches the same decibels.
    expect(activationReachM(20, 6)).toBeCloseTo(activationReachM(14), 9)
    expect(monoReachM(0, 250, 6)).toBeCloseTo(monoReachM(0, 250) / 10 ** 0.3, 9)
  })
})

describe('AMP RFID frames and the two excitations', () => {
  it('sizes a DL command as header + Gen2 body + FCS', () => {
    expect(GEN2_CMD_BYTES).toEqual({ query: 3, queryRep: 1, ack: 3, read: 8, write: 8, select: 18 })
    expect(ampRfidBytes('query')).toBe(10)
    expect(ampRfidBytes('queryRep')).toBe(8)
    expect(ampRfidBytes('ack')).toBe(10)
    expect(ampRfidBytes('read')).toBe(15)
    expect(ampRfidBytes('write')).toBe(15)
    expect(ampRfidBytes('select')).toBe(25)
  })

  it('times a backscattered reply as 24 sync chips plus two chips a Manchester bit', () => {
    expect(GEN2_REPLY_BYTES).toEqual({ rn16: 2, epc: 16, read: 13, write: 5 })
    expect(AMP_BS_UL_CHIP_NS).toEqual({ 250: 2000, 1000: 500 })
    expect(bsReplyNs('rn16', 250)).toBe(112 * US)
    expect(bsReplyNs('epc', 250)).toBe(560 * US)
    expect(bsReplyNs('read', 250)).toBe(464 * US)
    expect(bsReplyNs('write', 250)).toBe(208 * US)
    expect(bsReplyNs('rn16', 1000)).toBe(28 * US)
    expect(bsReplyNs('epc', 1000)).toBe(140 * US)
    expect(bsReplyNs('read', 1000)).toBe(116 * US)
    expect(bsReplyNs('write', 1000)).toBe(52 * US)
  })

  it('sizes the BST-Excitation to hold the reply it expects', () => {
    expect(bstNs('rn16', 250)).toBe(142.4 * US)
    expect(bstNs('epc', 250)).toBe(635.2 * US)
    expect(bstNs('read', 250)).toBe(529.6 * US)
    // A command that expects no response still carries the immediate-response minimum.
    expect(bstNs(null, 250)).toBe(19.2 * US)
    expect(bstNs(null, 250)).toBeGreaterThanOrEqual(AMP_BS_BST_MIN_NS)
    // Write answers after T3 = 2 ms, so its excitation has to stay on that long.
    expect(bstNs('write', 250, AMP_BS_WRITE_T3_NS)).toBe(2429.8 * US)
    expect(bstNs('write', 1000, AMP_BS_WRITE_T3_NS)).toBe(2258.2 * US)
  })

  it('pins the DL PPDU of every command at both uplink rates', () => {
    expect(AMP_BS_DL_KBPS).toBe(250)
    const ext = 6 * US
    const dl = (cmd: Parameters<typeof ampRfidBytes>[0], wupNs: number, bst: number) => ampBsDlPpduNs(cmd, wupNs, bst, ext)
    // 250 kb/s uplink
    expect(dl('query', AMP_BS_WUP_MIN_NS, bstNs('rn16', 250))).toBe(1516.4 * US)
    expect(dl('queryRep', 0, bstNs('rn16', 250))).toBe(452.4 * US)
    expect(dl('ack', 0, bstNs('epc', 250))).toBe(1009.2 * US)
    expect(dl('read', 0, bstNs('read', 250))).toBe(1063.6 * US)
    expect(dl('write', 0, bstNs('write', 250, AMP_BS_WRITE_T3_NS))).toBe(2963.8 * US)
    // 1 Mb/s uplink — only the excitation shrinks; the 250 kb/s downlink does not.
    expect(dl('query', AMP_BS_WUP_MIN_NS, bstNs('rn16', 1000))).toBe(1424.0 * US)
    expect(dl('queryRep', 0, bstNs('rn16', 1000))).toBe(360.0 * US)
    expect(dl('ack', 0, bstNs('epc', 1000))).toBe(547.2 * US)
    expect(dl('read', 0, bstNs('read', 1000))).toBe(680.8 * US)
    expect(dl('write', 0, bstNs('write', 1000, AMP_BS_WRITE_T3_NS))).toBe(2792.2 * US)
  })

  it('builds a DL RFID frame and a UL backscatter reply', () => {
    const bst = bstNs('rn16', 250)
    const f = ampRfidFrame({
      src: 'ap', dst: '*amp', cmd: 'query', session: 1, q: 2, slot: 1, ulKbps: 250,
      wupNs: AMP_BS_WUP_MIN_NS, bstNs: bst, chargeDbm: 10, bsDbm: 0, signalExtNs: 6 * US,
    })
    expect(f.kind).toBe('ampRfid')
    expect(f.bytes).toBe(10)
    expect(f.mbps).toBe(0.25)
    expect(f.txTimeNs).toBe(1516.4 * US)
    expect(f.amp?.dir).toBe('dl')
    expect(f.amp?.kbps).toBe(250)
    expect(f.amp?.rfid).toEqual({
      cmd: 'query', session: 1, q: 2, rn16: undefined, slot: 1, wupNs: AMP_BS_WUP_MIN_NS,
      bstNs: bst, chargeDbm: 10, bsDbm: 0, ulKbps: 250,
    })

    const r = ampBsReplyFrame({ src: 'tag-1', dst: 'ap', reply: 'epc', kbps: 1000, slot: 3, epc: epcOf('tag-1') })
    expect(r.kind).toBe('ampBsReply')
    expect(r.bytes).toBe(16)
    expect(r.mbps).toBe(1)
    expect(r.txTimeNs).toBe(140 * US)
    expect(r.amp?.dir).toBe('ul')
    expect(r.amp?.bs).toEqual({ reply: 'epc', slot: 3, rn16: undefined, epc: epcOf('tag-1') })
    // Task 2/3 fill the incident power in; the field exists from here.
    expect(r.amp?.bs?.incidentDbm).toBeUndefined()
  })
})

describe('tag identity', () => {
  it('derives a 96-bit EPC from the node id, deterministically', () => {
    const a = epcOf('tag-1')
    expect(a).toMatch(/^[0-9a-f]{24}$/)
    expect(epcOf('tag-1')).toBe(a)
    expect(epcOf('tag-2')).not.toBe(a)
  })

  it('folds the EPC into a 16-bit id that is never 0 nor 0xffff', () => {
    const c = crc16Epc(epcOf('tag-1'))
    expect(c).toBe(crc16Epc(epcOf('tag-1')))
    expect(crc16Epc(epcOf('tag-2'))).not.toBe(c)
    for (const id of ['tag-1', 'tag-2', 'tag-3', 'sensor', 'a', '']) {
      const v = crc16Epc(epcOf(id))
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(0xffff)
      expect(v).not.toBe(0)
      expect(v).not.toBe(0xffff)
    }
  })

  /**
   * The fold itself, on inputs that actually reach it. None of the node ids above does — their raw
   * CRCs are ordinary values — so without these two the `crc === 0 || crc === 0xffff` clause could
   * be deleted and the suite would stay green.
   *
   * Both were constructed, not searched for. CRC-16-CCITT (0x1021, init 0xFFFF, no final xor) has
   * the property that appending a message's own CRC makes the CRC of the extension zero: the CRC
   * of the ten octets `0123456789abcdef0123` is 0x6bbf, so that prefix followed by `6bbf` is a
   * 24-hex EPC whose raw CRC is 0x0000. The 0xffff case is the same prefix with the two trailing
   * octets solved for that residue instead: `ef70`.
   */
  it('maps both reserved words to 0x5a5a rather than emitting them', () => {
    expect(crc16Epc('0123456789abcdef01236bbf')).toBe(0x5a5a) // raw CRC 0x0000
    expect(crc16Epc('0123456789abcdef0123ef70')).toBe(0x5a5a) // raw CRC 0xffff
    // …and an ordinary value passes through untouched: twelve zero octets hash to 0x84f9.
    expect(crc16Epc('000000000000000000000000')).toBe(0x84f9)
  })
})
