import { describe, it, expect } from 'vitest'
import { LESSONS, MODULES } from '../../src/course/lessons'
import { CHARS_PER_MINUTE, COURSE_ORDER, OBSERVE_MINUTES, TIERS, TRY_MINUTES, lessonBlocks, lessonChars, lessonMinutes, trackHeadings, trackOf, type LessonTrack } from '../../src/course/curriculum'
import { diagramTexts, layoutDiagram, type DiagramSpec } from '../../src/course/diagram'
import { ScenarioSchema } from '../../src/model/scenario'
import { Simulation } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { widthOf } from '../../src/model/caps'
import { CCA_PD_DBM, sinrThreshDb } from '../../src/engine/phy'
import type { TLRecord } from '../../src/model/records'
import { recordsToSpans } from '../../src/ui/laneLayout'

const MS = 1_000_000

function recordsFor(sc: ReturnType<(typeof LESSONS)[0]['scenario']>, ms: number): TLRecord[] {
  const sim = new Simulation(sc)
  const out: TLRecord[] = []
  for (let t = 50 * MS; t <= ms * MS; t += 50 * MS) out.push(...sim.runUntil(t).records)
  return out
}

describe('course structure', () => {
  it('has unique lesson ids and valid module indices', () => {
    const ids = new Set(LESSONS.map((l) => l.id))
    expect(ids.size).toBe(LESSONS.length)
    for (const l of LESSONS) {
      expect(l.module).toBeGreaterThanOrEqual(0)
      expect(l.module).toBeLessThan(MODULES.length)
      expect(l.quiz.length).toBeGreaterThan(0)
      for (const q of l.quiz) {
        expect(q.answer).toBeGreaterThanOrEqual(0)
        expect(q.answer).toBeLessThan(q.options.length)
      }
      expect(l.observe.length).toBeGreaterThan(0)
      expect(lessonBlocks(l).length).toBeGreaterThan(0)
    }
  })

  it('every lesson (and variant) scenario passes the schema', () => {
    for (const l of LESSONS) {
      expect(() => ScenarioSchema.parse(l.scenario()), l.id).not.toThrow()
      for (const v of l.variants ?? []) {
        expect(() => ScenarioSchema.parse(v.scenario()), `${l.id} variant`).not.toThrow()
      }
    }
  })
})

