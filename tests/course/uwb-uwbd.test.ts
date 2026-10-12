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
  MMS_DRAFT_DEFAULTS, MMS_RSF_SFD_N_MSR, MMS_SLOTS_PER_MS, MMS_SP0_NS, MMS_SP0_PENALTY_DB,
  MMS_SP0_RX_SENS_DBM, MMS_SP0_SEGMENT_NS, MMS_SPREAD, MS_RSTU,
  combineGainDb, mmsFragmentDbm, mmsLayout, rsfNs, type MmsPhy,
} from '../../src/uwb/mms'
import { UWB_TX_POWER_DBM, uwbPathLossDb, uwbPl0Db } from '../../src/uwb/phy'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'
import { lessonTexts } from '../../src/course/readability'
import { fmtRecord } from '../../src/ui/format'
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

// --- every figure the PROSE prints ------------------------------------------------------------

/**
 * **The four tables and the formula are read out of the lesson; the rest of its prose is not.**
 * The describes above measure the engine and compare it with a literal written HERE — the
 * lesson's sentence quoted in a comment beside it, at best — and the sweep of 2026-10-13 says
 * what that is worth: of the 175 figures this lesson prints, PLACEHOLDER could be edited with the
 * suite green. The tables were read back in an earlier slice; `picture`, `deeper`, `limits`,
 * `sources`, `observe`, `tryThis` and the quiz never were.
 *
 * Nothing new is measured below. Every assertion calls the same `runOf`, `mmsLayout`, `rsfNs`,
 * `mmsFragmentDbm`, `uwbPathLossDb` the tests above call, and the figure comes out of the prose.
 * Where the lesson states one figure in four places — 10.54 dB is in `picture`, in the formula,
 * in `sources` and in a quiz explanation — every occurrence is read.
 */
