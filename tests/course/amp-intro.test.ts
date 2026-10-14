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
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import type { Block } from '../../src/course/lessonKit'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS

const AP = 'ap#2g'
const TAGS = ['tag-1#2g', 'tag-2#2g'] as const
/** Exactly the record types the prose names as absent from a tag and present at the AP. */
const CONTENTION_RECORDS = ['CCA_BUSY', 'BACKOFF_DRAW', 'IFS_START'] as const

/** One scratch scenario, run for the same second the lesson's own runs cover. */
function run(s: Scenario): TLRecord[] {
  return [...new Simulation(s).runUntil(RUN_NS).records]
}
/** This lesson's records, from the kit's shared memo: one run per variant per worker. */
const recs = (variant?: number): TLRecord[] => runOf(ampIntro, variant, RUN_NS)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)
const aboc = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_ABOC').filter((r) => r.node === node)
const results = (rs: TLRecord[], node: string) => ofType(rs, 'AMP_RESULT').filter((r) => r.node === node)
const countAt = (rs: TLRecord[], node: string, type: string) =>
  rs.filter((r) => 'node' in r && r.node === node && r.type === type).length

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// A track's first lesson is held to 1000 main-path words, not 1300, and the
// prose window (why + outcomes + terms + picture + numbers) to the same 1000.
lessonShapeSuite(ampIntro, { runNs: RUN_NS })

