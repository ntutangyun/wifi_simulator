/**
 * W7a (2026-11-11): Wi-Fi MAC frames, acknowledgement and protection, each pinned to the clause
 * of IEEE Std 802.11-2024 it follows.
 *
 *  - every VHT/HE/EHT PSDU is an A-MPDU — one MSDU goes out as an S-MPDU (§9.7.3, §10.12.5,
 *    §10.12.7) — padded with EOF padding to PSDU_LENGTH (§10.12.6);
 *  - an A-MPDU is received MPDU by MPDU and the BlockAck bitmap reports each one; only the
 *    unacknowledged MPDUs are sent again (§9.7, §10.12, §10.25);
 *  - a DL MU PPDU solicits its acknowledgement with a TRS Control subfield, answered in HE/EHT TB
 *    PPDUs; without one there is no answer (§10.3.2.13.2, §9.2.4.7.1, §26.5.2.3.4);
 *  - Address 3 per Table 9-60; duplicate detection by <TA, TID, SN> and Retry (§10.3.2.14.3);
 *    the AP relays what it received, whatever happened to its Ack; sequence-number spaces per
 *    Table 10-5.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { AcQueues } from '../../src/engine/queues'
import { Simulation } from '../../src/engine/simulation'
import { AMPDU_DELIMITER_BYTES, FCS_BYTES, QOS_HDR_BYTES, SIFS_NS } from '../../src/engine/phy'
import { defaultFeatures } from '../../src/model/caps'
import { decodeFrame } from '../../src/model/frameFields'
import { eofPadding, psduLengthFor, psduPlan, type FrameDesc } from '../../src/model/frames'
import type { TLRecord } from '../../src/model/records'
import { makeBss, msdu } from './helpers'

const MS = 1_000_000
type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>
const isTx = (r: TLRecord): r is Rec<'TX_START'> => r.type === 'TX_START'
const run = (id: string, ms: number, variant?: number): TLRecord[] => {
  const l = LESSONS.find((x) => x.id === id)!
  const sc = variant === undefined ? l.scenario() : l.variants![variant].scenario()
  return new Simulation(sc).runUntil(ms * MS).records
}

describe('A-MPDU framing: S-MPDU and EOF padding (§9.7.3, §10.12.5–§10.12.7)', () => {
  it('one MSDU on a VHT/HE/EHT link is an S-MPDU: one delimiter more than the bare MPDU, answered by an Ack', () => {
    const p = psduPlan([1500], { qos: true, ampdu: true, mode: 'he' })
    expect(p).toEqual({ psduBytes: AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + 1500 + FCS_BYTES, aggregate: false, smpdu: true, respBytes: 14 })
    expect(psduPlan([1500], { qos: true, ampdu: true, mode: 'nonht' }).smpdu).toBe(false)
  })

  it('EOF padding fills the final subframe to 4 octets, then 4-octet EOF subframes, then octets', () => {
    expect(eofPadding(1534, 1545)).toEqual({ finalPad: 2, eofSubframes: 2, eofOctets: 1 })
    // PSDU_LENGTH is what the symbols hold: never less than the A-MPDU, never a whole symbol more.
    const ndbps = 117
    for (const apep of [36, 1534, 3070]) {
      const len = psduLengthFor(apep, ndbps)
      expect(len).toBeGreaterThanOrEqual(apep)
      expect(Math.ceil((22 + 8 * len) / ndbps)).toBe(Math.ceil((22 + 8 * apep) / ndbps))
    }
  })

  it('a recorded HE data frame carries PSDU_LENGTH, its pre-EOF length, and decodes to exactly that many octets', () => {
    const recs = run('ampdu', 200)
    const frames = recs.filter(isTx).map((r) => r.frame).filter((f) => f.kind === 'data' && f.apepBytes !== undefined)
    expect(frames.length).toBeGreaterThan(10)
    for (const f of frames.slice(0, 30)) {
      expect(f.bytes).toBeGreaterThanOrEqual(f.apepBytes!)
      const d = decodeFrame(f, { apId: 'ap', isEdca: true })
      expect(d.bytes).toBe(f.bytes)
      const u = d.users[0]
      const pad = u.eofPad ? u.eofPad.finalPad + 4 * u.eofPad.eofSubframes + u.eofPad.eofOctets : 0
      expect(u.subframes.reduce((s, sf) => s + sf.delimiterBytes + sf.mpdu.bytes + sf.padBytes, 0) + pad).toBe(f.bytes)
    }
  })
})

describe('A-MPDU acknowledged MPDU by MPDU (§9.7, §10.12, §10.25)', () => {
  // The hidden-station hallway with Wi-Fi 6 uploaders: a collision that starts in the middle of
  // an A-MPDU is the case.
  const sc = LESSONS.find((x) => x.id === 'hidden')!.scenario()
  for (const n of sc.nodes) if (n.kind === 'sta') n.caps = { generation: 'he', features: defaultFeatures('he') }
  const recs = new Simulation(sc).runUntil(1000 * MS).records

  it('an A-MPDU hit part-way through is received in part, and the BlockAck reports exactly the MPDUs that arrived', () => {
    const partial = recs.filter((r): r is Rec<'RX_OK'> => r.type === 'RX_OK' && r.mpduOk !== undefined && r.node === 'ap')
    expect(partial.length).toBeGreaterThan(0)
    let checked = 0
    for (const rx of partial) {
      expect(rx.mpduOk!.some((x) => !x)).toBe(true)
      const ba = recs.find((r): r is Rec<'TX_START'> => isTx(r) && r.node === 'ap' && r.frame.kind === 'ba' && r.t === rx.t + SIFS_NS)
      if (!ba) continue
      const sent = rx.frame.mpdus!.map((h) => h.sn)
      expect(ba.frame.ba!.acked).toEqual(sent.filter((_, i) => rx.mpduOk![i]))
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('only the MPDUs the bitmap left out are sent again, each with its Retry bit set', () => {
    const partial = recs.filter((r): r is Rec<'RX_OK'> => r.type === 'RX_OK' && r.mpduOk !== undefined && r.node === 'ap')
    let checked = 0
    for (const rx of partial) {
      const ba = recs.find((r): r is Rec<'TX_START'> => isTx(r) && r.node === 'ap' && r.frame.kind === 'ba' && r.t === rx.t + SIFS_NS)
      if (!ba || ba.frame.dst !== rx.from) continue
      const missing = rx.frame.mpdus!.filter((_, i) => !rx.mpduOk![i]).map((h) => h.sn)
      const acked = ba.frame.ba!.acked
      const next = recs.find((r): r is Rec<'TX_START'> => isTx(r) && r.node === rx.from && r.frame.kind === 'data' && r.t > ba.t)
      if (!next) continue
      const sns = (next.frame.mpdus ?? []).map((h) => h.sn)
      for (const sn of acked) expect(sns, 'an acknowledged MPDU is not sent again').not.toContain(sn)
      for (const h of next.frame.mpdus ?? []) if (missing.includes(h.sn)) expect(h.retry).toBe(true)
      if (missing.some((sn) => sns.includes(sn))) checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})

describe('DL MU acknowledgement by TRS Control (§10.3.2.13.2), 2026-11-11', () => {
  const recs = run('ofdma-dl', 300)
  const tx = recs.filter(isTx)
  const mus = tx.filter((r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)

  it('every member of a DL MU PPDU carries a TRS Control subfield, and answers with a BlockAck in an HE TB PPDU a SIFS later', () => {
    expect(mus.length).toBeGreaterThan(10)
    let answers = 0
    for (const mu of mus) {
      const end = mu.t + mu.frame.txTimeNs
      for (const [i, p] of mu.frame.muParts!.entries()) {
        expect(p.trs).toBeDefined()
        expect(p.trs!.mcs).toBeLessThanOrEqual(3)
        expect(p.trs!.partIdx).toBe(i)
        const ba = tx.find((r) => r.node === p.dst && r.frame.kind === 'ba' && r.t === end + SIFS_NS)
        if (!ba) continue
        expect(ba.frame.mode).toBe(mu.frame.mode)
        expect(ba.frame.mcs).toBe(p.trs!.mcs)
        expect(ba.frame.ru).toEqual({ fraction: p.trs!.ruFraction, partIdx: i })
        expect(ba.frame.orthogonalGroup).toBe(mu.frame.orthogonalGroup)
        answers++
      }
    }
    expect(answers).toBeGreaterThan(10)
    // no member answers in a non-HT PPDU any more
    expect(tx.some((r) => r.frame.kind === 'ba' && r.frame.orthogonalGroup !== undefined && r.frame.mode === undefined)).toBe(false)
  })

  it('a member answers only when solicited: a DL MU part without TRS Control gets no response', () => {
    const b = makeBss(['ap', 'sta-1'], { 'ap>sta-1': -50, 'sta-1>ap': -50 })
    const part = { dst: 'sta-1', src: 'ap', bytes: 1600, mcs: 3, mbps: 0, msduIds: [7], msduBytes: [1500], mpduCount: 1, mpdus: [{ sn: 0, retry: false }] }
    const f: FrameDesc = { kind: 'data', src: 'ap', dst: '*mu', bytes: 1600, mbps: 0, durationFieldNs: 100_000, txTimeNs: 200_000, mode: 'he', mcs: 3, muParts: [part], orthogonalGroup: 'g' }
    b.at(1 * MS, () => b.macs['sta-1'].onRxOk(1 * MS, f, 'ap'))
    b.runUntil(3 * MS)
    expect(b.recs('TX_START', 'sta-1').length).toBe(0)
    expect(b.delivered.some((d) => d.at === 'sta-1' && d.msduId === 7)).toBe(true)
  })
})

describe('addresses, sequence numbers and duplicates (Table 9-60, Table 10-5, §10.3.2.14.3), 2026-11-11', () => {
  it('Address 3 is the DA on the uplink (To DS) and the SA on the relayed downlink (From DS)', () => {
    const recs = run('relay-hops', 300)
    const tx = recs.filter(isTx).filter((r) => r.frame.kind === 'data' && r.frame.mpdus)
    const up = tx.find((r) => r.node !== 'ap' && r.frame.mpdus!.some((h) => h.da !== undefined))
    expect(up, 'an uplink frame bound for another station').toBeDefined()
    const h = up!.frame.mpdus!.find((x) => x.da !== undefined)!
    const i = up!.frame.mpdus!.indexOf(h)
    const d = decodeFrame(up!.frame, { apId: 'ap', isEdca: true })
    const a3 = d.users[0].subframes[i].mpdu.fields.find((f) => f.key === 'addr3')!
    expect(a3.node).toBe(h.da)
    expect(a3.roles).toEqual(['DA'])
    const down = tx.find((r) => r.node === 'ap' && r.frame.mpdus!.some((x) => x.sa === up!.node))
    expect(down, 'the AP relays it with the originating station as SA').toBeDefined()
  })

  it('the AP keeps one copy of an MSDU whose Ack never reaches the sender, and hands it on at once', () => {
    // sta-1 hears nothing from the AP, so every Ack is lost and it retries to the limit.
    const b = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -50, 'ap>sta-1': -200 })
    const m = msdu('sta-1', 'ap')
    b.enqueue(1 * MS, 'sta-1', m)
    b.runUntil(100 * MS)
    const sent = b.recs('TX_START', 'sta-1').filter((r) => r.frame.kind === 'data')
    expect(sent.length).toBeGreaterThan(3)
    expect(sent.slice(1).every((r) => r.frame.retryFlag === true)).toBe(true)
    const got = b.delivered.filter((d) => d.at === 'ap' && d.msduId === m.id)
    expect(got.length).toBe(1)
    expect(got[0].t).toBe(sent[0].t + sent[0].frame.txTimeNs)
  })

  it('QoS Data numbers per <Address 1, TID>; everything else from one baseline counter', () => {
    const q = new AcQueues()
    expect([q.nextSeq('a', 0), q.nextSeq('b', 0), q.nextSeq('a', 0), q.nextSeq('a', 6)]).toEqual([0, 0, 1, 0])
    expect([q.nextSeq('a', null), q.nextSeq('b', null), q.nextSeq('a', null)]).toEqual([0, 1, 2])
  })

  it('a retransmission is a duplicate only with Retry = 1 and a cached <TA, TID, SN>', () => {
    const q = new AcQueues()
    expect(q.rxDuplicate('s', 0, 5, false)).toBe(false)
    expect(q.rxDuplicate('s', 0, 5, true)).toBe(true)
    expect(q.rxDuplicate('s', 6, 5, true)).toBe(false)
    expect(q.rxDuplicate('t', 0, 5, true)).toBe(false)
  })
})
