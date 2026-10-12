/**
 * Every empirical claim in "RTS/CTS：让接收方替你预约信道", the second half of `hidden`
 * (2026-09-25 re-pacing, §2 M5).
 *
 * The scene is `hidden`'s, so `lessonShapeSuite(..., { sameSceneAs: 'hidden' })`
 * proves the two ids replay the same timeline — base scene and protected variant
 * alike — and that their fixture lines agree once the controller has written
 * them.
 *
 * Nine pins arrive here from tests/course/hidden.test.ts, asserted against the
 * same two runs they always were: the protected column of the on/off table, the
 * 94 % cut, the 20-byte question and the 14-byte answer, the 245 reservations,
 * the per-100 ms ticks, the six procedure steps with their 718 µs worked round,
 * and both `deeper` notes. Nothing was re-derived and nothing was relaxed.
 *
 * The lesson is not registered in src/course/lessons.ts yet — the controller does
 * that when the batch lands — so the contract tests that walk LESSONS cannot see
 * it. Both the terminology rule and the course-wide diagram geometry check are
 * therefore re-run here over this one lesson, with the same helpers
 * tests/course/readability.test.ts and tests/course/diagram.test.ts use.
 */
import { describe, it, expect } from 'vitest'
import { rtsCts, rtsCtsSequence } from '../../src/course/tier1/rts-cts'
import { hidden } from '../../src/course/tier1/hidden'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { buildLinkTable, wallsCrossed } from '../../src/engine/propagation'
import { zhNumeral } from './coverage'
import {
  CCA_PD_DBM, CTS_BYTES, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, MANDATORY_MBPS, RTS_BYTES, SIFS_NS,
  SLOT_NS,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES, trackOf } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type SequenceMessage, type Shape } from '../../src/course/diagram'
import {
  ZH_TERMS, cellTexts, paragraphTexts, bracketedAtFirstZhUse, zhAkaViolations, zhTermFailure,
} from '../../src/course/readability'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
/** 300 ms: the window both columns of the on/off table are counted over. */
const RUN_NS = 300 * MS

const base = (): TLRecord[] => runOf(rtsCts, undefined, RUN_NS)
const prot = (): TLRecord[] => runOf(rtsCts, 0, RUN_NS)
const txs = (rs: TLRecord[], p: (r: Tx) => boolean = () => true): Tx[] =>
  ofType(rs, 'TX_START').filter(p)
const acked = (rs: TLRecord[], n: string): number =>
  txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === n).length

/** The frame the receiver had locked when a collision was reported, and the ones that ruined it. */
function collisionFrames(rs: TLRecord[], c: Extract<TLRecord, { type: 'COLLISION' }>): { locked: Tx; others: Tx[] } {
  const all = txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
  const locked = all.filter((r) => r.t + r.frame.txTimeNs === c.t)[0]
  const others = all.filter((r) => r.node !== locked.node && r.t + r.frame.txTimeNs > locked.t)
  return { locked, others }
}
const collisions = (rs: TLRecord[]): { locked: Tx; others: Tx[] }[] =>
  ofType(rs, 'COLLISION').map((c) => collisionFrames(rs, c))
const caughtData = (rs: TLRecord[]): { locked: Tx; others: Tx[] }[] =>
  collisions(rs).filter(({ locked, others }) => [locked, ...others].some((f) => f.frame.kind === 'data'))
const msg = (label: string): SequenceMessage =>
  rtsCtsSequence().messages.find((m) => m.label === label)!

lessonShapeSuite(rtsCts, { sameSceneAs: 'hidden', runNs: RUN_NS })

