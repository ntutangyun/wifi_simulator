/**
 * UWB Tier 2 · M14 · Other ranging modes · One blink per tag, in the standard-first shape
 * (2026-11-10).
 *
 * ① is IEEE Std 802.15.4-2024 §10.29.1.2.5's first TDOA case: the mobile device broadcasts a
 * blink, typically the shortest frame possible (a 12-octet multipurpose frame), and fixed nodes
 * synchronised in some way compare the arrivals; §10.29.5 is why an infrastructure RDEV reports a
 * timestamp for every RFRAME it receives. ② says which parts — the common time base, the per-badge
 * slot, who solves — are the simulator's own choices. 2026-11-11 (W4): the blink is the standard's
 * 12-octet multipurpose frame with no IE (until then a 14-octet frame with a "BLINK" IE the standard
 * does not define). ③ guides four runs.
 *
 * Every figure the lesson prints is read back out of its text in tests/course/uwb-ul-tdoa.test.ts
 * and compared with a run.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, firstUwbBlink, firstUwbPosition, firstUwbTdoa, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Which scene the lesson runs: anchors perfectly synchronised, or 1 ns out. */
export type UwbUlTdoaVariant = 'base' | 'sync'

/**
 * The four corner anchors, in the order the infrastructure uses them. The first
 * is the reference: every difference is taken against its arrival stamp, and it
 * is the lane the records are emitted from. The corners and the heights are
 * `uwb-position`'s and `uwb-dl-tdoa`'s.
 */
export const UL_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** Anchors on the ceiling, badges at chest height — `uwb-position`'s two planes. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0

/** Where the badges stand: `uwb-dl-tdoa`'s ten spots. */
export const TAG_SPOTS: { x: number; y: number }[] = [
  { x: 4, y: 3.5 }, { x: 7, y: 6 }, { x: 2, y: 6.5 },
  { x: 5, y: 1 }, { x: 8.5, y: 3 }, { x: 1.5, y: 2.5 }, { x: 6, y: 4.5 },
  { x: 3, y: 1.5 }, { x: 9, y: 7 }, { x: 5.5, y: 7 },
]

/**
 * Four corner anchors and ten blinking badges on a UL-TDoA session with
 * everything else at its default: NLOS on, both noise knobs at their defaults,
 * and every crystal drawn rather than set.
 *
 * 'sync' sets `syncErrorNs` to 1 and changes nothing else: each anchor then
 * draws one fixed leftover calibration error of that size, once, for the whole
 * session.
 */
export function uwbUlTdoaScenario(variant: UwbUlTdoaVariant = 'base'): Scenario {
  return uwbSc(
    oneRoom(),
    [
      ...UL_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      ...TAG_SPOTS.map((p, i) => uwbTag(`badge-${i + 1}`, `Badge ${i + 1}`, p.x, p.y, TAG_Z)),
    ],
    { mode: 'ul-tdoa', nlos: true, ...(variant === 'sync' ? { syncErrorNs: 1 } : {}) },
  )
}

