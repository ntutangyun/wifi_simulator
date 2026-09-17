import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { mcsForRssi, noiseDbm, reqSinrDb, PHY_MODES } from '../../src/engine/phy'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import type { FrameDesc } from '../../src/model/frames'

describe('receiver noise and required SINR (standard-derived)', () => {
  it('noise floor is kTB + NF 7 dB, scaled with the received PPDU width', () => {
    expect(noiseDbm(20)).toBeCloseTo(-93.99, 2)
    expect(noiseDbm(40)).toBeCloseTo(-90.98, 2)
    expect(noiseDbm(160)).toBeCloseTo(-84.96, 2)
  })

  it('required SINR = minimum sensitivity − kTB(20 MHz) − the standard’s 10 dB noise figure', () => {
    expect(reqSinrDb('nonht', 0)).toBeCloseTo(8.99, 2) // 6 Mb/s, −82 dBm
    expect(reqSinrDb('nonht', 7)).toBeCloseTo(25.99, 2) // 54 Mb/s, −65 dBm
    expect(reqSinrDb('he', 11)).toBeCloseTo(38.99, 2) // −52 dBm
    expect(reqSinrDb('eht', 13)).toBeCloseTo(44.99, 2) // −46 dBm
    expect(() => reqSinrDb('he', 12)).toThrow(/invalid MCS 12 for he/)
  })

  it('the rate ceiling is the highest MCS whose required SINR + 3 dB fits the SNR at that width', () => {
    for (const w of [20, 80, 160]) {
      for (let rssi = -95; rssi <= -30; rssi += 0.5) {
        const snr = rssi - noiseDbm(w)
        let best = 0
        PHY_MODES.eht.sensDbm.forEach((_, i) => { if (snr >= reqSinrDb('eht', i) + 3) best = i })
        expect(mcsForRssi('eht', rssi, undefined, w), `rssi ${rssi} @${w}`).toBe(best)
      }
    }
  })
})

/** Two links, one receiver each, a co-channel interferer: does the frame decode? */
function decodes(widthMhz: number, signalDbm: number, interfDbm: number | null, mcs: number): boolean {
  const q = new EventQueue()
  let now = 0
  const table = new Map<string, Map<string, number>>([
    ['tx', new Map([['rx', signalDbm], ['jam', -200]])],
    ['jam', new Map([['rx', interfDbm ?? -200], ['tx', -200]])],
    ['rx', new Map([['tx', -200], ['jam', -200]])],
  ])
  const recs: TLRecord[] = []
  const ch = new Channel(q, () => now, table, makeEmitter((r) => recs.push(r)))
  const quiet: PhyListener = { onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxOk() {}, onRxCorrupt() {} }
  for (const id of ['tx', 'jam', 'rx']) ch.register(id, quiet)
  const f = (src: string, t: number): FrameDesc => ({
    kind: 'data', src, dst: 'rx', bytes: 1500, mbps: 100, durationFieldNs: 0, txTimeNs: t, mode: 'eht', mcs, widthMhz,
  })
  if (interfDbm !== null) ch.startTx('jam', f('jam', 2_000_000))
  q.schedule(1000, () => ch.startTx('tx', f('tx', 500_000)))
  for (;;) { const pt = q.peekTime(); if (pt === null) break; const e = q.pop()!; now = e.t; e.fn() }
  return recs.some((r) => r.type === 'RX_OK' && r.node === 'rx' && r.from === 'tx')
}

describe('width changes noise, not the SIR a frame needs', () => {
  it('against a strong co-channel interferer, 20 MHz and 160 MHz need the same SIR', () => {
    const req = reqSinrDb('eht', 5)
    for (const w of [20, 160]) {
      expect(decodes(w, -40, -40 - req - 0.5, 5), `${w} MHz just above`).toBe(true)
      expect(decodes(w, -40, -40 - req + 0.5, 5), `${w} MHz just below`).toBe(false)
    }
  })

  it('against noise alone, 160 MHz needs about 9 dB more signal than 20 MHz', () => {
    const req = reqSinrDb('eht', 5)
    const edge = (w: number) => noiseDbm(w) + req
    expect(decodes(20, edge(20) + 0.5, null, 5)).toBe(true)
    expect(decodes(160, edge(20) + 0.5, null, 5)).toBe(false)
    expect(decodes(160, edge(160) + 0.5, null, 5)).toBe(true)
    expect(edge(160) - edge(20)).toBeCloseTo(9.03, 1)
  })
})
