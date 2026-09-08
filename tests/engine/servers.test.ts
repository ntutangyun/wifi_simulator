import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { defaultScenario } from '../../src/model/scenario'
import { applyRecord, initViewState } from '../../src/model/view'

const MS = 1_000_000

/** The default house with the TV replaced by a phone gaming on the 25 ms game server. */
function gamer() {
  const sc = defaultScenario()
  sc.nodes[1].profiles = ['gaming']
  sc.nodes[2].profiles = ['idle']
  return sc
}

describe('a station gaming against a cloud server', () => {
  const sc = gamer()
  const recs = new Simulation(sc).runUntil(600 * MS).records
  const vs = initViewState(sc)
  for (const r of recs) applyRecord(vs, r)

  it('its uplink ticks reach the server half an RTT after the AP acknowledges them', () => {
    const rx = recs.filter((r) => r.type === 'WAN_RX')
    expect(rx.length).toBeGreaterThan(20)
    for (const r of rx) {
      if (r.type !== 'WAN_RX') continue
      expect(r.server).toBe('srv-game')
      expect(r.t - r.sentNs).toBeGreaterThanOrEqual(12_500_000)
      expect(r.t - r.sentNs).toBeLessThanOrEqual(12_500_000 + 1_500_000) // + half the 3 ms jitter
      // the frame was acknowledged at the station before it left for the server
      expect(recs.some((x) => x.type === 'DEQUEUE' && x.node === 'sta-1' && x.msduId === r.msduId && x.t === r.sentNs)).toBe(true)
    }
  })

  it('state updates enter the AP half an RTT after the server sends them', () => {
    const tx = recs.filter((r) => r.type === 'WAN_TX' && r.arriveNs <= 600 * MS) // later ones are still in the air
    expect(tx.length).toBeGreaterThan(20)
    for (const r of tx) {
      if (r.type !== 'WAN_TX') continue
      const enq = recs.find((x) => x.type === 'ENQUEUE' && x.node === 'ap' && x.msduId === r.msduId)
      expect(enq?.t).toBe(r.arriveNs)
      expect(r.arriveNs - r.t).toBeGreaterThanOrEqual(12_500_000)
      expect(r.arriveNs - r.t).toBeLessThanOrEqual(14_000_000)
    }
  })

  it('game frames are AC_BE with the router’s game acceleration off, AC_VI with it on', () => {
    const acOf = (r: typeof recs) => new Set(r.filter((x) => x.type === 'ENQUEUE' && x.node === 'sta-1').map((x) => x.type === 'ENQUEUE' ? x.ac : -1))
    expect(acOf(recs)).toEqual(new Set([1]))
    const on = gamer()
    on.nodes[0].gameAccel = true
    const recsOn = new Simulation(on).runUntil(200 * MS).records
    expect(acOf(recsOn)).toEqual(new Set([2]))
  })

  it('the phone’s RTT is the ping round trip: WAN RTT plus a little Wi-Fi', () => {
    const rtt = vs.nodes['sta-1'].stats.appRtt
    expect(rtt.n).toBeGreaterThanOrEqual(2) // 4 pings/s over 600 ms, minus the ones still in flight
    const meanMs = rtt.sumNs / rtt.n / 1e6
    expect(meanMs).toBeGreaterThan(25 + 2) // WAN + server processing
    expect(meanMs).toBeLessThan(25 + 2 + 3 + 3) // + jitter + a little Wi-Fi
    expect(vs.nodes['sta-1'].stats.appRttServer).toBe('srv-game')
    expect(vs.servers['srv-game'].bytesUp).toBeGreaterThan(0)
    expect(vs.servers['srv-game'].bytesDown).toBeGreaterThan(0)
  })
})
