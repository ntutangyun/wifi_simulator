/**
 * UWB Tier 1 · M11 · Time of flight · Two round trips cancel the clock.
 *
 * The fourth lesson of the UWB track, written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). The lesson
 * before this one removed the crystal offset by measuring it; this one removes
 * it by arithmetic — one extra message, two round trips, and one factor of
 * every clock in each product of the numerator, so nothing has to be estimated.
 *
 * Same scene as uwb-sstwr, measured the other way: the same four anchors on a
 * 3.50 m ring, the same ±10 ppm crystals, DS instead of SS. The counters, the
 * two lanes that compute the same distance, the Final's growth with the anchor
 * count and the wall the formula cannot see are in `deeper`; the clauses and
 * the model choices are in `sources`.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M14). It **stays whole** — the third message and why the clocks cancel are
 * one argument — and §4 gives it a `sequence` figure: Poll、四个 Response、Final、
 * 四份 Report. The figure replaces prose: 「三条消息，外加一张回执」 walked the four
 * message kinds and who measures what in a paragraph, which is precisely what a
 * sequence diagram is for, and its two self-messages carry what `deeper` used to
 * have to say twice: the anchor finishes at the Final and the phone at the
 * report, on the same number. §5 names no cut in this lesson, so everything else
 * here is tightening rather than deleting — no claim left the lesson.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-dstwr.test.ts.
 * `npx tsx scripts/lesson-dump.ts uwb-dstwr` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import type { SequenceSpec } from '../diagram'
import { J, anchor, firstUwbFinal, firstUwbPoll, firstUwbPosition, firstUwbReport, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The first range computed on an anchor's lane: an anchor finishes at the Final, before any report flies. */
const firstAnchorRange = (r: TLRecord): boolean => r.type === 'UWB_RANGE' && r.node.startsWith('anchor')

/**
 * The previous lesson's scene, measured the other way: four anchors on a 3.50 m
 * ring around a phone at the centre of a 10 × 8 m lab, every device at 2.20 m,
 * so all four true distances are exactly 3.50 m. Only the session changes — DS
 * instead of SS — which is the whole point of putting it here again.
 */
export function uwbDstwrScenario(ppm: { tag: number; anchors: number }): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2, ppm.anchors),
    anchor('anchor-2', 'Anchor 2', 5, 7.5, 2.2, ppm.anchors),
    anchor('anchor-3', 'Anchor 3', 1.5, 4, 2.2, ppm.anchors),
    anchor('anchor-4', 'Anchor 4', 5, 0.5, 2.2, ppm.anchors),
    uwbTag('tag-1', 'Phone', 5, 4, 2.2, ppm.tag),
  ], { method: 'ds', nlos: false })
}

/**
 * The instants the figure prints in its gutter, in milliseconds, exactly as the
 * timeline puts them: the Poll at 0, one answer per 2 ms slot, the Final in the
 * middle, and the two moments the two lanes finish — the anchor when the Final
 * lands, the phone when that anchor's report does. Read back out of the run in
 * tests/course/uwb-dstwr.test.ts, so the figure cannot drift from it.
 */
export const FIG = {
  poll: '0 ms', resp1: '2 ms', respRest: '4–8 ms', final: '10 ms',
  anchorRange: '10.237 ms', tagRange: '12.191 ms', reportRest: '14–18 ms', report1: '12 ms',
  /** The distance both lanes print for anchor 1, to two decimals. */
  rangeM: '3.51 m',
} as const

/**
 * The whole round as an exchange: one Poll to four anchors, four answers in four
 * slots, one Final that settles all four, four reports back. The two
 * self-messages are the point the prose used to make twice — the anchor holds
 * all four times the moment the Final lands and computes there, the phone has to
 * wait for the report and computes the same number.
 */
export function uwbDstwrSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'tag-1', label: '手机' },
      { id: 'anchor-1', label: '锚点 1' },
      { id: 'rest', label: '锚点 2–4' },
    ],
    messages: [
      { from: 'tag-1', to: 'anchor-1', label: 'Poll', at: FIG.poll },
      { from: 'anchor-1', to: 'tag-1', label: 'Response', at: FIG.resp1 },
      { from: 'rest', to: 'tag-1', label: 'Response ×3', at: FIG.respRest },
      { from: 'tag-1', to: 'anchor-1', label: 'Final', at: FIG.final, tone: 'accent' },
      { from: 'anchor-1', to: 'anchor-1', label: `算出 ${FIG.rangeM}`, at: FIG.anchorRange },
      { from: 'anchor-1', to: 'tag-1', label: 'Report', at: FIG.report1 },
      { from: 'tag-1', to: 'tag-1', label: `同一个 ${FIG.rangeM}`, at: FIG.tagRange },
      { from: 'rest', to: 'tag-1', label: 'Report ×3', at: FIG.reportRest },
    ],
  }
}

