/**
 * `@streams`, in the standard-first shape (2026-11-11).
 *
 * ① is what IEEE Std 802.11be-2024 says about spatial streams — 1 mandatory and 2–8 optional,
 * N_DBPS times N_SS, the EHT-LTF count of Table 36-43 and the receive set a transmitter must stay
 * inside; ② marks the engine against each; ③ is the lesson's five variants. Every figure the labs,
 * `why` and the quiz print is read back out of the lesson text and compared with the engine
 * (`PHY_MODES`, `toneRatio`, `txTimeModeNs`, `negotiatedNss`) or with a run.
 *
 * `streams` no longer has `limits`, so its old `until: 'mumimo'` promise left the ledger in
 * tests/course/limits.test.ts; lab 2's `meaning` points at multi-user MIMO instead, and the
 * last `it` here pins that `mumimo` is the lesson that comes later.
 */
import { describe, it, expect } from 'vitest'
import { streams, streamsNegotiationStack } from '../../src/course/tier2/streams'
import { widthScenario } from '../../src/course/wifiScenes'
import { MODULES, COURSE_ORDER } from '../../src/course/curriculum'
import { isStandardFirst, type Block, type Lab } from '../../src/course/lessonKit'
import { ZH_TERMS, gradedProseTexts, zhAkaViolations, zhTermFailure } from '../../src/course/readability'
import type { TLRecord } from '../../src/model/records'
import { negotiatedNss, nssOf } from '../../src/model/caps'
import { PHY_MODES, TGI_NS, TLTF_2X_NS, preambleNsFor, reqSinrDb, toneRatio, txTimeModeNs } from '../../src/engine/phy'
import { ppduLayout } from '../../src/model/frameFields'
import { lessonShapeSuite, ofType, runOf } from './kit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 30 * MS
const TRACE_NS = 200 * MS
/**
 * The 1530-octet MPDU. 2026-11-11 (W7a): an EHT PSDU is always an A-MPDU (§10.12.5), so it goes
 * out as an S-MPDU (§10.12.7) behind a 4-octet delimiter: APEP_LENGTH 1534 (§10.12.6) is what the
 * airtime is computed from.
 */
const MPDU = 1530
const OCTETS = MPDU + 4
/** Table 36-43: initial EHT-LTF symbols per total stream count. */
const LTF_FOR_NSS = [0, 1, 2, 4, 4, 6, 6, 8, 8]

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const bigData = (rs: TLRecord[]): Tx[] => ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'data' && r.frame.bytes > 1000)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
const us1 = (ns: number): string => (ns / US).toFixed(1)
const ltfUs = (TLTF_2X_NS + TGI_NS.base) / US

const lab = (heading: string): Lab => {
  const l = streams.labs!.find((x) => x.heading === heading)
  expect(l, `lab 「${heading}」`).toBeDefined()
  return l!
}
const tableOf = (l: Lab, heading: string): Extract<Block, { kind: 'table' }> => {
  const t = (l.blocks ?? []).find((b) => b.kind === 'table' && b.heading === heading)
  expect(t, `table 「${heading}」`).toBeDefined()
  return t as Extract<Block, { kind: 'table' }>
}
const implRow = (topic: string) => {
  const row = streams.implementation!.find((x) => x.topic === topic)
  expect(row, `implementation row 「${topic}」`).toBeDefined()
  return row!
}
const stdText = (): string => streams.standard!
  .map((b) => `${b.heading ?? ''} ${'text' in b ? b.text : ''} ${'items' in b ? b.items.join(' ') : ''}`).join(' ')
const linkNss = (v: number): number => {
  const sc = streams.variants![v].scenario()
  return negotiatedNss(sc.nodes.find((n) => n.id === 'ap')!, sc.nodes.find((n) => n.id === 'sta-1')!)
}

lessonShapeSuite(streams, { runNs: RUN_NS })

