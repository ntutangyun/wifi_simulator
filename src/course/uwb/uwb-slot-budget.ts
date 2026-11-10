/**
 * UWB Tier 1 · M16 会话网格 · How long a ranging slot has to be — in the standard-first shape
 * (2026-11-10).
 *
 * ① what IEEE Std 802.15.4-2024 asks of a slot's length (at least one frame, whole RSTU, §10.32.2;
 * the RSTU counter, §10.29.1.5; rounds per block, §10.32.3.3; the transmission offset that has to
 * fit inside a slot, §10.32.9.3; the RX-to-TX turnaround bound, §11.2.3; the 127-octet BPRF payload,
 * §16.7; the receiver enabled only in expected slots, §10.32.3.4); ② this simulator's slot rule
 * (longest frame + its 200 ns guard + aTurnaroundTime; the 300 RSTU floor it used to add is gone,
 * 2026-11-11), the editor's clamp, the 2 ms it picks and what it leaves out; ③ four guided runs, every figure of which is read back out of this file and compared
 * with a run in tests/course/uwb-slot-budget.test.ts.
 *
 * It loads `uwb-blocks`' own scene and its one variant, unchanged, so the recorded timeline hashes
 * are that lesson's, value for value (`lessonShapeSuite(..., { sameSceneAs: 'uwb-blocks' })`).
 */
import type { TimingSpec } from '../diagram'
import { J, firstUwbPoll, firstUwbPosition, type Lesson } from '../lessonKit'
import { FIG as GRID, uwbBlocksScenario } from './uwb-blocks'

/**
 * The two slot lengths on one axis, at one scale. The ten frames are the same
 * ten frames on both rows, which is why the dark slivers of the two rows add up
 * to the same nanosecond count while the pale slot boxes of the second row are a
 * quarter as wide.
 */
export const FIG = {
  /** The base session's slot, and the variant's, in µs. */
  slotUs: 2000, shortSlotUs: 500,
  /** The window both rows are drawn in: the base round, 20 ms. */
  windowUs: 20_000,
  /** Radio-on inside one 200 ms block, in ns, as the MAC_STATE lane measures it. */
  radioOnNs: 1_973_821,
} as const

export function uwbSlotBudgetTiming(): TimingSpec {
  const row = (slotUs: number): TimingSpec['lanes'][number]['spans'] =>
    GRID.frames.flatMap((f) => [
      { fromUs: f.slot * slotUs, toUs: (f.slot + 1) * slotUs },
      { fromUs: f.slot * slotUs, toUs: f.slot * slotUs + f.airUs, tone: 'accent' as const },
    ])
  return {
    kind: 'timing',
    lanes: [
      { label: '2 ms 时隙', spans: row(FIG.slotUs) },
      { label: '0.5 ms 时隙', spans: row(FIG.shortSlotUs) },
    ],
    axis: { fromUs: 0, toUs: FIG.windowUs, ticks: [0, 10_000, 20_000], unit: 'µs' },
  }
}

