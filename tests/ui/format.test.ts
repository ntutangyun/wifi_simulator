import { describe, it, expect } from 'vitest'
import { decodeFrame, fmtLatency, fmtNs, fmtRecord } from '../../src/ui/format'
import { ampBsReplyFrame, ampRfidFrame } from '../../src/engine/ampBs'
import type { FrameDesc } from '../../src/model/frames'
import type { TLRecord } from '../../src/model/records'
import { STRINGS } from '../../src/ui/i18n'

describe('fmtNs', () => {
  it('formats grouped nanosecond times', () => {
    expect(fmtNs(0)).toBe('0.000 000 000')
    expect(fmtNs(1234)).toBe('0.000 001 234')
    expect(fmtNs(1_234_567)).toBe('0.001 234 567')
    expect(fmtNs(12_345_678_901)).toBe('12.345 678 901')
  })
})

const frame: FrameDesc = {
  kind: 'data', src: 'ap', dst: 'sta-1', bytes: 1428, mbps: 54,
  durationFieldNs: 60_000, txTimeNs: 232_000, seqNo: 42, retryFlag: true, msduId: 7,
}

describe('fmtRecord', () => {
  it('renders TX_START with rate, airtime and retry flag', () => {
    const s = fmtRecord({ t: 0, seq: 0, type: 'TX_START', node: 'ap', frame })
    expect(s).toContain('ap → sta-1 DATA 1428 B @54 Mbps')
    expect(s).toContain('RETRY')
  })
  it('renders backoff and NAV records', () => {
    expect(fmtRecord({ t: 0, seq: 0, type: 'BACKOFF_DEC', node: 'sta-2', value: 6 })).toBe('sta-2 backoff → 6')
    expect(fmtRecord({ t: 0, seq: 0, type: 'NAV_SET', node: 'sta-2', untilNs: 293_000, source: 'data:sta-1' }))
      .toContain('NAV set until 0.000 293 000')
  })

  it('formats the four AMP records', () => {
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ROUND', node: 'ap#2g', phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, dlKbps: 250, ulKbps: 250, untilNs: 3_000_000 })).toBe('ap#2g AMP round (random): 4 slots × 272.0 µs, ACW 3, DL 250 kb/s, UL 250 kb/s')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_SLOT', node: 'ap#2g', slot: 2, untilNs: 1_000_000 })).toBe('ap#2g AMP slot 2 until 0.001 000 000')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 1, acw: 3, slot: 2 })).toBe('tag-1#2g ABOC 1 of [0, 3] → slot 2')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_ABOC', node: 'tag-1#2g', aboc: 3, acw: 3, slot: null })).toBe('tag-1#2g ABOC 3 of [0, 3] → sits out')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: true })).toBe('tag-1#2g slot 2: acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 2, sent: true, acked: false })).toBe('tag-1#2g slot 2: not acknowledged')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RESULT', node: 'tag-1#2g', slot: 3, sent: false, acked: false })).toBe('tag-1#2g slot 3: missed its cue')
  })
  it('renders the five backscatter records', () => {
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RFID', node: 'ap#2g', cmd: 'query', session: 3, q: 2, slot: 1, bstNs: 142_400, untilNs: 1_516_400 }))
      .toBe('ap#2g Query (session 3, slot 1, Q 2) — BST 142.4 µs until 0.001 516 400')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_RFID', node: 'ap#2g', cmd: 'queryRep', session: 3, slot: 2, bstNs: 142_400, untilNs: 452_400 }))
      .toBe('ap#2g QueryRep (session 3, slot 2) — BST 142.4 µs until 0.000 452 400')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_BS_COUNTER', node: 'tag-1#2g', counter: 2, q: 2 }))
      .toBe('tag-1#2g slot counter 2 of [0, 3] (Q 2)')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_BS_REPLY', node: 'tag-1#2g', kind: 'rn16', slot: 1, rxDbmAtAp: -58.39, snrDb: 11.61 }))
      .toBe('tag-1#2g backscatters RN16 in slot 1 — -58.4 dBm at the reader, 11.6 dB over its floor')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_INVENTORY', node: 'ap#2g', session: 3, slotsOffered: 1, read: ['0123456789abcdef01234567'], collisions: 0, empties: 0, txopNs: 3_697_200, complete: false }))
      .toBe('ap#2g inventory session 3: 1 slots, 1 read, 0 collided, 0 empty in 3697.2 µs (to be continued)')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_BS_BOOT', node: 'tag-1#2g', powered: true, incidentDbm: -16.2 }))
      .toBe('tag-1#2g boots on -16.2 dBm of excitation')
    expect(fmtRecord({ t: 0, seq: 0, type: 'AMP_BS_BOOT', node: 'tag-1#2g', powered: false, incidentDbm: -16.2 }))
      .toContain('no wake-up preamble')
  })
})

