import { describe, it, expect } from 'vitest'
import { PHY_MODES, toneRatio, txTimeModeNs, mcsForRssi, sinrThreshModeDb, widthPenaltyDb } from '../../src/engine/phy'

describe('channel width multiplies the bits carried per symbol', () => {
  it('uses the standard data-subcarrier counts for HE and EHT', () => {
    expect(toneRatio('eht', 20)).toBeCloseTo(1, 3)
    expect(toneRatio('eht', 40)).toBeCloseTo(2, 3)
    expect(toneRatio('eht', 80)).toBeCloseTo(980 / 234, 3)
    expect(toneRatio('eht', 160)).toBeCloseTo(1960 / 234, 3)
    expect(toneRatio('eht', 320)).toBeCloseTo(3920 / 234, 3)
    expect(toneRatio('he', 160)).toBeCloseTo(1960 / 234, 3)
  })

  it('uses the VHT subcarrier counts for Wi-Fi 5, which are not the same ratios', () => {
    expect(toneRatio('vht', 40)).toBeCloseTo(108 / 52, 3)
    expect(toneRatio('vht', 80)).toBeCloseTo(234 / 52, 3)
    expect(toneRatio('vht', 160)).toBeCloseTo(468 / 52, 3)
  })

  it('non-HT has one width only', () => {
    expect(toneRatio('nonht', 20)).toBe(1)
    expect(toneRatio('nonht', 80)).toBe(1)
  })

  it('reproduces the Xiaomi 17 Ultra datasheet: 5.8 Gb/s at 320 MHz, two streams, MCS 13', () => {
    // A PHY rate, not a frame throughput: bits per symbol over the symbol time.
    // A real frame never quite reaches it, because the 48 µs preamble does not scale.
    const m = PHY_MODES.eht
    const bitsPerSymbol = m.ndbps[13] * toneRatio('eht', 320) * 2
    const mbps = bitsPerSymbol / (m.symNs / 1000)
    expect(mbps).toBeGreaterThan(5700)
    expect(mbps).toBeLessThan(5800)
  })

  it('reproduces Apple’s published Wi-Fi 6 figure: ~1200 Mb/s at 80 MHz, two streams, HE MCS 11', () => {
    // support.apple.com "Wi-Fi and Ethernet specifications for Apple devices":
    // Wi-Fi 6 iPhones are ax@5 GHz | 1200 Mbps | 80 MHz | 2/MIMO. HE tops out
    // at MCS 11 (no 4096-QAM), so this is the top rate an HE80 2x2 link reaches.
    const m = PHY_MODES.he
    const bitsPerSymbol = m.ndbps[11] * toneRatio('he', 80) * 2
    const mbps = bitsPerSymbol / (m.symNs / 1000)
    expect(mbps).toBeGreaterThan(1150)
    expect(mbps).toBeLessThan(1250)
  })

  it('computes the EHT160 two-stream top rate — and it runs above Apple’s published 2400 Mb/s', () => {
    // Apple's Wi-Fi 7 figure is be@5 GHz | 2400 Mbps | 160 MHz | 2/MIMO. The
    // engine's top EHT MCS (13, 4096-QAM) at 160 MHz / 2 streams computes to
    // ~2882 Mb/s — about 20% above Apple's figure. MCS 11 (1024-QAM, the top
    // HE shares with EHT) computes to ~2402 Mb/s, which matches Apple's 2400
    // almost exactly. The mismatch at MCS 13 versus the close match at MCS 11
    // suggests Apple's published number assumes 1024-QAM rather than the
    // 4096-QAM this engine's top-of-range EHT MCS allows; see the report.
    const m = PHY_MODES.eht
    const top = m.ndbps[13] * toneRatio('eht', 160) * 2
    const topMbps = top / (m.symNs / 1000)
    expect(topMbps).toBeGreaterThan(2800)
    expect(topMbps).toBeLessThan(2950)

    const mcs11 = m.ndbps[11] * toneRatio('eht', 160) * 2
    const mcs11Mbps = mcs11 / (m.symNs / 1000)
    expect(mcs11Mbps).toBeGreaterThan(2350)
    expect(mcs11Mbps).toBeLessThan(2450)
  })

  it('a fixed preamble means a single frame shrinks less than its data symbols do', () => {
    const narrow = txTimeModeNs('eht', 1530, 7)
    const wide = txTimeModeNs('eht', 1530, 7, { widthMhz: 160, nss: 2 })
    expect(narrow / wide).toBeGreaterThan(2.5)
    expect(narrow / wide).toBeLessThan(4)
  })

  it('a large aggregate approaches the full data-symbol ratio', () => {
    const narrow = txTimeModeNs('eht', 30_600, 7)
    const wide = txTimeModeNs('eht', 30_600, 7, { widthMhz: 160, nss: 2 })
    expect(narrow / wide).toBeGreaterThan(10)
    expect(narrow / wide).toBeLessThan(15)
  })

  it('defaults leave every existing call unchanged', () => {
    expect(txTimeModeNs('eht', 1530, 7, { widthMhz: 20, nss: 1 })).toBe(txTimeModeNs('eht', 1530, 7))
  })
})

describe('a wider channel admits more noise, so every rate needs more signal', () => {
  it('costs 3 dB per doubling of width', () => {
    expect(widthPenaltyDb(20)).toBeCloseTo(0, 2)
    expect(widthPenaltyDb(40)).toBeCloseTo(3.01, 2)
    expect(widthPenaltyDb(80)).toBeCloseTo(6.02, 2)
    expect(widthPenaltyDb(160)).toBeCloseTo(9.03, 2)
    expect(widthPenaltyDb(320)).toBeCloseTo(12.04, 2)
  })

  it('raises the decode threshold by the same amount', () => {
    const narrow = sinrThreshModeDb('eht', 5)
    const wide = sinrThreshModeDb('eht', 5, 160)
    expect(wide - narrow).toBeCloseTo(9.03, 2)
  })

  it('a far station reaches a higher modulation on a narrow channel than a wide one', () => {
    // -55 dBm keeps both sides off the floor, so this compares two real
    // modulations rather than "decodes nothing" against "reaches MCS 0".
    const narrow = mcsForRssi('eht', -55, undefined, 20)
    const wide = mcsForRssi('eht', -55, undefined, 160)
    expect(narrow).toBe(8)
    expect(wide).toBe(4)
    expect(wide).toBeGreaterThan(0)
  })

  it('defaults to 20 MHz so existing callers are unchanged', () => {
    expect(mcsForRssi('eht', -60)).toBe(mcsForRssi('eht', -60, undefined, 20))
  })
})
