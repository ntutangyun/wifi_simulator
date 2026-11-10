/**
 * `@amp-slots`, in the standard-first shape (2026-11-11).
 *
 * ① cites the PDT clause and the TGbp motion behind each rule of the slotted access; ② says what
 * the engine does about each, checked here against the runs; every figure the labs print is read
 * back out of the lesson's own text and compared with a run.
 *
 * `lessonShapeSuite` (tests/course/kit.ts) is not used: its jump check runs only the base scene,
 * and two of this lesson's five jumps — the sit-out and the scheduled trigger — exist only in a
 * variant, by design (tests/ui/eventLogWindow.test.ts pins both). The `lesson shape` describe
 * below does the same checks, with each jump looked for in the run it belongs to.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ampSlots } from '../../src/course/amp/amp-slots'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { AMP_STA_ID_BYTES, AMP_UL_CHIP_NS, AMP_UL_SYNC_CHIPS, ampRespBytes } from '../../src/engine/amp'
import { QAP_EDCA_PARAMS } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import type { TLRecord } from '../../src/model/records'
import { MODULES, CHARS_PER_MINUTE, OBSERVE_MINUTES, TRY_MINUTES, lessonBlocks, lessonChars, lessonMinutes } from '../../src/course/curriculum'
import { isMigrated, isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { readerTexts } from '../../src/course/readability'
import { rssiOn } from './rssi'

const MS = 1_000_000
const US = 1_000
/** 30 rounds at one round every 20 ms. */
const ROUNDS = 30
const RUN_NS = 600 * MS
const AP = 'ap#2g'
const TAGS = [1, 2, 3, 4, 5, 6].map((i) => `tag-${i}#2g`)
const ACWE1 = 0, ACWE3 = 1, TWO_PHASE = 2
const ALL_RUNS: (number | undefined)[] = [undefined, ACWE1, ACWE3, TWO_PHASE]
/**
 * Slots per random-access trigger at 250 kb/s with a reading in every answer: 2026-11-11 (W7b)
 * every AMP TXOP fits the AP's AC_BK TXOP limit (§10.23.2.9, Table 9-194), and two slots are all
 * that fit after the CTS-to-self and the trigger, so a round of four is two triggers of two.
 */
const N = 2
const CAPTURE_MARGIN_DB = Number(/const CAPTURE_MARGIN_DB = (\d+)/.exec(readFileSync('src/engine/channel.ts', 'utf8'))![1])

const memo = new Map<string, TLRecord[]>()
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const s: Scenario = variant === undefined ? ampSlots.scenario() : ampSlots.variants![variant].scenario()
    memo.set(key, [...new Simulation(s).runUntil(RUN_NS).records])
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const results = (rs: TLRecord[]) => ofType(rs, 'AMP_RESULT')
const acked = (rs: TLRecord[]) => results(rs).filter((r) => r.acked).length
const readingsDelivered = (rs: TLRecord[]) =>
  ofType(rs, 'RX_OK').filter((r) => r.node === AP && r.frame.kind === 'ampResp' && r.frame.amp?.reading === true).length
const us = (cell: string): number => Number(/^([\d ]+) µs$/.exec(cell)![1].replace(/ /g, ''))
const num = (s: string): number => Number(s.replace(/ /g, ''))

function slotCensus(rs: TLRecord[], reachable: number) {
  const resp = txs(rs, 'ampResp')
  const slots = ofType(rs, 'AMP_SLOT').filter((s) => s.slot <= reachable)
  const per = slots.map((s) => resp.filter((r) => r.t >= s.t && r.t < s.untilNs).length)
  return { slots: slots.length, empty: per.filter((n) => n === 0).length, success: per.filter((n) => n === 1).length, collision: per.filter((n) => n > 1).length }
}
function model(M: number, acw: number, slots: number) {
  const q = 1 / (acw + 1)
  const empty = (1 - q) ** M
  const success = M * q * (1 - q) ** (M - 1)
  return { reachable: Math.min(slots, acw + 1), p: Math.min(slots, acw + 1) / (acw + 1), empty, success, collision: 1 - empty - success }
}

