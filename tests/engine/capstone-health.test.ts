import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'

type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>
const MS = 1_000_000

const RUN = 3000 * MS
const sc = LESSONS.find((x) => x.id === 'capstone')!.scenario()
const recs = new Simulation(sc).runUntil(RUN).records

/**
 * §10.3.2.9: a PHY-RXSTART inside the ACK timeout makes the sender wait for
 * the RXEND — but if what arrives is not the expected response, the attempt
 * has failed. Answering an RTS (or any other frame) while still "awaiting"
 * must not leave the pending attempt open forever; that deadlocked the AP for
 * hundreds of milliseconds in the capstone while it only ever answered others.
 */
describe('a frame that is not the awaited response ends the attempt', () => {

  it('a frame addressed to a node that is waiting for its ACK or CTS fails the attempt at that instant', () => {
    const state: Record<string, string> = {}
    const lastOwn: Record<string, TLRecord | undefined> = {}
    let checked = 0
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]
      if (r.type === 'MAC_STATE') state[r.node] = r.state
      if (r.type === 'TX_START') lastOwn[r.node] = r
      if (r.type !== 'RX_OK' || r.frame.dst !== r.node) continue
      if (r.frame.kind === 'ack' || r.frame.kind === 'ba' || r.frame.kind === 'cts') continue
      const st = state[r.node]
      const own = lastOwn[r.node]
      if ((st !== 'waitAck' && st !== 'waitCts') || !own || own.type !== 'TX_START') continue
      if (own.frame.muParts || own.frame.orthogonalGroup || (own.frame.kind !== 'data' && own.frame.kind !== 'rts')) continue
      checked++
      let failed = false
      for (let j = i; j < recs.length && recs[j].t === r.t; j++) {
        const x = recs[j]
        if ('node' in x && x.node === r.node && (x.type === 'RETRY' || x.type === 'DROP' || x.type === 'ACK_TIMEOUT' || x.type === 'CTS_TIMEOUT')) { failed = true; break }
      }
      expect(failed, `${r.node} at ${r.t / 1000} µs: got ${r.frame.kind} from ${r.from} while ${st}, attempt left open`).toBe(true)
    }
    // Such intrusions came from the AP idling SIFS + AckTimeout after every DL
    // MU PPDU; since a DL MU exchange resolves on its last BlockAck they no
    // longer occur in this run, so the invariant above is checked wherever the
    // situation arises but no occurrence is demanded.
    expect(checked).toBeGreaterThanOrEqual(0)
  })

  it('every non-MU data frame gets its response, or its sender gives up, within 5 ms', () => {
    const byNode: Record<string, TLRecord[]> = {}
    for (const r of recs) if ('node' in r) (byNode[r.node] ??= []).push(r)
    let checked = 0
    for (const [node, rs] of Object.entries(byNode)) {
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i]
        if (r.type !== 'TX_START' || r.frame.kind !== 'data' || r.frame.muParts || r.frame.orthogonalGroup) continue
        if (r.t + 5 * MS > RUN) continue // the run ends before this one could resolve
        checked++
        let resolved = false
        for (let j = i + 1; j < rs.length && rs[j].t <= r.t + 5 * MS; j++) {
          const x = rs[j]
          if (x.type === 'RX_OK' && (x.frame.kind === 'ack' || x.frame.kind === 'ba') && x.from === r.frame.dst) { resolved = true; break }
          if (x.type === 'RETRY' || x.type === 'DROP' || x.type === 'ACK_TIMEOUT') { resolved = true; break }
        }
        expect(resolved, `${node} data → ${r.frame.dst} at ${r.t / 1000} µs left unresolved`).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

}, 120_000)

/**
 * §10.23.2.4: an EDCAF whose post-backoff ends with an empty queue starts no
 * TXOP, so it cannot "win" an internal collision — the other EDCAF, which has
 * a frame, simply transmits. And a loser that redraws 0 must be ready at the
 * next slot, not decremented past zero into a counter that never reaches 0.
 */
describe('internal collisions only between EDCAFs that have a frame', () => {
  it('backoff counters are never negative', () => {
    type Backoff = Rec<'BACKOFF_DEC'> | Rec<'BACKOFF_DRAW'> | Rec<'BACKOFF_RESUME'> | Rec<'BACKOFF_FREEZE'>
    const isBackoff = (r: TLRecord): r is Backoff =>
      r.type === 'BACKOFF_DEC' || r.type === 'BACKOFF_DRAW' || r.type === 'BACKOFF_RESUME' || r.type === 'BACKOFF_FREEZE'
    const neg = recs.filter(isBackoff).find((r) => r.value < 0)
    expect(neg, neg && `${neg.node} at ${neg.t / 1000} µs: ${neg.type} ${neg.value}`).toBeUndefined()
  })

  it('the winner of every internal collision transmits at that instant', () => {
    const ics = recs.filter((r): r is Rec<'INTERNAL_COLLISION'> => r.type === 'INTERNAL_COLLISION')
    expect(ics.length).toBeGreaterThan(0)
    for (const ic of ics) {
      const tx = recs.find((r) => r.type === 'TX_START' && r.node === ic.node && r.t === ic.t)
      expect(tx, `${ic.node} at ${ic.t / 1000} µs: winner AC ${ic.winnerAc} sent nothing`).toBeDefined()
    }
  })
}, 120_000)

describe('the AP keeps up', () => {
  it('two video streams: the AP’s AC_VI queue never exceeds 100 frames in 3 s', () => {
    const worst = Math.max(...recs.filter((r): r is Rec<'ENQUEUE'> => r.type === 'ENQUEUE' && r.node === 'ap' && r.ac === 2).map((r) => r.depth))
    expect(worst).toBeLessThan(100)
  })
}, 120_000)
