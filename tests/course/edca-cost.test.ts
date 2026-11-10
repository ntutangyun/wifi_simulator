/**
 * `@edca-cost`, in the standard-first shape (2026-11-11), on `edca`'s own scene.
 *
 * ① cites IEEE Std 802.11-2024 for the slot boundaries that only follow idle medium, the AC_BK
 * defaults and the EIFS rules; ② is pinned against the engine's constants and the run; ③'s figures
 * are read back out of the lesson text and compared with a 300 ms run (and, for lab 4, with the same
 * scene with EDCA turned off on the caller).
 */
import { describe, it, expect } from 'vitest'
import { edcaCost } from '../../src/course/tier2/edca-cost'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { Simulation } from '../../src/engine/simulation'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ACK_TX_TIME_6M_NS, DIFS_NS, EDCA_PARAMS, EIFS_NS, OFDM_5G, SIFS_NS, aifsNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 300 * MS

const recs = (): TLRecord[] => runOf(edcaCost, undefined, RUN_NS)
const by = (name: string) => EDCA_PARAMS.find((p) => p.name === name)!
const draws = (rs: TLRecord[], node: string) => ofType(rs, 'BACKOFF_DRAW').filter((r) => r.node === node)
const firstData = (rs: TLRecord[], node: string) =>
  ofType(rs, 'TX_START').find((r) => r.node === node && r.frame.kind === 'data')!

/** Times from a frame being queued to leaving the queue, in ns. */
const queueWaits = (rs: TLRecord[], node: string): number[] => {
  const enq = new Map<number, number>()
  const ds: number[] = []
  for (const r of rs) {
    if (r.type === 'ENQUEUE' && r.node === node) enq.set(r.msduId, r.t)
    if (r.type === 'DEQUEUE' && r.node === node && enq.has(r.msduId)) ds.push(r.t - enq.get(r.msduId)!)
  }
  expect(ds.length, node).toBeGreaterThan(5)
  return ds
}
const meanMs = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length / MS

const lab = (heading: string): Lab => {
  const l = edcaCost.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (blocks: Block[], heading: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = edcaCost.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => edcaCost.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'note' in b ? b.note ?? '' : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(edcaCost, { sameSceneAs: 'edca', runNs: RUN_NS })

describe('edca-cost · the lesson', () => {
  it('is in the standard-first shape, after its parent in the QoS module', () => {
    expect(isStandardFirst(edcaCost)).toBe(true)
    expect(MODULES[edcaCost.module].title).toBe('QoS 与效率')
    expect(edcaCost.needs).toEqual(['edca'])
    expect(edcaCost.terms!.map((t) => t.term)).toEqual(['EIFS'])
    expect(edcaCost.limits).toEqual([])
    expect(edcaCost.observe).toEqual([])
    expect(edcaCost.tryThis).toEqual([])
    expect(edcaCost.variants).toBeUndefined()
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§10.23.2.4', '§10.23.2.9', '表 9-194', '§10.3.2.3.7', '§10.3.7', '式 10-7', '式 10-8', '表 10-8']) expect(std, c).toContain(c)
  })

  it('① prints the AC_BK, AC_BE and AC_VO defaults the engine uses', () => {
    const std = stdText()
    const f = (n: string) => `${by(n).aifsn}（${aifsNs(by(n).aifsn, OFDM_5G) / US} µs）`
    expect(std).toContain(`AC_BK 的仲裁帧间间隔数（arbitration interframe space number, AIFSN）为 ${f('BK')}`)
    expect(std).toContain(`AC_BE 的 ${f('BE')}`)
    expect(std).toContain(`AC_VO 的 ${f('VO')}`)
    expect(std).toContain(`（minimum contention window, CWmin）为 ${by('BK').cwMin}、最大竞争窗口（maximum contention window, CWmax）为 ${by('BK').cwMax}，而 AC_VO 为 ${by('VO').cwMin} 与 ${by('VO').cwMax}`)
    expect([by('BK').cwMin, by('BK').cwMax]).toEqual([by('BE').cwMin, by('BE').cwMax])
  })
})

describe('edca-cost · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('EIFS is 16 + 44 + 34 = 94 µs, the ACK at 6 Mb/s', () => {
    expect(EIFS_NS).toBe(SIFS_NS + ACK_TX_TIME_6M_NS + DIFS_NS)
    expect(implRow('EIFS 的长度').sim).toContain(`${SIFS_NS / US} + ${ACK_TX_TIME_6M_NS / US} + ${DIFS_NS / US} = ${EIFS_NS / US} µs`)
  })

  it('the wait after an error is 94 − 34 + 43 = 103 µs, every time', () => {
    const v = (OFDM_5G.eifsNs - OFDM_5G.difsNs + aifsNs(by('BE').aifsn, OFDM_5G)) / US
    expect(implRow('出错之后的等待').sim).toContain(`${EIFS_NS / US} − ${DIFS_NS / US} + ${aifsNs(3, OFDM_5G) / US} = ${v} µs`)
    expect(new Set(ofType(rs, 'IFS_START').filter((r) => r.kind === 'EIFS').map((r) => r.untilNs - r.t))).toEqual(new Set([v * US]))
  })

  it('a busy medium freezes the counter: priority never interrupts a transmission', () => {
    // no station ever starts a frame while another of the room's frames is on the air towards it
    const freezes = ofType(rs, 'BACKOFF_FREEZE')
    expect(freezes.length).toBeGreaterThan(0)
    for (const f of freezes.slice(0, 50)) {
      expect(ofType(rs, 'TX_START').some((t) => t.node === f.node && t.t === f.t), `${f.node} at ${f.t}`).toBe(false)
    }
  })

  it('each station runs exactly one class', () => {
    expect(new Set(draws(rs, 'sta-1').map((d) => d.ac))).toEqual(new Set([3]))
    expect(new Set(draws(rs, 'sta-2').map((d) => d.ac))).toEqual(new Set([1]))
    expect(new Set(draws(rs, 'sta-3').map((d) => d.ac))).toEqual(new Set([0]))
  })
})

