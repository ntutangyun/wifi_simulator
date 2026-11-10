/**
 * `@uwb-nba`, in the standard-first shape (2026-11-10).
 *
 * ① cites IEEE Std 802.15.4-2024 Clause 13 for the narrowband PHY and the TG4ab proposal
 * 15-22/0381r5 for the cycle and the compressed messages; ② is checked against the engine, and two
 * rows say it differs: the one-to-many POLL is 14 + 3N octets here against the 12 + 3N the
 * proposal's field table adds up to (which is what keeps a fourth anchor out of the base), and a
 * busy check skips the whole block (audit #19); ③'s figures are read back out of the lesson and
 * compared with a run.
 */
import { describe, expect, it } from 'vitest'
import { NBA_ANCHOR_COUNT, uwbNba, uwbNbaScenario, type UwbNbaVariant } from '../../src/course/uwb/uwb-nba'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import {
  NB_ADDR_BYTES, NB_CRC_BYTES, NB_MSG_ID_BYTES, NB_PHR_SYMBOLS, NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES,
  NB_PHY_CCA_DURATION_US, NB_RX_SENS_DBM, NB_SHR_SYMBOLS, NB_SYMBOL_US, NB_TX_DBM, nbOtmPollBytes, nbPpduNs,
} from '../../src/uwb/nb'
import { rstuNs, uwbNbSlotFitNs } from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const BLOCKS = 7
const TAG = 'uwb-1'
// 2026-11-11 (W5): the lesson runs the one-to-many round on a clean UNII-5 channel ('clear'); the
// router's channel is uwb-nba-coexist's. Its two variants are the pair round and the inside channel.
const V: Partial<Record<UwbNbaVariant, number>> = { outside: 0, base: 1 }
const recs = (v: UwbNbaVariant): TLRecord[] => runOf(uwbNba, v === 'clear' ? undefined : V[v], RUN_NS)
/** One CCA of phyCcaDuration before every narrowband message on this UNII-5 channel. */
const CCA_NS = NB_PHY_CCA_DURATION_US * 1000
const us = (ns: number): string => (ns / 1000).toFixed(1)

/** The one-to-many POLL as 15-22/0381r5 Table 1.6.3.1 adds it up: message ID, RPA_hash[3],
 * RPA_prand[3], MessageControl[1], then {Number of Responders[1], SlotsPerResponder[1], Responder
 * Address[3] × N}, then CRC16. Written from the table, not from the engine. */
const proposalOtmPoll = (n: number): number => NB_MSG_ID_BYTES + 3 + 3 + 1 + (1 + 1 + NB_ADDR_BYTES * n) + NB_CRC_BYTES
const WINDOW_NS = 2 * rstuNs(600)

const lab = (heading: string): Lab => {
  const l = uwbNba.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbNba.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const ctl = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind.startsWith('nb') || r.frame.kind.startsWith('uwb'))

lessonShapeSuite(uwbNba, { runNs: RUN_NS })

