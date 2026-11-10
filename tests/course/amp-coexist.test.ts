/**
 * `@amp-coexist`, in the standard-first shape (2026-11-11).
 *
 * ① cites the PAR (through the coexistence assessment document), the TGbp motions and the
 * IEEE Std 802.11-2024 clauses behind each rule; ② says what the engine does about each, checked
 * against the runs here; every figure the labs print is read back out of the lesson's own text
 * and compared with the run the lab loads. Measured over two seconds: twenty rounds at 100 ms.
 */
import { describe, expect, it } from 'vitest'
import { ampCoexist, ampCoexistScenario } from '../../src/course/amp/amp-coexist'
import { ScenarioSchema } from '../../src/model/scenario'
import { CCA_ED_DBM, CTS_BYTES, EDCA_PARAMS, ERP_2G, aifsNs } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { widthOf } from '../../src/model/caps'
import type { TLRecord } from '../../src/model/records'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { rssiOn } from './rssi'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const ROUNDS = 20
const RUN_NS = 2000 * MS
const AP = 'ap#2g'
const CAM = 'cam#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g']
const NONE = 0, POLL20 = 1, WIFI_ONLY = 2

const recs = (variant?: number): TLRecord[] => runOf(ampCoexist, variant, RUN_NS)
const txs = (rs: TLRecord[]) => ofType(rs, 'TX_START')
const roundCts = (rs: TLRecord[]) => txs(rs).filter((r) => r.node === AP && r.frame.kind === 'cts' && r.frame.dst === r.frame.src)
const slots = (rs: TLRecord[]) => ofType(rs, 'AMP_SLOT')
const results = (rs: TLRecord[]) => ofType(rs, 'AMP_RESULT')
const acked = (rs: TLRecord[]) => results(rs).filter((r) => r.acked).length
const camNav = (rs: TLRecord[]) => ofType(rs, 'NAV_SET').filter((r) => r.node === CAM && r.source === 'cts:ap')
const camInSlot = (rs: TLRecord[]) => {
  const ss = slots(rs)
  return txs(rs).filter((r) => r.node === CAM && ss.some((s) => r.t >= s.t && r.t < s.untilNs))
}
const ampAirNs = (rs: TLRecord[]) => txs(rs)
  .filter((r) => (r.node === AP && (r.frame.kind.startsWith('amp') || (r.frame.kind === 'cts' && r.frame.dst === r.frame.src)))
    || TAGS.includes(r.node))
  .reduce((a, r) => a + r.frame.txTimeNs, 0)
