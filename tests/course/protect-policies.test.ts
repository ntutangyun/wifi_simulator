/**
 * `@protect-policies`, in the standard-first shape (2026-11-11).
 *
 * It borrows the parent's scene AND both of its variants rather than declaring any of its own, so
 * `lessonShapeSuite(..., { sameSceneAs: 'txop-protect' })` proves the two ids replay the same three
 * timelines and its three recorded hashes are copies rather than new runs.
 *
 * The rewrite corrected two things against IEEE Std 802.11-2024: §9.2.5.2 has two classes of
 * Duration setting, not three, and §10.23.2.10 lets ANY non-DMG access point answer a CF-End with
 * one of its own (the old lesson said the repeat was written for S1G access points). The ② rows are
 * checked against engine behaviour below; every figure the labs print is read back out of the
 * lesson text and compared with a run.
 */
import { describe, it, expect } from 'vitest'
import { protectPolicies, policyReachTiming } from '../../src/course/tier2/protect-policies'
import { txopProtect } from '../../src/course/tier2/txop-protect'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { CF_END_BYTES, OFDM_5G } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

/** base = the engine's 'boundary' policy; variant 0 = 'single'; variant 1 = 'multiple'. */
const boundary = (): TLRecord[] => runOf(protectPolicies, undefined, RUN_NS)
const single = (): TLRecord[] => runOf(protectPolicies, 0, RUN_NS)
const multiple = (): TLRecord[] => runOf(protectPolicies, 1, RUN_NS)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const delivered = (rs: TLRecord[]): number =>
  ofType(rs, 'RX_OK').filter((r) => r.node === 'ap' && r.frame.kind === 'data').length
const dataDurs = (rs: TLRecord[]): number[] => txs(rs, (r) => r.frame.kind === 'data').map((r) => r.frame.durationFieldNs)
const lane = (label: string): TimingLane => policyReachTiming().lanes.find((l) => l.label === label)!
const ms3 = (ns: number) => Number((ns / MS).toFixed(3))

