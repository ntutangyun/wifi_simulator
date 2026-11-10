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
 * As the first lesson of its track this one opens the whole UWB idea, so it runs
 * longer than most; the sitting guideline (`SITTING_MINUTES` in curriculum.ts) marks a
 * lesson past it as long rather than refusing it
 * (`npx tsx scripts/lesson-dump.ts uwb-intro` prints the estimate). Depth that
 * will not fit belongs in `deeper`, provenance in `sources`.
 *
 * The 2026-09-23 amendment ("mechanism before metaphor") put the ranging
 * procedure itself on the main path: `numbers` carries SS-TWR as the six steps
 * src/uwb/device.ts takes, in its order, and the four-counter table below runs
 * them on this scene value by value.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 · M13). It **stays whole** — it is the track's opener and a reader may
 * arrive knowing only Wi-Fi Tier 1 — and it sheds padding instead:
 *  - §4 gives it a `timing` figure, 两个时钟上的四个计数读数, and the figure
 *    replaces prose: the paragraph that announced the four UWB_TS records and
 *    their order is gone, because the figure shows which two stamps each device
 *    owns and its caption carries the unit (RCTU) that paragraph introduced.
 *  - §5.1 · 8 deletes the crystal-offset depth (「一次无事可修的修正」,
 *    「换成真实的晶振要付多少代价」): both pre-played the whole of `uwb-sstwr`,
 *    which owns the reply-time ramp, the ±20 ppm tolerance and the Coffs
 *    correction and pins all three in tests/course/uwb-sstwr.test.ts. §2 says
 *    "its whole `deeper` section"; §5.1 names the two paragraphs, and §5.1 is
 *    the one that says which, so the 40-bit counter (which explains this
 *    lesson's own table of twelve-digit readings) and the note about the Wi-Fi
 *    half's zero propagation delay stay.
 *  - what the correction is worth on this scene — 7 cm even at 0 ppm — is on the
 *    main path in one clause, with a forward pointer instead of a derivation.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import { J, anchor, firstUwbPoll, firstUwbRange, firstUwbResp, firstUwbRxTs, rangingLab, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** The lab: one anchor, one phone, exactly dM metres apart at the same height. */
export function uwbIntroScenario(dM: 5 | 20): Scenario {
  return uwbSc(rangingLab(), [
    anchor('anchor-1', 'Anchor 1', 1, 4, 2.2, 0),
    uwbTag('tag-1', 'Phone', 1 + dM, 4, 2.2, 0),
  ], { method: 'ss', nlos: false })
}

/**
 * The four instants of the round, in microseconds, as the timeline puts them:
 * the poll leaves at 0 and the answer at the top of the next 2 ms slot, and the
 * two arrivals are five metres of air later. Every value is read back out of the
 * run in tests/course/uwb-intro.test.ts, so the figure cannot drift from it.
 */
export const FIG = {
  pollTx: 0, pollTxEnd: 197.628,
  pollRx: 0.017, pollRxEnd: 197.645,
  respTx: 2000, respTxEnd: 2187.372,
  respRx: 2000.017, respRxEnd: 2187.389,
  windowUs: 2200,
} as const

/**
 * The round on two clocks: which two stamps belong to which device. The figure
 * is drawn to scale, so what it really shows is how little of the round is a
 * frame — the wait between the poll and the answer is five orders of magnitude
 * bigger than the flight the lesson is after, and that wait is what the two
 * subtractions below cancel.
 */
export function uwbIntroTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '手机 tag-1', spans: [
        { label: '发 Poll', fromUs: FIG.pollTx, toUs: FIG.pollTxEnd, tone: 'accent' },
        { label: '收应答', fromUs: FIG.respRx, toUs: FIG.respRxEnd, tone: 'accent' },
      ] },
      { label: '锚点 anchor-1', spans: [
        { label: '收 Poll', fromUs: FIG.pollRx, toUs: FIG.pollRxEnd },
        { label: '发应答', fromUs: FIG.respTx, toUs: FIG.respTxEnd },
      ] },
    ],
    axis: { fromUs: 0, toUs: FIG.windowUs, ticks: [0, 1000, 2000], unit: 'µs' },
  }
}

