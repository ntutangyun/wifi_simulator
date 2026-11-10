/**
 * `@uwb-nba-coexist`, in the standard-first shape (2026-11-10).
 *
 * ① separates the early TG4ab proposal 15-22/0381r5 (UNII-5 always, ≥ 9 µs CCA at −75 dBm/MHz, a
 * busy channel skipping the block) from the draft's later §10.39.8.3 (only where regulation
 * requires it, then CSMA-CA or SSBD per transmit slot; 15-25/0307r1, 15-25/0427r4) and from the
 * D04 comments that did not get in (15-26/0244r1, 15-26/0348r1). ② says the engine still follows
 * the early proposal, and this file checks that it does — the per-block skip and the UNII-5 rule
 * (audit #19), the instantaneous reading (#20), the whole-width Wi-Fi comparison (#21) are W5/W6
 * work that has not landed. ③'s figures are read back out of the lesson and compared with a run.
 */
import { describe, expect, it } from 'vitest'
import { uwbNbaCoexist } from '../../src/course/uwb/uwb-nba-coexist'
import { NBA_ANCHORS, NBA_CHANNELS, ROUTER_POS, TAG_POS, TAG_Z, uwbNbaScenario } from '../../src/course/uwb/uwb-nba'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'
import { fmtRecord } from '../../src/ui/format'
import { CCA_ED_DBM } from '../../src/engine/phy'
import { NB_LBT_CCA_US, NB_LBT_EDT_DBM_PER_MHZ, NB_LBT_THRESHOLD_DBM, nbCenterMhz, nbChannelForBlock, nbLbtRequired } from '../../src/uwb/nb'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const RUN_NS = 1300 * MS
const SEC = RUN_NS / 1e9
const BLOCKS = 7
const TAG = 'uwb-1'
const UWB_IDS = new Set([...NBA_ANCHORS.map((a) => a.id), TAG])
const NB_KINDS = new Set(['nbPoll', 'nbResp', 'nbReport'])
const V_OUT = 0
const V_HOP = 1
const V_NOLBT = 2

const recs = (v?: number): TLRecord[] => runOf(uwbNbaCoexist, v, RUN_NS)
const neg = (s: string): string => s.replace(/^-/, '−')
const lbt = (v?: number) => ofType(recs(v), 'UWB_NB_LBT')
const tagRanges = (v?: number) => ofType(recs(v), 'UWB_RANGE').filter((r) => r.node === TAG)
const fixes = (v?: number) => ofType(recs(v), 'UWB_POSITION')
const skippedBlocks = (v: number | undefined, node: string): number[] => [...new Set(lbt(v).filter((l) => l.node === node).map((l) => l.block))]
const nbFrames = (v?: number) => ofType(recs(v), 'TX_START').filter((r) => NB_KINDS.has(r.frame.kind))
const wifiRxFail = (rs: TLRecord[]) => ofType(rs, 'RX_FAIL').filter((r) => !UWB_IDS.has(r.node))
/** Goodput in Mb/s, MSDU sizes taken from the engine's own ENQUEUE records. */
function mbps(rs: TLRecord[], node: string): number {
  const dropped = new Set(ofType(rs, 'DROP').map((r) => r.msduId))
  const bytes = new Map(ofType(rs, 'ENQUEUE').filter((r) => r.node === node).map((r) => [r.msduId, r.bytes]))
  let bits = 0
  for (const r of ofType(rs, 'DEQUEUE')) if (r.node === node && !dropped.has(r.msduId)) bits += 8 * (bytes.get(r.msduId) ?? 0)
  return bits / SEC / 1e6
}

