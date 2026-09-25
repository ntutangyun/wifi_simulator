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
import { J, type Lesson } from '../lessonKit'
import {
  frameAnatomyScenario, firstLegacyData, firstQosSingle, firstRtsFrame, firstAmpduFrame,
  firstBlockAck,
} from './frame-anatomy'

export const frameAnatomyBytes: Lesson = {
  id: 'frame-anatomy-bytes',
  module: 0,
  title: '一帧在空口上要花多少',
  why: '上一课把一帧打开、把字段都点了名。可这些都不是白来的：你的数据前面每多一个字节，就多一段别人用不了的空口时间（airtime）；而在这一帧本身之前，射频还要放上更长的一段东西——前导码（preamble）。这一课就把字节数到微秒——前面放的是什么，帧头（MAC header）和校验各添了多少，以及为什么“多帧共用一个前导码”是标准里最划算的一招。',
  outcomes: [
    '说出射频放在每一帧前面的那几段是什么，以及每一段换来了什么',
    '从载荷（payload）、帧头和校验，把一帧的字节数加出来',
    '解释为什么帧头多两个字节，空口时间却可能一点都不多花',
    '说出十四帧一起走时，一个前导码买到了什么',
  ],
  needs: ['frame-anatomy'],
  terms: [
    { term: 'L-STF', plain: '任何一帧最前面的那一小段：一串朴素的重复图案，宣告“有东西开始了”' },
    { term: 'L-LTF', plain: '紧随其后的那一段，长到足够接收端在任何一个比特到来之前，先把信道量一遍' },
    { term: 'L-SIG', plain: '有史以来每一台 Wi-Fi 射频都读得懂的那个字段：这一帧剩下的部分有多快、有多长' },
    { term: 'preamble', plain: '前导码：每一帧前面那段固定的已知信号——就是上面这三个字段，加上新一代在它们后面添的东西' },
    { term: 'U-SIG', plain: 'Wi-Fi 7 的射频在那三段之后再加的一个字段，说明后面那种新格式到底是什么' },
  ],
  picture: [
    { heading: '人人都读得懂的那一段', text: '接收端没法从中间开始。在帧的任何部分之前，射频先发出一小段重复的图案，也就是 L-STF（legacy short training field），它唯一的任务就是被察觉到：有东西开始了，节拍落在这儿。接着是一段更长的已知图案，也就是 L-LTF（legacy long training field），接收端拿它来量这个房间——信号一路过来被墙抹成了什么样——好在比特到达时把这份涂抹还原回去。' },
    { heading: '再用一个字段说清有多长', text: '这时接收端已经锁住了信号，可对后面是什么仍一无所知。接下来那个字段就是 L-SIG（legacy signal field），它只告诉接收端两件事：后面这段用多快的速率编码、一共有多长。这就足够让一台根本解不出这一帧的射频——邻居的，或者更老的设备——知道空口什么时候会重新空出来。每一代都照样发它，一个字不改，而且用的是最慢的那档速率。这三段合起来，就是前导码。' },
    { kind: 'watch', jump: 0, heading: '看看那几条', text: '载入仿真，先跳到旧笔记本的第一帧，再跳到手机的那一帧，各自展开“空中字段”。两个块都会分成“前导码”和“正身”两截；比一比各自的前导码占了多少。' },
    { heading: '新射频，前导码照样按老规矩', text: '一帧 Wi-Fi 7 的帧本可以用更适合它自己的开头，但它没有。它的前导码照样是那三段，好让楼里每一台设备都能读出它有多长；之后才加上一个新字段，也就是 U-SIG（universal signal field），说明后面那种新格式究竟是什么。这里的向后兼容不是客气，而是唯一能防止邻居们互相压着说话的东西。' },
    { heading: '把字节数出来', text: '帧本身很好加：帧头，加上你的载荷，再加上校验。帧头是固定长度的，而那个业务类别标记会让它长两个字节。可空口不是按字节卖的，是按整个符号（symbol）卖的：一帧要向上凑成整数个符号，于是多出来的那两个字节，常常就消失在本来就要付的那点凑整里。' },
    { heading: '很多帧，共用一个前导码', text: '再把那个前导码和一个短帧放在一起看。一次只发一个小帧，就意味着每次都要付一遍前导码。于是客户端设备——站点（STA）——可以把许多造好的帧排成一队，每一帧仍有自己的帧头和校验，跟在同一个前导码后面作为一个 PPDU（PHY protocol data unit）发出；回来的也是一个覆盖全部的回复。而在这么长的一个突发之前，它会先用一个短的预约帧把房间要下来，等到放行帧再发。' },
  ],
  numbers: [
    { kind: 'table', heading: '各代射频，前面放的是什么', head: [
      '代际', '帧前面的部分', '一个数据符号',
    ], rows: [
      ['802.11a', '20 µs：L-STF 与 L-LTF 共 16 µs，再加 L-SIG 4 µs', '4 µs'],
      ['Wi-Fi 5', '40 µs', '4 µs'],
      ['Wi-Fi 6', '44 µs；多设备共享的帧再多 4 µs', '13.6 µs'],
      ['Wi-Fi 7', '48 µs；多设备共享的帧再多 4 µs', '13.6 µs'],
    ] },
    { kind: 'formula', heading: '一个传统帧要占多久', text: 'TXTIME = 16 + 4 + 4 × ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉ µs', note: 'N_DBPS 是一个符号能装的数据比特数：54 Mb/s 时是 216，24 Mb/s 时是 96。那个向上取整就是凑整——空口按整符号付费。' },
    { kind: 'formula', heading: '数一帧的字节', text: '24 + 1500 + 4 = 1528 B      ·      带标记时 26 + 1500 + 4 = 1530 B', note: '多出的那两个字节没有换来一个新符号，所以在这里是白送的。' },
    { kind: 'steps', heading: '从字节到微秒，一步一步算', items: [
      '先数这一帧的字节：帧头、交下来的载荷，再加四个字节的校验——旧笔记本这一帧是 24 + 1500 + 4 = 1528 B。',
      '把这些字节换成比特，再加上射频放在它们前面的服务字段（SERVICE field）和后面的尾比特（tail bits）：16 + 8 × 1528 + 6 个比特。',
      '除以当前速率下一个符号能装的比特数——54 Mb/s 时是 216——然后向上取整，因为没装满的符号也要整个发出去：57 个符号。',
      '先付这一代必发的那个前导码，再付符号：20 µs，加上 57 × 4 µs，一共 248 µs 空口时间。',
      '更新的射频只改这两个尺寸：前导码变成 44 或 48 µs，符号变成 13.6 µs，而一个符号能装的比特多得多。',
      '再带上业务标记把第 1 步重做一遍：1530 B；到第 3 步，向上取整得到的仍是 57 个符号。这就是两个字节有可能一点空口时间都不花的原因。',
    ] },
    { kind: 'table', heading: '旧笔记本的第一帧，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['这一帧的字节', '24 + 1500 + 4 = 1528 B'],
      ['要发的比特', '16 + 8 × 1528 + 6 = 12 246'],
      ['54 Mb/s 下一个符号的比特', '216'],
      ['向上取整后的符号数', '57'],
      ['先前导码，后符号', '20 + 57 × 4 µs'],
      ['于是这一帧占用空口', '248 µs'],
    ] },
    { kind: 'table', heading: '小帧只带非带不可的东西', head: [
      '帧', '里面有什么', '大小',
    ], rows: [
      ['Ack, CTS', '帧控制（Frame Control）、持续时间（Duration/ID）、地址 1（Address 1）、帧校验序列（FCS）', '14 B'],
      ['RTS', '同样的内容，再加地址 2——回复得找得到它', '20 B'],
      ['BlockAck', '块确认（BlockAck）：一整串帧只换一个回答，里面是两个地址、一个起始序号（sequence number）、一张 64 位位图（bitmap）', '32 B'],
    ] },
    { heading: '一个小帧要花多少', text: '一个 14 B 的回复在 24 Mb/s 下占两个符号，要 28 µs 空口时间，其中 20 µs 是前导码。' },
    { kind: 'formula', heading: '把它们排在一个前导码后面', text: '队列里的一个位置 = 4 B 的分隔符 + 那一帧 + 补齐到 4 的倍数的填充', note: 'Wi-Fi 5 笔记本的十四帧一起走：13 × 1536 + 1534 = 21 502 B，全都跟在同一个前导码后面。只有最后一个不必填充（padding）。' },
    { kind: 'table', heading: '那个突发外面的预约写了什么', head: [
      '帧', '它写的持续时间', '这段覆盖了什么',
    ], rows: [
      ['RTS', '2356 µs', '放行帧、突发、回复，外加三个间隔'],
      ['CTS', '2312 µs', '同一个预约，减去一个间隔和它自己'],
      ['那个突发', '48 µs', '一个间隔，加上随后的那个回复'],
      ['那个回复', '0', '它后面什么都没有了'],
    ] },
  ],
  deeper: [
    { heading: '空口时长公式是怎么来的', text: '那 16 µs 是 L-STF 加 L-LTF，4 µs 是 L-SIG；再往后的数据符号里装着 16 比特的 SERVICE 字段、PSDU、6 个尾比特，以及补齐到整符号的填充——取整式里的 16 和 6 就是它们。54 Mb/s 下，1528 B 的一帧需要 ⌈(16 + 12 224 + 6) ÷ 216⌉ = 57 个符号，20 + 57 × 4 = 248 µs。' },
    { heading: '为什么更新的前导码只是代表值', text: '上面的 40、44、48 µs 是 20 MHz、单空间流下的单用户取值。真实的 VHT、HE 或 EHT 前导码会随空间流数增长——每条流都要有自己的训练字段——也会随多用户帧所服务的用户数增长，多出的那 4 µs HE-SIG-B 或 EHT-SIG 正是为此付的。仿真器没有建模这种增长，每一代只给一个代表值。' },
    { heading: '聚合帧里的确认策略', text: 'QoS 控制里的两个确认策略比特，在单独一帧上读作 Normal Ack；同样这两个比特放在 A-MPDU 里，含义是 Implicit Block Ack Request。这正是十四帧只换回一个带 64 位位图、32 B 的 BlockAck，而不是十四个 14 B 的 Ack 的原因。' },
  ],
  sources: [
    '非 HT 前导码与空口时长公式见 IEEE Std 802.11-2024 §17.3.2 与 §17.4.3；L-STF、L-LTF、L-SIG 这几个名字也出自第 17 章。20 µs 的前导码与 4 µs 的符号是标准里的数值，不是模型取值。',
    '40、44、48 µs 的前导码与 13.6 µs 的符号，是本仿真器在 20 MHz、单流下的代表性单用户取值；真实值会随空间流数与用户数增长（第 21、27、36 章）。Wi-Fi 7 帧里跟在传统字段之后的 U-SIG 见 §36.3.12。',
    '控制帧的大小见 §9.3.1；A-MPDU 子帧——4 个八位组的分隔符、MPDU，再补齐到 4 字节边界（最后一个不补）——见 §9.8。上面每一个时长和字节数，都是在本课场景里实测出来的。',
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个传统数据帧', firstLegacyData),
    J('第一个 QoS 数据帧', firstQosSingle),
    J('第一个 RTS', firstRtsFrame),
    J('第一个 A-MPDU', firstAmpduFrame),
    J('第一个 BlockAck', firstBlockAck),
  ],
  observe: [
    '对比这两条。旧笔记本那一帧是 16 µs 的 L-STF 与 L-LTF、加 4 µs 的 L-SIG，之后才是 57 个数据符号；手机那一帧（Wi-Fi 6）是 44 µs 的前导码加一个 13.6 µs 的符号——几乎全是前导码。',
    '跳到第一次预约（2.298 ms），再跳到它后面的那个突发：14 帧、21 502 B，全都是一个块。覆盖全部的那一个回复出现在 4.650 ms，写的持续时间是 0——它后面什么都没有了。',
  ],
  tryThis: [
    '在编辑器里把预约门限抬到 21 502 B 以上。突发前面就什么都没有了：那两个小帧、以及它们带来的间隔都省掉了。',
    '把旧笔记本改成 Wi-Fi 5。它原本一帧一帧地发，变成许多帧共用一个前导码的突发，每个突发前还有一次预约；那条泳道也从许多小块变成几个长块。',
  ],
  quiz: [
    {
      q: '为什么一帧 Wi-Fi 7 的帧，开头用的仍是 1999 年设计的字段？',
      options: [
        '因为新字段放不进最前面',
        '这样附近任何一台射频，不管多老，都能读出空口会忙多久',
        '因为 L-SIG 里装着地址',
      ],
      answer: 1,
      explain: '解不出这一帧的设备，照样能读懂 L-SIG，并且正好安静那么久。',
    },
    {
      q: '业务标记让帧头长了两个字节，可这一帧在空口上的时间一点没变。为什么？',
      options: [
        '标记是放在前导码里发的，而前导码是固定长度',
        '空口按整符号付费，而最后那个符号本来就还有空位',
        '校验会相应短两个字节，腾出位置',
      ],
      answer: 1,
      explain: '两者都向上凑成 57 个符号，都是 248 µs。只有当那两个字节把帧顶进下一个符号时，才真的要花时间。',
    },
    {
      q: '十四帧共用一个前导码，真正省下的是什么？',
      options: [
        '省下帧头和校验：十四帧变成了一帧',
        '省下十三个前导码、十三次排队，以及十三个各自的回复',
        '空口上什么也没省；省的只是发送端的活儿',
      ],
      answer: 1,
      explain: '每一帧都保留自己的帧头和校验——突发之所以是 21 502 B，原因就在这里。省掉的是它们外面那些重复。',
    },
  ],
}
