/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · Spatial streams.
 *
 * Standard-first shape (2026-11-11). ① is what IEEE Std 802.11be-2024 says about spatial
 * streams: one stream mandatory and 2–8 optional (§36.1.1), N_DBPS scaling with N_SS (§36.5,
 * Eq. 36-122), the EHT-LTF the receiver estimates the MIMO channel from and how many of them a
 * stream count needs (§36.3.12.10, Table 36-43), the receive EHT-MCS and NSS set a transmitter
 * must stay inside (§35.14.4.1, §10.6.5.8) and the Operating Mode field that lowers it. ② marks
 * the engine against each — at most four streams, a 48 µs preamble that does not grow with the
 * stream count, no MIMO channel, one SINR for every stream, and a stream count fixed for the run.
 * ③ is the lesson's five variants. It loads `width`'s own builder at 20 MHz, and its last variant
 * is `width`'s widest, so the two lessons are one experiment.
 *
 * The scenario builder and the five variants are unchanged, so the recorded timeline hashes in
 * tests/fixtures/lesson-hashes.json stay byte-identical. Every figure printed below is read back
 * out of the lesson text in tests/course/streams.test.ts and compared with the engine or a run.
 */
import type { StackSpec } from '../diagram'
import { type Lesson, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

/**
 * The mixed variant, as three nested limits: the router's four streams, the laptop's two, and
 * the two the link therefore runs (`negotiatedNss` in src/model/caps.ts takes the minimum).
 */
export function streamsNegotiationStack(): StackSpec {
  return {
    kind: 'stack',
    mode: 'nested',
    label: '路由器 4 · 笔记本 2',
    layers: [
      { label: '路由器支持 4 条流', bytes: 4 },
      { label: '笔记本支持 2 条流', bytes: 2, note: '发送的是它，两端取较小者' },
      { label: '链路使用 2 条流', bytes: 2, note: '每符号 4680 比特' },
    ],
    total: '一帧 88.8 µs，与 2 条流相同',
  }
}

export const streams: Lesson = {
  id: 'streams',
  module: 8,
  title: '空间流——同一批子载波上并行的几路信号',
  why: '上一课用更宽的频段缩短一帧；空间流（spatial stream）不需要更多频段：发送端的几根天线（antenna）在同一时刻、同一批子载波（sub-carrier）上发出几路不同的数据，接收端用几根天线收到的不同叠加把它们分开。IEEE Std 802.11be-2024 规定 Wi-Fi 7 必须支持 1 条空间流，2 到 8 条是可选的；每个符号（symbol）的数据比特数与空间流数成正比。为了让接收端估计多入多出（MIMO）信道，前导码（preamble）里的 EHT-LTF 符号随流数增加：1、2、3 到 4、5 到 6、7 到 8 条流分别需要 1、2、4、6、8 个。发送端不得使用接收方没有声明支持的「调制与编码方式（modulation and coding scheme, MCS）与流数」组合，所以一条链路（link）最多用两端中较小的流数。本仿真器的空间流只是一个乘数：每符号比特数乘以流数，所需的信噪比（signal-to-noise ratio, SNR）不变，前导码固定 48 µs，没有信道矩阵，流数在整段仿真里不变。20 MHz 上同一个 1530 字节的帧，1 条流 129.6 µs，2 条流 88.8 µs，4 条流 75.2 µs：数据部分从 81.6 µs 减半到 40.8 µs，再到 27.2 µs，不是 20.4 µs，因为帧只能按整数个符号发送；160 MHz 上一帧本来只剩一个符号，4 条流也还是 61.6 µs。',
  outcomes: [
    '说出标准对空间流规定了什么：可用的流数、每符号比特数、EHT-LTF 的个数与发送端必须遵守的组合',
    '分清本仿真器的空间流哪些照标准、哪些与标准不同或没有实现',
    '根据两端支持的流数说出链路用几条流，并读出同一帧在不同流数下的空口时间（airtime）',
  ],
  needs: ['width'],
  terms: [
    { term: 'spatial stream', plain: '在同一时刻、同一批子载波上发出的几路数据中的一路；接收端靠各路经过的不同路径把它们分开' },
    { term: 'antenna', plain: '天线：电台通过它发射和接收信号；要发送或分开几路空间流，至少需要几根' },
    { term: 'MIMO', plain: '多入多出（multiple-input multiple-output）：两端都用多根天线；接收端要估计的是每根发送天线到每根接收天线之间的信道' },
    { term: 'EHT-LTF', plain: 'EHT 长训练字段：前导码里供接收端估计 MIMO 信道的已知符号，个数随空间流数增加' },
  ],
  standard: [
    { heading: '可用的流数（IEEE Std 802.11be-2024 §36.1.1，§35.14.4.1）', text: 'EHT 站点（station, STA）必须支持单空间流的 MCS 0 到 7；2 到 8 条空间流是可选的。接收方在 EHT 能力元素的「Supported EHT-MCS And NSS Set」字段里按带宽声明自己能接收的「EHT-MCS 与流数」组合，流数从 1 到 8（§35.14.4.1，§9.4.2.323.4）。' },
    { heading: '每个符号承载多少比特（§36.5，式 36-122）', text: '流数大于 1 时，每符号编码比特数等于单流时的值乘以流数，每符号数据比特数 N_DBPS = 每符号编码比特数 × 码率；数据速率 = N_DBPS ÷ (12.8 µs + 保护间隔)。20 MHz 单流的 MCS 13 是 2340 比特、172.1 Mb/s（表 36-76），2 条流 4680 比特，4 条流 9360 比特。符号的时长与流数无关。' },
    { heading: '接收端怎样分开各路（§36.3.12.10，表 36-43）', text: 'EHT-LTF 字段让接收端估计各路空间流到各根接收天线之间的 MIMO 信道：每个 EHT-LTF 符号的数据子载波乘以一个矩阵的元素，使接收端能够分辨各路。所需 EHT-LTF 符号的初始个数由总流数决定：1 条流 1 个，2 条流 2 个，3 到 4 条流 4 个，5 到 6 条流 6 个，7 到 8 条流 8 个（表 36-43）。每个 2× EHT-LTF 符号长 6.4 µs，加 0.8 µs 保护间隔（表 36-18）。接收端怎样根据这个估计把各路分开，标准不规定。' },
    { heading: '发送端用几条流（§35.14.4.1，§10.6.5.8）', text: 'EHT 站点不得发送「EHT-MCS 与流数」组合或带宽不在接收方接收集合里的 EHT PPDU（PHY protocol data unit）（§35.14.4.1）。数据帧（data frame）可以用任何满足这些约束的组合发送；接收方用 Operating Mode 字段把自己能接收的流数调低之后，发送端也不得超过新的值（§10.6.5.8）。在这些约束之内选哪一个组合，标准不规定。' },
    { kind: 'steps', heading: '按标准确定一帧的流数与时长：逐步说明', items: [
      '读接收方声明的「EHT-MCS 与流数」接收集合；如果收到过 Operating Mode 字段，再按它调低流数（§35.14.4.1，§10.6.5.8）。',
      '在这个集合之内选一个 MCS 与流数的组合，同时不超过自己的发送能力。选法由实现决定。',
      '按流数算出每符号数据比特数（§36.5）与数据符号数（式 36-49）。',
      '前导码里放入表 36-43 规定个数的 EHT-LTF 符号，再发数据符号（式 36-110）。',
    ] },
  ],
  implementation: [
    { topic: '链路的流数', standard: '不得超过接收方声明的流数（§35.14.4.1）；在此之内的选法标准不规定', sim: '每台设备配置一个流数，一条链路用两端中较小的那个，整段仿真都用它。', kind: 'choice' },
    { topic: '最多几条流', standard: '1 到 8 条（§35.14.4.1）', sim: '只能配置 1 到 4 条。', kind: 'absent' },
    { topic: '每符号比特数', standard: '单流的值乘以流数（§36.5）', sim: '照此计算：20 MHz 的 N_DBPS × 数据子载波数之比 × 流数。', kind: 'faithful' },
    { topic: 'EHT-LTF 的个数', standard: '1、2、4 条流分别需要 1、2、4 个 EHT-LTF 符号（表 36-43）', sim: '前导码固定 48 µs，不随流数变化。按 2× EHT-LTF 每个 7.2 µs 计，2 条流的前导码应比 1 条流长 7.2 µs，4 条流长 21.6 µs。', kind: 'differs' },
    { topic: 'MIMO 信道', standard: '接收端用 EHT-LTF 估计 MIMO 信道（§36.3.12.10）', sim: '没有信道矩阵：一对设备之间只有一个电平，也没有天线间的相关性。视距空旷处与反射丰富的房间，流数的倍数完全相同。', kind: 'absent' },
    { topic: '每条流的信噪比', standard: '标准不规定接收机怎样分开各路，也不规定各路的质量', sim: '每一路都按整条链路的信噪比判决：所需信噪比与流数无关，发射功率（transmit power）不在各路之间分摊。这里的倍数因此是理想情形下的最大值。', kind: 'choice' },
    { topic: '降低流数', standard: '接收方可以用 Operating Mode 字段调低流数（§10.6.5.8）', sim: '没有 Operating Mode 字段；流数在整段仿真里不变。', kind: 'absent' },
    { topic: '速率选择的维度', standard: '在接收集合之内选「MCS 与流数」组合，选法不规定（§10.6.5.8）', sim: '本仿真器调整速率时只调 MCS，不调流数：链路变差时先降 MCS，即使已经降到最低一级也仍用全部流数。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一条、两条、四条流',
      jump: 0,
      more: [0, 1, 2],
      steps: [
        '依次载入「1 条流」「2 条流」「4 条流」，每次跳到第一个数据帧，把鼠标悬停在它上面，读出 MCS 与时长。',
        '再跳到第一个确认帧（acknowledgement, ACK），读出它的时长。',
      ],
      blocks: [
        { kind: 'table', heading: '1530 字节的帧，20 MHz', head: ['空间流', 'MCS', '每符号比特数', '数据符号', '空口时间'], rows: [
          ['1', '13', '2340', '6', '129.6 µs'],
          ['2', '13', '4680', '3', '88.8 µs'],
          ['4', '13', '9360', '2', '75.2 µs'],
        ] },
      ],
      expect: '你应该看到：三个变体都是 MCS 13；数据部分从 81.6 µs 减半到 40.8 µs，4 条流时是 27.2 µs，而不是 20.4 µs；前导码三档都是 48 µs，确认帧都是 28 µs。',
      meaning: '这说明：每符号比特数按 ① 随流数成倍增加，符号数向上取整，所以从 2 条到 4 条流只少了一个符号。所需的信噪比与流数无关，MCS 不降（②）；按表 36-43，4 条流的前导码本应多 21.6 µs，本仿真器没有计入（②）。',
    },
    {
      heading: '两端支持的流数不同',
      variant: 3,
      more: [1],
      jump: 0,
      steps: [
        '载入「路由器 4 · 笔记本 2」：路由器配置 4 条流，发送数据的笔记本配置 2 条流。',
        '跳到第一个数据帧，读出时长；再载入「2 条流」，逐帧对照两次运行的时间轴。',
      ],
      blocks: [
        { kind: 'diagram', heading: '链路的流数由较小的一端决定', spec: streamsNegotiationStack(), caption: '笔记本只支持 2 条流，所以链路用 2 条流。' },
      ],
      expect: '你应该看到：这一帧是 88.8 µs，与「2 条流」相同；200 ms 内两次运行的每一个帧开始时刻、发送方、帧类型与时长都相同，共 1660 个帧。',
      meaning: '这说明：发送端不能超过接收方声明的流数（①），本仿真器总是取两端中较小的那个（②）。路由器多出的两条流在这里无人可用；把它们分给另一台设备是多用户 MIMO（multi-user MIMO, MU-MIMO），见后面的一课。',
    },
    {
      heading: '最宽的信道加最多的流',
      variant: 4,
      jump: 0,
      steps: [
        '载入「160 MHz · 4 条流」，跳到第一个数据帧，读出 MCS 与时长。',
        '与上一课 160 MHz 单流的结果对照。',
      ],
      blocks: [
        { kind: 'table', heading: '160 MHz，1530 字节的帧', head: ['空间流', '每符号比特数', '数据符号', '空口时间'], rows: [
          ['1（上一课）', '19600', '1', '61.6 µs'],
          ['4', '78400', '1', '61.6 µs'],
        ] },
      ],
      expect: '你应该看到：仍是 MCS 13，一帧 61.6 µs，只有 1 个数据符号，与上一课 160 MHz 单流完全相同。',
      meaning: '这说明：一帧压缩到一个符号以后，再增加每符号比特数也无法缩短它（①）；多出的容量没有数据可装。',
    },
  ],
  sources: [
    'IEEE Std 802.11be-2024：§36.1.1（单空间流必须支持，2 到 8 条可选）、§35.14.4.1 与 §9.4.2.323.4（「EHT-MCS 与流数」接收集合）、§36.5 与式 36-122、表 36-76（流数与每符号比特数）、§36.3.12.10 与表 36-43（EHT-LTF 与所需个数）、表 36-18（2× EHT-LTF 6.4 µs、保护间隔 0.8 µs）、式 36-49 与式 36-110（数据符号数与 TXTIME）。',
    'IEEE Std 802.11-2024：§10.6.5.8（数据帧的速率约束，含 Operating Mode 字段调低的流数）。',
    '本仿真器的取值与取法：每台设备 1 到 4 条流、链路取两端较小值且整段仿真不变、48 µs 的前导码常数、每条流按整条链路的信噪比判决、没有信道矩阵、速率控制只调 MCS。',
  ],
  limits: [],
  scenario: () => widthScenario(20, 1),
  variants: [
    { label: '1 条流', scenario: () => widthScenario(20, 1) },
    { label: '2 条流', scenario: () => widthScenario(20, 2) },
    { label: '4 条流', scenario: () => widthScenario(20, 4) },
    { label: '路由器 4 · 笔记本 2', scenario: () => widthScenario(20, 2, 4) },
    { label: '160 MHz · 4 条流', scenario: () => widthScenario(160, 4) },
  ],
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一台支持 4 条流的路由器与一台只支持 2 条流的笔记本通信。按标准，发往笔记本的帧最多用几条流？',
      options: [
        '4 条：由路由器决定',
        '2 条：发送端不得使用接收方没有声明支持的「MCS 与流数」组合',
        '3 条：取两端的平均',
      ],
      answer: 1,
      explain: '§35.14.4.1 要求组合必须在接收方的接收集合里。本仿真器总是取两端中较小的流数，这一帧是 88.8 µs，与 2 条流相同。',
    },
    {
      q: '从 1 条流增加到 4 条流，按标准前导码会怎样？',
      options: [
        '不变：前导码与流数无关',
        '变长：EHT-LTF 符号从 1 个增加到 4 个',
        '变短：每个符号承载的比特更多',
      ],
      answer: 1,
      explain: '表 36-43 规定 3 到 4 条流需要 4 个 EHT-LTF；每个 2× EHT-LTF 7.2 µs，多 3 个就是 21.6 µs。本仿真器的前导码固定 48 µs，没有计入这一项。',
    },
    {
      q: '为什么在本仿真器里增加一条流不需要更强的信号，而加宽信道需要？',
      options: [
        '空间流的发射功率（transmit power）更高',
        '信道宽度不变，噪声地板（noise floor）不变；而本仿真器每一路都按整条链路的信噪比判决，不在各路之间分摊功率',
        '标准规定多流时所需的信噪比更低',
      ],
      answer: 1,
      explain: '这是本仿真器的取法（②）：所需信噪比与流数无关。真实设备要把发射功率分给几路，接收端还要从信道估计中分开它们，所以四倍是理想情形下的最大值。',
    },
  ],
}
