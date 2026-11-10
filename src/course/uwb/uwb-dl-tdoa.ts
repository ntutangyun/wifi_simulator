/**
 * UWB Tier 2 · M14 · Other ranging modes · Listen-only positioning.
 *
 * Every round of the first UWB tier belonged to a tag: it polled, the anchors
 * answered, and it turned the round trips into distances. This lesson turns the
 * round over. The anchors run one round of their own per block — a Poll, one
 * Response per other anchor, a Final — and a badge's entire part is to hear it
 * and subtract arrival times. It never transmits, so the round costs the same
 * whether three badges are listening or ten.
 *
 * The centrepiece is the one correction that makes the mode possible at all. A
 * two-way exchange differences the tag's crystal away inside itself; here the
 * two arrivals being subtracted are milliseconds apart, and a crystal the
 * standard allows to be 20 ppm off turns that into tens of metres. The badge
 * divides it out by measuring the Poll-to-Final span on its own clock against
 * the reference anchor's report of it, which cancels its own crystal and the
 * reference anchor's alike.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). The
 * geometry — GDOP, the ellipse, where the hyperbolae go soft — and the pinned
 * crystals are in `deeper`; the clauses and the model choices are in `sources`.
 * Every number quoted below is pinned in tests/course/uwb-dl-tdoa.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-dl-tdoa` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, firstUwbDlRound, firstUwbFinal, firstUwbPoll, firstUwbPosition, firstUwbRxTs, firstUwbTdoa, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Which scene the lesson runs: three listeners, three listeners with the tag clock left raw, or ten. */
export type UwbDlTdoaVariant = 'base' | 'raw' | 'ten'

/**
 * The four corner anchors, in the order the round uses them. The first is the
 * reference: it sends the Poll in slot 0 and the Final in the last slot, and
 * every time difference a badge computes is taken against its Poll. The other
 * three answer in slots 1, 2 and 3, in this order — which is why their
 * clock-offset leftovers grow down the list.
 *
 * The corners and the heights are `uwb-position`'s, so the two-way fixes that
 * lesson measured in this room are the comparison this one is entitled to make.
 */
export const DL_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** Anchors on the ceiling, badges at chest height — `uwb-position`'s two planes. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0

/**
 * Where the listeners stand. The first three are the base scene; all ten are the
 * "Ten tags" one, which changes nothing else — the round does not know they are
 * there. Spots 4 and 10 sit near the anchor-1–anchor-2 and anchor-3–anchor-4
 * baselines, where a hyperbolic fix is at its weakest inside the rectangle.
 */
export const TAG_SPOTS: { x: number; y: number }[] = [
  { x: 4, y: 3.5 }, { x: 7, y: 6 }, { x: 2, y: 6.5 },
  { x: 5, y: 1 }, { x: 8.5, y: 3 }, { x: 1.5, y: 2.5 }, { x: 6, y: 4.5 },
  { x: 3, y: 1.5 }, { x: 9, y: 7 }, { x: 5.5, y: 7 },
]

/** How many badges each scene puts in the room. */
export const TAG_COUNT: Record<UwbDlTdoaVariant, number> = { base: 3, raw: 3, ten: 10 }

/**
 * `uwb-position`'s four corner anchors and three (or ten) badges that never
 * transmit, on a DL-TDoA session with everything else at its default: NLOS on,
 * both noise knobs at their defaults, and every crystal drawn rather than set —
 * so the ±20 ppm the standard allows is the draw's to hand out, and the gap
 * between a badge's crystal and anchor 1's is what the 'raw' scene exposes.
 *
 * 'raw' clears `tdoaClockCorrection` and changes nothing else. 'ten' adds seven
 * more listeners and changes nothing at all about the round.
 */
