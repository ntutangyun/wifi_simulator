/**
 * `@capstone`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 and 802.11be-2024 for what a shared medium gives a household; ②
 * says what the engine does instead, row by row, and is checked here against the engine and the
 * run; ③'s five labs print figures from the base five seconds and from the three candidate edits,
 * and every one of them is read back out of the lesson and compared with the run it describes.
 *
 * The three candidates are editor edits, not `variants`, and are measured here exactly as the labs'
 * steps describe them: the laptop's traffic set to idle, its MLO feature off, and the tablet
 * replaced with an OFDMA-capable Wi-Fi 6 radio.
 *
 * The coherence-time comparison that used to sit in `limits` now sits in the ② row 「移动与多普勒」;
 * tests/course/fading.test.ts pins its three figures there, and this file reads them as arithmetic.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { TGI_NS, symNsFor } from '../../src/engine/phy'
import { FADING_DEFAULTS } from '../../src/engine/fading'
import { capstone, capstoneScenario, capstoneTopology } from '../../src/course/tier2/capstone'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite } from './kit'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
/** The five seconds every number in this lesson is measured over; the Trigger jump needs them. */
const RUN_NS = 5_000 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')

interface Scene {
  rs: TLRecord[]
  /** Share of the clock this lane held, in per cent — the inspector's own figure. */
  air: (id: string) => number
  /** Mean wait before a frame of this lane left, ms. */
  txWait: (id: string) => number
  /** Mean wait a frame this lane received had endured, ms. */
  rxWait: (id: string) => number
  /** Bytes this lane was handed. */
  got: (id: string) => number
  /** Megabytes the access point received across both of its links. */
  upMb: number
}

function scene(mod: (sc: Scenario) => void = () => {}): Scene {
  const sc = capstone.scenario()
  mod(sc)
  const sim = new Simulation(sc)
  const rs = [...sim.runUntil(RUN_NS).records]
  const st = (id: string) => sim.view.nodes[id]?.stats
  const mean = (x: { n: number; sumNs: number } | undefined) => (x && x.n ? x.sumNs / x.n / MS : NaN)
  return {
    rs,
    air: (id) => ((st(id)?.airtimeNs ?? 0) / RUN_NS) * 100,
    txWait: (id) => mean(st(id)?.txLatency),
    rxWait: (id) => mean(st(id)?.rxLatency),
    got: (id) => st(id)?.bytesDelivered ?? 0,
    upMb: (st('ap')!.bytesDelivered + (st('ap#6g')?.bytesDelivered ?? 0)) / 1e6,
  }
}

const base = scene()
const backupStopped = scene((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.profiles = ['idle'] })
const radioOff = scene((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo = false })
const tabletNew = scene((sc) => {
  const n = sc.nodes.find((x) => x.id === 'sta-4')!
  n.caps.generation = 'he'
  n.caps.features.ofdma = true
})
const COLUMNS = [base, backupStopped, radioOff, tabletNew]

