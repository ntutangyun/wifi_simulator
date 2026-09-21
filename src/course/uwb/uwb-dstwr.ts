/**
 * UWB Tier 1 · M11 · Time of flight · Two round trips cancel the clock.
 *
 * The fourth lesson of the UWB track, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). The lesson
 * before this one removed the crystal offset by measuring it; this one removes
 * it by arithmetic — one extra message, two round trips, and one factor of
 * every clock in each product of the numerator, so nothing has to be estimated.
 *
 * Same scene as uwb-sstwr, measured the other way: the same four anchors on a
 * 3.50 m ring, the same ±10 ppm crystals, DS instead of SS. The counters, the
 * two lanes that compute the same distance, the Final's growth with the anchor
 * count and the wall the formula cannot see are in `deeper`; the clauses and
 * the model choices are in `sources`.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-dstwr.test.ts.
 * `npx tsx scripts/lesson-dump.ts uwb-dstwr en` prints the section budgets.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, firstUwbFinal, firstUwbPoll, firstUwbPosition, firstUwbReport, oneRoom, uwbSc, uwbTag,
  type Lesson,
} from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The first range computed on an anchor's lane: an anchor finishes at the Final, before any report flies. */
const firstAnchorRange = (r: TLRecord): boolean => r.type === 'UWB_RANGE' && r.node.startsWith('anchor')

/**
 * The previous lesson's scene, measured the other way: four anchors on a 3.50 m
 * ring around a phone at the centre of a 10 × 8 m lab, every device at 2.20 m,
 * so all four true distances are exactly 3.50 m. Only the session changes — DS
 * instead of SS — which is the whole point of putting it here again.
 */
export function uwbDstwrScenario(ppm: { tag: number; anchors: number }): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2, ppm.anchors),
    anchor('anchor-2', 'Anchor 2', 5, 7.5, 2.2, ppm.anchors),
    anchor('anchor-3', 'Anchor 3', 1.5, 4, 2.2, ppm.anchors),
    anchor('anchor-4', 'Anchor 4', 5, 0.5, 2.2, ppm.anchors),
    uwbTag('tag-1', 'Phone', 5, 4, 2.2, ppm.tag),
  ], { method: 'ds', nlos: false })
}

