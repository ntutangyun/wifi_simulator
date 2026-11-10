/**
 * `@ofdma-ul`, in the standard-first shape (2026-11-11).
 *
 * ① cites IEEE Std 802.11-2024 §9.3.1.22, §26.5.2.3.1–3, §26.5.2.5, §10.3.2.13.3, §26.5.5 and
 * §26.2.7; ② says what `transmitTrigger` / `respondToTrigger` (src/engine/mac.ts) do, and each row
 * that names an engine behaviour is pinned against the run; ③'s figures are read back out of the
 * lesson text and compared with 100 ms runs of the base scene and its variant.
 *
 * `tests/course/lessons.test.ts` keeps its own pin on this scene (every TB PPDU of a round starts
 * SIFS after the trigger and runs the length it named); `tests/course/lesson-claims.test.ts` pins
 * that the uploaders still contend between rounds.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ofdmaUl, ofdmaUlScenario, triggeredRound, ROUND, ROUND_AT } from '../../src/course/tier2/ofdma-ul'
import { isStandardFirst, oneRoom, node, sc, type Block, type Lab } from '../../src/course/lessonKit'
import { MODULES } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { MAX_PPDU_NS, PHY_MODES, multiStaBaBytes, ppduTiming, triggerBytes } from '../../src/engine/phy'
import { timingFor } from '../../src/engine/simulation'
import { maxPsduBytesFor } from '../../src/engine/mac'
import { ampduPsduBytes } from '../../src/model/frames'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
/** The window every number in this lesson is measured over. */
const RUN_NS = 100 * MS
const SIFS_NS = 16 * US
/** The EHT AP's wait for HE TB PPDUs: SIFS + slot + 24 µs (2026-11-11, W6). */
const ACK_TIMEOUT_NS = timingFor('5g', 'eht').ackTimeoutNs
const UPLOADERS = ['sta-1', 'sta-2']
const A_OFF = 0

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const triggers = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'trigger')
const tbPpdus = (rs: TLRecord[]): Tx[] =>
  txs(rs, (r) => r.frame.kind === 'data' && r.frame.orthogonalGroup !== undefined)
const contended = (rs: TLRecord[]): Tx[] =>
  txs(rs, (r) => r.frame.kind === 'data' && r.frame.orthogonalGroup === undefined)
// 2026-11-11 (W7a): `frame.bytes` of an HE PPDU is its PSDU_LENGTH — the A-MPDU padded to the last
// symbol (IEEE Std 802.11-2024 §10.12.6); `apepBytes` is the A-MPDU itself, which the lesson counts.
const apep = (r: Tx): number => r.frame.apepBytes ?? r.frame.bytes
const bytes = (xs: Tx[]): number => xs.reduce((a, r) => a + apep(r), 0)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
const usText = (ns: number): string => `${(ns / US).toFixed(1)} µs`
const grouped = (n: number): string => n.toLocaleString('en-US')

const base = (): TLRecord[] => runOf(ofdmaUl, undefined, RUN_NS)

