/**
 * Every empirical claim in "How loud a radio arrives", measured against the
 * lesson's own scenario — the walk through the flat that noise-floor,
 * decode-thresholds and mcs-ladder all share, so four lessons read one run.
 *
 * Re-paced on 2026-09-25 (batch A of the course re-pacing): the lesson is the
 * link budget alone now, so the pins for everything that left it went with the
 * prose. `noise-floor.test.ts` holds the kTB formula, the width table, the
 * mW-by-mW interference sum, the `linkBudget` widget and the two old quiz
 * questions — every one of them still asserted, just next door.
 *
 * What is new here is the flat as a figure. "The topology figure is the
 * scenario" below reads every node's x out of `primerScenario` and every link
 * label out of `pathLossDb` and `WALL_LOSS_DB`, so a picture that drifts from
 * the engine fails the suite rather than misleading a reader, and the geometry
 * checks are the two `tests/course/diagram.test.ts` makes of every figure:
 * nothing leaves the viewBox, and no label lands on another.
 *
 * "The budget as a procedure" holds each of the four steps against the engine
 * function it names, then re-runs the whole of it at all four places: what is
 * pinned is the rule, not one row.
 */
import { describe, it, expect } from 'vitest'
import { radioPrimer, radioPrimerTopology } from '../../src/course/tier1/radio-primer'
import { primerScenario, PRIMER_DISTANCES } from '../../src/course/tier1/radioLink'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { layoutDiagram, textBox, W, type Shape } from '../../src/course/diagram'
import type { Block } from '../../src/course/lessonKit'
import { linkBudget, BAND_EXTRA_LOSS_DB } from '../../src/course/widgetModel'
import {
  PL0_DB, WALL_LOSS_DB, buildLinkTable, pathLossDb, wallsCrossed,
} from '../../src/engine/propagation'
import { freeSpacePl0Db } from '../../src/uwb/units'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, runOf } from './kit'
import { lessonTexts } from '../../src/course/readability'
import { selBinWidthMhz } from '../../src/engine/selectivity'

const MS = 1_000_000
/** Long enough for the "first 100 ms" observation; every run of this file shares it. */
const RUN_NS = 100 * MS
const mw = (dbm: number) => Math.pow(10, dbm / 10)
const dbm = (m: number) => 10 * Math.log10(m)

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (recs: TLRecord[], node: string, kind: string): Tx[] =>
  recs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === kind)
/** The records of variant `i`, from the kit's shared memo. */
const variantRecs = (i: number): TLRecord[] => runOf(radioPrimer, i, RUN_NS)

const wallsFor = (d: number) => (d > 5.5 ? (['brick'] as const) : ([] as const))
/**
 * The 「同一台笔记本，四个位置」 table, **read out of the lesson** rather than transcribed.
 *
 * It was transcribed until 2026-10-12, which made every assertion below it a pin on the engine
 * and none on the lesson: the four rows could be edited a digit at a time with the suite green
 * (`scripts/figure-planting.ts` planted six figures here and none of them reddened). Reading the
 * rows instead turned all of it into a read-back without changing a line of the assertions.
 */
const TABLE = ((): { off: string; rssi: string; mbps: number }[] => {
  const t = (radioPrimer.numbers ?? []).find(
    (b): b is Extract<Block, { kind: 'table' }> =>
      b.kind === 'table' && (b.heading ?? '').startsWith('同一台笔记本'))
  if (!t) throw new Error('the 「同一台笔记本，四个位置」 table is gone from `numbers`')
  return t.rows.map((r) => ({
    off: r[1],
    rssi: r[2].replace('−', '-').replace(' dBm', ''),
    mbps: Number(r[3].replace(' Mb/s', '')),
  }))
})()

// The contract every migrated lesson owes (tests/course/kit.ts).
lessonShapeSuite(radioPrimer, { runNs: RUN_NS })

describe('radio-primer · the opener of the Wi-Fi track', () => {
  it('opens the course, needs nothing, and owns the two words it can define here', () => {
    expect(radioPrimer.id).toBe('radio-primer')
    expect(COURSE_ORDER[0]).toBe('radio-primer')
    expect(MODULES[radioPrimer.module].title).toBe('信号与链路')
    // the one lesson the contract lets have an empty `needs`
    expect(radioPrimer.needs).toEqual([])
    // SINR left with the noise floor: a lesson that cannot compute the floor cannot
    // define a ratio above it, and `noise-floor` owns both.
    expect(radioPrimer.terms!.map((t) => t.term)).toEqual(['RSSI', 'SNR'])
  })

  it('walks the flat: 9 m to open, then 1, 5, 9 and 14 m on the centre line', () => {
    const pos = (s: Scenario) => {
      const ap = s.nodes.find((n) => n.id === 'ap')!.pos
      const sta = s.nodes.find((n) => n.id === 'sta-1')!.pos
      return Math.hypot(sta.x - ap.x, sta.y - ap.y, sta.z - ap.z)
    }
    expect(pos(radioPrimer.scenario())).toBeCloseTo(9, 12)
    expect(radioPrimer.variants!.map((v) => pos(v.scenario()))).toEqual(PRIMER_DISTANCES)
    expect(() => ScenarioSchema.parse(radioPrimer.scenario())).not.toThrow()
    for (const v of radioPrimer.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })
})

describe('radio-primer · what arrives', () => {
  it('the formula is the engine’s own path loss, and the steps price every wall', () => {
    // "RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ walls"; the note "Doubling the distance
    //  costs 9.0 dB, so one brick wall is worth moving two and a half times further away";
    //  and step 4 of the procedure, "plasterboard 5 dB, brick 12, glass 3".
    expect(pathLossDb(1)).toBeCloseTo(46.7, 12)
    expect((pathLossDb(2) - pathLossDb(1)).toFixed(1)).toBe('9.0')
    expect(pathLossDb(10) - pathLossDb(1)).toBeCloseTo(30, 9)
    expect(WALL_LOSS_DB).toEqual({ drywall: 5, brick: 12, glass: 3 })
    expect((pathLossDb(2.5) - pathLossDb(1)).toFixed(0)).toBe('12')
    // the caption's "plasterboard only takes 5, glass 3" against brick's 12
    expect(WALL_LOSS_DB.brick).toBeGreaterThan(WALL_LOSS_DB.drywall)
    expect(WALL_LOSS_DB.drywall).toBeGreaterThan(WALL_LOSS_DB.glass)
  })

  it('the four-place table is the link budget, the link table and the first frame, all agreeing', () => {
    // "The same laptop, four places": 46.7/67.7/75.3 + 12/81.1 + 12 dB off, −31.7/−52.7/−72.3/−78.1 dBm,
    //  172.1/129.0/34.4/17.2 Mb/s — and the observation "Jump to the first data frame in each
    //  of the four variants and read the rate".
    PRIMER_DISTANCES.forEach((d, i) => {
      const e = TABLE[i]
      const s = radioPrimer.variants![i].scenario()
      const walls = [...wallsFor(d)]
      const wallDb = walls.reduce((n, m) => n + WALL_LOSS_DB[m], 0)
      // the "decibels taken off" column, cell for cell
      expect(wallDb ? `${pathLossDb(d).toFixed(1)} + ${wallDb}` : pathLossDb(d).toFixed(1)).toBe(e.off)
      const lb = linkBudget({ txDbm: 15, distanceM: d, walls, widthMhz: 20, mode: 'eht' })
      expect(lb.rssiDbm).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(lb.rssiDbm.toFixed(1)).toBe(e.rssi)
      expect(lb.mbps).toBe(e.mbps)
      const data = txs(variantRecs(i), 'sta-1', 'data')
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].frame.mbps).toBe(e.mbps)
      // "Laptop, router and traffic are identical in all four": one 1530-octet frame throughout
      expect(data[0].frame.bytes).toBe(1530)
    })
    // "the difference is 46 dB of distance and brick"
    expect((Number(TABLE[0].rssi) - Number(TABLE[3].rssi)).toFixed(0)).toBe('46')
  })
})

