/**
 * Wi-Fi Tier 2 · M4 · 容量旋钮与速率控制 · Frequency selectivity.
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
 * 2.36 dB median loss in tests/engine/selectivity.test.ts, the five pooled drop
 * rates and the 3.62 dB margin they share in tests/engine/selectivity-inert.test.ts,
 * the 10.08 dB a single round shows at 20 MHz in tests/engine/selectivity-round.test.ts,
 * and everything this lesson's own scene shows in tests/course/selectivity.test.ts.
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
 *  - §4.1's open-loop 34.43 % → 7.14 %, which are draws at a fixed 20 dB SINR
 *    that no lesson run produces.
 *
 * The bin width and the bin counts are computed from `engine/selectivity.ts`
 * rather than typed, for the reason that module gives: they are the standard's
 * own arithmetic, and a literal here could drift out of agreement with the engine
 * the lesson is describing.
 */
import { selBinWidthMhz, selBins } from '../../engine/selectivity'
import { type Lesson, firstData, J } from '../lessonKit'
import { selectivityScenario } from '../wifiScenes'

/** The five widths this lesson runs, narrowest first — its variants and its two tables. */
const WIDTHS = [20, 40, 80, 160, 320] as const

/** 「20」「40」…, so the tables and the variant labels cannot disagree about the five widths. */
const binRows = (): string[][] => WIDTHS.map((w) => [
  String(w), String(selBins(w)), selBinWidthMhz().toString(),
])

