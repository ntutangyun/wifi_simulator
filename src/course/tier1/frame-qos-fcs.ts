/**
 * Wi-Fi Tier 1 · M3 · lesson 2: the two bytes that mark a frame's traffic, and
 * the four at the end that say it arrived whole.
 *
 * The SECOND half of `frame-anatomy`, split per
 * docs/superpowers/plans/2026-09-25-course-repacing-proposal.md §2 · M3. It
 * loads exactly the scene `frame-anatomy` loads — the same builder, no variant
 * — so the split adds no scenario and this lesson's recorded hash is
 * `frame-anatomy`'s, value for value (`sameSceneAs` in its shape suite).
 *
 * Standard-first shape (2026-11-10): ① IEEE Std 802.11-2024 — the QoS Control
 * field (table 9-10), the TID as a user priority (table 9-12) and its access
 * category (table 10-1), the ack policy (table 9-13), the FCS (§9.2.4.9) and
 * what reception and acknowledgement mean (§9.2.2, §10.3.2.11, §10.23.2.12);
 * ② where this simulator follows it — the field, the ack policy, the retry —
 * and where it does not: one fixed TID per access category, no CRC at all, a
 * reception decided by SINR; ③ three runs.
 *
 * Every figure the lesson prints is read back out of its text and compared
 * with a run in tests/course/frame-qos-fcs.test.ts.
 */
import { J, type Lesson } from '../lessonKit'
import { frameAnatomyScenario, firstLegacyData, firstQosSingle, firstAmpduFrame, firstLegacyRetry } from './frame-anatomy'

