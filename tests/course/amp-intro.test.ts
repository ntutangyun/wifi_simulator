/**
 * Every empirical claim in the "A tag with no battery" lesson, measured against
 * the lesson's own scenario and variant. Each assertion quotes the sentence it
 * guards; standard constants are checked against the engine's exports
 * (src/engine/amp.ts, src/engine/phy.ts) rather than re-typed.
 *
 * The frame anatomy — the PPDU's parts, the three frames' octets and airtimes,
 * the padding, the rate scaling and the frame-detail decodes — moved with its
 * sentences to tests/course/amp-ppdu.test.ts, along with the 1 Mb/s round.
 */
import { describe, it, expect } from 'vitest'
import { ampIntro, ampIntroScenario } from '../../src/course/amp/amp-intro'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type NodeCfg, type Scenario } from '../../src/model/scenario'
import {
  AMP_DL_REQ_SINR_DB, AMP_PADDING_NS, AMP_PADDING_PROTECTED_NS, AMP_SIFS_NS, AMP_TAG_DL_SENS_DBM,
  AMP_UL_REQ_SINR_DB, ampUlSensDbm,
} from '../../src/engine/amp'
import { CCA_PD_DBM, ERP_2G } from '../../src/engine/phy'
import { LINK_EXTRA_LOSS_DB } from '../../src/engine/simulation'
import { buildLinkTable } from '../../src/engine/propagation'
import { rssiOn } from './rssi'
import { applyRecord, initViewState } from '../../src/model/view'
import { fmtRecord } from '../../src/ui/format'
import type { TLRecord } from '../../src/model/records'
import { isMigrated, type L10n } from '../../src/course/lessonKit'
import { OBSERVE_MINUTES, TRY_MINUTES, lessonBlocks, lessonMinutes, lessonWords } from '../../src/course/curriculum'
import { lessonStrings } from '../../src/course/readability'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS

const AP = 'ap#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g'] as const
/** Exactly the record types the prose names as absent from a tag and present at the AP. */
const CONTENTION_RECORDS = ['CCA_BUSY', 'BACKOFF_DRAW', 'IFS_START'] as const

const memo = new Map<string, TLRecord[]>()
function run(s: Scenario): TLRecord[] {
  return [...new Simulation(s).runUntil(RUN_NS).records]
}
/** Records of the base scenario (variant undefined) or a variant, memoised. */
function recs(variant?: number): TLRecord[] {
  const key = String(variant ?? 'base')
  if (!memo.has(key)) {
    const s: Scenario = variant === undefined ? ampIntro.scenario() : ampIntro.variants![variant].scenario()
    memo.set(key, run(s))
  }
  return memo.get(key)!
}
const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const aboc = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_ABOC').filter((r) => r.node === node)
const results = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_RESULT').filter((r) => r.node === node)
const countAt = (rs: TLRecord[], node: string, type: string) =>
  rs.filter((r) => 'node' in r && r.node === node && r.type === type).length

