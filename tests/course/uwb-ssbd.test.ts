/**
 * `@uwb-ssbd`, in the standard-first shape (2026-11-10).
 *
 * ① is the draft's §10.45 (P802.15.4ab, not IEEE Std 802.15.4-2024): the algorithm of 15-22/0486r5
 * as 15-24/0121r2 changed it, its defaults, the stale 46 µs appendix example and the frequency-domain
 * proposal 15-26/0365r2. ② says what the engine does with each — the five attributes are scene
 * settings, the CCA is an instantaneous reading (audit #20), the threshold is ETSI's, an overlong
 * draw is cut down, persistence and frequency-domain deferral are absent — and each row is checked
 * here. ③'s figures are read back out of the lesson and compared with a run.
 */
import { describe, expect, it } from 'vitest'
import { SSBD_BIGGEST_UNIT_US, SSBD_DEFAULTS, uwbSsbd, uwbSsbdScenario } from '../../src/course/uwb/uwb-ssbd'
import { uwbNbaScenario } from '../../src/course/uwb/uwb-nba'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema, UwbSsbdSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { NB_PHY_CCA_DURATION_US, NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES, NB_REPORT_BYTES, nbPpduNs } from '../../src/uwb/nb'
import { nbSlotSlackNs, rstuNs, ssbdBoundNs } from '../../src/uwb/phy'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1300 * MS
const TAG = 'uwb-1'
const NB_KINDS = new Set(['nbPoll', 'nbResp', 'nbReport'])
const V_PER_BLOCK = 0
const V_BIGGEST = 1
const V_OFF = 2

const recs = (v?: number): TLRecord[] => runOf(uwbSsbd, v, RUN_NS)
const ssbdOf = (v?: number) => ofType(recs(v), 'UWB_SSBD')
const rangesOf = (v?: number): number => ofType(recs(v), 'UWB_RANGE').length
const fixesOf = (v?: number): number => ofType(recs(v), 'UWB_POSITION').length
const nbTx = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => NB_KINDS.has(r.frame.kind))
const SLOT_NS = rstuNs(uwbSsbdScenario('defaults').uwb!.slotRstu)
const BOUND = ssbdBoundNs(SSBD_DEFAULTS)
const STALE = ssbdBoundNs({ ...SSBD_DEFAULTS, backoffMultiplier: 2, ccaUs: 1 })
const SLACK_POLL = nbSlotSlackNs(SLOT_NS, NB_POLL_BYTES)
const SLACK_REPORT = nbSlotSlackNs(SLOT_NS, NB_REPORT_BYTES)

const lab = (heading: string): Lab => {
  const l = uwbSsbd.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === kind && b.heading === heading)
  expect(t, `${kind} 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: K }>
}
const implRow = (topic: string) => {
  const row = uwbSsbd.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => uwbSsbd.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''} ${'rows' in b ? b.rows.flat().join(' ') : ''}`).join(' ')

lessonShapeSuite(uwbSsbd, { runNs: RUN_NS })

