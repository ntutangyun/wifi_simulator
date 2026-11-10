/**
 * `@amp-backscatter`, in the standard-first shape (2026-11-11).
 *
 * ① cites the TGbp motions and the two adopted PDTs behind each mono-static backscatter rule; ②
 * says what the engine does about each — the inventory itself `differs`, being an EPC Gen2
 * slot-counter round after an unadopted proposal — and the rows are checked against the engine;
 * every figure the labs print is read back out of the lesson's own text and compared with a run.
 *
 * It also keeps this slice's inert-config ruling (docs/inert-config-contract.md): the reader's
 * `write` flag is byte-for-byte inert at the default `txopMs: 4`, and it is PINNED rather than
 * refused, because at 10 ms of TXOP the Writes appear.
 */
import { describe, expect, it } from 'vitest'
import { ampBackscatter, ampBackscatterScenario } from '../../src/course/amp/amp-backscatter'
import { Simulation } from '../../src/engine/simulation'
import { DEFAULT_AMP_BS, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_BS_ACTIVATION_DBM, AMP_BS_ISOLATION_DB, AMP_BS_LOSS_DB, AMP_BS_READER_DR_DB, AMP_BS_REQ_SNR_DB,
  AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_UL_CHIP_NS, AMP_BS_UL_SYNC_CHIPS, AMP_BS_WRITE_T3_NS, AMP_BS_WUP_MIN_NS,
  activationReachM, ampBsDlPpduNs, bstNs, freeSpacePl0Db, monoReachM, FREQ_24G_MHZ, AMP_BS_DL_KBPS,
} from '../../src/engine/ampBs'
import { EDCA_PARAMS, ERP_2G } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS
const TAGS = ['tag-1#2g', 'tag-2#2g', 'tag-3#2g', 'tag-4#2g', 'tag-5#2g', 'tag-6#2g'] as const
const CHARGE20 = 0, Q0 = 2, WRITE = 3

const recs = (variant?: number): TLRecord[] => runOf(ampBackscatter, variant, RUN_NS)
const run = (s: Scenario): TLRecord[] => [...new Simulation(s).runUntil(RUN_NS).records]
const inv = (rs: TLRecord[]) => ofType(rs, 'AMP_INVENTORY')
const replies = (rs: TLRecord[], kind: string) => ofType(rs, 'AMP_BS_REPLY').filter((r) => r.kind === kind)
const epcCount = (rs: TLRecord[], node: string): number => replies(rs, 'epc').filter((r) => r.node === node).length
const rfidAirtimeNs = (rs: TLRecord[]): number => ofType(rs, 'TX_START')
  .filter((r) => r.frame.kind === 'ampRfid').reduce((n, r) => n + r.frame.txTimeNs, 0)
const tally = (rs: TLRecord[]) => inv(rs).reduce(
  (a, x) => ({ off: a.off + x.slotsOffered, read: a.read + x.read.length, col: a.col + x.collisions, emp: a.emp + x.empties }),
  { off: 0, read: 0, col: 0, emp: 0 },
)
const val = (cell: string): number => Number(cell.replace(/−/g, '-').replace(/[^\d.-]/g, ''))

