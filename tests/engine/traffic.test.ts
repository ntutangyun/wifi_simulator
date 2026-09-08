import { describe, it, expect, beforeEach } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { TrafficSource, resetMsduIds, type Msdu, type ServerLink } from '../../src/engine/traffic'
import type { ProfileId } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

function collect(profile: ProfileId, untilNs: number, seed = 1, gameAccel = false) {
  const q = new EventQueue()
  let now = 0
  const out: { node: string; msdu: Msdu }[] = []
  const src = new TrafficSource(q, () => now, new Rng(seed), 'sta-1', 'ap', profile, (node, msdu) =>
    out.push({ node, msdu }), { gameAccel })
  src.start()
  for (;;) {
    const t = q.peekTime()
    if (t === null || t > untilNs) break
    const e = q.pop()!
    now = e.t
    e.fn()
  }
  return out
}

beforeEach(resetMsduIds)

describe('traffic profiles', () => {
  it('video: ~15 Mbps DL at the AP', () => {
    const out = collect('video', 100_000_000) // 100 ms
    expect(out.length).toBeGreaterThanOrEqual(115)
    expect(out.length).toBeLessThanOrEqual(140)
    expect(out.every((o) => o.node === 'ap' && o.msdu.bytes === 1400 && o.msdu.dst === 'sta-1')).toBe(true)
  })

  it('backup: two 50-frame UL bursts within 100 ms', () => {
    const out = collect('backup', 100_000_000)
    expect(out.length).toBe(100)
    expect(out.every((o) => o.node === 'sta-1' && o.msdu.bytes === 1500 && o.msdu.dst === 'ap')).toBe(true)
  })

  it('saturated: 20 frames at t=0', () => {
    const out = collect('saturated', 1)
    expect(out.length).toBe(20)
  })

  it('idle: nothing', () => {
    expect(collect('idle', 1_000_000_000).length).toBe(0)
  })

  it('is deterministic for a given seed', () => {
    resetMsduIds()
    const a = collect('video', 50_000_000, 7).map((o) => o.msdu.bornNs)
    resetMsduIds()
    const b = collect('video', 50_000_000, 7).map((o) => o.msdu.bornNs)
    expect(a).toEqual(b)
  })
})

describe('each MSDU carries the access category of the stream that made it', () => {
  it('voice → AC_VO on both directions, backup → AC_BK', () => {
    const voice = collect('voice', 100_000_000)
    expect(voice.length).toBeGreaterThan(0)
    expect(voice.every((o) => o.msdu.ac === 3)).toBe(true)
    const backup = collect('backup', 100_000_000)
    expect(backup.every((o) => o.msdu.ac === 0)).toBe(true)
  })
})

describe('the think-time profiles are paced in seconds, not milliseconds', () => {
  const S = 1_000_000_000

  it('browsing: the first page request comes after 2–8 s of think time', () => {
    const out = collect('browsing', 10 * S)
    const requests = out.filter((o) => o.node === 'sta-1')
    expect(requests.length).toBeGreaterThanOrEqual(1)
    expect(requests[0].msdu.bornNs).toBeGreaterThanOrEqual(2 * S)
    expect(requests[0].msdu.bornNs).toBeLessThanOrEqual(8 * S)
    // at most one page per 2 s, at most 80 frames per page
    expect(requests.length).toBeLessThanOrEqual(5)
    expect(out.filter((o) => o.node === 'ap').length).toBeLessThanOrEqual(80 * requests.length)
  })

  it('iot: one reading every 1–5 s', () => {
    const out = collect('iot', 10 * S)
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out.length).toBeLessThanOrEqual(10)
    expect(out[0].msdu.bornNs).toBeGreaterThanOrEqual(1 * S)
    for (let i = 1; i < out.length; i++) {
      const gap = out[i].msdu.bornNs - out[i - 1].msdu.bornNs
      expect(gap).toBeGreaterThanOrEqual(1 * S)
      expect(gap).toBeLessThanOrEqual(5 * S)
    }
  })
})

describe('gaming: a 60 Hz two-way stream of small frames in AC_VI', () => {
  it('sends ~60 uplink 100 B and ~60 downlink 300 B frames per second', () => {
    const out = collect('gaming', 1_000_000_000)
    const ul = out.filter((o) => o.node === 'sta-1')
    const dl = out.filter((o) => o.node === 'ap')
    expect(ul.length).toBeGreaterThanOrEqual(55)
    expect(ul.length).toBeLessThanOrEqual(65)
    expect(dl.length).toBeGreaterThanOrEqual(55)
    expect(dl.length).toBeLessThanOrEqual(65)
    expect(ul.every((o) => o.msdu.bytes === 100 && o.msdu.dst === 'ap')).toBe(true)
    expect(dl.every((o) => o.msdu.bytes === 300 && o.msdu.dst === 'sta-1')).toBe(true)
  })

  it('is unmarked best effort (AC_BE) unless the router’s game acceleration marks it AC_VI', () => {
    expect(collect('gaming', 200_000_000).every((o) => o.msdu.ac === 1)).toBe(true)
    expect(collect('gaming', 200_000_000, 1, true).every((o) => o.msdu.ac === 2)).toBe(true)
  })

  it('never goes quiet: no gap between ticks longer than 25 ms', () => {
    const ticks = collect('gaming', 1_000_000_000).filter((o) => o.node === 'sta-1').map((o) => o.msdu.bornNs)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeLessThanOrEqual(25_000_000)
  })
})