describe('streams · the lesson', () => {
  it('is in the standard-first shape, in M9, after `width`', () => {
    expect(isStandardFirst(streams)).toBe(true)
    expect(MODULES[streams.module].title).toBe('容量参数与速率控制')
    expect(streams.needs).toEqual(['width'])
    expect(streams.limits).toEqual([])
    expect(streams.observe).toEqual([])
    expect(streams.tryThis).toEqual([])
  })

  it('keeps the five variants, so the recorded hashes stay', () => {
    expect(streams.scenario()).toEqual(widthScenario(20, 1))
    expect(streams.variants!.map((v) => v.scenario())).toEqual([
      widthScenario(20, 1), widthScenario(20, 2), widthScenario(20, 4), widthScenario(20, 2, 4), widthScenario(160, 4),
    ])
    // each label that names a stream count names its own scene's
    for (const [i, v] of streams.variants!.entries()) {
      const m = /(\d+) 条流/.exec(v.label)
      if (m) expect(Number(m[1]), v.label).toBe(linkNss(i))
    }
    const mixed = streams.variants![3].scenario()
    expect(streams.variants![3].label).toBe(`路由器 ${nssOf(mixed.nodes[0])} · 笔记本 ${nssOf(mixed.nodes[1])}`)
    expect(mixed.nodes.map((n) => n.name)).toEqual(['Router', 'Laptop'])
  })

  it('cites each clause it teaches in ①, and keeps the simulator out of it', () => {
    const std = stdText()
    for (const c of ['§36.1.1', '§35.14.4.1', '§9.4.2.323.4', '§36.5', '式 36-122', '表 36-76', '§36.3.12.10', '表 36-43', '表 36-18', '§10.6.5.8', '式 36-49', '式 36-110']) {
      expect(std, c).toContain(c)
    }
    for (const sim of ['48 µs', '本仿真器']) expect(std, sim).not.toContain(sim)
  })

  it('marks what the engine does not do', () => {
    expect(implRow('EHT-LTF 的个数').kind).toBe('faithful') // 2026-11-11 (W6)
    expect(implRow('最多几条流').kind).toBe('absent')
    expect(implRow('MIMO 信道').kind).toBe('absent')
    expect(implRow('降低流数').kind).toBe('absent')
    expect(implRow('每符号比特数').kind).toBe('faithful')
  })

  it('brackets every official term at its first Chinese use', () => {
    const zh = gradedProseTexts(streams).join(' ')
    const failures: string[] = []
    for (const t of ZH_TERMS.filter((x) => !x.track || x.track === 'wifi')) {
      const why = zhTermFailure(zh, t)
      if (why) failures.push(why)
      failures.push(...zhAkaViolations(zh, t))
    }
    expect(failures).toEqual([])
  })
})

describe('streams · ① the standard’s numbers', () => {
  it('Table 36-43 as printed, in `why` and in ①', () => {
    expect(stdText()).toContain(`1 条流 ${LTF_FOR_NSS[1]} 个，2 条流 ${LTF_FOR_NSS[2]} 个，3 到 4 条流 ${LTF_FOR_NSS[4]} 个，5 到 6 条流 ${LTF_FOR_NSS[6]} 个，7 到 8 条流 ${LTF_FOR_NSS[8]} 个`)
    expect(streams.why).toContain(`分别需要 ${[1, 2, 4, 6, 8].map((n) => LTF_FOR_NSS[n]).join('、')} 个`)
    expect(stdText()).toContain(`每个 2× EHT-LTF 符号长 ${TLTF_2X_NS / US} µs，加 ${TGI_NS.base / US} µs 保护间隔`)
  })

  it('N_DBPS times N_SS: 2340, 4680, 9360 at MCS 13, 20 MHz', () => {
    const per = PHY_MODES.eht.ndbps[13]
    expect(stdText()).toContain(`13 是 ${per} 比特、${PHY_MODES.eht.mbps[13]} Mb/s（表 36-76），2 条流 ${2 * per} 比特，4 条流 ${4 * per} 比特`)
  })
})

describe('streams · ② says what the engine does, and the engine does it', () => {
  it('the link runs the smaller end’s count, for the whole run', () => {
    expect(linkNss(3)).toBe(2)
    expect(implRow('链路的流数').sim).toContain('两端中较小的那个')
  })

  it('the preamble grows with the streams as Table 36-43 says: 7.2 and 21.6 µs', () => {
    // 2026-11-11 (W6): the preamble carries N_EHT-LTF from Table 36-43.
    expect(implRow('EHT-LTF 的个数').kind).toBe('faithful')
    const extra = (nss: number) => ((LTF_FOR_NSS[nss] - LTF_FOR_NSS[1]) * ltfUs).toFixed(1)
    for (const nss of [2, 4]) {
      expect(((preambleNsFor('eht', TGI_NS.base, { nss }) - preambleNsFor('eht')) / US).toFixed(1)).toBe(extra(nss))
    }
    const sim = implRow('EHT-LTF 的个数').sim
    expect(sim).toContain(`每个 ${ltfUs.toFixed(1)} µs，2 条流的前导码比 1 条流长 ${extra(2)} µs，4 条流长 ${extra(4)} µs`)
    expect(streams.quiz[1].explain).toContain(`每个 2× EHT-LTF ${ltfUs.toFixed(1)} µs，多 3 个就是 ${extra(4)} µs`)
    expect(lab('一条、两条、四条流').meaning).toContain(`4 条流的前导码比 1 条流长 ${extra(4)} µs`)
  })

  it('the requirement takes no stream count, and the scenes cap at four', () => {
    // `reqSinrDb(mode, mcs)` has no stream argument: one SINR for every stream
    expect(reqSinrDb.length).toBe(2)
    expect(implRow('最多几条流').sim).toContain('1 到 4 条')
  })

  it('`mumimo` is the later lesson lab 2 points at', () => {
    expect(lab('两端支持的流数不同').meaning).toContain('多用户 MIMO')
    expect(COURSE_ORDER.indexOf('mumimo')).toBeGreaterThan(COURSE_ORDER.indexOf('streams'))
  })
})

