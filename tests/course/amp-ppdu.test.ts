/**
 * Every empirical claim in "A frame a tag can hear", measured against the
 * lesson's own scenario — the same scene amp-intro loads, so the split costs
 * the reader nothing and the recorded timeline hashes are the same run twice.
 *
 * The PPDU anatomy, the three frames' octets and airtimes, the padding, the
 * rate scaling, the CTS-to-self length and the frame-detail pins moved here
 * from tests/course/amp-intro.test.ts, each with the sentence it guards.
 *
 * Standard constants are checked against the engine's exports
 * (src/engine/amp.ts, src/engine/phy.ts) rather than re-typed.
 */
import { describe, it, expect } from 'vitest'
import { ampPpdu } from '../../src/course/amp/amp-ppdu'
import { ampIntroScenario } from '../../src/course/amp/amp-intro'
import { ScenarioSchema } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { zhNumeral } from './coverage'
import {
  AMP_ACK_BYTES, AMP_DL_REQ_SINR_DB, AMP_DL_SIG_BYTES, AMP_DL_SYNC_NS, AMP_LEGACY_PREAMBLE_NS,
  AMP_PADDING_NS, AMP_PADDING_PROTECTED_NS, AMP_SIFS_NS, AMP_TRIGGER_BODY_BYTES,
  AMP_UL_CHIP_NS, AMP_UL_REQ_SINR_DB, AMP_UL_SYNC_CHIPS, ampBitsNs, ampDlPpduNs, ampRespBytes,
  ampTriggerBytes, ampUlPpduNs, type AmpDlKbps, type AmpUlKbps,
} from '../../src/engine/amp'
import { ACK_TX_TIME_6M_NS, CTS_BYTES, ERP_2G, txTimeNs } from '../../src/engine/phy'
import { decodeFrame, ppduLayout } from '../../src/model/frameFields'
import { MODULES } from '../../src/course/curriculum'

const MS = 1_000_000
const US = 1_000
const RUN_NS = 1000 * MS

/** This lesson's records, from the kit's shared memo: amp-intro's scene, run once per worker. */
const recs = (variant?: number): TLRecord[] => runOf(ampPpdu, variant, RUN_NS)
const txs = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_START').filter((r) => r.frame.kind === kind)
const ends = (rs: TLRecord[], kind: string) => ofType(rs, 'TX_END').filter((r) => r.frame.kind === kind)

// The contract every migrated lesson owes, written once in tests/course/kit.ts.
// `sameSceneAs` is the split rule: amp-ppdu loads amp-intro's scene, so its
// recorded timeline hashes are amp-intro's, value for value.
lessonShapeSuite(ampPpdu, { runNs: RUN_NS, sameSceneAs: 'amp-intro' })

describe('amp-ppdu · the lesson’s own scene', () => {
  it('is the second lesson of the AMP track', () => {
    expect(MODULES[ampPpdu.module].title).toBe('环境能量物联网（802.11bp）')
    expect(ampPpdu.needs).toEqual(['amp-intro'])
    // the second lesson of the AMP track may use a table in the picture, and gets up to six new
    // words. `preamble` is one of them although the reader met it in Wi-Fi Tier 1: this lesson
    // leans on it hard enough that it is reminded rather than assumed.
    expect(ampPpdu.terms!.map((t) => t.term))
      .toEqual(['OOK', 'Manchester', 'preamble', 'AMP-Sync', 'AMP-SIG', 'padding'])
  })

  it('the scenario and the variant are amp-intro’s own, and pass the schema', () => {
    // "Both lessons load the same scene": the split adds no new scenario, so the recorded
    // timeline hashes of amp-ppdu are amp-intro's, value for value.
    expect(ampPpdu.scenario()).toEqual(ampIntroScenario({ dlKbps: 250, ulKbps: 250 }))
    expect(ampPpdu.variants!.map((v) => v.scenario())).toEqual([ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 })])
    expect(() => ScenarioSchema.parse(ampPpdu.scenario())).not.toThrow()
    for (const v of ampPpdu.variants!) expect(() => ScenarioSchema.parse(v.scenario())).not.toThrow()
  })

})

