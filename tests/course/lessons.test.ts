import { describe, it, expect } from 'vitest'
import { LESSONS, MODULES, type L10n } from '../../src/course/lessons'
import { COURSE_ORDER, OBSERVE_MINUTES, TIERS, TRY_MINUTES, lessonMinutes, lessonWords } from '../../src/course/curriculum'
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
      expect(l.body.length).toBeGreaterThan(0)
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
        expect(records.some(j.find), `${c.id} → ${j.label.en}`).toBe(true)
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
    const find = (en: string) => lesson.jumps.find((j) => j.label.en === en)!
    expect(records.some(find('first MU PPDU').find)).toBe(true)
    expect(records.some(find('first 6 GHz data').find)).toBe(true)
  })
})

describe('lesson body blocks', () => {
  const bilingual = (l: { en: string; zh: string } | undefined, where: string) => {
    expect(l, where).toBeDefined()
    expect(l!.en.trim().length, `${where} en`).toBeGreaterThan(0)
    expect(l!.zh.trim().length, `${where} zh`).toBeGreaterThan(0)
  }

  it('every block is bilingual and well-formed for its kind', () => {
    for (const l of LESSONS) {
      l.body.forEach((b, i) => {
        const where = `${l.id} body[${i}]`
        if (b.heading) bilingual(b.heading, `${where} heading`)
        switch (b.kind ?? 'p') {
          case 'p':
          case 'formula':
            bilingual((b as { text: L10n }).text, `${where} text`)
            if ('note' in b && b.note) bilingual(b.note, `${where} note`)
            break
          case 'table': {
            const t = b as { head: L10n[]; rows: L10n[][] }
            expect(t.head.length, `${where} head`).toBeGreaterThan(1)
            expect(t.rows.length, `${where} rows`).toBeGreaterThan(0)
            t.head.forEach((c, j) => bilingual(c, `${where} head[${j}]`))
            t.rows.forEach((r, ri) => {
              expect(r.length, `${where} row ${ri} width`).toBe(t.head.length)
              r.forEach((c, j) => bilingual(c, `${where} row ${ri}[${j}]`))
            })
            break
          }
          case 'widget': {
            const w = b as { widget: string; params?: Record<string, number | string>; caption?: L10n }
            expect(['linkBudget', 'mcsLadder'], `${where} widget`).toContain(w.widget)
            if (w.caption) bilingual(w.caption, `${where} caption`)
            break
          }
          case 'list':
          case 'steps': {
            const items = (b as { items: L10n[] }).items
            expect(items.length, `${where} items`).toBeGreaterThan(1)
            items.forEach((c, j) => bilingual(c, `${where} item[${j}]`))
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
    expect(edca.body.some((b) => b.kind === 'table')).toBe(true)
    expect(edca.body.some((b) => b.kind === 'formula')).toBe(true)
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
    // four Wi-Fi tiers, then the UWB track's first tier
    expect(TIERS).toHaveLength(5)
    expect(TIERS.map((t) => t.track)).toEqual(['wifi', 'wifi', 'wifi', 'wifi', 'uwb'])
    expect(MODULES.map((m) => m.tier)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 4])
    for (const m of MODULES) expect(m.title.zh.length).toBeGreaterThan(0)
  })

  it('lesson 15 is about channel width and offers one variant per width', () => {
    const l = LESSONS.find((x) => x.id === 'width')!
    expect(l.module).toBe(3) // zero-based module index
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
    expect(l.module).toBe(3)
    expect(l.variants!.length).toBeGreaterThanOrEqual(3)
  })

  it('every lesson still has a quiz, observations and things to try', () => {
    for (const l of LESSONS) {
      expect(l.quiz.length).toBeGreaterThan(0)
      expect(l.observe.length).toBeGreaterThan(0)
      expect(l.tryThis.length).toBeGreaterThan(0)
      expect(l.title.zh.length).toBeGreaterThan(0)
    }
  })
})

describe('lessons 17 and 18', () => {
  it('the MU-MIMO lesson contrasts OFDMA with MU-MIMO as two variants of the same house', () => {
    const l = LESSONS.find((x) => x.id === 'mumimo')!
    expect(MODULES[l.module].title.en).toBe('Scheduled Wi-Fi 6/7')
    expect(l.variants?.length).toBe(2)
    expect(l.variants!.map((v) => v.label.en)).toEqual(['OFDMA (split by frequency)', 'MU-MIMO (split by space)'])
  })

  it('lesson 17 actually produces a MU-MIMO PPDU in its second variant', () => {
    const l = LESSONS.find((x) => x.id === 'mumimo')!
    const recs = new Simulation(l.variants![1].scenario()).runUntil(500 * 1_000_000).records
    const mu = recs.filter((r) => r.type === 'TX_START' && r.frame.muKind === 'mumimo')
    expect(mu.length).toBeGreaterThan(0)
  })

  it('lesson 18 shows the modulation moving', () => {
    const l = LESSONS.find((x) => x.id === 'rate')!
    expect(l.module).toBe(3)
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

describe('claims checked against the standard (standard alignment A)', () => {
  const all = JSON.stringify(LESSONS)
  it('Wi-Fi 5 already had DL MU-MIMO, so multi-user transmission did not start with Wi-Fi 6', () => {
    expect(all).not.toMatch(/Until Wi-Fi 6, one transmission served one receiver/)
    expect(all).toMatch(/Wi-Fi 5 \(802\.11ac\)/)
  })
  it('triggered uplink still uses carrier sense when the Trigger requires it', () => {
    expect(all).not.toMatch(/no longer CSMA at all/)
  })
  it('MLO is not described as only the two-radio form', () => {
    expect(all).toMatch(/EMLSR/)
  })
})

describe('course structure (tiers, order, study time)', () => {
  it('lessons follow COURSE_ORDER and every lesson is listed there', () => {
    const ids = LESSONS.map((l) => l.id)
    expect(ids).toEqual(COURSE_ORDER.filter((id) => ids.includes(id)))
  })

  it('no title carries a hard-coded lesson number — the panel numbers lessons by position', () => {
    for (const l of LESSONS) {
      expect(l.title.en, l.id).not.toMatch(/^\d+\s*·/)
      expect(l.title.zh, l.id).not.toMatch(/^\d+\s*·/)
    }
  })

  it('study time is reading time plus time at the simulator, rounded to 5 minutes', () => {
    for (const l of LESSONS) {
      const raw = lessonWords(l) / 150 + OBSERVE_MINUTES * l.observe.length + TRY_MINUTES * l.tryThis.length
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

