/**
 * Every empirical claim in "两台听不见彼此的站点", the first half of the old
 * `hidden` (2026-09-25 re-pacing, §2 M5), measured against the lesson's own
 * scene: an access point in a hallway with one saturated legacy station in each
 * end room.
 *
 * Nine pins left this file for tests/course/rts-cts.test.ts with the material
 * they guard — the protected variant's 32/7/329 column, the 94 % cut, the
 * 20-byte question and 14-byte answer, the 245 reservations, the per-100 ms
 * ticks, the six-step procedure with its 718 µs round, and both `deeper` notes.
 * Nothing was deleted: every one of them is asserted next door, against the same
 * two runs, and the variant is still declared here (the kit requires both halves
 * of a split to carry the same variant list), so the claims about what it is
 * still hold from this side too.
 *
 * What is new here is the procedure this half now carries, which the parent
 * never wrote out: what "idle" means to a radio. It is graded against
 * `Channel.recomputeCca` in src/engine/channel.ts and the two thresholds in
 * src/engine/phy.ts, not against the prose.
 *
 * The lesson's own two watch call-outs both live in the base run, so
 * `lessonShapeSuite` needs no `sameSceneAs` here: this half keeps the parent's
 * id, file and scene.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { hidden, hiddenTopology } from '../../src/course/tier1/hidden'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { WALL_LOSS_DB, buildLinkTable, wallsCrossed } from '../../src/engine/propagation'
import { ACK_TIMEOUT_NS, CCA_ED_DBM, CCA_PD_DBM, DIFS_NS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
const US = 1_000
/** 300 ms: the window the collision and delivery figures of `numbers` are counted over. */
const RUN_NS = 300 * MS

const base = (): TLRecord[] => runOf(hidden, undefined, RUN_NS)
const txs = (rs: TLRecord[], p: (r: Tx) => boolean = () => true): Tx[] =>
  ofType(rs, 'TX_START').filter(p)
const acked = (rs: TLRecord[], n: string): number =>
  txs(rs, (r) => r.frame.kind === 'ack' && r.frame.dst === n).length

/** The frame the receiver had locked when a collision was reported, and the ones that ruined it. */
function collisionFrames(rs: TLRecord[], c: Extract<TLRecord, { type: 'COLLISION' }>): { locked: Tx; others: Tx[] } {
  const all = txs(rs, (r) => c.nodes.includes(r.node) && r.t < c.t)
  const locked = all.filter((r) => r.t + r.frame.txTimeNs === c.t)[0]
  const others = all.filter((r) => r.node !== locked.node && r.t + r.frame.txTimeNs > locked.t)
  return { locked, others }
}
const caughtData = (rs: TLRecord[]): { locked: Tx; others: Tx[] }[] =>
  ofType(rs, 'COLLISION').map((c) => collisionFrames(rs, c))
    .filter(({ locked, others }) => [locked, ...others].some((f) => f.frame.kind === 'data'))

lessonShapeSuite(hidden, { runNs: RUN_NS })