describe('amp-intro · lesson shape', () => {
  it('is written to the zero-to-hero contract', () => {
    expect(isMigrated(ampIntro)).toBe(true)
    expect(ampIntro.module).toBe(7)
    // the first lesson of the AMP track: at most four new words, and no table in the picture
    expect(ampIntro.terms!.map((t) => t.term)).toEqual(['AMP', 'tag', 'slot', 'ABOC'])
    expect(ampIntro.picture!.some((b) => b.kind === 'table')).toBe(false)
    // the reader is sent to the simulator before the mechanism is finished
    const firstWatch = ampIntro.picture!.findIndex((b) => b.kind === 'watch')
    expect(firstWatch).toBeGreaterThanOrEqual(0)
    expect(firstWatch).toBeLessThan(3)
    // it assumes Wi-Fi Tier 1 and nothing else
    expect(ampIntro.needs).toEqual(['radio-primer', 'frame-anatomy'])
  })

  it('the scenario and the variant pass the scenario schema', () => {
    expect(ampIntro.scenario()).toEqual(ampIntroScenario({ dlKbps: 250, ulKbps: 250 }))
    expect(() => ScenarioSchema.parse(ampIntro.scenario())).not.toThrow()
    for (const v of ampIntro.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

  it('fits one sitting: the spec’s bounds for a track’s first lesson, plus the split’s prose window', () => {
    // The spec's bounds: 500–1300 main-path words, and at most 1000 for a track's
    // first lesson (…/2026-09-21-course-readability-design.md, "Length and pace").
    // The three section budgets that sum to it are asserted for every migrated
    // lesson in tests/course/readability.test.ts, and printed by
    // `npx tsx scripts/lesson-dump.ts amp-intro en`.
    const raw = lessonWords(ampIntro) / 150
      + OBSERVE_MINUTES * ampIntro.observe.length + TRY_MINUTES * ampIntro.tryThis.length
    expect(lessonMinutes(ampIntro)).toBe(Math.max(5, Math.round(raw / 5) * 5))
    expect(lessonWords(ampIntro)).toBeGreaterThanOrEqual(500)
    expect(lessonWords(ampIntro)).toBeLessThanOrEqual(1000)
    expect(lessonMinutes(ampIntro)).toBeLessThanOrEqual(20)
    // the content contract's window is for the PROSE count: what the reader reads
    // before the simulator — why, outcomes, terms, picture and numbers.
    const prose = lessonWords({ ...ampIntro, observe: [], tryThis: [], quiz: [] })
    expect(prose).toBeLessThanOrEqual(1000)
    expect(lessonBlocks(ampIntro).length).toBe(ampIntro.picture!.length + ampIntro.numbers!.length)
  })

  it('every jump target occurs in the base run', () => {
    const rs = recs()
    for (const j of ampIntro.jumps) expect(rs.some(j.find), j.label.en).toBe(true)
    for (const b of ampIntro.picture!) {
      if (b.kind === 'watch' && b.jump !== undefined) expect(ampIntro.jumps[b.jump]).toBeDefined()
    }
  })

  it('every string a learner reads exists in both languages', () => {
    // One walk for every lesson test: src/course/readability.ts. `title`, the variant
    // labels and the jump labels are the chrome around a lesson, so they are added here.
    const seen: L10n[] = [
      ...lessonStrings(ampIntro), ampIntro.title,
      ...ampIntro.variants!.map((v) => v.label), ...ampIntro.jumps.map((j) => j.label),
    ]
    // a structural floor rather than a smoke bound: one string per outcome, term, block,
    // source, observation, experiment and (question + options + explanation) of a quiz,
    // plus why, the title, every variant label and every jump label.
    const floor = 2 + ampIntro.outcomes!.length + ampIntro.terms!.length + ampIntro.picture!.length
      + ampIntro.numbers!.length + (ampIntro.deeper?.length ?? 0) + ampIntro.sources!.length
      + ampIntro.observe.length + ampIntro.tryThis.length + 3 * ampIntro.quiz.length
      + ampIntro.variants!.length + ampIntro.jumps.length
    expect(seen.length).toBeGreaterThanOrEqual(floor)
    for (const l of seen) {
      expect(l.en.trim().length, l.en).toBeGreaterThan(0)
      expect(l.zh.trim().length, l.en).toBeGreaterThan(0)
      if (/[a-z]{3,}\s+[a-z]{3,}/.test(l.en)) expect(l.zh, l.en).not.toBe(l.en)
    }
  })

  it('the scene is one router and two tags, and nothing else', () => {
    // "One router, two battery-free tags, no other Wi-Fi traffic: the round stands alone." /
    //  sources: "The router is a Wi-Fi 7 device because the downlink AMP PPDU carries a U-SIG field."
    const s = ampIntro.scenario()
    expect(s.nodes.map((n) => n.kind)).toEqual(['ap', 'amp', 'amp'])
    expect(s.nodes[0].caps.generation).toBe('eht')
    expect(s.nodes.every((n) => n.profiles.every((p) => p === 'idle'))).toBe(true)
    expect(s.nodes[0].ampAp).toMatchObject({ pollIntervalMs: 100, slots: 4, acwe: 2, dlKbps: 250, ulKbps: 250, protection: 'ctsSelf', readMode: 'inline' })
    // deeper: "The tag answers at 0 dBm against the router’s 20 dBm"
    expect(s.nodes[0].txPowerDbm).toBe(20)
    expect(s.nodes.slice(1).map((n) => n.txPowerDbm)).toEqual([0, 0])
    // the variant labelled "1 Mb/s both ways"
    expect(ampIntro.variants![0].scenario().nodes[0].ampAp).toMatchObject({ dlKbps: 1000, ulKbps: 1000, slots: 4, acwe: 2 })
  })
})

describe('amp-intro · standard constants', () => {
  it('AMP SIFS is 10 µs, exactly the 2.4 GHz SIFS a Wi-Fi radio already uses', () => {
    // numbers: "every gap in the round is 10 µs" / sources: "The 10 µs AMP SIFS is SFD PM-96, and it
    //  happens to equal the SIFS 2.4 GHz Wi-Fi already uses."
    expect(AMP_SIFS_NS).toBe(10 * US)
    expect(ERP_2G.sifsNs).toBe(AMP_SIFS_NS)
    // The 9 µs contention slot is quoted nowhere in this lesson any more — the picture's
    // carrier-sense reminder now says only that a tag "cannot keep time between frames" — so
    // the two assertions that used to pin it were dropped rather than left guarding nothing.
  })

  it('a protected AMP frame pads 36 µs where an unprotected one pads 20 µs', () => {
    // "Going deeper": "Protecting the round is not the same thing as a protected AMP frame, which
    //  means an encrypted one and pads 36 µs instead of 20."
    // The padding mechanism itself — why it is there, and that every frame in this scene is
    // unprotected — is pinned next door in tests/course/amp-ppdu.test.ts.
    expect(AMP_PADDING_NS).toBe(20 * US)
    expect(AMP_PADDING_PROTECTED_NS).toBe(36 * US)
  })

  it('the model values: −72 dBm tag sensitivity, 8 dB downlink SINR, 10 dB uplink SINR, −94 dBm uplink floor', () => {
    // sources: "the tag’s −72 dBm downlink sensitivity and the on–off keying thresholds (8 dB down,
    //  10 dB up at 250 kb/s) are the simulator's own choices" / "the router's own −94 dBm floor"
    expect(AMP_TAG_DL_SENS_DBM).toBe(-72)
    expect(AMP_DL_REQ_SINR_DB).toBe(8)
    expect(AMP_UL_REQ_SINR_DB[250]).toBe(10)
    expect(Math.round(ampUlSensDbm(250))).toBe(-94)
  })
})

describe('amp-intro · the shape of one round', () => {
  const rs = recs()

  it('the round opens with a CTS-to-self one SIFS before the trigger', () => {
    // the timeline table's "CTS-to-self … 0 µs → 50 µs" and "AMP Trigger … 60 µs" rows, and
    // the round formula's "round = 50 + 10 + 618 + …"
    const cts = txs(rs, 'cts')[0]
    const ctsEnd = ends(rs, 'cts')[0]
    const trig = txs(rs, 'ampTrigger')[0]
    expect(cts.t).toBe(0)
    expect(cts.node).toBe(AP)
    expect(ctsEnd.t).toBe(50 * US)
    expect(trig.t).toBe(60 * US)
    expect(trig.t - ctsEnd.t).toBe(ERP_2G.sifsNs)
  })

  it('the CTS Duration of 4140 µs ends exactly where the round’s last Ack ends, at 4190 µs', () => {
    // "The CTS-to-self carries a Duration of 4140 µs. It ends at 50 µs, so the reservation expires
    //  at 4190 µs — the very microsecond the fourth Ack stops transmitting."
    const cts = txs(rs, 'cts')[0]
    expect(cts.frame.durationFieldNs).toBe(4140 * US)
    const navEnd = ends(rs, 'cts')[0].t + cts.frame.durationFieldNs
    expect(navEnd).toBe(4190 * US)
    const lastAck = ends(rs, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t).toBe(navEnd)
  })

  it('slot 1 starts one AMP SIFS after the trigger ends, and slot 2 one AMP SIFS after Ack₁', () => {
    // "Slot 1 opens one gap after the trigger’s last symbol, at 678 + 10 = 688 µs; slot 2 one gap
    //  after Ack₁ stops, at 1556 + 10 = 1566 µs."
    const trigEnd = ends(rs, 'ampTrigger')[0]
    const slots = ofType(rs, 'AMP_SLOT').filter((r) => r.t < 5 * MS)
    expect(trigEnd.t).toBe(678 * US)
    expect(slots[0].t).toBe(688 * US)
    expect(slots[0].t - trigEnd.t).toBe(AMP_SIFS_NS)
    const ack1 = txs(rs, 'ampAck')[0], ack1End = ends(rs, 'ampAck')[0]
    expect([ack1.t, ack1End.t]).toEqual([1226 * US, 1556 * US])
    expect(slots[1].t).toBe(1566 * US)
    expect(slots[1].t - ack1End.t).toBe(AMP_SIFS_NS)
  })

  it('the first round runs to the timeline table, slot by slot and Ack by Ack', () => {
    // every "From"/"To" cell of "The first round on the router’s lane", and
    // "AMP Trigger, 4 slots × 528 µs"
    const slots = ofType(rs, 'AMP_SLOT').filter((r) => r.t < 5 * MS)
    expect(slots.map((r) => r.slot)).toEqual([1, 2, 3, 4])
    expect(slots.map((r) => [r.t / US, r.untilNs / US])).toEqual([[688, 1216], [1566, 2094], [2444, 2972], [3322, 3850]])
    const ackSpans = txs(rs, 'ampAck').filter((r) => r.t < 5 * MS)
      .map((r) => [r.t / US, (r.t + r.frame.txTimeNs) / US])
    expect(ackSpans).toEqual([[1226, 1556], [2104, 2434], [2982, 3312], [3860, 4190]])
    expect(new Set(slots.map((r) => r.untilNs - r.t))).toEqual(new Set([528 * US]))
    expect(new Set(txs(rs, 'ampAck').map((r) => r.frame.txTimeNs))).toEqual(new Set([330 * US]))
    // the table's Ack rows: "AMP Ack₁ → Door tag", "AMP Ack₂ → Fridge tag", then two "→ Router"
    const round1Acks = txs(rs, 'ampAck').filter((r) => r.t < 5 * MS)
    expect(round1Acks.map((r) => r.frame.dst)).toEqual(['tag-2', 'tag-1', 'ap', 'ap'])
    const round = ofType(rs, 'AMP_ROUND')[0]
    expect(round.slots).toBe(4)
    expect(round.slotNs).toBe(528 * US)
    expect(round.acwe).toBe(2)
  })

  it('the round costs 4190 µs of channel, 4.19 % of each 100 ms', () => {
    // "round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 4.19 % of 100 ms"
    const total = 50 + 10 + 618 + 4 * (10 + 528 + 10 + 330)
    expect(total).toBe(4190)
    const cts = txs(rs, 'cts')[0]
    const lastAck = ends(rs, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t - cts.t).toBe(4190 * US)
    expect(((4190 / 100_000) * 100).toFixed(2)).toBe('4.19')
  })

  it('of those 4190 µs, 3044 µs are PPDU, 90 µs are SIFS gaps and 1056 µs are two silent slots', () => {
    // "Only 3044 µs of that has a frame on the air; 90 µs is the nine gaps and 1056 µs the two
    //  unused slots — the price of a random draw."
    const first = [...txs(rs, 'cts'), ...txs(rs, 'ampTrigger'), ...txs(rs, 'ampAck'), ...txs(rs, 'ampResp')]
      .filter((r) => r.t < 5 * MS)
    expect(first.reduce((s, r) => s + r.frame.txTimeNs, 0)).toBe(3044 * US)
    expect(9 * (AMP_SIFS_NS / US)).toBe(90)
    expect(2 * 528).toBe(1056)
    expect(3044 + 90 + 1056).toBe(4190)
  })
})

describe('amp-intro · a second of polling', () => {
  const rs = recs()

  it('one second holds ten rounds, forty slots and forty Acks, sixteen of them naming a tag', () => {
    // "A round starts every 100 ms, so a second holds ten: forty slots, forty Acks, twenty tag
    //  answers. Sixteen Acks name a tag; the other twenty-four the router."
    expect(ofType(rs, 'AMP_ROUND').length).toBe(10)
    expect(ofType(rs, 'AMP_ROUND').map((r) => r.t)[1]).toBe(100 * MS + 60 * US)
    expect(ofType(rs, 'AMP_SLOT').length).toBe(40)
    const acks = txs(rs, 'ampAck')
    expect(acks.length).toBe(40)
    expect(acks.filter((r) => r.frame.dst !== r.frame.src).length).toBe(16)
    expect(acks.filter((r) => r.frame.dst === r.frame.src).length).toBe(24)
    expect(txs(rs, 'ampResp').length).toBe(20)
    expect(txs(rs, 'cts').map((r) => r.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => k * 100 * MS))
  })

  it('each tag answers all ten rounds: eight acknowledged and two lost', () => {
    // "Each tag answers in every round: eight acknowledged, two lost."
    for (const tag of TAGS) {
      const rr = results(rs, tag)
      expect(rr.length).toBe(10)
      expect(rr.every((r) => r.sent)).toBe(true)
      expect(rr.filter((r) => r.acked).length).toBe(8)
      expect(rr.filter((r) => !r.acked).length).toBe(2)
    }
    expect(ofType(rs, 'AMP_RESULT').filter((r) => r.acked).length).toBe(16)
  })

  it('the inspector counters a tag ends the second with are 10 / 8 / 2', () => {
    // numbers: "Each tag answers in every round — eight acknowledged, two lost, the counters
    //  the inspector ends the second with."
    const vs = initViewState(ampIntro.scenario())
    for (const r of rs) applyRecord(vs, r)
    for (const tag of TAGS) {
      expect(vs.nodes[tag].amp, tag).toMatchObject({ sent: 10, acked: 8, lost: 2, roundsHeard: 10, roundsSatOut: 0 })
    }
  })

  it('a draw of 3 lands in slot 4, so with ACW + 1 = N neither tag ever sits a round out', () => {
    // picture: "each tag that decoded it draws its own number, its ABOC, and answers in the slot
    //  it points at" / deeper: "The trigger carries a window exponent, ACWE, set to 2 here, so the
    //  window is ACW = 2² − 1 = 3. Each tag draws an ABOC from 0, 1, 2, 3 and answers in slot
    //  ABOC + 1." / deeper: "A tag sits a round out when its
    //  draw can land past the last slot, that is when ACW + 1 > N. Here ACW + 1 = 4 = N … a draw
    //  of 3 lands in slot 4, the last one there is."
    const acw = 2 ** 2 - 1
    const slots = ampIntro.scenario().nodes[0].ampAp!.slots
    expect(acw).toBe(3)
    expect(acw + 1).toBe(slots)
    expect(acw + 1 > slots).toBe(false)
    for (const tag of TAGS) {
      const a = aboc(rs, tag)
      expect(a.length).toBe(10)
      expect(new Set(a.map((r) => r.acw))).toEqual(new Set([acw]))
      expect(a.every((r) => r.aboc >= 0 && r.aboc <= acw)).toBe(true)
      expect(a.every((r) => r.slot === r.aboc + 1)).toBe(true)
      expect(a.filter((r) => r.slot === null).length).toBe(0)
    }
    // "a draw of 3 lands in slot 4, the last one there is" — it happens in this run
    expect(ofType(rs, 'AMP_ABOC').some((r) => r.aboc === acw && r.slot === slots)).toBe(true)
  })

  it('the two losses are the two rounds in which both tags drew the same slot', () => {
    // numbers: "Not weak signal: twice in ten rounds both tags drew the same number and spoke
    //  together", and the table beside it, row by row — round · slot · collision at · Ack
    //  names · tag learns at: "3 · 1 · 201 216 µs · the router · 201 556 µs" and
    //  "6 · 3 · 502 972 µs · the router · 503 312 µs".
    const coll = ofType(rs, 'COLLISION')
    expect(coll.length).toBe(2)
    // the COLLISION is stamped at the instant the overlapping slot ends
    expect(coll.map((r) => r.t)).toEqual([201_216 * US, 502_972 * US])
    // the table's "Round" column: rounds start every 100 ms, so these are the 3rd and the 6th
    expect(coll.map((r) => Math.floor(r.t / (100 * MS)) + 1)).toEqual([3, 6])
    for (const c of coll) {
      expect([...c.nodes].sort()).toEqual([...TAGS])
      const slot = ofType(rs, 'AMP_SLOT').find((r) => r.untilNs === c.t)!
      expect(slot.untilNs).toBe(c.t)
    }
    const fail = ofType(rs, 'RX_FAIL').filter((r) => r.node === AP)
    expect(fail.length).toBe(2)
    expect(fail.every((r) => r.reason === 'collision')).toBe(true)
    const lost = ofType(rs, 'AMP_RESULT').filter((r) => !r.acked)
    expect(lost.map((r) => r.slot)).toEqual([1, 1, 3, 3])
    expect([...new Set(lost.map((r) => r.t))]).toEqual([201_556 * US, 503_312 * US])
    for (const c of coll) {
      const ack = txs(rs, 'ampAck').find((r) => r.t > c.t)!
      expect(ack.frame.dst).toBe(ack.frame.src)
    }
  })

  it('the tags never carrier-sense, never back off and never wait out an IFS; the AP does all three', () => {
    // deeper: "Scroll a tag’s lane for a whole second and three kinds of record are missing: CCA_BUSY,
    //  the channel sounding busy; BACKOFF_DRAW, a countdown drawn before speaking; IFS_START, the
    //  wait after someone else stops. A tag has none of them to record; its whole contribution is
    //  ten transmissions. The router’s lane has all three."
    for (const tag of TAGS) {
      for (const type of CONTENTION_RECORDS) expect(countAt(rs, tag, type), `${tag} ${type}`).toBe(0)
      expect(countAt(rs, tag, 'TX_START')).toBe(10)
    }
    for (const type of CONTENTION_RECORDS) expect(countAt(rs, AP, type), `ap ${type}`).toBeGreaterThan(0)
    // "the router takes the channel the ordinary way, on its lowest-priority access function"
    expect(ofType(rs, 'IFS_START').every((r) => r.ac === 0)).toBe(true)
  })

  it('no lane in this scene ever sets a NAV', () => {
    // deeper: "No lane in this scene ever holds a NAV_SET record. A CTS-to-self sets the countdown
    //  in the nodes that hear it, never in its own sender, and there is no other Wi-Fi node here to
    //  send one back."
    expect(ofType(rs, 'NAV_SET').length).toBe(0)
    expect(countAt(rs, AP, 'NAV_SET')).toBe(0)
    // the Duration is nonetheless on the air for anyone who might arrive
    expect(txs(rs, 'cts')[0].frame.durationFieldNs).toBe(4140 * US)
  })

  it('the link budget leaves both tags far above the thresholds that matter', () => {
    // deeper, the "Enormous link margin" table row by row: "Router → Door tag · −37.4 dBm ·
    //  −72 dBm · 34.6 dB" and "Door tag → router · −57.4 dBm · −94 dBm · 36.6 dB" / deeper:
    //  "−94 dBm … is about 12 dB below the −82 dBm an ordinary Wi-Fi frame must clear to be
    //  received at all."
    const s = ampIntro.scenario()
    const links = buildLinkTable(s.nodes, s.walls)
    // the engine gives 2.4 GHz 6.5 dB less path loss than the band-neutral table
    expect(LINK_EXTRA_LOSS_DB['2g']).toBe(-6.5)
    const dl = rssiOn('2g', links, 'ap', 'tag-2')
    const ul = rssiOn('2g', links, 'tag-2', 'ap')
    expect(dl.toFixed(1)).toBe('-37.4')
    expect(ul.toFixed(1)).toBe('-57.4')
    expect((dl - AMP_TAG_DL_SENS_DBM).toFixed(1)).toBe('34.6')
    expect((ul - ampUlSensDbm(250)).toFixed(1)).toBe('36.6')
    expect(CCA_PD_DBM).toBe(-82)
    expect(Math.round(CCA_PD_DBM - ampUlSensDbm(250))).toBe(12)
  })
})

describe('amp-intro · the try-this experiment', () => {
  const withSens = (dlSensDbm: number): Scenario => {
    const base = ampIntro.scenario()
    return { ...base, nodes: base.nodes.map((n: NodeCfg) => (n.id === 'tag-2' ? { ...n, ampTag: { dlSensDbm } } : n)) }
  }

  it('a Door tag deafened past its received −37.4 dBm answers nothing, and the round is unchanged', () => {
    // "In the editor raise the Door tag’s downlink sensitivity threshold above the −37.4 dBm it
    //  actually receives, and reload. It stops decoding triggers, so it never draws an ABOC and
    //  never transmits — while the round keeps its forty slots and forty Acks a second, unchanged."
    // −36 dBm is above what it receives, −38 dBm below: the bracket measures the received power itself.
    expect(run(withSens(-38)).filter((r) => 'node' in r && r.node === 'tag-2#2g' && r.type === 'AMP_ABOC').length).toBe(10)
    const rs = run(withSens(-36))
    expect(countAt(rs, 'tag-2#2g', 'AMP_ABOC')).toBe(0)
    expect(countAt(rs, 'tag-2#2g', 'TX_START')).toBe(0)
    expect(countAt(rs, 'tag-2#2g', 'AMP_RESULT')).toBe(0)
    // the round itself does not notice
    expect(ofType(rs, 'AMP_SLOT').length).toBe(40)
    expect(txs(rs, 'ampAck').length).toBe(40)
    expect(ofType(rs, 'AMP_ROUND').length).toBe(10)
    // the Fridge tag keeps answering, and now nothing collides with it
    expect(countAt(rs, 'tag-1#2g', 'AMP_ABOC')).toBe(10)
    expect(results(rs, 'tag-1#2g').filter((r) => r.acked).length).toBe(10)
  })
})

describe('amp-intro · what the log shows', () => {
  const rs = recs()

  it('the log prints the ABOC draw, the round summary and the outcome the lesson quotes', () => {
    // observe: "Step a round through the inspector with the Fridge tag selected. The log prints
    //  its draw as “ABOC 1 of [0, 3] → slot 2”, its outcome as “slot 2: acknowledged”, and a
    //  round line naming the slots, the window and both rates."
    // Both quoted lines are the Fridge tag's own — the observation names that tag, so it is
    // pinned against that node's records and not against the first record of each type. The
    // Door tag's first outcome, "slot 1: acknowledged", is the line the sentence used to quote.
    expect(fmtRecord(ofType(rs, 'AMP_ABOC')[0])).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord(aboc(rs, 'tag-1#2g')[0])).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord(results(rs, 'tag-1#2g')[0])).toBe('tag-1#2g slot 2: acknowledged')
    expect(fmtRecord(ofType(rs, 'AMP_ROUND')[0]))
      .toBe('ap#2g AMP round (random): 4 slots × 528.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
    expect(fmtRecord(results(rs, 'tag-2#2g')[0])).toBe('tag-2#2g slot 1: acknowledged')
  })
})
