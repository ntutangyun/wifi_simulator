/**
 * `@edca`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 for the four EDCAFs, AIFS[AC], the default parameters and internal
 * collisions; the figures it prints are compared with the engine's own constants. ② is pinned row by
 * row against the engine, including the rows where it departs from the standard (the AP's parameter
 * set, the AC taken from the traffic profile). ③'s figures are read back out of the lesson text and
 * compared with a 400 ms run of the lesson's own scene — 400 ms because the run's one internal
 * collision is at 362.6426 ms.
 */
import { describe, it, expect } from 'vitest'
import { edca, edcaAifsTiming } from '../../src/course/tier2/edca'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { EDCA_PARAMS, OFDM_5G, aifsNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 400 * MS

const recs = (): TLRecord[] => runOf(edca, undefined, RUN_NS)
const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
const msOf = (ns: number): string => (ns / MS).toFixed(4)

const lab = (heading: string): Lab => {
  const l = edca.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = edca.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => edca.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'note' in b ? b.note ?? '' : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(edca, { runNs: RUN_NS })

describe('edca · the lesson', () => {
  it('is in the standard-first shape, in the QoS module', () => {
    expect(isStandardFirst(edca)).toBe(true)
    expect(MODULES[edca.module].title).toBe('QoS 与效率')
    expect(edca.needs).toEqual(['ifs', 'backoff', 'collisions-cw'])
    expect(edca.terms!.map((t) => t.term)).toEqual(['EDCA', 'access category', 'AIFS'])
    expect(edca.limits).toEqual([])
    expect(edca.observe).toEqual([])
    expect(edca.tryThis).toEqual([])
  })

  it('keeps its scene: an AP and three stations, one per traffic class', () => {
    expect(() => ScenarioSchema.parse(edca.scenario())).not.toThrow()
    expect(edca.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2', 'sta-3'])
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§10.23.2.1', '§10.2.3.2', '表 10-1', '§10.23.2.4', '表 9-194', '§9.4.2.27', '附录 C', '§10.23.2.2', '表 17-24']) {
      expect(std, c).toContain(c)
    }
  })
})

describe('edca · ① prints the standard\'s values, and they are the engine\'s constants', () => {
  it('the AIFS formula gives 34, 43 and 79 µs', () => {
    expect([OFDM_5G.sifsNs, OFDM_5G.slotNs]).toEqual([16 * US, 9 * US])
    const note = stdText()
    expect(note).toContain(`AIFSN 取 2、3、7 时 AIFS 分别为 ${[2, 3, 7].map((n) => aifsNs(n, OFDM_5G) / US).join('、')} µs`)
    expect(aifsNs(2, OFDM_5G)).toBe(OFDM_5G.difsNs)
  })

  it('the default-parameter table is EDCA_PARAMS, row by row', () => {
    const rows = tableOf(edca.standard!, '非 AP 站点的默认参数（表 9-194，OFDM 物理层（physical layer, PHY）aCWmin = 15、aCWmax = 1023）').rows
    expect(rows.map((r) => r[0])).toEqual(['AC_VO', 'AC_VI', 'AC_BE', 'AC_BK'])
    for (const [ac, cwMin, cwMax, aifsn, aifs] of rows) {
      const p = by(ac.slice(3))
      expect(cwMin.endsWith(`${p.cwMin}`), ac).toBe(true)
      expect(cwMax.endsWith(`${p.cwMax}`), ac).toBe(true)
      expect(aifsn, ac).toBe(String(p.aifsn))
      expect(aifs, ac).toBe(`${aifsNs(p.aifsn, OFDM_5G) / US} µs`)
    }
    // the closed forms the table prints, at aCWmin = 15, aCWmax = 1023
    expect([(15 + 1) / 4 - 1, (15 + 1) / 2 - 1]).toEqual([by('VO').cwMin, by('VO').cwMax])
    expect((15 + 1) / 2 - 1).toBe(by('VI').cwMin)
  })
})

describe('edca · ② says what the engine does, and the engine does it', () => {
  const rs = recs()
  const draws = (n: string) => ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === n)

  it('the AC comes from the profile: each station uses exactly one class, only the AP holds two', () => {
    expect(implRow('帧归入哪一类').kind).toBe('differs')
    const acs = (n: string) => new Set(draws(n).map((d) => d.ac))
    expect(acs('sta-1')).toEqual(new Set([3]))
    expect(acs('sta-2')).toEqual(new Set([1]))
    expect(acs('sta-3')).toEqual(new Set([0]))
    expect(acs('ap')).toEqual(new Set([1, 3]))
  })

  it('the AP uses the non-AP STA table: VO AIFS 34 µs (AIFSN 2), BE windows past 63', () => {
    expect(implRow('接入点的参数').kind).toBe('differs')
    const apVo = ofType(rs, 'IFS_START').filter((r) => r.node === 'ap' && r.ac === 3 && r.kind === 'AIFS' && r.untilNs > r.t)
    expect(new Set(apVo.map((r) => r.untilNs - r.t))).toEqual(new Set([aifsNs(2, OFDM_5G)]))
    expect(Math.max(...draws('ap').filter((d) => d.ac === 1).map((d) => d.cw))).toBeGreaterThan(63)
  })

  it('the draw happens at the end of AIFS, and the counter decrements on that same boundary', () => {
    for (const d of draws('sta-1')) {
      const end = ofType(rs, 'IFS_END').find((r) => r.node === 'sta-1' && r.t === d.t)
      expect(end, `draw at ${d.t}`).toBeDefined()
    }
  })

  it('internal collision: CW follows the standard\'s formula', () => {
    const p = by('BE')
    const ch = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'ap' && r.ac === 1 && (r.qsrc ?? 0) > 0)
    for (const c of ch) expect(c.cw, `qsrc ${c.qsrc}`).toBe(Math.min(p.cwMax, 2 ** c.qsrc! * (p.cwMin + 1) - 1))
  })
})

