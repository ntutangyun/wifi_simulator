/**
 * The medium under a mono-static backscatter round: a downlink PPDU that radiates two different
 * powers, a tag that lives off the first of them, and a reply the reader hears against the
 * leakage of its own carrier.
 *
 * Every boundary here is the closed form in `ampBs.ts` — `activationReachM` and `monoReachM` —
 * checked against what the channel actually does, one side and then the other.
 */
import { describe, expect, it } from 'vitest'
import {
  Channel, bsDataEndNs, txDbmAt, type BsGeometry, type PhyListener, type RadioOpts,
} from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { ampRespFrame, ampTriggerFrame, AMP_BROADCAST } from '../../src/engine/amp'
import {
  ampBsReplyFrame, ampRfidFrame, bstNs, activationReachM, monoReachM,
  type AmpBsUlKbps, type Gen2Reply,
} from '../../src/engine/ampBs'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import type { Wall } from '../../src/model/scenario'
import type { Ns, Vec3 } from '../../src/model/types'

const SIGNAL_EXT_NS = 6_000
const T1_NS = 16_000

interface NodeSpec { id: string; pos: Vec3; opts?: RadioOpts }

/** A room of nodes at known coordinates: Wi-Fi links are the explicit `links` matrix (the engine's
 * own law, as today), backscatter links are the geometry the channel measures for itself. */
function world(
  nodes: NodeSpec[], links: Record<string, number> = {}, walls: Wall[] = [],
  txPowerDbm: Record<string, number> = {},
) {
  const q = new EventQueue()
  let now = 0
  const ids = nodes.map((n) => n.id)
  const table = new Map(ids.map((tx) => [
    tx, new Map(ids.filter((rx) => rx !== tx).map((rx) => [rx, links[`${tx}>${rx}`] ?? -200])),
  ]))
  const records: TLRecord[] = []
  const geo: BsGeometry = {
    posOf: (id) => nodes.find((n) => n.id === id)!.pos,
    walls,
    // The EIRP the link table was built from: what a PPDU carrying a power of its own is
    // measured against. 20 dBm is the AP of every scene in this file unless stated.
    txPowerOf: (id) => txPowerDbm[id] ?? 20,
  }
  const ch = new Channel(q, () => now, table, makeEmitter((r) => records.push(r)), undefined, geo)
  const heard: Record<string, { what: string; t: Ns }[]> = {}
  for (const n of nodes) {
    heard[n.id] = []
    const l: PhyListener = {
      onCcaBusy() {}, onCcaIdle() {}, onRxStart() {}, onRxCorrupt() {},
      onRxOk(t, f, from) { heard[n.id].push({ what: `${f.kind}:${from}`, t }) },
    }
    ch.register(n.id, l, n.opts)
  }
  return {
    ch, records, heard,
    run(t: Ns) {
      for (;;) {
        const pt = q.peekTime()
        if (pt === null || pt > t) break
        const e = q.pop()!
        now = e.t
        e.fn()
      }
      now = t
    },
    at(t: Ns, fn: () => void) { q.schedule(t, fn) },
    recs<T extends TLRecord['type']>(type: T, node?: string) {
      return records.filter((r) => r.type === type && (node === undefined || (r as { node?: string }).node === node)) as Extract<TLRecord, { type: T }>[]
    },
  }
}

const at = (x: number): Vec3 => ({ x, y: 0, z: 0 })

const query = (chargeDbm = 10, bsDbm = 0, ulKbps: AmpBsUlKbps = 250, wupNs: Ns = 1_000_000): FrameDesc =>
  ampRfidFrame({
    src: 'ap', dst: AMP_BROADCAST, cmd: 'query', session: 1, q: 2, slot: 1, ulKbps,
    wupNs, bstNs: bstNs('rn16', ulKbps), chargeDbm, bsDbm, signalExtNs: SIGNAL_EXT_NS,
  })

const reply = (src: string, kind: Gen2Reply = 'rn16', kbps: AmpBsUlKbps = 250): FrameDesc =>
  ampBsReplyFrame({ src, dst: 'ap', reply: kind, kbps, slot: 1, rn16: 0x1234 })

const bsTag: RadioOpts = { kind: 'bsTag', cca: false }
const reader: RadioOpts = { ampCapable: true }

