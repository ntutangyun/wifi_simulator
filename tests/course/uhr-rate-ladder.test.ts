/**
 * `@uhr-rate-ladder`, in the standard-first shape (2026-11-11).
 *
 * ① is what the TGbn specification framework 11-24/0209r19 records for the four new rungs; ②
 * says what the engine does; ③ is four guided runs. Every figure the labs print is read back out
 * of the lesson and compared with a run of the scenes the lesson ships, and the ② rows that name
 * a number are checked against `PHY_MODES`.
 *
 * Three classes of claim: deterministic (levels, rungs, window widths, fixed-position goodput,
 * record counts — exact), derived (the fixed-position gain IS the N_DBPS ratio — asserted both
 * ways), faded (means over the twenty seeds below, never one run).
 */
import { describe, it, expect } from 'vitest'
import { uhrRateLadder as L } from '../../src/course/tier4/uhr-rate-ladder'
import { MODULES, TIERS, basisOf, citedDocs, teachesDraft, trackOf } from '../../src/course/curriculum'
import { LESSONS, lessonIndex } from '../../src/course/lessons'
import { uhrLadderScenario } from '../../src/course/wifiScenes'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { Simulation } from '../../src/engine/simulation'
import { NOISE_DBM, PHY_MODES, RATE_MARGIN_DB, UHR_SFD_MCS, mcsForRssi } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { GEN_FEATURES } from '../../src/model/caps'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite } from './kit'

const MS = 1_000_000
const LONG_NS = 600 * MS
const RUN_NS = 300 * MS

type Spot = 'desk' | 'near' | 'mid' | 'far'
type Fade = 'off' | 'shadow' | 'both'

const cache = new Map<string, TLRecord[]>()
const recs = (sc: Scenario, ns: number, key?: string): TLRecord[] => {
  if (key === undefined) return [...new Simulation(sc).runUntil(ns).records]
  const k = `${key}|${ns}`
  if (!cache.has(k)) cache.set(k, [...new Simulation(sc).runUntil(ns).records])
  return cache.get(k)!
}
const scene = (gen: 'eht' | 'uhr', spot: Spot, fade: Fade = 'off', seed?: number): Scenario =>
  uhrLadderScenario(gen, spot, fade, seed === undefined ? {} : { seed })
const arm = (gen: 'eht' | 'uhr', spot: Spot, fade: Fade, ns: number, seed?: number): TLRecord[] =>
  recs(scene(gen, spot, fade, seed), ns, `${gen}/${spot}/${fade}/${seed ?? '-'}`)

const dataTx = (rs: TLRecord[]) => rs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.frame.kind === 'data')
const rungsUsed = (rs: TLRecord[]): number[] => [...new Set(dataTx(rs).flatMap((r) => (r.frame.mcs === undefined ? [] : [r.frame.mcs])))].sort((a, b) => a - b)
const failures = (rs: TLRecord[]): number => rs.filter((r) => r.type === 'RX_FAIL').length

/** Goodput in Mb/s: each MSDU counted once, on the first PPDU that carried it successfully. */
function goodputMbps(rs: TLRecord[], ns: number): number {
  const seen = new Set<number>()
  let bytes = 0
  for (const r of rs) {
    if (r.type !== 'RX_OK' || r.frame.kind !== 'data') continue
    const ids = r.frame.ampdu?.msduIds ?? (r.frame.msduId === undefined ? [] : [r.frame.msduId])
    const sizes = r.frame.msduBytes ?? []
    ids.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); bytes += sizes[i] ?? 0 } })
  }
  return (bytes * 8) / (ns / 1e9) / 1e6
}

