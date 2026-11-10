/**
 * The mono-static reader (src/engine/ampReader.ts), rewritten 2026-11-11 (W7b) for the draft's
 * inventory: broadcast AMP Triggers for random access, each allocating a single slot (PDT
 * 11-26/1519r5 §39.3.3), answered by an AMP Response carrying the tag's ID when its fresh ABOC is 0
 * (PDT 11-26/1889r4 §39.4); then, for every ID heard, an AMP RFID frame carrying the UHF Read
 * command (PDT 11-26/1520r3, MM-29), whose reply carries the EPC — exchanged in the same TXOP as
 * the command (PDT 11-26/1798r1). Every TXOP fits the AP's AC_BK TXOP limit, 2.528 ms
 * (§10.23.2.9, Table 9-194, dot11QAPEDCATable); an inventory that does not fit continues in the
 * next AC_BK TXOP under the same Session ID.
 *
 * Gone with this rewrite, because the draft has none of it: EPC Gen2's Query/QueryRep/ACK/RN16,
 * the 2^Q slot counter kept across TXOPs, the reader's own 4 ms `txopMs`, and Write.
 */
import { describe, it, expect } from 'vitest'
import {
  AMP_BS_REQ_SNR_DB, AMP_BS_T1_NS, AMP_BS_T2_NS, crc16Epc, epcOf,
} from '../../src/engine/ampBs'
import { AmpInventoryRound } from '../../src/engine/ampReader'
import { bsDataEndNs } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { hashStr } from '../../src/engine/hash'
import { CCA_ED_DBM, ERP_2G, QAP_EDCA_PARAMS } from '../../src/engine/phy'
import { PL0_DB, PL_EXP } from '../../src/engine/propagation'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import { DEFAULT_AMP_AP, DEFAULT_AMP_BS, type NodeCfg, type Scenario } from '../../src/model/scenario'
import { AP_POS, bsScenario, bsTag, ofType } from './amp-bs-helpers'

const MS = 1_000_000
/** The AP's AC_BK TXOP limit: dot11QAPEDCATableTXOPLimit default, Table 9-194. */
const BK_LIMIT_NS = 2_528_000
const hex = (id: string): string => crc16Epc(epcOf(id)).toString(16).padStart(4, '0')

/** A tag at `dM` metres in any of the four directions, so four tags can share one distance. */
function tagAt(id: string, dM: number, dir: 'x' | 'y' | '-x' | '-y'): NodeCfg {
  const t = bsTag(id, 0)
  const s = dir.startsWith('-') ? -1 : 1
  const axis = dir.replace('-', '')
  t.pos = { x: AP_POS.x + (axis === 'x' ? s * dM : 0), y: AP_POS.y + (axis === 'y' ? s * dM : 0), z: AP_POS.z }
  return t
}

