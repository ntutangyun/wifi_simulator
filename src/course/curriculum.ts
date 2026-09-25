/**
 * The course structure: four tiers of modules (MAC first, then the PHY
 * underneath, then research), the reading order of lessons, and each
 * lesson's estimated study time. Lessons carry a module index into MODULES;
 * a module with no visible lesson is not shown.
 *
 * See docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md.
 */
import type { Block, Lesson } from './lessonKit'
import { mainPathChars } from './readability'

/** The radio the tier teaches. Tracks are listed in this order, Wi-Fi first. */
export type Track = 'wifi' | 'uwb'

/**
 * The climb a lesson is read as, for the prerequisite and acronym rules. It is
 * the radio of the lesson's tier, except where a module declares otherwise:
 * the AMP lessons sit in a Wi-Fi tier but teach their own radio.
 */
export type LessonTrack = Track | 'amp'

export const TRACKS: Record<Track, string> = {
  wifi: 'Wi-Fi',
  uwb: 'UWB 测距',
}

export interface Tier {
  track: Track
  /** The tier's own name, as the course panel prints it. */
  label: string
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
  { track: 'wifi', label: '第一阶段 · MAC 基础' },
  { track: 'wifi', label: '第二阶段 · MAC 实战' },
  { track: 'wifi', label: '第三阶段 · 底层 PHY' },
  { track: 'wifi', label: '第四阶段 · 研究' },
  { track: 'uwb', label: 'UWB 第一阶段 · 测距基础' },
  { track: 'uwb', label: 'UWB 第二阶段 · 真实环境中的会话' },
  { track: 'uwb', label: 'UWB 第三阶段 · 下一步：802.15.4ab' },
]

export interface CourseModule {
  tier: number
  title: string
  /**
   * The climb this module's lessons are read as, when that is not the radio of
   * its tier. Only a module that teaches a different radio from the tier it is
   * shown under sets this; everything else inherits, so the two can never
   * disagree by accident. See {@link trackOf}.
   */
  track?: LessonTrack
}

export const MODULES: CourseModule[] = [
  { tier: 0, title: '信号与链路' },
  { tier: 0, title: '一张网里的角色' },
  { tier: 0, title: '帧与空口时间' },
  { tier: 0, title: '等待与退避' },
  { tier: 0, title: '听不见的邻居与损失' },
  { tier: 0, title: '在纸上预测 DCF' },
  { tier: 0, title: '第一阶段项目' },
  { tier: 1, title: 'QoS 与效率' },
  { tier: 1, title: '容量旋钮与速率控制' },
  { tier: 1, title: '被调度的 Wi-Fi 6/7' },
  { tier: 1, title: '环境能量物联网（802.11bp）', track: 'amp' },
  { tier: 1, title: '真实应用' },
  { tier: 4, title: '飞行时间' },
  { tier: 4, title: '两只钟' },
  { tier: 4, title: '会话网格' },
  { tier: 4, title: '定位' },
  { tier: 5, title: '共存' },
  { tier: 5, title: '竞争式测距' },
  { tier: 5, title: '单向测距' },
  { tier: 5, title: '角度' },
  { tier: 6, title: '多毫秒片段' },
  { tier: 6, title: '窄带控制面' },
  { tier: 6, title: '测距综合实践' },
]

/**
 * Reading order by lesson id. LESSONS is the authored lessons sorted by this
 * list; an id listed here with no authored lesson is simply skipped, and an
 * authored lesson missing from the list is an error (see orderLessons).
 */
