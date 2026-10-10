/**
 * `@uhr-rate-ladder` — **every figure the lesson prints, measured against the lesson's own
 * shipped scenes.**
 *
 * The engine half of this slice (W12a) proved what the eighteen-rung ladder does on a bare
 * two-node line of its own making; nothing there touched a scene a reader can open. This file is
 * the other ruler: it reads `uhrLadderScenario` — the scenes the lesson actually ships — and
 * compares them against the prose cell by cell.
 *
 * ## Three classes of claim, and they are not checked the same way
 *
 *  1. **Deterministic.** Link levels, selected rungs, window widths on the floor, fixed-position
 *     goodput, record counts. Asserted exactly, and the printed table cells are read back out of
 *     the lesson and compared, so a figure cannot be corrected in one place only.
 *  2. **Derived.** The three fixed-position gains ARE the ratio of the two rungs' N_DBPS. That
 *     identity is the strongest form the lesson's claim can take and it is asserted both ways:
 *     the ratio is computed off `PHY_MODES` and the goodput is measured off a run.
 *  3. **Faded.** Means over the twenty seeds below, never one run. Every threshold here was
 *     chosen to survive a sweep to sixty seeds; the measured values at n = 20 and n = 60 are in
 *     the table in `describe` three, so the next person can see how much room each one has.
 *
 * ## Why no threshold here states a SIGN at the narrow windows
 *
 * W12a pinned a sign that was not there once already — the MCS23 window measured −2.43 % at 30
 * seeds, +1.9 % at 8 and −0.07 % at 120 — and this lesson's 「墙后一步」 spot is the same window.
 * So what is asserted there is a BOUND on the magnitude plus a bound on the share of seeds that
 * agree, which is what 「a coin flip」 means and is true at both seed counts. The two windows that
 * do pay get lower bounds, because their gains are far from zero.
 */