const lab = (heading: string): Lab => {
  const l = uwbNbaCoexist.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = uwbNbaCoexist.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(uwbNbaCoexist, { sameSceneAs: 'uwb-nba', runNs: RUN_NS })

describe('uwb-nba-coexist · the lesson', () => {
  it('is in the standard-first shape, in the narrowband module', () => {
    expect(isStandardFirst(uwbNbaCoexist)).toBe(true)
    expect(MODULES[uwbNbaCoexist.module].title).toBe('窄带控制面')
    expect(uwbNbaCoexist.needs).toEqual(['uwb-nba', 'uwb-coexist'])
    expect(uwbNbaCoexist.limits).toEqual([])
    expect(uwbNbaCoexist.observe).toEqual([])
    expect(uwbNbaCoexist.tryThis).toEqual([])
  })

  it('① keeps the early proposal, the draft and the failed comments apart', () => {
    const std = uwbNbaCoexist.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const s of ['15-22/0381r5 §1.4.2', '§10.39.8.3', '15-25/0307r1', '15-25/0427r4', '15-26/0244r1', '15-26/0348r1', '25/14/1', '§27.3.22.6.3', 'ETSI EN 303 687', '2025/893']) expect(std, s).toContain(s)
    expect(std).toContain(`至少 ${NB_LBT_CCA_US} µs`)
    expect(std).toContain(`${neg(String(NB_LBT_EDT_DBM_PER_MHZ))} dBm/MHz`)
  })

  it('the why states the run’s conclusions', () => {
    const why = uwbNbaCoexist.why!
    const margins = ofType(recs(), 'UWB_MMS_TRAIN').filter((t) => t.detected).map((t) => t.marginDb)
    expect(Math.min(...margins)).toBeGreaterThan(30)
    expect(why).toContain('余量超过 30 dB')
    expect(skippedBlocks(undefined, TAG)).toHaveLength(BLOCKS)
    // 2026-11-11: none, where it was four. Since the router answers an A-MPDU it received in part
    // with a BlockAck (IEEE Std 802.11-2024 §10.12), its BlockAck and CTS land in the tag's
    // narrowband receptions — and with listening off the tag gets none either (21 before).
    expect(tagRanges()).toEqual([])
    expect(why).toContain('整段 1.3 秒一个距离也没有测得')
    expect(fixes()).toEqual([])
    expect(fixes(V_OUT)).toHaveLength(BLOCKS)
    expect(why).toContain(`关掉先听后发，手机仍然得到 ${tagRanges(V_NOLBT).length} 个距离`)
    expect(why).toContain(`有 ${ofType(recs(V_NOLBT), 'UWB_INTERFERED').length} 条与路由器发出的块确认`)
    const was = mbps(recs(V_OUT), 'laptop#6g')
    const now = mbps(recs(V_NOLBT), 'laptop#6g')
    expect(why).toContain(`下降 ${((was - now) / was * 100).toFixed(2)} %`)
  })
})

describe('uwb-nba-coexist · ② says what the engine does, and the engine does it', () => {
  it('channel centres reconstructed: 200 → 6301.25 MHz, 100 → 6051.25 MHz', () => {
    expect(nbCenterMhz(200)).toBe(6301.25)
    expect(nbCenterMhz(100)).toBe(6051.25)
    expect(implRow('信道规划').sim).toContain('200 号 6301.25 MHz，100 号 6051.25 MHz')
    expect(NBA_CHANNELS).toMatchObject({ base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200] })
  })

  it('differs: UNII-5 always listens; UNII-3 never, unless the scene forces it', () => {
    expect(implRow('何时执行先听后发').kind).toBe('differs')
    expect(nbLbtRequired(50, 'auto')).toBe(true)
    expect(nbLbtRequired(49, 'auto')).toBe(false)
    expect(nbLbtRequired(3, 'on')).toBe(true)
    expect(nbLbtRequired(200, 'off')).toBe(false)
  })

  it('differs: a busy check silences that device for the rest of the block', () => {
    expect(implRow('判忙之后').kind).toBe('differs')
    const rs = recs()
    for (const l of lbt()) {
      const end = (l.block + 1) * 200 * MS
      expect(ofType(rs, 'TX_START').filter((r) => r.node === l.node && NB_KINDS.has(r.frame.kind) && r.t > l.t && r.t < end), `${l.node}@${l.t}`).toEqual([])
    }
  })

  it('the threshold: −75 dBm/MHz over 2.5 MHz is −71.02 dBm; Wi-Fi ED is −62 dBm', () => {
    expect(NB_LBT_THRESHOLD_DBM.toFixed(2)).toBe('-71.02')
    expect(implRow('门限').sim).toContain('−71.02 dBm')
    for (const l of lbt()) expect(l.thresholdDbm).toBeCloseTo(NB_LBT_THRESHOLD_DBM, 9)
    expect(CCA_ED_DBM).toBe(-62)
    expect(implRow('Wi-Fi 的能量检测').sim).toContain('−62 dBm')
    for (const t of ['跳变的生成式', '感知时长', 'Wi-Fi 的能量检测']) expect(implRow(t).kind, t).toBe('differs')
  })
})

