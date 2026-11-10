/**
 * UWB Tier 3 · M15 · The other control plane · Lose the leading fragment and the whole round is
 * gone — with or without SP0 control frames in front of the packet.
 *
 * Standard-first shape. ① the standard's SHR (§16.2.6), the draft's UWB-driven MMS packet (it opens
 * with a SYNC+SFD fragment, 15-25/0194r0, 15-25/0066r1), the problem statement of 15-25/0066r1, and
 * the fate of its RSF-with-SFD proposal: CID 963 was withdrawn by its commenter (15-25/0082r8), so it
 * is not in the draft; ② how this simulator implements acquisition (one fragment, no combining — the
 * standard is silent) on both UWB-driven control phases (2026-11-11, W5: audit #18 fixed — the SP0
 * path used to skip the judgement, and the withdrawn attribute is gone); ③ three guided runs.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-acquisition.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import type { TimingSpec } from '../diagram'
import { rsfNs } from '../../uwb/mms'
import {
  J, LESSON_6G_WIDTH_MHZ, anchor, firstUwbRsf, firstUwbTrain, firstUwbTrainLost, node, oneRoom,
  uwbSc, uwbTag, wifi6g, type Lesson,
} from '../lessonKit'

/** Which scene the lesson runs. */
export type UwbAcquisitionVariant = 'base' | 'sp0' | 'nba' | 'clear'

/** 6 GHz channel 71: 6265–6345 MHz, wholly inside UWB channel 5's 6240.0–6739.2 MHz. */
export const ACQ_6G_CENTER_MHZ = 6305
/** 6 GHz channel 7, the engine's own default: clear of every UWB band. */
export const ACQ_CLEAR_6G_MHZ = 5985

/** The RSF fragment length this lesson runs at: 64 at the session's own gap of 64 zeros is
 * 131.282 µs. 4ab draft 15-23/0100r2 §2.3.2 */
export const ACQ_N_MSR = 64 as const

/** Config 1 carries no narrowband settings: there is no radio for them. 4ab draft 15-25/0194r0 */
const UWBD = { control: 'uwbd', uwbdControl: 'none', nbChannels: [] as number[], nbLbt: 'off' } as const
/** Config 1 with an SP0 control phase. 4ab draft 15-25/0194r0 */
const UWBD_SP0 = { ...UWBD, uwbdControl: 'sp0' } as const

/** The first fragment a receiver lost to Wi-Fi power in its own band. */
export const firstAcqInterfered = (r: TLRecord): boolean => r.type === 'UWB_INTERFERED'

/**
 * One anchor and one tag 9 m apart across an empty 10 × 8 m room, on the draft's 600 RSTU slot, and
 * a Wi-Fi 7 router with a video client **beside the anchor** — 6 GHz channel 71, wholly inside UWB
 * channel 5.
 *
 * The router's corner is the whole design. Interference lands on the anchor, where the tag's
 * fragments arrive, and is 9 m away from the tag, where the anchor's REPORT arrives — so the round
 * still has a way to deliver a time once the anchor manages to open the packet at all.
 *
 * `'sp0'` keeps Config 1 but gives it an SP0 control phase — the packet still opens with its
 * SYNC+SFD fragment, so losing it still loses the round (audit #18); `'clear'` moves the Wi-Fi
 * channel 320 MHz down, out of the UWB band; `'nba'` puts the same room on the narrowband control
 * plane, whose channel is in UNII-3 and whose receiver was never asked to acquire anything.
 */
export function uwbAcquisitionScenario(variant: UwbAcquisitionVariant = 'base'): Scenario {
  const ap = node('ap', 'Router', 'ap', 1, 1, 'eht', 'idle', { edca: true, txop: true, ampdu: true }, 2.0)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', 1.5, 6.5, 'video')
  const mms = variant === 'nba'
    ? { nMsr: ACQ_N_MSR, nbChannels: [3] }
    : { ...(variant === 'sp0' ? UWBD_SP0 : UWBD), nMsr: ACQ_N_MSR }
  return uwbSc(
    oneRoom(),
    [ap, laptop, anchor('anchor-1', 'Anchor 1', 0.5, 4, 1.0), uwbTag('tag-1', 'Tag', 9.5, 4, 1.0)],
    {
      mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false, channel: 5,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...mms },
    },
    { sixGhzCenterMhz: variant === 'clear' ? ACQ_CLEAR_6G_MHZ : ACQ_6G_CENTER_MHZ },
  )
}

