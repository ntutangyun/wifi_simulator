import { GEN2_CMD_NAME, GEN2_REPLY_NAME } from '../engine/ampBs'
import { selBins } from '../engine/selectivity'
import type { FrameDesc } from '../model/frames'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'
import type { LatencyStats } from '../model/view'
import { fmtUwbRecord } from '../uwb/format'
import { uwbFrameFields } from '../uwb/frameFields'
import { fmtNs, fmtUs } from './fmtTime'
import { STRINGS, type Strings } from './i18n'

// The two time formatters live in ./fmtTime (a leaf); they stay part of this module's
// surface, because every UI component asks ui/format.ts for them.
export { fmtNs, fmtUs }

/** "mean / max ms" of a delivery-latency accumulator; a dash before the first delivery. */
export function fmtLatency(l: LatencyStats): string {
  if (l.n === 0) return '—'
  const ms = (ns: Ns) => {
    const v = ns / 1e6
    return v >= 10 ? v.toFixed(1) : v.toFixed(2)
  }
  return `${ms(l.sumNs / l.n)} / ${ms(l.maxNs)} ms`
}

const AC_NAME = ['BK', 'BE', 'VI', 'VO']
const acSuffix = (ac?: number) => (ac === undefined ? '' : ` [AC_${AC_NAME[ac]}]`)

/**
 * An OFDMA member's share of the channel, as a fraction when it is one.
 *
 * `mac.ts` divides evenly, so every share this engine produces is `1 / n` — and `1/3` printed
 * as `0.33` or `33 %` reads like a measurement of something rather than one of three equal
 * parts. The reciprocal is only used when it is a whole number, so an uneven allocation (which
 * this engine cannot build today, but the record can carry) prints as the number it is instead
 * of being rounded into a tidy fraction.
 *
 * **`Number.isInteger` rather than a tolerance, and it is not the same predicate.** This line
 * used to read `Math.abs(n - Math.round(n)) < 1e-9`, the only numeric literal slice 4b added to
 * `src/` and the only one with no provenance tag. The exact test is **strictly stricter** — it
 * accepts a subset — and the two disagree on 33 of the reciprocals from 1/2 to 1/400, the first
 * being **1/49**: `1 / (1 / 49)` is `49.00000000000001`, which the tolerance called a 49th and
 * this predicate prints as `0.020` instead. So this is a deliberate narrowing, not a
 * simplification of an equivalent.
 *
 * **Why the narrowing is right here.** Every share this engine can build is 1/2, 1/3 or 1/4
 * (`transmitDlMu` and `transmitTrigger` both gate at two users and cap at four, mac.ts), and
 * `1 / (1 / n)` is exactly `n` for all of those — for every n from 2 to 9, in fact — so no
 * reachable input moves. Nor does any bin count this feature names (9, 18, 36, 37, 72, 74, 144,
 * 148) have a reciprocal among the 33. The exact predicate also handles the degenerate inputs
 * the record's type allows but the engine never emits: a share of 0 gives `Infinity`, not an
 * integer, so it falls to the decimal branch — where the old expression arrived only via `NaN`.
 *
 * **What would make the narrowing wrong**, so that it is noticed rather than rediscovered: a
 * share whose reciprocal is one of those 33. That needs an allocation finer than even division
 * among at most four — the real tone table `selectivity.ts` promises the next slice. A 1/49
 * share would then read as `0.020 of the channel`, which looks like a measurement rather than
 * one of forty-nine equal parts, and the fix is a rational share on the record, not a tolerance
 * back here. `tests/ui/format.test.ts` pins 1/49 so that the day it matters is a red test.
 */
function fmtShare(ruFraction: number): string {
  const n = 1 / ruFraction
  return Number.isInteger(n) ? `1/${n}` : ruFraction.toFixed(3)
}

