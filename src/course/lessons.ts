/**
 * Wi-Fi MAC course: one lesson a file, each with a deterministic preset
 * scenario, jump-to targets over the recorded timeline, an observation
 * checklist, experiments and a self-check quiz.
 *
 * Content is MAC-focused: channel access (DCF), NAV, EDCA, aggregation,
 * TXOP, OFDMA scheduling and MLO. PHY appears only as far as the MAC
 * needs it (frames cost airtime; rate depends on link quality).
 *
 * Every lesson is defined in its own file (tier1/, tier2/, amp/, uwb/); this
 * file is only the assembly — imports plus the LESSONS array, in reading
 * order (see curriculum.ts).
 */
import type { Lesson } from './lessonKit'
import { orderLessons } from './curriculum'
import { radioPrimer } from './tier1/radio-primer'
import { noiseFloor } from './tier1/noise-floor'
import { decodeThresholds } from './tier1/decode-thresholds'
import { mcsLadder } from './tier1/mcs-ladder'
import { rolesStack } from './tier1/roles-stack'
import { relayHops } from './tier1/relay-hops'
import { frameAnatomy } from './tier1/frame-anatomy'
import { frameQosFcs } from './tier1/frame-qos-fcs'
import { frameAnatomyBytes } from './tier1/frame-anatomy-bytes'
import { smallFrames } from './tier1/small-frames'
import { retriesQueues } from './tier1/retries-queues'
import { queues } from './tier1/queues'
import { bianchi } from './tier1/bianchi'
import { bianchiVsSim } from './tier1/bianchi-vs-sim'
import { rateVsModel } from './tier1/rate-vs-model'
import { tier1Project } from './tier1/tier1-project'
import { tier1ProjectReview } from './tier1/tier1-project-review'
import { ampIntro } from './amp/amp-intro'
import { ampPpdu } from './amp/amp-ppdu'
import { ampSlots } from './amp/amp-slots'
import { ampCoexist } from './amp/amp-coexist'
import { uwbIntro } from './uwb/uwb-intro'
import { uwbFrame } from './uwb/uwb-frame'
import { uwbSts } from './uwb/uwb-sts'
import { uwbSstwr } from './uwb/uwb-sstwr'
import { uwbDstwr } from './uwb/uwb-dstwr'
import { uwbBlocks } from './uwb/uwb-blocks'
import { uwbSlotBudget } from './uwb/uwb-slot-budget'
import { uwbPosition } from './uwb/uwb-position'
import { uwbGeometry } from './uwb/uwb-geometry'
import { uwbCoexist } from './uwb/uwb-coexist'
import { uwbContention } from './uwb/uwb-contention'
import { uwbDlTdoa } from './uwb/uwb-dl-tdoa'
import { uwbUlTdoa } from './uwb/uwb-ul-tdoa'
import { uwbAoa } from './uwb/uwb-aoa'
import { uwbMms } from './uwb/uwb-mms'
import { uwbMmsNumbers } from './uwb/uwb-mms-numbers'
import { uwbNba } from './uwb/uwb-nba'
import { uwbNbaCoexist } from './uwb/uwb-nba-coexist'
import { uwbCapstone } from './uwb/uwb-capstone'
import { airtime } from './tier1/airtime'
import { ifs } from './tier1/ifs'
import { cca } from './tier1/cca'
import { backoff } from './tier1/backoff'
import { collisionsCw } from './tier1/collisions-cw'
import { nav } from './tier1/nav'
import { hidden } from './tier1/hidden'
import { rtsCts } from './tier1/rts-cts'
import { anomaly } from './tier1/anomaly'
import { edca } from './tier2/edca'
import { edcaCost } from './tier2/edca-cost'
import { ampdu } from './tier2/ampdu'
import { txop } from './tier2/txop'
import { txopProtect } from './tier2/txop-protect'
import { protectPolicies } from './tier2/protect-policies'
import { ofdmaDl } from './tier2/ofdma-dl'
import { ofdmaUl } from './tier2/ofdma-ul'
import { mlo } from './tier2/mlo'
import { mloGain } from './tier2/mlo-gain'
import { capstone } from './tier2/capstone'
import { width } from './tier2/width'
import { streams } from './tier2/streams'
import { mumimo } from './tier2/mumimo'
import { mumimoChoose } from './tier2/mumimo-choose'
import { rate } from './tier2/rate'
import { rateFallback } from './tier2/rate-fallback'
import { rateCost } from './tier2/rate-cost'
export type { Block, JumpTarget, Lesson, LessonVariant, Quiz, Term } from './lessonKit'
export { isMigrated } from './lessonKit'

export { MODULES, TIERS } from './curriculum'

// ---------------------------------------------------------------------------
// lessons
// ---------------------------------------------------------------------------

const AUTHORED: Lesson[] = [
  radioPrimer,
  noiseFloor,
  decodeThresholds,
  mcsLadder,
  rolesStack,
  relayHops,
  frameAnatomy,
  frameQosFcs,
  frameAnatomyBytes,
  smallFrames,
  retriesQueues,
  queues,
  bianchi,
  bianchiVsSim,
  rateVsModel,
  tier1Project,
  tier1ProjectReview,
  ampIntro,
  ampPpdu,
  ampSlots,
  ampCoexist,
  uwbIntro,
  uwbFrame,
  uwbSts,
  uwbSstwr,
  uwbDstwr,
  uwbBlocks,
  uwbSlotBudget,
  uwbPosition,
  uwbGeometry,
  uwbCoexist,
  uwbContention,
  uwbDlTdoa,
  uwbUlTdoa,
  uwbAoa,
  uwbMms,
  uwbMmsNumbers,
  uwbNba,
  uwbNbaCoexist,
  uwbCapstone,
  // ======================= MODULE 1 =======================
  airtime,
  ifs,
  cca,
  backoff,
  collisionsCw,
  nav,
  hidden,
  rtsCts,
  anomaly,

  // ======================= MODULE 2 =======================
  edca,
  edcaCost,
  ampdu,
  txop,
  txopProtect,
  protectPolicies,

  // ======================= MODULE 3 =======================
  ofdmaDl,
  ofdmaUl,
  mlo,
  mloGain,
  capstone,

  // ======================= MODULE 4 =======================
  width,
  streams,
  mumimo,
  mumimoChoose,
  rate,
  rateFallback,
  rateCost,
]

/** Every course lesson, in reading order (see curriculum.ts). */
export const LESSONS: Lesson[] = orderLessons(AUTHORED)

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((l) => l.id === id)
}
