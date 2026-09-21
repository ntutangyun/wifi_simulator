/**
 * UWB Tier 3 · M16 · The ranging capstone · Locate the phone in this flat.
 *
 * The closing exercise of the UWB track, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). It is a
 * brief, not a walkthrough: one flat, one phone, three anchors, a Wi-Fi
 * neighbour on the same megahertz, and three decisions the learner takes and
 * then defends against the numbers the simulator gives back — where the third
 * anchor goes, how often a block runs, and whether the session should ask all
 * three anchors in one round instead of one at a time.
 *
 * The scene is the hallway house: two rooms with a hallway between them, every
 * wall brick. The phone stands in Room B with two anchors beside it and the
 * third across the hallway wall, so exactly one of the three ranges carries the
 * excess delay of an obstructed path — the bias the learner has to find. The
 * router sits in the hallway on 6 GHz channel 71, inside UWB channel 5's band,
 * so the session also pays a coexistence price it can measure.
 *
 * The one-to-many variant runs at the default 600 RSTU slot with three
 * responders, which is the shortest legal MMS slot: fragments in that round are
 * one slot per responder plus one apart, not a millisecond apart, and the
 * engine measures the clock ratio over that real spacing.
 *
 * Every number quoted below is pinned in tests/course/uwb-capstone.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-capstone en` prints the section budgets.
 */
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { NodeCfg, Scenario } from '../../model/scenario'
import {
  J, LESSON_6G_WIDTH_MHZ, N, anchor, firstUwbAoa, firstUwbPoll, firstUwbPosition, firstUwbRange,
  hallwayHouse, node, uwbSc, uwbTag, wifi6g, type Lesson,
} from '../lessonKit'

/** Which scene the brief runs: the flat as it stands, the third anchor moved into the far
 * room, a block twice as often, or one round that asks all three anchors at once. */
export type UwbCapstoneVariant = 'base' | 'farAnchor' | 'fastBlock' | 'oneToMany'

/** 802.11ax 6 GHz channel 71: 6265–6345 MHz, wholly inside UWB channel 5's band. */
export const WIFI_6G_CENTER_MHZ = 6305
/** Anchors on the ceiling, the phone at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0

/**
 * The three anchors as the flat has them: two on the far wall of Room B, either side of the
 * phone, and the third on the hallway side of the brick wall at x = 6. Each one faces the
 * room it serves, because a bearing is measured from the boresight and a ±90° field of view
 * centred on a wall is half wasted.
 */
export const CAPSTONE_ANCHORS: { id: string; name: string; x: number; y: number; yawDeg: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 9.5, y: 0.5, yawDeg: 135 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 7.5, yawDeg: -135 },
  { id: 'anchor-3', name: 'Anchor 3', x: 5.0, y: 4.0, yawDeg: 0 },
]
/** Where the learner's alternative puts Anchor 3: the far corner of Room A, two brick walls
 * from the phone instead of one. */
export const FAR_ANCHOR = { x: 0.5, y: 4.0 }
/** The phone, in the middle of Room B. */
export const TAG_POS = { x: 8.0, y: 4.0 }
/** The router, in the hallway, and the laptop backing up to it from the corner of Room B. */
export const ROUTER_POS = { x: 5, y: 1.0, z: 2.0 }
export const LAPTOP_POS = { x: 7, y: 6.5 }
/** A block every 100 ms instead of every 200: `fastBlock`'s only change. */
export const FAST_BLOCK_RSTU = 120_000

/** An anchor that knows which way it is pointing, and where this variant puts it. */
function capstoneAnchor(a: typeof CAPSTONE_ANCHORS[number], variant: UwbCapstoneVariant): NodeCfg {
  const far = variant === 'farAnchor' && a.id === 'anchor-3'
  const n = anchor(a.id, a.name, far ? FAR_ANCHOR.x : a.x, far ? FAR_ANCHOR.y : a.y, ANCHOR_Z)
  return { ...n, uwb: { ...n.uwb!, yawDeg: a.yawDeg } }
}