describe('jump targets occur in their lesson simulations', () => {
  /** lessons whose every jump target must be found within the given sim time */
  const CASES: { id: string; ms: number; useVariant?: number }[] = [
    { id: 'airtime', ms: 100 },
    { id: 'ifs', ms: 100 },
    { id: 'backoff', ms: 300 },
    { id: 'nav', ms: 200 },
    { id: 'anomaly', ms: 200 },
    { id: 'ampdu', ms: 200 },
    { id: 'txop', ms: 300 },
    { id: 'txop-protect', ms: 300 },
    { id: 'ofdma-dl', ms: 300 },
    { id: 'ofdma-ul', ms: 300 },
    { id: 'mlo', ms: 300 },
  ]

  for (const c of CASES) {
    it(`${c.id}: all jump targets found`, () => {
      const lesson = LESSONS.find((l) => l.id === c.id)!
      const records = recordsFor(lesson.scenario(), c.ms)
      for (const j of lesson.jumps) {
        expect(records.some(j.find), `${c.id} → ${j.label}`).toBe(true)
      }
    })
  }

  it('hidden: collisions in base scenario, RTS in the protected variant', () => {
    const lesson = LESSONS.find((l) => l.id === 'hidden')!
    const base = recordsFor(lesson.scenario(), 300)
    expect(base.some((r) => r.type === 'COLLISION')).toBe(true)
    const rts = recordsFor(lesson.variants![0].scenario(), 300)
    expect(rts.some((r) => r.type === 'TX_START' && r.frame.kind === 'rts')).toBe(true)
  })

  it('txop-protect: boundary protection cuts collisions and drops versus the single-protection variant', () => {
    const lesson = LESSONS.find((l) => l.id === 'txop-protect')!
    const prot = recordsFor(lesson.scenario(), 300)
    const single = recordsFor(lesson.variants![0].scenario(), 300)
    const count = (recs: TLRecord[], type: TLRecord['type']) => recs.filter((r) => r.type === type).length
    // Both variants protect the first exchange (the lesson's RTS threshold is 500 B, below the
    // 1500-byte frames), so what boundary protection adds is reach, not the RTS itself: it
    // roughly halves the collisions and trebles the deliveries.
    expect(count(single, 'COLLISION')).toBeGreaterThan(2 * count(prot, 'COLLISION'))
    expect(count(prot, 'DROP')).toBeLessThan(count(single, 'DROP'))
    expect(count(single, 'DROP')).toBeGreaterThan(0)
    const delivered = (recs: TLRecord[]) =>
      recs.filter((r) => r.type === 'RX_OK' && r.node === 'ap' && r.frame.kind === 'data').length
    expect(delivered(prot)).toBeGreaterThan(2.5 * delivered(single))
    // the AP relays every CF-End a station sends. A CF-End near the tail of
    // the 300 ms window has its AP relay land microseconds after the cutoff
    // (frame lengths now vary slightly with rate adaptation), so this specific
    // check runs a hair longer to avoid counting a truncated last relay as a
    // dropped one.
    const protForCf = recordsFor(lesson.scenario(), 350)
    const cf = protForCf.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.frame.kind === 'cfend')
    expect(cf.filter((r) => r.node === 'ap').length).toBe(cf.filter((r) => r.node !== 'ap').length)
    // the multiple-protection variant puts the TXOP remainder on data frames
    const multi = recordsFor(lesson.variants![1].scenario(), 100)
    expect(multi.some((r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.durationFieldNs > 500_000)).toBe(true)
  })

  it('hidden: the stations are genuinely hidden from each other', () => {
    const lesson = LESSONS.find((l) => l.id === 'hidden')!
    const base = recordsFor(lesson.scenario(), 300)
    // Neither station ever detects the other's transmissions (the lesson's premise)…
    const hears = (rx: string, tx: string) =>
      base.some((r) => r.type === 'RX_START' && r.node === rx && r.from === tx)
    expect(hears('sta-1', 'sta-2'), 'A must not hear B').toBe(false)
    expect(hears('sta-2', 'sta-1'), 'B must not hear A').toBe(false)
    // …so at least one collision is a true hidden-node collision: one station
    // starts while the other is already mid-frame (not a same-slot start).
    const txs = base.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> =>
      r.type === 'TX_START' && r.frame.kind === 'data' && r.node !== 'ap')
    const ends = base.filter((r): r is Extract<TLRecord, { type: 'TX_END' }> =>
      r.type === 'TX_END' && r.node !== 'ap')
    const midFrame = txs.some((t2) => txs.some((t1) => {
      if (t1.node === t2.node) return false
      const end = ends.find((e) => e.node === t1.node && e.t > t1.t)
      return end !== undefined && t2.t > t1.t && t2.t < end.t
    }))
    expect(midFrame, 'a mid-frame (hidden-node) collision must occur').toBe(true)
  })

  it('hidden: the hiddenness margin is not knife-edge', () => {
    // The station-to-station link must sit clearly below the preamble-detect
    // threshold, not ride the edge (the geometry caps the margin at ~2.6 dB;
    // currently it is 1.4 dB — pin a 1 dB floor so edits cannot erode it).
    const sc = LESSONS.find((l) => l.id === 'hidden')!.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    expect(links.get('sta-1')!.get('sta-2')!).toBeLessThan(CCA_PD_DBM - 1)
    expect(links.get('sta-2')!.get('sta-1')!).toBeLessThan(CCA_PD_DBM - 1)
  })

  it('anomaly: the near station captures the t=0 collision', () => {
    const lesson = LESSONS.find((l) => l.id === 'anomaly')!
    const recs = recordsFor(lesson.scenario(), 200)
    // Both stations reach zero backoff together and transmit at once.
    const starts = recs.filter(
      (r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.t === 0,
    )
    expect(starts.map((r) => r.node).sort()).toEqual(['sta-1', 'sta-2'])
    // The AP captures the near (30 dB stronger) station and never locks the far one:
    // the lesson text quotes SINR 30.4 dB against a 30 dB threshold, so guard the margin.
    const atAp = recs.filter((r) => r.t < 600_000 && 'node' in r && r.node === 'ap')
    expect(atAp.some((r) => r.type === 'RX_OK' && r.from === 'sta-1'), 'near frame captured').toBe(true)
    expect(atAp.some((r) => 'from' in r && r.from === 'sta-2'), 'far frame never locked').toBe(false)
    // The far station alone pays for the collision — and keeps paying.
    const timeouts = (n: string) =>
      recs.filter((r) => r.type === 'ACK_TIMEOUT' && r.node === n).length
    expect(timeouts('sta-1'), 'near station never times out').toBe(0)
    expect(timeouts('sta-2'), 'far station loses simultaneous starts').toBeGreaterThan(0)
  })

  it('anomaly: the capture margin is not knife-edge', () => {
    // The lesson text quotes a comfortable margin; geometry edits must not
    // quietly walk it back to the edge of the decode threshold.
    const sc = LESSONS.find((l) => l.id === 'anomaly')!.scenario()
    const links = buildLinkTable(sc.nodes, sc.walls)
    const gapDb = links.get('sta-1')!.get('ap')! - links.get('sta-2')!.get('ap')!
    expect(gapDb).toBeGreaterThan(sinrThreshDb(54) + 8)
  })

  it('edca: VO access appears; internal collision may occur (soft check)', () => {
    const lesson = LESSONS.find((l) => l.id === 'edca')!
    const records = recordsFor(lesson.scenario(), 300)
    expect(records.some(lesson.jumps[0].find)).toBe(true) // first VO access must exist
  })

  it('capstone: MU, trigger and 6 GHz activity all present', () => {
    const lesson = LESSONS.find((l) => l.id === 'capstone')!
    const records = recordsFor(lesson.scenario(), 500)
    // the jump bar is pinned by what its predicates select out of the run, never by how a
    // button reads: the multi-user send, the trigger, a collision and a 6 GHz frame.
    // jumps 0 and 3 — the multi-user send and the 6 GHz frame. The trigger and the first
    // collision need longer than this 500 ms window; the kit's shape suite runs all four.
    expect(lesson.jumps.length).toBe(4)
    expect(records.some(lesson.jumps[0].find)).toBe(true)
    expect(records.some(lesson.jumps[3].find)).toBe(true)
  })
})

