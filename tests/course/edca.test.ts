/**
 * Every empirical claim in "EDCA — four queues, two numbers", measured against
 * the lesson's own scenario.
 *
 * The lesson had no test file of its own before the readability rewrite: its
 * pins lived in tests/course/lesson-claims.test.ts ("lesson 7 · EDCA" and the
 * two-voice-queues experiment), which still holds them and still passes.
 *
 * Re-paced on 2026-09-25 (§2 M8 of the re-pacing plan). What went to
 * tests/course/edca-cost.test.ts with the prose: the three-station table (the
 * draws, the means and the queue waits), the 103 µs punishment wait and the
 * run's EIFS census, the backup's first frame at 55 ms and the EDCA-off
 * experiment. What arrived: the four AIFS figure, whose spans are the engine's
 * own `aifsNs` and whose zero point is a record of this run.
 */
import { describe, it, expect } from 'vitest'
import { edca, edcaAifsTiming } from '../../src/course/tier2/edca'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { EDCA_PARAMS, OFDM_5G, aifsNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
/**
 * 400 ms, raised from 300 on slice W1.
 *
 * Why it moved: this scene fires exactly one `INTERNAL_COLLISION`, at 362.6426 ms, and step
 * 6 of the procedure is the step that teaches internal collisions. At 300 ms the test could
 * not see it, so the step's closing half-sentence ("every station here runs a single class,
 * so this step never fired in this scene") was pinned by an assertion that the count is
 * ZERO — a captor holding a false sentence in place.
 *
 * It was false for the READER the whole time, which is the part worth keeping: the browser's
 * recording is not this constant. `Player.load` asks the worker for `LOOKAHEAD_NS` = 2 s of
 * sim time up front, so the reader's timeline has always held 362.6426 ms. The 300 ms hid
 * the record from the test alone.
 */
const RUN_NS = 400 * MS

const recs = (): TLRecord[] => runOf(edca, undefined, RUN_NS)
const draws = (rs: TLRecord[], node: string) => ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === node)
const ifsLens = (rs: TLRecord[], node: string, kind: string) =>
  ofType(rs, 'IFS_START').filter((r) => r.node === node && r.kind === kind).map((r) => r.untilNs - r.t)
const firstData = (rs: TLRecord[], node: string) =>
  ofType(rs, 'TX_START').find((r) => r.node === node && r.frame.kind === 'data')!
const lane = (label: string): TimingLane => edcaAifsTiming().lanes.find((l) => l.label === label)!

const runSc = (sc: ReturnType<typeof edca.scenario>): TLRecord[] => [...new Simulation(sc).runUntil(RUN_NS).records]

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// It re-checks every jump predicate against this window; jump 1 is the 362.6426 ms internal
// collision, so the window has to reach it. (The old comment here described a jump 1 that
// finds "the backup's first frame at 55 ms" — that jump left for `edca-cost` on 2026-09-25
// and the comment stayed behind pointing at an index that had nothing in it.)
lessonShapeSuite(edca, { runNs: RUN_NS })

