/**
 * Every empirical claim of "Trigger frames — the access point conducts the
 * uplink", measured against the lesson's own scenario.
 *
 * What is pinned here is what this lesson's own sentences say: the six rows of
 * the triggered round (the trigger frame's size, rate and airtime, the gaps,
 * the two equal answers, the multi-station BlockAck and the total), the claim
 * that the length and the slice came from the trigger frame rather than from
 * the device, the whole-run table (16 triggers, 2 of them unanswered, 28
 * answers against 54 contended sends and the bytes each carried), and the two
 * experiments.
 *
 * `tests/course/lesson-claims.test.ts` and `tests/course/lessons.test.ts` keep
 * their own pins on this lesson (that the stations still contend via EDCA
 * between bursts, and that every trigger names one length for all its users);
 * this file does not duplicate them. The lesson never had a `.body!` site in
 * any test.
 */
import { describe, it, expect } from 'vitest'
import { ofdmaUl, triggeredRound, ROUND, ROUND_AT } from '../../src/course/tier2/ofdma-ul'
import { lessonChars, lessonMinutes } from '../../src/course/curriculum'
import { Simulation } from '../../src/engine/simulation'
import { ScenarioSchema, type Scenario } from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'
import {
  ACK_TIMEOUT_NS, MAX_PPDU_NS, PHY_MODES, TGI_NS, multiStaBaBytes, triggerBytes,
} from '../../src/engine/phy'
import { readFileSync } from 'node:fs'
import { maxPsduBytesFor } from '../../src/engine/mac'
import { ampduPsduBytes } from '../../src/model/frames'
import { lessonShapeSuite, ofType, runOf } from './kit'
import { MODULES } from '../../src/course/curriculum'
import { RU26_PER_20MHZ, selBinWidthMhz, selBins, selMemberBins } from '../../src/engine/selectivity'

const MS = 1_000_000
const US = 1_000
/** The window every number in this lesson is measured over. */
const RUN_NS = 100 * MS
const SIFS_NS = 16 * US
const UPLOADERS = ['sta-1', 'sta-2']

type Tx = Extract<TLRecord, { type: 'TX_START' }>
const txs = (rs: TLRecord[], pred: (r: Tx) => boolean = () => true): Tx[] =>
  rs.filter((r): r is Tx => r.type === 'TX_START' && pred(r))
const triggers = (rs: TLRecord[]): Tx[] => txs(rs, (r) => r.frame.kind === 'trigger')
const tbPpdus = (rs: TLRecord[]): Tx[] =>
  txs(rs, (r) => r.frame.kind === 'data' && r.frame.orthogonalGroup !== undefined)
const contended = (rs: TLRecord[]): Tx[] =>
  txs(rs, (r) => r.frame.kind === 'data' && r.frame.orthogonalGroup === undefined)
const bytes = (xs: Tx[]): number => xs.reduce((a, r) => a + r.frame.bytes, 0)
const one = <T>(xs: T[]): T => {
  expect(new Set(xs.map((x) => JSON.stringify(x))).size).toBe(1)
  return xs[0]
}
/** The lesson's scene with OFDMA switched off on the nodes named: the second experiment. */
function without(...ids: string[]): TLRecord[] {
  const sc: Scenario = ofdmaUl.scenario()
  for (const n of sc.nodes) {
    if (ids.includes(n.id)) n.caps.features = { ...n.caps.features, ofdma: false }
  }
  return [...new Simulation(sc).runUntil(RUN_NS).records]
}

lessonShapeSuite(ofdmaUl, { runNs: RUN_NS })

describe('ofdma-ul · the lesson’s own scene', () => {
  it('is a Tier 2 lesson that needs the downlink half of the idea', () => {
    expect(MODULES[ofdmaUl.module].title).toBe('被调度的 Wi-Fi 6/7')
    expect(ofdmaUl.needs).toEqual(['ofdma-dl'])
    expect(ofdmaUl.terms!.map((t) => t.term)).toEqual(['uplink', 'trigger frame', 'TB'])
  })

  it('is the same room it always was: one access point and two busy uploaders', () => {
    const sc = ofdmaUl.scenario()
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    expect(sc.nodes.map((n) => n.id)).toEqual(['ap', ...UPLOADERS])
    for (const id of UPLOADERS) {
      const n = sc.nodes.find((x) => x.id === id)!
      expect(n.caps.generation).toBe('he')
      expect(n.profiles).toEqual(['saturated'])
    }
    expect(ofdmaUl.variants).toBeUndefined()
  })
})