describe('amp-ppdu · what a downlink frame is made of', () => {
  it('the downlink PPDU is a legacy preamble, then AMP-Sync, AMP-SIG, the data and the padding', () => {
    // the formula "32 + 80 + 64 + 416 + 20 + 6 = 618 µs", its note ("The first 32 µs is ordinary
    //  Wi-Fi; everything after it is the tag's. Only the two middle rows shrink when the rate
    //  rises — the AMP-SIG to 16 µs at 1 Mb/s") and the "What the strip is made of" table beside
    //  it, row by row: legacy preamble 16 µs · L-SIG 4 µs · U-SIG 12 µs · AMP-Sync 80 µs ·
    //  AMP-SIG, 2 octets 64 µs · trigger body, 13 octets 416 µs · padding 20 µs · extension 6 µs.
    expect(AMP_LEGACY_PREAMBLE_NS).toBe(32 * US)
    expect(AMP_DL_SYNC_NS).toBe(80 * US)
    expect(AMP_DL_SIG_BYTES).toBe(2)
    expect(ampBitsNs(2 * 8, 250)).toBe(64 * US)
    expect(ampBitsNs(2 * 8, 1000)).toBe(16 * US)
    expect(ampBitsNs(13 * 8, 250)).toBe(416 * US)
    expect(ERP_2G.signalExtNs).toBe(6 * US)
    expect(32 + 80 + 64 + 416 + 20 + 6).toBe(618)
    // "the 32 + 80 + 20 + 6 = 138 µs of preamble, sync, padding and extension does not [shrink]"
    expect(32 + 80 + 20 + 6).toBe(138)
    // the segments really are in that order on the air. The "32 µs of legacy preamble" the lesson
    // names is the first three of them together: the preamble proper, the legacy signal field and
    // the U-SIG a Wi-Fi 7 radio reads.
    const dl = ppduLayout(txs(recs(), 'ampTrigger')[0].frame)
    expect(dl.map((s) => s.key))
      .toEqual(['legacyPreamble', 'signal', 'usig', 'ampSync', 'ampSig', 'ampData', 'padding', 'signalExt'])
    expect(dl.slice(0, 3).reduce((s, x) => s + x.durNs, 0)).toBe(AMP_LEGACY_PREAMBLE_NS)
  })

  it('padding is 20 µs unprotected and 36 µs protected, and every frame here is unprotected', () => {
    // the padding table's two rows: "unprotected — every frame in this scene | 20 µs" and
    //  "protected, meaning encrypted | 36 µs". The clause they come from is in `sources`, not in
    //  a table cell: the beginner read found a citation inside the main teaching table jarring.
    expect(AMP_PADDING_NS).toBe(20 * US)
    expect(AMP_PADDING_PROTECTED_NS).toBe(36 * US)
    const dl = ofType(recs(), 'TX_START').filter((r) => r.frame.amp?.dir === 'dl')
    expect(dl.length).toBe(50) // 10 triggers + 40 Acks
    for (const r of dl) expect(r.frame.amp!.padNs).toBe(AMP_PADDING_NS)
    expect(dl.some((r) => r.frame.amp!.padNs === AMP_PADDING_PROTECTED_NS)).toBe(false)
    // "all of it inside one AMP SIFS" — the gap the padding buys the tag time within
    expect(AMP_SIFS_NS).toBe(10 * US)
  })

  it('the uplink PPDU has no legacy preamble and therefore no signal extension', () => {
    // "no Wi-Fi preamble at all — a tag could not produce one — just its own short AMP-Sync and then
    //  the octets. So a Wi-Fi station beside a tag can tell something is on the air, but never that
    //  it is a frame: there is nothing to lock onto." The 48 chips of AMP-Sync are 48 µs at
    //  250 kb/s and 12 µs at 1 Mb/s.
    expect(AMP_UL_SYNC_CHIPS).toBe(48)
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[250]).toBe(48 * US)
    expect(AMP_UL_SYNC_CHIPS * AMP_UL_CHIP_NS[1000]).toBe(12 * US)
    const ul = ppduLayout(txs(recs(), 'ampResp')[0].frame).map((s) => s.key)
    expect(ul).toEqual(['ampSync', 'ampData'])
    expect(ul).not.toContain('legacyPreamble')
    expect(ul).not.toContain('signalExt')
  })

  it('the three frames are 13, 4 and 15 octets', () => {
    // the "Octets" column of the three-AMP-frames table, and "An answer that names only itself is
    //  7 octets, used in a later lesson; this one carries the reading inline, so it is 15."
    expect(ampTriggerBytes(0)).toBe(13)
    expect(AMP_ACK_BYTES).toBe(4)
    expect(ampRespBytes(true)).toBe(15)
    expect(ampRespBytes(false)).toBe(7)
  })

  it('at 250 kb/s the airtimes are 618, 330 and 528 µs; at 1 Mb/s, 258, 186 and 132 µs', () => {
    // the "250 kb/s" and "1 Mb/s" columns of the three-AMP-frames table
    const ext = ERP_2G.signalExtNs
    expect(ampDlPpduNs(250, ampTriggerBytes(0), ext)).toBe(618 * US)
    expect(ampDlPpduNs(250, AMP_ACK_BYTES, ext)).toBe(330 * US)
    expect(ampUlPpduNs(250, ampRespBytes(true))).toBe(528 * US)
    expect(ampDlPpduNs(1000, ampTriggerBytes(0), ext)).toBe(258 * US)
    expect(ampDlPpduNs(1000, AMP_ACK_BYTES, ext)).toBe(186 * US)
    expect(ampUlPpduNs(1000, ampRespBytes(true))).toBe(132 * US)
  })

  it('at 250 kb/s the trigger is longest and the Ack shortest, but only the response scales by four', () => {
    // "Raise the rate four-fold and the answer takes a quarter of the air: 528 µs becomes 132 µs,
    //  having no fixed opening to dilute it. The trigger has 138 µs no rate can touch, so it falls
    //  only to 258 µs." The 138 µs is named field by field in the formula note above.
    const ext = ERP_2G.signalExtNs
    const trig250 = ampDlPpduNs(250, ampTriggerBytes(0), ext)
    const ack250 = ampDlPpduNs(250, AMP_ACK_BYTES, ext)
    const resp250 = ampUlPpduNs(250, ampRespBytes(true))
    expect(trig250).toBeGreaterThan(resp250)
    expect(resp250).toBeGreaterThan(ack250)
    // the response is pure payload: a four-fold rate step is a four-fold airtime step
    expect(resp250 / ampUlPpduNs(1000, ampRespBytes(true))).toBe(4)
    // the trigger is not, because 138 µs of it is rate-independent (padding does not shrink either)
    const fixedNs = AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS + AMP_PADDING_NS + ext
    expect(fixedNs).toBe(138 * US)
    const trig1000 = ampDlPpduNs(1000, ampTriggerBytes(0), ext)
    expect(trig250 / trig1000).toBeLessThan(4)
    expect(trig250 - fixedNs).toBe(4 * (trig1000 - fixedNs))
  })

  it('the Ack spends 128 µs of its 330 µs on the four octets it carries', () => {
    // the formula "4 octets at 250 kb/s = 128 µs + 202 µs of wrapper = 330 µs" and its note:
    //  "The wrapper — opening, AMP-Sync, AMP-SIG, padding, extension — is paid in full for four
    //  octets."
    const toTag = txs(recs(), 'ampAck')[0]
    const ppdu = decodeFrame(toTag.frame, { apId: 'ap', isEdca: false }).ppdu
    expect(ppdu.find((s) => s.key === 'ampData')!.durNs).toBe(128 * US)
    expect(ppdu.reduce((s, x) => s + x.durNs, 0)).toBe(330 * US)
    expect(330 - 128).toBe(202)
  })

  it('an ordinary Wi-Fi CTS of fourteen octets takes 50 µs, a sixth of the four-octet Ack', () => {
    // the same note: "The CTS that clears the air is fourteen octets of ordinary Wi-Fi: 44 µs
    //  at 6 Mb/s plus the band's 6 µs. Three and a half times the content, under a sixth of the
    //  airtime."
    expect(CTS_BYTES).toBe(14)
    expect(txTimeNs(CTS_BYTES, 6)).toBe(44 * US)
    expect(ACK_TX_TIME_6M_NS).toBe(44 * US)
    expect(txTimeNs(CTS_BYTES, 6) + ERP_2G.signalExtNs).toBe(50 * US)
    const cts = txs(recs(), 'cts')[0]
    expect(cts.frame.bytes).toBe(14)
    // the engine already folds the band's signal extension into the frame's airtime
    expect(cts.frame.txTimeNs).toBe(50 * US)
    expect(ampDlPpduNs(250, AMP_ACK_BYTES, ERP_2G.signalExtNs)).toBeGreaterThan(6 * (50 * US))
  })
})