/**
 * Which fragments of the tag's column reached the anchor in the round of block 1 — indices 4, 5
 * and 7, the other five lost to the router (2026-11-11: re-measured after W6 moved the Wi-Fi
 * timing and band) — and what each of the two settings does with that column. The indices are
 * read off the run and pinned in the test, so the figure cannot drift from it.
 */
export const ACQ_HEARD: readonly number[] = [4, 5, 7]

/** The same column of fragments: what arrived, and the one fragment acquisition looks at. */
export function uwbAcquisitionTiming(): TimingSpec {
  const fragUs = rsfNs(ACQ_N_MSR, DEFAULT_UWB_SESSION.mms.gap) / 1000
  const span = (i: number, tone?: 'plain' | 'accent' | 'muted') =>
    ({ fromUs: i * 1000, toUs: i * 1000 + fragUs, tone })
  const all = [0, 1, 2, 3, 4, 5, 6, 7]
  return {
    kind: 'timing',
    lanes: [
      { label: '到达', spans: all.map((i) => span(i, ACQ_HEARD.includes(i) ? 'plain' : 'muted')) },
      { label: '捕获', spans: [{ ...span(0, 'muted'), label: '只看这一个' }] },
    ],
    axis: { fromUs: 0, toUs: 8200, ticks: [0, 2000, 4000, 6000, 8000], unit: 'µs' },
  }
}

