/**
 * `link-2g`, in the standard-first shape (2026-11-11).
 *
 * ① is what IEEE Std 802.11-2024 specifies for a 2.4 GHz station; ② says, row by row, what this
 * engine does; ③ is five guided runs. Every figure the labs print is read back out of the lesson
 * text and compared with a run, and the ② rows that name a number are checked against the
 * engine constant or the run that produces it.
 *
 * Two kinds of assertion, and the split is the lesson's own subject. Durations, intervals, MCS
 * rungs, negotiated widths and record kinds are deterministic and pinned exactly. Throughputs are
 * means over ten or twenty seeds, because flipping the band flips the MAC's random stream: a
 * station's backoff generator is forked on `virtualId(id, link)`, which suffixes every link but
 * 5 GHz, so a single-seed A/B measures the draw rather than the band (asserted below).
 */
import { describe, it, expect } from 'vitest'
import { link2g } from '../../src/course/tier3/link-2g'
import { MODULES, TIERS, trackOf } from '../../src/course/curriculum'
import { LESSONS, lessonIndex } from '../../src/course/lessons'
import { link2gScenario } from '../../src/course/wifiScenes'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { Simulation, LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { ACK_TX_TIME_1M_DSSS_NS, CCA_PD_DBM, ERP_2G, NOISE_DBM, OFDM_5G, mcsForRssi, mcsRateMbps, noiseDbm, timingForGen } from '../../src/engine/phy'
import { negotiatedWidth, nodeLinks, virtualId } from '../../src/model/caps'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType } from './kit'

const MS = 1_000_000
type Band = '2g' | '5g'
type Shape = 'pair' | 'single' | 'burst' | 'wide'

/** 200 ms is what every throughput figure the lesson prints was measured over. */
const RUN_MS = 200

const vid = (band: Band, id: string): string => virtualId(id, band)

/** One run of one shape on one band, memoised: the engine is deterministic and nothing mutates a record array. */
const runs = new Map<string, TLRecord[]>()
function recordsOf(shape: Shape, band: Band, seed: number, ms = RUN_MS): TLRecord[] {
  const key = `${shape}/${band}/${seed}/${ms}`
  const hit = runs.get(key)
  if (hit) return hit
  const rs = [...new Simulation(link2gScenario(shape, band, { seed })).runUntil(ms * MS).records]
  runs.set(key, rs)
  return rs
}

/**
 * MSDU payload octets one reception delivered: the MSDUs of the MPDUs received intact.
 *
 * 2026-11-11 (W7a): this used to be `frame.bytes − 28`, the PSDU less a 24-octet header and the
 * FCS. `frame.bytes` of an HE PPDU is now PSDU_LENGTH — the A-MPDU with its EOF padding to the
 * last symbol (§10.12.6) — and every HE PSDU is an A-MPDU (§10.12.5), so that subtraction no
 * longer gives the payload. The payload is read from the MSDU sizes instead, MPDU by MPDU
 * (`mpduOk`, absent when all were received).
 */
const payloadOf = (r: Extract<TLRecord, { type: 'RX_OK' }>): number =>
  (r.frame.msduBytes ?? []).reduce((n, b, i) => n + (r.mpduOk?.[i] === false ? 0 : b), 0)

/** Megabits of MSDU payload the access point took delivery of, per second. */
function throughputMbps(shape: Shape, band: Band, seed: number, ms = RUN_MS): number {
  const ap = vid(band, 'ap')
  const bits = ofType(recordsOf(shape, band, seed, ms), 'RX_OK')
    .filter((r) => r.node === ap && r.frame.kind === 'data')
    .reduce((n, r) => n + payloadOf(r) * 8, 0)
  return bits / (ms / 1000) / 1e6
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const seeds = (n: number): number[] => Array.from({ length: n }, (_x, i) => i + 1)
/** `1 853.2 µs` → 1853.2; `−83.58 dBm（低 1.58 dB）` → -83.58; `−6.0` → -6. */
const num = (cell: string): number => Number((/[−-]?[\d\s]*\d(?:\.\d+)?/.exec(cell)![0]).replace(/\s/g, '').replace('−', '-'))
const us = (ns: number): string => (ns / 1000).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/,/g, ' ')

