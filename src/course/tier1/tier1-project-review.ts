/**
 * Tier 1 · project · "Reading the results, and the write-up".
 *
 * The second half of the Tier 1 project. The first half is every number the learner predicts with
 * a pencil; this one is every number the run gives back, the mechanisms that explain most of the
 * gap between them, and the rubric a good write-up is marked against. It loads `tier1-project`'s
 * own scene and its three variants — the same builder, the same array — so the two ids replay to
 * the same recorded timeline hashes.
 *
 * Standard-first shape (2026-11-11), after the lesson audit against IEEE Std 802.11-2024 and
 * IEEE Std 802.11be-2024. ① covers the standard mechanisms the gap is made of: the two CCA
 * requirements (§17.3.10.6.1; for an EHT STA §36.3.21.6.3 of 802.11be), EIFS (§10.3.2.3.7,
 * Eq. 10-7), the ACK timeout (§10.3.2.11), the Retry subfield (§10.3.4.4), and two silences —
 * clause 17's receiver specifications say nothing about a second preamble arriving during a
 * reception, and §10.6.1 leaves the rate-switching algorithm out. ② marks capture (5 dB / 4 dB),
 * the energy-only treatment of a frame whose start this radio missed, and the rate rule as the
 * engine's own, and the 45 µs ACK timeout as differing from HE's 24 µs aRxPHYStartDelay. ③ keeps
 * the review's task: four runs on one answer sheet, the late start, capture, the three waits, and
 * the marking rubric.
 *
 * Every figure is read back out of this file and compared with a 10 s run in
 * tests/course/tier1-project-review.test.ts.
 */
import { type Lesson } from '../lessonKit'
import { projectFlat, projectJumps, projectVariants } from './tier1-project'

