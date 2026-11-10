/**
 * `@amp-intro`, in the standard-first shape (2026-11-11).
 *
 * ① cites the P802.11bp documents each rule comes from; ② says what the engine does about each,
 * and the rows are checked against the engine here; every figure the labs print is read back out
 * of the lesson's own text and compared with a run, so editing a number without the engine
 * agreeing turns this red, and so does an engine change that moves a number the lesson prints.
 */
import { describe, expect, it } from 'vitest'
import { ampIntro, ampIntroScenario } from '../../src/course/amp/amp-intro'
import { ScenarioSchema } from '../../src/model/scenario'
import {
  AMP_AP_CHANNEL_2G, AMP_DL_REQ_SINR_DB, AMP_SCRAMBLER_INIT, AMP_SIFS_NS, AMP_TAG_DL_SENS_DBM, AMP_UL_REQ_SINR_DB, ampUlSensDbm,
} from '../../src/engine/amp'
import { readFileSync } from 'node:fs'
import { EDCA_PARAMS, ERP_2G, QAP_EDCA_PARAMS } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import type { TLRecord } from '../../src/model/records'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { rssiOn } from './rssi'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS
const AP = 'ap#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g'] as const

/** The capture margin is private to channel.ts, so it is read out of the source rather than re-typed. */
const CAPTURE_MARGIN_DB = Number(/const CAPTURE_MARGIN_DB = (\d+)/.exec(readFileSync('src/engine/channel.ts', 'utf8'))![1])

const recs = (variant?: number): TLRecord[] => runOf(ampIntro, variant, RUN_NS)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const us = (cell: string): number => Number(/^([\d ]+) µs$/.exec(cell)![1].replace(/ /g, ''))
/** From the first TXOP's CTS-to-self to the end of its last Ack (the Ack before the second CTS). */
const firstTxopNs = (rs: TLRecord[]): number => {
  const cts = txs(rs, 'cts')
  const end = cts.length > 1 && cts[1].t < 5 * MS ? cts[1].t : 5 * MS
  return ends(rs, 'ampAck').filter((r) => r.t < end).pop()!.t - cts[0].t
}
/** Every TXOP of a run, CTS-to-self start to last Ack end. */
const txopSpans = (rs: TLRecord[]): number[] => {
  const cts = txs(rs, 'cts').map((r) => r.t)
  const ackEnds = ends(rs, 'ampAck').map((r) => r.t)
  return cts.map((t, i) => (ackEnds.filter((e) => e > t && (i + 1 >= cts.length || e < cts[i + 1])).pop() ?? NaN) - t)
    .filter((x) => Number.isFinite(x))
}
/** The slot count of each trigger the router sent in its first poll. */
const firstPollSlots = (rs: TLRecord[]): number[] =>
  ofType(rs, 'AMP_ROUND').filter((r) => r.node === AP && r.t < 50 * MS).map((r) => r.slots)

