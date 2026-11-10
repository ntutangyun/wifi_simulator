/**
 * Design doc `docs/superpowers/specs/2026-10-03-ssbd-design.md` §5's lower table, one test each:
 * the five `ssbd` combinations (standard §10.45 — a P802.15.4ab **draft** clause; see `phy.ts`'s
 * `ssbdBoundNs` and the design doc §0.1) that the scenario schema deliberately **allows**, and
 * that therefore have to be proved non-empty by running a round and reading its records. Three
 * features on this branch have shipped as a configuration that was legal and provably changed
 * nothing, which is how a feature comes to look finished; §5 named these five in advance.
 *
 * `tests/model/ssbd-scenario.test.ts` holds §5's upper table (the four refusals) and
 * `tests/uwb/ssbd-round.test.ts` the per-slot algorithm itself. This file asks only one question,
 * five times: **is the thing the switch claims to do observable?**
 *
 * **Three of the five do not hold as §5 wrote them, and the corrections are measured here rather
 * than argued.** §5.3 corrected the first (no 6 GHz Wi-Fi link: the records are *reported*, not
 * absent) and retired "byte-identical" everywhere in favour of what Task 3 could prove. Two more
 * are corrected by this file, each where its own test says so:
 *   - **the first combination's backoff is not identically zero** — with no mediator every CCA is
 *     clear, so no *deferral* ever happens (`nb` is 0 throughout), but §10.45 draws its backoff
 *     *before* the first CCA and that draw is still paid;
 *   - **the fourth combination cannot be built at all** — a one-to-many POLL whose window has no
 *     room is refused by `uwbNbSlotFitNs`, at the schema **and** inside `UwbNetwork`, so the
 *     negative slack §4.2 calls "a real configuration" is unreachable; the behaviour it was named
 *     for (sensing happened, waiting did not) is reachable one step later and is pinned there;
 *   - **the fifth combination cannot occur in one run** — `mode: 'mms'` refuses
 *     `schedule: 'contention'` and every other mode refuses `ssbd`, both from before this slice,
 *     so "they must not eat each other" is proved as disjointness instead.
 *
 * **The instruments, said out loud.** Four, and which one a claim is made on matters:
 *   - a **`Simulation` of a scenario with no Wi-Fi node at all**, parsed through the real
 *     `ScenarioSchema`. `Simulation` builds its `Spectrum` only for a 6 GHz link whose width
 *     overlaps the narrowband channel list, so this scene's `spectrum` is `null` — which the
 *     first test checks *before* it reads a record, because that absence is the premise;
 *   - a **hand-driven `UwbNetwork`** with one `Spectrum` emission parked over the control channel
 *     at **0 dBm EIRP** for the whole run (the sibling file's instrument, and its reasoning: that
 *     reads above the energy-detection threshold at every node, so every CCA is busy, and still
 *     far enough below a narrowband frame's own received power that no frame is lost to it);
 *   - the **schema itself**, for the two combinations that turn out to be refused — each refusal
 *     localised by flipping one switch at a time rather than by matching its message;
 *   - `nbSlotSlackNs` / `uwbNbSlotFitNs` / `ssbdBoundNs` / `mmsLayout` **called directly**, for
 *     every bound. Nothing below types a cap or a threshold as a literal.
 */
import { describe, it, expect } from 'vitest'
import { EventQueue } from '../../src/engine/events'
import { Rng } from '../../src/engine/rng'
import { Simulation } from '../../src/engine/simulation'
import { Spectrum, wifiToUwbPathLossDb } from '../../src/engine/spectrum'
import { makeEmitter, type TLRecord } from '../../src/model/records'
import {
  DEFAULT_UWB_SESSION, ScenarioSchema, UwbMmsSchema, nonht,
  type NodeCfg, type Scenario, type UwbMmsCfg, type UwbSessionCfg, type UwbSsbdCfg,
} from '../../src/model/scenario'
import { mmsLayout, mmsSlotsPerMs, NB_WINDOW_SLOTS } from '../../src/uwb/mms'
import {
  nbBand, nbLbtRequired, nbOtmPollBytes, nbPpduNs,
  NB_PHY_CCA_DURATION_US, NB_LBT_THRESHOLD_DBM, NB_REPORT_BYTES,
} from '../../src/uwb/nb'
import {
  nbSlotSlackNs, rstuNs, ssbdBoundNs, uwbNbSlotFitNs,
  UWB_TX_POWER_DBM,
} from '../../src/uwb/phy'
import { UwbNetwork } from '../../src/uwb/network'

