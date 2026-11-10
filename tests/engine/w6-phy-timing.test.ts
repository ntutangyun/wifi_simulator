/**
 * W6 (2026-11-11): Wi-Fi PHY timing and carrier sense, pinned to IEEE Std 802.11-2024 and
 * IEEE Std 802.11be-2024 clause by clause.
 *
 *  1. CCA: −82 dBm preamble detection and −62 dBm energy detection measured within the primary
 *     20 MHz channel (§27.3.22.6.3, §36.3.21.6.3); per-20 MHz energy detection on the secondary
 *     channels (§27.3.22.6.5, §36.3.21.6.4) gating a wide PPDU (§10.23.2.5).
 *  2. aRxPHYStartDelay per PHY clause and context (§6.7.4.4, Table 19-25, Table 27-61,
 *     Table 36-70) → AckTimeout / CTSTimeout (§10.3.2.9, §10.3.2.11).
 *  3. TXTIME from the standard's formulas (Eq 27-149, Eq 36-110, Table 27-13, Table 36-18,
 *     Table 21-13, Table 36-43, §27.3.12.5, §36.3.13.3, Table 27-47, Table 36-61).
 *  4. The Duration field in whole microseconds rounded up, at most 32 767 (Table 9-9).
 *  5. The 2.4 GHz EIFS at the ERP PHY's lowest mandatory rate, 1 Mb/s DSSS (Eq 10-7).
 */
