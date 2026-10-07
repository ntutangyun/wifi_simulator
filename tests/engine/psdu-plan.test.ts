/**
 * **"Has the decision got a name yet?" — now answerable by a test instead of by reading.**
 *
 * `docs/wifi-feature-coverage.md` §16 calls item C "没开始" and offers one piece of evidence:
 * `mac.ts` is 1 758 lines and not one of them has been split off. That evidence was a number
 * typed into a document. `docs/wifi-feature-coverage.md:174` has a name for this — 「脚本不是
 * 测试」 — and a line count written in prose is the same promise as a comment: it is true on
 * the day it is typed and nothing notices afterwards. Both documents quote it, and both of them
 * drifted silently the moment anybody edited the file.
 *
 * So two things are pinned here.
 *
 * **One: the number the documents quote is read out of the file.** Any edit to `mac.ts` that
 * moves its length now makes this red until the documents are corrected, which is the whole
 * difference between a measurement and an assertion.
 *
 * **Two: one decision, one name.** The decision "how does a run of claimed MSDUs become one
 * PSDU, and what answers it" was written out at five places in `mac.ts` with the predicate in
 * three spellings and a fourth derived from the MSDU count in the CTS path
 * (design 2026-10-07-amsdu §2.2). That, not the file's length, is what made a second
 * aggregation layer expensive: a decision with no name costs five edits per new value. It is
 * now `psduPlan` in `model/frames.ts`, and the assertions below say so in the only way that
 * cannot go stale — by requiring that no transmit path in `mac.ts` still owns a copy of the
 * byte arithmetic, and by fixing the number of places that ask for the plan.
 *
 * This is a refactor, so there is no new record and no new behaviour to assert. The evidence
 * for "nothing changed" is elsewhere and is stronger than anything this file could hold: the
 * 263 timeline hashes (tests/engine/lesson-hashes.test.ts) plus a record-by-record diff of
 * 6 686 785 records over every shipped scenario, identical 6 686 785/6 686 785.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ACK_BYTES, BA_BYTES, FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES, AMPDU_DELIMITER_BYTES,
} from '../../src/engine/phy'
import { psduPlan } from '../../src/model/frames'

const SRC = (p: string): string => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8')
const DOC = (p: string): string => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8')
const count = (hay: string, needle: string): number => hay.split(needle).length - 1
/** Newlines, so this is the same quantity `wc -l` prints. */
const lines = (s: string): number => (s.match(/\n/g) ?? []).length

describe('the PSDU decision has a name', () => {
  const mac = SRC('src/engine/mac.ts')
  const frames = SRC('src/model/frames.ts')

  it('is defined exactly once, and nowhere near the transmit paths', () => {
    expect(count(frames, 'export function psduPlan')).toBe(1)
    expect(count(mac, 'export function psduPlan')).toBe(0)
  })

  it('is the only way a transmit path in mac.ts learns what a PSDU costs', () => {
    // Each of these used to appear in mac.ts, once per hand-written copy of the arithmetic.
    for (const id of ['ampduPsduBytes', 'dataPsduBytes', 'QOS_HDR_BYTES']) {
      expect(count(mac, id), `${id} is still spelled out in mac.ts`).toBe(0)
    }
  })

  it('is asked for at six places, and the predicate is written once', () => {
    // transmitFor, exchangeNs, buildMuParts x2 (the fits closure and the final sum),
    // respondToTrigger x2 (same reason). Change this number only with a reason.
    expect(count(mac, 'psduPlan(')).toBe(6)
    // `canAggregate` is the single place that reads the peer's A-MPDU capability. It was three.
    expect(count(mac, 'cfg.ampduWith(')).toBe(1)
    expect(count(mac, 'private canAggregate(')).toBe(1)
  })

  it('and mac.ts is still one undivided file, at the length both documents quote', () => {
    const n = lines(mac)
    // The C-row of §16 and the W8 section of the backlog each state this number in prose.
    // Reading it back is what turns "没开始" from a claim into a measurement.
    const fromCoverage = DOC('docs/wifi-feature-coverage.md').match(/`mac\.ts` 今天 (\d+) 行/)
    const fromBacklog = DOC('docs/wifi-course-backlog.md').match(/拆 `mac\.ts`（(\d+) 行）/)
    expect(fromCoverage, 'the coverage table no longer states a line count for mac.ts').not.toBeNull()
    expect(fromBacklog, 'the backlog no longer states a line count for mac.ts').not.toBeNull()
    expect(Number(fromCoverage![1]), 'docs/wifi-feature-coverage.md §16 C-row').toBe(n)
    expect(Number(fromBacklog![1]), 'docs/wifi-course-backlog.md W8 section').toBe(n)
  })
})

describe('psduPlan reproduces the arithmetic it replaced', () => {
  const b = 1400
  const he = { mode: 'he' as const }

  it('one MSDU on a QoS link is a QoS data MPDU answered by an ACK', () => {
    expect(psduPlan([b], { qos: true, ampdu: true, ...he })).toEqual({
      psduBytes: QOS_HDR_BYTES + b + FCS_BYTES, aggregate: false, respBytes: ACK_BYTES,
    })
  })

  it('one MSDU on a non-QoS link is a plain data MPDU', () => {
    expect(psduPlan([b], { qos: false, ampdu: true, ...he })).toEqual({
      psduBytes: MAC_HDR_BYTES + b + FCS_BYTES, aggregate: false, respBytes: ACK_BYTES,
    })
  })

  it('two MSDUs on an A-MPDU-capable link are one aggregate answered by a BlockAck', () => {
    const p = psduPlan([b, b], { qos: true, ampdu: true, ...he })
    expect(p.aggregate).toBe(true)
    expect(p.respBytes).toBe(BA_BYTES)
    // delimiter + QoS MPDU, the first padded to 4 octets, the last not.
    const sub = AMPDU_DELIMITER_BYTES + Math.ceil((QOS_HDR_BYTES + b + FCS_BYTES) / 4) * 4
    expect(p.psduBytes).toBe(sub + AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + b + FCS_BYTES)
  })

  it('does not aggregate without the capability, or on a non-HT format', () => {
    expect(psduPlan([b, b], { qos: true, ampdu: false, ...he }).aggregate).toBe(false)
    expect(psduPlan([b, b], { qos: true, ampdu: true, mode: 'nonht' }).aggregate).toBe(false)
  })

  it('keeps the MU/TB path on A-MPDU for a single MSDU, which is 4 octets dearer', () => {
    // `buildMuParts` and `respondToTrigger` have always called `ampduPsduBytes` straight, with
    // no length test. Re-deriving `aggregate` from the count here would reprice every one-MSDU
    // resource unit from b+34 to b+30 — a silent 4-octet gift to 117 719 PPDUs.
    expect(psduPlan([b], { mu: true })).toEqual({
      psduBytes: AMPDU_DELIMITER_BYTES + QOS_HDR_BYTES + b + FCS_BYTES,
      aggregate: true,
      respBytes: BA_BYTES,
    })
    expect(psduPlan([b], { mu: true }).psduBytes - psduPlan([b], { qos: true, ampdu: true, ...he }).psduBytes).toBe(4)
  })
})