const MS = 1_000_000
const US = 1_000
/** The session's own ranging slot: the shortest an MMS round may legally use. */
const SLOT_RSTU = 600
const SLOT_NS = rstuNs(SLOT_RSTU)
/** The control channel every run below hops to — the session default, and a UNII-3 one, where
 * the regulation does **not** oblige a device to listen first (`nbLbtRequired(…, 'auto')`). */
const NB_CHANNEL = DEFAULT_UWB_SESSION.mms.nbChannels[0]
const BLOCK_NS = 200 * MS
const NB_KINDS = new Set(['nbPoll', 'nbResp', 'nbReport'])
/** Busy for the energy detect, harmless to a narrowband frame — see the file comment. */
const BUSY_EIRP_DBM = 0

const of = <T extends TLRecord['type']>(rs: TLRecord[], type: T, node?: string): Extract<TLRecord, { type: T }>[] =>
  rs.filter((r) => r.type === type && (node === undefined || (r as { node?: string }).node === node)) as never

const nbTx = (rs: TLRecord[], node?: string): Extract<TLRecord, { type: 'TX_START' }>[] =>
  of(rs, 'TX_START', node).filter((r) => NB_KINDS.has(r.frame.kind))

/** One record per narrowband transmit slot, keyed the way §10.39.8.3 counts them: a device, a
 * block, a round and a slot. "Per slot, not per block" is a statement about this key. */
const slotKey = (r: { node: string; block: number; round: number; slot: number }): string =>
  `${r.node}|${r.block}|${r.round}|${r.slot}`

const uwbNode = (id: string, x: number, y: number, role: 'anchor' | 'tag', ppm: number): NodeCfg => ({
  id, kind: 'uwb', name: id, pos: { x, y, z: 1 }, txPowerDbm: UWB_TX_POWER_DBM,
  profiles: ['idle'], caps: { ...nonht }, uwb: { role, ppm },
})

const ANCHORS = [
  uwbNode('anc-1', 1, 1, 'anchor', 5),
  uwbNode('anc-2', 4, 1, 'anchor', -7),
  uwbNode('anc-3', 1, 4, 'anchor', 11),
  uwbNode('anc-4', 7, 1, 'anchor', 3),
  // 2026-11-11: the one-to-many cap rose to four (12 + 3N octets), so one past it needs a fifth.
  uwbNode('anc-5', 7, 4, 'anchor', -2),
]
const TAG = uwbNode('tag-1', 4, 4, 'tag', -15)

/**
 * Every record but the SSBD ones, with the instant dropped and **grouped by the device it belongs
 * to** — §5.3's first provable clause, "the same devices doing the same things in the same order".
 * The instants are compared separately, against a computed bound, which is §5.3's second clause;
 * `UWB_RANGE` field for field is its third. Per node rather than one flat list because a
 * transmission that moves inside its own window can fall after the far end's listen window opened
 * in that same slot instead of before it — the global order moves, each node's own does not.
 */
const shape = (rs: TLRecord[]): Record<string, unknown[]> => {
  const by: Record<string, unknown[]> = {}
  for (const r of rs) {
    if (r.type === 'UWB_SSBD') continue
    const { t, seq, ...rest } = r as { t: number; seq?: number; node?: string }
    const key = rest.node ?? '—'
    by[key] = [...(by[key] ?? []), rest as unknown]
  }
  return by
}

/** `UWB_RANGE` with only the instant dropped: §5.3's third clause is field for field. */
const ranges = (rs: TLRecord[]): unknown[] =>
  of(rs, 'UWB_RANGE').map(({ t, seq, ...rest }) => rest as unknown)

interface RunOpts {
  /** Parsed through the real `UwbMmsSchema`, so no run below is a configuration the editor would
   * refuse outright. `undefined` leaves the feature off. */
  ssbd?: Partial<UwbSsbdCfg>
  nbLbt?: UwbMmsCfg['nbLbt']
  /** EIRP of the emission parked over the control channel; `null` leaves the air empty. */
  eirpDbm?: number | null
  anchors?: number
  oneToMany?: boolean
  runNs?: number
}

/**
 * Anchors and one tag driven by hand, so a `Spectrum` can be built around them: the simulator
 * makes its own and a CCA has nothing to read without one. The same harness as
 * `ssbd-round.test.ts`'s, duplicated rather than shared because that file is another task's
 * deliverable; the two measure the same engine and agree on every number they both read.
 */
