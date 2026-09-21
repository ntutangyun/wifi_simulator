/**
 * Every empirical claim in "MLO — one queue, two radios", measured against the
 * lesson's own scene.
 *
 * The lesson was 233 words of assertion and is now the picture of a second
 * door: what the two links keep apart, what the shared pile buys its owner,
 * what it buys the neighbour it left behind, and what is left of it once the
 * neighbour has two radios too. The scenario builder is untouched and there
 * are still no variants, so the recorded timeline hash is the same run.
 *
 * The old lesson had no test file of its own. Its pins lived in
 * tests/course/lesson-claims.test.ts ("lesson 13 · MLO": both links carry data
 * and the traffic leans to 6 GHz) and tests/course/lessons.test.ts (the jump
 * targets, and the simultaneous RTS on the access point's lane); both files
 * are untouched and stay green — they read `l.scenario()` only, never prose.
 * There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { mlo } from '../../src/course/tier2/mlo'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, runOf } from './kit'

const MS = 1_000_000
/** The 300 ms every number in this lesson is measured over — and the window the jumps need. */
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
  const sc = mlo.scenario()
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

lessonShapeSuite(mlo, { proseMax: 900, runNs: RUN_NS })

describe('mlo · the lesson’s own scene', () => {
  it('is the scheduled-Wi-Fi module’s last lesson, and names where its words come from', () => {
    expect(mlo.module).toBe(6)
    expect(mlo.needs).toEqual(['retries-queues', 'txop-protect', 'width'])
    // "queue" is retries-queues' word, the shared air is txop-protect's, the band is width's;
    // these three are this lesson's own.
    expect(mlo.terms!.map((t) => t.term)).toEqual(['link', 'MLO', 'MLD'])
  })

  it('keeps the scenario builder untouched: one room, three devices, no variants', () => {
    const sc = mlo.scenario()
    expect(mlo.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    // "the laptop … two radios"; "the neighbour has 5 GHz and nothing else"
    expect(sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo).toBe(true)
    expect(sc.nodes.find((n) => n.id === 'sta-2')!.caps.features.mlo).toBeFalsy()
    expect(sc.nodes.find((n) => n.id === 'sta-2')!.caps.generation).toBe('he')
  })

  it('"nobody at all is using 6 GHz": only the laptop and the access point are there', () => {
    const rs = runOf(mlo, undefined, RUN_NS)
    const on6 = new Set(rs.flatMap((r) => (r.type === 'TX_START' && r.node.includes('#6g') ? [r.node] : [])))
    expect([...on6].sort()).toEqual(['ap#6g', 'sta-1#6g'])
  })
})

describe('mlo · where the laptop’s work went', () => {
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

  it('"four of every five" frames leave by the quiet door, taking "almost five times" the air', () => {
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

describe('mlo · the two experiments', () => {
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

  it('give the neighbour two radios and the lean vanishes: 122 against 136, 258 in all', () => {
    const l5 = data(both.rs, 'sta-1').length, l6 = data(both.rs, 'sta-1#6g').length
    expect([l5, l6]).toEqual([122, 136])
    expect(l5 + l6).toBe(258)
    // the third table's other column
    expect([data(both.rs, 'sta-2').length, data(both.rs, 'sta-2#6g').length]).toEqual([132, 106])
  })
})

describe('mlo · the depth and the provenance', () => {
  it('"Going deeper" still names the single-radio form the standard also allows', () => {
    // pinned because tests/course/lessons.test.ts asserts the course as a whole says so
    expect(JSON.stringify(mlo.deeper)).toMatch(/EMLSR/)
  })
})
