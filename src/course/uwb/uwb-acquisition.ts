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
 * The scene is a controlled experiment, and deliberately so: a 6 GHz router inside UWB channel 5's
 * band sits beside the anchor and shoots holes in the fragment column, and the SFD attribute
 * changes nothing at all on the air — the engine does not model the extra chips (see `sources`), so
 * the same fourteen trains arrive with the same fragments missing in both runs. Seven of the
 * fourteen are thrown away without it and none with it, and every one of the seven had 22 to 27 dB
 * of combining margin. The ranges go from three to six; they do not go to fourteen, because the SP0
 * REPORT is in the same interference, and the lesson says so.
 *
 * Every number quoted below is pinned in tests/course/uwb-acquisition.test.ts.
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
export type UwbAcquisitionVariant = 'base' | 'sfd' | 'nba' | 'clear'

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

/**
 * Which fragments of the tag's column reached the anchor in the round of block 1 — indices 3 to 7,
 * the first three lost to the router — and what each of the two settings does with that column.
 * The indices are read off the run and pinned in the test, so the figure cannot drift from it.
 */
export const ACQ_HEARD: readonly number[] = [3, 4, 5, 6, 7]

/** The same column of fragments, and the two fates the SFD attribute decides between. */
export function uwbAcquisitionTiming(): TimingSpec {
  const fragUs = rsfNs(ACQ_N_MSR, DEFAULT_UWB_SESSION.mms.gap) / 1000
  const span = (i: number, tone?: 'plain' | 'accent' | 'muted') =>
    ({ fromUs: i * 1000, toUs: i * 1000 + fragUs, tone })
  const all = [0, 1, 2, 3, 4, 5, 6, 7]
  return {
    kind: 'timing',
    lanes: [
      { label: '到达', spans: all.map((i) => span(i, ACQ_HEARD.includes(i) ? 'plain' : 'muted')) },
      { label: '无 SFD', spans: [{ ...span(0, 'muted'), label: '只有这一个' }] },
      { label: '带 SFD', spans: ACQ_HEARD.map((i) => span(i, 'accent')) },
    ],
    axis: { fromUs: 0, toUs: 8200, ticks: [0, 2000, 4000, 6000, 8000], unit: 'µs' },
  }
}