const lab = (heading: string): Lab => {
  const l = ampIntro.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = ampIntro.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => ampIntro.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(ampIntro, { runNs: RUN_NS })

describe('amp-intro · the lesson', () => {
  it('is in the standard-first shape, as the AMP track\'s first lesson', () => {
    expect(isStandardFirst(ampIntro)).toBe(true)
    expect(MODULES[ampIntro.module].title).toBe('环境能量物联网（802.11bp）')
    expect(ampIntro.limits).toEqual([])
    expect(ampIntro.observe).toEqual([])
    expect(ampIntro.tryThis).toEqual([])
    expect(ampIntro.needs).toEqual(['radio-primer', 'frame-anatomy'])
  })

  it('the scenario and the variant pass the schema, unchanged since the timeline hashes were taken', () => {
    expect(ampIntro.scenario()).toEqual(ampIntroScenario({ dlKbps: 250, ulKbps: 250 }))
    expect(() => ScenarioSchema.parse(ampIntro.scenario())).not.toThrow()
    for (const v of ampIntro.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    const s = ampIntro.scenario()
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', 'amp', 'amp'])
    expect(s.nodes[0].ampAp).toMatchObject({ pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf' })
  })

  it('① names the document, the clause or the motion behind each point, and says the PDTs were adopted', () => {
    const std = stdText()
    for (const ref of ['11-24/1613r20', '11-26/1519r5', '11-26/1889r4', '11-25/1692r50', '11-26/1582r3',
      '§39.3.2.1', '§39.3.2.2', '§39.4', '#29', '#14', '#212', '#247', '#224', '#187', '#248', '#250',
      '§9.3.1.3', '§9.2.5.2', '§10.3.2.15', '§10.23.2.9', '表 9-194', 'D0.5', '表 39-1', '#182', 'dot11QAPEDCATable']) {
      expect(std, ref).toContain(ref)
    }
    expect(std).toContain('#87 与 #90 无异议')
    // ① is standard text only: no simulator behaviour in it
    expect(std).not.toContain('本仿真器')
  })
})

describe('amp-intro · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('a tag never senses, backs off, waits an IFS or holds a NAV; it only answers a trigger', () => {
    for (const t of TAGS) {
      for (const type of ['CCA_BUSY', 'BACKOFF_DRAW', 'IFS_START', 'NAV_SET'] as const) {
        expect(rs.filter((r) => r.type === type && 'node' in r && r.node === t), `${t} / ${type}`).toEqual([])
      }
      // every response follows a trigger the tag decoded in the same round
      for (const r of txs(rs, 'ampResp').filter((x) => x.node === t)) {
        const trig = ofType(rs, 'RX_OK').filter((x) => x.node === t && x.frame.kind === 'ampTrigger' && x.t < r.t).pop()
        expect(trig, `${t} answered at ${r.t} without a trigger`).toBeDefined()
        expect(r.t - trig!.t).toBeLessThan(5 * MS)
      }
    }
  })

  it('the router contends on AC_BK: its AIFS is AIFSN 7', () => {
    expect(implRow('接入点取得信道').kind).toBe('faithful')
    expect(EDCA_PARAMS[0].name).toBe('BK')
    expect(EDCA_PARAMS[0].aifsn).toBe(7)
    const ifs = ofType(rs, 'IFS_START').filter((r) => r.node === AP && r.kind === 'AIFS' && r.untilNs > r.t)
    expect(ifs.length).toBeGreaterThan(0)
    expect(new Set(ifs.map((r) => r.ac))).toEqual(new Set([0]))
  })

  // 2026-11-11 (W7b): every AMP TXOP now fits the AP's AC_BK TXOP limit (§10.23.2.9, Table 9-194,
  // dot11QAPEDCATable). Until then the engine sent the 4190 µs round whole and ② said `differs`.
  it('every TXOP fits the AC_BK TXOP limit; a round of four slots is two TXOPs of two at 250 kb/s', () => {
    const row = implRow('一次传输机会的长度')
    expect(row.kind).toBe('faithful')
    expect(QAP_EDCA_PARAMS[0].txopLimitNs).toBe(2_528_000)
    expect(row.standard).toContain('2.528 ms')
    expect(firstTxopNs(rs)).toBe(2434 * US)
    expect(row.sim).toContain('一次 2434 µs')
    for (const span of txopSpans(rs)) expect(span).toBeLessThanOrEqual(QAP_EDCA_PARAMS[0].txopLimitNs)
    for (const span of txopSpans(recs(0))) expect(span).toBeLessThanOrEqual(QAP_EDCA_PARAMS[0].txopLimitNs)
    expect(firstPollSlots(rs)).toEqual([2, 2])
    expect(firstPollSlots(recs(0))).toEqual([4])
    expect(implRow('一轮分几次传输机会').kind).toBe('choice')
    expect(implRow('一轮分几次传输机会').sim).toContain('250 kb/s 下每次 2 个，1 Mb/s 下一次 4 个')
    // the four slots of every round are all run: twenty triggers of two
    expect(ofType(rs, 'AMP_SLOT').length).toBe(4 * 10)
    expect(ofType(rs, 'AMP_ROUND').filter((r) => r.t < RUN_NS).length).toBe(20)
  })

  it('the CTS-to-self is the simulator\'s choice, and its Duration covers its TXOP plus one SIFS', () => {
    expect(implRow('轮前的保护').kind).toBe('choice')
    const cts = txs(rs, 'cts')[0]
    expect(cts.frame.dst).toBe(cts.frame.src)
    expect(cts.frame.durationFieldNs).toBe(firstTxopNs(rs) - cts.frame.txTimeNs)
    expect(cts.frame.durationFieldNs).toBe(2384 * US)
  })

  it('every draw is in [0, ACW] and lands in slot ABOC + 1 when ABOC < N, else sits out', () => {
    const acw = 2 ** 2 - 1
    const abocs = ofType(rs, 'AMP_ABOC')
    for (const a of abocs) {
      expect(a.acw).toBe(acw)
      expect(a.aboc).toBeGreaterThanOrEqual(0)
      expect(a.aboc).toBeLessThanOrEqual(acw)
      expect(a.slot).toBe(a.aboc < 2 ? a.aboc + 1 : null)
    }
    expect(abocs.some((a) => a.slot === null)).toBe(true)
    expect(implRow('ABOC 与时隙').sim).toContain('250 kb/s 下每帧触发帧 N = 2')
  })

  it('Channel Indication 6, zero UL shift, seed index 0 (0x5C): what every trigger carries', () => {
    expect(implRow('信道指示').kind).toBe('value')
    expect(implRow('上行频移').kind).toBe('choice')
    expect(implRow('扰码种子编号').kind).toBe('choice')
    expect(AMP_SCRAMBLER_INIT[0]).toBe(0x5c)
    for (const t of txs(rs, 'ampTrigger')) {
      expect(t.frame.amp!.channel).toBe(AMP_AP_CHANNEL_2G)
      expect(t.frame.amp!.ulShiftMhz).toBe(0)
      expect(t.frame.amp!.seedIdx).toBe(0)
    }
    expect(implRow('信道指示').sim).toContain(`信道 ${AMP_AP_CHANNEL_2G}`)
    expect(implRow('扰码种子编号').sim).toContain('0x5C')
  })

  it('slot 1 starts one AMP SIFS after the trigger; every later slot one AMP SIFS after an Ack', () => {
    expect(AMP_SIFS_NS).toBe(10 * US)
    expect(ERP_2G.sifsNs).toBe(AMP_SIFS_NS)
    const trigEnds = ends(rs, 'ampTrigger').map((r) => r.t)
    const ackEnds = ends(rs, 'ampAck').map((r) => r.t)
    for (const s of ofType(rs, 'AMP_SLOT')) {
      const ref = s.slot === 1 ? trigEnds : ackEnds
      expect(ref.includes(s.t - AMP_SIFS_NS), `slot ${s.slot} at ${s.t}`).toBe(true)
    }
  })

  it('an Ack names the tag heard in the slot, or the router; one follows the last slot too', () => {
    const acks = txs(rs, 'ampAck')
    expect(acks.length).toBe(4 * 10)
    // every trigger's last slot is followed by an Ack too: twenty of them, one per TXOP
    expect(new Set(acks.map((r) => r.frame.txTimeNs)).size).toBe(1)
    expect(new Set(acks.map((r) => r.frame.mbps))).toEqual(new Set([txs(rs, 'ampTrigger')[0].frame.mbps]))
    for (const a of acks) {
      const heard = ofType(rs, 'RX_OK').find((x) => x.node === AP && x.frame.kind === 'ampResp' && x.t < a.t && x.t > a.t - 600 * US)
      expect(a.frame.dst, `Ack at ${a.t}`).toBe(heard ? heard.from : a.frame.src)
    }
    expect(implRow('最后一个时隙之后').kind).toBe('choice')
    expect(acks.some((a) => a.frame.amp!.ackFor === 2 && a.frame.dst === a.frame.src)).toBe(true)
  })

  it('the receive thresholds are the model values ② prints', () => {
    const sim = implRow('接收门限').sim
    expect(sim).toContain(`−${-AMP_TAG_DL_SENS_DBM} dBm`)
    expect(sim).toContain(`下行 ${AMP_DL_REQ_SINR_DB} dB`)
    expect(sim).toContain(`250 kb/s 上行 ${AMP_UL_REQ_SINR_DB[250]} dB`)
    expect(sim).toContain(`约 −${-Math.round(ampUlSensDbm(250))} dBm`)
    const two = implRow('两路作答相叠').sim
    expect(two).toContain(`上行 ${AMP_UL_REQ_SINR_DB[250]} dB`)
    expect(two).toContain(`强 ${CAPTURE_MARGIN_DB} dB 以上`)
  })
})

describe('amp-intro · ③ every figure the labs print is the run', () => {
  const rs = recs()

  it('lab 1: the first round on the router\'s lane, row by row', () => {
    const rows = tableOf(lab('一轮轮询，逐微秒'), '路由器泳道上的第一次传输机会').rows
    const secondCts = txs(rs, 'cts')[1].t
    const cts = txs(rs, 'cts')[0]
    const trig = txs(rs, 'ampTrigger')[0]
    const slots = ofType(rs, 'AMP_SLOT').filter((r) => r.t < secondCts)
    const acks = txs(rs, 'ampAck').filter((r) => r.t < secondCts)
    const resp = txs(rs, 'ampResp').filter((r) => r.t < secondCts)
    expect(rows).toHaveLength(2 + 2 * slots.length)
    const names: Record<string, string> = { 'tag-1#2g': 'Fridge tag', 'tag-2#2g': 'Door tag', 'tag-1': 'Fridge tag', 'tag-2': 'Door tag' }
    expect(rows[0][0]).toBe(`CTS-to-self，Duration ${cts.frame.durationFieldNs / US} µs`)
    expect([us(rows[0][1]), us(rows[0][2])]).toEqual([cts.t / US, (cts.t + cts.frame.txTimeNs) / US])
    expect(rows[1][0]).toBe(`AMP 触发帧，${slots.length} 个时隙 × ${(slots[0].untilNs - slots[0].t) / US} µs`)
    expect([us(rows[1][1]), us(rows[1][2])]).toEqual([trig.t / US, (trig.t + trig.frame.txTimeNs) / US])
    for (let k = 0; k < slots.length; k++) {
      const sRow = rows[2 + 2 * k], aRow = rows[3 + 2 * k]
      const who = resp.find((r) => r.frame.amp!.slot === k + 1)
      expect(sRow[0]).toBe(`时隙 ${k + 1}：${who ? names[who.node] : '无人'}`)
      expect([us(sRow[1]), us(sRow[2])]).toEqual([slots[k].t / US, slots[k].untilNs / US])
      const a = acks[k]
      expect(aRow[0]).toBe(`第 ${k + 1} 帧 Ack → ${a.frame.dst === a.frame.src ? '路由器' : names[a.frame.dst]}`)
      expect([us(aRow[1]), us(aRow[2])]).toEqual([a.t / US, (a.t + a.frame.txTimeNs) / US])
    }
  })

  it('lab 1: the two slot openings and the reservation sentence', () => {
    const e = lab('一轮轮询，逐微秒').expect
    const trigEnd = ends(rs, 'ampTrigger')[0].t / US
    const ack1End = ends(rs, 'ampAck')[0].t / US
    const slots = ofType(rs, 'AMP_SLOT').filter((r) => r.t < 5 * MS)
    expect(e).toContain(`结束后 ${AMP_SIFS_NS / US} µs 开始（${trigEnd} + ${AMP_SIFS_NS / US} = ${slots[0].t / US} µs）`)
    expect(e).toContain(`在 AC_BK 的 ${QAP_EDCA_PARAMS[0].txopLimitNs / US} µs 之内`)
    expect(e).toContain(`由 ${txs(rs, 'cts')[1].t / US} µs 开始的第二次传输机会发出`)
    expect(e).toContain(`（${ack1End} + ${AMP_SIFS_NS / US} = ${slots[1].t / US} µs）`)
    const cts = txs(rs, 'cts')[0]
    const ctsEnd = (cts.t + cts.frame.txTimeNs) / US
    expect(e).toContain(`CTS-to-self 在 ${ctsEnd} µs 结束，它的 Duration 到 ${ctsEnd + cts.frame.durationFieldNs / US} µs 为止`)
    expect(ctsEnd + cts.frame.durationFieldNs / US).toBe(firstTxopNs(rs) / US)
  })

  it('lab 2: the two collisions, and the second\'s census', () => {
    const rows = tableOf(lab('读数为什么丢失'), '一秒十轮里的两次碰撞').rows
    const coll = ofType(rs, 'COLLISION')
    expect(rows).toHaveLength(coll.length)
    const fmt = (ns: number): string => {
      const v = String(ns / US)
      return v.length > 3 ? `${v.slice(0, -3)} ${v.slice(-3)} µs` : `${v} µs`
    }
    for (const [i, c] of coll.entries()) {
      const slot = ofType(rs, 'AMP_SLOT').find((s) => s.untilNs === c.t)!
      const ack = txs(rs, 'ampAck').find((a) => a.t > c.t)!
      const lost = ofType(rs, 'AMP_RESULT').filter((r) => !r.acked && r.t > c.t && r.t < c.t + MS)
      expect(rows[i][0]).toBe(String(Math.floor(c.t / (100 * MS)) + 1))
      expect(rows[i][1]).toBe(String(slot.slot))
      expect(rows[i][2]).toBe(fmt(c.t))
      expect(ack.frame.dst).toBe(ack.frame.src)
      expect(rows[i][3]).toBe('路由器自己')
      expect(rows[i][4]).toBe(fmt(lost[0].t))
      expect([...c.nodes].sort()).toEqual([...TAGS])
    }
    const e = lab('读数为什么丢失').expect
    const acks = txs(rs, 'ampAck')
    const m = /一秒钟十轮、(\d+) 次传输机会，(\d+) 帧 Ack 里 (\d+) 帧写的是某个标签，(\d+) 帧写的是路由器自己/.exec(e)!
    expect(Number(m[1])).toBe(ofType(rs, 'AMP_ROUND').filter((r) => r.t < RUN_NS).length)
    expect(txs(rs, 'cts').filter((r) => r.t < RUN_NS).length).toBe(Number(m[1]))
    expect(Number(m[2])).toBe(acks.length)
    expect(Number(m[3])).toBe(acks.filter((a) => a.frame.dst !== a.frame.src).length)
    expect(Number(m[4])).toBe(acks.filter((a) => a.frame.dst === a.frame.src).length)
    for (const [t, name] of [[TAGS[0], 'Fridge tag'], [TAGS[1], 'Door tag']] as const) {
      const rr = ofType(rs, 'AMP_RESULT').filter((r) => r.node === t)
      const n = new RegExp(`${name} 作答 (\\d+) 次，(\\d+) 次被确认、(\\d+) 次丢失`).exec(e)!
      expect(rr.length, name).toBe(Number(n[1]))
      expect(rr.filter((r) => r.acked).length).toBe(Number(n[2]))
      expect(rr.filter((r) => !r.acked).length).toBe(Number(n[3]))
    }
  })

  it('lab 2: the two tags arrive 6.7 dB apart, short of the 10 dB a 250 kb/s answer needs', () => {
    const s = ampIntro.scenario()
    const L = buildLinkTable(s.nodes, s.walls)
    const gap = rssiOn('2g', L, 'tag-1', 'ap') - rssiOn('2g', L, 'tag-2', 'ap')
    const m = /两个标签到达路由器的电平相差 ([\d.]+) dB，低于 (\d+) dB 的门限/.exec(lab('读数为什么丢失').expect)!
    expect(m[1]).toBe(gap.toFixed(1))
    expect(Number(m[2])).toBe(AMP_UL_REQ_SINR_DB[250])
    expect(gap).toBeLessThan(AMP_UL_REQ_SINR_DB[250])
    // the router locks on the stronger one and fails it; nothing is captured
    const fails = ofType(rs, 'RX_FAIL').filter((r) => r.node === AP)
    expect(fails.map((r) => [r.from, r.reason])).toEqual([['tag-1', 'collision'], ['tag-1', 'collision']])
  })

  it('lab 3: each rate against the AC_BK TXOP limit, and the slot arithmetic', () => {
    const l = lab('一轮放进几次 AC_BK 传输机会')
    const rows = tableOf(l, '一轮四个时隙与 AC_BK 的 TXOP 限制').rows
    const limitUs = QAP_EDCA_PARAMS[0].txopLimitNs / US
    const runs: [string, TLRecord[]][] = [['250 kb/s', recs()], ['1 Mb/s', recs(0)]]
    for (const [i, [rate, r]] of runs.entries()) {
      const per = firstPollSlots(r)
      expect(rows[i][0]).toBe(rate)
      expect(Number(rows[i][1])).toBe(per[0])
      expect(us(rows[i][2])).toBe(firstTxopNs(r) / US)
      expect(Number(rows[i][3])).toBe(per.length)
      expect(us(rows[i][4])).toBe(limitUs)
    }
    // the formula: CTS 50 + SIFS 10 + trigger 618 + N × (10 + 528 + 10 + 330)
    const r = recs()
    const cts = txs(r, 'cts')[0].frame.txTimeNs / US
    const trig = txs(r, 'ampTrigger')[0].frame.txTimeNs / US
    const slot = ofType(r, 'AMP_SLOT')[0]
    const slotUs = (slot.untilNs - slot.t) / US
    const ackUs = txs(r, 'ampAck')[0].frame.txTimeNs / US
    const per = 2 * AMP_SIFS_NS / US + slotUs + ackUs
    const f = (l.blocks!.find((b) => b.kind === 'formula') as Extract<Block, { kind: 'formula' }>)
    expect(f.text).toContain(`${cts} + ${ERP_2G.sifsNs / US} + ${trig} + N × (10 + ${slotUs} + 10 + ${ackUs}) ≤ ${limitUs}`)
    for (const n of [2, 3, 4]) expect(f.text).toContain(`N = ${n}：${cts + 10 + trig + n * per} µs`)
    expect(f.note).toContain(`占 ${per} µs`)
    expect(cts + 10 + trig + 2 * per).toBe(firstTxopNs(r) / US)
    expect(cts + 10 + trig + 3 * per).toBeGreaterThan(limitUs)
    expect(l.expect).toContain(`三个时隙已要 ${cts + 10 + trig + 3 * per} µs`)
    expect(l.expect).toContain(`比限制短 ${limitUs - firstTxopNs(recs(0)) / US} µs`)
    expect(ampIntro.why).toContain(`要 ${cts + 10 + trig + 4 * per} µs，放不进这个限制`)
    expect(ampIntro.why).toContain(`每次长 ${firstTxopNs(r) / US} µs`)
  })

  it('every jump lands on a record of the base run', () => {
    for (const j of ampIntro.jumps) expect(rs.some(j.find), j.label).toBe(true)
  })
})