describe('the reader’s mono-static inventory', () => {
  it('the AC_BK TXOP limit it keeps to is the AP’s own, 2.528 ms', () => {
    expect(QAP_EDCA_PARAMS[0].txopLimitNs).toBe(BK_LIMIT_NS)
  })

  it('opens the TXOP with a CTS-to-self reserving the rest of the TXOP limit, then a broadcast trigger one SIFS later', () => {
    const rs = new Simulation(bsScenario({}, [bsTag('tag-1', 0.2)])).runUntil(20 * MS).records
    const cts = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'cts')!
    expect(cts.frame.dst).toBe('ap')
    // §9.2.5.2 b): the reservation ends at the TXOP limit, not at a 4 ms of the reader's own.
    expect(cts.frame.txTimeNs + cts.frame.durationFieldNs).toBe(BK_LIMIT_NS)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampRfid')!
    expect(trig.t).toBe(cts.t + cts.frame.txTimeNs + 10_000) // 2.4 GHz SIFS
    expect(trig.frame.dst).toBe('*tags')
    expect(trig.frame.amp!.rfid).toMatchObject({ cmd: 'trigger', acwe: DEFAULT_AMP_BS.acwe, session: 1, slot: 1, wupNs: 1 * MS })
    expect(trig.frame.bytes).toBe(13)
    expect(trig.frame.txTimeNs).toBe(1_788_400)
  })

  it('trigger → the tag’s ID at AMP-Data end + 16 µs; Read → its EPC, in the next TXOP', () => {
    // ACWE 0: ACW = 0, so the single tag's ABOC is always 0 and it answers every trigger (§39.4).
    const rs = new Simulation(bsScenario({ acwe: 0 }, [bsTag('tag-1', 0.2)])).runUntil(20 * MS).records
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampRfid')!
    // AMP-Data ends 32 µs (preamble + U-SIG) + 1 ms WUP + 16 µs sync + 13 octets × 32 µs in.
    const dataEnd = trig.t + 32_000 + 1 * MS + 16_000 + 416_000
    expect(trig.t + bsDataEndNs(trig.frame)!).toBe(dataEnd)
    const id = ofType(rs, 'TX_START', 'tag-1#2g')[0]
    expect(id.frame.amp!.bs!.reply).toBe('id')
    expect(id.t).toBe(dataEnd + AMP_BS_T1_NS)

    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    // The Read (1 383.6 µs) does not fit behind the trigger (60 + 1 788.4 + 16 µs) in 2 528 µs,
    // so the first TXOP is the trigger alone and the Read opens the next one, WUP and all.
    expect(invs[0]).toMatchObject({ session: 1, slotsOffered: 1, ids: [hex('tag-1')], read: [], collisions: 0, empties: 0, complete: false })
    const read = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.amp?.rfid?.cmd === 'read')!
    expect(read.t).toBeGreaterThan(invs[0].t)
    expect(read.frame.dst).toBe('tag-1')
    expect(read.frame.amp!.rfid!.wupNs).toBe(1 * MS)
    expect(read.frame.txTimeNs).toBe(2_383_600)
    const reply = ofType(rs, 'AMP_BS_REPLY', 'tag-1#2g').map((r) => r.kind)
    expect(reply.slice(0, 2)).toEqual(['id', 'read'])
    expect(invs[1]).toMatchObject({ session: 1, slotsOffered: 0, ids: [], read: [epcOf('tag-1')] })
  })

  it('no inventory TXOP outlasts the AC_BK TXOP limit, at either uplink rate or protection', () => {
    for (const [ulKbps, protection] of [[250, 'ctsSelf'], [1000, 'ctsSelf'], [250, 'none'], [1000, 'none']] as const) {
      const tags = [tagAt('tag-1', 0.15, 'x'), tagAt('tag-2', 0.15, 'y'), tagAt('tag-3', 0.2, '-x'), tagAt('tag-4', 0.25, '-y')]
      const sc = bsScenario({ ulKbps, pollIntervalMs: 50 }, tags)
      sc.nodes[0].ampAp!.protection = protection
      const rs = new Simulation(sc).runUntil(300 * MS).records
      const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
      expect(invs.length).toBeGreaterThan(5)
      const apTx = ofType(rs, 'TX_START', 'ap#2g')
      for (const i of invs) {
        const start = i.t - i.txopNs
        const frames = apTx.filter((r) => r.t >= start && r.t < i.t)
        expect(frames.length).toBeGreaterThan(0)
        const lastEnd = Math.max(...frames.map((r) => r.t + r.frame.txTimeNs))
        expect(lastEnd - start, `${ulKbps} kb/s ${protection} at ${i.t}`).toBeLessThanOrEqual(BK_LIMIT_NS)
        // The round closes one T2 after its last PPDU, which is where the record is stamped.
        expect(i.t - lastEnd).toBe(AMP_BS_T2_NS)
      }
    }
  })

  it('offers `slots` triggers per inventory across as many TXOPs as it takes, all under one Session ID', () => {
    const rs = new Simulation(bsScenario({ pollIntervalMs: 200 }, [bsTag('tag-1', 0.2)])).runUntil(150 * MS).records
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    const done = invs.find((i) => i.complete)!
    expect(done).toBeDefined()
    const session = invs.filter((i) => i.session === done.session && i.t <= done.t)
    expect(session.length).toBeGreaterThan(1)
    expect(session.reduce((s, i) => s + i.slotsOffered, 0)).toBe(DEFAULT_AMP_BS.slots)
    // Every trigger of the session carries the same Session ID and numbers its slot in turn.
    const trig = ofType(rs, 'AMP_RFID', 'ap#2g').filter((c) => c.cmd === 'trigger' && c.t <= done.t)
    expect(trig.map((c) => c.session)).toEqual(trig.map(() => done.session))
    expect(trig.map((c) => c.slot)).toEqual([1, 2, 3, 4])
    // …and nothing more is sent until the next poll.
    expect(ofType(rs, 'AMP_RFID', 'ap#2g').filter((c) => c.t > done.t).length).toBe(0)
  })

  it('a new Session ID every pollIntervalMs', () => {
    const rs = new Simulation(bsScenario({ pollIntervalMs: 60 }, [bsTag('tag-1', 0.2)])).runUntil(400 * MS).records
    const sessions = [...new Set(ofType(rs, 'AMP_RFID', 'ap#2g').map((c) => c.session))]
    expect(sessions.length).toBeGreaterThanOrEqual(3)
    expect(sessions.slice(0, 3)).toEqual([1, 2, 3])
  })

  it('ACWE 0 with two tags at the same distance: every trigger collides and nothing is identified', () => {
    const sc = bsScenario({ acwe: 0, pollIntervalMs: 20 }, [tagAt('tag-1', 0.15, 'x'), tagAt('tag-2', 0.15, 'y')])
    const rs = new Simulation(sc).runUntil(200 * MS).records
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    expect(invs.length).toBeGreaterThan(4)
    for (const i of invs) {
      expect(i.ids).toEqual([])
      expect(i.read).toEqual([])
      expect(i.collisions).toBe(i.slotsOffered)
    }
    expect(ofType(rs, 'AMP_ABOC', 'tag-1#2g').every((c) => c.aboc === 0 && c.acw === 0)).toBe(true)
    expect(ofType(rs, 'AMP_BS_REPLY', 'tag-2#2g').length).toBeGreaterThan(0)
    expect(ofType(rs, 'AMP_RFID', 'ap#2g').some((c) => c.cmd === 'read')).toBe(false)
  })

  it('every tag draws a new ABOC on every trigger, from its own stream, and each trigger resolves by the draws (§39.4)', () => {
    const tags = [tagAt('tag-1', 0.15, 'x'), tagAt('tag-2', 0.15, 'y'), tagAt('tag-3', 0.15, '-x'), tagAt('tag-4', 0.15, '-y')]
    const sc = bsScenario({ pollIntervalMs: 200, read: false, slots: 8 }, tags)
    const rs = new Simulation(sc).runUntil(150 * MS).records
    const trig = ofType(rs, 'AMP_RFID', 'ap#2g').filter((c) => c.cmd === 'trigger')
    expect(trig.length).toBe(8)
    const draws: Record<string, number[]> = {}
    for (const id of ['tag-1', 'tag-2', 'tag-3', 'tag-4']) {
      const got = ofType(rs, 'AMP_ABOC', `${id}#2g`)
      expect(got.length, id).toBe(8)
      // Replayed from the tag's own stream, built the way simulation.ts forks it.
      const rng = new Rng(sc.seed).fork(hashStr(`${id}#2g`))
      expect(got.map((g) => g.aboc), id).toEqual(got.map(() => rng.int(3)))
      draws[id] = got.map((g) => g.aboc)
    }
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    const ids = invs.flatMap((i) => i.ids)
    const collisions = invs.reduce((s, i) => s + i.collisions, 0)
    const empties = invs.reduce((s, i) => s + i.empties, 0)
    const answering = [...Array(8).keys()].map((k) => Object.values(draws).filter((d) => d[k] === 0).length)
    // Four tags at one distance: one answer is read, two or more collide, none is empty.
    expect(ids.length).toBe(answering.filter((n) => n === 1).length)
    expect(collisions).toBe(answering.filter((n) => n >= 2).length)
    expect(empties).toBe(answering.filter((n) => n === 0).length)
    expect(ids.length + collisions + empties).toBe(8)
  })

  it('a tag at 0.35 m is out of activation range and never boots at all', () => {
    const rs = new Simulation(bsScenario({}, [bsTag('near', 0.2), bsTag('far', 0.35, 'y')])).runUntil(40 * MS).records
    expect(ofType(rs, 'AMP_BS_BOOT', 'near#2g')[0].powered).toBe(true)
    expect(ofType(rs, 'AMP_BS_BOOT', 'far#2g')).toEqual([])
    expect(ofType(rs, 'AMP_ABOC', 'far#2g')).toEqual([])
    expect(ofType(rs, 'AMP_BS_REPLY', 'far#2g')).toEqual([])
  })

  it('a tag that boots but cannot be heard leaves an empty slot, not a collision', () => {
    // At 20 dBm charge the activation reach is 0.978 m but the reply reach does not move: a tag
    // at 0.5 m wakes, draws, and backscatters an answer under the reader's own leakage floor.
    const rs = new Simulation(bsScenario({ chargeDbm: 20, acwe: 0, pollIntervalMs: 20 }, [bsTag('lonely', 0.5)])).runUntil(100 * MS).records
    expect(ofType(rs, 'AMP_BS_BOOT', 'lonely#2g')[0]).toMatchObject({ powered: true })
    expect(ofType(rs, 'AMP_ABOC', 'lonely#2g')[0]).toMatchObject({ aboc: 0 })
    const replies = ofType(rs, 'AMP_BS_REPLY', 'lonely#2g')
    expect(replies.length).toBeGreaterThan(0)
    expect(replies[0].snrDb).toBeLessThan(AMP_BS_REQ_SNR_DB[250])
    expect(ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampBsReply')).toEqual([])
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    expect(invs.length).toBeGreaterThan(2)
    for (const i of invs) expect(i).toMatchObject({ ids: [], read: [], collisions: 0, empties: i.slotsOffered })

    // …and the same reader still calls a real two-tag pile-up a collision.
    const both = new Simulation(bsScenario({ chargeDbm: 20, acwe: 0, pollIntervalMs: 20 }, [tagAt('near-1', 0.15, 'x'), tagAt('near-2', 0.15, 'y')])).runUntil(100 * MS).records
    const collided = ofType(both, 'AMP_INVENTORY', 'ap#2g')
    expect(collided.length).toBeGreaterThan(2)
    for (const i of collided) expect(i).toMatchObject({ ids: [], read: [], collisions: i.slotsOffered, empties: 0 })
  })

  it('tallies every trigger once, and reads every identifier it heard', () => {
    const tags = [bsTag('tag-1', 0.1), bsTag('tag-2', 0.2), bsTag('tag-3', 0.3), bsTag('tag-4', 0.1, 'y')]
    const rs = new Simulation(bsScenario({ pollIntervalMs: 60 }, tags)).runUntil(400 * MS).records
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    expect(invs.length).toBeGreaterThan(5)
    for (const i of invs) expect(i.ids.length + i.collisions + i.empties, `at ${i.t}`).toBe(i.slotsOffered)
    // Every AMP Response decoded is followed, later in the same session, by a Read addressed to
    // the tag that sent it — unless that tag was already read in this session.
    const reads = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.amp?.rfid?.cmd === 'read')
    const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.amp?.bs?.reply === 'id')
    expect(heard.length).toBeGreaterThan(0)
    const lastT = rs[rs.length - 1].t
    for (const h of heard) {
      if (h.t > lastT - 30 * MS) continue // too close to the end of the run to have been served
      const read = reads.find((r) => r.t > h.t && r.frame.dst === h.from) ??
        reads.find((r) => r.t < h.t && r.frame.dst === h.from)
      expect(read, `the ID ${h.from} sent at ${h.t} is read in its session`).toBeDefined()
    }
    // …and every Read reply the reader decodes lands in `read` as that tag's EPC.
    const epcs = invs.flatMap((i) => i.read)
    const decoded = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.amp?.bs?.reply === 'read')
    expect(epcs.length).toBe(decoded.length)
    for (const d of decoded) expect(epcs).toContain(epcOf(d.from))
  })

  it('a poll tick inside a running inventory does not truncate it, and no cut session claims to be complete', () => {
    const tags = [bsTag('tag-1', 0.1), bsTag('tag-2', 0.2), bsTag('tag-3', 0.3), bsTag('tag-4', 0.1, 'y')]
    const rs = new Simulation(bsScenario({ pollIntervalMs: 10 }, tags)).runUntil(400 * MS).records
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    expect(invs.length).toBeGreaterThan(20)
    const done = invs.filter((i) => i.complete)
    expect(done.length).toBeGreaterThan(0)
    for (const d of done) {
      const offered = invs.filter((i) => i.session === d.session && i.t <= d.t).reduce((n, i) => n + i.slotsOffered, 0)
      expect(offered, `session ${d.session}, complete at ${d.t}, offered all its triggers`).toBe(DEFAULT_AMP_BS.slots)
    }
  })

  it('a Wi-Fi station on 2.4 GHz defers for every mono-static PPDU, excitation included', () => {
    const rs = new Simulation(bsScenario({}, [bsTag('tag-1', 0.2)], [camera()])).runUntil(40 * MS).records
    const ppdus = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampRfid')
    const camTx = ofType(rs, 'TX_START', 'cam#2g')
    expect(ppdus.length).toBeGreaterThan(2)
    expect(camTx.length).toBeGreaterThan(10)
    let acquired = 0
    for (const p of ppdus) {
      const straddling = camTx.some((c) => c.t <= p.t && c.t + c.frame.txTimeNs > p.t)
      if (straddling) continue
      const rx = ofType(rs, 'RX_START', 'cam#2g').find((r) => r.t === p.t && r.from === 'ap')
      expect(rx, `the camera acquires the ${p.frame.amp!.rfid!.cmd} PPDU`).toBeDefined()
      acquired++
      const own = camTx.filter((r) => r.t > p.t && r.t < p.t + p.frame.txTimeNs)
      expect(own, `nothing from the camera inside the ${p.frame.amp!.rfid!.cmd} PPDU`).toEqual([])
    }
    expect(acquired).toBeGreaterThan(ppdus.length / 2)
  })

  /**
   * Inside a TXOP the reader never stops transmitting for longer than T2 = 16 µs, shorter than any
   * AIFS, so a station that once deferred cannot get back in before the next PPDU has started; a
   * station that missed the preamble is kept out by energy detection of the frame, out to
   * `edReachM`. In this room that covers every corner — a geometry result, not a law.
   */
  it('protection none with a saturated station: nowhere in this room can Wi-Fi reach a BST window', () => {
    expect(edReachM).toBeCloseTo(6.97, 2)
    expect(Math.hypot(5, 4)).toBeLessThan(edReachM)
    for (const at of [{ x: 5.5, y: 2 }, { x: 0.2, y: 0.2 }, { x: 9.8, y: 7.8 }]) {
      const where = `${at.x},${at.y}`
      const sc = bsScenario({ pollIntervalMs: 10 }, [bsTag('tag-1', 0.2)], [camera(at.x, 20, at.y)])
      sc.nodes[0].ampAp!.protection = 'none'
      const rs = new Simulation(sc).runUntil(400 * MS).records
      expect(ofType(rs, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBe(0)
      const camTx = ofType(rs, 'TX_START', 'cam#2g')
      expect(camTx.length, where).toBeGreaterThan(100)
      const ppdus = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampRfid')
      expect(inBstWindow(ppdus, camTx), where).toEqual([])
      const sent = ofType(rs, 'AMP_BS_REPLY', 'tag-1#2g').length
      const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampBsReply').length
      expect(sent, where).toBeGreaterThan(0)
      expect(heard, where).toBe(sent)
    }
  })

  it('a station beyond the frame’s energy-detection reach does get in, and the reflection is lost', () => {
    expect(HALL_CAM_M).toBeGreaterThan(edReachM)
    const rs = new Simulation(hall()).runUntil(300 * MS).records
    const camTx = ofType(rs, 'TX_START', 'cam#2g')
    const ppdus = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampRfid')
    expect(inBstWindow(ppdus, camTx).length).toBeGreaterThan(0)
    const replies = ofType(rs, 'TX_START', 'tag-1#2g').filter((r) => r.frame.kind === 'ampBsReply')
      .filter((r) => r.t + r.frame.txTimeNs < 300 * MS) // a reply still in flight when the run stops has no outcome yet
    const spoiled = replies.filter((r) =>
      camTx.some((c) => c.t < r.t + r.frame.txTimeNs && c.t + c.frame.txTimeNs > r.t))
    expect(replies.length).toBeGreaterThan(20)
    expect(spoiled.length, 'reflections a Wi-Fi frame lay across').toBeGreaterThan(0)
    const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampBsReply').length
    expect(heard).toBe(replies.length - spoiled.length)
  })
})

