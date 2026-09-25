/**
 * Every empirical claim of "what the second link buys", the second half of
 * `mlo`, measured against the scene the two share.
 *
 * What arrived here with the prose (2026-09-26): the three tables — where the
 * laptop's work went, the same 300 ms with MLO off, and the run where the
 * neighbour has two radios too — the MCS both links run at, the four-of-every-five
 * split, the neighbour's 69.9% of the band's clock, and the two experiments.
 *
 * The lesson is not registered yet (the controller does that), so the shape and
 * the terminology are graded here by importing it directly.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { mloGain } from '../../src/course/tier2/mlo-gain'
import { mlo } from '../../src/course/tier2/mlo'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { ZH_TERMS, cellTexts, paragraphTexts, zhAkaViolations, zhTermFailure } from '../../src/course/readability'
import { lessonShapeSuite } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** The 300 ms every number in this lesson is measured over. */
const RUN_NS = 300 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const airMs = (xs: Tx[]): number => Math.round(xs.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS * 10) / 10

/** One run of a modified copy of the scene, with the per-node counters the panel shows. */
function view(mod: (sc: Scenario) => void = () => {}): {
  rs: TLRecord[]
  air: (id: string) => number
  wait: (id: string) => number
} {
  const sc = mloGain.scenario()
  mod(sc)
  const sim = new Simulation(sc)
  const rs = [...sim.runUntil(RUN_NS).records]
  const st = (id: string) => sim.view.nodes[id].stats
  return {
    rs,
    air: (id) => Math.round(st(id).airtimeNs / RUN_NS * 1000) / 10,
    wait: (id) => Math.round(st(id).txLatency.sumNs / st(id).txLatency.n / MS * 100) / 100,
  }
}

lessonShapeSuite(mloGain, { sameSceneAs: 'mlo', runNs: RUN_NS })

describe('mlo-gain · the lesson’s own scene', () => {
  it('is the second half of mlo: same module, same scene, still no variants', () => {
    expect(MODULES[mloGain.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mloGain.needs).toEqual(['mlo'])
    expect(mloGain.terms!.map((t) => t.term)).toEqual(['link', 'MLO'])
    expect(mloGain.variants).toBeUndefined()
    expect(mloGain.scenario()).toEqual(mlo.scenario())
    expect(() => ScenarioSchema.parse(mloGain.scenario())).not.toThrow()
  })

  it('§4 gives it no diagram: three tables, and the paragraphs that restated them are gone', () => {
    const blocks = [...mloGain.picture!, ...mloGain.numbers!]
    expect(blocks.filter((b) => b.kind === 'diagram')).toEqual([])
    expect(blocks.filter((b) => b.kind === 'table').length).toBe(3)
  })

  it('brackets every official term at its first Chinese use', () => {
    // the contract's own walk (tests/course/readability.test.ts), run here because the
    // controller has not registered this lesson yet
    const zh = [mloGain.why!, ...mloGain.outcomes!]
      .concat(paragraphTexts(mloGain.picture!), cellTexts(mloGain.picture!))
      .concat(paragraphTexts(mloGain.numbers!), cellTexts(mloGain.numbers!))
      .concat(mloGain.observe, mloGain.tryThis, mloGain.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
      .join(' ')
    const failures: string[] = []
    for (const t of ZH_TERMS.filter((x) => !x.track || x.track === 'wifi')) {
      const why = zhTermFailure(zh, t)
      if (why) failures.push(why)
      failures.push(...zhAkaViolations(zh, t))
    }
    expect(failures).toEqual([])
  })
})

describe('mlo-gain · where the laptop’s work went', () => {
  const v = view()
  const on5 = data(v.rs, 'sta-1'), on6 = data(v.rs, 'sta-1#6g')

  it('the first table is that run: 67 frames and 53.9 ms on 5 GHz, 240 and 249.6 ms on 6 GHz', () => {
    expect([on5.length, on6.length]).toEqual([67, 240])
    expect([airMs(on5), airMs(on6)]).toEqual([53.9, 249.6])
    // the "Share of that band's clock" column
    expect([v.air('sta-1'), v.air('sta-1#6g')]).toEqual([18.3, 84.2])
  })

  it('"not the faster radio": both links run at MCS 13 and 172.1 Mb/s', () => {
    for (const r of [...on5, ...on6]) {
      expect(r.frame.mcs).toBe(13)
      expect(r.frame.mbps).toBe(172.1)
    }
  })

  it('"four of every five" frames leave by the empty band, taking "almost five times" the air', () => {
    expect(Math.round(on6.length / (on5.length + on6.length) * 10) / 10).toBe(0.8)
    expect(Math.round(airMs(on6) / airMs(on5) * 10) / 10).toBe(4.6)
  })

  it('the neighbour holds 5 GHz for 69.9% of the clock, at 2.58 ms of mean wait', () => {
    expect(data(v.rs, 'sta-2').length).toBe(185)
    expect(v.air('sta-2')).toBe(69.9)
    expect(v.wait('sta-2')).toBe(2.58)
  })

  it('the laptop’s own mean waits are the 1.29 and 1.54 ms of the second table', () => {
    expect([v.wait('sta-1'), v.wait('sta-1#6g')]).toEqual([1.29, 1.54])
  })
})

describe('mlo-gain · the two experiments, which are steps 2 to 4 of the price', () => {
  const off = view((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo = false })
  const both = view((sc) => {
    const n = sc.nodes.find((x) => x.id === 'sta-2')!
    n.caps.generation = 'eht'
    n.caps.features.mlo = true
  })

  it('MLO off: one lane, 116 frames instead of 307, and the wait more than doubles', () => {
    expect(new Set(data(off.rs, 'sta-1').map((r) => r.node))).toEqual(new Set(['sta-1']))
    expect(data(off.rs, 'sta-1#6g')).toHaveLength(0)
    expect(data(off.rs, 'sta-1').length).toBe(116)
    expect(off.wait('sta-1')).toBe(3.25)
    expect(3.25).toBeGreaterThan(2 * 1.54)
  })

  it('"the neighbour does not gain": it drops from 185 frames to 116, and waits 4.18 ms', () => {
    expect(data(off.rs, 'sta-2').length).toBe(116)
    expect(off.wait('sta-2')).toBe(4.18)
  })

  it('"the two stations end up sending the same amount": 116 each, and nearly half the air each', () => {
    expect(data(off.rs, 'sta-1').length).toBe(data(off.rs, 'sta-2').length)
    // the depth's claim that this is contention being fair, not a coincidence
    for (const id of ['sta-1', 'sta-2']) {
      expect(off.air(id), id).toBeGreaterThan(40)
      expect(off.air(id), id).toBeLessThan(55)
    }
  })

  it('give the neighbour two radios and the lean vanishes: 122 against 136, 258 in all', () => {
    const l5 = data(both.rs, 'sta-1').length, l6 = data(both.rs, 'sta-1#6g').length
    expect([l5, l6]).toEqual([122, 136])
    expect(l5 + l6).toBe(258)
    // the third table's other column
    expect([data(both.rs, 'sta-2').length, data(both.rs, 'sta-2#6g').length]).toEqual([132, 106])
  })
})
