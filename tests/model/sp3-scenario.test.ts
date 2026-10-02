import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, DEFAULT_UWB_SRRR, ScenarioSchema, nonht,
  type NodeCfg, type Scenario, type UwbSessionCfg,
} from '../../src/model/scenario'
import { srrrIeBytes, uwbMaxAnchors, uwbPollBytes, UWB_MAX_PSDU_BYTES } from '../../src/uwb/phy'

/**
 * Task 2 of docs/superpowers/specs/2026-10-02-sp3-design.md: the scenario schema for `sp3`
 * (default false) and `srrr` (the SRRR IE's own RAOA/RRTT request bits, standard §10.32.9.9).
 *
 * The slice's teaching point (design §2): an SP3 packet is SYNC + SFD + STS, no PHR, no payload,
 * so it cannot carry a timestamp — `replyTime: 'embedded'` is not merely unsupported under `sp3`,
 * it is impossible, and the refusal says why rather than shrugging. `'fixed'` is refused too,
 * because it never puts a reply time on the air at all, so sp3's own mandatory measurement report
 * phase would have nothing of its own to carry back. Only `'deferred'` is left, which is exactly
 * the existing mechanism (standard §10.29.6.3) SP3 compresses to its physically shortest frame.
 *
 * Also covers: the four modes sp3 is refused under (`dl-tdoa`/`ul-tdoa`/`mms`/`m2m`, none of which
 * ever sends the RCM/SRRR structure this flag turns on); `schedule: 'contention'` (a drawn slot
 * cannot back the per-responder SRRR declaration); the RAOA request bit against the `aoa` switch
 * it reads from; and the RCM's own SRRR content outgrowing the 127-octet PSDU cap at a lower
 * anchor count than the Poll alone would.
 */

function uwbNode(id: string, role: 'anchor' | 'tag', x: number, y: number, z = 1): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x, y, z }, txPowerDbm: -14,
    profiles: ['idle'], caps: { ...nonht }, uwb: { role },
  }
}

function uwbScenario(nodes: NodeCfg[], uwb: UwbSessionCfg = DEFAULT_UWB_SESSION): Scenario {
  return {
    rooms: [{ x: 0, y: 0, w: 300, h: 300, name: 'Hall' }],
    walls: [],
    nodes,
    servers: [],
    seed: 7,
    rtsThresholdBytes: 3000,
    snapshotIntervalMs: 10,
    uwb,
  }
}

const twoAnchorsOneTag = (): NodeCfg[] => [
  uwbNode('anc-1', 'anchor', 0, 0),
  uwbNode('anc-2', 'anchor', 8, 0),
  uwbNode('tag-1', 'tag', 4, 4),
]

const fourAnchorsOneTag = (): NodeCfg[] => [
  uwbNode('anc-1', 'anchor', 0, 0),
  uwbNode('anc-2', 'anchor', 8, 0),
  uwbNode('anc-3', 'anchor', 0, 8),
  uwbNode('anc-4', 'anchor', 8, 8),
  uwbNode('tag-1', 'tag', 4, 4),
]

const m2mNodes = (n = 3): NodeCfg[] =>
  Array.from({ length: n }, (_, i) => uwbNode(`p-${i}`, 'tag', i * 4, 0))

/** anchors(n) for the SRRR-capacity test: one tag, n anchors, spaced out so the block/slot-fit
 * rules (unrelated to this test) never fire first. */
const anchorsAnd1Tag = (n: number): NodeCfg[] => [
  ...Array.from({ length: n }, (_, i) => uwbNode(`anc-${i}`, 'anchor', i * 2, 0)),
  uwbNode('tag-1', 'tag', 4, 100),
]

/** A legal sp3 session: time-scheduled, two-way, deferred reply time — the one shape sp3 accepts. */
const sp3Cfg = (over: Partial<UwbSessionCfg> = {}): UwbSessionCfg => ({
  ...DEFAULT_UWB_SESSION, mode: 'twr', schedule: 'time', replyTime: 'deferred', sp3: true, ...over,
})

