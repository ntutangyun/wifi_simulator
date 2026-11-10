/**
 * `@airtime`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 for the exchange this lesson times; ② says, row by row, what the
 * engine does — and the rows marked `differs` are pinned here against the engine, so a row that
 * claims a departure the engine no longer has goes red as surely as a figure does. ③'s figures
 * are read back out of the lesson text and compared with a run of the lesson's own scene.
 */
import { describe, it, expect } from 'vitest'
import {
  airtime, exchangeTiming, giNumbers, ACK_US, APEP_BYTES, DATA_US, EXCHANGE_US, PE_US, PREAMBLE_US, SIFS_US,
} from '../../src/course/tier1/airtime'
import { decodeFrame } from '../../src/model/frameFields'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import {
  AMPDU_DELIMITER_BYTES, MANDATORY_MBPS, NONHT_REF_MBPS, PHY_MODES, RATES, SIFS_NS, TGI_NS, ctrlRespRateFor, ctrlRespRateForMode,
  mcsRateMbps, ppduTiming, preambleNsFor, symNsFor, txTimeModeNs, txTimeNs,
} from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
/** 100 ms: the window lab 1 and lab 3 count over. */
const RUN_NS = 100 * MS
/** 150 ms: the window lab 4 compares the two guard intervals over. */
const GI_RUN_NS = 150 * MS

const recs = (): TLRecord[] => runOf(airtime, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)

