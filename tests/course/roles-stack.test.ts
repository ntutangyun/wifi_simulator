/**
 * Every empirical claim of "Who is who in one network"
 * (src/course/tier1/roles-stack.ts), measured against the lesson's own
 * scenario. The lesson is written to the zero-to-hero contract, so the shape,
 * the minutes and the jump targets come from `lessonShapeSuite`; what is left
 * here is the module, the `needs`, the exact `terms`, the scenario schema and
 * the numbers the prose quotes.
 *
 * Re-paced on 2026-09-25: this is the FIRST half. The relay — its five-step
 * timeline, the 1430 B frame and its 125.6 µs, the one-hop-against-two averages
 * and both experiments — moved to tests/course/relay-hops.test.ts with the
 * sentences that carry it, so no pin is lost; what stays here is the roles, the
 * names and the addressing rule. The nested stack figure went to
 * `frame-anatomy` with the layering it drew (§5.1 item 2), rebuilt on that
 * lesson's own frame and pinned there.
 *
 * The scenario builder is unchanged, so `lesson-hashes.json` is untouched and
 * the recorded timeline is the one the fixture already holds.
 */
import { describe, it, expect } from 'vitest'
import {
  rolesStack, rolesStackScenario, firstUplinkData, firstDownlinkData, firstRelayHop1, firstRelayHop2,
} from '../../src/course/tier1/roles-stack'
import type { TopologySpec } from '../../src/course/diagram'
import type { Block } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import type { LatencyStats } from '../../src/model/view'
import { lessonShapeSuite, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { decodeFrame } from '../../src/model/frameFields'
import { FRAME_KINDS } from '../../src/model/frames'
import { MAC_HDR_BYTES, QOS_HDR_BYTES, FCS_BYTES } from '../../src/engine/phy'

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const MS = 1_000_000
const RUN_NS = 1000 * MS
const PHONES = ['sta-3', 'sta-4']

function run(sc: Scenario, ms: number) {
  const sim = new Simulation(sc)
  const records = [...sim.runUntil(ms * MS).records]
  return { records, view: sim.view }
}
const mean = (l: LatencyStats): number => l.sumNs / l.n
const ids = (r: Tx): number[] => r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : [])
const dataTx = (rs: TLRecord[]): Tx[] => rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.kind === 'data')

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// The laptop's backup leaves in bursts every 60 ms, so its first uplink frame is outside the
// kit's default 30 ms window; the suite gets the same 1000 ms run the claims below share.
lessonShapeSuite(rolesStack, { runNs: RUN_NS })

describe('roles-stack · the lesson itself', () => {
  it('opens the module about roles and owns the architecture words', () => {
    expect(MODULES[rolesStack.module].title).toBe('一张网里的角色')
    // decode-thresholds joined when rule 2 stopped grading vacuously: the opening
    // sentence uses its `rate margin`, so the lesson has to declare it.
    expect(rolesStack.needs).toEqual(['radio-primer', 'decode-thresholds'])
    // the baseline owner table of the readability programme: BSS, BSSID and SSID are this
    // lesson's to introduce, and DS comes with them because "everything goes through the
    // middle" cannot be told without it.
    expect(rolesStack.terms!.map((t) => t.term)).toEqual(['BSS', 'BSSID', 'SSID', 'DS'])
  })

  it('keeps the two jumps this half is about, and leaves the relay to the next lesson', () => {
    // §2 · M2: "roles-stack takes over the two currently unused jumps as its scene".
    expect(rolesStack.jumps.map((j) => j.label)).toEqual([
      '第一个上行数据帧（笔记本 → AP）', '第一个下行数据帧（AP → 电视）',
    ])
  })

  it('the scenario passes the schema and every quiz answer is in range', () => {
    expect(() => ScenarioSchema.parse(rolesStack.scenario())).not.toThrow()
    expect(rolesStack.scenario()).toEqual(rolesStackScenario())
    expect(rolesStack.variants).toBeUndefined()
    for (const q of rolesStack.quiz) expect(q.answer).toBeLessThan(q.options.length)
  })
})

