/**
 * UWB Tier 3 · M15 · The other control plane · Lose the leading fragment and the whole round is
 * gone — and what the proposed RSF with SFD setting (`phyUwbMmsRsfSfd`) buys back.
 *
 * Standard-first shape (2026-11-10): ① the standard's SHR (§16.2.6), the draft's UWB-driven MMS
 * packet, and the TG4ab proposal 15-25/0066r1 — its problem statement and the RSF with SFD bit, a
 * proposal whose adoption no later public document records; ② how this simulator implements it,
 * including the acquisition rule it chose (one fragment, no combining; the standard is silent) and
 * the one place it departs from the proposal (audit #18: an SP0 control phase is treated as having
 * acquired); ③ four guided runs: the interference, the discarded train, the attribute, and the edge
 * link where the attribute's 0.188 dB of peak power loses every round.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-acquisition.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import type { TimingSpec } from '../diagram'
import { rsfAirNs } from '../../uwb/mms'
import {
  J, LESSON_6G_WIDTH_MHZ, anchor, firstUwbRsf, firstUwbTrain, firstUwbTrainLost, node, oneRoom,
  twoWallLab, uwbSc, uwbTag, wifi6g, type Lesson,
} from '../lessonKit'

/** Which scene the lesson runs. */
export type UwbAcquisitionVariant = 'base' | 'sfd' | 'nba' | 'clear' | 'edge'

/** 6 GHz channel 71: 6265–6345 MHz, wholly inside UWB channel 5's 6240.0–6739.2 MHz. */
export const ACQ_6G_CENTER_MHZ = 6305
/** 6 GHz channel 7, the engine's own default: clear of every UWB band. */
export const ACQ_CLEAR_6G_MHZ = 5985

/**
 * The RSF fragment length this lesson runs at. The draft allows an SFD after an RSF only at a
 * fragment length of 32 or 64, so a scene that wants the attribute has to be at one of them — and
 * the schema refuses the rest. 64 at the session's own gap of 64 zeros is 131.282 µs.
 * 4ab draft 15-25/0066r1
 */
export const ACQ_N_MSR = 64 as const

/** Config 1 carries no narrowband settings: there is no radio for them. 4ab draft 15-25/0194r0 */
const UWBD = { control: 'uwbd', uwbdControl: 'none', nbChannels: [] as number[], nbLbt: 'off' } as const

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
 * `'clear'` moves the Wi-Fi channel 320 MHz down, out of the UWB band; `'nba'` puts the same room
 * on the narrowband control plane, whose channel is in UNII-3 and whose receiver was never asked to
 * acquire anything.
 */
export function uwbAcquisitionScenario(variant: UwbAcquisitionVariant = 'base'): Scenario {
  if (variant === 'edge') return acqEdgeScenario()
  const ap = node('ap', 'Router', 'ap', 1, 1, 'eht', 'idle', { edca: true, txop: true, ampdu: true }, 2.0)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', 1.5, 6.5, 'video')
  const mms = variant === 'nba'
    ? { nMsr: ACQ_N_MSR, nbChannels: [3] }
    : { ...UWBD, nMsr: ACQ_N_MSR, rsfSfd: variant === 'sfd' }
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

/** Where the two radios of the `'edge'` scene stand: 5.40 m apart, across both brick partitions
 * of the ranging hall. MEASURED, not chosen — at this separation one fragment arrives
 * 0.16 dB over the receiver's sensitivity, and the SFD costs 0.188 dB, so the attribute turns a
 * round that acquires into a round that does not. The test reads both runs; move either radio and
 * it stops being the edge. */
export const EDGE_ANCHOR_X = 4.8
export const EDGE_TAG_X = 10.2

/**
 * The same pair of radios with no Wi-Fi in the room at all, run down to the edge of acquisition:
 * every fragment arrives, every fragment is audible without the attribute, and **none** of them is
 * audible with it.
 *
 * It is the other half of what the attribute does, and it only exists because the fragment now has
 * a length: the SFD is paid for out of the millisecond's energy budget, so each fragment is
 * 0.188 dB quieter, and on a link with less margin than that the extra openers are all too quiet
 * to open anything. There is no range in this scene either way — the SP0 REPORT is 8.5 dB worse
 * off than a fragment and never arrives at this distance — so what flips is the acquisition
 * verdict and the timestamps behind it.
 */
function acqEdgeScenario(): Scenario {
  return uwbSc(
    twoWallLab(),
    [anchor('anchor-1', 'Anchor 1', EDGE_ANCHOR_X, 4, 1.0), uwbTag('tag-1', 'Tag', EDGE_TAG_X, 4, 1.0)],
    {
      mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false, channel: 5,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...UWBD, nMsr: ACQ_N_MSR, rsfSfd: true },
    },
  )
}

