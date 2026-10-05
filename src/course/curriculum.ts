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
  // Renamed from 「第三阶段 · 底层 PHY」 on 2026-10-05, by the user's ruling, on the finding in
  // §15 of docs/wifi-feature-coverage.md: four of the seven lessons that tier was planned to hold
  // are already taught, and they are taught in tier 2 as capacity knobs — width, streams, fading
  // and the guard interval, under M8/M9. **That is the original design's own arrangement and not
  // a tier being raided**: item 7 of its Tier 3 list reads 「➕ Why width and streams work
  // (revisiting M4)」 (docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md:111),
  // so revisiting was always the plan and the first pass was always meant to live earlier. What is
  // genuinely left under this heading is bands and frame-interval fidelity — 2.4 GHz ERP timing,
  // 6 GHz channel numbering, SNR→PER — which is what the label now says. The old label would have
  // become false the moment the first lesson landed here, and a tier heading is printed to a
  // reader (CoursePanel.tsx renders `TIERS[...].label`), though not yet this one: a tier with no
  // module is filtered out of the panel, and this tier still has none.
  { track: 'wifi', label: '第三阶段 · 频段与物理层保真度', basis: ['ieee-802-11'] },
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
  // Many-to-many ranging (standard §10.32.6/§10.32.7). No `basis` of its own: the published
  // revision is exactly what its tier declares, and a module that restates its tier is data that
  // can only drift out of agreement with it (tests/course/basis.test.ts).
  { tier: 5, title: '多对多测距' },
  // RCM validity rounds and the ranging message non-receipt exchange (standard §10.32.9.1 and
  // §10.34). No `basis` of its own for the same reason the module above has none: the published
  // revision is exactly what its tier declares.
  { tier: 5, title: '控制消息的有效期' },
  // Multiple message receipt confirmation (standard §10.36, and the MMRCR request bit of
  // §10.32.9.1). No `basis` of its own for the same reason the two modules above have none: the
  // published revision is exactly what its tier declares.
  { tier: 5, title: '多消息收妥确认' },
  // SP3 grouped ranging (standard §10.32.8) and its SRRR IE (§10.32.9.9). No `basis` of its own
  // for the same reason the three modules above have none: the published revision is exactly what
  // its tier declares, and a module that restates its tier is data that can only drift out of
  // agreement with it (tests/course/basis.test.ts). Inserted here rather than appended so the
  // panel still lists tier 5's modules in COURSE_ORDER's own order; every lesson of the modules
  // below moved up by one index with it.
  { tier: 5, title: 'SP3 分组测距' },
  // Ranging ancillary information (standard §10.35) and its RAICT IE (§10.35.2.1), the Request = 0
  // half. No `basis` of its own for the same reason the four modules above have none: the published
  // revision is exactly what its tier declares, and a module that restates its tier is data that
  // can only drift out of agreement with it (tests/course/basis.test.ts). Inserted here rather than
  // appended so the panel still lists tier 5's modules in COURSE_ORDER's own order; every lesson of
  // the modules below moved up by one index with it.
  { tier: 5, title: '测距辅助信息' },
  { tier: 5, title: '单向测距' },
  { tier: 5, title: '角度' },
  // Sensing sits in Tier 2 and not in the draft tier on purpose. What the two lessons under it
  // teach is echo geometry plus one published figure — the 499.2 Mchip/s chip of
  // IEEE Std 802.15.4-2024 §16.2.4 — and nothing that moves between 4ab drafts. Declaring the
  // draft here would tell a reader that a length they can derive from the chip rate might change
  // under them.
  { tier: 5, title: '感知' },
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
 *
 * The `// M<n> · tier <t> · <title>` line before each group is MEASURED, not
 * narrated: `n` is the `module` index every lesson under it carries, `t` and
 * `title` are `MODULES[n]`, and `tests/course/lessons.test.ts` parses these very
 * lines out of this file and checks all three against the lessons — the suite
 * named 「COURSE_ORDER’s grouping comments are measured, not narrated」. Until
 * 2026-10-04 they were a stale, coarser scheme nobody had re-measured: the
 * Wi-Fi groups were numbered from 1 where `module` counts from 0 and merged
 * modules that had since split, the UWB track opened at «M11» where it really
 * opens at M12, `uwb-m2m` was labelled «M18» by accident of being right, and
 * «M20» appeared twice — on `uwb-receipt`, which is M20, and on `uwb-sensing`,
 * which is M25. A grouping comment nobody can check is a grouping comment that
 * misleads the next reader, so this one is checkable.
 */
