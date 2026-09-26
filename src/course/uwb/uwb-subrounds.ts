/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Taking turns instead of
 * interleaving: the non-interleaved sub-round, and the two options it unlocks.
 *
 * Interleaved, every device of the round sends one fragment per millisecond, so a millisecond of
 * the ranging phase is R + 1 slots — and at three responders that stretches the gap between two
 * neighbouring fragments of one train to 2 ms, which no legal slot length brings back. The draft's
 * §10.39.7 cuts the round into sub-rounds instead: one device to a sub-round, sending its whole
 * column contiguously, so a millisecond of the phase is a millisecond however many anchors are in
 * the round. The price is the round itself — 86 slots against 38, 43 ms against 19.
 *
 * Two options of the draft ride on that shape and are taught here as its dividend. The **fixed
 * reply time** makes the reply a constant the two ends agreed on, so the responder's REPORT has
 * nothing left to carry and is not sent: in this scene the round drops from two control packets to
 * one, the range appears at the initiator 2.6 ms earlier than the report phase would have allowed,
 * and the uncorrected figure falls from 19.89 m to 3.96 m because the turnaround fell from eleven
 * milliseconds to half of one. **Reversed order** puts the responder's packet first; it ranges
 * correctly now, and the story of what it did before the fix is in `deeper`, marked as history.
 *
 * Every number quoted below is pinned in tests/course/uwb-subrounds.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import type { TimingSpec } from '../diagram'
import {
  MMS_DRAFT_DEFAULTS, MMS_FIXED_REPLY_RSTU_DEFAULT, MMS_SLOTS_PER_MS, mmsLayout, rsfNs,
  type MmsPhy,
} from '../../uwb/mms'
import { rstuNs } from '../../uwb/session'
import {
  J, anchor, firstUwbRange, firstUwbRsf, firstUwbTrain, rangingLab, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/** Which shape the scene runs. */
export type UwbSubroundsVariant = 'base' | 'interleaved' | 'fixed' | 'reversed'

/** Three anchors down the tag's line, at its own height, 3 m apart: the distances are meant to be
 * read straight off the log, and the lesson is about the schedule rather than the geometry. */
export const SUBROUND_ANCHORS: { id: string; name: string; x: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 4 },
  { id: 'anchor-2', name: 'Anchor 2', x: 7 },
  { id: 'anchor-3', name: 'Anchor 3', x: 10 },
]
export const SUBROUND_Z = 1.0
export const SUBROUND_TAG_X = 1
/** The slot every figure in this lesson is counted in: the draft's own 600 RSTU. */
export const SUBROUND_SLOT_RSTU = 600

/**
 * Config 1 with a zero-length control phase — the shape the draft's own non-interleaved figure
 * draws (15-25/0194r0 slide 17), where the packet is its own poll and response and the report phase
 * is all that is left of the control plane. It is also the shape the fixed reply time is worth
 * something in: there is exactly one frame in the round besides the fragments, and that option is
 * what removes it. 4ab draft 15-25/0194r0, 15-25/0292r1
 */
const SHAPE = {
  control: 'uwbd', uwbdControl: 'none', nbChannels: [] as number[], nbLbt: 'off',
} as const

/**
 * The 22 m hall, three anchors and one tag, on the draft's 600 RSTU slot and the session's own
 * train (X = 8 RSFs, no RIF). NLOS off.
 *
 * `base` and `interleaved` are one-to-many, because the fragment gap only parts company between the
 * two shapes when there is more than one responder. `fixed` and `reversed` are non-interleaved like
 * the base; `fixed` has to be pairwise, because the draft carries the reply time in a *one-to-one*
 * Response Compact frame and a shared constant would have every responder answer at the same
 * instant — the schema refuses the combination.
 */
export function uwbSubroundsScenario(variant: UwbSubroundsVariant = 'base'): Scenario {
  const mms = variant === 'interleaved'
    ? { nonInterleaved: false, oneToMany: true }
    : variant === 'fixed'
      ? { nonInterleaved: true, oneToMany: false, fixedReplyRstu: MMS_FIXED_REPLY_RSTU_DEFAULT }
      : { nonInterleaved: true, oneToMany: true, reversedOrder: variant === 'reversed' }
  return uwbSc(
    rangingLab(),
    [
      ...SUBROUND_ANCHORS.map((a) => anchor(a.id, a.name, a.x, 4, SUBROUND_Z)),
      uwbTag('tag-1', 'Tag', SUBROUND_TAG_X, 4, SUBROUND_Z),
    ],
    {
      mode: 'mms', method: 'ss', slotRstu: SUBROUND_SLOT_RSTU, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...SHAPE, ...mms },
    },
  )
}

