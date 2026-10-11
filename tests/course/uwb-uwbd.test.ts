/**
 * Every empirical claim in "不靠那部窄带电台": the two control planes, what each one costs in slots,
 * the 14.54 dB an SP0 packet is behind a fragment by, and what the two anchors of the scene
 * actually measure under each of the three shapes.
 *
 * The levels and the reaches are computed from the engine's own exported constants and its own
 * path-loss law rather than re-typed here, and every count and every instant is read out of a run
 * over one 200 ms ranging block. Nothing below asserts on how a sentence is written.
 */
import { describe, it, expect } from 'vitest'
import {
  UWBD_ANCHORS, UWBD_TAG_X, UWBD_Z, uwbUwbd, uwbUwbdHeadFields, uwbUwbdScenario,
} from '../../src/course/uwb/uwb-uwbd'
import { ScenarioSchema } from '../../src/model/scenario'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import {
  MMS_DRAFT_DEFAULTS, MMS_SP0_NS, MMS_SP0_PENALTY_DB, MMS_SP0_RX_SENS_DBM, MMS_SP0_SEGMENT_NS,
  combineGainDb, mmsFragmentDbm, mmsLayout, rsfNs, type MmsPhy,
} from '../../src/uwb/mms'
import { UWB_TX_POWER_DBM, uwbPathLossDb, uwbPl0Db } from '../../src/uwb/phy'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'

const MS = 1_000_000
/** One 200 ms ranging block, and nothing of the next: every count below is per block. */
const BLOCK_NS = 200 * MS

lessonShapeSuite(uwbUwbd)

/** The variant indices, named. */
const NBA = 0
const NONE = 1

describe('uwb-uwbd · where it sits', () => {
  it('is the first lesson of the UWB-driven half, right after the narrowband pair', () => {
    expect(MODULES[uwbUwbd.module].title).toBe('另一种控制面与子轮')
    // The narrowband pair became a trio when `uwb-ssbd` landed (the §10.45 deferral that closes
    // the listen-before-talk story `uwb-nba-coexist` opens), so this names the lesson it now
    // follows AND keeps the original claim — it is still after the narrowband lessons, not before.
    expect(COURSE_ORDER.indexOf('uwb-uwbd')).toBe(COURSE_ORDER.indexOf('uwb-ssbd') + 1)
    expect(COURSE_ORDER.indexOf('uwb-uwbd')).toBeGreaterThan(COURSE_ORDER.indexOf('uwb-nba-coexist'))
    expect(COURSE_ORDER.indexOf('uwb-uwbd')).toBeLessThan(COURSE_ORDER.indexOf('uwb-capstone'))
    expect(uwbUwbd.needs).toEqual(['uwb-mms', 'uwb-nba'])
  })

  it('offers the other two control planes as its variants, and every scene is legal', () => {
    expect(uwbUwbd.variants?.length).toBe(2)
    for (const sc of [uwbUwbd.scenario(), ...uwbUwbd.variants!.map((v) => v.scenario())]) {
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    }
    // Config 1 carries no narrowband settings at all, and Config 2 keeps its UNII-3 channel.
    const base = uwbUwbdScenario('base').uwb!.mms
    expect([base.control, base.uwbdControl, base.nbChannels, base.nbLbt]).toEqual(['uwbd', 'sp0', [], 'off'])
    expect(uwbUwbdScenario('none').uwb!.mms.uwbdControl).toBe('none')
    expect(uwbUwbdScenario('nba').uwb!.mms.control).toBe('nba')
    expect(uwbUwbdScenario('nba').uwb!.mms.nbChannels).toEqual([3])
  })

  it('puts the two anchors on the tag’s own line, so 10 m is 10 m', () => {
    const sc = uwbUwbdScenario('base')
    const tag = sc.nodes.find((n) => n.id === 'tag-1')!
    for (const a of UWBD_ANCHORS) {
      const n = sc.nodes.find((x) => x.id === a.id)!
      expect(n.pos.y).toBe(tag.pos.y)
      expect(n.pos.z).toBe(UWBD_Z)
      expect(n.pos.x - UWBD_TAG_X).toBe(a.x - UWBD_TAG_X)
    }
    expect(UWBD_ANCHORS.map((a) => a.x - UWBD_TAG_X)).toEqual([10, 20])
  })
})

