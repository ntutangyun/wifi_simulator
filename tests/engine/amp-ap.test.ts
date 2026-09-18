import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { AMP_SIFS_NS } from '../../src/engine/amp'
import { DEFAULT_AMP_AP, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { applyRecord, cloneView } from '../../src/model/view'

const MS = 1_000_000
function tag(id: string, x: number, y: number): NodeCfg {
  return { id, kind: 'amp', name: id, pos: { x, y, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} } }
}
function scenario(over: Partial<typeof DEFAULT_AMP_AP> = {}, extra: NodeCfg[] = []): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }], walls: [], servers: [], seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    nodes: [
      { id: 'ap', kind: 'ap', name: 'AP', pos: { x: 5, y: 4, z: 2 }, txPowerDbm: 20, profiles: ['idle'], caps: { generation: 'eht', features: { edca: true, txop: true } }, ampAp: { ...DEFAULT_AMP_AP, ...over } },
      tag('tag-1', 4, 4), tag('tag-2', 6, 4),
      ...extra,
    ],
  }
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K, node?: string) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))

describe('the AP’s AMP round', () => {
  it('runs on AC_BK, protected by a CTS-to-self whose Duration covers the round', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const cts = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'cts')!
    expect(cts.frame.dst).toBe('ap')
    expect(cts.frame.mbps).toBe(6)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    expect(trig.t).toBe(cts.t + cts.frame.txTimeNs + 10_000) // 2.4 GHz SIFS
    const lastAck = ofType(rs, 'TX_END', 'ap#2g').filter((r) => r.frame.kind === 'ampAck' && r.frame.amp?.ackFor === 4).pop()!
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs).toBeGreaterThanOrEqual(lastAck.t)
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs - lastAck.t).toBeLessThan(20_000)
    const ifs = ofType(rs, 'IFS_START', 'ap#2g').find((r) => r.t <= cts.t)!
    expect(ifs.ac).toBe(0) // AC_BK
  })
  it('trigger → slot 1 after AMP SIFS → Ack after the slot → slot 2 after AMP SIFS, four slots, four Acks', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const round = ofType(rs, 'AMP_ROUND', 'ap#2g')[0]
    expect(round).toMatchObject({ phase: 'random', slots: 4, slotNs: 528_000, acwe: 2, dlKbps: 250, ulKbps: 250 })
    const trigEnd = ofType(rs, 'TX_END', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    const slots = ofType(rs, 'AMP_SLOT', 'ap#2g').filter((r) => r.t >= trigEnd.t).slice(0, 4)
    expect(slots.map((s) => s.slot)).toEqual([1, 2, 3, 4])
    expect(slots[0].t).toBe(trigEnd.t + AMP_SIFS_NS)
    const acks = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampAck').slice(0, 4)
    expect(acks.map((a) => a.frame.amp!.ackFor)).toEqual([1, 2, 3, 4])
    expect(acks[0].t).toBe(slots[0].t + 528_000 + AMP_SIFS_NS)
    expect(slots[1].t).toBe(acks[0].t + 330_000 + AMP_SIFS_NS)
    expect(new Set(acks.map((a) => a.frame.txTimeNs)).size).toBe(1)
  })
  it('Ack ids name the tag heard in that slot, or the AP when nobody was', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const first = ofType(rs, 'AMP_ROUND', 'ap#2g')[0]
    const inRound = rs.filter((r) => r.t >= first.t && r.t <= first.untilNs)
    const acks = ofType(inRound, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampAck')
    const heard = ofType(inRound, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampResp')
    for (const a of acks) {
      const h = heard.find((r) => r.frame.amp!.slot === a.frame.amp!.ackFor)
      expect(a.frame.dst).toBe(h ? h.from : 'ap')
    }
    expect(acks.some((a) => a.frame.dst !== 'ap')).toBe(true)
  })
  it('rounds repeat every pollIntervalMs and tags get acknowledged', () => {
    const rs = new Simulation(scenario({ pollIntervalMs: 50 })).runUntil(400 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g').filter((r) => r.phase === 'random')
    expect(rounds.length).toBeGreaterThanOrEqual(7)
    for (let i = 1; i < rounds.length; i++) expect(rounds[i].t - rounds[i - 1].t).toBeGreaterThanOrEqual(50 * MS)
    expect(ofType(rs, 'AMP_RESULT', 'tag-1#2g').some((r) => r.acked)).toBe(true)
    expect(ofType(rs, 'AMP_RESULT', 'tag-2#2g').some((r) => r.acked)).toBe(true)
  })
  it('twoPhase: after the random phase, a scheduled trigger lists exactly the tags heard, in order', () => {
    const rs = new Simulation(scenario({ readMode: 'twoPhase' })).runUntil(30 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g')
    const sched = rounds.find((r) => r.phase === 'scheduled')!
    expect(sched).toBeDefined()
    const random = rounds.filter((r) => r.phase === 'random' && r.t < sched.t).pop()!
    const heard = ofType(rs, 'RX_OK', 'ap#2g').filter((r) => r.frame.kind === 'ampResp' && r.t > random.t && r.t < sched.t).map((r) => r.from)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger' && r.frame.amp?.phase === 'scheduled' && r.t >= sched.t)!
    expect(trig.frame.amp!.staIds).toEqual(heard)
    expect(trig.frame.amp!.reading).toBe(true)
    expect(sched.slots).toBe(heard.length)
  })
  it('protection none: a saturated 2.4 GHz station starts inside a slot and the response fails', () => {
    const cam: NodeCfg = { id: 'cam', kind: 'sta', name: 'Camera', pos: { x: 5, y: 2, z: 1 }, txPowerDbm: 15, profiles: ['saturated'], caps: { generation: 'he', features: { edca: true } }, linkId: '2g' }
    const rs = new Simulation(scenario({ protection: 'none' }, [cam])).runUntil(300 * MS).records
    const slots = ofType(rs, 'AMP_SLOT', 'ap#2g')
    const camTx = ofType(rs, 'TX_START', 'cam#2g').filter((r) => r.frame.kind === 'data')
    const inside = camTx.filter((c) => slots.some((s) => c.t > s.t && c.t < s.untilNs))
    expect(inside.length).toBeGreaterThan(0)
    expect(ofType(rs, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBe(0)
    const prot = new Simulation(scenario({ protection: 'ctsSelf' }, [cam])).runUntil(300 * MS).records
    expect(ofType(prot, 'NAV_SET', 'cam#2g').filter((r) => r.source.startsWith('cts')).length).toBeGreaterThan(0)
  })
  it('the live view and snapshot replay agree with AMP records', () => {
    const sim = new Simulation(scenario({ pollIntervalMs: 20 }))
    const batches = [50, 100, 150].map((ms) => sim.runUntil(ms * MS))
    const records = batches.flatMap((b) => b.records)
    const snapshots = batches.flatMap((b) => b.snapshots)
    const target = 120 * MS
    const snap = [...snapshots].reverse().find((s) => s.t <= target)!
    const rebuilt = cloneView(snap.view)
    for (const r of records) if (r.t > snap.t && r.t <= target) applyRecord(rebuilt, r)
    const live = new Simulation(scenario({ pollIntervalMs: 20 }))
    live.runUntil(target)
    const lv = cloneView(live.view)
    lv.t = rebuilt.t
    expect(rebuilt).toEqual(lv)
  })
})
