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
import {
  J, N, firstUwbPoll, firstUwbResp,
  type Lesson,
} from '../lessonKit'
import { uwbIntroScenario } from './uwb-intro'

export const uwbFrame: Lesson = {
  id: 'uwb-frame',
  module: 11,
  title: { en: 'What a ranging frame is made of', zh: '一帧测距帧由什么组成' },
  why: {
    en: 'A ranging frame carries almost no data, yet it is long — far longer than a Wi-Fi acknowledgement. Every part of it earns its place: some parts let the receiver lock on, one part fixes the exact instant to timestamp, and one part makes that instant impossible to fake. Knowing the parts tells you where the RMARKER is and why it is there.',
    zh: '一帧测距帧几乎不携带数据，却很长——比一个 Wi-Fi 的确认帧长得多。它的每一段都有自己存在的理由：有的段让接收端先锁住信号，有一段钉死了到底该在哪一刻打时间戳，还有一段让这个时刻无法被伪造。把这些段认全了，你也就知道 RMARKER 在哪儿、为什么在那儿。',
  },
  outcomes: [
    { en: 'name the five parts of a ranging frame and say what each one is for', zh: '说出一帧测距帧的五个组成部分，并讲清每一部分是干什么的' },
    { en: 'point to the RMARKER on the frame’s own timeline', zh: '在这一帧自己的时间轴上指出 RMARKER 的位置' },
    { en: 'explain why the message takes less air than the pattern that introduces it', zh: '解释为什么消息占的空口时间比引出它的那段图案还少' },
  ],
  needs: ['uwb-intro'],
  terms: [
    { term: 'SYNC', plain: {
      en: 'a long, already-known pulse pattern at the head, so the receiver can find the beat',
      zh: '帧头上一长串已知的脉冲图案，用处是让接收端找准节拍',
    } },
    { term: 'SFD', plain: {
      en: 'start-of-frame delimiter: a short pattern announcing that the beat ends here',
      zh: '帧起始定界符：一小段图案，宣告"节拍到此为止"',
    } },
    { term: 'STS', plain: {
      en: 'scrambled timestamp sequence: pulses only the two radios of this session can predict',
      zh: '加扰时间戳序列：一段只有本次会话那两台射频才能预测出来的脉冲',
    } },
    { term: 'PHR', plain: {
      en: 'the header: how long the message is and how fast it was coded',
      zh: '物理头：说明后面的消息有多长、用多快的速率编码',
    } },
    { term: 'PSDU', plain: {
      en: 'the message itself — the few bytes the exchange needs to say',
      zh: '消息本身——这次交互真正需要说的那几个字节',
    } },
    { term: 'chip', plain: {
      en: 'one pulse period, the smallest thing this radio can place in time',
      zh: '一个脉冲的时长，是这台射频在时间上能摆放的最小单位',
    } },
  ],
  picture: [
    { heading: { en: 'Locking on before listening', zh: '先锁住，再去听' }, text: {
      en: 'A receiver cannot decode anything until it knows where the pulses are. So a ranging frame opens with a long stretch of pulses whose pattern is already known — the SYNC field — and the receiver slides its own copy along until the two line up. Then the start-of-frame delimiter (SFD), a short different pattern whose only job is to announce that SYNC has ended. From that edge on, both ends are counting from the same instant.',
      zh: '接收端在找到脉冲落在哪里之前，什么也解不出来。所以一帧测距帧的开头是一长串图案已知的脉冲——SYNC 字段——接收端拿自己手里的同一份副本去滑动比对，直到两者对齐。紧接着是帧起始定界符（SFD）：另一段很短、也不一样的图案，它唯一的任务就是宣布 SYNC 到此结束。从这道边沿往后，两端数的就是同一个起点了。',
    } },
    { heading: { en: 'A sequence nobody can forge', zh: '一段谁也伪造不了的序列' }, text: {
      en: 'If an attacker could replay the part of the frame you time, they could make you believe a locked car is closer than it is. So the frame carries the STS — pulses generated from a key only the two radios in this session hold. The receiver knows what is coming and can time it; anyone else sees noise and cannot produce it early. Security here is a property of timing, not encryption of the message.',
      zh: '如果攻击者能把你用来计时的那一段原样重放，他就能让你以为一辆锁着的车比实际更近。所以帧里还带着一段加扰时间戳序列（STS）：一段由密钥生成的脉冲，而这把密钥只有本次会话的那两台射频握有。接收端知道接下来该是什么，因此能给它计时；别人看到的只是噪声，也造不出提前的版本。这里的安全性是一种计时上的性质，而不是对消息做加密。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Read the strip left to right', zh: '把这条带子从左读到右' }, text: {
      en: 'Load the simulation, jump to the poll and open it in the frame detail view. Read the coloured strip left to right, and name each part as you reach it. Its ruler is the chip: one pulse period, the smallest thing this radio can place in time.',
      zh: '载入仿真，跳到 Poll 帧，再在帧细节视图里把它打开。把那条彩色的带子从左读到右，每读到一段就说出它是什么。这条带子的刻度是码片（chip）：一个脉冲的时长，也是这台射频在时间上能摆放的最小单位。',
    } },
    // "Two words, two sizes" stood here until the step-1 fix wave: 75 words reconciling a
    // table that counted some fields in symbols and others in chips. Every Field cell of
    // that table now gives its chips, so the paragraph had nothing left to explain.
    { heading: { en: 'The header and the message', zh: '头部与消息' }, text: {
      en: 'Only now does the frame say anything at all. The physical header (PHR) states how long the message is and at what rate it was coded, and the receiver needs both before it can read a bit. Then the message itself — the PSDU — thirty bytes in the poll and twenty in the answer. Nothing else is sent. A ranging frame is not a way of moving data; it is a way of being in a known place in time.',
      zh: '到这里，这一帧才第一次真正开口说话。物理头（PHR）交代消息有多长、用多快的速率编码，这两件事接收端必须先知道，才读得懂哪怕一个比特。再往后是消息本身（PSDU）：Poll 帧里三十个字节，应答帧里二十个。再没有别的要发了。一帧测距帧不是用来搬运数据的，它是用来在时间上占住一个确定位置的。',
    } },
    { heading: { en: 'Two slots, one round', zh: '两个时隙，一轮测距' }, text: {
      en: 'The two frames could follow each other much more closely; the session does not let them. It cuts time into equal slots and gives each frame one: the poll the first, the answer the second, and the answer leaves at the top of its slot whether it was ready early or not. Most of a slot is silence, deliberately — a fixed grid is what lets many devices share the room later.',
      zh: '这两帧本来可以挨得更近，但会话不让。它把时间切成等长的时隙，一帧给一个：Poll 在第一个，应答在第二个；哪怕应答早就准备好了，也要等到自己那个时隙的开头才出发。一个时隙里大部分时间是静默的，而这是有意为之——正是这张固定的格子，让日后许多设备能共用同一个房间。',
    } },
    { kind: 'steps', heading: { en: 'The frame in order', zh: '整帧的顺序' }, items: [
      { en: 'SYNC, the long known pattern', zh: 'SYNC，那一长串已知图案' },
      { en: 'SFD, the short marker that ends it', zh: 'SFD，结束它的那一小段标记' },
      { en: 'the RMARKER: the first chip after the SFD', zh: 'RMARKER：SFD 之后的第一个码片' },
      { en: 'the STS, between two short gaps', zh: 'STS，夹在两段短间隔之间' },
      { en: 'the PHR', zh: 'PHR' },
      { en: 'the PSDU', zh: 'PSDU' },
    ] },
    { heading: { en: 'Where the stamp goes', zh: '时间戳打在哪里' }, text: {
      en: 'Everything before the stamp gets both radios locked on; everything after it is what the frame has to prove and to say. Stamp the start and the receiver is not locked on yet; stamp the end and the two ends time different things. Only that one edge can be named, by both, to a fraction of a chip.',
      zh: '时间戳之前的一切，是为了让两台射频都锁住信号；它之后的一切，是这一帧要证明和要说的内容。把时间戳打在帧首，接收端那时还没锁住；打在帧尾，两端计的就不是同一件事了。整帧里，只有这一道边沿双方都能精确到码片零头地说清楚——所以时间戳就打在这里。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'What 197.628 µs is made of', zh: '197.628 µs 由什么组成' }, head: [
      { en: 'Field', zh: '字段' }, { en: 'Duration', zh: '时长' }, { en: 'Purpose', zh: '作用' },
    ], rows: [
      [{ en: 'SYNC, 64 preamble symbols × 508 chips = 32 512 chips', zh: 'SYNC，64 个前导符号 × 508 码片 = 32 512 码片' }, N('65.128 µs'), { en: 'acquisition and timing lock', zh: '捕获并锁定定时' }],
      [{ en: 'SFD, 8 preamble symbols × 508 chips = 4064 chips', zh: 'SFD，8 个前导符号 × 508 码片 = 4064 码片' }, N('8.141 µs'), { en: 'fixes the RMARKER', zh: '确定 RMARKER 的位置' }],
      [{ en: 'STS gap, 512 chips', zh: 'STS 间隔，512 码片' }, N('1.026 µs'), { en: 'silence', zh: '静默' }],
      [{ en: 'STS, 64 × 512 = 32 768 chips', zh: 'STS，64 × 512 = 32 768 码片' }, N('65.641 µs'), { en: 'unforgeable timing sequence', zh: '无法伪造的定时序列' }],
      [{ en: 'STS gap, 512 chips', zh: 'STS 间隔，512 码片' }, N('1.026 µs'), { en: 'silence again', zh: '再一次静默' }],
      [{ en: 'PHR, 19 symbols × 512 chips = 9728 chips', zh: 'PHR，19 个符号 × 512 码片 = 9728 码片' }, N('19.487 µs'), { en: 'length and data rate', zh: '长度与数据速率' }],
      [{ en: 'PSDU, 30 octets: 290 symbols × 64 chips = 18 560 chips', zh: 'PSDU，30 个字节：290 个符号 × 64 码片 = 18 560 码片' }, N('37.179 µs'), { en: 'the poll itself, the frame’s last segment', zh: 'Poll 帧本身，整帧的最后一段' }],
      [{ en: 'The whole poll', zh: '整帧 Poll' }, N('197.628 µs'), { en: '160.449 µs structure, 37.179 µs message', zh: '结构 160.449 µs，消息 37.179 µs' }],
    ] },
    { kind: 'formula', heading: { en: 'Where the RMARKER falls', zh: 'RMARKER 落在哪儿' }, text: {
      en: 'SYNC 65.128 µs + SFD 8.141 µs = 73.269 µs into the frame',
      zh: 'SYNC 65.128 µs + SFD 8.141 µs = 帧内 73.269 µs',
    }, note: {
      en: 'After the pattern and the marker that closes it, before everything else — and the response is built the same way, so its RMARKER falls at the very same offset.',
      zh: '在那串图案、以及结束它的那个标记之后，在其余一切之前——应答帧的搭法完全相同，它的 RMARKER 落在同一个偏移上。',
    } },
    { kind: 'steps', heading: { en: 'How a stamp is taken off this frame', zh: '这一帧上的时间戳是怎么取下来的' }, items: [
      { en: 'The sender lays the frame out in the fixed order above: 64 preamble symbols of SYNC, 8 of SFD, the STS between two 512-chip gaps, the PHR, and last the PSDU — the one part whose length the message decides.', zh: '发送端按上表那个固定顺序把帧搭起来：64 个 SYNC 前导符号、8 个 SFD 符号、夹在两段 512 码片间隔中间的 STS、PHR，最后才是 PSDU——整帧里只有这一段的长度由消息本身决定。' },
      { en: 'It counts 73.269 µs from the frame’s first chip and reads its own ranging counter there. That reading goes out with the frame, and is the TX RMARKER line in the log.', zh: '从整帧的第一个码片起数出 73.269 µs，在那一刻读一次自己的测距计数器。这个读数随帧一起发出，也就是日志里那条 TX RMARKER。' },
      { en: 'The receiver accumulates the whole SYNC field — all 64 repetitions of the one preamble symbol — which is worth 18.1 dB over a single symbol and is what lets it place an edge to a fraction of a chip.', zh: '接收端把整个 SYNC 字段累加起来——同一个前导符号重复的那 64 遍——相比只用一个符号，这一步值 18.1 dB，也正是它能把一道边沿定位到码片零头的原因。' },
      { en: 'It finds the SFD, and takes the first chip after it as the RMARKER: the same instant the sender counted to.', zh: '它找到 SFD，把紧随其后的第一个码片当作 RMARKER：这和发送端数到的是同一个瞬间。' },
      { en: 'It reads its own counter there — the true arrival, plus however far its leading-edge estimate is out, 100 ps of 1-σ on this link — and rounds it to whole ticks of 15.650 ps.', zh: '它在那一刻读自己的计数器：真实到达的时刻，加上它对首径边沿估计偏掉的那一点（本链路上 1σ 是 100 ps），再按 15.650 ps 一格取整。' },
      { en: 'Nothing later in the frame moves that stamp. The STS, the PHR and the PSDU are still checked and read, but the timestamp is already taken.', zh: '帧里后面的内容再也动不了这个时间戳。STS、PHR、PSDU 照样要校验、要读，但时间戳已经取完了。' },
    ] },
    { kind: 'table', heading: { en: 'The poll and the response', zh: 'Poll 帧与应答帧' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'Message', zh: '消息' }, { en: 'Payload', zh: '净荷' }, { en: 'Whole frame', zh: '整帧' },
    ], rows: [
      [{ en: 'Poll', zh: 'Poll' }, N('30 octets'), N('37.179 µs'), N('197.628 µs')],
      [{ en: 'Response', zh: 'Response' }, N('20 octets'), N('26.923 µs'), N('187.372 µs')],
    ] },
    { text: {
      en: 'Of the two 2 ms slots the round occupies, only 385 µs carries a frame at all.',
      zh: '这一轮占用的两个 2 ms 时隙里，真正有帧在传的只有 385 µs。',
    } },
    { kind: 'formula', heading: { en: 'Why 30 octets cost 37.179 µs', zh: '为什么 30 个字节要花 37.179 µs' }, text: {
      en: '240 data bits + 48 parity bits + a 2-symbol tail = 290 symbols × 64 chips',
      zh: '240 个数据比特 + 48 个校验比特 + 2 个符号的尾 = 290 个符号 × 64 码片',
    }, note: {
      en: 'At 6.81 Mb/s the message alone would be 35.2 µs of air. Coding, not the message, is most of what a payload costs.',
      zh: '按 6.81 Mb/s 算，光是消息本身只要 35.2 µs 的空口时间。净荷的开销大头是编码，不是消息。',
    } },
  ],
  sources: [
    { en: 'The field names, symbol counts and chip counts of Clause 16 (the HRP UWB PHY of IEEE Std 802.15.4-2024) give every duration in the table above.',
      zh: '上表里每一个时长，都出自第 16 章（IEEE Std 802.15.4-2024 的 HRP UWB PHY）的字段名称、符号数与码片数。' },
    { en: 'The RMARKER is defined as the first chip after the SFD in §10.29.1.1; the SP1 packet configuration that puts the STS between the SFD and the PHR is §10.32.',
      zh: 'RMARKER 被定义为 SFD 之后的第一个码片，见 §10.29.1.1；把 STS 放在 SFD 与 PHR 之间的 SP1 分组配置见 §10.32。' },
    { en: 'The 2 ms ranging slot is FiRa’s, not the standard’s. The 30-octet poll and 20-octet response are this simulator’s model of a minimal exchange, not fixed frame sizes in the standard text.',
      zh: '2 ms 的测距时隙来自 FiRa，不是标准正文。30 字节的 Poll 与 20 字节的应答是本仿真器对一次最小交互的模型取值，标准正文并没有把帧长钉死。' },
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: { en: '20 m apart', zh: '相距 20 m' }, scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('the poll leaves the phone', 'Poll 帧离开手机', firstUwbPoll),
    J('the anchor answers', '锚点作答', firstUwbResp),
  ],
  observe: [
    { en: 'Look at the phone’s lane as a whole: the poll in the first slot, the response in the second, which starts at exactly 2 000 000 ns. Almost all of the round is silence.', zh: '整体看手机这条泳道：Poll 在第一个时隙，Response 在第二个，而第二个时隙恰好从 2 000 000 ns 开始。一轮里绝大部分时间是静默的。' },
    { en: 'Open the poll in the frame detail view and read the strip left to right. The PSDU is the last segment you reach, and shorter than the run of SYNC that opens the frame — though it alone carries a message.', zh: '在帧细节视图里打开 Poll 帧，把那条带子从左读到右。最后读到的一段是 PSDU，它比开头那一长串 SYNC 还短——尽管它才是唯一装着消息的部分。' },
  ],
  tryThis: [
    { en: 'Do the arithmetic yourself. Copy the four counters out of the log, subtract each pair, halve the difference, then multiply by 15.650 ps and by 0.299792458 m/ns. You should land on 1070 RCTU and 5.02 m — the raw figure in the range line, not the corrected one.', zh: '自己把算术做一遍。从日志里抄出四个计数值，分别相减得到两个差，取其差的一半，再乘以 15.650 ps、乘以 0.299792458 m/ns。你应该得到 1070 RCTU 与 5.02 m——也就是测距行里的 raw 值，而不是修正后的值。' },
  ],
  quiz: [
    {
      q: { en: 'Where in the frame is the timestamp taken?', zh: '时间戳是在帧的什么位置读取的？' },
      options: [
        { en: 'At the first chip of SYNC', zh: '在 SYNC 的第一个码片' },
        { en: 'At the RMARKER, the first chip after the SFD — 73.269 µs in', zh: '在 RMARKER，即 SFD 之后的第一个码片——距帧首 73.269 µs' },
        { en: 'At the end of the PSDU, once the frame checks out', zh: '在 PSDU 结束时，也就是确认帧正确之后' },
      ],
      answer: 1,
      explain: { en: 'After 65.128 µs of SYNC and 8.141 µs of SFD, both ends have locked on. The timeline’s TX_START is 73.269 µs earlier; the counters are not.', zh: '经过 65.128 µs 的 SYNC 与 8.141 µs 的 SFD，两端都已锁定脉冲序列。时间线上的 TX_START 比它早 73.269 µs，而计数值并非如此。' },
    },
    {
      q: { en: 'What is the STS for?', zh: 'STS 是用来做什么的？' },
      options: [
        { en: 'It carries the ranging message, so the payload stays short', zh: '它承载测距消息，好让净荷短一些' },
        { en: 'It gives the receiver something to time that an outsider cannot predict or send early', zh: '它给接收端一段可以计时的内容，而外人既预测不出、也没法提前发出' },
        { en: 'It lets the receiver find the beat', zh: '它让接收端找准节拍' },
      ],
      answer: 1,
      explain: { en: 'Finding the beat is SYNC’s job. The STS comes from a key the session holds, so an attacker who replays it is always late.', zh: '找节拍是 SYNC 的活儿。STS 由会话持有的密钥生成，重放它的攻击者永远只会更晚，因此测出的距离没法被外人缩短。' },
    },
    {
      q: { en: 'Why does the message take so little of a ranging frame?', zh: '为什么消息在一帧测距帧里只占这么一点？' },
      options: [
        { en: 'Because the rate is so high any message would be brief', zh: '因为速率太高，再长的消息也只占一点点时间' },
        { en: 'Because the frame exists to be timed, not to carry data', zh: '因为这一帧存在的意义是被计时，而不是搬运数据' },
        { en: 'Because the standard caps a ranging payload at thirty bytes', zh: '因为标准把测距净荷的上限定在三十个字节' },
      ],
      answer: 1,
      explain: { en: 'The poll says who is asking and which round this is: 30 octets. The longer parts are there so one instant can be pinned down.', zh: 'Poll 帧要说的只是"谁在问、这是第几轮"，30 个字节就够了。比它长的那些部分，存在的理由是把帧里那一个瞬间钉准。' },
    },
  ],
}