const lab = (heading: string): Lab => {
  const l = ampSlots.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const tableOf = (l: Lab, heading: string) => blockOf(l, 'table', heading)
const implRow = (topic: string) => {
  const row = ampSlots.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

describe('amp-slots · lesson shape', () => {
  it('is in the standard-first shape, in the AMP module', () => {
    expect(isMigrated(ampSlots)).toBe(true)
    expect(isStandardFirst(ampSlots)).toBe(true)
    expect(MODULES[ampSlots.module].title).toBe('环境能量物联网（802.11bp）')
    expect(ampSlots.standard!.length).toBeGreaterThan(0)
    expect(ampSlots.implementation!.length).toBeGreaterThan(0)
    expect(ampSlots.labs!.length).toBeGreaterThan(0)
    expect(ampSlots.sources!.length).toBeGreaterThan(0)
    expect(ampSlots.limits).toEqual([])
    expect(ampSlots.observe).toEqual([])
    expect(ampSlots.tryThis).toEqual([])
  })

  it('states the minutes the formula gives', () => {
    expect(lessonBlocks(ampSlots).length).toBe(ampSlots.standard!.length + ampSlots.labs!.reduce((n, x) => n + (x.blocks?.length ?? 0), 0))
    const raw = lessonChars(ampSlots) / CHARS_PER_MINUTE + OBSERVE_MINUTES * ampSlots.observe.length
      + TRY_MINUTES * (ampSlots.tryThis.length + ampSlots.labs!.length)
    expect(lessonMinutes(ampSlots)).toBe(Math.max(5, Math.round(raw / 5) * 5))
  })

  it('every string a learner reads is there', () => {
    for (const s of readerTexts(ampSlots)) expect(s.trim().length, s).toBeGreaterThan(0)
  })

  it('the scene and its three variants pass the schema, unchanged', () => {
    expect(() => ScenarioSchema.parse(ampSlots.scenario())).not.toThrow()
    for (const v of ampSlots.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(ampSlots.scenario().nodes[0].ampAp).toMatchObject({ pollIntervalMs: 20, slots: 4, acwe: 2, readMode: 'inline' })
    expect(ampSlots.variants!.map((v) => v.scenario().nodes[0].ampAp!.acwe)).toEqual([1, 3, 2])
    expect(ampSlots.variants![TWO_PHASE].scenario().nodes[0].ampAp!.readMode).toBe('twoPhase')
  })

  it('every jump fires in the run it belongs to, and every lab\'s jump in its own scene', () => {
    expect(ampSlots.jumps.length).toBe(5)
    for (const i of [0, 1, 2]) expect(recs().some(ampSlots.jumps[i].find), `jump ${i}`).toBe(true)
    expect(recs(ACWE3).some(ampSlots.jumps[3].find)).toBe(true)
    expect(recs(TWO_PHASE).some(ampSlots.jumps[4].find)).toBe(true)
    for (const l of ampSlots.labs!) {
      if (l.jump !== undefined) expect(recs(l.variant).some(ampSlots.jumps[l.jump].find), l.heading).toBe(true)
    }
  })

  it('① names the document, the clause or the motion behind each point', () => {
    const std = ampSlots.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const ref of ['11-24/1613r20', '11-26/1889r4', '11-26/1519r5', '11-25/1692r50', '§39.4', '§39.3.2.1', '§39.3.2.2',
      '#50', '#51', '#102', '#105', '#141', '#224', '#247', '#103', '#107', '#184', '#231', 'D0.5']) {
      expect(std, ref).toContain(ref)
    }
    expect(std).not.toContain('本仿真器')
  })
})

describe('amp-slots · ② says what the engine does, and the engine does it', () => {
  it('every tag that decodes the trigger draws once a round in [0, 2^ACWE − 1], and answers in ABOC + 1 or not at all', () => {
    for (const v of ALL_RUNS) {
      const acwe = (v === undefined ? ampSlots.scenario() : ampSlots.variants![v].scenario()).nodes[0].ampAp!.acwe
      for (const d of ofType(recs(v), 'AMP_ABOC')) {
        if (d.acw === 0 && d.slot !== null && v === TWO_PHASE) continue // scheduled phase: slot from the list
        expect(d.acw, `variant ${v}`).toBe(2 ** acwe - 1)
        expect(d.aboc).toBeLessThanOrEqual(d.acw)
        expect(d.slot).toBe(d.aboc < N ? d.aboc + 1 : null)
      }
      expect(ofType(recs(v), 'AMP_ABOC').length).toBeGreaterThan(0)
    }
    // six tags, two triggers a round
    expect(ofType(recs(), 'AMP_ABOC').length).toBe(6 * 2 * ROUNDS)
    expect(new Set(ofType(recs(), 'AMP_ROUND').map((r) => r.slots))).toEqual(new Set([N]))
    expect(implRow('ABOC 的抽取').sim).toContain(`每帧 N = ${N}`)
  })

  it('the draw is fresh every round: no window doubles, and each tag uses all four values', () => {
    expect(implRow('碰撞之后').kind).toBe('choice')
    for (const t of TAGS) {
      const d = ofType(recs(), 'AMP_ABOC').filter((r) => r.node === t)
      expect(new Set(d.map((r) => r.acw))).toEqual(new Set([3]))
      expect(new Set(d.map((r) => r.aboc))).toEqual(new Set([0, 1, 2, 3]))
    }
  })

  it('a tag answers one SIFS after the Ack it counts to', () => {
    const rs = recs()
    const ackEnds = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'ampAck').map((r) => r.t)
    for (const r of txs(rs, 'ampResp').filter((x) => (x.frame.amp!.slot ?? 0) > 1)) {
      expect(ackEnds.includes(r.t - 10 * US), `response at ${r.t}`).toBe(true)
    }
  })

  it('the scheduled trigger lists exactly the tags the random phase heard, in slot order', () => {
    expect(implRow('两阶段的名单').kind).toBe('faithful')
    const rs = recs(TWO_PHASE)
    const sched = txs(rs, 'ampTrigger').filter((r) => r.frame.amp!.phase === 'scheduled')
    // per poll: the scheduled triggers, in order, list exactly the tags the random phase heard
    for (let k = 0; k < ROUNDS; k++) {
      const t0 = k * 20 * MS, t1 = t0 + 20 * MS
      const heard = [...new Set(txs(rs, 'ampAck').filter((a) => a.t >= t0 && a.t < t1 && a.frame.dst !== a.frame.src
        && a.t < (sched.find((s) => s.t >= t0 && s.t < t1)?.t ?? t1)).map((a) => a.frame.dst))]
      const listed = sched.filter((s) => s.t >= t0 && s.t < t1).flatMap((s) => s.frame.amp!.staIds!)
      expect(listed, `poll ${k}`).toEqual(heard)
    }
    // each scheduled trigger lists one tag: two would not fit the TXOP limit
    for (const s of sched) expect(s.frame.amp!.staIds!.length).toBe(1)
    expect(sched.length).toBe(40)
    expect(ofType(rs, 'AMP_ROUND').filter((r) => r.phase === 'random').length).toBe(2 * ROUNDS)
    expect(implRow('一轮分几次传输机会').kind).toBe('choice')
  })

  it('the two-phase widths are 2 octets an ID, 7 octets an identity answer, 15 with a reading', () => {
    expect(AMP_STA_ID_BYTES).toBe(2)
    expect(implRow('两阶段的字段宽度').sim).toBe(`名单里每个标签 ${AMP_STA_ID_BYTES} 个字节；随机阶段只报身份的作答 ${ampRespBytes(false)} 个字节，调度阶段带读数的作答 ${ampRespBytes(true)} 个字节。`)
  })

  // 2026-11-11 (W7b): was `differs` — the two-phase round ran 6620 µs as one exchange.
  it('every TXOP of every run fits the AC_BK TXOP limit, and each CTS-to-self covers exactly its TXOP', () => {
    expect(implRow('两阶段的保护与长度').kind).toBe('faithful')
    expect(QAP_EDCA_PARAMS[0].txopLimitNs).toBe(2_528_000)
    for (const v of ALL_RUNS) {
      const rs = recs(v)
      const cts = txs(rs, 'cts')
      const ackEnds = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'ampAck').map((r) => r.t)
      for (const [i, c] of cts.entries()) {
        const end = ackEnds.filter((e) => e > c.t && (i + 1 >= cts.length || e < cts[i + 1].t)).pop()
        if (end === undefined) continue
        expect(end - c.t, `variant ${v} TXOP at ${c.t}`).toBeLessThanOrEqual(QAP_EDCA_PARAMS[0].txopLimitNs)
        expect(c.t + c.frame.txTimeNs + c.frame.durationFieldNs).toBe(end)
      }
    }
  })

  it('a collided slot is lost whole: no capture in any run, and the tags sit within 0.01 dB', () => {
    expect(implRow('同一时隙里的多路作答').sim).toContain(`强 ${CAPTURE_MARGIN_DB} dB 以上、且落在上行（uplink, UL）${AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[250] / US} µs 的 AMP-Sync 之内`)
    for (const v of ALL_RUNS) {
      expect(ofType(recs(v), 'RX_FAIL').filter((r) => r.reason === 'capture').length).toBe(0)
      expect(ofType(recs(v), 'COLLISION').length).toBeGreaterThan(0)
    }
    const s = ampSlots.scenario()
    const L = buildLinkTable(s.nodes, s.walls)
    const ul = s.nodes.slice(1).map((n) => rssiOn('2g', L, n.id, 'ap'))
    expect(Math.max(...ul) - Math.min(...ul)).toBeLessThan(0.01)
    expect(implRow('传播').sim).toContain('彼此相差不到 0.01 dB')
  })
})

