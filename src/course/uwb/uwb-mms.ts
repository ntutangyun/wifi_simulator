/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Sixteen milliseconds of energy.
 *
 * The first lesson of the 802.15.4ab tier, and the first that is mostly draft
 * rather than standard. Its room is built so that one 4z frame cannot cross it:
 * a 22 m hall cut into three bays by two full-height brick partitions, three
 * anchors in the first bay and one tag in the third, 13 m and 24 dB away. Every
 * fragment of every train lands at −100.26 dBm, seven decibels under the
 * receiver's own sensitivity, and nothing but the train rescues it.
 *
 * The centrepiece is the three decibels between four fragments and eight. The
 * fragments do not change — same power, same room, all of them heard — and only
 * what they add up to moves: 6.02 dB of combining gives a margin of −1.24 dB and
 * no range at all, 9.03 dB gives +1.77 dB and a fix every block. The second half
 * is the honesty: of the 19.57 dB a train beats a 4z Poll by in this room, only
 * 9.03 is the multi-millisecond idea, and the lesson says so.
 * Every number quoted below is pinned in tests/course/uwb-mms.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import { mmsSet } from '../../uwb/mms'
import {
  J, N, anchor, firstNbPoll, firstNbReport, firstUwbRange, firstUwbRsf, firstUwbTrain,
  twoWallLab, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/**
 * Which scene the lesson runs: the draft's own ranging-cycle default (X = 8), the same cycle
 * with half the train, one of the mandatory parameter sets (X = 16 on a shorter fragment), or
 * ordinary 4z two-way ranging in the same room.
 */
export type UwbMmsVariant = 'base' | 'four' | 'rsf1' | 'twr'

/**
 * The three anchors, all in the first bay of the hall and all behind both brick partitions
 * from the tag. They are placed so that the three of them are as nearly equidistant as the bay
 * allows — 13.04, 13.04 and 12.76 m — because the lesson's whole subject is one threshold: at
 * X = 4 every one of the three has to fail, and at X = 8 every one has to succeed. An anchor
 * in the middle of the bay would be 8.58 m away, three and a half decibels louder, and would
 * range on four fragments while the other two ranged on none.
 *
 * Each crystal is set rather than drawn, so the ratio the trains measure has a known truth to
 * be checked against: the tag at +20 ppm and the anchors at −20, 0 and +10 give ratios of 40,
 * 20 and 10 ppm at the tag.
 */
export const MMS_ANCHORS: { id: string; name: string; x: number; y: number; ppm: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5, ppm: -20 },
  { id: 'anchor-2', name: 'Anchor 2', x: 0.5, y: 7.5, ppm: 0 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.3, y: 4.0, ppm: 10 },
]
/** Anchors on the ceiling, the tag at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** The tag, in the third bay: 12.5 m and two brick walls from the nearest anchor. */
export const TAG_POS = { x: 13.0, y: 4.0, ppm: 20 }

/**
 * Three anchors and one tag on an MMS session, on the 600 RSTU (0.5 ms) slot the draft's
 * §1.1.1 asks for and the simulator's own 200 ms block. `report: 'responder'` puts the range
 * on the tag's lane, where the block fix needs it; `nbChannels: [3]` is the draft's default
 * control channel, in UNII-3, where there is no Wi-Fi in this room to share with and listen
 * before talk is not required. NLOS is on, and the two brick walls charge for it.
 */
export function uwbMmsScenario(variant: UwbMmsVariant = 'base'): Scenario {
  const phy = variant === 'four' ? { rsfs: 4 as const } : variant === 'rsf1' ? mmsSet('rsf-1') : {}
  return uwbSc(
    twoWallLab(),
    [
      ...MMS_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z, a.ppm)),
      uwbTag('tag-1', 'Tag', TAG_POS.x, TAG_POS.y, TAG_Z, TAG_POS.ppm),
    ],
    variant === 'twr'
      ? { mode: 'twr', method: 'ss', slotRstu: 600, aoa: false, nlos: true }
      : {
        mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true,
        mms: { ...DEFAULT_UWB_SESSION.mms, ...phy, nbChannels: [3], report: 'responder' },
      },
  )
}

