/**
 * `@roles-stack`, in the standard-first shape (2026-11-11).
 *
 * ① is IEEE Std 802.11-2024's architecture (STA, AP, BSS, BSSID, SSID, DS, ESS, the To DS /
 * From DS address table, intra-BSS distribution); ② marks this simulator against it; ③ reads the
 * 1000 ms run. Every figure the labs print is read back out of the lesson text and compared with
 * the run, the link table, `reqSinrDb` and the field view (`decodeFrame`) — including the one row
 * where the field view and Table 9-60 disagree, which is pinned here as the engine's present
 * behaviour so that fixing it turns this red and the lesson gets rewritten with it.
 *
 * The scene and the jump predicates are shared with `relay-hops`; the figure checks are the
 * ones that file and `tests/course/diagram.test.ts` make of every topology.
 */
import { describe, it, expect } from 'vitest'
import {
  rolesStack, rolesStackScenario, rolesStackTopology, firstRelayHop1, firstRelayHop2,
} from '../../src/course/tier1/roles-stack'
import { MODULES } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { reqSinrDb, noiseDbm } from '../../src/engine/phy'
import { buildLinkTable } from '../../src/engine/propagation'
import { decodeFrame } from '../../src/model/frameFields'
import { FRAME_KINDS } from '../../src/model/frames'
import type { TLRecord } from '../../src/model/records'
import { ScenarioSchema } from '../../src/model/scenario'
import { lessonShapeSuite, ofType, runOf } from './kit'

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const MS = 1_000_000
const RUN_NS = 1000 * MS
const NAME: Record<string, string> = { ap: '接入点', 'sta-1': '笔记本', 'sta-2': '电视', 'sta-3': '手机 A', 'sta-4': '手机 B' }

