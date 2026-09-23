/**
 * Wi-Fi Tier 1 · M1 · lesson 5: the byte budget of a frame. What the radio
 * puts in front of every frame and why even a Wi-Fi 7 radio still starts the
 * way an 802.11a one did, what a header and a check really cost once the air
 * is counted in symbols, and what it buys to send many frames behind one preamble.
 *
 * The second half of the old `frame-anatomy`, split per the spec's table
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the first
 * half keeps the header, the addresses and what each field is for. This half
 * loads exactly the scene `frame-anatomy` loads — the same builder, no variant
 * — so the split adds no scenario and the recorded hash of this lesson is
 * `frame-anatomy`'s.
 *
 * The airtime derivation and how the newer preambles grow are in `deeper`; the
 * clause numbers and the model choices are in `sources`.
 *
 * Amendment of 2026-09-23: the sentence that used to promise to "count it" and
 * then point at the count now leads into the count itself — `numbers` carries
 * the six steps of `txTimeModeNs` (src/engine/phy.ts), bytes to bits to
 * symbols to microseconds, with the old laptop's first frame run through them.
 *
 * Every number quoted below is pinned in tests/course/frame-anatomy-bytes.test.ts.
 */
import { J, N, type Lesson } from '../lessonKit'
import {
  frameAnatomyScenario, firstLegacyData, firstQosSingle, firstRtsFrame, firstAmpduFrame,
  firstBlockAck,
} from './frame-anatomy'