/** The BST-Excitations of `ppdus` that a frame of `others` was on the air inside. */
function inBstWindow(
  ppdus: Extract<TLRecord, { type: 'TX_START' }>[], others: Extract<TLRecord, { type: 'TX_START' }>[],
) {
  return ppdus.filter((p) => {
    const from = p.t + bsDataEndNs(p.frame)!
    const to = from + p.frame.amp!.rfid!.bstNs
    return others.some((c) => c.t < to && c.t + c.frame.txTimeNs > from)
  })
}

/** How far a frame is still energy at a Wi-Fi station: `chargeDbm` down the indoor law to `CCA_ED_DBM`. */
const edReachM = 10 ** ((DEFAULT_AMP_BS.chargeDbm - CCA_ED_DBM - PL0_DB) / (10 * PL_EXP))

/** The saturated station's distance from the reader in the hall scene, well past `edReachM`. */
const HALL_CAM_M = 12

/** The same reader and tag in a 40 m hall: the station is out of the frame's energy reach. */
function hall(): Scenario {
  const sc = bsScenario(
    { pollIntervalMs: 10, acwe: 0, read: false }, [bsTag('tag-1', 0.2)],
    [camera(AP_POS.x + HALL_CAM_M, 15, AP_POS.y)],
  )
  sc.rooms = [{ x: 0, y: 0, w: 40, h: 8, name: 'Hall' }]
  sc.nodes[0].ampAp!.protection = 'none'
  return sc
}