/** The instant the command ends and the BST-Excitation starts, for a Query with a 1 ms WUP. */
const DATA_END_NS = 32_000 + 1_000_000 + 16_000 + 320_000

describe('a downlink RFID PPDU on the medium', () => {
  it('radiates the charge power through its command and the BS power through its excitation', () => {
    const f = query(10, 0)
    expect(bsDataEndNs(f)).toBe(DATA_END_NS)
    expect(txDbmAt(f, 0)).toBe(10)
    expect(txDbmAt(f, DATA_END_NS - 1)).toBe(10)
    expect(txDbmAt(f, DATA_END_NS)).toBe(0)
    expect(txDbmAt(f, f.txTimeNs - 1)).toBe(0)
    // 1 516.4 µs with a 1 ms WUP, and the excitation is the 142.4 µs before the signal extension.
    expect(f.txTimeNs).toBe(1_516_400)
    expect(f.txTimeNs - SIGNAL_EXT_NS - DATA_END_NS).toBe(142_400)
    // Nothing else declares a power of its own.
    expect(txDbmAt(reply('t'), 0)).toBeNull()
    expect(bsDataEndNs(reply('t'))).toBeNull()
  })

  it('is heard by a Wi-Fi station at the power it radiates, not at the AP’s own EIRP', () => {
    // The link table is built from a node's `txPowerDbm` — 20 dBm for this reader. A downlink
    // RFID PPDU does not radiate that: it charges at `chargeDbm`, 10 dBm by default, which is
    // the loudest it ever gets. So a station hears a Query exactly 10 dB under anything else
    // the same AP sends, and its preamble-detect boundary (−82 dBm) moves by exactly that.
    const acquires = (frame: FrameDesc, linkDbm: number): boolean => {
      const w = world(
        [{ id: 'ap', pos: at(0), opts: reader }, { id: 'sta', pos: at(3) }],
        { 'ap>sta': linkDbm }, [], { ap: 20 },
      )
      w.at(0, () => w.ch.startTx('ap', frame))
      w.run(3_000_000)
      return w.recs('RX_START', 'sta').length > 0
    }
    const cts = (): FrameDesc =>
      ({ kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000 })
    expect(acquires(cts(), -82)).toBe(true)
    expect(acquires(cts(), -82.001)).toBe(false)
    expect(acquires(query(10, 0), -72)).toBe(true)
    expect(acquires(query(10, 0), -72.001)).toBe(false)
    // …and a reader that charges at its full 20 dBm is heard like any other PPDU it sends.
    expect(acquires(query(20, 0), -82)).toBe(true)
    expect(acquires(query(20, 0), -82.001)).toBe(false)
  })

  it('a Wi-Fi station defers for the whole PPDU, excitation included', () => {
    const w = world([{ id: 'ap', pos: at(0), opts: reader }, { id: 'sta', pos: at(3) }], { 'ap>sta': -60 })
    const f = query()
    w.at(0, () => w.ch.startTx('ap', f))
    w.run(3_000_000)
    expect(w.heard.sta.map((h) => h.what)).toEqual(['ampRfid:ap'])
    const busy = w.recs('CCA_BUSY', 'sta')
    const idle = w.recs('CCA_IDLE', 'sta')
    expect(busy.length).toBe(1)
    expect(busy[0].cause).toBe('preamble')
    expect(idle.map((r) => r.t)).toEqual([f.txTimeNs])
  })
})

