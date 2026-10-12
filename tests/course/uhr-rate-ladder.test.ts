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
import { PHY_MODES, RATE_MARGIN_DB, UHR_SFD_MCS, mcsForRssi } from '../../src/engine/phy'
import { PL_EXP, buildLinkTable } from '../../src/engine/propagation'
import { lessonTexts } from '../../src/course/readability'
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
        /*
         * To the decimals the cell PRINTS. `toBeCloseTo(_, 1)` on a two-decimal figure tolerates
         * a change of one in the last digit — which is exactly the edit this file exists to
         * catch, and five of these six cells went green under it on 2026-10-13.
         */
        const dp = (pct!.split('.')[1] ?? '').length
        expect(num(pct!), `${spot} ${fade}: printed per cent, to ${dp} decimals`)
          .toBe(Number(((r.gain - 1) * 100).toFixed(dp)))
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

// --- every figure the PROSE prints -------------------------------------------------------------

/**
 * **The four tables above are read out of the lesson and re-measured; its prose is not.** This is
 * the lesson that prints more figures than any other in the course — `scripts/figure-planting.ts`
 * counts **244** — and the tables hold 95 of them. The rest are in `why`, `terms`, `picture`,
 * `deeper`, `sources`, `limits`, `observe`, `tryThis` and the quiz, and the sweep of 2026-10-13
 * found the whole of `why` editable with the suite green.
 *
 * Almost every one of them is a figure the tables already carry, restated: `why` opens with the
 * three paper gains and the three window widths, `limits` gives the widths again, `tryThis` and
 * the quiz give the fading per cents again. So the reads below are **chains**: the prose is read
 * against the table cell it restates, and that cell is re-measured against the run by the tests
 * above. A figure that appears in both places is checked in both.
 *
 * The cheap measurements (a window's width on the floor, a rung's own N_DBPS) are redone here
 * rather than chained, because they cost no simulation at all.
 */
