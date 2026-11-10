/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · A tag with no battery.
 *
 * The first lesson of the AMP track, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): why a radio
 * that lives on harvested microwatts cannot take its own turn on the air, then
 * one round of the router asking instead — reserve, ask, answer, acknowledge —
 * and only then the exact microseconds. The frame's own anatomy (the legacy
 * preamble in front of on-off keying, AMP-Sync, AMP-SIG, the padding and every
 * airtime) is the next lesson, `amp-ppdu`, which loads this same scene.
 *
 * One Wi-Fi 7 router polls two battery-free tags every 100 ms in 2.4 GHz:
 * CTS-to-self, AMP Trigger, four uplink slots, one AMP Ack per slot. No Wi-Fi
 * traffic at all, so the round stands alone and every microsecond of it is
 * visible. Every number quoted below is pinned in
 * tests/course/amp-intro.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, ampAp, firstAmpAckToTag, firstAmpLost, firstAmpResp, firstAmpTrigger, oneRoom, sc, tag, txOf, type Lesson } from '../lessonKit'

/** The lab: the router and its two tags, at the chosen AMP data rates. */
export function ampIntroScenario(rates: { dlKbps: 250 | 1000; ulKbps: 250 | 1000 }): Scenario {
  return sc(oneRoom(), [
    ampAp('ap', 'Router', 5, 4, rates),
    tag('tag-1', 'Fridge tag', 3, 4),
    tag('tag-2', 'Door tag', 8, 6),
  ])
}