export const uwbDstwr: Lesson = {
  id: 'uwb-dstwr',
  module: 11,
  title: { en: 'Two round trips cancel the clock', zh: '两次往返，把时钟消掉' },
  why: {
    en: 'Measuring the other radio’s clock works, but it leaves a residue that grows with every millisecond the anchor waited. There is a way to be rid of the waiting: send one more message, so each end has both asked and answered. Then every clock appears the same number of times on both sides of the arithmetic, and the error cancels instead of being estimated.',
    zh: '把对方的时钟测出来确实管用，但它留下的残差会随锚点多等的每一毫秒一起变大。还有一条路能把等待甩掉：多发一条消息，让两端都既问过也答过。这样一来，每只钟在算式两边出现的次数一样多，误差是被抵消掉的，而不是被估计掉的。',
  },
  outcomes: [
    { en: 'name the three messages of a double-sided exchange and who times what', zh: '说出双边交互的三条消息，以及谁在量哪一段' },
    { en: 'explain why the two waits need not be equal for the clocks to cancel', zh: '解释为什么两段等待不必相等，时钟照样抵消' },
    { en: 'say what the extra message costs and what it does not fix', zh: '说清多发这条消息的代价，以及它修不好的东西' },
  ],
  needs: ['uwb-sstwr'],
  terms: [
    { term: 'DS-TWR', plain: {
      en: 'double-sided two-way ranging: two round trips instead of one, so the clocks cancel',
      zh: '双边双向测距：做两次往返而不是一次，让两只钟自己抵消',
    } },
    { term: 'Final', plain: {
      en: 'the phone’s third message, which closes the exchange and carries what only the phone could measure',
      zh: '手机发的第三条消息，它结束这次交互，带上只有手机量得到的那些数',
    } },
    { term: 'Report', plain: {
      en: 'an anchor’s last message, telling the phone the two intervals only that anchor could measure',
      zh: '锚点的最后一条消息，把只有它自己量得到的两段时间告诉手机',
    } },
    { term: 'RMI', plain: {
      en: 'ranging measurement information: the part of a frame those intervals are written into',
      zh: '测距测量信息：帧里专门用来写这些时间段的那一部分',
    } },
  ],
  picture: [
    { heading: { en: 'One more message', zh: '再多发一条消息' }, text: {
      en: 'The lesson before fixed the crystal by measuring it. There is another way: let the phone answer too. Once every anchor has replied, the phone sends a third message — the Final — and each anchor times the gap to it as the phone timed the gap to the reply. Now both ends have asked and answered.',
      zh: '上一课的办法是把晶体测出来再修正。还有另一条路：让手机也答一次。等所有锚点都回过话，手机再发第三条消息——Final——每个锚点给这段间隔计时，做法和手机给应答那段计时完全一样。至此两端都既问过也答过。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Find the third message', zh: '找到第三条消息' }, text: {
      en: 'Load the simulation and jump to the Final. It leaves from the middle of the round, one frame for every anchor at once. Everything after it is bookkeeping.',
      zh: '载入仿真，跳到 Final 帧。它从这一轮的正中间发出，一帧同时发给所有锚点。它之后的一切都只是记账。',
    } },
    { kind: 'steps', heading: { en: 'The exchange in order', zh: '这次交互的顺序' }, items: [
      { en: 'The phone broadcasts the poll and stamps it leaving; every anchor stamps it arriving.',
        zh: '手机广播 Poll 并给它离开的时刻打戳；每个锚点给它到达的时刻打戳。' },
      { en: 'Each anchor answers in its own slot, and now holds a wait timed wholly on its own clock; the phone holds a round trip timed wholly on its own.',
        zh: '每个锚点在自己的时隙里作答，此时手里有一段完全用自己的钟量出的等待；手机手里则有一次完全用自己的钟量出的往返。' },
      { en: 'The phone sends one Final to every anchor, carrying the two intervals only it could measure. Each anchor stamps it arriving, closing a second round trip.',
        zh: '手机给所有锚点发一帧 Final，带上只有它量得到的那两段时间。每个锚点给它到达的时刻打戳，第二次往返就此闭合。' },
      { en: 'Each anchor sends a Report with its own two. Four intervals, two at each end, none in anyone else’s units.',
        zh: '每个锚点再发一帧 Report，报上自己量的那两段。一共四段间隔，两端各两段，没有哪一段用了别人的单位。' },
    ] },
    { heading: { en: 'Two round trips, both wrong', zh: '两次往返，都是错的' }, text: {
      en: 'Work the two round trips out separately and neither is a distance. The first is exactly the raw estimate of the lesson before, too long by the same ramp. The second is its mirror image: this time the phone waits, and the phone is the fast clock, so that half comes out negative. Nor is the answer their average.',
      zh: '把两次往返分别算出来，会发现哪一次都不是距离。第一次正是上一课那个未修正的估计，错法也一样：一道同样的斜坡。第二次是它的镜像——这回轮到手机等待，而手机是那只快钟，于是这一半算出来是负的。答案也不是两者的平均。',
    } },
    { heading: { en: 'Why the clocks cancel', zh: '两只钟为什么会抵消' }, text: {
      en: 'DS-TWR neither picks a half nor averages them. It multiplies the two round trips together, the two waits together, and subtracts one product from the other. The phone measured one interval of each pair and the anchor the other, so both products are stretched by the same pair of rates — and the division that follows takes the stretch out again. The waiting need not be symmetric.',
      zh: 'DS-TWR 既不挑其中一半，也不求平均。它把两次往返相乘，把两段等待相乘，再把两个乘积相减。每一对里都是手机量一段、锚点量一段，所以两个乘积被同一对速率拉伸了同样的倍数——而随后的那次除法正好把这份拉伸再除掉。两段等待对不对称，无关紧要。',
    } },
    { heading: { en: 'The price is slots, not airtime', zh: '代价是时隙，不是空口时间' }, text: {
      en: 'Two round trips need two more messages than one did — a Final from the phone and a Report from every anchor — so a round of four anchors takes ten slots where it took five. The frames stay small, and the share of the round that radiates barely moves. What doubles is how long a round lasts and how often each device wakes up.',
      zh: '两次往返比一次多用两类消息——手机发的 Final，和每个锚点发的 Report——所以同样四个锚点，一轮要占十个时隙，原来只要五个。帧本身依然很小，这一轮里真正有信号在辐射的比例也几乎没变。翻倍的是一轮持续多久，以及每台设备要醒来多少次。',
    } },
    { heading: { en: 'What it does not fix', zh: '它修不好的那些' }, text: {
      en: 'All of this removes one error term: the crystals. Every received timestamp is still a little noisy, and that noise is now what the error is made of — but it no longer grows with the waiting, so the anchor that answered last is as good as the first. A blocked line of sight is untouched too: a first path that arrives late is added straight to the range.',
      zh: '这一切只拿掉了一项误差：晶体。每个接收时间戳依旧带着一点噪声，现在误差正是由它构成的——但它不再随等待时长增长，所以最后作答的锚点和最先作答的一样准。被挡住的直射路径同样没被解决：首径来得晚，这段迟到会原封不动加到距离上。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'Double-sided two-way ranging', zh: '双边双向测距' }, text: {
      en: 'Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)',
      zh: 'Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)',
    }, note: {
      en: 'Each product in the numerator carries one factor from each clock, whatever the waits are. The denominator is no wait at all: it is the whole exchange, timed once at each end. What survives is the flight scaled by parts per million — a fraction of a picosecond.',
      zh: '分子里的每个乘积都各带两只钟的一个因子，无论两段等待多久。分母根本不是什么等待，而是整场交互，两端各计一次。活下来的是被百万分之几缩放的飞行时间——不到一皮秒。',
    } },
    { kind: 'table', heading: { en: 'Two halves and the answer', zh: '两个半场与答案' }, head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'Treply1', zh: 'Treply1' }, { en: 'First half', zh: '前半场' },
      { en: 'Second half', zh: '后半场' }, { en: 'DS result', zh: 'DS 结果' },
    ], rows: [
      [N('anchor-1'), N('2 ms − Tprop'), N('9.51 m'), N('−20.49 m'), N('3.51 m')],
      [N('anchor-2'), N('4 ms − Tprop'), N('15.47 m'), N('−14.48 m'), N('3.49 m')],
      [N('anchor-3'), N('6 ms − Tprop'), N('21.49 m'), N('−8.43 m'), N('3.54 m')],
      [N('anchor-4'), N('8 ms − Tprop'), N('27.42 m'), N('−2.55 m'), N('3.45 m')],
    ] },
    { text: {
      en: 'Averaging the first row’s two halves gives −5.49 m. Note the symmetry that is absent: the anchor answering last waits four times as long as the first, yet every result lands inside 6 cm.',
      zh: '把第一行的两个半场平均一下，得到 −5.49 m。再留意这里并不存在的那种对称：最后作答的锚点等的时间是第一个的四倍，每个结果却都落在 6 cm 以内。',
    } },
    { kind: 'table', heading: { en: 'Ten slots, and what fills them', zh: '十个时隙，都被什么填满' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'Count', zh: '数量' }, { en: 'Octets', zh: '字节' }, { en: 'Airtime each', zh: '单帧空口时间' },
    ], rows: [
      [N('Poll'), N('1'), N('39'), N('206.86 µs')],
      [N('Response'), N('4'), N('14'), N('181.22 µs')],
      [N('Final'), N('1'), N('62'), N('236.60 µs')],
      [N('Report'), N('4'), N('24'), N('191.47 µs')],
      [{ en: 'Round total', zh: '整轮合计' }, N('10'), N('253'), N('1 934.23 µs')],
    ] },
    { text: {
      en: '1 934.23 µs of radiation inside a 20 000 µs round is 9.67 %, against 9.56 % for the single-sided round of the lesson before. Channel occupancy barely moves; latency and wake-ups double.',
      zh: '在一个 20 000 µs 的轮里辐射 1 934.23 µs，占 9.67 %，而上一课那个单边轮是 9.56 %。信道占用率几乎没动，翻倍的是时延和醒来的次数。',
    } },
    { kind: 'table', heading: { en: 'What the timestamp noise leaves', zh: '时间戳噪声留下的' }, head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'Answers in', zh: '作答时隙' },
      { en: 'Range noise, 1-σ', zh: '测距噪声 1σ' }, { en: 'Error this run', zh: '本次运行的误差' },
    ], rows: [
      [N('anchor-1'), N('slot 1'), N('1.9 cm'), N('+1.4 cm')],
      [N('anchor-2'), N('slot 2'), N('1.8 cm'), N('−0.9 cm')],
      [N('anchor-3'), N('slot 3'), N('1.8 cm'), N('+3.7 cm')],
      [N('anchor-4'), N('slot 4'), N('1.9 cm'), N('−5.2 cm')],
    ] },
    { text: {
      en: 'Three noisy receive stamps enter each result, and the column does not ramp: the anchor that waited four times as long gets the same figure. Last lesson it ramped.',
      zh: '每个结果里进来三个带噪声的接收时间戳，而这一列不再是斜坡：锚点 4 等了四倍长，拿到的数值却一样。上一课抱怨的正是这一列。',
    } },
  ],
  deeper: [
    { heading: { en: 'The four counters of anchor 1', zh: '锚点 1 的四个计数值' }, text: {
      en: 'Anchor 1 stamps 26 381 597 885, 26 509 391 059 and 27 020 567 485, giving Treply1 = 127 793 174 and Tround2 = 511 176 426 RCTU. The phone’s pair for it is Tround1 = 127 797 230 and Treply2 = 511 185 160. Subtract each pair: +4056 and −8734 RCTU, or +63 ns and −137 ns, where both ought to be twice the 11.675 ns of flight. The four together sum to about 1 277 952 000 RCTU — the whole exchange, timed twice.',
      zh: '锚点 1 打出 26 381 597 885、26 509 391 059 与 27 020 567 485，于是 Treply1 = 127 793 174，Tround2 = 511 176 426 RCTU。手机对它的那一对是 Tround1 = 127 797 230 与 Treply2 = 511 185 160。把两对分别相减：+4056 与 −8734 RCTU，即 +63 ns 与 −137 ns——而两者本都应当是 11.675 ns 飞行时间的两倍。四者相加约为 1 277 952 000 RCTU：整场交互，被计了两遍。',
    } },
    { heading: { en: 'The same number, computed twice', zh: '同一个数，算了两遍' }, text: {
      en: 'Two devices hold all four times, so both can do the arithmetic. An anchor finishes when the Final arrives, at 10 236 615 ns; the phone waits for that anchor’s report — 12 191 486 ns for anchor 1, almost two milliseconds later. Both lanes carry the same distance, identical to the last digit: the same four counters through the same function. That is what the reports are for — the anchor already knows the range, and the phone is the one that needs a position. At the round’s end the four ranges become a fix at (5.01, 3.98) m against a true (5.00, 4.00): 2 cm out, GDOP 1.00 for this symmetric ring.',
      zh: '有两台设备各自握齐了四个时间，因此都能把算式算一遍。锚点在 Final 到达时就算完了，时刻是 10 236 615 ns；手机要等该锚点的报告——锚点 1 是 12 191 486 ns，晚了将近两毫秒。两条泳道上的距离完全相同，连最后一位都一样：同样四个计数值，经过同一个函数。报告帧的用途正在于此——锚点早就知道这个距离，而需要定位的是手机。本轮结束时，四个距离解算出 (5.01, 3.98) m 的定位，真值 (5.00, 4.00)：偏差 2 cm，这个对称圆环的 GDOP 为 1.00。',
    } },
    { heading: { en: 'The frame that grows fastest', zh: '长得最快的那一帧' }, text: {
      en: 'The Final is the largest frame of the round and the one that grows fastest with the anchor count: 14 + 12N octets against the Poll’s 27 + 3N — 62 here, 496 bits, two Reed–Solomon blocks. The Response and the Report do not grow at all. A fifth anchor would add 12 octets to the Final and two slots, 4 ms, to the round.',
      zh: 'Final 是全轮最大的帧，也是随锚点数增长最快的：14 + 12N 字节，而 Poll 是 27 + 3N——此处 62 字节、496 位、两个 Reed–Solomon 码块。Response 与 Report 则完全不随锚点数增长。多一个锚点，Final 会多 12 字节，整轮会多两个时隙、即 4 ms。',
    } },
    { heading: { en: 'A wall the formula cannot see', zh: '公式看不见的那堵墙' }, text: {
      en: 'An obstructed first path delays all three receive stamps together. That raises both round trips and lowers both waits by the same amount, the denominator is untouched, and the excess delay is added straight to the range — not halved, not cancelled. One brick wall would put 60 cm on every range in this scene.',
      zh: '被遮挡的首径会把三个接收时间戳一起推迟。于是两次往返都变大、两段等待都变小，幅度相同；分母纹丝不动，而这段多出来的时延会原封不动加到距离上——既不打对折，也不会被抵消。在本场景里，一堵砖墙会给每一个距离加上 60 cm。',
    } },
  ],
  sources: [
    { en: 'IEEE Std 802.15.4-2024 §10.29.1.2.4 and Figure 10-199 give the three-message double-sided computation, its four times, and the statement that the two reply times need not be equal; §10.32.5 places that exchange in a one-to-many round, where one Final settles every anchor. The ±20 ppm crystal tolerance is §16.4.9.',
      zh: 'IEEE Std 802.15.4-2024 的 §10.29.1.2.4 与图 10-199 给出三消息双边测距的计算式、它用到的四个时间，以及"两个应答时延不必相等"这句话；§10.32.5 把这次交互放进一对多的测距轮里：一帧 Final 结清所有锚点。±20 ppm 的晶振容差来自 §16.4.9。' },
    { en: 'The 2 ms ranging slot is FiRa’s, not the standard’s. Three more numbers are the simulator’s own model choices: 100 ps of 1-σ noise on every received timestamp, the ranging information widths the frame table counts (the Final’s RMI is 3 + 6N octets, one reply-time field 6, a report’s RMI 13), and the 40-bit ranging counter, where the standard asks for at least 32.',
      zh: '2 ms 的测距时隙来自 FiRa，不是标准正文。另有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、帧长表所依据的测距信息宽度（Final 的 RMI 为 3 + 6N 字节，单个应答时延字段为 6 字节，报告的 RMI 为 13 字节），以及 40 位的测距计数器——标准只要求至少 32 位。' },
  ],
  scenario: () => uwbDstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: { en: 'Worst-case crystals, ±20 ppm', zh: '最差晶振，±20 ppm' }, scenario: () => uwbDstwrScenario({ tag: 20, anchors: -20 }) },
  ],
  jumps: [
    J('the poll leaves the phone', 'Poll 帧离开手机', firstUwbPoll),
    J('the Final: one frame for four anchors', 'Final 帧：一帧发给四个锚点', firstUwbFinal),
    J('an anchor computes the range', '锚点算出距离', firstAnchorRange),
    J('the first measurement report', '第一份测量报告', firstUwbReport),
    J('the fix at the end of the round', '本轮结束时的定位', firstUwbPosition),
  ],
  observe: [
    { en: 'The round line reads "10 slots × 2000.0 µs" and ends at 20 000 000 ns — twice the round of the lesson before, for the same anchors.',
      zh: '整轮那一行写着 "10 slots × 2000.0 µs"，到 20 000 000 ns 结束——同样的锚点，却是上一课那一轮的两倍长。' },
    { en: 'The Final sits alone in the middle of the round, at 10 ms: one frame for every anchor, after the last response and before the first report.',
      zh: 'Final 独自坐在这一轮正中间，10 ms 处：一帧发给所有锚点，排在最后一条 Response 之后、第一份报告之前。' },
    { en: 'All four anchor-lane ranges appear at 10 236 615 ns, when the Final lands; the phone’s own follow at 12, 14, 16 and 18 ms, each pair alike.',
      zh: '四条锚点泳道上的测距都出现在 10 236 615 ns，即 Final 落地之时；手机自己那四条则在 12、14、16、18 ms 出现。每一对读数完全相同。' },
  ],
  tryThis: [
    { en: 'Load "Worst-case crystals, ±20 ppm", which doubles both offsets and nothing else. The halves blow up — the first anchor reads 15.51 m and −44.47 m, not 9.51 and −20.49 — while the four results move by under 3 mm.',
      zh: '载入"最差晶振，±20 ppm"：两端偏差翻倍，别的什么都不改。两个半场随即失控——第一个锚点读到 15.51 m 与 −44.47 m，原先是 9.51 与 −20.49——而四个结果的变化不到 3 mm。' },
    { en: 'Open the Final in the frame inspector: an RMI listing four anchors, then one short field per anchor holding the phone’s second interval. Then open a report: one RMI with the anchor’s two.',
      zh: '在帧检视器里打开 Final：一个 RMI 列出四个锚点，其后每个锚点各有一个短字段，装着手机量的第二段时间。再打开一份报告：一个 RMI，装着锚点自己量的那两段。' },
  ],
  quiz: [
    {
      q: { en: 'Anchor 4 waits four slots before answering, anchor 1 one. Why are their ranges equally good?', zh: '锚点 4 作答前等四个时隙，锚点 1 只等一个。为什么两者一样准？' },
      options: [
        { en: 'The formula weights the round trips by their waits, so the longer counts less', zh: '公式按等待时长给两次往返加权，等得久的分量更小' },
        { en: 'Each product in the numerator carries one factor from each clock, whatever the waits are', zh: '分子里每个乘积都各带两只钟的一个因子，与等待多久无关' },
        { en: 'A slot is short enough that the rate error across it falls under the noise', zh: '一个时隙足够短，速率误差落在它上面已小于噪声' },
      ],
      answer: 1,
      explain: { en: 'Symmetry is not required: the denominator is the whole exchange, not any one wait, and what is left is the flight scaled by ppm.', zh: '对称并非必要条件：分母是整场交互，不是某一段等待；剩下的只是被百万分之几缩放的飞行时间。' },
    },
    {
      q: { en: 'Anchor 1’s halves read 9.51 m and −20.49 m, yet the answer is 3.51 m. What does that say?', zh: '锚点 1 的两个半场读作 9.51 m 与 −20.49 m，答案却是 3.51 m。这说明了什么？' },
      options: [
        { en: 'One round trip was corrupted and the formula discards it', zh: '有一次往返被破坏，公式把它丢掉了' },
        { en: 'Neither half is a distance: each buries the flight under half a wait times a clock error, signed oppositely', zh: '两个半场都不是距离：每个都把飞行时间埋在"半段等待乘以时钟误差"之下，而且符号相反' },
        { en: 'The answer is the average of the two halves', zh: '答案就是两个半场的平均' },
      ],
      answer: 1,
      explain: { en: 'Their average is −5.49 m. Each half is one direction’s raw estimate, and the ramp corrected by measuring last lesson is cancelled here by multiplying.', zh: '两者的平均是 −5.49 m。每个半场都是某一方向上未经修正的估计；上一课靠测量修正的那道斜坡，这里改用相乘来抵消。' },
    },
    {
      q: { en: 'What does the extra message cost, and what does it not buy?', zh: '多发的这条消息花了什么代价，又买不到什么？' },
      options: [
        { en: 'Nothing measurable: 9.67 % of the round radiates against 9.56 %, and the noise goes too', zh: '没有可测的代价：辐射占比 9.67 % 对 9.56 %，噪声也一并没了' },
        { en: 'Ten slots instead of five, twice the wake-ups — the noise and a blocked path survive', zh: '十个时隙而不是五个，醒来次数翻倍——噪声和被遮挡的路径都活了下来' },
        { en: 'Four times the airtime, since the Final and reports are largest', zh: '四倍的空口时间，因为 Final 与报告是最大的帧' },
      ],
      answer: 1,
      explain: { en: 'Occupancy barely moves, so airtime is not the price; latency and energy are. The crystal term drops to picoseconds, the receive noise stays.', zh: '占用率几乎没变，代价不在空口时间，而在时延与功耗。晶体那一项被压到皮秒量级，接收噪声却留了下来。' },
    },
  ],
}
