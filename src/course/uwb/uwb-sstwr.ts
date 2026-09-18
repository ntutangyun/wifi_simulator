/**
 * UWB Tier 1 · M11 · Time of flight · The clock inside the reply time.
 *
 * Lesson 1 pinned both crystals to 0 ppm and told you that was a mercy. Here it
 * is withdrawn: the phone runs 10 ppm fast, every anchor 10 ppm slow, and the
 * four anchors answer in four different slots, so one scene shows the same
 * distance measured four times with four different errors — 6, 12, 18 and 24 m
 * on a true 3.50 m. Then the clock-offset correction of §10.29.1.6 puts all
 * four back inside a tenth of a metre. Every number quoted below is pinned in
 * tests/course/uwb-sstwr.test.ts — including every cell of the table, both
 * numeric jump labels, the crystal offsets (read back from the scenes rather
 * than re-typed) and the Coffs the engine actually used.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1725 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). The prose
 * below totals 1716 words, so there is room for eight more and no more:
 * adding a sentence means deleting one, or the study-time test fails.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, firstUwbPoll, firstUwbRange, firstUwbResp, oneRoom, uwbSc, uwbTag,
  type Lesson,
} from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The fourth range of the round: the anchor that answers in slot 4. */
const fourthUwbRange = (r: TLRecord): boolean => r.type === 'UWB_RANGE' && r.peer === 'anchor-4'

/**
 * Four anchors on a 3.50 m ring around a phone at the centre of a 10 × 8 m lab,
 * every device at the same 2.20 m height so all four true distances are exactly
 * 3.50 m. The only thing that differs between the four ranges is the slot the
 * anchor answers in — which is the whole point of the scene.
 */
export function uwbSstwrScenario(ppm: { tag: number; anchors: number }): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2, ppm.anchors),
    anchor('anchor-2', 'Anchor 2', 5, 7.5, 2.2, ppm.anchors),
    anchor('anchor-3', 'Anchor 3', 1.5, 4, 2.2, ppm.anchors),
    anchor('anchor-4', 'Anchor 4', 5, 0.5, 2.2, ppm.anchors),
    uwbTag('tag-1', 'Phone', 5, 4, 2.2, ppm.tag),
  ], { method: 'ss', nlos: false })
}