export const uwbUlTdoa: Lesson = {
  id: 'uwb-ul-tdoa',
  module: 25,
  title: '每个标签发送一帧闪发',
  why: 'IEEE 802.15.4-2024 §10.29.1.2.5 描述的到达时间差（time difference of arrival, TDoA）第一种情形是：移动设备周期性地广播一条消息，通常称为闪发（blink），多个以某种方式彼此同步的固定节点接收它，比较到达时刻；每一对固定节点的到达时间差把移动设备限定在一张双曲面上，几对的交点就是它的位置。标准还说，这类设备通常发送尽可能短的闪发，例如最短 12 字节的多用途帧；固定节点可以通过有线分发时钟同步，也可以用无线方式。业界把这种情形称为上行形态（uplink TDoA, UL-TDoA），这个名称不出自标准。闪发的发送时刻对两个固定节点是同一个，相减即被消去，所以被定位的标签（tag）的晶振（crystal）不影响结果；整个方法取决于固定节点的时钟是否一致。本仿真器把锚点（anchor）放在一条理想的公共时基（common time base）上，每个锚点只留一个在整个会话中固定不变的同步误差（sync error）：按本仿真器的模型，同步误差为 0 时平均定位误差为 3.2 cm，为 1 ns 时增大到 16.7 cm，而且房间里的胸牌一起朝同一方向偏移，是多次测量无法平均消除的偏差。本仿真器的闪发就是标准举例的 12 字节多用途帧，不带信息单元；每个胸牌由会话排定一个时隙，并由参考锚点（reference anchor）直接拿到四个到达时刻、解出位置，这些是本仿真器的安排。',
  outcomes: [
    '说出标准描述的到达时间差第一种情形：谁发送、谁接收、闪发通常是什么帧',
    '分清本仿真器的哪些做法照标准、哪些是它自己的安排',
    '根据定位偏移的方式，把只取值一次的同步误差与每次重新取值的噪声区分开',
  ],
  needs: ['uwb-dl-tdoa'],
  terms: [
    { term: 'blink', plain: '闪发：到达时间差第一种情形里移动设备广播的那一帧。标准说它通常是尽可能短的帧，例如 12 字节的多用途帧' },
    { term: 'UL-TDoA', plain: '上行形态：由标签发送，固定节点接收。这是业界的名称，标准 §10.29.1.2.5 只把它描述为到达时间差的第一种情形' },
    { term: 'sync error', plain: '锚点彼此校准之后，它们的时钟之间实际仍存在的差值。本仿真器的叫法' },
    { term: 'bias', plain: '只取值一次、此后每一轮都同样出现的误差，无法通过平均消除' },
  ],
  standard: [
    { heading: '第一种情形：移动设备广播闪发（§10.29.1.2.5）', text: '到达时间差依据一条或多条消息的相对到达时刻定位移动设备，使用单向测距（one-way ranging, OWR）。第一种情形里，移动设备周期性地向多个固定节点广播一条消息，这些固定节点以某种方式同步，使到达时刻可以相互比较；这条消息通常称为闪发。对任意一对同步的固定节点，闪发的到达时间差把移动设备限定在一张双曲面上；多对的结果相交，就得到它的位置。' },
    { heading: '闪发通常是什么帧（§10.29.1.2.5）', text: '为了降低功耗，这类设备通常发送尽可能短的闪发，例如多用途帧。多用途帧最短可以只有 12 个字节：Short Frame Control 字段、Sequence Number 字段、不带目的地址、一个扩展源地址，以及帧校验序列（frame check sequence, FCS）。' },
    { heading: '固定节点怎样同步（§10.29.1.2.5）', text: '固定节点的同步可以通过有线分发时钟信号实现。无线同步方案同样可行：固定节点之间互发超宽带（ultra-wideband, UWB）消息，借助已知或预先测得的飞行时间，算出彼此的相对频率偏差与漂移，再用它们把闪发的到达时刻换算到一条公共时基上，到达时间差才有意义。' },
    { heading: '基础设施一侧的时间戳（§10.29.5，§10.29.1.1）', text: '设备开启测距后，此后收到的每一帧测距帧都产生发送与接收的测距计数值报告，时刻以 RMARKER（ranging marker）为准；对不期而至的测距帧同样产生报告，正是这一行为使设备可以在单向测距中担任基础设施一侧的设备。由谁汇总这些时刻、由谁解算位置，标准不规定。' },
    { kind: 'steps', heading: '第一种情形，按标准：逐步说明', items: [
      '固定节点彼此同步：有线分发时钟，或用无线方案把到达时刻换算到公共时基上（§10.29.1.2.5）。',
      '移动设备周期性地广播闪发，通常是尽可能短的帧，例如 12 字节的多用途帧。',
      '每个开启了测距的固定节点收到闪发，报告它的 RMARKER 接收时刻（§10.29.5）。',
      '把各节点的到达时刻放到公共时基上，每一对节点相减，得到一个到达时间差。',
      '每个到达时间差把移动设备限定在一张双曲面上；多张双曲面的交点就是它的位置。由谁、用什么算法求交点，标准不规定。',
    ] },
  ],
  implementation: [
    { topic: '闪发帧', standard: '通常是尽可能短的帧，例如 12 字节的多用途帧：Short Frame Control、Sequence Number、无目的地址、扩展源地址、帧校验（§10.29.1.2.5，§7.3.5）', sim: '照此：闪发是 12 字节的多用途帧，短帧控制（Short Frame Control）1 字节、序列号 1 字节、扩展源地址 8 字节、帧校验 2 字节，不带信息单元，也不带任何时间。', kind: 'faithful' },
    { topic: '闪发的发送时刻', standard: '周期性地广播；标准没有规定由谁安排', sim: '会话给每个胸牌排定一个只含一个 2 ms 时隙的测距轮（ranging round），每个 200 ms 的块一次；十个胸牌依次占用第 0 到第 9 轮，所以两帧闪发永远不会发生碰撞。一个块最多排 100 个胸牌。', kind: 'choice' },
    { topic: '固定节点的同步', standard: '以某种方式同步：有线分发时钟，或无线方案（§10.29.1.2.5）', sim: '锚点的到达时刻直接取在一条理想的公共时基上：真实的 RMARKER 到达时刻加上时间戳噪声，再加上这个锚点自己的同步误差；锚点自身的晶振不参与。', kind: 'choice' },
    { topic: '同步误差', standard: '标准未给出取值', sim: '每个锚点在会话开始时取一次，此后不变（真实的同步残差还会缓慢漂移）：本课场景为 0 ns，变体为 1 ns 的 1σ。', kind: 'value' },
    { topic: '每个锚点的时间戳', standard: '收到的每一帧测距帧都产生接收时刻报告，以 RMARKER 为准（§10.29.5，§10.29.1.1）', sim: '照此记录：每个收到闪发的锚点都写一行 RMARKER 接收时间戳，计数值用它自己的晶振计。', kind: 'faithful' },
    { topic: '时间戳噪声', standard: '标准未给出', sim: '每个接收时间戳带 100 ps 的 1σ 噪声。', kind: 'value' },
    { topic: '汇总与解算', standard: '标准未规定', sim: '时隙结束时，四个到达时刻直接交给参考锚点 anchor-1（不经过任何回程网络）；anchor-1 用其余三个到达时刻各减去自己的，在胸牌已知的高度上求三条双曲线（hyperbola）的交点，结果写在 anchor-1 的泳道上。anchor-1 自己没有收到闪发时，这一轮没有输出。', kind: 'choice' },
    { topic: '胸牌的晶振', standard: '发射中心频率容差以百万分之几（parts per million, ppm）计，为 ±20 ppm（§16.4.9）', sim: '每个胸牌的晶振在容差内随机取值，但定位不使用胸牌测得的任何间隔：把十个胸牌的晶振分别设到 +20 与 −20 ppm，七十次定位的误差完全相同。', kind: 'faithful' },
  ],
  labs: [
    {
      heading: '一帧闪发，四个到达时刻',
      jump: 0,
      steps: [
        '载入本课场景，跳到 badge-1 的闪发。',
        '在检视面板里打开这一帧，再读出四个锚点各自的接收时间戳。',
      ],
      blocks: [
        { kind: 'table', heading: 'badge-1 的第一帧闪发', head: ['锚点', '到达时刻'], rows: [
          ['anchor-1', '180.978 µs'],
          ['anchor-3', '180.981 µs'],
          ['anchor-2', '180.984 µs'],
          ['anchor-4', '180.986 µs'],
        ] },
      ],
      expect: '闪发 12 字节、空口时间（airtime）181.0 µs，是一帧不带信息单元的多用途帧；七个块共 70 次发送，全部来自胸牌，胸牌没有收到任何帧。四个到达时刻按各锚点到胸牌的距离排序，首尾相差 8 ns。',
      meaning: '移动设备广播一帧尽可能短的帧、固定节点接收，是标准的第一种情形（①）；本仿真器的闪发就是标准举例的那种多用途帧（②）。',
    },
    {
      heading: '由基础设施解出的位置',
      jump: 1,
      steps: [
        '跳到第一个时间差，读出参考锚点 anchor-1 为 badge-1 算出的三个时间差和真值。',
        '再往下一行，读出由它们解出的位置，注意它在哪一条泳道上。',
      ],
      blocks: [
        { kind: 'table', heading: 'badge-1，第 0 块', head: ['项目', '测得', '真值'], rows: [
          ['anchor-2 − anchor-1', '5.33 ns', '5.39 ns'],
          ['anchor-3 − anchor-1', '2.49 ns', '2.29 ns'],
          ['anchor-4 − anchor-1', '7.19 ns', '7.15 ns'],
          ['位置', '(4.02, 3.46) m', '(4.00, 3.50) m'],
        ] },
      ],
      expect: '三个时间差与一次定位都写在 anchor-1 的泳道上，时刻是第 2 ms，即 badge-1 的时隙结束时；定位误差为 0.05 m。',
      meaning: '到达时间差确定双曲面、交点即位置是标准的（①）；由参考锚点汇总、在已知高度上求交点是本仿真器的安排（②）。',
    },
    {
      heading: '1 ns 的同步误差',
      variant: 0,
      steps: [
        '载入「1 ns 的同步误差」，运行七个块。',
        '对照下表比较两个场景的时间差误差与定位误差。',
      ],
      blocks: [
        { kind: 'table', heading: '两个场景，各七个块、各 70 次定位', head: ['场景', '每个时间差的 σ', '时间差最大误差', '定位误差', '平均定位误差'], rows: [
          ['本课场景', '4.2 cm', '0.10 m', '0.2–7.7 cm', '3.2 cm'],
          ['1 ns 的同步误差', '42.6 cm', '0.41 m', '10.4–27.9 cm', '16.7 cm'],
        ] },
        { kind: 'formula', heading: '每个时间差的 σ', text: 'σ = √2 · c · √(σ_ts² + σ_sync²)', note: '一次相减含两个时间戳、两个锚点的同步误差；σ_ts = 100 ps 是本仿真器取的时间戳噪声。' },
      ],
      expect: '空口上没有任何变化，定位误差却明显增大；badge-1 对 anchor-2 的七个时间差全部偏短，平均偏短 1.15 ns；十个胸牌各自七次定位的平均位置全部向东偏移，偏移量为 12 到 22 cm。',
      meaning: '同步误差在本仿真器里只取值一次（②），所以它是偏差而不是噪声：所有胸牌朝同一方向偏移，多发闪发也无法平均消除。标准只要求固定节点以某种方式同步（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.2.5（到达时间差的第一种情形、闪发通常是最短 12 字节的多用途帧、固定节点的有线与无线同步）、§10.29.5（开启测距后每一帧测距帧都产生时间戳报告，使设备可以在单向测距中担任基础设施一侧的设备）、§10.29.1.1（RMARKER）、§16.4.9（±20 ppm 的发射中心频率容差）。「上行形态」「参考锚点」「同步误差」都不是标准的术语。',
    'IEEE Std 802.15.4-2024 §7.3.5（多用途帧的格式与短帧控制字段）。本仿真器的做法与取值：每个胸牌一个 2 ms 时隙、每块一次；理想的公共时基与每个锚点固定不变的同步误差（0 ns 与 1 ns）；100 ps 的时间戳噪声；四个到达时刻直接交给参考锚点、在已知高度上求交点。',
  ],
  limits: [],
  scenario: () => uwbUlTdoaScenario('base'),
  variants: [
    { label: '1 ns 的同步误差', scenario: () => uwbUlTdoaScenario('sync') },
  ],
  jumps: [
    J('badge-1 发出的闪发帧', firstUwbBlink),
    J('第一个时间差', firstUwbTdoa),
    J('基础设施解出的定位', firstUwbPosition),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按标准，到达时间差的第一种情形里，移动设备通常发送什么帧？',
      options: [
        '一帧尽可能短的帧，例如最短 12 字节的多用途帧',
        '一帧带专用信息单元的闪发帧',
        '一帧带发送时刻的测距控制消息',
      ],
      answer: 0,
      explain: '§10.29.1.2.5 举的例子是多用途帧：Short Frame Control、Sequence Number、扩展源地址与帧校验，共 12 字节。标准没有为闪发定义专门的信息单元。',
    },
    {
      q: '为什么这里胸牌的晶振完全不影响定位结果？',
      options: [
        '闪发帧太短，速率误差体现不出来',
        '相减的两个时刻都由固定节点记录，闪发的发送时刻在相减时被消去，没有任何一段间隔是用胸牌的晶振测量的',
        '锚点估计出胸牌的载波偏差并做了修正',
      ],
      answer: 1,
      explain: '把十个胸牌的晶振设到容差两端，七十次定位的误差完全相同。决定结果的是固定节点的时钟是否一致。',
    },
    {
      q: '同步误差设为 1 ns 后，为什么多发闪发也无法降低定位误差？',
      options: [
        '本仿真器里每个锚点的同步误差只取值一次、此后每一轮重复出现，是偏差，平均消除不了',
        '增加的闪发会相互碰撞',
        '解算只使用最近的一帧闪发',
      ],
      answer: 0,
      explain: 'badge-1 对 anchor-2 的七个时间差全部偏短约 1.15 ns，十个胸牌一起向东偏移。平均能消除的是时间戳噪声，剩下的是时钟的偏差。',
    },
  ],
}
