/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · what a member's own resource unit costs it in
 * frequency diversity.
 *
 * **Standard-first shape (2026-11-11).** ① what the standards fix: the RU tone tables
 * (IEEE Std 802.11-2024 §27.3.2.2, Tables 27-7 to 27-9 — two 106-tone RUs leave the middle
 * 26-tone RU 5 out at 20 MHz, four leave RU 5 and RU 14 out at 40 MHz), the HE subcarrier spacing
 * (§27.1.1), the per-RU-size rate tables (§27.5.1), EHT's multiple RUs (802.11be §36.3.2.2) and
 * its 26-tone CQI granularity (802.11be §9.4.1.75) — and that the standard does not say how a
 * receiver combines its subcarriers into one decision. ② what this simulator does instead: an
 * equal share, 26-tone bins with independent Rayleigh draws, an integer bin count per member,
 * a capacity average against one threshold. ③ four runs.
 *
 * The lesson sits immediately after `ofdma-dl`, because `ofdma-dl`'s own scene cannot show this
 * effect: that scene's margin is 15.4 dB, where neither leg of this comparison loses a frame.
 * Two figures the design doc once offered for this lesson (「九格 2.31 dB、四格 2.20 dB」,
 * 「p90 从 4.70 涨到 5.85」) belong to `ofdma-dl`'s scene and are false here — this scene's own
 * pair is 2.27 → 1.92 dB median and 4.44 → 5.66 dB at p90 (re-measured 2026-11-11 after W7a).
 *
 * Every figure printed below is measured on this lesson's own scene (or, for the window lab, on
 * the same scene with both televisions moved one metre) and read back out of the lesson text in
 * tests/course/ru-diversity.test.ts. The bin counts come from `engine/selectivity.ts` rather than
 * being typed, so a literal here cannot drift from the engine the lesson describes.
 */
import { selBins, selMemberBins } from '../../engine/selectivity'
import { type Lesson, J, firstMuDl } from '../lessonKit'
import { ruDiversityScenario } from '../wifiScenes'

/** A member's bins at 20 MHz with two members: the figure the first lab reads off the log. */
const HALF = selMemberBins(20, 1 / 2)
/** The whole 20 MHz channel's bins. */
const FULL = selBins(20)