// --- the slot arithmetic the first table states ------------------------------------------------

describe('uwb-uwbd · the same round, three control planes', () => {
  const phy = (over: Partial<MmsPhy> = {}): MmsPhy => ({
    rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS, ...over,
  })

  it('costs 28, 24 and 22 slots, and the report phase never goes to zero', () => {
    const planes: [Partial<MmsPhy>, number[]][] = [
      [{ control: 'nba' }, [2, 4, 4, 28]],
      [{ control: 'uwbd', uwbdControl: 'sp0' }, [1, 2, 2, 24]],
      [{ control: 'uwbd', uwbdControl: 'none' }, [0, 0, 2, 22]],
    ]
    for (const [over, want] of planes) {
      const l = mmsLayout(phy(over), 1)
      expect([l.windowSlots, l.controlSlots, l.reportSlots, l.slots], JSON.stringify(over)).toEqual(want)
      expect(l.reportSlots).toBeGreaterThan(0)
    }
  })
})

// --- the 14.54 dB -------------------------------------------------------------------------------

describe('uwb-uwbd · what an SP0 packet is behind a fragment by', () => {
  const FRAG_NS = rsfNs(40, 64)
  const pl0 = uwbPl0Db(9)
  /** The largest distance at which `tx` still clears `sens` under this channel's free-space law. */
  const reach = (tx: number, sens: number): number => {
    let lo = 0.5
    let hi = 4000
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2
      if (tx - uwbPathLossDb(pl0, m, 0) >= sens) lo = m
      else hi = m
    }
    return lo
  }

  it('is 10.54 dB of transmit power and 4 dB of threshold', () => {
    expect(FRAG_NS).toBe(82_051)
    expect(mmsFragmentDbm(FRAG_NS)).toBeCloseTo(-3.46, 2)
    expect(UWB_TX_POWER_DBM).toBe(-14)
    expect(mmsFragmentDbm(FRAG_NS) - UWB_TX_POWER_DBM).toBeCloseTo(10.54, 2)
    expect(MMS_SP0_PENALTY_DB).toBe(4)
    expect(MMS_SP0_RX_SENS_DBM).toBe(UWB_RX_SENS_DBM + MMS_SP0_PENALTY_DB)
    expect(MMS_SP0_RX_SENS_DBM).toBe(-89)
    expect(UWB_RX_SENS_DBM).toBe(-93)
  })

  it('arrives as the level ledger says at 10 m and at 20 m', () => {
    const frag = mmsFragmentDbm(FRAG_NS)
    const rows: [number, number[]][] = [
      [10, [70.50, -73.95, -64.92, -84.50]],
      [20, [76.52, -79.98, -70.94, -90.52]],
    ]
    for (const [d, [loss, fragRx, trainRx, sp0Rx]] of rows) {
      const L = uwbPathLossDb(pl0, d, 0)
      expect(L, `${d} m loss`).toBeCloseTo(loss, 2)
      expect(frag - L, `${d} m fragment`).toBeCloseTo(fragRx, 2)
      expect(frag - L + combineGainDb(8), `${d} m train`).toBeCloseTo(trainRx, 2)
      expect(UWB_TX_POWER_DBM - L, `${d} m SP0`).toBeCloseTo(sp0Rx, 2)
    }
    // …and the 20 m anchor is on the far side of the SP0 threshold by 1.52 dB, the 10 m one on
    // this side by 4.50 dB. That sign change is the whole lesson.
    expect(UWB_TX_POWER_DBM - uwbPathLossDb(pl0, 10, 0) - MMS_SP0_RX_SENS_DBM).toBeCloseTo(4.50, 2)
    expect(UWB_TX_POWER_DBM - uwbPathLossDb(pl0, 20, 0) - MMS_SP0_RX_SENS_DBM).toBeCloseTo(-1.52, 2)
  })

  it('reaches 16.80 m, against 89.59 m for one fragment and 253.41 m for eight', () => {
    expect(reach(UWB_TX_POWER_DBM, MMS_SP0_RX_SENS_DBM)).toBeCloseTo(16.80, 2)
    expect(reach(mmsFragmentDbm(FRAG_NS), UWB_RX_SENS_DBM)).toBeCloseTo(89.59, 2)
    expect(reach(mmsFragmentDbm(FRAG_NS), UWB_RX_SENS_DBM - combineGainDb(8))).toBeCloseTo(253.41, 2)
  })
})