/** The lesson's own train, as an `MmsPhy`, so the figures come from `mmsLayout` and not from here. */
const SUBROUND_PHY = (nonInterleaved: boolean): MmsPhy => ({
  rsfs: DEFAULT_UWB_SESSION.mms.rsfs, rifs: DEFAULT_UWB_SESSION.mms.rifs,
  nMsr: DEFAULT_UWB_SESSION.mms.nMsr, gap: DEFAULT_UWB_SESSION.mms.gap,
  stsLen: DEFAULT_UWB_SESSION.mms.stsLen, gapMs: DEFAULT_UWB_SESSION.mms.gapMs,
  ...MMS_DRAFT_DEFAULTS, control: 'uwbd', uwbdControl: 'none', nonInterleaved,
})

/** How many responders the scene holds — the number that moves the interleaved fragment gap. */
export const SUBROUND_RESPONDERS = SUBROUND_ANCHORS.length

/**
 * Both shapes of a one-to-many round on one axis, drawn from `mmsLayout` itself: two lanes each —
 * the initiator's column and all three responders' — so the figure shows both differences at once,
 * the gap inside one column and the length of the whole round. Every span is placed at the slot the
 * layout puts it in, so the picture cannot disagree with the schedule the engine runs.
 *
 * Lane labels are kept to four characters because `layoutTiming` caps its gutter; the caption is
 * where 穿插 and 轮流 are tied back to the interleaved and non-interleaved shapes.
 */
export function uwbSubroundsTiming(): TimingSpec {
  const slotUs = rstuNs(SUBROUND_SLOT_RSTU) / 1000
  const lanesFor = (nonInterleaved: boolean, tag: string): TimingSpec['lanes'] => {
    const phy = SUBROUND_PHY(nonInterleaved)
    const l = mmsLayout(phy, SUBROUND_RESPONDERS, MMS_SLOTS_PER_MS)
    const fragUs = rsfNs(phy.nMsr, phy.gap) / 1000
    const column = (side: 'initiator' | 'responder', r: number, accent: boolean) =>
      Array.from({ length: phy.rsfs }, (_, m) => {
        const from = l.fragmentSlot(side, 'rsf', m, r) * slotUs
        return { fromUs: from, toUs: from + fragUs, tone: accent ? ('accent' as const) : undefined }
      })
    return [
      { label: `${tag} 标签`, spans: column('initiator', 0, true) },
      {
        label: `${tag} 锚点`,
        spans: SUBROUND_ANCHORS.flatMap((_a, r) => column('responder', r, false)),
      },
    ]
  }
  const lanes = [...lanesFor(false, '穿插'), ...lanesFor(true, '轮流')]
  const endUs = Math.max(...lanes.flatMap((x) => x.spans.map((s) => s.toUs)))
  const toUs = Math.ceil(endUs / 4000) * 4000
  return {
    kind: 'timing',
    lanes,
    axis: { fromUs: 0, toUs, ticks: [0, toUs / 2, toUs], unit: 'µs' },
  }
}

/** The first fragment an anchor puts on the air — in the non-interleaved round, the moment the
 * second sub-round opens. */
export const firstResponderFragment = (r: TLRecord): boolean =>
  r.type === 'TX_START' && r.frame.kind === 'uwbRsf' && r.node !== 'tag-1'

