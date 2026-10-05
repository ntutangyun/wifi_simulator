/**
 * Every tamper preset, `gameAccel` and `servers` combination the schema *allows*, proved either
 * inert or not — design doc 2026-10-05-built-but-untaught §7 and §8.1.
 *
 * This branch has shipped several configurations that were legal and provably did nothing
 * (slice 3's `contention` + `rmnr`, the SRRR `RRTT` bit, the batch SSBD §5 names,
 * `selectivity` over a flat channel), and each one made a feature look finished. The three
 * things the `wan-rtt` / `edca-tamper` slice switched on are the most exposed of all, because
 * each one is literally "a switch the engine has had for weeks and no lesson ever flipped". So
 * the first question here is not 「它建成了吗」 but 「打开它之后结果真的变了吗」.
 *
 * **Every assertion states the thing as it IS, not as it should be.** 「相同」 or 「只差这一个
 * 字段」, never 「有效果」. A quantity that is over- or under-stated has to be pinned at its real
 * value or the pin is the next person's wrong belief. The two directions are both here: eight
 * inert combinations and two live ones, and each live one exists so that an inert assertion
 * cannot pass by the whole mechanism having been switched off.
 *
 * **What the ruler is.** `stream()` is `JSON.stringify` over the whole record array, nothing
 * dropped. Nothing here inserts a record TYPE into the stream, so unlike
 * `selectivity-inert.test.ts` there is no `seq` renumbering to work around, and the comparison
 * is the timeline rather than a chosen summary of it. Where a stream differs, `diff()` reports
 * which record types and which FIELDS moved — the distinction that turns 「记录流变了」 into a
 * statement somebody can act on.
 *
 * **Five of these assertions changed shape on 2026-10-05, and the reason is worth reading.**
 * The schema now REFUSES the three configurations that used to be merely inert — a tamper preset
 * on a non-station, a game-mode boolean on a non-AP, and a preset no field of which this link can
 * read (`driverRefusalsFor`, src/model/scenario.ts). `Simulation`'s constructor parses before it
 * builds anything, so those plans cannot be run at all any more and a byte-identity assertion
 * over them is not merely stale, it is unreachable. Each one became an assertion that the plan is
 * refused and that the sentence names the field — paired, every time, with a live control on the
 * SAME room showing the rule discriminates rather than bans.
 *
 * **One assertion in here contradicts the design document, and the document was the one that
 * was wrong.** §7.1 lists `navInflate` as effective in all four scenes. It is, in the sense
 * that the stream differs; but on a station with no audible neighbour the only thing that
 * differs is the Duration field of its own frames, and not one consequence follows. Measured,
 * written down, and the lesson says so too.
 */
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { cloudGameScenario, oneRoom, sc, tamperScenario } from '../../src/course/wifiScenes'
import { node } from '../../src/course/lessonKit'
import {
  DEFAULT_SERVERS, TAMPER_PRESETS, driverRefusals,
  type ProfileId, type Scenario, type ServerCfg, type TamperKind,
} from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
const RUN_NS = 2000 * MS
const FEATS = { edca: true, txop: true, ampdu: true }
const GAME: ServerCfg = DEFAULT_SERVERS.find((s) => s.kind === 'game')!
const CALL: ServerCfg = DEFAULT_SERVERS.find((s) => s.kind === 'call')!

const run = (s: Scenario, ns: number = RUN_NS): TLRecord[] => [...new Simulation(s).runUntil(ns).records]
const stream = (rs: TLRecord[]): string => JSON.stringify(rs)
const same = (a: Scenario, b: Scenario, ns: number = RUN_NS): boolean => stream(run(a, ns)) === stream(run(b, ns))

