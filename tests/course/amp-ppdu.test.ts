/**
 * `@amp-ppdu`, in the standard-first shape (2026-11-11).
 *
 * ① cites the TGbp motions and the PDT clause each format rule comes from; ② says what the engine
 * does about each, checked against the engine's exports and the frames it puts on the air here;
 * every figure the labs print is read back out of the lesson's own text and compared with a run.
 * The lesson loads amp-intro's scene, so its recorded timeline hashes are amp-intro's.
 */
import { describe, expect, it } from 'vitest'
import { ampPpdu } from '../../src/course/amp/amp-ppdu'
import { ampIntroScenario } from '../../src/course/amp/amp-intro'
import { ScenarioSchema, ampApRefusals, DEFAULT_AMP_AP } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  AMP_ACK_BYTES, AMP_DL_SIG_BYTES, AMP_DL_SYNC_NS, AMP_FCS_BYTES, AMP_HDR_BYTES, AMP_LEGACY_PREAMBLE_NS,
  AMP_PADDING_NS, AMP_PADDING_PROTECTED_NS, AMP_READING_BYTES, AMP_TRIGGER_BODY_BYTES, AMP_UL_CHIP_NS,
  AMP_UL_SYNC_CHIPS, ampBitsNs, ampRespBytes, ampTriggerBytes,
} from '../../src/engine/amp'
import { ERP_2G } from '../../src/engine/phy'
import { decodeFrame, ppduLayout } from '../../src/model/frameFields'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS
const CTX = { apId: 'ap', isEdca: false }

const recs = (variant?: number): TLRecord[] => runOf(ampPpdu, variant, RUN_NS)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const us = (cell: string): number => Number(/^(\d+) µs$/.exec(cell)![1])