/**
 * Which fragments of the tag's column reached the anchor in the round of block 1 — indices 3 to 7,
 * the first three lost to the router — and what each of the two settings does with that column.
 * The indices are read off the run and pinned in the test, so the figure cannot drift from it.
 */
export const ACQ_HEARD: readonly number[] = [3, 4, 5, 6, 7]

/** The same column of fragments, and the two fates the SFD attribute decides between. */
export function uwbAcquisitionTiming(): TimingSpec {
  const phy = { ...DEFAULT_UWB_SESSION.mms, nMsr: ACQ_N_MSR }
  // Two lengths, because the attribute now has one: the top two lanes are the base column's
  // fragments and the bottom lane is the SFD column's, which is one SFD longer.
  const fragUs = rsfAirNs({ ...phy, rsfSfd: false }) / 1000
  const sfdUs = rsfAirNs({ ...phy, rsfSfd: true }) / 1000
  const span = (i: number, tone?: 'plain' | 'accent' | 'muted', lenUs: number = fragUs) =>
    ({ fromUs: i * 1000, toUs: i * 1000 + lenUs, tone })
  const all = [0, 1, 2, 3, 4, 5, 6, 7]
  return {
    kind: 'timing',
    lanes: [
      { label: '到达', spans: all.map((i) => span(i, ACQ_HEARD.includes(i) ? 'plain' : 'muted')) },
      { label: '无 SFD', spans: [{ ...span(0, 'muted'), label: '只有这一个' }] },
      { label: '带 SFD', spans: ACQ_HEARD.map((i) => span(i, 'accent', sfdUs)) },
    ],
    axis: { fromUs: 0, toUs: 8200, ticks: [0, 2000, 4000, 6000, 8000], unit: 'µs' },
  }
}