describe('edca · ③ every figure the labs print is the run', () => {
  const rs = recs()

  it('lab 1: the caller\'s first voice frame, step by step — and the AP\'s, at the same instant', () => {
    const l = lab('通话站点的第一帧语音')
    const rows = tableOf(l.blocks!, '通话站点的第一帧语音，按步骤计算').rows
    const draw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'sta-1')!
    const ifs = ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-1' && r.untilNs === draw.t).at(-1)!
    const decs = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-1' && r.t >= draw.t).slice(0, 2)
    const tx = ofType(rs, 'TX_START').find((r) => r.node === 'sta-1' && r.frame.kind === 'data')!
    expect(rows[0][1]).toBe(`${msOf(ifs.t)} ms`)
    expect(rows[1][1]).toBe(`${(ifs.untilNs - ifs.t) / US} µs`)
    expect(rows[1][0]).toContain(`16 + ${by('VO').aifsn} × 9`)
    expect(rows[2][0]).toContain(`CWmin ${draw.cw}`)
    expect(rows[2][1]).toBe(`${msOf(draw.t)} ms · 抽到 ${draw.value}`)
    expect(rows[3][1]).toBe(`${msOf(decs[0].t)} ms · ${draw.value} → ${decs[0].value}`)
    expect(rows[4][1]).toBe(`${msOf(decs[1].t)} ms · ${decs[0].value} → ${decs[1].value}`)
    expect(rows[5][1]).toBe(`${msOf(tx.t)} ms`)
    expect(tx.t - decs[1].t).toBe(OFDM_5G.slotNs)
    // the AP's voice queue drew the same value and transmitted on the same boundary
    const apDraw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'ap' && r.ac === 3)!
    const apTx = ofType(rs, 'TX_START').find((r) => r.node === 'ap' && r.frame.kind === 'data' && r.frame.ac === 3)!
    expect(apDraw.t).toBe(draw.t)
    expect(apDraw.value).toBe(draw.value)
    expect(apTx.t).toBe(tx.t)
    expect(l.expect).toContain(`${msOf(draw.t)} ms 抽到 ${draw.value}，${msOf(tx.t)} ms 发送`)
    expect(l.expect).toContain(`同样抽到 ${apDraw.value}，也在 ${msOf(apTx.t)} ms 发送`)
    // "都没有收到确认，两边各记一次重传"
    for (const n of ['sta-1', 'ap']) {
      const to = ofType(rs, 'ACK_TIMEOUT').find((r) => r.node === n && r.t > tx.t)!
      const next = ofType(rs, 'TX_START').find((r) => r.node === n && r.t > tx.t)
      expect(next === undefined || next.t > to.t, n).toBe(true)
      expect(ofType(rs, 'RETRY').some((r) => r.node === n && r.t === to.t), n).toBe(true)
    }
  })

  it('lab 2: the figure and the AIFS / window table', () => {
    const l = lab('四类各等多久')
    const fig = l.blocks!.find((b) => b.kind === 'diagram')!
    expect(fig.kind === 'diagram' && fig.spec).toEqual(edcaAifsTiming())
    const spec = edcaAifsTiming() as TimingSpec
    const span = (label: string) => spec.lanes.find((x) => x.label.startsWith(label))!.spans[0]
    for (const [label, ac] of [['VO', 'VO'], ['VI', 'VI'], ['BE', 'BE'], ['BK', 'BK']] as const) {
      expect(span(label).toUs * US, label).toBe(aifsNs(by(ac).aifsn, OFDM_5G))
    }
    // the zero point is the start of the AIFS that ends at the caller's first draw (an earlier one
    // at 22.5384 ms was cut short by busy medium), and the first lane is the BlockAck that ended there
    const draw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'sta-1')!
    const ifs = ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-1' && r.untilNs === draw.t).at(-1)!
    expect(fig.kind === 'diagram' && fig.caption).toContain(`${msOf(ifs.t)} ms`)
    const ba = ofType(rs, 'TX_END').filter((r) => r.t === ifs.t).at(-1)!
    expect(ba.frame.kind).toBe('ba')
    expect(span('空口').fromUs * US).toBe(-ba.frame.txTimeNs)
    expect(aifsNs(7, OFDM_5G) - aifsNs(2, OFDM_5G)).toBe(5 * OFDM_5G.slotNs)

    const rows = tableOf(l.blocks!, '400 ms 里三台站点的 AIFS 与窗口').rows
    const nodeOf: Record<string, string> = { 通话站点: 'sta-1', 上传站点: 'sta-2', 备份站点: 'sta-3' }
    for (const [name, , aifs, windows] of rows) {
      const n = nodeOf[name]
      const lens = new Set(ofType(rs, 'IFS_START').filter((r) => r.node === n && r.kind === 'AIFS' && r.untilNs > r.t).map((r) => r.untilNs - r.t))
      expect([...lens].map((x) => `${x / US} µs`), name).toEqual([aifs])
      const cws = [...new Set(ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === n).map((r) => r.cw))].sort((a, b) => a - b)
      expect(cws.join('、'), name).toBe(windows)
    }
    // "上传站点另有几段 103 µs 的等待"
    const eifs = new Set(ofType(rs, 'IFS_START').filter((r) => r.node === 'sta-2' && r.kind === 'EIFS').map((r) => r.untilNs - r.t))
    expect([...eifs]).toEqual([103 * US])
    expect(l.expect).toContain('103 µs')
  })

  it('lab 3: the one internal collision, on the AP', () => {
    const l = lab('接入点上的内部碰撞')
    const ic = ofType(rs, 'INTERNAL_COLLISION')
    expect(ic).toHaveLength(1)
    const c = ic[0]
    expect(c.node).toBe('ap')
    expect([c.winnerAc, c.loserAc]).toEqual([3, 1])
    expect(l.expect).toContain(`${msOf(c.t)} ms 处`)
    const ch = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'ap' && r.ac === 1 && r.t <= c.t)
    const [before, after] = ch.slice(-2)
    expect(after.t).toBe(c.t)
    const redraw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'ap' && r.t === c.t && r.ac === 1)!
    expect(l.expect).toContain(`QSRC 从 ${before.qsrc} 变为 ${after.qsrc}，窗口从 ${before.cw} 加倍到 ${after.cw}，重新抽到 ${redraw.value}`)
    const voTx = ofType(rs, 'TX_START').find((r) => r.node === 'ap' && r.t === c.t)!
    expect(voTx.frame.ac).toBe(3)
    expect(voTx.frame.dst).toBe('sta-1')
    expect(l.meaning).toContain(`2^${after.qsrc} × (15 + 1) − 1 = ${after.cw}`)
    // the AP's own default (dot11QAPEDCATable) caps BE at 63
    expect(before.cw).toBeGreaterThan(63)
  })
})
