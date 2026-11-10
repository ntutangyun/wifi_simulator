/**
 * `@mlo`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11be-2024 for what MLO specifies; ② says, row by row, what this engine does
 * and is checked here against the engine; ③'s three labs print figures, and every one of them is
 * read back out of the lesson text and compared with a run of the lesson's own 300 ms — so editing
 * a number in the lesson without the engine agreeing turns this red, and so does an engine change
 * that moves a number the lesson still prints.
 *
 * The drop branch of the retry path (seven attempts, then DROP with reason `retryLimit`) is still
 * pinned against a SYNTHETIC copy of the scene with the laptop out of range, because the lesson's
 * own 300 ms never reaches it — which ② says in so many words.
 *
 * tests/course/lesson-claims.test.ts and tests/course/lessons.test.ts keep their own pins on this
 * scene; both read `l.scenario()` only, never prose.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { mlo, mloStack, LANE_FRAMES } from '../../src/course/tier2/mlo'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { AcQueues } from '../../src/engine/queues'
import { EDCA_PARAMS, MAX_AMPDU_MPDUS, MAX_PPDU_NS, SHORT_RETRY_LIMIT } from '../../src/engine/phy'
import type { Msdu } from '../../src/engine/traffic'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** The 300 ms every number in this lesson is measured over — and the window the jumps need. */
const RUN_NS = 300 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const idsOf = (r: Tx): number[] => r.frame.ampdu?.msduIds ?? [r.frame.msduId!]