/**
 * The round with no medium under it and no tags in front of it: the frames go nowhere and nothing
 * ever answers, so every trigger is an empty and each TXOP is pure bookkeeping. This is where the
 * poll clock can be ticked by hand at an instant EDCA would never leave open.
 */
function readerBench(over: Partial<typeof DEFAULT_AMP_BS> = {}) {
  const q = new EventQueue()
  let now = 0
  const invs: Extract<TLRecord, { type: 'AMP_INVENTORY' }>[] = []
  const emit = makeEmitter((r) => { if (r.type === 'AMP_INVENTORY') invs.push(r) })
  const round = new AmpInventoryRound(
    { ...DEFAULT_AMP_AP, protection: 'none', backscatter: { ...DEFAULT_AMP_BS, ...over } },
    {
      nodeId: 'ap', q, now: () => now, emit, timing: ERP_2G,
      transmit: () => {}, done: () => {}, bstEnergy: () => false,
    },
    () => BK_LIMIT_NS,
  )
  const txop = (): Extract<TLRecord, { type: 'AMP_INVENTORY' }> => {
    round.start()
    for (;;) {
      const pt = q.peekTime()
      if (pt === null) break
      const e = q.pop()!
      now = e.t
      e.fn()
    }
    now += 1 * MS
    return invs[invs.length - 1]
  }
  return { round, invs, txop }
}

