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
import { TGI_NS, symNsFor } from '../../src/engine/phy'
import { FADING_DEFAULTS } from '../../src/engine/fading'
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
      // M10's halves replaced their parents here: the project leans on choosing a group
      // and on what a second radio buys, which is what those two lessons teach.
      'edca', 'txop', 'width', 'rate', 'anomaly', 'tier1-project', 'ofdma-dl', 'ofdma-ul',
      'mumimo-choose', 'mlo-gain',
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
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect([base.air('sta-1'), base.air('sta-1#6g')]).toEqual([58.7, 90.6])` — with the lesson's
 * sentence as the `it` name. So the engine is pinned and the prose is not: the sampling sweep of
 * 2026-10-12 planted six of this lesson's figures and **all six went unnoticed**. Here every
 * figure is parsed out of the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the four-way table is read as the four runs it is.** Every row names a device and every
 *    column a change, so each cell is read against the run that column describes and the lane
 *    that row names — the base five seconds, the backup stopped, its second radio off, and the
 *    tablet replaced.
 *  - **the two columns that do not move are read as the invariant they state.** 「电视拿到的都是
 *    大约 8.3 兆字节，平板拿到的都是不多不少 88,200 字节」 is read over all four runs, which is
 *    what makes the sentence a claim about the changes rather than about one of them.
 *  - **the experiment's figures are read against the table's own**: every figure in `tryThis`
 *    and in the quiz is one the table already prints, so the two places cannot drift apart.
 *  - **the sensor's three frames are read with their bytes**, because 「三帧——总共 384 字节」 is
 *    one claim about one lane, and the count and the sum have to come from the same frames.
 */
describe('capstone · every figure the prose prints, read back out of it', () => {
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const NUMS = blockText(capstone.numbers)
  const DEEP = blockText(capstone.deeper)
  const LIM = blockText(capstone.limits)
  const OBS = blockText(capstone.observe)
  const TRY = blockText(capstone.tryThis)
  const QUIZ = blockText(capstone.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,%]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,%]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    capstone.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]
  /** The run a column of the four-way table is about, by the words of its own heading. */
  const sceneOf = (head: string): Scene => {
    if (head.includes('原样') || head.includes('现在')) return base
    if (head.includes('停掉') || head.includes('关掉备份')) return backupStopped
    if (head.includes('第二台电台') || head.includes('单链路')) return radioOff
    if (head.includes('平板')) return tabletNew
    throw new Error(`no run for the column 「${head}」`)
  }

  it('reads the air-share row, and the sensor beside it', () => {
    // 「笔记本占了 5 GHz 的 58.7%、6 GHz 的 90.6%」 — in a cell of `numbers` and in `observe`
    for (const text of [NUMS, OBS]) {
      const [lo, loPct, hi, hiPct] = figs(text,
        /笔记本占了 (\d) GHz 的 ([\d.]+)%、(\d) GHz 的 ([\d.]+)%/, 'the laptop’s two shares')
      expect(loPct, `its share of ${lo} GHz`).toBe(base.air('sta-1'))
      expect(hiPct, `and of ${hi} GHz`).toBe(base.air('sta-1#6g'))
      expect([lo, hi], 'the two bands it holds, in that order').toEqual([5, 6])
    }
    // 「其余没有一台到得了百分之二」
    const [twoCn] = raw(NUMS, /其余没有一台到得了百分之(.)/, '`numbers` on everybody else')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
    for (const id of ['sta-2', 'sta-3', 'sta-4', 'sta-5', 'sta-6']) {
      expect(base.air(id), `${id} is under that`).toBeLessThan(cn(twoCn!))
    }
    // 「而它五秒里一共发了三帧——总共 384 字节」
    const [framesCn, bytes] = raw(OBS, /它五秒里一共发了(.)帧——总共 ([\d,]+) 字节/,
      '`observe` on the sensor')
    const sent = data(base.rs, 'sta-5')
    expect(cn(framesCn!), 'the frames the sensor sends').toBe(sent.length)
    expect(val(bytes!), 'and the bytes they come to')
      .toBe(sent.reduce((a, r) => a + r.frame.bytes, 0))
    // 「笔记本的两条泳道是 58.7% 和 90.6%」 — the same pair, a third time
    const [p1, p2] = figs(NUMS, /笔记本的两条泳道是 ([\d.]+)% 和 ([\d.]+)%/, '`numbers` on the same pair')
    expect([p1, p2], 'the same two shares').toEqual([base.air('sta-1'), base.air('sta-1#6g')])
  })

  it('reads the four-way table as the four runs it is, cell by cell', () => {
    const t = tables().find((x) => x.rows.length >= 4 && x.head.length >= 4)!
    expect(t.head.length, 'a column per change, plus the row labels').toBeGreaterThanOrEqual(5)
    const runs = t.head.slice(1).map(sceneOf)
    for (const row of t.rows) {
      const label = row[0]!
      row.slice(1).forEach((cell, i) => {
        const s = runs[i]!
        if (label.includes('备份')) {
          // the megabytes the access point took delivery of across both its links
          const printed = raw(cell, /^([\d.]+)$/, `${label} in column ${i}`)[0]
          if (printed !== undefined) same(printed, s.upMb, `${label} in column ${i}`)
          return
        }
        const ms = /^([\d.]+) ms$/.exec(cell)
        if (!ms) return
        /*
         * **The row label names its own lane and its own measurement**: 「泳道 sta-2 的平均接收
         * 等待」. So the read takes both out of the label rather than guessing from the device's
         * name — which is also what makes the label itself part of what is pinned.
         */
        const [node] = raw(label, /泳道 (sta-\d+) 的/, `the lane the row 「${label}」 names`)
        const measured = label.includes('发送等待') ? s.txWait(node!) : s.rxWait(node!)
        expect(label.includes('发送等待') || label.includes('接收等待'),
          `the row 「${label}」 says which wait it means`).toBe(true)
        same(ms[1]!, measured, `${label} in column ${i}`)
      })
    }
  })

  it('reads the two columns that do not move, over all four runs', () => {
    // 「四个场景里，电视拿到的都是大约 8.3 兆字节，平板拿到的都是不多不少 88,200 字节」
    const [mb, bytes] = figs(NUMS,
      /电视拿到的都是大约 ([\d.]+) 兆字节，平板拿到的都是不多不少 ([\d,]+) 字节/,
      '`numbers` on what nothing changes')
    for (const s of [base, backupStopped, radioOff, tabletNew]) {
      expect(Math.round(s.got('sta-2') / 1e5) / 10, 'the television’s megabytes').toBe(mb)
      expect(s.got('sta-4'), 'and the tablet’s bytes').toBe(bytes)
    }
  })

  it('reads both experiments and the question against the table’s own figures', () => {
    // 「视频从 2.26 ms 到 0.21，语音通话从 1.90 到 0.83，平板的网页从 39.06 到 0.50」
    const [video, videoTo, voice, voiceTo, tablet, tabletTo] = figs(TRY,
      /视频从 ([\d.]+) ms 到 ([\d.]+)，语音通话从 ([\d.]+) 到 ([\d.]+)，平板的网页从 ([\d.]+) 到 ([\d.]+)/,
      '`tryThis` on the first change')
    same(String(video), base.rxWait('sta-2'), 'the television’s wait as it stands')
    same(String(videoTo), backupStopped.rxWait('sta-2'), 'and with the backup stopped')
    same(String(voice), base.txWait('sta-3'), 'the call’s wait as it stands')
    same(String(voiceTo), backupStopped.txWait('sta-3'), 'and with the backup stopped')
    same(String(tablet), base.rxWait('sta-4'), 'the tablet’s wait as it stands')
    same(String(tabletTo), backupStopped.rxWait('sta-4'), 'and with the backup stopped')
    // 「平板的等待只从 39.06 ms 降到 34.31」 — the third change, in `tryThis` and in the quiz
    for (const text of [TRY, QUIZ]) {
      const [was, now] = figs(text, /等待只从 ([\d.]+) ms 降到 ([\d.]+)/,
        'the third change’s own pair')
      same(String(was), base.rxWait('sta-4'), 'the tablet’s wait as it stands')
      same(String(now), tabletNew.rxWait('sta-4'), 'and with a newer tablet')
      expect(now, 'which is a smaller improvement than stopping the backup')
        .toBeGreaterThan(backupStopped.rxWait('sta-4'))
    }
    // 「它那 39.06 ms 不是链路慢」 — `deeper` prints it again
    const [deepMs] = figs(DEEP, /它那 ([\d.]+) ms 不是链路慢/, '`deeper` on the same wait')
    same(String(deepMs), base.rxWait('sta-4'), 'the same wait, in `deeper`')
    // 「所以平板那 39.06 ms 是一个静止房间里的数」 — and in `limits`
    const [limMs] = figs(LIM, /所以平板那 ([\d.]+) ms 是一个静止房间里的数/, '`limits` on the same wait')
    same(String(limMs), base.rxWait('sta-4'), 'and again in `limits`')
  })

  it('reads the coherence-time comparison: the two reaches, the window it holds, and the ratio', () => {
    /*
     * **Six of this lesson's figures sat in one sentence** (sweep of 2026-10-14) — the one that
     * measures this engine's coherence time against the scale the standard quantifies. Three of
     * them are this engine's own and are read here; three are the standard's and are exempt
     * below.
     */
    const [dopp, shortSym, longSym, shortUs, longUs, holdMs, times] = figs(LIM,
      /Doppler 子字段为 (\d+) 时，HE TB PPDU 里那个中段训练字段的周期只有两档，(\d+) 个符号或 (\d+) 个符号（Table 9-\d+ 与 §26\.\d+），折成 (\d+) µs 与 (\d+) µs；而本仿真器慢的那一层握着 (\d+) ms，差 (\d+) 倍/,
      '`limits` on the scale the standard quantifies')
    /*
     * **The two reaches are the symbol counts in this engine's own symbol time.** `symNsFor('he')`
     * is the data-field symbol with T_GI1,Data, which is what a midamble period is counted in, so
     * folding either count into µs is this engine's arithmetic and not a figure from elsewhere.
     * It pins the counts too: the planter moves one digit, and either digit breaks the product.
     */
    const symNs = symNsFor('he', TGI_NS.base)
    expect(shortUs! * 1_000, 'what the shorter periodicity folds into').toBe(shortSym! * symNs)
    expect(longUs! * 1_000, 'and what the longer one folds into').toBe(longSym! * symNs)
    // 「而本仿真器慢的那一层握着 100 ms」 — the configured value `fading.ts` really defaults to
    expect(holdMs, 'the coherence time this engine holds').toBe(FADING_DEFAULTS.coherenceMs)
    // 「差 735 倍」 — against the shorter reach, which is the comparison the sentence makes
    expect(times, 'how many of the shorter reach fit inside that window')
      .toBe(Math.round((holdMs! * 1_000) / shortUs!))
    /*
     * **Exempt, class (a): the Doppler subfield's value and the two symbol counts.** 「Doppler
     * 子字段为 1」 is Table 9-47's encoding and 「10 个符号或 20 个符号」 is §26.16's pair of
     * periodicities; no corpus ships with this repo, and this engine has no Doppler at all —
     * which is the sentence's whole point. What is still read of them: the subfield is the set
     * bit the sentence needs (a zero would mean no midamble, and then there would be no two
     * periodicities to fold), and the pair is ordered shorter-then-longer, which is the order
     * the two µs figures above are read in.
     */
    expect(dopp, 'the subfield value the sentence is conditioned on').toBe(1)
    expect(longSym, 'and the pair, printed shorter first').toBeGreaterThan(shortSym!)
  })

  it('reads `limits` on the two shares it quotes and the window it keeps', () => {
    // 「58.7% 与 90.6% 是这一次退避抽签的结果」
    const [lo, hi] = figs(LIM, /：([\d.]+)% 与 ([\d.]+)% 是这一次退避抽签的结果/,
      '`limits` on the two shares')
    expect([lo, hi], 'the laptop’s two lanes, a fourth time')
      .toEqual([base.air('sta-1'), base.air('sta-1#6g')])
    // 「饱和档位维持一个恒定 20 帧在手的窗口」
    /*
     * **「恒定 20 帧在手」 is the window the refill keeps, not the depth an enqueue finds.**
     * Two lanes draw from this one queue, so the depth at an enqueue runs from 1 to the window;
     * what the figure names is the ceiling, and the run really reaches it.
     */
    const [window] = figs(LIM, /维持一个恒定 (\d+) 帧在手的窗口/, '`limits` on the saturated window')
    const depth = base.rs.filter((r): r is Extract<TLRecord, { type: 'ENQUEUE' }> =>
      r.type === 'ENQUEUE' && r.node === 'sta-1').map((r) => r.depth)
    expect(Math.max(...depth), 'the deepest the backup’s queue ever gets').toBe(window)
    expect(depth.filter((d) => d === window).length, 'which it really reaches').toBeGreaterThan(0)
    expect(Math.max(...depth), 'and never passes').toBeLessThanOrEqual(window!)
  })
})