describe('amp-slots · ③ every figure the labs print is the run', () => {
  it('lab 1: the four slots of the first round', () => {
    const rs = recs()
    const rows = tableOf(lab('第一轮，逐时隙'), '第一轮的四个时隙').rows
    const slots = ofType(rs, 'AMP_SLOT').filter((s) => s.t < 20 * MS)
    const trigs = txs(rs, 'ampTrigger').filter((r) => r.t < 20 * MS).map((r) => r.t)
    const name = (n: string) => n.replace(/^tag-(\d)#2g$/, '$1')
    expect(rows).toHaveLength(slots.length)
    for (const [i, s] of slots.entries()) {
      const row = rows[i]
      const txop = trigs.filter((t) => t < s.t).length
      const tEnd = trigs[txop] ?? 20 * MS
      const draws = ofType(rs, 'AMP_ABOC').filter((d) => d.t > trigs[txop - 1] && d.t < tEnd)
      const res = results(rs).filter((r) => r.t > s.t && r.t < tEnd)
      expect(row[0]).toBe(String(txop))
      expect(row[1]).toBe(String(s.slot))
      expect(us(row[2])).toBe(s.t / US)
      const who = draws.filter((d) => d.slot === s.slot)
      const ack = txs(rs, 'ampAck').find((a) => a.t > s.t)!
      if (who.length === 1) {
        expect(row[3]).toBe(`Tag ${name(who[0].node)}（ABOC ${who[0].aboc}）`)
        const r = res.find((x) => x.node === who[0].node)!
        expect(r.acked).toBe(true)
        expect(row[4]).toBe(`${r.t / US} µs 被确认`)
      } else if (who.length === 0) {
        expect(row[3]).toBe('无人')
        expect(row[4]).toBe('Ack 写的是路由器自己')
        expect(ack.frame.dst).toBe(ack.frame.src)
      } else {
        expect(row[3]).toBe(`Tag ${who.map((d) => name(d.node)).join('、')}（都是 ABOC ${who[0].aboc}）`)
        expect(new Set(who.map((d) => d.aboc)).size).toBe(1)
        expect(row[4]).toBe('碰撞；Ack 写的是路由器自己')
        expect(ack.frame.dst).toBe(ack.frame.src)
      }
    }
  })

  it('lab 1: the collided slot\'s records, and the thirty rounds\' Ack census', () => {
    const rs = recs()
    const e = lab('第一轮，逐时隙').expect
    const m = /两个标签在 (\d+) µs 同时开始发送，路由器记下两条原因为 preambleSinr 的 RX_MISS、没有 RX_FAIL，并在时隙结束的 (\d+) µs 记下一条 COLLISION；(\d+) µs 那帧 Ack 写的是路由器自己，两个标签在 (\d+) µs 收到它。三十轮、(\d+) 次传输机会里 (\d+) 帧 Ack 中 (\d+) 帧写的是某个标签，(\d+) 帧写的是路由器自己/.exec(e)!
    const coll = ofType(rs, 'COLLISION')[0]
    const together = txs(rs, 'ampResp').filter((r) => r.t === Number(m[1]) * US)
    expect(together.length).toBe(2)
    expect(ofType(rs, 'RX_MISS').filter((r) => r.node === AP && r.t === Number(m[1]) * US).map((r) => r.reason)).toEqual(['preambleSinr', 'preambleSinr'])
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP).length).toBe(0)
    expect(coll.t).toBe(Number(m[2]) * US)
    const ack = txs(rs, 'ampAck').find((a) => a.t > coll.t)!
    expect(ack.t).toBe(Number(m[3]) * US)
    expect(ack.frame.dst).toBe(ack.frame.src)
    expect(ack.t + ack.frame.txTimeNs).toBe(Number(m[4]) * US)
    const acks = txs(rs, 'ampAck')
    expect(ofType(rs, 'AMP_ROUND').filter((r) => r.t < RUN_NS).length).toBe(Number(m[5]))
    expect(txs(rs, 'cts').filter((r) => r.t < RUN_NS).length).toBe(Number(m[5]))
    expect(acks.length).toBe(Number(m[6]))
    expect(acks.filter((a) => a.frame.dst !== a.frame.src).length).toBe(Number(m[7]))
    expect(acks.filter((a) => a.frame.dst === a.frame.src).length).toBe(Number(m[8]))
  })

  const ROWS = [
    { variant: ACWE1 as number | undefined, acwe: 1 },
    { variant: undefined, acwe: 2 },
    { variant: ACWE3 as number | undefined, acwe: 3 },
  ]

  it('lab 2: the model table, both halves of every cell, and the readings a round', () => {
    const rows = tableOf(lab('窗口的宽窄'), `公式 / 三十轮实测（M = 6，每帧 N = ${N}）`).rows
    const pct = (x: number) => `${(x * 100).toFixed(1)} %`
    for (const [i, r] of ROWS.entries()) {
      const acw = 2 ** r.acwe - 1
      const m = model(6, acw, N)
      const c = slotCensus(recs(r.variant), m.reachable)
      const row = rows[i]
      expect(row[0]).toBe(`${r.acwe}（ACW ${acw}）`)
      expect(row[1]).toBe(`${m.reachable} / ${N}`)
      expect(c.slots).toBe(m.reachable * 2 * ROUNDS)
      expect(row[2]).toBe(`${pct(m.empty)} / ${pct(c.empty / c.slots)}`)
      expect(row[3]).toBe(`${pct(m.success)} / ${pct(c.success / c.slots)}`)
      expect(row[4]).toBe(`${pct(m.collision)} / ${pct(c.collision / c.slots)}`)
      expect(row[5]).toBe((acked(recs(r.variant)) / ROUNDS).toFixed(2))
      expect(readingsDelivered(recs(r.variant))).toBe(acked(recs(r.variant)))
    }
  })

  it('lab 2: the largest gap, the starved tags and the sit-out share', () => {
    const e = lab('窗口的宽窄').expect
    let worst = 0, worstAt = ''
    for (const r of ROWS) {
      const m = model(6, 2 ** r.acwe - 1, N)
      const c = slotCensus(recs(r.variant), m.reachable)
      for (const k of ['empty', 'success', 'collision'] as const) {
        const d = Math.abs(c[k] / c.slots - m[k])
        if (d > worst) { worst = d; worstAt = `${r.acwe} ${k}` }
      }
    }
    const g = /最大相差 ([\d.]+) 个百分点（ACWE (\d) 的空闲一列）/.exec(e)!
    expect(g[1]).toBe((worst * 100).toFixed(2))
    expect(worstAt).toBe(`${g[2]} empty`)
    const perTag = (rs: TLRecord[]) => TAGS.map((t) => results(rs).filter((r) => r.node === t && r.acked).length)
    expect(e).toContain('ACWE 1 下有一个标签一次也没被确认')
    expect(perTag(recs(ACWE1)).filter((n) => n === 0).length).toBe(1)
    const s = /ACWE 3 下 (\d+) 次抽取中 (\d+) 次落在时隙之外，占 ([\d.]+) %/.exec(e)!
    const d3 = ofType(recs(ACWE3), 'AMP_ABOC')
    expect(Number(s[1])).toBe(d3.length)
    expect(Number(s[2])).toBe(d3.filter((d) => d.slot === null).length)
    expect(s[3]).toBe((Number(s[2]) / Number(s[1]) * 100).toFixed(1))
    expect(model(6, 7, N).p).toBe(0.25)
    expect(e).toContain('公式给的是四分之三')
    expect(ampSlots.why).toContain(`碰撞占可达时隙的 ${(slotCensus(recs(ACWE1), 2).collision / (2 * 2 * ROUNDS) * 100).toFixed(1)} %`)
    expect(ampSlots.why).toContain('相差不到五个百分点')
    expect(worst).toBeLessThan(0.05)
  })

  // 2026-11-11 (W7b): the two-phase round is now four TXOPs (two random, two scheduled), each
  // inside the AC_BK TXOP limit; the formula is per TXOP.
  it('lab 3: both phases\' arithmetic, term by term, against the first two-phase poll', () => {
    const rs = recs(TWO_PHASE)
    const f = blockOf(lab('两阶段：先报身份，再送读数'), 'formula', '第一轮的两个阶段，每次传输机会')
    const m = /随机阶段 = (\d+) \+ (\d+) \+ (\d+) \+ (\d) × \((\d+) \+ (\d+) \+ (\d+) \+ (\d+)\) = (\d+) µs\n调度阶段 = (\d+) \+ (\d+) \+ (\d+) \+ (\d) × \((\d+) \+ (\d+) \+ (\d+) \+ (\d+)\) = (\d+) µs/.exec(f.text)!
    const n = m.slice(1).map(Number)
    const cts = txs(rs, 'cts').filter((r) => r.t < 20 * MS)
    const trig = txs(rs, 'ampTrigger').filter((r) => r.t < 20 * MS)
    const acks = txs(rs, 'ampAck').filter((r) => r.t < 20 * MS)
    const resp = txs(rs, 'ampResp').filter((r) => r.t < 20 * MS)
    const rRand = resp.filter((r) => r.frame.amp!.reading === false), rSched = resp.filter((r) => r.frame.amp!.reading === true)
    const sched = trig.filter((r) => r.frame.amp!.phase === 'scheduled')
    const rand = trig.filter((r) => r.frame.amp!.phase === 'random')
    const ackEnds = ofType(rs, 'TX_END').filter((r) => r.frame.kind === 'ampAck').map((r) => r.t)
    const span = (c: typeof cts[number]) => ackEnds.filter((e) => e > c.t && e < c.t + QAP_EDCA_PARAMS[0].txopLimitNs).pop()! - c.t
    expect(n[0]).toBe(cts[0].frame.txTimeNs / US)
    expect(n[9]).toBe(cts[0].frame.txTimeNs / US)
    expect([n[1], n[4], n[6], n[10], n[13], n[15]].every((x) => x === 10)).toBe(true)
    expect(n[2]).toBe(rand[0].frame.txTimeNs / US)
    expect(n[3]).toBe(rand[0].frame.amp!.slots)
    expect(n[5]).toBe(rRand[0].frame.txTimeNs / US)
    expect(n[7]).toBe(acks[0].frame.txTimeNs / US)
    expect(n[8]).toBe(n[0] + n[1] + n[2] + n[3] * (n[4] + n[5] + n[6] + n[7]))
    expect(n[8] * US).toBe(span(cts[0]))
    expect(n[11]).toBe(sched[0].frame.txTimeNs / US)
    expect(n[12]).toBe(sched[0].frame.amp!.staIds!.length)
    expect(n[14]).toBe(rSched[0].frame.txTimeNs / US)
    expect(n[16]).toBe(acks[acks.length - 1].frame.txTimeNs / US)
    expect(n[17]).toBe(n[9] + n[10] + n[11] + n[12] * (n[13] + n[14] + n[15] + n[16]))
    const schedCts = cts.filter((c) => c.t < sched[0].t).pop()!
    expect(n[17] * US).toBe(span(schedCts))
    const note = /时隙 (\d+) µs；调度阶段的作答带读数，时隙 (\d+) µs。名单列两个标签时，调度阶段一次要 (\d+) µs，超过 (\d+) µs/.exec(f.note!)!
    expect(Number(note[1])).toBe(ofType(rs, 'AMP_ROUND').find((r) => r.phase === 'random')!.slotNs / US)
    expect(Number(note[2])).toBe(ofType(rs, 'AMP_ROUND').find((r) => r.phase === 'scheduled')!.slotNs / US)
    // two tags in the list: the trigger grows by one 2-octet ID (64 µs at 250 kb/s) and one more slot is added
    const two = n[9] + n[10] + n[11] + AMP_STA_ID_BYTES * 8 * 4 + 2 * (n[13] + n[14] + n[15] + n[16])
    expect(Number(note[3])).toBe(two)
    expect(Number(note[4])).toBe(QAP_EDCA_PARAMS[0].txopLimitNs / US)
    expect(two * US).toBeGreaterThan(QAP_EDCA_PARAMS[0].txopLimitNs)
  })

  it('lab 3: the list, the reservations, the readings and the air', () => {
    const rs = recs(TWO_PHASE)
    const e = lab('两阶段：先报身份，再送读数').expect
    const m = /随机阶段用两次传输机会，收到 (Tag \d) 和 (Tag \d)；调度阶段按这个顺序发两帧调度型触发帧，每帧列一个标签，长 (\d+) 个字节、(\d+) µs。CTS-to-self 在随机阶段预留 (\d+) µs，在调度阶段预留 (\d+) µs。三十轮里两阶段送达 (\d+) 个读数，内联方式送达 (\d+) 个；空口时间内联方式 ([\d ]+) µs，两阶段 ([\d ]+) µs，多 ([\d.]+) %/.exec(e)!
    const first = (r: TLRecord) => r.t < 20 * MS
    const sched = txs(rs, 'ampTrigger').filter((r) => first(r) && r.frame.amp!.phase === 'scheduled')
    const rand = txs(rs, 'ampTrigger').filter((r) => first(r) && r.frame.amp!.phase === 'random')
    expect(rand.length).toBe(2)
    expect(sched.length).toBe(2)
    expect(sched.map((s) => `Tag ${s.frame.amp!.staIds![0].slice(4)}`)).toEqual([m[1], m[2]])
    expect(Number(m[3])).toBe(sched[0].frame.bytes)
    expect(Number(m[4])).toBe(sched[0].frame.txTimeNs / US)
    const cts = txs(rs, 'cts').filter(first)
    expect(Number(m[5])).toBe(cts.find((c) => c.t < rand[0].t)!.frame.durationFieldNs / US)
    expect(Number(m[6])).toBe(cts.filter((c) => c.t < sched[0].t).pop()!.frame.durationFieldNs / US)
    expect(Number(m[7])).toBe(readingsDelivered(rs))
    expect(Number(m[8])).toBe(readingsDelivered(recs()))
    const air = (x: TLRecord[]) => ofType(x, 'TX_START').reduce((s, r) => s + r.frame.txTimeNs, 0) / US
    expect(num(m[9])).toBe(air(recs()))
    expect(num(m[10])).toBe(air(rs))
    expect(m[11]).toBe(((air(rs) / air(recs()) - 1) * 100).toFixed(1))
    expect(ampSlots.why).toContain(`空口时间（airtime）增加 ${m[11]} %，送达的读数反而少 ${readingsDelivered(recs()) - readingsDelivered(rs)} 个`)
  })
})