describe('uwb-nba-coexist · ③ every figure the labs print is the run', () => {
  it('lab 1: the first busy check, the tag’s seven, the blocks and the timeouts', () => {
    const e = lab('一次判忙，损失一个块').expect
    const first = lbt()[0]
    expect(e).toContain(`${(first.t / MS).toFixed(3)} ms 的「${fmtRecord(first)}」`)
    const tag = lbt().filter((l) => l.node === TAG)
    expect(new Set(tag.map((l) => l.block)).size).toBe(tag.length)
    expect(tag).toHaveLength(BLOCKS)
    const levels = [...new Set(tag.map((l) => l.foreignDbm.toFixed(2)))]
    expect(levels).toHaveLength(1)
    expect(e).toContain(`七次读到的都是 ${neg(levels[0])} dBm，比门限高 ${(tag[0].foreignDbm - NB_LBT_THRESHOLD_DBM).toFixed(1)} dB`)
    expect(e).toContain(`共记下 ${ofType(recs(), 'UWB_TIMEOUT').length} 次超时`)
  })

  it('lab 2: four control-channel settings', () => {
    const rows = tableOf(lab('控制信道的四种配置'), '控制信道的四种配置').rows
    const runs: (number | undefined)[] = [undefined, V_OUT, V_HOP, V_NOLBT]
    runs.forEach((v, i) => {
      const s = v === undefined ? uwbNbaScenario('base') : uwbNbaCoexist.variants![v].scenario()
      const list = s.uwb!.mms.nbChannels
      expect(rows[i][1], String(v)).toBe(list.length === 1 ? `${list[0]} · ${nbCenterMhz(list[0]).toFixed(2)} MHz` : list.join(' / '))
      const sk = skippedBlocks(v, TAG).length
      expect(rows[i][2], String(v)).toBe(sk === 0 ? '0' : `${sk} of ${BLOCKS}`)
      expect(rows[i][3], String(v)).toBe(String(tagRanges(v).length))
      expect(rows[i][4], String(v)).toBe(String(fixes(v).length))
    })
    const e = lab('控制信道的四种配置').expect
    expect(e).toContain(`跳变恢复了${['', '一', '两', '三'][fixes(V_HOP).length]}个块`)
    expect(e).toContain(`得到 ${tagRanges(V_NOLBT).length} 个距离、${fixes(V_NOLBT).length} 次定位`)
    expect(skippedBlocks(V_NOLBT, TAG)).toEqual([])
    expect(uwbNbaScenario('base').nodes.filter((n) => n.uwb?.role === 'anchor')).toHaveLength(3)
    expect(uwbNbaScenario('outside').nodes.filter((n) => n.uwb?.role === 'anchor')).toHaveLength(4)
    expect(uwbNbaScenario('base').uwb!.mms.oneToMany).toBe(true)
    expect(uwbNbaScenario('outside').uwb!.mms.oneToMany).toBe(false)
  })

  it('lab 3: the hop, block by block', () => {
    const e = lab('逐块看跳变').expect
    const s = uwbNbaCoexist.variants![V_HOP].scenario()
    const seq = Array.from({ length: BLOCKS }, (_, b) => nbChannelForBlock(NBA_CHANNELS.hop, s.seed!, b))
    expect(e).toContain(`依次用 ${seq.join('、')} 号信道`)
    // the run agrees, wherever a narrowband frame or a busy check names its channel
    for (const r of nbFrames(V_HOP)) {
      const b = Math.floor(r.t / (200 * MS))
      expect(r.frame.uwb?.nb?.channel, String(r.t)).toBe(seq[b])
    }
    for (const l of lbt(V_HOP)) expect(l.channel).toBe(seq[l.block])
    const busy = skippedBlocks(V_HOP, TAG)
    expect(e).toContain(`第 ${busy.join('、')} 块落在路由器的 80 MHz 之内`)
    const fixBlocks = fixes(V_HOP).map((f) => f.block)
    expect(e).toContain(`第 ${fixBlocks.join('、')} 块在外，各解出一次定位`)
  })

  it('lab 4: the rule off — 72 messages, 64 Wi-Fi failures, 7.22 % of the laptop’s goodput', () => {
    const l = lab('关掉先听后发，代价转给 Wi-Fi')
    const rows = tableOf(l, '规则开与关，Wi-Fi 一侧的变化').rows
    expect(rows[0].slice(1)).toEqual([String(nbFrames().length), String(wifiRxFail(recs()).length)])
    expect(rows[1].slice(1)).toEqual([String(nbFrames(V_NOLBT).length), String(wifiRxFail(recs(V_NOLBT)).length)])
    const was = mbps(recs(V_OUT), 'laptop#6g')
    const now = mbps(recs(V_NOLBT), 'laptop#6g')
    expect(l.expect).toContain(`从 ${was.toFixed(3)} Mb/s 降到 ${now.toFixed(3)} Mb/s，减少 ${(was - now).toFixed(2)} Mb/s，即 ${((was - now) / was * 100).toFixed(2)} %`)
    // the narrowband messages lost at the phone, each under one of the router's control frames
    const rs = recs(V_NOLBT)
    const hit = ofType(rs, 'UWB_INTERFERED')
    for (const i of hit) {
      expect(i.node).toBe(TAG)
      const nb = ofType(rs, 'TX_START').find((t) => t.node === i.from && NB_KINDS.has(t.frame.kind) && t.t <= i.t && t.t + t.frame.txTimeNs + 1000 >= i.t)!
      expect(nb, String(i.t)).toBeDefined()
      const ctl = ofType(rs, 'TX_START').filter((t) => t.node === 'ap#6g' && ['ba', 'cts', 'ack'].includes(t.frame.kind)
        && t.t < i.t && t.t + t.frame.txTimeNs > nb.t)
      expect(ctl.length, String(i.t)).toBeGreaterThan(0)
    }
    const levels = [...new Set(hit.map((i) => i.foreignDbm.toFixed(2)))]
    expect(levels).toHaveLength(1)
    expect(l.expect).toContain(`有 ${hit.length} 条窄带消息接收失败`)
    expect(tagRanges(V_NOLBT)).toEqual([])
    expect(l.expect).toContain('手机因此一个距离也没有得到')
    expect(l.expect).toContain(`外来功率 ${neg(levels[0])} dBm`)
  })
})

