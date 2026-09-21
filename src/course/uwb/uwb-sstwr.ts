/**
 * UWB Tier 1 · M11 · Time of flight · The clock inside the reply time.
 *
 * The third lesson of the UWB track, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): why a reply
 * time measured on the other radio's crystal makes the range too long, how the
 * error grows with the slot the anchor answered in, and what the standard's
 * clock-offset correction does and does not remove.
 *
 * The scene is unchanged from before the rewrite: the phone runs 10 ppm fast,
 * every anchor 10 ppm slow, and the four anchors answer in four different
 * slots, so one round shows the same 3.50 m measured four times with four
 * different errors. The provenance that used to open the lesson is in
 * `sources`; the Figure of Merit byte, the two surviving error terms and the
 * counters behind the reply time are in `deeper`.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-sstwr.test.ts.
 * `npx tsx scripts/lesson-dump.ts uwb-sstwr en` prints the section budgets.
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
  why: {
    en: 'The lessons so far let both radios keep perfect time. No real pair does: a quartz crystal runs a little fast or a little slow, and an interval measured on a slow one comes out short. The longest interval in the exchange is the anchor’s, and the phone subtracts it as if it were its own. Here that goes wrong by metres.',
    zh: '前面几课让两台射频都守着完美的时间，现实里没有哪一对是这样：石英晶体总会走得偏快或偏慢，用走得慢的钟量出来的一段时间就偏短。偏偏交互里最长的那一段是锚点量的，手机却把它当成自己量的直接减掉。这一课里，这件事会错出好几米。',
  },
  outcomes: [
    { en: 'say why a reply measured on the other radio’s clock makes a range too long', zh: '说清为什么"用对方的钟量出来的应答时间"会把距离测长' },
    { en: 'predict how much too long, from the slot an anchor answered in', zh: '根据锚点在第几个时隙作答，预测它会测长多少' },
    { en: 'tell the corrected figure from the raw one on a range line', zh: '在测距行上分清修正值与 raw 值' },
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'crystal', plain: {
      en: 'the sliver of quartz a radio counts time with; no two run at the same rate',
      zh: '射频用来数时间的那一小片石英；没有哪两片走得一样快',
    } },
    { term: 'ppm', plain: {
      en: 'parts per million, the unit of a clock’s rate error: one tick in a million',
      zh: '百万分之几，时钟速率误差的单位：一百万格里差一格',
    } },
    { term: 'clock offset', plain: {
      en: 'how much faster one radio’s clock runs than the other’s, as a ratio',
      zh: '一台射频的时钟比另一台快多少，写成一个比值',
    } },
    { term: 'SS-TWR', plain: {
      en: 'single-sided two-way ranging: one question, one answer',
      zh: '单边双向测距：一问一答',
    } },
    { term: 'Coffs', plain: {
      en: 'the clock offset a receiver measured for the radio it is hearing',
      zh: '接收端对自己正在听的那台射频测出的时钟偏差',
    } },
  ],
  picture: [
    { heading: { en: 'Four anchors, one distance', zh: '四个锚点，一个距离' }, text: {
      en: 'Put a phone in the middle of a lab and four anchors on a ring around it, every one the same distance away and at the same height. The phone asks once and all four hear it; then they answer one at a time, each in its own slot. One question, four measurements of one distance.',
      zh: '把一部手机放在实验室正中，四个锚点摆在它周围的一个圆环上，每个锚点离它一样远、也一样高。手机只问一次，四个锚点都听见了；随后它们逐一作答，各占一个时隙。一次提问，换来对同一个距离的四次测量。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'What does it think the distance is?', zh: '它以为这段距离是多少？' }, text: {
      en: 'Load the simulation and jump to the first range line. The phone is three and a half metres from that anchor; read what it believes instead, then read the three lines under it.',
      zh: '载入仿真，跳到第一条测距行。手机离那个锚点三米半，而它自己以为是多少？读一读，再往下读接着的三行。',
    } },
    { heading: { en: 'A crystal nobody ever set', zh: '一块从没被校准过的晶体' }, text: {
      en: 'Each radio counts time on its own crystal, and no crystal runs at exactly its stated rate — the error is quoted in ppm. This phone runs a little fast, every anchor a little slow, and neither knows it. Each end still subtracts two readings of its own counter, so the unknown starting point cancels. The rate does not cancel.',
      zh: '每台射频都用自己那块晶体数时间，而没有哪块晶体真的走在标称速率上——这点误差用 ppm 来说。这里的手机走得偏快，每个锚点都走得偏慢，而且谁也不知道。两端减的依然是自己计数器上的两次读数，未知的起点因此被约掉；速率却没有被约掉。',
    } },
    { heading: { en: 'The wait is the problem, not the flight', zh: '出问题的是等待，不是飞行' }, text: {
      en: 'The phone times a round trip on its own clock; the anchor times its reply on its own and sends that number over to be subtracted. Both are stretched, and the subtraction cancels most of the stretch. What is left is half the reply times the difference between the two rates. The flight is billionths of a second, the reply a whole slot of waiting: an error invisible on one is metres on the other.',
      zh: '手机用自己的钟量一次往返；锚点用自己的钟量自己的作答时长，再把这个数发过来让手机减掉。两个数都被拉长了，一减之下大部分拉长量互相抵消。剩下的是应答时长的一半乘以两端速率之差。而飞行时间是几十亿分之一秒，应答时长却是整整一个时隙的等待：同一个误差落在前者上看不见，落在后者上就是好几米。',
    } },
    { heading: { en: 'Wait longer, lie further', zh: '等得越久，谎话越大' }, text: {
      en: 'That is why the scene has four anchors and not one. The anchor in the first slot waits one slot before answering, the anchor in the fourth waits four, and the leftover error is proportional to the wait. Four identical distances come back as a ramp. Uncorrected, SS-TWR measures how long the responder waited, not how far away it is.',
      zh: '这就是场景里要摆四个锚点而不是一个的原因。第一个时隙里的锚点等一个时隙才作答，第四个要等四个，而剩下的那点误差与等待时长成正比。四个一模一样的距离，读出来却是一道斜坡。不作修正的话，SS-TWR 量的不是距离有多远，而是应答方等了多久。',
    } },
    { heading: { en: 'Ask the receiver how fast the other clock runs', zh: '问接收端：对面那只钟走得多快' }, text: {
      en: 'A receiver cannot find the RMARKER until it has locked onto the incoming pulses, and the loop that locks knows, as a by-product, how fast those pulses arrive against its own crystal. That ratio is the clock offset, measured rather than assumed, and the simulator carries it on every received frame as Coffs. Scale the reply by it and the near-cancellation becomes real.',
      zh: '接收端必须先锁住进来的脉冲，才谈得上找到 RMARKER；而完成这次锁定的环路顺带就知道：这些脉冲相对自己那块晶体跑得有多快。这个比值就是时钟偏差——是测出来的，不是假定的；仿真器把它挂在每个收到的帧上，叫作 Coffs。拿它去缩放应答时长，那次"几乎抵消"就成了真的抵消。',
    } },
    { heading: { en: 'What the correction leaves behind', zh: '修正之后还剩下什么' }, text: {
      en: 'Coffs is itself a measurement, so a little of it is wrong. The correction turns a large rate error into a tiny one, but the leftover is still half the reply times that tiny error — so it still grows with the waiting. The next lesson gets rid of the wait by arithmetic instead.',
      zh: 'Coffs 自己也是测出来的，因此本身就带着一点误差。修正把一个大的速率误差换成了一个很小的，但残下来的那一项依旧是应答时长的一半乘以这个小误差，所以它还是随等待时长一起变大。下一课改用算术把这段等待直接消掉。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'What the raw estimate really contains', zh: 'raw 估计里真正装着什么' }, text: {
      en: 'T̂prop = (Tround·(1 + eA) − Treply·(1 + eB)) / 2\n       = Tprop + Tprop·eA + ½·Treply·(eA − eB)',
      zh: 'T̂prop = (Tround·(1 + eA) − Treply·(1 + eB)) / 2\n       = Tprop + Tprop·eA + ½·Treply·(eA − eB)',
    }, note: {
      en: 'eA is the initiator’s rate error, eB the responder’s. The reply almost cancels between the two measurements, and two terms survive. The first scales the flight: micrometres. The second scales the wait — half of a 2 ms reply at 20 ppm is 20 ns, or 6.0 m.',
      zh: 'eA 是发起方的速率误差，eB 是应答方的。两次测量一减，应答时长几乎被抵消，但有两项活了下来。第一项缩放飞行时间，只有几十微米。第二项缩放等待：2 ms 的应答取一半再乘 20 ppm，就是 20 ns，合 6.0 m。',
    } },
    { kind: 'table', heading: { en: 'Four anchors, four errors', zh: '四个锚点，四个误差' }, head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'Treply', zh: 'Treply' }, { en: 'Predicted error', zh: '预测误差' },
      { en: 'Raw range', zh: 'raw 距离' }, { en: 'Raw error', zh: 'raw 误差' },
    ], rows: [
      [N('anchor-1'), N('2 ms − Tprop'), N('6.0 m'), N('9.51 m'), N('6.01 m')],
      [N('anchor-2'), N('4 ms − Tprop'), N('12.0 m'), N('15.47 m'), N('11.97 m')],
      [N('anchor-3'), N('6 ms − Tprop'), N('18.0 m'), N('21.49 m'), N('17.99 m')],
      [N('anchor-4'), N('8 ms − Tprop'), N('24.0 m'), N('27.42 m'), N('23.92 m')],
    ] },
    { text: {
      en: 'Not scatter: four readings of one distance, all long, each a multiple of the first. The phone sits 3.50 m from every anchor and believes it is 9.51 m from one and 27.42 m from another.',
      zh: '这不是散布：对同一个距离的四次读数全都偏长，且每一个都是第一个的整数倍。手机距每个锚点都是 3.50 m，却认定自己离其中一个有 9.51 m、离另一个有 27.42 m。',
    } },
    { kind: 'table', heading: { en: 'The same ramp, three pairs of crystals', zh: '同一道斜坡，三种晶体' }, head: [
      { en: 'Crystals', zh: '晶体' }, { en: 'eA − eB', zh: 'eA − eB' },
      { en: 'Raw error, slot 1', zh: '时隙 1 的 raw 误差' }, { en: 'Raw error, slot 4', zh: '时隙 4 的 raw 误差' },
    ], rows: [
      [{ en: 'Perfect crystals', zh: '理想晶振' }, N('0 ppm'), N('+1.9 cm'), N('−6.1 cm')],
      [{ en: 'Temperature-compensated, ±1 ppm', zh: '温补晶振，±1 ppm' }, N('2 ppm'), N('0.62 m'), N('2.34 m')],
      [{ en: 'This scene, ±10 ppm', zh: '本场景，±10 ppm' }, N('20 ppm'), N('6.01 m'), N('23.92 m')],
    ] },
    { kind: 'formula', heading: { en: 'Single-sided two-way ranging, corrected', zh: '经过修正的单边双向测距' }, text: {
      en: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2',
      zh: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2',
    }, note: {
      en: 'One multiplication. Treply arrived measured in the anchor’s ticks; scaling it re-expresses it in the phone’s, the unit Tround was already in. The four range lines now read 3.45, 3.42, 3.41 and 3.51 m, on a ring built at one distance. Nothing about the radio changed.',
      zh: '只多了一次乘法。Treply 送来时是按锚点的计数单位量的；缩放一下，就把它换算成手机的单位，也就是 Tround 本来所用的单位。圆环上四个距离本是一样的，而四条测距行现在读作 3.45、3.42、3.41 与 3.51 m。射频本身什么都没有变。',
    } },
    { kind: 'table', heading: { en: 'What the correction leaves', zh: '修正之后留下的' }, head: [
      { en: 'Anchor', zh: '锚点' }, { en: 'Reply', zh: '应答时长' },
      { en: 'Leftover, 1-σ', zh: '残差 1σ' }, { en: 'Error this run', zh: '本次运行的误差' },
    ], rows: [
      [N('anchor-1'), N('2 ms'), N('6.0 cm'), N('−5.3 cm')],
      [N('anchor-2'), N('4 ms'), N('12.0 cm'), N('−7.8 cm')],
      [N('anchor-3'), N('6 ms'), N('18.0 cm'), N('−9.5 cm')],
      [N('anchor-4'), N('8 ms'), N('24.0 cm'), N('+0.5 cm')],
    ] },
    { text: {
      en: 'The last column is one draw from those distributions, which is why it does not grow: the widest of them landed nearest the truth.',
      zh: '最后一列只是从这些分布里各抽了一次，所以它并不一路变大：最宽的那个分布这次恰好落得离真值最近。',
    } },
  ],
  deeper: [
    { heading: { en: 'The two terms that survive', zh: '活下来的那两项' }, text: {
      en: 'Substitute Tround = Treply + 2·Tprop into the raw formula and the reply cancels down to the two terms above. Tprop·eA scales an 11.675 ns flight by 10 ppm: 0.12 picoseconds, 35 micrometres — forget it. The other scales a reply that, at 2 ms, is about a hundred and seventy thousand times the flight. Nothing about the geometry distinguishes the four anchors; only the waiting does.',
      zh: '把 Tround = Treply + 2·Tprop 代进 raw 公式，应答时长就抵消到只剩上面那两项。Tprop·eA 是拿 10 ppm 去缩放 11.675 ns 的飞行时间：0.12 皮秒，合 35 微米，可以直接忘掉。另一项缩放的是应答时长，而 2 ms 的应答时长大约是飞行时间的十七万倍。四个锚点在几何上毫无分别，区别只在等了多久。',
    } },
    { heading: { en: 'The number the phone subtracts', zh: '手机减掉的那个数' }, text: {
      en: 'Anchor 1 stamps two ranging counters, 26 381 597 885 and 26 509 391 059. Their difference, 127 793 174 RCTU, is exactly the reply time its response carries — computed on the anchor’s own clock, which is the whole trouble. The phone’s own pair differs from it by 4056 ticks.',
      zh: '锚点 1 打出两个测距计数值：26 381 597 885 与 26 509 391 059。两者之差 127 793 174 RCTU，正是它的应答帧所携带的应答时长——这个数是在锚点自己的钟上算出来的，麻烦正出在这里。手机自己那一对读数与它相差 4056 格。',
    } },
    { heading: { en: 'How big the leftover is', zh: '残差有多大' }, text: {
      en: 'The correction turns 20 ppm of raw offset into 0.2 ppm of estimator noise. Half of 0.2 ppm of a millisecond is 0.1 ns, so the leftover is 3.0 cm for every millisecond the anchor waited. Anchor 3’s −9.5 cm is well inside its own 18.0 cm sigma.',
      zh: '修正把 20 ppm 的原始偏差换成了估计器上 0.2 ppm 的噪声。1 ms 的 0.2 ppm 取一半是 0.1 ns，于是锚点每多等 1 ms，残差就多 3.0 cm。锚点 3 的 −9.5 cm 稳稳落在它自己 18.0 cm 的 σ 之内。',
    } },
    { heading: { en: 'The byte that says how much to trust it', zh: '用来说明"这有多可信"的那个字节' }, text: {
      en: 'Every UWB_TS line for a received frame ends in "(97 % within 0.5 ns)". That is the Figure of Merit byte, 0x16 here: three bits of confidence level (6 → 97 %), two of interval (2 → 1 ns) and two of scale (0 → ×0.5). A half-nanosecond window is ±0.25 ns, about 7.5 cm of one-way flight. It travels with the measurement so a position solver can weight a confident range above a doubtful one — and it says nothing about the crystals: a timestamp of exactly this confidence produced the 27.42 m reading.',
      zh: '每一条描述接收帧的 UWB_TS 行末尾都跟着 "(97 % within 0.5 ns)"。那是品质因数字节，此处为 0x16：3 位置信水平（6 → 97 %）、2 位区间（2 → 1 ns）、2 位比例因子（0 → ×0.5）。半纳秒宽的区间就是 ±0.25 ns，约合 7.5 cm 的单向飞行距离。它随测量结果一起传递，好让定位解算器给可信的距离更高的权重；而它对晶体只字未提：上面那个 27.42 m 的读数，正出自一个置信度恰好如此的时间戳。',
    } },
  ],
  sources: [
    { en: 'IEEE Std 802.15.4-2024 §10.29.1.2.2 gives the single-sided two-way ranging computation; §10.29.1.6 defines the ranging tracking offset and ranging tracking interval, the fields with which a receiver reports the transmitter’s clock rate as it measured it. The ±20 ppm crystal tolerance is §16.4.9.',
      zh: 'IEEE Std 802.15.4-2024 的 §10.29.1.2.2 给出单边双向测距的计算式；§10.29.1.6 定义了测距跟踪偏差与测距跟踪区间——接收端就是用这两个字段上报自己测到的发送端时钟速率。±20 ppm 的晶振容差来自 §16.4.9。' },
    { en: 'The Figure of Merit byte under "Going deeper" and its three lookup tables are §10.29.1.7.',
      zh: '"再深一层"里的品质因数字节及其三张查找表出自 §10.29.1.7。' },
    { en: 'Three numbers are the simulator’s own model choices: 100 ps of 1-σ noise on every received timestamp, 0.2 ppm of residual error in the clock-offset estimate, and the 2 ms ranging slot, which is FiRa’s rather than the standard’s.',
      zh: '有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及 2 ms 的测距时隙——最后这个来自 FiRa，不是标准正文。' },
  ],
  scenario: () => uwbSstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: { en: 'Perfect crystals', zh: '理想晶振' }, scenario: () => uwbSstwrScenario({ tag: 0, anchors: 0 }) },
    { label: { en: 'Temperature-compensated, ±1 ppm', zh: '±1 ppm 的温补晶振' }, scenario: () => uwbSstwrScenario({ tag: 1, anchors: -1 }) },
  ],
  jumps: [
    J('the poll leaves the phone', 'Poll 帧离开手机', firstUwbPoll),
    J('the first anchor answers', '第一个锚点作答', firstUwbResp),
    J('the first range: raw is 6 m long', '第一次测距：raw 长了 6 m', firstUwbRange),
    J('the fourth range: raw is 24 m long', '第四次测距：raw 长了 24 m', fourthUwbRange),
  ],
  observe: [
    { en: 'One poll at 0 ns produces four RX_START records, all at 12 ns: the anchors are equally far. The round spends five slots of 2 ms.', zh: '0 ns 处的一帧 Poll 产生四条 RX_START，全都在 12 ns：四个锚点一样远。整轮花掉五个 2 ms 的时隙。' },
    { en: 'Read the four UWB_RANGE lines in order. The corrected figures stay between 3.41 and 3.51 m, while the raw figure in brackets climbs 9.51 → 15.47 → 21.49 → 27.42 m.', zh: '按顺序读四条 UWB_RANGE。修正后的读数落在 3.41 与 3.51 m 之间，括号里的 raw 值却一路爬升：9.51 → 15.47 → 21.49 → 27.42 m。' },
    { en: 'Take the differences of consecutive raw values: 5.96, 6.02, 5.93 m. Every extra slot of waiting costs six more metres — a bias, not scatter.', zh: '把相邻的 raw 值相减：5.96、6.02、5.93 m。每多等一个时隙就多付六米——这是偏差，不是散布。' },
  ],
  tryThis: [
    { en: 'Load "Perfect crystals", which pins both ends to zero and changes nothing else. The ramp vanishes: the raw errors are centimetres either way, and the slot no longer matters. What is left is timestamp noise, whose 1-σ is 2.1 cm.', zh: '载入"理想晶振"：它把两端都钉在零，别的什么都不改。斜坡随即消失——raw 误差只剩正负几厘米，作答的时隙也不再要紧。剩下的只有时间戳噪声，它的 1σ 是 2.1 cm。' },
    { en: 'Now load "Temperature-compensated, ±1 ppm", a tenth of the base offset and the sort of part a careful product really fits. The ramp survives at about 0.60 m a slot: better crystals buy an order of magnitude, not correctness.', zh: '再载入"±1 ppm 的温补晶振"：偏差只有基准的十分之一，也是认真的产品真会选用的器件。斜坡依然在，每个时隙约 0.60 m：更好的晶体买来的是一个数量级，不是正确性。' },
  ],
  quiz: [
    {
      q: { en: 'Anchor 1 and anchor 4 are equally far. Why is anchor 4’s raw error four times anchor 1’s?', zh: '锚点 1 与锚点 4 一样远。为什么锚点 4 的 raw 误差是锚点 1 的四倍？' },
      options: [
        { en: 'Its response is weaker after three more slots of fading', zh: '又过了三个时隙，衰落让它的应答更弱' },
        { en: 'The surviving error is half the reply times the rate difference, and its reply is four times longer', zh: '活下来的误差是应答时长的一半乘以速率之差，而它的应答时长长了四倍' },
        { en: 'Its counter has had four times as long to drift', zh: '它的计数器有四倍的时间可以漂移' },
      ],
      answer: 1,
      explain: { en: 'Not drift in a counter but a scale error on one interval: the same rate difference on a longer interval is a larger error.', zh: '这不是计数器里的漂移，而是加在一段被测时间上的比例误差：同样的速率之差乘以更长的时间，误差更大。' },
    },
    {
      q: { en: 'Where does the value of Coffs come from?', zh: 'Coffs 这个值是从哪里来的？' },
      options: [
        { en: 'From the anchor’s datasheet, exchanged when the session opens', zh: '来自锚点的数据手册，在会话建立时交换' },
        { en: 'From the receiver’s own lock on the incoming pulses, against its own crystal', zh: '来自接收端对进来的脉冲的锁定，拿自己的晶体比出来' },
        { en: 'From the difference between the round trip and the reply', zh: '由往返时间与应答时间之差得到' },
      ],
      answer: 1,
      explain: { en: 'The ratio is a by-product of a lock the receiver had to acquire anyway. Deriving it from that difference would be circular: the difference is the answer sought.', zh: '这个比值是接收端无论如何都要完成的那次锁定的副产品。若想从那个差值推出它就成了循环：那个差正是我们要求的答案。' },
    },
    {
      q: { en: 'After the correction, anchor 4’s range is the most accurate. Is slot 4 the best place to answer from?', zh: '修正之后，锚点 4 的距离反而最准。在时隙 4 作答是不是最好？' },
      options: [
        { en: 'Yes — the longer reply gives the receiver more time to average', zh: '是——更长的应答时延让接收端有更多时间去平均' },
        { en: 'No — slot 4 has the widest leftover, 24.0 cm of 1-σ against anchor 1’s 6.0 cm', zh: '否——时隙 4 的残差最宽，1σ 为 24.0 cm，而锚点 1 只有 6.0 cm' },
        { en: 'No — it is real, but it comes from anchor 4’s position', zh: '否——精度是真实的，但它来自锚点 4 所在的位置' },
      ],
      answer: 1,
      explain: { en: 'The leftover grows with the reply as the raw error did, and a sample from a wide distribution can land anywhere — including nearer the truth than a narrow one’s.', zh: '残差像 raw 误差一样随应答时长增长；而从宽分布里抽样落在哪儿都有可能，包括比窄分布的样本更靠近真值。' },
    },
  ],
}
