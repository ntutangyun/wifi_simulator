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
    // The eight UWB types keep their vocabulary beside the ranging engine.
    case 'UWB_ROUND':
    case 'UWB_SLOT':
    case 'UWB_TS':
    case 'UWB_RANGE':
    case 'UWB_POSITION':
    case 'UWB_TIMEOUT':
    case 'UWB_ROUND_END':
    case 'UWB_INTERFERED': return fmtUwbRecord(r)
  }
}

export interface FieldRow {
  field: string
  value: string
}

/**
 * The little table the event log expands under a frame. `S` names the fields of
 * a ranging frame in the reader's language; it defaults to English for the call
 * sites that only ever pass Wi-Fi frames, whose labels are not translated.
 */
export function decodeFrame(f: FrameDesc, S: Strings['frameDetail']['fields'] = STRINGS.en.frameDetail.fields): FieldRow[] {
  // An 802.15.4 ranging frame has no RA/TA, no Duration and no Retry bit; naming
  // those here would contradict the frame inspector two panels away. Reuse the
  // one UWB decode instead, so the log shows the MHR and the ranging IEs.
  if (f.uwb) return uwbFieldRows(f, S)
  const rows: FieldRow[] = [
    { field: 'Type', value: f.kind.toUpperCase() },
    { field: 'RA / Address 1', value: f.dst },
    { field: 'TA / Address 2', value: f.src },
    { field: 'PSDU length', value: `${f.bytes} octets` },
    { field: 'Data rate', value: `${f.mbps} Mbps` },
    { field: 'TXTIME', value: fmtUs(f.txTimeNs) },
    { field: 'Duration/ID', value: `${fmtUs(f.durationFieldNs)} (NAV for rest of exchange)` },
  ]
  if (f.seqNo !== undefined) rows.push({ field: 'Sequence number', value: String(f.seqNo) })
  rows.push({ field: 'Retry flag', value: f.retryFlag ? '1' : '0' })
  if (f.amp) {
    rows.push({ field: 'AMP rate', value: `${f.amp.kbps} kb/s (Manchester OOK)` })
    if (f.kind === 'ampTrigger') {
      rows.push({ field: 'Slots', value: String(f.amp.slots) })
      rows.push({ field: 'Slot duration', value: fmtUs(f.amp.slotNs ?? 0) })
      rows.push({ field: 'ACWE', value: String(f.amp.acwe) })
      rows.push({ field: 'Phase', value: String(f.amp.phase) })
    } else if (f.kind === 'ampAck') {
      rows.push({ field: 'Acknowledges slot', value: String(f.amp.ackFor) })
    } else if (f.kind === 'ampResp') {
      rows.push({ field: 'Slot', value: String(f.amp.slot) })
      rows.push({ field: 'ABOC', value: String(f.amp.aboc) })
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
