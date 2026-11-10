/**
 * UWB Tier 1 · M11 · Time of flight · What a ranging frame is made of.
 *
 * The second half of the old `uwb-intro`: the anatomy of a ranging frame, why
 * each field is there, and where inside it the RMARKER falls. It loads exactly
 * the scene `uwb-intro` loads — same builder, same variant — so the split adds
 * no new scenario and the recorded hashes of `uwb-frame` are `uwb-intro`'s.
 *
 * Every number quoted below is pinned in tests/course/uwb-frame.test.ts.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M13). It **stays whole** — the field walk and the RMARKER procedure are
 * one question, "where is the time taken and why there" — and this lesson is the
 * pair the readability programme was written against, so it is touched only
 * where the plan requires:
 *  - §4 gives it a `fields` figure, and the figure replaces prose: the six-item
 *    list 「整帧的顺序」 is gone (§5.4), and the paragraph that opened
 *    「时间戳之前的一切…之后的一切…」 with it, because the figure and its caption
 *    carry both. What is left of that paragraph is the part no picture can show:
 *    why not at the frame's start, and why not at its end.
 *  - the STS teaser is one line (§5.1 · 10); `uwb-sts` owns it.
 *  - the slot teaser is one line (§5.1 · 10); `uwb-blocks` owns the grid, and
 *    the term is now written 测距时隙（ranging slot）, which is what 时隙 means in
 *    this track.
 * Nothing else moves: the durations, the two `steps`, both tables and the
 * register are as they were.
 */
import type { FieldsSpec } from '../diagram'
import { J, firstUwbPoll, firstUwbResp, type Lesson } from '../lessonKit'
import {
  DATA_SYMBOL_CHIPS, PHR_SYMBOLS, PHR_SYMBOL_CHIPS, PSYM_CHIPS, SFD_SYMBOLS,
  STS_ACTIVE_CHIPS, STS_GAP_CHIPS, SYNC_SYMBOLS, chipsToNs, psduSymbols, uwbPollBytes,
} from '../../uwb/phy'
import { uwbIntroScenario } from './uwb-intro'

/** One segment of the poll, in microseconds — `chipsToNs` of the chip count the PHY gives it. */
const us = (chips: number): number => Math.round(chipsToNs(chips)) / 1000

/**
 * The poll from left to right, each box as wide as the field is long. The chip
 * counts are the PHY's own constants, so a figure cannot drift from the frame
 * the engine builds, and the third box is the 512-chip silence after the SFD
 * whose first chip is the RMARKER — which is why the stamp is drawn there.
 */
export function uwbFrameFields(): FieldsSpec {
  const psdu = us(psduSymbols(uwbPollBytes(1)) * DATA_SYMBOL_CHIPS)
  const sfd = us(SFD_SYMBOLS * PSYM_CHIPS)
  const gap = us(STS_GAP_CHIPS)
  const phr = us(PHR_SYMBOLS * PHR_SYMBOL_CHIPS)
  // A box too narrow to hold its own duration carries it in the label instead, so every
  // field in the figure states its length; the widest three print it under their name.
  const fields = [
    { label: 'SYNC', size: us(SYNC_SYMBOLS * PSYM_CHIPS) },
    { label: `SFD ${sfd.toFixed(3)} µs`, size: sfd },
    { label: '↓RMARKER', size: gap },
    { label: 'STS', size: us(STS_ACTIVE_CHIPS) },
    { label: `间隔 ${gap.toFixed(3)} µs`, size: gap },
    { label: `PHR ${phr.toFixed(3)} µs`, size: phr },
    { label: 'PSDU', size: psdu },
  ]
  const total = fields.reduce((n, f) => n + f.size, 0)
  return {
    kind: 'fields',
    fields,
    unit: 'µs',
    total: `整帧 ${total.toFixed(3)} µs：结构 ${(total - psdu).toFixed(3)}，消息 ${psdu.toFixed(3)}`,
  }
}