function run(o: RunOpts = {}): TLRecord[] {
  const nodes = [...ANCHORS.slice(0, o.anchors ?? 3), TAG]
  const q = new EventQueue()
  let now = 0
  const recs: TLRecord[] = []
  const emit = makeEmitter((x) => recs.push(x as TLRecord))
  const sp = new Spectrum([], q, () => now)
  const eirpDbm = o.eirpDbm ?? null
  if (eirpDbm !== null) {
    const band = nbBand(NB_CHANNEL)
    sp.emit('wifi', {
      txId: 'ap', eirpDbm, bandLoMhz: band.lo - 10, bandHiMhz: band.hi + 10,
      pos: { x: 5, y: 5, z: 1 }, lossDb: wifiToUwbPathLossDb,
    })
  }
  const mms = UwbMmsSchema.parse({
    ...DEFAULT_UWB_SESSION.mms,
    nbLbt: o.nbLbt ?? 'on',
    ...(o.oneToMany ? { oneToMany: true } : {}),
    ...(o.ssbd ? { ssbd: o.ssbd } : {}),
  })
  const cfg: UwbSessionCfg = {
    ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: SLOT_RSTU, aoa: false, nlos: false, mms,
  }
  new UwbNetwork(q, () => now, nodes, [], cfg, new Rng(7), emit, sp, 7)
  for (;;) {
    const t = q.peekTime()
    if (t === null || t > (o.runNs ?? BLOCK_NS + 10 * MS)) break
    const e = q.pop()!
    now = e.t
    e.fn()
  }
  return recs
}

/** A whole scenario, through the real `ScenarioSchema`: three anchors, one tag and — the point of
 * the first test — **no Wi-Fi node at all**, so nothing in the scene can build a mediator. */
function scene(uwb: Record<string, unknown>, anchors = 3): unknown {
  return {
    rooms: [{ x: 0, y: 0, w: 30, h: 30, name: 'Hall' }], walls: [], servers: [], seed: 7,
    rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    nodes: [...ANCHORS.slice(0, anchors), TAG], uwb,
  }
}

const mmsSession = (mms: Record<string, unknown>, rest: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: SLOT_RSTU, ...rest,
  mms: { ...DEFAULT_UWB_SESSION.mms, ...mms },
})

/** The five fields at the draft's own defaults — what `ssbd: {}` parses to. */
const DEFAULTS: UwbSsbdCfg = UwbMmsSchema.parse({ ...DEFAULT_UWB_SESSION.mms, ssbd: {} }).ssbd!
/** The largest wait the *first* attempt of any slot can draw, in ns: `random(BF)` is inclusive of
 * both ends, so attempt 0 draws at most `minBf` units (`ssbdBoundNs`'s own first term). */
const firstDrawMaxNs = (cfg: UwbSsbdCfg): number => cfg.minBf * cfg.unitBackoffUs * US
/** One CCA: phyCcaDuration, which every narrowband CCA now lasts (2026-11-11, audit #20). */
const CCA_NS = NB_PHY_CCA_DURATION_US * US

