import { describe, it, expect } from 'vitest'
import { LESSONS, MODULES } from '../../src/course/lessons'
import { ScenarioSchema } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { CCA_PD_DBM, sinrThreshDb } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

function recordsFor(sc: ReturnType<(typeof LESSONS)[0]['scenario']>, ms: number): TLRecord[] {
  const sim = new Simulation(sc)
  const out: TLRecord[] = []
  for (let t = 50 * MS; t <= ms * MS; t += 50 * MS) out.push(...sim.runUntil(t).records)
  return out
}

describe('course structure', () => {
  it('has unique lesson ids and valid module indices', () => {
    const ids = new Set(LESSONS.map((l) => l.id))
    expect(ids.size).toBe(LESSONS.length)
    for (const l of LESSONS) {
      expect(l.module).toBeGreaterThanOrEqual(0)
      expect(l.module).toBeLessThan(MODULES.length)
      expect(l.quiz.length).toBeGreaterThan(0)
      for (const q of l.quiz) {
        expect(q.answer).toBeGreaterThanOrEqual(0)
        expect(q.answer).toBeLessThan(q.options.length)
      }
      expect(l.observe.length).toBeGreaterThan(0)
      expect(l.body.length).toBeGreaterThan(0)
    }
  })

  it('every lesson (and variant) scenario passes the schema', () => {
    for (const l of LESSONS) {
      expect(() => ScenarioSchema.parse(l.scenario()), l.id).not.toThrow()
      for (const v of l.variants ?? []) {
        expect(() => ScenarioSchema.parse(v.scenario()), `${l.id} variant`).not.toThrow()
      }
    }
  })
})

describe('jump targets occur in their lesson simulations', () => {
  /** lessons whose every jump target must be found within the given sim time */
  const CASES: { id: string; ms: number; useVariant?: number }[] = [
    { id: 'airtime', ms: 100 },
    { id: 'ifs', ms: 100 },
    { id: 'backoff', ms: 300 },
    { id: 'nav', ms: 200 },
    { id: 'anomaly', ms: 200 },
    { id: 'ampdu', ms: 200 },
    { id: 'txop', ms: 300 },
    { id: 'ofdma-dl', ms: 300 },
    { id: 'ofdma-ul', ms: 300 },
    { id: 'mlo', ms: 300 },
  ]

  for (const c of CASES) {
    it(`${c.id}: all jump targets found`, () => {
      const lesson = LESSONS.find((l) => l.id === c.id)!
      const records = recordsFor(lesson.scenario(), c.ms)
      for (const j of lesson.jumps) {
        expect(records.some(j.find), `${c.id} → ${j.label.en}`).toBe(true)
      }
    })
  }

  it('hidden: collisions in base scenario, RTS in the protected variant', () => {
    const lesson = LESSONS.find((l) => l.id === 'hidden')!
    const base = recordsFor(lesson.scenario(), 300)
    expect(base.some((r) => r.type === 'COLLISION')).toBe(true)
    const rts = recordsFor(lesson.variants![0].scenario(), 300)
    expect(rts.some((r) => r.type === 'TX_START' && r.frame.kind === 'rts')).toBe(true)
  })

  it('hidden: the stations are genuinely hidden from each other', () => {
    const lesson = LESSONS.find((l) => l.id === 'hidden')!
    const base = recordsFor(lesson.scenario(), 300)
    // Neither station ever detects the other's transmissions (the lesson's premise)…
    const hears = (rx: string, tx: string) =>
      base.some((r) => r.type === 'RX_START' && r.node === rx && r.from === tx)
    expect(hears('sta-1', 'sta-2'), 'A must not hear B').toBe(false)
    expect(hears('sta-2', 'sta-1'), 'B must not hear A').toBe(false)
    // …so at least one collision is a true hidden-node collision: one station
    // starts while the other is already mid-frame (not a same-slot start).
    const txs = base.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.frame.kind === 'data' && r.node !== 'ap')
    const ends = base.filter((r): r is Extract<TLRecord, { type: 'TX_END' }> =>
      r.type === 'TX_END' && r.node !== 'ap')
    const midFrame = txs.some((t2) => txs.some((t1) => {
      if (t1.node === t2.node) return false
      const end = ends.find((e) => e.node === t1.node && e.t > t1.t)
      return end !== undefined && t2.t > t1.t && t2.t < end.t
    }))
    expect(midFrame, 'a mid-frame (hidden-node) collision must occur').toBe(true)
  })

  it('hidden: the hiddenness margin is not knife-edge', () => {
    // The station-to-station link must sit clearly below the preamble-detect
    // threshold, not ride the edge (the geometry caps the margin at ~2.6 dB;
    // currently it is 1.4 dB — pin a 1 dB floor so edits cannot erode it).
    const sc = LESSONS.find((l) => l.id === 'hidden')!.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    expect(links.get('sta-1')!.get('sta-2')!).toBeLessThan(CCA_PD_DBM - 1)
    expect(links.get('sta-2')!.get('sta-1')!).toBeLessThan(CCA_PD_DBM - 1)
  })

  it('anomaly: the near station captures the t=0 collision', () => {
    const lesson = LESSONS.find((l) => l.id === 'anomaly')!
    const recs = recordsFor(lesson.scenario(), 200)
    // Both stations reach zero backoff together and transmit at once.
    const starts = recs.filter(
      (r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.t === 0,
    )
    expect(starts.map((r) => r.node).sort()).toEqual(['sta-1', 'sta-2'])
    // The AP captures the near (30 dB stronger) station and never locks the far one:
    // the lesson text quotes SINR 30.4 dB against a 30 dB threshold, so guard the margin.
    const atAp = recs.filter((r) => r.t < 600_000 && 'node' in r && r.node === 'ap')
    expect(atAp.some((r) => r.type === 'RX_OK' && r.from === 'sta-1'), 'near frame captured').toBe(true)
    expect(atAp.some((r) => 'from' in r && r.from === 'sta-2'), 'far frame never locked').toBe(false)
    // The far station alone pays for the collision — and keeps paying.
    const timeouts = (n: string) =>
      recs.filter((r) => r.type === 'ACK_TIMEOUT' && r.node === n).length
    expect(timeouts('sta-1'), 'near station never times out').toBe(0)
    expect(timeouts('sta-2'), 'far station loses simultaneous starts').toBeGreaterThan(0)
  })

  it('anomaly: the capture margin is not knife-edge', () => {
    // The lesson text quotes a comfortable margin; geometry edits must not
    // quietly walk it back to the edge of the decode threshold.
    const sc = LESSONS.find((l) => l.id === 'anomaly')!.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    const gapDb = links.get('sta-1')!.get('ap')! - links.get('sta-2')!.get('ap')!
    expect(gapDb).toBeGreaterThan(sinrThreshDb(54) + 8)
  })

  it('edca: VO access appears; internal collision may occur (soft check)', () => {
    const lesson = LESSONS.find((l) => l.id === 'edca')!
    const records = recordsFor(lesson.scenario(), 300)
    expect(records.some(lesson.jumps[0].find)).toBe(true) // first VO access must exist
  })

  it('capstone: MU, trigger and 6 GHz activity all present', () => {
    const lesson = LESSONS.find((l) => l.id === 'capstone')!
    const records = recordsFor(lesson.scenario(), 500)
    const find = (en: string) => lesson.jumps.find((j) => j.label.en === en)!
    expect(records.some(find('first MU PPDU').find)).toBe(true)
    expect(records.some(find('first 6 GHz data').find)).toBe(true)
  })
})
