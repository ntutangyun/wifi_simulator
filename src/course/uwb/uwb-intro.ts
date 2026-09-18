/**
 * UWB Tier 1 · M11 · Time of flight · Timestamps, not throughput.
 *
 * One anchor and one phone, five metres apart on a line, both crystals nailed
 * to 0 ppm, single-sided two-way ranging: the smallest scene in which a
 * distance falls out of four numbers. No AP, no stations, no Wi-Fi traffic at
 * all — the scenario is nothing but a ranging session, so every record in the
 * timeline belongs to it. Every number quoted below is pinned in
 * tests/course/uwb-intro.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1725 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). The prose
 * below totals 1694 words, so there is room for thirty more and no more: adding
 * a sentence means deleting one, or the lesson's own study-time test fails.
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
  title: { en: 'Timestamps, not throughput', zh: '重要的是时间戳，而非吞吐量' },
  body: [
    { text: {
      en: 'IEEE Std 802.15.4-2024 is a published standard, not a draft. The HRP UWB PHY of Clause 16, the ranging counter and RMARKER of §10.29 and the SP1 packet configuration of §10.32 are standard text, and every chip count, symbol count and field duration below follows from them. Two numbers are not: the 2 ms ranging slot and the 200 ms ranging block come from FiRa’s UWB profile. The rest are model choices, named so you can argue with them: −14 dBm of transmit power, −93 dBm of sensitivity, 100 ps of 1-σ noise on every received timestamp, 0.2 ppm of residual error in the clock-offset estimate, and the extra delay a wall adds to an obstructed path.',
      zh: 'IEEE Std 802.15.4-2024 是已经发布的标准，不是草案。第 16 章的 HRP UWB PHY、§10.29 的测距计数器与 RMARKER、§10.32 的 SP1 分组配置都是标准正文；下面每一个码片数、符号数和字段时长都由它们推导而来。有两个数字不属于标准：2 ms 的测距时隙和 200 ms 的测距块来自 FiRa 的 UWB 配置文件。其余都是仿真器自己的模型取值，这里列出来方便你质疑：−14 dBm 发射功率、−93 dBm 接收灵敏度、每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及墙体给遮挡路径额外增加的时延。',
    } },
    { heading: { en: 'A radio that measures time', zh: '一台测量时间的射频' }, text: {
      en: 'This course has so far been about moving bits: a frame occupies the channel, and the MAC decides who may start. Ultra-wideband ranging inverts that. The poll here carries 30 octets and spends 197.628 µs on the air — an eternity, by Wi-Fi standards. The payload is not the point. The instant the frame began is.',
      zh: '本课程此前讲的都是在搬运比特：一帧占用信道，MAC 决定谁可以开始发送。超宽带测距把这件事反了过来。本课里的 Poll 帧只装 30 个字节，却要占用 197.628 µs 的空口时间——按 Wi-Fi 的标准简直是天荒地老。但净荷不是重点，这一帧开始的那个瞬间才是。',
    } },
    { text: {
      en: 'The HRP UWB PHY sends its pulses at 499.2 MHz, so one chip lasts 2.003 ns. The ranging counter runs 128 times finer: one ranging counter time unit (RCTU) is 2⁻⁷ of a chip, 15.650 ps. That is the resolution of every number in this lesson. Light covers one metre in 3.3356 ns, which is 213.1 RCTU, so one tick of the counter is 4.7 mm of flight — and because two-way ranging halves a round trip, one tick of timing error is 2.3 mm of distance error.',
      zh: 'HRP UWB PHY 以 499.2 MHz 发送脉冲，因此一个码片长 2.003 ns。测距计数器比码片再细 128 倍：一个测距计数时间单位（RCTU）是码片的 2⁻⁷，即 15.650 ps。这就是本课中所有数字的分辨率。光走一米需要 3.3356 ns，也就是 213.1 个 RCTU，所以计数器每跳一格代表 4.7 mm 的飞行距离——又因为双向测距要把往返时间折半，计时上每差一格，距离上只差 2.3 mm。',
    } },
    { text: {
      en: 'The counter is 40 bits wide in this model; the standard asks only for 32 or more. At 15.650 ps a tick, 2⁴⁰ ticks is 17.2 seconds, and then it wraps to zero. Nothing resets it or aligns it to anything, so every subtraction below is modulo 2⁴⁰, and the values you will read — hundreds of billions — are simply wherever each crystal stood when the session opened.',
      zh: '在本模型中计数器为 40 位宽，标准只要求至少 32 位。每格 15.650 ps，2⁴⁰ 格就是 17.2 秒，之后回绕归零。没有任何机制去复位它、也不会把它对齐到任何基准，所以下面每一次相减都是模 2⁴⁰ 的，而你读到的那些几千亿量级的数值，不过是会话开始那一刻各自晶振碰巧停在的位置。',
    } },
    { kind: 'table', heading: { en: 'What 197.628 µs is made of', zh: '197.628 µs 由什么组成' }, head: [
      { en: 'Field', zh: '字段' }, { en: 'Duration', zh: '时长' }, { en: 'Purpose', zh: '作用' },
    ], rows: [
      [{ en: 'SYNC, 64 preamble symbols', zh: 'SYNC，64 个前导符号' }, N('65.128 µs'), { en: 'acquisition and timing lock', zh: '捕获并锁定定时' }],
      [{ en: 'SFD, 8 symbols', zh: 'SFD，8 个符号' }, N('8.141 µs'), { en: 'fixes the RMARKER', zh: '确定 RMARKER 的位置' }],
      [{ en: 'STS gap', zh: 'STS 间隔' }, N('1.026 µs'), { en: '512 chips of silence', zh: '512 个码片的静默' }],
      [{ en: 'STS, 64 × 512 chips', zh: 'STS，64 × 512 个码片' }, N('65.641 µs'), { en: 'unforgeable timing sequence', zh: '无法伪造的定时序列' }],
      [{ en: 'STS gap', zh: 'STS 间隔' }, N('1.026 µs'), { en: '512 more chips', zh: '再来 512 个码片' }],
      [{ en: 'PHR, 19 symbols', zh: 'PHR，19 个符号' }, N('19.487 µs'), { en: 'length and data rate', zh: '长度与数据速率' }],
      [{ en: 'PSDU, 30 octets', zh: 'PSDU，30 个字节' }, N('37.179 µs'), { en: 'the poll at 6.81 Mb/s: 240 data bits, 48 parity bits, a 2-symbol tail', zh: 'Poll 帧，速率 6.81 Mb/s：240 个数据比特、48 个校验比特，外加 2 个符号的尾' }],
      [{ en: 'The whole poll', zh: '整帧 Poll' }, N('197.628 µs'), { en: '160.449 µs structure, 37.179 µs message', zh: '结构 160.449 µs，消息 37.179 µs' }],
    ] },
    { text: {
      en: 'The RMARKER is the first chip after the SFD (§10.29.1.1), 65.128 + 8.141 = 73.269 µs into the PPDU. Both radios stamp their counters there — not at the start of the transmission, not at its end — because it is the one point both ends can name to a fraction of a chip. The 20-octet response is built the same way and differs only in its PSDU: 26.923 µs of payload, 187.372 µs in all, RMARKER at the same 73.269 µs.',
      zh: 'RMARKER 是 SFD 之后的第一个码片（§10.29.1.1），位于 PPDU 内 65.128 + 8.141 = 73.269 µs 处。两端的射频都在这里读取各自的计数器——不是在发送开始时，也不是在结束时——因为在整帧之中，只有这一点是收发两端都能精确到码片零头、共同认定的位置。20 字节的 Response 帧结构相同，只有 PSDU 不同：净荷 26.923 µs，全帧 187.372 µs，RMARKER 同样在 73.269 µs 处。',
    } },
    { heading: { en: 'The delay Wi-Fi never showed you', zh: 'Wi-Fi 从未让你看见的那段时延' }, text: {
      en: 'Jump to the poll’s TX_START at 0 ns, then look at the anchor’s lane: RX_START at 17 ns. That gap is five metres of air, and nothing in the Wi-Fi half of this simulator would ever have shown it to you. The Wi-Fi channel delivers a frame at the instant it was transmitted, deliberately: across a flat, propagation delay is tens of nanoseconds against a 9 µs slot, so dropping it costs the MAC nothing. UWB cannot make that simplification, because here the delay is not an error term. It is the measurement.',
      zh: '跳到 Poll 帧在 0 ns 的 TX_START，再看锚点那条泳道：RX_START 在 17 ns。这段间隔就是五米空气，而本仿真器的 Wi-Fi 那一半从来不会让你看见它。Wi-Fi 信道是有意让接收端在发送的同一瞬间收到帧的：在一套住宅的尺度上，传播时延不过几十纳秒，而时隙是 9 µs，丢掉它对 MAC 毫无影响。UWB 做不了这个简化，因为在这里时延不是误差项，它就是被测量的对象。',
    } },
    { text: {
      en: 'Why 17 ns and not 16.68? Five metres at c is 16.678 ns, and the event queue counts whole nanoseconds. The arrival is scheduled at the next whole nanosecond up — rounded up, never to nearest, so no frame is ever delivered a hair earlier than physics allows. The measurement does not use that rounded instant at all: the receiver stamps its counter from the unrounded flight time, in 15.650 ps units. The timeline is drawn on a 1 ns grid; the ranging underneath runs 64 times finer.',
      zh: '为什么是 17 ns 而不是 16.68？五米按光速是 16.678 ns，而事件队列只数整纳秒。到达事件被安排在下一个整纳秒上——是向上取整，而不是四舍五入，这样任何一帧都不会比物理允许的时刻早哪怕一丝送达。测量本身完全不使用这个取整后的时刻：接收端是按未取整的飞行时间、以 15.650 ps 为单位读取计数器的。时间线画在 1 ns 的网格上，而底下的测距比它精细 64 倍。',
    } },
    { kind: 'formula', heading: { en: 'Single-sided two-way ranging', zh: '单边双向测距（SS-TWR）' }, text: {
      en: 'T̂prop = (Tround − Treply) / 2',
      zh: 'T̂prop = (Tround − Treply) / 2',
    }, note: {
      en: 'Tround is what the tag measures on its own clock, from the RMARKER it sent to the RMARKER it received; Treply is what the anchor measures on its clock, from the RMARKER it received to the RMARKER it sent. Each is a difference of two readings of one counter, so neither crystal’s unknown origin survives. Here the anchor answers in the next ranging slot, so Treply is 2 ms − Tprop and Tround is 2 ms + Tprop: the reply dwarfs the flight by five orders of magnitude, and the whole art is that it cancels.',
      zh: 'Tround 是标签在自己时钟上测得的量：从它发出的 RMARKER 到它收到的 RMARKER；Treply 是锚点在自己时钟上测得的量：从它收到的 RMARKER 到它发出的 RMARKER。两者都是同一个计数器上两次读数之差，因此任何一方晶振那个未知的起点都不会留下来。本实验里锚点在下一个测距时隙作答，所以 Treply 是 2 ms − Tprop，Tround 是 2 ms + Tprop：应答时延比飞行时间大了五个数量级，而全部的巧妙之处就在于它会被抵消掉。',
    } },
    { heading: { en: 'The four lines to subtract', zh: '要相减的那四行' }, text: {
      en: 'Every UWB_TS record in the event log is one reading of one counter. This round produces exactly four of them, in this order.',
      zh: '事件日志里每一条 UWB_TS 记录都是一次计数器读数。这一轮恰好产生四条，顺序如下。',
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
      en: 'Two numbers in the hundreds of billions, a difference of 2140, an answer a quarter of a nanosecond wide. The truth is 16.678 ns, or 1065.7 ticks: the reading is 4.3 ticks long because each receive counter carries 100 ps of noise and ticks are integers.',
      zh: '两个几千亿量级的数字，差值只有 2140，而答案的宽度只有四分之一纳秒。真值是 16.678 ns，即 1065.7 格：读数偏大 4.3 格，因为两次接收计数各自带有 100 ps 噪声，而计数本身又只能取整数。',
    } },
    { text: {
      en: 'The log’s range line reads “tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)”. Raw is the 1070 above; 4.95 m is the same measurement after a clock-offset correction, which scales Treply by the relative frequency error the receiver estimated from the carrier. Both crystals are perfect here, so the correction should be nothing — and it moves the answer by 7 cm, because the estimator itself is noisy to 0.2 ppm, and 0.2 ppm of a 2 ms reply is 0.4 ns. That is the lesson hiding in a perfect scene: SS-TWR’s error grows with how long the reply took.',
      zh: '日志里的测距行写着 “tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)”。raw 就是上面那个 1070。4.95 m 则是同一次测量经过时钟偏差修正之后的结果——修正的做法是用接收端从载波上估计出的相对频率误差去缩放 Treply。这里两个晶振都是完美的，所以修正本该等于零，可它却把答案挪动了 7 cm：因为估计器自身带有 0.2 ppm 的噪声，而 2 ms 应答时延的 0.2 ppm 就是 0.4 ns。这正是藏在一个完美场景里的那一课：SS-TWR 的误差随应答时长而增长。',
    } },
    { text: {
      en: 'Both errors are small: the raw reading is 2 cm long, the corrected one 5 cm short, against 2.1 cm of range-noise sigma. Do not mistake that for accuracy you can rely on. Both crystals are pinned to 0 ppm here, which no real pair ever is: the standard allows ±20 ppm (§16.4.9). At 20 ppm of relative offset the anchor’s 2 ms reply is mismeasured by 40 ns, half of which lands straight on the range — 20 ns, six metres, on a five-metre distance. The next lesson takes the mercy away.',
      zh: '两个误差都不大：raw 读数长了 2 cm，修正后的读数短了 5 cm，而测距噪声的标准差是 2.1 cm。但不要把这当成可以依赖的精度。本场景把两个晶振都钉死在 0 ppm，而现实中没有哪一对设备是这样的：标准允许 ±20 ppm（§16.4.9）。当相对偏差为 20 ppm 时，锚点那 2 ms 的应答会被测错 40 ns，其中一半直接落到距离上——20 ns，六米，加在一个五米的距离上。下一课就会撤掉这份宽容。',
    } },
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
    { en: 'Jump to the poll and zoom the timeline down to nanoseconds. TX_START on the phone’s lane is at 0 ns and RX_START on the anchor’s is at 17 ns — five metres of air, drawn to scale for once.', zh: '跳到 Poll 帧，把时间线一直放大到纳秒级。手机泳道上的 TX_START 在 0 ns，锚点泳道上的 RX_START 在 17 ns——五米空气，这一次是按真实比例画出来的。' },
    { en: 'Read the four UWB_TS lines in the log, in order: the phone’s TX RMARKER, the anchor’s RX RMARKER, the anchor’s TX RMARKER, the phone’s RX RMARKER. Two are stamped on one crystal, two on the other; nothing else in the round is measured.', zh: '按顺序读日志里的四条 UWB_TS：手机的 TX RMARKER、锚点的 RX RMARKER、锚点的 TX RMARKER、手机的 RX RMARKER。两条读自一个晶振，两条读自另一个；这一轮里再没有别的东西被测量。' },
    { en: 'Find the UWB_RANGE line at 2 187 389 ns. It reports 4.95 m against a true 5.00 m, with the raw 5.02 m beside it — a few centimetres out, from timestamp noise and a clock correction that had nothing to correct.', zh: '找到 2 187 389 ns 处的 UWB_RANGE。它报出 4.95 m，真值 5.00 m，旁边还附着 raw 的 5.02 m——差了几厘米，来自时间戳噪声，以及一次本来无事可修的时钟修正。' },
    { en: 'Look at the phone’s lane as a whole: the round is two slots of 2 ms, the poll in slot 0 and the response in slot 1, which starts at exactly 2 000 000 ns. Of those 4 ms, only 385 µs carries a frame.', zh: '再整体看手机这条泳道：一轮由两个 2 ms 的时隙组成，Poll 在时隙 0，Response 在时隙 1，而时隙 1 恰好从 2 000 000 ns 开始。这 4 ms 里只有 385 µs 真的在传帧。' },
  ],
  tryThis: [
    { en: 'Load the 20 m variant. The arrival gap grows from 17 ns to 67 ns: four times the distance is four times the flight, 16.678 ns becoming 66.713 ns, each rounded up onto the grid. The range line now reads 19.95 m against a true 20.00 m. Note what did not grow: the error is still about 5 cm, because timestamp noise does not care how far the frame flew.', zh: '载入 20 m 变体。到达间隔从 17 ns 变成 67 ns：距离四倍，飞行时间也四倍——16.678 ns 变成 66.713 ns，各自向上取整到网格上。测距行现在报 19.95 m，真值 20.00 m。留意什么没有跟着变大：误差依然是 5 cm 上下，因为时间戳噪声并不在乎这一帧飞了多远。' },
    { en: 'Do the arithmetic yourself. Copy the four counters out of the log, subtract each pair, halve the difference, then multiply by 15.650 ps and by 0.299792458 m/ns. You should land on 1070 RCTU and 5.02 m — the raw figure in the range line, not the corrected one.', zh: '自己把算术做一遍。从日志里抄出四个计数值，分别相减得到两个差，取其差的一半，再乘以 15.650 ps、乘以 0.299792458 m/ns。你应该得到 1070 RCTU 与 5.02 m——也就是测距行里的 raw 值，而不是修正后的值。' },
  ],
  quiz: [
    {
      q: { en: 'What is one ranging counter time unit, and what distance does it correspond to?', zh: '一个测距计数时间单位（RCTU）是多少，它对应多长的距离？' },
      options: [
        { en: 'One chip, 2.003 ns, about 60 cm', zh: '一个码片，2.003 ns，约 60 cm' },
        { en: '2⁻⁷ of a chip, 15.650 ps, about 4.7 mm of flight', zh: '码片的 2⁻⁷，15.650 ps，约 4.7 mm 的飞行距离' },
        { en: 'One nanosecond, the timeline’s grid, about 30 cm', zh: '一纳秒，也就是时间线的网格，约 30 cm' },
      ],
      answer: 1,
      explain: { en: 'The counter runs 128 times finer than the 499.2 MHz chip rate. One metre is 3.3356 ns, or 213.1 ticks.', zh: '计数器比 499.2 MHz 的码片速率再细 128 倍。一米是 3.3356 ns，即 213.1 格。' },
    },
    {
      q: { en: 'Where in the PPDU is the timestamp taken?', zh: '时间戳是在 PPDU 的什么位置读取的？' },
      options: [
        { en: 'At TX_START, the first chip of the SYNC field', zh: '在 TX_START，也就是 SYNC 字段的第一个码片' },
        { en: 'At the RMARKER, the first chip after the SFD — 73.269 µs into the frame', zh: '在 RMARKER，即 SFD 之后的第一个码片——距帧首 73.269 µs' },
        { en: 'At the end of the PSDU, once the frame is known to be good', zh: '在 PSDU 结束时，也就是确认帧正确之后' },
      ],
      answer: 1,
      explain: { en: 'After 65.128 µs of SYNC and 8.141 µs of SFD, both ends have locked the pulse train. The timeline’s TX_START and RX_START are 73.269 µs earlier; the counters are not.', zh: '经过 65.128 µs 的 SYNC 与 8.141 µs 的 SFD，两端都已锁定脉冲序列。时间线上的 TX_START 与 RX_START 比它早 73.269 µs，而计数值并非如此。' },
    },
    {
      q: { en: 'Five metres of flight is 16.678 ns, yet RX_START sits 17 ns after TX_START. Is the measurement wrong by 0.3 ns?', zh: '五米飞行是 16.678 ns，而 RX_START 却在 TX_START 之后 17 ns。这次测量是不是差了 0.3 ns？' },
      options: [
        { en: 'Yes — the engine rounds the flight time, so every range is biased long', zh: '是——引擎对飞行时间取整，因此每次测距都偏长' },
        { en: 'No — 17 ns is only where the event landed on a 1 ns grid; the counters use the unrounded delay', zh: '否——17 ns 只是事件落在 1 ns 网格上的位置；计数值用的是未取整的时延' },
        { en: 'No — the extra 0.3 ns is the receiver’s processing time', zh: '否——多出来的 0.3 ns 是接收机的处理时间' },
      ],
      answer: 1,
      explain: { en: 'The queue rounds up so nothing arrives before it physically could, but the RMARKER counter is computed from the exact flight time. The centimetres the range is out by come from timestamp noise, not from that rounding.', zh: '事件队列向上取整，是为了不让任何东西比物理允许的更早到达；而 RMARKER 计数值是按精确飞行时间算出来的。测距差的那几厘米来自时间戳噪声，与这次取整无关。' },
    },
  ],
}
