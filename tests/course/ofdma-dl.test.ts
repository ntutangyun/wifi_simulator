/**
 * `@ofdma-dl`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 §27.3.2.2, §27.3.11.8.1, §26.5.1.1, §10.3.2.13.2 and Table 27-61;
 * ② says what `transmitDlMu` / `buildMuParts` (src/engine/mac.ts) do, and each row that names an
 * engine behaviour is pinned against the run here; ③'s figures are read back out of the lesson
 * text and compared with 300 ms runs of the base scene and its two variants. Editing a number in
 * the lesson without the engine agreeing turns this red, and so does an engine change that moves
 * a number the lesson still prints.
 *
 * `tests/course/lesson-claims.test.ts` keeps its own pin on this scene (every multi-user PPDU
 * serves two televisions and their BlockAcks start together one SIFS later).
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ofdmaDl, ofdmaDlScenario, muPpduFields, MU_SYMBOLS } from '../../src/course/tier2/ofdma-dl'
import { isStandardFirst, oneRoom, node, sc, type Block, type Lab } from '../../src/course/lessonKit'
import { MODULES } from '../../src/course/curriculum'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MAX_PPDU_NS, PHY_MODES, toneRatio } from '../../src/engine/phy'
import { lessonShapeSuite, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
/** The window every number in this lesson is measured over. */
const RUN_NS = 300 * MS
const SIFS_NS = 16 * US
const TVS = ['sta-1', 'sta-2', 'sta-3']
const NAME: Record<string, string> = { 'sta-1': '电视 1', 'sta-2': '电视 2', 'sta-3': '电视 3' }
const OFF = 0
const TV1_OFF = 1

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const muPpdus = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)
const suData = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'data' && r.frame.muParts === undefined)
const airNs = (xs: Tx[]): number => xs.reduce((a, r) => a + r.frame.txTimeNs, 0)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
const usText = (ns: number): string => `${(ns / US).toFixed(1)} µs`
const msText = (ns: number): string => `${(ns / MS).toFixed(1)} ms`

const base = (): TLRecord[] => runOf(ofdmaDl, undefined, RUN_NS)
const off = (): TLRecord[] => runOf(ofdmaDl, OFF, RUN_NS)
const tv1Off = (): TLRecord[] => runOf(ofdmaDl, TV1_OFF, RUN_NS)
const delivered = (rs: TLRecord[]): number[] => TVS.map((p) =>
  suData(rs).filter((r) => r.frame.dst === p).length
  + muPpdus(rs).flatMap((r) => r.frame.muParts!).filter((m) => m.dst === p).length)
const apData = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'data')