export const selectivity: Lesson = {
  id: 'selectivity',
  module: 8,
  title: '频率选择性——一部分深衰，和整帧解不出来，是两回事',
  why: '到这一课之前，一条链路（link）在某一刻只有一个电平：信噪比（signal-to-noise ratio, SNR）是一个数，这一帧解得出还是解不出，由那一个数判定。真实的宽带室内信道不是这样——同一时刻，信道的一部分深衰到谷底，另一部分完好，而一个数演不出「一部分」。按直觉，信道越宽，落进深衰的那几格就越多，所以应该越糟；把这件事按标准自己的分格单位建出来之后，跑出来的方向与这个直觉相反。前一课那条 limits 已经把结论写成一句话，这一课给的是它的机制、它的三个数，以及每个数是在什么上面量出来的。',
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
    { heading: '标准自己就是按格回报的', text: '要分格，先得回答分多宽，而这件事不用自己定：标准里早有一个为信道质量准备的分格单位，叫资源单元（resource unit, RU），最小的那一种由 26 根相邻音调合成；接收端回报信道质量时，回报的正是每一个这样的块里的平均信噪比，不是整条信道一个数。标准肯这样花代价，本身就说明那条曲线值得按块描述。本仿真器照搬这个单位：格宽由它与子载波间隔算出，格数由带宽算出，两个都不可配——可配就意味着那是本仿真器编的数。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到笔记本发给路由器的第一个数据帧（data frame）。这一课的场景已经把衰落和分格一起打开了——它们必须一起打开，后面会说为什么。打开「事件日志」，找 selectivity 开头的那一行：这一帧的均值、最深那一格、合成之后的值和格数，它一次印全。这一课载入的是最窄的一档，九格。' },
    { heading: '编码跨的是整条信道', text: '一格深衰，这一帧就没了吗？没有。一帧的数据是正交频分复用（orthogonal frequency-division multiplexing, OFDM）发出去的：一个符号（symbol）的比特先经过信道编码，再摊到整条信道的音调上。所以一格塌下去，损失的是整帧比特里的一小部分，而编码的冗余本来就是为补这种零散缺口准备的——格数越多，同一份冗余要补的缺口越分散。这就是「一部分死掉」和「这一帧死掉」的分界。本仿真器把各格的信噪比按容量折成一个有效信噪比，判决落在这个合成值上：不取最差那一格，那等于宣布一格塌了整帧就完；也不取算术平均，那会把深格对容量的伤害抹平。' },
    { heading: '只有解调这一步读合成值', text: '分格只改了一件事：解调的判决。载波侦听（carrier sense）听没听见、前导检测（preamble detection）锁没锁上、捕获效应（capture effect）要不要为更强的一帧放弃手里这一帧、以及发送端选哪一级速率，读的仍然是整条信道那一次平坦抽样。于是同一帧的一生里，「均值」指着两个数：那四步读平坦抽样之后的电平；合成这一步先把那次平坦抽样减回去，拿剩下的几何、墙壁与阴影当均值，再逐格抽一次偏差加上去。逐格抽样是替换那一次平坦抽样，不是叠在它上面——否则同一帧会被衰落两次。' },
  ],
  numbers: [
    { kind: 'table', heading: '格宽与格数，两个都是算出来的', head: [
      '带宽（MHz）', '格数（个）', '每格宽度（MHz）',
    ], rows: binRows() },
    { heading: '这张表怎么来的', text: '每格宽度 = 26 根音调 × 78.125 kHz，也就是 2.03125 MHz，而 78.125 kHz 是 Wi-Fi 7 的子载波间隔，与保护间隔出自同一张参数表。格数那一列更直接：标准回报信道质量时，每 20 MHz 就是九块，所以九乘以带宽再除以 20 就是格数。一格的宽度与带宽无关，所以带宽翻倍，格数就翻倍。' },
    { kind: 'steps', heading: '引擎在一帧上怎么算这个合成值', items: [
      '取这一帧自己的带宽，按上表算出格数：确认帧（acknowledgement, ACK）是 20 MHz 的传统帧，所以它永远只有九格。',
      '把这一帧那次平坦的快衰落从锁定电平里减掉，剩下的就是均值——阴影是整条信道一起动的，所以它留在均值里。',
      '每一格各抽一次快衰落偏差：分布和 K 因子就是场景里 fading 那一节的，这一节自己没有新取值。',
      '每一格的信干噪比（signal-to-interference-plus-noise ratio, SINR）= 均值 + 这一格的偏差 − 干扰与噪声。干扰与噪声在每一格里是同一个数，所以逐格起伏的只有信号这一侧。',
      '按容量合成：每一格算一个 log2(1 + 信噪比)，取各格的平均，再反解回分贝——这就是有效信噪比。',
      '把有效信噪比与这一级速率的门限比一下：过了就解出来，没过就是一次解不出来的接收，随后重传（retry）。',
    ] },
    { kind: 'formula', heading: '合成那一步写全', text: '有效信噪比 = 10·log10( 2^( 各格 log2(1 + 10^((均值 + 该格偏差)/10)) 的平均 ) − 1 )', note: '容量是个上界：真实接收机达不到它，所以这条式子给出的频率选择性损失是下界，真实的损失更大。业界补这个差值的办法要一个按速率阶梯每一级各自调出来的系数，而标准从未给过它，本仿真器因此没有发明它。' },
    { kind: 'table', heading: '两端的两个量：最深那一格，和整帧实际付出的损失', head: [
      '量', '20 MHz（九格）', '320 MHz（一百四十四格）',
    ], rows: [
      ['最深那一格比均值低', '12.05 dB', '24.09 dB'],
      ['整帧有效信噪比的损失中位数', '几乎是同一个数（2 dB 上下）', '2.36 dB'],
    ] },
    { heading: '这两行是一组反向的数', text: '上面一行每翻一倍深约 3 dB：格数越多，抽到很深一格的机会越大，这一半直觉是对的。下面一行却几乎不随带宽动，一直在 2 dB 上下。差了十倍的两个数说的是两件事：最深那一格是曲线的最低点，而损失是整条曲线折成一个数之后与均值的距离。把前者当成链路的损失，就会得出「宽信道差十二个分贝」这种结论。' },
    { heading: '一轮仿真会比这张表浅两个分贝', text: '12.05 dB 与 24.09 dB 是四万次抽样下的均值，而一轮仿真只有几百帧——几百次里最深的那一次，远到不了四万次里最深的那一次。这一课的 20 MHz 变体跑下来，最深那一格的中位数是比均值低 10.08 dB，比表里那一格浅了约两个分贝。两个数都对：一个是分布的均值，一个是一轮的中位数。先知道这件事，比在日志里撞上它再怀疑表印错了要好。' },
    { kind: 'table', heading: '掉帧率：五个带宽，余量都是 3.62 dB', head: [
      '带宽（MHz）', '格数（个）', '掉帧率',
    ], rows: [
      ['20', '9', '14.39 %'],
      ['40', '18', '12.71 %'],
      ['80', '36', '9.48 %'],
      ['160', '72', '5.09 %'],
      ['320', '144', '0.52 %'],
    ] },
    { heading: '读这张表要带三句话', text: '第一，它是掉帧率而不是掉帧数：一次接收没解出来算一次，再除以这一档发出的数据帧数。按个数比会把空口时间（airtime）混进来——同样一段时间里，宽信道发出的帧多得多。第二，这五个数能放进一张表，前提是五档余量都是 3.62 dB：余量不齐，速率控制会替某一档把代价换成降一级速率，而不是掉帧。第三，在这一组里，最窄那一档正是掉帧最多的那一个：14.39 % 到 0.52 %，端到端二十七倍。这组数是四十五次运行按余量池化出来的，不是哪一轮的结果：这一课的场景只有五轮，余量并不这样齐。' },
    { heading: '宽信道真正的代价，和往回赚的那一边', text: '这张表不是说信道越宽越好。带宽每翻一倍，收进来的噪声功率也翻一倍：噪声地板（noise floor）从 20 到 320 MHz 抬高了 12.04 dB，那才是宽信道真正的代价，前一课算的就是它。频率选择性是往回赚的那一边——格数多出来的频率分集把其中一部分补了回来。那张表之所以读得出来，是因为它先把这 12.04 dB 抵掉了：五档各自把两端的功率按噪声地板的抬高量提上去，余量才比得了。' },
    { heading: '为什么那个偏差字段只给四个比特就够', text: '标准里还有一个逐子载波的偏差字段：四个比特，−8 到 +7 dB。看着很窄，其实够用：按本仿真器的莱斯分布（K = 6 dB）抽逐格偏差，96.7 % 落在这个窗口里；只有最悲观的瑞利分布才有 15.33 % 落在窗口外被夹住。那四个比特是按有直射径的信道定的尺寸，不是按最差的信道定的——而本仿真器抽出来的起伏幅度正好对得上这个量程。' },
    { heading: '切成格之后还欠一项没算过的', text: '多用户（multi-user, MU）的场景里，一台设备占的是整条信道里属于自己的那几格，不是全部。而本仿真器按整帧的带宽给格数，于是一个只占三分之一信道的成员拿到了三倍于应得的格数——频率分集被高估，被判的损失因此偏小。这一项留给按资源单元分配的那一步去算，本课不假装它不存在。' },
  ],
  deeper: [
    { heading: '取最差那一格会得出什么', text: '把最深那一格当成这条链路的信噪比，是个很容易做出的设计：引擎本来就在一帧之内取最差的那一个瞬间，再在频率上取最差的那一格看着顺理成章。它会得出这样的结论：320 MHz 的链路比 20 MHz 的链路差十二个分贝。这不是偏保守，这是把 OFDM 编码跨整条信道这件事整个删掉了。两个数一起看才是反驳：同一批抽样下，最深那一格平均低 24.09 dB，而容量合成的损失中位数是 2.36 dB——差了一个数量级。' },
    { heading: '为什么不按业界那套映射', text: '把一条高低不一的信道折成一个等效信噪比，业界常用的办法是指数有效信噪比映射，它要为每一级调制和码率各配一个系数，而那个系数要拿目标误块率曲线调出来。本设计把标准通读了一遍也没找到它——那会是本仿真器唯一一个自己编的物理量。容量不需要任何系数：它是对 log2(1+x) 这个凹函数用一次延森不等式，所以它的结果不会比按均值估更乐观，而且里面没有一个数是作者选的。代价是它偏乐观——下面「硬门限代替曲线」那一条说的就是这件事。' },
  ],
  sources: [
    '按 26 根音调一块回报平均信噪比，出自 IEEE Std 802.11 的信道质量指示字段（§9.4.1.65 与 §9.4.1.75）；每 20 MHz 九块也是那里给的。78.125 kHz 的子载波间隔出自 802.11be 第 36 章的参数表（Table 36-18），每格 2.03125 MHz 由这两个数算出，源码里没有这个字面值。',
    '−8 到 +7 dB、四个比特的逐子载波偏差字段是 802.11 的 §9.4.1.49。落在窗口内外的比例（莱斯 K = 6 dB 下 96.7 %，瑞利下 15.33 % 在外）是拿本仿真器自己的抽样量的，并与瑞利的闭式解核对过，不是标准给的数。',
    '逐格偏差的分布与 K 因子沿用场景里 fading 那一节的取值（engine/fading.ts 的 rayleigh/rician，K 默认 6 dB），是本仿真器的选择：标准没有规定任何信道模型、时延扩展或相干带宽。按容量合成同样是本仿真器的选择，标准不规定接收机怎么把各格折成一个数。',
    '掉帧率那张表是四十五次运行按余量池化出来的（tests/engine/selectivity-inert.test.ts）；最深那一格的两个均值与 2.36 dB 的损失中位数出自同一批四万次抽样（tests/engine/selectivity.test.ts）；10.08 dB 是这一课 20 MHz 变体自己跑出来的（tests/engine/selectivity-round.test.ts）。',
  ],
  limits: [
    { kind: 'model-value', text: '逐格偏差的分布与 K 因子不是标准取值，是场景里 fading 那一节的两个配置值（engine/fading.ts：瑞利，或莱斯加一个默认 6 dB 的 K）。这一节自己没有引入任何新的物理量——它只是把那一次平坦抽样改成按格各抽一次。标准里没有信道模型表、没有时延扩展、也没有相干带宽（设计文档对此做过穷举检索），所以「一格该有多深」这个问题的答案全部来自那一节，换一个分布，本课除了格数以外的每一个数都会变。' },
    { kind: 'unmodelled', text: '格间相关长度没有取值：本仿真器把各格当成彼此独立的抽样。真实信道不是这样——相邻的两格大半时间一起深、一起浅，相干带宽是有限的，而格间相关会把频率分集吃掉一部分。所以独立是分集偏多的那一边：本课那张掉帧率表里，宽信道得到的好处比真实信道里的更大。时延扩展本身也没有建模——一格的深浅是抽出来的，不是从哪条路径的到达时间算出来的；节点也不动，所以没有多普勒，相干时间是一个配置值而不是从谁的速度推出来的。' },
    { kind: 'threshold', text: '合成用的是容量，而真实接收机达不到容量：实际的损失要看调制、码率与交织器，本模型一个都没有枚举。所以这一课给出的每一个损失都是下界——2.36 dB 是最小的那个数，真实的那个更大，掉帧率也会比表里的高。这个差值正好就是业界那套映射里的那个系数要补的东西，而标准从未给过它，本仿真器因此拒绝发明它：宁可给一个说得清的下界，也不给一个来历说不清的准确值。' },
    { kind: 'out-of-scope', text: '分格只进到解调这一步（合成在 channel.ts 的 resolveLock 里、锁定之后）。载波侦听、前导检测、捕获效应，以及发送端选哪一级速率，读的全都还是整条信道那一次平坦抽样——所以不要拿本课的场景去问「频率选择性让这台设备听见了什么」或者「它为什么选了这一级速率」，那四个问题的答案里没有分格。还有一处超出范围：多用户成员拿到的是整帧带宽的格数，而不是它自己那几格的，分集被高估了 1/占比 倍——按资源单元分配的那一步会改掉它。' },
  ],
  scenario: () => selectivityScenario(20),
  variants: WIDTHS.map((w) => ({ label: `${w} MHz`, scenario: () => selectivityScenario(w) })),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一条合成记录', (r) => r.type === 'WIFI_SEL'),
    J('第一次没解出来的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [
    '在事件日志里找 selectivity 那一行：mean 是这一帧的均值，worst bin 是最深那一格比均值低多少，effective 是合成之后的值，loss 是两者之差，over 后面就是格数。五个带宽逐档切过去，格数从九走到一百四十四，worst bin 从约 10 dB 深到约 23 dB——每翻一倍约 3 dB。',
    '盯住同一行的 loss：最深那一格深了十几个分贝，loss 却几乎没动，一直在 2 dB 上下（最窄一档的中位数 2.02 dB，最宽一档 2.36 dB）。判决读的是 effective，所以曲线的最低点有多低，和这一帧解不解得出来，不是同一个问题。',
  ],
  tryThis: [
    '点「在编辑器中打开」，在「频率选择性（frequency selectivity）」一节把「按 26 音调资源单元分格」的勾去掉再跑：selectivity 那一行不再出现，整条信道回到一个值。别把两次运行的掉帧数直接相减：平坦的那一次深衰是整帧一起深，更容易触发降档——关掉分格的那一轮，五个带宽全都被压到过速率阶梯最低的一级，而打开分格的那一轮一次也没有。两轮连速率都不同，掉帧数不可比。',
    '还在编辑器里，把「时变链路（衰落）」一节的「小尺度分布」改成「无」：分格那个复选框立刻变灰，理由就写在旁边——没有小尺度衰落，每一格都抽到同一个数，打开与关着逐字节相同。另外两条拒绝也各试一次：删掉整个衰落小节，以及把两端都改成传统电台（没有 OFDM 链路，26 音调资源单元这个单位无从定义）。',
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