export const COURSE_ORDER: string[] = [
  // Tier 1 — M1 the network and the frame
  'radio-primer', 'noise-floor', 'decode-thresholds', 'mcs-ladder', 'roles-stack', 'relay-hops', 'frame-anatomy', 'frame-qos-fcs', 'frame-anatomy-bytes', 'small-frames', 'airtime',
  // Tier 1 — M2 channel access
  'ifs', 'cca', 'backoff', 'collisions-cw', 'nav', 'hidden', 'anomaly', 'retries-queues', 'bianchi', 'bianchi-vs-sim', 'tier1-project', 'tier1-project-review',
  // Tier 2 — M3 QoS and efficiency
  'edca', 'ampdu', 'txop', 'txop-protect',
  // Tier 2 — M4 capacity knobs and rate control
  'width', 'streams', 'rate', 'rate-fallback',
  // Tier 2 — M7 scheduled Wi-Fi 6/7
  'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo',
  // Tier 2 — M8 ambient power IoT
  'amp-intro', 'amp-ppdu', 'amp-slots', 'amp-coexist',
  // Tier 2 — M9 real applications
  'capstone',
  // UWB Tier 1 — M11 time of flight
  'uwb-intro', 'uwb-frame', 'uwb-sts', 'uwb-sstwr', 'uwb-dstwr',
  // UWB Tier 1 — M12 sessions and positioning
  'uwb-blocks', 'uwb-position', 'uwb-geometry',
  // UWB Tier 2 — M13 coexistence
  'uwb-coexist', 'uwb-contention',
  // UWB Tier 2 — M14 other ranging modes
  'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa',
  // UWB Tier 3 — M15 narrowband-assisted multi-millisecond UWB
  'uwb-mms', 'uwb-mms-numbers', 'uwb-nba', 'uwb-nba-coexist',
  // UWB Tier 3 — M16 the capstone of the ranging track
  'uwb-capstone',
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
 *
 * The answer comes from the module the lesson names, never from what that
 * module's index happens to be: the module says which climb it is, and only a
 * module whose radio differs from its tier's has to say anything. Reading
 * `l.module === 7` here was a coincidence of ordering, and the first module
 * inserted above the AMP one would have silently handed 'amp' to a DCF lesson.
 */
export function trackOf(l: Lesson): LessonTrack {
  const m = MODULES[l.module]
  return m.track ?? TIERS[m.tier].track
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
 * Chinese characters across everything a learner reads on a lesson's main path:
 * `mainPathChars` in `readability.ts`. `deeper` and `sources` are deliberately
 * absent — the stated minutes are the minutes of the main path, not of the
 * depth behind the collapsed sections.
 *
 * It replaced an English word count, which the Chinese-only codemod of
 * 2026-09-25 left meaningless: `enWords` splits on whitespace, and Chinese
 * carries none, so a whole paragraph counted as one word.
 */
export function lessonChars(l: Lesson): number {
  return mainPathChars(l)
}

/** Minutes budgeted for one thing to observe in the running simulation. */
export const OBSERVE_MINUTES = 2
/** Minutes budgeted for one experiment the learner runs themselves. */
export const TRY_MINUTES = 4

/**
 * Chinese characters a minute, as the reading-time estimate uses them.
 *
 * MEASURED, not guessed. The last bilingual commit (721984e) paced every lesson
 * at 150 English words a minute, and those estimates are the ones the course
 * was written and reviewed against. Counting both halves of that corpus gives
 *
 *     108,518 CJK characters  /  73,870 English words  =  1.469 characters per word
 *
 * across all 51 lessons, so the rate that preserves the pacing is
 * 150 × 1.469 ≈ 220 characters a minute. At 220 the formula reproduces the
 * pre-codemod estimate exactly for 43 of the 51 lessons and lands one 5-minute
 * bucket away for 6 more; the last two are `amp-slots` and `amp-coexist`, which
 * are still in MIGRATING and still mostly English, so they have no Chinese to
 * count yet. Nothing in the course exceeds the 30-minute ceiling at this rate.
 *
 * 220 is below the 300–400 a minute often quoted for casual Chinese prose, and
 * deliberately so: this is dense technical text in which every official term
 * carries a bracketed English name, and the reader stops on figures, tables and
 * arithmetic. The figure to trust is the one the corpus gives, not the one a
 * general reading-speed study gives.
 */
export const CHARS_PER_MINUTE = 220

/**
 * Estimated study time: reading at {@link CHARS_PER_MINUTE}, plus time at the
 * simulator for each thing to observe and each experiment, rounded to the
 * nearest 5 minutes (at least 5).
 *
 * With the word budgets gone this is the course's only length control: a lesson
 * that runs past 30 minutes is a lesson teaching two topics, and the answer is
 * to split it (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md).
 */
export function lessonMinutes(l: Lesson): number {
  const raw = lessonChars(l) / CHARS_PER_MINUTE
    + OBSERVE_MINUTES * l.observe.length + TRY_MINUTES * l.tryThis.length
  return Math.max(5, Math.round(raw / 5) * 5)
}

/** The ceiling the user asked for: a lesson is one sitting. */
export const MAX_MINUTES = 30
