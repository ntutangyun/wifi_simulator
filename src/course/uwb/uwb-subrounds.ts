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
  module: 30,
  title: '轮流发送，还是穿插发送',
  why: '到目前为止，一轮多毫秒（multi-millisecond, MMS）测距中两端的片段（fragment）是交错发送的：这一毫秒内标签（tag）发送一个，下一个时隙锚点（anchor）发送一个。交错发送时，每一毫秒要为本轮每台设备各预留一个测距时隙（ranging slot），所以同一列中相邻两个片段的间隔由设备台数决定：只有一个锚点时正好一毫秒，三个锚点就增大到两毫秒，任何合法的时隙长度都无法把它缩短回来。八个片段的一列于是从七毫秒延长到十四毫秒——同样的合成增益（combining gain），要用两倍的时间才能获得，相当于浪费了一半的能量额度。草案给出的另一种排法是非交织子轮：一方把自己的一列片段连续发完，再轮到下一方。子轮中只有一个发送者，间隔就只由时隙长度决定，无论房间里有几个锚点，都固定为一毫秒。这种排法还带来一个专属的选项，固定回复时间：把回复时延（reply time）设为两端事先约定的常量，从接收完对方整个包的时刻起算，于是发起方本来就掌握两个时间值，应答方的报告完全不必发送，距离仍然可以算出，而且得出得更早；代价是距离的准确度从此取决于那个常量本身的准确度。它的代价是轮次时长：四列片段依次排列，一轮的时长增加一倍多，而任何一台设备自身的发送只占其中一小段。在本课每块只运行一轮的场景中，两种排法每块得到的距离数相同；一旦块缩短或锚点增多，这一代价就会显现。',
  outcomes: [
    '说出两种排法下一列片段的相邻间隔各是多少，以及由什么决定',
    '权衡非交织排法带来的两项好处与它增加的轮次时长',
    '解释为什么启用固定回复时间后，应答方的报告可以完全省去，而距离仍能算出',
  ],
  needs: ['uwb-uwbd', 'uwb-slot-budget'],
  terms: [
    { term: 'non-interleaved sub-round', plain: '非交织子轮：一个子轮中只有一方发送，它把整列片段连续发完，再轮到下一方' },
    { term: 'macMmsFixedReplyTime', plain: '固定回复时间：两端事先约定的间隔，应答方在接收完对方整个包之后，经过这一间隔再发送自己的包' },
    { term: 'Reversed MMS order', plain: '反序：调换发送顺序，应答方先发送自己的包，发起方隔 600 RSTU 再发送' },
    { term: 'coherence time', plain: '相干时间：信道基本保持不变的时间长度；一轮越长，越可能超出这一时间' },
  ],
  picture: [
    { heading: '一毫秒要分配给几台设备', text: '在交错排法中，每台设备每毫秒发送一个片段，而每一毫秒内要为本轮每一台设备各预留一个测距时隙（ranging slot）。一个标签加一个锚点时，一毫秒是两个时隙，正好容纳得下——同一列中相邻两个片段间隔一毫秒，草案的时序也是按此编写的。增加到三个锚点，一毫秒就是四个时隙；在草案 600 RSTU（ranging slot time unit）的时隙上，这实际是两毫秒。而且任何合法的时隙长度都无法把它缩短回来。本课三个场景都运行在超宽带（ultra-wideband, UWB）驱动的控制面上，控制阶段长度为零，所以一轮中除了片段就只有报告。' },
    { heading: '另一种排法：一方发完再轮到下一方', text: '草案还给出另一种形态：把一轮分成几个子轮，每个子轮属于一台设备，子轮中只有它发送，它把自己的一列片段连续发完。一个子轮中只有一个发送者，于是“一毫秒是几个时隙”这个问题与设备台数不再有关——它只与时隙长度有关，在 600 RSTU 上就是两个时隙、一毫秒。无论房间里有几个锚点，这个间隔都固定为一毫秒。' },
    { kind: 'watch', jump: 1, heading: '观察第一个锚点开始发送自己的一列片段', text: '载入仿真，跳到第一个由锚点发出的片段。标签的八个片段在 0 到 7 ms 之间发完，然后整整两毫秒没有任何设备发送，10.000 ms 第一个锚点才开始发送——这就是子轮的边界。回到交错场景再看同一位置：那里标签与三个锚点在同一毫秒内依次发送。' },
    {
      kind: 'diagram', heading: '两种排法，按同一时间刻度绘制', spec: uwbSubroundsTiming(),
      caption: '上两行是交错排法（图中标为“穿插”），下两行是非交织排法（标为“轮流”）；每一对中深色那行是标签的八个片段，下面那行是三个锚点的二十四个片段。交错时标签自身相邻两个片段间隔两毫秒，一列延长到十四毫秒；非交织时缩短为一毫秒一个，一列只占七毫秒，代价是四列依次排列，整轮四十三毫秒。',
    },
    { heading: '第一项好处：包本身变短', text: '一列片段的跨度是一个实际的物理量。间隔一毫秒时，八个片段从头到尾七毫秒；间隔两毫秒时，同样八个片段要十四毫秒。而每个片段使用的都是它自己那一毫秒的能量额度，所以以两毫秒间隔发送的那一列，相当于浪费了一半的额度：同样九分贝的合成增益（combining gain），它用了两倍的时间才获得。此外，一个包越长，就越依赖信道在这段时间内保持不变——这就涉及相干时间。' },
    { heading: '第二项好处：应答方可以不发送报告', text: '单边测距需要两个时间：发起方测得的往返时间，和应答方测得的回复时延（reply time）。草案允许把回复时延设为一个两端事先约定的常量——固定回复时间——于是发起方本来就掌握这两个数，应答方的报告没有需要传送的内容，因此不再发送。这个选项只适用于非交织形态：它从“接收完对方整个包”的时刻起算，而这样一个“接收完毕”的时刻，只有在一方连续发完的排法中才能得到。' },
    { heading: '代价：轮次时长', text: '代价直接体现在时隙数上。交错一对多：控制阶段零个时隙、测距阶段三十二个、报告阶段六个，合计三十八个，十九毫秒。非交织一对多：四个子轮各二十个时隙，加同样六个报告时隙，合计八十六个，四十三毫秒。一轮的时长增加一倍多。有人据此认为同样一块中得到的距离数会减少一半，但在本课的场景中并非如此：每块只运行一轮，两种排法的那一轮都能完成，每块得到的距离数相同；只有块短到容纳不下那一轮，或者锚点多到使它更长，代价才会体现在距离数上。“距离数减半”以及“受相干时间限制”，是曾有人提出的说法——那条意见后来被提出者撤回，所以它不是草案承认的缺点，只是一项被记录下来的代价。' },
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
      ['每个 200 ms 块的距离数', '6', '6'],
    ] },
    { text: '最后两行要对照阅读。两种排法在一块中都给出六个距离，因为每块只运行一轮，而两种轮次都能完成；非交织真正的代价是那一轮中的空闲时间——四十三毫秒中，任何一台设备自身的发送时间都只有七毫秒。缩短块长，或者增加锚点，这一代价就会立即显现。' },
    { kind: 'formula', heading: '间隔由什么决定', text: '交错：间隔 = (应答方数 + 1) × 时隙 = 4 × 500 µs = 2 000 µs\n非交织：间隔 = ⌈1 200 RSTU / 时隙⌉ × 时隙 = 2 × 500 µs = 1 000 µs', note: '上面一行按设备数计算，下面一行按毫秒计算。非交织的子轮中只有一个发送者，所以设备台数在这里不起作用，只剩下“一毫秒是几个时隙”。这两条换算是本课的排法：草案给出的是毫秒，没有规定换算成几个时隙。' },
    { kind: 'table', heading: '固定回复时间：启用与不启用', head: [
      '量', '不启用',
      '启用（600 RSTU）',
    ], rows: [
      ['应答方的一列片段从何时起算', '自身子轮的边界，第 20 个时隙', '接收完对方整个包之后 600 RSTU'],
      ['一轮中的 SP0 包', '2 个', '1 个'],
      ['发起方何时得出距离', '20.118 ms', '17.500 ms'],
      ['未经修正的距离', '19.89 m', '3.96 m'],
      ['修正后的距离，真值 3.00 m', '3.01 m', '3.12 m'],
      ['两端能否都测得距离', '都能测得', '都能测得'],
    ] },
    { text: '第四行是这个选项附带的效果。回复时延从十一毫秒缩短到半毫秒，于是“不修正时钟直接计算”得到的数从十九米降到不足四米——需要修正的误差本来就小了。第五行是它的代价：距离的准确度从此取决于那个约定常量本身的准确度，而不再取决于应答方的测量精度。' },
    { text: '需要如实说明的一点：应答方不再发送报告，发起方却仍然照常打开了那个接收窗口，日志中因此出现一次超时——“tag-1 UWB slot 40: no sp0 from anchor-1”。距离早在 17.500 ms 就出来了，这条超时不影响任何数字；打开这个窗口是本课模型的做法，不是草案的规定。' },
    { kind: 'steps', heading: '一个非交织轮次的步骤', items: [
      '发起方不等待任何设备。它自己的控制窗口一结束就开始发送——本课的场景中控制阶段长度为零，所以它从本轮第一个时隙就开始发送——每毫秒一个，连续发完八个片段。',
      '应答方则相反：它先收到发起方的包（或发起消息），才开始自己的子轮。交错形态中顺序正好相反，是先完成应答、两端准备就绪，然后才有片段发送到空口上。',
      '轮到自己的子轮时，应答方也把整列片段连续发完，每毫秒一个。它的起始时刻默认是自身子轮的边界；启用固定回复时间后，改为“接收完对方整个包的时刻 + 约定常量”。',
      '所有子轮都发完之后是报告阶段，位置不变：草案的非交织示意图把它标为可选，但没有移除它。每个应答方有两个窗口——它自己的报告，以及发起方发给它的报告。',
      '启用固定回复时间后，应答方的那一半报告不再发送：发起方已经掌握那个常量，没有需要传送的内容。发起方自己的报告仍照常发送，应答方仍然依靠它算出自己一侧的距离。',
      '最后由掌握两个时间值的一端算出距离，而这两个时间分别由哪一端测量，由“谁先发送”决定——所以反序交换了这两个时间的测量方，而不是去掉其中一个。',
    ] },
    { kind: 'table', heading: '这六步在本场景中的取值', head: [
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
    { heading: '反序：先发送的一方测量往返时间', text: '反序为真时，应答方先发送自己的包，发起方自进入测距阶段起隔 600 RSTU 再发送自己的包。本场景中三个锚点全部测得距离，误差都在几厘米以内。需要注意的是两个时间的归属：单边测距的两个时间，由哪一端测量往返、哪一端测量回复，是由“谁先发送”决定的，而不是由角色决定的。反序下先发送的是应答方，所以测量往返时间的是应答方，测量回复时延的是发起方。如果仍按角色读取，得到的就是一段先后颠倒的间隔，算出的也就不再是两端之间的距离。所以反序交换的是这两个时间的测量方，测距的算式本身没有变。' },
    { heading: '草案中的示意图', text: '提案给出的例子是三个子轮、四个片段，报告阶段标着“Report（可选）”。它还写明了一个容易忽略的细节：发起方不等待应答方的 compact 帧就发送 MMS 包，应答方收到之后才开始自己的子轮——这正是上面第一、二步的依据。另一条相关意见曾问，为什么不把应答方的那次窄带发送紧接在发起方之后；答复是那样会引入更严格的物理层（physical layer, PHY）性能要求。' },
    { heading: '固定回复时间的取值范围与前提条件', text: '这个常量的取值范围是 300 到 612 000 RSTU，约合 0.25 到 510 ms，默认 600 RSTU；下界正好是一个 MMS 测距时隙的最小长度。它还有一个开关属性，默认为假。提案自述的前提有两条：应答方要能准确估计到达时间，而“这在非交织模式的 MMS 包末尾才可能”；它还要能精确控制自己相对于该到达时刻的发送时刻。这个常量可以是双方事先约定的已知值，也可以在一对一的 Response Compact 帧中传送——后一种方式正是本课不把“固定回复时间”与“一对多”合用的理由：一个共用的常量会使所有应答方在同一时刻同时发送。至于“固定回复时间 + 反序”，草案把这两位放在同一个八位组里（MMS Number of Fragments Configuration 的第 6 位与第 7 位），并没有禁止同时置位；本课不合用这两项，是出于自洽而不是草案的规定——反序下应答方就是首先发送的一方，而固定回复时间需要的正是“接收完对方的包”这个起点。' },
    { heading: '一项在时间轴上看不到的代价', text: '“受信道相干时间限制”这一条，在本课的数字中看不出来：本课的 UWB 信道不随时间变化，一个四十三毫秒的轮次和一个十九毫秒的轮次在这里经历的信道完全相同。所以这一条只能作为读者需要自行记住的代价写在正文中，本课的运行无法验证它。它的出处也要说明：提出它的那条意见要求删除整个 §10.39.7，后来被提出者撤回，同一条意见中还有一项“造成市场分裂”，那是政策判断，本课不予收录。' },
  ],
  limits: [
    { kind: 'out-of-scope', text: '除了上一条说的三子轮形态，草案里还有一种**四子轮**的非交织双边双向（§10.39.7.2.4，见 15-26/0184r1 与 15-25/0583r1），而 15-26/0184r1 正在提议删除它。本课两种都不包含：非交织在这里只有单边双向这一种形态。' },
    { kind: 'model-value', text: '固定回复时间本身**不是 4ab 的发明**：「SS-TWR with fixed reply time」已经是已发布的 IEEE Std 802.15.4-2024 §10.29.6.5。提案所做的是把它**扩展到 MMS**。但更重要的一点是：`macMmsFixedReplyTime` 与 Reversed MMS order 这两个名字在 **2026 年的全部文稿里一次也没有出现**（包括逐页逐行引用 D05 正文的那批意见决议），只出现在 2025 年的提案里，而那几次讨论都以「需要更多线下讨论」结束。所以本课实现的是一份**无法确认是否已纳入草案**的提案，这与其他 4ab 课的地位不同，阅读时需要注意。' },
    { kind: 'out-of-scope', text: '本课实现的是单边双向形态：一台设备一个子轮，成对轮次就是两个子轮。草案还有一种非交织的双边双向交互（§10.39.7.2.3），它有三个子轮，第三个子轮里发一帧 One-to-one Final Compact。本课没有这个帧，也没有第三个子轮，所以本课算出的时长是单边双向形态的时长，不能代表非交织的全部形态。' },
    { kind: 'model-value', text: '这部分内容在编写本课时仍有争议，尚未定论：2026 年 9 月的中间会议上，一份涉及它的意见决议动议以 12/13/1 被否决（会议纪要 15-26/0425r0），反对理由正是一对多非交织双边双向在移动场景下的时长，以及应答方多时的帧长——也就是本课算的那笔代价。所以本课描述的是一份仍受到工作组内部质疑的设计。' },
    { kind: 'unmodelled', text: '相干时间这项代价在本课中无法观察。本课的 UWB 链路电平只由距离与墙体决定，不随时间衰落，所以四十三毫秒的一轮和十九毫秒的一轮在这里经历的信道完全相同。而非交织带来的「包本身变短」，其真正的好处恰好全部体现在本模型无法测量的这一方面：读者只能根据正文自行记住这项代价。' },
    { kind: 'unmodelled', text: '固定回复时间下没有任何发射时刻抖动。本课中应答方的包恰好在「接收完对方整个包 + 那个常量」的那一纳秒发射，没有任何偏差。草案自己的告示是「1 ns 的飞行时间误差约合 30 cm」，而这里剩下的误差只有取整到整纳秒的那一点，外加一个片段长度上的晶振偏差。真实设备对自身发射时刻的控制精度正是这个选项最严格的前提，而本模型把它设为理想值。' },
    { kind: 'model-value', text: '应答方不再发送报告，本课的运行中发起方却仍照常打开那个窗口，并记录一次 UWB_TIMEOUT——「tag-1 UWB slot 40: no sp0 from anchor-1」。距离早在 17.500 ms 就出来了，所以这条记录不影响任何数字，但按这个场景统计超时的读者会多计一次。草案没有规定要打开这个窗口：这是本课模型的做法。' },
    { kind: 'model-value', text: '那两条间隔规则与两条不合用都是本课的选择，不是草案的规定。非交织子轮里「一毫秒等于 ⌈1200 RSTU / 时隙⌉ 个时隙」是本课的换算（草案给出的是毫秒，换算成时隙是本课的处理方式）；交错形态中「一毫秒是应答方数加一个时隙」这个排法同样如此（草案只给出 SlotsPerResponder，没有规定交错次序）。而不把「固定回复时间」与「反序」合用是出于本课自身的自洽——草案把那两个位放在同一个八位组里，并没有禁止同时置位。所以本课的这些时隙数只对应这一种排法。' },
  ],
  sources: [
    '非交织子轮的结构（每个子轮 = 控制阶段 + 测距阶段，发起方不等 compact 帧就发包、应答方收到之后才开始自己的子轮）来自 P802.15.4ab：截至 2026 年 9 月，它的投票稿是 D05，仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 提案文稿 15-25/0292r1；非交织形态下的控制阶段，以及“测距时长更长、受信道相干时间限制”这两条代价，出自 15-25/0331r1 里一条**已被提出者撤回**的意见，因此它们不是草案承认的缺点。已投票的 D05 可能与之不同。',
    '固定回复时间的两个属性、它 300…612 000 RSTU 的取值范围与 600 RSTU 的默认值、“自收完 MMS 包起算”这条语义、以及“省掉报告里那个回复时延”这个好处，出自 15-25/0224r2；反序、它那 600 RSTU 的偏移、以及承载回复时延的那个一对一 Response Compact 帧，出自 15-25/0556r2。两个位同在一个八位组里（第 6 位与第 7 位）也出自这两篇。控制面的两套配置与零长控制阶段出自 15-25/0194r0，一轮的阶段划分与时隙默认值出自 15-22/0381r5，片段本身出自 15-23/0100r2。',
    '以下是模型取值：非交织子轮里“一毫秒等于几个时隙”这条间隔规则（草案给出的是毫秒，把它换算成时隙数是本课的选择）；交错形态下“一毫秒是应答方数加一个时隙”这个排法；测距阶段二十个时隙的下限；“固定回复时间 + 一对多”与“固定回复时间 + 反序”这两条不合用，前者依据草案的一对一帧、后者是本课自身的自洽；以及那条不影响数字的超时记录。单位、块与测距时隙出自 IEEE Std 802.15.4-2024。',
  ],
  scenario: () => uwbSubroundsScenario('base'),
  variants: [
    { label: '交错，一对多', scenario: () => uwbSubroundsScenario('interleaved') },
    { label: '固定回复时间', scenario: () => uwbSubroundsScenario('fixed') },
    { label: '反序', scenario: () => uwbSubroundsScenario('reversed') },
  ],
  jumps: [
    J('标签那一列片段的第一个', firstUwbRsf),
    J('第一个锚点开始发送自己的一列片段', firstResponderFragment),
    J('对端如何判定这一列片段', firstUwbTrain),
    J('轮末得出的第一个距离', firstUwbRange),
  ],
  observe: [
    '0.000 ms 那一行写着 “tag-1 UWB round 0 of block 0 (MMS): 86 slots × 500.0 µs”。换到“交错，一对多”，同一位置是 38 个时隙——两种排法的差别，在第一行就已显示出来。',
    '三个锚点的判定都在 7.500 ms 同时完成：标签的一列片段只发送了一次，三个锚点接收的是同一次发送。而标签自己的三条判定分别在 17.500、27.500、37.500 ms——三个锚点依次发送，每个相隔十毫秒。',
    '六个距离全部落在 40.118 到 42.618 ms 之间，也就是四个子轮全部结束之后的报告阶段内。三个距离依次是 3.01、6.01 与 8.91 m，真值 3、6、9 m。',
  ],
  tryThis: [
    '载入“固定回复时间”，只关注两件事：一轮中 SP0 包的个数从两个变为一个，而发起方的距离从 20.118 ms 提前到 17.500 ms，并且在报告阶段开始之前就已得出。再看那一行中的原始距离——19.89 m 变成 3.96 m，因为回复时延从十一毫秒缩短为半毫秒。最后载入“反序”，确认三个距离的误差仍在几厘米以内，再看两个时间分别由哪一端测量。',
  ],
  quiz: [
    {
      q: '在有三个锚点的一轮中，非交织排法下同一列片段的相邻间隔是一毫秒，交错排法下是两毫秒。这是由什么决定的？',
      options: [
        '两种排法都由时隙长度决定',
        '交错排法中由设备台数决定——一毫秒要为每台设备各分配一个时隙；非交织的子轮中只有一个发送者，于是只由时隙长度决定',
        '片段本身的长度',
      ],
      answer: 1,
      explain: '交错是 (应答方数 + 1) × 时隙，非交织是 ⌈1 200 RSTU / 时隙⌉ × 时隙。前者随房间里的锚点数变化，后者不变。',
    },
    {
      q: '启用固定回复时间后，应答方完全不发送报告。发起方依据什么算出距离？',
      options: [
        '它额外进行了一次往返',
        '回复时延是两端事先约定的常量，它本来就掌握；报告原本要传送的就是这个数',
        '它从片段中直接读出了回复时延',
      ],
      answer: 1,
      explain: '节省的正是那条消息的能量。代价是距离的准确度从此取决于那个约定常量的准确度。',
    },
  ],
}