export const uwbAcquisition: Lesson = {
  id: 'uwb-acquisition',
  module: 30,
  title: '首片段丢失，整轮作废',
  why: 'IEEE 802.15.4-2024 的超宽带（ultra-wideband, UWB）包以同步头（SHR）开头，它由同步字段（SYNC field, SYNC）与帧起始定界符（start-of-frame delimiter, SFD）组成；P802.15.4ab 草案中不使用窄带（narrowband, NB）射频的 UWB 驱动配置里，多毫秒（multi-millisecond, MMS）测距包也只在包头的第一个片段（fragment）里带这样一段 SYNC+SFD，其后的测距序列片段（ranging sequence fragment, RSF）不带 SFD。提案 15-25/0066r1 指出：这个片段若因干扰没有收到，就没有成功的信号捕获（acquisition），整个测距轮（ranging round）失败；它建议增加 RSF with SFD 设置（PIB 属性 phyUwbMmsRsfSfd），置 1 时每个 RSF 之后都附加一个 SFD，使每个片段都与包头的 SYNC+SFD 相同、都可以用来捕获。这是一份针对草案意见的决议提案，之后的公开文稿里找不到它被采纳的记录。本仿真器照提案实现了这个设置；捕获怎样判定标准与草案都没有规定，本仿真器的取法是按单个片段判定、不允许累加。在本课的房间里，路由器的 Wi-Fi 猝发使十四列片段中有七列丢失了包头片段而整列作废，这七列累加后的余量都在 22 dB 以上；置 1 之后十四列全部检出，距离从 3 个增加到 6 个，没有到 14 个，是因为收尾的报告处在同一次干扰之中。代价是峰值功率：本仿真器把每毫秒的能量当作定额，片段长了一个 SFD，峰值就低 0.188 dB，在余量小于这个值的链路（link）上，置 1 反而使每一轮都无法捕获。',
  outcomes: [
    '说出提案 15-25/0066r1 的问题陈述、它建议的 RSF with SFD 设置与两个使用条件，以及它的采纳状态',
    '区分本仿真器的捕获判定（单个片段）与累加判定（多个片段的累加值）',
    '读出置 1 前后同一列片段的两种判定结果，并说出这个设置的代价',
  ],
  needs: ['uwb-uwbd', 'uwb-mms-numbers'],
  terms: [
    { term: 'phyUwbMmsRsfSfd', plain: '提案 15-25/0066r1 给这个设置取的 PIB 属性名：为真时每个 RSF 之后都附加一个 SFD；是否被草案采纳无法确认' },
    { term: 'SHR', plain: '同步头：HRP UWB 包开头由同步字段与帧起始定界符组成的那一段（IEEE 802.15.4-2024 §16.2.6）' },
    { term: 'opener', plain: '捕获入口：本课的说法，指这一列中允许用来捕获这个包的那些片段' },
    { term: 'SIR', plain: '信干比：期望信号的电平减去干扰信号的电平' },
  ],
  standard: [
    { heading: '同步头（IEEE Std 802.15.4-2024 §16.2.6，图 16-5）', text: 'HRP UWB 包的同步头（SHR）由同步字段（SYNC）与帧起始定界符（SFD）两部分组成；SYNC 由前导码构成的前导符号（preamble symbol）重复而成（§16.2.6.2），SFD 紧随其后（§16.2.6.3）。' },
    { heading: 'UWB 驱动配置的多毫秒测距包（P802.15.4ab 草案，15-25/0066r1 引述）', text: '在 UWB 驱动配置下，MMS 测距包以一个 SYNC+SFD 片段开头，其后是 RSF。这个 SYNC+SFD 片段所用的前导码，与 RSF 所用的序列由同一个 Sequence Code Index 给出（草案 §10.38.9.3.10）。提案指出：使用 91 长码或 127 长码、且 RSF 的重复数等于 SYNC 的前导符号重复数时，SYNC 与 RSF 完全相同，差别只在 SFD。' },
    { heading: '提案的问题陈述（15-25/0066r1）', text: '包头的 SYNC+SFD 片段若没有收到（例如因为干扰），就没有成功的信号捕获，整个测距轮失败。' },
    { heading: 'RSF with SFD（15-25/0066r1 的提案，采纳状态未确认）', text: '提案在草案里描述测距物理层（physical layer, PHY）配置的 Ranging PHY Configuration 字段（草案图 52）里增加一位 RSF with SFD：默认 0，表示 RSF 之后没有 SFD；1 表示每个 RSF 之后都有一个 SFD。取 1 的条件有两个：Sequence Code Index 为 9–32，且 RSF 片段长度为 32 或 64。此时 RSF+SFD 与同一个包里的 SYNC+SFD 完全相同，任何一个片段都可以用来捕获，例如在首个 SYNC+SFD 片段因干扰丢失时。提案同时增加对应的 PIB 属性 phyUwbMmsRsfSfd（布尔量），并写明它只适用于 UWB 驱动配置。这份文稿是针对草案 D01 意见的决议提案，之后的公开文稿中找不到它被采纳的记录。' },
    { heading: '没有规定的部分', text: '标准与草案都没有规定接收机怎样判定捕获、能否把几个片段累加后再捕获，也没有规定片段变长之后发射功率（transmit power）怎样分配。' },
    { kind: 'steps', heading: 'RSF with SFD 的用法，按提案：逐步说明', items: [
      '双方约定 Ranging PHY Configuration：只有 Sequence Code Index 为 9–32、RSF 片段长度为 32 或 64 时，RSF with SFD 才可以取 1。',
      '发送方发出 MMS 测距包：包头一个 SYNC+SFD 片段，其后是各个 RSF；取 1 时每个 RSF 之后都附加一个 SFD。',
      '取 0 时，接收方只能用包头的 SYNC+SFD 片段捕获；这个片段丢失，整个测距轮失败。',
      '取 1 时，接收方可以用其中任何一个片段捕获；收到的 RSF+SFD 片段越多，至少有一个可用于捕获的概率越高。',
      '捕获之后，其余片段照常用于多毫秒测距。',
    ] },
  ],
  implementation: [
    { topic: '包头片段', standard: 'UWB 驱动配置的测距包以 SYNC+SFD 片段开头，其后是 RSF（草案，提案引述）', sim: '照此实现：零长控制阶段时，包头片段就是这个包唯一的捕获入口，它的时间戳参考点是片段 0 的第一个脉冲。', kind: 'faithful' },
    { topic: 'RSF with SFD', standard: '默认 0，取 1 的条件：Sequence Code Index 9–32、RSF 片段长度 32 或 64（15-25/0066r1）', sim: '照提案实现为编辑器里的「每个 RSF 带 SFD」开关；RSF 片段长度不是 32 或 64 时编辑器拒绝打开它。本仿真器的 MMS 测距包只用 91 长码那一族，码序那一条总能满足，所以无法单独演示。', kind: 'faithful' },
    { topic: 'SFD 的时长', standard: '提案 15-25/0194r0 的对照表给出 5.8 µs', sim: '取 5 800 ns：64 长的片段从 131.282 µs 变为 137.082 µs，一列八个片段多占 46 400 ns，一轮的时长不变。按 8 个前导符号推导是 5 833 ns，本仿真器取了表中较短的值。', kind: 'value' },
    { topic: '片段的峰值功率', standard: '标准与提案都未规定', sim: '每毫秒的能量定额是 37 nJ，片段变长，峰值功率按比例下降：64 长的片段从 −5.500 dBm 降到 −5.688 dBm，低 0.188 dB；32 长的片段低 0.368 dB。', kind: 'choice' },
    { topic: '捕获判定', standard: '标准与草案都未规定', sim: '先做捕获判定：在可用作捕获入口的片段里，至少有一个单独不低于 −93 dBm，不允许累加；再做累加判定：收到的片段累加后不低于 −93 dBm。两者都通过才有时间戳；捕获失败则整列作废、这一轮不产生距离。', kind: 'choice' },
    { topic: '有 SP0 控制阶段时', standard: '提案把包头片段丢失看作整轮失败的原因，没有把有 SP0 控制包的情形排除在外', sim: '本仿真器与提案不同：控制阶段有 SP0 包时，视为接收机已经从 SP0 包获得时基，不再对片段做捕获判定，这个设置也就不起作用。这是待改正的偏差。', kind: 'differs' },
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
        { kind: 'diagram', heading: '同一列片段，两种判定结果', spec: uwbAcquisitionTiming(), caption: '第二块那一轮里，标签（tag）的八个片段在锚点处的到达情况：前三个被干扰丢失。中间一行是不带 SFD 时唯一的捕获入口，恰好没有到达；最下面一行是置 1 之后可用的捕获入口。' },
        { kind: 'formula', heading: '这一列的两种判定', text: '累加：−73.28 dBm + 10·log10(5) = −66.29 dBm ≥ −93 dBm  →  通过\n捕获：可用作捕获入口的只有片段 0，它没有到达  →  未通过', note: '两种判定都是本仿真器的取法（②）。' },
      ],
      expect: '207.500 ms 那一行收到 5/8、余量 26.7 dB，结论却是 lost；收到的是片段 3, 4, 5, 6, 7，片段 0 没有到达。',
      meaning: '这正是提案的问题陈述（①）：包头片段丢失，这一轮就没有捕获；余量再大也无济于事，因为本仿真器的捕获判定不允许累加（②）。',
    },
    {
      heading: '每个 RSF 带 SFD',
      variant: 0,
      more: [1, 2],
      steps: [
        '载入「每个 RSF 带 SFD」，回到 207.500 ms 那一行，比较收到的片段数、余量与结论。',
        '再载入「窄带辅助（Config 2）」与「把 Wi-Fi 移出这条信道」，对照下表读出四个场景的结果。',
      ],
      blocks: [
        { kind: 'table', heading: '四个场景，同一个房间', head: ['场景', '每列收到的片段', '检出', '每 1.3 秒的距离数'], rows: [
          ['零长控制阶段，无 SFD', '5,6,5,2,6,4,6,4,5,6,6,5,6,6', '7 / 14', '3'],
          ['每个 RSF 带 SFD', '与上一行完全相同的十四组', '14 / 14', '6'],
          ['窄带辅助（Config 2）', '6,5,6,5,6,6,7,4,5,6,6,6,5,7', '14 / 14', '14'],
          ['把 Wi-Fi 移出这条信道', '8,8,8,8,8,8,8,8,8,8,8,8,8,8', '14 / 14', '14'],
        ] },
      ],
      expect: '置 1 之后 207.500 ms 那一行收到的还是 5/8，余量低了 0.19 dB（26.5 dB，不是 26.7 dB），结论变为检出。无 SFD 时被丢弃的七列，累加后的余量在 22.7 到 27.5 dB 之间。',
      meaning: '置 1 让每个片段都成为捕获入口（①的提案），所以同一列片段从作废变为检出；距离只到 6 个，是因为本课场景的报告是 SP0 包、处在同一次干扰之中。窄带辅助配置不做捕获判定（②），报告也经窄带送达，所以得到 14 个。',
    },
    {
      heading: '余量小于代价的链路',
      variant: 3,
      steps: [
        '载入「余量不到 0.19 dB 的那条链路」，看六列片段的判定。',
        '在编辑器中关闭「每个 RSF 带 SFD」再运行一次，比较两次的判定与接收时间戳。',
      ],
      blocks: [
        { kind: 'table', heading: '这个设置的代价：两个允许的片段长度', head: ['RSF 片段长度', '片段', '带 SFD', '每个片段的峰值功率'], rows: [
          ['64（本课）', '131.282 µs', '137.082 µs', '−5.500 → −5.688 dBm，低 0.188 dB'],
          ['32', '65.641 µs', '71.441 µs', '−2.490 → −2.857 dBm，低 0.368 dB'],
        ] },
        { kind: 'table', heading: '隔着两道砖墙的 5.40 m', head: ['量', '取值'], rows: [
          ['一个片段到达时（不置 1）', '−92.84 dBm，灵敏度 −93 dBm'],
          ['余量', '0.16 dB，比 SFD 的 0.188 dB 还小'],
          ['不置 1', '六列全部捕获，十二条时间戳'],
          ['置 1', '六列没有一列捕获，没有接收时间戳'],
        ] },
      ],
      expect: '置 1 时六列片段每列都收到 8/8，却没有一列捕获；关闭之后六列全部捕获。两种设置都得不到距离：在这个距离上 SP0 报告送不到。',
      meaning: '峰值功率随片段变长而下降是本仿真器的取法（②）；在余量小于 0.188 dB 的链路上，它让这个设置从有益变为有害。这个设置增加的是捕获入口，不是灵敏度（sensitivity）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§16.2.6 与图 16-5（同步头由 SYNC 与 SFD 组成）、§16.2.6.2（SYNC）、§16.2.6.3（SFD）。',
    'P802.15.4ab 草案（正在审议，仅对会员开放）：UWB 驱动配置的测距包以 SYNC+SFD 片段开头、前导码由 Sequence Code Index 给出（草案 §10.38.9.3.10、图 52），按 TG4ab 文稿 15-25/0066r1 的引述。',
    '15-25/0066r1（提案，针对草案 D01 的意见决议）：问题陈述、RSF with SFD 位、两个使用条件、PIB 属性 phyUwbMmsRsfSfd；之后的公开文稿里找不到它被采纳的记录。SFD 的 5.8 µs 出自 15-25/0194r0 的对照表。',
    '本仿真器的取值与取法：捕获按单个片段判定、门限 −93 dBm、不允许累加，捕获失败则整轮作废；有 SP0 控制阶段或窄带辅助时不做捕获判定（前者与提案不同，待改正）；每毫秒 37 nJ 的能量定额；SFD 取 5 800 ns；Wi-Fi 干扰按一次瞬时读数、−12 dB 的信干比门限判定。',
  ],
  limits: [],
  scenario: () => uwbAcquisitionScenario('base'),
  variants: [
    { label: '每个 RSF 带 SFD', scenario: () => uwbAcquisitionScenario('sfd') },
    { label: '窄带辅助（Config 2）', scenario: () => uwbAcquisitionScenario('nba') },
    { label: '把 Wi-Fi 移出这条信道', scenario: () => uwbAcquisitionScenario('clear') },
    { label: '余量不到 0.19 dB 的那条链路', scenario: () => uwbAcquisitionScenario('edge') },
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
      q: '一列片段收到五个、累加后余量 26.7 dB，却判为丢失。缺的是什么？',
      options: [
        '缺的是电平：五个片段累加后仍然不够',
        '缺的是捕获入口：不带 SFD 时只有包头片段能用来捕获，而它正是被干扰丢失的片段之一',
        '缺的是报告：锚点没有把时间值发回',
      ],
      answer: 1,
      explain: '累加判定高出门限二十多分贝。使这一列作废的是捕获判定，本仿真器只让它看单个片段；提案的问题陈述说的就是这种失败。',
    },
    {
      q: '关于 RSF with SFD（phyUwbMmsRsfSfd），哪一项是正确的？',
      options: [
        '它是 IEEE 802.15.4-2024 的 PIB 属性',
        '它是提案 15-25/0066r1 的建议，取 1 需要 Sequence Code Index 9–32 且 RSF 片段长度 32 或 64，是否被草案采纳无法确认',
        '它使每个片段的峰值功率提高 0.188 dB',
      ],
      answer: 1,
      explain: '它只出现在 2025 年的提案里。本仿真器里片段变长、峰值功率降低 0.188 dB，这是本仿真器按每毫秒能量定额的取法。',
    },
  ],
}