import { describe, expect, it } from 'vitest'
import { Channel, primary20Dbm, primaryBandMhz, type ChannelSpectrum, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import {
  ACK_BYTES, ACK_TX_TIME_1M_DSSS_NS, CCA_ED_DBM, CCA_PD_DBM, DURATION_MAX_US, EIFS_NS, ERP_2G, OFDM_5G, PHY_MODES,
  SIFS_NS, SLOT_NS, TGI_NS, TRS_DEFAULT_PE_NS, codingFor, durationFieldValueNs, ltfCount, ltfSymNs, maxPsduBytesForDur,
  peNsFor, ppduTiming, preambleNsFor, psduLengthAt, timingForGen, trsTbPpdu, txTimeModeNs,
} from '../../src/engine/phy'
import { Simulation, bssTimingFor, primary20LoMhz, timingFor } from '../../src/engine/simulation'
import { LESSONS } from '../../src/course/lessons'
import { ppduLayout } from '../../src/model/frameFields'
import type { NodeCfg } from '../../src/model/scenario'
import { defaultFeatures } from '../../src/model/caps'
import { Spectrum, type Emission } from '../../src/engine/spectrum'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'

describe('W6 · TXTIME from the standard’s formulas', () => {
  it('HE preamble: 36 µs + N_HE-LTF × T_HE-LTF-SYM (Table 27-13, Eq 27-121)', () => {
    expect(preambleNsFor('he')).toBe(43_200)
    expect(preambleNsFor('he', TGI_NS.double)).toBe(44_000)
    expect(preambleNsFor('he', TGI_NS.quad)).toBe(52_000)
    expect(preambleNsFor('he', TGI_NS.base, { tb: true })).toBe(47_200) // T_HE-STF-T = 8 µs
    expect([TGI_NS.base, TGI_NS.double, TGI_NS.quad].map(ltfSymNs)).toEqual([7_200, 8_000, 16_000])
    expect(PHY_MODES.he.preambleNs).toBe(preambleNsFor('he'))
  })

  it('EHT preamble: U-SIG 8, two EHT-SIG symbols at EHT-SIG MCS 0, EHT-LTFs by streams (Table 36-18, 36-43)', () => {
    // 20 + RL-SIG 4 + U-SIG 8 + 2 × EHT-SIG 4 + EHT-STF 4 + 7.2
    expect(preambleNsFor('eht')).toBe(51_200)
    expect(PHY_MODES.eht.preambleNs).toBe(51_200)
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(ltfCount)).toEqual([1, 2, 4, 4, 6, 6, 8, 8])
    expect(preambleNsFor('eht', TGI_NS.base, { nss: 2 }) - preambleNsFor('eht')).toBe(7_200)
    expect(preambleNsFor('eht', TGI_NS.base, { nss: 4 }) - preambleNsFor('eht')).toBe(21_600)
    // an EHT TB PPDU: 8 µs EHT-STF, no EHT-SIG
    expect(preambleNsFor('eht', TGI_NS.base, { tb: true })).toBe(47_200)
  })

  it('VHT preamble: 36 µs + 4 µs per VHT-LTF (Table 21-5, Table 21-13)', () => {
    expect([1, 2, 3, 4].map((n) => preambleNsFor('vht', TGI_NS.base, { nss: n }))).toEqual([40_000, 44_000, 52_000, 52_000])
  })

  it('FEC: BCC only up to 242 tones, four streams and MCS 9; LDPC otherwise (§27.3.12.5, §36.3.13.3)', () => {
    expect(codingFor('he', 9)).toBe('bcc')
    expect(codingFor('he', 10)).toBe('ldpc')
    expect(codingFor('he', 0, 40)).toBe('ldpc')
    expect(codingFor('eht', 12)).toBe('ldpc')
    expect(codingFor('eht', 9, 20, 4)).toBe('bcc')
    expect(codingFor('eht', 9, 20, 5)).toBe('ldpc')
    expect(codingFor('he', 7, 80, 1, 0.25)).toBe('bcc') // a quarter of 80 MHz is a 242-tone-sized RU
  })

  it('BCC N_SYM and a: Eq 27-64 / 27-61; the packet extension is 4a µs (Table 27-47, 16 µs padding)', () => {
    // HE MCS 7, 20 MHz: N_DBPS 1170, N_DBPS,short = 60 × 6 × 5/6 = 300
    const t = ppduTiming('he', 1000, 7)
    expect(t.coding).toBe('bcc')
    expect(t.nsym).toBe(Math.ceil((8 * 1000 + 16 + 6) / 1170))
    const excess = (8 * 1000 + 16 + 6) % 1170
    expect(t.a).toBe(Math.min(Math.ceil(excess / 300), 4))
    expect(t.peNs).toBe(peNsFor(t.a))
    expect([1, 2, 3, 4].map(peNsFor)).toEqual([4_000, 8_000, 12_000, 16_000])
    expect(t.totalNs).toBe(43_200 + t.nsym * 13_600 + t.peNs)
  })

  it('LDPC: the extra symbol segment appears exactly when Eq 19-38’s puncturing condition says', () => {
    // Walk HE MCS 11 lengths and find both outcomes; where the segment is added, a = a_init + 1
    // (or N_SYM + 1 and a = 1 when a_init = 4) — §27.3.12.5.2 Eq 27-71.
    let extra = 0
    let plain = 0
    for (let len = 100; len <= 3000; len += 7) {
      const t = ppduTiming('he', len, 11)
      const init = Math.ceil((8 * len + 16) / 1950)
      const ex = (8 * len + 16) % 1950
      const aInit = ex === 0 ? 4 : Math.min(Math.ceil(ex / 500), 4)
      if (t.nsym === init && t.a === aInit) plain++
      else {
        extra++
        expect(aInit === 4 ? [t.nsym, t.a] : [t.nsym, t.a]).toEqual(aInit === 4 ? [init + 1, 1] : [init, aInit + 1])
      }
    }
    expect(plain).toBeGreaterThan(0)
    expect(extra).toBeGreaterThan(0)
  })

  it('the lesson frame: 1430 octets at HE MCS 11 is 43.2 + 6 × 13.6 + 16 = 140.8 µs', () => {
    const t = ppduTiming('he', 1430, 11)
    expect([t.coding, t.nsym, t.a, t.peNs, t.totalNs]).toEqual(['ldpc', 6, 4, 16_000, 140_800])
  })

  it('EHT TXTIME is rounded up to a whole µs (§6.7.6.2 exempts only the HE formats); HE is not', () => {
    const e = ppduTiming('eht', 1528, 13)
    expect(e.totalNs % 1_000).toBe(0)
    expect(e.totalNs - (e.preambleNs + e.nsym * e.symNs + e.peNs)).toBe(e.roundNs)
    expect(e.roundNs).toBeGreaterThan(0)
    expect(ppduTiming('he', 1430, 11).roundNs).toBe(0)
  })

  it('VHT N_ES = ⌈N_DBPS / 2160⌉ reproduces Table 21-46 (80 MHz, N_SS = 2): N_ES 1 at MCS 6, 2 at MCS 7', () => {
    // N_DBPS 2106 and 2340; the tail costs 6 bits per encoder
    const m6 = ppduTiming('vht', 1000, 6, { widthMhz: 80, nss: 2 })
    const m7 = ppduTiming('vht', 1000, 7, { widthMhz: 80, nss: 2 })
    expect(m6.nsym).toBe(Math.ceil((8 * 1000 + 16 + 6) / 2106))
    expect(m7.nsym).toBe(Math.ceil((8 * 1000 + 16 + 12) / 2340))
  })

  it('non-HT TXTIME is unchanged: Eq 17-29', () => {
    expect(txTimeModeNs('nonht', ACK_BYTES, 4)).toBe(28_000) // 24 Mb/s
  })

  it('maxPsduBytesForDur is the exact inverse of TXTIME', () => {
    for (const dur of [200_000, 1_000_000, 2_000_000]) {
      const opts = { widthMhz: 40, nss: 2, tb: true }
      const n = maxPsduBytesForDur('eht', 9, dur, opts)
      expect(txTimeModeNs('eht', n, 9, opts)).toBeLessThanOrEqual(dur)
      expect(txTimeModeNs('eht', n + 1, 9, opts)).toBeGreaterThan(dur)
    }
  })
})