describe('uwb-uwbd · every figure the prose prints, read back out of it', () => {
  const EVERYWHERE = lessonTexts(uwbUwbd).map((t) => t.text).join('\n')
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
  const blockText = (b: unknown): string => {
    const o = b as { heading?: string; text?: string; items?: string[]; note?: string; caption?: string }
    return [o.heading ?? '', o.text ?? '', (o.items ?? []).join('\n'), o.note ?? '', o.caption ?? '']
      .join('\n')
  }
  const pic = (uwbUwbd.picture ?? []).map(blockText).join('\n')
  const nums = (uwbUwbd.numbers ?? []).map(blockText).join('\n')
  const deep = (uwbUwbd.deeper ?? []).map(blockText).join('\n')
  const limitsText = (uwbUwbd.limits ?? []).map((l) => l.text).join('\n')
  const obs = uwbUwbd.observe.join('\n')
  const quizText = uwbUwbd.quiz!.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')

  const FRAG_NS = rsfNs(40, 64)
  const PL0 = uwbPl0Db(9)
  const FRAG_DBM = mmsFragmentDbm(FRAG_NS)
  const PHY = (over: Partial<MmsPhy> = {}): MmsPhy => ({
    rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS, ...over,
  })
  const PLANES: readonly (readonly [string, Partial<MmsPhy>, number | undefined])[] = [
    ['nba', { control: 'nba' }, NBA],
    ['sp0', { control: 'uwbd', uwbdControl: 'sp0' }, undefined],
    ['none', { control: 'uwbd', uwbdControl: 'none' }, NONE],
  ]
  /** The furthest this channel carries `tx` to a receiver that needs `sens`. */
  const reach = (tx: number, sens: number): number => {
    let lo = 0.5, hi = 4000
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2
      if (tx - uwbPathLossDb(PL0, m, 0) >= sens) lo = m
      else hi = m
    }
    return lo
  }
  const airOf = (variant: number | undefined, kind: string): number[] => [...new Set(
    runOf(uwbUwbd, variant, BLOCK_NS)
      .flatMap((r) => (r.type === 'TX_START' && r.frame.kind === kind ? [r.frame.txTimeNs] : [])),
  )]
  const FAR_M = Math.abs(UWBD_ANCHORS[1]!.x - UWBD_TAG_X)

  it('the two packets of the round, wherever the lesson gives one a length', () => {
    const sp0Us = MMS_SP0_NS / 1000
    const pollUs = airOf(NBA, 'nbPoll')[0]! / 1000
    const reportUs = airOf(NBA, 'nbReport')[0]! / 1000
    // every microsecond figure in the lesson is one of the three lengths it ever sends
    for (const v of everyFig(/([\d.]+) µs/g, 'a packet length the prose gives', 6)) {
      const us = val(v)
      // the caption rounds the fragment to a whole microsecond, and `deeper` gives the PSDU cell
      if (us === FRAG_NS / 1000 || us === Math.round(FRAG_NS / 1000)) continue
      if (us === MMS_SP0_SEGMENT_NS.psdu / 1000) continue
      expect([sp0Us, pollUs, reportUs, 170.1],
        `${us} µs is a packet this lesson sends — or the draft's other column`).toContain(us)
    }
    // 「它在超宽带这条信道上，长 117.6 µs；而窄带那一帧 Poll 长 576 µs」
    const [sp0Printed, pollPrinted] = raw(pic,
      /长 ([\d.]+) µs；而窄带那一帧 Poll 长 (\d+) µs/, '`picture` on the two opening packets')
    same(sp0Printed!, sp0Us, 'the SP0 packet this run really sends')
    same(pollPrinted!, pollUs, 'and the narrowband Poll of the other plane')
    // 「印的是 NBPOLL 与 NBRESP，各 576 µs，而收尾那两帧 NBREPORT 各 608 µs」
    const [obsPoll, obsReport] = figs(obs,
      /印的是 NBPOLL 与 NBRESP，各 (\d+) µs，而收尾那两帧 NBREPORT 各 (\d+) µs/,
      '`observe` on the narrowband frames of Config 2')
    expect(obsPoll! * 1000, 'the Poll').toBe(airOf(NBA, 'nbPoll')[0])
    expect(obsPoll! * 1000, 'and the Resp, the same length').toBe(airOf(NBA, 'nbResp')[0])
    expect(obsReport! * 1000, 'and the two REPORTs').toBe(airOf(NBA, 'nbReport')[0])
    // the figure's own cells: four for the SP0 packet, and acquisition uses the first two
    const spec = uwbUwbdHeadFields()
    expect(spec.fields.map((f) => f.size).slice(0, 4).reduce((a, b) => a + b, 0),
      'the four cells add up to the packet’s own length').toBeCloseTo(sp0Us, 6)
    const [cells, forAcq] = raw(pic, /前(四)格是 SP0 包[\s\S]*?只有头(两)格用来捕获/,
      'the caption on which cells are which')
    expect(zhNumeral(cells!), 'the SP0 packet is drawn in that many cells').toBe(4)
    expect(zhNumeral(forAcq!.replace(/两/g, '二')),
      'and acquisition uses the first two of them').toBe(2)
    expect(spec.fields, 'the figure draws those four and the leading fragment').toHaveLength(5)
    // 「片段把整整一毫秒的能量花在自己这 82 µs 里」
    const [fragUs] = figs(pic, /自己这 (\d+) µs 里/, 'the caption on a fragment’s own length')
    expect(fragUs, 'the fragment, to the microsecond the caption rounds it to')
      .toBe(Math.round(FRAG_NS / 1000))
    expect(PHY().gapMs, 'and 「整整一毫秒」 is the energy budget it spends there').toBe(1)
  })

  it('the three control planes: the window, the round in slots, the round in milliseconds', () => {
    const layouts = PLANES.map(([, over]) => mmsLayout(PHY(over), 1))
    const [nba, sp0, none] = layouts
    // 「一个窄带窗口要占两个测距时隙……于是一个窗口只占一个」 — the counts are Chinese numerals,
    // so what is read is the relation: the narrowband window is the wider of the two
    expect(nba!.windowSlots, 'a narrowband window costs more slots than an SP0 one')
      .toBeGreaterThan(sp0!.windowSlots)
    expect(none!.controlSlots, 'and the zero-length plane spends no control slots at all').toBe(0)
    expect(none!.reportSlots, 'while its report phase survives').toBeGreaterThan(0)
    // 「同一轮测距，28 个时隙、24 个、22 个」 — `picture`, and the table prints them again
    const [a, b, c] = figs(pic, /(\d+) 个时隙、(\d+) 个、(\d+) 个/, '`picture` on the three rounds')
    expect([a, b, c], 'the three rounds the three planes lay out')
      .toEqual(layouts.map((l) => l!.slots))
    // 「14 ms、12 ms、11 ms」 in `tryThis`
    const trys = uwbUwbd.tryThis.join('\n')
    const [t1, t2, t3] = figs(trys, /(\d+) ms、(\d+) ms、(\d+) ms/, '`tryThis` on the three rounds')
    expect([t1, t2, t3], 'the same three rounds in milliseconds')
      .toEqual(layouts.map((l) => (l!.slots * PHY().gapMs) / MMS_SLOTS_PER_MS))
    // 「窄带辅助四个、SP0 两个、零长两个」 — Chinese numerals, read with the course's own reader
    const counts = raw(trys, /窄带辅助(.)个、SP0 (.)个、零长(.)个/,
      '`tryThis` on how many distances each plane gets')
    for (const [i, zh] of counts.entries()) {
      // 「两」 is the counter form of 二, which `zhNumeral` does not take — the same substitution
      // `@airtime` and `@amp-ppdu` make at their own call sites
      expect(zhNumeral(zh!.replace(/两/g, '二')), `${PLANES[i]![0]}: the distances one block yields`)
        .toBe(ofType(runOf(uwbUwbd, PLANES[i]![2], BLOCK_NS), 'UWB_RANGE').length)
    }
  })

  it('the 14.54 dB and each of its two halves, at every place the lesson states them', () => {
    const txDiff = FRAG_DBM - UWB_TX_POWER_DBM
    // 「离开天线时的功率就比一个片段低 10.54 dB」 — `picture`, the formula, `sources`, the quiz
    for (const v of everyFig(/低 ([\d.]+) dB|相差 ([\d.]+) dB|再低 ([\d.]+) dB/g,
      'the transmit-side difference', 3)) {
      same(v, txDiff, 'what an SP0 packet leaves the antenna behind a fragment by')
    }
    // 「草案为此把它的门限抬高约 4 dB」 — `picture`, `deeper`, `limits`, `sources`, the quiz
    for (const v of everyFig(
      /抬高约 (\d+) dB|再差 (\d+) dB|那 (\d+) dB 是一个数|就是这 (\d+) dB|“约 (\d+) dB”|PENALTY_DB = (\d+)|取值：(\d+) dB 这个数/g,
      'the threshold penalty', 6)) {
      expect(val(v), 'the penalty `mms.ts` charges').toBe(MMS_SP0_PENALTY_DB)
    }
    // 「一段链路上少了十四个多分贝」 — Chinese, and the claim is the whole of 14.54
    const [tens] = raw(pic, /少了(十四)个多分贝/, '`picture` on the two halves together')
    expect(zhNumeral(tens!), 'the whole of it, rounded down the way the sentence rounds it')
      .toBe(Math.floor(txDiff + MMS_SP0_PENALTY_DB))
    // 「两者相加 14.54 dB，就是同一条信道上 SP0 比片段少走的那一段」
    for (const v of everyFig(/相加 ([\d.]+) dB/g, 'the sum of the two halves', 1)) {
      same(v, txDiff + MMS_SP0_PENALTY_DB, 'the two halves added up')
    }
    // every 「−N dBm」 in the lesson is a level or a threshold this engine really has
    const known = new Set([
      MMS_SP0_RX_SENS_DBM, UWB_RX_SENS_DBM, UWB_TX_POWER_DBM, -41.3,
      Number(FRAG_DBM.toFixed(2)),
      ...[10, FAR_M].flatMap((d) => {
        const L = uwbPathLossDb(PL0, d, 0)
        return [
          Number((FRAG_DBM - L).toFixed(2)),
          Number((FRAG_DBM - L + combineGainDb(8)).toFixed(2)),
          Number((UWB_TX_POWER_DBM - L).toFixed(2)),
        ]
      }),
    ])
    // 「够不够 −89 / −93 dBm」 writes the first of the pair without its unit, and that is its
    // own site: a figure is not read because the same figure is read somewhere else
    for (const v of everyFig(/−([\d.]+)(?= dBm| \/ −| · −)/g,
      'a level or a threshold the prose names', 10)) {
      expect([...known], `−${v} dBm is a level this engine really has`).toContain(-val(v))
    }
  })

  it('the three reaches, and the far anchor sitting between the first two', () => {
    // 「SP0 包在这条走廊上走到 16.80 m 就到顶了，而一个片段单独走得到 89.59 m，八个片段加起来
    //  走得到 253.41 m」
    const [sp0R, oneR, eightR] = raw(nums,
      /走到 ([\d.]+) m 就到顶了，而一个片段单独走得到 ([\d.]+) m，八个片段加起来走得到 ([\d.]+) m/,
      '`numbers` on the three reaches')
    same(sp0R!, reach(UWB_TX_POWER_DBM, MMS_SP0_RX_SENS_DBM), 'how far an SP0 packet carries')
    same(oneR!, reach(FRAG_DBM, UWB_RX_SENS_DBM), 'how far one fragment carries')
    same(eightR!, reach(FRAG_DBM, UWB_RX_SENS_DBM - combineGainDb(8)), 'and how far eight do')
    // 「二十米处那个锚点落在第一个数字之外、第二个之内——整堂课就系在这一段上」
    expect(FAR_M, 'the far anchor is past the SP0 reach').toBeGreaterThan(val(sp0R!))
    expect(FAR_M, 'and inside one fragment’s').toBeLessThan(val(oneR!))
    // 「SP0 走到 16.80 m 就到顶」 and 「16.80 m 之内必成、之外必败」 — `limits` says it twice more
    for (const v of everyFig(/走到 ([\d.]+) m 就到顶|([\d.]+) m 之内必成/g,
      'the SP0 reach, wherever it is named', 2)) {
      same(v, reach(UWB_TX_POWER_DBM, MMS_SP0_RX_SENS_DBM), 'the line this whole lesson hangs on')
    }
  })

  it('`deeper`: the draft’s three decibels are its own arithmetic, and 4 dB sits among them', () => {
    /*
     * 「短包 SP0 比同为短包的 SYNC+SFD 长 4 倍、脉冲多 4.3 倍，10·log10(4.3) = 6.33 dB；长包是
     * 3.3 倍与 3.4 倍，10·log10(3.4) = 5.31 dB；两边都取 PSR 64 时是 2.3 倍与 2.4 倍，
     * 10·log10(2.4) = 3.80 dB」.
     *
     * **The ratios are the draft's own and this repository has no corpus for them** — the first
     * exemption class, and so is the 91 of 「典型的 91 长码上」: this engine carries no SYNC code
     * length at all, which is the same reason `limits` gives for taking one number instead of
     * three (「本引擎根本不携带 SP0 包的前导重复数这个量」). What IS checkable is the arithmetic
     * the sentence does with each ratio, that the pulse ratio of each pair is the larger of the
     * two (the sentence's own 「比的是脉冲数而不是时长」), and that the engine's single 4 dB falls
     * among the three values it stands in for — which is what 「提案的结论句把这三个数收成一句
     * “约 4 dB”」 claims.
     */
    const logs = [...deep.matchAll(/10·log10\(([\d.]+)\) = ([\d.]+) dB/g)]
      .map((m) => [val(m[1]!), m[2]!] as const)
    expect(logs.length, '`deeper` works a ratio into decibels three times').toBe(3)
    for (const [ratio, db] of logs) same(db, 10 * Math.log10(ratio), `10·log10(${ratio})`)
    /*
     * **Each ratio is printed twice in its own sentence** — 「脉冲多 4.3 倍，10·log10(4.3) = 6.33
     * dB」 — and the first printing is its own site. So the three 「倍」 pairs are read too: the
     * second of each pair is the number the logarithm is taken of, and the first is the LENGTH
     * ratio, which this repository has no corpus for. What that one is checked against is the
     * sentence's own claim 「比的是脉冲数而不是时长」: in every pair the pulse ratio is the
     * larger of the two, which is the only reason the comparison is made in pulses at all.
     */
    const times = [...deep.matchAll(/长 ([\d.]+) 倍、脉冲多 ([\d.]+) 倍|是 ([\d.]+) 倍与 ([\d.]+) 倍/g)]
      .map((m) => m.slice(1).filter((x) => x !== undefined).map(val))
    expect(times.length, '`deeper` gives a pair of ratios for each of the three cases').toBe(3)
    times.forEach(([len, pulses], i) => {
      expect(pulses, `case ${i + 1}: the pulse ratio is the one the logarithm is taken of`)
        .toBe(logs[i]![0])
      expect(pulses, `case ${i + 1}: and more pulses than length, which is why pulses are what counts`)
        .toBeGreaterThan(len!)
    })
    const exact = logs.map(([, db]) => val(db))
    expect(MMS_SP0_PENALTY_DB, 'the engine’s one number is no larger than the largest of them')
      .toBeLessThanOrEqual(Math.max(...exact))
    expect(MMS_SP0_PENALTY_DB, 'and no smaller than the smallest')
      .toBeGreaterThanOrEqual(Math.min(...exact))
    // 「草案自己按脉冲数之比给的是 6.33、5.31 与 3.80 dB」 — `limits` lists the same three
    const listed = figs(limitsText, /给的是 ([\d.]+)、([\d.]+) 与 ([\d.]+) dB/,
      '`limits` on the three the draft gives')
    expect(listed, 'the same three the `deeper` table works out').toEqual(exact)
    // 「换成 6.33 dB，它落在更近的地方」 — the claim, measured
    const [swapped] = figs(limitsText, /换成 ([\d.]+) dB，它落在更近的地方/,
      '`limits` on what another penalty would do')
    expect(exact, 'and that is one of the draft’s own three').toContain(swapped)
    expect(reach(UWB_TX_POWER_DBM, UWB_RX_SENS_DBM + swapped!),
      'a larger penalty really does pull the line in')
      .toBeLessThan(reach(UWB_TX_POWER_DBM, MMS_SP0_RX_SENS_DBM))
    // 「SP0 包的 PSDU 在草案那张表里是 52.3 µs，按 1.95 Mbit/s 算是 102 比特，也就是十二个整字节」
    const [psduUs, mbps, bits] = raw(deep,
      /PSDU 在草案那张表里是 ([\d.]+) µs，按 ([\d.]+) Mbit\/s 算是 (\d+) 比特/,
      '`deeper` on the PSDU’s own length')
    expect(val(psduUs!) * 1000, 'the PSDU cell the figure draws').toBe(MMS_SP0_SEGMENT_NS.psdu)
    same(bits!, val(psduUs!) * val(mbps!), 'the bits that length carries at that rate')
    const [bytes] = raw(deep, /也就是(十二)个整字节/, '`deeper` on the whole bytes they are')
    expect(zhNumeral(bytes!), 'the whole bytes those bits hold').toBe(Math.floor(val(bits!) / 8))
    // 「两列之中取的是短包那一列（117.6 µs，另一列是 170.1 µs）」
    const [short, long] = figs(deep, /取的是短包那一列（([\d.]+) µs，另一列是 ([\d.]+) µs）/,
      '`deeper` on which column the engine takes')
    expect(short! * 1000, 'the column the engine takes').toBe(MMS_SP0_NS)
    expect(long!, 'and the one it does not, which is the longer — so the choice is conservative')
      .toBeGreaterThan(short!)
    // 「一个片段：40 × 4 × (128 + 2 × 64) = 40 960 chips · 82.051 µs」 — the step table's cell
    const [nMsr, spread, mmrs, two, gap, chips, us] = figs(EVERYWHERE,
      /(\d+) × (\d) × \((\d+) \+ (\d) × (\d+)\) = ([\d\s]+) chips · ([\d.]+) µs/,
      'the step table on what one fragment is')
    expect(nMsr! * spread! * (mmrs! + two! * gap!), 'the chips the lesson’s own product gives')
      .toBe(chips)
    same(String(us), FRAG_NS / 1000, 'and the fragment the engine builds')
    expect(nMsr, 'N_MSR, as the scene sets it').toBe(PHY().nMsr)
    expect(gap, 'and the gap').toBe(PHY().gap)
    expect(spread, 'the spread the draft fixes').toBe(MMS_SPREAD)
  })

  it('the step table’s six rows, and the three figures the prose names outside them', () => {
    const rows = (uwbUwbd.numbers!.find((x) => x.kind === 'table'
      && (x.heading ?? '').includes('这六步，落在本场景上')) as { rows: string[][] }).rows
    const byStep = (needle: string): string => {
      const row = rows.find((r) => r[0]!.includes(needle))
      expect(row, `no step row names 「${needle}」`).toBeDefined()
      return row![1]!
    }
    const sp0 = mmsLayout(PHY({ control: 'uwbd', uwbdControl: 'sp0' }), 1)
    const none = mmsLayout(PHY({ control: 'uwbd', uwbdControl: 'none' }), 1)
    // 「控制阶段，SP0 与零长」 → 「2 时隙 · 0 时隙」
    const [withSp0, withNone] = figs(byStep('控制阶段，SP0 与零长'), /(\d+) 时隙 · (\d+) 时隙/,
      'the step row on the two control phases')
    expect(withSp0, 'the control phase an SP0 plane lays out').toBe(sp0.controlSlots)
    expect(withNone, 'and the one the zero-length plane lays out').toBe(none.controlSlots)
    // 「捕获门限，SP0 与片段」 → 「−89 dBm · −93 dBm」
    const [tSp0, tFrag] = figs(byStep('捕获门限'), /−(\d+) dBm · −(\d+) dBm/,
      'the step row on the two thresholds')
    expect(-tSp0!, 'the threshold an SP0 packet is judged by').toBe(MMS_SP0_RX_SENS_DBM)
    expect(-tFrag!, 'and the one a fragment is judged by').toBe(UWB_RX_SENS_DBM)
    // 「二十米处，SP0 与片段到达时」 → 「−90.52 dBm · −79.98 dBm」
    const [aSp0, aFrag] = raw(byStep('二十米处'), /−([\d.]+) dBm · −([\d.]+) dBm/,
      'the step row on what arrives out there')
    const L = uwbPathLossDb(PL0, FAR_M, 0)
    same(`-${aSp0!}`, UWB_TX_POWER_DBM - L, 'the SP0 packet at the far anchor')
    same(`-${aFrag!}`, FRAG_DBM - L, 'and one fragment there')
    // 「报告阶段」 → 「2 时隙 · 每个 SP0 包 117.6 µs」
    const [reportSlots, reportUs] = raw(byStep('报告阶段'), /(\d+) 时隙 · 每个 SP0 包 ([\d.]+) µs/,
      'the step row on the report phase')
    expect(val(reportSlots!), 'the report phase, which survives a zero-length control phase')
      .toBe(none.reportSlots)
    same(reportUs!, MMS_SP0_NS / 1000, 'and the packet it spends it on')
    /*
     * 「SOR Management PHY Configuration 字段，取值 1–8 指窄带辅助那套配置，14–15 指 UWB 驱动那
     * 套」 — `deeper` says it and `limits` says it again. **The draft's numbering has no corpus
     * here** (the first exemption class, and the sentence's own point is that the engine models
     * the behaviour and not the encoding), so what is checked is that the two printings agree
     * figure for figure, and that the two ranges are ordered and disjoint — which is what makes
     * them two ranges.
     */
    const ranges = [...EVERYWHERE.matchAll(/(\d+)–(\d+) 指窄带辅助[^，。]*，(\d+)–(\d+) 指 UWB 驱动/g)]
      .map((m) => m.slice(1).map(val))
    expect(ranges.length, 'the lesson prints the draft’s two ranges twice').toBe(2)
    expect(ranges[1], 'and both printings agree, figure for figure').toEqual(ranges[0])
    const [lo1, hi1, lo2, hi2] = ranges[0]!
    expect(lo1! < hi1! && hi1! < lo2! && lo2! < hi2!,
      'two ranges, ordered and disjoint').toBe(true)
    // 「换到“窄带辅助（Config 2）”那个场景」 — the name of a variant this lesson really ships
    const [named] = raw(obs, /换到“([^”]+)”那个场景/, '`observe` on which scene to switch to')
    expect(uwbUwbd.variants!.map((v) => v.label), 'the scene it names is one this lesson ships')
      .toContain(named)
    // 「每 200 ms 一块里各得出几个距离」 — the block this session runs on
    const [blockMs] = figs(uwbUwbd.tryThis.join('\n'), /每 (\d+) ms 一块/,
      '`tryThis` on the block every count is per')
    const session = uwbUwbd.scenario().uwb!
    expect(blockMs! * MS_RSTU, 'the block the session really runs').toBe(session.blockRstu)
    expect(blockMs! * MS, 'which is the window every count in this file is taken over')
      .toBe(BLOCK_NS)
    // 「两边都取 PSR 64 时」 — one of the two preamble repetitions this engine knows
    const [psr] = figs(deep, /两边都取 PSR (\d+) 时/, '`deeper` on the case the draft equalises')
    expect([...MMS_RSF_SFD_N_MSR], 'a repetition count this engine has a fragment shape for')
      .toContain(psr)
    /*
     * The figure's last cell is labelled 「片段 0」, and that 0 is **exempt**: it is a caption on a
     * drawing, naming the first fragment of the train. What the caption claims about that cell is
     * checked above — it is the leading fragment and its width is a fragment's own — and the
     * index itself is the first of `rsfs`, which no measurement here can distinguish from any
     * other label the figure might have carried.
     */
    const spec = uwbUwbdHeadFields()
    expect(spec.fields[4]!.label, 'the last cell names a fragment').toContain('片段')
    expect(spec.fields[4]!.size, 'and it is a fragment wide').toBeCloseTo(FRAG_NS / 1000, 6)
  })

  it('`observe`: every instant, and the two windows that come up empty by name', () => {
    const rs = runOf(uwbUwbd, undefined, BLOCK_NS)
    const ms = (ns: number): number => ns / MS
    // 「0.000 ms 标签发出一个 SP0 包，0.500 ms 锚点回一个」
    const [t0, t1] = raw(obs, /([\d.]+) ms 标签发出一个 SP0 包，([\d.]+) ms 锚点回一个/,
      '`observe` on the two SP0 packets that open the round')
    const sp0s = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'uwbSp0')
    same(t0!, ms(sp0s[0]!.t), 'when the tag sends its opening SP0 packet')
    same(t1!, ms(sp0s[1]!.t), 'and when the anchor answers')
    expect(sp0s[0]!.node, 'the first of them is the tag’s').toBe('tag-1')
    // 「到 8.500 ms 才出现第一条判定」
    const [firstTrain] = raw(obs, /到 ([\d.]+) ms 才出现第一条判定/,
      '`observe` on the first train decision')
    same(firstTrain!, ms(ofType(rs, 'UWB_MMS_TRAIN')[0]!.t), 'the first train decision of the run')
    // 「第二轮从 12.000 ms 起是二十米处那个锚点」
    const [secondRound] = raw(obs, /第二轮从 ([\d.]+) ms 起/,
      '`observe` on when the second round starts')
    const rounds = ofType(rs, 'UWB_ROUND').filter((r) => r.block === 0)
    same(secondRound!, ms(rounds[1]!.t), 'when the second round starts')
    // 「12.500 ms 写着 “anchor-2 UWB slot 0: no sp0 from tag-1”，紧接着 13.000 ms 标签也等空了」
    const [missAt, missLine, tagAt] = raw(obs,
      /([\d.]+) ms 写着 “([^”]+)”，紧接着 ([\d.]+) ms 标签也等空了自己那个窗口/,
      '`observe` on the window the far anchor sat out')
    const timeouts = ofType(rs, 'UWB_TIMEOUT')
    const quoted = timeouts.find((r) => fmtRecord(r).includes(missLine!))
    expect(quoted, `no record of this run prints 「${missLine}」`).toBeDefined()
    same(missAt!, ms(quoted!.t), 'when the far anchor finds its window empty')
    const tagTimeout = timeouts.find((r) => r.node === 'tag-1' && r.t > quoted!.t)
    expect(tagTimeout, 'and the tag times out after it').toBeDefined()
    same(tagAt!, ms(tagTimeout!.t), 'when the tag finds its own window empty')
    // 「18.500 ms 与 19.000 ms 两条判定都写着 8/8 收到、余量 22.1 dB、检出；而 21.500 ms 是 “…”」
    const none = runOf(uwbUwbd, NONE, BLOCK_NS)
    const [d1, d2, heard, of, margin, reportAt, reportLine] = raw(obs,
      /([\d.]+) ms 与 ([\d.]+) ms 两条判定都写着 (\d)\/(\d) 收到、余量 ([\d.]+) dB、检出；而 ([\d.]+) ms 是 “([^”]+)”/,
      '`observe` on the zero-length run')
    const far = ofType(none, 'UWB_MMS_TRAIN')
      .filter((t) => t.node === 'anchor-2' || t.peer === 'anchor-2')
    expect(far.length, 'the two decisions about the far anchor').toBeGreaterThanOrEqual(2)
    same(d1!, ms(far[0]!.t), 'the first of the two decisions')
    same(d2!, ms(far[1]!.t), 'and the second')
    for (const t of far.slice(0, 2)) {
      expect(t.heard, 'every fragment of the train heard').toBe(val(heard!))
      expect(val(of!), 'out of the train this scene sends').toBe(PHY().rsfs)
      same(margin!, t.marginDb, 'the margin the decision records')
      expect(t.detected, 'and it is detected').toBe(true)
    }
    const reportMiss = ofType(none, 'UWB_TIMEOUT').find((r) => fmtRecord(r).includes(reportLine!))
    expect(reportMiss, `no record of the zero-length run prints 「${reportLine}」`).toBeDefined()
    same(reportAt!, ms(reportMiss!.t), 'when the report window comes up empty')
  })

  it('the quiz: the margin that cleared, the threshold that did not, and the three decibels', () => {
    const far = ofType(runOf(uwbUwbd, NONE, BLOCK_NS), 'UWB_MMS_TRAIN')
      .filter((t) => t.node === 'anchor-2' || t.peer === 'anchor-2')
    // 「整列片段以 22.06 dB 的余量检出」 — the quiz asks it and `numbers` states it
    for (const v of everyFig(/以 ([\d.]+) dB 的余量检出/g, 'the margin the train cleared by', 2)) {
      same(v, far[0]!.marginDb, 'the margin the far anchor’s train really has')
    }
    // 「它按 −89 dBm 判定，而在那个距离上它只有 −90.52 dBm」
    const [thresh, level] = raw(quizText,
      /按 −([\d.]+) dBm 判定，而在那个距离上它只有 −([\d.]+) dBm/,
      'the quiz on why the report fails')
    expect(-val(thresh!), 'the threshold an SP0 packet is judged by').toBe(MMS_SP0_RX_SENS_DBM)
    same(`-${level!}`, UWB_TX_POWER_DBM - uwbPathLossDb(PL0, FAR_M, 0),
      'and what an SP0 packet arrives at, out there')
    expect(-val(level!), 'which is below it').toBeLessThan(-val(thresh!))
    // 「草案按脉冲数之比算出 6.3、5.3 与 3.8 dB 三个值」 — the same three, to one decimal
    const rough = figs(quizText, /算出 ([\d.]+)、([\d.]+) 与 ([\d.]+) dB 三个值/,
      'the quiz on the draft’s three values')
    const exact = [...deep.matchAll(/10·log10\([\d.]+\) = ([\d.]+) dB/g)].map((m) => val(m[1]!))
    expect(rough, 'the same three the `deeper` table works out, to one decimal')
      .toEqual(exact.map((d) => Number(d.toFixed(1))))
  })
})
