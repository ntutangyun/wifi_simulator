/**
 * UWB Tier 1 · M11 · Time of flight · A radio that measures time.
 *
 * The first lesson of the UWB track, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): why a radio
 * would measure time at all, then the four timestamps of one ranging round, and
 * only then the exact values. The frame's own anatomy — SYNC, SFD, STS, PHR,
 * PSDU and where the RMARKER falls — is the next lesson, `uwb-frame`, which
 * loads this same scene.
 *
 * One anchor and one phone, five metres apart on a line, both crystals nailed
 * to 0 ppm, single-sided two-way ranging: the smallest scene in which a
 * distance falls out of four numbers. No AP, no stations, no Wi-Fi traffic at
 * all — the scenario is nothing but a ranging session, so every record in the
 * timeline belongs to it. Every number quoted below is pinned in
 * tests/course/uwb-intro.test.ts.
 *
 * As the first lesson of its track this one is held to 1000 main-path words,
 * not 1300, with `why` + `outcomes` + `terms` + `picture` ≤ 650, `numbers`
 * ≤ 350 and `observe` + `tryThis` + `quiz` ≤ 400
 * (tests/course/readability.test.ts; `npx tsx scripts/lesson-dump.ts uwb-intro
 * en` prints the four counts). Depth that will not fit belongs in `deeper`,
 * provenance in `sources`; neither is counted.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, firstUwbPoll, firstUwbRange, firstUwbResp, firstUwbRxTs, rangingLab, uwbSc, uwbTag,
  type Lesson,
} from '../lessonKit'

/** The lab: one anchor, one phone, exactly dM metres apart at the same height. */
export function uwbIntroScenario(dM: 5 | 20): Scenario {
  return uwbSc(rangingLab(), [
    anchor('anchor-1', 'Anchor 1', 1, 4, 2.2, 0),
    uwbTag('tag-1', 'Phone', 1 + dM, 4, 2.2, 0),
  ], { method: 'ss', nlos: false })
}

