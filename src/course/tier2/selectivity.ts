/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · Frequency selectivity.
 *
 * The lesson of the 2026-10-03 selectivity slice (design doc §10), and it sits
 * immediately after `width` because `width`'s own `limits` entry is its subject:
 * a lesson belongs next to the sentence it unfolds.
 *
 * **It is not a refutation.** Task 6 of this slice already turned that `limits`
 * entry around — it used to predict that a wider channel meets a dead patch more
 * often, and it now states the measured direction instead. So this lesson's job
 * is the mechanism, the three figures, and WHICH INSTRUMENT each figure came off;
 * the one-sentence conclusion is already in `width` and is deliberately not
 * restated here in the same words.
 *
 * Every number quoted is pinned: the 12.05 / 24.09 dB deepest-bin means and the
 * 2.30 / 2.36 dB median losses in tests/engine/selectivity.test.ts, the five pooled drop
 * rates and the 3.62 dB margin they share in tests/engine/selectivity-inert.test.ts, and
 * everything this lesson's own five variants show in tests/course/selectivity.test.ts.
 *
 * **The deepest bin a single round shows is this lesson's own 150 ms figure, 10.29 dB, not
 * the engine sweep's 10.21 dB** (tests/engine/selectivity-round.test.ts runs 200 ms). Same
 * scene and same instrument, different run length: a longer round holds more draws, so its
 * deepest bin is deeper. A lesson prints what its own reader will see.
 *
 * Both the pooled rates and the deepest-bin figures moved once already, and not because a
 * tolerance was loosened: `9604fbc` stopped handing bins to non-HT PPDUs (the 26-tone RU is
 * defined at the HE/EHT subcarrier spacing, and clause 17's is four times wider), which took
 * the ACKs out of the measurement. The end-to-end multiple went from 27.7 to 19.5 with it.
 * That is what paying for a fixed defect looks like; the lesson follows the engine.
 *
 * Three sentences this text may not write, each one a review finding of this slice:
 *  - a drop COUNT. A wider channel puts far more PPDUs on the air in the same
 *    time, so a count conflates airtime with decoding. The five counts belong to
 *    another data set as well (the four-width round sweep), and
 *  - **no sentence mixes two data sets.** The pooled five-width group at 3.62 dB
 *    is where 20 MHz is the worst of the five; this lesson's own scene is the
 *    round sweep, where 20 MHz settles a whole rate step higher (6.62 dB) and is
 *    therefore NOT the worst. Both are true of their own instrument and each
 *    sentence below names which one it is talking about;
 *  - §4.1's two open-loop percentages, which are draws at a fixed 20 dB SINR that no
 *    lesson run produces. They are not repeated here either, comment included: the hard
 *    constraint is zero hits in `src/`, and tests/course/selectivity.test.ts now reads this
 *    file as text, so a comment can no longer slip under the guard.
 *
 * The bin width and the bin counts are computed from `engine/selectivity.ts`
 * rather than typed, for the reason that module gives: they are the standard's
 * own arithmetic, and a literal here could drift out of agreement with the engine
 * the lesson is describing.
 */
import { selBinWidthMhz, selBins, selMemberBins } from '../../engine/selectivity'
import { type Lesson, firstData, J } from '../lessonKit'
import { selectivityScenario } from '../wifiScenes'

/** The five widths this lesson runs, narrowest first — its variants and its two tables. */
const WIDTHS = [20, 40, 80, 160, 320] as const

/**
 * The pooled drop rate per width, at the 3.62 dB margin group — 45 runs of 100 ms at nine
 * power offsets, pooled by the margin the rate loop settled each run at
 * (tests/engine/selectivity-inert.test.ts, which asserts all five).
 *
 * Re-measured after `9604fbc` took the non-HT ACKs out of the per-bin path: the column was
 * 14.39 / 12.71 / 9.48 / 5.09 / 0.52 % while those 167–638 ACKs a round were being split into
 * nine bins at the wrong subcarrier spacing.
 */
const POOLED_RATES: readonly (readonly [number, string])[] = [
  [20, '14.66 %'], [40, '13.10 %'], [80, '9.81 %'], [160, '5.61 %'], [320, '0.75 %'],
]

/** 「20」「40」…, so the tables and the variant labels cannot disagree about the five widths. */
const binRows = (): string[][] => WIDTHS.map((w) => [
  String(w), String(selBins(w)), selBinWidthMhz().toString(),
])

export const selectivity: Lesson = {
  id: 'selectivity',
  module: 8,
  title: '频率选择性——一部分深衰，和整帧解不出来，是两回事',
  why: '到这一课之前，一条链路（link）在某一刻只有一个电平：信噪比（signal-to-noise ratio, SNR）是一个数，这一帧解得出还是解不出，由那一个数判定。真实的宽带室内信道不是这样——同一时刻，信道的一部分深度衰落，另一部分完好，而一个数无法表示「一部分」。本仿真器沿用标准回报信道质量时所用的分格单位，把信道划分成等宽的若干格，带宽翻倍格数就翻倍，每一格各抽取一次衰落。格越多，最深那一格确实越深，带宽每翻一倍约加深三分贝；但最深那一格不是这条链路的损失。一帧的比特经过信道编码，分布在整条信道上，一格深度衰落只损失其中一小部分，所以判决依据的是各格按容量折算成的那一个有效信噪比：从最窄一档到最宽一档，最深那一格从比均值低十几分贝变成低二十几分贝，有效信噪比的损失却一直在两分贝上下。于是**在余量可比的前提下**，信道越宽，掉帧率反而越低，最宽一档比最窄一档低一个数量级以上——方向与「越宽、处于深衰的格越多、性能越差」的直觉相反。余量不可比时则不然：这一课自己的五轮余量并不一致，最窄那一档的余量较高，它的掉帧率就不是最高的。宽信道真正的代价仍是噪声地板（noise floor）随带宽升高，频率选择性只弥补了其中一部分；而分格只改变解调这一步，载波侦听（carrier sense）、前导检测（preamble detection）和发送端的速率选择，依据的仍是整条信道的一个数。',
  outcomes: [
    '说明为什么一个电平无法表示「一部分深衰」，以及标准本身以多宽的频段为一格',
    '读出最深那一格随信道带宽（channel width）如何变化，并说明它为什么不是这条链路的损失',
    '在余量可比的前提下比较五个带宽的掉帧率，并说明为什么不能改用掉帧数比较',
    '判断什么时候打开这一节会改变结果，什么时候打开与关闭的结果完全相同',
  ],
  needs: ['width', 'noise-floor', 'decode-thresholds'],
  terms: [
    { term: 'frequency selectivity', plain: '同一条信道上，衰落的深浅随频率而不同；只随时间变化的那种信道称为平坦信道' },
    { term: '26-tone RU', plain: '由 26 根相邻音调组成的一块；标准回报信道质量所用的就是这个单位' },
    { term: 'effective SNR', plain: '由高低不一的各格折算成的那一个数；判决依据它，而不依据最深那一格' },
    { term: 'capacity', plain: '一格在其自身信噪比下每赫兹能承载的比特数；按它合成，就无需再选取一个经验系数' },
    { term: 'margin', plain: '余量：实测有效信噪比高出这一级门限多少分贝，由接收端逐次测得；不是速率余量固定保留的 3 dB，而下表五档各 3.62 dB（本课那五轮并不齐，最窄一档 6.62 dB）' },
  ],
  picture: [
    { heading: '一个数无法表示「一部分」', text: '一条信道由许多很窄的音调组成，每一根就是一个子载波（sub-carrier）。电波到达接收端的各条路径长短不一，它们在每一根音调上各自叠加——有的音调上恰好相互抵消，有的恰好相互加强。所以一条宽信道在同一时刻的频率响应，是一条高低起伏的曲线，而不是一条水平线。本仿真器此前只为整条信道抽取一次衰落：曲线被简化为一条水平线，位置随时间上下变化，形状始终是平的。这样的信道里，「一部分深衰」根本不存在。' },
    { heading: '标准自己就是按格回报的', text: '要分格，先要确定每格多宽，而这一点无需自行决定：标准中已有一个用于信道质量的分格单位，称为资源单元（resource unit, RU），最小的那一种由 26 根相邻音调组成——音调就是上一段所说的子载波，所以一个 26 音调资源单元就是 26 个连号的子载波，而不是另一种东西；接收端回报信道质量时，回报的正是每一个这样的块内的平均信噪比，而不是整条信道一个数。标准愿意为此付出开销，本身就说明那条曲线值得按块描述。本仿真器沿用这个单位：格宽由它与子载波间隔算出，格数由带宽算出，两者都不可配置——若可配置，就意味着那是本仿真器自行设定的数。' },
    { kind: 'watch', jump: 0, heading: '观察合成记录', text: `载入仿真，跳到笔记本发给路由器的第一个数据帧（data frame）。这一课的场景已经同时打开了衰落和分格——两者必须同时打开，原因后面会说明。打开「事件日志」，找到以 selectivity 开头的那一行：这一帧的均值、最深那一格、合成之后的值和格数，它一次全部输出。这一课载入的是最窄的一档，${selBins(20)} 格；回程那些确认帧（acknowledgement, ACK）不分格，所以这一行只出现在笔记本发送的那一侧。` },
    { heading: '编码跨的是整条信道', text: '一格深衰，这一帧就无法解出吗？不会。一帧的数据以正交频分复用（orthogonal frequency-division multiplexing, OFDM）方式发送：一个符号（symbol）的比特先经过信道编码，再分布到整条信道的音调上。所以一格深度衰落，损失的是整帧比特中的一小部分，而编码的冗余本来就是为弥补这种零散的损失而设计的——格数越多，同一份冗余要弥补的损失越分散。这就是「部分频段失效」和「整帧失效」的区别。本仿真器把各格的信噪比按容量折算成一个有效信噪比，判决依据这个合成值：不取最差那一格，那等于认为一格深衰整帧就无法解出；也不取算术平均，那会掩盖深衰格对容量的影响。' },
    { heading: '只有解调这一步读合成值', text: '分格只改变了一件事：解调的判决。载波侦听（carrier sense）是否检测到信号、前导检测（preamble detection）是否完成同步、捕获效应（capture effect）是否要为更强的一帧放弃正在接收的这一帧，依据的仍然是整条信道那一次平坦抽样。而发送端选择哪一级速率，依据的甚至不是这一帧的抽样——而是链路表里那一个静态的均值电平（simulation.ts 的 mcsForPeer），连慢的那层阴影都不含：发送端确定等级时那一帧还不存在，它不可能知道这一帧会如何衰落。于是在同一帧的处理过程中，「均值」指两个不同的数：前三步读平坦抽样之后的电平；合成这一步先减去那次平坦抽样，以剩下的几何、墙壁与阴影作为均值，再逐格抽取一次偏差加上去。逐格抽样是替换那一次平坦抽样，而不是叠加在它上面——否则同一帧会被衰落两次。' },
  ],
  numbers: [
    { kind: 'table', heading: '格宽与格数，两者都是计算得出的', head: [
      '带宽（MHz）', '格数（个）', '每格宽度（MHz）',
    ], rows: binRows() },
    { heading: '这张表的来源', text: '每格宽度 = 26 根音调 × 78.125 kHz，也就是 2.03125 MHz，而 78.125 kHz 是 Wi-Fi 7 的子载波间隔，与保护间隔出自同一张参数表。格数那一列更直接：标准回报信道质量时，每 20 MHz 就是九块，所以九乘以带宽再除以 20 就是格数。一格的宽度与带宽无关，所以带宽翻倍，格数就翻倍。把这两列相乘还能与第三个数对应：九块各 26 根，一共 234 根子载波，而 234 正是本仿真器算 20 MHz 的 Wi-Fi 6／7 每符号比特数时用的那个音调数（phy.ts 的 TONES_HE）——在这一档上，九块恰好涵盖计算速率所用的全部音调。更宽的档没有这么整齐：80 MHz 的音调数是 980，而三十六块只合 936，多出的那些落在「每 20 MHz 九块」这一网格之外，本课不对它们进行测量。' },
    { kind: 'steps', heading: '引擎如何为一帧计算这个合成值', items: [
      '先确定这一帧属于哪一代：只有 Wi-Fi 6 与 Wi-Fi 7 的 PPDU（PHY protocol data unit）分格，因为 26 音调资源单元是按它们那一档子载波间隔定义的。回程的确认帧是传统帧，它整帧只有一个电平，一格也不分。再按这一帧自己的带宽，根据上表算出格数。',
      '从锁定电平中减去这一帧那次平坦的快衰落，剩下的就是均值——阴影对整条信道同时变化，所以它保留在均值里。',
      '每一格各抽取一次快衰落偏差：分布和 K 因子取自场景里 fading 那一节，这一节自己没有新的取值。',
      '每一格的信干噪比（signal-to-interference-plus-noise ratio, SINR）= 均值 + 这一格的偏差 − 干扰与噪声。干扰与噪声在每一格里是同一个数，所以逐格起伏的只有信号这一侧。',
      '按容量合成：每一格算一个 log2(1 + 信噪比)，取各格的平均，再换算回分贝——这就是有效信噪比。',
      '把有效信噪比与这一级速率的门限比较：达到门限即可解出，未达到就是一次解调失败的接收，随后重传（retry）。',
    ] },
    { kind: 'formula', heading: '合成那一步写全', text: '有效信噪比 = 10·log10( 2^( 各格 log2(1 + 10^((均值 + 该格偏差)/10)) 的平均 ) − 1 )', note: '容量是一个上界：真实接收机达不到它，所以这条式子给出的频率选择性损失是下界，真实的损失更大。业界弥补这一差值的方法需要一个按速率阶梯每一级分别调校的系数，而标准从未给出它，本仿真器因此没有自行设定。' },
    { kind: 'table', heading: '两端的两个量（都出自那四万次抽样）：最深那一格，和整帧实际承受的损失', head: [
      '量', `20 MHz（${selBins(20)} 格）`, `320 MHz（${selBins(320)} 格）`,
    ], rows: [
      ['最深那一格比均值低', '12.05 dB', '24.09 dB'],
      ['整帧有效信噪比的损失中位数', '2.3 dB', '2.36 dB'],
    ] },
    { heading: '这两行数据的变化趋势相反', text: '上面一行每翻一倍加深约 3 dB：格数越多，抽到很深一格的机会越大，这一半直觉是对的。下面一行却几乎不随带宽变化——从九格到一百四十四格，只多了 0.06 dB。两行是同一批抽样中的两个量：最深那一格是这条曲线的最低点，而损失是整条曲线折成一个数之后与均值的距离，在 320 MHz 上前者是后者的十倍。把前者当成链路的损失，就会得出「宽信道差十几个分贝」这样的结论。还要注意这两行采用的是哪种测量：它们都出自那四万次抽样，而本课自己运行一轮测得的是另一对数——最窄一档 2.03 dB，最宽一档 2.36 dB。宽的那一端两种测量恰好给出同一个数，窄的那一端相差 0.27 dB，所以在 320 MHz 上看到两个 2.36，并不说明两种测量是一回事。' },
    { heading: '一轮仿真的结果会比这张表浅约两个分贝', text: '12.05 dB 与 24.09 dB 是四万次抽样下的均值，而一轮仿真只有几百帧——几百次中最深的那一次，远达不到四万次中最深的那一次。这一课的 20 MHz 变体运行下来，最深那一格的中位数比均值低 10.29 dB，比表中那一格浅约 1.8 dB。两个数都正确：一个是分布的均值，一个是一轮的中位数。事先了解这一点，好过在日志里看到它时再怀疑表格有误。' },
    { kind: 'table', heading: '掉帧率：五个带宽，余量都是 3.62 dB', head: [
      '带宽（MHz）', '格数（个）', '掉帧率',
    ], rows: POOLED_RATES.map(([w, rate]) => [String(w), String(selBins(w)), rate]) },
    { heading: '读这张表时要注意三点', text: '第一，它是掉帧率而不是掉帧数：一次接收未能解出计为一次，再除以这一档发出的数据帧数。按个数比会把空口时间（airtime）混进来——同样一段时间里，宽信道发出的帧多得多。第二，这五个数能放进同一张表，前提是五档余量都是 3.62 dB：余量不一致时，速率控制会使某一档以降一级速率代替掉帧来承担代价。第三，在这一组里，最窄那一档正是掉帧最多的那一个：14.66 % 到 0.75 %，两端相差十九倍。这组数是四十五次运行按余量汇总得出的，不是某一轮的结果：这一课的场景只有五轮，余量并不这样齐。' },
    { heading: '宽信道真正的代价，以及得到弥补的部分', text: '这张表并不是说信道越宽越好。带宽每翻一倍，接收到的噪声功率也翻一倍：噪声地板（noise floor）从 20 到 320 MHz 抬高了 12.04 dB，那才是宽信道真正的代价，前一课计算的就是它。频率选择性的作用在另一方面——格数增加带来的频率分集，弥补了这一代价中的一部分。那张表之所以能这样比较，是因为它先抵消了这 12.04 dB：五档各自把两端的功率按噪声地板的升高量提高，余量才可以比较。' },
    { heading: '为什么那个偏差字段只用四个比特就足够', text: '标准里还有一个逐子载波的偏差字段：四个比特，−8 到 +7 dB。看起来很窄，实际上足够：按本仿真器的莱斯分布（K = 6 dB）抽取逐格偏差，96.7 % 落在这个窗口里；只有最悲观的瑞利分布才有 15.33 % 落在窗口外而被限幅。那四个比特是按有直射径的信道确定的量程，而不是按最差的信道确定的——而本仿真器抽取的起伏幅度正好与这个量程相符。' },
    { heading: '一台多用户成员读的是哪几格', text: `多用户（multi-user, MU）的场景里，一台设备占的是整条信道里属于自己的那几格，而本仿真器给它的格数就是这一份：格数乘以份额、截到整数格，起始格紧接在前面各成员之后。20 MHz 上两个成员各读 ${selBins(20)} 格里的 ${selMemberBins(20, 1 / 2)} 格，与标准那张音调表吻合——两个 106 音调资源单元正好各覆盖 ${selMemberBins(20, 1 / 2)} 格。位置不起作用：各格彼此独立。` },
  ],
  deeper: [
    { heading: '取最差那一格会得出什么', text: '把最深那一格当成这条链路的信噪比，是一种很容易做出的设计：引擎本来就在一帧之内取最差的那一个时刻，再在频率上取最差的那一格看起来顺理成章。它会得出这样的结论：320 MHz 的链路比 20 MHz 的链路差十几个分贝（24.09 − 12.05 = 12.04 dB——与噪声地板那一节的 12.04 dB 数值相同、物理上毫无关系，一个是两端最深格之差，一个是热噪声随带宽的抬高量）。这不是偏保守，而是完全忽略了 OFDM 编码跨整条信道这一事实。两个数一起看才构成反驳：同一批抽样下，最深那一格平均低 24.09 dB，而容量合成的损失中位数是 2.36 dB——相差一个数量级。' },
    { heading: '为什么不按业界那套映射', text: '把一条高低不一的信道折成一个等效信噪比，业界常用的办法是指数有效信噪比映射（exponential effective SINR mapping, EESM），它要为每一级调制和码率各配一个 β 系数，而 β 要拿目标误块率曲线调出来。本设计通读了标准也没有找到它——那会是本仿真器唯一一个自行设定的物理量。容量不需要任何系数：它是对 log2(1+x) 这个凹函数用一次延森不等式（Jensen\'s inequality），所以它的结果不会比按均值估更乐观，而且里面没有一个数是作者选的。代价是它仍然偏乐观——那条不等式能保证「不比按均值估计更乐观」，不能保证「不比真实接收机乐观」，下面以「合成用的是容量」开头的那一条说的就是这件事。' },
  ],
  sources: [
    '按 26 根音调一块回报平均信噪比，出自标准的信道质量指示字段——而两代各有一条，两条分住两份文档：HE 那一条是 IEEE Std 802.11-2024 的 §9.4.1.65（HE CQI Report 字段），EHT 那一条是 IEEE Std 802.11be-2024 的 §9.4.1.75（EHT CQI Report 字段）。基础标准里没有 §9.4.1.75，它的 9.4.1 到 §9.4.1.71 就结束了，所以把两个条号并列挂在同一份文档上是错的。每 20 MHz 九块是后面那一条给的。78.125 kHz 的子载波间隔出自 802.11be 第 36 章的参数表（Table 36-18），每格 2.03125 MHz 由这两个数算出，源码里没有这个字面值。',
    '−8 到 +7 dB、四个比特的逐子载波偏差字段是 802.11 的 §9.4.1.49。落在窗口内外的比例（莱斯 K = 6 dB 下 96.7 %，瑞利下 15.33 % 在外）是用本仿真器自己的抽样测得的，并与瑞利分布的闭式解核对过，不是标准给的数。',
    '逐格偏差的分布与 K 因子沿用场景里 fading 那一节的取值（engine/fading.ts 的 rayleigh/rician，K 默认 6 dB），是本仿真器的选择：标准没有规定任何信道模型、时延扩展或相干带宽。按容量合成同样是本仿真器的选择，标准不规定接收机怎么把各格折成一个数。',
    '掉帧率那张表是四十五次运行按余量汇总得出的（tests/engine/selectivity-inert.test.ts）；最深那一格的两个均值与 2.3／2.36 dB 两个损失中位数出自同一批四万次抽样（tests/engine/selectivity.test.ts）；10.29 dB 是这一课 20 MHz 变体自己运行 150 ms 得到的（tests/course/selectivity.test.ts）——引擎测试中同一个场景运行 200 ms 得到的是另一个数，抽样越多，最深的那一格就越深。',
  ],
  limits: [
    { kind: 'model-value', text: '逐格偏差的分布与 K 因子不是标准取值，是场景里 fading 那一节的两个配置值（engine/fading.ts：瑞利，或莱斯加一个默认 6 dB 的 K）。这一节自己没有引入任何新的物理量——它只是把那一次平坦抽样改成按格各抽一次。标准里没有信道模型表、没有时延扩展、也没有相干带宽（设计文档对此做过穷举检索），所以「一格该有多深」这个问题的答案全部来自那一节，换一个分布，本课除了格数以外的每一个数都会变。' },
    { kind: 'unmodelled', text: '格间相关长度没有取值：本仿真器把各格当成彼此独立的抽样。真实信道不是这样——相邻的两格大部分时间同时变深、同时变浅，相干带宽是有限的，而格间相关会抵消一部分频率分集。所以独立是分集偏多的那一边：本课那张掉帧率表里，宽信道得到的收益比真实信道中的更大。时延扩展本身也没有建模——一格的深浅是随机抽取的，而不是由各条路径的到达时间计算得出的；节点也不移动，所以没有多普勒，相干时间是一个配置值，而不是由移动速度推导出来的。' },
    { kind: 'threshold', text: '合成用的是容量，而真实接收机达不到容量：实际的损失取决于调制、码率与交织器，本模型都没有考虑。所以这一课给出的每一个损失都是下界——2.36 dB 是最小的那个数，真实的损失更大，掉帧率也会比表中的高。这个差值正是指数有效信噪比映射（exponential effective SINR mapping, EESM）里那个 β 系数要弥补的部分，而标准从未给出 β，本仿真器因此不自行设定它：宁可给出一个来源明确的下界，也不给出一个来源不明的准确值。' },
    { kind: 'out-of-scope', text: '分格只进入解调这一步（合成在 channel.ts 的 resolveLock 里、锁定之后）。载波侦听、前导检测与捕获效应依据的还是整条信道那一次平坦抽样；发送端选择哪一级速率依据的甚至不是这一帧的抽样，而是链路表里那一个静态的均值电平（simulation.ts 的 mcsForPeer），连慢的那层阴影都不含——所以不要用本课的场景去分析「频率选择性让这台设备检测到了什么」或者「它为什么选了这一级速率」，这四件事（载波侦听、前导检测、捕获效应与速率选择）的结果里都没有分格。这种测量也只适用于 Wi-Fi 6 与 Wi-Fi 7 的链路：同一个场景里的 vht 站与传统站整帧仍然只有一个电平，因为 312.5 kHz 的子载波间隔上不存在 26 音调资源单元。schema 的规则是「至少有一条」这样的链路，所以一个混合了三代设备的场景是合法的，而你在那台 vht 站的记录里一条合成记录也看不到——不是遗漏，而是它本来就不分格。还有一处仍然超出范围：多用户成员读的是它自己那一份截到整数格之后的格数，而本仿真器只会把一帧按成员数平分，所以不要用它去分析一个不等分的分配会得到什么——被截掉的那一格在这里不属于任何成员。' },
  ],
  scenario: () => selectivityScenario(20),
  variants: WIDTHS.map((w) => ({ label: `${w} MHz`, scenario: () => selectivityScenario(w) })),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一条合成记录', (r) => r.type === 'WIFI_SEL'),
    J('第一次没解出来的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [
    `在事件日志里找到 selectivity 那一行：mean 是这一帧的均值，worst bin 是最深那一格比均值低多少，effective 是合成之后的值，loss 是两者之差，over 后面就是格数。逐档切换五个带宽，格数从 ${selBins(20)} 增加到 ${selBins(320)}，worst bin 从约 10 dB 加深到约 23 dB——每翻一倍约 3 dB。`,
    '观察同一行的 loss：最深那一格加深了十几个分贝，loss 却几乎没有变化，一直在 2 dB 上下（这一课最窄一档的中位数 2.03 dB，最宽一档 2.36 dB）。判决依据的是 effective，所以曲线的最低点有多低，与这一帧能否解出，不是同一个问题。',
  ],
  tryThis: [
    '点“在编辑器中打开”，在「频率选择性（frequency selectivity）」一节把「按 26 音调资源单元分格」的勾选取消后再运行：selectivity 那一行不再出现，整条信道回到一个值。不要把两次运行的掉帧数直接相减：平坦信道中一次深衰是整帧同时变深，更容易触发降档——关闭分格的那一轮，五个带宽都曾降到速率阶梯的最低一级，而打开分格的那一轮一次也没有。两轮的速率都不同，掉帧数不可比。',
    '仍在编辑器里，把「时变链路（衰落）」一节的「小尺度分布」改为「无」：分格那个复选框立即变为不可用，原因就显示在旁边——没有小尺度衰落，每一格都抽到同一个数，打开与关闭逐字节相同。另外两种被拒绝的配置也各试一次：删除整个衰落小节，以及把两端都改为传统电台（纯 nonht 链路上不存在这样的分格）。',
  ],
  quiz: [
    {
      q: '320 MHz 的信道有一百四十四格，最深那一格平均比均值低 24.09 dB。这条链路的信噪比要因此减掉 24.09 dB 吗？',
      options: [
        '要：一格解不出来，整帧就解不出来',
        '不要：编码跨整条信道，判决依据的是各格折算成的有效信噪比，实际损失的中位数是 2.36 dB',
        '不要：最深那一格会被均衡器完全补偿，损失是零',
      ],
      answer: 1,
      explain: '最深那一格是曲线的最低点，不是链路的损失：把它当成损失，就等于忽略了编码跨整条信道这一事实。',
    },
    {
      q: '那张掉帧率表里，五个带宽的余量都是 3.62 dB。去掉这个前提会怎样？',
      options: [
        '没有影响：余量只影响速率，不影响掉帧率',
        '五个数就不可比了：余量较大的那一档会以降一级速率代替掉帧来承担代价，于是它掉帧反而更少',
        '没有影响：掉帧率已经除以帧数了',
      ],
      answer: 1,
      explain: '除以帧数消除的是「宽信道发送得多」的影响，消除不了「某一档自己降了一级」的影响。这一课的场景正是例子：它五轮的余量并不一致，最窄那一档的余量较高，于是那一轮里它的掉帧率不是最高的。',
    },
  ],
}
