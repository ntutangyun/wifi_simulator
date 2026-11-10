/**
 * `@frame-anatomy-bytes`, in the standard-first shape (2026-11-10).
 *
 * ① is IEEE Std 802.11-2024 clause 17 — the non-HT PPDU, what L-STF, L-LTF and L-SIG are for,
 * TXTIME (equation 17-29) in six steps — and what later PHYs keep in front (table 27-13, §27.4.3,
 * 802.11be-2024 §36.3.12.7). ② says row by row what this simulator does, and each row is checked
 * against the engine here. ③ is three runs, and every figure they print is read back out of the
 * lesson and compared with a run or with the engine's own `txTimeNs` / `txTimeModeNs`. The last
 * block sweeps every figure in every string a reader reads.
 */
import { describe, it, expect } from 'vitest'
import {
  frameAnatomyBytes, preambleTiming, LEGACY_FRAME_US, HE_FRAME_US,
} from '../../src/course/tier1/frame-anatomy-bytes'
import { frameAnatomyScenario, firstLegacyData, firstQosSingle } from '../../src/course/tier1/frame-anatomy'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TimingSpec } from '../../src/course/diagram'
import { readerTexts } from '../../src/course/readability'
import { ScenarioSchema } from '../../src/model/scenario'
import { decodeFrame, ppduLayout, type Mpdu } from '../../src/model/frameFields'
import { hasFeature } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import { psduLengthFor } from '../../src/model/frames'
import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, FCS_BYTES, MAC_HDR_BYTES, PHY_MODES, QOS_HDR_BYTES, TGI_NS, symNsFor, txTimeModeNs, txTimeNs,
} from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
type Tx = Extract<TLRecord, { type: 'TX_START' }>