export const uwbAcquisition: Lesson = {
  id: 'uwb-acquisition',
  module: 30,
  title: '首片段丢失，整轮作废',
  why: 'IEEE 802.15.4-2024 的超宽带（ultra-wideband, UWB）包以同步头（SHR）开头，它由同步字段（SYNC field, SYNC）与帧起始定界符（start-of-frame delimiter, SFD）组成；P802.15.4ab 草案中不使用窄带（narrowband, NB）射频的 UWB 驱动配置里，多毫秒（multi-millisecond, MMS）测距包也只在第一个片段（fragment）里带这样一段 SYNC+SFD，无论前面有没有 SP0 控制包。提案 15-25/0066r1 指出：这个片段若因干扰没有收到，就没有成功的信号捕获（acquisition），整个测距轮（ranging round）失败；它建议给每个测距序列片段（ranging sequence fragment, RSF）附加 SFD，但提出这条意见的人后来撤回了它，草案里没有这个设置。捕获怎样判定标准与草案都没有规定，本仿真器的取法是按单个片段判定、不允许累加。在本课的房间里，路由器的 Wi-Fi 猝发使十四列片段中有七列丢失了第一个片段而整列作废，这七列累加后的余量都在 19 dB 以上，1.3 秒只得到 3 个距离；带上 SP0 控制包也救不了这些列：SP0 包本身也被干扰，八列里只检出三列，一个距离也没有。只有窄带辅助配置与把 Wi-Fi 移出这条信道能得到全部 14 个距离。',
  outcomes: [
    '说出提案 15-25/0066r1 的问题陈述，以及它的 RSF 附加 SFD 建议为什么不在草案里',
    '区分本仿真器的捕获判定（单个片段）与累加判定（多个片段的累加值）',
    '说明为什么有 SP0 控制包时测距包的第一个片段仍然必须收到',
  ],
  needs: ['uwb-uwbd', 'uwb-mms-numbers'],
  terms: [
    { term: 'phyUwbMmsRsfSfd', plain: '提案 15-25/0066r1 给「每个 RSF 附加 SFD」取的 PIB 属性名；提出意见的人已撤回，草案里没有这个属性' },
    { term: 'SHR', plain: '同步头：HRP UWB 包开头由同步字段与帧起始定界符组成的那一段（IEEE 802.15.4-2024 §16.2.6）' },
    { term: 'opener', plain: '捕获入口：本课的说法，指这一列中可以用来捕获这个包的片段，草案的包结构里只有第一个' },
    { term: 'SIR', plain: '信干比：期望信号的电平减去干扰信号的电平' },
  ],
  standard: [
    { heading: '同步头（IEEE Std 802.15.4-2024 §16.2.6，图 16-5）', text: 'HRP UWB 包的同步头（SHR）由同步字段（SYNC）与帧起始定界符（SFD）两部分组成；SYNC 由前导码构成的前导符号（preamble symbol）重复而成（§16.2.6.2），SFD 紧随其后（§16.2.6.3）。' },
    { heading: 'UWB 驱动配置的多毫秒测距包（P802.15.4ab 草案；15-25/0194r0、15-25/0066r1 引述）', text: '在 UWB 驱动配置下，MMS 测距包以一个 SYNC+SFD 片段开头，其后是 RSF。控制阶段有 SP0 包时，SP0 包在前，测距包仍以这个 SYNC+SFD 片段开头（15-25/0194r0 的示意图）；SYNC 与 SFD 用于估计载波频偏与定时。这个片段所用的前导码与 RSF 所用的序列由同一个 Sequence Code Index 给出（草案 §10.38.9.3.10）。' },
    { heading: '提案的问题陈述（15-25/0066r1）', text: 'UWB 驱动的 MMS 容易受第一个 SYNC+SFD 片段丢失的影响：这个片段若没有收到（例如因为干扰），就没有成功的信号捕获，整个测距轮失败。' },
    { heading: 'RSF 附加 SFD 的建议及其结局（15-25/0066r1、15-25/0082r8）', text: '提案建议在描述测距物理层（physical layer, PHY）配置的 Ranging PHY Configuration 字段里增加一位 RSF with SFD，取 1 时每个 RSF 之后附加一个 SFD，使每个片段都可以用来捕获（条件是 Sequence Code Index 为 9–32、RSF 片段长度为 32 或 64），并增加 PIB 属性 phyUwbMmsRsfSfd。这份文稿是对 CID 963 的处置提案；15-25/0082r8 记录 CID 963 已由提出者撤回，所以草案里没有这一位，也没有这个属性。' },
    { heading: '没有规定的部分', text: '标准与草案都没有规定接收机怎样判定捕获、能否把几个片段累加后再捕获。' },
    { kind: 'steps', heading: 'UWB 驱动配置下一个测距包的捕获，按草案的包结构：逐步说明', items: [
      '控制阶段有 SP0 包时，接收方先收 SP0 包；零长控制阶段时没有这一步。',
      '测距包的第一个片段是 SYNC+SFD，接收方用它捕获这个包、估计载波频偏与定时。',
      '这个片段丢失，就没有捕获，整个测距轮失败，后面的 RSF 收到再多也无法使用。',
      '捕获之后，其余片段照常用于多毫秒测距。',
    ] },
  ],
  implementation: [
    { topic: '包头片段', standard: 'UWB 驱动配置的测距包以 SYNC+SFD 片段开头，其后是 RSF（草案，提案引述）', sim: '照此实现：两种控制阶段下，包头片段都是这个包唯一的捕获入口，它的时间戳参考点是片段 0 的第一个脉冲。', kind: 'faithful' },
    { topic: '有 SP0 控制阶段时', standard: 'SP0 包之后，测距包仍以 SYNC+SFD 片段开头（15-25/0194r0）', sim: '照此实现：收到 SP0 包只是知道有对端，测距包的第一个片段仍要单独收到。本仿真器以前把 SP0 之后的测距包视为已捕获。', kind: 'faithful' },
    { topic: 'RSF 附加 SFD', standard: 'CID 963 已撤回，草案没有这一位（15-25/0082r8）', sim: '未实现：本仿真器原有的「每个 RSF 带 SFD」开关已删除。', kind: 'absent' },
    { topic: '捕获判定', standard: '标准与草案都未规定', sim: '先做捕获判定：第一个片段单独不低于 −93 dBm，不允许累加；再做累加判定：收到的片段累加后不低于 −93 dBm。两者都通过才有时间戳；捕获失败则整列作废、这一轮不产生距离。', kind: 'choice' },
    { topic: '窄带辅助配置', standard: '草案只规定控制消息经窄带传送', sim: '窄带辅助配置下不做捕获判定，一问一答被视为已经给出时基。', kind: 'choice' },
    { topic: 'Wi-Fi 干扰', standard: '标准未规定接收机的判决', sim: '片段到达时读一次 Wi-Fi 的瞬时功率，信干比（signal-to-interference ratio, SIR）低于 −12 dB 即判为丢失。', kind: 'value' },
  ],
  labs: [
    {
      heading: '一个片段被 Wi-Fi 干扰而丢失',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个被干扰的片段。',
        '读出那一行的信干比与干扰电平，和一个片段的到达电平比较。',
      ],
      blocks: [
        { kind: 'table', heading: '这个房间', head: ['量', '取值'], rows: [
          ['锚点与标签相距', '9.00 m'],
          ['Wi-Fi 信道', '6305 MHz · 80 MHz，整条在测距信道之内'],
          ['一个片段', '64 × 4 × (128 + 2 × 64) = 65 536 码片（chip） · 131.282 µs'],
          ['一个片段到达时', '−73.28 dBm'],
        ] },
      ],
      expect: '1.131 ms 写着 “anchor-1 UWB frame from tag-1 lost to Wi-Fi: SIR -30.2 dB (foreign -43.1 dBm)”：干扰有 −43.1 dBm，而一个片段只有 −73.28 dBm。',
      meaning: '路由器就在锚点（anchor）所在的墙角，它的 80 MHz 落在这条测距信道内；判为丢失的门限是本仿真器的取值（②）。',
    },
    {
      heading: '余量充足，整列却作废',
      jump: 3,
      steps: [
        '跳到第一列因无可用捕获入口而作废的片段，读出收到几个、余量多少、结论是什么。',
        '对照下图与公式：这一列丢的是哪几个片段，累加判定与捕获判定各看什么。',
      ],
      blocks: [
        { kind: 'diagram', heading: '同一列片段，两种判定', spec: uwbAcquisitionTiming(), caption: '第二块那一轮里，标签（tag）的八个片段在锚点处的到达情况：片段 0 到 3 与片段 6 被干扰丢失。下面一行是唯一的捕获入口——第一个片段，恰好没有到达。' },
        { kind: 'formula', heading: '这一列的两种判定', text: '累加：−73.28 dBm + 10·log10(3) = −68.51 dBm ≥ −93 dBm  →  通过\n捕获：唯一的捕获入口是片段 0，它没有到达  →  未通过', note: '两种判定都是本仿真器的取法（②）。' },
      ],
      expect: '207.500 ms 那一行收到 3/8、余量 24.5 dB，结论却是 lost；收到的是片段 4, 5, 7，片段 0 没有到达。',
      meaning: '这正是提案的问题陈述（①）：第一个片段丢失，这一轮就没有捕获；余量再大也无济于事，因为本仿真器的捕获判定不允许累加（②）。',
    },
    {
      heading: '带上 SP0 控制包也一样',
      variant: 0,
      more: [1, 2],
      steps: [
        '载入「带 SP0 控制相位」，读出 8.500 ms 那一行收到的片段数、余量与结论。',
        '再载入「窄带辅助（Config 2）」与「把 Wi-Fi 移出这条信道」，对照下表读出四个场景的结果。',
      ],
      blocks: [
        { kind: 'table', heading: '四个场景，同一个房间', head: ['场景', '每列收到的片段', '检出', '每 1.3 秒的距离数'], rows: [
          ['零长控制阶段', '4,6,3,1,6,4,6,4,4,5,5,4,5,6', '7 / 14', '3'],
          ['带 SP0 控制相位', '3,6,0,3,6,6,4,0', '3 / 8', '0'],
          ['窄带辅助（Config 2）', '5,5,5,5,6,5,6,4,3,6,6,5,4,7', '14 / 14', '14'],
          ['把 Wi-Fi 移出这条信道', '8,8,8,8,8,8,8,8,8,8,8,8,8,8', '14 / 14', '14'],
        ] },
      ],
      expect: '带 SP0 控制相位时 8.500 ms 那一行收到 3/8、余量 24.5 dB，结论仍是 lost：SP0 包已经收到，丢的仍是第一个片段。七个块里只有三轮的 SP0 一问一答完整成功，八列片段检出三列，报告也被干扰，一个距离也没有。',
      meaning: 'SP0 包告诉接收方有对端，却替代不了测距包自己的 SYNC+SFD 片段（①）；窄带辅助配置不做捕获判定（②），报告也经窄带送达，所以得到 14 个。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§16.2.6 与图 16-5（同步头由 SYNC 与 SFD 组成）、§16.2.6.2（SYNC）、§16.2.6.3（SFD）。',
    'P802.15.4ab 草案（正在审议，仅对会员开放）：UWB 驱动配置的测距包以 SYNC+SFD 片段开头、有 SP0 时 SP0 在前（15-25/0194r0 的示意图）、前导码由 Sequence Code Index 给出（草案 §10.38.9.3.10），按 TG4ab 文稿的引述。',
    '15-25/0066r1（对 CID 963 的处置提案）：问题陈述与 RSF with SFD 建议；15-25/0082r8：CID 963 已由提出者撤回。',
    '本仿真器的取值与取法：捕获按第一个片段单独判定、门限 −93 dBm、不允许累加，捕获失败则整轮作废；窄带辅助时不做捕获判定；Wi-Fi 干扰按一次瞬时读数、−12 dB 的信干比门限判定。',
  ],
  limits: [],
  scenario: () => uwbAcquisitionScenario('base'),
  variants: [
    { label: '带 SP0 控制相位', scenario: () => uwbAcquisitionScenario('sp0') },
    { label: '窄带辅助（Config 2）', scenario: () => uwbAcquisitionScenario('nba') },
    { label: '把 Wi-Fi 移出这条信道', scenario: () => uwbAcquisitionScenario('clear') },
  ],
  jumps: [
    J('第一个受 Wi-Fi 干扰丢失的片段', firstAcqInterfered),
    J('第一列片段里的第一个', firstUwbRsf),
    J('对端如何判定这一列片段', firstUwbTrain),
    J('第一列因无可用捕获入口而作废的片段', firstUwbTrainLost),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一列片段收到三个、累加后余量 24.5 dB，却判为丢失。缺的是什么？',
      options: [
        '缺的是电平：三个片段累加后仍然不够',
        '缺的是捕获入口：只有第一个片段能用来捕获，而它正是被干扰丢失的片段之一',
        '缺的是报告：锚点没有把时间值发回',
      ],
      answer: 1,
      explain: '累加判定高出门限二十多分贝。使这一列作废的是捕获判定，本仿真器只让它看第一个片段；提案的问题陈述说的就是这种失败。',
    },
    {
      q: '关于 RSF with SFD（phyUwbMmsRsfSfd），哪一项是正确的？',
      options: [
        '它是 IEEE 802.15.4-2024 的 PIB 属性',
        '它是提案 15-25/0066r1 的建议，CID 963 已撤回，草案里没有它',
        '有 SP0 控制包时不需要它，因为 SP0 包已经完成捕获',
      ],
      answer: 1,
      explain: '15-25/0082r8 记录 CID 963 已撤回。SP0 包之后测距包仍以 SYNC+SFD 片段开头，捕获仍取决于这个片段。',
    },
  ],
}
