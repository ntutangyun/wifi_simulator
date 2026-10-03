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
  module: 28,
  title: '首片段丢了，整轮就废',
  why: '上一课留下了一个单点：超宽带（ultra-wideband, UWB）驱动那套配置里，接收机的时基只能从包里来，而包里只有一处可以用来开场——包首那一个片段（fragment）。它要是恰好撞上一次干扰，后面七个片段电平再高也没有用，这一轮什么也量不出来。草案为此加了一个属性，把每个测距序列片段（ranging sequence fragment, RSF）后面都补上一个帧起始定界符（start-of-frame delimiter, SFD），于是任何一个片段都能开场。这一课要把这条因果在仿真里跑出来。',
  outcomes: [
    '分清捕获（acquisition）与累加：一条按单个片段判，一条把几个加起来判',
    '说出包首那个片段丢失之后，这一轮还剩下什么',
    '读出开关那个属性前后，同一列片段的两种命运',
  ],
  needs: ['uwb-uwbd', 'uwb-mms-numbers'],
  terms: [
    { term: 'phyUwbMmsRsfSfd', plain: '那个属性的名字：置 1 时每个 RSF 后面都跟一个 SFD' },
    { term: 'SHR', plain: '同步头：包首那段让接收机锁住信号、进而能打时间戳的图案' },
    { term: 'opener', plain: '开场者：这一列里被允许用来找到这个包的那些片段' },
    { term: 'SIR', plain: '信干比：想要的那一帧的电平，减去闯进来那一路的电平' },
  ],
  picture: [
    { heading: '两条判定，读的是同一列片段', text: '一列片段落地之后要过两道关，而它们问的根本不是同一件事。累加那一关问的是“合起来够不够响”：把收到的几个加起来，减去接收机的灵敏度（sensitivity），不为负就算检出。捕获那一关问的是“我到底有没有找到这个包”，它按单个片段判，一个也不许加——因为在找到第一个之前，根本没有时基去摆放第二个。四个低六分贝的片段，可以同时是“累加检出”和“根本没捕获”。' },
    { heading: '而开场的机会只有一个', text: '包首那个片段就是这个包的同步头（SHR）——一段同步字段（SYNC field, SYNC）加上一个 SFD：接收机拿它完成定时同步，此后每一毫秒该在哪里等下一个片段，都是从它数出来的。后面的片段里没有这段图案，它们只是序列。于是这一列有且只有一次开场机会——草案的问题陈述就是这么写的：包首那个片段若因干扰没有收到，就没有成功的信号捕获，整个测距轮（ranging round）失败。' },
    { kind: 'watch', jump: 0, heading: '看一个片段被 Wi-Fi 淹掉', text: '载入仿真，跳到第一个被干扰的片段。那一行写着它的信干比（signal-to-interference ratio, SIR）和闯进来那一路的电平：路由器就在锚点（anchor）墙角，它的 80 MHz 整条压在这条测距信道里，一次猝发过来，这个片段就不存在了。' },
    { heading: '每个 RSF 后面补一个 SFD', text: '草案加的那个属性叫 phyUwbMmsRsfSfd，默认为零。置 1 时，每个 RSF 尾部都跟一个 SFD，于是这个 RSF＋SFD 片段与同一个包里在它之前的那段 SYNC+SFD 完全相同——任何一个都能当同步头用。开场机会从一个变成八个，整轮不再因为首片段丢失而全废。草案给了两条限制：序列码索引（Sequence Code Index）取 9–32，且 RSF 片段长度为 32 或 64。本引擎没有序列码索引这个量，不过那一条在这里是构造上成立的——9–32 正是长 127 与长 91 这两族码，而本引擎这一列片段用的就是长 91 那一族。所以 schema 只校验片段长度那一条；本课的场景把它设成 64，正是为了让这个属性合法。' },
    {
      kind: 'diagram', heading: '同一列片段，两种命运', spec: uwbAcquisitionTiming(),
      caption: '这是本场景第二块那一轮里，标签（tag）的八个片段在锚点处的真实到达情况：前三个被路由器盖掉，后五个完好。中间那一行是无 SFD 时被允许开场的片段——正好是没到的那个。最下面一行是置 1 之后被允许开场的片段。',
    },
    { heading: '它要用峰值功率来换', text: '这不是没有代价的，而且代价算得出来。每个 RSF 尾部多出的那个 SFD 就是多出的那一段码片（chip）：8 个前导符号（preamble symbol），草案那张对照表给的是 5 800 ns，于是片段从 131.282 µs 变成 137.082 µs。而每毫秒的能量是定额，片段变长，峰值功率就按比例降——每个片段低 0.188 dB。一个八片段的列车因此多占 46 400 ns 的空口时间（airtime），一轮的时长却不变：片段按一毫秒的格子排，137 µs 还远在格子里。所以这个属性加的是开场机会，交出去的是每个片段的峰值功率，而片段越短这项代价越大。' },
  ],
  numbers: [
    { kind: 'table', heading: '这个房间', head: [
      '量', '取值',
    ], rows: [
      ['房间', '10 × 8 m，没有内墙'],
      ['锚点与标签相距', '9.00 m'],
      ['路由器与笔记本', '距锚点 1.1 m 与 2.7 m'],
      ['Wi-Fi 信道', '6305 MHz · 80 MHz，整条在测距信道之内'],
      ['一个片段', '64 × 4 × (128 + 2 × 64) = 65 536 码片 · 131.282 µs，带 SFD 时 137.082 µs'],
      ['一个片段到达时', '−73.28 dBm'],
    ] },
    { kind: 'table', heading: '四个场景，同一个房间', head: [
      '场景', '收到的片段',
      '检出', '每 1.3 秒的距离数',
    ], rows: [
      ['零长控制阶段，无 SFD', '5,6,5,2,6,4,6,4,5,6,6,5,6,6', '7 / 14', '3'],
      ['每个 RSF 带 SFD', '一个不差，同样这十四组', '14 / 14', '6'],
      ['窄带辅助（Config 2）', '6,5,6,5,6,6,7,4,5,6,6,6,5,7', '14 / 14', '14'],
      ['把 Wi-Fi 挪出这条信道', '8,8,8,8,8,8,8,8,8,8,8,8,8,8', '14 / 14', '14'],
    ] },
    { text: '头两行读的是同一列片段：十四组到达的时刻、每组收到的个数都一个不差，翻面的只有“谁被允许开场”。但它不再是严格的受控对比——带 SFD 那一列的每个片段长 5 800 ns、峰值低 0.188 dB，到达电平是 −73.47 dBm 而不是 −73.28 dBm。被丢掉的那七组，累加起来的余量在 22.7 到 27.5 dB 之间——没有一组是因为不够响。' },
    { kind: 'table', heading: '这个属性的代价：草案允许的两个片段长度各一行', head: [
      'RSF 片段长度', '片段', '带 SFD', '每个片段的峰值功率',
    ], rows: [
      ['64（本课）', '131.282 µs', '137.082 µs', '−5.500 → −5.688 dBm，低 0.188 dB'],
      ['32', '65.641 µs', '71.441 µs', '−2.490 → −2.858 dBm，低 0.368 dB'],
    ] },
    { text: '每毫秒的能量是定额 37 nJ，所以片段变长峰值功率就按比例降，而草案允许的这两个长度代价并不相同：32 那一行是 64 那一行的两倍。开场机会要用峰值功率来换，片段越短换得越多。' },
    { kind: 'formula', heading: '那七组究竟差在哪', text: '累加：−73.28 dBm + 10·log10(5) = −66.29 dBm ≥ −93 dBm  →  检出\n捕获：单个片段 −73.28 dBm ≥ −93 dBm，但那个片段没有到  →  没有开场', note: '两行读的是同一列片段。上面一行把五个加起来，下面一行只问一个——而下面这一行问的那一个，恰好是被盖掉的三个之一。' },
    { text: '第三行为什么全过：窄带（narrowband, NB）辅助那套从来不问捕获这一关，一问一答已经把时基交给了两端；而且它的控制信道在 5733.75 MHz，离这台路由器很远，所以报告也回得来。它比第二行多出来的那八个距离里，两件事各占一半。' },
    { text: '第二行为什么不是十四个。这一轮的报告是一个 SP0 包，它和片段处在同一场干扰里；让这一列重新能开场，只解决了“有没有时间可报”，没有解决“这个报告能不能到”。真正把两者一起解决的是第四行——把 Wi-Fi 挪出这条信道，十四组片段一个不缺，十四个距离。' },
    { kind: 'steps', heading: '一列片段落地之后，一步一步判', items: [
      '接收机在每个预期有片段到来的时隙开一次窗，收到的记下它的电平与到达时刻，没收到的就当它不存在——这一列里缺了哪几个，从此就缺了哪几个。',
      '先问开场。控制面是窄带辅助时，这一步整个跳过：那一问一答已经预热过了。控制面是 UWB 驱动而控制阶段在用时，时基来自那个 SP0 包，也已经答完了。只有控制阶段为零时，这一步才落在片段上。',
      '被允许开场的是哪些片段，由那个属性决定：默认只有包首那一个，置 1 之后是这一列里的每一个。',
      '在被允许的那些里，问有没有哪一个自己就不低于 −93 dBm。有一个就够了，这一步不许把几个加起来——找到之前没有时基，也就无从累加。',
      '一个也没有，这一列就判丢失，整轮到此为止：片段都在，一个也打不了时间戳。',
      '有，就进累加那一关：收到几个、每个的电平是多少、加起来是多少、减去灵敏度还剩多少。这两关都过了，才有时间戳，才有后面那个距离。',
    ] },
    { kind: 'table', heading: '这六步，落在第二块那一轮上', head: [
      '步骤', '锚点这一侧',
    ], rows: [
      ['开了窗，收到的片段', '3, 4, 5, 6, 7'],
      ['要过开场这一关吗', '要：控制阶段为零'],
      ['无 SFD 时被允许开场的', '只有片段 0'],
      ['那个片段在吗', '不在，被 Wi-Fi 盖掉了'],
      ['判定，无 SFD', '整列丢失'],
      ['判定，带 SFD', '片段 3 开场，余量 26.7 dB，检出'],
    ] },
    { kind: 'table', heading: '第五个场景：余量不到 0.19 dB 的那条链路（link）', head: [
      '量', '取值',
    ], rows: [
      ['房间与距离', '测距大厅，隔着两道砖墙，5.40 m'],
      ['一个片段到达时', '−92.84 dBm，而灵敏度是 −93 dBm'],
      ['余量', '0.16 dB，比 SFD 的 0.188 dB 还小'],
      ['不置 1', '六组片段每一组都有人开场，十二条时间戳'],
      ['置 1', '六组一组也没有人开场，接收时间戳一条也没有'],
    ] },
    { text: '这是这个属性的另一半：它把每个片段的峰值功率降了 0.188 dB，于是在余量不到这个数的链路上，置 1 之后这六轮一轮也没有捕获成功，而不置 1 时每一轮都成功。这个房间里两边都没有距离——SP0 报告比一个片段还差 8.5 dB，这个距离上根本到不了——所以翻面的是捕获判定与它背后的时间戳。' },
  ],
  deeper: [
    { heading: '为什么置 1 之后那两段完全相同', text: '当这个包用 91 长码或 127 长码，而 RSF 的重复次数又正好等于包首那段 SYNC 的前导符号重复数时，SYNC 与 RSF 本来就是同一段图案；那么在每个 RSF 后面补上一个 SFD，得到的就与包首那段 SYNC+SFD 一字不差。这不是“再造一个同步头”，而是发现它本来就在那里，只差一个定界符。所以草案给的两条限制都不是随便挑的：码序范围保证图案同源，片段长度 32 或 64 保证重复数对得上。而码序那一条在本引擎里不必校验，因为它构造上就成立：9–32 正是长 127（Table 16-8，索引自 9 起）与长 91（Table 16-9，索引至 32）这两族码，排除掉的是长 31 那几个老码，而本引擎的 MMS 分组用的是长 91 那一族，4z 那一侧用的是长 127 那一族。' },
    { heading: '它解决不了的那一种', text: '这个属性加的是机会，不是灵敏度。把两端拉远到每个片段单独都听不见、只有八个加起来才越过门限的距离上，置 1 也一样没用：八个片段仍然是八个开不了场的片段。那才是“捕获与累加是两回事”最干净的形态——同一段距离上，窄带辅助那套照常测距，UWB 驱动加零长控制阶段一次也测不出，而两者收到的片段完全相同。它也说明这个属性解决的到底是哪一类失败：被干扰打断的那一类，而不是不够响的那一类。' },
    { heading: '它自己造成的那一种', text: '还有第二种，而且是置 1 本身带来的。片段多了一个 SFD 就长了 5 800 ns，同一份毫秒能量摊开之后峰值低 0.188 dB（片段长度取 32 时是 0.368 dB），而捕获这一关比的正是单个片段的到达电平与 −93 dBm。于是在余量不到 0.188 dB 的链路上，置 1 之后八个片段全部掉到门限之下，一个也开不了场——不置 1 时包首那一个本来是开得了场的。第五个场景就是这条链路：余量 0.16 dB，不置 1 时六轮全部捕获成功，置 1 之后一轮也没有。这是这个属性的两个方向：被干扰打断时它救得回来，而余量比它的代价还薄时它反过来起作用。' },
    { heading: '控制阶段在用时，它一无所得', text: '控制阶段带着 SP0 包时，接收机是靠收到那个包被预热的，此后它照窄带辅助那样盲目累加，这个属性没有任何可改善的东西——那条路上本来就没有“开场机会”可丢，它丢的是别的：那个包按 −89 dBm 判定，比片段苛刻 4 dB。两条路各有自己的代价，这个属性只对付零长那一条。' },
    { heading: '本仿真器在这里还差一条校验', text: '草案允许置 1 的条件有两条，schema 只校验得了片段长度那一条（32 或 64）。另一条——序列码索引取 9–32——本引擎没有这个量，但它不是一处缺口：那个范围就是长 127 与长 91 两族码，而本引擎的 MMS 分组本来就在其中，所以条件构造上成立。真要校验得出来，得先有一个本引擎至今没有理由引入的字段。至于“置 1 之后片段变长、峰值功率变低”，这一条 2026-10-03 已经建进去了，数就在上面那两张表里。' },
  ],
  limits: [
    { kind: 'model-value', text: '`phyUwbMmsRsfSfd` 这个属性在 **2026 年的全部文稿里一次也没有出现**（包括逐页逐行引用 D05 正文的那批意见决议），只出现在 2025 年的 15-25/0066r1 里。意思是：本课教的机制是一份提案，而公开材料定不了它到底有没有进草案。这不等于它没进——意见决议只会引用被评论到的部分——但也不能当成它进了。' },
    { kind: 'model-value', text: 'SFD 的时长取的是草案那张捕获对照表里短分组那一格：5 800 ns（mms.ts 的 MMS_SP0_SEGMENT_NS，也就是 SP0 包自己那个 SFD）。标准那条路算出来的是 8 个前导符号 × 364 码片 = 5 833 ns，两者差 0.57%，引擎取了已经在手里的那一个——同时也是两个数里较短的那个，所以这一刀算出的代价尽可能小。片段长度、峰值功率与时隙长度都从这一个数来（mms.ts 的 rsfAirNs），长分组那一列（PSR128）引擎一向不取。' },
    { kind: 'model-value', text: '置 1 之后片段变长，但没有任何一个计数器跟着动，这是刻意的：分组的 RMARKER 仍然是片段 0 的第一个脉冲，片段之间仍按起点到起点排在一毫秒的格子上，所以 rmarkerFromFragment 走回去用的间隔一个 RCTU 都没变。真实接收机也是这样读的——SFD 让后面的片段能当检测入口，并不改时间戳读在哪里。把它读在尾随 SFD 之后，每个读数就会多 5 800 ns 的偏置，乘光速是 1 739 m。' },
    { kind: 'out-of-scope', text: '基准场景与 SFD 场景因此不再是严格的受控对比。十四组片段到达的时刻与个数仍然完全相同，但两列片段的长度差一个 SFD、峰值功率差 0.188 dB，所以“只有判定翻面”这句话现在只对判定成立。真正干净的对照是“把 Wi-Fi 挪出这条信道”那一个：它两端的片段完全一样长。' },
    { kind: 'out-of-scope', text: '草案给的两条置 1 条件，schema 只校验片段长度那一条。序列码索引这个量在 src 里根本不存在，所以「取 9–32」检查不了；但这一条在本引擎里是构造上成立的，不是一处无从校验的缺口：那个范围就是长 127（Table 16-8）与长 91（Table 16-9）两族码，而本引擎的 MMS 分组用的正是长 91 那一族（mms.ts 的 MMRS_LEN 乘 MMS_SPREAD），4z 那一侧用的是长 127 那一族（phy.ts 的 PSYM_CHIPS = 127 × 4）。所以引擎不会有一个码序对不上的场景，MmsPhy 也不打算加这个字段。' },
    { kind: 'model-value', text: '「捕获按单个片段判、不许累加」与它 −93 dBm 的门限，以及「捕获失败则整轮作废」，都是本引擎写下来的规则（mms.ts 的 acquired，注释里标着 model）。草案给的是问题陈述——包首那个片段没收到就没有成功捕获——引擎把它实现成一条一刀切的判据。真实接收机在时基不确定时还能做一些事：更宽的搜索窗、跨片段的非相干累加，而本模型里没有任何中间态。' },
    { kind: 'out-of-scope', text: '别把这一课读成「置 1 就够了」。它带来的只有开场机会这一项：把两端拉到每个片段单独都听不见的距离上，八个片段仍然是八个开不了场的片段。它也管不到回程——那六个距离没有变成十四个，因为 SP0 报告处在同一场干扰里。而三个变体之所以能把三个原因分开，靠的是这个房间里只有一路 Wi-Fi 干扰、只有一条测距会话，而且谁都不动。' },
  ],
  sources: [
    'phyUwbMmsRsfSfd 这个属性、它默认为零、它置 1 的两条条件（序列码索引 9–32 且 RSF 片段长度为 32 或 64）、置 1 后 RSF＋SFD 与包首 SYNC+SFD 完全相同、以及它的问题陈述——包首那个片段没收到就没有成功的信号捕获、整个测距轮失败——全部来自 P802.15.4ab：截至 2026 年 9 月，它的投票稿是 D05，仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 提案文稿 15-25/0066r1，两套控制面配置出自 15-25/0194r0，片段本身与窄带物理层出自 15-23/0100r2，一轮的阶段划分出自 15-22/0381r5。已投票的 D05 可能与之不同。',
    '单位、块与测距时隙（ranging slot）出自 IEEE Std 802.15.4-2024。Wi-Fi 一侧的传播、能量与解调都是本仿真器自己的模型，不是标准正文。',
    '以下是模型取值：“捕获按单个片段判、不许累加”这条规则与它 −93 dBm 的门限；“捕获失败则整轮失败”这条后果；房间的自由空间路径损耗（path loss）与这条 6 GHz 信道的中心频率；以及把一次瞬时功率读数当作干扰判据。置 1 之后 RSF 的长度取的是草案那张捕获对照表里 SFD 那一格（5 800 ns），而标准那条路算出来的是 5 833 ns，引擎取了较短的那个；两列片段因此不再一样长，这件事写在 limits 里。',
  ],
  scenario: () => uwbAcquisitionScenario('base'),
  variants: [
    { label: '每个 RSF 带 SFD', scenario: () => uwbAcquisitionScenario('sfd') },
    { label: '窄带辅助（Config 2）', scenario: () => uwbAcquisitionScenario('nba') },
    { label: '把 Wi-Fi 挪出这条信道', scenario: () => uwbAcquisitionScenario('clear') },
    { label: '余量不到 0.19 dB 的那条链路', scenario: () => uwbAcquisitionScenario('edge') },
  ],
  jumps: [
    J('第一个被 Wi-Fi 淹掉的片段', firstAcqInterfered),
    J('第一列片段里的第一个', firstUwbRsf),
    J('对端如何判定这一列片段', firstUwbTrain),
    J('第一列因为没人开场而作废的片段', firstUwbTrainLost),
  ],
  observe: [
    '1.131 ms 处写着 “anchor-1 UWB frame from tag-1 lost to Wi-Fi: SIR -30.2 dB (foreign -43.1 dBm)”。闯进来那一路有 −43.1 dBm，而一个片段只有 −73.28 dBm，差了三十分贝——在这个墙角，Wi-Fi 一发送，这个片段就没了。',
    '第一块那一轮恰好没事：7.500 ms 与 8.000 ms 两条判定都检出了，5/8 与 6/8，余量 26.7 dB 与 27.5 dB，10.118 ms 标签得出 8.99 m。接着 10.618 ms 标签那个报告也被淹掉，于是锚点那一侧只剩 11.000 ms 的 “no sp0 from tag-1”。',
    '跳到第一列作废的片段：207.500 ms，“5/8 heard, margin 26.7 dB → lost”。同一行里余量写着 26.7 dB 却判了丢失——把这一行和上一条对照着读，就是这一课的全部。',
  ],
  tryThis: [
    '把“每个 RSF 带 SFD”载入，再回到 207.500 ms 那一行：收到的还是 5/8，余量还是 26.7 dB，结论变成检出。再看“窄带辅助（Config 2）”与“把 Wi-Fi 挪出这条信道”——前者告诉你不问捕获是什么样，后者告诉你没有干扰是什么样。四个场景读下来，三个原因就分得开了：谁被允许开场、要不要开场、以及有没有东西来打断它。最后载入“余量不到 0.19 dB 的那条链路”，在编辑器里把“每个 RSF 带 SFD”这个开关关掉再跑一次：同一个房间、同一条链路，六轮的捕获判定会从一组也没有变成每一组都有——那 0.188 dB 的峰值功率就是这个属性的代价。',
  ],
  quiz: [
    {
      q: '一列片段收到五个、余量 26.7 dB，却判了丢失。缺的是什么？',
      options: [
        '缺的是响度：五个加起来还不够',
        '缺的是开场：被允许开场的只有包首那一个，而它正是被盖掉的三个之一',
        '缺的是报告：锚点没把时间发回来',
      ],
      answer: 1,
      explain: '累加那一关高出门限二十多分贝，过得很轻松。判死这一列的是另一关，而它只看一个片段。',
    },
    {
      q: '把每个 RSF 后面都补上一个 SFD，为什么就能让这一轮成立？',
      options: [
        '片段变长了，所以更响',
        '这样每个 RSF 都与包首那段 SYNC+SFD 完全相同，于是任何一个都能当同步头，开场机会从一个变成八个',
        '接收机可以把开场用的那几个片段加起来',
      ],
      answer: 1,
      explain: '它加的是机会，不是灵敏度——而且片段变长之后更轻，不是更响：峰值功率低了 0.188 dB。一列里没有任何一个片段自己过线时，置 1 一样没有用；余量不到 0.188 dB 时，它还会反过来起作用。',
    },
  ],
}