describe('roles-stack · the base scenario', () => {
  // one shared run for every claim below; the kit memoises it per worker
  const rs1s = runOf(rolesStack, undefined, RUN_NS)
  const { view: v1s } = run(rolesStackScenario(), 1000)

  it('both jump targets occur, and each one is addressed the way the watch says', () => {
    for (const j of rolesStack.jumps) expect(rs1s.some(j.find), j.label).toBe(true)
    // the watch call-out: "两帧的方向相反，可有一头总是同一个：接入点"
    expect((rs1s.find(firstUplinkData) as Tx).frame.dst).toBe('ap')
    const dl = rs1s.find(firstDownlinkData) as Tx
    expect(dl.node).toBe('ap')
    expect(dl.frame.dst).toBe('sta-2')
  })

  it('the steps block: the recipient is the access point, never the far station', () => {
    // 1. "上层交下来的那份载荷，写着它最终要去的那台设备" — a phone's MSDU is born with the
    //    AP as its dst, which is `traffic.ts`'s p2pvideo enqueue; the final station is
    //    carried separately, which is why the AP can forward it later.
    const arrivals = rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> =>
      r.type === 'ARRIVAL' && PHONES.includes(r.node))
    expect(arrivals.length).toBeGreaterThan(500)
    // 2. "它把收件人填成接入点" — every single one of them
    for (const a of arrivals) expect(a.dst).toBe('ap')
    // and every data frame a station transmits is addressed to the AP
    const data = dataTx(rs1s)
    expect(data.some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
    // 3. "只有接入点作答" — the answer to a station's frame always comes from the AP
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    const answers = rs1s.filter((r): r is Tx =>
      r.type === 'TX_START' && r.frame.kind === 'ack' && r.t > hop1.t && r.frame.dst === hop1.node)
    expect(answers.length).toBeGreaterThan(0)
    expect(answers[0].node).toBe('ap')
    // 4. "接入点…把同一份载荷再发一次": the same payload id leaves the AP again
    const hop2 = rs1s.find(firstRelayHop2) as Tx
    expect(ids(hop2)).toEqual(ids(hop1))
  })

  it('no data frame goes straight from one station to another; every relayed payload crosses twice', () => {
    // the picture's "一个站点能发送数据的对端只有一个" and the first observation's
    // "整整一秒里，这张网上没有一个数据帧是站点直发站点的"
    const data = dataTx(rs1s)
    expect(data.some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
    const delivered = rs1s.filter((r) => r.type === 'DEQUEUE' && r.node === 'ap')
      .map((r) => (r as Extract<TLRecord, { type: 'DEQUEUE' }>).msduId)
    const hop1Ids = new Set(data.filter((r) => PHONES.includes(r.node)).flatMap(ids))
    const hop2Ids = new Set(data.filter((r) => r.node === 'ap' && PHONES.includes(r.frame.dst)).flatMap(ids))
    const relayed = delivered.filter((id) => hop1Ids.has(id))
    expect(relayed.length).toBeGreaterThan(1000)
    for (const id of relayed) expect(hop2Ids.has(id)).toBe(true)
  })

  it('the TV never sends a data frame, though it transmits all the time', () => {
    // observation 2: "电视那条泳道上一个数据帧也没有：只收不发的设备仍然要发送，但只是为了作答"
    const tv = rs1s.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2')
    expect(tv.length).toBeGreaterThan(500)
    expect(tv.every((r) => r.frame.kind !== 'data')).toBe(true)
    for (const kind of ['ack', 'ba', 'cts']) expect(tv.some((r) => r.frame.kind === kind), kind).toBe(true)
  })

  it('what each device is doing, as the table states it', () => {
    // "50 × 1500 B every 60 ms" · "1400 B about every 0.85 ms" · "1400 B every 1.4–1.7 ms each way"
    const arrivals = (node: string) => rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> =>
      r.type === 'ARRIVAL' && r.node === node && r.dst === (node === 'ap' ? 'sta-2' : 'ap'))
    const tv = arrivals('ap')
    expect(tv.every((r) => r.bytes === 1400)).toBe(true)
    expect(1000 / tv.length).toBeGreaterThan(0.8)
    expect(1000 / tv.length).toBeLessThan(0.9)
    for (const p of PHONES) {
      const a = arrivals(p)
      expect(a.every((r) => r.bytes === 1400)).toBe(true)
      for (let i = 1; i < a.length; i++) {
        const gap = a[i].t - a[i - 1].t
        expect(gap).toBeGreaterThanOrEqual(1.4 * MS)
        expect(gap).toBeLessThanOrEqual(1.7 * MS)
      }
    }
    const lap = rs1s.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> => r.type === 'ARRIVAL' && r.node === 'sta-1')
    const times = [...new Set(lap.map((r) => r.t))]
    expect(lap.every((r) => r.bytes === 1500)).toBe(true)
    expect(lap.length).toBe(50 * times.length)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBe(60 * MS)
    // "50 × 1500 B" really is one burst of fifty on the air
    expect((rs1s.find(firstUplinkData) as Tx).frame.ampdu?.mpduCount).toBe(50)
    // the AP's row: "每份载荷都在空口上走两趟" — the relayed payloads, counted next door too
    const relayed = rs1s.filter((r) => r.type === 'ARRIVAL' && r.node === 'ap' && PHONES.includes(r.dst as string))
    expect(relayed.length).toBeGreaterThan(1000)
    // and the AP's own average forwarding delay is not what this lesson claims anything about
    expect(mean(v1s.nodes['sta-2'].stats.rxLatency)).toBeGreaterThan(0)
  })

  it('the deeper note: Phone A cannot decode Phone B directly, and the reason is the SINR', () => {
    // "手机 A 连手机 B 的第一帧都解不出来 … 记录是一条 RX_FAIL"
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    const failA = rs1s.find((r) => r.type === 'RX_FAIL' && r.node === 'sta-3' && r.t === hop1.t + hop1.frame.txTimeNs)
    expect(failA).toMatchObject({ from: 'sta-4', reason: 'lowSinr' })
    // "at 6 m apart across the room": Phone A at (2, 6), Phone B at (8, 6)
    const sc = rolesStackScenario()
    const a = sc.nodes.find((n) => n.id === 'sta-3')!.pos
    const b = sc.nodes.find((n) => n.id === 'sta-4')!.pos
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBe(6)
  })
})