export const tier1ProjectReview: Lesson = {
  id: 'tier1-project-review',
  module: 6,
  title: '项目——读懂结果',
  why: '现在可以打开仿真了。你的四个预测有的会对，有的不会；而错的那些，比对的更有价值。编码等级与预测完全一致，空口在两台之间的分配也相差无几；碰撞和合计吞吐却相差较大。碰撞那一项最容易被误判为吻合：屏幕上的重传（retry）比例和预测相差不远，可两台笔记本实际重叠的次数是预测的两倍多。原因有两个，方向相反。标准只要求接收机检测出 PPDU（PHY protocol data unit）的开头；一台笔记本发送期间到达的前导码（preamble）它检测不到，剩余的能量又达不到单凭能量判忙的门限，于是它会在对方的帧仍在传送时开始发送。另一方面，标准不规定接收机怎样处理重叠的帧，本仿真器让较强的一帧在重叠中仍可被正确接收——这就是捕获效应（capture effect）；两台到达路由器的强度相差悬殊，重叠时较强的那一帧有近一半仍被收下，这些重叠因此没有计入重传。两个误差相乘，结果恰好回到模型附近，但模型的两部分没有一部分是对的——所以比较之前，先要说清屏幕上统计的到底是什么。吞吐偏低的大部分归因于本仿真器的速率控制：接连失败的发送方降低一档，每一帧都比计算值长一些。这些都计入之后仍有一部分无法解释，应把它作为残差如实报告，而不是调整一个常数将它消除。',
  outcomes: [
    '说出这次运行用到了标准的哪些规定，以及标准没有规定、由本仿真器取定的部分',
    '把四次运行结果与四个预测逐项对照，区分你想要的那个量与屏幕实际统计的那个量',
    '指出一个机制，用模型自己的单位给它定量，并如实报告剩余的部分',
    '把项目写成别人能逐行核对的形式',
  ],
  needs: ['tier1-project', 'cca', 'hidden', 'anomaly'],
  terms: [
    { term: 'estimator', plain: '你在屏幕上实际统计的那个量，用来代替你真正想要的那个量' },
  ],
  standard: [
    { heading: '判忙的两条门限（§17.3.10.6.1；802.11be §36.3.21.6.3）', text: '20 MHz 的正交频分复用（orthogonal frequency-division multiplexing, OFDM）信道上，接收电平不低于 −82 dBm 的一次 OFDM 传输的开始，应使空闲信道评估（clear channel assessment, CCA）在 4 µs 内以大于 90% 的概率判忙；任何能量比这高 20 dB、即不低于 −62 dBm 的信号，也应在 4 µs 内判忙。对 EHT 站点（station, STA），802.11be §36.3.21.6.3 同样要求：占用主 20 MHz 信道、在主 20 MHz 内测得不低于 −82 dBm 的 PPDU 的开始应被检出，并在这个 PPDU 持续期间保持判忙；主 20 MHz 内任何不低于 −62 dBm 的信号也应判忙（多链路设备（multi-link device, MLD）处于 MediumSyncDelay 期间另用 dot11MSDOFDMEDthreshold）。对前导码的检测要求针对的是 PPDU 的开始。' },
    { heading: '收到出错的帧之后（§10.3.2.3.7，式 10-7）', text: '收到的 PPDU 有错，或帧校验序列（frame check sequence, FCS）不正确，介质（medium）转为空闲之后，分布式协调功能（distributed coordination function, DCF）在发送前要等扩展帧间间隔（extended interframe space, EIFS），而不是分布式帧间间隔（DCF interframe space, DIFS）。EIFS = aSIFSTime + AckTxTime + DIFS，其中 AckTxTime 是以物理层（physical layer, PHY）最低强制速率（mandatory rate）发送一个确认帧（acknowledgement, ACK）所需的时间。这段时间是为了给另一台站点留出确认那个帧的时间；EIFS 期间收到一个无错的帧，EIFS 即结束。20 MHz 的 OFDM PHY 上 EIFS = 16 + 44 + 34 = 94 µs。' },
    { heading: 'ACK 超时（§10.3.2.11）', text: '发送方从发送结束起等待 ACK 超时（ACK timeout）= aSIFSTime + aSlotTime + aRxPHYStartDelay；这段时间里没有开始接收到帧，就判定失败并启动退避（backoff）。aRxPHYStartDelay 按 PHY 规定：第 17 章为 20 µs（表 17-24），HE 为 24 µs（表 27-61）。' },
    { heading: '重传的标记（§10.3.4.4）', text: '每次发送失败，这一帧的重试计数加 1；一个数据帧（data frame）在确认过程中失败过一次或多次，之后的每次重传都把帧头（MAC header）的 Retry 子字段置 1。所以重传计数的是“丢失、需要再发一次的帧”，不是“在空中相撞的帧”。' },
    { heading: '标准没有规定的两件事（§17.3.10，§10.6.1）', text: '第 17 章的接收机指标（§17.3.10）只有最低灵敏度（sensitivity）、邻道与非邻道抑制、最大输入电平、CCA 与 RCPI，没有规定接收一个帧时又到达第二个前导码，接收机应当怎样处理。§10.6.1 写明，速率切换的算法不在标准范围之内。' },
    { kind: 'steps', heading: '同一帧之后，各台站点按标准各等多久', items: [
      '发送方：ACK 超时内没有开始接收到确认帧，判定失败，启动退避（§10.3.2.11）。',
      '收到这个帧却解不出来的站点：介质空闲之后等 EIFS，为一个它收不到的确认帧留出时间（§10.3.2.3.7）。',
      '什么也没有检出的站点：介质一直被它判为空闲，按 DIFS 与退避计数照常进行（§10.3.3）。',
      'EIFS 期间收到一个无错的帧：EIFS 结束，按实际的忙闲状态继续（§10.3.2.3.7）。',
    ] },
  ],
  implementation: [
    { topic: 'CCA 门限', standard: '开始检出 −82 dBm、能量 −62 dBm（§17.3.10.6.1，802.11be §36.3.21.6.3）', sim: '照此取值，但都是硬门限：达到就判忙，差一点就判闲，不是概率曲线。能量按整条工作信道比较；本课信道只有 20 MHz，与标准按主 20 MHz 比较的结果相同。', kind: 'faithful' },
    { topic: '没有听到开头的帧', standard: '对前导码的检测要求针对 PPDU 的开始（§36.3.21.6.3）', sim: '一个帧若在本机发送期间开始，本机发送结束之后只把它算作能量，不再按 −82 dBm 判忙。两台笔记本互相接收到的电平是 −72.64 dBm，达不到 −62 dBm，于是在对方的帧仍在传送时，本机也判信道空闲。', kind: 'choice' },
    { topic: 'EIFS', standard: 'aSIFSTime + AckTxTime + DIFS，AckTxTime 按最低强制速率计（式 10-7）', sim: '照此取 94 µs：锁定了前导码却解不出帧之后，等 EIFS 而不是 DIFS。', kind: 'faithful' },
    { topic: 'ACK 超时', standard: 'aSIFSTime + aSlotTime + aRxPHYStartDelay；HE 的 aRxPHYStartDelay 为 24 µs（表 27-61）', sim: '对所有世代都取第 17 章的 20 µs，ACK 超时为 45 µs；按 HE 的取值应为 49 µs。', kind: 'differs' },
    { topic: '捕获', standard: '标准不规定接收机怎样处理重叠的帧', sim: '后到的前导码比正在接收的帧强 5 dB 以上、且正在接收的帧仍处于前导码阶段，接收机改为同步到后到的那个；一个前导码要比空中其余信号之和高 4 dB 才被检测到。两者都是硬门限，所以“约 46% 的重叠帧仍被收下”是这两个数的函数，换成 3 dB 或 8 dB，这个比例就变了。', kind: 'value' },
    { topic: '速率选择', standard: '不在标准范围之内（§10.6.1）', sim: '同一个对端连续两次失败降一档，连续十次成功升一档。这户人家的每一帧因此都比按第一帧等级算出的长一些。', kind: 'choice' },
    { topic: '碰撞与重传的计数', standard: '标准只有重试计数与 Retry 子字段，没有“碰撞”这一记录', sim: '两路发送在接收端重叠时，引擎记一条碰撞记录；发送方每次失败记一条重传记录。屏幕上的这两个计数统计的是两件不同的事。', kind: 'choice' },
    { topic: '电平是定数', standard: '标准不涉及信道', sim: '本课场景没有打开衰落，各条链路（link）的电平全是定数，所以 −72.64 dBm 始终落在两条门限之间，每一次迟发碰撞都可以逐次归因。真实链路会在两条门限之间来回穿越。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '四次运行，一张答题纸',
      more: [0, 1, 2],
      steps: [
        '载入本课场景运行十秒，再把三个变体各运行十秒。',
        '把每个结果写在纸上对应的预测旁边，先不要修改任何东西，再对照下面两张表。',
      ],
      blocks: [
        { kind: 'table', heading: '预测对实测：这户人家的十秒钟', head: ['量', '预测', '实测'], rows: [
          ['等级', 'MCS 13 / MCS 2', 'MCS 13 / MCS 2'],
          ['数据帧', '129.6 / 524.0 µs', '全程均值 148.1 / 600.9 µs'],
          ['碰撞概率', '10.46 %', '23.15 % 的尝试重叠；12.59 % 以重传收场'],
          ['合计交付', '25.585 Mb/s', '22.610 Mb/s'],
          ['各自帧数', '相同', '9,719 / 9,123'],
          ['空口占比', '19.8 % / 80.2 %', '21.2 % / 78.8 %'],
          ['书房笔记本独占', '43.621 Mb/s', '42.470 Mb/s'],
        ] },
        { kind: 'table', heading: '三个变体的运行结果', head: ['变体', '预测', '实测', '成因'], rows: [
          ['书房笔记本搬到客厅', '19.350 Mb/s · 10.46 %', '16.796 = 8.737 + 8.059 Mb/s · 11.10 %', '两个帧都长且相近：迟发碰撞几乎消失'],
          ['多一台平板', '29.574 Mb/s · 17.81 %', '21.184 = 7.734 + 5.852 + 7.597 Mb/s · 17.13 %', '少了 28 %：客厅笔记本降到调制与编码方式（MCS）0'],
          ['客厅笔记本离线', '43.621 Mb/s', '42.470 Mb/s · 0.28 %', '没有碰撞对象'],
        ] },
      ],
      expect: '等级与预测完全一致；合计交付 22.610 Mb/s，比预测的 25.585 少 11.6%；12.59% 的尝试以重传收场，看上去接近预测的 10.46%，而实际有 23.15% 的尝试发生了重叠。',
      meaning: '等级出自表 36-76 与本仿真器的选级规则（①②），场景里的电平是定数，所以完全一致。碰撞与吞吐的差距来自下面三个机制：两个是标准没有规定、由本仿真器取定的（捕获与速率选择，②），一个是标准的 CCA 要求本身留下的（①）。',
    },
    {
      heading: '第一次碰撞之后：没有听到开头的帧',
      jump: 1,
      steps: [
        '跳到第一次碰撞，然后在第一毫秒里往回步进。',
        '看两台笔记本何时开始发送、短帧何时结束，以及发短帧的那台何时再次发送。',
      ],
      expect: '两台笔记本同时开始发送；书房笔记本 129.6 µs 的色块结束，然后在 406.6 µs 又发送了一次——此时客厅笔记本那个 524.0 µs 的帧仍在传送。两台互相接收到的电平是 −72.64 dBm；十秒内 2,399 次笔记本之间的碰撞中有 1,342 次是这样迟发的。',
      meaning: '标准对前导码的检测要求针对 PPDU 的开始（①）；本仿真器让本机发送期间开始的帧只算能量（②“没有听到开头的帧”），而 −72.64 dBm 达不到 −62 dBm 的能量门限，信道被判为空闲。两个帧都没有给对方留下可读的网络分配向量（network allocation vector, NAV）。',
    },
    {
      heading: '捕获：重叠多，重传少',
      steps: [
        '在十秒日志里分别数出两台笔记本的重叠次数与重传次数。',
        '对照下表，把差距逐项归到机制上。',
      ],
      blocks: [
        { kind: 'table', heading: '差距出在哪里', head: ['机制', '日志里看到的', '有多大'], rows: [
          ['捕获效应：重叠中较强的那一帧仍被正确接收', '4,990 次重叠 → 2,713 次重传', '约 46 % 的重叠帧仍被收下；两台相差 34 dB'],
          ['没有听到开头的帧，在对方帧传送期间开始发送', '2,399 次笔记本之间的碰撞中有 1,342 次', '10.46 % → 23.15 %'],
          ['帧在速率控制下变长', '148.1 vs 129.6 µs · 600.9 vs 524.0 µs', '吞吐减少的 11.6 % 中的大部分'],
          ['残差', '日志里没有对应的记录', '如实报告，不通过拟合消除'],
        ] },
      ],
      expect: '4,990 次重叠只带来 2,713 次重传，约 46% 的重叠帧仍被收下；两台到达路由器的电平相差 34.4 dB，书房那一路远超 4 dB 的检测门限，客厅那一路只增加了干扰。',
      meaning: '标准不规定接收机怎样处理重叠的帧（①），被收下的比例取决于本仿真器的 5 dB 与 4 dB 两条门限（②“捕获”）。重传统计的是丢失的帧（①“重传的标记”），重叠统计的是相撞的帧——先把你正在数的那样东西点名，这就是估计量，然后再比较。',
    },
    {
      heading: '同一帧之后，各自要等多久',
      steps: [
        '在书房笔记本发完一帧之后，悬停客厅笔记本的等待色块，读出它的长度。',
        '再找一次碰撞，读出碰撞双方与旁观者的等待，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '同一帧之后，各自要等多久', head: ['这台站点', '它收到了什么', '它要等的'], rows: [
          ['碰撞的一方', '应答没有到达', '45 µs'],
          ['客厅笔记本', '21.35 dB，而这一帧要求 44.99 dB', 'EIFS，94 µs——共 9,499 次'],
          ['什么都没检出的', '完全没有前导码', 'DIFS, 34 µs'],
        ] },
      ],
      expect: '客厅笔记本的等待色块上写的是 94 µs，而不是 34：它锁定了一个无法解出的前导码，只能为一个它收不到的应答留出时间；十秒内这样的等待有 9,499 次。碰撞的一方等的是 45 µs 的 ACK 超时。',
      meaning: 'EIFS 照标准（①，式 10-7）；ACK 超时取 45 µs，与按 HE 取值算出的 49 µs 不同（②“ACK 超时”）。同一个瞬间，三台设备按标准的三条规则各等各的时间。',
    },
    {
      heading: '还差的那一点，以及写报告',
      steps: [
        '把两台笔记本的空口时间（airtime）除以各自的发送次数，得到全程的平均帧长。',
        '按下面的步骤批改你的答题纸，再把项目写成一份报告：四个预测、四个读数、已指出名称并定量的机制，以及如实写出的残差。',
      ],
      blocks: [
        { kind: 'steps', heading: '如何批改一张答题纸', items: [
          '先批（a）。两个到达电平都应落在 −40.73 与 −75.15 dBm 的一个分贝之内，而每个等级都要用“要求加余量”说清。等级就写在每台笔记本的第一个数据帧（data frame）上。',
          '（b）用同样这两个帧来批改：屏幕上是 129.6 与 524.0 µs。这里答错的人，通常是漏掉了帧头（MAC header）与校验字节，或者把符号（symbol）数向下取整而不是向上。',
          '（c）先问用的是哪个估计量。把实测的重传率和预测的碰撞概率当成“吻合”的答案，比较的根本不是同一件事。',
          '（d）看时长，不看轮次：两台笔记本发出的帧数差不多，占用的空口却是 21.2% 与 78.8%。把空口平均分配的答案是错的。',
          '差距放到最后批改。机制都要指出名称、用模型自己的单位定量，且要能指出对应的记录：捕获看重叠数与重传数的对比，迟发看碰撞发生的时刻。',
          '最后找残差。一张写明“还有一部分没能解释”的答题纸，比一张靠调整常数使两列重合的答题纸分数更高。',
        ] },
        { kind: 'table', heading: '好答案是什么样的', head: ['部分', '好答案'], rows: [
          ['(a)', '两个电平误差都在一分贝内，墙只数一次，等级用“要求加余量”说清'],
          ['(b)', '符号数向上取整，算进头部与校验字节，应答的速率是推导出来的，而不是想当然的'],
          ['(c)', '给出碰撞概率时不带速率，并说清用的是哪个估计量'],
          ['(d)', '帧数相同而空口时间（airtime）不同，占比由帧时长算出'],
          ['差距', '指出机制，各自用模型自己的单位定量，并报出残差'],
        ] },
      ],
      expect: '书房笔记本的帧全程均值 148.1 µs、客厅笔记本 600.9 µs，都比按第一帧等级算出的 129.6 与 524.0 µs 长；吞吐比预测少 11.6%，其中大部分来自帧变长。',
      meaning: '帧变长来自本仿真器的速率控制（②“速率选择”），标准不规定这一算法（①）。三个机制都计入之后剩下的部分，是答案的一部分，不是答案的缺陷。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§17.3.10.6.1（CCA：−82 dBm 的开始检出与 −62 dBm 的能量判忙）、§10.3.2.3.7 与式 10-7（EIFS）、§10.3.2.11（ACK 超时）、表 17-24 与表 27-61（aRxPHYStartDelay）、§10.3.4.4（重试计数与 Retry 子字段）、§17.3.10（接收机指标）、§10.6.1（速率切换算法不在标准范围之内）。IEEE Std 802.11be-2024：§36.3.21.6.3（EHT 站点主 20 MHz 信道上的 CCA）。',
    '本仿真器的取值与取法：捕获门限 5 dB 与前导码检测门限 4 dB（channel.ts 的 CAPTURE_MARGIN_DB 与 PREAMBLE_DETECT_SINR_DB）、两次失败降一档与十次成功升一档的速率控制、碰撞记录的判定方式、所有世代共用的 45 µs ACK 超时。',
    '上面每一个计数、比值和时刻都可由场景自己的种子复现：对项目那户人家及其三个变体各运行十秒。',
  ],
  limits: [],
  scenario: () => projectFlat(),
  variants: projectVariants,
  jumps: projectJumps,
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '你预测的碰撞概率是 10.46 %，实跑中 12.59 % 的尝试发生了重传。为什么此时判定两者一致是错误的？',
      options: [
        '12.59 % 超出了模型应有的容差',
        '这个估计量测的是别的东西：实际有 23.15 % 的尝试重叠，而其中约 46 % 因捕获仍被正确接收',
        '十秒的样本太短',
      ],
      answer: 1,
      explain: '重传统计的是丢失的帧，而不是重叠；两台笔记本之间相差 34 dB，这两者就是两件不同的事。十秒已经是数千次尝试，而模型本身也没有什么容差带。',
    },
    {
      q: '客厅笔记本的帧仍在传送时，书房笔记本又发送了一次。是什么让它这样做的？',
      options: [
        '网络分配向量（network allocation vector, NAV）已经到期，所以信道在形式上是空闲的',
        '那个帧在本机发送期间开始，本机检测不到它的前导码，只能依据能量判断——而 −72.64 dBm 达不到 −62 dBm 的能量门限',
        '站点在 ACK 超时加一个 DIFS 之后总是可以开始发送',
      ],
      answer: 1,
      explain: '标准对 −82 dBm 的检测要求针对 PPDU 的开始；其余只算能量，而能量要达到 −62 dBm 才能让空闲信道评估判忙。两个帧都没有给对方留下可读的 NAV。',
    },
    {
      q: '“约 46% 的重叠帧仍被收下”这个比例由什么决定？',
      options: [
        '由标准规定的接收机行为决定',
        '由本仿真器取定的 5 dB 捕获门限与 4 dB 前导码检测门限决定；标准不规定接收机怎样处理重叠的帧',
        '由 EIFS 的长度决定',
      ],
      answer: 1,
      explain: '§17.3.10 的接收机指标里没有关于第二个前导码的规定。换一组门限，这个比例就变了。',
    },
  ],
}
