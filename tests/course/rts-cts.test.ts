/**
 * Every empirical claim in "让接入点大声替你预约", the second half of `hidden`
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
import { buildLinkTable } from '../../src/engine/propagation'
import {
  CCA_PD_DBM, CTS_BYTES, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, RTS_BYTES, SIFS_NS, SLOT_NS,
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

    // the dashed arrow: the question the other room never hears
    const deaf = msg('听不见')
    expect([deaf.from, deaf.to, deaf.tone]).toEqual(['sta-1', 'sta-2', 'muted'])
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