/**
 * The frequency-selectivity row, which until now nothing in this repository ever read.
 *
 * That is the gap this block closes: `WIFI_SEL` did not appear anywhere in this file, so every
 * wording decision slice 4b made about the one record that carries a level — the member's bin
 * range, its share, and the denominator Task 3 added — was unasserted, while the design's
 * acceptance criterion (§9 item 5) is literally "read a round's event log and check that a
 * member's row prints bins 0 to 3 **of nine** rather than nine, and that bin 8's absence can be
 * seen". A row is pinned here character for character, not by `toContain`, because what is
 * under test is the sentence.
 *
 * `fmtShare`'s own three boundaries are pinned beside it, and two of the three are **not
 * reachable from any scenario this engine can build**, which is said here rather than left for
 * the next reader to discover:
 *
 *   - **a share of `1`** cannot occur. `ruFraction` is `1 / n` and both OFDMA paths gate at two
 *     members and cap at four (`muDsts.length >= 2` / `users.length >= 2` and `.slice(0, 4)`,
 *     mac.ts), so the reachable set is exactly 1/2, 1/3 and 1/4 — and a receiver reading the
 *     whole channel carries no share at all rather than a share of one;
 *   - **one bin** cannot occur either: `selMemberBins`'s floor of one is below the smallest run
 *     the engine builds, which is 20 MHz over four members, i.e. two bins;
 *   - **a share that is not a reciprocal** cannot occur while `mac.ts` divides evenly, and it is
 *     the case `fmtShare`'s decimal branch exists for.
 *
 * They are pinned anyway because the record's type permits all three, so the formatter will be
 * asked for them the day an uneven allocation or a real tone table lands — and because an
 * unasserted branch of a formatter is how "its 0.000 of the channel" stays in a product.
 */
describe('fmtRecord: the frequency-selectivity row', () => {
  /** A member of a two-member 20 MHz PPDU: four of the nine bins, the low half. */
  const sel: Extract<TLRecord, { type: 'WIFI_SEL' }> = {
    t: 0, seq: 0, type: 'WIFI_SEL', node: 'sta-1', from: 'ap',
    meanSinrDb: 54.42, effSinrDb: 52.08, lossDb: 2.34, bins: 4, binStart: 0,
    ruFraction: 0.5, widthMhz: 20, worstBinDb: -4.83, threshDb: 7,
  }
  const row = (o: Partial<typeof sel> = {}): string => fmtRecord({ ...sel, ...o })

  it('prints a member’s run against the channel’s own bin count', () => {
    expect(row()).toBe(
      'sta-1 ⇠ ap selectivity: mean 54.4 dB, worst bin -4.8 dB, effective 52.1 dB '
      + '(loss 2.3 dB over bins 0–3 of 9, its 1/2 of the channel)')
    // The other member of the same PPDU, and the point of design §9 item 5: 4 to 7 of 9 leaves
    // bin 8 visibly unclaimed, which no pair of counts alone would show.
    expect(row({ binStart: 4 })).toContain('over bins 4–7 of 9, its 1/2 of the channel')
    expect(row({ bins: 3, binStart: 3, ruFraction: 1 / 3 }))
      .toContain('over bins 3–5 of 9, its 1/3 of the channel')
    expect(row({ bins: 2, binStart: 6, ruFraction: 1 / 4 }))
      .toContain('over bins 6–7 of 9, its 1/4 of the channel')
    // The denominator is the row's own `widthMhz`, so a wider PPDU says so without help.
    expect(row({ bins: 36, binStart: 36, widthMhz: 160 }))
      .toContain('over bins 36–71 of 72, its 1/2 of the channel')
  })

  /**
   * The whole-channel row, which is still the common case and must read exactly as it did
   * before any of this: no range, no share, no denominator — because there `bins` already *is*
   * the channel's count. Slice 4b claimed this wording was unchanged character for character;
   * this is the assertion behind the claim.
   */
  it('leaves a whole-channel row saying what it always said', () => {
    const { ruFraction: _omitted, ...whole } = sel
    expect(fmtRecord({ ...whole, bins: 9 })).toBe(
      'sta-1 ⇠ ap selectivity: mean 54.4 dB, worst bin -4.8 dB, effective 52.1 dB '
      + '(loss 2.3 dB over 9 bins)')
  })

  it('renders the three shares the engine cannot produce, rather than leaving them unseen', () => {
    // A whole share: the record says "a share of all of it" instead of saying nothing, and the
    // formatter does print it as a fraction of one.
    expect(row({ bins: 9, binStart: 0, ruFraction: 1 })).toContain('bins 0–8 of 9, its 1/1')
    // A single bin: the range collapses to one number repeated, which is legible and is what
    // `selMemberBins`'s floor would produce.
    expect(row({ bins: 1, binStart: 8, ruFraction: 1 / 9 })).toContain('bins 8–8 of 9, its 1/9')
    // An uneven allocation: the decimal branch, which is the branch `fmtShare` exists for.
    expect(row({ ruFraction: 0.4 })).toContain('its 0.400 of the channel')
    // And the degenerate end of that branch. Asserted so that it is a known output rather than
    // a surprise: a share of zero is not a resource unit, and only the type permits it.
    expect(row({ bins: 1, ruFraction: 0 })).toContain('bins 0–0 of 9, its 0.000 of the channel')
  })

  /**
   * `fmtShare` used to test its reciprocal with a tolerance of `1e-9` — the one unlabelled
   * numeric literal this slice put in `src/`. It is `Number.isInteger` now, and the first half
   * of this test is why that costs nothing today: `1 / (1 / n)` comes back as exactly `n`, with
   * zero error, for every n a share in this engine could name.
   */
  it('needs no tolerance to recognise a reachable reciprocal share', () => {
    for (let n = 2; n <= 9; n++) {
      expect(1 / (1 / n)).toBe(n)
      expect(row({ ruFraction: 1 / n })).toContain(`its 1/${n} of the channel`)
    }
  })

  /**
   * ...and the second half is the boundary that range cannot see, which is exactly why it is
   * written out separately. The exact predicate is **strictly stricter** than the tolerance it
   * replaced, and the two disagree on 33 of the reciprocals from 1/2 to 1/400 — the first being
   * **1/49**, where the round trip lands on `49.00000000000001`. A loop over 2 to 9 can never
   * find that, so this pins it as a known output rather than a surprise.
   *
   * Unreachable today (shares are 1/2, 1/3 or 1/4) and harmless: no bin count this feature
   * names has a reciprocal in the 33. It stops being harmless the day an allocation finer than
   * even-division-among-four exists — the real tone table the next slice promises — and then a
   * reader sees `0.020 of the channel`, which reads as a measurement rather than as one of
   * forty-nine equal parts. This test is what makes that day a red test instead of a surprise
   * in an event log.
   */
  it('prints the one-in-forty-nine share as a decimal, which the tolerance did not', () => {
    expect(1 / (1 / 49)).toBe(49.00000000000001)
    expect(Number.isInteger(1 / (1 / 49))).toBe(false)
    expect(Math.abs(1 / (1 / 49) - 49) < 1e-9).toBe(true) // what the retired tolerance said
    expect(row({ bins: 1, ruFraction: 1 / 49 })).toContain('its 0.020 of the channel')
  })
})

