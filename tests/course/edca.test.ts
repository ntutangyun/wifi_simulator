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
const RUN_NS = 300 * MS

const recs = (): TLRecord[] => runOf(edca, undefined, RUN_NS)
const draws = (rs: TLRecord[], node: string) => ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === node)
const ifsLens = (rs: TLRecord[], node: string, kind: string) =>
  ofType(rs, 'IFS_START').filter((r) => r.node === node && r.kind === kind).map((r) => r.untilNs - r.t)
const firstData = (rs: TLRecord[], node: string) =>
  ofType(rs, 'TX_START').find((r) => r.node === node && r.frame.kind === 'data')!
const lane = (label: string): TimingLane => edcaAifsTiming().lanes.find((l) => l.label === label)!

const runSc = (sc: ReturnType<typeof edca.scenario>): TLRecord[] => [...new Simulation(sc).runUntil(RUN_NS).records]

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The run is 300 ms: the backup's first frame, which jump 1 finds, is 55 ms in.
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
    // step 6's closing sentence, "every station here runs a single class, so this step never
    // fired in this scene"
    for (const n of sc.nodes) expect(n.profiles).toHaveLength(1)
    expect(ofType(recs(), 'INTERNAL_COLLISION')).toHaveLength(0)
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