/** Which record types and which fields differ, for two streams of equal length. */
function diff(a: TLRecord[], b: TLRecord[]): { n: number; types: string[]; fields: string[] } {
  expect(b.length, 'diff() is only meaningful for streams of equal length').toBe(a.length)
  const types = new Set<string>()
  const fields = new Set<string>()
  let n = 0
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue
    n++
    types.add(a[i].type)
    const ra = a[i] as unknown as Record<string, unknown>
    const rb = b[i] as unknown as Record<string, unknown>
    for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      if (JSON.stringify(ra[k]) !== JSON.stringify(rb[k])) fields.add(k)
    }
  }
  return { n, types: [...types].sort(), fields: [...fields].sort() }
}

// ---------------------------------------------------------------------------
// the scenes
// ---------------------------------------------------------------------------

/** One station alone with the access point and the endpoint its profile reaches. */
function lone(profile: ProfileId, o: { cheat?: TamperKind; servers?: ServerCfg[]; seed?: number } = {}): Scenario {
  const ap = node('ap', 'Router', 'ap', 5, 1, 'eht', 'idle', FEATS)
  const sta = node('sta-1', 'Device', 'sta', 3, 5, 'eht', profile, FEATS)
  if (o.cheat) sta.tamper = TAMPER_PRESETS[o.cheat]
  const servers = o.servers ?? [profile === 'voice' ? CALL : GAME]
  return sc(oneRoom(), [ap, sta], { servers, ...(o.seed === undefined ? {} : { seed: o.seed }) })
}

/**
 * Three saturated stations with EDCA negotiated OFF: a legacy 802.11g room, which is a
 * perfectly legal plan and the one the schema will happily hang any preset on.
 * `GEN_FEATURES.nonht` is empty, so this is what the editor produces for a 1999 client.
 */
function legacyDcf(cheat?: TamperKind): Scenario {
  const ap = node('ap', 'Router', 'ap', 5, 1, 'nonht', 'idle', {})
  const stas = [3, 5, 7].map((x, i) => node(`sta-${i + 1}`, `Station ${i + 1}`, 'sta', x, 5, 'nonht', 'saturated', {}))
  if (cheat) stas[0].tamper = TAMPER_PRESETS[cheat]
  return sc(oneRoom(), [ap, ...stas])
}

/** A busy room with no `gaming` stream anywhere in it. */
function noGameFlow(accel: boolean): Scenario {
  const ap = node('ap', 'Router', 'ap', 5, 1, 'eht', 'idle', FEATS)
  if (accel) ap.gameAccel = true
  return sc(oneRoom(), [ap,
    node('sta-1', 'A', 'sta', 3, 5, 'eht', 'browsing', FEATS),
    node('sta-2', 'B', 'sta', 5, 5, 'eht', 'browsing', FEATS),
    node('sta-3', 'C', 'sta', 7, 5, 'eht', 'saturated', FEATS),
    node('sta-4', 'D', 'sta', 8, 3, 'eht', 'video', FEATS)], { servers: DEFAULT_SERVERS })
}

/** Three gaming phones and an uploader, with the game-mode boolean on the WRONG node. */
function accelOnSta(onSta: boolean): Scenario {
  const ap = node('ap', 'Router', 'ap', 5, 1, 'eht', 'idle', FEATS)
  const phones = [3, 5, 7].map((x, i) => node(`sta-${i + 1}`, `Phone ${i + 1}`, 'sta', x, 5, 'eht', 'gaming', FEATS))
  if (onSta) phones[0].gameAccel = true
  const lap = node('sta-4', 'Laptop', 'sta', 8, 6, 'eht', 'saturated', FEATS)
  return sc(oneRoom(), [ap, ...phones, lap], { servers: [GAME] })
}

/** `tamperScenario`'s room with the preset hung on the access point instead of a station. */
function tamperOnAp(on: boolean): Scenario {
  const base = tamperScenario()
  if (!on) return base
  return { ...base, nodes: base.nodes.map((n) => (n.kind === 'ap' ? { ...n, tamper: TAMPER_PRESETS.greedy } : n)) }
}

// ---------------------------------------------------------------------------
// §8.1 items 1–4: the presets that do nothing
// ---------------------------------------------------------------------------

