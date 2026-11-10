/**
 * `@rts-cts`, in the standard-first shape (2026-11-11).
 *
 * ① is IEEE Std 802.11-2024's RTS/CTS; ② says what the engine does with each point and is checked
 * here against the engine; ③'s three runs print figures, and every one of them is read back out of
 * the lesson text and compared with a run. The scene is `hidden`'s (`sameSceneAs: 'hidden'`), so
 * the two ids replay the same timeline, base scene and protected variant alike.
 *
 * Carried over from the old shape against the same two runs: the on/off table, the 94 % cut and the
 * sevenfold delivery, the 718 µs worked round (now the first lab's table), the sequence figure, the
 * 25 RTS-against-RTS collisions and the 245 reservations, and the RTS rates the engine picks.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { rtsCts, rtsCtsSequence } from '../../src/course/tier1/rts-cts'
import { hidden } from '../../src/course/tier1/hidden'
import type { TLRecord } from '../../src/model/records'
import { buildLinkTable } from '../../src/engine/propagation'
import {
  CCA_PD_DBM, CTS_BYTES, CTS_TIMEOUT_NS, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, RTS_BYTES, RX_START_DELAY_NS, SIFS_NS, SLOT_NS,
  ctrlRespRateFor, txTimeNs,
} from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { W, layoutDiagram, textBox, type SequenceMessage, type Shape } from '../../src/course/diagram'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
const US = 1_000
/** 300 ms: the window both columns of the on/off table are counted over. */
const RUN_NS = 300 * MS

const base = (): TLRecord[] => runOf(rtsCts, undefined, RUN_NS)
const prot = (): TLRecord[] => runOf(rtsCts, 0, RUN_NS)
const txs = (rs: TLRecord[], p: (r: Tx) => boolean = () => true): Tx[] => ofType(rs, 'TX_START').filter(p)
const acked = (rs: TLRecord[]): number => txs(rs, (r) => r.frame.kind === 'ack').length
const links = () => { const sc = rtsCts.variants![0].scenario(); return buildLinkTable(sc.nodes, sc.walls) }

function collisionFrames(rs: TLRecord[], c: Extract<TLRecord, { type: 'COLLISION' }>): { locked: Tx; others: Tx[] } {
  const all = txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
  const locked = all.filter((r) => r.t + r.frame.txTimeNs === c.t)[0]
  const others = all.filter((r) => r.node !== locked.node && r.t + r.frame.txTimeNs > locked.t)
  return { locked, others }
}
const collisions = (rs: TLRecord[]) => ofType(rs, 'COLLISION').map((c) => collisionFrames(rs, c))
const caughtData = (rs: TLRecord[]) =>
  collisions(rs).filter(({ locked, others }) => [locked, ...others].some((f) => f.frame.kind === 'data'))
const msg = (label: string): SequenceMessage => rtsCtsSequence().messages.find((m) => m.label === label)!