export const uwbSlotBudget: Lesson = {
  id: 'uwb-slot-budget',
  module: 16,
  title: '时隙该多长',
  why: '上一课读完了时间表，这一课讨论表上一行该有多长。标准对测距时隙（ranging slot）的长度只有两条要求：至少能容纳一帧，以 RSTU（ranging scheduling time unit）为单位（§10.32.2）；具体取多长由上层决定。本仿真器据此要求时隙容纳三段时间：本轮最长的一帧、200 ns 的飞行余量（margin，本仿真器的取值），以及接收转为发送所需的转换时间——标准规定它不超过 aTurnaroundTime，即 12 个符号（symbol）周期，HRP 以前导符号（preamble symbol）计，约 12.2 µs（表 12-1）。场景实际取的 2 ms 是 FiRa 规范档案里的取值，帧只占其中一成多，其余时间空闲，留给本仿真器没有建模的首径（first path）搜索与时钟漂移。射频的开销与时隙长短无关：标准允许上层只在预期有帧的时隙打开接收机（§10.32.3.4），本仿真器的设备正是这样做的，那一帧接收完毕即关闭，所以手机和锚点（anchor）射频开启的时间都只占整块的百分之一左右。把时隙缩短到四分之一，块长不变，块内轮数随之翻两番（块内轮数 = 块长 ÷ 轮长，§10.32.3.3）：三部手机更快完成测距，可容纳的手机也更多，而空口时间（airtime）没有减少，射频开启的总时长不变。',
  outcomes: [
    '说出标准对测距时隙长度的要求，以及本仿真器在此之上自己加的约束',
    '区分时间表分配给一台设备的时间与它的射频实际开启的时间',
    '预测把时隙缩短到四分之一会改变什么、不会改变什么',
  ],
  needs: ['uwb-blocks'],
  terms: [
    { term: 'margin', plain: '余量：时隙在必须容纳的那一帧之外多留的时间' },
    { term: 'airtime', plain: '空口时间：一帧实际占用信道的时长' },
  ],
  standard: [
    { heading: '时隙至少能容纳一帧（§10.32.2，§10.29.1.5）', text: '测距时隙是足以发送至少一帧测距帧的一段时间。块、轮、时隙的时长都以 RSTU 为单位，HRP 超宽带（ultra-wideband, UWB）下一个 RSTU 是 416 个码片（chip），约 833.33 ns（表 10-145）；媒体访问控制（medium access control, MAC）子层维护一个 24 位的 RSTU 计数器，时隙的定时、帧的发送与接收机的开启都以它为参照。除此之外，标准对时隙长度没有别的要求，取多长由控制器的上层决定；在帧里给出时，ARC 信息单元的时隙长字段以 RSTU 计（§10.32.9.1）。' },
    { heading: '时隙越短，块里的轮越多（§10.32.3.3）', text: '块模式下，块内轮数 = 块长 ÷ 轮长，轮内时隙数 = 轮长 ÷ 时隙长。块长与一轮的时隙数不变时，时隙缩短，轮随之缩短，一个块容纳的轮相应增多。' },
    { heading: '发送偏移也要放进时隙（§10.32.9.3）', text: 'RR 信息单元的发送偏移以 RSTU 计，至多为时隙长减去帧长：控制器可以把一轮里的每一次发送在各自的时隙里整体推后，前提是帧仍在时隙之内。' },
    { heading: '接收与发送之间的转换（§11.2.3，§16.4.8）', text: 'HRP 超宽带的物理层（physical layer, PHY）从接收转为发送的时间不得超过 aTurnaroundTime（表 12-1），即从收到的一帧最后一个码片到发出的下一帧第一个码片之间的时间。' },
    { heading: '一帧最长多长（§16.7）', text: 'BPRF 模式下，物理头（PHY header, PHR）能表示的负载最多 127 字节；HRP 测距设备应支持从 0 到 127 字节的所有负载长度。' },
    { heading: '只在预期有帧的时隙接收（§10.32.3.4）', text: '上层可以用 MLME-RX-ENABLE.request 只在预期有帧到达的时隙打开接收机，而不让接收机一直开着；标准允许这样做，但不强制。' },
  ],
  implementation: [
    { topic: '时隙最短多长', standard: '至少能容纳一帧（§10.32.2）；接收转为发送不超过 aTurnaroundTime（§11.2.3）', sim: '时隙要容纳本轮最长的一帧、飞行余量与 aTurnaroundTime：双边双向测距（double-sided two-way ranging, DS-TWR）里最长的是 Final，四个锚点时 66 字节、空口 242 500 ns，于是下限 254 912 ns，合 306 个 RSTU。五个锚点时要 267 220 ns，即 321 RSTU。', kind: 'choice' },
    { topic: '飞行余量', standard: '标准未规定', sim: '200 ns，相当于 60 m 的传播距离。', kind: 'value' },
    { topic: '时隙的下限', standard: '标准没有给出下限', sim: '照此：除上面这条容量规则之外没有别的下限。本仿真器以前另加了一条「不得短于 300 RSTU」的规则，标准里没有，已经去掉。', kind: 'faithful' },
    { topic: '场景取的时隙长', standard: '由控制器的上层决定', sim: '2 400 RSTU，即 2 ms，是 FiRa 规范档案里的取值（语料库里没有 FiRa 规范，无法核实）；Final 只占它的 12.1 %。', kind: 'value' },
    { topic: '整数个 RSTU', standard: '时长以 RSTU 为单位（§10.32.2）', sim: '照此：时隙长度是整数个 RSTU，此外不要求它是任何数的整数倍。', kind: 'faithful' },
    { topic: '编辑器里的输入', standard: '标准未规定', sim: '时隙输入框失去焦点时，编辑器把小于容量规则下限的输入修正为这个下限（本场景 306 RSTU）；块长若因此不再是时隙长的整数倍，编辑器把块长改为最近的整数倍。', kind: 'choice' },
    { topic: '接收机何时开启', standard: '上层可以只在预期有帧的时隙打开接收机（§10.32.3.4）', sim: '照此：设备在预期有帧到来的时隙起点打开接收机，那一帧接收完毕即关闭。', kind: 'faithful' },
    { topic: '接收与发送之间的转换', standard: '不超过 aTurnaroundTime：12 个符号周期，HRP 以前导符号计（表 12-1，§11.2.3，§16.1）', sim: '时隙的容量规则按这个最长转换时间留出 12 212 ns（12 × 508 个码片）；设备本身从接收转为发送不耗时间。', kind: 'value' },
    { topic: '首径搜索与时钟漂移', standard: '属于接收机的实现，标准没有给出所需的时间', sim: '未建模：一帧一到达即视为收到，不计搜索时间；时隙边界对每台设备都是同一纳秒。所以把余量减到恰好容纳那一帧，本仿真器的结果不会变差。', kind: 'choice' },
    { topic: '发送偏移', standard: '至多为时隙长减去帧长（§10.32.9.3）', sim: '始终为 0：每一帧都从时隙的起点开始。', kind: 'value' },
    { topic: '一帧最长', standard: 'BPRF 负载最多 127 字节（§16.7）', sim: '照此：嵌入式双边双向测距的 Final 是 18 + 12N 字节，十个锚点时 138 字节，超过 127 字节，所以一帧 Final 最多列九个锚点。', kind: 'faithful' },
    { topic: '功耗', standard: '标准不定义功耗模型', sim: '只统计状态泳道上射频开启的时长，没有每种状态的电流、开机与关机的能量，也没有待机功耗。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一帧占自己时隙的几分之一',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一帧 Poll，把时间线放大到能看清它的起止。',
        '再看同一轮里的 Final，对照下面的公式。',
      ],
      blocks: [
        { kind: 'formula', heading: '本仿真器的容量规则', text: 'slot ≥ PPDU(Final, N anchors) + 200 ns + aTurnaroundTime = 242 500 + 200 + 12 212 = 254 912 ns at N = 4', note: '时隙要容纳本轮最长的那一帧、200 ns 的飞行余量与 aTurnaroundTime；200 ns 是本仿真器的取值（②），aTurnaroundTime 是标准规定的最长转换时间（①）。' },
      ],
      expect: 'Poll 的空口时间是 217 885 ns，只占 2 ms 时隙的 10.9 %；本轮最长的 Final 是 242 500 ns，也只占 12.1 %，其余时间空闲。',
      meaning: '标准只要求时隙容纳一帧，并规定了收发转换最多用多长时间（①）；2 ms 远超这个要求，多出来的余量留给本仿真器没有建模的首径搜索与时钟漂移（②）。',
    },
    {
      heading: '射频开启的时间与分配到的时间',
      jump: 0,
      steps: [
        '打开 uwb-1 与 anchor-1 的状态泳道，看一个 200 ms 的块里它们各自唤醒了几次、每次多久。',
        '对照下表读出射频开启的总时长与它占整块的比例。',
      ],
      blocks: [
        { kind: 'table', heading: '射频真正的开销', head: ['设备', '参与的轮次', '唤醒的时隙', '块内射频开启时长', '占比'], rows: [
          ['uwb-1（三部之一）', '1 of 10', '10 of 10', '1 973 821 ns', '0.99 %'],
          ['anchor-1（四个之一）', '3 of 10', '4 of 10 × 3', '2 516 238 ns', '1.26 %'],
        ] },
      ],
      expect: '时间表分配给手机的是十轮中的一轮，分配给锚点的是三轮；射频实际开启的时间只占整块的 0.99 % 与 1.26 %，相差十倍以上。手机的 1 973 821 ns 正是它那一轮的空口时间 1 973 717 ns，再加上它接收的八帧、每帧 13 ns 的飞行时间；锚点一轮只唤醒四次，在其他锚点的时隙里接收机关闭。',
      meaning: '只在预期有帧的时隙打开接收机是标准允许的做法（①），本仿真器照此实现（②）；射频开销由空口时间决定，与分配到的时间无关。',
    },
    {
      heading: '把时隙缩短到四分之一',
      variant: 0,
      jump: 1,
      steps: [
        '先运行本课场景，再载入「0.5 ms 时隙」，跳到第一部手机的定位。',
        '对照下表比较两种时隙长度：一轮多长、一个块容纳几轮、三部手机何时全部完成、射频开启多久。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '两种时隙，同一个比例', spec: uwbSlotBudgetTiming(),
          caption: '同一场景的两条时间轴，同一个比例。上一行是 2 ms 时隙：十个时隙占满 20 ms，深色的十道细线才是真正发送的帧。下一行把时隙缩短到 0.5 ms，同样十帧在前 5 ms 之内；深色部分的总时长完全相同。',
        },
        { kind: 'table', heading: '同一场景，两种时隙长度', head: ['测距时隙', '一轮', '每块轮数', '三部手机全部完成', '每部手机射频开启'], rows: [
          ['2 400 RSTU · 2 ms', '20.0 ms', '10', '60 ms', '1 973 821 ns'],
          ['600 RSTU · 0.5 ms', '5.0 ms', '40', '15 ms', '1 973 821 ns'],
        ] },
      ],
      expect: '一轮从 20.0 ms 缩短到 5.0 ms，每块从 10 轮变为 40 轮，三部手机在 15 ms 时就全部完成，定位出现在 5、10、15 ms；每部手机的射频开启时长仍是 1 973 821 ns。',
      meaning: '块内轮数 = 块长 ÷ 轮长，照标准（①）；没有任何一帧变长，所以缩短时隙改善的是时延与容量，不是功耗（②）。',
    },
    {
      heading: '编辑器里的最短时隙',
      steps: [
        '打开场景编辑器，在 UWB 会话的时隙一栏输入 300，再移开焦点；看时隙与块长两栏。',
        '再输入 320，移开焦点。',
      ],
      blocks: [
        { kind: 'steps', heading: '本仿真器对时隙长度的约束，逐步说明', items: [
          '取本轮最长的那一帧：双边双向测距里是 Final，四个锚点时 66 字节，空口 242 500 ns。',
          '加 200 ns 飞行余量与 12 212 ns 的 aTurnaroundTime：容量下限是 254 912 ns，合 305 个 RSTU 还多一点，所以至少要 306 个 RSTU。',
          '输入框失去焦点时，编辑器把小于这个下限的输入修正为下限。',
          '块要由整数个时隙组成（§10.32.2）：块长若不再是时隙长的整数倍，编辑器把它改为最近的整数倍。',
        ] },
      ],
      expect: '300 变为 306：300 RSTU（250.0 µs）比容量规则要求的 254.9 µs 短 4.9 µs。240 000 RSTU 不是 306 RSTU 的整数倍，块长随之变为 239 904 RSTU，即 784 个时隙。320 保持不变，块长也不变：240 000 RSTU 正好是 750 个 320 RSTU 的时隙。',
      meaning: '标准只要求整数个 RSTU、能容纳一帧，并规定了收发转换最多用多长时间（①）；容量规则里的 200 ns 是本仿真器的取值（②），300 RSTU 不是任何一方的规定。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.32.2（时隙至少能容纳一帧，时长以 RSTU 为单位）、§10.29.1.5 与表 10-145（RSTU = 416 个码片，约 833.33 ns；24 位 RSTU 计数器）、§10.32.3.3（块内轮数 = 块长 ÷ 轮长）、§10.32.9.1（ARC 信息单元的时隙长字段）、§10.32.9.3（发送偏移至多为时隙长减去帧长）、§11.2.3 与 §16.4.8（接收到发送的转换时间不超过 aTurnaroundTime）、§16.7（BPRF 负载最多 127 字节）、§10.32.3.4（只在预期有帧的时隙打开接收机）。',
    '本仿真器的取值与取法：时隙容纳最长一帧、200 ns 飞行余量与 aTurnaroundTime（表 12-1：12 个前导符号，§16.1）的容量规则、编辑器把输入修正到合法值并把块长对齐到时隙的整数倍、2 ms 的时隙与 200 ms 的块（FiRa 规范档案里的取值，语料库中无法核实）、设备的收发转换取 0、不建模首径搜索与时钟漂移、发送偏移取 0、射频开启时长只是状态泳道之和，不是功耗模型。多毫秒片段的时隙另有草案的规则，后面会讲到。',
  ],
  limits: [],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: '0.5 ms 时隙', scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('第一帧 Poll，从时隙边界开始', firstUwbPoll),
    J('第一部手机的定位', firstUwbPosition),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一部手机占了块的十分之一，锚点占十分之三，可泳道上实测的射频开启时间只有 0.99 % 与 1.26 %。为什么？',
      options: [
        '状态泳道是对射频采样的，短的区间会被漏掉',
        '设备在时隙起点打开接收机，并在预期的那一帧接收完毕后立即关闭：它的射频开销由空口时间决定，不是由所占的时隙决定',
        '块里那七个空轮被跳过了，差额就出在那里',
      ],
      answer: 1,
      explain: '手机的射频开启时间就是整轮的空口时间，再加上每次接收时几纳秒的飞行时间。锚点在其他锚点的时隙里接收机是关闭的，一轮十个时隙只唤醒四次。',
    },
    {
      q: '把测距时隙从 2 ms 缩到 0.5 ms，改变了什么？',
      options: [
        '射频开启时长随之下降，大约变成四分之一',
        '没有什么要紧的改变：轮次和定位都一模一样',
        '一轮缩到 5.0 ms，一个块容纳 40 轮而不是 10 轮——定位更快、手机更多——而射频开启的总时长不变',
      ],
      answer: 2,
      explain: '没有任何一帧变长，功耗自然也没变。时隙长度决定的是时延与容量；本仿真器给它的下界由最长那一帧、飞行余量与 aTurnaroundTime 决定。',
    },
    {
      q: '标准对一个测距时隙的长度要求什么？',
      options: [
        '不得短于 300 RSTU',
        '至少能容纳一帧，以 RSTU 为单位；取多长由上层决定',
        '恰好 2 ms',
      ],
      answer: 1,
      explain: '§10.32.2 只要求时隙足以发送至少一帧、时长以 RSTU 计；300 RSTU 不是标准的规定，2 ms 是场景的取值。',
    },
  ],
}
