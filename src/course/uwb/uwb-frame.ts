/**
 * UWB Tier 1 · M11 · Time of flight · What a ranging frame is made of.
 *
 * The second half of the old `uwb-intro`: the anatomy of a ranging frame, why
 * each field is there, and where inside it the RMARKER falls. It loads exactly
 * the scene `uwb-intro` loads — same builder, same variant — so the split adds
 * no new scenario and the recorded hashes of `uwb-frame` are `uwb-intro`'s.
 *
 * Every number quoted below is pinned in tests/course/uwb-frame.test.ts.
 */
import { J, firstUwbPoll, firstUwbResp, type Lesson } from '../lessonKit'
import { uwbIntroScenario } from './uwb-intro'

export const uwbFrame: Lesson = {
  id: 'uwb-frame',
  module: 11,
  title: '一帧测距帧由什么组成',
  why: '一帧测距帧几乎不携带数据，却很长——比一个 Wi-Fi 的确认帧长得多。它的每一段都有自己存在的理由：有的段让接收端先锁住信号，有一段钉死了到底该在哪一刻打时间戳，还有一段让这个时刻无法被伪造。把这些段认全了，你也就知道 RMARKER 在哪儿、为什么在那儿。',
  outcomes: [
    '说出一帧测距帧的五个组成部分，并讲清每一部分是干什么的',
    '在这一帧自己的时间轴上指出 RMARKER 的位置',
    '解释为什么消息占的空口时间比引出它的那段图案还少',
  ],
  needs: ['uwb-intro'],
  terms: [
    { term: 'SYNC', plain: '帧头上一长串已知的脉冲图案，用处是让接收端找准节拍' },
    { term: 'SFD', plain: '帧起始定界符：一小段图案，宣告“节拍到此为止”' },
    { term: 'STS', plain: '加扰时间戳序列：一段只有本次会话那两台射频才能预测出来的脉冲' },
    { term: 'PHR', plain: '物理头：说明后面的消息有多长、用多快的速率编码' },
    { term: 'PSDU', plain: '消息本身——这次交互真正需要说的那几个字节' },
    { term: 'chip', plain: '一个脉冲的时长，是这台射频在时间上能摆放的最小单位' },
  ],
  picture: [
    { heading: '先锁住，再去听', text: '接收端在找到脉冲落在哪里之前，什么也解不出来。所以一帧测距帧的开头是一长串图案已知的脉冲——SYNC 字段——接收端拿自己手里的同一份副本去滑动比对，直到两者对齐。紧接着是帧起始定界符（SFD）：另一段很短、也不一样的图案，它唯一的任务就是宣布 SYNC 到此结束。从这道边沿往后，两端数的就是同一个起点了。' },
    { heading: '一段谁也伪造不了的序列', text: '如果攻击者能把你用来计时的那一段原样重放，他就能让你以为一辆锁着的车比实际更近。所以帧里还带着一段加扰时间戳序列（STS）：一段由密钥生成的脉冲，而这把密钥只有本次会话的那两台射频握有。接收端知道接下来该是什么，因此能给它计时；别人看到的只是噪声，也造不出提前的版本。这里的安全性是一种计时上的性质，而不是对消息做加密。' },
    { kind: 'watch', jump: 0, heading: '把这条带子从左读到右', text: '载入仿真，跳到 Poll 帧，再在帧细节视图里把它打开。把那条彩色的带子从左读到右，每读到一段就说出它是什么。这条带子的刻度是码片（chip）：一个脉冲的时长，也是这台射频在时间上能摆放的最小单位。' },
    // "Two words, two sizes" stood here until the step-1 fix wave: 75 words reconciling a
    // table that counted some fields in symbols and others in chips. Every Field cell of
    // that table now gives its chips, so the paragraph had nothing left to explain.
    { heading: '头部与消息', text: '到这里，这一帧才第一次真正开口说话。物理头（PHR）交代消息有多长、用多快的速率编码，这两件事接收端必须先知道，才读得懂哪怕一个比特。再往后是消息本身（PSDU）：Poll 帧里三十个字节，应答帧里二十个。再没有别的要发了。一帧测距帧不是用来搬运数据的，它是用来在时间上占住一个确定位置的。' },
    { heading: '两个时隙，一轮测距', text: '这两帧本来可以挨得更近，但会话不让。它把时间切成等长的时隙，一帧给一个：Poll 在第一个，应答在第二个；哪怕应答早就准备好了，也要等到自己那个时隙的开头才出发。一个时隙里大部分时间是静默的，而这是有意为之——正是这张固定的格子，让日后许多设备能共用同一个房间。' },
    { kind: 'steps', heading: '整帧的顺序', items: [
      'SYNC，那一长串已知图案',
      'SFD，结束它的那一小段标记',
      'RMARKER：SFD 之后的第一个码片',
      'STS，夹在两段短间隔之间',
      'PHR',
      'PSDU',
    ] },
    { heading: '时间戳打在哪里', text: '时间戳之前的一切，是为了让两台射频都锁住信号；它之后的一切，是这一帧要证明和要说的内容。把时间戳打在帧首，接收端那时还没锁住；打在帧尾，两端计的就不是同一件事了。整帧里，只有这一道边沿双方都能精确到码片零头地说清楚——所以时间戳就打在这里。' },
  ],
  numbers: [
    { kind: 'table', heading: '197.628 µs 由什么组成', head: [
      '字段', '时长', '作用',
    ], rows: [
      ['SYNC，64 个前导符号 × 508 码片 = 32 512 码片', '65.128 µs', '捕获并锁定定时'],
      ['SFD，8 个前导符号 × 508 码片 = 4064 码片', '8.141 µs', '确定 RMARKER 的位置'],
      ['STS 间隔，512 码片', '1.026 µs', '静默'],
      ['STS，64 × 512 = 32 768 码片', '65.641 µs', '无法伪造的定时序列'],
      ['STS 间隔，512 码片', '1.026 µs', '再一次静默'],
      ['PHR，19 个符号 × 512 码片 = 9728 码片', '19.487 µs', '长度与数据速率'],
      ['PSDU，30 个字节：290 个符号 × 64 码片 = 18 560 码片', '37.179 µs', 'Poll 帧本身，整帧的最后一段'],
      ['整帧 Poll', '197.628 µs', '结构 160.449 µs，消息 37.179 µs'],
    ] },
    { kind: 'formula', heading: 'RMARKER 落在哪儿', text: 'SYNC 65.128 µs + SFD 8.141 µs = 帧内 73.269 µs', note: '在那串图案、以及结束它的那个标记之后，在其余一切之前——应答帧的搭法完全相同，它的 RMARKER 落在同一个偏移上。' },
    { kind: 'steps', heading: '这一帧上的时间戳是怎么取下来的', items: [
      '发送端按上表那个固定顺序把帧搭起来：64 个 SYNC 前导符号、8 个 SFD 符号、夹在两段 512 码片间隔中间的 STS、PHR，最后才是 PSDU——整帧里只有这一段的长度由消息本身决定。',
      '从整帧的第一个码片起数出 73.269 µs，在那一刻读一次自己的测距计数器。这个读数随帧一起发出，也就是日志里那条 TX RMARKER。',
      '接收端把整个 SYNC 字段累加起来——同一个前导符号重复的那 64 遍——相比只用一个符号，这一步值 18.1 dB，也正是它能把一道边沿定位到码片零头的原因。',
      '它找到 SFD，把紧随其后的第一个码片当作 RMARKER：这和发送端数到的是同一个瞬间。',
      '它在那一刻读自己的计数器：真实到达的时刻，加上它对首径边沿估计偏掉的那一点（本链路上 1σ 是 100 ps），再按 15.650 ps 一格取整。',
      '帧里后面的内容再也动不了这个时间戳。STS、PHR、PSDU 照样要校验、要读，但时间戳已经取完了。',
    ] },
    { kind: 'table', heading: 'Poll 帧与应答帧', head: [
      '帧', '消息', '净荷', '整帧',
    ], rows: [
      ['Poll', '30 octets', '37.179 µs', '197.628 µs'],
      ['Response', '20 octets', '26.923 µs', '187.372 µs'],
    ] },
    { text: '这一轮占用的两个 2 ms 时隙里，真正有帧在传的只有 385 µs。' },
    { kind: 'formula', heading: '为什么 30 个字节要花 37.179 µs', text: '240 个数据比特 + 48 个校验比特 + 2 个符号的尾 = 290 个符号 × 64 码片', note: '按 6.81 Mb/s 算，光是消息本身只要 35.2 µs 的空口时间。净荷的开销大头是编码，不是消息。' },
  ],
  sources: [
    '上表里每一个时长，都出自第 16 章（IEEE Std 802.15.4-2024 的 HRP UWB PHY）的字段名称、符号数与码片数。',
    'RMARKER 被定义为 SFD 之后的第一个码片，见 §10.29.1.1；把 STS 放在 SFD 与 PHR 之间的 SP1 分组配置见 §10.32。',
    '2 ms 的测距时隙来自 FiRa，不是标准正文。30 字节的 Poll 与 20 字节的应答是本仿真器对一次最小交互的模型取值，标准正文并没有把帧长钉死。',
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '相距 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧离开手机', firstUwbPoll),
    J('锚点作答', firstUwbResp),
  ],
  observe: [
    '整体看手机这条泳道：Poll 在第一个时隙，Response 在第二个，而第二个时隙恰好从 2 000 000 ns 开始。一轮里绝大部分时间是静默的。',
    '在帧细节视图里打开 Poll 帧，把那条带子从左读到右。最后读到的一段是 PSDU，它比开头那一长串 SYNC 还短——尽管它才是唯一装着消息的部分。',
  ],
  tryThis: [
    '自己把算术做一遍。从日志里抄出四个计数值，分别相减得到两个差，取其差的一半，再乘以 15.650 ps、乘以 0.299792458 m/ns。你应该得到 1070 RCTU 与 5.02 m——也就是测距行里的 raw 值，而不是修正后的值。',
  ],
  quiz: [
    {
      q: '时间戳是在帧的什么位置读取的？',
      options: [
        '在 SYNC 的第一个码片',
        '在 RMARKER，即 SFD 之后的第一个码片——距帧首 73.269 µs',
        '在 PSDU 结束时，也就是确认帧正确之后',
      ],
      answer: 1,
      explain: '经过 65.128 µs 的 SYNC 与 8.141 µs 的 SFD，两端都已锁定脉冲序列。时间线上的 TX_START 比它早 73.269 µs，而计数值并非如此。',
    },
    {
      q: 'STS 是用来做什么的？',
      options: [
        '它承载测距消息，好让净荷短一些',
        '它给接收端一段可以计时的内容，而外人既预测不出、也没法提前发出',
        '它让接收端找准节拍',
      ],
      answer: 1,
      explain: '找节拍是 SYNC 的活儿。STS 由会话持有的密钥生成，重放它的攻击者永远只会更晚，因此测出的距离没法被外人缩短。',
    },
    {
      q: '为什么消息在一帧测距帧里只占这么一点？',
      options: [
        '因为速率太高，再长的消息也只占一点点时间',
        '因为这一帧存在的意义是被计时，而不是搬运数据',
        '因为标准把测距净荷的上限定在三十个字节',
      ],
      answer: 1,
      explain: 'Poll 帧要说的只是“谁在问、这是第几轮”，30 个字节就够了。比它长的那些部分，存在的理由是把帧里那一个瞬间钉准。',
    },
  ],
}
