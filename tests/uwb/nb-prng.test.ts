/**
 * W5 (2026-11-11): the narrowband control plane's draft figures that the engine used to get wrong.
 *
 * - The channel hop is the draft's `NbaPrng` — the AES-128 block cipher keyed by the one-octet seed,
 *   encrypting the ranging block index, PrngValue = bits 0…31, SelectedChannel = list[PrngValue mod n]
 *   (§10.39.8.4.3 via 15-24/0223r1 and 15-24/0658r1). Pinned against the draft's own worked examples:
 *   15-26/0215r2 (seed 1234 — an out-of-range seed, which 15-26/0408r2 then replaced) and
 *   15-26/0408r2 (seed 123).
 * - A one-to-many POLL at Message Control 1 is 12 + 3N octets (15-22/0381r5 Table 1.6.3.1; the
 *   draft's One-to-many Poll Compact frame, 15-24/0687r4 Figure 90): it was counted 14 + 3N.
 * - phyCcaDuration is 8 symbol periods (standard Table 12-2) and macUnitBackoffPeriod is
 *   aTurnaroundTime + phyCcaDuration (Table 8-37).
 */
import { describe, expect, it } from 'vitest'
import { aes128Encrypt, u128be } from '../../src/uwb/aes128'
import {
  NB_ADDR_BYTES, NB_CSMA, NB_PHY_CCA_DURATION_US, NB_POLL_BYTES, NB_PREDICTED_REPLY_BYTES, NB_RESP_BYTES,
  NB_UNIT_BACKOFF_US, nbaPrngValue, nbChannelForBlock, nbOtmPollBytes,
} from '../../src/uwb/nb'
import { makeNbPollOtm, makeNbResp } from '../../src/uwb/frames'

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('the AES-128 block cipher', () => {
  it('reproduces FIPS 197 Appendix B', () => {
    const key = Uint8Array.from([0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c])
    const pt = Uint8Array.from([0x32, 0x43, 0xf6, 0xa8, 0x88, 0x5a, 0x30, 0x8d, 0x31, 0x31, 0x98, 0xa2, 0xe0, 0x37, 0x07, 0x34])
    expect(hex(aes128Encrypt(key, pt))).toBe('3925841d02dc09fbdc118597196a0b32')
  })
})

describe('NbaPrng, against the draft’s worked examples', () => {
  // 15-26/0215r2: macMmsPrngSeed = 1234, mmsNbChannelAllowList = {0 … 49}
  const v1234: [number, string, number, number][] = [
    [0, 'b9ebc6d5ce39e0697c7078dc59ee69b0', 1508796848, 48],
    [1, 'c2da8e6ea9cf6ef1e7fbe28daa400062', 2856321122, 22],
    [2, 'e54e60add2f40fd7451478223f4dacec', 1062055148, 48],
    [3, '676fa9d615dd41e3040471ef6226c2dd', 1646707421, 21],
    [4, '64c2525bd6eb03c88731e255822f115c', 2184122716, 16],
  ]
  // 15-26/0408r2: the legal one-octet seed 123
  const v123: [number, string, number, number][] = [
    [0, 'ed33cc9bc1d732ac547a83cc6873dc5c', 1752423516, 16],
    [1, 'edf6fd2d081a79067954e323742529ff', 1948592639, 39],
    [2, '5d9d7bfb6bf3ec497292812ed80ef41f', 3624858655, 5],
    [3, '0f3b7ef6921135284de43ee1e5d14919', 3855698201, 1],
  ]
  const allow = Array.from({ length: 50 }, (_, i) => i)
  for (const [seed, table] of [[1234, v1234], [123, v123]] as const) {
    it(`seed ${seed}: the cipher output, PrngValue and SelectedChannel`, () => {
      for (const [block, out, value, channel] of table) {
        expect(hex(aes128Encrypt(u128be(seed), u128be(block))), `block ${block}`).toBe(out)
        expect(nbaPrngValue(seed, block), `block ${block}`).toBe(value)
        expect(value % allow.length).toBe(channel)
      }
    })
  }

  it('selects from the allow list with the seed reduced to one octet', () => {
    for (const [block, , , channel] of v123) expect(nbChannelForBlock(allow, 123, block)).toBe(channel)
    // The scenario seed 123 + 256 is the same one-octet seed.
    expect(nbChannelForBlock(allow, 379, 2)).toBe(5)
  })
})

describe('the one-to-many POLL is 12 + 3N octets', () => {
  it('replaces the pairwise POLL’s two zero content octets rather than adding to them', () => {
    expect(NB_POLL_BYTES).toBe(12)
    for (const n of [1, 3, 4, 8]) expect(nbOtmPollBytes(n)).toBe(12 + NB_ADDR_BYTES * n)
    expect(nbOtmPollBytes(3)).toBe(21)
  })

  it('is the first sub-round’s POLL; a later sub-round’s is Message Control 0, twelve octets', () => {
    const first = makeNbPollOtm('t', ['a', 'b', 'c'], 3, 0, 0, 0, true)
    const later = makeNbPollOtm('t', ['a', 'b', 'c'], 3, 0, 0, 28, false)
    expect([first.bytes, later.bytes]).toEqual([21, 12])
    expect(first.uwb!.nb!.responders).toEqual(['a', 'b', 'c'])
    expect(later.uwb!.nb!.responders).toBeUndefined()
  })
})

describe('the RESP at Message Control 2 (resolution 15-25/0681r1)', () => {
  it('carries a 5-octet Predicted Reply Time in place of five zero octets: the same 12 octets', () => {
    expect(NB_PREDICTED_REPLY_BYTES).toBe(5)
    const plain = makeNbResp('a', 't', 3, 0, 0, 2, false)
    const predicted = makeNbResp('a', 't', 3, 0, 0, 2, false, 123_456)
    expect([plain.bytes, predicted.bytes]).toEqual([NB_RESP_BYTES, NB_RESP_BYTES])
    expect(plain.uwb!.nb!.predictedReplyRctu).toBeUndefined()
    expect(predicted.uwb!.nb!.predictedReplyRctu).toBe(123_456)
  })
})

describe('the CSMA-CA timing of the narrowband PHY', () => {
  it('runs a CCA of phyCcaDuration = 8 symbol periods, and a unit backoff of 20', () => {
    expect(NB_PHY_CCA_DURATION_US).toBe(128)
    expect(NB_UNIT_BACKOFF_US).toBe(320)
    expect(NB_CSMA).toEqual({ minBe: 0, maxBe: 5, maxBackoffs: 4 })
  })
})