/**
 * The flat, drawn. Every figure inside the picture is read back out of the spec
 * and compared with the scenario or with the engine, so the diagram is held to
 * the same rule as a table: it cannot drift from the simulator.
 */
describe('radio-primer · the topology figure is the scenario', () => {
  const spec = radioPrimerTopology()

  it('places the router and the four positions where the variants put them', () => {
    expect(spec.kind).toBe('topology')
    const ap = spec.nodes.find((n) => n.id === 'ap')!
    expect(ap.role).toBe('ap')
    expect(ap.x).toBe(primerScenario(9).nodes.find((n) => n.id === 'ap')!.pos.x)
    const places = spec.nodes.filter((n) => n.id !== 'ap')
    expect(places.map((n) => n.label)).toEqual(['书桌', '书房', '客厅', '墙边'])
    places.forEach((n, i) => {
      expect(n.role).toBe('sta')
      // the horizontal axis is the real metre mark of that variant's laptop
      expect(n.x, n.label).toBe(primerScenario(PRIMER_DISTANCES[i]).nodes.find((x) => x.id === 'sta-1')!.pos.x)
      // and the lanes are only there to keep four collinear boxes apart
      expect(n.y, n.label).toBe(i)
    })
  })

  it('labels each leg with what the engine takes off it, wall included', () => {
    // the caption: "the number on each line is the decibels this leg takes off the transmit
    //  power; the extra 12 on the last two is the brick wall between study and living room"
    expect(spec.links.map((l) => l.from)).toEqual(['ap', 'ap', 'ap', 'ap'])
    expect(spec.links.map((l) => l.to)).toEqual(['desk', 'study', 'living', 'far'])
    PRIMER_DISTANCES.forEach((d, i) => {
      const s = primerScenario(d)
      const crossed = wallsCrossed(
        s.nodes.find((n) => n.id === 'sta-1')!.pos, s.nodes.find((n) => n.id === 'ap')!.pos, s.walls)
      expect(crossed, `${d} m`).toEqual(d > 5.5 ? ['brick'] : [])
      const want = crossed.length ? `${pathLossDb(d).toFixed(1)}+${WALL_LOSS_DB.brick}` : pathLossDb(d).toFixed(1)
      expect(spec.links[i].label, `${d} m`).toBe(want)
    })
    expect(spec.links.map((l) => l.label)).toEqual(['46.7', '67.7', '75.3+12', '81.1+12'])
  })

  it('lays out inside the viewBox with no label on top of another', () => {
    // the two rules tests/course/diagram.test.ts makes of every figure in the course
    const { width, height, shapes } = layoutDiagram(spec)
    expect(width).toBe(W)
    const boxOf = (sh: Shape) => (sh.s === 'text'
      ? textBox(sh)
      : sh.s === 'rect'
        ? { x0: sh.x, y0: sh.y, x1: sh.x + sh.w, y1: sh.y + sh.h }
        : sh.s === 'line'
          ? { x0: Math.min(sh.x1, sh.x2), y0: Math.min(sh.y1, sh.y2), x1: Math.max(sh.x1, sh.x2), y1: Math.max(sh.y1, sh.y2) }
          : {
            x0: Math.min(...sh.points.map((p) => p[0])), y0: Math.min(...sh.points.map((p) => p[1])),
            x1: Math.max(...sh.points.map((p) => p[0])), y1: Math.max(...sh.points.map((p) => p[1])),
          })
    for (const sh of shapes) {
      const b = boxOf(sh)
      const what = sh.s === 'text' ? `"${sh.text}"` : sh.s
      expect(b.x0, `${what} left`).toBeGreaterThanOrEqual(0)
      expect(b.x1, `${what} right`).toBeLessThanOrEqual(width)
      expect(b.y0, `${what} top`).toBeGreaterThanOrEqual(0)
      expect(b.y1, `${what} bottom`).toBeLessThanOrEqual(height)
    }
    // and the five boxes stand clear of one another, which is the whole reason the four
    // collinear places are drawn on four lanes
    const boxes = shapes.filter((sh): sh is Extract<Shape, { s: 'rect' }> => sh.s === 'rect' && sh.stroke !== 'none')
    expect(boxes).toHaveLength(spec.nodes.length)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `box ${i}/${j}`).toBe(false)
      }
    }
    const ts = shapes.filter((s): s is Extract<Shape, { s: 'text' }> => s.s === 'text')
    const bs = ts.map(textBox)
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i]
        const b = bs[j]
        const hit = a.x0 + 0.5 < b.x1 && b.x0 + 0.5 < a.x1 && a.y0 + 0.5 < b.y1 && b.y0 + 0.5 < a.y1
        expect(hit, `"${ts[i].text}" overlaps "${ts[j].text}"`).toBe(false)
      }
    }
  })

  it('is the only diagram on the main path, and it is in the picture', () => {
    const diagrams = [...radioPrimer.picture!, ...radioPrimer.numbers!]
      .filter((b): b is Extract<Block, { kind: 'diagram' }> => b.kind === 'diagram')
    expect(diagrams).toHaveLength(1)
    expect(diagrams[0].spec).toEqual(spec)
    expect(radioPrimer.picture!.some((b) => b.kind === 'diagram')).toBe(true)
  })
})

