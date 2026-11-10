/**
 * `@uwb-uwbd`, in the standard-first shape (2026-11-10).
 *
 * ① teaches what the P802.15.4ab draft and the contribution 15-25/0194r0 say: two control-plane
 * configurations, SP0 packets for the UWB-driven one, the proposal's ~4 dB estimate (not a draft
 * threshold) and the proposed zero-length control phase (adoption unconfirmed). ② says where this
 * simulator follows them and where it does not — audit #17: the SP0 peak-power loss is counted
 * twice, 10.54 dB of transmit power plus a 4 dB threshold.
 *
 * Every figure the labs print is read back out of the lesson text here and compared with a run or
 * with the engine's own constants, so editing a number in the lesson without the engine agreeing
 * turns this red, and so does an engine change that moves a number the lesson still prints.
 */
import { describe, expect, it } from 'vitest'
import {
  UWBD_ANCHORS, UWBD_TAG_X, UWBD_Z, uwbUwbd, uwbUwbdHeadFields, uwbUwbdScenario,
} from '../../src/course/uwb/uwb-uwbd'
import { ScenarioSchema } from '../../src/model/scenario'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import {
  MMS_DRAFT_DEFAULTS, MMS_SP0_NS, MMS_SP0_PENALTY_DB, MMS_SP0_RX_SENS_DBM, MMS_SP0_SEGMENT_NS,
  UWB_MS_BUDGET_NJ, mmsFragmentDbm, mmsLayout, rsfNs, type MmsPhy,
} from '../../src/uwb/mms'
import { UWB_TX_POWER_DBM, uwbPathLossDb, uwbPl0Db } from '../../src/uwb/phy'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'
import { fmtRecord } from '../../src/ui/format'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
/** One 200 ms ranging block, and nothing of the next: every count below is per block. */
const BLOCK_NS = 200 * MS
const NBA = 0
const NONE = 1