export const COURSE_ORDER: string[] = [
  // M0 · tier 0 · 信号与链路
  'radio-primer', 'noise-floor', 'decode-thresholds', 'mcs-ladder',
  // M1 · tier 0 · 一张网里的角色
  'roles-stack', 'relay-hops',
  // M2 · tier 0 · 帧与空口时间
  'frame-anatomy', 'frame-qos-fcs', 'frame-anatomy-bytes', 'small-frames', 'airtime',
  // M3 · tier 0 · 等待与退避
  'ifs', 'cca', 'backoff', 'collisions-cw', 'nav',
  // M4 · tier 0 · 听不见的邻居与损失
  'hidden', 'rts-cts', 'anomaly', 'retries-queues', 'queues',
  // M5 · tier 0 · 在纸上预测 DCF
  'bianchi', 'bianchi-vs-sim', 'rate-vs-model',
  // M6 · tier 0 · 第一阶段项目
  'tier1-project', 'tier1-project-review',
  // M7 · tier 1 · QoS 与效率
  'edca', 'edca-cost', 'ampdu', 'txop', 'txop-protect', 'protect-policies', 'edca-tamper',
  // M8 · tier 1 · 容量旋钮与速率控制
  'width', 'selectivity', 'streams', 'rate', 'rate-fallback', 'rate-cost', 'fading',
  // M9 · tier 1 · 被调度的 Wi-Fi 6/7
  'ofdma-dl', 'ru-diversity', 'ofdma-ul', 'mumimo', 'mumimo-choose', 'mlo', 'mlo-gain',
  // M10 · tier 1 · 环境能量物联网（802.11bp）
  'amp-intro', 'amp-ppdu', 'amp-slots', 'amp-coexist', 'amp-backscatter',
  // M11 · tier 1 · 真实应用
  'wan-rtt', 'capstone',
  // M12 · tier 4 · 飞行时间
  'uwb-intro', 'uwb-frame', 'uwb-sts',
  // M13 · tier 4 · 两只钟
  'uwb-sstwr', 'uwb-dstwr', 'uwb-reply-time', 'uwb-deferred-ds',
  // M14 · tier 4 · 会话网格
  'uwb-blocks', 'uwb-slot-budget',
  // M15 · tier 4 · 定位
  'uwb-position', 'uwb-geometry',
  // M16 · tier 5 · 共存
  'uwb-coexist',
  // M17 · tier 5 · 竞争式测距
  'uwb-contention',
  // M18 · tier 5 · 多对多测距
  //    one transmission that is both halves of an exchange
  'uwb-m2m',
  // M19 · tier 5 · 控制消息的有效期
  //    one control message for several rounds, and the frame that takes the place of
  //    silence when this round’s initiation message never arrived
  'uwb-rcm-validity',
  // M20 · tier 5 · 多消息收妥确认
  //    the one frame that tells a device who heard it, and the request bit that costs
  //    nothing to ask with
  'uwb-receipt',
  // M21 · tier 5 · SP3 分组测距
  //    the shortest ranging frame the standard has, and the round it does not make the
  //    shortest: something has to announce the slot table, and an SP3 packet announces nothing
  'uwb-sp3',
  // M22 · tier 5 · 测距辅助信息
  //    one message that does not fit in one frame: the count every frame carries, so the
  //    receiver learns of a gap at the next arrival instead of at a deadline
  'uwb-ancillary',
  //    …and the other half of the same clause, in the same module: the Request bit, where a
  //    ranging RESPONDER asks the controller for the next exchange's slots and the granted count
  //    is the next message's frame count. The first lesson of the course in which the slot grid is
  //    not settled before the session starts.
  'uwb-ancillary-request',
  // M23 · tier 5 · 单向测距
  'uwb-dl-tdoa', 'uwb-ul-tdoa',
  // M24 · tier 5 · 角度
  'uwb-aoa',
  // M25 · tier 5 · 感知
  //    the things in the room that never answer
  'uwb-sensing', 'uwb-sensing-resolution',
  // M26 · tier 6 · 多毫秒片段
  'uwb-mms', 'uwb-mms-numbers',
  // M27 · tier 6 · 窄带控制面
  'uwb-nba', 'uwb-nba-coexist', 'uwb-ssbd',
  // M28 · tier 6 · 另一种控制面与子轮
  'uwb-uwbd', 'uwb-acquisition', 'uwb-subrounds',
  // M29 · tier 6 · 测距综合实践
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
 * Every lesson a reader has been told to read before this one: `needs`, closed
 * transitively, and never the lesson itself.
 *
 * This is the "destination" the reach rule of 2026-10-05 needs. A jump label or
 * a variant label is only ever rendered inside the lesson that owns it
 * (`CoursePanel.tsx:364`, `:490`, `:503`), so a term on one of them may lean on
 * any lesson in this set: to see the string at all the reader has to have
 * opened the lesson, and opening it puts its prerequisite chain on the screen.
 * `title` may not lean on it — a title is printed in the contents list, on
 * another lesson's `needs` button and beside another lesson's `limits`, where
 * none of that holds.
 *
 * Two sizes are worth knowing, because they are the rule's edges and both are
 * pinned in `tests/course/lessons.test.ts`: `radio-primer` closes to the
 * EMPTY set — it is the first lesson of the course and the only one with no
 * prerequisites at all, so a term on one of its labels has nothing behind it
 * anywhere — and the largest closure in the course is `capstone` at 38.
 *
 * It takes the lesson list rather than importing it, because `src/course/lessons`
 * imports this module. Cycles are impossible by the contract (every `needs`
 * entry precedes its lesson in `COURSE_ORDER`, asserted in the contract suite),
 * and the `seen` set makes this terminate even if one appeared.
 */
export function needsClosure(id: string, lessons: Lesson[]): Set<string> {
  const byId = new Map(lessons.map((l) => [l.id, l]))
  const seen = new Set<string>()
  const stack = [...(byId.get(id)?.needs ?? [])]
  while (stack.length) {
    const next = stack.pop()!
    if (seen.has(next)) continue
    seen.add(next)
    stack.push(...(byId.get(next)?.needs ?? []))
  }
  return seen
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
  '15-22/0486r5': 'SSBD 的算法、属性表，以及附录里那两个延迟上界的例子',
  '15-24/0010r36': '把 SSBD 整节移入第 10 章的那一次获通过的编辑',
  '15-24/0121r2': 'CID 489/493（退避改抽一倍退避因子、取值范围放宽到 1…63）与 CID 490/495（删去 SSBD 自己的感知时长属性，改用物理层属性）',
  '15-25/0486r1': '§10.39.8.3 先听后发的适用范围：哪些条款、哪些窄带信道、哪两段频率上的发射',
  '15-25/0307r1': 'ETSI EN 303 687 对这一类设备的符合性推定被欧盟 2025/893 号决定撤销',
  '15-26/0179r1': 'Annex E 的 PICS 插入项：MLF9.45 把 SSBD 记在 §10.45 名下，状态为可选',
  '15-26/0244r1': 'D04 的评审决议表：十三条要把先听后发改成强制的意见，以及要求能量检测门限与最短感知时长的意见，全部被否决',
  '15-26/0365r0': '频率域延后的提案正文（新增 §10.47 与它的能力位），答复的是一条已被否决的 D04 意见',
  // P802.11bp (TGbp), the ambient-power draft
  '11-24/1613r20': 'TGbp 规范框架',
  '11-26/1519r5': '触发过程与 AMP PPDU 格式',
  '11-26/1889r4': '上行信道接入与时隙规则',
  // P802.11bp, the backscatter tier: five contributions the group discussed without the
  // framework adopting their values, so every number off them is tagged as such in the prose
  '11-23/2038r1': '反向散射回程的 6 dB 反射损耗',
  '11-24/0537r0': '标签的 −20 dBm 上电门限，以及反射损耗的另一处取值',
  '11-25/0058r1': '单站读写器的 20 dB 天线隔离与 50 dB 接收动态范围',
  '11-25/0061r0': '反向散射清点轮：单一下行速率、一轮跨多次传输机会的「延续」',
  '11-25/0307r0': '两档激励功率 PEX_C（充电）与 PEX_B（回应）',
  '11-26/0120r0': 'T2 转向时间，以及 Write 的 T3 ≥ 2 ms',
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
 * bucket away for 6 more; the last two were `amp-slots` and `amp-coexist`,
 * which at the time this constant was measured were still in MIGRATING and
 * still mostly English, so they had no Chinese to count yet. Both were
 * migrated to the new shape 2026-10-02 and are now measured at 220 like every
 * other lesson. Nothing in the course exceeds the 30-minute ceiling at this rate.
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