export const uwbSstwr: Lesson = {
  id: 'uwb-sstwr',
  module: 11,
  title: { en: 'The clock inside the reply time', zh: '应答时间里藏着的那只时钟' },
  body: [
    { text: {
      en: 'IEEE Std 802.15.4-2024 is the source for the shape of this lesson. §10.29.1.2.2 gives the single-sided two-way ranging computation; §10.29.1.6 defines the ranging tracking offset and ranging tracking interval — the fields with which a receiver reports the transmitter’s clock rate as it measured it — and the Figure of Merit byte whose three tables this lesson decodes. The ±20 ppm crystal tolerance is §16.4.9. Three numbers are the model’s own: 100 ps of 1-σ noise on every received timestamp, 0.2 ppm of residual error in the clock-offset estimate, and the 2 ms ranging slot, which is FiRa’s, not the standard’s.',
      zh: 'IEEE Std 802.15.4-2024 是本课内容的依据。§10.29.1.2.2 给出单边双向测距的计算式；§10.29.1.6 定义了测距跟踪偏差（ranging tracking offset）与测距跟踪区间（ranging tracking interval）——接收端用这两个字段上报自己测到的发送端时钟速率——同时也定义了本课要逐位拆解的品质因数（FoM）字节及其三张表。±20 ppm 的晶振容差来自 §16.4.9。有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及 2 ms 的测距时隙——最后这个来自 FiRa 而非标准。',
    } },
    { heading: { en: 'Treply is measured by the other clock', zh: 'Treply 是用对方的时钟量出来的' }, text: {
      en: 'Four anchors stand on a 3.50 m ring around a phone in the middle of a 10 × 8 m lab, all five devices at 2.20 m, so every true distance is exactly 3.50 m — 11.675 ns of flight, a 12 ns gap between TX_START and RX_START. One poll goes out at 0 ns and all four anchors hear it; then they answer one at a time, in slots that begin at 2, 4, 6 and 8 ms. Four ranges to the same distance, from one poll.',
      zh: '在一间 10 × 8 m 的实验室中央放一部手机，四个锚点站在它周围一个 3.50 m 的圆环上，五台设备都在 2.20 m 的高度，因此四个真实距离恰好都是 3.50 m——飞行时间 11.675 ns，时间线上 TX_START 与 RX_START 相隔 12 ns。0 ns 时发出一帧 Poll，四个锚点都听到了；随后它们逐一作答，各自的时隙从 2、4、6、8 ms 开始。一帧 Poll，换来对同一个距离的四次测量。',
    } },
    { text: {
      en: 'The crystals are no longer perfect. The phone runs 10 ppm fast, every anchor 10 ppm slow — well inside the ±20 ppm the standard allows. Call the initiator’s fractional frequency error eA and the responder’s eB. Tround is a difference of two readings of the tag’s counter, so the tag measures it 1 + eA times too long. Treply is a difference of two readings of the anchor’s counter, measured 1 + eB times too long — and the anchor puts that number in the response for the tag to subtract. Each subtraction kills the crystal’s unknown origin. Neither touches its rate.',
      zh: '这一次晶振不再完美。手机快 10 ppm，每个锚点慢 10 ppm——远在标准允许的 ±20 ppm 之内。把发起方的相对频率误差记作 eA，应答方的记作 eB。Tround 是标签自己计数器上两次读数之差，于是标签把它量得偏长 1 + eA 倍；Treply 是锚点自己计数器上两次读数之差，于是锚点把它量得偏长 1 + eB 倍——然后把这个数写进 Response 帧，交给标签去相减。两次相减都抹掉了晶振那个未知的起点，却都没有碰到它的速率。',
    } },
    { kind: 'formula', heading: { en: 'What the raw estimate really contains', zh: 'raw 估计里真正装着什么' }, text: {
      en: 'T̂prop = (Tround·(1 + eA) − Treply·(1 + eB)) / 2\n       = Tprop + Tprop·eA + ½·Treply·(eA − eB)',
      zh: 'T̂prop = (Tround·(1 + eA) − Treply·(1 + eB)) / 2\n       = Tprop + Tprop·eA + ½·Treply·(eA − eB)',
    }, note: {
      en: 'Substitute Tround = Treply + 2·Tprop and the Treply terms almost cancel — almost. Two error terms survive. The first, Tprop·eA, scales a 11.675 ns flight by 10 ppm: 0.12 picoseconds, 35 micrometres — forget it. The second scales the reply, which at 2 ms is a hundred and seventy thousand times the flight. At eA − eB = 20 ppm it is ½ × 2 ms × 20 ppm = 20 ns, or 6.0 m of error on a 3.50 m range.',
      zh: '把 Tround = Treply + 2·Tprop 代进去，Treply 项几乎抵消——只是几乎。有两个误差项活了下来。第一项 Tprop·eA 是拿 10 ppm 去缩放 11.675 ns 的飞行时间：0.12 皮秒，合 35 微米，可以直接忘掉。第二项缩放的是应答时延，而 2 ms 的应答时延是飞行时间的十七万倍。当 eA − eB = 20 ppm 时，它是 ½ × 2 ms × 20 ppm = 20 ns，落在一个 3.50 m 的距离上就是 6.0 m 的误差。',
    } },
    { heading: { en: 'Four anchors, four different errors', zh: '四个锚点，四个不同的误差' }, text: {
      en: 'That is why the scene has four anchors rather than one. The anchor in slot i holds its answer until slot i begins, so its Treply is i × 2 ms − Tprop and the surviving error term is proportional to i. The geometry is identical for all four; only the waiting differs.',
      zh: '这就是本场景要摆四个锚点而不是一个的原因。第 i 个时隙里的锚点把回答压到第 i 个时隙开始才发出，于是它的 Treply 是 i × 2 ms − Tprop，活下来的那个误差项就与 i 成正比。四者的几何完全一样，差别只在等了多久。',
    } },
    { kind: 'table', head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'Treply', zh: 'Treply' }, { en: 'Predicted error', zh: '预测误差' },
      { en: 'Raw range', zh: 'raw 距离' }, { en: 'Raw error', zh: 'raw 误差' },
    ], rows: [
      [N('anchor-1'), N('2 ms − Tprop'), N('6.0 m'), N('9.51 m'), N('6.01 m')],
      [N('anchor-2'), N('4 ms − Tprop'), N('12.0 m'), N('15.47 m'), N('11.97 m')],
      [N('anchor-3'), N('6 ms − Tprop'), N('18.0 m'), N('21.49 m'), N('17.99 m')],
      [N('anchor-4'), N('8 ms − Tprop'), N('24.0 m'), N('27.42 m'), N('23.92 m')],
    ] },
    { text: {
      en: 'That is not noise: four readings of one distance, all biased long, each a clean multiple of the first. The phone sits 3.50 m from every anchor and believes it is 9.51 m from one and 27.42 m from another. With a crystal offset in play, uncorrected SS-TWR measures not distance but how long the responder waited, times half the offset.',
      zh: '这不是噪声：对同一个距离的四次读数全都偏长，而且每一个都是第一个的整数倍。手机距每个锚点都是 3.50 m，却认定自己离其中一个有 9.51 m、离另一个有 27.42 m。一旦存在晶振偏差，未经修正的 SS-TWR 测的不是距离，而是应答方等了多久，再乘以偏差的一半。',
    } },
    { heading: { en: 'The standard’s answer: measure the other clock', zh: '标准给出的答案：把对方的时钟也测出来' }, text: {
      en: 'A UWB receiver has to lock onto the transmitter’s pulse train before it can find the RMARKER at all, and the loop that does that lock knows, as a by-product, how fast the incoming chips arrive relative to its own oscillator. §10.29.1.6 asks the receiver to report exactly that, as a ranging tracking offset counted over a ranging tracking interval: a measured ratio, not an assumed one. The simulator carries it on every received frame as Coffs — the responder’s clock rate relative to the initiator’s, as the initiator’s own receiver estimated it, positive when the responder runs fast. Here Coffs sits near −20 ppm.',
      zh: 'UWB 接收机必须先锁住发送端的脉冲序列，才谈得上找到 RMARKER；而完成这次锁定的环路顺带就知道了：进来的码片相对自己本振跑得有多快。§10.29.1.6 要求接收端把这件事原样上报——在一个测距跟踪区间内累计出的测距跟踪偏差：一个实测的比值，而不是一个假定值。仿真器把它挂在每一个收到的帧上，叫作 Coffs——应答方的时钟速率相对于发起方的比值，由发起方自己的接收机估计得到，为正表示应答方偏快。本场景中 Coffs 在 −20 ppm 附近。',
    } },
    { kind: 'formula', heading: { en: 'Single-sided two-way ranging, corrected', zh: '经过修正的单边双向测距' }, text: {
      en: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2',
      zh: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2',
    }, note: {
      en: 'One multiplication. Treply arrived measured on the anchor’s clock; scaling it by (1 − Coffs) re-expresses it in the tag’s ticks, the unit Tround is already in, and the near-cancellation becomes an actual one. The four range lines now read 3.45, 3.42, 3.41 and 3.51 m against a true 3.50 m — errors of −5.3, −7.8, −9.5 and +0.5 cm, where a moment ago they were 6.01, 11.97, 17.99 and 23.92 m. Nothing about the radio changed.',
      zh: '只多了一次乘法。Treply 送来时是用锚点的时钟量的；乘上 (1 − Coffs) 就把它换算成标签的计数单位，也就是 Tround 本来所用的单位，于是那次“几乎抵消”变成了真正的抵消。四条测距行现在读作 3.45、3.42、3.41 与 3.51 m，真值 3.50 m——误差为 −5.3、−7.8、−9.5 与 +0.5 cm，而片刻之前它们还是 6.01、11.97、17.99 与 23.92 m。射频什么都没有变。',
    } },
    { heading: { en: 'What the correction cannot remove', zh: '修正拿不掉的那部分' }, text: {
      en: 'Coffs is itself a measurement, and this model leaves 0.2 ppm of 1-σ error in it. The residual is then ½·Treply·σ_cfo: half of 0.2 ppm of 1 ms is 0.1 ns, or 3.0 cm per millisecond of reply. It grows down the table exactly as the raw error did — 6.0 cm of 1-σ for anchor 1, 24.0 cm for anchor 4. The four errors above are one draw from those four distributions, which is why they do not increase monotonically: −9.5 cm at anchor 3 is well inside its sigma, and anchor 4’s +0.5 cm is a lucky draw from the widest of the four.',
      zh: 'Coffs 自己也是一次测量，而本模型在它上面留下了 0.2 ppm 的 1σ 误差。于是残差就是 ½·Treply·σ_cfo：1 ms 的 0.2 ppm 取一半是 0.1 ns，即每毫秒应答时延 3.0 cm。它会像 raw 误差一样沿着表格往下长——锚点 1 对应 6.0 cm 的 1σ，锚点 4 对应 24.0 cm。上面那四个误差只是从这四个分布里各抽了一次，所以它们并不单调递增：锚点 3 的 −9.5 cm 稳稳落在它自己的 σ 之内，而锚点 4 的 +0.5 cm 是从四者中最宽的那个分布里抽到的好运气。',
    } },
    { text: {
      en: 'The correction does not make the reply delay free; it makes it cheap — 20 ppm of raw offset become 0.2 ppm of residual. But the residual still scales with how long the anchor waited, and it is the only term left in this lesson that does. That is the argument for the next lesson’s double-sided exchange, where the reply delay is measured in both directions and cancels instead of being estimated away.',
      zh: '修正并没有让应答时延变成免费的，只是让它变得便宜——20 ppm 的原始偏差变成 0.2 ppm 的残差。但残差依然随锚点等待的时长而增长，而且在本课里只剩它这一项会这样。这正是下一课要讲的双边交换的理由：在那里应答时延被双向测量并直接抵消，而不是靠估计把它消掉。',
    } },
    { heading: { en: 'The byte that says how much to trust it', zh: '用来说明“这有多可信”的那个字节' }, text: {
      en: 'Every UWB_TS line for a received frame ends in “(97 % within 0.5 ns)”. That is the Figure of Merit byte, 0x16 here, decoded through three tables in §10.29.1.6: three bits of confidence level (6 → 97 %), two bits of interval (2 → 1 ns) and two bits of scale (0 → ×0.5) — 97 % of the timestamp error within half a nanosecond, 15 cm of one-way flight. It travels with the measurement so a position solver can weight a confident range above a doubtful one. It says nothing about the crystal offset: a timestamp of exactly this confidence produced the 27.42 m reading above.',
      zh: '每一条描述接收帧的 UWB_TS 行末尾都跟着 “(97 % within 0.5 ns)”。那是品质因数字节，此处为 0x16，按 §10.29.1.6 的三张表解码：3 位置信水平（6 → 97 %）、2 位区间（2 → 1 ns）、2 位比例因子（0 → ×0.5）——即 97 % 的时间戳误差落在半纳秒之内，相当于 15 cm 的单向飞行距离。它随测量结果一起传递，好让定位解算器给可信的距离更高的权重。它对晶振偏差只字未提：上面那个 27.42 m 的读数，正出自一个置信度恰好如此的时间戳。',
    } },
  ],
  scenario: () => uwbSstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: { en: 'Perfect crystals', zh: '理想晶振' }, scenario: () => uwbSstwrScenario({ tag: 0, anchors: 0 }) },
    { label: { en: 'TCXOs, ±1 ppm', zh: '±1 ppm 的温补晶振' }, scenario: () => uwbSstwrScenario({ tag: 1, anchors: -1 }) },
  ],
  jumps: [
    J('the poll leaves the phone', 'Poll 帧离开手机', firstUwbPoll),
    J('the first anchor answers', '第一个锚点作答', firstUwbResp),
    J('the first range: raw is 6 m long', '第一次测距：raw 长了 6 m', firstUwbRange),
    J('the fourth range: raw is 24 m long', '第四次测距：raw 长了 24 m', fourthUwbRange),
  ],
  observe: [
    { en: 'One poll at 0 ns produces four RX_START records at 12 ns — the same 12 ns for all four, because all four are 3.50 m away. The round then spends five slots of 2 ms: the poll in slot 0, one response in each of slots 1 to 4.', zh: '0 ns 处的一帧 Poll 产生了四条 12 ns 的 RX_START——四个锚点都是 12 ns，因为它们距离都是 3.50 m。整轮随后花掉五个 2 ms 的时隙：Poll 在时隙 0，时隙 1 到 4 各有一条 Response。' },
    { en: 'Read the four UWB_RANGE lines in order. The corrected figures stay between 3.41 and 3.51 m, but the raw figure in brackets climbs 9.51 → 15.47 → 21.49 → 27.42 m. The corrected column is flat; the raw column is a ramp.', zh: '按顺序读四条 UWB_RANGE。修正后的读数都落在 3.41 与 3.51 m 之间，但括号里的 raw 值却一路爬升：9.51 → 15.47 → 21.49 → 27.42 m。修正后的那一列是平的，raw 那一列是一道斜坡。' },
    { en: 'Take the differences of consecutive raw values: 5.96, 6.02, 5.93 m. Each extra 2 ms of waiting costs another 6 m, and the step is the same every time — a bias with a formula behind it, not scatter.', zh: '把相邻的 raw 值相减：5.96、6.02、5.93 m。每多等 2 ms 就多付 6 m，而且每一步的大小都一样——这是一个背后有公式的偏差，不是散布。' },
    { en: 'Find anchor-1’s two UWB_TS counters, 26 381 597 885 and 26 509 391 059. Their difference, 127 793 174 RCTU, is exactly the reply time its response carries. The number the tag subtracts was computed on the anchor’s clock.', zh: '找到 anchor-1 的两条 UWB_TS 计数值：26 381 597 885 与 26 509 391 059。两者之差 127 793 174 RCTU，正是它的 Response 帧所携带的应答时长。标签拿来相减的那个数，是在锚点的时钟上算出来的。' },
  ],
  tryThis: [
    { en: 'Load the “Perfect crystals” variant, which pins both ends to 0 ppm and changes nothing else. The raw errors collapse to 1.9, −1.9, 0.7 and −6.1 cm — no ramp at all, because eA − eB is zero. What remains is timestamp noise, whose 1-σ is 4.2 cm and which does not care which slot the anchor answered in.', zh: '载入“理想晶振”变体：它把两端都钉在 0 ppm，别的什么都不改。raw 误差随即坍缩为 1.9、−1.9、0.7 与 −6.1 cm——斜坡彻底消失，因为 eA − eB 为零。剩下的只有时间戳噪声，它的 1σ 是 4.2 cm，并且并不在意锚点是在第几个时隙作答的。' },
    { en: 'Now load “TCXOs, ±1 ppm”, a tenth of the base offset — eA − eB falls from 20 ppm to 2 ppm — and the sort of part a careful product actually fits. The raw errors become 0.62, 1.18, 1.80 and 2.34 m: still a ramp, still about 0.60 m per slot, still hopeless for a 3.50 m range. Better crystals buy an order of magnitude and do not buy correctness — which is why the correction is in the standard, not in the bill of materials.', zh: '再载入“±1 ppm 的温补晶振”：偏差只有基准场景的十分之一——eA − eB 从 20 ppm 降到 2 ppm——也是认真的产品真会选用的器件。raw 误差变成 0.62、1.18、1.80 与 2.34 m：依然是一道斜坡，依然大约每时隙 0.60 m，对一个 3.50 m 的距离依然毫无指望。更好的晶振能买来一个数量级，却买不来正确性——这正是为什么这项修正写在标准里，而不是写在物料清单上。' },
  ],
  quiz: [
    {
      q: { en: 'Anchor 1 answers in slot 1 and anchor 4 in slot 4, from the same 3.50 m. Why is anchor 4’s raw error four times anchor 1’s?', zh: '锚点 1 在时隙 1 作答，锚点 4 在时隙 4 作答，两者距离都是 3.50 m。为什么锚点 4 的 raw 误差是锚点 1 的四倍？' },
      options: [
        { en: 'Its response is weaker after three more slots of channel fading', zh: '又过了三个时隙，信道衰落让它的 Response 变得更弱' },
        { en: 'The surviving error term is ½·Treply·(eA − eB), and Treply is four times longer', zh: '活下来的误差项是 ½·Treply·(eA − eB)，而它的 Treply 长了四倍' },
        { en: 'Its ranging counter has had four times as long to drift away from the tag’s', zh: '它的测距计数器有四倍的时间从标签的计数器上漂走' },
      ],
      answer: 1,
      explain: { en: 'The error is not a drift accumulating in the counter; it is a scale error on one measured interval. The same 20 ppm times a longer interval is a proportionally larger error: 2, 4, 6 and 8 ms of reply give 6, 12, 18 and 24 m.', zh: '这个误差不是计数器里累积出来的漂移，而是加在某一段被测量的时间间隔上的比例误差。同样的 20 ppm 乘以更长的间隔，误差就按比例变大：2、4、6、8 ms 的应答时延分别给出 6、12、18、24 m。' },
    },
    {
      q: { en: 'Where does the value of Coffs come from?', zh: 'Coffs 这个值是从哪里来的？' },
      options: [
        { en: 'From the anchor’s datasheet, exchanged once when the session opened', zh: '来自锚点的数据手册，在会话建立时交换一次' },
        { en: 'From the initiator’s own receiver, which measures the incoming chip rate against its own oscillator and reports it per §10.29.1.6', zh: '来自发起方自己的接收机：它拿进来的码片速率与自己的本振比对，并按 §10.29.1.6 上报' },
        { en: 'From the difference between Tround and Treply, once both are known', zh: '在 Tround 与 Treply 都已知之后，由两者之差得到' },
      ],
      answer: 1,
      explain: { en: 'The ratio is a by-product of a lock the receiver had to acquire anyway. Deriving it from Tround − Treply would be circular: that difference is the answer being sought.', zh: '这个比值是接收机无论如何都要完成的那次锁定的副产品。若想从 Tround − Treply 推出它则会陷入循环：那个差值正是我们要求的答案本身。' },
    },
    {
      q: { en: 'After the correction, anchor 4’s range is the most accurate of the four. Is slot 4 therefore the best place to answer from?', zh: '修正之后，锚点 4 的距离反而是四者中最准的。那么在时隙 4 作答是不是最好的选择？' },
      options: [
        { en: 'Yes — the longer reply gives the receiver more time to average its clock estimate', zh: '是——更长的应答时延给了接收机更多时间去平均它的时钟估计' },
        { en: 'No — slot 4 has the widest residual (1-σ of 24.0 cm against anchor 1’s 6.0 cm); this run drew a small value from it', zh: '否——时隙 4 的残差分布最宽（1σ 为 24.0 cm，而锚点 1 是 6.0 cm）；这一次运行不过是从中抽到了一个小值' },
        { en: 'No — the accuracy is real, but it comes from anchor 4’s better geometry', zh: '否——这个精度是真实的，但它来自锚点 4 更好的几何位置' },
      ],
      answer: 1,
      explain: { en: 'The residual is ½·Treply·σ_cfo, 3.0 cm of 1-σ per millisecond, so it grows with the reply exactly as the raw error did. A sample from a wide distribution can land anywhere, including nearer the truth than a sample from a narrow one. The four anchors have identical geometry by construction.', zh: '残差是 ½·Treply·σ_cfo，每毫秒 3.0 cm 的 1σ，因此它像 raw 误差一样随应答时延增长。从一个宽分布里抽样，落在哪里都有可能，包括比窄分布的样本更接近真值。而四个锚点的几何是按场景设计刻意做成完全一样的。' },
    },
  ],
}
