/**
 * `@mumimo-choose`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 and 802.11be-2024 for what a downlink multi-user send is allowed to
 * be; ② gives the engine's choice rule and PHY shortcuts row by row and is checked here against
 * mac.ts, phy.ts and the run; ③'s three labs print figures from `mumimo`'s scene and its two
 * variants, and every one is read back out of the lesson and compared with that run.
 *
 * What the audit added, and this file pins: the 1,000-byte threshold is real in the engine and
 * inert in this scene — every member of every multi-user send here carries at least 1,434 bytes,
 * so the two variants differ only in whether MU-MIMO was negotiated.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { mumimoChoose } from '../../src/course/tier2/mumimo-choose'
import { mumimo } from '../../src/course/tier2/mumimo'
import { mumimoScenario } from '../../src/course/wifiScenes'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { PHY_MODES, preambleNsFor, txTimeModeNs } from '../../src/engine/phy'
import { ppduLayout } from '../../src/model/frameFields'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 500 * MS
/** The PPDU's own fields (2026-11-11, W6): preamble, MU signalling, data, PE, the µs rounding. */
const seg = (r: Tx, key: string): number => ppduLayout(r.frame).find((s) => s.key === key)?.durNs ?? 0
const symbolsOf = (r: Tx): number => ppduLayout(r.frame).find((s) => s.key === 'data')!.symbols!
const MAC_SRC = readFileSync(new URL('../../src/engine/mac.ts', import.meta.url), 'utf8')
const PHY_SRC = readFileSync(new URL('../../src/engine/phy.ts', import.meta.url), 'utf8')

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const muSends = (rs: TLRecord[]): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.muParts !== undefined)
const cleanSend = (rs: TLRecord[], members: number, bytes: number): Tx => {
  const hit = muSends(rs).find((r) => r.frame.muParts!.length === members && r.frame.muParts!.every((p) => p.bytes === bytes))
  expect(hit, `a clean ${members}-member send of ${bytes} B each`).toBeDefined()
  return hit!
}
const runs = [runOf(mumimo, 0, RUN_NS), runOf(mumimo, 1, RUN_NS)]
const val = (x: string): number => Number(x.replace(/[\s,B]/g, ''))
const zh = (s: string): number => '零一二三四五六七八九十'.indexOf(s)
const same = (printed: string, measured: number, what: string): void => {
  const fig = printed.replace(/[\s,]/g, '')
  const dp = (fig.split('.')[1] ?? '').length
  expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`).toBe(Number(measured.toFixed(dp)))
}
const rateOf = (r: Tx): number => (r.frame.muParts![0].bytes * 8) / (r.frame.txTimeNs / 1000)

const lab = (heading: string): Lab => {
  const l = mumimoChoose.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind)
  expect(b, `${kind} of 「${l.heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = mumimoChoose.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(mumimoChoose, { sameSceneAs: 'mumimo', runNs: RUN_NS })

describe('mumimo-choose · the lesson', () => {
  it('is the second half of mumimo, in the standard-first shape: same module, house and variants', () => {
    expect(isStandardFirst(mumimoChoose)).toBe(true)
    expect(MODULES[mumimoChoose.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mumimoChoose.needs).toEqual(['mumimo'])
    expect(mumimoChoose.terms!.map((t) => t.term)).toEqual(['symbol', 'MU', 'OFDMA'])
    expect(mumimoChoose.scenario()).toEqual(mumimo.scenario())
    expect(mumimoChoose.variants!.map((v) => v.scenario())).toEqual([mumimoScenario(false), mumimoScenario(true)])
    for (const v of mumimoChoose.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(mumimoChoose.limits).toEqual([])
    expect(mumimoChoose.observe).toEqual([])
    expect(mumimoChoose.tryThis).toEqual([])
  })

  it('cites each clause it teaches in ①, under its own document', () => {
    const std = mumimoChoose.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const c of ['§26.5.1.1', '§35.5.1.1', '§36.3.2.1', '§36.3.3.1.1', '§36.3.3.3', '§26.7.1', '表 36-18', '§36.3.13.3', '§36.4.3', '§27.3.3.1.1']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain('没有规定接入点在一轮发送里该按频率还是按空间划分')
    const src = mumimoChoose.sources!.join('\n')
    expect(src).toMatch(/IEEE Std 802\.11-2024：.*§26\.5\.1\.1.*§27\.3\.3\.1\.1/)
    expect(src).toMatch(/IEEE Std 802\.11be-2024：.*§35\.5\.1\.1.*§36\.3\.3\.3/)
  })
})

describe('mumimo-choose · ② says what the engine does, and the engine does it', () => {
  it('the choice rule: every candidate negotiated MU-MIMO and every head frame ≥ 1,000 bytes', () => {
    const r = implRow('选择哪一种划分')
    expect(r.kind).toBe('choice')
    const [thr] = /队首那一帧都不小于 ([\d,]+) 字节/.exec(r.sim)!.slice(1)
    expect(val(thr)).toBe(Number(/const MUMIMO_MIN_BYTES = ([\d_]+)/.exec(MAC_SRC)![1]))
    expect(MAC_SRC).toContain('headBytes(ei, d)')
    expect(r.sim).toContain('门限看的是队首那一帧')
  })

  it('the group: trimmed to the AP’s streams; at most four; the two divisions never mixed', () => {
    expect(MAC_SRC).toContain('streams <= this.cfg.ownNss()')
    expect(/最多(.)个/.exec(implRow('一组最多几个成员').sim)![1]).toBe('四')
    expect(MAC_SRC).toContain('muDsts.slice(0, 4)')
    expect(implRow('两种划分并用').kind).toBe('absent')
    for (const [v, want] of [[0, 'ofdma'], [1, 'mumimo']] as const) {
      const sends = muSends(runs[v])
      expect(new Set(sends.map((r) => r.frame.muKind))).toEqual(new Set([want]))
      for (const r of sends) {
        const fracs = new Set(r.frame.muParts!.map((p) => p.ruFraction ?? 1))
        expect(fracs.size).toBe(1)
        expect([...fracs][0]).toBe(want === 'mumimo' ? 1 : 1 / r.frame.muParts!.length)
        expect(r.frame.muParts!.length).toBeLessThanOrEqual(4)
      }
    }
  })

  it('the PHY: the preamble by stream count, 13.6 µs symbols, the LDPC count, the longest member', () => {
    expect(implRow('前导码的时长').kind).toBe('faithful')
    const [p4, p2] = /4 个 EHT-LTF，前导码 ([\d.]+) µs.*2 个 EHT-LTF，前导码 ([\d.]+) µs/.exec(implRow('前导码的时长').sim)!.slice(1).map(Number)
    expect([p4 * US, p2 * US]).toEqual([preambleNsFor('eht', undefined, { nss: 4 }), preambleNsFor('eht', undefined, { nss: 2 })])
    expect(implRow('多用户发送的信令').kind).toBe('differs')
    expect(implRow('多用户发送的信令').sim).toContain(`${PHY_MODES.eht.muExtraPreambleNs / US} µs`)
    expect(Number(/每个数据符号 ([\d.]+) µs/.exec(implRow('数据符号的时长').sim)![1]) * US).toBe(PHY_MODES.eht.symNs)
    expect(implRow('数据符号数').kind).toBe('faithful')
    expect(PHY_SRC).toContain('heDataSymbols(lengthBytes, ndbps, ndbpsShort, rate, coding)')
    // 「本课的多用户发送使用 MCS 12 与 13，都只能用 LDPC」: EHT-MCS 10 to 14 are LDPC-only (§36.3.13.3.3)
    const printed = /使用 MCS (\d+) 与 (\d+)，都只能用 LDPC/.exec(implRow('数据符号数').standard)!.slice(1).map(Number)
    const used = new Set(runs.flatMap((rs) => muSends(rs).flatMap((r) => r.frame.muParts!.map((p) => p.mcs))))
    expect([...used].sort((x, y) => x - y)).toEqual(printed)
    for (const m of used) expect(m >= 10 && m <= 14, `MCS ${m} is LDPC-only`).toBe(true)
    // every send of both variants: the longest member's TXTIME, with the group's LTF count
    for (const rs of runs) {
      for (const r of muSends(rs)) {
        const mode = r.frame.mode!
        const parts = r.frame.muParts!
        const streams = parts.map((p) => p.nss ?? 1)
        const ltfNss = r.frame.muKind === 'mumimo' ? streams.reduce((a, b) => a + b, 0) : Math.max(...streams)
        const t = Math.max(...parts.map((p) => txTimeModeNs(mode, p.bytes, p.mcs, {
          mu: true, widthMhz: r.frame.widthMhz, nss: p.nss ?? 1, ltfNss, ruFraction: p.ruFraction,
        })))
        expect(r.frame.txTimeNs).toBe(t)
        expect(ppduLayout(r.frame).reduce((a, s) => a + s.durNs, 0)).toBe(r.frame.txTimeNs)
      }
    }
  })
})

describe('mumimo-choose · ③ every figure the labs print is the run', () => {
  const ofdma = cleanSend(runs[0], 3, 4_306)
  const mimo = cleanSend(runs[1], 2, 4_306)
  const sendOf = (label: string): Tx => (label.includes('频率') ? ofdma : mimo)

  it('lab 1: the two rows, the formula and its note, and the deliveries in `expect`', () => {
    const l = lab('同一份载荷，两种发送')
    const tb = blockOf(l, 'table')
    expect(Number(/(\d+) MHz/.exec(tb.heading!)![1])).toBe(mumimoChoose.scenario().nodes.find((n) => n.kind === 'ap')!.caps.widthMhz)
    const streams = /每部手机(.)条流/.exec(tb.heading!)![1]
    for (const n of mumimoChoose.scenario().nodes.filter((x) => (x.profiles ?? []).includes('video'))) {
      expect(n.caps.nss).toBe(streams === '两' ? 2 : zh(streams))
    }
    for (const [label, members, payload, symbols, length, rate] of tb.rows) {
      const s = sendOf(label)
      expect(Number(members), label).toBe(s.frame.muParts!.length)
      for (const p of s.frame.muParts!) expect(val(payload), label).toBe(p.bytes)
      expect(Number(symbols), label).toBe(symbolsOf(s))
      same(length.replace(' µs', ''), s.frame.txTimeNs / US, `${label}: length`)
      same(rate.replace(' Mb/s', ''), rateOf(s), `${label}: per-member rate`)
    }
    const f = blockOf(l, 'formula')
    const [mu, per] = /整帧长度 = 前导码 \+ ([\d.]+) µs \+ ([\d.]+) µs × 数据符号数 \+ 包扩展，再取整到整微秒/.exec(f.text)!.slice(1).map(Number)
    expect(mu * US).toBe(PHY_MODES.eht.muExtraPreambleNs)
    expect(per * US).toBe(PHY_MODES.eht.symNs)
    for (const s of [ofdma, mimo]) {
      const pre = seg(s, 'preamble') / US, pe = seg(s, 'pe') / US, n = symbolsOf(s)
      const raw = Number((pre + mu + per * n + pe).toFixed(1))
      expect(f.note!).toContain(`${pre} + ${mu} + ${per} × ${n} + ${pe} = ${raw} µs，取整为 ${(s.frame.txTimeNs / US).toFixed(1)} µs`)
      expect(seg(s, 'muSig')).toBe(PHY_MODES.eht.muExtraPreambleNs)
    }
    expect(seg(ofdma, 'data') / seg(mimo, 'data')).toBe(zh(/恰好相差(.)倍/.exec(f.note!)![1]))
    const ratio = /整帧只相差 ([\d.]+) 倍/.exec(f.note!)![1]
    same(ratio, ofdma.frame.txTimeNs / mimo.frame.txTimeNs, 'the end-to-end ratio')
    // the same ratio in `why` and in an outcome
    expect(/整帧却?只相差 ([\d.]+) 倍/.exec(mumimoChoose.why!)![1]).toBe(ratio)
    expect(/整帧为什么只相差 ([\d.]+) 倍/.exec(mumimoChoose.outcomes!.join(''))![1]).toBe(ratio)
    // 「4,306 字节需要三个数据符号，整帧 92.8 µs；…只需要一个，整帧 65.6 µs。三个成员一次交付 12,918 字节，两个成员是 8,612 字节」
    const e = /([\d,]+) 字节需要(.)个数据符号，整帧 ([\d.]+) µs；.*只需要(.)个，整帧 ([\d.]+) µs。(.)个成员一次交付 ([\d,]+) 字节，(.)个成员是 ([\d,]+) 字节/.exec(l.expect)!
    expect(val(e[1])).toBe(ofdma.frame.muParts![0].bytes)
    expect([zh(e[2]), zh(e[4])]).toEqual([symbolsOf(ofdma), symbolsOf(mimo)])
    same(e[3], ofdma.frame.txTimeNs / US, 'the wider send')
    same(e[5], mimo.frame.txTimeNs / US, 'the narrower send')
    expect([zh(e[6]), val(e[7])]).toEqual([ofdma.frame.muParts!.length, ofdma.frame.bytes])
    expect([e[8] === '两' ? 2 : zh(e[8]), val(e[9])]).toEqual([mimo.frame.muParts!.length, mimo.frame.bytes])
    // and `why` prints the same four
    const w = /同样的 ([\d,]+) 字节，按频率划分需要(.)个数据符号，按空间划分只需要(.)个.*交付 ([\d,]+) 字节.*交付 ([\d,]+) 字节/.exec(mumimoChoose.why!)!
    expect([val(w[1]), zh(w[2]), zh(w[3]), val(w[4]), val(w[5])])
      .toEqual([ofdma.frame.muParts![0].bytes, symbolsOf(ofdma), symbolsOf(mimo), ofdma.frame.bytes, mimo.frame.bytes])
  })

  it('lab 2: the step-by-step table, its arithmetic cells read as arithmetic', () => {
    const l = lab('同一份 4,306 字节，两种方式各计算一遍')
    const tb = blockOf(l, 'table')
    expect(tb.heading).toContain(`${ofdma.frame.muParts![0].bytes.toLocaleString('en-US')} 字节`)
    const cell = (needle: string): string[] => tb.rows.find((r) => r[0].includes(needle))!.slice(1)
    const queued = (s: Tx): number => new Set(muSends(runs[s === ofdma ? 0 : 1]).flatMap((r) => r.frame.muParts!.map((p) => p.dst))).size
    for (const [c, label] of tb.head.slice(1).entries()) {
      const s = sendOf(label)
      expect(Number(cell('队列中有数据的手机')[c]), label).toBe(3)
      expect(queued(ofdma), 'three phones ever take part').toBe(3)
      expect(cell('都协商过 MU-MIMO')[c], label).toBe(s.frame.muKind === 'mumimo' ? '是' : '否')
      expect(Number(cell('裁减后的成员数')[c]), label).toBe(s.frame.muParts!.length)
      expect(cell('每个成员得到的子载波')[c], label).toBe(s.frame.muParts![0].ruFraction === 1 / 3 ? '三分之一' : '全部')
      expect(Number(cell('每个成员的符号数')[c]), label).toBe(symbolsOf(s))
      expect(cell('前导码（EHT-LTF 按流数计）')[c]).toBe(`${seg(s, 'preamble') / US} µs`)
      expect(cell('包扩展')[c]).toBe(`${seg(s, 'pe') / US} µs`)
      const [o, m, p, n, pe, raw, total] = /([\d.]+) \+ ([\d.]+) \+ ([\d.]+) × (\d+) \+ ([\d.]+) = ([\d.]+)，取整 ([\d.]+) µs/.exec(cell('因此这次发送的时长是')[c])!.slice(1).map(Number)
      expect([o * US, m * US, p * US, n, pe * US]).toEqual([seg(s, 'preamble'), PHY_MODES.eht.muExtraPreambleNs, PHY_MODES.eht.symNs, symbolsOf(s), seg(s, 'pe')])
      same(String(total), s.frame.txTimeNs / US, `${label}: length`)
      expect(Number((o + m + p * n + pe).toFixed(1))).toBe(raw)
      expect(Math.ceil(raw)).toBe(total)
      expect(val(cell('这一次合计交付')[c]), label).toBe(s.frame.bytes)
    }
    expect(val(/队首都有 ([\d,]+) 字节/.exec(tb.rows.find((r) => r[0].includes('都协商过'))![0])![1]))
      .toBe(Number(/const MUMIMO_MIN_BYTES = ([\d_]+)/.exec(MAC_SRC)![1]))
    // 「接入点有 4 根天线，每部手机协商了 2 条流」
    const [ant, nss] = /接入点有 (\d+) 根天线，每部手机协商了 (\d+) 条流/.exec(l.expect)!.slice(1).map(Number)
    const sc = mumimoScenario(true)
    expect(sc.nodes.find((n) => n.kind === 'ap')!.caps.nss).toBe(ant)
    for (const id of ['sta-1', 'sta-2', 'sta-3']) expect(sc.nodes.find((n) => n.id === id)!.caps.nss).toBe(nss)
    expect(Math.floor(ant / nss)).toBe(mimo.frame.muParts!.length)
    const [a, b] = /两列的符号数分别是 (\d+) 与 (\d+)/.exec(l.expect)!.slice(1).map(Number)
    expect([a, b]).toEqual([symbolsOf(ofdma), symbolsOf(mimo)])
  })

  it('lab 3: 500 ms of each variant — the threshold never decides here', () => {
    const l = lab('这栋房子里起作用的是哪一个条件')
    const rows = blockOf(l, 'table').rows
    for (const [v, label] of [[0, '按频率划分'], [1, '按空间划分']] as const) {
      const row = rows.find((r) => r[0] === label)!
      const sends = muSends(runs[v])
      expect(Number(row[1]), label).toBe(sends.length)
      expect(Number(row[2]), label).toBe(sends.filter((r) => r.frame.muKind === 'mumimo').length)
      expect(val(row[3]), label).toBe(Math.min(...sends.flatMap((r) => r.frame.muParts!.map((p) => p.bytes))))
    }
    const thr = Number(/const MUMIMO_MIN_BYTES = ([\d_]+)/.exec(MAC_SRC)![1])
    const min = Math.min(...runs.flatMap((rs) => muSends(rs).flatMap((r) => r.frame.muParts!.map((p) => p.bytes))))
    expect(min).toBeGreaterThanOrEqual(thr)
    const e = /最小的成员都是 ([\d,]+) 字节，从未低于 ([\d,]+) 字节/.exec(l.expect)!
    expect([val(e[1]), val(e[2])]).toEqual([min, thr])
    // `why` says the same
    const w = /每个成员都至少有 ([\d,]+) 字节，([\d,]+) 字节的门限从未起作用/.exec(mumimoChoose.why!)!
    expect([val(w[1]), val(w[2])]).toEqual([min, thr])
    // and the variants differ in exactly the negotiation
    const [a, b] = [mumimoScenario(false), mumimoScenario(true)]
    expect(a.nodes.map((n) => n.caps.features.mumimo)).toEqual(a.nodes.map(() => false))
    expect(b.nodes.map((n) => n.caps.features.mumimo)).toEqual(b.nodes.map(() => true))
  })
})