describe('hidden · the lesson’s own scene', () => {
  it('follows the collision lesson, the NAV lesson and the CCA lesson, and owns the hidden node', () => {
    expect(MODULES[hidden.module].title).toBe('听不见的邻居与损失')
    // §6 of the re-pacing plan: `backoff` gave the deadline and the doubling to
    // `collisions-cw`, and `cca` is what the two thresholds of step 2 come from.
    expect(hidden.needs).toEqual(['collisions-cw', 'nav', 'cca'])
    // RTS, CTS and the RTS threshold went to `rts-cts` with the exchange they name.
    expect(hidden.terms!.map((t) => t.term)).toEqual(['hidden node'])
  })

  it('the scenario and its one variant are unchanged', () => {
    expect(() => ScenarioSchema.parse(hidden.scenario())).not.toThrow()
    expect(hidden.scenario().nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    expect(hidden.scenario().rtsThresholdBytes).toBe(3000)
    // both halves carry the same variant list, so the second half's scene is this one
    expect(hidden.variants!.length).toBe(1)
    expect(() => ScenarioSchema.parse(hidden.variants![0].scenario())).not.toThrow()
    expect(hidden.variants![0].scenario().rtsThresholdBytes).toBe(500)
  })

  it('the two stations cannot hear each other, but both reach the access point', () => {
    // the figure's dashed link, and the two solid ones
    const sc = hidden.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    expect(lt.get('sta-1')!.get('sta-2')!).toBeLessThan(CCA_PD_DBM)
    expect(lt.get('sta-2')!.get('sta-1')!).toBeLessThan(CCA_PD_DBM)
    for (const n of ['sta-1', 'sta-2']) expect(lt.get(n)!.get('ap')!).toBeGreaterThan(CCA_PD_DBM)
  })
})

describe('hidden · the topology figure is the scene', () => {
  it('draws the scenario’s own nodes at their own positions, roles included', () => {
    const sp = hiddenTopology()
    const sc = hidden.scenario()
    expect(sp.nodes.map((n) => n.id)).toEqual(sc.nodes.map((n) => n.id))
    for (const n of sp.nodes) {
      const real = sc.nodes.find((x) => x.id === n.id)!
      expect([n.x, n.y], n.id).toEqual([real.pos.x, real.pos.y])
      expect(n.role, n.id).toBe(real.kind === 'ap' ? 'ap' : 'sta')
    }
  })

  it('the one dashed link is exactly the pair the run never lets hear each other', () => {
    const sp = hiddenTopology()
    const sc = hidden.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    const muted = sp.links.filter((l) => l.tone === 'muted')
    expect(muted.length).toBe(1)
    expect([muted[0].from, muted[0].to].sort()).toEqual(['sta-1', 'sta-2'])
    expect(lt.get(muted[0].from)!.get(muted[0].to)!).toBeLessThan(CCA_PD_DBM)
    // and neither room ever starts a reception from the other, across the whole run
    for (const [rx, tx] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      expect(ofType(base(), 'RX_START').some((r) => r.node === rx && r.from === tx), `${rx} ← ${tx}`).toBe(false)
    }
    // every other link of the figure works
    for (const l of sp.links.filter((x) => x.tone !== 'muted')) {
      expect(lt.get(l.from)!.get(l.to)!, `${l.from} → ${l.to}`).toBeGreaterThan(CCA_PD_DBM)
    }
  })
})

describe('hidden · what “idle” means, step by step', () => {
  it('step 1: the wait before a draw is one DIFS — 16 µs plus two 9 µs slots, 34 µs', () => {
    expect(DIFS_NS).toBe(SIFS_NS + 2 * SLOT_NS)
    expect(DIFS_NS).toBe(34_000)
    const ifs = ofType(base(), 'IFS_START').filter((r) => r.node !== 'ap')
    expect(ifs.length).toBeGreaterThan(100)
    expect(ifs.some((r) => r.kind === 'DIFS' && r.untilNs - r.t === DIFS_NS)).toBe(true)
  })

  it('step 2: the two thresholds are the engine’s own −82 and −62 dBm', () => {
    // 「空中有一个本电台看得见前导码的传输，到达电平不低于 −82 dBm；或者空中所有能量加起来
    //  不低于 −62 dBm」 — the two arms of `Channel.recomputeCca`.
    expect(CCA_PD_DBM).toBe(-82)
    expect(CCA_ED_DBM).toBe(-62)
    expect(CCA_ED_DBM - CCA_PD_DBM).toBe(20)
  })

  it('step 3: the other room arrives at −83.4 dBm — 1.4 dB under one line, 21.4 under the other', () => {
    const sc = hidden.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    const p = lt.get('sta-1')!.get('sta-2')!
    expect(p.toFixed(1)).toBe('-83.4')
    expect(Number((CCA_PD_DBM - p).toFixed(1))).toBe(1.4)
    expect(Number((CCA_ED_DBM - p).toFixed(1))).toBe(21.4)
    expect(lt.get('sta-2')!.get('sta-1')!.toFixed(1)).toBe('-83.4')
    // so the channel reads idle and the counter keeps going: no CCA_BUSY at either
    // station is ever caused by the other one's transmission
    const rs = base()
    for (const [me, other] of [['sta-1', 'sta-2'], ['sta-2', 'sta-1']]) {
      const frames = txs(rs, (r) => r.node === other)
      for (const f of ofType(rs, 'BACKOFF_FREEZE').filter((r) => r.node === me)) {
        expect(frames.some((x) => f.t >= x.t && f.t < x.t + x.frame.txTimeNs), `${me} @ ${f.t}`).toBe(false)
      }
    }
  })

  it('step 4: the only audible part of the exchange is the access point’s ACK, at −60.6 dBm', () => {
    const sc = hidden.scenario()
    const lt = buildLinkTable(sc.nodes, sc.walls)
    for (const n of ['sta-1', 'sta-2']) expect(lt.get('ap')!.get(n)!.toFixed(1)).toBe('-60.6')
    // every freeze either station ever takes is for an ACK from the hallway
    const rs = base()
    const apAcks = new Set(txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack').map((r) => r.t))
    for (const n of ['sta-1', 'sta-2']) {
      const mine = ofType(rs, 'BACKOFF_FREEZE').filter((r) => r.node === n)
      expect(mine.length).toBeGreaterThan(10)
      expect(mine.every((f) => apAcks.has(f.t))).toBe(true)
    }
  })

  it('step 5: the access point locks neither preamble, and the sender waits 45 µs to find out', () => {
    // 「两个前导码互相淹没，接入点一个都没锁上。发送方要等自己那 45 µs 的期限到期才知情」
    expect(PREAMBLE_DETECT_SINR_DB).toBe(4)
    expect(ACK_TIMEOUT_NS).toBe(45_000)
    const rs = base()
    let checked = 0
    for (const { locked, others } of caughtData(rs)) {
      // the ruined data frame and the frame that ruined it overlap in time …
      const overlapping = others.filter((f) => f.t < locked.t + locked.frame.txTimeNs)
      expect(overlapping.length, `@ ${locked.t}`).toBeGreaterThan(0)
      checked++
    }
    expect(checked).toBe(126)
    // … and the timeout always lands exactly one deadline after the sender's own frame ended
    const lastEnd = new Map<string, number>()
    let timeouts = 0
    for (const r of rs) {
      if (r.type === 'TX_START') lastEnd.set(r.node, r.t + r.frame.txTimeNs)
      if (r.type === 'ACK_TIMEOUT') {
        expect(r.t - lastEnd.get(r.node)!, `${r.node} @ ${r.t}`).toBe(ACK_TIMEOUT_NS)
        timeouts++
      }
    }
    expect(timeouts).toBeGreaterThan(100)
  })
})

describe('hidden · what the far station hears of a whole exchange', () => {
  it('it counts straight through the near station’s frame, 106 down to 66', () => {
    // the table row: 「近端的 1528 字节数据帧 · 1.95 – 2.31 ms · 两堵 · 径直数了过去：106、105、
    //  ……66，连之后那段间隙也数完」
    const rs = base()
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 1_900_000)[0]
    expect(a.frame.bytes).toBe(1528)
    expect(Math.round(a.t / 10_000) / 100).toBe(1.95)
    expect(Math.round((a.t + a.frame.txTimeNs) / 10_000) / 100).toBe(2.31)
    const decs = ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-2' && r.t >= a.t && r.t <= a.t + a.frame.txTimeNs)
    expect(decs[0].value).toBe(106)
    expect(decs[decs.length - 1].value).toBe(66)
    expect(ofType(rs, 'BACKOFF_FREEZE')
      .some((r) => r.node === 'sta-2' && r.t >= a.t && r.t < a.t + a.frame.txTimeNs)).toBe(false)
    // 「连之后那段间隙也数完」: it keeps counting between the frame and the ACK
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    expect(ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-2' && r.t > a.t + a.frame.txTimeNs && r.t < ack.t).length).toBeGreaterThan(0)
  })

  it('it freezes at 64 for the 28 µs ACK, waits 34 µs and resumes at 64 at 2387 µs', () => {
    // the table row: 「接入点的 ACK · 2325 – 2353 µs · 一堵 · 在 64 冻结，熬完 28 µs 的 ACK
    //  和 34 µs 的等待，2387 µs 从 64 继续」
    const rs = base()
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 1_900_000)[0]
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    expect([ack.t, ack.t + ack.frame.txTimeNs]).toEqual([2_325_000, 2_353_000])
    expect(ack.frame.txTimeNs).toBe(28_000)
    expect(ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-2' && r.t === ack.t)?.value).toBe(64)
    const ifs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-2' && r.t === 2_353_000)!
    expect(ifs.untilNs - ifs.t).toBe(34_000)
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-2' && r.t === ifs.untilNs)!
    expect(resume.t).toBe(2_387_000)
    expect(resume.value).toBe(64)
  })

  it('the closing ACK announces nothing, so the freeze guards nothing', () => {
    // 「那个回答是本次交互的最后一帧，它的 Duration 是零，没有什么可预告的。片刻之后近端开始
    //  下一帧，重新“失聪”的远端又径直数了过去。」
    const rs = base()
    const a = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 1_900_000)[0]
    const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > a.t)[0]
    expect(ack.frame.durationFieldNs).toBe(0)
    expect(ofType(rs, 'NAV_SET').some((r) => r.node === 'sta-2')).toBe(false)
    const next = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > ack.t)[0]
    const end = next.t + next.frame.txTimeNs
    expect(ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-2' && r.t > next.t && r.t < end).length).toBeGreaterThan(10)
    expect(ofType(rs, 'BACKOFF_FREEZE').some((r) => r.node === 'sta-2' && r.t > next.t && r.t < end)).toBe(false)
  })
})

