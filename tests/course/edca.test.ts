/**
 * `@edca`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 for the four EDCAFs, AIFS[AC], the default parameters and internal
 * collisions; the figures it prints are compared with the engine's own constants. ② is pinned row by
 * row against the engine. 2026-11-11 (W7b): the AP's parameter set (dot11QAPEDCATable) and the
 * AC taken from each MSDU's UP (Table 10-1) are now faithful and pinned as such; the internal-collision
 * retry count is faithful too (§10.23.2.12.1 asks for it — the row that said otherwise was wrong).
 * ③'s figures are read back out of the lesson text and compared with a 400 ms run of the lesson's own
 * scene, which holds one internal collision (191.4675 ms, re-measured after the W6 merge).
 */
import { describe, it, expect } from 'vitest'
import { edca, edcaAifsTiming } from '../../src/course/tier2/edca'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { EDCA_PARAMS, OFDM_5G, QAP_EDCA_PARAMS, aifsNs } from '../../src/engine/phy'
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

  it('the AC follows each MSDU\'s UP by Table 10-1: each station uses exactly one class, only the AP holds two', () => {
    // 2026-11-11: was `differs` (AC from the profile); every MSDU now carries a UP (§10.2.3.2).
    expect(implRow('帧归入哪一类').kind).toBe('faithful')
    expect(implRow('数据单元的优先级从哪里来').kind).toBe('choice')
    const acs = (n: string) => new Set(draws(n).map((d) => d.ac))
    expect(acs('sta-1')).toEqual(new Set([3]))
    expect(acs('sta-2')).toEqual(new Set([1]))
    expect(acs('sta-3')).toEqual(new Set([0]))
    expect(acs('ap')).toEqual(new Set([1, 3]))
  })

  it('the AP uses dot11QAPEDCATable: VO AIFS 25 µs (AIFSN 1), BE windows capped at 63', () => {
    // 2026-11-11: was `differs` (the AP used Table 9-194: VO AIFS 34 µs, BE windows to 255).
    expect(implRow('接入点的参数').kind).toBe('faithful')
    const vo = QAP_EDCA_PARAMS.find((p) => p.name === 'VO')!
    const be = QAP_EDCA_PARAMS.find((p) => p.name === 'BE')!
    expect([vo.aifsn, be.cwMax]).toEqual([1, 63])
    const apVo = ofType(rs, 'IFS_START').filter((r) => r.node === 'ap' && r.ac === 3 && r.kind === 'AIFS' && r.untilNs > r.t)
    expect(Math.max(...apVo.map((r) => r.untilNs - r.t))).toBe(aifsNs(1, OFDM_5G))
    expect(Math.max(...draws('ap').filter((d) => d.ac === 1).map((d) => d.cw))).toBe(63)
  })

  it('the draw happens at the end of AIFS, and the counter decrements on that same boundary', () => {
    for (const d of draws('sta-1')) {
      const end = ofType(rs, 'IFS_END').find((r) => r.node === 'sta-1' && r.t === d.t)
      expect(end, `draw at ${d.t}`).toBeDefined()
    }
  })

  it('internal collision: CW follows the standard\'s formula, at the AP\'s own CWmax', () => {
    const p = QAP_EDCA_PARAMS.find((x) => x.name === 'BE')!
    const ch = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'ap' && r.ac === 1 && (r.qsrc ?? 0) > 0)
    expect(ch.length).toBeGreaterThan(0)
    for (const c of ch) expect(c.cw, `qsrc ${c.qsrc}`).toBe(Math.min(p.cwMax, 2 ** c.qsrc! * (p.cwMin + 1) - 1))
  })

  it('internal collision: a retry is counted only for an MSDU involved (§10.23.2.12.1)', () => {
    // 2026-11-11: was pinned as `differs`; §10.23.2.12.1 says the retry counts of the MSDUs involved
    // in an internal collision are incremented, so the engine was right and the row was not. In this
    // scene the AP's losing BE EDCAF holds no MSDU (it contends for an UL Trigger frame), so no
    // RETRY is written; the head-MSDU case is an engine-level property (mac.ts `arbitrate`).
    expect(implRow('内部碰撞与帧的重传（retry）计数').kind).toBe('faithful')
    expect(ofType(rs, 'ENQUEUE').filter((r) => r.node === 'ap' && r.ac === 1)).toEqual([])
    expect(ofType(rs, 'TX_START').some((r) => r.node === 'ap' && r.frame.kind === 'trigger' && r.frame.ac === 1)).toBe(true)
    for (const c of ofType(rs, 'INTERNAL_COLLISION')) {
      expect(ofType(rs, 'RETRY').some((r) => r.node === c.node && r.t === c.t), `${c.t}`).toBe(false)
    }
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
    const apDraw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'ap' && r.ac === 3)!
    const apTx = ofType(rs, 'TX_START').find((r) => r.node === 'ap' && r.frame.kind === 'data' && r.frame.ac === 3)!
    expect(rows[0][1]).toBe(`${msOf(ifs.t)} ms`)
    expect(rows[1][1]).toBe(`${(ifs.untilNs - ifs.t) / US} µs`)
    expect(rows[1][0]).toContain(`16 + ${by('VO').aifsn} × 9`)
    expect(rows[2][0]).toContain(`CWmin ${draw.cw}`)
    expect(rows[2][1]).toBe(`${msOf(draw.t)} ms · 抽到 ${draw.value}`)
    expect(rows[3][1]).toBe(`${msOf(decs[0].t)} ms · ${draw.value} → ${decs[0].value}`)
    expect(rows[4][1]).toBe(`${msOf(decs[1].t)} ms · ${decs[0].value} → ${decs[1].value}`)
    expect(decs[1].value).toBe(0)
    // 2026-11-11: the AP's VO (AIFSN 1, dot11QAPEDCATable) starts one slot earlier and transmits on
    // the boundary where the caller's counter reaches 0; the caller freezes at 0 and goes after it.
    expect(apTx.t).toBe(decs[1].t)
    expect(rows[5][1]).toBe(`${msOf(apTx.t)} ms`)
    expect(rows[6][1]).toBe(`${msOf(tx.t)} ms`)
    const apIdle = ofType(rs, 'TX_END').filter((r) => r.t < tx.t && r.t > apTx.t).at(-1)!
    expect(tx.t - apIdle.t).toBe(aifsNs(by('VO').aifsn, OFDM_5G))
    expect(apDraw.t).toBe(draw.t - OFDM_5G.slotNs)
    expect(apDraw.value).toBe(draw.value)
    expect(l.expect).toContain(`${msOf(draw.t)} ms 抽到 ${draw.value}，计数在 ${msOf(decs[1].t)} ms 减到 0`)
    expect(l.expect).toContain(`AIFS 为 16 + 1 × 9 = ${aifsNs(1, OFDM_5G) / US} µs，早一个时隙在 ${msOf(apDraw.t)} ms 同样抽到 ${apDraw.value}，在 ${msOf(apTx.t)} ms 先发送`)
    expect(l.expect).toContain(`于 ${msOf(tx.t)} ms 发送`)
    // "两帧语音都收到了确认"
    for (const [n, from] of [['sta-1', 'ap'], ['ap', 'sta-1']] as const) {
      const start = n === 'sta-1' ? tx.t : apTx.t
      const next = ofType(rs, 'RX_OK').find((r) => r.node === n && r.t > start && r.frame.kind === 'ack' && r.from === from)
      const to = ofType(rs, 'ACK_TIMEOUT').find((r) => r.node === n && r.t > start)
      expect(next, n).toBeDefined()
      expect(to === undefined || to.t > next!.t, n).toBe(true)
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
      // The full AIFS is the longest wait; a shorter one is an AIFS started after part of the idle
      // time had already elapsed (the 2026-11-11 run has one such on the backup station).
      const lens = ofType(rs, 'IFS_START').filter((r) => r.node === n && r.kind === 'AIFS' && r.untilNs > r.t).map((r) => r.untilNs - r.t)
      expect(`${Math.max(...lens) / US} µs`, name).toBe(aifs)
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
    // 2026-11-11 (W6 merged): one internal collision in 400 ms, not two. Before it the AP's BE
    // already has QSRC 1 from an unanswered Trigger frame (§10.3.2.9 timeout; §10.23.2.2 doubles
    // CW on failure), so this collision takes CW from 31 to 63, the dot11QAPEDCATable CWmax.
    expect(ic).toHaveLength(1)
    expect(l.expect).toContain('整轮 400 ms 只有这一次内部碰撞')
    for (const c of ic) {
      expect(c.node).toBe('ap')
      expect([c.winnerAc, c.loserAc]).toEqual([3, 1])
    }
    // The CW before a collision: the last CW_CHANGE of AP BE before it, or CWmin with QSRC 0.
    const around = (t: number) => {
      const prev = ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'ap' && r.ac === 1 && r.t < t).at(-1)
      const after = ofType(rs, 'CW_CHANGE').find((r) => r.node === 'ap' && r.ac === 1 && r.t === t)!
      return { before: prev ?? { qsrc: 0, cw: 15 }, after }
    }
    const [c1] = ic
    expect(l.expect).toContain(`${msOf(c1.t)} ms 处`)
    const { before, after } = around(c1.t)
    const redraw = ofType(rs, 'BACKOFF_DRAW').find((r) => r.node === 'ap' && r.t === c1.t && r.ac === 1)!
    expect(l.expect).toContain(`QSRC 从 ${before.qsrc} 变为 ${after.qsrc}，窗口从 ${before.cw} 加倍到 ${after.cw}，重新抽到 ${redraw.value}`)
    const voTx = ofType(rs, 'TX_START').find((r) => r.node === 'ap' && r.t === c1.t)!
    expect(voTx.frame.ac).toBe(3)
    expect(voTx.frame.dst).toBe('sta-1')
    expect(l.meaning).toContain(`2^${after.qsrc} × (15 + 1) − 1 = ${after.cw}`)
    // the earlier failure: an unanswered Trigger frame, its timeout and the doubling it caused
    const [trigAt] = l.expect.match(/([\d.]+) ms 发出的触发帧之后/)!.slice(1)
    const trig = ofType(rs, 'TX_START').find((r) => r.node === 'ap' && r.frame.kind === 'trigger' && msOf(r.t) === trigAt)!
    expect(trig).toBeDefined()
    const to = ofType(rs, 'ACK_TIMEOUT').find((r) => r.node === 'ap' && r.t > trig.t)!
    expect('t' in before && before.t).toBe(to.t)
    expect([before.qsrc, before.cw]).toEqual([1, 31])
    expect(ofType(rs, 'CW_CHANGE').filter((r) => r.node === 'ap' && r.ac === 1 && r.t > to.t && r.t < c1.t)).toEqual([])
    // the AP's own default (dot11QAPEDCATable) caps BE at 63
    expect(after.cw).toBe(QAP_EDCA_PARAMS[1].cwMax)
  })
})
