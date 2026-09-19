/**
 * UWB Tier 2 · M14 · Other ranging modes · Listen-only positioning.
 *
 * Every round in the first UWB tier belonged to a tag: it polled, the anchors
 * answered, and it turned the round trips into distances. This lesson turns the
 * round over. The anchors run one round of their own per block — a Poll, one
 * Response per other anchor, a Final — and a tag's entire part is to hear it and
 * subtract arrival times. It never transmits, so the round costs the same
 * whether three tags are listening or ten.
 *
 * The centrepiece is the one correction that makes the mode possible at all. A
 * two-way exchange differences the tag's crystal away inside itself; here the
 * two arrivals being subtracted are up to 6 ms apart, and a crystal the standard
 * allows to be 20 ppm off turns that into 36 m of nonsense. The tag divides it
 * out by measuring the Poll-to-Final span on its own clock and against anchor
 * 1's report of it — which cancels its own crystal and the reference anchor's
 * alike, both pinned — and what is left is decimetres.
 * Every number quoted below is pinned in tests/course/uwb-dl-tdoa.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling. The prose
 * below totals 1718 words, leaving room for 6 more and no others.
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
 * every time difference a tag computes is taken against its Poll. The other
 * three answer in slots 1, 2 and 3, in this order — which is why their
 * clock-offset residuals grow down the list.
 *
 * The corners and the heights are lesson 5's, so the two-way fixes that lesson
 * measured in this room are the comparison this one is entitled to make.
 */
