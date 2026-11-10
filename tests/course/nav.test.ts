/**
 * `@nav`, in the standard-first shape (2026-11-11).
 *
 * ① is IEEE Std 802.11-2024 on carrier sense, the Duration/ID field and the NAV update rule; ② says
 * what the engine does with each point and is checked here against the engine; ③'s three runs
 * print figures, and every one of them is read back out of the lesson text and compared with a run
 * of the lesson's own scene (two saturated talkers, one browsing listener), so editing a number in
 * the lesson without the engine agreeing turns this red, and so does an engine change that moves a
 * number the lesson still prints.
 *
 * Carried over from the old shape, against the same runs: the 248 + 44 + 34 = 326 µs freeze (now
 * the third lab's figure), the 576 data frames and 513 listener countdowns (the second lab), the
 * procedure pins against `updateNav` / `mediumBusy`, and the figure's geometry. The old pins on
 * `limits`, `deeper`, `observe` and `tryThis` went with those sections; what they claimed now lives
 * in ② and is pinned there (the second access point refused by name, one NAV per station).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nav, navTiming } from '../../src/course/tier1/nav'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { ACK_BYTES, DIFS_NS, SIFS_NS, SLOT_NS, ctrlRespRateFor, txTimeNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { W, layoutDiagram, textBox, type Shape, type TimingLane } from '../../src/course/diagram'

const MS = 1_000_000
const US = 1_000
/** 200 ms: the window the second lab's 「200 ms 内」 is counted over. */
const RUN_NS = 200 * MS

const recs = (): TLRecord[] => runOf(nav, undefined, RUN_NS)
const txs = (kind: string) => ofType(recs(), 'TX_START').filter((r) => r.frame.kind === kind)
const lane = (label: string): TimingLane => navTiming().lanes.find((l) => l.label === label)!

