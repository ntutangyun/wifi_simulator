/**
 * UWB Tier 1 · M15 会话网格 · Blocks, rounds and slots.
 *
 * The lessons before this one measured one distance inside a single round. This
 * one zooms out to the grid that round sits in: a ranging block that repeats,
 * one round to a tag, one frame to a slot, and three phones that never once
 * collide because the timetable was written before the first frame flew.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M15). This is the FIRST half of the old lesson, which §2 splits in two
 * because "its quizzes and both experiments belong to its second topic". What
 * left for `uwb-slot-budget` (same scene, same variant, `sameSceneAs`):
 *  - 「为什么时隙比帧长这么多」 and the `margin` term;
 *  - 「醒着，和分到手，是两回事」, the radio-cost table and its paragraph;
 *  - the slot-fit formula, the two-slot-lengths table, and all three `deeper`
 *    paragraphs (the 300 RSTU floor, where the 2 ms of margin goes, and how
 *    1 943 565 ns is made up);
 *  - the 0.5 ms experiment, the 285 → 300 snap, and both quiz questions.
 * What arrives here: §4's `timing` figure and one new quiz. The experiment that
 * stayed is the anchor deletion, because 2N + 2 slots to a round is step 1 of
 * THIS lesson's procedure and the editor's plan line is a grid claim.
 *
 * §5.4 deletes the 「三重嵌套的节拍」 table — "prose a diagram now says better" —
 * and its three RSTU/duration pairs are in the figure's caption, which is where
 * the pin that used to read its cells now reads them.
 *
 * Every number quoted below is pinned in tests/course/uwb-blocks.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-blocks` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import { J, anchor, firstUwbPoll, firstUwbPosition, firstUwbRoundEnd, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The second tag's round opening: the moment the block hands the grid to somebody else. */
const secondTagRound = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.node === 'uwb-2'
/** The first round of the second block: the whole schedule, repeating. */
const nextBlock = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.block === 1

/**
 * Four anchors on a 3.50 m ring around (5, 4) at 2.20 m, serving three phones
 * at desk height: one under the ring's centre and two off to the sides. The
 * anchors are unchanged from the earlier ranging scenes on purpose — what this
 * lesson varies is the session's own grid, not the geometry — and the only
 * knob the variant turns is the ranging slot.
 */
export function uwbBlocksScenario(slotRstu: number): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2),
    anchor('anchor-2', 'Anchor 2', 5, 7.5, 2.2),
    anchor('anchor-3', 'Anchor 3', 1.5, 4, 2.2),
    anchor('anchor-4', 'Anchor 4', 5, 0.5, 2.2),
    uwbTag('uwb-1', 'Phone 1', 5, 4, 1.0),
    uwbTag('uwb-2', 'Phone 2', 3, 2.5, 1.0),
    uwbTag('uwb-3', 'Phone 3', 7.5, 6, 1.0),
  ], { method: 'ds', nlos: false, slotRstu })
}

/**
 * The figures of the grid, as `roundPlan` computes them from the session: one
 * block of 240 000 RSTU, one round of ten 2 400-RSTU slots, and the ten frames
 * that round actually radiates. Every value is read back out of the run and out
 * of the engine in tests/course/uwb-blocks.test.ts.
 */
export const FIG = {
  blockRstu: 240_000, blockMs: '200.0 ms',
  roundRstu: 24_000, roundMs: '20.0 ms', roundUs: 20_000,
  slotRstu: 2_400, slotUs: 2_000, slots: 10,
  /** Each frame of the round: the slot it sits in and how long it is on the air, in µs. */
  frames: [
    { slot: 0, airUs: 216.09 }, { slot: 1, airUs: 181.218 }, { slot: 2, airUs: 181.218 },
    { slot: 3, airUs: 181.218 }, { slot: 4, airUs: 181.218 }, { slot: 5, airUs: 236.603 },
    { slot: 6, airUs: 191.474 }, { slot: 7, airUs: 191.474 }, { slot: 8, airUs: 191.474 },
    { slot: 9, airUs: 191.474 },
  ],
} as const