describe('hidden · three hundred milliseconds of it', () => {
  it('126 collisions, every one of them on a data frame, and 45 frames delivered', () => {
    // 「300 ms 里这个房间碰撞 126 次，每一次都夹着一个数据帧，两台站点合起来只送达 45 帧。」
    const rs = base()
    expect(ofType(rs, 'COLLISION').length).toBe(126)
    expect(caughtData(rs).length).toBe(126)
    expect(acked(rs, 'sta-1') + acked(rs, 'sta-2')).toBe(45)
    // and nothing in this scene ever asks first
    expect(txs(rs, (r) => r.frame.kind === 'rts').length).toBe(0)
  })
})

describe('hidden · the door experiment', () => {
  it('a door on the stations’ line of sight un-hides them; a door lower down does not', () => {
    // tryThis: 「给走廊的一堵墙靠上端、也就是两台站点连线经过处（y ≈ 7.2）开一扇门：射线从此
    //  只穿一堵墙，它们又能听见彼此。门开得靠下则毫无作用。」
    const link = (from: number | null): number => {
      const sc = hidden.scenario()
      if (from !== null) sc.walls.find((w) => w.x1 === 4 && w.x2 === 4)!.openings = [{ from, to: from + 0.9 }]
      return buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('sta-2')!
    }
    expect(link(null)).toBeLessThan(CCA_PD_DBM)
    expect(link(6.8)).toBeGreaterThan(CCA_PD_DBM)
    expect(link(1)).toBe(link(null))
    expect(link(3.5)).toBe(link(null))
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine and compares it with a literal written in THIS file, with
 * the lesson's row quoted in a comment beside it — the two table rows have an `it` each, and the
 * figures in them (1528, 1.95, 2.31, 106, 66, 2325, 2353, 28, 34, 2387, 64) are all on this side.
 *
 * `@hidden` hand-types 23 figures into its graded prose. What follows is the other half of each
 * assertion above, with no figure here: the five steps' four levels and the timeout, both table
 * rows including their **wall counts** — 「两堵」/「一堵」 is a claim about what the ray crosses, and
 * `wallsCrossed` answers it — the closing census, the door experiment's `y ≈ 7.2`, the quiz's two
 * thresholds, and `limits`, which the graded walk never reads and which carries the wall table
 * (砖 12 / 石膏板 5 / 玻璃 3 dB) and four citations.
 */
describe('hidden · every printed figure is read back out of the lesson', () => {
  const rs = base()
  const sc = hidden.scenario()
  const pos = (id: string) => sc.nodes.find((n) => n.id === id)!.pos
  const links = buildLinkTable(sc.nodes, sc.walls)
  const steps = (hidden.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
  const tableWith = (fragment: string): { head: string[]; rows: string[][] } => {
    const b = hidden.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { head: string[]; rows: string[][] }
  }
  /** 「−83.4 dBm」 → −83.4; 「1528 字节」 → 1528. Full-width minus included. */
  const val = (s: string): number => Number(s.replace(/−/g, '-').replace(/[^\d.-]/g, ''))
  /** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/−/g, '-').replace(/\s/g, '')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const zhCount = (s: string): number | null => zhNumeral(s.replace(/两/g, '二'))
  const cite = (text: string, what: string): number => {
    // Two phrasings, because this lesson uses both: 「traffic.ts 的 saturated」 and
    // 「channel.ts 里对 CCA_PD_DBM 的那次比较」.
    const found = [...text.matchAll(/([a-z]+\.ts) (?:的|里对) (\w+)/g)]
    for (const m of found) {
      const path = ['src/engine', 'src/model', 'src/course']
        .map((d) => resolve(ROOT, `${d}/${m[1]}`)).find(existsSync)
      expect(path, `${what}: ${m[1]} is not a file of this repository`).toBeDefined()
      expect(readFileSync(path!, 'utf8').includes(m[2]), `${what}: ${m[1]} declares ${m[2]}`)
        .toBe(true)
    }
    return found.length
  }
  /** The near station's frame the table's first row is about, and the ACK of the second. */
  const near = txs(rs, (r) => r.node === 'sta-1' && r.frame.kind === 'data' && r.t > 1_900_000)[0]
  const ack = txs(rs, (r) => r.node === 'ap' && r.frame.kind === 'ack' && r.t > near.t)[0]

  it('the steps: both thresholds, the level that misses them, and the timeout', () => {
    expect(steps, 'the lesson states exactly the steps this reads').toHaveLength(5)
    // step 2: 「到达电平不低于 −82 dBm；或者空中所有能量加起来不低于 −62 dBm」
    const lines = /到达电平不低于 ([−\d.]+) dBm；或者空中所有能量加起来不低于 ([−\d.]+) dBm/
      .exec(steps[1])
    expect(lines, 'step 2 no longer states the two thresholds').not.toBeNull()
    same(lines![1], CCA_PD_DBM, 'the preamble-detection threshold')
    same(lines![2], CCA_ED_DBM, 'and the energy one')
    // step 3: 「只有 −83.4 dBm：比前导检测那条线还低 1.4 dB，比能量检测那条线低二十多分贝」
    const m = /只有 ([−\d.]+) dBm：比前导检测（preamble detection）那条线还低 ([\d.]+) dB，比能量检测（energy detection, ED）那条线低([一二三四五六七八九十]+)多分贝/
      .exec(steps[2])
    expect(m, 'step 3 no longer states what the other room arrives at').not.toBeNull()
    const other = links.get('sta-1')!.get('sta-2')!
    same(m![1], other, 'the level the other room arrives at')
    same(m![2], CCA_PD_DBM - other, 'how far under the preamble line it is')
    // 「二十多」: twenty-odd, which is a range and is read as one
    const edGap = CCA_ED_DBM - other
    expect(edGap, `「${m![3]}多分贝」 is at least ${zhCount(m![3])}`).toBeGreaterThanOrEqual(zhCount(m![3])!)
    expect(edGap, 'and under the next ten').toBeLessThan(zhCount(m![3])! + 10)
    // step 4: 「接入点回的那个确认帧（ACK），−60.6 dBm」
    const a = /确认帧（acknowledgement, ACK），([−\d.]+) dBm/.exec(steps[3])
    expect(a, 'step 4 no longer states the ACK’s level at the far station').not.toBeNull()
    same(a![1], links.get('ap')!.get('sta-2')!, 'the ACK’s level at the far station')
    expect(val(a![1]), 'which is the one thing above the preamble line').toBeGreaterThan(CCA_PD_DBM)
    // step 5: 「发送方要等自己那 45 µs 的期限到期才知情」
    const t = /自己那 (\d+) µs 的期限/.exec(steps[4])
    expect(t, 'step 5 no longer states the timeout').not.toBeNull()
    same(t![1], ACK_TIMEOUT_NS / US, 'the timeout a sender waits out')
  })

  it('the exchange table: both rows, their instants, their counts and their walls', () => {
    const t = tableWith('整场交互里，远端站点听得见什么')
    expect(t.rows, 'the table states exactly the two frames this reads').toHaveLength(2)
    // row 1: 「近端的 1528 字节数据帧 · 1.95 – 2.31 ms · 两堵 · 径直数了过去：106、105、……66」
    const r0 = /^近端的 (\d+) 字节数据帧$/.exec(t.rows[0][0])
    expect(r0, `「${t.rows[0][0]}」 is not the frame this reads`).not.toBeNull()
    expect(Number(r0![1]), 'the frame’s bytes').toBe(near.frame.bytes)
    const span = /^([\d.]+) – ([\d.]+) ms$/.exec(t.rows[0][1])
    expect(span, `「${t.rows[0][1]}」 is not 「a – b ms」`).not.toBeNull()
    same(span![1], near.t / MS, 'when it starts')
    same(span![2], (near.t + near.frame.txTimeNs) / MS, 'and when it ends')
    const walls0 = zhCount(t.rows[0][2].replace('堵', ''))
    expect(walls0, 'the walls the table says lie between the two stations')
      .toBe(wallsCrossed(pos('sta-1'), pos('sta-2'), sc.walls).length)
    const counted = /径直数了过去：(\d+)、(\d+)、……(\d+)/.exec(t.rows[0][3])
    expect(counted, 'the first row no longer says what the far station counted').not.toBeNull()
    const decs = ofType(rs, 'BACKOFF_DEC')
      .filter((r) => r.node === 'sta-2' && r.t >= near.t && r.t <= near.t + near.frame.txTimeNs)
    expect([Number(counted![1]), Number(counted![3])], 'from this value down to that one')
      .toEqual([decs[0].value, decs[decs.length - 1].value])
    expect(Number(counted![2]), 'and the one in between is the next step down')
      .toBe(Number(counted![1]) - 1)

    // row 2: 「接入点的 ACK · 2325 – 2353 µs · 一堵 · 在 64 冻结，等完 28 µs 的 ACK 和 34 µs
    // 的等待，2387 µs 从 64 继续」
    const span2 = /^(\d+) – (\d+) µs$/.exec(t.rows[1][1])
    expect(span2, `「${t.rows[1][1]}」 is not 「a – b µs」`).not.toBeNull()
    same(span2![1], ack.t / US, 'when the ACK starts')
    same(span2![2], (ack.t + ack.frame.txTimeNs) / US, 'and when it ends')
    const walls1 = zhCount(t.rows[1][2].replace('堵', ''))
    expect(walls1, 'the walls between the access point and the far station')
      .toBe(wallsCrossed(pos('ap'), pos('sta-2'), sc.walls).length)
    expect(walls1, 'which is fewer than between the two stations — the whole row').toBeLessThan(walls0!)
    const froze = /在 (\d+) 冻结，等完 (\d+) µs 的 ACK 和 (\d+) µs 的等待，(\d+) µs 从 (\d+) 继续/
      .exec(t.rows[1][3])
    expect(froze, 'the second row no longer says what the freeze did').not.toBeNull()
    const freeze = ofType(rs, 'BACKOFF_FREEZE').find((r) => r.node === 'sta-2' && r.t === ack.t)!
    expect(Number(froze![1]), 'the value it froze at').toBe(freeze.value)
    same(froze![2], ack.frame.txTimeNs / US, 'the ACK it waited out')
    const ifs = ofType(rs, 'IFS_START')
      .find((r) => r.node === 'sta-2' && r.t === ack.t + ack.frame.txTimeNs)!
    same(froze![3], (ifs.untilNs - ifs.t) / US, 'the silence after it')
    const resume = ofType(rs, 'BACKOFF_RESUME').find((r) => r.node === 'sta-2' && r.t === ifs.untilNs)!
    same(froze![4], resume.t / US, 'when it resumed')
    expect(Number(froze![5]), 'and from the same value it froze at').toBe(resume.value)
    expect(Number(froze![1]), 'which the row states twice, consistently').toBe(Number(froze![5]))
  })

  it('the closing census, read out of the paragraph and out of `observe`', () => {
    const p = (hidden.numbers! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const m = /(\d+) ms 里这个房间碰撞 (\d+) 次，每一次都夹着一个数据帧（data frame），两台站点合起来只送达 (\d+) 帧/
      .exec(p)
    expect(m, 'the census paragraph is gone, or its shape changed').not.toBeNull()
    same(m![1], RUN_NS / MS, 'the window it counts over')
    expect(Number(m![2]), 'the collisions').toBe(ofType(rs, 'COLLISION').length)
    expect(Number(m![2]), 'every one of them on a data frame').toBe(caughtData(rs).length)
    expect(Number(m![3]), 'and the frames delivered').toBe(acked(rs, 'sta-1') + acked(rs, 'sta-2'))
    // 「它的 Duration 是零，没有什么可预告的」
    expect(/Duration 是零/.test(p), 'the paragraph still says the ACK announces nothing').toBe(true)
    expect(ack.frame.durationFieldNs, 'and it does').toBe(0)
    // observe[0] states the same census again, in its own words
    const o = /(\d+) ms 里 (\d+) 次/.exec(hidden.observe![0])
    expect(o, 'observe[0] no longer counts the collisions').not.toBeNull()
    expect([Number(o![1]), Number(o![2])], 'the same window and the same count')
      .toEqual([RUN_NS / MS, ofType(rs, 'COLLISION').length])
  })

  it('the door experiment’s own height, and the quiz’s two thresholds', () => {
    // tryThis: 「靠上端、也就是两台站点连线经过处（y ≈ 7.2）开一扇门」
    const d = /（y ≈ ([\d.]+)）/.exec(hidden.tryThis![0])
    expect(d, 'the experiment no longer states the height to open the door at').not.toBeNull()
    const y = Number(d![1])
    // the height it names is the stations' own line, which is what makes the door work
    expect([pos('sta-1').y, pos('sta-2').y], 'the two stations sit on that line').toEqual([y, y])
    const open = (from: number): number => {
      const s = hidden.scenario()
      s.walls.find((w) => w.x1 === 4 && w.x2 === 4)!.openings = [{ from, to: from + 0.9 }]
      return buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('sta-2')!
    }
    expect(open(y - 0.4), 'a door on that line lets them hear each other').toBeGreaterThan(CCA_PD_DBM)
    expect(open(1), 'and one lower down does not').toBe(links.get('sta-1')!.get('sta-2')!)
    // quiz 2: 「既没到 −82 dBm 的前导检测门限，也没到 −62 dBm 的能量门限」
    const q = /既没到 ([−\d.]+) dBm 的前导检测门限，也没到 ([−\d.]+) dBm 的能量门限/
      .exec(hidden.quiz[1].options[hidden.quiz[1].answer])
    expect(q, 'the quiz’s right answer no longer states the two thresholds').not.toBeNull()
    same(q![1], CCA_PD_DBM, 'the preamble threshold, as the quiz states it')
    same(q![2], CCA_ED_DBM, 'and the energy one')
  })

  it('`limits`: the wall table, the hard line, the census, and four citations', () => {
    const ls = hidden.limits.map((l) => l.text)
    const all = ls.join('\n')
    // 「−83.4 dBm 是一个定数，只比门限低 1.4 dB」
    const m = /([−\d.]+) dBm 是一个定数，只比门限低 ([\d.]+) dB/.exec(all)
    expect(m, '`limits` no longer states the level and its margin').not.toBeNull()
    const other = links.get('sta-1')!.get('sta-2')!
    same(m![1], other, 'the level the first limit is about')
    same(m![2], CCA_PD_DBM - other, 'and how far under the line it sits')
    // 「到达 −82.0 dBm 就一定判忙，−82.1 dBm 就一定判不出」
    const hard = /到达 ([−\d.]+) dBm 就一定判忙，([−\d.]+) dBm 就一定判不出/.exec(all)
    expect(hard, '`limits` no longer states the hard line').not.toBeNull()
    same(hard![1], CCA_PD_DBM, 'the level that is certainly busy')
    expect(val(hard![2]), 'and the one a tenth of a dB below it')
      .toBeCloseTo(CCA_PD_DBM - 0.1, 9)
    // 「砖 12 dB、石膏板 5 dB、玻璃 3 dB」: the engine's own table, materials included
    const walls = /砖 (\d+) dB、石膏板 (\d+) dB、玻璃 (\d+) dB/.exec(all)
    expect(walls, '`limits` no longer states the wall table').not.toBeNull()
    expect([Number(walls![1]), Number(walls![2]), Number(walls![3])], 'the three losses it lists')
      .toEqual([WALL_LOSS_DB.brick, WALL_LOSS_DB.drywall, WALL_LOSS_DB.glass])
    expect(Object.keys(WALL_LOSS_DB).length, 'and the table has no fourth material the limit hides')
      .toBe(3)
    // 「碰撞 126 次、只送达 45 帧」, restated in the last limit
    const census = /碰撞 (\d+) 次、只送达 (\d+) 帧/.exec(all)
    expect(census, '`limits` no longer restates the census').not.toBeNull()
    expect([Number(census![1]), Number(census![2])], 'the same two figures as the paragraph')
      .toEqual([ofType(rs, 'COLLISION').length, acked(rs, 'sta-1') + acked(rs, 'sta-2')])
    // `limits` cites in three shapes, and all three are claims about this repository:
    // 「file.ts 的 symbol」, 「file.ts 里对 symbol 的那次比较」, and a bare path or a bare symbol.
    expect(cite(all, '`limits`'), 'the two citations that name a file AND a symbol').toBe(2)
    const bare = /（(src\/[\w/.]+\.ts)）/.exec(all)
    expect(bare, '`limits` no longer cites the file the wall table lives in').not.toBeNull()
    expect(existsSync(resolve(ROOT, bare![1])), `${bare![1]} is a file of this repository`).toBe(true)
    const sym = /（(rxPowerDbm)）/.exec(all)
    expect(sym, '`limits` no longer names the function that computes the level').not.toBeNull()
    expect(readFileSync(resolve(ROOT, bare![1]), 'utf8').includes(`function ${sym![1]}`),
      `${bare![1]} declares ${sym![1]}`).toBe(true)
  })
})