describe('the poll clock against an inventory that is not finished', () => {
  it('a tick between TXOPs leaves the resumable inventory alone, and starts its own after it', () => {
    // With the 1 ms WUP every TXOP holds a single trigger (1 788.4 µs, and the next 788.4 µs one
    // would end past 2 528 µs), so the four triggers take four TXOPs.
    const b = readerBench()
    const first = b.txop()
    expect(first.slotsOffered).toBe(1)
    expect(first.complete).toBe(false)
    expect(b.round.resumable).toBe(true)

    b.round.newInventory() // the poll clock ticks while the reader is between TXOPs
    expect(b.round.resumable, 'the inventory is still worth another TXOP').toBe(true)
    for (let i = 0; i < 6 && !b.invs[b.invs.length - 1].complete; i++) b.txop()
    expect(b.invs[b.invs.length - 1].complete).toBe(true)
    expect(new Set(b.invs.map((i) => i.session)).size, 'one session throughout').toBe(1)
    expect(b.invs.reduce((n, i) => n + i.slotsOffered, 0)).toBe(DEFAULT_AMP_BS.slots)

    expect(b.round.resumable).toBe(false)
    expect(b.txop().session).toBe(first.session + 1)
  })

  it('a TXOP limit too short for one frame sends nothing and does not retry forever', () => {
    const q = new EventQueue()
    const sent: string[] = []
    const round = new AmpInventoryRound(
      { ...DEFAULT_AMP_AP, protection: 'none', backscatter: { ...DEFAULT_AMP_BS } },
      {
        nodeId: 'ap', q, now: () => 0, emit: () => {}, timing: ERP_2G,
        transmit: (f) => { sent.push(f.kind) }, done: () => {}, bstEnergy: () => false,
      },
      () => 1_000_000,
    )
    round.start()
    expect(sent).toEqual([])
    expect(round.resumable).toBe(false)
  })
})