const lab = (heading: string): Lab => {
  const l = ampBackscatter.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const blockOf = <K extends Block['kind']>(l: Lab, kind: K, heading: string): Extract<Block, { kind: K }> => {
  const b = (l.blocks ?? []).find((x) => x.kind === kind && x.heading === heading)
  expect(b, `${kind} 「${heading}」`).toBeDefined()
  return b as Extract<Block, { kind: K }>
}
const tableOf = (l: Lab, heading: string) => blockOf(l, 'table', heading)
const implRow = (topic: string) => {
  const row = ampBackscatter.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}

lessonShapeSuite(ampBackscatter, { runNs: RUN_NS })

describe('amp-backscatter · the lesson', () => {
  it('is in the standard-first shape, after amp-slots', () => {
    expect(isStandardFirst(ampBackscatter)).toBe(true)
    expect(MODULES[ampBackscatter.module].title).toBe('环境能量物联网（802.11bp）')
    expect(ampBackscatter.needs).toEqual(['amp-slots'])
    expect(ampBackscatter.limits).toEqual([])
    expect(ampBackscatter.observe).toEqual([])
    expect(ampBackscatter.tryThis).toEqual([])
  })

  it('the scene and its four variants pass the schema, unchanged', () => {
    expect(ampBackscatter.scenario()).toEqual(ampBackscatterScenario())
    expect(() => ScenarioSchema.parse(ampBackscatter.scenario())).not.toThrow()
    for (const v of ampBackscatter.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    const bsOf = (s: Scenario) => s.nodes[0].ampAp!.backscatter!
    expect(ampBackscatter.variants!.map((v) => bsOf(v.scenario()))).toEqual([
      { ...DEFAULT_AMP_BS, chargeDbm: 20 }, { ...DEFAULT_AMP_BS, ulKbps: 1000 },
      { ...DEFAULT_AMP_BS, q: 0 }, { ...DEFAULT_AMP_BS, write: true },
    ])
    const s = ampBackscatter.scenario()
    const ap = s.nodes[0].pos
    const d = (i: number) => Math.round(Math.hypot(s.nodes[i].pos.x - ap.x, s.nodes[i].pos.y - ap.y, s.nodes[i].pos.z - ap.z) * 100)
    expect([1, 2, 3, 4, 5, 6].map(d)).toEqual([15, 15, 15, 15, 28, 40])
  })

  it('① names the motion behind each rule, and the two adopted PDTs', () => {
    const std = ampBackscatter.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const ref of ['11-24/1613r20', '11-26/1519r5', '11-26/1798r1', '11-25/1692r50', '§39.3.3', '#87', '#98',
      '#15', '#29', '#72', '#167', '#168', '#169', '#170', '#199', '#200', '#201', '#16', '#140', '#18', '#149', '#31',
      '#40', '#134', '#52', '#111', '#112', '#239', '#241', '#145', '#210']) {
      expect(std, ref).toContain(ref)
    }
    expect(std).not.toContain('本仿真器')
    expect(std).not.toContain('QueryRep')
  })
})

describe('amp-backscatter · ② says what the engine does, and the engine does it', () => {
  const rs = recs()

  it('the inventory is a Gen2 Query / QueryRep / ACK round tunnelled in AMP RFID frames (differs)', () => {
    expect(implRow('清点过程').kind).toBe('differs')
    const cmds = new Set(ofType(rs, 'AMP_RFID').map((r) => r.cmd))
    expect([...cmds].sort()).toEqual(['ack', 'query', 'queryRep', 'read'])
    expect(ofType(rs, 'AMP_BS_COUNTER').every((r) => r.q === DEFAULT_AMP_BS.q && r.counter < 2 ** DEFAULT_AMP_BS.q)).toBe(true)
    expect(implRow('清点过程').sim).toContain('读 8 个字节')
  })

  it('a session spans TXOPs with the counters held; each TXOP is 4 ms behind a CTS-to-self (differs)', () => {
    expect(implRow('一轮跨传输机会').kind).toBe('choice')
    const first = inv(rs).filter((r) => r.session === 1)
    expect(first.map((r) => r.complete)).toEqual([false, false, false, true])
    expect(implRow('传输机会的长度').kind).toBe('differs')
    expect(DEFAULT_AMP_BS.txopMs).toBe(4)
    expect(DEFAULT_AMP_BS.txopMs * MS).toBeGreaterThan(EDCA_PARAMS[0].txopLimitNs)
    const cts = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'cts')
    // one CTS-to-self a TXOP; the last TXOP may still be on the air when the second ends
    expect(cts.length - inv(rs).length).toBeGreaterThanOrEqual(0)
    expect(cts.length - inv(rs).length).toBeLessThanOrEqual(1)
    for (const c of cts) expect(c.frame.durationFieldNs).toBe(DEFAULT_AMP_BS.txopMs * MS)
  })

  it('WUP-Excitation on the first PPDU of a TXOP only; BST sized by the draft formula; 16 µs and 2 ms model gaps', () => {
    expect(AMP_BS_WUP_MIN_NS).toBe(MS)
    expect(DEFAULT_AMP_BS.wupMs).toBe(1)
    expect(AMP_BS_T1_NS).toBe(16 * US)
    expect(implRow('BST-Excitation').sim).toBe(`照此计算，T1 = ${AMP_BS_T1_NS / US} µs。`)
    expect(implRow('命令间隔与写入时延').sim).toBe(`两帧命令之间 ${AMP_BS_T2_NS / US} µs（取自 11-26/0120r0）；Write 的应答时延 ${AMP_BS_WRITE_T3_NS / MS} ms（同一文稿）。`)
    // the first command of every TXOP is the long one
    const rfid = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ampRfid')
    const sigExt = ERP_2G.signalExtNs
    const query = ampBsDlPpduNs('query', MS, bstNs('rn16', 250), sigExt)
    expect(rfid[0].frame.txTimeNs).toBe(query)
    // the first command after each CTS-to-self is 1 ms longer than the same command later in a TXOP
    const cts = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'cts')
    for (const c of cts) {
      const firstCmd = rfid.find((r) => r.t > c.t)
      if (!firstCmd) continue
      const cmd = firstCmd.frame.amp!.rfid!.cmd as 'query' | 'queryRep'
      expect(['query', 'queryRep']).toContain(cmd)
      expect(firstCmd.frame.txTimeNs).toBe(ampBsDlPpduNs(cmd, MS, bstNs('rn16', 250), sigExt))
    }
    const later = rfid.filter((r) => r.frame.amp!.rfid!.cmd === 'queryRep' && !cts.some((c) => rfid.find((x) => x.t > c.t) === r))
    for (const r of later) expect(r.frame.txTimeNs).toBe(ampBsDlPpduNs('queryRep', 0, bstNs('rn16', 250), sigExt))
  })

  it('no AMP Ack, ever: the reader sends commands and a CTS-to-self, the tags reflect', () => {
    expect(implRow('不回 Ack').kind).toBe('faithful')
    expect([...new Set(ofType(rs, 'TX_START').map((r) => r.frame.kind))].sort()).toEqual(['ampBsReply', 'ampRfid', 'cts'])
  })

  it('250 kb/s down; 24 chips of uplink sync at 2 µs or 0.5 µs', () => {
    expect(AMP_BS_DL_KBPS).toBe(250)
    expect(AMP_BS_UL_SYNC_CHIPS).toBe(24)
    expect(AMP_BS_UL_CHIP_NS).toEqual({ 250: 2000, 1000: 500 })
    expect(implRow('速率与同步').sim).toContain(`上行 AMP-Sync ${AMP_BS_UL_SYNC_CHIPS} 个码片`)
  })

  it('the link budget ② prints is the engine\'s', () => {
    const sim = implRow('功率与门限的取值').sim
    expect(sim).toContain(`反射损耗 ${AMP_BS_LOSS_DB} dB`)
    expect(sim).toContain(`天线隔离 ${AMP_BS_ISOLATION_DB} dB 与接收动态范围 ${AMP_BS_READER_DR_DB} dB`)
    expect(sim).toContain(`上电门限 −${-AMP_BS_ACTIVATION_DBM} dBm`)
    expect(sim).toContain(`250 kb/s 应答需要 ${AMP_BS_REQ_SNR_DB[250]} dB 信噪比`)
    expect(sim).toContain(`激励 ${DEFAULT_AMP_BS.chargeDbm} dBm 与 ${DEFAULT_AMP_BS.bsDbm} dBm`)
    expect(implRow('传播与上电').sim).toContain(`第一米 ${freeSpacePl0Db(FREQ_24G_MHZ).toFixed(1)} dB`)
  })

  it('the tags never contend', () => {
    for (const t of TAGS) {
      for (const type of ['BACKOFF_DRAW', 'CCA_BUSY', 'IFS_START', 'NAV_SET'] as const) {
        expect(rs.filter((r) => r.type === type && 'node' in r && r.node === t), `${t} / ${type}`).toEqual([])
      }
    }
  })

  it('`write: true` is inert at the default 4 ms TXOP, and not at 10 ms (pinned, not refused)', () => {
    expect(JSON.stringify(recs(WRITE))).toBe(JSON.stringify(recs()))
    const longer = run(ampBackscatterScenario({ write: true, txopMs: 10 }))
    expect(ofType(longer, 'AMP_RFID').filter((r) => r.cmd === 'write').length).toBe(13)
  })
})

