import { describe, it, expect } from 'vitest'
import { decodeFrame, fmtLatency, fmtNs, fmtRecord } from '../../src/ui/format'
import { ampBsReplyFrame, ampRfidFrame } from '../../src/engine/ampBs'
import type { FrameDesc } from '../../src/model/frames'
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