export const uwbSubrounds: Lesson = {
  id: 'uwb-subrounds',
  module: 21,
  title: '轮流发，还是穿插发',
  why: '到现在为止，一轮多毫秒（multi-millisecond, MMS）测距里两端的片段（fragment）是交错着来的：这一毫秒标签（tag）发一个，下一个时隙锚点（anchor）发一个。房间里只有一个锚点时这样很紧凑，可锚点一多，一毫秒就得摊给更多人——同一列片段里相邻两个的间隔于是被撑开，而这个间隔本该正好是一毫秒。草案给了另一种排法：一方把自己整列发完，再换下一方。这一课要算这笔交易：它换来什么，付出什么。',
  outcomes: [
    '说出两种排法各把一列片段的相邻间隔定成多少，以及是什么定的',
    '把非交织换来的两个选项与它付出的轮次时长放在一起权衡',
    '解释固定回复时间为什么让应答方那个报告整个消失，而距离还在',
  ],
  needs: ['uwb-uwbd', 'uwb-slot-budget'],
  terms: [
    { term: 'non-interleaved sub-round', plain: '非交织子轮：一个子轮里只有一方在发，它把整列片段连着发完，再换下一方' },
    { term: 'macMmsFixedReplyTime', plain: '固定回复时间：两端事先约定的那个间隔，应答方收完对方整个包之后隔这么久再发自己的' },
    { term: 'Reversed MMS order', plain: '反序：把先后调换，应答方先发自己的包，发起方隔 600 RSTU 再发' },
    { term: 'coherence time', plain: '相干时间：信道大致保持不变的那一小段时间；一轮越长，越可能撑到它之外' },
  ],
  picture: [
    { heading: '一毫秒要摊给几个人', text: '交错这种排法里，每台设备每毫秒发一个片段，而一毫秒里要给本轮每一台设备各留一个测距时隙（ranging slot）。一个标签加一个锚点时，一毫秒是两个时隙，正好装得下——同一列里相邻两个片段隔一毫秒，草案的时序也就是照这个写的。加到三个锚点，一毫秒就是四个时隙；在草案那个 600 RSTU（ranging slot time unit）的时隙上，这是两毫秒。而且没有哪个合法的时隙长度能把它拉回来。本课三个场景都跑在超宽带（ultra-wideband, UWB）驱动那套控制面上，控制阶段长度为零，所以一轮里除了片段就只剩报告。' },
    { heading: '换一种排法：一人发完再换人', text: '草案另给了一种形态：把一轮切成几个子轮，每个子轮归一台设备，子轮里只有它在发，它把自己那一列片段连着发完。一个子轮里只有一个发送者，于是“一毫秒是几个时隙”这个问题跟设备台数再没有关系——它只跟时隙长度有关，在 600 RSTU 上就是两个时隙、一毫秒。不管房间里有几个锚点，这个间隔都钉在一毫秒上。' },
    { kind: 'watch', jump: 1, heading: '看第一个锚点开始发它自己那一列', text: '载入仿真，跳到第一个由锚点发出的片段。标签的八个片段在 0 到 7 ms 之间发完，然后整整两毫秒没有人说话，10.000 ms 第一个锚点才开口——这就是子轮的边界。回到交错那个场景再看同一个位置：那里标签与三个锚点在同一毫秒里排着队。' },
    {
      kind: 'diagram', heading: '两种排法，同一把尺子', spec: uwbSubroundsTiming(),
      caption: '上两行是交错那种排法（图里写作“穿插”），下两行是非交织（写作“轮流”）；每一对里深色那行是标签的八个片段，下面那行是三个锚点的二十四个。交错时标签自己相邻两个片段隔两毫秒，一列拉到十四毫秒；非交织时紧成一毫秒一个，一列只占七毫秒，代价是四列排成一队，整轮四十三毫秒。',
    },
    { heading: '它换来的第一样：包自己变短了', text: '一列片段的跨度是个实打实的量。间隔一毫秒时，八个片段从头到尾七毫秒；间隔两毫秒时，同样八个片段要十四毫秒。而每个片段花的都是它自己那一毫秒的能量额度，所以摊在两毫秒里的那一列，等于把一半的额度扔了：同样九分贝的合成增益（combining gain），它用掉了两倍的时间才拿到。此外，一个包越长，就越要指望信道在这段时间里别变——这就是相干时间。' },
    { heading: '它换来的第二样：应答方可以不发那个报告', text: '单边测距要两个时间：发起方量到的往返，和应答方量到的回复时延（reply time）。草案允许把回复时延定成一个两端事先约定的常量——固定回复时间——于是发起方手里本来就有这两个数，应答方那个报告没什么可带的了，索然不发。这个选项只属于非交织形态：它是从“收完对方整个包”那一刻起算的，而这样一个“收完了”的时刻，只有在一方连着发完的排法里才拿得到。' },
    { heading: '它付出的：轮次时长', text: '代价明明白白写在时隙数上。交错一对多：控制阶段零个时隙、测距阶段三十二个、报告阶段六个，一共三十八个，十九毫秒。非交织一对多：四个子轮各二十个时隙，加同样六个报告时隙，一共八十六个，四十三毫秒。一轮长了一倍多，而一块测距只跑一轮，所以同样一块里拿到的距离数少了一半。这条代价连同“受相干时间限制”，是曾经有人提出过的说法——那条意见后来被提出者撤回了，所以它不是草案承认的缺点，只是一份被记下来的账。' },
  ],
  numbers: [
    { kind: 'table', heading: '同一个房间，两种排法', head: [
      '量', '交错，一对多',
      '非交织，一对多',
    ], rows: [
      ['子轮数', '1', '4'],
      ['测距阶段', '32 时隙', '每子轮 20 时隙'],
      ['报告阶段', '6 时隙', '6 时隙'],
      ['一轮', '38 时隙 · 19 ms', '86 时隙 · 43 ms'],
      ['相邻片段的间隔', '4 时隙 · 2 ms', '2 时隙 · 1 ms'],
      ['一列八个片段的跨度', '14 ms', '7 ms'],
      ['每 200 ms 一块的距离数', '6', '6'],
    ] },
    { text: '最后两行要对着读。两种排法在一块里都给出六个距离，因为一块只跑一轮，而两轮都跑得完；非交织真正付出的是那一轮里的空闲——四十三毫秒里，任何一台设备自己在发的时间都只有七毫秒。把块缩短，或者把锚点加多，这笔账立刻就变得难看。' },
    { kind: 'formula', heading: '那个间隔是谁定的', text: '交错：间隔 = (应答方数 + 1) × 时隙 = 4 × 500 µs = 2 000 µs\n非交织：间隔 = ⌈1 200 RSTU / 时隙⌉ × 时隙 = 2 × 500 µs = 1 000 µs', note: '上面一行数的是设备，下面一行数的是毫秒。非交织那个子轮里只有一个发送者，所以设备台数在这里无话可说，剩下的只有“一毫秒是几个时隙”。' },
    { kind: 'table', heading: '固定回复时间，开与不开', head: [
      '量', '不开',
      '开（600 RSTU）',
    ], rows: [
      ['应答方那一列从哪里起算', '自己子轮的边界，第 20 个时隙', '收完对方整个包之后 600 RSTU'],
      ['一轮里的 SP0 包', '2 个', '1 个'],
      ['发起方何时得出距离', '20.118 ms', '17.500 ms'],
      ['没修正过的那个距离', '19.89 m', '3.96 m'],
      ['修正后的距离，真值 3.00 m', '3.01 m', '3.12 m'],
      ['两端都测得出吗', '都测得出', '都测得出'],
    ] },
    { text: '第四行是这个选项顺带买到的东西。掉头时间从十一毫秒缩到半毫秒，于是“不修正时钟就直接算”这个数从十九米掉到不足四米——要修正的东西本来就少了。第五行是它要付的：距离的准头从此取决于那个约定常量本身有多准，而不再取决于应答方量得有多准。' },
    { text: '一件老实话：应答方不发那个报告了，本仿真器却仍然照原样开了那个窗口，并在日志里记下一次超时——“tag-1 UWB slot 40: no sp0 from anchor-1”。距离早在 17.500 ms 就出来了，这条超时是无害的，但它是本模型留下的痕迹，不是草案的规定。' },
    { kind: 'steps', heading: '一个非交织的轮次，一步一步来', items: [
      '发起方不等任何人。它自己那个控制窗口一过就开始发——本课的场景里控制阶段长度为零，所以它从本轮第一个时隙就开始发——把八个片段一毫秒一个连着发完。',
      '应答方反过来：它先收到发起方那个包（或者那句开场话），才开始自己的子轮。交错形态里顺序正好相反，是应答先到、两端预热，然后才有片段上空口。',
      '轮到自己的子轮，应答方也把整列片段连着发完，一毫秒一个。它开始的时刻默认是自己子轮的边界；开了固定回复时间，就改成“收完对方整个包的时刻 + 那个约定常量”。',
      '所有子轮都发完之后是报告阶段，位置不动：草案那张非交织的图把它标成可选的，但没有把它搬走。每个应答方两个窗口——它自己的报告，和发起方对它的回话。',
      '开了固定回复时间，应答方那半个报告不发：发起方手里已经有那个常量，没有东西要传。发起方自己那个报告照发，应答方仍然靠它算出自己那一侧的距离。',
      '最后由手里拿齐两个时间的那一端算出距离，而这两个时间到底是谁量的哪一个，由“谁先发”决定——所以反序把这一对交换了，而不是把它们其中一个去掉。',
    ] },
    { kind: 'table', heading: '这六步，落在本场景上', head: [
      '步骤', '本场景',
    ], rows: [
      ['发起方的第一个片段', '第 0 个时隙 · 0.000 ms'],
      ['一个片段', '40 × 4 × (128 + 2 × 64) = 40 960 chips · 82.051 µs'],
      ['第一个应答方的子轮起点', '第 20 个时隙 · 10.000 ms'],
      ['四个子轮之后', '第 80 个时隙 · 40.000 ms'],
      ['报告阶段', '6 时隙 · 每个 SP0 包 117.6 µs'],
      ['三个距离与它们的真值', '3.01 / 6.01 / 8.91 m，真值 3 / 6 / 9 m'],
    ] },
  ],
  deeper: [
    { heading: '反序：曾经报出六十五公里的那个选项', text: '反序为真时，应答方先把自己那个包发出去，发起方自进入测距阶段起隔 600 RSTU 再发自己的。它今天量得很准——本场景里三个锚点一个不落，误差都在几厘米。但它上一版不是这样：单边测距的两个时间，谁量往返、谁量回复，是由“谁先发”决定的，而代码当时是照角色去读的，于是它向计数器要了一段倒着走的间隔，计数器就把自己整个 2⁴⁰ 的模数交了出来——发起方那一侧报出 65 877.04 m，应答方那一侧 65 898.41 m，而同一条记录里 trueDistM 写着 3。这两个数是修好之前读下来的，今天的仿真里跑不出来；留在这里是因为它们说明了一件事：什么也不产生的功能只是一个缺口，而信心满满地产生一个假数字的功能会一路流到记录和界面上。另外，任何控制阶段在用时，反序原先还会一个距离也测不出：开场的那个应答方要去回应一句还没发生的开场话。' },
    { heading: '草案自己的那张图，和本引擎补的一刀', text: '提案画的例子是三个子轮、四个片段，报告阶段标着“Report（可选）”。它还写明了一件容易忽略的事：发起方不等应答方那个 compact 帧就发 MMS 包，应答方收到之后才开始自己的子轮——这正是上面第一、二步的来处，而本引擎曾经把预热方向弄反，于是布局算得全对、一个距离也测不出。另一条相关意见问过，为什么不把应答方那次窄带发送紧挨在发起方之后；答复是那样会引入更严苛的物理层（physical layer, PHY）性能要求。' },
    { heading: '固定回复时间的取值范围与它的前提', text: '那个常量写在 300 到 612 000 RSTU 之间，约合 0.25 到 510 ms，默认 600 RSTU；下界正好是一个 MMS 测距时隙的最小长度。它还有一个开关属性，默认为假。提案自述的前提有两条：应答方要能准确估计到达时间，而“这在非交织模式的 MMS 包末尾才可能”；它还要能精确控制自己相对那个到达时刻的发送时刻。这个常量可以是双方事先约定的已知值，也可以在一对一的 Response Compact 帧里传——后面这一条正是本引擎拒绝“固定回复时间 + 一对多”的理由：一个共用的常量会让所有应答方在同一个时刻一起开口。至于“固定回复时间 + 反序”，草案把这两位放在同一个八位组里（MMS Number of Fragments Configuration 的第 6 位与第 7 位），并没有禁止同时置位；拒绝它是本仿真器自己的自洽——反序下应答方就是开场先发的那一方，而固定回复时间要的正是“收完对方的包”这个起点。' },
    { heading: '一个不在这条时间轴上的代价', text: '“受信道相干时间限制”这条，本仿真器根本看不见：它没有时变信道，一个四十三毫秒的轮次和一个十九毫秒的轮次在这里衰落得一模一样。所以这一条只能作为读者自己要记的账写在正文里，不能假装建模过。它的来处也要说清楚：提出它的那条意见要求删掉整个 §10.39.7，后来被提出者撤回了，同一条意见里还有一项“造成市场分裂”，那是政策判断，不写进任何地方。' },
  ],
  sources: [
    '非交织子轮的结构（每个子轮 = 控制阶段 + 测距阶段，发起方不等 compact 帧就发包、应答方收到之后才开始自己的子轮）来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 提案文稿 15-25/0292r1；非交织形态下的控制阶段，以及“测距时长更长、受信道相干时间限制”这两条代价，出自 15-25/0331r1 里一条**已被提出者撤回**的意见，因此它们不是草案承认的缺点。已投票的草案可能与之不同。',
    '固定回复时间的两个属性、它 300…612 000 RSTU 的取值范围与 600 RSTU 的默认值、“自收完 MMS 包起算”这条语义、以及“省掉报告里那个回复时延”这个好处，出自 15-25/0224r2；反序、它那 600 RSTU 的偏移、以及承载回复时延的那个一对一 Response Compact 帧，出自 15-25/0556r2。两个位同在一个八位组里（第 6 位与第 7 位）也出自这两篇。控制面的两套配置与零长控制阶段出自 15-25/0194r0，一轮的阶段划分与时隙默认值出自 15-22/0381r5，片段本身出自 15-23/0100r2。',
    '以下是模型取值：非交织子轮里“一毫秒等于几个时隙”这条间隔规则（草案给的是毫秒，把它折成时隙数是本引擎的选择）；交错形态下“一毫秒是应答方数加一个时隙”这个排法；测距阶段二十个时隙的下限；“固定回复时间 + 一对多”与“固定回复时间 + 反序”这两条拒绝，前者依据草案的一对一帧、后者是本仿真器自身的自洽；以及那条无害的超时记录。单位、块与测距时隙出自 IEEE Std 802.15.4-2024。',
  ],
  scenario: () => uwbSubroundsScenario('base'),
  variants: [
    { label: '交错，一对多', scenario: () => uwbSubroundsScenario('interleaved') },
    { label: '固定回复时间', scenario: () => uwbSubroundsScenario('fixed') },
    { label: '反序', scenario: () => uwbSubroundsScenario('reversed') },
  ],
  jumps: [
    J('标签那一列片段的第一个', firstUwbRsf),
    J('第一个锚点开始发它自己那一列', firstResponderFragment),
    J('对端如何判定这一列片段', firstUwbTrain),
    J('轮末得出的第一个距离', firstUwbRange),
  ],
  observe: [
    '0.000 ms 那一行写着 “tag-1 UWB round 0 of block 0 (MMS): 86 slots × 500.0 µs”。换到“交错，一对多”，同一位置是 38 个时隙——两种排法的差别，第一行就印出来了。',
    '三个锚点的判定都落在 7.500 ms，一起完成：标签的那一列只发了一次，三个锚点听的是同一次。而标签自己那三条判定分别在 17.500、27.500、37.500 ms——三个锚点排着队，一个隔十毫秒。',
    '六个距离全挤在 40.118 到 42.618 ms 之间，也就是四个子轮都走完之后的报告阶段里。三个距离依次是 3.01、6.01 与 8.91 m，真值 3、6、9 m。',
  ],
  tryThis: [
    '把“固定回复时间”载入，只盯住两件事：一轮里 SP0 包的个数从两个变成一个，而发起方那个距离从 20.118 ms 提前到 17.500 ms，并且是在报告阶段开始之前就出来的。再顺手读一下那一行里的原始距离——19.89 m 变成 3.96 m，因为掉头时间从十一毫秒缩成了半毫秒。最后载入“反序”，确认三个距离仍在几厘米之内：这是它上一版报出六十五公里的地方。',
  ],
  quiz: [
    {
      q: '三个锚点的一轮里，非交织把同一列片段的相邻间隔定成一毫秒，交错定成两毫秒。是什么定的？',
      options: [
        '时隙长度，两种排法都是',
        '交错里是设备台数——一毫秒要摊给每台设备各一个时隙；非交织的子轮里只有一个发送者，于是只剩时隙长度说话',
        '片段本身的长度',
      ],
      answer: 1,
      explain: '交错是 (应答方数 + 1) × 时隙，非交织是 ⌈1 200 RSTU / 时隙⌉ × 时隙。前者随房间里的锚点数变，后者不变。',
    },
    {
      q: '开了固定回复时间，应答方那个报告整个不发了。发起方拿什么算出距离？',
      options: [
        '它多做了一次往返',
        '回复时延是两端事先约定的常量，它手里本来就有；报告里原本要传的就是这个数',
        '它从片段里直接读出了回复时延',
      ],
      answer: 1,
      explain: '省下的正是那条消息的能量。代价是距离的准头从此取决于那个约定常量有多准。',
    },
  ],
}