// --- what the three runs measure ---------------------------------------------------------------

describe('uwb-uwbd · what the three control planes measure in one block', () => {
  const ranges = (variant?: number) => ofType(runOf(uwbUwbd, variant, BLOCK_NS), 'UWB_RANGE')
  const trains = (variant?: number) => ofType(runOf(uwbUwbd, variant, BLOCK_NS), 'UWB_MMS_TRAIN')

  it('gives Config 2 four distances and each Config 1 shape two', () => {
    expect(ranges(NBA)).toHaveLength(4)
    expect(ranges()).toHaveLength(2)
    expect(ranges(NONE)).toHaveLength(2)
    // Which anchor each range belongs to, whichever end computed it: Config 2 reaches both, and
    // either Config 1 shape reaches only the near one.
    const anchorsOf = (variant?: number): string[] =>
      [...new Set(ranges(variant).map((r) => (r.node === 'tag-1' ? r.peer : r.node)))].sort()
    expect(anchorsOf(NBA)).toEqual(['anchor-1', 'anchor-2'])
    expect(anchorsOf()).toEqual(['anchor-1'])
    expect(anchorsOf(NONE)).toEqual(['anchor-1'])
  })

  it('under SP0, the far anchor is never told there is a peer, so no fragment goes out', () => {
    const rs = runOf(uwbUwbd, undefined, BLOCK_NS)
    // No SP0 packet of the tag's ever reaches it…
    expect(rs.some((r) => r.type === 'RX_OK' && r.node === 'anchor-2')).toBe(false)
    // …so it transmits nothing at all, and neither end ever evaluates a train against it.
    expect(rs.some((r) => r.type === 'TX_START' && r.node === 'anchor-2')).toBe(false)
    expect(trains().some((t) => t.node === 'anchor-2' || t.peer === 'anchor-2')).toBe(false)
    // The near anchor, by contrast, gets its SP0 packets and its trains.
    expect(rs.some((r) => r.type === 'RX_OK' && r.node === 'anchor-1' && r.frame.kind === 'uwbSp0')).toBe(true)
  })

  it('under a zero-length control phase the far anchor’s train IS detected — and still no range', () => {
    const far = trains(NONE).filter((t) => t.node === 'anchor-2' || t.peer === 'anchor-2')
    expect(far.length).toBeGreaterThan(0)
    for (const t of far) {
      expect(t.heard).toBe(8)
      expect(t.detected).toBe(true)
      expect(t.rxDbm).toBeCloseTo(-79.98, 2)
      expect(t.marginDb).toBeCloseTo(22.06, 2)
    }
    // The failure moved to the report: an SP0 REPORT on the same −89 dBm threshold.
    expect(ranges(NONE).some((r) => r.peer === 'anchor-2' || r.node === 'anchor-2')).toBe(false)
    const timeouts = ofType(runOf(uwbUwbd, NONE, BLOCK_NS), 'UWB_TIMEOUT')
    expect(timeouts.some((r) => r.node === 'tag-1' && r.peer === 'anchor-2')).toBe(true)
  })

  it('reads the near anchor’s train the same way whichever control plane carried the round', () => {
    for (const v of [undefined, NBA, NONE]) {
      const near = trains(v).filter((t) => t.node === 'anchor-1' || t.peer === 'anchor-1')
      expect(near.length, String(v)).toBeGreaterThan(0)
      for (const t of near) {
        expect(t.rxDbm, String(v)).toBeCloseTo(-73.95, 2)
        expect(t.marginDb, String(v)).toBeCloseTo(28.08, 2)
        expect(t.detected).toBe(true)
      }
    }
  })

  it('puts SP0 packets where Config 2 puts narrowband messages, and never both', () => {
    const kinds = (variant?: number): Set<string> => new Set(
      runOf(uwbUwbd, variant, BLOCK_NS)
        .flatMap((r) => (r.type === 'TX_START' ? [r.frame.kind] : [])),
    )
    expect(kinds().has('uwbSp0')).toBe(true)
    for (const k of ['nbPoll', 'nbResp', 'nbReport']) expect(kinds().has(k), k).toBe(false)
    expect(kinds(NBA).has('uwbSp0')).toBe(false)
    for (const k of ['nbPoll', 'nbResp', 'nbReport']) expect(kinds(NBA).has(k), k).toBe(true)
    // With no control phase the only SP0 packets left are the two REPORTs.
    const roles = new Set(runOf(uwbUwbd, NONE, BLOCK_NS)
      .flatMap((r) => (r.type === 'TX_START' && r.frame.kind === 'uwbSp0' ? [r.frame.uwb?.sp0?.role] : [])))
    expect([...roles]).toEqual(['report'])
  })

  it('sends an SP0 packet of 117.6 µs where Config 2 sends 576 and 608 µs of narrowband', () => {
    const air = (variant: number | undefined, kind: string): number[] => [...new Set(
      runOf(uwbUwbd, variant, BLOCK_NS)
        .flatMap((r) => (r.type === 'TX_START' && r.frame.kind === kind ? [r.frame.txTimeNs] : [])),
    )]
    expect(air(undefined, 'uwbSp0')).toEqual([MMS_SP0_NS])
    expect(MMS_SP0_NS).toBe(117_600)
    expect(air(NBA, 'nbPoll')).toEqual([576_000])
    expect(air(NBA, 'nbResp')).toEqual([576_000])
    expect(air(NBA, 'nbReport')).toEqual([608_000])
  })

  it('runs its rounds at the length the layout promised: 14, 12 and 11 ms', () => {
    for (const [v, ms] of [[NBA, 14], [undefined, 12], [NONE, 11]] as const) {
      const rounds = ofType(runOf(uwbUwbd, v, BLOCK_NS), 'UWB_ROUND').filter((r) => r.block === 0)
      expect(rounds.length, String(v)).toBe(2)
      expect(rounds[1].t - rounds[0].t, String(v)).toBe(ms * MS)
    }
  })
})

