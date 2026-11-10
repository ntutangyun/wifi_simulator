/**
 * W7b (2026-11-11): EDCA/QoS against IEEE Std 802.11-2024.
 *
 *  - the AP contends with dot11QAPEDCATable (Annex C defaults: AIFSN 7/3/1/1, CWmax aCWmax /
 *    4·(aCWmin+1)−1 / aCWmin / (aCWmin+1)/2−1), a non-AP STA with Table 9-194 (§10.2.3.2);
 *  - every MSDU's AC follows from its own user priority by Table 10-1, and its TID is that UP;
 *  - a tampered driver's `allAsAc` re-marks the UP, so the TID agrees with the queue;
 *  - EDCA's QSRC rule (§10.23.2.2: increment while below dot11ShortRetryLimit, reset on the
 *    failure that finds it AT the limit) against DCF's (§10.3.3: CW reset when SSRC reaches it);
 *  - an internal collision moves the loser's QSRC/CW (§10.23.2.2 d)) and counts a retry on the
 *    MSDU involved (§10.23.2.12.1);
 *  - the 2.4 GHz BSS uses the long slot unless every member supports the short one (§11.1.3.2).
 */
import { describe, it, expect } from 'vitest'
import { makeBss, msdu } from './helpers'
import { EDCA_PARAMS, QAP_EDCA_PARAMS, aifsNs, ERP_2G, LONG_SLOT_NS, withLongSlot } from '../../src/engine/phy'
import { AC_FOR_UP, acForUp } from '../../src/model/frames'
import { Simulation, bssTimingFor } from '../../src/engine/simulation'
import { ScenarioSchema, TAMPER_PRESETS, defaultScenario, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000

describe('the AP uses dot11QAPEDCATable, a non-AP STA Table 9-194', () => {
  it('holds the Annex C defaults', () => {
    expect(QAP_EDCA_PARAMS.map((p) => [p.aifsn, p.cwMin, p.cwMax])).toEqual([[7, 15, 1023], [3, 15, 63], [1, 7, 15], [1, 3, 7]])
    expect(EDCA_PARAMS.map((p) => [p.aifsn, p.cwMin, p.cwMax])).toEqual([[7, 15, 1023], [3, 15, 1023], [2, 7, 15], [2, 3, 7]])
    // TXOP limits are Table 9-194's for both (dot11QAPEDCATableTXOPLimit refers to it)
    expect(QAP_EDCA_PARAMS.map((p) => p.txopLimitNs)).toEqual(EDCA_PARAMS.map((p) => p.txopLimitNs))
  })

  it('the AP waits AIFS[AC_VO] = SIFS + 1 slot, the station SIFS + 2 slots', () => {
    const b = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -55, 'ap>sta-1': -55 }, { edca: true })
    for (let i = 0; i < 3; i++) {
      b.enqueue(1_000_000, 'ap', msdu('ap', 'sta-1', 600, 3))
      b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 600, 3))
    }
    b.runUntil(30 * MS)
    const aifs = (node: string): number[] => b.recs('IFS_START', node)
      .filter((r) => r.kind === 'AIFS' && r.ac === 3 && r.untilNs > r.t).map((r) => r.untilNs - r.t)
    expect(new Set(aifs('ap'))).toEqual(new Set([aifsNs(1)]))
    expect(new Set(aifs('sta-1'))).toEqual(new Set([aifsNs(2)]))
  })

  it('the AP’s AC_BE window stops doubling at 63, the station’s at 1023', () => {
    const b = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -90, 'ap>sta-1': -90 }, { edca: true })
    for (let i = 0; i < 3; i++) {
      b.enqueue(1_000_000, 'ap', msdu('ap', 'sta-1', 600, 1))
      b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 600, 1))
    }
    b.runUntil(400 * MS)
    const maxCw = (node: string): number => Math.max(...b.recs('CW_CHANGE', node).filter((r) => r.ac === 1).map((r) => r.cw))
    expect(maxCw('ap')).toBe(63)
    expect(maxCw('sta-1')).toBe(1023)
  })
})