const records = runOf(frameAnatomyBytes, undefined, RUN_NS)
const txs = ofType(records, 'TX_START')
const legacy = records.find(firstLegacyData) as Tx
const qos = records.find(firstQosSingle) as Tx
const ack = txs.find((r) => r.frame.kind === 'ack' && r.frame.dst === 'sta-1')!
function decode(f: Tx['frame']): Mpdu {
  const sc = frameAnatomyScenario()
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  const src = sc.nodes.find((n) => n.id === f.src) ?? ap
  return decodeFrame(f, { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') }).users[0].subframes[0].mpdu
}
const bodyOf = (m: Mpdu): number => m.fields.find((x) => x.key === 'body')!.bytes
const hdrOf = (m: Mpdu): number => (m.fields.some((x) => x.key === 'qos') ? QOS_HDR_BYTES : MAC_HDR_BYTES)
const NONHT = PHY_MODES.nonht
const ndbpsOf = (mbps: number): number => NONHT.ndbps[NONHT.mbps.indexOf(mbps)]
/** 「12 246」: the lesson groups thousands with a space. */
const grouped = (n: number): string => (n >= 10_000 ? n.toLocaleString('en-US').replace(/,/g, ' ') : String(n))
const bits = (len: number): number => 16 + 8 * len + 6

const lab = (heading: string): Lab => {
  const l = frameAnatomyBytes.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = frameAnatomyBytes.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => frameAnatomyBytes.standard!.map((b) => JSON.stringify(b)).join(' ')

lessonShapeSuite(frameAnatomyBytes, { runNs: RUN_NS, sameSceneAs: 'frame-anatomy' })

describe('frame-anatomy-bytes · the lesson', () => {
  it('is in the standard-first shape, third in the frames module', () => {
    expect(isStandardFirst(frameAnatomyBytes)).toBe(true)
    expect(MODULES[frameAnatomyBytes.module].title).toBe('帧与空口时间')
    expect(frameAnatomyBytes.needs).toEqual(['frame-anatomy'])
    expect(frameAnatomyBytes.terms!.map((t) => t.term)).toEqual(['L-STF', 'L-LTF', 'L-SIG', 'preamble', 'U-SIG'])
    expect(frameAnatomyBytes.limits).toEqual([])
    expect(frameAnatomyBytes.observe).toEqual([])
    expect(frameAnatomyBytes.tryThis).toEqual([])
    expect(frameAnatomyBytes.scenario()).toEqual(frameAnatomyScenario())
    expect(frameAnatomyBytes.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(frameAnatomyBytes.scenario())).not.toThrow()
    for (const q of frameAnatomyBytes.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })

  it('cites each clause it teaches in ①, and only the standard is there', () => {
    const std = stdText()
    for (const c of ['§17.3.2.1', '§17.3.2.2', '图 17-1', '表 17-5', '§17.4.3', '式 17-29', '表 17-4', '§17.3.5.4',
      '表 27-13', '§27.4.3', '§36.3.12.7', '图 9-2']) expect(std, c).toContain(c)
    expect(std).not.toContain('本仿真器')
  })

  it('① prints the standard\'s clause 17 numbers, and the engine holds the same ones', () => {
    const std = stdText()
    // T_PREAMBLE 16 µs = 8 + 8, T_SIGNAL 4 µs, T_SYM 4 µs; the engine's front is 16 + 4
    expect(std).toContain('T_PREAMBLE = 16 µs')
    expect(std).toContain('共 8 µs')
    expect(NONHT.preambleNs).toBe(16_000 + 4_000)
    expect(NONHT.symNs).toBe(4_000)
    expect(ppduLayout(legacy.frame).slice(0, 2).map((s) => s.durNs)).toEqual([16_000, 4_000])
    // N_DBPS of table 17-4, as printed in the formula's note
    const note = (frameAnatomyBytes.standard!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>).note!
    expect(note).toContain(`54 Mb/s 为 ${ndbpsOf(54)}，24 Mb/s 为 ${ndbpsOf(24)}`)
    // HE: the three data symbols of table 27-13 and the three legacy fields 8 / 8 / 4 µs
    expect(std).toContain(`${symNsFor('he', TGI_NS.base) / US} µs，在 1.6 µs 与 3.2 µs 的保护间隔下是 ${symNsFor('he', TGI_NS.double) / US} µs 与 ${symNsFor('he', TGI_NS.quad) / US} µs`)
    expect([TGI_NS.double, TGI_NS.quad].map((g) => g / US)).toEqual([1.6, 3.2])
    expect(std).toContain('8 µs 的 L-STF、8 µs 的 L-LTF 与 4 µs 的 L-SIG')
  })

  it('① keeps six steps: `airtime` cites them by count', () => {
    const steps = frameAnatomyBytes.standard!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items).toHaveLength(6)
  })
})

describe('frame-anatomy-bytes · ② says what the engine does, and the engine does it', () => {
  it('a non-HT frame is equation 17-29 exactly, with table 17-4\'s N_DBPS', () => {
    expect(implRow('非 HT 帧的时长').kind).toBe('faithful')
    expect(implRow('N_DBPS').kind).toBe('faithful')
    for (const r of txs.filter((x) => (x.frame.mode ?? 'nonht') === 'nonht')) {
      expect(r.frame.txTimeNs).toBe(16_000 + 4_000 + 4_000 * Math.ceil(bits(r.frame.bytes) / ndbpsOf(r.frame.mbps)))
      expect(txTimeNs(r.frame.bytes, r.frame.mbps)).toBe(r.frame.txTimeNs)
    }
    expect(implRow('N_DBPS').sim).toContain(`54 Mb/s 为 ${ndbpsOf(54)}，24 Mb/s 为 ${ndbpsOf(24)}`)
  })

  it('HE: 13.6 µs symbols, one representative preamble per generation, no packet extension', () => {
    expect(implRow('HE 的数据符号').kind).toBe('faithful')
    expect(implRow('HE 的数据符号').sim).toContain(`${PHY_MODES.he.symNs / US} µs`)
    expect(implRow('新一代的前导码').kind).toBe('value')
    const [vht, he, eht, mu] = (implRow('新一代的前导码').sim.match(/\d+(?= µs)/g) ?? []).map(Number)
    expect([vht, he, eht, mu].map((x) => x * US)).toEqual([PHY_MODES.vht.preambleNs, PHY_MODES.he.preambleNs, PHY_MODES.eht.preambleNs, PHY_MODES.he.muExtraPreambleNs])
    expect(PHY_MODES.eht.muExtraPreambleNs).toBe(PHY_MODES.he.muExtraPreambleNs)
    // the same preamble at one or two spatial streams
    expect(txTimeModeNs('he', 1430, 11, { nss: 2 }) - txTimeModeNs('he', 1430, 11, { nss: 1 }))
      .toBe(PHY_MODES.he.symNs * (Math.ceil(bits(1430) / (2 * PHY_MODES.he.ndbps[11])) - Math.ceil(bits(1430) / PHY_MODES.he.ndbps[11])))
    expect(implRow('包扩展').kind).toBe('absent')
    // 2026-11-11 (W7a): the HE frame is an S-MPDU (§9.7.3, §10.12.7); the symbols are counted from
    // APEP_LENGTH, and `frame.bytes` is the PSDU after EOF padding (§10.12.6).
    expect(qos.frame.smpdu).toBe(true)
    expect(qos.frame.apepBytes).toBe(AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + 200 + FCS_BYTES)
    expect(qos.frame.bytes).toBe(psduLengthFor(qos.frame.apepBytes!, PHY_MODES.he.ndbps[qos.frame.mcs!]))
    expect(qos.frame.txTimeNs).toBe(PHY_MODES.he.preambleNs + PHY_MODES.he.symNs * Math.ceil(bits(qos.frame.apepBytes!) / PHY_MODES.he.ndbps[qos.frame.mcs!]))
    expect(implRow('HE 的符号数').kind).toBe('differs')
    expect(implRow('HE 的符号数').sim).toContain(`LENGTH 取 APEP_LENGTH`)
    expect(implRow('HE 的符号数').sim).toContain(`${AMPDU_DELIMITER_BYTES} B 定界符`)
  })

  it('the payloads are the scene\'s: 1500 B for the old laptop, 200 B for the phone', () => {
    expect(implRow('载荷大小').kind).toBe('value')
    const [old, phone] = (implRow('载荷大小').sim.match(/\d+(?= B)/g) ?? []).map(Number)
    const arr = ofType(records, 'ARRIVAL')
    expect(new Set(arr.filter((r) => r.node === 'sta-1').map((r) => r.bytes))).toEqual(new Set([old]))
    expect(new Set(arr.filter((r) => r.node === 'sta-2').map((r) => r.bytes))).toEqual(new Set([phone]))
  })
})

describe('frame-anatomy-bytes · ③ every figure the labs print is the run', () => {
  /** A worked table, row by row, for one frame of the run. */
  function workedRows(f: Tx['frame'], ndbps: number) {
    const m = decode(f)
    const nsym = Math.ceil(bits(f.bytes) / ndbps)
    return { m, nsym, len: `${hdrOf(m)} + ${bodyOf(m)} + ${FCS_BYTES} = ${f.bytes}`, bits: `16 + 8 × ${f.bytes} + 6 = ${grouped(bits(f.bytes))}` }
  }

  it('lab 1: the old laptop\'s frame through the six steps, cell by cell', () => {
    const rows = tableOf(lab('旧笔记本的一帧：248 µs').blocks!, '旧笔记本第一帧的计算').rows
    const w = workedRows(legacy.frame, ndbpsOf(legacy.frame.mbps))
    expect(rows.map((r) => r[1])).toEqual([
      w.len, w.bits, String(ndbpsOf(legacy.frame.mbps)), String(w.nsym), `16 + 4 + ${w.nsym} × 4 = ${legacy.frame.txTimeNs / US} µs`,
    ])
    expect(rows[2][0]).toBe(`${legacy.frame.mbps} Mb/s 的 N_DBPS`)
    expect(lab('旧笔记本的一帧：248 µs').heading).toContain(`${legacy.frame.txTimeNs / US} µs`)
    const ex = lab('旧笔记本的一帧：248 µs').expect
    expect(ex).toBe(`色块长 ${legacy.frame.txTimeNs / US} µs：前 ${NONHT.preambleNs / US} µs 是前导码与 SIGNAL，其余是 ${w.nsym} 个 ${NONHT.symNs / US} µs 的符号。`)
  })

  it('lab 1: the figure is the run, and so is its caption', () => {
    const d = lab('旧笔记本的一帧：248 µs').blocks!.find((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')!
    expect(d.spec).toEqual(preambleTiming())
    const spec = d.spec as TimingSpec
    const [a, he] = spec.lanes
    expect(LEGACY_FRAME_US * US).toBe(legacy.frame.txTimeNs)
    expect(HE_FRAME_US * US).toBe(qos.frame.txTimeNs)
    expect(a.spans[0].toUs * US).toBe(NONHT.preambleNs)
    expect((a.spans[1].toUs - a.spans[1].fromUs) * US / NONHT.symNs).toBe(Math.ceil(bits(legacy.frame.bytes) / ndbpsOf(legacy.frame.mbps)))
    expect(he.spans[0].toUs * US).toBe(PHY_MODES.he.preambleNs)
    expect(he.spans[1].toUs - he.spans[1].fromUs).toBeCloseTo(PHY_MODES.he.symNs / US, 9)
    expect(spec.axis.toUs).toBe(LEGACY_FRAME_US)
    expect(d.caption).toBe(`上面是旧笔记本 ${legacy.frame.bytes} B 的一帧：${NONHT.preambleNs / US} µs 的前导码与 SIGNAL，后面 ${(a.spans[1].toUs - a.spans[1].fromUs) * US / NONHT.symNs} 个符号。下面是手机装着 ${decode(qos.frame).bytes} B MPDU 的一帧：本仿真器取 ${PHY_MODES.he.preambleNs / US} µs 的前导码，后面只有一个 ${PHY_MODES.he.symNs / US} µs 的符号。`)
  })

  it('lab 2: the phone\'s Wi-Fi 6 frame, cell by cell', () => {
    const rows = tableOf(lab('手机的一帧：大部分是前导码').blocks!, '手机第一帧的计算').rows
    // 2026-11-11 (W7a): an S-MPDU — the worked LENGTH is APEP_LENGTH, delimiter first (§10.12.6).
    const ndbps = PHY_MODES.he.ndbps[qos.frame.mcs!]
    const m = decode(qos.frame)
    const apep = qos.frame.apepBytes!
    const nsym = Math.ceil(bits(apep) / ndbps)
    expect(qos.frame.mode).toBe('he')
    expect(rows[0][0]).toBe('APEP_LENGTH（八位组）')
    expect(rows[2][0]).toBe(`HE MCS ${qos.frame.mcs} 的 N_DBPS`)
    expect(rows.map((r) => r[1])).toEqual([
      `${AMPDU_DELIMITER_BYTES} + ${hdrOf(m)} + ${bodyOf(m)} + ${FCS_BYTES} = ${apep}`, `16 + 8 × ${apep} + 6 = ${grouped(bits(apep))}`,
      String(ndbps), String(nsym),
      `${PHY_MODES.he.preambleNs / US} + ${nsym} × ${PHY_MODES.he.symNs / US} = ${qos.frame.txTimeNs / US} µs`,
      String(qos.frame.bytes),
    ])
    expect(ppduLayout(qos.frame)[0].durNs).toBe(PHY_MODES.he.preambleNs)
    expect(lab('手机的一帧：大部分是前导码').expect)
      .toBe(`${qos.frame.txTimeNs / US} µs 中有 ${PHY_MODES.he.preambleNs / US} µs 是前导码，载荷只占一个符号；这个符号余下的位置由 EOF 填充补满，PSDU 共 ${qos.frame.bytes} B。`)
    expect(lab('手机的一帧：大部分是前导码').meaning).toContain(`${PHY_MODES.he.symNs / US} µs`)
    expect(lab('手机的一帧：大部分是前导码').meaning).toContain(`${PHY_MODES.he.preambleNs / US} µs`)
  })

  it('lab 3: three frames, and the two bytes that cost nothing', () => {
    const rows = tableOf(lab('帧头多 2 个字节，时长不变').blocks!, '三帧的符号数').rows
    const marked = legacy.frame.bytes + QOS_HDR_BYTES - MAC_HDR_BYTES
    const cases: [number, number, number][] = [
      [legacy.frame.bytes, legacy.frame.mbps, legacy.frame.txTimeNs],
      [marked, legacy.frame.mbps, txTimeNs(marked, legacy.frame.mbps)],
      [ack.frame.bytes, ack.frame.mbps, ack.frame.txTimeNs],
    ]
    expect(ack.frame.bytes).toBe(ACK_BYTES)
    expect(rows[2][0]).toBe(`确认帧（${ack.frame.mbps} Mb/s）`)
    rows.forEach((row, i) => {
      const [len, mbps, t] = cases[i]
      const nd = ndbpsOf(mbps)
      expect(row.slice(1), row[0]).toEqual([String(len), grouped(bits(len)), String(nd), String(Math.ceil(bits(len) / nd)), `${t / US} µs`])
      expect(16_000 + 4_000 + 4_000 * Math.ceil(bits(len) / nd)).toBe(t)
    })
    expect(lab('帧头多 2 个字节，时长不变').expect)
      .toBe(`QoS 控制字段的 ${QOS_HDR_BYTES - MAC_HDR_BYTES} 个字节没有多占一个符号，时长仍是 ${legacy.frame.txTimeNs / US} µs；确认帧的 ${ack.frame.txTimeNs / US} µs 中有 ${NONHT.preambleNs / US} µs 是前导码与 SIGNAL。`)
  })

  it('the quiz: 1528 and 1530 B both 57 symbols; 1400 B of payload is 53, four fewer, 16 µs', () => {
    const q2 = frameAnatomyBytes.quiz[1].explain
    const n = (len: number): number => Math.ceil(bits(len) / ndbpsOf(54))
    expect(q2).toContain(`${legacy.frame.bytes} B 与 ${legacy.frame.bytes + 2} B 都向上取整到 ${n(legacy.frame.bytes)} 个符号，都是 ${legacy.frame.txTimeNs / US} µs`)
    const q3 = frameAnatomyBytes.quiz[2]
    const smaller = MAC_HDR_BYTES + 1400 + FCS_BYTES
    expect(q3.q).toContain('从 1500 B 减到 1400 B')
    expect(q3.options[0]).toContain(`${((100 / 1500) * 100).toFixed(1)} %`)
    expect(q3.explain).toContain(`少 100 B 就是少 ${8 * 100} 比特，${legacy.frame.mbps} Mb/s 下一个符号承载 ${ndbpsOf(54)} 比特，所以从 ${n(1528)} 个符号减到 ${n(smaller)} 个，少 ${n(1528) - n(smaller)} 个符号、${(txTimeNs(1528, 54) - txTimeNs(smaller, 54)) / US} µs`)
    expect(q3.explain).toContain(`${NONHT.preambleNs / US} µs 保持不变`)
  })
})

describe('frame-anatomy-bytes · every figure the lesson prints is one this file measured', () => {
  const strip = (s: string): string => s
    .replace(/§[\d.]+/g, '').replace(/[表图式] \d+-\d+/g, '').replace(/第 \d+ 章/g, '')
    .replace(/IEEE( Std)? 802\.11[a-z]*-\d{4}/g, '').replace(/802\.11[a-z]*(-\d{4})?/g, '')
    .replace(/Wi-Fi \d/g, '').replace(/src\/[\w/.]+/g, '').replace(/MCS \d+/g, '')

  it('sweeps every string a reader reads: no figure without a measurement behind it', () => {
    const n57 = Math.ceil(bits(1528) / 216)
    const allowed = new Set<string>([
      // clause 17: fields, durations, bit counts, the 20 MHz spacing, the coding rate
      '10', '2', '8', '16', '4', '12', '6', '20', '1', '1/2',
      String(NONHT.preambleNs / US), String(NONHT.symNs / US), String(ndbpsOf(54)), String(ndbpsOf(24)), '54', '24',
      // the old laptop's frame, its marked twin, the ACK, and the quiz's smaller frame
      String(MAC_HDR_BYTES), String(QOS_HDR_BYTES), String(FCS_BYTES), '1500', String(legacy.frame.bytes), String(legacy.frame.bytes + 2),
      grouped(bits(1528)).replace(' ', ''), '12', '246', '262', String(n57), String(legacy.frame.txTimeNs / US),
      String(ACK_BYTES), String(bits(ACK_BYTES)), String(ack.frame.txTimeNs / US),
      '1400', '100', '800', '53', '6.7',
      // the phone's frame
      '200', String(decode(qos.frame).bytes), String(qos.frame.apepBytes), String(bits(qos.frame.apepBytes!)), String(qos.frame.bytes),
      String(PHY_MODES.he.ndbps[qos.frame.mcs!]),
      String(PHY_MODES.he.preambleNs / US), String(PHY_MODES.he.symNs / US), String(qos.frame.txTimeNs / US),
      // HE guard intervals and symbols; the other generations' representative preambles
      '0.8', '1.6', '3.2', '14.4', String(PHY_MODES.vht.preambleNs / US), String(PHY_MODES.eht.preambleNs / US),
      // the figure's ticks and the subscripts of T_SYM1 and T_PE
      '0', '50', '100', '150', '200', '7',
    ])
    const stray: string[] = []
    for (const s of readerTexts(frameAnatomyBytes)) {
      for (const n of strip(s).match(/\d+(?:[./]\d+)?/g) ?? []) if (!allowed.has(n)) stray.push(`${n} in 「${s.slice(0, 40)}」`)
    }
    expect(stray).toEqual([])
  })
})
