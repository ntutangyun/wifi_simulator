/**
 * `@uwb-receipt`, in the standard-first shape (2026-11-10).
 *
 * ① teaches §10.36 (MMRCR in the ARC IE, the MMRCM, the RMMRC IE with one list element per
 * initiator and one bitmap bit per acknowledged slot). ② says what the engine does; each row is
 * checked here against the engine, so a row cannot claim a behaviour the engine lacks.
 *
 * Every figure the labs print is read back out of the lesson's own text and compared with a run.
 */
import { describe, expect, it } from 'vitest'
import {
  ANCHORS, PARTICIPANTS, QUIET_ID, VALIDITY, idOf, uwbReceipt, uwbReceiptScenario, uwbReceiptTwrScenario,
} from '../../src/course/uwb/uwb-receipt'
import { COURSE_ORDER, MODULES, basisOf } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  RMMRC_ADDR_BYTES, RMMRC_BITMAP_LEN_BYTES, RMMRC_FIXED_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES,
  UWB_MAX_PSDU_BYTES, UWB_MHR_BYTES, rmmrcBitmapBytes, uwbMaxMmrcmInitiators, uwbMmrcmBytes,
} from '../../src/uwb/phy'
import { roundPlan } from '../../src/uwb/session'
import { rstuNs, uwbWholeRoundSlots } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** Seven 200 ms blocks, closed with margin before an eighth: every UWB lesson's own window. */
const RUN_NS = 1300 * MS

lessonShapeSuite(uwbReceipt, { runNs: RUN_NS })

const base = runOf(uwbReceipt, undefined, RUN_NS)
const twrOn = runOf(uwbReceipt, 0, RUN_NS)
const twrOff = runOf(uwbReceipt, 1, RUN_NS)
type Tx = Extract<TLRecord, { type: 'TX_START' }>
const block0 = (rs: TLRecord[]): Tx[] => ofType(rs, 'TX_START').filter((r) => (r.frame.uwb?.block ?? -1) === 0)
const bits = (b: boolean[]): string => b.map((x) => (x ? '1' : '0')).join('')