export const uwbDstwr: Lesson = {
  id: 'uwb-dstwr',
  module: 13,
  title: '两次往返，把时钟消掉',
  why: '把对方的时钟测出来确实管用，但它留下的剩余误差会随锚点（anchor）多等的每一毫秒一起变大。还有一条路能把等待甩掉：多发一条消息，让两端都既问过也答过。这样一来，每只钟在算式两边出现的次数一样多，误差是被抵消掉的，而不是被估计掉的。',
  outcomes: [
    '说出双边交互的三条消息，以及谁在量哪一段',
    '解释为什么两段等待不必相等，时钟照样抵消',
    '说清多发这条消息的代价，以及它修不好的东西',
  ],
  needs: ['uwb-sstwr'],
  terms: [
    { term: 'DS-TWR', plain: '双边双向测距：做两次往返，让两只钟自己抵消' },
    { term: 'Final', plain: '手机发的第三条消息，结束这次交互，带上只有手机量得到的那些数' },
    { term: 'Report', plain: '锚点的最后一条消息，把只有它量得到的两段时间告诉手机' },
    { term: 'RMI', plain: '测距测量信息：帧里专门写这些时间段的那一部分' },
  ],
  picture: [
    { heading: '再多发一条消息', text: '上一课的办法是把晶振（crystal）测出来再修正。还有另一条路：让手机也答一次。等所有锚点都回过话，手机再发第三条消息——Final——每个锚点给这段间隔计时，做法与手机给应答计时完全一样。至此两端都既问过也答过。' },
    { kind: 'watch', jump: 1, heading: '找到第三条消息', text: '载入仿真，跳到 Final 帧。它从这一轮正中间发出，一帧同时发给所有锚点；它之后的一切都只是记账。' },
    {
      kind: 'diagram', heading: '三条消息，外加一张回执', spec: uwbDstwrSequence(),
      caption: '一轮里真正发生的事（日志里写作 tag-1 与 anchor-1…anchor-4）：手机一帧 Poll 问四个锚点，四个锚点各在自己的时隙里作答，手机再用一帧 Final 把四个一起结清，最后每个锚点各送回一份 Report。四段时间，两端各量两段，没有哪一段用了别人的单位。锚点在 Final 落地那一刻就凑齐四段，当场算出距离；手机要等报告，算出的是同一个数。',
    },
    { heading: '两次往返，都是错的', text: '把两次往返分别算出来，哪一次都不是距离。第一次正是上一课那个未修正的估计，错法一样：同一道斜坡。第二次是它的镜像——这回轮到手机等待，而手机是那只快钟，于是这一半算出来是负的。答案也不是两者的平均。' },
    { heading: '两只钟为什么会抵消', text: '双边双向测距（DS-TWR）既不挑一半，也不求平均：它把两次往返相乘、两段等待相乘，再把两个乘积相减。每一对里都是手机量一段、锚点量一段，所以两个乘积被同一对速率拉伸了同样的倍数——随后那次除法正好把这份拉伸再除掉。两段等待对不对称，无关紧要。' },
    { heading: '代价是时隙，不是空口时间（airtime）', text: '两次往返比一次多两类消息——手机的 Final 与每个锚点的 Report——所以同样四个锚点，一轮要占十个时隙，原来只要五个。翻倍的是一轮多长，以及每台设备醒来几次。' },
    { heading: '它修不好的那些', text: '这一切只拿掉了一项误差：晶振。每个接收时间戳依旧带着噪声，现在的误差正是由它构成——但它不再随等待增长，所以最后作答的锚点和最先作答的一样准。被挡住的直射路径也没被解决：首径（first path）来得晚，这段迟到会原封不动加到距离上。' },
  ],
  numbers: [
    { kind: 'formula', heading: '双边双向测距', text: 'Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)', note: '分子里每个乘积都各带两只钟的一个因子，无论两段等待多久。分母不是哪一段等待，而是整场交互，两端各计一次。活下来的只有被百万分之几（ppm）缩放的飞行时间——不到一皮秒。' },
    { kind: 'table', heading: '两个半场与答案', head: [
      '锚点', 'Treply1', '前半场',
      '后半场', 'DS-TWR 结果',
    ], rows: [
      ['anchor-1', '2 ms − Tprop', '9.51 m', '−20.49 m', '3.51 m'],
      ['anchor-2', '4 ms − Tprop', '15.47 m', '−14.48 m', '3.49 m'],
      ['anchor-3', '6 ms − Tprop', '21.49 m', '−8.43 m', '3.54 m'],
      ['anchor-4', '8 ms − Tprop', '27.42 m', '−2.55 m', '3.45 m'],
    ] },
    { text: '把第一行的两个半场平均一下，得到 −5.49 m——也不是答案。' },
    { kind: 'table', heading: '十个时隙，都被什么填满', head: [
      '帧', '数量', '字节', '单帧空口时间',
    ], rows: [
      ['Poll', '1', '39', '206.86 µs'],
      ['Response', '4', '14', '181.22 µs'],
      ['Final', '1', '62', '236.60 µs'],
      ['Report', '4', '24', '191.47 µs'],
      ['整轮合计', '10', '253', '1 934.23 µs'],
    ] },
    { heading: 'Response 变短了', text: '这里的 Response 是 14 个字节，不是 20 个：它那段回复时延（reply time）如今改由 Report 捎回去。' },
    { text: '在 20 000 µs 的轮里辐射 1 934.23 µs，占 9.67 %，上一课那个单边轮是 9.56 %。信道占用率几乎没动，翻倍的是时延与醒来的次数。' },
    { kind: 'table', heading: '时间戳噪声留下的', head: [
      '锚点', '作答时隙',
      '测距噪声 1σ', '本次运行的误差',
    ], rows: [
      ['anchor-1', 'slot 1', '1.9 cm', '+1.4 cm'],
      ['anchor-2', 'slot 2', '1.8 cm', '−0.9 cm'],
      ['anchor-3', 'slot 3', '1.8 cm', '+3.7 cm'],
      ['anchor-4', 'slot 4', '1.9 cm', '−5.2 cm'],
    ] },
    { text: '每个结果里进来三个带噪声的接收时间戳，而这一列不再是斜坡：锚点 4 等了四倍长，拿到的数值却一样。' },
    { kind: 'steps', heading: '一次测距，一步一步', items: [
      '时隙 0。手机给 Poll 离开打戳，用自己的计数器；每个锚点也给同一帧的到达打戳，各用各的。',
      '锚点在自己的时隙里给 Response 的离开打戳。此刻它手里有 Treply1（自己的等待：从 Poll 到达到 Response 发出），却只字不提——这一帧不带任何时间。',
      '手机给这帧 Response 的到达打戳，再减去自己那一对计数值：Tround1（它的往返：从 Poll 发出到这帧 Response 到达）。',
      '手机给 Final 的离开打戳，把它对每个作答过的锚点量到的那次往返，连同 Treply2（自己的等待：从 Response 到达到 Final 发出），一起写进这一帧的测距测量信息（ranging measurement information, RMI）——这两段只有手机量得到。',
      '每个锚点给 Final 的到达打戳，再一减：Tround2（自己的往返：从 Response 发出到 Final 到达）。此刻四段时间齐了，它当场把距离算出来。',
      '接着每个锚点发一帧 Report，把自己量的两段送回去。手机也凑齐了四段，拿同样的四个值走同一套算式：两条泳道的结果连最后一位都一样。',
      '这套算式把两次往返相乘、两段等待相乘，两个乘积相减，最后除以四段时间之和。每个乘积各含两端各一段，所以那次除法把两块晶振一并除掉。什么都不用估计，时钟偏差（clock offset）压根没被读过。',
    ] },
    { kind: 'table', heading: '锚点 1，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['Poll 离开手机', '336 207 494 703'],
      ['它到达锚点 1', '26 381 597 885'],
      ['它的 Response 离开', '26 509 391 059'],
      ['它到达手机', '336 335 291 933'],
      ['Final 离开手机', '336 846 477 093'],
      ['它到达锚点 1', '27 020 567 485'],
      ['= Treply1（锚点的等待）', '127 793 174'],
      ['= Tround2（锚点的往返）', '511 176 426'],
      ['= Tround1（手机的往返）', '127 797 230'],
      ['= Treply2（手机的等待）', '511 185 160'],
      ['答案，两条泳道相同', '749.0 · 3.51 m'],
    ] },
  ],
  deeper: [
    { heading: '锚点 1 的四个计数值', text: '锚点 1 打出 26 381 597 885、26 509 391 059 与 27 020 567 485，于是 Treply1 = 127 793 174，Tround2 = 511 176 426 RCTU。手机对它的那一对是 Tround1 = 127 797 230 与 Treply2 = 511 185 160。把两对分别相减：+4056 与 −8734 RCTU，即 +63 ns 与 −137 ns——而两者本都应当是 11.675 ns 飞行时间的两倍。四者相加约为 1 277 952 000 RCTU：整场交互，被计了两遍。' },
    { heading: '同一个数，算了两遍', text: '有两台设备各自握齐了四个时间，因此都能把算式算一遍。锚点在 Final 到达时就算完了，时刻是 10 236 615 ns；手机要等该锚点的报告——锚点 1 是 12 191 486 ns，晚了将近两毫秒。两条泳道上的距离完全相同，连最后一位都一样：同样四个计数值，经过同一个函数。报告帧的用途正在于此——锚点早就知道这个距离，而需要定位的是手机。本轮结束时，四个距离解算出 (5.01, 3.98) m 的定位，真值 (5.00, 4.00)：偏差 2 cm，这个对称圆环的 GDOP 为 1.00。' },
    { heading: '长得最快的那一帧', text: 'Final 是全轮最大的帧，也是随锚点数增长最快的：14 + 12N 字节，而 Poll 是 27 + 3N——此处 62 字节、496 位、两个 Reed–Solomon 码块。Response 与 Report 则完全不随锚点数增长。多一个锚点，Final 会多 12 字节，整轮会多两个时隙、即 4 ms。' },
    { heading: '公式看不见的那堵墙', text: '被遮挡的首径会把三个接收时间戳一起推迟。于是两次往返都变大、两段等待都变小，幅度相同；分母纹丝不动，而这段多出来的时延会原封不动加到距离上——既不打对折，也不会被抵消。在本场景里，一堵砖墙会给每一个距离加上 60 cm。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.1.2.4 与图 10-199 给出三消息双边测距的计算式、它用到的四个时间，以及“两个应答时延不必相等”这句话；§10.32.5 把这次交互放进一对多的测距轮里：一帧 Final 结清所有锚点。±20 ppm 的晶振容差来自 §16.4.9。',
    '2 ms 的测距时隙来自 FiRa，不是标准正文。另有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、帧长表所依据的测距信息宽度（Final 的 RMI 为 3 + 6N 字节，单个应答时延字段为 6 字节，报告的 RMI 为 13 字节），以及 40 位的测距计数器——标准只要求至少 32 位。',
  ],
  scenario: () => uwbDstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: '最差晶振，±20 ppm', scenario: () => uwbDstwrScenario({ tag: 20, anchors: -20 }) },
  ],
  jumps: [
    J('Poll 帧离开手机', firstUwbPoll),
    J('Final 帧：一帧发给四个锚点', firstUwbFinal),
    J('锚点算出距离', firstAnchorRange),
    J('第一份测量报告', firstUwbReport),
    J('本轮结束时的定位', firstUwbPosition),
  ],
  observe: [
    '整轮那一行写着 "10 slots × 2000.0 µs"，到 20 000 000 ns 结束——同样的锚点，却是上一课那一轮的两倍长。',
    'Final 独自坐在这一轮正中间，10 ms 处：一帧发给所有锚点，排在最后一条 Response 之后、第一份报告之前。',
    '四条锚点泳道上的测距都出现在 10 236 615 ns，即 Final 落地之时；手机自己那四条则在 12、14、16、18 ms 出现。每一对读数完全相同。',
  ],
  tryThis: [
    '载入“最差晶振，±20 ppm”：两端偏差翻倍，别的不改。两个半场随即失控——第一个锚点读到 15.51 m 与 −44.47 m，原先是 9.51 与 −20.49——而四个结果的变化不到 3 mm。',
    '在帧检视器里打开 Final：一个 RMI 列出四个锚点，其后每个锚点各有一个短字段，装着手机量的第二段时间。再打开一份报告：一个 RMI，装着锚点自己量的两段。',
  ],
  quiz: [
    {
      q: '锚点 4 作答前等四个时隙，锚点 1 只等一个，为什么两者一样准？',
      options: [
        '公式按等待时长加权，等得久的那次分量更小',
        '分子里每个乘积都各带两只钟的一个因子，与等待多久无关',
        '时隙足够短，速率误差落在它上面已小于噪声',
      ],
      answer: 1,
      explain: '对称并非必要条件：分母是整场交互，不是某一段等待；剩下的只有被百万分之几缩放的飞行时间。',
    },
    {
      q: '锚点 1 的两个半场是 9.51 m 与 −20.49 m，答案却是 3.51 m。这说明什么？',
      options: [
        '有一次往返被破坏，公式把它丢掉了',
        '两个半场都不是距离：飞行时间被埋在“半段等待乘时钟误差”之下，而且符号相反',
        '答案就是两个半场的平均',
      ],
      answer: 1,
      explain: '两者的平均是 −5.49 m。每个半场都是某一方向上未修正的估计；上一课靠测量修正的那道斜坡，这里改用相乘抵消。',
    },
    {
      q: '多发的这条消息花了什么代价，又买不到什么？',
      options: [
        '没有可测的代价：占比 9.67 % 对 9.56 %，噪声也一并没了',
        '十个时隙而不是五个，醒来次数翻倍——噪声与被遮挡的路径都活了下来',
        '四倍空口时间，因为 Final 与报告是最大的帧',
      ],
      answer: 1,
      explain: '占用率几乎没变：代价不在空口时间，而在时延与功耗。晶振那一项被压到皮秒量级，接收噪声却留下了。',
    },
  ],
}