describe('edca · the lesson’s own scene', () => {
  it('is the first lesson of Tier 2, and leans on the two channel-access lessons', () => {
    expect(MODULES[edca.module].title).toBe('QoS 与效率')
    // §6 of the re-pacing plan: the doubling window moved to `collisions-cw`, so the edge
    // that carries it moves with it.
    expect(edca.needs).toEqual(['ifs', 'backoff', 'collisions-cw'])
    expect(edca.terms!.map((t) => t.term)).toEqual(['EDCA', 'access category', 'AIFS'])
  })

  it('the scenario is one room, one access point and three single-class stations', () => {
    const sc = edca.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => [n.id, n.profiles[0]])).toEqual([
      ['ap', 'idle'], ['sta-1', 'voice'], ['sta-2', 'saturated'], ['sta-3', 'backup'],
    ])
    // step 6's opening clause, "the three stations here each run a single class": still true,
    // and still the reason the step cannot fire on any of THEM. What it is no longer allowed
    // to be is the reason the step never fires at all — see the next test.
    for (const n of sc.nodes) expect(n.profiles).toHaveLength(1)
  })

  /**
   * Step 6's closing sentences, and the whole of slice W1.
   *
   * The access point is the one device in this room holding more than one EDCAF, because it
   * queues a return leg for the caller and one for the uploader while running `['idle']`
   * itself — so it is the only device on which two of its own queues can reach zero in the
   * same slot. The lesson used to say the step "never fired in this scene" and gave "every
   * station runs a single class" as the reason; the clause was true and the inference was
   * not, because the access point is not one of the stations.
   */
  it('fires exactly one internal collision, on the access point, at 362.6426 ms', () => {
    const rs = recs()
    const ics = ofType(rs, 'INTERNAL_COLLISION')
    expect(ics).toHaveLength(1)
    // "一次，在 362.6426 ms：语音赢，尽力而为那条记一次重传"
    expect(ics[0].t / MS).toBe(362.6426)
    expect(ics[0].node).toBe('ap')
    const ac = (name: string) => EDCA_PARAMS.findIndex((p) => p.name === name)
    expect(ics[0].winnerAc).toBe(ac('VO'))
    expect(ics[0].loserAc).toBe(ac('BE'))

    // "手里同时握着语音和尽力而为两条队列，而两条就够了": the access point's own EDCAFs, and
    // the fact that it is the ONLY device here with more than one. Two is the whole condition.
    const acsOf = (node: string) =>
      new Set(ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === node).map((r) => r.ac))
    expect([...acsOf('ap')].sort()).toEqual([ac('BE'), ac('VO')].sort())
    for (const n of ['sta-1', 'sta-2', 'sta-3']) expect(acsOf(n).size, n).toBe(1)

    // "窗口从 127 翻到 255" — the losing queue takes the external-collision treatment: its
    // window doubles and it draws again, both inside the same nanosecond.
    const cws = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'ap' && r.ac === ac('BE'))
    expect(cws.filter((r) => r.t < ics[0].t).at(-1)!.cw).toBe(127)
    expect(cws.find((r) => r.t === ics[0].t)!.cw).toBe(255)
    // `node` matters here and the first draft of this line left it out: the uploader is AC_BE
    // too and happens to draw in the same nanosecond, with a window of 15. The assertion read
    // 15 and the mistake was the test's, not the engine's.
    expect(ofType(rs, 'BACKOFF_DRAW')
      .find((r) => r.t === ics[0].t && r.node === 'ap' && r.ac === ac('BE'))!.cw).toBe(255)
    // and 255 is on the way to BE's CWmax, not at it, so "doubling towards CWmax" is honest
    expect(EDCA_PARAMS[ac('BE')].cwMax).toBe(1023)

    // "它一微秒空口时间（airtime）也不花": the loser emits nothing. The only transmission
    // starting at that instant is the winner's.
    const txs = ofType(rs, 'TX_START').filter((r) => r.t === ics[0].t)
    expect(txs.map((r) => [r.node, r.frame.kind])).toEqual([['ap', 'data']])
    expect(ofType(rs, 'TXOP_START').find((r) => r.t === ics[0].t)!.ac).toBe(ac('VO'))

    // the jump the prose sends the reader to lands on exactly this record
    const j = edca.jumps[1]
    expect(j.label).toBe('接入点上的内部碰撞')
    expect(rs.filter(j.find)).toEqual(ics)
  })
})

describe('edca · what each class is given', () => {
  it('the table’s four silences and four first draws are the engine’s own parameters', () => {
    // "Silence first": VO 34, VI 34, BE 43, BK 79 µs — and "First draw from": 0–3, 0–7, 0–15, 0–15
    const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
    expect(EDCA_PARAMS.map((p) => p.name)).toEqual(['BK', 'BE', 'VI', 'VO'])
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => aifsNs(p.aifsn, OFDM_5G) / US))
      .toEqual([34, 34, 43, 79])
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => p.cwMin)).toEqual([3, 7, 15, 15])
    // the two columns the mechanism rewrite added: "AIFSN (slots of silence)" and
    // "Doubling up to CWmax (the largest)"
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => p.aifsn)).toEqual([2, 2, 3, 7])
    expect([by('VO'), by('VI'), by('BE'), by('BK')].map((p) => p.cwMax)).toEqual([7, 15, 1023, 1023])
  })

  it('the six steps are the order the MAC takes them in, with its own constants', () => {
    // step 2: AIFS = SIFS + AIFSN x slot, and the old fixed wait is the same sum at AIFSN 2
    expect(aifsNs(2, OFDM_5G)).toBe(OFDM_5G.sifsNs + 2 * OFDM_5G.slotNs)
    expect(OFDM_5G.difsNs).toBe(aifsNs(2, OFDM_5G))
    // step 4: the draw starts from CWmin, and step 6 doubles towards CWmax
    for (const p of EDCA_PARAMS) expect(p.cwMax).toBeGreaterThanOrEqual(p.cwMin)
    // the longer wait after a frame that could not be decoded left with the material that
    // moved to `edca-cost`; step 3 now says only "a complete, unbroken AIFS".
    const steps = edca.numbers!.filter((b) => b.kind === 'steps')
    expect(steps).toHaveLength(1)
    expect(JSON.stringify(steps)).not.toContain('EIFS')
  })

  it('the formula is SIFS + n slots, with n = 2, 3 and 7 the only values in play', () => {
    // "silence = SIFS + n × slot = 16 + n × 9 µs,  n = 2, 3 or 7"
    expect(OFDM_5G.sifsNs / US).toBe(16)
    expect(OFDM_5G.slotNs / US).toBe(9)
    expect([...new Set(EDCA_PARAMS.map((p) => p.aifsn))].sort()).toEqual([2, 3, 7])
    expect(aifsNs(2, OFDM_5G)).toBe(34 * US)
    // "the old one-size-fits-all wait was this same sum with n fixed at two"
    expect(OFDM_5G.difsNs).toBe(aifsNs(2, OFDM_5G))
  })
})

