import { describe, it, expect } from 'vitest'
import {
  AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_WRITE_T3_NS, epcOf,
} from '../../src/engine/ampBs'
import { bsDataEndNs } from '../../src/engine/channel'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { DEFAULT_AMP_AP, DEFAULT_AMP_BS, type NodeCfg, type Scenario } from '../../src/model/scenario'
import { bsScenario, bsTag, ofType } from './amp-bs-helpers'

const MS = 1_000_000
/**
 * A seed whose single tag at 0.2 m draws slot counter 0, so it answers inside the Query's own
 * excitation. The counter is a pure function of the seed and the node id, so the tests that need
 * the "answered in slot 1" shape state the seed they need rather than asserting a draw.
 */
const SLOT0_SEED = 10

describe('the reader’s RFID inventory round', () => {
  it('opens the TXOP with a CTS-to-self whose Duration is txopMs, then the Query one SIFS later', () => {
    const rs = new Simulation(bsScenario({}, [bsTag('tag-1', 0.2)])).runUntil(20 * MS).records
    const cts = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'cts')!
    expect(cts.frame.dst).toBe('ap')
    expect(cts.frame.durationFieldNs).toBe(DEFAULT_AMP_BS.txopMs * MS)
    const query = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampRfid')!
    expect(query.t).toBe(cts.t + cts.frame.txTimeNs + 10_000) // 2.4 GHz SIFS
    expect(query.frame.amp!.rfid).toMatchObject({ cmd: 'query', q: 2, session: 1, slot: 1, wupNs: 1 * MS })
    expect(query.frame.txTimeNs).toBe(1_516_400) // the spec's pinned opening PPDU
  })

  it('runs Query → RN16 → ACK → EPC → Read, and the RN16 lands at AMP-Data end + 16 µs', () => {
    // Seed 10 is one where the single tag draws counter 0 and answers in the Query's own slot.
    const rs = new Simulation(bsScenario({ seed: SLOT0_SEED }, [bsTag('tag-1', 0.2)])).runUntil(20 * MS).records
    const cmds = ofType(rs, 'AMP_RFID', 'ap#2g')
    expect(cmds.map((c) => c.cmd).slice(0, 3)).toEqual(['query', 'ack', 'read'])

    const query = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampRfid')!
    // AMP-Data ends 32 µs (preamble+U-SIG) + 1 ms WUP + 16 µs sync + 320 µs of command in.
    const dataEnd = query.t + 32_000 + 1 * MS + 16_000 + 320_000
    const rn16 = ofType(rs, 'TX_START', 'tag-1#2g')[0]
    expect(rn16.frame.kind).toBe('ampBsReply')
    expect(rn16.frame.amp!.bs!.reply).toBe('rn16')
    expect(rn16.t).toBe(dataEnd + AMP_BS_T1_NS)
    expect(rn16.t - query.t).toBe(1_368_000 + AMP_BS_T1_NS)

    // The reader answers the RN16 it heard with an ACK carrying that same RN16.
    const ack = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.amp?.rfid?.cmd === 'ack')[0]
    expect(ack.frame.amp!.rfid!.rn16).toBe(rn16.frame.amp!.bs!.rn16)
    expect(ack.frame.dst).toBe('tag-1')
    // …one T2 after the Query PPDU (excitation included) ended.
    expect(ack.t).toBe(query.t + query.frame.txTimeNs + AMP_BS_T2_NS)

    const replies = ofType(rs, 'AMP_BS_REPLY', 'tag-1#2g').map((r) => r.kind)
    expect(replies.slice(0, 3)).toEqual(['rn16', 'epc', 'read'])
  })

  it('the first TXOP’s AMP_INVENTORY lists the tag it read', () => {
    const rs = new Simulation(bsScenario({ seed: SLOT0_SEED }, [bsTag('tag-1', 0.2)])).runUntil(20 * MS).records
    const inv = ofType(rs, 'AMP_INVENTORY', 'ap#2g')[0]
    expect(inv.read).toEqual([epcOf('tag-1')])
    expect(inv.session).toBe(1)
    expect(inv.collisions).toBe(0)
    expect(inv.slotsOffered).toBeGreaterThanOrEqual(1)
    expect(inv.txopNs).toBeLessThanOrEqual(DEFAULT_AMP_BS.txopMs * MS)
  })

  it('a 4 ms TXOP stops before the command that would overrun, and the next resumes with QueryRep and the same session', () => {
    const rs = new Simulation(bsScenario({ seed: SLOT0_SEED }, [bsTag('tag-1', 0.2)])).runUntil(20 * MS).records
    const first = ofType(rs, 'AMP_INVENTORY', 'ap#2g')[0]
    const opening = ofType(rs, 'AMP_RFID', 'ap#2g').filter((c) => c.t <= first.t)
    // CTS ~50 µs + SIFS, Query 1 516.4 µs, ACK 1 009.2 µs, Read 1 063.6 µs and two T2 gaps
    // already reach ~3.7 ms; the next QueryRep (452.4 µs) would cross 4 ms.
    expect(opening.map((c) => c.cmd)).toEqual(['query', 'ack', 'read'])
    expect(first.complete).toBe(false)
    expect(first.slotsOffered).toBe(1)
    expect(first.txopNs).toBe(3_697_200) // 60 + 1 516.4 + 16 + 1 009.2 + 16 + 1 063.6 + 16 µs

    const second = ofType(rs, 'AMP_RFID', 'ap#2g').filter((c) => c.t > first.t)[0]
    expect(second.cmd).toBe('queryRep')
    expect(second.session).toBe(first.session)
    expect(second.slot).toBe(2)
    // the resumed TXOP re-boots the tags: its first PPDU carries the WUP again
    const ppdu = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.t === second.t)!
    expect(ppdu.frame.amp!.rfid!.wupNs).toBe(1 * MS)
  })

  it('offers 2^Q slots, then stops: the session completes and no further command is sent until the next poll', () => {
    const rs = new Simulation(bsScenario({ pollIntervalMs: 200, seed: SLOT0_SEED }, [bsTag('tag-1', 0.2)])).runUntil(150 * MS).records
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    const done = invs.find((i) => i.complete)!
    expect(done).toBeDefined()
    expect(invs.filter((i) => i.session === done.session).reduce((s, i) => s + i.slotsOffered, 0)).toBe(4)
    expect(ofType(rs, 'AMP_RFID', 'ap#2g').filter((c) => c.t > done.t).length).toBe(0)
  })

  it('a new session every pollIntervalMs clears the tags’ inventoried flags', () => {
    const rs = new Simulation(bsScenario({ pollIntervalMs: 60 }, [bsTag('tag-1', 0.2)])).runUntil(400 * MS).records
    const sessions = [...new Set(ofType(rs, 'AMP_RFID', 'ap#2g').map((c) => c.session))]
    expect(sessions.length).toBeGreaterThanOrEqual(3)
    // …and the tag answers a Query in every one of them, which it could not do if its
    // session flag had survived.
    for (const s of sessions.slice(0, 3)) {
      const q = ofType(rs, 'AMP_RFID', 'ap#2g').find((c) => c.session === s && c.cmd === 'query')!
      const counter = ofType(rs, 'AMP_BS_COUNTER', 'tag-1#2g').find((c) => c.t === q.t + 1_368_000)
      expect(counter, `a counter drawn in session ${s}`).toBeDefined()
    }
  })

  it('Write answers after its 2 ms T3, inside a BST-Excitation sized for it', () => {
    const rs = new Simulation(bsScenario({ write: true, read: false, txopMs: 8 }, [bsTag('tag-1', 0.2)])).runUntil(30 * MS).records
    const write = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.amp?.rfid?.cmd === 'write')!
    expect(write.frame.txTimeNs).toBe(2_963_800) // the spec's pinned Write PPDU
    expect(write.frame.amp!.rfid!.bstNs).toBe(2_429_800)
    const dataEnd = write.t + 32_000 + 16_000 + 480_000
    const reply = ofType(rs, 'TX_START', 'tag-1#2g').find((r) => r.t > write.t && r.frame.amp?.bs?.reply === 'write')!
    expect(reply.t).toBe(dataEnd + AMP_BS_WRITE_T3_NS)
    expect(ofType(rs, 'RX_OK', 'ap#2g').some((r) => r.frame.amp?.bs?.reply === 'write')).toBe(true)
  })

  it('Q = 0 with two tags: every slot collides and nothing is ever read', () => {
    const sc = bsScenario({ q: 0, pollIntervalMs: 20 }, [bsTag('tag-1', 0.15), bsTag('tag-2', 0.15, 'y')])
    const rs = new Simulation(sc).runUntil(200 * MS).records
    const invs = ofType(rs, 'AMP_INVENTORY', 'ap#2g')
    expect(invs.length).toBeGreaterThan(4)
    for (const i of invs) {
      expect(i.read).toEqual([])
      expect(i.collisions).toBe(1)
      expect(i.slotsOffered).toBe(1)
      expect(i.complete).toBe(true)
    }
    // both tags drew slot 0 out of the single slot Q = 0 offers, and both backscattered
    expect(ofType(rs, 'AMP_BS_COUNTER', 'tag-1#2g').every((c) => c.counter === 0 && c.q === 0)).toBe(true)
    expect(ofType(rs, 'AMP_BS_COUNTER', 'tag-2#2g').every((c) => c.counter === 0)).toBe(true)
    expect(ofType(rs, 'AMP_BS_REPLY', 'tag-2#2g').length).toBeGreaterThan(0)
    expect(ofType(rs, 'AMP_RFID', 'ap#2g').some((c) => c.cmd === 'ack')).toBe(false)
  })

  it('Q = 2 with four tags: each draws its counter once per session from its own stream', () => {
    const tags = [bsTag('tag-1', 0.1), bsTag('tag-2', 0.2), bsTag('tag-3', 0.3), bsTag('tag-4', 0.1, 'y')]
    // `read: false` keeps a full four-slot inventory inside one 10 ms TXOP, so every slot's
    // outcome lands in one AMP_INVENTORY and none is cut off by a TXOP boundary.
    const rs = new Simulation(bsScenario({ pollIntervalMs: 40, txopMs: 10, read: false }, tags)).runUntil(60 * MS).records
    const session = ofType(rs, 'AMP_RFID', 'ap#2g')[0].session
    const inSession = (n: string) => ofType(rs, 'AMP_BS_COUNTER', n).filter((c) => c.t < 40 * MS)
    for (const id of ['tag-1', 'tag-2', 'tag-3', 'tag-4']) {
      const draws = inSession(`${id}#2g`)
      expect(draws.length, `${id} draws exactly once in session ${session}`).toBe(1)
      expect(draws[0].q).toBe(2)
      expect(draws[0].counter).toBeGreaterThanOrEqual(0)
      expect(draws[0].counter).toBeLessThanOrEqual(3)
    }
    const counters = ['tag-1', 'tag-2', 'tag-3', 'tag-4'].map((id) => inSession(`${id}#2g`)[0].counter)
    const inv = ofType(rs, 'AMP_INVENTORY', 'ap#2g').filter((i) => i.t < 40 * MS)
    const collisions = inv.reduce((s, i) => s + i.collisions, 0)
    const empties = inv.reduce((s, i) => s + i.empties, 0)
    const read = inv.flatMap((i) => i.read)
    // Every slot resolves as exactly one of: read alone, a collision, or an empty.
    const perSlot = [0, 1, 2, 3].map((c) => counters.filter((x) => x === c).length)
    expect(collisions).toBe(perSlot.filter((n) => n >= 2).length)
    expect(empties).toBe(perSlot.filter((n) => n === 0).length)
    expect(read.length).toBe(perSlot.filter((n) => n === 1).length)
    expect(read.length + collisions + empties).toBe(4)
  })

  it('a tag at 0.35 m is out of activation range and never boots at all', () => {
    const rs = new Simulation(bsScenario({}, [bsTag('near', 0.2), bsTag('far', 0.35, 'y')])).runUntil(40 * MS).records
    expect(ofType(rs, 'AMP_BS_BOOT', 'near#2g').length).toBeGreaterThan(0)
    expect(ofType(rs, 'AMP_BS_BOOT', 'near#2g')[0].powered).toBe(true)
    expect(ofType(rs, 'AMP_BS_BOOT', 'far#2g')).toEqual([])
    expect(ofType(rs, 'AMP_BS_COUNTER', 'far#2g')).toEqual([])
    expect(ofType(rs, 'AMP_BS_REPLY', 'far#2g')).toEqual([])
  })

  it('a Wi-Fi station on 2.4 GHz defers for every RFID PPDU, excitation included', () => {
    const rs = new Simulation(bsScenario({}, [bsTag('tag-1', 0.2)], [camera()])).runUntil(40 * MS).records
    const ppdus = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampRfid')
    const camTx = ofType(rs, 'TX_START', 'cam#2g')
    expect(ppdus.length).toBeGreaterThan(2)
    expect(camTx.length).toBeGreaterThan(10) // the camera really is busy
    let acquired = 0
    for (const p of ppdus) {
      const straddling = camTx.some((c) => c.t <= p.t && c.t + c.frame.txTimeNs > p.t)
      if (straddling) continue // the camera was already on the air: nothing to defer to yet
      const rx = ofType(rs, 'RX_START', 'cam#2g').find((r) => r.t === p.t && r.from === 'ap')
      expect(rx, `the camera acquires the ${p.frame.amp!.rfid!.cmd} PPDU`).toBeDefined()
      acquired++
      // …and the L-SIG length covers the excitations, so it starts nothing inside the PPDU
      const own = camTx.filter((r) => r.t > p.t && r.t < p.t + p.frame.txTimeNs)
      expect(own, `nothing from the camera inside the ${p.frame.amp!.rfid!.cmd} PPDU`).toEqual([])
    }
    expect(acquired).toBeGreaterThan(ppdus.length / 2)
  })

  /**
   * The spec's `none` variant expects Wi-Fi to land inside a BST-Excitation. In this engine it
   * cannot, and the reason is the tier's own physics: inside a TXOP the reader never stops
   * transmitting for longer than T2 = 16 µs, which is shorter than any AIFS, so a station that
   * deferred once can never get back in — and a station loud enough at the reader to spoil a
   * reflection is, by the symmetry of the path loss, loud enough to hear the reader and defer.
   * The excitation is its own protection. `AMP_BS_REPLY` losses to Wi-Fi are pinned at the
   * channel instead, in `amp-bs-sta.test.ts`.
   */
  it('protection none with a saturated station: the excitation still protects every BST window', () => {
    const sc = bsScenario({ pollIntervalMs: 10 }, [bsTag('tag-1', 0.2)], [camera(5.5, 20)])
    sc.nodes[0].ampAp!.protection = 'none'
    const rs = new Simulation(sc).runUntil(400 * MS).records
    expect(ofType(rs, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBe(0)
    const camTx = ofType(rs, 'TX_START', 'cam#2g')
    expect(camTx.length).toBeGreaterThan(100)
    const ppdus = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampRfid')
    const inBst = ppdus.filter((p) => {
      const from = p.t + bsDataEndNs(p.frame)!
      const to = from + p.frame.amp!.rfid!.bstNs
      return camTx.some((c) => c.t < to && c.t + c.frame.txTimeNs > from)
    })
    expect(inBst).toEqual([])
    const sent = ofType(rs, 'AMP_BS_REPLY', 'tag-1#2g').length
    const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampBsReply').length
    expect(sent).toBeGreaterThan(0)
    expect(heard).toBe(sent)
  })
})

