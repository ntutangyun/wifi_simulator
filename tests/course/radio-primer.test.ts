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
import { WALL_LOSS_DB, buildLinkTable, pathLossDb, wallsCrossed } from '../../src/engine/propagation'
import { Simulation } from '../../src/engine/simulation'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import { lessonShapeSuite, runOf } from './kit'

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
/** The "The same laptop, four places" table: the decibels taken off, the RSSI, and the rate. */
const TABLE = [
  { off: '46.7', rssi: '-31.7', mbps: 172.1 },
  { off: '67.7', rssi: '-52.7', mbps: 129.0 },
  { off: '75.3 + 12', rssi: '-72.3', mbps: 34.4 },
  { off: '81.1 + 12', rssi: '-78.1', mbps: 17.2 },
]

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