export const uwbIntro: Lesson = {
  id: 'uwb-intro',
  module: 14,
  title: '一种测量到达时间的无线电技术',
  why: '手机早就能估计自己与路由器之间的距离，依据是接收信号的电平。问题在于这只是估计：一堵墙、一只挡住天线（antenna）的手，造成的衰减比十米空气传播还大。超宽带（ultra-wideband, UWB）改为测量信号的到达时刻：它发送极短的脉冲，边沿越陡，到达时刻测得越准，而光速是一个可靠的换算常数。一轮测距只需要一个锚点（anchor，即固定在墙上的 UWB 设备）、一部手机和四个时间戳：手机记录自己发出 Poll 和收到应答的时刻，两者相减得到往返时间；锚点记录自己收到 Poll 和发出应答的时刻，两者相减得到作答时间，并把它写入应答帧——这是本课的场景采用的传递方式，标准还允许另发一帧补报或双方事先约定，后面有专门一课。往返时间减去作答时间再除以二，就是单程飞行时间。两个时钟从未对齐也没有关系：每台设备只对自己的两次读数相减，未知的起点因此被消去。算出的距离会落在真值两侧几厘米的范围内，因为接收时间戳带有噪声，读数又只能按计数器的最小单位取整——这是设备的正常表现，不是故障。',
  outcomes: [
    '从事件日志里读出一轮测距的四个时间戳',
    '说明为什么手机测量的是往返时间，锚点测量的是作答时间',
    '解释为什么几厘米的误差并不是程序故障',
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'UWB', plain: '超宽带：用极短的脉冲占据极宽的频段，因此脉冲的到达时刻可以精确确定' },
    { term: 'anchor', plain: '固定在建筑物上的 UWB 设备，是手机测距时的参照点' },
    { term: 'RMARKER', plain: '标准规定的时间戳参考点：帧开头那段同步图案的结束标记之后，第一个码片的脉冲峰值抵达天线的时刻' },
    { term: 'RCTU', plain: '测距计数器的最小计时单位；一微秒包含数万个' },
  ],
  picture: [
    // "Loud is not the same as near" stood here until the step-1 fix wave: it said again,
    // at length, what `why` opens with — that a distance built on loudness inherits every
    // obstacle in the room — and a track's first lesson is held to 1000 words.
    { heading: '发送短脉冲，而不是持续的单频信号', text: '大多数无线电系统发送的信号会在同一频率上保持很长一段时间；接收端只能大致判断这段信号从哪一时刻开始。超宽带改为发送码片（chip）——时长极短的脉冲。边沿越陡，到达时刻的估计越准确，可以精确到零点几纳秒。' },
    { kind: 'watch', jump: 0, heading: '一帧 Poll，一帧应答', text: '把仿真载入，按下播放。被定位的那一端叫标签（tag），这里就是那部手机，日志里写作 tag-1；它发出一帧 Poll，开启一轮测距。作答的是墙上那台设备，也就是锚点，日志里写作 anchor-1。标签、锚点、Poll 都是业界的叫法：标准把发起测距的一端称为发起方（initiator），作答的一端称为响应方（responder）（§10.29.1.2.1），把 Poll 称为测距发起消息（ranging initiation message）（§10.32.2）。把时间线持续放大，直到看见两条泳道之间那道极窄的间隔：那就是信号在两者之间的传播时间。' },
    { text: '两端记录的都不是这一帧的开头或结尾，而是帧内同一个参考点——RMARKER（ranging marker），按标准的定义（§10.29.1.1），它是帧开头那段同步图案的结束标记之后、第一个码片的脉冲峰值抵达本机天线的时刻；下一课在帧里指出它的位置。' },
    {
      kind: 'diagram', heading: '两个时钟上的四个读数', spec: uwbIntroTiming(),
      caption: '按比例画：两段帧之间那 2 ms 的等待，比要测的飞行时间大五个数量级。手机将自己的两次读数（发送 Poll、接收应答）相减得到往返时间，锚点将自己的两次读数（接收 Poll、发送应答）相减得到作答时间。四条 UWB_TS 记录就是这四个时刻的计数器读数，单位是 RCTU（ranging counter time unit）。',
    },
    { heading: '两个互不同步的时钟', text: '手机和锚点各自用自己的晶振（crystal）计时，两个时钟从未对齐。但这没有影响：每台设备只对自己的两次读数相减，未知的起点因此被消去。' },
    { heading: '几厘米的误差是否正常', text: '两次接收的时间戳各带有少量噪声：一个脉冲被判定为“已经到达”的那一刻本身就不确定。发送端确知自己的发送时刻，那两个读数没有这项噪声；而所有读数都只能按计数器的最小单位取整。所以日志报出的距离会落在真值两侧几厘米的范围内——这是设备的正常表现，不是故障。' },
    { kind: 'watch', jump: 3, text: '跳到给出距离的那一行——这一行有三个数，下面的步骤说明它们是如何得到的。' },
  ],
  numbers: [
    { kind: 'formula', heading: '单边双向测距（SS-TWR）', text: 'T̂prop = (Tround − Treply) / 2', note: 'Tround 是手机在自己时钟上做的那次相减，Treply 是锚点在自己时钟上做的那次。' },
    { kind: 'steps', heading: '从四个计数值到距离', items: [
      '手机先给自己即将发出的那个 RMARKER 打上时间戳，然后发送 Poll。',
      '锚点在同一个 RMARKER 到达时给它打上时间戳。',
      '一个时隙之后，也就是 2 ms 后，锚点给自己应答帧的 RMARKER 打上时间戳，将自己的两次读数相减，再把得到的作答时间写入应答帧。2 ms 的时隙长度是本课取的值，标准没有规定；把作答时间写入应答帧是本课的场景采用的方式，即标准 §10.29.6.4 的嵌入方式。',
      '手机在应答到达时打上时间戳，同样将自己的两次读数相减，得到往返时间。',
      '往返时间减去作答时间再除以二，得到单程飞行时间，此时仍以计数器的格数为单位。',
      '格数 × 15.650 ps × 0.299792458 m/ns，即测距行上给出的米数。',
    ] },
    { kind: 'table', heading: '参与相减的四行', head: [
      '日志行', '计数值（RCTU）',
    ], rows: [
      ['tag-1 TX RMARKER → * poll', '336 207 494 656'],
      ['anchor-1 RX RMARKER ← tag-1 poll', '26 381 598 252'],
      ['anchor-1 TX RMARKER → tag-1 resp', '26 509 392 384'],
      ['tag-1 RX RMARKER ← anchor-1 resp', '336 335 290 928'],
    ] },
    { kind: 'formula', text: 'Tround = 336 335 290 928 − 336 207 494 656 = 127 796 272\nTreply = 26 509 392 384 − 26 381 598 252 = 127 794 132\nT̂prop = (127 796 272 − 127 794 132) / 2 = 1070 RCTU = 16.75 ns = 5.02 m', note: '两个几千亿量级的数字，差值只有 2140。真值是 1065.7 格：读数偏大 4.3 格，因为两次接收计数各带 100 ps 噪声，而计数只能取整。' },
    { kind: 'formula', heading: '测距行的格式', text: 'tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)', note: 'raw 就是上面那个 1070；写在前面的那个数，是同一次测量做了时钟偏差（clock offset）修正之后的结果（修正公式见标准 §10.29.1.2.2；报告修正值、并把 raw 值附在后面，是本课测距行的格式）。这里两个晶振都没有频率偏差，本来无需修正，但结果仍然改变了 7 cm——因为这项修正所依据的估计本身也带有噪声。这个估计从何而来、噪声有多大，本轨道后面有专门一课讲解。' },
    { kind: 'table', heading: '单位换算', head: [
      '量', '数值', '出处',
    ], rows: [
      ['499.2 MHz 的一个码片', '2.003 ns', 'Clause 16'],
      ['一个 RCTU = 2⁻⁷ 码片', '15.650 ps', '§10.29.1.4'],
      ['飞行一米', '3.3356 ns = 213.1 RCTU', 'c = 0.299792458 m/ns'],
      ['计时相差一格', '飞行 4.7 mm，测距 2.3 mm', '往返折半'],
    ] },
    { kind: 'table', heading: '飞行时间，以及它落在时间线的哪一格', head: [
      '相距', '飞行时间', '落在 1 ns 网格上',
    ], rows: [
      ['5 m', '16.678 ns', '17 ns'],
      ['20 m', '66.713 ns', '67 ns'],
    ] },
    { text: '时间线只显示整纳秒，飞行时间一律向上取整，所以没有一帧显得比物理允许的更早到达。计数器不取整：它以 15.650 ps 为一格，比时间线精细 64 倍。' },
  ],
  deeper: [
    { heading: '那些巨大的计数值从何而来', text: '本课的计数器取 40 位宽，标准只要求至少 32 位（§10.29.1.3）。每格 15.650 ps，2⁴⁰ 格就是 17.2 秒，之后回绕归零。本课里没有任何机制复位它，也不会把它对齐到任何基准，所以上面每一次相减都是模 2⁴⁰ 的；而你读到的那些几千亿量级的数值，只是会话开始时两台设备的计数器恰好所处的值。' },
    { heading: 'Wi-Fi 各课没有显示的时延', text: 'Wi-Fi 各课的时间线把传播时延当作零：接收端在发送的同一瞬间收到帧。在一套住宅的尺度上，传播时延不过几十纳秒，而时隙是 9 µs，忽略它对 MAC 没有影响。UWB 不能做这种简化，因为在这里时延不是误差项，它就是被测量的对象。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '本课的测距场景中只有一条到达路径：每个接收端只收到一条直射信号，到达时刻是发射起点加上 d / c，房间里没有任何回波。于是本课那句「一个脉冲被判定为已经到达的那一刻本身就不确定」在这里并不对应任何搜索过程——RMARKER 的到达时刻是按距离直接计算出来的，噪声是在此之后另行叠加的一个随机数。真实接收端要在一串先后到达的回波里判断哪一条是首径，而这正是室内测距最难的那一步。' },
    { kind: 'model-value', text: '那 100 ps 是模型取值，标准对时间戳精度没有规定，只要求设备用品质因数（figure of merit, FoM）报告每次读数的置信区间（§10.29.1.7）。它的分布形状也是模型设定的：每次抽样零均值、对称，只有 1σ 会随信干噪比按 1/√SNR 放大，最多十倍。真实的边沿估计误差是有偏的——首径淹没在噪声中时几乎总是偏晚——所以真实设备的距离误差不像本课那样对称地分布在真值两侧。' },
    { kind: 'unmodelled', text: '只有两次接收的计数带噪声，两次发送的是精确的，不加任何额外项。真实设备的发射时刻也有抖动，更要紧的是天线与收发链路的组延迟必须逐台标定，标定后的残余误差是产品级 UWB 最大的系统偏差之一。本课把这项误差取为零，所以这里的距离误差是纯随机的，从不含一个固定的偏置。' },
    { kind: 'out-of-scope', text: '本课把两端晶振的频率偏差都设为 0 ppm，真实设备做不到这一点。所以这里「几厘米的误差」完全来自时间戳噪声；换成真实的晶振，单边测距的误差会以米计，而且与锚点的等待时间成正比。', until: 'uwb-sstwr' },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 是已经发布的标准，不是草案。第 16 章的 HRP UWB PHY、§10.29.1 的测距计数器与 RMARKER、§16.2.1（表 16-1）的 SP1 分组配置都是标准正文；本课里每一个码片数和字段时长都由它们推导而来。',
    '有两个数字不属于标准：2 ms 的测距时隙和 200 ms 的测距块，来自 FiRa 的 UWB 配置文件。',
    '下面这些是仿真器自己的模型取值，列出来以便读者核查：−14 dBm 发射功率、−93 dBm 接收灵敏度、每个接收时间戳上 100 ps 的 1σ 噪声、时钟偏差估计中残留的 0.2 ppm 误差，以及墙体给遮挡路径额外增加的时延。',
    '40 位计数器是模型取值，标准正文只要求至少 32 位；§16.4.9 的 ±20 ppm 晶振容差，在讲时钟速率的那一课才会用到。',
  ],
  scenario: () => uwbIntroScenario(5),
  variants: [
    { label: '相距 20 m', scenario: () => uwbIntroScenario(20) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('锚点记下到达的 RMARKER', firstUwbRxTs),
    J('锚点作答', firstUwbResp),
    J('距离计算完成', firstUwbRange),
  ],
  observe: [
    '跳到 Poll 帧，把时间线放大到纳秒级：手机泳道上的 TX_START 在 0 ns，锚点泳道上的 RX_START 在 17 ns。五米的传播距离，这一次是按真实比例绘制的。',
    '按顺序读日志里的四条 UWB_TS：手机的 TX RMARKER、锚点的 RX RMARKER、锚点的 TX RMARKER、手机的 RX RMARKER。两条来自一个时钟，另两条来自另一个时钟。',
    '找到 2 187 389 ns 处的 UWB_RANGE：报出 4.95 m，真值 5.00 m，旁边是 raw 的 5.02 m——相差几厘米，而单次读数的噪声标准差就是 2.1 cm。',
  ],
  tryThis: [
    '载入 20 m 变体。到达间隔从 17 ns 变成 67 ns——距离变为四倍，飞行时间也变为四倍。测距行报出 19.95 m，真值 20.00 m：误差仍是几厘米，因为时间戳噪声与飞行距离无关。',
  ],
  quiz: [
    {
      q: 'UWB 为什么去测时间，而不是测信号强度？',
      options: [
        '因为时间更容易测量',
        '强度既取决于距离，也取决于墙和手；到达时间只取决于路径长度',
        'UWB 接收端读不到信号强度',
      ],
      answer: 1,
      explain: '一扇门、一只手造成的衰减，比几米空气传播还大；而到达时间只随路径长度变化。',
    },
    {
      q: '一个 RCTU 是多少，它对应多长的距离？',
      options: [
        '一个码片，2.003 ns，约 60 cm',
        '码片的 2⁻⁷，15.650 ps，约 4.7 mm 的飞行距离',
        '一纳秒，也就是时间线的网格，约 30 cm',
      ],
      answer: 1,
      explain: '计数器比 499.2 MHz 的码片速率再细 128 倍；一米对应 213.1 格。',
    },
    // A third question — "five metres is 16.678 ns, yet RX_START sits 17 ns after TX_START:
    // is the range 0.3 ns wrong?" — stood here until the step-1 fix wave. It asked about the
    // timeline's 1 ns grid rather than about ranging, and a track's first lesson is held to
    // 1000 words. The claim it tested is still in `numbers` ("Flight, and where it lands on
    // the timeline") and still pinned in tests/course/uwb-intro.test.ts.
  ],
}
