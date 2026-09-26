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

/**
 * The document a module's numbers are checked against — and, just as important,
 * whether that document can still change under the reader's feet. A lesson that
 * teaches a published standard makes a different promise from one that teaches
 * an unratified draft, and the course panel says which out loud rather than
 * leaving it buried in each lesson's sources.
 */
export type StandardBasis = 'ieee-802-11' | 'ieee-802-15-4-2024' | 'p802-15-4ab' | 'p802-11bp'

export interface BasisNote {
  /** The document, as the panel names it. */
  label: string
  /** Where the document stands, one short phrase. */
  status: string
  /**
   * True when the text taught here is not ratified: the numbers are read off
   * public contributions, the clause numbers move between drafts, and the
   * balloted version may differ. See
   * docs/superpowers/specs/2026-09-26-uwb-standard-basis.md.
   */
  draft: boolean
}

export const BASES: Record<StandardBasis, BasisNote> = {
  'ieee-802-11': { label: 'IEEE Std 802.11', status: '已发布', draft: false },
  'ieee-802-15-4-2024': { label: 'IEEE Std 802.15.4-2024', status: '已发布，含 802.15.4z', draft: false },
  'p802-15-4ab': { label: 'P802.15.4ab', status: '草案，SA 投票复审中', draft: true },
  'p802-11bp': { label: 'P802.11bp', status: '草案', draft: true },
}

export const TRACKS: Record<Track, string> = {
  wifi: 'Wi-Fi',
  uwb: 'UWB 测距',
}

