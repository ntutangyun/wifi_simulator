/**
 * `@amp-backscatter`, in the standard-first shape (2026-11-11).
 *
 * ① cites the TGbp motions and the PDTs behind each mono-static backscatter rule; ② says what
 * the engine does about each and the rows are checked against the engine; every figure the labs
 * print is read back out of the lesson's own text and compared with a run.
 *
 * Rewritten 2026-11-11 (W7b) with the engine: the inventory used to be an EPC Gen2
 * Query/QueryRep/ACK slot-counter round (proposal 11-25/0061r0, not adopted) in a 4 ms TXOP, and
 * ② said `differs`. It is now PDT 11-26/1519r5 §39.3.3: a broadcast single-slot AMP Trigger with
 * ACWE, AMP Responses carrying the 16-bit ID, and AMP RFID frames carrying the UHF Read command —
 * each TXOP inside the AP's AC_BK TXOP limit (§10.23.2.9). The old `write`/`txopMs` inert-config
 * pin went with the fields: a Write's 2 ms response time cannot fit any AC_BK TXOP, so the engine
 * does not send one (② `absent`).
 */
import { describe, expect, it } from 'vitest'
import { ampBackscatter, ampBackscatterScenario } from '../../src/course/amp/amp-backscatter'
import { DEFAULT_AMP_BS, ScenarioSchema, type Scenario } from '../../src/model/scenario'
import {
  AMP_BS_ACTIVATION_DBM, AMP_BS_ISOLATION_DB, AMP_BS_LOSS_DB, AMP_BS_READER_DR_DB, AMP_BS_REQ_SNR_DB,
  AMP_BS_T1_NS, AMP_BS_T2_NS, AMP_BS_UL_CHIP_NS, AMP_BS_UL_SYNC_CHIPS, AMP_BS_WRITE_T3_NS, AMP_BS_WUP_MIN_NS,
  AMP_RFID_FCS_BYTES, AMP_RFID_HDR_BYTES, BS_CMD_BODY_BYTES, BS_REPLY_BODY_BYTES,
  activationReachM, ampBsDlPpduNs, bstNs, crc16Epc, epcOf, freeSpacePl0Db, monoReachM, FREQ_24G_MHZ, AMP_BS_DL_KBPS,
} from '../../src/engine/ampBs'
import { CTS_BYTES, ERP_2G, QAP_EDCA_PARAMS, txTimeNs } from '../../src/engine/phy'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS
const TAGS = ['tag-1#2g', 'tag-2#2g', 'tag-3#2g', 'tag-4#2g', 'tag-5#2g', 'tag-6#2g'] as const
const CHARGE20 = 0, ACWE0 = 2
const LIMIT = QAP_EDCA_PARAMS[0].txopLimitNs

const recs = (variant?: number): TLRecord[] => runOf(ampBackscatter, variant, RUN_NS)
const inv = (rs: TLRecord[]) => ofType(rs, 'AMP_INVENTORY')
const replies = (rs: TLRecord[], kind: string) => ofType(rs, 'AMP_BS_REPLY').filter((r) => r.kind === kind)
const epcCount = (rs: TLRecord[], node: string): number => replies(rs, 'read').filter((r) => r.node === node).length
const rfidAirtimeNs = (rs: TLRecord[]): number => ofType(rs, 'TX_START')
  .filter((r) => r.frame.kind === 'ampRfid').reduce((n, r) => n + r.frame.txTimeNs, 0)
