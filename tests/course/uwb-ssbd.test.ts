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
import { SSBD_BIGGEST_BF, SSBD_BIGGEST_UNIT_US, SSBD_DEFAULTS, uwbSsbd, uwbSsbdScenario } from '../../src/course/uwb/uwb-ssbd'
import { uwbNbaScenario } from '../../src/course/uwb/uwb-nba'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ScenarioSchema, UwbSsbdSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { NB_LBT_CCA_US, NB_LBT_THRESHOLD_DBM, NB_POLL_BYTES, NB_REPORT_BYTES, nbPpduNs } from '../../src/uwb/nb'
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
const wifiData = (rs: TLRecord[]) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data')
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

  it('the why states the run’s conclusions', () => {
    const why = uwbSsbd.why!
    expect(why).toContain(`记为 ${NB_LBT_CCA_US} µs`)
    expect(why).toContain(`延迟上界是 ${BOUND / US} µs`)
    expect(why).toContain(`${STALE / US} µs 是按两条已经改掉的旧前提算出的`)
    expect(why).toContain(`测距恢复到 ${rangesOf()} 次`)
    expect(why).toContain(`按块跳过的规则测得 ${rangesOf(V_PER_BLOCK)} 次`)
    expect(why).toContain(`等待要从消息自己的窗口里扣除，测得 ${rangesOf(V_BIGGEST)} 次`)
    // 2026-11-11: with listen-before-talk off the tag still loses most rounds, to the access point's
    // BlockAck answering an A-MPDU it received only in part (IEEE Std 802.11-2024 §10.12, the
    // MPDUs before the narrowband message began pass their FCS) and to its CTS.
    expect(why).toContain(`完全不听也只测得 ${rangesOf(V_OFF)} 次`)
    const hitByAp = ofType(recs(V_OFF), 'UWB_INTERFERED')
    expect(hitByAp.length).toBeGreaterThan(0)
    expect(new Set(hitByAp.map((r) => r.node))).toEqual(new Set([TAG]))
  })
})