describe('a backscatter tag under the excitation', () => {
  it('boots and decodes the Query at 0.3 m and is unpowered at 0.35 m', () => {
    // activationReachM(10 dBm) = 0.309 m: 0.30 is inside it, 0.35 outside.
    expect(activationReachM(10)).toBeCloseTo(0.3092, 3)
    const w = world([
      { id: 'ap', pos: at(0), opts: reader },
      { id: 'near', pos: at(0.3), opts: bsTag },
      { id: 'far', pos: at(0.35), opts: bsTag },
    ])
    w.at(0, () => w.ch.startTx('ap', query(10, 0)))
    w.run(3_000_000)
    expect(w.heard.near.map((h) => h.what)).toEqual(['ampRfid:ap'])
    expect(w.heard.far).toEqual([])
    // The command is decoded where the command ends, not where the PPDU ends: the tag has to
    // answer T1 into the excitation that follows.
    expect(w.heard.near[0].t).toBe(DATA_END_NS)
  })

  it('a reader turned up to 20 dBm wakes a tag at 0.9 m that it still could never hear', () => {
    expect(activationReachM(20)).toBeCloseTo(0.9777, 3)
    const w = world([
      { id: 'ap', pos: at(0), opts: reader },
      { id: 'tag', pos: at(0.9), opts: bsTag },
    ])
    w.at(0, () => w.ch.startTx('ap', query(20, 10)))
    w.at(DATA_END_NS + T1_NS, () => w.ch.startTx('tag', reply('tag')))
    w.run(3_000_000)
    expect(w.heard.tag.map((h) => h.what)).toEqual(['ampRfid:ap'])
    expect(w.heard.ap).toEqual([]) // 0.9 m ≫ monoReachM = 0.328 m
  })

  it('hears nothing but a downlink RFID PPDU', () => {
    const w = world([
      { id: 'ap', pos: at(0), opts: reader },
      { id: 'tag', pos: at(0.1), opts: bsTag },
      { id: 'other', pos: at(0.1), opts: bsTag },
    ], { 'ap>tag': -40, 'other>tag': -40 })
    const trigger = ampTriggerFrame({
      src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000,
      acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: SIGNAL_EXT_NS,
    })
    w.at(0, () => w.ch.startTx('ap', trigger))
    w.at(3_000_000, () => {
      const r = reply('other')
      r.amp!.bs!.incidentDbm = 0
      w.ch.startTx('other', r)
    })
    w.at(4_000_000, () => w.ch.startTx('ap', {
      kind: 'cts', src: 'ap', dst: 'ap', bytes: 14, mbps: 6, durationFieldNs: 0, txTimeNs: 50_000,
    }))
    w.run(5_000_000)
    expect(w.heard.tag).toEqual([])
    expect(w.recs('CCA_BUSY', 'tag')).toEqual([])
  })
})

/**
 * Drive one command and one reply T1 into its excitation, and say whether the reader heard it.
 *
 * The reply is scheduled unconditionally, whether or not that tag could have been powered: the
 * channel does not gate a reply on activation and should not, and these tests are after the
 * *reply* boundary on its own. Worth knowing which one binds in a real scene, though — at the
 * default 10 dBm charge, activation stops at 0.309 m, inside the 0.328 m the reply reaches, so a
 * tag placed at 0.327 m here would in truth never have woken up to answer.
 */
function round(
  tagM: number, opts: { chargeDbm?: number; bsDbm?: number; kbps?: AmpBsUlKbps; walls?: Wall[] } = {},
): { heard: boolean; records: TLRecord[] } {
  const kbps = opts.kbps ?? 250
  const w = world([
    { id: 'ap', pos: at(0), opts: reader },
    { id: 'tag', pos: at(tagM), opts: bsTag },
  ], {}, opts.walls ?? [])
  w.at(0, () => w.ch.startTx('ap', query(opts.chargeDbm ?? 10, opts.bsDbm ?? 0, kbps)))
  w.at(DATA_END_NS + T1_NS, () => w.ch.startTx('tag', reply('tag', 'rn16', kbps)))
  w.run(3_000_000)
  return { heard: w.heard.ap.some((h) => h.what === 'ampBsReply:tag'), records: w.records }
}

