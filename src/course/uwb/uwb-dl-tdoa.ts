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
  module: 14,
  title: '只听不发的定位',
  why: '一栋楼里挂满了胸牌，双向测距就顶不住了：每个标签（也就是被定位的那一端）都要独占一轮，楼还没覆盖完，空口先用光了。那就把这次交互翻过来。让锚点之间按固定的时间表互相说话，而胸牌只凭听到的先后与间隔，把自己放到地图上。',
  outcomes: [
    '说清一个不发信号的胸牌，单凭到达时刻能算出什么',
    '解释这样的胸牌为什么必须先把自己的时钟对着锚点量一遍',
    '从日志里读出一个时间差，以及它喂出来的那个位置',
  ],
  needs: ['uwb-geometry'],
  terms: [
    { term: 'TDoA', plain: '到达时间差：靠信号落地的先后来定位，而不是靠谁离谁有多远' },
    { term: 'DL-TDoA', plain: '下行形态：发送全归锚点，被定位的一方只负责听' },
    { term: 'hyperbola', plain: '一条曲线，线上每点到一个锚点都恰好比到另一个远出同样多' },
    { term: 'clock correction', plain: '先把听者自己时钟的快慢除掉，再去信它量出的任何一段间隔' },
  ],
  picture: [
    { heading: '这一轮不为你而开', text: '在此之前，每一轮测距都属于某个标签：它问，锚点答，再由它来算。现在把这件事翻过来。这里是锚点自己开一轮，每块开一次——其中一个开启这一轮，其余的在各自时隙里作答，最后仍由它收尾——而挂在脖子上的胸牌全程听着，一个字也不发。' },
    { heading: '量的是差，不是距离', text: '不发信号的胸牌，永远量不出某个锚点有多远：那需要一次往返，而它一次也不做。它能做的只是相减——这一帧比那一帧早落地，早了这么多。靠这些间隔来定位，就是 TDoA（到达时间差）；而本课要跑的，正是它的下行形态 DL-TDoA——发送全由锚点承担的那一种。' },
    { kind: 'watch', jump: 4, heading: '看一个时间差出现', text: '载入仿真，跳到第一个时间差。它出现在这一轮的末尾，每个作答的锚点一行，每一行旁边都印着真值。' },
    { heading: '三条曲线，不是三个圆环', text: '一个距离把标签放在一个圆上。两个距离之差则把它放在一条双曲线（hyperbola）上——线上每一点到某个锚点，都恰好比到另一个锚点远出那么多——这两个锚点就是曲线的焦点。三条这样的曲线相交之处，就是胸牌所在；场景里因此一个圆环也不画。' },
    { heading: '它自己的时钟碍事了', text: '双向测距里，标签的晶振在一次往返之内就被抵消掉了，根本到不了结果里。而这里，胸牌相减的是自己相隔若干毫秒的两个到达时刻，于是晶振只要快上百万分之几，就会把这整段间隔一起拉长。拉长的量是几十米。放着不管，这个模式不成立。' },
    { heading: '拿自己的钟去比他们的钟', text: '解法藏在同一段时间里，而这段时间两边都各自描述过。参考锚点在帧里报出自己何时发出第一帧、何时发出最后一帧，而胸牌手里有这两帧各自的到达时刻。两段跨度之比就是时钟修正（clock correction）：除以它，就把胸牌的晶振和参考锚点的晶振一起消掉了。' },
    { heading: '不会变大的一轮', text: '这一轮里没有任何一处点到某个胸牌的名字，所以也没有任何一处会随听众的数量增长：十个听众与三个听众，锚点的开销一模一样。双向测距做不到，因为一轮属于发起它的那个标签。而一个什么也不发的胸牌，在空口上根本数不出来。' },
  ],
  numbers: [
    { kind: 'table', heading: '房间里都有谁', head: [
      '节点', '位置',
    ], rows: [
      ['anchor-1 … anchor-4', '4 corners, 10 × 8 m lab, 2.20 m'],
      ['badge-1, badge-2, badge-3', '(4, 3.5), (7, 6) and (2, 6.5), 1.00 m'],
    ] },
    { kind: 'table', heading: '五个 2 ms 的时隙，每块一次', head: [
      '时隙', '发送者', '帧', '它携带什么',
    ], rows: [
      ['0', 'anchor-1', 'Poll, 42 B, 216.1 µs',
        '它自己的发送计数器，以及谁在哪个时隙作答'],
      ['1–3', 'anchor-2/3/4', 'Response, 30 B, 197.6 µs',
        '它的发送计数器、它记下的 Poll 到达计数，以及它测得的相对 anchor-1 的时钟偏差'],
      ['4', 'anchor-1', 'Final, 34 B, 201.7 µs',
        '它的发送计数器，以及它记下的每一帧 Response 的到达计数——本课的胸牌并不使用它们'],
    ] },
    { kind: 'formula', heading: '一个胸牌要算什么', text: 'r = (rx_F − rx_P)_胸牌 ÷ (tx_F − tx_P)_anchor-1\nΔ_i = (rx_i − rx_P)_胸牌 ÷ r − ( tof(a₁ → a_i) + T_reply,i · (1 − coff_i) )', note: '第一行求的是速率，第二行扣掉不属于几何的部分。本节末尾的步骤，会拿一个胸牌把这两行各走一遍。' },
    { text: '胸牌的晶振最多可以偏到 20 ppm，而最后一个应答锚点在 Poll 之后整整 6 ms 才作答。这么大的偏差乘上这么长的间隔，是 120 ns，折合 36 m。' },
    { kind: 'table', heading: '这次修正值多少', head: [
      '应答锚点', '它等了',
      '未修正，badge-2', '修正后，21 次里最差',
      '剩余误差的 3σ',
    ], rows: [
      ['anchor-2', '2 ms', '22.02 m', '0.19 m', '0.36 m'],
      ['anchor-3', '4 ms', '44.04 m', '0.44 m', '0.72 m'],
      ['anchor-4', '6 ms', '65.81 m', '0.51 m', '1.08 m'],
    ] },
    { text: '未修正那一列，正是这个胸牌与参考晶振之间 36.69 ppm 的差距，乘上旁边那段等待。剩下的是每个应答锚点自己那一点时钟偏差剩余误差，为它所修正的那段应答时延的 0.2 ppm——每个时隙 0.12 m，所以最后作答的锚点最差。63 个时间差全部落在最后一列之内。' },
    { kind: 'table', heading: '三个场景，各七个块', head: [
      '场景', '时间差', '最差的时间差',
      '定位', '定位误差',
    ], rows: [
      ['三个胸牌', '63', '0.51 m', '21', '0.11–0.36 m'],
      ['关闭时钟修正', '63', '66.29 m', '0', '完全没有定位'],
      ['十个标签', '210', '0.51 m', '70', '0.02–0.37 m'],
    ] },
    { kind: 'table', heading: '日志印出什么：badge-1，第 0 块', head: [
      '行', '写的是',
    ], rows: [
      ['胸牌开启的那一轮',
        'badge-1 UWB round 0 of block 0 (DL-TDoA): 5 slots × 2000.0 µs'],
      ['第一个时间差',
        'badge-1 TDoA anchor-2 − anchor-1: 5.66 ns (true 5.39 ns)'],
      ['它喂出来的那个位置',
        'badge-1 position (3.90, 3.74) m, true (4.00, 3.50), error 0.26 m, GDOP 0.84, 4 anchors (DL-TDoA)'],
      ['七个块之后的 badge-1',
        'error 19.6 cm, GDOP 0.85, ellipse 19.8 × 10.3 cm, DL-TDoA'],
    ] },
    { kind: 'steps', heading: '一个时间差，一步一步', items: [
      '时隙 0。anchor-1 广播 Poll，帧里带着它自己的发送计数值。每个胸牌用自己的计数器给这次到达打戳——日志上的一行 UWB_TS——两个数都留下。',
      '时隙 1 至 3。其余三个依次作答。每一帧 Response 里带着：它自己的发送计数值、它给 Poll 到达打下的计数值，以及它从 Poll 载波上读出的、相对 anchor-1 的时钟偏差。',
      '时隙 4。anchor-1 发出 Final 收尾，帧里同样带着发送计数值。至此同一段跨度，胸牌手里有了两份：它自己的两个到达时刻，以及 anchor-1 的两个发出时刻。',
      '前一段跨度除以后一段。从 anchor-1 飞来的那段路程同时落在两个到达时刻里，一减即消，于是 anchor-1 自己的晶振也退出了这个比值——它跑多少 ppm 都不影响。',
      '再逐个应答锚点来算：先把胸牌两次到达之间的间隔除以那个比值，再扣掉不属于几何的部分——它报出的应答时延，按它的时钟偏差换算过来，加上 Poll 沿那段已勘测锚点基线飞行的时间。',
      '剩下的就是一个距离之差除以 c，以一行 UWB_TDOA 印出来，旁边写着真值。它的 1σ 由两项合成：√2·c·σ_ts，以及刚才所修正的那段应答时延的 0.2 ppm——所以最后作答的那个锚点量得最差。',
      '三个时间差就是三条双曲线，每一条以 anchor-1 和一个应答锚点为焦点。解算器在胸牌预设的高度上把它们相交，再发出那一行定位。交不出来，就一行也没有。',
    ] },
    { kind: 'table', heading: 'badge-1，第 0 块，对 anchor-2', head: [
      '步骤', '数值',
    ], rows: [
      ['Poll 到达、Final 到达', '1 055 768 250 362, 1 056 279 432 185'],
      ['anchor-1 发出它们的时刻', '827 981 809 319, 828 492 980 386'],
      ['两段跨度，以及它们的比值', '511 181 823 ÷ 511 171 067 = 1.000 021 04'],
      ['anchor-2 的 Response 到达', '1 055 896 046 160'],
      ['距 Poll 的间隔，再除以比值', '127 795 798 → 127 793 109'],
      ['它等了，偏差 +2.330 ppm', '127 791 127 → 127 790 829'],
      ['再加 9.00 m 基线', '+1918 = 127 792 747'],
      ['剩下的', '361.5 · 5.66 ns · 1.70 m'],
      ['真值', '5.39 ns · 1.62 m'],
    ] },
  ],
  deeper: [
    { heading: '本场景抽到的那些晶振', text: '这里没有任何一个晶振是钉死的，全是抽出来的。anchor-1 抽到 −19.04 ppm，三个胸牌抽到 1.96、17.65 与 4.08——与参考锚点相差 21.00、36.69 与 23.12 ppm。那个比值把参考锚点的晶振消得和胸牌的一样干净：把 anchor-1 钉在 +20 ppm——相对原值摆动了 39 ppm——运行结果仍是 0.19、0.44 与 0.51 m，分毫不差。再把三个胸牌钉在 +20、−20 与 0 ppm，最大值是 0.24、0.46 与 0.54 m：依然是分米级，依然是 21 次定位。而关掉修正时，badge-2 的第一个块读出 65.60、139.29 与 201.83 ns，而真值是 −8.14、−6.07 与 −18.17 ns。' },
    { heading: '为什么它比双向测距的定位差', text: '不要把两边的 GDOP 数值拿来互相对照：双曲线定位的雅可比每一行是两个单位向量之差，因此在锚点正方形中心处它的下限是 √(2/3) = 0.82，而三边定位的下限是 1.00。真正有意义的对照是误差。《从四个距离到一个点》在同一个房间、同样这四个锚点上得到的双向定位误差，保持在 0.5 到 3.3 cm；这里则是 11 到 36 cm。' },
    { heading: '那个椭圆，以及它有多诚实', text: '长半轴在 18.6 到 23.0 cm 之间，而那一课是 1.7 cm；它由 √((√2·c·σ_ts)² + (c·T_reply,i·0.2 ppm)²) 对三个应答锚点合成——其中只有 4 cm 来自时间戳噪声——而每一次定位都落在 1.6 个长半轴之内。但它仍是一阶近似：应答时延 2、4、6 ms 并不共用同一个 σ，所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。' },
    { heading: '双曲线在哪里软下来', text: '双曲线在锚点围成区域的中部最锐利，沿着连接两个锚点的那条线则渐渐摊平。把 badge-1 从中部拖走，下表就是七个块给出的结果。越过一条基线的末端之后，那已经算不上是一次拟合了。' },
    { kind: 'table', heading: '把 badge-1 挪一挪', head: [
      '它站在哪里', 'GDOP',
      '长半轴', '七个块的定位误差',
    ], rows: [
      ['(4, 3.5)，房间中部', '0.84', '18.6–23.0 cm', '11–26 cm'],
      ['(5, 0.5)，anchor-1 与 anchor-2 之间的线上', '1.06', '—', 'worst 34 cm'],
      ['(9.8, 0.2)，越过那条线的末端', '1.49', '35.7 cm', 'worst 2.64 m'],
      ['(3.0, 4.8)，全屋最好的位置', '0.83', '—', '16–24 cm'],
    ] },
    { heading: '十个听众要多少钱', text: '一分不多。三个场景里锚点都发出 35 帧、7.074 935 ms 的空口时间，占比 0.505 %，而且逐个发送者比对，帧完全相同。双向测距则每个标签要占一轮，而 200 ms 的块里装得下十个 20 ms 的轮次，于是十个就是它的上限，代价是每块 100 帧，而本轮只要 5 帧。' },
  ],
  sources: [
    '本课只有一处以标准正文为依据：IEEE Std 802.15.4-2024 §10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第二种——一组彼此时钟同步的节点发送，移动节点从这些消息到达时刻之差反推自己在哪里。±20 ppm 的晶振容差出自 §16.4.9。',
    '其余都是模型：三种消息取 FiRa 风格的内容，每一帧携带发送者自己的发送计数器以及它为别人保存的接收计数器；2 ms 的测距时隙；胸牌的时钟速率修正与各应答锚点的时钟偏差修正；以及上面引用的每一个数字。',
    '噪声取值同样是模型取值：每个接收时间戳上 100 ps 的 1σ 噪声，以及测得的时钟偏差上 0.2 ppm 的剩余误差。锚点自身的坐标被当作勘测得分毫不差——现实中没有哪次安装能做到。',
  ],
  scenario: () => uwbDlTdoaScenario('base'),
  variants: [
    { label: '关闭时钟修正', scenario: () => uwbDlTdoaScenario('raw') },
    { label: '十个标签', scenario: () => uwbDlTdoaScenario('ten') },
  ],
  jumps: [
    J('锚点自己开的那一轮', firstUwbDlRound),
    J('anchor-1 的 Poll 开启这一轮', firstUwbPoll),
    J('胸牌打下的第一个到达时间戳', firstUwbRxTs),
    J('收尾的那一帧 Final', firstUwbFinal),
    J('第一个时间差', firstUwbTdoa),
    J('由它解出的定位', firstUwbPosition),
  ],
  observe: [
    '日志开头是每个胸牌各一行的轮次，随后是它们各自的第一个时隙，再往后才轮到 anchor-1 的 Poll。整段运行里每一次发送都属于某个锚点——一共三十五次，胸牌一次也没有。',
    '跟着一个胸牌走完一轮：五个到达时间戳，分别在 216.106 µs、2.197 650 ms、4.197 647 ms、6.197 652 ms 与 8.201 747 ms。第一个与最后一个之间，正是它用来量自己那只钟的跨度。',
    '这一轮的末尾，三个时间差和一个位置一起出现，每一项旁边都印着真值。检视面板里一个距离也没有：表格的标题是“到达时间差”。',
  ],
  tryThis: [
    '载入“关闭时钟修正”。每个时间差都偏长了几十米，整段运行里也不会出现任何一行定位：63 个时间差，0 次定位。一个大于两锚点间隔的距离差落不到任何双曲线上，于是解算器什么也不给。',
    '载入“十个标签”：70 个位置而不是 21 个，靠的还是锚点之前发出的那些帧。再把 badge-1 拖到连接两个锚点的那条线上，然后拖过它的末端——曲线摊平的地方，答案就变差。',
  ],
  quiz: [
    {
      q: '只听的胸牌为什么必须把自己的晶振除掉，而双向测距的标签却不必？',
      options: [
        '单向轮次里没有载波可用来估计偏差',
        '它相减的是自己相隔若干毫秒的两个到达时刻——没有任何机制抵消晶振',
        '锚点晶振的容差更严',
      ],
      answer: 1,
      explain: '一次往返在两端各量一段间隔。解法是两只钟都描述过的那段跨度：参考锚点的第一帧到它的最后一帧。',
    },
    {
      q: '关闭修正后：63 个时间差，一次定位也没有。为什么是“没有”，而不是“一个很差的”？',
      options: [
        '胸牌在缺少速率估计时拒绝解算',
        '大于两个锚点间隔的时间差落不到任何双曲线上',
        '测距计数器溢出了',
      ],
      answer: 1,
      explain: '距离之差不可能超过两个锚点之间的距离，所以它压根不描述任何一点，也就发不出定位。',
    },
    {
      q: '胸牌从三个变成十个，锚点发的帧却一样。双向测距为什么不行？',
      options: [
        '双向轮次属于发起它的那个标签，所以每个标签都要花掉一轮',
        '双向测距的帧更大',
        '双向测距会要求锚点之间同步',
      ],
      answer: 0,
      explain: '这里每一帧都是广播，谁的名字也不点：对一个听众和对一万个听众，都是同一轮。',
    },
  ],
}