const lab = (heading: string): Lab => {
  const l = ampPpdu.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = ampPpdu.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(ampPpdu, { runNs: RUN_NS, sameSceneAs: 'amp-intro' })

describe('amp-ppdu · the lesson', () => {
  it('is in the standard-first shape, after amp-intro, on amp-intro\'s scene', () => {
    expect(isStandardFirst(ampPpdu)).toBe(true)
    expect(MODULES[ampPpdu.module].title).toBe('环境能量物联网（802.11bp）')
    expect(ampPpdu.needs).toEqual(['amp-intro'])
    expect(ampPpdu.limits).toEqual([])
    expect(ampPpdu.observe).toEqual([])
    expect(ampPpdu.tryThis).toEqual([])
    expect(ampPpdu.scenario()).toEqual(ampIntroScenario({ dlKbps: 250, ulKbps: 250 }))
    expect(ampPpdu.variants!.map((v) => v.scenario())).toEqual([ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 })])
    for (const v of ampPpdu.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('① names the motion behind every format rule, and the PDT clause behind the padding', () => {
    const std = ampPpdu.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const ref of ['11-24/1613r20', '11-26/1519r5', '11-25/1692r50', '§39.3.2.2', '表 18-5',
      '#28', '#86', '#131', '#148', '#90', '#91', '#130', '#162', '#149', '#208', '#251', '#177', '#9', '#10',
      '#41', '#16', '#77', '#252', '#253', '#238', '#11', '#128', '#85', '#127', '#175', '#116', '#117',
      '#119', '#120', '#121', '#123', '#188', '#258']) {
      expect(std, ref).toContain(ref)
    }
    expect(std).not.toContain('本仿真器')
  })
})

describe('amp-ppdu · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('the Wi-Fi part is 32 µs, cut 16 / 4 / 12 the way ② says', () => {
    const strip = ppduLayout(txs(rs, 'ampTrigger')[0].frame)
    expect(strip.slice(0, 3).map((s) => [s.key, s.durNs / US])).toEqual([['legacyPreamble', 16], ['signal', 4], ['usig', 12]])
    expect(AMP_LEGACY_PREAMBLE_NS).toBe(32 * US)
    expect(implRow('Wi-Fi 部分').sim).toBe('按 32 µs 计：L-STF 与 L-LTF 16 µs，L-SIG 4 µs，RL-SIG 与 U-SIG 12 µs。')
  })

  it('only a Wi-Fi 7 access point may poll', () => {
    expect(implRow('只允许 Wi-Fi 7 接入点轮询').kind).toBe('choice')
    const ap = ampPpdu.scenario().nodes[0]
    expect(ap.caps.generation).toBe('eht')
    expect(ampApRefusals({ ...ap, ampAp: DEFAULT_AMP_AP })).toEqual([])
    for (const g of ['he', 'uhr'] as const) {
      expect(ampApRefusals({ ...ap, caps: { ...ap.caps, generation: g }, ampAp: DEFAULT_AMP_AP }).length, g).toBe(1)
    }
  })

  it('AMP-Sync 80 µs at both rates; AMP-SIG two octets at the data rate; 4 µs or 1 µs a bit', () => {
    expect(AMP_DL_SYNC_NS).toBe((32 + 8) * 2 * US)
    expect(AMP_DL_SIG_BYTES).toBe(2)
    expect(ampBitsNs(16, 250)).toBe(64 * US)
    expect(ampBitsNs(16, 1000)).toBe(16 * US)
    expect(implRow('AMP-SIG').sim).toContain('250 kb/s 下 64 µs，1 Mb/s 下 16 µs')
    expect(ampBitsNs(1, 250)).toBe(4 * US)
    expect(ampBitsNs(1, 1000)).toBe(1 * US)
    for (const v of [undefined, 0]) {
      const s = ppduLayout(txs(recs(v), 'ampTrigger')[0].frame)
      expect(s.find((x) => x.key === 'ampSync')!.durNs).toBe(80 * US)
    }
  })

  it('padding 20 µs unprotected, 36 µs protected, and every frame here is unprotected', () => {
    expect(AMP_PADDING_NS).toBe(20 * US)
    expect(AMP_PADDING_PROTECTED_NS).toBe(36 * US)
    const dl = ofType(rs, 'TX_START').filter((r) => r.frame.amp?.dir === 'dl')
    expect(dl.length).toBe(50)
    for (const r of dl) expect(r.frame.amp!.padNs).toBe(AMP_PADDING_NS)
  })

  it('a 6 µs signal extension follows every downlink AMP PPDU, and no uplink one (choice)', () => {
    expect(implRow('信号扩展').kind).toBe('choice')
    expect(ERP_2G.signalExtNs).toBe(6 * US)
    for (const kind of ['ampTrigger', 'ampAck']) {
      expect(ppduLayout(txs(rs, kind)[0].frame).pop()!).toEqual({ key: 'signalExt', durNs: 6 * US })
    }
    expect(ppduLayout(txs(rs, 'ampResp')[0].frame).map((s) => s.key)).toEqual(['ampSync', 'ampData'])
  })

  it('the header, the trigger body, the Ack and the reading are the widths ② prints', () => {
    expect(AMP_HDR_BYTES).toBe(1 + 2 + 2)
    expect(AMP_FCS_BYTES).toBe(2)
    expect(implRow('帧头宽度').sim).toBe('帧控制 1 字节、ID 2 字节、类型相关控制 2 字节、CRC 2 字节。')
    expect(AMP_TRIGGER_BODY_BYTES).toBe(6)
    expect(implRow('触发帧帧体').sim).toContain(`${AMP_TRIGGER_BODY_BYTES} 个字节`)
    const body = decodeFrame(txs(rs, 'ampTrigger')[0].frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'body')!
    expect(body.bytes).toBe(AMP_TRIGGER_BODY_BYTES)
    expect(AMP_ACK_BYTES).toBe(1 + 2 + 1)
    expect(AMP_READING_BYTES).toBe(8)
    expect(implRow('读数').sim).toContain(`带读数的作答 ${ampRespBytes(true)} 个字节，只报身份的作答 ${ampRespBytes(false)} 个字节`)
  })

  it('the uplink AMP-Sync is 48 chips: 48 µs at 250 kb/s, 12 µs at 1 Mb/s', () => {
    expect(AMP_UL_SYNC_CHIPS).toBe(48)
    expect(implRow('上行 PPDU').sim).toContain(`250 kb/s 下 ${AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[250] / US} µs、1 Mb/s 下 ${AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[1000] / US} µs`)
    for (const v of [undefined, 0]) {
      const r = txs(recs(v), 'ampResp')[0]
      expect(ppduLayout(r.frame)[0].durNs).toBe(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[r.frame.amp!.kbps as 250 | 1000])
    }
  })
})

