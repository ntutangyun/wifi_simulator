import { describe, it, expect } from 'vitest'
import { Channel, type PhyListener } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { DcfMac } from '../../src/engine/mac'
import { mcsForRssi } from '../../src/engine/phy'
import { RateControl } from '../../src/engine/rate'
import { Rng } from '../../src/engine/rng'
import type { Msdu } from '../../src/engine/traffic'
import { makeEmitter, type TLRecord } from '../../src/model/records'

const MS = 1_000_000

/**
 * A purpose-built 1-AP/2-STA BSS, modelled on the stream-fitting harness in
 * mumimo.test.ts: full control over the per-link RSSI table, plus a third
 * "jammer" radio that exists only to interfere. `sta-1` sits at -25 dBm from
 * the AP with nothing overlapping it — it decodes every DL MU PPDU. `sta-2`
 * sits at -55 dBm from the AP (a real ceiling of MCS 4 at 160 MHz, signal
 * strength alone would allow real throughput) but a jammer sits at -60 dBm
 * from `sta-2` only (negligible everywhere else), continuously transmitting
 * unrelated frames — enough interference that `sta-2`'s SINR (~5 dB) never
 * clears even MCS 0's decode threshold (~22 dB at this width). So `sta-2`
 * never returns a BlockAck: every DL MU round that includes it is a real,
 * physically-caused failure for its part, exactly the shape lesson 18
 * describes for a single-user link — reproduced here inside a multi-user
 * PPDU to isolate `resolveDlMu`'s per-member `onTxOutcome` reporting
 * (mac.ts, the loop over `mu.parts`) from everything else that could move a
 * rate.
 *
 * Both stations are always MU-MIMO-eligible at 2 streams each (the AP has
 * 4), so they group together on every DL MU round for as long as both have
 * backlog.
 */
function run(): { recs: TLRecord[] } {
  const ids = ['ap', 'sta-1', 'sta-2']
  const q = new EventQueue()
  let now = 0
  const table = new Map<string, Map<string, number>>()
  const setLink = (a: string, b: string, d: number): void => {
    if (!table.has(a)) table.set(a, new Map())
    table.get(a)!.set(b, d)
  }
  setLink('ap', 'sta-1', -25); setLink('sta-1', 'ap', -25)
  setLink('ap', 'sta-2', -55); setLink('sta-2', 'ap', -55)
  setLink('sta-1', 'sta-2', -200); setLink('sta-2', 'sta-1', -200)
  setLink('jammer', 'sta-2', -60)
  setLink('jammer', 'sta-1', -200)
  setLink('jammer', 'ap', -200)

  const records: TLRecord[] = []
  const emit = makeEmitter((r) => records.push(r))
  const ch = new Channel(q, () => now, table, emit)
  const root = new Rng(11)

  const rate = new RateControl()
  const WIDTH = 160
  const apCfg = {
    rtsThresholdBytes: 3000,
    edca: false, txop: false, isAp: true,
    modeForPeer: () => 'eht' as const,
    mcsForPeer: (peer: string) => rate.mcsFor(peer, mcsForRssi('eht', table.get('ap')!.get(peer)!, undefined, WIDTH)),
    widthForPeer: () => WIDTH,
    nssForPeer: () => 2,
    ampduWith: () => true,
    ofdmaWith: () => true,
    mumimoWith: () => true,
    ownNss: () => 4,
    onTxOutcome: (peer: string, ok: boolean) => { if (ok) rate.onSuccess(peer); else rate.onFailure(peer) },
  }
  const staCfg = {
    rtsThresholdBytes: 3000,
    edca: false, txop: false, isAp: false,
    modeForPeer: () => 'eht' as const,
    mcsForPeer: () => 0,
    widthForPeer: () => WIDTH,
    nssForPeer: () => 2,
    ampduWith: () => true,
    ofdmaWith: () => true,
    mumimoWith: () => true,
    ownNss: () => 2,
  }
  let apMac: DcfMac | undefined
  ids.forEach((id, i) => {
    const mac = new DcfMac(id, q, () => now, ch, root.fork(i + 1), emit, id === 'ap' ? apCfg : staCfg)
    ch.register(id, mac)
    if (id === 'ap') apMac = mac
  })

  // The jammer is a transmit-only radio: it never receives, so its listener
  // callbacks are no-ops. It fires continuous back-to-back bursts so that
  // every AP transmission is guaranteed to overlap one.
  const jammerListener: PhyListener = { onCcaBusy: () => {}, onCcaIdle: () => {}, onRxStart: () => {}, onRxOk: () => {}, onRxCorrupt: () => {} }
  ch.register('jammer', jammerListener)
  const JAM_NS = 30_000
  const jam = (): void => {
    ch.startTx('jammer', { kind: 'data', src: 'jammer', dst: 'nobody', bytes: 100, mbps: 6, txTimeNs: JAM_NS, durationFieldNs: 0 })
    q.schedule(now + JAM_NS, jam, 2) // phase 2: after this burst's own endTx (phase 1) frees the radio
  }
  jam()

  let mid = 1
  const msdu = (dst: string): Msdu => ({ id: mid++, bytes: 1400, src: 'ap', dst, bornNs: 0, ac: 1 })
  // sta-1 never fails, so it needs a real supply — and every DL MU round can
  // aggregate up to 64 MSDUs per member, so a handful of rounds can drain a
  // small supply fast. sta-2 never succeeds either, so its whole backlog
  // (plus whatever collateral drops the shared AC's retry-limit reset costs
  // sta-1) needs the same generous margin.
  for (let i = 0; i < 5000; i++) apMac!.enqueue(msdu('sta-1'), 1)
  for (let i = 0; i < 2000; i++) apMac!.enqueue(msdu('sta-2'), 1)

  const horizon = 200 * MS
  for (;;) {
    const pt = q.peekTime()
    if (pt === null || pt > horizon) break
    const ev = q.pop()!
    now = ev.t
    ev.fn()
  }
  return { recs: records }
}

