/**
 * Wi-Fi Tier 2 · M9 · 容量旋钮与速率控制 · Channel width.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): a wider
 * channel gives more sub-carriers, not a faster signal; what they cost in noise;
 * why the preamble of a frame never shrinks; and the inversion that is this
 * topic's payoff. The one-decibel window and the legacy fallback are in
 * `deeper`; the numerology and the clause numbers are in `sources`.
 *
 * **Stays whole** in the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M9): the
 * inversion is not a second topic, it is this topic's payoff, and the worked
 * 80/160 MHz table is the proof. What it loses:
 *  - 「还有邻居」(§5.5) — a real point with no numbers and no scene here;
 *  - the 「多开车道，不是换快车」restatement in the first paragraph (§5.2): under
 *    docs/course-wording-contract.md the title states the mechanism, and the lane
 *    comparison appears exactly once, marked as an analogy, in that paragraph;
 *  - the prose that said only the data block moves — the timing figure (§4)
 *    shows it to scale, and the observe line that subtracted the fixed 48 µs
 *    from each of the four airtimes is that figure's own four data spans.
 *
 * The arithmetic is spelled out rather than gestured at: the formula, the six
 * steps and the worked 80/160 MHz table are the account in full.
 *
 * The scenario builder and the four variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/width.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

/**
 * The same 1530-octet frame at the four widths, to scale. Every span is this
 * lesson's own run: a fixed 48 µs preamble (`PHY_MODES.eht.preambleNs`) and then
 * the data, which is all that moves — 81.6, 40.8, 27.2 and 13.6 µs, the four
 * airtimes of the first table less that opening.
 *
 * Drawn to scale it says in one look what a paragraph and an observe line used
 * to say in words: the opening is the same four times over, the widest setting's
 * data is down to a single 13.6 µs symbol, and that is why eight times the
 * sub-carriers is nowhere near an eighth of the airtime.
 */
export function widthAirtimeTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '20 MHz', spans: [
        { fromUs: 0, toUs: 48, label: '前导码 48' },
        { fromUs: 48, toUs: 129.6, label: '数据 81.6', tone: 'accent' },
      ] },
      { label: '40 MHz', spans: [
        { fromUs: 0, toUs: 48 },
        { fromUs: 48, toUs: 88.8, label: '40.8', tone: 'accent' },
      ] },
      { label: '80 MHz', spans: [
        { fromUs: 0, toUs: 48 },
        { fromUs: 48, toUs: 75.2, label: '27.2', tone: 'accent' },
      ] },
      { label: '160 MHz', spans: [
        { fromUs: 0, toUs: 48 },
        { fromUs: 48, toUs: 61.6, label: '13.6', tone: 'accent' },
      ] },
    ],
    axis: { fromUs: 0, toUs: 136, ticks: [0, 48, 100], unit: 'µs' },
  }
}

