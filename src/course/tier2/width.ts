/**
 * Wi-Fi Tier 2 · M4 · Capacity knobs · Channel width.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): a wider
 * channel is more lanes, not a faster car; what the extra lanes cost in noise
 * and in neighbours; why the opening of a frame never shrinks. The one-decibel
 * inversion window and the legacy fallback are in `deeper`; the numerology and
 * the clause numbers are in `sources`.
 *
 * The scenario builder and the four variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/width.test.ts.
 */
import { type Lesson, N, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

export const width: Lesson = {
  id: 'width',
  module: 3,
  title: { en: 'Channel width — more lanes, not a faster car', zh: '信道带宽——多开几条车道，而不是换一辆快车' },
  why: {
    en: 'Every lesson so far has been about sharing the air. This one is about how much one frame gets out of it once its turn comes. Give a link a wider block of the band and the same frame takes less time to send. It is the simplest speed knob there is, and the one with a bill attached: a wider block lets in more noise along with the signal, so the knob that shortens a frame on the desk can kill the link at the far wall.',
    zh: '到目前为止的每一课讲的都是怎么分享空口。这一课讲的是：轮到自己发的时候，一帧能从空口里拿到多少。可以给一条链路划一块更宽的频段，同一帧发完所需的时间就更短。这是最简单的一个提速旋钮，但它带着一张账单：频段越宽，混进来的噪声也越多。同一个旋钮，在书桌旁能把帧变短，到了远端墙边却可能把链路整个弄断。',
  },
  outcomes: [
    { en: 'say why doubling the width never halves the frame', zh: '说出带宽翻倍为什么从来不会让一帧的时间减半' },
    { en: 'read one frame’s airtime off the timeline at each of the four widths', zh: '在时间轴上读出同一帧在四种带宽下各自的空口时间' },
    { en: 'choose between a wide channel and a robust one for a station at the edge of range', zh: '为一台处在覆盖边缘的终端，在“宽”和“稳”之间做出选择' },
  ],
  needs: ['decode-thresholds', 'airtime'],
  terms: [
    { term: 'channel width', plain: {
      en: 'how big a block of the band one link uses: 20, 40, 80 or 160 MHz',
      zh: '一条链路占用的频段有多宽：20、40、80 或 160 MHz',
    } },
    { term: 'sub-carrier', plain: {
      en: 'one of the narrow tones a channel is split into; each carries a few bits at a time',
      zh: '信道被切成的一根根窄音调中的一根，每根每次驮几个比特',
    } },
    { term: 'symbol', plain: {
      en: 'one equal-length chunk of signal; a frame’s data always comes out as a whole number of them',
      zh: '一段等长的信号块；一帧的数据永远是整数个这样的块发出去的',
    } },
    { term: 'noise floor', plain: {
      en: 'the background power a receiver hears when nobody is talking',
      zh: '没人说话时，接收端听到的那份背景功率',
    } },
  ],
  picture: [
    { heading: { en: 'More lanes, not a faster car', zh: '多开车道，不是换快车' }, text: {
      en: 'A wider channel does not make the radio talk faster. It gives the radio more room to talk in at once. Wi-Fi splits whatever block of band it has into narrow sub-carriers and loads each one with the same few bits, so twice the channel width is twice the sub-carriers and twice the bits in every chunk of signal. The car is no quicker; the road has more lanes, and the same load clears it in fewer chunks.',
      zh: '信道变宽，并不是让电台说得更快，而是让它一次有更大的地方可说。Wi-Fi 会把手里那块频段切成一根根很窄的子载波，每根装的比特数是一样的；所以信道带宽翻倍，子载波数就翻倍，每一块信号里装的比特数也翻倍。车并没有变快，是路上多了几条车道，同样一车比特用更少的块就跑完了。',
    } },
    { heading: { en: 'The part that never shrinks', zh: '从来不会变短的那一段' }, text: {
      en: 'Only the data part of a frame rides those sub-carriers. In front of it sits the preamble — the fixed pattern the receiver locks on to — the same length at every width. Nor can the data be cut finer than one whole symbol: a leftover rounds up to a full one. A wider channel shortens the part that can shrink and leaves the rest where it was.',
      zh: '一帧里只有数据那一段是骑在子载波上的。它前面还有前导——接收端用来锁住这一帧的那段固定图案——在任何带宽下都一样长。而且数据也不能切得比一个完整的符号更细：除不尽的零头，总要向上凑成一个完整符号。所以信道变宽，缩短的只是能缩的那一段，其余原地不动。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the laptop’s first data frame. The lesson opens on the widest channel; step the buttons down and back up, and watch that one blue block change length while everything around it stays put.',
      zh: '载入仿真，跳到笔记本的第一个数据帧。这一课打开的是最宽的一档；用上面的按钮逐档调窄再调回来，盯住那个蓝色数据块——只有它在变长变短，周围一切纹丝不动。',
    } },
    { heading: { en: 'The bill is noise', zh: '账单付的是噪声' }, text: {
      en: 'A wider door lets in more of everything, the room’s background hiss included. Double the width and the noise floor rises with it, so every rung of the rate ladder now wants a stronger signal. Note what this bill is and is not: it buys nothing against another station talking over you, whose signal grows with the width exactly as your own does. What a wide channel spends is reach.',
      zh: '门开得越大，进来的东西就越多，屋里的背景嘶声也一样。带宽翻倍，噪声底就跟着抬高，于是速率阶梯上的每一级，现在都要比原来更强的信号才撑得住。但要看清这笔账付的是什么、不是什么：它对“另一台终端压着你说话”毫无帮助——对方的信号会随带宽一起变大，和你自己的一模一样。宽信道花掉的，是覆盖距离。',
    } },
    { heading: { en: 'When wider comes out slower', zh: '更宽反而更慢的时候' }, text: {
      en: 'That bill can grow larger than the goods. Out towards the edge of the flat, a wider channel asks for more signal than the room has left to give, so the link falls to a slower rung and the frame comes out longer than it was on the narrow channel. Twice the sub-carriers cannot pay for a rate that fell by more than half.',
      zh: '这张账单有时会大过货品本身。往屋子边缘走，宽信道要的信号比这个位置拿得出来的更多，于是链路掉到更慢的一级，同一帧发出来反而比在窄信道上更长。子载波翻一倍，补不回速率掉了一半还多的窟窿。',
    } },
    { heading: { en: 'And the neighbours', zh: '还有邻居' }, text: {
      en: 'A wide channel is also wider in everybody else’s ears: it covers more of the band, so more of the other networks in the building must wait for you, and you for them. Where the air is empty, width is free money. In a block of flats the fastest setting on paper can turn out to be the slowest one in the room.',
      zh: '信道宽，在所有邻居耳朵里也一样宽：它盖住的频段更多，于是楼里更多的其它网络得等你，你也得等它们。空口很空的时候，带宽是白捡的便宜；可在一栋住宅楼里，纸面上最快的那一档，到了真实的房间里反倒最慢。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'One 1500-byte frame (1530 octets on the air), Wi-Fi 7, one stream, on the desk',
      zh: '同一个 1500 字节的帧（空口上 1530 字节），Wi-Fi 7，单流，就在书桌上',
    }, head: [
      { en: 'Width', zh: '带宽' }, { en: 'Data sub-carriers', zh: '数据子载波' },
      { en: 'MCS', zh: 'MCS' }, { en: 'Rate line', zh: '速率一行' },
      { en: 'Symbols', zh: '符号数' }, { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [N('20 MHz'), N('234'), N('13'), N('172.1 Mbps'), N('6'), N('129.6 µs')],
      [N('40 MHz'), N('468'), N('13'), N('172.1 Mbps'), N('3'), N('88.8 µs')],
      [N('80 MHz'), N('980'), N('13'), N('172.1 Mbps'), N('2'), N('75.2 µs')],
      [N('160 MHz'), N('1960'), N('13'), N('172.1 Mbps'), N('1'), N('61.6 µs')],
    ] },
    { kind: 'formula', heading: { en: 'Where the airtime goes', zh: '空口时间花在哪儿' }, text: {
      en: 'airtime = 48 µs + 13.6 µs × ⌈(16 + 8·bytes + 6) ÷ (bits per symbol at 20 MHz × sub-carrier ratio)⌉',
      zh: '空口时间 = 48 µs + 13.6 µs × ⌈(16 + 8·字节数 + 6) ÷ (20 MHz 下每符号比特数 × 子载波倍数)⌉',
    }, note: {
      en: 'The opening never moves and the ceiling brackets round a leftover up to a whole symbol. The step to 80 MHz gives slightly more than four times the sub-carriers of 20 MHz, because the quiet edges of a channel are paid once across the block rather than once per 20 MHz.',
      zh: '开场那一段永远不动，而向上取整的括号把零头凑成一个完整符号。到 80 MHz 那一步给的子载波比 20 MHz 的四倍还多一点点：信道两端那截安静的边沿，是整块频段付一次，而不是每 20 MHz 付一次。',
    } },
    { heading: { en: 'What the width costs in noise', zh: '带宽在噪声上的代价' }, text: {
      en: 'Each doubling of the width takes in twice the noise power — 3 dB — so the widest channel here needs about 9 dB more signal than the narrowest. On this desk that is affordable: the link holds the top rung with 48.7 dB of signal against noise where that rung asks for 48.0.',
      zh: '带宽每翻一倍，收进来的噪声功率也翻一倍——3 dB——所以这里最宽的一档要比最窄的一档多约 9 dB 信号。在这张桌子上这笔钱还付得起：链路稳稳停在最高一级，信噪比 48.7 dB，而那一级要的是 48.0 dB。',
    } },
    { kind: 'table', heading: {
      en: 'The same laptop, half way into the living room',
      zh: '同一台笔记本，挪到客厅中间',
    }, head: [
      { en: 'Width', zh: '带宽' }, { en: 'MCS', zh: 'MCS' },
      { en: 'Airtime', zh: '空口时间' }, { en: 'Delivered', zh: '是否送达' },
    ], rows: [
      [N('20 MHz'), N('3'), N('415.2 µs'), { en: 'every frame', zh: '帧帧送达' }],
      [N('40 MHz'), N('3'), N('238.4 µs'), { en: 'every frame', zh: '帧帧送达' }],
      [N('80 MHz'), N('2'), N('170.4 µs'), { en: 'every frame', zh: '帧帧送达' }],
      [N('160 MHz'), N('0'), N('224.8 µs'), { en: 'every frame — and slower than 80 MHz', zh: '帧帧送达——却比 80 MHz 还慢' }],
    ] },
    { heading: { en: 'The inversion, in one line', zh: '倒挂，一句话说清' }, text: {
      en: 'The extra noise a 160 MHz channel takes in over an 80 MHz one costs two rungs at that spot, not one: the sensitivity ladder has a short 2 dB rung in it, so a 3 dB step skips straight over one. Exactly double the sub-carriers cannot pay back a third of the bits per symbol.',
      zh: '在那个位置，160 MHz 比 80 MHz 多收进来的噪声要用两级调制去换，而不是一级：灵敏度阶梯上有一档只有 2 dB 的窄阶，3 dB 的一步就把它整个跨过去了。而子载波恰好翻倍，补不回每符号比特数只剩三分之一的亏空。',
    } },
  ],
  deeper: [
    { heading: { en: 'A window one decibel wide', zh: '只有一分贝宽的窗口' }, text: {
      en: 'The inversion above is a close-run thing in both directions. The band of received power in which 160 MHz is genuinely slower than 80 MHz while both still decode every frame is only about one decibel wide. The living-room position sits at −70.51 dBm, near the middle of it, with roughly half a decibel to either edge. Move the laptop a little closer and 160 MHz wins again; a little further and it stops delivering altogether.',
      zh: '上面那个倒挂，两边都十分惊险。“160 MHz 确实比 80 MHz 慢，而两者又都还能把每一帧解出来”的接收功率区间，只有约一分贝宽。客厅那个位置落在 −70.51 dBm，靠近这个区间的正中，离两端各约半分贝。把笔记本再挪近一点，160 MHz 又赢回来；再挪远一点，它就彻底送不到了。',
    } },
    { heading: { en: 'A radio with no wide mode at all', zh: '根本没有宽信道模式的电台' }, text: {
      en: 'In the far corner, switch the laptop to 802.11a in the editor. A legacy radio has no wide mode, so the link falls back to 20 MHz — and the acknowledgements come back, at 704 µs a frame and 18 Mb/s: five and a half times the airtime the same frame took on the desk, but delivered. Narrow and old beats wide and silent.',
      zh: '在最远的角落里，到编辑器把笔记本改成 802.11a。传统电台根本没有宽信道模式，链路只能退回 20 MHz——于是确认帧回来了，每帧 704 µs、18 Mb/s：是同一帧在书桌上所花空口时间的五倍半，但它送到了。又窄又老，也强过又宽又没声。',
    } },
  ],
  sources: [
    { en: 'The 234, 468, 980 and 1960 data sub-carriers are the OFDM numerology of the 802.11be PPDU (Clause 36 of IEEE Std 802.11-2024 and its amendment), and airtime scales with these counts, not with the megahertz.',
      zh: '234、468、980、1960 这几个数据子载波数，来自 802.11be PPDU 的 OFDM 参数集（IEEE Std 802.11-2024 第 36 章及其修正案）；空口时间跟着这些子载波数走，而不是跟着兆赫数走。' },
    { en: 'The 48 µs preamble and the 13.6 µs symbol are this simulator’s single representative values for such a PPDU, not a field-by-field sum; the TXTIME formula they feed is §17.4.3.',
      zh: '48 µs 的前导与 13.6 µs 的符号，是本仿真器为这类 PPDU 取的单一代表值，并非逐字段相加的结果；它们代入的 TXTIME 公式见 §17.4.3。' },
    { en: 'The 3 dB per doubling is the thermal-noise formula kTB, with the simulator’s own noise figure; the per-rung sensitivities, including the short 2 dB rung the inversion turns on, are the minimum input sensitivity tables of Clause 36.',
      zh: '“每翻一倍 3 dB”出自热噪声公式 kTB，噪声系数用的是本仿真器自己的取值；每一级的灵敏度——包括让倒挂得以发生的那一档 2 dB 窄阶——出自第 36 章的最小输入灵敏度表。' },
  ],
  scenario: () => widthScenario(160, 1),
  variants: [
    { label: N('20 MHz'), scenario: () => widthScenario(20, 1) },
    { label: N('40 MHz'), scenario: () => widthScenario(40, 1) },
    { label: N('80 MHz'), scenario: () => widthScenario(80, 1) },
    { label: N('160 MHz'), scenario: () => widthScenario(160, 1) },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Step through the four widths and watch one blue block: 129.6 µs, 88.8, 75.2, 61.6. Doubling the width never halves the frame — the fixed opening inside each scales with nothing.', zh: '把四种带宽逐档切过去，盯住同一个蓝色数据块：129.6 µs、88.8、75.2、61.6。带宽翻倍从来不会让一帧减半——每一帧里那段固定的开场，不随任何东西缩短。' },
    { en: 'Take the fixed 48 µs opening off those four and what is left is 81.6, 40.8, 27.2 and 13.6 µs of data. Only that part ever moved, and at the widest setting it is one symbol.', zh: '把这四个数字各减掉固定的 48 µs 开场，剩下的数据分别是 81.6、40.8、27.2 和 13.6 µs。从头到尾只有这一段在动，而到了最宽的一档，它只剩一个符号。' },
    { en: 'The white ACK is identical in all four, and the rate line never moves either: 172.1 Mbps at every width, because it names what one 20 MHz sub-carrier set carries. Width lives in the airtime, never in the rate line.', zh: '四档里白色的 ACK 完全一样，“速率”那一行也从不动：四种带宽都是 172.1 Mbps，因为它报的是一组 20 MHz 子载波能装多少。带宽体现在空口时间里，从不体现在速率那一行。' },
  ],
  tryThis: [
    { en: 'Open in editor and drag the laptop seven and a half squares right of the router and two down, half way into the living room. Every width still delivers there, and the widest is no longer the quickest: the second table above is that spot.', zh: '点“在编辑器中打开”，把笔记本拖到路由器右边七格半、下面两格，大约客厅正中。四种带宽在那里仍然帧帧送达，但最宽的一档已经不是最快的了：上面第二张表说的就是这个位置。' },
    { en: 'Keep going into the far corner. At the widest setting not one ACK comes back. Step the width down and the link returns — 80 MHz delivers at 401.6 µs a frame, 20 MHz at 524.0, and 40 MHz, one rung lower still, is slowest of the three at 768.8.', zh: '继续挪到最远的角落。在最宽的一档，一个 ACK 也回不来。把带宽逐档调窄，链路就回来了——80 MHz 每帧 401.6 µs，20 MHz 524.0 µs，而 40 MHz 卡在更低一级上，是三者中最慢的 768.8 µs。' },
  ],
  quiz: [
    {
      q: { en: 'This frame takes 129.6 µs at the narrowest width and 61.6 µs at the widest, with eight times the sub-carriers. Why not an eighth of the time?', zh: '这一帧在最窄的一档要 129.6 µs；到最宽的一档，子载波是八倍，却仍要 61.6 µs。为什么不是八分之一？' },
      options: [
        { en: 'The ACK grows as the data frame shrinks', zh: '数据帧变短，ACK 就会变长' },
        { en: 'A fixed opening sits in front of the data, and the data itself cannot be shorter than one whole symbol', zh: '数据前面有一段固定的开场，而数据本身最短也不能少于一个完整符号' },
        { en: 'Wide channels are transmitted at lower power', zh: '宽信道的发射功率更低' },
      ],
      answer: 1,
      explain: { en: 'Only the data part scales: 81.6 µs of symbols becomes one 13.6 µs symbol. The 48 µs opening does not move, and is now more than three quarters of the frame.', zh: '按比例缩短的只有数据部分：81.6 µs 的符号最后只剩一个 13.6 µs 的符号。48 µs 的开场纹丝不动，此时已占了整帧四分之三以上。' },
    },
    {
      q: { en: 'Your phone is at the edge of range. Does moving it from the widest channel to a narrower one make it faster or slower?', zh: '手机在覆盖边缘。把它从最宽的信道换到窄一些的，是更快还是更慢？' },
      options: [
        { en: 'Slower — a quarter of the sub-carriers, a quarter of the speed', zh: '更慢——子载波只剩四分之一，速度也只剩四分之一' },
        { en: 'Usually faster: once the signal is weak, the sensitivity a narrow channel gives back is worth more than the sub-carriers it gives up', zh: '通常更快：信号已经勉强时，窄信道换回来的灵敏度，比让出去的那些子载波更值钱' },
        { en: 'No difference — width does not affect range', zh: '没区别——带宽不影响覆盖' },
      ],
      answer: 1,
      explain: { en: 'From the far corner of this flat the 160 MHz variant delivers nothing at all, while 20, 40 and 80 MHz still get frames through. Which of the three is quickest there is a second question.', zh: '在这套房子最远的角落里，160 MHz 一帧也送不到，而 20、40、80 MHz 依然能把帧送出去。这三者谁更快，是另一个问题。' },
    },
  ],
}
