/**
 * Event-log lines for the UWB half of the record stream. Kept beside the
 * engine rather than in ui/format.ts so the ranging vocabulary (RCTU counters,
 * TWR methods, figures of merit) lives with the code that produces it;
 * fmtRecord simply delegates the eight UWB types here.
 */
import type { TLRecord } from '../model/records'
import type { UwbMode } from '../model/scenario'
import { fmtNs, fmtUs } from '../ui/fmtTime'
import type { UwbFrameKind } from './frames'
import { fomText } from './phy'
import { rctuToMetres } from './ranging'
import type { UwbFixMethod } from './records'

/** The UWB members of TLRecord, timeline fields included. */
export type UwbTLRecord = Extract<TLRecord, { type: `UWB_${string}` }>

/** The one-word name a ranging frame goes by in the log. */
const KIND_SHORT: Record<UwbFrameKind, string> = {
  uwbPoll: 'poll', uwbResp: 'resp', uwbFinal: 'final', uwbReport: 'report', uwbBlink: 'blink',
}

/** How a fix was solved, as the log names it. */
const METHOD_SHORT: Record<UwbFixMethod, string> = {
  twr: 'TWR', 'dl-tdoa': 'DL-TDoA', 'ul-tdoa': 'UL-TDoA', aoa: 'AoA',
}

/** What a round measures, as the log names it. Only two-way ranging has an SS/DS flavour —
 * a one-way round is named by its direction, and printing "DS-TWR" over it would be a lie. */
function roundName(mode: UwbMode, method: 'ss' | 'ds'): string {
  return mode === 'twr' ? `${method.toUpperCase()}-TWR` : METHOD_SHORT[mode]
}

export function fmtUwbRecord(r: UwbTLRecord): string {
  switch (r.type) {
    case 'UWB_ROUND':
      return `${r.node} UWB round ${r.round} of block ${r.block} (${roundName(r.mode, r.method)}): ${r.slots} slots × ${fmtUs(r.slotNs)}`
    case 'UWB_SLOT':
      return `${r.node} UWB slot ${r.slot} until ${fmtNs(r.untilNs)}`
    case 'UWB_TS':
      return `${r.node} ${r.dir.toUpperCase()} RMARKER ${r.dir === 'tx' ? '→' : '←'} ${r.peer} ${KIND_SHORT[r.frameKind]}: counter ${r.counter}${r.fom !== undefined ? ` (${fomText(r.fom)})` : ''}`
    case 'UWB_RANGE':
      return `${r.node} range → ${r.peer} (${r.method.toUpperCase()}): ${r.distM.toFixed(2)} m (true ${r.trueDistM.toFixed(2)} m${r.tofRawRctu !== undefined ? `, raw ${rctuToMetres(r.tofRawRctu).toFixed(2)} m` : ''})`
    case 'UWB_TDOA':
      return `${r.node} TDoA ${r.peer} − ${r.ref}: ${r.dtNs.toFixed(2)} ns (true ${r.trueDtNs.toFixed(2)} ns)`
    case 'UWB_POSITION': {
      const err = Math.hypot(r.x - r.trueX, r.y - r.trueY)
      // Two-way ranging is the line's unmarked case — it is the only fix the log could print
      // before one-way ranging existed, and the lessons quote it word for word. Any other
      // method names itself, because "4 anchors" means something different in each of them.
      const how = r.method === 'twr' ? '' : ` (${METHOD_SHORT[r.method]})`
      return `${r.node} position (${r.x.toFixed(2)}, ${r.y.toFixed(2)}) m, true (${r.trueX.toFixed(2)}, ${r.trueY.toFixed(2)}), error ${err.toFixed(2)} m, GDOP ${r.gdop.toFixed(2)}, ${r.anchors.length} anchors${how}`
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