describe('W6 · aRxPHYStartDelay and AckTimeout per PHY (§6.7.4.4)', () => {
  it('clause 17: 20 µs → AckTimeout 45 µs; an HT/VHT/HE STA: 24 µs → 49 µs', () => {
    expect(OFDM_5G.ackTimeoutNs).toBe(SIFS_NS + SLOT_NS + 20_000)
    for (const g of ['vht', 'he', 'eht', 'uhr'] as const) {
      expect(timingForGen(OFDM_5G, g).rxStartDelayNs).toBe(24_000)
      expect(timingForGen(OFDM_5G, g).ackTimeoutNs).toBe(49_000)
    }
    expect(timingForGen(OFDM_5G, 'nonht')).toBe(OFDM_5G)
  })

  it('EHT: 32 µs awaiting EHT TB PPDUs, 32 + 4 × N_EHT-SIG = 40 µs awaiting any PPDU (Table 36-70)', () => {
    expect(timingForGen(OFDM_5G, 'eht').rxStartDelayTbNs).toBe(32_000)
    expect(timingForGen(OFDM_5G, 'eht').rxStartDelayAnyNs).toBe(40_000)
    expect(timingForGen(OFDM_5G, 'he').rxStartDelayTbNs).toBe(24_000)
    expect(timingForGen(OFDM_5G, 'he').rxStartDelayAnyNs).toBe(24_000)
  })

  it('the simulation hands each STA its own generation’s timing', () => {
    expect(timingFor('5g', 'he').ackTimeoutNs).toBe(49_000)
    expect(timingFor('2g', 'he').ackTimeoutNs).toBe(10_000 + 9_000 + 24_000)
    expect(timingFor('5g')).toBe(OFDM_5G)
  })
})

describe('W6 · EIFS (Eq 10-7)', () => {
  it('5 GHz: 16 + 44 + 34 = 94 µs; 2.4 GHz: 10 + 304 (1 Mb/s DSSS Ack, Table 10-8) + 28 = 342 µs', () => {
    expect(EIFS_NS).toBe(94_000)
    expect(ERP_2G.eifsNs).toBe(342_000)
    expect(timingForGen(ERP_2G, 'eht').eifsNs).toBe(342_000)
  })
})

describe('W6 · the Duration field (Table 9-9)', () => {
  it('whole microseconds, a fraction rounded up, at most 32 767 µs', () => {
    expect(durationFieldValueNs(0)).toBe(0)
    expect(durationFieldValueNs(44_000)).toBe(44_000)
    expect(durationFieldValueNs(44_001)).toBe(45_000)
    expect(durationFieldValueNs(156_800)).toBe(157_000)
    expect(durationFieldValueNs(40_000_000)).toBe(DURATION_MAX_US * 1_000)
    expect(DURATION_MAX_US).toBe(32_767)
  })
})