describe('a multi-user downlink reports each member’s outcome, so its rate adapts', () => {
  it('a lossy member’s modulation steps down; a healthy member holds its ceiling', () => {
    const { recs } = run()
    const mu = recs.filter((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.muParts !== undefined)
    expect(mu.length).toBeGreaterThan(20)

    const mcsSeqFor = (dst: string): number[] =>
      mu.flatMap((r) => (r.type === 'TX_START' ? (r.frame.muParts ?? []).filter((p) => p.dst === dst).map((p) => p.mcs) : []))

    const strong = mcsSeqFor('sta-1')
    const weak = mcsSeqFor('sta-2')
    expect(strong.length).toBeGreaterThan(20)
    expect(weak.length).toBeGreaterThan(20)

    // The healthy member never fails, so it is never told to step down — it
    // sits at its ceiling (MCS 13 at -25 dBm / 160 MHz) for the entire run.
    expect(new Set(strong).size).toBe(1)
    expect(strong[0]).toBe(13)

    // The lossy member's ceiling is MCS 4 (signal strength alone would allow
    // real throughput), but the jammer means it never actually decodes at
    // any MCS. Two failures in a row step it down one MCS (src/engine/rate.ts),
    // so a member whose multi-user outcomes are now reported must visibly
    // descend from its ceiling and — given this many rounds — bottom out.
    expect(weak[0]).toBe(4)
    expect(weak[weak.length - 1]).toBe(0)
    // Monotonically non-increasing: it never climbs back, because it never succeeds.
    for (let i = 1; i < weak.length; i++) expect(weak[i]).toBeLessThanOrEqual(weak[i - 1])
    // And it actually steps, rather than falling straight to the floor on
    // the very first pair of failures.
    expect(new Set(weak)).toEqual(new Set([4, 3, 2, 1, 0]))
  })
})
