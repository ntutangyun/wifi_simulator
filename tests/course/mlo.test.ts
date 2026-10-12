/**
 * Every empirical claim in "MLO — one queue, two radios", measured against the
 * lesson's own scene.
 *
 * Re-paced 2026-09-26: this half keeps the mechanism — one pile of frames, two
 * radios that contend on their own — the procedure by which a frame gets a link,
 * the worked example, and both branches of step 6's failure path. The price tag
 * (the three tables, the MCS, the neighbour's share and the two experiments)
 * moved to tests/course/mlo-gain.test.ts with the prose.
 *
 * The drop branch is still pinned against a SYNTHETIC copy of the scene, because
 * the lesson's own 300 ms never reaches a retry limit — and the lesson now says
 * so in as many words, so the reader is not sent looking for a DROP that is not
 * there.
 *
 * tests/course/lesson-claims.test.ts ("lesson 13 · MLO": both links carry data
 * and the traffic leans to 6 GHz) and tests/course/lessons.test.ts (the jump
 * targets, and the simultaneous RTS on the access point's lane) keep their own
 * pins; both read `l.scenario()` only, never prose.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Simulation } from '../../src/engine/simulation'
import { mlo, mloStack, LANE_FRAMES } from '../../src/course/tier2/mlo'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { AcQueues } from '../../src/engine/queues'
import { BAND_LABEL, nodeLinks, type LinkId } from '../../src/model/caps'
import { EDCA_PARAMS, MAX_AMPDU_MPDUS, MAX_PPDU_NS, SHORT_RETRY_LIMIT } from '../../src/engine/phy'
import type { Msdu } from '../../src/engine/traffic'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { ROOT, zhNumeral } from './coverage'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
/** The 300 ms every number in this lesson is measured over — and the window the jumps need. */
const RUN_NS = 300 * MS

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const data = (rs: TLRecord[], node: string): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && r.node === node && r.frame.kind === 'data')

/** One run of a modified copy of the scene. */
function view(mod: (sc: Scenario) => void = () => {}): { rs: TLRecord[] } {
  const sc = mlo.scenario()
  mod(sc)
  return { rs: [...new Simulation(sc).runUntil(RUN_NS).records] }
}

lessonShapeSuite(mlo, { runNs: RUN_NS })