const lab = (heading: string): Lab => {
  const l = nav.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = nav.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
/** The captures of `re`, as numbers. A space inside a figure is a thousands group. */
const figs = (text: string, re: RegExp, what: string): number[] => {
  const m = re.exec(text)
  expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
  return m!.slice(1).map((x) => Number(x.replace(/\s/g, '')))
}
/** 「16 µs」 → 16_000: a cell that is a figure and its unit, and nothing else. */
const figure = (cell: string, what: string): number => {
  const m = /^([\d\s.]+?)\s*µs$/.exec(cell.trim())
  expect(m, `${what}: the cell 「${cell}」 is not a figure followed by µs`).not.toBeNull()
  return Number(m![1].replace(/\s/g, '')) * US
}
const zhCount = (s: string): number => {
  const n = zhNumeral(s.replace(/两/g, '二'))
  expect(n, `「${s}」 is not a number this reads`).not.toBeNull()
  return n!
}

lessonShapeSuite(nav, { runNs: RUN_NS })

describe('nav · the lesson', () => {
  it('is in the standard-first shape, after backoff, and owns the reservation', () => {
    expect(isStandardFirst(nav)).toBe(true)
    expect(MODULES[nav.module].title).toBe('等待与退避')
    expect(nav.needs).toEqual(['backoff'])
    expect(nav.terms!.map((t) => t.term)).toEqual(['Duration', 'NAV', 'virtual carrier sense'])
    expect(nav.limits).toEqual([])
    expect(nav.observe).toEqual([])
    expect(nav.tryThis).toEqual([])
  })

  it('the scenario passes the schema and is unchanged', () => {
    expect(() => ScenarioSchema.parse(nav.scenario())).not.toThrow()
    expect(nav.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2', 'sta-3'])
  })

  it('cites each clause it teaches in ①', () => {
    const std = nav.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§10.3.2.1', '§9.2.4.2', '§9.3.2.1.5', '§9.3.1.4', '§10.6.6.5.2', '§10.3.2.4', '§26.2.4', '§10.3.3', '§10.3.4.3']) {
      expect(std, clause).toContain(clause)
    }
    // the field's range is the standard's 15 bits of microseconds
    const [max] = figs(std, /取值 0 到 ([\d\s]+)。/, 'the field’s range')
    const [bits] = figs(std, /其余 (\d+) 位/, 'the field’s width')
    expect(2 ** bits - 1).toBe(max)
  })

  it('② is not all faithful, and every kind it uses is one of the five', () => {
    const kinds = nav.implementation!.map((r) => r.kind)
    expect(kinds.some((k) => k !== 'faithful')).toBe(true)
    expect(kinds).toContain('differs')
    expect(kinds).toContain('absent')
  })
})

describe('nav · ② says what the engine does, and the engine does it', () => {
  it('data frames write one SIFS plus one acknowledgement, every one of them', () => {
    const row = implRow('数据帧的 Duration')
    const [sifs, ack, frames, written] = figs(row.sim, /(\d+) µs 的 SIFS 加 (\d+) µs 的确认帧，本课场景里 200 ms 内的 (\d+) 个数据帧都写 (\d+) µs/, 'the data row')
    expect(sifs * US).toBe(SIFS_NS)
    expect(new Set(txs('ack').map((r) => r.frame.txTimeNs))).toEqual(new Set([ack * US]))
    expect(txs('data').length).toBe(frames)
    expect(new Set(txs('data').map((r) => r.frame.durationFieldNs))).toEqual(new Set([written * US]))
    expect(sifs + ack).toBe(written)
    // and it is the answer each frame expects, not a constant that happens to match
    for (const d of txs('data')) {
      const a = txs('ack').find((x) => x.t > d.t)
      if (a) expect(d.frame.durationFieldNs).toBe(SIFS_NS + a.frame.txTimeNs)
    }
  })

  it('an acknowledgement writes 0 and arms nobody', () => {
    expect(implRow('确认帧的 Duration').sim).toContain('照此写 0')
    expect(new Set(txs('ack').map((r) => r.frame.durationFieldNs))).toEqual(new Set([0]))
    expect(ofType(recs(), 'NAV_SET').some((r) => r.source.startsWith('ack'))).toBe(false)
  })

  it('the acknowledgement rate: the highest mandatory rate not above the frame’s', () => {
    const row = implRow('确认帧的速率')
    expect(row.kind).toBe('value')
    const [frames, at54, fast, at48, slow, ackMbps, bytes, air] = figs(row.sim,
      /本课 (\d+) 个数据帧中 (\d+) 个以 (\d+) Mb\/s、(\d+) 个以 (\d+) Mb\/s 发送，确认帧都是 (\d+) Mb\/s、(\d+) 个字节、(\d+) µs/, 'the rate row')
    expect(txs('data').length).toBe(frames)
    expect(txs('data').filter((r) => r.frame.mbps === fast).length).toBe(at54)
    expect(txs('data').filter((r) => r.frame.mbps === slow).length).toBe(at48)
    expect(at54 + at48).toBe(frames)
    expect(new Set(txs('ack').map((r) => r.frame.mbps))).toEqual(new Set([ackMbps]))
    expect(ctrlRespRateFor(fast)).toBe(ackMbps)
    expect(ctrlRespRateFor(slow)).toBe(ackMbps)
    expect(bytes).toBe(ACK_BYTES)
    expect(txTimeNs(bytes, ackMbps)).toBe(air * US)
    // 「强制速率 6、12、24 Mb/s」: the engine's mandatory set, read off the rule itself
    for (const [frame, resp] of [[6, 6], [9, 6], [12, 12], [18, 12], [24, 24], [54, 24]]) {
      expect(ctrlRespRateFor(frame), `${frame} Mb/s`).toBe(resp)
    }
  })

  it('Duration is a nanosecond integer, and this scene’s happen to be whole microseconds', () => {
    expect(implRow('Duration 的单位与取整').kind).toBe('differs')
    const ds = ofType(recs(), 'TX_START').map((r) => r.frame.durationFieldNs ?? 0)
    expect(ds.every((d) => Number.isInteger(d))).toBe(true)
    // 「本课的时长恰好都是整微秒」
    expect(ds.every((d) => d % US === 0)).toBe(true)
  })

  it('a countdown is only ever pushed further out, and only by somebody else’s frame', () => {
    expect(implRow('哪些帧更新 NAV').kind).toBe('faithful')
    const held = new Map<string, number>()
    let sets = 0
    for (const r of recs()) {
      if (r.type === 'NAV_SET') {
        expect(r.untilNs, `${r.node} at ${r.t}`).toBeGreaterThan(held.get(r.node) ?? 0)
        held.set(r.node, r.untilNs)
        sets++
      }
      if (r.type === 'NAV_CLEAR') held.set(r.node, 0)
    }
    expect(sets).toBeGreaterThan(500)
    // the access point is the addressee of every data frame here, and never arms itself
    expect(ofType(recs(), 'NAV_SET').some((r) => r.node === 'ap')).toBe(false)
  })

  it('the NAV is set at the instant the frame finished decoding', () => {
    for (const n of ofType(recs(), 'NAV_SET')) {
      const ok = ofType(recs(), 'RX_OK').some((r) => r.node === n.node && r.t === n.t)
      expect(ok, `${n.node} at ${n.t}`).toBe(true)
    }
  })

  it('busy is CCA busy or a running countdown: the two arms of mediumBusy', () => {
    const mac = readFileSync(resolve(ROOT, 'src/engine/mac.ts'), 'utf8')
    const m = /private mediumBusy\(\): boolean \{\s*return ([^\n]+)\n/.exec(mac)
    expect(m, 'mac.ts no longer has the one-line mediumBusy').not.toBeNull()
    const arms = m![1].replace(/;$/, '').split('||').map((s) => s.trim())
    expect(arms.length).toBe(2)
    expect(arms.filter((a) => /isCcaBusy/.test(a)).length).toBe(1)
    expect(arms.filter((a) => /navUntil/.test(a)).length).toBe(1)
  })

  it('while a countdown runs the station neither counts down nor transmits', () => {
    const until = new Map<string, number>()
    let covered = 0
    for (const r of recs()) {
      const node = 'node' in r ? r.node : undefined
      if (r.type === 'NAV_SET') { until.set(r.node, r.untilNs); continue }
      if (r.type === 'NAV_CLEAR') { until.set(r.node, 0); continue }
      if (node === undefined || r.t >= (until.get(node) ?? 0)) continue
      expect(r.type, `${node} at ${r.t}`).not.toBe('BACKOFF_DEC')
      expect(r.type, `${node} at ${r.t}`).not.toBe('TX_START')
      covered++
    }
    expect(covered).toBeGreaterThan(100)
    // and the countdown expiring is what restarts the DIFS
    const clears = ofType(recs(), 'NAV_CLEAR').filter((r) => r.node === 'sta-1')
    const ifss = ofType(recs(), 'IFS_START').filter((r) => r.node === 'sta-1')
    expect(clears.filter((c) => ifss.some((r) => r.t === c.t)).length / clears.length).toBeGreaterThan(0.5)
  })

  it('one NAV per station, and a second access point is refused by name', () => {
    expect(implRow('HE 站点的两个 NAV').kind).toBe('absent')
    const mac = readFileSync(resolve(ROOT, 'src/engine/mac.ts'), 'utf8')
    expect((mac.match(/private navUntil\b/g) ?? []).length).toBe(1)
    const sc2 = nav.scenario()
    sc2.nodes = [...sc2.nodes, { ...sc2.nodes[0], id: 'ap-2', name: 'AP 2' }]
    expect(() => ScenarioSchema.parse(sc2)).toThrow(/AP/)
  })
})

describe('nav · ③ every figure the labs print is the run', () => {
  it('lab 1: the first NAV, who set it, from whose frame, and how far', () => {
    const l = lab('第一次设置 NAV')
    expect(nav.jumps[l.jump!].label).toBe('第一次设置 NAV')
    const first = ofType(recs(), 'NAV_SET')[0]
    const [at, until, span] = figs(l.expect, /Talker A 在 (\d+) µs 解出 Talker B 发给接入点的数据帧，把 NAV 设到 (\d+) µs，即 (\d+) µs 之后/, 'lab 1')
    expect(first.node).toBe('sta-1')
    expect(first.source).toBe('data:sta-2')
    expect(first.t).toBe(at * US)
    expect(first.untilNs).toBe(until * US)
    expect(until - at).toBe(span)
    const frame = ofType(recs(), 'TX_START').filter((r) => r.node === 'sta-2' && r.t < first.t).pop()!
    expect(frame.frame.dst).toBe('ap')
    expect(frame.frame.durationFieldNs).toBe(span * US)
    expect(l.meaning).toContain(`${span} µs`)
  })

  it('lab 2: the table — a 16 µs pause, a 14-byte answer at 24 Mb/s, and the 44 µs they add to', () => {
    const l = lab('44 µs 的组成')
    const t = tableOf(l, '44 µs 的组成')
    expect(t.rows).toHaveLength(4)
    const pause = figure(t.rows[0][1], 'the pause')
    const answer = figure(t.rows[1][1], 'the answer')
    const written = figure(t.rows[2][1], 'what a data frame writes')
    const closing = figure(t.rows[3][1], 'what the answer writes')
    expect(pause).toBe(SIFS_NS)
    const [bytes] = figs(t.rows[1][0], /(\d+) 个字节/, 'the answer’s length')
    const [mbps] = figs(t.rows[1][0], /(\d+) Mb\/s/, 'the answer’s rate')
    expect(new Set(txs('ack').map((r) => r.frame.bytes))).toEqual(new Set([bytes]))
    expect(new Set(txs('ack').map((r) => r.frame.mbps))).toEqual(new Set([mbps]))
    expect(answer).toBe(txTimeNs(bytes, mbps))
    expect(new Set(txs('ack').map((r) => r.frame.txTimeNs))).toEqual(new Set([answer]))
    expect(new Set(txs('data').map((r) => r.frame.durationFieldNs))).toEqual(new Set([written]))
    expect(new Set(txs('ack').map((r) => r.frame.durationFieldNs))).toEqual(new Set([closing]))
    expect(pause + answer).toBe(written)
    expect(figs(t.heading!, /^(\d+) µs 的组成/, 'the heading')[0] * US).toBe(written)
    // the silence before every answer really is the pause
    const data = txs('data')
    for (const a of txs('ack')) {
      const d = data.filter((x) => x.frame.src === a.frame.dst && x.t + x.frame.txTimeNs <= a.t).pop()!
      expect(a.t - (d.t + d.frame.txTimeNs), `the pause before the answer at ${a.t}`).toBe(pause)
    }
    // the 出处 column cites the clauses ② and ① cite for the same figures
    expect(t.rows[2][2]).toBe('§9.3.2.1.5')
    expect(t.rows[3][2]).toBe('§9.3.1.4')
  })

  it('lab 2: the census — 576 frames, the one figure they write, 513 countdowns to the nanosecond', () => {
    const l = lab('44 µs 的组成')
    const [frames, written] = figs(l.expect, /200 ms 内 (\d+) 个数据帧填写的都是 (\d+) µs/, 'the frames counted')
    const [bytes, mbps, air, zero] = figs(l.expect, /确认帧都是 (\d+) 个字节、(\d+) Mb\/s、(\d+) µs，Duration 都是 (\d+)/, 'the answers')
    const [times] = figs(l.expect, /Listener 设置了 (\d+) 次 NAV/, 'the countdowns')
    expect(txs('data').length).toBe(frames)
    expect(new Set(txs('data').map((r) => r.frame.durationFieldNs))).toEqual(new Set([written * US]))
    expect(new Set(txs('ack').map((r) => `${r.frame.bytes}/${r.frame.mbps}/${r.frame.txTimeNs}/${r.frame.durationFieldNs}`)))
      .toEqual(new Set([`${bytes}/${mbps}/${air * US}/${zero}`]))
    const listener = ofType(recs(), 'NAV_SET').filter((r) => r.node === 'sta-3')
    expect(listener.length).toBe(times)
    const ends = new Set(txs('ack').map((r) => r.t + r.frame.txTimeNs))
    for (const n of listener) {
      expect(n.untilNs - n.t).toBe(written * US)
      expect(ends.has(n.untilNs), `the countdown at ${n.t} ends where no answer ends`).toBe(true)
    }
    expect(new Set(listener.map((r) => r.source))).toEqual(new Set(['data:sta-1', 'data:sta-2']))
  })

  it('lab 3: the figure’s three spans are the run, and the caption adds them up', () => {
    const l = lab('一段长冻结的分解')
    const fig = (l.blocks ?? []).find((b) => b.kind === 'diagram') as Extract<Block, { kind: 'diagram' }>
    expect(fig.spec).toEqual(navTiming())
    const air = lane('空口').spans
    const dur = lane('Duration').spans[0]
    const a = lane('A 等待的原因').spans
    const rs = recs()

    const [at] = figs(fig.caption!, /A 在 (\d+) µs 冻结/, 'when A freezes')
    const [total] = figs(fig.caption!, /三段合计 (\d+) µs/, 'the whole freeze')
    const [heard] = figs(fig.caption!, /第一段 (\d+) µs/, 'the span its own ear covers')
    const [booked] = figs(fig.caption!, /中间 (\d+) µs/, 'the span that is only booked')
    const [free] = figs(fig.caption!, /最后 (\d+) µs 是 DIFS/, 'the DIFS')

    const freeze = ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === at * US)!
    expect(freeze, `nothing freezes Talker A at ${at} µs`).toBeDefined()
    expect(a[0].fromUs).toBe(at)
    const bTx = ofType(rs, 'TX_START').find((r) => r.node === 'sta-2' && r.t === at * US)!
    const bEnd = ofType(rs, 'TX_END').find((r) => r.node === 'sta-2' && r.t > freeze.t)!
    expect([air[0].fromUs, air[0].toUs]).toEqual([bTx.t / US, bEnd.t / US])
    expect(a[0].toUs).toBe(bEnd.t / US)
    expect(bEnd.t - freeze.t).toBe(heard * US)

    const set = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-1' && r.t === bEnd.t)!
    expect([dur.fromUs, dur.toUs]).toEqual([set.t / US, set.untilNs / US])
    expect(set.untilNs - set.t).toBe(booked * US)
    expect(figure(dur.label!, 'the Duration lane’s label')).toBe(booked * US)
    expect([a[1].fromUs, a[1].toUs]).toEqual([dur.fromUs, dur.toUs])
    expect(a[1].tone).toBe('muted')
    const ack = txs('ack').find((r) => r.t > bEnd.t)!
    expect([air[1].fromUs, air[1].toUs]).toEqual([ack.t / US, (ack.t + ack.frame.txTimeNs) / US])

    const difs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-1' && r.t === set.untilNs)!
    expect(difs.kind).toBe('DIFS')
    expect(difs.untilNs - difs.t).toBe(free * US)
    expect(free * US).toBe(DIFS_NS)
    expect([a[2].fromUs, a[2].toUs]).toEqual([difs.t / US, difs.untilNs / US])
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === difs.untilNs)!
    expect(resume.t - freeze.t).toBe(total * US)
    expect(heard + booked + free).toBe(total)
  })

  it('lab 3: the counter, the quiet 16 µs, the 28 µs answer, and three slots to the frame', () => {
    const l = lab('一段长冻结的分解')
    const rs = recs()
    const [at, owed] = figs(l.expect, /A 在 (\d+) µs 冻结，计数为 (\d+)/, 'the freeze')
    const [quiet, answer] = figs(l.expect, /前 (\d+) µs 空口空闲、A 自己的侦听也报空闲，后 (\d+) µs 是接入点的确认帧/, 'the reserved span')
    const [until, resumed] = figs(l.expect, /到 (\d+) µs 之后，计数从 (\d+) 继续/, 'the resume')
    const slots = zhCount(/([〇一二三四五六七八九十两]+)个时隙之后 A 发送/.exec(l.expect)![1])
    const freeze = ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-1' && r.t === at * US)!
    expect(freeze.value).toBe(owed)
    const set = ofType(rs, 'NAV_SET').find((r) => r.node === 'sta-1' && r.t > freeze.t)!
    const ack = txs('ack').find((r) => r.t > set.t)!
    expect(ack.node).toBe('ap')
    expect(ack.t - set.t).toBe(quiet * US)
    expect(ack.frame.txTimeNs).toBe(answer * US)
    expect(quiet + answer).toBe((set.untilNs - set.t) / US)
    // A's own CCA really is idle in the quiet span and busy for the answer
    const cca = rs.filter((r) => (r.type === 'CCA_IDLE' || r.type === 'CCA_BUSY') && r.node === 'sta-1' && r.t >= set.t && r.t <= ack.t)
    expect(cca.map((r) => [r.type, r.t])).toEqual([['CCA_IDLE', set.t], ['CCA_BUSY', ack.t]])
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-1' && r.t === until * US)!
    expect(resume.value).toBe(resumed)
    expect(resumed).toBe(owed)
    const tx = ofType(rs, 'TX_START').find((r) => r.node === 'sta-1' && r.t > resume.t)!
    expect(tx.t - resume.t).toBe(slots * SLOT_NS)
    expect(slots).toBe(owed)
    // the steps walk the same two instants
    const [from, to] = figs(l.steps.join('\n'), /从 (\d+) µs 逐步推进到 (\d+) µs/, 'the walk')
    expect([from, to]).toEqual([at, until])
    expect(l.meaning).toContain(`${set.t / US} µs`)
    expect(l.meaning).toContain(`${quiet} µs`)
  })

  it('the figure lays out inside the viewBox, legibly, with no two labels touching', () => {
    const lay = layoutDiagram(navTiming())
    const ts = lay.shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    expect(ts.length).toBeGreaterThan(5)
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

  it('why and sources quote the run’s own figures', () => {
    const [p, a, sum] = figs(nav.why!, /数据帧填写的都是 (\d+) \+ (\d+) = (\d+) µs/, 'why')
    expect(p * US).toBe(SIFS_NS)
    expect(new Set(txs('ack').map((r) => r.frame.txTimeNs))).toEqual(new Set([a * US]))
    expect(new Set(txs('data').map((r) => r.frame.durationFieldNs))).toEqual(new Set([sum * US]))
    const [frame, answer] = figs(nav.sources!.join('\n'), /(\d+) µs 的帧、(\d+) µs 的确认帧/, 'sources')
    const b = ofType(recs(), 'TX_START').find((r) => r.node === 'sta-2' && r.t === lane('空口').spans[0].fromUs * US)!
    expect(b.frame.txTimeNs, 'the frame the figure draws').toBe(frame * US)
    expect(new Set(txs('ack').map((r) => r.frame.txTimeNs))).toEqual(new Set([answer * US]))
  })
})