describe('a tamper preset that is legal and provably inert', () => {
  /** Item 1. Marking AC_VO traffic as AC_VO is not a change. */
  it('1 · priority escalation on a station whose only stream is already voice', () => {
    expect(same(lone('voice'), lone('voice', { cheat: 'escalate' }))).toBe(true)
  })

  /**
   * Item 2, **and the one cell of the design document's matrix this slice took away rather than
   * pinned.** Three structural gates, all in `mac.ts`: `efIndex(ac)` folds every category to 0
   * when `!edca`, the AIFS comes from `T.difsNs` instead of `aifsNs(params.aifsn)`, and a TXOP
   * needs `cfg.txop && cfg.edca` before `txopLimitNs` is ever read. So three of the seven presets
   * cannot be read at all in a legacy room — and since 2026-10-05 the schema REFUSES them there
   * (`driverRefusalsFor`, src/model/scenario.ts), which `Simulation`'s constructor enforces
   * because it parses before it builds anything. The byte-identity that used to be asserted here
   * is therefore no longer reachable through the engine at all.
   *
   * **The evidence did not go with it, and that is the only reason the refusal is defensible.**
   * Item 3 just below measures the very same physics from the side the schema still accepts:
   * `greedy` sets those three fields AND a window pair, so it is accepted on a legacy link, and
   * what it produces there is byte-for-byte `cw`. Three unreadable fields, measured, on a plan
   * that still runs. What is asserted here is the refusal itself and its sentence.
   */
  it.each(['escalate', 'aifs', 'txopHog'] as const)('2 · %s on a legacy DCF station is refused, not merely inert', (cheat) => {
    const refusals = driverRefusals(legacyDcf(cheat))
    expect(refusals.length, `${cheat} on a legacy link`).toBe(1)
    expect(refusals[0]).toContain('EDCA')
    expect(() => new Simulation(legacyDcf(cheat)), 'the constructor parses before it builds').toThrow()
    // the same preset on an EDCA link is accepted and is not inert, so this is a rule and not a ban
    expect(() => new Simulation(tamperScenario(cheat))).not.toThrow()
    expect(same(tamperScenario(), tamperScenario(cheat))).toBe(false)
  })

  /**
   * Item 3. The hardest number in §7, and the one worth a reader's attention: in a legal legacy
   * room the five-field preset the editor labels the most brazen produces the SAME timeline as
   * the one-field window collapse. Four of its five fields are behind the gates above.
   */
  it('3 · the combined preset and the window collapse are the same run on a legacy station', () => {
    expect(stream(run(legacyDcf('greedy')))).toBe(stream(run(legacyDcf('cw'))))
    // and not because both are inert: both differ from the compliant room
    expect(same(legacyDcf(), legacyDcf('cw'))).toBe(false)
  })

  /**
   * Item 4, and both halves together on purpose. The equality is the claim; the zero is the
   * REASON for it, and without the zero nobody reading a future failure could tell whether to
   * change the scene or the conclusion. Checked at two run lengths and two seeds because this
   * is the格 that looks most like "it would change if it ran longer" — it does not, because a
   * station that neither collides nor loses an ACK never doubles a window at any length.
   */
  it.each([
    ['gaming', 2000], ['gaming', 30_000], ['voice', 2000], ['voice', 30_000],
  ] as const)('4 · no-doubling on a lone %s station, %i ms', (profile, ms) => {
    for (const seed of [7, 23]) {
      const base = lone(profile, { seed })
      const cheat = lone(profile, { cheat: 'noDouble', seed })
      const rs = run(base, ms * MS)
      const retried = rs.filter((r) => r.type === 'COLLISION' || r.type === 'ACK_TIMEOUT' || r.type === 'RETRY')
      expect(retried.length, `seed ${seed}: the window never had a reason to double`).toBe(0)
      expect(stream(rs), `seed ${seed}`).toBe(stream(run(cheat, ms * MS)))
    }
  })
})