describe('a backscattered reply at the reader', () => {
  it('is heard from 0.3 m and not from 0.35 m at 250 kb/s', () => {
    expect(round(0.3).heard).toBe(true)
    expect(round(0.35).heard).toBe(false)
  })

  it('stops exactly at monoReachM — 0.328 m at 250 kb/s', () => {
    expect(monoReachM(0, 250)).toBeCloseTo(0.3275, 3)
    expect(round(0.327).heard).toBe(true)
    expect(round(0.328).heard).toBe(false)
  })

  it('reaches only 0.232 m at 1 Mb/s, where the tag must be 6 dB louder', () => {
    expect(monoReachM(0, 1000)).toBeCloseTo(0.2319, 3)
    expect(round(0.231, { kbps: 1000 }).heard).toBe(true)
    expect(round(0.233, { kbps: 1000 }).heard).toBe(false)
    expect(round(0.3, { kbps: 1000 }).heard).toBe(false)
  })

  it('does not move when the excitation goes up: the reader\'s own floor rises with it', () => {
    for (const bsDbm of [0, 10, 20]) {
      expect(round(0.327, { bsDbm }).heard).toBe(true)
      expect(round(0.328, { bsDbm }).heard).toBe(false)
      expect(round(0.231, { bsDbm, kbps: 1000 }).heard).toBe(true)
      expect(round(0.233, { bsDbm, kbps: 1000 }).heard).toBe(false)
    }
  })

  it('carries the incident excitation the channel measured, and never fails the tag for replying', () => {
    const r = round(0.3)
    expect(r.records.some((x) => x.type === 'RX_FAIL' && x.reason === 'txDuringRx')).toBe(false)
    const tx = r.records.find((x) => x.type === 'TX_START' && x.frame.kind === 'ampBsReply')
    // bsDbm 0 − bsPathLossDb(2440, 0.3) = −29.74 dBm reaching the tag.
    expect((tx as { frame: FrameDesc }).frame.amp!.bs!.incidentDbm).toBeCloseTo(-29.738, 3)
  })

  it('is ignored when it lands outside the BST-Excitation, or after the PPDU altogether', () => {
    // The last two start after the reader has stopped transmitting: nothing is being reflected
    // off anything, so an idle reader must not hear a reply however loud it claims to be.
    const f = query()
    for (const startNs of [500_000, DATA_END_NS - 1, DATA_END_NS + 142_400, f.txTimeNs + 1]) {
      const w = world([
        { id: 'ap', pos: at(0), opts: reader },
        { id: 'tag', pos: at(0.3), opts: bsTag },
      ])
      w.at(0, () => w.ch.startTx('ap', query()))
      w.at(startNs, () => {
        const r = reply('tag')
        r.amp!.bs!.incidentDbm = -29.738
        w.ch.startTx('tag', r)
      })
      w.run(3_000_000)
      expect(w.heard.ap).toEqual([])
    }
  })

  it('is never heard by a reader that is not transmitting at all, even from 0.05 m', () => {
    // 0.05 m is the path-loss clamp: −20 dBm incident, a −40 dBm reply. Against thermal noise
    // that is a 70 dB margin; against an excitation that is not on the air it is no reply at all.
    const w = world([
      { id: 'ap', pos: at(0), opts: reader },
      { id: 'tag', pos: at(0.05), opts: bsTag },
    ])
    w.at(0, () => {
      const r = reply('tag')
      r.amp!.bs!.incidentDbm = 10 - 14.176 // the 10 dBm excitation, had one been radiating
      w.ch.startTx('tag', r)
    })
    w.run(1_000_000)
    expect(w.heard.ap).toEqual([])
    expect(w.recs('RX_START', 'ap')).toEqual([])
  })

  it('must clear its SNR against Wi-Fi in the band, not only against the reader\'s leakage', () => {
    const noisy = (staDbmAtAp: number) => {
      const w = world([
        { id: 'ap', pos: at(0), opts: reader },
        { id: 'tag', pos: at(0.3), opts: bsTag },
        { id: 'sta', pos: at(4) },
      ], { 'sta>ap': staDbmAtAp })
      w.at(0, () => w.ch.startTx('ap', query()))
      // A Wi-Fi PPDU right across the excitation — what the lesson's `none` variant shows.
      w.at(DATA_END_NS - 10_000, () => w.ch.startTx('sta', {
        kind: 'data', src: 'sta', dst: 'ap', bytes: 1500, mbps: 6, durationFieldNs: 0,
        txTimeNs: 300_000,
      }))
      w.at(DATA_END_NS + T1_NS, () => w.ch.startTx('tag', reply('tag')))
      w.run(3_000_000)
      return w
    }
    // The reply at 0.3 m sits 4.5 dB over the reader's floor: −70 dBm of Wi-Fi in the band eats
    // that margin and the reply is lost, and the collision names the station that did it.
    const lost = noisy(-70)
    expect(lost.heard.ap.some((h) => h.what === 'ampBsReply:tag')).toBe(false)
    expect(lost.recs('COLLISION').some((r) => r.nodes.includes('sta') && r.nodes.includes('tag'))).toBe(true)
    // The same geometry with the station 30 dB quieter: the reply survives.
    expect(noisy(-100).heard.ap.some((h) => h.what === 'ampBsReply:tag')).toBe(true)
  })

  // Not capture: the louder reply is detected first (same-instant starts are applied strongest
  // first) and the quieter one fails the 5 dB capture test and becomes interference.
  it('two replies in one slot collide; a 6 dB louder one survives the other', () => {
    const both = (aM: number, bM: number) => {
      const w = world([
        { id: 'ap', pos: at(0), opts: reader },
        { id: 'a', pos: at(aM), opts: bsTag },
        { id: 'b', pos: at(bM), opts: bsTag },
      ])
      w.at(0, () => w.ch.startTx('ap', query()))
      w.at(DATA_END_NS + T1_NS, () => {
        w.ch.startTx('a', reply('a'))
        w.ch.startTx('b', reply('b'))
      })
      w.run(3_000_000)
      return w
    }
    const even = both(0.25, 0.25)
    expect(even.heard.ap).toEqual([])
    expect(even.recs('COLLISION').length).toBe(1)
    // 6 dB of reply power is 10^(6/40) in distance: the round trip charges twice.
    const uneven = both(0.2, 0.2 * 10 ** (6 / 40))
    expect(uneven.heard.ap.map((h) => h.what)).toEqual(['ampBsReply:a'])
  })

  it('is inaudible at a Wi-Fi station a metre from the tag', () => {
    const quiet = (staM: number) => {
      const w = world([
        { id: 'ap', pos: at(0), opts: reader },
        { id: 'tag', pos: at(0.3), opts: bsTag },
        { id: 'sta', pos: at(staM) },
      ], { 'tag>sta': -20 })
      w.at(0, () => {
        const f = reply('tag')
        f.amp!.bs!.incidentDbm = 10 - 29.739 // the excitation at 10 dBm, reaching 0.3 m
        w.ch.startTx('tag', f)
      })
      w.run(1_000_000)
      return w
    }
    // −65.9 dBm at a metre: under energy detection, and never a preamble.
    const far = quiet(1.3)
    expect(far.recs('CCA_BUSY', 'sta')).toEqual([])
    expect(far.heard.sta).toEqual([])
    // The assertion bites: 3 cm from the tag the same reply is loud enough to hold CCA busy.
    const near = quiet(0.33)
    expect(near.recs('CCA_BUSY', 'sta').map((r) => r.cause)).toEqual(['energy'])
    expect(near.heard.sta).toEqual([])
  })
})

