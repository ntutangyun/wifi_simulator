/**
 * `@hidden`, in the standard-first shape (2026-11-11).
 *
 * ① is IEEE Std 802.11-2024's hidden station, the two CCA requirements, the DCF backoff, the
 * AckTimeout and the closing Ack's zero Duration; ② says what the engine does with each and is
 * checked here against the engine; ③'s four runs print figures, and every one of them is read back
 * out of the lesson text and compared with a run of the lesson's own corridor scene.
 *
 * Carried over from the old shape against the same runs: the far station's view of one exchange
 * (106 → 66, the freeze at 64, the resume at 2387 µs), the 126 collisions and 45 deliveries, the
 * topology figure against the scenario, and the 45 µs deadline. The RTS/CTS variant is still
 * declared here — `rts-cts` loads this scene — and its pins live in tests/course/rts-cts.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { hidden, hiddenTopology } from '../../src/course/tier1/hidden'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { WALL_LOSS_DB, buildLinkTable } from '../../src/engine/propagation'
import { FADING_DEFAULTS } from '../../src/engine/fading'
import { ACK_TIMEOUT_NS, CCA_ED_DBM, CCA_PD_DBM, CW_MAX, CW_MIN, DIFS_NS, RX_START_DELAY_NS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
const US = 1_000
/** 300 ms: the window the fourth lab's 「300 ms 内」 is counted over. */
const RUN_NS = 300 * MS

const base = (): TLRecord[] => runOf(hidden, undefined, RUN_NS)
const txs = (rs: TLRecord[], p: (r: Tx) => boolean = () => true): Tx[] => ofType(rs, 'TX_START').filter(p)
const links = () => { const sc = hidden.scenario(); return buildLinkTable(sc.nodes, sc.walls) }

/** The frame the receiver had locked when a collision was reported, and the ones that ruined it. */
function collisionFrames(rs: TLRecord[], c: Extract<TLRecord, { type: 'COLLISION' }>): { locked: Tx; others: Tx[] } {
  const all = txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
  const locked = all.filter((r) => r.t + r.frame.txTimeNs === c.t)[0]
  const others = all.filter((r) => r.node !== locked.node && r.t + r.frame.txTimeNs > locked.t)
  return { locked, others }
}