describe('radio-primer · what the run shows', () => {
  it('353 frames acknowledged at the desk, 107 at the far wall, under a third as many', () => {
    // observe: "In the first 100 ms the router acknowledges 353 frames from the desk but only
    //  107 from the far wall, under a third as many."
    const acks = radioPrimer.variants!.map((_v, i) => txs(variantRecs(i), 'ap', 'ack').length)
    expect(acks[0]).toBe(353)
    expect(acks[3]).toBe(107)
    expect(acks[3] / acks[0]).toBeLessThan(1 / 3)
  })

  it('deeper: the router’s reply is 24 Mb/s and 28 µs, and only 12 Mb/s and 32 µs at the far wall', () => {
    // "24 Mb/s in the first three variants and 12 Mb/s only at the far wall, 28 µs of air
    //  against 32 µs … while the data frames stretch nearly sixfold."
    const acks = radioPrimer.variants!.map((_v, i) => txs(variantRecs(i), 'ap', 'ack')[0].frame)
    expect(acks.map((f) => f.mbps)).toEqual([24, 24, 24, 12])
    expect(acks.map((f) => f.txTimeNs)).toEqual([28_000, 28_000, 28_000, 32_000])
    const data = radioPrimer.variants!.map((_v, i) => txs(variantRecs(i), 'sta-1', 'data')[0].frame.txTimeNs)
    expect(data[3] / data[0]).toBeGreaterThan(5)
    expect(data[3] / data[0]).toBeLessThan(6)
  })
})

describe('radio-primer · try this, and the quiz that follows it', () => {
  it('4.5 → 9 → 18 m with one brick wall: −63.3, −72.3, −81.4 dBm, the same step each time', () => {
    // "The received level reads −63.3, −72.3 and −81.4 dBm: the same step down for each doubling",
    //  and quiz 1, "doubling the distance is 30·log10(2) = 9.03 dB in this model".
    const rssi = [4.5, 9, 18].map((d) =>
      linkBudget({ txDbm: 15, distanceM: d, walls: ['brick'], widthMhz: 20, mode: 'eht' }).rssiDbm)
    expect(rssi.map((r) => r.toFixed(1))).toEqual(['-63.3', '-72.3', '-81.4'])
    expect((rssi[0] - rssi[1]).toFixed(1)).toBe('9.0')
    expect((rssi[1] - rssi[2]).toFixed(1)).toBe('9.0')
    expect((30 * Math.log10(2)).toFixed(2)).toBe('9.03')
    // the wrong options: 3 dB is a doubling of POWER, and 30 dB is a tenfold of distance
    expect((pathLossDb(10) - pathLossDb(1)).toFixed(0)).toBe('30')
  })

  it('brick swapped for glass in the living room: 9 dB back, −63.3 dBm and 86.0 Mb/s', () => {
    // "The received level rises to −63.3 dBm — the 4.5 m brick figure — and the frames speed up
    //  from 34.4 to 86.0 Mb/s", and quiz 2, "glass still takes 3 dB, so what is saved is 12 − 3".
    expect(WALL_LOSS_DB.brick - WALL_LOSS_DB.glass).toBe(9)
    const s = primerScenario(9)
    const i = s.walls.findIndex((w) => w.x1 === 6 && w.x2 === 6)
    expect(s.walls[i].material).toBe('brick')
    s.walls[i].material = 'glass'
    const lb = linkBudget({ txDbm: 15, distanceM: 9, walls: ['glass'], widthMhz: 20, mode: 'eht' })
    expect(lb.rssiDbm.toFixed(1)).toBe('-63.3')
    expect(lb.mbps).toBe(86.0)
    const data = txs([...new Simulation(s).runUntil(50 * MS).records], 'sta-1', 'data')
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((r) => r.frame.mbps === 86.0)).toBe(true)
  })
})

