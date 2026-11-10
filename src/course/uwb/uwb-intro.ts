/**
 * UWB Tier 1 · M14 · Time of flight · A radio that measures time.
 *
 * The first lesson of the UWB track, in the standard-first shape (2026-11-10,
 * docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md): ① what IEEE Std
 * 802.15.4-2024 specifies for a single-sided two-way ranging exchange — the RMARKER, the
 * ranging counter and its unit, the initiator and the responder, the SS-TWR formula and the
 * three ways the reply time reaches the initiator; ② what this simulator does with each of
 * those, faithful or not; ③ three guided runs on the smallest scene in which a distance falls
 * out of four numbers.
 *
 * One anchor and one phone, five metres apart on a line, both crystals nailed to 0 ppm,
 * single-sided two-way ranging with the reply time embedded in the Response. The frame's own
 * anatomy is the next lesson, `uwb-frame`, which loads this same scene.
 *
 * Every figure printed below is read back out of the lesson text and compared with a run in
 * tests/course/uwb-intro.test.ts.
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
  pollTx: 0, pollTxEnd: 202.5,
  pollRx: 0.017, pollRxEnd: 202.517,
  respTx: 2000, respTxEnd: 2190.192,
  respRx: 2000.017, respRxEnd: 2190.209,
  windowUs: 2200,
} as const

/**
 * The round on two clocks: which two stamps belong to which device. Drawn to
 * scale, so what it really shows is how little of the round is a frame.
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
  why: '手机早就能估计自己与路由器之间的距离，依据是接收信号的电平。问题在于这只是估计：一堵墙、一只挡住天线（antenna）的手，造成的衰减比十米空气传播还大。超宽带（ultra-wideband, UWB）改为测量信号的到达时刻：它发送极短的脉冲，边沿越陡，到达时刻测得越准，而光速是一个可靠的换算常数。IEEE 802.15.4-2024 规定的最简单的测距方式是单边双向测距（single-sided two-way ranging, SS-TWR）：发起方记录自己发出一帧和收到应答的时刻，两者相减得到往返时间；应答方记录自己收到这一帧和发出应答的时刻，两者相减得到回复时间；往返时间减去回复时间再除以二，就是单程飞行时间。所有时刻都按同一个参考点 RMARKER（ranging marker）读取测距计数器。两个时钟从未对齐也没有关系：每台设备只对自己的两次读数相减，未知的起点因此被消去。回复时间怎样交给发起方，标准给了三种方式；本课的场景把它写进应答帧。算出的距离落在真值两侧几厘米的范围内，这几厘米来自本仿真器给接收时间戳加的噪声与计数取整，不是故障。',
  outcomes: [
    '说出标准对 SS-TWR 规定了什么：RMARKER、测距计数器、两次相减与回复时间的三种传递方式',
    '从事件日志里读出一轮测距的四个计数值，并亲手算出距离',
    '分清本课的哪些数是标准规定的，哪些是本仿真器的取值',
  ],
  needs: ['radio-primer', 'frame-anatomy'],
  terms: [
    { term: 'UWB', plain: '超宽带：用极短的脉冲占据极宽的频段，因此脉冲的到达时刻可以精确确定' },
    { term: 'anchor', plain: '固定在建筑物上的 UWB 设备，是手机测距时的参照点；这是业界的叫法，标准只区分发起方与应答方' },
    { term: 'RMARKER', plain: '标准规定的时间戳参考点：SFD 之后第一个码片的脉冲峰值位于本机天线的时刻' },
    { term: 'RCTU', plain: '测距计数器的计时单位：499.2 MHz 码片周期的 2⁻⁷，约 15.65 ps' },
  ],
  standard: [
    { heading: '时间报告以 RMARKER 为参考（§10.29.1.1）', text: '支持测距的设备必须实现测距计数器（ranging counter）与品质因数（figure of merit, FoM）。测距时，设备向上层报告每一帧的发送时刻与接收时刻，这些时刻都以 RMARKER 为参考：RMARKER 定义为帧起始定界符（start-of-frame delimiter, SFD）之后第一个符号（symbol）的开头位于本机天线的时刻；对 UWB 物理层（physical layer, PHY），就是 SFD 之后第一个码片（chip）的脉冲峰值所在的时刻。' },
    { heading: '测距计数器与它的单位（§10.29.1.3、§10.29.1.4、§10.29.1.7）', text: '测距计数值是一个无符号整数，至少 32 位。对 HRP UWB 物理层，计数单位是 499.2 MHz 码片周期的 2⁻⁷，约 15.65 ps，即 RCTU（ranging counter time unit）。设备为每一个计数值给出一个品质因数字节，说明 RMARKER 落在某个置信区间内的概率。' },
    { heading: '发起方与应答方（§10.29.1.2.1）', text: '发起方（initiator）是发出一次测距交换中第一帧的设备，应答方（responder）是回应这一帧的设备。标签（tag）、锚点（anchor）、Poll 都是业界的叫法，标准里没有这三个词。' },
    { kind: 'formula', heading: '单边双向测距（§10.29.1.2.2，图 10-197）', text: 'T̂prop = (Tround − Treply) / 2\nT̂prop = (Tround − Treply · (1 − Coffs)) / 2', note: 'Tround 是发起方在自己的时钟上测得的往返时间，Treply 是应答方在自己的时钟上测得的回复时间。两个时钟都有频率偏差，误差随回复时间增大；接收端能测出与对方的相对时钟偏差（clock offset）Coffs 时，可以用第二个式子修正 Treply。' },
    { heading: '回复时间的三种传递方式（§10.29.1.2.2）', text: '发起方要算出飞行时间，必须知道应答方的 Treply。应答方在发送之后才确定 Treply 时，另发一帧带测距测量信息（ranging measurement information, RMI）信息单元的消息补报（延后方式，§10.29.6.3）；应答方能在发送之前准确预知 Treply 时，把它写进应答帧的 RRTI 信息单元（嵌入方式，§10.29.6.4）；应答方能以足够准确的固定回复时间应答时，双方事先约定这个值，交换中不传递 Treply（固定方式，§10.29.6.5）。' },
    { kind: 'steps', heading: '一次嵌入方式的 SS-TWR，按标准：逐步说明', items: [
      '发起方发出测距发起消息（ranging initiation message），其中的 RRMC 信息单元请求应答方给出回复时间（§10.29.6.4）。',
      '发起方记录这一帧 RMARKER 离开天线时的计数值；应答方记录同一个 RMARKER 到达时的计数值（§10.29.1.1）。',
      '应答方发出应答帧，帧里的 RRTI 信息单元带回复时间 Treply，即应答帧 RMARKER 的发送计数值减去测距发起消息 RMARKER 的接收计数值（§10.29.6.4）。',
      '发起方记录应答帧 RMARKER 到达时的计数值，与自己的发送计数值相减得到 Tround。',
      '发起方的上层按 §10.29.1.2.2 的式子算出飞行时间。是否参加测距、怎样由飞行时间得出距离，都由媒体访问控制（medium access control, MAC）层以上各层负责（§10.29.6.1）。',
    ] },
  ],
  implementation: [
    { topic: 'RMARKER', standard: 'SFD 之后第一个码片的时刻（§10.29.1.1）', sim: '两端都在这一时刻读计数器：发送端读到的是精确值，接收端读到的是到达时刻加噪声。', kind: 'faithful' },
    { topic: '计数器的宽度', standard: '至少 32 位（§10.29.1.3）', sim: '40 位，约 17.2 s 回绕一次；每台设备的计数器从会话开始时的任意值起计，从不对齐。', kind: 'value' },
    { topic: '计数单位', standard: '码片周期的 2⁻⁷（§10.29.1.4）', sim: '15.650 ps。', kind: 'faithful' },
    { topic: '接收时间戳的精度', standard: '标准未规定，只要求每个计数值附一个品质因数（§10.29.1.7）', sim: '每个接收计数值加一个零均值、1σ 为 100 ps 的随机误差，信干噪比（signal-to-interference-plus-noise ratio, SINR）低时按 SINR 的平方根反比放大，最多十倍；然后按一格取整。发送计数值不加误差，天线与收发电路的时延也不计。', kind: 'value' },
    { topic: '到达时刻怎样得出', standard: '标准不规定接收端怎样估计首径（first path）', sim: '本课的场景里只有一条直射路径：到达时刻按发射时刻加 d / c 直接算出，接收端不在多条回波中搜索首径。', kind: 'choice' },
    { topic: '回复时间的传递', standard: '延后、嵌入、固定三种方式（§10.29.1.2.2）', sim: '本课的场景用嵌入方式：应答帧带 RRTI 信息单元，共 21 字节。另两种方式本仿真器也实现了，在讲回复时间的那一课里。', kind: 'faithful' },
    { topic: '应答方等多久', standard: '标准未规定回复时间', sim: '应答帧在下一个测距时隙（ranging slot）的开头发出；本课取的测距时隙是 2 ms，所以 Treply 约为 2 ms 减去飞行时间。', kind: 'value' },
    { topic: '时钟偏差修正', standard: '用 Coffs 修正 Treply（§10.29.1.2.2）', sim: '照式子修正；Coffs 的估计带一个随机残差，1σ 取百万分之几（parts per million, ppm）中的 0.2，即 0.2 ppm。本课两端晶振（crystal）都是 0 ppm，修正后的结果仍与未修正的相差 7 cm。', kind: 'value' },
    { topic: '距离怎样报告', standard: '由上层计算（§10.29.6.1）', sim: '发起方的测距行报修正后的距离，括号里附真值和未修正的 raw 值；真值只有仿真器知道。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一轮测距的四个计数值',
      jump: 0,
      steps: [
        '载入本课场景，跳到 Poll 帧从手机发出的时刻，把时间线放大到纳秒级。',
        '按顺序读日志里的四条 UWB_TS，对照下表。',
      ],
      blocks: [
        { kind: 'diagram', heading: '两个时钟上的四个读数', spec: uwbIntroTiming(), caption: '按比例画：两帧之间约 2 ms 的等待，比要测的飞行时间大五个数量级。手机读发送 Poll 与接收应答两个计数值，锚点读接收 Poll 与发送应答两个计数值。' },
        { kind: 'table', heading: '参与相减的四行', head: ['日志行', '计数值（RCTU）'], rows: [
          ['tag-1 TX RMARKER → * poll', '336 207 494 656'],
          ['anchor-1 RX RMARKER ← tag-1 poll', '26 381 598 252'],
          ['anchor-1 TX RMARKER → tag-1 resp', '26 509 392 384'],
          ['tag-1 RX RMARKER ← anchor-1 resp', '336 335 290 928'],
        ] },
      ],
      expect: '手机的 TX_START 在 0 ns，锚点的 RX_START 在 17 ns；四条 UWB_TS 依次来自手机、锚点、锚点、手机，两台设备的计数值相差几千亿，因为两个计数器从未对齐。',
      meaning: '每台设备只读自己的两次 RMARKER（①）；计数器的起点任意，是本仿真器的取法（②），而相减把它消去。',
    },
    {
      heading: '亲手算出距离',
      jump: 3,
      steps: [
        '把上一组的四个计数值分别相减，得到 Tround 与 Treply。',
        '按 ① 的第一个式子算出飞行时间，再换算成米，与跳到的测距行对照。',
      ],
      blocks: [
        { kind: 'formula', heading: '四个计数值，两次相减', text: 'Tround = 336 335 290 928 − 336 207 494 656 = 127 796 272\nTreply = 26 509 392 384 − 26 381 598 252 = 127 794 132\nT̂prop = (127 796 272 − 127 794 132) / 2 = 1070 RCTU = 16.75 ns = 5.02 m', note: '真值是 1065.7 格：读数偏大 4.3 格，来自两个接收计数值上的随机误差与取整。' },
        { kind: 'formula', heading: '测距行', text: 'tag-1 range → anchor-1 (SS): 4.95 m (true 5.00 m, raw 5.02 m)' },
        { kind: 'table', heading: '单位换算', head: ['量', '数值', '出处'], rows: [
          ['499.2 MHz 的一个码片', '2.003 ns', '第 16 章'],
          ['一个 RCTU = 2⁻⁷ 码片', '15.650 ps', '§10.29.1.4'],
          ['飞行一米', '3.3356 ns = 213.1 RCTU', 'c = 0.299792458 m/ns'],
          ['计时相差一格', '飞行 4.7 mm，测距 2.3 mm', '往返折半'],
        ] },
      ],
      expect: '算出 1070 RCTU，即测距行里的 raw 5.02 m；测距行报出的 4.95 m 是修正后的值，与 raw 相差 7 cm。',
      meaning: '1070 来自 ① 的第一个式子；4.95 m 来自第二个式子，两端晶振都没有偏差，修正仍然移动了结果，因为本仿真器给 Coffs 的估计加了 0.2 ppm 的残差（②）。',
    },
    {
      heading: '相距 20 m',
      variant: 0,
      more: [],
      steps: [
        '载入「相距 20 m」，跳到 Poll 帧，量出 TX_START 与 RX_START 之间的间隔。',
        '读这一轮的测距行，与 5 m 的那次对照。',
      ],
      blocks: [
        { kind: 'table', heading: '飞行时间，以及它落在时间线的哪一格', head: ['相距', '飞行时间', '落在 1 ns 网格上'], rows: [
          ['5 m', '16.678 ns', '17 ns'],
          ['20 m', '66.713 ns', '67 ns'],
        ] },
      ],
      expect: '到达间隔从 17 ns 变为 67 ns；测距行报出 19.95 m，真值 20.00 m，误差仍是几厘米。',
      meaning: '时间线以整纳秒计、飞行时间向上取整，而计数器以 15.650 ps 为一格（②）；误差没有随距离增大，因为它来自时间戳的随机误差，与飞行距离无关。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1（RMARKER）、§10.29.1.2.1（发起方与应答方）、§10.29.1.2.2 与图 10-197（SS-TWR 的两个式子、回复时间的三种传递方式）、§10.29.1.3（计数器至少 32 位）、§10.29.1.4（计数单位）、§10.29.1.7（品质因数）、§10.29.6.1（由上层计算距离）、§10.29.6.3 至 §10.29.6.5（延后、嵌入、固定三种方式）。',
    '本仿真器的取值与取法：40 位计数器、2 ms 的测距时隙与 200 ms 的测距块、−14 dBm 发射功率、−93 dBm 接收灵敏度、每个接收时间戳 1σ 为 100 ps 的随机误差、时钟偏差估计 0.2 ppm 的残差、只有一条直射路径。',
    '2 ms 的测距时隙与 200 ms 的测距块是否出自 FiRa 的配置，语料库里无法核实；标准没有规定这两个值。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
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
      explain: '§10.29.1.4 规定计数单位是 499.2 MHz 码片周期的 2⁻⁷；一米对应 213.1 格。',
    },
    {
      q: '本课的应答帧把回复时间写在帧里。按标准，这是唯一的方式吗？',
      options: [
        '是：标准要求应答帧必须带回复时间',
        '不是：还可以另发一帧补报，或者双方事先约定固定的回复时间',
        '不是：发起方可以自己估计应答方的回复时间',
      ],
      answer: 1,
      explain: '§10.29.1.2.2 给出三种方式：延后补报（§10.29.6.3）、嵌入应答帧（§10.29.6.4）、固定回复时间（§10.29.6.5）。',
    },
  ],
}
