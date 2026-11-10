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
 * `npx tsx scripts/lesson-dump.ts uwb-capstone` prints it with its length.
 */
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { NodeCfg, Scenario } from '../../model/scenario'
import { J, LESSON_6G_WIDTH_MHZ, anchor, firstUwbAoa, firstUwbPoll, firstUwbPosition, firstUwbRange, hallwayHouse, node, uwbSc, uwbTag, wifi6g, type Lesson } from '../lessonKit'

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
  module: 31,
  title: '在这套住宅中完成手机定位',
  why: '此前的每一课，都是先给出一个场景，再由你去理解它。这一课给出的是一套住宅和三项决定，而场景取决于你如何决定。要求是：在一套走廊里有路由器、房间之间隔着砖墙的住宅中，把一部手机定位到半米以内，并用日志论证自己的选择。三项决定各有答案。第三个锚点（anchor）应当留在走廊里：移到另一个房间虽然增大了张角，它却位于第二道砖墙之后，应答无法送达，定位次数减半、超时大致翻倍，三距离交汇的定位一次也没有。把块的频率提高一倍，得到的是平滑而不是精度：每次定位的误差完全不变，会话的占空比（duty cycle）、超时次数和受路由器干扰而丢失的接收却一起翻倍，而为它让出的是其他设备的吞吐量。多毫秒（multi-millisecond, MMS）模式（P802.15.4ab 草案的内容，尚未成为标准）让三个锚点同时应答，一次交互代替三次，却要消耗多得多的发射次数和空口时间（airtime），受干扰丢失的接收也更多，而且本课的多毫秒场景不测向。真正妨碍达到要求的是一个单向误差：隔着砖墙的那个锚点，每个块测得的距离都偏长半米左右。这是遮挡路径带来的额外时延，不是噪声，无法通过取平均消除，而本课等权的最小二乘解算器又把它原样带入了定位结果——所以四个场景在不做修正时都达不到半米。扣除这一偏移后重新解算，误差只有几厘米；而那个距离的品质因数（figure of merit, FoM）一直比另外两条差，只是解算器从未使用它——在本课的模型里，品质因数只按直射路径是否穿墙取两个固定值之一。',
  outcomes: [
    '选定一种锚点布置，并用它产生的定位结果——而不是用示意图——论证这一选择',
    '用增加的空口时间（airtime）和带来的干扰，计算“提高测量频率”的代价',
    '说明“一轮询问所有锚点”带来了什么、又失去了什么',
    '找出这套住宅中存在系统偏差的那个距离，并说明其成因',
  ],
  needs: ['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist'],
  terms: [
    { term: 'brief', plain: '任务书：完成之后必须满足的要求' },
    { term: 'duty cycle', plain: '测距会话真正占用空口的时间占比' },
  ],
  picture: [
    { heading: '这套住宅，以及对它的要求', text: '两个房间，中间夹着一条走廊，隔墙全是砖墙。手机在右侧的房间里。它对面的墙上已经装了两个锚点，两端各一个，第三个设在走廊里。而走廊里的那台路由器，正使用与测距会话相同的频段与一台笔记本通信。你要满足的要求，称为任务书（brief）：把手机定位到半米以内，并且能够说明理由。' },
    { kind: 'watch', jump: 2, heading: '先分析现状', text: '载入仿真，跳到第一次定位。先不要改动任何设置：把一个块从头读到尾，统计它产生了什么结果、又丢失了什么。这一次运行，就是下面每项决定都要对照的基准。' },
    { heading: '决定一：第三个锚点的位置', text: '同一面墙上的两个锚点无法确定一个点，几何构型由第三个锚点决定。把它放远，张角就增大，这正是良好定位所需要的。但把它放远，它也就位于更多砖墙之后，而这对一帧必须被收到的信号恰恰最为不利。变体把它移到了另一个房间，两个要求于是直接冲突。' },
    { heading: '决定二：测量频率', text: '一个块就是一次测量。块的频率提高一倍，对手机轨迹的跟踪就平滑一倍——代价是会话占用空口的时间也增加一倍，于是它与路由器发生碰撞的次数翻倍，受路由器干扰而丢失的帧也翻倍。单次定位的精度完全不变。翻倍的只是会话实际发射的时间占比，也就是占空比（duty cycle）；而为它让出的吞吐量，属于其他设备。' },
    { heading: '决定三：一轮，还是三轮', text: '到目前为止，手机都是逐个询问每一个锚点。多毫秒（multi-millisecond, MMS）模式是 P802.15.4ab 草案的内容，它的一对多轮次让手机询问一次、由三个锚点同时应答：一串片段（fragment）发出后，每个锚点收到的都是同一串，各自在自己的时隙内回复。一次交互代替三次——代价是空口时间大幅增加，因为按本课的交错排法，每隔一个间隔，轮次中的每台设备都要各发送一个片段。这个变体还去掉了测向：本课的多毫秒场景只测距离、不测到达角（angle of arrival, AoA），这是本课的限制。' },
    { heading: '需要找出的单向误差', text: '这套住宅中的三个距离里，有一个不只是“有噪声”，它在每个块中都向同一方向偏离。找出与手机之间的直线路径被遮挡的那个锚点，把它报告的距离与旁边显示的真值进行比较。噪声是对称的，取平均之后就会消除。这个误差不是；把它一并纳入计算的定位结果，会向一个方向偏离。' },
  ],
  numbers: [
    { kind: 'table', heading: '四个场景，七个块', head: [
      '数字及其读取位置',
      '现状', '锚点 3 移远',
      '每 100 ms 一个块', '一轮测完三个锚点',
    ], rows: [
      ['定位次数——运行中的 UWB_POSITION 记录',
        '20', '10', '36', '7'],
      ['其中三距离交汇——记录中列出三个锚点的那些',
        '5', '0', '9', '7'],
      ['超时——检视器里的 timeouts 计数，即 UWB_TIMEOUT',
        '18', '40', '36', '0'],
      ['受 Wi-Fi 干扰丢失——其下一行的计数，即 UWB_INTERFERED',
        '6', '4', '12', '14'],
      ['发射次数——手机与三个锚点的 TX_START',
        '44', '34', '81', '294'],
      ['空口时间——上述各帧发射时长之和',
        '8.5 ms', '6.6 ms', '15.7 ms', '62.5 ms'],
    ] },
    { text: '每一列都对应同一个 1300 ms 窗口；凡不是三距离交汇的定位，都是由单个锚点测得的方位。' },
    { kind: 'table', heading: '现状下的三个距离', head: [
      '锚点——手机测距表中的一行',
      '真值', '平均误差', '成因',
    ], rows: [
      ['anchor-1', '3.99 m', '−0.02 m', '直视路径'],
      ['anchor-2', '3.99 m', '−0.00 m', '直视路径'],
      ['anchor-3', '3.23 m', '+0.60 m', '一道砖墙：遮挡路径的额外时延，模型取值'],
    ] },
    { kind: 'formula', heading: '这个偏差对定位的影响', text: '三距离交汇的定位：平均误差 0.55 m，最差 0.57 m，GDOP 1.25', note: '离散度极小；误差几乎全部来自那个固定偏移，而一个没有理由怀疑那个距离的解算器，把这一偏长量原样带入了结果。良好的几何条件也无法补偿它，因为这里的误差根本不是随机的。' },
    { heading: '是否有场景达到要求', text: '仅那个偏移就有 0.60 m，所以没有哪个场景能使每一次定位的误差都在半米以内。第二个实验做到了：从 anchor-3 的距离中扣除这一偏移、重新解算，这个块的误差就只有 0.02 m。' },
    { kind: 'table', heading: '合格答案的要点', head: [
      '决定', '合格答案的要点',
    ], rows: [
      ['锚点 3', '把它留在走廊里：移到另一个房间会使定位次数减半、超时大致翻倍，而且三距离交汇的定位一次也没有。剩下的测向结果误差更小，并不意味着定位变好了。'],
      ['块的频率', '它带来的是平滑而不是精度：定位误差不变，而超时次数和受 Wi-Fi 干扰丢失的接收都恰好翻倍；定位次数与空口占用则略少于翻倍——第十四个块恰好在窗口结束的时刻开始，只发出了一帧。'],
      ['一轮还是三轮', '计算“一次交互代替三次”的代价：发射次数与空口时间都多得多，受路由器干扰丢失的接收也更多。它并不更节省，而且去掉了测向。'],
      ['那个偏差', '指出 anchor-3，给出偏差的符号与大小，将其归因于遮挡路径而非噪声，并说明为什么取平均无法消除。'],
      ['任务要求', '明确指出四个场景在不做修正时都达不到半米，给出能够达标的修正方法，并如实引用检视器显示的误差。'],
    ] },
    { kind: 'steps', heading: '操作步骤', items: [
      '先建立基线：按现状载入这套住宅，打开手机的检视器。它的定位一栏显示最近一次定位、真值，以及两者之间的误差；它的测距表每个锚点一行——测得的距离、真实距离、误差、品质因数（figure of merit, FoM）。',
      '在改动任何设置之前，先找出那个单向误差：逐块把每个测得的距离与旁边的真值进行比较。有两个始终只差几厘米；有一个每次都偏长半米左右，而且它的品质因数也更差（本课按直射路径是否穿墙给出品质因数）。',
      '记下上面第一张表中的数字，然后每次只改变一项：从菜单中载入一个变体，不要同时改变两项；每载入一个，就重新读取同样的那几个数字。',
      '比较时逐行比较，而不是逐个场景地看：评价一项决定，既要看它改变了什么，也要看它没有改变什么；空口时间翻倍而定位误差完全不变，得到的就是平滑，而不是精度。',
      '用这个排序对照任务书：有没有哪个场景能使每一次定位的误差都在半米以内？然后提交：你选择哪项决定；你否决了哪项、依据是什么；那个有偏差的距离；以及这套住宅没有建模的内容。',
    ] },
  ],
  deeper: [
    { heading: '丢帧的代价由谁承担', text: '一个片段的丢失只发生在某一个接收端，其他接收端不受影响：在本课的模型里，捕获（acquisition）与检出都是按接收端、按片段分别判定的，所以漏收一个片段的锚点，是唯一因此受影响的锚点。真正使三个锚点同时受影响的，是手机发出的消息——开启这一轮的那帧 Poll，或者手机自己在窄带控制信道上的那次判忙（先听后发，草案中这部分仍有争议），而后者正是窄带共存那一课的主题。一对多轮次的代价是空口时间；至于“丢失片段的风险由所有锚点共同承担”，那不是它的代价。' },
    { heading: '为什么定位结果并不比最差的那个距离好多少', text: '在三个距离上做最小二乘，只比两个未知量——地面上的两个坐标，高度固定不变——多出一个测量，而一个自由度不足以让拟合识别出哪一条有偏差。所以单个有偏差的距离，几乎会使结果偏移与其偏差相当的量，而检视器显示的内容中没有任何一项会揭示这一点：结果与数据是自洽的，只是数据本身有误。要让解算器察觉这一点，成本最低的办法就是增加第四个锚点。' },
    { heading: '品质因数始终可用', text: '标准要求测距设备为每一个测距计数值给出一个测距品质因数（Ranging FoM，§10.29.1.7），内容是时间戳落在某个置信区间内的置信水平；真实接收机要从接收信号自己估计它。本课把它简化为按直射路径是否穿墙取两个固定值之一，附在日志里每一个距离上，所以那个被遮挡的距离，它的品质因数比另外两条差。本课的定位解算完全没有使用它。一个利用它的部署方案，会对三个距离加权，而不是同等对待它们；这是对这套住宅改善最大的一项改动——而且它不占用任何空口时间。' },
    { heading: '这套住宅没有建模的内容', text: '手机静止，家具静止，也没有人站在手机和锚点之间。在真实住宅中，最主要的误差来源是人体：几分贝、几纳秒，而且其出现与消失的时间尺度与一个块相当。上面所有结论针对的都是一个静态房间——写明这一点，也是这份报告的一部分。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '这套住宅的四个场景里都没有回波：每个接收机收到的只有直射路径，到达时刻是发射起点加 d / c，于是测距读到的永远只是直射的那一次到达。遮挡只使首径到达变晚：穿过的每种材料各增加一个固定的额外时延（砖 2.0 ns），与墙的厚度、入射角都无关，而墙只按平面图上的线段计算，没有高度。于是本课要找的那 +0.60 m 是一个固定值，而真实室内测距最难的一步——在一串先后到达的回波里认出首径——本课程从头到尾没有涉及。' },
    { kind: 'out-of-scope', text: '这条轨道中没有任何物体在移动。每台设备的位置固定在一个坐标上，模型里没有速度，UWB 链路的电平也只由距离与墙决定，不随时间衰落。所以「块的频率带来的是平滑而不是精度」只能作为推论提出：这里根本没有需要跟踪的轨迹，也没有会走到手机与锚点之间的人，而真实住宅中最大的误差来源正是人体，几分贝、几纳秒，出现与消失的时间尺度恰好与一个块相当。' },
    { kind: 'unmodelled', text: '解算器对每条测量同等对待，而且不做事后修正。本课的定位解算是等权的高斯—牛顿最小二乘：不按品质因数加权、不剔除异常值，拟合的残差既不用来重新加权，也不显示在日志与检视器里；块与块之间没有滤波、没有平滑、没有运动模型。所以「按品质因数加权是这套住宅中成本最低的改动」是读者需要自行得出的结论，而不是本仿真器能够运行的一个变体。' },
    { kind: 'unmodelled', text: '一个场景只有一条测距会话，而且它无需建立过程。哪台设备在哪个时隙发送，在会话开始之前就已给定，锚点坐标、标签高度与彼此的身份也都是事先已知的真值。于是整条轨道上看不到设备发现、入网、参数协商与密钥分发，也看不到两套互不相识的 UWB 系统争用同一段频谱——本课能测量的共存只有「与 Wi-Fi 共存」这一种，而它考虑的只是带内功率。' },
    { kind: 'unmodelled', text: '代价只用空口时间与时隙来衡量。本课不计算功率、电流或能量，也不直接给出占空比——任务书中的这一指标需要根据空口时间自行换算。但这条轨道始终在论证省电的优势：块之间让前端休眠、只接收不发送的胸牌、一帧闪发即可完成、窄带射频成本低。这些主张没有一条经过数值验证，而真实产品的取舍恰恰主要体现在这方面。' },
  ],
  sources: [
    '测距块与时隙结构见 IEEE Std 802.15.4-2024 的 §10.32.2 与 §10.32.3，双向测距交互见 §10.29.6，测距计数器见 §10.29.1.3；多毫秒模式、它的一对多轮次以及它的窄带控制面，见 P802.15.4ab（4ab 草案 15-22/0381r5 Table 1.6.3.1 与 §1.1）。',
    '200 ms 的测距块与 2 ms 的测距时隙来自 FiRa 的配置文件，不是标准正文；600 RSTU 是本课的场景允许 MMS 轮次使用的最短时隙，因为两个时隙必须容纳得下这一轮中最长的那条窄带消息。',
    '这套住宅中的模型取值，列出以便你质疑：砖墙给遮挡路径增加的额外时延、用来衡量它的每个时间戳 100 ps 的 1σ 噪声、低于该值即判为受 Wi-Fi 干扰丢失的 −12 dB 信干比门限，以及那个对每个距离同等对待的最小二乘解算器。',
    '由两根天线之间的相位差得到到达角、以及它 ±90° 的视场，都是本课的双阵元模型。标准只规定到达角作为测距结果怎样请求与上报（§10.29.8.4 的 RMI IE、§10.32.9.9 的 SRRR IE），没有规定怎样测出它。',
  ],
  scenario: () => uwbCapstoneScenario('base'),
  variants: [
    { label: '锚点 3 移到另一个房间', scenario: () => uwbCapstoneScenario('farAnchor') },
    { label: '每 100 ms 一个块', scenario: () => uwbCapstoneScenario('fastBlock') },
    { label: '一轮测完三个锚点', scenario: () => uwbCapstoneScenario('oneToMany') },
  ],
  jumps: [
    J('Poll 帧开启一轮', firstUwbPoll),
    J('算出一个距离', firstUwbRange),
    J('手机完成定位', firstUwbPosition),
    J('锚点测得一个方位', firstUwbAoa),
  ],
  observe: [
    '把现状下的一个块从头读到尾：三个距离、三个方位、一次三锚点定位。然后读取 anchor-3 的那条 UWB_RANGE，把它与旁边的真值进行比较，再查看它的品质因数。',
    '在“一轮测完三个锚点”变体中找一条 UWB_MMS_TRAIN，读取它的应答者名单。一串片段，三个名字：节省的内容，全部体现在这一行中。',
  ],
  tryThis: [
    '在载入任何场景之前，先把三项决定写下来，并写明你预期每项决定会使哪个数字如何变化。然后把四个场景都运行一遍，对照上表给自己评分。在这里，预测错误比预测正确更有价值。',
    '从 anchor-3 的每一个距离中扣除它的平均误差，再手工计算一个块的定位。这次修正带来的收益比增加第四个锚点还大——而它恰恰是会话自身无法测得的那一项。',
  ],
  quiz: [
    {
      q: '把锚点 3 移到另一个房间会增大张角。实际发生的是什么？',
      options: [
        '张角增大了，定位也相应变好',
        '它位于第二道砖墙之后，应答无法送达，于是三距离交汇的定位一次也没有',
        '解算器不接受其他房间中的锚点',
      ],
      answer: 1,
      explain: '定位次数减少了一半，超时增加了一倍。剩下的是单锚点的测向结果，它误差更小，只是因为它是另一种测量，而不是更好的测量。',
    },
    {
      q: '把块的间隔减半，得到的是什么？',
      options: [
        '更准确的定位，因为测量次数增加，平均效果更好',
        '每秒更多次定位，代价是空口占用翻倍；而每一次定位的精度完全不变',
        '受 Wi-Fi 干扰丢失的接收更少，因为每个块更短',
      ],
      answer: 1,
      explain: '这里一个块不会与相邻的块做平均。频率翻倍，定位次数、空口占用和损失也一起翻倍。',
    },
    {
      q: '为什么取平均消不掉 anchor-3 的误差？',
      options: [
        '块的数量还不够多，无法有效平均',
        '它在每一个块的符号都相同：它是附加在路径上的一段时延，而不是围绕真实路径长度波动的噪声',
        '解算器把第三个距离丢掉了',
      ],
      answer: 1,
      explain: '取平均能消除对称的误差。而遮挡路径只会更长、不会更短，所以平均之后它仍然完整保留。',
    },
  ],
}
