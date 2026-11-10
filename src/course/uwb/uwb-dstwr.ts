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
  module: 15,
  title: '两次往返，消去时钟误差',
  why: '测量对方时钟的快慢确实有效，但它留下的剩余误差会随锚点（anchor）每多等待一毫秒而增大。另一种方法是多发一条消息：所有锚点应答之后，手机再发一帧 Final，使两端都既发起过请求也作过应答。于是共有四段时间，两端各测两段，没有哪一段使用对方的计时单位。单独看任何一次往返都得不到距离——前一次就是上一课那种未修正、随时隙线性增长的估计，后一次是它的镜像，算出来是负值，两者的平均也不对。双边双向测距（double-sided two-way ranging, DS-TWR）把两次往返相乘、两段等待相乘，两个乘积相减，再除以四段时间之和：每个乘积中两端的时钟各贡献一个因子，缩放倍数相同，这次除法恰好将其消去。误差是被抵消的，而不是被估计后修正的，时钟偏差（clock offset）一次也没有被读取；两段等待长短不等也没有影响。剩下的只是接收时间戳的噪声，约几厘米，而且不再随等待时长增长，最后作答的锚点与最先作答的一样准确。锚点在 Final 到达时就能算出距离，手机要等每个锚点发回的 Report，算出的是同一个数。代价是一轮占用的时隙数翻倍，时延和设备唤醒次数也随之翻倍，空口占用却几乎不变；被遮挡的首径（first path）造成的延迟，也会全部计入距离。',
  outcomes: [
    '说出双边交互的三条消息，以及每一段时间由哪一端测量',
    '解释为什么两段等待不必相等，时钟误差仍能抵消',
    '说明多发这条消息的代价，以及它无法消除的误差',
  ],
  needs: ['uwb-sstwr'],
  terms: [
    { term: 'DS-TWR', plain: '双边双向测距：进行两次往返，使两端的时钟误差相互抵消' },
    { term: 'Final', plain: '手机发送的第三条消息，结束这次交互，并携带只有手机能测得的时间值' },
    { term: 'Report', plain: '锚点的最后一条消息，把只有它能测得的两段时间发给手机' },
    { term: 'RMI', plain: '测距测量信息：帧中专门承载这些时间值的部分' },
  ],
  picture: [
    { heading: '再多发一条消息', text: '上一课的方法是测出晶振（crystal）的偏差再加以修正。另一种方法是让手机也应答一次。所有锚点应答之后，手机再发送第三条消息——Final——每个锚点对这段间隔计时，做法与手机对应答计时完全相同。至此两端都既发起过请求也作过应答。' },
    { kind: 'watch', jump: 1, heading: '找到第三条消息', text: '载入仿真，跳到 Final 帧。它在这一轮的正中间发出，一帧同时发给所有锚点；在它之后的消息都只是把测得的时间发回。' },
    {
      kind: 'diagram', heading: '三条消息，外加一份测量报告', spec: uwbDstwrSequence(),
      caption: '一轮中实际发生的过程（日志里写作 tag-1 与 anchor-1…anchor-4）：手机用一帧 Poll 向四个锚点发起请求，四个锚点各在自己的时隙里作答，手机再用一帧 Final 同时完成与四个锚点的交互，最后每个锚点各发回一份 Report。四段时间，两端各测两段，没有哪一段使用对方的计时单位。锚点在 Final 到达时就集齐四段时间，立即算出距离；手机要等报告，算出的是同一个数。',
    },
    { heading: '两次往返单独计算都不正确', text: '把两次往返分别计算，哪一次都得不到距离。第一次正是上一课那个未修正的估计，误差形式相同：随时隙线性增长。第二次是它的镜像——这次是手机等待，而手机的时钟偏快，于是这一半算出来是负值。答案也不是两者的平均。' },
    { heading: '两端的时钟为什么会抵消', text: '双边双向测距（DS-TWR）既不取其中一半，也不求平均：它把两次往返相乘、两段等待相乘，再把两个乘积相减。每一对中都是手机测一段、锚点测一段，所以两个乘积被同一对速率缩放了相同的倍数——随后的除法恰好消去这一缩放。两段等待是否对称并无影响。' },
    { heading: '代价是时隙，不是空口时间（airtime）', text: '两次往返比一次多两类消息——手机的 Final 与每个锚点的 Report——所以同样是四个锚点，一轮要占用十个时隙，原来只需五个。翻倍的是一轮的时长，以及每台设备的唤醒次数。' },
    { heading: '它无法消除的误差', text: '这一切只消除了一项误差：晶振偏差。每个接收时间戳仍然带有噪声，现在的误差正是由它构成——但它不再随等待时长增长，所以最后作答的锚点与最先作答的一样准确。直射路径被遮挡的问题也没有解决：首径（first path）到达较晚，这段延迟会全部计入距离。' },
  ],
  numbers: [
    { kind: 'formula', heading: '双边双向测距', text: 'Tprop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)', note: '分子里每个乘积都各带两端时钟的一个因子，无论两段等待多久。分母不是哪一段等待，而是整场交互，两端各计一次。剩下的只有被百万分之几（ppm）缩放的飞行时间误差——不到一皮秒。' },
    { kind: 'table', heading: '两个半场与答案', head: [
      '锚点', 'Treply1', '前半场',
      '后半场', 'DS-TWR 结果',
    ], rows: [
      ['anchor-1', '2 ms − Tprop', '9.51 m', '−20.49 m', '3.51 m'],
      ['anchor-2', '4 ms − Tprop', '15.47 m', '−14.48 m', '3.49 m'],
      ['anchor-3', '6 ms − Tprop', '21.49 m', '−8.43 m', '3.54 m'],
      ['anchor-4', '8 ms − Tprop', '27.42 m', '−2.55 m', '3.45 m'],
    ] },
    { text: '把第一行的两个半场取平均，得到 −5.49 m——也不是答案。' },
    { kind: 'table', heading: '十个时隙分别由哪些帧占用', head: [
      '帧', '数量', '字节', '单帧空口时间',
    ], rows: [
      ['Poll', '1', '39', '206.86 µs'],
      ['Response', '4', '14', '181.22 µs'],
      ['Final', '1', '62', '236.60 µs'],
      ['Report', '4', '24', '191.47 µs'],
      ['整轮合计', '10', '253', '1 934.23 µs'],
    ] },
    { heading: 'Response 变短了', text: '这里的 Response 是 14 个字节，不是 20 个：它的回复时延（reply time）现在改由 Report 携带。' },
    { text: '在 20 000 µs 的轮里辐射 1 934.23 µs，占 9.67 %，上一课那个单边轮是 9.56 %。信道占用率几乎不变，翻倍的是时延与唤醒次数。' },
    { kind: 'table', heading: '时间戳噪声留下的', head: [
      '锚点', '作答时隙',
      '测距噪声 1σ', '本次运行的误差',
    ], rows: [
      ['anchor-1', 'slot 1', '1.9 cm', '+1.4 cm'],
      ['anchor-2', 'slot 2', '1.8 cm', '−0.9 cm'],
      ['anchor-3', 'slot 3', '1.8 cm', '+3.7 cm'],
      ['anchor-4', 'slot 4', '1.9 cm', '−5.2 cm'],
    ] },
    { text: '每个结果包含三个带噪声的接收时间戳，而这一列不再随时隙线性增长：锚点 4 的等待时长是四倍，得到的数值却相同。' },
    { kind: 'steps', heading: '一次测距的步骤', items: [
      '时隙 0。手机用自己的计数器为 Poll 的发出打时间戳；每个锚点也各自用自己的计数器为同一帧的到达打时间戳。',
      '锚点在自己的时隙里为 Response 的发出打时间戳。此时它已得到 Treply1（自己的等待：从 Poll 到达到 Response 发出），但并不发送——这一帧不携带任何时间值。',
      '手机为这帧 Response 的到达打时间戳，再将自己的那一对计数值相减：Tround1（它的往返：从 Poll 发出到这帧 Response 到达）。',
      '手机为 Final 的发出打时间戳，把它对每个作答过的锚点测得的往返时间，连同 Treply2（自己的等待：从 Response 到达到 Final 发出），一起写入这一帧的测距测量信息（ranging measurement information, RMI）——这两段只有手机能测得。',
      '每个锚点为 Final 的到达打时间戳，再相减得到 Tround2（自己的往返：从 Response 发出到 Final 到达）。此时四段时间已齐全，它立即算出距离。',
      '接着每个锚点发送一帧 Report，把自己测得的两段时间发回。手机也集齐了四段，用同样的四个值代入同一个公式：两条泳道的结果连最后一位都相同。',
      '这个公式把两次往返相乘、两段等待相乘，两个乘积相减，最后除以四段时间之和。每个乘积都包含两端各测的一段，所以这次除法同时消去了两个晶振的偏差。无需估计任何量，时钟偏差（clock offset）根本没有被读取。',
    ] },
    { kind: 'table', heading: '锚点 1 的逐步计算', head: [
      '步骤', '数值',
    ], rows: [
      ['手机发出 Poll', '336 207 494 703'],
      ['它到达锚点 1', '26 381 597 885'],
      ['它发出 Response', '26 509 391 059'],
      ['它到达手机', '336 335 291 933'],
      ['手机发出 Final', '336 846 477 093'],
      ['它到达锚点 1', '27 020 567 485'],
      ['= Treply1（锚点的等待）', '127 793 174'],
      ['= Tround2（锚点的往返）', '511 176 426'],
      ['= Tround1（手机的往返）', '127 797 230'],
      ['= Treply2（手机的等待）', '511 185 160'],
      ['答案，两条泳道相同', '749.0 · 3.51 m'],
    ] },
  ],
  deeper: [
    { heading: '锚点 1 的四个计数值', text: '锚点 1 打出 26 381 597 885、26 509 391 059 与 27 020 567 485，于是 Treply1 = 127 793 174，Tround2 = 511 176 426 RCTU。手机对它的那一对是 Tround1 = 127 797 230 与 Treply2 = 511 185 160。把两对分别相减：+4056 与 −8734 RCTU，即 +63 ns 与 −137 ns——而两者本都应当是 11.675 ns 飞行时间的两倍。四者相加约为 1 277 952 000 RCTU：即整场交互的时长被计了两遍。' },
    { heading: '同一个数，计算了两遍', text: '两台设备各自集齐了四个时间值，因此都能代入公式计算一遍。锚点在 Final 到达时就完成了计算，时刻是 10 236 615 ns；手机要等该锚点的报告——锚点 1 是 12 191 486 ns，晚了将近两毫秒。两条泳道上的距离完全相同，连最后一位都一样：同样四个计数值，代进同一个算式。报告帧的用途正在于此——锚点早就知道这个距离，而需要定位的是手机。本轮结束时，四个距离解算出 (5.01, 3.98) m 的定位，真值 (5.00, 4.00)：偏差 2 cm，这个对称圆环的几何精度因子（geometric dilution of precision, GDOP）为 1.00——锚点布局把测距误差放大多少倍，后面有专门一课讲它。' },
    { heading: '增长最快的那一帧', text: '按本课的字段宽度，Final 是全轮最大的帧，也是随锚点数增长最快的：14 + 12N 字节，而 Poll 是 27 + 3N——此处 62 字节、496 位、两个 Reed–Solomon 码块。Response 与 Report 则完全不随锚点数增长。多一个锚点，Final 会多 12 字节，整轮会多两个时隙、即 4 ms。' },
    { heading: '遮挡的时延不会被抵消', text: '被遮挡的首径会使三个接收时间戳同时推迟。于是两次往返都变大、两段等待都变小，幅度相同；分母保持不变，而这段额外的时延会全部计入距离——既不减半，也不会被抵消。按本课的取值，一堵砖墙会给每一个距离加上 60 cm。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '这个公式在真实设备上最敏感的两项误差，在本课中都为零。一是两端收发链路的组延迟与天线延迟：它们必须逐台标定，标定残差不会在相乘中抵消，而会全部计入距离。二是两段等待的抖动：本课的设备恰好在时隙边界那一纳秒发射，所以 Treply 与 Tround 精确到只带接收时间戳的那一点噪声。于是本课「四个锚点一样准」比真实部署干净得多。' },
    { kind: 'model-value', text: '那张帧长表的每一行都是本课自己的取值：Final 的 RMI 为 3 + 6N 字节、单个回复时延 6 字节、Report 的 RMI 13 字节。标准给出的是字段清单，而不是字段宽度。所以「多一个锚点 Final 多 12 字节」「一帧 Final 最多列九个锚点」都随这些取值而定，换一种编码这两个结论就都要重算。' },
    { kind: 'unmodelled', text: '墙只使首径延迟，不使其波形畸变。本课按穿过的每种材料取一个固定的附加时延（砖 2.0 ns），与墙的厚度、入射角都无关；是否被墙遮挡也只在水平面上判断，所以墙没有高度。「再深一层」里那句「一堵砖墙会给每一个距离加上 60 cm」因此是一个定数，而真实的遮挡既推迟首径又使其幅度降低、波形展宽，使「延迟多少」本身成为一个随机分布。' },
    { kind: 'out-of-scope', text: '多发这条消息还意味着多一次丢帧的可能——Final 丢失，这一轮所有锚点的距离都会作废——但在本课的场景中这一风险从不出现。本课里 UWB 链路的电平只由几何与墙决定，不含衰落——这是一项范围决定，Wi-Fi 那几课的两层衰落（阴影与小尺度）不用在这里——而这个房间里也没有外来干扰、没有其他设备争用空口。所以本课测得的代价只有时隙与唤醒次数，不包括可靠性。' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.1.2.4 与图 10-199 给出三消息双边测距的计算式、它用到的四个时间，以及“两个应答时延不必相等”这句话；§10.32.5 把这次交互放进一对多的测距轮中：一帧 Final 同时完成与所有锚点的交互。±20 ppm 的晶振容差来自 §16.4.9。',
    '2 ms 的测距时隙来自 FiRa，不是标准正文。另有三个数字是仿真器自己的模型取值：每个接收时间戳上 100 ps 的 1σ 噪声、帧长表所依据的测距信息宽度（Final 的 RMI 为 3 + 6N 字节，单个应答时延字段为 6 字节，报告的 RMI 为 13 字节），以及 40 位的测距计数器——标准只要求至少 32 位。',
  ],
  scenario: () => uwbDstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: '最差晶振，±20 ppm', scenario: () => uwbDstwrScenario({ tag: 20, anchors: -20 }) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('Final 帧：一帧发给四个锚点', firstUwbFinal),
    J('锚点算出距离', firstAnchorRange),
    J('第一份测量报告', firstUwbReport),
    J('本轮结束时的定位', firstUwbPosition),
  ],
  observe: [
    '整轮那一行写着 "10 slots × 2000.0 µs"，到 20 000 000 ns 结束——同样的锚点，却是上一课那一轮的两倍长。',
    'Final 单独位于这一轮的正中间，10 ms 处：一帧发给所有锚点，排在最后一条 Response 之后、第一份报告之前。',
    '四条锚点泳道上的测距都出现在 10 236 615 ns，即 Final 到达之时；手机自己那四条则在 12、14、16、18 ms 出现。每一对读数完全相同。',
  ],
  tryThis: [
    '载入“最差晶振，±20 ppm”：两端偏差翻倍，其他设置不变。两个半场的误差随即急剧增大——第一个锚点读到 15.51 m 与 −44.47 m，原先是 9.51 与 −20.49——而四个结果的变化不到 3 mm。',
    '在帧检视器里打开 Final：一个 RMI 列出四个锚点，其后每个锚点各有一个短字段，承载手机测得的第二段时间。再打开一份报告：一个 RMI，承载锚点自己测得的两段时间。',
  ],
  quiz: [
    {
      q: '锚点 4 作答前等待四个时隙，锚点 1 只等待一个，为什么两者一样准确？',
      options: [
        '公式按等待时长加权，等待越久的那次权重越小',
        '分子里每个乘积都各带两端时钟的一个因子，与等待多久无关',
        '时隙足够短，速率误差在其上造成的影响已小于噪声',
      ],
      answer: 1,
      explain: '对称并非必要条件：分母是整场交互，不是某一段等待；剩下的只有被百万分之几缩放的飞行时间。',
    },
    {
      q: '锚点 1 的两个半场是 9.51 m 与 −20.49 m，答案却是 3.51 m。这说明什么？',
      options: [
        '有一次往返被破坏，公式把它丢掉了',
        '两个半场都不是距离：飞行时间都远小于“半段等待乘时钟误差”这一项，而且两者符号相反',
        '答案就是两个半场的平均',
      ],
      answer: 1,
      explain: '两者的平均是 −5.49 m。每个半场都是某一方向上未修正的估计；上一课靠测量修正的那项线性增长误差，这里改用相乘抵消。',
    },
    {
      q: '多发的这条消息付出了什么代价，又解决不了什么？',
      options: [
        '没有可测的代价：占比 9.67 % 对 9.56 %，噪声也一并没了',
        '十个时隙而不是五个，唤醒次数翻倍——噪声与被遮挡路径的影响都仍然存在',
        '四倍空口时间，因为 Final 与报告是最大的帧',
      ],
      answer: 1,
      explain: '占用率几乎没变：代价不在空口时间，而在时延与功耗。晶振那一项被降到皮秒量级，接收噪声却仍然存在。',
    },
  ],
}
