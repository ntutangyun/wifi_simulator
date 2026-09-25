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
import {
  AMP_ACK_BYTES, AMP_DL_SIG_BYTES, AMP_DL_SYNC_NS, AMP_LEGACY_PREAMBLE_NS, AMP_PADDING_NS,
  AMP_PADDING_PROTECTED_NS, AMP_SIFS_NS, AMP_UL_CHIP_NS, AMP_UL_SYNC_CHIPS, ampBitsNs, ampDlPpduNs,
  ampRespBytes, ampTriggerBytes, ampUlPpduNs,
} from '../../src/engine/amp'
import { ACK_TX_TIME_6M_NS, CTS_BYTES, ERP_2G, txTimeNs } from '../../src/engine/phy'
import { decodeFrame, ppduLayout } from '../../src/model/frameFields'

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
    expect(ampPpdu.module).toBe(7)
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