describe('rts-cts · the lesson’s own scene', () => {
  it('follows its first half, sits in the same module, and owns RTS and CTS', () => {
    expect(rtsCts.id).toBe('rts-cts')
    expect(MODULES[rtsCts.module].title).toBe('听不见的邻居与损失')
    expect(rtsCts.module).toBe(hidden.module)
    expect(rtsCts.needs).toEqual(['hidden'])
    // the owner table of the readability programme gives this material RTS, CTS and
    // the size at which a station starts asking; the hidden node itself stayed next door.
    expect(rtsCts.terms!.map((t) => t.term)).toEqual(['RTS', 'CTS', 'RTS threshold'])
  })

  it('the scenario and the variant are the first half’s, scenario for scenario', () => {
    expect(() => ScenarioSchema.parse(rtsCts.scenario())).not.toThrow()
    expect(rtsCts.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    expect(rtsCts.scenario()).toEqual(hidden.scenario())
    expect(rtsCts.variants!.map((v) => v.scenario())).toEqual(hidden.variants!.map((v) => v.scenario()))
    expect(rtsCts.scenario().rtsThresholdBytes).toBe(3000)
    expect(rtsCts.variants![0].scenario().rtsThresholdBytes).toBe(500)
  })

  it('its one jump is the loss it prevents, and it occurs in the base run', () => {
    // The base scene never sends an RTS, and `lessonShapeSuite` requires every jump to
    // occur in the BASE run; the collision this lesson is about preventing does.
    expect(rtsCts.jumps.map((j) => j.label)).toEqual(['第一次碰撞'])
    for (const j of rtsCts.jumps) expect(base().some(j.find), j.label).toBe(true)
    expect(txs(base(), (r) => r.frame.kind === 'rts').length).toBe(0)
  })
})

describe('rts-cts · three hundred milliseconds, off and on', () => {
  it('32 collisions with the exchange on, 7 of them on a data frame, and 329 delivered', () => {
    // the table column 「开」: 32 · 7 · 329
    const rs = prot()
    expect(ofType(rs, 'COLLISION').length).toBe(32)
    expect(caughtData(rs).length).toBe(7)
    expect(acked(rs, 'sta-1') + acked(rs, 'sta-2')).toBe(329)
  })

  it('the 「关」 column is the same three numbers the first half prints', () => {
    // the table column 「关」: 126 · 126 · 45 — asserted here too, because this lesson is
    // where the comparison is made.
    const rs = base()
    expect(ofType(rs, 'COLLISION').length).toBe(126)
    expect(caughtData(rs).length).toBe(126)
    expect(acked(rs, 'sta-1') + acked(rs, 'sta-2')).toBe(45)
  })

  it('a cut of about 94% in the collisions that catch a data frame, and seven times the frames', () => {
    // 「撞上数据帧的碰撞少了约 94%……而房间送达的帧数是原来的七倍。」
    const cut = 1 - caughtData(prot()).length / caughtData(base()).length
    expect(Math.round(cut * 100)).toBe(94)
    const ratio = (acked(prot(), 'sta-1') + acked(prot(), 'sta-2'))
      / (acked(base(), 'sta-1') + acked(base(), 'sta-2'))
    expect(ratio).toBeGreaterThan(7)
    expect(ratio).toBeLessThan(8)
  })

  it('the question is 20 bytes and the answer 14, and the answer covers the exchange to come', () => {
    // 「每个长帧开始之前先付一个 20 字节的提问和一个 14 字节的回答」, and the picture's
    // 「带着一个覆盖本次交互剩余部分的 Duration」
    const rs = prot()
    const rts = txs(rs, (r) => r.frame.kind === 'rts')
    const cts = txs(rs, (r) => r.frame.kind === 'cts')
    expect(rts.length).toBeGreaterThan(300)
    expect(cts.length).toBeGreaterThan(300)
    for (const f of rts) expect(f.frame.bytes).toBe(20)
    for (const f of cts) expect(f.frame.bytes).toBe(14)
    // both are tiny beside the 1528-byte frame they protect, whatever rate they go out at
    const longest = Math.max(...txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.txTimeNs))
    for (const f of [...rts, ...cts]) expect(f.frame.txTimeNs).toBeLessThan(longest / 4)
    // the answer always promises more time than it takes, and always comes from the access point
    for (const c of cts) {
      expect(c.node).toBe('ap')
      expect(c.frame.durationFieldNs).toBeGreaterThan(c.frame.txTimeNs)
    }
    // the first answer of the run reserves the air to the end of the exchange it protects
    const first = cts[0]
    const nav = ofType(rs, 'NAV_SET').find((r) => r.t === first.t + first.frame.txTimeNs)!
    expect(nav.untilNs - nav.t).toBe(first.frame.durationFieldNs)
  })

  it('245 reservations land on the far station in 300 ms', () => {
    // the observation 「300 ms 里有 245 条」
    expect(ofType(prot(), 'NAV_SET').filter((r) => r.node === 'sta-2').length).toBe(245)
  })

  it('about 42 collision ticks per 100 ms with the exchange off, about 11 with it on', () => {
    // tryThis: 「关闭时约 42 次，开启时约 11 次」
    expect(Math.round(ofType(base(), 'COLLISION').length / 3)).toBe(42)
    expect(Math.round(ofType(prot(), 'COLLISION').length / 3)).toBe(11)
  })
})