describe('ofdma-ul · one triggered round, end to end', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)
  const trig = triggers(rs)
  const tb = tbPpdus(rs)
  const mba = txs(rs, (r) => r.frame.kind === 'mba')

  it('the trigger frame: 40 bytes, 36 µs, sent slowly at 24 Mb/s from the access point', () => {
    expect(trig.length).toBe(16)
    expect(one(trig.map((r) => r.node))).toBe('ap')
    expect(one(trig.map((r) => r.frame.bytes))).toBe(40)
    expect(one(trig.map((r) => r.frame.txTimeNs))).toBe(36 * US)
    expect(one(trig.map((r) => r.frame.mbps))).toBe(24)
    // "the devices it names, and nobody else": two users, one length for both
    expect(one(trig.map((r) => r.frame.muParts!.map((p) => p.dst)))).toEqual(UPLOADERS)
    expect(one(trig.map((r) => r.frame.muParts!.map((p) => p.durNs)))).toEqual([1_988_800, 1_988_800])
  })

  it('the answers: both start one gap after the trigger frame and both run 1988.8 µs', () => {
    expect(tb.length).toBe(28)
    expect(one(tb.map((r) => r.frame.txTimeNs))).toBe(1988.8 * US)
    expect(one(tb.map((r) => r.frame.bytes))).toBe(16_894)
    for (const t of trig) {
      const answers = tb.filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup)
      if (answers.length === 0) continue
      expect(answers.map((r) => r.node).sort()).toEqual([...UPLOADERS])
      // "one short gap after the trigger frame ends", and the length the trigger named
      for (const a of answers) {
        expect(a.t).toBe(t.t + t.frame.txTimeNs + SIFS_NS)
        expect(a.frame.txTimeNs).toBe(t.frame.muParts!.find((p) => p.dst === a.node)!.durNs)
      }
    }
  })

  it('one multi-station BlockAck of 36 µs closes the round, a gap after both answers end', () => {
    expect(mba.length).toBe(14)
    expect(one(mba.map((r) => r.frame.txTimeNs))).toBe(36 * US)
    expect(one(mba.map((r) => r.frame.muParts!.length))).toBe(2)
    for (const m of mba) {
      const answers = tb.filter((r) => r.t + r.frame.txTimeNs + SIFS_NS === m.t)
      expect(answers.length).toBe(2)
      expect(one(answers.map((r) => r.t + r.frame.txTimeNs))).toBe(m.t - SIFS_NS)
    }
  })

  it('"The whole round": 2092.8 µs on the air, 33,788 bytes up', () => {
    expect(36 * US + SIFS_NS + 1_988_800 + SIFS_NS + 36 * US).toBe(2_092_800)
    expect(2 * 16_894).toBe(33_788)
  })

  it('neither the length nor the slice came from the answering device', () => {
    // "the same length and the same 16,894 bytes, though the two uploaders are not the same
    //  distance away and their queues are not the same"
    const sc = ofdmaUl.scenario()
    const pos = UPLOADERS.map((id) => sc.nodes.find((n) => n.id === id)!.pos)
    expect(pos[0]).not.toEqual(pos[1])
    // both answers of a round share the group, which is what makes them non-overlapping
    for (const t of triggers(rs)) {
      const answers = tb.filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup)
      for (const a of answers) expect(a.frame.orthogonalGroup).toBe(t.frame.orthogonalGroup)
    }
    expect(one(tb.map((r) => r.frame.mcs))).toBe(11)
    expect(one(tb.map((r) => r.frame.widthMhz))).toBe(20)
  })
})

describe('ofdma-ul · the figure of one round', () => {
  // The `sequence` diagram (re-pacing §4) carries the shape of the exchange, so its
  // columns must be the scene's own devices and its instants the run's own.
  const spec = triggeredRound()
  const rs = runOf(ofdmaUl, undefined, RUN_NS)
  const trig = triggers(rs)[0]
  const answers = tbPpdus(rs).filter((r) => r.frame.orthogonalGroup === trig.frame.orthogonalGroup)

  it('draws the three devices of the scene, with the access point between the two uploaders', () => {
    expect(spec.columns.map((c) => c.id)).toEqual(['sta-1', 'ap', 'sta-2'])
    expect(ofdmaUl.scenario().nodes.map((n) => n.id).sort()).toEqual([...spec.columns.map((c) => c.id)].sort())
    for (const c of spec.columns) expect(c.label.trim()).not.toBe('')
  })

  it('the access point’s two arrows each way are one frame naming both uploaders', () => {
    const fromAp = spec.messages.filter((m) => m.from === 'ap')
    expect(fromAp.map((m) => m.to)).toEqual(['sta-1', 'sta-2', 'sta-1', 'sta-2'])
    expect(trig.frame.muParts!.map((p) => p.dst)).toEqual(UPLOADERS)
    const mba = txs(rs, (r) => r.frame.kind === 'mba')[0]
    expect(mba.frame.muParts!.map((p) => p.dst)).toEqual(UPLOADERS)
    // and the two answers are the uploaders' own, one arrow each
    expect(spec.messages.filter((m) => m.to === 'ap').map((m) => m.from)).toEqual(UPLOADERS)
  })

  it('its instants are the run’s: 0, one gap to the answers, and the acknowledgement at 2057 µs', () => {
    expect(ROUND).toEqual({ trigger: 36, gap: 16, answers: 1988.8, mba: 36 })
    expect(trig.frame.txTimeNs).toBe(ROUND.trigger * US)
    expect(SIFS_NS).toBe(ROUND.gap * US)
    expect(one(answers.map((r) => r.frame.txTimeNs))).toBe(ROUND.answers * US)
    // the gutter values the figure prints, against the same instants relative to the trigger
    expect(ROUND_AT.answers).toBe(52)
    expect(one(answers.map((r) => r.t - trig.t))).toBe(ROUND_AT.answers * US)
    const mba = txs(rs, (r) => r.frame.kind === 'mba').find((m) => m.t > trig.t)!
    expect(Math.round(ROUND_AT.mba)).toBe(2057)
    expect(mba.t - trig.t).toBe(Math.round(ROUND_AT.mba * US))
    expect(spec.messages.filter((m) => m.at !== undefined).map((m) => m.at)).toEqual(['0', '52 µs', '2057 µs'])
  })
})