describe('uwb-ssbd · the lesson', () => {
  it('is in the standard-first shape, after the coexistence lesson', () => {
    expect(isStandardFirst(uwbSsbd)).toBe(true)
    expect(MODULES[uwbSsbd.module].title).toBe('窄带控制面')
    expect(COURSE_ORDER.indexOf('uwb-ssbd')).toBe(COURSE_ORDER.indexOf('uwb-nba-coexist') + 1)
    expect(uwbSsbd.limits).toEqual([])
    expect(uwbSsbd.observe).toEqual([])
    expect(uwbSsbd.tryThis).toEqual([])
  })

  it('loads uwb-nba’s pair round with nothing but `ssbd` changed', () => {
    const base = uwbSsbdScenario('defaults')
    const pair = uwbNbaScenario('pairwise')
    expect({ ...base, uwb: undefined }).toEqual({ ...pair, uwb: undefined })
    expect(base.uwb!.mms.ssbd).toEqual(SSBD_DEFAULTS)
    expect(uwbSsbdScenario('perBlock')).toEqual(pair)
    expect(uwbSsbdScenario('off')).toEqual(uwbNbaScenario('noLbt'))
    for (const v of ['defaults', 'perBlock', 'biggest', 'off'] as const) expect(() => ScenarioSchema.parse(uwbSsbdScenario(v)), v).not.toThrow()
  })

  it('① names the draft clause and the documents, and the proposal’s defaults', () => {
    const std = stdText()
    for (const s of ['§10.45', '§10.37', '§10.39.8.3', '15-22/0486r5', '15-24/0010r36', '15-24/0121r2', '15-26/0179r1', '15-26/0365r2', 'CID 489/493', 'CID 490/495', '46 µs']) expect(std, s).toContain(s)
    const rows = (uwbSsbd.standard!.find((b) => b.kind === 'table') as Extract<Block, { kind: 'table' }>).rows
    expect(rows.map((r) => r[1])).toEqual([String(SSBD_DEFAULTS.minBf), String(SSBD_DEFAULTS.maxBf), String(SSBD_DEFAULTS.maxBackoffs), `${SSBD_DEFAULTS.unitBackoffUs} µs`, SSBD_DEFAULTS.txOnEnd ? '照常发送' : '记为失败'])
    expect(UwbSsbdSchema.parse({})).toEqual(SSBD_DEFAULTS)
  })

  // 2026-11-11 (audit #20): every CCA lasts phyCcaDuration (128 µs), so the defaults' bound is
  // 788 µs, longer than a POLL's window, and the in-router channel never lets a POLL out.
  it('the why states the run’s conclusions', () => {
    const why = uwbSsbd.why!
    expect(why).toContain(`即 ${NB_PHY_CCA_DURATION_US} µs`)
    expect(why).toContain(`延迟上界是 ${BOUND / US} µs，长于一条 Poll 在自己窗口里的 ${SLACK_POLL / US} µs 余量`)
    expect(why).toContain(`${STALE / US} µs 是按两条已经改掉的旧前提算出的`)
    expect([rangesOf(), rangesOf(V_PER_BLOCK), rangesOf(V_BIGGEST)]).toEqual([0, 0, 0])
    expect(why).toContain('1.3 秒一个距离也没有')
    expect(why).toContain(`才得到 ${rangesOf(V_OFF)} 个距离`)
    expect(Math.floor(SLACK_POLL / (NB_PHY_CCA_DURATION_US * US))).toBe(3)
    expect(why).toContain('三次感知都判忙之后窗口就用完了')
  })
})

