/**
 * Wi-Fi Tier 2 · M9 · 容量旋钮与速率控制 · Frequency selectivity.
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
  why: '到这一课之前，一条链路（link）在某一刻只有一个电平：信噪比（signal-to-noise ratio, SNR）是一个数，这一帧解得出还是解不出，由那一个数判定。真实的宽带室内信道不是这样——同一时刻，信道的一部分深衰到谷底，另一部分完好，而一个数演不出「一部分」。按直觉，信道越宽，落进深衰的那几格就越多，所以应该越糟；把这件事按标准自己的分格单位建出来之后，**在余量可比的前提下**，跑出来的方向与这个直觉相反。余量不可比时则不然——这一课自己的场景就是个现成的反例，第二个实验会碰到。前一课那条 limits 已经把结论写成一句话，这一课给的是它的机制、它的三个数，以及每个数是在什么上面量出来的。',
  outcomes: [
    '说出为什么一个电平演不出「一部分深衰」，以及标准自己拿多宽的一块分格',
    '读出最深那一格随信道带宽（channel width）怎么变，并说出它为什么不是这条链路的损失',
    '在余量可比的前提下比较五个带宽的掉帧率，并说出为什么不能换成掉帧数来比',
    '判断什么时候打开这一节会改变结果，什么时候打开了与关着完全一样',
  ],
  needs: ['width', 'noise-floor', 'decode-thresholds'],
  terms: [
    { term: 'frequency selectivity', plain: '同一条信道上，衰落的深浅随频率而不同；只随时间起伏的那种信道叫平坦信道' },
    { term: '26-tone RU', plain: '26 根相邻音调合成的一块；标准自己给信道质量回报用的就是这个单位' },
    { term: 'effective SNR', plain: '把高低不一的各格折成的那一个数；判决落在它上面，而不落在最深那一格上' },
    { term: 'capacity', plain: '一格在它自己的信噪比下每赫兹能装多少比特；按它合成，就不必再选一个经验系数' },
  ],
  picture: [
    { heading: '一个数演不出「一部分」', text: '一条信道是由一根根很窄的音调拼起来的，每一根就是一个子载波（sub-carrier）。电波到接收端的路径长短不一，它们在每一根音调上各自叠加——有的音调正好互相抵消，有的正好加强。所以一条宽信道在同一时刻的样子，是一条高低起伏的曲线，不是一个水平面。本仿真器此前只给整条信道抽一次衰落：曲线被压成一条水平线，位置随时间上下动，形状永远是平的。这样的信道里，「一部分深衰」根本不存在。' },
    { heading: '标准自己就是按格回报的', text: '要分格，先得回答分多宽，而这件事不用自己定：标准里早有一个为信道质量准备的分格单位，叫资源单元（resource unit, RU），最小的那一种由 26 根相邻音调合成——音调就是上一段那一根根子载波，所以一个 26 音调资源单元就是 26 个连号的子载波，而不是另一种东西；接收端回报信道质量时，回报的正是每一个这样的块里的平均信噪比，不是整条信道一个数。标准肯这样花代价，本身就说明那条曲线值得按块描述。本仿真器照搬这个单位：格宽由它与子载波间隔算出，格数由带宽算出，两个都不可配——可配就意味着那是本仿真器编的数。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: `载入仿真，跳到笔记本发给路由器的第一个数据帧（data frame）。这一课的场景已经把衰落和分格一起打开了——它们必须一起打开，后面会说为什么。打开「事件日志」，找 selectivity 开头的那一行：这一帧的均值、最深那一格、合成之后的值和格数，它一次印全。这一课载入的是最窄的一档，${selBins(20)} 格；回程那些确认帧（acknowledgement, ACK）不分格，所以这一行只出现在笔记本发出去的那一侧。` },
    { heading: '编码跨的是整条信道', text: '一格深衰，这一帧就没了吗？没有。一帧的数据是正交频分复用（orthogonal frequency-division multiplexing, OFDM）发出去的：一个符号（symbol）的比特先经过信道编码，再摊到整条信道的音调上。所以一格塌下去，损失的是整帧比特里的一小部分，而编码的冗余本来就是为补这种零散缺口准备的——格数越多，同一份冗余要补的缺口越分散。这就是「一部分死掉」和「这一帧死掉」的分界。本仿真器把各格的信噪比按容量折成一个有效信噪比，判决落在这个合成值上：不取最差那一格，那等于宣布一格塌了整帧就完；也不取算术平均，那会把深格对容量的伤害抹平。' },
    { heading: '只有解调这一步读合成值', text: '分格只改了一件事：解调的判决。载波侦听（carrier sense）听没听见、前导检测（preamble detection）锁没锁上、捕获效应（capture effect）要不要为更强的一帧放弃手里这一帧，读的仍然是整条信道那一次平坦抽样。而发送端选哪一级速率，读的甚至不是这一帧的抽样——是链路表里那一个静态的均值电平（simulation.ts 的 mcsForPeer），连慢的那层阴影都不含：发送端定级的时候那一帧还不存在，它不可能知道这一帧会怎么衰落。于是同一帧的一生里，「均值」指着两个数：前三步读平坦抽样之后的电平；合成这一步先把那次平坦抽样减回去，拿剩下的几何、墙壁与阴影当均值，再逐格抽一次偏差加上去。逐格抽样是替换那一次平坦抽样，不是叠在它上面——否则同一帧会被衰落两次。' },
  ],
  numbers: [
    { kind: 'table', heading: '格宽与格数，两个都是算出来的', head: [
      '带宽（MHz）', '格数（个）', '每格宽度（MHz）',
    ], rows: binRows() },
    { heading: '这张表怎么来的', text: '每格宽度 = 26 根音调 × 78.125 kHz，也就是 2.03125 MHz，而 78.125 kHz 是 Wi-Fi 7 的子载波间隔，与保护间隔出自同一张参数表。格数那一列更直接：标准回报信道质量时，每 20 MHz 就是九块，所以九乘以带宽再除以 20 就是格数。一格的宽度与带宽无关，所以带宽翻倍，格数就翻倍。把这两列乘起来还能对上第三个数：九块各 26 根，一共 234 根子载波，而 234 正是本仿真器算 20 MHz 的 Wi-Fi 6／7 每符号比特数时用的那个音调数（phy.ts 的 TONES_HE）——在这一档上，九块恰好把算速率用的音调全数在内。更宽的档没有这么整齐：80 MHz 的音调数是 980，而三十六块只合 936，差出来的那些落在「每 20 MHz 九块」这张网格之外，本课不量它们。' },
    { kind: 'steps', heading: '引擎在一帧上怎么算这个合成值', items: [
      '先问这一帧是哪一代：只有 Wi-Fi 6 与 Wi-Fi 7 的 PPDU（PHY protocol data unit）分格，因为 26 音调资源单元是按它们那一档子载波间隔定义的。回程的确认帧是传统帧，它整帧只有一个电平，一格也不分。再按这一帧自己的带宽，照上表算出格数。',
      '把这一帧那次平坦的快衰落从锁定电平里减掉，剩下的就是均值——阴影是整条信道一起动的，所以它留在均值里。',
      '每一格各抽一次快衰落偏差：分布和 K 因子就是场景里 fading 那一节的，这一节自己没有新取值。',
      '每一格的信干噪比（signal-to-interference-plus-noise ratio, SINR）= 均值 + 这一格的偏差 − 干扰与噪声。干扰与噪声在每一格里是同一个数，所以逐格起伏的只有信号这一侧。',
      '按容量合成：每一格算一个 log2(1 + 信噪比)，取各格的平均，再反解回分贝——这就是有效信噪比。',
      '把有效信噪比与这一级速率的门限比一下：过了就解出来，没过就是一次解不出来的接收，随后重传（retry）。',
    ] },
    { kind: 'formula', heading: '合成那一步写全', text: '有效信噪比 = 10·log10( 2^( 各格 log2(1 + 10^((均值 + 该格偏差)/10)) 的平均 ) − 1 )', note: '容量是个上界：真实接收机达不到它，所以这条式子给出的频率选择性损失是下界，真实的损失更大。业界补这个差值的办法要一个按速率阶梯每一级各自调出来的系数，而标准从未给过它，本仿真器因此没有发明它。' },
    { kind: 'table', heading: '两端的两个量（都出自那四万次抽样）：最深那一格，和整帧实际付出的损失', head: [
      '量', `20 MHz（${selBins(20)} 格）`, `320 MHz（${selBins(320)} 格）`,
    ], rows: [
      ['最深那一格比均值低', '12.05 dB', '24.09 dB'],
      ['整帧有效信噪比的损失中位数', '2.3 dB', '2.36 dB'],
    ] },
    { heading: '这两行是一组反向的数', text: '上面一行每翻一倍深约 3 dB：格数越多，抽到很深一格的机会越大，这一半直觉是对的。下面一行却几乎不随带宽动——从九格到一百四十四格，只多了 0.06 dB。两行是同一批抽样里的两个量：最深那一格是这条曲线的最低点，而损失是整条曲线折成一个数之后与均值的距离，在 320 MHz 上前者是后者的十倍。把前者当成链路的损失，就会得出「宽信道差十几个分贝」这种结论。还要留神这两行用的是哪把尺：它们都出自那四万次抽样，而本课自己跑一轮量到的是另一对数——最窄一档 2.03 dB，最宽一档 2.36 dB。宽的那一头两把尺碰巧给出同一个数，窄的那一头差了 0.27 dB，所以在 320 MHz 上看到两个 2.36，并不说明两把尺是一回事。' },
    { heading: '一轮仿真会比这张表浅两个分贝', text: '12.05 dB 与 24.09 dB 是四万次抽样下的均值，而一轮仿真只有几百帧——几百次里最深的那一次，远到不了四万次里最深的那一次。这一课的 20 MHz 变体跑下来，最深那一格的中位数是比均值低 10.29 dB，比表里那一格浅了约 1.8 dB。两个数都对：一个是分布的均值，一个是一轮的中位数。先知道这件事，比在日志里撞上它再怀疑表印错了要好。' },
    { kind: 'table', heading: '掉帧率：五个带宽，余量都是 3.62 dB', head: [
      '带宽（MHz）', '格数（个）', '掉帧率',
    ], rows: POOLED_RATES.map(([w, rate]) => [String(w), String(selBins(w)), rate]) },
    { heading: '读这张表要带三句话', text: '第一，它是掉帧率而不是掉帧数：一次接收没解出来算一次，再除以这一档发出的数据帧数。按个数比会把空口时间（airtime）混进来——同样一段时间里，宽信道发出的帧多得多。第二，这五个数能放进一张表，前提是五档余量都是 3.62 dB：余量不齐，速率控制会替某一档把代价换成降一级速率，而不是掉帧。第三，在这一组里，最窄那一档正是掉帧最多的那一个：14.66 % 到 0.75 %，端到端十九倍。这组数是四十五次运行按余量池化出来的，不是哪一轮的结果：这一课的场景只有五轮，余量并不这样齐。' },
    { heading: '宽信道真正的代价，和补回来的那一边', text: '这张表不是说信道越宽越好。带宽每翻一倍，收进来的噪声功率也翻一倍：噪声地板（noise floor）从 20 到 320 MHz 抬高了 12.04 dB，那才是宽信道真正的代价，前一课算的就是它。频率选择性站在另一边——格数多出来的那点频率分集，把这笔代价里的一部分补了回来。那张表之所以读得出来，是因为它先把这 12.04 dB 抵掉了：五档各自把两端的功率按噪声地板的抬高量提上去，余量才比得了。' },
    { heading: '为什么那个偏差字段只给四个比特就够', text: '标准里还有一个逐子载波的偏差字段：四个比特，−8 到 +7 dB。看着很窄，其实够用：按本仿真器的莱斯分布（K = 6 dB）抽逐格偏差，96.7 % 落在这个窗口里；只有最悲观的瑞利分布才有 15.33 % 落在窗口外被夹住。那四个比特是按有直射径的信道定的尺寸，不是按最差的信道定的——而本仿真器抽出来的起伏幅度正好对得上这个量程。' },
    { heading: '一台多用户成员读的是哪几格', text: `多用户（multi-user, MU）的场景里，一台设备占的是整条信道里属于自己的那几格，而本仿真器给它的格数就是这一份：格数乘以份额、截到整数格，起始格接在前面各成员之后。20 MHz 上两个成员各读 ${selBins(20)} 格里的 ${selMemberBins(20, 1 / 2)} 格，与标准那张音调表吻合——两个 106 音调资源单元正好各覆盖 ${selMemberBins(20, 1 / 2)} 格。位置不起作用：各格彼此独立。` },
  ],
  deeper: [
    { heading: '取最差那一格会得出什么', text: '把最深那一格当成这条链路的信噪比，是个很容易做出的设计：引擎本来就在一帧之内取最差的那一个瞬间，再在频率上取最差的那一格看着顺理成章。它会得出这样的结论：320 MHz 的链路比 20 MHz 的链路差十几个分贝（24.09 − 12.05 = 12.04 dB——与噪声地板那一节的 12.04 dB 数值相同、物理上毫无关系，一个是两端最深格之差，一个是热噪声随带宽的抬高量）。这不是偏保守，这是把 OFDM 编码跨整条信道这件事整个删掉了。两个数一起看才是反驳：同一批抽样下，最深那一格平均低 24.09 dB，而容量合成的损失中位数是 2.36 dB——差了一个数量级。' },
    { heading: '为什么不按业界那套映射', text: '把一条高低不一的信道折成一个等效信噪比，业界常用的办法是指数有效信噪比映射（exponential effective SINR mapping, EESM），它要为每一级调制和码率各配一个 β 系数，而 β 要拿目标误块率曲线调出来。本设计把标准通读了一遍也没找到它——那会是本仿真器唯一一个自己编的物理量。容量不需要任何系数：它是对 log2(1+x) 这个凹函数用一次延森不等式（Jensen\'s inequality），所以它的结果不会比按均值估更乐观，而且里面没有一个数是作者选的。代价是它仍然偏乐观——那条不等式管得住「不比按均值估更乐观」，管不住「不比真实接收机乐观」，下面「硬门限代替曲线」那一条说的就是这件事。' },
  ],
  sources: [
    '按 26 根音调一块回报平均信噪比，出自标准的信道质量指示字段——而两代各有一条，两条分住两份文档：HE 那一条是 IEEE Std 802.11-2024 的 §9.4.1.65（HE CQI Report 字段），EHT 那一条是 IEEE Std 802.11be-2024 的 §9.4.1.75（EHT CQI Report 字段）。基础标准里没有 §9.4.1.75，它的 9.4.1 到 §9.4.1.71 就结束了，所以把两个条号并列挂在同一份文档上是错的。每 20 MHz 九块是后面那一条给的。78.125 kHz 的子载波间隔出自 802.11be 第 36 章的参数表（Table 36-18），每格 2.03125 MHz 由这两个数算出，源码里没有这个字面值。',
    '−8 到 +7 dB、四个比特的逐子载波偏差字段是 802.11 的 §9.4.1.49。落在窗口内外的比例（莱斯 K = 6 dB 下 96.7 %，瑞利下 15.33 % 在外）是拿本仿真器自己的抽样量的，并与瑞利的闭式解核对过，不是标准给的数。',
    '逐格偏差的分布与 K 因子沿用场景里 fading 那一节的取值（engine/fading.ts 的 rayleigh/rician，K 默认 6 dB），是本仿真器的选择：标准没有规定任何信道模型、时延扩展或相干带宽。按容量合成同样是本仿真器的选择，标准不规定接收机怎么把各格折成一个数。',
    '掉帧率那张表是四十五次运行按余量池化出来的（tests/engine/selectivity-inert.test.ts）；最深那一格的两个均值与 2.3／2.36 dB 两个损失中位数出自同一批四万次抽样（tests/engine/selectivity.test.ts）；10.29 dB 是这一课 20 MHz 变体自己那 150 ms 跑出来的（tests/course/selectivity.test.ts）——引擎那边同一个场景跑 200 ms 读到的是另一个数，抽样多了，最深的那一格就更深。',
  ],
  limits: [
    { kind: 'model-value', text: '逐格偏差的分布与 K 因子不是标准取值，是场景里 fading 那一节的两个配置值（engine/fading.ts：瑞利，或莱斯加一个默认 6 dB 的 K）。这一节自己没有引入任何新的物理量——它只是把那一次平坦抽样改成按格各抽一次。标准里没有信道模型表、没有时延扩展、也没有相干带宽（设计文档对此做过穷举检索），所以「一格该有多深」这个问题的答案全部来自那一节，换一个分布，本课除了格数以外的每一个数都会变。' },
    { kind: 'unmodelled', text: '格间相关长度没有取值：本仿真器把各格当成彼此独立的抽样。真实信道不是这样——相邻的两格大半时间一起深、一起浅，相干带宽是有限的，而格间相关会把频率分集吃掉一部分。所以独立是分集偏多的那一边：本课那张掉帧率表里，宽信道得到的好处比真实信道里的更大。时延扩展本身也没有建模——一格的深浅是抽出来的，不是从哪条路径的到达时间算出来的；节点也不动，所以没有多普勒，相干时间是一个配置值而不是从谁的速度推出来的。' },
    { kind: 'threshold', text: '合成用的是容量，而真实接收机达不到容量：实际的损失要看调制、码率与交织器，本模型一个都没有枚举。所以这一课给出的每一个损失都是下界——2.36 dB 是最小的那个数，真实的那个更大，掉帧率也会比表里的高。这个差值正好就是指数有效信噪比映射（exponential effective SINR mapping, EESM）里那个 β 系数要补的东西，而标准从未给过 β，本仿真器因此拒绝发明它：宁可给一个说得清的下界，也不给一个来历说不清的准确值。' },
    { kind: 'out-of-scope', text: '分格只进到解调这一步（合成在 channel.ts 的 resolveLock 里、锁定之后）。载波侦听、前导检测与捕获效应读的还是整条信道那一次平坦抽样；发送端选哪一级速率读的甚至不是这一帧的抽样，而是链路表里那一个静态的均值电平（simulation.ts 的 mcsForPeer），连慢的那层阴影都不含——所以不要拿本课的场景去问「频率选择性让这台设备听见了什么」或者「它为什么选了这一级速率」，那四个问题的答案里没有分格。这把尺也只量 Wi-Fi 6 与 Wi-Fi 7 的链路：同一个场景里的 vht 站与传统站整帧仍然只有一个电平，因为 312.5 kHz 的子载波间隔上不存在 26 音调资源单元。schema 的规则是「至少有一条」这样的链路，所以一个混着三代设备的场景是合法的，而你在那台 vht 站的记录里一条合成记录也看不到——不是漏了，是它本来就不分格。还有一处仍然超出范围：多用户成员读的是它自己那一份截到整数格之后的格数，而本仿真器只会把一帧按成员数平分，所以不要拿它去问一个不等分的分配会给出什么——被截掉的那一格在这里不属于任何成员。' },
  ],
  scenario: () => selectivityScenario(20),
  variants: WIDTHS.map((w) => ({ label: `${w} MHz`, scenario: () => selectivityScenario(w) })),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一条合成记录', (r) => r.type === 'WIFI_SEL'),
    J('第一次没解出来的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [
    `在事件日志里找 selectivity 那一行：mean 是这一帧的均值，worst bin 是最深那一格比均值低多少，effective 是合成之后的值，loss 是两者之差，over 后面就是格数。五个带宽逐档切过去，格数从 ${selBins(20)} 走到 ${selBins(320)}，worst bin 从约 10 dB 深到约 23 dB——每翻一倍约 3 dB。`,
    '盯住同一行的 loss：最深那一格深了十几个分贝，loss 却几乎没动，一直在 2 dB 上下（这一课最窄一档的中位数 2.03 dB，最宽一档 2.36 dB）。判决读的是 effective，所以曲线的最低点有多低，和这一帧解不解得出来，不是同一个问题。',
  ],
  tryThis: [
    '点“在编辑器中打开”，在「频率选择性（frequency selectivity）」一节把「按 26 音调资源单元分格」的勾去掉再跑：selectivity 那一行不再出现，整条信道回到一个值。别把两次运行的掉帧数直接相减：平坦的那一次深衰是整帧一起深，更容易触发降档——关掉分格的那一轮，五个带宽全都被压到过速率阶梯最低的一级，而打开分格的那一轮一次也没有。两轮连速率都不同，掉帧数不可比。',
    '还在编辑器里，把「时变链路（衰落）」一节的「小尺度分布」改成「无」：分格那个复选框立刻变灰，理由就写在旁边——没有小尺度衰落，每一格都抽到同一个数，打开与关着逐字节相同。另外两条拒绝也各试一次：删掉整个衰落小节，以及把两端都改成传统电台（纯 nonht 链路上不存在这样的分格）。',
  ],
  quiz: [
    {
      q: '320 MHz 的信道有一百四十四格，最深那一格平均比均值低 24.09 dB。这条链路的信噪比要因此减掉 24.09 dB 吗？',
      options: [
        '要：一格解不出来，整帧就解不出来',
        '不要：编码跨整条信道，判决读的是各格折成的有效信噪比，实际损失的中位数是 2.36 dB',
        '不要：最深那一格会被均衡器完全补回来，损失是零',
      ],
      answer: 1,
      explain: '最深那一格是曲线的最低点，不是链路的损失：把它当成损失，就等于删掉了编码跨整条信道这件事。',
    },
    {
      q: '那张掉帧率表里，五个带宽的余量都是 3.62 dB。这个前提去掉会怎样？',
      options: [
        '没影响：余量只改速率，不改掉帧率',
        '五个数就不可比了：余量宽的那一档会把代价换成降一级速率，于是它掉的帧反而更少',
        '没影响：掉帧率已经除过帧数了',
      ],
      answer: 1,
      explain: '除以帧数解决的是「宽信道发得多」，解决不了「某一档自己降了一级」。这一课的场景正是例子：它五轮的余量并不齐，最窄那一档自己停在高一级的余量上，于是那一轮里它的掉帧率不是最高的。',
    },
  ],
}