const lab = (heading: string): Lab => {
  const l = hidden.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = hidden.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const figs = (text: string, re: RegExp, what: string): number[] => {
  const m = re.exec(text)
  expect(m, `${what}: 「${re.source}」 no longer matches what the lesson says`).not.toBeNull()
  return m!.slice(1).map((x) => Number(x.replace(/\s/g, '').replace('−', '-')))
}

lessonShapeSuite(hidden, { runNs: RUN_NS })

describe('hidden · the lesson', () => {
  it('is in the standard-first shape, after collisions, NAV and CCA', () => {
    expect(isStandardFirst(hidden)).toBe(true)
    expect(MODULES[hidden.module].title).toBe('隐藏节点与帧丢失')
    expect(hidden.needs).toEqual(['collisions-cw', 'nav', 'cca'])
    expect(hidden.terms!.map((t) => t.term)).toEqual(['hidden node'])
    expect(hidden.limits).toEqual([])
    expect(hidden.observe).toEqual([])
    expect(hidden.tryThis).toEqual([])
  })

  it('the scenario and its one variant are unchanged', () => {
    expect(() => ScenarioSchema.parse(hidden.scenario())).not.toThrow()
    expect(hidden.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    expect(hidden.scenario().rtsThresholdBytes).toBe(3000)
    expect(hidden.variants!.length).toBe(1)
    expect(hidden.variants![0].scenario().rtsThresholdBytes).toBe(500)
  })

  it('cites each clause it teaches in ①, with the standard’s own figures', () => {
    const std = hidden.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const clause of ['§3.1', '§4.2.3', '§17.3.10.6.1', '§10.3.3', '§10.3.4.3', '§10.3.2.11', '§9.3.1.4', '§10.3.1', '表 17-24']) {
      expect(std, clause).toContain(clause)
    }
    const [pd, , ed] = figs(std, /起始电平不低于 (−\d+) dBm.*?(\d+)% 的概率报忙；任何信号的电平不低于 (−\d+) dBm/, 'the two thresholds')
    expect(pd).toBe(CCA_PD_DBM)
    expect(ed).toBe(CCA_ED_DBM)
    const [sifs, slot, delay] = figs(std, /分别是 (\d+)、(\d+)、(\d+) µs/, 'the three AckTimeout parameters')
    expect([sifs * US, slot * US, delay * US]).toEqual([SIFS_NS, SLOT_NS, RX_START_DELAY_NS])
    const [cwMin, cwMax] = figs(std, /分别是 (\d+) 与 (\d+)/, 'aCWmin and aCWmax')
    expect([cwMin, cwMax]).toEqual([CW_MIN, CW_MAX])
  })

  it('② is not all faithful', () => {
    const kinds = hidden.implementation!.map((r) => r.kind)
    expect(kinds).toContain('differs')
    expect(kinds.filter((k) => k === 'faithful').length).toBeLessThan(kinds.length)
  })
})

describe('hidden · ② says what the engine does, and the engine does it', () => {
  it('preamble detection is a hard −82 dBm line, and the other room is 1.4 dB under it', () => {
    const row = implRow('前导检测')
    const [level, margin] = figs(row.sim, /另一台站点处是 (−[\d.]+) dBm，比门限低 ([\d.]+) dB/, 'the preamble row')
    const lt = links()
    for (const [a, b] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      expect(lt.get(a)!.get(b)!.toFixed(1)).toBe(level.toFixed(1))
      expect((CCA_PD_DBM - lt.get(a)!.get(b)!).toFixed(1)).toBe(margin.toFixed(1))
    }
    // 「每一次都检测不到」: neither room ever starts a reception from the other
    for (const [rx, tx] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      expect(ofType(base(), 'RX_START').some((r) => r.node === rx && r.from === tx), `${rx} ← ${tx}`).toBe(false)
    }
  })

  it('energy detection: −62 dBm, on a 20 MHz channel here', () => {
    expect(implRow('能量检测').sim).toContain('−62 dBm')
    expect(CCA_ED_DBM).toBe(-62)
    expect(hidden.scenario().nodes.every((n) => (n.caps.widthMhz ?? 20) === 20)).toBe(true)
  })

  it('the AckTimeout is 45 µs after the sender’s own frame, every time', () => {
    const [after] = figs(implRow('ACK 超时').sim, /帧结束 (\d+) µs 后判定失败/, 'the timeout row')
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
    expect(after * US).toBe(ACK_TIMEOUT_NS)
    const lastEnd = new Map<string, number>()
    let n = 0
    for (const r of base()) {
      if (r.type === 'TX_START') lastEnd.set(r.node, r.t + r.frame.txTimeNs)
      if (r.type === 'ACK_TIMEOUT') { expect(r.t - lastEnd.get(r.node)!, `${r.node} @ ${r.t}`).toBe(ACK_TIMEOUT_NS); n++ }
    }
    expect(n).toBeGreaterThan(100)
  })

  it('backoff draws stay inside the window, which grows 15 → 31 → 63 …', () => {
    const cws = new Set(ofType(base(), 'CW_CHANGE').map((r) => r.cw))
    for (const cw of cws) expect([15, 31, 63, 127, 255, 511, 1023]).toContain(cw)
    expect(cws.has(63)).toBe(true)
    for (const d of ofType(base(), 'BACKOFF_DRAW')) {
      expect(d.value).toBeGreaterThanOrEqual(0)
      expect(d.value).toBeLessThanOrEqual(CW_MAX)
    }
  })

  it('a closing acknowledgement writes 0 and arms no far station', () => {
    expect(new Set(txs(base(), (r) => r.frame.kind === 'ack').map((r) => r.frame.durationFieldNs))).toEqual(new Set([0]))
    expect(ofType(base(), 'NAV_SET').filter((r) => r.node !== 'ap')).toEqual([])
  })

  it('both stations reach the access point at the same level, so overlapping frames both fail', () => {
    const [level] = figs(implRow('相叠帧的接收').sim, /都是 (−[\d.]+) dBm/, 'the level at the AP')
    const lt = links()
    for (const n of ['sta-1', 'sta-2']) expect(lt.get(n)!.get('ap')!.toFixed(1)).toBe(level.toFixed(1))
    // no collision in the run ends with one of its frames acknowledged
    const rs = base()
    for (const c of ofType(rs, 'COLLISION')) {
      const { locked, others } = collisionFrames(rs, c)
      for (const f of [locked, ...others]) {
        const end = f.t + f.frame.txTimeNs
        const acked = txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === f.node && r.t === end + SIFS_NS)
        expect(acked, `${f.node} @ ${f.t}`).toEqual([])
      }
    }
  })

  it('the wall table and the default fading are the engine’s', () => {
    const [brick, drywall, glass] = figs(implRow('传播与墙体').sim, /砖 (\d+) dB、石膏板 (\d+) dB、玻璃 (\d+) dB/, 'the wall table')
    expect(WALL_LOSS_DB).toEqual({ brick, drywall, glass })
    const [sigma] = figs(implRow('衰落').sim, /默认阴影标准差 (\d+) dB/, 'the default shadowing')
    expect(FADING_DEFAULTS.shadowSigmaDb).toBe(sigma)
    expect(hidden.scenario().fading).toBeUndefined()
  })
})