const lab = (heading: string): Lab => {
  const l = airtime.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = airtime.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => airtime.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
/** 「140.8 µs」 → 140.8. */
const us = (cell: string): number => {
  const m = /^([\d.]+) µs$/.exec(cell)
  expect(m, `「${cell}」 is a figure in µs`).not.toBeNull()
  return Number(m![1])
}

lessonShapeSuite(airtime, { runNs: RUN_NS })

describe('airtime · the lesson', () => {
  it('is in the standard-first shape, in the frames-and-airtime module', () => {
    expect(isStandardFirst(airtime)).toBe(true)
    expect(MODULES[airtime.module].title).toBe('帧与空口时间')
    expect(airtime.needs).toEqual(['mcs-ladder', 'small-frames'])
    expect(airtime.terms!.map((t) => t.term)).toEqual(['ACK', 'payload'])
    expect(airtime.limits).toEqual([])
    expect(airtime.observe).toEqual([])
    expect(airtime.tryThis).toEqual([])
  })

  it('keeps its scene and its one variant, which differs only by the guard interval', () => {
    expect(() => ScenarioSchema.parse(airtime.scenario())).not.toThrow()
    expect(airtime.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1'])
    expect('guardInterval' in airtime.scenario()).toBe(false)
    expect(airtime.variants).toHaveLength(1)
    const { guardInterval, ...rest } = airtime.variants![0].scenario() as Scenario & { guardInterval?: unknown }
    expect(guardInterval).toEqual({ gi: 'quad' })
    expect(rest).toEqual(airtime.scenario())
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§27.4.3', '表 27-13', '§27.3.23', '§9.3.1.4', '§10.3.2.11', '§10.3.2.3.3', '§10.6.6.5.2', '§10.6.11', '表 10-10', '§17.1.1', '§17.4.3']) {
      expect(std, c).toContain(c)
    }
  })

  it('① states the control-response rule in exactly one step, the one `tier1-project` points at', () => {
    const steps = airtime.standard!.find((b) => b.kind === 'steps') as { items: string[] }
    const hits = steps.items.map((s, i) => [s, i + 1] as const).filter(([s]) => s.includes('最高强制速率'))
    expect(hits).toHaveLength(1)
    expect(hits[0]![1]).toBe(2)
  })

  it('① adds the HE preamble fields up the way Table 27-13 does: 36 µs, 43.2 µs with one 2x HE-LTF', () => {
    const std = stdText()
    const fields = [8, 8, 4, 4, 8, 4] // L-STF, L-LTF, L-SIG, RL-SIG, HE-SIG-A, HE-STF
    expect(fields.reduce((a, b) => a + b, 0)).toBe(36)
    expect(std).toContain('共 36 µs')
    for (const [gi, sym] of [[0.8, 13.6], [1.6, 14.4], [3.2, 16]] as const) {
      expect(Math.round((12.8 + gi) * 10) / 10).toBe(sym)
    }
    expect(std).toContain('13.6、14.4、16 µs')
    expect(implRow('前导码部分的时长').standard).toContain(`${(36 + 6.4 + 0.8).toFixed(1)} µs`)
  })
})

describe('airtime · ② says what the engine does, and the engine does it', () => {
  // 2026-11-11 (W6): the preamble, the symbol count, the packet extension and the quadruple
  // tier follow Table 27-13 / §27.3.12.5.2 / Table 27-47 now; the rows below pin that.
  it('the HE preamble is the fields added up: 43.2 µs, more HE-LTFs with more streams', () => {
    expect(implRow('前导码部分的时长').kind).toBe('faithful')
    expect(PHY_MODES.he.preambleNs).toBe(43_200)
    expect(preambleNsFor('he')).toBe(36_000 + 6_400 + 800)
    expect(implRow('前导码部分的时长').sim).toContain(`${(PHY_MODES.he.preambleNs / US).toFixed(1)} µs`)
    // Table 21-13: two streams two HE-LTFs, three or four streams four.
    expect([1, 2, 3, 4].map((n) => preambleNsFor('he', TGI_NS.base, { nss: n }))).toEqual([43_200, 50_400, 64_800, 64_800])
  })

  it('the packet extension is Table 27-47 at the stated 16 µs nominal padding: 4a µs', () => {
    expect(implRow('包扩展').kind).toBe('value')
    expect(implRow('包扩展').sim).toContain('16 µs 的名义填充')
    const t = ppduTiming('he', 1430, 11)
    expect([t.a, t.peNs]).toEqual([4, 16_000])
    expect(PE_US * US).toBe(t.peNs)
  })

  it('the symbol is Table 27-13’s, at all three guard intervals', () => {
    expect(implRow('数据符号的时长').kind).toBe('faithful')
    expect([TGI_NS.base, TGI_NS.double, TGI_NS.quad].map((g) => symNsFor('he', g))).toEqual([13_600, 14_400, 16_000])
  })

  it('the symbol count is §27.3.12.5.2’s LDPC count on MCS 11, BCC’s where BCC is allowed', () => {
    expect(implRow('数据符号的个数').kind).toBe('faithful')
    for (const len of [14, 300, 715, 1430, 3000]) expect(ppduTiming('he', len, 11).coding).toBe('ldpc')
    expect(ppduTiming('he', 1430, 9).coding).toBe('bcc')
    // N_SYM,init = ⌈(8·L + 16) / N_DBPS⌉ with no tail bits, and no LDPC extra symbol segment here
    expect(ppduTiming('he', 1430, 11).nsym).toBe(Math.ceil((8 * 1430 + 16) / PHY_MODES.he.ndbps[11]!))
  })

  it('the quadruple tier is 36 + 16 = 52.0 µs, as Table 27-13 adds it', () => {
    expect(implRow('四倍保护间隔的前导码部分').kind).toBe('faithful')
    expect(preambleNsFor('he', TGI_NS.quad)).toBe(52_000)
    expect(implRow('四倍保护间隔的前导码部分').sim).toContain('52.0 µs')
    expect(implRow('四倍保护间隔的前导码部分').standard).toContain(`${(36 + 12.8 + 3.2).toFixed(1)} µs`)
  })

  // 2026-11-11 (W7a): an HE PSDU is always an A-MPDU (§9.7.3, §10.12.5); one MPDU goes out as an
  // S-MPDU with a 4-octet delimiter (§10.12.7), the symbols are counted from APEP_LENGTH and the EOF
  // padding fills the last one (§10.12.6). This used to price the bare 1430-octet MPDU.
  // 2026-11-11 (W6 merge): PSDU_LENGTH is Eq 27-153's — LDPC has no tail bits — so 1460, not the
  // BCC 1459 the old count gave.
  it('one MPDU is an S-MPDU: APEP_LENGTH 1434 sets the six symbols, the EOF padding makes 1460', () => {
    const f = txs('data')[0]!.frame
    expect(f.smpdu).toBe(true)
    expect(f.apepBytes).toBe(APEP_BYTES)
    const mpdu = APEP_BYTES - AMPDU_DELIMITER_BYTES
    expect(f.bytes).toBe(ppduTiming('he', APEP_BYTES, 11).psduLength)
    expect(f.txTimeNs).toBe(txTimeModeNs('he', APEP_BYTES, 11))
    const u = decodeFrame(f, { apId: 'ap', isEdca: true }).users[0]!
    expect(u.subframes).toHaveLength(1)
    expect(u.subframes[0]!.eof).toBe(true)
    expect(u.subframes[0]!.mpdu.bytes).toBe(mpdu)
    expect(u.bytes).toBe(f.bytes)
    const sim = implRow('数据符号的个数').sim
    expect(sim).toContain(`字节数照 ① 取 APEP_LENGTH：${mpdu} 字节的 MPDU 加 ${AMPDU_DELIMITER_BYTES} 字节定界符，即 ${APEP_BYTES} 字节，6 个符号；EOF 填充补到式 (27-153) 的 PSDU_LENGTH，即 ${f.bytes} 字节。`)
    for (const c of ['§9.7.3', '§10.12.6', '(27-153)', '§10.12.7', '§10.12.8']) expect(stdText(), c).toContain(c)
    // and that frame is still answered by an Ack (§10.12.8)
    expect(new Set(txs('ack').map((r) => r.frame.kind))).toEqual(new Set(['ack']))
    expect(txs('ba')).toEqual([])
  })

  it('the Ack is 14 octets, at the highest of 6/12/24 not above the reference rate, 54 for MCS 11', () => {
    expect(new Set(txs('ack').map((r) => r.frame.bytes))).toEqual(new Set([14]))
    expect(MANDATORY_MBPS).toEqual([6, 12, 24])
    expect(implRow('确认帧的速率').sim).toContain('6、12、24 Mb/s')
    expect(NONHT_REF_MBPS[11]).toBe(54) // Table 10-10: 1024-QAM 5/6 → 54
    expect(implRow('非 HT 参考速率').sim).toContain('54 Mb/s')
    for (const r of txs('data')) expect(ctrlRespRateForMode(r.frame.mode!, r.frame.mcs!, r.frame.mbps)).toBe(24)
    expect([54, 24, 18, 6].map(ctrlRespRateFor)).toEqual([24, 24, 12, 6])
  })

  it('every answer starts exactly one SIFS after its frame, and no propagation delay separates the two ends', () => {
    const ends = ofType(recs(), 'TX_END').filter((r) => r.frame.kind === 'data')
    for (const a of txs('ack')) expect(a.t - ends.filter((e) => e.t <= a.t).pop()!.t).toBe(SIFS_NS)
    // the receiver's RX_START is the transmitter's TX_START, to the nanosecond
    const starts = new Set(ofType(recs(), 'TX_START').map((r) => `${r.node}@${r.t}`))
    const rx = ofType(recs(), 'RX_START')
    expect(rx.length).toBeGreaterThan(100)
    for (const r of rx) expect(starts.has(`${r.from}@${r.t}`), `${r.node} hears ${r.from} at ${r.t}`).toBe(true)
  })
})

describe('airtime · ③ every figure the labs print is the run', () => {
  it('lab 1: the figure is the run’s four parts, in place and to scale', () => {
    const fig = (lab('一次收发交互的四段').blocks!.find((b) => b.kind === 'diagram') as { spec: TimingSpec }).spec
    expect(fig).toEqual(exchangeTiming())
    const [ap, tv] = fig.lanes
    expect(ap!.spans.map((s) => [s.fromUs, s.toUs])).toEqual([[0, PREAMBLE_US], [PREAMBLE_US, DATA_US - PE_US], [DATA_US - PE_US, DATA_US]])
    expect(tv!.spans.map((s) => [s.fromUs, s.toUs])).toEqual([[DATA_US + SIFS_US, EXCHANGE_US]])
    expect(DATA_US).toBe(txs('data')[0]!.frame.txTimeNs / US)
    expect(ACK_US).toBe(txs('ack')[0]!.frame.txTimeNs / US)
    expect(SIFS_US).toBe(SIFS_NS / US)
    expect(lab('一次收发交互的四段').blocks!.find((b) => b.kind === 'diagram')!).toHaveProperty('caption')
    expect((lab('一次收发交互的四段').blocks!.find((b) => b.kind === 'diagram') as { caption: string }).caption)
      .toContain(`${SIFS_US} µs`)
  })

  it('lab 1: every cell of the exchange table', () => {
    const rows = tableOf(lab('一次收发交互的四段'), '这个房间里的一次交互').rows
    const data = txs('data')[0]!.frame
    const ack = txs('ack')[0]!.frame
    const t = ppduTiming(data.mode!, data.apepBytes!, data.mcs!, { widthMhz: data.widthMhz })
    const pre = t.preambleNs / US
    const nsym = t.nsym
    expect(t.totalNs).toBe(data.txTimeNs)
    expect(us(rows[0]![1]!)).toBe(pre)
    expect(rows[1]![0]).toBe(`${nsym} 个数据符号 × ${PHY_MODES.he.symNs / US} µs`)
    expect(us(rows[1]![1]!)).toBe(nsym * PHY_MODES.he.symNs / US)
    expect(us(rows[2]![1]!)).toBe(t.peNs / US)
    expect(rows[2]![2]).toContain(`a = ${t.a}`)
    expect(rows[3]![0]).toBe(`整个数据帧（PSDU ${data.bytes} 字节，第 ${data.mcs} 级）`)
    expect(us(rows[3]![1]!)).toBe(data.txTimeNs / US)
    expect(rows[4]![1]).toBe(`${SIFS_NS / US} µs`)
    expect(rows[5]![0]).toBe(`确认帧（${ack.bytes} 字节，${ack.mbps} Mb/s）`)
    expect(rows[5]![1]).toBe(`${ack.txTimeNs / US} µs`)
    const exchange = (data.txTimeNs + SIFS_NS + ack.txTimeNs) / US
    const fixed = (t.preambleNs + t.peNs + SIFS_NS + ack.txTimeNs) / US
    const payload = nsym * PHY_MODES.he.symNs / US
    expect(us(rows[6]![1]!)).toBe(exchange)
    expect(rows[6]![2]).toBe(`固定开销 ${fixed.toFixed(1)} µs，载荷 ${payload.toFixed(1)} µs`)
    // the frame really is the same one every time
    expect(new Set(txs('data').map((r) => r.frame.txTimeNs))).toEqual(new Set([data.txTimeNs]))
    expect(new Set(txs('data').map((r) => r.frame.bytes))).toEqual(new Set([data.bytes]))
    expect(new Set(txs('data').map((r) => r.frame.apepBytes! - AMPDU_DELIMITER_BYTES))).toEqual(new Set([1430]))
  })

  it('lab 1: the counts, the gap and the payload share in 「你应该看到」', () => {
    const e = lab('一次收发交互的四段').expect
    const data = txs('data')
    const acks = txs('ack')
    expect(e).toContain(`前 100 ms 里有 ${data.length} 个数据帧、${acks.length} 个确认帧`)
    expect(e).toContain(`一个 ${data[0]!.frame.apepBytes! - AMPDU_DELIMITER_BYTES} 字节的 MPDU，PSDU 是 ${data[0]!.frame.bytes} 字节、${data[0]!.frame.txTimeNs / US} µs`)
    expect(e).toContain(`结束后 ${SIFS_NS / US} µs 开始，持续 ${acks[0]!.frame.txTimeNs / US} µs`)
    expect(e).toContain(`${EXCHANGE_US.toFixed(1)} µs 的交互中只有 ${(6 * 13.6).toFixed(1)} µs`)
    expect(lab('一次收发交互的四段').meaning).toContain(`${(PHY_MODES.he.preambleNs / US).toFixed(1)} µs`)
    expect(lab('一次收发交互的四段').meaning).toContain(`包扩展的 ${PE_US} µs`)
  })

  it('lab 2: 24 Mb/s from a 54 Mb/s reference, two symbols, 28 µs', () => {
    const l = lab('确认帧的速率与时长')
    const ack = txs('ack')[0]!.frame
    expect(new Set(txs('ack').map((r) => r.frame.mbps))).toEqual(new Set([ack.mbps]))
    const ndbps = RATES.find((r) => r.mbps === ack.mbps)!.ndbps
    const nsym = Math.ceil((16 + 8 * ack.bytes + 6) / ndbps)
    expect(txTimeNs(ack.bytes, ack.mbps)).toBe(ack.txTimeNs)
    const f = l.blocks!.find((b) => b.kind === 'formula') as { text: string; note: string }
    expect(f.text).toBe(`TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × ${ack.bytes} + 6) ÷ ${ndbps}⌉ = 20 + 4 × ${nsym} = ${ack.txTimeNs / US} µs`)
    expect(f.note).toContain(`${ndbps} 是 ${ack.mbps} Mb/s`)
    expect(l.expect).toContain(`确认帧的速率是 ${ack.mbps} Mb/s`)
    expect(l.expect).toContain(`第 11 级的非 HT 参考速率是 ${NONHT_REF_MBPS[11]} Mb/s`)
    expect(l.expect).toContain(`不超过 ${NONHT_REF_MBPS[11]} Mb/s 的最高一档是 ${ctrlRespRateFor(NONHT_REF_MBPS[11]!)} Mb/s`)
    expect(l.expect).toContain(`${ack.bytes} 字节在 ${ack.mbps} Mb/s 下是 ${nsym} 个符号`)
    expect(l.expect).toContain(`共 ${ack.txTimeNs / US} µs`)
  })

  it('lab 3: 117 frames and 116 answers are 19.7 ms of the first 100 ms', () => {
    const e = lab('空口有多忙').expect
    const busyNs = ofType(recs(), 'TX_START').reduce((a, r) => a + r.frame.txTimeNs, 0)
    expect(e).toContain(`${txs('data').length} 个数据帧与 ${txs('ack').length} 个确认帧共占用 ${(busyNs / MS).toFixed(1)} ms`)
    expect(e).toContain(`前 100 ms 的 ${(busyNs / RUN_NS * 100).toFixed(1)} %`)
  })

  it('lab 4: the three tiers are the PHY’s own, six symbols each', () => {
    const rows = tableOf(lab('加长保护间隔'), '同一帧，三档保护间隔').rows
    const tiers = [TGI_NS.base, TGI_NS.double, TGI_NS.quad]
    expect(rows).toHaveLength(3)
    rows.forEach((row, i) => {
      const gi = tiers[i]!
      expect(row[0]!.startsWith(`${gi / US} µs`)).toBe(true)
      expect(row[1]).toBe(`${symNsFor('he', gi) / US} µs`)
      expect(row[2]).toBe(`${txTimeModeNs('he', APEP_BYTES, 11, { widthMhz: 20, giNs: gi }) / US} µs`)
      expect(row[3]).toBe(`${mcsRateMbps('he', 11, gi)} Mb/s`)
      expect(ppduTiming('he', APEP_BYTES, 11, { widthMhz: 20, giNs: gi }).nsym).toBe(6)
    })
    expect(giNumbers()[0]!.frameUs).toBe(DATA_US)
    // the column heading's length is the run's APEP_LENGTH
    expect(tableOf(lab('加长保护间隔'), '同一帧，三档保护间隔').head[2]).toBe(`这一帧（APEP_LENGTH ${txs('data')[0]!.frame.apepBytes} 字节，6 个符号）`)
    // Table 27-86's three columns for HE-MCS 11, one stream, 242-tone RU
    expect(giNumbers().map((r) => r.mbps)).toEqual([143.4, 135.4, 121.9])
  })

  it('lab 4: 150 ms under each guard interval — same frames, same octets, more air', () => {
    const ppdus = (rs: TLRecord[]) => ofType(rs, 'TX_START').map((r) => r.frame).filter((f) => !f.amp && !f.uwb)
    // 2026-11-11 (W7a): `frame.bytes` of an HE PPDU is PSDU_LENGTH, EOF padding included (§10.12.6);
    // the octets delivered are the MPDUs', so the S-MPDU's delimiter and the padding are taken out.
    const mpduOctets = (f: Extract<TLRecord, { type: 'RX_OK' }>): number =>
      (f.frame.apepBytes ?? f.frame.bytes) - (f.frame.smpdu ? AMPDU_DELIMITER_BYTES : 0)
    const octets = (rs: TLRecord[]) => ofType(rs, 'RX_OK').reduce((s, r) => s + (r.frame.kind === 'data' ? mpduOctets(r) : 0), 0)
    const ms = (rs: TLRecord[]) => (ppdus(rs).reduce((s, f) => s + f.txTimeNs, 0) / MS).toFixed(2)
    const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ')
    const rows = tableOf(lab('加长保护间隔'), '150 ms 内两种保护间隔').rows
    const runs = [airtime.scenario(), airtime.variants![0].scenario()].map((s) => [...new Simulation(s).runUntil(GI_RUN_NS).records])
    runs.forEach((rs, i) => {
      expect(rows[i]![1]).toBe(String(ppdus(rs).length))
      expect(rows[i]![2]).toBe(fmt(octets(rs)))
      expect(rows[i]![3]).toBe(`${ms(rs)} ms`)
    })
    expect(rows.map((r) => r[0])).toEqual(['0.8 µs', '3.2 µs'])
    const he = ppdus(runs[1]!).filter((f) => f.mode === 'he' || f.mode === 'eht')
    expect(he.every((f) => f.giNs === TGI_NS.quad)).toBe(true)
    const e = lab('加长保护间隔').expect
    expect(e).toContain(`都是 6 个符号`)
    expect(e).toContain(`从 ${ms(runs[0]!)} ms 增加到 ${ms(runs[1]!)} ms`)
  })
})