describe('radio-primer · the budget as a procedure', () => {
  it('the steps are the engine’s own order, and they end on the RSSI', () => {
    // "From the transmit power to the received level, step by step": transmit power, path loss,
    //  which walls the line crosses, and what each material costs. The floor, the SNR and the
    //  interference sum are `noise-floor`'s own procedure: this one ends where its scene does.
    const steps = radioPrimer.numbers!.find((b): b is Extract<Block, { kind: 'steps' }> => b.kind === 'steps')!
    expect(steps.items.length).toBe(4)
    const s = primerScenario(9)
    const sta = s.nodes.find((n) => n.id === 'sta-1')!
    const ap = s.nodes.find((n) => n.id === 'ap')!
    // 1. "Start at the sender's transmit power: this laptop's 15 dBm, the router's 20 dBm."
    expect(sta.txPowerDbm).toBe(15)
    expect(ap.txPowerDbm).toBe(20)
    // 2. "46.7 dB in the first metre, 30 dB more for every tenfold — 75.3 dB at 9 m."
    expect(pathLossDb(1)).toBeCloseTo(46.7, 12)
    expect((pathLossDb(90) - pathLossDb(9)).toFixed(0)).toBe('30')
    expect(pathLossDb(9).toFixed(1)).toBe('75.3')
    // 3. "which walls the straight line crosses, by a 2-D ray on the plan"
    expect(wallsCrossed(sta.pos, ap.pos, s.walls)).toEqual(['brick'])
    // 4. "take each one off by its material … one brick wall leaves −72.3 dBm, the RSSI"
    const rssi = sta.txPowerDbm - pathLossDb(9) - WALL_LOSS_DB.brick
    expect(rssi).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
    expect(rssi.toFixed(1)).toBe('-72.3')
  })

  it('the procedure holds at all four places, not only the one it is worked at', () => {
    // Proving the rule rather than the row: run the four steps by hand at each distance and
    // land on the link table and on the four-place table, so the order is the engine's everywhere.
    PRIMER_DISTANCES.forEach((d, i) => {
      const s = radioPrimer.variants![i].scenario()
      const walls = [...wallsFor(d)].reduce((n, m) => n + WALL_LOSS_DB[m], 0)
      const rssi = 15 - pathLossDb(d) - walls
      expect(rssi).toBeCloseTo(buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!, 9)
      expect(rssi.toFixed(1)).toBe(TABLE[i].rssi)
    })
  })
})

describe('radio-primer · deeper: decibels', () => {
  it('the powers the paragraph names are the scenario’s own', () => {
    // "The router transmits 100 mW (20 dBm) and the laptop 31.6 mW (15 dBm); 9 m and one brick
    //  wall later that laptop is 5.85 × 10⁻⁸ mW, or −72.3 dBm, at the router."
    expect(dbm(100)).toBeCloseTo(20, 12)
    expect(dbm(31.6).toFixed(1)).toBe('15.0')
    expect(dbm(1)).toBe(0)
    expect(dbm(2).toFixed(2)).toBe('3.01')
    const s = primerScenario(9)
    expect(s.nodes.find((n) => n.id === 'ap')!.txPowerDbm).toBe(20)
    expect(s.nodes.find((n) => n.id === 'sta-1')!.txPowerDbm).toBe(15)
    const rssi = buildLinkTable(s.nodes, s.walls).get('sta-1')!.get('ap')!
    expect(rssi.toFixed(1)).toBe('-72.3')
    expect(mw(rssi).toExponential(2)).toBe('5.85e-8')
  })

  it('a 6 GHz link pays a further 1.2 dB, and both antennas stand 1 m up', () => {
    // "A 6 GHz link pays a further 1.2 dB … distance is three-dimensional, both antennas 1 m
    //  above the floor."
    expect(BAND_EXTRA_LOSS_DB['6g']).toBe(1.2)
    const s = primerScenario(9)
    expect(s.nodes.map((n) => n.pos.z)).toEqual([1, 1])
  })
})

/**
 * Slice 4a (2026-10-03) built frequency selectivity, so the limit that said this engine has none
 * is no longer true, and the sentence it used to carry is pinned as ABSENT so it cannot come back
 * with the next edit — the precedent is tests/course/uwb-rcm-validity.test.ts, where a limit
 * narrowed by a later slice is asserted in both directions.
 *
 * The bin width is read off `selectivity.ts` rather than typed a second time. The figures the
 * slice measured (the deepest bin, the combining loss, the five drop rates) are pinned where they
 * were measured — tests/engine/selectivity.test.ts and selectivity-inert.test.ts — and the
 * `width` lesson is the one that prints them.
 */
describe('radio-primer · the fading limit after frequency selectivity', () => {
  const text = radioPrimer.limits.map((l) => l.text).join('\n')

  it('names the per-bin draw at the engine’s own bin width', () => {
    expect(selBinWidthMhz()).toBe(2.03125)
    expect(text).toContain(`${selBinWidthMhz()} MHz 一格`)
    expect(text).toContain('26 音调资源单元')
    expect(text).toContain('selectivity')
  })

  it('no longer claims the simulator has no frequency selectivity at all', () => {
    expect(text).not.toContain('即便打开了衰落，也没有时延扩展与频率选择性')
  })

  it('still names what is missing, and the independence that overstates the diversity', () => {
    expect(text).toContain('时延扩展')
    expect(text).toContain('多普勒')
    expect(text).toContain('独立正是分集偏多的那一边')
  })

  it('「本课的场景两节都没有写」: neither section is in any scene this lesson runs', () => {
    for (const sc of [radioPrimer.scenario(), ...(radioPrimer.variants ?? []).map((v) => v.scenario())]) {
      expect(sc.selectivity).toBeUndefined()
      expect(sc.fading).toBeUndefined()
    }
  })
})

// --- every figure the lesson prints ------------------------------------------------------------

/**
 * **`TABLE` above used to be this lesson's own table, transcribed.** Four rows of 「the decibels
 * taken off, the RSSI, the rate」 typed on this side and compared with `linkBudget`, which pins
 * the engine and leaves the prose free: the figures in the lesson could be edited one digit at a
 * time with the suite still green. `scripts/figure-planting.ts` measured it on 2026-10-12 — six
 * planted, six unnoticed, 108 plantable figures. `TABLE` is now read out of the lesson, so every
 * assertion above it became a read-back without changing a line of it.
 *
 * What is left is everything the lesson prints outside that table, and nearly all of it is the
 * same four quantities restated: the path-loss law (in the formula, in `sources` and in `limits`),
 * the three wall materials (three times over), the two transmit powers, and the −72.3 dBm the
 * living-room link arrives at (six times over, in `deeper`, `tryThis` and the quiz). So each is
 * read at every one of its sites.
 */