const lab = (heading: string): Lab => {
  const l = link2g.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, fragment: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && (b.heading ?? '').includes(fragment))
  expect(t, `table 「${fragment}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = link2g.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => link2g.standard!.map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''} ${'rows' in b ? b.rows.flat().join(' ') : ''}`).join(' ')

lessonShapeSuite(link2g)

describe('link-2g · where it sits in the course', () => {
  it('opens tier 3 as its only module, reads as a Wi-Fi lesson, and is standard-first', () => {
    expect(link2g.module).toBe(12)
    expect(MODULES[link2g.module].title).toBe('2.4 GHz 链路')
    expect(MODULES[link2g.module].tier).toBe(2)
    expect(trackOf(link2g)).toBe('wifi')
    expect(MODULES.filter((m) => m.tier === 2)).toHaveLength(1)
    expect(isStandardFirst(link2g)).toBe(true)
    expect(link2g.limits).toEqual([])
    expect(link2g.observe).toEqual([])
    expect(link2g.tryThis).toEqual([])
  })

  it('every prerequisite it names comes earlier, and it is the only lesson of tier 3', () => {
    expect(link2g.needs).toEqual(['ifs', 'cca', 'hidden', 'width'])
    const mine = lessonIndex('link-2g')
    for (const id of link2g.needs!) expect(lessonIndex(id), `@${id}`).toBeLessThan(mine)
    expect(LESSONS.filter((l) => MODULES[l.module].tier === 2).map((l) => l.id)).toEqual(['link-2g'])
    expect(TIERS[2].track).toBe('wifi')
  })

  it('every scene it builds is a scenario the schema accepts, with the access point on the band too', () => {
    const all = [link2g.scenario(), ...link2g.variants!.map((v) => v.scenario())]
    expect(all).toHaveLength(8)
    for (const s of all) expect(() => ScenarioSchema.parse(s)).not.toThrow()
    for (const shape of ['pair', 'single', 'burst', 'wide'] as const) {
      expect(link2gScenario(shape, '2g').nodes.every((n) => n.linkId === '2g'), shape).toBe(true)
      expect(link2gScenario(shape, '5g').nodes.every((n) => n.linkId === undefined), shape).toBe(true)
    }
  })

  it('every lab names a variant, a jump and a comparison that exist', () => {
    for (const l of link2g.labs!) {
      if (l.variant !== undefined) expect(link2g.variants![l.variant], l.heading).toBeDefined()
      if (l.jump !== undefined) expect(link2g.jumps[l.jump], l.heading).toBeDefined()
      for (const m of l.more ?? []) expect(link2g.variants![m], l.heading).toBeDefined()
    }
    expect(link2g.variants![2].label).toBe('一台站点 · 2.4 GHz')
    expect(link2g.variants![4].label).toBe('启用聚合 · 2.4 GHz')
    expect(link2g.variants![6].label).toBe('Wi-Fi 7 请求 160 MHz · 2.4 GHz')
    expect(link2g.jumps[3].label).toBe('第一条 EIFS')
  })
})

