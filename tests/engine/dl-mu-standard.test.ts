import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'
import { LESSONS } from '../../src/course/lessons'
import type { TLRecord } from '../../src/model/records'
import { EDCA_PARAMS } from '../../src/engine/phy'

const MS = 1_000_000
type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>

/** One EHT and two HE phones next to a Wi-Fi 7 AP, all watching video: mixed-generation DL MU. */
function mixedMu() {
  const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  sc.nodes = sc.nodes.filter((n) => n.kind === 'ap' || ['sta-1', 'sta-5', 'sta-6'].includes(n.id))
  for (const n of sc.nodes) if (n.kind === 'sta') { n.pos = { ...ap.pos, x: ap.pos.x + 0.8 }; n.profiles = ['video'] }
  const sim = new Simulation(sc)
  const recs: TLRecord[] = []
  for (let t = 100 * MS; t <= 1500 * MS; t += 100 * MS) recs.push(...sim.runUntil(t).records)
  return { sc, recs }
}

describe('DL MU per 802.11ax/be', () => {
  const { sc, recs } = mixedMu()
  const gen = Object.fromEntries(sc.nodes.map((n) => [n.id, n.caps.generation]))
  const mu = recs.filter((r): r is Rec<'TX_START'> => r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data' && !!r.frame.muParts)

  it('the scenario really mixes HE and EHT members in one MU PPDU', () => {
    expect(mu.some((r) => r.frame.muParts!.some((p) => gen[p.dst] === 'eht') && r.frame.muParts!.some((p) => gen[p.dst] === 'he'))).toBe(true)
  })

  it('an HE MU PPDU carries HE-MCS only (≤ 11) and an EHT MU PPDU only EHT members', () => {
    for (const r of mu) {
      if (r.frame.mode === 'he') for (const p of r.frame.muParts!) expect(p.mcs).toBeLessThanOrEqual(11)
      if (r.frame.mode === 'eht') for (const p of r.frame.muParts!) expect(gen[p.dst]).toBe('eht')
    }
  })

  it('every addressed part decodes on these short, clean links', () => {
    const muStarts = new Set(mu.map((r) => r.t))
    const fails = recs.filter((r) => r.type === 'RX_FAIL' && r.from === 'ap' && [...muStarts].some((t) => r.t > t && r.t <= t + 6 * MS))
    expect(fails).toHaveLength(0)
  })

  it('an MU PPDU and its BlockAcks end inside the TXOP', () => {
    let checked = 0
    for (const r of mu) {
      const txop = [...recs].reverse().find((x): x is Rec<'TXOP_START'> => x.type === 'TXOP_START' && x.node === 'ap' && x.t <= r.t)
      if (!txop) continue
      const bas = recs.filter((x): x is Rec<'TX_END'> => x.type === 'TX_END' && x.frame.kind === 'ba' && x.frame.orthogonalGroup === r.frame.orthogonalGroup)
      for (const ba of bas) expect(ba.t, `MU @${r.t}`).toBeLessThanOrEqual(txop.untilNs)
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })
})

describe('DL MU outcome', () => {
  it('a missing BlockAck does not double the AP’s CW when another member acknowledged', () => {
    const sc = LESSONS.find((x) => x.id === 'ofdma-dl')!.scenario()
    const stas = sc.nodes.filter((n) => n.kind === 'sta')
    const ap = sc.nodes.find((n) => n.kind === 'ap')!
    stas[stas.length - 1].pos = { ...ap.pos, x: ap.pos.x + 30 }
    const sim = new Simulation(sc)
    const recs: TLRecord[] = []
    for (let t = 50 * MS; t <= 600 * MS; t += 50 * MS) recs.push(...sim.runUntil(t).records)
    let partial = 0
    for (const r of recs) {
      if (r.type !== 'TX_START' || r.node !== 'ap' || r.frame.kind !== 'data' || !r.frame.muParts) continue
      const bas = recs.filter((x) => x.type === 'RX_OK' && x.node === 'ap' && x.frame.kind === 'ba' && x.frame.orthogonalGroup === r.frame.orthogonalGroup)
      if (bas.length === 0 || bas.length === r.frame.muParts.length) continue
      partial++
      const cw = recs.find((x): x is Rec<'CW_CHANGE'> => x.t > r.t && x.type === 'CW_CHANGE' && x.node === 'ap' && x.ac === r.frame.ac)
      expect(cw?.cw, `MU @${r.t}`).toBe(EDCA_PARAMS[r.frame.ac ?? 1].cwMin)
    }
    expect(partial).toBeGreaterThan(0)
  })
})

describe('a triggered uplink round has one PPDU format', () => {
  it('a mixed HE/EHT group is triggered as HE with every MCS capped at 11', () => {
    const sc = HOUSEHOLDS.find((h) => h.id === 'three-gamers')!.scenario()
    const sim = new Simulation({ ...sc, seed: 23 })
    const recs: TLRecord[] = []
    // the crash this guards against was an EHT MCS 12 inside a trigger with no mode
    for (let t = 200 * MS; t <= 3000 * MS; t += 200 * MS) recs.push(...sim.runUntil(t).records)
    const triggers = recs.filter((r): r is Rec<'TX_START'> => r.type === 'TX_START' && r.frame.kind === 'trigger')
    expect(triggers.length).toBeGreaterThan(0)
    for (const r of triggers) {
      // the Trigger itself is a non-HT frame; ulMode is the format it dictates
      expect(r.frame.mode, `trigger @${r.t}`).toBeUndefined()
      expect(r.frame.ulMode, `trigger @${r.t}`).toBeDefined()
      if (r.frame.ulMode === 'he') for (const p of r.frame.muParts!) expect(p.mcs).toBeLessThanOrEqual(11)
    }
    const tb = recs.filter((r): r is Rec<'TX_START'> => r.type === 'TX_START' && r.node !== 'ap' && !!r.frame.orthogonalGroup && r.frame.kind === 'data')
    for (const r of tb) {
      const trig = [...triggers].reverse().find((x) => x.frame.orthogonalGroup === r.frame.orthogonalGroup)
      if (trig) expect(r.frame.mode, `TB PPDU @${r.t}`).toBe(trig.frame.ulMode)
    }
  })
})
