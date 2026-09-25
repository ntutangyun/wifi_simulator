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
 *    1 934 334 ns is made up);
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
    { slot: 0, airUs: 206.859 }, { slot: 1, airUs: 181.218 }, { slot: 2, airUs: 181.218 },
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
  module: 14,
  title: '块、轮与时隙',
  why: '一个房间里有好几部手机，想同时各自测出距离。换成一条 Wi-Fi 链路（link），它们会为空口争起来：先听、再等、退避（backoff）、重来。测距会话反其道而行：在任何人开口之前先把时间表写好，每台射频只管读自己那一行。这一课讲的就是这张表由什么拼成、每一块归谁。',
  outcomes: [
    '从日志里读出属于某一部手机的那一回合——测距轮（ranging round）——并说出它归谁',
    '说清为什么测距会话里没有谁需要先听、退避或重传（retry）',
    '用块号、轮号与时隙号算出一帧该在哪一刻发出',
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'block', plain: '整张时间表；只要会话还活着，它就一遍遍重复' },
    { term: 'round', plain: '块里属于某一部手机的那一轮：一次测量的全部帧都在这里面' },
    { term: 'slot', plain: '时间表上的一行——里面只走一帧，别无他物' },
    { term: 'RSTU', plain: '写这张时间表所用的单位：测距时隙时间单元，比一微秒短不少' },
  ],
  picture: [
    { heading: '一张无需商量的时间表', text: '超宽带（UWB）的测距会话在任何人发送之前就把时间分配完毕。整张日程就是一个测距块（ranging block），只要会话还在就原样重复下去。里面没有先听信道、没有帧间间隔、没有退避、也没有重传：每台设备在第一帧起飞之前，就已经知道自己要发的每一帧发生在哪一刻。' },
    { text: '块的内部，每部手机分到属于自己的一轮，别人插不进来；一轮的内部，时间被切成等长的测距时隙（ranging slot），每个时隙恰好走一帧——先是手机的提问，然后是各个锚点（anchor）的回答，各就各位。这里用的测距方法是双边双向测距（DS-TWR）。' },
    { kind: 'watch', jump: 4, heading: '看它又转回来', text: '载入仿真，按下播放。每次发送都恰好压在时隙边界上，三部手机依次轮到自己，然后整个图案从下一个块的开头重来。' },
    {
      kind: 'diagram', heading: '三层嵌套，一条时间轴', spec: uwbBlocksTiming(),
      caption: '图上画的是一部手机的那一轮。一个块 240 000 RSTU（ranging slot time unit），200.0 ms，装得下十轮；一轮 24 000 RSTU，20.0 ms；轮里切成十个时隙，每个 2 400 RSTU，2 000.0 µs。最下面一行是这一轮真正发出去的十帧：时隙 0 是手机的 Poll，时隙 5 是它的 Final，其余八个是各锚点的 Response 与 Report。每一帧都紧贴自己时隙的左边界，其余时间空着。',
    },
    { heading: '时间表随第一帧一起飞', text: '锚点并不是生来就知道这张网格的：它随手机那一帧开场帧飞过来，形式是两张小清单——一张说明本轮落在会话的什么位置，另一张逐个点名锚点、写清它在哪个时隙作答。' },
    { kind: 'watch', jump: 1, heading: '一个块，一次定位', text: '跳到第一部手机的那次定位。它落在自己这一轮的末尾，下一次要等整整一个块——网格定下的不只是谁何时说话，还有多久才知道一次自己在哪儿。' },
  ],
  numbers: [
    { text: '十轮里只有三轮有主人，空着的那七轮合每块 140 ms。再加一部手机，代价不过是下一个空轮；要到第十一部，这个块才装不下。' },
    { kind: 'table', heading: '日志是怎么写这张网格的', head: [
      '内容', '写的是',
    ], rows: [
      ['整轮那一行', 'uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs'],
      ['第 0 块的各轮何时开启', '0, 20 and 40 ms; block 1 at 200, 220 and 240 ms'],
      ['第 0 块的三帧 Poll 何时离开', '0, 20 000 000 and 40 000 000 ns'],
      ['带着这张网格的那帧开场帧', 'Poll, 39 octets'],
      ['第一张清单，10 字节', 'SP1 · DS-TWR · 块 0 · 轮 0 · 4 个应答方'],
      ['第二张清单，15 字节', '4 台设备：anchor-1 时隙 1、anchor-2 时隙 2、anchor-3 时隙 3、anchor-4 时隙 4'],
    ] },
    { kind: 'table', heading: '每块一部手机一次定位', head: [
      '手机', '它在第 0 块的定位',
    ], rows: [
      ['uwb-1', '(5.01, 3.99) m at 20 ms'],
      ['uwb-2', '(3.01, 2.52) m at 40 ms'],
      ['uwb-3', '(7.50, 6.01) m at 60 ms'],
    ] },
    { text: '每部手机每秒五次定位，另外两部在做什么都不影响，每一次的误差都在 2 cm 以内。' },
    { kind: 'steps', heading: '这张时间表是怎么写出来的', items: [
      '三个长度里只有块与时隙是起飞之前定下、之后再不重议的。轮是从它们里落出来的：测距方法给出时隙数，每个锚点两个再加两个，轮长就是这么多个时隙。',
      '第 k 轮归第 k 部手机，每个块都如此：这里三部手机分到第 0、1、2 轮。',
      '一个时隙什么时候开始是一次乘法，不是一场商量：块号乘块长，加轮号乘轮长，加时隙号乘时隙长。',
      '每个时隙一开始，时间表就点出唯一有权发送的那台设备：时隙 0 是手机的 Poll，接着四个是各锚点按名单顺序的 Response，第六个是 Final，最后四个是各自的 Report。',
      '其余各台把这个名字与自己的 id 一比，只为属于自己的那几帧开机；在别的锚点的时隙里，一个锚点的接收机是关着的。',
      '开了接收机却什么也没听到的设备没有重传可言：等待在时隙边界到期，日志记下哪个时隙、等的哪种帧，这一轮照常走下去；随后的 Final 把那个锚点漏掉。',
    ] },
    { kind: 'table', heading: '第 2 部手机的那一轮，定在时间轴上', head: [
      '步骤', '数值',
    ], rows: [
      ['它的块号与轮号', '0 · 1'],
      ['于是这一轮开始于', '1 × 20.0 ms = 20 ms'],
      ['它的 Poll 在时隙 0 发出', '20 000 000 ns'],
      ['它的 Final 在时隙 5 发出', '30 000 000 ns'],
      ['这一轮结束，定位随之落下', '40 000 000 ns'],
    ] },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.32.2 定义了测距块、测距轮与测距时隙，并规定块长与时隙长都以整数个 3 RSTU 计；§10.29.1.5 与表 10-145 把 RSTU 定为 416 个码片，在 499.2 Mchip/s 下即 833.333 ns。',
    '开场帧携带的那两张清单是信息元素：§10.32.9.1 的 ARC IE 把本轮定位在会话之中，§10.32.9.8 的 RDM IE 则逐一安排每个应答方的座位。',
    '2 ms 的测距时隙与 200 ms 的测距块是 FiRa 规范档案里的取值，不是标准正文。',
  ],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: '0.5 ms 时隙', scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('第一帧 Poll，压在时隙边界上', firstUwbPoll),
    J('第一部手机的定位', firstUwbPosition),
    J('它的轮次结束', firstUwbRoundEnd),
    J('第二部手机的轮次开始', secondTagRound),
    J('整个块重新开始', nextBlock),
  ],
  observe: [
    '整轮那一行依次写出手机、轮次、块、方法，再写出时隙数与时隙长度。各轮一个接一个开启，一部手机一轮；第三部做完，整个块又从头。',
    '每次发送都压在时隙边界上，精确到纳秒；泳道上没有帧间间隔、没有退避取值，也没有网络分配向量（NAV）。那七个没有主人的轮次从头到尾不曾开启。',
  ],
  tryThis: [
    '打开场景编辑器，删掉一个锚点，再看 UWB 会话那一栏：“每轮 8 个时隙 · 每块 12 轮”——本方法的一轮是 2N + 2 个时隙。轮长从 20 ms 掉到 16 ms，块长一动不动。',
  ],
  quiz: [
    {
      q: '三部手机同时想测距，为什么日志里一次碰撞都没有？',
      options: [
        '它们的脉冲太短，撞上了也互不影响',
        '每一帧发在哪一刻，起飞之前就由块号、轮号与时隙号算定了，一个时隙只属于一台设备',
        '锚点会先听信道，忙就让开',
      ],
      answer: 1,
      explain: '碰撞不是被避开的，是根本没有机会发生。',
    },
    {
      q: '一部手机的定位为什么每 200 ms 才落一次，而不是每 20 ms？',
      options: [
        '解算要花掉将近一个块的时间',
        '它的那一轮在每个块里只出现一次，而定位落在这一轮的末尾',
        '四个锚点每轮只能各测一次距离',
      ],
      answer: 1,
      explain: '轮长决定一次测量要多久，块长决定它多久重来一次；第 k 轮永远归第 k 部手机。',
    },
  ],
}