function delivered(rs: TLRecord[], node: string): number {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  return ofType(rs, 'DEQUEUE').filter((r) => r.node === node && !dropped.has(r.msduId)).length
}
function mbps(rs: TLRecord[], node: string): number {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const bytes = new Map(ofType(rs, 'ENQUEUE').filter((r) => r.node === node).map((r) => [r.msduId, r.bytes]))
  let bits = 0
  for (const r of ofType(rs, 'DEQUEUE')) if (r.node === node && !dropped.has(r.msduId)) bits += 8 * (bytes.get(r.msduId) ?? 0)
  return bits / (RUN_NS / 1e9) / 1e6
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const lateNs = (rs: TLRecord[], pollMs: number) => roundCts(rs).map((c, i) => c.t - i * pollMs * MS)
const unprotected = (rs: TLRecord[]) => {
  const nav = camNav(rs)
  return roundCts(rs).filter((c) => !nav.some((n) => n.t === c.t + c.frame.txTimeNs))
}

const lab = (heading: string): Lab => {
  const l = ampCoexist.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const tableOf = (l: Lab, heading: string) => blockOf(l, 'table', heading)
const implRow = (topic: string) => {
  const row = ampCoexist.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(ampCoexist, { runNs: RUN_NS })

describe('amp-coexist · the lesson', () => {
  it('is in the standard-first shape, after amp-slots', () => {
    expect(isStandardFirst(ampCoexist)).toBe(true)
    expect(MODULES[ampCoexist.module].title).toBe('环境能量物联网（802.11bp）')
    expect(ampCoexist.needs).toEqual(['amp-slots'])
    expect(ampCoexist.limits).toEqual([])
    expect(ampCoexist.observe).toEqual([])
    expect(ampCoexist.tryThis).toEqual([])
  })

  it('the scene and its three variants pass the schema, unchanged', () => {
    expect(() => ScenarioSchema.parse(ampCoexist.scenario())).not.toThrow()
    for (const v of ampCoexist.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    const s = ampCoexist.scenario()
    expect(s.nodes.map((n) => n.id)).toEqual(['ap', 'cam', 'phone', 'tag-1', 'tag-2'])
    expect(ampCoexist.variants![NONE].scenario().nodes[0].ampAp).toMatchObject({ protection: 'none' })
    expect(ampCoexist.variants![POLL20].scenario().nodes[0].ampAp).toMatchObject({ pollIntervalMs: 20 })
    expect(ampCoexist.variants![WIFI_ONLY].scenario().nodes.map((n) => n.id)).toEqual(['ap', 'cam', 'phone'])
  })

  it('① names the PAR, the motions and the 802.11 clauses it rests on', () => {
    const std = ampCoexist.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const ref of ['11-26/1582r3', '§10.23.2.4', '表 9-194', '表 18-5', '§10.23.2.9', '§9.3.1.3', '§9.2.5.2', '§10.3.2.4',
      '§10.3.2.15', '§10.3.2.9', '§17.3.10.6', 'FM-48', '#250', '§39.3.2.3', 'PM-8', '#11']) {
      expect(std, ref).toContain(ref)
    }
    expect(std).not.toContain('本仿真器')
  })
})

describe('amp-coexist · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('the round contends on AC_BK with 73 µs of AIFS; the camera on AC_BE with 37 µs', () => {
    expect(implRow('接入类别').kind).toBe('faithful')
    expect([EDCA_PARAMS[0].name, EDCA_PARAMS[0].aifsn, EDCA_PARAMS[1].name, EDCA_PARAMS[1].aifsn]).toEqual(['BK', 7, 'BE', 3])
    expect([ERP_2G.sifsNs, ERP_2G.slotNs]).toEqual([10 * US, 9 * US])
    const ifs = ofType(rs, 'IFS_START').filter((r) => r.kind === 'AIFS' && r.untilNs > r.t)
    expect(new Set(ifs.filter((r) => r.node === AP && r.ac === 0).map((r) => r.untilNs - r.t))).toEqual(new Set([aifsNs(7, ERP_2G)]))
    expect(new Set(ifs.filter((r) => r.node === CAM && r.ac === 1).map((r) => r.untilNs - r.t))).toEqual(new Set([aifsNs(3, ERP_2G)]))
    expect(implRow('接入类别').sim).toBe(`轮询走 AC_BK，AIFS = 10 + 7 × 9 = ${aifsNs(7, ERP_2G) / US} µs；摄像头的上传走 AC_BE，AIFS = 10 + 3 × 9 = ${aifsNs(3, ERP_2G) / US} µs。`)
  })

  it('the CTS-to-self: 14 octets, 6 Mb/s, 50 µs, Duration = the round + one SIFS', () => {
    expect(implRow('轮前的保护').kind).toBe('choice')
    const cts = roundCts(rs)
    expect(cts.length).toBe(ROUNDS)
    for (const c of cts) {
      expect([c.frame.bytes, c.frame.mbps, c.frame.txTimeNs]).toEqual([CTS_BYTES, 6, 50 * US])
    }
    expect(implRow('轮前的保护').sim).toContain(`${CTS_BYTES} 个字节、6 Mb/s、${cts[0].frame.txTimeNs / US} µs`)
    expect(roundCts(recs(NONE))).toEqual([])
  })

  it('the round runs 4190 µs, past the 2.528 ms AC_BK TXOP limit (differs)', () => {
    expect(implRow('一轮的长度').kind).toBe('differs')
    const c = roundCts(rs)[0]
    const round = c.frame.txTimeNs + c.frame.durationFieldNs
    expect(round).toBe(4190 * US)
    expect(implRow('一轮的长度').sim).toContain(`${round / US} µs`)
    expect(round).toBeGreaterThan(EDCA_PARAMS[0].txopLimitNs)
    expect(EDCA_PARAMS[0].txopLimitNs).toBe(2_528_000)
  })

  it('an RTS that met an AMP Ack inside its timeout window fails on the spot (§10.3.2.9)', () => {
    const inside = camInSlot(rs)
    const timeouts = ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM)
    const [odd] = inside.filter((r) => !timeouts.some((t) => t.t === r.t + r.frame.txTimeNs + ERP_2G.ackTimeoutNs))
    const end = odd.t + odd.frame.txTimeNs
    const amp = ofType(rs, 'RX_OK').find((r) => r.node === CAM && r.t > end && r.frame.kind.startsWith('amp'))!
    expect(ofType(rs, 'RETRY').some((r) => r.node === CAM && r.t === amp.t)).toBe(true)
  })

  it('the router answers no RTS while it runs a round', () => {
    expect(implRow('轮询期间的接入点').kind).toBe('choice')
    for (const r of camInSlot(rs)) {
      expect(txs(rs).some((c) => c.node === AP && c.frame.kind === 'cts' && c.frame.dst === 'cam' && c.t > r.t && c.t < r.t + 100 * US)).toBe(false)
    }
  })

  it('energy detection at −62 dBm over a 20 MHz channel, and the tags arrive below it', () => {
    expect(CCA_ED_DBM).toBe(-62)
    const s = ampCoexist.scenario()
    expect(s.nodes.filter((n) => n.linkId === '2g' || n.kind === 'ap').map((n) => widthOf(n, '2g'))).toEqual([20, 20, 20, 20])
    const L = buildLinkTable(s.nodes, s.walls)
    for (const t of ['tag-1', 'tag-2']) expect(rssiOn('2g', L, t, 'cam')).toBeLessThan(CCA_ED_DBM)
    expect(ampCoexist.why).toContain(`低于 −${-CCA_ED_DBM} dBm 的能量检测门限`)
  })

  it('the same seed misses the same three rounds every time', () => {
    const again = runOf({ ...ampCoexist, id: 'amp-coexist-rerun' }, undefined, RUN_NS)
    expect(unprotected(again).map((c) => c.t)).toEqual(unprotected(rs).map((c) => c.t))
    expect(unprotected(rs).length).toBe(3)
  })
})