export const uwbIntro: Lesson = {
  id: 'uwb-intro',
  module: 11,
  title: { en: 'A radio that measures time', zh: '一台测量时间的射频' },
  why: {
    en: 'Your phone can already tell you how far it is from a Wi-Fi router, roughly, from how loud the router sounds. Roughly is the problem: a wall or a hand costs more signal than ten metres of air. Ultra-wideband asks a different question — not how loud the signal is, but when it arrived, and light is a very reliable clock. This lesson shows the smallest possible measurement: one anchor, one phone, four timestamps, one distance.',
    zh: '手机其实早就能估出自己离路由器有多远——靠的是信号听上去有多响。问题就出在这个"估"字上：一堵墙、一只挡住天线的手，吃掉的信号比十米空气还多。超宽带问的是另一个问题：不问信号有多响，只问它是什么时候到的，而光速是一把非常可靠的尺子。这一课做的是一次最小的测量：一个锚点、一部手机、四个时间戳，换来一个距离。',
  },
  outcomes: [
    { en: 'read the four timestamps of a ranging round off the event log', zh: '从事件日志里读出一轮测距的四个时间戳' },
    { en: 'say why the phone measures a round trip and the anchor a reply time', zh: '说清为什么手机量的是往返时间，锚点量的是作答时间' },
    { en: 'explain why a few centimetres of error is not a bug', zh: '解释为什么差几厘米并不是程序出了毛病' },
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'UWB', plain: {
      en: 'ultra-wideband: very short pulses over a very wide band, so the moment one arrives is sharp',
      zh: '超宽带：把极短的脉冲铺在极宽的频段上，所以脉冲到达的那一刻格外分明',
    } },
    { term: 'anchor', plain: {
      en: 'a UWB radio fixed to the building; the phone measures against it',
      zh: '固定在建筑物上的 UWB 射频，是手机测距时的参照物',
    } },
    { term: 'RMARKER', plain: {
      en: 'the one instant inside a frame both radios agree to timestamp',
      zh: '一帧之内、收发两端约定共同打时间戳的那一个瞬间',
    } },
    { term: 'RCTU', plain: {
      en: 'one tick of the ranging clock; tens of thousands fit in a microsecond',
      zh: '测距时钟的一格；一微秒里装得下好几万格',
    } },
  ],
  picture: [
    // "Loud is not the same as near" stood here until the step-1 fix wave: it said again,
    // at length, what `why` opens with — that a distance built on loudness inherits every
    // obstacle in the room — and a track's first lesson is held to 1000 words.
    { heading: { en: 'Clicks instead of tones', zh: '发出的是嗒，不是嗡' }, text: {
      en: 'Most radios hold a tone steady for a long moment, and a receiver asked when that tone started can only be vague. A UWB radio does the opposite: it sends chips, pulses so short each is over almost before it began. A sharp edge gives a sharp answer, good to a fraction of a nanosecond.',
      zh: '大多数射频会把一个音调稳稳地保持很长一段；你问接收端这个音调是从哪一刻开始的，它只能给个大概。UWB 正相反：它发出的是码片——短到几乎刚开始就已经结束的脉冲。边沿越陡，答案越利落，能答到零点几纳秒。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'One question, one answer', zh: '一问，一答' }, text: {
      en: 'Load the simulation and press play. The phone (`tag-1` in the log — a tag is whatever is being located) sends a poll, the frame that opens a round, and the anchor answers. Zoom in until the tiny gap between the lanes shows: that gap is the air.',
      zh: '把仿真载入，按下播放。手机（日志里叫它 tag-1：被定位的那一端就叫标签）发出一帧 Poll，也就是开启一轮测距的那一帧，锚点随后作答。把时间线一直放大，直到你能看见两条泳道之间那道极窄的缝隙：那道缝隙就是它们之间的空气。',
    } },
    { text: {
      en: 'Neither radio stamps when its frame began or ended. Both stamp the same landmark inside it — the RMARKER, one agreed instant a little way into every ranging frame. The phone notes when it sent the poll and when the answer returned; the anchor notes the mirror image. Four numbers, and the round is done.',
      zh: '两端都不去记自己这一帧的开头或结尾，它们记的是帧里同一个地标——RMARKER，在每一帧测距帧内部稍靠前一点、双方事先约定好要一起打时间戳的那个瞬间。手机记下自己何时发出 Poll、何时收到回答；锚点记的两笔正好反过来。四个数字，一轮就结束了。',
    } },
    { heading: { en: 'Two clocks that do not agree', zh: '两只对不上的钟' }, text: {
      en: 'The phone and the anchor count on their own crystals, and nobody aligns the two. It does not matter: each subtracts two of its own readings, so the unknown starting points cancel. The phone is left with a round trip, the anchor with a reply; the difference is two flights.',
      zh: '手机和锚点各用各的晶振数时间，从来没有人去把这两只钟对齐。但这不要紧：每台设备减的都只是自己的两次读数，未知的起点因此被约掉。手机手里剩下一个往返时间，锚点手里剩下一个作答时间。把作答时间从往返时间里扣掉，剩下的就是两趟空中飞行。',
    } },
    { heading: { en: 'How wrong is a few centimetres', zh: '差几厘米，算差吗' }, text: {
      en: 'Every timestamp is a little noisy: the moment a pulse crosses the detection threshold is uncertain, and the clock counts whole ticks. Two of the four readings are receptions, so the answer carries two doses. The log’s distance lands a few centimetres either side of the truth — the radio working, not failing.',
      zh: '每一个时间戳都带着一点噪声：脉冲越过判决门限的确切时刻本身就不确定，而时钟只能一格一格地数。四次读数里有两次是接收，所以答案里带着两份这样的噪声。日志报出的距离会落在真值两侧几厘米的范围里。这是这台射频在正常工作，不是出了毛病。',
    } },
    { kind: 'watch', jump: 3, text: {
      en: 'Jump to the line where the range falls out: three numbers, and the rest of this lesson is the gaps between them.',
      zh: '跳到算出距离的那一行：一行三个数，而这一课余下的部分讲的就是它们之间的差。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'Single-sided two-way ranging (SS-TWR)', zh: '单边双向测距（SS-TWR）' }, text: {
      en: 'T̂prop = (Tround − Treply) / 2',
      zh: 'T̂prop = (Tround − Treply) / 2',
    }, note: {
      en: 'Tround is one subtraction on the phone’s clock, from the RMARKER it sent to the RMARKER it received; Treply is the mirror at the anchor.',
      zh: 'Tround 是手机自己时钟上的一次相减：从它发出的 RMARKER 到它收到的 RMARKER。Treply 是锚点那侧镜像的一次相减。',
    } },
    { text: {
      en: 'The anchor answers in the next ranging slot, so Treply is 2 ms − Tprop and Tround 2 ms + Tprop: the reply dwarfs the flight by five orders of magnitude, and the formula cancels it.',
      zh: '锚点在下一个测距时隙作答，所以 Treply 是 2 ms − Tprop，Tround 是 2 ms + Tprop：应答时延比飞行时间大五个数量级，而这个公式正好把它抵消掉。',
    } },
    { heading: { en: 'The four lines to subtract', zh: '要相减的那四行' }, text: {
      en: 'Every UWB_TS record is one counter reading; this round makes four, in this order.',
      zh: '每一条 UWB_TS 记录都是一次计数器读数；这一轮产生四条，顺序如下。',
    } },
    { kind: 'table', head: [
      { en: 'Log line', zh: '日志行' }, { en: 'Counter (RCTU)', zh: '计数值（RCTU）' },
    ], rows: [
      [N('tag-1 TX RMARKER → * poll'), N('336 207 494 656')],
      [N('anchor-1 RX RMARKER ← tag-1 poll'), N('26 381 598 252')],
      [N('anchor-1 TX RMARKER → tag-1 resp'), N('26 509 392 384')],
      [N('tag-1 RX RMARKER ← anchor-1 resp'), N('336 335 290 928')],
    ] },
    { kind: 'formula', text: {
      en: 'Tround = 336 335 290 928 − 336 207 494 656 = 127 796 272\nTreply = 26 509 392 384 − 26 381 598 252 = 127 794 132\nT̂prop = (127 796 272 − 127 794 132) / 2 = 1070 RCTU = 16.75 ns = 5.02 m',
      zh: 'Tround = 336 335 290 928 − 336 207 494 656 = 127 796 272\nTreply = 26 509 392 384 − 26 381 598 252 = 127 794 132\nT̂prop = (127 796 272 − 127 794 132) / 2 = 1070 RCTU = 16.75 ns = 5.02 m',
    }, note: {
      en: 'A difference of 2140 between two numbers in the hundreds of billions. The truth is 1065.7 ticks: the reading runs 4.3 ticks long, because each receive counter carries 100 ps of noise and ticks are whole.',
      zh: '两个几千亿量级的数字，差值只有 2140。真值是 1065.7 格：读数偏大 4.3 格，因为两次接收计数各带 100 ps 噪声，而计数只能取整。',
    } },
    { kind: 'formula', heading: { en: 'What the range line says', zh: '测距行是怎么写的' }, text: {
      en: 'tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)',
      zh: 'tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)',
    }, note: {
      en: 'Raw is the 1070 above; the figure in front of it is that same measurement, corrected for clock offset. Both crystals are perfect here, so nothing needed correcting — yet the answer moved 7 cm. Going deeper says why.',
      zh: 'raw 就是上面那个 1070；写在前面的那个数，是同一次测量做了时钟偏差修正之后的结果。这里两个晶振都是完美的，本来无事可修——可答案还是挪动了 7 cm。原因见“再深一层”。',
    } },
    { kind: 'table', heading: { en: 'Units', zh: '单位换算' }, head: [
      { en: 'Quantity', zh: '量' }, { en: 'Value', zh: '数值' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [{ en: 'A 499.2 MHz chip', zh: '499.2 MHz 的一个码片' }, N('2.003 ns'), N('Clause 16')],
      [{ en: 'One RCTU = 2⁻⁷ chip', zh: '一个 RCTU = 2⁻⁷ 码片' }, N('15.650 ps'), N('§10.29')],
      [{ en: 'One metre of flight', zh: '飞行一米' }, N('3.3356 ns = 213.1 RCTU'), N('c = 0.299792458 m/ns')],
      [{ en: 'A tick of timing error', zh: '计时差一格' }, { en: '4.7 mm flight, 2.3 mm range', zh: '飞行 4.7 mm，测距 2.3 mm' }, { en: 'a round trip, halved', zh: '往返折半' }],
    ] },
    { kind: 'table', heading: { en: 'Flight, and where it lands on the timeline', zh: '飞行时间，以及它落在时间线的哪一格' }, head: [
      { en: 'Apart', zh: '相距' }, { en: 'Flight', zh: '飞行时间' }, { en: 'On the 1 ns grid', zh: '落在 1 ns 网格上' },
    ], rows: [
      [N('5 m'), N('16.678 ns'), N('17 ns')],
      [N('20 m'), N('66.713 ns'), N('67 ns')],
    ] },
    { text: {
      en: 'The event queue counts whole nanoseconds, always rounding up so nothing arrives too early. The counter does not round: it is stamped in 15.650 ps units, a grid 64 times finer.',
      zh: '事件队列只数整纳秒，且一律向上取整，好让没有一帧比物理允许的更早送达。计数器不取整：它以 15.650 ps 为单位，这张网格比时间线精细 64 倍。',
    } },
  ],
  deeper: [
    { heading: { en: 'A correction with nothing to correct', zh: '一次无事可修的修正' }, text: {
      en: 'The clock-offset correction scales Treply by the relative frequency error the receiver estimated from the carrier. The estimator is itself noisy, to 0.2 ppm in this model, and 0.2 ppm of a 2 ms reply is 0.4 ns — half of which lands on the range. That is the lesson hiding in a perfect scene: this method’s error grows with how long the reply took, whether or not the crystals were ever wrong.',
      zh: '时钟偏差修正的做法，是用接收端从载波上估出的相对频率误差去缩放 Treply。而估计器自身带有噪声，本模型里是 0.2 ppm；2 ms 应答时延的 0.2 ppm 就是 0.4 ns，其中一半会落到距离上。这正是藏在一个完美场景里的那一课：不管晶振有没有真的偏，这种方法的误差都随应答时长而增长。',
    } },
    { heading: { en: 'Where those huge counter values come from', zh: '那些巨大的计数值是怎么来的' }, text: {
      en: 'The counter is 40 bits wide in this model; the standard asks only for 32 or more. At 15.650 ps a tick, 2⁴⁰ ticks is 17.2 seconds, and then it wraps to zero. Nothing resets it or aligns it to anything, so every subtraction above is modulo 2⁴⁰, and the values you read — hundreds of billions — are simply wherever each crystal stood when the session opened.',
      zh: '本模型里计数器是 40 位宽，标准只要求至少 32 位。每格 15.650 ps，2⁴⁰ 格就是 17.2 秒，之后回绕归零。没有任何机制去复位它、也不会把它对齐到任何基准，所以上面每一次相减都是模 2⁴⁰ 的；而你读到的那些几千亿量级的数值，不过是会话开始那一刻两只晶振碰巧停在的位置。',
    } },
    { heading: { en: 'What a real pair of crystals would cost', zh: '换成真实的晶振要付多少代价' }, text: {
      en: 'Both crystals are pinned to 0 ppm here, which no real pair ever is: the standard allows ±20 ppm. At 20 ppm of relative offset the anchor’s 2 ms reply is mismeasured by 40 ns, half of which lands straight on the range — 20 ns, six metres, on a five-metre distance. A later lesson in this track takes the mercy away.',
      zh: '这里两个晶振都被钉死在 0 ppm，而现实中没有哪一对设备是这样：标准允许 ±20 ppm。当相对偏差是 20 ppm 时，锚点那 2 ms 的应答会被测错 40 ns，其中一半直接落到距离上——20 ns，六米，加在一个五米的距离上。本轨道后面有一课会撤掉这份宽容。',
    } },
    { heading: { en: 'The delay the Wi-Fi half never shows you', zh: 'Wi-Fi 那一半从不让你看见的时延' }, text: {
      en: 'The Wi-Fi half of this simulator delivers a frame at the instant it was transmitted, deliberately. Across a flat, propagation delay is tens of nanoseconds against a 9 µs slot, so dropping it costs the MAC nothing. UWB cannot make that simplification, because here the delay is not an error term. It is the measurement.',
      zh: '本仿真器的 Wi-Fi 那一半，是有意让接收端在发送的同一瞬间收到帧的。在一套住宅的尺度上，传播时延不过几十纳秒，而时隙是 9 µs，丢掉它对 MAC 毫无影响。UWB 做不了这个简化，因为在这里时延不是误差项，它就是被测量的对象。',
    } },
  ],
  sources: [
    { en: 'IEEE Std 802.15.4-2024 is a published standard, not a draft. The HRP UWB PHY of Clause 16, the ranging counter and RMARKER of §10.29 and the SP1 packet configuration of §10.32 are standard text; every chip count and field duration in this lesson follows from them.',
      zh: 'IEEE Std 802.15.4-2024 是已经发布的标准，不是草案。第 16 章的 HRP UWB PHY、§10.29 的测距计数器与 RMARKER、§10.32 的 SP1 分组配置都是标准正文；本课里每一个码片数和字段时长都由它们推导而来。' },
    { en: 'Two numbers are not the standard’s: the 2 ms ranging slot and the 200 ms ranging block come from FiRa’s UWB profile.',
      zh: '有两个数字不属于标准：2 ms 的测距时隙和 200 ms 的测距块，来自 FiRa 的 UWB 配置文件。' },
    { en: 'The model choices, named so you can argue with them: −14 dBm of transmit power, −93 dBm of sensitivity, 100 ps of 1-σ noise on every received timestamp, 0.2 ppm of residual error in the clock-offset estimate, and the extra delay a wall adds to an obstructed path.',
      zh: '下面这些是仿真器自己的模型取值，列出来方便你质疑：−14 dBm 发射功率、−93 dBm 接收灵敏度、每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及墙体给遮挡路径额外增加的时延。' },
    { en: 'The ±20 ppm crystal tolerance quoted under “Going deeper” is §16.4.9. The 40-bit counter is a model choice; the standard asks only for 32 bits or more.',
      zh: '"再深一层"里引用的 ±20 ppm 晶振容差出自 §16.4.9。40 位计数器是模型取值，标准正文只要求至少 32 位。' },
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: { en: '20 m apart', zh: '相距 20 m' }, scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('the poll leaves the phone', 'Poll 帧离开手机', firstUwbPoll),
    J('the anchor stamps the arriving RMARKER', '锚点记下到达的 RMARKER', firstUwbRxTs),
    J('the anchor answers', '锚点作答', firstUwbResp),
    J('the range falls out', '距离算出来了', firstUwbRange),
  ],
  observe: [
    { en: 'Jump to the poll and zoom to nanoseconds: TX_START on the phone’s lane at 0 ns, RX_START on the anchor’s at 17 ns. Five metres of air, to scale for once.', zh: '跳到 Poll 帧，把时间线放大到纳秒级：手机泳道上的 TX_START 在 0 ns，锚点泳道上的 RX_START 在 17 ns。五米空气，这一次是按真实比例画出来的。' },
    { en: 'Read the four UWB_TS lines in order: the phone’s TX RMARKER, the anchor’s RX RMARKER, the anchor’s TX RMARKER, the phone’s RX RMARKER. Two on one crystal, two on the other.', zh: '按顺序读日志里的四条 UWB_TS：手机的 TX RMARKER、锚点的 RX RMARKER、锚点的 TX RMARKER、手机的 RX RMARKER。两条读自一个晶振，两条读自另一个。' },
    { en: 'Find the UWB_RANGE line at 2 187 389 ns: 4.95 m against a true 5.00 m, raw 5.02 m beside it — a few centimetres out, against 2.1 cm of range-noise sigma.', zh: '找到 2 187 389 ns 处的 UWB_RANGE：报出 4.95 m，真值 5.00 m，旁边是 raw 的 5.02 m——差了几厘米，而单次读数的噪声标准差就是 2.1 cm。' },
  ],
  tryThis: [
    { en: 'Load the 20 m variant. The arrival gap grows from 17 ns to 67 ns — four times the distance, four times the flight. The range reads 19.95 m against a true 20.00 m: still a few centimetres out, because timestamp noise does not care how far the frame flew.', zh: '载入 20 m 变体。到达间隔从 17 ns 变成 67 ns——距离四倍，飞行时间也四倍。测距行报出 19.95 m，真值 20.00 m：依然差几厘米，因为时间戳噪声并不在乎这一帧飞了多远。' },
  ],
  quiz: [
    {
      q: { en: 'Why does UWB measure time instead of signal strength?', zh: 'UWB 为什么去测时间，而不是测信号强度？' },
      options: [
        { en: 'Time is easier to measure', zh: '因为时间更好测' },
        { en: 'Strength depends on walls and hands as well as distance; arrival time only on the path', zh: '强度既取决于距离，也取决于墙和手；到达时间只取决于路径长度' },
        { en: 'A UWB receiver cannot read signal strength', zh: 'UWB 接收端读不到信号强度' },
      ],
      answer: 1,
      explain: { en: 'A door or a hand takes out more signal than several metres of air; arrival time moves only with the path.', zh: '一扇门、一只手，吃掉的信号比好几米空气还多；而到达时间只随路径长度变化。' },
    },
    {
      q: { en: 'What is one RCTU, and what distance does it correspond to?', zh: '一个 RCTU 是多少，它对应多长的距离？' },
      options: [
        { en: 'One chip, 2.003 ns, about 60 cm', zh: '一个码片，2.003 ns，约 60 cm' },
        { en: '2⁻⁷ of a chip, 15.650 ps, about 4.7 mm of flight', zh: '码片的 2⁻⁷，15.650 ps，约 4.7 mm 的飞行距离' },
        { en: 'One nanosecond, the timeline’s grid, about 30 cm', zh: '一纳秒，也就是时间线的网格，约 30 cm' },
      ],
      answer: 1,
      explain: { en: 'The counter runs 128 times finer than the 499.2 MHz chip rate; a metre is 213.1 ticks.', zh: '计数器比 499.2 MHz 的码片速率再细 128 倍；一米是 213.1 格。' },
    },
    // A third question — "five metres is 16.678 ns, yet RX_START sits 17 ns after TX_START:
    // is the range 0.3 ns wrong?" — stood here until the step-1 fix wave. It asked about the
    // timeline's 1 ns grid rather than about ranging, and a track's first lesson is held to
    // 1000 words. The claim it tested is still in `numbers` ("Flight, and where it lands on
    // the timeline") and still pinned in tests/course/uwb-intro.test.ts.
  ],
}