export function fmtRecord(r: TLRecord): string {
  switch (r.type) {
    case 'INTERNAL_COLLISION': return `${r.node} internal collision: AC_${AC_NAME[r.winnerAc]} beats AC_${AC_NAME[r.loserAc]}`
    case 'TXOP_START': return `${r.node} TXOP start (AC_${AC_NAME[r.ac]}) until ${fmtNs(r.untilNs)}`
    case 'TXOP_END': return `${r.node} TXOP end`
    case 'ARRIVAL': return `${r.node} ← app data ${r.bytes} B for ${r.dst}`
    case 'ENQUEUE': return `${r.node} enqueue #${r.msduId} (${r.bytes} B → ${r.dst}), depth ${r.depth}`
    case 'DEQUEUE': return `${r.node} dequeue #${r.msduId}, depth ${r.depth}`
    case 'WAN_TX': return `cloud ${r.server} -> ${r.to} #${r.msduId} (${r.bytes} B), at AP ${fmtNs(r.arriveNs)}`
    case 'WAN_RX': return `cloud ${r.server} <- ${r.from} #${r.msduId} (${r.bytes} B) after WAN`
    case 'CCA_BUSY': return `${r.node} CCA busy (${r.cause})`
    case 'CCA_IDLE': return `${r.node} CCA idle`
    case 'IFS_START': return `${r.node} ${r.kind} wait until ${fmtNs(r.untilNs)}${acSuffix(r.ac)}`
    case 'IFS_END': return `${r.node} IFS complete`
    case 'BACKOFF_DRAW': return `${r.node} backoff draw ${r.value} (CW=${r.cw})${acSuffix(r.ac)}`
    case 'BACKOFF_DEC': return `${r.node} backoff → ${r.value}`
    case 'BACKOFF_FREEZE': return `${r.node} backoff frozen at ${r.value}`
    case 'BACKOFF_RESUME': return `${r.node} backoff resumes at ${r.value}`
    case 'TX_START': {
      const f = r.frame
      const agg = f.ampdu ? ` A-MPDU×${f.ampdu.mpduCount}` : ''
      const mu = f.muParts ? ` MU×${f.muParts.length}` : ''
      const mcs = f.mcs !== undefined ? ` ${f.mode?.toUpperCase()} MCS${f.mcs}` : ''
      return `${r.node} → ${f.dst} ${f.kind.toUpperCase()}${agg}${mu} ${f.bytes} B @${f.mbps} Mbps${mcs} (${fmtUs(f.txTimeNs)})${f.retryFlag ? ' RETRY' : ''}${acSuffix(f.ac)}`
    }
    case 'TX_END': return `${r.node} ${r.frame.kind.toUpperCase()} tx end`
    case 'RX_START': return `${r.node} ⇠ preamble from ${r.from} (${r.frame.kind.toUpperCase()})`
    case 'RX_OK': return `${r.node} ⇠ ${r.frame.kind.toUpperCase()} from ${r.from} OK`
    case 'RX_MISS': return `${r.node} missed preamble from ${r.from} (SINR < 4 dB)`
    case 'RX_FAIL': return `${r.node} rx FAILED (${r.reason})${r.from ? ` from ${r.from}` : ''}`
    case 'NAV_SET': return `${r.node} NAV set until ${fmtNs(r.untilNs)} (${r.source})`
    case 'NAV_CLEAR': return `${r.node} NAV clear`
    case 'CW_CHANGE': return `${r.node} CW → ${r.cw}${acSuffix(r.ac)}`
    case 'RETRY': return `${r.node} retry #${r.msduId} (retries=${r.retries} QSRC=${r.qsrc})`
    case 'DROP': return `${r.node} DROP #${r.msduId} (${r.reason})`
    case 'ACK_TIMEOUT': return `${r.node} ACK timeout`
    case 'CTS_TIMEOUT': return `${r.node} CTS timeout`
    case 'MAC_STATE': return `${r.node} → ${r.state}`
    case 'COLLISION': return `COLLISION: ${r.nodes.join(' × ')}`
    case 'AMP_ROUND': return `${r.node} AMP round (${r.phase}): ${r.slots} slots × ${fmtUs(r.slotNs)}, ACW ${2 ** r.acwe - 1}, DL ${r.dlKbps} kb/s, UL ${r.ulKbps} kb/s`
    case 'AMP_SLOT': return `${r.node} AMP slot ${r.slot} until ${fmtNs(r.untilNs)}`
    case 'AMP_ABOC': return `${r.node} ABOC ${r.aboc} of [0, ${r.acw}] → ${r.slot === null ? 'sits out' : `slot ${r.slot}`}`
    case 'AMP_RESULT': return `${r.node} slot ${r.slot}: ${!r.sent ? 'missed its cue' : r.acked ? 'acknowledged' : 'not acknowledged'}`
    // Backscatter: the reader's commands, and what the tags reflect back out of them.
    case 'AMP_RFID': return `${r.node} ${GEN2_CMD_NAME[r.cmd]} (session ${r.session}, slot ${r.slot}${r.q === undefined ? '' : `, Q ${r.q}`}) — BST ${fmtUs(r.bstNs)} until ${fmtNs(r.untilNs)}`
    case 'AMP_BS_COUNTER': return `${r.node} slot counter ${r.counter} of [0, ${2 ** r.q - 1}] (Q ${r.q})`
    case 'AMP_BS_REPLY': return `${r.node} backscatters ${GEN2_REPLY_NAME[r.kind]} in slot ${r.slot} — ${r.rxDbmAtAp.toFixed(1)} dBm at the reader, ${r.snrDb.toFixed(1)} dB over its floor`
    case 'AMP_INVENTORY': return `${r.node} inventory session ${r.session}: ${r.slotsOffered} slots, ${r.read.length} read, ${r.collisions} collided, ${r.empties} empty in ${fmtUs(r.txopNs)}${r.complete ? ' (complete)' : ' (to be continued)'}`
    case 'AMP_BS_BOOT': return r.powered
      ? `${r.node} boots on ${r.incidentDbm.toFixed(1)} dBm of excitation`
      : `${r.node} heard a command with no wake-up preamble: no power to answer it`
    case 'WIFI_SEL': {
      // `bins` is how many bins this decision read, not how many the channel has (slice 4b), so
      // a member's row has to say which bins and what share: "4 bins" on a 9-bin channel is
      // otherwise indistinguishable from a defect. A whole-channel row keeps its old wording
      // character for character — it is still the common case and still means the same thing.
      // The denominator comes from the row's own `widthMhz` (Task 3), never from whatever
      // other rows happen to be in the same log: a two-member scene can produce no
      // whole-channel row at all, and `bins / ruFraction` recovers 8 rather than 9 because the
      // truncation dropped the bin nobody holds.
      const span = r.ruFraction === undefined
        ? `${r.bins} bins`
        : `bins ${r.binStart}–${r.binStart + r.bins - 1} of ${selBins(r.widthMhz)}, `
          + `its ${fmtShare(r.ruFraction)} of the channel`
      return `${r.node} ⇠ ${r.from} selectivity: mean ${r.meanSinrDb.toFixed(1)} dB, worst bin ${r.worstBinDb.toFixed(1)} dB, effective ${r.effSinrDb.toFixed(1)} dB (loss ${r.lossDb.toFixed(1)} dB over ${span})`
    }
    // The UWB types keep their vocabulary beside the ranging engine. No count in this
    // comment: it was wrong twice as the union grew, and TS2366 on the switch below is
    // what actually holds the list complete.
    case 'UWB_ROUND':
    case 'UWB_SLOT':
    case 'UWB_TS':
    case 'UWB_RANGE':
    case 'UWB_TDOA':
    case 'UWB_AOA':
    case 'UWB_POSITION':
    case 'UWB_TIMEOUT':
    case 'UWB_ROUND_END':
    case 'UWB_CONTEND':
    case 'UWB_CONTEND_COLLISION':
    case 'UWB_RMNR':
    case 'UWB_MMRCM':
    case 'UWB_SP3':
    case 'UWB_SP3_REPORT':
    case 'UWB_ANCILLARY':
    case 'UWB_NB_LBT':
    case 'UWB_SSBD':
    case 'UWB_MMS_TRAIN':
    case 'UWB_INTERFERED':
    case 'UWB_STS_REJECT':
    case 'UWB_ECHO': return fmtUwbRecord(r)
  }
}

