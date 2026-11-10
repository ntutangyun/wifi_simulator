/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · Picking how fast to talk.
 *
 * Standard-first shape (2026-11-11). ① is what IEEE Std 802.11-2024 and IEEE Std 802.11be-2024
 * say about choosing a rate: any rate inside the receiver's supported set (§10.6.5.8,
 * §35.14.4.1) with MCS 10–13 optional (§36.1.1), success known only from the Ack within
 * AckTimeout (§10.3.2.11), the link-adaptation feedback a receiver MAY send (HLA §26.13, ELA
 * §35.19), and what a sensitivity figure promises (§36.3.21.2). ② is this simulator's ceiling
 * (`mcsForPeer` in src/engine/simulation.ts, `mcsForRssi` in src/engine/phy.ts) and its loop
 * (src/engine/rate.ts), each marked against ①; the feedback is absent. ③ four runs of the scene
 * `rate-fallback` loads too.
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every figure printed below is read back
 * out of the lesson text in tests/course/rate.test.ts and compared with the engine or a run.
 */
import { type Lesson, firstData, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

export const rate: Lesson = {
  id: 'rate',
  module: 8,
  title: '速率控制——决定用多高的速率发送',
  why: 'IEEE 802.11 不规定发送端怎样选择速率：数据帧（data frame）可以用任何速率发送，只要调制与编码方式（modulation and coding scheme, MCS）、空间流（spatial stream）数与带宽在接收方声明支持的集合之内；Wi-Fi 7 必须支持单流的 MCS 0 到 7，4096-QAM（quadrature amplitude modulation）的 MCS 12、13 是可选的。发送端判断一帧是否送达的依据是确认帧（acknowledgement, ACK）：发完之后在 AckTimeout 内没有收到，就判定这次发送失败；ACK 本身不带任何信号质量信息。标准另外为链路（link）定义了自适应反馈：发送端可以请求，接收端按收到的 PPDU（PHY protocol data unit）算出建议的 MCS 与流数并发回。本仿真器没有实现这种反馈，它的速率控制由两部分组成：每一帧之前按这条链路的平均接收电平算出可支持的最高一级，即上限；上限以下按 ACK 的有无升降，连续 2 次失败降一级，连续 10 次成功升一级。本课的场景里，隔着砖墙的远端站点（station, STA）上限是 MCS 2，3 s 里 75.8 % 的帧以上限发送，其余降到 MCS 1 或 MCS 0，降到 MCS 0 时一帧的空口时间（airtime）是上限时的 2.8 倍；它从未超过上限。距接入点（access point, AP）一米的近端站点信号足以支持 MCS 13，但两端都没有启用 4096-QAM，所以每一帧都是 MCS 11。远端的 229 次 ACK 超时（ACK timeout）中，有 226 次发生在它与近端站点同时开始发送的帧上，而发送端只知道没有收到 ACK。',
  outcomes: [
    '说出标准对数据帧速率规定了什么、没有规定什么，以及发送端判断成败的唯一依据',
    '分清本仿真器的速率控制哪些是它自己的取值或取法、哪些标准功能没有实现',
    '按步骤算出一条链路的上限，并从时间轴上读出发送端降级的代价',
  ],
  needs: ['mcs-ladder', 'retries-queues', 'rate-vs-model', 'width'],
  terms: [
    { term: 'ceiling', plain: '上限：本仿真器按这条链路的平均接收电平算出的、可支持的最高一级；标准里没有这个量' },
    { term: 'AckTimeout', plain: '发送端发完一帧后等待确认帧的时间：aSIFSTime + aSlotTime + aRxPHYStartDelay' },
    { term: 'MFB', plain: '链路自适应反馈（MCS feedback）：接收端按收到的 PPDU 算出并发回的建议 MCS 与流数' },
  ],
  standard: [
    { heading: '数据帧用什么速率（IEEE Std 802.11-2024 §10.6.5.8）', text: '单播的数据帧与管理帧（management frame）可以用任何速率、MCS 或「MCS 与流数」组合发送，约束只有：不得使用接收方没有声明支持的速率或组合，不得使用接收方不支持的带宽；接收方用 Operating Mode 字段调低流数后，也不得超过新的值。在这些约束之内怎样选，标准不规定。' },
    { heading: 'Wi-Fi 7 必须支持哪几级（IEEE Std 802.11be-2024 §36.1.1，§35.14.4.1）', text: 'EHT 站点必须支持单空间流的 MCS 0 到 7；不是只支持 20 MHz 的站点还必须支持 MCS 8、9；MCS 10 到 13 是可选的，其中 MCS 12、13 是 4096-QAM。EHT 站点不得发送「EHT-MCS 与流数」组合不在接收方接收集合里的 EHT PPDU（PHY protocol data unit）（§35.14.4.1）。' },
    { heading: '成败的依据：确认帧（§10.3.2.11）', text: '发出需要确认的 MPDU（MAC protocol data unit）之后，发送端从物理层（physical layer, PHY）报告发送结束（PHY-TXEND.confirm）起等待 AckTimeout = aSIFSTime + aSlotTime + aRxPHYStartDelay；这段时间里没有检测到任何接收开始，就判定这次发送失败，并在 AckTimeout 结束时启动退避（backoff）。收到发给自己的确认帧，才算成功。确认帧是 14 字节的控制帧（control frame），不带任何关于信号质量的字段。' },
    { heading: '链路自适应反馈（IEEE Std 802.11-2024 §26.13，IEEE Std 802.11be-2024 §35.19）', text: '支持的站点在能力元素里声明链路自适应能力。请求方在 HT Control 字段的 HLA（HE）或 ELA（EHT）控制子字段里置 MRQ 位，并指明资源单元（resource unit, RU）与带宽；应答方按携带这个请求的 PPDU 在同一资源单元上的接收情况，算出建议的 MCS 与流数，作为 MFB 发回。能力为 2 或 3 的站点也可以接收不经请求发来的 MFB。请求方怎样使用 MFB，标准不规定。' },
    { heading: '灵敏度（sensitivity）表的含义（IEEE Std 802.11be-2024 §36.3.21.2）', text: '在表 36-67 给出的最小输入电平上，4096 字节 PSDU（PHY service data unit）的误包率必须低于 10 %。灵敏度是一项测试要求，不是解调门限：电平在它附近时，一部分帧能解出、一部分不能。' },
    { kind: 'steps', heading: '按标准发送一帧并判断成败：逐步说明', items: [
      '读接收方声明支持的速率、「MCS 与流数」组合与带宽（§10.6.5.8，§35.14.4.1）。',
      '在这些约束之内选一个组合；可以参考对方发来的 MFB，也可以不参考（§26.13，§35.19）。选法由实现决定。',
      '发出这一帧，从发完起等待 AckTimeout（§10.3.2.11）。',
      '收到确认帧就是成功；AckTimeout 内没有检测到接收开始就是失败，启动退避，准备重传（retry）。',
    ] },
  ],
  implementation: [
    { topic: '速率选择算法', standard: '标准不规定（§10.6.5.8）', sim: '每一帧之前先算上限，当前级别高于上限就立即降到上限；上限以下按 ACK 的有无升降：连续 2 次失败降一级，连续 10 次成功升一级，最高回到上限。', kind: 'choice' },
    { topic: '上限的计算', standard: '标准里没有上限这个量', sim: '信噪比（signal-to-noise ratio, SNR）= 平均接收电平 − 这个带宽的噪声地板（noise floor）；从最低一级向上，取最后一个满足「所需信噪比 + 3 dB ≤ SNR」的级。所需信噪比 = 20 MHz 灵敏度 −（20 MHz 热噪声 + 10 dB 噪声系数）；3 dB 速率余量是本仿真器取的值。', kind: 'value' },
    { topic: '上限依据的电平', standard: '标准不规定发送端用什么信息', sim: '用链路表里的平均接收电平，由距离和墙决定；即使场景打开了衰落也不变。发送端在帧尚未发出时选级，不知道这一帧会遇到的衰落。', kind: 'choice' },
    { topic: '接收方支持的级别', standard: 'MCS 12、13 可选，组合须在接收方的接收集合里（§36.1.1，§35.14.4.1）', sim: '两端都启用 4096-QAM 才能用 MCS 12、13，否则上限先限制为 MCS 11。本课两端都没有启用。', kind: 'faithful' },
    { topic: '成败的判定', standard: 'AckTimeout = aSIFSTime + aSlotTime + aRxPHYStartDelay（§10.3.2.11）', sim: 'ACK 超时取 16 + 9 + 24 = 49 µs（这些 Wi-Fi 7 设备支持 HT、VHT、HE 物理层，aRxPHYStartDelay 取其中最大的 24 µs，§6.7.4.4），没有收到就判定失败并重传；速率控制得到的输入只有成功或失败。', kind: 'faithful' },
    { topic: '链路自适应反馈', standard: 'MRQ 与 MFB（§26.13，§35.19）', sim: '未实现：没有 HT Control 字段，接收端不发回建议的 MCS。', kind: 'absent' },
    { topic: '解调的判决', standard: '标准只规定灵敏度电平上误包率低于 10 %（§36.3.21.2）', sim: '非此即彼：整帧期间最差的信干噪比（signal-to-interference-plus-noise ratio, SINR）达到这一级的要求就整帧解出，差 0.01 dB 就整帧丢失，没有过渡带。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '远端站点的三个级别',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个数据帧，然后沿远端站点的泳道向后看：它的方块长短不一，近端站点的方块长度始终不变。',
        '运行完 3 s，对照下表读出远端站点各级别的速率、空口时间与所占比例。',
      ],
      blocks: [
        { kind: 'table', heading: '远端站点 3 s 内的帧：1530 字节，20 MHz，单流', head: ['级别', '速率一行', '空口时间', '占它帧数的比例'], rows: [
          ['MCS 2（上限）', '25.8 Mb/s', '544.0 µs', '75.8 %'],
          ['MCS 1', '17.2 Mb/s', '780.0 µs', '21.1 %'],
          ['MCS 0（最低一级）', '8.6 Mb/s', '1496.0 µs', '3.0 %'],
        ] },
      ],
      expect: '你应该看到：远端站点 3 s 内发出 2880 个数据帧，没有一帧高于 MCS 2；降一级，一帧从 544.0 µs 变成 780.0 µs，降到 MCS 0 是 1496.0 µs，为上限时的 2.8 倍。',
      meaning: '这说明：上限以下的升降是本仿真器的取法（②），标准对选法没有要求（①）。每降一级，同样的内容占用更长的空口时间，这段时间里其他设备只能等待。',
    },
    {
      heading: '按步骤算出远端的上限',
      steps: [
        '在编辑器里读出远端站点到接入点的接收电平。',
        '按 ② 的方法逐步计算，与下表对照。',
      ],
      blocks: [
        { kind: 'table', heading: '远端链路的上限', head: ['步骤', '数值'], rows: [
          ['平均接收电平', '−75.46 dBm'],
          ['20 MHz 的噪声地板', '−93.99 dBm'],
          ['SNR', '18.53 dB'],
          ['能力上限：两端都未启用 4096-QAM', 'MCS 11'],
          ['MCS 2 的要求（含余量）', '13.99 + 3 = 16.99 dB，满足'],
          ['MCS 3 的要求（含余量）', '16.99 + 3 = 19.99 dB，不满足'],
          ['上限', 'MCS 2'],
        ] },
      ],
      expect: '你应该看到：SNR 是 18.53 dB，满足 MCS 2 的 16.99 dB，不满足 MCS 3 的 19.99 dB，所以上限是 MCS 2，与第一个实验里远端站点的最高级别一致。',
      meaning: '这说明：上限只由平均电平、噪声地板和 3 dB 余量决定（②）；把余量改成别的值，最后一行就会变。标准既不规定这个余量，也没有上限这个量（①）。',
    },
    {
      heading: '近端站点不需要选择',
      steps: [
        '在时间轴上只看近端站点的泳道，运行完 3 s。',
        '数一数它的数据帧、使用的级别与 ACK 超时。',
      ],
      expect: '你应该看到：近端站点 3 s 内发出 3884 个数据帧，全部是 MCS 11，没有一次 ACK 超时。它的 SNR 是 58.72 dB，高于 MCS 13 要求的 47.99 dB。',
      meaning: '这说明：限制它的不是信号，而是两端声明支持的级别：MCS 12、13 是可选的（①），本场景两端都没有启用 4096-QAM，本仿真器因此把上限限制为 MCS 11（②）。',
    },
    {
      heading: '一次 ACK 超时',
      jump: 1,
      steps: [
        '跳到第一次 ACK 超时，往前找到这次超时对应的那一帧，以及同一时刻近端站点发出的帧。',
        '运行完 3 s，数一数远端站点的 ACK 超时里，有多少次发生在与近端站点同时开始的帧上。',
      ],
      expect: '你应该看到：两台站点都在 0 µs 开始发送；远端那一帧以 MCS 2 发送，544.0 µs 结束，49 µs 后即 593.0 µs 记下 ACK 超时。3 s 内远端共有 229 次 ACK 超时，其中 226 次发生在与近端站点同时开始的帧上。',
      meaning: '这说明：发送端得到的只是「没有收到 ACK」（①），信号太弱与同时发送在它看来完全相同；本仿真器的速率控制照样把这些失败计入降级（②）。标准的 MFB 能告诉发送端接收端建议的级别（①），本仿真器没有实现（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.6.5.8（数据帧与管理帧的速率约束）、§10.3.2.11（确认过程与 AckTimeout）、§26.13（HLA 控制子字段的链路自适应）、表 17-24（第 17 章 OFDM PHY 在 20 MHz 信道间隔下的 aRxPHYStartDelay 为 20 µs）。',
    'IEEE Std 802.11be-2024：§36.1.1（必须与可选的 EHT-MCS）、§35.14.4.1（接收方的「EHT-MCS 与流数」集合）、§35.19（ELA 控制子字段的链路自适应）、§36.3.21.2 与表 36-67（最小输入灵敏度，4096 字节 PSDU 误包率低于 10 %）、表 36-76（各级的速率）。',
    '本仿真器的取值与取法：按平均接收电平算上限、3 dB 速率余量、所需信噪比按 10 dB 噪声系数从灵敏度反推、连续 2 次失败降一级与连续 10 次成功升一级、非此即彼的判决；没有链路自适应反馈。',
    '房间、两台站点的位置与满负荷的上传业务都是本仿真器的场景取值。',
  ],
  limits: [],
  scenario: () => rateScenario(),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一帧发出去了，没有收到确认帧。按标准，发送端对失败的原因知道些什么？',
      options: [
        '它知道信号无法支持所选的级别',
        '它只知道在 AckTimeout 内没有收到确认帧；确认帧本身也不带信号质量信息',
        '接入点会在下一个信标（Beacon）里告诉它原因',
      ],
      answer: 1,
      explain: '§10.3.2.11 只规定了超时即失败。标准另有 MFB 可以给出建议的级别，但那是单独的反馈，本仿真器没有实现；本课 229 次超时中有 226 次发生在两台站点同时开始发送的帧上。',
    },
    {
      q: '标准对数据帧的速率选择算法规定了什么？',
      options: [
        '连续 2 次失败必须降一级',
        '只规定约束：不得使用接收方不支持的速率、组合或带宽；怎样选由实现决定',
        '必须按接收端的 MFB 选择',
      ],
      answer: 1,
      explain: '这是 §10.6.5.8 的规定。连续 2 次失败降一级、连续 10 次成功升一级是本仿真器的取法。',
    },
    {
      q: '远端站点连续成功了二十次。在本仿真器里，它能升到 MCS 2 以上吗？',
      options: [
        '不能：MCS 2 是按它的平均电平算出的上限，连续成功最多只能回到上限',
        '能，只要累积足够多的成功',
        '只有近端站点停止上传时才能',
      ],
      answer: 0,
      explain: '上限由平均电平、噪声地板和 3 dB 余量决定：SNR 18.53 dB 不满足 MCS 3 的 19.99 dB。3 s 内远端站点没有一帧高于 MCS 2。',
    },
  ],
}