describe('streams that talk to a cloud server', () => {
  const S = 1_000_000_000
  const WAN = 15_000_000 // one-way 15 ms (30 ms RTT)
  type Wan = Extract<TLRecord, { type: 'WAN_TX' | 'WAN_RX' }>

  function withServer(profile: ProfileId, untilNs: number, drive?: (src: TrafficSource, run: (to: number) => void, out: { node: string; msdu: Msdu }[]) => void, link: Partial<ServerLink> = {}) {
    const q = new EventQueue()
    let now = 0
    const out: { node: string; msdu: Msdu }[] = []
    const wan: Wan[] = []
    const src = new TrafficSource(q, () => now, new Rng(1), 'sta-1', 'ap', profile, (node, msdu) => out.push({ node, msdu }), {
      server: { id: 'srv', wanNs: WAN, jitterNs: 0, processNs: 0, ...link },
      emit: (r) => { if (r.type === 'WAN_TX' || r.type === 'WAN_RX') wan.push({ ...r, seq: 0 } as Wan) },
    })
    const run = (to: number) => {
      for (;;) {
        const t = q.peekTime()
        if (t === null || t > to) break
        const e = q.pop()!
        now = e.t
        e.fn()
      }
      now = to
    }
    src.start()
    if (drive) drive(src, run, out)
    else run(untilNs)
    return { out, wan }
  }

  it('video: every downlink frame enters the AP one WAN delay after the server sent it', () => {
    const { out, wan } = withServer('video', 100_000_000)
    const dl = out.filter((o) => o.node === 'ap' && o.msdu.bytes === 1400)
    expect(dl.length).toBeGreaterThanOrEqual(90) // ~15 ms of the 100 ms window is WAN
    expect(dl[0].msdu.bornNs).toBeGreaterThanOrEqual(747_000 + WAN)
    const tx = wan.filter((w) => w.type === 'WAN_TX')
    expect(tx.length).toBeGreaterThanOrEqual(dl.length) // the last sends are still crossing the WAN
    const firstTx = tx.find((w) => w.type === 'WAN_TX' && w.bytes === 1400)!
    expect(dl[0].msdu.bornNs - firstTx.t).toBe(WAN)
    expect(dl.every((o) => o.msdu.server === 'srv' && o.msdu.rttFromNs === undefined)).toBe(true)
  })

  it('browsing: the page comes only after the request has crossed the WAN', () => {
    const { wan } = withServer('browsing', 0, (src, run, out) => {
      run(9 * S) // the first request (2–8 s think time) has been queued at the station
      const req = out.find((o) => o.node === 'sta-1' && o.msdu.bytes === 300)!
      expect(out.filter((o) => o.node === 'ap')).toHaveLength(0)
      const delivered = req.msdu.bornNs + 3_000_000 // Wi-Fi took 3 ms
      src.onUplinkDelivered(req.msdu.id, delivered)
      run(delivered + 2 * S)
      const page = out.filter((o) => o.node === 'ap')
      expect(page.length).toBeGreaterThanOrEqual(20)
      expect(page[0].msdu.bornNs).toBeGreaterThanOrEqual(delivered + 2 * WAN)
      expect(page.every((o) => o.msdu.rttFromNs === undefined)).toBe(true) // page load time is not an RTT
    })
    expect(wan.filter((w) => w.type === 'WAN_RX')).toHaveLength(1)
  })

  it('voice: the far end echoes each packet that reaches the call server', () => {
    withServer('voice', 0, (src, run, out) => {
      run(100_000_000)
      const ul = out.filter((o) => o.node === 'sta-1' && o.msdu.bytes === 200)
      expect(ul.length).toBeGreaterThanOrEqual(4)
      expect(out.filter((o) => o.node === 'ap')).toHaveLength(0)
      src.onUplinkDelivered(ul[0].msdu.id, ul[0].msdu.bornNs + 2_000_000)
      run(200_000_000)
      const dl = out.filter((o) => o.node === 'ap')
      expect(dl).toHaveLength(1)
      expect(dl[0].msdu.bytes).toBe(200)
      expect(dl[0].msdu.rttFromNs).toBeUndefined()
      expect(dl[0].msdu.bornNs).toBe(ul[0].msdu.bornNs + 2_000_000 + 2 * WAN)
    })
  })

  it('gaming: the server ticks on its own clock and its state updates never carry an RTT stamp', () => {
    withServer('gaming', 0, (src, run, out) => {
      run(100_000_000)
      const ticks = out.filter((o) => o.node === 'sta-1' && o.msdu.bytes === 100)
      const dl = out.filter((o) => o.node === 'ap')
      expect(ticks.length).toBeGreaterThanOrEqual(5)
      expect(dl.length).toBeGreaterThanOrEqual(4) // state updates flow without any input
      expect(dl.every((o) => o.msdu.rttFromNs === undefined)).toBe(true)
      src.onUplinkDelivered(ticks[2].msdu.id, ticks[2].msdu.bornNs + 1_000_000)
      run(200_000_000)
      expect(out.filter((o) => o.node === 'ap' && o.msdu.rttFromNs !== undefined)).toHaveLength(0)
    })
  })

  it('every cloud stream pings its server four times a second; the echo closes the RTT', () => {
    withServer('video', 0, (src, run, out) => {
      run(2 * S)
      const pings = out.filter((o) => o.node === 'sta-1')
      expect(pings.length).toBeGreaterThanOrEqual(6)
      expect(pings.length).toBeLessThanOrEqual(9)
      expect(pings.every((o) => o.msdu.bytes === 64 && o.msdu.ac === 2)).toBe(true) // same AC as the stream
      for (let i = 1; i < pings.length; i++) {
        const gap = pings[i].msdu.bornNs - pings[i - 1].msdu.bornNs
        expect(gap).toBeGreaterThanOrEqual(200_000_000)
        expect(gap).toBeLessThanOrEqual(300_000_000)
      }
      const echoesBefore = out.filter((o) => o.node === 'ap' && o.msdu.bytes === 64)
      expect(echoesBefore).toHaveLength(0)
      const ping = pings[1]
      const delivered = ping.msdu.bornNs + 2_500_000
      src.onUplinkDelivered(ping.msdu.id, delivered)
      run(2 * S + 200_000_000)
      const echo = out.filter((o) => o.node === 'ap' && o.msdu.bytes === 64)
      expect(echo).toHaveLength(1)
      expect(echo[0].msdu.rttFromNs).toBe(ping.msdu.bornNs)
      expect(echo[0].msdu.bornNs).toBe(delivered + 2 * WAN)
    })
  })

  it('a real server: WAN jitter spreads each one-way delay, processing time delays the answer', () => {
    const JIT = 6_000_000 // ±3 ms on the RTT → each direction adds U(0, 3 ms)
    const PROC = 2_000_000
    const { out, wan } = withServer('video', 300_000_000, undefined, { jitterNs: JIT, processNs: PROC })
    const dl = out.filter((o) => o.node === 'ap' && o.msdu.bytes === 1400)
    const tx = wan.filter((w): w is Extract<Wan, { type: 'WAN_TX' }> => w.type === 'WAN_TX' && w.bytes === 1400)
    const delays = dl.map((o) => o.msdu.bornNs - tx.find((w) => w.msduId === o.msdu.id)!.t)
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(WAN)
    expect(Math.max(...delays)).toBeLessThanOrEqual(WAN + JIT / 2)
    expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThan(JIT / 4) // it really varies
    // the echo: up (WAN + jitter), processing, down (WAN + jitter)
    withServer('video', 0, (src, run, out) => {
      run(1_000_000_000)
      const ping = out.find((o) => o.node === 'sta-1')!
      const delivered = ping.msdu.bornNs + 1_000_000
      src.onUplinkDelivered(ping.msdu.id, delivered)
      run(1_500_000_000)
      const echo = out.find((o) => o.node === 'ap' && o.msdu.bytes === 64)!
      expect(echo.msdu.bornNs).toBeGreaterThanOrEqual(delivered + 2 * WAN + PROC)
      expect(echo.msdu.bornNs).toBeLessThanOrEqual(delivered + 2 * WAN + PROC + JIT)
    }, { jitterNs: JIT, processNs: PROC })
  })

  it('without a server there are no pings', () => {
    expect(collect('video', 2 * S).filter((o) => o.node === 'sta-1')).toHaveLength(0)
  })

  it('without a server nothing changes: no WAN records, no rttFromNs, voice stays a local 20 ms clock', () => {
    const out = collect('voice', 100_000_000)
    expect(out.filter((o) => o.node === 'ap').length).toBeGreaterThanOrEqual(4)
    expect(out.every((o) => o.msdu.rttFromNs === undefined && o.msdu.server === undefined)).toBe(true)
  })
})
