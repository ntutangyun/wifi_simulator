import { describe, it, expect } from 'vitest'
import { BAND_EXTRA_LOSS_DB, linkBudget, mcsLadder, widthsFor } from '../../src/course/widgetModel'
import { buildLinkTable } from '../../src/engine/propagation'
import { mcsForRssi, noiseDbm, PHY_MODES, reqSinrDb, type PhyMode } from '../../src/engine/phy'
import { Simulation } from '../../src/engine/simulation'
import type { Material, NodeCfg, Scenario, Wall } from '../../src/model/scenario'

function node(id: string, kind: 'ap' | 'sta', x: number, txPowerDbm: number, mlo = false): NodeCfg {
  return {
    id, kind, name: id, pos: { x, y: 0, z: 1 }, txPowerDbm, profiles: ['idle'],
    caps: { generation: 'eht', features: mlo ? { edca: true, mlo: true } : { edca: true } },
  }
}

/** Walls perpendicular to the AP→STA ray, evenly spaced between them. */
function wallsAcross(materials: Material[], d: number): Wall[] {
  return materials.map((material, i) => {
    const x = (d * (i + 1)) / (materials.length + 1)
    return { x1: x, y1: -3, x2: x, y2: 3, material, openings: [] }
  })
}

const CASES: { d: number; walls: Material[]; tx: number }[] = [
  { d: 1, walls: [], tx: 20 },
  { d: 4, walls: ['drywall'], tx: 20 },
  { d: 9.5, walls: ['brick', 'glass'], tx: 15 },
  { d: 17, walls: ['drywall', 'drywall', 'brick'], tx: 23 },
  { d: 35, walls: ['glass', 'brick', 'brick'], tx: 30 },
]
const MODES: PhyMode[] = ['nonht', 'vht', 'he', 'eht']

describe('linkBudget', () => {
  it('RSSI equals the engine link table for the same geometry', () => {
    for (const c of CASES) {
      const table = buildLinkTable([node('ap', 'ap', 0, c.tx), node('sta', 'sta', c.d, 15)], wallsAcross(c.walls, c.d))
      const lb = linkBudget({ txDbm: c.tx, distanceM: c.d, walls: c.walls, widthMhz: 20, mode: 'he' })
      expect(lb.rssiDbm).toBeCloseTo(table.get('ap')!.get('sta')!, 9)
      expect(lb.pathLossDb + lb.wallLossDb).toBeCloseTo(c.tx - table.get('ap')!.get('sta')!, 9)
    }
  })

  it('6 GHz RSSI equals the simulated 6 GHz link table (pins the replicated extra loss)', () => {
    const c = CASES[2]
    const sc: Scenario = {
      rooms: [], walls: wallsAcross(c.walls, c.d), servers: [], seed: 1, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
      nodes: [node('ap', 'ap', 0, c.tx, true), node('sta', 'sta', c.d, 15, true)],
    }
    const sim = new Simulation(sc)
    const tableOf = (vid: string) =>
      (sim.macs.get(vid) as unknown as { ch: { linkTable: Map<string, Map<string, number>> } }).ch.linkTable
    const rssi5 = tableOf('ap').get('ap')!.get('sta')!
    const rssi6 = tableOf('ap#6g').get('ap')!.get('sta')!
    expect(linkBudget({ txDbm: c.tx, distanceM: c.d, walls: c.walls, widthMhz: 20, mode: 'eht', band: '5g' }).rssiDbm).toBeCloseTo(rssi5, 9)
    expect(linkBudget({ txDbm: c.tx, distanceM: c.d, walls: c.walls, widthMhz: 20, mode: 'eht', band: '6g' }).rssiDbm).toBeCloseTo(rssi6, 9)
    expect(rssi5 - rssi6).toBeCloseTo(BAND_EXTRA_LOSS_DB['6g'], 9)
  })

  it('noise, SNR and MCS follow noiseDbm and mcsForRssi at every width and mode', () => {
    for (const c of CASES) {
      for (const mode of MODES) {
        for (const w of widthsFor(mode)) {
          const lb = linkBudget({ txDbm: c.tx, distanceM: c.d, walls: c.walls, widthMhz: w, mode })
          expect(lb.noiseDbm).toBe(noiseDbm(w))
          expect(lb.snrDb).toBeCloseTo(lb.rssiDbm - noiseDbm(w), 9)
          expect(lb.mcs).toBe(mcsForRssi(mode, lb.rssiDbm, undefined, w))
          expect(lb.reqSinrDb).toBe(reqSinrDb(mode, lb.mcs))
        }
      }
    }
  })

  it('a close link reaches the top MCS and a far one falls to the floor', () => {
    expect(linkBudget({ txDbm: 20, distanceM: 1, walls: [], widthMhz: 20, mode: 'eht' }).mcs).toBe(13)
    const far = linkBudget({ txDbm: 0, distanceM: 40, walls: ['brick', 'brick', 'brick'], widthMhz: 320, mode: 'eht' })
    expect(far.mcs).toBe(0)
    expect(far.usable).toBe(false)
  })
})

describe('mcsLadder', () => {
  it.each(MODES)('%s lists every MCS with the engine’s required SINR, rate and sensitivity', (mode) => {
    const rows = mcsLadder(mode)
    expect(rows).toHaveLength(PHY_MODES[mode].mbps.length)
    rows.forEach((r, i) => {
      expect(r.mcs).toBe(i)
      expect(r.reqSinrDb).toBe(reqSinrDb(mode, i))
      expect(r.mbps).toBe(PHY_MODES[mode].mbps[i])
      expect(r.sensDbm).toBe(PHY_MODES[mode].sensDbm[i])
    })
  })
})
