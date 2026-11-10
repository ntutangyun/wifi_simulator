/**
 * `@mumimo`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11be-2024 §36.1.1, §35.7.1, §36.3.12.8.1 and IEEE Std 802.11-2024
 * §27.1.1, §26.7.1–3, §27.3.3.1.2, §26.5.1.1, §10.3.2.13.2; ② says what `transmitDlMu` /
 * `fitsStreams` (src/engine/mac.ts) do, and each row naming an engine behaviour is pinned here;
 * ③'s figures are read back out of the lesson text and compared with 500 ms runs of the two
 * variants.
 *
 * `tests/course/quoted-timestamps.test.ts` keeps its own pins on these runs (the clean OFDMA and
 * MU-MIMO sends, the 196 / 122 / 65 / 9 split, the added-phones experiment);
 * `tests/course/lesson-claims.test.ts` owns the backup-off experiment; `mumimo-choose` loads the
 * same scene.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { mumimo, mumimoTopology } from '../../src/course/tier2/mumimo'
import { mumimoScenario } from '../../src/course/wifiScenes'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { MODULES } from '../../src/course/curriculum'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { PHY_MODES } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 500 * MS
const SIFS_NS = 16 * US
const PHONES = ['sta-1', 'sta-2', 'sta-3']
const NAME: Record<string, string> = { 'sta-1': '手机 1', 'sta-2': '手机 2', 'sta-3': '手机 3' }
const FREQ = 0
const SPACE = 1

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const muSends = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)
const usText = (ns: number): string => `${(ns / US).toFixed(1)} µs`
const run = (v: number): TLRecord[] => runOf(mumimo, v, RUN_NS)

const lab = (heading: string): Lab => {
  const l = mumimo.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = mumimo.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => mumimo.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

/** AP-queued MSDUs per destination at instant `t` (ENQUEUE minus DEQUEUE before it). */
const pendingAt = (rs: TLRecord[], t: number): Map<string, number[]> => {
  const dst = new Map<number, { to: string; bytes: number }>()
  const live = new Set<number>()
  for (const r of rs) {
    if (r.t >= t) break
    if (r.type === 'ENQUEUE' && r.node === 'ap') { dst.set(r.msduId, { to: r.dst, bytes: r.bytes }); live.add(r.msduId) }
    if (r.type === 'DEQUEUE' && r.node === 'ap') live.delete(r.msduId)
  }
  const out = new Map<string, number[]>()
  for (const id of live) {
    const m = dst.get(id)!
    out.set(m.to, [...(out.get(m.to) ?? []), m.bytes])
  }
  return out
}

/** One round of acknowledgement one SIFS after the send, or a collision with the laptop. */
const settled = (rs: TLRecord[]): { ok: number; collided: number } => {
  let ok = 0, collided = 0
  for (const s of muSends(rs)) {
    const bas = txs(rs, (r) => (r.frame.kind === 'ba' || r.frame.kind === 'mba') && r.t === s.t + s.frame.txTimeNs + SIFS_NS)
    if (bas.length > 0) { ok++; continue }
    const hit = rs.some((r) => r.type === 'COLLISION' && r.t >= s.t && r.t <= s.t + s.frame.txTimeNs)
    expect(hit, `the send at ${s.t} was neither acknowledged nor collided with`).toBe(true)
    collided++
  }
  return { ok, collided }
}

lessonShapeSuite(mumimo, { runNs: RUN_NS })

