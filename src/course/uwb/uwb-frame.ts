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
      en: 'a long, already-known pulse pattern at the head of the frame, there only so the receiver can find the beat',
      zh: '帧头上一长串已知的脉冲图案，唯一的用处是让接收端找准节拍',
    } },
    { term: 'SFD', plain: {
      en: 'start-of-frame delimiter: a short pattern announcing that the beat ends here, so both ends can count from the same chip',
      zh: '帧起始定界符：一小段图案，宣告"节拍到此为止"，于是两端可以从同一个码片开始计数',
    } },
    { term: 'STS', plain: {
      en: 'scrambled timestamp sequence: a stretch of pulses only the two radios of this session can predict',
      zh: '加扰时间戳序列：一段只有本次会话的那两台射频才能预测出来的脉冲',
    } },
    { term: 'PHR', plain: {
      en: 'the header: how long the message is and how fast it was coded',
      zh: '物理头：说明后面的消息有多长、是用多快的速率编码的',
    } },
    { term: 'PSDU', plain: {
      en: 'the message itself — the handful of bytes the exchange actually needs to say',
      zh: '消息本身——这次交互真正需要说的那几个字节',
    } },
    { term: 'slot', plain: {
      en: 'a fixed stretch of time the session hands to one frame; a round is a fixed number of them',
      zh: '会话分给一帧的一段固定长度的时间；一轮测距就是固定几个这样的时隙',
    } },
  ],
  picture: [
    { heading: { en: 'Locking on before listening', zh: '先锁住，再去听' }, text: {
      en: 'A receiver cannot decode anything until it knows where the pulses are. So a ranging frame opens with a long stretch of pulses whose pattern is already known — the SYNC field — and the receiver slides its own copy along until the two line up. Then comes the SFD, a short and different pattern whose only job is to announce that the run of SYNC has ended. From that edge on, both ends are counting the same chips.',
      zh: '接收端在找到脉冲落在哪里之前，什么也解不出来。所以一帧测距帧的开头是一长串图案已知的脉冲——SYNC 字段——接收端拿自己手里的同一份副本去滑动比对，直到两者对齐。紧接着是 SFD：另一段很短、也不一样的图案，它唯一的任务就是宣布 SYNC 到此结束。从这道边沿往后，两端数的就是同一批码片了。',
    } },
    { heading: { en: 'A sequence nobody can forge', zh: '一段谁也伪造不了的序列' }, text: {
      en: 'If an attacker could replay the part of the frame you time, they could make you believe a locked car is closer than it is. So the frame also carries the STS — a stretch of pulses generated from a key only the two radios in this session hold. The receiver knows what is coming and can time it; anyone else sees noise and cannot produce it early. Security here is a property of timing, not an encryption of the message.',
      zh: '如果攻击者能把你用来计时的那一段原样重放，他就能让你以为一辆锁着的车比实际更近。所以帧里还带着 STS：一段由密钥生成的脉冲，而这把密钥只有本次会话的那两台射频握有。接收端知道接下来该是什么，因此能给它计时；别人看到的只是噪声，也造不出提前的版本。这里的安全性是一种计时上的性质，而不是对消息做加密。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Read the strip left to right', zh: '把这条带子从左读到右' }, text: {
      en: 'Load the simulation, jump to the poll and open it in the frame detail view. Read the coloured strip from left to right: the long run at the head, the short marker that closes it, the sequence in the middle, then the header and, right at the end, the message.',
      zh: '载入仿真，跳到 Poll 帧，再在帧细节视图里把它打开。把那条彩色的带子从左读到右：开头那一长段、结束它的那一小段标记、中间那段序列，然后是头部，最后才是消息。',
    } },
    { heading: { en: 'The header and the message', zh: '头部与消息' }, text: {
      en: 'Only now does the frame say anything at all. The PHR states how long the message is and at what rate it was coded, and the receiver needs both before it can read a single bit. Then the PSDU: the message itself, thirty bytes in the poll and twenty in the answer. There is nothing else to send. A ranging frame is not a way of moving data; it is a way of being in a known place in time.',
      zh: '到这里，这一帧才第一次真正开口说话。PHR 交代消息有多长、用多快的速率编码，这两件事接收端必须先知道，才读得懂哪怕一个比特。再往后是 PSDU：消息本身，Poll 帧里三十个字节，应答帧里二十个。再没有别的要发了。一帧测距帧不是用来搬运数据的，它是用来在时间上占住一个确定位置的。',
    } },
    { heading: { en: 'Two slots, one round', zh: '两个时隙，一轮测距' }, text: {
      en: 'The session does not let the two frames follow each other as closely as they could. It cuts time into equal slots and gives each frame one: the poll goes in the first, the answer in the second, and the answer leaves at the top of its slot whether it was ready early or not. Most of a slot is silence, and that is deliberate — a fixed grid is what lets many devices share the same room later.',
      zh: '会话并不让这两帧尽可能紧挨着走。它把时间切成等长的时隙，一帧给一个：Poll 在第一个，应答在第二个；哪怕应答早就准备好了，它也要等到自己那个时隙的开头才出发。一个时隙里大部分时间是静默的，而这是有意为之——正是这张固定的格子，让日后许多设备能够共用同一个房间。',
    } },
    { heading: { en: 'Where the stamp goes', zh: '时间戳打在哪里' }, text: {
      en: 'The RMARKER is the first chip after the SFD ends. Everything before it is there so that both radios can agree where "here" is; everything after it is the message. Stamp the start of the frame and the receiver is not locked on yet; stamp the end and the two ends would be timing different things. The one edge both can name to a fraction of a chip is the edge they use.',
      zh: 'RMARKER 就是 SFD 结束之后的第一个码片。它之前的一切，是为了让两台射频对"这里"达成一致；它之后的一切，是消息。把时间戳打在帧首，接收端那时还没锁住；打在帧尾，两端计的就不是同一件事了。整帧里唯一一处双方都能精确到码片零头、共同说出口的边沿，就是它们采用的那一处。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'What 197.628 µs is made of', zh: '197.628 µs 由什么组成' }, head: [
      { en: 'Field', zh: '字段' }, { en: 'Duration', zh: '时长' }, { en: 'Purpose', zh: '作用' },
    ], rows: [
      [{ en: 'SYNC, 64 preamble symbols', zh: 'SYNC，64 个前导符号' }, N('65.128 µs'), { en: 'acquisition and timing lock', zh: '捕获并锁定定时' }],
      [{ en: 'SFD, 8 symbols', zh: 'SFD，8 个符号' }, N('8.141 µs'), { en: 'fixes the RMARKER', zh: '确定 RMARKER 的位置' }],
      [{ en: 'STS gap', zh: 'STS 间隔' }, N('1.026 µs'), { en: '512 chips of silence', zh: '512 个码片的静默' }],
      [{ en: 'STS, 64 × 512 chips', zh: 'STS，64 × 512 个码片' }, N('65.641 µs'), { en: 'unforgeable timing sequence', zh: '无法伪造的定时序列' }],
      [{ en: 'STS gap', zh: 'STS 间隔' }, N('1.026 µs'), { en: '512 more chips', zh: '再来 512 个码片' }],
      [{ en: 'PHR, 19 symbols', zh: 'PHR，19 个符号' }, N('19.487 µs'), { en: 'length and data rate', zh: '长度与数据速率' }],
      [{ en: 'PSDU, 30 octets', zh: 'PSDU，30 个字节' }, N('37.179 µs'), { en: 'the poll itself, the last segment of the frame', zh: 'Poll 帧本身，整帧的最后一段' }],
      [{ en: 'The whole poll', zh: '整帧 Poll' }, N('197.628 µs'), { en: '160.449 µs structure, 37.179 µs message', zh: '结构 160.449 µs，消息 37.179 µs' }],
    ] },
    { text: {
      en: 'The RMARKER sits 65.128 + 8.141 = 73.269 µs into the frame — after the SYNC and the SFD, before everything else. The response is built the same way and differs only in its message: 20 octets, 26.923 µs of payload, 187.372 µs in all, with its RMARKER at the very same 73.269 µs. Of the two 2 ms slots the round occupies, only 385 µs carries a frame at all.',
      zh: 'RMARKER 位于帧内 65.128 + 8.141 = 73.269 µs 处——在 SYNC 与 SFD 之后，在其余一切之前。应答帧的搭法完全相同，只有消息不一样：20 个字节、26.923 µs 的净荷、全帧 187.372 µs，RMARKER 同样落在 73.269 µs。而这一轮占用的两个 2 ms 时隙里，真正有帧在传的只有 385 µs。',
    } },
    { text: {
      en: 'The poll’s PSDU is 30 octets at 6.81 Mb/s, which is not 35.2 µs of air but 37.179 µs. The radio sends 240 data bits, adds 48 parity bits and a 2-symbol tail, and spends a whole symbol on each of them — coding, not the message, is what the payload mostly costs.',
      zh: 'Poll 帧的 PSDU 是 30 个字节、速率 6.81 Mb/s，占用的空口时间却不是 35.2 µs，而是 37.179 µs。射频发出 240 个数据比特，再补上 48 个校验比特和 2 个符号的尾，每一个都要占掉一个完整的符号——净荷的开销大头是编码，不是消息本身。',
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
    { en: 'Look at the phone’s lane as a whole: the round is two slots of 2 ms, the poll in slot 0 and the response in slot 1, which starts at exactly 2 000 000 ns. Of those 4 ms, only 385 µs carries a frame.', zh: '整体看手机这条泳道：一轮由两个 2 ms 的时隙组成，Poll 在时隙 0，Response 在时隙 1，而时隙 1 恰好从 2 000 000 ns 开始。这 4 ms 里只有 385 µs 真的在传帧。' },
    { en: 'Open the poll in the frame detail view and read the segments right to left. The PSDU comes last, and it is shorter than the run of SYNC that opens the frame — even though it is the only part carrying a message.', zh: '在帧细节视图里打开 Poll 帧，从右往左读那些分段。PSDU 排在最后，而且比开头那一长串 SYNC 还短——尽管它才是唯一装着消息的部分。' },
  ],
  tryThis: [
    { en: 'Do the arithmetic yourself. Copy the four counters out of the log, subtract each pair, halve the difference, then multiply by 15.650 ps and by 0.299792458 m/ns. You should land on 1070 RCTU and 5.02 m — the raw figure in the range line, not the corrected one.', zh: '自己把算术做一遍。从日志里抄出四个计数值，分别相减得到两个差，取其差的一半，再乘以 15.650 ps、乘以 0.299792458 m/ns。你应该得到 1070 RCTU 与 5.02 m——也就是测距行里的 raw 值，而不是修正后的值。' },
  ],
  quiz: [
    {
      q: { en: 'Where in the frame is the timestamp taken?', zh: '时间戳是在帧的什么位置读取的？' },
      options: [
        { en: 'At the very first chip of the SYNC field', zh: '在 SYNC 字段的第一个码片' },
        { en: 'At the RMARKER, the first chip after the SFD — 73.269 µs into the frame', zh: '在 RMARKER，即 SFD 之后的第一个码片——距帧首 73.269 µs' },
        { en: 'At the end of the PSDU, once the frame is known to be good', zh: '在 PSDU 结束时，也就是确认帧正确之后' },
      ],
      answer: 1,
      explain: { en: 'After 65.128 µs of SYNC and 8.141 µs of SFD, both ends have locked the pulse train. The timeline’s TX_START and RX_START are 73.269 µs earlier; the counters are not.', zh: '经过 65.128 µs 的 SYNC 与 8.141 µs 的 SFD，两端都已锁定脉冲序列。时间线上的 TX_START 与 RX_START 比它早 73.269 µs，而计数值并非如此。' },
    },
    {
      q: { en: 'What is the STS for?', zh: 'STS 是用来做什么的？' },
      options: [
        { en: 'It carries the ranging message, so the payload can stay short', zh: '它承载测距消息，好让净荷可以短一些' },
        { en: 'It gives the receiver something to time that an outsider can neither predict nor send early', zh: '它给接收端一段可以计时的内容，而外人既预测不出、也没法提前发出' },
        { en: 'It lets the receiver find the beat before the header arrives', zh: '它让接收端在头部到来之前先找准节拍' },
      ],
      answer: 1,
      explain: { en: 'Finding the beat is the SYNC field’s job. The STS is generated from a key the session holds, so an attacker who replays it is always late, and a distance measured on it cannot be shortened from outside.', zh: '找节拍是 SYNC 的活儿。STS 由会话持有的密钥生成，重放它的攻击者永远只会更晚，因此基于它测出的距离没法被外人缩短。' },
    },
    {
      q: { en: 'Why does the message take so little of a ranging frame?', zh: '为什么消息在一帧测距帧里只占这么一点？' },
      options: [
        { en: 'Because the rate is so high that even a long message would be brief', zh: '因为速率太高了，再长的消息也只占一点点时间' },
        { en: 'Because the frame exists to be timed, not to carry data; the exchange only needs a handful of bytes', zh: '因为这一帧存在的意义是被计时，而不是搬运数据；这次交互只需要几个字节' },
        { en: 'Because the standard caps a ranging payload at thirty bytes', zh: '因为标准把测距净荷的上限定在了三十个字节' },
      ],
      answer: 1,
      explain: { en: 'The poll says who is asking and which round this is, and that fits in 30 octets. Everything longer — the lock-on pattern and the unforgeable sequence — exists so the one instant inside the frame can be pinned down.', zh: 'Poll 帧要说的只是"谁在问、这是第几轮"，30 个字节就够了。比它长的那些部分——锁定用的图案、无法伪造的序列——存在的理由，是为了把帧里那一个瞬间钉准。' },
    },
  ],
}