describe('uwb-ssbd · ② says what the engine does, and the engine does it', () => {
  it('per slot, per device: no CSMA-CA record, one ending record per attempt', () => {
    expect(ofType(recs(), 'UWB_NB_LBT')).toEqual([])
    const perRound = new Map<string, number[]>()
    for (const r of ssbdOf()) {
      const k = `${r.node}|${r.block}|${r.round}`
      perRound.set(k, [...(perRound.get(k) ?? []), r.slot])
    }
    for (const [k, slots] of perRound) expect(new Set(slots).size, k).toBe(slots.length)
    expect(perRound.size).toBe(28)
  })

  it('the threshold is −71.02 dBm; persistence and frequency-domain deferral are absent', () => {
    for (const r of ssbdOf()) expect(r.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
    expect(NB_LBT_THRESHOLD_DBM.toFixed(2)).toBe('-71.02')
    expect(implRow('门限').sim).toContain('−71.02 dBm')
    expect(Object.keys(SSBD_DEFAULTS).sort()).toEqual(['maxBackoffs', 'maxBf', 'minBf', 'txOnEnd', 'unitBackoffUs'])
    expect(implRow('持久化').kind).toBe('absent')
    expect(implRow('频域延后').kind).toBe('absent')
    expect(implRow('感知时长').kind).toBe('value')
  })

  it('an overlong draw is cut down, and the record keeps both numbers', () => {
    const clamped = ssbdOf(V_BIGGEST).filter((r) => r.outcome === 'clamped')
    expect(clamped.length).toBeGreaterThan(0)
    for (const r of clamped) expect(r.drawnUnits * SSBD_BIGGEST_UNIT_US * US).toBeGreaterThan(r.backoffNs)
  })
})

describe('uwb-ssbd · ③ every figure the labs print is the run', () => {
  it('lab 1: 788 µs by the formula, 46 µs under the stale premises, 424 / 392 µs of room', () => {
    const l = lab('上界要按公式算')
    expect(BOUND).toBe(788 * US)
    expect(STALE).toBe(46 * US)
    const f1 = blockOf(l, 'formula', '缺省参数下的延迟上界')
    expect(f1.text).toContain(`+ ${NB_PHY_CCA_DURATION_US} µs ] = ${BOUND / US} µs`)
    const backoffs = BOUND - (SSBD_DEFAULTS.maxBackoffs + 1) * NB_PHY_CCA_DURATION_US * US
    expect(f1.note).toContain(`最多合计 ${backoffs / US} µs`)
    expect(blockOf(l, 'formula', '代入两条旧前提').text).toContain(`= ${STALE / US} µs`)
    const room = blockOf(l, 'formula', '一个窄带窗口的余量').text
    expect(room).toContain(`2 × ${SLOT_NS / US} µs − ${nbPpduNs(NB_POLL_BYTES) / US} µs = ${SLACK_POLL / US} µs`)
    expect(room).toContain(`2 × ${SLOT_NS / US} µs − ${nbPpduNs(NB_REPORT_BYTES) / US} µs = ${SLACK_REPORT / US} µs`)
    expect(l.expect).toContain(`缺省参数给出 ${BOUND / US} µs`)
    expect(l.expect).toContain(`给出 ${STALE / US} µs`)
    expect(l.expect).toContain(`余量是 ${SLACK_POLL / US} µs，Report 窗口是 ${SLACK_REPORT / US} µs`)
    expect(BOUND).toBeGreaterThan(SLACK_POLL)
  })

  it('lab 2: four settings over 1.3 s', () => {
    const l = lab('四种设置，同一个场景')
    const rows = blockOf(l, 'table', '四种设置，1.3 秒').rows
    const runs: [number | undefined, boolean][] = [[V_OFF, false], [V_PER_BLOCK, false], [undefined, true], [V_BIGGEST, true]]
    runs.forEach(([v, ssbd], i) => {
      expect(rows[i][1], String(v)).toBe(String(rangesOf(v)))
      expect(rows[i][2], String(v)).toBe(String(fixesOf(v)))
      expect(rows[i][3], String(v)).toBe(ssbd ? String(ssbdOf(v).length) : '—')
    })
    expect(nbTx(recs(V_PER_BLOCK))).toEqual([])
    expect(l.expect).toContain(`只有关闭先听后发测得 ${rangesOf(V_OFF)} 次`)
  })

  it('lab 3: the first record, and how many CCAs the POLL’s window holds', () => {
    const l = lab('窗口在收尾动作之前就用完了')
    const first = ssbdOf()[0]
    expect(l.expect).toContain(`第一条记录在 ${(first.t / MS).toFixed(3)} ms：「${fmtRecord(first)}」`)
    expect(new Set(ssbdOf().map((r) => r.outcome))).toEqual(new Set(['noRoom']))
    expect(ssbdOf().every((r) => r.node === TAG)).toBe(true)
    expect(l.expect).toContain(`${ssbdOf().length} 条感知记录全部是这个结论`)
    const rows = blockOf(l, 'table', '一个 Poll 窗口里放得下几次感知').rows
    expect(rows.map((r) => r[1])).toEqual([
      `${NB_PHY_CCA_DURATION_US} µs`, `${SLACK_POLL / US} µs`,
      `${Math.floor(SLACK_POLL / (NB_PHY_CCA_DURATION_US * US))} 次`, `${SSBD_DEFAULTS.maxBackoffs + 1} 次`,
    ])
    // the first record comes three CCAs into the window
    expect((first.t % SLOT_NS)).toBe(3 * NB_PHY_CCA_DURATION_US * US + 3 * US)
  })
})