describe('amp-ppdu · what the frame detail shows', () => {
  const rs = recs()
  const CTX = { apId: 'ap', isEdca: false }

  it('the Ack’s ID field names the tag it acknowledges, or the AP when the slot was empty', () => {
    // "Open the Ack at 1226 µs in frame detail: its ID field is two octets and names the Door tag.
    //  Then the one at 2982 µs, closing an empty slot — same 330 µs, same four octets, but the ID
    //  field holds the router’s own id."
    const toTag = txs(rs, 'ampAck')[0]
    expect(toTag.t).toBe(1226 * US)
    const idField = decodeFrame(toTag.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ampId')!
    expect(idField.bytes).toBe(2)
    expect(idField.node).toBe('tag-2')
    const empty = txs(rs, 'ampAck').find((r) => r.frame.dst === r.frame.src)!
    expect(empty.t).toBe(2982 * US)
    expect(empty.frame.txTimeNs).toBe(330 * US)
    expect(empty.frame.bytes).toBe(4)
    expect(decodeFrame(empty.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'ampId')!.node).toBe('ap')
  })

  it('the trigger’s six-octet body carries the numbers the round is built from', () => {
    // "Its 6-octet body decodes into session, window and slots" — those fields are the round's
    // own parameters, so the decode is pinned against them.
    const trig = txs(rs, 'ampTrigger')[0]
    const body = decodeFrame(trig.frame, CTX).users[0].subframes[0].mpdu.fields.find((f) => f.key === 'body')!
    expect(body.bytes).toBe(6)
    expect(body.value).toBe('Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading')
    expect(trig.frame.dst).toBe('*amp')
  })

  it('the trigger’s segment strip adds up to the formula, legacy half first', () => {
    // observe: "Open the first trigger and read its strip left to right, checking each segment
    //  against the table above" — so the strip the simulator draws must be the table's rows, in
    //  the table's order. The picture calls the last one "a scrap of quiet the band adds after
    //  any frame with a Wi-Fi opening".
    const trig = txs(rs, 'ampTrigger')[0]
    const strip = decodeFrame(trig.frame, CTX).ppdu
    expect(strip.map((s) => s.durNs / US)).toEqual([16, 4, 12, 80, 64, 416, 20, 6])
    expect(16 + 4 + 12).toBe(32)
    expect(strip.reduce((s, x) => s + x.durNs, 0)).toBe(618 * US)
    expect(trig.frame.txTimeNs).toBe(618 * US)
  })
})

describe('amp-ppdu · the 1 Mb/s experiment', () => {
  it('at 1 Mb/s the same round is 1670 µs, 1.67 % of each 100 ms', () => {
    // the formula "The same round at 1 Mb/s": "50 + 10 + 258 + 4 × (10 + 132 + 10 + 186) =
    //  1670 µs = 1.67 % of 100 ms", and its note: "The trigger now ends at 318 µs and slot 1
    //  opens at 328 µs; the CTS Duration that covers the round is 1620 µs." The experiment sends
    //  the reader to check the round against that arithmetic.
    const fast = recs(0)
    const total = 50 + 10 + 258 + 4 * (10 + 132 + 10 + 186)
    expect(total).toBe(1670)
    const cts = txs(fast, 'cts')[0]
    expect(cts.frame.durationFieldNs).toBe(1620 * US)
    const lastAck = ends(fast, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(lastAck.t - cts.t).toBe(1670 * US)
    expect(((1670 / 100_000) * 100).toFixed(2)).toBe('1.67')
    expect(ends(fast, 'ampTrigger')[0].t).toBe(318 * US)
    expect(ofType(fast, 'AMP_SLOT')[0].t).toBe(328 * US)
    expect(ofType(fast, 'AMP_ROUND')[0].slotNs).toBe(132 * US)
    // the 250 kb/s half of the same sentence, measured here rather than trusted from
    // tests/course/amp-intro.test.ts: both lessons load the same scenario, but a reader of
    // this file alone should still see where 4190 µs and 4.19 % come from.
    const base = recs()
    const baseLast = ends(base, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    expect(baseLast.t - txs(base, 'cts')[0].t).toBe(4190 * US)
    expect(((4190 / 100_000) * 100).toFixed(2)).toBe('4.19')
  })
})

/**
 * **Every figure the lesson prints, read back out of the lesson.**
 *
 * Everything above measures the engine and compares it with a literal written in THIS file, the
 * lesson's row or formula quoted in a comment beside it. Two of them go further and do the
 * lesson's arithmetic here: `expect(32 + 80 + 64 + 416 + 20 + 6).toBe(618)` and
 * `expect(16 + 4 + 12).toBe(32)` are the formula's terms typed on the test side, and they would
 * hold if every figure in the lesson changed.
 *
 * `@amp-ppdu` hand-types 26 figures into its graded prose, across four formulas and four tables
 * — and it is the one lesson on the ratchet's list whose `limits` is empty, so nothing else here
 * carries its figures either. What follows is the other half of each assertion above, with no
 * figure on this side: the strip table read against the PPDU the simulator actually draws, in
 * order, segment for segment; the three-frame table in both rate columns; the padding table; the
 * three formulas, each of whose sums is checked from its own terms; and the two fraction claims
 * (「四分之一」, 「不到六分之一」), which live nowhere but the prose.
 *
 * **The reader column of the strip table is not read, and that is deliberate.** 「每一台 Wi-Fi
 * 射频」 / 「标签」 / 「没人：它换来的是标签的处理时间」 is an argument about who decodes what, and
 * an assertion over it would fail about how a sentence is written — the class the 2026-09-25
 * ruling deletes. The boundary it draws IS graded, as a figure: the rows above the AMP half sum
 * to the formula's own 32 µs.
 */
/** The access point's own AMP section: where this lesson's two rates live. */
const apCfg = (sc = ampPpdu.scenario()) => sc.nodes.find((n) => n.kind === 'ap')!.ampAp!

describe('amp-ppdu · every printed figure is read back out of the lesson', () => {
  const rs = recs()
  const trig = txs(rs, 'ampTrigger')[0]
  const ack = txs(rs, 'ampAck')[0]
  const resp = txs(rs, 'ampResp')[0]
  const CTX = { apId: 'ap', isEdca: false }
  const tableWith = (fragment: string): { heading: string; head: string[]; rows: string[][] } => {
    const b = ampPpdu.numbers!.find((x) => x.kind === 'table' && (x.heading ?? '').includes(fragment))
    expect(b, `no table whose heading contains 「${fragment}」`).toBeDefined()
    return b as { heading: string; head: string[]; rows: string[][] }
  }
  const formulaWith = (fragment: string): { text: string; note?: string } => {
    const b = ampPpdu.numbers!.find((x) => x.kind === 'formula' && (x.heading ?? '').includes(fragment))
    expect(b, `no formula whose heading contains 「${fragment}」`).toBeDefined()
    return b as { text: string; note?: string }
  }
  /** 「618 µs」 → 618; 「1.67 %」 → 1.67. */
  const val = (s: string): number => Number(s.replace(/[^\d.]/g, ''))
  /** A printed figure against a measurement, rounded to the decimals the figure itself carries. */
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const zhCount = (s: string): number | null => zhNumeral(s.replace(/两/g, '二'))
  /**
   * A rate the lesson names, as the engine's own type. The membership test is the point: the
   * union is `AmpDlKbps`, so a bare cast would silence exactly the case worth catching — a
   * lesson that prints a rate this engine cannot produce a PPDU for.
   */
  const kbps = (n: number): AmpDlKbps => {
    expect(Object.keys(AMP_UL_CHIP_NS).map(Number), `${n} kb/s is not a rate this engine has`)
      .toContain(n)
    return n as AmpDlKbps
  }

  it('the strip table: eight rows against the eight segments the simulator draws, in order', () => {
    const t = tableWith('这条带子由什么组成')
    const strip = decodeFrame(trig.frame, CTX).ppdu
    expect(t.rows, 'one row per segment of the PPDU, and no more').toHaveLength(strip.length)
    t.rows.forEach((row, i) => {
      same(row[1].replace(' µs', ''), strip[i].durNs / US, `row ${i} (「${row[0]}」): its duration`)
    })
    // the head cell names the rate the middle column is at, and it is the rate the frame used
    const rate = /^(\d+) kb\/s$/.exec(t.head[1])
    expect(rate, `「${t.head[1]}」 does not name a rate`).not.toBeNull()
    expect(Number(rate![1]), 'the rate this column is measured at').toBe(trig.frame.amp!.kbps)
    // two labels carry figures of their own: 「AMP-SIG，2 个字节」 and 「帧体，13 个字节」
    const sig = /AMP-SIG，(\d+) 个字节/.exec(t.rows.map((r) => r[0]).join('\n'))
    expect(sig, 'no row names the AMP-SIG’s octets').not.toBeNull()
    expect(Number(sig![1]), 'the AMP-SIG’s octets').toBe(AMP_DL_SIG_BYTES)
    const body = /帧体（Frame Body），(\d+) 个字节/.exec(t.rows.map((r) => r[0]).join('\n'))
    expect(body, 'no row names the trigger body’s octets').not.toBeNull()
    expect(Number(body![1]), 'the trigger body’s octets').toBe(ampTriggerBytes(0))
    // and the whole strip is the frame
    expect(t.rows.reduce((s, r) => s + val(r[1]), 0) * US, 'the rows add up to the frame')
      .toBe(trig.frame.txTimeNs)
  })

  it('the 618 µs formula: six terms, the sum it states, and the 32 µs boundary', () => {
    const f = formulaWith('618 µs 由什么组成')
    const m = /^AMP Trigger @ (\d+) kb\/s = (\d+) \+ (\d+) \+ (\d+) \+ (\d+) \+ (\d+) \+ (\d+) = (\d+) µs$/
      .exec(f.text)
    expect(m, 'the formula no longer states its six terms and their sum').not.toBeNull()
    expect(Number(m![1]), 'the rate the formula is at').toBe(trig.frame.amp!.kbps)
    const terms = [2, 3, 4, 5, 6, 7].map((i) => Number(m![i]))
    expect(terms.reduce((a, b) => a + b, 0), 'the lesson’s own addition').toBe(Number(m![8]))
    same(m![8], trig.frame.txTimeNs / US, 'and the frame it adds up to')
    // the six terms are the strip with its legacy three folded into one, which is what the note
    // says: 「开头的 32 µs 是普通 Wi-Fi，其后的一切都是发给标签的」
    const strip = decodeFrame(trig.frame, CTX).ppdu
    const legacy = /开头的 (\d+) µs 是普通 Wi-Fi/.exec(f.note ?? '')
    expect(legacy, 'the note no longer names the Wi-Fi opening').not.toBeNull()
    same(legacy![1], AMP_LEGACY_PREAMBLE_NS / US, 'the Wi-Fi opening')
    const folded = strip.length - terms.length + 1
    expect(strip.slice(0, folded).reduce((s, x) => s + x.durNs, 0),
      'the segments the formula folds into that opening').toBe(AMP_LEGACY_PREAMBLE_NS)
    expect(terms[0] * US, 'which is the formula’s first term').toBe(AMP_LEGACY_PREAMBLE_NS)
    // 「AMP-SIG 在 1 Mb/s 下是 16 µs」: the one term the note follows up the ladder
    const faster = /AMP-SIG 在 (\d+) Mb\/s 下是 (\d+) µs/.exec(f.note ?? '')
    expect(faster, 'the note no longer states the AMP-SIG at the higher rate').not.toBeNull()
    same(faster![2], ampBitsNs(AMP_DL_SIG_BYTES * 8, Number(faster![1]) * 1000) / US,
      `the AMP-SIG at ${faster![1]} Mb/s`)
  })

  it('the three-frame table: octets and both rate columns, nine cells and the headings', () => {
    const t = tableWith('三种 AMP 帧')
    const rates = t.head.slice(2).map((h) => {
      const m = /^(\d+) (kb|Mb)\/s$/.exec(h)
      expect(m, `「${h}」 does not name a rate`).not.toBeNull()
      return kbps(Number(m![1]) * (m![2] === 'Mb' ? 1000 : 1))
    })
    expect(rates, 'the two rate columns the table compares').toEqual([250, 1000])
    const ext = ERP_2G.signalExtNs
    const ROWS: readonly (readonly [RegExp, number, (k: AmpDlKbps) => number])[] = [
      [/^AMP Trigger（下行）$/, ampTriggerBytes(0), (k) => ampDlPpduNs(k, ampTriggerBytes(0), ext)],
      [/^AMP Ack（下行）$/, AMP_ACK_BYTES, (k) => ampDlPpduNs(k, AMP_ACK_BYTES, ext)],
      [/^带读数的作答（上行）$/, ampRespBytes(true), (k) => ampUlPpduNs(k, ampRespBytes(true))],
    ]
    expect(t.rows, 'the table states exactly the frames this reads').toHaveLength(ROWS.length)
    t.rows.forEach((row, i) => {
      const [re, bytes, airtime] = ROWS[i]
      expect(re.exec(row[0]), `row ${i}: 「${row[0]}」 is not the frame this reads`).not.toBeNull()
      expect(Number(row[1]), `row ${i}: its octets`).toBe(bytes)
      rates.forEach((kbps, j) => {
        same(row[2 + j].replace(' µs', ''), airtime(kbps) / US, `row ${i} at ${kbps} kb/s`)
      })
    })
    // the three frames of this run really are those three airtimes at the scene's own rate
    for (const [tx, i] of [[trig, 0], [ack, 1], [resp, 2]] as const) {
      same(t.rows[i][2].replace(' µs', ''), tx.frame.txTimeNs / US,
        `row ${i}: and the frame the run sends`)
    }
    // 「只报自己身份的作答是 7 个字节 … 这里的作答把读数直接带在里面，所以是 15 个字节」
    const p = (ampPpdu.numbers! as { text?: string }[]).map((x) => x.text ?? '').join('\n')
    const two = /只报自己身份的作答是 (\d+) 个字节[^]*?所以是 (\d+) 个字节/.exec(p)
    expect(two, 'the paragraph no longer contrasts the two answer sizes').not.toBeNull()
    expect([Number(two![1]), Number(two![2])], 'the bare answer and the one carrying a reading')
      .toEqual([ampRespBytes(false), ampRespBytes(true)])
  })

  it('the rate paragraph: the four-fold step, the quarter, and the 138 µs no rate touches', () => {
    const p = (ampPpdu.numbers! as { heading?: string; text?: string }[])
      .filter((x) => (x.heading ?? '').includes('提高速率省下了什么')).map((x) => x.text ?? '')[0]
    expect(p, 'the rate paragraph is gone').toBeDefined()
    const m = /速率提高([一二三四五六七八九十]+)倍，作答占用的空口时间就真的只剩([一二三四五六七八九十]+)分之一：(\d+) µs 变成 (\d+) µs[^]*?(\d+) µs 任凭速率怎么变都省不掉，所以它只能降到 (\d+) µs/
      .exec(p!)
    expect(m, 'the rate paragraph is no longer in the shape this reads').not.toBeNull()
    const ext = ERP_2G.signalExtNs
    const [slow, fast] = [kbps(trig.frame.amp!.kbps), kbps(trig.frame.amp!.kbps * zhCount(m![1])!)]
    const resp250 = ampUlPpduNs(slow, ampRespBytes(true))
    const respFast = ampUlPpduNs(fast, ampRespBytes(true))
    same(m![3], resp250 / US, 'the answer at the scene’s rate')
    same(m![4], respFast / US, `and at ${fast} kb/s`)
    // 「只剩四分之一」: the answer is pure payload, so the step is exact — not approximate
    expect(resp250 / respFast, `the answer really is a ${m![2]}-fold step`).toBe(zhCount(m![2]))
    // 「138 µs 任凭速率怎么变都省不掉」: the four fixed fields, from the engine's own constants
    const fixed = AMP_LEGACY_PREAMBLE_NS + AMP_DL_SYNC_NS + AMP_PADDING_NS + ext
    same(m![5], fixed / US, 'the part of a downlink frame no rate can shrink')
    same(m![6], ampDlPpduNs(fast, ampTriggerBytes(0), ext) / US, 'so the trigger falls only this far')
    // and the claim that makes the paragraph: everything but the fixed part did scale
    expect(ampDlPpduNs(slow, ampTriggerBytes(0), ext) - fixed,
      'the rest of the trigger scales exactly')
      .toBe(zhCount(m![1])! * (ampDlPpduNs(fast, ampTriggerBytes(0), ext) - fixed))
  })

  it('the padding table: both values, and which one every frame in this scene carries', () => {
    const t = tableWith('填充有多少')
    expect(t.rows, 'the table states exactly two kinds of downlink frame').toHaveLength(2)
    same(t.rows[0][1].replace(' µs', ''), AMP_PADDING_NS / US, 'the unprotected padding')
    same(t.rows[1][1].replace(' µs', ''), AMP_PADDING_PROTECTED_NS / US, 'and the protected one')
    // 「非保护帧——本场景里的每一帧」 is a claim about the run, and it is checkable
    expect(t.rows[0][0], 'the first row is the one that says 「every frame in this scene」')
      .toContain('本场景里的每一帧')
    const dl = ofType(rs, 'TX_START').filter((r) => r.frame.amp?.dir === 'dl')
    expect(dl.length, 'and there are downlink frames to check').toBeGreaterThan(0)
    expect(new Set(dl.map((r) => r.frame.amp!.padNs)), 'all of them carry that padding')
      .toEqual(new Set([val(t.rows[0][1]) * US]))
  })

  it('the Ack formula: the octets, the wrapper, and the CTS it is compared with', () => {
    const f = formulaWith('330 µs 花在哪儿')
    const m = /^(\d+) kb\/s 下的 (\d+) 个字节 = (\d+) µs \+ (\d+) µs 的外壳 = (\d+) µs$/.exec(f.text)
    expect(m, 'the Ack formula is no longer in the shape this reads').not.toBeNull()
    expect(Number(m![1]), 'the rate').toBe(ack.frame.amp!.kbps)
    expect(Number(m![2]), 'the octets an Ack carries').toBe(AMP_ACK_BYTES)
    const strip = decodeFrame(ack.frame, CTX).ppdu
    const data = strip.find((s) => s.key === 'ampData')!
    same(m![3], data.durNs / US, 'the octets’ own airtime')
    same(m![5], ack.frame.txTimeNs / US, 'the frame')
    // the wrapper is the sum minus the data, which the formula states as its own second term
    same(m![4], (ack.frame.txTimeNs - data.durNs) / US, 'and the wrapper around it')
    expect(Number(m![3]) + Number(m![4]), 'the lesson’s own addition').toBe(Number(m![5]))
    // the note's CTS: fourteen octets of ordinary Wi-Fi at 6 Mb/s, plus the band's extension
    const n = /([两一二三四五六七八九十]+)个字节的普通 Wi-Fi，(\d+) Mb\/s 下 (\d+) µs，再加本频段的 (\d+) µs/
      .exec(f.note ?? '')
    expect(n, 'the note no longer prices the CTS').not.toBeNull()
    expect(zhCount(n![1]), 'the CTS’s octets').toBe(CTS_BYTES)
    same(n![3], txTimeNs(CTS_BYTES, Number(n![2])) / US, `a CTS at ${n![2]} Mb/s`)
    same(n![4], ERP_2G.signalExtNs / US, 'the band’s own extension')
    const cts = txs(rs, 'cts')[0]
    expect(cts.frame.txTimeNs, 'which together are the CTS this run sends')
      .toBe((Number(n![3]) + Number(n![4])) * US)
    // 「内容是三倍半，空口时间却不到六分之一」: both ratios, each with its own direction
    const r = /内容是([一二三四五六七八九十]+)倍半，空口时间却不到([一二三四五六七八九十]+)分之一/
      .exec(f.note ?? '')
    expect(r, 'the note no longer states the two ratios').not.toBeNull()
    expect(CTS_BYTES / AMP_ACK_BYTES, `the content ratio, 「${r![1]}倍半」`)
      .toBe(zhCount(r![1])! + 0.5)
    expect(cts.frame.txTimeNs * zhCount(r![2])!, 'and the airtime, under a sixth')
      .toBeLessThan(ack.frame.txTimeNs)
  })

  it('the 1 Mb/s round: every term of the sum, the share, and both instants in the note', () => {
    const f = formulaWith('换成 1 Mb/s')
    const m = /^(\d+) \+ (\d+) \+ (\d+) \+ (\d+) × \((\d+) \+ (\d+) \+ (\d+) \+ (\d+)\) = (\d+) µs = (\d+) ms 的 ([\d.]+) %$/
      .exec(f.text)
    expect(m, 'the 1 Mb/s formula is no longer in the shape this reads').not.toBeNull()
    const n = (i: number) => Number(m![i])
    // the lesson's own arithmetic first
    expect(n(1) + n(2) + n(3) + n(4) * (n(5) + n(6) + n(7) + n(8)), 'the sum it states').toBe(n(9))
    const fast = recs(0)
    const cts = txs(fast, 'cts')[0]
    const slots = ofType(fast, 'AMP_SLOT')
    // each term against the run: the CTS, the gap, the trigger, and the four slots
    same(`${n(1)}`, cts.frame.txTimeNs / US, 'the CTS that opens the round')
    same(`${n(2)}`, AMP_SIFS_NS / US, 'the gap after it')
    same(`${n(3)}`, txs(fast, 'ampTrigger')[0].frame.txTimeNs / US, 'the trigger')
    expect(n(4), 'the slots the round holds').toBe(slots.filter((s) => s.t < 5 * MS).length)
    same(`${n(6)}`, txs(fast, 'ampResp')[0].frame.txTimeNs / US, 'an answer')
    same(`${n(8)}`, txs(fast, 'ampAck')[0].frame.txTimeNs / US, 'and its Ack')
    // the round it adds up to, measured from the CTS to the last Ack of the round
    const lastAck = ends(fast, 'ampAck').filter((r) => r.t <= 5 * MS).pop()!
    same(`${n(9)}`, (lastAck.t - cts.t) / US, 'the round the terms add up to')
    // and the share, to the decimals the lesson prints
    same(m![11], (100 * (lastAck.t - cts.t)) / (n(10) * MS), `its share of ${n(10)} ms`)
    // the note: 「触发帧现在在 318 µs 结束，时隙 1 在 328 µs 打开；CTS Duration 是 1620 µs」
    const note = /触发帧现在在 (\d+) µs 结束，时隙 (\d+) 在 (\d+) µs 打开；覆盖这一轮的 CTS Duration 是 (\d+) µs/
      .exec(f.note ?? '')
    expect(note, 'the note no longer states the two instants and the Duration').not.toBeNull()
    same(note![1], ends(fast, 'ampTrigger')[0].t / US, 'when the trigger ends')
    same(note![3], slots[Number(note![2]) - 1].t / US, `when slot ${note![2]} opens`)
    same(note![4], cts.frame.durationFieldNs / US, 'and the Duration covering the round')
  })

  /**
   * **The twenty-nine sites `scripts/figure-planting.ts` found this file still not reading**, on
   * 2026-10-12, after everything above. All of them are outside `numbers`: this lesson's prose
   * lives in `sources`, `observe`, `tryThis`, the variant's own label and the quiz, and those
   * five restate almost every figure the tables establish — the two padding values, the two
   * SINR thresholds, the legacy wrapper's three pieces, the Ack's 330 µs and its split, the
   * rate of the variant, and two instants from the run.
   *
   * `limits` is empty here on purpose (the AMP track is paused and `limits.test.ts` names this
   * lesson), so there is nothing to read there.
   */
  it('`sources`: the padding pair, the two thresholds, and the legacy wrapper’s three pieces', () => {
    const src = ampPpdu.sources!.join('\n')
    // 「非保护帧 20 µs、受保护帧 36 µs」
    const pad = /非保护帧 (\d+) µs、受保护帧 (\d+) µs/.exec(src)
    expect(pad, '`sources` no longer states the two padding values').not.toBeNull()
    same(pad![1], AMP_PADDING_NS / US, 'the padding of an unprotected round')
    same(pad![2], AMP_PADDING_PROTECTED_NS / US, 'and of a protected one')
    // 「OOK SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）」
    const sinr = /下行 (\d+) dB，(\d+) kb\/s 上行 (\d+) dB/.exec(src)
    expect(sinr, '`sources` no longer states the two thresholds').not.toBeNull()
    expect(Number(sinr![1]), 'the downlink threshold').toBe(AMP_DL_REQ_SINR_DB)
    const ulKbps = Number(sinr![2])
    expect(AMP_UL_REQ_SINR_DB[ulKbps as AmpUlKbps], `the uplink threshold at ${ulKbps} kb/s`)
      .toBe(Number(sinr![3]))
    expect(ulKbps, 'which is the rate this scene’s uplink runs at').toBe(apCfg().ulKbps)
    // 「32 µs 的传统开头、6 µs 的信号扩展，以及 6 Mb/s 下 44 µs 的 CTS」
    const wrap = /(\d+) µs 的传统开头、(\d+) µs 的信号扩展，以及 (\d+) Mb\/s 下 (\d+) µs 的 CTS/.exec(src)
    expect(wrap, '`sources` no longer states the legacy wrapper').not.toBeNull()
    same(wrap![1], AMP_LEGACY_PREAMBLE_NS / US, 'the legacy preamble')
    same(wrap![2], ERP_2G.signalExtNs / US, 'the signal extension')
    same(wrap![4], txTimeNs(CTS_BYTES, Number(wrap![3])) / US,
      `a CTS at ${wrap![3]} Mb/s`)
    const cts = txs(recs(), 'cts')[0]
    // the sentence lists the three pieces separately, and the CTS this round opens with is the
    // third plus the second: 44 µs of frame and the 6 µs extension that follows every 2.4 GHz one
    expect(cts.frame.txTimeNs, 'the CTS this round really opens with')
      .toBe(Number(wrap![4]) * US + ERP_2G.signalExtNs)
    expect(cts.frame.mbps, 'at that rate').toBe(Number(wrap![3]))
    // 「物理层版本号为 0 的帧，而 0 这个值就是 Wi-Fi 7 的那一版」: the version the router's
    // own generation carries, stated three times in one sentence
    const vers = [...src.matchAll(/版本号(?:为|不是) (\d+)|而 (\d+) 这个值/g)]
      .flatMap((m2) => m2.slice(1).filter(Boolean).map(Number))
    expect(vers.length, '`sources` states the version number three times').toBe(3)
    for (const v of vers) expect(v, 'the version number it names').toBe(0)
    expect(ampPpdu.scenario().nodes.find((n) => n.kind === 'ap')!.caps.generation,
      'and the router really is the generation whose version that is').toBe('eht')
    // 「都是 2.4 GHz Wi-Fi 原本就有的东西」: the band this scene's own link runs in
    const band = /([\d.]+) GHz Wi-Fi 原本就有/.exec(src)
    expect(band, '`sources` no longer names the band those three come from').not.toBeNull()
    const BAND_OF: Record<string, string> = { '2.4': '2g', '5': '5g', '6': '6g' }
    expect(BAND_OF[band![1]], `「${band![1]} GHz」 is not a band this model has an id for`)
      .toBeDefined()
    const ap = ampPpdu.scenario().nodes.find((n) => n.kind === 'ap')!
    expect(ap.linkId ?? '2g', 'and the router’s own link is on it').toBe(BAND_OF[band![1]])
  })

  it('`observe`, `tryThis` and the variant label: two instants, the body, and the rate', () => {
    const rs = recs()
    const obs = ampPpdu.observe.join('\n')
    // 「打开 1226 µs 那帧 Ack：ID 字段两个字节，点名的是 Door tag」
    const named = /打开 (\d+) µs 那帧 Ack/.exec(obs)
    expect(named, '`observe` no longer names the Ack it asks the reader to open').not.toBeNull()
    const first = txs(rs, 'ampAck').find((r) => r.t === Number(named![1]) * US)
    expect(first, `no Ack at ${named![1]} µs`).toBeDefined()
    expect(first!.frame.dst, 'and that one names a tag').not.toBe(first!.frame.src)
    // 「再打开 2982 µs 那一帧，它收尾的是一个空时隙——同样 330 µs、同样四个字节」
    const empty = /打开 (\d+) µs 那一帧[^]*?同样 (\d+) µs、同样([一二三四五六七八九十两]+)个字节/.exec(obs)
    expect(empty, '`observe` no longer names the empty-slot Ack').not.toBeNull()
    const second = txs(rs, 'ampAck').find((r) => r.t === Number(empty![1]) * US)
    expect(second, `no Ack at ${empty![1]} µs`).toBeDefined()
    expect(second!.frame.dst, 'which closes an empty slot, so it names the router itself')
      .toBe(second!.frame.src)
    same(empty![2], second!.frame.txTimeNs / US, 'and it is as long as the first one')
    expect(second!.frame.txTimeNs, 'the two Acks are the same length').toBe(first!.frame.txTimeNs)
    expect(zhNumeral(empty![3]), 'the octets both of them carry').toBe(AMP_ACK_BYTES)
    // 「再打开它 6 个字节的帧体：会话号、窗口、时隙数与时隙长度」
    const body = /它 (\d+) 个字节的帧体/.exec(obs)
    expect(body, '`observe` no longer states the trigger’s body').not.toBeNull()
    const trig = txs(rs, 'ampTrigger')[0]
    expect(Number(body![1]), 'the body the engine builds into a trigger')
      .toBe(AMP_TRIGGER_BODY_BYTES)
    expect(Number(body![1]), 'and it is part of the trigger, not all of it')
      .toBeLessThan(trig.frame.bytes)
    // `tryThis` and the variant's label: 「载入 1 Mb/s 变体」 / 「上下行都用 1 Mb/s」
    const asked = /载入 (\d+) Mb\/s 变体/.exec(ampPpdu.tryThis.join('\n'))
    expect(asked, '`tryThis` no longer names the variant it asks for').not.toBeNull()
    const label = /上下行都用 (\d+) Mb\/s/.exec(ampPpdu.variants![0].label)
    expect(label, 'the variant’s label no longer states its rate').not.toBeNull()
    expect(Number(label![1]), 'the two agree').toBe(Number(asked![1]))
    const v = apCfg(ampPpdu.variants![0].scenario())
    expect([v.dlKbps, v.ulKbps], 'and the scene really runs at that rate in both directions')
      .toEqual([Number(label![1]) * 1_000, Number(label![1]) * 1_000])
    // 「速率提高到四倍」: the variant's rate against the base scene's
    const times = zhNumeral(/速率提高到([一二三四五六七八九十两]+)倍/.exec(ampPpdu.tryThis.join('\n'))![1])
    expect(v.dlKbps / apCfg().dlKbps, 'the rate step the variant takes').toBe(times)
  })

  it('the quiz: the padding’s 20 µs, the 10 µs gap it buys, and where an Ack’s 330 µs goes', () => {
    const quiz = ampPpdu.quiz.flatMap((q) => [q.q, ...q.options, q.explain ?? '']).join('\n')
    const rs = recs()
    // 「触发帧末尾那 20 µs 的填充字段」 and 「一个 10 µs 的间隔内完成解调」, twice
    const pad = /末尾那 (\d+) µs 的填充字段/.exec(quiz)
    expect(pad, 'the quiz no longer names the padding').not.toBeNull()
    same(pad![1], AMP_PADDING_NS / US, 'the padding this scene’s trigger carries')
    const gaps = [...quiz.matchAll(/(\d+) µs 的间隔|也就是 (\d+) µs/g)]
      .flatMap((m2) => m2.slice(1).filter(Boolean).map(Number))
    expect(gaps.length, 'the quiz states the gap more than once').toBeGreaterThan(1)
    for (const g of gaps) same(`${g}`, AMP_SIFS_NS / US, 'the gap before an answer')
    // 「AMP Ack 只有四个字节，在 250 kb/s 下却要 330 µs」, and the split 「128 + 202」
    const ack = /只有([一二三四五六七八九十两]+)个字节，在 (\d+) kb\/s 下却要 (\d+) µs/.exec(quiz)
    expect(ack, 'the quiz no longer states the Ack’s octets, rate and airtime').not.toBeNull()
    expect(zhNumeral(ack![1]), 'the octets').toBe(AMP_ACK_BYTES)
    expect(Number(ack![2]), 'the rate it is quoted at').toBe(apCfg().dlKbps)
    same(ack![3], txs(rs, 'ampAck')[0].frame.txTimeNs / US, 'and the airtime')
    const split = /([一二三四五六七八九十两]+)个字节占 (\d+) µs；其余 (\d+) µs/.exec(quiz)
    expect(split, 'the quiz no longer splits that airtime').not.toBeNull()
    expect(zhNumeral(split![1]), 'the octets again').toBe(AMP_ACK_BYTES)
    same(split![2], ampBitsNs(AMP_ACK_BYTES * 8, Number(ack![2]) as AmpDlKbps) / US,
      'the part that is the octets themselves')
    expect(Number(split![2]) + Number(split![3]), 'the split against the whole')
      .toBe(Number(ack![3]))
    // and the option the quiz calls wrong restates the same rate and the same airtime — a
    // wrong option is still a claim, and 「确实就要」 is what makes this one wrong
    const also = /([一二三四五六七八九十两]+)个字节在 (\d+) kb\/s 下确实就要 (\d+) µs/.exec(quiz)
    expect(also, 'the quiz no longer offers that option').not.toBeNull()
    expect([zhNumeral(also![1]), Number(also![2]), Number(also![3])], 'the same three figures')
      .toEqual([AMP_ACK_BYTES, apCfg().dlKbps, Number(ack![3])])
  })
})
