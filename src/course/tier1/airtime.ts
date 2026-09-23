/**
 * Wi-Fi Tier 1 · M1 · The network and the frame · Frames cost airtime.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): why one
 * shared channel makes time the thing worth counting, what a frame is made of
 * in plain words, and only then the microseconds of the run.
 *
 * Every number quoted below is pinned in tests/course/airtime.test.ts, against
 * the lesson's own scene. The scenario builder is unchanged, so the recorded
 * timeline hash in tests/fixtures/lesson-hashes.json is byte-identical.
 */
import { type Lesson, N, oneRoom, node, sc, firstData, firstAck, J } from '../lessonKit'

export const airtime: Lesson = {
  id: 'airtime',
  module: 0,
  title: { en: 'Frames cost airtime', zh: '帧要花“空口时间”' },
  why: {
    en: 'One room, one channel, one voice at a time. A video stream, a file upload and a phone checking mail all have to squeeze into the same air, one frame after another. So the thing worth counting is not bytes but time: how long each frame holds the channel, and how much of that time carries nothing anyone asked for.',
    zh: '一个房间，一条信道，同一时刻只能有一个人说话。视频流、文件上传、手机收邮件，全都得挤进同一片空气里，一帧接着一帧。所以真正值得数的不是字节，而是时间：每一帧把信道占住多久，其中又有多少根本没在搬运谁想要的东西。这一课，我们给一次收发交互掐一次秒表。',
  },
  outcomes: [
    { en: 'read a frame’s duration off the timeline and say which part of it is payload', zh: '在时间轴上读出一帧的时长，并说出其中哪一段才是净荷' },
    { en: 'explain why every frame pays the same preamble, whatever it carries', zh: '解释为什么每一帧都要付同样长的前导，不管它装了什么' },
    { en: 'say why the acknowledgement is worth the air it costs', zh: '说清确认帧（ACK）为什么值得它占掉的那点空口时间' },
  ],
  needs: ['radio-primer', 'decode-thresholds', 'frame-anatomy', 'frame-anatomy-bytes'],
  terms: [
    { term: 'ACK', plain: {
      en: 'acknowledgement: the tiny frame a receiver sends straight back to say the frame arrived intact',
      zh: '确认帧：接收方立刻回发的一个小帧，意思是“这帧我完整收到了”',
    } },
    { term: 'payload', plain: {
      en: 'the part of a frame that carries what was actually being sent',
      zh: '帧里真正装着“要发的东西”的那一段',
    } },
  ],
  picture: [
    { heading: { en: 'One channel, one speaker', zh: '一条信道，一个说话人' }, text: {
      en: 'The air in a room is one channel, and a radio cannot send and listen at once. While any frame is going out, nobody within earshot can start one. So the currency of a wireless network is time on the air: a station (STA) does not buy bandwidth, it buys a slice of the clock. Deciding who gets the next slice is the whole job of the MAC — the part of the radio that picks the moment to send.',
      zh: '一个房间里的空气就是一条信道，而一台无线电没法一边发一边听。只要有一帧正在发出去，听力范围内的其他设备就都开不了口。所以无线网络的“货币”是空口上的时间：站点（STA）买到的不是带宽，而是时钟上的一小段。下一段归谁，全由 MAC——射频里决定什么时候开口的那一部分——说了算。',
    } },
    { heading: { en: 'Why a frame cannot start cold', zh: '一帧为什么不能张口就来' }, text: {
      en: 'A receiver is not waiting for your bits; it is waiting for anything at all. Before it can read a single bit it must notice that a signal has begun, lock onto its rhythm, and learn how what follows is coded. That is the preamble’s job: a fixed pattern both ends already know. It carries no data, it is the same length whatever the frame holds, and it is paid every time.',
      zh: '接收端并不是专等你的比特，它等的是“有没有信号”。在读到哪怕一个比特之前，它得先察觉到有信号开始了，锁住它的节奏，再弄清后面的东西是怎么编码的。这就是前导干的活：一段两端早已约好的固定图案。它不装数据，帧里装什么它都一样长，而且每一次都要付。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Put a stopwatch on one frame', zh: '给一帧掐一次表' }, text: {
      en: 'Load the simulation and jump to the first data frame. Hover it: the tooltip prints its size, its rate and its exact duration. That duration is what the room is paying for. Blue is the lane of the access point (AP), green a station’s.',
      zh: '载入仿真，跳到第一个数据帧。把鼠标悬在它上面：提示框会给出帧的大小、速率和精确时长。房间里其他人付的，就是这个时长。蓝色是接入点（AP）的泳道，绿色是站点的。',
    } },
    { heading: { en: 'Only the middle part grows', zh: '会变长的只有中间那段' }, text: {
      en: 'After the preamble come the data symbols: equal-length chunks of signal, each carrying a fixed number of bits. Double the payload and you double the symbols; choose a faster coding and each symbol holds more, so fewer are needed. A big frame spends most of its airtime on the message; a small one spends most of it on the preamble.',
      zh: '前导之后是数据符号：一段段等长的信号，每段装固定数量的比特。净荷翻倍，符号数就翻倍；换一档更快的编码，每个符号装得更多，需要的符号就更少。大帧的空口时间大头花在消息上，小帧的大头却花在前导上。',
    } },
    { heading: { en: 'And the air is paid for twice', zh: '而且这段空口要付两遍' }, text: {
      en: 'The sender cannot hear a collision: while it transmits, its own signal deafens it. Silence tells it nothing, and only the receiver can report that the frame survived. That report is the ACK — a few bytes, sent back after a short fixed pause. It is tiny, never optional, and charged to every exchange.',
      zh: '发送方听不见碰撞：发送的时候，自己的信号把耳朵震聋了。所以安静对它毫无信息量，只有接收方才能报告这一帧活着到达。这份报告就是 ACK——只有几个字节，在一段固定的短暂停顿之后回过来。它很小，却永远不是可选项；而且这段停顿加上 ACK，每一次交互都要记账。',
    } },
    { heading: { en: 'So what does an exchange cost?', zh: '那么一次交互到底花多少？' }, text: {
      en: 'One exchange is three things: the preamble in front, the payload, and the pause and answer behind. Only the middle depends on what you sent. That is why a network of many small frames can be busy all day and move almost nothing, and why nearly every later trick spreads those fixed costs over more data.',
      zh: '所以一次交互由三样东西组成：前面的前导、净荷，以及后面那段停顿加回答。只有中间那样取决于你发了什么。这就是为什么一个净发小帧的网络可以整天忙得不可开交却几乎没搬动什么；也是为什么后面几乎每一招，都是把这些固定开销摊到更多数据上去。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'One exchange in this room', zh: '这个房间里的一次交互' }, head: [
      { en: 'Part', zh: '组成' }, { en: 'Duration', zh: '时长' }, { en: 'What it is', zh: '这是什么' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [{ en: 'Preamble of the data frame', zh: '数据帧的前导' }, N('44.0 µs'), { en: 'fixed, whatever the frame carries', zh: '固定值，与帧里装了什么无关' }, N('§27.3.10')],
      [{ en: '6 data symbols × 13.6 µs', zh: '6 个数据符号 × 13.6 µs' }, N('81.6 µs'), { en: 'the 1430-byte payload', zh: '那 1430 字节的净荷' }, N('§27.3.10')],
      [{ en: 'The whole data frame', zh: '整个数据帧' }, N('125.6 µs'), { en: 'what the timeline block measures', zh: '时间轴上那个色块量的就是它' }, N('§27.3.10')],
      [{ en: 'The pause before the answer', zh: '回答之前的停顿' }, N('16 µs'), { en: 'the same for every exchange', zh: '每一次交互都一样' }, N('§17.4.4')],
      [{ en: 'The ACK', zh: 'ACK' }, N('28 µs'), { en: '14 bytes at the highest of the mandatory 6, 12 and 24 Mb/s not above the frame’s own: 24 Mb/s here', zh: '14 个字节，速率在 6、12、24 Mb/s 这三个强制速率里取不超过本帧参考速率的最高一个：这里是 24 Mb/s' }, N('§17.4.3')],
      [{ en: 'The whole exchange', zh: '整次交互' }, N('169.6 µs'), { en: '88.0 µs of it fixed, 81.6 µs payload', zh: '其中固定开销 88.0 µs，净荷 81.6 µs' }, N('—')],
    ] },
    { kind: 'formula', heading: { en: 'Where the time goes', zh: '时间花在哪儿' }, text: {
      en: 'airtime = preamble + symbol time × ⌈payload bits ÷ bits per symbol⌉',
      zh: '空口时间 = 前导 + 符号时长 × ⌈净荷比特数 ÷ 每符号比特数⌉',
    }, note: {
      en: 'The first term never moves; the symbol time is the 13.6 µs above. Only the second changes with a bigger frame or a faster coding.',
      zh: '第一项永远不动；符号时长就是上表里那 13.6 µs。帧变大、编码变快，能改的只有第二项。',
    } },
    { kind: 'steps', heading: { en: 'How the duration is worked out, step by step', zh: '这个时长是怎么算出来的，一步一步' }, items: [
      { en: 'Start from the bytes this frame actually puts on the air — payload, headers and checksum together. In this run that is 1430.',
        zh: '先数这一帧真正送上空口的字节：净荷、帧头和校验码加在一起。本轮里是 1430 个。' },
      { en: 'Turn those bytes into bits, and add the two fixed fields the transmitter wraps around them: 16 service bits in front, 6 tail bits behind.',
        zh: '把这些字节换算成比特，再加上发送机在两头各包一层的固定字段：前面 16 个服务比特，后面 6 个尾比特。' },
      { en: 'Divide that bit count by the bits one symbol carries at the rung in use — 1950 for this link, at 20 MHz and one stream — and round the answer up. Rounding up is why part of the last symbol is always padding.',
        zh: '拿这个比特数去除以所用那一级里一个符号能装的比特数——本链路在 20 MHz、单流下是 1950——然后向上取整。正因为向上取整，最后一个符号里总有一段是填充。' },
      { en: 'Multiply the symbol count by the symbol time, 13.6 µs, and add the preamble, 44.0 µs. The preamble is fixed for this generation of radio and never depends on what the frame carries. The sum is the block you measured on the timeline.',
        zh: '把符号数乘以符号时长 13.6 µs，再加上前导的 44.0 µs。前导对这一代电台是定值，与帧里装了什么无关。这两项之和，就是你在时间轴上量到的那个色块。' },
      { en: 'Then run the identical formula for the answer. The ACK is 14 bytes, and its rate is not a fixed one: it is the highest mandatory rate that does not exceed the data frame’s own reference rate — 24 Mb/s on this link.',
        zh: '再拿同一条公式去算那个回答。ACK 是 14 个字节，而它的速率并不是一个定值：取不超过数据帧自身参考速率的那个最高强制速率——在这条链路上是 24 Mb/s。' },
      { en: 'At that rate the answer needs two symbols of 4 µs behind a 20 µs preamble — 28 µs — and the 16 µs pause in front of it closes the exchange.',
        zh: '在这个速率上，回答需要两个 4 µs 的符号，前面挂一段 20 µs 的前导，合计 28 µs；再补上它前面那 16 µs 的停顿，这次交互就算走完了。' },
    ] },
    { kind: 'table', heading: { en: 'The first data frame, value by value', zh: '第一个数据帧，一个值一个值地走' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'Bytes on the air', zh: '送上空口的字节' }, N('1430 B')],
      [{ en: 'Bits, service and tail included', zh: '化成比特，含服务与尾比特' }, N('16 + 8 × 1430 + 6 = 11 462')],
      [{ en: 'Divided by the bits one symbol holds, rounded up', zh: '除以每符号比特数，向上取整' }, N('11 462 ÷ 1950 → 6')],
      [{ en: 'Symbols at the symbol time', zh: '符号数乘以符号时长' }, N('6 × 13.6 = 81.6 µs')],
      [{ en: 'Plus the preamble', zh: '再加上前导' }, N('81.6 + 44.0 = 125.6 µs')],
      [{ en: 'Plus the pause and the answer', zh: '再加上停顿与回答' }, N('125.6 + 16 + 28 = 169.6 µs')],
    ] },
    { heading: { en: 'The tax, in one number', zh: '这笔税，用一个数说清' }, text: {
      en: 'Of the 169.6 µs this exchange holds the channel, 88.0 µs is preamble, pause and answer. The payload is the other 81.6 µs — under half.',
      zh: '这次交互一共占住信道 169.6 µs，其中 88.0 µs 是前导、停顿和回答。净荷只占剩下的 81.6 µs——还不到一半。',
    } },
    { heading: { en: 'How busy is the room?', zh: '这个房间有多忙？' }, text: {
      en: 'In the first 100 ms the access point sends 117 such frames and gets 116 answers — about 18 % of the time. The rest is silence.',
      zh: '前 100 ms 里，AP 发出 117 个这样的帧，收到 116 个回答——合起来约占 18 % 的时间。其余都是静默。',
    } },
  ],
  sources: [
    { en: 'The airtime formula is §17.4.3 (TXTIME) of IEEE Std 802.11-2024; the 44 µs high-efficiency preamble and the 13.6 µs symbol are this simulator’s single representative values for a Clause 27 PPDU, not a field-by-field sum of the training fields.',
      zh: '空口时间公式出自 IEEE Std 802.11-2024 的 §17.4.3（TXTIME）；44 µs 的高效率前导与 13.6 µs 的符号，是本仿真器为第 27 章 PPDU 取的单一代表值，并非逐个训练字段加出来的结果。' },
    { en: 'The acknowledgement rule — a sender treats a missing ACK as failure because it cannot detect a collision itself — is §10.3.2.9. The 16 µs pause is aSIFSTime, §17.4.4.',
      zh: '“发送方因为自己检测不到碰撞，所以把收不到 ACK 当作失败”这条规则见 §10.3.2.9。16 µs 的停顿是 aSIFSTime，见 §17.4.4。' },
    { en: 'The 1430-byte frame, the video profile that produces it and the two positions in the room are this simulator’s model of a stream, not figures from the standard.',
      zh: '1430 字节的帧、产生它的视频业务模型，以及两台设备在房间里的位置，都是本仿真器对一路视频流的模型取值，标准正文里没有这些数字。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV', 'sta', 7, 5.5, 'he', 'video'),
  ]),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Hover any blue data block on the access point’s lane: 1430 bytes and 125.6 µs of air, every time. Its width on the timeline is that duration, to scale.', zh: '把鼠标悬到 AP 泳道上任意一个蓝色数据块：每一个都是 1430 字节、125.6 µs 的空口时间。色块在时间轴上的宽度，就是按比例画出的这个时长。' },
    { en: 'The white answer starts 16 µs after the data block ends and lasts 28 µs — under a quarter of the frame it answers.', zh: '白色的回答在数据块结束后 16 µs 开始，持续 28 µs——比它所回答的那一帧的四分之一略少一点。' },
    { en: 'Between exchanges the lane is empty: across the first 100 ms the channel is busy under a fifth of the time, though the stream never stops.', zh: '两次交互之间泳道是空的。在前 100 ms 里，信道忙的时间不到五分之一，尽管这路视频流一刻也没停。' },
  ],
  tryThis: [
    { en: 'Do the arithmetic: take the 125.6 µs block, subtract the 44.0 µs preamble, divide the rest by 13.6 µs. You should land on exactly six symbols.', zh: '把算术做一遍。拿 125.6 µs 的色块减去 44.0 µs 的前导，再把剩下的除以 13.6 µs。你应该刚好得到六个符号。' },
    { en: 'In the editor, set the TV to 802.11a and reload. Same payload, far fewer bits per symbol: the frame stretches to 232 µs.', zh: '在编辑器里把电视改成 802.11a 再载入。净荷没变，但现在每个符号装的比特少得多：同样一帧拉长到了 232 µs。' },
  ],
  quiz: [
    {
      q: { en: 'Why does Wi-Fi need acknowledgements at all?', zh: 'Wi-Fi 为什么非要有确认帧？' },
      options: [
        { en: 'To tell the other stations to stay silent', zh: '为了通知其他站点保持安静' },
        { en: 'The sender cannot detect a collision itself, so the ACK is its only proof of delivery', zh: '发送方自己检测不到碰撞，所以 ACK 是它唯一的送达凭据' },
        { en: 'To carry the receiver’s preferred data rate', zh: '为了把接收方偏好的速率带回给发送方' },
      ],
      answer: 1,
      explain: { en: 'A radio cannot listen while it transmits, so silence means nothing. Only a frame coming back says the data arrived.', zh: '无线电发送时听不见，所以一帧发完后的安静本身什么也说明不了。只有回过来的那一帧才说明数据到了。' },
    },
    {
      q: { en: 'Two frames carry the same payload, one at a slower coding. Which holds the channel longer?', zh: '两帧净荷相同，其中一帧用了更慢的编码。哪一帧占住信道更久？' },
      options: [
        { en: 'The faster-coded one', zh: '编码更快的那一帧' },
        { en: 'The slower-coded one', zh: '编码更慢的那一帧' },
        { en: 'Neither — airtime depends only on the number of bytes', zh: '一样久——空口时间只取决于字节数' },
      ],
      answer: 1,
      explain: { en: 'Fewer bits per symbol means more symbols for the same payload, and every symbol is the same length. The preamble is identical.', zh: '每符号装的比特越少，同样的净荷就要用越多符号，而每个符号都一样长。两种情况下前导完全相同。' },
    },
    {
      q: { en: 'Halve this frame’s payload. What happens to the exchange’s 169.6 µs?', zh: '把这一帧的净荷减半，那 169.6 µs 的交互会怎样？' },
      options: [
        { en: 'It halves too', zh: '也跟着减半' },
        { en: 'It falls by 40.8 µs — the three symbols you no longer need', zh: '减少 40.8 µs——正好是用不上的那三个符号' },
        { en: 'It does not change', zh: '完全不变' },
      ],
      answer: 1,
      explain: { en: 'Only the symbols shrink, six to three. Preamble, pause and answer are unchanged, so the exchange lands at 128.8 µs.', zh: '缩水的只有符号，从六个变成三个。前导、停顿和回答都没变，所以整次交互落在 128.8 µs。' },
    },
  ],
}