function rssiUp(spot: Spot): number {
  const sc = scene('eht', spot)
  return buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
}
const num = (cell: string): number => Number(cell.replace(/[−–]/g, '-').replace(/[^0-9.-]/g, ''))
const lab = (heading: string): Lab => {
  const l = L.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableIn = (blocks: Block[], fragment: string): Extract<Block, { kind: 'table' }> => {
  const t = blocks.find((b) => b.kind === 'table' && (b.heading ?? '').includes(fragment))
  expect(t, `table 「${fragment}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = L.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => L.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(L, { runNs: RUN_NS })

describe('uhr-rate-ladder · where it sits in the course', () => {
  it('opens tier 4, reads as a Wi-Fi lesson, declares the draft, and is standard-first', () => {
    expect(L.module).toBe(13)
    expect(MODULES[13].title).toBe('草案里的 Wi-Fi 8')
    expect(MODULES[13].tier).toBe(3)
    expect(trackOf(L)).toBe('wifi')
    expect(TIERS[3].label).toBe('第四阶段 · 研究')
    expect(basisOf(13)).toEqual(['ieee-802-11', 'p802-11bn'])
    expect(teachesDraft(13)).toBe(true)
    expect(citedDocs(L)).toEqual(['11-24/0209r19'])
    expect(isStandardFirst(L)).toBe(true)
    expect(L.limits).toEqual([]); expect(L.observe).toEqual([]); expect(L.tryThis).toEqual([])
  })

  it('names four prerequisites, all of them earlier', () => {
    expect(L.needs).toEqual(['mcs-ladder', 'rate', 'rate-fallback', 'fading'])
    for (const id of L.needs!) expect(lessonIndex(id), `@${id}`).toBeLessThan(lessonIndex('uhr-rate-ladder'))
    expect(LESSONS.filter((l) => l.module === 13).map((l) => l.id)[0]).toBe('uhr-rate-ladder')
  })
})

describe('uhr-rate-ladder · ① is the framework, and the engine agrees where ② says it does', () => {
  it('names the draft status, the five motions and the two published clauses', () => {
    const std = stdText()
    for (const c of ['11-24/0209r19', 'LB291', 'LB296', 'Motion #42', 'Motion #181', 'Motion #216', 'Motion #313', 'Motion #417',
      '§36.5.6', '表 36-76', '§36.3.21.2', '表 36-67', '§10.6.1']) expect(std, c).toContain(c)
    expect(std).toContain('尚未批准')
  })

  it('the sensitivity table: the four new rows are the engine\'s new rungs, the seven others are its EHT rungs', () => {
    const t = L.standard!.find((b) => b.kind === 'table') as Extract<Block, { kind: 'table' }>
    expect(t.rows).toHaveLength(11)
    const ehtByMod = new Map<string, number>()
    for (const [mcs, mod, rate, sens] of t.rows) {
      const draft = Number(mcs)
      if (draft >= 16) {
        const idx = Object.entries(UHR_SFD_MCS).find(([, v]) => v === draft)![0]
        expect(PHY_MODES.uhr.sensDbm[Number(idx)], `draft MCS ${draft}`).toBe(num(sens))
      } else {
        expect(PHY_MODES.eht.sensDbm[draft], `MCS ${draft} (${mod} ${rate})`).toBe(num(sens))
      }
      ehtByMod.set(`${mod} ${rate}`, draft)
    }
    expect(implRow('新档的灵敏度').kind).toBe('faithful')
    expect(implRow('新档的灵敏度').sim).toContain(`另外${['', '', '', '', '', '', '', '七'][t.rows.filter((r) => Number(r[0]) < 16).length]}档`)
  })

  it('the transmit constellation error in the steps is Motion #313\'s four values', () => {
    const steps = L.standard!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>
    expect(steps.items.join(' ')).toContain('−12、−18、−20、−29 dB')
  })
})

describe('uhr-rate-ladder · ② says what the engine does, and the engine does it', () => {
  it('not every row is faithful; the index and the optional rung are marked differs', () => {
    expect(L.implementation!.some((r) => r.kind !== 'faithful')).toBe(true)
    expect(implRow('十八档阶梯').kind).toBe('differs')
    expect(implRow('256-QAM 2/3 的必选资格').kind).toBe('differs')
  })

  it('eighteen rungs, interleaved, both sequences rising strictly; the new rungs sit at 2, 5, 7, 11', () => {
    const { sensDbm, ndbps } = PHY_MODES.uhr
    expect(sensDbm).toHaveLength(18)
    for (let i = 1; i < 18; i++) {
      expect(sensDbm[i]!).toBeGreaterThan(sensDbm[i - 1]!)
      expect(ndbps[i]!).toBeGreaterThan(ndbps[i - 1]!)
    }
    const fresh = Object.entries(UHR_SFD_MCS).filter(([, v]) => v >= 16).map(([k]) => Number(k)).sort((a, b) => a - b)
    expect(fresh).toEqual([2, 5, 7, 11])
    expect(implRow('十八档阶梯').sim).toContain(`引擎索引是 ${fresh.slice(0, 3).join('、')}、${fresh[3]}`)
    // 「同一个 7 在 eht 上是 64-QAM 5/6，在 uhr 上是 16-QAM 5/6」
    expect(PHY_MODES.eht.ndbps[7]).toBe(1170)
    expect(PHY_MODES.uhr.ndbps[7]).toBe(780)
  })

  it('the new N_DBPS figures are 234 × bits × rate, as ② says', () => {
    const nd = [2, 5, 7, 11].map((i) => PHY_MODES.uhr.ndbps[i]!)
    expect(nd).toEqual([234 * 2 * 2 / 3, 234 * 4 * 2 / 3, 234 * 4 * 5 / 6, 234 * 8 * 2 / 3])
    expect(implRow('新档的 N_DBPS').sim).toContain('312、624、780、1 248')
  })

  it('uhr reuses EHT\'s preamble and symbol time, and its feature set is EHT\'s', () => {
    expect(PHY_MODES.uhr.preambleNs).toBe(PHY_MODES.eht.preambleNs)
    expect(PHY_MODES.uhr.symNs).toBe(PHY_MODES.eht.symNs)
    expect(PHY_MODES.uhr.muExtraPreambleNs).toBe(PHY_MODES.eht.muExtraPreambleNs)
    expect(GEN_FEATURES.uhr).toEqual(GEN_FEATURES.eht)
  })

  it('the selection margin and the fading values the rows name', () => {
    expect(RATE_MARGIN_DB).toBe(3)
    expect(implRow('选档').sim).toContain(`减去 ${RATE_MARGIN_DB} dB`)
    const f = scene('uhr', 'mid', 'both', 2).fading!
    expect(f.shadowSigmaDb).toBe(4); expect(f.coherenceMs).toBe(100); expect(f.smallScale).toBe('rayleigh')
    expect(implRow('信道起伏').sim).toContain(`σ = ${f.shadowSigmaDb} dB、相干时间 ${f.coherenceMs} ms`)
  })
})

describe('uhr-rate-ladder · ③ every figure the labs print is the run', () => {
  it('lab 1: the four new rungs, cell by cell, and what the base scene and its twin select', () => {
    const l = lab('同一位置，两条阶梯各选哪一档')
    const t = tableIn(l.blocks!, '四个新档')
    expect(t.rows).toHaveLength(4)
    for (const row of t.rows) {
      const idx = num(row[0]!)
      expect(UHR_SFD_MCS[idx]).toBe(num(row[1]!))
      expect(PHY_MODES.uhr.sensDbm[idx]).toBe(num(row[3]!))
      expect(PHY_MODES.uhr.ndbps[idx]).toBe(num(row[4]!))
      const [, ehtIdx, ehtNd] = /^(\d+)（([\d ]+)）$/.exec(row[5]!)!
      expect(PHY_MODES.eht.ndbps[Number(ehtIdx)]).toBe(Number(ehtNd!.replaceAll(' ', '')))
      expect(PHY_MODES.eht.ndbps).not.toContain(PHY_MODES.uhr.ndbps[idx])
    }
    const u = arm('uhr', 'mid', 'off', LONG_NS); const e = arm('eht', 'mid', 'off', LONG_NS)
    expect(dataTx(u)[0].frame.mode).toBe('uhr'); expect(dataTx(e)[0].frame.mode).toBe('eht')
    expect(rungsUsed(u)).toEqual([7]); expect(rungsUsed(e)).toEqual([4])
    expect(l.expect).toContain(`uhr、MCS ${rungsUsed(u)[0]}`)
    expect(l.expect).toContain(`eht、MCS ${rungsUsed(e)[0]}`)
    expect(l.expect).toContain(`${goodputMbps(u, LONG_NS).toFixed(3)} 对 ${goodputMbps(e, LONG_NS).toFixed(3)} Mb/s`)
    expect(l.meaning).toContain(`草案的 MCS ${UHR_SFD_MCS[7]}`)
    // the widget is on the OLD ladder (tests/engine/uhr-ladder.test.ts), at the mid spot's SNR
    const w = l.blocks!.find((b) => b.kind === 'widget') as Extract<Block, { kind: 'widget' }>
    expect(w.params?.mode).toBe('eht')
    expect(w.params?.snrDb).toBe(Number((rssiUp('mid') - NOISE_DBM).toFixed(1)))
    expect(w.caption).toContain(`索引 ${mcsForRssi('eht', rssiUp('mid'), undefined, 20)}`)
  }, 300_000)

  it('lab 2: the four spots, level, distance, rungs and goodput; the ratio is the ladder\'s', () => {
    const l = lab('四个位置的定点实测')
    const t = tableIn(l.blocks!, '这个房间的四个位置')
    const spots: Spot[] = ['desk', 'near', 'mid', 'far']
    expect(t.rows).toHaveLength(4)
    const measured: number[] = []
    t.rows.forEach((row, i) => {
      const spot = spots[i]!
      const sc = scene('eht', spot)
      const sta = sc.nodes.find((n) => n.id === 'sta-1')!; const ap = sc.nodes[0]!
      const d = Math.hypot(sta.pos.x - ap.pos.x, sta.pos.y - ap.pos.y, (sta.pos.z ?? 1) - (ap.pos.z ?? 2))
      const [, dCell, rssiCell] = /^([\d.]+) m · ([−-]?[\d.]+) dBm$/.exec(row[1]!)!
      expect(Number(dCell)).toBe(Number(d.toFixed(2)))
      expect(num(rssiCell!)).toBe(Number(rssiUp(spot).toFixed(2)))
      const read = (cell: string, mode: 'eht' | 'uhr'): number => {
        const [, idx, nd] = /^(\d+)（([\d ]+)）$/.exec(cell)!
        expect(PHY_MODES[mode].ndbps[Number(idx)]).toBe(Number(nd!.replaceAll(' ', '')))
        return Number(idx)
      }
      const eI = read(row[2]!, 'eht'); const uI = read(row[3]!, 'uhr')
      const e = arm('eht', spot, 'off', LONG_NS); const u = arm('uhr', spot, 'off', LONG_NS)
      expect(rungsUsed(e)).toEqual([eI]); expect(rungsUsed(u)).toEqual([uI])
      expect(failures(e) + failures(u)).toBe(0)
      const [, from, to] = /^([\d.]+) → ([\d.]+) Mb\/s$/.exec(row[4]!)!
      expect(from).toBe(goodputMbps(e, LONG_NS).toFixed(3))
      expect(to).toBe(goodputMbps(u, LONG_NS).toFixed(3))
      if (spot !== 'desk') measured.push(goodputMbps(u, LONG_NS) / goodputMbps(e, LONG_NS))
    })
    const f = l.blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    expect(f.text).toContain(`实测吞吐比是 ${measured.map((x) => x.toFixed(4)).join('、')}`)
    for (const [a, b] of [[1248, 1170], [780, 702], [624, 468]]) expect(f.text).toContain(`${a} / ${b} = ${(a / b).toFixed(4)}`)
    // the faded table's 「定点」 column is this run too, and why prints the same three
    const fade = tableIn(lab('打开起伏之后').blocks!, '二十个种子')
    fade.rows.forEach((r, i) => {
      const pct = ((measured[i]! - 1) * 100).toFixed(2)
      expect(r[2]).toBe(`+${pct} %`)
      expect(L.why).toContain(`+${pct} %`)
    })
  }, 600_000)

  it('lab 2: the three windows are as wide on the floor as the lesson says', () => {
    const base = scene('eht', 'mid')
    const at = (x: number): number => {
      const nodes = base.nodes.map((n) => (n.id === 'sta-1' ? { ...n, pos: { ...n.pos, x } } : n))
      return buildLinkTable(nodes, base.walls).get('sta-1')!.get('ap')!
    }
    const spans = new Map<number, { from: number; to: number }>()
    for (let i = 0; i <= 218; i++) {
      const x = Math.round((5 + i * 0.05) * 100) / 100
      const r = at(x)
      const e = mcsForRssi('eht', r, undefined, 20); const u = mcsForRssi('uhr', r, undefined, 20)
      if (PHY_MODES.uhr.ndbps[u] === PHY_MODES.eht.ndbps[e]) continue
      const sfd = UHR_SFD_MCS[u]!
      const got = spans.get(sfd)
      if (got === undefined) spans.set(sfd, { from: x, to: x }); else got.to = x
    }
    const width = (sfd: number): string => (Math.round((spans.get(sfd)!.to - spans.get(sfd)!.from + 0.05) * 100) / 100).toFixed(2)
    expect([...spans.keys()].sort((a, b) => a - b)).toEqual([19, 20, 23])
    expect(lab('四个位置的定点实测').expect).toContain(`${width(23)}、${width(20)} 与 ${width(19)} 米宽`)
    expect(L.why).toContain(`${width(23)} 到 ${width(19)} 米宽`)
    for (const [spot, sfd] of [['near', 23], ['mid', 20], ['far', 19]] as const) {
      const x = scene('uhr', spot).nodes.find((n) => n.id === 'sta-1')!.pos.x
      expect(x).toBeGreaterThanOrEqual(spans.get(sfd)!.from); expect(x).toBeLessThanOrEqual(spans.get(sfd)!.to)
    }
    // the 「窗口宽」 column: the sensitivity gap between the new rung and the one below it
    const fade = tableIn(lab('打开起伏之后').blocks!, '二十个种子')
    fade.rows.forEach((r, i) => {
      const idx = [11, 7, 5][i]!
      expect(r[1]).toBe(`${PHY_MODES.uhr.sensDbm[idx + 1]! - PHY_MODES.uhr.sensDbm[idx]!} dB`)
    })
  })

  it('lab 3: on the desk the two arms are the same timeline but for two label fields', () => {
    const e = recs(scene('eht', 'desk'), RUN_NS); const u = recs(scene('uhr', 'desk'), RUN_NS)
    expect(u).toHaveLength(e.length)
    const differing = new Set<string>()
    for (let i = 0; i < e.length; i++) {
      const a = e[i] as unknown as Record<string, unknown>; const b = u[i] as unknown as Record<string, unknown>
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue
        if (k !== 'frame') { differing.add(k); continue }
        const fa = a.frame as Record<string, unknown>; const fb = b.frame as Record<string, unknown>
        for (const fk of new Set([...Object.keys(fa), ...Object.keys(fb)])) if (JSON.stringify(fa[fk]) !== JSON.stringify(fb[fk])) differing.add(`frame.${fk}`)
      }
    }
    expect([...differing].sort()).toEqual(['frame.mcs', 'frame.mode'])
    expect(lab('书房桌上两代相同').expect).toContain(`${e.length.toLocaleString('en-US').replace(/,/g, ' ')} 条记录`)
    expect(PHY_MODES.eht.ndbps[13]).toBe(PHY_MODES.uhr.ndbps[17])
  }, 300_000)

  const SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67]
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length
  function ab(spot: Spot, fade: Fade) {
    const E: number[] = []; const U: number[] = []
    let eFail = 0; let uFail = 0
    for (const seed of SEEDS) {
      const e = arm('eht', spot, fade, RUN_NS, seed); const u = arm('uhr', spot, fade, RUN_NS, seed)
      E.push(goodputMbps(e, RUN_NS)); U.push(goodputMbps(u, RUN_NS))
      eFail += failures(e); uFail += failures(u)
    }
    const per = E.map((e, i) => (U[i]! - e) / e)
    return { gain: mean(U) / mean(E), win: per.filter((p) => p > 0.0005).length, eFail, uFail }
  }

  it('lab 4: the twenty-seed table, cell by cell, and the finer ladder fails more in every cell', () => {
    const t = tableIn(lab('打开起伏之后').blocks!, '二十个种子')
    expect(t.head).toEqual(['位置', '窗口宽', '定点', '仅开启阴影', '阴影＋按帧瑞利'])
    const spots: Spot[] = ['near', 'mid', 'far']
    t.rows.forEach((row, i) => {
      for (const [col, fade] of [[3, 'shadow'], [4, 'both']] as const) {
        const [, pct, wins, outOf] = /([−+-]?[\d.]+)\s*%（(\d+)\/(\d+)）/.exec(row[col]!)!
        expect(Number(outOf)).toBe(SEEDS.length)
        const r = ab(spots[i]!, fade)
        expect(num(pct!), `${spots[i]} ${fade}`).toBe(Number(((r.gain - 1) * 100).toFixed(2)))
        expect(Number(wins), `${spots[i]} ${fade}`).toBe(r.win)
        expect(r.uFail, `${spots[i]} ${fade}`).toBeGreaterThan(r.eFail)
      }
    })
    const near = ab('near', 'shadow')
    expect(lab('打开起伏之后').expect).toContain(`${near.eFail} 对 ${near.uFail}`)
    expect(L.quiz[1].options[1]).toContain(`${near.eFail} 对 ${near.uFail}`)
    // why: 「+33.33 % 缩小到 +11.78 %」
    expect(L.why).toContain(`缩小到 ${t.rows[2]![4]!.split('（')[0]}`)
  }, 900_000)

  it('lab 4: what seed 2 shows on load', () => {
    const u = arm('uhr', 'mid', 'shadow', RUN_NS, 2); const e = arm('eht', 'mid', 'shadow', RUN_NS, 2)
    expect(L.variants![7].scenario()).toEqual(scene('uhr', 'mid', 'shadow', 2))
    const ex = lab('打开起伏之后').expect
    expect(ex).toContain(`四个 MCS（${rungsUsed(u).join('、')}）`)
    expect(rungsUsed(u)).toHaveLength(4)
    expect(ex).toContain(`两个（${rungsUsed(e).join('、')}）`)
    expect(rungsUsed(e)).toHaveLength(2)
    const gu = goodputMbps(u, RUN_NS); const ge = goodputMbps(e, RUN_NS)
    expect(ex).toContain(`${gu.toFixed(3)} 对 ${ge.toFixed(3)} Mb/s，高 ${((gu / ge - 1) * 100).toFixed(1)} %`)
  }, 300_000)
})
