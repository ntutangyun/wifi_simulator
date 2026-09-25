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
  title: '一个业务标记，和一个校验',
  why: '上一课走完了每一帧都有的那 24 个字节。还剩两处没讲：现在的设备会在帧头（MAC header）里多插两个字节，说清这一帧属于哪一类业务；每一帧的末尾则固定有四个字节，用来说明它是完好到达的。一个决定它在别人前面还是后面，另一个决定它算不算到过。',
  outcomes: [
    '认出一帧有没有带业务标记，并读出它标的是哪一类',
    '说出帧尾那四个字节是干什么的，以及本仿真器实际上拿什么判定一次接收',
    '讲清一帧没能收下来时会发生什么——以及为什么接收端什么都不回',
  ],
  needs: ['frame-anatomy'],
  terms: [
    { term: 'QOS', plain: '服务质量：帧头里说明业务类别的那两个字节' },
    { term: 'TID', plain: '业务标识：那两个字节里写的那个编号，说明这一帧属于哪一类业务' },
  ],
  picture: [
    { heading: '给业务类别打的那个标记', text: '一通语音通话和一次文件上传，对网络的要求并不相同，所以现在的客户端设备——站点（STA）——会在帧头里再加两个字节，写上一个业务标记——服务质量（quality of service, QoS）控制字段：这一帧属于四类业务中的哪一类——那个编号叫业务标识（traffic identifier, TID）——以及它希望被怎样确认。这两个字节，就是普通数据帧（data frame）与带标记数据帧的全部差别。' },
    { kind: 'watch', jump: 0, heading: '把两帧摆在一起', text: '载入仿真，跳到第一个 QoS 数据帧，展开“空中字段”；再跳到旧笔记本的第一帧。方向相同、地址角色相同、持续时间（Duration/ID）都是 44 µs——差别只有那一个字段。' },
    { heading: '末尾的那个校验', text: '每一帧的末尾都是四个字节的帧校验序列（frame check sequence, FCS）。在标准里，接收端拿它来检验这一帧：发送端把前面所有内容过一遍固定的算术，也就是循环冗余校验（cyclic redundancy check, CRC），接收端照样算一遍再比对。本仿真器从不去算它——这里判定一次接收成不成的，是这一帧到达时的比值：整帧都要够它那一级的要求。不论哪条路，没能收下来的帧得到的回应都是什么都没有。' },
  ],
  numbers: [
    { kind: 'table', heading: '四类业务，四个标记', head: [
      '业务类别', '它涵盖的优先级', 'TID',
    ], rows: [
      ['背景', '1, 2', '1'],
      ['尽力而为', '0, 3', '0'],
      ['视频', '4, 5', '5'],
      ['语音', '6, 7', '6'],
    ] },
    { text: '这些数字是名字，不是次序：背景是 1、尽力而为是 0，可该让路的偏偏是背景。这个房间里的手机正在通话，所以它的帧标的是 6；那个用 Wi-Fi 5 做备份的笔记本标的是 1——背景。' },
    { kind: 'steps', heading: '一帧没能收下来，这一轮是怎么结束的', items: [
      '发送端在 QoS 控制的另外两个比特里写上确认策略（Ack Policy）。单独一帧上写的是 Normal Ack：收到了就立刻回一个。',
      '接收端不去算那四个字节。本仿真器看的是整帧到达时的比值，够这一级的要求才算收下，否则记一条 RX_FAIL——原因只会是干扰、太弱、自己正在发，或者被更强的帧压住。',
      '没收下就什么都不回：地址那几个字节也一样读不出，回它等于瞎猜。',
      '发送端等不到那个回复，于是带着同一个序列号、把重发比特（Retry bit）置 1，再发一次——12.013 ms 那一帧就是这么来的。',
    ] },
  ],
  deeper: [
    { heading: '这台引擎里没有一次 CRC', text: 'src/engine 下没有任何一个文件去算 MPDU 的校验：FCS_BYTES 只是一个字节数，参与的是长度，不是判定。一次接收的成败在 channel.ts 里由最差的那个比值对上该级的要求决定，所以整个课程里，一个读者能看到的失败原因只有 collision、lowSinr、txDuringRx 和 capture 四种。这门课把这件事说破，是因为“校验不过所以重发”听上去太顺了，而这个房间里从来没发生过。' },
    { heading: '聚合之后，同样这两个比特换了意思', text: 'QoS 控制里的确认策略，在单独一帧上读作 Normal Ack；同样这两个比特放进一串聚合帧里，含义是 Implicit Block Ack Request——十四帧只换回一个回复，靠的就是它。那是再往后两课的事。' },
  ],
  sources: [
    'QoS 控制字段见 IEEE Std 802.11-2024 §9.2.4.5，确认策略见其中的表 9-16；FCS 见 §9.2.4.7，它是对帧头与帧体计算的 CRC-32。',
    '用户优先级到接入类别的映射、以及各自写入的 TID，见表 10-1；本仿真器写入的取值是：背景 1、尽力而为 0、视频 5、语音 6。',
    '“接收端什么都不回，发送端据此重发”这条规则见 §10.3.2.9。本仿真器不计算 FCS，这是模型的取舍，不是标准的说法——上面每一个时刻和取值，都是在本课场景里实测出来的。',
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个 QoS 数据帧', firstQosSingle),
    J('第一个传统数据帧', firstLegacyData),
  ],
  observe: [
    '第一个 QoS 数据帧在 20.452 ms，是手机发出去的。它的 QoS 控制字段写着“TID 6 · Normal Ack”：语音，收到就立刻确认。',
    '旧笔记本的第一帧（0 µs）里根本没有这个字段——它的帧头是 24 B，手机那一帧是 26 B。两帧的持续时间都是 44 µs：这两个字节没有占掉更多空口时间（airtime）。',
  ],
  tryThis: [
    '在编辑器里打开本场景，把手机的增强型分布式信道接入（EDCA）开关关掉，也就是那个服务质量标记。它的帧变成普通 Data 帧：QoS 控制字段没有了，业务标记也跟着没有了。',
    '把旧笔记本改成 Wi-Fi 5。它的上传现在是带标记的帧了，标记写的是 0——尽力而为，因为备份不是通话。帧头的其他部分则纹丝不动。',
  ],
  quiz: [
    {
      q: '一帧到了，可它比周围的干扰弱得太多，接收端读不出来。它会怎么做？',
      options: [
        '照样作答，让上层自己去发现',
        '回一条抱怨，指明是哪个字段坏了',
        '什么也不做——发送端等不到回复，就会再发一次',
      ],
      answer: 2,
      explain: '没能收下来的帧，地址那几个字节也一样读不出，回它就成了瞎猜。沉默本身就是全部机制：没有回复，就重发。',
    },
    {
      q: '把手机的业务标记关掉之后，它的帧头少了什么？',
      options: [
        '少了两个字节的 QoS 控制——这一帧从此不属于任何一类业务',
        '少了四个字节的校验：不打标记的帧不必校验',
        '什么都没少，只是 TID 变成了 0',
      ],
      answer: 0,
      explain: '那两个字节就是普通 Data 帧与 QoS Data 帧的全部差别：没有它，帧头回到 24 B，网络也就不知道这一帧是通话还是备份。',
    },
  ],
}