describe('amp-coexist · ③ every figure the labs print is the run', () => {
  it('lab 1: the two AIFS, the 36 µs between them, and the twenty late rounds', () => {
    const l = lab('轮询为什么推迟')
    const f = blockOf(l, 'formula', '两个接入类别的 AIFS')
    const m = /AIFS\[AC_BK\] = (\d+) \+ (\d) × (\d) = (\d+) µs {8}AIFS\[AC_BE\] = (\d+) \+ (\d) × (\d) = (\d+) µs/.exec(f.text)!
    expect([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]).toEqual([ERP_2G.sifsNs / US, 7, ERP_2G.slotNs / US, aifsNs(7, ERP_2G) / US])
    expect([Number(m[5]), Number(m[6]), Number(m[7]), Number(m[8])]).toEqual([ERP_2G.sifsNs / US, 3, ERP_2G.slotNs / US, aifsNs(3, ERP_2G) / US])
    expect(f.note).toContain(`晚 ${(aifsNs(7, ERP_2G) - aifsNs(3, ERP_2G)) / US} µs`)
    const rs = recs()
    const e = /两秒里轮询时钟要求 (\d+) 轮，也发出了 (\d+) 轮；CTS-to-self 平均比预定时刻晚 ([\d.]+) ms，最晚晚 ([\d.]+) ms。只有两轮准时：t = 0 的第一轮（路由器的 CTS-to-self 与摄像头的 RTS 同在 0 µs 开始），以及 ([\d.]+) s 那一轮/.exec(l.expect)!
    expect(Number(e[1])).toBe(ROUNDS)
    expect(Number(e[2])).toBe(ofType(rs, 'AMP_ROUND').length)
    const late = lateNs(rs, 100)
    expect(e[3]).toBe((mean(late) / MS).toFixed(2))
    expect(e[4]).toBe((Math.max(...late) / MS).toFixed(2))
    const onTime = late.map((x, i) => [i, x] as const).filter(([, x]) => x === 0).map(([i]) => i)
    expect(onTime.length).toBe(2)
    expect(roundCts(rs)[onTime[0]].t).toBe(0)
    expect(txs(rs).filter((r) => r.node === CAM && r.t === 0).map((r) => r.frame.kind)).toEqual(['rts'])
    expect(roundCts(rs)[onTime[1]].t).toBe(Number(e[5]) * 1000 * MS)
    expect(ampCoexist.why).toContain(`它在开始退避（backoff）之前要等的仲裁帧间间隔（arbitration interframe space, AIFS）是 ${aifsNs(7, ERP_2G) / US} µs，AC_BE 只等 ${aifsNs(3, ERP_2G) / US} µs`)
  })

  it('lab 2: the NAVs, the three missed rounds, the nine frames in a slot and the forty responses', () => {
    const rs = recs()
    const e = lab('保护帧漏收的三轮').expect
    const m = /摄像头在 (\d+) 轮里有 (\d+) 轮按 Duration 设了 (\d+) µs 的 NAV；漏收的三轮里，它的 RTS 都与 CTS-to-self 在同一时刻开始。整个运行里有 (\d+) 帧摄像头的帧落在时隙内，全是 RTS，都在这三轮里：(\d+) 帧以 CTS 超时告终，(\d+) 帧因超时窗口内收到一帧 AMP Ack 提前判失败。(\d+) 次作答有 (\d+) 次被确认（([\d.]+) %）；丢失的 (\d+) 次里，(\d+) 次是两个标签选中同一个时隙（共 (\d+) 次），(\d+) 次是与摄像头的帧相撞/.exec(e)!
    const n = m.slice(1).map(Number)
    const nav = camNav(rs)
    expect(n[0]).toBe(roundCts(rs).length)
    expect(n[1]).toBe(nav.length)
    for (const x of nav) expect(x.untilNs - x.t).toBe(n[2] * US)
    const missed = unprotected(rs)
    expect(missed.length).toBe(n[0] - n[1])
    for (const c of missed) expect(txs(rs).filter((r) => r.node === CAM && r.t === c.t).map((r) => r.frame.kind)).toEqual(['rts'])
    const inside = camInSlot(rs)
    expect(inside.length).toBe(n[3])
    expect(new Set(inside.map((r) => r.frame.kind))).toEqual(new Set(['rts']))
    const windows = missed.map((c) => ({ from: c.t, to: c.t + c.frame.txTimeNs + c.frame.durationFieldNs }))
    for (const r of inside) expect(windows.some((w) => r.t >= w.from && r.t <= w.to)).toBe(true)
    const timeouts = ofType(rs, 'CTS_TIMEOUT').filter((r) => r.node === CAM)
    expect(timeouts.length).toBe(n[4])
    expect(inside.length - n[4]).toBe(n[5])
    expect(results(rs).length).toBe(n[6])
    expect(acked(rs)).toBe(n[7])
    expect(m[9]).toBe((n[7] / n[6] * 100).toFixed(1))
    expect(n[9]).toBe(n[6] - n[7])
    const both = ofType(rs, 'COLLISION').filter((c) => TAGS.every((t) => c.nodes.includes(t)) && !c.nodes.includes(CAM))
    expect(both.length).toBe(n[11])
    expect(n[10]).toBe(2 * both.length)
    expect(ofType(rs, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length).toBe(n[12])
    expect(n[10] + n[12]).toBe(n[9])
  })

  it('lab 3: the four-configuration table, every cell against the run it names', () => {
    const rows = tableOf(lab('四种配置的代价'), '两秒，四种配置').rows
    const runs: [number | undefined, string][] = [[WIFI_ONLY, '只有 Wi-Fi（没有标签）'], [undefined, '轮询 + CTS-to-self'], [NONE, '轮询 + 无保护'], [POLL20, 'CTS-to-self，每 20 ms 轮询']]
    for (const [i, [v, label]] of runs.entries()) {
      const rs = recs(v)
      const row = rows[i]
      expect(row[0]).toBe(label)
      if (v === WIFI_ONLY) {
        expect([row[1], row[2]]).toEqual(['—', '—'])
      } else {
        const n = results(rs).length, a = acked(rs)
        expect(row[1]).toBe(`${a} / ${n} (${(a / n * 100).toFixed(1)} %)`)
        expect(row[2]).toBe(String(camInSlot(rs).length))
      }
      expect(row[3]).toBe(`${mbps(rs, CAM).toFixed(2)} Mb/s`)
      expect(row[4]).toBe(`${mbps(rs, 'ap').toFixed(2)} Mb/s`)
    }
  })

  it('lab 3: the airtime, the cost, the unprotected run, the 20 ms run and the phone', () => {
    const e = lab('四种配置的代价').expect
    const m = /每轮 (\d+) µs 里实际有帧在空口的只有 (\d+) µs，占信道的 ([\d.]+) %，摄像头却损失 ([\d.]+) % 的吞吐。去掉保护，摄像头无人回应的 RTS 从 (\d+) 次增加到 (\d+) 次，路由器记下的 collision 从 (\d+) 次增加到 (\d+) 次。每 20 ms 轮询一次时，摄像头比只有 Wi-Fi 时低 ([\d.]+) %。四种配置下手机都送达 (\d+) 帧/.exec(e)!
    const rs = recs()
    const c = roundCts(rs)[0]
    expect(Number(m[1])).toBe((c.frame.txTimeNs + c.frame.durationFieldNs) / US)
    expect(Number(m[2]) * ROUNDS * US).toBe(ampAirNs(rs))
    expect(m[3]).toBe((ampAirNs(rs) / RUN_NS * 100).toFixed(3))
    const wifi = delivered(recs(WIFI_ONLY), CAM)
    expect(m[4]).toBe(((1 - delivered(rs, CAM) / wifi) * 100).toFixed(2))
    const ctsTo = (x: TLRecord[]) => ofType(x, 'CTS_TIMEOUT').filter((r) => r.node === CAM).length
    expect([Number(m[5]), Number(m[6])]).toEqual([ctsTo(rs), ctsTo(recs(NONE))])
    const coll = (x: TLRecord[]) => ofType(x, 'RX_FAIL').filter((r) => r.node === AP && r.reason === 'collision').length
    expect([Number(m[7]), Number(m[8])]).toEqual([coll(rs), coll(recs(NONE))])
    expect(m[9]).toBe(((1 - delivered(recs(POLL20), CAM) / wifi) * 100).toFixed(2))
    for (const v of [undefined, NONE, POLL20, WIFI_ONLY]) expect(delivered(recs(v), 'ap')).toBe(Number(m[10]))
  })

  it('the why\'s own figures', () => {
    const w = ampCoexist.why!
    const pct = (x: TLRecord[]) => (acked(x) / results(x).length * 100).toFixed(1)
    expect(w).toContain(`漏收了二十帧 CTS-to-self 中的三帧`)
    expect(roundCts(recs()).length).toBe(20)
    expect(unprotected(recs()).length).toBe(3)
    expect(w).toContain(`读数的确认率从 ${pct(recs())} % 降到 ${pct(recs(NONE))} %，摄像头的吞吐也从 ${mbps(recs(), CAM).toFixed(2)} Mb/s 降到 ${mbps(recs(NONE), CAM).toFixed(2)} Mb/s`)
    const wifi = delivered(recs(WIFI_ONLY), CAM)
    expect(w).toContain(`只占 ${(ampAirNs(recs()) / RUN_NS * 100).toFixed(3)} % 的空口时间（airtime），摄像头却损失 ${((1 - delivered(recs(), CAM) / wifi) * 100).toFixed(2)} % 的吞吐`)
    expect(w).toContain(`损失到 ${((1 - delivered(recs(POLL20), CAM) / wifi) * 100).toFixed(2)} %`)
    expect(ampCoexistScenario().nodes[0].ampAp!.pollIntervalMs / ampCoexistScenario({ pollIntervalMs: 20 }).nodes[0].ampAp!.pollIntervalMs).toBe(5)
  })
})
