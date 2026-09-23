/**
 * Wi-Fi Tier 2 · M7 · Scheduled Wi-Fi 6/7 · OFDMA on the downlink.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the
 * channel cut into slices so one send carries data for several devices at
 * once; who decides the slices; what that buys when the frames are small and
 * what it cannot buy at all. `numbers` closes with the engine's own procedure
 * for building one such send, and the first one of the run through it row by
 * row. The clause numbers live in `sources`.
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below is pinned in tests/course/ofdma-dl.test.ts.
 */
import { type Lesson, N, oneRoom, node, sc, txOf, firstMuDl, J } from '../lessonKit'

export const ofdmaDl: Lesson = {
  id: 'ofdma-dl',
  module: 6,
  title: { en: 'OFDMA downlink — one send, several phones', zh: 'OFDMA 下行——一次发送，好几台设备' },
  why: {
    en: 'A television streaming a film does not need much of the air at a time, but it does need a turn: its own preamble, its own answer, its own wait beforehand. Put three of them in one room and the access point (AP) spends much of its evening on those wrappers rather than on film. This lesson watches an access point stop serving one device per turn and start serving several inside a single send.',
    zh: '一台正在放片子的电视，每次并不需要占多少空口，但它需要一个“轮次”：自己的前导、自己的回执、之前还要自己等一轮。同一个房间里放三台，接入点（AP）整晚花在这些包装上的工夫，就多过花在片子上。这一课要看的是：接入点如何不再一轮只服务一台设备，而是在一次发送里同时服务好几台。',
  },
  outcomes: [
    { en: 'say what an access point divides up when it serves several devices in one send', zh: '说出接入点在一次发送里服务多台设备时，被切分的到底是什么' },
    { en: 'read one multi-user PPDU off the timeline: who is inside it, how long it took, how it was answered', zh: '在时间轴上读出一个多用户 PPDU：里面有谁、花了多久、怎么被确认的' },
    { en: 'say when cutting the channel into slices saves air, and when it saves nothing at all', zh: '说出把信道切成小片什么时候省空口，什么时候一点也省不下' },
  ],
  needs: ['width', 'txop'],
  terms: [
    { term: 'OFDMA', plain: {
      en: 'orthogonal frequency-division multiple access: cutting one channel into slices so a single send can carry data for several devices at once',
      zh: '正交频分多址：把一条信道切成几片，让一次发送能同时装着发给好几台设备的数据',
    } },
    { term: 'resource unit', plain: {
      en: 'one slice: the block of sub-carriers handed to one device inside one send',
      zh: '一片：一次发送里分给某一台设备的那一组子载波',
    } },
    { term: 'RU', plain: {
      en: 'the short name for a resource unit, and the one the trace prints',
      zh: '资源单元的简称，也是仿真记录里印出来的那个名字',
    } },
    { term: 'MU', plain: {
      en: 'multi-user: said of a send whose parts belong to different devices',
      zh: '多用户：形容一次发送里的各个分片分别属于不同的设备',
    } },
  ],
  picture: [
    { heading: { en: 'One send, cut into slices', zh: '一次发送，切成几片' }, text: {
      en: 'The channel is already made of narrow sub-carriers, and nothing says they must all carry the same conversation. Deal them out in blocks instead — this block to that phone, that block to the television — and one send can carry data for several devices at the same time. Each device reads its own block and ignores the rest. That is OFDMA, and one block of it is a resource unit.',
      zh: '信道本来就是由一根根很窄的子载波拼起来的，而且谁也没规定它们必须都为同一段对话服务。换个分法：把它们成块地分出去——这一块给那部手机，那一块给电视——于是一次发送就能同时装着发给好几台设备的数据。每台设备只读属于自己的那一块，其余的一概不管。这就是 OFDMA，而其中的一块，就是一个资源单元。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first multi-user send. Hover the wide blue block: two televisions are named inside one frame. A short gap after it, two answers begin at the very same instant, side by side on different lanes.',
      zh: '载入仿真，跳到第一次多用户发送。把鼠标停在那个宽蓝块上：一帧里点着两台电视的名字。它结束之后隔一小段，两个回执在同一个瞬间一起开始，并排落在不同的泳道上。',
    } },
    { heading: { en: 'Who decides the slices', zh: '谁来决定怎么切' }, text: {
      en: 'Nobody negotiates a slice. The access point alone decides, once it has won its turn: it looks at which devices have something waiting for them at that instant, takes up to four of them, gives each an equally sized resource unit (RU), and sends. The devices it did not take are not refused — there was simply nothing in their queue to put in. What goes out is called an MU PPDU, and that is the name the trace prints beside it.',
      zh: '切片不是谈出来的。赢下这一轮之后，由接入点一个人决定：它看一眼此刻有哪些设备的东西正等着发，最多挑四台，给每台分一个同样大的资源单元（RU），然后发出去。没被挑中的设备不是被拒绝了——只是它们的队列里此刻根本没有东西可装。发出去的这一帧，记录里叫作 MU PPDU。',
    } },
    { heading: { en: 'What the slices buy', zh: '切片买来了什么' }, text: {
      en: 'Every send starts with a preamble the receiver locks on to, and ends in an answer. Two frames sent one after the other pay for two preambles and two answers; the same two frames inside one send pay for one preamble, and the two answers come back together instead of in a queue. Each part is on a narrower slice, so it needs more symbols than it would alone — but the wrappers are paid once.',
      zh: '每一次发送，开头都有一段前导让接收端锁定，结尾都要收一个回执。两帧一前一后地发，就要付两段前导、两个回执；同样这两帧装进一次发送，只付一段前导，而两个回执是一起回来的，不必排队。每一片都更窄，所以同一帧要用比单独发时更多的符号——但包装只付一次。',
    } },
    { heading: { en: 'And what they cannot buy', zh: '切片买不来的东西' }, text: {
      en: 'Slicing makes no link faster. A television asks for the film it asks for, so it receives exactly the frames it would have received anyway; what it saves is air, and the air it saves belongs to whoever else wants the room. Nor can the access point group devices with empty queues: two of them must have something waiting in the same instant, which in a room of steady streams is not most instants.',
      zh: '切片不会让任何一条链路变快。电视要多少片子就是多少，它收到的帧和本来会收到的一模一样；省下来的是空口，而省下的这点空口属于房间里其他想说话的人。接入点也没法把队列是空的设备凑成一组：必须有两台设备在同一瞬间都有东西等着发，而在一屋子平稳的视频流里，这样的瞬间并不多。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'Two video frames to Wi-Fi 6 televisions, two ways',
      zh: '同样两个视频帧发给 Wi-Fi 6 电视，两种发法',
    }, head: [
      { en: 'Way', zh: '发法' }, { en: 'Preamble', zh: '前导' }, { en: 'Data symbols each', zh: '每帧数据符号' },
      { en: 'On the air', zh: '占用空口' }, { en: 'Answer', zh: '回执' },
    ], rows: [
      [{ en: 'One at a time', zh: '一帧一帧发' }, N('44 µs × 2'), N('6 + 6'), N('125.6 µs × 2'),
        { en: 'two ACK frames, 28 µs each, one after the other', zh: '两个 ACK 帧，各 28 µs，一前一后' }],
      [{ en: 'One MU PPDU', zh: '一个 MU PPDU' }, N('48 µs'), N('12'), N('211.2 µs'),
        { en: 'two BlockAck frames, 32 µs each, at the same instant', zh: '两个 BlockAck 帧，各 32 µs，同一瞬间' }],
    ] },
    { kind: 'formula', heading: { en: 'Why twelve symbols and not six', zh: '为什么是十二个符号而不是六个' }, text: {
      en: 'symbols = ⌈(16 + 8·bytes + 6) ÷ (bits per symbol × RU share)⌉',
      zh: '符号数 = ⌈(16 + 8·字节数 + 6) ÷ (每符号比特数 × RU 占比)⌉',
    }, note: {
      en: 'Half the sub-carriers, twice the symbols. 44 µs is a Wi-Fi 6 frame’s preamble (a Wi-Fi 7 frame’s is the 48 of the width lesson); the map of who is in the send adds four microseconds. The pair still leaves in 211.2 µs against 251.2.',
      zh: '子载波少一半，符号数就翻一倍。44 µs 是一个 Wi-Fi 6 帧的前导——Wi-Fi 7 帧的前导则是带宽那一课里的 48——而“这一发里有谁”的分配表又添了四微秒。即便如此，两帧一起走只要 211.2 µs，而一前一后地发要 251.2 µs。',
    } },
    { kind: 'table', heading: {
      en: 'The whole run: three televisions, 300 ms',
      zh: '整段仿真：三台电视，300 ms',
    }, head: [
      { en: 'Measured', zh: '测量项' }, { en: 'With OFDMA', zh: '开 OFDMA' }, { en: 'Without', zh: '关 OFDMA' },
    ], rows: [
      [{ en: 'Sends the access point made downwards', zh: '接入点向下发送的次数' }, N('1016'), N('1061')],
      [{ en: '…of those, sends carrying two televisions', zh: '其中装着两台电视的' }, N('45'), N('0')],
      [{ en: 'Frames delivered to television 1 / 2 / 3', zh: '电视 1 / 2 / 3 收到的帧数' },
        N('352 / 355 / 354'), N('352 / 355 / 354')],
      [{ en: 'Film delivered to each, per second', zh: '每台电视每秒收到的片子' },
        N('13.1 / 13.3 / 13.2 Mb/s'), N('13.1 / 13.3 / 13.2 Mb/s')],
      [{ en: 'Time the air was busy', zh: '空口忙碌的总时间' }, N('161.5 ms'), N('163.0 ms')],
    ] },
    { heading: { en: 'The same film, less air', zh: '同样的片子，更少的空口' }, text: {
      en: 'Every television receives exactly the frames it received before, so nothing on any screen changes. What changes is the air. Each pair saves 40 µs of preamble and hands 8 µs of it back on the larger answers, and the 45 pairs of this run come to 1.44 ms handed back to everybody else in the room.',
      zh: '每台电视收到的帧和原来一模一样，所以屏幕上什么也不会变。变的是空口。每凑成一对，就省下 40 µs 的前导，又因为回执变大而还回去 8 µs；这段仿真里的 45 对，合起来是 1.44 ms，还给了房间里其他所有人。',
    } },
    { kind: 'steps', heading: { en: 'Building one multi-user send, step by step', zh: '一次多用户发送是怎么攒出来的，一步一步' }, items: [
      { en: 'The access point wins a turn and lists the devices that have something queued for them right now and have negotiated OFDMA with it. Fewer than two on that list and it sends the ordinary way, to one device.',
        zh: '接入点赢下一轮，先列出此刻队列里有东西、并且和它协商过 OFDMA 的设备。名单上不到两台，它就走老路，只发给一台。' },
      { en: 'It keeps the first four of the list, and cuts the tones into that many equal resource units: with two members each gets half of them, with three a third.',
        zh: '名单上只留前四台，再把子载波切成同样多的等分资源单元：两个成员就一人一半，三个成员就一人三分之一。' },
      { en: 'For each member it works out the bits one symbol carries: the bits its own rung carries on one stream in a 20 MHz channel — 1950 for these televisions — times its share of the tones, which here halves it to 975.',
        zh: '接着为每个成员算出一个符号能驮多少比特：先取它那一级在 20 MHz 信道、单流下的比特数——这几台电视是 1950——再乘上它分到的子载波占比，这里正好折半，得到 975。' },
      { en: 'It fills each member from that device’s queue and counts its symbols: ⌈(16 + 8 × bytes + 6) ÷ bits per symbol⌉. A member whose first frame alone would not fit the turn is dropped instead.',
        zh: '然后从这台设备的队列里往它那一份里装，并数出符号数：⌈(16 + 8 × 字节数 + 6) ÷ 每符号比特数⌉。要是某个成员连第一帧都塞不进这一轮，就把它整个去掉。' },
      { en: 'The send lasts as long as its longest member needs: 44 µs of preamble, 4 µs more for the map of who is inside, then 13.6 µs a symbol. The preamble and the map are paid once for the whole group, which is the entire saving.',
        zh: '整次发送的长度，取最长的那个成员所需的长度：44 µs 前导，再加 4 µs 装“这一发里有谁”的分配表，然后每个符号 13.6 µs。前导和分配表整组只付一次——省下来的就是这一笔。' },
      { en: 'One 16 µs gap after it ends, every member answers with a 32 µs BlockAck on its own resource unit, all in the same instant. The exchange counts as done if any member answered; whatever the others were sent is queued again.',
        zh: '结束后隔 16 µs，每个成员各在自己的资源单元上回一个 32 µs 的 BlockAck，全都落在同一瞬间。只要有一个成员答了，这次交互就算成，其余成员那一份重新排队。' },
    ] },
    { kind: 'table', heading: { en: 'The first multi-user send, run through the steps', zh: '第一次多用户发送，照着步骤走一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'Devices with something queued', zh: '此刻队列里有东西的设备' }, N('2')],
      [{ en: 'Share of the tones each', zh: '每个成员分到的子载波占比' }, N('0.5')],
      [{ en: 'Bits per symbol each', zh: '每个成员每符号比特数' }, N('1950 × 0.5 = 975')],
      [{ en: 'Bytes put in for each', zh: '每个成员装进去的字节' }, N('1434 B')],
      [{ en: 'Symbols each', zh: '每个成员的符号数' }, N('⌈11494 ÷ 975⌉ = 12')],
      [{ en: 'so the send lasts', zh: '于是这次发送的长度是' }, N('44 + 4 + 13.6 × 12 = 211.2 µs')],
      [{ en: 'and 16 µs later it is answered by', zh: '16 µs 之后回来的确认是' }, N('2 × 32 µs')],
    ] },
  ],
  deeper: [
    { heading: { en: 'Why the group is two and not three', zh: '为什么一组是两台而不是三台' }, text: {
      en: 'The engine takes up to four members, and the three televisions here could all fit — a third member would simply make every slice a third of the channel instead of a half. It never happens: a steady video stream delivers a frame and then waits, so the chance that a third queue is non-empty in the very instant the access point wins its turn is small. Grouping is opportunistic, and the opportunity is the queue, not the radio.',
      zh: '引擎一组最多收四个成员，这里的三台电视其实都塞得下——再加一个成员，无非是每片从半条信道变成三分之一条。可它从来没发生过：平稳的视频流发一帧、等一会儿，于是在接入点恰好赢下这一轮的那个瞬间，第三条队列非空的概率很小。分组是见机行事的，而机会在队列里，不在电台里。',
    } },
    { heading: { en: 'Where the extra four microseconds go', zh: '多出来的那四微秒去哪儿了' }, text: {
      en: 'A single-user send opens with 44 µs of preamble; a multi-user one opens with 48. The difference carries the per-user map: which resource unit belongs to which device, and at which modulation each part was sent. Without it a receiver could not know which part of the channel to read, so the map is the price of the whole idea — and it is a flat price, which is why grouping pays better the more members share it.',
      zh: '单用户发送的前导是 44 µs，多用户是 48 µs。差出来的这一段装的是每用户分配表：哪个资源单元属于哪台设备、每一片用的是哪一档调制。没有它，接收端就不知道该去读信道的哪一段，所以这张表是整个想法的价钱——而且是一口价，成员越多越划算，道理就在这里。',
    } },
  ],
  sources: [
    { en: 'The downlink OFDMA PPDU, its per-user fields and the resource-unit sizes are Clause 27 of IEEE Std 802.11-2024 (the HE PPDU of 802.11ax); this room’s televisions are Wi-Fi 6 stations, so the access point sends an HE MU PPDU rather than the 802.11be one.',
      zh: '下行 OFDMA 的 PPDU、其每用户字段与资源单元尺寸，出自 IEEE Std 802.11-2024 第 27 章（802.11ax 的 HE PPDU）；本房间里的电视是 Wi-Fi 6 站点，所以接入点发的是 HE MU PPDU，而不是 802.11be 的那种。' },
    { en: 'The 44 µs preamble, the extra 4 µs of multi-user signalling and the 13.6 µs symbol are this simulator’s single representative values for such a PPDU, not a field-by-field sum; the airtime they feed is the TXTIME formula of §17.4.3.',
      zh: '44 µs 的前导、多用户信令多出的 4 µs 以及 13.6 µs 的符号，是本仿真器为这类 PPDU 取的单一代表值，并非逐字段相加；它们代入的空口时间公式是 §17.4.3 的 TXTIME。' },
    { en: 'That the acknowledgements come back simultaneously is the standard’s solicited response: the access point asks for them with a Trigger, or with the TRS field carried in each station’s own part, and they return as trigger-based PPDUs (Clause 26.5). The simulator draws them as BlockAcks on each station’s own slice and charges the same airtime.',
      zh: '确认帧同时返回，在标准里是被征询的响应：接入点用 Trigger 帧、或用各站点自己那一片里携带的 TRS 字段发起征询，站点以基于触发的 PPDU 返回（第 26.5 节）。仿真器把它们画成各站点自己那一片上的 BlockAck，并按同样的空口时间计费。' },
    { en: 'The cap of four members in one group is this engine’s own limit (`muDsts.slice(0, 4)` in mac.ts), not the standard’s: 802.11ax allows far more, down to 26-tone resource units.',
      zh: '“一组最多四个成员”是本引擎自己的限制（mac.ts 里的 `muDsts.slice(0, 4)`），不是标准的规定：802.11ax 允许的成员数远不止于此，资源单元最小可到 26 个子载波。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3, 5.5, 'he', 'video'),
    node('sta-2', 'TV 2', 'sta', 5, 6.5, 'he', 'video'),
    node('sta-3', 'TV 3', 'sta', 7, 5.5, 'he', 'video'),
  ]),
  jumps: [
    J('first multi-user send', '第一次多用户发送', firstMuDl),
    J('simultaneous BlockAcks', '同时发出的 BlockAck', txOf((r) => r.frame.kind === 'ba' && r.frame.orthogonalGroup !== undefined)),
  ],
  observe: [
    { en: 'Jump to the first multi-user send. The wide blue block runs 211.2 µs and carries 1434 bytes for each of two televisions; the third is not in it, because nothing was waiting for it at that instant.', zh: '跳到第一次多用户发送。那个宽蓝块长 211.2 µs，为两台电视各装了 1434 字节；第三台不在里面，因为那个瞬间没有东西在等着发给它。' },
    { en: 'One short gap later, two BlockAck frames of 32 µs begin at the same instant on different lanes. They do not collide: each one answers on its own slice of the channel, and the access point hears both.', zh: '隔一小段之后，两个 32 µs 的 BlockAck 在不同泳道的同一瞬间开始。它们不会碰撞：各自在自己那片信道上作答，接入点两个都听得见。' },
    { en: 'Most sends are still ordinary ones. Over the run the access point sends 1016 times downwards and only 45 of those carry two televisions — grouping needs two queues with something in them in the same instant.', zh: '大多数发送仍然是普通的。整段仿真里接入点向下发了 1016 次，其中只有 45 次装着两台电视——凑成一组，需要两条队列在同一瞬间都有东西。' },
  ],
  tryThis: [
    { en: 'Open in editor and turn OFDMA off on television 1. It leaves every group at once: the other two still pair up, 11 times over the run, and television 1 is served on its own from then on.', zh: '点“在编辑器中打开”，关掉电视 1 的 OFDMA。它立刻退出所有分组：另外两台照样凑成一组，整段仿真里凑了 11 次，而电视 1 从此只被单独服务。' },
    { en: 'Turn OFDMA off on all four devices and reload. Every send now serves one television, 1061 of them, each television receives exactly what it received before, and the air is busy 1.44 ms longer over the run.', zh: '把四台设备的 OFDMA 全部关掉再重新载入。现在每次发送只服务一台电视，共 1061 次，每台电视收到的东西和原来分毫不差，而整段仿真里空口多忙了 1.44 ms。' },
  ],
  quiz: [
    {
      q: { en: 'Two BlockAck frames start at the very same instant. Why don’t they collide?', zh: '两个 BlockAck 帧在同一瞬间开始。它们为什么不会碰撞？' },
      options: [
        { en: 'They are short enough to fit between each other', zh: '它们足够短，能互相挤过去' },
        { en: 'Each answers on its own resource unit, so they sit side by side in frequency rather than on top of each other', zh: '各自在自己的资源单元上作答，于是它们在频率上并排，而不是叠在一起' },
        { en: 'The access point cancels the interference afterwards', zh: '接入点事后把干扰消掉了' },
      ],
      answer: 1,
      explain: { en: 'OFDMA divides frequency, not time. Two transmissions on different slices of the channel do not interfere, which is exactly why the answers can be simultaneous.', zh: 'OFDMA 分的是频率而不是时间。落在信道不同片上的两次传输互不干扰，回执之所以能同时发出，原因正在这里。' },
    },
    {
      q: { en: 'With OFDMA on, each television receives exactly the same frames it received without it. So what did OFDMA buy?', zh: '开了 OFDMA 之后，每台电视收到的帧和不开时完全一样。那么 OFDMA 究竟买到了什么？' },
      options: [
        { en: 'Nothing — grouping is only worth it on the uplink', zh: '什么也没买到——分组只在上行才有意义' },
        { en: 'Air: the same film was delivered in less transmission time, and the time saved is available to everyone else', zh: '空口：同样的片子用更少的发送时间送到了，省下的时间留给了其他所有人' },
        { en: 'A higher rate for each television', zh: '每台电视的速率更高了' },
      ],
      answer: 1,
      explain: { en: 'A steady stream asks for what it asks for, so grouping cannot deliver more of it. It delivers the same in fewer wrappers — here 1.44 ms of air given back over 300 ms.', zh: '平稳的视频流要多少就是多少，分组不可能多送。它做的是用更少的包装送同样多的东西——这里是在 300 ms 内还回去 1.44 ms 的空口。' },
    },
  ],
}