describe('a frame’s AC follows from its own UP (Table 10-1), and its TID is that UP', () => {
  it('Table 10-1', () => {
    expect([...AC_FOR_UP]).toEqual([1, 0, 0, 1, 2, 2, 3, 3])
    for (let up = 0; up < 8; up++) expect(acForUp(up)).toBe(AC_FOR_UP[up])
  })

  /** One AP and one station whose only stream is `profile`. */
  function one(profile: 'video' | 'voice' | 'backup', tamper?: NodeCfg['tamper']): Scenario {
    const sc = defaultScenario()
    const sta = { ...sc.nodes[1], profiles: [profile], ...(tamper ? { tamper } : {}) } as NodeCfg
    return { ...sc, nodes: [{ ...sc.nodes[0], profiles: ['idle'] }, sta] }
  }
  const tidsOf = (rs: TLRecord[], node: string): Set<number | undefined> => new Set(rs.flatMap((r) =>
    r.type === 'TX_START' && r.node === node && r.frame.kind === 'data' ? (r.frame.mpdus ?? []).map((h) => h.tid) : []))
  const acsOf = (rs: TLRecord[], node: string): Set<number | undefined> =>
    new Set(rs.flatMap((r) => (r.type === 'ENQUEUE' && r.node === node ? [r.ac] : [])))

  it('video (UP 5) → AC_VI, TID 5 on both directions; voice (UP 6) → AC_VO, TID 6; backup (UP 1) → AC_BK, TID 1', () => {
    for (const [profile, up, ac, node] of [['video', 5, 2, 'ap'], ['voice', 6, 3, 'sta-1'], ['backup', 1, 0, 'sta-1']] as const) {
      const rs = [...new Simulation(one(profile)).runUntil(300 * MS).records]
      expect(acsOf(rs, node), profile).toEqual(new Set([ac]))
      expect(tidsOf(rs, node), profile).toEqual(new Set([up]))
    }
  })

  it('a tampered driver that sends everything as AC_VO re-marks the UP, so the TID is 6', () => {
    const rs = [...new Simulation(one('backup', { ...TAMPER_PRESETS.greedy })).runUntil(300 * MS).records]
    expect(acsOf(rs, 'sta-1')).toEqual(new Set([3]))
    expect(tidsOf(rs, 'sta-1')).toEqual(new Set([6]))
  })
})

describe('QSRC at the retry limit: EDCA and DCF differ', () => {
  const seq = (edca: boolean): [number, number][] => {
    const b = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -90, 'ap>sta-1': -90 }, { edca })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 600, 1))
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 600, 1))
    b.runUntil(400 * MS)
    return b.recs('CW_CHANGE', 'sta-1').slice(0, 8).map((r) => [r.qsrc ?? -1, r.cw])
  }

  it('EDCA (§10.23.2.2): the 7th failure leaves QSRC 7 and CW at CWmax; the 8th resets both', () => {
    expect(seq(true)).toEqual([[1, 31], [2, 63], [3, 127], [4, 255], [5, 511], [6, 1023], [7, 1023], [0, 15]])
  })

  it('DCF (§10.3.3): CW is reset when SSRC reaches dot11ShortRetryLimit, on the 7th failure', () => {
    expect(seq(false).slice(0, 7)).toEqual([[1, 31], [2, 63], [3, 127], [4, 255], [5, 511], [6, 1023], [0, 15]])
  })
})