describe('ofdma-ul · the procedure, against the engine that runs it', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)

  it('steps 2 and 3: between two and four users, each on 1/n of the tones, one format for the round', () => {
    for (const t of triggers(rs)) {
      const users = t.frame.muParts!
      expect(users.length).toBeGreaterThanOrEqual(2)
      expect(users.length).toBeLessThanOrEqual(4)
      // one rung and one width for the whole round, dictated by the trigger and not by the device
      expect(t.frame.ulMode).toBe('he')
      expect(t.frame.ulWidthMhz).toBe(20)
      expect(new Set(users.map((p) => p.mcs))).toEqual(new Set([11]))
    }
    // the answers really do sit on a half each: the length they were given is the length
    // 1/2 of a 20 MHz channel needs for the bytes that fit a 2 ms answer
    expect(1 / 2).toBe(1 / triggers(rs)[0].frame.muParts!.length)
  })

  it('step 4: the longest backlog that fits 2 ms is 17,425 B, 143 symbols, 1988.8 µs', () => {
    const budget = maxPsduBytesFor('he', 11, 0.5, 2 * MS, 20, 1)
    expect(budget).toBe(17_425)
    expect(PHY_MODES.he.ndbps[11] * 0.5).toBe(975)
    expect(Math.ceil((16 + 8 * budget + 6) / 975)).toBe(143)
    expect(PHY_MODES.he.preambleNs + 143 * PHY_MODES.he.symNs).toBe(1988.8 * US)
    // and that is the one length every user of every round is given
    for (const t of triggers(rs)) {
      expect(new Set(t.frame.muParts!.map((p) => p.durNs))).toEqual(new Set([1988.8 * US]))
    }
    // a TB PPDU carries no per-user map: 44 µs of opening, not the 48 of a DL MU PPDU
    for (const r of tbPpdus(rs)) expect(r.frame.txTimeNs).toBe(1988.8 * US)
  })

  it('step 6: the 16,894 B answer is eleven whole frames, and the other 531 B is padding', () => {
    for (const r of tbPpdus(rs)) {
      expect(r.frame.ampdu!.mpduCount).toBe(11)
      expect(new Set(r.frame.msduBytes!)).toEqual(new Set([1500]))
      expect(r.frame.bytes).toBe(16_894)
      // eleven of these frames is what the PSDU holds, and a twelfth would not fit the
      // length the trigger named — so the rest of that length goes out as padding
      expect(ampduPsduBytes(new Array<number>(11).fill(1500))).toBe(16_894)
      expect(ampduPsduBytes(new Array<number>(12).fill(1500))).toBeGreaterThan(17_425)
    }
    expect(17_425 - 16_894).toBe(531)
  })

  it('steps 5 and 7: 28 + 6 per user, 32 + 8 per extra user, and a 45 µs response timeout', () => {
    expect(triggerBytes(2)).toBe(28 + 6 * 2)
    expect(triggerBytes(2)).toBe(40)
    expect(multiStaBaBytes(2)).toBe(32 + 8)
    expect(multiStaBaBytes(2)).toBe(40)
    expect(ACK_TIMEOUT_NS).toBe(45 * US)
    for (const m of txs(rs, (r) => r.frame.kind === 'mba')) expect(m.frame.bytes).toBe(40)
    // step 5's Duration: the gap, the answers, the second gap and the acknowledgement
    for (const t of triggers(rs)) {
      expect(t.frame.durationFieldNs).toBe(SIFS_NS + 1988.8 * US + SIFS_NS + 36 * US)
    }
  })
})

describe('ofdma-ul · the two qualifications the lesson carries in the same breath as the claim', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)

  it('"it looks at its own NAV": the trigger’s own reservation does not silence the stations it invited', () => {
    // mac.ts, `case 'trigger'`: answer only if the NAV is idle — and a NAV set by the
    // triggering access point itself does not count (`this.navSetBy !== from`). The
    // Duration of every trigger covers the answers, so a naive "any NAV" check would
    // mean no invited station could ever answer. They all do, one SIFS later.
    for (const t of triggers(rs)) {
      expect(t.frame.durationFieldNs).toBe(SIFS_NS + 1988.8 * US + SIFS_NS + 36 * US)
      const answers = tbPpdus(rs).filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup)
      if (answers.length === 0) continue
      for (const a of answers) expect(a.t).toBe(t.t + t.frame.txTimeNs + SIFS_NS)
    }
    expect(tbPpdus(rs).length).toBe(28)
  })

  it('"a device given a slice keeps its own stream count" — on a SYNTHETIC copy, because both uploaders here negotiate one', () => {
    // The lesson's own scene cannot show this: its two uploaders negotiate a single
    // stream each, so the claim of step 3 is pinned against a copy of the scene in which
    // the access point and uploader A have two. Same slice, same length the trigger names,
    // different bytes — which is the stream count still being the device's own.
    for (const n of ofdmaUl.scenario().nodes) expect(n.caps.nss ?? 1).toBe(1)
    const sc: Scenario = ofdmaUl.scenario()
    for (const id of ['ap', 'sta-1']) sc.nodes.find((n) => n.id === id)!.caps.nss = 2
    const two = [...new Simulation(sc).runUntil(RUN_NS).records]
    const answers = tbPpdus(two)
    expect(answers.length).toBeGreaterThan(4)
    for (const a of answers) {
      expect(a.frame.txTimeNs).toBe(1988.8 * US) // the one length the trigger named
      expect(a.frame.widthMhz).toBe(20) // the one width it named
      expect(a.frame.bytes).toBe(a.node === 'sta-1' ? 30_718 : 16_894)
      expect(a.frame.ampdu!.mpduCount).toBe(a.node === 'sta-1' ? 20 : 11)
    }
  })
})

describe('ofdma-ul · the uplink of two uploaders over 100 ms', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)

  it('16 triggers, 2 of which nobody answered; every other one brought back both answers', () => {
    const answered = triggers(rs).map((t) =>
      tbPpdus(rs).filter((r) => r.frame.orthogonalGroup === t.frame.orthogonalGroup).length)
    expect(answered.length).toBe(16)
    expect(answered.filter((n) => n === 0).length).toBe(2)
    expect(answered.filter((n) => n === 2).length).toBe(14)
    expect(new Set(answered)).toEqual(new Set([0, 2]))
  })

  it('28 triggered answers carry 473,032 bytes against 54 contended sends carrying 996,756', () => {
    const tb = tbPpdus(rs), su = contended(rs)
    expect(tb.length).toBe(28)
    expect(bytes(tb)).toBe(473_032)
    expect(su.length).toBe(54)
    expect(bytes(su)).toBe(996_756)
    // "About a third of what this pair sent up went in triggered rounds"
    expect(Math.round((bytes(tb) / (bytes(tb) + bytes(su))) * 100)).toBe(32)
    for (const r of [...tb, ...su]) expect(UPLOADERS).toContain(r.node)
  })

  it('"it collided six times doing so": every collision is outside a triggered round', () => {
    const collisions = ofType(rs, 'COLLISION')
    expect(collisions.length).toBe(6)
    for (const c of collisions) {
      const inside = tbPpdus(rs).some((t) => t.t <= c.t && c.t <= t.t + t.frame.txTimeNs)
      expect(inside, `collision at ${c.t}`).toBe(false)
    }
  })
})