describe('§5 的五个组合，每个都要证明它不是空的', () => {
  // ---------------------------------------------------------------------------------------------
  // §5 (1): no 6 GHz Wi-Fi link in the scene.
  // ---------------------------------------------------------------------------------------------
  describe('1. 场景里没有 6 GHz Wi-Fi 链路', () => {
    const noWifi = (ssbd: Partial<UwbSsbdCfg> | null): Scenario =>
      ScenarioSchema.parse(scene(mmsSession(ssbd ? { ssbd } : {})))
    // Short of block 3's POLL: with SSBD it goes out a CCA later, past the end of the window.
    const RUN_NS = 3 * BLOCK_NS - 1

    it('没有中介也每个时隙据实报一条：结果都是 idle，而退避并非恒为 0', () => {
      // The premise, checked before any record is read: `Simulation` builds a `Spectrum` only for
      // a 6 GHz link that overlaps the narrowband channel list, and this scene has no Wi-Fi node
      // at all. `lbtBusy` then returns clear with `foreignDbm = -Infinity` — not a reading, the
      // absence of one.
      const sim = new Simulation(noWifi({}))
      expect(sim.spectrum).toBeNull()
      // …and the session is on its own default `nbLbt`, which on this channel does not oblige
      // anybody to listen. The SSBD path deliberately does not consult that obligation
      // (§10.39.8.3's closing sentence), so this scene is the weakest one the feature can be
      // asked to show up in: no mediator, and no regulation either.
      expect(DEFAULT_UWB_SESSION.mms.nbLbt).toBe('auto')
      expect(nbLbtRequired(NB_CHANNEL, 'auto')).toBe(false)

      const on = [...sim.runUntil(RUN_NS).records] as TLRecord[]
      const recs = of(on, 'UWB_SSBD')
      // **This is the shape the branch wants, and it is why §5's own "assert `UWB_SSBD` is empty"
      // was replaced.** An inert configuration that records nothing looks exactly like a feature
      // that is working; one that records `idle` in every slot it had a message for says, in the
      // timeline, that it sensed and dodged nothing. The ineffective configuration is *reported*.
      expect(recs.length).toBeGreaterThan(0)
      expect(new Set(recs.map(slotKey)).size).toBe(recs.length)
      expect([...new Set(recs.map((r) => r.outcome))]).toEqual(['idle'])
      for (const r of recs) {
        // Every CCA was clear, so the algorithm ended on its first one: NB never advanced and BF
        // never rose. `nb === 0` is the zero this scene really has.
        expect(r.nb).toBe(0)
        expect(r.bf).toBe(DEFAULTS.minBf)
        expect(r.foreignDbm).toBe(-Infinity)
        expect(r.thresholdDbm).toBe(NB_LBT_THRESHOLD_DBM)
        expect(r.backoffNs).toBeLessThanOrEqual(firstDrawMaxNs(DEFAULTS))
      }
      // **The correction to §5.3's "退避恒为 0".** §10.45 draws its backoff *before* the first
      // CCA, so a clear channel does not make the wait zero — it makes the *deferral* zero. The
      // draw is uniform over 0…BF inclusive, and both ends of that are present here, which is
      // also the inclusivity `ssbdBoundNs`'s tightness rests on.
      const drawn = new Set(recs.map((r) => r.drawnUnits))
      expect(drawn).toEqual(new Set([0, DEFAULTS.minBf]))
      expect(recs.some((r) => r.backoffNs > 0)).toBe(true)
      expect(Math.max(...recs.map((r) => r.backoffNs))).toBe(firstDrawMaxNs(DEFAULTS))
    })

    it('两次运行逐节点同序、位移不过算出来的上界、UWB_RANGE 逐字段相同', () => {
      // §5.3's three provable clauses, in place of the "byte-identical" that contradicted them.
      const on = [...new Simulation(noWifi({})).runUntil(RUN_NS).records] as TLRecord[]
      const off = [...new Simulation(noWifi(null)).runUntil(RUN_NS).records] as TLRecord[]
      expect(shape(on)).toEqual(shape(off))
      expect(ranges(on)).toEqual(ranges(off))
      expect(ranges(on).length).toBeGreaterThan(0)
      // The per-block path is not taken, and takes nothing: with no mediator `nbClear` answers
      // clear too, so the off run has no `UWB_NB_LBT` either and the two differ only in what SSBD
      // reports and by how far inside its own window each message went out.
      expect(of(on, 'UWB_NB_LBT')).toEqual([])
      expect(of(off, 'UWB_SSBD')).toEqual([])
      const a = nbTx(on)
      const b = nbTx(off)
      expect(a).toHaveLength(b.length)
      expect(a.length).toBeGreaterThan(0)
      // Every message goes out one CCA plus the drawn backoff later (2026-11-11: the CCA lasts
      // phyCcaDuration, 128 µs, where it used to be an instantaneous reading).
      for (const [i, x] of a.entries()) {
        expect(x.node).toBe(b[i].node)
        expect(x.t - b[i].t).toBeGreaterThanOrEqual(CCA_NS)
        expect(x.t - b[i].t).toBeLessThanOrEqual(CCA_NS + firstDrawMaxNs(DEFAULTS))
      }
      expect(Math.max(...a.map((x, i) => x.t - b[i].t))).toBeGreaterThan(CCA_NS)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // §5 (2): maxBackoffs 0 with txOnEnd — the draft's own hole, I-169, CRG Rejected.
  // ---------------------------------------------------------------------------------------------
  describe('2. maxBackoffs: 0 配 txOnEnd: true', () => {
    const CFG: UwbSsbdCfg = UwbMmsSchema.parse({
      ...DEFAULT_UWB_SESSION.mms, ssbd: { maxBackoffs: 0 },
    }).ssbd!

    it('一次 CCA，结果不改变任何事：允许，并钉住它', () => {
      expect(CFG.maxBackoffs).toBe(0)
      expect(CFG.txOnEnd).toBe(true)
      const on = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: { maxBackoffs: 0 } })
      const recs = of(on, 'UWB_SSBD')
      expect(recs.length).toBeGreaterThan(0)
      // `maxBackoffs + 1` CCAs per slot, which here is exactly one: NB is already at its cap on
      // the first check, so the end action decides immediately. One record per slot, and `nb`
      // reports how many checks preceded the ending one — zero.
      expect(new Set(recs.map(slotKey)).size).toBe(recs.length)
      for (const r of recs) {
        expect(r.nb).toBe(CFG.maxBackoffs)
        expect(r.bf).toBe(CFG.minBf)
        expect(r.drawnUnits).toBeLessThanOrEqual(CFG.minBf)
      }
      // The hole itself, visible as data rather than as a comment: some of these CCAs read the
      // channel **busy** and the message went out anyway, because the end action is TxOnEnd and
      // there is no backoff left to take. Nothing is ever refused.
      expect(new Set(recs.map((r) => r.outcome))).toEqual(new Set(['idle', 'txOnEnd']))
      const busy = recs.filter((r) => r.outcome === 'txOnEnd')
      expect(busy.length).toBeGreaterThan(0)
      for (const r of busy) expect(r.foreignDbm).toBeGreaterThanOrEqual(NB_LBT_THRESHOLD_DBM)
    })

    it('与 nbLbt: off 逐节点同序、位移在上界内、UWB_RANGE 逐字段相同', () => {
      // §5.3 again: "byte-identical to `nbLbt: 'off'`" cannot be asserted of a running SSBD
      // configuration, because the backoff is a wait and the transmission visibly moves. The
      // provable form, and with `maxBackoffs: 0` the bound is as small as it ever gets.
      const on = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: { maxBackoffs: 0 } })
      const off = run({ eirpDbm: BUSY_EIRP_DBM, nbLbt: 'off' })
      expect(shape(on)).toEqual(shape(off))
      expect(ranges(on)).toEqual(ranges(off))
      expect(ranges(on).length).toBeGreaterThan(0)
      const a = nbTx(on)
      const b = nbTx(off)
      expect(a).toHaveLength(b.length)
      expect(a.length).toBeGreaterThan(0)
      // **What the bound actually is.** One attempt: one CCA of phyCcaDuration (128 µs) and at most
      // `minBf × unitBackoffUs` of backoff — which is exactly `ssbdBoundNs` at maxBackoffs 0.
      const disp = a.map((x, i) => x.t - b[i].t)
      expect(Math.max(...disp)).toBeLessThanOrEqual(CCA_NS + firstDrawMaxNs(CFG))
      expect(Math.min(...disp)).toBeGreaterThanOrEqual(CCA_NS)
      expect(CCA_NS + firstDrawMaxNs(CFG)).toBe(ssbdBoundNs(CFG))
    })

    it('它仍然不是今天那条按块的规则：那条把整块都吃掉了', () => {
      // The hole is a hole in the *draft*, not an inert switch: against the same busy channel the
      // shipped per-block rule loses every cycle of the block, and this configuration loses none.
      const on = run({ eirpDbm: BUSY_EIRP_DBM, ssbd: { maxBackoffs: 0 } })
      const perBlock = run({ eirpDbm: BUSY_EIRP_DBM })
      expect(of(perBlock, 'UWB_RANGE')).toEqual([])
      expect(of(on, 'UWB_RANGE').length).toBeGreaterThan(0)
      expect(of(on, 'UWB_NB_LBT')).toEqual([])
      expect(of(perBlock, 'UWB_SSBD')).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------------------------
  // §5 (3): txOnEnd false against a persistently busy channel — the one that matters, because the
  // observable result looks exactly like today's per-block silencing.
  // ---------------------------------------------------------------------------------------------
  describe('3. txOnEnd: false 对着持续忙的信道', () => {
    const BLOCKS = 3
    const RUN_NS = BLOCKS * BLOCK_NS - 1
    const fail = (): TLRecord[] =>
      run({ eirpDbm: BUSY_EIRP_DBM, ssbd: { txOnEnd: false }, runNs: RUN_NS })
    const perBlock = (): TLRecord[] => run({ eirpDbm: BUSY_EIRP_DBM, runNs: RUN_NS })

    it('两条路在结果上确实看不出分别——所以这是测试要分开的东西', () => {
      // Everything a reader would look at first is the same, which is the whole risk: the switch
      // could be doing nothing at all and this is what it would look like.
      const f = fail()
      const p = perBlock()
      expect(nbTx(f)).toEqual([])
      expect(nbTx(p)).toEqual([])
      expect(of(f, 'UWB_RANGE')).toEqual([])
      expect(of(p, 'UWB_RANGE')).toEqual([])
      expect(of(f, 'UWB_POSITION')).toEqual([])
      expect(of(p, 'UWB_POSITION')).toEqual([])
      // **And one of §5's three promised discriminators does not exist.** §5 said "the anchors'
      // `UWB_TIMEOUT` lands differently". Measured, it does not: in both runs the tag's POLL never
      // goes out, so every anchor's wait expires on the same slot of the same round at the same
      // instant, naming the same peer and the same expected frame. Pinned as an equality so the
      // next reader does not go looking for a difference that is not there — the separation below
      // rests on the other two, which do hold.
      const timeouts = (rs: TLRecord[]): unknown[] =>
        of(rs, 'UWB_TIMEOUT').map(({ seq, ...rest }) => rest as unknown)
      expect(timeouts(f).length).toBeGreaterThan(0)
      expect(timeouts(f)).toEqual(timeouts(p))
    })

    // 2026-11-11 (audit #19): without SSBD the device runs CSMA-CA, also per transmission slot
    // (4ab draft §10.39.8.3). It used to latch a busy reading for the rest of the block.
    it('不开 SSBD 时是 CSMA-CA：每个时隙各自接入、各自失败，不再封住整块', () => {
      const p = perBlock()
      const lbt = of(p, 'UWB_NB_LBT')
      expect(of(p, 'UWB_SSBD')).toEqual([])
      // Every round of every block tries its POLL again, in its own slot.
      const rounds = (b: number): number[] =>
        [...new Set(lbt.filter((r) => r.block === b).map((r) => r.round))].sort((x, y) => x - y)
      for (let b = 0; b < BLOCKS; b++) expect(rounds(b).length).toBeGreaterThan(1)
      // …and every attempt ends in a failure or in a window with no room left: nothing is sent.
      const ends = lbt.filter((r) => r.outcome !== 'retry')
      expect(ends.length).toBeGreaterThan(0)
      for (const e of ends) expect(['fail', 'noRoom']).toContain(e.outcome)
      expect(nbTx(p)).toEqual([])
    })

    it('每个时隙一条结束记录：窗口装得下几次 128 µs 的 CCA，就感知几次', () => {
      const cfg = UwbMmsSchema.parse({ ...DEFAULT_UWB_SESSION.mms, ssbd: { txOnEnd: false } }).ssbd!
      const f = fail()
      const recs = of(f, 'UWB_SSBD')
      expect(of(f, 'UWB_NB_LBT')).toEqual([])
      expect(recs.length).toBeGreaterThan(0)
      // One record per narrowband transmit slot, every one of them an ending, and nothing sent.
      expect(new Set(recs.map(slotKey)).size).toBe(recs.length)
      for (const r of recs) expect(['failOnEnd', 'noRoom']).toContain(r.outcome)
      // 2026-11-11 (audit #20): six CCAs of 128 µs (maxBackoffs + 1) do not fit a POLL's 424 µs of
      // room, so the window runs out first: every slot here ends `noRoom` after at most three
      // busy CCAs — the bound `ssbdBoundNs` (788 µs) is now longer than the window itself.
      expect(ssbdBoundNs(cfg)).toBeGreaterThan(nbSlotSlackNs(SLOT_NS, NB_REPORT_BYTES))
      expect([...new Set(recs.map((r) => r.outcome))]).toEqual(['noRoom'])
      for (const r of recs) expect(r.nb).toBeLessThanOrEqual(Math.floor(nbSlotSlackNs(SLOT_NS, 12) / CCA_NS))
      // Per slot, like the CSMA-CA path: every round of every block carries records.
      const roundsOf = (rs: { block: number; round: number }[], b: number): number[] =>
        [...new Set(rs.filter((r) => r.block === b).map((r) => r.round))].sort((x, y) => x - y)
      for (let b = 0; b < BLOCKS; b++) expect(roundsOf(recs, b).length).toBeGreaterThan(1)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // §5 (4): oneToMany with enough responders that the slack goes negative.
  // ---------------------------------------------------------------------------------------------
  describe('4. oneToMany: true 且响应方够多', () => {
    const OTM = UwbMmsSchema.parse({ ...DEFAULT_UWB_SESSION.mms, oneToMany: true })
    /** The most responders one round may hold at this slot length, from the engine's own guard
     * rather than from the design doc's prose. */
    const CAP = ((): number => {
      let r = 1
      while (NB_WINDOW_SLOTS * SLOT_NS >= uwbNbSlotFitNs(OTM, r + 1)) r++
      return r
    })()
    const POLL_SLOT = mmsLayout(OTM, CAP, mmsSlotsPerMs(SLOT_RSTU)).pollSlot()
    /** What the one-to-many POLL's own window leaves at that cap — the smallest room any window
     * of a legal round has, and the reason this is where the clamp shows up. */
    const CAP_SLACK_NS = nbSlotSlackNs(SLOT_NS, nbOtmPollBytes(CAP))

    it('§4.2 的负余量确实是负的——而它在两层上都被拒，所以 max(0, …) 这一支到不了', () => {
      // The arithmetic §4.2 states, recomputed: one responder past the cap, the POLL's PPDU is
      // already longer than the two slots the draft gives its window, so the unclamped slack is
      // negative and `nbSlotSlackNs` floors it at zero.
      const over = CAP + 1
      const window = NB_WINDOW_SLOTS * SLOT_NS
      expect(window - nbPpduNs(nbOtmPollBytes(over))).toBeLessThan(0)
      expect(nbSlotSlackNs(SLOT_NS, nbOtmPollBytes(over))).toBe(0)
      // **But that configuration cannot be built, which is the finding.** `uwbNbSlotFitNs` guards
      // the same window with one PPDU plus a guard interval, so zero slack always implies a
      // refusal — at the schema and again inside `UwbNetwork`, both from before this slice.
      expect(ScenarioSchema.safeParse(scene(mmsSession({ oneToMany: true, nbLbt: 'on', ssbd: {} }), over)).success)
        .toBe(false)
      expect(() => run({ anchors: over, oneToMany: true, ssbd: {} })).toThrow(/narrowband message/)
      // …and the cap itself is accepted, so the refusal is the responder count's and not the
      // mode's or the feature's.
      expect(ScenarioSchema.safeParse(scene(mmsSession({ oneToMany: true, nbLbt: 'on', ssbd: {} }), CAP)).success)
        .toBe(true)
      // Swept rather than argued: over every legal MMS slot length and every responder count the
      // layout accepts, a window with no room is always a window the engine refuses — and the
      // least room a round that *is* accepted can have is a whole positive amount, never zero.
      let zeros = 0
      let minAccepted = Infinity
      for (let rstu = 300; rstu <= 20 * SLOT_RSTU; rstu += 300) {
        const slotNs = rstuNs(rstu)
        for (let r = 1; r <= 24; r++) {
          for (const bytes of [NB_REPORT_BYTES, nbOtmPollBytes(r)]) {
            const fit = uwbNbSlotFitNs(bytes === NB_REPORT_BYTES ? DEFAULT_UWB_SESSION.mms : OTM, r)
            const slack = nbSlotSlackNs(slotNs, bytes)
            const refused = NB_WINDOW_SLOTS * slotNs < fit
            if (slack === 0) {
              zeros++
              expect(refused, `${rstu} RSTU / ${r} responders`).toBe(true)
            } else if (!refused) minAccepted = Math.min(minAccepted, slack)
          }
        }
      }
      expect(zeros).toBeGreaterThan(0)
      expect(minAccepted).toBeGreaterThan(0)
    })

    // 2026-11-11: the one-to-many POLL is 12 + 3N octets, so the cap rose to four responders and
    // its window keeps 40 µs — less than one 128 µs CCA (audit #20). A legal configuration whose
    // POLL can never be sent under SSBD: pinned here, and reported by a record in every round.
    it('上限处 POLL 的窗口装不下一次 CCA：每一次都是 noRoom，并且记录在案', () => {
      expect(CAP).toBe(4)
      expect(CAP_SLACK_NS).toBeLessThan(CCA_NS)
      const rs = run({ anchors: CAP, oneToMany: true, ssbd: {} })
      const poll = of(rs, 'UWB_SSBD').filter((r) => r.node === TAG.id && r.slot === POLL_SLOT)
      expect(poll.length).toBeGreaterThan(0)
      expect([...new Set(poll.map((r) => r.outcome))]).toEqual(['noRoom'])
      // The first sub-round's POLL (the one with the list) never goes out; the later sub-rounds'
      // twelve-octet POLLs do, and name nobody, so no responder can act on them.
      expect(nbTx(rs, TAG.id).filter((r) => r.frame.kind === 'nbPoll' && r.frame.uwb!.slot === POLL_SLOT)).toEqual([])
    })

    it('少一个应答方，窗口就装得下一次 CCA：清净的信道上 POLL 照常发出', () => {
      const r = CAP - 1
      expect(nbSlotSlackNs(SLOT_NS, nbOtmPollBytes(r))).toBeGreaterThanOrEqual(CCA_NS)
      const rs = run({ anchors: r, oneToMany: true, ssbd: {} })
      const poll = of(rs, 'UWB_SSBD').filter((x) => x.node === TAG.id && x.slot === POLL_SLOT)
      expect(poll.length).toBeGreaterThan(0)
      for (const x of poll) expect(['idle', 'clamped']).toContain(x.outcome)
      expect(nbTx(rs, TAG.id).filter((x) => x.frame.kind === 'nbPoll' && x.frame.uwb!.slot === POLL_SLOT).length).toBe(poll.length)
    })
  })

  // ---------------------------------------------------------------------------------------------
  // §5, the extra one: ssbd alongside schedule 'contention'.
  // ---------------------------------------------------------------------------------------------
  describe('5. ssbd 与 schedule: contention', () => {
    const twr = (rest: Record<string, unknown>): unknown =>
      scene({ ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', ...rest })

    it('这两个开关进不了同一次运行——而拦住它们的两条规则都不是这一刀的', () => {
      // §5 asked for one run holding both records. There is none, and the reason is two refusals
      // that compose: a contention round is a two-way exchange, which MMS does not have, and SSBD
      // is scoped to the two clauses that send narrowband messages, which only MMS does.
      // Localised by flipping one switch at a time rather than by matching a message.
      const mmsContend = ScenarioSchema.safeParse(scene(mmsSession({ nbLbt: 'on', ssbd: {} }, { schedule: 'contention' })))
      expect(mmsContend.success).toBe(false)
      // The refusal is the schedule's, not the feature's: turning `ssbd` off does not lift it,
      // and putting the schedule back to `'time'` does.
      expect(ScenarioSchema.safeParse(scene(mmsSession({ nbLbt: 'on' }, { schedule: 'contention' }))).success).toBe(false)
      expect(ScenarioSchema.safeParse(scene(mmsSession({ nbLbt: 'on', ssbd: {} }))).success).toBe(true)
      if (!mmsContend.success) {
        for (const i of mmsContend.error.issues) expect(i.message).not.toContain('§10.45')
      }
      // …and from the other side the refusal **is** the feature's: a contention round is legal in
      // two-way ranging, and it is `ssbd` alone that is refused there.
      const twrContend = ScenarioSchema.safeParse(twr({ schedule: 'contention', mms: { ...DEFAULT_UWB_SESSION.mms, ssbd: {} } }))
      expect(twrContend.success).toBe(false)
      expect(ScenarioSchema.safeParse(twr({ schedule: 'contention' })).success).toBe(true)
      if (!twrContend.success) {
        expect(twrContend.error.issues.some((i) => i.message.includes('§10.45'))).toBe(true)
      }
    })

    it('所以「互不相吃」是用不相交来证的：各自的运行里只有自己那种记录', () => {
      // What is left of §5's intent, and it is the stronger half anyway: each rule still runs in
      // full where it belongs, and neither leaves a trace in the other's phase.
      const contend = ScenarioSchema.parse(twr({ schedule: 'contention' }))
      const cr = [...new Simulation(contend).runUntil(3 * BLOCK_NS).records] as TLRecord[]
      expect(of(cr, 'UWB_CONTEND').length).toBeGreaterThan(0)
      expect(of(cr, 'UWB_RANGE').length).toBeGreaterThan(0)
      // Nothing for SSBD to run in front of, which is exactly the refusal's own reason: a
      // two-way round sends no narrowband message at all.
      expect(nbTx(cr)).toEqual([])
      expect(of(cr, 'UWB_SSBD')).toEqual([])
      const ssbd = ScenarioSchema.parse(scene(mmsSession({ nbLbt: 'on', ssbd: {} })))
      const sr = [...new Simulation(ssbd).runUntil(3 * BLOCK_NS).records] as TLRecord[]
      expect(of(sr, 'UWB_SSBD').length).toBeGreaterThan(0)
      expect(of(sr, 'UWB_CONTEND')).toEqual([])
      expect(of(sr, 'UWB_CONTEND_COLLISION')).toEqual([])
    })
  })
})
