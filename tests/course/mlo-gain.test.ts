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
import { LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'

const MS = 1_000_000
/** The 300 ms every number in this lesson is measured over. */
const RUN_NS = 300 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const airMs = (xs: Tx[]): number => Math.round(xs.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS * 10) / 10

interface View {
  rs: TLRecord[]
  air: (id: string) => number
  wait: (id: string) => number
}

/**
 * One run of a modified copy of the scene, with the per-node counters the panel shows —
 * **memoised by the name of the modification**, because the read-back below asks for the same
 * three scenes this file already runs, and the suite's simulated work is bounded
 * (tests/simCost.ts). The engine is deterministic, so a shared run is the same run.
 */
const views = new Map<string, View>()
function viewOf(key: string, mod: (sc: Scenario) => void = () => {}): View {
  const hit = views.get(key)
  if (hit) return hit
  const made = view(mod)
  views.set(key, made)
  return made
}

function view(mod: (sc: Scenario) => void = () => {}): View {
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
  const v = viewOf('base')
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
  const off = viewOf('off', (sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo = false })
  const both = viewOf('both', (sc) => {
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
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect([on5.length, on6.length]).toEqual([67, 240])`, with the lesson's sentence in the `it`
 * name. So the engine is pinned and the prose is not: the sampling sweep of 2026-10-12 planted
 * six of this lesson's figures and **all six went unnoticed**. Here each figure is parsed out of
 * the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the three tables are read as the three runs they are**, each cell against the run its own
 *    heading names: the base 300 ms, the same window with the laptop's MLO switched off, and the
 *    one where the neighbour has two radios too. The row labels carry the band, so a cell is
 *    addressed by the lane it belongs to rather than by its position.
 *  - **the bands are read as the lanes the engine really builds.** 「5 GHz」 and 「6 GHz」 are not
 *    decoration here: they name the two virtual nodes the run emits frames from, and the read
 *    requires the lane named by each row to be the one the figure was measured on.
 *  - **「每五帧里有四帧」 and 「差不多是…五倍」 are read as the quotients they are**, to the
 *    tenth the sentence implies, so a planted digit in either count moves them.
 *  - **the neighbour's share is read as the panel shows it**, which is what 「占着这个频段 69.9%
 *    的时钟」 means — airtime over the window, answers included, not frames over frames.
 */
describe('mlo-gain · every figure the prose prints, read back out of it', () => {
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
  const PIC = blockText(mloGain.picture)
  const NUMS = blockText(mloGain.numbers)
  const DEEP = blockText(mloGain.deeper)
  const LIM = blockText(mloGain.limits)
  const SRC = blockText(mloGain.sources)
  const OBS = blockText(mloGain.observe)
  const TRY = blockText(mloGain.tryThis)
  const QUIZ = blockText(mloGain.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,%]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,%]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tables = (): { heading?: string; head: string[]; rows: string[][] }[] =>
    mloGain.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; head: string[]; rows: string[][] }[]
  /** The node a lane name stands for: the laptop's two links are two nodes in the records. */
  const laneNode = (who: 'sta-1' | 'sta-2', ghz: number): string => (ghz === 6 ? `${who}#6g` : who)

  it('reads the first table as the run it is, lane by lane', () => {
    const v = viewOf('base')
    const t = tables()[0]!
    const [windowMs] = figs(t.heading!, /最初 (\d+) ms/, 'the first table’s own window')
    expect(windowMs! * MS, 'the window every figure of this lesson is measured over').toBe(RUN_NS)
    expect(t.rows, 'one row per link the laptop has').toHaveLength(2)
    const shares: number[] = []
    const frames: number[] = []
    for (const row of t.rows) {
      const [ghz] = figs(row[0]!, /^(\d) GHz$/, 'the row’s own lane')
      const node = laneNode('sta-1', ghz!)
      const sent = data(v.rs, node)
      expect(sent.length, `the lane ${ghz} GHz really is a lane of this run`).toBeGreaterThan(0)
      const [count] = figs(row[1]!, /^(\d+)$/, `the frames on ${ghz} GHz`)
      expect(count, `what the laptop sends on ${ghz} GHz`).toBe(sent.length)
      same(raw(row[2]!, /^([\d.]+) ms$/, `the air on ${ghz} GHz`)[0]!, airMs(sent),
        `the air those frames take on ${ghz} GHz`)
      const [share] = figs(row[3]!, /^([\d.]+)%$/, `the share of ${ghz} GHz`)
      expect(share, `the share of that band’s clock, as the panel counts it`).toBe(v.air(node))
      shares.push(share!)
      frames.push(count!)
    }
    // 「每五帧里有四帧从那边走，带走的空口时间差不多是留下那些帧的五倍」
    const [ofFive, four] = raw(NUMS, /每(.)帧里有(.)帧从那边走/, '`numbers` on the split')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s)
    expect(Math.round((frames[1]! / (frames[0]! + frames[1]!)) * cn(ofFive!)) / cn(ofFive!),
      'the share of frames that leaves by the empty band')
      .toBe(cn(four!) / cn(ofFive!))
    const [times] = raw(NUMS, /带走的空口时间差不多是留下那些帧的(.)倍/, '`numbers` on the air')
    expect(Math.round(airMs(data(v.rs, 'sta-1#6g')) / airMs(data(v.rs, 'sta-1'))),
      'how many times the air the empty band carries').toBe(cn(times!))
    // 「两条链路跑的是同一级…MCS 13，172.1 Mb/s」
    const [mcs, mbps] = figs(NUMS, /MCS (\d+)，([\d.]+) Mb\/s/, '`numbers` on the rung both links run')
    for (const node of ['sta-1', 'sta-1#6g']) {
      for (const r of data(v.rs, node)) {
        expect(r.frame.mcs, `${node} runs that rung`).toBe(mcs)
        expect(r.frame.mbps, `${node} at that rate`).toBe(mbps)
      }
    }
  })

  it('reads the MLO-off table as its own run, row by row', () => {
    const on = viewOf('base')
    const off = viewOf('off')
    const t = tables()[1]!
    const [windowMs] = figs(t.heading!, /同样的 (\d+) ms/, 'the second table’s own window')
    expect(windowMs! * MS, 'the same window').toBe(RUN_NS)
    const row = (needle: string): string[] => t.rows.find((r) => r[0]!.includes(needle))!
    // 「笔记本的数据帧 | 307 | 116」
    const [withBoth] = figs(row('笔记本的数据帧')[1]!, /^(\d+)$/, 'the laptop’s frames with MLO')
    const [withOne] = figs(row('笔记本的数据帧')[2]!, /^(\d+)$/, 'and with it off')
    expect(withBoth, 'the two lanes together').toBe(data(on.rs, 'sta-1').length + data(on.rs, 'sta-1#6g').length)
    expect(withOne, 'and the one lane that is left').toBe(data(off.rs, 'sta-1').length)
    expect(data(off.rs, 'sta-1#6g'), 'the second lane being gone entirely').toHaveLength(0)
    // 「笔记本发送前的平均等待（5 GHz / 6 GHz） | 1.29 / 1.54 ms | 3.25 ms」
    const waitRow = row('笔记本发送前的平均等待')
    const [lane5, lane6] = figs(waitRow[0]!, /（(\d) GHz \/ (\d) GHz）/, 'the row’s own two lanes')
    const [w5, w6] = figs(waitRow[1]!, /^([\d.]+) \/ ([\d.]+) ms$/, 'the two waits with MLO')
    expect(w5, `the wait on ${lane5} GHz`).toBe(on.wait(laneNode('sta-1', lane5!)))
    expect(w6, `and on ${lane6} GHz`).toBe(on.wait(laneNode('sta-1', lane6!)))
    const [wOff] = figs(waitRow[2]!, /^([\d.]+) ms$/, 'the wait with MLO off')
    expect(wOff, 'the wait the one lane leaves').toBe(off.wait('sta-1'))
    expect(wOff, 'which is more than twice the longer of the two').toBeGreaterThan(2 * w6!)
    // 「邻居的数据帧 | 185 | 116」 and 「邻居发送前的平均等待 | 2.58 ms | 4.18 ms」
    const [nbOn] = figs(row('邻居的数据帧')[1]!, /^(\d+)$/, 'the neighbour’s frames')
    const [nbOff] = figs(row('邻居的数据帧')[2]!, /^(\d+)$/, 'and with the laptop on one lane')
    expect(nbOn, 'what the neighbour sends beside an MLO laptop').toBe(data(on.rs, 'sta-2').length)
    expect(nbOff, 'and beside a single-lane one').toBe(data(off.rs, 'sta-2').length)
    expect(nbOff, 'which is fewer, not more').toBeLessThan(nbOn!)
    const nbWait = row('邻居发送前的平均等待')
    expect(figs(nbWait[1]!, /^([\d.]+) ms$/, 'the neighbour’s wait')[0], 'as the panel shows it')
      .toBe(on.wait('sta-2'))
    expect(figs(nbWait[2]!, /^([\d.]+) ms$/, 'and with MLO off')[0], 'longer, not shorter')
      .toBe(off.wait('sta-2'))
    // 「把第二条链路关掉，笔记本和邻居都落到 116 帧」 — `deeper` prints that count again
    const [deepBoth] = figs(DEEP, /笔记本和邻居都落到 (\d+) 帧/, '`deeper` on the two counts')
    expect(deepBoth, 'the same count, and the same for both of them').toBe(withOne)
    expect(data(off.rs, 'sta-2').length, 'which is the neighbour’s too').toBe(deepBoth)
  })

  it('reads the two-radio table, and the experiment that produced it', () => {
    const both = viewOf('both')
    const t = tables()[2]!
    for (const row of t.rows) {
      const [ghz] = figs(row[0]!, /^(\d) GHz$/, 'the row’s own lane')
      const [laptop] = figs(row[1]!, /^(\d+)$/, `the laptop on ${ghz} GHz`)
      const [neighbour] = figs(row[2]!, /^(\d+)$/, `the neighbour on ${ghz} GHz`)
      expect(laptop, `what the laptop sends on ${ghz} GHz`)
        .toBe(data(both.rs, laneNode('sta-1', ghz!)).length)
      expect(neighbour, `and what the neighbour sends there`)
        .toBe(data(both.rs, laneNode('sta-2', ghz!)).length)
    }
    // 「5 GHz 上 122 帧，6 GHz 上 136 帧，总量掉到 258」, in `tryThis` and again in the quiz
    const [tGhz5, t5, tGhz6, t6, total] = figs(TRY,
      /(\d) GHz 上 (\d+) 帧，(\d) GHz 上 (\d+) 帧，总量掉到 (\d+)/,
      '`tryThis` on the second experiment')
    expect(t5, `the laptop on ${tGhz5} GHz`).toBe(data(both.rs, laneNode('sta-1', tGhz5!)).length)
    expect(t6, `and on ${tGhz6} GHz`).toBe(data(both.rs, laneNode('sta-1', tGhz6!)).length)
    expect(total, 'the two together').toBe(t5! + t6!)
    const [qWas, qNow] = figs(QUIZ, /总量从 (\d+) 帧掉到 (\d+)/, 'the second question on the same pair')
    expect(qNow, 'the same total the experiment gives').toBe(total)
    const on = viewOf('base')
    expect(qWas, 'against what one MLO device alone had')
      .toBe(data(on.rs, 'sta-1').length + data(on.rs, 'sta-1#6g').length)
  })

  it('reads `observe`, the first experiment and the first question', () => {
    const on = viewOf('base')
    const off = viewOf('off')
    // 「最初 300 ms 里，5 GHz 上 67 个数据帧，6 GHz 上 240 个」
    const [obsMs, g5, c5, g6, c6] = figs(OBS,
      /最初 (\d+) ms 里，(\d) GHz 上 (\d+) 个数据帧，(\d) GHz 上 (\d+) 个/,
      '`observe` on the two lanes')
    expect(obsMs! * MS, 'the window').toBe(RUN_NS)
    expect(c5, `the frames on ${g5} GHz`).toBe(data(on.rs, laneNode('sta-1', g5!)).length)
    expect(c6, `and on ${g6} GHz`).toBe(data(on.rs, laneNode('sta-1', g6!)).length)
    // 「它占着这个频段 69.9% 的时钟」
    const [nbGhz] = figs(OBS, /邻居只有 (\d) GHz/, '`observe` on the neighbour’s one band')
    const [nbShare] = figs(OBS, /而它占着这个频段 ([\d.]+)% 的时钟/, '`observe` on its share')
    expect(nbShare, 'the share of that band’s clock the neighbour holds').toBe(on.air('sta-2'))
    expect(nbGhz, 'the band it is on, which is the laptop’s busy lane').toBe(g5)
    // 「同样的 300 ms 里只有 116 个数据帧，而不是 307，发送前的平均等待涨到两倍以上」
    const [tryMs, tryOne, tryBoth] = figs(TRY,
      /同样的 (\d+) ms 里只有 (\d+) 个数据帧，而不是 (\d+)/, '`tryThis` on the first experiment')
    expect(tryMs! * MS, 'the same window again').toBe(RUN_NS)
    expect(tryOne, 'the frames one lane sends').toBe(data(off.rs, 'sta-1').length)
    expect(tryBoth, 'against two lanes')
      .toBe(data(on.rs, 'sta-1').length + data(on.rs, 'sta-1#6g').length)
    expect(off.wait('sta-1'), 'and the wait really does more than double')
      .toBeGreaterThan(2 * Math.max(on.wait('sta-1'), on.wait('sta-1#6g')))
    // 「它自己也从 185 帧掉到 116 帧」, in `tryThis` and again in the first question
    for (const [was, now] of every([TRY, QUIZ].join('\n'), /从 (\d+) 帧掉到 (\d+) 帧/g,
      'the neighbour’s two counts, printed twice', 2)) {
      expect(val(was!), 'what the neighbour had').toBe(data(on.rs, 'sta-2').length)
      expect(val(now!), 'and what it is left with').toBe(data(off.rs, 'sta-2').length)
    }
  })

  it('reads the two bands `picture` names as the two lanes the run really has', () => {
    const on = viewOf('base')
    /*
     * **A band name is a figure here.** 「邻居把 5 GHz 占满了，而 6 GHz 上除了笔记本和接入点
     * 之外一个人也没有」 names the two lanes, and the run says which is which: everything the
     * neighbour sends is on the one, and the only senders on the other are the laptop and the
     * access point.
     */
    const [busy, empty] = figs(PIC, /邻居把 (\d) GHz 占满了，而 (\d) GHz 上除了笔记本和接入点/,
      '`picture` on the two bands')
    const senders = (ghz: number): Set<string> => new Set(on.rs
      .filter((r): r is Tx => r.type === 'TX_START')
      .filter((r) => (ghz === 6) === r.node.endsWith('#6g'))
      .map((r) => r.node))
    expect([...senders(busy!)].sort(), 'who sends on the band the neighbour fills')
      .toEqual(['ap', 'sta-1', 'sta-2'])
    expect([...senders(empty!)].sort(), 'and who sends on the other one')
      .toEqual(['ap#6g', 'sta-1#6g'])
    // 「笔记本的方块在 5 GHz 那条泳道上越来越稀，在 6 GHz 那条上越堆越多」
    const [thin, thick] = figs(PIC, /笔记本的方块在 (\d) GHz 那条泳道上越来越稀，在 (\d) GHz 那条上越堆越多/,
      '`picture` on which lane fills up')
    expect(data(on.rs, laneNode('sta-1', thick!)).length, 'the lane that fills up')
      .toBeGreaterThan(data(on.rs, laneNode('sta-1', thin!)).length)
    expect([thin, thick], 'which are the busy and the empty band, in that order')
      .toEqual([busy, empty])
  })

  it('reads every other band this lesson names, each against the lane it means', () => {
    const on = viewOf('base')
    const off = viewOf('off')
    const lanes = (ghz: number): Set<string> => new Set(on.rs
      .filter((r): r is Tx => r.type === 'TX_START')
      .filter((r) => (ghz === 6) === r.node.endsWith('#6g'))
      .map((r) => r.node))
    /*
     * **The sweep of 2026-10-14 found every one of these eight.** A band name looked like
     * decoration, so nothing read it; but each one is a claim about which lane the sentence is
     * about, and the run answers every one.
     */
    // `picture`: 「于是笔记本的帧大部分都从 6 GHz 那条链路出去了」
    const [mostly] = figs(PIC, /于是笔记本的帧大部分都从 (\d) GHz 那条链路出去了/,
      '`picture` on where most of the frames go')
    const mostlyNode = laneNode('sta-1', mostly!)
    expect(data(on.rs, mostlyNode).length, 'the lane most of the laptop’s frames leave by')
      .toBeGreaterThan(
        data(on.rs, mostlyNode === 'sta-1' ? 'sta-1#6g' : 'sta-1').length)
    // `limits`: 「所以 6 GHz 上除了这台笔记本和它的接入点，不可能有第三个人」
    const [onlyTwo] = figs(LIM, /所以 (\d) GHz 上除了这台笔记本和它的接入点/,
      '`limits` on the band with nobody else on it')
    expect([...lanes(onlyTwo!)].sort(), 'and nobody else ever sends there')
      .toEqual(['ap#6g', 'sta-1#6g'])
    // `limits`: 「同一堵砖墙在 6 GHz 上比在 5 GHz 上更难穿」 — the two bands, and what the
    // engine does instead: one constant per band, the same at every wall and every distance
    const [wallHi, wallLo] = figs(LIM, /同一堵砖墙在 (\d) GHz 上比在 (\d) GHz 上更难穿/,
      '`limits` on what it does not model')
    expect([wallHi, wallLo], 'the two bands this room runs')
      .toEqual([onlyTwo, Number(raw(PIC, /邻居把 (\d) GHz 占满了/, '`picture` on the busy band')[0])])
    expect(wallHi, 'the upper of the two, which is the band the engine adds its constant to')
      .toBe(6)
    expect(LINK_EXTRA_LOSS_DB['6g'], 'and that constant is a number, not a function of the wall')
      .toBeGreaterThan(0)
    // the quiz: 「只剩 5 GHz 那条链路」, 「让出了 6 GHz，5 GHz 上就它们两个了」, 「在 5 GHz 上
    // 一帧一帧地抢」 — every one of them is about the lane the laptop is left with
    const [qLeft] = figs(QUIZ, /只剩 (\d) GHz 那条链路/, 'the question on the lane it is left with')
    expect(new Set(data(off.rs, laneNode('sta-1', qLeft!)).map((r) => r.node)).size,
      'the laptop still sends there with MLO off').toBe(1)
    expect(data(off.rs, qLeft === 6 ? 'sta-1' : 'sta-1#6g'), 'and nowhere else').toHaveLength(0)
    const [gaveUp, nowTwo] = figs(QUIZ, /笔记本让出了 (\d) GHz，(\d) GHz 上就它们两个了/,
      'the wrong answer’s own two bands')
    expect(gaveUp, 'the band it gives up').not.toBe(qLeft)
    expect(nowTwo, 'and the one they then share').toBe(qLeft)
    expect(data(off.rs, laneNode('sta-1', gaveUp!)), 'which it really does leave entirely')
      .toHaveLength(0)
    const [fighting] = figs(QUIZ, /笔记本现在要在 (\d) GHz 上一帧一帧地抢/,
      'the right answer’s own band')
    expect(fighting, 'the band it has to fight for').toBe(qLeft)
    expect(off.wait('sta-1'), 'and fighting for it really costs it the wait')
      .toBeGreaterThan(on.wait(laneNode('sta-1', qLeft!)))
  })

  it('reads `limits` and `sources` on the two bands and the one run behind every figure', () => {
    // 「LINK_EXTRA_LOSS_DB 给 6 GHz 一律多记 1.2 dB、给 2.4 GHz 一律少记 6.5 dB」
    const [hiGhz, hiDb, loGhz, loDb] = figs(LIM,
      /给 (\d) GHz 一律多记 ([\d.]+) dB、给 ([\d.]+) GHz 一律少记 ([\d.]+) dB/,
      '`limits` on the engine’s own band offsets')
    expect(LINK_EXTRA_LOSS_DB['6g'], 'what the engine adds on the upper band').toBe(hiDb)
    expect(LINK_EXTRA_LOSS_DB['2g'], 'and what it takes off the lower one').toBe(-loDb!)
    expect(hiGhz, 'the band it adds to').toBe(6)
    expect(loGhz, 'and the band it takes off').toBe(2.4)
    // 「这几张表里的每一个数都来自同一个种子的一次 300 ms 运行…所以「67 比 240」不带任何误差范围」
    const [limMs] = figs(LIM, /同一个种子的一次 (\d+) ms 运行/, '`limits` on the one run')
    expect(limMs! * MS, 'the window behind every table').toBe(RUN_NS)
    const [a, b] = figs(LIM, /所以「(\d+) 比 (\d+)」不带任何误差范围/, '`limits` on the ratio it quotes')
    const on = viewOf('base')
    expect([a, b], 'the two counts of the first table')
      .toEqual([data(on.rs, 'sta-1').length, data(on.rs, 'sta-1#6g').length])
    // 「6 GHz 那条泳道的等待略长于 5 GHz」
    const [srcHi, srcLo] = figs(SRC, /(\d) GHz 那条泳道的等待略长于 (\d) GHz/,
      '`sources` on the two waits')
    expect(on.wait(laneNode('sta-1', srcHi!)), 'the busier lane waits longer')
      .toBeGreaterThan(on.wait(laneNode('sta-1', srcLo!)))
    // 「这里它并没有因为对方让出 5 GHz 而得利」 — the band the laptop would be giving up
    const [stepGhz] = figs(NUMS, /并没有因为对方让出 (\d) GHz 而得利/, 'the steps on the band')
    expect(stepGhz, 'the shared band, which is the neighbour’s only one').toBe(srcLo)
  })
})