import { describe, it, expect } from 'vitest'
import { uhrRateLadder } from '../../src/course/tier4/uhr-rate-ladder'
import { MODULES, TIERS, basisOf, citedDocs, lessonMinutes, teachesDraft, trackOf } from '../../src/course/curriculum'
import { LESSONS, lessonIndex } from '../../src/course/lessons'
import { uhrLadderScenario } from '../../src/course/wifiScenes'
import { Simulation } from '../../src/engine/simulation'
import { PHY_MODES, UHR_SFD_MCS, mcsForRssi } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import type { Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
/** 600 ms for the fixed ratios, 300 ms for the faded means — the two lengths the prose names. */
const LONG_NS = 600 * MS
const RUN_NS = 300 * MS

type Spot = 'desk' | 'near' | 'mid' | 'far'
type Fade = 'off' | 'shadow' | 'both'

const recs = (sc: Scenario, ns: number): TLRecord[] => [...new Simulation(sc).runUntil(ns).records]
const scene = (gen: 'eht' | 'uhr', spot: Spot, fade: Fade = 'off', seed?: number): Scenario =>
  uhrLadderScenario(gen, spot, fade, seed === undefined ? {} : { seed })

const topRung = (rs: TLRecord[]): number => rs.reduce(
  (b, r) => (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mcs !== undefined ? Math.max(b, r.frame.mcs) : b), -1)
const rungsUsed = (rs: TLRecord[]): number[] => [...new Set(rs.flatMap(
  (r) => (r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.mcs !== undefined ? [r.frame.mcs] : [])))].sort((a, b) => a - b)
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

/** The uplink level the lesson prints: station to access point, off the link table itself. */
function rssiUp(spot: Spot): number {
  const sc = scene('eht', spot)
  return buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
}

const table = (heading: string): { head: string[]; rows: string[][] } => {
  const b = uhrRateLadder.numbers!.find((x) => x.kind === 'table' && x.heading?.includes(heading))
  if (b === undefined || b.kind !== 'table') throw new Error(`no table heading contains 「${heading}」`)
  return b
}
const num = (cell: string): number => Number(cell.replace(/[−–]/g, '-').replace(/[^0-9.-]/g, ''))

describe('uhr-rate-ladder · where it sits in the course', () => {
  it('opens tier 4 as its only module, reads as a Wi-Fi lesson, and declares the draft', () => {
    expect(uhrRateLadder.module).toBe(13)
    expect(MODULES[13].title).toBe('草案里的 Wi-Fi 8')
    expect(MODULES[13].tier).toBe(3)
    expect(MODULES.filter((m) => m.tier === 3)).toHaveLength(1)
    // The module declares nothing of its own, so the tier is the single place the draft is named
    // and the two cannot drift apart (tests/course/basis.test.ts owns that doctrine).
    expect(MODULES[13].basis).toBeUndefined()
    expect(trackOf(uhrRateLadder)).toBe('wifi')
    expect(TIERS[3].label).toBe('第四阶段 · 研究')
    expect(basisOf(13)).toEqual(['ieee-802-11', 'p802-11bn'])
    // **The amber line and 「草案，内容可能变动」 both hang off this one boolean**, and it reads the
    // DECLARED list rather than the citations — which is why `p802-11bn` is written out in TIERS.
    expect(teachesDraft(13)).toBe(true)
    expect(citedDocs(uhrRateLadder)).toEqual(['11-24/0209r19'])
    // and it really is the first Wi-Fi-track lesson in the course checked against a draft:
    // every earlier one that teaches a draft is on the AMP track or the UWB track.
    const earlierDrafts = LESSONS
      .filter((l) => lessonIndex(l.id) < lessonIndex('uhr-rate-ladder') && teachesDraft(l.module))
      .filter((l) => trackOf(l) === 'wifi')
    expect(earlierDrafts.map((l) => l.id)).toEqual([])
  })

  it('names four prerequisites, all of them earlier, and states 25 minutes', () => {
    expect(uhrRateLadder.needs).toEqual(['mcs-ladder', 'rate', 'rate-fallback', 'fading'])
    const mine = lessonIndex('uhr-rate-ladder')
    for (const id of uhrRateLadder.needs!) {
      expect(lessonIndex(id), `@${id} must come before`).toBeGreaterThanOrEqual(0)
      expect(lessonIndex(id), `@${id} must come before`).toBeLessThan(mine)
    }
    expect(lessonMinutes(uhrRateLadder)).toBe(25)
  })

  it('every jump target it offers is found in its own scene', () => {
    const rs = recs(uhrRateLadder.scenario(), RUN_NS)
    for (const j of uhrRateLadder.jumps) {
      expect(rs.some(j.find), `@uhr-rate-ladder → ${j.label}`).toBe(true)
    }
    // the `watch` block points at the jump the prose tells the reader to take
    const watch = uhrRateLadder.picture!.find((b) => b.kind === 'watch')!
    expect(watch.kind === 'watch' && watch.jump).toBe(0)
    expect(uhrRateLadder.jumps[0]!.label).toBe('第一帧数据')
    // and the `watch` is inside the first three blocks, which the contract suite also checks
    expect(uhrRateLadder.picture!.indexOf(watch)).toBeLessThan(3)
  })
})

describe('uhr-rate-ladder · the ladder table is read off the engine, cell by cell', () => {
  /** The four new rungs, as the lesson's first table prints them. */
  it('prints the engine index, the draft number, the sensitivity and the N_DBPS of each new rung', () => {
    const t = table('四个新档')
    expect(t.head).toEqual(['引擎索引', '草案档号', '星座与码率', '灵敏度', 'N_DBPS', '顶掉的档'])
    expect(t.rows).toHaveLength(4)
    for (const row of t.rows) {
      const idx = num(row[0]!)
      expect(UHR_SFD_MCS[idx], `engine index ${idx} → the draft's own number`).toBe(num(row[1]!))
      expect(PHY_MODES.uhr.sensDbm[idx], `index ${idx} sensitivity`).toBe(num(row[3]!))
      expect(PHY_MODES.uhr.ndbps[idx], `index ${idx} N_DBPS`).toBe(num(row[4]!))
      // the rung it displaces: an `eht` index, with the N_DBPS the cell also prints
      const [, ehtIdx, ehtNdbps] = /^(\d+)（([\d ]+)）$/.exec(row[5]!)!
      expect(PHY_MODES.eht.ndbps[Number(ehtIdx)], `displaced eht index ${ehtIdx}`)
        .toBe(Number(ehtNdbps!.replaceAll(' ', '')))
      // and it really is a rung `eht` does not have at all, which is the whole claim
      expect(PHY_MODES.eht.ndbps).not.toContain(PHY_MODES.uhr.ndbps[idx])
    }
  })

  it('the interleave is what makes it safe: both sequences rise strictly, all eighteen rungs', () => {
    // The lesson says this in two places (the picture and the `deeper`), and it is the reason
    // the four rungs could not be appended. Checked over the whole ladder, not just the new four.
    const { sensDbm, ndbps } = PHY_MODES.uhr
    expect(sensDbm).toHaveLength(18)
    for (let i = 1; i < 18; i++) {
      expect(sensDbm[i]!, `sensitivity at idx ${i}`).toBeGreaterThan(sensDbm[i - 1]!)
      expect(ndbps[i]!, `N_DBPS at idx ${i}`).toBeGreaterThan(ndbps[i - 1]!)
    }
    // and the counter-factual the `deeper` names: appended instead of interleaved, the top index
    // would carry 256-QAM 2/3 at 1 248 against the 2 340 the real top rung carries — 「慢将近一半」.
    expect(1248 / 2340).toBeLessThan(0.55)
    expect(1248 / 2340).toBeGreaterThan(0.5)
  })

  it('4096-QAM is the top two rungs of each ladder, which is what the `deeper` says', () => {
    expect(PHY_MODES.eht.qam4kFromMcs).toBe(12)
    expect(PHY_MODES.uhr.qam4kFromMcs).toBe(16)
    for (const m of ['eht', 'uhr'] as const) {
      expect(PHY_MODES[m].qam4kFromMcs).toBe(PHY_MODES[m].ndbps.length - 2)
    }
  })
})

describe('uhr-rate-ladder · the four spots, and the windows they sit in', () => {
  it('the printed level, distance and selected rungs at each spot', () => {
    const t = table('这间房的四个位置')
    expect(t.rows).toHaveLength(4)
    const spots: Spot[] = ['desk', 'near', 'mid', 'far']
    t.rows.forEach((row, i) => {
      const spot = spots[i]!
      const sc = scene('eht', spot)
      const sta = sc.nodes.find((n) => n.id === 'sta-1')!, ap = sc.nodes[0]!
      const d = Math.hypot(sta.pos.x - ap.pos.x, sta.pos.y - ap.pos.y, (sta.pos.z ?? 1) - (ap.pos.z ?? 2))
      const [, dCell, rssiCell] = /^([\d.]+) m · ([−-]?[\d.]+) dBm$/.exec(row[1]!)!
      expect(Number(dCell), `${spot}: printed distance`).toBeCloseTo(d, 2)
      expect(num(rssiCell!), `${spot}: printed level`).toBeCloseTo(rssiUp(spot), 2)
      // the two selected rungs, each with the N_DBPS the cell prints beside it
      const read = (cell: string, mode: 'eht' | 'uhr'): number => {
        const [, idx, nd] = /^(\d+)（([\d ]+)）$/.exec(cell)!
        expect(PHY_MODES[mode].ndbps[Number(idx)]).toBe(Number(nd!.replaceAll(' ', '')))
        return Number(idx)
      }
      const e = read(row[2]!, 'eht'), u = read(row[3]!, 'uhr')
      expect(mcsForRssi('eht', rssiUp(spot), undefined, 20), `${spot}: eht ceiling`).toBe(e)
      expect(mcsForRssi('uhr', rssiUp(spot), undefined, 20), `${spot}: uhr ceiling`).toBe(u)
    })
  })

  /**
   * **The windows, in metres on the floor.** Swept at 5 cm from x = 5 to x = 15.9 off
   * `mcsForRssi` and the link table — no simulation needed, because a window is a property of
   * the level and the ladder. The lesson prints 0.25 / 1.45 / 0.60 m and says a reader can step
   * out of one; these are those three.
   */
  it('each window is as wide on the floor as the lesson says, and the lesson says three widths', () => {
    const base = scene('eht', 'mid')
    const ap = base.nodes[0]!
    const at = (x: number): number => {
      const nodes = base.nodes.map((n) => (n.id === 'sta-1' ? { ...n, pos: { ...n.pos, x } } : n))
      return buildLinkTable(nodes, base.walls).get('sta-1')!.get('ap')!
    }
    const spans = new Map<number, { from: number; to: number }>()
    for (let i = 0; i <= 218; i++) {
      const x = Math.round((5 + i * 0.05) * 100) / 100
      const r = at(x)
      const e = mcsForRssi('eht', r, undefined, 20), u = mcsForRssi('uhr', r, undefined, 20)
      if (PHY_MODES.uhr.ndbps[u] === PHY_MODES.eht.ndbps[e]) continue
      const sfd = UHR_SFD_MCS[u]!
      const got = spans.get(sfd)
      if (got === undefined) spans.set(sfd, { from: x, to: x })
      else got.to = x
    }
    const width = (sfd: number): number => {
      const s = spans.get(sfd)!
      return Math.round((s.to - s.from + 0.05) * 100) / 100
    }
    expect([...spans.keys()].sort((a, b) => a - b), 'the windows reachable in this flat')
      .toEqual([19, 20, 23])
    expect(width(23), 'SFD MCS23, the narrow top window').toBeCloseTo(0.25, 2)
    expect(width(20), 'SFD MCS20, the only 3 dB rung').toBeCloseTo(1.45, 2)
    expect(width(19), 'SFD MCS19, 1 dB at nearly eight metres').toBeCloseTo(0.60, 2)
    // and the three spots the lesson parks the laptop at are each INSIDE their window
    for (const [spot, sfd] of [['near', 23], ['mid', 20], ['far', 19]] as const) {
      const x = scene('uhr', spot).nodes.find((n) => n.id === 'sta-1')!.pos.x
      const s = spans.get(sfd)!
      expect(x, `${spot} sits inside the SFD MCS${sfd} window [${s.from}, ${s.to}]`)
        .toBeGreaterThanOrEqual(s.from)
      expect(x).toBeLessThanOrEqual(s.to)
    }
    // a 1 dB window is wider further out purely because the path-loss exponent is 3: the lesson
    // says 「1 分贝在三米处是 0.25 米，在八米处是 0.60 米」, and that ratio is the geometry.
    const far = scene('uhr', 'far').nodes.find((n) => n.id === 'sta-1')!.pos.x - ap.pos.x
    const near = scene('uhr', 'near').nodes.find((n) => n.id === 'sta-1')!.pos.x - ap.pos.x
    expect(width(19) / width(23)).toBeCloseTo(far / near, 1)
  })
})

describe('uhr-rate-ladder · at a fixed position the gain IS the N_DBPS ratio', () => {
  it('window for window, to four places, and the printed goodput figures are those runs', () => {
    const t = table('这间房的四个位置')
    const spots: Spot[] = ['desk', 'near', 'mid', 'far']
    t.rows.forEach((row, i) => {
      const spot = spots[i]!
      const e = recs(scene('eht', spot), LONG_NS)
      const u = recs(scene('uhr', spot), LONG_NS)
      const ge = goodputMbps(e, LONG_NS), gu = goodputMbps(u, LONG_NS)
      const [, from, to] = /^([\d.]+) → ([\d.]+) Mb\/s$/.exec(row[4]!)!
      expect(Number(from), `${spot}: printed Wi-Fi 7 goodput`).toBeCloseTo(ge, 3)
      expect(Number(to), `${spot}: printed Wi-Fi 8 goodput`).toBeCloseTo(gu, 3)
      const ratio = PHY_MODES.uhr.ndbps[topRung(u)]! / PHY_MODES.eht.ndbps[topRung(e)]!
      expect(gu / ge, `${spot}: the measured ratio is the ladder's own`).toBeCloseTo(ratio, 2)
      // The per cent itself is printed once, in the faded table's 「定点」 column — this table
      // dropped its 「差」 column when the six columns stopped fitting a 470 px viewport. Read it
      // back from there for the three spots that have a window.
      if (spot !== 'desk') {
        const fadeRow = table('打开起伏之后').rows.find((r) => r[0] === row[0])!
        expect(num(fadeRow[2]!), `${spot}: the per cent printed in the faded table`)
          .toBeCloseTo((ratio - 1) * 100, 1)
      } else {
        expect(ratio, 'the desk is the zero and has no row in the faded table').toBe(1)
      }
      // no fading section, so nothing in either arm ever leaves its one rung
      expect(rungsUsed(e), `${spot}: eht rungs`).toHaveLength(1)
      expect(rungsUsed(u), `${spot}: uhr rungs`).toHaveLength(1)
      expect(failures(e) + failures(u), `${spot}: nothing fails at a fixed position`).toBe(0)
    })
  }, 300_000)

  it('the three ratios the `formula` block prints are the ladder arithmetic', () => {
    const f = uhrRateLadder.numbers!.find((b) => b.kind === 'formula')!
    expect(f.kind === 'formula' && f.text).toContain('1248 / 1170 = 1.0667')
    expect(f.kind === 'formula' && f.text).toContain('780 / 702 = 1.1111')
    expect(f.kind === 'formula' && f.text).toContain('624 / 468 = 1.3333')
    expect(1248 / 1170).toBeCloseTo(1.0667, 4)
    expect(780 / 702).toBeCloseTo(1.1111, 4)
    expect(624 / 468).toBeCloseTo(1.3333, 4)
    // and the reason the comparison isolates the ladder: uhr's three airtime constants ARE eht's
    expect(PHY_MODES.uhr.preambleNs).toBe(PHY_MODES.eht.preambleNs)
    expect(PHY_MODES.uhr.symNs).toBe(PHY_MODES.eht.symNs)
    expect(PHY_MODES.uhr.muExtraPreambleNs).toBe(PHY_MODES.eht.muExtraPreambleNs)
  })

  it('the seed is irrelevant without a fading section, so one seed is not a one-seed A/B', () => {
    const at = (seed: number): number =>
      goodputMbps(recs(scene('uhr', 'mid', 'off', seed), RUN_NS), RUN_NS)
      / goodputMbps(recs(scene('eht', 'mid', 'off', seed), RUN_NS), RUN_NS)
    const all = [1, 2, 17, 97].map(at)
    for (const r of all) expect(r).toBeCloseTo(all[0]!, 9)
  }, 300_000)

  /**
   * **The counterweight, and the lesson leans on it twice** (the last picture block and the
   * second thing to observe): on the study desk a Wi-Fi 8 radio is a renamed Wi-Fi 7 radio.
   *
   * Asserted the strong way rather than by comparing throughput: every record, field by field.
   * Exactly two fields in the whole stream ever differ — `frame.mode` and `frame.mcs` — and both
   * are labels. `docs/inert-config-contract.md` step 4 asks for a legal-and-inert configuration
   * to be shown to be inert from the still-legal side; this is that spot, stated to the reader
   * instead of hidden.
   */
  it('on the desk the two arms are the same timeline but for two label fields', () => {
    const e = recs(scene('eht', 'desk'), RUN_NS)
    const u = recs(scene('uhr', 'desk'), RUN_NS)
    expect(e).toHaveLength(20_122)
    expect(u).toHaveLength(e.length)
    const differing = new Set<string>()
    for (let i = 0; i < e.length; i++) {
      const a = e[i] as unknown as Record<string, unknown>, b = u[i] as unknown as Record<string, unknown>
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue
        if (k !== 'frame') { differing.add(k); continue }
        const fa = a.frame as Record<string, unknown>, fb = b.frame as Record<string, unknown>
        for (const fk of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
          if (JSON.stringify(fa[fk]) !== JSON.stringify(fb[fk])) differing.add(`frame.${fk}`)
        }
      }
    }
    expect([...differing].sort()).toEqual(['frame.mcs', 'frame.mode'])
    // and the two labels name the same modulation: the top rung of each ladder, 4096-QAM 5/6
    expect(PHY_MODES.eht.ndbps[13]).toBe(PHY_MODES.uhr.ndbps[17])
    expect(PHY_MODES.eht.ndbps[13]).toBe(2340)
    // the figure the prose spells out in Chinese characters, so it cannot drift from the run
    for (const text of [uhrRateLadder.picture!.at(-1)!.kind === undefined
      ? (uhrRateLadder.picture!.at(-1) as { text: string }).text : '', uhrRateLadder.observe[1]!]) {
      expect(text, 'the record count the prose names').toContain('两万零一百二十二')
    }
  }, 300_000)
})

