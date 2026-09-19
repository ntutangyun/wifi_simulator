/**
 * Event-log lines for the UWB half of the record stream. Kept beside the
 * engine rather than in ui/format.ts so the ranging vocabulary (RCTU counters,
 * TWR methods, figures of merit) lives with the code that produces it;
 * fmtRecord simply delegates the eight UWB types here.
 */
import type { TLRecord } from '../model/records'
import { fmtNs, fmtUs } from '../ui/fmtTime'
import type { UwbFrameKind } from './frames'
import { fomText } from './phy'
import { rctuToMetres } from './ranging'

/** The UWB members of TLRecord, timeline fields included. */
export type UwbTLRecord = Extract<TLRecord, { type: `UWB_${string}` }>

/** The one-word name a ranging frame goes by in the log. */
const KIND_SHORT: Record<UwbFrameKind, string> = {
  uwbPoll: 'poll', uwbResp: 'resp', uwbFinal: 'final', uwbReport: 'report', uwbBlink: 'blink',
}

export function fmtUwbRecord(r: UwbTLRecord): string {
  switch (r.type) {
    case 'UWB_ROUND':
      return `${r.node} UWB round ${r.round} of block ${r.block} (${r.method.toUpperCase()}-TWR): ${r.slots} slots × ${fmtUs(r.slotNs)}`
    case 'UWB_SLOT':
      return `${r.node} UWB slot ${r.slot} until ${fmtNs(r.untilNs)}`
    case 'UWB_TS':
      return `${r.node} ${r.dir.toUpperCase()} RMARKER ${r.dir === 'tx' ? '→' : '←'} ${r.peer} ${KIND_SHORT[r.frameKind]}: counter ${r.counter}${r.fom !== undefined ? ` (${fomText(r.fom)})` : ''}`
    case 'UWB_RANGE':
      return `${r.node} range → ${r.peer} (${r.method.toUpperCase()}): ${r.distM.toFixed(2)} m (true ${r.trueDistM.toFixed(2)} m${r.tofRawRctu !== undefined ? `, raw ${rctuToMetres(r.tofRawRctu).toFixed(2)} m` : ''})`
    case 'UWB_POSITION': {
      const err = Math.hypot(r.x - r.trueX, r.y - r.trueY)
      return `${r.node} position (${r.x.toFixed(2)}, ${r.y.toFixed(2)}) m, true (${r.trueX.toFixed(2)}, ${r.trueY.toFixed(2)}), error ${err.toFixed(2)} m, GDOP ${r.gdop.toFixed(2)}, ${r.anchors.length} anchors`
    }
    case 'UWB_TIMEOUT':
      return `${r.node} UWB slot ${r.slot}: no ${KIND_SHORT[r.expected]} from ${r.peer}`
    case 'UWB_CONTEND':
      return r.slot === null
        ? `${r.node} sits out this round`
        : `${r.node} contends: slot ${r.slot} (attempt ${r.attempt})`
    case 'UWB_CONTEND_COLLISION':
      return `${r.node} contention collision in slot ${r.slot}`
    case 'UWB_ROUND_END':
      return `${r.node} UWB round ${r.round} of block ${r.block} ends`
    case 'UWB_INTERFERED':
      return `${r.node} UWB frame from ${r.from} lost to Wi-Fi: SIR ${r.sirDb.toFixed(1)} dB (foreign ${r.foreignDbm.toFixed(1)} dBm)`
  }
}