/**
 * The figure of the pilot lesson, pinned against the same run as its prose.
 * A diagram in this course is derived from the run wherever the figures exist
 * (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md), and this is
 * what that means in practice: the numbers are read back OUT of the spec the
 * panel paints and compared with the engine, so a figure that drifts fails here
 * rather than misleading a reader.
 */
describe('roles-stack · the figure is the run', () => {
  const rs = runOf(rolesStack, undefined, RUN_NS)
  const isDiagram = (b: Block): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram'
  const diagrams = [...rolesStack.picture!, ...rolesStack.numbers!].filter(isDiagram)
  const topology = diagrams.find((b) => b.spec.kind === 'topology')!.spec as TopologySpec

  it('draws the one figure this half is for, and no others', () => {
    // the nested stack figure left with the layering it drew: it is `frame-anatomy`'s now
    expect(diagrams.map((b) => b.spec.kind)).toEqual(['topology'])
  })

  it('the topology figure is the scene this lesson loads, node for node', () => {
    const sc = rolesStackScenario()
    expect(topology.nodes.map((n) => n.id)).toEqual(sc.nodes.map((n) => n.id))
    for (const n of topology.nodes) {
      const real = sc.nodes.find((x) => x.id === n.id)!
      expect([n.x, n.y], n.id).toEqual([real.pos.x, real.pos.y])
      expect(n.role, n.id).toBe(real.kind === 'ap' ? 'ap' : 'sta')
      expect(n.label.trim(), n.id).not.toBe('')
    }
    // the ring is the whole BSS: every node of the scene, and nothing else
    expect(topology.ring!.nodes).toEqual(sc.nodes.map((n) => n.id))
  })

  it('every line the figure draws is a path the run agrees about', () => {
    // every solid link has the access point at one end, because the run has no
    // station-to-station data frame at all
    const solid = topology.links.filter((l) => l.tone !== 'muted')
    for (const l of solid) expect([l.from, l.to], `${l.from}→${l.to}`).toContain('ap')
    expect(dataTx(rs).some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
    // and the one dashed link is the one pair the run refuses: Phone A cannot
    // decode Phone B, which is an RX_FAIL in the timeline
    const dashed = topology.links.filter((l) => l.tone === 'muted')
    expect(dashed.length).toBe(1)
    expect([dashed[0].from, dashed[0].to].sort()).toEqual([...PHONES].sort())
    expect(rs.some((r) => r.type === 'RX_FAIL' && r.node === 'sta-3' && r.from === 'sta-4')).toBe(true)
    // the two labelled hops are the two transmissions one payload really takes
    const hop1 = rs.find(firstRelayHop1) as Tx
    const hop2 = rs.find(firstRelayHop2) as Tx
    expect(solid.filter((l) => l.label).map((l) => [l.from, l.to]))
      .toEqual([[hop1.node, hop1.frame.dst], [hop2.node, hop2.frame.dst]])
  })
})

describe('roles-stack · the experiment', () => {
  it('the TV as an uploader: data frames appear, and every one is still addressed to the AP', () => {
    // tryThis: "把电视的业务改成 backup（上行备份）再载入。它的泳道上开始出现数据帧了，
    //  可收件人依旧只有接入点一个"
    const sc = rolesStackScenario()
    sc.nodes.find((n) => n.id === 'sta-2')!.profiles = ['backup']
    const { records } = run(sc, 200)
    const tv = records.filter((r): r is Tx => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
    expect(tv.length).toBeGreaterThan(0)
    for (const r of tv) expect(r.frame.dst).toBe('ap')
    // and the rule has not changed for anybody else either
    expect(dataTx(records).some((r) => r.node !== 'ap' && r.frame.dst !== 'ap')).toBe(false)
  })
})
/**
 * **Every figure the prose prints, read back out of it.**
 *
 * The file above measures the right thing and compares it with a figure typed on **this** side —
 * `expect(lap.every((r) => r.bytes === 1500)).toBe(true)` — with the lesson's table quoted in a
 * comment. So the engine is pinned and the prose is not: the sampling sweep of 2026-10-12
 * planted six of this lesson's figures and **two went unnoticed**. Here every figure is parsed
 * out of the shipped string and compared with the same measurement.
 *
 * **The reads worth naming:**
 *
 *  - **each row of the device table is read against the arrivals it describes**, by the device
 *    its own first cell names — so the burst of fifty, the two payload sizes and the three
 *    periods are measured on the lane that row is about.
 *  - **「约每 0.85 ms 一个」 is read at the precision it prints**: the mean spacing of the
 *    television's arrivals over the second this lesson measures, to the hundredth.
 *  - **「每 1.4–1.7 ms」 is read as the tightest pair the run allows**: the smallest gap rounded
 *    down and the largest rounded up, so a wider range would fail and a narrower one could not
 *    have been printed.
 *  - **「三个 6 字节的地址位置」 is read off the decoder**, and the 48 bits `sources` quotes for a
 *    BSSID are the same six octets, times eight.
 */
describe('roles-stack · every figure the prose prints, read back out of it', () => {
  // the same second the file above measures: `runOf` hands back the one run, memoized
  const rs1s = runOf(rolesStack, undefined, RUN_NS)
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const PIC = blockText(rolesStack.picture)
  const DEEP = blockText(rolesStack.deeper)
  const LIM = blockText(rolesStack.limits)
  const SRC = blockText(rolesStack.sources)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const table = (): { head: string[]; rows: string[][] } =>
    rolesStack.numbers!.find((b) => b.kind === 'table') as unknown as
      { head: string[]; rows: string[][] }
  type Arrival = Extract<TLRecord, { type: 'ARRIVAL' }>
  const arrivalsAt = (node: string, dst: string): Arrival[] =>
    rs1s.filter((r): r is Arrival => r.type === 'ARRIVAL' && r.node === node && r.dst === dst)

  it('reads the device table against the arrivals each row is about', () => {
    for (const row of table().rows) {
      const [device, , load] = row as [string, string, string]
      if (device.includes('笔记本')) {
        // 「50 × 1500 B，每 60 ms 一批」
        const [count, bytes, everyMs] = figs(load, /(\d+) × (\d+) B，每 (\d+) ms 一批/,
          `${device}: its own cell`)
        const lap = rs1s.filter((r): r is Arrival => r.type === 'ARRIVAL' && r.node === 'sta-1')
        const times = [...new Set(lap.map((r) => r.t))]
        expect(lap.every((r) => r.bytes === bytes), `${device}: every payload`).toBe(true)
        expect(lap.length, `${device}: as many payloads as that many per batch`)
          .toBe(count! * times.length)
        for (let i = 1; i < times.length; i++) {
          expect(times[i]! - times[i - 1]!, `${device}: the gap between batches`).toBe(everyMs! * MS)
        }
        expect((rs1s.find(firstUplinkData) as Tx).frame.ampdu?.mpduCount,
          `${device}: and one burst really carries that many`).toBe(count)
      } else if (device.includes('电视')) {
        // 「1400 B，约每 0.85 ms 一个」
        const [bytes] = figs(load, /^(\d+) B，约每/, `${device}: its payload`)
        const [aboutMs] = raw(load, /约每 ([\d.]+) ms 一个/, `${device}: its period`)
        const tv = arrivalsAt('ap', 'sta-2')
        expect(tv.every((r) => r.bytes === bytes), `${device}: every payload`).toBe(true)
        same(aboutMs!, (RUN_NS / MS) / tv.length, `${device}: the mean spacing of its arrivals`)
      } else if (device.includes('手机')) {
        // 「1400 B，每个方向每 1.4–1.7 ms 一个」
        const [bytes] = figs(load, /^(\d+) B，每个方向/, `${device}: its payload`)
        const [lo, hi] = figs(load, /每个方向每 ([\d.]+)–([\d.]+) ms 一个/, `${device}: its range`)
        for (const p of PHONES) {
          const a = arrivalsAt(p, 'ap')
          expect(a.every((r) => r.bytes === bytes), `${p}: every payload`).toBe(true)
          const gaps = a.slice(1).map((r, i) => r.t - a[i]!.t)
          expect(Math.min(...gaps) / MS, `${p}: no gap below the bottom of that range`)
            .toBeGreaterThanOrEqual(lo!)
          expect(Math.max(...gaps) / MS, `${p}: none above the top`).toBeLessThanOrEqual(hi!)
          // the tightest pair the run allows: a wider range would be a looser claim
          expect(Math.floor((Math.min(...gaps) / MS) * 10) / 10, `${p}: the bottom is the run’s own`)
            .toBe(lo)
          expect(Math.ceil((Math.max(...gaps) / MS) * 10) / 10, `${p}: and so is the top`).toBe(hi)
        }
      } else {
        // 「每份载荷都在空口上走两趟」 — the access point's own row, and it carries no figure
        expect(load, 'the access point’s row says what it does, not how much').toContain('两趟')
        const relayed = rs1s.filter((r) => r.type === 'ARRIVAL' && r.node === 'ap'
          && PHONES.includes(r.dst as string))
        expect(relayed.length, 'and it really re-queues the phones’ payloads').toBeGreaterThan(1000)
      }
    }
  })

  it('reads the six metres the caption and `deeper` both print', () => {
    const sc = rolesStackScenario()
    const a = sc.nodes.find((n) => n.id === 'sta-3')!.pos
    const b = sc.nodes.find((n) => n.id === 'sta-4')!.pos
    const apart = Math.hypot(a.x - b.x, a.y - b.y)
    for (const [text, re, what] of [
      [PIC, /隔着 (\d+) m，第一帧就解不出来/, 'the caption on the two phones'],
      [DEEP, /隔着房间 (\d+) m，信干噪比支持不了/, '`deeper` on the same distance'],
    ] as [string, RegExp, string][]) {
      expect(figs(text, re, what)[0], what).toBe(apart)
    }
    // and the failure that distance causes is the one `deeper` names
    const hop1 = rs1s.find(firstRelayHop1) as Tx
    const failA = rs1s.find((r) => r.type === 'RX_FAIL' && r.node === 'sta-3'
      && r.t === hop1.t + hop1.frame.txTimeNs)
    expect(failA, 'the overheard frame really fails at the other phone')
      .toMatchObject({ from: 'sta-4', reason: 'lowSinr' })
  })

  it('reads `limits` and `sources`: the four traffic figures again, and the addresses', () => {
    // 「1500 B 一批 50 份的备份、每 0.85 ms 一个 1400 B 的视频帧」 — the table's figures, restated
    const [bytes, perBatch, everyMs, videoBytes] = figs(LIM,
      /(\d+) B 一批 (\d+) 份的备份、每 ([\d.]+) ms 一个 (\d+) B 的视频帧/,
      '`limits` on the traffic model')
    const lap = rs1s.filter((r): r is Arrival => r.type === 'ARRIVAL' && r.node === 'sta-1')
    expect(lap.every((r) => r.bytes === bytes), 'the backup’s own payload').toBe(true)
    expect(lap.length / new Set(lap.map((r) => r.t)).size, 'and its batch').toBe(perBatch)
    const tv = arrivalsAt('ap', 'sta-2')
    expect(tv.every((r) => r.bytes === videoBytes), 'the video frame’s payload').toBe(true)
    same(String(everyMs), (RUN_NS / MS) / tv.length, 'and how often one arrives')
    /*
     * 「字段视图里那三个 6 字节的地址位置填的就是这些 id」 — read off the decoder: three address
     * fields, each that wide, and each filled with a node id of this scene.
     */
    const [addrs, octets] = raw(LIM, /那(.)个 (\d) 字节的地址位置/, '`limits` on the address fields')
    const cn = (s: string): number => '零一二三四五六七八九'.indexOf(s === '两' ? '二' : s)
    const ul = rs1s.find(firstUplinkData) as Tx
    const fields = decodeFrame(ul.frame, { apId: 'ap', isEdca: true })
      .users[0]!.subframes[0]!.mpdu.fields.filter((f) => f.key.startsWith('addr'))
    expect(fields.length, 'the address fields this decoder really builds').toBe(cn(addrs!))
    for (const f of fields) {
      expect(f.bytes, `${f.key} is that many octets`).toBe(val(octets!))
      expect(rolesStackScenario().nodes.some((n) => n.id === f.node),
        `${f.key} is filled with a node id`).toBe(true)
    }
    // 「BSSID 为 48 位」 — the standard's own width (class (a)), and it is those six octets
    const [bits] = figs(SRC, /BSSID 为 (\d+) 位/, '`sources` on the BSSID')
    expect(bits, 'the same address, in bits').toBe(val(octets!) * 8)
    /*
     * 「每个站点从 0 时刻起就已关联」 — read as what the engine has instead of association: no
     * management frame kind exists at all, and the run opens with traffic.
     */
    /*
     * **Exempt, class (d): the 「0 时刻」 itself** — it is the name of the clock's origin, and any
     * instant before the first record would read the same. What is read is the claim around it:
     * there is no management frame kind to associate with, nothing is on the air before the
     * first traffic, and the first frame leaves as soon as a payload arrives rather than after
     * an exchange.
     */
    const [zero] = figs(LIM, /每个站点从 (\d) 时刻起就已关联/, '`limits` on association')
    for (const kind of ['beacon', 'probe', 'auth', 'assoc']) {
      expect([...FRAME_KINDS], `no ${kind} frame kind`).not.toContain(kind)
    }
    // reduced rather than spread: this run is hundreds of thousands of records long
    expect(rs1s.reduce((m, r) => Math.min(m, r.t), Infinity), 'nothing happens before that instant')
      .toBeGreaterThanOrEqual(zero!)
    const firstArrival = rs1s.find((r): r is Arrival => r.type === 'ARRIVAL')!
    const firstTx = rs1s.find((r): r is Tx => r.type === 'TX_START')!
    expect(firstTx.t, 'and the first frame on the air follows the first payload, not a handshake')
      .toBeGreaterThanOrEqual(firstArrival.t)
    expect(firstTx.t - firstArrival.t, 'within one access delay of it').toBeLessThan(MS)
    // 「p2pvideo 的每一份载荷入队时收件人就写成接入点」 — the profile the phones really carry
    const [profile] = raw(LIM, /(p\dpvideo) 的每一份载荷/, '`limits` on the profile it names')
    for (const p of PHONES) {
      expect(rolesStackScenario().nodes.find((n) => n.id === p)!.profiles,
        `${p} really runs that profile`).toContain(profile)
    }
    /*
     * **Exempt, class (a): the 8 octets of the LLC/SNAP header.** It is 802.2's, no corpus ships
     * with this repo, and 「而在 802.11 看来，那只是载荷的一部分」 is the sentence's own point.
     * What is read is that point: this engine's frame accounting has no such header in it — a
     * frame is header plus payload plus FCS, with nothing between.
     */
    const [llc] = figs(DEEP, /MAC 载荷以 (\d) 个八位组的 LLC\/SNAP 头开头/, '`deeper` on LLC/SNAP')
    expect(llc, 'an octet count, not a field this engine builds').toBeGreaterThan(0)
    const sub0 = decodeFrame(ul.frame, { apId: 'ap', isEdca: true }).users[0]!.subframes[0]!
    expect(sub0.mpdu.fields.some((f) => /llc|snap/i.test(f.key)),
      'this engine builds no such field').toBe(false)
    const body = sub0.mpdu.fields.find((f) => f.key === 'body')!
    expect(body.bytes, 'and the payload is the arrival’s own size, with nothing prepended')
      .toBe(lap[0]!.bytes)
    expect(QOS_HDR_BYTES + body.bytes + FCS_BYTES - MAC_HDR_BYTES,
      'so one subframe is header, payload and check, and the two headers differ by the QoS pair')
      .toBe(body.bytes + FCS_BYTES + (QOS_HDR_BYTES - MAC_HDR_BYTES))
  })
})