describe('edca-cost · ③ every figure the labs print is the run', () => {
  const rs = recs()

  it('lab 1: the backup speaks last', () => {
    const l = lab('后台排在最后')
    const [up, call, back] = ['sta-2', 'sta-1', 'sta-3'].map((n) => firstData(rs, n).t / MS)
    expect(l.expect).toContain(`上传站点从 ${up.toFixed(3)} ms 起`)
    expect(l.expect).toContain(`通话站点的第一帧在 ${call.toFixed(4)} ms`)
    expect(l.expect).toContain(`备份站点的第一帧到 ${back.toFixed(4)} ms`)
    expect(up).toBeLessThan(call)
    expect(call).toBeLessThan(back)
  })

  it('lab 2: the three-station table, and the ratio', () => {
    const l = lab('三台站点的表现')
    const rows = tableOf(l.blocks!, '300 ms 里三台站点的表现').rows
    const nodeOf: Record<string, string> = { 通话站点: 'sta-1', 上传站点: 'sta-2', 备份站点: 'sta-3' }
    for (const [name, cls, aifs, n, mean, wait, max] of rows) {
      const node = nodeOf[name]
      const ds = draws(rs, node)
      expect(aifs, name).toBe(`${aifsNs(by(cls).aifsn, OFDM_5G) / US} µs`)
      expect(new Set(ds.map((d) => d.ac)), name).toEqual(new Set([by(cls).ac]))
      expect(n, name).toBe(String(ds.length))
      expect(mean, name).toBe((ds.reduce((a, d) => a + d.value, 0) / ds.length).toFixed(1))
      const ws = queueWaits(rs, node)
      expect(wait, name).toBe(`${meanMs(ws).toFixed(2)} ms`)
      expect(max, name).toBe(`${(Math.max(...ws) / MS).toFixed(2)} ms`)
    }
    const call = queueWaits(rs, 'sta-1')
    const back = queueWaits(rs, 'sta-3')
    expect(Math.round(meanMs(back) / meanMs(call))).toBe(6) // 2026-11-11: seven before the AP took dot11QAPEDCATable and frames their UP
    expect(l.expect).toContain(`只抽取了 ${draws(rs, 'sta-3').length} 次`)
    expect(l.expect).toContain(`平均排队时延 ${meanMs(back).toFixed(2)} ms，约为通话站点 ${meanMs(call).toFixed(2)} ms 的六倍`)
    expect(l.expect).toContain(`最长的一次排队是 ${(Math.max(...call) / MS).toFixed(2)} ms`)
    expect(Math.floor(Math.max(...call) / MS / meanMs(call))).toBe(2)
    // the figures `why` repeats
    expect(edcaCost.why).toContain(`只抽取了 ${draws(rs, 'sta-3').length} 次退避（backoff）值，第一帧等了 ${Math.round(firstData(rs, 'sta-3').t / MS)} ms`)
  })

  it('lab 3: three EIFS, all the uploader\'s; the first behind the two simultaneous voice frames', () => {
    const l = lab('上传站点的 EIFS')
    const eifs = ofType(rs, 'IFS_START').filter((r) => r.kind === 'EIFS')
    expect(new Set(eifs.map((e) => e.node))).toEqual(new Set(['sta-2']))
    expect(l.expect).toContain(`上传站点共有 ${eifs.length} 次 EIFS，每次都是 103 µs`)
    const first = eifs[0]
    const fail = ofType(rs, 'RX_FAIL').find((r) => r.node === 'sta-2')!
    expect(fail.t).toBe(first.t)
    expect(fail.reason).toBe('collision')
    expect(l.expect).toContain(`在 ${(fail.t / MS).toFixed(4)} ms 接收失败`)
    // the voice frames whose end is the failure instant (2026-11-11: the AP's and the caller's, at the
    // AP's first internal collision)
    const voice = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data' && r.frame.ac === 3 && r.t + r.frame.txTimeNs === fail.t)
    expect(voice.map((r) => r.node).sort()).toEqual(['ap', 'sta-1'])
    expect(new Set(voice.map((r) => r.t)).size).toBe(1)
    expect(voice[0].t + voice[0].frame.txTimeNs).toBe(fail.t)
    expect(l.expect).toContain(`${(voice[0].t / MS).toFixed(4)} ms 接入点与通话站点同时发送语音帧`)
    // the caller's failed receptions: each followed by a new reception before it contends again
    const callerFails = ofType(rs, 'RX_FAIL').filter((r) => r.node === 'sta-1')
    expect(l.expect).toContain(`通话站点有 ${callerFails.length} 次接收失败`)
    for (const f of callerFails) {
      const nextRx = ofType(rs, 'RX_START').find((r) => r.node === 'sta-1' && r.t > f.t)!
      const nextIfs = ofType(rs, 'IFS_START').find((r) => r.node === 'sta-1' && r.t > f.t)
      expect(nextIfs === undefined || nextRx.t <= nextIfs.t, `fail at ${f.t}`).toBe(true)
    }
  })

  it('lab 4: EDCA off on the caller — DIFS 34 µs, windows from 15, about 3.2× the wait', () => {
    const l = lab('关掉通话站点的 EDCA')
    const sc: Scenario = edcaCost.scenario()
    const caller = sc.nodes.find((n) => n.id === 'sta-1')!
    caller.caps.features = { ...caller.caps.features, edca: false }
    const off = [...new Simulation(sc).runUntil(RUN_NS).records]
    const lens = new Set(ofType(off, 'IFS_START').filter((r) => r.node === 'sta-1' && r.kind === 'DIFS' && r.untilNs > r.t).map((r) => r.untilNs - r.t))
    expect([...lens]).toEqual([DIFS_NS])
    expect(DIFS_NS).toBe(aifsNs(by('VO').aifsn, OFDM_5G))
    expect(ofType(off, 'IFS_START').filter((r) => r.node === 'sta-1' && r.kind === 'AIFS')).toEqual([])
    expect(Math.min(...draws(off, 'sta-1').map((d) => d.cw))).toBe(15)
    const offMs = meanMs(queueWaits(off, 'sta-1'))
    const onMs = meanMs(queueWaits(recs(), 'sta-1'))
    expect(l.expect).toContain(`平均排队时延变为 ${offMs.toFixed(2)} ms，约为开启时 ${onMs.toFixed(2)} ms 的 ${(offMs / onMs).toFixed(1)} 倍`)
  })
})