export interface FieldRow {
  field: string
  value: string
}

/**
 * The little table the event log expands under a frame. `S` names its rows — the
 * 802.11 header on `S.row`, a ranging frame's MHR and IEs on `S.name` — and
 * defaults to the one string table, which is the only one there is.
 */
export function decodeFrame(f: FrameDesc, S: Strings['frameDetail']['fields'] = STRINGS.frameDetail.fields): FieldRow[] {
  // An 802.15.4 ranging frame has no RA/TA, no Duration and no Retry bit; naming
  // those here would contradict the frame inspector two panels away. Reuse the
  // one UWB decode instead, so the log shows the MHR and the ranging IEs.
  if (f.uwb) return uwbFieldRows(f, S)
  const R = S.row
  const rows: FieldRow[] = [
    { field: R.type, value: f.kind.toUpperCase() },
    { field: R.ra, value: f.dst },
    { field: R.ta, value: f.src },
    { field: R.psduLength, value: R.octets(f.bytes) },
    { field: R.dataRate, value: `${f.mbps} Mbps` },
    { field: R.txtime, value: fmtUs(f.txTimeNs) },
    { field: R.durationId, value: R.navRest(fmtUs(f.durationFieldNs)) },
  ]
  if (f.seqNo !== undefined) rows.push({ field: R.seqNo, value: String(f.seqNo) })
  rows.push({ field: R.retryFlag, value: f.retryFlag ? '1' : '0' })
  if (f.amp) {
    rows.push({ field: R.ampRate, value: R.ampRateValue(f.amp.kbps) })
    if (f.kind === 'ampTrigger') {
      rows.push({ field: R.slots, value: String(f.amp.slots) })
      rows.push({ field: R.slotDuration, value: fmtUs(f.amp.slotNs ?? 0) })
      rows.push({ field: R.acwe, value: String(f.amp.acwe) })
      rows.push({ field: R.phase, value: f.amp.phase ? R.phaseName[f.amp.phase] : '' })
    } else if (f.kind === 'ampAck') {
      rows.push({ field: R.acksSlot, value: String(f.amp.ackFor) })
    } else if (f.kind === 'ampResp') {
      rows.push({ field: R.slot, value: String(f.amp.slot) })
      rows.push({ field: R.aboc, value: String(f.amp.aboc) })
    } else if (f.amp.rfid) {
      const r = f.amp.rfid
      rows.push({ field: R.gen2Cmd, value: GEN2_CMD_NAME[r.cmd] })
      rows.push({ field: R.sessionSlot, value: `${r.session} / ${r.slot}` })
      if (r.q !== undefined) rows.push({ field: R.q, value: R.qValue(r.q, 2 ** r.q) })
      if (r.rn16 !== undefined) rows.push({ field: R.rn16, value: r.rn16.toString(16).padStart(4, '0') })
      rows.push({ field: R.wup, value: r.wupNs === 0 ? '—' : fmtUs(r.wupNs) })
      rows.push({ field: R.bst, value: fmtUs(r.bstNs) })
      rows.push({ field: R.excitationPower, value: R.excitationValue(r.chargeDbm, r.bsDbm) })
    } else if (f.amp.bs) {
      const b = f.amp.bs
      rows.push({ field: R.gen2Reply, value: GEN2_REPLY_NAME[b.reply] })
      rows.push({ field: R.slot, value: String(b.slot) })
      if (b.rn16 !== undefined) rows.push({ field: R.rn16, value: b.rn16.toString(16).padStart(4, '0') })
      if (b.epc !== undefined) rows.push({ field: R.epc, value: b.epc })
      if (b.incidentDbm !== undefined) rows.push({ field: R.incident, value: `${b.incidentDbm.toFixed(1)} dBm` })
    }
  }
  return rows
}

function uwbFieldRows(f: FrameDesc, S: Strings['frameDetail']['fields']): FieldRow[] {
  const mpdu = uwbFrameFields(f).users[0].subframes[0].mpdu
  const rows: FieldRow[] = [
    { field: S.title, value: S.mpdu(mpdu.typeName, mpdu.subtypeName, mpdu.bytes) },
  ]
  for (const x of mpdu.fields) {
    const who = x.node === undefined ? undefined : x.node.startsWith('*') ? S.broadcast : x.node
    const detail = who !== undefined ? `${who}${x.value ? ` (${x.value})` : ''}` : x.value ?? ''
    rows.push({ field: S.name[x.key], value: `${x.bytes} B · ${detail}` })
  }
  rows.push({ field: S.ppdu, value: `${fmtUs(f.txTimeNs)} · ${f.mbps} Mbps BPRF` })
  return rows
}