export const frameQosFcs: Lesson = {
  id: 'frame-qos-fcs',
  module: 2,
  title: '业务标记与帧校验',
  why: '上一课讲完了每一帧都有的那 24 个字节。还有两部分没有讲。第一部分是服务质量（quality of service, QoS）控制字段：子类型为 QoS Data 的数据帧（data frame）在帧头（MAC header）中多出这 2 个字节，其中的业务标识（traffic identifier, TID）在增强型分布式信道接入（enhanced distributed channel access, EDCA）下携带这份载荷（payload）的用户优先级 0 到 7，确认策略（Ack Policy）说明接收端怎样确认它。TID 只是标识，不代表优先次序：用户优先级 1 和 2 属于背景类，优先级反而低于属于尽力而为类的 0。第二部分是帧尾 4 个字节的帧校验序列（frame check sequence, FCS），即对帧头与帧体（Frame Body）算出的 32 位循环冗余校验（cyclic redundancy check, CRC）；标准中只有通过这项校验的帧才算“接收”，接收端只为接收的帧回复确认帧（acknowledgement, ACK），发送端等不到确认帧就判定失败，重发时把重发比特（Retry bit）置 1。本仿真器写入 QoS 控制字段与确认策略，重发规则也与标准相同，但它从不计算 CRC：一帧是否被接收，取决于整帧期间最差时刻的信干噪比（signal-to-interference-plus-noise ratio, SINR）是否达到所用速率等级的要求；它也没有用户优先级，每个接入类别（access category, AC）固定写一个 TID。',
  outcomes: [
    '按标准说出 QoS 控制字段中 TID 与确认策略的含义，以及 TID 与接入类别的对应关系',
    '说出 FCS 怎样计算、标准怎样用它定义“接收”，以及一帧没有被接收时会发生什么',
    '分清本仿真器在这两部分上哪些照标准、哪些与标准不同',
  ],
  needs: ['frame-anatomy'],
  terms: [
    { term: 'QOS', plain: '服务质量：QoS 数据帧帧头中标明业务类别与确认方式的两个字节' },
    { term: 'TID', plain: '业务标识：这两个字节中的 4 位编号，在 EDCA 下就是这份载荷的用户优先级' },
  ],
  standard: [
    { heading: 'QoS 控制字段（§9.2.4.5.1，表 9-10）', text: '子类型字段的最高位 B7 是 QoS 子字段；它为 1 的数据帧都带 QoS 控制字段，共 2 个八位组，位于序列控制（Sequence Control）之后。非接入点（access point, AP）站点（station, STA）在非 Mesh 的基本服务集（basic service set, BSS）中发送 QoS Data 帧时，这个字段的布局如下表。表中有一个子字段为一次传输机会（transmit opportunity, TXOP）申请时长，即 TXOP Duration Requested；另一个是 Queue Size，报告缓存的数据量。' },
    { kind: 'table', heading: '非接入点站点发送的 QoS Data 帧：QoS 控制字段（表 9-10）', head: ['比特', '子字段'], rows: [
      ['0–3', 'TID'],
      ['4', '为 0 时比特 8–15 是 TXOP Duration Requested，为 1 时是 Queue Size'],
      ['5–6', '确认策略指示（Ack Policy Indicator）'],
      ['7', 'A-MSDU Present'],
      ['8–15', 'TXOP Duration Requested 或 Queue Size'],
    ] },
    { heading: 'TID 与用户优先级（§9.2.4.5.2，表 9-12）', text: '在 EDCA 下，TID 携带这份 MSDU（MAC service data unit）的用户优先级，取值 0 到 7；取值 8 到 15 用于 HCCA 等方式下的业务流。用户优先级由上层给出。' },
    { kind: 'table', heading: '用户优先级到接入类别的映射（§10.2.3.2，表 10-1）', head: ['接入类别', '用户优先级', '用途'], rows: [
      ['AC_BK', '1, 2', '背景'],
      ['AC_BE', '0, 3', '尽力而为'],
      ['AC_VI', '4, 5', '视频'],
      ['AC_VO', '6, 7', '语音'],
    ] },
    { heading: '编号不是优先次序（表 10-1）', text: '表 10-1 按优先级从低到高排列的用户优先级是 1、2、0、3、4、5、6、7：编号 1 和 2 的背景类，优先级低于编号 0 的尽力而为类。表中的用途一栏只是一般性的指导，每个用户优先级实际怎样使用由实现决定。' },
    { heading: '确认策略（§9.2.4.5.4，表 9-13）', text: '确认策略指示与其他条件一起决定接收端的行为。同一个指示值，用在单独发送的 MPDU（MAC protocol data unit）上与用在聚合 MPDU（aggregate MPDU, A-MPDU）中含义不同：单独发送的帧是 Normal Ack，接收端相隔短帧间间隔（short interframe space, SIFS）回复确认帧（acknowledgement, ACK）；在块确认（block acknowledgement, BlockAck）协议下装入 A-MPDU 的帧是 Implicit BAR，接收端相隔 SIFS 回复 BlockAck。另有 No Ack 等策略，接收端不作确认。' },
    { heading: 'FCS（§9.2.4.9）', text: 'FCS 字段是 32 位 CRC，对帧头的全部字段与帧体计算，生成多项式为 G(x) = x^32 + x^26 + x^23 + x^22 + x^16 + x^12 + x^11 + x^10 + x^8 + x^7 + x^5 + x^4 + x^2 + x + 1。接收端以全 1 为初值，把收到的字段连同 FCS 一起除以 G(x)，没有传输差错时余数是一个固定值。' },
    { kind: 'steps', heading: '一帧怎样被接收、怎样被确认，按标准：逐步说明', items: [
      '只有物理层（physical layer, PHY）无差错交付、并通过 FCS 校验的 MPDU 才算“接收”（§9.2.2）。',
      '接收端接收了一个需要立即确认的帧，就相隔 SIFS 回复确认帧或块确认，不论此时信道忙闲（§10.3.2.11）。',
      '没有被接收的帧，接收端不回复任何帧：它的地址同样无法确认。',
      '发送端等不到发给自己的确认帧，就判定这次发送失败，执行退避（backoff）（§10.3.2.11）。',
      '重发时把重发比特置 1（§10.23.2.12.1），序号（sequence number）保持不变（§9.2.4.4.3）。',
    ] },
  ],
  implementation: [
    { topic: 'QoS 控制字段的出现', standard: '子类型 B7 为 1 的数据帧（§9.2.4.5.1）', sim: '发送端与接入点都启用 EDCA 时写 QoS Data 帧，帧头 26 B；否则写 Data 帧，帧头 24 B。', kind: 'faithful' },
    { topic: 'TID 的取值', standard: '携带上层给出的用户优先级 0–7（表 9-12）', sim: '引擎没有用户优先级，只有接入类别；每个接入类别固定写一个 TID：背景 1、尽力而为 0、视频 5、语音 6，各是表 10-1 中该类别的一个用户优先级。', kind: 'choice' },
    { topic: '确认策略', standard: '单独的帧 Normal Ack，A-MPDU 中的帧 Implicit BAR（表 9-13）', sim: '照此写入，并照此回复确认帧或块确认；不使用 No Ack 等其他策略。', kind: 'faithful' },
    { topic: 'QoS 控制的其他子字段', standard: 'A-MSDU Present、TXOP Duration Requested、Queue Size 等（表 9-10）', sim: '未建模：字段视图只显示 TID 与确认策略。', kind: 'absent' },
    { topic: 'FCS 的计算', standard: '32 位 CRC（§9.2.4.9）', sim: '不计算：FCS 只计入 4 B 的长度，src/engine 中没有任何一处计算 CRC。', kind: 'differs' },
    { topic: '接收的判定', standard: '无差错交付并通过 FCS 校验（§9.2.2）', sim: '按整帧期间最差时刻的信干噪比是否达到该速率等级的要求判定。失败原因只记录为碰撞、信号太弱、接收端正在发送、接收机已转去同步更强的帧四种，不会出现“信干噪比足够而校验失败”的帧。', kind: 'differs' },
    { topic: '没有收到确认帧之后', standard: '判定失败，退避后重发，重发比特置 1（§10.3.2.11，§10.23.2.12.1）', sim: '照此处理：确认超时后退避，重发时序号不变、重发比特置 1。', kind: 'faithful' },
  ],
  labs: [
    {
      heading: '一个带业务标记的数据帧',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个 QoS 数据帧（手机发出），展开“空中字段”。',
        '再跳到旧笔记本的第一帧，对照下表比较两帧。',
      ],
      blocks: [
        { kind: 'table', heading: '两帧的帧头', head: ['项目', '手机的 QoS 数据帧', '旧笔记本的数据帧'], rows: [
          ['发送时刻', '20.452 ms', '0 µs'],
          ['子类型', 'QoS Data（1000）', 'Data（0000）'],
          ['帧头', '26 B', '24 B'],
          ['QoS 控制', 'TID 6，Normal Ack', '无'],
          ['持续时间', '44 µs', '44 µs'],
        ] },
      ],
      expect: '两帧都发往路由器，地址角色相同，持续时间（Duration/ID）都是 44 µs；区别只在 QoS 控制这 2 个字节。',
      meaning: 'QoS 控制字段只出现在 QoS Data 帧中（①）；持续时间覆盖的是随后的短帧间间隔与确认帧，与帧头多出的字节无关。',
    },
    {
      heading: '这个房间里写的是哪些 TID',
      jump: 2,
      steps: [
        '跳到第一个 A-MPDU（笔记本的云备份），展开其中一帧的 QoS 控制字段。',
        '在编辑器里把旧笔记本改为 Wi-Fi 5 后载入，读出它第一帧的 QoS 控制字段。',
        '恢复本课场景，在编辑器里关闭手机的 EDCA 开关后载入，读出手机第一帧的子类型。',
      ],
      blocks: [
        { kind: 'table', heading: '各设备写入的 QoS 控制字段', head: ['设备', '接入类别', 'TID', '确认策略'], rows: [
          ['手机（语音通话）', '语音', '6', 'Normal Ack'],
          ['笔记本（云备份，A-MPDU）', '背景', '1', 'Implicit BAR'],
          ['旧笔记本（802.11a）', '无', '不带 QoS 控制字段', '无'],
          ['旧笔记本改为 Wi-Fi 5（A-MPDU）', '尽力而为', '0', 'Implicit BAR'],
          ['手机关闭 EDCA', '无', '不带 QoS 控制字段', '无'],
        ] },
      ],
      expect: '语音写 6、背景写 1、尽力而为写 0：背景的编号比尽力而为大，优先级却更低。A-MPDU 中的帧写 Implicit BAR，单独发送的帧写 Normal Ack；关闭 EDCA 后，手机的帧变成不带 QoS 控制字段的 Data 帧。',
      meaning: 'TID 携带的是用户优先级（①，表 9-12、表 10-1），编号不是优先次序；每个接入类别写哪一个用户优先级，是本仿真器的取法（②）。',
    },
    {
      heading: '一帧没有被接收',
      jump: 3,
      steps: [
        '跳到旧笔记本的第一次重发（12.013 ms），再回到 11.650 ms 处同一序号的原帧。',
        '读出原帧之后的记录：路由器一侧没有接收记录，也没有确认帧；旧笔记本确认超时。',
        '运行满 30 ms，统计所有接收失败记录的原因。',
      ],
      blocks: [
        { kind: 'table', heading: '30 ms 内的接收失败记录', head: ['原因', '次数'], rows: [
          ['碰撞（collision）', '2'],
          ['信号太弱（lowSinr）', '0'],
          ['接收端正在发送（txDuringRx）', '0'],
          ['接收机已转去同步更强的帧（capture）', '0'],
        ] },
      ],
      expect: '原帧与笔记本的请求发送（request to send, RTS）帧同时开始发送，路由器没有接收，也没有回复；旧笔记本确认超时后退避，在 12.013 ms 以序号 11、重发比特 1 重发。30 ms 内的 2 次接收失败都是碰撞，没有一次是校验失败。',
      meaning: '“不接收就不确认，等不到确认就重发”照标准（①）。本仿真器按信干噪比判定接收，从不计算 CRC，所以失败原因中没有校验失败这一类（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§9.2.4.5.1 与表 9-10（QoS 控制字段）、§9.2.4.5.2 与表 9-12（TID）、§10.2.3.2 与表 10-1（用户优先级到接入类别的映射）、§9.2.4.5.4 与表 9-13（确认策略）、§9.2.4.9（FCS）、§9.2.2（“接收”的含义）、§10.3.2.11（确认过程）、§10.23.2.12.1（重发时的重发比特）、§9.2.4.4.3（序号）。',
    '本仿真器的取值与取法：每个接入类别写一个 TID（背景 1、尽力而为 0、视频 5、语音 6，src/model/frameFields.ts 的 TID_FOR_AC）；不计算 CRC；按整帧最差时刻的信干噪比判定接收（src/engine/channel.ts）。各个时刻与次数都是本课场景的实测值。',
  ],
  limits: [],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个 QoS 数据帧', firstQosSingle),
    J('第一个传统数据帧', firstLegacyData),
    J('第一个 A-MPDU', firstAmpduFrame),
    J('第一次重发（重发比特 = 1）', firstLegacyRetry),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一帧到达了，但它比周围的干扰弱得多，接收端无法正确解码。按标准，接收端会怎么做？',
      options: [
        '照常回复确认帧，由上层自行发现错误',
        '回复一条差错报告，指明哪个字段出错',
        '不回复任何帧——发送端等不到确认帧，就会退避后重发',
      ],
      answer: 2,
      explain: '§9.2.2：只有通过 FCS 校验的帧才算接收；§10.3.2.11：接收端只为接收的帧回复确认帧，发送端等不到确认帧就判定失败。',
    },
    {
      q: '背景类的 TID 写 1，尽力而为类写 0。哪一类的优先级更高？',
      options: [
        '背景类：编号更大，优先级更高',
        '尽力而为类：表 10-1 中用户优先级 1 和 2 排在 0 之前，是最低的两档',
        '两者相同：TID 与优先级无关',
      ],
      answer: 1,
      explain: 'TID 携带用户优先级，表 10-1 按优先级从低到高是 1、2、0、3、4、5、6、7。',
    },
    {
      q: '哪一项是本仿真器与标准不同之处？',
      options: [
        '单独发送的 QoS 数据帧写 Normal Ack',
        '重发时把重发比特置 1',
        '一帧是否被接收由信干噪比决定，从不计算 FCS',
      ],
      answer: 2,
      explain: '另外两项照标准（①）；标准用 32 位 CRC 定义“接收”，本仿真器不计算它（②）。',
    },
  ],
}