export function uwbDlTdoaScenario(variant: UwbDlTdoaVariant = 'base'): Scenario {
  const tags = TAG_SPOTS.slice(0, TAG_COUNT[variant])
  return uwbSc(
    oneRoom(),
    [
      ...DL_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      ...tags.map((p, i) => uwbTag(`badge-${i + 1}`, `Badge ${i + 1}`, p.x, p.y, TAG_Z)),
    ],
    { mode: 'dl-tdoa', nlos: true, ...(variant === 'raw' ? { tdoaClockCorrection: false } : {}) },
  )
}

export const uwbDlTdoa: Lesson = {
  id: 'uwb-dl-tdoa',
  module: 25,
  title: '只接收不发送的定位',
  why: '当一栋楼里部署了大量胸牌时，双向测距就无法满足需求：每个标签（tag，也就是被定位的一端）都要独占一轮，在覆盖全楼之前，空口资源就已耗尽。到达时间差（time difference of arrival, TDoA）在标准里有两种情形，标准只作了概括描述；其中一种由一组同步的固定节点按已知的发送时刻偏移依次广播，移动设备只接收，业界称之为下行形态（downlink TDoA, DL-TDoA），这个名称不出自 IEEE 802.15.4-2024。本课按 FiRa 风格把它实现为：锚点（anchor）按固定的时间表自行发起一轮——一个锚点发起，其余依次作答，最后由发起的锚点结束这一轮，这套帧序列是本课的取法，标准没有规定——胸牌全程只接收，一帧也不发送。它无法测出与任何一个锚点的距离，只能把两帧的到达时刻相减；每个差值确定一条以两个锚点为焦点的双曲线（hyperbola），胸牌就位于这条曲线上，三条曲线的交点就是它的位置。代价在于胸牌自身的晶振（crystal）：它相减的两个到达时刻相隔几毫秒，晶振只要偏快百万分之几（parts per million, ppm），这段间隔就会被拉长，折合几十米，不加修正则一次定位也解不出来。标准只说固定节点要以某种方式同步，没有规定移动设备如何校准自己的时钟。本课的解决办法（FiRa 风格的做法）是利用参考锚点（reference anchor）在帧中报告的第一帧与最后一帧的发送时刻：胸牌把自己测得的跨度除以这段跨度，就得到时钟修正（clock correction），胸牌与参考锚点的晶振误差同时被消除。按本课取的噪声值，剩余误差为几十厘米，比双向测距大一个数量级，而且等待最久、最后作答的锚点误差最大。换来的是可扩展性：这一轮不指定任何胸牌，三个接收端与十个接收端，锚点发送的帧完全相同。',
  outcomes: [
    '说清一个不发信号的胸牌，单凭到达时刻能算出什么',
    '解释这样的胸牌为什么必须先以锚点为基准校准自己的时钟',
    '从日志中读出一个时间差，以及由它解出的位置',
  ],
  needs: ['uwb-geometry'],
  terms: [
    { term: 'TDoA', plain: '到达时间差：依据信号到达时刻的先后来定位，而不是依据设备之间的距离' },
    { term: 'DL-TDoA', plain: '下行形态：发送全部由锚点承担，被定位的一方只负责接收。这是业界的名称，标准 §10.29.1.2.5 只把它描述为到达时间差的第二种情形' },
    { term: 'hyperbola', plain: '一条曲线，线上每一点到一个锚点的距离都比到另一个锚点远出相同的量' },
    { term: 'clock correction', plain: '先消除接收端自身时钟的速率偏差，再使用它测得的任何一段间隔。本课的做法，标准没有规定' },
  ],
  picture: [
    { heading: '这一轮不属于任何标签', text: '在此之前，每一轮测距都属于某个标签：由它发起，锚点作答，再由它计算。现在把这种关系反转过来。在本课的场景里由锚点自行发起一轮，每块一次（这一轮的帧序列是本课按 FiRa 风格取的，标准没有规定）——其中一个锚点开启这一轮，其余锚点在各自的时隙中作答，最后仍由开启的锚点结束这一轮——而佩戴的胸牌全程只接收，不发送任何内容。' },
    { heading: '测量的是时间差，而不是距离', text: '不发送信号的胸牌，永远无法测出与某个锚点的距离：那需要一次往返，而它一次也不进行。它能做的只是相减——这一帧比那一帧早到达，早了多少。依据这些间隔来定位，就是到达时间差（time difference of arrival, TDoA）。标准 §10.29.1.2.5 描述了两种情形：一种由移动设备广播、彼此同步的固定节点接收；另一种由彼此同步的固定节点按已知的发送时刻偏移依次广播，移动设备比较到达时刻。本课运行的是后一种，业界称之为下行形态（downlink TDoA, DL-TDoA）——发送全部由锚点承担的那一种；标准里没有这个名称。' },
    { kind: 'watch', jump: 4, heading: '看一个时间差出现', text: '载入仿真，跳到第一个时间差。它出现在这一轮的末尾，每个作答的锚点对应一行，每一行旁边都显示真值。' },
    { heading: '三条曲线，不是三个圆环', text: '一个距离确定标签位于一个圆上。两个距离之差则确定它位于一条双曲线（hyperbola）上——线上每一点到某个锚点的距离，都比到另一个锚点远出这个差值——这两个锚点就是曲线的焦点。三条这样的曲线的交点，就是胸牌的位置；因此场景中不画任何圆环。严格地说，在三维空间里一个差值确定的是一张双曲面（标准的说法）；本课把胸牌的高度视为已知，在这个高度的平面上看到的才是一条双曲线。' },
    { heading: '胸牌自身的晶振误差会进入结果', text: '双向测距中，标签的晶振（crystal）误差在一次往返之内就被抵消，根本不会进入结果。而这里，胸牌相减的是自己测得的、相隔若干毫秒的两个到达时刻，于是晶振只要偏快百万分之几（ppm），整段间隔就会随之拉长，拉长的量折合几十米。如果不加处理，这种模式无法工作。' },
    { heading: '以参考锚点的时钟校准自身时钟', text: '标准描述这种情形时假定固定节点彼此同步、发送时刻偏移已知，并说同步可以通过有线分发时钟实现，也可以用无线方式实现；移动设备怎样处理自己的晶振误差，标准没有规定。本课的锚点并不彼此同步，采用的是 FiRa 风格的做法：利用同一段时间间隔，两端各自对这段间隔做了记录。参考锚点（reference anchor）在帧中报告自己何时发出第一帧、何时发出最后一帧，而胸牌掌握这两帧各自的到达时刻。两段跨度之比就是时钟修正（clock correction）：除以这个比值，就同时消除了胸牌与参考锚点的晶振误差。' },
    { heading: '开销不随接收端数量增长的一轮', text: '这一轮中没有任何一处指定某个胸牌，所以也没有任何一处会随接收端的数量增长：十个接收端与三个接收端，锚点的开销完全相同。双向测距做不到这一点，因为一轮属于发起它的那个标签。而一个不发送任何内容的胸牌，在空口上根本无法被计数。' },
  ],
  numbers: [
    { kind: 'table', heading: '房间中的节点', head: [
      '节点', '位置',
    ], rows: [
      ['anchor-1 … anchor-4', '4 corners, 10 × 8 m lab, 2.20 m'],
      ['badge-1, badge-2, badge-3', '(4, 3.5), (7, 6) and (2, 6.5), 1.00 m'],
    ] },
    { kind: 'table', heading: '五个 2 ms 的时隙，每块一次（本课的帧序列与帧内容，FiRa 风格，标准没有规定）', head: [
      '时隙', '发送者', '帧', '携带的内容',
    ], rows: [
      ['0', 'anchor-1', 'Poll, 45 B, 221.0 µs',
        '自身的发送计数器，以及各锚点的作答时隙'],
      ['1–3', 'anchor-2/3/4', 'Response, 30 B, 199.4 µs',
        '自身的发送计数器、记录的 Poll 到达计数，以及测得的相对 anchor-1 的时钟偏差'],
      ['4', 'anchor-1', 'Final, 34 B, 203.5 µs',
        '自身的发送计数器，以及记录的每一帧 Response 的到达计数——本课的胸牌并不使用这些计数'],
    ] },
    { kind: 'formula', heading: '一个胸牌要算什么', text: 'r = (rx_F − rx_P)_胸牌 ÷ (tx_F − tx_P)_anchor-1\nΔ_i = (rx_i − rx_P)_胸牌 ÷ r − ( tof(a₁ → a_i) + T_reply,i · (1 − coff_i) )', note: '第一行求的是速率，第二行扣除与几何无关的部分。本节末尾的步骤会以一个胸牌为例，把这两行逐一算一遍。' },
    { text: '胸牌的晶振最多可以偏离 20 ppm，而最后一个应答锚点在 Poll 之后整整 6 ms 才作答。这样的偏差乘以这样长的间隔，就是 120 ns，折合 36 m。' },
    { kind: 'table', heading: '这次修正的效果', head: [
      '应答锚点', '等待时间',
      '未修正，badge-2', '修正后，21 次里最差',
      '剩余误差的 3σ',
    ], rows: [
      ['anchor-2', '2 ms', '22.02 m', '0.19 m', '0.36 m'],
      ['anchor-3', '4 ms', '44.04 m', '0.44 m', '0.72 m'],
      ['anchor-4', '6 ms', '65.81 m', '0.51 m', '1.08 m'],
    ] },
    { text: '未修正那一列，正是这个胸牌与参考晶振之间 36.69 ppm 的差距乘以相应的等待时间。剩余的是每个应答锚点自身的时钟偏差（clock offset）剩余误差，为它所修正的那段应答时延的 0.2 ppm（0.2 ppm 是本课取的值）——每个时隙 0.12 m，所以最后作答的锚点误差最大。63 个时间差全部落在最后一列的范围之内。' },
    { kind: 'table', heading: '三个场景，各七个块', head: [
      '场景', '时间差', '时间差最大误差',
      '定位', '定位误差',
    ], rows: [
      ['三个胸牌', '63', '0.51 m', '21', '0.11–0.36 m'],
      ['关闭时钟修正', '63', '66.29 m', '0', '无定位结果'],
      ['十个标签', '210', '0.51 m', '70', '0.02–0.37 m'],
    ] },
    { kind: 'table', heading: '日志输出的内容：badge-1，第 0 块', head: [
      '行', '内容',
    ], rows: [
      ['胸牌一侧的轮次记录',
        'badge-1 UWB round 0 of block 0 (DL-TDoA): 5 slots × 2000.0 µs'],
      ['第一个时间差',
        'badge-1 TDoA anchor-2 − anchor-1: 5.66 ns (true 5.39 ns)'],
      ['由它解出的位置',
        'badge-1 position (3.90, 3.74) m, true (4.00, 3.50), error 0.26 m, GDOP 0.84, 4 anchors (DL-TDoA)'],
      ['七个块之后的 badge-1',
        'error 19.6 cm, GDOP 0.85, ellipse 19.8 × 10.3 cm, DL-TDoA'],
    ] },
    { kind: 'steps', heading: '一个时间差：逐步说明（本课的帧内容与算法，标准没有规定这些步骤）', items: [
      '时隙 0。anchor-1 广播 Poll，帧中携带它自身的发送计数值。每个胸牌用自己的计数器为这次到达打上时间戳——即日志中的一行 UWB_TS——两个数都被保存。',
      '时隙 1 至 3。其余三个依次作答。每一帧 Response 中携带：自身的发送计数值、为 Poll 到达记录的计数值，以及从 Poll 载波上测得的、相对 anchor-1 的时钟偏差。',
      '时隙 4。anchor-1 发出 Final 结束这一轮，帧中同样携带发送计数值。至此，对同一段跨度，胸牌掌握了两份记录：它自己的两个到达时刻，以及 anchor-1 的两个发送时刻。',
      '前一段跨度除以后一段。从 anchor-1 到胸牌的传播时间同时包含在两个到达时刻中，相减即被消去，于是 anchor-1 自身的晶振也不再影响这个比值——无论它偏差多少 ppm 都没有影响。',
      '再对每个应答锚点逐一计算：先把胸牌两次到达之间的间隔除以那个比值，再扣除与几何无关的部分——该锚点报告的应答时延（按它的时钟偏差换算），加上 Poll 沿已勘测的锚点基线（anchor baseline）传播的时间。',
      '剩下的就是距离之差除以 c，以一行 UWB_TDOA 输出，旁边标有真值。它的 1σ 由两项合成：√2·c·σ_ts，以及刚才所修正的那段应答时延的 0.2 ppm（两项噪声都是本课取的值）——所以最后作答的锚点误差最大。',
      '三个时间差就是三条双曲线，每一条以 anchor-1 和一个应答锚点为焦点。本课的解算器在胸牌预设的高度上求它们的交点，再输出那一行定位。求不出交点，就没有定位输出。',
    ] },
    { kind: 'table', heading: 'badge-1，第 0 块，对 anchor-2', head: [
      '步骤', '数值',
    ], rows: [
      ['Poll 到达、Final 到达', '1 055 768 250 362, 1 056 279 432 185'],
      ['anchor-1 发出它们的时刻', '827 981 809 319, 828 492 980 386'],
      ['两段跨度，以及它们的比值', '511 181 823 ÷ 511 171 067 = 1.000 021 04'],
      ['anchor-2 的 Response 到达', '1 055 896 046 160'],
      ['距 Poll 的间隔，再除以比值', '127 795 798 → 127 793 109'],
      ['扣除应答时延，偏差 +2.330 ppm', '127 791 127 → 127 790 829'],
      ['再加 9.00 m 基线', '+1918 = 127 792 747'],
      ['剩余结果', '361.5 · 5.66 ns · 1.70 m'],
      ['真值', '5.39 ns · 1.62 m'],
    ] },
  ],
  deeper: [
    { heading: '本场景随机生成的晶振偏差', text: '这里没有任何一个晶振偏差是预先设定的，全部随机生成。anchor-1 的取值为 −19.04 ppm，三个胸牌的取值为 1.96、17.65 与 4.08——与参考锚点相差 21.00、36.69 与 23.12 ppm。那个比值对参考锚点晶振的消除与对胸牌晶振的消除同样彻底：把 anchor-1 设为 +20 ppm——相对原值变化了 39 ppm——运行结果仍是 0.19、0.44 与 0.51 m，完全相同。再把三个胸牌设为 +20、−20 与 0 ppm，最大值是 0.24、0.46 与 0.54 m：仍然是分米级，仍然是 21 次定位。而关闭修正时，badge-2 的第一个块读出 65.60、139.29 与 201.83 ns，而真值是 −8.14、−6.07 与 −18.17 ns。' },
    { heading: '为什么它的定位精度低于双向测距', text: '不要直接比较两者的 GDOP 数值：双曲线定位的雅可比每一行是两个单位向量之差，因此在锚点正方形中心处它的下限是 √(2/3) = 0.82，而三边定位的下限是 1.00。真正有意义的是比较误差。《从四个距离到一个点》在同一个房间、同样这四个锚点上得到的双向定位误差，保持在 0.5 到 3.3 cm；这里则是 11 到 36 cm。' },
    { heading: '误差椭圆的可信程度', text: '长半轴在 18.6 到 23.0 cm 之间，而那一课是 1.7 cm；它由 √((√2·c·σ_ts)² + (c·T_reply,i·0.2 ppm)²) 对三个应答锚点合成——其中只有 4 cm 来自时间戳噪声——而每一次定位都落在 1.6 个长半轴之内。但它仍是一阶近似：应答时延 2、4、6 ms 并不共用同一个 σ，所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。' },
    { heading: '双曲线在哪里变得不灵敏', text: '双曲线在锚点围成区域的中部最陡峭，沿两个锚点的连线方向则逐渐变得平缓。把 badge-1 从中部移开，下表是七个块给出的结果。越过一条基线的末端之后，结果已经不能算作一次有效的拟合。' },
    { kind: 'table', heading: '移动 badge-1 的位置', head: [
      '位置', 'GDOP',
      '长半轴', '七个块的定位误差',
    ], rows: [
      ['(4, 3.5)，房间中部', '0.84', '18.6–23.0 cm', '11–26 cm'],
      ['(5, 0.5)，anchor-1 与 anchor-2 的连线上', '1.06', '—', 'worst 34 cm'],
      ['(9.8, 0.2)，越过该连线的末端', '1.49', '35.7 cm', 'worst 2.64 m'],
      ['(3.0, 4.8)，全屋最佳位置', '0.83', '—', '16–24 cm'],
    ] },
    { heading: '十个接收端的额外开销', text: '没有任何额外开销。三个场景中锚点都发出 35 帧、7.159 299 ms 的空口时间，占比 0.511 %，而且逐个发送者比对，帧完全相同。双向测距则每个标签要占用一轮，而 200 ms 的块中能容纳十个 20 ms 的轮次，于是十个就是它的上限，代价是每块 100 帧，而本轮只需 5 帧。' },
  ],
  limits: [
    { kind: 'model-value', text: '每个应答锚点报告的时钟偏差，在本课中并不是从载波上估计出来的。本课取的是两个晶振的真实差值，再加 0.2 ppm 的白噪声——没有相关器，也没有载波估计过程。这个 0.2 ppm 是模型取值，而且不随信干噪比变化：同一次接收中，时间戳的噪声会按 1/√SNR 放大，最多可达十倍，而这一项保持不变。「这次修正的效果」那张表的最后一列完全取决于它。' },
    { kind: 'threshold', text: '关闭修正后「一次定位也没有」，在本课中并不是校验的结果。本课的解算并不检查距离之差是否超过两个锚点的间距：它仍然从锚点质心开始迭代，持续发散，直到方程组退化、无法继续求解才放弃。那三个几十米的时间差确实解不出任何位置，但那是一次没有说明原因的失败，而不是明确判定「这组数不可能」。真实的定位引擎会在解算之前就丢弃它，并说明理由。' },
    { kind: 'unmodelled', text: '勘测误差在本课中会在两处起作用，而两处的取值都是零。Δ_i 中扣除的 Poll 沿基线传播的时间，用的是锚点坐标的真值；解算时用的四个锚点坐标也是同一份真值。此外，anchor-1 的 Final 中携带的每一个 Response 到达计数，本课的胸牌都不读取——它只从 Final 中取发送计数值。而在真实部署中，正是这些计数被用来交叉核对每个应答锚点报告的偏差。' },
    { kind: 'out-of-scope', text: '「十个接收端与三个接收端的开销完全相同」在本课中是精确成立的，真实部署中不会如此理想。本课中 UWB 链路的电平只由几何与墙体决定，不含衰落。于是没有哪个胸牌会因为处于覆盖边缘而漏收 Poll 或 Final，而漏收其中任何一帧，这一轮就得不出任何时间差。所以本课测得的是「接收端不增加开销」的上限。' },
  ],
  sources: [
    '本课只有一处以标准正文为依据：IEEE Std 802.15.4-2024 §10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第二种——一组彼此同步的固定节点按已知的发送时刻偏移依次广播，移动节点根据这些消息到达时刻之差推算自己的位置。「下行形态」「参考锚点」这些名称都不出自标准。±20 ppm 的晶振容差出自 §16.4.9（HRP UWB 物理层的发射中心频率容差）。',
    '其余都是模型：锚点之间不同步、由胸牌自行换算（标准描述的是彼此同步的固定节点），三种消息取 FiRa 风格的内容，每一帧携带发送者自己的发送计数器以及它为别人保存的接收计数器；2 ms 的测距时隙；胸牌的时钟速率修正与各应答锚点的时钟偏差修正；以及上面引用的每一个数字。',
    '噪声取值同样是模型取值：每个接收时间戳上 100 ps 的 1σ 噪声，以及测得的时钟偏差上 0.2 ppm 的剩余误差。锚点自身的坐标被视为勘测完全准确——现实中没有哪次安装能做到。',
  ],
  scenario: () => uwbDlTdoaScenario('base'),
  variants: [
    { label: '关闭时钟修正', scenario: () => uwbDlTdoaScenario('raw') },
    { label: '十个标签', scenario: () => uwbDlTdoaScenario('ten') },
  ],
  jumps: [
    J('锚点自行发起的那一轮', firstUwbDlRound),
    J('anchor-1 的 Poll 开启这一轮', firstUwbPoll),
    J('胸牌记录的第一个到达时间戳', firstUwbRxTs),
    J('结束这一轮的 Final 帧', firstUwbFinal),
    J('第一个时间差', firstUwbTdoa),
    J('由它解出的定位', firstUwbPosition),
  ],
  observe: [
    '日志开头是每个胸牌各一行的轮次记录，随后是它们各自的第一个时隙，之后才是 anchor-1 的 Poll。整段运行中每一次发送都来自某个锚点——一共三十五次，胸牌一次也没有发送。',
    '跟随一个胸牌完成一轮：五个到达时间戳，分别在 220.978 µs、2.199 445 ms、4.199 442 ms、6.199 447 ms 与 8.203 542 ms。第一个与最后一个之间，正是它用来测量自身时钟速率的跨度。',
    '在这一轮的末尾，三个时间差和一个位置同时出现，每一项旁边都显示真值。检视面板中没有任何距离：表格的标题是“到达时间差”。',
  ],
  tryThis: [
    '载入“关闭时钟修正”。每个时间差都偏长几十米，整段运行中也不会出现任何一行定位：63 个时间差，0 次定位。大于两锚点间距的距离差不对应任何双曲线，所以不可能解出位置；本课的解算器并不先做这项检查，而是迭代到无法继续才放弃（见本课的限制）。',
    '载入“十个标签”：得到 70 个位置而不是 21 个，依靠的仍是锚点原先发出的那些帧。再把 badge-1 拖到两个锚点的连线上，然后拖过连线的末端——在曲线变得平缓的地方，结果就变差。',
  ],
  quiz: [
    {
      q: '只接收的胸牌为什么必须消除自身的晶振误差，而双向测距的标签却不必？',
      options: [
        '单向轮次里没有载波可用来估计偏差',
        '它相减的是自己测得的、相隔若干毫秒的两个到达时刻——没有任何机制抵消晶振误差',
        '锚点晶振的容差更严',
      ],
      answer: 1,
      explain: '一次往返在两端各测量一段间隔。本课的解决办法（FiRa 风格，标准没有规定）是利用两端时钟都记录过的那段跨度：从参考锚点的第一帧到它的最后一帧。',
    },
    {
      q: '关闭修正后：63 个时间差，一次定位也没有。为什么是“没有”，而不是“一个很差的”？',
      options: [
        '胸牌在缺少速率估计时拒绝解算',
        '大于两个锚点间距的时间差不对应任何双曲线',
        '测距计数器溢出了',
      ],
      answer: 1,
      explain: '距离之差不可能超过两个锚点之间的距离，所以它不对应任何一个点，也就无法输出定位。',
    },
    {
      q: '胸牌从三个增加到十个，锚点发送的帧却不变。双向测距为什么做不到？',
      options: [
        '双向轮次属于发起它的那个标签，所以每个标签都要占用一轮',
        '双向测距的帧更大',
        '双向测距会要求锚点之间同步',
      ],
      answer: 0,
      explain: '这里每一帧都是广播，不指定任何接收方：对一个接收端和对一万个接收端，都是同一轮。',
    },
  ],
}
