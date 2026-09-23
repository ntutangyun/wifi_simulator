/**
 * Every empirical claim in "MLO — one queue, two radios", measured against the
 * lesson's own scene.
 *
 * The lesson was 233 words of assertion and is now the picture of a second
 * door: what the two links keep apart, what the shared pile buys its owner,
 * what it buys the neighbour it left behind, and what is left of it once the
 * neighbour has two radios too. The scenario builder is untouched and there
 * are still no variants, so the recorded timeline hash is the same run.
 *
 * The old lesson had no test file of its own. Its pins lived in
 * tests/course/lesson-claims.test.ts ("lesson 13 · MLO": both links carry data
 * and the traffic leans to 6 GHz) and tests/course/lessons.test.ts (the jump
 * targets, and the simultaneous RTS on the access point's lane); both files
 * are untouched and stay green — they read `l.scenario()` only, never prose.
 * There was never a `.body!` site to retire.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { mlo } from '../../src/course/tier2/mlo'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { AcQueues } from '../../src/engine/queues'
import { MAX_AMPDU_MPDUS, SHORT_RETRY_LIMIT } from '../../src/engine/phy'
import type { Msdu } from '../../src/engine/traffic'
import { lessonShapeSuite, runOf } from './kit'

const MS = 1_000_000
/** The 300 ms every number in this lesson is measured over — and the window the jumps need. */
const RUN_NS = 300 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')
const airMs = (xs: Tx[]): number => Math.round(xs.reduce((a, r) => a + r.frame.txTimeNs, 0) / MS * 10) / 10

/** One run of a modified copy of the scene, with the per-node counters the panel shows. */
function view(mod: (sc: Scenario) => void = () => {}): {
  rs: TLRecord[]
  air: (id: string) => number
  wait: (id: string) => number
} {
  const sc = mlo.scenario()
  mod(sc)
  const sim = new Simulation(sc)
  const rs = [...sim.runUntil(RUN_NS).records]
  const st = (id: string) => sim.view.nodes[id].stats
  return {
    rs,
    air: (id) => Math.round(st(id).airtimeNs / RUN_NS * 1000) / 10,
    wait: (id) => Math.round(st(id).txLatency.sumNs / st(id).txLatency.n / MS * 100) / 100,
  }
}

lessonShapeSuite(mlo, { proseMax: 1120, runNs: RUN_NS })

describe('mlo · the lesson’s own scene', () => {
  it('is the scheduled-Wi-Fi module’s last lesson, and names where its words come from', () => {
    expect(mlo.module).toBe(6)
    expect(mlo.needs).toEqual(['retries-queues', 'txop-protect', 'width'])
    // "queue" is retries-queues' word, the shared air is txop-protect's, the band is width's;
    // these three are this lesson's own.
    expect(mlo.terms!.map((t) => t.term)).toEqual(['link', 'MLO', 'MLD'])
  })

  it('keeps the scenario builder untouched: one room, three devices, no variants', () => {
    const sc = mlo.scenario()
    expect(mlo.variants).toBeUndefined()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', 'sta-1', 'sta-2'])
    // "the laptop … two radios"; "the neighbour has 5 GHz and nothing else"
    expect(sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo).toBe(true)
    expect(sc.nodes.find((n) => n.id === 'sta-2')!.caps.features.mlo).toBeFalsy()
    expect(sc.nodes.find((n) => n.id === 'sta-2')!.caps.generation).toBe('he')
  })

  it('"nobody at all is using 6 GHz": only the laptop and the access point are there', () => {
    const rs = runOf(mlo, undefined, RUN_NS)
    const on6 = new Set(rs.flatMap((r) => (r.type === 'TX_START' && r.node.includes('#6g') ? [r.node] : [])))
    expect([...on6].sort()).toEqual(['ap#6g', 'sta-1#6g'])
  })
})