const recs = (variant?: number) => runOf(uwbUwbd, variant, BLOCK_NS)
const ms3 = (ns: number): string => (ns / MS).toFixed(3)
/** The course's minus sign. */
const dbm = (x: number): string => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)}`

const lab = (heading: string): Lab => {
  const l = uwbUwbd.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbUwbd.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbUwbd.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

const FRAG_NS = rsfNs(40, 64)
const FRAG_DBM = mmsFragmentDbm(FRAG_NS)
const PL0 = uwbPl0Db(9)
const lossAt = (m: number): number => uwbPathLossDb(PL0, m, 0)
/** The largest distance at which `tx` still clears `sens` under this channel's free-space law. */
const reach = (tx: number, sens: number): number => {
  let lo = 0.5
  let hi = 4000
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2
    if (tx - lossAt(m) >= sens) lo = m
    else hi = m
  }
  return lo
}

lessonShapeSuite(uwbUwbd)

describe('uwb-uwbd · the lesson', () => {
  it('is in the standard-first shape, first of the UWB-driven half', () => {
    expect(isStandardFirst(uwbUwbd)).toBe(true)
    expect(MODULES[uwbUwbd.module].title).toBe('另一种控制面与子轮')
    expect(COURSE_ORDER.indexOf('uwb-uwbd')).toBe(COURSE_ORDER.indexOf('uwb-ssbd') + 1)
    expect(uwbUwbd.needs).toEqual(['uwb-mms', 'uwb-nba'])
    expect([uwbUwbd.limits, uwbUwbd.observe, uwbUwbd.tryThis]).toEqual([[], [], []])
  })

  it('offers the other two control planes as its variants, and every scene is legal', () => {
    for (const sc of [uwbUwbd.scenario(), ...uwbUwbd.variants!.map((v) => v.scenario())]) {
      expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    }
    const base = uwbUwbdScenario('base').uwb!.mms
    expect([base.control, base.uwbdControl, base.nbChannels, base.nbLbt]).toEqual(['uwbd', 'sp0', [], 'off'])
    expect(uwbUwbdScenario('none').uwb!.mms.uwbdControl).toBe('none')
    expect(uwbUwbdScenario('nba').uwb!.mms.control).toBe('nba')
    expect(UWBD_ANCHORS.map((a) => a.x - UWBD_TAG_X)).toEqual([10, 20])
    for (const a of UWBD_ANCHORS) expect(uwbUwbdScenario().nodes.find((n) => n.id === a.id)!.pos.z).toBe(UWBD_Z)
  })

  it('① names the draft, the proposal and its status, and the standard clause for SP0', () => {
    const std = stdText()
    for (const s of ['P802.15.4ab', '15-25/0194r0', '§16.2.1', '图 16-3', '§10.39.11.1.3.13', '§10.39.11.1.3.9', '采纳状态未确认']) {
      expect(std, s).toContain(s)
    }
    // the ~4 dB is a proposal's estimate, said in so many words, and never a draft threshold
    expect(std).toContain('草案没有据此规定任何接收门限')
    // the proposal's own SP0 table, segment by segment, is the engine's constant
    const s = MMS_SP0_SEGMENT_NS
    for (const v of [s.sync, s.sfd, s.phr, s.psdu]) expect(std).toContain(`${(v / 1000).toFixed(1)} µs`)
    expect(std).toContain(`短包 ${(MMS_SP0_NS / 1000).toFixed(1)} µs`)
    // the proposal's three pulse ratios and the decibels they give
    for (const [ratio, db] of [[4.3, '6.3'], [3.4, '5.3'], [2.4, '3.8']] as const) {
      expect((10 * Math.log10(ratio)).toFixed(1)).toBe(db)
      expect(std).toContain(`${ratio} 倍`)
      expect(std).toContain(db)
    }
  })
})

describe('uwb-uwbd · ② says what the engine does, and the engine does it', () => {
  it('is not all faithful, and the double count is a differs row', () => {
    expect(implRow('SP0 的功率与门限').kind).toBe('differs')
    expect(implRow('SOR 消息').kind).toBe('absent')
    expect(implRow('零长控制阶段').kind).toBe('faithful')
  })

  it('the 14.54 dB, both halves, from the engine', () => {
    const sim = implRow('SP0 的功率与门限').sim
    expect(sim).toContain(`${UWB_MS_BUDGET_NJ} nJ`)
    expect(sim).toContain(`${(FRAG_NS / 1000).toFixed(3)} µs 的片段为 ${dbm(FRAG_DBM)} dBm`)
    expect(sim).toContain(`${dbm(UWB_TX_POWER_DBM)} dBm`)
    expect(sim).toContain(`相差 ${(FRAG_DBM - UWB_TX_POWER_DBM).toFixed(2)} dB`)
    expect(sim).toContain(`SP0 ${dbm(MMS_SP0_RX_SENS_DBM).replace('.00', '')} dBm，片段 ${dbm(UWB_RX_SENS_DBM).replace('.00', '')} dBm`)
    expect(sim).toContain(`合计 ${(FRAG_DBM - UWB_TX_POWER_DBM + MMS_SP0_PENALTY_DB).toFixed(2)} dB`)
    // and the formula of lab 2 states the same three lines
    const f = lab('二十米处的锚点收不到轮询').blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>
    expect(f.text).toContain(`10·log10(${UWB_MS_BUDGET_NJ} nJ / ${(FRAG_NS / 1000).toFixed(3)} µs) = ${dbm(FRAG_DBM)} dBm`)
    expect(f.text).toContain(`SP0 发射功率 = ${dbm(UWB_TX_POWER_DBM)} dBm  →  相差 ${(FRAG_DBM - UWB_TX_POWER_DBM).toFixed(2)} dB`)
    expect(f.text).toContain(`再差 ${MMS_SP0_PENALTY_DB} dB`)
    expect(f.note).toContain(`${(FRAG_DBM - UWB_TX_POWER_DBM + MMS_SP0_PENALTY_DB).toFixed(2)} dB`)
  })

  it('SP0 is the short column, one length for all three messages', () => {
    expect(implRow('SP0 包的时长').sim).toContain(`${(MMS_SP0_NS / 1000).toFixed(1)} µs`)
    const air = new Set(recs().flatMap((r) => (r.type === 'TX_START' && r.frame.kind === 'uwbSp0' ? [r.frame.txTimeNs] : [])))
    expect([...air]).toEqual([MMS_SP0_NS])
  })

  it('Config 1 refuses narrowband settings, and the zero-length phase leaves only SP0 reports', () => {
    const sc = uwbUwbdScenario('base')
    expect(ScenarioSchema.safeParse({ ...sc, uwb: { ...sc.uwb!, mms: { ...sc.uwb!.mms, nbChannels: [3] } } }).success).toBe(false)
    const roles = new Set(recs(NONE).flatMap((r) => (r.type === 'TX_START' && r.frame.kind === 'uwbSp0' ? [r.frame.uwb?.sp0?.role] : [])))
    expect([...roles]).toEqual(['report'])
  })
})

describe('uwb-uwbd · ③ every figure the labs print is the run', () => {
  const phy = (over: Partial<MmsPhy> = {}): MmsPhy => ({
    rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1, ...MMS_DRAFT_DEFAULTS, ...over,
  })

  it('lab 1: the slot table is the layout, and the rounds run at that length', () => {
    const rows = tableOf(lab('一轮开头的 SP0 包'), '同一轮，三种控制面').rows
    const planes: [Partial<MmsPhy>, number | undefined][] = [
      [{ control: 'nba' }, NBA], [{ control: 'uwbd', uwbdControl: 'sp0' }, undefined], [{ control: 'uwbd', uwbdControl: 'none' }, NONE],
    ]
    for (const [i, [over, v]] of planes.entries()) {
      const l = mmsLayout(phy(over), 1)
      const rounds = ofType(recs(v), 'UWB_ROUND').filter((r) => r.block === 0)
      const roundMs = (rounds[1].t - rounds[0].t) / MS
      expect(rows[i].slice(1), String(v)).toEqual([
        `${l.windowSlots} 时隙`, String(l.controlSlots), String(l.reportSlots), `${l.slots} 时隙 · ${roundMs} ms`,
      ])
      expect(lab('一轮开头的 SP0 包').expect).toContain(`${roundMs} ms`)
    }
  })

  it('lab 1: the two SP0 packets that open the round, and Config 2’s narrowband frames', () => {
    const e = lab('一轮开头的 SP0 包').expect
    const sp0s = ofType(recs(), 'TX_START').filter((r) => r.frame.kind === 'uwbSp0')
    expect(sp0s[0].node).toBe('tag-1')
    expect(e).toContain(`${ms3(sp0s[0].t)} ms 标签发出一个 SP0 包，${ms3(sp0s[1].t)} ms 锚点回复一个，各 ${(MMS_SP0_NS / 1000).toFixed(1)} µs`)
    const nb = (kind: string) => [...new Set(ofType(recs(NBA), 'TX_START').filter((r) => r.frame.kind === kind).map((r) => r.frame.txTimeNs / 1000))]
    expect(nb('nbPoll')).toEqual(nb('nbResp'))
    expect(e).toContain(`NBPOLL 与 NBRESP，各 ${nb('nbPoll')[0]} µs`)
    expect(e).toContain(`NBREPORT 各 ${nb('nbReport')[0]} µs`)
    // no narrowband frame in the base round
    expect(ofType(recs(), 'TX_START').some((r) => r.frame.kind.startsWith('nb'))).toBe(false)
  })

  it('lab 1: the figure draws the SP0 segments and the leading fragment to scale', () => {
    const sizes = uwbUwbdHeadFields().fields.map((f) => f.size)
    const s = MMS_SP0_SEGMENT_NS
    expect(sizes).toEqual([s.sync / 1000, s.sfd / 1000, s.phr / 1000, s.psdu / 1000, FRAG_NS / 1000])
  })

  it('lab 2: the level table is the channel law at 10 m and 20 m', () => {
    const rows = tableOf(lab('二十米处的锚点收不到轮询'), '这条走廊上的两个锚点').rows
    for (const [col, d] of [[1, 10], [2, 20]] as const) {
      const L = lossAt(d)
      expect(rows[0][col], `${d} m loss`).toBe(`${L.toFixed(2)} dB`)
      expect(rows[1][col], `${d} m fragment`).toBe(`${dbm(FRAG_DBM - L)} dBm`)
      expect(rows[2][col], `${d} m SP0`).toBe(`${dbm(UWB_TX_POWER_DBM - L)} dBm`)
      const m = UWB_TX_POWER_DBM - L - MMS_SP0_RX_SENS_DBM
      expect(rows[3][col], `${d} m margin`).toBe(m >= 0 ? `高出 ${m.toFixed(2)} dB` : `低了 ${(-m).toFixed(2)} dB`)
    }
    // the near anchor's fragments arrive at the level the table states, in the run itself
    const near = ofType(recs(), 'UWB_MMS_TRAIN').find((t) => t.node === 'anchor-1' || t.peer === 'anchor-1')!
    expect(dbm(near.rxDbm)).toBe(dbm(FRAG_DBM - lossAt(10)))
  })

  it('lab 2: the far anchor’s empty window, quoted as the log prints it, and the two reaches', () => {
    const e = lab('二十米处的锚点收不到轮询').expect
    const m = /([\d.]+) ms 写着 “([^”]+)”，([\d.]+) ms 标签在自己的窗口里也没有收到消息/.exec(e)
    expect(m).not.toBeNull()
    const timeouts = ofType(recs(), 'UWB_TIMEOUT')
    const quoted = timeouts.find((r) => fmtRecord(r).includes(m![2]))
    expect(quoted, m![2]).toBeDefined()
    expect(m![1]).toBe(ms3(quoted!.t))
    const tagMiss = timeouts.find((r) => r.node === 'tag-1' && r.t > quoted!.t)!
    expect(m![3]).toBe(ms3(tagMiss.t))
    // the far anchor never transmits at all
    expect(recs().some((r) => r.type === 'TX_START' && r.node === 'anchor-2')).toBe(false)
    expect(e).toContain(`SP0 包的作用距离是 ${reach(UWB_TX_POWER_DBM, MMS_SP0_RX_SENS_DBM).toFixed(2)} m`)
    expect(e).toContain(`单个片段是 ${reach(FRAG_DBM, UWB_RX_SENS_DBM).toFixed(2)} m`)
  })

  it('lab 2: counted once, at the fragment’s power, the far SP0 would clear the threshold', () => {
    const once = FRAG_DBM - lossAt(20)
    const mn = lab('二十米处的锚点收不到轮询').meaning
    expect(mn).toContain(`二十米处到达 ${dbm(once)} dBm`)
    expect(mn).toContain(`比 ${dbm(MMS_SP0_RX_SENS_DBM).replace('.00', '')} dBm 的门限高出 ${(once - MMS_SP0_RX_SENS_DBM).toFixed(2)} dB`)
    expect(once).toBeGreaterThan(MMS_SP0_RX_SENS_DBM)
  })

  it('lab 3: the far anchor’s two verdicts, its margin, and the report window that comes up empty', () => {
    const e = lab('零长控制阶段：捕获通过，报告送不回').expect
    const m = /([\d.]+) ms 与 ([\d.]+) ms 两条判定都是 (\d)\/(\d) 收到、余量 ([\d.]+) dB、检出；而 ([\d.]+) ms 是 “([^”]+)”/.exec(e)
    expect(m).not.toBeNull()
    const far = ofType(recs(NONE), 'UWB_MMS_TRAIN').filter((t) => t.node === 'anchor-2' || t.peer === 'anchor-2')
    expect([m![1], m![2]]).toEqual([ms3(far[0].t), ms3(far[1].t)])
    for (const t of far.slice(0, 2)) {
      expect(String(t.heard)).toBe(m![3])
      expect(m![4]).toBe(String(uwbUwbdScenario('none').uwb!.mms.rsfs))
      expect(t.marginDb.toFixed(1)).toBe(m![5])
      expect(t.detected).toBe(true)
    }
    const miss = ofType(recs(NONE), 'UWB_TIMEOUT').find((r) => fmtRecord(r).includes(m![7]))
    expect(miss, m![7]).toBeDefined()
    expect(m![6]).toBe(ms3(miss!.t))
  })

  it('lab 3: ranges per block, and which anchors they belong to', () => {
    const rows = tableOf(lab('零长控制阶段：捕获通过，报告送不回'), '三种控制面各自的测距结果').rows
    const anchorsOf = (v?: number): string[] =>
      [...new Set(ofType(recs(v), 'UWB_RANGE').map((r) => (r.node === 'tag-1' ? r.peer : r.node)))].sort()
    for (const [i, v] of [NBA, undefined, NONE].entries()) {
      const n = ofType(recs(v), 'UWB_RANGE').length
      expect(rows[i][3], String(v)).toBe(String(n))
      expect(lab('零长控制阶段：捕获通过，报告送不回').expect).toContain(`${n} 个`)
      expect(anchorsOf(v).includes('anchor-2'), String(v)).toBe(rows[i][2] === '测得')
      expect(anchorsOf(v)).toContain('anchor-1')
    }
  })
})