const lab = (heading: string): Lab => {
  const l = protectPolicies.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, fragment: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && (b.heading ?? '').includes(fragment))
  expect(t, `table 「${fragment}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = protectPolicies.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const grab = (s: string, re: RegExp, what: string): string[] => {
  const m = re.exec(s)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
const figure = (printed: string, unit: 'µs' | 'ms', ns: number, what: string): void => {
  const p = printed.replace(/\s/g, '')
  const dp = (p.split('.')[1] ?? '').length
  expect(Number(p), what).toBe(Number((ns / (unit === 'ms' ? MS : US)).toFixed(dp)))
}

lessonShapeSuite(protectPolicies, { sameSceneAs: 'txop-protect', runNs: RUN_NS })

describe('protect-policies · the lesson', () => {
  it('is in the standard-first shape, after its parent in the QoS module', () => {
    expect(isStandardFirst(protectPolicies)).toBe(true)
    expect(MODULES[protectPolicies.module].title).toBe('QoS 与效率')
    expect(protectPolicies.needs).toEqual(['txop-protect'])
    expect(protectPolicies.terms!.map((t) => t.term)).toEqual(['CF-End', 'CTS-to-self'])
    expect(protectPolicies.limits).toEqual([])
    expect(protectPolicies.observe).toEqual([])
    expect(protectPolicies.tryThis).toEqual([])
  })

  it('is the parent’s scene and the parent’s two variants, undivided', () => {
    const sc = protectPolicies.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc).toEqual(txopProtect.scenario())
    expect(protectPolicies.variants!.map((v) => v.scenario())).toEqual(txopProtect.variants!.map((v) => v.scenario()))
    expect(protectPolicies.variants!.map((v) => v.label)).toEqual(txopProtect.variants!.map((v) => v.label))
  })

  it('① cites each clause it teaches and names no third class', () => {
    const std = protectPolicies.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§9.2.5.2', '§10.23.2.10', '§9.3.1.6', '§26.2.5', '§10.3.2.15']) expect(std, clause).toContain(clause)
    expect(std).not.toContain('边界')
    expect(std).not.toContain('S1G 接入点')
    // the CF-End frame ① describes is the engine's own constant
    expect(Number(grab(std, /共 (\d+) 个八位组；非 DMG/, '① on the CF-End size')[0])).toBe(CF_END_BYTES)
  })

  it('② is not all faithful', () => {
    const kinds = new Set(protectPolicies.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'differs', 'choice', 'absent', 'value'] as const) expect(kinds, k).toContain(k)
  })
})

describe('protect-policies · ② says what the engine does, and the engine does it', () => {
  it('single data frames: SIFS + their own acknowledgement only, never the next exchange', () => {
    const rs = single()
    for (const d of txs(rs, (r) => r.frame.kind === 'data')) {
      const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t === d.t + d.frame.txTimeNs + OFDM_5G.sifsNs)[0]
      if (ack) expect(d.frame.durationFieldNs).toBe(OFDM_5G.sifsNs + ack.frame.txTimeNs)
    }
  })

  it('multiple data frames take the lower bound — the RTS reservation’s end — or fall back to SIFS + answer', () => {
    const m = multiple()
    let atEnd = 0
    for (const d of txs(m, (r) => r.frame.kind === 'data')) {
      const top = ofType(m, 'TXOP_START').filter((s) => s.node === d.node && s.t <= d.t).pop()!
      const rts = txs(m, (r) => r.node === d.node && r.frame.kind === 'rts' && r.t === top.t)[0]
      const reaches = rts && rts.t + rts.frame.txTimeNs + rts.frame.durationFieldNs === top.untilNs
      if (reaches && d.frame.durationFieldNs > 60 * US) {
        expect(d.t + d.frame.txTimeNs + d.frame.durationFieldNs).toBe(top.untilNs)
        atEnd++
      } else {
        expect(d.frame.durationFieldNs).toBeLessThanOrEqual(60 * US)
      }
    }
    expect(atEnd).toBeGreaterThan(100)
  })

  it('every acknowledgement carries 0, even after a multiple-protection data frame', () => {
    const acks = txs(multiple(), (r) => r.frame.kind === 'ack' || r.frame.kind === 'ba')
    expect(new Set(acks.map((a) => a.frame.durationFieldNs))).toEqual(new Set([0]))
  })

  it('CF-End: 20 octets, Duration 0, broadcast, 24 Mb/s and 28 µs; only after a TXOP-long RTS', () => {
    const [airUs] = grab(implRow('CF-End 帧').sim, /空口时间（airtime）(\d+) µs/, 'the CF-End row')
    const [mbps] = grab(implRow('CF-End 帧').sim, /固定以 (\d+) Mb\/s 发送/, 'the CF-End row')
    for (const rs of [boundary(), multiple()]) {
      const cf = txs(rs, (r) => r.frame.kind === 'cfend')
      expect(cf.length).toBeGreaterThan(0)
      for (const c of cf) {
        expect([c.frame.bytes, c.frame.durationFieldNs, c.frame.dst, c.frame.mbps]).toEqual([CF_END_BYTES, 0, '*', Number(mbps)])
        expect(c.frame.txTimeNs).toBe(Number(airUs) * US)
      }
    }
    expect(txs(single(), (r) => r.frame.kind === 'cfend')).toHaveLength(0)
  })

  it('the holder sends CF-End with data still queued: the next exchange did not fit, and no frame follows in that TXOP', () => {
    const rs = boundary()
    const holderCf = txs(rs, (r) => r.frame.kind === 'cfend' && r.node !== 'ap')
    for (const c of holderCf) {
      const end = ofType(rs, 'TXOP_END').filter((e) => e.node === c.node && e.t <= c.t).pop()!
      expect(c.t - end.t).toBe(OFDM_5G.sifsNs)
      // the TXOP is over before the CF-End: the next frame from the holder starts a new TXOP
      const next = txs(rs, (r) => r.node === c.node && r.t > c.t)[0]
      if (next) expect(ofType(rs, 'TXOP_START').some((s) => s.node === c.node && s.t === next.t)).toBe(true)
    }
    // the stations are saturated: the queue was never empty when they truncated
    expect(protectPolicies.scenario().nodes.filter((n) => n.kind === 'sta').every((n) => n.profiles.includes('saturated'))).toBe(true)
  })

  it('the access point answers every CF-End from a station, one SIFS after it', () => {
    for (const rs of [boundary(), multiple()]) {
      const cf = txs(rs, (r) => r.frame.kind === 'cfend')
      const fromSta = cf.filter((r) => r.node !== 'ap')
      for (const c of fromSta) {
        const relay = cf.find((r) => r.node === 'ap' && r.t === c.t + c.frame.txTimeNs + OFDM_5G.sifsNs)
        // a CF-End whose relay would land after the 300 ms cut is the only exception
        if (c.t + 2 * c.frame.txTimeNs + OFDM_5G.sifsNs < RUN_NS) expect(relay, `relay of ${c.t}`).toBeDefined()
      }
    }
  })

  it('CTS-to-self is absent from the Wi-Fi timeline: every CTS answers an RTS and is addressed to its sender', () => {
    for (const rs of [boundary(), single(), multiple()]) {
      for (const c of txs(rs, (r) => r.frame.kind === 'cts')) {
        expect(c.frame.dst).not.toBe(c.node)
        expect(txs(rs, (r) => r.frame.kind === 'rts' && r.node === c.frame.dst && r.t < c.t).length).toBeGreaterThan(0)
      }
    }
  })
})

describe('protect-policies · ③ every figure the labs print is the run', () => {
  const rs = boundary()
  const t0 = ofType(rs, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms3(r.t) === 0.744)!
  const end = ofType(rs, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > t0.t)!
  const nav = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-2' && r.t >= t0.t)!
  const cf = txs(rs, (r) => r.frame.kind === 'cfend' && r.t > end.t)
  const clear = ofType(rs, 'NAV_CLEAR').find((r) => r.node === 'sta-2' && r.t > end.t)!
  const data = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > t0.t && r.t < end.t)

  it('lab 1: every span of the timing figure is a record of this run, or the engine’s arithmetic over one', () => {
    const l = lab('一条预约提前结束')
    const blk = (l.blocks ?? []).find((b) => b.kind === 'diagram') as { spec: unknown; caption: string }
    expect(blk.spec).toEqual(policyReachTiming())
    const rel = (t: number) => (t - t0.t) / US
    const rts = txs(rs, (r) => r.frame.kind === 'rts' && r.t === t0.t)[0]
    const cts = txs(rs, (r) => r.frame.kind === 'cts' && r.t > t0.t)[0]
    const burst = lane('这一串').spans
    expect([burst[0].fromUs, burst[0].toUs]).toEqual([rel(rts.t), rel(rts.t + rts.frame.txTimeNs)])
    expect([burst[1].fromUs, burst[1].toUs]).toEqual([rel(cts.t), rel(cts.t + cts.frame.txTimeNs)])
    expect([burst[2].fromUs, burst[2].toUs]).toEqual([rel(data[0].t), rel(end.t)])
    // lane 2: what the single run's CTS really carries for the same burst
    const s = single()
    const st0 = ofType(s, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms3(r.t) === 0.744)!
    const scts = txs(s, (r) => r.frame.kind === 'cts' && r.t > st0.t)[0]
    const one = lane('单次罩住').spans[0]
    expect(one.fromUs).toBe(rel(nav.t))
    expect(one.toUs - one.fromUs).toBe(scts.frame.durationFieldNs / US)
    expect(one.label).toBe(`${scts.frame.durationFieldNs / US} µs`)
    const bnd = lane('边界罩住').spans[0]
    expect([bnd.fromUs, bnd.toUs]).toEqual([rel(nav.t), rel(nav.untilNs)])
    expect(bnd.label).toBe(`${(cts.frame.durationFieldNs / US).toLocaleString('en-US').replace(',', ' ')} µs`)
    const back = lane('释放').spans[0]
    expect([back.fromUs, back.toUs]).toEqual([rel(cf[0].t), rel(clear.t)])
    // the caption's figures
    const [one2, bnd2, fin, freed] = grab(blk.caption, /（(\d+) µs）[^]*?（([\d ]+) µs），但这一串在 ([\d ]+) µs 就结束了[^]*?最后那 (\d+) µs/, 'the caption')
    figure(one2, 'µs', scts.frame.durationFieldNs, 'single reach')
    figure(bnd2, 'µs', cts.frame.durationFieldNs, 'boundary reach')
    figure(fin, 'µs', end.t - t0.t, 'burst span')
    figure(freed, 'µs', nav.untilNs - clear.t, 'time handed back')
    figure(grab(blk.caption, /本轮 ([\d.]+) ms 发出/, 'caption instant')[0], 'ms', t0.t, 'the RTS instant')
  })

  it('lab 1: the figure lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(policyReachTiming())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(8)
    for (const t of ts) {
      const b = textBox(t)
      expect(b.x0, t.text).toBeGreaterThanOrEqual(-0.01)
      expect(b.x1, t.text).toBeLessThanOrEqual(W + 0.01)
      expect(b.y1, t.text).toBeLessThanOrEqual(lay.height + 0.01)
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
    const l = lab('一条预约提前结束')
    const rows = tableOf(l, '的结束过程').rows
    expect(rows).toHaveLength(8)
    const cell = (label: string): string => rows.find((x) => x[0] === label)![1]
    figure(grab(tableOf(l, '的结束过程').heading!, /([\d.]+) ms/, 'heading')[0], 'ms', t0.t, 'the burst')
    figure(cell('隐藏站 B 的预约持续到').replace(' ms', ''), 'ms', nav.untilNs, 'NAV end')
    figure(cell('最后一个确认帧结束于').replace(' ms', ''), 'ms', end.t, 'burst end')
    figure(cell('预约还剩').replace(' µs', ''), 'µs', nav.untilNs - end.t, 'left')
    figure(cell('再进行一次交互需要').replace(' µs', ''), 'µs', data[1].t - data[0].t, 'one more exchange')
    expect(nav.untilNs - end.t).toBeLessThan(data[1].t - data[0].t)
    figure(cell('持有者的 CF-End 发于').replace(' ms', ''), 'ms', cf[0].t, 'holder CF-End')
    expect(cf[0].node).toBe('sta-1')
    figure(cell('接入点的 CF-End 发于').replace(' ms', ''), 'ms', cf[1].t, 'AP CF-End')
    expect(cf[1].node).toBe('ap')
    figure(cell('隐藏站 B 的 NAV 清零于').replace(' ms', ''), 'ms', clear.t, 'NAV clear')
    figure(cell('提前释放的时间').replace(' µs', ''), 'µs', nav.untilNs - clear.t, 'released')
    // B cannot hear A: the clear lands as the AP's copy ends, not the holder's
    expect(clear.t).toBe(cf[1].t + cf[1].frame.txTimeNs)

    const [e1, e2, e3, e4, e5, e6, e7, e8] = grab(l.expect, /最后一个确认帧在 ([\d.]+) ms 结束，预约还剩 (\d+) µs，不够再进行一次 (\d+) µs 的交互；A 在 ([\d.]+) ms 发出 CF-End，接入点在 ([\d.]+) ms 再发一帧，B 在 ([\d.]+) ms 清零 NAV，比预约的 ([\d.]+) ms 早 (\d+) µs/, 'lab 1 expect')
    figure(e1, 'ms', end.t, 'burst end')
    figure(e2, 'µs', nav.untilNs - end.t, 'left')
    figure(e3, 'µs', data[1].t - data[0].t, 'exchange')
    figure(e4, 'ms', cf[0].t, 'holder CF-End')
    figure(e5, 'ms', cf[1].t, 'AP CF-End')
    figure(e6, 'ms', clear.t, 'NAV clear')
    figure(e7, 'ms', nav.untilNs, 'NAV end')
    figure(e8, 'µs', nav.untilNs - clear.t, 'released')
    // the why's 288
    figure(grab(protectPolicies.why!, /([\d.]+) ms 那一串结束后，隐藏站点的预约因此提前 (\d+) µs 结束/, 'why')[1], 'µs', nav.untilNs - clear.t, 'why: released')
  })

  it('lab 2: the CF-End census, and none under the single policy', () => {
    const l = lab('接入点转发了多少')
    const [ms, all, ap] = grab(l.expect, /(\d+) ms 内共有 (\d+) 帧 CF-End，其中 (\d+) 帧由接入点发出/, 'lab 2 expect')
    expect(Number(ms) * MS).toBe(RUN_NS)
    const c = txs(rs, (r) => r.frame.kind === 'cfend')
    expect(Number(all)).toBe(c.length)
    expect(Number(ap)).toBe(c.filter((r) => r.node === 'ap').length)
    expect(Number(ap) * 2).toBe(Number(all))
    expect(l.expect).toContain('单次变体里一帧 CF-End 也没有')
    expect(txs(single(), (r) => r.frame.kind === 'cfend')).toHaveLength(0)
    // 「它的 RTS 从不预约到 TXOP 末尾」
    const s = single()
    for (const st of ofType(s, 'TXOP_START')) {
      const rts = txs(s, (r) => r.node === st.node && r.frame.kind === 'rts' && r.t === st.t)[0]
      if (rts) expect(rts.t + rts.frame.txTimeNs + rts.frame.durationFieldNs).toBeLessThan(st.untilNs)
    }
  })

  it('lab 3: the three-policy table, column by column, and the multiple burst’s Durations', () => {
    const l = lab('多重策略与「边界」策略')
    const t = tableOf(l, '三种策略')
    expect(Number(grab(t.heading!, /(\d+) ms/, 'heading')[0]) * MS).toBe(RUN_NS)
    const runsByCol = [single(), boundary(), multiple()]
    expect(t.head.slice(1)).toEqual(['单次', '边界', '多重'])
    const row = (label: string): string[] => t.rows.find((r) => r[0] === label)!.slice(1)
    expect(t.rows).toHaveLength(4)
    row('碰撞次数').forEach((c, i) => expect(Number(c)).toBe(ofType(runsByCol[i], 'COLLISION').length))
    row('成功送达的数据帧').forEach((c, i) => expect(Number(c)).toBe(delivered(runsByCol[i])))
    row('数据帧自己携带的 Duration，最长').forEach((c, i) => {
      const [v, unit] = grab(c, /^([\d.]+) (µs|ms)$/, 'max Duration cell')
      figure(v, unit as 'µs' | 'ms', Math.max(...dataDurs(runsByCol[i])), `max data Duration, column ${i}`)
    })
    row('发出的 CF-End（含接入点转发的）').forEach((c, i) => expect(Number(c)).toBe(txs(runsByCol[i], (r) => r.frame.kind === 'cfend').length))

    const m = multiple()
    const mt0 = ofType(m, 'TXOP_START').filter((r) => r.node === 'sta-1').find((r) => ms3(r.t) === 0.744)!
    const mend = ofType(m, 'TXOP_END').find((r) => r.node === 'sta-1' && r.t > mt0.t)!
    const mdata = txs(m, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > mt0.t && r.t < mend.t)
    const [list, to] = grab(l.expect, /五个数据帧依次写 ([\d 、]+) µs，每一个都写到 ([\d.]+) ms/, 'lab 3 expect')
    const printed = list.split('、').map((x) => Number(x.replace(/\s/g, '')))
    expect(printed).toEqual(mdata.map((d) => d.frame.durationFieldNs / US))
    for (const d of mdata) figure(to, 'ms', d.t + d.frame.txTimeNs + d.frame.durationFieldNs, 'where each reaches')
    const [lo, hi] = grab(l.expect, /数据帧只写 (\d+) 到 (\d+) µs/, 'lab 3 expect, the other two')
    for (const r of [boundary(), single()]) {
      expect(Math.min(...dataDurs(r)) / US).toBe(Number(lo))
      expect(Math.max(...dataDurs(r)) / US).toBe(Number(hi))
    }
    // 「逐一相同」: the counts are equal, which the table already reads; the hidden station's NAVs too
    expect(ofType(m, 'NAV_SET').filter((r) => r.node === 'sta-2').map((r) => [r.t, r.untilNs]))
      .toEqual(ofType(boundary(), 'NAV_SET').filter((r) => r.node === 'sta-2').map((r) => [r.t, r.untilNs]))
  })
})