/**
 * Block → round → slot → frame, on one time axis. The window is exactly one
 * round, because that is the only scale at which all three levels are visible
 * at once: at block scale a 2 ms slot is under two viewBox units wide and the
 * ten of them merge into a bar. So the top lane says which round of the block
 * this window is, the middle lane is that round cut into its ten slots, and the
 * bottom lane is the ten frames — each one a sliver pinned to the left edge of
 * its own slot, which is the lesson's whole claim about contention.
 */
export function uwbBlocksTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '块 0', spans: [{ label: '轮 0 · uwb-1，十轮之一', fromUs: 0, toUs: FIG.roundUs }] },
      { label: '轮 0', spans: FIG.frames.map((f) => ({
        label: String(f.slot), fromUs: f.slot * FIG.slotUs, toUs: (f.slot + 1) * FIG.slotUs,
      })) },
      { label: '发帧', spans: FIG.frames.map((f) => ({
        label: f.slot === 0 ? 'Poll' : f.slot === 5 ? 'Final' : undefined,
        fromUs: f.slot * FIG.slotUs, toUs: f.slot * FIG.slotUs + f.airUs, tone: 'accent' as const,
      })) },
    ],
    axis: { fromUs: 0, toUs: FIG.roundUs, ticks: [0, 10_000, 20_000], unit: 'µs' },
  }
}

