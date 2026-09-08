import { describe, it, expect } from 'vitest'
import { HOUSEHOLDS } from '../../src/model/households'
import { ScenarioSchema, serverFor } from '../../src/model/scenario'
import { STATION_PRESETS } from '../../src/model/presets'
import { Simulation } from '../../src/engine/simulation'
import { applyRecord, initViewState } from '../../src/model/view'

const MS = 1_000_000
const byId = (id: string) => {
  const h = HOUSEHOLDS.find((x) => x.id === id)
  if (!h) throw new Error(`no household ${id}`)
  return h
}

describe('household scenarios', () => {
  it('there are at least six, with unique ids and bilingual titles', () => {
    expect(HOUSEHOLDS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(HOUSEHOLDS.map((h) => h.id)).size).toBe(HOUSEHOLDS.length)
    for (const h of HOUSEHOLDS) {
      expect(h.title.en.length).toBeGreaterThan(0)
      expect(h.title.zh.length).toBeGreaterThan(0)
      expect(h.blurb.en.length).toBeGreaterThan(0)
    }
  })

  it('every household validates and simulates 100 ms', () => {
    for (const h of HOUSEHOLDS) {
      const sc = h.scenario()
      expect(() => ScenarioSchema.parse(sc), h.id).not.toThrow()
      expect(sc.servers.length, `${h.id} has servers`).toBeGreaterThan(0)
      const recs = new Simulation(sc).runUntil(100 * MS).records
      expect(recs.length, h.id).toBeGreaterThan(100)
    }
  }, 60_000)

  it('three gamers, one match: three phones including a Huawei, all on the same game server', () => {
    const sc = byId('three-gamers').scenario()
    const gamers = sc.nodes.filter((n) => n.kind === 'sta' && n.profiles.includes('gaming'))
    expect(gamers.length).toBeGreaterThanOrEqual(3)
    expect(gamers.some((n) => n.name.startsWith('Huawei'))).toBe(true)
    for (const g of gamers) expect(STATION_PRESETS.some((p) => p.model === g.name), `${g.name} is a preset phone`).toBe(true)
    const servers = new Set(gamers.map((g) => serverFor(sc, g, 'gaming')?.id))
    expect(servers.size).toBe(1)
    expect([...servers][0]).toBeDefined()
    expect(sc.servers.find((s) => s.id === [...servers][0])?.kind).toBe('game')
  })

  it('three gamers: every phone measures an application RTT above the WAN RTT', () => {
    const sc = byId('three-gamers').scenario()
    const vs = initViewState(sc)
    for (const r of new Simulation(sc).runUntil(1000 * MS).records) applyRecord(vs, r)
    const game = sc.servers.find((s) => s.kind === 'game')!
    for (const g of sc.nodes.filter((n) => n.profiles.includes('gaming'))) {
      const rtt = vs.nodes[g.id].stats.appRtt
      expect(rtt.n, `${g.name} got ping echoes`).toBeGreaterThanOrEqual(2)
      expect(rtt.sumNs / rtt.n / 1e6, `${g.name} mean RTT`).toBeGreaterThan(game.rttMs + game.processMs)
      expect(rtt.sumNs / rtt.n / 1e6, `${g.name} mean RTT`).toBeLessThan(game.rttMs + game.processMs + game.jitterMs + 10)
    }
  }, 60_000)

  it('two gamers, two servers: the overseas player sees the longer round trip', () => {
    const sc = byId('two-gamers').scenario()
    const gamers = sc.nodes.filter((n) => n.profiles.includes('gaming'))
    expect(gamers).toHaveLength(2)
    const [a, b] = gamers.map((g) => serverFor(sc, g, 'gaming')!)
    expect(a.id).not.toBe(b.id)
    const vs = initViewState(sc)
    for (const r of new Simulation(sc).runUntil(1000 * MS).records) applyRecord(vs, r)
    const mean = (id: string) => { const l = vs.nodes[id].stats.appRtt; return l.sumNs / l.n / 1e6 }
    const far = a.rttMs > b.rttMs ? gamers[0] : gamers[1]
    const near = far === gamers[0] ? gamers[1] : gamers[0]
    expect(mean(far.id)).toBeGreaterThan(mean(near.id) + 30)
  }, 60_000)
})
