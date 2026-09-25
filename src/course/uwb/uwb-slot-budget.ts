/**
 * UWB Tier 1 · M15 会话网格 · How long a ranging slot has to be.
 *
 * The SECOND half of the old `uwb-blocks`
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md §2 · M15): that
 * lesson read the timetable, this one asks how long one line of it may be. §2
 * gives this half the 0.5 ms variant, both experiments, both quiz questions and
 * the minimum-slot rule — "engine-enforced, the editor snaps 285 RSTU to 300,
 * and prose today" — written out as its `steps` block.
 *
 * It loads `uwb-blocks`' own scene and its one variant, unchanged, so the
 * recorded timeline hashes are that lesson's, value for value
 * (`lessonShapeSuite(..., { sameSceneAs: 'uwb-blocks' })`). No new variant, no
 * new jump predicate: the jumps are the parent's, reordered so that the first
 * one is the frame this lesson measures against its slot.
 *
 * What arrived here from tests/course/uwb-blocks.test.ts, with the sentences
 * that carry it: the slot-fit formula and `uwbSlotFitNs`, the 300 RSTU floor the
 * scenario schema puts under any slot, the 11.8 % the Final fills its own slot,
 * the 20 ppm across a block, the radio-on figures (1 934 334 ns and
 * 2 448 546 ns, 0.97 % and 1.22 %), the whole 0.5 ms variant and the editor's
 * clamp. Nothing was dropped in the move.
 *
 * NOT registered yet — the controller adds the `lessons.ts` entry, the
 * `COURSE_ORDER` place and the four fixture lines (two in
 * tests/fixtures/lesson-hashes.json, two in tests/fixtures/uwb-record-hashes.json,
 * copies of `uwb-blocks`' and `uwb-blocks#0`'s). Until then it is graded by
 * importing it directly in tests/course/uwb-slot-budget.test.ts.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-slot-budget` prints it with its length
 * once it is registered.
 */
import type { TimingSpec } from '../diagram'
import { J, firstUwbPoll, firstUwbPosition, firstUwbRoundEnd, type Lesson } from '../lessonKit'
import { FIG as GRID, uwbBlocksScenario } from './uwb-blocks'

/**
 * The two slot lengths on one axis, at one scale. The ten frames are the same
 * ten frames on both rows — that is the whole point, and it is why the dark
 * slivers of the two rows add up to the same nanosecond count while the pale
 * slot boxes of the second row are a quarter as wide.
 */