export const DL_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** Anchors on the ceiling, badges at chest height — lesson 5's two planes. */
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
 * Lesson 5's four corner anchors and three (or ten) badges that never transmit,
 * on a DL-TDoA session with everything else at its default: NLOS on, both noise
 * knobs at their defaults, and every crystal drawn rather than set — so the
 * ±20 ppm the standard allows is the draw's to hand out, and the gap between a
 * badge's crystal and anchor 1's is what the 'raw' scene exposes.
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
  body: [
    { text: {
      en: 'One thing here comes from IEEE Std 802.15.4-2024: §10.29.1.2.5 gives time-difference-of-arrival ranging in two forms, and this lesson is the second — synchronised nodes transmit, and the mobile node places itself from the differences between their arrival times. The rest is the model: the FiRa-style content of the three messages, each carrying its sender’s own transmit counter and the receive counters it holds for the others; the tag’s clock-rate correction and each responder’s clock-offset correction; and every number quoted below.',
      zh: '本课只有一处以 IEEE Std 802.15.4-2024 为依据：§10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第二种——一组彼此时钟同步的节点发送消息，移动节点从这些消息到达时刻之差反推自己在哪里。其余都是模型：三种消息取 FiRa 风格的内容，每一帧携带发送者自己的发送计数器以及它为别人保存的接收计数器；标签的时钟速率修正与各应答锚点的时钟偏差修正；以及下面引用的每一个数字。',
    } },
    { heading: { en: 'The round runs without you', zh: '这一轮不为你而开' }, text: {
      en: 'Every UWB round so far belonged to a tag: it polled, the anchors answered, it did the arithmetic. Turn that over. Here the anchors run a round of their own, one per 200 ms block. Four anchors stand in the corners of lesson 5’s 10 × 8 m lab at 2.20 m; three badges at (4, 3.5), (7, 6) and (2, 6.5) sit at 1.00 m and never transmit. Anchor 1, at (0.5, 0.5), is the reference: it opens the round, closes it, and every difference is taken against its Poll.',
      zh: '在此之前，每一个 UWB 轮次都属于某个标签：它发轮询帧，锚点作答，再由它来算。现在把这件事反过来。这里是锚点自己开一轮，每 200 ms 的块里开一次。四个锚点站在第 5 课那间 10 × 8 m 实验室的四角，高 2.20 m；三个胸牌分别在 (4, 3.5)、(7, 6) 与 (2, 6.5)，高 1.00 m，自始至终一个字也不发。(0.5, 0.5) 处的 anchor-1 是参考锚点：轮次由它开启、由它收尾，每一个时间差都是相对它那一帧轮询取的。',
    } },
    { kind: 'table', heading: { en: 'Five slots of 2 ms, once a block', zh: '五个 2 ms 的时隙，每块一次' }, head: [
      { en: 'Slot', zh: '时隙' }, { en: 'Sender', zh: '发送者' }, { en: 'Frame', zh: '帧' }, { en: 'What it carries', zh: '它携带什么' },
    ], rows: [
      [N('0'), N('anchor-1'), N('Poll, 42 B, 216.1 µs'),
        { en: 'its own transmit counter, and who answers where', zh: '它自己的发送计数器，以及谁在哪个时隙作答' }],
      [N('1–3'), N('anchor-2/3/4'), N('Response, 30 B, 197.6 µs'),
        { en: 'its transmit counter, its counter for the Poll’s arrival, its measured clock offset to anchor 1', zh: '它的发送计数器、它记下的轮询帧到达计数，以及它测得的相对 anchor-1 的时钟偏差' }],
      [N('4'), N('anchor-1'), N('Final, 34 B, 201.7 µs'),
        { en: 'its transmit counter, and its counter for each Response’s arrival', zh: '它的发送计数器，以及它记下的每一帧应答的到达计数' }],
    ] },
    { kind: 'formula', heading: { en: 'What a badge computes', zh: '一个胸牌要算什么' }, text: {
      en: 'r = (rx_F − rx_P)_badge ÷ (tx_F − tx_P)_anchor-1\nΔ_i = (rx_i − rx_P)_badge ÷ r − ( tof(a₁ → a_i) + T_reply,i · (1 − coff_i) )',
      zh: 'r = (rx_F − rx_P)_胸牌 ÷ (tx_F − tx_P)_anchor-1\nΔ_i = (rx_i − rx_P)_胸牌 ÷ r − ( tof(a₁ → a_i) + T_reply,i · (1 − coff_i) )',
    }, note: {
      en: 'The first line is the badge’s clock against anchor 1’s, over the one span both describe: anchor 1 reports when it sent the Poll and the Final, the badge holds its own two arrivals, and the flight from anchor 1 sits in both and cancels. The second takes out what is not geometry — anchor i waited T_reply,i on its own clock, converted by its measured offset, and the Poll crossed the surveyed baseline first. What is left is (distance to anchor i − distance to anchor 1) ÷ c: a hyperbola with the two anchors as foci.',
      zh: '第一行是胸牌的时钟相对 anchor-1 的时钟，量在那一段两边都描述过的跨度上：anchor-1 在帧里报出自己何时发出轮询帧、何时发出 Final，胸牌手里则有这两帧的到达时刻，而从 anchor-1 飞来的那段路程同时出现在两个到达时刻里，相减就消掉了。第二行扣掉不属于几何的部分——锚点 i 按自己的时钟等了 T_reply,i，用它测得的偏差换算到 anchor-1 的单位；而轮询帧还要先跨过那段已勘测的锚点基线。剩下的就是（到锚点 i 的距离 − 到 anchor-1 的距离）÷ c：一条以这两个锚点为焦点的双曲线。',
    } },
    { heading: { en: 'Twenty parts per million, six milliseconds', zh: '二十个 ppm，六毫秒' }, text: {
      en: 'A two-way exchange differences a tag’s crystal away inside itself, so the tag’s own clock never reaches the answer. Here the two arrivals it subtracts are up to 6 ms apart, and §16.4.9 allows a crystal to be 20 ppm off: 20 ppm of 6 ms is 120 ns, which is 36 m. Two crystals matter here, and the scene draws both. Anchor 1 comes out at −19.04 ppm and the three badges at 1.96, 17.65 and 4.08 — 21.00, 36.69 and 23.12 ppm away from the reference.',
      zh: '双向测距在一次往返之内就把标签的晶振差分掉了，标签自己的时钟根本到不了结果里。而这里，它相减的两个到达时刻最多相隔 6 ms，§16.4.9 又允许晶振偏差达到 20 ppm：6 ms 的 20 ppm 是 120 ns，折合 36 m。这里有两个晶振要紧：胸牌的和 anchor-1 的，而本场景两个都是抽出来的。anchor-1 抽到 −19.04 ppm，三个胸牌抽到 1.96、17.65 与 4.08——与参考锚点相差 21.00、36.69 与 23.12 ppm。',
    } },
    { text: {
      en: 'That is what “Clock correction off” shows: badge 2’s three differences come out 22.02, 44.04 and 65.81 m too long on average — its 36.69 ppm times the 2, 4 and 6 ms each responder waited. Switch the correction on and the same three are wrong by at most 0.19, 0.44 and 0.51 m over 21 rounds. What is left is each responder’s own clock-offset residual, 0.2 ppm of the reply time it corrects — 0.12 m per slot. All 63 differences fall inside that model’s 3σ of 0.36, 0.72 and 1.08 m.',
      zh: '“关闭时钟修正”展示的正是这件事：badge-2 的三个时间差平均偏长 22.02、44.04 与 65.81 m，正是它那 36.69 ppm 乘上三个应答锚点各自等待的 2、4、6 ms。把修正打开，同样这三个时间差在 21 轮里最多只错 0.19、0.44 与 0.51 m。剩下的是每个应答锚点自己的时钟偏差残差——它所修正的那段应答时延的 0.2 ppm，即每个时隙 0.12 m。63 个时间差全部落在该模型的 3σ 之内：0.36、0.72 与 1.08 m。',
    } },
    { text: {
      en: 'The ratio cancels the reference anchor’s crystal just as exactly. Pin anchor 1 at +20 ppm — a 39 ppm swing — and the run reproduces 0.19, 0.44 and 0.51 m to the centimetre. Pin the badges at +20, −20 and 0 ppm too and the maxima are 0.24, 0.46 and 0.54 m: still decimetres, still 21 fixes.',
      zh: '这个比值把参考锚点的晶振消得同样干净。把 anchor-1 钉在 +20 ppm——相对原值摆动了 39 ppm——运行结果仍是 0.19、0.44 与 0.51 m，分毫不差。再把三个胸牌钉在 +20、−20 与 0 ppm，最大值是 0.24、0.46 与 0.54 m：依然是分米级，依然是 21 次定位。',
    } },
    { kind: 'table', heading: { en: 'The three scenes, seven blocks each', zh: '三个场景，各七个块' }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'Differences', zh: '时间差' }, { en: 'Worst difference', zh: '最差的时间差' },
      { en: 'Fixes', zh: '定位' }, { en: 'Fix error', zh: '定位误差' },
    ], rows: [
      [{ en: 'Three badges', zh: '三个胸牌' }, N('63'), N('0.51 m'), N('21'), N('0.11–0.36 m')],
      [{ en: 'Clock correction off', zh: '关闭时钟修正' }, N('63'), N('66.29 m'), N('0'), { en: 'no fix at all', zh: '完全没有定位' }],
      [{ en: 'Ten tags', zh: '十个标签' }, N('210'), N('0.51 m'), N('70'), N('0.02–0.37 m')],
    ] },
    { heading: { en: 'Hyperbolae, and where they go soft', zh: '双曲线，以及它软下来的地方' }, text: {
      en: 'A range puts a tag on a circle; a difference of ranges puts it on a hyperbola with two anchors as foci, and three hyperbolae cross at the fix. A one-way fix therefore draws no rings, only the cross and the ellipse. Hyperbolae are sharpest across the middle of the anchor set and flatten along the line joining two anchors. In the middle of the room badge 1’s seven fixes land 11 to 26 cm out; on the anchor-1–anchor-2 baseline at (5, 0.5) the worst is 34 cm, and past the end of that line at (9.8, 0.2) one fix lands 2.64 m out.',
      zh: '一个距离把标签放在一个圆上；一个距离之差把它放在一条以两个锚点为焦点的双曲线上，三条双曲线交于定位点。所以单向定位不画圆环，只有十字和椭圆。双曲线在锚点围成区域的中部最锐利，沿着连接两个锚点的那条线则渐渐摊平。在房间中部，badge-1 的七次定位偏离真值 11 到 26 cm。把 badge-1 拖到 anchor-1 与 anchor-2 之间的基线上 (5, 0.5)，最差的一次是 34 cm；再移过这条线的末端、到 (9.8, 0.2)，就会有一次偏出 2.64 m。',
    } },
    { text: {
      en: 'Do not read the two GDOP columns against each other: a hyperbolic Jacobian row is a difference of two unit vectors, so at the centre of a square of anchors its floor is √(2/3) = 0.82 where trilateration’s is 1.00. The comparison that means something is the error: lesson 5’s two-way fixes in this room stayed between 0.5 and 3.3 cm, these between 11 and 36 cm. The ellipse is comparable too, and it is honest: 18.6 to 23.0 cm of semi-major axis against lesson 5’s 1.7 cm, built from √((√2·c·σ_ts)² + (c·T_reply,i·0.2 ppm)²) over the three responders — only 4 cm of it timestamp noise — and every fix lands inside 1.6 of those semi-axes. It is first-order, though: reply times of 2, 4 and 6 ms do not share one sigma, so read it as how far the fix may be off rather than as a 68 % interval.',
      zh: '不要把两边的 GDOP 数值拿来互相对照：双曲线定位的雅可比每一行是两个单位向量之差，因此在锚点正方形中心处它的下限是 √(2/3) = 0.82，而三边定位的下限是 1.00。真正有意义的对照是误差：第 5 课在同一个房间里的双向定位误差保持在 0.5 到 3.3 cm，这里则是 11 到 36 cm。椭圆同样可比，而且它是诚实的：长半轴 18.6 到 23.0 cm，对比第 5 课的 1.7 cm，由 √((√2·c·σ_ts)² + (c·T_reply,i·0.2 ppm)²) 对三个应答锚点合成——其中只有 4 cm 来自时间戳噪声——而每一次定位都落在 1.6 个长半轴之内。但它仍是一阶近似：应答时延 2、4、6 ms 并不共用同一个 σ，所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。',
    } },
    { heading: { en: 'Ten badges cost the anchors nothing', zh: '十个胸牌，锚点一分钱也不多花' }, text: {
      en: 'Load “Ten tags”. Seven blocks now produce 70 fixes instead of 21, and the anchors transmit exactly what they did before: 35 frames, 7.074 935 ms of air, 0.505 % of the time. Nothing in the round names a tag, so nothing in it grows with how many there are. Two-way ranging needs a round per tag, and a 200 ms block holds ten 20 ms rounds, so ten is its ceiling at 100 frames a block against this round’s five. And the badges say nothing, so nobody can count them, and each fix exists only inside the badge that made it. The next lesson inverts that.',
      zh: '载入“十个标签”。七个块现在给出 70 次定位而不是 21 次，而锚点发出的东西与之前一模一样：35 帧、7.074 935 ms 的空口时间，占比 0.505 %。这一轮里没有任何一处点到标签的名字，所以也没有任何一处会随标签数量增长。双向测距则每个标签要占一轮，而 200 ms 的块里装得下十个 20 ms 的轮次，于是十个就是它的上限，代价是每块 100 帧，而本轮只要 5 帧。而且胸牌什么也不发，谁也数不出它们有几个，每一次定位也只存在于做出它的那个胸牌里。下一课会把这件事反过来。',
    } },
  ],
  scenario: () => uwbDlTdoaScenario('base'),
  variants: [
    { label: { en: 'Clock correction off', zh: '关闭时钟修正' }, scenario: () => uwbDlTdoaScenario('raw') },
    { label: { en: 'Ten tags', zh: '十个标签' }, scenario: () => uwbDlTdoaScenario('ten') },
  ],
  jumps: [
    J('the round the anchors run', '锚点自己开的那一轮', firstUwbDlRound),
    J('anchor 1’s Poll opens it', 'anchor-1 的轮询帧开启这一轮', firstUwbPoll),
    J('the first arrival a badge stamps', '胸牌打下的第一个到达时间戳', firstUwbRxTs),
    J('the Final that closes the round', '收尾的那一帧 Final', firstUwbFinal),
    J('the first time difference', '第一个时间差', firstUwbTdoa),
    J('the fix it solves', '由它解出的定位', firstUwbPosition),
  ],
  observe: [
    { en: 'At t = 0 the log opens with three UWB_ROUND lines, one per badge — “badge-1 UWB round 0 of block 0 (DL-TDoA): 5 slots × 2000.0 µs” — then each badge’s slot-0 line, and anchor-1’s Poll. Every TX_START in the run belongs to an anchor: 35 in 1.3 s, none from a badge.',
      zh: 't = 0 处日志以三行 UWB_ROUND 开场，每个胸牌一行——“badge-1 UWB round 0 of block 0 (DL-TDoA): 5 slots × 2000.0 µs”——随后是三个胸牌各自的 slot 0 行，然后才是 anchor-1 的轮询帧。整段运行里每一条 TX_START 都属于某个锚点：1.3 s 里共 35 条，胸牌一条也没有。' },
    { en: 'Follow badge 1 through a round: five RX RMARKER lines, at 216.106 µs, 2.197 650 ms, 4.197 647 ms, 6.197 652 ms and 8.201 747 ms. Those five counters are all it ever has, and the first and last are the span it measures its own clock rate over.',
      zh: '跟着 badge-1 走完一轮：五条 RX RMARKER，分别在 216.106 µs、2.197 650 ms、4.197 647 ms、6.197 652 ms 与 8.201 747 ms。这五个计数就是它能拿到的全部；第一个与最后一个之间，正是它用来量自己时钟速率的那段跨度。' },
    { en: 'At 10.000 000 ms come the three differences and the fix: “badge-1 TDoA anchor-2 − anchor-1: 5.66 ns (true 5.39 ns)”, anchor-3 1.12 against 2.29, anchor-4 6.85 against 7.15, then “badge-1 position (3.90, 3.74) m, true (4.00, 3.50), error 0.26 m, GDOP 0.84, 4 anchors (DL-TDoA)”.',
      zh: '10.000 000 ms 处，三个时间差与一次定位一起出现：“badge-1 TDoA anchor-2 − anchor-1: 5.66 ns (true 5.39 ns)”，接着 anchor-3 是 1.12 对 2.29、anchor-4 是 6.85 对 7.15，最后是 “badge-1 position (3.90, 3.74) m, true (4.00, 3.50), error 0.26 m, GDOP 0.84, 4 anchors (DL-TDoA)”。' },
    { en: 'The inspector holds no distances. Badge 1’s table reads “time differences”, one row per anchor against anchor 1; after seven blocks its errors are −0.51, +0.47 and −1.53 ns. Below: error 19.6 cm, GDOP 0.85, error ellipse 19.8 × 10.3 cm, solved from DL-TDoA.',
      zh: '检视面板里一个距离也没有。badge-1 的表格标题是“到达时间差”，每个锚点一行，相对 anchor-1；七个块之后它那三行的误差是 −0.51、+0.47 与 −1.53 ns。下面一行是：误差 19.6 cm，GDOP 0.85，误差椭圆 19.8 × 10.3 cm，解算方式为 DL-TDoA。' },
  ],
  tryThis: [
    { en: 'Load “Clock correction off”. Badge 2’s first block reads 65.60, 139.29 and 201.83 ns where the truth is −8.14, −6.07 and −18.17 ns, and over seven blocks the three average 22.02, 44.04 and 65.81 m too long. No position line appears anywhere: 63 differences, 0 fixes. A difference of 65.81 m between anchors 11.40 m apart is no hyperbola at all, so the solver returns nothing rather than inventing a point.',
      zh: '载入“关闭时钟修正”。badge-2 的第一个块读出 65.60、139.29 与 201.83 ns，而真值是 −8.14、−6.07 与 −18.17 ns；七个块平均下来，三个时间差分别偏长 22.02、44.04 与 65.81 m。整段运行里不会出现任何一行定位：63 个时间差，0 次定位。相距 11.40 m 的两个锚点之间出现 65.81 m 的距离差，这不是任何人站得上去的双曲线，于是解算器宁可什么都不给，也不凭空造一个点。' },
    { en: 'Load “Ten tags”: 70 fixes, and the anchors still send 35 frames and 7.074 935 ms of air. Then drag badge 1 out of the middle. At (5, 0.5), on the anchor-1–anchor-2 line, its fixes reach 34 cm at GDOP 1.06; at (9.8, 0.2), past the end of that line, GDOP is 1.49, the ellipse grows to 35.7 cm and the worst of seven is 2.64 m. The best spot, (3.0, 4.8), gives GDOP 0.83 and 16 to 24 cm.',
      zh: '载入“十个标签”：70 次定位，而锚点仍只发 35 帧、7.074 935 ms 的空口时间。然后在编辑器里把 badge-1 从房间中部拖走。到 (5, 0.5)——anchor-1 与 anchor-2 之间那条线上——它的定位误差升到 34 cm，GDOP 为 1.06；再到 (9.8, 0.2)，越过这条线的末端，GDOP 是 1.49，椭圆胀到 35.7 cm，七次里最差的一次是 2.64 m。而全屋最好的位置 (3.0, 4.8) 给出 GDOP 0.83、误差 16 到 24 cm。' },
  ],
  quiz: [
    {
      q: { en: 'In two-way ranging the tag’s own crystal never reaches the answer. Why must it be divided out here?', zh: '双向测距中标签自己的晶振从来影响不到结果。这里为什么必须先把它除掉？' },
      options: [
        { en: 'A one-way round has no carrier to measure the offset from', zh: '单向轮次里没有载波可用来估计偏差' },
        { en: 'The two arrivals it subtracts are up to 6 ms apart and are not a round trip, so nothing differences the crystal away — and 20 ppm of 6 ms is 36 m', zh: '它相减的两个到达时刻最多相隔 6 ms，又不是一次往返，没有任何机制把晶振差分掉——而 6 ms 的 20 ppm 就是 36 m' },
        { en: 'The anchors’ crystals are held to a tighter tolerance than a tag’s', zh: '锚点晶振的容差比标签严得多' },
      ],
      answer: 1,
      explain: { en: 'A round trip measures one interval at each end, so a rate error only scales a microsecond. Here the badge subtracts two of its own arrivals and its rate error multiplies the whole gap. The cure is the span both clocks describe, Poll to Final, which removes the badge’s crystal and anchor 1’s alike.', zh: '一次往返在两端各量一段间隔再相减，速率误差只作用在微秒量级上。而这里胸牌相减的是自己的两个到达时刻，速率误差乘在整段间隔上。办法是那一段两个时钟都描述过的跨度——从轮询帧到 Final——它把胸牌的晶振和 anchor-1 的晶振一起消掉。' },
    },
    {
      q: { en: 'With the correction off the run prints 63 differences and not one position. Why nothing, rather than a bad position?', zh: '关闭修正后运行打出 63 个时间差，却一次定位也没有。为什么是“没有”，而不是“一个很差的定位”？' },
      options: [
        { en: 'The tag refuses to solve when its rate estimate is missing', zh: '标签在缺少速率估计时拒绝解算' },
        { en: 'Differences of 22 to 66 m between anchors at most 11.40 m apart lie on no hyperbola, so the fit never converges', zh: '相距最多 11.40 m 的锚点之间出现 22 到 66 m 的时间差，落不到任何双曲线上，拟合自然不收敛' },
        { en: 'The uncorrected differences overflow the 40-bit ranging counter', zh: '未修正的时间差把 40 位测距计数器撑溢出了' },
      ],
      answer: 1,
      explain: { en: 'A difference of ranges can never exceed the distance between the two anchors, so 65.81 m between anchors 11.40 m apart describes no point in the plane. Gauss–Newton walks out to where the rows go parallel, and no UWB_POSITION is emitted.', zh: '距离之差永远不可能超过两个锚点之间的距离，所以相距 11.40 m 的锚点之间出现 65.81 m，描述的不是平面上的任何一点。高斯－牛顿一路走到各行趋于平行的地方，于是根本不会发出 UWB_POSITION。' },
    },
    {
      q: { en: 'Ten badges instead of three, and the anchors send the same 35 frames. Why can two-way ranging not do that?', zh: '胸牌从三个变成十个，锚点发的还是同样 35 帧。双向测距为什么做不到？' },
      options: [
        { en: 'A two-way round belongs to the tag that polled it: a block holds ten 20 ms rounds, so ten is the ceiling and it costs 100 frames a block against this round’s five', zh: '双向轮次属于发起它的那个标签：一个块装得下十个 20 ms 的轮次，于是十个就是上限，代价是每块 100 帧，而本轮只要 5 帧' },
        { en: 'Two-way frames are larger, so fewer fit in a slot', zh: '双向测距的帧更大，一个时隙里放不下那么多' },
        { en: 'Two-way ranging would need the anchors synchronised with one another', zh: '双向测距会要求锚点之间保持时钟同步' },
      ],
      answer: 0,
      explain: { en: 'Every frame in this round is broadcast and none names a tag, so it is the same round for one listener or ten thousand — which is also why the badges cannot be counted from the air.', zh: '本轮每一帧都是广播，而且谁的名字也不点，所以对一个听众和对一万个听众都是同一轮——这也是为什么从空中数不出有几个胸牌。' },
    },
  ],
}