export const ruDiversity: Lesson = {
  id: 'ru-diversity',
  module: 9,
  title: '成员的格数——资源单元变窄后，变差的是分布的尾部而不是平均值',
  why: `IEEE 802.11-2024 的资源单元（resource unit, RU）占用固定的子载波（sub-carrier）：20 MHz 信道有九个 26 音调的最小资源单元；两个成员时，标准用的是两个 106 音调资源单元，各覆盖四个 26 音调的位置，中间那个 26 音调资源单元不属于其中任何一个。一个成员只解调自己那一段子载波，所以它能利用的频率分集只来自那一段。接收端怎样把各子载波合成为一次判决，标准不规定。本仿真器按每 26 个音调一格取独立的衰落值，成员读自己份额内的整数格——20 MHz 两个成员各读 ${FULL} 格中的 ${HALF} 格——再按容量把这几格合成为一个有效信噪比（signal-to-noise ratio, SNR），与门限比较。格少，参与平均的项少，合成值的平均几乎不变，起伏却向两端扩大，深的一端意味着一次重传（retry）。在本课余量只有 3.547 dB 的链路（link）上，两台电视各读四格时丢帧率是 29.30 %；同一台电视关闭正交频分多址（orthogonal frequency-division multiple access, OFDMA）、读整条九格时是 19.86 %。这个差别只在一段余量范围内存在：余量宽时两种配置都几乎不丢帧，余量降到 1.310 dB 时方向已经相反。`,
  outcomes: [
    '说出标准在 20 MHz 上给两个成员的是哪两个资源单元，剩下的是哪一个',
    '分清本仿真器的格、份额与合成，哪些是它自己的取法',
    '读出资源单元变窄后损失分布的哪一端变了，并说出这一结论成立的余量范围',
  ],
  needs: ['ofdma-dl', 'selectivity'],
  terms: [
    { term: '成员那一份', plain: '一次多用户发送中分配给某一台设备的那一块子载波，以占比的形式记录在该设备自己的条目中' },
    { term: '成员的格数', plain: '这一份覆盖多少个 26 音调的格：整条信道的格数乘以这一份，再向下取整为整数格；这是本仿真器的算法' },
    { term: '起始格', plain: '这一部分从信道的第几格开始，等于排在它前面各成员格数之和' },
    { term: '频率分集', plain: '同一帧分布在多个格上，深衰落的格与浅衰落的格相互补偿带来的增益；格越少，这项增益越小' },
    { term: '被截掉的那一格', plain: '等分结果不是整数格时舍去的格；本仿真器不把它分给任何成员' },
  ],
  standard: [
    { heading: '20 MHz 的资源单元（802.11-2024 §27.3.2.2，表 27-7、表 27-8）', text: '一个 26 音调资源单元由 24 个数据子载波和 2 个导频子载波组成，位置由表 27-8 固定。20 MHz 信道有九个 26 音调资源单元（RU 1 至 RU 9）、四个 52 音调、两个 106 音调和一个 242 音调资源单元（表 27-7）。两个 106 音调资源单元占子载波 −122 至 −17 与 17 至 122，中间的 RU 5（−16 至 −4、4 至 16）不在其中；表 27-8 的注 2 专门指出 RU 5 是中间那个 26 音调资源单元。' },
    { heading: '40 MHz（表 27-9）', text: '40 MHz 信道有十八个 26 音调资源单元；四个 106 音调资源单元覆盖其中十六个，26 音调的 RU 5 与 RU 14 不在其中。' },
    { heading: '子载波间隔（§27.1.1）', text: 'HE 物理层（physical layer, PHY）的数据子载波间隔是 VHT 的四分之一，即 78.125 kHz；一个 26 音调资源单元宽 26 × 78.125 kHz = 2.03125 MHz。' },
    { heading: '速率随资源单元变化（§27.5.1）', text: '每种尺寸的资源单元有各自的速率参数表；一个用户每个符号（symbol）承载的数据比特数由它的资源单元尺寸决定。' },
    { heading: 'EHT 的补充（802.11be-2024 §36.3.2.2，§9.4.1.75）', text: 'EHT 允许把几个资源单元组合起来分给一个站点（station, STA）。EHT 的信道质量报告按 26 音调资源单元给出每一块的平均信噪比——各子载波信噪比分贝值的算术平均——20 MHz 共九块。' },
    { heading: '标准没有规定什么', text: '标准规定了发送端把数据放在哪些子载波上，没有规定接收端怎样把各子载波的质量合成为一次判决，也没有规定调度器给成员分多大的资源单元。' },
    { kind: 'steps', heading: '一个站点怎样用上自己的资源单元，按标准：逐步说明', items: [
      '接入点（access point, AP）从表 27-8 至表 27-10 里为每个站点选一个资源单元（§26.5.1.3）。',
      '多用户 PPDU（multi-user PPDU, MU PPDU）的 HE-SIG-B 字段写明资源分配，站点据此找到自己的资源单元（§27.3.11.8.1）。',
      '站点解调这个资源单元的子载波，按这种尺寸的速率参数解码（§27.5.1）。',
    ] },
  ],
  implementation: [
    { topic: '资源单元尺寸', standard: '固定的音调表（表 27-8、表 27-9）', sim: '按成员数等分：每个成员 1/n 条信道。', kind: 'differs' },
    { topic: '格', standard: '标准没有「格」；最小的资源单元是 26 音调，EHT 的信道质量报告也按 26 音调分块（802.11be §9.4.1.75）', sim: `频率选择性按每 26 个音调一格取值：20 MHz ${FULL} 格，40 MHz ${selBins(40)} 格。`, kind: 'choice' },
    { topic: '成员的格数', standard: '20 MHz 两个成员各得一个 106 音调资源单元，各覆盖四个 26 音调的位置（表 27-8）', sim: `格数 = ⌊整条信道的格数 × 份额⌋，起始格是排在前面各成员格数之和；20 MHz 两个成员各 ${HALF} 格，40 MHz 四个成员各 ${selMemberBins(40, 1 / 4)} 格，与音调表的覆盖数吻合。`, kind: 'choice' },
    { topic: '剩下的格', standard: '中间的 RU 5 可以分给别的站点，EHT 还可以把几个资源单元组合给一个站点（802.11be §36.3.2.2）', sim: `不分配：20 MHz 两个成员时剩下 ${FULL - 2 * HALF} 格，40 MHz 四个成员时剩下 ${selBins(40) - 4 * selMemberBins(40, 1 / 4)} 格，都不属于任何成员；剩下的是信道最高端，而标准剩下的是中间的 RU 5。`, kind: 'absent' },
    { topic: '各格的衰落', standard: '标准不规定信道模型', sim: '各格独立抽取瑞利衰落，格与格之间没有相关；所以一段四格位于信道的哪个位置，不影响结果。', kind: 'choice' },
    { topic: '合成与判决', standard: '标准不规定接收机怎样合成', sim: '按容量把各格平均成一个有效信噪比，与这一级速率的门限比较，超过即解出；判决与帧长无关。真实接收机达不到容量，所以这里给出的损失是下界。', kind: 'choice' },
    { topic: '速率选择', standard: '标准未规定', sim: '发送端按链路表里的平均电平选调制与编码方式（modulation and coding scheme, MCS），不看成员份额有多窄。', kind: 'choice' },
    { topic: '资源单元内再按空间划分', standard: 'HE 不小于 106 音调、EHT 不小于 242 音调的资源单元可以做多用户 MIMO（multi-user MIMO, MU-MIMO）（802.11-2024 §27.1.1，802.11be §36.1.1）', sim: '没有实现：按频率划分与按空间划分互斥。', kind: 'absent' },
    { topic: '块确认的接收', standard: '征询来的块确认（block acknowledgement, BlockAck）装在 HE 基于触发的 PPDU（trigger-based PPDU, TB PPDU）里，只占被指定的资源单元（802.11-2024 §26.5.2.3.4）', sim: '这些块确认的合成按整条信道的九格计算，没有只读它们自己的四格；所以它们得到的频率分集比实际占用的子载波多。', kind: 'differs' },
    { topic: '相邻资源单元之间', standard: '标准给出各资源单元的子载波位置，不规定接收机怎样处理相邻资源单元的泄漏', sim: '同一次发送的各部分互不计入干扰；逐格处理只改变信号一侧，干扰与噪声在每一格里相同。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一条带份额的合成记录',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一条带份额的合成记录。',
        '在事件日志里找到写有 selectivity 的那一行（行首是时间戳，这个词位于两个节点名之后），读出它末尾的格号范围；再找另一台电视的同类记录。',
      ],
      expect: `你应该看到：一台电视的记录末尾是 over bins 0–${HALF - 1} of ${FULL}, its 1/2 of the channel，另一台是 bins ${HALF}–${2 * HALF - 1} of ${FULL}；第 ${FULL - 1} 格（格号从 0 开始）两台都没有分到。150 ms 内的合成记录共 67 条：两台电视接收多用户（multi-user, MU）发送的 42 条都带份额；整条信道的（over ${FULL} bins）有 25 条，其中 1 条是接入点发给一台电视的单用户帧，24 条是块确认的接收。同一行前面的三个读数是 mean、worst bin 与 effective。`,
      meaning: '这说明：成员只读自己份额内的格（②）；标准的两个 106 音调资源单元同样剩下一个 26 音调的位置，只是标准剩下的是中间的 RU 5，本仿真器剩下的是最高一格（①、②）。',
    },
    {
      heading: '同一个余量，两种配置',
      more: [1],
      steps: [
        '依次载入本课场景与「OFDMA 关闭（整条九格）」，各运行 1000 ms。',
        '按每条接收的余量分组，取最大的一组，统计未能解出的接收。',
      ],
      blocks: [
        { kind: 'table', heading: '同一个余量组里的两种配置（1000 ms）', head: ['配置', '格数', '未能解出的接收', '丢帧率'], rows: [
          ['两台电视编在同一次下行发送里', String(HALF), '273 条中 80 条', '29.30 %'],
          ['同一台电视，关闭 OFDMA', String(FULL), '141 条中 28 条', '19.86 %'],
        ] },
      ],
      expect: '你应该看到：两台电视离路由器一样远、隔着同样两道砖墙，到达电平约 −81 dBm，每一帧都用最低一级的调制与编码方式。这一组的余量是 3.547 dB，包含开 OFDMA 时 283 条下行（downlink, DL）接收中的 274 条、关 OFDMA 时 143 条中的 141 条。读四格时丢帧率 29.30 %，读九格时 19.86 %。',
      meaning: '这说明：格数减少，丢帧增加；这个差别来自本仿真器的逐格衰落与容量合成（②），标准本身不规定接收机怎样合成（①）。',
    },
    {
      heading: '变的是尾部，不是平均值',
      more: [1],
      steps: [
        '沿用上一个实验的两轮运行和同一个余量组。',
        '把每条接收的损失按大小排列，读出平均值、中位数、第九十百分位和最深的一条；再读出每条接收里最深那一格比均值低多少。',
      ],
      blocks: [
        { kind: 'table', heading: '同一组接收的损失', head: ['统计量', '整条九格', '成员四格'], rows: [
          ['平均', '2.198 dB', '2.284 dB'],
          ['中位数', '2.272 dB', '1.923 dB'],
          ['第九十百分位', '4.439 dB', '5.655 dB'],
          ['最深的一条', '7.007 dB', '9.553 dB'],
          ['合成后比均值还好的接收', '141 条中 11 条（7.8 %）', '273 条中 47 条（17.2 %）'],
          ['最深一格比均值低（中位数）', '11.937 dB', '7.906 dB'],
        ] },
      ],
      expect: '你应该看到：平均损失只差 0.086 dB，不到第九十百分位差距（1.216 dB）的十分之一，四格的中位数还更小；第九十百分位和最深的一条，四格都更大；而最深那一格反而是四格更浅。',
      meaning: '这说明：格少时合成值的起伏向两端扩大，丢帧只计深的一端；用最深那一格比较两种配置，会得出与实测相反的结论（②的合成方式）。',
    },
    {
      heading: '这个差别只在一段余量里存在',
      more: [1],
      steps: [
        '点击「在编辑器中打开」，把两台电视沿同一直线一起向内移动一米（x 从 13.5 改为 12.5），两种配置各运行 2000 ms；再一起向外移动一米和两米（x 改为 14.5 和 15.5），本课的位置也同样运行 2000 ms。',
        '按同样的分组规则读出余量和两种配置的丢帧率。',
      ],
      blocks: [
        { kind: 'table', heading: '移动电视之后（各 2000 ms）', head: ['电视的位置', '余量', '成员四格', '整条九格'], rows: [
          ['x = 12.5', '4.826 dB', '16.20 %', '5.61 %'],
          ['x = 13.5（本课）', '3.547 dB', '26.80 %', '18.91 %'],
          ['x = 14.5', '2.381 dB', '42.42 %', '40.45 %'],
          ['x = 15.5', '1.310 dB', '58.92 %', '64.15 %'],
        ] },
      ],
      expect: '你应该看到：向内一米，四格仍然比九格丢得多；向外一米，余量降到 2.381 dB，差距缩小到约 2 个百分点；向外两米，余量降到 1.310 dB，方向反过来，四格反而丢得少。',
      meaning: '这说明：「资源单元越窄越差」只在一段余量里成立；余量接近零时，起伏大反而是偶然解出一帧的原因（②的判决方式）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§27.3.2.2 与表 27-7、表 27-8、表 27-9（资源单元的尺寸、数目与子载波位置；表 27-8 注 2 的中间 26 音调资源单元）、§27.1.1（HE 数据子载波间隔是 VHT 的四分之一；HE 的 MU-MIMO 资源单元不小于 106 音调）、§27.5.1（各尺寸资源单元的速率参数）、§26.5.1.3（资源单元的分配）、§27.3.11.8.1（HE-SIG-B 的资源分配信息）。IEEE Std 802.11be-2024：§36.3.2.2（多资源单元）、§9.4.1.75（EHT 信道质量报告按 26 音调资源单元分块）、§36.1.1（EHT 的 MU-MIMO 资源单元不小于 242 音调）。',
    '本仿真器的取值与取法：成员份额按成员数等分；每 26 个音调一格、各格独立的瑞利衰落；成员格数向下取整、剩下的格不分配；按容量合成有效信噪比、硬门限判决；速率按链路表的平均电平选择。273、80、29.30 % 等计数来自本课两个变体 1000 ms 的运行，第四个实验来自把两台电视移动一到两米后、各 2000 ms 的同样运行，都可以复现。',
  ],
  limits: [],
  scenario: () => ruDiversityScenario(),
  variants: [
    { label: '两个成员（各四格）', scenario: () => ruDiversityScenario(true) },
    { label: 'OFDMA 关闭（整条九格）', scenario: () => ruDiversityScenario(false) },
  ],
  jumps: [
    J('第一次包含两个成员的下行发送', firstMuDl),
    J('第一条带份额的合成记录', (r) => r.type === 'WIFI_SEL' && r.ruFraction !== undefined),
    J('第一次未能解出的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '同一个余量组里，四格配置丢帧更多，但它最深那一格反而比九格配置更浅。这两点矛盾吗？',
      options: [
        '矛盾：丢帧更多就说明它遇到的格更深',
        '不矛盾：判决依据的是各格换算成的有效信噪比，而格数减少之后这个合成值的起伏更大，深的那一端因此更深',
        '不矛盾：最深那一格会被均衡器补偿，所以它与丢帧无关',
      ],
      answer: 1,
      explain: '格数是取平均的项数：项数少，平均值的起伏就大，分布向两端同时扩展。最深那一格取决于抽样次数，抽样少就浅；而丢帧取决于合成值深的那一端，它反而更深。',
    },
    {
      q: '前一课的场景里也有两台电视编在同一次发送中，加上衰落与分格之后，它那一轮的余量中位数是 15.4 dB。把本课的比较用到那个场景上，会怎样？',
      options: [
        '差距会变得更大，因为那条链路更好',
        '两种配置都几乎不丢帧，差距变为两个零——在那个场景里看不到本课要讲的现象',
        '完全不变：丢帧率已经除以接收条数了',
      ],
      answer: 1,
      explain: '余量宽达十五分贝时，格数减少一半也改变不了任何一次判决——所以本课单独建立了一个余量处于窗口内的场景。',
    },
    {
      q: '按标准，20 MHz 信道分给两个成员时，各得哪种资源单元？',
      options: [
        '各得 4.5 个 26 音调资源单元',
        '各得一个 106 音调资源单元，中间的 26 音调 RU 5 不属于其中任何一个',
        '各得一个 242 音调资源单元',
      ],
      answer: 1,
      explain: '表 27-8：两个 106 音调资源单元占子载波 −122 至 −17 与 17 至 122，RU 5 在两者之间。本仿真器的「各四格」恰好与之吻合，但它剩下的那一格在信道最高端。',
    },
  ],
}
