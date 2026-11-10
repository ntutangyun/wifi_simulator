import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { AMP_SIFS_NS, ampTriggerFrame } from '../../src/engine/amp'
import { AmpStaMac } from '../../src/engine/ampSta'
import type { Channel } from '../../src/engine/channel'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { QAP_EDCA_PARAMS } from '../../src/engine/phy'
import type { FrameDesc } from '../../src/model/frames'
import { makeEmitter } from '../../src/model/records'
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

/** The AP's AC_BK TXOP limit, dot11QAPEDCATableTXOPLimit default (Table 9-194). */
const BK_LIMIT_NS = 2_528_000

describe('the AP’s AMP round', () => {
  it('runs on AC_BK, protected by a CTS-to-self whose Duration covers this TXOP’s trigger, slots and Acks', () => {
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const cts = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'cts')!
    expect(cts.frame.dst).toBe('ap')
    expect(cts.frame.mbps).toBe(6)
    const trig = ofType(rs, 'TX_START', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    expect(trig.t).toBe(cts.t + cts.frame.txTimeNs + 10_000) // 2.4 GHz SIFS
    // 2026-11-11 (W7b): the TXOP carries the two slots that fit the AC_BK TXOP limit, not four.
    const n = trig.frame.amp!.slots!
    const lastAck = ofType(rs, 'TX_END', 'ap#2g').filter((r) => r.frame.kind === 'ampAck' && r.frame.amp?.ackFor === n && r.t > trig.t)[0]
    expect(cts.t + cts.frame.txTimeNs + cts.frame.durationFieldNs).toBe(lastAck.t)
    const ifs = ofType(rs, 'IFS_START', 'ap#2g').find((r) => r.t <= cts.t)!
    expect(ifs.ac).toBe(0) // AC_BK
  })
  it('trigger → slot 1 after AMP SIFS → Ack → slot 2: the four slots asked for go out two per TXOP, under one Session ID', () => {
    // 2026-11-11 (W7b), §10.23.2.9 / Table 9-194: CTS-to-self 50 + SIFS 10 + trigger 618 +
    // N × (10 + 528 + 10 + 330) µs must stay within 2 528 µs, so N = 2 (1 816 µs); three slots
    // would need 2 694 µs. The other two slots follow in the next AC_BK TXOP.
    const rs = new Simulation(scenario()).runUntil(20 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g').slice(0, 2)
    for (const r of rounds) expect(r).toMatchObject({ phase: 'random', slots: 2, slotNs: 528_000, acwe: 2, dlKbps: 250, ulKbps: 250 })
    const trigs = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampTrigger').slice(0, 2)
    expect(trigs.map((t) => t.frame.amp!.sessionId)).toEqual([1, 1])
    expect(trigs.map((t) => t.frame.amp!.slots)).toEqual([2, 2])
    const trigEnd = ofType(rs, 'TX_END', 'ap#2g').find((r) => r.frame.kind === 'ampTrigger')!
    const slots = ofType(rs, 'AMP_SLOT', 'ap#2g').filter((r) => r.t >= trigEnd.t).slice(0, 2)
    expect(slots.map((s) => s.slot)).toEqual([1, 2])
    expect(slots[0].t).toBe(trigEnd.t + AMP_SIFS_NS)
    const acks = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampAck').slice(0, 4)
    expect(acks.map((a) => a.frame.amp!.ackFor)).toEqual([1, 2, 1, 2])
    expect(acks[0].t).toBe(slots[0].t + 528_000 + AMP_SIFS_NS)
    expect(slots[1].t).toBe(acks[0].t + 330_000 + AMP_SIFS_NS)
    expect(new Set(acks.map((a) => a.frame.txTimeNs)).size).toBe(1)
  })
  it('no AMP TXOP outlasts the AC_BK TXOP limit, whatever the rates, protection and read mode', () => {
    expect(QAP_EDCA_PARAMS[0].txopLimitNs).toBe(BK_LIMIT_NS)
    const cases: Partial<typeof DEFAULT_AMP_AP>[] = [
      {}, { protection: 'none' }, { readMode: 'twoPhase' }, { slots: 16 }, { dlKbps: 1000, ulKbps: 1000, slots: 16 },
      { readMode: 'twoPhase', slots: 16, acwe: 1 },
    ]
    for (const c of cases) {
      const rs = new Simulation(scenario({ pollIntervalMs: 50, ...c })).runUntil(300 * MS).records
      const ap = ofType(rs, 'TX_START', 'ap#2g')
      // A TXOP starts with the CTS-to-self, or with the trigger itself when there is none, and
      // ends with the Ack of its last slot.
      const starts = ap.filter((r) => (c.protection === 'none' ? r.frame.kind === 'ampTrigger' : r.frame.kind === 'cts'))
      expect(starts.length, JSON.stringify(c)).toBeGreaterThan(4)
      for (const s of starts) {
        const trig = ap.find((r) => r.t >= s.t && r.frame.kind === 'ampTrigger')
        if (!trig) continue // the run stopped between the CTS-to-self and its trigger
        const n = trig.frame.amp!.slots!
        const last = ap.find((r) => r.t > trig.t && r.frame.kind === 'ampAck' && r.frame.amp!.ackFor === n)
        if (!last) continue // still running when the run stopped
        expect(last.t + last.frame.txTimeNs - s.t, `${JSON.stringify(c)} at ${s.t}`).toBeLessThanOrEqual(BK_LIMIT_NS)
      }
    }
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
    // A round spans two TXOPs now; it is the first trigger of each Session ID that repeats.
    const firsts = new Map<number, number>()
    for (const r of ofType(rs, 'TX_START', 'ap#2g')) {
      if (r.frame.kind === 'ampTrigger' && !firsts.has(r.frame.amp!.sessionId!)) firsts.set(r.frame.amp!.sessionId!, r.t)
    }
    const starts = [...firsts.values()]
    expect(starts.length).toBeGreaterThanOrEqual(7)
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(50 * MS)
    expect(ofType(rs, 'AMP_RESULT', 'tag-1#2g').some((r) => r.acked)).toBe(true)
    expect(ofType(rs, 'AMP_RESULT', 'tag-2#2g').some((r) => r.acked)).toBe(true)
  })
  it('twoPhase: after the random phase, the scheduled triggers list exactly the tags heard, in order', () => {
    // 2026-11-11 (W7b): both phases are split to fit the AC_BK TXOP limit. The random phase here
    // takes two TXOPs; the scheduled phase, two tags with readings, takes two more — a trigger
    // listing both and two 528 µs slots would end at 2 562 µs, past 2 528 µs — so each scheduled
    // trigger lists one tag, and together they list every tag heard, once, in the order heard
    // (§39.3.2.1: list position = slot order).
    const rs = new Simulation(scenario({ readMode: 'twoPhase' })).runUntil(30 * MS).records
    const trigs = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampTrigger')
    const firstSched = trigs.findIndex((r) => r.frame.amp!.phase === 'scheduled')
    expect(firstSched).toBeGreaterThan(0)
    const session = trigs[firstSched].frame.amp!.sessionId
    const random = trigs.filter((r) => r.frame.amp!.sessionId === session && r.frame.amp!.phase === 'random')
    expect(random.length).toBe(2)
    const sched = trigs.filter((r) => r.frame.amp!.sessionId === session && r.frame.amp!.phase === 'scheduled')
    const heard = [...new Set(ofType(rs, 'RX_OK', 'ap#2g')
      .filter((r) => r.frame.kind === 'ampResp' && r.t > random[0].t && r.t < sched[0].t).map((r) => r.from))]
    expect(heard.length).toBe(2)
    expect(sched.flatMap((s) => s.frame.amp!.staIds!)).toEqual(heard)
    for (const s of sched) {
      expect(s.frame.amp!.reading).toBe(true)
      expect(s.frame.amp!.slots).toBe(s.frame.amp!.staIds!.length)
    }
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
  it('an AMP PPDU arriving while a station awaits a CTS fails the attempt instead of wedging it', () => {
    // §10.3.2.9: PHY-RXSTART holds the CTS/ACK timeout until RXEND. An AMP
    // downlink PPDU is never the awaited response, so RXEND must fail the
    // attempt — otherwise the station sits in waitCts with no timer left and
    // never transmits again. With protection 'none' an RTS ends inside a slot
    // often enough that the station would stall for good within a second.
    const cam: NodeCfg = { id: 'cam', kind: 'sta', name: 'Camera', pos: { x: 5, y: 2, z: 1 }, txPowerDbm: 15, profiles: ['saturated'], caps: { generation: 'he', features: { edca: true, ampdu: true, txop: true } }, linkId: '2g' }
    const sc = scenario({ protection: 'none' }, [cam])
    // the AP needs Block Ack too, or the camera's uplink never aggregates past the RTS threshold
    sc.nodes[0].caps.features.ampdu = true
    const rs = [...new Simulation(sc).runUntil(3000 * MS).records]
    const camRts = ofType(rs, 'TX_END', 'cam#2g').filter((r) => r.frame.kind === 'rts')
    const timeouts = ofType(rs, 'CTS_TIMEOUT', 'cam#2g')
    expect(camRts.length).toBeGreaterThan(0)

    // The mechanism: an RTS whose CTS window is covered by an AMP downlink PPDU.
    // Find the first such attempt — an AMP RX_OK at the camera after its RTS
    // ended, with no CTS to it and no timeout in between.
    const camRx = ofType(rs, 'RX_OK', 'cam#2g')
    let hit: { rts: (typeof camRts)[number]; amp: (typeof camRx)[number] } | undefined
    for (const r of camRts) {
      const next = camRx.find((x) => x.t > r.t)
      const to = timeouts.find((x) => x.t > r.t)
      if (next && next.frame.kind.startsWith('amp') && (!to || to.t > next.t)) { hit = { rts: r, amp: next }; break }
    }
    expect(hit, 'an RTS whose CTS window an AMP PPDU covers').toBeDefined()

    // RXEND of that AMP PPDU must fail the attempt then and there: a retry, a
    // doubled contention window, and no CTS_TIMEOUT record for this attempt.
    const at = hit!.amp.t
    expect(ofType(rs, 'RETRY', 'cam#2g').filter((r) => r.t === at).length).toBe(1)
    const cw = ofType(rs, 'CW_CHANGE', 'cam#2g').filter((r) => r.t === at)
    expect(cw.length).toBe(1)
    expect(timeouts.filter((r) => r.t > hit!.rts.t && r.t <= at).length).toBe(0)

    // …and nothing is left in waitCts: the camera leaves that state at `at` and
    // is still transmitting in the last tenth of the run.
    const states = ofType(rs, 'MAC_STATE', 'cam#2g')
    expect(states.filter((r) => r.t > hit!.rts.t && r.t <= at).pop()!.state).not.toBe('waitCts')
    expect(states.filter((r) => r.state === 'waitCts' && r.t > 2700 * MS).length).toBeGreaterThan(0)
    const camTx = ofType(rs, 'TX_START', 'cam#2g')
    expect(camTx.filter((r) => r.t > 2700 * MS).length).toBeGreaterThan(0.05 * camTx.length)
  })
  it('a finished round resets AC_BK’s contention window, even against higher-AC traffic', () => {
    // Downlink video (AC_VI) at the AP: every internal collision the AMP round
    // loses bumps AC_BK's CW, and only a successful round brings it back.
    const tv: NodeCfg = { id: 'tv', kind: 'sta', name: 'TV', pos: { x: 5, y: 2, z: 1 }, txPowerDbm: 15, profiles: ['video', 'saturated'], caps: { generation: 'he', features: { edca: true, ampdu: true, txop: true } }, linkId: '2g' }
    const rs = new Simulation(scenario({ pollIntervalMs: 20 }, [tv])).runUntil(1000 * MS).records
    const rounds = ofType(rs, 'AMP_ROUND', 'ap#2g').filter((r) => r.phase === 'random')
    expect(rounds.length).toBeGreaterThan(20)
    // the premise: AC_BK does lose internal collisions to the AP's AC_VI downlink
    expect(ofType(rs, 'INTERNAL_COLLISION', 'ap#2g').filter((r) => r.loserAc === 0).length).toBeGreaterThan(0)
    for (const rd of rounds) {
      const end = rs.findIndex((r) => r.type === 'TX_END' && r.node === 'ap#2g' && r.frame.kind === 'ampAck' && r.t === rd.untilNs)
      if (end < 0) continue // a round still running when the batch ended
      const next = rs.slice(end).find((r) => r.type === 'CW_CHANGE' && r.node === 'ap#2g' && r.ac === 0)
      expect(next).toMatchObject({ cw: 15, qsrc: 0 })
    }
  })
  it('a trigger whose Channel Indication is 14 or 15 gets no answer from an Active Tx tag (§39.4)', () => {
    const answers = (channel: number): { abocs: number; tx: number } => {
      const q = new EventQueue()
      const recs: TLRecord[] = []
      let tx = 0
      const ch = { startTx: () => { tx++ }, isTransmitting: () => false } as unknown as Channel
      const tagMac = new AmpStaMac('t', q, () => 0, ch, new Rng(1), makeEmitter((r) => recs.push(r)), { apId: 'ap', id16: 1 })
      const trig: FrameDesc = ampTriggerFrame({
        src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 1, slotNs: 272_000, acwe: 0,
        sessionId: 1, staIds: [], reading: false, roundNs: 1_000_000, signalExtNs: 6_000, channel,
      })
      tagMac.onRxOk(0, trig, 'ap')
      for (;;) { const e = q.pop(); if (!e) break; e.fn() }
      return { abocs: recs.filter((r) => r.type === 'AMP_ABOC').length, tx }
    }
    // ACWE 0 and one slot: on channels 0–13 the tag always answers in slot 1 …
    expect(answers(6)).toEqual({ abocs: 1, tx: 1 })
    expect(answers(13)).toEqual({ abocs: 1, tx: 1 })
    // … and on the bistatic values it stays silent, without even drawing.
    expect(answers(14)).toEqual({ abocs: 0, tx: 0 })
    expect(answers(15)).toEqual({ abocs: 0, tx: 0 })
  })
  it('every trigger the AP sends indicates channel 6, zero UL shift and seed index 0 (§39.3.2.1–2, Table 39-1)', () => {
    const rs = new Simulation(scenario({ readMode: 'twoPhase' })).runUntil(30 * MS).records
    const trigs = ofType(rs, 'TX_START', 'ap#2g').filter((r) => r.frame.kind === 'ampTrigger')
    expect(trigs.length).toBeGreaterThan(2)
    for (const t of trigs) expect(t.frame.amp).toMatchObject({ channel: 6, ulShiftMhz: 0, seedIdx: 0 })
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