describe('hidden · ③ every figure the labs print is the run', () => {
  it('lab 1: the first collision — two 1528-byte frames from 0 µs, and the 45 µs wait to learn it', () => {
    const l = lab('第一次碰撞')
    expect(hidden.jumps[l.jump!].label).toBe('第一次碰撞')
    const rs = base()
    const [start, bytes, mbps, air, at] = figs(l.expect, /都在 (\d+) µs 开始发送 (\d+) 字节的数据帧，速率 (\d+) Mb\/s，各 (\d+) µs；接入点在 (\d+) µs 记录一次碰撞/, 'lab 1')
    const [to, wait] = figs(l.expect, /都在 (\d+) µs，即帧结束 (\d+) µs 之后/, 'the timeouts')
    const c = ofType(rs, 'COLLISION')[0]
    expect(c.t).toBe(at * US)
    const { locked, others } = collisionFrames(rs, c)
    for (const f of [locked, ...others]) {
      expect(f.t).toBe(start * US)
      expect(f.frame.bytes).toBe(bytes)
      expect(f.frame.mbps).toBe(mbps)
      expect(f.frame.txTimeNs).toBe(air * US)
    }
    expect(new Set([locked, ...others].map((f) => f.node))).toEqual(new Set(['sta-1', 'sta-2']))
    const tos = ofType(rs, 'ACK_TIMEOUT').filter((r) => r.t === to * US)
    expect(new Set(tos.map((r) => r.node))).toEqual(new Set(['sta-1', 'sta-2']))
    expect(to - air).toBe(wait)
    expect(wait * US).toBe(ACK_TIMEOUT_NS)
  })

  it('lab 2: B starts, A starts 27 µs later with its channel still idle, and the AP loses both', () => {
    const l = lab('一方发送到一半，另一方开始发送')
    expect(l.jump).toBe(0)
    const rs = base()
    const [bStart, gap, aStart, bEnd] = figs(l.expect, /Hidden B 在 (\d+) µs 开始发送，接入点锁定这一帧；(\d+) µs 之后，即 (\d+) µs，Hidden A 的侦听仍为空闲，它也开始发送。B 的帧在 (\d+) µs 结束时接收失败/, 'lab 2')
    const second = ofType(rs, 'COLLISION')[1]
    expect(second.t).toBe(bEnd * US)
    const { locked, others } = collisionFrames(rs, second)
    expect(locked.node).toBe('sta-2')
    expect(locked.t).toBe(bStart * US)
    expect(ofType(rs, 'RX_START').some((r) => r.node === 'ap' && r.from === 'sta-2' && r.t === locked.t)).toBe(true)
    expect(ofType(rs, 'RX_FAIL').some((r) => r.node === 'ap' && r.from === 'sta-2' && r.t === bEnd * US)).toBe(true)
    expect(others.map((f) => [f.node, f.t])).toEqual([['sta-1', aStart * US]])
    expect(aStart - bStart).toBe(gap)
    // 「Hidden A 的侦听仍为空闲」: no CCA_BUSY at A between B's start and its own
    expect(ofType(rs, 'CCA_BUSY').some((r) => r.node === 'sta-1' && r.t >= locked.t && r.t < aStart * US)).toBe(false)
    // 「A 的帧也没有被解出」
    expect(ofType(rs, 'RX_OK').some((r) => r.node === 'ap' && r.from === 'sta-1' && r.t > aStart * US && r.t <= aStart * US + others[0].frame.txTimeNs)).toBe(false)
  })

  it('lab 2: the level table and the topology figure are the scene', () => {
    const l = lab('一方发送到一半，另一方开始发送')
    const rows = tableOf(l, '对方的帧到达本机处的电平').rows
    const lt = links()
    const [other] = figs(rows[0][1], /(−[\d.]+) dBm/, 'the other room')
    const [ack] = figs(rows[1][1], /(−[\d.]+) dBm/, 'the AP’s ack')
    expect(lt.get('sta-1')!.get('sta-2')!.toFixed(1)).toBe(other.toFixed(1))
    for (const n of ['sta-1', 'sta-2']) expect(lt.get('ap')!.get(n)!.toFixed(1)).toBe(ack.toFixed(1))
    const [pd, margin, ed] = figs(rows[0][2], /比 (−\d+) dBm 低 ([\d.]+) dB，比 (−\d+) dBm 低二十多分贝/, 'the comparison')
    expect(pd).toBe(CCA_PD_DBM)
    expect(ed).toBe(CCA_ED_DBM)
    expect((pd - other).toFixed(1)).toBe(margin.toFixed(1))
    expect(ed - other).toBeGreaterThan(20)
    expect(ed - other).toBeLessThan(30)
    expect(ack).toBeGreaterThan(CCA_PD_DBM)
    // the figure draws the scenario's own nodes, and its one dashed link is the deaf pair
    const fig = (l.blocks ?? []).find((b) => b.kind === 'diagram') as Extract<Block, { kind: 'diagram' }>
    expect(fig.spec).toEqual(hiddenTopology())
    const sp = hiddenTopology()
    const sc = hidden.scenario()
    expect(sp.nodes.map((n) => n.id)).toEqual(sc.nodes.map((n) => n.id))
    for (const n of sp.nodes) {
      const real = sc.nodes.find((x) => x.id === n.id)!
      expect([n.x, n.y], n.id).toEqual([real.pos.x, real.pos.y])
      expect(n.role, n.id).toBe(real.kind === 'ap' ? 'ap' : 'sta')
    }
    const muted = sp.links.filter((x) => x.tone === 'muted')
    expect(muted.length).toBe(1)
    expect([muted[0].from, muted[0].to].sort()).toEqual(['sta-1', 'sta-2'])
    for (const x of sp.links.filter((y) => y.tone !== 'muted')) expect(lt.get(x.from)!.get(x.to)!).toBeGreaterThan(CCA_PD_DBM)
  })

  it('lab 3: the far station counts 106 → 66 through the near frame, freezes at 64 for the ACK', () => {
    const l = lab('远端站点能收到什么')
    const rows = tableOf(l, '整个交换过程中远端站点能收到什么').rows
    const rs = runOf(hidden, undefined, 3.3 * MS)
    const [bytes] = figs(rows[0][0], /(\d+) 字节/, 'the near frame')
    const [from, to] = figs(rows[0][1], /([\d.]+) – ([\d.]+) ms/, 'when')
    const [first, , last] = figs(rows[0][3], /(\d+)、(\d+)、……(\d+)/, 'the count')
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > (from - 0.05) * MS)[0]
    expect(a.frame.bytes).toBe(bytes)
    expect((a.t / MS).toFixed(2)).toBe(from.toFixed(2))
    expect(((a.t + a.frame.txTimeNs) / MS).toFixed(2)).toBe(to.toFixed(2))
    const decs = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-2' && r.t >= a.t && r.t <= a.t + a.frame.txTimeNs)
    expect(decs[0].value).toBe(first)
    expect(decs[decs.length - 1].value).toBe(last)
    expect(ofType(rs, 'BACKOFF_FREEZE').some((r) => r.node === 'sta-2' && r.t >= a.t && r.t < a.t + a.frame.txTimeNs)).toBe(false)
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    // 「其后那段间隔也照常计完」
    expect(ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-2' && r.t > a.t + a.frame.txTimeNs && r.t < ack.t).length).toBeGreaterThan(0)
    const [ackFrom, ackTo] = figs(rows[1][1], /(\d+) – (\d+) µs/, 'the ack')
    expect([ack.t, ack.t + ack.frame.txTimeNs]).toEqual([ackFrom * US, ackTo * US])
    const [frozen, ackAir, wait, at, resumed] = figs(rows[1][3], /在 (\d+) 冻结，经过 (\d+) µs 的确认帧和 (\d+) µs 的等待后，(\d+) µs 从 (\d+) 继续/, 'the freeze')
    expect(ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-2' && r.t === ack.t)?.value).toBe(frozen)
    expect(ack.frame.txTimeNs).toBe(ackAir * US)
    expect(wait * US).toBe(DIFS_NS)
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-2' && r.t === at * US)!
    expect(resume.value).toBe(resumed)
    expect(at * US - ack.t).toBe((ackAir + wait) * US)
    // the walls the table names
    expect(rows.map((r) => r[2])).toEqual(['两堵', '一堵'])
    // expect: 106 → 66, no NAV, and B counts again through A's next frame
    const [e1, e2] = figs(l.expect, /B 的计数从 (\d+) 递减到 (\d+)/, 'lab 3 expect')
    expect([e1, e2]).toEqual([first, last])
    expect(ack.frame.durationFieldNs).toBe(0)
    expect(ofType(rs, 'NAV_SET').some((r) => r.node === 'sta-2')).toBe(false)
    const next = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > ack.t)[0]
    const nextEnd = Math.min(next.t + next.frame.txTimeNs, 3.3 * MS)
    expect(ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === 'sta-2' && r.t > next.t && r.t < nextEnd).length).toBeGreaterThan(10)
    const [runTo] = figs(l.steps.join('\n'), /运行到 ([\d.]+) ms/, 'the run length')
    expect(runTo * MS).toBe(3.3 * MS)
  })

  it('lab 4: 216 frames, 126 collisions all with a data frame, 125 staggered, 45 delivered, 45 freezes', () => {
    const l = lab('300 ms 的统计')
    const rs = base()
    const [sent, cols, staggered, delivered, freezes] = figs(l.expect, /共发出 (\d+) 个数据帧，碰撞 (\d+) 次，每一次都涉及一个数据帧，其中 (\d+) 次两帧开始的时刻不同；只有 (\d+) 帧被确认。两台站点共冻结 (\d+) 次/, 'lab 4')
    expect(txs(rs, (r) => r.frame.kind === 'data').length).toBe(sent)
    const all = ofType(rs, 'COLLISION').map((c) => collisionFrames(rs, c))
    expect(all.length).toBe(cols)
    expect(all.every(({ locked, others }) => [locked, ...others].some((f) => f.frame.kind === 'data'))).toBe(true)
    expect(all.filter(({ locked, others }) => others.some((o) => o.t !== locked.t)).length).toBe(staggered)
    expect(txs(rs, (r) => r.frame.kind === 'ack').length).toBe(delivered)
    const fr = ofType(rs, 'BACKOFF_FREEZE').filter((r) => r.node !== 'ap')
    expect(fr.length).toBe(freezes)
    const apAcks = new Set(txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack').map((r) => r.t))
    expect(fr.every((f) => apAcks.has(f.t))).toBe(true)
    for (const [me, other] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      const frames = txs(rs, (r) => r.node === other)
      for (const f of fr.filter((r) => r.node === me)) {
        expect(frames.some((x) => f.t >= x.t && f.t < x.t + x.frame.txTimeNs), `${me} @ ${f.t}`).toBe(false)
      }
    }
  })

  it('why quotes the same margin and the same 300 ms', () => {
    const [margin] = figs(hidden.why!, /比 −82 dBm 还低 ([\d.]+) dB/, 'why')
    expect((CCA_PD_DBM - links().get('sta-1')!.get('sta-2')!).toFixed(1)).toBe(margin.toFixed(1))
    const [cols, delivered] = figs(hidden.why!, /300 ms 内 (\d+) 次碰撞，只送达 (\d+) 帧/, 'why')
    expect(ofType(base(), 'COLLISION').length).toBe(cols)
    expect(txs(base(), (r) => r.frame.kind === 'ack').length).toBe(delivered)
  })
})