const lab = (heading: string): Lab => {
  const l = uwbReceipt.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === kind && b.heading === heading)
  expect(t, `${kind} 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbReceipt.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const fig = (text: string, re: RegExp, what: string): string[] => {
  const m = re.exec(text)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
const STD = uwbReceipt.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

describe('uwb-receipt · the lesson', () => {
  it('is in the standard-first shape, in its own module, after the validity lesson\'s needs', () => {
    expect(isStandardFirst(uwbReceipt)).toBe(true)
    expect(MODULES[uwbReceipt.module].title).toBeTruthy()
    expect(basisOf(uwbReceipt.module)).toEqual(['ieee-802-15-4-2024'])
    expect(uwbReceipt.needs).toEqual(['uwb-m2m', 'uwb-rcm-validity'])
    expect(COURSE_ORDER.indexOf('uwb-receipt')).toBeGreaterThan(COURSE_ORDER.indexOf('uwb-m2m'))
    expect(uwbReceipt.limits).toEqual([])
    expect(uwbReceipt.observe).toEqual([])
    expect(uwbReceipt.tryThis).toEqual([])
    expect(uwbReceipt.sources!.join('\n')).not.toMatch(/802\.15\.4ab|1[15]-2\d\/\d{4}r\d+|802\.11/)
  })

  it('① cites its clauses and holds no simulator content', () => {
    for (const c of ['§10.32.9.1', '§10.36.1', '§10.36.2.1', '§10.34.1', '图 10-272', '图 10-273', '10-274']) expect(STD, c).toContain(c)
    expect(STD).toContain('第 9 到 14 位是 RCM Validity Rounds，第 15 位是 MMRCR')
    for (const sim of ['本仿真器', '本课']) expect(STD, sim).not.toContain(sim)
  })

  it('the base scene: the quiet participant hears both others, and nobody hears it', () => {
    const okFrom = (rx: string) => new Set(ofType(base, 'RX_OK').filter((r) => r.node === rx).map((r) => r.frame.src))
    expect(okFrom(QUIET_ID)).toEqual(new Set([idOf(0), idOf(1)]))
    for (const other of [idOf(0), idOf(1)]) expect(okFrom(other).has(QUIET_ID), other).toBe(false)
  })
})

describe('uwb-receipt · ② says what the engine does, and the engine does it', () => {
  it('has rows of every honest kind', () => {
    const kinds = new Set(uwbReceipt.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'differs', 'choice', 'absent', 'value'] as const) expect(kinds.has(k), k).toBe(true)
  })

  it('请求位: the control message and the initiation messages are the same length either way', () => {
    const [rcm, init] = fig(implRow('请求位').sim, /控制消息都是 (\d+) 字节，其余各轮的启动消息都是 (\d+) 字节/, '② on the request')
    for (const rs of [twrOn, twrOff]) {
      const tx = block0(rs)
      expect(tx.find((r) => r.frame.kind === 'uwbPoll')!.frame.bytes).toBe(Number(rcm))
      expect(new Set(tx.filter((r) => r.frame.kind === 'uwbInit').map((r) => r.frame.bytes))).toEqual(new Set([Number(init)]))
    }
    const ies = (rs: TLRecord[]) => block0(rs).filter((r) => r.frame.kind === 'uwbPoll').map((r) => r.frame.uwb?.ies)
    expect(ies(twrOn)).toEqual(ies(twrOff))
  })

  it('多对多里的请求: no control message in the many-to-many round, the scene sets the request', () => {
    expect(implRow('多对多里的请求').kind).toBe('differs')
    expect(implRow('多对多里的请求').sim).toContain('待改正')
    expect(new Set(ofType(base, 'TX_START').map((r) => r.frame.kind))).toEqual(new Set(['uwbM2m', 'uwbMmrcm']))
    expect(uwbReceipt.scenario().uwb!.mmrcr).toBe(true)
  })

  it('谁回、几个列表元素: one frame per receiver; two elements in many-to-many, one in the two-way round', () => {
    const m2m = block0(base).filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(m2m.map((r) => r.node)).toEqual([idOf(0), idOf(1), idOf(2)])
    for (const r of ofType(base, 'UWB_MMRCM')) expect(r.initiators).toBe(PARTICIPANTS - 1)
    const twr = block0(twrOn).filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(twr).toHaveLength(ANCHORS)
    for (const r of ofType(twrOn, 'UWB_MMRCM')) expect(r.initiators).toBe(1)
  })

  it('回复的时隙: after the set\'s last round of ranging, one per receiver, and the slots kept in every round', () => {
    const plan = roundPlan(uwbReceiptTwrScenario(true).uwb!, ANCHORS)
    const off = roundPlan(uwbReceiptTwrScenario(false).uwb!, ANCHORS)
    // 2026-11-11 (W2b): one receipt slot per receiver on top of the ranging exchange, and the round
    // stretched to a whole divisor of the block (standard §10.32.2): 8 + 3 → 20, against 8 → 10 off.
    expect(plan.rangingSlots).toBe(off.rangingSlots)
    expect(plan.slots).toBe(uwbWholeRoundSlots(
      off.rangingSlots + ANCHORS, uwbReceiptTwrScenario(true).uwb!.blockRstu, uwbReceiptTwrScenario(true).uwb!.slotRstu, 'twr',
    ))
    const conf = block0(twrOn).filter((r) => r.frame.kind === 'uwbMmrcm')
    const lastRound = Math.max(...block0(twrOn).map((r) => r.frame.uwb?.round ?? 0))
    expect(lastRound).toBe(VALIDITY - 1)
    for (const r of conf) expect(r.frame.uwb?.round).toBe(lastRound)
    expect(conf.map((r) => r.frame.uwb?.slot)).toEqual([off.rangingSlots, off.rangingSlots + 1, off.rangingSlots + 2])
  })

  it('帧格式: the widths it names are the engine\'s', () => {
    const [hdr, flags, len, addr, blen, mhr, fcs] = fig(implRow('帧格式').sim,
      /单元头 (\d+) 字节、标志 (\d+) 字节、列表长度 (\d+) 字节，每个元素为短地址 (\d+) 字节、位图长度 (\d+) 字节、位图 ⌈S\/8⌉ 字节；帧头（MAC header）(\d+) 字节与帧校验 (\d+) 字节/,
      '② on the frame').map(Number)
    expect(hdr).toBe(UWB_IE_HDR_BYTES)
    expect(hdr! + flags! + len!).toBe(RMMRC_FIXED_BYTES)
    expect([addr, blen, mhr, fcs]).toEqual([RMMRC_ADDR_BYTES, RMMRC_BITMAP_LEN_BYTES, UWB_MHR_BYTES, UWB_FCS_BYTES])
  })

  it('被确认的时隙: 3 in many-to-many, 41 in the two-way variant', () => {
    const [m2m, twr] = fig(implRow('被确认的时隙').sim, /多对多里是那一轮的 (\d+) 个时隙，双向轮变体里是 (\d+) 个时隙/, '② on the slots')
    expect(new Set(ofType(base, 'UWB_MMRCM').map((r) => r.ackSlots))).toEqual(new Set([Number(m2m)]))
    expect(new Set(ofType(twrOn, 'UWB_MMRCM').map((r) => r.ackSlots))).toEqual(new Set([Number(twr)]))
  })

  it('多播: unicast to the tag in the two-way round, broadcast in many-to-many', () => {
    for (const r of block0(twrOn).filter((x) => x.frame.kind === 'uwbMmrcm')) expect(r.frame.dst).toBe('uwb-1')
    for (const r of block0(base).filter((x) => x.frame.kind === 'uwbMmrcm')) expect(r.frame.dst).toBe('*')
  })

  it('只有一轮的双向轮次组: the editor refuses it', () => {
    const s = uwbReceiptTwrScenario(true)
    expect(ScenarioSchema.safeParse({ ...s, uwb: { ...s.uwb!, rcmValidityRounds: 1, initiatorRounds: 1 } }).success).toBe(false)
    expect(ScenarioSchema.safeParse(s).success).toBe(true)
  })

  it('时隙与块: 2 ms and 200 ms', () => {
    const [slot, blk] = fig(implRow('时隙与块').sim, /每个时隙 (\d+) ms，每块 (\d+) ms/, '② on the grid')
    const plan = roundPlan(uwbReceiptScenario().uwb!, PARTICIPANTS)
    expect(plan.slotNs).toBe(Number(slot) * MS)
    expect(rstuNs(uwbReceiptScenario().uwb!.slotRstu)).toBe(Number(slot) * MS)
    expect(plan.blockNs).toBe(Number(blk) * MS)
  })
})

describe('uwb-receipt · ③ every figure the labs print is the run', () => {
  it('lab 1: block 0 of the base scene, slot by slot', () => {
    const l = lab('三次发送之后，三帧回复')
    const rows = blockOf(l, 'table', '第 0 块的一轮').rows
    const tx = block0(base)
    expect(rows).toHaveLength(tx.length)
    const kindName: Record<string, string> = { uwbM2m: '多对多测距帧', uwbMmrcm: 'MMRCM' }
    rows.forEach(([slot, node, kind, bytes], i) => {
      expect(Number(slot)).toBe(tx[i].frame.uwb?.slot)
      expect(node).toBe(tx[i].node)
      expect(kind).toBe(kindName[tx[i].frame.kind])
      expect(Number(bytes)).toBe(tx[i].frame.bytes)
    })
    const [each] = fig(l.expect, /每台设备一帧，各 (\d+) 字节/, 'lab 1 expect')
    const conf = tx.filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(conf).toHaveLength(PARTICIPANTS)
    for (const r of conf) {
      expect(r.frame.bytes).toBe(Number(each))
      expect(r.frame.uwb?.ies).toEqual(['RMMRC'])
    }
    expect(Number(each)).toBe(uwbMmrcmBytes(PARTICIPANTS - 1, PARTICIPANTS))
  })

  it('lab 2: the bitmaps of block 0, and the one range', () => {
    const l = lab('读一张位图')
    const got = ofType(base, 'UWB_MMRCM').filter((r) => r.block === 0)
    const rows = blockOf(l, 'table', '第 0 块收到的位图（一位对应时隙 0、1、2）').rows
    expect(rows).toHaveLength(got.length)
    for (const [from, owner, bitmap] of rows) {
      const rec = got.find((r) => r.peer === from && r.node === owner)
      expect(rec, `${from} → ${owner}`).toBeDefined()
      expect(bitmap).toBe(bits(rec!.received))
    }
    // p-3's own confirmation reaches nobody
    expect(got.filter((r) => r.peer === QUIET_ID)).toEqual([])
    const [e2, e3] = fig(l.expect, /p-2 的元素是 (\d+)，p-3 的元素是 (\d+)/, 'lab 2 expect')
    expect(e2).toBe(bits(got.find((r) => r.peer === idOf(0) && r.node === idOf(1))!.received))
    expect(e3).toBe(bits(got.find((r) => r.peer === idOf(0) && r.node === idOf(2))!.received))
    const [q] = fig(l.expect, /p-3 收到的两张位图都是 (\d+)/, 'lab 2 quiet')
    const toQuiet = got.filter((r) => r.node === QUIET_ID)
    expect(toQuiet).toHaveLength(2)
    for (const r of toQuiet) expect(bits(r.received)).toBe(q)
    const [n, should] = fig(l.expect, /这一块只算出 (\d+) 条距离，三台设备本应有 (\d+) 条/, 'lab 2 ranges')
    expect(ofType(base, 'UWB_RANGE').filter((r) => r.block === 0)).toHaveLength(Number(n))
    expect(Number(should)).toBe((PARTICIPANTS * (PARTICIPANTS - 1)) / 2)
  })

  it('lab 3: request on and off, block 0, item by item', () => {
    const l = lab('请求不占字节，回复占时隙')
    const rows = blockOf(l, 'table', '请求位开启与关闭，第 0 块').rows
    const cell = (name: string) => rows.find((r) => r[0] === name)!
    const runs: [TLRecord[], number][] = [[twrOff, 1], [twrOn, 2]]
    for (const [rs, col] of runs) {
      const tx = block0(rs)
      expect(cell('第一轮的控制消息')[col]).toBe(`${tx.find((r) => r.frame.kind === 'uwbPoll')!.frame.bytes} 字节`)
      expect(cell('其余各轮的启动消息')[col]).toBe(`${tx.find((r) => r.frame.kind === 'uwbInit')!.frame.bytes} 字节`)
      const rounds = ofType(rs, 'UWB_ROUND').filter((r) => r.block === 0)
      expect(new Set(rounds.map((r) => r.slots)).size).toBe(1)
      expect(cell('每一轮的时隙数')[col]).toBe(`${rounds[0].slots} 个`)
      const conf = tx.filter((r) => r.frame.kind === 'uwbMmrcm')
      expect(cell('MMRCM')[col]).toBe(conf.length === 0 ? '0 帧' : `${conf.length} 帧，各 ${conf[0].frame.bytes} 字节`)
      expect(cell('四轮的测距结果')[col]).toBe(`${ofType(rs, 'UWB_RANGE').filter((r) => r.block === 0).length} 条`)
    }
    // 「每一轮要多留 3 个回复时隙，轮长又要整除测距块，于是从 10 个时隙变为 20 个；只在第四轮里发出 3 帧回复」
    // (2026-11-11, W2b: the round is stretched to a whole divisor of the block, standard §10.32.2)
    const [more, from, to, which, frames] = fig(l.expect,
      /每一轮要多留 (\d+) 个回复时隙，轮长又要整除测距块，于是从 (\d+) 个时隙变为 (\d+) 个；只在第(.)轮里发出 (\d+) 帧回复/, 'lab 3 expect')
    expect(Number(more)).toBe(ANCHORS)
    expect(Number(from)).toBe(ofType(twrOff, 'UWB_ROUND')[0].slots)
    expect(Number(to)).toBe(ofType(twrOn, 'UWB_ROUND')[0].slots)
    const conf = block0(twrOn).filter((r) => r.frame.kind === 'uwbMmrcm')
    expect(Number(frames)).toBe(conf.length)
    expect('零一二三四五'.indexOf(which!)).toBe(conf[0].frame.uwb!.round! + 1)
    const r0 = (rs: TLRecord[]) => ofType(rs, 'UWB_RANGE').filter((r) => r.block === 0 && r.round === 0).map((r) => [r.node, r.peer, r.distM])
    expect(r0(twrOn)).toEqual(r0(twrOff))
    expect(r0(twrOn).length).toBeGreaterThan(0)
  })

  it('lab 4: one bitmap for four rounds, and the frame-length law', () => {
    const l = lab('四轮一张位图')
    const recs = ofType(twrOn, 'UWB_MMRCM').filter((r) => r.block === 0)
    const conf = block0(twrOn).filter((r) => r.frame.kind === 'uwbMmrcm')
    const [bytes, nBits, octets, ones, positions] = fig(l.expect,
      /每个锚点一帧 (\d+) 字节、一个列表元素；位图 (\d+) 位、(\d+) 字节，其中 (\d+) 位为 1，即第 ([\d、]+) 位/, 'lab 4 expect')
    for (const r of conf) expect(r.frame.bytes).toBe(Number(bytes))
    for (const r of recs) {
      expect(r.ackSlots).toBe(Number(nBits))
      expect(r.received.filter(Boolean).length).toBe(Number(ones))
      expect(r.received.flatMap((b, i) => (b ? [i] : [])).join('、')).toBe(positions)
    }
    expect(rmmrcBitmapBytes(Number(nBits))).toBe(Number(octets))
    const f = blockOf(l, 'formula', '帧长')
    const [mhr, fixed, addr, blen, fcs] = fig(f.text, /帧头 (\d+) \+ 单元固定部分 (\d+) \+ N × \(地址 (\d+) \+ 位图长度 (\d+) \+ 位图 ⌈S\/8⌉\) \+ 帧校验 (\d+)/, 'the law').map(Number)
    expect([mhr, fixed, addr, blen, fcs]).toEqual([UWB_MHR_BYTES, RMMRC_FIXED_BYTES, RMMRC_ADDR_BYTES, RMMRC_BITMAP_LEN_BYTES, UWB_FCS_BYTES])
    const [s, c, per, cap] = fig(f.text, /S = (\d+) 时：(\d+) \+ (\d+)N 字节，N 最多 (\d+)/, 'the law at S').map(Number)
    expect(s).toBe(Number(nBits))
    expect(uwbMmrcmBytes(0, s!)).toBe(c)
    expect(uwbMmrcmBytes(1, s!) - uwbMmrcmBytes(0, s!)).toBe(per)
    expect(uwbMaxMmrcmInitiators(s!)).toBe(cap)
    expect(uwbMmrcmBytes(cap!, s!)).toBeLessThanOrEqual(UWB_MAX_PSDU_BYTES)
    expect(uwbMmrcmBytes(cap! + 1, s!)).toBeGreaterThan(UWB_MAX_PSDU_BYTES)
    expect(f.note).toContain(`不超过 ${UWB_MAX_PSDU_BYTES} 字节`)
    expect(Number(bytes)).toBe(c! + per!)
  })

  it('the variant label and the jump label print the run\'s own figures', () => {
    const [nb] = fig(uwbReceipt.variants![0].label, /(\d+) 位的位图/, 'variant label')
    expect(new Set(ofType(twrOn, 'UWB_MMRCM').map((r) => r.ackSlots))).toEqual(new Set([Number(nb)]))
    const [jb] = fig(uwbReceipt.jumps[0].label, /(\d+) 字节/, 'jump label')
    expect(block0(base).find((r) => r.frame.kind === 'uwbMmrcm')!.frame.bytes).toBe(Number(jb))
  })
})