// ---------------------------------------------------------------------------
// §8.1 item 5, and the two the design document called "effective"
// ---------------------------------------------------------------------------

describe('a tamper preset that prints a number and changes nothing else', () => {
  /**
   * Item 5. The cleanest shape of "permitted but inert" this slice found, and the one the
   * `edca-tamper` lesson ships as a variant. The 「差异条数 > 0」 is not decoration: without it
   * this assertion would be green in a world where the preset had been deleted.
   */
  it('5 · TXOP hogging on a lone gaming station rewrites 87 deadlines and nothing else', () => {
    const a = run(cloudGameScenario())
    const b = run(cloudGameScenario({ cheat: 'txopHog' }))
    const d = diff(a, b)
    expect(d.n).toBeGreaterThan(0)
    expect(d.n).toBe(87)
    expect(d.types).toEqual(['TXOP_START'])
    expect(d.fields).toEqual(['untilNs'])
    // And a consequence worth knowing about the OTHER guard in this repository:
    // `timelineHash` folds only `t:seq:type`, so this cheat is invisible to it — the fixture
    // records the same `9a3160d4` for `wan-rtt` (the clean scene) and for `edca-tamper#9`
    // (the same scene with the preset). `tests/fixtures/lesson-hashes.json` could not have
    // caught this one, which is why the proof is a field-level diff and lives here.
  })

  /**
   * The same shape on a lone voice station, which §7.1 recorded merely as 「变」. It differs,
   * and it differs in exactly one field — so the honest row for that cell is this one, not
   * "effective".
   */
  it('5b · and the same on a lone voice station: 102 deadlines, one field', () => {
    const d = diff(run(lone('voice')), run(lone('voice', { cheat: 'txopHog' })))
    expect(d.n).toBe(102)
    expect(d.types).toEqual(['TXOP_START'])
    expect(d.fields).toEqual(['untilNs'])
  })

  /**
   * **The design document's §7.1 is wrong about this cell and this is the correction.** It
   * lists `navInflate` as effective in all four scenes. On a station with no audible neighbour
   * the Duration field of its own frames changes — 87 announcements — and not one consequence
   * does. An inflated NAV needs somebody to obey it, and in an empty room there is nobody.
   */
  it('5c · an inflated Duration with no neighbour moves the announcement and no outcome', () => {
    const d = diff(run(cloudGameScenario()), run(cloudGameScenario({ cheat: 'navInflate' })))
    // 348 records = the same 87 frames seen four times over, as the sender's TX_START and
    // TX_END and the access point's RX_START and RX_OK. One announcement, four records.
    expect(d.n).toBe(348)
    expect(d.n % 4).toBe(0)
    expect(d.types).toEqual(['RX_OK', 'RX_START', 'TX_END', 'TX_START'])
    expect(d.fields, 'the announced Duration rides in `frame`, and nothing else moved').toEqual(['frame'])
    // the live control: with three competing stations the same preset takes the channel
    expect(same(tamperScenario(), tamperScenario('navInflate'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §8.1 items 6–8: the fields hung on the wrong node
// ---------------------------------------------------------------------------

describe('a field the schema accepts on a node that never reads it', () => {
  /**
   * Items 6 and 7. `TrafficSource.ac` reads `gameAccel` only when `profile === 'gaming'`, and
   * `simulation.ts:379` reads it only off the access point. Both combinations are refused by
   * `FloorPlanEditor.tsx` (the checkbox renders for `kind === 'ap'` only, and a room with no
   * game stream simply has nothing to mark) and accepted by the schema, so the UI closes two
   * doors the schema leaves open.
   *
   * Item 6 is also the one §7.5 deliberately declines to refuse in the schema: ticking the
   * router's box before adding the phone's stream is a reasonable intermediate state in the
   * editor, so it is pinned here instead.
   */
  it('6 · game acceleration with no game stream in the room', () => {
    expect(same(noGameFlow(false), noGameFlow(true))).toBe(true)
  })

  it('7 · game acceleration on a station instead of the access point is refused', () => {
    const refusals = driverRefusals(accelOnSta(true))
    expect(refusals.length).toBe(1)
    expect(refusals[0]).toContain('gameAccel')
    expect(() => new Simulation(accelOnSta(true))).toThrow()
    // the live control, and it is what makes this a rule about WHERE rather than a ban: the same
    // boolean on the access point of the same room is accepted, and it is not inert
    const apOn: Scenario = {
      ...accelOnSta(false),
      nodes: accelOnSta(false).nodes.map((n) => (n.kind === 'ap' ? { ...n, gameAccel: true } : n)),
    }
    expect(driverRefusals(apOn)).toEqual([])
    expect(same(accelOnSta(false), apOn)).toBe(false)
  })

  /**
   * Item 8. `simulation.ts` drops an AP-side `tamper` explicitly — `tamper: n.kind === 'sta' ?
   * n.tamper : undefined` — and until this slice it did so silently. Now the plan does not get
   * that far.
   */
  it('8 · a tamper preset on the access point is refused, not dropped in silence', () => {
    const refusals = driverRefusals(tamperOnAp(true))
    expect(refusals.length).toBe(1)
    expect(refusals[0]).toContain('tamper')
    expect(() => new Simulation(tamperOnAp(true))).toThrow()
    // the live control: the same preset on a station of the same room runs, and takes the channel
    expect(driverRefusals(tamperScenario('greedy'))).toEqual([])
    expect(same(tamperScenario(), tamperScenario('greedy'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §8.1 items 9–10: the server list
// ---------------------------------------------------------------------------

describe('a server list nobody reaches, and one that is reached at zero cost', () => {
  /** Item 9. `serverFor` goes through `serverKindFor(profile)`, which answers `null` or a kind. */
  it('9 · a call server in a room with no voice stream is the empty list', () => {
    expect(same(lone('gaming', { servers: [] }), lone('gaming', { servers: [CALL] }))).toBe(true)
  })

  /**
   * The same argument for the two scenes this slice shipped, because it is the reason each one
   * carries the list it carries: `cloudGameScenario` ships ONE endpoint rather than
   * `DEFAULT_SERVERS`, and `tamperScenario` ships none at all although the design document
   * asked for `DEFAULT_SERVERS`. Both choices are only defensible if the difference is nothing,
   * and that is what this measures.
   */
  it('9b · and the two scenes of this slice carry the shortest list that changes nothing', () => {
    const withAll = (s: Scenario): Scenario => ({ ...s, servers: DEFAULT_SERVERS })
    expect(same(cloudGameScenario(), withAll(cloudGameScenario()))).toBe(true)
    expect(same(cloudGameScenario({ busy: true }), withAll(cloudGameScenario({ busy: true })))).toBe(true)
    expect(same(tamperScenario(), withAll(tamperScenario()))).toBe(true)
  })

  /**
   * Item 10, the reverse direction, and the one the lesson's second `tryThis` sends the reader
   * at. A reader who sets `rttMs: 0` expects the server-less baseline and does not get it: the
   * crossing still happens, the records are still emitted, and a `gaming` downlink still comes
   * from the server path instead of from a local tick. A zero-latency server is a server in the
   * next room.
   */
  it('10 · a zero-latency game server is not the same as no server', () => {
    const zero: ServerCfg = { ...GAME, rttMs: 0, jitterMs: 0, processMs: 0 }
    expect(same(lone('gaming', { servers: [] }), lone('gaming', { servers: [zero] }))).toBe(false)
    const rs = run(lone('gaming', { servers: [zero] }))
    expect(rs.filter((r) => r.type === 'WAN_TX').length).toBeGreaterThan(0)
    expect(rs.filter((r) => r.type === 'WAN_RX').length).toBeGreaterThan(0)
  })
})
