/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Lose the leading fragment and the
 * whole round is gone — and what `phyUwbMmsRsfSfd` buys back.
 *
 * `uwb-uwbd` established that a UWB-driven round has to find the packet before it can add anything
 * up. This one is about the consequence the draft's own problem statement names: the packet has
 * exactly one opener, its leading SYNC+SFD fragment, and a burst of interference over that one
 * fragment loses the round however loud the rest arrived. The PIB attribute
 * `phyUwbMmsRsfSfd` puts an SFD after every RSF, so each RSF is a copy of that same SHR and any one
 * of them can open the packet.
 *
 * The scene is a controlled experiment, but only half of one since 2026-10-03: a 6 GHz router
 * inside UWB channel 5's band sits beside the anchor and shoots holes in the fragment column, and
 * the same fourteen trains arrive at the same instants with the same fragments missing in both
 * runs — but the fragments themselves are no longer identical. The engine now gives the SFD its
 * length (`uwb/mms.ts#rsfAirNs`), so each fragment of the SFD column is 5 800 ns longer and
 * 0.188 dB quieter. Seven of the fourteen trains are thrown away without the attribute and none
 * with it, and every one of the seven had 22 to 27 dB of combining margin. The ranges go from
 * three to six; they do not go to fourteen, because the SP0 REPORT is in the same interference,
 * and the lesson says so.
 *
 * And because the fragment is quieter, the attribute can now lose a round as well as win one: the
 * `'edge'` scene is 5.40 m across two brick partitions, where a fragment clears the receiver by
 * 0.16 dB — less than the SFD costs.
 *
 * Every number quoted below is pinned in tests/course/uwb-acquisition.test.ts.
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
  why: '上一课留下了一个单点故障：在超宽带（ultra-wideband, UWB）驱动配置中，接收机的时基只能从包中获得，而包中只有一处可以用于捕获——包头的那一个片段（fragment），它带有供接收机锁定信号的同步头（SHR）。本课把捕获（acquisition）建模为按单个片段判定、不允许累加多个片段，理由是在捕获第一个片段之前，没有时基可用于确定第二个片段的位置；这条判据是本课的模型规则，草案没有规定。所以包头的片段一旦因一次 Wi-Fi 猝发的干扰而丢失，后面的片段收到再多、累加后电平再高也无济于事：这一列判为丢失，整轮得不到任何测量结果。在路由器就放在锚点（anchor）所在墙角的房间里，一半的片段列因此作废，而它们累加后的余量仍有二十多分贝——原因不是电平不足，而是没有可用的捕获入口。一份针对草案的意见决议提案（15-25/0066r1）为此建议增加一个属性，在每个测距序列片段（ranging sequence fragment, RSF）之后附加一个帧起始定界符（start-of-frame delimiter, SFD），于是每个片段都与包头的同步头完全相同；这个属性是否已纳入草案，公开材料无法确认。在本课的场景里，捕获机会因此从一个变为八个，同一列片段中原本作废的那些全部检出。代价是峰值功率：本课的模型把每毫秒的能量当作定额，片段变长，峰值功率就按比例下降，降幅不到零点二分贝，片段越短降幅越大；在余量小于这一降幅的链路（link）上，启用这个属性反而使每一轮都无法捕获。它增加的是捕获机会，而不是灵敏度（sensitivity）：它能弥补因干扰造成的失败，不能弥补因电平不足造成的失败；而收尾的报告若仍处于同一次干扰之中，距离仍然无法送回。',
  outcomes: [
    '区分捕获（acquisition）与累加：前者按单个片段判定，后者按多个片段的累加值判定',
    '说出包头的片段丢失之后，这一轮还能得到什么',
    '读出启用该属性前后，同一列片段的两种判定结果',
  ],
  needs: ['uwb-uwbd', 'uwb-mms-numbers'],
  terms: [
    { term: 'phyUwbMmsRsfSfd', plain: '提案 15-25/0066r1 给该属性取的名称：置 1 时每个 RSF 之后都附加一个 SFD；是否已纳入草案无法确认' },
    { term: 'SHR', plain: '同步头：包头那段供接收机锁定信号、进而打上时间戳的序列，由同步字段与帧起始定界符组成' },
    { term: 'opener', plain: '捕获入口：本课的说法，指这一列中允许用于捕获这个包的那些片段' },
    { term: 'SIR', plain: '信干比：期望信号的电平减去干扰信号的电平' },
  ],
  picture: [
    { heading: '两种判定，针对同一列片段', text: '在本课的模型里，一列片段到达之后要经过两种判定，而它们判断的不是同一件事；这两种判定和下面的门限都是本课的模型规则，草案没有规定接收机怎样判定。累加判定判断的是“累加后的电平是否足够”：把收到的片段累加，减去接收机的灵敏度（sensitivity），不为负即判为检出。捕获判定判断的是“是否已经捕获这个包”，它按单个片段判定，不允许任何累加——因为在捕获第一个片段之前，没有时基可用于确定第二个片段的位置。四个各低六分贝的片段，可以同时“累加检出”而“未能捕获”。' },
    { heading: '而捕获机会只有一次', text: '包头的片段就是这个包的同步头（SHR）——一段同步字段（SYNC field, SYNC）加上一个 SFD：接收机用它完成定时同步，此后每一毫秒在何处等待下一个片段，都以它为基准推算。后面的片段中没有 SFD，它们只是测距序列。于是这一列有且只有一次捕获机会——提案 15-25/0066r1 的问题陈述正是这样写的：包头的片段若因干扰没有收到，就没有成功的信号捕获，整个测距轮（ranging round）失败。' },
    { kind: 'watch', jump: 0, heading: '观察一个片段受 Wi-Fi 干扰而丢失', text: '载入仿真，跳到第一个被干扰的片段。那一行列出它的信干比（signal-to-interference ratio, SIR）和干扰信号的电平：路由器就在锚点（anchor）所在的墙角，它的 80 MHz 完全落在这条测距信道内，一次猝发到来，这个片段就丢失了。' },
    { heading: '在每个 RSF 之后附加一个 SFD', text: '提案 15-25/0066r1 建议增加的属性名为 phyUwbMmsRsfSfd，默认为零；它是否已纳入草案无法确认。置 1 时，每个 RSF 尾部都附加一个 SFD，于是这个 RSF＋SFD 片段与同一个包中在它之前的 SYNC+SFD 完全相同——任何一个都可以用作同步头。捕获机会从一个变为八个，整轮不再因首片段丢失而作废。提案规定它只用于 UWB 驱动配置，并给出两条限制：序列码索引（Sequence Code Index）取 9–32，且 RSF 片段长度为 32 或 64。第一条在本课中自动满足——9–32 正是长 127 与长 91 这两族码，而本课这一列片段使用的就是长 91 那一族。所以需要注意的只有片段长度那一条；本课的场景把它设成 64，正是为了使这个属性合法。' },
    {
      kind: 'diagram', heading: '同一列片段，两种判定结果', spec: uwbAcquisitionTiming(),
      caption: '这是本场景第二块那一轮中，标签（tag）的八个片段在锚点处的实际到达情况：前三个受路由器干扰而丢失，后五个完好。中间一行是无 SFD 时可用作捕获入口的片段——恰好是没有到达的那个。最下面一行是置 1 之后可用作捕获入口的片段。',
    },
    { heading: '代价是峰值功率', text: '这一改进并非没有代价，而且代价可以计算。每个 RSF 尾部附加的 SFD 就是额外的一段码片（chip）：8 个前导符号（preamble symbol），提案 15-25/0194r0 的对照表给出的是 5 800 ns，于是片段从 131.282 µs 变为 137.082 µs。而本课的模型把每毫秒的能量当作定额，片段变长，峰值功率就按比例下降——每个片段低 0.188 dB。一列八个片段因此多占 46 400 ns 的空口时间（airtime），一轮的时长却不变：片段按一毫秒的时间网格排列，137 µs 远小于网格间隔。所以这个属性增加的是捕获机会，付出的是每个片段的峰值功率，而片段越短这项代价越大。' },
  ],
  numbers: [
    { kind: 'table', heading: '这个房间', head: [
      '量', '取值',
    ], rows: [
      ['房间', '10 × 8 m，没有内墙'],
      ['锚点与标签相距', '9.00 m'],
      ['路由器与笔记本', '距锚点 3.0 m 与 2.7 m'],
      ['Wi-Fi 信道', '6305 MHz · 80 MHz，整条在测距信道之内'],
      ['一个片段', '64 × 4 × (128 + 2 × 64) = 65 536 码片 · 131.282 µs，带 SFD 时 137.082 µs'],
      ['一个片段到达时', '−73.28 dBm'],
    ] },
    { kind: 'table', heading: '四个场景，同一个房间', head: [
      '场景', '收到的片段',
      '检出', '每 1.3 秒的距离数',
    ], rows: [
      ['零长控制阶段，无 SFD', '5,6,5,2,6,4,6,4,5,6,6,5,6,6', '7 / 14', '3'],
      ['每个 RSF 带 SFD', '与上一行完全相同的十四组', '14 / 14', '6'],
      ['窄带辅助（Config 2）', '6,5,6,5,6,6,7,4,5,6,6,6,5,7', '14 / 14', '14'],
      ['把 Wi-Fi 移出这条信道', '8,8,8,8,8,8,8,8,8,8,8,8,8,8', '14 / 14', '14'],
    ] },
    { text: '前两行针对的是同一列片段：十四组的到达时刻、每组收到的个数都完全相同，改变的只有“哪些片段可用作捕获入口”。但这已不是严格的对照实验——带 SFD 那一列的每个片段长出 5 800 ns、峰值低 0.188 dB，到达电平是 −73.46 dBm 而不是 −73.28 dBm。被丢弃的那七组，累加后的余量在 22.7 到 27.5 dB 之间——没有一组是因为电平不足。' },
    { kind: 'table', heading: '这个属性的代价：草案允许的两个片段长度各一行', head: [
      'RSF 片段长度', '片段', '带 SFD', '每个片段的峰值功率',
    ], rows: [
      ['64（本课）', '131.282 µs', '137.082 µs', '−5.500 → −5.688 dBm，低 0.188 dB'],
      ['32', '65.641 µs', '71.441 µs', '−2.490 → −2.857 dBm，低 0.368 dB'],
    ] },
    { text: '每毫秒的能量是定额 37 nJ，所以片段变长，峰值功率就按比例下降，而草案允许的这两个长度代价并不相同：32 那一行是 64 那一行的两倍。捕获机会以峰值功率为代价，片段越短代价越大。' },
    { kind: 'formula', heading: '那七组失败的原因', text: '累加：−73.28 dBm + 10·log10(5) = −66.29 dBm ≥ −93 dBm  →  检出\n捕获：单个片段 −73.28 dBm ≥ −93 dBm，但那个片段没有到达  →  未能捕获', note: '两行针对的是同一列片段。上面一行把五个片段累加，下面一行只检查一个——而下面这一行检查的那一个，恰好是受干扰丢失的三个之一。' },
    { text: '第三行为什么全部通过：在本课的模型里，窄带（narrowband, NB）辅助配置不进行捕获判定，一问一答已经为两端提供了时基；而且它的控制信道在 5733.75 MHz，与这台路由器的信道相距很远，所以报告也能送达。它比第二行多出的八个距离中，这两个因素各占一半。' },
    { text: '第二行为什么不是十四个。这一轮的报告是一个 SP0 包，它和片段处在同一次干扰之中；使这一列重新可以捕获，只解决了“有没有时间值可报告”，没有解决“这个报告能否送达”。真正同时解决两者的是第四行——把 Wi-Fi 移出这条信道，十四组片段完整无缺，得到十四个距离。' },
    { kind: 'steps', heading: '一列片段到达之后的判定步骤', items: [
      '（以下六步都是本课的判定模型，草案没有规定接收机怎样判定）接收机在每个预期有片段到达的时隙打开一次接收窗口，记录收到的片段的电平与到达时刻，未收到的片段视为不存在——这一列中缺失的片段，在后续判定中始终缺失。',
      '首先进行捕获判定。控制面为窄带辅助时，这一步完全跳过：那一问一答已经提供了时基。控制面为 UWB 驱动且使用控制阶段时，时基来自那个 SP0 包，这一步也已完成。只有控制阶段为零时，这一步才针对片段进行。',
      '哪些片段可用作捕获入口，由该属性决定：默认只有包头的那一个，置 1 之后是这一列中的每一个（这一步依据提案 15-25/0066r1）。',
      '在可用作捕获入口的片段中，检查是否有任何一个单独就不低于 −93 dBm。有一个即可，这一步不允许累加——捕获之前没有时基，也就无法累加。',
      '一个也没有，这一列即判为丢失，整轮到此结束：片段都已到达，但一个也无法打上时间戳。',
      '若有，则进入累加判定：收到几个、每个的电平是多少、累加后是多少、减去灵敏度后还剩多少。两种判定都通过，才有时间戳，才能得出后面的距离。',
    ] },
    { kind: 'table', heading: '这六步在第二块那一轮中的结果', head: [
      '步骤', '锚点这一侧',
    ], rows: [
      ['打开接收窗口，收到的片段', '3, 4, 5, 6, 7'],
      ['是否需要捕获判定', '需要：控制阶段为零'],
      ['无 SFD 时可用作捕获入口的', '只有片段 0'],
      ['该片段是否到达', '未到达，受 Wi-Fi 干扰丢失'],
      ['判定，无 SFD', '整列丢失'],
      ['判定，带 SFD', '以片段 3 捕获，余量 26.5 dB，检出'],
    ] },
    { kind: 'table', heading: '第五个场景：余量不到 0.19 dB 的那条链路（link）', head: [
      '量', '取值',
    ], rows: [
      ['房间与距离', '测距大厅，隔着两道砖墙，5.40 m'],
      ['一个片段到达时', '−92.84 dBm，而灵敏度是 −93 dBm'],
      ['余量', '0.16 dB，比 SFD 的 0.188 dB 还小'],
      ['不置 1', '六组片段每一组都捕获成功，得到十二条时间戳'],
      ['置 1', '六组片段没有一组捕获成功，没有任何接收时间戳'],
    ] },
    { text: '这是这个属性的另一面：它使每个片段的峰值功率降低了 0.188 dB，于是在余量小于这个值的链路上，置 1 之后六轮中没有一轮捕获成功，而不置 1 时每一轮都成功。这个房间里两种设置都得不到距离——SP0 报告比一个片段还差 8.5 dB，在这个距离上无法送达——所以发生变化的是捕获判定及其产生的时间戳。' },
  ],
  deeper: [
    { heading: '为什么置 1 之后两段完全相同', text: '当这个包使用 91 长码或 127 长码，而 RSF 的重复次数又恰好等于包头 SYNC 的前导符号重复数时，SYNC 与 RSF 本来就是同一段序列；那么在每个 RSF 之后附加一个 SFD，得到的就与包头的 SYNC+SFD 完全相同。这不是“另造一个同步头”，而是利用了本来就存在的序列，只缺一个定界符。所以提案给出的两条限制都有依据：码序范围保证序列同源，片段长度 32 或 64 保证重复数一致。而码序那一条在本课中自动满足：9–32 正是长 127（Table 16-8，索引自 9 起）与长 91（Table 16-9，索引至 32）这两族码，排除的是长 31 的几个早期码，而本课的 MMS 分组使用长 91 那一族，4z 一侧使用长 127 那一族。' },
    { heading: '它无法解决的一类失败', text: '这个属性增加的是捕获机会，而不是灵敏度。把两端拉远到每个片段单独都无法检出、只有八个累加后才越过门限的距离上，置 1 同样无效：八个片段仍然都无法用于捕获。这是“捕获与累加是两回事”最清楚的体现——在同一距离上，窄带辅助配置照常测距，UWB 驱动加零长控制阶段一次也测不出，而两者收到的片段完全相同。这也说明了这个属性解决的是哪一类失败：因干扰造成的失败，而不是因电平不足造成的失败。' },
    { heading: '它自身造成的一类失败', text: '还有第二种失败，而且是置 1 本身造成的。片段增加一个 SFD 就长了 5 800 ns，同一份毫秒能量分布到更长的时间上之后峰值低 0.188 dB（片段长度取 32 时是 0.368 dB），而捕获判定比较的正是单个片段的到达电平与 −93 dBm。于是在余量不到 0.188 dB 的链路上，置 1 之后八个片段全部降到门限之下，一个也无法用于捕获——而不置 1 时包头的那一个本来可以捕获。第五个场景就是这条链路：余量 0.16 dB，不置 1 时六轮全部捕获成功，置 1 之后一轮也没有。这是这个属性作用的两个方向：因干扰失败时它能弥补，而余量小于它的代价时它反而导致失败。' },
    { heading: '使用控制阶段时，本课不让它起作用', text: '在本课的模型里，控制阶段包含 SP0 包时，接收机通过收到那个包获得时基，此后像窄带辅助配置那样直接累加，这个属性没有任何可改善之处；这种方式的代价在别处：那个包按 −89 dBm 判定，比片段严格 4 dB（两个数都是本课的取值）。所以本课只在零长控制阶段演示这个属性。这是本课的取法，与提案的前提不同：提案 15-25/0066r1 写于零长控制阶段被提出之前，当时 UWB 驱动配置的每一轮都有 SP0 控制包，而提案仍把包头那个 SYNC+SFD 片段的丢失当作整轮失败的原因，并只说这个属性适用于 UWB 驱动配置，没有把有 SP0 控制包的情形排除在外。' },
  ],
  limits: [
    { kind: 'model-value', text: '`phyUwbMmsRsfSfd` 这个属性在 **2026 年的全部文稿里一次也没有出现**（包括逐页逐行引用 D05 正文的那批意见决议），只出现在 2025 年的 15-25/0066r1 里。也就是说：本课讲解的机制来自一份提案，而公开材料无法确定它是否已纳入草案。这不等于它未被纳入——意见决议只会引用被评论到的部分——但也不能认定它已被纳入。' },
    { kind: 'model-value', text: 'SFD 的时长取的是草案那张捕获对照表里短分组那一格：5 800 ns（也就是 SP0 包自己那个 SFD 的时长）。按标准的推导得出的是 8 个前导符号 × 364 码片 = 5 833 ns，两者差 0.57%，本课取了草案表中的值——同时也是两个数中较短的那个，所以由此算出的代价最小。片段长度、峰值功率与时隙长度都由这一个数得出，长分组那一列（PSR128）本课不采用。' },
    { kind: 'model-value', text: '置 1 之后片段变长，但时间戳的参考点不变：分组的 RMARKER 仍然是片段 0 的第一个脉冲，片段之间仍按起点间隔一毫秒排列，所以从任何一个片段反推 RMARKER 所用的间隔，连一个 RCTU 都没有改变。真实接收机也是这样处理的——SFD 使后面的片段可以用作检测入口，但不改变时间戳的读取位置。若把时间戳读在尾随的 SFD 之后，每个读数就会多出 5 800 ns 的偏置，乘以光速是 1 739 m。' },
    { kind: 'out-of-scope', text: '基准场景与 SFD 场景因此不再是严格的对照实验。十四组片段到达的时刻与个数仍然完全相同，但两列片段的长度差一个 SFD、峰值功率差 0.188 dB，所以“只有判定结果改变”这句话现在只对判定本身成立。真正严格的对照是“把 Wi-Fi 移出这条信道”那一组：两者的片段长度完全相同。' },
    { kind: 'out-of-scope', text: '草案给出的两条置 1 条件，本课的场景只能在片段长度那一条上进行选择。序列码索引在本课中不是可调的量，所以「取 9–32」这一条无法单独演示；但它在本课中自动满足：那个范围就是长 127（Table 16-8）与长 91（Table 16-9）两族码，而本课的 MMS 分组用的正是长 91 那一族，4z 那一侧用的是长 127 那一族。所以本课不会出现码序不满足条件的场景，也无法观察违反这一条时会发生什么。' },
    { kind: 'model-value', text: '「捕获按单个片段判定、不允许累加」与它 −93 dBm 的门限，以及「捕获失败则整轮作废」，都是本课的模型规则，不是草案的条文。草案给的是问题陈述——包首那个片段没收到就没有成功捕获——本课把它实现为一条非此即彼的判据。真实接收机在时基不确定时还有其他手段：更宽的搜索窗、跨片段的非相干累加，而本模型中没有任何中间状态。' },
    { kind: 'out-of-scope', text: '不要把本课理解为「置 1 就足够了」。它带来的只有捕获机会这一项：把两端拉到每个片段单独都无法检出的距离上，八个片段仍然都无法用于捕获。它也不能解决回程问题——那六个距离没有变成十四个，因为 SP0 报告处在同一次干扰之中。而三个变体之所以能把三个原因区分开，依赖于这个房间里只有一路 Wi-Fi 干扰、只有一条测距会话，而且所有设备都静止不动。' },
  ],
  sources: [
    'phyUwbMmsRsfSfd 这个属性、它默认为零、它置 1 的两条条件（序列码索引 9–32 且 RSF 片段长度为 32 或 64）、置 1 后 RSF＋SFD 与包首 SYNC+SFD 完全相同、以及它的问题陈述——包首那个片段没收到就没有成功的信号捕获、整个测距轮失败——全部来自 P802.15.4ab：截至 2026 年 9 月，它的投票稿是 D05，仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 提案文稿 15-25/0066r1；那份文稿是针对 D01 意见的决议提案，这个属性是它提出的修改，之后的文稿里找不到它被采纳的记录。两套控制面配置出自 15-25/0194r0，片段本身与窄带物理层出自 15-23/0100r2，一轮的阶段划分出自 15-22/0381r5。已投票的 D05 可能与之不同。',
    '单位、块与测距时隙（ranging slot）出自 IEEE Std 802.15.4-2024。Wi-Fi 一侧的传播、能量与解调都是本课的模型，不是标准正文。',
    '以下是模型取值：“捕获按单个片段判定、不允许累加”这条规则与它 −93 dBm 的门限；“捕获失败则整轮失败”这条后果；房间的自由空间路径损耗（path loss）与这条 6 GHz 信道的中心频率；以及把一次瞬时功率读数当作干扰判据。置 1 之后 RSF 的长度取的是草案那张捕获对照表里 SFD 那一格（5 800 ns），而标准那条路算出来的是 5 833 ns，本课取了较短的那个；两列片段的长度因此不再相同。',
  ],
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
  observe: [
    '1.131 ms 处写着 “anchor-1 UWB frame from tag-1 lost to Wi-Fi: SIR -30.2 dB (foreign -43.1 dBm)”。干扰信号有 −43.1 dBm，而一个片段只有 −73.28 dBm，相差三十分贝——在这个墙角，Wi-Fi 一发送，这个片段就丢失了。',
    '第一块那一轮恰好未受影响：7.500 ms 与 8.000 ms 两条判定都检出了，5/8 与 6/8，余量 26.7 dB 与 27.5 dB，10.118 ms 标签得出 8.99 m。接着 10.618 ms 标签发出的报告也受干扰丢失，于是锚点一侧只有 11.000 ms 的 “no sp0 from tag-1”。',
    '跳到第一列作废的片段：207.500 ms，“5/8 heard, margin 26.7 dB → lost”。同一行里余量写着 26.7 dB 却判为丢失——把这一行与上一条对照阅读，就是本课的全部内容。',
  ],
  tryThis: [
    '载入“每个 RSF 带 SFD”，再回到 207.500 ms 那一行：收到的还是 5/8，而余量反而低了 0.19 dB（26.5 dB，不是 26.7 dB——正是上面算出的峰值代价），结论却变为检出。再看“窄带辅助（Config 2）”与“把 Wi-Fi 移出这条信道”——前者显示不进行捕获判定时的结果，后者显示没有干扰时的结果。看完四个场景，三个原因就可以区分开：哪些片段可用作捕获入口、是否需要捕获判定、以及是否有干扰打断。最后载入“余量不到 0.19 dB 的那条链路”，在编辑器中关闭“每个 RSF 带 SFD”这个开关再运行一次：同一个房间、同一条链路，六轮的捕获判定会从一组也没有成功变为每一组都成功——那 0.188 dB 的峰值功率就是这个属性的代价。',
  ],
  quiz: [
    {
      q: '一列片段收到五个、余量 26.7 dB，却判了丢失。缺的是什么？',
      options: [
        '缺的是电平：五个片段累加后仍然不够',
        '缺的是捕获入口：可用作捕获入口的只有包头的那一个，而它正是受干扰丢失的三个之一',
        '缺的是报告：锚点没有把时间值发回',
      ],
      answer: 1,
      explain: '累加判定高出门限二十多分贝，轻松通过。使这一列判为丢失的是另一种判定，而它只检查一个片段。',
    },
    {
      q: '在每个 RSF 之后都附加一个 SFD，为什么就能使这一轮成立？',
      options: [
        '片段变长了，所以功率更高',
        '这样每个 RSF 都与包头的 SYNC+SFD 完全相同，于是任何一个都可以用作同步头，捕获机会从一个变为八个',
        '接收机可以把用于捕获的几个片段累加',
      ],
      answer: 1,
      explain: '它增加的是捕获机会，而不是灵敏度——而且片段变长之后峰值功率更低，而不是更高：峰值功率低了 0.188 dB。一列中没有任何一个片段单独达到门限时，置 1 同样无效；余量不到 0.188 dB 时，它反而会导致失败。',
    },
  ],
}
