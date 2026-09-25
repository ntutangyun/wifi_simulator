/**
 * Every empirical claim in "Capstone — the busy household", measured against
 * the lesson's own scene.
 *
 * The lesson was a list of things to notice and is now a brief: one flat, one
 * question, three candidate changes, a rubric and a write-up template. The
 * three candidates are edits the learner makes in the editor rather than
 * lesson `variants` — the scene is one inline builder that takes no
 * parameters — so the scenario, and the recorded timeline hash with it, is
 * byte-identical to what it was.
 *
 * The old lesson had no test file of its own. Its pins lived in
 * tests/course/lesson-claims.test.ts ("lesson 14 · capstone": the sensor's
 * handful of frames, the airtime the backup holds, the three latency
 * collapses, and the two MLO figures) and in tests/course/lessons.test.ts (the
 * two jump targets). Both files are untouched and stay green — they read
 * `l.scenario()` only, never prose. What is pinned here is what this lesson's
 * own sentences and tables say, measured over the same five seconds the same
 * way. There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { capstone, capstoneScenario, capstoneTopology } from '../../src/course/tier2/capstone'
import type { Block } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** The five seconds every number in this lesson is measured over; the Trigger jump needs them. */
const RUN_NS = 5_000 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const r2 = (x: number): number => Math.round(x * 100) / 100

interface Scene {
  rs: TLRecord[]
  /** Share of the clock this lane held, in per cent to one decimal — the inspector's own figure. */
  air: (id: string) => number
  /** Mean wait before a frame of this lane left, in milliseconds. */
  txWait: (id: string) => number
  /** Mean wait a frame this lane received had endured, in milliseconds. */
  rxWait: (id: string) => number
  /** Bytes this lane was handed. */
  got: (id: string) => number
  /** Megabytes the access point received across both of its links: the backup, all but entirely. */
  upMb: number
}

function scene(mod: (sc: Scenario) => void = () => {}): Scene {
  const sc = capstone.scenario()
  mod(sc)
  const sim = new Simulation(sc)
  const rs = [...sim.runUntil(RUN_NS).records]
  const st = (id: string) => sim.view.nodes[id]?.stats
  const mean = (x: { n: number; sumNs: number } | undefined) => (x && x.n ? r2(x.sumNs / x.n / MS) : NaN)
  return {
    rs,
    air: (id) => Math.round((st(id)?.airtimeNs ?? 0) / RUN_NS * 1000) / 10,
    txWait: (id) => mean(st(id)?.txLatency),
    rxWait: (id) => mean(st(id)?.rxLatency),
    got: (id) => st(id)?.bytesDelivered ?? 0,
    upMb: Math.round((st('ap')!.bytesDelivered + (st('ap#6g')?.bytesDelivered ?? 0)) / 1e5) / 10,
  }
}

