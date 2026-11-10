/**
 * `@relay-hops`, in the standard-first shape (2026-11-10).
 *
 * ① says what IEEE Std 802.11-2024 specifies for a payload between two stations of one BSS
 * (§4.5.2.1, the address table 9-60, TDLS in §11.20); ② says row by row what this simulator does,
 * and the rows are checked against the engine here; ③ is three runs, and every figure the lesson
 * prints is read back out of its own text and compared with a run — so editing a number in the
 * lesson without the engine agreeing turns this red, and so does an engine change that moves a
 * number the lesson still prints.
 *
 * The last block sweeps every figure in every string a reader reads and demands that each one is
 * a figure this file measured or a constant it checked: a figure added to the prose without a
 * measurement behind it fails there even when no table read reaches it.
 *
 * 2026-11-11 (W7a): the AP now hands an MSDU to the DS when it receives it (it used to wait for the
 * sender's Ack), Address 3 follows Table 9-60 on both hops and duplicates are filtered by
 * <TA, TID, SN> (§10.3.2.14.3). The assertions that pinned the old behaviour pin those instead.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  relayHops, relayHopsSequence, RELAY_FWD_US, RELAY_PAYLOAD_BYTES, RELAY_FRAME_BYTES, RELAY_FRAME_US,
  RELAY_HOP1_AT, RELAY_HOP2_AT, RELAY_DONE_AT,
} from '../../src/course/tier1/relay-hops'
import { rolesStackScenario, firstRelayHop1, firstRelayHop2 } from '../../src/course/tier1/roles-stack'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { readerTexts } from '../../src/course/readability'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { LatencyStats, ViewState } from '../../src/model/view'
import { ACK_BYTES, AMPDU_DELIMITER_BYTES, FCS_BYTES, QAP_EDCA_PARAMS, QOS_HDR_BYTES, SIFS_NS, aifsNs } from '../../src/engine/phy'
import { decodeFrame, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType } from './kit'

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS
const PHONES = ['sta-3', 'sta-4']

const runs = new Map<string, { records: TLRecord[]; view: ViewState }>()
function run(sc: Scenario, ms: number) {
  const key = JSON.stringify([sc, ms])
  const hit = runs.get(key)
  if (hit) return hit
  const sim = new Simulation(sc)
  const records = [...sim.runUntil(ms * MS).records]
  const out = { records, view: sim.view }
  runs.set(key, out)
  return out
}
const mean = (l: LatencyStats): number => l.sumNs / l.n
const ids = (r: Tx): number[] => r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : [])
const dataTx = (rs: TLRecord[]): Tx[] => rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data')
/** An instant as the lesson prints it: "1.4157 ms". */
const asMs = (ns: number): string => `${(ns / MS).toFixed(4)} ms`
/** A duration in µs as the lesson prints it: "169.6". */
const us = (ns: number): string => String(Math.round(ns / 100) / 10)
const ms2 = (ns: number): string => `${(ns / MS).toFixed(2)} ms`