describe('rts-cts · the procedure, step by step', () => {
  it('step 1: the frame a station holds is 1500 + 24 + 4 = 1528 B, and the threshold decides', () => {
    // steps: 「载荷、24 字节帧头、4 字节校验。总数高过 RTS 门限——变体里是 500 字节——就先问一句。」
    expect(MAC_HDR_BYTES + 1500 + FCS_BYTES).toBe(1528)
    const rs = prot()
    for (const d of txs(rs, (r) => r.frame.kind === 'data')) {
      expect(d.frame.bytes).toBe(1528)
      expect(d.frame.bytes).toBeGreaterThan(rtsCts.variants![0].scenario().rtsThresholdBytes!)
    }
    // and with the base scene's threshold above 1528, no question is ever asked
    expect(txs(base(), (r) => r.frame.kind === 'rts').length).toBe(0)
  })

  it('step 2: every RTS is 20 B and reserves 3 × SIFS + the CTS + the data frame + the ACK', () => {
    const rs = prot()
    for (const rts of txs(rs, (r) => r.frame.kind === 'rts')) {
      expect(rts.frame.bytes).toBe(RTS_BYTES)
      expect(rts.frame.dst).toBe('ap')
      expect(rts.frame.durationFieldNs).toBeGreaterThan(3 * SIFS_NS)
    }
    // the exchange the worked table runs through: 3 × 16 + 28 + 364 + 28 = 468 µs
    const rts = txs(rs, (r) => r.frame.kind === 'rts' && r.t === 718_000)[0]
    expect([rts.node, rts.frame.bytes, rts.frame.durationFieldNs]).toEqual(['sta-1', 20, 468_000])
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > rts.t)[0]
    const ack = txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1' && r.t > rts.t)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.frame.dst === 'sta-1' && r.t > rts.t)[0]
    expect(3 * SIFS_NS + cts.frame.txTimeNs + data.frame.txTimeNs + ack.frame.txTimeNs)
      .toBe(rts.frame.durationFieldNs)
    expect([data.t, data.t + data.frame.txTimeNs, data.frame.mbps]).toEqual([806_000, 1_170_000, 36])
  })

  it('step 3: the question never reaches the far room — −83.4 dBm against the −82 dBm floor', () => {
    const sc = rtsCts.variants![0].scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    expect(lt.get('sta-1')!.get('sta-2')!.toFixed(1)).toBe('-83.4')
    expect(lt.get('sta-1')!.get('sta-2')!).toBeLessThan(CCA_PD_DBM)
    // proved over the whole run, not asserted for one frame: neither room ever starts a
    // reception from the other, whatever kind of frame it is
    for (const [rx, tx] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      expect(ofType(prot(), 'RX_START').some((r) => r.node === rx && r.from === tx), `${rx} ← ${tx}`).toBe(false)
    }
  })

  it('step 4: every CTS is 14 B and carries the RTS figure less one SIFS and less itself', () => {
    const rs = prot()
    const rtsAt = new Map(txs(rs, (r) => r.frame.kind === 'rts').map((r) => [r.t + r.frame.txTimeNs, r]))
    let checked = 0
    for (const cts of txs(rs, (r) => r.frame.kind === 'cts')) {
      expect(cts.node).toBe('ap')
      expect(cts.frame.bytes).toBe(CTS_BYTES)
      const rts = rtsAt.get(cts.t - SIFS_NS)
      if (!rts || rts.frame.dst !== 'ap' || rts.node !== cts.frame.dst) continue
      expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs)
      checked++
    }
    expect(checked).toBeGreaterThan(300)
    // the worked round: 762 µs, 14 B, 468 − 16 − 28 = 424 µs, and both end rooms hear it
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t === 762_000)[0]
    expect([cts.frame.bytes, cts.frame.durationFieldNs]).toEqual([14, 424_000])
    const sc = rtsCts.variants![0].scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    for (const n of ['sta-1', 'sta-2']) {
      expect(lt.get('ap')!.get(n)!.toFixed(1)).toBe('-60.6')
      expect(ofType(rs, 'RX_START').some((r) => r.node === n && r.t === cts.t && r.from === 'ap')).toBe(true)
    }
  })

  it('step 5: a station that hears the answer freezes and sets NAV to the CTS end plus its Duration', () => {
    const rs = prot()
    const ctsEnds = new Map(txs(rs, (r) => r.frame.kind === 'cts')
      .map((r) => [r.t + r.frame.txTimeNs, r.frame.durationFieldNs]))
    let checked = 0
    for (const nav of ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-2' && r.source.startsWith('cts:'))) {
      expect(nav.untilNs - nav.t).toBe(ctsEnds.get(nav.t))
      checked++
    }
    expect(checked).toBeGreaterThan(200)
    // the worked round: freeze at 13 as the CTS arrives, NAV to 790 + 424 = 1214 µs
    expect(ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-2' && r.t === 762_000)!.value).toBe(13)
    const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t === 790_000)!
    expect([nav.source, nav.untilNs]).toEqual(['cts:ap', 1_214_000])
  })

  it('step 6: the ACK ends on the microsecond the reservation does, and a DIFS later the count goes on', () => {
    const rs = prot()
    const ack = txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1' && r.t === 1_186_000)[0]
    expect(ack.t + ack.frame.txTimeNs).toBe(1_214_000)
    expect(ofType(rs, 'NAV_CLEAR').some((r) => r.node === 'sta-2' && r.t === 1_214_000)).toBe(true)
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-2' && r.t === 1_248_000)!
    expect(resume.value).toBe(13)
    expect(resume.t - 1_214_000).toBe(DIFS_NS)
  })
})

describe('rts-cts · what `deeper` adds', () => {
  it('25 of the 32 remaining collisions are a question meeting a question', () => {
    const rs = prot()
    const cs = collisions(rs)
    const rtsOnly = cs.filter(({ locked, others }) => [locked, ...others].every((f) => f.frame.kind === 'rts'))
    expect(rtsOnly.length).toBe(25)
    expect(cs.length - rtsOnly.length).toBe(7)
    // 「在相隔不到四个时隙的时间里先后归零」
    for (const { locked, others } of rtsOnly) {
      const o = others.find((f) => f.frame.kind === 'rts')!
      expect(Math.abs(o.t - locked.t)).toBeLessThanOrEqual(4 * SLOT_NS)
    }
    for (const { locked } of rtsOnly) expect(locked.frame.bytes).toBe(20)
  })

  it('every data frame in the scene is above the variant’s threshold and below the base one’s', () => {
    const rs = prot()
    const data = txs(rs, (r) => r.frame.kind === 'data')
    expect(data.length).toBeGreaterThan(300)
    for (const d of data) expect(d.frame.bytes).toBe(1528)
    expect(rtsCts.variants![0].scenario().rtsThresholdBytes!).toBeLessThan(1528)
    expect(rtsCts.scenario().rtsThresholdBytes!).toBeGreaterThan(1528)
  })
})

describe('rts-cts · the sequence figure is the run', () => {
  it('every arrow and every instant is a record of the protected variant', () => {
    const rs = prot()
    const rts = txs(rs, (r) => r.frame.kind === 'rts' && r.t === 718_000)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t === 762_000)[0]
    const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t === 806_000)[0]
    const ack = txs(rs, (r) => r.frame.kind === 'ack' && r.t === 1_186_000)[0]

    const q = msg('RTS 20 B')
    expect([q.from, q.to, q.at]).toEqual(['sta-1', 'ap', '718 µs'])
    expect(rts.frame.bytes).toBe(20)
    const a = msg('CTS 14 B')
    expect([a.from, a.to, a.at]).toEqual(['ap', 'sta-1', '762 µs'])
    expect(cts.frame.bytes).toBe(14)
    const d = msg('数据帧')
    expect([d.from, d.to, d.at]).toEqual(['sta-1', 'ap', '806 µs'])
    expect(data.frame.bytes).toBe(1528)
    const k = msg('确认帧')
    expect([k.from, k.to, k.at]).toEqual(['ap', 'sta-1', '1186 µs'])
    expect(ack.t + ack.frame.txTimeNs).toBe(1_214_000)

    // the dashed arrow: the question the other room never receives
    const unheard = msg('收不到')
    expect([unheard.from, unheard.to, unheard.tone]).toEqual(['sta-1', 'sta-2', 'muted'])
    expect(ofType(rs, 'RX_START').some((r) => r.node === 'sta-2' && r.t === rts.t)).toBe(false)
    // and the reservation the answer really does put on Hidden B
    const book = msg('预约 424 µs')
    expect([book.from, book.to]).toEqual(['ap', 'sta-2'])
    expect(cts.frame.durationFieldNs).toBe(424_000)
    expect(ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t === 790_000)!.untilNs).toBe(1_214_000)
  })

  it('lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(rtsCtsSequence())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 + 0.5 < bs[j].x1 && bs[j].x0 + 0.5 < bs[i].x1
          && bs[i].y0 + 0.5 < bs[j].y1 && bs[j].y0 + 0.5 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })
})

