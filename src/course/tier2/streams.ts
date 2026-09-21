import { type Lesson, N, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

export const streams: Lesson = {
  id: 'streams',
  module: 3,
  title: { en: 'Spatial streams — several conversations in the same air', zh: '空间流——同一片空气里的多路对话' },
  body: [
    { text: {
      en: 'Width buys more tones. Streams buy the same tones twice. With two antennas at each end, the radio sends two different signals on the same subcarriers in the same instant, and the receiver pulls them apart by the different paths they took through the room. Each stream multiplies the bits per symbol exactly as more tones do.',
      zh: '带宽买来的是更多子载波，空间流买来的是同一批子载波用上两遍。两端各有两根天线时，电台就能在同一时刻、同一批子载波上发出两路不同的信号，接收方再靠它们在房间里走过的不同路径把它们分开。每加一条流，每个符号装的比特数就翻一番——和子载波变多的效果一模一样。',
    } },
    { text: {
      en: 'The difference is the price. A wider channel makes the receiver listen to more noise; a second stream does not — the channel is still 20 MHz wide, so the noise floor and every sensitivity threshold stay where they were. Streams are the multiplier you get for free. Width is the one that costs 3 dB.',
      zh: '区别在价钱。信道变宽会让接收方听进更多噪声，而加一条流不会——信道还是 20 MHz 宽，噪声底和各档灵敏度门限一动不动。空间流是白送的倍数，带宽那个倍数要花 3 dB 去买。',
    } },
    { kind: 'table', heading: {
      en: 'The same 1500-byte frame, 20 MHz, MCS 13',
      zh: '同一个 1500 字节的帧，20 MHz，MCS 13',
    }, head: [
      { en: 'Streams', zh: '空间流' }, { en: 'Bits per symbol', zh: '每符号比特数' },
      { en: 'Symbols', zh: '符号数' }, { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [N('1'), N('2340'), N('6'), N('129.6 µs')],
      [N('2'), N('4680'), N('3'), N('88.8 µs')],
      [N('4'), N('9360'), N('2'), N('75.2 µs')],
    ] },
    { heading: { en: 'Both ends have a vote', zh: '两端都有发言权' }, text: {
      en: 'A link runs at the smaller stream count of its two ends. A four-stream router talking to a two-stream phone is a two-stream link: the Router 4 · Phone 2 variant is exactly that pairing, and it lands on 88.8 µs — the two-stream time, not the four-stream 75.2 µs. The router’s other two streams are not wasted, though. It can point them at a second phone in the very same instant; that is MU-MIMO, and it is lesson 17.',
      zh: '链路按两端里较小的流数运行。四流的路由器对上两流的手机，就是一条两流链路：“路由器 4 · 手机 2”这个变体正是这种搭配，结果落在 88.8 µs——两流的时间，而不是四流的 75.2 µs。不过路由器多出来的两条流并没有浪费：它可以在同一瞬间把这两条流指向另一部手机。这就是 MU-MIMO，也就是第 17 课。',
    } },
    { heading: { en: 'Where the multipliers stop', zh: '倍数到头的地方' }, text: {
      en: 'A multiplier only helps while something is left to divide. The 160 MHz · 4 streams variant runs the widest channel and the most streams together, and it takes 61.6 µs — exactly what 160 MHz alone took in lesson 15. That frame was already down to a single symbol, and one symbol is the floor. The four streams buy nothing there, while the wide channel still takes in its 9 dB of extra noise. On this desk that bill is payable — the variant still runs at MCS 13, with well under a decibel of margin — but it is paid for nothing: the frame was already one symbol long.',
      zh: '倍数只在还有东西可分的时候才有用。“160 MHz · 4 条流”这个变体把最宽的信道和最多的流一起用上，结果是 61.6 µs——和第 15 课里单靠 160 MHz 得到的完全一样。那一帧当时就已经只剩一个符号了，而一个符号就是地板。在那里四条流什么也没买到，而宽信道多收进来的那 9 dB 噪声一分不少。在这张桌子上这笔账还付得起——变体仍然跑在 MCS 13，只是余量不到一分贝——但这笔钱花得没意义：那一帧本来就只剩一个符号了。',
    } },
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
    { en: 'One stream to two: the data part halves exactly, 81.6 µs to 40.8 µs. Two to four would halve it again to 20.4 µs, but frames are sent in whole symbols, so it stops at 27.2 µs.', zh: '从 1 条流到 2 条流：数据部分正好减半，81.6 µs 变成 40.8 µs。从 2 条到 4 条本该再减半到 20.4 µs，但帧只能按整数个符号发送，所以停在 27.2 µs。' },
    { en: 'The rate line reads MCS 13 in every variant, one stream or four, 20 MHz or 160: on this desk not even the widest channel’s extra noise takes a modulation step away. Streams never could — they reuse the same subcarriers — and the width only would further out, where lesson 15’s experiment shows it costing one step, then two.', zh: '每个变体的“速率”一行都是 MCS 13：一条流也好四条流也好，20 MHz 也好 160 MHz 也好——在这张桌子上，连最宽信道多收的那份噪声也没能拿走一档调制。空间流本来就拿不走——它复用的是同一批子载波；带宽则要再挪远一些才会拿走，第 15 课的实验里它先拿走一档，再拿走两档。' },
    { en: 'Router 4 · Phone 2 is indistinguishable from 2 streams: the same 88.8 µs, the same blocks in the same places.', zh: '“路由器 4 · 手机 2”和“2 条流”看不出区别：同样是 88.8 µs，同样的块出现在同样的位置。' },
  ],
  tryThis: [
    { en: 'Put 2 streams and Router 4 · Phone 2 side by side and hunt for a difference on the timeline. There is none — the router’s extra pair has nobody to talk to.', zh: '把“2 条流”和“路由器 4 · 手机 2”放在一起对比，在时间轴上找不同。找不到——路由器多出来的那对流没有对象可说话。' },
    { en: 'Compare 2 streams here with 40 MHz in lesson 15: both take 88.8 µs for the same frame. Only one of them asked the laptop for 3 dB more signal.', zh: '把这里的“2 条流”和第 15 课的 40 MHz 比一比：同一个帧都是 88.8 µs。但只有其中一个向笔记本多要了 3 dB 的信号。' },
    { en: 'Click 160 MHz · 4 streams, then 4 streams: 61.6 µs against 75.2 µs. Eight times the tones on top of four streams buys exactly one symbol.', zh: '先点“160 MHz · 4 条流”，再点“4 条流”：61.6 µs 对 75.2 µs。在四条流之上再加八倍的子载波，只换来一个符号。' },
  ],
  quiz: [
    {
      q: { en: 'Why does adding a spatial stream cost no sensitivity, when doubling the channel width does?', zh: '为什么加一条空间流不用付灵敏度的代价，而带宽翻倍就要付？' },
      options: [
        { en: 'Streams are transmitted at higher power', zh: '空间流的发射功率更高' },
        { en: 'The channel is still the same width, so the receiver takes in the same noise — the streams are separated by space, not by frequency', zh: '信道宽度没变，接收方收进的噪声也没变——两条流靠空间区分，不靠频率' },
        { en: 'The extra streams are sent on a second channel', zh: '多出来的那些流是在另一条信道上发的' },
      ],
      answer: 1,
      explain: { en: 'Noise power follows bandwidth. Doubling the width doubles it (3 dB); a second stream reuses the same subcarriers, so the noise floor and the MCS thresholds do not move at all.', zh: '噪声功率跟着带宽走。带宽翻倍，噪声也翻倍（3 dB）；而第二条流复用的是同一批子载波，噪声底和各档 MCS 门限完全不动。' },
    },
    {
      q: { en: 'A four-stream router serves a two-stream phone. How many streams does that link use?', zh: '一台四流路由器服务一部两流手机。这条链路用几条流？' },
      options: [
        { en: 'Four — the router decides', zh: '四条——路由器说了算' },
        { en: 'Two — a link runs at the smaller stream count of its two ends', zh: '两条——链路按两端里较小的流数运行' },
        { en: 'Three — the average', zh: '三条——取平均' },
      ],
      answer: 1,
      explain: { en: 'Every capability is negotiated down to the weaker end. The link uses two, and the frame takes 88.8 µs: the two-stream time, not the four-stream 75.2 µs.', zh: '所有能力都要按较弱的一端协商。链路用两条流，帧要 88.8 µs——两流的时间，而不是四流的 75.2 µs。' },
    },
  ],
}