describe('amp-intro · the lesson’s own scene', () => {
  it('is the opening lesson of the AMP track', () => {
    expect(MODULES[ampIntro.module].title).toBe('环境能量物联网（802.11bp）')
    // at most four new words, and no table in the picture
    expect(ampIntro.terms!.map((t) => t.term)).toEqual(['AMP', 'tag', 'slot', 'ABOC'])
    expect(ampIntro.picture!.some((b) => b.kind === 'table')).toBe(false)
    // it assumes Wi-Fi Tier 1 and nothing else
    expect(ampIntro.needs).toEqual(['radio-primer', 'frame-anatomy'])
  })

  it('the scenario and the variant pass the scenario schema', () => {
    expect(ampIntro.scenario()).toEqual(ampIntroScenario({ dlKbps: 250, ulKbps: 250 }))
    expect(() => ScenarioSchema.parse(ampIntro.scenario())).not.toThrow()
    for (const v of ampIntro.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
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
    /*
     * **And the label column of that table, which is where the 「第」 rule change of 2026-10-14
     * found four unread figures**: 「第 1 帧 Ack → Door tag」 … 「第 4 帧 Ack → 路由器」. The
     * ordinal is a claim about which Ack of this round the row is, and 「→ 路由器」 against a
     * tag's name is a claim about who it names — an Ack with nobody to name is addressed to the
     * router itself, which is the whole reason the empty slots still cost an Ack. Both are read
     * here, together with the row's own two instants.
     */
    const firstRound = (ampIntro.numbers!.find((b) => b.kind === 'table'
      && b.heading?.includes('路由器泳道上的第一轮')) as { rows: string[][] }).rows
    const ackRows = firstRound.filter((r) => /^第 \d+ 帧 Ack → /.test(r[0]!))
    expect(ackRows.length, 'one row per Ack of the round').toBe(round1Acks.length)
    for (const [i, row] of ackRows.entries()) {
      const m = /^第 (\d+) 帧 Ack → (.+)$/.exec(row[0]!)!
      expect(Number(m[1]), `row ${i}: which Ack of the round it is`).toBe(i + 1)
      expect(m[2] === '路由器', `row ${i}: 「→ 路由器」 iff that Ack names nobody but the router`)
        .toBe(round1Acks[i]!.frame.dst === 'ap')
      expect([Number(/^(\d+) µs$/.exec(row[1]!)![1]), Number(/^(\d+) µs$/.exec(row[2]!)![1])],
        `row ${i}: when that Ack starts and ends`)
        .toEqual([round1Acks[i]!.t / US,
          (round1Acks[i]!.t + round1Acks[i]!.frame.txTimeNs) / US])
    }
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
      /*
       * 「每个标签从 0、1、2、3 中抽一个 ABOC，在第 ABOC + 1 个时隙作答」 — the offset is read
       * out of `deeper` rather than typed here, which is what the 「第」 rule change of
       * 2026-10-14 uncovered: a 2 in that sentence would put every tag in the wrong slot and
       * this file would not have noticed.
       */
      const deep = ampIntro.deeper!.map((b) => (b as { text?: string }).text ?? '').join(' ')
      const om = /在第 ABOC \+ (\d) 个时隙作答/.exec(deep)
      expect(om, '`deeper` no longer says which slot a draw answers in').not.toBeNull()
      const off = Number(om![1])
      expect(a.every((r) => r.slot === r.aboc + off), `every draw answers ABOC + ${off}`)
        .toBe(true)
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

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * Everything above measures this round to the microsecond — and every figure it compares against
 * is typed on **this** side, with the lesson's own sentence quoted in a comment above it. That is
 * the shape the sampling sweep of 2026-10-12 scored 6 of 6 on: all six figures it planted went
 * unnoticed, because no assertion in this file ever read the lesson at all. The comments made the
 * two sides look tied together, and they are not.
 *
 * Here every figure is parsed **out of the lesson** and compared with the same measurement the
 * assertions above make. Nothing new is measured: the same `recs()`, `txs`, `ends`, `aboc`,
 * `results`, `rssiOn` and the same four engine constants.
 *
 * **The reads worth naming:**
 *
 *  - **the timeline table is read as a chain, not as twenty numbers.** Every row's 「起」 is one
 *    AMP SIFS after the previous row's 「止」, and every 「止」 is its own frame's airtime — so the
 *    table is checked the way the lesson tells a reader to check it, forward from zero.
 *  - **both formulas are checked as arithmetic.** 「round = 50 + 10 + 618 + 4 × (10 + 528 + 10 +
 *    330) = 4190 µs = 100 ms 的 4.19 %」 has all nine of its figures parsed out, the sum has to
 *    equal the measured round, and the percentage has to equal the sum over the measured period.
 *  - **the nine gaps and the two silent slots are counted, not quoted.** 「90 µs 是那九个间隔，
 *    1056 µs 是两个没人用的时隙」 reads both the count and the product out of the sentence, and
 *    the sentence's own three parts have to add up to its own total.
 *  - **the ACWE algebra is read with its own exponent.** 「ACWE，这里取 2，于是窗口 ACW = 2² − 1
 *    = 3」 is parsed into base, exponent and offset, and the window has to be what the records
 *    carry.
 *
 * **One figure is exempt, class (d): the 「2.4 GHz」 of `sources`.** It is a band's name rather
 * than a measurement — this engine identifies the band as `'2g'` and holds no centre frequency
 * for it — and what the sentence says about it IS checked: that the band's own SIFS is the AMP
 * SIFS, which is the whole of its claim.
 */
describe('amp-intro · every figure the prose prints, read back out of it', () => {
  const rs = recs()
  const blockText = (b: unknown): string => {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x)
    }
    walk(b)
    return out.join('\n')
  }
  const NUMS = blockText(ampIntro.numbers)
  const DEEP = blockText(ampIntro.deeper)
  const SRC = blockText(ampIntro.sources)
  const OBS = blockText(ampIntro.observe)
  const TRY = blockText(ampIntro.tryThis)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const m = re.exec(text)
    expect(m, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return m!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  /** A figure READ off the lesson against a measurement, at the precision it was printed to. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  /** A Chinese numeral up to the thousands: this lesson counts a second of polling in characters. */
  const zh = (x: string): number => {
    let total = 0
    let cur = 0
    for (const ch of x.replace(/两/g, '二')) {
      const d = '零一二三四五六七八九'.indexOf(ch)
      if (d >= 0) { cur = d; continue }
      const unit = { 十: 10, 百: 100, 千: 1000 }[ch]
      expect(unit, `「${x}」 is not a numeral this test can read`).toBeDefined()
      total += (cur || 1) * unit!
      cur = 0
    }
    return total + cur
  }
  const tableOf = (n: number): Extract<Block, { kind: 'table' }> => ampIntro.numbers!
    .filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table')[n]!
  const firstRound = <T extends TLRecord>(xs: T[]): T[] => xs.filter((r) => r.t < 5 * MS)

  it('reads the timeline table forward from zero, one SIFS at a time', () => {
    const rows = tableOf(0).rows
    expect(rows.length, 'the ten rows of the first round').toBe(10)
    // Every row is 「起」 → 「止」 in microseconds, and the whole table is one chain.
    const spans = rows.map((r) => [val(raw(r[1]!, /^([\d ]+) µs$/, `row 「${r[0]}」 start`)[0]!),
      val(raw(r[2]!, /^([\d ]+) µs$/, `row 「${r[0]}」 end`)[0]!)] as const)
    for (const [i, [from, to]] of spans.entries()) {
      expect(to, `row 「${rows[i]![0]}」 ends after it starts`).toBeGreaterThan(from)
      if (i > 0) {
        expect(from - spans[i - 1]![1], `row 「${rows[i]![0]}」 opens one AMP SIFS after the row above`)
          .toBe(AMP_SIFS_NS / US)
      }
    }
    // …and the chain's own frames, in the order the engine puts them on the air.
    const cts = txs(rs, 'cts')[0]!
    const trig = txs(rs, 'ampTrigger')[0]!
    const slots = firstRound(ofType(rs, 'AMP_SLOT'))
    const acks = firstRound(txs(rs, 'ampAck'))
    expect(spans[0], 'the CTS-to-self row').toEqual([cts.t / US, (cts.t + cts.frame.txTimeNs) / US])
    expect(spans[1], 'the trigger row').toEqual([trig.t / US, (trig.t + trig.frame.txTimeNs) / US])
    for (const [i, slot] of slots.entries()) {
      expect(spans[2 + 2 * i], `the row of slot ${slot.slot}`).toEqual([slot.t / US, slot.untilNs / US])
      const ack = acks[i]!
      expect(spans[3 + 2 * i], `the row of Ack ${i + 1}`)
        .toEqual([ack.t / US, (ack.t + ack.frame.txTimeNs) / US])
    }
    // The labels carry figures too: the Duration, the slot count and the slot length.
    const [duration] = figs(rows[0]![0]!, /Duration ([\d ]+) µs/, 'the CTS row’s own label')
    expect(duration! * US, 'the Duration the CTS-to-self carries').toBe(cts.frame.durationFieldNs)
    const [slotCount, slotUs] = figs(rows[1]![0]!, /(\d+) 个时隙 × ([\d ]+) µs/, 'the trigger row’s label')
    const round = ofType(rs, 'AMP_ROUND')[0]!
    expect(slotCount, 'the slots the trigger allocates').toBe(round.slots)
    expect(slotUs! * US, 'and how long each of them is').toBe(round.slotNs)
    for (const [i, slot] of slots.entries()) {
      const [n] = figs(rows[2 + 2 * i]![0]!, /时隙 (\d+)/, `the label of slot row ${i + 1}`)
      expect(n, 'the slot number the label names').toBe(slot.slot)
    }
  })

  it('reads the sentence that states the gap before the table uses it', () => {
    // 「这一轮里每个间隔都是 10 µs」: the sweep of 2026-10-13 found this one, because every other
    // reading of the gap is inside a formula or a log line.
    const [gapUs] = figs(NUMS, /这一轮里每个间隔都是 (\d+) µs/, '`numbers` on the gap')
    expect(gapUs! * US, 'the gap every row of the table opens after').toBe(AMP_SIFS_NS)
    /*
     * …and it really is every gap of the round — measured on the round's own chain of spans,
     * which is a slot wherever a slot is open and a frame wherever one is sent. An empty slot
     * still occupies its whole 528 µs, so reading the chain as frames alone would report the
     * 548 µs across a silent slot as a gap, which is the slot and not a gap.
     */
    const spans: [number, number][] = [
      ...firstRound([...txs(rs, 'cts'), ...txs(rs, 'ampTrigger'), ...txs(rs, 'ampAck')])
        .map((r) => [r.t, r.t + r.frame.txTimeNs] as [number, number]),
      ...firstRound(ofType(rs, 'AMP_SLOT')).map((r) => [r.t, r.untilNs] as [number, number]),
    ].sort((x, y) => x[0] - y[0])
    const gaps = spans.slice(1).map(([from], i) => from - spans[i]![1])
    expect(new Set(gaps), 'every gap of the round, between one span and the next')
      .toEqual(new Set([gapUs! * US]))
    expect(gaps.length, 'and there are nine of them').toBe(9)
  })

  it('reads both slot formulas, which are the chain the table walks', () => {
    const f = ampIntro.numbers!.filter((b) => b.kind === 'formula')[0] as { text: string }
    const [one, trigEnd, gap1, slot1] = figs(f.text,
      /时隙 (\d+) = 触发帧结束 ([\d ]+) \+ (\d+) = ([\d ]+) µs/, 'the first slot formula')
    const [two, ackEnd, gap2, slot2] = figs(f.text,
      /时隙 (\d+) = Ack₁ 结束 ([\d ]+) \+ (\d+) = ([\d ]+) µs/, 'the second')
    const slots = firstRound(ofType(rs, 'AMP_SLOT'))
    const trig = ends(rs, 'ampTrigger')[0]!
    const ack1 = ends(rs, 'ampAck')[0]!
    expect([one, two], 'the two slots the formulas are about').toEqual([slots[0]!.slot, slots[1]!.slot])
    expect(trigEnd! * US, 'where the trigger ends').toBe(trig.t)
    expect(ackEnd! * US, 'where the first Ack ends').toBe(ack1.t)
    for (const g of [gap1, gap2]) expect(g! * US, 'the gap each slot opens after').toBe(AMP_SIFS_NS)
    expect(slot1! * US, 'where slot 1 opens').toBe(slots[0]!.t)
    expect(slot2! * US, 'and slot 2').toBe(slots[1]!.t)
    expect(trigEnd! + gap1!, 'the first sum the lesson prints').toBe(slot1)
    expect(ackEnd! + gap2!, 'and the second').toBe(slot2)
  })

  it('reads the round formula, its percentage and the three parts it splits into', () => {
    const f = ampIntro.numbers!.filter((b) => b.kind === 'formula')[1] as { text: string; note: string }
    const [cts, g1, trig, n, g2, slot, g3, ack, total, periodMs] = figs(f.text,
      /round = (\d+) \+ (\d+) \+ (\d+) \+ (\d+) × \((\d+) \+ ([\d ]+) \+ (\d+) \+ ([\d ]+)\) = ([\d ]+) µs = ([\d ]+) ms 的 ([\d.]+) %/,
      'the round formula')
    // The arithmetic the line shows, and the round it is about.
    expect(cts! + g1! + trig! + n! * (g2! + slot! + g3! + ack!), 'the sum the formula prints').toBe(total)
    const ctsTx = txs(rs, 'cts')[0]!
    const lastAck = firstRound(ends(rs, 'ampAck')).pop()!
    expect(total! * US, 'the round the engine runs').toBe(lastAck.t - ctsTx.t)
    // Each term against what it names.
    expect(cts! * US, 'the CTS-to-self’s own airtime').toBe(ctsTx.frame.txTimeNs)
    for (const g of [g1, g2, g3]) expect(g! * US, 'an AMP SIFS').toBe(AMP_SIFS_NS)
    const trigTx = txs(rs, 'ampTrigger')[0]!
    expect(trig! * US, 'the trigger’s airtime').toBe(trigTx.frame.txTimeNs)
    const round = ofType(rs, 'AMP_ROUND')[0]!
    expect(n, 'the slots of one round').toBe(round.slots)
    expect(slot! * US, 'the length of one slot').toBe(round.slotNs)
    expect(ack! * US, 'and one Ack’s airtime')
      .toBe(firstRound(txs(rs, 'ampAck'))[0]!.frame.txTimeNs)
    // The period, and the share of it this round costs.
    const starts = txs(rs, 'cts').map((r) => r.t)
    expect(periodMs! * MS, 'the period between two rounds').toBe(starts[1]! - starts[0]!)
    same(raw(f.text, /的 ([\d.]+) %/, 'the share of the period')[0]!,
      (100 * total! * US) / (periodMs! * MS), 'the share of the period the round costs')
    // The note: it names the round again, then splits it three ways.
    const [noteTotal] = figs(f.note, /这 ([\d ]+) µs 里/, 'the note’s own printing of the round')
    expect(noteTotal, 'the round, printed a second time at the head of the note').toBe(total)
    const [air] = figs(f.note, /真正有帧在空中的只有 ([\d ]+) µs/, 'the note on the airtime')
    const frames = firstRound([...txs(rs, 'cts'), ...txs(rs, 'ampTrigger'),
      ...txs(rs, 'ampAck'), ...txs(rs, 'ampResp')])
    expect(air! * US, 'the frames of the round, added up')
      .toBe(frames.reduce((a, r) => a + r.frame.txTimeNs, 0))
    const [gapTotal, gapCount] = raw(f.note, /([\d ]+) µs 是那([一二三四五六七八九十]+)个间隔/,
      'the note on the gaps')
    expect(zh(gapCount!) * (AMP_SIFS_NS / US), 'the gaps, counted and multiplied out').toBe(val(gapTotal!))
    const [idleTotal, idleCount] = raw(f.note, /([\d ]+) µs 是([一二三四五六七八九十两]+)个没人用的时隙/,
      'the note on the silent slots')
    expect(zh(idleCount!) * (round.slotNs / US), 'the silent slots, counted out').toBe(val(idleTotal!))
    const used = new Set(firstRound(ofType(rs, 'AMP_RESULT')).map((r) => r.slot))
    expect(round.slots - used.size, 'and that many slots really do go unused').toBe(zh(idleCount!))
    expect(air! + val(gapTotal!) + val(idleTotal!), 'the three parts are the whole round')
      .toBe(total)
  })

  it('reads the second of polling, which the prose counts in characters', () => {
    const [periodMs] = figs(NUMS, /路由器每 ([\d ]+) ms 整点开启一轮/, 'the period')
    const starts = txs(rs, 'cts').map((r) => r.t)
    expect(periodMs! * MS, 'the period between two rounds').toBe(starts[1]! - starts[0]!)
    const [rounds, slots, acks, answers] = raw(NUMS,
      /所以一秒钟里有(.+?)轮：(.+?)个时隙、(.+?)帧 Ack、(.+?)次标签作答/, 'the second of polling')
    expect(zh(rounds!), 'the rounds a second holds').toBe(ofType(rs, 'AMP_ROUND').length)
    expect(zh(slots!), 'the slots').toBe(ofType(rs, 'AMP_SLOT').length)
    expect(zh(acks!), 'the Acks').toBe(txs(rs, 'ampAck').length)
    expect(zh(answers!), 'and the answers the tags give').toBe(txs(rs, 'ampResp').length)
    expect(zh(slots!), 'which is the rounds times the slots of one').toBe(zh(rounds!) * 4)
    // Which Acks name a tag, and which name the router itself.
    const [named, self] = raw(NUMS, /其中(.+?)帧点名了某个标签，另外(.+?)帧写的是路由器自己/,
      'the Acks that name a tag')
    const ackDsts = txs(rs, 'ampAck').map((r) => r.frame.dst)
    expect(zh(named!), 'the Acks that name a tag').toBe(ackDsts.filter((d) => d !== 'ap').length)
    expect(zh(self!), 'and the ones that name the router').toBe(ackDsts.filter((d) => d === 'ap').length)
    expect(zh(named!) + zh(self!), 'together they are every Ack of the second').toBe(zh(acks!))
    // Both tags answered every round, and how those answers ended.
    const [all, acked, lost] = raw(NUMS, /两个标签都在全部(.+?)轮里作了答：(.+?)次被确认、(.+?)次丢失/,
      'how the answers ended')
    for (const tag of TAGS) {
      expect(results(rs, tag).length, `${tag} answered every round`).toBe(zh(all!))
      expect(results(rs, tag).filter((r) => r.acked).length, `${tag} acknowledged`).toBe(zh(acked!))
      expect(results(rs, tag).filter((r) => !r.acked).length, `${tag} lost`).toBe(zh(lost!))
    }
    expect(zh(acked!) + zh(lost!), 'and the two add up to the rounds').toBe(zh(all!))
  })

  it('reads the collision table out of the two collisions', () => {
    const rows = tableOf(1).rows
    const coll = ofType(rs, 'COLLISION')
    const lost = ofType(rs, 'AMP_RESULT').filter((r) => !r.acked)
    expect(rows.length, 'one row per collision').toBe(coll.length)
    const [periodMs] = figs(NUMS, /路由器每 ([\d ]+) ms 整点开启一轮/, 'the period')
    for (const [i, row] of rows.entries()) {
      const c = coll[i]!
      expect(val(row[0]!), `row ${i}: the round it happened in`)
        .toBe(Math.floor(c.t / (periodMs! * MS)) + 1)
      const slot = ofType(rs, 'AMP_SLOT').find((r) => r.untilNs === c.t)!
      expect(val(row[1]!), `row ${i}: the slot both tags drew`).toBe(slot.slot)
      same(raw(row[2]!, /^([\d ]+) µs$/, `row ${i}: when they collided`)[0]!, c.t / US,
        `row ${i}: when they collided`)
      // 「Ack 点名」 is 「路由器自己」: the Ack after a collision names its own sender.
      const ack = txs(rs, 'ampAck').find((r) => r.t > c.t)!
      expect(ack.frame.dst, `row ${i}: the Ack names the router`).toBe(ack.frame.src)
      expect(row[3], `row ${i}: and the cell says so`).toBe('路由器自己')
      // 「标签得知」: when the tags learn, which is the result record's own instant.
      const learned = [...new Set(lost.filter((r) => r.t > c.t).map((r) => r.t))][0]!
      same(raw(row[4]!, /^([\d ]+) µs$/, `row ${i}: when the tags learn`)[0]!, learned / US,
        `row ${i}: when the tags learn`)
    }
    // The sentence above the table: it is not weak signal, it is two tags on one slot.
    const [twice, often] = raw(NUMS, /([一二三四五六七八九十]+)轮里有([一二三四五六七八九十两]+)轮，两个标签抽到了同一个数/,
      'the reason for the losses')
    expect(zh(twice!), 'the rounds of the second').toBe(ofType(rs, 'AMP_ROUND').length)
    expect(zh(often!), 'and the ones both tags drew the same slot in').toBe(coll.length)
  })

  it('reads the link-margin table and the decibels `deeper` makes of it', () => {
    const rows = (ampIntro.deeper!.filter((b) => b.kind === 'table')[0] as { rows: string[][] }).rows
    const s = ampIntro.scenario()
    const links = buildLinkTable(s.nodes, s.walls)
    const dl = rssiOn('2g', links, 'ap', 'tag-2')
    const ul = rssiOn('2g', links, 'tag-2', 'ap')
    // Downlink row: arrival, threshold, margin — and the margin is the difference of the two.
    same(raw(rows[0]![1]!, /^(−[\d.]+) dBm$/, 'the downlink arrival')[0]!, dl, 'the downlink arrival level')
    same(raw(rows[0]![2]!, /^(−[\d.]+) dBm$/, 'the tag’s sensitivity')[0]!, AMP_TAG_DL_SENS_DBM,
      'the tag’s own threshold')
    same(raw(rows[0]![3]!, /^([\d.]+) dB$/, 'the downlink margin')[0]!, dl - AMP_TAG_DL_SENS_DBM,
      'the downlink margin')
    // Uplink row, the same three.
    same(raw(rows[1]![1]!, /^(−[\d.]+) dBm$/, 'the uplink arrival')[0]!, ul, 'the uplink arrival level')
    same(raw(rows[1]![2]!, /^(−[\d.]+) dBm$/, 'the router’s floor')[0]!, ampUlSensDbm(250),
      'the router’s own floor')
    same(raw(rows[1]![3]!, /^([\d.]+) dB$/, 'the uplink margin')[0]!, ul - ampUlSensDbm(250),
      'the uplink margin')
    // The paragraph that explains the margin: the two transmit powers, and the floor it buys.
    const [tagDbm, apDbm] = figs(DEEP, /标签以 (\d+) dBm 发送，而路由器是 (\d+) dBm/,
      '`deeper` on the two transmit powers')
    const nodes = s.nodes as NodeCfg[]
    expect(tagDbm, 'the tag’s transmit power').toBe(nodes.find((n) => n.id === 'tag-2')!.txPowerDbm)
    expect(apDbm, 'and the router’s').toBe(nodes.find((n) => n.id === 'ap')!.txPowerDbm)
    same(raw(DEEP, /仍有 ([\d.]+) dB 余量/, '`deeper` on the uplink margin')[0]!, ul - ampUlSensDbm(250),
      'the uplink margin, printed a second time')
    const [kbps, floor, wifi, diff] = figs(DEEP,
      /路由器接收 (\d+) kb\/s 作答的 −(\d+) dBm 底线，比一帧普通 Wi-Fi 必须跨过的 −(\d+) dBm 还低约 (\d+) dB/,
      '`deeper` on what the floor is bought with')
    const rate = s.nodes[0]!.ampAp!.ulKbps
    expect(kbps, 'the uplink rate this scene runs at').toBe(rate)
    expect(-floor!, 'the floor at that rate').toBe(Math.round(ampUlSensDbm(rate)))
    expect(-wifi!, 'the preamble-detect threshold an OFDM frame must clear').toBe(CCA_PD_DBM)
    expect(diff, 'and the difference between them').toBe(Math.round(CCA_PD_DBM - ampUlSensDbm(rate)))
  })

  it('reads the ACWE algebra with its own exponent, and the draw that reaches the last slot', () => {
    const [acwe, base, minus, acw] = figs(DEEP,
      /窗口指数 ACWE，这里取 (\d+)，于是窗口 ACW = (\d+)² − (\d+) = (\d+)/,
      '`deeper` on the window')
    const round = ofType(rs, 'AMP_ROUND')[0]!
    expect(acwe, 'the exponent the trigger carries').toBe(round.acwe)
    expect(base, 'a binary window').toBe(2)
    expect(base! ** acwe! - minus!, 'the window the formula gives, with the printed exponent')
      .toBe(acw)
    expect(acw, 'which is the window the records carry')
      .toBe([...new Set(ofType(rs, 'AMP_ABOC').map((r) => r.acw))][0])
    // 「每个标签从 0、1、2、3 中抽一个 ABOC」: every value of the window, and nothing else.
    const [drawList] = raw(DEEP, /每个标签从 ([\d、 ]+?) 中抽一个 ABOC/, '`deeper` on the draw’s range')
    expect(drawList!.split('、').map((x) => Number(x.trim())),
      'the values a draw can take').toEqual([...Array(acw! + 1).keys()])
    // 「只有当……ACW + 1 > N 时，标签才会空转一轮」: the condition itself, before the numbers.
    const [condPlus] = figs(DEEP, /也就是 ACW \+ (\d+) > N 时/, '`deeper` on the condition’s shape')
    // 「ACW + 1 = 4 = N」: why no tag ever sits a round out, with both sides read.
    const [plus, n] = figs(DEEP, /这里 ACW \+ (\d+) = (\d+) = N/, '`deeper` on the condition')
    expect(condPlus, 'the condition and its instance add the same one').toBe(plus)
    expect(acw! + plus!, 'the slots the window can reach').toBe(n)
    expect(n, 'which is the slots the round has').toBe(round.slots)
    expect(ofType(rs, 'AMP_ABOC').filter((r) => r.slot === null).length,
      'so no tag sits a round out').toBe(0)
    // The same list of draws, printed a second time as the reason — the sweep found all four.
    const [again] = raw(DEEP, /所以([\d、 ]+?) 每一个结果都指向一个真实存在的时隙/,
      '`deeper` on the draws that all land somewhere')
    expect(again!.split('、').map((x) => Number(x.trim())),
      'every value of the window, printed again').toEqual([...Array(acw! + 1).keys()])
    // 「抽到 3 就落在时隙 4」, and it happens in this run.
    const [drew, lands] = figs(DEEP, /抽到 (\d+) 就落在时隙 (\d+)/, '`deeper` on the last slot')
    expect(drew! + plus!, 'the slot that draw points at').toBe(lands)
    expect(lands, 'the last slot there is').toBe(round.slots)
    expect(ofType(rs, 'AMP_ABOC').some((r) => r.aboc === drew && r.slot === lands),
      'and some tag really draws it').toBe(true)
  })

  it('reads the reservation `deeper` traces, and the two paddings beside it', () => {
    const cts = txs(rs, 'cts')[0]!
    const ctsEnd = ends(rs, 'cts')[0]!
    const [duration, endsAt, expires] = figs(DEEP,
      /Duration 是 ([\d ]+) µs。它在 (\d+) µs 结束，所以这份预留到 ([\d ]+) µs 到期/,
      '`deeper` on the reservation')
    expect(duration! * US, 'the Duration the CTS carries').toBe(cts.frame.durationFieldNs)
    expect(endsAt! * US, 'when the CTS itself ends').toBe(ctsEnd.t)
    expect(expires! * US, 'and when the reservation expires').toBe(ctsEnd.t + cts.frame.durationFieldNs)
    expect(expires, 'which is where the last Ack of the round stops')
      .toBe(firstRound(ends(rs, 'ampAck')).pop()!.t / US)
    // The tag's own signal, as long as its slot.
    same(raw(DEEP, /标签那 ([\d ]+) µs 的通断键控信号/, '`deeper` on the tag’s signal')[0]!,
      ofType(rs, 'AMP_ROUND')[0]!.slotNs / US, 'the slot a tag answers in')
    // The two paddings, which is the distinction the same paragraph draws.
    const [protectedUs, plainUs] = figs(DEEP, /填充 (\d+) µs 而不是 (\d+) µs/, '`deeper` on the two paddings')
    expect(protectedUs! * US, 'a protected AMP frame’s padding').toBe(AMP_PADDING_PROTECTED_NS)
    expect(plainUs! * US, 'and an unprotected one’s').toBe(AMP_PADDING_NS)
  })

  it('reads `sources` on the gap and the four model values', () => {
    /*
     * **Exempt, class (d): the 「2.4 GHz」.** It is the band's name, not a measurement — this
     * engine identifies the band as `'2g'` and holds no centre frequency for it — and the claim
     * the sentence makes about it is checked right here: that band's own SIFS is the AMP SIFS.
     */
    expect(SRC, 'the band is still named the way the sentence names it').toContain('2.4 GHz')
    expect(ERP_2G.sifsNs, 'and the claim about it: that band’s SIFS is this one').toBe(AMP_SIFS_NS)
    const [gapUs] = figs(SRC, /(\d+) µs 的 AMP SIFS/, '`sources` on the gap')
    expect(gapUs! * US, 'the AMP SIFS the lesson cites').toBe(AMP_SIFS_NS)
    // The four values the simulator chose, named as chosen.
    const [sens, dlSinr, kbps, ulSinr] = figs(SRC,
      /标签 −(\d+) dBm 的下行灵敏度、通断键控的 SINR 门限（下行 (\d+) dB，(\d+) kb\/s 上行 (\d+) dB）/,
      '`sources` on the model values')
    expect(-sens!, 'the tag’s downlink sensitivity').toBe(AMP_TAG_DL_SENS_DBM)
    expect(dlSinr, 'the downlink SINR threshold').toBe(AMP_DL_REQ_SINR_DB)
    expect([250, 1000], 'the rate the thresholds are quoted at is one the engine has').toContain(kbps)
    expect(ulSinr, 'and the uplink one at that rate')
      .toBe(AMP_UL_REQ_SINR_DB[kbps === 250 ? 250 : 1000])
    const [srcKbps, srcFloor] = figs(SRC, /路由器接收 (\d+) kb\/s 作答的 −(\d+) dBm 底线/,
      '`sources` on the floor')
    expect(srcKbps, 'the rate the floor is quoted at').toBe(kbps)
    expect(-srcFloor!, 'the floor itself')
      .toBe(Math.round(ampUlSensDbm(srcKbps === 250 ? 250 : 1000)))
  })

  it('reads both observe lines off the log, and the experiment’s own level', () => {
    // 「触发帧结束，隔一个 10 µs 的间隔，时隙 1 就打开」
    const [gapUs, slotNo] = figs(OBS, /隔一个 (\d+) µs 的间隔，时隙 (\d+) 就打开/,
      'the first observe line')
    const trigEnd = ends(rs, 'ampTrigger')[0]!
    const slot1 = firstRound(ofType(rs, 'AMP_SLOT'))[0]!
    expect(gapUs! * US, 'the gap between the trigger and the first slot').toBe(slot1.t - trigEnd.t)
    expect(slotNo, 'the slot that opens there').toBe(slot1.slot)
    // The two log lines, word for word out of `fmtRecord`.
    const [quotedAboc] = raw(OBS, /打印成 “(ABOC \d+ of \[\d+, \d+\] → slot \d+)”/,
      'the observe line’s ABOC quote')
    const [quotedResult] = raw(OBS, /打印成 “(slot \d+: acknowledged)”/,
      'the observe line’s result quote')
    const tagAboc = aboc(rs, 'tag-1#2g')
    const tagResults = results(rs, 'tag-1#2g')
    // `fmtRecord` puts the node's own name in front of both lines, and the lesson quotes the
    // part after it — which is the part a reader reads once they have selected that tag.
    const i = tagAboc.findIndex((r) => fmtRecord(r).endsWith(quotedAboc!))
    expect(i, `no draw of Fridge tag prints as 「${quotedAboc}」`).toBeGreaterThanOrEqual(0)
    expect(fmtRecord(tagAboc[i]!), 'and the line really is that tag’s').toContain('tag-1')
    expect(fmtRecord(tagResults[i]!).endsWith(quotedResult!),
      `the outcome of that same round prints as 「${fmtRecord(tagResults[i]!)}」`).toBe(true)
    // `tryThis`: the level the reader is told to raise the threshold past.
    const s = ampIntro.scenario()
    const links = buildLinkTable(s.nodes, s.walls)
    same(raw(TRY, /抬到高于它实际收到的 (−[\d.]+) dBm/, '`tryThis` on the arrival level')[0]!,
      rssiOn('2g', links, 'ap', 'tag-2'), 'what the Door tag actually receives')
    // The variant's label, which is reader-visible text with a figure in it.
    const [mbps] = figs(ampIntro.variants![0]!.label, /(\d+) Mb\/s/, 'the variant’s own label')
    const v = ampIntro.variants![0]!.scenario().nodes[0]!.ampAp!
    expect(mbps! * 1000, 'the rate both directions run at in that variant').toBe(v.dlKbps)
    expect(v.dlKbps, 'and both directions really are the same').toBe(v.ulKbps)
  })
})