describe('radio-primer · every figure the lesson prints, read back out of its own prose', () => {
  const EVERYWHERE = lessonTexts(radioPrimer).map((t) => t.text).join('\n')
  const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/−/g, '-'))
  const raw = (s: string, re: RegExp, what: string): string[] => {
    const m = re.exec(s)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
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
  const LAPTOP_DBM = 15
  const budgetAt = (d: number, walls: readonly ('brick' | 'drywall' | 'glass')[] = wallsFor(d)) =>
    linkBudget({ txDbm: LAPTOP_DBM, distanceM: d, walls: [...walls], widthMhz: 20, mode: 'eht' })

  it('the law, in the formula and wherever the lesson restates it', () => {
    const f = (radioPrimer.numbers ?? []).find(
      (b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')
    expect(f, 'the formula is gone from `numbers`').toBeDefined()
    const [pl0, exp, base, oneM] = figs(f!.text,
      /RSSI = P_tx − \(([\d.]+) \+ (\d+)·log(\d+)\(d \/ (\d+) m\)\) − Σ/, 'the law itself')
    expect(pathLossDb(oneM), 'the loss at one metre').toBeCloseTo(pl0, 12)
    expect(pathLossDb(base) - pathLossDb(oneM), 'and ten times further costs that')
      .toBeCloseTo(exp, 9)
    // 「距离翻倍要多损耗 9.0 dB」 and the quiz's 「30·log10(2) = 9.03 dB」
    same(raw(EVERYWHERE, /距离翻倍要多损耗 ([\d.]+) dB/, 'what doubling costs')[0],
      pathLossDb(2 * oneM) - pathLossDb(oneM), 'the cost of doubling')
    const [thirty, ten, two, nine] = figs(EVERYWHERE,
      /(\d+)·log(\d+)\((\d+)\) = ([\d.]+) dB/, 'the quiz’s own arithmetic for it')
    expect([thirty, ten, two], 'the exponent, the base and the factor').toEqual([exp, base, 2])
    same(String(nine), pathLossDb(2 * oneM) - pathLossDb(oneM), 'and what it comes to')
    // 「一米的 46.7 dB 与其后 3.0 的路径损耗指数」 — in `limits` and in `sources`
    for (const v of everyFig(/其后 ([\d.]+) 的路径损耗指数/g, 'the path-loss exponent', 2)) {
      expect(val(v) * 10, 'ten times the exponent is the decibels a decade costs').toBe(exp)
    }
    expect(figs(EVERYWHERE, /前者是 ([\d.]+) GHz 的自由空间损耗/, 'the band the constant is for')[0],
      'which is a 5 GHz band').toBeGreaterThan(5)
    /*
     * **The first metre itself, at every one of the three places it is printed.** The 「第」 rule
     * change of 2026-10-14 uncovered all three (「第一米 46.7 dB」 in the steps, 「第一米的
     * 46.7 dB」 in `limits` and again in `sources`): the figure was asserted twice in this file
     * against `pathLossDb(1)` — with a literal 46.7 typed on THIS side and the lesson's sentence
     * in the comment above it — so no printing of it was ever read.
     */
    for (const v of everyFig(/第一米的? ([\d.]+) dB/g, 'the loss of the first metre', 3)) {
      same(v, PL0_DB, 'the engine’s own loss at one metre')
    }
  })

  it('the three wall materials, at every one of the three places the lesson lists them', () => {
    const lists = [...EVERYWHERE.matchAll(
      /石膏板 (\d+) dB、砖墙 (\d+)(?: dB)?、玻璃 (\d+)/g)].map((m) => m.slice(1).map(val))
    expect(lists.length, 'the lesson lists the materials more than twice').toBeGreaterThan(2)
    for (const [drywall, brick, glass] of lists) {
      expect({ drywall, brick, glass }, 'the engine’s own wall table').toEqual(WALL_LOSS_DB)
    }
    // 「后两条多出来的 12，就是书房与客厅之间那堵砖墙」 — the figure caption
    for (const v of everyFig(/多出来的 (\d+)，就是书房与客厅之间那堵砖墙/g, 'the wall in the figure', 1)) {
      expect(val(v), 'that wall is brick').toBe(WALL_LOSS_DB.brick)
    }
    // the quiz: 「12 dB 的砖墙换成 3 dB 的玻璃」, 「省下的是 12 − 3 = 9 dB」
    const [brick, glass] = figs(EVERYWHERE, /(\d+) dB 的砖墙换成 (\d+) dB 的玻璃/,
      'the swap the quiz makes')
    expect([brick, glass], 'brick for glass').toEqual([WALL_LOSS_DB.brick, WALL_LOSS_DB.glass])
    const [b2, g2, saved] = figs(EVERYWHERE, /省下的是 (\d+) − (\d+) = (\d+) dB/,
      'what the swap saves')
    expect([b2, g2], 'the same two').toEqual([brick, glass])
    expect(b2 - g2, 'and the saving is their difference').toBe(saved)
  })

  it('the two transmit powers, and the decibel arithmetic `deeper` works in milliwatts', () => {
    const scen = radioPrimer.scenario()
    const powerOf = (id: string) => scen.nodes.find((n) => n.id === id)!.txPowerDbm
    const [laptop, router] = figs(EVERYWHERE,
      /这台笔记本 (\d+) dBm，路由器 (\d+) dBm/, 'the two powers the budget starts from')
    expect([laptop, router], 'what the two radios transmit at')
      .toEqual([powerOf('sta-1'), powerOf('ap')])
    expect(laptop, 'and the laptop is the one every row of the table is about').toBe(LAPTOP_DBM)
    // 「dB 是比值，10·log10(P1/P2)；dBm 是相对 1 mW 的功率」
    const [ten, base, p1, p2, mw1] = figs(EVERYWHERE,
      /dB 是比值，(\d+)·log(\d+)\(P(\d+)\/P(\d+)\)；dBm 是相对 (\d+) mW/, '`deeper` on the units')
    expect([ten, base, p1, p2, mw1], 'ten, base ten, the two powers and the milliwatt')
      .toEqual([10, 10, 1, 2, 1])
    expect(dbm(mw1), 'one milliwatt is zero dBm').toBeCloseTo(0, 12)
    // 「+3 dB 是功率翻倍，−3 dB 是减半，+10 dB 是乘以十」
    const [up, down, tenfold] = figs(EVERYWHERE,
      /\+(\d+) dB 是功率翻倍，−(\d+) dB 是减半，\+(\d+) dB 是乘以十/, '`deeper` on the three steps')
    expect(mw(up) / mw(0), 'three decibels is twice the power').toBeCloseTo(2, 2)
    expect(mw(-down) / mw(0), 'and minus three is half of it').toBeCloseTo(0.5, 2)
    expect(mw(tenfold) / mw(0), 'and ten decibels is ten times').toBeCloseTo(10, 9)
    // 「路由器发 100 mW（20 dBm），笔记本发 31.6 mW（15 dBm）」
    const [routerMw, routerDbm, laptopMw, laptopDbm] = raw(EVERYWHERE,
      /路由器发 ([\d.]+) mW（(\d+) dBm），笔记本发 ([\d.]+) mW（(\d+) dBm）/,
      '`deeper` on the two powers in milliwatts')
    expect([val(routerDbm), val(laptopDbm)], 'the same two powers').toEqual([router, laptop])
    same(routerMw, mw(val(routerDbm)), 'the router’s power in milliwatts')
    same(laptopMw, mw(val(laptopDbm)), 'and the laptop’s')
    // 「隔着 9 m 和一堵砖墙之后 … 只剩 5.85 × 10⁻⁸ mW，也就是 −72.3 dBm」
    const [metres, mant, pow, asDbm] = raw(EVERYWHERE,
      /隔着 (\d+) m 和一堵砖墙之后，这台笔记本在路由器处只剩 ([\d.]+) × (\d+)⁻⁸ mW，也就是 −([\d.]+) dBm/,
      '`deeper` on what arrives, in milliwatts')
    const rssi = budgetAt(val(metres)).rssiDbm
    same(`-${asDbm}`, rssi, 'the level that arrives')
    expect(val(pow), 'the power of ten it is written with').toBe(10)
    same(mant, mw(rssi) * 1e8, 'and the mantissa in front of it')
  })

  it('the four places: the distance column, the walls, and the level every other passage repeats', () => {
    const t = (radioPrimer.numbers ?? []).find(
      (b): b is Extract<Block, { kind: 'table' }> =>
        b.kind === 'table' && (b.heading ?? '').startsWith('同一台笔记本'))!
    expect(t.rows, 'the table still has its four places').toHaveLength(PRIMER_DISTANCES.length)
    t.rows.forEach((r, i) => {
      const d = PRIMER_DISTANCES[i]
      const [printed] = figs(r[0], /，(\d+) m/, `row ${i + 1}: the distance`)
      expect(printed, `row ${i + 1}: the distance this variant really puts the laptop at`).toBe(d)
      expect(/砖墙/.test(r[0]), `row ${i + 1}: 「砖墙」 exactly when the ray crosses one`)
        .toBe(wallsFor(d).length > 0)
    })
    // 「−30 dBm 是贴着路由器发送，−80 dBm 是隔着半间屋子」: the two ends of the scale `picture`
    // draws, which this lesson's own four places sit between.
    const [near, far] = figs(EVERYWHERE,
      /−(\d+) dBm 是贴着路由器发送，−(\d+) dBm 是隔着半间屋子/, '`picture` on the scale')
    const levels = PRIMER_DISTANCES.map((d) => budgetAt(d).rssiDbm)
    expect(Math.max(...levels), 'the closest place is below the top of the scale')
      .toBeLessThan(-near)
    expect(Math.min(...levels), 'and the furthest is above its bottom').toBeGreaterThan(-far)
    // 「9 m 处共 75.3 dB」 and 「剩下 −72.3 dBm」
    const [metres, loss] = raw(EVERYWHERE, /距离每涨十倍再减 \d+ dB——(\d+) m 处共 ([\d.]+) dB/,
      'the loss the steps work out')
    same(loss, pathLossDb(val(metres)), 'the path loss at that distance')
    same(`-${raw(EVERYWHERE, /只穿一堵砖墙，剩下 −([\d.]+) dBm/, 'what is left after the wall')[0]}`,
      budgetAt(val(metres)).rssiDbm, 'the RSSI of the living-room link')
    /*
     * Every 「−N dBm」 the lesson prints — `picture`'s two ends of the scale, the table, `deeper`,
     * `tryThis` twice and the quiz four times — is a level one of the seven links THIS LESSON
     * works really produces. (The captures are the magnitudes: the sign is outside them.)
     *
     * The seven are the lesson's own: the four places behind whatever wall stands there, the two
     * ends of the `tryThis` walk, and the living room with the brick swapped for glass. An
     * earlier version of this allowed every distance crossed with every material, and that set
     * was wide enough to swallow a planting: 18 m behind glass is −72.36 dBm, which renders
     * −72.4, so the quiz's −72.3 could be edited to −72.4 and stay green. A membership test is
     * only as good as the narrowest set that still contains every figure.
     */
    const walk = figs(radioPrimer.tryThis.join('\n'),
      /从 ([\d.]+) m 挪到 (\d+) m，再挪到 (\d+) m/, 'the walk `tryThis` sends the reader on')
    const links: [number, readonly ('brick' | 'glass')[]][] = [
      ...PRIMER_DISTANCES.map((d) => [d, wallsFor(d)] as [number, readonly 'brick'[]]),
      ...walk.map((d) => [d, ['brick']] as [number, readonly 'brick'[]]),
      [PRIMER_DISTANCES[2], ['glass']],
    ]
    for (const v of everyFig(/−([\d.]+) dBm|−([\d.]+) 变成|变成 −([\d.]+) dBm/g,
      'a level in dBm', 8)) {
      const dp = (v.split('.')[1] ?? '').length
      const allowed = links.map(([d, w]) => Number(budgetAt(d, w).rssiDbm.toFixed(dp)))
        .concat([-near, -far])
      expect(allowed, `−${v} dBm is a level one of this lesson’s own links produces`)
        .toContain(-val(v))
    }
  })

  it('`tryThis` and the quiz: the walk down the centre line, and the glass swap', () => {
    const [d1, d2, d3] = figs(radioPrimer.tryThis.join('\n'),
      /从 ([\d.]+) m 挪到 (\d+) m，再挪到 (\d+) m/, 'the three places the reader walks to')
    expect([d2 / d1, d3 / d2], 'each one twice as far as the last').toEqual([2, 2])
    const levels = raw(radioPrimer.tryThis.join('\n'),
      /接收电平依次是 −([\d.]+)、−([\d.]+)、−([\d.]+) dBm/, 'the three levels')
    for (const [i, d] of [d1, d2, d3].entries()) {
      same(`-${levels[i]}`, budgetAt(d, ['brick']).rssiDbm, `${d} m behind one brick wall`)
    }
    /*
     * 「距离每翻一倍，衰减都是同一个台阶」. The step is identical in the model — it is
     * 30·log10(2) whatever the distance — and the printed levels are rounded to a decimal, so
     * their differences come out 9.0 and 9.1. So the claim is read both ways: exactly on the
     * levels the engine computes, and to the decibel on the ones the lesson prints.
     */
    const exact = [d1, d2, d3].map((d) => budgetAt(d, ['brick']).rssiDbm)
    expect(exact[0] - exact[1], 'the step is the same at every distance')
      .toBeCloseTo(exact[1] - exact[2], 9)
    const steps = [val(levels[1]) - val(levels[0]), val(levels[2]) - val(levels[1])]
    for (const st of steps) {
      expect(Math.round(st), 'and the printed levels show the same step, to the decibel')
        .toBe(Math.round(exact[0] - exact[1]))
    }
    // the glass swap: 「升到 −63.3 dBm——正是 4.5 m 隔砖墙时的那个数——帧速率也从 34.4 升到 86.0」
    const [glassDbm, sameAs, was, now] = raw(radioPrimer.tryThis.join('\n'),
      /升到 −([\d.]+) dBm——正是 ([\d.]+) m 隔砖墙时的那个数——帧速率也从 ([\d.]+) Mb\/s 升到 ([\d.]+) Mb\/s/,
      'the glass swap')
    const livingRoom = PRIMER_DISTANCES[2]
    same(`-${glassDbm}`, budgetAt(livingRoom, ['glass']).rssiDbm,
      'what glass leaves at the living room')
    same(`-${glassDbm}`, budgetAt(val(sameAs), ['brick']).rssiDbm,
      'which is the level the shorter link has through brick')
    expect(budgetAt(livingRoom).mbps, 'the rate through brick').toBe(val(was))
    expect(budgetAt(livingRoom, ['glass']).mbps, 'and the rate through glass').toBe(val(now))
    // the quiz's own two answers: 「约 9 dB」 for the move, 「9 dB」 for the swap
    for (const v of everyFig(/约 (\d+) dB：这个模型里距离每翻一倍|= (\d+) dB：−/g,
      'the nine decibels both answers turn on', 2)) {
      expect(val(v), 'which is what doubling costs, to the decibel')
        .toBe(Math.round(pathLossDb(2) - pathLossDb(1)))
    }
  })

  it('`observe` and `deeper`: the two counts, the four rates, and the reply', () => {
    const obs = radioPrimer.observe.join('\n')
    const rates = figs(obs, /的速率：([\d.]+)、([\d.]+)、([\d.]+)、([\d.]+) Mb\/s/,
      'the four rates `observe` sends the reader to read')
    PRIMER_DISTANCES.forEach((d, i) => {
      expect(rates[i], `${d} m: the rate the first frame goes at`).toBe(budgetAt(d).mbps)
    })
    const [ms, desk, far] = figs(obs,
      /前 (\d+) ms 里，路由器确认了书桌位置的 (\d+) 帧，远端墙边却只有 (\d+) 帧/,
      'the two counts it names')
    expect(ms * MS, 'the window those counts are taken over').toBe(RUN_NS)
    const acked = (i: number): number =>
      txs(variantRecs(i), 'ap', 'ack').length
    expect(desk, 'what the router acknowledged at the desk').toBe(acked(0))
    expect(far, 'and at the far wall').toBe(acked(3))
    expect(far * 3, '「不到三分之一」').toBeLessThan(desk)
    // 「差别全在那 46 dB 的距离与砖墙」
    const [gap] = figs(obs, /那 (\d+) dB 的距离与砖墙/, 'the gap between the two places')
    expect(Math.round(budgetAt(PRIMER_DISTANCES[0]).rssiDbm - budgetAt(PRIMER_DISTANCES[3]).rssiDbm),
      'which is the difference of the two levels').toBe(gap)
    // `deeper` on the reply: 「前三个变体都是 24 Mb/s，只有到远端墙边才降到 12 Mb/s，28 µs 对 32 µs」
    const [fast, slow, fastUs, slowUs] = figs(EVERYWHERE,
      /前三个变体都是 (\d+) Mb\/s，只有到远端墙边才降到 (\d+) Mb\/s，空口时间 (\d+) µs 对 (\d+) µs/,
      '`deeper` on the router’s reply')
    const ackOf = (i: number) => txs(variantRecs(i), 'ap', 'ack')[0].frame
    for (const i of [0, 1, 2]) {
      expect(ackOf(i).mbps, `variant ${i + 1}: the reply’s rate`).toBe(fast)
    }
    expect(ackOf(3).mbps, 'and at the far wall it drops').toBe(slow)
    same(String(fastUs), ackOf(0).txTimeNs / 1000, 'how long the faster reply takes')
    same(String(slowUs), ackOf(3).txTimeNs / 1000, 'and the slower one')
    // 「两端的天线都在地面以上 1 m」 and 「6 GHz 链路还要再多 1.2 dB」
    const [height] = figs(EVERYWHERE, /两端的天线都在地面以上 (\d+) m/, 'the antenna height')
    for (const n of radioPrimer.scenario().nodes) {
      expect(n.pos.z, `${n.id} stands that high`).toBe(height)
    }
    for (const v of everyFig(/(?:再多|多付的) ([\d.]+) dB/g, 'what a 6 GHz link pays', 2)) {
      same(v, BAND_EXTRA_LOSS_DB['6g'], 'the extra loss of the higher band')
    }
  })

  /**
   * **The first pass left eighteen sites unread, and twelve of them were in the quiz's own
   * options and explanations** — the place a reader is most likely to take a figure from, and the
   * place this course's tests have always been thinnest. The rest: the two ends of the scale
   * `picture` draws, the decade of distance where `numbers` restates it, the two 「6 GHz」 and the
   * one 「5.2 GHz」.
   */
  it('the figures the quiz, the scale and the two band names print, at every one of their sites', () => {
    const quiz = radioPrimer.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
    const decade = pathLossDb(10) - pathLossDb(1)
    const step = pathLossDb(2) - pathLossDb(1)
    // 「−30 dBm 是贴着路由器发送，−80 dBm 是隔着半间屋子」: the two ends of the scale are this
    // flat's own extremes, each rounded to the nearest ten decibels.
    const [near, far] = figs(EVERYWHERE,
      /−(\d+) dBm 是贴着路由器发送，−(\d+) dBm 是隔着半间屋子/, '`picture` on the scale')
    const tens = (x: number): number => Math.round(x / 10) * 10
    const levels = PRIMER_DISTANCES.map((d) => budgetAt(d).rssiDbm)
    expect(-near, 'the top of the scale is the desk, to the ten').toBe(tens(Math.max(...levels)))
    expect(-far, 'and the bottom is the far wall').toBe(tens(Math.min(...levels)))
    // the decade of distance: `numbers` restates it, and the quiz argues about it twice
    for (const v of everyFig(
      /距离每涨十倍再减 (\d+) dB|(\d+) dB：公式里写着 (\d+)|(\d+) 是距离涨十倍对应的分贝/g,
      'the decibels a decade of distance costs', 4)) {
      same(v, decade, 'what ten times the distance costs')
    }
    // 「约 9 dB」 and 「这个模型里距离每翻一倍就是 9.0 dB」: the step, to its own decimals
    for (const v of everyFig(/距离每翻一倍就是 ([\d.]+) dB/g, 'the step the quiz explains', 1)) {
      same(v, step, 'what doubling the distance costs')
    }
    // 「3 dB：距离翻倍，功率减半」 is a wrong answer, and the figure in it is right about
    // something else: halving a power IS 3 dB. What makes it wrong is the exponent — this model
    // charges three decades of spreading, not two — so both halves are read.
    for (const v of everyFig(/(\d+) dB：距离翻倍，功率减半/g, 'the wrong answer’s own figure', 1)) {
      expect(val(v), 'halving a power is that many decibels').toBe(Math.round(-dbm(0.5)))
      expect(val(v), 'and it is less than this model charges for doubling the distance')
        .toBeLessThan(step)
    }
    // the quiz's own walk, and the wall swap in its second question
    const [from, to] = figs(quiz, /笔记本从 ([\d.]+) m 挪到 (\d+) m/, 'the move the quiz asks about')
    expect(to / from, 'twice as far').toBe(2)
    same(`-${raw(quiz, /= [\d.]+ dB，−([\d.]+) 变成/, 'where that move starts')[0]}`,
      budgetAt(from, ['brick']).rssiDbm, 'the level before the move')
    for (const v of everyFig(/升高 (\d+) dB：\d+ dB 的砖墙换成/g, 'what the swap gains', 1)) {
      expect(val(v), 'brick less glass').toBe(WALL_LOSS_DB.brick - WALL_LOSS_DB.glass)
    }
    for (const v of everyFig(/升高 (\d+) dB：那堵墙整个没了/g, 'the wrong answer’s own figure', 1)) {
      expect(val(v), 'which is the whole brick wall, not the difference')
        .toBe(WALL_LOSS_DB.brick)
    }
    for (const v of everyFig(/玻璃仍要拿走 (\d+) dB/g, 'what glass still takes', 1)) {
      expect(val(v), 'the glass wall').toBe(WALL_LOSS_DB.glass)
    }
    // 「6 GHz 链路还要再多 1.2 dB」 and `sources` saying it again: the band and its own extra
    const bands = [...EVERYWHERE.matchAll(/(\d) GHz (?:链路还要再多|多付的) ([\d.]+) dB/g)]
    expect(bands.length, 'the lesson names that band more than once').toBeGreaterThan(1)
    for (const m of bands) {
      const key = `${m[1]}g` as keyof typeof BAND_EXTRA_LOSS_DB
      expect(BAND_EXTRA_LOSS_DB, `${m[1]} GHz is a band this engine has`).toHaveProperty(key)
      same(m[2], BAND_EXTRA_LOSS_DB[key], `what a ${m[1]} GHz link pays`)
    }
    // 「前者是 5.2 GHz 的自由空间损耗」: the carrier that reproduces the engine's own first metre
    // 「前者是 5.2 GHz 的自由空间损耗」, and `sources` says it again in its own words — the
    // second printing was its own unread site until the 「第」 sweep of 2026-10-14.
    for (const g of everyFig(/是 ([\d.]+) GHz 的自由空间损耗/g,
      'the carrier the lesson says the constant is for', 2)) {
      expect(Math.abs(freeSpacePl0Db(val(g) * 1000) - PL0_DB),
        `free space at ${g} GHz is this engine’s own loss at one metre`).toBeLessThan(0.1)
    }
  })
})
