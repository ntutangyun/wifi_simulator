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

  it('its uplink ticks reach the server half an RTT after the AP receives them', () => {
    const rx = recs.filter((r) => r.type === 'WAN_RX')
    expect(rx.length).toBeGreaterThan(20)
    for (const r of rx) {
      if (r.type !== 'WAN_RX') continue
      expect(r.server).toBe('srv-game')
      expect(r.t - r.sentNs).toBeGreaterThanOrEqual(12_500_000)
      expect(r.t - r.sentNs).toBeLessThanOrEqual(12_500_000 + 1_500_000) // + half the 3 ms jitter
      // 2026-11-11: the AP hands the MSDU to the distribution system when it receives it — the
      // end of the station's data frame — not when the station hears the Ack (§10.3.2.14.3)
      expect(recs.some((x) => x.type === 'RX_OK' && x.node === 'ap' && x.from === 'sta-1' && x.t === r.sentNs
        && (x.frame.ampdu?.msduIds ?? [x.frame.msduId]).includes(r.msduId))).toBe(true)
    }
  })

  it('state updates enter the AP half an RTT after the server sends them', () => {
    const tx = recs.filter((r) => r.type === 'WAN_TX' && r.arriveNs <= 600 * MS) // later ones are still in the air
    expect(tx.length).toBeGreaterThan(8) // 65 ms state ticks plus 250 ms pings in 600 ms
    for (const r of tx) {
      if (r.type !== 'WAN_TX') continue
      const enq = recs.find((x) => x.type === 'ENQUEUE' && x.node === 'ap' && x.msduId === r.msduId)
      expect(enq?.t).toBe(r.arriveNs)
      expect(r.arriveNs - r.t).toBeGreaterThanOrEqual(12_500_000)
      expect(r.arriveNs - r.t).toBeLessThanOrEqual(14_000_000)
    }
  })

  // 2026-11-11 (W7b): the router game-mode switch is gone (no such switch in IEEE Std 802.11-2024;
  // MSCS §11.25.3 not implemented). A game marks UP 0, so its frames are AC_BE (Table 10-1), and a
  // plan saved with the old boolean on the AP is stripped on load and runs the same.
  it('game frames are AC_BE (UP 0, Table 10-1), with or without a saved game-mode boolean', () => {
    const acOf = (r: typeof recs) => new Set(r.filter((x) => x.type === 'ENQUEUE' && x.node === 'sta-1').map((x) => x.type === 'ENQUEUE' ? x.ac : -1))
    expect(acOf(recs)).toEqual(new Set([1]))
    const on = gamer()
    ;(on.nodes[0] as typeof on.nodes[0] & { gameAccel?: boolean }).gameAccel = true
    const recsOn = new Simulation(on).runUntil(200 * MS).records
    expect(acOf(recsOn)).toEqual(new Set([1]))
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
