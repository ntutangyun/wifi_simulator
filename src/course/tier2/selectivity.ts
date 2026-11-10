/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · Frequency selectivity.
 *
 * Standard-first shape (2026-11-11). ① is what the standard says that bears on a channel that
 * fades differently across frequency: the 26-tone RU and where it sits (IEEE Std 802.11be-2024
 * §36.3.2.1, Table 36-5, Table 36-18), the CQI report that averages SNR over each 26-tone RU
 * (802.11be §9.4.1.75, IEEE Std 802.11-2024 §9.4.1.65, Table 9-129), the per-subcarrier Delta SNR
 * (§9.4.1.49), the LDPC tone mapper that spreads coded bits over the subcarriers (§36.3.13.8),
 * and the sensitivity requirement (§36.3.21.2) — and that it specifies no propagation channel and
 * no decoding rule. ② is this simulator's bins (`engine/selectivity.ts`), its per-bin draws and
 * capacity combining, each marked against ①; the CQI report and the Delta SNR are absent. ③ is
 * four runs of the five-width scene.
 *
 * The scenario builder and the five variants are unchanged, so the recorded timeline hashes in
 * tests/fixtures/lesson-hashes.json stay byte-identical. Every figure printed below is read back
 * out of the lesson text in tests/course/selectivity.test.ts and compared with the engine or a
 * run; the bin table is computed from `engine/selectivity.ts` rather than typed.
 */
import { selBinWidthMhz, selBins } from '../../engine/selectivity'
import { type Lesson, firstData, J } from '../lessonKit'
import { selectivityScenario } from '../wifiScenes'

/** The five widths this lesson runs, narrowest first — its variants and its tables. */
const WIDTHS = [20, 40, 80, 160, 320] as const