/** One run of a modified copy of the scene. */
function view(mod: (sc: Scenario) => void = () => {}): TLRecord[] {
  const sc = mlo.scenario()
  mod(sc)
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

const lab = (heading: string): Lab => {
  const l = mlo.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = mlo.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
/** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
const same = (printed: string, measured: number, what: string): void => {
  const fig = printed.replace(/[\s,]/g, '')
  const dp = (fig.split('.')[1] ?? '').length
  expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`).toBe(Number(measured.toFixed(dp)))
}
const zh = (s: string): number => '零一二三四五六七八九十'.indexOf(s === '两' ? '二' : s)

lessonShapeSuite(mlo, { runNs: RUN_NS })

const rs = runOf(mlo, undefined, RUN_NS)

describe('mlo · the lesson', () => {
  it('is in the standard-first shape, in the scheduled-Wi-Fi module', () => {
    expect(isStandardFirst(mlo)).toBe(true)
    expect(MODULES[mlo.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mlo.needs).toEqual(['retries-queues', 'protect-policies', 'width'])
    expect(mlo.terms!.map((t) => t.term)).toEqual(['link', 'MLO', 'MLD'])
    expect(mlo.limits).toEqual([])
    expect(mlo.observe).toEqual([])
    expect(mlo.tryThis).toEqual([])
  })

  it('keeps the scenario builder untouched: one room, three devices, no variants', () => {
    const sc = mlo.scenario()
    expect(mlo.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    expect(sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo).toBe(true)
    expect(sc.nodes.find((n) => n.id === 'sta-2')!.caps.features.mlo).toBeFalsy()
    // only the laptop and the access point are ever on 6 GHz
    const on6 = new Set(rs.flatMap((r) => (r.type === 'TX_START' && r.node.includes('#6g') ? [r.node] : [])))
    expect([...on6].sort()).toEqual(['ap#6g', 'sta-1#6g'])
  })

  it('cites each clause it teaches in ①, and §35.3.16.1 — not §35.3.7 — for per-link access', () => {
    const std = mlo.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const c of ['§35.3.1', '§35.3.2', '§5.1.5.1', '§35.3.16.1', '§35.3.16.3', '§35.3.7.2.1', '§35.3.7.2.2',
      '§10.3.2.14.2', '表 10-5', '§35.3.8', '§35.3.16.9', '§35.3.5.1', '§35.3.16.4', '§35.3.17']) {
      expect(std, c).toContain(c)
    }
    // the audit's correction: the old prose put per-link channel access under §35.3.7 (link management)
    expect(mlo.standard!.find((b) => b.heading?.startsWith('每条链路各自竞争'))!.heading).toContain('§35.3.16.1')
    expect(std).toContain('标准没有规定在这组链路中选哪一条')
  })

  it('② is not all faithful, and names the engine’s own choice of link as a choice', () => {
    const kinds = new Set(mlo.implementation!.map((r) => r.kind))
    // 2026-11-11 (W7a): the one `differs` row, 「序号空间」, is faithful now — sequence numbers are
    // counted per <Address 1, TID> (§10.3.2.14.2, Table 10-5) — so no row of this lesson differs
    for (const k of ['faithful', 'choice', 'value', 'absent'] as const) expect(kinds.has(k), k).toBe(true)
    expect(kinds.has('differs')).toBe(false)
    expect(implRow('选哪一条链路').kind).toBe('choice')
    expect(implRow('选哪一条链路').standard).toBe('标准未规定')
  })
})

describe('mlo · ② says what the engine does, and the engine does it', () => {
  it('the shared frames live with the device: one ARRIVAL/ENQUEUE lane, the 5 GHz one', () => {
    expect(implRow('共享的帧在设备这一层').sim).toContain('一套四条接入类别')
    expect(EDCA_PARAMS.length).toBe(4)
    for (const t of ['ARRIVAL', 'ENQUEUE'] as const) {
      const lanes = rs.flatMap((r) => (r.type === t && r.node.startsWith('sta-1') ? [r.node] : []))
      expect(lanes.length, t).toBeGreaterThan(0)
      expect(new Set(lanes), t).toEqual(new Set(['sta-1']))
    }
  })

  it('each link contends on its own: both lanes draw their own backoff, and 5 GHz counts on while 6 GHz sends', () => {
    type Draw = Extract<TLRecord, { type: 'BACKOFF_DRAW' }>
    const draws = (node: string) => rs.filter((r): r is Draw => r.type === 'BACKOFF_DRAW' && r.node === node)
    expect(draws('sta-1').length).toBeGreaterThan(0)
    expect(draws('sta-1#6g').length).toBeGreaterThan(0)
    for (const r of [...draws('sta-1'), ...draws('sta-1#6g')]) expect(r.value).toBeLessThanOrEqual(r.cw!)
    // 「6 GHz 上发送时，5 GHz 的计数照常进行」: during the first 6 GHz burst the 5 GHz lane decrements
    const burst = data(rs, 'sta-1#6g')[0]
    const decs = rs.filter((r) => r.type === 'BACKOFF_DEC' && r.node === 'sta-1'
      && r.t > burst.t && r.t < burst.t + burst.frame.txTimeNs)
    expect(decs.length).toBeGreaterThan(0)
  })

  it('the choice of link is a queue operation: claiming removes, and no MSDU rides both lanes', () => {
    const q = new AcQueues()
    const msdu = (id: number): Msdu => ({ id, bytes: 1500, ac: 1, dst: 'ap', src: 'sta-1', bornNs: 0 })
    for (let i = 1; i <= 5; i++) q.enqueue(1, msdu(i))
    expect(q.claim(1, 'ap', MAX_AMPDU_MPDUS, () => true).map((m) => m.id)).toEqual([1, 2, 3, 4, 5])
    expect(q.depth(1)).toBe(0)
    const lanes = new Map<number, Set<string>>()
    for (const r of [...data(rs, 'sta-1'), ...data(rs, 'sta-1#6g')]) {
      for (const id of idsOf(r)) lanes.set(id, (lanes.get(id) ?? new Set()).add(r.node))
    }
    expect(lanes.size).toBeGreaterThan(300)
    expect([...lanes.values()].filter((s) => s.size > 1)).toEqual([])
  })

  it('a claim takes at most 64 frames and 5.484 ms of data', () => {
    const sim = implRow('一次取走多少帧').sim
    const m = /最多 (\d+) 帧、([\d.]+) ms 的数据/.exec(sim)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(MAX_AMPDU_MPDUS)
    same(m![2], MAX_PPDU_NS / MS, 'the longest transmission')
    for (const r of [...data(rs, 'sta-1'), ...data(rs, 'sta-1#6g')]) {
      expect(r.frame.ampdu?.mpduCount ?? 1).toBeLessThanOrEqual(MAX_AMPDU_MPDUS)
    }
  })

  it('the sequence counter is the device’s, per <Address 1, TID>', () => {
    // 2026-11-11 (W7a): Table 10-5's SNS2 — one counter per <Address 1, TID> for QoS Data, and the
    // single baseline counter (SNS1) for non-QoS Data; before, the engine counted per access category
    expect(implRow('序号空间').kind).toBe('faithful')
    expect(implRow('序号空间').sim).toContain('〈Address 1，TID〉')
    const q = new AcQueues()
    expect([q.nextSeq('ap', 0), q.nextSeq('ap', 0), q.nextSeq('ap', 0)]).toEqual([0, 1, 2])
    expect(q.nextSeq('ap', 3)).toBe(0)
    expect(q.nextSeq('sta-2', 0)).toBe(0)
    expect([q.nextSeq('ap', null), q.nextSeq('sta-2', null)]).toEqual([0, 1])
    const seqs = [...data(rs, 'sta-1'), ...data(rs, 'sta-1#6g')].filter((r) => r.frame.ac === 1).map((r) => r.frame.seqNo)
    expect(new Set(seqs).size).toBe(seqs.length)
    // 「本课的数据帧都属于尽力而为一类」
    expect(new Set([...data(rs, 'sta-1'), ...data(rs, 'sta-1#6g')].map((r) => r.frame.ac))).toEqual(new Set([1]))
  })

  it('no ADDBA, and the BlockAck comes back on the lane the batch went out on', () => {
    expect(rs.some((r) => r.type === 'TX_START' && (r.frame.kind as string) === 'addba')).toBe(false)
    const burst = data(rs, 'sta-1#6g')[0]
    const ba = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'ba' && r.t > burst.t)!
    expect(ba.node).toBe('ap#6g')
  })

  it('a failed set goes back to the FRONT of the shared queue', () => {
    const q = new AcQueues()
    const msdu = (id: number): Msdu => ({ id, bytes: 1500, ac: 1, dst: 'ap', src: 'sta-1', bornNs: 0 })
    q.enqueue(1, msdu(9))
    q.restore(1, [msdu(7), msdu(8)])
    expect(q.peek(1).map((m) => m.id)).toEqual([7, 8, 9])
  })

  it('the retry limit is 7, and this scene never reaches it', () => {
    const m = /dot11ShortRetryLimit 的默认值为 (\d+)/.exec(implRow('重传次数的上限').standard)
    expect(Number(m![1])).toBe(SHORT_RETRY_LIMIT)
    expect(/计数达到 (\d+) 就被丢弃/.exec(implRow('重传次数的上限').sim)![1]).toBe(String(SHORT_RETRY_LIMIT))
    expect(ofType(rs, 'DROP')).toHaveLength(0)
    expect(implRow('重传次数的上限').sim).toContain('300 ms 内没有发生')
  })
})

describe('mlo · the drop branch, against a synthetic copy the lesson never loads', () => {
  const far = view((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x: 200, y: 200, z: 1 } })

  it('under the limit the set goes back to the shared queue, and the retries alternate between the links', () => {
    const attempts = [...data(far, 'sta-1'), ...data(far, 'sta-1#6g')].filter((r) => idsOf(r).includes(1))
    expect(attempts).toHaveLength(SHORT_RETRY_LIMIT)
    expect(new Set(attempts.map((r) => r.node))).toEqual(new Set(['sta-1', 'sta-1#6g']))
  })

  it('at the limit it is dropped, not restored: DROP with reason retryLimit, then its DEQUEUE', () => {
    const drops = ofType(far, 'DROP').filter((r) => r.node.startsWith('sta-1'))
    expect(drops.length).toBeGreaterThan(0)
    expect(new Set(drops.map((r) => r.reason))).toEqual(new Set(['retryLimit']))
    for (const d of drops) {
      expect(ofType(far, 'DEQUEUE').find((r) => r.msduId === d.msduId && r.node === d.node && r.t === d.t), `msdu ${d.msduId}`).toBeDefined()
    }
  })
})

describe('mlo · ③ every figure the labs print is the run', () => {
  const batch = data(rs, 'sta-1#6g')[0]
  const ids = idsOf(batch)

  it('lab 1: the five rows of MSDU 66, record column and all', () => {
    const l = lab('一帧经历的各个步骤')
    const t = tableOf(l, 'MSDU 66，6 GHz 上的第一批')
    expect(Number(/MSDU (\d+)/.exec(t.heading!)![1])).toBe(ids[0])
    expect(t.rows).toHaveLength(5)
    const parse = (cell: string) => {
      const m = /^(?:(\d+) × )?([A-Z_]+(?: \+ [A-Z_]+)*) · (\S+)$/.exec(cell)
      expect(m, cell).not.toBeNull()
      return { n: m![1] ? Number(m![1]) : undefined, types: m![2].split(' + '), node: m![3] }
    }
    for (const row of t.rows) {
      const when = Math.round(Number(row[0].replace(' ms', '')) * MS)
      const { n, types, node } = parse(row[1])
      for (const type of types) {
        const hit = rs.filter((r) => r.type === type && r.t === when && (r as { node?: string }).node === node)
        if (n !== undefined) expect(hit.length, `${row[0]} ${type}`).toBe(n)
        else expect(hit.length, `${row[0]} ${type}`).toBeGreaterThan(0)
      }
    }
    // row 1: 「第 66 帧，1500 字节，进入尽力而为队列，深度 1」
    const r1 = /第 (\d+) 帧，(\d+) 字节，进入尽力而为队列，深度 (\d+)/.exec(t.rows[0][2])!
    const enq = ofType(rs, 'ENQUEUE').find((r) => r.msduId === Number(r1[1]))!
    expect(Number(r1[1])).toBe(ids[0])
    expect([Number(r1[2]), Number(r1[3]), enq.ac]).toEqual([enq.bytes, enq.depth, 1])
    // row 2: 「一次取走 20 帧，编号 66–85，30,718 字节，…第 13 级」
    const r2 = /一次取走 (\d+) 帧，编号 (\d+)–(\d+)，([\d,]+) 字节，调制与编码方式（modulation and coding scheme, MCS）第 (\d+) 级/.exec(t.rows[1][2])!
    expect(r2).not.toBeNull()
    expect(Number(r2[1])).toBe(ids.length)
    expect([Number(r2[2]), Number(r2[3])]).toEqual([ids[0], ids[ids.length - 1]])
    // 2026-11-11 (W7a): the printed octets are the A-MPDU before EOF padding, APEP_LENGTH (§10.12.6) —
    // what the duration is computed from; frame.bytes is now PSDU_LENGTH, padded to the last symbol
    same(r2[4], batch.frame.apepBytes!, 'the batch’s bytes')
    expect(Number(r2[5])).toBe(batch.frame.mcs)
    // row 3: 「5 GHz 的退避计数还剩 2，即还要再空闲两个时隙」 (the old 「只晚了 88 µs」 was the
    // arrival-to-burst gap, not how far behind the 5 GHz countdown was, and is gone)
    const r3 = /退避计数还剩 (\d+)，即还要再空闲(.)个时隙（slot time）/.exec(t.rows[2][2])!
    const dec = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-1' && r.t === batch.t)
    expect(dec.map((r) => r.value)).toEqual([Number(r3[1])])
    expect(zh(r3[2])).toBe(Number(r3[1]))
    // row 4: 「块确认，32 字节，一次确认这 20 帧」
    const ba = rs.find((r): r is Tx => r.type === 'TX_START' && r.node === 'ap#6g' && r.frame.kind === 'ba')!
    const r4 = /块确认，(\d+) 字节，一次确认这 (\d+) 帧/.exec(t.rows[3][2])!
    expect([Number(r4[1]), Number(r4[2])]).toEqual([ba.frame.bytes, ids.length])
    // row 5's DEQUEUEs are the batch's ids
    const when5 = Math.round(Number(t.rows[4][0].replace(' ms', '')) * MS)
    expect(ofType(rs, 'DEQUEUE').filter((r) => r.t === when5 && r.node === 'sta-1#6g').map((r) => r.msduId).sort((a, b) => a - b)).toEqual(ids)
    // expect: 「5 GHz 的计数还差 2」
    expect(/计数还差 (\d+)/.exec(l.expect)![1]).toBe(r3[1])
  })

  it('lab 2: the stack figure, 67 against 240, and ids 66–85 nowhere on 5 GHz', () => {
    const l = lab('两条链路取的是同一组帧')
    const on5 = data(rs, 'sta-1').length, on6 = data(rs, 'sta-1#6g').length
    expect([on5, on6]).toEqual([LANE_FRAMES.g5, LANE_FRAMES.g6])
    const fig = l.blocks!.find((b) => b.kind === 'diagram') as { spec: unknown; caption?: string }
    expect(fig.spec).toEqual(mloStack())
    const m = /每(.)帧中有(.)帧从 6 GHz/.exec(fig.caption!)!
    expect(Math.abs(on6 / (on5 + on6) / (zh(m[2]) / zh(m[1])) - 1)).toBeLessThan(0.05)
    const e = /5 GHz 上 (\d+) 个数据帧，6 GHz 上 (\d+) 个；编号 (\d+)–(\d+)/.exec(l.expect)!
    expect([Number(e[1]), Number(e[2])]).toEqual([on5, on6])
    expect([Number(e[3]), Number(e[4])]).toEqual([ids[0], ids[ids.length - 1]])
    const on5ids = new Set(data(rs, 'sta-1').flatMap(idsOf))
    expect(ids.filter((id) => on5ids.has(id))).toEqual([])
    expect(/取走 (\d+) 帧/.test(l.steps.join(''))).toBe(false)
    expect(l.steps[1]).toContain(`编号 ${ids[0]}–${ids[ids.length - 1]}`)
  })

  it('lab 3: the six failures, where each happened and which lane carried the set next', () => {
    const l = lab('失败的一批由另一条链路发出')
    const rows = tableOf(l, '300 ms 内笔记本的六次失败').rows
    const retries = ofType(rs, 'RETRY').filter((r) => r.node.startsWith('sta-1'))
    expect(rows).toHaveLength(retries.length)
    const band = (node: string) => (node.endsWith('#6g') ? '6 GHz' : '5 GHz')
    let other = 0
    for (const [i, rt] of retries.entries()) {
      const [when, failedOn, next] = rows[i]
      expect(when, `row ${i}`).toBe(`${rt.t / MS} ms，第 ${rt.msduId} 帧`)
      // every failure is a simultaneous RTS with the neighbour, on the 5 GHz lane
      const lastTx = rs.filter((r): r is Tx => r.type === 'TX_START' && r.node.startsWith('sta-1') && r.t <= rt.t).at(-1)!
      expect(lastTx.frame.kind, `row ${i}`).toBe('rts')
      expect(ofType(rs, 'COLLISION').some((c) => c.t > lastTx.t - 1 && c.t <= rt.t && c.nodes.includes('sta-1') && c.nodes.includes('sta-2')), `row ${i}`).toBe(true)
      expect(failedOn, `row ${i}`).toBe(band(lastTx.node))
      const carrier = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && idsOf(r).includes(rt.msduId))!
      expect(next, `row ${i}`).toBe(`${band(carrier.node)}，${carrier.t / MS} ms`)
      if (band(carrier.node) !== failedOn) other++
    }
    const e = /六次失败都发生在 5 GHz.*其中(.)次，这一批帧下一次由 6 GHz 发出/.exec(l.expect)!
    expect(zh(e[1])).toBe(other)
    expect(zh('六')).toBe(retries.length)
    // the jump lands on the RETRY of the row the steps name
    const j = mlo.jumps[l.jump!]
    const hit = rs.find(j.find) as Extract<TLRecord, { type: 'RETRY' }>
    expect(hit.type).toBe('RETRY')
    expect(l.steps[0]).toContain(`第 ${hit.msduId} 帧`)
    expect(rows.find((r) => r[0].includes(`第 ${hit.msduId} 帧`))![2]).toMatch(/^6 GHz/)
  })
})