const lab = (heading: string): Lab => {
  const l = rtsCts.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = rtsCts.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const figs = (text: string, re: RegExp, what: string): number[] => {
  const m = re.exec(text)
  expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
  return m!.slice(1).map((x) => Number(x.replace(/[\s,]/g, '').replace(/−/g, '-')))
}
const zhCount = (s: string): number => {
  const n = zhNumeral(s.replace(/两/g, '二'))
  expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
  return n!
}

lessonShapeSuite(rtsCts, { sameSceneAs: 'hidden', runNs: RUN_NS })

describe('rts-cts · the lesson', () => {
  it('is in the standard-first shape, after hidden, and owns RTS and CTS', () => {
    expect(isStandardFirst(rtsCts)).toBe(true)
    expect(MODULES[rtsCts.module].title).toBe('隐藏节点与帧丢失')
    expect(rtsCts.module).toBe(hidden.module)
    expect(rtsCts.needs).toEqual(['hidden'])
    expect(rtsCts.terms!.map((t) => t.term)).toEqual(['RTS', 'CTS', 'RTS threshold'])
    expect(rtsCts.limits).toEqual([])
    expect(rtsCts.observe).toEqual([])
    expect(rtsCts.tryThis).toEqual([])
  })

  it('the scenario and the variant are the first half’s', () => {
    expect(rtsCts.scenario()).toEqual(hidden.scenario())
    expect(rtsCts.variants!.map((v) => v.scenario())).toEqual(hidden.variants!.map((v) => v.scenario()))
  })

  it('cites each clause it teaches in ①, and the frame sizes add up', () => {
    const std = rtsCts.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.3.1', '§10.3.5', '§9.3.1.2', '§9.3.1.3', '§10.3.2.9', '§10.3.2.4', '§10.6.6.2', '§10.6.6.5.2']) {
      expect(std, clause).toContain(clause)
    }
    const parts = figs(std, /共 (\d+) \+ (\d+) \+ (\d+) \+ (\d+) \+ (\d+) = (\d+) 个八位组/, 'the RTS format')
    const total = parts.pop()!
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
    expect(total).toBe(RTS_BYTES)
    const [cts] = figs(std, /CTS 没有发送端地址，共 (\d+) 个八位组/, 'the CTS format')
    expect(total - parts[3]).toBe(cts)
    expect(cts).toBe(CTS_BYTES)
  })

  it('② is not all faithful', () => {
    const kinds = rtsCts.implementation!.map((r) => r.kind)
    expect(kinds).toContain('differs')
    expect(kinds).toContain('absent')
  })
})

