/**
 * `@txop-protect`, in the standard-first shape (2026-11-11).
 *
 * The rewrite followed an audit against IEEE Std 802.11-2024 §9.2.5.2: the standard has two
 * classes of Duration setting for a TXOP initiator — single and multiple protection — and the old
 * lesson taught the engine's third policy, `'boundary'`, as a standard name. ② now says what each
 * engine policy does and where it departs; the `describe` on ② below checks that the departures
 * are real (the engine really does write 0 into every Ack, and the `'boundary'` data frames really
 * do fall short of the reservation multiple protection would make them repeat), so a row cannot
 * claim a difference the engine does not have, nor lose one it does.
 *
 * Every figure the labs print is read back out of the lesson text here and compared with a run,
 * so editing a number in the lesson without the engine agreeing turns this red, and so does an
 * engine change that moves a number the lesson still prints. The four counts of the 300 ms table
 * and the bare-threshold experiment are also held, engine-side only, by
 * tests/course/lesson-claims.test.ts ("lesson 10 · protecting the burst").
 */
import { describe, it, expect } from 'vitest'
import { txopProtect, protectSequence } from '../../src/course/tier2/txop-protect'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { EDCA_PARAMS, SIFS_NS } from '../../src/engine/phy'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'
import { W, layoutDiagram, textBox, type Shape } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

/** base = the engine's 'boundary' policy; variant 0 = 'single'; variant 1 = 'multiple'. */
const boundary = (): TLRecord[] => runOf(txopProtect, undefined, RUN_NS)
const single = (): TLRecord[] => runOf(txopProtect, 0, RUN_NS)
const multiple = (): TLRecord[] => runOf(txopProtect, 1, RUN_NS)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const delivered = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
const meanNavNs = (rs: TLRecord[]): number => {
  const set = ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-2')
  expect(set.length).toBeGreaterThan(20)
  return set.reduce((a, r) => a + (r.untilNs - r.t), 0) / set.length
}
/** The frame each collision is recorded against: the one that ends at its instant. */
const lockedAt = (rs: TLRecord[]): Tx[] => ofType(rs, 'COLLISION')
  .map((c) => txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t).filter((r) => r.t + r.frame.txTimeNs === c.t)[0])
  .filter((r): r is Tx => !!r)

