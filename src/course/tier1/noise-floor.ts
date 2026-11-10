/**
 * Wi-Fi Tier 1 · M1 · lesson 2: the floor the signal has to clear, and what a
 * neighbour does to it.
 *
 * Standard-first shape (2026-11-11). ① is what IEEE Std 802.11-2024 says about receiver
 * noise, which is less than a reader expects: no noise formula and no noise figure, only the
 * assumption written into the clause-17 sensitivity clause (10 dB noise figure, 5 dB
 * implementation margin, §17.3.10.2), the 3 dB-per-doubling of the HE and EHT sensitivity
 * tables, and the two measured quantities — ANPI (§11.10.9.4) and RSNI (§9.4.2.39). ② is
 * this simulator's kTB + 7 dB floor, the mW-by-mW sum and the worst-instant rule, each
 * marked against ①. ③ is `radio-primer`'s own scene — same builder, same four variants, so
 * the recorded timeline hashes are that lesson's — plus one editor change of channel width.
 *
 * Every figure is read back out of the lesson text in tests/course/noise-floor.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const noiseFloor: Lesson = {
  id: 'noise-floor',
  module: 0,
  title: '这段带宽上的噪声地板',
  why: '上一课算出了信号到达时有多强，但仅凭强度还无法判断能否正确接收：信号还必须高于接收端的噪声。IEEE Std 802.11-2024 没有给出接收机噪声的公式，也没有规定噪声系数；它只在正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层（physical layer, PHY）的灵敏度（sensitivity）条款里写明推导时假设噪声系数 10 dB、实现余量（implementation margin）5 dB，并在 HE 与 EHT 的灵敏度表里让带宽每加倍、所需电平提高 3 dB。标准里测量噪声的量是平均噪声功率指示（average noise power indicator, ANPI）：不收不发时，天线（antenna）接口处的平均噪声加干扰功率；信号比它高出多少，按功率相减后以 RSNI（received signal-to-noise indicator）报告。本仿真器把噪声地板（noise floor）取为室温热噪声加 7 dB 的噪声系数，只取决于接收带宽：20 MHz 上是 −93.99 dBm，信道带宽（channel width）每加宽一倍升高 3.01 dB，与距离无关。到达电平减去它就是信噪比（signal-to-noise ratio, SNR）；四个位置的噪声地板相同，帧的速率高低就是按这四个 SNR 排列的。信号并不随带宽增大，所以同一位置把信道从 20 MHz 加宽到 160 MHz，SNR 降低 9.03 dB。其他设备发送时，本仿真器把它们的功率按毫瓦加到噪声地板上，得到信干噪比（signal-to-interference-plus-noise ratio, SINR），并按整帧期间最差的那一时刻判定；本课的场景里没有第二个发送方，SINR 就等于 SNR。',
  outcomes: [
    '说出标准对接收机噪声规定了什么：灵敏度表的假设、ANPI 与 RSNI',
    '按本仿真器的模型算出某一信道带宽（channel width）下的噪声地板（noise floor）',
    '用到达电平减去噪声地板得到信噪比（SNR），并解释加宽信道为什么降低它',
  ],
  needs: ['radio-primer'],
  terms: [
    { term: 'noise floor', plain: '接收端始终存在的噪声电平；本仿真器里只与接收带宽有关，与距离无关' },
    { term: 'ANPI', plain: '平均噪声功率指示：标准里在不收不发时测得的平均噪声加干扰功率，以 dBm 表示' },
    { term: 'SINR', plain: '信号比噪声与其他发送方的干扰之和高出多少' },
  ],
  standard: [
    { heading: '标准没有噪声公式（§17.3.10.2，§18.4.8.2）', text: 'IEEE Std 802.11-2024 不规定接收机噪声有多大，也不规定噪声系数。OFDM 物理层的最小输入灵敏度条款只写明了推导那张表时的假设：噪声系数 10 dB，实现余量 5 dB；ERP 物理层的同名条款写明了同样的假设。' },
    { heading: '灵敏度随带宽提高（表 27-58，IEEE Std 802.11be-2024 表 36-67）', text: 'HE 与 EHT 的最小输入灵敏度表按 PPDU（PHY protocol data unit）带宽分列：带宽每加倍，同一调制与编码方式（modulation and coding scheme, MCS）的所需电平提高 3 dB。以 BPSK（binary phase-shift keying）1/2 为例，HE 在 20、40、80、160 MHz 分别是 −82、−79、−76、−73 dBm，EHT 在 320 MHz 是 −70 dBm。表格只给出这些电平，没有写出它们与噪声的关系。' },
    { heading: '噪声加干扰的测量：ANPI（§11.10.9.4）', text: '标准定义的噪声测量量是 ANPI：在测量时段内、天线接口处的平均噪声加干扰功率，以 dBm 表示，精度与 RCPI 相同。测量在整个关联信道带宽上进行，并扣除网络分配向量（network allocation vector, NAV）非零、本站发送和本站接收的时间。ANPI 在噪声直方图报告（Noise Histogram report）里上报。' },
    { heading: '信号比噪声高出多少：RSNI（§9.4.2.39）', text: 'RSNI = (10·log10((RCPI_功率 − ANPI_功率) / ANPI_功率) + 10) × 2。式中的 RCPI 与 ANPI 先换算成功率再相减，而不是按分贝相减；结果以 0.5 dB 为一级，覆盖 −10 dB 到 +117 dB，255 表示无法提供。' },
    { kind: 'steps', heading: '按标准得到一条链路（link）的信噪比：逐步说明', items: [
      '接收端对收到的这一帧测得 RCPI（§17.3.10.7）。',
      '在不收、不发、NAV 为零的时段测得 ANPI（§11.10.9.4）。',
      '把两者换算成功率，按 RSNI 的公式相减、取对数（§9.4.2.39）。',
      '结果以 0.5 dB 为一级，可以随无线测量报告上报。',
    ] },
  ],
  implementation: [
    { topic: '接收机噪声', standard: '标准不规定；灵敏度表假设噪声系数 10 dB（§17.3.10.2）', sim: '噪声地板 N(W) = −174 dBm/Hz + 10·log10(W) + 7 dB：前两项是室温热噪声，7 dB 是噪声系数（与 ns-3 默认值相同），全场所有电台共用这一个值。20 MHz 上 N = −93.99 dBm。', kind: 'value' },
    { topic: '噪声随带宽', standard: '灵敏度表带宽每加倍提高 3 dB（表 27-58，表 36-67）', sim: '噪声按所接收 PPDU 的带宽计算，带宽每加倍升高 3.01 dB，与灵敏度表的 3 dB 一致。', kind: 'faithful' },
    { topic: 'ANPI、RCPI 与 RSNI', standard: '测量并上报（§11.10.9.4，§9.4.2.39）', sim: '未实现：没有噪声直方图，也没有任何测量报告；引擎内部直接用精确的电平计算。', kind: 'absent' },
    { topic: '干扰的叠加', standard: '标准不规定接收机怎样处理干扰', sim: '其他发送方的功率按毫瓦加到噪声地板上，SINR = 信号 − (噪声 + 干扰)；较强的一项起主导作用。', kind: 'choice' },
    { topic: '一帧期间的干扰', standard: '标准不规定', sim: '记录接收期间任一时刻出现过的最强干扰，按这个最差值判定整帧，而不是取平均值；一次很短但很强的干扰就足以使整帧接收失败。', kind: 'choice' },
    { topic: '噪声来源', standard: 'ANPI 包含天线接口处的一切噪声与干扰（§11.10.9.4）', sim: '噪声地板只有热噪声这一项；除仿真中的 Wi-Fi 与超宽带（ultra-wideband, UWB）发送外，没有微波炉、蓝牙等其他干扰源。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一个噪声地板，四个位置',
      jump: 0,
      more: [0, 1, 2, 3],
      steps: [
        '依次载入四个变体，每次跳到笔记本的第一个数据帧（data frame）。四个变体的信道都是 20 MHz。',
        '对照下表读出到达电平、噪声地板与两者之差。',
      ],
      blocks: [
        { kind: 'table', heading: '同一噪声地板，四个位置', head: ['位置', '到达电平', '噪声地板', 'SNR', '第一个数据帧的速率'], rows: [
          ['书桌，1 m', '−31.7 dBm', '−93.99 dBm', '62.3 dB', '172.1 Mb/s'],
          ['书房，5 m', '−52.7 dBm', '−93.99 dBm', '41.3 dB', '129.0 Mb/s'],
          ['客厅，9 m + 砖墙', '−72.3 dBm', '−93.99 dBm', '21.7 dB', '34.4 Mb/s'],
          ['远端墙边，14 m + 砖墙', '−78.1 dBm', '−93.99 dBm', '15.9 dB', '17.2 Mb/s'],
        ] },
      ],
      expect: '四个位置的噪声地板都是 −93.99 dBm；SNR 依次是 62.3、41.3、21.7、15.9 dB，速率按同样的顺序下降。',
      meaning: '噪声地板只取决于带宽、与距离无关，这是本仿真器的噪声模型（②）；标准本身不规定噪声（①）。',
    },
    {
      heading: '信道加宽，噪声地板升高',
      variant: 2,
      steps: [
        '载入客厅变体，在编辑器里把路由器与笔记本的信道带宽依次改成 40、80、160 MHz。',
        '每次跳到第一个数据帧，读出噪声地板、SNR 与这一帧使用的 MCS。',
      ],
      blocks: [
        { kind: 'table', heading: '客厅那台笔记本，四种带宽', head: ['信道带宽', '噪声地板', 'SNR', '第一个数据帧'], rows: [
          ['20 MHz', '−93.99 dBm', '21.7 dB', 'MCS 3'],
          ['40 MHz', '−90.98 dBm', '18.7 dB', 'MCS 2'],
          ['80 MHz', '−87.97 dBm', '15.6 dB', 'MCS 1'],
          ['160 MHz', '−84.96 dBm', '12.6 dB', 'MCS 0'],
        ] },
      ],
      expect: '到达电平始终是 −72.3 dBm；带宽每加倍，噪声地板升高 3.01 dB，从 20 MHz 到 160 MHz 共升高 9.03 dB，SNR 从 21.7 dB 降到 12.6 dB，MCS 从 3 降到 0。',
      meaning: '每加倍 3.01 dB 与标准灵敏度表的 3 dB 一致（①、②）：更宽的信道提高峰值速率，代价是同一位置的 SNR 降低、覆盖范围缩小。',
    },
    {
      heading: '这间屋里没有干扰',
      jump: 0,
      more: [0, 1, 3],
      steps: [
        '载入本课场景（客厅），跳到第一个数据帧，再跳到紧随其后的确认帧（acknowledgement, ACK）。',
        '依次载入其余三个变体，各运行 100 ms，数一数接收失败与重传（retry）。',
      ],
      expect: '数据帧从 0 持续到 415.2 µs，16 µs 后路由器的确认帧开始，到 459.2 µs 结束；这段时间里空口上只有这一对设备。四个变体各运行 100 ms，接收失败 0 次，重传 0 次。',
      meaning: '没有第二个发送方，干扰项为零，SINR 就等于 SNR（②）；噪声地板是这条链路唯一需要超过的电平。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§17.3.10.2 与 §18.4.8.2（灵敏度表假设噪声系数 10 dB、实现余量 5 dB）、表 27-58（HE 最小输入灵敏度）、§11.10.9.4（ANPI 与噪声直方图报告）、§9.4.2.39（RSNI）；IEEE Std 802.11be-2024 表 36-67（EHT 最小输入灵敏度，含 320 MHz）。',
    '本仿真器的取值与取法：噪声系数 7 dB（与 ns-3 默认值相同），全场共用；干扰按毫瓦叠加；按整帧期间最差的那一时刻判定。',
  ],
  limits: [],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '标准用哪一个量报告“不收不发时天线接口处的噪声加干扰”？',
      options: [
        '接收信号强度指示（received signal strength indicator, RSSI）',
        'ANPI：在测量时段内、扣除收发与 NAV 时间后测得的平均噪声加干扰功率',
        '噪声系数：标准为每台设备规定一个值',
      ],
      answer: 1,
      explain: '§11.10.9.4 定义 ANPI，以 dBm 表示、精度与 RCPI 相同；标准不规定噪声系数，只在灵敏度条款里写明推导时假设 10 dB。',
    },
    {
      q: '客厅那台笔记本的信道从 20 MHz 换成 160 MHz，其他不变。到达电平和噪声地板会怎样？',
      options: [
        '两者都升高约 9 dB',
        '到达电平不变，噪声地板升高 9.03 dB 到 −84.96 dBm',
        '到达电平下降约 9 dB，噪声地板不变',
      ],
      answer: 1,
      explain: '发送端的功率没有变，到达电平也就不变；接收带宽是八倍，收进的噪声也是八倍，即 9.03 dB，SNR 从 21.7 dB 降到 12.6 dB。',
    },
  ],
}