describe('link-2g · ① cites the clauses it teaches, and its table is the standard\'s', () => {
  it('names each clause', () => {
    const std = stdText()
    for (const c of ['§18.5.4', '表 18-5', '§27.4.4', '表 27-61', '§9.4.1.4', '§10.3.7', '式 10-6', '式 10-7',
      '§10.3.2.11', '§10.3.8', '§18.5.3.2', '§10.3.2.3.7', '§18.4.6', '§27.3.22.6.3', '§18.1.2', '§4.3.15', '§4.3.16', '§4.3.16a']) {
      expect(std, c).toContain(c)
    }
  })

  it('the HE characteristics table: where the engine agrees, and the one row where it does not', () => {
    const t = link2g.standard!.find((b) => b.kind === 'table') as Extract<Block, { kind: 'table' }>
    const row = (k: string) => t.rows.find((r) => r[0] === k)!
    expect(num(row('aSIFSTime')[1]) * 1000).toBe(ERP_2G.sifsNs)
    expect(num(row('aSIFSTime')[2]) * 1000).toBe(OFDM_5G.sifsNs)
    expect(row('aSlotTime')[1]).toContain(`短 ${ERP_2G.slotNs / 1000} µs`)
    expect(num(row('aSlotTime')[2]) * 1000).toBe(OFDM_5G.slotNs)
    expect(num(row('aSignalExtension')[1]) * 1000).toBe(ERP_2G.signalExtNs)
    expect(row('aSignalExtension')[2]).toBe(String(OFDM_5G.signalExtNs))
    // 2026-11-11 (W6): the standard's 24 µs is the engine's for an HE station on either band;
    // the clause 17/18 base tables keep their own 20 µs
    expect(num(row('aRxPHYStartDelay')[1])).toBe(24)
    expect(timingForGen(ERP_2G, 'he').rxStartDelayNs).toBe(24_000)
    expect(timingForGen(OFDM_5G, 'he').rxStartDelayNs).toBe(24_000)
    expect(ERP_2G.rxStartDelayNs).toBe(20_000)
    expect(OFDM_5G.rxStartDelayNs).toBe(20_000)
  })

  it('the step-by-step DIFS is the engine\'s', () => {
    const steps = link2g.standard!.find((b) => b.kind === 'steps') as Extract<Block, { kind: 'steps' }>
    expect(steps.items[0]).toContain(`10 + 2 × 9 = ${ERP_2G.difsNs / 1000} µs`)
  })
})