describe('W6 · carrier sense within the primary 20 MHz channel', () => {
  const f = (widthMhz: number): FrameDesc => ({
    kind: 'data', src: 'a', dst: 'b', bytes: 1000, mbps: 8.6, durationFieldNs: 0, txTimeNs: 100_000,
    mode: 'he', mcs: 0, widthMhz,
  })

  it('a w-MHz PPDU has 10·lg(w / 20) dB less in the primary 20 MHz channel', () => {
    expect(primary20Dbm(f(20), -70)).toBe(-70)
    expect(primary20Dbm(f(80), -70)).toBeCloseTo(-70 - 10 * Math.log10(4), 9)
    expect(primary20Dbm(f(160), -78.08)).toBeCloseTo(-87.11, 2)
  })

  it('the primary 20 MHz channel is the lowest PSC in the operating channel (§26.17.2.3)', () => {
    // 80 MHz at 5985 MHz covers 5945–6025: subchannels 5955, 5975 (PSC, ch 5), 5995, 6015
    expect(primary20LoMhz(5985, 80)).toBe(5965)
    // 160 MHz at 6025: 5945–6105 holds PSCs at 5975 and 6055 — the lower one
    expect(primary20LoMhz(6025, 160)).toBe(5965)
    // 40 MHz at 6025 (6005–6045) holds none: its lowest subchannel
    expect(primary20LoMhz(6025, 40)).toBe(6005)
    const sp = { centerMhz: 6025, widthMhz: 160, primary20LoMhz: 5965 }
    expect(primaryBandMhz(sp, 20)).toEqual([5965, 5985])
    expect(primaryBandMhz(sp, 40)).toEqual([5945, 5985])
    expect(primaryBandMhz(sp, 80)).toEqual([5945, 6025])
    expect(primaryBandMhz(sp, 160)).toEqual([5945, 6105])
  })

  function setup(rxDbm: number, sp?: ChannelSpectrum) {
    const q = new EventQueue()
    let now = 0
    const table = new Map([['a', new Map([['b', rxDbm]])], ['b', new Map([['a', rxDbm]])]])
    const records: TLRecord[] = []
    const ch = new Channel(q, () => now, table, makeEmitter((r) => records.push(r)), sp)
    const noop: PhyListener = { onCcaBusy: () => {}, onCcaIdle: () => {}, onRxStart: () => {}, onRxOk: () => {}, onRxCorrupt: () => {} }
    ch.register('a', noop)
    ch.register('b', noop)
    const run = (t: number) => {
      for (;;) {
        const pt = q.peekTime()
        if (pt === null || pt > t) break
        const e = q.pop()!
        now = e.t
        e.fn()
      }
      now = t
    }
    return { ch, records, run, q, setNow: (t: number) => { now = t } }
  }

  it('preamble detection: −78 dBm at 40 MHz (−81.0 in the primary 20) starts; at 80 MHz (−84.0) it does not', () => {
    for (const [w, starts] of [[40, true], [80, false]] as const) {
      const { ch, records, run } = setup(-78)
      ch.startTx('a', f(w))
      run(1_000_000)
      expect(records.some((r) => r.type === 'RX_START' && r.node === 'b'), `${w} MHz`).toBe(starts)
      expect(primary20Dbm(f(w), -78) >= CCA_PD_DBM).toBe(starts)
    }
  })

  it('energy detection: −60 dBm spread over 160 MHz is −69 dBm in the primary 20 — not busy as energy', () => {
    // b cannot detect the preamble because it was transmitting when the PPDU began, so only
    // energy can hold its CCA busy — and the primary 20 MHz share is below −62 dBm.
    const { ch, records, run, q } = setup(-60)
    ch.startTx('b', { ...f(20), src: 'b', dst: 'a', txTimeNs: 50_000 })
    q.schedule(10_000, () => ch.startTx('a', { ...f(160), txTimeNs: 200_000 }))
    run(1_000_000)
    const busy = records.filter((r) => r.type === 'CCA_BUSY' && r.node === 'b' && r.t > 50_000)
    expect(busy).toEqual([])
    expect(primary20Dbm(f(160), -60)).toBeLessThan(CCA_ED_DBM)
  })

  it('secondary channels: a foreign signal of −55 dBm in a secondary 20 MHz holds it busy; the primary stays idle', () => {
    const q = new EventQueue()
    let now = 0
    const s = new Spectrum([], q, () => now)
    const sp: ChannelSpectrum = {
      s, posOf: () => ({ x: 0, y: 0, z: 1 }), txPowerOf: () => 20, centerMhz: 5985, widthMhz: 80,
      primary20LoMhz: primary20LoMhz(5985, 80),
    }
    const table = new Map([['a', new Map([['b', -70]])], ['b', new Map([['a', -70]])]])
    const ch = new Channel(q, () => now, table, makeEmitter(() => {}), sp)
    const noop: PhyListener = { onCcaBusy: () => {}, onCcaIdle: () => {}, onRxStart: () => {}, onRxOk: () => {}, onRxCorrupt: () => {} }
    ch.register('a', noop)
    // A narrowband emission at 6010 MHz (inside the fourth 20 MHz subchannel, 6005–6025), strong
    // enough at the receiver to exceed −62 dBm, with zero path loss for the test.
    const em: Emission = {
      txId: 'nb', eirpDbm: -55, bandLoMhz: 6009, bandHiMhz: 6011, pos: { x: 0, y: 0, z: 1 }, lossDb: () => 0,
    }
    const run = (t: number) => {
      for (;;) {
        const pt = q.peekTime()
        if (pt === null || pt > t) break
        const e = q.pop()!
        now = e.t
        e.fn()
      }
      now = t
    }
    now = 1_000
    s.emit('uwb', em)
    run(1_000)
    expect(ch.isCcaBusy('a')).toBe(false)
    expect(ch.secondaryIdleSinceNs('a', 80)).toBe(Infinity)
    expect(ch.secondaryIdleSinceNs('a', 40)).toBe(-Infinity) // the primary 40 does not hold it
    expect(ch.secondaryIdleSinceNs('a', 20)).toBe(-Infinity)
    now = 5_000
    s.retire('uwb', em)
    run(5_000)
    expect(ch.secondaryIdleSinceNs('a', 80)).toBe(5_000)
  })
})