export const selectivity: Lesson = {
  id: 'selectivity',
  module: 8,
  title: '频率选择性——一部分深衰，和整帧解不出来，是两回事',
  why: '宽带的室内信道在同一时刻，一部分频率深衰、另一部分完好；上一课的信道是平的，整条信道只有一个电平。IEEE 802.11 不规定传播信道，也不规定接收机怎样把高低不一的子载波（sub-carrier）折算成一次判决；与此相关的是它的信道质量指示（channel quality indicator, CQI）报告：以 26 根相邻子载波组成的 26 音调资源单元（resource unit, RU）为单位，报告每一块内各子载波信噪比（signal-to-noise ratio, SNR）的分贝算术平均，每 20 MHz 9 块。LDPC 编码后的比特经音调映射分布到资源单元内相隔一定距离的子载波上，所以一处深衰只损失一帧比特中零散的一小部分。本仿真器沿用这个分块：每格 2.03125 MHz，20 MHz 9 格，320 MHz 144 格，每一格各抽取一次衰落，再按容量把各格合成为一个有效信噪比，判决依据这个合成值。格越多，最深那一格越深，本课的五轮从 20 MHz 的 10.29 dB 加深到 320 MHz 的 23.34 dB，有效信噪比的损失却一直在 2.03 dB 到 2.36 dB 之间。同一个第一帧，20、40、80 MHz 解不出，160、320 MHz 能解出。余量相同的四档里，信道越宽，掉帧率越低，从 40 MHz 的 9.17 % 降到 320 MHz 的 0.92 %；宽信道真正的代价仍是噪声地板（noise floor）随带宽升高，本课的场景已经用发射功率（transmit power）抵消了它。分格只进入解调这一步：载波侦听（carrier sense）、前导检测（preamble detection）与速率选择仍按整条信道的一个值。',
  outcomes: [
    '说出标准里与频率选择性有关的规定：26 音调资源单元、CQI 报告的算法，以及它不规定的信道与判决',
    '分清本仿真器的分格哪些照标准、哪些是它自己的取法、哪些没有实现',
    '从日志的合成记录读出最深一格与有效信噪比，并在余量相同的前提下比较各带宽的掉帧率',
  ],
  needs: ['width', 'noise-floor', 'decode-thresholds'],
  terms: [
    { term: 'frequency selectivity', plain: '频率选择性：同一时刻，信道的衰落深浅随频率不同；只随时间变化、各频率一样的信道称为平坦信道' },
    { term: '26-tone RU', plain: '26 音调资源单元：26 根相邻子载波组成的一块；CQI 报告按它取平均' },
    { term: 'CQI', plain: '信道质量指示：接收端回报的、每个 26 音调资源单元内的平均信噪比' },
    { term: 'effective SNR', plain: '有效信噪比：本仿真器把各格的信噪比按容量折算成的一个数，判决依据它' },
    { term: 'margin', plain: '余量：合成之前的平均信干噪比高出这一级门限多少分贝；不是选级时固定加的 3 dB 速率余量' },
  ],
  standard: [
    { heading: '26 音调资源单元（IEEE Std 802.11be-2024 §36.3.2.1，表 36-5，表 36-18）', text: 'EHT 数据字段的子载波间隔是 78.125 kHz（表 36-18）。最小的资源单元由 26 根相邻子载波组成。20 MHz 与 40 MHz 的子载波分配与 HE 相同（§27.3.2）；80 MHz 的位置由图 36-4 与表 36-5 给出，37 个位置里正中的第 19 个在 EHT 中没有定义；160 MHz 与 320 MHz 由若干个 80 MHz 子块组成，每个子块的分配与 80 MHz 相同。' },
    { heading: '信道质量指示报告（802.11be §9.4.1.75，IEEE Std 802.11-2024 §9.4.1.65）', text: 'EHT CQI 报告携带每个 26 音调资源单元、每条空间流（spatial stream）的平均信噪比：对这块里各子载波的信噪比取分贝值的算术平均。报告的块数是 9 乘以所请求的 20 MHz 子信道数；没有定义的第 19、56、93、130 号 26 音调资源单元不在报告中。每个平均值用 6 位二进制补码表示，以 1 dB 为一级，从 −10 dB 以下到 53 dB 以上（表 9-129）。HE CQI 报告取平均的方法相同，块的范围由起止资源单元号给出（§9.4.1.65）。' },
    { heading: '每个子载波的偏差（IEEE Std 802.11-2024 §9.4.1.49）', text: '多用户（multi-user, MU）专用波束成形（beamforming）报告里的 Delta SNR 字段，给出每个反馈子载波的信噪比相对这条空间流平均信噪比的偏差，限幅在 −8 dB 到 7 dB 之间（式 9-4）。' },
    { heading: '编码比特分布到各个子载波（802.11be §36.3.13.8）', text: 'LDPC 编码的空间流在资源单元内都要经过 LDPC 音调映射：相邻的编码比特被映射到相隔一个固定距离的子载波上，这个距离按资源单元的大小取值（表 36-52）。一处只占少数子载波的深衰因此影响的是分散在整个码字里的少数比特。' },
    { heading: '标准不规定的部分（§36.3.21.2）', text: '标准规定发射机与接收机的性能要求，例如在最小输入电平上 4096 字节 PSDU（PHY service data unit）的误包率低于 10 %；它不规定传播信道的模型，也不规定接收机怎样根据各子载波的质量判断一帧能否解出。' },
    { kind: 'steps', heading: '一个 CQI 值怎样算出，按标准：逐步说明', items: [
      '接收端对所请求带宽里的每个反馈子载波估计信噪比（§9.4.1.73）。',
      '对每个 26 音调资源单元，取它所含子载波信噪比的分贝值的算术平均（§9.4.1.75）。',
      '把这个平均值量化为 6 位：−10 dB 及以下为最低一级，53 dB 及以上为最高一级，中间每 1 dB 一级（表 9-129）。',
      '每 20 MHz 九个值，跳过没有定义的资源单元，依次放进 CQI 报告发回请求方。',
    ] },
  ],
  implementation: [
    { topic: '格宽', standard: '26 根子载波 × 78.125 kHz（表 36-18）', sim: `每格 26 × 78.125 kHz = ${selBinWidthMhz()} MHz，由这两个数算出，不可配置。`, kind: 'faithful' },
    { topic: '格数', standard: '每 20 MHz 九块，第 19 号等没有定义的不计（§9.4.1.75）', sim: `每 20 MHz 九格：${WIDTHS.map((w) => `${w} MHz ${selBins(w)} 格`).join('，')}，与 EHT CQI 报告的块数相同。`, kind: 'faithful' },
    { topic: '哪些帧分格', standard: '26 音调资源单元按 HE 与 EHT 的子载波间隔定义（§36.3.2.1）', sim: '只有 Wi-Fi 6 与 Wi-Fi 7 的 PPDU（PHY protocol data unit）分格；回程的确认帧（acknowledgement, ACK）是非 HT 帧，整帧只有一个电平。', kind: 'choice' },
    { topic: '每一格的衰落', standard: '标准不规定传播信道', sim: '每一格各抽取一次快衰落偏差，分布取场景 fading 一节的设置：本课是瑞利分布、阴影 0 dB。偏差只由这一帧与格的编号决定，所以同一帧的同一格在任何带宽下都相同；格内各子载波看成同一个值。', kind: 'choice' },
    { topic: '格与格之间', standard: '标准不规定', sim: '各格的抽样相互独立。真实信道的相邻频率往往同时变深或变浅，所以本仿真器得到的频率分集偏多，宽信道的收益偏大。', kind: 'choice' },
    { topic: '合成与判决', standard: '标准不规定接收机怎样判决（§36.3.21.2）', sim: '各格算 log2(1 + 信噪比)，取平均，再换算回分贝，得到有效信噪比；它达到这一级的门限就整帧解出，否则整帧丢失。容量是上界，所以这里的损失是下界。', kind: 'choice' },
    { topic: '分格进入哪一步', standard: '标准不规定', sim: '只进入解调：载波侦听、前导检测、捕获效应（capture effect）和发送端的速率选择仍按整条信道的一个值；速率选择用的甚至是不含衰落的平均电平。', kind: 'choice' },
    { topic: 'CQI 报告', standard: '每个 26 音调资源单元的平均信噪比，按请求发回（§9.4.1.75）', sim: '未实现：接收端不发回 CQI，发送端也不按各格的质量调整什么。', kind: 'absent' },
    { topic: '每个子载波的偏差', standard: 'Delta SNR，−8 dB 到 7 dB（§9.4.1.49）', sim: '未实现：没有波束成形反馈。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '同一个第一帧，五种带宽',
      jump: 1,
      more: [0, 1, 2, 3, 4],
      steps: [
        '依次载入五个变体，每次跳到第一条合成记录，打开「事件日志」，读出以 selectivity 开头的那一行；它记录的是笔记本的第一个数据帧（data frame），以调制与编码方式（modulation and coding scheme, MCS）3 发送。',
        '对照下表：mean 是合成之前的平均信干噪比（signal-to-interference-plus-noise ratio, SINR），worst bin 是最深一格比它低多少，effective 是有效信噪比，loss 是两者之差。',
      ],
      blocks: [
        { kind: 'table', heading: '笔记本的第一个数据帧（MCS 3，门限 16.99 dB）', head: ['带宽', '格数', '平均', '最深一格', '有效', '损失', '结果'], rows: [
          ['20 MHz', '9', '20.6 dB', '−18.8 dB', '14.8 dB', '5.8 dB', '没有解出'],
          ['40 MHz', '18', '20.6 dB', '−18.8 dB', '15.3 dB', '5.3 dB', '没有解出'],
          ['80 MHz', '36', '20.6 dB', '−18.8 dB', '16.8 dB', '3.8 dB', '没有解出'],
          ['160 MHz', '72', '20.6 dB', '−18.8 dB', '17.9 dB', '2.7 dB', '解出'],
          ['320 MHz', '144', '20.6 dB', '−19.9 dB', '18.4 dB', '2.3 dB', '解出'],
        ] },
      ],
      expect: '你应该看到：五档的平均都是 20.6 dB；前四档的最深一格都是 −18.8 dB，320 MHz 多出的格里有一格更深，是 −19.9 dB；损失却从 5.8 dB 降到 2.3 dB，前三档的有效信噪比低于 MCS 3 的门限 16.99 dB，没有解出，后两档解出。',
      meaning: '这说明：同一帧的同一格在各个带宽下偏差相同（②），带宽越宽，最深那一格在合成中的分量越小。深衰的那一部分频率不等于整帧解不出，这是本仿真器按容量合成的结果（②）；标准只规定按 26 音调资源单元报告平均值，不规定判决（①）。',
    },
    {
      heading: '五轮：最深一格与损失',
      more: [0, 1, 2, 3, 4],
      steps: [
        '五个变体各运行 150 ms，收集笔记本发出的每一帧的合成记录。',
        '对照下表读出最深一格与损失的中位数。',
      ],
      blocks: [
        { kind: 'table', heading: '每帧合成记录的中位数，各运行 150 ms', head: ['带宽', '格数', '最深一格', '损失'], rows: [
          ['20 MHz', '9', '−10.29 dB', '2.03 dB'],
          ['40 MHz', '18', '−13.75 dB', '2.27 dB'],
          ['80 MHz', '36', '−16.96 dB', '2.35 dB'],
          ['160 MHz', '72', '−19.91 dB', '2.35 dB'],
          ['320 MHz', '144', '−23.34 dB', '2.36 dB'],
        ] },
      ],
      expect: '你应该看到：带宽每加倍，最深一格加深约 3 dB，从 −10.29 dB 到 −23.34 dB；损失只从 2.03 dB 增加到 2.36 dB。',
      meaning: '这说明：格越多，抽到一个很深的格的机会越大，但它是曲线的最低点，不是这条链路（link）的损失。把最深一格当成损失，等于假定一格深衰整帧就解不出，与 ① 里编码比特分布到各子载波的设计不符。',
    },
    {
      heading: '余量相同的四档，越宽掉帧越少',
      more: [0, 1, 2, 3, 4],
      steps: [
        '仍用这五轮 150 ms 的运行，数一数笔记本发出的数据帧和其中没有解出的接收。',
        '对照下表，先看各档最常用的级别与余量，再比较掉帧率。',
      ],
      blocks: [
        { kind: 'table', heading: '五轮的掉帧率，各运行 150 ms', head: ['带宽', '最常用的级别', '余量（中位数）', '没有解出 / 数据帧', '掉帧率'], rows: [
          ['20 MHz', 'MCS 2', '6.62 dB', '12 / 214', '5.61 %'],
          ['40 MHz', 'MCS 3', '3.62 dB', '31 / 338', '9.17 %'],
          ['80 MHz', 'MCS 3', '3.62 dB', '37 / 476', '7.77 %'],
          ['160 MHz', 'MCS 3', '3.62 dB', '24 / 578', '4.15 %'],
          ['320 MHz', 'MCS 3', '3.62 dB', '6 / 651', '0.92 %'],
        ] },
      ],
      expect: '你应该看到：40 到 320 MHz 四档最常用 MCS 3，余量都是 3.62 dB，掉帧率从 9.17 % 依次降到 0.92 %；20 MHz 多数帧停在 MCS 2，余量 6.62 dB，掉帧率 5.61 %，不是最高的。',
      meaning: '这说明：只有余量相同时掉帧率才可比；余量大的一档用降一级速率代替掉帧。按比例而不按个数比较，是因为宽信道在同样的时间里发出的帧多得多。各格独立抽样使分集偏多（②），真实信道里的差距会小一些。',
    },
    {
      heading: '关掉分格',
      more: [0, 1, 2, 3, 4],
      steps: [
        '点“在编辑器中打开”，在「频率选择性（frequency selectivity）」一节取消「按 26 音调资源单元分格」，五个变体各运行 150 ms。',
        '与打开分格时比较笔记本用到的最低级别。',
      ],
      blocks: [
        { kind: 'table', heading: '笔记本用到的最低级别，各运行 150 ms', head: ['带宽', '按格合成', '整条信道一个值'], rows: [
          ['20 MHz', 'MCS 1', 'MCS 0'],
          ['40 MHz', 'MCS 1', 'MCS 0'],
          ['80 MHz', 'MCS 2', 'MCS 0'],
          ['160 MHz', 'MCS 2', 'MCS 0'],
          ['320 MHz', 'MCS 3', 'MCS 0'],
        ] },
      ],
      expect: '你应该看到：关掉分格后，五档都降到过 MCS 0；打开分格时，没有一档降到 MCS 0。',
      meaning: '这说明：整条信道一个值时，一次深衰使整帧同时变深，连续失败触发降级；按格合成时深衰只占一部分。两次运行的级别不同，所以不能直接比较掉帧数。分格是本仿真器的取法（②），标准不规定信道模型（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11be-2024：§36.3.2.1、图 36-4 与表 36-5（26 音调资源单元的位置，80 MHz 的第 19 号没有定义）、表 36-18（78.125 kHz 的子载波间隔）、§9.4.1.75（EHT CQI 报告：每个 26 音调资源单元的分贝算术平均，9 乘以 20 MHz 子信道数）、§36.3.13.8 与表 36-52（LDPC 音调映射）、§36.3.21.2（最小输入灵敏度）。',
    'IEEE Std 802.11-2024：§9.4.1.65（HE CQI 报告）、表 9-129（6 位平均信噪比的编码）、§9.4.1.49 与式 9-4（Delta SNR，−8 dB 到 7 dB）、§9.4.1.73 所引的每子载波信噪比计算、§27.3.2（HE 的子载波分配）。',
    '本仿真器的取法：每格一次独立的快衰落抽样（瑞利或莱斯，取自场景 fading 一节）、按容量合成有效信噪比、非此即彼的判决、只在解调这一步分格；没有 CQI 报告与 Delta SNR。',
    '场景把笔记本放在客厅远端，并把两端的发射功率按噪声地板的升高量提高，使五种带宽的平均信干噪比相同；这些都是本仿真器的场景取值。',
  ],
  limits: [],
  scenario: () => selectivityScenario(20),
  variants: WIDTHS.map((w) => ({ label: `${w} MHz`, scenario: () => selectivityScenario(w) })),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一条合成记录', (r) => r.type === 'WIFI_SEL'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '320 MHz 的信道有 144 格，本课那一轮最深一格的中位数比平均低 23.34 dB。这条链路的信噪比要因此减掉 23.34 dB 吗？',
      options: [
        '要：一格解不出来，整帧就解不出来',
        '不要：判决依据各格合成的有效信噪比，那一轮损失的中位数是 2.36 dB',
        '不要：最深一格会被均衡器完全补偿，损失是零',
      ],
      answer: 1,
      explain: '最深一格是曲线的最低点，不是链路的损失。本仿真器按容量合成（②）；标准的 LDPC 音调映射把编码比特分布到各子载波上（①）。',
    },
    {
      q: '标准的 CQI 报告怎样得到一个 26 音调资源单元的信噪比？',
      options: [
        '取这块里最差的子载波',
        '取这块里各子载波信噪比的分贝值的算术平均，量化为 6 位',
        '按容量合成为一个有效信噪比',
      ],
      answer: 1,
      explain: '这是 §9.4.1.75 与表 9-129 的规定。按容量合成是本仿真器解调判决的取法，与 CQI 报告是两回事。',
    },
    {
      q: '本课五轮里，20 MHz 的掉帧率 5.61 %，低于 40 MHz 的 9.17 %。这说明窄信道更不容易掉帧吗？',
      options: [
        '是：格少，深衰也少',
        '不能这样比：20 MHz 多数帧停在 MCS 2，余量 6.62 dB，比其余四档的 3.62 dB 大，它用降一级速率代替了掉帧',
        '是：20 MHz 发的帧少',
      ],
      answer: 1,
      explain: '只有余量相同的四档可以直接比较，它们的掉帧率随带宽增加从 9.17 % 降到 0.92 %。',
    },
  ],
}
