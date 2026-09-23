/**
 * Wi-Fi Tier 2 · M4 · Capacity knobs · Spatial streams.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): several
 * antennas sending different words at once, why both ends must have them, and
 * why the widest channel with the most streams is no shorter than the widest
 * channel alone. It loads `width`'s own builder at its narrowest setting, and
 * its last variant is `width`'s widest, so the two lessons are one experiment.
 *
 * The scenario builder and the five variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/streams.test.ts.
 */
import { type Lesson, N, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

export const streams: Lesson = {
  id: 'streams',
  module: 3,
  title: { en: 'Spatial streams — several words at once', zh: '空间流——同一瞬间说出好几句话' },
  why: {
    en: 'The last lesson bought speed with room: a wider block of the band, more lanes for the same load. There is a second way to buy it, and it costs no extra room at all. Give both ends of a link more antennas and they can say different things at the same instant, in the same place on the band, and still be told apart. This lesson is about what that buys, what it needs from both ends, and where it stops buying anything.',
    zh: '上一课是用“地方”换速度：给一块更宽的频段，同样一车比特就多了几条车道。还有第二种买法，而且一点额外的频段都不用花。给链路的两端各装上更多天线，它们就能在同一瞬间、频段上的同一个位置说出不同的话，接收端照样分得开。这一课讲的是：这样买到了什么，它对两端各有什么要求，以及它到什么地方就买不到东西了。',
  },
  outcomes: [
    { en: 'say how several antennas send different signals on the same sub-carriers at once', zh: '说出多根天线怎样在同一批子载波上同时发出不同的信号' },
    { en: 'work out how many streams a link runs at, from how many antennas each end has', zh: '根据两端各有几根天线，算出这条链路实际跑几条流' },
    { en: 'say which of the two multipliers — width or streams — costs signal, and which is free', zh: '说清带宽与空间流这两个倍数里，哪个要拿信号去换，哪个是白送的' },
  ],
  needs: ['width'],
  terms: [
    { term: 'spatial stream', plain: {
      en: 'one of several signals sent at the same instant on the same sub-carriers, kept apart by the paths they travel',
      zh: '在同一瞬间、同一批子载波上发出的好几路信号中的一路，靠各自走过的路径区分开来',
    } },
    { term: 'antenna', plain: {
      en: 'one radiating element; a radio needs one per stream it means to send or receive',
      zh: '一根辐射单元；电台想发或想收几条流，就得有几根',
    } },
  ],
  picture: [
    { heading: { en: 'Several words at once', zh: '同一瞬间的好几句话' }, text: {
      en: 'A wider channel gives the radio more room in the band. Antennas give it the same room over again. With two antennas at each end, the sender puts two different signals on the very same sub-carriers in the very same instant, and the receiver still pulls them apart, because each one arrived by a different path through the room. Each of those parallel signals is a spatial stream, and each one multiplies the bits in a chunk of signal exactly as more sub-carriers do.',
      zh: '信道变宽，是给电台在频段上更大的地方；而天线，是把同一块地方再用一遍。两端各装两根天线时，发送端就在同一瞬间、同一批子载波上放出两路不同的信号，接收端照样能把它们分开——因为两路信号是沿着屋里不同的路径过来的。这样并行的每一路就是一条空间流，它让一块信号里装的比特数翻倍，和子载波变多的效果一模一样。',
    } },
    { heading: { en: 'Both ends have a vote', zh: '两端都有发言权' }, text: {
      en: 'It takes radiating elements at both ends, and one such element is an antenna: a radio needs one per stream it means to send, and one per stream it means to pull apart again. So a link runs at the smaller stream count of the two ends. A router with four antennas talking to a phone with two is a two-stream link, and the router’s spare pair is not wasted — it simply has to find somebody else to talk to.',
      zh: '这事两端都得有辐射单元，也就是天线：想发几条流就得有几根，想把几条流分开也得有几根。所以一条链路按两端里较小的那个流数运行。四根天线的路由器对上两根天线的手机，就是一条两流链路；而路由器多出来的那一对并没有浪费——它只是得另外找个人说话。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first data frame. The lesson opens on a single stream; the buttons above step it to two, to four, and then to the two mixed cases. Only the blue block changes.',
      zh: '载入仿真，跳到第一个数据帧。这一课打开的是单流；上面的按钮把它切到两条流、四条流，再切到两个混合的情形。变的只有那个蓝色数据块。',
    } },
    { heading: { en: 'The multiplier that is free', zh: '白送的那个倍数' }, text: {
      en: 'The difference from width is the price. A wider channel makes the receiver take in more noise; another stream does not. The channel is the same size as it was, so the noise floor stays where it was and so does the signal every rung on the rate ladder asks for. In this simulator — and nearly so in a room full of reflections — streams are the multiplier nobody charges you for. Width is the one that costs 3 dB every time it doubles.',
      zh: '和带宽的区别在于价钱。信道变宽，接收端就要多收进一份噪声；而多加一条流不会——信道还是原来那么大，噪声地板不动，速率阶梯上每一级所要的信号也不动。在本仿真器里——在一间满是反射的屋子里也差不多——空间流是没人跟你收钱的那个倍数；带宽那个倍数，每翻一倍都要付 3 dB。',
    } },
    { heading: { en: 'Where the multipliers stop', zh: '倍数到头的地方' }, text: {
      en: 'A multiplier only helps while there is still something left to divide. Run the widest channel and the most streams together and the frame comes out no shorter than the widest channel managed on its own: it was already down to a single symbol, and one symbol is the floor. The streams buy nothing there — and the wide channel is still taking in every bit of its extra noise, now paid for nothing at all.',
      zh: '倍数只在还有东西可分的时候才有用。把最宽的信道和最多的流一起用上，帧并不会比最宽信道单独上阵时更短：它那时就已经只剩一个符号，而一个符号就是地板。在那里空间流什么也没买到——而宽信道多收进来的噪声一分不少，只是这笔钱彻底白花了。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'The same 1500-byte frame (1530 bytes on the air), 20 MHz, MCS 13',
      zh: '同一个 1500 字节的帧（空口上 1530 字节），20 MHz，MCS 13',
    }, head: [
      { en: 'Streams', zh: '空间流' }, { en: 'Bits per symbol', zh: '每符号比特数' },
      { en: 'Symbols', zh: '符号数' }, { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [N('1'), N('2340'), N('6'), N('129.6 µs')],
      [N('2'), N('4680'), N('3'), N('88.8 µs')],
      [N('4'), N('9360'), N('2'), N('75.2 µs')],
    ] },
    { kind: 'table', heading: { en: 'The two mixed variants', zh: '两个混合变体' }, head: [
      { en: 'Variant', zh: '变体' }, { en: 'Streams the link runs', zh: '链路实际跑的流数' },
      { en: 'Airtime', zh: '空口时间' }, { en: 'Same as', zh: '等同于' },
    ], rows: [
      [{ en: 'Router 4 · Phone 2', zh: '路由器 4 · 手机 2' }, N('2'), N('88.8 µs'), { en: 'the 2-stream row above', zh: '上表里 2 条流那一行' }],
      [{ en: '160 MHz · 4 streams', zh: '160 MHz · 4 条流' }, N('4'), N('61.6 µs'), { en: '160 MHz on its own, last lesson', zh: '上一课里单靠 160 MHz 的结果' }],
    ] },
    { heading: { en: 'The weaker end decides', zh: '弱的一端说了算' }, text: {
      en: 'Every capability is negotiated down to the weaker end, and the mixed variant is exactly that pairing: it lands on the two-stream 88.8 µs, not the four-stream 75.2 µs. Frame for frame, it is indistinguishable from the plain two-stream run.',
      zh: '所有能力都要按较弱的那一端协商，而这个混合变体正是这种搭配：它落在两流的 88.8 µs 上，而不是四流的 75.2 µs。逐帧去比，它和纯粹的两流那一次跑完全看不出区别。',
    } },
    { heading: { en: 'And where it stops', zh: '以及它到头的地方' }, text: {
      en: 'Eight times the sub-carriers on top of four streams buys exactly one symbol: 61.6 µs against the four-stream 75.2 µs. The frame was already two symbols long, and the second one is the last thing there was to take away.',
      zh: '在四条流之上再加八倍的子载波，只换来一个符号：61.6 µs 对四流的 75.2 µs。那一帧本来就只剩两个符号，而第二个符号，是最后还能拿走的东西。',
    } },
    { kind: 'steps', heading: { en: 'What a stream actually changes, step by step', zh: '多一条流到底改变了什么，一步一步' }, items: [
      { en: 'Each end declares how many streams it can run, one per antenna it has, and the link takes the smaller of the two counts.',
        zh: '两端各自报出自己能跑几条流——有几根天线就是几条——链路取两者中较小的那个数。' },
      { en: 'Pick the rung exactly as the last lesson did. The channel is no wider, so the noise floor has not moved and neither has any rung’s requirement: the stream count is not an input to that choice at all.',
        zh: '照上一课的办法选级。信道并没有变宽，噪声地板没动，每一级的要求也没动：流数根本就不是这一步的输入。' },
      { en: 'Bits per symbol = that rung’s bits per symbol at 20 MHz, times the sub-carrier ratio of the width, times the stream count. A second stream multiplies it exactly as a second set of sub-carriers would.',
        zh: '每符号比特数 = 该级在 20 MHz 下的每符号比特数，乘以带宽的子载波倍数，再乘以流数。多一条流，效果和多一份子载波完全一样。' },
      { en: 'Symbols = the frame’s bits divided by that, rounded up to a whole symbol. A stream that only trims the last, part-filled symbol buys nothing.',
        zh: '符号数 = 这一帧的比特数除以它，再向上取整成整数个符号。如果多出来的那条流只是削掉最后那个没装满的符号，它就什么也没买到。' },
      { en: 'Airtime = the 48 µs preamble plus 13.6 µs per symbol. The preamble is sent the same way whatever the stream count, so it never shrinks.',
        zh: '空口时间 = 48 µs 的前导，加上每个符号 13.6 µs。无论跑几条流，前导都按同样的方式发出去，所以它从不变短。' },
    ] },
    { kind: 'table', heading: {
      en: 'Four streams, and the mixed pair, run through the steps',
      zh: '四条流，以及那个混合搭配，照着步骤走一遍',
    }, head: [
      { en: 'Step', zh: '步骤' }, { en: '4 streams', zh: '4 条流' }, { en: 'Router 4 · Phone 2', zh: '路由器 4 · 手机 2' },
    ], rows: [
      [{ en: 'what each end can run', zh: '两端各能跑几条' }, { en: '4 and 4', zh: '4 和 4' }, { en: '4 and 2', zh: '4 和 2' }],
      [{ en: 'so the link runs', zh: '于是链路跑' }, N('4'), N('2')],
      [{ en: 'rung, untouched by the streams', zh: '级别，不受流数影响' }, N('MCS 13'), N('MCS 13')],
      [{ en: 'bits per symbol: 20 MHz × streams', zh: '每符号比特数：20 MHz 的值 × 流数' }, N('2340 × 4 = 9360'), N('2340 × 2 = 4680')],
      [{ en: 'symbols: ⌈12262 ÷ that⌉', zh: '符号数：⌈12262 ÷ 它⌉' }, N('2'), N('3')],
      [{ en: 'airtime: 48 + 13.6 × symbols', zh: '空口时间：48 + 13.6 × 符号数' }, N('75.2 µs'), N('88.8 µs')],
    ] },
  ],
  deeper: [
    { heading: { en: 'What the spare pair is for', zh: '多出来的那一对流做什么用' }, text: {
      en: 'A four-antenna router talking to a two-stream phone is not stuck with half its hardware idle. It can point the other two streams at a second phone in the very same instant, sending different data to each — that is MU-MIMO, multi-user MIMO, and it has a lesson of its own later in this module. What it needs is a second station with traffic waiting, which is why the gain shows up in a busy house and not on this desk.',
      zh: '四根天线的路由器对上两流的手机，并不意味着一半硬件只能闲着。它可以在同一瞬间把另外两条流指向第二部手机，给两边各发各的数据——这就是 MU-MIMO（多用户 MIMO），本模块后面有专门的一课。它需要的是“还有第二台站点正等着发东西”，所以这份好处只在热闹的房子里看得见，在这张桌子上看不见。',
    } },
    { heading: { en: 'Why the paths have to differ', zh: '为什么路径必须不一样' }, text: {
      en: 'Separating the streams is linear algebra: the receiver solves a small system of equations, one row per receive antenna. That works only while the rows are genuinely different, which is to say only while the signals reached the antennas by genuinely different paths. A room full of reflections — a flat, an office — is good for streams. A clean line of sight across an empty field is the worst case, and there the second stream can be worth almost nothing.',
      zh: '把几条流分开，本质是解线性方程：接收端解一个小方程组，每根接收天线给出一行。只有当这些行真的互不相同——也就是几路信号真的沿着明显不同的路径到达——方程才解得开。反射很多的房间（住宅、办公室）对空间流很友好；空旷野地上干干净净的直视路径则是最差情形，那里第二条流几乎一文不值。',
    } },
  ],
  sources: [
    { en: 'The bits per symbol are the 802.11be numerology: 2340 data bits in a 20 MHz symbol at the top modulation, multiplied by the stream count (Clause 36 of IEEE Std 802.11-2024 and its amendment).',
      zh: '每符号比特数来自 802.11be 的参数集：最高调制下 20 MHz 的一个符号装 2340 个数据比特，再乘以流数（IEEE Std 802.11-2024 第 36 章及其修正案）。' },
    { en: 'That a link runs at the smaller stream count of its two ends follows from the capability exchange of §9.4.2.x and §11.3; this simulator models it as the minimum of the two, with no per-stream fallback.',
      zh: '“链路按两端较小的流数运行”出自 §9.4.2.x 与 §11.3 的能力协商；本仿真器把它建模为两者取最小，且不做逐流回退。' },
    { en: 'The simulator gives every stream the same quality: no correlation between antennas, no rank loss in line of sight. A real four-stream link in a small room rarely gets the full multiplier.',
      zh: '仿真器让每条流的质量都一样：天线之间不相关，直视路径下也不掉秩。现实里小房间中的四流链路，很少真能拿到完整的倍数。' },
  ],
  scenario: () => widthScenario(20, 1),
  variants: [
    { label: { en: '1 stream', zh: '1 条流' }, scenario: () => widthScenario(20, 1) },
    { label: { en: '2 streams', zh: '2 条流' }, scenario: () => widthScenario(20, 2) },
    { label: { en: '4 streams', zh: '4 条流' }, scenario: () => widthScenario(20, 4) },
    { label: { en: 'Router 4 · Phone 2', zh: '路由器 4 · 手机 2' }, scenario: () => widthScenario(20, 2, 4) },
    { label: { en: '160 MHz · 4 streams', zh: '160 MHz · 4 条流' }, scenario: () => widthScenario(160, 4) },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'One stream to two: the data part halves exactly, 81.6 µs to 40.8 µs. Two to four would halve it again, to 20.4 µs, but a frame goes out in whole symbols, so it stops at 27.2 µs.', zh: '从一条流到两条流：数据部分正好减半，81.6 µs 变 40.8 µs。从两条到四条本该再减半到 20.4 µs，但帧只能按整数个符号发出去，所以停在 27.2 µs。' },
    { en: 'The rate line reads MCS 13 in every variant, one stream or four, 20 MHz or 160. Streams reuse the same sub-carriers, so they can never cost a modulation step; on this desk not even the widest channel’s extra noise takes one away.', zh: '每个变体的“速率”一行都是 MCS 13：一条流也好四条流也好，20 MHz 也好 160 MHz 也好。空间流复用的是同一批子载波，所以它永远拿不走一档调制；而在这张桌子上，连最宽信道多收的那份噪声也没拿走。' },
    { en: 'Router 4 · Phone 2 is indistinguishable from 2 streams: the same 88.8 µs, the same blocks in the same places.', zh: '“路由器 4 · 手机 2”和“2 条流”看不出区别：同样是 88.8 µs，同样的块出现在同样的位置。' },
  ],
  tryThis: [
    { en: 'Put 2 streams and Router 4 · Phone 2 side by side and hunt for a difference on the timeline. There is none — the router’s spare pair has nobody to talk to.', zh: '把“2 条流”和“路由器 4 · 手机 2”并排放在一起，在时间轴上找不同。找不到——路由器多出来的那一对流没有对象可说话。' },
    { en: 'Now compare 2 streams here with the 40 MHz variant of the last lesson: the same frame, the same 88.8 µs. Only one of the two asked the laptop for 3 dB more signal.', zh: '再把这里的“2 条流”和上一课的 40 MHz 变体比一比：同一个帧，同样的 88.8 µs。但两者之中，只有一个向笔记本多要了 3 dB 的信号。' },
  ],
  quiz: [
    {
      q: { en: 'Why does adding a spatial stream ask the sender for no extra signal, when doubling the channel width does?', zh: '为什么加一条空间流不必向发送端多要信号，而带宽翻倍就要？' },
      options: [
        { en: 'Streams are transmitted at higher power', zh: '空间流的发射功率更高' },
        { en: 'The channel is still the same width, so the receiver takes in the same noise — the streams are kept apart by space, not by frequency', zh: '信道宽度没变，接收端收进的噪声也没变——两条流靠空间区分，不靠频率' },
        { en: 'The extra streams are sent on a second channel', zh: '多出来的那些流是在另一条信道上发的' },
      ],
      answer: 1,
      explain: { en: 'Noise power follows the width of the channel. Doubling the width doubles it, which is the 3 dB; a second stream reuses the very same sub-carriers, so the noise floor does not move and neither does the signal any rung on the rate ladder asks for.', zh: '噪声功率跟着信道宽度走。带宽翻倍，噪声也翻倍，这就是那 3 dB；而第二条流复用的是同一批子载波，噪声地板不动，速率阶梯上每一级所要的信号也纹丝不动。' },
    },
    {
      q: { en: 'A router with four antennas serves a phone with two. How many streams does that link use?', zh: '一台四根天线的路由器服务一部两根天线的手机。这条链路用几条流？' },
      options: [
        { en: 'Four — the router decides', zh: '四条——路由器说了算' },
        { en: 'Two — a link runs at the smaller stream count of its two ends', zh: '两条——链路按两端里较小的流数运行' },
        { en: 'Three — the average of the two', zh: '三条——取两端的平均' },
      ],
      answer: 1,
      explain: { en: 'Every capability is negotiated down to the weaker end. The link uses two, and the frame takes 88.8 µs: the two-stream time, not the four-stream 75.2 µs.', zh: '所有能力都要按较弱的一端协商。链路用两条流，帧要 88.8 µs——两流的时间，而不是四流的 75.2 µs。' },
    },
  ],
}
