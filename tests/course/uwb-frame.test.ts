/**
 * `@uwb-frame`, in the standard-first shape (2026-11-10).
 *
 * ① is checked against the PHY constants the engine takes from the same tables; ② row by row
 * against the engine; ③ figure by figure: every number the labs print is read back out of the
 * lesson text and compared with the PPDU the engine builds in a run of `uwb-intro`'s scene.
 */
import { describe, it, expect } from 'vitest'
import { uwbFrame, uwbFrameFields } from '../../src/course/uwb/uwb-frame'
import { uwbIntroScenario } from '../../src/course/uwb/uwb-intro'
import type { TLRecord } from '../../src/model/records'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { uwbPpduLayout } from '../../src/uwb/frameFields'
import { UWB_MBPS } from '../../src/uwb/frames'
import {
  ARC_IE_BYTES, DATA_SYMBOL_CHIPS, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSDU_BITS_AT_PHR_RATE, PSYM_CHIPS,
  RRMC_IE_BYTES, RRTI_IE_BYTES, RR_IE_BYTES, RSTU_NS, RS_PARITY_BITS, SFD_SYMBOLS, STS_ACTIVE_CHIPS,
  STS_GAP_CHIPS, SYNC_SYMBOLS, TAIL_SYMBOLS, UWB_FCS_BYTES, UWB_MHR_BYTES, UWB_RMARKER_CHIPS,
  UWB_RX_SENS_DBM, UWB_TS_ACCUM_GAIN_DB, chipsToNs, psduSymbols, rdmIeBytes, uwbPollBytes, uwbRespBytes,
} from '../../src/uwb/phy'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS

const recs = (variant?: number): TLRecord[] => runOf(uwbFrame, variant, RUN_NS)
const txOf = (kind: string) => ofType(recs(), 'TX_START').find((r) => r.frame.kind === kind)!

lessonShapeSuite(uwbFrame, { runNs: RUN_NS, sameSceneAs: 'uwb-intro' })