describe('lesson body blocks', () => {
  const written = (l: string | undefined, where: string) => {
    expect(l, where).toBeDefined()
    expect(l!.trim().length, where).toBeGreaterThan(0)
  }

  it('every block is written and well-formed for its kind', () => {
    for (const l of LESSONS) {
      // `deeper` is off the main path, so lessonBlocks leaves it out — but the
      // panel renders it, so it is held to the same shape as everything else.
      const all = [...lessonBlocks(l), ...(l.deeper ?? [])]
      all.forEach((b, i) => {
        const where = `${l.id} body[${i}]`
        if (b.heading) written(b.heading, `${where} heading`)
        switch (b.kind ?? 'p') {
          case 'p':
          case 'formula':
          case 'watch':
            written((b as { text: string }).text, `${where} text`)
            if ('note' in b && b.note) written(b.note, `${where} note`)
            break
          case 'table': {
            const t = b as { head: string[]; rows: string[][] }
            expect(t.head.length, `${where} head`).toBeGreaterThan(1)
            expect(t.rows.length, `${where} rows`).toBeGreaterThan(0)
            t.head.forEach((c, j) => written(c, `${where} head[${j}]`))
            t.rows.forEach((r, ri) => {
              expect(r.length, `${where} row ${ri} width`).toBe(t.head.length)
              r.forEach((c, j) => written(c, `${where} row ${ri}[${j}]`))
            })
            break
          }
          case 'widget': {
            const w = b as { widget: string; params?: Record<string, number | string>; caption?: string }
            expect(['linkBudget', 'mcsLadder'], `${where} widget`).toContain(w.widget)
            if (w.caption) written(w.caption, `${where} caption`)
            break
          }
          case 'diagram': {
            // The figure as data: one of the five kinds, every label a reader sees
            // written, and a layout that fits the viewBox it declares. The geometry
            // itself is tests/course/diagram.test.ts's.
            const d = b as { spec: DiagramSpec; caption?: string }
            expect(['topology', 'stack', 'timing', 'sequence', 'fields'], `${where} spec kind`).toContain(d.spec.kind)
            const labels = diagramTexts(d.spec)
            expect(labels.length, `${where} labels`).toBeGreaterThan(0)
            labels.forEach((t, j) => written(t, `${where} label[${j}]`))
            if (d.caption) written(d.caption, `${where} caption`)
            const { width, height, shapes } = layoutDiagram(d.spec)
            expect(shapes.length, `${where} shapes`).toBeGreaterThan(0)
            expect(width, `${where} width`).toBeGreaterThan(0)
            expect(height, `${where} height`).toBeGreaterThan(0)
            break
          }
          case 'list':
          case 'steps': {
            const items = (b as { items: string[] }).items
            expect(items.length, `${where} items`).toBeGreaterThan(1)
            items.forEach((c, j) => written(c, `${where} item[${j}]`))
            break
          }
          default:
            throw new Error(`${where}: unknown block kind ${String((b as { kind: unknown }).kind)}`)
        }
      })
    }
  })

  it('lesson 7 presents EDCA parameters as a table and AIFS as a formula', () => {
    const edca = LESSONS.find((l) => l.id === 'edca')!
    expect(lessonBlocks(edca).some((b) => b.kind === 'table')).toBe(true)
    expect(lessonBlocks(edca).some((b) => b.kind === 'formula')).toBe(true)
  })
})