export const uwbBlocks: Lesson = {
  id: 'uwb-blocks',
  module: 16,
  title: '块、轮与时隙',
  why: '一个房间里有好几部手机，想同时各自测出距离。如果换成 Wi-Fi 链路（link），它们会争用空口：先侦听、再等待、退避（backoff）、重试。本课的测距会话用的是调度式测距（标准 §10.32.1 定义的两种多节点测距之一，另一种竞争式测距后面一课再讲）：在任何设备发送之前先排定时间表，每台设备只需按自己那一行执行。这张表分为三层（§10.32.2）：整张表是一个测距块（ranging block），在块模式下默认周期性重复，本课在整个运行中不更新它；块内是若干测距轮（ranging round），本课让每部手机分到自己的一轮、第 k 轮始终属于第 k 部手机——这是本课的分配，标准还允许下一个块跳到别的轮；轮内再划分为等长的测距时隙（ranging slot），标准只要求一个时隙至少能容纳一帧，本课让每个时隙只传输一帧、只属于一台设备。于是一帧的发送时刻由乘法直接算出，无需协商：块号乘块长，加轮号乘轮长，加时隙号乘时隙长；这张表由手机发出的开场帧带给各个锚点（anchor）。在本课里，任何设备都不需要侦听信道、退避或重传（retry），碰撞根本不会发生；一台设备如果没有收到预期的帧，就在时隙边界停止等待，这一轮照常进行到结束，只是缺少那个锚点。代价是节奏也是固定的：每部手机每个块只定位一次（定位是本课在测距之后加上的计算，标准不涉及），定位结果在自己那一轮的末尾给出；块内空闲的轮，正好留给后加入的手机。',
  outcomes: [
    '从日志中读出属于某一部手机的测距轮（ranging round），并说出它属于哪部手机',
    '说明为什么测距会话中任何设备都不需要先侦听、退避或重传（retry）',
    '用块号、轮号与时隙号算出一帧的发送时刻',
  ],
  needs: ['uwb-frame', 'uwb-dstwr'],
  terms: [
    { term: 'block', plain: '整张时间表，由整数个测距轮组成；块模式下默认周期性重复' },
    { term: 'round', plain: '足以完成一次完整测量的一段时间，一次测量的全部帧都在其中；本课让每一轮属于一部手机' },
    { term: 'slot', plain: '时间表上的一行，至少能容纳一帧；本课的每个时隙只传输一帧' },
    { term: 'RSTU', plain: '编排这张时间表所用的单位，比一微秒略短（HRP UWB 下是 416 个码片）' },
  ],
  picture: [
    { heading: '一张无需协商的时间表', text: '超宽带（UWB）的调度式测距会话在任何设备发送之前就把时间分配完毕。整张时间表就是一个测距块（ranging block），本课在整个运行中按原样重复它（标准允许控制器更新块结构，本课不更新）。本课的会话里没有先侦听信道、没有帧间间隔、没有退避，也没有重传：每台设备在第一帧发出之前，就已经知道自己要发送的每一帧的发送时刻。' },
    { text: '在块内，本课让每部手机分到属于自己的一轮，其他设备不能占用；在一轮内，时间被划分为等长的测距时隙（ranging slot），本课的每个时隙恰好传输一帧——先是手机的请求，然后是各个锚点（anchor）按名单顺序的应答。这里用的测距方法是双边双向测距（DS-TWR）。' },
    { kind: 'watch', jump: 4, heading: '观察时间表的周期性重复', text: '载入仿真，按下播放。每次发送都恰好从时隙边界开始，三部手机依次轮到自己，然后整个时序从下一个块的开头重复。' },
    {
      kind: 'diagram', heading: '三层嵌套，一条时间轴', spec: uwbBlocksTiming(),
      caption: '图上画的是一部手机的那一轮。一个块 240 000 RSTU（ranging scheduling time unit），200.0 ms，可容纳十轮；一轮 24 000 RSTU，20.0 ms；一轮划分为十个时隙，每个 2 400 RSTU，2 000.0 µs。最下面一行是这一轮实际发送的十帧：时隙 0 是手机的 Poll，时隙 5 是它的 Final，其余八个是各锚点的 Response 与 Report。每一帧都从自己时隙的左边界开始，其余时间空闲。',
    },
    { heading: '时间表由第一帧携带', text: '锚点并非预先知道这张时间网格：这张表由手机发出的开场帧携带，形式是信息元素。按标准，ARC IE 说明测距方式、调度方式等控制位，块、轮、时隙的长度可以由它给出、也可以由上层设定；RR IE 说明本轮在块中的位置（块号与轮号）；RDM IE 逐一列出各应答方及其作答的时隙（§10.32.9.1、§10.32.9.3、§10.32.9.8）。本课的开场帧三个都带：ARC IE 只带控制位（三个长度由场景设定，不在帧里），RR IE 带块号与轮号，RDM IE 带应答方名单。' },
    { kind: 'watch', jump: 1, heading: '一个块，一次定位', text: '跳到第一部手机的那次定位。它出现在自己这一轮的末尾，下一次要等整整一个块——时间网格确定的不只是谁在何时发送，还有手机多久能得到一次自己的位置。' },
  ],
  numbers: [
    { text: '十轮中只有三轮分配给了手机，没有分配出去的那七轮合每块 140 ms。按本课一部手机一轮的分配，再增加一部手机，只需占用下一个空闲轮；要到第十一部，这个块才无法容纳。' },
    { kind: 'table', heading: '日志如何记录这张时间网格', head: [
      '内容', '日志内容',
    ], rows: [
      ['整轮那一行', 'uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs'],
      ['第 0 块的各轮何时开启', '0, 20 and 40 ms; block 1 at 200, 220 and 240 ms'],
      ['第 0 块的三帧 Poll 何时发出', '0, 20 000 000 and 40 000 000 ns'],
      ['携带这张网格的开场帧', 'Poll, 42 octets'],
      ['第一个信息单元（ARC IE：控制位），5 字节', '多节点模式 1（一对多） · 测距轮用途 2（DS-TWR） · 分组配置 1（SP1） · 调度模式 1（按时间调度） · 延后模式 1 · 时间结构 1（块式） · 有效轮数 1 · MMRCR 0 · Content Control 0x00（不带块长、轮长、时隙长与会话标识）'],
      ['第二个信息单元（RR IE：块号与轮号），8 字节', 'Ranging Block Index 0 · Hopping Mode 0 · Round Index 0 · Transmission Offset 0'],
      ['第三个信息单元（RDM IE：应答方名单），15 字节', '4 台设备：anchor-1 时隙 1、anchor-2 时隙 2、anchor-3 时隙 3、anchor-4 时隙 4'],
    ] },
    { kind: 'table', heading: '每部手机每块定位一次', head: [
      '手机', '它在第 0 块的定位',
    ], rows: [
      ['uwb-1', '(5.01, 3.99) m at 20 ms'],
      ['uwb-2', '(3.01, 2.52) m at 40 ms'],
      ['uwb-3', '(7.50, 6.01) m at 60 ms'],
    ] },
    { text: '每部手机每秒五次定位，不受另外两部手机的影响，每一次的误差都在 2 cm 以内。' },
    { kind: 'steps', heading: '本课的场景如何编排这张时间表', items: [
      '（本课的排法）三个长度中只有块长与时隙长是在第一帧发出之前确定、之后不再更改的。轮长由它们导出：测距方法决定时隙数，即每个锚点两个时隙再加两个，轮长就是这么多个时隙。标准的 ARC IE 可以直接给出块长、轮长（以时隙个数计）与时隙长，也可以由上层设定；本课属于后一种。',
      '（本课的分配）第 k 轮属于第 k 部手机，每个块都如此：这里三部手机分到第 0、1、2 轮。',
      '一个时隙的开始时刻由乘法直接算出，无需协商：块号乘块长，加轮号乘轮长，加时隙号乘时隙长。',
      '每个时隙开始时，时间表就指定唯一有权发送的那台设备：时隙 0 是手机的 Poll，接着四个是各锚点按名单顺序的 Response，第六个是 Final，最后四个是各自的 Report。各应答方的时隙由 RDM IE 指定（标准的做法），整轮的这种先后排法是本课的。',
      '其余设备将这个名字与自己的 id 比较，只为属于自己的那几帧开启射频；在其他锚点的时隙里，一个锚点的接收机是关闭的。标准允许上层只在预期有帧的时隙打开接收机（§10.32.3.4），本课的设备都这样做。',
      '（本课的行为）打开接收机却没有收到任何帧的设备不会重传：等待在时隙边界到期，日志记录是哪个时隙、等待的是哪种帧，这一轮照常进行；随后的 Final 不再包含那个锚点。',
    ] },
    { kind: 'table', heading: '第 2 部手机的那一轮在时间轴上的位置', head: [
      '步骤', '数值',
    ], rows: [
      ['它的块号与轮号', '0 · 1'],
      ['于是这一轮开始于', '1 × 20.0 ms = 20 ms'],
      ['它的 Poll 在时隙 0 发出', '20 000 000 ns'],
      ['它的 Final 在时隙 5 发出', '30 000 000 ns'],
      ['这一轮结束，随即给出定位', '40 000 000 ns'],
    ] },
  ],
  limits: [
    { kind: 'out-of-scope', text: '这张时间表是理想的：时隙边界对每台设备都是同一纳秒，块与块之间不漂移，也没有设备需要与它对齐。真实部署中每台设备用自己的晶振按这张表计时，20 ppm 的偏差在一个 200 ms 的块内累积为每边 4 µs，所以真实的会话必须依靠周期性同步使各成员重新对齐时间网格。本课没有这一整套机制，于是「第一帧发出之前就已算定」在这里是严格意义上的精确。' },
    { kind: 'out-of-scope', text: '「按时间调度时，控制器知道所有受控设备」这个前提在本课是直接给定的：轮询帧逐一指定应答方之前，名单已经存在。名单从何而来——控制器不知道有哪些设备在场时，由谁来应答——要到那一课才讨论。', until: 'uwb-contention' },
    { kind: 'out-of-scope', text: '而名单一旦确定就不再改变：锚点与标签在运行开始之前就已确定，第 k 轮始终属于第 k 部手机，没有加入、没有离开，也没有会话建立或参数协商。本轨道后续课程中没有一课解除这一条——多对多那一课会在它自己的范围内重申同一点（那里的「N 倍」同样依赖名单固定不变）。真实设备依靠帧中的控制位加入或退出，名单逐轮变化。' },
    { kind: 'unmodelled', text: '没有重传，也没有任何管理面。一个时隙里预期的帧没有到达，日志记录一条 UWB_TIMEOUT，这一轮照常进行到结束；而真实设备在测距之外还要执行入网、密钥更新与参数下发，这些管理流程有确认与重传机制。本课的 UWB 帧中没有任何管理帧，所以本课那句「没有重传」说的是测距交互，不是整台设备。' },
    { kind: 'out-of-scope', text: '场景中的节点始终静止，没有速度，也没有轨迹。于是「每块一次定位、每秒五次」这个速率在本课没有代价：在真实系统中，定位速率决定了标签以多快的速度移动时仍能被跟踪，而静止的标签无法体现滞后、拖尾或跟踪丢失。想知道 200 ms 够不够，这个模型无法回答。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.32.2 定义了测距块、测距轮与测距时隙，并规定它们的长度都以 RSTU 为单位，此外不对长度作别的要求。§10.29.1.5 与表 10-145 把 RSTU 定为 416 个码片，在 499.2 Mchip/s 下即 833.333 ns。',
    '开场帧携带的那两张清单是信息元素：§10.32.9.1 的 ARC IE 说明测距方式、调度方式以及块、轮、时隙的长度，§10.32.9.3 的 RR IE 说明本轮在块中的位置（块号与轮号），§10.32.9.8 的 RDM IE 则逐一安排每个应答方在哪个时隙作答。本课把块号与轮号放进了 ARC IE，没有单独的 RR IE，这一点与标准不同。§10.32.3.3 说明块模式下的轮次跳变，本课不使用。',
    '2 ms 的测距时隙与 200 ms 的测距块是 FiRa 规范档案里的取值，不是标准正文。',
  ],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: '0.5 ms 时隙', scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('第一帧 Poll，从时隙边界开始', firstUwbPoll),
    J('第一部手机的定位', firstUwbPosition),
    J('它的轮次结束', firstUwbRoundEnd),
    J('第二部手机的轮次开始', secondTagRound),
    J('整个块重新开始', nextBlock),
  ],
  observe: [
    '整轮那一行依次给出手机、轮次、块、方法，再给出时隙数与时隙长度。各轮依次开启，每部手机一轮；第三部完成后，整个块从头重复。',
    '每次发送都从时隙边界开始，精确到纳秒；泳道上没有帧间间隔、没有退避取值，也没有网络分配向量（NAV）。那七个没有分配出去的轮次始终没有开启。',
  ],
  tryThis: [
    '打开场景编辑器，删除一个锚点，再看 UWB 会话那一栏：“每轮 8 个时隙 · 每块 12 轮”——本方法的一轮是 2N + 2 个时隙（这是本课的轮次排法）。轮长从 20 ms 降到 16 ms，块长保持不变。',
  ],
  quiz: [
    {
      q: '三部手机同时想测距，为什么日志里一次碰撞都没有？',
      options: [
        '它们的脉冲很短，即使发生碰撞也互不影响',
        '每一帧的发送时刻在发送之前就由块号、轮号与时隙号确定，一个时隙只属于一台设备',
        '锚点会先侦听信道，信道忙时不发送',
      ],
      answer: 1,
      explain: '碰撞不是被避免的，而是根本不会发生。',
    },
    {
      q: '一部手机为什么每 200 ms 才得到一次定位，而不是每 20 ms？',
      options: [
        '解算需要将近一个块的时间',
        '它的那一轮在每个块里只出现一次，而定位在这一轮的末尾给出',
        '四个锚点每轮只能各测一次距离',
      ],
      answer: 1,
      explain: '轮长决定一次测量需要多久，块长决定它多久重复一次；第 k 轮始终属于第 k 部手机。',
    },
  ],
}
