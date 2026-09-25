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
import { hidden, hiddenTopology } from '../../src/course/tier1/hidden'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { buildLinkTable } from '../../src/engine/propagation'
import { ACK_TIMEOUT_NS, CCA_ED_DBM, CCA_PD_DBM, DIFS_NS, SIFS_NS, SLOT_NS } from '../../src/engine/phy'
import { PREAMBLE_DETECT_SINR_DB } from '../../src/engine/channel'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'

type Tx = Extract<TLRecord, { type: 'TX_START' }>

const MS = 1_000_000
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