describe('mumimo · the lesson', () => {
  it('is in the standard-first shape, in the scheduled Wi-Fi module', () => {
    expect(isStandardFirst(mumimo)).toBe(true)
    expect(MODULES[mumimo.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(mumimo.needs).toEqual(['streams', 'ofdma-dl'])
    expect(mumimo.terms!.map((t) => t.term)).toEqual(['MU-MIMO', 'beamforming', 'sounding'])
    expect(mumimo.limits).toEqual([])
    expect(mumimo.observe).toEqual([])
    expect(mumimo.tryThis).toEqual([])
  })

  it('keeps the same house and the same two variants, differing in one feature flag', () => {
    expect(mumimo.scenario()).toEqual(mumimoScenario(false))
    expect(mumimo.variants!.map((v) => v.label)).toEqual(['OFDMA（按频率划分）', 'MU-MIMO（按空间划分）'])
    expect(mumimo.variants![FREQ].scenario()).toEqual(mumimoScenario(false))
    expect(mumimo.variants![SPACE].scenario()).toEqual(mumimoScenario(true))
    for (const v of mumimo.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    const sc = mumimoScenario(true)
    expect(sc.nodes.find((n) => n.id === 'ap')!.caps.nss).toBe(4)
    for (const p of PHONES) expect(sc.nodes.find((n) => n.id === p)!.caps.nss).toBe(2)
    expect(sc.nodes.find((n) => n.id === 'ap')!.caps.widthMhz).toBe(160)
  })

  it('cites each clause it teaches in ①, and nothing in ① is the simulator', () => {
    const std = stdText()
    for (const c of ['802.11be-2024 §36.1.1', '§27.1.1', '§35.7.1', '§26.7.1', '§26.7.3', '§26.7.2', '§27.3.3.1.2', '§36.3.12.8.1', '§26.5.1.1', '§10.3.2.13.2']) {
      expect(std, c).toContain(c)
    }
    for (const sim of ['本仿真器', '引擎', '1000 字节']) expect(std).not.toContain(sim)
    expect(std).toContain('最多 8 个用户，每个用户最多 4 条空间流，合计不超过 8 条')
    expect(std).toContain('不小于 242 音调')
    expect(std).toContain('不小于 106 音调')
  })

  it('② is not all faithful, and the sounding is absent', () => {
    const kinds = new Set(mumimo.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'value', 'choice', 'differs', 'absent'] as const) expect(kinds.has(k), k).toBe(true)
    expect(implRow('探测').kind).toBe('absent')
    expect(implRow('资源单元内的 MU-MIMO').kind).toBe('absent')
  })
})

describe('mumimo · ② says what the engine does, and the engine does it', () => {
  it('no sounding frame is ever sent, in either variant', () => {
    for (const v of [FREQ, SPACE]) {
      const kinds = new Set(txs(run(v)).map((r) => r.frame.kind))
      for (const k of kinds) expect(['data', 'ba', 'mba', 'ack', 'trigger', 'rts', 'cts']).toContain(k)
      expect(kinds.has('trigger')).toBe(false)
    }
  })

  it('streams within the router’s own four, trimmed from the end; whole width each; at most four members', () => {
    const mac = readFileSync('src/engine/mac.ts', 'utf8')
    expect(mac).toContain('streams <= this.cfg.ownNss()')
    expect(mac).toContain('mumimoGroup = mumimoGroup.slice(0, -1)')
    expect(mac).toContain('muDsts.slice(0, 4)')
    expect(mac).toContain('const MUMIMO_MIN_BYTES = 1000')
    for (const r of muSends(run(SPACE))) {
      expect(r.frame.muKind).toBe('mumimo')
      const parts = r.frame.muParts!
      expect(parts.length).toBeGreaterThanOrEqual(2)
      expect(parts.length).toBeLessThanOrEqual(4)
      expect(parts.reduce((s, p) => s + (p.nss ?? 1), 0)).toBeLessThanOrEqual(4)
      for (const p of parts) expect(p.ruFraction).toBeUndefined()
    }
    expect(implRow('流数约束').sim).toContain('本课 4 条')
    expect(implRow('成员数上限').sim).toContain('四个')
    expect(implRow('何时用 MU-MIMO').sim).toContain('1000 字节')
  })

  it('MU-MIMO never mixes with OFDMA: no send of either variant is both', () => {
    for (const v of [FREQ, SPACE]) {
      for (const r of muSends(run(v))) {
        const sliced = r.frame.muParts!.some((p) => p.ruFraction !== undefined)
        expect(sliced, String(r.t)).toBe(r.frame.muKind === 'ofdma')
      }
    }
  })

  it('every member answers by itself one SIFS later; the extra opening is 4 µs', () => {
    const rs = run(SPACE)
    let answered = 0
    for (const s of muSends(rs)) {
      const bas = txs(rs, (r) => r.frame.kind === 'ba' && r.t === s.t + s.frame.txTimeNs + SIFS_NS)
      if (bas.length === 0) continue // talked over by the laptop: lab 3 counts these
      answered++
      expect(bas.map((r) => r.node).sort()).toEqual(s.frame.muParts!.map((p) => p.dst).sort())
    }
    expect(answered).toBe(settled(rs).ok)
    expect(PHY_MODES.eht.muExtraPreambleNs).toBe(4 * US)
    expect(implRow('信令开销').sim).toContain(`${PHY_MODES.eht.muExtraPreambleNs / US} µs`)
    // two members each giving up half the power: 10·log10(2) to the printed precision
    expect(Math.round(10 * Math.log10(2))).toBe(3)
    expect(implRow('功率分配').sim).toContain('各少 3 dB')
  })
})

describe('mumimo · ③ every figure the labs print is the run', () => {
  it('lab 1: the first send by space, the figure, and the trim table', () => {
    const rs = run(SPACE)
    const first = muSends(rs)[0]
    const members = first.frame.muParts!.map((p) => p.dst)
    const l = lab('第一次按空间划分的发送')
    expect(l.variant).toBe(SPACE)
    expect(l.expect).toContain(`${usText(first.t)} 路由器发出一个 ${usText(first.frame.txTimeNs)} 的 MU-MIMO 发送`)
    expect(l.expect).toContain(`成员是${members.map((m) => NAME[m]).join(' 和')}`)
    expect(new Set(first.frame.muParts!.map((p) => p.nss))).toEqual(new Set([2]))
    expect(first.frame.widthMhz).toBe(160)
    expect(l.expect).toContain(`各用两条流、各占整条 ${first.frame.widthMhz} MHz`)
    const trimmed = PHONES.filter((p) => !members.includes(p))
    expect(trimmed).toEqual(['sta-1'])
    expect(l.expect).toContain(`${NAME[trimmed[0]]} 不在其中`)
    // 「而那一刻路由器的队列里有发给它的帧」, and all three phones were queued with ≥ 1000 B
    const pending = pendingAt(rs, first.t)
    for (const p of PHONES) {
      expect(pending.get(p)?.length ?? 0, p).toBeGreaterThan(0)
      expect(Math.min(...pending.get(p)!), p).toBeGreaterThanOrEqual(1000)
    }
    // the figure is this send
    const spec = mumimoTopology()
    expect(new Set(spec.ring!.nodes)).toEqual(new Set(['ap', ...members]))
    expect(spec.links.filter((x) => x.tone === 'muted').map((x) => x.to)).toEqual(trimmed)
    expect(l.blocks!.find((b) => b.kind === 'diagram')!.caption).toContain(`${NAME[trimmed[0]]} 这一轮被裁掉`)
    // the table
    const cells = Object.fromEntries(tableOf(l, '三部手机都有数据排队的那一轮，按本仿真器的规则裁减').rows.map((r) => [r[0], r[1]]))
    const sc = mumimoScenario(true)
    const own = sc.nodes.find((n) => n.id === 'ap')!.caps.nss!
    const need = PHONES.reduce((s, p) => s + sc.nodes.find((n) => n.id === p)!.caps.nss!, 0)
    expect(cells['队列中有数据的手机']).toBe(String(PHONES.filter((p) => pending.has(p)).length))
    expect(cells['都协商过 MU-MIMO，且队首都不少于 1000 字节']).toBe('是')
    expect(cells['三部所需的流数，与路由器的四条相比']).toBe(`${need} > ${own}`)
    expect(need).toBeGreaterThan(own)
    expect(cells['裁减后的成员']).toBe(String(members.length))
    expect(cells['每个成员得到的信道']).toBe(`整条 ${first.frame.widthMhz} MHz`)
    expect(cells['每个成员的流数']).toBe('2')
    // the quiz's 「六条，比路由器拥有的多出一半」
    expect(need / own).toBe(1.5)
    expect(mumimo.quiz[0].options[1]).toContain('六条')
    expect(mumimo.why).toContain('四根天线，三部手机各要两条流')
  })

  it('lab 2: the same instant by frequency holds all three phones', () => {
    const freq = muSends(run(FREQ))[0]
    const space = muSends(run(SPACE))[0]
    expect(freq.t).toBe(space.t)
    expect(freq.frame.muKind).toBe('ofdma')
    expect(freq.frame.muParts!.map((p) => p.dst).sort()).toEqual(PHONES)
    expect(new Set(freq.frame.muParts!.map((p) => p.ruFraction))).toEqual(new Set([1 / 3]))
    const l = lab('同一时刻按频率划分')
    expect(l.variant).toBeUndefined()
    expect(mumimo.scenario()).toEqual(mumimo.variants![FREQ].scenario())
    expect(l.expect).toContain(`同样在 ${usText(freq.t)}，路由器把三部手机都编进一个 ${usText(freq.frame.txTimeNs)} 的 OFDMA 发送，每部占三分之一条信道`)
    expect(l.expect).toContain(`发送长 ${usText(space.frame.txTimeNs)}`)
  })

  it('lab 3: 500 ms of grouping under each variant, and where the trimmed phone goes', () => {
    const f = run(FREQ), s = run(SPACE)
    const size = (rs: TLRecord[], n: number) => muSends(rs).filter((r) => r.frame.muParts!.length === n).length
    const sf = settled(f), ss = settled(s)
    const l = lab('500 ms 里的分组')
    expect(tableOf(l, '500 ms，两种划分').rows).toEqual([
      ['多用户发送', String(muSends(f).length), String(muSends(s).length)],
      ['其中三个成员', String(size(f, 3)), String(size(s, 3))],
      ['其中两个成员', String(size(f, 2)), String(size(s, 2))],
      [`${SIFS_NS / US} µs 后一轮确认完成`, String(sf.ok), String(ss.ok)],
      ['与笔记本的发送碰撞', String(sf.collided), String(ss.collided)],
    ])
    expect(size(f, 2) + size(f, 3)).toBe(muSends(f).length)
    expect(size(s, 2)).toBe(muSends(s).length)
    expect(ofType(f, 'COLLISION').every((c) => c.nodes.includes('sta-4') || c.nodes.includes('ap'))).toBe(true)

    // where the trimmed phone turns up next
    const ap = txs(s, (r) => r.node === 'ap' && r.frame.kind === 'data')
    let su = 0, nextMu = 0, neither = 0
    const pairs = ap.filter((r) => r.frame.muParts?.length === 2)
    for (const mu of pairs) {
      const inside = new Set(mu.frame.muParts!.map((p) => p.dst))
      const out = PHONES.find((p) => !inside.has(p))!
      const i = ap.indexOf(mu)
      const next = ap[i + 1]
      if (next && next.frame.muParts === undefined && next.frame.dst === out) { su++; continue }
      const later = ap.slice(i + 1).find((r) => r.frame.muParts !== undefined)
      if (later && later.frame.muParts!.some((p) => p.dst === out)) nextMu++
      else neither++
    }
    const pct = (n: number) => `${n}（${Math.round((n / pairs.length) * 100)}%）`
    expect(tableOf(l, '按空间划分时，被裁掉的手机接下来').rows).toEqual([
      ['紧接着得到自己的单用户发送', pct(su)],
      ['出现在下一次组成的配对里', pct(nextMu)],
      ['两者都不是，要再等一轮', pct(neither)],
    ])
    expect(su + nextMu + neither).toBe(pairs.length)
    expect(l.expect).toContain(`按空间划分的 ${muSends(s).length} 次发送全部只有两个成员；按频率划分的 ${muSends(f).length} 次里有 ${size(f, 3)} 次三个成员`)
    expect(su).toBeGreaterThan(nextMu + neither)
  })
})
