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
import {
  J, N, ampAp, firstAmpAckToTag, firstAmpLost, firstAmpResp, firstAmpTrigger, oneRoom, sc, tag, txOf,
  type Lesson,
} from '../lessonKit'

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
  module: 7,
  title: { en: 'A tag with no battery', zh: '没有电池的标签' },
  why: {
    en: 'Imagine a sticker on a milk carton that reports the fridge temperature to your router — no battery, ever. It lives on the few microwatts it can scavenge from the air. A radio that poor cannot do what every Wi-Fi station does all day: listen for a gap and take its turn. So the router has to do the asking, and this lesson is one round of that asking.',
    zh: '设想牛奶盒上贴着一张标签，把冰箱里的温度报给你的路由器——永远不用装电池。它活着靠的，是从空气里捡来的那么几微瓦。这么穷的一台射频，做不了每台 Wi-Fi 终端整天都在做的那件事：听一听空档，然后轮到自己时开口。于是只能反过来，由路由器来问；这一课看的就是这样一轮问答。',
  },
  outcomes: [
    { en: 'say why a battery-free tag cannot listen for its turn', zh: '说清为什么无电池的标签没法听着空档等自己开口' },
    { en: 'describe one round in order: reserve, ask, answer, acknowledge', zh: '按顺序讲出一轮轮询：清场、发问、作答、确认' },
    { en: 'read a tag’s slot draw and what became of it off the event log', zh: '从事件日志里读出标签抽到的时隙，以及这一次的结果' },
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'AMP', plain: {
      en: 'ambient power: the Wi-Fi feature for devices running on harvested energy',
      zh: '环境能量：Wi-Fi 为“只靠收集来的能量工作”的设备准备的功能',
    } },
    { term: 'tag', plain: {
      en: 'the battery-free device the round is for',
      zh: '这一轮轮询服务的那台无电池设备',
    } },
    { term: 'slot', plain: {
      en: 'a short window the router opens for exactly one answer',
      zh: '路由器打开的一小段窗口，只容一次作答',
    } },
    { term: 'ABOC', plain: {
      en: 'the number a tag draws at random to pick its slot',
      zh: '标签随机抽到的数，用它决定自己在第几个时隙作答',
    } },
  ],
  picture: [
    { heading: { en: 'A radio that cannot listen', zh: '一台听不了的射频' }, text: {
      en: 'A tag’s receiver is an envelope detector: it tells loud from quiet, and it cannot keep time between frames. Carrier sense — a receiver kept running to hear if anyone else is talking — is beyond it, and so is a NAV, the countdown a station keeps from the lengths it hears.',
      zh: '标签的接收机是一个包络检波器：它只分得出响和静，而且帧与帧之间也没法准确计时。载波侦听——让接收机一直开着，听有没有别人在说话——它做不到。NAV 同样做不到：那是 Wi-Fi 终端从自己解出的每一帧里读到时长后记下的倒计时。',
    } },
    { heading: { en: 'First, keep the neighbours quiet', zh: '第一步：让邻居先安静' }, text: {
      en: 'The router owns the round and clears the air first: a CTS addressed to itself, a very short frame whose whole content is a length of time. Every Wi-Fi radio that hears it stays quiet that long. The tags take no notice; they cannot decode it.',
      zh: '这一轮由路由器主持，所以开场前它先把场子清干净：发一帧写给自己的 CTS——极短的一帧，内容几乎只有一个时长——凡是听见它的 Wi-Fi 射频，都会老老实实闭嘴那么久。标签则毫无反应：它们本来就解不出这一帧。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Then the router asks', zh: '然后，路由器发问' }, text: {
      en: 'Load the simulation and jump to the first trigger. This is the frame that asks: it opens a row of equal slots and invites any tag that hears it into one.',
      zh: '载入仿真，跳到第一帧触发帧。发问的就是这一帧：它一口气打开一排等长的时隙，邀请每一个听见它的标签挑其中一个作答。',
    } },
    { heading: { en: 'Picking a slot at random', zh: '随手抽一个时隙' }, text: {
      en: 'The trigger does not say which tag goes where. It gives the number of slots and the range to draw from; each tag that decoded it draws its own number, its ABOC, and answers in the slot it points at — the whole of a tag’s decision-making.',
      zh: '触发帧并不指定谁去哪个时隙。它只说明一共几个时隙、该从多大的范围里抽数；凡是解出了它的标签，都自己抽一个数——也就是 ABOC——然后在这个数指向的时隙里作答。抽这一下，就是标签全部的“思考”。',
    } },
    { text: {
      en: 'No tag can hear another, so nothing stops two drawing the same number. Both then answer in one slot, the router hears two signals at once and understands neither. Both readings are lost, and neither tag knows until the closing Ack names the router.',
      zh: '标签之间彼此听不见，所以没有什么拦得住两个标签抽到同一个数。一旦如此，它们会挤在同一个时隙里一起开口，路由器收到两路叠在一起的信号，哪一路都解不出。两个读数都丢了；而它们要等到收尾的那帧确认——里面写的是路由器自己的名字——才知道出了事。',
    } },
    { kind: 'watch', jump: 4, text: {
      en: 'Jump to the first lost answer. Look at what the router sends at the end of that slot, and whose name it carries.',
      zh: '跳到第一次丢失的作答。看一看路由器在那个时隙末尾发出的是什么，里面写着谁的名字。',
    } },
    { heading: { en: 'An acknowledgement is also a clock', zh: '确认帧同时还是一只钟' }, text: {
      en: 'After every slot the router sends a short acknowledgement, answer or no answer — and not out of manners. A tag cannot count its way to the next slot boundary, so the next slot opens just after each acknowledgement ends. Miss one and the round is lost.',
      zh: '每个时隙结束后，路由器都会发一帧很短的确认——不管这个时隙里有没有人作答，而且这不是出于客套。标签没本事自己数到下一个时隙的边界，所以下一个时隙就紧跟在每一帧确认结束之后开启。漏掉一帧的标签，这一轮也就丢了。',
    } },
    // "What a tag never does" — the three records a tag's lane never holds — moved to
    // `deeper` in the step-1 fix wave: a track's first lesson is held to 1000 words, and
    // the mechanism it illustrates is already said in "A radio that cannot listen".
  ],
  numbers: [
    { heading: { en: 'One round, microsecond by microsecond', zh: '一轮轮询，逐微秒展开' }, text: {
      en: 'No other Wi-Fi traffic, so the round stands alone. The router takes the channel the ordinary way, on its lowest-priority access function, and every gap in the round is 10 µs.',
      zh: '没有别的 Wi-Fi 业务，所以这一轮是孤立的。路由器按普通方式、用优先级最低的接入函数拿下信道；这一轮里每个间隔都是 10 µs。',
    } },
    { kind: 'table', heading: { en: 'The first round, on the router’s lane', zh: '路由器泳道上的第一轮' }, head: [
      { en: 'What', zh: '内容' }, { en: 'From', zh: '起' }, { en: 'To', zh: '止' },
    ], rows: [
      [{ en: 'CTS-to-self, Duration 4140 µs', zh: 'CTS-to-self，Duration 4140 µs' }, N('0 µs'), N('50 µs')],
      [{ en: 'AMP Trigger, 4 slots × 528 µs', zh: 'AMP Trigger，4 个时隙 × 528 µs' }, N('60 µs'), N('678 µs')],
      [{ en: 'Slot 1: Door tag', zh: '时隙 1：Door tag' }, N('688 µs'), N('1216 µs')],
      [{ en: 'Ack₁ → Door tag', zh: '第 1 帧 Ack → Door tag' }, N('1226 µs'), N('1556 µs')],
      [{ en: 'Slot 2: Fridge tag', zh: '时隙 2：Fridge tag' }, N('1566 µs'), N('2094 µs')],
      [{ en: 'Ack₂ → Fridge tag', zh: '第 2 帧 Ack → Fridge tag' }, N('2104 µs'), N('2434 µs')],
      [{ en: 'Slot 3: nobody', zh: '时隙 3：无人' }, N('2444 µs'), N('2972 µs')],
      [{ en: 'Ack₃ → Router', zh: '第 3 帧 Ack → 路由器' }, N('2982 µs'), N('3312 µs')],
      [{ en: 'Slot 4: nobody', zh: '时隙 4：无人' }, N('3322 µs'), N('3850 µs')],
      [{ en: 'Ack₄ → Router', zh: '第 4 帧 Ack → 路由器' }, N('3860 µs'), N('4190 µs')],
    ] },
    { kind: 'formula', text: {
      en: 'slot 1 = trigger end 678 + 10 = 688 µs   ·   slot 2 = Ack₁ end 1556 + 10 = 1566 µs',
      zh: '时隙 1 = 触发帧结束 678 + 10 = 688 µs   ·   时隙 2 = Ack₁ 结束 1556 + 10 = 1566 µs',
    }, note: {
      en: 'Every slot opens one gap after the frame before it stops. A tag cannot find those boundaries alone; the Acks find them.',
      zh: '每个时隙都在前一帧结束后隔一个间隔打开。这些边界标签自己掐不准，得靠确认帧替它点明。',
    } },
    { kind: 'formula', text: {
      en: 'round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 4.19 % of 100 ms',
      zh: 'round = 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs = 100 ms 的 4.19 %',
    }, note: {
      en: 'Only 3044 µs has a frame on the air; 90 µs is the nine gaps and 1056 µs the two unused slots — the price of a random draw.',
      zh: '这 4190 µs 里，真正有帧在空中的只有 3044 µs。90 µs 是那九个间隔，1056 µs 是两个没人用的时隙——这就是让标签自己挑时隙的代价。',
    } },
    { heading: { en: 'A second of polling', zh: '一秒钟的轮询' }, text: {
      en: 'A round starts every 100 ms, so a second holds ten: forty slots, forty Acks, twenty tag answers. Sixteen Acks name a tag; the other twenty-four the router, the name an empty or unreadable slot gets. Each tag answers in every round — eight acknowledged, two lost, the counters the inspector ends the second with.',
      zh: '路由器每 100 ms 整点开启一轮，所以一秒钟里有十轮：四十个时隙、四十帧 Ack、二十次标签作答。其中十六帧点名了某个标签，另外二十四帧写的是路由器自己——空时隙或解不出的时隙填的就是它。两个标签都在全部十轮里作了答：八次被确认、两次丢失，这也正是检视器在一秒末尾停住的那几个计数。',
    } },
    { heading: { en: 'Where the losses come from', zh: '那两次丢失是怎么来的' }, text: {
      en: 'Not weak signal: twice in ten rounds both tags drew the same number and spoke together.',
      zh: '丢失不是因为信号弱：十轮里有两轮，两个标签抽到了同一个数，一起开了口。',
    } },
    { kind: 'table', head: [
      { en: 'Round', zh: '轮次' }, { en: 'Slot', zh: '时隙' }, { en: 'Collision at', zh: '碰撞于' },
      { en: 'Ack names', zh: 'Ack 点名' }, { en: 'Tag learns at', zh: '标签得知' },
    ], rows: [
      [N('3'), N('1'), N('201 216 µs'), { en: 'the router', zh: '路由器自己' }, N('201 556 µs')],
      [N('6'), N('3'), N('502 972 µs'), { en: 'the router', zh: '路由器自己' }, N('503 312 µs')],
    ] },
  ],
  deeper: [
    // The link-margin table moved here from `numbers` in the step-1 fix wave: the quiz is
    // answerable without it, the depth beside it ("What that margin is bought with") is
    // where it was already explained, and a track's first lesson is held to 1000 words.
    { kind: 'table', heading: { en: 'Enormous link margin', zh: '链路余量大得惊人' }, head: [
      { en: 'Direction', zh: '方向' }, { en: 'Arrives at', zh: '到达电平' }, { en: 'Needs', zh: '门限' }, { en: 'Margin', zh: '余量' },
    ], rows: [
      [{ en: 'Router → Door tag', zh: '路由器 → Door tag' }, N('−37.4 dBm'), N('−72 dBm'), N('34.6 dB')],
      [{ en: 'Door tag → router', zh: 'Door tag → 路由器' }, N('−57.4 dBm'), N('−94 dBm'), N('36.6 dB')],
    ] },
    { heading: { en: 'The draw, in the trigger’s own terms', zh: '用触发帧自己的说法讲这次抽取' }, text: {
      en: 'The trigger carries a window exponent, ACWE, set to 2 here, so the window is ACW = 2² − 1 = 3. Each tag draws an ABOC from 0, 1, 2, 3 and answers in slot ABOC + 1. That is the whole of the rule the picture states in words.',
      zh: '触发帧里带着一个窗口指数 ACWE，这里取 2，于是窗口 ACW = 2² − 1 = 3。每个标签从 0、1、2、3 中抽一个 ABOC，在第 ABOC + 1 个时隙作答。画面部分用大白话讲的那条规则，写成公式就是这样。',
    } },
    { heading: { en: 'Why neither tag ever sits a round out', zh: '为什么两个标签从不空转' }, text: {
      en: 'A tag sits a round out when its draw can land past the last slot, that is when ACW + 1 > N. Here ACW + 1 = 4 = N, so every draw — 0, 1, 2 or 3 — points at a real slot, and a draw of 3 lands in slot 4, the last one there is. Widen the window or shorten the round and tags start staying silent for whole rounds; a later lesson does exactly that.',
      zh: '只有当抽取有可能落到最后一个时隙之外，也就是 ACW + 1 > N 时，标签才会空转一轮。这里 ACW + 1 = 4 = N，所以 0、1、2、3 每一个结果都指向一个真实存在的时隙，抽到 3 就落在时隙 4——最后一个。把窗口放宽，或者把一轮的时隙减少，标签就会开始整轮整轮地沉默；后面有一课专门做这件事。',
    } },
    { heading: { en: 'What a tag never does', zh: '标签从不做的那些事' }, text: {
      en: 'Scroll a tag’s lane for a whole second and three kinds of record are missing: CCA_BUSY, the channel sounding busy; BACKOFF_DRAW, a countdown drawn before speaking; IFS_START, the wait after someone else stops. A tag has none of them to record; its whole contribution is ten transmissions. The router’s lane has all three.',
      zh: '把标签的泳道整整一秒都翻一遍，会发现三类记录始终缺席：CCA_BUSY，意思是“信道听起来占着”；BACKOFF_DRAW，是开口之前新抽的一个退避计数；IFS_START，是别人停下之后的那段等待。这三样标签都没有可记的；它对整条时间线的全部贡献，就是十次发送。而路由器的泳道里，这三类一应俱全。',
    } },
    { heading: { en: 'What that margin is bought with', zh: '这份余量是拿什么换来的' }, text: {
      en: 'The tag answers at 0 dBm against the router’s 20 dBm, and is still heard with 36.6 dB to spare. Ambient power buys that margin with data rate: the router’s −94 dBm floor for a 250 kb/s answer is about 12 dB below the −82 dBm an ordinary Wi-Fi frame must clear to be received at all. At a quarter of a megabit a second a receiver can integrate long enough to dig a signal out of noise that would leave an OFDM frame undetected.',
      zh: '标签以 0 dBm 发送，而路由器是 20 dBm；即便如此，它的作答被听到时仍有 36.6 dB 余量。这份余量是拿数据率换来的：路由器接收 250 kb/s 作答的 −94 dBm 底线，比一帧普通 Wi-Fi 必须跨过的 −82 dBm 还低约 12 dB：速率只有每秒四分之一兆比特时，接收端可以积分足够久，把信号从噪声里挖出来——而同样的噪声下，一帧 OFDM 根本不会被发现。',
    } },
    { heading: { en: 'Protecting the round, and who ignores it', zh: '保护这一轮，以及谁会无视它' }, text: {
      en: 'The CTS-to-self carries a Duration of 4140 µs. It ends at 50 µs, so the reservation expires at 4190 µs — the very microsecond the fourth Ack stops transmitting. That reservation is all that stands between a tag’s 528 µs of on–off keying and a Wi-Fi station that cannot even detect it as a frame; the coexistence lesson turns it off and watches. Protecting the round is not the same thing as a protected AMP frame, which means an encrypted one and pads 36 µs instead of 20.',
      zh: 'CTS-to-self 的 Duration 是 4140 µs。它在 50 µs 结束，所以这份预留到 4190 µs 到期——正是第四帧 Ack 停止发送的那一微秒。标签那 528 µs 的通断键控信号，和一台连“这是一帧”都检测不出来的 Wi-Fi 终端之间，就只隔着这份预留；共存那一课会把它关掉给你看。还要注意，“保护这一轮”和“受保护的 AMP 帧”不是一回事：后者指的是加了密的帧，填充 36 µs 而不是 20 µs。',
    } },
    { heading: { en: 'Why no lane ever sets a countdown', zh: '为什么没有哪条泳道设过倒计时' }, text: {
      en: 'No lane in this scene ever holds a NAV_SET record. A CTS-to-self sets the countdown in the nodes that hear it, never in its own sender, and there is no other Wi-Fi node here to send one back. The Duration is on the air all the same, for whoever might walk into the room.',
      zh: '这个场景里没有任何一条泳道出现过 NAV_SET 记录。CTS-to-self 只会在听见它的节点里设下倒计时，从不设在发送者自己身上，而这里又没有第二个 Wi-Fi 节点会反过来给它发一帧。不过 Duration 照样在空中广播着，等着任何一个可能走进这个房间的人。',
    } },
  ],
  sources: [
    { en: 'P802.11bp is a draft, not a standard: D0.5 in May 2026, with D1.0 going to letter ballot in September 2026. This module is modelled on the TGbp Specification Framework 11-24/1613r20 (frozen July 2026) plus two proposed-draft-text contributions, 11-26/1519r5 (triggering) and 11-26/1889r4 (uplink channel access).',
      zh: 'IEEE P802.11bp 目前还是草案，不是标准：D0.5 于 2026 年 5 月发布，D1.0 将在 2026 年 9 月进入 letter ballot。本模块依据三份文件建模——2026 年 7 月定稿的 TGbp 规范框架 11-24/1613r20，以及两份提案草案文本：11-26/1519r5（触发过程）与 11-26/1889r4（上行信道接入）。' },
    { en: 'The rule that a tag transmits only inside a slot an AMP triggering frame has just allocated is 11-26/1889r4 §39.4. The 10 µs AMP SIFS is SFD PM-96, and it happens to equal the SIFS 2.4 GHz Wi-Fi already uses. The CTS-to-self Duration rule is §10.23.2.8.',
      zh: '“标签只在 AMP 触发帧刚刚分配给它的时隙里发送”这条规则出自 11-26/1889r4 第 39.4 节。10 µs 的 AMP SIFS 见 SFD PM-96，它恰好与 2.4 GHz Wi-Fi 原本使用的 SIFS 相同。CTS-to-self 的 Duration 规则见 §10.23.2.8。' },
    { en: 'Where the draft leaves a value TBD the simulator picks one and says so: the tag’s −72 dBm downlink sensitivity and the on–off keying SINR thresholds (8 dB down, 10 dB up at 250 kb/s) are model choices, not standard values, and so is the router’s −94 dBm floor for a 250 kb/s answer.',
      zh: '草案里仍标 TBD 的数值，由仿真器自行选定并标注：标签 −72 dBm 的下行灵敏度、通断键控的 SINR 门限（下行 8 dB，250 kb/s 上行 10 dB）都是模型取值而非标准值；路由器接收 250 kb/s 作答的 −94 dBm 底线同样如此。' },
    { en: 'The standard’s name for the tag of this lesson is an Active Tx non-AP AMP STA. The router is a Wi-Fi 7 device because the downlink AMP PPDU carries a U-SIG field. Two other roles the framework defines are absent from this scene: the energizer, which powers a tag by RF, and the AMP-enabled STA, an ordinary Wi-Fi station that can read AMP frames.',
      zh: '本课里的“标签”，标准中的正式名称是 Active Tx 非 AP AMP STA。这里的路由器是 Wi-Fi 7 设备，因为下行 AMP PPDU 带有 U-SIG 字段。规范框架定义的另外两个角色在本场景中都不存在：向标签辐射射频能量的 Energizer（供能器），以及能读懂 AMP 帧的普通 Wi-Fi 终端（AMP-enabled STA）。' },
  ],
  scenario: () => ampIntroScenario({ dlKbps: 250, ulKbps: 250 }),
  variants: [
    {
      label: { en: '1 Mb/s both ways', zh: '上下行都用 1 Mb/s' },
      scenario: () => ampIntroScenario({ dlKbps: 1000, ulKbps: 1000 }),
    },
  ],
  jumps: [
    J('first CTS-to-self', '第一帧 CTS-to-self', txOf((r) => r.frame.kind === 'cts')),
    J('first AMP Trigger', '第一帧 AMP Trigger', firstAmpTrigger),
    J('first tag answer', '标签的第一次作答', firstAmpResp),
    J('first Ack naming a tag', '第一帧点名标签的 AMP Ack', firstAmpAckToTag),
    J('first lost answer (two tags, one slot)', '第一次作答丢失（两个标签挤进同一时隙）', firstAmpLost),
  ],
  observe: [
    { en: 'Jump to the first AMP Trigger and zoom to tens of microseconds: the trigger ends, one 10 µs gap passes, and slot 1 opens.', zh: '跳到第一帧 AMP Trigger，把时间条放大到能看清几十微秒：触发帧结束，隔一个 10 µs 的间隔，时隙 1 就打开。' },
    { en: 'Step a round through the inspector with the Fridge tag selected. The log prints its draw as “ABOC 1 of [0, 3] → slot 2”, its outcome as “slot 2: acknowledged”, and a round line naming the slots, the window and both rates.', zh: '选中 Fridge tag，在检视器里单步走完一轮，同时看旁边的日志：它的抽取打印成 “ABOC 1 of [0, 3] → slot 2”，它这一次的结果打印成 “slot 2: acknowledged”，还有一行写明时隙数、窗口和上下行速率。' },
  ],
  tryThis: [
    { en: 'In the editor raise the Door tag’s downlink sensitivity above the −37.4 dBm it receives, and reload. It stops decoding triggers, so it never draws an ABOC and never transmits — while the round keeps its forty slots and forty Acks a second.', zh: '在编辑器里把 Door tag 的下行灵敏度门限抬到高于它实际收到的 −37.4 dBm，然后重新载入。它将解不出触发帧，于是既不抽 ABOC 也不发送——而每秒四十个时隙、四十帧 Ack 的轮询照旧。' },
  ],
  quiz: [
    {
      q: { en: 'Why give the tag a slot instead of letting it contend?', zh: '为什么要给标签分配时隙，而不是让它自己去竞争信道？' },
      options: [
        { en: 'It would be unfair to Wi-Fi stations', zh: '竞争对 Wi-Fi 终端不公平' },
        { en: 'Carrier sense needs a running receiver, a countdown and a clock', zh: '载波侦听需要一直开着的接收链路、一个倒计时和一只够用的钟' },
        { en: 'A Wi-Fi radio cannot detect what a tag sends', zh: 'Wi-Fi 射频检测不到标签发出的信号' },
      ],
      answer: 1,
      explain: { en: 'An envelope detector and a few microwatts can run none of the three.', zh: '一个包络检波器加上几微瓦的功率，这三样一样也撑不起来。' },
    },
    {
      q: { en: 'Two tags lose their readings twice in ten rounds. Why?', zh: '十轮里两个标签各丢了两次读数。为什么？' },
      options: [
        { en: 'They were too far away for the router to hear', zh: '它们离路由器太远，收不到' },
        { en: 'They drew the same number and answered in one slot', zh: '它们抽到同一个数，挤进同一个时隙一起开口' },
        { en: 'The router ran out of slots before reaching them', zh: '路由器的时隙不够用，没轮到它们' },
      ],
      answer: 1,
      explain: { en: 'The link has decibels to spare; the draw is random, so two tags on one slot is luck.', zh: '这条链路余量充足；抽数是随机的，两个标签撞进同一个时隙纯属运气。' },
    },
    {
      q: { en: 'A slot went by with no answer. Whose name is in the Ack closing it?', zh: '某个时隙里没有人作答。收尾的那帧确认里写的是谁的名字？' },
      options: [
        { en: 'The tag that was supposed to answer', zh: '本该在这个时隙作答的那个标签' },
        { en: 'The router’s own — the Ack is sent anyway, being also the clock', zh: '路由器自己——确认帧照发，因为它同时还是那只钟' },
        { en: 'Nobody: an empty slot gets no Ack', zh: '谁也不是：空时隙不会有确认帧' },
      ],
      answer: 1,
      explain: { en: 'Nothing arrived, so there is no tag to name; skipping it would leave the tags nothing to time by.', zh: '什么也没收到，就没有标签可点名。若干脆不发，标签们就没东西可以用来卡准下一个时隙了。' },
    },
  ],
}