const lab = (heading: string): Lab => {
  const l = uwbFrame.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const stdTable = (heading: string): Extract<Block, { kind: 'table' }> => {
  const t = uwbFrame.standard!.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `standard table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbFrame.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const num = (s: string): number => Number(s.replace(/ /g, ''))
const usOf = (ns: number): string => (ns / US).toFixed(3)

describe('uwb-frame · the lesson', () => {
  it('is the second lesson of the track, in the standard-first shape', () => {
    expect(isStandardFirst(uwbFrame)).toBe(true)
    expect(MODULES[uwbFrame.module].title).toBe('飞行时间')
    expect(uwbFrame.needs).toEqual(['uwb-intro'])
    expect(uwbFrame.terms!.map((t) => t.term)).toEqual(['SYNC', 'SFD', 'STS', 'PHR', 'PSDU', 'chip'])
    expect(uwbFrame.limits).toEqual([])
    expect(uwbFrame.observe).toEqual([])
    expect(uwbFrame.tryThis).toEqual([])
    expect(uwbFrame.scenario()).toEqual(uwbIntroScenario(5))
  })

  it('cites each clause and table it teaches in ①', () => {
    const std = JSON.stringify(uwbFrame.standard)
    for (const c of ['§10.29.1.1', '§16.2.1', '表 16-1', '表 16-31', '表 16-5', '表 16-11', '表 16-17', '§16.2.9.1', '表 16-2', '表 16-4', '§16.3.3.2', '§10.32.2', '§16.2.7.1']) {
      expect(std, c).toContain(c)
    }
    // ① speaks of the standard only: none of the scene's own figures appear in it
    for (const simValue of ['202.500', '73.269', '33 ', '2 ms', '−93']) expect(std, simValue).not.toContain(simValue)
  })

  it('①’s parameter table is the engine’s own PHY constants', () => {
    const rows = stdTable('配置 1、第 3 组参数集的各个字段').rows
    expect(rows[0][1]).toContain(`${SYNC_SYMBOLS} 个前导符号`)
    expect(rows[0][1]).toContain(`${PSYM_CHIPS} 码片`)
    expect(rows[1][1]).toContain(`${SFD_SYMBOLS} 个符号`)
    expect(rows[2][1]).toContain(`${STS_ACTIVE_CHIPS / 512} × 512 码片`)
    expect(rows[2][1]).toContain(`${STS_GAP_CHIPS} 码片的静默间隔`)
    expect(rows[3][1]).toContain(`共 ${PHR_SYMBOLS} 个符号`)
    expect(rows[3][1]).toContain(`每个符号 ${PHR_SYMBOL_CHIPS} 码片`)
    expect(rows[4][1]).toContain(`${RS_PARITY_BITS} 个 RS 校验比特`)
    expect(rows[4][1]).toContain(`${TAIL_SYMBOLS} 个尾比特`)
    expect(rows[4][1]).toContain(`每个符号 ${DATA_SYMBOL_CHIPS} 码片`)
  })
})

describe('uwb-frame · the sources name the preamble symbol the engine uses', () => {
  // Planting (2026-11-10) found this figure written nowhere under tests/.
  it('table 16-5: 508 chips per preamble symbol', () => {
    expect((uwbFrame.sources ?? []).join(' ')).toContain(`前导符号 ${PSYM_CHIPS} 码片`)
  })
})

describe('uwb-frame · ② says what the engine does, and the engine does it', () => {
  it('every frame of the scene is configuration 1, one fixed parameter set', () => {
    expect(implRow('分组配置').kind).toBe('faithful')
    for (const r of ofType(recs(), 'TX_START')) expect(r.frame.uwb!.sp, r.frame.kind).toBe(1)
    expect(implRow('参数集').sim).toContain(`${UWB_MBPS} Mb/s`)
    expect(UWB_MBPS).toBe(6.81)
  })

  it('what the frames carry: 33 and 21 octets, octet for octet', () => {
    const sim = implRow('帧里带什么').sim
    const poll = txOf('uwbPoll').frame
    const resp = txOf('uwbResp').frame
    expect(poll.uwb!.ies).toEqual(['ARC', 'RR', 'RDM', 'RRMC'])
    expect(resp.uwb!.ies).toEqual(['RRMC', 'RRTI'])
    expect(sim).toContain(`Poll ${poll.bytes} 字节：帧头 ${UWB_MHR_BYTES}、ARC ${ARC_IE_BYTES}、RR ${RR_IE_BYTES}、RDM ${rdmIeBytes(1)}、RRMC ${RRMC_IE_BYTES}、帧校验序列（frame check sequence, FCS）${UWB_FCS_BYTES}`)
    expect(sim).toContain(`应答帧 ${resp.bytes} 字节：帧头 ${UWB_MHR_BYTES}、RRMC ${RRMC_IE_BYTES}、RRTI ${RRTI_IE_BYTES}、FCS ${UWB_FCS_BYTES}`)
    expect(UWB_MHR_BYTES + ARC_IE_BYTES + RR_IE_BYTES + rdmIeBytes(1) + RRMC_IE_BYTES + UWB_FCS_BYTES).toBe(uwbPollBytes(1))
    expect(UWB_MHR_BYTES + RRMC_IE_BYTES + RRTI_IE_BYTES + UWB_FCS_BYTES).toBe(uwbRespBytes('ss'))
  })

  it('RMARKER at 73.269 µs, in both frames', () => {
    const sim = implRow('RMARKER').sim
    for (const kind of ['uwbPoll', 'uwbResp']) {
      const at = uwbPpduLayout(txOf(kind).frame).find((s) => s.rmarkerNs !== undefined)!.rmarkerNs!
      expect(sim).toContain(`帧内 ${usOf(at)} µs`)
    }
    expect(UWB_RMARKER_CHIPS).toBe((SYNC_SYMBOLS + SFD_SYMBOLS) * PSYM_CHIPS)
  })

  it('the 18.1 dB accumulation gain and the −93 dBm threshold are the engine’s', () => {
    expect(UWB_TS_ACCUM_GAIN_DB).toBe(10 * Math.log10(SYNC_SYMBOLS))
    expect(implRow('到达时刻怎样估计').sim).toContain(`${UWB_TS_ACCUM_GAIN_DB.toFixed(1)} dB`)
    expect(implRow('接收判决').sim).toContain(`${UWB_RX_SENS_DBM} dBm`.replace('-', '−'))
    expect(implRow('编码与脉冲').kind).toBe('absent')
  })

  it('the 2 ms slot is 2400 RSTU, and each frame leaves at its slot’s start', () => {
    const s = uwbFrame.scenario().uwb!
    expect(s.slotRstu).toBe(2400)
    expect(Math.round(s.slotRstu * RSTU_NS)).toBe(2 * MS)
    expect(implRow('测距时隙').sim).toContain(`${s.slotRstu} RSTU`)
    expect(txOf('uwbPoll').t % (2 * MS)).toBe(0)
    expect(txOf('uwbResp').t % (2 * MS)).toBe(0)
  })
})

describe('uwb-frame · ③ every figure the labs print is the run', () => {
  const poll = txOf('uwbPoll')
  const resp = txOf('uwbResp')
  const layout = uwbPpduLayout(poll.frame)

  it('lab 1: the figure is the engine’s layout, box for box', () => {
    const spec = uwbFrameFields()
    expect(blockOf(lab('从左到右读一帧 Poll'), 'diagram', '一帧 Poll，按时长画').spec).toEqual(spec)
    expect(spec.fields.map((f) => f.size)).toEqual(layout.map((s) => s.durNs / US))
    expect(layout.findIndex((s) => s.rmarkerNs !== undefined)).toBe(2)
    expect(spec.fields[2].label).toBe('↓RMARKER')
  })

  it('lab 1: every cell of the field table is its own arithmetic, and the layout’s duration', () => {
    const rows = blockOf(lab('从左到右读一帧 Poll'), 'table', '202.500 µs 由什么组成').rows
    expect(rows).toHaveLength(layout.length + 1)
    const chipsOf = (cell: string): number => {
      const prod = /(\d+) 个(?:前导)?符号 × (\d+) 码片 = ([\d ]+) 码片/.exec(cell)
      if (prod) {
        expect(Number(prod[1]) * Number(prod[2]), cell).toBe(num(prod[3]))
        return num(prod[3])
      }
      const sts = /(\d+) × (\d+) = ([\d ]+) 码片/.exec(cell)
      if (sts) {
        expect(Number(sts[1]) * Number(sts[2]), cell).toBe(num(sts[3]))
        return num(sts[3])
      }
      return Number(/(\d+) 码片/.exec(cell)![1])
    }
    layout.forEach((seg, i) => {
      const [field, dur] = rows[i]
      expect(chipsToNs(chipsOf(field)), field).toBe(seg.durNs)
      expect(dur, field).toBe(`${usOf(seg.durNs)} µs`)
    })
    // the PSDU row names the poll's octets and the engine's symbol count
    const psdu = /PSDU，(\d+) 个字节：(\d+) 个符号/.exec(rows[6][0])!
    expect(Number(psdu[1])).toBe(poll.frame.bytes)
    expect(Number(psdu[2])).toBe(psduSymbols(poll.frame.bytes))
    // the total row, and its structure / message split
    const structure = layout.filter((s) => s.key !== 'psdu').reduce((n, s) => n + s.durNs, 0)
    const message = layout.find((s) => s.key === 'psdu')!.durNs
    expect(rows[7][1]).toBe(`${usOf(poll.frame.txTimeNs)} µs`)
    expect(rows[7][2]).toBe(`结构 ${usOf(structure)} µs，消息 ${usOf(message)} µs`)
    expect(structure + message).toBe(poll.frame.txTimeNs)
  })

  it('lab 1: the PSDU’s bit budget is a sum, and 38.8 µs is the uncoded message', () => {
    const f = blockOf(lab('从左到右读一帧 Poll'), 'formula', '为什么 33 个字节需要 40.000 µs')
    const m = /(\d+) 个数据比特 \+ (\d+) 个校验比特 − (\d+) 个比特（随物理头发送）\+ (\d+) 个符号的尾 = (\d+) 个符号 × (\d+) 码片/.exec(f.text)!
    expect(Number(m[1])).toBe(8 * poll.frame.bytes)
    expect(Number(m[2])).toBe(RS_PARITY_BITS)
    expect(Number(m[3])).toBe(PSDU_BITS_AT_PHR_RATE)
    expect(Number(m[4])).toBe(TAIL_SYMBOLS)
    expect(Number(m[5])).toBe(psduSymbols(poll.frame.bytes))
    expect(Number(m[1]) + Number(m[2]) - Number(m[3]) + Number(m[4])).toBe(Number(m[5]))
    expect(Number(m[6])).toBe(DATA_SYMBOL_CHIPS)
    expect(f.heading).toContain(`${usOf(layout.find((s) => s.key === 'psdu')!.durNs)} µs`)
    expect(f.note).toContain(`${UWB_MBPS} Mb/s`)
    expect(f.note).toContain(`${(8 * poll.frame.bytes / UWB_MBPS).toFixed(1)} µs`)
  })

  it('lab 1: the expectation’s three figures', () => {
    const e = lab('从左到右读一帧 Poll').expect
    const dur = (k: string) => layout.find((s) => s.key === k)!.durNs
    expect(e).toContain(`PSDU 只有 ${usOf(dur('psdu'))} µs，比开头 ${usOf(dur('sync'))} µs 的 SYNC 还短`)
    expect(dur('psdu')).toBeLessThan(dur('sync'))
    expect(e).toContain(`整帧 ${usOf(poll.frame.txTimeNs)} µs，其中结构占 ${usOf(poll.frame.txTimeNs - dur('psdu'))} µs`)
  })

  it('lab 2: the RMARKER formula is the sum of the two fields in front of it', () => {
    const f = blockOf(lab('RMARKER 在哪里'), 'formula', 'RMARKER 的位置')
    const m = /SYNC ([\d.]+) µs \+ SFD ([\d.]+) µs = 帧内 ([\d.]+) µs/.exec(f.text)!
    expect(m[1]).toBe(usOf(layout[0].durNs))
    expect(m[2]).toBe(usOf(layout[1].durNs))
    expect(m[3]).toBe(usOf(layout[2].rmarkerNs!))
    expect(layout[0].durNs + layout[1].durNs).toBe(layout[2].rmarkerNs)
    expect(uwbFrame.quiz[0].options[1]).toContain(`${m[3]} µs`)
    expect(uwbFrame.quiz[0].explain).toContain(`${m[1]} µs 的 SYNC 与 ${m[2]} µs 的 SFD`)
  })

  it('lab 2: the two frames, and what differs between them', () => {
    const rows = blockOf(lab('RMARKER 在哪里'), 'table', 'Poll 帧与应答帧').rows
    for (const [row, tx] of [[rows[0], poll], [rows[1], resp]] as const) {
      const l = uwbPpduLayout(tx.frame)
      expect(row[1]).toBe(`${tx.frame.bytes} octets`)
      expect(row[2]).toBe(`${usOf(l.find((s) => s.key === 'psdu')!.durNs)} µs`)
      expect(row[3]).toBe(`${usOf(tx.frame.txTimeNs)} µs`)
    }
    const rl = uwbPpduLayout(resp.frame)
    expect(rl.filter((s) => s.key !== 'psdu').map((s) => s.durNs)).toEqual(layout.filter((s) => s.key !== 'psdu').map((s) => s.durNs))
    const e = lab('RMARKER 在哪里').expect
    expect(e).toContain(`应答帧短 ${usOf(poll.frame.txTimeNs - resp.frame.txTimeNs)} µs`)
    expect(e).toContain(`RMARKER 都在帧内 ${usOf(rl.find((s) => s.rmarkerNs !== undefined)!.rmarkerNs!)} µs`)
  })

  it('lab 3: the Response leaves at 2 000 000 ns, and 393 µs of two slots carry a frame', () => {
    const e = lab('一轮里有多少时间在传帧').expect
    const m = /应答帧在 ([\d ]+) ns 发出/.exec(e)!
    expect(num(m[1])).toBe(resp.t)
    expect(e).toContain(`只有 ${Math.round((poll.frame.txTimeNs + resp.frame.txTimeNs) / US)} µs 有帧在传输`)
    expect(ofType(recs(), 'TX_START')).toHaveLength(2)
  })

  it('the quiz’s octet sum is the engine’s', () => {
    expect(uwbFrame.quiz[2].explain).toContain(`${uwbPollBytes(1)} 字节是帧头 ${UWB_MHR_BYTES}、ARC ${ARC_IE_BYTES}、RR ${RR_IE_BYTES}、RDM ${rdmIeBytes(1)}、RRMC ${RRMC_IE_BYTES}、FCS ${UWB_FCS_BYTES} 之和`)
  })
})