/**
 * The flat: a Wi-Fi 7 router and a laptop backing up to it, three UWB anchors and one phone.
 * The Wi-Fi nodes are listed first, so the 6 GHz link is built — and its mediator decided —
 * before the ranging session asks for one.
 *
 * `base`, `farAnchor` and `fastBlock` run DS-TWR with angle of arrival on, on UWB channel 5,
 * with the obstructed-path delay charged. `oneToMany` instead runs the P802.15.4ab
 * multi-millisecond mode with every anchor in one round, at the 600 RSTU slot that is the
 * shortest an MMS round may use.
 */
export function uwbCapstoneScenario(variant: UwbCapstoneVariant = 'base'): Scenario {
  const ap = node('ap', 'Router', 'ap', ROUTER_POS.x, ROUTER_POS.y, 'eht', 'idle',
    { edca: true, txop: true, ampdu: true }, ROUTER_POS.z)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', LAPTOP_POS.x, LAPTOP_POS.y, 'backup')
  const nodes = [
    ap, laptop,
    ...CAPSTONE_ANCHORS.map((a) => capstoneAnchor(a, variant)),
    uwbTag('uwb-1', 'Phone', TAG_POS.x, TAG_POS.y, TAG_Z),
  ]
  const session = variant === 'oneToMany'
    ? {
      mode: 'mms' as const, method: 'ss' as const, slotRstu: 600, aoa: false, nlos: true, channel: 5 as const,
      mms: { ...DEFAULT_UWB_SESSION.mms, oneToMany: true, nbChannels: [3], report: 'bi' as const },
    }
    : {
      method: 'ds' as const, nlos: true, aoa: true, channel: 5 as const,
      ...(variant === 'fastBlock' ? { blockRstu: FAST_BLOCK_RSTU } : {}),
    }
  return uwbSc(hallwayHouse(), nodes, session, { sixGhzCenterMhz: WIFI_6G_CENTER_MHZ })
}