describe('edca · the four silences, as the figure draws them', () => {
  const rs = recs()
  /** The IFS the worked table starts from: the last AIFS before the caller's first frame. */
  const workedIfs = () => {
    const tx = firstData(rs, 'sta-1')
    return ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-1' && r.kind === 'AIFS' && r.t < tx.t).at(-1)!
  }

  it('each lane is that class’s own aifsNs, from a zero point this run really has', () => {
    const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
    const span = (label: string) => lane(label).spans[0]
    for (const [label, ac] of [['VO 语音', 'VO'], ['VI 视频', 'VI'], ['BE 尽力', 'BE'], ['BK 后台', 'BK']] as const) {
      const s = span(label)
      expect(s.fromUs, label).toBe(0)
      expect(s.toUs * US, label).toBe(aifsNs(by(ac).aifsn, OFDM_5G))
      expect(s.label, label).toBe(`${s.toUs} µs`)
    }
    // "the zero point is 23.0816 ms, the moment the air goes idle before the caller's first
    // voice frame": the caption's instant is the record the worked table opens with, and the
    // VO lane is that record's own length.
    const ifs = workedIfs()
    expect(ifs.t / MS).toBe(23.0816)
    expect((ifs.untilNs - ifs.t) / US).toBe(span('VO 语音').toUs)
    // the first lane is the frame that really ended there: the access point's 32 µs answer
    const before = ofType(rs, 'TX_START').filter((r) => r.t + r.frame.txTimeNs === ifs.t)
    expect(before).toHaveLength(1)
    expect(before[0].node).toBe('ap')
    expect(span('空口').fromUs * US).toBe(-before[0].frame.txTimeNs)
    // and the caption's "34 µs and 43 µs are both running at this instant"
    const at = ofType(rs, 'IFS_START').filter((r) => r.t === ifs.t && r.kind === 'AIFS')
    expect(new Set(at.map((r) => (r.untilNs - r.t) / US))).toContain(34)
    expect(new Set(at.map((r) => (r.untilNs - r.t) / US))).toContain(43)
    expect(at.some((r) => (r.untilNs - r.t) / US === 79)).toBe(false)
  })

  it('the head start the caption states is five slots, 45 µs', () => {
    // "the top lane and the bottom one are 45 µs apart, five slots exactly"
    const vo = lane('VO 语音').spans[0].toUs
    const bk = lane('BK 后台').spans[0].toUs
    expect(bk - vo).toBe(45)
    expect((bk - vo) / (OFDM_5G.slotNs / US)).toBe(5)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(edcaAifsTiming())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})

describe('edca · what the three stations actually did', () => {
  const rs = recs()

  it('each station keeps one class, one silence and that class’s two windows', () => {
    // the two observations: "AC_VO, never wider than 7" / "AC_BK, never narrower than 15,
    // above a silence of 79 µs" / "34 µs on the caller, 43 µs on the uploader, all run long"
    expect(new Set(draws(rs, 'sta-1').map((d) => d.ac))).toEqual(new Set([3]))
    expect(new Set(draws(rs, 'sta-2').map((d) => d.ac))).toEqual(new Set([1]))
    expect(new Set(draws(rs, 'sta-3').map((d) => d.ac))).toEqual(new Set([0]))
    for (const d of draws(rs, 'sta-1')) expect([3, 7]).toContain(d.cw)
    for (const d of draws(rs, 'sta-3')) expect(d.cw).toBeGreaterThanOrEqual(15)
    expect(new Set(ifsLens(rs, 'sta-1', 'AIFS'))).toEqual(new Set([34 * US]))
    expect(new Set(ifsLens(rs, 'sta-3', 'AIFS'))).toEqual(new Set([79 * US]))
    // the uploader's own AIFS is 43 µs; the zero-length one is the in-burst case, not a wait
    expect(new Set(ifsLens(rs, 'sta-2', 'AIFS'))).toEqual(new Set([0, 43 * US]))
  })
})

describe('edca · the caller’s first voice frame, run through the steps', () => {
  const rs = recs()

  it('every row of the worked example is that access, record by record', () => {
    const tx = firstData(rs, 'sta-1')
    const ifs = ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-1' && r.kind === 'AIFS' && r.t < tx.t).at(-1)!
    // "the air goes idle again" / "AIFS for this class = 16 + 2 x 9" / "so the counter may start at"
    expect(ifs.t / MS).toBe(23.0816)
    expect((ifs.untilNs - ifs.t) / US).toBe(34)
    expect(ifs.untilNs / MS).toBe(23.1156)
    // "draw between 0 and the smallest window, 3" -> 2
    const draw = draws(rs, 'sta-1').filter((d) => d.t <= tx.t).at(-1)!
    expect([draw.t, draw.value, draw.cw]).toEqual([ifs.untilNs, 2, 3])
    // "the end of the AIFS is a slot boundary" (2 -> 1) and "one more idle slot, 9 µs" (1 -> 0)
    const decs = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-1' && r.t >= draw.t && r.t <= tx.t)
    expect(decs.map((d) => [d.t / MS, d.value])).toEqual([[23.1156, 1], [23.1246, 0]])
    expect(decs[1].t - decs[0].t).toBe(OFDM_5G.slotNs)
    // "a counter already at zero waits one more boundary, 9 µs" — the row the whole-track
    // review found missing: without it the table went 23.1156 + 9 µs = 23.1246 and the
    // reader's arithmetic could not reach the answer. The closure, not just the endpoints:
    expect(tx.t - decs[1].t).toBe(OFDM_5G.slotNs)
    expect((decs[1].t + OFDM_5G.slotNs) / MS).toBe(23.1336)
    // "the voice frame goes out at"
    expect(tx.t / MS).toBe(23.1336)
    // "a background queue starting at the same instant would still owe 27 µs"
    expect((aifsNs(7, OFDM_5G) - (tx.t - ifs.t)) / US).toBe(27)
  })

  it('every jump target occurs in the run', () => {
    for (const j of edca.jumps) expect(recs().some(j.find), j.label).toBe(true)
  })
})

describe('edca · the experiment', () => {
  it('making the uploader a second voice station raises the caller’s collision rate', () => {
    // "two voice queues now draw from the same tiny range, and they collide with each other far
    // more often than before" — the same claim lesson-claims.test.ts pins over 1 000 ms.
    const sc = edca.scenario()
    sc.nodes.find((n) => n.id === 'sta-2')!.profiles = ['voice']
    const rate = (x: TLRecord[]) => ofType(x, 'COLLISION').filter((c) => c.nodes.includes('sta-1')).length
      / ofType(x, 'TX_START').filter((r) => r.node === 'sta-1' && r.frame.kind === 'data').length
    expect(rate(runSc(sc))).toBeGreaterThan(1.3 * rate(recs()))
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures the right thing and compares it with a figure typed on **this** side
 * — `expect(ifs.t / MS).toBe(23.0816)` — with the lesson's sentence quoted in a comment. So the
 * engine is pinned and the prose is not: the sampling sweep of 2026-10-12 planted six of this
 * lesson's figures and **all six went unnoticed**. Here every figure is parsed out of the shipped
 * string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **the four-class table is read as the engine's own parameter table.** Each row's AIFSN, its
 *    silence, its first window and its largest are `EDCA_PARAMS`' four fields for the class the
 *    row names, and the silence has to be `aifsNs` of that row's own AIFSN — so the table cannot
 *    be internally consistent and still wrong.
 *  - **the formula is read as the sum it prints, and the set of values it allows.** 「16 + AIFSN
 *    × 9 µs，AIFSN 取 2、3 或 7」 is SIFS, the slot, and the three AIFSNs that really occur in
 *    the four rows — read as a set, because any member of a wider set would satisfy a
 *    membership test.
 *  - **the worked example is read as one access, record by record**: the instant the air goes
 *    quiet, the silence this class owes, the draw, both decrements, the boundary a zeroed counter
 *    still waits, and the frame — each from the records of that very frame.
 *  - **the figure's own caption is read against the lanes it draws**, including 「最上和最下相差
 *    45 µs，正好五个时隙」, which is the two lanes' difference in slots.
 */
describe('edca · every figure the prose prints, read back out of it', () => {
  const rs = recs()
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
  const NUMS = blockText(edca.numbers)
  const LIM = blockText(edca.limits)
  const SRC = blockText(edca.sources)
  const OBS = blockText(edca.observe)
  const QUIZ = blockText(edca.quiz)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const tables = (): { heading?: string; rows: string[][] }[] =>
    edca.numbers!.filter((b) => b.kind === 'table') as unknown as
      { heading?: string; rows: string[][] }[]
  const caption = (): string =>
    (edca.numbers!.find((b) => b.kind === 'diagram') as unknown as { caption: string }).caption
  const formulaText = (): string =>
    (edca.numbers!.find((b) => b.kind === 'formula') as unknown as { text: string }).text
  const formulaNote = (): string =>
    (edca.numbers!.find((b) => b.kind === 'formula') as unknown as { note: string }).note
  const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
  /** The options of the question about the background class's silence, in their own order. */
  const bkQuizOptions = (): string[] =>
    edca.quiz.find((x) => x.q.includes('AIFSN'))!.options
  /** The class a row of the four-class table is about, by the Latin name in its own label. */
  const classOf = (label: string): string => {
    const hit = EDCA_PARAMS.find((p) => label.startsWith(p.name))
    expect(hit, `no access category named by 「${label}」`).toBeDefined()
    return hit!.name
  }

  it('reads the four-class table against the engine’s own parameter table', () => {
    const t = tables()[0]!
    expect(t.rows, 'one row per access category').toHaveLength(EDCA_PARAMS.length)
    for (const row of t.rows) {
      const ac = classOf(row[0]!)
      const p = by(ac)
      const [aifsn] = figs(row[1]!, /^(\d+)$/, `${ac}’s AIFSN`)
      expect(aifsn, `the slots of silence ${ac} owes`).toBe(p.aifsn)
      const [silence] = figs(row[2]!, /^(\d+) µs$/, `${ac}’s silence`)
      expect(silence! * US, `which is ${ac}’s own AIFS`).toBe(aifsNs(aifsn!, OFDM_5G))
      const [cwMin] = figs(row[3]!, /^(\d+)$/, `${ac}’s first window`)
      expect(cwMin, `the window ${ac} starts from`).toBe(p.cwMin)
      const [cwMax] = figs(row[4]!, /^(\d+)$/, `${ac}’s largest window`)
      expect(cwMax, `and the one it doubles up to`).toBe(p.cwMax)
      expect(cwMax, 'which is never under the first').toBeGreaterThanOrEqual(cwMin!)
    }
    // the four rows are the four classes, and the run really runs three of them
    expect(t.rows.map((r) => classOf(r[0]!)).sort(), 'all four of them')
      .toEqual([...EDCA_PARAMS].map((p) => p.name).sort())
    const acsRun = new Set([...draws(rs, 'sta-1'), ...draws(rs, 'sta-2'), ...draws(rs, 'sta-3')]
      .map((d) => d.ac))
    expect(acsRun.size, 'three of which this scene puts on the air').toBe(3)
    /*
     * **And the column heading, which the 「第」 rule change of 2026-10-14 uncovered**: 「第一次
     * 抽取：0 到最小竞争窗口 CWmin」. The 0 is the bottom of the draw and it is INCLUSIVE —
     * which is a claim the run answers, because a draw of zero really happens in it (that is
     * what makes 「0 到 CWmin」 a window of CWmin + 1 values, not CWmin).
     */
    const h = /第一次抽取：(\d+) 到最小竞争窗口/.exec(t.head[3]!)
    expect(h, 'the column no longer says where the draw starts').not.toBeNull()
    const allDraws = [...draws(rs, 'sta-1'), ...draws(rs, 'sta-2'), ...draws(rs, 'sta-3')]
    expect(Math.min(...allDraws.map((d) => d.value)), 'the lowest draw this run ever makes')
      .toBe(Number(h![1]))
    for (const d of allDraws) {
      expect(d.value, `a draw of ${d.value} is inside its own window`)
        .toBeGreaterThanOrEqual(Number(h![1]))
      expect(d.value, 'and never above it').toBeLessThanOrEqual(d.cw)
    }
  })

  it('reads the formula as the sum it prints and the set of values it allows', () => {
    // 「AIFS = SIFS + AIFSN × 时隙 = 16 + AIFSN × 9 µs，AIFSN 取 2、3 或 7」
    const [sifs, slot, a, b, c] = figs(formulaText(),
      /= (\d+) \+ AIFSN × (\d+) µs，AIFSN 取 (\d+)、(\d+) 或 (\d+)/, 'the formula’s own terms')
    expect(sifs! * US, 'the short interframe space').toBe(OFDM_5G.sifsNs)
    expect(slot! * US, 'one slot').toBe(OFDM_5G.slotNs)
    expect([a, b, c].sort((x, y) => x - y), 'the AIFSNs the four classes really use')
      .toEqual([...new Set(EDCA_PARAMS.map((p) => p.aifsn))].sort((x, y) => x - y))
    for (const n of [a!, b!, c!]) {
      expect(sifs! * US + n * slot! * US, `the sum at AIFSN ${n}`).toBe(aifsNs(n, OFDM_5G))
    }
    // 「把仲裁帧间间隔数…钉死在 2」 — the old one-size-fits-all wait is that same sum
    const [fixed] = figs(formulaNote(), /钉死在 (\d+)：一个常数被改成了参数/, 'the note on the old wait')
    expect(aifsNs(fixed!, OFDM_5G), 'which is the engine’s own DIFS').toBe(OFDM_5G.difsNs)
    // the steps print two of the three silences again
    const [twoSlots, twoUs, sevenSlots, sevenUs] = raw(NUMS,
      /(.)个时隙是 (\d+) µs，(.)个时隙是 (\d+) µs/, 'the steps on two of the silences')
    // 「两」 is the counting form of 「二」, which is what the steps use
    const cn = (s: string): number =>
      '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
    expect(val(twoUs!) * US, `the silence at AIFSN ${cn(twoSlots!)}`)
      .toBe(aifsNs(cn(twoSlots!), OFDM_5G))
    expect(val(sevenUs!) * US, `and at AIFSN ${cn(sevenSlots!)}`)
      .toBe(aifsNs(cn(sevenSlots!), OFDM_5G))
    // 「此后每过一个 9 µs 的空闲时隙」 and 「也就是再过 9 µs」 — the slot, twice more
    for (const [us] of [...NUMS.matchAll(/(\d+) µs 的空闲时隙/g)].map((m) => m.slice(1))) {
      expect(val(us!) * US, 'the slot the counter walks down in').toBe(OFDM_5G.slotNs)
    }
    const [again] = figs(NUMS, /也就是再过 (\d+) µs/, 'the steps on the boundary a zero waits')
    expect(again! * US, 'which is one more slot').toBe(OFDM_5G.slotNs)
  })

  it('reads the caption against the lanes the figure draws', () => {
    const cap = caption()
    // 「零点取本轮的 23.0816 ms：接入点那个 32 µs 的回答刚刚结束」
    const [zeroMs, answerUs] = figs(cap, /零点取本轮的 ([\d.]+) ms：接入点（access point, AP）那个 (\d+) µs 的回答刚刚结束/,
      'the caption on its own zero point')
    const tx = firstData(rs, 'sta-1')
    const ifs = ofType(rs, 'IFS_START')
      .filter((r) => r.node === 'sta-1' && r.kind === 'AIFS' && r.t < tx.t).at(-1)!
    same(String(zeroMs), ifs.t / MS, 'the instant the air goes quiet')
    const before = ofType(rs, 'TX_START').filter((r) => r.t + r.frame.txTimeNs === ifs.t)
    expect(before, 'one frame really ends there').toHaveLength(1)
    expect(before[0]!.node, 'and it is the access point’s').toBe('ap')
    expect(answerUs! * US, 'its own airtime').toBe(before[0]!.frame.txTimeNs)
    // 「这一刻真的在跑的是 34 µs 和 43 µs 两条；79 µs 那条是同一个和式按后台的时隙数算出来的」
    const [a1, a2, drawn] = figs(cap,
      /真的在跑的是 (\d+) µs 和 (\d+) µs 两条[^]*?；(\d+) µs 那条是同一个和式/,
      'the caption on which lanes are running')
    const running = new Set(ofType(rs, 'IFS_START')
      .filter((r) => r.t === ifs.t && r.kind === 'AIFS').map((r) => (r.untilNs - r.t) / US))
    expect(running.has(a1!) && running.has(a2!), 'both of those really start at that instant')
      .toBe(true)
    expect(running.has(drawn!), 'while the third is drawn, not run').toBe(false)
    expect(drawn! * US, 'and it is the sum at the background class’s own AIFSN')
      .toBe(aifsNs(by('BK').aifsn, OFDM_5G))
    // 「最上和最下相差 45 µs，正好五个时隙」
    const [gap, slotsCn] = raw(cap, /最上和最下相差 (\d+) µs，正好(.)个时隙/, 'the caption on the head start')
    const vo = lane('VO 语音').spans[0]!.toUs
    const bk = lane('BK 后台').spans[0]!.toUs
    expect(val(gap!), 'the difference between the top lane and the bottom').toBe(bk - vo)
    // 「两」 is the counting form of 「二」, which is what the steps use
    const cn = (s: string): number =>
      '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
    expect(cn(slotsCn!), 'which is that many slots').toBe(val(gap!) / (OFDM_5G.slotNs / US))
  })

  it('reads the figure’s own axis note: zero is the end of the frame', () => {
    /*
     * **The axis note is a figure too** (sweep of 2026-10-14): 「0 是帧尾」 says where the
     * drawing's zero is, and the lane that draws the air before it has to end exactly there.
     */
    const spec = edcaAifsTiming()
    const [zero] = figs(spec.axis!.unit!, /（(\d+) 是帧尾）/, 'the axis’ own note')
    const airLane = spec.lanes.find((l) => l.label === '空口')!
    expect(airLane.spans[0]!.toUs, 'the frame the figure draws ends at that zero').toBe(zero)
    expect(airLane.spans[0]!.fromUs, 'and it starts before it').toBeLessThan(zero!)
  })

  it('reads the worked example as one access, record by record', () => {
    const t = tables()[1]!
    const row = (needle: string): string => t.rows.find((r) => r[0]!.includes(needle))![1]!
    const tx = firstData(rs, 'sta-1')
    const ifs = ofType(rs, 'IFS_START')
      .filter((r) => r.node === 'sta-1' && r.kind === 'AIFS' && r.t < tx.t).at(-1)!
    same(raw(row('空中重新安静下来'), /^([\d.]+) ms$/, 'the quiet instant')[0]!, ifs.t / MS,
      'when the air goes quiet')
    // 「这一类的 AIFS = 16 + 2 × 9 | 34 µs」
    const label = t.rows.find((r) => r[0]!.includes('AIFS ='))![0]!
    const [sifs, aifsn, slot] = figs(label, /AIFS = (\d+) \+ (\d+) × (\d+)/, 'the row’s own sum')
    expect([sifs! * US, slot! * US], 'the two constants the sum is of')
      .toEqual([OFDM_5G.sifsNs, OFDM_5G.slotNs])
    expect(aifsn, 'and the caller’s own AIFSN').toBe(by('VO').aifsn)
    const [silence] = figs(row('AIFS ='), /^(\d+) µs$/, 'the silence it comes to')
    expect(silence! * US, 'which is what the record really lasts').toBe(ifs.untilNs - ifs.t)
    same(raw(row('计数器可以从这一刻开始走'), /^([\d.]+) ms$/, 'when the counter may start')[0]!,
      ifs.untilNs / MS, 'the end of that silence')
    // 「在 0 与最小竞争窗口 3 之间抽取 | 2」
    const [from, cwMin] = figs(row('之间抽取').length > 0
      ? t.rows.find((r) => r[0]!.includes('之间抽取'))![0]!
      : '', /在 (\d+) 与最小竞争窗口 (\d+) 之间抽取/, 'the row’s own range')
    const draw = draws(rs, 'sta-1').filter((d) => d.t <= tx.t).at(-1)!
    expect([from, cwMin], 'the range the caller draws from').toEqual([0, draw.cw])
    expect(cwMin, 'which is this class’s first window').toBe(by('VO').cwMin)
    const [drawn] = figs(row('之间抽取'), /^(\d+)$/, 'the value it draws')
    expect(drawn, 'what it really drew').toBe(draw.value)
    // the two decrements, and the boundary a zeroed counter still waits
    const decs = ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-1' && r.t >= draw.t && r.t <= tx.t)
    const [firstMs, was1, now1] = figs(row('AIFS 的结束本身就是一个时隙边界'),
      /^([\d.]+) ms · (\d+) → (\d+)$/, 'the first decrement')
    same(String(firstMs), decs[0]!.t / MS, 'when the counter first steps')
    expect([was1, now1], 'from what to what').toEqual([drawn, decs[0]!.value])
    const [secondMs, was2, now2] = figs(row('再过一个'), /^([\d.]+) ms · (\d+) → (\d+)$/,
      'the second decrement')
    same(String(secondMs), decs[1]!.t / MS, 'when it steps again')
    expect([was2, now2], 'and to zero').toEqual([decs[0]!.value, decs[1]!.value])
    const [slotUs] = figs(t.rows.find((r) => r[0]!.includes('再过一个'))![0]!, /再过一个 (\d+) µs/,
      'the row’s own slot')
    expect(slotUs! * US, 'which is one slot apart').toBe(decs[1]!.t - decs[0]!.t)
    const [waitUs] = figs(row('已经停在零的计数器'), /^(\d+) µs$/, 'the boundary a zero waits')
    expect(waitUs! * US, 'the slot between the last decrement and the frame')
      .toBe(tx.t - decs[1]!.t)
    same(raw(row('这一帧语音发出去的时刻'), /^([\d.]+) ms$/, 'when the frame goes out')[0]!,
      tx.t / MS, 'the instant the voice frame leaves')
    // 「同一刻起步的后台队列，此时还欠着 | 27 µs」
    const [owed] = figs(row('还欠着'), /^(\d+) µs$/, 'what a background queue would still owe')
    expect(owed! * US, 'the rest of its own silence at that instant')
      .toBe(aifsNs(by('BK').aifsn, OFDM_5G) - (tx.t - ifs.t))
  })

  it('reads the internal collision, `observe`, `limits` and the question', () => {
    // 「整轮里它触发过一次，在 362.6426 ms：语音赢，尽力而为那条记一次重传、窗口从 127 翻到 255」
    const [atMs, was, now] = figs(NUMS,
      /整轮里它触发过一次，在 ([\d.]+) ms：语音赢，尽力而为那条记一次重传、窗口从 (\d+) 翻到 (\d+)/,
      '`numbers` on the internal collision')
    const cw = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'ap' && r.cw === now)
    expect(cw.length, 'the access point really doubles that window').toBeGreaterThan(0)
    same(String(atMs), cw[0]!.t / MS, 'when the internal collision happens')
    expect(now, 'twice the window before it, plus one').toBe(2 * was! + 1)
    expect(now, 'and never past this class’s largest').toBeLessThanOrEqual(by('BE').cwMax)
    // `observe`: 「块上的窗口从不宽过 7」, 「从不窄于 15，而且上面那段静默是 79 µs」
    const [voMax] = figs(OBS, /块上的窗口从不宽过 (\d+)/, '`observe` on the caller’s windows')
    expect(Math.max(...draws(rs, 'sta-1').map((d) => d.cw)), 'the widest window the caller draws from')
      .toBe(voMax)
    expect(voMax, 'which is this class’s own largest').toBe(by('VO').cwMax)
    const [bkMin, bkSilence] = figs(OBS, /从不窄于 (\d+)，而且上面那段静默是 (\d+) µs/,
      '`observe` on the background station')
    expect(Math.min(...draws(rs, 'sta-3').map((d) => d.cw)), 'the narrowest window it draws from')
      .toBe(bkMin)
    expect(new Set(ifsLens(rs, 'sta-3', 'AIFS')), 'and the silence above it')
      .toEqual(new Set([bkSilence! * US]))
    // 「通话站点的每一段都是 34 µs…上传站点的每一段是 43 µs。整轮下来，这两个数一次也没变过」
    const [callerUs, uploaderUs] = figs(OBS, /通话站点的每一段都是 (\d+) µs[^]*?上传站点的每一段是 (\d+) µs/,
      '`observe` on the two silences')
    expect(new Set(ifsLens(rs, 'sta-1', 'AIFS')), 'the caller’s, every time')
      .toEqual(new Set([callerUs! * US]))
    expect([...new Set(ifsLens(rs, 'sta-2', 'AIFS'))].filter((x) => x > 0),
      'and the uploader’s').toEqual([uploaderUs! * US])
    // `limits`: 「本课那 45 µs 的提前量」 and 「每个 9 µs 时隙边界」
    const [headStart] = figs(LIM, /本课那 (\d+) µs 的提前量/, '`limits` on the head start')
    expect(headStart, 'the same head start the caption states')
      .toBe((aifsNs(by('BK').aifsn, OFDM_5G) - aifsNs(by('VO').aifsn, OFDM_5G)) / US)
    const [limSlot] = figs(LIM, /每个 (\d+) µs 时隙边界/, '`limits` on the slot')
    expect(limSlot! * US, 'the slot every boundary of this engine falls on').toBe(OFDM_5G.slotNs)
    // `sources`: 「16 µs 与 9 µs 取自 §17.4」
    const [srcSifs, srcSlot] = figs(SRC, /其中 (\d+) µs 与 (\d+) µs 取自/, '`sources` on the two constants')
    expect([srcSifs! * US, srcSlot! * US], 'the same two the formula uses')
      .toEqual([OFDM_5G.sifsNs, OFDM_5G.slotNs])
    // the quiz: 「后台这一类的 AIFSN 是 7」, 「16 + 7 × 9 = 79 µs」, 「语音的 2 个时隙给出 34 µs」
    const [qAifsn] = figs(QUIZ, /后台这一类的 AIFSN 是 (\d+)/, 'the question on the background AIFSN')
    expect(qAifsn, 'the background class’s own AIFSN').toBe(by('BK').aifsn)
    const [qSifs, qN, qSlot, qSum] = figs(QUIZ, /(\d+) \+ (\d+) × (\d+) = (\d+) µs/,
      'the explanation’s own sum')
    expect([qSifs! * US, qSlot! * US], 'the two constants').toEqual([OFDM_5G.sifsNs, OFDM_5G.slotNs])
    expect(qN, 'at the background AIFSN').toBe(qAifsn)
    expect(qSum! * US, 'and the silence it comes to').toBe(aifsNs(qN!, OFDM_5G))
    const [voN, voUs] = figs(QUIZ, /语音的 (\d+) 个时隙给出 (\d+) µs/, 'the explanation on voice')
    expect(voN, 'the voice class’s own AIFSN').toBe(by('VO').aifsn)
    expect(voUs! * US, 'and its silence').toBe(aifsNs(voN!, OFDM_5G))
    /*
     * **The two wrong options are the two mistakes the question is about** (the sweep of
     * 2026-10-14 caught the second): 「7 µs」 is the AIFSN read as microseconds, and 「63 µs」 is
     * the slots counted without the short interframe space — the sum's second term alone.
     */
    const opts = bkQuizOptions()
    const us = (s: string): number => val(raw(s, /^(\d+) µs$/, 'an option of that question')[0]!)
    expect([us(opts[0]!), us(opts[1]!)], 'the AIFSN as microseconds, and the slots alone')
      .toEqual([by('BK').aifsn, (by('BK').aifsn * OFDM_5G.slotNs) / US])
    expect(us(opts[2]!), 'against the sum itself').toBe(aifsNs(by('BK').aifsn, OFDM_5G) / US)
  })
})
