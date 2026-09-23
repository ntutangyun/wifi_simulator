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
 * Mechanism before metaphor (2026-09-23): in a project lesson the `steps` block
 * is the learner's method, not the engine's loop — take the baseline out of the
 * phone's inspector, find the one-sided error in its ranges table before
 * anything is changed, load one variant at a time, compare row against row, and
 * hand the ranking in against the brief. Every figure it asks for is one the
 * screen actually shows: the position section's fix, truth and error, the ranges
 * table's measured/true/error/quality byte, and the two counters at the top of
 * the inspector. `solvePosition` computes a residual, but no record carries it
 * and the inspector never prints it, so the method never asks for one — the
 * error against the printed truth is the quality figure the reader can see.
 * The four-scene table is transposed for the same reason: a row is now a figure
 * and it names the record or counter it is read from.
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
    { en: 'price a faster measurement rate in the airtime and the interference it costs', zh: '用它花掉的空口时间和招来的干扰，给“量得更勤”标出价格' },
    { en: 'say what one round for every anchor buys and what it gives up', zh: '说清“一轮问遍所有锚点”买到了什么、又让出了什么' },
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
      en: 'Two rooms with a hallway between them, brick everywhere. The phone sits in the right-hand room. Two anchors are already on its far wall, one at each end, and a third stands in the hallway. A router in that hallway is talking to a laptop on the same megahertz the ranging session uses. What you are working to is called the brief: the phone must be placed to within half a metre, and you must be able to say why.',
      zh: '两个房间，中间夹着一条走廊，隔断全是砖。手机在右手边那个房间里。它对面的墙上已经装了两个锚点，一头一个，第三个立在走廊里。而走廊里那台路由器，正用着和测距会话相同的那段兆赫在和一台笔记本通信。你要做到的那件事，叫做任务书（brief）：把手机定位到半米以内，而且你要说得出为什么。',
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
      en: 'A block is one measurement. Run blocks twice as often and the phone is tracked twice as smoothly — and the session is on the air twice as much, so it meets the router twice as often and loses twice as many frames to it. Nothing about the accuracy of a single fix improves. What doubles is the share of the time the session spends transmitting, that is the duty cycle, and the throughput it takes is somebody else’s.',
      zh: '一个块就是一次测量。让块的节奏快一倍，手机的轨迹就跟得平滑一倍——代价是会话占用空口的时间也多了一倍，于是它撞上路由器的次数翻倍，被路由器打掉的帧也翻倍。单次定位的精度一点没变。翻倍的只是会话真正在发射的时间占比，也就是占空比；而为它让路的吞吐量，是别人的。',
    } },
    { heading: { en: 'Decision three: one round, or three', zh: '决定其三：一轮，还是三轮' }, text: {
      en: 'So far the phone has asked each anchor in turn. The multi-millisecond mode lets it ask once and be answered by all three: one train goes out, every anchor hears that same one, and each answers in a slot of its own. One exchange instead of three — bought with far more time on the air, because every gap in the train carries a fragment from every device in the round. The variant drops the bearings too: this mode measures distance only.',
      zh: '到目前为止，手机都是挨个去问每一个锚点。多毫秒模式让它问一次、由三个锚点一起作答：一串片段发出去，每个锚点听到的都是同一串，各自在自己的时隙里回话。一次交互顶掉三次——代价是空口时间多得多，因为这一串每隔一个间隔，就要轮次里的每台设备各发一个片段。这个变体还把测向一并去掉了：这个模式只量距离。',
    } },
    { heading: { en: 'The one-sided error you are meant to find', zh: '你应该找出来的那个单向误差' }, text: {
      en: 'One of the three ranges in this flat is not merely noisy; it is wrong the same way every block. Look for the anchor whose straight line to the phone passes through something, and compare its reported distance with the truth printed beside it. Noise is symmetric and averages away. This does not, and a fix that averages it will sit off in one direction.',
      zh: '这套房子里的三个距离中，有一个不只是“有噪声”，它每个块都朝同一个方向错。去找那个与手机之间的直线要穿过东西的锚点，把它报出的距离和旁边印着的真值比一比。噪声是对称的，平均之后就没了。这个不是；而把它一起平均进去的定位结果，会朝着一个方向偏出去。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'Four scenes, seven blocks', zh: '四个场景，七个块' }, head: [
      { en: 'Figure, and where it is read', zh: '数字，以及从哪里读' },
      { en: 'As it stands', zh: '现状' }, { en: 'Anchor 3 far', zh: '锚点 3 挪远' },
      { en: 'A block every 100 ms', zh: '每 100 ms 一个块' }, { en: 'One round for all three', zh: '一轮问遍三个' },
    ], rows: [
      [{ en: 'Fixes — the run’s UWB_POSITION lines', zh: '定位次数——运行里的 UWB_POSITION 记录' },
        N('20'), N('10'), N('36'), N('7')],
      [{ en: 'Of them, three-range — lines naming three anchors', zh: '其中三距离交汇——记录里写着三个锚点的那些' },
        N('5'), N('0'), N('9'), N('7')],
      [{ en: 'Timeouts — the inspector’s counter, UWB_TIMEOUT', zh: '超时——检视器里的 timeouts 计数，即 UWB_TIMEOUT' },
        N('18'), N('40'), N('36'), N('0')],
      [{ en: 'Lost to Wi-Fi — its neighbour, UWB_INTERFERED', zh: '被 Wi-Fi 打掉——它下面那行计数，即 UWB_INTERFERED' },
        N('6'), N('4'), N('12'), N('14')],
      [{ en: 'Transmissions — the phone’s and anchors’ TX_START', zh: '发射次数——手机与三个锚点的 TX_START' },
        N('44'), N('34'), N('81'), N('294')],
      [{ en: 'Air — those frames’ transmit time, added up', zh: '空口时间——就是上面那些帧的发射时长相加' },
        N('8.5 ms'), N('6.5 ms'), N('15.7 ms'), N('62.5 ms')],
    ] },
    { text: {
      en: 'One 1300 ms window each; a fix that is not three-range is one anchor’s bearing.',
      zh: '每一列都是同一个 1300 ms 窗口；凡不是三距离交汇的定位，都是某一个锚点单独测出的方位。',
    } },
    { kind: 'table', heading: { en: 'The base flat’s three ranges', zh: '现状下的三个距离' }, head: [
      { en: 'Anchor, in the phone’s ranges table', zh: '锚点——手机测距表里的一行' },
      { en: 'True', zh: '真值' }, { en: 'Mean error', zh: '平均误差' }, { en: 'Why', zh: '成因' },
    ], rows: [
      [N('anchor-1'), N('3.99 m'), N('−0.02 m'), { en: 'clear path', zh: '直视路径' }],
      [N('anchor-2'), N('3.99 m'), N('−0.00 m'), { en: 'clear path', zh: '直视路径' }],
      [N('anchor-3'), N('3.23 m'), N('+0.60 m'), { en: 'one brick wall: obstructed-path delay, model', zh: '一道砖墙：遮挡路径的额外时延，模型取值' }],
    ] },
    { kind: 'formula', heading: { en: 'What the bias does to the fix', zh: '这个偏差对定位的影响' }, text: {
      en: 'three-range fix: mean error 0.55 m, worst 0.57 m, GDOP 1.25',
      zh: '三距离交汇的定位：平均误差 0.55 m，最差 0.57 m，GDOP 1.25',
    }, note: {
      en: 'The spread is tiny; the offset is nearly the whole error, and a solver with no reason to distrust that range passes it on. Good geometry cannot help: nothing here is random.',
      zh: '离散度极小；误差几乎全是那个固定的偏移，而一个没有理由去怀疑那个距离的解算器，把这份偏长原样推了过去。好的几何条件救不了它，因为这里出错的东西根本不是随机的。',
    } },
    { heading: { en: 'Does anything meet the brief?', zh: '有谁达到要求了吗' }, text: {
      en: 'The offset alone is 0.60 m, so no scene keeps every fix inside half a metre. The second experiment does: take it off anchor-3’s ranges, re-solve, and the block lands 0.02 m out.',
      zh: '光那个偏移就有 0.60 m，所以没有哪个场景能把每一次定位都压在半米以内。第二个实验做到了：把这份偏移从 anchor-3 的距离里扣掉、再解一次，这个块就只差 0.02 m。',
    } },
    { kind: 'table', heading: { en: 'What a good answer contains', zh: '好答案长什么样' }, head: [
      { en: 'Decision', zh: '决定' }, { en: 'A good answer', zh: '好答案长什么样' },
    ], rows: [
      [{ en: 'Anchor 3', zh: '锚点 3' }, { en: 'Keeps it in the hallway: the far room halves the fixes, roughly doubles the timeouts and leaves no three-range fix. The surviving bearings’ smaller error is no improvement.', zh: '把它留在走廊里：挪到另一个房间会让定位次数减半、超时大致翻倍，而且一次三距离交汇的定位也剩不下。剩下那些测向结果误差更小，并不等于变好了。' }],
      [{ en: 'Block rate', zh: '块的节奏' }, { en: 'Buys smoothness, not accuracy: the fix error is unchanged while airtime, timeouts and losses all double exactly.', zh: '它买到的是平滑而不是精度：定位误差没变，而空口占用、超时数和被 Wi-Fi 打掉的接收都恰好翻倍。' }],
      [{ en: 'One round or three', zh: '一轮还是三轮' }, { en: 'Prices one exchange against three: far more transmissions and airtime, more lost to the router. Not cheaper, and it drops the bearings.', zh: '给“一次交互对三次”标价：发射次数与空口时间都多得多，被路由器打掉的也更多。它不更省，而且它把测向去掉了。' }],
      [{ en: 'The bias', zh: '那个偏差' }, { en: 'Names anchor-3, its sign and size from the log, the obstructed path rather than noise, and why averaging cannot remove it', zh: '点名 anchor-3，给出偏差的符号与大小，归因于遮挡路径而非噪声，并说清为什么取平均消不掉。' }],
      [{ en: 'The brief', zh: '任务要求' }, { en: 'Says plainly that no scene meets half a metre as it stands, names the correction that does, and quotes the error the inspector prints.', zh: '直说四个场景原样都达不到半米，点出那个能达标的修正，并照抄检视器打出来的那个误差。' }],
    ] },
    { kind: 'steps', heading: { en: 'The method, step by step', zh: '这套做法，一步一步' }, items: [
      { en: 'Take the baseline first: load the flat as it stands and open the phone’s inspector. Its position section prints the latest fix, the truth and the error between them; its ranges table, one row an anchor — measured, true, error, quality byte.',
        zh: '先取基线：按现状载入这套房子，打开手机的检视器。它的定位一栏打出最近一次定位、真值，以及两者之间的误差；它的测距表则每个锚点一行——测得的距离、真实的距离、误差、品质字节。' },
      { en: 'Find the one-sided error before you change anything: block after block, hold each measured distance against the true one beside it. Two stay within centimetres; one reads half a metre long every time, and its quality byte is the worse.',
        zh: '在动任何东西之前，先把那个单向误差找出来：一块接一块地，把每个测得的距离和旁边的真值比一比。有两个始终只差几厘米；有一个每次都偏长半米上下，而且它的品质字节也更差。' },
      { en: 'Write the first table’s figures down, then change one thing at a time: load one variant from the menu, never two, and read those same figures again after each.',
        zh: '把上面第一张表里的数字抄下来，然后一次只改一样：从菜单里载入一个变体，绝不要两个一起上；每载入一个，就把同样那几个数字再读一遍。' },
      { en: 'Compare row against row, not scene against scene: a decision is priced by what it left alone as much as by what it moved — doubling the air while the fix error stays put buys smoothness, not accuracy.',
        zh: '比的时候一行一行地比，而不是一个场景一个场景地看：一个决定值多少，既看它让什么动了，也同样看它让什么没动；空口时间翻了倍而定位误差纹丝不动，买到的就是平滑，不是精度。' },
      { en: 'Hold the ranking against the brief: does any scene keep every fix inside half a metre? Then hand in the decision you would take, the one you rejected and what rejected it, the biased range, and what this flat does not model.',
        zh: '拿这个排名去对任务书：有没有哪个场景，能把每一次定位都压在半米以内？然后交上来：你会选哪个决定；你否决了哪个、是什么否决了它；那个有偏的距离；还有这套房子没有建模什么。' },
    ] },
  ],
  deeper: [
    { heading: { en: 'Who pays when something is lost', zh: '东西丢了，谁来付账' }, text: {
      en: 'A fragment is lost at one receiver and nowhere else: capture and detection are decided per receiver, per fragment, so an anchor that misses one is the only anchor poorer for it. What costs all three at once is a message from the phone — the Poll that opens the round, or the phone’s own busy check on the control channel, which is the whole subject of the narrowband coexistence lesson. The airtime is the honest price of the one-to-many round; a shared risk of losing fragments is not.',
      zh: '一个片段的丢失只发生在某一个接收端，别处不受影响：捕获与检出都是逐接收端、逐片段判定的，所以漏掉一个片段的锚点，是唯一因此变穷的那一个。真正让三个一起受损的，是手机发出的消息——开启这一轮的那帧 Poll，或者手机自己在控制信道上的那次判忙，而后者正是窄带共存那一课的全部主题。一对多轮次该付的账是空口时间；至于“丢片段的风险大家一起担”，那不是它的账。',
    } },
    { heading: { en: 'Why the fix is barely better than the worst range', zh: '为什么定位结果并不比最差的那个距离好多少' }, text: {
      en: 'A least-squares fix over three ranges has one measurement to spare over its two unknowns — the floor coordinates, the height being held — and one degree of freedom is not enough for the fit to notice a lie. A single biased range therefore moves the answer almost as much as it is biased, and nothing the inspector prints says so: the fix is consistent with the data, and the data is wrong. A fourth anchor is the cheapest thing that would let the solver notice.',
      zh: '在三个距离上做最小二乘，只比两个未知量——地面上的两个坐标，高度是按住不动的——多出一个测量，而一个自由度不够让拟合看出哪条在说谎。所以单个有偏的距离，几乎会把答案挪动它自己那么多，而检视器打出来的东西没有一样会说破这件事：结果和数据是自洽的，只是数据本身错了。要让解算器察觉到这一点，最便宜的办法就是加第四个锚点。',
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
    { en: 'In the one-to-many variant, find a UWB_MMS_TRAIN line and read its responder list. One train, three names: the whole saving, in one line.', zh: '在“一轮问遍三个”的变体里找一条 UWB_MMS_TRAIN，读它的应答者名单。一串片段，三个名字：省下来的东西，全在这一行里。' },
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