/** A saturated 2.4 GHz Wi-Fi station `x` metres along +x from the reader. */
function camera(x = 5, txPowerDbm = 15, y = 2): NodeCfg {
  return {
    id: 'cam', kind: 'sta', name: 'Camera', pos: { x, y, z: 1 }, txPowerDbm,
    profiles: ['saturated'], caps: { generation: 'he', features: { edca: true } }, linkId: '2g',
  }
}

describe('a reader with both tiers of tag', () => {
  it('alternates strictly between the Active Tx round and the mono-static inventory', () => {
    const active: NodeCfg = {
      id: 'act', kind: 'amp', name: 'act', pos: { x: 6, y: 4, z: 1 }, txPowerDbm: 0,
      profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: { mode: 'active' },
    }
    const rs = new Simulation(bsScenario({ pollIntervalMs: 30, slots: 1 }, [bsTag('tag-1', 0.2), active])).runUntil(200 * MS).records
    const polls: string[] = []
    const seenSessions = new Set<number>()
    let lastRoundT = -Infinity
    for (const r of rs) {
      if (r.type === 'AMP_ROUND' && r.node === 'ap#2g' && r.phase === 'random' && r.t - lastRoundT > 10 * MS) {
        polls.push('active')
        lastRoundT = r.t
      }
      if (r.type === 'AMP_RFID' && r.node === 'ap#2g' && r.cmd === 'trigger' && !seenSessions.has(r.session)) {
        seenSessions.add(r.session)
        polls.push('inventory')
      }
    }
    expect(polls.length).toBeGreaterThanOrEqual(4)
    for (let i = 0; i < polls.length; i++) expect(polls[i]).toBe(i % 2 === 0 ? 'active' : 'inventory')
  })
})

