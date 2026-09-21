/**
 * The course structure: four tiers of modules (MAC first, then the PHY
 * underneath, then research), the reading order of lessons, and each
 * lesson's estimated study time. Lessons carry a module index into MODULES;
 * a module with no visible lesson is not shown.
 *
 * See docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md.
 */
import type { Block, L10n, Lesson } from './lessonKit'
import { lessonBudget } from './readability'

/** The radio the tier teaches. Tracks are listed in this order, Wi-Fi first. */
export type Track = 'wifi' | 'uwb'

export const TRACKS: Record<Track, L10n> = {
  wifi: { en: 'Wi-Fi', zh: 'Wi-Fi' },
  uwb: { en: 'UWB ranging', zh: 'UWB 测距' },
}

export interface Tier extends L10n {
  track: Track
}

/**
 * Which of the tiers shown opens a track heading: the first one, and every one that teaches a
 * different radio from the tier above it. Pure, index-aligned with the list it is given — which
 * is the list the course panel actually shows, tiers with no lesson yet having been dropped.
 */
export function trackHeadings(tiers: Tier[]): boolean[] {
  return tiers.map((tier, i) => i === 0 || tiers[i - 1].track !== tier.track)
}

export const TIERS: Tier[] = [
  { track: 'wifi', en: 'Tier 1 · MAC foundations', zh: '第一阶段 · MAC 基础' },
  { track: 'wifi', en: 'Tier 2 · MAC practitioner', zh: '第二阶段 · MAC 实战' },
  { track: 'wifi', en: 'Tier 3 · The PHY underneath', zh: '第三阶段 · 底层 PHY' },
  { track: 'wifi', en: 'Tier 4 · Researcher', zh: '第四阶段 · 研究' },
  { track: 'uwb', en: 'UWB Tier 1 · Ranging foundations', zh: 'UWB 第一阶段 · 测距基础' },
  { track: 'uwb', en: 'UWB Tier 2 · Sessions in the real world', zh: 'UWB 第二阶段 · 真实环境中的会话' },
  { track: 'uwb', en: 'UWB Tier 3 · What comes next: 802.15.4ab', zh: 'UWB 第三阶段 · 下一步：802.15.4ab' },
]

export interface CourseModule {
  tier: number
  title: L10n
}

export const MODULES: CourseModule[] = [
  { tier: 0, title: { en: 'The network and the frame', zh: '网络与帧' } },
  { tier: 0, title: { en: 'Channel access (DCF)', zh: '信道接入（DCF）' } },
  { tier: 1, title: { en: 'QoS and efficiency', zh: 'QoS 与效率' } },
  { tier: 1, title: { en: 'Capacity knobs and rate control', zh: '容量旋钮与速率控制' } },
  { tier: 1, title: { en: 'Link lifecycle, security and power', zh: '链路生命周期、安全与节能' } },
  { tier: 1, title: { en: 'Neighbours and spatial reuse', zh: '邻居网络与空间复用' } },
  { tier: 1, title: { en: 'Scheduled Wi-Fi 6/7', zh: '被调度的 Wi-Fi 6/7' } },
  { tier: 1, title: { en: 'Ambient power IoT (802.11bp)', zh: '环境能量物联网（802.11bp）' } },
  { tier: 1, title: { en: 'Real applications', zh: '真实应用' } },
  { tier: 2, title: { en: 'Signals, modulation and coding', zh: '信号、调制与编码' } },
  { tier: 3, title: { en: 'Wi-Fi 8 and research craft', zh: 'Wi-Fi 8 与研究方法' } },
  { tier: 4, title: { en: 'Time of flight', zh: '飞行时间' } },
  { tier: 4, title: { en: 'Ranging sessions and positioning', zh: '测距会话与定位' } },
  { tier: 5, title: { en: 'Coexistence', zh: '共存' } },
  { tier: 5, title: { en: 'Other ranging modes', zh: '其他测距模式' } },
  { tier: 6, title: { en: 'Narrowband-assisted multi-millisecond UWB', zh: '窄带辅助的多毫秒 UWB' } },
]