describe('amp-backscatter · ③ every figure the labs print is the run', () => {
  it('lab 1: the margin identity, read out of the formula and fed back', () => {
    const f = blockOf(lab('哪些标签被唤醒，哪些能被读到'), 'formula', '单站读写器的余量')
    const m = /激励 − 2 × 路损 − (\d+)\n读写器的本机干扰 = 激励 − (\d+)（天线隔离）− (\d+)（接收动态范围）\n余量 = (\d+) − 2 × 路损/.exec(f.text)!
    expect([Number(m[1]), Number(m[2]), Number(m[3])]).toEqual([AMP_BS_LOSS_DB, AMP_BS_ISOLATION_DB, AMP_BS_READER_DR_DB])
    expect(Number(m[4])).toBe(AMP_BS_ISOLATION_DB + AMP_BS_READER_DR_DB - AMP_BS_LOSS_DB)
    expect(f.note).toContain(`${AMP_BS_LOSS_DB}、${AMP_BS_ISOLATION_DB}、${AMP_BS_READER_DR_DB} 三个数`)
  })

  it('lab 1: the six-tag table, every cell', () => {
    const rs = recs()
    const rows = tableOf(lab('哪些标签被唤醒，哪些能被读到'), '一秒钟内六张标签的结果').rows
    const representative = [TAGS[0], TAGS[4], TAGS[5]]
    for (const [i, row] of rows.entries()) {
      const node = representative[i]
      const cm = val(row[1])
      const incident = DEFAULT_AMP_BS.chargeDbm - (freeSpacePl0Db(FREQ_24G_MHZ) + 20 * Math.log10(cm / 100))
      expect(val(row[2])).toBe(Number(incident.toFixed(2)))
      const boot = ofType(rs, 'AMP_BS_BOOT').find((r) => r.node === node)
      const reply = ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === node)
      if (row[3] === '（未被唤醒）') {
        expect(boot).toBeUndefined()
        expect(rs.filter((r) => 'node' in r && r.node === node)).toEqual([])
        expect(incident).toBeLessThan(AMP_BS_ACTIVATION_DBM)
        expect(row[4]).toBe('—')
      } else {
        expect(val(row[2])).toBe(Number(boot!.incidentDbm.toFixed(2)))
        expect(val(row[3])).toBe(Number(reply!.rxDbmAtAp.toFixed(2)))
        expect(val(row[4])).toBe(Number(reply!.snrDb.toFixed(2)))
      }
      const nodes = i === 0 ? TAGS.slice(0, 4) : [node]
      expect(row[5].replace(/\s*次$/, '').split('、').map(Number)).toEqual(nodes.map((t) => epcCount(rs, t)))
    }
    // five boot at the same instant
    const firstBoots = ofType(rs, 'AMP_BS_BOOT').filter((r) => r.t === ofType(rs, 'AMP_BS_BOOT')[0].t)
    expect(firstBoots.length).toBe(5)
  })

  it('lab 1: the two reaches at 10 dBm', () => {
    const e = lab('哪些标签被唤醒，哪些能被读到').expect
    const m = /按 (\d+) dBm 的激励，上电的距离是 ([\d.]+) m，可读取的距离是 ([\d.]+) m/.exec(e)!
    expect(Number(m[1])).toBe(DEFAULT_AMP_BS.chargeDbm)
    expect(m[2]).toBe(activationReachM(DEFAULT_AMP_BS.chargeDbm).toFixed(3))
    expect(m[3]).toBe(monoReachM(DEFAULT_AMP_BS.bsDbm, 250).toFixed(3))
    expect(0.4).toBeGreaterThan(Math.max(Number(m[2]), Number(m[3])))
  })

  it('lab 2: twenty dBm wakes Tag 6, never hears it, and costs one reading', () => {
    const loud = recs(CHARGE20)
    const e = lab('提高激励功率').expect
    const m = /上电的距离移到 ([\d.]+) m，Tag 6 醒来，一秒钟抽取 (\d+) 次计数、反射 (\d+) 次 RN16；可读取的距离仍是 ([\d.]+) m，Tag 6 的余量是 −([\d.]+) dB，一次也没有被解出。它占用的槽使这一秒读到的次数从 (\d+) 降到 (\d+)/.exec(e)!
    const strong = ampBackscatter.variants![CHARGE20].scenario().nodes[0].ampAp!.backscatter!.chargeDbm
    expect(m[1]).toBe(activationReachM(strong).toFixed(3))
    expect(Number(m[2])).toBe(ofType(loud, 'AMP_BS_COUNTER').filter((r) => r.node === TAGS[5]).length)
    expect(Number(m[3])).toBe(replies(loud, 'rn16').filter((r) => r.node === TAGS[5]).length)
    expect(m[4]).toBe(monoReachM(DEFAULT_AMP_BS.bsDbm, 250).toFixed(3))
    expect(-Number(m[5])).toBe(Number(ofType(loud, 'AMP_BS_REPLY').find((r) => r.node === TAGS[5])!.snrDb.toFixed(2)))
    expect(epcCount(loud, TAGS[5])).toBe(0)
    expect([Number(m[6]), Number(m[7])]).toEqual([tally(recs()).read, tally(loud).read])
    // the why's 「唤醒距离增大到三倍多」
    expect(Math.floor(activationReachM(strong) / activationReachM(DEFAULT_AMP_BS.chargeDbm))).toBe(3)
  })

  it('lab 3: the slot formula, term by term, and the reserve that pushes the next slot out', () => {
    const f = blockOf(lab('一个传输机会只容纳一个槽'), 'formula', '一个槽的三帧命令')
    const m = /Query (\d+) \+ (\d+) \+ ACK (\d+) \+ (\d+) \+ Read (\d+) \+ (\d+) = (\d+) µs/.exec(f.text)!
    const n = m.slice(1).map(Number)
    const sigExt = ERP_2G.signalExtNs
    const q = ampBsDlPpduNs('query', MS, bstNs('rn16', 250), sigExt)
    const a = ampBsDlPpduNs('ack', 0, bstNs('epc', 250), sigExt)
    const r = ampBsDlPpduNs('read', 0, bstNs('read', 250), sigExt)
    expect([n[0], n[2], n[4]]).toEqual([q, a, r].map((x) => Math.round(x / US)))
    expect([n[1], n[3], n[5]]).toEqual([AMP_BS_T2_NS / US, AMP_BS_T2_NS / US, AMP_BS_T2_NS / US])
    expect(n[6]).toBe(Math.round((q + a + r + 3 * AMP_BS_T2_NS) / US))
    const note = /带 (\d+) ms 的 WUP-Excitation。开启下一个槽之前还要为可能到来的 RN16 预留 (\d+) \+ (\d+) µs，(\d+) ms 不够/.exec(f.note!)!
    expect(Number(note[1]) * MS).toBe(AMP_BS_WUP_MIN_NS)
    expect(Number(note[2])).toBe(AMP_BS_T2_NS / US)
    expect(Number(note[3])).toBe(n[2])
    expect(Number(note[4])).toBe(DEFAULT_AMP_BS.txopMs)
    const queryRep = ampBsDlPpduNs('queryRep', 0, bstNs('rn16', 250), sigExt)
    expect(q + a + r + 3 * AMP_BS_T2_NS + queryRep + AMP_BS_T2_NS + a).toBeGreaterThan(DEFAULT_AMP_BS.txopMs * MS)
  })

  it('lab 3: four TXOPs, 14.9 ms, and the command airtime of the second', () => {
    const rs = recs()
    const e = lab('一个传输机会只容纳一个槽').expect
    const m = /Q = (\d) 的一轮要(.)个传输机会、([\d.]+) ms 才清点完毕。一秒钟内 (\d+) 帧命令占用 ([\d.]+) ms，也就是 ([\d.]+) %。每个传输机会 (\d+) ms，长于 AC_BK 缺省的 ([\d.]+) ms TXOP 限制/.exec(e)!
    expect(Number(m[1])).toBe(DEFAULT_AMP_BS.q)
    const first = inv(rs).filter((r) => r.session === 1)
    expect('一二三四五'.indexOf(m[2]) + 1).toBe(first.length)
    expect(m[3]).toBe((first[first.length - 1].t / MS).toFixed(1))
    expect(Number(m[4])).toBe(ofType(rs, 'AMP_RFID').length)
    expect(m[5]).toBe((rfidAirtimeNs(rs) / MS).toFixed(1))
    expect(m[6]).toBe((rfidAirtimeNs(rs) / RUN_NS * 100).toFixed(1))
    expect(Number(m[7])).toBe(DEFAULT_AMP_BS.txopMs)
    expect(Number(m[8]) * MS).toBe(EDCA_PARAMS[0].txopLimitNs)
  })

  it('lab 4: forty slots, the RN16s, the 10.8 dB pair, and Q = 0', () => {
    const rs = recs()
    const e = lab('读不出与空槽').expect
    const m = /一秒钟 (\d+) 个槽里读到 (\d+) 个、读不出 (\d+) 个、空 (\d+) 个；标签一共反射 (\d+) 次 RN16。15 cm 与 28 cm 的两张标签同在一个槽里时，近的那张强 ([\d.]+) dB，读写器解出它，这一槽记为读到。Q = 0 时五张醒着的标签都抽到 0，(\d+) 个槽全部读不出，一次也没读到/.exec(e)!
    const t = tally(rs)
    expect([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]).toEqual([t.off, t.read, t.col, t.emp])
    expect(Number(m[5])).toBe(replies(rs, 'rn16').length)
    const near = ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === TAGS[0])!
    const far = ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === TAGS[4])!
    expect(m[6]).toBe((near.snrDb - far.snrDb).toFixed(1))
    const z = recs(Q0)
    expect(ofType(z, 'AMP_BS_COUNTER').every((r) => r.counter === 0)).toBe(true)
    expect(new Set(ofType(z, 'AMP_BS_COUNTER').map((r) => r.node)).size).toBe(5)
    expect(tally(z)).toEqual({ off: Number(m[7]), read: 0, col: Number(m[7]), emp: 0 })
  })

  it('the why\'s own figures', () => {
    const w = ampBackscatter.why!
    expect(w).toContain(`至少 ${AMP_BS_WUP_MIN_NS / MS} ms 的 WUP-Excitation`)
    expect(w).toContain(`命令结束后 ${AMP_BS_T1_NS / US} µs（±20 %）应答`)
  })
})