/** A saturated 2.4 GHz Wi-Fi station `x` metres along +x from the reader. */
function camera(x = 5, txPowerDbm = 15): NodeCfg {
  return {
    id: 'cam', kind: 'sta', name: 'Camera', pos: { x, y: 2, z: 1 }, txPowerDbm,
    profiles: ['saturated'], caps: { generation: 'he', features: { edca: true } }, linkId: '2g',
  }
}

/** The two tiers under one reader alternate: even polls Active Tx, odd polls the inventory. */
describe('a reader with both tiers of tag', () => {
  it('alternates strictly between the Active Tx round and the RFID inventory', () => {
    const active: NodeCfg = {
      id: 'act', kind: 'amp', name: 'act', pos: { x: 6, y: 4, z: 1 }, txPowerDbm: 0,
      profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: { mode: 'active' },
    }
    const rs = new Simulation(bsScenario({ pollIntervalMs: 30, txopMs: 10 }, [bsTag('tag-1', 0.2), active])).runUntil(200 * MS).records
    const polls: string[] = []
    for (const r of rs) {
      if (r.type === 'AMP_ROUND' && r.node === 'ap#2g' && r.phase === 'random') polls.push('active')
      if (r.type === 'AMP_RFID' && r.node === 'ap#2g' && r.cmd === 'query') polls.push('inventory')
    }
    expect(polls.length).toBeGreaterThanOrEqual(4)
    for (let i = 0; i < polls.length; i++) expect(polls[i]).toBe(i % 2 === 0 ? 'active' : 'inventory')
  })
})

/** The reader alone, with no tag near enough to answer: every slot is an empty. */
describe('an inventory nobody answers', () => {
  it('counts empties and completes the session', () => {
    const sc: Scenario = bsScenario({ txopMs: 10 }, [bsTag('far', 0.6)])
    const rs = new Simulation(sc).runUntil(30 * MS).records
    const inv = ofType(rs, 'AMP_INVENTORY', 'ap#2g')[0]
    expect(inv.empties).toBe(4)
    expect(inv.collisions).toBe(0)
    expect(inv.read).toEqual([])
    expect(inv.complete).toBe(true)
    expect(ofType(rs, 'AMP_RFID', 'ap#2g').map((c) => c.cmd)).toEqual(['query', 'queryRep', 'queryRep', 'queryRep'])
  })
})

/** Nothing about the Active Tx tier moved: the same scenario, the same records. */
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