export const uwbFrame: Lesson = {
  id: 'uwb-frame',
  module: 14,
  title: '一帧测距帧由什么组成',
  why: '一帧测距帧几乎不携带数据，却很长——比一个 Wi-Fi 的确认帧（ACK）长得多，因为其中大部分是帧结构，而不是消息内容。开头是一长串图案已知的脉冲，供接收端滑动相关、锁定定时；紧随其后的一小段图案只用于标示同步结束。这一边界之后的第一个码片（chip），就是收发两端约定共同打时间戳的 RMARKER（ranging marker）：在它之前接收端尚未完成同步，在它之后的内容不再影响这个时刻。再往后，一段由密钥（key）生成、只有本次会话两端能够预测的脉冲序列使这个位置无法伪造；物理头（PHY header, PHR）说明消息的长度和速率；最后才是几十个字节的消息本身——帧的长度主要用于同步和编码。两帧各占一个等长的测距时隙（ranging slot），即使应答早已准备好，也要等到自己时隙的开头才发送，所以一轮测距中真正有帧在传输的只是一小部分时间。',
  outcomes: [
    '说出一帧测距帧的五个组成部分，并说明每一部分的作用',
    '在这一帧自己的时间轴上指出 RMARKER 的位置',
    '解释为什么消息占用的空口时间（airtime）比位于它之前的同步图案还少',
  ],
  needs: ['uwb-intro'],
  terms: [
    { term: 'SYNC', plain: '帧头上一长串已知的脉冲图案，用于让接收端实现码片定时同步' },
    { term: 'SFD', plain: '帧起始定界符：一小段图案，标示同步字段的结束' },
    { term: 'STS', plain: '加扰时间戳序列：一段只有本次会话的两台设备才能预测的脉冲序列' },
    { term: 'PHR', plain: '物理头：说明后续消息的长度和编码速率' },
    { term: 'PSDU', plain: '消息本身——这次交互真正需要传送的那几个字节' },
    { term: 'chip', plain: '一个脉冲的时长，是这种设备在时间上安排脉冲的最小单位' },
  ],
  picture: [
    { heading: '先同步，再解调', text: '接收端在确定脉冲的位置之前，无法解调任何内容。所以一帧测距帧的开头是一长串图案已知的脉冲，也就是同步字段（SYNC）——接收端用本地保存的同一份副本进行滑动相关，直到两者对齐。这一步叫捕获（acquisition）：接收机首次检出这一帧，并从它取得自己的定时基准。紧接着是帧起始定界符（SFD）：另一段很短、图案不同的序列，它唯一的作用是标示 SYNC 结束。从这一边界开始，两端计时的就是同一个起点。' },
    { heading: '一段无法伪造的序列', text: '帧里还有一段加扰时间戳序列（STS）：一段由密钥（key）生成、只有本次会话的两台设备能够预测的脉冲序列，它使这一帧中被计时的位置无法被他人伪造。下一课专门讲解它。' },
    { kind: 'watch', jump: 0, heading: '从左到右读这条字段条带', text: '载入仿真，跳到 Poll 帧，再在帧细节视图里把它打开。从左到右阅读那条彩色的字段条带，每读到一段就说出它的名称。这条条带以码片（chip）为刻度：码片是一个脉冲的时长，也是这种设备在时间上安排脉冲的最小单位。' },
    // "Two words, two sizes" stood here until the step-1 fix wave: 75 words reconciling a
    // table that counted some fields in symbols and others in chips. Every Field cell of
    // that table now gives its chips, so the paragraph had nothing left to explain.
    { heading: '头部与消息', text: '从这里开始，这一帧才携带真正要传送的内容。物理头（PHR）说明消息的长度和编码速率，接收端必须先知道这两项，才能解出任何一个比特。再往后是消息本身，也就是 PSDU（PHY service data unit）：Poll 帧里三十个字节，应答帧里二十个字节。此外没有其他需要发送的内容。一帧测距帧的用途不是传输数据，而是在时间上标定一个确定的位置。' },
    {
      kind: 'diagram', heading: '一帧 Poll，按时长画', spec: uwbFrameFields(),
      caption: '每一格的宽度都与其时长成比例。时间戳打在第三格的第一个码片上，也就是 SFD 之后的第一个码片；它前面的两段用于完成同步，它后面的 STS、PHR 与 PSDU 不再影响这个时刻。',
    },
    { heading: '两个时隙，一轮测距', text: '这两帧本来可以靠得更近，但会话的时隙安排不允许：会话把时间划分为等长的测距时隙（ranging slot），每帧占一个——Poll 在第一个，应答在第二个，即使应答早已准备好，也要等到自己时隙的开头才发送。' },
    { heading: '为什么在这里打时间戳', text: '如果把时间戳打在帧首，接收端那时尚未完成同步；如果打在帧尾，两端计时的就不是同一事件。整帧中只有这一边界，收发双方都能以优于一个码片的精度确定——所以时间戳就打在这里。' },
  ],
  numbers: [
    { kind: 'table', heading: '197.628 µs 由什么组成', head: [
      '字段', '时长', '作用',
    ], rows: [
      ['SYNC，64 个前导符号 × 508 码片 = 32 512 码片', '65.128 µs', '捕获并锁定定时'],
      ['SFD，8 个前导符号 × 508 码片 = 4064 码片', '8.141 µs', '确定 RMARKER 的位置'],
      ['STS 间隔，512 码片', '1.026 µs', '静默'],
      ['STS，64 × 512 = 32 768 码片', '65.641 µs', '无法伪造的定时序列'],
      ['STS 间隔，512 码片', '1.026 µs', '再次静默'],
      ['PHR，19 个符号 × 512 码片 = 9728 码片', '19.487 µs', '长度与数据速率'],
      ['PSDU，30 个字节：290 个符号 × 64 码片 = 18 560 码片', '37.179 µs', 'Poll 帧本身，整帧的最后一段'],
      ['整帧 Poll', '197.628 µs', '结构 160.449 µs，消息 37.179 µs'],
    ] },
    { kind: 'formula', heading: 'RMARKER 的位置', text: 'SYNC 65.128 µs + SFD 8.141 µs = 帧内 73.269 µs', note: '位于同步图案及其结束标记之后、其余所有字段之前——应答帧的结构完全相同，它的 RMARKER 也位于同一偏移处。' },
    { kind: 'steps', heading: '这一帧的时间戳如何获得', items: [
      '发送端按上表的固定顺序组帧：64 个 SYNC 前导符号（preamble symbol）、8 个 SFD 符号（symbol）、位于两段 512 码片间隔之间的 STS、PHR，最后才是 PSDU——整帧里只有这一段的长度由消息本身决定。',
      '从整帧的第一个码片起计时 73.269 µs，在该时刻读取一次自己的测距计数器。这个读数随这一帧一起发送，也就是日志里那条 TX RMARKER。',
      '接收端对整个 SYNC 字段做累加——即同一个前导符号的 64 次重复——与只用一个符号相比，这一步带来 18.1 dB 的增益，这也正是它能把边界定位到码片以下精度的原因。',
      '接收端检测到 SFD，把紧随其后的第一个码片作为 RMARKER：这与发送端计时得到的是同一时刻。',
      '接收端在该时刻读取自己的计数器：读数等于真实到达时刻加上首径（first path）边沿的估计误差——本课在这条链路（link）上取其 1σ 为 100 ps。读数再按测距计数器的一格取整，一格是 15.650 ps，标准叫它一个 RCTU（ranging counter time unit）。',
      '帧中后续内容不再影响这个时间戳。STS、PHR、PSDU 仍然要接收和校验，但时间戳已经获取完毕。',
    ] },
    { kind: 'table', heading: 'Poll 帧与应答帧', head: [
      '帧', '消息', '载荷', '整帧',
    ], rows: [
      ['Poll', '30 octets', '37.179 µs', '197.628 µs'],
      ['Response', '20 octets', '26.923 µs', '187.372 µs'],
    ] },
    { text: '这一轮占用的两个 2 ms 时隙里，真正有帧在传输的只有 385 µs。' },
    { kind: 'formula', heading: '为什么 30 个字节需要 37.179 µs', text: '240 个数据比特 + 48 个校验比特 + 2 个符号的尾 = 290 个符号 × 64 码片', note: '按 6.81 Mb/s 计算，消息本身只需要 35.2 µs 的空口时间。这一帧的主要开销是编码，而不是载荷（payload）本身。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '这一帧的每一段在本课里只是一个码片数：SYNC、SFD、STS、PHR、PSDU 的长度加起来得出空口时间，没有一个脉冲被生成，也没有哪一段被解调过。PHR 说明的「消息的长度和编码速率」从未被解码；FCS 那两个字节与每 330 比特一块的 RS 校验位同样只用于计算长度，从不用于判断正误。所以本课中那条字段条带只是一个长度刻度，而不是一段被解调出来的信号。' },
    { kind: 'threshold', text: '接收是一个门限判决，而不是一个过程：本课只判断到达电平是否达到 −93 dBm，达到即接收整帧。没有前导漏检，没有把噪声误认成 SFD 的虚警，也没有一条随信噪比变化的捕获概率曲线；步骤里「接收端对整个 SYNC 字段做累加、检测到 SFD」在真实硬件中可能失败，而在这里 RMARKER 总是被精确地找到。' },
    { kind: 'unmodelled', text: '没有比特错误。一帧的结果只有三种：到达电平低于灵敏度而未被检出；接收机转而同步到一个明显更强的前导码（捕获效应，capture effect），或与另一帧发生碰撞、信干比不足——否则整帧完全正确。因此那 18.1 dB 的前导累积增益在本课里只是噪声地板上的一个常数，它影响时间戳噪声的大小，却从不决定这一帧能否解出；真实链路在灵敏度附近是一条渐变的误包率曲线。' },
    { kind: 'out-of-scope', text: '本课只有一种 PPDU 形状：64 个 SYNC 前导符号、SFD #2、64 × 512 码片的 STS、6.81 Mb/s 的 PSDU，全部固定，没有哪一项可以改。所以「更长的前导换更远的距离」「850 kb/s 换更省的码片」这类真实设备经常进行的取舍，本课一项也无法测量——本课能回答的只有「这一种帧有多长」。' },
  ],
  sources: [
    '上表里每一个时长，都出自第 16 章（IEEE Std 802.15.4-2024 的 HRP UWB PHY）的字段名称、符号数与码片数。',
    'RMARKER 被定义为 SFD 之后的第一个码片，见 §10.29.1.1；把 STS 放在 SFD 与 PHR 之间的 SP1 分组配置见 §10.32。',
    '2 ms 的测距时隙来自 FiRa，不是标准正文。30 字节的 Poll 与 20 字节的应答是本仿真器对一次最小交互的模型取值，标准正文并未规定固定的帧长。',
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '相距 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('锚点作答', firstUwbResp),
  ],
  observe: [
    '观察手机这条泳道的全貌：Poll 在第一个时隙，Response 在第二个，而第二个时隙恰好从 2 000 000 ns 开始。一轮里绝大部分时间是静默的。',
    '在帧细节视图里打开 Poll 帧，从左到右阅读那条字段条带。最后读到的一段是 PSDU，它比开头那一长串 SYNC 还短——尽管它是唯一承载消息的部分。',
  ],
  tryThis: [
    '自己完成一遍计算。从日志里记下四个计数值，分别相减得到两个差值，再取两者之差的一半，再乘以 15.650 ps、乘以 0.299792458 m/ns。你应该得到 1070 RCTU 与 5.02 m——也就是测距行里的 raw 值，而不是修正后的值。',
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
        '它承载测距消息，好让载荷短一些',
        '它为接收端提供一段可用于计时的序列，而外人既无法预测，也无法提前发送',
        '它让接收端实现码片定时同步',
      ],
      answer: 1,
      explain: '码片定时同步是 SYNC 的职责。STS 由会话持有的密钥生成，重放它的攻击者总是更晚，因此测得的距离无法被外人缩短。',
    },
    {
      q: '为什么消息在一帧测距帧里只占这么一点？',
      options: [
        '因为速率很高，再长的消息也只占很短的时间',
        '因为这一帧存在的意义是被计时，而不是传输数据',
        '因为标准把测距载荷的上限定在三十个字节',
      ],
      answer: 1,
      explain: 'Poll 帧要传达的只是“谁在发起、这是第几轮”，30 个字节就够了。比它长的其余部分，作用是把帧内的那一时刻确定到码片以下的精度。',
    },
  ],
}