const lab = (heading: string): Lab => {
  const l = txopProtect.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, fragment: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && (b.heading ?? '').includes(fragment))
  expect(t, `table 「${fragment}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = txopProtect.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const grab = (s: string, re: RegExp, what: string): string[] => {
  const m = re.exec(s)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
/** 「2 528」 → 2528. */
const num = (s: string): number => Number(s.replace(/\s/g, ''))
/** A printed figure in µs or ms against nanoseconds, at the decimals the figure carries. */
const figure = (printed: string, unit: 'µs' | 'ms', ns: number, what: string): void => {
  const p = printed.replace(/\s/g, '')
  const dp = (p.split('.')[1] ?? '').length
  expect(Number(p), what).toBe(Number((ns / (unit === 'ms' ? MS : US)).toFixed(dp)))
}

lessonShapeSuite(txopProtect, { runNs: RUN_NS })

describe('txop-protect · the lesson', () => {
  it('is in the standard-first shape, in the QoS module', () => {
    expect(isStandardFirst(txopProtect)).toBe(true)
    expect(MODULES[txopProtect.module].title).toBe('QoS 与效率')
    expect(txopProtect.needs).toEqual(['nav', 'rts-cts', 'txop'])
    expect(txopProtect.limits).toEqual([])
    expect(txopProtect.observe).toEqual([])
    expect(txopProtect.tryThis).toEqual([])
  })

  it('loads the hidden-node hallway with bursts, an RTS threshold of 500 B and the boundary policy', () => {
    const s = txopProtect.scenario()
    expect(() => ScenarioSchema.parse(s)).not.toThrow()
    expect(s.rtsThresholdBytes).toBe(500)
    for (const id of ['sta-1', 'sta-2']) {
      const n = s.nodes.find((x) => x.id === id)!
      expect(n.txopProtection).toBe('boundary')
      expect(n.caps.features.txop).toBe(true)
    }
    const vs = txopProtect.variants!.map((v) => v.scenario())
    expect(vs.map((v) => v.nodes.find((n) => n.id === 'sta-1')!.txopProtection)).toEqual([undefined, 'multiple'])
    for (const v of vs) {
      expect(v.nodes.map((n) => ({ ...n, txopProtection: undefined })))
        .toEqual(s.nodes.map((n) => ({ ...n, txopProtection: undefined })))
    }
  })

  it('① cites each clause it teaches, and names only the two classes the standard has', () => {
    const std = txopProtect.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.23.2.9', '表 9-194', '§9.2.5.2', '§9.2.5.6']) expect(std, clause).toContain(clause)
    expect(std).toContain('单次保护')
    expect(std).toContain('多重保护')
    expect(txopProtect.why).toContain('单次保护（single protection）')
    expect(txopProtect.why).toContain('多重保护（multiple protection）')
    // the audit finding: boundary protection is not a standard class, and ① must not teach it
    expect(std).not.toContain('边界')
    // the default limits ① prints are the engine's own table (which is Table 9-194's)
    const [bkbe, vi, vo] = grab(std, /AC_BK 与 AC_BE 为 ([\d.]+) ms，AC_VI 为 ([\d.]+) ms，AC_VO 为 ([\d.]+) ms/, '① on Table 9-194')
    figure(bkbe, 'ms', EDCA_PARAMS[0].txopLimitNs, 'AC_BK')
    figure(bkbe, 'ms', EDCA_PARAMS[1].txopLimitNs, 'AC_BE')
    figure(vi, 'ms', EDCA_PARAMS[2].txopLimitNs, 'AC_VI')
    figure(vo, 'ms', EDCA_PARAMS[3].txopLimitNs, 'AC_VO')
  })

  it('② has rows that are not faithful, and the boundary row says it is not a standard class', () => {
    const kinds = txopProtect.implementation!.map((r) => r.kind)
    expect(kinds).toContain('differs')
    expect(kinds).toContain('absent')
    expect(implRow('「边界」策略').kind).toBe('differs')
    expect(implRow('「边界」策略').standard).toContain('边界保护（boundary protection）」这一类')
  })
})

describe('txop-protect · ② says what the engine does, and the engine does it', () => {
  it('TXOP limit: every TXOP of the scene is AC_BE’s 2 528 µs, and every exchange ends inside it', () => {
    const [limit] = grab(implRow('TXOP 上限').sim, /最长 ([\d ]+) µs/, 'the TXOP-limit row')
    const be = EDCA_PARAMS.find((p) => p.name === 'BE')!
    expect(num(limit) * US).toBe(be.txopLimitNs)
    for (const rs of [boundary(), single(), multiple()]) {
      const starts = ofType(rs, 'TXOP_START')
      expect(starts.length).toBeGreaterThan(100)
      for (const s of starts) {
        expect(s.ac).toBe(be.ac)
        expect(s.untilNs - s.t).toBe(be.txopLimitNs)
      }
      // nothing the holder sends inside a TXOP ends after its limit
      for (const s of starts) {
        const end = ofType(rs, 'TXOP_END').find((e) => e.node === s.node && e.t >= s.t)
        if (end) expect(end.t).toBeLessThanOrEqual(s.untilNs)
      }
    }
  })

  it('single-protection RTS: the pending frame, CTS, ACK and three SIFS — 460 µs here', () => {
    const [d] = grab(implRow('单次保护下的 RTS').sim, /这一值是 (\d+) µs/, 'the single RTS row')
    const s = single()
    const t0 = ofType(s, 'TXOP_START').filter((r) => r.node === 'sta-1')[2]
    const rts = txs(s, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t === t0.t)[0]
    const cts = txs(s, (r) => r.frame.kind === 'cts' && r.t > rts.t)[0]
    const data = txs(s, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > rts.t)[0]
    const ack = txs(s, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > data.t)[0]
    expect(rts.frame.durationFieldNs).toBe(3 * SIFS_NS + cts.frame.txTimeNs + data.frame.txTimeNs + ack.frame.txTimeNs)
    expect(rts.frame.durationFieldNs / US).toBe(Number(d))
  })

  it('the engine’s single and boundary data frames cover only SIFS + their own acknowledgement', () => {
    for (const rs of [single(), boundary()]) {
      const data = txs(rs, (r) => r.frame.kind === 'data')
      expect(data.length).toBeGreaterThan(100)
      for (const d of data) {
        const ack = txs(rs, (r) => r.node === 'ap' && (r.frame.kind === 'ack' || r.frame.kind === 'ba') && r.t > d.t)[0]
        if (!ack || ack.t !== d.t + d.frame.txTimeNs + SIFS_NS) continue
        expect(d.frame.durationFieldNs).toBe(SIFS_NS + ack.frame.txTimeNs)
      }
    }
  })

  it('every Ack and BlockAck carries 0, in all three runs', () => {
    for (const rs of [single(), boundary(), multiple()]) {
      const acks = txs(rs, (r) => r.frame.kind === 'ack' || r.frame.kind === 'ba')
      expect(acks.length).toBeGreaterThan(100)
      expect(new Set(acks.map((a) => a.frame.durationFieldNs))).toEqual(new Set([0]))
    }
  })

  it('the boundary policy really differs from multiple protection: its data frames fall short of the reservation', () => {
    // §9.2.5.2 b)4): once a NAV is established, D ≥ T_END-NAV − T_PPDU. Under 'boundary' the data
    // frames inside a burst opened with a TXOP-long RTS write 44–60 µs, far short of that.
    const rs = boundary()
    let short = 0
    for (const s of ofType(rs, 'TXOP_START')) {
      const rts = txs(rs, (r) => r.node === s.node && r.frame.kind === 'rts' && r.t === s.t)[0]
      if (!rts || rts.t + rts.frame.txTimeNs + rts.frame.durationFieldNs !== s.untilNs) continue
      const end = ofType(rs, 'TXOP_END').find((e) => e.node === s.node && e.t > s.t)
      if (!end) continue
      for (const d of txs(rs, (r) => r.node === s.node && r.frame.kind === 'data' && r.t > s.t && r.t < end.t)) {
        if (d.frame.durationFieldNs < s.untilNs - (d.t + d.frame.txTimeNs)) short++
      }
    }
    expect(short).toBeGreaterThan(100)
    // and under 'multiple' the same data frames do reach it, which is the faithful row
    const m = multiple()
    for (const s of ofType(m, 'TXOP_START')) {
      const rts = txs(m, (r) => r.node === s.node && r.frame.kind === 'rts' && r.t === s.t)[0]
      if (!rts || rts.t + rts.frame.txTimeNs + rts.frame.durationFieldNs !== s.untilNs) continue
      const end = ofType(m, 'TXOP_END').find((e) => e.node === s.node && e.t > s.t)
      if (!end) continue
      for (const d of txs(m, (r) => r.node === s.node && r.frame.kind === 'data' && r.t > s.t && r.t < end.t)) {
        expect(d.frame.durationFieldNs).toBeGreaterThanOrEqual(s.untilNs - (d.t + d.frame.txTimeNs))
      }
    }
  })

  it('an RTS that opens a burst reaches the TXOP limit; one that opens a single exchange covers only it', () => {
    for (const rs of [boundary(), multiple()]) {
      let burst = 0
      let lone = 0
      for (const s of ofType(rs, 'TXOP_START')) {
        const rts = txs(rs, (r) => r.node === s.node && r.frame.kind === 'rts' && r.t === s.t)[0]
        if (!rts) continue
        const end = ofType(rs, 'TXOP_END').find((e) => e.node === s.node && e.t > s.t)
        if (!end) continue
        const data = txs(rs, (r) => r.node === s.node && r.frame.kind === 'data' && r.t > s.t && r.t < end.t)
        if (rts.frame.durationFieldNs === s.untilNs - s.t - rts.frame.txTimeNs) {
          burst++
        } else {
          // the threshold alone: single-protection arithmetic, and only one exchange follows
          lone++
          expect(data.length, 'an RTS that does not reach the limit opens one exchange').toBeLessThanOrEqual(1)
        }
      }
      expect(burst).toBeGreaterThan(100)
      expect(lone).toBeGreaterThan(0)
    }
  })

  it('CTS: the RTS Duration less SIFS and itself; and every reservation the hidden station loads comes from it', () => {
    for (const rs of [boundary(), single()]) {
      for (const cts of txs(rs, (r) => r.frame.kind === 'cts')) {
        const rts = txs(rs, (r) => r.frame.kind === 'rts' && r.node === cts.frame.dst && r.t < cts.t).pop()!
        expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs)
      }
      expect(new Set(ofType(rs, 'NAV_SET').filter((r) => r.node === 'sta-2').map((r) => r.source))).toEqual(new Set(['cts:ap']))
    }
  })

  it('the channel is 20 MHz, which is what the reception row says', () => {
    expect(implRow('收不收得到').sim).toContain('20 MHz')
    expect(new Set(txs(boundary(), (r) => r.frame.kind === 'data').map((r) => r.frame.widthMhz))).toEqual(new Set([20]))
  })
})

describe('txop-protect · ③ every figure the labs print is the run', () => {
  const b = boundary()
  const ms3 = (ns: number) => Number((ns / MS).toFixed(3))
  const t0 = ofType(b, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms3(r.t) === 0.736)!
  const rts = txs(b, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t === t0.t)[0]
  const cts = txs(b, (r) => r.frame.kind === 'cts' && r.t > t0.t)[0]
  const nav = ofType(b, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
  const end = ofType(b, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
  const data = txs(b, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)

  it('lab 1: the sequence figure is a record of the run, message by message', () => {
    const l = lab('一帧 RTS 预约到 TXOP 末尾')
    const blk = (l.blocks ?? []).find((x) => x.kind === 'diagram')
    expect((blk as { spec: unknown }).spec).toEqual(protectSequence())
    const msg = (i: number) => protectSequence().messages[i]
    expect([msg(0).from, msg(0).to, msg(0).at]).toEqual(['sta-1', 'ap', `${ms3(rts.t).toFixed(3)} ms`])
    expect(num(grab(msg(0).label, /预约 ([\d ]+) µs/, 'the RTS message')[0])).toBe(rts.frame.durationFieldNs / US)
    expect([cts.node, cts.frame.dst, msg(1).at]).toEqual(['ap', 'sta-1', `${ms3(cts.t).toFixed(3)} ms`])
    expect(num(grab(msg(1).label, /CTS：([\d ]+) µs/, 'the CTS message')[0])).toBe(cts.frame.durationFieldNs / US)
    expect([msg(2).from, msg(2).at]).toEqual(['sta-2', `${ms3(nav.t).toFixed(3)} ms`])
    expect(msg(2).label).toContain(`${ms3(nav.untilNs)}`)
    expect(nav.source).toBe('cts:ap')
    expect(msg(3).at).toBe(`${ms3(data[0].t).toFixed(3)} ms`)
    expect(msg(3).label).toContain(`${(data[1].t - data[0].t) / US}`)
    expect(zhNumeral(grab(msg(3).label, /^([一二三四五六七八九十]+)次交互/, 'the figure on the exchanges')[0])).toBe(data.length)
    expect(msg(4).at).toBe(`${ms3(end.t).toFixed(3)} ms`)
    // the caption: where the reservation reaches, and when the burst ends
    const cap = (blk as { caption?: string }).caption ?? ''
    const [reach, n, last] = grab(cap, /一直持续到 ([\d.]+) ms[^]*?A 的([一二三四五六七八九十]+)次交互到 ([\d.]+) ms 才结束/, 'the caption')
    expect(Number(reach)).toBe(ms3(nav.untilNs))
    expect(zhNumeral(n)).toBe(data.length)
    expect(Number(last)).toBe(ms3(end.t))
  })

  it('lab 1: the figure lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(protectSequence())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    for (const t of ts) {
      const bx = textBox(t)
      expect(bx.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(bx.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(t.size, t.text).toBeGreaterThanOrEqual(9.5)
    }
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const hit = bs[i].x0 < bs[j].x1 && bs[j].x0 < bs[i].x1 && bs[i].y0 < bs[j].y1 && bs[j].y0 < bs[i].y1
        expect(hit, `${ts[i].text} / ${ts[j].text}`).toBe(false)
      }
    }
  })

  it('lab 1: the worked table and the expect line', () => {
    const l = lab('一帧 RTS 预约到 TXOP 末尾')
    const rows = tableOf(l, '从 0.736 ms 开始的那一串').rows
    const cell = (label: string): string => {
      const r = rows.find((x) => x[0] === label)
      expect(r, `row 「${label}」`).toBeDefined()
      return r![1]
    }
    expect(rows).toHaveLength(7)
    figure(grab(cell('TXOP 开始，AC_BE 的上限'), /([\d ]+) µs/, 'TXOP limit')[0], 'µs', t0.untilNs - t0.t, 'the TXOP limit')
    figure(grab(cell('RTS 发出，Duration'), /([\d ]+) µs/, 'RTS')[0], 'µs', rts.frame.durationFieldNs, 'the RTS Duration')
    figure(grab(cell('接入点回复 CTS，Duration'), /([\d ]+) µs/, 'CTS')[0], 'µs', cts.frame.durationFieldNs, 'the CTS Duration')
    figure(grab(cell('隐藏站 B 设置 NAV，到'), /([\d.]+) ms/, 'NAV')[0], 'ms', nav.untilNs, 'the NAV end')
    const [ex, dd] = grab(cell('每次交互的时长；每个数据帧的 Duration'), /(\d+) µs；(\d+) µs/, 'exchange')
    figure(ex, 'µs', data[1].t - data[0].t, 'one exchange')
    for (const d of data) figure(dd, 'µs', d.frame.durationFieldNs, 'a data frame’s Duration')
    figure(grab(cell('最后一个确认帧结束于'), /([\d.]+) ms/, 'end')[0], 'ms', end.t, 'the burst end')
    figure(grab(cell('预约到期之前还剩'), /(\d+) µs/, 'left')[0], 'µs', nav.untilNs - end.t, 'the time left')
    // the heading's instant
    figure(grab(tableOf(l, '那一串').heading!, /([\d.]+) ms/, 'heading')[0], 'ms', t0.t, 'the burst the heading names')

    const e = l.expect
    const [at, nth, d0, own] = grab(e, /([\d.]+) ms 的 RTS 是 A 的第([一二三四五六七八九十]+)次尝试，Duration ([\d ]+) µs，正好是 TXOP 上限减去 RTS 自身的 (\d+) µs/, 'lab 1 expect')
    figure(at, 'ms', t0.t, 'when A holds the air')
    expect(zhNumeral(nth)).toBe(txs(b, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t <= t0.t).length)
    figure(d0, 'µs', rts.frame.durationFieldNs, 'the RTS Duration')
    figure(own, 'µs', rts.frame.txTimeNs, 'the RTS airtime')
    expect(num(d0) + num(own)).toBe((t0.untilNs - t0.t) / US)
    const [ctsAt, ctsD, navAt, navTo] = grab(e, /接入点在 ([\d.]+) ms 回复 CTS，Duration ([\d ]+) µs；B 在 ([\d.]+) ms 依据这帧 CTS 设置 NAV，一直到 ([\d.]+) ms/, 'lab 1 expect, CTS')
    figure(ctsAt, 'ms', cts.t, 'CTS instant')
    figure(ctsD, 'µs', cts.frame.durationFieldNs, 'CTS Duration')
    figure(navAt, 'ms', nav.t, 'NAV instant')
    figure(navTo, 'ms', nav.untilNs, 'NAV end')
    const [n, dur] = grab(e, /此后([一二三四五六七八九十]+)个数据帧的 Duration 都只有 (\d+) µs/, 'lab 1 expect, data')
    expect(zhNumeral(n)).toBe(data.length)
    for (const d of data) figure(dur, 'µs', d.frame.durationFieldNs, 'data Duration')
    // and t = 0: both stations open with an RTS and collide
    expect(new Set(txs(b, (r) => r.frame.kind === 'rts' && r.t === 0).map((r) => r.node))).toEqual(new Set(['sta-1', 'sta-2']))
    expect(l.steps[0]).toContain('t = 0')
    // meaning: 「至少写到 3.264 ms」
    figure(grab(l.meaning, /至少写到 ([\d.]+) ms/, 'lab 1 meaning')[0], 'ms', nav.untilNs, 'the reservation end multiple protection repeats')
  })

  it('lab 2: the single policy’s burst at 0.736 ms, and the 300 ms table', () => {
    const l = lab('只预约一次交互：预约在中途到期')
    const s = single()
    const st0 = ofType(s, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms3(r.t) === 0.736)!
    const srts = txs(s, (r) => r.node === 'sta-1' && r.frame.kind === 'rts' && r.t === st0.t)[0]
    const scts = txs(s, (r) => r.frame.kind === 'cts' && r.t > st0.t)[0]
    const snav = ofType(s, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= st0.t)!
    const bRts = txs(s, (r) => r.node === 'sta-2' && r.frame.kind === 'rts' && r.t > snav.untilNs)[0]
    const col = ofType(s, 'COLLISION').find((c) => c.t > bRts.t)!
    const aData = txs(s, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > st0.t)
    const e = l.expect
    const [at, rd, cd, navTo, bAt, colAt] = grab(e, /同一个 ([\d.]+) ms 的 RTS 这次只写 (\d+) µs，CTS 写 (\d+) µs，B 的 NAV 到 ([\d.]+) ms 就到期；B 在 ([\d.]+) ms 发出 RTS，与 A 正在发送的第二个数据帧相撞，碰撞记在 ([\d.]+) ms/, 'lab 2 expect')
    figure(at, 'ms', st0.t, 'the burst')
    figure(rd, 'µs', srts.frame.durationFieldNs, 'single RTS Duration')
    figure(cd, 'µs', scts.frame.durationFieldNs, 'single CTS Duration')
    figure(navTo, 'ms', snav.untilNs, 'B’s NAV end')
    figure(bAt, 'ms', bRts.t, 'B’s RTS')
    figure(colAt, 'ms', col.t, 'the collision')
    // it really is A's second data frame that is hit: it is on the air when B starts, and ends at the collision
    expect(aData[1].t).toBeLessThan(bRts.t)
    expect(aData[1].t + aData[1].frame.txTimeNs).toBe(col.t)
    expect(col.nodes).toEqual(expect.arrayContaining(['sta-1', 'sta-2']))

    const t = tableOf(l, '同样的 300 ms')
    expect(Number(grab(t.heading!, /(\d+) ms/, 'heading')[0]) * MS).toBe(RUN_NS)
    const COUNTS: readonly (readonly [string, (rs: TLRecord[]) => number])[] = [
      ['碰撞次数', (rs) => ofType(rs, 'COLLISION').length],
      ['成功送达的数据帧', delivered],
      ['重传（retry）', (rs) => ofType(rs, 'RETRY').length],
      ['丢弃帧数', (rs) => ofType(rs, 'DROP').length],
    ]
    expect(t.rows).toHaveLength(COUNTS.length + 1)
    for (const [label, count] of COUNTS) {
      const row = t.rows.find((r) => r[0] === label)!
      expect(row, label).toBeDefined()
      expect([Number(row[1]), Number(row[2])], label).toEqual([count(s), count(b)])
    }
    const navRow = t.rows.find((r) => r[0] === '隐藏站点每条预约的平均时长')!
    figure(grab(navRow[1], /([\d.]+) ms/, 'nav single')[0], 'ms', meanNavNs(s), 'mean NAV, single')
    figure(grab(navRow[2], /([\d.]+) ms/, 'nav boundary')[0], 'ms', meanNavNs(b), 'mean NAV, boundary')
    const [c, dlv] = grab(e, /300 ms 内碰撞 (\d+) 次，送达 (\d+) 帧/, 'lab 2 expect, totals')
    expect([Number(c), Number(dlv)]).toEqual([ofType(s, 'COLLISION').length, delivered(s)])
    // and the steps' 1.7 ms really does reach past the collision
    expect(Number(grab(l.steps[0], /运行到 ([\d.]+) ms/, 'lab 2 step')[0]) * MS).toBeGreaterThan(col.t)
  })

  it('lab 3: the first collision at 28 µs, and the census of the 21', () => {
    const l = lab('剩下的碰撞')
    const [first] = grab(l.expect, /第一次碰撞落在 t = (\d+) µs/, 'lab 3 expect')
    const cols = ofType(b, 'COLLISION')
    figure(first, 'µs', cols[0].t, 'the first collision')
    const openers = txs(b, (r) => r.frame.kind === 'rts' && r.t === 0)
    expect(cols[0].t).toBe(openers[0].t + openers[0].frame.txTimeNs)
    const [all, rr, bytes, dd] = grab(l.expect, /300 ms 内的 (\d+) 次碰撞里，(\d+) 次是两帧 RTS 相撞，每次各损失一帧 (\d+) 字节的 RTS；只有 (\d+) 次碰上了正在发送的数据帧/, 'lab 3 census')
    const locked = lockedAt(b)
    expect(Number(all)).toBe(cols.length)
    expect(Number(rr)).toBe(locked.filter((r) => r.frame.kind === 'rts').length)
    expect(Number(dd)).toBe(locked.filter((r) => r.frame.kind === 'data').length)
    expect(Number(rr) + Number(dd)).toBe(Number(all))
    expect(new Set(txs(b, (r) => r.frame.kind === 'rts').map((r) => r.frame.bytes))).toEqual(new Set([Number(bytes)]))
  })

  it('lab 4: raising the threshold above every frame leaves the one-exchange TXOPs bare', () => {
    const l = lab('只容纳一次交互的 TXOP')
    const [from, to] = grab(l.steps[0], /从 (\d+) 字节改为 (\d+) 字节/, 'lab 4 step')
    const sc0 = txopProtect.scenario()
    expect(Number(from)).toBe(sc0.rtsThresholdBytes)
    const biggest = Math.max(...txs(b, (r) => r.frame.kind === 'data').map((r) => r.frame.bytes))
    expect(Number(to), '「高过这里的每一帧」').toBeGreaterThan(biggest)
    expect(Number(from)).toBeLessThan(biggest)
    const bare = [...new Simulation({ ...sc0, rtsThresholdBytes: Number(to) }).runUntil(RUN_NS).records]
    const [c0, c1, d0, d1, slow] = grab(l.expect, /碰撞从 (\d+) 次升到 (\d+) 次，送达从 (\d+) 帧降到 (\d+) 帧[^]*?最慢的一帧占了 ([\d.]+) ms 的空口时间/, 'lab 4 expect')
    expect([Number(c0), Number(d0)]).toEqual([ofType(b, 'COLLISION').length, delivered(b)])
    expect([Number(c1), Number(d1)]).toEqual([ofType(bare, 'COLLISION').length, delivered(bare)])
    figure(slow, 'ms', Math.max(...txs(bare, (r) => r.frame.kind === 'data').map((r) => r.frame.txTimeNs)), 'the slowest bare frame')
  })

  it('the quiz’s exposure pair is this lesson’s own burst, rounded', () => {
    const [burstMs, oneMs] = grab(txopProtect.quiz![1].options[1], /这里是 ([\d.]+) ms，而不是 ([\d.]+) ms/, 'quiz 2')
    const burst = (end.t - t0.t) / MS
    const exchange = (data[1].t - data[0].t) / MS
    expect(Math.abs(burst / Number(burstMs) - 1)).toBeLessThan(0.1)
    expect(Math.abs(exchange / Number(oneMs) - 1)).toBeLessThan(0.1)
    const [b1, ex] = grab(txopProtect.quiz![1].explain, /([\d.]+) ms 那一串从 RTS 到最后一个确认帧约 ([\d.]+) ms/, 'quiz 2 explain')
    figure(b1, 'ms', t0.t, 'the burst named')
    figure(ex, 'ms', end.t - t0.t, 'its span')
    figure(grab(txopProtect.quiz![1].explain, /一次交互只有 (\d+) µs/, 'quiz 2 explain')[0], 'µs', data[1].t - data[0].t, 'one exchange')
  })

  it('the why’s figures are the runs', () => {
    const w = txopProtect.why!
    const [ms, bc, bd, sc, sd, n, rr] = grab(w, /(\d+) ms 内碰撞 (\d+) 次、送达 (\d+) 帧；只预约一次交互的那一侧碰撞 (\d+) 次、送达 (\d+) 帧。剩下的 (\d+) 次碰撞里有 (\d+) 次是两帧 RTS 相撞/, 'why')
    expect(Number(ms) * MS).toBe(RUN_NS)
    expect([Number(bc), Number(bd), Number(sc), Number(sd)]).toEqual([ofType(b, 'COLLISION').length, delivered(b), ofType(single(), 'COLLISION').length, delivered(single())])
    expect(Number(n)).toBe(ofType(b, 'COLLISION').length)
    expect(Number(rr)).toBe(lockedAt(b).filter((r) => r.frame.kind === 'rts').length)
  })
})