describe('ofdma-ul · the experiments', () => {
  it('the Duration of the trigger frame covers the answers and the acknowledgement too', () => {
    const rs = runOf(ofdmaUl, undefined, RUN_NS)
    for (const t of triggers(rs)) {
      expect(t.frame.durationFieldNs).toBeGreaterThanOrEqual(SIFS_NS + 1988.8 * US + SIFS_NS + 36 * US)
    }
  })

  it('turning OFDMA off on one uploader stops every trigger frame, even for the other', () => {
    const rs = without('sta-1')
    expect(triggers(rs).length).toBe(0)
    expect(tbPpdus(rs).length).toBe(0)
    // the uplink still runs, the ordinary way
    expect(contended(rs).length).toBeGreaterThan(50)
  })
})

/**
 * The uplink half of slice 4a's known overestimate: each triggered answer is credited with the
 * whole channel's bins (`selCombine` in channel.ts keys them off the PPDU's width) while every
 * station occupies only its own resource unit, and the standard's smallest resource unit — 26
 * tones — is exactly one bin. It is a separate statement from the power correction this lesson's
 * other limits cover: that field is sized and not executed, this one is a bin count that is too
 * large. The engine side is asserted in tests/engine/selectivity-inert.test.ts (§6 item 4).
 */
/**
 * **Slice 4b landed on the uplink too, so this entry states what the engine now does.** Each
 * answer of a triggered round reads the bins of its OWN share: the share and the index are on
 * the triggered frame itself (`FrameDesc.ru`, one object carrying `fraction` and `partIdx`
 * rather than two optional fields, written by `respondToTrigger`
 * out of the Trigger's per-user RU Allocation), and `selCombine` turns them into a bin count and
 * a start. 4a's overestimate — the whole channel's bins for every answer — is gone, and so is
 * the sentence that promised a later slice would remove it.
 *
 * Still out of scope: the uneven allocation. `transmitTrigger` computes one `frac = 1 / users`
 * for the whole round, so every answer is the same width and the bin the truncation drops
 * belongs to nobody.
 *
 * **The instruments.** 9 bins at 20 MHz and 4 per answer are `selBins`/`selMemberBins`, asserted
 * against the same functions the prose interpolates; and the engine is measured handing those 4
 * bins to both answers over one 100 ms round of this lesson's own scene with `fading` +
 * `selectivity` added — the condition the limit opens with, and not what the shipped scene has.
 */