describe('amp-ppdu · ③ every figure the labs print is the run', () => {
  const rs = recs()

  it('lab 1: the trigger\'s strip, segment by segment, and its sum', () => {
    const rows = tableOf(lab('打开一帧触发帧'), '250 kb/s 触发帧的各段').rows
    const trig = txs(rs, 'ampTrigger')[0]
    const strip = decodeFrame(trig.frame, CTX).ppdu
    expect(rows.map((r) => us(r[1]))).toEqual(strip.map((s) => s.durNs / US))
    expect(rows[5][0]).toBe(`触发帧，${trig.frame.bytes} 个字节`)
    expect(rows[4][0]).toBe(`AMP-SIG，${AMP_DL_SIG_BYTES} 个字节`)
    const e = lab('打开一帧触发帧').expect
    const m = /各段相加 ([\d +]+) = (\d+) µs；.*其余 (\d+) µs 与速率无关/.exec(e)!
    expect(m[1].split(' + ').map(Number)).toEqual([AMP_LEGACY_PREAMBLE_NS / US, ...strip.slice(3).map((s) => s.durNs / US)])
    expect(strip.slice(0, 3).reduce((n, s) => n + s.durNs, 0)).toBe(AMP_LEGACY_PREAMBLE_NS)
    expect(Number(m[2])).toBe(trig.frame.txTimeNs / US)
    // what does not move with the rate: everything but AMP-SIG and the data, measured at 1 Mb/s
    const fast = decodeFrame(txs(recs(0), 'ampTrigger')[0].frame, CTX).ppdu
    const fixed = fast.filter((s) => s.key !== 'ampSig' && s.key !== 'ampData').reduce((n, s) => n + s.durNs, 0)
    expect(Number(m[3])).toBe(fixed / US)
    expect(strip.filter((s) => s.key !== 'ampSig' && s.key !== 'ampData').reduce((n, s) => n + s.durNs, 0)).toBe(fixed)
  })

  it('lab 2: three frames, their octets and their airtime at both rates', () => {
    const rows = tableOf(lab('三种 AMP 帧，两种速率'), '三种 AMP 帧的空口时间').rows
    const kinds = ['ampTrigger', 'ampAck', 'ampResp']
    for (const [i, kind] of kinds.entries()) {
      const slow = txs(recs(), kind)[0].frame, fast = txs(recs(0), kind)[0].frame
      expect(rows[i][1]).toBe(String(slow.bytes))
      expect(fast.bytes).toBe(slow.bytes)
      expect(us(rows[i][2])).toBe(slow.txTimeNs / US)
      expect(us(rows[i][3])).toBe(fast.txTimeNs / US)
    }
    expect(ampTriggerBytes(0)).toBe(13)
    const e = lab('三种 AMP 帧，两种速率').expect
    const m = /（(\d+) µs 变为 (\d+) µs）.*触发帧只从 (\d+) µs 缩短到 (\d+) µs。1 Mb\/s 下整轮长 (\d+) µs/.exec(e)!
    expect([Number(m[1]), Number(m[2])]).toEqual([txs(recs(), 'ampResp')[0].frame.txTimeNs / US, txs(recs(0), 'ampResp')[0].frame.txTimeNs / US])
    expect(Number(m[1]) / Number(m[2])).toBe(4)
    expect([Number(m[3]), Number(m[4])]).toEqual([txs(recs(), 'ampTrigger')[0].frame.txTimeNs / US, txs(recs(0), 'ampTrigger')[0].frame.txTimeNs / US])
    const fast = recs(0)
    const round = ends(fast, 'ampAck').filter((r) => r.t < 5 * MS).pop()!.t - txs(fast, 'cts')[0].t
    expect(Number(m[5])).toBe(round / US)
  })

  it('lab 3: the Ack\'s 330 µs, split into its four octets and the rest', () => {
    const f = (lab('四个字节的 Ack').blocks ?? []).find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    const toTag = txs(rs, 'ampAck')[0]
    const strip = decodeFrame(toTag.frame, CTX).ppdu
    const m = /250 kb\/s 下的 (\d) 个字节 = (\d+) µs \+ (\d+) µs 与内容无关的部分 = (\d+) µs/.exec(f.text)!
    expect(Number(m[1])).toBe(toTag.frame.bytes)
    const data = strip.find((s) => s.key === 'ampData')!.durNs / US
    expect(Number(m[2])).toBe(data)
    expect(Number(m[4])).toBe(toTag.frame.txTimeNs / US)
    expect(Number(m[3])).toBe(Number(m[4]) - data)
    // the note's five parts, each a segment of the strip
    const parts = [...f.note!.matchAll(/(\d+) µs/g)].map((x) => Number(x[1]))
    const wrapper = strip.filter((s) => s.key !== 'ampData')
    expect(parts).toEqual([AMP_LEGACY_PREAMBLE_NS / US, ...wrapper.slice(3).map((s) => s.durNs / US)])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(Number(m[3]))
  })

  it('lab 3: the two Acks, their ID fields, and the CTS-to-self beside them', () => {
    const e = lab('四个字节的 Ack').expect
    const toTag = txs(rs, 'ampAck')[0]
    const empty = txs(rs, 'ampAck').find((r) => r.frame.dst === r.frame.src)!
    const id = (r: typeof toTag) => decodeFrame(r.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ampId')!
    const m = /第一帧 Ack 在 (\d+) µs 发出，ID 字段 (\d) 个字节，写的是 Door tag；空时隙之后那一帧同样 (\d+) µs、同样 (\d) 个字节/.exec(e)!
    expect(Number(m[1])).toBe(toTag.t / US)
    expect(Number(m[2])).toBe(id(toTag).bytes)
    expect(id(toTag).node).toBe('tag-2')
    expect(Number(m[3])).toBe(empty.frame.txTimeNs / US)
    expect(Number(m[4])).toBe(empty.frame.bytes)
    expect(id(empty).node).toBe('ap')
    const cts = txs(rs, 'cts')[0]
    const c = /(\d+) 个字节的 CTS-to-self（CTS to self）只用 (\d+) µs/.exec(e)!
    expect([Number(c[1]), Number(c[2])]).toEqual([cts.frame.bytes, cts.frame.txTimeNs / US])
  })

  it('the why\'s own figures', () => {
    const w = ampPpdu.why!
    const toTag = txs(rs, 'ampAck')[0]
    expect(w).toContain(`下行 AMP-Sync 40 个 2 µs 的码片（chip），共 ${AMP_DL_SYNC_NS / US} µs；上行 AMP-Sync ${AMP_UL_SYNC_CHIPS} 个码片`)
    expect(w).toContain(`填充 ${AMP_PADDING_NS / US} µs，加密的触发帧填充 ${AMP_PADDING_PROTECTED_NS / US} µs`)
    expect(w).toContain(`另加 2.4 GHz 的 ${ERP_2G.signalExtNs / US} µs 信号扩展`)
    const data = decodeFrame(toTag.frame, CTX).ppdu.find((s) => s.key === 'ampData')!.durNs
    expect(w).toContain(`也长 ${toTag.frame.txTimeNs / US} µs，其中 ${(toTag.frame.txTimeNs - data) / US} µs 与内容无关`)
  })
})