const lab = (heading: string): Lab => {
  const l = ofdmaUl.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = ofdmaUl.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => ofdmaUl.standard!.map((b) =>
  `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')

lessonShapeSuite(ofdmaUl, { runNs: RUN_NS })

describe('ofdma-ul · the lesson', () => {
  it('is in the standard-first shape, in the scheduled Wi-Fi module, after the downlink', () => {
    expect(isStandardFirst(ofdmaUl)).toBe(true)
    expect(MODULES[ofdmaUl.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(ofdmaUl.needs).toEqual(['ofdma-dl'])
    expect(ofdmaUl.terms!.map((t) => t.term)).toEqual(['uplink', 'trigger frame', 'TB'])
    expect(ofdmaUl.limits).toEqual([])
    expect(ofdmaUl.observe).toEqual([])
    expect(ofdmaUl.tryThis).toEqual([])
  })

  it('keeps the room it always had, and its variant only switches uploader A off OFDMA', () => {
    const was = sc(oneRoom(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
      node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
    ])
    expect(ofdmaUl.scenario()).toEqual(was)
    expect(ofdmaUlScenario()).toEqual(was)
    expect(() => ScenarioSchema.parse(ofdmaUl.scenario())).not.toThrow()
    expect(ofdmaUl.variants!.map((v) => v.label)).toEqual(['上传设备 A 关闭 OFDMA'])
    const v = ofdmaUl.variants![A_OFF].scenario()
    expect(() => ScenarioSchema.parse(v)).not.toThrow()
    expect(v.nodes.map((n) => n.caps.features?.ofdma === false)).toEqual([false, true, false])
    expect({ ...v, nodes: v.nodes.map((n, i) => ({ ...n, caps: was.nodes[i].caps })) }).toEqual(was)
  })

  it('cites each clause it teaches in ①, and nothing in ① is the simulator', () => {
    const std = stdText()
    for (const c of ['§9.3.1.22', '§26.5.2.3.1', '§26.5.2.3.3', '§26.5.2.3.2', '§26.6.2.3', '§26.5.2.5', '§10.3.2.13.3', '§9.3.1.8.6', '§26.5.5', '表 9-54', '§26.2.7', '§26.5.2.2.5']) {
      expect(std, c).toContain(c)
    }
    for (const sim of ['本仿真器', '引擎', '1/n']) expect(std).not.toContain(sim)
    // Table 9-54's encoding and §26.5.2.5's 418, as ① prints them
    expect(std).toContain('取值 0 至 90 表示 −110 + 取值 dBm，127 表示')
    expect(std).toContain('UL Length 超过 418 的 Basic 触发帧必须把 CS Required 置 1')
  })

  it('② is not all faithful, and names what differs and what is absent', () => {
    const kinds = new Set(ofdmaUl.implementation!.map((r) => r.kind))
    for (const k of ['faithful', 'value', 'choice', 'differs', 'absent'] as const) expect(kinds.has(k), k).toBe(true)
    expect(implRow('应答前的侦听').kind).toBe('differs')
    expect(implRow('邀请谁').kind).toBe('differs')
    expect(implRow('功率').kind).toBe('absent')
    expect(implRow('MU EDCA').kind).toBe('absent')
  })
})

describe('ofdma-ul · ② says what the engine does, and the engine does it', () => {
  it('the trigger is 28 + 6 per user — header, Common Info and FCS, then a Basic User Info each', () => {
    // §9.3.1.22: FC 2 + Duration 2 + RA 6 + TA 6 = 16, Common Info B0–B63 = 8, FCS 4; a User Info
    // field is B0–B39 = 5 octets plus the Basic trigger's one-octet Trigger Dependent User Info.
    expect(16 + 8 + 4).toBe(28)
    expect(5 + 1).toBe(6)
    expect(triggerBytes(2)).toBe(28 + 6 * 2)
    for (const t of triggers(base())) {
      expect(t.frame.bytes).toBe(triggerBytes(t.frame.muParts!.length))
      expect(t.frame.mbps).toBe(24)
    }
    const row = implRow('触发帧的长度')
    expect(row.standard).toContain('帧头（MAC header）16 字节、公共信息 8 字节、帧校验序列（frame check sequence, FCS）4 字节')
    expect(row.standard).toContain('每个用户信息 6 字节')
    expect(row.sim).toContain('28 + 6 × 用户数')
    expect(row.sim).toContain('24 Mb/s')
  })

  it('the access point reads the stations’ queues directly: `ulBacklog` sums them', () => {
    const sim = readFileSync('src/engine/simulation.ts', 'utf8')
    expect(sim).toContain('ulBacklog')
    expect(readFileSync('src/engine/mac.ts', 'utf8')).toContain('this.cfg.ulBacklog()')
  })

  it('two to four users on 1/n each, one length for all, capped at 2 ms', () => {
    const mac = readFileSync('src/engine/mac.ts', 'utf8')
    expect(mac).toContain('users.slice(0, 4)')
    expect(mac).toContain('users.length >= 2')
    expect(mac).toContain('Math.min(need, 2_000_000)')
    for (const t of triggers(base())) {
      const users = t.frame.muParts!
      expect(users.length).toBeGreaterThanOrEqual(2)
      expect(users.length).toBeLessThanOrEqual(4)
      expect(new Set(users.map((p) => p.durNs)).size).toBe(1)
      expect(users[0].durNs!).toBeLessThanOrEqual(2 * MS)
    }
    for (const a of tbPpdus(base())) expect(a.frame.ru!.fraction).toBe(1 / 2)
    expect(implRow('长度上限').sim).toContain('2 ms')
    expect(implRow('长度上限').sim).toContain(`${MAX_PPDU_NS / MS} ms`)
    expect(implRow('一组几台').sim).toContain('不少于两台')
    expect(implRow('一组几台').sim).toContain('前四台')
  })

  it('every answer starts one SIFS after its trigger and runs exactly the length it named', () => {
    const rs = base()
    for (const t of triggers(rs)) {
      for (const a of tbPpdus(rs).filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup)) {
        expect(a.t).toBe(t.t + t.frame.txTimeNs + SIFS_NS)
        expect(a.frame.txTimeNs).toBe(t.frame.muParts!.find((p) => p.dst === a.node)!.durNs)
      }
    }
    expect(implRow('应答间隔').sim).toContain(`${SIFS_NS / US} µs`)
  })

  it('the check before answering is the NAV only, the triggering AP’s own NAV excluded', () => {
    const mac = readFileSync('src/engine/mac.ts', 'utf8')
    expect(mac).toContain('if (this.now() < this.navUntil && this.navSetBy !== from) break')
    // and the trigger's own Duration covers the round, which would silence everyone otherwise
    for (const t of triggers(base())) expect(t.frame.durationFieldNs).toBe(SIFS_NS + t.frame.muParts![0].durNs! + SIFS_NS + 36 * US)
  })

  it('the multi-STA BlockAck is 32 + 8 per extra user at 24 Mb/s; an unanswered trigger dies at 49 µs', () => {
    expect(multiStaBaBytes(2)).toBe(40)
    for (const m of txs(base(), (r) => r.frame.kind === 'mba')) {
      expect(m.frame.bytes).toBe(multiStaBaBytes(m.frame.muParts!.length))
      expect(m.frame.mbps).toBe(24)
    }
    expect(implRow('多站点块确认').sim).toContain('32 字节加每多一台 8 字节')
    // 2026-11-11 (W6): the EHT AP waits for HE TB PPDUs with SIFS + slot + 24 µs (§10.3.2.9, Table 27-61)
    expect(ACK_TIMEOUT_NS).toBe(49 * US)
    expect(implRow('无人应答').sim).toContain(`${ACK_TIMEOUT_NS / US} µs`)
    expect(implRow('无人应答').sim).toContain('16 + 9 + 24')
  })

  it('a device given a slice keeps its own stream count — on a synthetic two-stream copy', () => {
    for (const n of ofdmaUl.scenario().nodes) expect(n.caps.nss ?? 1).toBe(1)
    const s: Scenario = ofdmaUl.scenario()
    for (const id of ['ap', 'sta-1']) s.nodes.find((n) => n.id === id)!.caps.nss = 2
    const answers = tbPpdus([...new Simulation(s).runUntil(RUN_NS).records])
    expect(answers.length).toBeGreaterThan(4)
    for (const a of answers) expect(a.frame.ampdu!.mpduCount).toBe(a.node === 'sta-1' ? 20 : 11)
    expect(implRow('资源单元').sim).toContain('每台仍按自己协商的空间流')
  })
})

describe('ofdma-ul · ③ every figure the labs print is the run', () => {
  it('lab 1: the first triggered round, its figure and its worked table', () => {
    const rs = base()
    const t = triggers(rs)[0]
    const answers = tbPpdus(rs).filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup)
    expect(answers.map((r) => r.node).sort()).toEqual(UPLOADERS)
    const mba = txs(rs, (r) => r.frame.kind === 'mba')[0]
    const ans = one(answers.map((a) => a.t))
    const dur = one(answers.map((a) => a.frame.txTimeNs))
    const each = one(answers.map(apep))
    // the padding the worked table prints is the EOF padding that fills the TB PPDU (§10.12.6)
    expect(one(answers.map((a) => a.frame.bytes))).toBe(maxPsduBytesFor('he', 11, 1 / t.frame.muParts!.length, 2 * MS, 20, 1))
    const l = lab('一次触发交换')
    expect(l.expect).toContain(`${usText(t.t)} 接入点发出 ${t.frame.txTimeNs / US} µs 的触发帧，它的 Duration 字段是 ${usText(t.frame.durationFieldNs)}`)
    expect(l.expect).toContain(`${usText(ans)} 两台上传设备同时开始应答，各 ${usText(dur)}、各 ${grouped(each)} 字节`)
    expect(answers.map((a) => a.frame.ru!.partIdx).sort()).toEqual([0, 1])
    expect(l.expect).toContain('分别在信道的前一半和后一半')
    expect(mba.t).toBe(ans + dur + SIFS_NS)
    expect(l.expect).toContain(`${usText(mba.t)} 接入点发出 ${mba.frame.txTimeNs / US} µs 的多站点块确认`)

    // the figure's instants are this round's, measured from the trigger's own start
    expect(ROUND).toEqual({ trigger: t.frame.txTimeNs / US, gap: SIFS_NS / US, answers: dur / US, mba: mba.frame.txTimeNs / US })
    expect(ROUND_AT.answers * US).toBe(ans - t.t)
    expect(ROUND_AT.mba * US).toBeCloseTo(mba.t - t.t, 6)
    const spec = triggeredRound()
    expect(spec.messages.find((m) => m.label === '应答 A')!.at).toBe(`${(ans - t.t) / US} µs`)
    expect(spec.messages.find((m) => m.label === '一帧确认')!.at).toBe(`${Math.round((mba.t - t.t) / US)} µs`)

    // the worked table
    const cells = Object.fromEntries(tableOf(l, '第一次触发交换，按本仿真器的规则算一遍').rows.map((r) => [r[0], r[1]]))
    const users = t.frame.muParts!.length
    const budget = maxPsduBytesFor('he', 11, 1 / users, 2 * MS, 20, 1)
    const perSym = PHY_MODES.he.ndbps[11] / users
    const syms = Math.ceil((16 + 8 * budget + 6) / perSym)
    const mpdus = one(answers.map((a) => a.frame.ampdu!.mpduCount))
    expect(cells['有积压的上传设备']).toBe(String(users))
    expect(cells['每台分到的信道']).toBe(`1/${users}`)
    expect(cells['一个 2 ms 的应答最多容纳']).toBe(`${grouped(budget)} B`)
    expect(cells['这些字节需要的符号（symbol）数']).toBe(String(syms))
    // 2026-11-11 (W6): the HE TB PPDU's own preamble (8 µs HE-STF) and its packet extension
    const pt = ppduTiming('he', budget, 11, { ruFraction: 1 / users, widthMhz: 20, nss: 1, tb: true })
    expect(pt.nsym).toBe(syms)
    expect(cells['因此应答长度']).toBe(`${pt.preambleNs / US} + ${pt.symNs / US} × ${pt.nsym} + ${pt.peNs / US} = ${usText(dur)}`)
    expect(pt.preambleNs + pt.nsym * pt.symNs + pt.peNs).toBe(dur)
    expect(ampduPsduBytes(new Array<number>(mpdus).fill(1500))).toBe(each)
    expect(ampduPsduBytes(new Array<number>(mpdus + 1).fill(1500))).toBeGreaterThan(budget)
    expect(cells['每个应答实际承载']).toBe(`${mpdus} 帧，${grouped(each)} B；其余 ${budget - each} B 是填充`)
    expect(cells['触发帧']).toBe(`28 + 6 × ${users} = ${t.frame.bytes} B，${t.frame.mbps} Mb/s，${t.frame.txTimeNs / US} µs`)
    expect(cells['多站点块确认']).toBe(`32 + 8 = ${mba.frame.bytes} B，${mba.frame.txTimeNs / US} µs`)
    const total = mba.t + mba.frame.txTimeNs - t.t
    expect(cells['整次交换']).toBe(`${t.frame.txTimeNs / US} + ${SIFS_NS / US} + ${dur / US} + ${SIFS_NS / US} + ${mba.frame.txTimeNs / US} = ${usText(total)}，上行 ${grouped(2 * each)} B`)
  })

  it('lab 2: one acknowledgement for the pair, and no backoff between trigger and answer', () => {
    const rs = base()
    const mba = txs(rs, (r) => r.frame.kind === 'mba')[0]
    expect(rs.find(ofdmaUl.jumps[1].find)!.t).toBe(mba.t)
    expect(mba.frame.muParts!.map((p) => p.dst).sort()).toEqual(UPLOADERS)
    const l = lab('一帧确认整组')
    expect(l.expect).toContain(`这一帧 ${mba.frame.bytes} 字节、${mba.frame.txTimeNs / US} µs，同时确认两台上传设备`)
    for (const t of triggers(rs)) {
      const end = t.t + t.frame.txTimeNs
      const draws = ofType(rs, 'BACKOFF_DRAW').filter((r) => UPLOADERS.includes(r.node) && r.t >= end && r.t < end + SIFS_NS)
      expect(draws, `backoff inside the gap after ${t.t}`).toEqual([])
    }
  })

  it('lab 3: the uplink of 100 ms, triggered and contended', () => {
    const rs = base()
    const trig = triggers(rs)
    const answered = trig.map((t) => tbPpdus(rs).filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup).length)
    const unanswered = answered.filter((n) => n === 0).length
    expect(new Set(answered)).toEqual(new Set([0, 2]))
    const tb = tbPpdus(rs), su = contended(rs)
    const rows = tableOf(lab('100 ms 里的上行'), '两台上传设备，100 ms').rows
    expect(rows).toEqual([
      ['触发帧', String(trig.length), '—'],
      ['其中无人应答', String(unanswered), '0'],
      ['HE TB PPDU', String(tb.length), grouped(bytes(tb))],
      ['普通竞争发送', String(su.length), grouped(bytes(su))],
    ])
    for (const r of [...tb, ...su]) expect(UPLOADERS).toContain(r.node)
    // 「约三分之一」
    expect(Math.round(3 * bytes(tb) / (bytes(tb) + bytes(su)))).toBe(1)
    expect(ofdmaUl.why).toContain('约三分之一')
    expect(ofdmaUl.why).toContain(`${RUN_NS / MS} ms`)
    const collisions = ofType(rs, 'COLLISION')
    for (const c of collisions) {
      expect(tbPpdus(rs).some((t) => t.t <= c.t && c.t <= t.t + t.frame.txTimeNs), `collision at ${c.t}`).toBe(false)
    }
    const l = lab('100 ms 里的上行')
    expect(l.expect).toContain(`期间碰撞 ${collisions.length} 次，全部发生在触发交换之外`)
    expect(l.expect).toContain(`有 ${unanswered} 个触发帧无人应答，接入点等 ${ACK_TIMEOUT_NS / US} µs 后收回空口`)
    // the unanswered ones really end at the timeout: an ACK_TIMEOUT at the AP 45 µs after each
    for (const [i, t] of trig.entries()) {
      if (answered[i] !== 0) continue
      expect(ofType(rs, 'ACK_TIMEOUT').some((r) => r.node === 'ap' && r.t === t.t + t.frame.txTimeNs + ACK_TIMEOUT_NS), `timeout after ${t.t}`).toBe(true)
    }
  })

  it('lab 4: with uploader A off OFDMA, no trigger frame at all', () => {
    const rs = runOf(ofdmaUl, A_OFF, RUN_NS)
    expect(lab('只剩一台协商了 OFDMA').variant).toBe(A_OFF)
    expect(triggers(rs)).toHaveLength(0)
    expect(tbPpdus(rs)).toHaveLength(0)
    expect(contended(rs).filter((r) => r.node === 'sta-2').length).toBeGreaterThan(20)
    expect(lab('只剩一台协商了 OFDMA').expect).toContain('一个触发帧也没有')
  })
})