const lab = (heading: string): Lab => {
  const l = rolesStack.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = rolesStack.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => rolesStack.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
const rs = (): TLRecord[] => runOf(rolesStack, undefined, RUN_NS)
const dataTx = (r: TLRecord[]): Tx[] => ofType(r, 'TX_START').filter((x) => x.frame.kind === 'data')

lessonShapeSuite(rolesStack, { runNs: RUN_NS })

describe('roles-stack · the lesson', () => {
  it('is in the standard-first shape, first in the roles module', () => {
    expect(isStandardFirst(rolesStack)).toBe(true)
    expect(MODULES[rolesStack.module].title).toBeTruthy()
    expect(rolesStack.needs).toEqual(['radio-primer', 'decode-thresholds'])
    expect(rolesStack.terms!.map((t) => t.term)).toEqual(['BSS', 'BSSID', 'SSID', 'DS'])
    expect(rolesStack.limits).toEqual([])
    expect(rolesStack.observe).toEqual([])
    expect(rolesStack.tryThis).toEqual([])
    expect(() => ScenarioSchema.parse(rolesStack.scenario())).not.toThrow()
  })

  it('cites each clause it teaches in ①', () => {
    const std = stdText()
    for (const c of ['§3.1', '§9.2.4.3.4', '§4.3.5', '§4.3.4', '§4.3.5.1', '表 9-3', '表 9-60', '§10.3.2.11', '§4.5.2.1', '§11.1.4.5']) {
      expect(std, c).toContain(c)
    }
    expect(std).toContain('0 到 32 个八位组')
    expect(std).toContain('不意味着能与其他所有成员直接通信')
  })

  it('①: the address table has the three combinations, with Address 3 the DA going up and the SA coming down', () => {
    const t = rolesStack.standard!.find((b) => b.kind === 'table' && b.heading!.includes('表 9-60')) as Extract<Block, { kind: 'table' }>
    expect(t.rows.map((r) => [r[0], r[2], r[3], r[4]])).toEqual([
      ['1 / 0', 'RA = BSSID', 'TA = SA', 'DA'],
      ['0 / 1', 'RA = DA', 'TA = BSSID', 'SA'],
      ['0 / 0', 'RA = DA', 'TA = SA', 'BSSID'],
    ])
  })

  it('marks what differs and what is absent', () => {
    expect(implRow('MAC 地址').kind).toBe('differs')
    expect(implRow('上行帧的地址 3').kind).toBe('differs')
    expect(implRow('信标、扫描、认证与关联').kind).toBe('absent')
    expect(implRow('隧道直连链路').kind).toBe('absent')
    expect(implRow('同一基本服务集内的转发').kind).toBe('faithful')
  })
})

describe('roles-stack · ② says what the engine does, and the engine does it', () => {
  it('no beacon, probe, authentication or association frame can go on the air', () => {
    for (const k of ['beacon', 'probeReq', 'probeResp', 'auth', 'assocReq', 'assocResp']) expect(FRAME_KINDS as readonly string[]).not.toContain(k)
  })

  it('one access point per scene, and node names in the address fields', () => {
    const s = rolesStackScenario()
    expect(s.nodes.filter((n) => n.kind === 'ap').map((n) => n.id)).toEqual(['ap'])
    const hop1 = rs().find(firstRelayHop1) as Tx
    const f = decodeFrame(hop1.frame, { apId: 'ap', isEdca: true }).users[0].subframes[0].mpdu.fields
    const a1 = f.find((x) => x.key === 'addr1')!
    expect(a1.bytes).toBe(6)
    expect('node' in a1 && a1.node).toBe('ap')
  })

  it('the relay: every phone-to-phone payload is queued to the AP, then sent on by it', () => {
    const r = rs()
    expect(dataTx(r).some((x) => x.node !== 'ap' && x.frame.dst !== 'ap')).toBe(false)
    const hop1 = r.find(firstRelayHop1) as Tx
    const hop2 = r.find(firstRelayHop2) as Tx
    expect(hop1.frame.dst).toBe('ap')
    expect(hop2.node).toBe('ap')
    expect(hop2.t).toBeGreaterThan(hop1.t)
  })
})

describe('roles-stack · ③ every figure the labs print is the run', () => {
  it('lab 1: the figure is the scene, and the one-second census of data frames', () => {
    const l = lab('每一个数据帧的一端都是接入点')
    const spec = rolesStackTopology()
    const sc = rolesStackScenario()
    expect(spec.nodes.map((n) => [n.id, n.x, n.y])).toEqual(sc.nodes.map((n) => [n.id, n.pos.x, n.pos.y]))
    for (const link of spec.links.filter((x) => x.tone !== 'muted')) expect([link.from, link.to]).toContain('ap')
    const data = dataTx(rs())
    const count = (from: string, to: string) => data.filter((x) => x.node === from && x.frame.dst === to).length
    const rows = tableOf(l, '1 s 内的数据帧，按发送方与接收方').rows
    for (const [pair, n] of rows) {
      if (pair === '站点 → 站点') {
        expect(n).toBe(String(data.filter((x) => x.node !== 'ap' && x.frame.dst !== 'ap').length))
        continue
      }
      const [a, b] = pair.split(' → ')
      const from = Object.keys(NAME).find((k) => NAME[k] === a)!
      const to = Object.keys(NAME).find((k) => NAME[k] === b)!
      expect(n, pair).toBe(String(count(from, to)))
    }
    // the table is the whole census: its rows add up to every data frame of the run
    expect(rows.reduce((s, r) => s + Number(r[1]), 0)).toBe(data.length)
    expect(l.expect).toContain(`共有 ${data.length} 个数据帧`)
    const tv = ofType(rs(), 'TX_START').filter((x) => x.node === 'sta-2')
    expect(tv.some((x) => x.frame.kind === 'data')).toBe(false)
    expect(tv.every((x) => ['ack', 'ba', 'cts'].includes(x.frame.kind))).toBe(true)
    expect(l.expect).toContain(`发出了 ${tv.length} 帧`)
  })

  it('lab 2: Phone A cannot decode Phone B, by 0.04 dB', () => {
    const l = lab('手机 A 解不出手机 B 的帧')
    const s = rolesStackScenario()
    const lt = buildLinkTable(s.nodes, s.walls)
    const rows = tableOf(l, '到达手机 A 的电平').rows
    expect(rows[0][1]).toBe(`${lt.get('ap')!.get('sta-3')!.toFixed(2).replace('-', '−')} dBm`)
    expect(rows[1][1]).toBe(`${lt.get('sta-4')!.get('sta-3')!.toFixed(2).replace('-', '−')} dBm`)
    expect(rows[0][0]).toContain(`${s.nodes.find((n) => n.id === 'ap')!.txPowerDbm} dBm`)
    expect(rows[1][0]).toContain(`${s.nodes.find((n) => n.id === 'sta-4')!.txPowerDbm} dBm`)
    const a = s.nodes.find((n) => n.id === 'sta-3')!.pos, b = s.nodes.find((n) => n.id === 'sta-4')!.pos
    expect(rows[1][0]).toContain(`相距 ${Math.hypot(a.x - b.x, a.y - b.y)} m`)
    const r = rs()
    const fails = ofType(r, 'RX_FAIL').filter((x) => x.node === 'sta-3' && x.from === 'sta-4')
    expect(fails.every((x) => x.reason === 'lowSinr')).toBe(true)
    expect(l.expect).toContain(`记了 ${fails.length} 次 RX_FAIL`)
    const fromB = dataTx(r).filter((x) => x.node === 'sta-4')
    const mcs = Math.max(...fromB.map((x) => x.frame.mcs!))
    const atTop = fromB.filter((x) => x.frame.mcs === mcs)
    expect(l.expect).toContain(`手机 B 发出的 ${fromB.length} 个数据帧里有 ${atTop.length} 个用 MCS ${mcs}`)
    const snr = lt.get('sta-4')!.get('sta-3')! - noiseDbm(20)
    expect(l.expect).toContain(`所需 SINR 是 ${reqSinrDb('he', mcs).toFixed(2)} dB，而这条路径只有 ${snr.toFixed(2)} dB`)
    expect(snr).toBeLessThan(reqSinrDb('he', mcs))
    // the failures are the top-rung frames: there are no more of them than such frames, and the
    // next rung down would clear this path
    expect(fails.length).toBeLessThanOrEqual(atTop.length)
    expect(snr).toBeGreaterThan(reqSinrDb('he', mcs - 1))
    expect(fromB.length).toBe(dataTx(r).filter((x) => x.node === 'sta-4' && x.frame.dst === 'ap').length)
  })

  it('lab 3: the field view of the first hop, against Table 9-60', () => {
    const l = lab('字段视图里的三个地址')
    expect(rolesStack.jumps[l.jump!].find).toBe(firstRelayHop1)
    const hop1 = rs().find(firstRelayHop1) as Tx
    expect(hop1.node).toBe('sta-4')
    const f = decodeFrame(hop1.frame, { apId: 'ap', isEdca: true }).users[0].subframes[0].mpdu.fields
    const fc = f.find((x) => x.key === 'fc')!
    const bit = (k: string) => ('bits' in fc ? fc.bits!.find((x) => x.key === k)!.value : '')
    const cell = (k: string) => {
      const a = f.find((x) => x.key === k)! as { node: string; roles: string[] }
      return `${a.node}（${a.roles.join('、')}）`
    }
    const rows = tableOf(l, '第一跳的地址字段').rows
    expect(rows[0][1]).toBe(`${bit('toDs')} / ${bit('fromDs')}`)
    expect(rows[1][1]).toBe(cell('addr1'))
    expect(rows[2][1]).toBe(cell('addr2'))
    expect(rows[3][1]).toBe(cell('addr3'))
    // the deviation ② names: Address 3 is the AP, not the phone the payload is for
    expect(rows[3][1]).not.toContain('sta-3')
    expect(rows[3][2]).toContain('手机 A')
  })
})

describe('roles-stack · the quiz', () => {
  it('every answer is in range, and the TDLS question names the direct-path combination', () => {
    for (const q of rolesStack.quiz) expect(q.answer).toBeLessThan(q.options.length)
    expect(rolesStack.quiz[1].options[rolesStack.quiz[1].answer]).toContain('To DS = 0、From DS = 0')
  })
})