describe('streams · ③ every figure the labs print is the run', () => {
  it('lab 1: one, two and four streams at 20 MHz', () => {
    const l = lab('一条、两条、四条流')
    const rows = tableOf(l, '1530 字节的帧，20 MHz').rows
    const data: number[] = []
    const pre: number[] = []
    ;[0, 1, 2].forEach((v, i) => {
      const rs = runOf(streams, v, RUN_NS)
      const d = bigData(rs)
      const nss = linkNss(v)
      const t = one(d.map((r) => r.frame.txTimeNs))
      expect(one(d.map((r) => r.frame.smpdu))).toBe(true)
      expect(one(d.map((r) => r.frame.apepBytes))).toBe(OCTETS)
      const lay = ppduLayout(d[0]!.frame)
      const seg = (k: string) => lay.find((s) => s.key === k)!
      expect(lay.reduce((a, s) => a + s.durNs, 0)).toBe(t)
      expect(rows[i]).toEqual([String(nss), String(one(d.map((r) => r.frame.mcs))),
        String(PHY_MODES.eht.ndbps[13] * nss), String(seg('data').symbols), `${us1(seg('preamble').durNs)} µs`, `${us1(t)} µs`])
      expect(seg('preamble').durNs).toBe(preambleNsFor('eht', TGI_NS.base, { nss }))
      expect(one(ofType(rs, 'TX_START').filter((r) => r.frame.kind === 'ack').map((r) => r.frame.txTimeNs))).toBe(28 * US)
      data.push(seg('data').durNs)
      pre.push(seg('preamble').durNs)
    })
    expect(l.expect).toContain(`三个变体都是 MCS ${rows[0][1]}`)
    expect(l.expect).toContain(`数据部分从 ${us1(data[0])} µs 减半到 ${us1(data[1])} µs，4 条流时是 ${us1(data[2])} µs，而不是 ${us1(data[1] / 2)} µs`)
    expect(l.expect).toContain(`前导码却从 ${us1(pre[0])} µs 增加到 ${us1(pre[1])} µs 与 ${us1(pre[2])} µs`)
    expect(streams.why).toContain(`1 条流 ${rows[0][5]}，2 条流 ${rows[1][5]}，4 条流 ${rows[2][5]}`)
    expect(streams.why).toContain(`数据部分从 ${us1(data[0])} µs 减半到 ${us1(data[1])} µs，再到 ${us1(data[2])} µs，不是 ${us1(data[1] / 2)} µs`)
  })

  it('lab 2: four against two is frame-for-frame two streams', () => {
    const l = lab('两端支持的流数不同')
    expect(l.variant).toBe(3)
    const trace = (v: number) => ofType(runOf(streams, v, TRACE_NS), 'TX_START').map((r) => [r.t, r.node, r.frame.kind, r.frame.txTimeNs])
    const mixed = trace(3)
    expect(mixed).toEqual(trace(1))
    const air = one(bigData(runOf(streams, 3, TRACE_NS)).map((r) => r.frame.txTimeNs))
    expect(l.expect).toContain(`这一帧是 ${us1(air)} µs`)
    expect(l.expect).toContain(`200 ms 内两次运行的每一个帧开始时刻、发送方、帧类型与时长都相同，共 ${mixed.length} 个帧`)
    // the figure: four, two, two, and 4680 bits a symbol
    const stack = streamsNegotiationStack()
    expect(stack.layers.map((x) => x.bytes)).toEqual([4, 2, linkNss(3)])
    expect(stack.layers[2].note).toContain(String(PHY_MODES.eht.ndbps[13] * linkNss(3)))
    expect(stack.total).toContain(`${us1(air)} µs`)
    expect(streams.quiz[0].explain).toContain(`这一帧是 ${us1(air)} µs`)
  })

  it('lab 3: the widest channel and the most streams is still one symbol', () => {
    const l = lab('最宽的信道加最多的流')
    const rows = tableOf(l, '160 MHz，1530 字节的帧').rows
    const d = bigData(runOf(streams, 4, RUN_NS))
    const t = one(d.map((r) => r.frame.txTimeNs))
    const single = txTimeModeNs('eht', OCTETS, 13, { widthMhz: 160, nss: 1 })
    const per = (nss: number) => PHY_MODES.eht.ndbps[13] * toneRatio('eht', 160) * nss
    expect(rows[0]).toEqual(['1（上一课）', String(per(1)), '1', `${us1(single)} µs`])
    const syms = ppduLayout(d[0]!.frame).find((s) => s.key === 'data')!.symbols
    expect(rows[1]).toEqual([String(linkNss(4)), String(per(4)), String(syms), `${us1(t)} µs`])
    // 2026-11-11 (W6): one symbol either way, and four streams pay three more EHT-LTFs
    expect(syms).toBe(1)
    expect(t).toBeGreaterThan(single)
    expect(l.expect).toContain(`仍是 MCS ${one(d.map((r) => r.frame.mcs))}，只有 1 个数据符号，一帧却是 ${us1(t)} µs，比上一课 160 MHz 单流的 ${us1(single)} µs 还长 ${us1(t - single)} µs`)
    expect(streams.why).toContain(`4 条流反而要 ${us1(t)} µs`)
  })
})
