import { describe, it, expect } from 'vitest'
import { LESSONS, MODULES } from '../../src/course/lessons'
import { ScenarioSchema } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
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