describe('mlo · where the laptop’s work went', () => {
  const v = view()
  const on5 = data(v.rs, 'sta-1'), on6 = data(v.rs, 'sta-1#6g')

  it('the first table is that run: 67 frames and 53.9 ms on 5 GHz, 240 and 249.6 ms on 6 GHz', () => {
    expect([on5.length, on6.length]).toEqual([67, 240])
    expect([airMs(on5), airMs(on6)]).toEqual([53.9, 249.6])
    // the "Share of that band's clock" column
    expect([v.air('sta-1'), v.air('sta-1#6g')]).toEqual([18.3, 84.2])
  })

  it('"not the faster radio": both links run at MCS 13 and 172.1 Mb/s', () => {
    for (const r of [...on5, ...on6]) {
      expect(r.frame.mcs).toBe(13)
      expect(r.frame.mbps).toBe(172.1)
    }
  })

  it('"four of every five" frames leave by the quiet door, taking "almost five times" the air', () => {
    expect(Math.round(on6.length / (on5.length + on6.length) * 10) / 10).toBe(0.8)
    expect(Math.round(airMs(on6) / airMs(on5) * 10) / 10).toBe(4.6)
  })

  it('the neighbour holds 5 GHz for 69.9% of the clock, at 2.58 ms of mean wait', () => {
    expect(data(v.rs, 'sta-2').length).toBe(185)
    expect(v.air('sta-2')).toBe(69.9)
    expect(v.wait('sta-2')).toBe(2.58)
  })

  it('the laptop’s own mean waits are the 1.29 and 1.54 ms of the second table', () => {
    expect([v.wait('sta-1'), v.wait('sta-1#6g')]).toEqual([1.29, 1.54])
  })
})

describe('mlo · the two experiments', () => {
  const off = view((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.caps.features.mlo = false })
  const both = view((sc) => {
    const n = sc.nodes.find((x) => x.id === 'sta-2')!
    n.caps.generation = 'eht'
    n.caps.features.mlo = true
  })

  it('MLO off: one lane, 116 frames instead of 307, and the wait more than doubles', () => {
    expect(new Set(data(off.rs, 'sta-1').map((r) => r.node))).toEqual(new Set(['sta-1']))
    expect(data(off.rs, 'sta-1#6g')).toHaveLength(0)
    expect(data(off.rs, 'sta-1').length).toBe(116)
    expect(off.wait('sta-1')).toBe(3.25)
    expect(3.25).toBeGreaterThan(2 * 1.54)
  })

  it('"the neighbour does not gain": it drops from 185 frames to 116, and waits 4.18 ms', () => {
    expect(data(off.rs, 'sta-2').length).toBe(116)
    expect(off.wait('sta-2')).toBe(4.18)
  })

  it('give the neighbour two radios and the lean vanishes: 122 against 136, 258 in all', () => {
    const l5 = data(both.rs, 'sta-1').length, l6 = data(both.rs, 'sta-1#6g').length
    expect([l5, l6]).toEqual([122, 136])
    expect(l5 + l6).toBe(258)
    // the third table's other column
    expect([data(both.rs, 'sta-2').length, data(both.rs, 'sta-2#6g').length]).toEqual([132, 106])
  })
})