export const uwbCapstone: Lesson = {
  id: 'uwb-capstone',
  module: 16,
  title: { en: 'Locate the phone in this flat', zh: '在这套房子里把手机定位出来' },
  why: {
    en: 'Every lesson so far handed you a scene and asked you to read it. This one hands you a flat and three decisions, and the scene is whatever you decide. A phone has to be located to within half a metre, in a home with a router in the hallway and brick between the rooms. You choose where the third anchor goes, how often the session measures, and whether the anchors answer one at a time or all at once — and then you defend the choice with the log.',
    zh: '在此之前的每一课，都是先给你一个场景，再让你去读懂它。这一课给你的是一套房子和三个决定，而场景取决于你怎么决定。要求是：在一套走廊里放着路由器、房间之间隔着砖墙的住宅里，把一部手机定位到半米以内。第三个锚点摆在哪儿、会话多久量一次、锚点是一个一个作答还是一起作答，都由你来定——然后，你要用日志来为自己的选择辩护。',
  },
  outcomes: [
    { en: 'pick an anchor placement and justify it with the fixes it produced, not with the picture', zh: '选定一种锚点布置，并用它产生的定位结果——而不是用示意图——为它辩护' },
    { en: 'price a faster measurement rate in the airtime and the interference it costs', zh: '用它花掉的空口时间和招来的干扰，给"量得更勤"标出价格' },
    { en: 'say what one round for every anchor buys and what it gives up', zh: '说清"一轮问遍所有锚点"买到了什么、又让出了什么' },
    { en: 'find the one range in this flat that is biased, and name the mechanism', zh: '找出这套房子里那个有系统偏差的距离，并说出它的成因' },
  ],
  needs: ['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist'],
  terms: [
    { term: 'brief', plain: {
      en: 'the requirement you are working to: what has to be true when you are finished',
      zh: '你要完成的任务书：做完之后必须成立的那件事',
    } },
    { term: 'duty cycle', plain: {
      en: 'how much of the time the ranging session is actually on the air',
      zh: '测距会话真正占用空口的时间占比',
    } },
  ],
  picture: [
    { heading: { en: 'The flat, and what is asked of it', zh: '这套房子，以及对它的要求' }, text: {
      en: 'Two rooms with a hallway between them, brick everywhere. The phone sits in the right-hand room. Two anchors are already on its far wall, one at each end, and a third stands in the hallway. A router in that hallway is talking to a laptop on the same megahertz the ranging session uses. The brief: the phone must be placed to within half a metre, and you must be able to say why.',
      zh: '两个房间，中间夹着一条走廊，隔断全是砖。手机在右手边那个房间里。它对面的墙上已经装了两个锚点，一头一个，第三个立在走廊里。而走廊里那台路由器，正用着和测距会话相同的那段兆赫在和一台笔记本通信。任务书是：把手机定位到半米以内，而且你要说得出为什么。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'Read the flat as it stands', zh: '先把现状读一遍' }, text: {
      en: 'Load the simulation and jump to the first fix. Do nothing else yet: read one block end to end, and count what it produced and what it lost. That run is the baseline every decision below is argued against.',
      zh: '载入仿真，跳到第一次定位。先别动别的：把一个块从头读到尾，数清它产出了什么、又丢掉了什么。这一次运行，就是下面每个决定都要拿来对照的基准。',
    } },
    { heading: { en: 'Decision one: where the third anchor goes', zh: '决定其一：第三个锚点摆在哪儿' }, text: {
      en: 'Two anchors on one wall cannot fix a point; the third decides the geometry. Put it far away and the angles open out, which is what a good fix wants. Put it far away and it is also behind more brick, which is what a frame you have to hear does not want. The variant moves it into the far room, and the two wishes pull against each other in public.',
      zh: '同一面墙上的两个锚点定不出一个点，几何形状由第三个说了算。把它放远，张角就打开了，这正是一次好定位想要的。可把它放远，它也就躲到了更多砖墙后面，而这正是一帧你必须听见的信号最不想要的。变体把它挪到了另一个房间，两个愿望于是当众较起劲来。',
    } },
    { heading: { en: 'Decision two: how often to measure', zh: '决定其二：多久量一次' }, text: {
      en: 'A block is one measurement. Run blocks twice as often and the phone is tracked twice as smoothly — and the session is on the air twice as much, so it meets the router twice as often and loses twice as many frames to it. Nothing about the accuracy of a single fix improves. Only the duty cycle moves, and the price is paid in somebody else’s throughput.',
      zh: '一个块就是一次测量。让块的节奏快一倍，手机的轨迹就跟得平滑一倍——代价是会话占用空口的时间也多了一倍，于是它撞上路由器的次数翻倍，被路由器打掉的帧也翻倍。单次定位的精度一点没变。变的只有 duty cycle，而这笔账是记在别人的吞吐上的。',
    } },
    { heading: { en: 'Decision three: one round, or three', zh: '决定其三：一轮，还是三轮' }, text: {
      en: 'So far the phone has asked each anchor in turn. The multi-millisecond mode lets it ask once and be answered by all three: one train goes out, every anchor hears the same one, and each answers in a slot of its own. It is fewer transmissions for the same three ranges — and a longer round, in which a lost fragment costs every anchor at once instead of one.',
      zh: '到目前为止，手机都是挨个去问每一个锚点。多毫秒模式让它问一次、由三个锚点一起作答：一串片段发出去，每个锚点听到的都是同一串，各自在自己的时隙里回话。同样是三个距离，发射的次数更少——但一轮也更长，而且这一轮里丢掉一个片段，代价是三个锚点一起承担，而不是只损失一个。',
    } },
    { heading: { en: 'The one-sided error you are meant to find', zh: '你应该找出来的那个单向误差' }, text: {
      en: 'One of the three ranges in this flat is not merely noisy; it is wrong the same way every block. Look for the anchor whose straight line to the phone passes through something, and compare its reported distance with the truth printed beside it. Noise is symmetric and averages away. This does not, and a fix that averages it will sit off in one direction.',
      zh: '这套房子里的三个距离中，有一个不只是"有噪声"，它每个块都朝同一个方向错。去找那个与手机之间的直线要穿过东西的锚点，把它报出的距离和旁边印着的真值比一比。噪声是对称的，平均之后就没了。这个不是；而把它一起平均进去的定位结果，会朝着一个方向偏出去。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The four scenes over seven blocks', zh: '四个场景，七个块' }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'Fixes', zh: '定位' }, { en: 'Of them, three-range', zh: '其中三距离交汇' },
      { en: 'Timeouts', zh: '超时' }, { en: 'Lost to Wi-Fi', zh: '被 Wi-Fi 打掉' },
    ], rows: [
      [{ en: 'The flat as it stands', zh: '现状' }, N('20'), N('5'), N('18'), N('6')],
      [{ en: 'Anchor 3 in the far room', zh: '锚点 3 挪到另一个房间' }, N('10'), N('0'), N('40'), N('4')],
      [{ en: 'A block every 100 ms', zh: '每 100 ms 一个块' }, N('36'), N('9'), N('36'), N('12')],
      [{ en: 'One round for all three', zh: '一轮问遍三个' }, N('7'), N('7'), N('0'), N('14')],
    ] },
    { text: {
      en: 'One 1300 ms window throughout. Every other fix is a single anchor’s bearing: another measurement, not a cheaper one.',
      zh: '全部取自同一个 1300 ms 窗口。其余的定位都是单个锚点测出的方位：那是另一种测量，不是廉价版。',
    } },
    { kind: 'table', heading: { en: 'The three ranges of the base flat', zh: '现状下的三个距离' }, head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'True', zh: '真值' }, { en: 'Mean error', zh: '平均误差' }, { en: 'Why', zh: '成因' },
    ], rows: [
      [N('anchor-1'), N('3.99 m'), N('−0.02 m'), { en: 'clear path, timestamp noise only', zh: '直视路径，只有时间戳噪声' }],
      [N('anchor-2'), N('3.99 m'), N('−0.00 m'), { en: 'clear path, timestamp noise only', zh: '直视路径，只有时间戳噪声' }],
      [N('anchor-3'), N('3.23 m'), N('+0.60 m'), { en: 'one brick wall: obstructed-path excess delay, model', zh: '一道砖墙：遮挡路径的额外时延，模型取值' }],
    ] },
    { kind: 'formula', heading: { en: 'What the bias does to the fix', zh: '这个偏差对定位的影响' }, text: {
      en: 'three-range fix: mean error 0.55 m, worst 0.57 m, GDOP 1.25',
      zh: '三距离交汇的定位：平均误差 0.55 m，最差 0.57 m，GDOP 1.25',
    }, note: {
      en: 'The spread is tiny and the offset is nearly the whole error: one range reads long every block, and a solver with no reason to distrust it pushes that straight into the answer. Good geometry does not help, because nothing here is random.',
      zh: '离散度极小，而误差几乎全是那个固定的偏移：有一个距离每个块都偏长，而一个没有理由去怀疑它的解算器，把这份偏长原样推进了答案里。好的几何条件救不了它，因为这里出错的东西根本不是随机的。',
    } },
    { kind: 'table', heading: { en: 'What a good answer contains', zh: '好答案长什么样' }, head: [
      { en: 'Decision', zh: '决定' }, { en: 'A good answer', zh: '好答案长什么样' },
    ], rows: [
      [{ en: 'Anchor 3', zh: '锚点 3' }, { en: 'Keeps it in the hallway, and prices the alternative: the far room halves the fixes, doubles the timeouts and leaves no three-range fix at all. Does not read the surviving bearings’ smaller error as an improvement.', zh: '把它留在走廊里，并给另一种选择标价：挪到另一个房间会让定位次数减半、超时翻倍，而且一次三距离交汇的定位也剩不下。也不会把剩下那些测向结果更小的误差当成变好了。' }],
      [{ en: 'Block rate', zh: '块的节奏' }, { en: 'Notices that it buys smoothness, not accuracy: the fix error is unchanged while airtime, timeouts and losses to Wi-Fi all roughly double.', zh: '看出它买到的是平滑而不是精度：定位误差没变，而空口占用、超时数和被 Wi-Fi 打掉的接收都大致翻倍。' }],
      [{ en: 'One round or three', zh: '一轮还是三轮' }, { en: 'Weighs three ranges either way against far fewer transmissions and a longer round; puts the price where a fragment is lost, since all three then suffer together.', zh: '看出两种做法都是三个距离，而一轮制换来发射次数少得多、但一轮更长；并把代价放在丢片段的时刻——那时三个一起受损。' }],
      [{ en: 'The bias', zh: '那个偏差' }, { en: 'Names anchor-3, gives its sign and size from the log, blames the obstructed path rather than noise, and says why averaging cannot remove it.', zh: '点名 anchor-3，从日志里给出偏差的符号与大小，归因于遮挡路径而非噪声，并说清为什么取平均消不掉。' }],
      [{ en: 'Honesty', zh: '诚实' }, { en: 'States the residual it cannot explain, in the log’s own units, instead of fitting it away.', zh: '把解释不了的残差如实说出来，用日志自己的单位，而不是拟合掉。' }],
    ] },
  ],
  deeper: [
    { heading: { en: 'Why the fix is barely better than the worst range', zh: '为什么定位结果并不比最差的那个距离好多少' }, text: {
      en: 'A least-squares fix over three ranges has no redundancy at all: three unknowns would be two coordinates and nothing else, so with three ranges the residual has one degree of freedom left. A single biased range therefore moves the answer almost as much as it is biased, and the residual the solver reports stays small — the fix is consistent with the data, and the data is wrong. A fourth anchor is the cheapest thing that would let the solver notice.',
      zh: '在三个距离上做最小二乘，几乎没有任何冗余：未知量是两个坐标，于是三个距离只留下一个自由度给残差。所以单个有偏的距离，几乎会把答案挪动它自己那么多，而解算器报出的残差却依然很小——结果和数据是自洽的，只是数据本身错了。要让解算器察觉到这一点，最便宜的办法就是加第四个锚点。',
    } },
    { heading: { en: 'The quality byte was there all along', zh: '品质字节一直都在' }, text: {
      en: 'Every range in the log carries a figure of merit, and the obstructed one carries a worse one than its neighbours. Nothing in this simulator\'s solver reads it. A deployment that did would weight the three ranges instead of trusting them equally, which is the single change that would most improve this flat — and it costs no airtime at all.',
      zh: '日志里每一个距离都带着一个品质因子，而那个被遮挡的距离，它的品质因子比邻居差。本仿真器的解算器完全没有去读它。一个会去读它的部署，会对三个距离加权，而不是一视同仁地相信它们；这是对这套房子改善最大的那一个改动——而且它一点空口时间也不花。',
    } },
    { heading: { en: 'What this flat does not model', zh: '这套房子没有建模的东西' }, text: {
      en: 'The phone does not move, the furniture does not move, and nobody stands between the phone and an anchor. In a real flat the dominant error is a body: several decibels and several nanoseconds, appearing and vanishing on the timescale of a block. Every conclusion above is about a static room, and saying so is part of the write-up.',
      zh: '手机不动，家具不动，也没有人站在手机和锚点之间。在真实的住宅里，最主要的误差来源是人体：几分贝、几纳秒，而且出现与消失的时间尺度就和一个块差不多。上面所有结论讲的都是一个静态房间——把这一点写出来，也是这份报告的一部分。',
    } },
  ],
  sources: [
    { en: 'The ranging block and slot structure, the two-way ranging exchange and the ranging counter are §10.32.2, §10.32.3 and §10.29 of IEEE Std 802.15.4-2024; the multi-millisecond mode, its one-to-many round and its narrowband control plane are P802.15.4ab (4ab draft 15-22/0381r5 Table 1.6.3.1 and §1.1).',
      zh: '测距块与时隙结构、双向测距交互、测距计数器，见 IEEE Std 802.15.4-2024 的 §10.32.2、§10.32.3 与 §10.29；多毫秒模式、它的一对多轮次以及它的窄带控制面，见 P802.15.4ab（4ab 草案 15-22/0381r5 Table 1.6.3.1 与 §1.1）。' },
    { en: 'The 200 ms ranging block and the 2 ms ranging slot are FiRa’s profile, not standard text; 600 RSTU is the shortest slot this simulator allows an MMS round, because two slots must hold the round’s longest narrowband message.',
      zh: '200 ms 的测距块与 2 ms 的测距时隙来自 FiRa 的配置文件，不是标准正文；600 RSTU 是本仿真器允许 MMS 轮次使用的最短时隙，因为两个时隙必须装得下这一轮里最长的那条窄带消息。' },
    { en: 'Model choices in this flat, named so you can argue with them: the excess delay a brick wall adds to an obstructed path, the 100 ps of 1-σ timestamp noise it is measured against, the −12 dB signal-to-interference floor below which a reception is lost to Wi-Fi, and the least-squares solver that weights every range equally.',
      zh: '这套房子里的模型取值，列出来方便你质疑：砖墙给遮挡路径增加的额外时延、用来衡量它的每个时间戳 100 ps 的 1σ 噪声、低于就判为被 Wi-Fi 打掉的 −12 dB 信干比门限，以及那个对每个距离一视同仁的最小二乘解算器。' },
    { en: 'Angle of arrival from the phase difference between two antennas, and its ±90° field of view, are this simulator’s two-element model; the standard’s own AoA support is §10.32 and Clause 16.',
      zh: '由两根天线之间的相位差得到到达角、以及它 ±90° 的视场，都是本仿真器的双阵元模型；标准自身对到达角的支持见 §10.32 与第 16 章。' },
  ],
  scenario: () => uwbCapstoneScenario('base'),
  variants: [
    { label: { en: 'Anchor 3 in the far room', zh: '锚点 3 挪到另一个房间' }, scenario: () => uwbCapstoneScenario('farAnchor') },
    { label: { en: 'A block every 100 ms', zh: '每 100 ms 一个块' }, scenario: () => uwbCapstoneScenario('fastBlock') },
    { label: { en: 'One round for all three', zh: '一轮问遍三个' }, scenario: () => uwbCapstoneScenario('oneToMany') },
  ],
  jumps: [
    J('the poll opens a round', 'Poll 帧开启一轮', firstUwbPoll),
    J('a range falls out', '一个距离算出来了', firstUwbRange),
    J('the phone is placed', '手机被定位出来', firstUwbPosition),
    J('an anchor measures a bearing', '锚点测出一个方位', firstUwbAoa),
  ],
  observe: [
    { en: 'Read one block of the base flat end to end: three ranges, three bearings, one three-anchor fix. Then read the UWB_RANGE line from anchor-3, compare it with the truth beside it, and look at its quality byte.', zh: '把现状下的一个块从头读到尾：三个距离、三个方位、一次三锚点定位。然后读 anchor-3 那条 UWB_RANGE，把它和旁边的真值比一比，再看看它的品质字节。' },
    { en: 'Count the UWB_TIMEOUT lines in the base flat and in the far-anchor variant: 18 against 40. Every extra one is a slot that waited for an answer that was never loud enough to arrive.', zh: '分别数一数现状和"锚点挪远"变体里的 UWB_TIMEOUT：18 条对 40 条。多出来的每一条，都是一个时隙在等一个根本不够响、到不了的回答。' },
    { en: 'In the one-to-many variant, find a UWB_MMS_TRAIN line and read its responder list. One train, three names: the whole saving, in one line.', zh: '在"一轮问遍三个"的变体里找一条 UWB_MMS_TRAIN，读它的应答者名单。一串片段，三个名字：省下来的东西，全在这一行里。' },
  ],
  tryThis: [
    { en: 'Write your three decisions down before you load anything, with the number you expect each to move. Then run all four scenes and mark yourself against the table. A wrong prediction is worth more here than a right one.', zh: '在载入任何东西之前，先把三个决定写下来，并写明你预期每个决定会让哪个数字怎么变。然后把四个场景都跑一遍，对照上表给自己打分。在这里，预测错了比对了更有价值。' },
    { en: 'Subtract the mean anchor-3 error from every anchor-3 range and re-solve one block’s fix by hand. That correction is worth more than a fourth anchor — and it is the one thing the session cannot measure for itself.', zh: '把 anchor-3 的平均误差从它的每一个距离里扣掉，再手算一个块的定位。这次修正带来的收益比加第四个锚点还大——而它恰恰是会话自己量不出来的那一样东西。' },
  ],
  quiz: [
    {
      q: { en: 'Moving Anchor 3 into the far room opens the angles. What happens instead?', zh: '把锚点 3 挪到另一个房间会把张角打开。实际发生的却是什么？' },
      options: [
        { en: 'The angles open and the fix gets correspondingly better', zh: '张角打开了，定位也相应地变好了' },
        { en: 'It goes behind a second brick wall, its answers stop arriving, and no three-range fix is left', zh: '它躲到了第二道砖墙后面，回答再也到不了，于是一次三距离交汇的定位也剩不下' },
        { en: 'The solver refuses anchors in another room', zh: '解算器不接受别的房间里的锚点' },
      ],
      answer: 1,
      explain: { en: 'Half the fixes disappear and the timeouts double. What survives is single-anchor bearings, whose smaller error is a different measurement, not a better one.', zh: '定位次数少了一半，超时翻了一倍。剩下的是单锚点的测向结果，它误差更小，只是因为它是另一种测量，而不是更好的测量。' },
    },
    {
      q: { en: 'What does halving the block interval buy?', zh: '把块的间隔减半，买到的是什么？' },
      options: [
        { en: 'A more accurate fix, because more measurements average better', zh: '更准的定位，因为测量次数多了，平均起来更好' },
        { en: 'More fixes per second, at twice the airtime; each fix is exactly as accurate', zh: '每秒更多次定位，代价是空口占用翻倍；而每一次定位的精度分毫未变' },
        { en: 'Fewer receptions lost to Wi-Fi, because each block is shorter', zh: '被 Wi-Fi 打掉的接收更少，因为每个块更短了' },
      ],
      answer: 1,
      explain: { en: 'A block is not averaged with its neighbours here. Doubling the rate doubles the fixes, the airtime and the losses alike.', zh: '这里一个块并不会和相邻的块做平均。节奏翻倍，定位次数、空口占用和损失也一起翻倍。' },
    },
    {
      q: { en: 'Why can averaging not remove the anchor-3 error?', zh: '为什么取平均消不掉 anchor-3 的误差？' },
      options: [
        { en: 'There are not enough blocks to average over', zh: '块的数量还不够多，平均不起来' },
        { en: 'It is the same sign every block: it is a delay added to the path, not noise around it', zh: '它每个块的符号都一样：它是加在路径上的一段时延，而不是围绕路径的噪声' },
        { en: 'The solver discards the third range', zh: '解算器把第三个距离丢掉了' },
      ],
      answer: 1,
      explain: { en: 'Averaging kills a symmetric error. An obstructed path is always longer, never shorter, so the mean keeps the whole of it.', zh: '取平均能杀死对称的误差。而遮挡路径只会更长、不会更短，所以平均之后它原封不动地留着。' },
    },
  ],
}