describe('internal collision (§10.23.2.2 d), §10.23.2.12.1)', () => {
  it('the losing EDCAF’s QSRC goes to 1 and its CW doubles; the MSDU involved counts a retry', () => {
    const b = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -55, 'ap>sta-1': -55 }, { edca: true })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 1400, 3))
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 1400, 0))
    b.runUntil(50 * MS)
    const ic = b.recs('INTERNAL_COLLISION', 'sta-1')
    expect(ic).toHaveLength(1)
    const cw = b.recs('CW_CHANGE', 'sta-1').find((r) => r.ac === 0 && r.t === ic[0].t)
    expect(cw).toMatchObject({ qsrc: 1, cw: 31 })
    expect(b.recs('RETRY', 'sta-1')[0]).toMatchObject({ ac: 0, retries: 1, qsrc: 1 })
  })
})

describe('slot time on 2.4 GHz (§11.1.3.2, §10.3.2.16, Table 18-5)', () => {
  it('long-slot timing moves the slot and every slot-derived interval', () => {
    const L = withLongSlot(ERP_2G)
    expect(L.slotNs).toBe(LONG_SLOT_NS)
    expect(L.difsNs).toBe(10_000 + 2 * 20_000)
    expect(L.ackTimeoutNs - ERP_2G.ackTimeoutNs).toBe(11_000)
    expect(L.eifsNs - ERP_2G.eifsNs).toBe(22_000)
    expect(L.sifsNs).toBe(ERP_2G.sifsNs)
  })

  /** Two stations on 2.4 GHz, DCF so the DIFS shows; the second one's generation is the variable. */
  function room(gen: 'nonht' | 'he', shortSlot?: boolean): Scenario {
    const sc = defaultScenario()
    const feats = { edca: false }
    const ap = { ...sc.nodes[0], caps: { generation: 'he' as const, features: feats }, profiles: ['idle' as const] }
    const a = { ...sc.nodes[1], linkId: '2g' as const, caps: { generation: 'he' as const, features: feats }, profiles: ['saturated' as const] }
    const b = { ...sc.nodes[1], id: 'sta-2', name: 'B', linkId: '2g' as const, caps: { generation: gen, features: feats }, profiles: ['saturated' as const], ...(shortSlot === undefined ? {} : { shortSlot }) }
    return { ...sc, nodes: [ap, a, b] as NodeCfg[] }
  }
  const slotOf = (sc: Scenario): Set<number> => {
    const rs = [...new Simulation(sc).runUntil(30 * MS).records]
    const out = new Set<number>()
    const last = new Map<string, number>()
    for (const r of rs) {
      if (r.type !== 'BACKOFF_DEC') { if (r.type === 'BACKOFF_DRAW' || r.type === 'BACKOFF_RESUME') last.delete(r.node); continue }
      const prev = last.get(r.node)
      if (prev !== undefined && r.t - prev < 25_000) out.add(r.t - prev)
      last.set(r.node, r.t)
    }
    return out
  }

  it('an 802.11g (ERP) station in the BSS: 20 µs slots; all HE: 9 µs; an ERP radio that says it supports short slot: 9 µs', () => {
    expect(slotOf(room('nonht'))).toEqual(new Set([20_000]))
    expect(slotOf(room('he'))).toEqual(new Set([9_000]))
    expect(slotOf(room('nonht', true))).toEqual(new Set([9_000]))
    expect(slotOf(room('he', false))).toEqual(new Set([20_000]))
    const nodes = ScenarioSchema.parse(room('nonht')).nodes
    expect(bssTimingFor('2g', nodes).difsNs).toBe(50_000)
    expect(bssTimingFor('5g', nodes).slotNs).toBe(9_000)
  })

  it('shortSlot off the 2.4 GHz link is refused: it would change nothing', () => {
    const sc = defaultScenario()
    const bad = { ...sc, nodes: sc.nodes.map((n) => (n.kind === 'sta' ? { ...n, shortSlot: false } : n)) }
    const r = ScenarioSchema.safeParse(bad)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.some((i) => i.message.includes('shortSlot'))).toBe(true)
    expect(ScenarioSchema.safeParse(room('nonht', true)).success).toBe(true)
  })
})
