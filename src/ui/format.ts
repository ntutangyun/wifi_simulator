import type { FrameDesc } from '../model/frames'
import type { TLRecord } from '../model/records'
import type { Ns } from '../model/types'

/** "12.345 678 901" — seconds.milli micro nano. */
export function fmtNs(ns: Ns): string {
  const neg = ns < 0
  const v = Math.abs(Math.round(ns))
  const s = Math.floor(v / 1e9)
  const frac = String(v % 1e9).padStart(9, '0')
  return `${neg ? '-' : ''}${s}.${frac.slice(0, 3)} ${frac.slice(3, 6)} ${frac.slice(6, 9)}`
}

export function fmtUs(ns: Ns): string {
  return `${(ns / 1000).toFixed(1)} µs`
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
    case 'RX_FAIL': return `${r.node} rx FAILED (${r.reason})${r.from ? ` from ${r.from}` : ''}`
    case 'NAV_SET': return `${r.node} NAV set until ${fmtNs(r.untilNs)} (${r.source})`
    case 'NAV_CLEAR': return `${r.node} NAV clear`
    case 'CW_CHANGE': return `${r.node} CW → ${r.cw}${acSuffix(r.ac)}`
    case 'RETRY': return `${r.node} retry #${r.msduId} (SRC=${r.src} LRC=${r.lrc} SSRC=${r.ssrc} SLRC=${r.slrc})`
    case 'DROP': return `${r.node} DROP #${r.msduId} (${r.reason})`
    case 'ACK_TIMEOUT': return `${r.node} ACK timeout`
    case 'CTS_TIMEOUT': return `${r.node} CTS timeout`
    case 'MAC_STATE': return `${r.node} → ${r.state}`
    case 'COLLISION': return `COLLISION: ${r.nodes.join(' × ')}`
  }
}

export function decodeFrame(f: FrameDesc): { field: string; value: string }[] {
  const rows = [
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
  return rows
}