describe('sp3 / srrr — the scenario schema (design §2/§3)', () => {
  it('a scenario that never sets either field parses, and reads back at the defaults', () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_UWB_SESSION }
    delete legacy.sp3
    delete legacy.srrr
    const sc: unknown = { ...uwbScenario(twoAnchorsOneTag()), uwb: legacy }
    const parsed = ScenarioSchema.parse(sc)
    expect(parsed.uwb?.sp3).toBe(false)
    expect(parsed.uwb?.srrr).toEqual(DEFAULT_UWB_SRRR)
    expect(parsed.uwb).toEqual(DEFAULT_UWB_SESSION)
  })

  it('round-trips: the schema can parse its own output', () => {
    // `method: 'ss'` because fix round 1 of task 3 refuses both SRRR request bits outside SS-TWR:
    // the frames that answer them are the deferred shape's own (design §4.1).
    const cfg = sp3Cfg({ method: 'ss', srrr: { raoa: false, rrtt: true } })
    const once = ScenarioSchema.parse(uwbScenario(twoAnchorsOneTag(), cfg))
    // Pinned so this cannot pass vacuously by both sides simply lacking the fields.
    expect(once.uwb?.sp3).toBe(true)
    expect(once.uwb?.srrr).toEqual({ raoa: false, rrtt: true })
    expect(() => ScenarioSchema.parse(once)).not.toThrow()
    const twice = ScenarioSchema.parse(once)
    expect(twice.uwb).toEqual(once.uwb)
  })

  it('the legal shape (twr, time, deferred) parses', () => {
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), sp3Cfg())).success).toBe(true)
  })

  it('dl-tdoa: refused unconditionally', () => {
    const cfg = sp3Cfg({ mode: 'dl-tdoa' })
    const r = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/DL-TDoA/)
      expect(msg).toMatch(/sp3 关掉/)
    }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), { ...cfg, sp3: false })).success).toBe(true)
  })

  it('ul-tdoa: refused unconditionally', () => {
    const cfg = sp3Cfg({ mode: 'ul-tdoa' })
    const r = ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/UL-TDoA/)
      expect(msg).toMatch(/sp3 关掉/)
    }
    expect(ScenarioSchema.safeParse(uwbScenario(fourAnchorsOneTag(), { ...cfg, sp3: false })).success).toBe(true)
  })

  it('mms: refused unconditionally', () => {
    const cfg = sp3Cfg({ mode: 'mms' })
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/窄带/)
      expect(msg).toMatch(/sp3 关掉/)
    }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...cfg, sp3: false })).success).toBe(true)
  })

  it('m2m: refused unconditionally', () => {
    const cfg = sp3Cfg({ mode: 'm2m', method: 'ss' })
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/多对多/)
      expect(msg).toMatch(/sp3 关掉/)
    }
    // replyTime forced back to 'embedded' too: sp3Cfg's own 'deferred' default is only legal for
    // sp3 (design §2), and m2m has its own unconditional, sp3-unrelated "replyTime must be
    // embedded" rule (Ruling 1) — turning sp3 off alone would still leave that one refusing.
    expect(ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), { ...cfg, sp3: false, replyTime: 'embedded' })).success)
      .toBe(true)
  })

  it("m2m + sp3 at the default replyTime ('embedded'): both rules fire, with no contradiction", () => {
    // m2m's own rule is satisfied at the default replyTime (embedded), so only the mode-mismatch
    // message fires — the sp3+embedded rule is scoped to mode: 'twr' precisely to avoid this ever
    // colliding with m2m's own unconditional "replyTime must be embedded" rule.
    const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: 'm2m', method: 'ss', sp3: true }
    const r = ScenarioSchema.safeParse(uwbScenario(m2mNodes(3), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/改成 deferred/)
      expect(msg).not.toMatch(/改成 embedded/)
    }
  })

  it("replyTime 'embedded': refused, and the message explains why rather than just refusing", () => {
    const cfg = sp3Cfg({ replyTime: 'embedded' })
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).not.toMatch(/^不支持$/)
      expect(msg).not.toMatch(/^暂不支持$/)
      expect(msg).toMatch(/PHR/)
      expect(msg).toMatch(/载荷/)
      expect(msg).toMatch(/改成 deferred/)
    }
  })

  it("replyTime 'fixed': refused, with its own reason (nothing ever goes on the air to defer)", () => {
    const cfg = sp3Cfg({ replyTime: 'fixed', method: 'ss' })
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/约定/)
      expect(msg).toMatch(/改成 deferred/)
    }
  })

  it("replyTime 'deferred': the only shape sp3 accepts", () => {
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), sp3Cfg({ replyTime: 'deferred' }))).success)
      .toBe(true)
  })

  it('contention: refused with its own remedy, not the generic deferred+contention one', () => {
    const cfg = sp3Cfg({ schedule: 'contention', method: 'ss' })
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      // The generic rule's remedy ("change replyTime to embedded or fixed") must not appear: both
      // are themselves forbidden once sp3 is on, which is exactly the loop this scoping avoids.
      expect(msg).not.toMatch(/改成 embedded 或 fixed/)
      expect(msg).toMatch(/抽/)
      expect(msg).toMatch(/schedule 改成 time/)
    }
    const timeScheduled: UwbSessionCfg = { ...cfg, schedule: 'time' }
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), timeScheduled)).success).toBe(true)
  })

  it('a non-sp3 session still gets the generic contention+deferred refusal, unchanged', () => {
    const cfg: UwbSessionCfg = {
      ...DEFAULT_UWB_SESSION, method: 'ss', schedule: 'contention', replyTime: 'deferred', sp3: false,
    }
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/改成 embedded 或 fixed/)
    }
  })

  it('RAOA requested with aoa off: refused, and says what aoa is for', () => {
    const cfg = sp3Cfg({ srrr: { raoa: true, rrtt: false }, aoa: false })
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/到达角/)
      expect(msg).toMatch(/aoa 打开/)
    }
  })

  it('RAOA requested with aoa on: legal', () => {
    const cfg = sp3Cfg({ method: 'ss', srrr: { raoa: true, rrtt: false }, aoa: true })
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
  })

  it('RRTT alone, aoa off: legal — RRTT does not depend on aoa', () => {
    const cfg = sp3Cfg({ method: 'ss', srrr: { raoa: false, rrtt: true }, aoa: false })
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
  })

  it.each([
    { raoa: true, rrtt: false, aoa: true },
    { raoa: false, rrtt: true, aoa: false },
    { raoa: true, rrtt: true, aoa: true },
  ])('refuses an SRRR request outside SS-TWR: %o', (bits) => {
    // Task 2 left `method` vs `srrr.rrtt` open; fix round 1 of task 3 is the answer, and it covers
    // both bits. The frames that answer them are the deferred SS shape's own: the bearing rides the
    // responder's follow-up message (§10.29.6.3) and the round trip the initiator's own measurement
    // report (design §4.1). A DS round's report phase is the double-sided exchange's own — nothing
    // in it grows by a bearing, and its responder's report already carries a round-trip time
    // whatever SRRR says — so either bit there is a request the engine would accept and provably
    // never answer, which is the `contention` + `rmnr` trap again.
    const cfg = sp3Cfg({ method: 'ds', srrr: { raoa: bits.raoa, rrtt: bits.rrtt }, aoa: bits.aoa })
    const r = ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg))
    expect(r.success).toBe(false)
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join('\n')
      expect(msg).toMatch(/DS-TWR/)
      expect(msg).toMatch(/method 改成 ss/)
    }
    // …and the identical session in SS-TWR, which is where those frames exist, is legal.
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), { ...cfg, method: 'ss' })).success).toBe(true)
  })

  it('srrr at both bits off is legal in both methods: nothing is requested, so nothing is unanswered', () => {
    for (const method of ['ss', 'ds'] as const) {
      const cfg = sp3Cfg({ method, srrr: { raoa: false, rrtt: false } })
      expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success, method).toBe(true)
    }
  })

  it('srrr at both bits off is still legal: the base reply time is reported regardless (no inert trap)', () => {
    const cfg = sp3Cfg({ srrr: { raoa: false, rrtt: false } })
    expect(ScenarioSchema.safeParse(uwbScenario(twoAnchorsOneTag(), cfg)).success).toBe(true)
  })

  describe('the RCM\'s own SRRR content can outgrow the PSDU cap before uwbMaxAnchors would refuse', () => {
    // `uwbMaxAnchors` has never heard of SRRR, so its own cap (the Poll alone) sits above the real
    // one once every responder's RCM carries a 3-octet SRRR IE too. Both numbers are computed, not
    // guessed, so this test keeps meaning whatever either function's own arithmetic becomes.
    const pollOnlyCap = uwbMaxAnchors('twr', 'ss', 'deferred', 'time')
    // The lowest anchor count whose Poll + SRRR content first outgrows the PSDU cap.
    let srrrCap = 0
    for (let n = 1; n <= pollOnlyCap; n++) {
      if (uwbPollBytes(n, 'time') + srrrIeBytes(n) > UWB_MAX_PSDU_BYTES) break
      srrrCap = n
    }

    it('the SRRR cap really is tighter than the Poll-only cap (otherwise this test proves nothing)', () => {
      expect(srrrCap).toBeLessThan(pollOnlyCap)
    })

    it('fits exactly at the SRRR cap', () => {
      const cfg = sp3Cfg({ method: 'ss' })
      const r = ScenarioSchema.safeParse(uwbScenario(anchorsAnd1Tag(srrrCap), cfg))
      expect(r.success).toBe(true)
    })

    it('one more anchor overflows the PSDU cap, though uwbMaxAnchors alone would still allow it', () => {
      const over = srrrCap + 1
      expect(over).toBeLessThanOrEqual(pollOnlyCap) // otherwise uwbMaxAnchors's own rule would fire instead
      const cfg = sp3Cfg({ method: 'ss' })
      const r = ScenarioSchema.safeParse(uwbScenario(anchorsAnd1Tag(over), cfg))
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        expect(msg).toMatch(/SRRR/)
        expect(msg).toMatch(/PSDU/)
      }
    })

    it('the same anchor count is fine once sp3 is off', () => {
      const over = srrrCap + 1
      const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, method: 'ss', replyTime: 'deferred', sp3: false }
      expect(ScenarioSchema.safeParse(uwbScenario(anchorsAnd1Tag(over), cfg)).success).toBe(true)
    })
  })

  /**
   * The contradiction sweep task-2-brief.md asks for: every (mode, replyTime, schedule)
   * combination this slice touches, checked that no issue in one parse prescribes a remedy for a
   * field that another issue in the *same* parse forbids. 'deferred' is sp3's only legal
   * replyTime, so the interesting rows are the ones that are not supposed to be legal.
   */
  type Cell = {
    mode: UwbSessionCfg['mode']
    replyTime: UwbSessionCfg['replyTime']
    schedule: UwbSessionCfg['schedule']
    expect: 'ok' | { notContains: RegExp[] }
  }

  const TABLE: Cell[] = [
    { mode: 'twr', replyTime: 'deferred', schedule: 'time', expect: 'ok' },
    { mode: 'twr', replyTime: 'embedded', schedule: 'time', expect: { notContains: [/改成 embedded/] } },
    // method forced to 'ss' below for every 'fixed' row: DS-TWR has no 'fixed' shape at all (its
    // own pre-existing, sp3-unrelated rule), and that rule's remedy legitimately offers "改成
    // embedded" as one of *its* alternatives — not a collision with sp3's own rules, just a
    // different rule this sweep is not about. Using 'ss' keeps this table about sp3 alone.
    { mode: 'twr', replyTime: 'fixed', schedule: 'time', expect: { notContains: [/改成 embedded/] } },
    { mode: 'twr', replyTime: 'deferred', schedule: 'contention', expect: { notContains: [/改成 embedded 或 fixed/] } },
    { mode: 'twr', replyTime: 'embedded', schedule: 'contention', expect: { notContains: [/改成 embedded 或 fixed/] } },
    { mode: 'm2m', replyTime: 'embedded', schedule: 'time', expect: { notContains: [/改成 deferred/] } },
    { mode: 'm2m', replyTime: 'deferred', schedule: 'time', expect: { notContains: [] } },
  ]

  const nodesFor = (mode: UwbSessionCfg['mode']) => (mode === 'm2m' ? m2mNodes(3) : twoAnchorsOneTag())

  it.each(TABLE)(
    'no contradictory advice: $mode / $replyTime / $schedule',
    ({ mode, replyTime, schedule, expect: exp }) => {
      const cfg: UwbSessionCfg = {
        ...DEFAULT_UWB_SESSION, mode, replyTime, schedule, sp3: true,
        method: mode === 'm2m' || schedule === 'contention' || replyTime === 'fixed' ? 'ss' : DEFAULT_UWB_SESSION.method,
      }
      const r = ScenarioSchema.safeParse(uwbScenario(nodesFor(mode), cfg))
      if (exp === 'ok') {
        expect(r.success).toBe(true)
        return
      }
      expect(r.success).toBe(false)
      if (!r.success) {
        const msg = r.error.issues.map((i) => i.message).join('\n')
        for (const re of exp.notContains) expect(msg).not.toMatch(re)
      }
    },
  )
})