describe('lesson 12 claims about TB PPDUs', () => {
  it('every triggered round: all TB PPDUs share the length the Trigger named, and start SIFS after it', () => {
    const l = LESSONS.find((x) => x.id === 'ofdma-ul')!
    const recs = recordsFor(l.scenario(), 100)
    let rounds = 0
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i]
      if (r.type !== 'TX_END' || r.frame.kind !== 'trigger') continue
      const gid = r.frame.orthogonalGroup
      const named = new Set(r.frame.muParts!.map((p) => p.durNs))
      expect(named.size, `trigger @${r.t} names one duration for all users`).toBe(1)
      const dur = [...named][0]!
      const tb = recs.filter((x): x is Extract<TLRecord, { type: 'TX_START' }> =>
        x.type === 'TX_START' && x.frame.kind === 'data' && x.frame.orthogonalGroup === gid)
      if (tb.length === 0) continue // a trigger nobody answered (it times out, see mac-trigger-timeout)
      rounds++
      for (const x of tb) {
        expect(x.t, `TB PPDU starts SIFS after trigger @${r.t}`).toBe(r.t + 16_000)
        expect(x.frame.txTimeNs, `TB PPDU padded to the named length @${r.t}`).toBe(dur)
      }
    }
    expect(rounds).toBeGreaterThanOrEqual(3)
  })
})

