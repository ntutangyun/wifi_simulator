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
 *
 * As the first lesson of its track this one is held to 1000 main-path words,
 * not 1300, with `why` + `outcomes` + `terms` + `picture` ≤ 650, `numbers`
 * ≤ 350 and `observe` + `tryThis` + `quiz` ≤ 400
 * (tests/course/readability.test.ts; `npx tsx scripts/lesson-dump.ts amp-intro
 * en` prints the four counts). Depth that will not fit belongs in `deeper`,
 * provenance in `sources`; neither is counted.
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
  why: '设想牛奶盒上贴着一张标签，把冰箱里的温度报给你的路由器——永远不用装电池。它活着靠的，是从空气里捡来的那么几微瓦。这么穷的一台射频，做不了每台 Wi-Fi 终端整天都在做的那件事：听一听空档，然后轮到自己时开口。于是只能反过来，由路由器来问；这一课看的就是这样一轮问答。',
  outcomes: [
    '说清为什么无电池的标签没法听着空档等自己开口',
    '按顺序讲出一轮轮询：清场、发问、作答、确认',
    '从事件日志里读出标签抽到的时隙，以及这一次的结果',
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'AMP', plain: '环境能量：Wi-Fi 为“只靠收集来的能量工作”的设备准备的功能' },
    { term: 'tag', plain: '这一轮轮询服务的那台无电池设备' },
    { term: 'slot', plain: '路由器打开的一小段窗口，只容一次作答' },
    { term: 'ABOC', plain: '标签随机抽到的数，用它决定自己在第几个时隙作答' },
  ],
  picture: [
    { heading: '一台听不了的射频', text: '标签的接收机是一个包络检波器：它只分得出响和静，而且帧与帧之间也没法准确计时。载波侦听——让接收机一直开着，听有没有别人在说话——它做不到。NAV 同样做不到：那是 Wi-Fi 终端从自己解出的每一帧里读到时长后记下的倒计时。' },
    { heading: '第一步：让邻居先安静', text: '这一轮由路由器主持，所以开场前它先把场子清干净：发一帧写给自己的 CTS——极短的一帧，内容几乎只有一个时长——凡是听见它的 Wi-Fi 射频，都会老老实实闭嘴那么久。标签则毫无反应：它们本来就解不出这一帧。' },
    { kind: 'watch', jump: 1, heading: '然后，路由器发问', text: '载入仿真，跳到第一帧触发帧。发问的就是这一帧：它一口气打开一排等长的时隙，邀请每一个听见它的标签挑其中一个作答。' },
    { heading: '随手抽一个时隙', text: '触发帧并不指定谁去哪个时隙。它只说明一共几个时隙、该从多大的范围里抽数；凡是解出了它的标签，都自己抽一个数——也就是 ABOC——然后在这个数指向的时隙里作答。抽这一下，就是标签全部的“思考”。' },
    { text: '标签之间彼此听不见，所以没有什么拦得住两个标签抽到同一个数。一旦如此，它们会挤在同一个时隙里一起开口，路由器收到两路叠在一起的信号，哪一路都解不出。两个读数都丢了；而它们要等到收尾的那帧确认——里面写的是路由器自己的名字——才知道出了事。' },
    { kind: 'watch', jump: 4, text: '跳到第一次丢失的作答。看一看路由器在那个时隙末尾发出的是什么，里面写着谁的名字。' },
    { heading: '确认帧同时还是一只钟', text: '每个时隙结束后，路由器都会发一帧很短的确认——不管这个时隙里有没有人作答，而且这不是出于客套。标签没本事自己数到下一个时隙的边界，所以下一个时隙就紧跟在每一帧确认结束之后开启。漏掉一帧的标签，这一轮也就丢了。' },
    // "What a tag never does" — the three records a tag's lane never holds — moved to
    // `deeper` in the step-1 fix wave: a track's first lesson is held to 1000 words, and
    // the mechanism it illustrates is already said in "A radio that cannot listen".
  ],
  numbers: [
    { heading: '一轮轮询，逐微秒展开', text: '没有别的 Wi-Fi 业务，所以这一轮是孤立的。路由器按普通方式、用优先级最低的接入函数拿下信道；这一轮里每个间隔都是 10 µs。' },
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
    { kind: 'formula', text: '时隙 1 = 触发帧结束 678 + 10 = 688 µs   ·   时隙 2 = Ack₁ 结束 1556 + 10 = 1566 µs', note: '每个时隙都在前一帧结束后隔一个间隔打开。这些边界标签自己掐不准，得靠确认帧替它点明。' },
    { kind: 'formula', text: 'round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 100 ms 的 4.19 %', note: '这 4190 µs 里，真正有帧在空中的只有 3044 µs。90 µs 是那九个间隔，1056 µs 是两个没人用的时隙——这就是让标签自己挑时隙的代价。' },
    { heading: '一秒钟的轮询', text: '路由器每 100 ms 整点开启一轮，所以一秒钟里有十轮：四十个时隙、四十帧 Ack、二十次标签作答。其中十六帧点名了某个标签，另外二十四帧写的是路由器自己——空时隙或解不出的时隙填的就是它。两个标签都在全部十轮里作了答：八次被确认、两次丢失，这也正是检视器在一秒末尾停住的那几个计数。' },
    { heading: '那两次丢失是怎么来的', text: '丢失不是因为信号弱：十轮里有两轮，两个标签抽到了同一个数，一起开了口。' },
    { kind: 'table', head: [
      '轮次', '时隙', '碰撞于',
      'Ack 点名', '标签得知',
    ], rows: [
      ['3', '1', '201 216 µs', '路由器自己', '201 556 µs'],
      ['6', '3', '502 972 µs', '路由器自己', '503 312 µs'],
    ] },
  ],
  deeper: [
    // The link-margin table moved here from `numbers` in the step-1 fix wave: the quiz is
    // answerable without it, the depth beside it ("What that margin is bought with") is
    // where it was already explained, and a track's first lesson is held to 1000 words.
    { kind: 'table', heading: '链路余量大得惊人', head: [
      '方向', '到达电平', '门限', '余量',
    ], rows: [
      ['路由器 → Door tag', '−37.4 dBm', '−72 dBm', '34.6 dB'],
      ['Door tag → 路由器', '−57.4 dBm', '−94 dBm', '36.6 dB'],
    ] },
    { heading: '用触发帧自己的说法讲这次抽取', text: '触发帧里带着一个窗口指数 ACWE，这里取 2，于是窗口 ACW = 2² − 1 = 3。每个标签从 0、1、2、3 中抽一个 ABOC，在第 ABOC + 1 个时隙作答。画面部分用大白话讲的那条规则，写成公式就是这样。' },
    { heading: '为什么两个标签从不空转', text: '只有当抽取有可能落到最后一个时隙之外，也就是 ACW + 1 > N 时，标签才会空转一轮。这里 ACW + 1 = 4 = N，所以 0、1、2、3 每一个结果都指向一个真实存在的时隙，抽到 3 就落在时隙 4——最后一个。把窗口放宽，或者把一轮的时隙减少，标签就会开始整轮整轮地沉默；后面有一课专门做这件事。' },
    { heading: '标签从不做的那些事', text: '把标签的泳道整整一秒都翻一遍，会发现三类记录始终缺席：CCA_BUSY，意思是“信道听起来占着”；BACKOFF_DRAW，是开口之前新抽的一个退避计数；IFS_START，是别人停下之后的那段等待。这三样标签都没有可记的；它对整条时间线的全部贡献，就是十次发送。而路由器的泳道里，这三类一应俱全。' },
    { heading: '这份余量是拿什么换来的', text: '标签以 0 dBm 发送，而路由器是 20 dBm；即便如此，它的作答被听到时仍有 36.6 dB 余量。这份余量是拿数据率换来的：路由器接收 250 kb/s 作答的 −94 dBm 底线，比一帧普通 Wi-Fi 必须跨过的 −82 dBm 还低约 12 dB：速率只有每秒四分之一兆比特时，接收端可以积分足够久，把信号从噪声里挖出来——而同样的噪声下，一帧 OFDM 根本不会被发现。' },
    { heading: '保护这一轮，以及谁会无视它', text: 'CTS-to-self 的 Duration 是 4140 µs。它在 50 µs 结束，所以这份预留到 4190 µs 到期——正是第四帧 Ack 停止发送的那一微秒。标签那 528 µs 的通断键控信号，和一台连“这是一帧”都检测不出来的 Wi-Fi 终端之间，就只隔着这份预留；共存那一课会把它关掉给你看。还要注意，“保护这一轮”和“受保护的 AMP 帧”不是一回事：后者指的是加了密的帧，填充 36 µs 而不是 20 µs。' },
    { heading: '为什么没有哪条泳道设过倒计时', text: '这个场景里没有任何一条泳道出现过 NAV_SET 记录。CTS-to-self 只会在听见它的节点里设下倒计时，从不设在发送者自己身上，而这里又没有第二个 Wi-Fi 节点会反过来给它发一帧。不过 Duration 照样在空中广播着，等着任何一个可能走进这个房间的人。' },
  ],
  sources: [
    'IEEE P802.11bp 目前还是草案，不是标准：D0.5 于 2026 年 5 月发布，D1.0 将在 2026 年 9 月进入 letter ballot。本模块依据三份文件建模——2026 年 7 月定稿的 TGbp 规范框架 11-24/1613r20，以及两份提案草案文本：11-26/1519r5（触发过程）与 11-26/1889r4（上行信道接入）。',
    '“标签只在 AMP 触发帧刚刚分配给它的时隙里发送”这条规则出自 11-26/1889r4 第 39.4 节。10 µs 的 AMP SIFS 见 SFD PM-96，它恰好与 2.4 GHz Wi-Fi 原本使用的 SIFS 相同。CTS-to-self 的 Duration 规则见 §10.23.2.8。',
    '草案里仍标 TBD 的数值，由仿真器自行选定并标注：标签 −72 dBm 的下行灵敏度、通断键控的 SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）都是模型取值而非标准值；路由器接收 250 kb/s 作答的 −94 dBm 底线同样如此。',
    '本课里的“标签”，标准中的正式名称是 Active Tx 非 AP AMP STA。这里的路由器是 Wi-Fi 7 设备，因为下行 AMP PPDU 带有 U-SIG 字段。规范框架定义的另外两个角色在本场景中都不存在：向标签辐射射频能量的 Energizer（供能器），以及能读懂 AMP 帧的普通 Wi-Fi 终端（AMP-enabled STA）。',
  ],
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
    J('第一帧点名标签的 AMP Ack', firstAmpAckToTag),
    J('第一次作答丢失（两个标签挤进同一时隙）', firstAmpLost),
  ],
  observe: [
    '跳到第一帧 AMP Trigger，把时间条放大到能看清几十微秒：触发帧结束，隔一个 10 µs 的间隔，时隙 1 就打开。',
    '选中 Fridge tag，在检视器里单步走完一轮，同时看旁边的日志：它的抽取打印成 “ABOC 1 of [0, 3] → slot 2”，它这一次的结果打印成 “slot 2: acknowledged”，还有一行写明时隙数、窗口和上下行速率。',
  ],
  tryThis: [
    '在编辑器里把 Door tag 的下行灵敏度门限抬到高于它实际收到的 −37.4 dBm，然后重新载入。它将解不出触发帧，于是既不抽 ABOC 也不发送——而每秒四十个时隙、四十帧 Ack 的轮询照旧。',
  ],
  quiz: [
    {
      q: '为什么要给标签分配时隙，而不是让它自己去竞争信道？',
      options: [
        '竞争对 Wi-Fi 终端不公平',
        '载波侦听需要一直开着的接收链路、一个倒计时和一只够用的钟',
        'Wi-Fi 射频检测不到标签发出的信号',
      ],
      answer: 1,
      explain: '一个包络检波器加上几微瓦的功率，这三样一样也撑不起来。',
    },
    {
      q: '十轮里两个标签各丢了两次读数。为什么？',
      options: [
        '它们离路由器太远，收不到',
        '它们抽到同一个数，挤进同一个时隙一起开口',
        '路由器的时隙不够用，没轮到它们',
      ],
      answer: 1,
      explain: '这条链路余量充足；抽数是随机的，两个标签撞进同一个时隙纯属运气。',
    },
    {
      q: '某个时隙里没有人作答。收尾的那帧确认里写的是谁的名字？',
      options: [
        '本该在这个时隙作答的那个标签',
        '路由器自己——确认帧照发，因为它同时还是那只钟',
        '谁也不是：空时隙不会有确认帧',
      ],
      answer: 1,
      explain: '什么也没收到，就没有标签可点名。若干脆不发，标签们就没东西可以用来卡准下一个时隙了。',
    },
  ],
}