describe('mlo · the lesson’s own scene', () => {
  it('is the scheduled-Wi-Fi module’s lesson on the mechanism, and names where its words come from', () => {
    expect(MODULES[mlo.module].title).toBe('被调度的 Wi-Fi 6/7')
    // protect-policies replaces txop-protect: the shared-air material moved there in the re-pacing
    expect(mlo.needs).toEqual(['retries-queues', 'protect-policies', 'width'])
    // "queue" is retries-queues' word, the shared air is protect-policies', the band is width's;
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

describe('mlo · the figure is drawn from the run', () => {
  it('the two boxes are the two lanes’ own frame counts, 67 against 240', () => {
    const rs = runOf(mlo, undefined, RUN_NS)
    const on5 = data(rs, 'sta-1').length, on6 = data(rs, 'sta-1#6g').length
    expect([on5, on6]).toEqual([LANE_FRAMES.g5, LANE_FRAMES.g6])
    const spec = mloStack()
    expect(spec.layers.map((l) => l.bytes)).toEqual([on5, on6])
    expect(spec.mode).toBe('sequential')
    // the closing figure is the sum, which is the 307 the next lesson prices
    expect(spec.total).toContain(String(on5 + on6))
    expect(on5 + on6).toBe(307)
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
  // lesson's own 300 ms never gets there — which the lesson says out loud — so the branch is
  // pinned against a SYNTHETIC copy of the scene with the laptop moved out of range. The
  // lesson's scenario is untouched and no number the lesson quotes is measured here.
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

// The one assertion that used to stand here searched `mlo.deeper` for the string "EMLSR" —
// a claim about how a sentence is written, and the course-wide companion to it in
// tests/course/lessons.test.ts has gone the same way (2026-09-25). What the simulator does
// with a single-radio multi-link station is pinned above, against the run.

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine and compares it with a literal written in THIS file: the
 * worked example has one `it` per row of the lesson's table, each named after the row — and each
 * one types that row's figures here rather than reading them. `expect(arrival.t / MS).toBe(4.424)`
 * is the row's instant on the test side; the row itself is in a title.
 *
 * `@mlo` hand-types 27 figures into its graded prose. What follows is the other half of each
 * assertion above, with no figure on this side: the stack figure's caption and total, the two
 * ceilings and the retry limit in the steps, all five rows of the table — including the **record
 * column**, which names a record type and a lane and is as checkable as the instants beside it —
 * the drop-branch note, both experiments, and the prose the graded walk never reads (`limits`,
 * with its two file-and-function citations).
 */
describe('mlo · every printed figure is read back out of the lesson', () => {
  const rs = runOf(mlo, undefined, RUN_NS)
  const on5 = data(rs, 'sta-1').length
  const on6 = data(rs, 'sta-1#6g').length
  const tableWith = (fragment: string): { heading: string; head: string[]; rows: string[][] } => {
    const b = mlo.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { heading: string; head: string[]; rows: string[][] }
  }
  /** 「30,718 字节」 → 30718; 「4.424 ms」 → 4.424. */
  const val = (s: string): number => Number(s.replace(/[^\d.]/g, ''))
  /** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const zhCount = (s: string): number | null => zhNumeral(s.replace(/两/g, '二'))
  /** Every 「file.ts 的 symbol」 in a passage, against the file that declares it. */
  const cite = (text: string, what: string): number => {
    const found = [...text.matchAll(/([a-z]+\.ts) 的 (\w+)/g)]
    for (const m of found) {
      const path = ['src/engine', 'src/model', 'src/course']
        .map((d) => resolve(ROOT, `${d}/${m[1]}`)).find(existsSync)
      expect(path, `${what}: ${m[1]} is not a file of this repository`).toBeDefined()
      expect(readFileSync(path!, 'utf8').includes(m[2]), `${what}: ${m[1]} declares ${m[2]}`)
        .toBe(true)
    }
    return found.length
  }
  /** The first batch of the 6 GHz lane, which most of the lesson's figures are about. */
  const batch = data(rs, 'sta-1#6g')[0]
  const ids = batch.frame.ampdu!.msduIds!

  it('the stack figure: both lanes, the total, and the fraction its caption states', () => {
    const blk = mlo.numbers === undefined
      ? undefined
      : (mlo.picture!.find((x) => x.kind === 'diagram') as
        { spec: { layers: { note?: string }[]; total?: string }; caption?: string } | undefined)
    expect(blk, 'the stack figure is gone from `picture`').toBeDefined()
    expect(blk!.spec, 'the figure the reader sees is `mloStack()`').toEqual(mloStack())
    // each layer's note counts that lane's frames
    const notes = blk!.spec.layers.map((l) => l.note ?? '')
    expect(notes, 'one note per lane').toHaveLength(2)
    same(notes[0].replace(' 帧', ''), on5, 'the 5 GHz lane’s frames')
    same(notes[1].replace(' 帧', ''), on6, 'the 6 GHz lane’s frames')
    // **Each column's own label names the band whose frames it counts.** The layer labels are
    // the lesson's only figure-side naming of the two bands, and `scripts/figure-planting.ts`
    // found both editable: a stack whose taller column said 「5 GHz」 would invert the whole
    // point of the figure. The band comes off the label and the lane comes off the engine.
    const LANE_OF: Record<string, number> = { 5: on5, 6: on6 }
    const labels = (blk!.spec as { layers: { label?: string }[] }).layers.map((l) => l.label ?? '')
    for (const [i, lab] of labels.entries()) {
      const band = /^([\d.]+) GHz/.exec(lab)
      expect(band, `layer ${i}’s label 「${lab}」 no longer names a band`).not.toBeNull()
      expect(LANE_OF[band![1]], `「${lab}」 is not one of this scene’s two bands`).toBeDefined()
      same(notes[i].replace(' 帧', ''), LANE_OF[band![1]], `the frames 「${lab}」 counts`)
    }
    // 「同一组待发的帧，300 ms 里共 307 个数据帧」: the window and the sum
    const t = /([\d\s]+) ms 里共 ([\d\s]+) 个数据帧/.exec(blk!.spec.total ?? '')
    expect(t, 'the figure’s closing line no longer states the window and the sum').not.toBeNull()
    same(t![1], RUN_NS / MS, 'the window the figure is drawn over')
    same(t![2], on5 + on6, 'and the frames in it')
    // 「每五帧里有四帧是从 6 GHz 那条链路出去的」: a fraction, and the only place it is stated
    const f = /每([一二三四五六七八九十]+)帧里有([一二三四五六七八九十]+)帧是从 6 GHz/.exec(blk!.caption ?? '')
    expect(f, 'the caption no longer states the share as a fraction').not.toBeNull()
    const [den, num] = [zhCount(f![1])!, zhCount(f![2])!]
    const share = on6 / (on5 + on6)
    expect(Math.abs(share / (num / den) - 1),
      `「每${f![1]}帧里有${f![2]}帧」 against the measured ${(100 * share).toFixed(1)} %`)
      .toBeLessThan(0.05)
    // and the caption's point: the lean is towards the empty band, not away from it
    expect(on6, '6 GHz carries more of them').toBeGreaterThan(on5)
  })

  it('the steps: the four queues, both claim ceilings, the batch and the retry limit', () => {
    const items = (mlo.numbers!.find((x) => x.kind === 'steps') as { items: string[] }).items
    expect(items, 'the lesson walks the procedure in exactly the steps this reads').toHaveLength(6)
    // step 1: 「每台设备只有一套四条接入类别（AC）队列」
    const q = /一套([一二三四五六七八九十]+)条接入类别/.exec(items[0])
    expect(q, 'step 1 no longer counts the queues a device has').not.toBeNull()
    expect(zhCount(q![1]), 'the access categories the engine queues per device')
      .toBe(EDCA_PARAMS.length)
    // step 4: 「64 帧、5.484 ms 的数据」, and 「这里领走的是 20 帧」
    const caps = /(\d+) 帧、([\d.]+) ms 的数据/.exec(items[3])
    expect(caps, 'step 4 no longer states the two ceilings it claims under').not.toBeNull()
    expect(Number(caps![1]), 'the aggregation ceiling').toBe(MAX_AMPDU_MPDUS)
    same(caps![2], MAX_PPDU_NS / MS, 'the longest transmission')
    const took = /这里领走的是 (\d+) 帧/.exec(items[3])
    expect(took, 'step 4 no longer says how many this scene claims').not.toBeNull()
    expect(Number(took![1]), 'the frames the first claim really took').toBe(ids.length)
    expect(Number(took![1]), 'which is under the ceiling, as the step says')
      .toBeLessThan(MAX_AMPDU_MPDUS)
    // step 6: 「加到 7 的那一帧被丢弃」
    const limit = /加到 (\d+) 的那一帧被丢弃/.exec(items[5])
    expect(limit, 'step 6 no longer states the retry limit').not.toBeNull()
    expect(Number(limit![1]), 'the engine’s retry limit').toBe(SHORT_RETRY_LIMIT)
  })

  it('the worked table: five rows, and the record column is read as a claim too', () => {
    const t = tableWith('MSDU 66')
    // the heading names the frame the whole table follows
    const h = /MSDU (\d+)/.exec(t.heading)
    expect(h, 'the heading no longer names the frame').not.toBeNull()
    const first = Number(h![1])
    expect(first, 'which is the first frame of the batch').toBe(ids[0])

    /** 「20 × DEQUEUE · sta-1#6g」 / 「ARRIVAL + ENQUEUE · sta-1」: count, types, lane. */
    const parseRecord = (cell: string): { n: number; types: string[]; node: string } => {
      const m = /^(?:(\d+) × )?([A-Z_]+(?: \+ [A-Z_]+)*) · (\S+)$/.exec(cell)
      expect(m, `「${cell}」 is not 「[n ×] TYPE[ + TYPE] · lane」`).not.toBeNull()
      return { n: m![1] ? Number(m![1]) : 1, types: m![2].split(' + '), node: m![3] }
    }
    const at = (ms: number) => Math.round(ms * MS)
    expect(t.rows, 'the table walks exactly the rows this reads').toHaveLength(5)
    for (const row of t.rows) {
      const when = at(val(row[0]))
      const { n, types, node } = parseRecord(row[1])
      for (const type of types) {
        const hit = rs.filter((r) => r.type === type && r.t === when
          && (r as { node?: string }).node === node)
        // A cell that states a count claims that number; a bare one claims that such a record is
        // there at all. Twenty frames arrive in the same nanosecond in this scene, so reading
        // 「ARRIVAL + ENQUEUE」 as 「one of them」 would be this file inventing a claim — the row
        // is about the one frame the table follows, and that frame is checked by id below.
        if (/^\d+ × /.test(row[1])) {
          expect(hit.length, `${row[0]}: ${type} records on ${node} at that instant`).toBe(n)
        } else {
          expect(hit.length, `${row[0]}: at least one ${type} on ${node} at that instant`)
            .toBeGreaterThan(0)
        }
      }
    }

    // row 1: 「第 66 帧，1500 字节，进入尽力而为队列，深度 1」
    const r1 = /第 (\d+) 帧，([\d\s]+) 字节，进入尽力而为队列，深度 (\d+)/.exec(t.rows[0][2])
    expect(r1, 'row 1 no longer describes the frame it enqueues').not.toBeNull()
    type Enqueue = Extract<TLRecord, { type: 'ENQUEUE' }>
    const enq = rs.find((r): r is Enqueue => r.type === 'ENQUEUE' && r.msduId === Number(r1![1]))!
    expect(Number(r1![1]), 'the frame the row names').toBe(first)
    same(r1![2], enq.bytes, 'its bytes')
    expect(Number(r1![3]), 'and the depth it leaves behind').toBe(enq.depth)
    expect(enq.ac, 'best effort is the queue it enters').toBe(1)
    // 「记在 5 GHz 那条泳道上，而送它出去的并不是这条泳道」
    expect(enq.node, 'the lane it is recorded on').toBe(parseRecord(t.rows[0][1]).node)
    expect(batch.node, 'and the lane that sends it, which is the other one')
      .not.toBe(enq.node)

    // row 2: 「一次领走 20 帧，编号 66–85，30,718 字节，用 MCS 的第 13 级发出」
    const r2 = /一次领走 (\d+) 帧，编号 (\d+)–(\d+)，([\d,\s]+) 字节，用调制与编码方式（modulation and coding scheme, MCS）的第 (\d+) 级发出/
      .exec(t.rows[1][2])
    expect(r2, 'row 2 no longer describes the claim').not.toBeNull()
    expect(Number(r2![1]), 'the frames claimed').toBe(ids.length)
    expect([Number(r2![2]), Number(r2![3])], 'the ids, first and last')
      .toEqual([ids[0], ids[ids.length - 1]])
    expect(ids, 'and they really are consecutive')
      .toEqual([...Array(Number(r2![1]))].map((_x, i) => Number(r2![2]) + i))
    same(r2![4], batch.frame.bytes, 'the bytes that went out')
    expect(Number(r2![5]), 'and the rung').toBe(batch.frame.mcs)

    // row 3: 「5 GHz 的倒数停在 2：它只是晚了 88 µs」
    const r3 = /倒数停在 (\d+)：它只是晚了 (\d+) µs/.exec(t.rows[2][2])
    expect(r3, 'row 3 no longer states the countdown and the gap').not.toBeNull()
    type Dec = Extract<TLRecord, { type: 'BACKOFF_DEC' }>
    const dec = rs.filter((r): r is Dec => r.type === 'BACKOFF_DEC' && r.node === 'sta-1'
      && r.t === at(val(t.rows[2][0])))
    expect(dec.map((r) => r.value), 'where the other lane’s countdown stood').toEqual([Number(r3![1])])
    same(r3![2], (at(val(t.rows[1][0])) - at(val(t.rows[0][0]))) / US,
      'the gap between the arrival and the claim')

    // row 4: 「32 字节，一次性回答这 20 帧」
    const r4 = /(\d+) 字节，一次性回答这 (\d+) 帧/.exec(t.rows[3][2])
    expect(r4, 'row 4 no longer describes the BlockAck').not.toBeNull()
    type Tx2 = Extract<TLRecord, { type: 'TX_START' }>
    const ba = rs.find((r): r is Tx2 => r.type === 'TX_START' && r.frame.kind === 'ba'
      && r.t === at(val(t.rows[3][0])))!
    same(r4![1], ba.frame.bytes, 'the BlockAck’s bytes')
    expect(Number(r4![2]), 'and the frames it answers').toBe(ids.length)

    // row 5: 「这 20 帧全部离开共享队列——而编号 66–85 中没有任何一个在 5 GHz 的发送里出现过」
    const r5 = /这 (\d+) 帧全部离开共享队列——而编号 (\d+)–(\d+) 中没有任何一个在 5 GHz 的发送里出现过/
      .exec(t.rows[4][2])
    expect(r5, 'row 5 no longer states the dequeue and the claim about the other lane').not.toBeNull()
    type Deq = Extract<TLRecord, { type: 'DEQUEUE' }>
    const deq = rs.filter((r): r is Deq => r.type === 'DEQUEUE' && r.t === at(val(t.rows[4][0]))
      && r.node === batch.node)
    expect(deq.map((r) => r.msduId).sort((a, b) => a - b), 'the ids that left the queue')
      .toEqual([...ids].sort((a, b) => a - b))
    expect(Number(r5![1]), 'and how many the row says there were').toBe(deq.length)
    const sent5 = new Set(data(rs, 'sta-1')
      .flatMap((r) => r.frame.ampdu?.msduIds ?? [r.frame.msduId!]))
    const range = [...Array(Number(r5![3]) - Number(r5![2]) + 1)].map((_x, i) => Number(r5![2]) + i)
    expect(range.filter((id) => sent5.has(id)), 'none of that range went out on the other lane')
      .toEqual([])
  })

  it('the drop-branch note, both observe lines and the experiment', () => {
    // 「这段 300 ms 里一次丢弃也没有发生 … 没有哪一帧被试到第七次」
    const note = (mlo.numbers! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const m = /这段 ([\d\s]+) ms 里一次丢弃也没有发生[^]*?没有哪一帧被试到第([一二三四五六七八九十]+)次/
      .exec(note)
    expect(m, 'the drop-branch note is gone, or its shape changed').not.toBeNull()
    same(m![1], RUN_NS / MS, 'the window the note is about')
    expect(zhCount(m![2]), 'the attempt that would drop a frame').toBe(SHORT_RETRY_LIMIT)
    expect(rs.filter((r) => r.type === 'DROP'), 'and nothing is dropped in it').toHaveLength(0)
    // 「七次分落在两条泳道上」: the synthetic scene the note says it is pinned against
    const synth = /同一帧被试满([一二三四五六七八九十]+)次、([一二三四五六七八九十]+)次分落在([两一二三四五六七八九十]+)条泳道上/
      .exec(note)
    expect(synth, 'the note no longer says what the synthetic scene shows').not.toBeNull()
    expect([zhCount(synth![1]), zhCount(synth![2])], 'the attempts, stated twice')
      .toEqual([SHORT_RETRY_LIMIT, SHORT_RETRY_LIMIT])
    expect(zhCount(synth![3]), 'and the lanes they fall across')
      .toBe(new Set(data(rs, 'sta-1').concat(data(rs, 'sta-1#6g')).map((r) => r.node)).size)
    // tryThis: 「6 GHz 上的第一批（20 帧，编号 66–85）」
    const e = /第一批（(\d+) 帧，编号 (\d+)–(\d+)）/.exec(mlo.tryThis![0])
    expect(e, 'the experiment no longer names the batch it sends the reader to').not.toBeNull()
    expect([Number(e![1]), Number(e![2]), Number(e![3])], 'the batch, as the experiment states it')
      .toEqual([ids.length, ids[0], ids[ids.length - 1]])
    // observe[0]: 「第二条标着 ·6G」, and that the lane really is named that way
    expect(mlo.observe![0], 'observe[0] no longer names the lane suffix').toContain('·6G')
    expect(batch.node.endsWith('#6g'), 'and the 6 GHz lane is the suffixed one').toBe(true)
  })

  it('`limits`: the skew it calls a product of one rule, and its two citations', () => {
    const ls = mlo.limits.map((l) => l.text).join('\n')
    // 「本课那 67 比 240 的偏斜」
    const m = /那 (\d+) 比 (\d+) 的偏斜/.exec(ls)
    expect(m, '`limits` no longer names the skew').not.toBeNull()
    expect([Number(m![1]), Number(m![2])], 'the two lanes’ frames, as the limit restates them')
      .toEqual([on5, on6])
    expect(Number(m![1]) + Number(m![2]), 'which is the figure’s own total').toBe(on5 + on6)
    // 「开了 MLO 的节点永远是 5 GHz 加 6 GHz 两条，不多不少」
    const two = /永远是 5 GHz 加 6 GHz ([一二三四五六七八九十两]+)条，不多不少/.exec(ls)
    expect(two, '`limits` no longer states how many links a node gets').not.toBeNull()
    expect(zhCount(two![1]), 'the links an MLO node has')
      .toBe(new Set([...data(rs, 'sta-1'), ...data(rs, 'sta-1#6g')].map((r) => r.node)).size)
    // and both citations are claims about this repository
    expect(cite(ls, '`limits`'), 'it cites two of them').toBe(2)
  })

  /**
   * **The twenty-seven sites `scripts/figure-planting.ts` found this file still not reading**,
   * on 2026-10-12. Most of them are a band — 「5 GHz」, 「6 GHz」, 「2.4 + 5 GHz」, 「·6G」 — and a
   * band read as a figure looks like a false positive until you ask what 「6 GHz 先数到零」
   * would mean if this scene's second link were 2.4 GHz. **It is a claim about the scene**, and
   * the scene answers it: `nodeLinks` gives this access point exactly the two links the lesson
   * names, and `BAND_LABEL` is where the course's own 「·6G」 comes from.
   *
   * The rest are the figures the walk-through prints a second time: the window the stack figure
   * is drawn over, the queue depth the first row states, and the batch's 66–85 restated in
   * `tryThis`.
   */
  it('every band this lesson names is a link this scene has, and the lane tag is the engine’s', () => {
    const everywhere = [
      mlo.why ?? '', ...(mlo.outcomes ?? []), ...mlo.observe, ...mlo.tryThis,
      ...(mlo.picture ?? []).map((b) => `${(b as { text?: string }).text ?? ''}
        ${(b as { caption?: string }).caption ?? ''} ${(b as { heading?: string }).heading ?? ''}`),
      ...(mlo.numbers ?? []).map((b) => JSON.stringify(b)),
      ...(mlo.deeper ?? []).map((b) => (b as { text?: string }).text ?? ''),
      ...mlo.limits.map((l) => l.text),
      ...(mlo.sources ?? []),
    ].join('\n')
    const bands = [...new Set([...everywhere.matchAll(/([\d.]+)(?: \+ [\d.]+)? GHz/g)]
      .flatMap((m) => m[0].replace(' GHz', '').split(' + ')))]
    expect(bands.length, 'the bands this lesson names').toBeGreaterThan(1)
    // every band named is a band the model has an id for, and the two this scene runs on are
    // exactly the ones `nodeLinks` gives an MLO access point
    const NAMED: Record<string, LinkId> = { '2.4': '2g', '5': '5g', '6': '6g' }
    for (const b of bands) {
      expect(NAMED[b], `「${b} GHz」 is not a band this model has an id for`).toBeDefined()
    }
    const sc = mlo.scenario()
    const ap = sc.nodes.find((n) => n.id === 'ap')!
    const mine = nodeLinks(ap, true)
    const running = new Set([...data(rs, 'sta-1'), ...data(rs, 'sta-1#6g')]
      .map((r) => (r.node.includes('#') ? r.node.split('#')[1] : '5g')))
    expect([...running].sort(), 'the links the laptop really sends on').toEqual([...mine].sort())
    // 「那个 ·6G 标记」: the tag the timeline draws is `BAND_LABEL`'s, not a string of this lesson's
    const tag = /那个 ·(\w+) 标记/.exec(mlo.picture!.map((b) => (b as { text?: string }).text ?? '').join('\n'))
    expect(tag, '`picture` no longer names the lane tag').not.toBeNull()
    expect(Object.values(BAND_LABEL), `「·${tag![1]}」 is not a band label this engine prints`)
      .toContain(tag![1])
    expect(BAND_LABEL['6g'], 'and it is the second link’s own label').toBe(tag![1])
  })

  it('the stack figure’s window, the first row’s queue depth, and `tryThis`’s batch', () => {
    // 「最初 300 ms 里，笔记本每五帧里有四帧是从 6 GHz 那条链路出去的」
    // the stack figure lives in `picture`, not in `numbers`
    const caption = (mlo.picture!.find((x) => x.kind === 'diagram') as { caption: string }).caption
    const [ms] = [Number(/最初 (\d+) ms 里/.exec(caption)![1])]
    expect(ms * MS, 'the window the stack figure is drawn over').toBe(RUN_NS)
    const [of_, over] = [/每([一二三四五六七八九十两]+)帧里有([一二三四五六七八九十两]+)帧/.exec(caption)!]
      .flatMap((m) => [zhCount(m[1])!, zhCount(m[2])!])
    expect(Math.round((on6 / (on5 + on6)) * of_), `${on6} of ${on5 + on6} frames`).toBe(over)

    // 「进入尽力而为队列，深度 1」: the depth the queue really reports when that frame arrives
    const row = tableWith('MSDU 66').rows[0]
    const [depth] = [Number(/深度 (\d+)/.exec(row[2])![1])]
    const enq = ofType(rs, 'ENQUEUE').find((r) => r.msduId === ids[0])
    expect(enq, 'the first frame of the batch is never enqueued').toBeDefined()
    expect(enq!.depth, 'the depth the record carries').toBe(depth)

    // `tryThis`: 「6 GHz 上的第一批（20 帧，编号 66–85），再去 5 GHz 的那些发送里找这 20 个编号」
    const t = mlo.tryThis.join('\n')
    const m = /第一批（(\d+) 帧，编号 (\d+)–(\d+)）.*?找这 (\d+) 个编号/.exec(t)
    expect(m, '`tryThis` no longer states the batch it asks the reader to open').not.toBeNull()
    expect(ids.length, 'the frames in that batch').toBe(Number(m![1]))
    expect([Math.min(...ids), Math.max(...ids)], 'the ids it spans')
      .toEqual([Number(m![2]), Number(m![3])])
    expect(Number(m![4]), 'and the same count restated').toBe(ids.length)
    // and the experiment's answer, on the lane the sentence names rather than one this file
    // picked: 「再去 5 GHz 的那些发送里找这 20 个编号中的任何一个」
    const where = /再去 ([\d.]+) GHz 的那些发送里/.exec(t)
    expect(where, '`tryThis` no longer says which lane to look on').not.toBeNull()
    const lane = where![1] === '6' ? 'sta-1#6g' : 'sta-1'
    const others = data(rs, lane).flatMap((r) => r.frame.ampdu?.msduIds ?? [])
    expect(ids.filter((i) => others.includes(i)),
      `ids that also went out on the ${where![1]} GHz lane`).toEqual([])
    expect(lane, 'and that lane is not the one the batch went out on').not.toBe(batch.node)
  })

  /**
   * **The band a sentence names is the lane that sentence is about**, and that is the half of
   * the band mentions this file can check per site: the walk-through's own cells and the first
   * `observe` line all say which lane a record sits on, and a record has a lane. The mentions
   * left over after this are of two kinds, and neither has a measurement here: the ones in
   * `deeper` and `limits` are about real hardware (「便宜的硬件上 2.4 + 5 GHz 很常见」, a
   * receiver's own noise floor), and the ones in the stack figure's axis labels are the figure's
   * two column names, which the test above checks as a SET. `scripts/figure-planting.ts` will
   * keep reporting those, correctly.
   */
  it('the walk-through and `observe` put every record on the lane they name', () => {
    const LANE: Record<string, string> = { '5': 'sta-1', '6': 'sta-1#6g' }
    const rows = tableWith('MSDU 66').rows
    // row 1: 「记在 5 GHz 那条泳道上」 — the arrival and the enqueue of the batch's first frame
    const [first] = [/记在 ([\d.]+) GHz 那条泳道上/.exec(rows[0][2])!]
    const enq = ofType(rs, 'ENQUEUE').find((r) => r.msduId === ids[0])!
    expect(enq.node, `row 1 says the enqueue is on the ${first[1]} GHz lane`).toBe(LANE[first[1]])
    // row 2: 「6 GHz 先数到零」 and 「同一瞬间，5 GHz 的倒数停在 2」
    const [won] = [/([\d.]+) GHz 先数到零/.exec(rows[1][2])!]
    expect(rows[1][1], `row 2 says the ${won[1]} GHz lane transmits`).toContain(LANE[won[1]])
    // row 3: 「同一瞬间，5 GHz 的倒数停在 2」 — a decrement on the other lane, same instant
    const held = /同一瞬间，([\d.]+) GHz 的倒数停在 (\d+)/.exec(rows[2][2])!
    const dec = ofType(rs, 'BACKOFF_DEC').filter((r) => r.node === LANE[held[1]] && r.t === batch.t)
    expect(dec.length, `row 3 says the ${held[1]} GHz lane counts down at that instant`).toBe(1)
    expect(dec[0].value, 'and the value it counts to').toBe(Number(held[2]))
    expect(rows[2][1], 'which is the record that row names').toContain(LANE[held[1]])
    // row 5: 「编号 66–85 中没有任何一个在 5 GHz 的发送里」
    const last = /编号 (\d+)–(\d+) 中没有任何一个在 ([\d.]+) GHz/.exec(rows[4][2])!
    expect([Number(last[1]), Number(last[2])], 'the ids row 5 restates')
      .toEqual([Math.min(...ids), Math.max(...ids)])
    const other = data(rs, LANE[last[3]]).flatMap((r) => r.frame.ampdu?.msduIds ?? [])
    expect(ids.filter((i) => other.includes(i)), `ids that also went out on ${last[3]} GHz`)
      .toEqual([])
    // `observe`: 「到达记录和入队记录却全都记在 5 GHz 那条泳道上」 — every one of them, not one
    const obs = /全都记在 ([\d.]+) GHz 那条泳道上/.exec(mlo.observe[0])!
    for (const r of [...ofType(rs, 'ARRIVAL'), ...ofType(rs, 'ENQUEUE')]) {
      if (!r.node.startsWith('sta-1')) continue
      expect(r.node, `a ${r.type} at ${r.t}`).toBe(LANE[obs[1]])
    }
    // `deeper`: 「一台 5 GHz 链路被邻居长时间占满的设备」 — and the neighbour of THIS scene
    // transmits on that band and no other, which is what makes the sentence about this scene
    const d = (mlo.deeper! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const neighbour = /一台 ([\d.]+) GHz 链路被邻居长时间占满/.exec(d)
    expect(neighbour, '`deeper` no longer names the band the neighbour fills').not.toBeNull()
    const theirs = new Set(data(rs, 'sta-2').map((r) => r.node))
    expect([...theirs], `the lanes the neighbour sends on`).toEqual(['sta-2'])
    expect(LANE[neighbour![1]], 'and that band is the laptop’s own first lane').toBe('sta-1')
  })
})