describe('an inventory nobody answers', () => {
  it('counts empties and completes the session', () => {
    const rs = new Simulation(bsScenario({}, [bsTag('far', 0.6)])).runUntil(40 * MS).records
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g').filter((i) => i.session === 1)
    expect(invs.reduce((n, i) => n + i.empties, 0)).toBe(DEFAULT_AMP_BS.slots)
    expect(invs.reduce((n, i) => n + i.collisions, 0)).toBe(0)
    expect(invs.flatMap((i) => i.read)).toEqual([])
    expect(invs[invs.length - 1].complete).toBe(true)
    expect(ofType(rs, 'AMP_RFID', 'ap#2g').filter((c) => c.session === 1).map((c) => c.cmd))
      .toEqual(['trigger', 'trigger', 'trigger', 'trigger'])
  })
})

describe('the Active Tx tier', () => {
  it('replays byte-for-byte with the backscatter tier in the build', () => {
    const activeOnly = (): Scenario => ({
      rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }], walls: [], servers: [], seed: 7,
      rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
      nodes: [
        { id: 'ap', kind: 'ap', name: 'AP', pos: { x: 5, y: 4, z: 2 }, txPowerDbm: 20, profiles: ['idle'], caps: { generation: 'eht', features: { edca: true, txop: true } }, ampAp: { ...DEFAULT_AMP_AP } },
        { id: 't1', kind: 'amp', name: 't1', pos: { x: 4, y: 4, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, ampTag: { mode: 'active' } },
      ],
    })
    const a = new Simulation(activeOnly())
    a.runUntil(200 * MS)
    const b = new Simulation(activeOnly())
    b.runUntil(200 * MS)
    expect(a.timelineHash()).toBe(b.timelineHash())
    const rs: TLRecord[] = new Simulation(activeOnly()).runUntil(200 * MS).records
    expect(rs.some((r) => r.type === 'AMP_ROUND')).toBe(true)
    expect(rs.some((r) => r.type === 'AMP_RFID')).toBe(false)
  })
})
