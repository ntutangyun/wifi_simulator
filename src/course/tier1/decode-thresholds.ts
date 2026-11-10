/**
 * Wi-Fi Tier 1 · M1 · lesson 3: when does a frame decode?
 *
 * Standard-first shape (2026-11-11). ① is what IEEE Std 802.11-2024 actually specifies
 * about reception: a minimum input sensitivity per rate as a conformance requirement (PER at
 * most 10% at that level — §17.3.10.2, §27.3.22.2, and §36.3.21.2 of IEEE Std
 * 802.11be-2024), the PHY-RXEND.indication and its RXERROR, the FCS check, the immediate
 * acknowledgement after SIFS and EIFS after an error (§8.3.5.15, §9.2.4.9, §10.3.2.11,
 * §10.3.2.3.7), and the §3.1 definition of link margin. It does NOT specify how a receiver
 * decides. ② is where this simulator's decision lives: sensitivity turned into a required
 * SINR, one hard threshold on the frame's worst SINR, the 4 dB preamble rule, the −82 / −62 dBm
 * thresholds measured within the primary 20 MHz channel (2026-11-11, W6: §27.3.22.6.3), and the
 * 3 dB the sender keeps — each marked against ①. ③ is `radio-primer`'s own scene, plus the far
 * wall at 40, 80 and 160 MHz, where the preamble stops being detected from 80 MHz on.
 *
 * Every figure is read back out of the lesson text in tests/course/decode-thresholds.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const decodeThresholds: Lesson = {
  id: 'decode-thresholds',
  module: 0,
  title: '一帧在什么条件下能解码成功',
  why: '信号能够到达，不等于这一帧能解码成功。IEEE Std 802.11-2024 对接收机只规定性能，不规定判决方法：对每一种调制与编码方式（modulation and coding scheme, MCS），标准给出一个最小输入灵敏度（sensitivity），要求输入电平在这个值时误包率不超过 10%；正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层（physical layer, PHY）的那张表假设噪声系数 10 dB、实现余量 5 dB。一帧收完后，物理层报告接收是否出错，媒体访问控制（medium access control, MAC）层用帧尾的帧校验序列（frame check sequence, FCS）检查这一帧；正确、并且需要立即确认，就在短帧间间隔（short interframe space, SIFS）之后回复一个确认帧（acknowledgement, ACK）。本仿真器的判决是一道硬门限：把灵敏度减去表格所假设的噪声，得到每一级所需的信干噪比（signal-to-interference-plus-noise ratio, SINR），与带宽无关；整帧期间最差时刻的 SINR 达到要求就整帧成功，差 0.1 dB 就整帧作废，发送端等不到任何应答。发送端选级时在要求之上多留 3 dB 的速率余量，接收端解码时并不计入它。接收要先从检出前导码（preamble）开始，标准把前导检测（preamble detection）的 −82 dBm 规定为主 20 MHz 信道内测得的功率：远端墙边那台笔记本把信道加宽到 80 MHz，同样的到达电平只有四分之一落在主 20 MHz 信道内，低于 −82 dBm，路由器根本不开始接收，一帧也收不到。',
  outcomes: [
    '说出标准的最小输入灵敏度要求了什么，没有规定什么',
    '按本仿真器的方法，从灵敏度（sensitivity）算出某一级所需的信干噪比（SINR）',
    '说明发送端多留的那 3 dB 属于哪一方、在什么时候使用',
  ],
  needs: ['radio-primer', 'noise-floor'],
  terms: [
    { term: 'MCS', plain: '调制与编码方式：发送端选择的速率等级；下一课列出全部等级' },
    { term: 'sensitivity', plain: '最小输入灵敏度：标准为每一级规定的输入电平，在这个电平上误包率不得超过 10%' },
    { term: 'rate margin', plain: '速率余量：本仿真器的发送端在所选那一级的要求之上多留的 3 dB' },
  ],
  standard: [
    { heading: 'OFDM 物理层的最小输入灵敏度（§17.3.10.2，表 17-21）', text: 'PSDU（PHY service data unit）长 1000 个八位组、输入电平为表 17-21 中与速率对应的值时，误包率（packet error ratio, PER）应不超过 10%。电平在天线（antenna）接口处测量，推导时假设噪声系数 10 dB、实现余量 5 dB。20 MHz 信道上，BPSK（binary phase-shift keying）1/2 是 −82 dBm，64-QAM（quadrature amplitude modulation）3/4 是 −65 dBm。' },
    { heading: 'HE 与 EHT（§27.3.22.2，表 27-58；IEEE Std 802.11be-2024 §36.3.21.2，表 36-67）', text: '输入电平为表中与 MCS 对应的值时，误包率应小于 10%；PSDU 长 4096 个八位组（用 DCM 的 BPSK 为 2048 个）。要求适用于 0.8 µs 保护间隔的 PPDU（PHY protocol data unit），20 MHz 上 MCS 10 以下用 BCC 编码，其余用 LDPC 编码。20 MHz 上 HE 的 MCS 0 到 11 从 −82 dBm 到 −52 dBm；EHT 增加的两级 4096-QAM 是 −49 与 −46 dBm。' },
    { heading: '这是性能要求，不是判决规则', text: '这些表格规定的是一台合格接收机在给定输入电平上至少要达到的误包率；接收机怎样判决、电平高于或低于表中值时误包率是多少，标准都不规定。' },
    { heading: '链路余量（§3.1）', text: '标准把链路余量（link margin）定义为接收信号功率与站点（station, STA）所需最小值之比；站点计算它时可以计入速率与信道条件，包括干扰。要留多少余量，标准不规定。' },
    { heading: '收完一帧之后（§8.3.5.15，§9.2.4.9，§10.3.2.11，§10.3.2.3.7）', text: '物理层以 PHY-RXEND.indication 原语结束一次接收，其中的 RXERROR 参数为 NoError，或指出 FormatViolation、CarrierLost、UnsupportedRate 等错误。MAC 再检查帧校验序列：它是对帧头（MAC header）与帧体（Frame Body）计算的 32 位循环冗余校验（cyclic redundancy check, CRC）。需要立即确认的帧（例如确认策略（Ack Policy）为正常确认的单播服务质量（quality of service, QoS）数据帧（data frame））收到之后，接收方在 SIFS 之后发送确认帧，不论介质（medium）忙闲。物理层报告出错或帧校验序列不正确时，站点在下一次发送前改用扩展帧间间隔（extended interframe space, EIFS）。' },
    { kind: 'steps', heading: '一帧从开始接收到确认，按标准：逐步说明', items: [
      '接收端检出前导码：OFDM 发送以不低于 −82 dBm 的电平开始时，载波侦听（carrier sense）与空闲信道评估（clear channel assessment, CCA）应在 4 µs 内以大于 90% 的概率判为信道忙（§17.3.10.6）；宽于 20 MHz 的 VHT、HE、EHT PPDU 用主 20 MHz 信道内测得的功率与 −82 dBm 比较（§27.3.22.6.3，IEEE Std 802.11be-2024 §36.3.21.6.3）。',
      '物理层接收整个 PSDU，以 PHY-RXEND.indication 报告 RXERROR（§8.3.5.15）。',
      'MAC 检查帧校验序列（§9.2.4.9）。',
      '帧正确且需要立即确认：在 SIFS 之后发送确认帧（§10.3.2.11）。',
      '帧有错：不发送确认帧，并在下一次发送前等待 EIFS（§10.3.2.3.7）；发送方在 AckTimeout 内收不到确认帧，判定这次发送失败（§10.3.2.11）。',
    ] },
  ],
  implementation: [
    { topic: '灵敏度表', standard: '表 27-58、表 36-67 的 20 MHz 一列', sim: '照此存储：HE 的 MCS 0 到 11 为 −82 到 −52 dBm，EHT 的 MCS 12、13 为 −49 与 −46 dBm，逐级相同。', kind: 'faithful' },
    { topic: '所需 SINR', standard: '标准只给电平，不给比值', sim: '所需 SINR = 灵敏度 − kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB：减去表格假设的噪声，表格里 5 dB 的实现余量留在要求之内。这个比值与信道带宽（channel width）无关；第 0 级是 8.99 dB。', kind: 'choice' },
    { topic: '判决方式', standard: '只规定在灵敏度电平上误包率不超过 10%', sim: '一道硬门限：整帧期间最差时刻的 SINR 达到所需值就整帧成功（RX_OK），否则整帧失败（RX_FAIL）；没有误包率曲线，门限附近的结果也是确定的。', kind: 'choice' },
    { topic: '前导检测（preamble detection）的比值', standard: '标准只规定检出概率，不规定比值', sim: '到达电平不低于 −82 dBm、且 SINR 不低于 4 dB 就检出前导码并开始接收；电平足够而 SINR 不到 4 dB 记为 RX_MISS。4 dB 取自 ns-3。', kind: 'value' },
    { topic: '前导检测的电平', standard: '不低于 −82 dBm 的 OFDM 发送，4 µs 内以大于 90% 的概率检出（§17.3.10.6）；HE 宽带 PPDU 按主 20 MHz 信道内测得的功率比较（§27.3.22.6.3）', sim: '照此：把到达电平折算到主 20 MHz 信道再与 −82 dBm 比较，功率按在 PPDU 带宽内均匀分布计算；160 MHz 的 PPDU 在主 20 MHz 信道内的功率比整个 PPDU 低 9.03 dB。', kind: 'faithful' },
    { topic: '能量检测（energy detection, ED）', standard: '主 20 MHz 信道上 −62 dBm（§17.3.10.6，§27.3.22.6.3）；各个 20 MHz 子信道另有 −62 dBm 的忙闲判断（§27.3.22.6.5）', sim: '照此：把每个正在发送的信号落在主 20 MHz 信道内的功率相加，与 −62 dBm 比较；次信道按每个 20 MHz 子信道 −62 dBm 判忙闲。本课的场景里只有一对设备，这一项不起作用。', kind: 'faithful' },
    { topic: '帧校验序列', standard: 'MAC 用 32 位 CRC 检查（§9.2.4.9）', sim: '未实现：引擎不产生比特，也不计算 CRC；判决结果直接记为 RX_OK 或 RX_FAIL（原因为 lowSinr、collision 等）。', kind: 'absent' },
    { topic: '确认与 EIFS', standard: 'SIFS 后确认；出错后用 EIFS（§10.3.2.11，§10.3.2.3.7）', sim: '照此：解码成功后 16 µs 发出确认帧；接收失败之后，下一次发送前等待 EIFS。', kind: 'faithful' },
    { topic: '聚合帧', standard: '每个 MPDU（MAC protocol data unit）各有帧校验序列，块确认（BlockAck）用位图（bitmap）逐个确认', sim: '一个 PPDU 只有一个判决：聚合 MPDU（aggregate MPDU, A-MPDU）要么全部收到，要么全部丢失。本课的场景没有聚合。', kind: 'differs' },
    { topic: '速率余量', standard: '标准不规定留多少余量（§3.1）', sim: '发送端选级时要求信噪比（signal-to-noise ratio, SNR）≥ 所需 SINR + 3 dB；接收端解码时只用所需 SINR，不计入这 3 dB。', kind: 'value' },
  ],
  labs: [
    {
      heading: '客厅那一帧解码成功',
      jump: 0,
      steps: [
        '载入本课场景（客厅），跳到第一个数据帧，再看紧跟在它右侧的那一小段。',
        '按下表逐项比较。',
      ],
      blocks: [
        { kind: 'table', heading: '客厅那台笔记本的第一帧', head: ['项目', '数值'], rows: [
          ['这一帧使用的等级', 'MCS 3'],
          ['标准规定的灵敏度（20 MHz）', '−74 dBm'],
          ['本仿真器换算的所需 SINR', '16.99 dB'],
          ['整帧期间最差的 SINR', '21.66 dB'],
          ['结果', 'RX_OK，16 µs 后路由器发出确认帧'],
        ] },
      ],
      expect: '21.66 dB 高于 16.99 dB，这一帧解码成功；数据帧在 423.0 µs 结束，路由器的确认帧在 439.0 µs 开始。',
      meaning: '−74 dBm 来自标准（①）；16.99 dB 与“达到就成功”是本仿真器的换算与判决（②）；SIFS 之后的确认帧照标准（①、②）。',
    },
    {
      heading: '四个位置都没有失败',
      more: [0, 1, 3],
      steps: [
        '依次载入四个变体，各运行 100 ms。',
        '读出每个位置使用的等级、所需 SINR 与实际的 SNR，再数接收失败、重传（retry）与确认帧。',
      ],
      blocks: [
        { kind: 'table', heading: '四个位置，100 ms', head: ['位置', 'MCS', '所需 SINR', 'SNR', '接收失败', '确认帧'], rows: [
          ['书桌，1 m', '13', '44.99 dB', '62.3 dB', '0', '343'],
          ['书房，5 m', '10', '36.99 dB', '41.3 dB', '0', '315'],
          ['客厅，9 m + 砖墙', '3', '16.99 dB', '21.7 dB', '0', '172'],
          ['远端墙边，14 m + 砖墙', '1', '11.99 dB', '15.9 dB', '0', '106'],
        ] },
      ],
      expect: '四个位置的 SNR 都比所需 SINR 高出 3 dB 以上，没有一次接收失败，也没有重传与超时。',
      meaning: '每条链路都处在各自允许的最高一级，要求之上仍留有 3 dB 的速率余量（②）。',
    },
    {
      heading: '远端墙边加宽到 40、80 与 160 MHz',
      variant: 3,
      steps: [
        '载入远端墙边变体，在编辑器里把两端的信道带宽依次改成 40、80、160 MHz，各运行 100 ms。',
        '对照下表读出主 20 MHz 信道内的电平、噪声地板（noise floor）、SNR 与结果。',
      ],
      blocks: [
        { kind: 'table', heading: '同一位置，四种带宽，100 ms', head: ['信道带宽', '主 20 MHz 信道内的电平', '噪声地板', 'SNR', 'MCS 0 所需', '结果'], rows: [
          ['20 MHz', '−78.08 dBm', '−93.99 dBm', '15.91 dB', '8.99 dB', '以 MCS 1 发送，106 帧被确认'],
          ['40 MHz', '−81.09 dBm', '−90.98 dBm', '12.90 dB', '8.99 dB', '以 MCS 0 发送，105 帧被确认'],
          ['80 MHz', '−84.10 dBm', '−87.97 dBm', '9.89 dB', '8.99 dB', '前导码未检出，55 次 ACK 超时'],
          ['160 MHz', '−87.11 dBm', '−84.96 dBm', '6.87 dB', '8.99 dB', '前导码未检出，59 次 ACK 超时'],
        ] },
      ],
      expect: '到达电平都是 −78.08 dBm。40 MHz 时主 20 MHz 信道内的电平是 −81.09 dBm，仍不低于 −82 dBm，每一帧都被确认；80 MHz 时只有四分之一的功率落在主 20 MHz 信道内，即 −84.10 dBm，低于 −82 dBm，路由器上没有一次 RX_START，发送方 55 次等到 ACK 超时（ACK timeout）。80 MHz 的 SNR 9.89 dB 其实高于 MCS 0 所需的 8.99 dB，但接收没有开始，解码门限也就无从比较；160 MHz 时主 20 MHz 信道内只有 −87.11 dBm，结果相同。',
      meaning: '前导检测按主 20 MHz 信道内的功率与 −82 dBm 比较是标准的规定（①），本仿真器照此实现（②）；加宽信道把同样的功率分散到更多的 20 MHz 子信道上，这个位置最先失守的是前导检测，而不是解码门限。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§17.3.10.2 与表 17-21（OFDM 最小输入灵敏度，1000 个八位组，误包率不超过 10%，噪声系数 10 dB、实现余量 5 dB）、§27.3.22.2 与表 27-58（HE，4096 个八位组）、§17.3.10.6（前导检测 −82 dBm、能量检测 −62 dBm）、§27.3.22.6（HE 的 CCA，主 20 MHz 信道与每个 20 MHz 子信道）、§3.1（链路余量）、§8.3.5.15（PHY-RXEND.indication）、§9.2.4.9（帧校验序列）、§10.3.2.11（确认与 AckTimeout）、§10.3.2.3.7（EIFS）；IEEE Std 802.11be-2024 §36.3.21.2 与表 36-67（EHT）、§36.3.21.6.3（EHT 的主 20 MHz 信道 CCA）。',
    '本仿真器的取值与取法：把灵敏度换算成所需 SINR（减去 kTB 与 10 dB）、按整帧最差 SINR 的硬门限判决、4 dB 的前导检测比值（取自 ns-3）、按功率在 PPDU 带宽内均匀分布折算主 20 MHz 信道内的电平、3 dB 的速率余量。',
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
      q: '标准的最小输入灵敏度表规定了什么？',
      options: [
        '电平高于表中值的帧一定解码成功，低于的一定失败',
        '输入电平为表中值时，误包率不得超过 10%；判决方法与其他电平上的误包率，标准不规定',
        '接收机的噪声系数必须是 10 dB',
      ],
      answer: 1,
      explain: '§17.3.10.2、§27.3.22.2 规定的是性能要求；10 dB 噪声系数只是推导表格时的假设。硬门限是本仿真器的判决方式。',
    },
    {
      q: '远端墙边那台笔记本换到 80 MHz 后，路由器不再回复任何确认帧。为什么？',
      options: [
        '主 20 MHz 信道内的电平低于 −82 dBm，前导码没有被检出，接收根本没有开始',
        '前导码能被检出，接收也已开始，但整帧的比值低于这一级的要求，因此记为 RX_FAIL',
        '噪声地板升高后，接收端会自动关闭这条链路',
      ],
      answer: 0,
      explain: '到达电平 −78.08 dBm 是整个 80 MHz PPDU 的功率，落在主 20 MHz 信道内的只有 −84.10 dBm，低于前导检测的 −82 dBm（§27.3.22.6.3）。SNR 9.89 dB 虽然高于 MCS 0 所需的 8.99 dB，但接收没有开始，就轮不到解码门限。',
    },
    {
      q: '发送端多留的那 3 dB，接收端解码时是否计入？',
      options: [
        '计入：接收端要求所需比值再加 3 dB',
        '不计入：接收端只用最差的比值与不含余量的要求比较，3 dB 是发送端选级时预留的',
        '计入一半：所需比值加 1.5 dB',
      ],
      answer: 1,
      explain: '接收端只用整帧最差时刻的比值与不含余量的所需 SINR 比较（②）；3 dB 只在发送端选级时使用：客厅那一帧的 21.66 dB 比 MCS 3 所需的 16.99 dB 高 4.67 dB，发送端没有选更高的 MCS 4，正是因为 MCS 4 的要求加上 3 dB 超过了 21.66 dB。',
    },
  ],
}