/**
 * The terminology rule, re-run over this one unregistered lesson: every official
 * term carries its standard English name, and its abbreviation where the standard
 * has one, at its first Chinese use. The text and its order are exactly what
 * tests/course/readability.test.ts reads — `why`, `outcomes`, `picture`,
 * `numbers`, `observe`, `tryThis`, `quiz` — with `deeper` and `sources` left out.
 */
describe('rts-cts · every official term carries its English name', () => {
  const zh = [rtsCts.why!, ...rtsCts.outcomes!]
    .concat(paragraphTexts(rtsCts.picture!), cellTexts(rtsCts.picture!))
    .concat(paragraphTexts(rtsCts.numbers!), cellTexts(rtsCts.numbers!))
    .concat(rtsCts.observe, rtsCts.tryThis,
      rtsCts.quiz.flatMap((q) => [q.q, ...q.options, q.explain]))
    .join(' ')
  const rows = ZH_TERMS.filter((t) => !t.track || t.track === trackOf(rtsCts))

  it('brackets every official term at its first Chinese use', () => {
    const out: string[] = []
    for (const t of rows) {
      const why = zhTermFailure(zh, t)
      if (why) out.push(why)
      out.push(...zhAkaViolations(zh, t))
    }
    expect(out).toEqual([])
  })

  it('had its terminology actually graded', () => {
    expect(rows.filter((t) => bracketedAtFirstZhUse(zh, t) !== null).length).toBeGreaterThanOrEqual(2)
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * `scripts/figure-planting.ts` measured this lesson on 2026-10-12: **75 of its 78 printed
 * figures were editable with this file green.** Everything above is a strong engine test — the
 * on/off census, the 94 % cut, the 718 µs exchange walked step by step, the 245 reservations —
 * and every figure in it is a literal on the test's own side. This lesson restates more than
 * most: the two levels appear in `picture`, the worked table, `limits` and `sources`; the
 * threshold pair in `picture`, the steps, `deeper` and `limits`; and the whole 718 µs exchange
 * is in both the steps and the worked table, in different units.
 *
 * So each site is read here. Two things are claims about other scenes or other devices, and are
 * read as what they are: 「关」's three numbers are `@hidden`'s own scene (this lesson borrows
 * it), and 「真实驱动多半按帧长……动态开关保护」 is about real drivers, with no figure.
 */
describe('rts-cts · every printed figure is read back out of the lesson', () => {
  const off = base()
  const on = prot()
  const sc = rtsCts.scenario()
  const links = buildLinkTable(sc.nodes, sc.walls)

  const tableWith = (fragment: string): { heading: string; head: string[]; rows: string[][] } => {
    const b = rtsCts.numbers!.find((x) => x.kind === 'table'
      && ((x as { heading?: string }).heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { heading: string; head: string[]; rows: string[][] }
  }
  const steps = (rtsCts.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const costProse = (rtsCts.numbers!.find((x) => (x as { heading?: string }).heading?.includes('成本与收益')) as
    { text: string }).text
  const pictureText = (rtsCts.picture! as { text?: string; caption?: string }[])
    .map((x) => `${x.text ?? ''}\n${x.caption ?? ''}`).join('\n')
  const deeperText = (rtsCts.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
  const limitText = rtsCts.limits.map((x) => x.text).join('\n')
  const sourcesText = rtsCts.sources!.join('\n')
  const quizText = rtsCts.quiz.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')

  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] =>
    raw(text, re, what).map((x) => Number(x.replace(/[\s,]/g, '').replace(/−/g, '-')))
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const zhCount = (s: string): number => {
    const n = zhNumeral(s.replace(/两/g, '二'))
    expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
    return n!
  }
  const counted = (text: string, re: RegExp, what: string): number => zhCount(raw(text, re, what)[0])
  const ZH = '[〇一二三四五六七八九十两]+'
  /** Every 「−83.4 dBm」-shaped figure in a passage. */
  const everyDbm = (text: string): number[] =>
    [...text.matchAll(/−([\d.]+) dBm/g)].map((m) => -Number(m[1]))
  /**
   * The exchange the worked table walks — the one at the instant the table itself names, which
   * is not the run's first: this scene's first question goes out at 0 µs and collides.
   */
  const askedAt = Number(/(\d+) µs · RTS/.exec(JSON.stringify(rtsCts.numbers))![1]) * 1_000
  const rts = txs(on, (r) => r.frame.kind === 'rts' && r.t === askedAt)[0]
  const cts = txs(on, (r) => r.frame.kind === 'cts' && r.t > rts.t)[0]
  const far = rts.node === 'sta-1' ? 'sta-2' : 'sta-1'

  it('the on/off table: three rows, two columns, and the window they are counted over', () => {
    const t = tableWith('同样的 300 ms，关与开')
    const [ms] = figs(t.head[0], /(\d+) ms 内的统计/, 'the window the table counts over')
    expect(ms * MS).toBe(RUN_NS)
    const [offCol, onCol] = [1, 2]
    const rows = t.rows
    expect(rows, 'the table states exactly the three rows this reads').toHaveLength(3)
    // 「碰撞次数」, 「其中撞上数据帧的」, 「成功送达的数据帧」 — both columns, from both runs
    for (const [run, col] of [[off, offCol], [on, onCol]] as const) {
      expect(Number(rows[0][col]), `collisions, column ${col}`).toBe(ofType(run, 'COLLISION').length)
      expect(Number(rows[1][col]), `of them on a data frame, column ${col}`)
        .toBe(caughtData(run).length)
      expect(Number(rows[2][col]), `delivered, column ${col}`)
        .toBe(acked(run, 'sta-1') + acked(run, 'sta-2'))
    }
    // the 「关」 column is `@hidden`'s own scene, which this lesson borrows
    expect(rtsCts.scenario()).toEqual(hidden.scenario())
  })

  it('「RTS/CTS 的成本与收益」: the cut, the two frame sizes, and the sevenfold delivery', () => {
    const [cut] = figs(costProse, /少了约 (\d+)%/, 'the cut it claims')
    const [ask, answer] = figs(costProse, /(\d+) 字节的提问和一个 (\d+) 字节的回答/,
      'the two frames it costs')
    const times = counted(costProse, new RegExp(`是原来的(${ZH})倍`), 'the delivery it buys')
    const hitOff = caughtData(off).length
    const hitOn = caughtData(on).length
    // 「约」: one significant figure, so the cut rounds to that many per cent
    expect(Math.round((100 * (hitOff - hitOn)) / hitOff / 10) * 10, `${hitOn} of ${hitOff}`)
      .toBe(Math.round(cut / 10) * 10)
    expect(new Set(txs(on, (r) => r.frame.kind === 'rts').map((r) => r.frame.bytes)))
      .toEqual(new Set([ask]))
    expect(new Set(txs(on, (r) => r.frame.kind === 'cts').map((r) => r.frame.bytes)))
      .toEqual(new Set([answer]))
    expect(ask).toBe(RTS_BYTES)
    expect(answer).toBe(CTS_BYTES)
    const delOff = acked(off, 'sta-1') + acked(off, 'sta-2')
    const delOn = acked(on, 'sta-1') + acked(on, 'sta-2')
    expect(Math.round(delOn / delOff), `${delOn} against ${delOff}`).toBe(times)
  })

  it('the worked table: ten rows of the 718 µs exchange, the two verdicts included', () => {
    const rows = tableWith('718 µs 那次交互').rows
    expect(rows, 'the table states exactly the ten rows this reads').toHaveLength(10)
    const n = (s: string): number[] => [...s.matchAll(/\d+/g)].map((m) => Number(m[0]))
    // row 1: 「1500 + 24 + 4 = 1528 B」
    const [payload, hdr, fcs, total] = n(rows[0][1])
    expect([hdr, fcs], 'the header and the check').toEqual([MAC_HDR_BYTES, FCS_BYTES])
    expect(payload + hdr + fcs, 'the row’s own sum').toBe(total)
    const data = txs(on, (r) => r.frame.kind === 'data')
    expect(new Set(data.map((r) => r.frame.bytes))).toEqual(new Set([total]))
    // row 2: 「718 µs · RTS · 20 B」
    const [at, bytes] = n(rows[1][1])
    expect(rts.t / 1_000, 'when the question goes out').toBe(at)
    expect(rts.frame.bytes, 'and how big it is').toBe(bytes)
    // row 3: 「3 × 16 + 28 + 364 + 28 = 468 µs」
    const [gaps, gap, answer, frame, ack, reserved] = n(rows[2][1])
    expect(gap * 1_000, 'the gap it counts three of').toBe(SIFS_NS)
    expect(gaps, 'and how many of them').toBe(3)
    expect(answer * 1_000, 'the answer’s airtime').toBe(cts.frame.txTimeNs)
    expect(frame * 1_000, 'the data frame’s').toBe(data[0].frame.txTimeNs)
    const theAck = txs(on, (r) => r.frame.kind === 'ack' && r.t > data[0].t)[0]
    expect(ack * 1_000, 'and the acknowledgement’s').toBe(theAck.frame.txTimeNs)
    expect(gaps * gap + answer + frame + ack, 'the row’s own sum').toBe(reserved)
    expect(rts.frame.durationFieldNs / 1_000, 'which is what the question reserves').toBe(reserved)
    // row 4 and row 7: the two levels and the floor, with the verdicts
    for (const [i, ok] of [[3, false], [6, true]] as const) {
      const m = /^(−[\d.]+) dBm [<>] (−[\d.]+) dBm ([✓✗])$/.exec(rows[i][1])
      expect(m, `row ${i + 1} is not 「level vs floor ✓/✗」`).not.toBeNull()
      same(m![2], CCA_PD_DBM, `row ${i + 1}: the floor`)
      const level = i === 3
        ? links.get(rts.node)!.get(far)!
        : links.get(cts.node)!.get(far)!
      same(m![1], level, `row ${i + 1}: the level at the far room`)
      expect(level > CCA_PD_DBM, `row ${i + 1} marks it 「${m![3]}」`).toBe(ok)
      expect(m![3] === '✓', 'and the mark agrees with the inequality it prints').toBe(ok)
    }
    // row 5: 「762 µs · CTS · 14 B」
    const [ctsAt, ctsBytes] = n(rows[4][1])
    expect(cts.t / 1_000).toBe(ctsAt)
    expect(cts.frame.bytes).toBe(ctsBytes)
    // row 6: 「468 − 16 − 28 = 424 µs」
    const [was, less1, less2, now] = n(rows[5][1])
    expect(was, 'the figure it starts from').toBe(reserved)
    expect(less1 * 1_000).toBe(SIFS_NS)
    expect(less2 * 1_000, 'and the answer itself').toBe(cts.frame.txTimeNs)
    expect(was - less1 - less2, 'the row’s own arithmetic').toBe(now)
    expect(cts.frame.durationFieldNs / 1_000, 'which is the answer’s own Duration').toBe(now)
    // row 8: 「790 + 424 = 1214 µs」 and the station it freezes at 13
    const [held] = figs(rows[7][0], /在 (\d+) 冻结/, 'row 8: the value the far station freezes at')
    const [ctsEnd, dur, until] = n(rows[7][1])
    expect((cts.t + cts.frame.txTimeNs) / 1_000, 'when the answer ends').toBe(ctsEnd)
    expect(dur, 'plus its Duration').toBe(now)
    expect(ctsEnd + dur, 'the row’s own sum').toBe(until)
    const nav = ofType(on, 'NAV_SET').find((r) => r.node === far && r.t === cts.t + cts.frame.txTimeNs)!
    expect(nav.untilNs / 1_000, 'which is where the reservation really lands').toBe(until)
    const freeze = ofType(on, 'BACKOFF_FREEZE').filter((r) => r.node === far && r.t <= nav.t).pop()!
    expect(freeze.value, 'and the value the far station holds').toBe(held)
    // row 9 and row 10: the ACK ends there, and a DIFS later the count goes on at the same value
    expect(n(rows[8][1])[0], 'when the acknowledgement ends')
      .toBe((theAck.t + theAck.frame.txTimeNs) / 1_000)
    expect((theAck.t + theAck.frame.txTimeNs) / 1_000, 'which is the microsecond the reservation ends')
      .toBe(until)
    const [back, value] = n(rows[9][1])
    const resume = ofType(on, 'BACKOFF_RESUME').find((r) => r.node === far && r.t > nav.untilNs)!
    expect(resume.t / 1_000, 'when the far station counts again').toBe(back)
    expect(resume.value, 'and from what value').toBe(value)
    expect(value).toBe(held)
    expect(resume.t - nav.untilNs, 'a DIFS after the reservation').toBe(DIFS_NS)
  })

  it('the steps: the threshold, the two frame sizes, the gap and the floor', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(6)
    // step 1: 「24 字节帧头、4 字节校验」 and 「变体里是 500 字节」
    const [hdr, fcs] = figs(steps[0], /(\d+) 字节帧头（MAC header）、(\d+) 字节校验/,
      'step 1’s header and check')
    expect([hdr, fcs]).toEqual([MAC_HDR_BYTES, FCS_BYTES])
    const [threshold] = figs(steps[0], /变体里是 (\d+) 字节/, 'step 1’s threshold')
    expect(rtsCts.variants![0].scenario().rtsThresholdBytes).toBe(threshold)
    // step 2: 「一个 20 字节的 RTS」
    const [ask] = figs(steps[1], /一个 (\d+) 字节的 RTS/, 'step 2’s question')
    expect(ask).toBe(RTS_BYTES)
    // step 3: 「已低于 −82 dBm」
    const [floor] = figs(steps[2], /已低于 (−[\d.]+) dBm/, 'step 3’s floor')
    expect(floor).toBe(CCA_PD_DBM)
    expect(links.get(rts.node)!.get(far)!, 'and the question really is under it')
      .toBeLessThan(floor)
    // step 4: 「隔 16 µs 之后，接入点回一个 14 字节的 CTS」
    const [gap, answer] = figs(steps[3], /隔 (\d+) µs 之后，接入点回一个 (\d+) 字节的 CTS/,
      'step 4’s gap and answer')
    expect(gap * 1_000).toBe(SIFS_NS)
    expect(answer).toBe(CTS_BYTES)
    expect(cts.t - (rts.t + rts.frame.txTimeNs), 'the gap the run really leaves').toBe(gap * 1_000)
  })

  it('`picture`: the two levels, the question that costs twenty bytes, and the frame it protects', () => {
    const [bytes] = figs(pictureText, /两个 (\d+) 字节的帧同时失败/, '`picture` on the first collision')
    expect(new Set(txs(off, (r) => r.frame.kind === 'data').map((r) => r.frame.bytes)))
      .toEqual(new Set([bytes]))
    // the caption: 「提问到 Hidden B 处只有 −83.4 dBm……回答到那里有 −60.6 dBm，于是它在 13 上
    //  冻结，预约挂到 1214 µs」
    const [askLevel] = figs(pictureText, /提问到 Hidden B 处只有 (−[\d.]+) dBm/,
      'the caption on the question’s level')
    const [answerLevel] = figs(pictureText, /回答到那里有 (−[\d.]+) dBm/,
      'the caption on the answer’s level')
    const [held] = figs(pictureText, /于是它在 (\d+) 上冻结/, 'the caption on the frozen value')
    const [until] = figs(pictureText, /预约挂到 (\d+) µs/, 'the caption on where the reservation lands')
    same(raw(pictureText, /只有 (−[\d.]+) dBm/, 'the question’s level')[0],
      links.get(rts.node)!.get(far)!, 'the question’s level at the far room')
    same(raw(pictureText, /回答到那里有 (−[\d.]+) dBm/, 'the answer’s level')[0],
      links.get(cts.node)!.get(far)!, 'the answer’s level there')
    expect(askLevel).toBeLessThan(CCA_PD_DBM)
    expect(answerLevel).toBeGreaterThan(CCA_PD_DBM)
    const nav = ofType(on, 'NAV_SET').find((r) => r.node === far)!
    expect(nav.untilNs / 1_000).toBe(until)
    const freeze = ofType(on, 'BACKOFF_FREEZE').filter((r) => r.node === far && r.t <= nav.t).pop()!
    expect(freeze.value).toBe(held)
    // 「二十字节，而不是一千多字节的一整轮」
    const twenty = counted(pictureText, new RegExp(`(${ZH})字节，而不是`), '`picture` on an RTS')
    expect(twenty).toBe(RTS_BYTES)
  })

  it('`deeper`: the 25 of 32, the 7 that are not, and both thresholds', () => {
    const [left, q2q] = figs(deeperText, /剩下的 (\d+) 次碰撞里，(\d+) 次是 RTS 撞上 RTS/,
      '`deeper` on the remaining collisions')
    const [onData] = figs(deeperText, /另外 (\d+) 次确实撞上了数据帧/, '`deeper` on the rest')
    expect(left).toBe(ofType(on, 'COLLISION').length)
    expect(onData).toBe(caughtData(on).length)
    expect(q2q + onData, '`deeper`’s own two parts against its own total').toBe(left)
    const rtsOnly = collisions(on)
      .filter(({ locked, others }) => [locked, ...others].every((f) => f.frame.kind === 'rts'))
    expect(rtsOnly.length, 'collisions where only questions met').toBe(q2q)
    // 「相隔不到四个时隙」
    // 「相隔不超过四个时隙」. **It said 「不到」 until 2026-10-12**, and the widest pair in this
    // run is exactly four slots apart — 36 000 ns, which `scripts/figure-planting.ts` found by
    // planting the four and watching nothing redden. 「不到」 was wrong by one slot.
    const slots = counted(deeperText, new RegExp(`相隔不超过(${ZH})个时隙`),
      '`deeper` on how close the two questions are')
    let widest = 0
    for (const { locked, others } of rtsOnly) {
      for (const o of others) widest = Math.max(widest, Math.abs(o.t - locked.t))
    }
    expect(widest, 'the widest pair of colliding questions').toBeLessThanOrEqual(slots * SLOT_NS)
    expect(widest, 'and 「不超过」 is tight: the widest pair really is that far apart')
      .toBe(slots * SLOT_NS)
    // 「一个 RTS 只有二十字节」
    const twenty = counted(deeperText, new RegExp(`只有(${ZH})字节`), '`deeper` on an RTS')
    expect(twenty).toBe(RTS_BYTES)
    // 「门限设在 500 字节……每个数据帧都是 1528 字节……门限留在 3000」
    const [low] = figs(deeperText, /门限设在 (\d+) 字节/, '`deeper` on the protected threshold')
    const [frame] = figs(deeperText, /每个数据帧都是 (\d+) 字节/, '`deeper` on the frame')
    const [high] = figs(deeperText, /门限留在 (\d+)/, '`deeper` on the unprotected threshold')
    expect(low).toBe(rtsCts.variants![0].scenario().rtsThresholdBytes)
    expect(high).toBe(rtsCts.scenario().rtsThresholdBytes)
    expect(new Set(txs(on, (r) => r.frame.kind === 'data').map((r) => r.frame.bytes)))
      .toEqual(new Set([frame]))
    expect(frame, 'the frame is above the low threshold').toBeGreaterThan(low)
    expect(frame, 'and under the high one, which is why nothing asks there').toBeLessThan(high)
  })

  it('`limits`: the margin the hard line leaves, both thresholds, and the rate of a protection frame', () => {
    const [level, floor, margin] = figs(limitText,
      /提问到远端 (−[\d.]+) dBm，比 (−[\d.]+) dBm 低 ([\d.]+) dB/, '`limits` on the margin')
    same(raw(limitText, /提问到远端 (−[\d.]+) dBm/, 'the level')[0],
      links.get(rts.node)!.get(far)!, 'the question’s level at the far room')
    expect(floor).toBe(CCA_PD_DBM)
    same(raw(limitText, /低 ([\d.]+) dB/, 'the margin')[0], CCA_PD_DBM - level,
      'how far under the line it sits')
    expect(margin, 'and the margin really is that small').toBeLessThan(2)
    // 「这 1.4 dB 会被反复跨过……远没有 94 % 这么稳」
    const [again] = figs(limitText, /这 ([\d.]+) dB 会被反复跨过/, '`limits` restating the margin')
    expect(again).toBe(margin)
    const [cut] = figs(limitText, /远没有 (\d+) % 这么稳/, '`limits` on the cut it calls unstable')
    const hitOff = caughtData(off).length
    expect(Math.round((100 * (hitOff - caughtData(on).length)) / hitOff / 10) * 10)
      .toBe(Math.round(cut / 10) * 10)
    // 「500 B 与 3000 B 这两个门限都是场景直接给的参数」
    const [low, high] = figs(limitText, /(\d+) B 与 (\d+) B 这两个门限/, '`limits` on the two thresholds')
    expect([low, high]).toEqual([
      rtsCts.variants![0].scenario().rtsThresholdBytes, rtsCts.scenario().rtsThresholdBytes,
    ])
    // **This said 「恒为 24 Mb/s、恒为 28 µs」 until 2026-10-12, and it was false.** The rule it
    // cites is `ctrlRespRateForMode`, which follows the eliciting frame — and this scene's rate
    // control walks the data frames down after every collision, so the questions go out at
    // three rungs, not one. `scripts/figure-planting.ts` found it: planting the 24 changed
    // nothing, because nothing read it.
    const rates = figs(limitText, /RTS 在 (\d+)、(\d+)、(\d+) Mb\/s 三档上都出现过/,
      '`limits` on the rungs a question goes out at')
    const airs = figs(limitText, /空口时间分别是 (\d+)、(\d+)、(\d+) µs/,
      '`limits` on their airtimes')
    const asks = txs(on, (r) => r.frame.kind === 'rts')
    expect([...new Set(asks.map((r) => r.frame.mbps))].sort((a, b) => b - a),
      'the rungs the questions of this run really use').toEqual(rates)
    for (const [i, mbps] of rates.entries()) {
      const mine = asks.filter((r) => r.frame.mbps === mbps)
      expect(mine.length, `questions at ${mbps} Mb/s`).toBeGreaterThan(0)
      expect(new Set(mine.map((r) => r.frame.txTimeNs)), `the airtime at ${mbps} Mb/s`)
        .toEqual(new Set([airs[i] * 1_000]))
    }
    // and the rule the sentence cites is 「the highest MANDATORY rate not above the frame's
    // own reference rate」, so every question goes out at one of the three mandatory rates —
    // never at a data rate of its own. (Which data frame a question ends up protecting is a
    // different matter: the rate control may drop a rung between the question and the frame.)
    for (const a of asks) {
      expect(MANDATORY_MBPS, `the question at ${a.t}`).toContain(a.frame.mbps)
    }
    expect(new Set(rates), 'and the rungs it uses are mandatory rates')
      .toEqual(new Set(rates.filter((r) => MANDATORY_MBPS.includes(r))))
    // 「245 条一次不差」
    const [count] = figs(limitText, /(\d+) 条一次不差/, '`limits` on the reservations')
    const navs = ofType(on, 'NAV_SET').filter((r) => r.node === far)
    expect(navs.length).toBe(count)
    for (const nv of navs) {
      const ack = ofType(on, 'TX_END').find((r) => r.frame.kind === 'ack' && r.t === nv.untilNs)
      expect(ack, `the reservation at ${nv.t} ends where no acknowledgement does`).toBeDefined()
    }
  })

  it('`sources`, `observe`, `tryThis` and the quiz: the floor, the walls, and the two tick rates', () => {
    const [floor] = figs(sourcesText, /把 (−[\d.]+) dBm 以下判为/, '`sources` on the floor')
    expect(floor).toBe(CCA_PD_DBM)
    const walls = counted(sourcesText, new RegExp(`(${ZH})堵砖墙`), '`sources` on the walls')
    const pos = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
    expect(wallsCrossed(pos('sta-1'), pos('sta-2'), sc.walls), '`sources` on the walls between them')
      .toHaveLength(walls)
    // `observe`: 「300 ms 里有 245 条」
    const [ms, count] = figs(rtsCts.observe.join('\n'), /(\d+) ms 里有 (\d+) 条/,
      '`observe` on the reservations')
    expect(ms * MS).toBe(RUN_NS)
    expect(ofType(on, 'NAV_SET').filter((r) => r.node === far).length).toBe(count)
    // `tryThis`: 「每 100 ms 的碰撞刻度……关闭时约 42 次，开启时约 11 次」
    const [per, offTicks, onTicks] = figs(rtsCts.tryThis.join('\n'),
      /每 (\d+) ms 的碰撞刻度[^]*?关闭时约 (\d+) 次，开启时约 (\d+) 次/, '`tryThis` on the two rates')
    // the window is an instruction rather than an engine quantity — the inspector shows a
    // cumulative count, and the reader takes it every so often — but it has to divide the run
    // the rest of the lesson counts over, or 「每 100 ms」 cannot be read off this scene at all
    expect(RUN_NS % (per * MS), `${per} ms does not divide the ${RUN_NS / MS} ms this run covers`)
      .toBe(0)
    const perWindow = (rs: TLRecord[]): number =>
      ofType(rs, 'COLLISION').length / (RUN_NS / (per * MS))
    // 「约」 here is not a rounding of the figure — it is 「per window, and the windows differ」.
    // So the figure is the mean per window, to the nearest tick. (Rounding to one significant
    // figure instead, as a first draft of this did, makes the assertion blind to ±1 — which is
    // how `scripts/figure-planting.ts` found all three of these still unpinned.)
    expect(Math.round(perWindow(off)), `${ofType(off, 'COLLISION').length} in ${RUN_NS / MS} ms`)
      .toBe(offTicks)
    expect(Math.round(perWindow(on)), `${ofType(on, 'COLLISION').length} in ${RUN_NS / MS} ms`)
      .toBe(onTicks)
    // the quiz: 「门限从 3000 字节调到 500 字节」, the frame that does not change, and the cut
    const [from, to] = figs(quizText, /门限从 (\d+) 字节调到 (\d+) 字节/, 'the quiz on the two thresholds')
    expect([from, to]).toEqual([
      rtsCts.scenario().rtsThresholdBytes, rtsCts.variants![0].scenario().rtsThresholdBytes,
    ])
    const [unchanged] = figs(quizText, /帧还是 (\d+) 字节/, 'the quiz on the frame that does not change')
    for (const run of [off, on]) {
      expect(new Set(txs(run, (r) => r.frame.kind === 'data').map((r) => r.frame.bytes)))
        .toEqual(new Set([unchanged]))
    }
    const [was, now] = figs(quizText, /碰撞从 (\d+) 次降到 (\d+) 次/, 'the quiz on the cut')
    expect([was, now], 'which is the table’s own second row, restated in the quiz')
      .toEqual([caughtData(off).length, caughtData(on).length])
    // the variant's label: 「开启 RTS/CTS（门限 500 B）」 — the only place a reader sees that
    // figure without opening the editor
    const [labelled] = figs(rtsCts.variants![0].label, /门限 (\d+) B/, 'the variant’s own label')
    expect(labelled, 'the threshold the label names').toBe(to)
    expect(rtsCts.variants![0].scenario().rtsThresholdBytes).toBe(labelled)
    // and every dBm figure anywhere in this lesson is one of the three levels it is about
    const everywhere = [pictureText, deeperText, limitText, sourcesText, quizText,
      ...steps, ...rtsCts.numbers!.map((b) => JSON.stringify(b))].join('\n')
    const known = [CCA_PD_DBM, links.get(rts.node)!.get(far)!, links.get(cts.node)!.get(far)!]
      .map((x) => Number(x.toFixed(1)))
    for (const v of everyDbm(everywhere)) {
      expect(known, `「${v} dBm」 is a level this lesson is not about`).toContain(v)
    }
  })
})
