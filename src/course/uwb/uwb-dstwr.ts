/**
 * UWB Tier 1 · M11 · Time of flight · Two round trips cancel the clock.
 *
 * Lesson 2 removed the crystal offset by measuring it and multiplying it out.
 * This lesson removes it by arithmetic: one extra message, two round trips, and
 * one factor of every clock in each product of the numerator. The same scene,
 * the same ±10 ppm crystals, four ranges inside 6 cm, and nothing estimated.
 * Every number quoted below is pinned in tests/course/uwb-dstwr.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1725 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). The prose
 * below totals 1710 words, so there is room for fifteen more and no more:
 * adding a sentence means deleting one, or the study-time test fails.
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
 * Lesson 2's scene, measured the other way: four anchors on a 3.50 m ring
 * around a phone at the centre of a 10 × 8 m lab, every device at 2.20 m, so
 * all four true distances are exactly 3.50 m. Only the session changes — DS
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
  body: [
    { text: {
      en: 'IEEE Std 802.15.4-2024 is the source for the shape of this lesson. §10.29.1.2.3 and Figure 10-199 give the three-message double-sided computation, its four times, and the statement that the two reply times need not be equal; §10.32.5 places that exchange in a one-to-many round, where one Final settles every anchor. The ±20 ppm crystal tolerance is §16.4.9. The 2 ms ranging slot is FiRa’s, and three numbers are the model’s own: 100 ps of 1-σ noise on every received timestamp, the ranging IE widths the frame table counts (the Final’s RMI IE is 3 + 6N octets, an RRTI IE 6, a report’s RMI IE 13), and the 40-bit ranging counter, where the standard asks for at least 32.',
      zh: 'IEEE Std 802.15.4-2024 是本课内容的依据。§10.29.1.2.3 与图 10-199 给出三消息双边测距的计算式、它所用的四个时间，以及“两个应答时延不必相等”这句话；§10.32.5 把这次交换放进一对多的测距轮里：一帧 Final 结清所有锚点。±20 ppm 的晶振容差来自 §16.4.9。2 ms 的测距时隙来自 FiRa；另有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、帧长表所依据的测距 IE 宽度（Final 的 RMI IE 为 3 + 6N 字节，RRTI IE 为 6 字节，报告的 RMI IE 为 13 字节），以及 40 位的测距计数器——标准只要求至少 32 位。',
    } },
    { heading: { en: 'Three messages, four times', zh: '三条消息，四个时间' }, text: {
      en: 'Lesson 2 corrected the crystal offset by measuring it. Double-sided ranging takes the other road: one more message, two round trips, and every clock appearing the same number of times on both sides of the arithmetic, so that nothing need be estimated. The scene is unchanged — four anchors on a 3.50 m ring, the phone 10 ppm fast, every anchor 10 ppm slow — and only the method differs.',
      zh: '第 2 课靠“把晶振偏差测出来”来修正它。双边测距走的是另一条路：多发一条消息，做两次往返，让每一只时钟在算式两边出现同样多次，于是什么都不必估计。场景原封不动——四个锚点站在 3.50 m 的圆环上，手机快 10 ppm，每个锚点慢 10 ppm——变的只有测距方法。',
    } },
    { kind: 'steps', items: [
      { en: 'Slot 0, at 0 ms. The phone broadcasts the Poll, stamping it leaving: txPoll. All four anchors stamp it arriving: rxPoll, each on its own counter.',
        zh: '时隙 0，0 ms。手机广播 Poll，给它离开的时刻打戳 txPoll。四个锚点给它到达的时刻打戳 rxPoll，各用各自的计数器。' },
      { en: 'Slots 1 to 4, at 2 to 8 ms. Anchor i answers in slot i, stamps txResp and holds Treply1 = txResp − rxPoll, wholly on its own clock. The phone stamps rxResp and holds Tround1 = rxResp − txPoll, wholly on its own.',
        zh: '时隙 1 到 4，2 ms 到 8 ms。第 i 个锚点在第 i 个时隙作答，打戳 txResp，手里有 Treply1 = txResp − rxPoll，完全用自己的时钟量出。手机打戳 rxResp，手里有 Tround1 = rxResp − txPoll，也完全用自己的时钟。' },
      { en: 'Slot 5, at 10 ms. One Final for all four anchors, carrying per anchor its Tround1 in the RMI IE and Treply2 = txFinal − rxResp in an RRTI IE — both the phone’s own. Each anchor stamps rxFinal and holds Tround2 = rxFinal − txResp.',
        zh: '时隙 5，10 ms。一帧 Final 发给全部四个锚点，按锚点分别携带各自的 Tround1（RMI IE）与 Treply2 = txFinal − rxResp（RRTI IE）——两个都是手机自己的测量值。每个锚点打戳 rxFinal，手里有 Tround2 = rxFinal − txResp。' },
      { en: 'Slots 6 to 9, at 12 to 18 ms. Anchor i reports its Treply1 and Tround2 in an RMI IE. Four intervals, two at each end, each a difference of two readings of one counter — nothing converted into anyone else’s units.',
        zh: '时隙 6 到 9，12 ms 到 18 ms。第 i 个锚点用一个 RMI IE 报出自己的 Treply1 与 Tround2。四段间隔，两端各两段，每段都是同一个计数器上两次读数之差——没有任何一个数被换算到别人的单位上。' },
    ] },
    { kind: 'formula', heading: { en: 'Double-sided two-way ranging', zh: '双边双向测距' }, text: {
      en: 'Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)',
      zh: 'Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)',
    }, note: {
      en: 'Let the phone’s crystal run (1 + eA) fast and the anchor’s (1 + eB). The phone measured Tround1 and Treply2, the anchor Treply1 and Tround2, so each product in the numerator carries one factor from each clock and the numerator scales by (1 + eA)(1 + eB) — whatever the reply times are. The denominator is no reply time at all: it is the whole exchange, the 10 ms the phone timed from Poll to Final plus the 10 ms the anchor timed, about 1 277 952 000 RCTU, so it scales by 1 + (eA + eB)/2. What survives is Tprop·(eA + eB)/2 — the flight time scaled by ppm, not the reply. At the worst pair allowed, both crystals 20 ppm out the same way, that is 0.23 ps: 0.07 mm.',
      zh: '设手机的晶振快 (1 + eA)，锚点的快 (1 + eB)。Tround1 与 Treply2 由手机测得，Treply1 与 Tround2 由锚点测得，于是分子里的两个乘积各带每只时钟的一个因子，分子按 (1 + eA)(1 + eB) 缩放——无论应答时延是多少。分母根本不是什么应答时延，它是整场交换：手机从 Poll 到 Final 计得的 10 ms，加上锚点计得的 10 ms，约合 1 277 952 000 RCTU，因此按 1 + (eA + eB)/2 缩放。活下来的是 Tprop·(eA + eB)/2——被 ppm 缩放的是飞行时间，不是应答时延。取标准允许的最坏一对，两只晶振同向偏 20 ppm，它是 0.23 ps，即 0.07 mm。',
    } },
    { heading: { en: 'Two wrong halves', zh: '两个都错的半场' }, text: {
      en: 'The exchange contains two single-sided round trips; compute them before believing the formula. (Tround1 − Treply1)/2 is exactly lesson 2’s raw SS-TWR estimate, wrong by the same ramp of 6 m per slot of waiting. (Tround2 − Treply2)/2 is its mirror image: the phone waits now, and it is the fast clock, so that half comes out negative.',
      zh: '这场交换里装着两次单边往返，在相信公式之前不妨把它们算出来。(Tround1 − Treply1)/2 正是第 2 课里那个未修正的 SS-TWR 估计，错法也一样：每多等一个时隙就多出 6 m。(Tround2 − Treply2)/2 则是它的镜像：这一次轮到手机等待，而手机是那只快时钟，于是这半场算出来是负的。',
    } },
    { kind: 'table', head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'Treply1', zh: 'Treply1' }, { en: 'First half', zh: '前半场' },
      { en: 'Second half', zh: '后半场' }, { en: 'DS result', zh: 'DS 结果' },
    ], rows: [
      [N('anchor-1'), N('2 ms − Tprop'), N('9.51 m'), N('−20.49 m'), N('3.51 m')],
      [N('anchor-2'), N('4 ms − Tprop'), N('15.47 m'), N('−14.48 m'), N('3.49 m')],
      [N('anchor-3'), N('6 ms − Tprop'), N('21.49 m'), N('−8.43 m'), N('3.54 m')],
      [N('anchor-4'), N('8 ms − Tprop'), N('27.42 m'), N('−2.55 m'), N('3.45 m')],
    ] },
    { text: {
      en: 'No half of this exchange is a distance, and the formula neither chooses nor averages — averaging anchor 1’s halves gives −5.49 m. Note the symmetry that is absent: anchor 4 waits 8 ms before its Response while the phone waits 2 ms before the Final, the reverse of anchor 1, and both land inside 6 cm.',
      zh: '这场交换的任何一个半场都不是距离，而公式既没有挑选也没有求平均——把锚点 1 的两个半场平均一下得到的是 −5.49 m。请注意这里根本没有的那种对称性：锚点 4 在作答前等了 8 ms，而手机在发 Final 前只等了 2 ms，与锚点 1 恰好相反，两者却都落在 6 cm 以内。',
    } },
    { heading: { en: 'The price is slots, not airtime', zh: '代价是时隙，不是空口时间' }, text: {
      en: 'A DS round is 2N + 2 slots where the single-sided round was N + 1: ten slots of 2 ms for four anchors, 20 ms instead of 10. The frames stay small.',
      zh: '一个 DS 轮是 2N + 2 个时隙，而单边轮只有 N + 1 个：四个锚点要十个 2 ms 的时隙，20 ms 而不是 10 ms。帧本身依然很小。',
    } },
    { kind: 'table', head: [
      { en: 'Frame', zh: '帧' }, { en: 'Count', zh: '数量' }, { en: 'Octets', zh: '字节' }, { en: 'Airtime each', zh: '单帧空口时间' },
    ], rows: [
      [N('Poll'), N('1'), N('39'), N('206.86 µs')],
      [N('Response'), N('4'), N('14'), N('181.22 µs')],
      [N('Final'), N('1'), N('62'), N('236.60 µs')],
      [N('Report'), N('4'), N('24'), N('191.47 µs')],
      [{ en: 'Round total', zh: '整轮合计' }, N('10'), N('253'), N('1 934.23 µs')],
    ] },
    { text: {
      en: '1 934.23 µs of radiation inside a 20 000 µs round is 9.67 %, against 9.56 % for lesson 2’s single-sided round: the duty cycle barely moves, and what doubles is the round’s length and the wake-ups. The Final is the largest frame and the only one that grows with the anchor count: 14 + 12N octets, an RMI entry and an RRTI entry per anchor — 62 here, 496 bits, two Reed–Solomon blocks.',
      zh: '在一个 20 000 µs 的轮里辐射 1 934.23 µs，占 9.67 %，而第 2 课的单边轮是 9.56 %：占空比几乎没动，翻倍的是这一轮的长度与醒来的次数。Final 是全轮最大的帧，也是唯一随锚点数增长的帧：14 + 12N 字节，每个锚点一个 RMI 表项加一个 RRTI 表项——此处 62 字节、496 位、两个 Reed–Solomon 码块。',
    } },
    { heading: { en: 'The same number, computed twice', zh: '同一个数，算了两遍' }, text: {
      en: 'Two devices hold all four times, and both do the arithmetic. An anchor finishes when the Final arrives, at 10 236 615 ns; the phone waits for that anchor’s report — 12 191 486 ns for anchor 1, almost two milliseconds later. Both lanes carry the same distance, identical to the last digit of tofRctu: the same four counters through the same function. That is what the reports are for — the anchor already knows the range, and the phone is the one that needs a position. At the round’s end the four ranges become a fix at (5.01, 3.98) m against a true (5.00, 4.00): 2 cm out, GDOP 1.00 for this symmetric ring.',
      zh: '有两台设备各自握齐了四个时间，而且都把算式算了一遍。锚点在 Final 到达时就算完了，时刻是 10 236 615 ns；手机则要等该锚点的报告——锚点 1 是 12 191 486 ns，晚了将近两毫秒。两条泳道上的距离完全相同，连 tofRctu 的最后一位都一样：同样四个计数值，经过同一个函数。报告帧的用途正在于此——锚点早就知道这个距离，而需要定位的是手机。本轮结束时，四个距离解算出 (5.01, 3.98) m 的定位，真值 (5.00, 4.00)：偏差 2 cm，这个对称圆环的 GDOP 为 1.00。',
    } },
    { heading: { en: 'What it does not fix', zh: '它修不好的那些' }, text: {
      en: 'All of this removes one error term only: the crystals. The 100 ps of noise on every received timestamp is untouched, and it is now what the error is made of. Three noisy receive stamps enter each result — the anchor’s of the Poll, the phone’s of the Response, the anchor’s of the Final — weighted by the reply times: 1.9 cm of 1-σ in slots 1 and 4, 1.8 cm in slots 2 and 3. Unlike lesson 2’s residual it does not ramp; anchor 4 waited four times as long and gets the same figure. The four errors here are +1.4, −0.9, +3.7 and −5.2 cm. Nor does any of it touch a wall: an obstructed first path delays both round trips alike, so that bias passes through intact — where the positioning lesson that closes this track begins.',
      zh: '以上这一切只拿掉了一项误差：晶振。每个接收时间戳上的 100 ps 噪声毫发无损，而现在误差正是由它构成的。每个结果里进来三个带噪声的接收时间戳——锚点收 Poll 的、手机收 Response 的、锚点收 Final 的——按应答时延加权之后：时隙 1 与 4 是 1.9 cm 的 1σ，时隙 2 与 3 是 1.8 cm。与第 2 课的残差不同，它不会随时隙爬升；锚点 4 等了四倍的时长，拿到的数值分毫不差。本次运行的四个误差是 +1.4、−0.9、+3.7 与 −5.2 cm。它同样拿墙没有办法：被遮挡的首径会把两次往返同等地推迟，于是这项偏差原封不动地穿过去了——而这正是收尾本条主线的定位课的起点。',
    } },
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
    { en: 'The round line reads “10 slots × 2000.0 µs” and ends at 20 000 000 ns — twice lesson 2’s round for the same four anchors. Poll in slot 0, responses in slots 1 to 4, the Final in slot 5 at 10 ms, reports in slots 6 to 9.',
      zh: '整轮那一行写着 “10 slots × 2000.0 µs”，到 20 000 000 ns 结束——同样是四个锚点，却是第 2 课那一轮的两倍。Poll 在时隙 0，Response 在时隙 1 到 4，Final 在时隙 5、即 10 ms 处，报告在时隙 6 到 9。' },
    { en: 'Anchor 1 stamps 26 381 597 885, 26 509 391 059 and 27 020 567 485, giving Treply1 = 127 793 174 and Tround2 = 511 176 426 RCTU. The phone’s pair for it is Tround1 = 127 797 230 and Treply2 = 511 185 160.',
      zh: '锚点 1 打出 26 381 597 885、26 509 391 059 与 27 020 567 485，得到 Treply1 = 127 793 174 与 Tround2 = 511 176 426 RCTU。手机对它的那一对是 Tround1 = 127 797 230 与 Treply2 = 511 185 160。' },
    { en: 'Subtract those pairs: Tround1 − Treply1 = +4 056 RCTU, Tround2 − Treply2 = −8 734. That is +63 ns and −137 ns where both should be twice the 11.675 ns of flight.',
      zh: '把这两对相减：Tround1 − Treply1 = +4 056 RCTU，Tround2 − Treply2 = −8 734，也就是 +63 ns 与 −137 ns——而两者本都应当是 11.675 ns 飞行时间的两倍。' },
    { en: 'All four anchor-lane ranges appear at 10 236 615 ns, when the Final lands; the tag-lane ones follow at 12, 14, 16 and 18 ms. Each pair reads the same: 3.51, 3.49, 3.54 and 3.45 m against a true 3.50 m.',
      zh: '四条锚点泳道上的测距都出现在 10 236 615 ns，即 Final 落地之时；标签泳道上的则在 12、14、16、18 ms 出现。每一对读数都相同：3.51、3.49、3.54 与 3.45 m，真值 3.50 m。' },
  ],
  tryThis: [
    { en: 'Load “Worst-case crystals, ±20 ppm”, which doubles both offsets and changes nothing else. The halves blow up: anchor 1 now reads 15.51 m and −44.47 m where it read 9.51 and −20.49. The DS ranges become 3.52, 3.49, 3.54 and 3.45 m — each within 3 mm of the base run — and the fix is still 2 cm out.',
      zh: '载入“最差晶振，±20 ppm”：两端偏差翻倍，别的什么都不改。两个半场随即失控：锚点 1 现在读到 15.51 m 与 −44.47 m，原先是 9.51 与 −20.49。DS 距离变成 3.52、3.49、3.54 与 3.45 m——每一个都在基准运行的 3 mm 之内——定位偏差依然是 2 cm。' },
    { en: 'Open the Final in the frame inspector: 62 octets, one RMI IE of 27 holding four Tround1 values, four RRTI IEs of 6 holding the four Treply2 values. Then a report: 24 octets, a single 13-octet RMI IE with Treply1 and Tround2. A fifth anchor would add 12 octets to the Final and two slots — 4 ms — to the round.',
      zh: '在帧检视器里打开 Final：62 字节，一个 27 字节的 RMI IE 装着四个 Tround1，四个 6 字节的 RRTI IE 装着四个 Treply2。再打开一份报告：24 字节，一个 13 字节的 RMI IE，装着 Treply1 与 Tround2。多一个锚点，Final 会多 12 字节，整轮会多两个时隙、即 4 ms。' },
  ],
  quiz: [
    {
      q: { en: 'Anchor 4 waits 8 ms before its Response and the phone 2 ms before the Final — the reverse of anchor 1. Why is its range just as good?', zh: '锚点 4 在作答前等了 8 ms，手机在发 Final 前等了 2 ms——与锚点 1 恰好相反。为什么它的测距一样准？' },
      options: [
        { en: 'The formula weights the round trips by their reply times, so the longer counts for less', zh: '公式按应答时延给两次往返加权，等得久的那次分量更小' },
        { en: 'Each product in the numerator carries one factor from each clock, so it scales by (1 + eA)(1 + eB) whatever the reply times are', zh: '分子里每个乘积各带每只时钟的一个因子，于是无论应答时延多少，都按 (1 + eA)(1 + eB) 缩放' },
        { en: 'The 2 ms slot is short enough that 20 ppm across it falls below the timestamp noise', zh: '2 ms 的时隙足够短，20 ppm 落在它上面已小于时间戳噪声' },
      ],
      answer: 1,
      explain: { en: 'Symmetry is not required, and the standard says so: the denominator is the whole 20 ms exchange, not any one reply. What is left is Tprop·(eA + eB)/2 — 0.23 ps at the worst crystals allowed.', zh: '对称并非必要条件，标准本身就是这么写的：分母是整场 20 ms 的交换，不是任何一段应答时延。剩下的是 Tprop·(eA + eB)/2——在标准允许的最差晶振下也只有 0.23 ps。' },
    },
    {
      q: { en: 'For anchor 1 the halves read 9.51 m and −20.49 m, yet the DS answer is 3.51 m. What does that say?', zh: '锚点 1 的两个半场读作 9.51 m 与 −20.49 m，DS 的答案却是 3.51 m。这说明了什么？' },
      options: [
        { en: 'One round trip was corrupted and the formula discards it', zh: '有一次往返被破坏了，公式把它丢掉了' },
        { en: 'Neither half is a distance: each buries the flight time under half a reply times a clock error, oppositely signed because the clocks swap roles', zh: '两个半场都不是距离：每个都把飞行时间埋在“半个应答时延乘以时钟误差”之下，符号相反是因为两只时钟的角色对调了' },
        { en: 'The answer is the average of the two halves', zh: '答案就是两个半场的平均' },
      ],
      answer: 1,
      explain: { en: 'Their average is −5.49 m, not 3.51 m. Each half is one direction’s raw SS-TWR estimate, and the ramp lesson 2 corrected by measuring the clock ratio is cancelled here by multiplying instead.', zh: '两者的平均是 −5.49 m，不是 3.51 m。每个半场都是某一方向上未经修正的 SS-TWR 估计；第 2 课靠测量时钟比值修正的那道斜坡，这里改用相乘来抵消。' },
    },
    {
      q: { en: 'What does the extra message cost, and what does it not buy?', zh: '多发的这条消息花了什么代价，又买不到什么？' },
      options: [
        { en: 'Nothing measurable: 9.67 % of the round radiates against 9.56 %, and the timestamp noise goes too', zh: '没有可测的代价：辐射占比 9.67 %，对比 9.56 %，时间戳噪声也一并没了' },
        { en: 'Ten slots instead of five — 20 ms instead of 10, twice the wake-ups — while the 100 ps timestamp noise and any NLOS bias survive', zh: '十个时隙而不是五个——20 ms 而不是 10 ms，醒来次数翻倍——而 100 ps 的时间戳噪声与任何 NLOS 偏差都活了下来' },
        { en: 'Four times the airtime, since the Final and reports are the largest frames', zh: '四倍的空口时间，因为 Final 与报告是最大的帧' },
      ],
      answer: 1,
      explain: { en: 'The duty cycle barely moves (9.67 % against 9.56 %), so airtime is not the price; latency and energy are, and both roughly double. The crystal term drops to picoseconds, but the 100 ps of receive noise is what the 1.9 cm of 1-σ is made of.', zh: '占空比几乎没变（9.67 % 对 9.56 %），代价不在空口时间，而在时延与功耗，二者大约翻倍。晶振项被压到皮秒量级，但 1.9 cm 的 1σ 正是由那 100 ps 的接收噪声构成的。' },
    },
  ],
}