describe('uwb-nba · the lesson', () => {
  it('is in the standard-first shape, in the narrowband module', () => {
    expect(isStandardFirst(uwbNba)).toBe(true)
    expect(MODULES[uwbNba.module].title).toBe('窄带控制面')
    expect(uwbNba.needs).toEqual(['uwb-mms'])
    expect(uwbNba.limits).toEqual([])
    expect(uwbNba.observe).toEqual([])
    expect(uwbNba.tryThis).toEqual([])
    for (const v of uwbNba.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('① cites Clause 13 and 15-22/0381r5', () => {
    const std = uwbNba.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const s of ['第 13 章', '§13.1.2.2', '§13.1.3', '§13.3.4', '15-22/0381r5', '15-23/0100r2', '0x04', '0x05', '0x07', '0x10', '§10.29.1.2.2']) expect(std, s).toContain(s)
  })

  it('the why states the engine’s figures and the run’s', () => {
    const why = uwbNba.why!
    expect(why).toContain(`每个符号（symbol）${NB_SYMBOL_US} µs`)
    expect(why).toContain(`${NB_SHR_SYMBOLS + NB_PHR_SYMBOLS} 个符号的同步头与物理头`)
    expect(why).toContain(`一条 ${NB_POLL_BYTES} 字节的消息也要 ${nbPpduNs(NB_POLL_BYTES) / 1000} µs`)
    expect(why).toContain(`Poll 与 Response 各 ${NB_POLL_BYTES} 字节，Report ${NB_REPORT_BYTES} 字节`)
    // 2026-11-11: the engine's one-to-many POLL is the table's 12 + 3N (it used to be 14 + 3N)
    for (const n of [0, 3, 4]) expect(nbOtmPollBytes(n)).toBe(proposalOtmPoll(n))
    expect(why).toContain('共 12 + 3N 字节')
    expect(why).toContain(`${NB_PHY_CCA_DURATION_US} µs 的空闲信道评估`)
    expect(why).toContain(`三个应答方的 Poll（${nbPpduNs(nbOtmPollBytes(3)) / 1000} µs）`)
    expect(why).toContain(`四个应答方的（${nbPpduNs(nbOtmPollBytes(4)) / 1000} µs）就放不下`)
    expect(nbPpduNs(nbOtmPollBytes(3)) + CCA_NS).toBeLessThanOrEqual(WINDOW_NS)
    expect(nbPpduNs(nbOtmPollBytes(4)) + CCA_NS).toBeGreaterThan(WINDOW_NS)
    const blocksWithRanges = new Set(ofType(recs('clear'), 'UWB_RANGE').map((r) => r.block)).size
    expect(blocksWithRanges).toBe(BLOCKS)
    expect(why).toContain('七个块都完成了消息交换')
    expect(ofType(recs('clear'), 'UWB_ROUND')).toHaveLength(BLOCKS)
  })
})

describe('uwb-nba · ② says what the engine does, and the engine does it', () => {
  it('16 µs a symbol, two a byte, 12 header symbols', () => {
    expect(NB_SYMBOL_US).toBe(16)
    expect(NB_SHR_SYMBOLS + NB_PHR_SYMBOLS).toBe(12)
    for (const b of [12, 13, 23]) expect(nbPpduNs(b)).toBe((12 + 2 * b) * 16 * 1000)
    expect(implRow('同步头与物理头').sim).toContain('(12 + 2 × 字节数) × 16 µs')
  })

  it('Poll and Response 12 bytes, 576 µs; Report 13', () => {
    expect([NB_POLL_BYTES, NB_RESP_BYTES, NB_REPORT_BYTES]).toEqual([12, 12, 13])
    expect(implRow('成对的 Poll 与 Response').sim).toContain(`${nbPpduNs(12) / 1000} µs`)
    expect(implRow('Report').sim).toContain('13 字节')
  })

  // 2026-11-11: faithful — the engine counted 14 + 3N before.
  it('faithful: the one-to-many POLL is 21 / 24 bytes, the proposal’s, and later sub-rounds’ 12', () => {
    const r = implRow('一对多 Poll 的长度')
    expect(r.kind).toBe('faithful')
    expect(r.standard).toContain(`3 个应答方 ${proposalOtmPoll(3)} 字节，4 个 ${proposalOtmPoll(4)} 字节`)
    const polls = ofType(recs('clear'), 'TX_START').filter((x) => x.frame.kind === 'nbPoll' && x.t < 200 * MS)
    expect(polls.map((p) => p.frame.bytes)).toEqual([nbOtmPollBytes(NBA_ANCHOR_COUNT('clear')), NB_POLL_BYTES, NB_POLL_BYTES])
  })

  it('two slots a message; a fourth responder fits the window but not the CCA in front of it', () => {
    const base = uwbNbaScenario('clear')
    const withN = (n: number) => ({ ...base, nodes: [...base.nodes.slice(0, -1 - NBA_ANCHOR_COUNT('clear')), ...uwbNbaScenario('pairwise').nodes.filter((x) => x.uwb?.role === 'anchor').slice(0, n), base.nodes.at(-1)!] })
    expect(withN(4).nodes.filter((x) => x.uwb?.role === 'anchor')).toHaveLength(4)
    expect(ScenarioSchema.safeParse(withN(4)).success).toBe(true)
    expect(ScenarioSchema.safeParse(base).success).toBe(true)
    expect(implRow('窄带窗口').sim).toContain('一对多轮次用三个应答方')
    expect(implRow('窄带窗口').sim).toContain(`${NB_PHY_CCA_DURATION_US} µs 的 CCA`)
  })

  it('10 dBm, −100 dBm; no CRC is computed; CSMA-CA in every slot, here always clear', () => {
    expect(NB_TX_DBM).toBe(10)
    expect(NB_RX_SENS_DBM).toBe(-100)
    expect(implRow('窄带的收发电平').sim).toContain('发射 10 dBm，灵敏度 −100 dBm')
    expect(implRow('CRC').kind).toBe('absent')
    expect(implRow('信道接入').kind).toBe('faithful')
    const rs = recs('clear')
    expect(ofType(rs, 'UWB_NB_LBT')).toEqual([])
    // every narrowband message goes out one CCA into a window that opens on a slot boundary
    for (const t of ofType(rs, 'TX_START').filter((r) => r.frame.kind.startsWith('nb'))) {
      expect((t.t - CCA_NS) % rstuNs(600)).toBe(0)
    }
  })

  it('600 RSTU slots, an 84-slot 42 ms round of three sub-rounds, a 200 ms block', () => {
    const plan = roundPlan(uwbNbaScenario('clear').uwb!, NBA_ANCHOR_COUNT('clear'))
    expect(plan.slots).toBe(84)
    expect(plan.roundNs).toBe(42 * MS)
    expect(plan.blockNs).toBe(200 * MS)
    expect(implRow('一轮与一块').sim).toContain('600 RSTU（500 µs），一对多的一轮分成三个子轮，共 84 个时隙（42 ms），测距块（ranging block）长 200 ms')
  })
})

describe('uwb-nba · ③ every figure the labs print is the run', () => {
  it('lab 1: the narrowband POLL opens the round, before any UWB frame', () => {
    const e = lab('一轮先在窄带射频上开始').expect
    const tx = ctl(recs('clear'))
    expect(tx[0].frame.kind).toBe('nbPoll')
    expect(tx[0].t).toBe(CCA_NS)
    expect(e).toContain(`${(tx[0].t / MS).toFixed(3)} ms 的「${fmtRecord(tx[0])}」，比窗口的开始晚一次 ${NB_PHY_CCA_DURATION_US} µs 的 CCA`)
    const resp = tx.find((r) => r.frame.kind === 'nbResp')!
    expect(e).toContain(`第一条 Response 在 ${(resp.t / MS).toFixed(3)} ms`)
    const frag = tx.find((r) => r.frame.kind === 'uwbRsf')!
    expect(e).toContain(`第一个片段在 ${(frag.t / MS).toFixed(3)} ms`)
    expect(tx.filter((r) => r.frame.kind.startsWith('uwb') && r.t < frag.t)).toEqual([])
  })

  it('lab 2: three messages, their sizes and airtimes', () => {
    const l = lab('三种消息的长度')
    const rows = tableOf(l, '一轮里的三种消息').rows
    const tx = ctl(recs('clear'))
    const kinds = ['nbPoll', 'nbResp', 'nbReport']
    kinds.forEach((k, i) => {
      const r = tx.find((x) => x.frame.kind === k)!
      expect(rows[i][1], k).toBe(`${r.frame.bytes} B`)
      expect(rows[i][2], k).toBe(`${us(r.frame.txTimeNs)} µs`)
      expect(r.frame.txTimeNs).toBe(nbPpduNs(r.frame.bytes))
    })
    const pr = tx.find((x) => x.frame.kind === 'nbPoll')!.frame.txTimeNs + tx.find((x) => x.frame.kind === 'nbResp')!.frame.txTimeNs
    expect(l.expect).toContain(`合计 ${(pr / MS).toFixed(3)} ms`)
    expect(l.expect).toContain(`最短的窄带消息 ${nbPpduNs(NB_POLL_BYTES) / 1000} µs`)
    expect(l.expect).toContain(`只有 ${us(tx.find((x) => x.frame.kind === 'uwbRsf')!.frame.txTimeNs)} µs`)
  })

  it('lab 3: the range waits for the narrowband Report', () => {
    const e = lab('距离要等窄带 Report').expect
    const rs = recs('clear')
    const report = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbReport')!
    const range = ofType(rs, 'UWB_RANGE')[0]
    expect(e).toContain(`第一条 Report 在 ${(report.t / MS).toFixed(3)} ms 发出，${report.frame.txTimeNs / 1000} µs 后的 ${(range.t / MS).toFixed(3)} ms`)
    expect(e).toContain(`「${fmtRecord(range)}」`)
    // the two trains of that first exchange: the anchor's of the tag, and the tag's of the anchor
    const trains = ofType(rs, 'UWB_MMS_TRAIN').filter((t) => t.t < range.t)
    expect(trains).toHaveLength(2)
    expect(trains.every((t) => t.heard === t.fragments && t.fragments === 8)).toBe(true)
    expect(new Set(trains.map((t) => t.marginDb.toFixed(1)))).toEqual(new Set(['34.5']))
    expect(e).toContain('余量都是 34.5 dB')
  })

  it('lab 4: how many responders a one-to-many POLL can name in two slots', () => {
    const rows = tableOf(lab('一对多 Poll 能列出几个应答方'), '一对多 Poll 与两个时隙（1 000 µs）').rows
    expect(WINDOW_NS).toBe(1_000_000)
    for (const [n, row] of [[3, rows[0]], [4, rows[1]], [5, rows[2]]] as const) {
      expect(row[0]).toBe(String(n))
      expect(row[1]).toContain(`${nbOtmPollBytes(n)} B · ${us(nbPpduNs(nbOtmPollBytes(n)))} µs`)
    }
    expect(rows[0][2]).toBe(`${us(nbPpduNs(nbOtmPollBytes(3)) + CCA_NS)} µs，容得下`)
    expect(rows[1][2]).toBe(`${us(nbPpduNs(nbOtmPollBytes(4)) + CCA_NS)} µs，超出`)
    expect(uwbNbSlotFitNs({ oneToMany: true } as never, 4)).toBeLessThanOrEqual(WINDOW_NS)
    expect(uwbNbSlotFitNs({ oneToMany: true } as never, 5)).toBeGreaterThan(WINDOW_NS)
    expect(NBA_ANCHOR_COUNT('clear')).toBe(3)
    const e = lab('一对多 Poll 能列出几个应答方').expect
    expect(e).toContain(`4 个应答方的 Poll 是 ${us(nbPpduNs(nbOtmPollBytes(4)))} µs`)
    expect(e).toContain(`合计 ${us(nbPpduNs(nbOtmPollBytes(4)) + CCA_NS)} µs`)
  })

  it('lab 5: the pair round — a 12-byte POLL, four 28-slot rounds a block, every one completed', () => {
    const l = lab('每次只与一个锚点测距')
    expect(l.variant).toBe(V.outside)
    const rs = recs('outside')
    const poll = ofType(rs, 'TX_START').find((r) => r.frame.kind === 'nbPoll')!
    expect(poll.frame.dst).toBe('anchor-1')
    expect(l.expect).toContain(`只指定 ${poll.frame.dst}，${poll.frame.bytes} B、${us(poll.frame.txTimeNs)} µs`)
    const rounds = ofType(rs, 'UWB_ROUND')
    expect(l.expect).toContain(`一轮 ${rounds[0].slots} 个时隙、${(rounds[1].t - rounds[0].t) / MS} ms，一块容纳 ${rounds.length / BLOCKS} 轮`)
    const range = ofType(rs, 'UWB_RANGE')[0]
    expect(l.expect).toContain(`第一个距离在 ${(range.t / MS).toFixed(3)} ms 得出`)
    const tagRanges = ofType(rs, 'UWB_RANGE').filter((r) => r.node === TAG)
    expect(tagRanges).toHaveLength(rounds.length)
    expect(l.expect).toContain(`手机得到 ${tagRanges.length} 个距离`)
    expect(ofType(recs('clear'), 'UWB_RANGE').filter((r) => r.node === TAG).length * 4 / 3).toBe(tagRanges.length)
  })
})

describe('uwb-nba · the quiz repeats the engine', () => {
  it('quotes the symbol, the header and the POLL lengths as computed', () => {
    const text = uwbNba.quiz.map((q) => `${q.q} ${q.options.join(' ')} ${q.explain}`).join(' ')
    expect(text).toContain(`一条十二字节的消息，在这部射频上要 ${nbPpduNs(12) / 1000} µs`)
    expect(text).toContain(`一个 ${NB_SYMBOL_US} µs 的符号`)
    expect(text).toContain(`前面还有 ${NB_SHR_SYMBOLS + NB_PHR_SYMBOLS} 个符号`)
    expect(text).toContain(`总共 ${(nbPpduNs(12) / 1000) / NB_SYMBOL_US} 个符号`)
    expect(text).toContain(`4 个应答方是 ${proposalOtmPoll(4)} 字节，得到 ${nbPpduNs(proposalOtmPoll(4)) / 1000} µs`)
    expect(text).toContain(`加上 ${NB_PHY_CCA_DURATION_US} µs 的 CCA 是 ${(nbPpduNs(proposalOtmPoll(4)) + CCA_NS) / 1000} µs`)
  })
})