function decode(f: Tx['frame'], sc: Scenario = rolesStackScenario()): Mpdu {
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  const src = sc.nodes.find((n) => n.id === f.src) ?? ap
  return decodeFrame(f, { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') }).users[0].subframes[0].mpdu
}
const field = (m: Mpdu, key: string) => m.fields.find((x) => x.key === key)!
const bitOf = (m: Mpdu, key: string) => field(m, 'fc').bits!.find((b) => b.key === key)!.value

const lab = (heading: string): Lab => {
  const l = relayHops.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = relayHops.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => relayHops.standard!.map((b) => JSON.stringify(b)).join(' ')

/** One payload's own records, from its arrival at Phone B to Phone A's answer. */
function onePayload(rs: TLRecord[]) {
  const hop1 = rs.find(firstRelayHop1) as Tx
  const hop2 = rs.find(firstRelayHop2) as Tx
  const id = ids(hop1)[0]
  const arrivalB = rs.find((r) => r.type === 'ARRIVAL' && r.node === 'sta-4' && r.msduId === id)!
  const rxAp = rs.find((r) => r.type === 'RX_OK' && r.node === 'ap' && r.t >= hop1.t)!
  const ack1 = rs.find((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'ack' && r.node === 'ap' && r.t > hop1.t)!
  const deqB = rs.find((r) => r.type === 'DEQUEUE' && r.node === 'sta-4' && r.msduId === id)!
  const arrAp = rs.find((r) => r.type === 'ARRIVAL' && r.node === 'ap' && r.msduId === id)!
  const deqAp = rs.find((r) => r.type === 'DEQUEUE' && r.node === 'ap' && r.msduId === id)!
  return { hop1, hop2, id, arrivalB, rxAp, ack1, deqB, arrAp, deqAp }
}

/**
 * For every phone-to-phone payload: when the AP first received it whole (an RX_OK of a phone's
 * data frame whose MPDU for it passed), when it reached the AP's own queue, and the start of the
 * sender's last transmission of it.
 */
function relayLog(rs: TLRecord[]) {
  const born = new Set<number>()
  const rxAt = new Map<number, number>()
  const lastTx = new Map<number, number>()
  const apArrivals = new Map<number, number[]>()
  for (const r of rs) {
    if (r.type === 'ARRIVAL' && PHONES.includes(r.node)) born.add(r.msduId)
    else if (r.type === 'ARRIVAL' && r.node === 'ap' && born.has(r.msduId)) apArrivals.set(r.msduId, [...(apArrivals.get(r.msduId) ?? []), r.t])
    else if (r.type === 'TX_START' && PHONES.includes(r.node) && r.frame.kind === 'data') for (const id of ids(r)) lastTx.set(id, r.t)
    else if (r.type === 'RX_OK' && r.node === 'ap' && r.frame.kind === 'data' && PHONES.includes(r.from)) {
      const got = r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : [])
      got.forEach((id, i) => { if ((r.mpduOk === undefined || r.mpduOk[i]) && !rxAt.has(id)) rxAt.set(id, r.t) })
    }
  }
  return { rxAt, lastTx, apArrivals }
}

const base = run(rolesStackScenario(), 1000)
const p = onePayload(base.records)

/** The two edited scenes lab 3 loads, built exactly as its steps describe them. */
function idleScene(): Scenario {
  const sc = rolesStackScenario()
  sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle']
  return sc
}
function movedScene(): Scenario {
  const sc = rolesStackScenario()
  const b = sc.nodes.find((n) => n.id === 'sta-4')!
  b.pos = { ...b.pos, x: 2.5, y: 6 }
  return sc
}

lessonShapeSuite(relayHops, { runNs: RUN_NS, sameSceneAs: 'roles-stack' })

describe('relay-hops · the lesson', () => {
  it('is in the standard-first shape, second in the module about roles', () => {
    expect(isStandardFirst(relayHops)).toBe(true)
    expect(MODULES[relayHops.module].title).toBe('一个网络中的角色')
    expect(relayHops.needs).toEqual(['roles-stack'])
    expect(relayHops.terms!.map((t) => t.term)).toEqual(['DS', 'TDLS'])
    expect(relayHops.limits).toEqual([])
    expect(relayHops.observe).toEqual([])
    expect(relayHops.tryThis).toEqual([])
  })

  it('loads roles-stack\'s own scene, with no variant of its own', () => {
    expect(relayHops.scenario()).toEqual(rolesStackScenario())
    expect(relayHops.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(relayHops.scenario())).not.toThrow()
    for (const q of relayHops.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('cites each clause it teaches in ①, and only the standard is there', () => {
    const std = stdText()
    for (const c of ['§4.5.2.1', '§4.3.5.1', '§9.2.4.1.4', '表 9-3', '§9.3.2.1', '表 9-60', '§10.3.2.3.3', '表 17-24', '表 27-61', '§11.20', '§10.3.2.14']) {
      expect(std, c).toContain(c)
    }
    expect(std).not.toContain('本仿真器')
    expect(std).not.toContain('50 µs')
  })

  it('① prints the standard\'s address table: To DS / From DS and the three addresses per direction', () => {
    const t = relayHops.standard!.find((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')!
    expect(t.rows).toEqual([
      ['站点 → 接入点', '1', '0', 'RA = BSSID', 'TA = SA', 'DA'],
      ['接入点 → 站点', '0', '1', 'RA = DA', 'TA = BSSID', 'SA'],
    ])
    // the SIFS ① prints is the engine's: 16 µs
    expect(stdText()).toContain(`${SIFS_NS / US} µs`)
  })
})

describe('relay-hops · ② says what the engine does, and the engine does it', () => {
  it('two hops: no data frame of the run goes from one station straight to another', () => {
    expect(implRow('两跳的路径').kind).toBe('faithful')
    const direct = dataTx(base.records).filter((r) => r.node !== 'ap' && r.frame.dst !== 'ap')
    expect(direct).toEqual([])
    // and every relayed payload really crosses twice, with the same id
    expect(ids(p.hop2)).toEqual(ids(p.hop1))
    expect(p.hop2.node).toBe('ap')
    expect(p.hop2.frame.dst).toBe('sta-3')
  })

  // 2026-11-11 (W7a): the forward used to start when the sender saw the Ack. It now starts when
  // the AP receives the MSDU (§4.5.2.1: the AP that receives it hands it to the DS).
  it('the forward is a fixed 50 µs from the AP\'s reception, written in simulation.ts as RELAY_FWD_NS', () => {
    expect(implRow('转发时延').kind).toBe('value')
    expect(implRow('转发时延').sim).toContain(`${RELAY_FWD_US} µs`)
    const src = readFileSync(new URL('../../src/engine/simulation.ts', import.meta.url), 'utf8')
    expect(src).toMatch(new RegExp(`RELAY_FWD_NS = ${RELAY_FWD_US}_000\\b`))
    // every relayed payload of the second enters the AP's queue 50 µs after the AP received it
    const { rxAt, apArrivals } = relayLog(base.records)
    let checked = 0
    for (const [id, at] of apArrivals) {
      expect(at, `payload ${id} reaches the AP's queue once`).toHaveLength(1)
      expect(at[0]! - rxAt.get(id)!, `payload ${id}`).toBe(RELAY_FWD_US * US)
      checked++
    }
    expect(checked).toBeGreaterThan(1000)
  })

  it('SIFS is 16 µs, as aSIFSTime says', () => {
    expect(implRow('短帧间间隔').kind).toBe('faithful')
    expect(implRow('短帧间间隔').standard).toContain(`${SIFS_NS / US} µs`)
    expect(implRow('短帧间间隔').sim).toContain(`${SIFS_NS / US} µs`)
    expect(p.ack1.t - p.rxAp.t).toBe(SIFS_NS)
  })

  // 2026-11-11 (W7a): this pinned the AP in Address 3 on both hops. It now pins Table 9-60: the DA
  // (Phone A) on the first hop, the SA (Phone B) on the second.
  it('Address 3 is the DA on the first hop and the SA on the second, as table 9-60 says', () => {
    expect(implRow('第一跳的地址 3').kind).toBe('faithful')
    expect(implRow('第二跳的地址 3').kind).toBe('faithful')
    const m1 = decode(p.hop1.frame)
    const m2 = decode(p.hop2.frame)
    expect([bitOf(m1, 'toDs'), bitOf(m1, 'fromDs')]).toEqual(['1', '0'])
    expect([bitOf(m2, 'toDs'), bitOf(m2, 'fromDs')]).toEqual(['0', '1'])
    expect(field(m1, 'addr3').node).toBe('sta-3')
    expect(field(m1, 'addr3').roles).toEqual(['DA'])
    expect(field(m2, 'addr3').node).toBe('sta-4')
    expect(field(m2, 'addr3').roles).toEqual(['SA'])
    expect(p.hop2.frame.dst).toBe('sta-3')
    expect(p.hop1.node).toBe('sta-4')
  })

  // 2026-11-11 (W7a): this pinned "forwarded only once the uplink was acknowledged, dropped
  // otherwise". It now pins §4.5.2.1 / §10.3.2.14.3: forwarded on reception, whatever happens to the
  // Ack; a retransmission the AP already holds is a duplicate (<TA, TID, SN> + Retry) and not forwarded.
  it('a payload is forwarded when the AP receives it, once, and a duplicate is discarded', () => {
    expect(implRow('确认帧丢失之后').kind).toBe('faithful')
    const src = readFileSync(new URL('../../src/engine/simulation.ts', import.meta.url), 'utf8')
    const onRx = src.slice(src.indexOf('onMsduDelivered: n.kind === \'ap\''), src.indexOf('queuesOf.get(n.id),'))
    expect(onRx).toContain('const fwd = at + RELAY_FWD_NS')
    expect(src).not.toContain('if (!acked) relayPending.delete(msduId)')
    const mac = readFileSync(new URL('../../src/engine/mac.ts', import.meta.url), 'utf8')
    expect(mac).toContain('if (!this.queues.rxDuplicate(from, tid, h.sn, h.retry)) this.hooks.onMsduDelivered?.(id, t, from)')
    // each payload goes out on the second hop at most once as a first transmission
    const firstHop2 = dataTx(base.records).filter((r) => r.node === 'ap' && PHONES.includes(r.frame.dst) && !r.frame.retryFlag)
    const seen = firstHop2.flatMap(ids)
    expect(new Set(seen).size).toBe(seen.length)
    // 「本课场景一秒内没有出现确认帧丢失」: no payload was sent again after the AP already had it
    const { rxAt, lastTx } = relayLog(base.records)
    const lostAck = [...rxAt].filter(([id, t]) => t < lastTx.get(id)!)
    expect(lostAck).toEqual([])
    expect(implRow('确认帧丢失之后').sim).toContain('本课场景一秒内没有出现确认帧丢失')
  })

  it('no direct link: TDLS is absent', () => {
    expect(implRow('直连').kind).toBe('absent')
    for (const r of dataTx(base.records)) {
      const m = decode(r.frame)
      expect(bitOf(m, 'toDs') === '0' && bitOf(m, 'fromDs') === '0', `${r.node} → ${r.frame.dst}`).toBe(false)
    }
  })
})

describe('relay-hops · ③ every figure the labs print is the run', () => {
  it('lab 1: the five instants of one payload, value by value', () => {
    // 2026-11-11 (W7a): six instants — the AP hands the payload to the DS at its reception, 1.5413 ms,
    // and the second hop waits for the medium after the Ack (it used to start the moment the
    // forward, counted from the sender's Ack, ended).
    const rows = tableOf(lab('一份载荷的全程'), '同一份载荷的六个时刻').rows
    expect(rows.map((r) => r[0])).toEqual([asMs(p.arrivalB.t), asMs(p.rxAp.t), asMs(p.deqB.t), asMs(p.arrAp.t), asMs(p.hop2.t), asMs(p.deqAp.t)])
    expect(p.arrivalB.t).toBe(p.hop1.t) // 「立即发出」
    expect(p.rxAp.t).toBe(p.hop1.t + p.hop1.frame.txTimeNs) // 「接收完毕」
    expect(p.arrAp.t - p.rxAp.t).toBe(RELAY_FWD_US * US) // 「自接收完毕起转发 50 µs」
    expect(p.arrAp.t).toBeLessThan(p.hop2.t) // the forward is done before the second hop could start
    // 「介质自确认帧结束起空闲满 25 µs，即接入点视频类的一个仲裁帧间间隔」: the AIFS of the access category
    // the AP sends at. 2026-11-11 (W7b): the AP contends with dot11QAPEDCATable (§10.2.3.2) — AIFSN 1
    // for AC_VI, 25 µs — where until then it used the non-AP Table 9-194 value (34 µs).
    expect(p.hop2.t - p.deqB.t).toBe(aifsNs(QAP_EDCA_PARAMS[p.hop2.frame.ac!]!.aifsn))
    expect(ofType(base.records, 'TX_START').some((r) => r.t > p.deqB.t && r.t < p.hop2.t)).toBe(false)
    const figs = (s: string): string[] => s.match(/\d+(?:\.\d+)?(?= µs)/g) ?? []
    expect(figs(rows[0][1])).toEqual([us(p.hop1.frame.txTimeNs)])
    expect(figs(rows[1][1])).toEqual([us(p.ack1.t - p.rxAp.t), us(p.ack1.frame.txTimeNs)])
    expect(figs(rows[2][1])).toEqual([us(p.deqB.t - p.hop1.t)])
    expect(figs(rows[3][1])).toEqual([us(p.arrAp.t - p.rxAp.t)])
    expect(figs(rows[4][1])).toEqual([us(p.hop2.t - p.deqB.t)])
    expect(figs(rows[5][1])).toEqual([us(p.deqAp.t - p.hop2.t)])
    // the frame behind 125.6 µs: 1400 B of payload in a 1430 B QoS frame — an S-MPDU on this HE link
    // (§10.12.7), so the PSDU adds a 4-octet delimiter and the EOF padding — and the answer is an ACK
    expect(p.hop1.frame.apepBytes! - AMPDU_DELIMITER_BYTES).toBe(QOS_HDR_BYTES + RELAY_PAYLOAD_BYTES + FCS_BYTES)
    expect(decode(p.hop1.frame).bytes).toBe(RELAY_FRAME_BYTES)
    expect(p.hop1.frame.txTimeNs).toBe(RELAY_FRAME_US * US)
    expect(p.ack1.frame.bytes).toBe(ACK_BYTES)
  })

  it('lab 1: the figure is the run, and the expect line adds up', () => {
    const d = lab('一份载荷的全程').blocks!.find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!
    expect(d.spec).toEqual(relayHopsSequence())
    const seq = relayHopsSequence()
    expect(seq.messages.flatMap((m) => (m.at ? [m.at] : []))).toEqual([asMs(p.hop1.t), asMs(p.hop2.t), asMs(p.deqAp.t)])
    expect([RELAY_HOP1_AT, RELAY_HOP2_AT, RELAY_DONE_AT]).toEqual([asMs(p.hop1.t), asMs(p.hop2.t), asMs(p.deqAp.t)])
    expect(d.caption).toContain(`${RELAY_FWD_US} µs`)
    const ex = lab('一份载荷的全程').expect
    const [hop, gap, fwd, total] = (ex.match(/\d+(?:\.\d+)?(?= µs)/g) ?? [])
    expect(hop).toBe(us(p.deqB.t - p.hop1.t))
    expect(hop).toBe(us(p.deqAp.t - p.hop2.t))
    expect(gap).toBe(us(p.hop2.t - p.deqB.t))
    expect(fwd).toBe(us(p.arrAp.t - p.rxAp.t))
    expect(total).toBe(us(p.deqAp.t - p.arrivalB.t))
    expect(p.deqAp.t - p.arrivalB.t).toBe((p.deqB.t - p.hop1.t) + (p.hop2.t - p.deqB.t) + (p.deqAp.t - p.hop2.t))
    // 「转发在接入点回复确认帧、等待介质空闲的这段时间里已经完成」
    expect(p.rxAp.t + RELAY_FWD_US * US).toBeLessThanOrEqual(p.hop2.t)
    expect(lab('一份载荷的全程').meaning).toContain(`等介质空闲 ${gap} µs`)
    expect(lab('一份载荷的全程').meaning).toContain(`${RELAY_FWD_US} µs`)
  })

  it('lab 2: the header table is what the field view shows on both hops', () => {
    const rows = tableOf(lab('两跳的方向比特与地址'), '两跳的方向比特与地址：本仿真器显示的内容').rows
    const name: Record<string, string> = { ap: '接入点', 'sta-3': '手机 A', 'sta-4': '手机 B' }
    for (const [row, hop] of [[rows[0], p.hop1], [rows[1], p.hop2]] as const) {
      const m = decode(hop.frame)
      expect(row[1]).toBe(`${bitOf(m, 'toDs')} / ${bitOf(m, 'fromDs')}`)
      expect(row[2]).toBe(name[field(m, 'addr1').node!])
      expect(row[3]).toBe(name[field(m, 'addr2').node!])
      expect(row[4]).toBe(name[field(m, 'addr3').node!])
    }
  })

  it('lab 3: one second in each of the three scenes, to the digits printed', () => {
    const rows = tableOf(lab('一跳与两跳的平均时延'), '运行一秒的平均时延').rows
    expect(lab('一跳与两跳的平均时延').steps[0]).toContain('1000 ms')
    const scenes = [rolesStackScenario(), idleScene(), movedScene()]
    rows.forEach((row, i) => {
      const { view } = run(scenes[i], 1000)
      const tv = mean(view.nodes['sta-2'].stats.rxLatency)
      const a = mean(view.nodes['sta-3'].stats.relayLatency)
      const b = mean(view.nodes['sta-4'].stats.relayLatency)
      expect(row.slice(1), row[0]).toEqual([ms2(tv), ms2(a), ms2(b)])
      // 「每一行里手机互传的时延都约为电视的两倍」
      for (const x of [a, b]) {
        expect(x / tv, row[0]).toBeGreaterThan(1.7)
        expect(x / tv, row[0]).toBeLessThan(2.3)
      }
    })
    // the moved phone: the step's coordinates are the edit, and 0.5 m is the distance it leaves
    const step = lab('一跳与两跳的平均时延').steps[2]
    const [x, y] = (step.match(/x = ([\d.]+) m，y = ([\d.]+) m/) ?? []).slice(1).map(Number)
    const sc = movedScene()
    const pa = sc.nodes.find((n) => n.id === 'sta-3')!.pos
    const pb = sc.nodes.find((n) => n.id === 'sta-4')!.pos
    expect([pb.x, pb.y]).toEqual([x, y])
    const [dist] = (lab('一跳与两跳的平均时延').expect.match(/相距 ([\d.]+) m/) ?? []).slice(1).map(Number)
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)).toBe(dist)
    // 「时延没有缩短」: moving them together does not shorten the two-hop latency below one hop's double
    const moved = run(movedScene(), 1000).view
    expect(dataTx(run(movedScene(), 1000).records).some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
    expect(mean(moved.nodes['sta-3'].stats.relayLatency)).toBeGreaterThan(1.7 * mean(moved.nodes['sta-2'].stats.rxLatency))
  })
})

describe('relay-hops · every figure the lesson prints is one this file measured', () => {
  /** Clause, table and figure numbers, and standard names, are citations, not figures. */
  const strip = (s: string): string => s
    .replace(/§[\d.]+/g, '').replace(/[表图] \d+-\d+/g, '')
    .replace(/IEEE( Std)? 802\.11-\d{4}/g, '').replace(/802\.11[a-z]*(-\d{4})?/g, '')
    .replace(/RELAY_FWD_NS|src\/engine\/simulation\.ts/g, '')

  it('why, ②, the quiz and sources print only the measured figures', () => {
    const fwd = String(RELAY_FWD_US)
    expect(relayHops.why).toContain(`${fwd} µs`)
    const quiz = relayHops.quiz.map((q) => [q.q, ...q.options, q.explain].join(' ')).join(' ')
    expect(quiz).toContain(`全程 ${us(p.deqAp.t - p.arrivalB.t)} µs 里两跳各占 ${us(p.deqB.t - p.hop1.t)} µs`)
    expect(quiz).toContain(`${fwd} µs 的转发与接入点回复确认帧的时间重叠`)
    // the overlap is real: the forward starts at the reception, the Ack a SIFS later
    expect(p.rxAp.t + RELAY_FWD_US * US).toBeGreaterThan(p.ack1.t)
  })

  it('sweeps every string a reader reads: no figure without a measurement behind it', () => {
    const moved = run(movedScene(), 1000).view
    const idle = run(idleScene(), 1000).view
    const lat = [base.view, idle, moved].flatMap((v) => [
      ms2(mean(v.nodes['sta-2'].stats.rxLatency)), ms2(mean(v.nodes['sta-3'].stats.relayLatency)),
      ms2(mean(v.nodes['sta-4'].stats.relayLatency)),
    ]).map((s) => s.replace(' ms', ''))
    const allowed = new Set<string>([
      // instants and durations of lab 1
      ...[p.arrivalB.t, p.rxAp.t, p.deqB.t, p.arrAp.t, p.hop2.t, p.deqAp.t].map((t) => (t / MS).toFixed(4)),
      us(p.hop1.frame.txTimeNs), us(SIFS_NS), us(p.ack1.frame.txTimeNs), us(p.deqB.t - p.hop1.t), us(p.hop2.t - p.deqB.t),
      String(RELAY_FWD_US), us(p.deqAp.t - p.arrivalB.t),
      // the bits and the address numbers of the tables
      '0', '1', '2', '3',
      // lab 3: the run length, the three scenes' averages, the edit's coordinates and the distance
      '1000', ...lat, '2.5', '6', '0.5',
      // 20 MHz, 5 GHz and 6 GHz, the bands the SIFS figure is quoted for, and chapter 17
      '20', '5', '17',
    ])
    const stray: string[] = []
    for (const s of readerTexts(relayHops)) {
      for (const n of strip(s).match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n)) stray.push(`${n} in 「${s.slice(0, 40)}」`)
    }
    expect(stray).toEqual([])
  })
})
