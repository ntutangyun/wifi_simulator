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
 * What it takes with it: the QoS Control paragraph, the four-category table,
 * the check at the end, both experiments (the phone's EDCA switch, the old
 * laptop as a Wi-Fi 5 device) and the quiz about a frame that never arrives.
 * §4 gives it no figure of its own: the fields figure of the lesson before it
 * is the picture, and what changes here is two octets inside it.
 *
 * The honest note about what this engine does instead of a CRC is `deeper`,
 * where its evidence is: nothing in src/engine computes one.
 *
 * Every number quoted below is pinned in tests/course/frame-qos-fcs.test.ts.
 */
import { J, type Lesson } from '../lessonKit'
import { frameAnatomyScenario, firstLegacyData, firstQosSingle } from './frame-anatomy'

export const frameQosFcs: Lesson = {
  id: 'frame-qos-fcs',
  module: 2,
  title: '业务标记与帧校验',
  why: '上一课讲完了每一帧都有的那 24 个字节。还有两部分没有讲：现在的设备会在帧头（MAC header）中多插入两个字节，指明这一帧属于哪一类业务；每一帧的末尾则固定有四个字节，用来检验它是否完好到达。前者是服务质量（quality of service, QoS）控制字段，标明这一帧属于四类业务中的哪一类——这个编号称为业务标识（traffic identifier, TID）——以及它希望以何种方式被确认，即确认策略（Ack Policy）。这些编号只是标识，不代表优先次序：背景的编号比尽力而为大，但优先级较低的却是背景。这两个字节就是普通数据帧（data frame）与带标记数据帧的全部区别，帧的持续时间（Duration/ID）字段写的仍是同一个值。后者是帧校验序列（frame check sequence, FCS）：在标准中，发送端对前面所有内容计算一次循环冗余校验（cyclic redundancy check, CRC），接收端按同样方法计算后再比对；本仿真器从不计算它，判定一次接收成败的依据是整帧到达时的比值是否达到所用速率等级的要求。无论采用哪种判定，未能正确接收的帧都得不到任何应答——接收端连地址都无法读出，应答只能是猜测；发送端等不到应答，就以同一个序列号、把重发比特（Retry bit）置位，再发送一次。',
  outcomes: [
    '识别一帧是否带有业务标记，并读出它标明的类别',
    '说出帧尾那四个字节的作用，以及本仿真器实际依据什么判定一次接收',
    '说明一帧未能正确接收时会发生什么——以及为什么接收端不作任何应答',
  ],
  needs: ['frame-anatomy'],
  terms: [
    { term: 'QOS', plain: '服务质量：帧头中标明业务类别的两个字节' },
    { term: 'TID', plain: '业务标识：这两个字节中写入的编号，说明这一帧属于哪一类业务' },
  ],
  picture: [
    { heading: '业务类别标记', text: '一次语音通话和一次文件上传对网络的要求不同，所以现在的客户端设备——站点（STA）——会在帧头中再加两个字节，写入一个业务标记——服务质量（quality of service, QoS）控制字段：标明这一帧属于四类业务中的哪一类——这个编号称为业务标识（traffic identifier, TID）——以及它希望以何种方式被确认。这两个字节，就是普通数据帧（data frame）与带标记数据帧的全部区别。' },
    { kind: 'watch', jump: 0, heading: '对比两帧', text: '载入仿真，跳到第一个 QoS 数据帧，展开“空中字段”；再跳到旧笔记本的第一帧。方向相同、地址角色相同、持续时间（Duration/ID）都是 44 µs——区别只在那一个字段。' },
    { heading: '帧尾的校验', text: '每一帧的末尾都是四个字节的帧校验序列（frame check sequence, FCS）。在标准中，接收端用它来检验这一帧：发送端对前面所有内容执行一次固定的运算，即循环冗余校验（cyclic redundancy check, CRC），接收端按同样方法计算后再比对。本仿真器从不计算它——这里判定一次接收成败的依据是这一帧到达时的比值：整帧都必须达到所用速率等级的要求。无论采用哪种判定，未能正确接收的帧都得不到任何应答。' },
  ],
  numbers: [
    { kind: 'table', heading: '四类业务，四个标记', head: [
      '业务类别', '对应的用户优先级', 'TID',
    ], rows: [
      ['背景', '1, 2', '1'],
      ['尽力而为', '0, 3', '0'],
      ['视频', '4, 5', '5'],
      ['语音', '6, 7', '6'],
    ] },
    { text: '这些数字只是标识，不代表优先次序：背景是 1、尽力而为是 0，但优先级较低的恰恰是背景。这个房间里的手机正在通话，所以它的帧标的是 6；那台用 Wi-Fi 5 做备份的笔记本标的是 1——背景。' },
    { kind: 'steps', heading: '一帧未能正确接收时，这一轮交换如何结束', items: [
      '发送端在 QoS 控制的另外两个比特里写上确认策略（Ack Policy）。单独一帧上写的是 Normal Ack：收到后立即确认。',
      '接收端不计算那四个字节。本仿真器检查的是整帧到达时的比值，达到这一级的要求才算正确接收，否则记录一条 RX_FAIL——原因只可能是干扰、信号太弱、接收端自身正在发送，或者接收机已转去同步更强的帧。',
      '未能接收就不作任何应答：地址那几个字节同样无法读出，应答只能是猜测。',
      '发送端等不到应答，于是以同一个序列号、把重发比特（Retry bit）置 1，再发送一次——12.013 ms 处的那一帧就是这样产生的。',
    ] },
  ],
  deeper: [
    { heading: '这台引擎里没有一次 CRC', text: 'src/engine 下没有任何一个文件去算 MPDU 的校验：FCS_BYTES 只是一个字节数，参与的是长度，不是判定。一次接收的成败在 channel.ts 中由最差的比值与该级要求的比较决定，所以在整个课程中，读者能看到的失败原因只有 collision、lowSinr、txDuringRx 和 capture 四种。本课特意指出这一点，是因为“校验失败所以重发”听起来理所当然，而这个房间里从来没有发生过。' },
    { heading: '聚合帧中，同样这两个比特含义不同', text: 'QoS 控制里的确认策略，在单独一帧上读作 Normal Ack；在聚合帧中，同样这两个比特的含义是 Implicit Block Ack Request——十四帧只需一个应答，依靠的就是它。这部分在两课之后讲。' },
  ],
  limits: [
    { kind: 'unmodelled', text: 'src/engine 下没有任何一处计算 MPDU 的校验：FCS_BYTES 只是一个字节数，参与的是长度而不是判定。一次接收的成败由整帧最差的信干噪比与该级要求的比较决定，所以读者能看到的失败原因只有 collision、lowSinr、txDuringRx 与 capture 四种。真实接收端会遇到「比值足够、校验却失败」的帧——射频损伤、相位噪声、突发干扰都可能造成这种情况，而这个房间里一次也没有出现。' },
    { kind: 'threshold', text: '整帧共用一个判决：引擎用这一帧全程最差时刻的干扰与门限比较（channel.ts 的 resolveLock 用 maxInterfMw），所以只受到几微秒干扰的一帧，与全程受到干扰的一帧结果完全相同。真实系统中的纠错编码加上交织，正是为了使短暂的干扰仍能被纠正；因此门限附近的结果是概率性的，而不是确定的。' },
    { kind: 'unmodelled', text: '这两个字节中只有两项真正起作用：TID 与确认策略（frameFields.ts）。同一字段中的 TXOP 时长请求、队列长度、EOSP 与 A-MSDU 存在位都没有对应的模型。真实设备正是通过队列长度这一子字段让接入点知道自己还积压了多少上行数据，接入点的上行调度才有依据。' },
    { kind: 'model-value', text: '四类业务各写哪个 TID（背景 1、尽力而为 0、视频 5、语音 6）是本仿真器在标准给出的区间中各选了一个（frameFields.ts 的 TID_FOR_AC）。标准规定的是用户优先级到接入类别的映射区间，具体写哪个值由实现决定，所以同一业务在其他厂商的设备上可能标为 2 或 4。' },
  ],
  sources: [
    'QoS 控制字段见 IEEE Std 802.11-2024 §9.2.4.5，确认策略见其中的表 9-16；FCS 见 §9.2.4.7，它是对帧头与帧体计算的 CRC-32。',
    '用户优先级到接入类别的映射、以及各自写入的 TID，见表 10-1；本仿真器写入的取值是：背景 1、尽力而为 0、视频 5、语音 6。',
    '“接收端不作应答，发送端据此重发”这条规则见 §10.3.2.9。本仿真器不计算 FCS，这是模型的取舍，不是标准的规定——上面每一个时刻和取值，都是在本课场景中实测得到的。',
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个 QoS 数据帧', firstQosSingle),
    J('第一个传统数据帧', firstLegacyData),
  ],
  observe: [
    '第一个 QoS 数据帧于 20.452 ms 由手机发出。它的 QoS 控制字段写着“TID 6 · Normal Ack”：语音，收到后立即确认。',
    '旧笔记本的第一帧（0 µs）中没有这个字段——它的帧头是 24 B，手机那一帧是 26 B。两帧的持续时间都是 44 µs：这个字段预留的是帧后那段间隔加上确认帧（acknowledgement, ACK）的时间，与帧头多出的这两个字节无关。',
  ],
  tryThis: [
    '在编辑器里打开本场景，把手机的增强型分布式信道接入（EDCA）开关关掉，也就是控制服务质量标记的那个开关。它的帧变成普通 Data 帧：QoS 控制字段消失，业务标记也随之消失。',
    '把旧笔记本改成 Wi-Fi 5。它上传的帧现在带有标记，标记值为 0——尽力而为，因为备份不是通话。帧头的其他部分保持不变。',
  ],
  quiz: [
    {
      q: '一帧到达了，但它比周围的干扰弱得多，接收端无法解码。接收端会怎么做？',
      options: [
        '照常应答，由上层自行发现错误',
        '回复一条差错报告，指明哪个字段出错',
        '不作任何应答——发送端等不到应答，就会再发送一次',
      ],
      answer: 2,
      explain: '对于未能正确接收的帧，地址那几个字节同样无法读出，应答只能是猜测。不应答本身就是全部机制：收不到应答，就重发。',
    },
    {
      q: '把手机的业务标记关掉之后，它的帧头少了什么？',
      options: [
        '少了两个字节的 QoS 控制——这一帧从此不属于任何一类业务',
        '少了四个字节的校验：不带标记的帧不需要校验',
        '没有减少任何字段，只是 TID 变为 0',
      ],
      answer: 0,
      explain: '那两个字节就是普通 Data 帧与 QoS Data 帧的全部区别：没有这两个字节，帧头恢复为 24 B，网络也就无法知道这一帧是通话还是备份。',
    },
  ],
}