describe('mlo · the procedure, against the engine that runs it', () => {
  const v = view()

  it('step 1 — the frame is queued once, on the device’s first lane: no ARRIVAL or ENQUEUE is ever logged on the 6 GHz lane', () => {
    // src/engine/simulation.ts: one AcQueues per PHYSICAL node, handed to the MAC of
    // every link; traffic is enqueued through primaryMac(), and the record is emitted
    // against primaryVid() — the 5 GHz lane — whichever link later claims the frame.
    for (const t of ['ARRIVAL', 'ENQUEUE'] as const) {
      const lanes = v.rs.flatMap((r) => (r.type === t && r.node.startsWith('sta-1') ? [r.node] : []))
      expect(lanes.length, t).toBeGreaterThan(0)
      expect(new Set(lanes), t).toEqual(new Set(['sta-1']))
    }
  })

  it('step 2 — both links start counting on the same access category: each lane draws its own backoff', () => {
    type Draw = Extract<TLRecord, { type: 'BACKOFF_DRAW' }>
    const draws = (node: string) =>
      v.rs.filter((r): r is Draw => r.type === 'BACKOFF_DRAW' && r.node === node)
    expect(draws('sta-1').length).toBeGreaterThan(0)
    expect(draws('sta-1#6g').length).toBeGreaterThan(0)
    // "its own contention window": each lane's draw is against its own CW, never a shared one
    for (const r of [...draws('sta-1'), ...draws('sta-1#6g')]) expect(r.value).toBeLessThanOrEqual(r.cw!)
  })

  it('steps 4 and 6 — the engine’s constants are 64 frames per claim and a retry limit of 7', () => {
    expect(MAX_AMPDU_MPDUS).toBe(64)
    expect(SHORT_RETRY_LIMIT).toBe(7)
    for (const r of [...data(v.rs, 'sta-1'), ...data(v.rs, 'sta-1#6g')]) {
      expect(r.frame.ampdu?.mpduCount ?? 1).toBeLessThanOrEqual(MAX_AMPDU_MPDUS)
    }
  })

  it('step 4 — claiming removes: no MSDU of the laptop is ever carried by both of its lanes', () => {
    const lanes = new Map<number, Set<string>>()
    for (const r of [...data(v.rs, 'sta-1'), ...data(v.rs, 'sta-1#6g')]) {
      for (const id of r.frame.ampdu?.msduIds ?? [r.frame.msduId!]) {
        const s = lanes.get(id) ?? new Set<string>()
        s.add(r.node)
        lanes.set(id, s)
      }
    }
    expect(lanes.size).toBeGreaterThan(300)
    expect([...lanes.values()].filter((s) => s.size > 1)).toEqual([])
  })

  it('step 4 — the claim is a queue operation, not a chooser: AcQueues.claim takes the head’s frames away', () => {
    const q = new AcQueues()
    const msdu = (id: number): Msdu => ({ id, bytes: 1500, ac: 1, dst: 'ap', src: 'sta-1', bornNs: 0 })
    for (let i = 1; i <= 5; i++) q.enqueue(1, msdu(i))
    const claimed = q.claim(1, 'ap', MAX_AMPDU_MPDUS, () => true)
    expect(claimed.map((m) => m.id)).toEqual([1, 2, 3, 4, 5])
    expect(q.depth(1)).toBe(0) // the other link can no longer see them
  })

  it('step 5 — the sequence counter lives with the shared queue, one per receiver and access category', () => {
    const q = new AcQueues()
    expect([q.nextSeq('ap', 1), q.nextSeq('ap', 1), q.nextSeq('ap', 1)]).toEqual([0, 1, 2])
    expect(q.nextSeq('ap', 2)).toBe(0) // a different access category, its own counter
    // and in the run: the laptop's two lanes never hand the same number to two different bursts
    const seqs = [...data(v.rs, 'sta-1'), ...data(v.rs, 'sta-1#6g')]
      .filter((r) => r.frame.ac === 1).map((r) => r.frame.seqNo)
    expect(new Set(seqs).size).toBe(seqs.length)
  })

  it('step 6 — a failed set goes back to the FRONT of the same shared queue, so either link may take it', () => {
    const q = new AcQueues()
    const msdu = (id: number): Msdu => ({ id, bytes: 1500, ac: 1, dst: 'ap', src: 'sta-1', bornNs: 0 })
    q.enqueue(1, msdu(9))
    q.restore(1, [msdu(7), msdu(8)])
    expect(q.peek(1).map((m) => m.id)).toEqual([7, 8, 9])
  })
})

