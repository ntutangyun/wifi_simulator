/**
 * Event-log lines for the UWB half of the record stream. Kept beside the
 * engine rather than in ui/format.ts so the ranging vocabulary (RCTU counters,
 * TWR methods, figures of merit) lives with the code that produces it;
 * fmtRecord simply delegates the UWB types here - the fourteen `src/ui/format.ts` lists in the
 * switch that hands them over.
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
  uwbRsf: 'RSF', uwbRif: 'RIF', nbPoll: 'nb-poll', nbResp: 'nb-resp', nbReport: 'nb-report',
}

/** How a fix was solved, as the log names it. */
const METHOD_SHORT: Record<UwbFixMethod, string> = {
  twr: 'TWR', 'dl-tdoa': 'DL-TDoA', 'ul-tdoa': 'UL-TDoA', aoa: 'AoA',
}

/** What a round measures, as the log names it. Only two-way ranging has an SS/DS flavour —
 * a one-way round is named by its direction, and printing "DS-TWR" over it would be a lie. */
function roundName(mode: UwbMode, method: 'ss' | 'ds'): string {
  if (mode === 'twr') return `${method.toUpperCase()}-TWR`
  // An MMS round is two-way, but naming it "SS-TWR" would hide what makes it different: the
  // narrowband control plane and the fragment train. 4ab draft 15-22/0381r5 §1.1
  if (mode === 'mms') return 'MMS'
  return METHOD_SHORT[mode]
}

/** " of tag-1" when a record is about another node (UL-TDoA), and nothing at all when it is
 * about the node that emitted it — which is every record the existing lessons quote. */
function ofWhom(of: string | undefined): string {
  return of === undefined ? '' : ` of ${of}`
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
    case 'UWB_AOA':
      // The arrow points the way the measurement does: the anchor looked *at* the tag. The
      // truth beside it is where the tag really was — which is how a reader sees a bearing
      // behind the anchor come back mirrored into its field of view.
      return `${r.node} AoA ← ${r.peer}: ${r.thetaDeg.toFixed(1)}° (true ${r.trueThetaDeg.toFixed(1)}°)`
    case 'UWB_TDOA':
      // UL-TDoA: the node printing the line is the reference anchor, and the difference is about
      // a tag that blinked once. Say whose it is, or the line reads as the anchor's own geometry.
      return `${r.node} TDoA${ofWhom(r.of)} ${r.peer} − ${r.ref}: ${r.dtNs.toFixed(2)} ns `
        + `(true ${r.trueDtNs.toFixed(2)} ns)`
    case 'UWB_POSITION': {
      const err = Math.hypot(r.x - r.trueX, r.y - r.trueY)
      // Two-way ranging is the line's unmarked case — it is the only fix the log could print
      // before one-way ranging existed, and the lessons quote it word for word. Any other
      // method names itself, because "4 anchors" means something different in each of them.
      const how = r.method === 'twr' ? '' : ` (${METHOD_SHORT[r.method]})`
      return `${r.node} position${ofWhom(r.of)} (${r.x.toFixed(2)}, ${r.y.toFixed(2)}) m, true (${r.trueX.toFixed(2)}, ${r.trueY.toFixed(2)}), error ${err.toFixed(2)} m, GDOP ${r.gdop.toFixed(2)}, ${r.anchors.length} anchors${how}`
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
    case 'UWB_NB_LBT':
      return `${r.node} NB LBT busy on ch ${r.channel}: ${r.foreignDbm.toFixed(1)} dBm `
        + `≥ ${r.thresholdDbm.toFixed(1)} — skipping the block`
    case 'UWB_MMS_TRAIN':
      // A train nothing was heard of has no received power to print (see NOTHING_HEARD_DBM);
      // the line says so in words rather than quoting the sentinel back at the reader.
      return `${r.node} ${r.kind.toUpperCase()} train ← ${r.peer}: ${r.heard}/${r.fragments} heard`
        + (r.heard > 0
          ? `, ${r.rxDbm.toFixed(1)} dBm + ${r.gainDb.toFixed(1)} dB = margin ${r.marginDb.toFixed(1)} dB`
          : '')
        + ` → ${r.detected ? 'detected' : 'lost'}`
        + (r.ratioPpm !== null ? `, ratio ${r.ratioPpm.toFixed(3)} ppm` : '')
  }
}