describe('ofdma-ul · every answer reads its own share’s bins (slice 4b landed)', () => {
  /*
   * Selected by what it says, not by where it sits (review of 2026-10-03, finding 5): slice 4b
   * will add to this array, and a last-index lookup would then grade the wrong entry. The whole
   * `kinds` column goes with it, as in tests/course/uwb-rcm-validity.test.ts.
   */
  const found = ofdmaUl.limits.filter((l) => l.text.includes('selCombine'))
  const lim = found[0]

  /** This lesson's own scene with the two sections the limit names, and nothing else changed. */
  const binned = (): TLRecord[] => [...new Simulation({
    ...ofdmaUl.scenario(),
    fading: { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' },
    selectivity: {},
  }).runUntil(RUN_NS).records]

  it('is the one limit about the bin count, and the lesson now declares six', () => {
    expect(found).toHaveLength(1)
    // Six since the guard-interval slice added the one about (2x, 0.8) not being a mandatory
    // combination for a TB PPDU. The whole column is counted so an insertion is visible here
    // rather than absorbed, which is the point of the pin — so it is re-stated, not deleted.
    expect(ofdmaUl.limits).toHaveLength(6)
    // The guard-interval entry goes FIRST, so the order moves by one rather than the column
    // being rewritten: that is what makes an insertion visible here.
    expect(ofdmaUl.limits.map((l) => l.kind))
      .toEqual(['model-value', 'unmodelled', 'unmodelled', 'unmodelled', 'model-value', 'model-value'])
  })

  it('is a model-value limit, and no longer promises a later slice will fix the bin count', () => {
    // `model-value` since Task 6 (design §7.4), for the same reason as `ofdma-dl`'s twin: the
    // scenario class it used to rule out is gone, and what is left is one chosen value — one
    // share per round, `1 / 台数`, in `transmitTrigger` — and the bin it truncates away.
    expect(lim.kind).toBe('model-value')
    expect(lim.text).toContain('selCombine')
    expect(lim.text).toContain(`${selBinWidthMhz()} MHz 一格`)
    // what the engine does now, and where the share is carried
    expect(lim.text).toContain('各自读到的是自己那一片的格数')
    expect(lim.text).toContain('份额与下标写在被触发的那一帧自己身上')
    expect(lim.text).toContain('截到整数格')
    // 4a's three retired claims
    expect(lim.text).not.toContain('拿到的是整条信道的格数')
    expect(lim.text).not.toContain('并不问')
    expect(lim.text).not.toContain('高估')
    expect(lim.text).not.toContain('切片 4b')
    /*
     * **No `until`, and here the design's request (§7.4) was not merely loose but backwards.**
     * `until` means "the truth arrives LATER" and renders as 「（这一条在《…》里会被解除）」;
     * `ru-diversity` sits at `COURSE_ORDER` index between `ofdma-dl` and THIS lesson, so a
     * reader meets it BEFORE reading this entry. Pointing forward at a lesson already read is
     * wrong whichever way the promise is taken — and `ru-diversity` does not lift the equal
     * share anyway, it re-declares it. See `ofdma-dl.test.ts` for the full record.
     */
    expect(lim.until).toBeUndefined()
  })

  it('keeps it apart from the power correction, and prints its bins off the engine', () => {
    expect(lim.text).toContain('与上面那条功率修正没有被执行是两回事')
    expect(selBins(20)).toBe(RU26_PER_20MHZ)
    expect(selMemberBins(20, 1 / 2)).toBe(4)
    expect(lim.text).toContain(`${selBins(20)} 格里的 ${selMemberBins(20, 1 / 2)} 格`)
    expect(lim.text).toContain('26 音调资源单元恰好就是一格')
    // what is still out of scope: one share for the whole round, named by the function that sets it
    expect(lim.text).toContain('transmitTrigger')
    expect(lim.text).toContain('不属于任何一台')
  })

  it('and both answers really read 4 of 9, share and index off their own frame', () => {
    const rs = binned()
    const answers = ofType(rs, 'TX_START')
      .filter((r) => r.frame.kind === 'data' && r.frame.ru !== undefined)
    expect(answers.length, 'no triggered answer to read').toBeGreaterThan(10)
    for (const a of answers) expect(a.frame.ru!.fraction).toBe(1 / 2)
    expect(new Set(answers.map((a) => a.frame.ru!.partIdx))).toEqual(new Set([0, 1]))
    const sels = ofType(rs, 'WIFI_SEL').filter((s) => s.ruFraction !== undefined)
    expect(sels.length, 'no per-share reception to read').toBeGreaterThan(10)
    for (const s of sels) {
      expect(s.widthMhz).toBe(20)
      expect(s.bins).toBe(selMemberBins(20, 1 / 2))
    }
    // consecutive runs again, so one of the nine bins is claimed by neither uploader
    expect(new Set(sels.map((s) => s.binStart))).toEqual(new Set([0, 4]))
    expect(selBins(20) - Math.max(...sels.map((s) => s.binStart + s.bins))).toBe(1)
  })

  it('and this lesson’s own scene does not turn the feature on', () => {
    expect(ofdmaUl.scenario().selectivity).toBeUndefined()
  })
})

/**
 * The guard interval, as a fact about this lesson's own triggered round (design doc
 * docs/superpowers/specs/2026-10-05-guard-interval-design.md §7.3, §1.5).
 *
 * `limits` is outside `mainPathChars`, so the stated minutes must not move — measured, not
 * assumed, because `selectivity` nearly changed bucket on exactly this.
 */
describe('ofdma-ul · the guard interval the TB PPDUs actually run at', () => {
  it('names (2x, 0.8) as a combination that is not mandatory for a TB PPDU', () => {
    const lim = ofdmaUl.limits.find((x) => x.text.includes('保护间隔'))
    expect(lim, 'no limit mentions the guard interval').toBeDefined()
    expect(lim!.kind).toBe('model-value')
    expect(lim!.until).toBeUndefined()
    // The three mandatory sets §27.1.1 / §36.1.1 give, and the capability bit that makes the
    // engine's own choice legal rather than a violation.
    expect(lim!.text).toContain('0.8')
    expect(lim!.text).toContain('TB PPDU')
    expect(lim!.text).toContain('§27.1.1')
    expect(lim!.text).toContain('§36.1.1')
    expect(lim!.text).toContain('能力位')
  })

  it('does not move the stated minutes: limits are outside mainPathChars', () => {
    expect(lessonChars(ofdmaUl)).toBe(2301)
    expect(lessonMinutes(ofdmaUl)).toBe(20)
  })
})

/**
 * **Every figure the prose prints, read back out of it.**
 *
 * This file measures the whole triggered round — and compares it with figures typed here, with
 * the lesson's own row quoted in a comment. The sampling sweep of 2026-10-12 planted six of this
 * lesson's figures and every one went unnoticed, 6 of 6.
 *
 * **The reads worth naming:**
 *
 *  - **the round's total is read as the chain that produces it.** 「36 + 16 + 1988.8 + 16 + 36 =
 *    2092.8 µs」 has all six figures parsed out, the sum has to be the total, and each term has
 *    to be the frame or the gap it names — so the row cannot be right in total and wrong in a term.
 *  - **the answer's length is read as its own two-term formula.** 「44 + 13.6 × 143 = 1988.8 µs」
 *    is the preamble, the symbol and the symbol count, and the product has to be the airtime the
 *    engine gives that PPDU.
 *  - **the two frame sizes are read as their own per-user arithmetic**: 「28 + 6 × 2 = 40 B」 and
 *    「32 + 8 = 40 B」 against `triggerBytes` and `multiStaBaBytes` at this scene's user count.
 *  - **the mandatory guard-interval sets are read against the engine's own list of them.** The
 *    entry's whole point is that the combination this engine runs is not in the standard's
 *    mandatory set, so both the set and the engine's own value are read.
 */
describe('ofdma-ul · every figure the prose prints, read back out of it', () => {
  const rs = runOf(ofdmaUl, undefined, RUN_NS)
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
  const NUMS = blockText(ofdmaUl.numbers)
  const SRC = blockText(ofdmaUl.sources)
  const LIM = blockText(ofdmaUl.limits)
  const OBS = blockText(ofdmaUl.observe)

  const val = (x: string): number => Number(x.replace(/[\s,]/g, '').replace(/[−–]/g, '-'))
  const raw = (text: string, re: RegExp, what: string): string[] => {
    const mm = re.exec(text)
    expect(mm, `${what}: the lesson no longer prints this in the shape this test reads`).not.toBeNull()
    return mm!.slice(1)
  }
  const figs = (text: string, re: RegExp, what: string): number[] => raw(text, re, what).map(val)
  const every = (text: string, re: RegExp, what: string, want: number): string[][] => {
    const ms = [...text.matchAll(re)]
    expect(ms.length, `${what}: the lesson prints this ${ms.length} times, not ${want}`).toBe(want)
    return ms.map((mm) => mm.slice(1))
  }
  const same = (printed: string, measured: number, what: string): void => {
    const fig = printed.replace(/[\s,]/g, '').replace(/[−–]/g, '-')
    const dp = (fig.split('.')[1] ?? '').length
    expect(Number(fig), `${what} (to ${dp} decimals, read off the lesson)`)
      .toBe(Number(measured.toFixed(dp)))
  }
  const occ = (text: string, needle: string): number => text.split(needle).length - 1
  /** The round this lesson walks through: its trigger, its two answers and its acknowledgement. */
  const trigger = triggers(rs)[0]!
  const answers = tbPpdus(rs).filter((r) => r.t > trigger.t && r.t < trigger.t + 3 * MS)
  const mba = txs(rs, (r) => r.frame.kind === 'mba' && r.t > trigger.t)[0]!

  it('reads the round’s six rows, and the chain that adds up to its total', () => {
    // 「28 + 6 × 2 = 40 B，用 24 Mb/s 发，36 µs」
    const [common, perUser, users, bytes, mbps, us] = figs(NUMS,
      /(\d+) \+ (\d+) × (\d+) = (\d+) B，用 (\d+) Mb\/s 发，(\d+) µs/, 'the trigger frame’s own row')
    expect(users, 'the users this trigger names').toBe(UPLOADERS.length)
    expect(common + perUser! * users!, 'the arithmetic the row prints').toBe(bytes)
    expect(bytes, 'which is what the engine builds').toBe(triggerBytes(users!))
    expect(bytes, 'and what this round’s trigger carries').toBe(trigger.frame.bytes)
    expect(mbps, 'the rate it goes out at').toBe(trigger.frame.mbps)
    same(String(us), trigger.frame.txTimeNs / US, 'and its airtime')
    // 「32 + 8 = 40 B, 36 µs」
    const [baBase, baPer, baBytes, baUs] = figs(NUMS, /(\d+) \+ (\d+) = (\d+) B, (\d+) µs/,
      'the BlockAck’s own row')
    expect(baBase! + baPer!, 'the arithmetic that row prints').toBe(baBytes)
    expect(baBytes, 'which is what the engine builds for this many users')
      .toBe(multiStaBaBytes(UPLOADERS.length))
    expect(baBytes, 'and what this round’s acknowledgement carries').toBe(mba.frame.bytes)
    same(String(baUs), mba.frame.txTimeNs / US, 'and its airtime')
    // 「36 + 16 + 1988.8 + 16 + 36 = 2092.8 µs，共上行 33,788 B」
    const [t1, g1, ans, g2, t2, total] = figs(NUMS,
      /(\d+) \+ (\d+) \+ ([\d.]+) \+ (\d+) \+ (\d+) = ([\d.]+) µs/, 'the round’s own total')
    expect(t1! + g1! + ans! + g2! + t2!, 'the sum the row prints').toBeCloseTo(total!, 3)
    same(String(t1), trigger.frame.txTimeNs / US, 'the trigger that opens it')
    same(String(t2), mba.frame.txTimeNs / US, 'the acknowledgement that closes it')
    for (const g of [g1, g2]) expect(g! * US, 'each gap is one short interframe space').toBe(SIFS_NS)
    same(String(ans), answers[0]!.frame.txTimeNs / US, 'and the answers in between')
    same(String(total), (mba.t + mba.frame.txTimeNs - trigger.t) / US, 'the round, end to end')
    const [upBytes] = figs(NUMS, /共上行 ([\d,]+) B/, 'the bytes the round carries up')
    expect(upBytes, 'the uplink bytes of this round')
      .toBe(answers.reduce((a, r) => a + r.frame.bytes, 0))
  })

  it('reads the answer’s own two-term formula and what it is padded to', () => {
    // 「44 + 13.6 × 143 = 1988.8 µs」
    const [pre, sym, count, us] = figs(NUMS, /(\d+) \+ ([\d.]+) × (\d+) = ([\d.]+) µs/,
      'the answer’s own airtime formula')
    expect(pre! + sym! * count!, 'the arithmetic the cell prints').toBeCloseTo(us!, 3)
    same(String(us), answers[0]!.frame.txTimeNs / US, 'the airtime the engine gives that PPDU')
    expect(count, 'the symbols it takes').toBeGreaterThan(100)
    // 「17,425 B」: the largest backlog that fits, as the engine computes it.
    const [cap] = figs(NUMS, /([\d,]+) B$/m, 'the cap one answer can carry')
    expect(cap, 'what 2 ms holds at this rung and this share')
      .toBe(maxPsduBytesFor('he', answers[0]!.frame.mcs!, 1 / UPLOADERS.length, 2 * MS, 20, 1))
    // 「十一帧，16,894 B；余下 531 B 是填充」
    const [frames, carried, pad] = raw(NUMS, /(.+?)帧，([\d,]+) B；余下 ([\d,]+) B 是填充/,
      'the answer’s own payload')
    expect(val(carried!), 'the bytes the answer really carries').toBe(answers[0]!.frame.bytes)
    expect(val(carried!) + val(pad!), 'and the padding takes it to the cap').toBe(cap)
    expect(answers[0]!.frame.ampdu?.mpduCount, 'the frames inside it')
      .toBe(zhOrDigits(frames!))
    // `observe` prints the length and the bytes again.
    same(raw(OBS, /都长 ([\d.]+) µs/, '`observe` on the two answers')[0]!,
      answers[0]!.frame.txTimeNs / US, 'the length both answers run')
    expect(figs(OBS, /字节数也都是 ([\d,]+)/, '`observe` on the bytes')[0], 'and the bytes both carry')
      .toBe(answers[0]!.frame.bytes)
    expect(new Set(answers.map((r) => r.frame.bytes)).size, 'which really is one figure for both')
      .toBe(1)
  })

  /** 「十一」 → 11; a digit string stays itself. */
  function zhOrDigits(x: string): number {
    if (/^\d+$/.test(x)) return Number(x)
    let total = 0
    let cur = 0
    for (const ch of x) {
      const d = '零一二三四五六七八九'.indexOf(ch)
      if (d >= 0) { cur = d; continue }
      if (ch === '十') { total += (cur || 1) * 10; cur = 0 }
    }
    return total + cur
  }

  it('reads the procedure’s gaps, its timeout and the rate the trigger goes out at', () => {
    // `sources` prints the trigger’s own size and airtime a second time.
    const [srcBytes, srcUs] = figs(SRC, /仿真器给它计 (\d+) 字节、(\d+) µs/,
      '`sources` on the trigger frame')
    expect(srcBytes, 'the bytes the engine builds it from').toBe(trigger.frame.bytes)
    same(String(srcUs), trigger.frame.txTimeNs / US, 'and its airtime')
    // 「触发帧用较低的 24 Mb/s 发出去」 and `sources` on the same rate.
    for (const [mbps] of every([NUMS, SRC].join('\n'), /(\d+) Mb\/s (?:发出去|发送)/g,
      'the rate the trigger goes out at, named twice', 2)) {
      expect(val(mbps!), 'the rate this round’s trigger uses').toBe(trigger.frame.mbps)
    }
    // 「28 字节是给所有人的公共信息，每点一台名再加 6 字节」
    const [common, perUser] = figs(NUMS, /(\d+) 字节是给所有人的公共信息，每点一台名再加 (\d+) 字节/,
      'the steps on the trigger’s own size')
    expect(common! + perUser! * UPLOADERS.length, 'what the engine builds for this many users')
      .toBe(triggerBytes(UPLOADERS.length))
    expect(triggerBytes(UPLOADERS.length + 1) - triggerBytes(UPLOADERS.length),
      'and one more user costs exactly that much more').toBe(perUser)
    // 「32 字节，此后每多一台设备再加 8 字节」
    const [baBase, baPer] = figs(NUMS, /(\d+) 字节，此后每多一台设备再加 (\d+) 字节/,
      'the steps on the acknowledgement’s size')
    expect(baBase! + baPer!, 'what the engine builds for two users')
      .toBe(multiStaBaBytes(UPLOADERS.length))
    expect(multiStaBaBytes(UPLOADERS.length + 1) - multiStaBaBytes(UPLOADERS.length),
      'and one more user costs that much more').toBe(baPer)
    // The two 16 µs gaps, named in prose as well as in the table.
    for (const [us] of every(NUMS, /隔 (\d+) µs/g, 'the gap, named twice in the steps', 2)) {
      expect(val(us!) * US, 'one short interframe space').toBe(SIFS_NS)
    }
    // 「触发帧结束后 45 µs 仍没有任何回答开始」, printed in the steps and again in `limits`.
    for (const [us] of every([NUMS, LIM].join('\n'), /(\d+) µs (?:仍没有任何回答|还没有任何回答)/g,
      'the response timeout, named twice', 2)) {
      expect(val(us!) * US, 'the timeout the engine waits').toBe(ACK_TIMEOUT_NS)
    }
    // 「上限是一个 2 ms 的回答装得下的量」 and the same 2 ms in `limits`, twice more.
    for (const [ms] of every([NUMS, LIM].join('\n'), /一个 (\d+) ms 的回答/g,
      'the cap on one answer, named three times', 3)) {
      expect(val(ms!) * MS, 'the length the engine caps an answer at').toBe(2 * MS)
    }
  })

  it('reads the whole-run table and the window it is measured over', () => {
    const [windowMs] = figs(NUMS, /两台上传设备 (\d+) ms 内的上行/, '`numbers` on the window')
    expect(windowMs! * MS, 'the window every figure of this lesson is measured over').toBe(RUN_NS)
    const rows = (ofdmaUl.numbers!.find((b) => b.kind === 'table'
      && (b as { heading?: string }).heading?.includes('上行')) as { rows: string[][] }).rows
    // The two populations are the file's own: a TB PPDU carries an orthogonal group, a
    // contended send does not. The table is read row by row and column by column.
    const triggered = tbPpdus(rs)
    const contendedTx = contended(rs)
    const byLabel = (needle: string): string[] => {
      const hit = rows.find((r) => r[0]!.includes(needle))
      expect(hit, `no row 「${needle}」 in the whole-run table`).toBeDefined()
      return hit!
    }
    const trig = byLabel('触发帧')
    expect(val(trig[1]!), 'the triggers the access point sends').toBe(triggers(rs).length)
    const unanswered = byLabel('没人回答')
    expect(val(unanswered[1]!), 'the ones nobody answered')
      .toBe(triggers(rs).filter((x) => !triggered.some((a) => a.t > x.t && a.t < x.t + 3 * MS)).length)
    expect(val(unanswered[2]!), 'and the bytes those brought back').toBe(0)
    const tb = byLabel('TB PPDU')
    expect(val(tb[1]!), 'the answers that came back').toBe(triggered.length)
    expect(val(tb[2]!), 'and the bytes they carried')
      .toBe(triggered.reduce((a, r) => a + r.frame.bytes, 0))
    const cont = byLabel('普通竞争发送')
    expect(val(cont[1]!), 'the sends the uploaders won by contending').toBe(contendedTx.length)
    expect(val(cont[2]!), 'and the bytes those carried')
      .toBe(contendedTx.reduce((a, r) => a + r.frame.bytes, 0))
    expect(val(cont[2]!), 'which is the larger of the two').toBeGreaterThan(val(tb[2]!))
    // The step table beside it: the backlog, the share, the symbols and the airtime’s own terms.
    const steps = (ofdmaUl.numbers!.find((b) => b.kind === 'table'
      && (b as { heading?: string }).heading?.includes('照着步骤走')) as { rows: string[][] }).rows
    const step = (needle: string): string => steps.find((r) => r[0]!.includes(needle))![1]!
    expect(val(step('子载波占比')), 'one over the users the trigger names').toBe(1 / UPLOADERS.length)
    expect(val(step('有积压的设备')), 'the uploaders with something to send').toBe(UPLOADERS.length)
    const [preUs, symUs, count] = figs(step('指定为'), /(\d+) \+ ([\d.]+) × (\d+) =/,
      'the airtime formula’s own three terms')
    expect(val(step('几个符号')), 'the symbols that backlog takes').toBe(count)
    expect(preUs! * US, 'the opening of a TB PPDU').toBe(PHY_MODES.he.preambleNs)
    expect(symUs! * US, 'and one symbol of it').toBe(PHY_MODES.he.symNs)
  })

  it('reads the guard-interval entry, which is about a combination the standard does not mandate', () => {
    // The engine's own combination: 「基于触发的上行 PPDU 跑在 0.8 µs 的保护间隔上」, printed
    // three times in this entry — the engine's value, the pair it makes, and the capability bit.
    for (const [us] of every(LIM, /([\d.]+) µs 的保护间隔上|\(\d× LTF, ([\d.]+) µs\)/g,
      'the short guard interval, named twice', 2).map((g) => [g.find((x) => x !== undefined)!])) {
      expect(val(us!) * 1000, 'the guard interval the engine runs every PPDU at').toBe(TGI_NS.base)
    }
    const [gi] = figs(LIM, /跑在 ([\d.]+) µs 的保护间隔上/, '`limits` on the engine’s own GI')
    expect(gi! * 1000, 'the guard interval the engine runs every PPDU at').toBe(TGI_NS.base)
    // The two mandatory sets, as pairs: HE is (2×, 1.6) and (4×, 3.2); EHT adds (1×, 1.6).
    const he = figs(LIM, /HE TB 的强制集是 \((\d+)×, ([\d.]+)\) 与 \((\d+)×, ([\d.]+)\)/,
      '`limits` on the HE mandatory set')
    const eht = figs(LIM, /EHT TB 是 \((\d+)×, ([\d.]+)\)、\((\d+)×, ([\d.]+)\) 与 \((\d+)×, ([\d.]+)\)/,
      '`limits` on the EHT mandatory set')
    /*
     * **The mandatory sets are read as sets, in order** — a membership test on each figure lets
     * a planted 1× become a 2×, which is how the sweep of 2026-10-13 walked through one of them.
     * The two sets the standard gives are fixed sequences, and the guard intervals in them are
     * the engine's own doubled and quadrupled values.
     */
    expect([he[0], he[2]], 'the HE mandatory set’s two LTF multipliers').toEqual([2, 4])
    expect([eht[0], eht[2], eht[4]], 'and EHT’s three').toEqual([1, 2, 4])
    expect([he[1]! * 1000, he[3]! * 1000], 'the HE set’s two guard intervals')
      .toEqual([TGI_NS.double, TGI_NS.quad])
    expect([eht[1]! * 1000, eht[3]! * 1000, eht[5]! * 1000], 'and EHT’s three')
      .toEqual([TGI_NS.double, TGI_NS.double, TGI_NS.quad])
    for (const us of [he[1], he[3], eht[1], eht[3], eht[5]]) {
      expect(us, 'and no mandatory TB combination uses the short one').not.toBe(gi)
    }
    // 「(4×, 0.8) 在 EHT 侧挂在能力位 dot11EHT4xEHTLTFand0point8usecGIImplemented」
    const [capLtf, capUs] = figs(LIM, /\((\d+)×, ([\d.]+)\) 在 EHT 侧挂在能力位/,
      '`limits` on the capability bit')
    expect(capUs, 'the short guard interval the capability bit covers').toBe(gi)
    expect(occ(LIM, `dot11EHT${capLtf}xEHTLTFand0point8usecGIImplemented`),
      'the capability’s own name, spelled once and carrying the same two figures').toBe(1)
    // 「标准的 PPDU 上限是 5.484 ms」 against the 2 ms the engine caps an answer at.
    const [ppduMs] = figs(LIM, /PPDU 上限是 ([\d.]+) ms/, '`limits` on the standard’s own cap')
    expect(ppduMs! * MS, 'the cap the engine holds for it').toBe(MAX_PPDU_NS)
    expect(ppduMs! * MS, 'which is more than twice what a triggered answer may take')
      .toBeGreaterThan(2 * 2 * MS)
    // 「mac.ts 的 transmitTrigger 里那个 2_000_000」
    // Read as digits, not as numbers: 「000」 is a group of a grouped literal, not zero.
    const groups = raw(LIM, /里那个 (\d)_(\d+)_(\d+)/, '`limits` on the constant in `mac.ts`')
    expect(Number(groups.join('')), 'the cap, in nanoseconds, as the source writes it').toBe(2 * MS)
    // 「本课「有积压的设备 2」这一行」 and 「一个 2 ms 的回答最多装得下 17 425 B」
    // 「一个回答的长度被引擎封在 2 ms」: the same cap the steps name, worded differently.
    const [cappedMs] = figs(LIM, /长度被引擎封在 (\d+) ms/, '`limits` on the engine’s own cap')
    expect(cappedMs! * MS, 'the length the engine caps an answer at').toBe(2 * MS)
    const [backlogged] = figs(LIM, /有积压的设备 (\d+)」/, '`limits` on the backlogged devices')
    expect(backlogged, 'the uploaders this scene has').toBe(UPLOADERS.length)
    const [capB] = figs(LIM, /最多装得下 ([\d ]+) B/, '`limits` on the cap')
    expect(capB, 'the cap the engine computes')
      .toBe(maxPsduBytesFor('he', answers[0]!.frame.mcs!, 1 / UPLOADERS.length, 2 * MS, 20, 1))
  })

  it('reads the instant the lesson’s own docblock quotes, out of its source', () => {
    /*
     * **The 2057 µs the sweep of 2026-10-13 found is in a comment.** The figure computes its own
     * instant from the constants above it, so a planting cannot reach that one — but the
     * docblock over `triggeredRound` quotes the result in prose, for a reader of the source, and
     * that copy is a figure like any other. It is read out of the file.
     */
    const SRCFILE = readFileSync(new URL('../../src/course/tier2/ofdma-ul.ts', import.meta.url), 'utf8')
    const quoted = raw(SRCFILE, /两次箭头在 0 与\s*\*?\s*(\d+) µs|at 0 and at\s*\*?\s*(\d+) µs/,
      'the docblock’s own instant').find((x) => x !== undefined)!
    expect(val(quoted), 'the instant the docblock quotes')
      .toBe(Math.round((mba.t - trigger.t) / US))
  })

  it('reads the figure’s own instant, which is where the acknowledgement lands', () => {
    // The figure carries its instants as strings; the last of them is the acknowledgement's.
    const fig = JSON.stringify(ofdmaUl.picture!.filter((b) => b.kind === 'diagram'))
    const instants = [...fig.matchAll(/(\d+(?:\.\d+)?) µs/g)].map((mm) => Number(mm[1]))
    expect(instants.length, 'the figure still places its arrows by instant').toBeGreaterThan(0)
    // The figure places its arrows on whole microseconds, so the instant is read as one.
    expect(Math.max(...instants), 'the last of them is the acknowledgement’s')
      .toBe(Math.round((mba.t - trigger.t) / US))
  })
})