/**
 * ## The faded half, and how much room each threshold has
 *
 * Measured 2026-10-10 over the lesson's own scenes — mean goodput of `uhr` over `eht`, and the
 * share of seeds where `uhr` is ahead, at n = 20 (the list below) and n = 60:
 *
 * | spot (window) | fixed | shadow σ4 · n=20 / 60 | σ4 + Rayleigh · n=20 / 60 |
 * | --- | --- | --- | --- |
 * | 墙后一步 (SFD MCS23, 1 dB) | +6.71 % | −0.04 % (8/20) / +2.10 % (36/60) | −0.03 % (10/20) / −1.60 % (26/60) |
 * | 客厅中段 (SFD MCS20, 3 dB) | +11.11 % | +8.18 % (19/20) / +9.19 % (59/60) | +6.73 % (15/20) / +7.84 % (44/60) |
 * | 客厅深处 (SFD MCS19, 1 dB) | +33.33 % | +20.12 % (19/20) / +24.05 % (57/60) | +11.78 % (14/20) / +7.40 % (43/60) |
 *
 * So: the 3 dB window pays under both layers and nineteen or more seeds in twenty agree; the
 * biggest paper gain keeps under half of itself; and the narrow top window keeps nothing at all
 * and cannot even be given a sign.
 */