export const FIG = {
  /** The base session's slot, and the variant's, in µs. */
  slotUs: 2000, shortSlotUs: 500,
  /** The window both rows are drawn in: the base round, 20 ms. */
  windowUs: 20_000,
  /** Radio-on inside one 200 ms block, in ns, as the MAC_STATE lane measures it. */
  radioOnNs: 1_934_334,
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
  module: 14,
  title: '时隙该多长',
  why: '上一课读完了时间表，却没说表上一行该有多长。这个场景里一个测距时隙（ranging slot）是 2 ms，真正发出去的那一帧只占其中一成出头，余下全是留白。这一课讲这条长度的下限是谁定的、那份留白买来了什么，以及把时隙缩短能买到什么、买不到什么。',
  outcomes: [
    '说出一个测距时隙至少要多长，以及这条下限是谁定的',
    '分清时间表分给一台设备的那段时间，与它射频真正开着的时间',
    '预测把时隙缩到四分之一会改变什么、不会改变什么',
  ],
  needs: ['uwb-blocks'],
  terms: [
    { term: 'margin', plain: '余量：时隙在必须装下的那一帧之外多留的余地' },
    { term: 'airtime', plain: '空口时间：一帧真正占住信道的那一段' },
    { term: 'RSTU', plain: '写这张时间表所用的单位：测距时隙时间单元，一个 833.333 ns' },
  ],
  picture: [
    { heading: '为什么时隙比帧长这么多', text: '一个时隙必须装得下本轮最长的那一帧和它的飞行时间，再留一点余地；这点余地就是余量（margin）。除此之外时隙多长是一个选择，而这里选得很宽裕：时隙里大半是静默。这份余量买的是本模型略去的那些东西——搜索首径（first path）、收发转换、两端时钟相互漂移。' },
    { kind: 'watch', jump: 0, heading: '一帧占了自己时隙的几分之一', text: '载入仿真，跳到第一帧 Poll，把时间线放大到看得见它的两端：它之后，这个时隙还剩十分之九是空的。' },
    { heading: '醒着，和分到手，是两回事', text: '一台设备付的是空口时间（airtime）的账，不是时间表分给它那段时间的账：它只在“预期有帧到来”的时隙起点打开接收机，那一帧落地就关掉。于是服务着十轮中三轮的锚点（anchor），射频开启时长也不过占整块的百分之一上下。' },
    {
      kind: 'diagram', heading: '两种时隙，同一个比例', spec: uwbSlotBudgetTiming(),
      caption: '同一场景的两条时间轴，同一个比例。上一行是本课的 2 ms 时隙：十个时隙铺满 20 ms，深色的十道细线才是真正发出去的帧。下一行把时隙缩到 0.5 ms，同样十帧挤进前 5 ms——深色部分一纳秒都没少，两行都是 1 934 334 ns。缩短时隙买到的是时延与容量，不是电池。',
    },
  ],
  numbers: [
    { kind: 'formula', heading: '时隙最短能有多短', text: 'slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4', note: '时隙要装得下本轮最长的那一帧，再加 200 ns 飞行余量，相当于 60 m 空气。所以 2 ms 不是算出来的下限，而是规范档案里的取值；它让那一帧只占自己时隙的 11.8 %。' },
    { kind: 'steps', heading: '一个时隙长度要过几道关', items: [
      '取本轮最长的那一帧。双边双向测距（DS-TWR）里是 Final，14 + 12N 字节：四个锚点时 62 字节，空口 236 603 ns。',
      '加 200 ns 飞行余量：这个场景的容量下限是 236 803 ns，合 285 个 RSTU（ranging slot time unit）还多一点。',
      '场景 schema 另外给任何时隙设了 300 RSTU 的下限，即 250.0 µs，比上一步还宽 13.2 µs。所以本场景真正的最短时隙是 300 RSTU，不是那条容量规则。',
      '时隙长度还必须是 3 RSTU 的整数倍，这是标准正文的要求；285 与 282 都过得了，拦住它们的是上一条。',
      '编辑器在你移开焦点时把输进去的数按这几条夹一遍：输 285，它跳到 300。',
      '块长不跟着变，于是每块轮数自己变了：轮长 = 时隙数 × 时隙长，每块轮数 = 块长 ÷ 轮长。时隙缩到四分之一，每块就从十轮变四十轮。',
    ] },
    { kind: 'table', heading: '射频真正的开销', head: [
      '设备', '参与的轮次', '醒来的时隙',
      '块内射频开启时长', '占比',
    ], rows: [
      ['uwb-1', '1 of 10', '10 of 10', '1 934 334 ns', '0.97 %'],
      ['anchor-1', '3 of 10', '4 of 10 × 3', '2 448 546 ns', '1.22 %'],
    ] },
    { text: '时间表分给手机的是十轮中的一轮，分给锚点的是三轮；状态泳道显示的却是射频真正开着的时间。两种占比相差十倍以上。' },
    { kind: 'table', heading: '同一场景，两种时隙长度', head: [
      '测距时隙', '一轮', '每块轮数',
      '三部手机全部完成', '每部手机射频开启',
    ], rows: [
      ['2 400 RSTU · 2 ms', '20.0 ms', '10', '60 ms', '1 934 334 ns'],
      ['600 RSTU · 0.5 ms', '5.0 ms', '40', '15 ms', '1 934 334 ns'],
    ] },
  ],
  deeper: [
    { heading: '2 ms 的余量花在哪里', text: '四个锚点的 Final 是 62 字节、空口 236 603 ns，所以 2 ms 的时隙里将近九成是静默。这份余量买的是：接收机在判定 RMARKER（ranging marker）之前要做的首径（first path）搜索、锚点从收到发的转换时间，以及调度漂移——这里的时隙边界是精确的，但 20 ppm 跨过一个 200 ms 的块就是每边 4 µs。' },
    { heading: '1 934 334 ns 是怎么凑出来的', text: '手机参与自己那一轮的全部十个时隙，它的 1 934 334 ns 恰好是这一轮的空口时间 1 934 230 ns，再加上它接收的八帧、每帧 13 ns 的飞行时间。锚点还要更省：它听 Poll、发 Response、听 Final、发 Report——十个时隙里醒来四次，第一轮 816 180 ns——在其他锚点的时隙里则是聋的。三轮之间因飞行时间差着几纳秒，合计 2 448 546 ns。' },
    { heading: '容量规则什么时候才说话', text: '只有当那一帧变长，容量规则才超过 300 RSTU 的下限：六个锚点时 Final 要 267 572 ns，即 324 RSTU。而一帧 Final 最多列九个锚点，这不是选出来的——14 + 12N 在十个锚点时是 134 字节，超过了负载 127 字节的上限。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.32.2 规定块长与时隙长都以整数个 3 RSTU 计；§10.29.1.5 与表 10-145 把 RSTU 定为 416 个码片，在 499.2 Mchip/s 下即 833.333 ns。',
    '2 ms 的测距时隙与 200 ms 的测距块是 FiRa 规范档案里的取值，不是标准正文。',
    '有两个数字是仿真器自己的模型取值：时隙容量规则在最长帧之外追加的 200 ns 飞行余量，以及场景 schema 给任何时隙设下的 300 RSTU 下限。这条下限只管一般的测距时隙；多毫秒片段那一套另有自己的规矩，后面会讲到。',
  ],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: '0.5 ms 时隙', scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('第一帧 Poll，压在时隙边界上', firstUwbPoll),
    J('它的轮次结束', firstUwbRoundEnd),
    J('第一部手机的定位', firstUwbPosition),
  ],
  observe: [
    '打开 uwb-1 的状态泳道。整轮二十毫秒里，它只在十个时隙的开头各醒一次，每次不到 0.24 ms；这些深色段加起来是 1.93 ms，也就是整块 200 ms 的 0.97 %。',
  ],
  tryThis: [
    '载入“0.5 ms 时隙”，看这个块空了下来：三个轮次到 15 ms 就做完，定位落在 5、10、15 ms，编辑器规划出每块 40 轮而不是十轮。射频开启总时长一纳秒都没动。',
    '打开场景编辑器，在时隙那一栏输入 285 再移开焦点：它跳到 300，282 也一样。两个都是 3 的整数倍，也都宽过容量规则——拦住它们的是那条 300 RSTU 下限。',
  ],
  quiz: [
    {
      q: '一部手机占了块的十分之一，锚点占十分之三，可泳道上实测的射频开启时间只有 0.97 % 与 1.22 %。为什么？',
      options: [
        '状态泳道是对射频采样的，短的区间会被漏掉',
        '设备在时隙边界打开接收机，并在预期的那一帧落地时立刻关掉：它付的是空口时间的账，不是所占时隙的账',
        '块里那七个空轮被跳过了，差额就出在那里',
      ],
      answer: 1,
      explain: '手机的射频开启时间就是整轮的空口时间，加每次接收那几纳秒飞行。锚点在别人的时隙里是聋的，一轮十个时隙只醒四次。',
    },
    {
      q: '把测距时隙从 2 ms 缩到 0.5 ms，改变了什么？',
      options: [
        '射频开启时长随之下降，大约变成四分之一',
        '没有什么要紧的改变：轮次和定位都一模一样',
        '一轮缩到 5.0 ms，一个块装 40 轮而不是 10 轮——定位更快、手机更多——而射频开启的总时长原地不动',
      ],
      answer: 2,
      explain: '没有任何一帧变长，功耗自然也没变。时隙长度买到的是时延与容量，它的下界由最长那一帧和 300 RSTU 决定。',
    },
  ],
}