// --- the figure -------------------------------------------------------------------------------

describe('uwb-uwbd · the packet figure comes from the engine', () => {
  it('draws the SP0 segments and then the leading fragment, to scale', () => {
    const spec = uwbUwbdHeadFields()
    expect(spec.unit).toBe('µs')
    const sizes = spec.fields.map((f) => f.size)
    const s = MMS_SP0_SEGMENT_NS
    expect(sizes).toEqual([s.sync / 1000, s.sfd / 1000, s.phr / 1000, s.psdu / 1000, rsfNs(40, 64) / 1000])
    expect(sizes.slice(0, 4).reduce((a, b) => a + b, 0)).toBeCloseTo(MMS_SP0_NS / 1000, 6)
    expect(MMS_SP0_NS).toBe(117_600)
  })
})

/**
 * **The lesson's three figure tables and its 14.54 dB formula, read back out of the lesson.**
 *
 * Every assertion above measures the engine and compares it with a literal written here, with the
 * lesson's row quoted in a comment. `@uwb-uwbd` prints 54 hand-typed figures into its graded prose
 * and was on the list of lessons whose test never touched it
 * (`tests/course/prose-readback.test.ts`). The figures were all exact; this is the other half.
 */
describe('uwb-uwbd · the printed tables and the formula are read back out of the lesson', () => {
  const rowsOf = (fragment: string): string[][] => {
    const b = uwbUwbd.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return (b as Extract<typeof b, { kind: 'table' }>).rows
  }
  /** The figure a cell opens with, full-width minus included: 「−73.95 dBm」 → −73.95. */
  const num = (s: string): number =>
    Number(/^[−-]?[\d.]+/.exec(s.trim().replace(/−/g, '-'))?.[0] ?? NaN)
  const PHY = (over: Partial<MmsPhy> = {}): MmsPhy => ({
    rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS, ...over,
  })
  /** Each control-plane row of the lesson against the phy override that builds it. */
  const PLANES: readonly (readonly [string, Partial<MmsPhy>, number | undefined])[] = [
    ['窄带辅助（Config 2）', { control: 'nba' }, NBA],
    ['UWB 驱动 + SP0', { control: 'uwbd', uwbdControl: 'sp0' }, undefined],
    ['UWB 驱动 + 零长', { control: 'uwbd', uwbdControl: 'none' }, NONE],
  ]

  it('the slot table: window, control, report and the round, in slots and in milliseconds', () => {
    const rows = rowsOf('同一轮，三种控制面')
    expect(rows.map((r) => r[0]), 'the three control planes the lesson tabulates')
      .toEqual(PLANES.map(([label]) => label))
    for (const [i, [label, over]] of PLANES.entries()) {
      const l = mmsLayout(PHY(over), 1)
      const row = rows[i]
      expect(num(row[1]), `${label}: the window in slots`).toBe(l.windowSlots)
      expect(num(row[2]), `${label}: the control phase`).toBe(l.controlSlots)
      expect(num(row[3]), `${label}: the report phase`).toBe(l.reportSlots)
      const round = /^(\d+) 时隙 · (\d+) ms$/.exec(row[4])
      expect(round, `${label}: the round cell is not 「n 时隙 · m ms」`).not.toBeNull()
      expect(Number(round![1]), `${label}: the round in slots`).toBe(l.slots)
      expect(Number(round![2]), `${label}: and the same round in milliseconds`)
        .toBe(l.slots * PHY(over).gapMs / 2)
      // the paragraph under the table: the report phase never goes to zero, however the control
      // phase is configured — 「把控制那一对置零，并不说明报告那一对也是零」
      expect(l.reportSlots, `${label}: the report phase is never zero`).toBeGreaterThan(0)
    }
    // the round shrinks monotonically down the table, which is what it is a table of
    const slots = rows.map((r) => Number(/^(\d+) 时隙/.exec(r[4])![1]))
    expect(slots, 'the three rounds, in the printed order').toEqual([...slots].sort((a, b) => b - a))
  })

  it('the 14.54 dB formula: both differences, and the sum its note takes', () => {
    const f = uwbUwbd.numbers!.find((x) => x.kind === 'formula'
      && (x.heading ?? '').includes('十四个多分贝')) as { text: string; note?: string } | undefined
    expect(f, 'the 14.54 dB formula is gone from `numbers`').toBeDefined()
    const m = /片段 10·log10\((\d+) nJ \/ ([\d.]+) µs\) = [−-]([\d.]+) dBm\s*\nSP0 发射功率 = [−-]([\d.]+) dBm\s*→\s*相差 ([\d.]+) dB\s*\n门限：片段 [−-](\d+) dBm，SP0 [−-](\d+) dBm\s*→\s*再差 (\d+) dB/
      .exec(f!.text)
    expect(m, 'the formula no longer states its terms in the shape this reads').not.toBeNull()
    const FRAG_NS = rsfNs(40, 64)
    expect(Number(m![2]), 'the fragment duration the formula divides by').toBe(FRAG_NS / 1000)
    expect(-Number(m![3]), 'the fragment’s own transmit level')
      .toBe(Number(mmsFragmentDbm(FRAG_NS).toFixed(2)))
    expect(-Number(m![4]), 'the SP0 transmit power').toBe(UWB_TX_POWER_DBM)
    expect(Number(m![5]), 'and the transmit-side difference')
      .toBe(Number((mmsFragmentDbm(FRAG_NS) - UWB_TX_POWER_DBM).toFixed(2)))
    expect(-Number(m![6]), 'the fragment threshold').toBe(UWB_RX_SENS_DBM)
    expect(-Number(m![7]), 'the SP0 threshold').toBe(MMS_SP0_RX_SENS_DBM)
    expect(Number(m![8]), 'and the receive-side difference').toBe(MMS_SP0_PENALTY_DB)
    const note = /两者相加 ([\d.]+) dB/.exec(f!.note ?? '')
    expect(note, 'the note no longer states the sum').not.toBeNull()
    expect(Number(note![1]), 'the sum of the lesson’s own two differences')
      .toBeCloseTo(Number(m![5]) + Number(m![8]), 6)
  })

  it('the level ledger: five rows, two anchors, every level from the channel law', () => {
    const rows = rowsOf('这条走廊上的两个锚点')
    expect(rows, 'the lesson prints five quantities').toHaveLength(5)
    const pl0 = uwbPl0Db(9)
    const FRAG_NS = rsfNs(40, 64)
    const frag = mmsFragmentDbm(FRAG_NS)
    // the two columns are the two anchors; their distances come from the heading of the scene,
    // not from this file — 「十米处那个」/「二十米处那个」
    const heads = (uwbUwbd.numbers!.find((x) => x.kind === 'table'
      && (x.heading ?? '').includes('这条走廊上的两个锚点')) as { head: string[] }).head
    const dists = heads.slice(1).map((h) => {
      const zh = /^([一二三四五六七八九十]+)米处/.exec(h.trim())
      expect(zh, `the column heading 「${h}」 does not name a distance in Chinese numerals`)
        .not.toBeNull()
      return zhNumeral(zh![1])!
    })
    expect(dists, 'the two anchor distances the headings name').toEqual([10, 20])
    for (const [j, d] of dists.entries()) {
      const L = uwbPathLossDb(pl0, d, 0)
      expect(num(rows[0][1 + j]), `${d} m: path loss`).toBe(Number(L.toFixed(2)))
      expect(num(rows[1][1 + j]), `${d} m: one fragment on arrival`).toBe(Number((frag - L).toFixed(2)))
      expect(num(rows[2][1 + j]), `${d} m: all eight combined`)
        .toBe(Number((frag - L + combineGainDb(8)).toFixed(2)))
      expect(num(rows[3][1 + j]), `${d} m: the SP0 packet on arrival`)
        .toBe(Number((UWB_TX_POWER_DBM - L).toFixed(2)))
      // the last row states a SIGNED relation in words, and the sign is the lesson
      const margin = UWB_TX_POWER_DBM - L - MMS_SP0_RX_SENS_DBM
      const cell = rows[4][1 + j]
      const rel = /^(高出|低了) ([\d.]+) dB$/.exec(cell)
      expect(rel, `${d} m: the margin cell 「${cell}」 is not 「高出 x dB」 or 「低了 x dB」`).not.toBeNull()
      expect(rel![1], `${d} m: which side of the threshold it falls on`)
        .toBe(margin > 0 ? '高出' : '低了')
      expect(Number(rel![2]), `${d} m: and by how much`).toBe(Number(Math.abs(margin).toFixed(2)))
    }
    // the threshold the last row names is the SP0 one, stated in its own label
    expect(num(rows[4][0].replace('SP0 的门限 ', '')), 'the threshold the row names')
      .toBe(MMS_SP0_RX_SENS_DBM)
    // and the sign really does change between the two columns — the whole lesson
    expect(rows[4][1].startsWith('高出') && rows[4][2].startsWith('低了'),
      'the near anchor clears the threshold and the far one does not').toBe(true)
  })

  it('the outcome table: what each control plane measured, and how many distances', () => {
    const rows = rowsOf('三种控制面，各测出了什么')
    expect(rows.map((r) => r[0]), 'the same three planes, in the same order')
      .toEqual(PLANES.map(([label]) => label))
    for (const [i, [label, , variant]] of PLANES.entries()) {
      const rs = runOf(uwbUwbd, variant, BLOCK_NS)
      const fixes = ofType(rs, 'UWB_RANGE')
      const row = rows[i]
      expect(num(row[3]), `${label}: distances per block`).toBe(fixes.length)
      // the near anchor is measured in every plane; the far one only under Config 2
      const far = fixes.filter((r) => r.peer.includes('far') || r.trueDistM > 15)
      expect(row[1], `${label}: the near column says 「测得」`).toBe('测得')
      expect(fixes.length - far.length, `${label}: and the near anchor really was measured`)
        .toBeGreaterThan(0)
      if (row[2] === '测得') {
        expect(far.length, `${label}: the far column says 「测得」 too`).toBeGreaterThan(0)
      } else {
        expect(far.length, `${label}: the far column says 「${row[2]}」, so no distance came back`)
          .toBe(0)
      }
    }
    // exactly one plane measures both anchors, which is why the lesson is about the other two
    expect(rows.filter((r) => r[2] === '测得'), 'only Config 2 reaches the far anchor').toHaveLength(1)
  })
})