export const width: Lesson = {
  id: 'width',
  module: 8,
  title: '信道带宽——增加的是子载波数，不是信号速率',
  why: '到目前为止的每一课讲的都是怎么分享空口。这一课讲的是：轮到自己发的时候，一帧能从空口里拿到多少。可以给一条链路（link）划一块更宽的频段，同一帧发完所需的时间就更短。这是最简单的一个提速旋钮，但它有代价：频段越宽，混进来的噪声也越多。同一个旋钮，在书桌旁能把帧变短，到了远端墙边却可能让链路整个连不上。',
  outcomes: [
    '说出带宽翻倍为什么从来不会让一帧的时间减半',
    '在时间轴上读出同一帧在四种带宽下各自的空口时间（airtime）',
    '为一台处在覆盖边缘的站点（STA），在“宽”和“稳”之间做出选择',
  ],
  needs: ['mcs-ladder', 'noise-floor', 'airtime'],
  terms: [
    { term: 'channel width', plain: '一条链路占用的频段有多宽：20、40、80 或 160 MHz' },
    { term: 'sub-carrier', plain: '信道被切成的一根根窄音调中的一根，每根每次承载几个比特' },
    { term: 'symbol', plain: '一段等长的信号块；一帧的数据永远是整数个这样的块发出去的' },
    { term: 'noise floor', plain: '没有任何站点发送时，接收端听到的那份背景功率' },
  ],
  picture: [
    { heading: '更宽的信道多给的是频率，不是速率', text: '信道变宽，并不是让电台把信号发得更快，而是让它在同一时刻有更多的频率可用。一条链路占用的频段有多宽，就是信道带宽（channel width）。Wi-Fi 把这块频段切成一根根很窄的音调，每一根就是一个子载波（sub-carrier），每根装的比特数都一样；所以带宽翻倍，子载波数就翻倍，每一块信号里装的比特数也翻倍。这相当于把一条车道加宽成几条并行的车道，而不是换一辆更快的车。' },
    { heading: '从来不会变短的那一段', text: '一帧里只有数据那一段是承载在子载波上的。它前面还有前导码（preamble）——接收端用来锁住这一帧的那段固定图案——在任何带宽下都一样长。而数据是按等长的信号块发出去的，一块就是一个符号（symbol）；装不满一块的零头，也要向上凑成一整个符号。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到笔记本发给路由器的第一个数据帧（data frame）——屏幕上那台路由器，就是这套房子里所有站点都连着的那一台。这一课打开的是最宽的一档；用上面的按钮逐档调窄再调回来，盯住那个蓝色数据块。' },
    { heading: '代价付在噪声上', text: '接收端在没有任何站点发送时听到的那份背景功率，就是噪声地板（noise floor）；它与接收的频段宽度成正比，所以带宽翻倍，收进来的噪声功率也翻倍，于是速率阶梯上的每一级，现在都需要更强的信号才能支持——这相当于门开得越大，进来的东西也越多。要分清它能解决什么、不能解决什么：对“另一台站点同时发送、压住你的信号”毫无帮助——对方的信号会随带宽一起变大，和你自己的一模一样。宽信道付出的代价，是覆盖距离。' },
    { heading: '更宽反而更慢的时候', text: '这份代价有时会大过它换来的好处。往屋子边缘走，宽信道要的信号比这个位置拿得出来的更多，于是链路掉到更慢的一级，同一帧发出来反而比在窄信道上更长。' },
  ],
  numbers: [
    { kind: 'table', heading: '同一个 1500 字节的帧（空口上 1530 字节），Wi-Fi 7，单流，就在书桌上', head: [
      '带宽（MHz）', '数据子载波（根）',
      'MCS', '速率一行（Mb/s）',
      '符号数（个）', '空口时间（µs）',
    ], rows: [
      ['20', '234', '13', '172.1', '6', '129.6'],
      ['40', '468', '13', '172.1', '3', '88.8'],
      ['80', '980', '13', '172.1', '2', '75.2'],
      ['160', '1960', '13', '172.1', '1', '61.6'],
    ] },
    { kind: 'table', heading: '那一列子载波数是怎么来的', head: [
      '带宽（MHz）', '数据（根）', '导频（根）', '合计（根）', '为什么不是整倍',
    ], rows: [
      ['20', '234', '8', '242', '—'],
      ['40', '468', '16', '484', '数据恰好翻倍'],
      ['80', '980', '16', '996', '比四倍多 44 根'],
      ['160', '1960', '32', '1 992', '比八倍多 88 根'],
    ] },
    { heading: '那张表的每一行都能自己对上', text: '信道被切成等宽的一根根音调，而不是每一根都装数据：有几根是导频（pilot），接收端靠它们跟住相位；信道正中那几根空着，两端各留一小截安静的边沿当保护间隔。数据加导频就是合计那一列——234 加 8 是 242，980 加 16 是 996——而每一档的合计，正是那一档整块频段切出来的音调总数减掉中间空着的和两端留白的。这几个数不是算出来的，是 802.11be 第 36 章那张参数表直接给的；能算的是它们之间的关系：**带宽翻倍，数据音调不止翻倍**，因为两端那截留白是整块频段只付一次，不是每 20 MHz 付一次。' },
    {
      kind: 'diagram', heading: '同一帧，四种带宽，按比例画',
      spec: widthAirtimeTiming(),
      caption: '四条道上的前导码是同一段 48 µs，一动也不动；变短的只有后面那截数据：81.6、40.8、27.2，到最宽的一档只剩一个 13.6 µs 的符号。八倍的子载波换来的不是八分之一的时间，而是把一段本来就不长的数据压到了一个符号的下限。',
    },
    { kind: 'formula', heading: '空口时间花在哪儿', text: '空口时间 = 48 µs + 13.6 µs × ⌈(16 + 8·字节数 + 6) ÷ (20 MHz 下每符号比特数 × 子载波倍数)⌉', note: '前导码那一段永远不动；式子里的 16 和 6，是每一帧都要在负载之外添上的服务位与尾位；向上取整的括号把零头凑成一个完整符号。80 MHz 给的子载波比 20 MHz 的四倍还多一点点，因为信道两端那截安静的边沿是整块频段只付一次。' },
    { heading: '带宽在噪声上的代价', text: '带宽每翻一倍，收进来的噪声功率也翻一倍——3 dB——所以这里最宽的一档要比最窄的一档多约 9 dB 信号。在这张桌子上这个代价还付得起：链路稳稳停在最高一级，信噪比（signal-to-noise ratio, SNR）48.7 dB，而那一级要的是 48.0 dB。' },
    { kind: 'table', heading: '同一台笔记本，挪到客厅中间', head: [
      '带宽（MHz）', 'MCS',
      '空口时间（µs）', '是否送达',
    ], rows: [
      ['20', '3', '415.2', '帧帧送达'],
      ['40', '3', '238.4', '帧帧送达'],
      ['80', '2', '170.4', '帧帧送达'],
      ['160', '0', '224.8', '帧帧送达——却比 80 MHz 还慢'],
    ] },
    { kind: 'steps', heading: '带宽到底改变了什么，一步一步', items: [
      '先取两端都跑得动的带宽：链路用的是两者中较窄的那个，后面每一步都在这个带宽上算。',
      '算出这个带宽下的噪声地板：这段带宽上的热噪声，加上接收机的噪声系数。20 MHz 是 −93.99 dBm，每翻一倍再加 3.01 dB。',
      'SNR = 这条链路的接收信号强度指示（received signal strength indicator, RSSI）减去那个噪声地板：RSSI 没变，所以信道越宽，剩给你的越少。',
      '沿着速率阶梯往上走，留住最后一个满足“所需信干噪比（signal-to-interference-plus-noise ratio, SINR）+ 3 dB 速率余量 ≤ SNR”的级。每一级的要求与带宽无关——变的只有噪声地板。',
      '每符号比特数 = 该级在 20 MHz 下的每符号比特数，乘以第一张表里那个带宽的子载波倍数。',
      '符号数 = 这一帧的比特数除以它，再向上取整成整数个符号——就是上面那条式子。空口时间就是 48 µs 的前导码，加上每个符号 13.6 µs。',
    ] },
    { kind: 'table', heading: '客厅那台笔记本，在最宽的两档上照着步骤走一遍', head: [
      '步骤', '80 MHz', '160 MHz',
    ], rows: [
      ['这条链路的 RSSI', '−70.51 dBm', '−70.51 dBm'],
      ['减去这个带宽下的噪声地板', '−87.97 dBm', '−84.96 dBm'],
      ['= SNR', '17.46 dB', '14.45 dB'],
      ['含余量后放得下的最高一级', 'MCS 2', 'MCS 0'],
      ['它要求', '13.99 + 3 = 16.99 ✓', '8.99 + 3 = 11.99 ✓'],
      ['再上一级要求', '16.99 + 3 = 19.99 ✗', '11.99 + 3 = 14.99 ✗'],
      ['每符号比特数：20 MHz 的值 × 倍数', '351 × 4.19 = 1470', '117 × 8.38 = 980'],
      ['符号数：⌈12262 ÷ 它⌉', '9', '13'],
      ['空口时间：48 + 13.6 × 符号数', '170.4 µs', '224.8 µs'],
    ] },
    { heading: '倒挂，一句话说清', text: '最后三行就是倒挂。最宽的那一档差半个分贝够不着上一级，落点比 80 MHz 能支持的那一级低了两级：阶梯上有一级只比下一级高 2 dB，而噪声地板抬高 3 dB 的这一步，正好把它整个跨了过去。子载波恰好翻倍，仍然补不回每符号比特数只剩三分之一的损失。' },
  ],
  deeper: [
    { heading: '只有一分贝宽的窗口', text: '上面那个倒挂，两边的余量都很小。“160 MHz 确实比 80 MHz 慢，而两者又都还能把每一帧解出来”的接收功率区间，只有约一分贝宽。客厅那个位置落在 −70.51 dBm，靠近这个区间的正中，离两端各约半分贝。把笔记本再挪近一点，160 MHz 又重新比 80 MHz 快；再挪远一点，它就彻底送不到了。' },
    { heading: '根本没有宽信道模式的电台', text: '在最远的角落里，到编辑器把笔记本改成 802.11a。传统电台根本没有宽信道模式，链路只能退回 20 MHz——于是确认帧回来了，每帧 704 µs、18 Mb/s：是同一帧在书桌上所花空口时间的五倍半，但它送到了。又窄又旧的模式，也强过宽到根本连不上。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '带宽在这里只是一个倍数：子载波数进到每符号比特数里，噪声地板按带宽抬高，而本课这四档里整条信道的信号质量始终只有一个数——`buildLinkTable` 给出的那一个电平，解得出还是解不出由整帧期间最差的那一个信噪比一次判定（channel.ts 的 resolveLock）。真实的宽带室内信道不是这样：同一时刻信道的一部分深衰、另一部分完好，而信道越宽，深衰的那几格也越多，听起来就该越糟。场景打开衰落、再加上 selectivity 一节就补上了这一条（本课四档都没有加）：信道按 2.03125 MHz 一格各抽一次衰落，各格的信噪比再按容量折成一个有效信噪比。而「越宽越糟」这个预期与跑出来的结果相反——最深那一格确实越宽越深，可余量可比时的掉帧率是随带宽一路下降的：编码跨整条信道，深的格越多越摊得开。所以宽信道真正的代价仍然是噪声地板按带宽抬高的那一份（本课上面那张表算的就是它），频率分集只把其中一部分补回来。那三组数——最深那一格的两端、整帧的损失中位数、以及余量可比时那五个掉帧率——分别是在什么上面量出来的，以及为什么只能比掉帧率不能比掉帧数，都在下一课。仍然没有的是格间相关：真实信道的相邻格并不独立，相关会把这份分集吃掉一部分，而本仿真器取独立，正是分集偏多的那一边。', until: 'selectivity' },
    { kind: 'model-value', text: '那个倒挂的宽度是 3 dB 这个速率余量钉出来的（phy.ts 的 RATE_MARGIN_DB），标准没有规定任何余量，厂商各选各的。把它改成 2 dB，客厅那个位置上 160 MHz 就落在 MCS 1 而不是 MCS 0，一帧 143.2 µs，比 80 MHz 的 170.4 µs 更快——倒挂整个不存在了。另外噪声这一侧用了两个不同的噪声系数：算噪声地板用本仿真器选的 7 dB，而反推每一级所需信噪比时用的是标准灵敏度表自带的 10 dB。' },
    { kind: 'unmodelled', text: '一条链路的带宽在整段仿真里是固定的：negotiatedWidth 取两端配置的较小值（caps.ts），此后每一帧都用它。真实的 80 或 160 MHz 设备是逐帧决定用多宽的：某个副信道被判忙，这一帧就退回 20 或 40 MHz 发出去，Wi-Fi 7 还能把被占的那 20 MHz 打孔挖掉、剩下的照用。所以本课那四档是四次各自独立的运行，而不是一台设备在一次运行里做的四种选择。' },
    { kind: 'out-of-scope', text: '引擎不问任何监管约束：哪一档带宽在哪个国家可用、哪些信道要为雷达让路、6 GHz 低功率室内设备的功率上限，一律不存在，节点的发射功率是一个可以任意填写的数。于是「把带宽调到 160 MHz」在本仿真器里永远是一个能选的选项，而在真实的房子里它常常开不出来，或者只能以更低的功率开出来——那也会把本课的每一个电平往下挪。' },
  ],
  sources: [
    '234、468、980、1960 这几个数据子载波数，来自 802.11be PPDU 的 OFDM 参数集（IEEE Std 802.11-2024 第 36 章及其修正案）；空口时间跟着这些子载波数走，而不是跟着兆赫数走。',
    '48 µs 的前导码与 13.6 µs 的符号，是本仿真器为这类 PPDU 取的单一代表值，并非逐字段相加的结果；它们代入的 TXTIME 公式见 §17.4.3。',
    '“每翻一倍 3 dB”出自热噪声公式 kTB，噪声系数用的是本仿真器自己的取值；每一级的灵敏度——包括让倒挂得以发生的那一档 2 dB 窄阶——出自第 36 章的最小输入灵敏度表。',
  ],
  scenario: () => widthScenario(160, 1),
  variants: [
    { label: '20 MHz', scenario: () => widthScenario(20, 1) },
    { label: '40 MHz', scenario: () => widthScenario(40, 1) },
    { label: '80 MHz', scenario: () => widthScenario(80, 1) },
    { label: '160 MHz', scenario: () => widthScenario(160, 1) },
  ],
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '把四种带宽逐档切过去，盯住同一个蓝色数据块：129.6 µs、88.8、75.2、61.6。带宽翻倍从来不会让一帧减半——每一帧里那段前导码，不随任何东西缩短。',
    '四档里白色的确认帧（acknowledgement, ACK）完全一样，“速率”那一行也从不动：四种带宽都是 172.1 Mb/s，因为它报的是一组 20 MHz 子载波能装多少。带宽体现在空口时间里，从不体现在速率那一行。',
  ],
  tryThis: [
    '点“在编辑器中打开”，把笔记本拖到路由器右边七格半、下面两格，大约客厅正中。四种带宽在那里仍然帧帧送达，但最宽的一档已经不是最快的了：上面第二张表说的就是这个位置。',
    '继续挪到最远的角落。在最宽的一档，一个 ACK 也回不来。把带宽逐档调窄，链路就回来了——80 MHz 每帧 401.6 µs，20 MHz 524.0 µs，而 40 MHz 卡在更低一级上，是三者中最慢的 768.8 µs。',
  ],
  quiz: [
    {
      q: '这一帧在最窄的一档要 129.6 µs；到最宽的一档，子载波是八倍，却仍要 61.6 µs。为什么不是八分之一？',
      options: [
        '数据帧变短，ACK 就会变长',
        '数据前面有一段固定的前导码，而数据本身最短也不能少于一个完整符号',
        '宽信道的发射功率（transmit power）更低',
      ],
      answer: 1,
      explain: '按比例缩短的只有数据部分：81.6 µs 的符号最后只剩一个 13.6 µs 的符号。48 µs 的前导码纹丝不动，此时已占了整帧四分之三以上。',
    },
    {
      q: '手机在覆盖边缘。把它从最宽的信道换到窄一些的，是更快还是更慢？',
      options: [
        '更慢——子载波只剩四分之一，速度也只剩四分之一',
        '通常更快：信号已经勉强时，窄信道换回来的灵敏度（sensitivity），比让出去的那些子载波更有价值',
        '没区别——带宽不影响覆盖',
      ],
      answer: 1,
      explain: '在这套房子最远的角落里，160 MHz 一帧也送不到，而 20、40、80 MHz 依然能把帧送出去。这三者谁更快，是另一个问题。',
    },
  ],
}
