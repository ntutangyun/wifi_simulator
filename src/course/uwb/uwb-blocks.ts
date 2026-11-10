/**
 * UWB Tier 1 · M16 会话网格 · Blocks, rounds and slots — in the standard-first shape (2026-11-10).
 *
 * ① what IEEE Std 802.15.4-2024 §10.32.2 / §10.32.3.3 specify for the ranging block, round and slot
 * (durations in RSTU, the RCM in slot 0, the ARC / RR / RDM IEs of a time-scheduled round, the
 * block structure set by the ARC IE's duration fields or by the higher layer, round hopping, the
 * receiver enabled only in expected slots); ② where this simulator follows that and where it picks
 * its own values and methods (the 200 ms block and 2 ms slot, the round length the method decides and
 * the smallest whole divisor of the block rounds it up to, round k to phone k, the responders reading
 * their slots off the RDM IE, no synchronisation); ③ five
 * guided runs, every figure of which is read back out of this file and compared with a run in
 * tests/course/uwb-blocks.test.ts.
 *
 * `FIG` and `uwbBlocksTiming` stay exported: `uwb-slot-budget` loads this lesson's scene and draws
 * its own figure from the same ten frames.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import { J, anchor, firstUwbPoll, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The second tag's round opening: the moment the block hands the grid to somebody else. */
const secondTagRound = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.node === 'uwb-2'
/** The first round of the second block: the whole schedule, repeating. */
const nextBlock = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.block === 1

