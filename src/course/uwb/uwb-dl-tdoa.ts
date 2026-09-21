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
 * `npx tsx scripts/lesson-dump.ts uwb-dl-tdoa en` prints the section budgets.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, firstUwbDlRound, firstUwbFinal, firstUwbPoll, firstUwbPosition, firstUwbRxTs,
  firstUwbTdoa, oneRoom, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/** Which scene the lesson runs: three listeners, three listeners with the tag clock left raw, or ten. */
export type UwbDlTdoaVariant = 'base' | 'raw' | 'ten'

/**
 * The four corner anchors, in the order the round uses them. The first is the
 * reference: it sends the Poll in slot 0 and the Final in the last slot, and
 * every time difference a badge computes is taken against its Poll. The other
 * three answer in slots 1, 2 and 3, in this order — which is why their
 * clock-offset residuals grow down the list.
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
  title: { en: 'Listen-only positioning', zh: '只听不发的定位' },
  why: {
    en: 'A building full of badges defeats two-way ranging: every tag wants a round of its own, and the air runs out long before the building is covered. So turn the exchange over. Let the anchors talk to each other on a fixed timetable, and let a badge place itself from nothing but the order and the spacing of what it hears.',
    zh: '一栋楼里挂满了胸牌，双向测距就顶不住了：每个标签都要独占一轮，楼还没覆盖完，空口先用光了。那就把这次交互翻过来。让锚点之间按固定的时间表互相说话，而胸牌只凭听到的先后与间隔，把自己放到地图上。',
  },
  outcomes: [
    { en: 'say what a silent badge can work out from arrival times alone', zh: '说清一个不发信号的胸牌，单凭到达时刻能算出什么' },
    { en: 'explain why it must first measure its own clock against the anchors’', zh: '解释这样的胸牌为什么必须先把自己的时钟对着锚点量一遍' },
    { en: 'read a time difference and the place it feeds off the log', zh: '从日志里读出一个时间差，以及它喂出来的那个位置' },
  ],
  needs: ['uwb-position'],
  terms: [
    { term: 'TDoA', plain: {
      en: 'time difference of arrival: placing something by when its signals landed, not by how far off it is',
      zh: '到达时间差：靠信号落地的先后来定位，而不是靠谁离谁有多远',
    } },
    { term: 'DL-TDoA', plain: {
      en: 'the downlink form: the anchors transmit, and the thing being located only listens',
      zh: '下行形态：发送全归锚点，被定位的一方只负责听',
    } },
    { term: 'hyperbola', plain: {
      en: 'the curve of every point a fixed amount further from one anchor than from another',
      zh: '一条曲线，线上每点到一个锚点都恰好比到另一个远出同样多',
    } },
    { term: 'clock correction', plain: {
      en: 'dividing out how fast the listener’s own clock runs, before any gap it timed is believed',
      zh: '先把听者自己时钟的快慢除掉，再去信它量出的任何一段间隔',
    } },
  ],
  picture: [
    { heading: { en: 'The round runs without you', zh: '这一轮不为你而开' }, text: {
      en: 'Every ranging round so far belonged to a tag: it asked, the anchors answered, it did the arithmetic. Turn that over. Here the anchors run a round of their own once a block — one opens it, the others answer in their slots, the same one closes it — while a badge on a lanyard listens and says nothing.',
      zh: '在此之前，每一轮测距都属于某个标签：它问，锚点答，再由它来算。现在把这件事翻过来。这里是锚点自己开一轮，每块开一次——其中一个开启这一轮，其余的在各自时隙里作答，最后仍由它收尾——而挂在脖子上的胸牌全程听着，一个字也不发。',
    } },
    { heading: { en: 'Differences, not distances', zh: '量的是差，不是距离' }, text: {
      en: 'A silent badge can never learn how far an anchor is: that takes a round trip, and it makes none. What it can do is subtract — this frame landed before that one, by this much. Placing something from those gaps is TDoA, time difference of arrival, and its downlink form — the one where the anchors do all the transmitting — is what this lesson runs.',
      zh: '不发信号的胸牌，永远量不出某个锚点有多远：那需要一次往返，而它一次也不做。它能做的只是相减——这一帧比那一帧早落地，早了这么多。靠这些间隔来定位，就是 TDoA（到达时间差）；而本课要跑的，正是它的下行形态——发送全由锚点承担的那一种。',
    } },
    { kind: 'watch', jump: 4, heading: { en: 'Watch a difference appear', zh: '看一个时间差出现' }, text: {
      en: 'Load the simulation and jump to the first time difference. It arrives at the end of the round, one line per answering anchor, with the truth printed beside each.',
      zh: '载入仿真，跳到第一个时间差。它出现在这一轮的末尾，每个作答的锚点一行，每一行旁边都印着真值。',
    } },
    { heading: { en: 'Three curves, not three rings', zh: '三条曲线，不是三个圆环' }, text: {
      en: 'A distance puts a tag on a circle. A difference of two distances puts it on a hyperbola — every point exactly that much further from one anchor than from the other — with those two anchors as its focal points. Three such curves cross where the badge stands, and the scene draws no rings at all.',
      zh: '一个距离把标签放在一个圆上。两个距离之差则把它放在一条双曲线（hyperbola）上——线上每一点到某个锚点，都恰好比到另一个锚点远出那么多——这两个锚点就是曲线的焦点。三条这样的曲线相交之处，就是胸牌所在；场景里因此一个圆环也不画。',
    } },
    { heading: { en: 'Its own clock gets in the way', zh: '它自己的时钟碍事了' }, text: {
      en: 'In a two-way round the tag’s crystal cancels inside the round trip. Here the badge subtracts two of its own arrivals, milliseconds apart, so a crystal running a few parts per million fast stretches that whole gap. The stretch is tens of metres. Left alone, the mode does not work.',
      zh: '双向测距里，标签的晶振在一次往返之内就被抵消掉了，根本到不了结果里。而这里，胸牌相减的是自己相隔若干毫秒的两个到达时刻，于是晶振只要快上百万分之几，就会把这整段间隔一起拉长。拉长的量是几十米。放着不管，这个模式不成立。',
    } },
    { heading: { en: 'Measuring its clock against theirs', zh: '拿自己的钟去比他们的钟' }, text: {
      en: 'The cure is the one span both ends describe. The reference anchor says in its frames when it sent the first of them and when it sent the last; the badge holds its own arrivals for those. The ratio of the two spans is the clock correction, and dividing by it removes the badge’s crystal and the reference anchor’s alike.',
      zh: '解法是那一段两边都描述过的跨度。参考锚点在帧里报出自己何时发出第一帧、何时发出最后一帧，而胸牌手里有这两帧各自的到达时刻。两段跨度之比就是时钟修正（clock correction）：除以它，就把胸牌的晶振和参考锚点的晶振一起消掉了。',
    } },
    { heading: { en: 'A round that does not grow', zh: '不会变大的一轮' }, text: {
      en: 'Nothing in this round names a badge, so nothing in it grows with how many are listening: ten cost the anchors what three do. Two-way ranging cannot: a round belongs to the tag that started it. And a badge that says nothing cannot be counted from the air.',
      zh: '这一轮里没有任何一处点到某个胸牌的名字，所以也没有任何一处会随听众的数量增长：十个听众与三个听众，锚点的开销一模一样。双向测距做不到，因为一轮属于发起它的那个标签。而一个什么也不发的胸牌，在空口上根本数不出来。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'Who is in the room', zh: '房间里都有谁' }, head: [
      { en: 'Nodes', zh: '节点' }, { en: 'Where', zh: '位置' },
    ], rows: [
      [N('anchor-1 … anchor-4'), N('4 corners, 10 × 8 m lab, 2.20 m')],
      [N('badge-1, badge-2, badge-3'), N('(4, 3.5), (7, 6) and (2, 6.5), 1.00 m')],
    ] },
    { kind: 'table', heading: { en: 'Five slots of 2 ms, once a block', zh: '五个 2 ms 的时隙，每块一次' }, head: [
      { en: 'Slot', zh: '时隙' }, { en: 'Sender', zh: '发送者' }, { en: 'Frame', zh: '帧' }, { en: 'What it carries', zh: '它携带什么' },
    ], rows: [
      [N('0'), N('anchor-1'), N('Poll, 42 B, 216.1 µs'),
        { en: 'its transmit counter, and who answers where', zh: '它自己的发送计数器，以及谁在哪个时隙作答' }],
      [N('1–3'), N('anchor-2/3/4'), N('Response, 30 B, 197.6 µs'),
        { en: 'its transmit counter, its counter for the Poll, its clock offset to anchor 1', zh: '它的发送计数器、它记下的 Poll 到达计数，以及它测得的相对 anchor-1 的时钟偏差' }],
      [N('4'), N('anchor-1'), N('Final, 34 B, 201.7 µs'),
        { en: 'its transmit counter, and a counter for each Response, which no badge reads', zh: '它的发送计数器，以及它记下的每一帧 Response 的到达计数——本课的胸牌并不使用它们' }],
    ] },
    { kind: 'formula', heading: { en: 'What a badge computes', zh: '一个胸牌要算什么' }, text: {
      en: 'r = (rx_F − rx_P)_badge ÷ (tx_F − tx_P)_anchor-1\nΔ_i = (rx_i − rx_P)_badge ÷ r − ( tof(a₁ → a_i) + T_reply,i · (1 − coff_i) )',
      zh: 'r = (rx_F − rx_P)_胸牌 ÷ (tx_F − tx_P)_anchor-1\nΔ_i = (rx_i − rx_P)_胸牌 ÷ r − ( tof(a₁ → a_i) + T_reply,i · (1 − coff_i) )',
    }, note: {
      en: 'The first line is the rate: the flight from anchor 1 sits in both of the badge’s arrivals and cancels. The second takes out what is not geometry — anchor i waited T_reply,i on its own clock, and the Poll crossed the surveyed baseline first. What is left is a difference of distances divided by c.',
      zh: '第一行求的是速率：从 anchor-1 飞来的那段路程同时落在胸牌的两个到达时刻里，一减即消。第二行扣掉不属于几何的部分——锚点 i 按自己的钟等了 T_reply,i，再用它测得的偏差换算过来；而 Poll 还得先跨过那段已勘测的锚点基线。剩下的，就是一个距离之差除以 c。',
    } },
    { text: {
      en: 'A badge’s crystal may be built as far out as 20 ppm, and the last responder answers a whole 6 ms after the Poll. That much of that long is 120 ns, or 36 m — what the clock correction has to remove.',
      zh: '胸牌的晶振最多可以偏到 20 ppm，而最后一个应答锚点在 Poll 之后整整 6 ms 才作答。这么大的偏差乘上这么长的间隔，是 120 ns，折合 36 m——正是时钟修正要除掉的东西。',
    } },
    { kind: 'table', heading: { en: 'What the correction is worth', zh: '这次修正值多少' }, head: [
      { en: 'Responder', zh: '应答锚点' }, { en: 'It waited', zh: '它等了' },
      { en: 'Uncorrected, badge 2', zh: '未修正，badge-2' }, { en: 'Corrected, worst of 21', zh: '修正后，21 次里最差' },
      { en: '3σ of the residual', zh: '残差的 3σ' },
    ], rows: [
      [N('anchor-2'), N('2 ms'), N('22.02 m'), N('0.19 m'), N('0.36 m')],
      [N('anchor-3'), N('4 ms'), N('44.04 m'), N('0.44 m'), N('0.72 m')],
      [N('anchor-4'), N('6 ms'), N('65.81 m'), N('0.51 m'), N('1.08 m')],
    ] },
    { text: {
      en: 'The uncorrected column is that badge’s gap to the reference crystal, 36.69 ppm, times the wait beside it. What survives is each responder’s clock-offset residual, 0.2 ppm of the reply time it corrects — 0.12 m per slot, so the last to answer is the worst. All 63 differences fall inside the last column.',
      zh: '未修正那一列，正是这个胸牌与参考晶振之间 36.69 ppm 的差距，乘上旁边那段等待。残下来的是每个应答锚点自己的时钟偏差残差，为它所修正的那段应答时延的 0.2 ppm——每个时隙 0.12 m，所以最后作答的锚点最差。63 个时间差全部落在最后一列之内。',
    } },
    { kind: 'table', heading: { en: 'The three scenes, seven blocks each', zh: '三个场景，各七个块' }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'Differences', zh: '时间差' }, { en: 'Worst difference', zh: '最差的时间差' },
      { en: 'Fixes', zh: '定位' }, { en: 'Fix error', zh: '定位误差' },
    ], rows: [
      [{ en: 'Three badges', zh: '三个胸牌' }, N('63'), N('0.51 m'), N('21'), N('0.11–0.36 m')],
      [{ en: 'Clock correction off', zh: '关闭时钟修正' }, N('63'), N('66.29 m'), N('0'), { en: 'no fix at all', zh: '完全没有定位' }],
      [{ en: 'Ten tags', zh: '十个标签' }, N('210'), N('0.51 m'), N('70'), N('0.02–0.37 m')],
    ] },
    { kind: 'table', heading: { en: 'What the log prints, badge 1, block 0', zh: '日志印出什么：badge-1，第 0 块' }, head: [
      { en: 'Line', zh: '行' }, { en: 'It reads', zh: '写的是' },
    ], rows: [
      [{ en: 'The round the badge opens', zh: '胸牌开启的那一轮' },
        N('badge-1 UWB round 0 of block 0 (DL-TDoA): 5 slots × 2000.0 µs')],
      [{ en: 'The first time difference', zh: '第一个时间差' },
        N('badge-1 TDoA anchor-2 − anchor-1: 5.66 ns (true 5.39 ns)')],
      [{ en: 'The place it feeds', zh: '它喂出来的那个位置' },
        N('badge-1 position (3.90, 3.74) m, true (4.00, 3.50), error 0.26 m, GDOP 0.84, 4 anchors (DL-TDoA)')],
      [{ en: 'Badge 1 after seven blocks', zh: '七个块之后的 badge-1' },
        N('error 19.6 cm, GDOP 0.85, ellipse 19.8 × 10.3 cm, DL-TDoA')],
    ] },
  ],
  deeper: [
    { heading: { en: 'The crystals this scene drew', zh: '本场景抽到的那些晶振' }, text: {
      en: 'Nothing here is pinned: every crystal is drawn. Anchor 1 comes out at −19.04 ppm and the three badges at 1.96, 17.65 and 4.08 — 21.00, 36.69 and 23.12 ppm away from the reference. The ratio cancels the reference anchor’s crystal just as exactly as the badge’s. Pin anchor 1 at +20 ppm — a 39 ppm swing — and the run reproduces 0.19, 0.44 and 0.51 m to the centimetre. Pin the badges at +20, −20 and 0 ppm too and the maxima are 0.24, 0.46 and 0.54 m: still decimetres, still 21 fixes.',
      zh: '这里没有任何一个晶振是钉死的，全是抽出来的。anchor-1 抽到 −19.04 ppm，三个胸牌抽到 1.96、17.65 与 4.08——与参考锚点相差 21.00、36.69 与 23.12 ppm。那个比值把参考锚点的晶振消得和胸牌的一样干净：把 anchor-1 钉在 +20 ppm——相对原值摆动了 39 ppm——运行结果仍是 0.19、0.44 与 0.51 m，分毫不差。再把三个胸牌钉在 +20、−20 与 0 ppm，最大值是 0.24、0.46 与 0.54 m：依然是分米级，依然是 21 次定位。',
    } },
    { heading: { en: 'Why the fix is worse than a two-way one', zh: '为什么它比双向测距的定位差' }, text: {
      en: 'Do not read the two GDOP columns against each other: a hyperbolic Jacobian row is a difference of two unit vectors, so at the centre of a square of anchors its floor is √(2/3) = 0.82 where trilateration’s is 1.00. The comparison that means something is the error. The two-way fixes of “From four ranges to a point”, in this same room and off these same anchors, stayed between 0.5 and 3.3 cm; these run between 11 and 36 cm.',
      zh: '不要把两边的 GDOP 数值拿来互相对照：双曲线定位的雅可比每一行是两个单位向量之差，因此在锚点正方形中心处它的下限是 √(2/3) = 0.82，而三边定位的下限是 1.00。真正有意义的对照是误差。《从四个距离到一个点》在同一个房间、同样这四个锚点上得到的双向定位误差，保持在 0.5 到 3.3 cm；这里则是 11 到 36 cm。',
    } },
    { heading: { en: 'The ellipse, and how honest it is', zh: '那个椭圆，以及它有多诚实' }, text: {
      en: 'The semi-major axis runs 18.6 to 23.0 cm against that lesson’s 1.7 cm, built from √((√2·c·σ_ts)² + (c·T_reply,i·0.2 ppm)²) over the three responders — only 4 cm of it timestamp noise — and every fix lands inside 1.6 of those semi-axes. It is first-order, though: reply times of 2, 4 and 6 ms do not share one sigma, so read it as how far the fix may be off rather than as a 68 % interval.',
      zh: '长半轴在 18.6 到 23.0 cm 之间，而那一课是 1.7 cm；它由 √((√2·c·σ_ts)² + (c·T_reply,i·0.2 ppm)²) 对三个应答锚点合成——其中只有 4 cm 来自时间戳噪声——而每一次定位都落在 1.6 个长半轴之内。但它仍是一阶近似：应答时延 2、4、6 ms 并不共用同一个 σ，所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。',
    } },
    { heading: { en: 'Where the hyperbolae go soft', zh: '双曲线在哪里软下来' }, text: {
      en: 'Hyperbolae are sharpest across the middle of the anchor set and flatten along the line joining two anchors. Drag badge 1 out of the middle and the table below is what seven blocks give. Past the end of a baseline the fit is barely a fit at all.',
      zh: '双曲线在锚点围成区域的中部最锐利，沿着连接两个锚点的那条线则渐渐摊平。把 badge-1 从中部拖走，下表就是七个块给出的结果。越过一条基线的末端之后，那已经算不上是一次拟合了。',
    } },
    { kind: 'table', heading: { en: 'Badge 1, moved', zh: '把 badge-1 挪一挪' }, head: [
      { en: 'Where it stands', zh: '它站在哪里' }, { en: 'GDOP', zh: 'GDOP' },
      { en: 'Semi-major axis', zh: '长半轴' }, { en: 'Fix error over seven blocks', zh: '七个块的定位误差' },
    ], rows: [
      [{ en: '(4, 3.5), the middle of the room', zh: '(4, 3.5)，房间中部' }, N('0.84'), N('18.6–23.0 cm'), N('11–26 cm')],
      [{ en: '(5, 0.5), on the anchor-1–anchor-2 line', zh: '(5, 0.5)，anchor-1 与 anchor-2 之间的线上' }, N('1.06'), N('—'), N('worst 34 cm')],
      [{ en: '(9.8, 0.2), past the end of that line', zh: '(9.8, 0.2)，越过那条线的末端' }, N('1.49'), N('35.7 cm'), N('worst 2.64 m')],
      [{ en: '(3.0, 4.8), the room’s best spot', zh: '(3.0, 4.8)，全屋最好的位置' }, N('0.83'), N('—'), N('16–24 cm')],
    ] },
    { heading: { en: 'What ten listeners cost', zh: '十个听众要多少钱' }, text: {
      en: 'Nothing. In every scene the anchors send 35 frames, 7.074 935 ms of air, 0.505 % of the time, and the frames are identical sender for sender. Two-way ranging needs a round per tag, and a 200 ms block holds ten 20 ms rounds, so ten is its ceiling at 100 frames a block against this round’s five.',
      zh: '一分不多。三个场景里锚点都发出 35 帧、7.074 935 ms 的空口时间，占比 0.505 %，而且逐个发送者比对，帧完全相同。双向测距则每个标签要占一轮，而 200 ms 的块里装得下十个 20 ms 的轮次，于是十个就是它的上限，代价是每块 100 帧，而本轮只要 5 帧。',
    } },
  ],
  sources: [
    { en: 'One thing here is the standard’s: IEEE Std 802.15.4-2024 §10.29.1.2.5 gives time-difference-of-arrival ranging in two forms, and this lesson is the second — synchronised nodes transmit, and the mobile node places itself from the differences between their arrival times. The ±20 ppm crystal tolerance is §16.4.9.',
      zh: '本课只有一处以标准正文为依据：IEEE Std 802.15.4-2024 §10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第二种——一组彼此时钟同步的节点发送，移动节点从这些消息到达时刻之差反推自己在哪里。±20 ppm 的晶振容差出自 §16.4.9。' },
    { en: 'The rest is the model: the FiRa-style content of the three messages, each carrying its sender’s own transmit counter and the receive counters it holds for the others; the 2 ms ranging slot; the badge’s clock-rate correction and each responder’s clock-offset correction; and every number quoted above.',
      zh: '其余都是模型：三种消息取 FiRa 风格的内容，每一帧携带发送者自己的发送计数器以及它为别人保存的接收计数器；2 ms 的测距时隙；胸牌的时钟速率修正与各应答锚点的时钟偏差修正；以及上面引用的每一个数字。' },
    { en: 'The noise figures are model choices too: 100 ps of 1-σ noise on every received timestamp, and 0.2 ppm of residual on a measured clock offset. The anchors’ own positions are treated as surveyed exactly, which no installation ever is.',
      zh: '噪声取值同样是模型取值：每个接收时间戳上 100 ps 的 1σ 噪声，以及测得的时钟偏差上 0.2 ppm 的残差。锚点自身的坐标被当作勘测得分毫不差——现实中没有哪次安装能做到。' },
  ],
  scenario: () => uwbDlTdoaScenario('base'),
  variants: [
    { label: { en: 'Clock correction off', zh: '关闭时钟修正' }, scenario: () => uwbDlTdoaScenario('raw') },
    { label: { en: 'Ten tags', zh: '十个标签' }, scenario: () => uwbDlTdoaScenario('ten') },
  ],
  jumps: [
    J('the round the anchors run', '锚点自己开的那一轮', firstUwbDlRound),
    J('anchor 1’s Poll opens it', 'anchor-1 的 Poll 开启这一轮', firstUwbPoll),
    J('the first arrival a badge stamps', '胸牌打下的第一个到达时间戳', firstUwbRxTs),
    J('the Final that closes the round', '收尾的那一帧 Final', firstUwbFinal),
    J('the first time difference', '第一个时间差', firstUwbTdoa),
    J('the fix it solves', '由它解出的定位', firstUwbPosition),
  ],
  observe: [
    { en: 'The log opens with a round line for each badge, then their first slots, and only then anchor 1’s Poll. Every transmission in the run belongs to an anchor — thirty-five, and not one from a badge.',
      zh: '日志开头是每个胸牌各一行的轮次，随后是它们各自的第一个时隙，再往后才轮到 anchor-1 的 Poll。整段运行里每一次发送都属于某个锚点——一共三十五次，胸牌一次也没有。' },
    { en: 'Follow a badge through a round: five arrival stamps, at 216.106 µs, 2.197 650 ms, 4.197 647 ms, 6.197 652 ms and 8.201 747 ms. The first and the last are its own clock’s span.',
      zh: '跟着一个胸牌走完一轮：五个到达时间戳，分别在 216.106 µs、2.197 650 ms、4.197 647 ms、6.197 652 ms 与 8.201 747 ms。第一个与最后一个之间，正是它用来量自己那只钟的跨度。' },
    { en: 'At the end of the round come three time differences and one place, the truth beside each. The inspector holds no distances at all: its table is headed “time differences”.',
      zh: '这一轮的末尾，三个时间差和一个位置一起出现，每一项旁边都印着真值。检视面板里一个距离也没有：表格的标题是“到达时间差”。' },
  ],
  tryThis: [
    { en: 'Load “Clock correction off”. Every difference comes out tens of metres too long, and no position line appears: 63 differences, 0 fixes. Larger than the gap between its two anchors, a difference lies on no hyperbola, and the solver returns nothing.',
      zh: '载入“关闭时钟修正”。每个时间差都偏长了几十米，整段运行里也不会出现任何一行定位：63 个时间差，0 次定位。一个大于两锚点间隔的距离差落不到任何双曲线上，于是解算器什么也不给。' },
    { en: 'Load “Ten tags”: 70 places instead of 21, off exactly the frames the anchors sent before. Then drag badge 1 onto the line joining two anchors, and past its end: the answer worsens where the curves flatten.',
      zh: '载入“十个标签”：70 个位置而不是 21 个，靠的还是锚点之前发出的那些帧。再把 badge-1 拖到连接两个锚点的那条线上，然后拖过它的末端——曲线摊平的地方，答案就变差。' },
  ],
  quiz: [
    {
      q: { en: 'Why must a listening badge divide out its own crystal, when a two-way tag need not?', zh: '只听的胸牌为什么必须把自己的晶振除掉，而双向测距的标签却不必？' },
      options: [
        { en: 'A one-way round has no carrier to measure from', zh: '单向轮次里没有载波可用来估计偏差' },
        { en: 'It subtracts two of its own arrivals, milliseconds apart — nothing cancels the crystal', zh: '它相减的是自己相隔若干毫秒的两个到达时刻——没有任何机制抵消晶振' },
        { en: 'Anchor crystals are held to a tighter tolerance', zh: '锚点晶振的容差更严' },
      ],
      answer: 1,
      explain: { en: 'A round trip times one interval at each end. The cure is the span both clocks describe.', zh: '一次往返在两端各量一段间隔。解法是两只钟都描述过的那段跨度：参考锚点的第一帧到它的最后一帧。' },
    },
    {
      q: { en: 'With the correction off: 63 differences, no position at all. Why nothing rather than something bad?', zh: '关闭修正后：63 个时间差，一次定位也没有。为什么是“没有”，而不是“一个很差的”？' },
      options: [
        { en: 'The badge refuses to solve without a rate estimate', zh: '胸牌在缺少速率估计时拒绝解算' },
        { en: 'Differences larger than the gap between the two anchors lie on no hyperbola', zh: '大于两个锚点间隔的时间差落不到任何双曲线上' },
        { en: 'The ranging counter overflows', zh: '测距计数器溢出了' },
      ],
      answer: 1,
      explain: { en: 'A difference of distances cannot exceed the gap between the anchors, so it describes no point at all.', zh: '距离之差不可能超过两个锚点之间的距离，所以它压根不描述任何一点，也就发不出定位。' },
    },
    {
      q: { en: 'Ten badges instead of three, and the anchors send the same frames. Why can two-way ranging not?', zh: '胸牌从三个变成十个，锚点发的帧却一样。双向测距为什么不行？' },
      options: [
        { en: 'A two-way round belongs to the tag that started it, so each tag costs a round', zh: '双向轮次属于发起它的那个标签，所以每个标签都要花掉一轮' },
        { en: 'Two-way frames are larger', zh: '双向测距的帧更大' },
        { en: 'Two-way ranging would need the anchors synchronised', zh: '双向测距会要求锚点之间同步' },
      ],
      answer: 0,
      explain: { en: 'Every frame here is a broadcast and none names a tag: one round, whether one listens or ten thousand.', zh: '这里每一帧都是广播，谁的名字也不点：对一个听众和对一万个听众，都是同一轮。' },
    },
  ],
}