describe('mlo · step 6’s other branch, which this scene never reaches', () => {
  // `failMsdus` (src/engine/mac.ts) restores a failed set to the queue head only while its
  // retry count is under SHORT_RETRY_LIMIT; at the limit the frame is dropped instead. The
  // lesson's own 300 ms never gets there, so the branch is pinned against a SYNTHETIC copy
  // of the scene with the laptop moved out of range. The lesson's scenario is untouched and
  // no number the lesson quotes is measured here.
  const far = view((sc) => { sc.nodes.find((n) => n.id === 'sta-1')!.pos = { x: 200, y: 200, z: 1 } })
  const of = <T extends TLRecord['type']>(rs: TLRecord[], t: T) =>
    rs.filter((r): r is Extract<TLRecord, { type: T }> => r.type === t)

  it('the lesson’s own run reaches no retry limit at all — which is why this copy exists', () => {
    expect(of(view().rs, 'DROP')).toHaveLength(0)
  })

  it('under the limit the set goes back to the shared queue: MSDU 1 is attempted 7 times, on both lanes', () => {
    const attempts = [...data(far.rs, 'sta-1'), ...data(far.rs, 'sta-1#6g')]
      .filter((r) => (r.frame.ampdu?.msduIds ?? [r.frame.msduId!]).includes(1))
    expect(attempts).toHaveLength(SHORT_RETRY_LIMIT)
    // and "not necessarily the one that failed": the retries alternate between the links
    expect(new Set(attempts.map((r) => r.node))).toEqual(new Set(['sta-1', 'sta-1#6g']))
    expect(of(far.rs, 'RETRY').filter((r) => r.msduId === 1).map((r) => r.retries))
      .toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('at the limit it is dropped, not restored: DROP with reason retryLimit, then its DEQUEUE', () => {
    const drops = of(far.rs, 'DROP').filter((r) => r.node.startsWith('sta-1'))
    expect(drops.length).toBeGreaterThan(0)
    expect(new Set(drops.map((r) => r.reason))).toEqual(new Set(['retryLimit']))
    // every drop is followed by the frame leaving the shared queue on the same lane
    for (const d of drops) {
      const gone = of(far.rs, 'DEQUEUE').find((r) => r.msduId === d.msduId && r.node === d.node && r.t === d.t)
      expect(gone, `msdu ${d.msduId}`).toBeDefined()
    }
    // the first of them is MSDU 1, dropped on the 5 GHz lane after its seventh attempt
    expect([drops[0].msduId, drops[0].node]).toEqual([1, 'sta-1'])
  })
})

describe('mlo · the worked example: MSDU 66 through those steps', () => {
  const rs = runOf(mlo, undefined, RUN_NS)

  it('row 1 — 4.424 ms, ARRIVAL + ENQUEUE on lane sta-1: frame 66, 1500 bytes, best effort, depth 1', () => {
    type Arrival = Extract<TLRecord, { type: 'ARRIVAL' }>
    type Enqueue = Extract<TLRecord, { type: 'ENQUEUE' }>
    const arrival = rs.find((r): r is Arrival => r.type === 'ARRIVAL' && r.msduId === 66)!
    const enqueue = rs.find((r): r is Enqueue => r.type === 'ENQUEUE' && r.msduId === 66)!
    expect([arrival.node, enqueue.node]).toEqual(['sta-1', 'sta-1'])
    expect(arrival.t / MS).toBe(4.424)
    expect([enqueue.bytes, enqueue.depth, enqueue.ac]).toEqual([1500, 1, 1])
  })

  it('row 2 — 4.512 ms, TX_START on lane sta-1#6g: 20 frames, ids 66–85, 30,718 bytes at MCS 13', () => {
    const tx = data(rs, 'sta-1#6g')[0]
    expect(tx.t / MS).toBe(4.512)
    expect(tx.frame.ampdu!.msduIds).toEqual([...Array(20)].map((_, i) => 66 + i))
    expect([tx.frame.bytes, tx.frame.mcs]).toEqual([30_718, 13])
  })

  it('row 3 — the 5 GHz countdown stands at 2 that same instant, 88 µs behind', () => {
    type Dec = Extract<TLRecord, { type: 'BACKOFF_DEC' }>
    const dec = rs.filter((r): r is Dec => r.type === 'BACKOFF_DEC' && r.node === 'sta-1' && r.t === 4_512_000)
    expect(dec.map((r) => r.value)).toEqual([2])
    expect((4_512_000 - 4_424_000) / 1000).toBe(88)
  })

  it('row 4 — 6.0176 ms, the access point answers all 20 with one BlockAck of 32 bytes', () => {
    const ba = rs.find((r): r is Tx => r.type === 'TX_START' && r.node === 'ap#6g' && r.frame.kind === 'ba')!
    expect(ba.t / MS).toBe(6.0176)
    expect(ba.frame.bytes).toBe(32)
  })

  it('row 5 — 6.0496 ms, 20 DEQUEUEs on the sending lane, and no id of 66–85 on 5 GHz', () => {
    type Deq = Extract<TLRecord, { type: 'DEQUEUE' }>
    const deq = rs.filter((r): r is Deq => r.type === 'DEQUEUE' && r.t === 6_049_600 && r.node === 'sta-1#6g')
    expect(deq.map((r) => r.msduId).sort((a, b) => a - b))
      .toEqual([...Array(20)].map((_, i) => 66 + i))
    const on5 = new Set(data(rs, 'sta-1').flatMap((r) => r.frame.ampdu?.msduIds ?? [r.frame.msduId!]))
    expect([...Array(20)].map((_, i) => 66 + i).filter((id) => on5.has(id))).toEqual([])
  })
})

describe('mlo · the depth and the provenance', () => {
  it('"Going deeper" still names the single-radio form the standard also allows', () => {
    // pinned because tests/course/lessons.test.ts asserts the course as a whole says so
    expect(JSON.stringify(mlo.deeper)).toMatch(/EMLSR/)
  })
})