const base = scene()
const backupStopped = scene((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle'] })
const radioOff = scene((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo = false })
const tabletNew = scene((sc) => {
  const n = sc.nodes.find((x) => x.id === 'sta-4')!
  n.caps.generation = 'he'
  n.caps.features.ofdma = true
})

lessonShapeSuite(capstone, { runNs: RUN_NS })

describe('capstone · the flat as the brief describes it', () => {
  it('is the last Wi-Fi lesson, in the real-applications module, and names what it leans on', () => {
    expect(MODULES[capstone.module].title).toBe('真实应用')
    expect(capstone.needs).toEqual([
      'edca', 'txop', 'width', 'rate', 'anomaly', 'tier1-project', 'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo',
    ])
    expect(capstone.terms!.map((t) => t.term)).toEqual(['bottleneck', 'offered load'])
  })

  it('"three rooms with brick between them and a door in each inner wall", seven devices', () => {
    const sc = capstone.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.rooms).toHaveLength(3)
    expect(sc.walls.filter((w) => w.material === 'brick')).toHaveLength(4)
    expect(sc.walls.filter((w) => w.openings.length > 0)).toHaveLength(2)
    // the cast of the picture's first paragraph, in the order it names them
    expect(sc.nodes.filter((n) => n.kind === 'sta')).toHaveLength(6)
    expect(sc.nodes.map((n) => n.caps.generation))
      .toEqual(['eht', 'eht', 'he', 'he', 'vht', 'nonht', 'he'])
    expect(sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo).toBe(true)
    expect(sc.nodes.find((n) => n.id === 'sta-1')!.profiles).toEqual(['saturated'])
  })

  it('the topology figure is the scene’s own metres, and the accent path is the backup', () => {
    // The figure replaces the geography the picture's first paragraph used to narrate
    // (§4 · capstone: 三个房间、七台设备). Its positions are read out of the scenario, so a
    // node that moves in the room moves in the figure; what is pinned here is that the
    // walk really does read the scene, and that the one emphasised link is the one lane
    // above two per cent — the claim the caption makes.
    const spec = capstoneTopology()
    const sc = capstone.scenario()
    expect(spec.nodes.map((n) => n.id)).toEqual(sc.nodes.map((n) => n.id))
    expect(spec.nodes.map((n) => [n.x, n.y])).toEqual(sc.nodes.map((n) => [n.pos.x, n.pos.y]))
    expect(spec.nodes.filter((n) => n.role === 'ap').map((n) => n.id)).toEqual(['ap'])
    for (const n of spec.nodes) expect(n.label.trim(), n.id).not.toBe('')
    // every station reaches the air through the access point, and only through it
    expect(spec.links.every((l) => l.to === 'ap')).toBe(true)
    expect(spec.links).toHaveLength(6)
    const accent = spec.links.filter((l) => l.tone === 'accent')
    expect(accent.map((l) => l.from)).toEqual(['sta-1'])
    expect(base.air('sta-1')).toBeGreaterThan(2)
    for (const id of ['sta-2', 'sta-3', 'sta-4', 'sta-5', 'sta-6']) expect(base.air(id), id).toBeLessThan(2)
    // the figure and the lesson load one and the same room
    expect(capstone.scenario()).toEqual(capstoneScenario())
  })

  it('has no variants: the three candidate changes are the learner’s own edits', () => {
    expect(capstone.variants).toBeUndefined()
    // the four jumps tests/course/lessons.test.ts also reaches for, pinned by what each
    // predicate finds in this lesson's own run rather than by how its button reads
    expect(capstone.jumps.length).toBe(4)
    for (const j of capstone.jumps) expect(base.rs.some(j.find), String(capstone.jumps.indexOf(j))).toBe(true)
  })
})

describe('capstone · who is holding the air', () => {
  it('"the laptop holds 58.7% of 5 GHz and 90.6% of 6 GHz"', () => {
    expect([base.air('sta-1'), base.air('sta-1#6g')]).toEqual([58.7, 90.6])
  })

  it('"nothing else in the flat reaches two per cent"', () => {
    for (const id of ['sta-2', 'sta-3', 'sta-4', 'sta-5', 'sta-6']) {
      expect(base.air(id), id).toBeLessThan(2)
    }
  })

  it('the sensor sends "three frames — 384 bytes in all" in the five seconds', () => {
    const sent = data(base.rs, 'sta-5')
    expect(sent).toHaveLength(3)
    expect(sent.reduce((a, r) => a + r.frame.bytes, 0)).toBe(384)
  })
})

describe('capstone · the same five seconds, four ways', () => {
  it('the backup column: 78.0 megabytes, nothing, 37.7, and 78.1', () => {
    expect([base.upMb, radioOff.upMb, tabletNew.upMb]).toEqual([78.0, 37.7, 78.1])
    // "the backup itself then delivers nothing at all"
    expect(data(backupStopped.rs, 'sta-1')).toHaveLength(0)
    expect(data(backupStopped.rs, 'sta-1#6g')).toHaveLength(0)
    expect(backupStopped.upMb).toBe(0)
  })

  it('the video column: 2.26, 0.21, 2.22 and 2.18 ms', () => {
    expect([base.rxWait('sta-2'), backupStopped.rxWait('sta-2'), radioOff.rxWait('sta-2'), tabletNew.rxWait('sta-2')])
      .toEqual([2.26, 0.21, 2.22, 2.18])
  })

  it('the tablet column: 39.06, 0.50, 25.93 and 34.31 ms', () => {
    expect([base.rxWait('sta-4'), backupStopped.rxWait('sta-4'), radioOff.rxWait('sta-4'), tabletNew.rxWait('sta-4')])
      .toEqual([39.06, 0.5, 25.93, 34.31])
  })

  it('the voice column: 1.90, 0.83, 1.95 and 1.82 ms', () => {
    expect([base.txWait('sta-3'), backupStopped.txWait('sta-3'), radioOff.txWait('sta-3'), tabletNew.txWait('sta-3')])
      .toEqual([1.9, 0.83, 1.95, 1.82])
  })

  it('"no change alters what any of them receives": about 8.3 megabytes and 88,200 bytes throughout', () => {
    for (const s of [base, backupStopped, radioOff, tabletNew]) {
      expect(Math.round(s.got('sta-2') / 1e5) / 10).toBe(8.3)
      expect(s.got('sta-4')).toBe(88_200)
    }
  })

  it('"every other wait falls under a millisecond" once the backup stops', () => {
    for (const id of ['sta-2', 'sta-4', 'sta-6']) expect(backupStopped.rxWait(id), id).toBeLessThan(1)
    for (const id of ['sta-3', 'sta-5']) expect(backupStopped.txWait(id), id).toBeLessThan(1)
  })
})

describe('capstone · the method the brief asks the learner to follow', () => {
  const steps = capstone.numbers!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>

  it('is a procedure of at least three steps, on the main path, not in "Going deeper"', () => {
    expect(steps.items.length).toBeGreaterThanOrEqual(3)
    expect((capstone.deeper ?? []).some((b) => b.kind === 'steps')).toBe(false)
  })

  it('step 1 — the baseline it quotes is the run’s own: 58.7%, 90.6%, and nothing else at two per cent', () => {
    expect([base.air('sta-1'), base.air('sta-1#6g')]).toEqual([58.7, 90.6])
    for (const id of ['sta-2', 'sta-3', 'sta-4', 'sta-5', 'sta-6']) expect(base.air(id), id).toBeLessThan(2)
  })

  it('step 3 — the three options are editor edits, and each is one the simulator can actually take', () => {
    // there is nothing to load: the three options are edits the learner makes, and each
    // one is an edit the simulator really takes — measured here exactly as the table does
    expect(capstone.variants).toBeUndefined()
    expect(capstone.scenario().nodes.find((n) => n.id === 'sta-1')!.profiles).toEqual(['saturated'])
    expect(backupStopped.upMb).toBe(0)
    expect(radioOff.upMb).toBe(37.7)
    expect(tabletNew.rxWait('sta-4')).toBe(34.31)
    // and each of the three has an experiment of its own: the tablet column had a column in
    // the table and a quiz question but nothing to run until this re-pacing (§2 · M12)
    expect(capstone.tryThis).toHaveLength(3)
    expect(tabletNew.upMb).toBe(78.1)
  })

  it('step 5 — the sensor really is the oldest radio in the flat, and the tablet is not', () => {
    const gen = (id: string) => capstone.scenario().nodes.find((n) => n.id === id)!.caps.generation
    expect(gen('sta-5')).toBe('nonht')
    expect(gen('sta-4')).toBe('vht')
    expect(capstone.scenario().nodes.filter((n) => n.caps.generation === 'nonht').map((n) => n.id)).toEqual(['sta-5'])
    expect(data(base.rs, 'sta-5')).toHaveLength(3)
  })

  it('the comparison table names, row by row, the lane each figure is read from', () => {
    // the four-way table is the only five-column table in `numbers`: the figure, the
    // baseline and the three options. It is found by that shape rather than by its heading.
    const table = capstone.numbers!.find(
      (b) => b.kind === 'table' && b.head.length === 5,
    ) as Extract<Block, { kind: 'table' }>
    expect(table).toBeDefined()
    expect(table.rows).toHaveLength(4)
    // every row names the lane its figure is read off — a lane id, not prose
    expect(table.rows[0][0]).toContain('ap#6g')
    expect(table.rows[1][0]).toContain('sta-2')
    expect(table.rows[2][0]).toContain('sta-4')
    expect(table.rows[3][0]).toContain('sta-3')
    // and every cell is the counter this file reads off that lane
    expect(table.rows[0].slice(1).map((c) => c)).toEqual(['78.0', '0', '37.7', '78.1'])
    expect([base.upMb, backupStopped.upMb, radioOff.upMb, tabletNew.upMb]).toEqual([78.0, 0, 37.7, 78.1])
    expect(table.rows[1].slice(1).map((c) => c))
      .toEqual([base, backupStopped, radioOff, tabletNew].map((s) => `${s.rxWait('sta-2').toFixed(2)} ms`))
    expect(table.rows[2].slice(1).map((c) => c))
      .toEqual([base, backupStopped, radioOff, tabletNew].map((s) => `${s.rxWait('sta-4').toFixed(2)} ms`))
    expect(table.rows[3].slice(1).map((c) => c))
      .toEqual([base, backupStopped, radioOff, tabletNew].map((s) => `${s.txWait('sta-3').toFixed(2)} ms`))
  })
})

describe('capstone · why the tablet upgrade is nearly free of effect', () => {
  const members = (s: Scene): Set<string> => new Set(
    s.rs.flatMap((r) => (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.muParts
      ? r.frame.muParts.map((p) => p.dst) : [])),
  )

  it('"the access point never groups the tablet with the others", before or after', () => {
    expect([...members(base)].sort()).toEqual(['sta-2', 'sta-6'])
    expect([...members(tabletNew)].sort()).toEqual(['sta-2', 'sta-6'])
  })

  it('"its wait falls by about one part in eight": 39.06 ms to 34.31', () => {
    const drop = (base.rxWait('sta-4') - tabletNew.rxWait('sta-4')) / base.rxWait('sta-4')
    expect(Math.round(1 / drop)).toBe(8)
  })
})