/**
 * Reading order by lesson id. LESSONS is the authored lessons sorted by this
 * list; an id listed here with no authored lesson is simply skipped, and an
 * authored lesson missing from the list is an error (see orderLessons).
 */
export const COURSE_ORDER: string[] = [
  // Tier 1 — M1 the network and the frame
  'radio-primer', 'decode-thresholds', 'roles-stack', 'frame-anatomy', 'airtime',
  // Tier 1 — M2 channel access
  'ifs', 'backoff', 'nav', 'hidden', 'anomaly', 'retries-queues', 'bianchi', 'bianchi-vs-sim', 'tier1-project',
  // Tier 2 — M3 QoS and efficiency
  'edca', 'ampdu', 'txop', 'txop-protect',
  // Tier 2 — M4 capacity knobs and rate control
  'width', 'streams', 'rate',
  // Tier 2 — M7 scheduled Wi-Fi 6/7
  'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo',
  // Tier 2 — M8 ambient power IoT
  'amp-intro', 'amp-ppdu', 'amp-slots', 'amp-coexist',
  // Tier 2 — M9 real applications
  'capstone',
  // UWB Tier 1 — M11 time of flight
  'uwb-intro', 'uwb-frame', 'uwb-sstwr', 'uwb-dstwr',
  // UWB Tier 1 — M12 sessions and positioning
  'uwb-blocks', 'uwb-position', 'uwb-geometry',
  // UWB Tier 2 — M13 coexistence
  'uwb-coexist', 'uwb-contention',
  // UWB Tier 2 — M14 other ranging modes
  'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa',
  // UWB Tier 3 — M15 narrowband-assisted multi-millisecond UWB
  'uwb-mms', 'uwb-nba', 'uwb-nba-coexist',
]

/** Lessons in reading order; ids in COURSE_ORDER without an authored lesson are skipped. */
export function orderLessons(authored: Lesson[]): Lesson[] {
  const byId = new Map(authored.map((l) => [l.id, l]))
  for (const l of authored) {
    if (!COURSE_ORDER.includes(l.id)) throw new Error(`lesson "${l.id}" is not in COURSE_ORDER`)
  }
  return COURSE_ORDER.flatMap((id) => byId.get(id) ?? [])
}

/**
 * The pseudo-track a lesson belongs to for the prerequisite and acronym rules.
 * The AMP lessons are a module of the Wi-Fi tiers, but they teach their own
 * radio and are read as their own climb, so they get a track of their own.
 */
export function trackOf(l: Lesson): 'wifi' | 'amp' | 'uwb' {
  return l.module === 7 ? 'amp' : TIERS[MODULES[l.module].tier].track
}

/**
 * Every block a learner reads on the main path, in either lesson shape — the
 * old flat `body`, or the picture and then the numbers. `deeper` is not on the
 * main path and is never included.
 */
export function lessonBlocks(l: Lesson): Block[] {
  return l.body ?? [...(l.picture ?? []), ...(l.numbers ?? [])]
}

/**
 * English words across everything a learner reads on a lesson's main path.
 * `deeper` and `sources` are deliberately absent: the stated minutes are the
 * minutes of the main path, not of the depth behind the collapsed sections.
 *
 * It is `lessonBudget(l).total` — one walk, in `readability.ts`, shared with
 * the section budgets and the contract test. A language-neutral cell and a
 * formula body count one word each: they are read at a glance, not at 150
 * words a minute. A `Term`'s own word counts; the "New words" table is read.
 */
export function lessonWords(l: Lesson): number {
  return lessonBudget(l).total
}

/** Minutes budgeted for one thing to observe in the running simulation. */
export const OBSERVE_MINUTES = 2
/** Minutes budgeted for one experiment the learner runs themselves. */
export const TRY_MINUTES = 4

/**
 * Estimated study time: reading at 150 words a minute, plus time at the
 * simulator for each thing to observe and each experiment, rounded to the
 * nearest 5 minutes (at least 5).
 */
export function lessonMinutes(l: Lesson): number {
  const raw = lessonWords(l) / 150 + OBSERVE_MINUTES * l.observe.length + TRY_MINUTES * l.tryThis.length
  return Math.max(5, Math.round(raw / 5) * 5)
}