export const frameAnatomyBytes: Lesson = {
  id: 'frame-anatomy-bytes',
  module: 0,
  title: { en: 'What a frame costs on the air', zh: '一帧在空口上要花多少' },
  why: {
    en: 'The last lesson opened a frame and named its fields. None of that is free: every byte in front of your data is air nobody else can use, and in front of the frame itself the radio puts something longer still — the preamble. This lesson counts it — what goes in front, what the header and the check add, and why sending many frames behind one preamble is the cheapest trick in the standard.',
    zh: '上一课把一帧打开、把字段都点了名。可这些都不是白来的：你的数据前面每多一个字节，就多一段别人用不了的空口时间；而在这一帧本身之前，射频还要放上更长的一段东西——前导。这一课就把字节数到微秒——前面放的是什么，帧头和校验各添了多少，以及为什么“多帧共用一个前导”是标准里最划算的一招。',
  },
  outcomes: [
    { en: 'name the parts a radio puts in front of every frame and say what each one buys', zh: '说出射频放在每一帧前面的那几段是什么，以及每一段换来了什么' },
    { en: 'add up the bytes of a frame from the payload, the header and the check', zh: '从载荷、帧头和校验，把一帧的字节数加出来' },
    { en: 'explain why two extra header bytes can cost no extra airtime at all', zh: '解释为什么帧头多两个字节，空口时间却可能一点都不多花' },
    { en: 'say what one preamble buys when fourteen frames travel together', zh: '说出十四帧一起走时，一个前导买到了什么' },
  ],
  needs: ['frame-anatomy'],
  terms: [
    { term: 'L-STF', plain: {
      en: 'the very first stretch of any frame: a plain repeating pattern that says "something is starting"',
      zh: '任何一帧最前面的那一小段：一串朴素的重复图案，宣告“有东西开始了”',
    } },
    { term: 'L-LTF', plain: {
      en: 'the stretch after it, long enough for a receiver to measure the channel before a single bit arrives',
      zh: '紧随其后的那一段，长到足够接收端在任何一个比特到来之前，先把信道量一遍',
    } },
    { term: 'L-SIG', plain: {
      en: 'the one field every Wi-Fi radio ever made can read: how fast and how long the rest of this frame is',
      zh: '有史以来每一台 Wi-Fi 射频都读得懂的那个字段：这一帧剩下的部分有多快、有多长',
    } },
    { term: 'preamble', plain: {
      en: 'the fixed stretch of known signal in front of every frame — those three fields, and whatever a newer generation adds behind them',
      zh: '前导：每一帧前面那段固定的已知信号——就是上面这三个字段，加上新一代在它们后面添的东西',
    } },
    { term: 'U-SIG', plain: {
      en: 'the field a Wi-Fi 7 radio adds after those three, saying what the newer format behind it really is',
      zh: 'Wi-Fi 7 的射频在那三段之后再加的一个字段，说明后面那种新格式到底是什么',
    } },
  ],
  picture: [
    { heading: { en: 'The part every radio can read', zh: '人人都读得懂的那一段' }, text: {
      en: 'A receiver cannot start in the middle. Before any of the frame, the radio sends a short repeating pattern (the L-STF), whose whole job is to be noticed: something is beginning, here is where its rhythm falls. Then a longer known pattern (the L-LTF), which the receiver measures the room with — how the walls smeared it on the way — so it can undo the smearing when the bits arrive.',
      zh: '接收端没法从中间开始。在帧的任何部分之前，射频先发出一小段重复的图案，也就是 L-STF，它唯一的任务就是被察觉到：有东西开始了，节拍落在这儿。接着是一段更长的已知图案，也就是 L-LTF，接收端拿它来量这个房间——信号一路过来被墙抹成了什么样——好在比特到达时把这份涂抹还原回去。',
    } },
    { heading: { en: 'Then one field says how long', zh: '再用一个字段说清有多长' }, text: {
      en: 'Now a receiver is locked on but still knows nothing about what follows. The next field is the L-SIG, and it tells the receiver two things and only two: how fast the rest was coded, and how long it runs. That is enough for a radio that cannot decode this frame at all — a neighbour, an older device — to know when the air will be free again. Every generation still sends it, unchanged, at the slowest rate there is. Those three fields are the preamble.',
      zh: '这时接收端已经锁住了信号，可对后面是什么仍一无所知。接下来那个字段就是 L-SIG，它只告诉接收端两件事：后面这段用多快的速率编码、一共有多长。这就足够让一台根本解不出这一帧的射频——邻居的，或者更老的设备——知道空口什么时候会重新空出来。每一代都照样发它，一个字不改，而且用的是最慢的那档速率。这三段合起来，就是前导。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Look at the bars', zh: '看看那几条' }, text: {
      en: 'Load the simulation and jump to the old laptop\'s first frame, then to the phone\'s, opening "Fields on the air" on each. Both blocks split into a preamble and a body; compare how much of each is preamble.',
      zh: '载入仿真，先跳到旧笔记本的第一帧，再跳到手机的那一帧，各自展开“空中字段”。两个块都会分成“前导”和“正身”两截；比一比各自的前导占了多少。',
    } },
    { heading: { en: 'A new radio still starts the old way', zh: '新射频，前导照样按老规矩' }, text: {
      en: 'A Wi-Fi 7 frame could have opened with something better suited to it. It does not. It opens with exactly those three, so that every device in the building can read its length, and only afterwards adds one more field (the U-SIG), which says what the newer format behind it really is. Backwards compatibility is not politeness here; it is the only thing stopping neighbours from talking over each other.',
      zh: '一帧 Wi-Fi 7 的帧本可以用更适合它自己的开头，但它没有。它的前导照样是那三段，好让楼里每一台设备都能读出它有多长；之后才加上一个新字段，也就是 U-SIG，说明后面那种新格式究竟是什么。这里的向后兼容不是客气，而是唯一能防止邻居们互相压着说话的东西。',
    } },
    { heading: { en: 'Counting the bytes', zh: '把字节数出来' }, text: {
      en: 'The frame itself is easy to add up: the header, then your payload, then the check. The header is a fixed size, and the mark for the kind of traffic makes it two bytes longer. But air is not sold by the byte. It is sold in whole symbols, so a frame is rounded up, and two extra bytes often vanish into rounding already being paid for.',
      zh: '帧本身很好加：帧头，加上你的载荷，再加上校验。帧头是固定长度的，而那个业务类别标记会让它长两个字节。可空口不是按字节卖的，是按整个符号卖的：一帧要向上凑成整数个符号，于是多出来的那两个字节，常常就消失在本来就要付的那点凑整里。',
    } },
    { heading: { en: 'Many frames, one preamble', zh: '很多帧，共用一个前导' }, text: {
      en: 'Now look at the preamble again beside a short frame. Sending one small frame at a time means paying that preamble every time. So a client radio (a station, STA) may line up many finished frames, each still with its own header and check, and send them behind a single preamble as one PPDU — and get back one answer covering them all. Before a burst that long it first asks for the room, with a short reservation frame and a go-ahead.',
      zh: '再把那个前导和一个短帧放在一起看。一次只发一个小帧，就意味着每次都要付一遍前导。于是客户端设备——站点（STA）——可以把许多造好的帧排成一队，每一帧仍有自己的帧头和校验，跟在同一个前导后面作为一个 PPDU 发出；回来的也是一个覆盖全部的回复。而在这么长的一个突发之前，它会先用一个短的预约帧把房间要下来，等到放行帧再发。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'What goes in front, generation by generation', zh: '各代射频，前面放的是什么' }, head: [
      { en: 'Generation', zh: '代际' }, { en: 'In front of the frame', zh: '帧前面的部分' }, { en: 'One data symbol', zh: '一个数据符号' },
    ], rows: [
      [N('802.11a'), { en: '20 µs: L-STF and L-LTF 16 µs, then L-SIG 4 µs', zh: '20 µs：L-STF 与 L-LTF 共 16 µs，再加 L-SIG 4 µs' }, N('4 µs')],
      [N('Wi-Fi 5'), N('40 µs'), N('4 µs')],
      [N('Wi-Fi 6'), { en: '44 µs, and 4 µs more in a frame shared by several devices', zh: '44 µs；多设备共享的帧再多 4 µs' }, N('13.6 µs')],
      [N('Wi-Fi 7'), { en: '48 µs, and 4 µs more in a frame shared by several devices', zh: '48 µs；多设备共享的帧再多 4 µs' }, N('13.6 µs')],
    ] },
    { kind: 'formula', heading: { en: 'How long a legacy frame takes', zh: '一个传统帧要占多久' }, text: {
      en: 'TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉ µs',
      zh: 'TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉ µs',
    }, note: {
      en: 'N_DBPS is the data bits one symbol carries: 216 at 54 Mb/s, 96 at 24 Mb/s. The ceiling is the rounding — air is paid for in whole symbols.',
      zh: 'N_DBPS 是一个符号能装的数据比特数：54 Mb/s 时是 216，24 Mb/s 时是 96。那个向上取整就是凑整——空口按整符号付费。',
    } },
    { kind: 'formula', heading: { en: 'Counting one frame', zh: '数一帧的字节' }, text: {
      en: '24 + 1500 + 4 = 1528 B      ·      26 + 1500 + 4 = 1530 B with the mark',
      zh: '24 + 1500 + 4 = 1528 B      ·      带标记时 26 + 1500 + 4 = 1530 B',
    }, note: {
      en: 'The two extra bytes buy no extra symbol here, so they cost nothing.',
      zh: '多出的那两个字节没有换来一个新符号，所以在这里是白送的。',
    } },
    { kind: 'steps', heading: { en: 'From bytes to microseconds, step by step', zh: '从字节到微秒，一步一步算' }, items: [
      { en: 'Count the bytes of the frame: the header, the payload as it came down, and the four-byte check — 24 + 1500 + 4 = 1528 B for the old laptop.',
        zh: '先数这一帧的字节：帧头、交下来的载荷，再加四个字节的校验——旧笔记本这一帧是 24 + 1500 + 4 = 1528 B。' },
      { en: 'Turn those bytes into bits, and add the short field the radio sends in front of them and the tail bits behind: 16 + 8 × 1528 + 6 bits.',
        zh: '把这些字节换成比特，再加上射频放在它们前面的那个短字段和后面的尾比特：16 + 8 × 1528 + 6 个比特。' },
      { en: 'Divide by what one symbol carries at the rate in use — 216 bits at 54 Mb/s — and round up, because a part-filled symbol is sent whole: 57 symbols.',
        zh: '除以当前速率下一个符号能装的比特数——54 Mb/s 时是 216——然后向上取整，因为没装满的符号也要整个发出去：57 个符号。' },
      { en: 'Pay for the preamble this generation always sends, then for the symbols: 20 µs, then 57 × 4 µs, which is 248 µs of air.',
        zh: '先付这一代必发的那个前导，再付符号：20 µs，加上 57 × 4 µs，一共 248 µs 空口时间。' },
      { en: 'A newer radio changes only the two sizes: a 44 or 48 µs preamble, and a symbol of 13.6 µs that carries many more bits.',
        zh: '更新的射频只改这两个尺寸：前导变成 44 或 48 µs，符号变成 13.6 µs，而一个符号能装的比特多得多。' },
      { en: 'Now redo step 1 with the traffic mark: 1530 B, and step 3 still rounds up to 57 symbols. That is why two bytes can cost no airtime at all.',
        zh: '再带上业务标记把第 1 步重做一遍：1530 B；到第 3 步，向上取整得到的仍是 57 个符号。这就是两个字节有可能一点空口时间都不花的原因。' },
    ] },
    { kind: 'table', heading: { en: 'The old laptop\'s first frame, run through the steps', zh: '旧笔记本的第一帧，照着步骤走一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'Bytes of the frame', zh: '这一帧的字节' }, N('24 + 1500 + 4 = 1528 B')],
      [{ en: 'Bits to send', zh: '要发的比特' }, N('16 + 8 × 1528 + 6 = 12 246')],
      [{ en: 'Bits in one symbol, 54 Mb/s', zh: '54 Mb/s 下一个符号的比特' }, N('216')],
      [{ en: 'Symbols, rounded up', zh: '向上取整后的符号数' }, N('57')],
      [{ en: 'Preamble, then symbols', zh: '先前导，后符号' }, N('20 + 57 × 4 µs')],
      [{ en: 'so the frame is on the air for', zh: '于是这一帧占用空口' }, N('248 µs')],
    ] },
    { kind: 'table', heading: { en: 'The small frames carry only what they need', zh: '小帧只带非带不可的东西' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'What is in it', zh: '里面有什么' }, { en: 'Size', zh: '大小' },
    ], rows: [
      [N('Ack, CTS'), { en: 'Frame Control, Duration, Address 1, FCS', zh: '帧控制、持续时间、地址 1、FCS' }, N('14 B')],
      [N('RTS'), { en: 'the same, plus Address 2 — the answer has to come back to it', zh: '同样的内容，再加地址 2——回复得找得到它' }, N('20 B')],
      [N('BlockAck'), { en: 'the BlockAck (one answer for a whole burst): both addresses, a start number, a 64-bit map', zh: 'BlockAck（一整串帧只换一个回答）：两个地址、一个起始序号、一张 64 位位图' }, N('32 B')],
    ] },
    { heading: { en: 'What a small frame costs', zh: '一个小帧要花多少' }, text: {
      en: 'A 14 B answer at 24 Mb/s fills two symbols and takes 28 µs of air, 20 µs of it preamble.',
      zh: '一个 14 B 的回复在 24 Mb/s 下占两个符号，要 28 µs 空口时间，其中 20 µs 是前导。',
    } },
    { kind: 'formula', heading: { en: 'Lining them up behind one preamble', zh: '把它们排在一个前导后面' }, text: {
      en: 'one place in the queue = a 4 B delimiter + the frame + padding up to a multiple of four',
      zh: '队列里的一个位置 = 4 B 的分隔符 + 那一帧 + 补齐到 4 的倍数的填充',
    }, note: {
      en: 'Fourteen of the Wi-Fi 5 laptop\'s frames go together: 13 × 1536 + 1534 = 21 502 B, all of it behind one preamble. Only the last one needs no padding.',
      zh: 'Wi-Fi 5 笔记本的十四帧一起走：13 × 1536 + 1534 = 21 502 B，全都跟在同一个前导后面。只有最后一个不必填充。',
    } },
    { kind: 'table', heading: { en: 'What the reservation around that burst says', zh: '那个突发外面的预约写了什么' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'Duration it writes', zh: '它写的持续时间' }, { en: 'What that covers', zh: '这段覆盖了什么' },
    ], rows: [
      [N('RTS'), N('2356 µs'), { en: 'the go-ahead, the burst, the reply and three gaps', zh: '放行帧、突发、回复，外加三个间隔' }],
      [N('CTS'), N('2312 µs'), { en: 'the same reservation, less one gap and itself', zh: '同一个预约，减去一个间隔和它自己' }],
      [{ en: 'The burst', zh: '那个突发' }, N('48 µs'), { en: 'one gap and the reply that follows it', zh: '一个间隔，加上随后的那个回复' }],
      [{ en: 'The reply', zh: '那个回复' }, N('0'), { en: 'nothing follows it', zh: '它后面什么都没有了' }],
    ] },
  ],
  deeper: [
    { heading: { en: 'Where the airtime formula comes from', zh: '空口时长公式是怎么来的' }, text: {
      en: 'The 16 µs is L-STF plus L-LTF and the 4 µs is L-SIG; after them the data symbols carry a 16-bit SERVICE field, the PSDU, 6 tail bits and padding up to a whole symbol. That is the 16 and the 6 inside the ceiling. At 54 Mb/s a 1528 B frame needs ⌈(16 + 12 224 + 6) ÷ 216⌉ = 57 symbols, and 20 + 57 × 4 = 248 µs.',
      zh: '那 16 µs 是 L-STF 加 L-LTF，4 µs 是 L-SIG；再往后的数据符号里装着 16 比特的 SERVICE 字段、PSDU、6 个尾比特，以及补齐到整符号的填充——取整式里的 16 和 6 就是它们。54 Mb/s 下，1528 B 的一帧需要 ⌈(16 + 12 224 + 6) ÷ 216⌉ = 57 个符号，20 + 57 × 4 = 248 µs。',
    } },
    { heading: { en: 'Why the newer preambles are only representative', zh: '为什么更新的前导只是代表值' }, text: {
      en: 'The 40, 44 and 48 µs above are single-user values for 20 MHz and one spatial stream. A real VHT, HE or EHT preamble grows with the number of streams — each one needs its own training field — and with the number of users a multi-user frame serves, which is what the extra 4 µs of HE-SIG-B or EHT-SIG pays for. The simulator quotes one representative figure per generation instead of modelling that growth.',
      zh: '上面的 40、44、48 µs 是 20 MHz、单空间流下的单用户取值。真实的 VHT、HE 或 EHT 前导会随空间流数增长——每条流都要有自己的训练字段——也会随多用户帧所服务的用户数增长，多出的那 4 µs HE-SIG-B 或 EHT-SIG 正是为此付的。仿真器没有建模这种增长，每一代只给一个代表值。',
    } },
    { heading: { en: 'The answer policy inside an aggregate', zh: '聚合帧里的确认策略' }, text: {
      en: 'The two ack-policy bits of QoS Control read Normal Ack on a lone frame; the same two bits inside an A-MPDU mean Implicit Block Ack Request, which is why fourteen frames come back answered by one 32 B BlockAck carrying a 64-bit bitmap rather than by fourteen 14 B Acks.',
      zh: 'QoS 控制里的两个确认策略比特，在单独一帧上读作 Normal Ack；同样这两个比特放在 A-MPDU 里，含义是 Implicit Block Ack Request。这正是十四帧只换回一个带 64 位位图、32 B 的 BlockAck，而不是十四个 14 B 的 Ack 的原因。',
    } },
  ],
  sources: [
    { en: 'The non-HT preamble and the airtime formula are IEEE Std 802.11-2024 §17.3.2 and §17.4.3; the L-STF, L-LTF and L-SIG names are Clause 17\'s own. The 20 µs preamble and the 4 µs symbol are the standard\'s values, not model choices.',
      zh: '非 HT 前导与空口时长公式见 IEEE Std 802.11-2024 §17.3.2 与 §17.4.3；L-STF、L-LTF、L-SIG 这几个名字也出自第 17 章。20 µs 的前导与 4 µs 的符号是标准里的数值，不是模型取值。' },
    { en: 'The 40, 44 and 48 µs preambles and the 13.6 µs symbol are this simulator\'s representative single-user values for 20 MHz and one stream; the real ones grow with streams and users (Clause 21, 27 and 36). The U-SIG that follows the legacy fields in a Wi-Fi 7 frame is §36.3.12.',
      zh: '40、44、48 µs 的前导与 13.6 µs 的符号，是本仿真器在 20 MHz、单流下的代表性单用户取值；真实值会随空间流数与用户数增长（第 21、27、36 章）。Wi-Fi 7 帧里跟在传统字段之后的 U-SIG 见 §36.3.12。' },
    { en: 'The control-frame sizes are §9.3.1 and the A-MPDU subframe — a 4-octet delimiter, the MPDU, then padding to a 4-octet boundary with none after the last — is §9.8. Every duration and byte count above is measured off this lesson\'s own scenario.',
      zh: '控制帧的大小见 §9.3.1；A-MPDU 子帧——4 个八位组的分隔符、MPDU，再补齐到 4 字节边界（最后一个不补）——见 §9.8。上面每一个时长和字节数，都是在本课场景里实测出来的。' },
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('first legacy data frame', '第一个传统数据帧', firstLegacyData),
    J('first QoS data frame', '第一个 QoS 数据帧', firstQosSingle),
    J('first RTS', '第一个 RTS', firstRtsFrame),
    J('first A-MPDU', '第一个 A-MPDU', firstAmpduFrame),
    J('first BlockAck', '第一个 BlockAck', firstBlockAck),
  ],
  observe: [
    {
      en: 'Compare the two bars. The old laptop\'s frame is 16 µs of pattern and 4 µs of length field before 57 data symbols; the phone\'s Wi-Fi 6 frame is a 44 µs preamble and one 13.6 µs symbol — nearly all preamble.',
      zh: '对比这两条。旧笔记本那一帧是 16 µs 的图案加 4 µs 的长度字段，之后才是 57 个数据符号；手机那一帧（Wi-Fi 6）是 44 µs 的前导加一个 13.6 µs 的符号——几乎全是前导。',
    },
    {
      en: 'Jump to the first reservation, at 2.298 ms, and then to the burst behind it: 14 frames and 21 502 B, all of it one block. The single reply covering the lot lands at 4.650 ms and writes 0 — nothing follows it.',
      zh: '跳到第一次预约（2.298 ms），再跳到它后面的那个突发：14 帧、21 502 B，全都是一个块。覆盖全部的那一个回复出现在 4.650 ms，写的持续时间是 0——它后面什么都没有了。',
    },
  ],
  tryThis: [
    {
      en: 'In the editor raise the reservation threshold above 21 502 B. The bursts go out with nothing in front of them: the two small frames and the gaps they cost are gone.',
      zh: '在编辑器里把预约门限抬到 21 502 B 以上。突发前面就什么都没有了：那两个小帧、以及它们带来的间隔都省掉了。',
    },
    {
      en: 'Change the old laptop to Wi-Fi 5. Its lone frames become bursts of many behind one preamble, each opened by a reservation; its lane goes from many small blocks to a few long ones.',
      zh: '把旧笔记本改成 Wi-Fi 5。它原本一帧一帧地发，变成许多帧共用一个前导的突发，每个突发前还有一次预约；那条泳道也从许多小块变成几个长块。',
    },
  ],
  quiz: [
    {
      q: { en: 'Why does a Wi-Fi 7 frame still begin with fields designed in 1999?', zh: '为什么一帧 Wi-Fi 7 的帧，开头用的仍是 1999 年设计的字段？' },
      options: [
        { en: 'Because the newer fields would not fit at the front', zh: '因为新字段放不进最前面' },
        { en: 'So that any radio nearby, however old, can read how long the air will be busy', zh: '这样附近任何一台射频，不管多老，都能读出空口会忙多久' },
        { en: 'Because the L-SIG carries the addresses', zh: '因为 L-SIG 里装着地址' },
      ],
      answer: 1,
      explain: { en: 'A device that cannot decode the frame can still read the L-SIG and stay quiet for exactly as long as it says.', zh: '解不出这一帧的设备，照样能读懂 L-SIG，并且正好安静那么久。' },
    },
    {
      q: { en: 'The traffic mark makes the header two bytes longer, yet the frame takes exactly as long on the air. How?', zh: '业务标记让帧头长了两个字节，可这一帧在空口上的时间一点没变。为什么？' },
      options: [
        { en: 'The mark is sent in the preamble, which is a fixed length', zh: '标记是放在前导里发的，而前导是固定长度' },
        { en: 'Air is paid for in whole symbols, and the last one had room to spare', zh: '空口按整符号付费，而最后那个符号本来就还有空位' },
        { en: 'The check gets two bytes shorter to make room', zh: '校验会相应短两个字节，腾出位置' },
      ],
      answer: 1,
      explain: { en: 'Both round up to 57 symbols and both take 248 µs. Two bytes cost airtime only when they push the frame into one more symbol.', zh: '两者都向上凑成 57 个符号，都是 248 µs。只有当那两个字节把帧顶进下一个符号时，才真的要花时间。' },
    },
    {
      q: { en: 'What does sending fourteen frames behind one preamble actually save?', zh: '十四帧共用一个前导，真正省下的是什么？' },
      options: [
        { en: 'The headers and the checks: the fourteen frames become one', zh: '省下帧头和校验：十四帧变成了一帧' },
        { en: 'Thirteen preambles, thirteen turns at waiting, and thirteen separate answers', zh: '省下十三个前导、十三次排队，以及十三个各自的回复' },
        { en: 'Nothing on the air; it only saves work in the sender', zh: '空口上什么也没省；省的只是发送端的活儿' },
      ],
      answer: 1,
      explain: { en: 'Each frame keeps its own header and check — that is why the burst is 21 502 B. What goes is the repetition around them.', zh: '每一帧都保留自己的帧头和校验——突发之所以是 21 502 B，原因就在这里。省掉的是它们外面那些重复。' },
    },
  ],
}
