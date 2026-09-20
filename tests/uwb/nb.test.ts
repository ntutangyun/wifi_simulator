import { describe, it, expect } from 'vitest'
import {
  NB_CHANNELS, NB_CHANNEL_MHZ, NB_CHIP_US, NB_DEFAULT_CHANNELS, NB_DEFAULT_INIT_CHANNEL,
  NB_LBT_CCA_US, NB_LBT_EDT_DBM_PER_MHZ, NB_LBT_THRESHOLD_DBM, NB_MSG_ID, NB_PHR_SYMBOLS,
  NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES, NB_RX_SENS_DBM, NB_SHR_SYMBOLS, NB_SIR_MIN_DB,
  NB_SYMBOL_CHIPS, NB_SYMBOL_US, NB_TX_DBM, nbBand, nbCenterMhz, nbChannelForBlock, nbLbtRequired,
  nbPl0Db, nbPpduNs,
} from '../../src/uwb/nb'
import { hashStr } from '../../src/engine/hash'
import { UWB_RX_SENS_DBM } from '../../src/uwb/phy'

describe('the narrowband PHY', () => {
  it('is O-QPSK at 16 µs a symbol', () => {
    expect(NB_CHIP_US * NB_SYMBOL_CHIPS).toBe(NB_SYMBOL_US)
    expect(NB_SHR_SYMBOLS + NB_PHR_SYMBOLS).toBe(12)
  })

  it('sizes the four control messages at 576 and 608 µs', () => {
    expect(nbPpduNs(NB_POLL_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_RESP_BYTES)).toBe(576_000)
    expect(nbPpduNs(NB_REPORT_BYTES)).toBe(608_000)
    expect(NB_POLL_BYTES).toBe(12)
    expect(NB_RESP_BYTES).toBe(12)
    expect(NB_REPORT_BYTES).toBe(13)
    // Two symbols per octet, on top of the 12-symbol header.
    expect(nbPpduNs(0)).toBe(12 * 16_000)
    expect(nbPpduNs(13) - nbPpduNs(12)).toBe(2 * 16_000)
  })

  it('numbers its four message kinds as the draft’s compressed PSDU does', () => {
    expect(NB_MSG_ID).toEqual({ poll: 0x04, resp: 0x05, reportInitiator: 0x06, reportResponder: 0x07 })
  })
})

describe('the narrowband channel plan', () => {
  it('puts 50 channels in UNII-3 and 200 in UNII-5, 2.5 MHz apart', () => {
    expect(NB_CHANNELS).toBe(250)
    expect(NB_CHANNEL_MHZ).toBe(2.5)
    expect(nbCenterMhz(0)).toBe(5726.25)
    expect(nbCenterMhz(49)).toBe(5848.75)
    expect(nbCenterMhz(50)).toBe(5926.25)
    expect(nbCenterMhz(249)).toBe(6423.75)
    // Both bands stay inside their edges, and the jump between them is the 6 GHz gap.
    expect(nbCenterMhz(0) - NB_CHANNEL_MHZ / 2).toBeGreaterThanOrEqual(5725)
    expect(nbCenterMhz(49) + NB_CHANNEL_MHZ / 2).toBeLessThanOrEqual(5850)
    expect(nbCenterMhz(50) - NB_CHANNEL_MHZ / 2).toBeGreaterThanOrEqual(5925)
    expect(nbCenterMhz(249) + NB_CHANNEL_MHZ / 2).toBeLessThanOrEqual(6425)
  })

  it('occupies 2.5 MHz around its centre', () => {
    expect(nbBand(3)).toEqual({ lo: 5732.5, hi: 5735 })
    expect(nbBand(249).hi - nbBand(249).lo).toBeCloseTo(NB_CHANNEL_MHZ, 9)
  })

  it('defaults to the draft’s initialization channel and UNII-3 allow list', () => {
    expect(NB_DEFAULT_INIT_CHANNEL).toBe(2)
    expect(NB_DEFAULT_CHANNELS).toEqual([3])
    expect(nbCenterMhz(NB_DEFAULT_CHANNELS[0])).toBe(5733.75)
  })

  it('loses 47.6 dB in the first metre at the default channel', () => {
    expect(nbPl0Db(3)).toBeCloseTo(47.617, 3)
    expect(nbPl0Db(249)).toBeCloseTo(48.604, 3)
    // Lower than the UWB channels: a lower carrier spreads more slowly.
    expect(nbPl0Db(249)).toBeLessThan(50.4)
  })

  it('is a quieter, more sensitive radio than the UWB one', () => {
    expect(NB_TX_DBM).toBe(10)
    expect(NB_RX_SENS_DBM).toBe(-100)
    expect(NB_RX_SENS_DBM).toBeLessThan(UWB_RX_SENS_DBM)
    expect(NB_SIR_MIN_DB).toBe(0)
  })
})

describe('listen before talk', () => {
  it('scales the −75 dBm/MHz energy threshold to the 2.5 MHz channel', () => {
    expect(NB_LBT_EDT_DBM_PER_MHZ).toBe(-75)
    expect(NB_LBT_CCA_US).toBe(9)
    expect(NB_LBT_THRESHOLD_DBM).toBeCloseTo(-71.02, 2)
  })

  it('is mandatory in UNII-5 and optional in UNII-3', () => {
    expect(nbLbtRequired(3, 'auto')).toBe(false)
    expect(nbLbtRequired(49, 'auto')).toBe(false)
    expect(nbLbtRequired(50, 'auto')).toBe(true)
    expect(nbLbtRequired(249, 'auto')).toBe(true)
    expect(nbLbtRequired(3, 'on')).toBe(true)
    expect(nbLbtRequired(200, 'on')).toBe(true)
    expect(nbLbtRequired(3, 'off')).toBe(false)
    expect(nbLbtRequired(200, 'off')).toBe(false)
  })
})

describe('the per-block channel hop', () => {
  it('picks a channel from the allow list, and only from it', () => {
    const list = [3, 7, 60, 200]
    for (let b = 0; b < 50; b++) expect(list).toContain(nbChannelForBlock(list, 7, b))
    expect(nbChannelForBlock([3], 7, 99)).toBe(3)
  })

  it('is the simulator’s hash, so a replay picks the same channels', () => {
    const list = [3, 7, 60, 200]
    expect(nbChannelForBlock(list, 7, 5)).toBe(list[hashStr('7:5') % list.length])
    expect(nbChannelForBlock(list, 7, 5)).toBe(nbChannelForBlock(list, 7, 5))
    // A different seed or a different block is a different draw, with no Math.random anywhere.
    const seven = Array.from({ length: 20 }, (_, b) => nbChannelForBlock(list, 7, b))
    const eight = Array.from({ length: 20 }, (_, b) => nbChannelForBlock(list, 8, b))
    expect(seven).not.toEqual(eight)
    expect(new Set(seven).size).toBeGreaterThan(1)
  })
})

describe('the channel plan has edges', () => {
  it('refuses a channel number outside 0…249', () => {
    for (const n of [-1, NB_CHANNELS, 1000]) {
      expect(() => nbCenterMhz(n), String(n)).toThrow(/narrowband plan has 250 channels/)
    }
  })

  it('refuses a channel number that is not a whole channel', () => {
    expect(() => nbCenterMhz(3.5)).toThrow(/narrowband plan has 250 channels/)
    // …and still answers for both band edges, which is what the guard must not cost.
    expect(nbCenterMhz(0)).toBe(5726.25)
    expect(nbCenterMhz(NB_CHANNELS - 1)).toBe(6423.75)
  })
})
