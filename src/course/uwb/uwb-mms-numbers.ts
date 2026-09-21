/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Fragments, budgets and the 12 dB.
 *
 * The second half of the old `uwb-mms`: the arithmetic under the picture next
 * door. One millisecond's energy allowance and what a fragment spends of it;
 * what X fragments add up to; the three decibels between four fragments and
 * eight, which in this room are the difference between a fix every block and
 * nothing at all; the millisecond-long ruler a train is, which measures the two
 * crystals against each other well enough that single-sided ranging needs no
 * second round trip; and the honest share of the 19.57 dB a train beats a 4z
 * Poll by in this room — 9.03 of it, the rest being a transmitter that never
 * spends its budget.
 *
 * It loads exactly the scene `uwb-mms` loads — the same builder, the same three
 * variants — so the split adds no new scenario and the recorded hashes of
 * `uwb-mms-numbers` are `uwb-mms`'s, value for value.
 *
 * Every number quoted below is pinned in tests/course/uwb-mms-numbers.test.ts.
 */
import {
  J, N, firstNbReport, firstUwbRange, firstUwbRsf, firstUwbTrain, type Lesson,
} from '../lessonKit'
import { uwbMmsScenario } from './uwb-mms'

export const uwbMmsNumbers: Lesson = {
  id: 'uwb-mms-numbers',
  module: 15,
  title: { en: 'Fragments, budgets and the 12 dB', zh: '片段、预算，和那 12 dB' },
  why: {
    en: 'A train of fragments either clears the receiver or it does not, and what decides it is arithmetic you could do on the back of an envelope. This lesson does that arithmetic: what one millisecond of energy is worth, what a fragment spends of it, what a train of them adds up to — and how much of the improvement is really the new idea rather than an old transmitter being wasteful.',
    zh: '一串片段要么越过了接收机的门限，要么没有，而决定这件事的，是一笔在信封背面就能算完的算术。这一课就来算它：一毫秒的能量值多少，一个片段花掉其中多少，一串片段加起来是多少——以及这份改善里，有多少真正属于那个新想法，又有多少只是因为老式发射机浪费惯了。',
  },
  outcomes: [
    { en: 'work out what a train of fragments adds up to, and whether it clears the receiver', zh: '算出一串片段加起来是多少，以及它有没有越过接收机门限' },
    { en: 'say why halving a train kills every range in the room', zh: '说清为什么把一串片段砍掉一半，整个房间就一次测距也没有了' },
    { en: 'separate the part of the gain that is the idea from the part that is transmit power', zh: '把增益里属于“想法”的那部分，与属于发射功率的那部分分开' },
  ],
  needs: ['uwb-mms'],
  terms: [
    { term: 'combining gain', plain: {
      en: 'how much louder a whole train is than one of its fragments, once the receiver has added them',
      zh: '接收机把一串片段加起来之后，整串比其中一个片段响了多少',
    } },
    { term: 'clock ratio', plain: {
      en: 'how fast one device’s crystal runs against another’s, as a number of parts per million',
      zh: '一台设备的晶振相对另一台跑得有多快，用百万分之几表示',
    } },
    { term: 'parameter set', plain: {
      en: 'a named, ready-made choice of fragment length and train length that both ends can name in one word',
      zh: '一组起好名字的现成取值：片段多长、一串多少个，两端用一个名字就能说定',
    } },
  ],
  picture: [
    { heading: { en: 'An allowance, not a ceiling', zh: '是额度，不是天花板' }, text: {
      en: 'The rule the transmitter lives under is an average taken over each millisecond, which makes it an energy allowance rather than a power ceiling. How you spend it inside the millisecond is yours: pour it into a short burst and the burst is louder, spread it over a long frame and the frame is quieter. Same energy, different loudness.',
      zh: '发射机头上的那条规矩，是在每一毫秒上取的平均，所以它是一份能量额度，而不是一条功率红线。这一毫秒之内怎么花，由你决定。把它倒进一小段突发里，这段突发就更响；摊在一帧长帧上，这帧就更轻。能量一样多，响度却不同。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Watch the sum be done', zh: '看那笔加法被算出来' }, text: {
      en: 'Load the simulation and jump to the verdict on the first train. The line does the sum out loud: how many fragments were heard, how loud each was, what the combining gain added, what is left over as margin, and — only once that margin is positive — the clock ratio.',
      zh: '载入仿真，跳到对第一串片段的判定。那一行把整笔加法念了出来：收到几个片段、每个多响、合成增益加了多少、余下多少作为余量，以及——只有余量为正时才有的——那个时钟比值。',
    } },
    { heading: { en: 'Adding up in decibels', zh: '用分贝相加' }, text: {
      en: 'Fragments of equal power add the way equal things do: twice as many is twice as much, which in decibels is three more. Four fragments are six decibels above one, eight are nine, sixteen are twelve. The margin is simply what is left after the receiver’s own threshold is taken off the sum, and a positive margin is a detection.',
      zh: '等功率的片段，按等量相加的规矩累加：数量翻倍，累加量也翻倍，换成分贝就是多三个。四个片段比一个高六分贝，八个高九分贝，十六个高十二分贝。而余量，不过是把接收机自己的门限从这个和里减掉以后剩下的东西；余量为正，就算检出。',
    } },
    { heading: { en: 'Three decibels between working and dead', zh: '能用与报废之间的三个分贝' }, text: {
      en: 'Halve the train and nothing else in the room changes. Every fragment is as loud as before and every one is still heard; only the sum is smaller, by those three decibels, and it lands under the threshold instead of over it. Three anchors that ranged every block now range not at all, and every round ends in a timeout.',
      zh: '把一串砍成一半，房间里别的什么都没变。每个片段和先前一样响，而且一个不落地都收到了；变小的只有那个和，正好小三个分贝，于是它落到了门限之下。三个原本每块都测距的锚点，如今一次也测不出，每一轮都以超时收场。',
    } },
    { heading: { en: 'A ruler a millisecond long', zh: '一把一毫秒长的尺子' }, text: {
      en: 'The train is also a measuring stick. Its fragments leave exactly a millisecond apart on the sender’s clock, so timing that span on your own counter compares the two crystals directly — a clock ratio, measured over the whole train rather than one frame. That is what lets a single-sided exchange here skip the second round trip.',
      zh: '这一串片段同时也是一把尺子。它的各个片段在发送方的时钟上正好每隔一毫秒发出，于是用你自己的计数器量这段跨度，就是在直接比较两块晶振——这就是时钟比值，而且是在整串上量的，不是在一帧上。也正因为如此，这里的单边交互可以不做第二次往返。',
    } },
    { heading: { en: 'Being honest about the gain', zh: '对增益要诚实' }, text: {
      en: 'Set a train against an ordinary ranging frame here and the train wins by a lot — but not all of that is the new idea. Part of it is that a fragment is shorter, so the same energy is louder. A bigger part is that the ordinary transmitter never spends its allowance. Only the combining gain is what many milliseconds bought.',
      zh: '在这里把一串片段和一帧普通的测距帧放在一起比，片段这一串赢得很多——但赢的并不全是那个新想法。其中一部分，是因为片段更短，同样的能量因此更响。更大的一部分，是那台普通发射机压根没把额度花掉。真正由“许多毫秒”买来的，只有合成增益。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'What one millisecond is worth', zh: '一毫秒值多少' }, text: {
      en: '−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm      −14.3 dBm for 1 ms = 37 nJ',
      zh: '−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm      −14.3 dBm 持续 1 ms = 37 nJ',
    }, note: {
      en: 'A mean power over a millisecond, spread across the channel, is an energy: 37 nJ, to spend as you like. The ordinary ranging transmitter does not choose: it holds one power whatever it sends.',
      zh: '按毫秒平均的功率，摊在整条信道上，就是一份能量：37 nJ，随你怎么花。普通的测距发射机并不做选择：不管发什么，它都保持同一个功率。',
    } },
    { kind: 'table', heading: { en: 'What a fragment is, and what it costs', zh: '一个片段是什么，花掉多少' }, head: [
      { en: 'Item', zh: '项' }, { en: 'Value', zh: '取值' },
    ], rows: [
      [{ en: 'A millisecond’s energy', zh: '一毫秒的能量' }, N('37 nJ')],
      [{ en: 'An ordinary poll', zh: '一帧普通 poll' }, N('36 octets, 203.782 µs, 8.11 nJ')],
      [{ en: 'One fragment', zh: '一个片段' }, N('40 × 4 × (128 + 2 × 64) = 40 960 chips, 82.051 µs, −3.46 dBm')],
      [{ en: 'The same, in set rsf-1', zh: '同一件事，在 rsf-1 里' }, N('62.179 µs, −2.25 dBm, +1.20 dB')],
      [{ en: 'What the receiver needs', zh: '接收机需要的门限' }, N('−93 dBm')],
    ] },
    { kind: 'formula', heading: { en: 'What a train adds up to', zh: '一串加起来是多少' }, text: {
      en: 'gain = 10·log10(X)      margin = rx + gain − (−93 dBm)',
      zh: 'gain = 10·log10(X)      margin = rx + gain − (−93 dBm)',
    }, note: {
      en: 'The table below is that sum done three times. Every fragment in this room arrives under the threshold on its own, so the whole margin is the train’s doing.',
      zh: '下面那张表就是这笔加法算了三遍。这个房间里每个片段单独到达时都低于门限，所以整份余量都是这一串挣来的。',
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
    { text: {
      en: 'Read the first two rows against each other: the same fragments at the same level, all heard, and a verdict that flips on 3.01 dB of arithmetic — costing the run all 21 of its ranges.',
      zh: '把前两行对着读：同样的片段、同样的电平、一个不落地都收到了，而判定在 3.01 dB 的算术上翻了面——代价是整段运行的 21 次测距全部落空。',
    } },
    { kind: 'formula', heading: { en: 'The ruler, in figures', zh: '把那把尺子换成数字' }, text: {
      en: 'ratio = span_measured / ((j − i) × 1 ms)      σ_ratio = √2 · σ_ts / ((j − i) ms)',
      zh: 'ratio = 实测跨度 / ((j − i) × 1 ms)      σ_ratio = √2 · σ_ts / ((j − i) ms)',
    }, note: {
      en: 'Over the 7 ms from a train’s first fragment to its eighth, 100 ps stamps give σ_ratio = 0.0202 ppm — and the crystals here are set rather than drawn, so there is a truth to check it against.',
      zh: '从一串的第一个片段到第八个是 7 ms，100 ps 的时间戳给出 σ_ratio = 0.0202 ppm——而这里的晶振是设定的、不是抽样的，所以有真值可以对照着查。',
    } },
    { kind: 'table', heading: { en: 'The ratio, on a 0.5 ms reply', zh: '这个比值，作用在 0.5 ms 的回复上' }, head: [
      { en: 'Correction', zh: '修正方式' }, { en: 'What it leaves', zh: '留下多少' },
    ], rows: [
      [{ en: 'Round 0 measures, against a true 40 / 20 / 10 ppm', zh: '第 0 轮量得，真值为 40 / 20 / 10 ppm' },
        N('39.970, 19.992, 9.967 ppm')],
      [{ en: 'Uncorrected, 40 ppm apart', zh: '不修正，相差 40 ppm' }, N('3.00 m')],
      [{ en: 'A crystal at its limit', zh: '晶振偏到极限' }, N('1.5 m')],
      [{ en: 'A 4z carrier estimate', zh: '4z 的载波估计' }, N('1.5 cm')],
      [{ en: 'The train’s 0.0202 ppm', zh: '这一串的 0.0202 ppm' }, N('1.5 mm')],
      [{ en: 'The noise floor under all of them', zh: '它们脚下的噪声地板' }, N('2.05 cm over 21 ranges')],
    ] },
    { text: {
      en: 'The last row is the point: two receive stamps alone are worth 2.1 cm, so the train’s millimetre of clock leftover is invisible.',
      zh: '最后一行才是重点：光是两个接收时间戳就值 2.1 cm，所以这一串留下的那一毫米时钟残差根本看不见。',
    } },
    { kind: 'table', heading: { en: 'Where the 19.57 dB comes from', zh: '那 19.57 dB 从哪来' }, head: [
      { en: 'Part', zh: '组成' }, { en: 'Size', zh: '大小' },
    ], rows: [
      [{ en: 'Combining eight fragments', zh: '八个片段的合成' }, N('9.03 dB')],
      [{ en: 'A fragment is shorter', zh: '片段更短' }, N('3.95 dB')],
      [{ en: 'A budget never spent', zh: '从没花完的预算' }, N('6.59 dB')],
      [{ en: 'Poll and train, on arrival', zh: 'poll 与整串到达时' }, N('−110.80 dBm, −91.23 dBm')],
    ] },
    { text: {
      en: 'Two of those are about transmitters, not ideas: together 10.54 dB, and an older burst-mode radio could hold −7.41 dBm and be as legal. The honest claim is the 9.03 dB.',
      zh: '其中两项谈的是发射机，不是想法：合起来 10.54 dB，而老式的突发发射机本可保持 −7.41 dBm，一样合规。诚实的说法是那 9.03 dB。',
    } },
  ],
  deeper: [
    { heading: { en: 'What a bigger parameter set costs', zh: '更大的参数集要付什么' }, text: {
      en: 'Set rsf-1 is one of the seventeen mandatory sets: X = 16 with the same 40 repetitions but a gap of 33 zeros instead of 64, so the fragment shortens from 82.051 µs to 62.179 and the same millisecond’s energy is 1.20 dB louder inside it. Twelve decibels of combining plus that 1.20 takes the margin from +1.8 dB to +6.0. It is not free: the ranging phase grows from 20 slots to 32, the round from 14 ms to 20, and three rounds from 42 ms of the block to 60 ms.',
      zh: '参数集 rsf-1 是十七个强制参数集之一：X = 16，重复次数仍是 40，但间隔是 33 个零而不是 64，于是片段从 82.051 µs 缩到 62.179 µs，同样一毫秒的能量装进去就响了 1.20 dB。十二个分贝的合成再加这 1.20，把余量从 +1.8 dB 抬到 +6.0。代价也有：测距阶段从 20 个时隙涨到 32 个，一轮从 14 ms 涨到 20 ms，三轮从块里的 42 ms 涨到 60 ms。',
    } },
    { heading: { en: 'The same line, two trains', zh: '同一行字，两串片段' }, text: {
      en: 'The verdict line is the whole sum, so the two runs differ in one term of it. At eight fragments: “anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm”. At four: “anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost”. Same level, same completeness, three decibels apart — and the second line has no ratio at all, because a train that was never detected was never measured either.',
      zh: '判定那一行本身就是整笔加法，所以两次运行只差其中一项。八个片段时：“anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.995 ppm”。四个片段时：“anchor-1 RSF train ← tag-1: 4/4 heard, -100.3 dBm + 6.0 dB = margin -1.2 dB → lost”。电平一样、收得一样全，只差三个分贝——而后一行连比值都没有，因为一串从未被检出的片段，也就从未被测量过。',
    } },
    { heading: { en: 'Why the ordinary radio fails completely, not slightly', zh: '为什么普通射频是彻底失败，而不是稍差一点' }, text: {
      en: 'Run the same room with ordinary single-sided two-way ranging and there is not one range in 1.3 seconds: 42 timeouts, half of them anchors waiting for a poll they never heard and half of them the tag waiting out response slots. The poll arrives at −110.80 dBm, nearly eighteen decibels under the receiver, and nothing in that mode accumulates. A radio either detects a frame or it does not; there is no partial credit to build on.',
      zh: '在同一个房间里跑普通的单边双向测距，1.3 秒内一次测距也没有：42 次超时，一半是锚点在等一帧它们从没听见的 poll，另一半是标签把响应时隙等空。那帧 poll 到达时是 −110.80 dBm，比接收机低了将近十八个分贝，而那个模式里没有任何东西会累加。一台射频要么检出一帧，要么检不出；没有可供叠加的“半分”。',
    } },
    { heading: { en: 'Why the ratio is measured over the train, not over a frame', zh: '为什么比值量在整串上，而不是量在一帧上' }, text: {
      en: 'σ_ratio falls as the span grows: two stamps 100 ps noisy, taken 7 ms apart, give 0.0202 ppm, where the same two stamps taken across a single 82 µs fragment would give about 1.7 ppm — worse than the crystal they are trying to measure. The train is long precisely where a frame is short, which is why a mode built for reach also happens to be the one that measures clocks best.',
      zh: 'σ_ratio 随跨度变大而变小：两个带 100 ps 噪声的时间戳，相隔 7 ms 取得，给出 0.0202 ppm；而同样两个时间戳若取在一个 82 µs 的片段两端，大约是 1.7 ppm——比它想测的那块晶振还差。一串片段恰好长在帧短的地方，所以一个为“够得着”而生的模式，顺带也成了最会测时钟的那个。',
    } },
  ],
  sources: [
    { en: 'One number here is regulation: the −41.3 dBm/MHz mean EIRP averaged over a millisecond, which is what makes the budget a budget. The units, the block and its slots are IEEE Std 802.15.4-2024.',
      zh: '本课只有一个数字来自法规：按毫秒平均的 −41.3 dBm/MHz 平均等效全向辐射功率，正是它把这件事变成一份预算。单位、块与时隙则出自 IEEE Std 802.15.4-2024。' },
    { en: 'The multi-millisecond packet, its fragments and the parameter sets come from P802.15.4ab, at D5.0 in Sponsor-ballot recirculation. The draft is members-only, so this paraphrases four TG4ab contributions: 15-22/0381r5 (the ranging cycle), 15-23/0100r2 (fragments and the narrowband PHY), 15-23/0502r3 (parameter sets) and 15-22/0205r0 (the energy budget). The balloted draft may differ.',
      zh: '多毫秒分组、它的片段以及那些参数集，都来自 P802.15.4ab：它处于 Sponsor 投票再循环阶段，版本为 D5.0。该草案仅对会员开放，所以这里改写自 TG4ab 的四篇提案文稿：15-22/0381r5（测距周期）、15-23/0100r2（片段与窄带 PHY）、15-23/0502r3（参数集）与 15-22/0205r0（能量预算）。已投票的草案可能与此不同。' },
    { en: 'The rest is the simulator’s model: a fragment’s power from the millisecond budget, the 10·log10(X) combining rule, a −93 dBm receiver, this room’s path loss and its 2.0 ns of excess delay per brick wall, and the 100 ps timestamp noise σ_ratio is evaluated at. The ±20 ppm a crystal is allowed is the standard’s, in §16.4.9.',
      zh: '其余都是仿真器的模型取值：片段功率由那份毫秒预算算出、10·log10(X) 的合成规则、−93 dBm 的接收机、这个房间的路径损耗与每道砖墙 2.0 ns 的额外时延，以及代入 σ_ratio 的 100 ps 时间戳噪声。而晶振允许的 ±20 ppm 是标准的，见 §16.4.9。' },
  ],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: { en: 'Four fragments', zh: '四个片段' }, scenario: () => uwbMmsScenario('four') },
    { label: { en: 'Set rsf-1', zh: '参数集 rsf-1' }, scenario: () => uwbMmsScenario('rsf1') },
    { label: { en: '4z for comparison', zh: '拿 4z 作对照' }, scenario: () => uwbMmsScenario('twr') },
  ],
  jumps: [
    J('the first fragment of the first train', '第一串片段里的第一个', firstUwbRsf),
    J('what the far end made of that train', '对端如何判定这一串片段', firstUwbTrain),
    J('the narrowband report that closes the round', '收尾的那帧窄带 REPORT', firstNbReport),
    J('the range the two of them produce', '两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [
    { en: 'The verdict line does the whole sum out loud: how many fragments were heard out of how many, the level of one of them, the gain, the margin, the verdict — and, once the margin is positive, the clock ratio, which the two ends report with opposite signs.',
      zh: '判定那一行把整笔加法念了出来：一共几个、收到几个、其中一个多响、增益多少、余量多少、结论如何——而余量为正之后，还会带上时钟比值，两端报出的符号正好相反。' },
    { en: 'The range line prints two distances where other modes print one: the corrected range, and the raw range it would have been if the clock ratio had never been measured. In this room the gap between them is metres.',
      zh: '测距那一行印出两个距离，而别的模式只印一个：修正后的距离，以及若从未量过时钟比值时它本会是的那个原始距离。在这个房间里，两者之间差着好几米。' },
  ],
  tryThis: [
    { en: 'Load “Four fragments”. Nothing on the air changes — every train is still heard in full, at the same level — but the sum now falls a decibel short, every pair times out waiting for a report, and the run ends with no range and no fix at all.',
      zh: '载入“四个片段”。空口上什么也没变——每一串仍被完整收到，电平也照旧——但那个和如今差了一个分贝，每一对都在等报告中超时，整段运行一次测距、一次定位也没有。' },
    { en: 'Then load “Set rsf-1”: twice as many fragments, each of them shorter and so a little louder, and a margin several decibels wider. Watch the cost in the timeline — the ranging phase, the round and the block’s three rounds all grow.',
      zh: '再载入“参数集 rsf-1”：片段数量翻倍，每个更短、因而略响一点，余量宽了好几个分贝。到时间线上看代价——测距阶段、一整轮，以及块里那三轮，全都变长了。' },
  ],
  quiz: [
    {
      q: { en: 'At four fragments nothing ranges and at eight everything does. What changed on the air?', zh: '四个片段时什么也测不出来，八个时全都测得出来。空口上究竟变了什么？' },
      options: [
        { en: 'The fragments are quieter at four', zh: '四个时片段更轻' },
        { en: 'Nothing — the same fragments at the same level, all heard. Only what they add up to differs, 6.02 dB against 9.03', zh: '什么也没变——同样的片段、同样的电平，而且全都收到了。不同的只是加起来是多少：6.02 dB 对 9.03 dB' },
        { en: 'At four the receiver is never primed to listen', zh: '四个时接收机根本没就绪' },
      ],
      answer: 1,
      explain: { en: 'Each fragment spends its own millisecond’s allowance, so its power does not depend on how many follow it.', zh: '每个片段花的是它自己那一毫秒的额度，所以它的功率与后面还有几个无关。' },
    },
    {
      q: { en: 'A train of eight beats an ordinary poll by 19.57 dB here. How much of that is the multi-millisecond idea?', zh: '在这里，八个片段的一串比一帧普通 poll 好 19.57 dB。其中有多少属于“多毫秒”这个想法？' },
      options: [
        { en: 'All of it', zh: '全部' },
        { en: '9.03 dB; the other 10.54 is transmit power — a shorter fragment, and a transmitter that spends 8.11 nJ of its 37', zh: '9.03 dB；另外 10.54 dB 是发射功率——片段更短，加上一台在 37 nJ 里只花掉 8.11 nJ 的发射机' },
        { en: '12.04 dB, the largest combining gain in the table', zh: '12.04 dB，表里最大的那个合成增益' },
      ],
      answer: 1,
      explain: { en: 'Only the combining gain comes from spending eight milliseconds instead of one; the rest compares two transmitters.', zh: '只有合成增益来自“花掉八个毫秒而不是一个”；其余比较的是两台发射机。' },
    },
    {
      q: { en: 'Single-sided ranging usually needs a second round trip or a very good crystal. Why neither here?', zh: '单边测距通常要么再做一次往返，要么靠一块很好的晶振。这里为什么两样都不要？' },
      options: [
        { en: 'The narrowband radio estimates the offset better', zh: '窄带射频把偏差估得更准' },
        { en: 'The fragments are a millisecond apart on the sender’s clock, so the train compares the two crystals over 7 ms', zh: '片段在发送方时钟上相隔一毫秒，于是整串用 7 ms 的跨度比较了两块晶振' },
        { en: 'The report carries the responder’s crystal offset', zh: '报告里带着响应方的晶振偏差' },
      ],
      answer: 1,
      explain: { en: 'That span gives 1.5 mm on a half-millisecond reply — far under the 2.1 cm two receive stamps already cost.', zh: '这段跨度在半毫秒的回复上只留下 1.5 mm——远小于两个接收时间戳本身就要花掉的 2.1 cm。' },
    },
  ],
}