/**
 * Four anchors on a 3.50 m ring around (5, 4) at 2.20 m, serving three phones
 * at desk height: one under the ring's centre and two off to the sides. The
 * only knob the variant turns is the ranging slot.
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
    { slot: 0, airUs: 217.885 }, { slot: 1, airUs: 190.192 }, { slot: 2, airUs: 190.192 },
    { slot: 3, airUs: 190.192 }, { slot: 4, airUs: 190.192 }, { slot: 5, airUs: 242.5 },
    { slot: 6, airUs: 188.141 }, { slot: 7, airUs: 188.141 }, { slot: 8, airUs: 188.141 },
    { slot: 9, airUs: 188.141 },
  ],
} as const

/**
 * Block → round → slot → frame, on one time axis. The window is exactly one
 * round, because that is the only scale at which all three levels are visible
 * at once: the top lane says which round of the block this window is, the middle
 * lane is that round cut into its ten slots, and the bottom lane is the ten
 * frames — each one a sliver pinned to the left edge of its own slot.
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
  why: '一个房间里有好几部手机，要同时各自测出距离。IEEE 802.15.4-2024 的多节点测距（§10.32）为此规定了三层时间结构：测距块（ranging block）由整数个测距轮（ranging round）组成，测距轮由整数个测距时隙（ranging slot）组成，各级时长都以 RSTU（ranging scheduling time unit）计；一个测距轮要足以完成一次完整的测量，一个测距时隙至少要能容纳一帧。按时间调度时，控制器知道所有受控设备：它在一轮的第 0 个时隙发出测距控制消息，用 RDM 信息单元为每个应答方指定时隙，用 RR 信息单元给出本轮的块号与轮号；块模式下块结构默认周期性重复。于是每台设备事先就知道自己在哪个时隙发送、在哪个时隙接收，设备之间不竞争信道，不需要退避（backoff），也不会发生碰撞。块长、时隙长、一轮有几个时隙、哪部手机使用哪一轮、轮里各帧的先后，标准都留给上层决定。本仿真器取块长 200 ms、时隙 2 ms，一轮的时隙数取既能容纳测距方法与锚点（anchor）数所需的时隙、又能整除块的最小值，第 k 部手机始终使用第 k 轮；块长与时隙长由场景设定，不写进帧里。代价是节奏固定：每部手机每个块只完成一次测量，块内空闲的轮可以留给后加入的手机。',
  outcomes: [
    '说出标准对测距块、测距轮与测距时隙各规定了什么，哪些长度与分配留给上层决定',
    '从日志中读出属于某一部手机的测距轮，并用块号、轮号与时隙号算出一帧的发送时刻',
    '分清首帧里的三个信息单元哪些照标准，本仿真器的哪些安排是它自己的取法',
  ],
  needs: ['uwb-frame', 'uwb-dstwr'],
  terms: [
    { term: 'block', plain: '测距块：一段用于测距的时间，由整数个测距轮组成；块模式下默认周期性重复' },
    { term: 'round', plain: '测距轮：足以完成一次完整测量的一段时间，由整数个测距时隙组成' },
    { term: 'slot', plain: '测距时隙：至少能容纳一帧的一段时间' },
    { term: 'RSTU', plain: '测距调度时间单位（ranging scheduling time unit）：编排块、轮、时隙所用的单位，HRP UWB 下是 416 个码片，约 833.33 ns' },
  ],
  standard: [
    { heading: '块、轮、时隙（§10.32.2，图 10-223）', text: '测距块是一段用于测距的时间，由整数个测距轮组成；测距轮是足以让参与的全部设备完成一次完整测量的一段时间，又分为整数个测距时隙；测距时隙至少要能容纳一帧测距帧。各级时长都以 RSTU 为单位（§10.29.1.5，表 10-145：HRP 超宽带（ultra-wideband, UWB）下为 416 个码片（chip），约 833.33 ns）。时隙长度与一轮的时隙数可以在轮与轮之间改变，由控制器发出新的控制消息实现。' },
    { heading: '两种调度方式（§10.32.1）', text: 'ARC 信息单元的 Schedule Mode 字段区分两种多节点测距。按时间调度时，控制器知道所有受控设备的身份，规定每一次发送的确切时刻，并用 RDM 信息单元选定参与的设备、指定它们的角色（发起方或应答方）与时隙；角色与时隙事先约定或经带外方式传达时，RDM 信息单元可以省略。另一种是基于竞争的测距，控制器可能不知道有哪些设备在场，后面的课再讲。' },
    { heading: '每一轮的第一帧（§10.32.2，§10.32.3.3）', text: '测距控制消息（ranging control message, RCM）由控制器在一轮的第 0 个时隙发出，配置本轮的测距参数；控制器与发起方是同一台设备时，控制阶段与测距启动阶段可以合并为一个阶段。块模式下，控制器用 ARC 信息单元与 RR 信息单元组成本轮的控制消息。RR 信息单元依次是块号（2 个字节）、轮跳转模式（1 位）与轮号（15 位）、发送偏移（2 个字节），共 6 个字节（§10.32.9.3，图 10-248）。块、轮、时隙都从 0 起编号。' },
    { heading: '块结构从哪里来（§10.32.3.3，§10.32.9.1）', text: '块模式下块结构默认周期性重复。它可以由 ARC 信息单元的三个时长字段给出——块长（以 RSTU 计）、轮长（以时隙个数计）、时隙长（以 RSTU 计），于是块内轮数 = 块长 ÷ 轮长，轮内时隙数 = 轮长 ÷ 时隙长；也可以由上层设定或固定，这时三个字段都可以不出现在帧里。一个会话使用块里的哪一轮由上层决定：设备可以在下一个块继续使用同一轮，控制器也可以让它跳到另一轮，跳转的判据不在标准范围之内。' },
    { heading: '只在预期有帧的时隙接收（§10.32.3.4）', text: '在多设备分时隙的测距里，上层可以用 MLME-RX-ENABLE.request 只在预期有帧到达的时隙打开接收机，而不让接收机一直开着；块结构使各设备能在不用的时隙关闭接收机以节省能量（§10.32.3.3）。' },
    { kind: 'steps', heading: '按时间调度的一轮，按标准：逐步说明', items: [
      '控制器（这里同时是发起方）在第 0 个时隙发出控制消息：ARC 信息单元的 Schedule Mode 为 1，RR 信息单元给出块号与轮号，RDM 信息单元列出各应答方及其时隙（§10.32.9.1、§10.32.9.3、§10.32.9.8）。',
      '控制器与发起方是同一台设备，控制消息与测距启动消息合在这一帧里（§10.32.2）。',
      '每个应答方在 RDM 信息单元指定的时隙发送应答；其余时隙里，它只在预期有帧到达时打开接收机（§10.32.3.4）。',
      '双边双向测距（double-sided two-way ranging, DS-TWR）还有发起方的测距最终消息（Final），以及测量报告阶段（§10.32.2，图 10-225）。',
      '一帧的发送时刻由块、轮、时隙的编号与时长直接算出。下一个块重复同样的结构，或按上层的决定跳到另一轮（§10.32.3.3）。',
    ] },
  ],
  implementation: [
    { topic: '三层结构与时间单位', standard: '块由整数个轮组成、轮由整数个时隙组成，时长以 RSTU 计（§10.32.2，§10.29.1.5）', sim: '照此：一个块 240 000 RSTU（200.0 ms），可容纳 10 轮；一轮 10 个时隙；一个时隙 2 400 RSTU（2 000.0 µs）。RSTU 取 416 个码片，即 833.333 ns。', kind: 'faithful' },
    { topic: '块长与时隙长', standard: '由控制器的上层决定，标准不给取值', sim: '块长 200 ms、时隙 2 ms，是 FiRa 规范档案里的取值（语料库里没有 FiRa 规范，无法核实）。', kind: 'value' },
    { topic: '一轮有几个时隙', standard: 'ARC 信息单元的轮长以时隙个数计，由控制器决定（§10.32.9.1）', sim: '由测距方法决定：双边双向测距每个锚点两个时隙再加两个，四个锚点时一轮 10 个时隙，即 20.0 ms。', kind: 'choice' },
    { topic: '块由整数个轮组成', standard: '一个块由整数个轮组成，块内轮数 = 块长 ÷ 轮长（§10.32.2，§10.32.3.3）', sim: '照此：所需的时隙数不能整除块内的时隙数时，一轮取能整除它的最小时隙数，多出的时隙空闲。删除一个锚点后本轮只需 8 个时隙，排成 10 个时隙的轮，即 20 ms，200 ms 的块正好容纳 10 轮。取最小的那个值是本仿真器的取法。', kind: 'faithful' },
    { topic: '块结构怎样告知', standard: '由 ARC 信息单元的三个时长字段给出，或由上层设定（§10.32.3.3）', sim: '由上层设定：三个长度来自场景配置，ARC 信息单元的 Content Control 为 0，不带时长字段。', kind: 'choice' },
    { topic: 'RR 信息单元', standard: '块号、轮跳转模式、轮号、发送偏移（§10.32.9.3）', sim: '照此：块号与轮号如实填写，轮跳转模式 0，发送偏移 0；连同 2 个字节的信息单元头共 8 个字节。', kind: 'faithful' },
    { topic: 'RDM 信息单元', standard: '按时间调度时为每个应答方指定角色与时隙；事先约定时可以省略（§10.32.1，§10.32.9.8）', sim: '照此：四个条目，每个条目 3 个字节，共 15 个字节；每个应答方从自己的条目读出时隙。没有收到控制消息的锚点不知道自己的时隙，既不作答，也不在其后的时隙打开接收机。', kind: 'faithful' },
    { topic: '哪部手机使用哪一轮', standard: '由上层决定；允许下一个块跳到另一轮（§10.32.3.3）', sim: '第 k 部手机始终使用第 k 轮，不跳转；发送偏移始终为 0。', kind: 'choice' },
    { topic: '一轮里各帧的先后', standard: '图 10-225 只给出示例：控制消息兼启动消息、各个应答、Final、测量报告', sim: '时隙 0 是手机的 Poll（控制消息兼启动消息），时隙 1 到 4 是四个锚点按名单顺序的 Response，时隙 5 是 Final，时隙 6 到 9 是四个锚点的 Report。', kind: 'choice' },
    { topic: '接收机何时开启', standard: '上层可以只在预期有帧的时隙打开接收机（§10.32.3.4）', sim: '照此：一个锚点只在 Poll、自己的 Response、Final 与自己的 Report 这四个时隙开启射频，在其他锚点的时隙里接收机关闭。', kind: 'faithful' },
    { topic: '设备之间的时间同步', standard: '设备依靠控制消息里的 ARC、RR 信息单元与块结构保持同步（§10.32.3.3）', sim: '未实现：时隙边界对每台设备都是同一纳秒，块与块之间不漂移，没有同步过程。', kind: 'absent' },
    { topic: '预期的帧没有到达', standard: '§10.34 定义了可选的测距消息未收到交互（后面的课再讲）', sim: '本课不使用它：在时隙边界停止等待，写一条 UWB_TIMEOUT，这一轮照常进行；随后的 Final 不再包含那个锚点。', kind: 'choice' },
    { topic: '参与的设备', standard: '每条控制消息都可以用 RDM 信息单元重新选定参与的设备（§10.32.9.8）', sim: '名单在运行开始之前确定，整个运行中不变：没有设备加入或离开，也没有会话建立。', kind: 'choice' },
    { topic: '定位', standard: '标准不定义定位', sim: '每一轮结束时用测到的距离解一次位置。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '第一轮：十个时隙，十帧',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一帧 Poll。',
        '逐帧向后查看到 20 ms，记下每一帧由谁在哪个时隙发出、从何时开始。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '三层嵌套，一条时间轴', spec: uwbBlocksTiming(),
          caption: '图上画的是第 0 块的第 0 轮。一个块 240 000 RSTU，200.0 ms，可容纳十轮；一轮 24 000 RSTU，20.0 ms；一轮划分为十个时隙，每个 2 400 RSTU，2 000.0 µs。最下面一行是这一轮实际发送的十帧，每一帧都从自己时隙的左边界开始，其余时间空闲。',
        },
        { kind: 'table', heading: '第 0 块第 0 轮的十帧', head: ['时隙', '发送方', '帧', '开始时刻'], rows: [
          ['0', 'uwb-1', 'Poll', '0 ms'],
          ['1', 'anchor-1', 'Response', '2 ms'],
          ['2', 'anchor-2', 'Response', '4 ms'],
          ['3', 'anchor-3', 'Response', '6 ms'],
          ['4', 'anchor-4', 'Response', '8 ms'],
          ['5', 'uwb-1', 'Final', '10 ms'],
          ['6', 'anchor-1', 'Report', '12 ms'],
          ['7', 'anchor-2', 'Report', '14 ms'],
          ['8', 'anchor-3', 'Report', '16 ms'],
          ['9', 'anchor-4', 'Report', '18 ms'],
        ] },
      ],
      expect: '十帧各自从时隙边界开始，每个时隙只有一台设备发送；日志里没有退避，也没有帧间间隔。',
      meaning: '每个时隙只属于一台设备、发送时刻事先算定，这是按时间调度的含义（①）；时隙按什么先后排列，是本仿真器的取法（②）。',
    },
    {
      heading: '首帧带来了什么',
      jump: 0,
      steps: [
        '停在第一帧 Poll 上，打开帧检查器。',
        '逐个查看信息单元一栏。',
      ],
      blocks: [
        { kind: 'table', heading: '第一帧 Poll 的信息单元（整帧 42 字节）', head: ['信息单元', '长度', '帧检查器显示的内容'], rows: [
          ['ARC', '5 字节', '多节点模式 1（一对多） · 测距轮用途 2（DS-TWR） · 分组配置 1（SP1） · 调度模式 1（按时间调度） · 延后模式 1 · 时间结构 1（块式） · 有效轮数 1 · MMRCR 0 · Content Control 0x00（不带块长、轮长、时隙长与会话标识）'],
          ['RR', '8 字节', 'Ranging Block Index 0 · Hopping Mode 0 · Round Index 0 · Transmission Offset 0'],
          ['RDM', '15 字节', '4 台设备：anchor-1 时隙 1、anchor-2 时隙 2、anchor-3 时隙 3、anchor-4 时隙 4'],
        ] },
      ],
      expect: 'ARC 信息单元只带控制位，Content Control 为 0x00；RR 信息单元写着块号 0、轮号 0；RDM 信息单元列出四个锚点与它们的时隙 1 到 4。',
      meaning: '三个信息单元都按标准的格式（①）；块长、轮长、时隙长不在帧里，由场景设定，这是标准允许的「由上层设定」（②）。每个锚点从自己的 RDM 条目读出时隙（①、②）。',
    },
    {
      heading: '三部手机，三轮，一个块',
      jump: 2,
      steps: [
        '跳到整个块重新开始的那一刻，再往回看第 0 块的三轮。',
        '对照下表读出各轮何时开始、每部手机何时得到位置。',
      ],
      blocks: [
        { kind: 'table', heading: '前两个块里的三轮', head: ['手机', '轮号', '第 0 块里开始', '第 1 块里开始', '第 0 块的定位'], rows: [
          ['uwb-1', '0', '0 ms', '200 ms', '(5.01, 3.99) m at 20 ms'],
          ['uwb-2', '1', '20 ms', '220 ms', '(3.01, 2.52) m at 40 ms'],
          ['uwb-3', '2', '40 ms', '240 ms', '(7.50, 6.01) m at 60 ms'],
        ] },
      ],
      expect: '每部手机每个块只有一轮，第 k 轮始终属于第 k 部手机；十轮里只使用了三轮，其余七轮（每块 140 ms）始终没有开启。每部手机每秒得到五次定位，误差都在 3 cm 以内，定位在自己那一轮的末尾给出。',
      meaning: '块结构周期性重复是块模式的默认行为（①）；哪部手机用哪一轮、从不跳转，是本仿真器的取法（②）。',
    },
    {
      heading: '用编号算出发送时刻',
      jump: 1,
      steps: [
        '跳到第二部手机的轮次开始。',
        '用它的块号、轮号与时隙号算出 Poll 与 Final 的发送时刻，再与日志比较。',
      ],
      blocks: [
        { kind: 'table', heading: '第 2 部手机的那一轮', head: ['步骤', '数值'], rows: [
          ['它的块号与轮号', '0 · 1'],
          ['于是这一轮开始于', '1 × 20.0 ms = 20 ms'],
          ['它的 Poll 在时隙 0 发出', '20 000 000 ns'],
          ['它的 Final 在时隙 5 发出', '30 000 000 ns'],
          ['这一轮结束，随即给出定位', '40 000 000 ns'],
        ] },
      ],
      expect: '日志里的时刻与算出的完全相同：一帧的发送时刻 = 块号 × 块长 + 轮号 × 轮长 + 时隙号 × 时隙长，无需协商。',
      meaning: '块、轮、时隙从 0 起编号，块号与轮号由 RR 信息单元给出（①）；时隙边界对所有设备都精确一致，是本仿真器的简化（②）。',
    },
    {
      heading: '少一个锚点',
      steps: [
        '打开场景编辑器，删除一个锚点。',
        '查看 UWB 会话那一栏的规划行。',
      ],
      expect: '规划行仍是“每轮 10 个时隙 · 每块 10 轮”：本轮只需 8 个时隙，一轮仍排 20 ms，后 2 个时隙空闲；块长保持 200 ms。',
      meaning: '8 个时隙的轮是 16 ms，200 ms 不是它的整数倍；标准要求一个块由整数个轮组成（①），本仿真器于是取能整除块的最小轮长 10 个时隙，块里正好 10 轮（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.32.1（两种调度方式，RDM 信息单元可以省略）、§10.32.2 与图 10-223（块、轮、时隙，控制消息在第 0 个时隙，控制阶段与启动阶段可以合并）、图 10-225（双边双向测距一轮的示例）、§10.32.3.3（块模式，块结构的来源，轮的跳转）、§10.32.3.4（只在预期有帧的时隙打开接收机）、§10.32.9.1（ARC 信息单元的时长字段）、§10.32.9.3 与图 10-248（RR 信息单元）、§10.32.9.8（RDM 信息单元）、§10.29.1.5 与表 10-145（RSTU = 416 个码片，约 833.33 ns）。',
    '本仿真器的取值与取法：200 ms 的块与 2 ms 的时隙（FiRa 规范档案里的取值，语料库中无法核实）、一轮的时隙数由测距方法决定并取能整除块的最小值、第 k 部手机始终使用第 k 轮、轮里各帧的先后、时隙边界对所有设备精确一致、漏收时只写超时记录、每轮末尾解一次位置。',
  ],
  limits: [],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: '0.5 ms 时隙', scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('第一帧 Poll，从时隙边界开始', firstUwbPoll),
    J('第二部手机的轮次开始', secondTagRound),
    J('整个块重新开始', nextBlock),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '三部手机同时想测距，为什么日志里一次碰撞都没有？',
      options: [
        '它们的脉冲很短，即使发生碰撞也互不影响',
        '每一帧的发送时刻在发送之前就由块号、轮号与时隙号确定，一个时隙只属于一台设备',
        '锚点会先侦听信道，信道忙时不发送',
      ],
      answer: 1,
      explain: '按时间调度时，控制器事先为每个应答方指定时隙（§10.32.1）；碰撞不是被避免的，而是根本不会发生。',
    },
    {
      q: '一部手机为什么每 200 ms 才得到一次定位，而不是每 20 ms？',
      options: [
        '解算需要将近一个块的时间',
        '它的那一轮在每个块里只出现一次，而定位在这一轮的末尾给出',
        '四个锚点每轮只能各测一次距离',
      ],
      answer: 1,
      explain: '轮长决定一次测量需要多久，块长决定它多久重复一次；本仿真器让第 k 轮始终属于第 k 部手机。',
    },
    {
      q: '哪一项是本仿真器自己的安排，而不是标准的规定？',
      options: [
        'RR 信息单元带块号与轮号',
        '第 k 部手机始终使用第 k 轮',
        '一个测距时隙至少要能容纳一帧',
      ],
      answer: 1,
      explain: '一个会话使用块里的哪一轮由上层决定，标准还允许下一个块跳到另一轮（§10.32.3.3）；另外两项是 §10.32.9.3 与 §10.32.2 的规定。',
    },
  ],
}
