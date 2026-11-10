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
 * the 20 ppm across a block, the radio-on figures (1 943 565 ns and
 * 2 476 239 ns, 0.97 % and 1.24 %), the whole 0.5 ms variant and the editor's
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
  radioOnNs: 1_943_565,
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
  why: '上一课读完了时间表，却没说表上一行该有多长。这个场景里一个测距时隙（ranging slot）是 2 ms，真正发送的那一帧只占其中一成多，其余时间都是空闲。标准只要求一个测距时隙至少能容纳一帧；本课的规则是：时隙必须容纳本轮最长的那一帧和本课取的少量飞行余量；而在这个场景里，本课给任何时隙设的下限还要更长一些，真正起限制作用的是这一条。所以 2 ms 这个长度不是算出来的，而是 FiRa 规范档案里的取值，不是 IEEE 标准的规定；多出来的余量（margin）留给本课略去的东西——搜索首径（first path）、收发转换、两端时钟相互漂移。射频的开销与时隙长短无关：本课的设备只在预期有帧到来的时隙起点打开接收机（标准允许这样做），那一帧接收完毕即关闭，因此手机和锚点（anchor）射频开启的时间都只占整块的百分之一左右，不到时间表分配给它们的那几轮的十分之一。把时隙缩短到四分之一，块长不变，一个块容纳的轮数翻两番：三部手机更快完成测距，可容纳的手机也更多；而空口时间（airtime）没有减少，功耗不变。',
  outcomes: [
    '说出一个测距时隙至少要多长，以及这条下限由什么决定',
    '区分时间表分配给一台设备的时间与它的射频实际开启的时间',
    '预测把时隙缩短到四分之一会改变什么、不会改变什么',
  ],
  needs: ['uwb-blocks'],
  terms: [
    { term: 'margin', plain: '余量：时隙在必须容纳的那一帧之外多留的时间' },
    { term: 'airtime', plain: '空口时间：一帧实际占用信道的时长' },
  ],
  picture: [
    { heading: '为什么时隙比帧长这么多', text: '场景与上一课相同：四个锚点、三部手机。本课的表只取其中一部手机（uwb-1）和一个锚点（anchor-1）作代表。标准对时隙长度的要求只有一条：至少能容纳一帧（§10.32.2）。本课进一步要求一个时隙必须容纳本轮最长的那一帧和它的飞行时间，再多留一些时间；多留的这部分就是余量（margin）。除此之外，时隙取多长是一种选择，而这里取得很宽裕：时隙里大半时间是静默。这份余量留给真实设备需要耗费时间的那些操作——搜索首径（first path）、收发转换、两端时钟相互漂移。' },
    { kind: 'watch', jump: 0, heading: '一帧占了自己时隙的几分之一', text: '载入仿真，跳到第一帧 Poll，把时间线放大到能看清它的起止：这一帧结束后，这个时隙其余十分之九的时间都是空闲的。' },
    { heading: '射频开启的时间与分配到的时间不是一回事', text: '一台设备的射频开销由空口时间（airtime）决定，而不是由时间表分配给它的时间决定：本课的设备只在“预期有帧到来”的时隙起点打开接收机，那一帧接收完毕即关闭——标准允许上层这样只在预期有帧的时隙打开接收机（§10.32.3.4），但不强制。因此参与十轮中三轮的锚点（anchor），射频开启时长也只占整块的百分之一左右。' },
    {
      kind: 'diagram', heading: '两种时隙，同一个比例', spec: uwbSlotBudgetTiming(),
      caption: '同一场景的两条时间轴，同一个比例。上一行是本课的 2 ms 时隙：十个时隙占满 20 ms，深色的十道细线才是真正发送的帧。下一行把时隙缩短到 0.5 ms，同样十帧落在前 5 ms 之内——深色部分的总时长完全相同，两行都是 1 943 565 ns。缩短时隙改善的是时延与容量，不是功耗。',
    },
  ],
  numbers: [
    { kind: 'formula', heading: '时隙最短能有多短', text: 'slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4', note: '时隙要容纳本轮最长的那一帧，再加本课取的 200 ns 飞行余量，相当于 60 m 的传播距离；这条容量规则本身也是本课的。所以 2 ms 不是算出来的下限，而是 FiRa 规范档案里的取值；它让那一帧只占自己时隙的 11.8 %。' },
    { kind: 'steps', heading: '本课对时隙长度设的几条约束（标准只要求能容纳一帧）', items: [
      '取本轮最长的那一帧。双边双向测距（DS-TWR）里是 Final，按本课的字段宽度是 14 + 12N 字节：四个锚点时 62 字节，空口 236 603 ns。',
      '加 200 ns 飞行余量：这个场景的容量下限是 236 803 ns，合 285 个 RSTU（ranging scheduling time unit）还多一点。',
      '本课另外给任何时隙设了 300 RSTU 的下限，即 250.0 µs，比上一步的结果还长 13.2 µs；标准不规定这个数。所以本场景真正的最短时隙是 300 RSTU，不是那条容量规则。',
      '时隙长度以整数个 RSTU 计，标准对它没有别的要求；285 与 282 都是整数个 RSTU，使它们不合法的是上一条。',
      '输入框失去焦点时，编辑器按这几条约束把输入值修正到合法值：输入 285，它变为 300。',
      '块长不随时隙改变，因此每块的轮数随之改变：轮长 = 时隙数 × 时隙长，每块轮数 = 块长 ÷ 轮长。时隙缩短到四分之一，每块就从十轮变为四十轮。',
    ] },
    { kind: 'table', heading: '射频真正的开销', head: [
      '设备', '参与的轮次', '唤醒的时隙',
      '块内射频开启时长', '占比',
    ], rows: [
      ['uwb-1（三部之一）', '1 of 10', '10 of 10', '1 943 565 ns', '0.97 %'],
      ['anchor-1（四个之一）', '3 of 10', '4 of 10 × 3', '2 476 239 ns', '1.24 %'],
    ] },
    { text: '时间表分配给手机的是十轮中的一轮，分配给锚点的是三轮；状态泳道显示的却是射频实际开启的时间。两种占比相差十倍以上。' },
    { kind: 'table', heading: '同一场景，两种时隙长度', head: [
      '测距时隙', '一轮', '每块轮数',
      '三部手机全部完成', '每部手机射频开启',
    ], rows: [
      ['2 400 RSTU · 2 ms', '20.0 ms', '10', '60 ms', '1 943 565 ns'],
      ['600 RSTU · 0.5 ms', '5.0 ms', '40', '15 ms', '1 943 565 ns'],
    ] },
  ],
  deeper: [
    { heading: '2 ms 的余量留给了什么', text: '四个锚点的 Final 是 62 字节、空口 236 603 ns，所以 2 ms 的时隙里将近九成时间是静默。这份余量留给的是：接收机在判定 RMARKER（ranging marker）之前要做的首径（first path）搜索、锚点从收到发的转换时间，以及调度漂移——这里的时隙边界是精确的，但 20 ppm 的偏差在一个 200 ms 的块内累积为每边 4 µs。' },
    { heading: '1 943 565 ns 由什么组成', text: '手机参与自己那一轮的全部十个时隙，它的 1 943 565 ns 恰好是这一轮的空口时间 1 943 461 ns，再加上它接收的八帧、每帧 13 ns 的飞行时间。锚点的开启时间更短：它接收 Poll、发送 Response、接收 Final、发送 Report——十个时隙里唤醒四次，第一轮 825 411 ns——在其他锚点的时隙里接收机是关闭的。三轮之间因飞行时间不同而相差几纳秒，合计 2 476 239 ns。' },
    { heading: '容量规则什么时候才起作用', text: '只有当那一帧变长，容量规则才超过 300 RSTU 的下限：六个锚点时 Final 要 267 572 ns，即 324 RSTU。而按本课的字段宽度，一帧 Final 最多列九个锚点，这不是任意选定的——14 + 12N 在十个锚点时是 134 字节，超过了 BPRF 模式下负载 127 字节的上限。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '那份余量留给的三样东西，本课均未建模：首径搜索（帧一到达即视为收到，不计搜索时间）、收发转换（从接收转为发送的耗时为零）、以及设备之间的调度漂移（时隙边界对每台设备都是同一纳秒）。所以把余量减到恰好容纳那一帧，本课的结果没有任何一项会因此变差——而真实设备在这种情况下已经没有任何余量。' },
    { kind: 'model-value', text: '200 ns 的飞行余量与 300 RSTU 的下限都是本仿真器自己的数；标准只要求时隙至少能容纳一帧、长度以 RSTU 为单位。所以「本场景真正的最短时隙是 300 RSTU」是这两个模型取值的结论，不是标准的结论；改变其中任一个，第三步的结论和编辑器把 285 修正为 300 的结果就都不再成立。' },
    { kind: 'unmodelled', text: '那两个「射频开启时长」是状态泳道上各段时长之和，不是功耗模型：每种状态的电流、开机与关机各自的能量、以及待机功耗都没有数。真实的 UWB 标签里唤醒并稳定晶振往往比收一帧本身耗能更多，所以「射频开启的总时长不变」不等于「电池耗电没有增加」——本课能测量前者，无法测量后者。' },
    { kind: 'out-of-scope', text: '把时隙缩短到四分之一，帧的密度就提高到四倍，而本课的结果并不因此付出任何代价：每一帧的发射功率是常数 −14 dBm，没有占空比、没有平均等效全向辐射功率的上限，同一空间里也没有第二个会话共享这段空口时间。真实的超宽带必须遵守 −41.3 dBm/MHz 的平均功率限制，所以「缩短时隙只改善时延与容量」这句话在本模型之外还要受这条监管限制的约束。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.32.2 规定块长与时隙长都以 RSTU 为单位，一个时隙至少能容纳一帧，此外不对长度作别的要求。§10.29.1.5 与表 10-145 把 RSTU 定为 416 个码片，在 499.2 Mchip/s 下即 833.333 ns。',
    '2 ms 的测距时隙与 200 ms 的测距块是 FiRa 规范档案里的取值，不是标准正文。',
    '有两个数字是仿真器自己的模型取值：时隙容量规则在最长帧之外追加的 200 ns 飞行余量，以及本课给任何时隙设下的 300 RSTU 下限。这条下限只管一般的测距时隙；多毫秒片段另有自己的规则，后面会讲到。',
  ],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: '0.5 ms 时隙', scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('第一帧 Poll，从时隙边界开始', firstUwbPoll),
    J('它的轮次结束', firstUwbRoundEnd),
    J('第一部手机的定位', firstUwbPosition),
  ],
  observe: [
    '打开 uwb-1 的状态泳道。整轮二十毫秒里，它只在十个时隙的开头各唤醒一次，每次不到 0.24 ms；这些深色段加起来是 1.94 ms，也就是整块 200 ms 的 0.97 %。',
  ],
  tryThis: [
    '载入“0.5 ms 时隙”，可以看到块内大部分时间空闲下来：三个轮次在 15 ms 时就全部完成，定位结果出现在 5、10、15 ms，编辑器规划出每块 40 轮而不是十轮。射频开启总时长不变。',
    '打开场景编辑器，在时隙那一栏输入 285 再移开焦点：它变为 300，282 也一样。两个都是整数个 RSTU，而只有 285 超过容量规则的要求，282 还差 1.8 µs——起限制作用的都是那条 300 RSTU 下限。',
  ],
  quiz: [
    {
      q: '一部手机占了块的十分之一，锚点占十分之三，可泳道上实测的射频开启时间只有 0.97 % 与 1.24 %。为什么？',
      options: [
        '状态泳道是对射频采样的，短的区间会被漏掉',
        '设备在时隙边界打开接收机，并在预期的那一帧接收完毕后立即关闭：它的射频开销由空口时间决定，不是由所占的时隙决定',
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
        '一轮缩到 5.0 ms，一个块装 40 轮而不是 10 轮——定位更快、手机更多——而射频开启的总时长不变',
      ],
      answer: 2,
      explain: '没有任何一帧变长，功耗自然也没变。时隙长度决定的是时延与容量，它的下界由最长那一帧和 300 RSTU 决定。',
    },
  ],
}
