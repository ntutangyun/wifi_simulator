import { describe, it, expect } from 'vitest'
import { PHY_MODES, mcsForRssi, mcsRateMbps, txTimeModeNs, sinrThreshModeDb, EDCA_PARAMS, aifsNs } from '../../src/engine/phy'
import { ampduPsduBytes, ampduSubframeBytes } from '../../src/model/frames'
import { defaultFeatures, hasFeature, linkPlanFor, minGen, negotiated, virtualId } from '../../src/model/caps'
import { defaultScenario } from '../../src/model/scenario'

describe('PHY modes', () => {
  it('VHT MCS table matches clause 21 (20 MHz, Nss1)', () => {
    expect(mcsRateMbps('vht', 0)).toBe(6.5)
    expect(mcsRateMbps('vht', 8)).toBe(78)
    expect(PHY_MODES.vht.ndbps).toHaveLength(9)
  })

  it('HE MCS table matches clause 27 (20 MHz, Nss1, 0.8 µs GI)', () => {
    expect(mcsRateMbps('he', 0)).toBe(8.6)
    expect(mcsRateMbps('he', 11)).toBe(143.4)
  })

  it('EHT adds 4096-QAM MCS 12/13', () => {
    expect(mcsRateMbps('eht', 13)).toBe(172.1)
    expect(PHY_MODES.eht.ndbps).toHaveLength(14)
  })

  it('computes VHT airtime: 40 µs preamble + 4 µs symbols', () => {
    // 1428 B at VHT MCS8 (312 dbps): ceil((16+11424+6)/312)=37 syms → 40+148 µs
    expect(txTimeModeNs('vht', 1428, 8)).toBe(40_000 + 4_000 * 37)
  })

  it('computes HE airtime with 13.6 µs symbols and MU preamble extra', () => {
    const su = txTimeModeNs('he', 1428, 11)
    expect(su).toBe(44_000 + 13_600 * Math.ceil(11446 / 1950))
    expect(txTimeModeNs('he', 1428, 11, { mu: true })).toBe(su + 4_000)
  })

  it('RU fraction scales symbol capacity', () => {
    const full = txTimeModeNs('he', 1428, 7)
    const half = txTimeModeNs('he', 1428, 7, { ruFraction: 0.5 })
    expect(half).toBeGreaterThan(full)
  })

  it('selects MCS from RSSI with margin, capped for non-4kQAM', () => {
    expect(mcsForRssi('he', -40)).toBe(11)
    expect(mcsForRssi('eht', -40)).toBe(13)
    expect(mcsForRssi('eht', -40, 11)).toBe(11) // qam4k off → cap
    expect(mcsForRssi('he', -90)).toBe(0)
    expect(sinrThreshModeDb('he', 11)).toBe(43)
  })
})

describe('EDCA parameters (Table 9-194)', () => {
  it('has the verified defaults', () => {
    expect(EDCA_PARAMS[0]).toMatchObject({ name: 'BK', aifsn: 7, cwMin: 15, cwMax: 1023, txopLimitNs: 2_528_000 })
    expect(EDCA_PARAMS[2]).toMatchObject({ name: 'VI', aifsn: 2, cwMin: 7, cwMax: 15, txopLimitNs: 4_096_000 })
    expect(EDCA_PARAMS[3]).toMatchObject({ name: 'VO', aifsn: 2, cwMin: 3, cwMax: 7, txopLimitNs: 2_080_000 })
    expect(aifsNs(3)).toBe(16_000 + 3 * 9_000)
  })
})

describe('A-MPDU sizing', () => {
  it('pads subframes to 4 octets with delimiter', () => {
    // 1400 B msdu → mpdu 26+1400+4=1430 → pad 1432 + 4 delim = 1436
    expect(ampduSubframeBytes(1400)).toBe(1436)
    expect(ampduPsduBytes([1400, 1400])).toBe(2872)
  })
})

describe('capabilities', () => {
  it('defaults per generation', () => {
    expect(defaultFeatures('nonht')).toEqual({})
    expect(defaultFeatures('vht')).toEqual({ edca: true, ampdu: true, txop: true })
    expect(defaultFeatures('eht').mlo).toBe(true)
  })

  it('negotiates min of both ends', () => {
    const sc = defaultScenario()
    const [ap, tv, laptop] = sc.nodes
    expect(negotiated(ap, tv, 'ofdma')).toBe(true)
    expect(negotiated(ap, laptop, 'ofdma')).toBe(false) // vht laptop
    expect(negotiated(ap, laptop, 'ampdu')).toBe(true)
    expect(minGen('eht', 'vht')).toBe('vht')
  })

  it('plans links: default scenario is single-link (no MLO STA)', () => {
    const plan = linkPlanFor(defaultScenario().nodes)
    expect(plan.links).toEqual(['5g', '6g']) // AP is MLO → present on both
    expect(plan.members['6g']).toEqual(['ap'])
    expect(plan.virtualIds).toContain('ap#6g')
  })

  it('feature gating respects generation', () => {
    const sc = defaultScenario()
    const laptop = { ...sc.nodes[2], caps: { generation: 'vht' as const, features: { ofdma: true } } }
    expect(hasFeature(laptop, 'ofdma')).toBe(false) // vht cannot ofdma
    expect(virtualId('ap', '6g')).toBe('ap#6g')
  })
})