describe('decodeFrame', () => {
  /** The rows are labelled from the one string table, so the pins name it. */
  const R = STRINGS.frameDetail.fields.row

  it('lists MAC header fields', () => {
    const rows = decodeFrame(frame)
    const get = (f: string) => rows.find((r) => r.field === f)?.value
    expect(get(R.ra)).toBe('sta-1')
    expect(get(R.seqNo)).toBe('42')
    expect(get(R.retryFlag)).toBe('1')
    expect(get(R.txtime)).toBe('232.0 µs')
  })
  it('names the excitations of an RFID command and what a reflection carried', () => {
    const cmd = ampRfidFrame({
      src: 'ap', dst: '*tags', cmd: 'query', session: 1, q: 2, slot: 1, ulKbps: 250,
      wupNs: 1_000_000, bstNs: 142_400, chargeDbm: 10, bsDbm: 0, signalExtNs: 6_000,
    })
    const get = (rows: ReturnType<typeof decodeFrame>, f: string) => rows.find((r) => r.field === f)?.value
    const dl = decodeFrame(cmd)
    expect(get(dl, R.gen2Cmd)).toBe('Query')
    expect(get(dl, R.q)).toBe(R.qValue(2, 4))
    expect(get(dl, R.wup)).toBe('1000.0 µs')
    expect(get(dl, R.bst)).toBe('142.4 µs')
    expect(get(dl, R.excitationPower)).toBe(R.excitationValue(10, 0))

    const reply = ampBsReplyFrame({ src: 'tag-1', dst: 'ap', reply: 'epc', kbps: 250, slot: 1, epc: 'a'.repeat(24) })
    reply.amp!.bs!.incidentDbm = -26.2
    const ul = decodeFrame(reply)
    expect(get(ul, R.gen2Reply)).toBe('EPC')
    expect(get(ul, R.epc)).toBe('a'.repeat(24))
    expect(get(ul, R.incident)).toBe('-26.2 dBm')
    // a command with no WUP says so rather than printing a zero
    const rep = ampRfidFrame({ ...{ src: 'ap', dst: '*tags', cmd: 'queryRep' as const, session: 1, slot: 2, ulKbps: 250 as const, wupNs: 0, bstNs: 142_400, chargeDbm: 10, bsDbm: 0, signalExtNs: 6_000 } })
    expect(get(decodeFrame(rep), R.wup)).toBe('—')
  })
})

describe('fmtLatency', () => {
  it('shows mean / max in ms, or a dash when nothing has been delivered', () => {
    expect(fmtLatency({ n: 0, sumNs: 0, maxNs: 0 })).toBe('—')
    expect(fmtLatency({ n: 2, sumNs: 1_000_000, maxNs: 700_000 })).toBe('0.50 / 0.70 ms')
    expect(fmtLatency({ n: 4, sumNs: 50_000_000, maxNs: 31_250_000 })).toBe('12.5 / 31.3 ms')
  })
})
