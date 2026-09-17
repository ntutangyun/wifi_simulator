/**
 * The course structure: four tiers of modules (MAC first, then the PHY
 * underneath, then research), the reading order of lessons, and each
 * lesson's estimated study time. Lessons carry a module index into MODULES;
 * a module with no visible lesson is not shown.
 *
 * See docs/superpowers/specs/2026-09-18-zero-to-hero-curriculum-design.md.
 */
import type { L10n, Lesson } from './lessonKit'

export const TIERS: L10n[] = [
  { en: 'Tier 1 · MAC foundations', zh: '第一阶段 · MAC 基础' },
  { en: 'Tier 2 · MAC practitioner', zh: '第二阶段 · MAC 实战' },
  { en: 'Tier 3 · The PHY underneath', zh: '第三阶段 · 底层 PHY' },
  { en: 'Tier 4 · Researcher', zh: '第四阶段 · 研究' },
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
  { tier: 1, title: { en: 'Real applications', zh: '真实应用' } },
  { tier: 2, title: { en: 'Signals, modulation and coding', zh: '信号、调制与编码' } },
  { tier: 3, title: { en: 'Wi-Fi 8 and research craft', zh: 'Wi-Fi 8 与研究方法' } },
]

/**
 * Reading order by lesson id. A lesson not listed here is not part of the
 * course yet; LESSONS contains exactly the listed lessons, in this order.
 */
export const COURSE_ORDER: string[] = [
  // Tier 1 — M1 the network and the frame
  'radio-primer', 'decode-thresholds', 'roles-stack', 'frame-anatomy', 'airtime',
  // Tier 1 — M2 channel access
  'ifs', 'backoff', 'nav', 'hidden', 'anomaly', 'retries-queues', 'bianchi', 'tier1-project',
  // Tier 2 — M3 QoS and efficiency
  'edca', 'ampdu', 'txop', 'txop-protect',
  // Tier 2 — M4 capacity knobs and rate control
  'width', 'streams', 'rate',
  // Tier 2 — M7 scheduled Wi-Fi 6/7
  'ofdma-dl', 'ofdma-ul', 'mumimo', 'mlo',
  // Tier 2 — M8 real applications
  'capstone',
]

/** Lessons in reading order; ids in COURSE_ORDER without an authored lesson are skipped. */
export function orderLessons(authored: Lesson[]): Lesson[] {
  const byId = new Map(authored.map((l) => [l.id, l]))
  for (const l of authored) {
    if (!COURSE_ORDER.includes(l.id)) throw new Error(`lesson "${l.id}" is not in COURSE_ORDER`)
  }
  return COURSE_ORDER.flatMap((id) => byId.get(id) ?? [])
}

/** English words across everything a learner reads in a lesson. */
export function lessonWords(l: Lesson): number {
  const strings: string[] = []
  const walk = (x: unknown): void => {
    if (x == null || typeof x === 'function') return
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (typeof x === 'object') {
      const o = x as Record<string, unknown>
      if (typeof o.en === 'string' && typeof o.zh === 'string') { strings.push(o.en); return }
      for (const [k, v] of Object.entries(o)) if (k !== 'scenario' && k !== 'find') walk(v)
    }
  }
  walk({ body: l.body, observe: l.observe, tryThis: l.tryThis, quiz: l.quiz })
  return strings.join(' ').split(/\s+/).filter(Boolean).length
}

/**
 * Estimated study time: reading at 150 words a minute, plus 5 minutes for
 * each thing to observe in the simulation and each experiment to try,
 * rounded to the nearest 5 minutes (at least 5).
 */
export function lessonMinutes(l: Lesson): number {
  const raw = lessonWords(l) / 150 + 5 * l.observe.length + 5 * l.tryThis.length
  return Math.max(5, Math.round(raw / 5) * 5)
}
