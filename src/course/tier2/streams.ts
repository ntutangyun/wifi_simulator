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
      { label: '链路使用 2 条流', bytes: 2, note: '每符号 4680 比特' },
    ],
    total: '一帧 88.8 µs——两流的时间',
  }
}

export const streams: Lesson = {
  id: 'streams',
  module: 8,
  title: '空间流——同一批子载波上并行的几路信号',
  why: '上一课是用更宽的频段来缩短同一帧的发送时间。还有第二种办法，而且不需要任何额外的频段：给链路（link）的两端各配备更多天线（antenna），它们就能在同一时刻、在同一段频率上发出不同的信号，接收端仍然能将它们分离。能够分离，是因为每根发送天线到每根接收天线经过的是不同的一组路径，每根接收天线收到的都是几路信号按各自不同的比例叠加的结果，几个互不相同的结果就足以还原几路信号；比例由前导码（preamble）中专门为此发送的已知序列测得（还原这一步本仿真器不建模，只按流数乘以比特数）。并行的每一路是一条空间流（spatial stream），一个符号（symbol）承载的比特按流数成倍增加，效果和子载波（sub-carrier）成倍增加完全相同。区别在于代价：信道没有变宽，噪声地板（noise floor）不变，速率阶梯上每一级所需的信号也不变，所以这个倍数不需要以信号为代价，而带宽每翻一倍都要多接收一倍的噪声。一条链路使用几条流，取两端天线数中较小的那个：四根天线的路由器与两根天线的手机通信，使用的就是两条流，与纯粹的两流逐帧比较没有区别。这个倍数也有极限：帧只能按整数个符号发送，所以从两条流到四条流，时间减少不到一半；最宽的信道上一帧本来就只剩一个符号，再增加流数也没有任何收益。',
  outcomes: [
    '说明多根天线如何在同一批子载波（sub-carrier）上同时发出不同的信号',
    '根据两端各有几根天线，算出这条链路实际使用几条流',
    '说明带宽与空间流（spatial stream）这两个倍数中，哪个需要以信号为代价，哪个不需要',
  ],
  needs: ['width'],
  terms: [
    { term: 'spatial stream', plain: '在同一时刻、同一批子载波上发出的多路信号中的一路，依靠各自经过的路径加以区分' },
    { term: 'antenna', plain: '天线：电台通过它发射和接收信号；要发送或接收几条流，就需要几根' },
  ],
  picture: [
  {
    heading: '同一时刻，同一批子载波，两路不同的信号',
    text: '两端各配备两根天线。发送时，两根发送天线各发出一路自己的信号，使用的是同一批子载波：两路在频率上完全重合，没有占用任何额外的频段。于是接收端那两根天线收到的都是两路叠加在一起的信号，两路各自原来的内容需要由接收端还原。',
  },
  {
    kind: 'watch', jump: 0, heading: '观察数据块',
    text: '载入仿真，跳到第一个数据帧（data frame）。这一课默认载入的是单流；用上面的按钮切换到两条流、四条流，再切换到两种混合的情形。变化的只有那个蓝色数据块。还原那一步在这里无法观察。',
  },
  {
    heading: '接收端如何将它们分离',
    text: '信号从一根发送天线发出后不只沿一条路径传播：一部分直接到达，一部分先经墙面和家具反射再到达，各条路径的长度和强弱都不同。两根发送天线不在同一个位置，所以它们到同一根接收天线经过的不是同一组路径。于是这根接收天线收到的，是两路信号按某一组比例叠加的结果，而比例由那两组路径决定。接收端的另一根天线在另一个位置，它的两组路径又都与前者不同，收到的就是另一组比例。两根接收天线因此给出两个互不相同的叠加结果，而要还原的只有两路信号：两个不同的结果足以求解两个未知量。比例不是猜测的：前导码（preamble）中有专门为此发送的已知序列，流数越多它就越长；接收端用它测得此刻的比例，再据此还原数据部分。还原这一步本仿真器不建模，它只按流数乘以一个符号内承载的比特数。',
  },
  {
    heading: '因此两端各需要几根天线，无需另行规定',
    text: '要在同一时刻发出几路信号，发送端就需要几根天线，因为一根天线在同一时刻只能发出一路。要把几路信号还原出来，接收端就需要几个互不相同的叠加结果，也就是几根天线：少一根就少一个结果，而要还原的未知量没有减少，那一路就无法还原。所以一条链路按两端中较小的那个数运行——多出来的那些天线并没有浪费，只是需要用来服务另一台设备。',
  },
  {
    heading: '由此获得的收益',
    text: '并行的每一路就是一条空间流。它带来的收益是：一个时间单位内能承载的比特数，按流数成倍增加。这个时间单位在标准里称为一个符号（symbol），本课后面那张表统计的就是它：两条流的一个符号承载的数据比特是一条流的两倍，和子载波增多的效果相同。',
  },
  // carried over verbatim from the current lesson
  {
    heading: '不必多付噪声的那个倍数',
    text: '和带宽的区别在于代价。信道变宽，接收端就要多接收一份噪声；而增加一条流不会——信道仍是原来的宽度，噪声地板（noise floor）不变，速率阶梯上每一级调制与编码方式（modulation and coding scheme, MCS）所需的信号也不变。所以在本仿真器里，空间流这个倍数不需要以信号为代价，而带宽那个倍数每翻一倍都要付出 3 dB。在一间反射丰富的屋子里情况也大致如此：那里的路径多，两路信号的叠加比例本来就差别很大。',
  },
  // carried over, minus the now-duplicate 符号（symbol） bracket: 符号 is introduced
  // three blocks earlier, so the bracket moved there with it
  {
    heading: '倍数的极限',
    text: '倍数只在还有数据可以分摊时才有用。同时使用最宽的信道和最多的流，帧并不会比只用最宽信道时更短：那时它已经只剩一个符号，而一个符号就是下限。在那里空间流没有带来任何收益——而宽信道多接收的噪声一点也没有减少，这部分代价就完全浪费了。',
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
    { heading: '「符号」在标准里指两种不同的东西', text: '一是**正交频分复用（orthogonal frequency-division multiplexing, OFDM）符号**，它是时间上的一个单位：标准把符号间隔定义成 T_SYM = T_DFT + T_GI，也就是一次反变换的输出再加上一段保护间隔，这里是 13.6 µs。**一台设备在同一时刻只能发出一个 OFDM 符号**，一帧需要几个就依次发送几个，空口时间（airtime）计算的就是它。二是**星座点**：标准里那一步叫星座映射器，它把每条空间流的比特映射成星座点，也就是一个个复数。**每一根数据子载波、在每一条空间流上，各自承载一个星座点**——所以一个 OFDM 符号里并列着 N_SD × N_SS 个星座点。因此，按星座点计数得到的那个数也是对的，只是它数的是星座点而不是 OFDM 符号：20 MHz 四条流就是 234 × 4 = 936 个并列的星座点，每个承载 12 个编码后的比特，其中六分之五是数据，合计 9360。标准自身的术语也是按这个层级构成的：每子载波每空间流的比特数，到每符号每空间流的比特数，再到每符号的比特数——**三个名称里的「符号」都指那个时间单位**。' },
    { heading: '所以频率、空间是并行的，时间是串行的', text: '更多子载波和更多空间流是同一件事的两个方向：一个在频率上展开，一个在空间上叠加，而它们都只增加**一个符号内能承载多少**，不增加一次能发送几个符号。时间是串行的。这也正是上一节所说「极限」的来源——一帧压缩到只剩一个符号之后就无法再缩短，因为符号是时间上不可再分的单位；这时再增加子载波或流数，多出来的容量无处可用。（多用户（multi-user, MU）那一种是把同一个 OFDM 符号按频率分给几台设备，而不是让某台设备多占一个符号。）' },
    { heading: '一个符号为什么能承载九千多个比特', text: '因为一个符号不是一个比特的时长，而是 13.6 µs 内**同时**发出的一整组比特。20 MHz 上有 234 根数据子载波并列（第三十三课那张表里的第一行），本课这一级用的是 4096-QAM（quadrature amplitude modulation），每根子载波一次携带 12 个比特；其中六分之五是数据、六分之一是纠错编码的冗余。于是一条流一个符号承载 234 × 12 × 5/6 = 2340 个数据比特，四条流就是它的四倍，9360。换成速率就是 9360 ÷ 13.6 µs = 688.2 Mb/s，而一条流那一行正好是第三十三课反复出现的那个 172.1 Mb/s——两课计算的是同一件事，只是那一课固定一条流、改变带宽，这一课固定带宽、改变流数。' },
    {
      kind: 'diagram', heading: '混合搭配时，流数由哪一端决定',
      spec: streamsNegotiationStack(),
      caption: '路由器有四根天线，发送的这台只有两根，于是链路使用两条流：空口时间是两流的 88.8 µs，而不是四流的 75.2 µs。逐帧比较，它和纯粹两流的那次运行完全没有区别。',
    },
    { kind: 'table', heading: '两个混合变体', head: [
      '变体', '链路实际使用的流数',
      '空口时间', '等同于',
    ], rows: [
      ['路由器 4 · 手机 2', '2', '88.8 µs', '上表里 2 条流那一行'],
      ['160 MHz · 4 条流', '4', '61.6 µs', '上一课里单靠 160 MHz 的结果'],
    ] },
    { kind: 'steps', heading: '多一条流改变了什么，逐步说明', items: [
      '两端各自报告自己支持几条流——有几根天线就是几条——链路取两者中较小的那个数。',
      '按上一课的方法选择等级。信道并没有变宽，噪声地板不变，每一级的要求也不变：流数根本不是这一步的输入。',
      '每符号比特数 = 该级在 20 MHz 下的每符号比特数，乘以带宽的子载波倍数，再乘以流数。多一条流，效果和多一份子载波完全相同。',
      '符号数 = 这一帧的比特数除以它，再向上取整为整数个符号。如果多出来的那条流只是削减了最后那个未装满的符号，它就没有带来任何收益。',
      '空口时间（airtime）= 48 µs 的前导码（preamble），加上每个符号 13.6 µs。无论使用几条流，前导码都按同样的方式发送，所以它不会缩短。',
    ] },
    { kind: 'table', heading: '四条流与那个混合搭配，按步骤计算一遍', head: [
      '步骤', '4 条流', '路由器 4 · 手机 2',
    ], rows: [
      ['两端各支持几条', '4 和 4', '4 和 2'],
      ['于是链路使用', '4', '2'],
      ['级别，不受流数影响', 'MCS 13', 'MCS 13'],
      ['每符号比特数：20 MHz 的值 × 流数', '2340 × 4 = 9360', '2340 × 2 = 4680'],
      ['符号数：⌈12262 ÷ 它⌉', '2', '3'],
      ['空口时间：48 + 13.6 × 符号数', '75.2 µs', '88.8 µs'],
    ] },
  ],
  deeper: [
    { heading: '多出来的那一对流做什么用', text: '路由器可以在同一时刻把另外两条流指向第二部手机——那是 MU-MIMO（多用户 MIMO），本模块后面有专门的一课，在这张只有一台站点的桌子上无法看到它。' },
    { heading: '为什么路径必须不同', text: '把几条流分离，本质上是求解线性方程组：接收端求解一个小方程组，每根接收天线给出一行。只有当这些行确实互不相同——也就是几路信号确实沿着明显不同的路径到达——方程组才有解。反射丰富的房间（住宅、办公室）有利于空间流；空旷野外单纯的视距路径则是最差情形，那里第二条流几乎带不来任何增益。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '增加一条流在这里没有任何代价：txTimeModeNs 把每符号比特数直接乘上流数，而每一级所需的信噪比 reqSinrDb(mode, mcs) 连流数这个参数都没有（phy.ts）。真实设备要把同一份发射功率分配到几条流上，每条流各自的信噪比因此下降，接收端还要求解一个方程组才能将它们分离。所以本课那个四倍是上界，而不是一间小屋子里实际能获得的增益。' },
    { kind: 'unmodelled', text: '引擎里根本没有信道矩阵：一对节点之间只有一个电平数（propagation.ts 的 buildLinkTable），没有天线间相关性，也没有秩这回事。于是「几条流必须经过明显不同的路径」这个前提在这里从不被检验——空旷野外一条单纯的视距链路，和一间反射丰富的屋子，得到的流数倍数完全相同。课文「深入一步」里说的那个最差情形，本仿真器无法模拟。' },
    { kind: 'unmodelled', text: '流数一旦协商确定就不再改变：negotiatedNss 取两端能力的较小值（caps.ts），而速率控制只沿 MCS 这一个维度升降（rate.ts）。真实的速率表是（MCS，流数）的二维表格，链路一旦变差，设备常常先减少一条流而不是降低调制，因为减少一条流换来的信噪比提升比降一档更有利。本仿真器里一条链路始终使用它协商到的全部流数，即使已经降到最低一级。' },
    { kind: 'out-of-scope', text: '这张桌子上只有一台站点，所以「路由器 4 · 手机 2」那一栏里多出来的两条流在本课完全处于空闲状态，时间轴上和纯粹的两流完全相同。这不是模型的缺陷，而是这个场景的边界：把那两条流同时分配给第二台设备能带来什么，本课无法测量。要看到它，需要换一个至少有两台设备同时有数据待发的房间。', until: 'mumimo' },
  ],
  sources: [
    '前导码里那段专为信道估计而发送的已知序列见 IEEE Std 802.11be-2024 的 §36.3.12.10（EHT-LTF）；而「流数越多它就越长」出自同一章的 Table 36-43——不同空间流数所需的 EHT-LTF 初始个数是 1、2、4、4，不是一条流各一份。',
    '每符号比特数来自 802.11be 的参数集：最高调制下 20 MHz 的一个符号装 2340 个数据比特，再乘以流数（IEEE Std 802.11-2024 第 36 章及其修正案）。符号间隔 T_SYM = T_DFT + T_GI 的定义见 §21.3.4 的时间参数表；星座映射器把每条空间流的比特映射成星座点这一步见 §19.3.3 的发送框图；而「每子载波每空间流的比特数」「每符号每空间流的比特数」「每符号的比特数」三个量的定义见 §19.3.1 的符号表——三者里的「符号」都指 OFDM 符号那一格时间。',
    '“链路按两端较小的流数运行”出自 §9.4.2.x 与 §11.3 的能力协商；本仿真器把它建模为两者取最小，且不做逐流回退。',
    '本仿真器让每条流的质量都相同：天线之间不相关，视距路径下也不会出现秩亏损。现实中小房间里的四流链路，很少能真正获得完整的倍数。',
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
    '从一条流到两条流：数据部分正好减半，81.6 µs 变 40.8 µs。从两条到四条本应再减半到 20.4 µs，但帧只能按整数个符号发送，所以停在 27.2 µs。',
    '每个变体的“速率”一行都是 MCS 13：无论一条流还是四条流，20 MHz 还是 160 MHz。空间流复用的是同一批子载波，所以它永远不会使调制（modulation）降低一档；而在这张桌子上，连最宽信道多接收的那份噪声也没有使调制降档。',
    '“路由器 4 · 手机 2”和“2 条流”没有区别：同样是 88.8 µs，同样的块出现在同样的位置。',
  ],
  tryThis: [
    '把“2 条流”和“路由器 4 · 手机 2”并排对照，在时间轴上寻找差异。找不到——路由器多出来的那一对流没有可服务的对象。',
    '再把这里的“2 条流”和上一课的 40 MHz 变体比较：同一个帧，同样的 88.8 µs。但两者之中，只有一个要求笔记本多提供 3 dB 的信号。',
  ],
  quiz: [
    {
      q: '为什么增加一条空间流不需要更强的信号，而带宽翻倍就需要？',
      options: [
        '空间流的发射功率（transmit power）更高',
        '信道宽度不变，接收端接收的噪声也不变——两条流依靠空间区分，而不是依靠频率',
        '多出来的那些流是在另一条信道上发的',
      ],
      answer: 1,
      explain: '噪声功率随信道宽度变化。带宽翻倍，噪声也翻倍，这就是那 3 dB；而第二条流复用的是同一批子载波，噪声地板不变，速率阶梯上每一级所需的信号也保持不变。',
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