describe('uhr-rate-ladder · what the rungs are worth once the level wanders', () => {
  const SEEDS = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67]
  const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length

  function ab(spot: Spot, fade: Fade): {
    gain: number; win: number; eFail: number; uFail: number; eRungs: number; uRungs: number
  } {
    const E: number[] = [], U: number[] = []
    let eFail = 0, uFail = 0, eRungs = 0, uRungs = 0
    for (const seed of SEEDS) {
      const e = recs(scene('eht', spot, fade, seed), RUN_NS)
      const u = recs(scene('uhr', spot, fade, seed), RUN_NS)
      E.push(goodputMbps(e, RUN_NS)); U.push(goodputMbps(u, RUN_NS))
      eFail += failures(e); uFail += failures(u)
      eRungs = Math.max(eRungs, rungsUsed(e).length); uRungs = Math.max(uRungs, rungsUsed(u).length)
    }
    const per = E.map((e, i) => (U[i]! - e) / e)
    return {
      gain: mean(U) / mean(E),
      win: per.filter((p) => p > 0.0005).length / per.length,
      eFail, uFail, eRungs, uRungs,
    }
  }

  it('the printed per cents and seed counts are those twenty runs', () => {
    const t = table('打开起伏之后')
    expect(t.head).toEqual(['位置', '窗口宽', '定点', '只开阴影', '阴影＋按帧瑞利'])
    expect(t.rows).toHaveLength(3)
    const spots: Spot[] = ['near', 'mid', 'far']
    t.rows.forEach((row, i) => {
      const spot = spots[i]!
      for (const [col, fade] of [[3, 'shadow'], [4, 'both']] as const) {
        const [, pct, wins, outOf] = /([−-]?[\d.]+)\s*%（(\d+)\/(\d+)）/.exec(row[col]!)!
        expect(Number(outOf), 'the lesson says twenty seeds').toBe(SEEDS.length)
        const r = ab(spot, fade)
        expect(num(pct!), `${spot} ${fade}: printed per cent`).toBeCloseTo((r.gain - 1) * 100, 1)
        expect(Number(wins), `${spot} ${fade}: printed seed count`).toBe(Math.round(r.win * SEEDS.length))
        // the mechanism, read off both arms rather than argued: the finer ladder fails more
        expect(r.uFail, `${spot} ${fade}: uhr RX_FAIL`).toBeGreaterThan(r.eFail)
        // and it visits more rungs in the same walk, which is what 「踩到的档更多」 means
        expect(r.uRungs, `${spot} ${fade}: uhr rungs`).toBeGreaterThan(r.eRungs)
      }
    })
  }, 900_000)

  it('the 3 dB window keeps a readable gain under both layers; the narrow top one keeps none', () => {
    // Bounds, not the measured values: each survives n = 8…60. See the table above for the room.
    const mid = ab('mid', 'both')
    expect(mid.gain, 'measured +6.73 % at n=20, +7.84 % at n=60').toBeGreaterThan(1.02)
    expect(mid.win, 'and most seeds agree').toBeGreaterThan(0.6)

    const near = ab('near', 'both')
    // **No sign is asserted here and the docblock says why.** A bound on the magnitude plus a
    // bound on the agreement is what 「a coin flip」 is, and both hold at n = 20 and n = 60.
    expect(Math.abs(near.gain - 1), 'measured −0.03 % at n=20, −1.60 % at n=60').toBeLessThan(0.05)
    expect(near.win, 'a coin flip: 10/20 and 26/60').toBeLessThan(0.65)
    // the same window with the SLOW layer alone is already worth nothing, which is this flat's
    // own result and sharper than the bare line W12a measured (+2.1 % there)
    const nearShadow = ab('near', 'shadow')
    expect(Math.abs(nearShadow.gain - 1), 'measured −0.04 % at n=20, +2.10 % at n=60').toBeLessThan(0.05)
    expect(nearShadow.win).toBeLessThan(0.65)
  }, 900_000)

  it('the biggest paper gain keeps under half of itself once the fast layer is on', () => {
    // Deliberately RELATIVE, because the comparison the derived window table invites is the one
    // it gets wrong. 624/468 − 1 = 33.33 %; measured +11.78 % at n=20 and +7.40 % at n=60.
    const paper = 624 / 468 - 1
    const far = ab('far', 'both')
    expect(far.gain - 1, `against a derived ${(paper * 100).toFixed(2)} %`).toBeLessThan(paper / 2)
    expect(far.gain, 'and it does still pay something').toBeGreaterThan(1.02)
    // with the slow layer alone it keeps most of the table figure, which is the other half of
    // the lesson's sentence and the reason it is a trade rather than a flat no
    const farShadow = ab('far', 'shadow')
    expect(farShadow.gain - 1, 'measured +20.12 % at n=20, +24.05 % at n=60').toBeGreaterThan(0.15)
    expect(farShadow.win, 'nineteen seeds in twenty').toBeGreaterThan(0.9)
  }, 900_000)

  /**
   * **The printed means are a function of the seed LIST and not only of its length, and after
   * W12c the lesson says so with numbers instead of a reassurance.**
   *
   * It used to end that paragraph with 「阈值又在六十个种子上复核过」, which is true of the
   * thresholds in this file and reads, to somebody looking at the table, as 「the figures held up
   * at sixty」. They did not. Measured on the lesson's own scenes:
   *
   * ```
   *   spot / layers        n=20 (printed)   60 = 1 + 59 primes   60 = 1…60        120 = 1 + 119 primes
   *   墙后一步 / shadow      −0.04 % (8/20)   +2.10 % (36/60)      +1.77 % (31/60)  +1.97 % (67/120)
   *   墙后一步 / both        −0.03 % (10/20)  −1.60 % (26/60)      −0.74 % (24/60)  −1.60 % (51/120)
   *   客厅中段 / shadow      +8.18 % (19/20)  +9.19 % (59/60)      +8.19 % (57/60)  +9.43 % (118/120)
   *   客厅中段 / both        +6.73 % (15/20)  +7.84 % (44/60)      +7.20 % (45/60)  +7.88 % (95/120)
   *   客厅深处 / shadow     +20.12 % (19/20)  +24.05 % (57/60)     +23.57 % (59/60) +23.46 % (115/120)
   *   客厅深处 / both       +11.78 % (14/20)  +7.40 % (43/60)      +8.65 % (46/60)  +6.60 % (81/120)
   * ```
   *
   * **Two things in that table are worth more than the individual numbers.** First: the printed
   * +11.78 % at 客厅深处 is the HIGHEST of the four samples — the three larger ones land between
   * +6.6 % and +8.7 % — so it is the one printed figure a reader would most over-read. Second:
   * the two different sixties disagree with each other (+7.40 against +8.65, +2.10 against
   * +1.77), so 「n = 60」 is not one quantity. W12b's report quoted only the prime list's column,
   * which is why the disagreement had not been seen.
   *
   * **Why the cells still print n = 20 rather than a range.** They are what a reader reproduces:
   * the two faded variants the lesson ships run seed 2, the `tryThis` runs seed 17, and the
   * twenty are the batch the test above compares cell by cell. A range in the cell would be a
   * figure nobody can check from the page. So the point values stay and the prose carries the
   * spread — which is the 「print the instrument in the same cell」 rule paid with words rather
   * than with table cells, the `all.length` budget being the tighter of the two.
   */
  it('the three larger-sample figures the prose quotes are measured, and the two sixties disagree', () => {
    const primes = (n: number): number[] => {
      const out: number[] = []
      for (let k = 2; out.length < n; k++) if (out.every((p) => k % p !== 0)) out.push(k)
      return out
    }
    /** The lesson's twenty are 1 plus the first nineteen primes, so this is their continuation. */
    const PRIME60 = [1, ...primes(59)]
    const INT60 = Array.from({ length: 60 }, (_, i) => i + 1)
    expect(SEEDS, 'the twenty really are the head of the prime list').toEqual(PRIME60.slice(0, 20))
    expect(PRIME60).not.toEqual(INT60)

    const gainOver = (spot: Spot, fade: Fade, seeds: number[]): number => {
      const E: number[] = [], U: number[] = []
      for (const seed of seeds) {
        E.push(goodputMbps(recs(scene('eht', spot, fade, seed), RUN_NS), RUN_NS))
        U.push(goodputMbps(recs(scene('uhr', spot, fade, seed), RUN_NS), RUN_NS))
      }
      const m = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length
      return (m(U) / m(E) - 1) * 100
    }

    // read the two sixty-seed figures back out of the prose rather than restating them here
    const spread = uhrRateLadder.numbers!.find((b) => b.heading === '为什么这两列都不能只跑一次')!
    const quoted = /两批不同的六十个给出 \+([\d.]+) % 与 \+([\d.]+) %/.exec((spread as { text: string }).text)
    expect(quoted, 'the prose no longer names two sixty-seed figures').not.toBeNull()
    const farPrime = gainOver('far', 'both', PRIME60)
    const farInt = gainOver('far', 'both', INT60)
    expect(Number(quoted![1]), '客厅深处, 1 + 59 primes').toBeCloseTo(farPrime, 1)
    expect(Number(quoted![2]), '客厅深处, seeds 1…60').toBeCloseTo(farInt, 1)
    // the claim the sentence makes about them: both under the printed cell, and not equal to
    // each other — which is the whole reason the paragraph exists
    const printed = num(table('打开起伏之后').rows[2]![4]!)
    expect(farPrime, 'under the printed n=20 cell').toBeLessThan(printed)
    expect(farInt, 'so is the other sixty').toBeLessThan(printed)
    expect(Math.abs(farPrime - farInt), 'two sixties that agreed would make the paragraph false')
      .toBeGreaterThan(0.5)

    // and the near row's own sentence: the zero there cannot even be given a sign
    const zero = uhrRateLadder.numbers!.find((b) => b.heading === '这张表里最该读的是第一行那个零')!
    const near = /换六十个种子它是 \+([\d.]+) %/.exec((zero as { text: string }).text)
    expect(near, 'the near row no longer claims a direction').not.toBeNull()
    const nearPrime = gainOver('near', 'shadow', PRIME60)
    expect(Number(near![1]), '墙后一步 only-shadow, 1 + 59 primes').toBeCloseTo(nearPrime, 1)
    // the sign flip is the point: the printed cell is negative and this one is positive
    expect(Math.sign(num(table('打开起伏之后').rows[0]![3]!)), 'printed cell is negative').toBe(-1)
    expect(Math.sign(nearPrime), 'and the larger sample is positive').toBe(1)
    // while both are still a nothing, which is what the lesson actually claims there
    expect(Math.abs(nearPrime), 'and both are still worth nothing').toBeLessThan(5)
  }, 900_000)

  /**
   * The two runs a reader can actually do, which is what `observe` and `tryThis` promise. Seeds
   * 2 and 17 at the same spot with the same ladders: one wins 6.9 % and the other loses 9.7 %.
   * Exact, because these are single named runs rather than means.
   */
  it('the two named single runs behind `observe` and `tryThis`', () => {
    const read = (seed: number): { e: number; u: number; eR: number[]; uR: number[]; eF: number; uF: number } => {
      const e = recs(scene('eht', 'mid', 'shadow', seed), RUN_NS)
      const u = recs(scene('uhr', 'mid', 'shadow', seed), RUN_NS)
      return {
        e: goodputMbps(e, RUN_NS), u: goodputMbps(u, RUN_NS),
        eR: rungsUsed(e), uR: rungsUsed(u), eF: failures(e), uF: failures(u),
      }
    }
    // seed 2 is what the two faded variants ship, so this is what a reader sees on load
    const two = read(2)
    expect(two.uR, 'the third thing to observe: four rungs').toEqual([4, 5, 6, 7])
    expect(two.eR, 'against two').toEqual([3, 4])
    expect(two.u, '39.76 Mb/s').toBeCloseTo(39.76, 2)
    expect(two.e, '37.20 Mb/s').toBeCloseTo(37.20, 2)
    expect((two.u / two.e - 1) * 100, 'the +6.9 % the lesson names twice').toBeCloseTo(6.9, 1)
    expect(uhrRateLadder.observe[2]!).toContain('6.9 %')
    // seed 17 is the experiment, and it goes the other way
    const seventeen = read(17)
    expect(seventeen.u, '32.72 Mb/s').toBeCloseTo(32.72, 2)
    expect(seventeen.e, '36.24 Mb/s, unchanged from seed 2').toBeCloseTo(36.24, 2)
    expect((seventeen.u / seventeen.e - 1) * 100, 'the −9.7 % the experiment finds').toBeCloseTo(-9.7, 1)
    expect(seventeen.uF, 'eighteen failures against eight').toBe(18)
    expect(seventeen.eF).toBe(8)
    for (const needle of ['39.76', '32.72', '36.24', '9.7 %', '18 对 8']) {
      expect(uhrRateLadder.tryThis[0]!, needle).toContain(needle)
    }
    // Anti-vacuity for the whole faded half: one seed really could have said either thing.
    expect(Math.sign(two.u - two.e)).not.toBe(Math.sign(seventeen.u - seventeen.e))
  }, 300_000)

  /**
   * **The second experiment, which is the window closing.** The lesson tells the reader to push
   * the laptop 0.75 m further out and watch the difference go to zero, then pull it back to 6.0 m
   * and watch it return. Both ends are asserted, because an experiment whose promised outcome is
   * not the real one is worse than no experiment.
   */
  it('pushing the laptop 1.0 m past the window closes it, and 6.0 m reopens it', () => {
    const base = scene('uhr', 'mid')
    const move = (gen: 'eht' | 'uhr', x: number): Scenario => ({
      ...scene(gen, 'mid'),
      nodes: scene(gen, 'mid').nodes.map((n) => (n.id === 'sta-1' ? { ...n, pos: { ...n.pos, x } } : n)),
    })
    const apX = base.nodes[0]!.pos.x
    expect(base.nodes.find((n) => n.id === 'sta-1')!.pos.x - apX, 'the spot is six metres out').toBe(6)
    const rung = (sc: Scenario): number => {
      const r = buildLinkTable(sc.nodes, sc.walls).get('sta-1')!.get('ap')!
      return mcsForRssi(sc.nodes[1]!.caps.generation === 'uhr' ? 'uhr' : 'eht', r, undefined, 20)
    }
    // **The lesson's first draft of this experiment said 0.75 m and it did not work**: the
    // MCS20 window runs to 6.85 m from the router, so a laptop pushed to 6.75 m is still inside
    // it and the promised zero never arrives. 1.0 m does, and the edge itself is 6.90 m — which
    // the prose now also names, so a reader who stops at 6.85 m is not left wondering.
    const outU = rung(move('uhr', apX + 7)), outE = rung(move('eht', apX + 7))
    expect(PHY_MODES.uhr.ndbps[outU], 'at 7.0 m the two ladders agree').toBe(PHY_MODES.eht.ndbps[outE])
    expect(PHY_MODES.uhr.ndbps[outU], 'and they agree at 702, which the prose prints').toBe(702)
    // the edge, to 5 cm: inside at 6.85 and out at 6.90
    expect(PHY_MODES.uhr.ndbps[rung(move('uhr', apX + 6.85))]).not
      .toBe(PHY_MODES.eht.ndbps[rung(move('eht', apX + 6.85))])
    expect(PHY_MODES.uhr.ndbps[rung(move('uhr', apX + 6.9))])
      .toBe(PHY_MODES.eht.ndbps[rung(move('eht', apX + 6.9))])
    // back at 6.0 m the difference is there again
    const inU = rung(move('uhr', apX + 6)), inE = rung(move('eht', apX + 6))
    expect(PHY_MODES.uhr.ndbps[inU]).not.toBe(PHY_MODES.eht.ndbps[inE])
    for (const needle of ['1.0 米', '7.0 米', '702', '6.9 米']) {
      expect(uhrRateLadder.tryThis[1]!, needle).toContain(needle)
    }
  })
})