/**
 * 2026-11-11, W6 merged with W7a/W7b: the PHY timing of W6 composed with the MAC framing of W7a
 * (PSDU_LENGTH / APEP_LENGTH, TRS-solicited TB PPDUs) and the 2.4 GHz slot of W7b.
 */
describe('W6 × W7a/W7b · PSDU_LENGTH, TRS TB PPDUs, long slot', () => {
  const runLesson = (id: string, ms: number) => {
    const l = LESSONS.find((x) => x.id === id)!
    return new Simulation(l.scenario()).runUntil(ms * 1_000_000).records
  }

  it('PSDU_LENGTH follows Eq 27-153: LDPC has no tail bits and stops at the a_init boundary', () => {
    // HE-MCS 11, 20 MHz, 1 SS is LDPC. APEP 1434: N_SYM,init = ⌈(8·1434 + 16) / 1950⌉ = 6,
    // a_init = 4, so PSDU_LENGTH = ⌊(6 × 1950 − 16) / 8⌋ = 1460 — not the BCC 1459.
    const t = ppduTiming('he', 1434, 11)
    expect([t.coding, t.nsymInit, t.aInit, t.psduLength]).toEqual(['ldpc', 6, 4, 1460])
    // HE-MCS 7, BCC: a_init < 4 — the MAC pads only up to a_init·N_DBPS,short in the last symbol.
    const b = ppduTiming('he', 1000, 7)
    const ndbps = PHY_MODES.he.ndbps[7]!
    const short = ndbps * 60 / 234
    expect(b.coding).toBe('bcc')
    expect(b.psduLength).toBe(Math.floor(((b.nsymInit - 1) * ndbps + (b.aInit < 4 ? b.aInit * short : ndbps) - 16 - 6) / 8))
    expect(psduLengthAt('he', 7, b.nsymInit, b.aInit)).toBe(b.psduLength)
    // VHT, BCC, N_ES encoders' tails (Eq 21-112).
    const v = ppduTiming('vht', 1000, 7, { widthMhz: 80, nss: 2 })
    expect(v.psduLength).toBe(Math.floor((v.nsym * PHY_MODES.vht.ndbps[7]! * (234 / 52) * 2 - 16 - 6 * 2) / 8))
  })

  it('every recorded HE/EHT data frame carries the PSDU_LENGTH of its APEP_LENGTH, and its TXTIME from APEP_LENGTH', () => {
    const recs = runLesson('ampdu', 200)
    const frames = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START')
      .map((r) => r.frame).filter((f) => f.kind === 'data' && f.apepBytes !== undefined && !f.muParts && !f.orthogonalGroup)
    expect(frames.length).toBeGreaterThan(10)
    for (const f of frames) {
      const t = ppduTiming(f.mode!, f.apepBytes!, f.mcs!, { widthMhz: f.widthMhz, nss: f.nss ?? 1, giNs: f.giNs })
      expect(f.bytes).toBe(t.psduLength)
      expect(f.txTimeNs - t.totalNs === 0 || f.txTimeNs - t.totalNs === 6_000).toBe(true)
    }
  })

  it('the TB PPDU a TRS Control subfield solicits has the 8 µs STF, a = 4 and the 16 µs Default PE Duration (§26.5.2.3.4)', () => {
    const tb = trsTbPpdu('he', 3, { widthMhz: 20, ruFraction: 0.5, apepBytes: 36 })
    // Half of a 20 MHz channel is < 484 tones: BCC, so N_SYM = ⌈(8·36 + 16 + 6) / (N_DBPS(MCS 3) × 0.5)⌉.
    expect(tb.nsym).toBe(Math.ceil((8 * 36 + 16 + 6) / (PHY_MODES.he.ndbps[3]! * 0.5)))
    expect(tb.durNs).toBe(preambleNsFor('he', TGI_NS.double, { tb: true }) + tb.nsym * 14_400 + TRS_DEFAULT_PE_NS) // 12.8 + 1.6 µs GI
    // ≥ 484-tone RU: LDPC with LDPC_EXTRA_SYMBOL = 1.
    const wide = trsTbPpdu('he', 3, { widthMhz: 80, ruFraction: 0.5, apepBytes: 36 })
    const n = PHY_MODES.he.ndbps[3]! * (980 / 234) * 0.5
    expect(wide.nsym).toBe(Math.ceil((8 * 36 + 16) / n) + 1)
    // EHT rounds the TXTIME up to a whole microsecond (Eq 36-110).
    expect(trsTbPpdu('eht', 3, { widthMhz: 20, ruFraction: 1 / 3, apepBytes: 36 }).durNs % 1_000).toBe(0)
  })

  it('a DL MU round: the BlockAcks arrive in TB PPDUs laid out as TRS TB PPDUs, PE included', () => {
    const recs = runLesson('ofdma-dl', 300)
    const bas = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START')
      .map((r) => r.frame).filter((f) => f.kind === 'ba' && f.ru)
    expect(bas.length).toBeGreaterThan(0)
    for (const f of bas.slice(0, 20)) {
      const segs = ppduLayout(f)
      expect(segs.map((s) => s.key)).toContain('pe')
      expect(segs.find((s) => s.key === 'pe')!.durNs).toBe(TRS_DEFAULT_PE_NS)
      expect(segs.reduce((s, x) => s + x.durNs, 0)).toBe(f.txTimeNs)
    }
  })

  it('2.4 GHz: AckTimeout carries the HE aRxPHYStartDelay and the long slot; EIFS = SIFS + 304 + DIFS (Eq 10-7)', () => {
    const sta = (id: string, short: boolean): NodeCfg => ({
      id, kind: 'sta', pos: { x: 0, y: 0, z: 1 }, caps: { generation: 'he', features: defaultFeatures('he') },
      ...(short ? {} : { shortSlot: false }),
    } as unknown as NodeCfg)
    const ap = { ...sta('ap', true), kind: 'ap' } as NodeCfg
    const short = bssTimingFor('2g', [ap, sta('s', true)], 'he')
    expect([short.slotNs, short.difsNs, short.ackTimeoutNs, short.eifsNs]).toEqual([9_000, 28_000, 43_000, 342_000])
    const long = bssTimingFor('2g', [ap, sta('s', false)], 'he')
    expect([long.slotNs, long.difsNs, long.ackTimeoutNs, long.eifsNs]).toEqual([20_000, 50_000, 54_000, 364_000])
    expect(long.eifsNs).toBe(long.sifsNs + ACK_TX_TIME_1M_DSSS_NS + long.difsNs)
  })
})