export interface Tier {
  track: Track
  /** The tier's own name, as the course panel prints it. */
  label: string
  /**
   * The documents this tier's lessons are checked against, unless a module says
   * otherwise. A list, not one value: a capstone legitimately draws on both a
   * published standard and a draft, and saying so is more honest than picking
   * the more flattering of the two. See {@link basisOf}.
   */
  basis: StandardBasis[]
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
  { track: 'wifi', label: '第一阶段 · MAC 基础', basis: ['ieee-802-11'] },
  { track: 'wifi', label: '第二阶段 · MAC 实战', basis: ['ieee-802-11'] },
  { track: 'wifi', label: '第三阶段 · 底层 PHY', basis: ['ieee-802-11'] },
  { track: 'wifi', label: '第四阶段 · 研究', basis: ['ieee-802-11'] },
  { track: 'uwb', label: 'UWB 第一阶段 · 测距基础', basis: ['ieee-802-15-4-2024'] },
  { track: 'uwb', label: 'UWB 第二阶段 · 真实环境中的会话', basis: ['ieee-802-15-4-2024'] },
  { track: 'uwb', label: 'UWB 第三阶段 · 下一步的草案', basis: ['ieee-802-15-4-2024', 'p802-15-4ab'] },
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
  /**
   * The documents this module's lessons are checked against, when they are not
   * the tier's. Only a module that departs from its tier says anything, so the
   * two can never disagree by accident — the same shape as {@link track}.
   */
  basis?: StandardBasis[]
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
  { tier: 1, title: '环境能量物联网（802.11bp）', track: 'amp', basis: ['p802-11bp'] },
  { tier: 1, title: '真实应用' },
  { tier: 4, title: '飞行时间' },
  { tier: 4, title: '两只钟' },
  { tier: 4, title: '会话网格' },
  { tier: 4, title: '定位' },
  // The only module where both radios are in the room: it reads a UWB round
  // against a Wi-Fi transmitter, so it is checked against both standards.
  { tier: 5, title: '共存', basis: ['ieee-802-15-4-2024', 'ieee-802-11'] },
  { tier: 5, title: '竞争式测距' },
  { tier: 5, title: '单向测距' },
  { tier: 5, title: '角度' },
  { tier: 6, title: '多毫秒片段' },
  { tier: 6, title: '窄带控制面' },
  // The three lessons on the draft's other control planes do not belong under
  // 「窄带控制面」: one of them is about doing without the narrowband radio
  // altogether. The mode itself was renamed away from 「窄带辅助」 for the same
  // reason — leaving the module name behind would be the same untruth one level
  // down. See docs/superpowers/specs/2026-09-26-mms-draft-features-design.md.
  { tier: 6, title: '另一种控制面与子轮' },
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
  'ifs', 'cca', 'backoff', 'collisions-cw', 'nav', 'hidden', 'rts-cts', 'anomaly', 'retries-queues', 'queues', 'bianchi', 'bianchi-vs-sim', 'rate-vs-model', 'tier1-project', 'tier1-project-review',
  // Tier 2 — M3 QoS and efficiency
  'edca', 'edca-cost', 'ampdu', 'txop', 'txop-protect', 'protect-policies',
  // Tier 2 — M4 capacity knobs and rate control
  'width', 'streams', 'rate', 'rate-fallback', 'rate-cost',
  // Tier 2 — M7 scheduled Wi-Fi 6/7
  'ofdma-dl', 'ofdma-ul', 'mumimo', 'mumimo-choose', 'mlo', 'mlo-gain',
  // Tier 2 — M8 ambient power IoT
  'amp-intro', 'amp-ppdu', 'amp-slots', 'amp-coexist',
  // Tier 2 — M9 real applications
  'capstone',
  // UWB Tier 1 — M11 time of flight
  'uwb-intro', 'uwb-frame', 'uwb-sts', 'uwb-sstwr', 'uwb-dstwr',
  // UWB Tier 1 — M12 sessions and positioning
  'uwb-blocks', 'uwb-slot-budget', 'uwb-position', 'uwb-geometry',
  // UWB Tier 2 — M13 coexistence
  'uwb-coexist', 'uwb-contention',
  // UWB Tier 2 — M14 other ranging modes
  'uwb-dl-tdoa', 'uwb-ul-tdoa', 'uwb-aoa',
  // UWB Tier 3 — M15 narrowband-assisted multi-millisecond UWB
  'uwb-mms', 'uwb-mms-numbers', 'uwb-nba', 'uwb-nba-coexist',
  'uwb-uwbd', 'uwb-acquisition', 'uwb-subrounds',
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
 * The documents a module's lessons are checked against: the module's own list
 * when it declares one, otherwise its tier's. Takes an index into MODULES, not
 * a lesson, because the panel asks the question of a section heading before it
 * has a lesson in hand.
 */
export function basisOf(mi: number): StandardBasis[] {
  const m = MODULES[mi]
  return m.basis ?? TIERS[m.tier].basis
}

/** True when any document a module is checked against is still a draft. */
export function teachesDraft(mi: number): boolean {
  return basisOf(mi).some((b) => BASES[b].draft)
}

/**
 * Which documents a lesson's `sources` actually cite, read off the prose.
 *
 * This is the probe behind the consistency rule in tests/course/basis.test.ts:
 * a module declares what it is checked against, and the lessons under it must
 * cite exactly that set — no draft number smuggled into a published-standard
 * lesson, and no declared document that no lesson actually uses. The recurring
 * defect in this repository is stated-versus-actual drift; provenance drifts
 * the same way prose does.
 *
 * Order matters, and each probe strips what it matched: `802.11bp` contains
 * `802.11`, and `802.15.4-2024` contains neither but sits beside contribution
 * numbers that do, so a longer name is matched and removed before a shorter one
 * that is a prefix of it is looked for.
 */
/**
 * Every TG4ab contribution this course models, and what each one provides.
 *
 * A draft lesson's honesty rests on naming the document behind each number, and
 * a bare `15-22/0381r5` tells a reader nothing. The registry turns the number
 * into a sentence and, just as usefully, gives the tests something to check a
 * citation against: a mistyped revision is otherwise indistinguishable from a
 * real one, and it would send anyone trying to verify a number to a document
 * that does not exist.
 *
 * Keys are the mentor document number without the group suffix, exactly as the
 * lessons write it. See docs/superpowers/specs/2026-09-26-uwb-standard-basis.md.
 */
export const CONTRIBUTIONS: Record<string, string> = {
  // P802.15.4ab (TG4ab), the UWB draft
  '15-22/0205r0': '每毫秒的能量预算，以及片段为何存在',
  '15-22/0381r5': '成对测距周期、阶段划分、时隙/轮/块默认值、先听后发与窄带信道表',
  '15-23/0100r2': 'RSF/RIF/MMRS 的定义、N_MSR 取值、片段间隔与窄带物理层配置',
  '15-23/0502r3': '必选操作参数集（提案为 16.2.11.4）',
  '15-25/0066r1': 'RSF 带 SFD 的 PIB 属性 phyUwbMmsRsfSfd 及其适用条件，以及片段长度字段的改名',
  '15-25/0194r0': '两套控制面配置、SP0 与包首 SYNC+SFD 的捕获对比、零长度控制阶段',
  '15-25/0224r2': '固定回复时间的两个 PIB 属性与它的 300…612000 RSTU 取值范围',
  '15-25/0292r1': '非交织子轮的结构（提案为 §10.39.7）',
  '15-25/0331r1': '非交织形态下的控制阶段，以及一条已撤回的反对意见给出的代价',
  '15-25/0556r2': '反序的 MMS 轮次，以及把回复时间从报告里省掉',
  // P802.11bp (TGbp), the ambient-power draft
  '11-24/1613r20': 'TGbp 规范框架',
  '11-26/1519r5': '触发过程与 AMP PPDU 格式',
  '11-26/1889r4': '上行信道接入与时隙规则',
}

/**
 * The TG4ab contributions a lesson's `sources` name, deduplicated and sorted.
 *
 * A lesson may rest on several and usually does — the four MMS documents split
 * by layer, not by lesson — so this is a list and the panel prints all of it.
 */
export function citedDocs(l: Lesson): string[] {
  // Both drafts' numbering: 15-YY/NNNNrR for TG4ab, 11-YY/NNNNrR for TGbp.
  const ids = (l.sources ?? []).join('\n').match(/1[15]-2\d\/\d{4}r\d+/g) ?? []
  return [...new Set(ids)].sort()
}

export function citedBases(l: Lesson): StandardBasis[] {
  let text = (l.sources ?? []).join('\n')
  const found = new Set<StandardBasis>()
  const probes: [StandardBasis, RegExp][] = [
    ['p802-11bp', /802\.11bp/g],
    ['p802-15-4ab', /802\.15\.4ab|15-2\d\/\d{4}r\d+/g],
    ['ieee-802-15-4-2024', /802\.15\.4-2024/g],
    ['ieee-802-11', /802\.11/g],
  ]
  for (const [basis, re] of probes) {
    if (new RegExp(re.source).test(text)) found.add(basis)
    text = text.replace(re, '')
  }
  return [...found]
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
