/**
 * UWB Tier 1 · M11 · Time of flight · A radio that measures time.
 *
 * The first lesson of the UWB track, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): why a radio
 * would measure time at all, then the four timestamps of one ranging round, and
 * only then the exact values. The frame's own anatomy — SYNC, SFD, STS, PHR,
 * PSDU and where the RMARKER falls — is the next lesson, `uwb-frame`, which
 * loads this same scene.
 *
 * One anchor and one phone, five metres apart on a line, both crystals nailed
 * to 0 ppm, single-sided two-way ranging: the smallest scene in which a
 * distance falls out of four numbers. No AP, no stations, no Wi-Fi traffic at
 * all — the scenario is nothing but a ranging session, so every record in the
 * timeline belongs to it. Every number quoted below is pinned in
 * tests/course/uwb-intro.test.ts.
 *
 * As the first lesson of its track this one is held to 1000 main-path words
 * (`BUDGETS.openerMax`), inside the section ceilings every lesson keeps:
 * `why` + `outcomes` + `terms` + `picture` ≤ 900, `numbers` ≤ 550,
 * `observe` + `tryThis` + `quiz` ≤ 450 (tests/course/readability.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-intro en` prints the four counts). Depth
 * that will not fit belongs in `deeper`, provenance in `sources`; neither is
 * counted.
 *
 * The 2026-09-23 amendment ("mechanism before metaphor") put the ranging
 * procedure itself on the main path: `numbers` carries SS-TWR as the six steps
 * src/uwb/device.ts takes, in its order, and the four-counter table below runs
 * them on this scene value by value.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, firstUwbPoll, firstUwbRange, firstUwbResp, firstUwbRxTs, rangingLab, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** The lab: one anchor, one phone, exactly dM metres apart at the same height. */
export function uwbIntroScenario(dM: 5 | 20): Scenario {
  return uwbSc(rangingLab(), [
    anchor('anchor-1', 'Anchor 1', 1, 4, 2.2, 0),
    uwbTag('tag-1', 'Phone', 1 + dM, 4, 2.2, 0),
  ], { method: 'ss', nlos: false })
}