describe('module 4 lessons', () => {
  it('adds a fourth module', () => {
    // four Wi-Fi tiers, then the UWB track's three
    expect(TIERS).toHaveLength(7)
    expect(TIERS.map((t) => t.track)).toEqual(['wifi', 'wifi', 'wifi', 'wifi', 'uwb', 'uwb', 'uwb'])
    // The whole module list, in order: seven modules of Tier 1, five of Tier 2, then the
    // UWB tiers. Tiers 3 and 4 (PHY, research) have no module yet — a module arrives with
    // its first lesson, so an index is never a promise about a lesson that is not written.
    // This is the pin a batch trips over when it adds a module under the wrong tier.
    expect(MODULES.map((m) => m.tier)).toEqual([
      0, 0, 0, 0, 0, 0, 0,
      1, 1, 1, 1, 1,
      4, 4, 4, 4,
      5, 5, 5, 5,
      6, 6, 6,
    ])
    expect(MODULES.map((m) => m.title)).toEqual([
      '信号与链路', '一张网里的角色', '帧与空口时间', '等待与退避',
      '听不见的邻居与损失', '在纸上预测 DCF', '第一阶段项目',
      'QoS 与效率', '容量旋钮与速率控制', '被调度的 Wi-Fi 6/7',
      '环境能量物联网（802.11bp）', '真实应用',
      '飞行时间', '两只钟', '会话网格', '定位',
      '共存', '竞争式测距', '单向测距', '角度',
      '多毫秒片段', '窄带控制面', '测距综合实践',
    ])
    // every module shown carries at least one lesson: an empty entry would make every
    // index after it a statement about a course that does not exist
    for (const [i, m] of MODULES.entries()) {
      expect(m.title.length).toBeGreaterThan(0)
      expect(LESSONS.some((l) => l.module === i), m.title).toBe(true)
    }
  })

  it('a track heading opens the first tier and every change of radio', () => {
    // what the course panel prints above a tier: one heading per run of same-radio tiers
    expect(trackHeadings(TIERS)).toEqual([true, false, false, false, true, false, false])
    expect(trackHeadings([])).toEqual([])
    expect(trackHeadings(TIERS.slice(4))).toEqual([true, false, false])
    const alternating = [TIERS[0], TIERS[4], TIERS[1], TIERS[4]]
    expect(trackHeadings(alternating)).toEqual([true, true, true, true])
    // it is a decision about the list it is given: a tier with no lesson is dropped first,
    // so dropping the Wi-Fi tiers must move the heading to the UWB tier, not lose it
    expect(trackHeadings(TIERS.filter((t) => t.track === 'wifi'))).toEqual([true, false, false, false])
  })

  it('lesson 15 is about channel width and offers one variant per width', () => {
    const l = LESSONS.find((x) => x.id === 'width')!
    expect(MODULES[l.module].title).toBe('容量旋钮与速率控制')
    expect(l.variants?.length).toBe(4)
    const widths = l.variants!.map((v) => widthOf(v.scenario().nodes.find((n) => n.id === 'sta-1')!))
    expect(widths).toEqual([20, 40, 80, 160])
  })

  it('lesson 15 shows the same frame taking less air as the channel widens', () => {
    const l = LESSONS.find((x) => x.id === 'width')!
    const dur = l.variants!.map((v) => {
      const recs = new Simulation(v.scenario()).runUntil(200 * 1_000_000).records
      const tx = recs.find((r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.bytes > 1000)
      return tx && tx.type === 'TX_START' ? tx.frame.txTimeNs : 0
    })
    for (let i = 1; i < dur.length; i++) expect(dur[i]).toBeLessThan(dur[i - 1])
  })

  it('lesson 16 is about spatial streams and its link runs at the smaller end', () => {
    const l = LESSONS.find((x) => x.id === 'streams')!
    expect(MODULES[l.module].title).toBe('容量旋钮与速率控制')
    expect(l.variants!.length).toBeGreaterThanOrEqual(3)
  })

  it('every lesson still has a quiz, observations and things to try', () => {
    for (const l of LESSONS) {
      expect(l.quiz.length).toBeGreaterThan(0)
      expect(l.observe.length).toBeGreaterThan(0)
      expect(l.tryThis.length).toBeGreaterThan(0)
      expect(l.title.length).toBeGreaterThan(0)
    }
  })
})

describe('lessons 17 and 18', () => {
  it('the MU-MIMO lesson contrasts OFDMA with MU-MIMO as two variants of the same house', () => {
    const l = LESSONS.find((x) => x.id === 'mumimo')!
    expect(MODULES[l.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(l.variants?.length).toBe(2)
    // the two variants differ in the MU-MIMO flag alone; tests/course/mumimo.test.ts walks it
    const [a, b] = l.variants!.map((v) => v.scenario())
    expect(a.nodes.map((n) => n.caps.features?.mumimo)).toEqual(b.nodes.map(() => false))
    expect(b.nodes.map((n) => n.caps.features?.mumimo)).toEqual(b.nodes.map(() => true))
  })

  it('lesson 17 actually produces a MU-MIMO PPDU in its second variant', () => {
    const l = LESSONS.find((x) => x.id === 'mumimo')!
    const recs = new Simulation(l.variants![1].scenario()).runUntil(500 * 1_000_000).records
    const mu = recs.filter((r) => r.type === 'TX_START' && r.frame.muKind === 'mumimo')
    expect(mu.length).toBeGreaterThan(0)
  })

  it('lesson 18 shows the modulation moving', () => {
    const l = LESSONS.find((x) => x.id === 'rate')!
    expect(MODULES[l.module].title).toBe('容量旋钮与速率控制')
    const recs = new Simulation(l.scenario()).runUntil(3_000 * 1_000_000).records
    const mcss = recs
      .filter((r) => r.type === 'TX_START' && r.node === 'sta-2' && r.frame.kind === 'data')
      .map((r) => (r.type === 'TX_START' ? r.frame.mcs : 0))
    expect(mcss.length).toBeGreaterThan(10)
    expect(new Set(mcss).size).toBeGreaterThan(1)
  })

  it('every lesson id is unique and listed in the reading order', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
    for (const l of LESSONS) expect(COURSE_ORDER, l.id).toContain(l.id)
  })
})

describe('what the AP lane shows for a simultaneous RTS (lesson 13)', () => {
  it('shows the laptop’s RTS as a collision with the neighbor — equal-time starts bury each other’s preambles, so it is undetected', () => {
    const l = LESSONS.find((x) => x.id === 'mlo')!
    const records = new Simulation(l.scenario()).runUntil(1 * MS).records
    const both = records.flatMap((r) => (r.type === 'TX_START' && r.t === 0 && r.frame.kind === 'rts' ? [r.node] : []))
    expect(both.sort()).toEqual(['sta-1', 'sta-2'])
    const rx = recordsToSpans(records, ['ap'], 0, 1 * MS).filter((s) => s.kind === 'rx')
    const laptop = rx.find((s) => s.frameSrc === 'sta-1')
    expect(laptop).toMatchObject({ frameKind: 'rts', rxFail: { reason: 'undetected', interferers: ['sta-2'] } })
  })
})

// The three "standard alignment A" assertions that used to live here searched the lesson
// prose for English phrases — "Until Wi-Fi 6, one transmission served one receiver",
// "Wi-Fi 5 (802.11ac)", "no longer CSMA at all", "EMLSR". They asserted how a sentence is
// written rather than what the simulator does, and the Chinese-only course makes them
// untestable as text. The corrections they guarded live in the lessons' own text and in
// docs/superpowers/ledger; the simulator-side claims they accompanied are pinned in
// tests/course/{ofdma-ul,mumimo,mlo}.test.ts against the run.

describe('course structure (tiers, order, study time)', () => {
  it('lessons follow COURSE_ORDER and every lesson is listed there', () => {
    const ids = LESSONS.map((l) => l.id)
    expect(ids).toEqual(COURSE_ORDER.filter((id) => ids.includes(id)))
  })

  it('no title carries a hard-coded lesson number — the panel numbers lessons by position', () => {
    for (const l of LESSONS) {
      expect(l.title, l.id).not.toMatch(/^\d+\s*·/)
    }
  })

  it('study time is reading time plus time at the simulator, rounded to 5 minutes', () => {
    for (const l of LESSONS) {
      const raw = lessonChars(l) / CHARS_PER_MINUTE
        + OBSERVE_MINUTES * l.observe.length + TRY_MINUTES * l.tryThis.length
      expect(lessonMinutes(l), l.id).toBe(Math.max(5, Math.round(raw / 5) * 5))
      expect(lessonMinutes(l) % 5, l.id).toBe(0)
    }
  })

  it('Tier 1 opens with the network-and-frame module, and the channel-access lessons sit in Tier 1', () => {
    const tierOf = (id: string) => MODULES[LESSONS.find((l) => l.id === id)!.module].tier
    for (const id of ['airtime', 'ifs', 'backoff', 'nav', 'hidden', 'anomaly']) expect(tierOf(id), id).toBe(0)
    for (const id of ['edca', 'ampdu', 'width', 'rate', 'ofdma-dl', 'mlo', 'capstone']) expect(tierOf(id), id).toBe(1)
  })
})


describe("a lesson's track", () => {
  /**
   * Pinned, one line a lesson. `trackOf` decides the prerequisite rule and the
   * acronym rule in readability.test.ts and what `lesson-dump --all-wifi` and
   * `--all-uwb` print, and it used to read `l.module === 7` for the AMP track —
   * a coincidence of ordering, under which inserting one module above the AMP
   * one would have handed 'amp' to a DCF lesson without a test noticing. These
   * are the values the course had before the track became module data; a lesson
   * may not change track, and a new lesson must be listed here on purpose.
   */
  const TRACK: Record<string, LessonTrack> = {
    "radio-primer":             "wifi",
    "decode-thresholds":        "wifi",
    "roles-stack":              "wifi",
    "frame-anatomy":            "wifi",
    "frame-anatomy-bytes":      "wifi",
    "airtime":                  "wifi",
    "ifs":                      "wifi",
    "backoff":                  "wifi",
    "nav":                      "wifi",
    "hidden":                   "wifi",
    "anomaly":                  "wifi",
    "retries-queues":           "wifi",
    "bianchi":                  "wifi",
    "bianchi-vs-sim":           "wifi",
    "tier1-project":            "wifi",
    "tier1-project-review":     "wifi",
    "edca":                     "wifi",
    "ampdu":                    "wifi",
    "txop":                     "wifi",
    "txop-protect":             "wifi",
    "width":                    "wifi",
    "streams":                  "wifi",
    "rate":                     "wifi",
    "rate-fallback":            "wifi",
    "ofdma-dl":                 "wifi",
    "ofdma-ul":                 "wifi",
    "mumimo":                   "wifi",
    "mlo":                      "wifi",
    "amp-intro":                "amp",
    "amp-ppdu":                 "amp",
    "amp-slots":                "amp",
    "amp-coexist":              "amp",
    "capstone":                 "wifi",
    "uwb-intro":                "uwb",
    "uwb-frame":                "uwb",
    "uwb-sts":                  "uwb",
    "uwb-sstwr":                "uwb",
    "uwb-dstwr":                "uwb",
    "uwb-blocks":               "uwb",
    "uwb-position":             "uwb",
    "uwb-geometry":             "uwb",
    "uwb-coexist":              "uwb",
    "uwb-contention":           "uwb",
    "uwb-dl-tdoa":              "uwb",
    "uwb-ul-tdoa":              "uwb",
    "uwb-aoa":                  "uwb",
    "uwb-mms":                  "uwb",
    "uwb-mms-numbers":          "uwb",
    "uwb-nba":                  "uwb",
    "uwb-nba-coexist":          "uwb",
    "uwb-capstone":             "uwb",
  }

  it('every lesson reads the track pinned for it', () => {
    for (const l of LESSONS) {
      expect(TRACK[l.id], `${l.id} has no pinned track — add a line to TRACK`).toBeDefined()
      expect(trackOf(l), l.id).toBe(TRACK[l.id])
    }
    expect(LESSONS.map((l) => l.id).sort()).toEqual(Object.keys(TRACK).sort())
  })

  it('comes from the module, and only a module whose radio differs from its tier declares one', () => {
    for (const m of MODULES) {
      if (m.track === undefined) continue
      // a module that merely repeats its tier's radio is data that can drift out of agreement
      expect(m.track, m.title).not.toBe(TIERS[m.tier].track)
    }
    // the AMP module is the only one today, and its lessons follow it to whatever index it lands on
    const amp = MODULES.map((m, i) => ({ m, i })).filter(({ m }) => m.track === 'amp')
    expect(amp).toHaveLength(1)
    const ampLessons = LESSONS.filter((l) => l.module === amp[0].i)
    expect(ampLessons.length).toBeGreaterThan(0)
    for (const l of ampLessons) expect(trackOf(l), l.id).toBe('amp')
  })
})