describe('link-2g · ② says what the engine does, and the engine does it', () => {
  it('not every row is faithful; EIFS, the ACK timeout and ED are faithful since W6 (2026-11-11)', () => {
    expect(link2g.implementation!.some((r) => r.kind !== 'faithful')).toBe(true)
    expect(implRow('EIFS 的长度').kind).toBe('faithful')
    expect(implRow('ACK 超时').kind).toBe('faithful')
    expect(implRow('能量检测的范围').kind).toBe('faithful')
    expect(implRow('频段路损偏移').kind).toBe('value')
    expect(implRow('2.4 GHz 的带宽上限').kind).toBe('faithful')
  })

  it('EIFS: 10 + 304 + 28 = 342 µs off a 1 Mb/s DSSS acknowledgement (Eq 10-7), and every EIFS on the timeline is that', () => {
    expect(ACK_TX_TIME_1M_DSSS_NS).toBe(304_000)
    expect(ERP_2G.eifsNs).toBe(ERP_2G.sifsNs + ACK_TX_TIME_1M_DSSS_NS + ERP_2G.difsNs)
    expect(ERP_2G.eifsNs).toBe(342_000)
    const sim = implRow('EIFS 的长度').sim
    expect(sim).toContain(`${ERP_2G.sifsNs / 1000} + ${ACK_TX_TIME_1M_DSSS_NS / 1000} + ${ERP_2G.difsNs / 1000} = ${ERP_2G.eifsNs / 1000} µs`)
    expect(sim).toContain(`确认帧 ${ACK_TX_TIME_1M_DSSS_NS / 1000} µs，即长前导码与物理层头 192 µs，加 14 字节 112 µs`)
    const eifs = ofType(recordsOf('pair', '2g', 7), 'IFS_START').filter((r) => r.kind === 'EIFS')
    expect([...new Set(eifs.map((r) => r.untilNs - r.t))]).toEqual([ERP_2G.eifsNs])
  })

  it('ACK timeout: 43 µs and 45 µs measured — the standard\'s, with the HE aRxPHYStartDelay of 24 µs', () => {
    const wait = (band: Band): number => {
      const rs = recordsOf('pair', band, 7)
      const sta = vid(band, 'sta-1')
      const to = ofType(rs, 'ACK_TIMEOUT').filter((r) => r.node === sta)[0]
      const end = ofType(rs, 'TX_END').filter((r) => r.node === sta && r.t <= to.t).pop()!
      return (to.t - end.t) / 1000
    }
    const sim = implRow('ACK 超时').sim
    expect(wait('2g')).toBe(43)
    expect(wait('5g')).toBe(49)
    expect(sim).toContain(`10 + 9 + 24 = ${wait('2g')} µs`)
    expect(sim).toContain(`16 + 9 + 24 = ${wait('5g')} µs`)
  })

  it('the band offset row names the three engine constants', () => {
    const sim = implRow('频段路损偏移').sim
    expect(LINK_EXTRA_LOSS_DB).toEqual({ '2g': -6.5, '5g': 0, '6g': 1.2 })
    expect(sim).toContain('2.4 GHz −6.5 dB')
    expect(sim).toContain('6 GHz +1.2 dB')
  })

  it('the 40 MHz cap and the Wi-Fi 5 station follow the standard', () => {
    const s = link2gScenario('wide', '2g')
    const [ap, sta] = s.nodes
    expect(negotiatedWidth(ap, sta, '2g')).toBe(40)
    expect(negotiatedWidth(ap, sta, '5g')).toBe(160)
    const vht = { ...sta, caps: { ...sta.caps, generation: 'vht' as const }, linkId: '2g' as const }
    expect(nodeLinks(vht, false)).toEqual(['5g'])
    expect(nodeLinks(sta, false)).toEqual(['2g'])
  })

  it('every scene runs DCF with EDCA off, so DIFS and not AIFS reaches the timeline', () => {
    for (const shape of ['pair', 'single', 'burst', 'wide'] as const) {
      for (const band of ['2g', '5g'] as const) {
        for (const n of link2gScenario(shape, band).nodes) expect(n.caps.features.edca, `${shape}/${band}/${n.id}`).toBe(false)
      }
    }
    const kinds = new Set(ofType(recordsOf('single', '2g', 7, 50), 'IFS_START').map((r) => r.kind))
    expect(kinds.has('DIFS')).toBe(true)
    expect(kinds.has('AIFS')).toBe(false)
  })

  it('the short slot is fixed, and the signal extension row\'s 6.0 µs is the data PPDU difference', () => {
    expect(ERP_2G.slotNs).toBe(9_000)
    const data = (band: Band) => ofType(recordsOf('single', band, 7, 50), 'TX_START')
      .find((r) => r.node === vid(band, 'sta-1') && r.frame.kind === 'data')!.frame.txTimeNs
    expect(implRow('SIFS、时隙与信号扩展').sim).toContain(`长 ${us(data('2g') - data('5g'))} µs`)
  })

  it('flipping the band flips the backoff stream, which is why no throughput here is one seed', () => {
    expect(virtualId('sta-1', '5g')).toBe('sta-1')
    expect(virtualId('sta-1', '2g')).toBe('sta-1#2g')
    const diffs = seeds(10).map((s) => throughputMbps('single', '2g', s, 50) - throughputMbps('single', '5g', s, 50))
    expect(diffs.some((d) => d > 0)).toBe(true)
    expect(diffs.some((d) => d < 0)).toBe(true)
  })
})