const lab = (heading: string): Lab => {
  const l = ofdmaDl.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = ofdmaDl.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => ofdmaDl.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(ofdmaDl, { runNs: RUN_NS })

describe('ofdma-dl · the lesson', () => {
  it('is in the standard-first shape, in the scheduled Wi-Fi module', () => {
    expect(isStandardFirst(ofdmaDl)).toBe(true)
    expect(MODULES[ofdmaDl.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(ofdmaDl.needs).toEqual(['width', 'txop'])
    expect(ofdmaDl.terms!.map((t) => t.term)).toEqual(['OFDMA', 'resource unit', 'RU', 'MU'])
    expect(ofdmaDl.limits).toEqual([])
    expect(ofdmaDl.observe).toEqual([])
    expect(ofdmaDl.tryThis).toEqual([])
  })

  it('keeps the room it always had, and the two variants only switch OFDMA off', () => {
    // The literal the lesson shipped with before the conversion, so the hash fixture stays put.
    const was = sc(oneRoom(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'TV 1', 'sta', 3, 5.5, 'he', 'video'),
      node('sta-2', 'TV 2', 'sta', 5, 6.5, 'he', 'video'),
      node('sta-3', 'TV 3', 'sta', 7, 5.5, 'he', 'video'),
    ])
    expect(ofdmaDl.scenario()).toEqual(was)
    expect(() => ScenarioSchema.parse(ofdmaDl.scenario())).not.toThrow()
    expect(ofdmaDl.variants!.map((v) => v.label)).toEqual(['OFDMA 全部关闭', '电视 1 关闭 OFDMA'])
    const flags = (i: number) => ofdmaDl.variants![i].scenario().nodes.map((n) => n.caps.features?.ofdma)
    expect(flags(OFF)).toEqual([false, false, false, false])
    expect(flags(TV1_OFF)).toEqual([was.nodes[0].caps.features?.ofdma, false, was.nodes[2].caps.features?.ofdma, was.nodes[3].caps.features?.ofdma])
    expect(was.nodes.every((n) => n.caps.features?.ofdma !== false)).toBe(true)
    for (const v of ofdmaDl.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    expect(ofdmaDlScenario()).toEqual(was)
  })

  it('cites each clause it teaches in ①, and nothing in ① is the simulator', () => {
    const std = stdText()
    for (const c of ['§27.3.2.2', '表 27-7', '表 27-8', '§27.3.11.8.1', '§26.5.1.2', '§26.5.1.1', '§10.3.2.13.2', '§26.4.4.3', '§10.13', '表 27-61', '§26.5.2.3.1', '§27.5.1']) {
      expect(std, c).toContain(c)
    }
    for (const sim of ['本仿真器', '引擎', '1/n']) expect(std).not.toContain(sim)
    // Table 27-7's 20 MHz column, and aPPDUMaxTime of Table 27-61, as ① prints them.
    expect(std).toContain('九个 26 音调、四个 52 音调、两个 106 音调或一个 242 音调')
    expect(std).toContain(`${MAX_PPDU_NS / MS} ms`)
  })

  it('② is not all faithful, and names what differs', () => {
    const kinds = new Set(ofdmaDl.implementation!.map((r) => r.kind))
    expect(kinds.has('differs')).toBe(true)
    expect(kinds.size).toBeGreaterThan(2)
    expect(implRow('资源单元尺寸').kind).toBe('differs')
    expect(implRow('确认的征询').kind).toBe('differs')
  })
})

describe('ofdma-dl · ② says what the engine does, and the engine does it', () => {
  it('equal shares: every member of every group gets 1/n of the channel', () => {
    for (const r of muPpdus(base())) {
      const parts = r.frame.muParts!
      for (const p of parts) expect(p.ruFraction).toBe(1 / parts.length)
    }
    expect(implRow('资源单元尺寸').sim).toContain('1/n')
  })

  it('two to four members, the four being one line of mac.ts', () => {
    for (const r of muPpdus(base())) {
      expect(r.frame.muParts!.length).toBeGreaterThanOrEqual(2)
      expect(r.frame.muParts!.length).toBeLessThanOrEqual(4)
    }
    const mac = readFileSync('src/engine/mac.ts', 'utf8')
    expect(mac).toContain('muDsts.slice(0, 4)')
    expect(mac).toContain('muDsts.length >= 2')
    expect(implRow('成员数上限').sim).toContain('四个')
    expect(implRow('选哪些站点').sim).toContain('不少于两个')
  })

  it('the opening is 44 + 4 µs and a symbol 13.6 µs, as the row says', () => {
    expect(PHY_MODES.he.preambleNs).toBe(44 * US)
    expect(PHY_MODES.he.muExtraPreambleNs).toBe(4 * US)
    expect(PHY_MODES.he.symNs).toBe(13.6 * US)
    const row = implRow('PPDU 格式与时长').sim
    for (const s of ['44 µs', '4 µs', '13.6 µs']) expect(row).toContain(s)
    // every multi-user send is that formula with its longest member's symbol count
    for (const r of muPpdus(base())) {
      const parts = r.frame.muParts!
      const symbolsOf = (p: typeof parts[number]): number => {
        const bps = PHY_MODES.he.ndbps[p.mcs] * toneRatio('he', r.frame.widthMhz ?? 20) * (p.nss ?? 1) * p.ruFraction!
        return Math.ceil((16 + 8 * p.bytes + 6) / bps)
      }
      expect(r.frame.txTimeNs).toBe(PHY_MODES.he.preambleNs + PHY_MODES.he.muExtraPreambleNs
        + PHY_MODES.he.symNs * Math.max(...parts.map(symbolsOf)))
    }
  })

  it('no Trigger frame and no solicitation: every member answers by itself, 32 µs at 24 Mb/s', () => {
    const rs = base()
    expect(txs(rs, (r) => r.frame.kind === 'trigger')).toEqual([])
    for (const m of muPpdus(rs)) {
      const bas = txs(rs, (r) => r.frame.kind === 'ba' && r.t === m.t + m.frame.txTimeNs + SIFS_NS)
      expect(bas.map((r) => r.node).sort()).toEqual(m.frame.muParts!.map((p) => p.dst).sort())
      for (const b of bas) {
        expect(b.frame.txTimeNs).toBe(32 * US)
        expect(b.frame.mbps).toBe(24)
        expect(b.frame.bytes).toBe(32)
      }
    }
    const row = implRow('确认的征询').sim
    for (const s of ['32 字节', '24 Mb/s', '32 µs']) expect(row).toContain(s)
  })

  it('the PPDU cap is aPPDUMaxTime, 5.484 ms', () => {
    expect(MAX_PPDU_NS).toBe(5_484_000)
    expect(implRow('时长上限').sim).toContain(`${MAX_PPDU_NS / MS} ms`)
  })
})

describe('ofdma-dl · ③ every figure the labs print is the run', () => {
  it('lab 1: the first multi-user send, its members, and the worked table', () => {
    const rs = base()
    const first = muPpdus(rs)[0]
    const l = lab('第一次多用户发送')
    const members = first.frame.muParts!.map((p) => p.dst)
    expect(l.expect).toContain(`${usText(first.t)} 接入点发出一个 ${usText(first.frame.txTimeNs)} 的 HE MU PPDU`)
    expect(l.expect).toContain(`成员是${members.map((m) => NAME[m]).join(' 和')}`)
    const bytes = one(first.frame.muParts!.map((p) => p.bytes))
    expect(l.expect).toContain(`各承载 ${bytes} 字节`)
    expect(one(first.frame.muParts!.map((p) => p.ruFraction))).toBe(0.5)
    expect(l.expect).toContain('各占半条信道')
    expect(l.expect).toContain(`各需 ${MU_SYMBOLS} 个符号`)
    const left = TVS.filter((t) => !members.includes(t))
    expect(left).toHaveLength(1)
    expect(l.expect).toContain(`${NAME[left[0]]} 不在其中`)

    // 「那一刻接入点的队列里没有发给它的帧」 — and the same for every send of the run.
    const dstOf = new Map<number, string>()
    for (const r of rs) if (r.type === 'ENQUEUE' && r.node === 'ap') dstOf.set(r.msduId, r.dst)
    const pending = new Set<number>()
    let checked = 0
    for (const r of rs) {
      if (r.type === 'ENQUEUE' && r.node === 'ap') pending.add(r.msduId)
      if (r.type === 'DEQUEUE' && r.node === 'ap') pending.delete(r.msduId)
      if (r.type !== 'TX_START' || r.frame.kind !== 'data' || r.frame.muParts === undefined) continue
      const inside = new Set(r.frame.muParts.map((p) => p.dst))
      for (const t of TVS.filter((p) => !inside.has(p))) {
        checked++
        expect([...pending].filter((id) => dstOf.get(id) === t).length, `${t} at ${r.t}`).toBe(0)
      }
    }
    expect(checked).toBe(muPpdus(rs).length)

    const cells = Object.fromEntries(tableOf(l, '第一次多用户发送，按本仿真器的公式算一遍').rows.map((r) => [r[0], r[1]]))
    const ndbps = PHY_MODES.he.ndbps[one(first.frame.muParts!.map((p) => p.mcs))]
    const bits = 16 + 8 * bytes + 6
    const perSym = ndbps * 0.5
    expect(cells['此刻队列中有数据的电视']).toBe(String(members.length))
    expect(cells['每个成员分到的信道']).toBe(`1/${members.length}`)
    expect(cells['每个成员每符号比特数']).toBe(`${ndbps} × 0.5 = ${perSym}`)
    expect(cells['每个成员的字节']).toBe(`${bytes} B`)
    expect(cells['每个成员的符号数']).toBe(`⌈(16 + 8 × ${bytes} + 6) ÷ ${perSym}⌉ = ⌈${bits} ÷ ${perSym}⌉ = ${Math.ceil(bits / perSym)}`)
    expect(Math.ceil(bits / perSym)).toBe(MU_SYMBOLS)
    expect(cells['这一帧的时长']).toBe(`${PHY_MODES.he.preambleNs / US} + ${PHY_MODES.he.muExtraPreambleNs / US} + ${PHY_MODES.he.symNs / US} × ${MU_SYMBOLS} = ${usText(first.frame.txTimeNs)}`)

    // the figure: three boxes that add up to the send
    const spec = muPpduFields()
    expect(spec.fields.map((f) => f.size)).toEqual([PHY_MODES.he.preambleNs / US, PHY_MODES.he.muExtraPreambleNs / US, (MU_SYMBOLS * PHY_MODES.he.symNs) / US])
    expect(spec.total).toBe(`共 ${usText(first.frame.txTimeNs)}`)
  })

  it('lab 2: the two BlockAcks start one SIFS after, together, and no Trigger frame was ever sent', () => {
    const rs = base()
    const first = muPpdus(rs)[0]
    const bas = txs(rs, (r) => r.frame.kind === 'ba' && r.frame.orthogonalGroup === first.frame.orthogonalGroup)
    expect(bas).toHaveLength(2)
    const t = one(bas.map((b) => b.t))
    expect(t).toBe(first.t + first.frame.txTimeNs + SIFS_NS)
    const l = lab('两个块确认同时开始')
    expect(l.expect).toContain(`${usText(t)}，即那一帧结束后 ${SIFS_NS / US} µs`)
    expect(l.expect).toContain(`${bas.map((b) => b.node).sort().map((n) => NAME[n]).join(' 和')} 同时开始`)
    expect(l.expect).toContain(`各 ${one(bas.map((b) => b.frame.txTimeNs)) / US} µs`)
    expect(txs(rs, (r) => r.frame.kind === 'trigger')).toHaveLength(0)
    expect(l.expect).toContain('一个触发帧也没有发')
    // the jump lands on one of these two
    const target = rs.find(ofdmaDl.jumps[1].find)!
    expect(target.t).toBe(t)
  })

  it('lab 3: the whole run with OFDMA on and off', () => {
    const on = base()
    const no = off()
    const l = lab('开与关 OFDMA：同样的帧，更少的空口时间')
    const rows = tableOf(l, '300 ms，开与关 OFDMA').rows
    const cell = (label: string) => rows.find((r) => r[0] === label)!
    expect(cell('接入点的数据发送次数').slice(1)).toEqual([String(apData(on).length), String(apData(no).length)])
    expect(cell('其中包含两台电视的').slice(1)).toEqual([String(muPpdus(on).length), String(muPpdus(no).length)])
    expect(cell('电视 1 / 2 / 3 收到的帧').slice(1)).toEqual([delivered(on).join(' / '), delivered(no).join(' / ')])
    expect(delivered(on)).toEqual(delivered(no))
    expect(cell('空口忙碌的总时间').slice(1)).toEqual([msText(airNs(txs(on))), msText(airNs(txs(no)))])
    expect(new Set(muPpdus(on).map((r) => r.frame.muParts!.length))).toEqual(new Set([2]))

    // the 1.44 ms, and the arithmetic that makes it
    const saved = airNs(txs(no)) - airNs(txs(on))
    const pairs = muPpdus(on).length
    const su = suData(on)
    const suFrame = one(su.map((r) => r.frame.txTimeNs))
    const ack = one(txs(on, (r) => r.frame.kind === 'ack').map((r) => r.frame.txTimeNs))
    const ba = one(txs(on, (r) => r.frame.kind === 'ba').map((r) => r.frame.txTimeNs))
    const mu = one(muPpdus(on).map((r) => r.frame.txTimeNs))
    const opening = 2 * suFrame - mu
    const handedBack = 2 * ba - 2 * ack
    expect(saved).toBe(pairs * (opening - handedBack))
    expect(l.expect).toContain(`开 OFDMA 时接入点发了 ${apData(on).length} 次，其中 ${pairs} 次包含两台电视；关掉后发了 ${apData(no).length} 次`)
    expect(l.expect).toContain(`空口忙碌时间少 ${saved / MS} ms`)
    expect(l.expect).toContain(`前导码省下 ${opening / US} µs`)
    expect(l.expect).toContain(`又多用 ${handedBack / US} µs，${pairs} × ${(opening - handedBack) / US} µs = ${saved / MS} ms`)
    expect(ofdmaDl.why).toContain(`组成 ${pairs} 对，空口忙碌时间少 ${saved / MS} ms`)
    expect(ofdmaDl.why).toContain(`${RUN_NS / MS} ms`)
    expect(ofdmaDl.quiz[1].explain).toContain(`${RUN_NS / MS} ms 内节省了 ${saved / MS} ms`)

    // the second table: the same two frames sent one way and the other
    const way = tableOf(l, '同样两个视频帧，两种发法').rows
    const suSyms = (suFrame - PHY_MODES.he.preambleNs) / PHY_MODES.he.symNs
    expect(way[0]).toEqual(['逐帧发送', `${PHY_MODES.he.preambleNs / US} µs × 2`, `${suSyms} + ${suSyms}`, `${usText(suFrame)} × 2`, `两个 ${ack / US} µs 的确认帧，先后发送`])
    expect(way[1]).toEqual(['一个 HE MU PPDU', `${PHY_MODES.he.preambleNs / US} + ${PHY_MODES.he.muExtraPreambleNs / US} µs`, String(MU_SYMBOLS), usText(mu), `两个 ${ba / US} µs 的块确认，同时开始`])
  })

  it('lab 4: with television 1 off OFDMA, only televisions 2 and 3 pair', () => {
    const rs = tv1Off()
    const mu = muPpdus(rs)
    const l = lab('一台电视不协商 OFDMA')
    expect(l.variant).toBe(TV1_OFF)
    expect(l.expect).toContain(`多用户发送只剩 ${mu.length} 次`)
    expect(new Set(mu.flatMap((r) => r.frame.muParts!.map((p) => p.dst)))).toEqual(new Set(['sta-2', 'sta-3']))
    expect(l.expect).toContain('成员都是电视 2 和电视 3')
    expect(suData(rs).filter((r) => r.frame.dst === 'sta-1').length).toBeGreaterThan(300)
    expect(l.meaning).toContain(`从 ${muPpdus(base()).length} 降到 ${mu.length}`)
  })
})