const lab = (heading: string): Lab => {
  const l = capstone.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = capstone.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const same = (printed: string, measured: number, what: string): void => {
  const fig = printed.replace(/[\s,%]/g, '')
  const dp = (fig.split('.')[1] ?? '').length
  expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`).toBe(Number(measured.toFixed(dp)))
}
// 2026-11-11 (W7b): the sensor now sends 两 frames; 「两」 is how written Chinese counts two.
const zh = (s: string): number => '零一二三四五六七八九十'.indexOf(s === '两' ? '二' : s)
const members = (s: Scene): string[] => [...new Set(s.rs.flatMap((r) => (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.muParts
  ? r.frame.muParts.map((p) => p.dst) : [])))].sort()

lessonShapeSuite(capstone, { runNs: RUN_NS })

describe('capstone · the lesson', () => {
  it('is the last Wi-Fi lesson, standard-first, and names what it leans on', () => {
    expect(isStandardFirst(capstone)).toBe(true)
    expect(MODULES[capstone.module].title).toBe('真实应用')
    expect(capstone.needs).toEqual([
      'edca', 'txop', 'width', 'rate', 'anomaly', 'tier1-project', 'ofdma-dl', 'ofdma-ul', 'mumimo-choose', 'mlo-gain',
    ])
    expect(capstone.terms!.map((t) => t.term)).toEqual(['bottleneck', 'offered load'])
    expect(capstone.limits).toEqual([])
    expect(capstone.observe).toEqual([])
    expect(capstone.tryThis).toEqual([])
    expect(capstone.variants).toBeUndefined()
  })

  it('three rooms, brick between them, a door in each inner wall, seven devices', () => {
    const sc = capstone.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.rooms).toHaveLength(3)
    expect(sc.walls.filter((w) => w.material === 'brick')).toHaveLength(4)
    expect(sc.walls.filter((w) => w.openings.length > 0)).toHaveLength(2)
    expect(sc.nodes.map((n) => n.caps.generation)).toEqual(['eht', 'eht', 'he', 'he', 'vht', 'nonht', 'he'])
    expect(sc.nodes.find((n) => n.id === 'sta-1')!.profiles).toEqual(['saturated'])
    expect(capstone.scenario()).toEqual(capstoneScenario())
  })

  it('cites each clause it teaches in ①', () => {
    const std = capstone.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const c of ['§10.23.2.1', '§10.23.2.4', '§10.2.3.2', '表 10-1', '§9.4.2.27', '§26.5.1.1', '§35.3.16.1', '§10.23.2.8', '§10.23.2.9', '§35.3.7.2.1']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain('不规定一个网络该优先照顾哪台设备')
    // Table 10-1 as ① prints it
    expect(std).toContain('1、2 映射到 AC_BK，0、3 映射到 AC_BE，4、5 映射到 AC_VI，6、7 映射到 AC_VO')
  })

  it('the jumps land in the base run, and the band a jump names is its lane', () => {
    for (const j of capstone.jumps) expect(base.rs.some(j.find), j.label).toBe(true)
    const j6 = capstone.jumps.find((j) => j.label.includes('6 GHz'))!
    expect((base.rs.find(j6.find) as { node: string }).node.endsWith('#6g')).toBe(true)
  })
})

describe('capstone · ② says what the engine does, and the engine does it', () => {
  // 2026-11-11 (W7b): every MSDU now carries a user priority and its AC is looked up in Table 10-1
  // (§10.2.3.2); only the UP itself comes from the profile, which the standard leaves above the MAC.
  // So the row is a `choice`, no longer `differs`.
  it('the access category follows each frame’s user priority; the saturated upload is AC_BE', () => {
    const r = implRow('帧归入哪一类')
    expect(r.kind).toBe('choice')
    const acOf = (id: string): (number | null | undefined)[] => [...new Set(base.rs.filter((x): x is Extract<TLRecord, { type: 'ENQUEUE' }> =>
      x.type === 'ENQUEUE' && (x.node === id || x.dst === id)).map((x) => x.ac))]
    const AC = ['AC_BK', 'AC_BE', 'AC_VI', 'AC_VO']
    for (const [label, id] of [['饱和上传', 'sta-1'], ['视频', 'sta-2'], ['语音', 'sta-3'], ['浏览', 'sta-4']] as const) {
      const acs = acOf(id)
      expect(acs.length, label).toBe(1)
      expect(r.sim, label).toContain(`${label}为 ${AC[acs[0]!]}`)
    }
    // 「传感器是不支持 EDCA 的旧电台，不分类别」
    expect(r.sim).toContain('传感器是不支持 EDCA 的旧电台，不分类别')
    expect(capstone.scenario().nodes.find((n) => n.id === 'sta-5')!.caps.features.edca).toBeFalsy()
    expect(acOf('sta-5').every((x) => x === undefined || x === null)).toBe(true)
  })

  it('the saturated profile keeps 20 frames waiting, never more', () => {
    const w = Number(/饱和档位始终保持 (\d+) 帧待发/.exec(implRow('流量').sim)![1])
    const depth = base.rs.filter((r): r is Extract<TLRecord, { type: 'ENQUEUE' }> => r.type === 'ENQUEUE' && r.node === 'sta-1').map((r) => r.depth)
    expect(Math.max(...depth)).toBe(w)
  })

  it('grouping stays inside the winning access category: the tablet is never grouped, before or after', () => {
    expect(implRow('编组的策略').sim).toContain('不同接入类别的下行帧从不编入同一次发送')
    expect(members(base)).toEqual(['sta-2', 'sta-6'])
    expect(members(tabletNew)).toEqual(['sta-2', 'sta-6'])
    // every downlink multi-user send carries one access category, the video's
    const dl = base.rs.filter((r): r is Tx => r.type === 'TX_START' && r.frame.dst === '*mu' && r.frame.kind === 'data')
    expect(dl.length).toBeGreaterThan(0)
    expect(new Set(dl.map((r) => r.frame.ac))).toEqual(new Set([2]))
  })

  it('the coherence-time row: 10 and 20 symbols fold to 136 and 272 µs, and 100 ms is 735 times the first', () => {
    const r = implRow('移动与多普勒')
    const [s1, s2] = /每 (\d+) 或 (\d+) 个符号（symbol）插入一次/.exec(r.standard)!.slice(1).map(Number)
    const [u1, u2, hold, times] = /折成 (\d+) µs 与 (\d+) µs，而本仿真器较慢的那一层取 (\d+) ms，是前者的 (\d+) 倍/.exec(r.sim)!.slice(1).map(Number)
    const symNs = symNsFor('he', TGI_NS.base)
    expect([u1 * 1000, u2 * 1000]).toEqual([s1 * symNs, s2 * symNs])
    expect(hold).toBe(FADING_DEFAULTS.coherenceMs)
    expect(times).toBe(Math.round((hold * 1000) / u1))
  })
})

describe('capstone · ③ every figure the labs print is the run', () => {
  it('lab 1: the air-share table, the sensor, and the figure', () => {
    const l = lab('先看是谁占用了空口')
    const fig = l.blocks!.find((b) => b.kind === 'diagram') as { spec: unknown }
    expect(fig.spec).toEqual(capstoneTopology())
    const rows = tableOf(l, '五秒内的空口占比').rows
    for (const [label, share] of rows) {
      const lane = /（(sta-1(?:#6g)?)）/.exec(label)?.[1]
      if (lane) same(share.replace('%', ''), base.air(lane), label)
      else {
        const cap = Number(/都不到 (\d+)%/.exec(share)![1])
        for (const id of ['sta-2', 'sta-3', 'sta-4', 'sta-5', 'sta-6']) expect(base.air(id), id).toBeLessThan(cap)
      }
    }
    const e = /5 GHz 的 ([\d.]+)%、6 GHz 的 ([\d.]+)%.*传感器五秒只发了(.)帧，共 (\d+) 字节/.exec(l.expect)!
    same(e[1], base.air('sta-1'), '5 GHz share')
    same(e[2], base.air('sta-1#6g'), '6 GHz share')
    const sent = data(base.rs, 'sta-5')
    expect(zh(e[3])).toBe(sent.length)
    expect(Number(e[4])).toBe(sent.reduce((a, r) => a + r.frame.bytes, 0))
    // the why prints the two shares too
    const w = /5 GHz ([\d.]+)%、6 GHz ([\d.]+)% 的时间/.exec(capstone.why!)!
    same(w[1], base.air('sta-1'), 'why: 5 GHz share')
    same(w[2], base.air('sta-1#6g'), 'why: 6 GHz share')
  })

  it('lab 2: the four-way table, cell by cell, against the four runs', () => {
    const l = lab('停止备份')
    const t = tableOf(l, '同样的五秒钟，四种方案')
    expect(t.head.slice(1)).toEqual(['原样', '停止备份', '关闭第二台电台', '平板换 Wi-Fi 6'])
    for (const row of t.rows) {
      const label = row[0]
      for (const [c, s] of COLUMNS.entries()) {
        const cell = row[c + 1]
        if (label.startsWith('备份送达量')) same(cell, s.upMb, `${label} / ${t.head[c + 1]}`)
        else {
          const lane = /泳道 (sta-\d)/.exec(label)![1]
          same(cell.replace(' ms', ''), label.includes('发送等待') ? s.txWait(lane) : s.rxWait(lane), `${label} / ${t.head[c + 1]}`)
        }
      }
    }
    expect(data(backupStopped.rs, 'sta-1').length + data(backupStopped.rs, 'sta-1#6g').length).toBe(0)
    // expect: the three collapses, and the two columns that never move
    const e = /视频从 ([\d.]+) ms 降到 ([\d.]+)，语音从 ([\d.]+) 降到 ([\d.]+)，平板从 ([\d.]+) 降到 ([\d.]+)；/.exec(l.expect)!
    same(e[1], base.rxWait('sta-2'), 'video before'); same(e[2], backupStopped.rxWait('sta-2'), 'video after')
    same(e[3], base.txWait('sta-3'), 'voice before'); same(e[4], backupStopped.txWait('sta-3'), 'voice after')
    same(e[5], base.rxWait('sta-4'), 'tablet before'); same(e[6], backupStopped.rxWait('sta-4'), 'tablet after')
    for (const id of ['sta-2', 'sta-4', 'sta-6']) expect(backupStopped.rxWait(id), id).toBeLessThan(1)
    for (const id of ['sta-3', 'sta-5']) expect(backupStopped.txWait(id), id).toBeLessThan(1)
    const g = /电视收到的都是大约 ([\d.]+) 兆字节，平板收到的都恰好是 ([\d,]+) 字节/.exec(l.expect)!
    for (const s of COLUMNS) {
      same(g[1], s.got('sta-2') / 1e6, 'the television’s bytes')
      expect(Number(g[2].replace(/,/g, ''))).toBe(s.got('sta-4'))
    }
  })

  it('lab 3: the second radio off', () => {
    const e = /从 ([\d.]+) 兆字节降到 ([\d.]+)，视频的等待从 ([\d.]+) ms 变成 ([\d.]+) ms/.exec(lab('关闭笔记本的第二台电台').expect)!
    same(e[1], base.upMb, 'backup before'); same(e[2], radioOff.upMb, 'backup after')
    same(e[3], base.rxWait('sta-2'), 'video before'); same(e[4], radioOff.rxWait('sta-2'), 'video after')
  })

  // 2026-11-11 (W7a), re-measured: the tablet's mean wait is one page of 63 MSDUs queued at once,
  // and after the engine change it went from 39.06 to 180.71 ms; the upgrade now saves about 3 %,
  // printed as a percentage rather than the 「约八分之一」 it was.
  // 2026-11-11 (W7b, the AP on dot11QAPEDCATable — AC_BE CWmax 63 — and per-frame UP): the tablet's
  // page now waits 4.36 ms on average, and the upgrade moves it by about 1 % (to 4.40 ms, slightly
  // worse), so the sentence says 「几乎不变（相差约 1%）」 and this reads the size of the change.
  it('lab 4: the tablet upgrade, about 1 per cent either way, and the two it groups', () => {
    const e = /备份仍然送达 ([\d.]+) 兆字节，平板的等待从 ([\d.]+) ms 变成 ([\d.]+) ms，几乎不变（相差约 (\d+)%）；.*都只编入电视与投影仪/.exec(lab('给平板换一台 Wi-Fi 6 电台').expect)!
    same(e[1], tabletNew.upMb, 'backup with the new tablet')
    same(e[2], base.rxWait('sta-4'), 'tablet before'); same(e[3], tabletNew.rxWait('sta-4'), 'tablet after')
    expect(Math.abs(Math.round(100 * (base.rxWait('sta-4') - tabletNew.rxWait('sta-4')) / base.rxWait('sta-4')))).toBe(Number(e[4]))
    const names = Object.fromEntries(capstoneTopology().nodes.map((n) => [n.id, n.label]))
    expect(members(base).map((id) => names[id])).toEqual(['电视', '投影仪'])
    // the AC split the meaning rests on
    const acs = new Set(base.rs.flatMap((x) => (x.type === 'ENQUEUE' && x.dst === 'sta-4' ? [x.ac] : [])))
    expect([...acs]).toEqual([1])
    expect(base.rs.filter((x): x is Tx => x.type === 'TX_START' && x.frame.dst === '*mu' && x.frame.kind === 'data').every((x) => x.frame.ac === 2)).toBe(true)
  })

  it('lab 5: the rubric repeats the figures it grades against', () => {
    const t = tableOf(lab('排序并提交'), '好的答案包含什么')
    const row = (k: string) => t.rows.find((r) => r[0] === k)![1]
    const b = /5 GHz 的 ([\d.]+)%、6 GHz 的 ([\d.]+)%，而传感器五秒里只发(.)帧/.exec(row('瓶颈是谁'))!
    same(b[1], base.air('sta-1'), 'rubric 5 GHz'); same(b[2], base.air('sta-1#6g'), 'rubric 6 GHz')
    expect(zh(b[3])).toBe(data(base.rs, 'sta-5').length)
    expect(base.upMb / radioOff.upMb).toBeGreaterThan(1.9)
    expect(Math.abs(Math.round(100 * (base.rxWait('sta-4') - tabletNew.rxWait('sta-4')) / base.rxWait('sta-4')))).toBe(Number(/几乎不变（相差约 (\d+)%）/.exec(row('那台平板'))![1]))
    // the order the lab expects: stopping frees most waiting, then the tablet (almost nothing), and
    // last the radio, which frees a NEGATIVE amount. 2026-11-11 (W7b): with the second radio off the
    // tablet's wait rises from 4.36 to 10.57 ms, so the radio and the tablet swapped places.
    const freed = (s: Scene) => ['sta-2', 'sta-4'].reduce((a, id) => a + base.rxWait(id) - s.rxWait(id), 0) + base.txWait('sta-3') - s.txWait('sta-3')
    expect(freed(backupStopped)).toBeGreaterThan(freed(tabletNew))
    expect(freed(tabletNew)).toBeGreaterThan(freed(radioOff))
    expect(freed(radioOff)).toBeLessThan(0)
  })
})
