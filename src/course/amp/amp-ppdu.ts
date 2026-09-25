/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · A frame a tag can hear.
 *
 * The second half of the old `amp-intro`: the anatomy of an AMP PPDU, why a
 * downlink frame has a legacy Wi-Fi opening in front of on-off keying, why the
 * uplink has none, and where the airtime of a four-octet acknowledgement
 * actually goes. It loads exactly the scene `amp-intro` loads — same builder,
 * same variant — so the split adds no new scenario and the recorded timeline
 * hashes of `amp-ppdu` are `amp-intro`'s.
 *
 * Every number quoted below is pinned in tests/course/amp-ppdu.test.ts.
 *
 * The main path is held to 1300 words, with `why` + `outcomes` + `terms` +
 * `picture` ≤ 650, `numbers` ≤ 350 and `observe` + `tryThis` + `quiz` ≤ 400
 * (tests/course/readability.test.ts; `npx tsx scripts/lesson-dump.ts amp-ppdu
 * en` prints the four counts). Depth belongs in `deeper`, provenance in
 * `sources`; neither is counted.
 */
import { J, firstAmpAckToTag, firstAmpTrigger, txOf, type Lesson } from '../lessonKit'
import { ampIntroScenario } from './amp-intro'

export const ampPpdu: Lesson = {
  id: 'amp-ppdu',
  module: 10,
  title: '一帧标签听得懂的帧',
  why: 'Wi-Fi 射频和无电池标签，谁也听不懂对方的信号。一个说的是精雕细琢的波形，另一个只分得出响和静。可它们共用同一片空气，而路由器必须一口气同时对两者说话。能做到这件事的帧分成两半，而它有多长，跟里面装了多少数据几乎没什么关系。',
  outcomes: [
    '说出一帧下行 AMP 帧由哪几段组成，并讲清哪一半是给谁听的',
    '解释为什么四个字节的确认帧要花掉几百微秒',
    '预测速率提高时，哪一种帧缩得最多',
  ],
  needs: ['amp-intro'],
  terms: [
    { term: 'OOK', plain: '通断键控：发射机要么开、要么关，闪一下就是一个比特' },
    { term: 'Manchester', plain: '每个比特都发成“先亮后暗”或“先暗后亮”，接收端因此永远跟得上节拍' },
    { term: 'preamble', plain: '一帧 Wi-Fi 的开头，所有 Wi-Fi 射频都认得——第一阶已经见过' },
    { term: 'AMP-Sync', plain: '标签那一半开头的一串闪烁，让包络检波器能找准节拍' },
    { term: 'AMP-SIG', plain: '两个字节，告诉标签后面是什么帧、有多长' },
    { term: 'padding', plain: '帧尾的填充，不装任何内容，纯粹是为接收端争取时间' },
  ],
  picture: [
    { heading: '一帧，两个听众', text: '这一轮里路由器发出的每一帧，都得同时送达两种差别极大的射频。Wi-Fi 终端至少要认出它，好把路让开；标签则要真的读懂它说了什么。而这两者谁也解不了对方那种信号。于是这一帧被搭成前后两半：先是一段 Wi-Fi 开头，然后才是专门写给标签的那一段。' },
    { heading: '给 Wi-Fi 射频读的那一半', text: '这一帧的开头，就是每一帧 Wi-Fi 都有的那段前导——一段已知的图案，接收端靠它锁住信号，紧接着是说明“这一帧要持续多久”的那个字段。房间里任何一台 Wi-Fi 射频都会老老实实避让这么久，却始终不知道后面那部分在讲什么。标签对这半段则完全无从下手，只能干等它过去。' },
    { kind: 'watch', jump: 0, heading: '打开一帧看看', text: '载入仿真，跳到第一帧触发帧，再到帧细节视图里把它打开。那条彩色的带子就是这一帧，从左读到右。' },
    { kind: 'steps', heading: '一帧下行帧，从左到右', items: [
      '传统开头，给 Wi-Fi 射频',
      'AMP-Sync，让标签找准节拍',
      'AMP-SIG：后面是什么、有多长',
      '数据字节',
      '填充，在最末尾',
    ] },
    { heading: '不是响就是静，没有中间地带', text: '标签那一半用的是 OOK：发射机要么开要么关，闪一下就是一个比特。这点东西，包络检波器跟得上。为了让标签不跟丢，这些比特还按 Manchester 的方式发出——每个比特都是“先亮后暗”或“先暗后亮”，于是每一个比特中间都有一道边沿；哪怕连着来一长串零，标签的节拍也不会散。' },
    { heading: '为什么帧尾要填充', text: '作答必须在触发帧最后一个符号之后、隔一个间隔就发出，而那个间隔很短。就在这点时间里，标签要解调完、校验帧是否完好、判断这一轮跟自己有没有关系，还要把自己的发射机启动起来。帧尾的填充把这段思考时间安排在只耗费空口时间、别无其他代价的地方；填充还在发送，标签其实已经在解码了。' },
    { heading: '上行：整个反过来', text: '标签的作答帧是反着搭的。它完全不带 Wi-Fi 前导——标签也造不出来——所以一上来就是它自己那段很短的 AMP-Sync，紧接着就是数据字节。正因如此，站在标签旁边的 Wi-Fi 终端只能察觉“空中有动静”，却认不出那是一帧——里面没有一段是 Wi-Fi 射频懂得去锁的。' },
    { heading: '帧很小，空口时间很长', text: '一帧小小的 AMP 帧，绝大部分并不是它要说的内容。开头、同步、描述数据的那个字段、填充，还有收尾的扩展——凡是以 Wi-Fi 开头的帧，本频段都要在它后面再接一小段安静——不管这一帧装了什么，它们花的时间都一样。确认帧是最极端的例子：内容只有四个字节，占用的空口时间却比一帧说得多得多的普通 Wi-Fi 还长。' },
  ],
  numbers: [
    { kind: 'formula', heading: '触发帧的 618 µs 由什么组成', text: 'AMP Trigger @ 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs', note: '开头的 32 µs 是普通 Wi-Fi，其后的一切都是发给标签的。速率提高时只有中间那两行会缩短——AMP-SIG 在 1 Mb/s 下是 16 µs。' },
    { kind: 'table', heading: '这条带子由什么组成', head: [
      '段', '250 kb/s', '读它的是谁',
    ], rows: [
      ['传统前导', '16 µs', '每一台 Wi-Fi 射频'],
      ['L-SIG，长度字段', '4 µs', '每一台 Wi-Fi 射频'],
      ['U-SIG，说明这是哪一类帧', '12 µs', 'Wi-Fi 7 射频'],
      ['AMP-Sync', '80 µs', '标签'],
      ['AMP-SIG，2 个字节', '64 µs', '标签'],
      ['触发帧帧体，13 个字节', '416 µs', '标签'],
      ['填充', '20 µs', '没人：它买的是标签的时间'],
      ['信号扩展', '6 µs', '没人：本频段自带'],
    ] },
    { kind: 'table', heading: '三种 AMP 帧', head: [
      '帧', '字节', '250 kb/s', '1 Mb/s',
    ], rows: [
      ['AMP Trigger（下行）', '13', '618 µs', '258 µs'],
      ['AMP Ack（下行）', '4', '330 µs', '186 µs'],
      ['带读数的作答（上行）', '15', '528 µs', '132 µs'],
    ] },
    { text: '只报自己身份的作答是 7 个字节，后面某一课会用到；这里的作答把读数直接带在里面，所以是 15 个字节。' },
    { heading: '提速买来什么', text: '速率提高四倍，作答占用的空口时间就真的只剩四分之一：528 µs 变成 132 µs——因为它没有固定开头可以摊薄。触发帧却有：138 µs 任凭速率怎么变都省不掉，所以它只能降到 258 µs。' },
    { kind: 'table', heading: '填充有多少', head: [
      '下行帧的类型', '填充',
    ], rows: [
      ['非保护帧——本场景里的每一帧', '20 µs'],
      ['受保护帧，也就是加了密的帧', '36 µs'],
    ] },
    { kind: 'formula', heading: '一帧 Ack 的 330 µs 花在哪儿', text: '250 kb/s 下的 4 个字节 = 128 µs + 202 µs 的外壳 = 330 µs', note: '外壳——传统开头、AMP-Sync、AMP-SIG、填充、信号扩展——为四个字节也得照付一遍。作个对比：路由器用来清场的那帧 CTS 是十四个字节的普通 Wi-Fi，6 Mb/s 下 44 µs，再加本频段的 6 µs。内容是三倍半，空口时间却不到六分之一。' },
    { kind: 'formula', heading: '同一轮，换成 1 Mb/s', text: '50 + 10 + 258 + 4 × (10 + 132 + 10 + 186) = 1670 µs = 100 ms 的 1.67 %', note: '触发帧现在在 318 µs 结束，时隙 1 在 328 µs 打开；覆盖这一轮的 CTS Duration 是 1620 µs。' },
  ],
  sources: [
    'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课里下行与上行 AMP PPDU 的格式，依据的是 TGbp 规范框架 11-24/1613r20 与提案草案文本 11-26/1519r5。',
    '上表的填充值——非保护帧 20 µs、受保护帧 36 µs——出自 11-26/1519r5 §39.3.2.2。',
    '两个字节的 AMP-SIG 以及若干别的 AMP 字段宽度都是模型取值，而不是标准值——草案里它们仍标着 TBD。收发两端使用的 OOK SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）同样是模型取值。',
    '32 µs 的传统开头、6 µs 的信号扩展，以及 6 Mb/s 下 44 µs 的 CTS，都是 2.4 GHz Wi-Fi 原本就有的东西，并非 P802.11bp 的新发明。而那段开头里的 U-SIG，正是这里的路由器必须是 Wi-Fi 7 设备的原因。',
  ],
  scenario: () => ampIntroScenario({ dlKbps: 250, ulKbps: 250 }),
  variants: [
    {
      label: '上下行都用 1 Mb/s',
      scenario: () => ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 }),
    },
  ],
  jumps: [
    J('第一帧 AMP Trigger', firstAmpTrigger),
    J('第一帧点名标签的 AMP Ack', firstAmpAckToTag),
    J('第一帧“空时隙”的 AMP Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
  ],
  observe: [
    '在帧细节里打开 1226 µs 那帧 Ack：ID 字段两个字节，点名的是 Door tag。再打开 2982 µs 那一帧，它收尾的是一个空时隙——同样 330 µs、同样四个字节，但 ID 字段里装的是路由器自己的标识。',
    '在帧细节里打开第一帧触发帧，把那条带子从左读到右，逐段对照上面那张表。再打开它 6 个字节的帧体：会话号、窗口、时隙数与时隙长度。',
  ],
  tryThis: [
    '载入 1 Mb/s 变体，跳到第一帧触发帧。拿上面那道算式逐项核对这一轮，再想一想：速率提高到四倍，为什么省下来的没有四分之三。',
  ],
  quiz: [
    {
      q: '触发帧末尾那 20 µs 的填充字段是做什么的？',
      options: [
        '把帧补齐到 OFDM 符号边界',
        '给标签留出时间，让它在一个 10 µs 的间隔内完成解调、校验并启动发射机',
        '让 Wi-Fi 终端有时间设好自己的倒计时',
      ],
      answer: 1,
      explain: '作答必须在触发帧最后一个符号之后一个间隔——也就是 10 µs——发出。填充把这段处理时间加在只花空口时间的地方。',
    },
    {
      q: 'AMP Ack 只有四个字节，在 250 kb/s 下却要 330 µs。时间花到哪里去了？',
      options: [
        '四个字节在 250 kb/s 下确实就要 330 µs',
        '四个字节占 128 µs；其余 202 µs 是传统开头、AMP-Sync、AMP-SIG、填充和信号扩展',
        'Ack 被补齐到了它所收尾的那个时隙的长度',
      ],
      answer: 1,
      explain: '对极小的帧来说，固定开销占了大头：四个字节的内容，要把整层外壳的账付清——而十三个字节的触发帧付的是同样一层壳。',
    },
    {
      q: '标签作答时，为什么 Wi-Fi 终端只能感知到能量，却读不出一帧？',
      options: [
        '作答太弱，根本传不到它那里',
        '上行帧不带 Wi-Fi 前导，Wi-Fi 接收端没有任何东西可以拿来锁定',
        '路由器事先要求终端无视这一帧',
      ],
      answer: 1,
      explain: '标签一上来就是自己的 AMP-Sync，然后是数据字节。没有前导，Wi-Fi 接收端根本不会启动解码——信号再响也一样。',
    },
  ],
}