describe('link-2g · ③ every figure the labs print is the run', () => {
  /** The one exchange, segment by segment, as the timeline reports it. */
  function exchange(shape: 'single' | 'burst', band: Band) {
    const rs = recordsOf(shape, band, 7, 50)
    const sta = vid(band, 'sta-1')
    const ap = vid(band, 'ap')
    // a MAC reports a zero-length DIFS after a long idle; the real wait is the other value
    const difsLens = [...new Set(ofType(rs, 'IFS_START').filter((r) => r.node === sta && r.kind === 'DIFS')
      .map((r) => r.untilNs - r.t))].sort((a, b) => a - b)
    expect(difsLens, `${shape}/${band}`).toHaveLength(2)
    const dataTx = ofType(rs, 'TX_START').filter((r) => r.node === sta && r.frame.kind === 'data')
    const dataLens = [...new Set(dataTx.map((r) => r.frame.txTimeNs))]
    expect(dataLens, `${shape}/${band}`).toHaveLength(1)
    const respTx = ofType(rs, 'TX_START').filter((r) => r.node === ap && (r.frame.kind === 'ack' || r.frame.kind === 'ba'))
    const respLens = [...new Set(respTx.map((r) => r.frame.txTimeNs))]
    expect(respLens, `${shape}/${band}`).toHaveLength(1)
    const gaps = new Set<number>()
    for (const end of ofType(rs, 'TX_END').filter((r) => r.node === sta && r.frame.kind === 'data')) {
      const resp = respTx.find((r) => r.t >= end.t)
      if (resp) gaps.add(resp.t - end.t)
    }
    expect([...gaps], `${shape}/${band}`).toHaveLength(1)
    const difs = difsLens[1]; const data = dataLens[0]; const sifs = [...gaps][0]; const resp = respLens[0]
    // 2026-11-11 (W7a): the octets the heading prints are the A-MPDU's pre-EOF length APEP_LENGTH,
    // the length the PPDU's duration is computed from (§10.12.6); one MSDU is an S-MPDU (§10.12.7)
    expect(new Set(dataTx.map((r) => r.frame.apepBytes)).size, `${shape}/${band}`).toBe(1)
    return { difs, data, sifs, resp, total: difs + data + sifs + resp, bytes: dataTx[0].frame.apepBytes!, mcs: [...new Set(dataTx.map((r) => r.frame.mcs))] }
  }

  const checkTable = (t: Extract<Block, { kind: 'table' }>, shape: 'single' | 'burst') => {
    const a = exchange(shape, '5g'); const b = exchange(shape, '2g')
    const keys: (keyof typeof a)[] = ['difs', 'data', 'sifs', 'resp', 'total']
    expect(t.rows).toHaveLength(5)
    t.rows.forEach((row, i) => {
      const k = keys[i]
      expect(row[1], `${row[0]} 5 GHz`).toBe(`${us(a[k] as number)} µs`)
      expect(row[2], `${row[0]} 2.4 GHz`).toBe(`${us(b[k] as number)} µs`)
      const d = ((b[k] as number) - (a[k] as number)) / 1000
      expect(num(row[3]), `${row[0]} difference`).toBe(d)
    })
    expect(t.rows[1][0]).toContain(`${a.bytes.toLocaleString('en-US').replace(/,/g, ' ')} 字节`)
    return { a, b }
  }

  it('lab 1: one frame and one acknowledgement, four segments and the same total', () => {
    const l = lab('同一次交换的四段')
    const { a, b } = checkTable(tableOf(l, '一次零退避的交换'), 'single')
    expect(a.total).toBe(b.total)
    expect(a.mcs).toEqual([11]); expect(b.mcs).toEqual([11])
    expect(tableOf(l, '一次零退避的交换').heading).toContain(`MCS ${a.mcs[0]}`)
    expect(l.expect).toContain(`合计都是 ${us(a.total)} µs`)
    expect(l.expect).toContain(`MCS ${b.mcs[0]}`)
    expect(l.expect).toContain(`各短 ${us(a.sifs - b.sifs)} µs`)
  })

  it('lab 2: a twenty-MSDU A-MPDU and one BlockAck, the same total again', () => {
    const l = lab('启用聚合之后仍然相同')
    const { a, b } = checkTable(tableOf(l, 'A-MPDU'), 'burst')
    expect(a.total).toBe(b.total)
    expect(l.expect).toContain(`合计仍然都是 ${us(a.total)} µs`)
    expect(ofType(recordsOf('burst', '2g', 7, 50), 'TX_START').some((r) => r.frame.kind === 'ba')).toBe(true)
    const first = ofType(recordsOf('burst', '2g', 7, 50), 'TX_START')
      .find((r) => r.node === vid('2g', 'sta-1') && r.frame.kind === 'data')!
    expect(first.frame.ampdu?.msduIds.length, 'the MSDU count the heading prints').toBe(20)
    expect(tableOf(l, 'A-MPDU').heading).toContain(`${first.frame.ampdu!.msduIds.length} 个 MSDU`)
  })

  it('lab 3: the stairwell levels, and the one ray the band offset carries across the threshold', () => {
    const l = lab('楼梯间：EIFS 只在 2.4 GHz 上出现')
    const t = tableOf(l, '两台笔记本之间的电平')
    const table = buildLinkTable(link2gScenario('pair', '5g').nodes, link2gScenario('pair', '5g').walls)
    const between = table.get('sta-1')!.get('sta-2')!
    const up = table.get('sta-1')!.get('ap')!
    expect(table.get('sta-2')!.get('ap')).toBe(up)
    const off = -LINK_EXTRA_LOSS_DB['2g']
    expect(t.head[0]).toBe('路径')
    expect(t.heading).toContain(`${CCA_PD_DBM} dBm`.replace('-', '−'))
    const [, b5, b2] = t.rows[0]
    expect(num(b5)).toBe(Number(between.toFixed(2)))
    expect(b5).toContain(`低 ${(CCA_PD_DBM - between).toFixed(2)} dB`)
    expect(num(b2)).toBe(Number((between + off).toFixed(2)))
    expect(b2).toContain(`高 ${(between + off - CCA_PD_DBM).toFixed(2)} dB`)
    expect(between).toBeLessThan(CCA_PD_DBM)
    expect(between + off).toBeGreaterThan(CCA_PD_DBM)
    const [, u5, u2] = t.rows[1]
    expect(num(u5)).toBe(Number(up.toFixed(2)))
    expect(num(u2)).toBe(Number((up + off).toFixed(2)))
    // the quiz names the same level
    expect(link2g.quiz[1].explain).toContain(`${between.toFixed(2)} dBm`.replace('-', '−'))
  })

  it('lab 3: ten seeds, both bands: the means, the counts, and the eleven-fold', () => {
    const l = lab('楼梯间：EIFS 只在 2.4 GHz 上出现')
    const tally = (band: Band) => {
      let ok = 0; let coll = 0; let eifs = 0; let bits = 0
      const eifsLens = new Set<number>()
      const reasons = new Set<string>()
      for (const s of seeds(10)) {
        for (const r of recordsOf('pair', band, s)) {
          if (r.type === 'RX_OK' && r.node === vid(band, 'ap') && r.frame.kind === 'data') { ok += 1; bits += payloadOf(r) * 8 }
          else if (r.type === 'COLLISION') coll += 1
          else if (r.type === 'IFS_START' && r.kind === 'EIFS') { eifs += 1; eifsLens.add(r.untilNs - r.t) }
          else if (r.type === 'RX_FAIL') reasons.add(r.reason)
        }
      }
      return { ok, coll, eifs, mbps: bits / 10 / (RUN_MS / 1000) / 1e6, eifsLens: [...eifsLens], reasons: [...reasons] }
    }
    const five = tally('5g'); const two = tally('2g')
    const rows = tableOf(l, '十个种子').rows
    const row = (k: string) => rows.find((r) => r[0] === k)!
    const cnt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ')
    expect(row('吞吐均值')).toEqual(['吞吐均值', `${five.mbps.toFixed(3)} Mb/s`, `${two.mbps.toFixed(3)} Mb/s`])
    expect(row('路由器收到的帧')).toEqual(['路由器收到的帧', cnt(five.ok), cnt(two.ok)])
    expect(row('碰撞')).toEqual(['碰撞', cnt(five.coll), cnt(two.coll)])
    expect(row('EIFS 记录')).toEqual(['EIFS 记录', cnt(five.eifs), cnt(two.eifs)])
    expect(two.eifsLens).toEqual([ERP_2G.eifsNs])
    // the reasons the reader sees in the scenes the lab loads (seed 7, the scenes' own seed);
    // over all ten seeds 5 GHz also shows a few txDuringRx, which the lab does not claim about
    const reasons = (band: Band) => [...new Set(ofType(recordsOf('pair', band, 7), 'RX_FAIL').map((r) => r.reason))]
    expect(link2g.scenario().seed).toBe(7)
    // 2026-11-11 (W6): seed 7 on 5 GHz now also shows one txDuringRx, and the lab counts both
    const fails5 = ofType(recordsOf('pair', '5g', 7), 'RX_FAIL')
    expect(reasons('5g')).toEqual(['collision', 'txDuringRx'])
    expect(l.expect).toContain(`${fails5.length} 次接收失败里 ${fails5.filter((r) => r.reason === 'collision').length} 次是碰撞，${fails5.filter((r) => r.reason === 'txDuringRx').length} 次是收到一半时本机开始发送而放弃`)
    expect(reasons('2g')).toEqual(['lowSinr'])
    expect(two.reasons).toEqual(['lowSinr'])
    expect(l.expect).toContain(`每一条 EIFS 都是 ${ERP_2G.eifsNs / 1000} µs`)
    expect(l.expect).toContain(`${(two.ok / five.ok).toFixed(1)} 倍`)
    expect(l.expect).toContain(`碰撞从 ${five.coll} 次降到 ${two.coll} 次`)
    expect(l.meaning).toContain(`${ERP_2G.eifsNs / 1000} µs 是按 1 Mb/s 的 DSSS 确认帧照式 10-7 算出的`)
    // 「十一倍」 in why, the meaning and the quiz is this ratio, rounded (2026-11-11, after the W6 merge: 11.3)
    expect(Math.round(two.ok / five.ok)).toBe(11)
    for (const t of [link2g.why!, l.meaning, link2g.quiz[1].q]) expect(t).toContain('十一倍')
    expect(link2g.quiz[1].explain).toContain(`碰撞从 ${five.coll} 次降到 ${two.coll} 次`)
  }, 300_000)

  it('lab 4: the MCS table is the engine\'s rung chooser, cell by cell, and the widget sits at −75 dBm', () => {
    const l = lab('6.5 dB 值几级调制与编码方式')
    const rows = tableOf(l, '同一个 5 GHz 到达电平').rows
    const rung = (rssi: number, band: Band): number => mcsForRssi('he', rssi - LINK_EXTRA_LOSS_DB[band], undefined, 20)
    const cell = (m: number) => `MCS ${m} · ${mcsRateMbps('he', m)} Mb/s`
    for (const [lvl, c5, c2, d] of rows) {
      const rssi = num(lvl)
      expect(c5, `${lvl} 5 GHz`).toBe(cell(rung(rssi, '5g')))
      expect(c2, `${lvl} 2.4 GHz`).toBe(cell(rung(rssi, '2g')))
      expect(Number(d), `${lvl} rungs`).toBe(rung(rssi, '2g') - rung(rssi, '5g'))
    }
    const deltas = rows.slice(1).map((r) => Number(r[3]))
    expect(Math.min(...deltas)).toBe(2); expect(Math.max(...deltas)).toBe(3)
    expect(Number(rows[0][3])).toBe(0)
    const w = (l.blocks ?? []).find((b) => b.kind === 'widget') as Extract<Block, { kind: 'widget' }>
    expect(w.params).toEqual({ mode: 'he', snrDb: Number((-75 - NOISE_DBM).toFixed(1)) })
    expect(w.caption).toContain(`信噪比 ${(-75 - NOISE_DBM).toFixed(1)} dB`)
    // the desk row is the single-station scene's own rung on both bands
    for (const band of ['5g', '2g'] as const) {
      const mcs = new Set(ofType(recordsOf('single', band, 7, 50), 'TX_START')
        .filter((r) => r.node === vid(band, 'sta-1') && r.frame.kind === 'data').map((r) => r.frame.mcs))
      expect([...mcs], band).toEqual([rung(-46.7, band)])
    }
  })

  it('lab 5: the 40 MHz cap, cell by cell, and the 8.4 % it still loses over twenty seeds', () => {
    const l = lab('40 MHz 上限')
    const rows = tableOf(l, '两端都是 Wi-Fi 7').rows
    const row = (k: string) => rows.find((r) => r[0] === k)!
    const seg = (band: Band) => {
      const tx = ofType(recordsOf('wide', band, 7, 50), 'TX_START').filter((r) => r.node === vid(band, 'sta-1') && r.frame.kind === 'data')
      const starts = tx.map((r) => r.t)
      const gaps = starts.slice(1).map((t, i) => t - starts[i])
      return { data: tx[0].frame.txTimeNs, mcs: [...new Set(tx.map((r) => r.frame.mcs))], width: [...new Set(tx.map((r) => r.frame.widthMhz))], floor: Math.min(...gaps) }
    }
    const a = seg('5g'); const b = seg('2g')
    expect(a.mcs).toHaveLength(1); expect(b.mcs).toHaveLength(1)
    expect(row('协商到的信道带宽')).toEqual(['协商到的信道带宽', `${a.width[0]} MHz`, `${b.width[0]} MHz`])
    expect(row('选中的 MCS')).toEqual(['选中的 MCS', String(a.mcs[0]), String(b.mcs[0])])
    expect(row('同一帧的数据 PPDU')).toEqual(['同一帧的数据 PPDU', `${us(a.data)} µs`, `${us(b.data)} µs`])
    expect(row('一次交换')).toEqual(['一次交换', `${us(a.floor)} µs`, `${us(b.floor)} µs`])
    const five = mean(seeds(20).map((s) => throughputMbps('wide', '5g', s)))
    const two = mean(seeds(20).map((s) => throughputMbps('wide', '2g', s)))
    expect(row('吞吐均值')).toEqual(['吞吐均值', `${five.toFixed(3)} Mb/s`, `${two.toFixed(3)} Mb/s`])
    const loss = ((five - two) / five * 100).toFixed(1)
    expect(l.expect).toContain(`高出 ${loss} %`)
    expect(l.expect).toContain(`高 ${(noiseDbm(40) - noiseDbm(20)).toFixed(2)} dB`)
    expect(l.expect).toContain(`高 ${(noiseDbm(160) - noiseDbm(20)).toFixed(2)} dB`)
    expect(l.expect).toContain(`MCS ${b.mcs[0]}`)
    expect(l.expect).toContain(`MCS ${a.mcs[0]}`)
    // why: 「选中的 MCS 高出四级，吞吐仍低近一成」 (2026-11-11, after W6: 8.4 %)
    expect(link2g.why).toContain(`高出${['', '一', '两', '三', '四', '五'][b.mcs[0]! - a.mcs[0]!]}级`)
    expect(link2g.why).toContain('吞吐仍低近一成')
    expect(Number(loss)).toBeGreaterThan(5); expect(Number(loss)).toBeLessThan(10)
  }, 300_000)
})

