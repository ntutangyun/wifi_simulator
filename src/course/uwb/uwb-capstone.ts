/**
 * UWB Tier 3 · M16 · The ranging capstone · Locate the phone in this flat.
 *
 * Standard-first shape (2026-11-10): ① what IEEE Std 802.15.4-2024 specifies for the parts the
 * brief uses — the ranging block (§10.32.2), one-to-many DS-TWR (§10.32.5, §10.29.1.2.4), the Ranging
 * FoM (§10.29.1.7), and AoA only as a request and report (RMI IE §10.29.8.4, SRRR IE §10.32.9.9; the
 * measurement method is out of scope, and chapter 16 has none) — and that positioning is not in the
 * standard and MMS is a P802.15.4ab draft; ② how this simulator fills each gap with its own values
 * and methods; ③ three guided runs: the baseline and its one-sided error, the four scenes, and the
 * brief.
 *
 * The flat is the hallway house: two rooms with a hallway between them, every wall brick, the phone
 * in Room B with two anchors beside it and the third across the hallway wall, and a Wi-Fi 7 router
 * in the hallway on 6 GHz channel 71, inside UWB channel 5's band.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-capstone.test.ts.
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
  why: '这一课给出一套住宅和三项决定，要求把一部手机定位到半米以内，并用日志论证自己的选择。IEEE 802.15.4-2024 规定的是测距：测距块（ranging block）与测距轮（ranging round）的结构、一对多双边双向测距（double-sided two-way ranging, DS-TWR）的消息顺序、每个测距计数值附带的品质因数（figure of merit, FoM），以及到达角（angle of arrival, AoA）怎样请求与上报；它不规定定位，也不规定到达角怎样测出。多毫秒（multi-millisecond, MMS）的一对多轮次是 P802.15.4ab 草案的内容，尚未成为标准。三项决定各有答案。第三个锚点（anchor）应当留在走廊里：移到另一个房间虽然增大了张角，它却位于第二道砖墙之后，应答无法送达，定位次数减半、超时多了一倍以上，三距离交汇的定位一次也没有。把测距块的频率提高一倍，得到的是更频繁的定位而不是更高的精度：每次定位的误差不变，会话的占空比（duty cycle）、超时次数和受 Wi-Fi 干扰丢失的接收一起翻倍。多毫秒一对多轮次让三个锚点在一轮里应答，却要多得多的发射次数与空口时间（airtime），受干扰丢失的接收也更多，而且本课的多毫秒场景不测向。真正妨碍达标的是一个单向误差：隔着砖墙的那个锚点，每个块测得的距离都偏长约 0.60 m。这是本仿真器给遮挡路径加的固定时延，取平均无法消除，本仿真器等权的最小二乘解算又把它带入了定位结果，所以四个场景在不做修正时都达不到半米；扣除这一偏移后重新解算，误差只有几厘米。',
  outcomes: [
    '说出标准对测距块、一对多 DS-TWR、品质因数与到达角规定了什么，以及哪些部分（定位、到达角的测量方法）它不规定',
    '用一个场景的定位结果、超时与空口时间论证一项决定，而不是用示意图',
    '找出存在系统偏差的那个距离，说明它来自本仿真器的哪一项取值，以及怎样修正',
  ],
  needs: ['uwb-position', 'uwb-aoa', 'uwb-mms', 'uwb-coexist'],
  terms: [
    { term: 'brief', plain: '任务书：完成之后必须满足的要求' },
    { term: 'duty cycle', plain: '测距会话真正占用空口的时间占比' },
  ],
  standard: [
    { heading: '测距块的结构（§10.32.2）', text: '测距块是一段用于测距的时间，由整数个测距轮组成；一个测距轮足够完成参与设备之间一次完整的测距，又分为整数个测距时隙（ranging slot），一个时隙至少能发送一个测距帧。时长以 RSTU（ranging scheduling time unit）计（§10.29.1.5）。' },
    { heading: '一对多 DS-TWR（§10.32.5，三条消息的算式见 §10.29.1.2.4）', text: '发起方广播测距启动消息，其中的 RRMC IE 选定应答方；各应答方按顺序以测距应答消息回复，它既结束第一次往返测量，又开始第二次；发起方最后广播最终帧，用测距测量信息（ranging measurement information, RMI）IE 报告各个往返时间、用 RRTI IE 报告回复时延（reply time）。收到最终帧后，每个应答方都掌握计算飞行时间所需的全部数值；发起方在 RRMC IE 里请求时，应答方再把结果报告回去。飞行时间 = (Tround1 × Tround2 − Treply1 × Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)。' },
    { heading: '测距品质因数（§10.29.1.7，图 10-200）', text: '测距设备为每一个测距计数值给出一个测距品质因数：置信水平、置信区间与置信区间的缩放系数，表示 RMARKER（ranging marker）落在这个区间内的概率。标准规定它的格式与含义，不规定怎样估计。' },
    { heading: '到达角（§10.29.8.4，§10.32.9.9）', text: '标准只规定到达角怎样请求与上报：RMI IE 可以携带 AOA Azimuth、AOA Elevation 字段及它们的 FOM 字段；SP3 测距里，SRRR IE 的 RAOA 位为 1 表示要求报告到达角。到达角怎样测出、天线（antenna）阵列怎样配置，标准写明不在其范围之内；第 16 章的物理层（physical layer, PHY）也没有规定到达角的测量。' },
    { heading: '标准之外的部分', text: '标准不定义定位。多毫秒测距及其一对多轮次、窄带（narrowband, NB）控制面是 P802.15.4ab 草案的内容，草案正在审议。' },
    { kind: 'steps', heading: '一对多 DS-TWR 的一轮，按标准：逐步说明', items: [
      '发起方广播测距启动消息，RRMC IE 选定这一轮的应答方（§10.32.5）。',
      '各应答方按调度依次发出测距应答消息，带 RRMC IE。',
      '发起方广播最终帧，带 RMI IE（往返时间）与 RRTI IE（回复时延）。',
      '每个应答方用两个往返时间与两个回复时延，按 §10.29.1.2.4 的算式算出飞行时间。',
      '发起方请求时，应答方在后面的帧里用 RMI IE 把结果报告给发起方；每个测距计数值都附带测距品质因数（§10.29.1.7）。',
    ] },
  ],
  implementation: [
    { topic: '测距块与时隙', standard: '块由整数个轮组成，轮由整数个时隙组成；时长由会话决定（§10.32.2）', sim: '测距块 200 ms、时隙 2 ms（「每 100 ms 一个块」变体为 100 ms）；多毫秒场景的时隙取 600 RSTU。', kind: 'value' },
    { topic: '一对多 DS-TWR', standard: '启动、应答、最终帧三条消息，应答方计算，按请求报告（§10.32.5）', sim: '照此实现：手机的轮询帧带 ARC、RR、RDM、RRMC，三个锚点依次应答，手机的最终帧带 RMI 与 RRTI，锚点算出距离后用 RMI IE 报告给手机。', kind: 'faithful' },
    { topic: '品质因数', standard: '格式与含义由标准规定，估计方法未规定（§10.29.1.7）', sim: '按直射路径是否穿墙取两个固定字节之一：直视 0x16，穿墙 0x7b。真实接收机要从信号自己估计它。', kind: 'choice' },
    { topic: '到达角', standard: '只规定请求与上报（§10.29.8.4、§10.32.9.9），测量方法不规定', sim: '锚点用双阵元相位差（phase difference）模型测出到达角，视场（field of view）±90°；它在本地把到达角与自己算出的距离合成一次单锚点定位，不经 RMI IE 传送到达角。多毫秒场景不测向。', kind: 'choice' },
    { topic: '定位', standard: '标准不定义定位', sim: '手机在一个块里测到三个距离时，用等权的高斯—牛顿最小二乘解算平面坐标，高度固定；不按品质因数加权、不剔除异常值、块与块之间不做滤波。', kind: 'choice' },
    { topic: '遮挡', standard: '标准未规定', sim: '没有回波，每个接收机只收到直射路径；路径每穿过一道砖墙，首径（first path）到达晚 2.0 ns，与墙的厚度、入射角无关。', kind: 'value' },
    { topic: '时间戳噪声与 Wi-Fi 干扰', standard: '标准未规定', sim: '每个时间戳 100 ps 的 1σ 噪声；Wi-Fi 信干比（signal-to-interference ratio, SIR）低于 −12 dB 即判为丢失。', kind: 'value' },
    { topic: '多毫秒一对多', standard: 'P802.15.4ab 草案的内容', sim: '「一轮测完三个锚点」变体按本仿真器对草案的实现运行：窄带控制面、单边测距、600 RSTU 的时隙。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '基线：三个距离与一次定位',
      jump: 2,
      steps: [
        '按现状载入这套住宅，跳到手机的第一次定位，打开手机的检视器。',
        '在测距表里逐块比较每个测得的距离与真值，并查看各自的品质因数。',
      ],
      blocks: [
        { kind: 'table', heading: '现状下的三个距离', head: ['锚点', '真值', '平均误差', '成因'], rows: [
          ['anchor-1', '3.99 m', '−0.02 m', '直视路径'],
          ['anchor-2', '3.99 m', '−0.00 m', '直视路径'],
          ['anchor-3', '3.23 m', '+0.60 m', '一道砖墙'],
        ] },
        { kind: 'formula', heading: '这个偏差对定位的影响', text: '三距离交汇的定位：平均误差 0.55 m，最差 0.57 m，GDOP 1.25', note: '误差几乎全部来自那个固定偏移；几何条件再好也补偿不了不是随机的误差。' },
      ],
      expect: 'anchor-3 的距离每个块都偏长，平均 +0.60 m，它的品质因数是 0x7b，另外两条是 0x16；三距离交汇的定位误差平均 0.55 m。从 anchor-3 的距离中扣除 0.60 m 后重新解算，这个块的误差是 0.02 m。',
      meaning: '偏长量就是本仿真器给一道砖墙的 2.0 ns 乘以光速（②）；双边测距不会抵消它。品质因数已经标出这条距离较差，但本仿真器的定位解算不使用品质因数（②），标准也不规定定位（①）。',
    },
    {
      heading: '三项决定，四个场景',
      more: [0, 1, 2],
      steps: [
        '依次载入三个变体，每次只改变一项，运行七个块（1.3 s）。',
        '逐行比较下表：一项决定改变了什么，也看它没有改变什么。',
      ],
      blocks: [
        { kind: 'table', heading: '四个场景，七个块', head: ['数字及其读取位置', '现状', '锚点 3 移远', '每 100 ms 一个块', '一轮测完三个锚点'], rows: [
          ['定位次数（UWB_POSITION）', '20', '10', '36', '7'],
          ['其中三距离交汇', '5', '0', '9', '7'],
          ['超时（UWB_TIMEOUT）', '18', '40', '36', '0'],
          ['受 Wi-Fi 干扰丢失（UWB_INTERFERED）', '6', '4', '12', '14'],
          ['手机与三个锚点的发射次数', '44', '34', '81', '294'],
          ['空口时间', '8.6 ms', '6.7 ms', '15.9 ms', '62.5 ms'],
        ] },
      ],
      expect: '锚点 3 移远后三距离交汇的定位为 0，超时从 18 增加到 40；块的频率加倍后超时与受干扰丢失的接收恰好翻倍；一轮测完三个锚点的发射次数是现状的六倍以上。凡不是三距离交汇的定位，都是单个锚点用距离加到达角得出的。',
      meaning: '这些代价都在本仿真器的取值之内（②）：遮挡时延、−12 dB 的干扰门限、多毫秒场景的实现。标准只规定测距交互本身（①）。',
    },
    {
      heading: '对照任务书',
      steps: [
        '先在载入任何场景之前写下你对三项决定的预期，再对照上面两张表评分。',
        '回答：有没有哪个场景能让每一次定位的误差都在半米以内？',
        '提交：你选择的决定、否决的决定及依据、那个有偏差的距离与它的成因、以及这套住宅没有建模的内容。',
      ],
      blocks: [
        { kind: 'table', heading: '合格答案的要点', head: ['决定', '合格答案的要点'], rows: [
          ['锚点 3', '留在走廊里：移到另一个房间使定位次数减半，三距离交汇的定位一次也没有。'],
          ['块的频率', '得到的是更频繁的定位而不是更高的精度：误差不变，超时与受干扰丢失的接收翻倍。'],
          ['一轮还是三轮', '一轮测完三个锚点并不更省：发射次数与空口时间多得多，受干扰丢失的接收也更多，而且不测向。'],
          ['那个偏差', '指出 anchor-3，给出正负号与大小，归因于遮挡路径的固定时延，说明取平均为什么消除不了。'],
          ['任务要求', '四个场景在不做修正时都达不到半米；扣除偏差、或按品质因数加权，才可能达标。'],
        ] },
      ],
      expect: '没有一个场景能让每一次定位都在半米以内：仅那个偏移就有 0.60 m。扣除它之后，误差降到几厘米。',
      meaning: '「按品质因数加权」是读者需要自行得出的方案：本仿真器的解算器不提供这一选项（②）。这套住宅里没有人走动、没有回波，所有结论都针对一个静态房间。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.32.2（测距块与测距轮）、§10.29.1.5（RSTU）、§10.32.5（一对多 DS-TWR）、§10.29.1.2.4（三条消息的 DS-TWR 算式）、§10.29.1.7 与图 10-200（测距品质因数）、§10.29.8.4（RMI IE 的到达角字段）、§10.32.9.9（SRRR IE 的 RAOA 位）。',
    'P802.15.4ab 草案（正在审议）：多毫秒测距及其一对多轮次与窄带控制面；轮次结构与时隙、轮、块的默认值见 TG4ab 提案 15-22/0381r5。',
    '本仿真器的取值与取法：200 ms 的测距块与 2 ms 的时隙（据称来自 FiRa 的配置，语料中无法核实）、砖墙 2.0 ns 的遮挡时延、100 ps 的时间戳噪声、−12 dB 的信干比门限、品质因数的两个固定字节、双阵元相位差测向与 ±90° 视场、等权最小二乘定位。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '把锚点 3 移到另一个房间会增大张角。实际发生的是什么？',
      options: [
        '张角增大了，定位也相应变好',
        '它位于第二道砖墙之后，应答无法送达，于是三距离交汇的定位一次也没有',
        '解算器不接受其他房间中的锚点',
      ],
      answer: 1,
      explain: '定位次数减少了一半，超时多了一倍以上；剩下的都是单锚点用距离加到达角得出的定位。',
    },
    {
      q: '标准对到达角规定了什么？',
      options: [
        '用两根天线之间的相位差测出到达角，视场 ±90°',
        '只规定怎样请求与上报：RMI IE 的到达角字段、SRRR IE 的 RAOA 位；测量方法不规定',
        '第 16 章规定了到达角的测量精度',
      ],
      answer: 1,
      explain: '双阵元相位差与 ±90° 视场是本仿真器的模型；按 §10.29.8.4，天线阵列等系统参数不在标准范围之内。',
    },
    {
      q: '为什么取平均消不掉 anchor-3 的误差？',
      options: [
        '块的数量还不够多',
        '它在每一个块里正负号都相同：它是加在路径上的一段固定时延，不是围绕真值波动的噪声',
        '解算器把第三个距离丢掉了',
      ],
      answer: 1,
      explain: '取平均能消除对称的误差。本仿真器给遮挡路径加的时延只会使距离更长，平均之后仍然完整保留。',
    },
  ],
}