const tally = (rs: TLRecord[]) => inv(rs).reduce(
  (a, x) => ({ off: a.off + x.slotsOffered, ids: a.ids + x.ids.length, read: a.read + x.read.length, col: a.col + x.collisions, emp: a.emp + x.empties }),
  { off: 0, ids: 0, read: 0, col: 0, emp: 0 },
)
const val = (cell: string): number => Number(cell.replace(/−/g, '-').replace(/[^\d.-]/g, ''))
const sigExt = ERP_2G.signalExtNs
const ctsNs = txTimeNs(CTS_BYTES, 6) + sigExt

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

  it('the scene and its three variants pass the schema', () => {
    expect(ampBackscatter.scenario()).toEqual(ampBackscatterScenario())
    expect(() => ScenarioSchema.parse(ampBackscatter.scenario())).not.toThrow()
    for (const v of ampBackscatter.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
    const bsOf = (s: Scenario) => s.nodes[0].ampAp!.backscatter!
    expect(ampBackscatter.variants!.map((v) => bsOf(v.scenario()))).toEqual([
      { ...DEFAULT_AMP_BS, chargeDbm: 20 }, { ...DEFAULT_AMP_BS, ulKbps: 1000 }, { ...DEFAULT_AMP_BS, acwe: 0 },
    ])
    const s = ampBackscatter.scenario()
    const ap = s.nodes[0].pos
    const d = (i: number) => Math.round(Math.hypot(s.nodes[i].pos.x - ap.x, s.nodes[i].pos.y - ap.y, s.nodes[i].pos.z - ap.z) * 100)
    expect([1, 2, 3, 4, 5, 6].map(d)).toEqual([15, 15, 15, 15, 28, 40])
  })

  it('① names the motion behind each rule, and the PDTs', () => {
    const std = ampBackscatter.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
    for (const ref of ['11-24/1613r20', '11-26/1519r5', '11-26/1798r1', '11-26/1889r4', '11-26/1520r3', '11-25/1692r50',
      '§39.3.3', '§39.4', '§10.23.2.9', '表 9-194', 'dot11QAPEDCATable', '#87', '#90', '#98', '#105',
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

  it('the inventory is the draft\'s: single-slot AMP Triggers, AMP Responses, AMP RFID Reads (faithful)', () => {
    expect(implRow('征求标识').kind).toBe('faithful')
    expect(implRow('读回 EPC').kind).toBe('faithful')
    const cmds = ofType(rs, 'AMP_RFID')
    expect([...new Set(cmds.map((r) => r.cmd))].sort()).toEqual(['read', 'trigger'])
    const frames = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ampRfid')
    for (const f of frames.filter((r) => r.frame.amp!.rfid!.cmd === 'trigger')) {
      expect(f.frame.dst.startsWith('*')).toBe(true)
      expect(f.frame.amp!.rfid!.acwe).toBe(DEFAULT_AMP_BS.acwe)
    }
    // every draw is fresh in [0, ACW] and only ABOC 0 answers, in the trigger's single slot
    const acw = 2 ** DEFAULT_AMP_BS.acwe - 1
    for (const d of ofType(rs, 'AMP_ABOC')) {
      expect(d.acw).toBe(acw)
      expect(d.slot).toBe(d.aboc === 0 ? 1 : null)
    }
    // a Read goes to a tag whose AMP Response the reader decoded, and its reply carries the EPC
    for (const r of frames.filter((x) => x.frame.amp!.rfid!.cmd === 'read')) {
      const id = crc16Epc(r.frame.amp!.rfid!.epc ?? epcOf(r.frame.dst)).toString(16).padStart(4, '0')
      expect(inv(rs).some((x) => x.t < r.t && x.ids.includes(id)), `Read to ${r.frame.dst}`).toBe(true)
    }
    expect(replies(rs, 'read').every((r) => r.rxDbmAtAp !== undefined)).toBe(true)
    expect(BS_CMD_BODY_BYTES.read).toBe(8)
    expect(BS_REPLY_BODY_BYTES.read).toBe(17)
    expect(implRow('Read 读什么').sim).toContain(`命令帧体 ${BS_CMD_BODY_BYTES.read} 个字节，应答帧体 ${BS_REPLY_BODY_BYTES.read} 个字节`)
    expect([AMP_RFID_HDR_BYTES, AMP_RFID_FCS_BYTES]).toEqual([4, 2])
    expect(implRow('帧头宽度').sim).toContain(`AMP RFID 帧照此取 ${AMP_RFID_HDR_BYTES} + ${AMP_RFID_FCS_BYTES} 个字节`)
  })

  it('no Select, no Write, no Authenticate: a Write\'s excitation alone outlasts the TXOP limit (absent)', () => {
    expect(implRow('Select、Write 与 Authenticate').kind).toBe('absent')
    for (const v of [undefined, CHARGE20, 1, ACWE0]) {
      expect(ofType(recs(v), 'AMP_RFID').every((r) => r.cmd === 'trigger' || r.cmd === 'read')).toBe(true)
    }
    expect(AMP_BS_WRITE_T3_NS).toBe(2 * MS)
    // 1.1 × T3 + 1 µs of BST before the reply itself is even counted
    expect(1.1 * AMP_BS_WRITE_T3_NS + 1 * US).toBeGreaterThan(2.2 * MS)
    expect(ampBsDlPpduNs('read', 0, Math.round(1.1 * AMP_BS_WRITE_T3_NS + US), sigExt)).toBeGreaterThan(LIMIT)
    expect(implRow('Select、Write 与 Authenticate').sim).toContain(`Write 的应答时延取 ${AMP_BS_WRITE_T3_NS / MS} ms`)
  })

  it('every TXOP fits the AC_BK TXOP limit; a CTS-to-self reserves the rest of it; one frame a TXOP at 250 kb/s', () => {
    expect(implRow('一次传输机会的长度').kind).toBe('faithful')
    expect(LIMIT).toBe(2_528_000)
    const cts = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'cts')
    for (const c of cts) expect(c.frame.durationFieldNs).toBe(LIMIT - ctsNs)
    expect(implRow('一次传输机会的长度').sim).toContain(`CTS-to-self 预留 ${(LIMIT - ctsNs) / US} µs`)
    const frames = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ampRfid')
    for (const [i, c] of cts.entries()) {
      const next = cts[i + 1]?.t ?? Infinity
      const inside = frames.filter((f) => f.t > c.t && f.t < next)
      if (inside.length === 0) continue
      expect(inside.length, `TXOP at ${c.t}`).toBe(1)
      const last = inside[inside.length - 1]
      expect(last.t + last.frame.txTimeNs - c.t).toBeLessThanOrEqual(LIMIT)
    }
    for (const x of inv(rs)) expect(x.txopNs).toBeLessThanOrEqual(LIMIT)
    expect(implRow('一次盘点跨传输机会').kind).toBe('choice')
    expect(DEFAULT_AMP_BS.slots).toBe(4)
    expect(implRow('一次盘点跨传输机会').sim).toContain(`一次盘点发 ${DEFAULT_AMP_BS.slots} 帧触发帧`)
  })

  it('WUP-Excitation on the first PPDU of a TXOP only; BST sized by the draft formula; 16 µs between frames', () => {
    expect(AMP_BS_WUP_MIN_NS).toBe(MS)
    expect(DEFAULT_AMP_BS.wupMs).toBe(1)
    expect(AMP_BS_T1_NS).toBe(16 * US)
    expect(implRow('BST-Excitation').sim).toBe(`照此计算，T1 = ${AMP_BS_T1_NS / US} µs。`)
    expect(implRow('帧间间隔').sim).toBe(`两帧之间 ${AMP_BS_T2_NS / US} µs（取自 11-26/0120r0）。`)
    const frames = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ampRfid')
    const cts = ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'cts')
    for (const c of cts) {
      const first = frames.find((r) => r.t > c.t)
      if (!first) continue
      const cmd = first.frame.amp!.rfid!.cmd
      expect(first.frame.amp!.rfid!.wupNs).toBe(MS)
      expect(first.frame.txTimeNs).toBe(ampBsDlPpduNs(cmd, MS, bstNs(cmd === 'trigger' ? 'id' : 'read', 250), sigExt))
    }
  })

  it('no AMP Ack, ever: the reader sends triggers, Reads and a CTS-to-self, the tags reflect', () => {
    expect(implRow('不回 Ack').kind).toBe('faithful')
    expect([...new Set(ofType(rs, 'TX_START').map((r) => r.frame.kind))].sort()).toEqual(['ampBsReply', 'ampRfid', 'cts'])
  })

  it('a tag does not look at the session: one already read still answers (choice)', () => {
    expect(implRow('会话号').kind).toBe('choice')
    const s1 = inv(rs).filter((x) => x.session === 1)
    const readIds = new Set(s1.flatMap((x) => x.read).map((epc) => crc16Epc(epc).toString(16).padStart(4, '0')))
    const lastS1 = s1[s1.length - 1].t
    // after its EPC went out, some tag still sends AMP Responses to later triggers of later sessions
    const ids = inv(rs).filter((x) => x.t > lastS1).flatMap((x) => x.ids)
    expect(ids.some((id) => readIds.has(id))).toBe(true)
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
    const m = /上电的距离移到 ([\d.]+) m，Tag 6 醒来，一秒钟抽取 (\d+) 次 ABOC、反射 (\d+) 次 AMP Response；可读取的距离仍是 ([\d.]+) m，Tag 6 的余量是 −([\d.]+) dB，一次也没有被解出。它的反射与别的标签相撞，使这一秒读回的 EPC 从 (\d+) 个降到 (\d+) 个/.exec(e)!
    const strong = ampBackscatter.variants![CHARGE20].scenario().nodes[0].ampAp!.backscatter!.chargeDbm
    expect(m[1]).toBe(activationReachM(strong).toFixed(3))
    expect(Number(m[2])).toBe(ofType(loud, 'AMP_ABOC').filter((r) => r.node === TAGS[5]).length)
    expect(Number(m[3])).toBe(replies(loud, 'id').filter((r) => r.node === TAGS[5]).length)
    expect(m[4]).toBe(monoReachM(DEFAULT_AMP_BS.bsDbm, 250).toFixed(3))
    expect(-Number(m[5])).toBe(Number(ofType(loud, 'AMP_BS_REPLY').find((r) => r.node === TAGS[5])!.snrDb.toFixed(2)))
    expect(epcCount(loud, TAGS[5])).toBe(0)
    expect(replies(loud, 'read').length).toBe(tally(loud).read)
    expect([Number(m[6]), Number(m[7])]).toEqual([tally(recs()).read, tally(loud).read])
    expect(Math.floor(activationReachM(strong) / activationReachM(DEFAULT_AMP_BS.chargeDbm))).toBe(3)
  })

  it('lab 3: the TXOP arithmetic, term by term', () => {
    const f = blockOf(lab('一个传输机会只容纳一帧'), 'formula', '250 kb/s 下一个传输机会里的帧')
    const m = /(\d+) \+ (\d+) \+ 触发帧 ([\d.]+) = ([\d.]+) µs；再加 (\d+) \+ 不带 WUP 的触发帧 ([\d.]+) = ([\d.]+) µs > (\d+) µs\n(\d+) \+ (\d+) \+ Read ([\d.]+) = ([\d.]+) µs/.exec(f.text)!
    const n = m.slice(1).map(Number)
    const trigW = ampBsDlPpduNs('trigger', MS, bstNs('id', 250), sigExt) / US
    const trig = ampBsDlPpduNs('trigger', 0, bstNs('id', 250), sigExt) / US
    const read = ampBsDlPpduNs('read', MS, bstNs('read', 250), sigExt) / US
    expect([n[0], n[1], n[2]]).toEqual([ctsNs / US, ERP_2G.sifsNs / US, trigW])
    expect(n[3]).toBeCloseTo(n[0] + n[1] + n[2], 6)
    expect([n[4], n[5]]).toEqual([AMP_BS_T2_NS / US, trig])
    expect(n[6]).toBeCloseTo(n[3] + n[4] + n[5], 6)
    expect(n[7]).toBe(LIMIT / US)
    expect(n[6] * US).toBeGreaterThan(LIMIT)
    expect([n[8], n[9], n[10]]).toEqual([ctsNs / US, ERP_2G.sifsNs / US, read])
    expect(n[11]).toBeCloseTo(n[8] + n[9] + n[10], 6)
    expect(n[11] * US).toBeLessThanOrEqual(LIMIT)
    // the first frame of the run is that trigger
    const first = ofType(recs(), 'TX_START').find((r) => r.frame.kind === 'ampRfid')!
    expect(first.frame.txTimeNs).toBe(trigW * US)
  })

  it('lab 3: seven TXOPs, 15.6 ms, and the airtime of a second', () => {
    const rs = recs()
    const e = lab('一个传输机会只容纳一帧').expect
    const m = /第一次盘点用 (\d+) 个传输机会、([\d.]+) ms 才完成：(\d+) 帧触发帧各占一个，听到的 (\d+) 个标识各用一个读回 EPC。一秒钟内 (\d+) 帧占用 ([\d.]+) ms，也就是 ([\d.]+) %。每个传输机会都在 AC_BK 的 ([\d.]+) ms TXOP 限制之内/.exec(e)!
    const first = inv(rs).filter((r) => r.session === 1)
    expect(Number(m[1])).toBe(first.length)
    expect(first[first.length - 1].complete).toBe(true)
    expect(m[2]).toBe((first[first.length - 1].t / MS).toFixed(1))
    expect(Number(m[3])).toBe(first.reduce((n, x) => n + x.slotsOffered, 0))
    expect(Number(m[3])).toBe(DEFAULT_AMP_BS.slots)
    expect(Number(m[4])).toBe(first.reduce((n, x) => n + x.read.length, 0))
    expect(Number(m[3]) + Number(m[4])).toBe(first.length)
    expect(Number(m[5])).toBe(ofType(rs, 'AMP_RFID').length)
    expect(m[6]).toBe((rfidAirtimeNs(rs) / MS).toFixed(1))
    expect(m[7]).toBe((rfidAirtimeNs(rs) / RUN_NS * 100).toFixed(1))
    expect(Number(m[8]) * MS).toBe(LIMIT)
  })

  it('lab 4: forty triggers, the AMP Responses, the 10.8 dB pair, and ACWE = 0', () => {
    const rs = recs()
    const e = lab('读不出与空时隙').expect
    const m = /一秒钟 (\d+) 帧触发帧里，听到标识 (\d+) 次、读不出 (\d+) 次、空 (\d+) 次；标签一共反射 (\d+) 次 AMP Response。15 cm 与 28 cm 的两张标签在同一时隙作答时，近的那张强 ([\d.]+) dB，读写器解出它，这一时隙记为听到标识。ACWE = 0 时五张醒着的标签每帧都抽到 0，(\d+) 帧触发帧全部读不出，一个标识也没听到/.exec(e)!
    const t = tally(rs)
    expect([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]).toEqual([t.off, t.ids, t.col, t.emp])
    expect(t.ids + t.col + t.emp).toBe(t.off)
    expect(Number(m[5])).toBe(replies(rs, 'id').length)
    const near = ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === TAGS[0])!
    const far = ofType(rs, 'AMP_BS_REPLY').find((r) => r.node === TAGS[4])!
    expect(m[6]).toBe((near.snrDb - far.snrDb).toFixed(1))
    const z = recs(ACWE0)
    expect(ofType(z, 'AMP_ABOC').every((r) => r.aboc === 0 && r.acw === 0)).toBe(true)
    expect(new Set(ofType(z, 'AMP_ABOC').map((r) => r.node)).size).toBe(5)
    expect(tally(z)).toEqual({ off: Number(m[7]), ids: 0, read: 0, col: Number(m[7]), emp: 0 })
  })

  it('the why\'s own figures', () => {
    const w = ampBackscatter.why!
    expect(w).toContain(`至少 ${AMP_BS_WUP_MIN_NS / MS} ms 的 WUP-Excitation`)
    expect(w).toContain(`帧结束后 ${AMP_BS_T1_NS / US} µs（±20 %）应答`)
    expect(w).toContain(`TXOP 限制 ${LIMIT / MS} ms`)
    expect(w).toContain(`Write 的应答要等 ${AMP_BS_WRITE_T3_NS / MS} ms`)
  })
})