export const uwbAcquisition: Lesson = {
  id: 'uwb-acquisition',
  module: 21,
  title: '首片段丢了，整轮就废',
  why: '上一课留下了一个单点：超宽带（ultra-wideband, UWB）驱动那套配置里，接收机的时基只能从包里来，而包里只有一处可以用来开场——包首那一个片段（fragment）。它要是恰好撞上一次干扰，后面七个片段再响也没有用，这一轮什么也量不出来。草案为此加了一个属性，把每个测距序列片段（ranging sequence fragment, RSF）后面都补上一个帧起始定界符（start-of-frame delimiter, SFD），于是任何一个片段都能开场。这一课要把这条因果在仿真里跑出来。',
  outcomes: [
    '分清捕获与累加：一条按单个片段判，一条把几个加起来判',
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
    { heading: '两条判定，读的是同一列片段', text: '一列片段落地之后要过两道关，而它们问的根本不是同一件事。累加那一关问的是“合起来够不够响”：把收到的几个加起来，减去接收机的灵敏度（sensitivity），不为负就算检出。捕获那一关问的是“我到底有没有找到这个包”，它按单个片段判，一个也不许加——因为在找到第一个之前，根本没有时基去摆放第二个。四个低六分贝的片段，可以同时是“累加检出”和“压根没捕获”。' },
    { heading: '而开场的机会只有一个', text: '包首那个片段就是这个包的同步头（SHR）——一段同步字段（SYNC field, SYNC）加上一个 SFD：接收机拿它锁住节拍，此后每一毫秒该在哪里等下一个片段，都是从它数出来的。后面的片段里没有这段图案，它们只是序列。于是这一列有且只有一次开场机会——草案的问题陈述就是这么写的：包首那个片段若因干扰没有收到，就没有成功的信号捕获，整个测距轮（ranging round）失败。' },
    { kind: 'watch', jump: 0, heading: '看一个片段被 Wi-Fi 淹掉', text: '载入仿真，跳到第一个被干扰的片段。那一行写着它的信干比（signal-to-interference ratio, SIR）和闯进来那一路的电平：路由器就在锚点（anchor）墙角，它的 80 MHz 整条压在这条测距信道里，一次猝发盖过去，这个片段就不存在了。' },
    { heading: '每个 RSF 后面补一个 SFD', text: '草案加的那个属性叫 phyUwbMmsRsfSfd，默认为零。置 1 时，每个 RSF 尾部都跟一个 SFD，于是这个 RSF＋SFD 片段与同一个包里在它之前的那段 SYNC+SFD 完全相同——任何一个都能当同步头用。开场机会从一个变成八个，整轮不再因为首片段丢失而全废。草案给了两条限制：序列码索引（Sequence Code Index）取 9–32，且 RSF 片段长度为 32 或 64。本引擎没有序列码索引这个量，所以只校验后一条；本课的场景把片段长度设成 64，正是为了让这个属性合法。' },
    {
      kind: 'diagram', heading: '同一列片段，两种命运', spec: uwbAcquisitionTiming(),
      caption: '这是本场景第二块那一轮里，标签（tag）的八个片段在锚点处的真实到达情况：前三个被路由器盖掉，后五个完好。中间那一行是无 SFD 时被允许开场的片段——正好是没到的那个。最下面一行是置 1 之后被允许开场的片段。',
    },
    { heading: '它要付的空口时间（airtime）', text: '这不是白拿的。每个 RSF 尾部多出一个 SFD，就多出那么多码片（chip）：片段变长，同一份毫秒能量摊得更薄，于是每个片段的峰值功率略低，整轮的空口时间（airtime）也更长。本仿真器没有把这段码片加进片段长度——它只改“谁能开场”这一条——所以下面那张表里两列的片段长度完全一样，这是一个需要读者自己补上的代价，不是仿真出来的结论。' },
  ],
  numbers: [
    { kind: 'table', heading: '这个房间', head: [
      '量', '取值',
    ], rows: [
      ['房间', '10 × 8 m，没有内墙'],
      ['锚点与标签相距', '9.00 m'],
      ['路由器与笔记本', '距锚点 1.1 m 与 2.7 m'],
      ['Wi-Fi 信道', '6305 MHz · 80 MHz，整条在测距信道之内'],
      ['一个片段', '64 × 4 × (128 + 2 × 64) = 65 536 码片 · 131.282 µs'],
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
    { text: '头两行是一次受控对比：空口上一个比特也没变，收到的片段一个不多一个不少，翻面的只有“谁被允许开场”。被丢掉的那七组，累加起来的余量在 22.7 到 27.5 dB 之间——没有一组是因为不够响。' },
    { kind: 'formula', heading: '那七组究竟差在哪', text: '累加：−73.28 dBm + 10·log10(5) = −66.29 dBm ≥ −93 dBm  →  检出\n捕获：单个片段 −73.28 dBm ≥ −93 dBm，但那个片段没有到  →  没有开场', note: '两行读的是同一列片段。上面一行把五个加起来，下面一行只问一个——而下面这一行问的那一个，恰好是被盖掉的三个之一。' },
    { text: '第三行为什么全过：窄带（narrowband, NB）辅助那套从来不问捕获这一关，一问一答已经把时基交给了两端；而且它的控制信道在 5733.75 MHz，离这台路由器很远，所以报告也回得来。它比第二行多出来的那八个距离里，两件事各占一半。' },
    { text: '第二行为什么不是十四个。这一轮的报告是一个 SP0 包，它和片段泡在同一场干扰里；把开场救回来，只救回了“有没有时间可报”，没有救回“这个报告能不能到”。真正把两者一起解决的是第四行——把 Wi-Fi 挪出这条信道，十四组片段一个不缺，十四个距离。' },
    { kind: 'steps', heading: '一列片段落地之后，一步一步判', items: [
      '接收机在每个预期有片段到来的时隙开一次窗，收到的记下它的电平与到达时刻，没收到的就当它不存在——这一列里缺了哪几个，从此就缺了哪几个。',
      '先问开场。控制面是窄带辅助时，这一步整个跳过：那一问一答已经预热过了。控制面是 UWB 驱动而控制阶段在用时，时基来自那个 SP0 包，也已经答完了。只有控制阶段为零时，这一步才落在片段上。',
      '被允许开场的是哪些片段，由那个属性决定：默认只有包首那一个，置 1 之后是这一列里的每一个。',
      '在被允许的那些里，问有没有哪一个自己就不低于 −93 dBm。有一个就够了，这一步不许把几个加起来——找到之前没有时基，也就无从累加。',
      '一个也没有，这一列就判丢失，整轮到此为止：片段都在，一个也打不了时间戳。',
      '有，就进累加那一关：收到几个、每个多响、加起来是多少、减去灵敏度还剩多少。这两关都过了，才有时间戳，才有后面那个距离。',
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
  ],
  deeper: [
    { heading: '为什么置 1 之后那两段完全相同', text: '当这个包用 91 长码或 127 长码，而 RSF 的重复次数又正好等于包首那段 SYNC 的前导符号重复数时，SYNC 与 RSF 本来就是同一段图案；那么在每个 RSF 后面补上一个 SFD，得到的就与包首那段 SYNC+SFD 一字不差。这不是“再造一个同步头”，而是发现它本来就在那里，只差一个定界符。所以草案给的两条限制都不是随便挑的：码序范围保证图案同源，片段长度 32 或 64 保证重复数对得上。' },
    { heading: '救不回来的那一种', text: '这个属性加的是机会，不是灵敏度。把两端拉远到每个片段单独都听不见、只有八个加起来才越过门限的距离上，置 1 也一样没用：八个片段仍然是八个开不了场的片段。那才是“捕获与累加是两回事”最干净的形态——同一段距离上，窄带辅助那套照常测距，UWB 驱动加零长控制阶段一次也测不出，而两者收到的片段完全相同。它也说明这个属性解决的到底是哪一类失败：被干扰打断的那一类，而不是不够响的那一类。' },
    { heading: '控制阶段在用时，它一无所得', text: '控制阶段带着 SP0 包时，接收机是靠收到那个包被预热的，此后它照窄带辅助那样闭眼累加，这个属性没有任何可救的东西——那条路上本来就没有“开场机会”可丢，它丢的是别的：那个包按 −89 dBm 判定，比片段苛刻 4 dB。两条路各有自己的代价，这个属性只对付零长那一条。' },
    { heading: '本仿真器在这里的两处不完整', text: '第一，草案允许置 1 的条件有两条，本引擎只校验得了片段长度那一条，因为它没有序列码索引这个量；哪天引擎引入了，这条校验要补上。第二，置 1 之后每个 RSF 应当变长，本引擎没有把 SFD 的码片加进去，所以“空口时间变长、峰值功率略低”这个代价在仿真里看不见。两处都是已知的不完整，写在这里而不是留在代码注释里，因为读者会照着这个场景去数空口时间。' },
  ],
  sources: [
    'phyUwbMmsRsfSfd 这个属性、它默认为零、它置 1 的两条条件（序列码索引 9–32 且 RSF 片段长度为 32 或 64）、置 1 后 RSF＋SFD 与包首 SYNC+SFD 完全相同、以及它的问题陈述——包首那个片段没收到就没有成功的信号捕获、整个测距轮失败——全部来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 提案文稿 15-25/0066r1，两套控制面配置出自 15-25/0194r0，片段本身与窄带物理层出自 15-23/0100r2，一轮的阶段划分出自 15-22/0381r5。已投票的草案可能与之不同。',
    '单位、块与测距时隙（ranging slot）出自 IEEE Std 802.15.4-2024。Wi-Fi 一侧的传播、能量与解调都是本仿真器自己的模型，不是标准正文。',
    '以下是模型取值：“捕获按单个片段判、不许累加”这条规则与它 −93 dBm 的门限；“捕获失败则整轮失败”这条后果；房间的自由空间路径损耗（path loss）与这条 6 GHz 信道的中心频率；以及把一次瞬时功率读数当作干扰判据。特别注意：置 1 之后 RSF 变长这件事本引擎没有建模，所以两列片段的长度在仿真里完全相同——这是有意保留的受控对比，也是一处已知的不完整。',
  ],
  scenario: () => uwbAcquisitionScenario('base'),
  variants: [
    { label: '每个 RSF 带 SFD', scenario: () => uwbAcquisitionScenario('sfd') },
    { label: '窄带辅助（Config 2）', scenario: () => uwbAcquisitionScenario('nba') },
    { label: '把 Wi-Fi 挪出这条信道', scenario: () => uwbAcquisitionScenario('clear') },
  ],
  jumps: [
    J('第一个被 Wi-Fi 淹掉的片段', firstAcqInterfered),
    J('第一列片段里的第一个', firstUwbRsf),
    J('对端如何判定这一列片段', firstUwbTrain),
    J('第一列因为没人开场而作废的片段', firstUwbTrainLost),
  ],
  observe: [
    '1.131 ms 处写着 “anchor-1 UWB frame from tag-1 lost to Wi-Fi: SIR -30.2 dB (foreign -43.1 dBm)”。闯进来那一路有 −43.1 dBm，而一个片段只有 −73.28 dBm，差了三十分贝——在这个墙角，Wi-Fi 一开口，这个片段就没了。',
    '第一块那一轮运气不错：7.500 ms 与 8.000 ms 两条判定都检出了，5/8 与 6/8，余量 26.7 dB 与 27.5 dB，10.118 ms 标签得出 8.99 m。接着 10.618 ms 标签那个报告也被淹掉，于是锚点那一侧只剩 11.000 ms 的 “no sp0 from tag-1”。',
    '跳到第一列作废的片段：207.500 ms，“5/8 heard, margin 26.7 dB → lost”。同一行里余量写着 26.7 dB 却判了丢失——把这一行和上一条对照着读，就是这一课的全部。',
  ],
  tryThis: [
    '把“每个 RSF 带 SFD”载入，再回到 207.500 ms 那一行：收到的还是 5/8，余量还是 26.7 dB，结论变成检出。再看“窄带辅助（Config 2）”与“把 Wi-Fi 挪出这条信道”——前者告诉你不问捕获是什么样，后者告诉你没有干扰是什么样。四个场景读下来，三个原因就分得开了：谁被允许开场、要不要开场、以及有没有东西来打断它。',
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
      q: '把每个 RSF 后面都补上一个 SFD，为什么就能救回来？',
      options: [
        '片段变长了，所以更响',
        '这样每个 RSF 都与包首那段 SYNC+SFD 完全相同，于是任何一个都能当同步头，开场机会从一个变成八个',
        '接收机可以把开场用的那几个片段加起来',
      ],
      answer: 1,
      explain: '它加的是机会，不是灵敏度。一列里没有任何一个片段自己够得着时，置 1 也一样救不回来。',
    },
  ],
}