describe('uwb-ssbd · ② says what the engine does, and the engine does it', () => {
  it('per slot, per device: no per-block reading, one record per narrowband transmission', () => {
    expect(ofType(recs(), 'UWB_NB_LBT')).toEqual([])
    expect(ssbdOf()).toHaveLength(nbTx(recs()).length)
    const perRound = new Map<string, number[]>()
    for (const r of ssbdOf()) {
      const k = `${r.node}|${r.block}|${r.round}`
      perRound.set(k, [...(perRound.get(k) ?? []), r.slot])
    }
    for (const [k, slots] of perRound) expect(new Set(slots).size, k).toBe(slots.length)
    // the backoff is a whole number of units between 0 and BF
    for (const r of ssbdOf()) {
      expect(Number.isInteger(r.drawnUnits)).toBe(true)
      expect(r.drawnUnits).toBeGreaterThanOrEqual(0)
      expect(r.drawnUnits).toBeLessThanOrEqual(r.bf)
    }
  })

  it('the threshold is −71.02 dBm; persistence and frequency-domain deferral are absent', () => {
    for (const r of ssbdOf()) expect(r.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
    expect(NB_LBT_THRESHOLD_DBM.toFixed(2)).toBe('-71.02')
    expect(implRow('门限').sim).toContain('−71.02 dBm')
    expect(Object.keys(SSBD_DEFAULTS).sort()).toEqual(['maxBackoffs', 'maxBf', 'minBf', 'txOnEnd', 'unitBackoffUs'])
    expect(implRow('持久化').kind).toBe('absent')
    expect(implRow('频域延后').kind).toBe('absent')
    expect(implRow('感知时长').kind).toBe('differs')
  })

  it('an overlong draw is cut down, and the record keeps both numbers', () => {
    const clamped = ssbdOf(V_BIGGEST).filter((r) => r.outcome === 'clamped')
    expect(clamped.length).toBeGreaterThan(0)
    for (const r of clamped) expect(r.drawnUnits * SSBD_BIGGEST_UNIT_US * US).toBeGreaterThan(r.backoffNs)
  })
})

describe('uwb-ssbd · ③ every figure the labs print is the run', () => {
  it('lab 1: 74 µs by the formula, 46 µs under the stale premises, 424 / 392 µs of room', () => {
    const l = lab('上界要按公式算')
    expect(BOUND).toBe(74 * US)
    expect(STALE).toBe(46 * US)
    const f1 = blockOf(l, 'formula', '缺省参数下的延迟上界')
    expect(f1.text).toContain(`= ${BOUND / US} µs`)
    const backoffs = BOUND - (SSBD_DEFAULTS.maxBackoffs + 1) * NB_LBT_CCA_US * US
    expect(f1.note).toContain(`最多合计 ${backoffs / US} µs`)
    expect(blockOf(l, 'formula', '代入两条旧前提').text).toContain(`= ${STALE / US} µs`)
    const room = blockOf(l, 'formula', '一个窄带窗口的余量').text
    expect(room).toContain(`2 × ${SLOT_NS / US} µs − ${nbPpduNs(NB_POLL_BYTES) / US} µs = ${SLACK_POLL / US} µs`)
    expect(room).toContain(`2 × ${SLOT_NS / US} µs − ${nbPpduNs(NB_REPORT_BYTES) / US} µs = ${SLACK_REPORT / US} µs`)
    expect(l.expect).toContain(`缺省参数给出 ${BOUND / US} µs`)
    expect(l.expect).toContain(`给出 ${STALE / US} µs`)
    expect(l.expect).toContain(`余量是 ${SLACK_POLL / US} µs，Report 窗口是 ${SLACK_REPORT / US} µs`)
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
    const lbt = ofType(recs(V_PER_BLOCK), 'UWB_NB_LBT')
    expect(l.expect).toContain(`按块规则判了 ${lbt.length} 次忙，其中 ${lbt.filter((x) => x.node === TAG).length} 次是手机的，测得 ${rangesOf(V_PER_BLOCK)} 次`)
    // 2026-11-11: 「不少于」, not 「相当」 — 12 against 8 since the access point's BlockAck to a partly
    // received A-MPDU spoils the tag's narrowband receptions; the defaults withhold no message.
    expect(l.expect).toContain(`缺省的 SSBD 测得 ${rangesOf()} 次，不少于关闭先听后发的 ${rangesOf(V_OFF)} 次`)
    expect(rangesOf()).toBeGreaterThanOrEqual(rangesOf(V_OFF))
    expect([undefined, V_PER_BLOCK, V_BIGGEST, V_OFF].map(fixesOf)).toEqual([0, 0, 0, 0])
    expect(l.expect).toContain('四种设置都没有解算出定位')
    expect(l.expect).toContain(`只有 ${rangesOf(V_BIGGEST)} 次`)
  })

  it('lab 3: the bound, the slack and the Wi-Fi frames; 45 of 76 sent on the end action', () => {
    const l = lab('缺省值靠收尾动作，不靠等待')
    const rows = blockOf(l, 'table', '上界、余量与需要等待的那些帧').rows
    const times = wifiData(recs()).map((r) => r.frame.txTimeNs)
    const moved = Math.max(...nbTx(recs()).map((r) => r.t % SLOT_NS))
    expect(new Set(nbTx(recs(V_OFF)).map((r) => r.t % SLOT_NS))).toEqual(new Set([0]))
    expect(rows).toEqual([
      ['算法的延迟上界（缺省参数）', `${BOUND / US} µs`],
      ['六段退避的最大总和', `${(BOUND - 6 * NB_LBT_CCA_US * US) / US} µs`],
      ['窄带消息在自身时隙内的最大推迟量，实测', `${moved / US} µs`],
      ['一个 Poll 窗口的余量', `${SLACK_POLL / US} µs`],
      ['场景里最短的 Wi-Fi 数据帧', `${(Math.min(...times) / US).toFixed(1)} µs`],
      ['场景里最长的 Wi-Fi 数据帧', `${(Math.max(...times) / US).toFixed(1)} µs`],
      [`${times.length} 帧中长于 ${SLACK_POLL / US} µs 的`, `${times.filter((t) => t > SLACK_POLL).length} 帧`],
    ])
    expect(times.filter((t) => t < BOUND)).toEqual([])
    const first = ssbdOf().find((r) => r.outcome === 'txOnEnd')!
    expect(l.expect).toContain(`「${fmtRecord(first)}」`)
    const rs = ssbdOf()
    const busy = rs.filter((r) => r.foreignDbm >= r.thresholdDbm)
    const sent = rs.filter((r) => r.outcome === 'txOnEnd')
    expect(sent).toHaveLength(busy.length)
    for (const r of sent) expect(r.nb).toBe(SSBD_DEFAULTS.maxBackoffs)
    expect(l.expect).toContain(`${rs.length} 条感知记录里 ${busy.length} 条读到忙，这 ${sent.length} 条都是退避用尽后照常发送`)
    expect(l.expect).toContain(`短于 ${BOUND / US} µs`)
    expect(l.meaning).toContain(`最多 ${moved / US} µs`)
  })

  it('lab 4: the biggest backoff that fits — 75 of 113 cut down, 50 to nothing, 55 timeouts, 1 range', () => {
    const l = lab('退避调大，测距反而更少')
    expect(l.variant).toBe(V_BIGGEST)
    const s = uwbSsbdScenario('biggest').uwb!.mms.ssbd!
    expect([s.minBf, s.maxBf, s.unitBackoffUs]).toEqual([SSBD_BIGGEST_BF, SSBD_BIGGEST_BF, SSBD_BIGGEST_UNIT_US])
    expect(l.steps[0]).toContain(`退避因子固定为 ${SSBD_BIGGEST_BF}，退避单位 ${SSBD_BIGGEST_UNIT_US} µs，一次最多等待 ${SSBD_BIGGEST_BF * SSBD_BIGGEST_UNIT_US} µs，小于 Poll 窗口的 ${SLACK_POLL / US} µs 余量`)
    expect(Math.max(...ssbdOf(V_BIGGEST).map((r) => r.backoffNs)) / US).toBe(SSBD_BIGGEST_BF * SSBD_BIGGEST_UNIT_US)
    const rs = ssbdOf(V_BIGGEST)
    const clamped = rs.filter((r) => r.outcome === 'clamped')
    const zero = clamped.filter((r) => r.backoffNs === 0)
    expect(l.expect).toContain(`${rs.length} 条感知记录里 ${clamped.length} 条被截断，其中 ${zero.length} 条实际等待 0`)
    expect(l.expect).toContain(`${ofType(recs(V_BIGGEST), 'UWB_TIMEOUT').length} 次超时，只测得 ${rangesOf(V_BIGGEST)} 次`)
    const longest = Math.max(...wifiData(recs()).map((r) => r.frame.txTimeNs))
    expect(SLACK_POLL).toBeLessThan(longest)
    expect(l.meaning).toContain(`${SLACK_POLL / US} µs 的余量本来就短于场景里最长的 ${(longest / US).toFixed(1)} µs 那一帧`)
  })

  it('the quiz repeats the run', () => {
    const text = uwbSsbd.quiz.map((q) => `${q.q} ${q.options.join(' ')} ${q.explain}`).join(' ')
    const rs = ssbdOf()
    expect(text).toContain(`${rs.length} 次感知里有 ${rs.filter((r) => r.outcome === 'txOnEnd').length} 次读到忙`)
    expect(text).toContain(`最短的 Wi-Fi 数据帧是 ${(Math.min(...wifiData(recs()).map((r) => r.frame.txTimeNs)) / US).toFixed(1)} µs`)
    expect(text).toContain(`测距恢复到 ${rangesOf()} 次`)
    expect(text).toContain(`${STALE / US} µs，本课算出 ${BOUND / US} µs`)
  })
})
