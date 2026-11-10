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
  title: '标签能够解调的帧',
  why: 'Wi-Fi 射频和无电池标签，谁也解不出对方的信号：一方用的是精心成形的波形，另一方只分得出有信号和无信号。但它们共用同一个信道，而路由器必须用同一帧同时发给两者。所以下行（downlink, DL）的 AMP 帧分成前后两半。前一半是普通 Wi-Fi 的前导码（preamble）和长度字段，房间里每一台 Wi-Fi 射频都能读出这一帧要占用多长时间，并在这段时间里避让；后一半用通断键控（on-off keying, OOK）写给标签，比特按 Manchester 方式编码，每个比特中间都有一道边沿，即使连续出现一长串零，标签也不会丢失比特定时。帧尾那段不装任何内容的填充（padding），是给标签留出的处理时间：作答要在帧结束后一个很短的间隔里发出，标签必须在填充仍在发送时就完成解调、校验并启动发射机。反方向上，标签的作答不带 Wi-Fi 前导码，附近的 Wi-Fi 终端只能检测到信道上有能量，无法识别出那是一帧。这样一帧的空口时间（airtime）大半用于固定开销：开头、同步、说明后文的 AMP-SIG、填充和信号扩展，无论携带多少数据都同样需要。所以只有四个字节的确认帧（acknowledgement, ACK）也要几百微秒，比一帧内容多得多的普通 Wi-Fi 帧还长；速率提高到四倍时，没有固定开头需要分摊的作答确实缩短到四分之一，触发帧（Trigger frame）却因为那段无法缩短的固定开销只缩短到四成多。',
  outcomes: [
    '说出一帧下行（downlink, DL）AMP 帧由哪几段组成，并说明每一半由哪种接收机解读',
    '解释为什么四个字节的确认帧（acknowledgement, ACK）要占用几百微秒',
    '预测速率提高时，哪一种帧缩短得最多',
  ],
  needs: ['amp-intro'],
  terms: [
    { term: 'OOK', plain: '通断键控：发射机只在开和关两种状态之间切换，以载波的有无表示比特' },
    { term: 'Manchester', plain: '每个比特都编码为“先高后低”或“先低后高”，接收端因此始终能保持比特定时' },
    { term: 'preamble', plain: '一帧 Wi-Fi 的开头部分，所有 Wi-Fi 射频都能识别——第一阶已经介绍过' },
    { term: 'AMP-Sync', plain: '标签部分开头的一段通断序列，使包络检波器能够对准比特定时' },
    { term: 'AMP-SIG', plain: '两个字节，向标签说明后续是什么帧、有多长' },
    { term: 'padding', plain: '帧尾的填充，不携带任何内容，仅用于为接收端留出处理时间' },
  ],
  picture: [
    { heading: '一帧，两种接收机', text: '这一轮里路由器发出的每一帧，都必须同时送达两种差异极大的射频。Wi-Fi 终端至少要识别出它，以便让出信道；标签则要真正解读它的内容。而这两者都解不出对方那种信号。因此这一帧由前后两部分组成：先是一段 Wi-Fi 开头，然后才是专门发给标签的那一部分。' },
    { heading: '供 Wi-Fi 射频解读的前一半', text: '这一帧的开头，就是每一帧 Wi-Fi 都有的那段前导码（preamble）——一段已知的图样，接收端依靠它锁定信号，紧接着是说明“这一帧要持续多久”的那个字段。房间里任何一台 Wi-Fi 射频都会在这段时间内避让，却始终无法解读后面那部分的内容。标签完全解不出这半段，只能等待它结束。' },
    { kind: 'watch', jump: 0, heading: '打开一帧看看', text: '载入仿真，跳到第一帧触发帧（Trigger frame），再到帧细节视图里把它打开。那条彩色条带就是这一帧，从左向右阅读。' },
    { kind: 'steps', heading: '一帧下行帧，从左到右', items: [
      '传统开头，供 Wi-Fi 射频解读',
      'AMP-Sync，使标签对准定时',
      'AMP-SIG：说明后续内容的类型与长度',
      '数据字节',
      '填充（padding），在最末尾',
    ] },
    { heading: '只有有信号和无信号两种状态', text: '标签那一半用的是 OOK：发射机只在开和关之间切换，以载波的有无表示比特。包络检波器只能解调这种信号。为了让标签不丢失定时，这些比特还按 Manchester 方式编码——每个比特都是“先高后低”或“先低后高”，因此每一个比特中间都有一道边沿；即使连续出现一长串零，标签的比特定时也不会漂移。' },
    { heading: '为什么帧尾要填充', text: '作答必须在触发帧最后一个符号（symbol）之后、经过一个间隔就发出，而那个间隔很短。在这段时间内，标签要完成解调、校验帧是否完好、判断这一轮是否与自己有关，还要启动自己的发射机。帧尾的填充把这段处理时间安排在只消耗空口时间（airtime）、没有其他代价的位置；填充仍在发送时，标签实际上已经在解码。' },
    { heading: '上行（uplink, UL）：结构相反', text: '标签的作答帧结构正好相反。它完全不带 Wi-Fi 前导码——标签也无法生成——所以帧一开始就是它自己那段很短的 AMP-Sync，紧接着就是数据字节。正因如此，位于标签附近的 Wi-Fi 终端只能检测到“信道上有能量”，却无法识别出那是一帧——其中没有任何一段是 Wi-Fi 射频能够锁定的。' },
    { heading: '帧很小，空口时间很长', text: '一帧很短的 AMP 帧，绝大部分并不是它要传递的内容。开头、同步、描述数据的那个字段、填充，还有末尾的信号扩展——凡是以 Wi-Fi 开头的帧，本频段都要在其后附加一小段静默——无论这一帧携带什么内容，它们占用的时间都相同。确认帧是最极端的例子：内容只有四个字节，占用的空口时间却比一帧内容多得多的普通 Wi-Fi 帧还长。' },
  ],
  numbers: [
    { kind: 'formula', heading: '触发帧的 618 µs 由什么组成', text: 'AMP Trigger @ 250 kb/s = 32 + 80 + 64 + 416 + 20 + 6 = 618 µs', note: '开头的 32 µs 是普通 Wi-Fi，其后的全部内容都是发给标签的。速率提高时只有中间那两行会缩短——AMP-SIG 在 1 Mb/s 下是 16 µs。' },
    { kind: 'table', heading: '这条条带由什么组成', head: [
      '段', '250 kb/s', '由谁解读',
    ], rows: [
      ['传统前导码', '16 µs', '每一台 Wi-Fi 射频'],
      ['L-SIG（legacy signal field），长度字段', '4 µs', '每一台 Wi-Fi 射频'],
      ['U-SIG（universal signal field），说明这是哪一类帧', '12 µs', 'Wi-Fi 7 射频'],
      ['AMP-Sync', '80 µs', '标签'],
      ['AMP-SIG，2 个字节', '64 µs', '标签'],
      ['触发帧帧体（Frame Body），13 个字节', '416 µs', '标签'],
      ['填充', '20 µs', '无：它为标签提供处理时间'],
      ['信号扩展', '6 µs', '无：本频段固有'],
    ] },
    { kind: 'table', heading: '三种 AMP 帧', head: [
      '帧', '字节', '250 kb/s', '1 Mb/s',
    ], rows: [
      ['AMP Trigger（下行）', '13', '618 µs', '258 µs'],
      ['AMP Ack（下行）', '4', '330 µs', '186 µs'],
      ['带读数的作答（上行）', '15', '528 µs', '132 µs'],
    ] },
    { text: '只报告自身身份的作答是 7 个字节，后面某一课会用到；这里的作答直接携带读数，所以是 15 个字节。' },
    { heading: '提高速率节省了什么', text: '速率提高到四倍，作答占用的空口时间确实只剩四分之一：528 µs 变为 132 µs——因为它没有需要分摊的固定开头。触发帧却有：其中 138 µs 不随速率变化，所以它只能降到 258 µs。' },
    { kind: 'table', heading: '填充有多少', head: [
      '下行帧的类型', '填充',
    ], rows: [
      ['非保护帧——本场景里的每一帧', '20 µs'],
      ['受保护帧，即加密的帧', '36 µs'],
    ] },
    { kind: 'formula', heading: '一帧 Ack 的 330 µs 由什么组成', text: '250 kb/s 下的 4 个字节 = 128 µs + 202 µs 的固定开销 = 330 µs', note: '固定开销——传统开头、AMP-Sync、AMP-SIG、填充、信号扩展——即使只有四个字节也必须完整承担。作为对比：路由器用来预留这一轮的那帧允许发送（clear to send, CTS）是十四个字节的普通 Wi-Fi，6 Mb/s 下 44 µs，再加本频段的 6 µs。内容是三倍半，空口时间却不到六分之一。' },
    { kind: 'formula', heading: '同一轮，换成 1 Mb/s', text: '50 + 10 + 258 + 4 × (10 + 132 + 10 + 186) = 1670 µs = 100 ms 的 1.67 %', note: '触发帧现在在 318 µs 结束，时隙 1 在 328 µs 开始；覆盖这一轮的 CTS Duration 是 1620 µs。' },
  ],
  sources: [
    'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课里下行与上行 AMP PPDU 的格式，依据的是 TGbp 规范框架 11-24/1613r20 与提案草案文本 11-26/1519r5。',
    '上表的填充值——非保护帧 20 µs、受保护帧 36 µs——出自 11-26/1519r5 §39.3.2.2。',
    '两个字节的 AMP-SIG 以及若干别的 AMP 字段宽度都是模型取值，而不是标准值——草案里它们仍标着 TBD。收发两端使用的 OOK SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）同样是模型取值。',
    '32 µs 的传统开头、6 µs 的信号扩展，以及 6 Mb/s 下 44 µs 的 CTS，都是 2.4 GHz Wi-Fi 原有的部分，并非 P802.11bp 新定义的内容。而那段开头里的 U-SIG，正是这里的路由器必须是 Wi-Fi 7 设备的原因——规范框架把下行 AMP 帧定义成这个字段里物理层版本号为 0 的帧，而 0 这个值就是 Wi-Fi 7 的那一版；判据不是「是否带有 U-SIG」，更新的世代同样带有，只是版本号不是 0。',
  ],
  // AMP 轨暂停，四课都还没写 `limits`。空数组是这个事实的如实记录：
  // tests/course/limits.test.ts 逐一点名这四课，AMP 恢复时会失败。
  limits: [],
  scenario: () => ampIntroScenario({ dlKbps: 250, ulKbps: 250 }),
  variants: [
    {
      label: '上下行都用 1 Mb/s',
      scenario: () => ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 }),
    },
  ],
  jumps: [
    J('第一帧 AMP Trigger', firstAmpTrigger),
    J('第一帧确认标签的 AMP Ack', firstAmpAckToTag),
    J('第一帧“空时隙”的 AMP Ack', txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst === r.frame.src)),
  ],
  observe: [
    '在帧细节里打开 1226 µs 那帧 Ack：ID 字段两个字节，标明的是 Door tag。再打开 2982 µs 那一帧，它跟在一个空时隙之后——同样 330 µs、同样四个字节，但 ID 字段里填的是路由器自己的标识。',
    '在帧细节里打开第一帧触发帧，把那条条带从左向右读一遍，逐段对照上面那张表。再打开它 6 个字节的帧体：会话号、窗口、时隙数与时隙长度。',
  ],
  tryThis: [
    '载入 1 Mb/s 变体，跳到第一帧触发帧。拿上面那道算式逐项核对这一轮，再想一想：速率提高到四倍，为什么节省的时间不到四分之三。',
  ],
  quiz: [
    {
      q: '触发帧末尾那 20 µs 的填充字段是做什么的？',
      options: [
        '把帧补齐到正交频分复用（OFDM）符号边界',
        '给标签留出时间，让它在一个 10 µs 的间隔内完成解调、校验并启动发射机',
        '让 Wi-Fi 终端有时间设好自己的倒计时',
      ],
      answer: 1,
      explain: '作答必须在触发帧最后一个符号之后一个间隔——也就是 10 µs——发出。填充把这段处理时间加在只消耗空口时间的位置。',
    },
    {
      q: 'AMP Ack 只有四个字节，在 250 kb/s 下却要 330 µs。时间用在了哪里？',
      options: [
        '四个字节在 250 kb/s 下确实就要 330 µs',
        '四个字节占 128 µs；其余 202 µs 是传统开头、AMP-Sync、AMP-SIG、填充和信号扩展',
        'Ack 被补齐到了它所收尾的那个时隙的长度',
      ],
      answer: 1,
      explain: '对极短的帧来说，固定开销占了大部分：四个字节的内容要承担全部固定开销——而十三个字节的触发帧承担的也是同样的固定开销。',
    },
    {
      q: '标签作答时，为什么 Wi-Fi 终端只能感知到能量，却读不出一帧？',
      options: [
        '作答信号太弱，根本无法到达它那里',
        '上行帧不带 Wi-Fi 前导码，Wi-Fi 接收端没有任何可以锁定的部分',
        '路由器事先要求终端忽略这一帧',
      ],
      answer: 1,
      explain: '标签的作答一开始就是自己的 AMP-Sync，然后是数据字节。没有前导码，Wi-Fi 接收端根本不会启动解码——信号再强也一样。',
    },
  ],
}
