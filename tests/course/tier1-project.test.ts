/**
 * `@tier1-project`, in the standard-first shape (2026-11-11).
 *
 * The first half of the Tier 1 project, "the brief and the plan". ① is IEEE Std 802.11-2024 and
 * IEEE Std 802.11be-2024 only — the mechanisms the project exercises, each with its clause. ② says
 * what this simulator does for each, and is honest where it is not the standard: the scene runs
 * DCF with EDCA switched off, the symbol count uses the BCC formula for MCS 13, the ACK timeout
 * uses clause 17's 20 µs for a Wi-Fi 7 device. ③ keeps the project's task: every figure the brief
 * prints is a PREDICTION, and each one is read back out of the lab it is printed in and recomputed
 * here from the engine's own functions and the Bianchi solver; the few readings the labs send the
 * reader to (first frames, the gap after the first frame, the first backoff draw) are read off a
 * run.
 *
 * What the simulator actually does with this flat is pinned next door, in
 * tests/course/tier1-project-review.test.ts, against a 10 s run.
 */
import { describe, it, expect } from 'vitest'
import { projectFlat, tier1Project } from '../../src/course/tier1/tier1-project'
import { dcfTimes, saturationThroughput, solveBianchi } from '../../src/course/tier1/bianchiModel'
import { COURSE_ORDER, MODULES } from '../../src/course/curriculum'
import { ScenarioSchema } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import {
  ACK_BYTES, AMPDU_DELIMITER_BYTES, CW_MAX, CW_MIN, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, PHY_MODES, RATE_MARGIN_DB,
  SHORT_RETRY_LIMIT, SIFS_NS, SLOT_NS, ACK_TIMEOUT_NS, RX_START_DELAY_NS,
  ctrlRespRateForMode, mcsForRssi, mcsRateMbps, noiseDbm, reqSinrDb, toneRatio, txTimeModeNs,
  txTimeNs,
} from '../../src/engine/phy'
import { PL0_DB, PL_EXP, WALL_LOSS_DB, buildLinkTable, pathLossDb } from '../../src/engine/propagation'
import { lessonTexts } from '../../src/course/readability'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const RUN_NS = 30 * MS
const PAYLOAD_BITS = 12_000
const MSDU = 1500
const PARAMS = { W: 16, m: 6, attempts: 7 } as const

// 2026-11-11: an EHT PPDU's data field is always an A-MPDU (802.11be §9.7.3), so one MSDU goes out
// as a one-subframe A-MPDU with its 4-octet MPDU delimiter: L = 4 + 1500 + 24 + 4 = 1532, not 1528.
// Both rungs this flat uses happen to need the same symbol count either way (6 and 35).
const APEP = AMPDU_DELIMITER_BYTES + MSDU + MAC_HDR_BYTES + FCS_BYTES
function times(mcs: number): { dataNs: number; ackNs: number; respRate: number; tsNs: number; tcNs: number } {
  const dataNs = txTimeModeNs('eht', APEP, mcs, { widthMhz: 20 })
  const respRate = ctrlRespRateForMode('eht', mcs, mcsRateMbps('eht', mcs))
  const ackNs = txTimeNs(ACK_BYTES, respRate)
  return { dataNs, ackNs, respRate, tsNs: dataNs + SIFS_NS + ackNs + DIFS_NS, tcNs: dataNs + ACK_TIMEOUT_NS + DIFS_NS }
}
const mix = (ts: number[]): number => ts.reduce((a, b) => a + b, 0) / ts.length
function modelS(n: number, tsNs: number, tcNs: number): number {
  const { tau } = solveBianchi({ n, ...PARAMS })
  return saturationThroughput({ n, tau, slotNs: SLOT_NS, tsNs, tcNs, payloadBits: PAYLOAD_BITS }).mbps
}