export const ampIntro: Lesson = {
  id: 'amp-intro',
  module: 10,
  title: '没有电池的标签',
  why: '设想牛奶盒上贴着一张标签，把冰箱里的温度报给你的路由器——永远不用装电池。它工作所需的能量全部取自环境射频，只有几微瓦。能量如此有限的射频设备，无法完成每台 Wi-Fi 终端时刻都在做的那件事：先侦听信道是否空闲，再在轮到自己时发送——它的接收机只能区分有无信号，也无法维持持续工作的侦听电路、倒计时器和足够精确的时钟。因此改由路由器发起询问。一轮问答分四步：路由器先发一帧写给自己的允许发送（clear to send, CTS），让能解出它的 Wi-Fi 设备在这一轮期间不发送；再发一帧触发帧（Trigger frame），开放若干等长的时隙；每个收到触发帧的标签各自随机选取一个数，在这个数对应的时隙里作答；每个时隙结束时，路由器都回复一帧确认，标明收到的标签，没有收到则标明路由器自己。空时隙之后也同样发送这帧确认，因为标签无法自行计时，下一个时隙紧接在这帧确认之后开始。标签之间彼此收不到，两个标签选到同一个数，就会在同一个时隙里发生碰撞，两个读数一并丢失，而它们要等到那帧标明路由器自己的确认才知道发生了碰撞；本课中的读数丢失全部由此造成，与信号强弱无关——两个方向的信号都比接收端所需高出三十多分贝。两个标签分享四个时隙，每一轮至少有一半时隙空闲，这部分空口时间（airtime）就是让标签自行选择时隙的代价。',
  outcomes: [
    '说清为什么无电池的标签无法靠侦听信道来自行取得发送机会',
    '按顺序说出一轮轮询的四个步骤：预留信道、发起询问、标签作答、确认',
    '从事件日志中读出标签选取的时隙，以及这一次作答的结果',
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'AMP', plain: '环境能量：Wi-Fi 为“仅依靠收集的环境能量工作”的设备定义的功能' },
    { term: 'tag', plain: '这一轮轮询服务的那台无电池设备' },
    { term: 'slot', plain: '路由器开放的一段短时间窗口，只容纳一次作答' },
    { term: 'ABOC', plain: '标签随机选取的数，用来决定自己在第几个时隙作答' },
  ],
  picture: [
    { heading: '一台无法侦听信道的射频设备', text: '标签的接收机是一个包络检波器：它只能区分有无信号，而且无法准确计量帧与帧之间的时间。载波侦听（carrier sense）——让接收机持续开启，判断是否有其他设备正在发送——它无法实现。网络分配向量（network allocation vector, NAV）同样无法实现：那是 Wi-Fi 终端从自己解出的每一帧里读取时长后记录的倒计时。' },
    { heading: '第一步：预留信道', text: '这一轮由路由器主持，所以在开始之前，它先让周围的 Wi-Fi 设备停止发送：发一帧写给自己的允许发送（clear to send, CTS）——极短的一帧，内容几乎只有一个时长——凡是解出它的 Wi-Fi 射频，都会在这段时间里保持不发送。标签则不受任何影响：它们本来就解不出这一帧。' },
    { kind: 'watch', jump: 1, heading: '然后，路由器发起询问', text: '载入仿真，跳到第一帧触发帧（Trigger frame）。发起询问的就是这一帧：它一次开放一组等长的时隙，每一个收到它的标签都可以从中选择一个作答。' },
    { heading: '随机选取一个时隙', text: '触发帧并不指定哪个标签使用哪个时隙。它只说明一共几个时隙、从多大的范围里取值；凡是解出了它的标签，都各自随机选取一个数——也就是 ABOC——然后在这个数对应的时隙里作答。选取这一个数，就是标签在这一轮里所做的全部决定。' },
    { text: '标签之间彼此收不到对方的信号，所以无法避免两个标签选到同一个数。一旦如此，它们会在同一个时隙里同时发送，路由器收到两路叠加在一起的信号，哪一路都解不出。两个读数都丢失了；而它们要等到这个时隙末尾的那帧确认——其中标明的是路由器自己——才知道发生了碰撞。' },
    { kind: 'watch', jump: 4, text: '跳到第一次丢失的作答。看一看路由器在那个时隙末尾发出的是什么，其中标明的是谁。' },
    { heading: '确认帧（acknowledgement, ACK）同时也是时隙边界的定时基准', text: '每个时隙结束后，路由器都会发一帧很短的确认——不管这个时隙里有没有标签作答，而且这一帧不可省略。标签无法自行计时到下一个时隙的边界，所以下一个时隙紧接在每一帧确认结束之后开始。漏收一帧确认的标签，这一轮也就随之失败。' },
    { kind: 'steps', heading: '一轮轮询，从头到尾', items: [
      '路由器先发一帧 CTS-to-self（CTS to self），让周围能解出它的 Wi-Fi 设备停止发送。',
      '路由器发触发帧，开放四个等长的时隙，并给出标签可以选取的取值范围。',
      '收到触发帧的每个标签各自随机选取一个 ABOC，决定自己在哪个时隙作答。',
      '标签在自己选取的时隙里发送；同一时隙里有不止一个标签发送，路由器就哪一路都解不出。',
      '每个时隙结束后，路由器立刻发一帧确认——标明收到的标签，未收到时则标明路由器自己——同时标出下一个时隙从何时开始。',
    ] },
    // "What a tag never does" — the three records a tag's lane never holds — moved to
    // `deeper` in the step-1 fix wave: a track's first lesson is held to 1000 words, and
    // the mechanism it illustrates is already said in "A radio that cannot listen".
  ],
  numbers: [
    { heading: '一轮轮询，逐微秒展开', text: '没有其他 Wi-Fi 业务，所以这一轮单独进行。路由器按普通方式、用优先级最低的接入函数取得信道；这一轮里每个间隔都是 10 µs。' },
    { kind: 'table', heading: '路由器泳道上的第一轮', head: [
      '内容', '起', '止',
    ], rows: [
      ['CTS-to-self，Duration 4140 µs', '0 µs', '50 µs'],
      ['AMP Trigger，4 个时隙 × 528 µs', '60 µs', '678 µs'],
      ['时隙 1：Door tag', '688 µs', '1216 µs'],
      ['第 1 帧 Ack → Door tag', '1226 µs', '1556 µs'],
      ['时隙 2：Fridge tag', '1566 µs', '2094 µs'],
      ['第 2 帧 Ack → Fridge tag', '2104 µs', '2434 µs'],
      ['时隙 3：无人', '2444 µs', '2972 µs'],
      ['第 3 帧 Ack → 路由器', '2982 µs', '3312 µs'],
      ['时隙 4：无人', '3322 µs', '3850 µs'],
      ['第 4 帧 Ack → 路由器', '3860 µs', '4190 µs'],
    ] },
    { kind: 'formula', text: '时隙 1 = 触发帧结束 678 + 10 = 688 µs   ·   时隙 2 = Ack₁ 结束 1556 + 10 = 1566 µs', note: '每个时隙都在前一帧结束后隔一个间隔打开。标签无法自行计时到这些边界，需要由确认帧标出。' },
    { kind: 'formula', text: 'round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 100 ms 的 4.19 %', note: '这 4190 µs 中，实际有帧在空口传送的只有 3044 µs。90 µs 是那九个间隔，1056 µs 是两个无人使用的时隙——这就是让标签自行选择时隙的代价。' },
    { heading: '一秒钟的轮询', text: '路由器每隔 100 ms 准时开始一轮，所以一秒钟里有十轮：四十个时隙、四十帧 Ack、二十次标签作答。其中十六帧标明了某个标签，另外二十四帧标明的是路由器自己——空时隙或解不出的时隙之后发送的就是这种确认。两个标签都在全部十轮里作答：各有八次被确认、两次丢失，这也正是检视器在一秒结束时显示的计数。' },
    { heading: '那两次丢失的原因', text: '丢失不是因为信号弱：十轮里有两轮，两个标签选到了同一个数，在同一个时隙里同时发送。' },
    { kind: 'table', head: [
      '轮次', '时隙', '碰撞于',
      'Ack 标明', '标签得知',
    ], rows: [
      ['3', '1', '201 216 µs', '路由器自己', '201 556 µs'],
      ['6', '3', '502 972 µs', '路由器自己', '503 312 µs'],
    ] },
  ],
  deeper: [
    // The link-margin table moved here from `numbers` in the step-1 fix wave: the quiz is
    // answerable without it, the depth beside it ("What that margin is bought with") is
    // where it was already explained, and a track's first lesson is held to 1000 words.
    { kind: 'table', heading: '链路余量有多大', head: [
      '方向', '到达电平', '门限', '余量',
    ], rows: [
      ['路由器 → Door tag', '−37.4 dBm', '−72 dBm', '34.6 dB'],
      ['Door tag → 路由器', '−57.4 dBm', '−94 dBm', '36.6 dB'],
    ] },
    { heading: '用触发帧的字段表述这次选取', text: '触发帧里带着一个窗口指数 ACWE，这里取 2，于是窗口 ACW = 2² − 1 = 3。每个标签从 0、1、2、3 中随机选取一个 ABOC，在第 ABOC + 1 个时隙作答。前面用文字讲的那条规则，写成公式就是这样。' },
    { heading: '为什么两个标签每一轮都作答', text: '只有当选取的数可能落在最后一个时隙之外，也就是 ACW + 1 > N 时，标签才会有整轮不发送的情况。这里 ACW + 1 = 4 = N，所以 0、1、2、3 每一个取值都对应一个实际存在的时隙，取到 3 就对应时隙 4——最后一个。把窗口放宽，或者把一轮的时隙减少，标签就会出现整轮不发送的情况；后面有一课专门讨论这件事。' },
    { heading: '标签从不产生的记录', text: '把标签泳道上这一秒的全部记录逐条查看，会发现始终没有三类记录：CCA_BUSY，意思是“信道判定为忙”；BACKOFF_DRAW，是发送之前新选取的一个退避计数；IFS_START，是其他设备停止发送之后的那段等待。标签没有这三类记录；它在整条时间线上留下的全部记录就是十次发送。而路由器的泳道里，这三类记录都有。' },
    { heading: '这份余量从何而来', text: '标签以 0 dBm 发送，而路由器是 20 dBm；即便如此，它的作答到达路由器时仍有 36.6 dB 余量。这份余量是以数据率为代价换来的：路由器接收 250 kb/s 作答的 −94 dBm 门限，比一帧普通 Wi-Fi 必须达到的 −82 dBm 还低约 12 dB：速率只有每秒四分之一兆比特时，接收端可以积分足够长的时间，把信号从噪声中提取出来——而在同样的噪声下，一帧 OFDM 根本无法被检出。' },
    { heading: '这一轮如何受到保护，以及哪些设备不受其约束', text: 'CTS-to-self 的 Duration 是 4140 µs。它在 50 µs 结束，所以这份预留到 4190 µs 到期——正是第四帧 Ack 发送结束的那一微秒。一台连“这是一帧”都检测不出来的 Wi-Fi 终端，与标签那 528 µs 的通断键控信号之间，唯一的保护就是这份预留；共存那一课会关闭这份预留，演示其后果。还要注意，“保护这一轮”和“受保护的 AMP 帧”不是一回事：后者指的是加密的帧，填充 36 µs 而不是 20 µs。' },
    { heading: '为什么没有任何泳道设置倒计时', text: '这个场景里没有任何一条泳道出现过 NAV_SET 记录。CTS-to-self 只会在收到它的节点上设置倒计时，从不在发送者自身设置，而这里又没有第二个 Wi-Fi 节点会向它发送一帧。不过 Duration 仍然随这一帧在空口广播，供任何可能进入这个房间的设备读取。' },
  ],
  sources: [
    'IEEE P802.11bp 目前还是草案，不是标准：D0.5 于 2026 年 5 月发布，D1.0 将在 2026 年 9 月进入 letter ballot。本模块依据三份文件建模——2026 年 7 月定稿的 TGbp 规范框架 11-24/1613r20，以及两份提案草案文本：11-26/1519r5（触发过程）与 11-26/1889r4（上行信道接入）。',
    '“标签只在 AMP 触发帧刚刚分配给它的时隙里发送”这条规则出自 11-26/1889r4 第 39.4 节。10 µs 的 AMP SIFS 见 SFD PM-96，它恰好与 2.4 GHz Wi-Fi 原本使用的 SIFS 相同。CTS-to-self 的 Duration 规则见 §10.23.2.8。',
    '草案里仍标 TBD 的数值，由仿真器自行选定并标注：标签 −72 dBm 的下行灵敏度、通断键控的 SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）都是模型取值而非标准值；路由器接收 250 kb/s 作答的 −94 dBm 门限同样如此。',
    '本课里的“标签”，标准中的正式名称是 Active Tx 非 AP AMP STA。这里的路由器是 Wi-Fi 7 设备，因为下行 AMP PPDU 带有 U-SIG 字段。规范框架定义的另外两个角色在本场景中都不存在：向标签辐射射频能量的 Energizer（供能器），以及能读懂 AMP 帧的普通 Wi-Fi 终端（AMP-enabled STA）。',
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
    J('第一帧 CTS-to-self', txOf((r) => r.frame.kind === 'cts')),
    J('第一帧 AMP Trigger', firstAmpTrigger),
    J('标签的第一次作答', firstAmpResp),
    J('第一帧确认标签的 AMP Ack', firstAmpAckToTag),
    J('第一次作答丢失（两个标签落在同一时隙）', firstAmpLost),
  ],
  observe: [
    '跳到第一帧 AMP Trigger，把时间条放大到能看清几十微秒：触发帧结束后，经过一个 10 µs 的间隔，时隙 1 开始。',
    '选中 Fridge tag，在检视器里单步执行完一轮，同时查看旁边的日志：它的选取输出为 “ABOC 1 of [0, 3] → slot 2”，这一次的结果输出为 “slot 2: acknowledged”，另有一行写明时隙数、窗口和上下行速率。',
  ],
  tryThis: [
    '在编辑器里把 Door tag 的下行（downlink, DL）灵敏度（sensitivity）门限提高到高于它实际收到的 −37.4 dBm，然后重新载入。它将解不出触发帧，因此既不选取 ABOC 也不发送——而每秒四十个时隙、四十帧 Ack 的轮询保持不变。',
  ],
  quiz: [
    {
      q: '为什么要给标签分配时隙，而不是让它自己去竞争信道？',
      options: [
        '竞争对 Wi-Fi 终端不公平',
        '载波侦听需要持续开启的接收电路、一个倒计时器和一个足够精确的时钟',
        'Wi-Fi 射频检测不到标签发出的信号',
      ],
      answer: 1,
      explain: '一个包络检波器加上几微瓦的功率，这三项一项也无法支持。',
    },
    {
      q: '十轮里两个标签各丢了两次读数。为什么？',
      options: [
        '它们离路由器太远，收不到',
        '它们抽到同一个数，在同一个时隙里同时发送',
        '路由器的时隙不够用，没轮到它们',
      ],
      answer: 1,
      explain: '这条链路（link）余量充足；选取是随机的，两个标签落在同一个时隙只是随机的结果。',
    },
    {
      q: '某个时隙里没有人作答。这个时隙末尾的那帧确认标明的是谁？',
      options: [
        '本该在这个时隙作答的那个标签',
        '路由器自己——确认帧仍然要发送，因为它同时也是下一个时隙的定时基准',
        '谁也不是：空时隙不会有确认帧',
      ],
      answer: 1,
      explain: '什么也没收到，就没有可标明的标签。如果不发送这帧确认，标签就没有任何依据来确定下一个时隙从何时开始。',
    },
  ],
}
