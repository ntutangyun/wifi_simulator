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
 * **Stays whole** in the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M9): "the
 * leanest lesson in the course already". What it loses:
 *  - 「白送的那个倍数」(§5.2) — the multiplier is free of noise, which the
 *    paragraph says in the engine's own terms; it does not need the phrase;
 *  - the MU-MIMO preview cut to one sentence (§5.5) — this scene never shows it;
 *  - 「弱的一端说了算」and 「以及它到头的地方」, which restated the worked table's
 *    first two rows and the picture's own closing paragraph; the stack figure
 *    (§4) carries the negotiation, and the second table's 等同于 column the rest.
 *
 * The scenario builder and the five variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/streams.test.ts.
 *
 * CAUTION — 25 Chinese characters from `lessonMinutes` rounding this lesson up from 25 to 30
 * minutes. Measure before adding a sentence, and import `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/
 * `TRY_MINUTES` from `curriculum.ts` rather than retyping them — the controller got all three
 * wrong once and read a 484-character margin where there were four. What goes red is the
 * course-wide minute total in tests/course/readability.test.ts, and nothing in this lesson's own
 * test; the answer there is to re-pace or split, never the equality, because that sum is the only
 * thing in the suite that notices a lesson crossing a five-minute bucket. The three figures in
 * this note are checked rather than hand-written — the same file recomputes them.
 */
import type { StackSpec } from '../diagram'
import { type Lesson, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

/**
 * The mixed variant, as three nested limits: the router's four antennas, the
 * laptop's two, and the two streams the link therefore runs. Sized by the counts
 * themselves, so the innermost box is visibly the smaller end's — which is the
 * whole rule (`negotiatedNss` in src/model/caps.ts takes the minimum of the two
 * ends, and this simulator never falls back stream by stream).
 *
 * It replaces the paragraph that worked the 4-against-2 example in prose and the
 * one that restated the worked table's first two rows.
 */
export function streamsNegotiationStack(): StackSpec {
  return {
    kind: 'stack',
    mode: 'nested',
    label: '路由器 4 · 手机 2',
    layers: [
      { label: '路由器 4 根天线', bytes: 4 },
      { label: '手机 2 根天线', bytes: 2, note: '发送的是它，两端取较小者' },
      { label: '链路跑 2 条流', bytes: 2, note: '每符号 4680 比特' },
    ],
    total: '一帧 88.8 µs——两流的时间',
  }
}

export const streams: Lesson = {
  id: 'streams',
  module: 8,
  title: '空间流——同一批子载波上并行的几路信号',
  why: '上一课是用更宽的频段来缩短同一帧的发送时间。还有第二种办法，而且一点额外的频段都不用花：给链路（link）的两端各装上更多天线（antenna），它们就能在同一瞬间、在频段上的同一个位置发出不同的信号，接收端照样分得开。这一课讲的是：这样能换来什么，它对两端各有什么要求，以及到什么地方它就换不来任何东西了。',
  outcomes: [
    '说出多根天线怎样在同一批子载波（sub-carrier）上同时发出不同的信号',
    '根据两端各有几根天线，算出这条链路实际跑几条流',
    '说清带宽与空间流（spatial stream）这两个倍数里，哪个要拿信号去换，哪个不用',
  ],
  needs: ['width'],
  terms: [
    { term: 'spatial stream', plain: '在同一瞬间、同一批子载波上发出的好几路信号中的一路，靠各自走过的路径区分开来' },
    { term: 'antenna', plain: '天线：电台靠它把信号送出去、收进来；想发或想收几条流，就得有几根' },
  ],
  picture: [
  {
    heading: '同一瞬间，同一批子载波，两路不同的信号',
    text: '两端各装两根天线。发送的那一瞬间，两根发送天线各发出一路自己的信号，用的是同一批子载波：两路在频段上完全重合，一点额外的频段也没有占。于是接收端那两根天线收到的都是两路叠在一起的信号，而两路各自原来是什么得由它还原出来。',
  },
  {
    kind: 'watch', jump: 0, heading: '去看一眼',
    text: '载入仿真，跳到第一个数据帧（data frame）。这一课打开的是单流；上面的按钮把它切到两条流、四条流，再切到两个混合的情形。变的只有那个蓝色数据块。还原那一步在这里没有东西可看。',
  },
  {
    heading: '接收端凭什么分得开',
    text: '信号从一根发送天线出来不是只走一条路：一部分直接过去，一部分先碰到墙面和家具再折回来，各条路的长短和强弱都不同。两根发送天线不在同一个位置上，所以它们到同一根接收天线走的不是同一组路。于是这根接收天线收到的，是两路信号按某一组比例叠在一起的结果，而比例由那两组路径决定。接收端的另一根天线在另一个位置上，它那两组路径又都和刚才不一样，收到的就是另一组比例。两根接收天线因此给出两个互不相同的叠加结果，而要还原的只有两路信号：两个不同的结果够还原两个未知的东西。比例不是猜的：前导码（preamble）里有专为此而发的已知图样，流数越多它就越长；接收端拿它量出此刻的比例，数据部分再按比例还原。还原这一步本仿真器不建模，它只按流数去乘一格里装的比特数。',
  },
  {
    heading: '于是两端各要几根天线，不必另外规定',
    text: '想在同一瞬间发出几路信号，发送端就得有几根天线，因为一根天线在一个瞬间只发得出一路。想把几路还原出来，接收端就得有几个互不相同的叠加结果，也就是几根天线：少一根就少一个结果，要还原的东西却没少，那一路就还原不出来。所以一条链路按两端里较小的那个数运行——多出来的那些天线并没有浪费，只是得另外找一台设备去服务。',
  },
  {
    heading: '这样换来的是什么',
    text: '并行的每一路就是一条空间流。它换来的是：一格时间里装得下的比特数，按流数翻倍。那一格时间在标准里叫一个符号（symbol），本课后面那张表数的就是它：两条流的一个符号装的数据比特是一条流的两倍，和子载波变多的效果一样。',
  },
  // carried over verbatim from the current lesson
  {
    heading: '不必多付噪声的那个倍数',
    text: '和带宽的区别在于代价。信道变宽，接收端就要多收进一份噪声；而多加一条流不会——信道还是原来那么大，噪声地板（noise floor）不动，速率阶梯上每一级调制与编码方式（modulation and coding scheme, MCS）所要的信号也不动。所以在本仿真器里，空间流这个倍数不必拿信号去换，而带宽那个倍数每翻一倍都要付 3 dB。一间满是反射的屋子里也差不多：那里的路径多，两路信号本来就叠得很不一样。',
  },
  // carried over, minus the now-duplicate 符号（symbol） bracket: 符号 is introduced
  // three blocks earlier, so the bracket moved there with it
  {
    heading: '倍数到头的地方',
    text: '倍数只在还有东西可分的时候才有用。把最宽的信道和最多的流一起用上，帧并不会比单用最宽信道时更短：它那时就已经只剩一个符号，而一个符号就是下限。在那里空间流什么也没换来——而宽信道多收进来的噪声一分不少，这一段代价就完全浪费了。',
  },
  ],
  numbers: [
    { kind: 'table', heading: '同一个 1500 字节的帧（空口上 1530 字节），20 MHz，MCS 13', head: [
      '空间流（条）', '每符号比特数（比特）',
      '符号数（个）', '空口时间（µs）',
    ], rows: [
      ['1', '2340', '6', '129.6'],
      ['2', '4680', '3', '88.8'],
      ['4', '9360', '2', '75.2'],
    ] },
    { heading: '「符号」在标准里是两样东西', text: '一是**正交频分复用（orthogonal frequency-division multiplexing, OFDM）符号**，它是时间上的一格：标准把符号间隔定义成 T_SYM = T_DFT + T_GI，也就是一次反变换的输出再加上一段保护间隔，这里是 13.6 µs。**一台设备在同一时刻只发得出一个 OFDM 符号**，一帧要几个就一个接一个地发几个，空口时间（airtime）数的就是它。二是**星座点**：标准里那一步叫星座映射器，它把每条空间流的比特映射成星座点，也就是一个个复数。**每一根数据子载波、在每一条空间流上，各自带一个星座点**——所以一个 OFDM 符号里并排着 N_SD × N_SS 个星座点。于是你的那个数是对的，只是它数的是星座点而不是 OFDM 符号：20 MHz 四条流就是 234 × 4 = 936 个并排的星座点，每个带 12 个原始比特，六分之五是数据，合起来 9360。标准自己的词也是按这个层级搭的：每子载波每空间流的比特数，到每符号每空间流的比特数，再到每符号的比特数——**三个名字里的「符号」全都指那一格时间**。' },
    { heading: '所以频率、空间是并行的，时间是串行的', text: '更多子载波和更多空间流是同一件事的两个方向：一个在频率上铺开，一个在空间上叠起来，而它们都只增加**一格时间里装得下多少**，不增加一次能发几格。时间是串行的。这也正是上一节那个「到头了」的来历——一帧压到只剩一个符号之后就压不动了，因为符号是时间上不可再分的那一格；这时候再给它更多子载波或更多流，多出来的容量没有地方去。（多用户（multi-user, MU）那一种是把同一个 OFDM 符号按频率分给几台设备，不是让谁多拿一格。）' },
    { heading: '一个符号为什么装得下九千多个比特', text: '因为一个符号不是一个比特的时长，而是 13.6 µs 里**同时**发出去的一整排。20 MHz 上有 234 根数据子载波并排着（第三十三课那张表里的第一行），本课这一级用的是 4096-QAM（quadrature amplitude modulation），每根子载波一次携带 12 个比特；其中五分之六是数据、六分之一是纠错码带走的冗余。于是一条流一个符号装 234 × 12 × 5/6 = 2340 个数据比特，四条流就是它的四倍，9360。换成速率就是 9360 ÷ 13.6 µs = 688.2 Mb/s，而一条流那一行正好是第三十三课反复出现的那个 172.1 Mb/s——两课算的是同一件事，只是那一课固定一条流去变带宽，这一课固定带宽去变流数。' },
    {
      kind: 'diagram', heading: '混合搭配时，流数由哪一端决定',
      spec: streamsNegotiationStack(),
      caption: '路由器有四根，发送的这台只有两根，于是链路跑两条流：落在两流的 88.8 µs 上，而不是四流的 75.2 µs。逐帧去比，它和纯粹的两流那一次跑完全看不出区别。',
    },
    { kind: 'table', heading: '两个混合变体', head: [
      '变体', '链路实际跑的流数',
      '空口时间', '等同于',
    ], rows: [
      ['路由器 4 · 手机 2', '2', '88.8 µs', '上表里 2 条流那一行'],
      ['160 MHz · 4 条流', '4', '61.6 µs', '上一课里单靠 160 MHz 的结果'],
    ] },
    { kind: 'steps', heading: '多一条流到底改变了什么，一步一步', items: [
      '两端各自报出自己能跑几条流——有几根天线就是几条——链路取两者中较小的那个数。',
      '照上一课的办法选级。信道并没有变宽，噪声地板没动，每一级的要求也没动：流数根本就不是这一步的输入。',
      '每符号比特数 = 该级在 20 MHz 下的每符号比特数，乘以带宽的子载波倍数，再乘以流数。多一条流，效果和多一份子载波完全一样。',
      '符号数 = 这一帧的比特数除以它，再向上取整成整数个符号。如果多出来的那条流只是削掉最后那个没装满的符号，它就什么也没换来。',
      '空口时间（airtime）= 48 µs 的前导码（preamble），加上每个符号 13.6 µs。无论跑几条流，前导码都按同样的方式发出去，所以它从不变短。',
    ] },
    { kind: 'table', heading: '四条流，以及那个混合搭配，照着步骤走一遍', head: [
      '步骤', '4 条流', '路由器 4 · 手机 2',
    ], rows: [
      ['两端各能跑几条', '4 和 4', '4 和 2'],
      ['于是链路跑', '4', '2'],
      ['级别，不受流数影响', 'MCS 13', 'MCS 13'],
      ['每符号比特数：20 MHz 的值 × 流数', '2340 × 4 = 9360', '2340 × 2 = 4680'],
      ['符号数：⌈12262 ÷ 它⌉', '2', '3'],
      ['空口时间：48 + 13.6 × 符号数', '75.2 µs', '88.8 µs'],
    ] },
  ],
  deeper: [
    { heading: '多出来的那一对流做什么用', text: '路由器可以在同一瞬间把另外两条流指向第二部手机——那是 MU-MIMO（多用户 MIMO），本模块后面有专门的一课，这张只有一台站点的桌子上看不到它。' },
    { heading: '为什么路径必须不一样', text: '把几条流分开，本质是解线性方程：接收端解一个小方程组，每根接收天线给出一行。只有当这些行真的互不相同——也就是几路信号真的沿着明显不同的路径到达——方程才解得开。反射很多的房间（住宅、办公室）对空间流很友好；空旷野地上干干净净的直视路径则是最差情形，那里第二条流几乎带不来任何增益。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '一条流在这里不付任何代价：txTimeModeNs 把每符号比特数直接乘上流数，而每一级所需的信噪比 reqSinrDb(mode, mcs) 连流数这个参数都没有（phy.ts）。真实设备要把同一份发射功率分摊到几条流上，每条流各自的信噪比因此下降，接收端还要解一个方程组才能把它们分开。所以本课那个四倍是上界，不是一间小屋子里真能拿到的东西。' },
    { kind: 'unmodelled', text: '引擎里根本没有信道矩阵：一对节点之间只有一个电平数（propagation.ts 的 buildLinkTable），没有天线间相关性，也没有秩这回事。于是「几条流必须走明显不同的路径」这个前提在这里从来不被检验——空旷野地上一条干干净净的直视链路，和一间满是反射的屋子，拿到的流数倍数一模一样。课文「深入一步」里说的那个最差情形，本仿真器演不出来。' },
    { kind: 'unmodelled', text: '流数一旦协商好就再也不动：negotiatedNss 取两端能力的较小值（caps.ts），而速率控制只沿着 MCS 这一个轴上下（rate.ts）。真实的速率表是（MCS，流数）的二维格子，链路一变差，设备常常先砍掉一条流而不是降调制，因为少一条流换来的信噪比比降一档更划算。本仿真器里一条链路永远跑满它协商到的流数，哪怕已经跌到最底一级。' },
    { kind: 'out-of-scope', text: '这张桌子上只有一台站点，所以「路由器 4 · 手机 2」那一栏里多出来的两条流在本课是彻底闲着的，时间轴上和纯粹的两流一格都不差。这不是模型的缺陷，是这个场景的边界：把那两条流同时指给第二台设备能换来什么，本课一个数也量不出来。要看它，得换一个至少有两台设备同时排着队的房间。', until: 'mumimo' },
  ],
  sources: [
    '前导码里那段专为信道估计而发的已知图样见 IEEE Std 802.11be-2024 的 §36.3.12.10（EHT-LTF）；而「流数越多它就越长」出自同一章的 Table 36-43——不同空间流数所需的 EHT-LTF 初始个数是 1、2、4、4，不是一条流各一份。',
    '每符号比特数来自 802.11be 的参数集：最高调制下 20 MHz 的一个符号装 2340 个数据比特，再乘以流数（IEEE Std 802.11-2024 第 36 章及其修正案）。符号间隔 T_SYM = T_DFT + T_GI 的定义见 §21.3.4 的时间参数表；星座映射器把每条空间流的比特映射成星座点这一步见 §19.3.3 的发送框图；而「每子载波每空间流的比特数」「每符号每空间流的比特数」「每符号的比特数」三个量的定义见 §19.3.1 的符号表——三者里的「符号」都指 OFDM 符号那一格时间。',
    '“链路按两端较小的流数运行”出自 §9.4.2.x 与 §11.3 的能力协商；本仿真器把它建模为两者取最小，且不做逐流回退。',
    '仿真器让每条流的质量都一样：天线之间不相关，直视路径下也不掉秩。现实里小房间中的四流链路，很少真能拿到完整的倍数。',
  ],
  scenario: () => widthScenario(20, 1),
  variants: [
    { label: '1 条流', scenario: () => widthScenario(20, 1) },
    { label: '2 条流', scenario: () => widthScenario(20, 2) },
    { label: '4 条流', scenario: () => widthScenario(20, 4) },
    { label: '路由器 4 · 手机 2', scenario: () => widthScenario(20, 2, 4) },
    { label: '160 MHz · 4 条流', scenario: () => widthScenario(160, 4) },
  ],
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '从一条流到两条流：数据部分正好减半，81.6 µs 变 40.8 µs。从两条到四条本该再减半到 20.4 µs，但帧只能按整数个符号发出去，所以停在 27.2 µs。',
    '每个变体的“速率”一行都是 MCS 13：一条流也好四条流也好，20 MHz 也好 160 MHz 也好。空间流复用的是同一批子载波，所以它永远拿不走一档调制（modulation）；而在这张桌子上，连最宽信道多收的那份噪声也没拿走。',
    '“路由器 4 · 手机 2”和“2 条流”看不出区别：同样是 88.8 µs，同样的块出现在同样的位置。',
  ],
  tryThis: [
    '把“2 条流”和“路由器 4 · 手机 2”并排放在一起，在时间轴上找不同。找不到——路由器多出来的那一对流没有可服务的对象。',
    '再把这里的“2 条流”和上一课的 40 MHz 变体比一比：同一个帧，同样的 88.8 µs。但两者之中，只有一个向笔记本多要了 3 dB 的信号。',
  ],
  quiz: [
    {
      q: '为什么加一条空间流不必向发送端多要信号，而带宽翻倍就要？',
      options: [
        '空间流的发射功率（transmit power）更高',
        '信道宽度没变，接收端收进的噪声也没变——两条流靠空间区分，不靠频率',
        '多出来的那些流是在另一条信道上发的',
      ],
      answer: 1,
      explain: '噪声功率跟着信道宽度走。带宽翻倍，噪声也翻倍，这就是那 3 dB；而第二条流复用的是同一批子载波，噪声地板不动，速率阶梯上每一级所要的信号也纹丝不动。',
    },
    {
      q: '一台四根天线的路由器服务一部两根天线的手机。这条链路用几条流？',
      options: [
        '四条——由路由器的天线数决定',
        '两条——链路按两端里较小的流数运行',
        '三条——取两端的平均',
      ],
      answer: 1,
      explain: '所有能力都要按较弱的一端协商。链路用两条流，帧要 88.8 µs——两流的时间，而不是四流的 75.2 µs。',
    },
  ],
}