// --- reading the lesson -------------------------------------------------------------------------
const EVERYWHERE = lessonTexts(tier1Project).map((t) => t.text).join('\n')
const STD = tier1Project.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join('\n')
const val = (s: string): number => Number(s.replace(/[\s,]/g, '').replace(/−/g, '-'))
const raw = (s: string, re: RegExp, what: string): string[] => {
  const m = re.exec(s)
  expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
  return m!.slice(1)
}
const figs = (s: string, re: RegExp, what: string): number[] => raw(s, re, what).map(val)
const same = (printed: string, measured: number, what: string): void => {
  const f = printed.replace(/[\s,]/g, '').replace(/−/g, '-')
  const dp = (f.split('.')[1] ?? '').length
  expect(Number(f), `${what} (to ${dp} decimals)`).toBe(Number(measured.toFixed(dp)))
}
const everyFig = (re: RegExp, what: string, least: number): string[] => {
  const out = [...EVERYWHERE.matchAll(re)].flatMap((m) => m.slice(1).filter((x) => x !== undefined))
  expect(out.length, `${what}: fewer occurrences than this test was written for`).toBeGreaterThanOrEqual(least)
  return out
}
type Tbl = Extract<Block, { kind: 'table' }>
const lab = (heading: string): Lab => {
  const l = tier1Project.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableNamed = (heading: string): Tbl => {
  const t = tier1Project.labs!.flatMap((l) => l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Tbl
}
const rowOf = (heading: string, starts: string): string[] => {
  const r = tableNamed(heading).rows.find((x) => x[0]!.startsWith(starts))
  expect(r, `row 「${starts}」 of 「${heading}」`).toBeDefined()
  return r!
}
const implRow = (topic: string) => {
  const row = tier1Project.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

const SCEN = projectFlat()
const NOISE = noiseDbm(20)
const TOP_MCS = PHY_MODES.eht.sensDbm.length - 1
const nodeOf = (id: string) => SCEN.nodes.find((n) => n.id === id)!
const linkTo = (id: string): number => buildLinkTable(SCEN.nodes, SCEN.walls).get(id)!.get('ap')!
const apart = (id: string): number => Math.hypot(nodeOf(id).pos.x - nodeOf('ap').pos.x, nodeOf(id).pos.y - nodeOf('ap').pos.y)
const rungOf = (id: string): number => mcsForRssi('eht', linkTo(id), undefined, 20)
const ndbpsOf = (mcs: number): number => PHY_MODES.eht.ndbps[mcs] * toneRatio('eht', 20)
const records = (): TLRecord[] => runOf(tier1Project, undefined, RUN_NS)
const firstDataOf = (id: string) => {
  const hit = records().find((r) => r.type === 'TX_START' && r.node === id && r.frame.kind === 'data')
  expect(hit, `no data frame from ${id}`).toBeDefined()
  return hit as Extract<TLRecord, { type: 'TX_START' }>
}

lessonShapeSuite(tier1Project, { runNs: RUN_NS })

describe('tier1-project · the lesson', () => {
  it('is standard-first, the tier’s project, with the second half right behind it', () => {
    expect(isStandardFirst(tier1Project)).toBe(true)
    expect(MODULES[tier1Project.module].title).toBe('第一阶段项目')
    expect(COURSE_ORDER.indexOf('bianchi-vs-sim')).toBeLessThan(COURSE_ORDER.indexOf('tier1-project'))
    expect(COURSE_ORDER.indexOf('tier1-project-review')).toBe(COURSE_ORDER.indexOf('tier1-project') + 1)
    expect(tier1Project.terms!.map((t) => t.term)).toEqual(['brief', 'link budget', 'margin', 'DCF'])
    expect(tier1Project.limits).toEqual([])
    expect(tier1Project.observe).toEqual([])
    expect(tier1Project.tryThis).toEqual([])
  })

  it('the scenario is small, deterministic, 20 MHz, one stream, EDCA off', () => {
    expect(SCEN.seed).toBe(7)
    expect(SCEN.nodes.length).toBe(4)
    expect(SCEN.rtsThresholdBytes).toBeGreaterThan(MSDU)
    for (const n of SCEN.nodes) {
      expect(n.caps.widthMhz).toBe(20)
      expect(n.caps.nss ?? 1).toBe(1)
      expect(n.caps.features.edca ?? false).toBe(false)
      expect(n.caps.features.ampdu ?? false).toBe(false)
      expect(n.caps.features.txop ?? false).toBe(false)
    }
    expect(() => ScenarioSchema.parse(SCEN)).not.toThrow()
    for (const v of tier1Project.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('cites each clause it teaches in ①, standard only', () => {
    for (const c of ['§10.3.4.2', '§10.3.3', '§10.3.4.4', '§10.3.2.11', '式 10-6', '表 17-24', '表 27-61', '表 36-76', '§36.3.13.3.3', '表 36-67', '§10.6.1', '§10.6.6.5.2', '§17.1.1']) {
      expect(STD, c).toContain(c)
    }
    expect(STD).toContain('不动点出自 Bianchi 的论文，是一个模型，不是标准内容')
  })

  it('① prints the standard’s constants and rates, and the engine’s tables agree', () => {
    const [cwMin, cwMax, retry] = figs(STD, /aCWmin 为 (\d+)、aCWmax 为 (\d+)（表 17-24）；同一帧的尝试次数达到 dot11ShortRetryLimit（默认 (\d+)）/, '① on the window')
    expect([cwMin, cwMax, retry]).toEqual([CW_MIN, CW_MAX, SHORT_RETRY_LIMIT])
    const [sifs, slot, difs] = figs(STD, /aSIFSTime 为 (\d+) µs、时隙（slot time）aSlotTime 为 (\d+) µs，DIFS 为 (\d+) µs/, '① on the timing')
    expect([sifs, slot, difs]).toEqual([SIFS_NS / 1000, SLOT_NS / 1000, DIFS_NS / 1000])
    const [cl17] = figs(STD, /第 17 章为 (\d+) µs（表 17-24），HE 为 (\d+) µs/, '① on aRxPHYStartDelay')
    expect(cl17).toBe(RX_START_DELAY_NS / 1000)
    // Table 36-76: the engine's N_DBPS and rate for the two rungs this flat uses
    const [b13, r13, b2, r2, sym] = figs(STD, /码率 5\/6，每个符号（symbol）(\d+) 个数据比特，([\d.]+) Mb\/s；EHT-MCS 2 是 QPSK（quadrature phase-shift keying）、码率 3\/4，每个符号 (\d+) 个数据比特，([\d.]+) Mb\/s。一个数据符号 12.8 µs，加上保护间隔共 ([\d.]+) µs/, '① on Table 36-76')
    expect([b13, b2]).toEqual([ndbpsOf(13), ndbpsOf(2)])
    expect([r13, r2]).toEqual([mcsRateMbps('eht', 13), mcsRateMbps('eht', 2)])
    expect(sym * 1000).toBe(PHY_MODES.eht.symNs)
    // Table 36-67: the sensitivities the engine converts into required SINRs
    const [s2, s3, s13] = figs(STD, /QPSK 3\/4 为 (−\d+) dBm，16-QAM 1\/2 为 (−\d+) dBm，4096-QAM 5\/6 为 (−\d+) dBm/, '① on Table 36-67')
    expect([s2, s3, s13]).toEqual([PHY_MODES.eht.sensDbm[2], PHY_MODES.eht.sensDbm[3], PHY_MODES.eht.sensDbm[13]])
    const [m1, m2, m3] = figs(STD, /强制速率是 (\d+)、(\d+)、(\d+) Mb\/s/, '① on the mandatory rates')
    expect([m1, m2, m3]).toContain(times(13).respRate)
    expect([m1, m2, m3]).toContain(times(2).respRate)
  })
})

describe('tier1-project · ② says what the engine does, and the engine does it', () => {
  it('has three `differs` rows and more than one kind', () => {
    expect(tier1Project.implementation!.filter((r) => r.kind === 'differs').map((r) => r.topic))
      .toEqual(['接入方式', 'ACK 超时', '数据帧的时长'])
    expect(new Set(tier1Project.implementation!.map((r) => r.kind)).size).toBeGreaterThan(2)
  })

  it('ACK timeout: 20 µs for every generation, 45 µs; HE’s 24 µs would give 49', () => {
    const [t, he] = figs(implRow('ACK 超时').sim, /ACK 超时为 (\d+) µs[\s\S]*?应为 (\d+) µs/, '② on the ACK timeout')
    expect(t * 1000).toBe(ACK_TIMEOUT_NS)
    expect(he * 1000).toBe(SIFS_NS + SLOT_NS + 24_000)
    expect(ACK_TIMEOUT_NS).toBe(SIFS_NS + SLOT_NS + RX_START_DELAY_NS)
  })

  it('airtime: the BCC numerator for every rung, a 48 µs preamble', () => {
    const [service, perByte, tail] = figs(implRow('数据帧的时长').sim, /⌈\((\d+) \+ (\d+)·L \+ (\d+)\) \/ 每符号比特数⌉/, '② on the formula')
    expect([service, perByte, tail]).toEqual([16, 8, 6])
    const [pre] = figs(implRow('数据帧的时长').sim, /前导码取 (\d+) µs/, '② on the preamble')
    expect(pre * 1000).toBe(PHY_MODES.eht.preambleNs)
    // MCS 13 is one of the LDPC-only rungs, and the engine still counts symbols the BCC way
    expect(txTimeModeNs('eht', APEP, 13, { widthMhz: 20 })).toBe(PHY_MODES.eht.preambleNs + Math.ceil((16 + 8 * APEP + 6) / ndbpsOf(13)) * PHY_MODES.eht.symNs)
    expect(firstDataOf('sta-1').frame.apepBytes).toBe(APEP)
  })

  it('the rung: sensitivity turned into a required SINR, plus 3 dB', () => {
    expect(RATE_MARGIN_DB).toBe(3)
    expect(implRow('能用哪一级').sim).toContain('3 dB 余量')
    for (const id of ['sta-1', 'sta-2']) expect(firstDataOf(id).frame.mcs).toBe(rungOf(id))
  })

  it('path loss, brick and noise floor: the values ② states', () => {
    const [pl0, exp, base] = figs(implRow('路径损耗与墙').sim, /取 ([\d.]+) \+ (\d+)·log(\d+)\(d\) dB，一堵砖墙 (\d+) dB/, '② on path loss')
    expect(pl0).toBe(PL0_DB)
    expect(exp).toBe(10 * PL_EXP)
    expect(pathLossDb(base)).toBeCloseTo(pl0 + exp, 9)
    expect(figs(implRow('路径损耗与墙').sim, /一堵砖墙 (\d+) dB/, 'brick')[0]).toBe(WALL_LOSS_DB.brick)
    same(raw(implRow('噪声地板').sim, /取 (−[\d.]+) dBm/, '② on the floor')[0]!, NOISE, 'the floor')
  })

  it('ACK rate: 24 Mb/s after MCS 13, 12 Mb/s after MCS 2', () => {
    const [a, b] = figs(implRow('确认帧的速率').sim, /MCS 13 之后是 (\d+) Mb\/s，MCS 2 之后是 (\d+) Mb\/s/, '② on the ACK rate')
    expect([a, b]).toEqual([times(13).respRate, times(2).respRate])
  })

  it('no propagation delay: the ACK starts exactly one SIFS after the data frame ends', () => {
    const ends = ofType(records(), 'TX_END').filter((r) => r.frame.kind === 'data' && r.node === 'sta-1')
    const ack = ofType(records(), 'TX_START').find((r) => r.frame.kind === 'ack' && ends.some((e) => r.t - e.t === SIFS_NS))
    expect(ack).toBeDefined()
    expect(figs(implRow('传播时延与时钟').sim, /算到 ([\d.]+) µs/, '② on precision')[0]).toBe(0.1)
    expect(times(13).tsNs % 100).toBe(0)
  })
})

describe('tier1-project · ③ the labs: the brief, the four predictions, the three variants', () => {
  it('lab 1: the brief puts every device where the scene does, and the call is what the phone sends', () => {
    for (const [label, id] of [['路由器', 'ap'], ['书房笔记本', 'sta-1'], ['客厅笔记本', 'sta-2'], ['手机', 'sta-3']] as const) {
      const r = rowOf('题面', label)
      const [x, y, dbm] = figs(r[1]!, /\((\d+), (\d+)\), (\d+) dBm/, `${label}: position`)
      expect([x, y, dbm]).toEqual([nodeOf(id).pos.x, nodeOf(id).pos.y, nodeOf(id).txPowerDbm])
    }
    const msdu = firstDataOf('sta-1').frame.apepBytes! - AMPDU_DELIMITER_BYTES - MAC_HDR_BYTES - FCS_BYTES
    for (const v of everyFig(/饱和上传，(\d+) 字节载荷/g, 'the payload', 2)) expect(val(v)).toBe(msdu)
    const [periodMs, bytes] = figs(rowOf('题面', '手机')[2]!, /每 (\d+) ms 上行（uplink, UL）与下行（downlink, DL）各 (\d+) 字节/, 'the call')
    const longer = [...new Simulation(projectFlat()).runUntil(10 * periodMs * MS).records]
    const call = longer.filter((r): r is Extract<TLRecord, { type: 'ARRIVAL' }> => r.type === 'ARRIVAL')
      .filter((r) => r.node === 'sta-3' || r.dst === 'sta-3')
    expect(call.length).toBeGreaterThan(2)
    expect(new Set(call.map((r) => r.bytes))).toEqual(new Set([bytes]))
    const ul = call.filter((r) => r.node === 'sta-3')
    const gaps = ul.slice(1).map((r, i) => r.t - ul[i]!.t)
    expect(Math.floor(Math.min(...gaps) / MS)).toBe(periodMs)
    // the four questions, and the plan
    const l = lab('读题面：先看平面图，不要运行')
    const four = l.blocks!.find((b) => b.kind === 'list') as Extract<Block, { kind: 'list' }>
    expect(four.items.map((s) => s.slice(0, 3))).toEqual(['（a）', '（b）', '（c）', '（d）'])
    const [d1, d2, w] = raw(l.expect, /书房笔记本离路由器 ([\d.]+) m，中间没有墙；客厅笔记本离路由器 ([\d.]+) m，中间隔一堵砖墙。四台设备都是 (\d+) MHz/, 'lab 1 expect')
    same(d1!, apart('sta-1'), 'near distance')
    same(d2!, apart('sta-2'), 'far distance')
    expect(val(w!)).toBe(20)
    for (const v of everyFig(/(\d+) MHz/g, 'the width', 4)) expect(val(v)).toBe(nodeOf('ap').caps.widthMhz)
  })

  it('lab 2 (a): the two link budgets, cell for cell, and the rung the margin excludes', () => {
    const l = lab('（a）到达了多少，能用哪一级')
    const [w, floorDbm] = raw(l.expect, /一条 (\d+) MHz 信道上的噪声地板是 (−[\d.]+) dBm/, 'lab 2 expect: floor')
    expect(val(w!)).toBe(20)
    same(floorDbm!, NOISE, 'the noise floor')
    for (const [label, id] of [['书房笔记本', 'sta-1'], ['客厅笔记本', 'sta-2']] as const) {
      const r = rowOf('（a）预测：到达了多少，能用哪一级', label)
      const rx = linkTo(id)
      const snr = rx - NOISE
      same(raw(r[1]!, /^([\d.]+) m/, 'distance')[0]!, apart(id), `${label}: distance`)
      same(r[2]!.replace(' dB', ''), pathLossDb(apart(id)), `${label}: path loss`)
      same(r[3]!.replace(' dBm', ''), rx, `${label}: level`)
      same(r[4]!.replace(' dB', ''), snr, `${label}: SNR`)
      const [mcs, mbps] = raw(r[5]!, /MCS (\d+), ([\d.]+) Mb\/s/, `${label}: rung`)
      expect(val(mcs!)).toBe(rungOf(id))
      same(mbps!, mcsRateMbps('eht', val(mcs!)), `${label}: rate`)
      const wallDb = nodeOf(id).txPowerDbm - pathLossDb(apart(id)) - rx
      expect(wallDb > 0, `${label}: 「砖墙」 exactly when a wall is on the ray`).toBe(/砖墙/.test(r[1]!))
      if (r[6]!.includes('✓')) {
        const [took, m1, tookPlus, next, m2, nextPlus] = raw(r[6]!, /([\d.]+) \+ (\d+) = ([\d.]+) dB ✓ · ([\d.]+) \+ (\d+) = ([\d.]+) dB ✗/, `${label}: margin`)
        same(took!, reqSinrDb('eht', val(mcs!)), 'own rung')
        same(next!, reqSinrDb('eht', val(mcs!) + 1), 'next rung')
        expect([val(m1!), val(m2!)]).toEqual([RATE_MARGIN_DB, RATE_MARGIN_DB])
        same(tookPlus!, reqSinrDb('eht', val(mcs!)) + RATE_MARGIN_DB, 'own + margin')
        same(nextPlus!, reqSinrDb('eht', val(mcs!) + 1) + RATE_MARGIN_DB, 'next + margin')
        expect(val(tookPlus!)).toBeLessThanOrEqual(Number(snr.toFixed(2)))
        expect(val(nextPlus!)).toBeGreaterThan(Number(snr.toFixed(2)))
      } else {
        expect(val(mcs!)).toBe(TOP_MCS)
      }
    }
    const [nl, nm, fl, fs, fm] = raw(l.expect, /书房笔记本到达 (−[\d.]+) dBm，用 MCS (\d+)；客厅笔记本到达 (−[\d.]+) dBm、SNR ([\d.]+) dB，用 MCS (\d+)/, 'lab 2 expect')
    same(nl!, linkTo('sta-1'), 'expect: near level')
    same(fl!, linkTo('sta-2'), 'expect: far level')
    same(fs!, linkTo('sta-2') - NOISE, 'expect: far SNR')
    expect([val(nm!), val(fm!)]).toEqual([firstDataOf('sta-1').frame.mcs, firstDataOf('sta-2').frame.mcs])
  })

  it('lab 3 (b): the formula, its note, both exchanges cell for cell, and the first frames on screen', () => {
    const l = lab('（b）一帧多长，一次交换多长')
    const f = l.blocks!.find((b): b is Extract<Block, { kind: 'formula' }> => b.kind === 'formula')!
    const [service, perByte, tail] = figs(f.text, /⌈\((\d+) \+ (\d+)·L \+ (\d+)\) \/ 每符号比特数⌉/, 'numerator')
    expect([service, perByte, tail]).toEqual([16, 8, 6])
    same(raw(f.text, /符号数 × ([\d.]+) µs/, 'symbol')[0]!, PHY_MODES.eht.symNs / 1000, 'symbol')
    // 2026-11-11: L is the A-MPDU before EOF padding (802.11be §9.7.3), which the engine keeps as
    // `apepBytes`; `frame.bytes` is PSDU_LENGTH, the A-MPDU padded to fill the last symbol (§10.12.6)
    const [delim, msdu, hdr, fcs, total] = figs(f.note!, /：(\d+) 字节 MPDU 定界符、(\d+) 字节载荷（payload）、(\d+) 字节媒体访问控制（MAC）头、(\d+) 字节帧校验序列（FCS）——合计 (\d+) 字节/, 'L')
    expect([delim, hdr, fcs]).toEqual([AMPDU_DELIMITER_BYTES, MAC_HDR_BYTES, FCS_BYTES])
    expect(delim + msdu + hdr + fcs).toBe(total)
    expect(total).toBe(firstDataOf('sta-1').frame.apepBytes)
    const [psdu] = figs(f.note!, /屏幕上书房笔记本那一帧的长度是 (\d+) 字节/, 'PSDU_LENGTH')
    expect(psdu).toBe(firstDataOf('sta-1').frame.bytes)
    const nsym13 = (times(13).dataNs - PHY_MODES.eht.preambleNs) / PHY_MODES.eht.symNs
    expect(psdu).toBe(Math.floor((nsym13 * ndbpsOf(13) - 16 - 6) / 8))
    expect(figs(f.note!, /前导码按 (\d+) µs 计/, 'note preamble')[0]! * 1000).toBe(PHY_MODES.eht.preambleNs)
    for (const v of everyFig(/(\d+) 字节要几个符号/g, 'the frame the plan asks about', 1)) expect(val(v)).toBe(total)
    for (const [label, id] of [['书房笔记本', 'sta-1'], ['客厅笔记本', 'sta-2']] as const) {
      const r = rowOf('（b）预测：一帧与一次交换', label)
      const mcs = rungOf(id)
      const t = times(mcs)
      expect(val(r[1]!)).toBe(ndbpsOf(mcs))
      const [bits, perSym, nsym] = figs(r[2]!, /⌈(\d+) \/ (\d+)⌉ = (\d+)/, `${label}: ceiling`)
      expect(bits).toBe(service + perByte * total + tail)
      expect(perSym).toBe(ndbpsOf(mcs))
      expect(Math.ceil(bits / perSym)).toBe(nsym)
      const [pre, body, data] = raw(r[3]!, /([\d.]+) \+ ([\d.]+) = ([\d.]+) µs/, `${label}: frame`)
      same(pre!, PHY_MODES.eht.preambleNs / 1000, 'preamble')
      same(body!, (nsym * PHY_MODES.eht.symNs) / 1000, 'symbols')
      same(data!, t.dataNs / 1000, 'frame')
      const [ackRate, ackUs] = raw(r[4]!, /(\d+) Mb\/s, ([\d.]+) µs/, `${label}: ack`)
      expect(val(ackRate!)).toBe(t.respRate)
      same(ackUs!, t.ackNs / 1000, 'ack')
      const [d2, sifs, ack2, difs, ts] = raw(r[5]!, /([\d.]+) \+ (\d+) \+ ([\d.]+) \+ (\d+) = ([\d.]+) µs/, `${label}: exchange`)
      same(d2!, t.dataNs / 1000, 'frame again')
      expect([val(sifs!) * 1000, val(difs!) * 1000]).toEqual([SIFS_NS, DIFS_NS])
      same(ack2!, t.ackNs / 1000, 'ack again')
      same(ts!, t.tsNs / 1000, 'exchange')
      same(r[6]!.replace(' µs', ''), t.tcNs / 1000, 'collision')
    }
    // what the reader reads off the run
    const [nearMcs, nearUs, farMcs, farUs] = raw(l.expect, /书房笔记本的色块是 MCS (\d+)、长 ([\d.]+) µs，客厅笔记本的是 MCS (\d+)、长 ([\d.]+) µs/, 'lab 3 expect: first frames')
    for (const [id, mcs, us] of [['sta-1', nearMcs, nearUs], ['sta-2', farMcs, farUs]] as const) {
      expect(val(mcs!)).toBe(firstDataOf(id).frame.mcs)
      same(us!, firstDataOf(id).frame.txTimeNs / 1000, `${id}: first block`)
    }
    const [gap, ack, wait] = figs(l.expect, /间隙是 (\d+) µs，确认帧 (\d+) µs，其后还有 (\d+) µs 的等待/, 'lab 3 expect: exchange')
    const ends = ofType(records(), 'TX_END').filter((r) => r.frame.kind === 'data' && r.node === 'sta-1')
    const a = ofType(records(), 'TX_START').find((r) => r.frame.kind === 'ack' && ends.some((e) => r.t - e.t === gap * 1000))
    expect(a, 'an ACK that gap after a study-laptop frame').toBeDefined()
    expect(a!.frame.txTimeNs).toBe(ack * 1000)
    expect(wait * 1000).toBe(DIFS_NS)
    const [fastAck, slowAck] = figs(l.expect, /快帧之后的确认帧是 (\d+) Mb\/s，慢帧之后是 (\d+) Mb\/s/, 'lab 3 expect: ack rates')
    expect([fastAck, slowAck]).toEqual([times(13).respRate, times(2).respRate])
    expect(figs(l.meaning, /ACK 超时取 (\d+) µs/, 'lab 3 meaning')[0]! * 1000).toBe(ACK_TIMEOUT_NS)
  })

  it('lab 4 (c)(d): the fixed point, the generic exchange, the share and the flat to itself', () => {
    const l = lab('（c）（d）两台饱和站点')
    const fast = times(rungOf('sta-1'))
    const slow = times(rungOf('sta-2'))
    const [w, m, attempts] = figs(rowOf('（c）预测：两台饱和站点', '窗口')[1]!, /(\d+), (\d+), (\d+)/, 'the three')
    expect(w).toBe(CW_MIN + 1)
    expect(m).toBe(Math.log2((CW_MAX + 1) / (CW_MIN + 1)))
    expect(attempts).toBe(SHORT_RETRY_LIMIT)
    expect(figs(l.steps[0]!, /窗口 (\d+)、倍增 (\d+) 次、最多 (\d+) 次尝试/, 'lab 4 step')).toEqual([w, m, attempts])
    const { tau, p } = solveBianchi({ n: 2, W: w, m, attempts })
    same(raw(rowOf('（c）预测：两台饱和站点', '某个时隙')[1]!, /τ = ([\d.]+)/, 'τ')[0]!, tau, 'τ')
    same(raw(rowOf('（c）预测：两台饱和站点', '与对方发生碰撞')[1]!, /p = ([\d.]+) %/, 'p')[0]!, 100 * p, 'p')
    const [a, b, two, mean] = raw(rowOf('（c）预测：两台饱和站点', '一次通用的交换')[1]!, /\(([\d.]+) \+ ([\d.]+)\) \/ (\d+) = ([\d.]+) µs/, 'generic')
    same(a!, fast.tsNs / 1000, 'fast')
    same(b!, slow.tsNs / 1000, 'slow')
    expect(val(two!)).toBe(2)
    same(mean!, mix([fast.tsNs, slow.tsNs]) / 1000, 'mean')
    const S = modelS(2, mix([fast.tsNs, slow.tsNs]), mix([fast.tcNs, slow.tcNs]))
    same(rowOf('（c）预测：两台饱和站点', '两台合计')[1]!.replace(' Mb/s', ''), S, 'pair')
    same(rowOf('（c）预测：两台饱和站点', '……各自')[1]!.replace(' Mb/s', ''), S / 2, 'each')
    const [near, far] = raw(rowOf('（d）预测：份额与代价', '空口占比')[1]!, /([\d.]+) % \/ ([\d.]+) %/, 'share')
    same(near!, (100 * fast.dataNs) / (fast.dataNs + slow.dataNs), 'near share')
    same(far!, (100 * slow.dataNs) / (fast.dataNs + slow.dataNs), 'far share')
    const solo = rowOf('（d）预测：份额与代价', '书房笔记本独占')
    const [slots] = figs(solo[0]!, /交换 \+ ([\d.]+) 个时隙/, 'backoff')
    expect(slots).toBe(CW_MIN / 2)
    const [bits, us, mbps] = raw(solo[1]!, /([\d,]+) 比特 \/ ([\d.]+) µs = ([\d.]+) Mb\/s/, 'solo')
    expect(val(bits!)).toBe(PAYLOAD_BITS)
    same(us!, (fast.tsNs + slots * SLOT_NS) / 1000, 'solo exchange')
    same(mbps!, (1000 * val(bits!)) / (fast.tsNs + slots * SLOT_NS), 'solo rate')
    // the first draw: from a doubled window, because the two opening frames collide at t = 0
    const draw = ofType(records(), 'BACKOFF_DRAW')[0]!
    expect(figs(l.expect, /第一次退避抽签的窗口是 (\d+)/, 'lab 4 expect')[0]).toBe(draw.cw)
    expect(draw.cw).toBe(2 * (CW_MIN + 1) - 1)
    const opens = ofType(records(), 'TX_START').filter((r) => r.frame.kind === 'data' && r.t === 0)
    expect(opens.map((r) => r.node).sort()).toEqual(['sta-1', 'sta-2'])
    expect(ofType(records(), 'COLLISION')[0]!.nodes.slice().sort()).toEqual(['sta-1', 'sta-2'])
    expect(tier1Project.labs![3]!.jump).toBe(3)
  })

  it('lab 5: the three variants, predicted cell for cell', () => {
    const l = lab('三个变体：先预测，再运行')
    const alone = times(rungOf('sta-1'))
    const soloMbps = (1000 * PAYLOAD_BITS) / (alone.tsNs + (CW_MIN / 2) * SLOT_NS)
    for (const [starts, scen, n] of [
      ['书房笔记本搬到客厅', projectFlat({ nearX: 12 }), 2],
      ['多一台平板', projectFlat({ third: true }), 3],
      ['客厅笔记本离线', projectFlat({ noFar: true }), 1],
    ] as const) {
      const r = rowOf('三个变体的预测', starts)
      const links = buildLinkTable(scen.nodes, scen.walls)
      const rungAt = (id: string): number => mcsForRssi('eht', links.get(id)!.get('ap')!, undefined, 20)
      const rx = links.get('sta-1')!.get('ap')!
      const mcs = rungAt('sta-1')
      if (r[1]!.includes('→')) {
        const [dist, level, snr, rung] = raw(r[1]!, /([\d.]+) m → (−[\d.]+) dBm, ([\d.]+) dB, MCS (\d+)/, `${starts}: link`)
        const nr = scen.nodes.find((x) => x.id === 'sta-1')!.pos
        const ap = scen.nodes.find((x) => x.id === 'ap')!.pos
        same(dist!, Math.hypot(nr.x - ap.x, nr.y - ap.y), 'distance')
        same(level!, rx, 'level')
        same(snr!, rx - NOISE, 'SNR')
        expect(val(rung!)).toBe(mcs)
      } else {
        expect(figs(r[1]!, /MCS (\d+)/, 'rung')[0]).toBe(mcs)
      }
      const t = times(mcs)
      const [frame, exch] = raw(r[2]!, /([\d.]+) \/ ([\d.]+) µs/, 'frame / exchange')
      same(frame!, t.dataNs / 1000, 'frame')
      same(exch!, t.tsNs / 1000, 'exchange')
      const contenders = scen.nodes.filter((x) => x.profiles.includes('saturated'))
      expect(contenders).toHaveLength(n)
      if (/%/.test(r[3]!)) same(r[3]!.replace(' %', ''), 100 * solveBianchi({ n, ...PARAMS }).p, 'p')
      else expect(n).toBe(1)
      const theirs = contenders.map((x) => times(rungAt(x.id)))
      const S = modelS(n, mix(theirs.map((x) => x.tsNs)), mix(theirs.map((x) => x.tcNs)))
      if (r[4]!.includes('→')) {
        const [sum, one, other] = raw(r[4]!, /([\d.]+) → ([\d.]+) \+ ([\d.]+) Mb\/s/, 'pair')
        same(sum!, S, 'together')
        for (const h of [one, other]) same(h!, S / n, 'each')
      } else if (n === 1) same(r[4]!.replace(' Mb/s', ''), soloMbps, 'alone')
      else same(r[4]!.replace(' Mb/s', ''), S, 'three')
    }
    const [m3, f3, p2, f13, p3, solo] = raw(l.expect, /改用 MCS (\d+)，帧长 ([\d.]+) µs，碰撞概率仍是 ([\d.]+)%；加一台平板，帧长仍是 ([\d.]+) µs，碰撞概率升到 ([\d.]+)%；[\s\S]*?预测 ([\d.]+) Mb\/s/, 'lab 5 expect')
    const moved = projectFlat({ nearX: 12 })
    expect(val(m3!)).toBe(mcsForRssi('eht', buildLinkTable(moved.nodes, moved.walls).get('sta-1')!.get('ap')!, undefined, 20))
    same(f3!, times(val(m3!)).dataNs / 1000, 'moved frame')
    same(p2!, 100 * solveBianchi({ n: 2, ...PARAMS }).p, 'two contenders')
    same(f13!, times(13).dataNs / 1000, 'tablet: the study frame unchanged')
    same(p3!, 100 * solveBianchi({ n: 3, ...PARAMS }).p, 'three contenders')
    same(solo!, soloMbps, 'alone')
  })
})

describe('tier1-project · `why`, the quiz and `sources` print the same predictions', () => {
  it('`why`: four times the airtime, eight tenths of the air, six tenths of the solo rate', () => {
    const why = tier1Project.why!
    const CN = '零一二三四五六七八九十'
    const fast = times(13)
    const slow = times(2)
    expect(Math.round(slow.dataNs / fast.dataNs)).toBe(CN.indexOf(raw(why, /约(.)倍的时间/, '`why` four')[0]!))
    expect(Math.round(10 * slow.dataNs / (fast.dataNs + slow.dataNs))).toBe(CN.indexOf(raw(why, /空口有(.)成被慢的那台占用/, '`why` eight')[0]!))
    const S = modelS(2, mix([fast.tsNs, slow.tsNs]), mix([fast.tcNs, slow.tcNs]))
    const soloMbps = (1000 * PAYLOAD_BITS) / (fast.tsNs + (CW_MIN / 2) * SLOT_NS)
    expect(Math.round(10 * S / soloMbps)).toBe(CN.indexOf(raw(why, /独占信道时的(.)成左右/, '`why` six')[0]!))
  })

  it('the quiz: the margin arithmetic, three contenders, and the ACK timeout', () => {
    const quiz = tier1Project.quiz.map((q) => [q.q, ...q.options, q.explain].join('\n')).join('\n')
    const farSnr = linkTo('sta-2') - NOISE
    const [qs, qn, qr] = raw(quiz, /SNR 是 ([\d.]+) dB，而 MCS (\d+) 需要 ([\d.]+) dB/, 'quiz premise')
    same(qs!, farSnr, 'SNR')
    expect(val(qn!)).toBe(rungOf('sta-2') + 1)
    same(qr!, reqSinrDb('eht', val(qn!)), 'requirement')
    const [over, snrA, fits, snrB, overAgain, snrC] = raw(quiz, /而 ([\d.]+) \+ \d+ 超过了 ([\d.]+)[^]*?工作：([\d.]+) \+ \d+ 不超过 ([\d.]+)，([\d.]+) \+ \d+ 超过了 ([\d.]+)/, 'quiz arithmetic')
    same(over!, reqSinrDb('eht', val(qn!)), 'over')
    same(overAgain!, reqSinrDb('eht', val(qn!)), 'over again')
    same(fits!, reqSinrDb('eht', rungOf('sta-2')), 'fits')
    for (const v of [snrA, snrB, snrC]) same(v!, farSnr, 'SNR again')
    for (const v of everyFig(/\+ (\d+) 超过了|\+ (\d+) 不超过|留 (\d+) dB 余量/g, 'the margin', 4)) expect(val(v)).toBe(RATE_MARGIN_DB)
    same(raw(quiz, /碰撞概率反而升到 ([\d.]+) %/, 'three')[0]!, 100 * solveBianchi({ n: 3, ...PARAMS }).p, 'three contenders')
    const [t, cl17, he] = figs(quiz, /(\d+) µs 的 ACK 超时[\s\S]*?取第 17 章的 (\d+) µs，而 HE 的表 27-61 给的是 (\d+) µs/, 'quiz ACK timeout')
    expect(t * 1000).toBe(ACK_TIMEOUT_NS)
    expect(cl17 * 1000).toBe(RX_START_DELAY_NS)
    expect(he).toBe(figs(STD, /HE 为 (\d+) µs（表 27-61）/, '① HE')[0])
  })

  it('`sources` lists the four engine values the brief rests on', () => {
    const src = tier1Project.sources!.join('\n')
    const [pl0, exp, base, wall, margin, width, floorDbm] = figs(src, /路径损耗公式 ([\d.]+) \+ (\d+)·log(\d+)\(d\)、砖墙 (\d+) dB、每一级所需 SINR 之上再留 (\d+) dB 余量，以及 (\d+) MHz 信道 −([\d.]+) dBm 的噪声地板/, '`sources` on the four values')
    expect(pl0).toBe(PL0_DB)
    expect(exp).toBe(10 * PL_EXP)
    expect(pathLossDb(base)).toBeCloseTo(pl0 + exp, 9)
    expect(wall).toBe(WALL_LOSS_DB.brick)
    expect(margin).toBe(RATE_MARGIN_DB)
    expect(width).toBe(20)
    expect(-floorDbm).toBe(Number(NOISE.toFixed(2)))
  })

  it('the exchange is assembled exactly as bianchiModel assembles it', () => {
    const legacy = dcfTimes(MSDU, 6)
    expect(legacy.dataNs + SIFS_NS + legacy.ackNs + DIFS_NS).toBe(legacy.tsNs)
    expect(legacy.dataNs + ACK_TIMEOUT_NS + DIFS_NS).toBe(legacy.tcNs)
  })
})