describe('uhr-rate-ladder · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(uhrRateLadder).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const everyFig = (re: RegExp, what: string, least: number): string[] => {
    const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
    expect(out.length, `${what}: fewer occurrences than this test was written for`)
      .toBeGreaterThanOrEqual(least)
    return out
  }

  /** The width the frames really go out at, read once off the first data frame of the scene. */
  let WIDTH = 0
  const widthMhz = (): number => {
    if (WIDTH === 0) {
      const first = recs(scene('uhr', 'mid'), 20 * MS)
        .find((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
          r.type === 'TX_START' && r.frame.kind === 'data')
      expect(first, 'the scene sends no data frame at all').toBeDefined()
      WIDTH = first!.frame.widthMhz!
    }
    return WIDTH
  }

  /**
   * The four rungs the finer ladder has and the coarser one does not — derived from the two
   * ladders themselves, because the engine holds no list of them: `UHR_SFD_MCS` gives every
   * index its draft number, and the four new ones are the four whose N_DBPS is new.
   */
  const NEW_RUNGS = PHY_MODES.uhr.ndbps
    .map((nd, i) => ({ nd, i }))
    .filter((x) => !(PHY_MODES.eht.ndbps as readonly number[]).includes(x.nd))

  it('the three paper gains, wherever the lesson states them', () => {
    // the formula block prints the three ratios; `why` prints them as per cents
    const f = uhrRateLadder.numbers!.find((b) => b.kind === 'formula')!
    const ratios = [...(f as { text: string }).text.matchAll(/(\d+) \/ (\d+) = ([\d.]+)/g)]
      .map((m) => [val(m[1]), val(m[2]), val(m[3])])
    expect(ratios.length, 'the formula prints three of them').toBe(3)
    for (const [a, b, r] of ratios) {
      expect(Number((a / b).toFixed(4)), `${a} / ${b} is the ratio the lesson prints`).toBe(r)
      // and both terms are rungs of the two ladders: the finer one over the one it displaces
      expect([...PHY_MODES.uhr.ndbps], `${a} is a rung of the finer ladder`).toContain(a)
      expect([...PHY_MODES.eht.ndbps], `${b} is a rung of the coarser one`).toContain(b)
    }
    const pcts = figs(uhrRateLadder.why!, /这间房里是 \+([\d.]+) %、\+([\d.]+) % 与 \+([\d.]+) %/,
      '`why` on the three paper gains')
    pcts.forEach((p, i) => {
      expect(p, `the ${i + 1}th gain as a per cent, to one decimal`)
        .toBe(Number(((ratios[i][2] - 1) * 100).toFixed(1)))
    })
    // 「+33.3 % 缩到 +11.8 %，+6.7 % 一分不剩」: the first two are the fading table's own cells
    const [paper, left, gone] = figs(uhrRateLadder.why!,
      /\+([\d.]+) % 缩到 \+([\d.]+) %，\+([\d.]+) % 一分不剩/, '`why` on what fading leaves')
    expect(paper, 'the biggest paper gain').toBe(Math.max(...pcts))
    expect(gone, 'and the smallest').toBe(Math.min(...pcts))
    const fade = table('打开起伏之后')
    const cells = fade.rows.map((r) => val(/([−-]?[\d.]+)\s*%/.exec(r[4])![1]))
    expect(left, 'what the biggest keeps under both layers')
      .toBe(Number(Math.max(...cells).toFixed(1)))
    expect(Math.min(...cells.map(Math.abs)), 'and the one that keeps nothing is near zero')
      .toBeLessThan(0.5)
  })

  it('the three window widths, at every one of the three places the lesson prints them', () => {
    // measured the same way the test above measures them: 5 cm steps across the room, off the
    // link table and the two ladders — no simulation, because a window is a property of the level
    const base = scene('eht', 'mid')
    const at = (x: number): number => {
      const nodes = base.nodes.map((n) => (n.id === 'sta-1' ? { ...n, pos: { ...n.pos, x } } : n))
      return buildLinkTable(nodes, base.walls).get('sta-1')!.get('ap')!
    }
    const spans = new Map<number, { from: number; to: number }>()
    for (let i = 0; i <= 218; i++) {
      const x = Math.round((5 + i * 0.05) * 100) / 100
      const r = at(x)
      const e = mcsForRssi('eht', r, undefined, 20)
      const u = mcsForRssi('uhr', r, undefined, 20)
      if (PHY_MODES.uhr.ndbps[u] === PHY_MODES.eht.ndbps[e]) continue
      const sfd = UHR_SFD_MCS[u]!
      const got = spans.get(sfd)
      if (got === undefined) spans.set(sfd, { from: x, to: x })
      else got.to = x
    }
    const widths = [...spans.keys()].sort((a, b) => a - b)
      .map((k) => Math.round((spans.get(k)!.to - spans.get(k)!.from + 0.05) * 100) / 100)
    // 「三个窗口在地板上分别只有 0.25、1.45 与 0.60 米宽」 — `why` and `limits`, in that order
    const triples = [...EVERYWHERE.matchAll(/分别(?:只有|是) ([\d.]+)、([\d.]+) 与 ([\d.]+) 米宽/g)]
      .map((m) => m.slice(1))
    expect(triples.length, 'the lesson prints the three widths more than once').toBeGreaterThan(1)
    for (const three of triples) {
      // the lesson lists them narrowest first, which is the order the table prints the spots in
      const printed = three.map(val).sort((a, b) => a - b)
      expect(printed, 'the three widths this flat really has')
        .toEqual([...widths].sort((a, b) => a - b))
    }
    // 「同样的 1 分贝在三米处是 0.25 米，在八米处是 0.60 米」: two of the same three widths, and
    // the decibel is the narrowest sensitivity step the four new rungs take
    const [db, nearW, farW] = figs(EVERYWHERE,
      /同样的 (\d+) 分贝在三米处是 ([\d.]+) 米，在八米处是 ([\d.]+) 米/,
      '`picture` on the same decibel at two distances')
    expect(widths, 'the near width is one of this flat’s windows').toContain(nearW)
    expect(widths, 'and so is the far one').toContain(farW)
    expect(farW, 'and the same decibel is wider further out').toBeGreaterThan(nearW)
    const steps = NEW_RUNGS.map((r) => Math.round(
      PHY_MODES.uhr.sensDbm[r.i] - PHY_MODES.uhr.sensDbm[r.i - 1]))
    expect(Math.min(...steps), 'the narrowest step the new rungs take').toBe(db)
  })

  it('the engine values `sources` lists: the two sensitivity ladders, the margin and the fading', () => {
    const src = uhrRateLadder.sources!.join('\n')
    // 「四个新档的接收灵敏度 −78 / −71 / −69 / −60 dBm」
    const four = figs(src, /四个新档的接收灵敏度 −(\d+) \/ −(\d+) \/ −(\d+) \/ −(\d+) dBm/,
      'the four new rungs’ sensitivities')
    expect(four.map((v) => -v).sort((a, b) => a - b),
      'the sensitivities this engine gives those four rungs')
      .toEqual(NEW_RUNGS.map((r) => PHY_MODES.uhr.sensDbm[r.i]).sort((a, b) => a - b))
    // 「其中 7 行是本仿真器已有的档（−79 / −77 / −74 / −70 / −66 / −64 / −59 dBm）」
    const [rowCount] = figs(src, /那张表只有 \d+ 行，其中 (\d+) 行是本仿真器已有的档/,
      'how many rows the draft table shares with this engine')
    const seven = [...src.matchAll(/−(\d+)/g)].map((m) => -val(m[1]))
    const shared = [...PHY_MODES.uhr.sensDbm].filter((d) => seven.includes(d))
    expect(shared.length, 'that many of the engine’s own sensitivities appear in the list')
      .toBeGreaterThanOrEqual(rowCount)
    // 「挑档时在所需信噪比之上留的 3 分贝余量、阴影的 σ = 4 分贝与 100 毫秒相干时间」
    const [margin, sigma, coh] = figs(src,
      /留的 (\d+) 分贝余量、阴影的 σ = (\d+) 分贝与 (\d+) 毫秒相干时间/,
      'the three model values the lesson rests on')
    expect(margin, 'the margin the ladder is taken with').toBe(RATE_MARGIN_DB)
    const faded = scene('uhr', 'mid', 'shadow', 1)
    expect(faded.fading!.shadowSigmaDb, 'the shadowing this scene switches on').toBe(sigma)
    expect(faded.fading!.coherenceMs, 'and its coherence time').toBe(coh)
    // 「前导码长度 48 微秒、每符号 13.6 微秒与多用户附加前导 4 微秒」
    const [pre, sym, mu] = figs(src,
      /前导码长度 (\d+) 微秒、每符号 ([\d.]+) 微秒与多用户附加前导 (\d+) 微秒/,
      'the three durations Wi-Fi 8 reuses')
    expect([pre * 1000, mu * 1000], 'the preamble and the multi-user extra')
      .toEqual([PHY_MODES.uhr.preambleNs, PHY_MODES.uhr.muExtraPreambleNs])
    same(String(sym), PHY_MODES.uhr.symNs / 1000, 'and the symbol')
    expect(PHY_MODES.uhr.preambleNs, 'which are Wi-Fi 7’s own').toBe(PHY_MODES.eht.preambleNs)
    // 「20 兆赫 234 个数据子载波」 and 「逐档验算过 234 × 每子载波比特数 × 码率」
    for (const v of everyFig(/(\d+) 兆赫 (\d+) 个数据子载波|验算过 (\d+) × 每子载波比特数/g,
      'the tones a 20 MHz channel carries', 2)) {
      if (val(v) === 20) continue
      expect(PHY_MODES.uhr.ndbps[0] / val(v), 'the bits one tone carries at the lowest rung')
        .toBeCloseTo(0.5, 9)
    }
  })

  it('every modulation and code rate the lesson names is the rung it names it for', () => {
    // 「QPSK 2/3、16-QAM 2/3、16-QAM 5/6 和 256-QAM 2/3」 — and 234 × bits × rate is the N_DBPS
    const BITS: Record<string, number> = {
      BPSK: 1, QPSK: 2, '16-QAM': 4, '64-QAM': 6, '256-QAM': 8, '1024-QAM': 10, '4096-QAM': 12,
    }
    const tones = PHY_MODES.uhr.ndbps[0] * 2
    const nd = (pair: string): number => {
      const [, mod, n, d] = /^(\S+) (\d)\/(\d)$/.exec(pair)!
      return tones * BITS[mod!]! * (val(n!) / val(d!))
    }
    /*
     * **A pair is checked as a STRING against a narrow set, and not by its arithmetic**, because
     * 234 × bits × rate is not injective over the legal code rates: 256-QAM 2/4 is 936, which is
     * 64-QAM 2/3 — a rung of the coarse ladder. So a membership test on N_DBPS lets an edit to
     * any one digit of any pair through, and the sweep of 2026-10-13 planted sixteen of them
     * green. The set below is built from the three places the lesson publishes a pair TOGETHER
     * WITH the rung it belongs to, each verified here against the engine; every other occurrence
     * in the lesson must be one of those strings.
     */
    const legal = new Map<string, number>()
    for (const row of table('四个新档').rows) {
      const [pair, ndCell, i] = [row[2]!, val(row[4]!), val(row[0]!)]
      expect(nd(pair), `${pair} is the N_DBPS its own row prints`).toBe(ndCell)
      expect(PHY_MODES.uhr.ndbps[i], `and the rung the finer ladder has at index ${i}`).toBe(ndCell)
      legal.set(pair, ndCell)
    }
    // 「同一个数字「7」在粗阶梯上是 64-QAM 5/6（1 170），在细阶梯上是 16-QAM 5/6（780）」
    const [idx, mod1, n1, d1, nd1, mod2, n2, d2, nd2] = raw(EVERYWHERE,
      /同一个数字「(\d+)」在粗阶梯上是 ([\w-]+) (\d)\/(\d)（([\d\s]+)），在细阶梯上是 ([\w-]+) (\d)\/(\d)（([\d\s]+)）/,
      'the index that means two different rungs')
    expect(PHY_MODES.eht.ndbps[val(idx)], `index ${idx} on the coarse ladder`).toBe(val(nd1))
    expect(PHY_MODES.uhr.ndbps[val(idx)], `and on the fine one`).toBe(val(nd2))
    expect(nd(`${mod1} ${n1}/${d1}`), 'the coarse one’s own arithmetic').toBe(val(nd1))
    expect(nd(`${mod2} ${n2}/${d2}`), 'and the fine one’s').toBe(val(nd2))
    legal.set(`${mod1} ${n1}/${d1}`, val(nd1))
    legal.set(`${mod2} ${n2}/${d2}`, val(nd2))
    // 「而索引 13 已经是 4096-QAM 5/6」: the top rung of BOTH ladders, and it is the same rung
    for (const m of ['eht', 'uhr'] as const) {
      const ndbps = PHY_MODES[m].ndbps
      expect(nd('4096-QAM 5/6'), `the top rung of the ${m} ladder`).toBe(ndbps[ndbps.length - 1])
    }
    legal.set('4096-QAM 5/6', nd('4096-QAM 5/6'))
    /*
     * And now every occurrence anywhere in the lesson is one of those published strings.
     *
     * The gloss comes out first: the lesson spells a term in full-width brackets where it first
     * names one — 「QPSK（quadrature phase-shift keying）2/3」 — so in `picture` the English sits
     * BETWEEN the modulation and its code rate, and a pattern that wants them adjacent walks
     * past the two pairs that matter most. The sweep of 2026-10-13 found exactly those four
     * digits still green after everything else here was red — and then found them green a
     * second time, because a gloss dropped to nothing leaves 「QPSK2/3」 and the pattern wants
     * the space the brackets were standing in. It becomes a space.
     */
    const GLOSSED = EVERYWHERE.replace(/（[\x20-\x7E]+）/g, ' ')
    const pairs = [...GLOSSED.matchAll(/(BPSK|QPSK|16-QAM|64-QAM|256-QAM|1024-QAM|4096-QAM) (\d)\/(\d)/g)]
      .map((m) => `${m[1]} ${m[2]}/${m[3]}`)
    expect(pairs.length, 'the lesson names a modulation with its code rate many times')
      .toBeGreaterThan(8)
    for (const p of pairs) {
      expect([...legal.keys()], `${p} is a pair this lesson publishes with the rung it is`)
        .toContain(p)
    }
  })

  it('`deeper` and the quiz: why the draft’s numbering cannot be the engine’s index', () => {
    const deep = (uhrRateLadder.deeper ?? [])
      .map((b) => `${b.heading ?? ''}\n${'text' in b ? b.text : ''}`).join('\n')
    // 「追加之后索引 14…17 会是 QPSK 2/3、16-QAM 2/3、16-QAM 5/6、256-QAM 2/3」
    const [from, to] = figs(deep, /追加之后索引 (\d+)…(\d+) 会是/, 'the indices an append would use')
    expect(from, 'the first free index of the coarse ladder').toBe(PHY_MODES.eht.ndbps.length)
    expect(to - from + 1, 'as many as there are new rungs').toBe(NEW_RUNGS.length)
    // 「而索引 13 已经是 4096-QAM 5/6」 — the top of the coarse ladder, named by its own rung
    const [top] = figs(deep, /而索引 (\d+) 已经是 4096-QAM/, 'the top of the coarse ladder')
    expect(top, 'the last index it has').toBe(PHY_MODES.eht.ndbps.length - 1)
    // 「一条信号极好的链路会挑到索引 17 的 256-QAM 2/3，比它本来跑得到的慢」: the append would
    // put a slower rung above a faster one, which is the whole argument
    const [picked] = figs(deep, /会挑到索引 (\d+) 的 256-QAM/, 'the index it would pick')
    expect(picked, 'which is the last of the appended ones').toBe(to)
    const appended = [...PHY_MODES.eht.ndbps, ...NEW_RUNGS.map((r) => r.nd)]
    expect(appended[picked], 'and its N_DBPS is below the one at the index under it')
      .toBeLessThan(appended[top])
    // 「Wi-Fi 7 上那个索引是 12，Wi-Fi 8 上是 16，而两者都正好是各自阶梯顶上第二档」
    const [eht4k, uhr4k] = figs(deep, /那个索引是 (\d+)，Wi-Fi 8 上是 (\d+)/,
      'the first 4096-QAM index of each ladder')
    expect(eht4k, 'the coarse ladder’s own').toBe(PHY_MODES.eht.ndbps.length - 2)
    expect(uhr4k, 'and the finer one’s').toBe(PHY_MODES.uhr.ndbps.length - 2)
    expect(PHY_MODES.eht.ndbps[eht4k] / PHY_MODES.eht.ndbps[eht4k + 1],
      'the two 4096-QAM rungs differ by their code rate alone')
      .toBeCloseTo(PHY_MODES.uhr.ndbps[uhr4k] / PHY_MODES.uhr.ndbps[uhr4k + 1], 9)
    // the draft's own four numbers, which `sources` and the quiz both print
    const numbering = [...EVERYWHERE.matchAll(/编号(?:是|为)? ?(\d+) ?\/ ?(\d+) ?\/ ?(\d+) ?\/ ?(\d+)/g)]
      .map((m) => m.slice(1).map(val))
    expect(numbering.length, 'the lesson prints the draft’s numbering more than once')
      .toBeGreaterThan(1)
    for (const four of numbering) {
      expect(four, 'the draft numbers of the four new rungs')
        .toEqual(NEW_RUNGS.map((r) => UHR_SFD_MCS[r.i]!))
      expect([...four].sort((a, b) => a - b), 'and they rise').toEqual(four)
    }
  })

  it('`observe` and `tryThis`: the two rungs, the two goodputs, and what seed 17 does to them', () => {
    const obs = uhrRateLadder.observe.join('\n')
    // 「模式是 uhr、MCS 是 7」…「是 eht、MCS 4」, at the spot the lesson sends the reader to
    const [uhrMcs] = figs(obs, /模式是 uhr、MCS 是 (\d+)/, '`observe` on the finer ladder’s rung')
    const [ehtMcs] = figs(obs, /是 eht、MCS (\d+)/, 'and on the coarser one’s')
    // 「那一行」 is the scene the lesson ships, which is the middle of the room
    const spot: Spot = 'mid'
    expect(uhrMcs, 'the rung the finer ladder picks there')
      .toBe(mcsForRssi('uhr', rssiUp(spot), undefined, 20))
    expect(ehtMcs, 'and the coarser one’s').toBe(mcsForRssi('eht', rssiUp(spot), undefined, 20))
    // 「两边的吞吐是 49.000 对 44.100 Mb/s」
    const [fine, coarse] = raw(obs, /两边的吞吐是 ([\d.]+) 对 ([\d.]+) Mb\/s/,
      '`observe` on the two goodputs')
    same(fine, goodputMbps(recs(scene('uhr', spot), LONG_NS), LONG_NS), 'the finer ladder’s goodput')
    same(coarse, goodputMbps(recs(scene('eht', spot), LONG_NS), LONG_NS), 'and the coarser one’s')
    // 「出现过几个不同的 MCS：四个（4、5、6、7）」…「两个（3、4）」
    const groups = [...obs.matchAll(/（(\d+)(?:、(\d+))*）/g)].map((m) => m[0])
    expect(groups.length, 'the lesson lists two sets of rungs').toBeGreaterThan(1)
    const listed = (s: string): number[] => [...s.matchAll(/\d+/g)].map((m) => val(m[0]))
    const fineSet = listed(groups[0])
    const coarseSet = listed(groups[1])
    expect(fineSet.length, 'the finer ladder visits more rungs than the coarser one')
      .toBeGreaterThan(coarseSet.length)
    const shadowSeed = uhrRateLadder.variants!
      .find((v) => v.label.includes('Wi-Fi 8 · 开阴影'))!.scenario().seed!
    for (const [gen, set] of [['uhr', fineSet], ['eht', coarseSet]] as const) {
      const used = rungsUsed(recs(scene(gen, 'mid', 'shadow', shadowSeed), RUN_NS))
        .sort((a, b) => a - b)
      expect(set.sort((a, b) => a - b), `${gen}: the rungs that walk really visits`).toEqual(used)
    }
    // 「而这一次它赢 6.9 %，换成种子 17 它输 9.7 %」: the two per cents of that one walk
    const gain = (seed: number): number => {
      const u = goodputMbps(recs(scene('uhr', 'mid', 'shadow', seed), RUN_NS), RUN_NS)
      const e = goodputMbps(recs(scene('eht', 'mid', 'shadow', seed), RUN_NS), RUN_NS)
      return (100 * (u - e)) / e
    }
    const [won, otherSeed, lost] = raw(obs,
      /这一次它赢 ([\d.]+) %，换成种子 (\d+) 它输 ([\d.]+) %/, '`observe` on the two seeds')
    same(won, gain(shadowSeed), 'what the finer ladder wins on the shipped seed')
    same(lost, -gain(val(otherSeed)), 'and what it loses on the other one')
    // and `numbers` states the same two runs: 「种子 2 是 +6.9 %，种子 17 是 −9.7 %」
    const [seedA, wonA, seedB, lostA] = raw(EVERYWHERE,
      /只换随机种子：开阴影之后种子 (\d+) 是 \+([\d.]+) %，种子 (\d+) 是 −([\d.]+) %/,
      '`numbers` on the same pair of seeds')
    expect(val(seedA), 'the first is the seed the two faded variants ship').toBe(shadowSeed)
    expect(val(seedB), 'and the second is the one the experiment switches to').toBe(val(otherSeed))
    same(wonA, gain(val(seedA)), 'what the finer ladder wins on the shipped seed, in `numbers`')
    same(lostA, -gain(val(seedB)), 'and what it loses on the other one, in `numbers`')
  })

  it('`tryThis`: the seed-17 rerun, and the window that closes a metre further out', () => {
    const t0 = uhrRateLadder.tryThis[0]
    const [seed] = figs(t0, /随机种子都改成 (\d+)/, 'the seed `tryThis` switches to')
    const [fineMbps, fell, coarseMbps] = raw(t0,
      /Wi-Fi 8 从 ([\d.]+) 掉到 ([\d.]+) Mb\/s，而 Wi-Fi 7 守在 ([\d.]+)/,
      'the three goodputs it quotes')
    const at = (gen: 'eht' | 'uhr', s: number): number =>
      goodputMbps(recs(scene(gen, 'mid', 'shadow', s), RUN_NS), RUN_NS)
    /*
     * 「从 39.76 掉到 32.72」: the 「从」 is the shipped 「开阴影」 variant, whose own seed is read off
     * the scenario it builds rather than retyped — the experiment is 「change THAT seed to 17」.
     */
    const shipped = uhrRateLadder.variants!
      .find((v) => v.label.includes('Wi-Fi 8 · 开阴影'))!.scenario().seed!
    same(fineMbps, at('uhr', shipped), 'the finer ladder on the seed the variant ships')
    same(fell, at('uhr', seed), 'and on the seed this experiment switches to')
    same(coarseMbps, at('eht', seed), 'while the coarser one holds')
    const [lost] = raw(t0, /细阶梯输掉 ([\d.]+) %/, 'what the finer ladder loses')
    same(lost, 100 * (1 - at('uhr', seed) / at('eht', seed)), 'the loss on that seed')
    // 「两边的接收失败数：18 对 8」
    const [fineFail, coarseFail] = figs(t0, /接收失败数：(\d+) 对 (\d+)/, 'the two failure counts')
    expect(fineFail, 'the finer ladder fails more often')
      .toBe(failures(recs(scene('uhr', 'mid', 'shadow', seed), RUN_NS)))
    expect(coarseFail, 'than the coarser one')
      .toBe(failures(recs(scene('eht', 'mid', 'shadow', seed), RUN_NS)))
    expect(fineFail, 'which is the mechanism the lesson is about').toBeGreaterThan(coarseFail)
  })

  it('every width, every rung index and every window the lesson names', () => {
    // every 「N 兆赫」/「N MHz」 is the width this lesson holds everything at
    const width = widthMhz()
    for (const v of everyFig(/(?<![\d.])(\d+) 兆赫|(?<![\d.])(\d+) MHz/g, 'a channel width', 6)) {
      expect(val(v), `${v} is the width every figure in this lesson is quoted at`).toBe(width)
    }
    // every 「MCS N」 and every 「索引 N」 is an index one of the two ladders has
    const ladders = { eht: PHY_MODES.eht.ndbps.length, uhr: PHY_MODES.uhr.ndbps.length }
    const drafts = new Set(UHR_SFD_MCS)
    for (const v of everyFig(/MCS (\d+)|索引 (\d+)|第 (\d+) 级/g, 'a rung index', 12)) {
      const n = val(v)
      const asIndex = n < Math.max(ladders.eht, ladders.uhr)
      expect(asIndex || drafts.has(n),
        `${n} is either an index of one of the two ladders or a draft number`).toBe(true)
    }
    // the four new rungs, by the draft's own numbers and by their own sensitivities
    const newDraft = NEW_RUNGS.map((r) => UHR_SFD_MCS[r.i]!)
    for (const n of newDraft) {
      expect(n, 'a new rung’s draft number is above the coarse ladder’s last')
        .toBeGreaterThan(ladders.eht - 1)
    }
    /*
     * 「四个新档里有三个只给自己留了 1 分贝的灵敏度间隔，只有 16-QAM 5/6 占了 3 分贝」.
     *
     * 「灵敏度间隔」 is the WINDOW in decibels — the span of received levels over which that rung
     * is the finer ladder's choice AND carries more bits than the coarser ladder's — and not the
     * step from the rung below it in its own ladder. The two differ: 16-QAM 5/6 sits 1 dB above
     * its own predecessor while its window is three decibels wide, because a window is a
     * property of BOTH ladders. Swept here at a tenth of a decibel, which is also where the
     * 「1 到 3 分贝宽」 of the same paragraph comes from.
     */
    const windowDb = new Map<number, number>()
    for (let i = 0; i <= 1000; i++) {
      const lvl = -100 + i * 0.1
      const u = mcsForRssi('uhr', lvl, undefined, width)
      const e = mcsForRssi('eht', lvl, undefined, width)
      if (PHY_MODES.uhr.ndbps[u] === PHY_MODES.eht.ndbps[e]) continue
      const sfd = UHR_SFD_MCS[u]!
      windowDb.set(sfd, (windowDb.get(sfd) ?? 0) + 0.1)
    }
    const [narrow, wideStep] = figs(EVERYWHERE,
      /有三个只给自己留了 (\d+) 分贝的灵敏度间隔，只有 16-QAM 5\/6 占了 (\d+) 分贝/,
      '`picture` on the four windows in decibels')
    const inDb = NEW_RUNGS.map((r) => Number((windowDb.get(UHR_SFD_MCS[r.i]!) ?? 0).toFixed(1)))
    expect(inDb.filter((d) => d === narrow).length, 'three of the four windows are that wide')
      .toBe(3)
    expect(Math.max(...inDb), 'and the fourth is the wider one').toBe(wideStep)
    // and that fourth one is the rung the sentence names: 16-QAM 5/6, which is 780 bits a symbol
    const [tones] = figs(EVERYWHERE, /(\d+) 个数据子载波/, 'the tones a symbol carries')
    const sixteenQamFiveSixths = tones * 4 * (5 / 6)
    const named = NEW_RUNGS.find((r) => r.nd === sixteenQamFiveSixths)!
    expect(Number((windowDb.get(UHR_SFD_MCS[named.i]!) ?? 0).toFixed(1)),
      '16-QAM 5/6 is the one with the wider window').toBe(wideStep)
    // 「可窗口只有 1 到 3 分贝宽」: the two ends of that same list
    const [lo, hi] = figs(EVERYWHERE, /可窗口只有 (\d+) 到 (\d+) 分贝宽/,
      '`picture` on how wide the windows get')
    expect([Math.min(...inDb), Math.max(...inDb)], 'the narrowest and the widest of them')
      .toEqual([lo, hi])
    // 「同一个位置上，路径损耗指数是 3.0」
    const [exp] = figs(EVERYWHERE, /指数是 ([\d.]+)/, '`picture` on the path-loss exponent')
    expect(exp, 'the exponent this engine spreads with').toBe(PL_EXP)
    // 「按 5 厘米一格扫过整间客厅」: the grid `limits` says the windows were measured on
    const [cm] = figs(EVERYWHERE, /按 (\d+) 厘米一格扫过/, '`limits` on the grid it swept')
    expect(cm / 100, 'the step the window measurement above uses').toBe(0.05)
  })

  it('the two run lengths, the three measured ratios, and the fading cells restated', () => {
    // 「定点实测（600 毫秒…）」 and 「二十个种子的均值，300 毫秒」
    const [fixedMs] = figs(EVERYWHERE, /定点实测（(\d+) 毫秒/, 'the window the fixed runs use')
    const [fadeMs] = figs(EVERYWHERE, /二十个种子的均值，(\d+) 毫秒/, 'and the faded ones')
    expect(fixedMs * 1_000_000, 'the fixed-position window this file runs').toBe(LONG_NS)
    expect(fadeMs * 1_000_000, 'and the faded one').toBe(RUN_NS)
    // 「实测吞吐比是 1.0671、1.1111、1.3333」: the three spots' own goodput ratios
    const measured = figs(EVERYWHERE,
      /实测吞吐比是 ([\d.]+)、([\d.]+)、([\d.]+)/, 'the three measured ratios')
    const spots: Spot[] = ['near', 'mid', 'far']
    spots.forEach((spot, i) => {
      const u = goodputMbps(recs(scene('uhr', spot), LONG_NS), LONG_NS)
      const e = goodputMbps(recs(scene('eht', spot), LONG_NS), LONG_NS)
      same(String(measured[i]), u / e, `${spot}: the ratio the lesson measured`)
    })
    // the fading table's per cents, restated in `numbers`, in `observe` and in the quiz
    const fade = table('打开起伏之后')
    const cell = (row: number, col: number): number =>
      val(/([−-]?[\d.]+)\s*%/.exec(fade.rows[row][col])![1])
    const [tight] = figs(EVERYWHERE, /定点上值 \+([\d.]+) %/, 'the fixed-position gain of the top window')
    const [faded] = figs(EVERYWHERE, /一分不剩：均值 −([\d.]+) %/, 'and what it keeps once it wanders')
    expect(-faded, 'which is the table’s own shadow-only cell for that window').toBe(cell(0, 3))
    // 「两批不同的六十个给出 +7.4 % 与 +8.7 %，都比表上印的 +11.78 % 低」
    const [under] = figs(EVERYWHERE, /都比表上印的 \+([\d.]+) % 低/,
      'the cell the sixty-seed paragraph points at')
    expect(under, 'which is the deepest row’s own both-layers cell').toBe(cell(2, 4))
    const [quizFixed, quizFaded] = figs(EVERYWHERE,
      /定点实测细阶梯快 ([\d.]+) %，而打开起伏之后均值是 −([\d.]+) %/, 'the quiz on the same pair')
    expect(quizFixed, 'the quiz states the same fixed-position gain').toBe(tight)
    expect(quizFaded, 'and the same faded one').toBe(faded)
    // 「这一格的接收失败数是 32 对 135」, in `numbers` and in the quiz
    const fails = [...EVERYWHERE.matchAll(/接收失败数(?:在这一格里)?是 (\d+) 对 (\d+)/g)]
      .map((m) => [val(m[1]), val(m[2])])
    expect(fails.length, 'the lesson states that pair more than once').toBeGreaterThan(1)
    for (const pair of fails) expect(pair, 'the same pair both times').toEqual(fails[0])
    const seedList = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67]
    const [howMany] = figs(fade.rows[0][3], /（\d+\/(\d+)）/, 'how many seeds the table used')
    expect(seedList, 'as many seeds as the table says').toHaveLength(howMany)
    /*
     * 「这一格」 is the first row of the fading table with the slow layer alone: the paragraph
     * around this pair is about 「均值 −0.04 %」, which is that row's 「只开阴影」 cell.
     */
    const near = (gen: 'eht' | 'uhr'): number => {
      let n = 0
      for (const seed of seedList) n += failures(recs(scene(gen, 'near', 'shadow', seed), RUN_NS))
      return n
    }
    expect(fails[0], 'the two arms’ own failure counts over those twenty seeds')
      .toEqual([near('eht'), near('uhr')])
  })

  it('`sources`: the draft’s own numbering and the rows this engine shares with its table', () => {
    const src = uhrRateLadder.sources!.join('\n')
    // 「那张表只有 11 行，其中 7 行是本仿真器已有的档（−79 / −77 / −74 / −70 / −66 / −64 / −59）」
    const [rows, shared] = figs(src, /那张表只有 (\d+) 行，其中 (\d+) 行是本仿真器已有的档/,
      'how big the draft’s table is and how much of it this engine has')
    // the list is the one inside that sentence's own parenthesis — `sources` prints three other
    // lists of decibels (the EVM figures and the four new rungs), and they are not this one
    const inside = /本仿真器已有的档（([^）]+)）/.exec(src)
    expect(inside, 'the parenthesised list of shared rows is gone').not.toBeNull()
    /*
     * 「本仿真器已有的档」 is the FOURTEEN-rung ladder, so this list is checked against `eht` and
     * not against `uhr`: every one of the draft's four new sensitivities is also a value
     * `uhr.sensDbm` holds, so the finer ladder's own column answers for a planted digit — four
     * of these seven went green that way on 2026-10-13.
     */
    const older = [...PHY_MODES.eht.sensDbm]
    const listed = [...inside![1].matchAll(/−(\d+)/g)].map((m) => -val(m[1]))
    expect(listed.length, 'the list holds that many').toBe(shared)
    for (const d of listed) {
      expect(older, `${d} dBm is a rung this engine had before the draft’s four`).toContain(d)
    }
    // 「那张表只有 11 行」: the seven it shares plus the four it adds, and that is the whole table
    expect(rows, 'eleven rows: the seven shared and the four new ones')
      .toBe(shared + NEW_RUNGS.length)
    /*
     * 「MCS 0、6、9–13 不在那张表里」 — the complement, checked by its SENSITIVITIES and not by
     * its size: the older ladder's fourteen values are all distinct, so naming seven of them
     * names the other seven too. A count alone would let any seven indices through.
     */
    const [a, b, from, to] = figs(src, /MCS (\d+)、(\d+)、(\d+)–(\d+) 不在那张表里/,
      'the rungs the draft’s table does not carry')
    const missing = [a, b, ...Array.from({ length: to - from + 1 }, (_x, i) => from + i)]
    expect(missing.length + shared, 'and those two sets are the whole of the older ladder')
      .toBe(older.length)
    const asc = (x: number, y: number): number => x - y
    expect(new Set(older).size, 'the older ladder’s sensitivities are all distinct')
      .toBe(older.length)
    const kept = older.map((_d, i) => i).filter((i) => !missing.includes(i))
    expect(kept.map((i) => older[i]!).sort(asc), 'the rows it does carry are the seven listed')
      .toEqual([...listed].sort(asc))
  })

  it('`picture` and the widget caption name the rungs their own scene really picks', () => {
    const w = widthMhz()
    const pic = (uhrRateLadder.picture ?? []).map((b) => [
      b.heading ?? '', 'text' in b ? b.text : '', 'items' in b ? b.items.join('\n') : '',
    ].join('\n')).join('\n')
    const [uMcs] = figs(pic, /模式 uhr、MCS (\d+)/, '`picture` on the finer ladder’s rung')
    const [eMcs] = figs(pic, /这一次是 eht、MCS (\d+)/, 'and the coarser one’s, at the same spot')
    expect(uMcs, 'the finer ladder’s choice at the spot this lesson ships')
      .toBe(mcsForRssi('uhr', rssiUp('mid'), undefined, w))
    expect(eMcs, 'and the coarser one’s, in the variant beside it')
      .toBe(mcsForRssi('eht', rssiUp('mid'), undefined, w))
    // 「草案管这两档叫 MCS 20 和 MCS 4」: the draft's number for each of those two rungs
    const [dU, dE] = figs(pic, /草案管这两档叫 MCS (\d+) 和 MCS (\d+)/,
      '`picture` on what the draft calls them')
    expect(dU, 'the draft number of the rung the finer ladder picked').toBe(UHR_SFD_MCS[uMcs]!)
    expect(dE, 'while on the coarser ladder the index IS the draft number').toBe(eMcs)
    // the `mcsLadder` widget's caption: 「点亮的最高一级是索引 4。细阶梯在 4 和 5 之间还多一档」
    const widget = uhrRateLadder.numbers!.find((b) => b.kind === 'widget')!
    const cap = (widget as { caption?: string }).caption ?? ''
    const [lit] = figs(cap, /点亮的最高一级是索引 (\d+)/, 'the rung the widget lights up')
    expect(lit, 'which is the coarser ladder’s choice at this lesson’s own spot').toBe(eMcs)
    const [lo, hi] = figs(cap, /细阶梯在 (\d+) 和 (\d+) 之间还多一档/,
      'and where the rung it cannot show sits')
    expect(hi, 'two adjacent rungs of the coarser ladder').toBe(lo + 1)
    expect(lo, 'the lower of them being the one the marker stopped on').toBe(lit)
    const between = NEW_RUNGS.map((r) => r.nd)
      .filter((n) => n > PHY_MODES.eht.ndbps[lo]! && n < PHY_MODES.eht.ndbps[hi]!)
    expect(between, 'exactly one new rung falls between those two').toHaveLength(1)
    // 「那个复选框的标签以前写着「MCS 12/13」」: the coarse ladder's own two 4096-QAM rungs
    const deep = (uhrRateLadder.deeper ?? [])
      .map((b) => `${b.heading ?? ''}\n${'text' in b ? b.text : ''}`).join('\n')
    const [l1, l2] = figs(deep, /标签以前写着「MCS (\d+)\/(\d+)」/,
      'the label that checkbox used to carry')
    expect([l1, l2], 'the two 4096-QAM rungs of the coarser ladder')
      .toEqual([PHY_MODES.eht.ndbps.length - 2, PHY_MODES.eht.ndbps.length - 1])
    // 「而索引 13 已经是 4096-QAM 5/6」 — `deeper` and the quiz both say it
    const tops = [...EVERYWHERE.matchAll(/索引 (\d+) 已经是 4096-QAM/g)].map((m) => val(m[1]!))
    expect(tops.length, 'the lesson makes that point more than once').toBeGreaterThan(1)
    for (const t of tops) {
      expect(t, 'the top index of the coarser ladder').toBe(PHY_MODES.eht.ndbps.length - 1)
    }
  })

  /**
   * **Every window, in both units.** Two sweeps, neither of which runs a simulation: a window is
   * a property of the received level and the two ladders. One walks the level a tenth of a
   * decibel at a time, the other walks the floor of this flat 5 cm at a time. Both are the
   * measurements the tests above already make; they are redone here because they cost nothing
   * and because the prose prints each window's width in both units, in five different places.
   */
  it('every window, in decibels and in metres, wherever the lesson prints one', () => {
    const w = widthMhz()
    const finer = (lvl: number): number | undefined => {
      const u = mcsForRssi('uhr', lvl, undefined, w)
      const e = mcsForRssi('eht', lvl, undefined, w)
      return PHY_MODES.uhr.ndbps[u] === PHY_MODES.eht.ndbps[e] ? undefined : UHR_SFD_MCS[u]!
    }
    const inDb = new Map<number, number>()
    for (let i = 0; i <= 1000; i++) {
      const sfd = finer(-100 + i * 0.1)
      if (sfd !== undefined) inDb.set(sfd, Number(((inDb.get(sfd) ?? 0) + 0.1).toFixed(1)))
    }
    const base = scene('eht', 'mid')
    const apX = base.nodes[0]!.pos.x
    const at = (x: number): number => {
      const nodes = base.nodes.map((n) => (n.id === 'sta-1' ? { ...n, pos: { ...n.pos, x } } : n))
      return buildLinkTable(nodes, base.walls).get('sta-1')!.get('ap')!
    }
    const spans = new Map<number, { from: number; to: number }>()
    for (let i = 0; i <= 218; i++) {
      const x = Math.round((5 + i * 0.05) * 100) / 100
      const sfd = finer(at(x))
      if (sfd === undefined) continue
      const got = spans.get(sfd)
      if (got === undefined) spans.set(sfd, { from: x, to: x })
      else got.to = x
    }
    const onFloor = (sfd: number): number =>
      Math.round((spans.get(sfd)!.to - spans.get(sfd)!.from + 0.05) * 100) / 100
    const sfdAt = (spot: Spot): number => UHR_SFD_MCS[mcsForRssi('uhr', rssiUp(spot), undefined, w)]!
    // the fading table's 「窗口宽」 column: one decibel figure for each of the three spots
    const spots: Spot[] = ['near', 'mid', 'far']
    table('打开起伏之后').rows.forEach((row, i) => {
      const [db] = figs(row[1]!, /(\d+) dB/, `the window width row ${i + 1} prints`)
      expect(db, `${spots[i]}: the window that row’s own rung has`)
        .toBe(inDb.get(sfdAt(spots[i]!))!)
    })
    // 「「墙后一步」是 256-QAM 2/3 那一档的窗口，1 分贝宽、地板上 0.25 米宽，定点上值 +6.71 %」
    const [pair, dbW, mW, pct] = raw(EVERYWHERE,
      /「墙后一步」是 (\S+ \d\/\d) 那一档的窗口，([\d.]+) 分贝宽、地板上 ([\d.]+) 米宽，定点上值 \+([\d.]+) %/,
      '`numbers` on the narrow top window')
    const nearRung = mcsForRssi('uhr', rssiUp('near'), undefined, w)
    expect(val(dbW!), 'the window that rung has, in decibels').toBe(inDb.get(UHR_SFD_MCS[nearRung]!)!)
    same(mW!, onFloor(UHR_SFD_MCS[nearRung]!), 'and how wide it is on this flat’s floor')
    expect(val(pct!), 'and the fixed-position gain that row of the table prints')
      .toBe(num(table('打开起伏之后').rows[0]![2]!))
    const ownRow = table('四个新档').rows.find((r) => val(r[0]!) === nearRung)!
    expect(pair, 'the pair named is the one that table gives that very index').toBe(ownRow[2])
    // 「中间那一行小得最少，因为它的窗口有 3 分贝宽，是四个新档里唯一一个」
    const [midDb] = figs(EVERYWHERE, /它的窗口有 (\d+) 分贝宽，是四个新档里唯一一个/,
      '`numbers` on why the middle row loses least')
    expect(midDb, 'the window the middle row’s rung has').toBe(inDb.get(sfdAt('mid'))!)
    expect(NEW_RUNGS.filter((r) => inDb.get(UHR_SFD_MCS[r.i]!) === midDb),
      'and it is the only one of the four that wide').toHaveLength(1)
    // 「再往回推到 6.0 米，差又回来。那 3 分贝的窗口在地板上一共 1.45 米宽」
    const t1 = uhrRateLadder.tryThis[1]!
    const [backTo] = figs(t1, /再往回推到 ([\d.]+) 米/, '`tryThis` on where the gap comes back')
    /*
     * 「再往回推到 6.0 米」 is **where the laptop started**, and that is what makes this figure
     * checkable at all: 「the gap is back」 alone holds anywhere inside a window 1.45 m wide, so
     * 6.1 would satisfy it too. The distance is the shipped spot's own.
     */
    const staX = scene('uhr', 'mid').nodes.find((n) => n.id === 'sta-1')!.pos.x
    expect(backTo, 'the distance the lesson’s own 「客厅中段」 sits at').toBe(staX - apX)
    expect(finer(at(apX + backTo)), 'and there the two ladders differ again')
      .toBe(sfdAt('mid'))
    const [tDb, tM] = raw(t1, /那 (\d+) 分贝的窗口在地板上一共 ([\d.]+) 米宽/,
      '`tryThis` on the window it just walked out of')
    expect(val(tDb!), 'the window of the rung that spot is in').toBe(inDb.get(sfdAt('mid'))!)
    same(tM!, onFloor(sfdAt('mid')), 'and how wide it is on the floor')
    expect(onFloor(sfdAt('mid')), 'the widest of the four, which is what the sentence claims')
      .toBe(Math.max(...[...spans.keys()].map(onFloor)))
    /*
     * 「笔记本因此被摆在离目标窗口 5 分贝的地方」. The two directions of the same link differ by
     * exactly that much at every spot in this scene, which is why a budget computed for the
     * router's transmit direction put the laptop in the wrong place by that many decibels.
     */
    const [away] = figs(EVERYWHERE, /离目标窗口 (\d+) 分贝的地方/,
      '`limits` on the measurement that went wrong the first time')
    const link = buildLinkTable(base.nodes, base.walls)
    expect(away, 'downlink minus uplink on this lesson’s own link')
      .toBe(Math.round(link.get('ap')!.get('sta-1')! - link.get('sta-1')!.get('ap')!))
  })

  it('the three model values, at every one of the places the lesson states them', () => {
    const faded = scene('uhr', 'mid', 'shadow', 1)
    for (const v of everyFig(/σ = (\d+) 分贝/g, 'the shadowing sigma', 2)) {
      expect(val(v), 'the sigma this lesson’s own faded scene switches on')
        .toBe(faded.fading!.shadowSigmaDb)
    }
    for (const v of everyFig(/相干时间 (\d+) 毫秒|(\d+) 毫秒相干时间/g, 'the coherence time', 2)) {
      expect(val(v), 'the coherence time of that layer').toBe(faded.fading!.coherenceMs)
    }
    for (const v of everyFig(/留的? ?(\d+) 分贝余量/g, 'the margin the ladder is taken with', 2)) {
      expect(val(v), 'the margin every `mcsForRssi` call in this file is made with')
        .toBe(RATE_MARGIN_DB)
    }
  })
})