export const uwbMms: Lesson = {
  id: 'uwb-mms',
  module: 15,
  title: { en: 'Sixteen milliseconds of energy', zh: '十六毫秒的能量' },
  body: [
    { text: {
      en: 'Almost nothing here is IEEE Std 802.15.4-2024. The units are: RSTU, RCTU, the block and its slots. But the multi-millisecond packet, and everything that turns a Clause 12 O-QPSK radio into a control radio for UWB, come from P802.15.4ab, at D5.0 in Sponsor-ballot recirculation. That draft is members-only, so this paraphrases four TG4ab contributions: 15-22/0381r5 (cycle), 15-23/0100r2 (fragments, narrowband PHY), 15-23/0502r3 (parameter sets), 15-22/0205r0 (budget). The balloted draft may differ. One number is regulation, the −41.3 dBm/MHz mean EIRP averaged over a millisecond, and the rest is model: a fragment’s power, the combining rule, this room’s path loss.',
      zh: '本课几乎没有一处出自 IEEE Std 802.15.4-2024。单位是标准的：RSTU、RCTU、块与时隙。但多毫秒分组，以及把一部第 12 章的 O-QPSK 电台变成 UWB 控制电台的一切，都来自 P802.15.4ab：截至 2026 年 9 月，它仍处于 Sponsor 投票再循环阶段，版本为 D5.0。该草案文本仅对会员开放，所以这里都改写自 TG4ab 的四篇提案文稿：15-22/0381r5（测距周期）、15-23/0100r2（片段与窄带 PHY）、15-23/0502r3（参数集）以及 15-22/0205r0（能量预算）。已投票的草案可能与之不同。只有一个数字来自法规，即按毫秒平均的 −41.3 dBm/MHz 平均 EIRP，其余都是模型：片段的功率、合成规则、这个房间的路径损耗。',
    } },
    { heading: { en: 'Thirty-seven nanojoules a millisecond', zh: '每毫秒三十七纳焦' }, text: {
      en: '−41.3 dBm/MHz over 499.2 MHz is −14.3 dBm, and −14.3 dBm for a millisecond is 37 nJ: an energy budget, not a power ceiling. How you spend it inside the millisecond is yours; the simulator’s 4z transmitter does not choose — it holds −14 dBm whatever it sends, so the tag’s Poll to three anchors (36 octets, 203.782 µs) spends 8.11 nJ and throws the other 29 away.',
      zh: '−41.3 dBm/MHz 乘 499.2 MHz 是 −14.3 dBm，而 −14.3 dBm 持续一毫秒就是 37 nJ：这是能量预算，不是功率红线。这一毫秒之内怎么花由你决定，而仿真器里那台 4z 发射机并不做选择——不管发什么都保持 −14 dBm，于是标签那帧发往三个锚点的 Poll（36 字节、203.782 µs）只花掉 8.11 nJ，剩下的 29 nJ 扔掉了。',
    } },
    { heading: { en: 'One fragment', zh: '一个片段' }, text: {
      en: 'An MMS ranging packet is a train of fragments, one per millisecond, carrying no preamble, no SFD, no PHY header and no data — only a ranging sequence: N_MSR = 40 repetitions of an MMRS symbol with a gap of 64 zeros, spread by four. 40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs; a millisecond’s 37 nJ inside it is −3.46 dBm. With no preamble to search for there is no SHR offset: the timestamp is the first pulse of the first fragment.',
      zh: 'MMS 的测距“分组”是一串片段，每毫秒一个。片段里没有前导、没有 SFD、没有 PHY 头，也没有数据——只有一段测距序列：把一个 MMRS 符号重复 N_MSR = 40 次，该符号带 64 个零的间隔，再按 4 倍扩展。40 × 4 × (128 + 2 × 64) = 40 960 个码片，82.051 µs；把一毫秒的 37 nJ 装进去就是 −3.46 dBm。既然没有前导要搜索，也就没有 SHR 偏移：测距时间戳就是第一个片段的第一个脉冲。',
    } },
    { heading: { en: 'A room one 4z frame cannot cross', zh: '一个 4z 帧过不去的房间' }, text: {
      en: 'Fragments are one millisecond apart, and the narrowband exchange has told the receiver the train’s shape, so it accumulates blind and counts at the end: X fragments of equal power combine to 10·log10(X) dB, detected once that clears −93 dBm. The hall is 22 × 8 m, cut into three bays by full-height brick partitions at x = 5 and x = 10. Three anchors stand in the first bay at 2.20 m, all about equally far from the tag at (13.00, 4.00) in the third: 13.04, 13.04 and 12.76 m through 24 dB of brick. Every fragment arrives at −100.26 dBm, or −100.07 from the near anchor: seven decibels under the receiver.',
      zh: '片段彼此相距一毫秒，而窄带交互已经告诉接收机这一串的形状，所以它盲目地累加，到结束时再数：X 个等功率片段合成为 10·log10(X) dB，越过 −93 dBm 就算检出。大厅 22 × 8 m，被 x = 5 与 x = 10 处两道通顶砖墙切成三个隔间。三个锚点立在第一个隔间里，高 2.20 m，到标签的距离大致相同；标签在第三个隔间的 (13.00, 4.00)：13.04、13.04 与 12.76 m，中间隔着 24 dB 的砖墙。每个片段到达时是 −100.26 dBm，近处那个锚点是 −100.07 dBm：比接收机低七个分贝。',
    } },
    { kind: 'table', heading: { en: 'Three trains in the same room', zh: '同一个房间里的三种序列' }, head: [
      { en: 'Train', zh: '序列' }, { en: 'Per fragment', zh: '每个片段' },
      { en: 'Gain', zh: '增益' }, { en: 'Margin', zh: '余量' }, { en: 'Verdict', zh: '结果' },
    ], rows: [
      [N('4 × 82.051 µs'), N('−100.26 / −100.07 dBm'), N('+6.02 dB'), N('−1.24 / −1.05 dB'),
        { en: 'lost', zh: '丢失' }],
      [N('8 × 82.051 µs'), N('−100.26 / −100.07 dBm'), N('+9.03 dB'), N('+1.77 / +1.96 dB'),
        { en: 'detected', zh: '检出' }],
      [N('16 × 62.179 µs'), N('−99.05 / −98.86 dBm'), N('+12.04 dB'), N('+5.99 / +6.18 dB'),
        { en: 'detected', zh: '检出' }],
    ] },
    { heading: { en: 'What the narrowband radio carries', zh: '窄带电台负责运什么' }, text: {
      en: 'The UWB side only measures. Everything else rides Clause 12’s 250 kb/s O-QPSK radio in 5725–5850 and 5925–6425 MHz — here channel 3, 5733.75 MHz. The initiator opens with a POLL of 12 octets and 576 µs, the responder answers with a RESP of the same size, and only then is either side primed to listen. After the twenty-slot ranging phase, in slot 24, the responder’s REPORT of 13 octets and 608 µs carries the reply time. Those three are 1.760 ms of the round’s 3.073 ms of air; all sixteen fragments are 1.313 ms.',
      zh: 'UWB 一侧只负责测量。其余一切都跑在标准第 12 章那部 250 kb/s O-QPSK 电台上，频段为 5725–5850 与 5925–6425 MHz——这里是 3 号信道，中心 5733.75 MHz。发起方用一帧 12 字节、576 µs 的 POLL 开场；响应方用同样大小的 RESP 作答，而只有到这时两边才算就绪，才会去听片段。二十个时隙的测距阶段结束后，在第 24 个时隙，响应方那帧 13 字节、608 µs 的 REPORT 捎上回复时间。这三条消息占 1.760 ms，而整轮空口时间是 3.073 ms；十六个片段加起来才 1.313 ms。',
    } },
    { kind: 'formula', heading: { en: 'A ruler a millisecond long', zh: '一把一毫秒长的尺子' }, text: {
      en: 'ratio = span_measured / ((j − i) × 1 ms)\nσ_ratio = √2 · σ_ts / ((j − i) ms)',
      zh: 'ratio = 实测跨度 / ((j − i) × 1 ms)\nσ_ratio = √2 · σ_ts / ((j − i) ms)',
    }, note: {
      en: 'Two fragments are exactly one millisecond apart on the sender’s clock, so measuring that span on your own counter measures the two crystals against each other. Over the 7 ms from the first fragment to the eighth, 100 ps stamps give σ_ratio = 0.0202 ppm. The tag is set to +20 ppm and the anchors to −20, 0 and +10, so the true ratios at the tag are 40, 20 and 10 ppm; round 0 measures 39.970, 19.992 and 9.967. The responder uses that ratio; the initiator inverts it.',
      zh: '同一串里的两个片段在发送方时钟上正好相隔一毫秒，把这段跨度量在自己的计数器上，就量出了两块晶振的相对快慢。从第一个片段到第八个是 7 ms，100 ps 的时间戳给出 σ_ratio = 0.0202 ppm。标签的晶振设为 +20 ppm，三个锚点为 −20、0 与 +10，所以标签处的真实比值是 40、20 与 10 ppm；第 0 轮量得 39.970、19.992 与 9.967。响应方直接用这个比值，发起方则取倒数。',
    } },
    { heading: { en: 'Three metres, and fifteen millimetres', zh: '三米，和十五毫米' }, text: {
      en: 'The clock error enters multiplied by half the reply time, one slot: 0.5 ms. Tag and anchor 1 are 40 ppm apart, so uncorrected that is ½ × 0.5 ms × 40 ppm × c = 3.00 m, and the log prints both: “range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)”. One crystal at the ±20 ppm of §16.4.9 would be 1.5 m of it; the carrier estimate 4z falls back on leaves 1.5 cm at 0.2 ppm; the train’s 0.0202 ppm leaves 1.5 mm. All three are arithmetic from the constants, not measurements; what the run measures is the floor under them: two receive stamps are c·σ_ts/√2 = 2.1 cm, and over 21 ranges the error about this room’s bias has an RMS of 2.05 cm. So the 1.5 mm is invisible, and no double-sided exchange is needed.',
      zh: '单边测距会把时钟误差乘上回复时间的一半，也就是一个时隙，0.5 ms。标签与 anchor-1 相差 40 ppm，不修正就是 ½ × 0.5 ms × 40 ppm × c = 3.00 m——日志把两个数一起印了出来：“range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)”。若只有一块晶振偏到 §16.4.9 允许的 ±20 ppm，那是其中的 1.5 m；4z 退而用的载波估计，以 0.2 ppm 的残差留下 1.5 cm；而序列给出的 0.0202 ppm 只留下 1.5 mm。这三级台阶都是由常数算出来的，不是量出来的；运行量到的是它们脚下的那块地板：光是两个接收时间戳就值 c·σ_ts/√2 = 2.1 cm，而 21 次测距扣掉这房间自带的偏差后，误差均方根是 2.05 cm。所以这 1.5 mm 看不见，也用不着双边交互。',
    } },
    { heading: { en: 'Where the gain actually comes from', zh: '增益究竟从哪里来' }, text: {
      en: 'The tag’s 4z Poll reaches anchor 1 at −110.80 dBm; its eight-fragment train arrives at an effective −91.23: 19.57 dB better. Only 9.03 dB of that is the multi-millisecond idea. Another 3.95 dB is that a fragment is shorter than a Poll — 82.051 µs against 203.782 — so the same energy is louder; and 6.59 dB is that this 4z transmitter never spends its budget, holding −14 dBm where a burst-mode one could hold −7.41 dBm and be as legal. The honest claim is the 9 dB.',
      zh: '标签那帧 4z Poll 到达 anchor-1 时是 −110.80 dBm；它那八个片段的序列合成后等效为 −91.23 dBm，好了 19.57 dB。其中只有 9.03 dB 属于“多毫秒”这个想法。另有 3.95 dB 来自片段比 Poll 短——82.051 µs 对 203.782 µs——同样的能量在更短的时间里更响；还有 6.59 dB，只是因为这台 4z 发射机从不把预算花完：它保持 −14 dBm，而突发式的发射机可以保持 −7.41 dBm，一样合规。诚实的说法是那 9 dB。',
    } },
    { heading: { en: 'What the walls charge anyway', zh: '墙照样要收费' }, text: {
      en: 'Every range is long by the same amount: 14.26 m against a true 13.04. Brick adds 2 ns of excess delay to a first path, the ray crosses two walls each way, and a two-way range keeps what a time difference would cancel: 4 ns, 1.199 m, every round. The figure of merit says “75 % within 12 ns”, the NLOS byte, and the block’s fix inherits the bias: (14.22, 4.05) m against a true (13.00, 4.00), GDOP 2.93, ellipse 6.1 × 1.3 cm — which knows only the noise. Reach is not accuracy, and with Y = 0 there is no integrity flag.',
      zh: '每一次测距都偏长，而且长得一样多：14.26 m 对真值 13.04 m。这个模型里砖墙给首径添 2 ns 额外时延，射线来回各穿两道墙，而双向测距会保留时间差本可抵消的那一部分：4 ns、1.199 m，每一轮都有。品质因子写着 “75 % within 12 ns”，那是 NLOS 的字节；整块的定位也继承了这份偏差，落在 (14.22, 4.05) m，真值 (13.00, 4.00)，GDOP 2.93，椭圆 6.1 × 1.3 cm——而椭圆只知道噪声。合成换来的是距离，距离不等于精度；Y = 0，也没有完整性标志。',
    } },
  ],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: { en: 'Four fragments', zh: '四个片段' }, scenario: () => uwbMmsScenario('four') },
    { label: { en: 'Set rsf-1', zh: '参数集 rsf-1' }, scenario: () => uwbMmsScenario('rsf1') },
    { label: { en: '4z for comparison', zh: '拿 4z 作对照' }, scenario: () => uwbMmsScenario('twr') },
  ],
  jumps: [
    J('the narrowband poll that opens the round', '打开轮次的那帧窄带 POLL', firstNbPoll),
    J('the first fragment of the first train', '第一串片段里的第一个', firstUwbRsf),
    J('what the far end made of that train', '对端如何判定这一串片段', firstUwbTrain),
    J('the narrowband report that closes it', '收尾的那帧窄带 REPORT', firstNbReport),
    J('the range the two of them produce', '两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [
    { en: 'At t = 0 the tag opens a pair round — “tag-1 UWB round 0 of block 0 (MMS): 28 slots × 500.0 µs” — and the first thing on the air is not UWB: “tag-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)”. Anchor 1 answers at 1.000 ms. One round holds one anchor: anchor 2’s opens at 14 ms, anchor 3’s at 28.',
      zh: 't = 0 处标签打开一个配对轮次——“tag-1 UWB round 0 of block 0 (MMS): 28 slots × 500.0 µs”——而空口上最先出现的并不是 UWB：“tag-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)”。anchor-1 在 1.000 ms 处作答。一个轮次只装一个锚点：anchor-2 的轮次在 14 ms 处开始，anchor-3 的在 28 ms 处。' },
    { en: 'At 2.000 ms: “tag-1 TX RMARKER → anchor-1 RSF: counter 336330610684”, then “tag-1 → anchor-1 UWBRSF 0 B @0 Mbps (82.1 µs)” — zero octets, no data rate: a fragment carries nothing. Anchor 1’s follows half a millisecond later; the two trains interleave for sixteen slots. One transmit RMARKER per train, not one per fragment.',
      zh: '2.000 ms 处：“tag-1 TX RMARKER → anchor-1 RSF: counter 336330610684”，接着是 “tag-1 → anchor-1 UWBRSF 0 B @0 Mbps (82.1 µs)”——零字节、没有速率：片段里什么也不装。anchor-1 自己的第一个片段在半毫秒后跟上，两串片段交错了十六个时隙。每串只有一个发送 RMARKER，而不是每个片段一个。' },
    { en: 'At 9.500 ms, the slot after the tag’s last fragment, anchor 1 rules: “anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm”, and only then a receive stamp: “anchor-1 RX RMARKER ← tag-1 RSF: counter 26504711136 (75 % within 12 ns)”. The tag rules at 10.000 ms, the ratio the other way up: 39.970 ppm.',
      zh: '9.500 ms 处，也就是标签最后一个片段之后的那个时隙，anchor-1 给出判定：“anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm”，接收时间戳直到这时才出现：“anchor-1 RX RMARKER ← tag-1 RSF: counter 26504711136 (75 % within 12 ns)”。标签自己的判定在 10.000 ms 处，比值是反过来的：39.970 ppm。' },
    { en: 'At 12.000 ms “anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)”, and at 12.608 ms “tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)”. After seven blocks the tag’s inspector reads 8 × RSF, 8 / 8, +1.8 dB, detected (+2.0 dB for the near anchor); channel “3 · 5733.75 MHz”; fix (14.22, 4.05) m, error 122.4 cm, GDOP 2.93, ellipse 6.1 × 1.3 cm.',
      zh: '12.000 ms 处是 “anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)”，12.608 ms 处是 “tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)”。七个块之后打开标签的检视面板：两个远处锚点是 8 × RSF、8 / 8、+1.8 dB、检出，近处那个是 +2.0 dB；窄带信道一行是 “3 · 5733.75 MHz”；定位 (14.22, 4.05) m，误差 122.4 cm，GDOP 2.93，椭圆 6.1 × 1.3 cm。' },
  ],
  tryThis: [
    { en: 'Load “Four fragments”. Nothing changes on the air — every train still heard in full, 4/4, at −100.3 dBm — but four combine to 6.0 dB instead of 9.0: “anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost”. Each anchor loses the tag’s train, and the tag all three of theirs. No RMARKER, no reply time, no report: 21 timeouts, one per pair round — “tag-1 UWB slot 24: no nb-report from anchor-1”, then anchor-2, then anchor-3. Not one range in 1.3 seconds — three decibels between a working system and a dead one.',
      zh: '载入“四个片段”。空口上什么也没变——每一串仍被完整收到，4/4，仍是 −100.3 dBm——但四个合成的是 6.0 dB 而不是 9.0：“anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost”。每个锚点都丢了标签那一串，标签也把三串全丢了。没有 RMARKER 就没有回复时间，也就没有报告：21 次超时，每个配对轮次一次——“tag-1 UWB slot 24: no nb-report from anchor-1”，然后是 anchor-2、anchor-3。1.3 秒里一次测距、一次定位都没有——能用与报废之间只隔着三个分贝。' },
    { en: 'Now “Set rsf-1”, one of the seventeen mandatory sets: X = 16, N_MSR 40 with a gap of 33 zeros instead of 64, so the fragment is 62.179 µs instead of 82.051. Twelve decibels of combining instead of nine, plus 1.20 dB for the shorter fragment: the margin goes from +1.8 to +6.0 dB. Not free — the ranging phase grows from 20 slots to 32, the round from 14 ms to 20, three rounds from 42 ms of the block to 60 ms. Then “4z for comparison”: the same room, ordinary SS-TWR — 42 timeouts, not one range.',
      zh: '再载入“参数集 rsf-1”，它是十七个强制参数集之一：X = 16，N_MSR 仍是 40，但间隔是 33 个零而不是 64，于是片段从 82.051 µs 缩到 62.179 µs。合成增益从九个分贝变成十二个，短片段又多出 1.20 dB 功率：余量从 +1.8 dB 涨到 +6.0 dB。代价也有——测距阶段从 20 个时隙涨到 32 个，轮次从 14 ms 涨到 20 ms，三个轮次占块里的 60 ms 而不是 42 ms。再载入“拿 4z 作对照”：同样的房间，改用普通 SS-TWR——42 次超时，一次测距也没有。' },
  ],
  quiz: [
    {
      q: { en: 'At X = 4 nothing ranges and at X = 8 everything does. What changed on the air?', zh: 'X = 4 时什么也测不出来，X = 8 时全都测得出来。空口上究竟变了什么？' },
      options: [
        { en: 'The fragments are quieter at X = 4', zh: 'X = 4 时片段更轻' },
        { en: 'Nothing — the same fragments at the same −100.3 dBm, all heard. Only what they add up to differs, 6.0 dB against 9.0', zh: '什么也没变——同样的片段、同样的 −100.3 dBm，而且全都收到了。不同的只是它们加起来是多少：6.0 dB 对 9.0 dB' },
        { en: 'At X = 4 the receiver is never primed', zh: 'X = 4 时接收机根本没就绪' },
      ],
      answer: 1,
      explain: { en: 'Each fragment spends its own millisecond’s budget, so its power does not depend on how many follow: −100.26 dBm in both scenes. Four combine to −94.24, eight to −91.23.', zh: '每个片段花的是自己那一毫秒的预算，功率与后面还有几个无关：两个场景里远处锚点都是 −100.26 dBm。四个合成为 −94.24，八个为 −91.23。' },
    },
    {
      q: { en: 'A train of eight beats a 4z Poll by 19.6 dB in this room. How much of that is the multi-millisecond idea?', zh: '在这个房间里，八个片段的序列比一帧 4z Poll 好 19.6 dB。其中有多少来自“多毫秒”这个想法？' },
      options: [
        { en: 'All of it', zh: '全部' },
        { en: '9.03 dB; the other 10.54 is transmit power — 3.95 dB because a fragment is shorter than a Poll, 6.59 dB because this 4z transmitter spends 8.11 nJ of its 37', zh: '9.03 dB；另外 10.54 dB 是发射功率——3.95 dB 因为片段比 Poll 短，6.59 dB 因为这台 4z 发射机在 37 nJ 里只花了 8.11 nJ' },
        { en: '12.04 dB, the model’s largest combining gain', zh: '12.04 dB，模型允许的最大合成增益' },
      ],
      answer: 1,
      explain: { en: '10·log10(8) = 9.03 dB is the only part that comes from spending eight milliseconds instead of one; the rest compares two transmitters.', zh: '10·log10(8) = 9.03 dB 才是“花八个毫秒而不是一个”带来的部分。其余比较的是两台发射机，而不是两个想法。' },
    },
    {
      q: { en: 'Single-sided ranging usually needs a double-sided exchange or a very good crystal. Why neither here?', zh: '单边测距通常要么做双边交互，要么靠一块很好的晶振。这个模式为什么两样都不需要？' },
      options: [
        { en: 'The narrowband radio estimates the carrier offset better', zh: '窄带电台估计载波偏差的本事更强' },
        { en: 'The fragments are exactly a millisecond apart on the sender’s clock: the receiver measures the two crystals against each other over 7 ms', zh: '片段在发送方时钟上正好相隔一毫秒：接收机用 7 ms 的跨度量出两块晶振的相对快慢' },
        { en: 'The REPORT carries the responder’s crystal offset', zh: 'REPORT 里带着响应方的晶振偏差' },
      ],
      answer: 1,
      explain: { en: 'σ_ratio is 0.0202 ppm over the train’s 7 ms, and half the 0.5 ms reply turns it into 1.5 mm — against 1.5 cm from the carrier estimate and 3.00 m uncorrected.', zh: '整串 7 ms 的跨度给出 σ_ratio = 0.0202 ppm，乘上 0.5 ms 回复时间的一半就是 1.5 mm——而载波估计对应 1.5 cm，不修正则是 3.00 m。' },
    },
  ],
}