describe('uwb-nba-coexist · the quiz repeats the run', () => {
  it('quotes the router distance, the margins and the Wi-Fi side as measured', () => {
    const text = uwbNbaCoexist.quiz.map((q) => `${q.q} ${q.options.join(' ')} ${q.explain}`).join(' ')
    const d = Math.hypot(TAG_POS.x - ROUTER_POS.x, TAG_POS.y - ROUTER_POS.y, TAG_Z - ROUTER_POS.z)
    expect(text).toContain(`离路由器只有 ${d.toFixed(2)} m`)
    expect(uwbNbaCoexist.why).toContain(`离一台 Wi-Fi 7 路由器 ${d.toFixed(1)} m`)
    expect(text).toContain(`${wifiRxFail(recs(V_NOLBT)).length} 个帧接收失败`)
    expect(text).toContain(`从 ${nbFrames().length} 条增加到 ${nbFrames(V_NOLBT).length} 条`)
    expect(text).toContain(`从 ${wifiRxFail(recs()).length} 帧增加到 ${wifiRxFail(recs(V_NOLBT)).length} 帧`)
    const was = mbps(recs(V_OUT), 'laptop#6g')
    const now = mbps(recs(V_NOLBT), 'laptop#6g')
    expect(text).toContain(`下降 ${((was - now) / was * 100).toFixed(2)} %`)
    expect(text).toContain(`从 ${was.toFixed(3)} Mb/s 降到 ${now.toFixed(3)} Mb/s`)
    expect(tagRanges()).toEqual([])
    expect(text).toContain('七个块里一个距离也没有测得')
  })
})