describe('the Active Tx tier is untouched', () => {
  it('a tag still decodes a trigger at its own floor and the AP still decodes a response', () => {
    const w = world([
      { id: 'ap', pos: at(0), opts: reader },
      { id: 'tag', pos: at(3), opts: { kind: 'tag', cca: false } },
    ], { 'ap>tag': -70, 'tag>ap': -93 })
    const trigger = ampTriggerFrame({
      src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000,
      acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: SIGNAL_EXT_NS,
    })
    w.at(0, () => w.ch.startTx('ap', trigger))
    w.at(2_000_000, () => w.ch.startTx('tag', ampRespFrame('tag', 'ap', 250, 1, 0, false)))
    w.run(4_000_000)
    expect(w.heard.tag.map((h) => h.what)).toEqual(['ampTrigger:ap'])
    expect(w.heard.ap.map((h) => h.what)).toEqual(['ampResp:tag'])
    // The DL reception still resolves at the end of the PPDU, not early.
    expect(w.heard.tag[0].t).toBe(trigger.txTimeNs)
  })

  it('an Active Tx tag does not hear a mono-static command it could never sync to', () => {
    const w = world([
      { id: 'ap', pos: at(0), opts: reader },
      { id: 'tag', pos: at(0.3), opts: { kind: 'tag', cca: false } },
    ], { 'ap>tag': -40 })
    w.at(0, () => w.ch.startTx('ap', query()))
    w.run(3_000_000)
    expect(w.heard.tag).toEqual([])
    expect(w.recs('RX_START', 'tag')).toEqual([])
  })
})