export const uwbIntro: Lesson = {
  id: 'uwb-intro',
  module: 11,
  title: '一台测量时间的射频',
  why: '手机其实早就能估出自己离路由器有多远——靠的是信号听上去有多响。问题就出在这个“估”字上：一堵墙、一只挡住天线的手，吃掉的信号比十米空气还多。射频还能问的另一个问题是：信号是什么时候到的；这就是超宽带——而光速是一把非常可靠的尺子。这样一次测量最小可以小到什么程度？一个锚点（固定在墙上的射频）、一部手机、四个时间戳，换来一个距离。',
  outcomes: [
    '从事件日志里读出一轮测距的四个时间戳',
    '说清为什么手机量的是往返时间，锚点量的是作答时间',
    '解释为什么差几厘米并不是程序出了毛病',
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'UWB', plain: '超宽带：把极短的脉冲铺在极宽的频段上，所以脉冲到达的那一刻格外分明' },
    { term: 'anchor', plain: '固定在建筑物上的 UWB 射频，是手机测距时的参照物' },
    { term: 'RMARKER', plain: '一帧之内、收发两端约定共同打时间戳的那一个瞬间' },
    { term: 'RCTU', plain: '测距时钟的一格；一微秒里装得下好几万格' },
  ],
  picture: [
    // "Loud is not the same as near" stood here until the step-1 fix wave: it said again,
    // at length, what `why` opens with — that a distance built on loudness inherits every
    // obstacle in the room — and a track's first lesson is held to 1000 words.
    { heading: '发出的是嗒，不是嗡', text: '大多数射频会把一个音调稳稳地保持很长一段；你问接收端这个音调是从哪一刻开始的，它只能给个大概。超宽带（UWB）改发码片——短到几乎刚开始就已经结束的脉冲。边沿越陡，答案越利落，能答到零点几纳秒。' },
    { kind: 'watch', jump: 0, heading: '一问，一答', text: '把仿真载入，按下播放。手机（日志里叫它 tag-1：被定位的那一端就叫标签）发出一帧 Poll，也就是开启一轮测距的那一帧；随后作答的是固定在墙上的那台射频（也就是锚点，日志里的 anchor-1）。把时间线一直放大，直到你能看见两条泳道之间那道极窄的缝隙：那道缝隙就是它们之间的空气。' },
    { text: '两端都不去记自己这一帧的开头或结尾，它们记的是帧里同一个地标——RMARKER，在每一帧测距帧内部稍靠前一点、双方事先约定好要一起打时间戳的那个瞬间。' },
    { heading: '两只对不上的钟', text: '手机和锚点各用各的晶振数时间，从来没有人去把这两只钟对齐。但这不要紧：每台设备减的都只是自己的两次读数，未知的起点因此被约掉。' },
    { heading: '差几厘米，算差吗', text: '每一个时间戳都带着一点噪声：一个脉冲被判定为“已经到达”的那一刻本身就不确定，而时钟只能一格一格地数。四次读数里有两次是接收，日志报出的距离也就落在真值两侧几厘米的范围里。这是这台射频在正常工作，不是出了毛病。' },
    { kind: 'watch', jump: 3, text: '跳到算出距离的那一行——一行三个数，而下面那套步骤讲的就是它们是怎么来的。' },
  ],
  numbers: [
    { kind: 'formula', heading: '单边双向测距（SS-TWR）', text: 'T̂prop = (Tround − Treply) / 2', note: 'Tround 是手机在自己钟上做的那次相减，Treply 是锚点在自己钟上做的那次。' },
    { kind: 'steps', heading: '从四个计数值到米', items: [
      '手机先给自己即将发出的那个 RMARKER 打上时间戳，然后把 Poll 发出去。',
      '锚点在同一个 RMARKER 到达时给它打上时间戳。',
      '一个时隙之后，也就是 2 ms 后，锚点给自己应答帧的 RMARKER 打上时间戳，把自己的两次读数一减，再把这个作答时间写进应答帧里。',
      '手机在应答到达时打上时间戳，同样把自己的两次读数一减：得到往返时间。',
      '往返时间减去作答时间，再折半：一趟飞行，此时还是以“格”计的。',
      '格数 × 15.650 ps × 0.299792458 m/ns：这就是测距行上写出的米数。',
    ] },
    { heading: '要相减的那四行', text: '每一条 UWB_TS 记录都是一次计数器读数；这一轮产生四条，顺序如下。' },
    { kind: 'table', head: [
      '日志行', '计数值（RCTU）',
    ], rows: [
      ['tag-1 TX RMARKER → * poll', '336 207 494 656'],
      ['anchor-1 RX RMARKER ← tag-1 poll', '26 381 598 252'],
      ['anchor-1 TX RMARKER → tag-1 resp', '26 509 392 384'],
      ['tag-1 RX RMARKER ← anchor-1 resp', '336 335 290 928'],
    ] },
    { kind: 'formula', text: 'Tround = 336 335 290 928 − 336 207 494 656 = 127 796 272\nTreply = 26 509 392 384 − 26 381 598 252 = 127 794 132\nT̂prop = (127 796 272 − 127 794 132) / 2 = 1070 RCTU = 16.75 ns = 5.02 m', note: '两个几千亿量级的数字，差值只有 2140。真值是 1065.7 格：读数偏大 4.3 格，因为两次接收计数各带 100 ps 噪声，而计数只能取整。' },
    { kind: 'formula', heading: '测距行是怎么写的', text: 'tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)', note: 'raw 就是上面那个 1070；写在前面的那个数，是同一次测量做了时钟偏差修正之后的结果。这里两个晶振都是完美的，可答案还是挪动了 7 cm——原因见“再深一层”。' },
    { kind: 'table', heading: '单位换算', head: [
      '量', '数值', '出处',
    ], rows: [
      ['499.2 MHz 的一个码片', '2.003 ns', 'Clause 16'],
      ['一个 RCTU = 2⁻⁷ 码片', '15.650 ps', '§10.29'],
      ['飞行一米', '3.3356 ns = 213.1 RCTU', 'c = 0.299792458 m/ns'],
      ['计时差一格', '飞行 4.7 mm，测距 2.3 mm', '往返折半'],
    ] },
    { kind: 'table', heading: '飞行时间，以及它落在时间线的哪一格', head: [
      '相距', '飞行时间', '落在 1 ns 网格上',
    ], rows: [
      ['5 m', '16.678 ns', '17 ns'],
      ['20 m', '66.713 ns', '67 ns'],
    ] },
    { text: '事件队列只数整纳秒，且一律向上取整，好让没有一帧比物理允许的更早送达。计数器不取整：它以 15.650 ps 为单位，这张网格比时间线精细 64 倍。' },
  ],
  deeper: [
    { heading: '一次无事可修的修正', text: '时钟偏差修正的做法，是用接收端从载波上估出的相对频率误差去缩放 Treply。而估计器自身带有噪声，本模型里是 0.2 ppm；2 ms 应答时延的 0.2 ppm 就是 0.4 ns，其中一半会落到距离上。这正是藏在一个完美场景里的那一课：不管晶振有没有真的偏，这种方法的误差都随应答时长而增长。' },
    { heading: '那些巨大的计数值是怎么来的', text: '本模型里计数器是 40 位宽，标准只要求至少 32 位。每格 15.650 ps，2⁴⁰ 格就是 17.2 秒，之后回绕归零。没有任何机制去复位它、也不会把它对齐到任何基准，所以上面每一次相减都是模 2⁴⁰ 的；而你读到的那些几千亿量级的数值，不过是会话开始那一刻两只晶振碰巧停在的位置。' },
    { heading: '换成真实的晶振要付多少代价', text: '这里两个晶振都被钉死在 0 ppm，而现实中没有哪一对设备是这样：标准允许 ±20 ppm。当相对偏差是 20 ppm 时，锚点那 2 ms 的应答会被测错 40 ns，其中一半直接落到距离上——20 ns，六米，加在一个五米的距离上。本轨道后面有一课会撤掉这份宽容。' },
    { heading: 'Wi-Fi 那一半从不让你看见的时延', text: '本仿真器的 Wi-Fi 那一半，是有意让接收端在发送的同一瞬间收到帧的。在一套住宅的尺度上，传播时延不过几十纳秒，而时隙是 9 µs，丢掉它对 MAC 毫无影响。UWB 做不了这个简化，因为在这里时延不是误差项，它就是被测量的对象。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 是已经发布的标准，不是草案。第 16 章的 HRP UWB PHY、§10.29 的测距计数器与 RMARKER、§10.32 的 SP1 分组配置都是标准正文；本课里每一个码片数和字段时长都由它们推导而来。',
    '有两个数字不属于标准：2 ms 的测距时隙和 200 ms 的测距块，来自 FiRa 的 UWB 配置文件。',
    '下面这些是仿真器自己的模型取值，列出来方便你质疑：−14 dBm 发射功率、−93 dBm 接收灵敏度、每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及墙体给遮挡路径额外增加的时延。',
    '“再深一层”里引用的 ±20 ppm 晶振容差出自 §16.4.9。40 位计数器是模型取值，标准正文只要求至少 32 位。',
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '相距 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧离开手机', firstUwbPoll),
    J('锚点记下到达的 RMARKER', firstUwbRxTs),
    J('锚点作答', firstUwbResp),
    J('距离算出来了', firstUwbRange),
  ],
  observe: [
    '跳到 Poll 帧，把时间线放大到纳秒级：手机泳道上的 TX_START 在 0 ns，锚点泳道上的 RX_START 在 17 ns。五米空气，这一次是按真实比例画出来的。',
    '按顺序读日志里的四条 UWB_TS：手机的 TX RMARKER、锚点的 RX RMARKER、锚点的 TX RMARKER、手机的 RX RMARKER。两条读自一个晶振，两条读自另一个。',
    '找到 2 187 389 ns 处的 UWB_RANGE：报出 4.95 m，真值 5.00 m，旁边是 raw 的 5.02 m——差了几厘米，而单次读数的噪声标准差就是 2.1 cm。',
  ],
  tryThis: [
    '载入 20 m 变体。到达间隔从 17 ns 变成 67 ns——距离四倍，飞行时间也四倍。测距行报出 19.95 m，真值 20.00 m：依然差几厘米，因为时间戳噪声并不在乎这一帧飞了多远。',
  ],
  quiz: [
    {
      q: 'UWB 为什么去测时间，而不是测信号强度？',
      options: [
        '因为时间更好测',
        '强度既取决于距离，也取决于墙和手；到达时间只取决于路径长度',
        'UWB 接收端读不到信号强度',
      ],
      answer: 1,
      explain: '一扇门、一只手，吃掉的信号比好几米空气还多；而到达时间只随路径长度变化。',
    },
    {
      q: '一个 RCTU 是多少，它对应多长的距离？',
      options: [
        '一个码片，2.003 ns，约 60 cm',
        '码片的 2⁻⁷，15.650 ps，约 4.7 mm 的飞行距离',
        '一纳秒，也就是时间线的网格，约 30 cm',
      ],
      answer: 1,
      explain: '计数器比 499.2 MHz 的码片速率再细 128 倍；一米是 213.1 格。',
    },
    // A third question — "five metres is 16.678 ns, yet RX_START sits 17 ns after TX_START:
    // is the range 0.3 ns wrong?" — stood here until the step-1 fix wave. It asked about the
    // timeline's 1 ns grid rather than about ranging, and a track's first lesson is held to
    // 1000 words. The claim it tested is still in `numbers` ("Flight, and where it lands on
    // the timeline") and still pinned in tests/course/uwb-intro.test.ts.
  ],
}