describe('link-2g · the figures in why and the quiz', () => {
  it('why: the interval pairs, the extension, the cap and the threshold are the engine\'s and the standard\'s', () => {
    const w = link2g.why!
    expect(w).toContain(`从 ${OFDM_5G.sifsNs / 1000} 微秒变为 ${ERP_2G.sifsNs / 1000} 微秒`)
    expect(w).toContain(`从 ${OFDM_5G.difsNs / 1000} 微秒变为 ${ERP_2G.difsNs / 1000} 微秒`)
    expect(w).toContain(`多出 ${ERP_2G.signalExtNs / 1000} 微秒`)
    expect(w).toContain(`减少 ${-LINK_EXTRA_LOSS_DB['2g']} dB`)
    expect(w).toContain(`${CCA_PD_DBM} dBm`.replace('-', '−'))
  })

  it('quiz 1 adds up the lab 1 table', () => {
    const e = link2g.quiz[0].explain
    expect(e).toContain('34 + 146.4 + 16 + 28 = 224.4')
    expect(e).toContain('28 + 152.4 + 10 + 34 = 224.4')
    expect(34 + 146.4 + 16 + 28).toBeCloseTo(224.4, 6)
    expect(28 + 152.4 + 10 + 34).toBeCloseTo(224.4, 6)
    const t = tableOf(lab('同一次交换的四段'), '一次零退避的交换')
    expect(t.rows.map((r) => num(r[1]))).toEqual([34, 146.4, 16, 28, 224.4])
    expect(t.rows.map((r) => num(r[2]))).toEqual([28, 152.4, 10, 34, 224.4])
  })
})
