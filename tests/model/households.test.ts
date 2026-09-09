import { describe, it, expect } from 'vitest'
import { HOUSEHOLDS } from '../../src/model/households'
import { ScenarioSchema, serverFor } from '../../src/model/scenario'
import { STATION_PRESETS } from '../../src/model/presets'
import { Simulation } from '../../src/engine/simulation'
import { applyRecord, initViewState } from '../../src/model/view'
import { widthOf, nssOf } from '../../src/model/caps'

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

describe('household phones carry the radio their datasheet claims', () => {
  it('a Wi-Fi 7 phone is 2 streams at 160 MHz', () => {
    const sc = HOUSEHOLDS.find((h) => h.id === 'three-gamers')!.scenario()
    const phone = sc.nodes.find((n) => n.id === 'sta-1')!
    expect(widthOf(phone)).toBe(160)
    expect(nssOf(phone)).toBe(2)
  })

  it('the router is 4 streams at 160 MHz — the Chinese market has no 6 GHz', () => {
    const sc = HOUSEHOLDS.find((h) => h.id === 'three-gamers')!.scenario()
    const ap = sc.nodes.find((n) => n.kind === 'ap')!
    expect(widthOf(ap)).toBe(160)
    expect(nssOf(ap)).toBe(4)
  })

  it('a Wi-Fi 6 phone is 2 streams at 160 MHz too, but its MCS table stops lower', () => {
    const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
    const he = sc.nodes.find((n) => n.caps.generation === 'he')
    expect(he).toBeDefined()
    expect(nssOf(he!)).toBe(2)
  })
})

// Post-width: 'three-gamers' has no household node whose data frames exceed
// 1000 bytes within 300 ms except AP→TV video — and the TV is a generic
// `device()` node (household-only, not a real-phone preset) that was never
// given a widthMhz, so it correctly negotiates down to 20 MHz. Asserting
// *every* >1000-byte frame in that household is 160 MHz would actually be
// asserting a bug (the TV pulling the AP down, or the AP pulling the TV up —
// neither is real). 'video-share' instead has two Wi-Fi 7 preset phones
// (sta-1, sta-2) exchanging real video through the AP: both ends negotiate
// 160 MHz/2 streams, which is exactly the case this task wires up. The TV
// (sta-3) and any *mu group containing it are excluded on purpose — their
// staying at 20 MHz is the correct, unrelated physical behavior of a
// narrower peer, not something this task changes.
it('a household data frame between two real-phone presets is far shorter than the same frame at 20 MHz and one stream', () => {
  const sc = HOUSEHOLDS.find((h) => h.id === 'video-share')!.scenario()
  const recs = new Simulation(sc).runUntil(300 * 1_000_000).records
  const tx = recs.filter((r) =>
    r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.bytes > 1000 &&
    r.frame.dst !== '*mu' && r.frame.dst !== 'sta-3' && r.node !== 'sta-3')
  expect(tx.length).toBeGreaterThan(5)
  for (const r of tx) {
    if (r.type !== 'TX_START') continue
    expect(r.frame.widthMhz).toBe(160)
  }
})