describe('rts-cts · ② says what the engine does, and the engine does it', () => {
  it('an RTS precedes a frame exactly when the frame is longer than the threshold', () => {
    const [bytes] = figs(implRow('何时先发 RTS').sim, /本课的数据帧都是 (\d+) 字节/, 'the frame')
    const [hi, lo] = figs(implRow('门限取值').sim, /基准场景 (\d+) 字节.*受保护的变体 (\d+) 字节/, 'the thresholds')
    expect(rtsCts.scenario().rtsThresholdBytes).toBe(hi)
    expect(rtsCts.variants![0].scenario().rtsThresholdBytes).toBe(lo)
    expect(MAC_HDR_BYTES + 1500 + FCS_BYTES).toBe(bytes)
    for (const rs of [base(), prot()]) expect(new Set(txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(txs(base(), (r) => r.frame.kind === 'rts')).toEqual([])
    // every data frame of the protected run follows its own CTS by one SIFS
    const ctsEnds = new Set(txs(prot(), (r) => r.frame.kind === 'cts').map((r) => `${r.frame.dst}@${r.t + r.frame.txTimeNs}`))
    for (const d of txs(prot(), (r) => r.frame.kind === 'data')) expect(ctsEnds.has(`${d.node}@${d.t - SIFS_NS}`), `${d.node} @ ${d.t}`).toBe(true)
  })

  it('RTS is 20 B and reserves the frame, the CTS, the ACK and three SIFS; CTS is 14 B and the rest', () => {
    const rs = prot()
    const rtsAt = new Map(txs(rs, (r) => r.frame.kind === 'rts').map((r) => [r.t + r.frame.txTimeNs, r]))
    let checked = 0
    for (const cts of txs(rs, (r) => r.frame.kind === 'cts')) {
      expect(cts.node).toBe('ap')
      expect(cts.frame.bytes).toBe(CTS_BYTES)
      const rts = rtsAt.get(cts.t - SIFS_NS)!
      expect(rts.frame.bytes).toBe(RTS_BYTES)
      expect(cts.frame.durationFieldNs).toBe(rts.frame.durationFieldNs - SIFS_NS - cts.frame.txTimeNs)
      const data = txs(rs, (r) => r.node === rts.node && r.frame.kind === 'data' && r.t === cts.t + cts.frame.txTimeNs + SIFS_NS)[0]
      const ack = txs(rs, (r) => r.frame.kind === 'ack' && r.t === data.t + data.frame.txTimeNs + SIFS_NS)[0]
      if (ack) {
        expect(rts.frame.durationFieldNs).toBe(3 * SIFS_NS + cts.frame.txTimeNs + data.frame.txTimeNs + ack.frame.txTimeNs)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(300)
  })

  // 2026-11-11 (W7a): this pinned a CTS rule without the TXOP-holder exception. It now pins
  // §10.3.2.9: the NAV "indicates idle" when it is 0 or the RTS comes from the saved TXOP holder.
  it('the access point answers with its NAV idle — zero, or set by the RTS sender itself — and never holds a NAV here', () => {
    expect(implRow('回复 CTS 的条件').kind).toBe('faithful')
    expect(ofType(prot(), 'NAV_SET').some((r) => r.node === 'ap')).toBe(false)
    const mac = readFileSync(resolve(ROOT, 'src/engine/mac.ts'), 'utf8')
    const rtsCase = mac.slice(mac.indexOf("case 'rts': {"), mac.indexOf("case 'cts': {"))
    expect(rtsCase).toContain('if (this.now() < this.navUntil && this.txopHolder !== from) break')
    // every RTS of the protected run that reached the AP whole was answered a SIFS later
    const rx = ofType(prot(), 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'rts')
    const ctsAt = new Set(txs(prot(), (r) => r.frame.kind === 'cts').map((r) => r.t))
    expect(rx.length).toBeGreaterThan(300)
    for (const r of rx) expect(ctsAt.has(r.t + SIFS_NS), `RTS received @ ${r.t}`).toBe(true)
  })

  it('CTSTimeout is 45 µs after the RTS', () => {
    const [to] = figs(implRow('CTS 超时').sim, /(\d+) µs/, 'the CTS timeout')
    expect(CTS_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
    expect(to * US).toBe(CTS_TIMEOUT_NS)
    const lastEnd = new Map<string, number>()
    let n = 0
    for (const r of prot()) {
      if (r.type === 'TX_START') lastEnd.set(r.node, r.t + r.frame.txTimeNs)
      if (r.type === 'CTS_TIMEOUT') { expect(r.t - lastEnd.get(r.node)!).toBe(CTS_TIMEOUT_NS); n++ }
    }
    expect(n).toBeGreaterThan(10)
  })

  it('the RTS-NAV reset is the standard’s formula, and no bystander hears an RTS here', () => {
    const mac = readFileSync(resolve(ROOT, 'src/engine/mac.ts'), 'utf8')
    expect(mac).toContain('2 * this.T.sifsNs + ctsTime + this.T.rxStartDelayNs + 2 * this.T.slotNs')
    expect(ofType(prot(), 'NAV_SET').some((r) => r.source.startsWith('rts'))).toBe(false)
  })

  it('the RTS goes at the highest mandatory rate not above the data frame’s: 24, 12, 6 Mb/s', () => {
    const row = implRow('RTS 的速率')
    expect(row.kind).toBe('choice')
    const [r1, r2, r3, a1, a2, a3] = figs(row.sim, /RTS 用过 (\d+)、(\d+)、(\d+) Mb\/s 三档，空口时间（airtime）分别是 (\d+)、(\d+)、(\d+) µs/, 'the rates')
    const rts = txs(prot(), (r) => r.frame.kind === 'rts')
    expect(new Set(rts.map((r) => r.frame.mbps))).toEqual(new Set([r1, r2, r3]))
    for (const [m, a] of [[r1, a1], [r2, a2], [r3, a3]]) expect(txTimeNs(RTS_BYTES, m), `${m} Mb/s`).toBe(a * US)
    // and each one is the control-response rule applied to the frame it protects
    let checked = 0
    for (const c of txs(prot(), (x) => x.frame.kind === 'cts')) {
      const r = txs(prot(), (x) => x.frame.kind === 'rts' && x.t + x.frame.txTimeNs === c.t - SIFS_NS)[0]
      const d = txs(prot(), (x) => x.node === r.node && x.frame.kind === 'data' && x.t === c.t + c.frame.txTimeNs + SIFS_NS)[0]
      expect(r.frame.mbps, `RTS @ ${r.t}`).toBe(ctrlRespRateFor(d.frame.mbps))
      checked++
    }
    expect(checked).toBeGreaterThan(300)
  })

  it('the question never reaches the far room, the answer always does', () => {
    const [margin] = figs(implRow('判忙门限').sim, /低 ([\d.]+) dB/, 'the margin')
    const lt = links()
    expect((CCA_PD_DBM - lt.get('sta-1')!.get('sta-2')!).toFixed(1)).toBe(margin.toFixed(1))
    for (const [rx, tx] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      expect(ofType(prot(), 'RX_START').some((r) => r.node === rx && r.from === tx), `${rx} ← ${tx}`).toBe(false)
    }
    const [ctsLevel] = figs(implRow('判忙门限').sim, /CTS 到达那里是 (−[\d.]+) dBm，高于门限/, 'the CTS level')
    for (const n of ['sta-1', 'sta-2']) expect(lt.get('ap')!.get(n)!.toFixed(1)).toBe(ctsLevel.toFixed(1))
    expect(ctsLevel).toBeGreaterThan(CCA_PD_DBM)
  })
})

describe('rts-cts · ③ every figure the labs print is the run', () => {
  const on = prot()
  const askedAt = (): number => {
    const rows = tableOf(lab('一次受保护的交换'), '718 µs 那次交换的逐项数值').rows
    return figs(rows[1][1], /^(\d+) µs · RTS/, 'when the question goes out')[0] * US
  }

  it('lab 1: the worked table — ten rows of the 718 µs exchange', () => {
    const l = lab('一次受保护的交换')
    expect(l.variant).toBe(0)
    const rows = tableOf(l, '718 µs 那次交换的逐项数值').rows
    expect(rows).toHaveLength(10)
    const n = (s: string): number[] => [...s.matchAll(/\d+/g)].map((m) => Number(m[0]))
    const rts = txs(on, (r) => r.frame.kind === 'rts' && r.t === askedAt())[0]
    const cts = txs(on, (r) => r.frame.kind === 'cts' && r.t > rts.t)[0]
    const data = txs(on, (r) => r.frame.kind === 'data' && r.node === rts.node && r.t > rts.t)[0]
    const ack = txs(on, (r) => r.frame.kind === 'ack' && r.t > data.t)[0]
    const far = rts.node === 'sta-1' ? 'sta-2' : 'sta-1'
    expect(rts.node).toBe('sta-1')
    const [payload, hdr, fcs, total] = n(rows[0][1])
    expect([hdr, fcs]).toEqual([MAC_HDR_BYTES, FCS_BYTES])
    expect(payload + hdr + fcs).toBe(total)
    expect(data.frame.bytes).toBe(total)
    expect(n(rows[1][1])[1]).toBe(rts.frame.bytes)
    const [gaps, gap, answer, frame, theAck, reserved] = n(rows[2][1])
    expect(gap * US).toBe(SIFS_NS)
    expect(gaps).toBe(3)
    expect([answer * US, frame * US, theAck * US]).toEqual([cts.frame.txTimeNs, data.frame.txTimeNs, ack.frame.txTimeNs])
    expect(gaps * gap + answer + frame + theAck).toBe(reserved)
    expect(rts.frame.durationFieldNs).toBe(reserved * US)
    const lt = links()
    for (const [i, ok, level] of [[3, false, lt.get(rts.node)!.get(far)!], [6, true, lt.get(cts.node)!.get(far)!]] as const) {
      const m = /^(−[\d.]+) dBm [<>] (−[\d.]+) dBm ([✓✗])$/.exec(rows[i][1])
      expect(m, `row ${i + 1}`).not.toBeNull()
      expect(Number(m![2].replace('−', '-'))).toBe(CCA_PD_DBM)
      expect(Number(m![1].replace('−', '-'))).toBe(Number(level.toFixed(1)))
      expect(level > CCA_PD_DBM).toBe(ok)
      expect(m![3] === '✓').toBe(ok)
    }
    const [ctsAt, ctsBytes] = n(rows[4][1])
    expect([cts.t, cts.frame.bytes]).toEqual([ctsAt * US, ctsBytes])
    const [was, less1, less2, now] = n(rows[5][1])
    expect(was).toBe(reserved)
    expect([less1 * US, less2 * US]).toEqual([SIFS_NS, cts.frame.txTimeNs])
    expect(was - less1 - less2).toBe(now)
    expect(cts.frame.durationFieldNs).toBe(now * US)
    const [held] = figs(rows[7][0], /冻结在 (\d+)/, 'the value B freezes at')
    const [ctsEnd, dur, until] = n(rows[7][1])
    expect(cts.t + cts.frame.txTimeNs).toBe(ctsEnd * US)
    expect(dur).toBe(now)
    expect(ctsEnd + dur).toBe(until)
    const nav = ofType(on, 'NAV_SET').find((r) => r.node === far && r.t === ctsEnd * US)!
    expect(nav.source).toBe('cts:ap')
    expect(nav.untilNs).toBe(until * US)
    expect(ofType(on, 'BACKOFF_FREEZE').find((r) => r.node === far && r.t === cts.t)!.value).toBe(held)
    expect(n(rows[8][1])[0] * US).toBe(ack.t + ack.frame.txTimeNs)
    expect(ack.t + ack.frame.txTimeNs).toBe(until * US)
    const [back, value] = n(rows[9][1])
    const resume = ofType(on, 'BACKOFF_RESUME').find((r) => r.node === far && r.t > nav.untilNs)!
    expect([resume.t, resume.value]).toEqual([back * US, value])
    expect(resume.t - nav.untilNs).toBe(DIFS_NS)
    // the expect repeats the freeze, the reservation's end and the resume
    const [f1, u1, b1, v1] = figs(l.expect, /B 在 (\d+) 冻结，NAV 一直到 (\d+) µs.*B 在 (\d+) µs 从 (\d+) 继续/, 'lab 1 expect')
    expect([f1, u1, b1, v1]).toEqual([held, until, back, value])
    const [runTo] = figs(l.steps.join('\n'), /运行到 ([\d.]+) ms/, 'the run')
    expect(runTo * MS).toBeGreaterThan(resume.t)
  })

  it('lab 1: every arrow and instant of the sequence figure is a record of the protected variant', () => {
    const fig = (lab('一次受保护的交换').blocks ?? []).find((b) => b.kind === 'diagram') as Extract<Block, { kind: 'diagram' }>
    expect(fig.spec).toEqual(rtsCtsSequence())
    const rts = txs(on, (r) => r.frame.kind === 'rts' && r.t === askedAt())[0]
    const cts = txs(on, (r) => r.frame.kind === 'cts' && r.t > rts.t)[0]
    const data = txs(on, (r) => r.frame.kind === 'data' && r.node === rts.node && r.t > rts.t)[0]
    const ack = txs(on, (r) => r.frame.kind === 'ack' && r.t > data.t)[0]
    const at = (m: SequenceMessage) => Number(/^(\d+) µs$/.exec(m.at!)![1]) * US
    expect(at(msg(`RTS ${rts.frame.bytes} B`))).toBe(rts.t)
    expect(at(msg(`CTS ${cts.frame.bytes} B`))).toBe(cts.t)
    expect(at(msg('数据帧'))).toBe(data.t)
    expect(at(msg('确认帧'))).toBe(ack.t)
    const unheard = msg('收不到')
    expect([unheard.from, unheard.to, unheard.tone]).toEqual(['sta-1', 'sta-2', 'muted'])
    expect(ofType(on, 'RX_START').some((r) => r.node === 'sta-2' && r.t === rts.t)).toBe(false)
    const [booked] = figs(rtsCtsSequence().messages.find((m) => m.label.startsWith('预约'))!.label, /预约 (\d+) µs/, 'the arrow')
    expect(cts.frame.durationFieldNs).toBe(booked * US)
    expect(figs(fig.caption!, /预约了 (\d+) µs/, 'the caption')[0]).toBe(booked)
  })

  it('lab 1: the figure lays out inside the viewBox, with no two labels touching', () => {
    const lay = layoutDiagram(rtsCtsSequence())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
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

  it('lab 2: the on/off table, the 94 % cut, seven times the frames, 42 and 11 per 100 ms', () => {
    const l = lab('关闭与开启的对比')
    expect(rtsCts.jumps[l.jump!].label).toBe('第一次碰撞')
    expect(l.more).toEqual([0])
    const rows = tableOf(l, '同样的 300 ms：关闭与开启').rows
    const [window] = figs(tableOf(l, '同样的 300 ms：关闭与开启').heading!, /同样的 (\d+) ms/, 'the window')
    expect(window * MS).toBe(RUN_NS)
    const measured = [
      [ofType(base(), 'COLLISION').length, ofType(prot(), 'COLLISION').length],
      [caughtData(base()).length, caughtData(prot()).length],
      [acked(base()), acked(prot())],
    ]
    expect(rows.map((r) => [Number(r[1]), Number(r[2])])).toEqual(measured)
    const [cut] = figs(l.expect, /减少约 (\d+)%/, 'the cut')
    expect(Math.round(100 * (1 - measured[1][1] / measured[1][0]))).toBe(cut)
    const times = zhCount(/送达的帧数是原来的([〇一二三四五六七八九十两]+)倍/.exec(l.expect)![1])
    expect(Math.round(measured[2][1] / measured[2][0])).toBe(times)
    const [per, off, on2] = figs(l.expect, /每 (\d+) ms (\d+) 次与 (\d+) 次/, 'the tick rates')
    expect(Math.round(measured[0][0] / (RUN_NS / (per * MS)))).toBe(off)
    expect(Math.round(measured[0][1] / (RUN_NS / (per * MS)))).toBe(on2)
    const [r, c] = figs(l.meaning, /(\d+) 字节的 RTS 与 (\d+) 字节的 CTS/, 'the two frames')
    expect([r, c]).toEqual([RTS_BYTES, CTS_BYTES])
  })

  it('lab 3: 25 of 32 are RTS against RTS within four slots, 7 meet an RTS, 245 NAVs, 67 CTS timeouts', () => {
    const l = lab('剩下的碰撞')
    expect(l.variant).toBe(0)
    const [all, rtsOnly, within, data, navs, tos] = [
      ...figs(l.expect, /(\d+) 次碰撞中 (\d+) 次是两个 RTS 相撞/, 'the split'),
      zhCount(/相隔不超过([〇一二三四五六七八九十两]+)个时隙/.exec(l.expect)![1]),
      ...figs(l.expect, /另外 (\d+) 次涉及数据帧/, 'the rest'),
      ...figs(l.expect, /依据 CTS 设置了 (\d+) 次 NAV；两台站点共有 (\d+) 次 CTS 超时/, 'the counts'),
    ]
    const cs = collisions(on)
    expect(cs.length).toBe(all)
    const rr = cs.filter(({ locked, others }) => [locked, ...others].every((f) => f.frame.kind === 'rts'))
    expect(rr.length).toBe(rtsOnly)
    for (const { locked, others } of rr) expect(Math.abs(others[0].t - locked.t)).toBeLessThanOrEqual(within * SLOT_NS)
    const withData = caughtData(on)
    expect(withData.length).toBe(data)
    expect(all - rtsOnly).toBe(data)
    for (const { locked, others } of withData) expect([locked, ...others].some((f) => f.frame.kind === 'rts')).toBe(true)
    expect(ofType(on, 'NAV_SET').filter((r) => r.node === 'sta-2' && r.source === 'cts:ap').length).toBe(navs)
    expect(ofType(on, 'NAV_SET').filter((r) => r.node === 'sta-2').length).toBe(navs)
    expect(ofType(on, 'CTS_TIMEOUT').length).toBe(tos)
  })

  it('why quotes the same two frames and the same table', () => {
    const [r, c] = figs(rtsCts.why!, /先发一个 (\d+) 字节的 RTS.*回复一个 (\d+) 字节的 CTS/, 'why')
    expect([r, c]).toEqual([RTS_BYTES, CTS_BYTES])
    const [lo] = figs(rtsCts.why!, /门限设为 (\d+) 字节/, 'why')
    expect(rtsCts.variants![0].scenario().rtsThresholdBytes).toBe(lo)
    const [d0, d1, a0, a1] = figs(rtsCts.why!, /从 (\d+) 次降到 (\d+) 次，送达的帧数从 (\d+) 增加到 (\d+)/, 'why')
    expect([d0, d1]).toEqual([caughtData(base()).length, caughtData(prot()).length])
    expect([a0, a1]).toEqual([acked(base()), acked(prot())])
  })
})
