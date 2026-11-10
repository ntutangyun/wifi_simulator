/**
 * UWB Tier 1 · M14 两个时钟 · Two round trips cancel the clock.
 *
 * Standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① IEEE Std 802.15.4-2024's DS-TWR — the formula and its NOTE (§10.29.1.2.3), the three-message
 * form (§10.29.1.2.4) and the one-to-many procedure with its optional measurement reports
 * (§10.32.5, Figures 10-236 and 10-238); ② what this simulator does with each point — including
 * that its Response carries no RRTI and its report carries both of the responder's times, where
 * Figure 10-238 splits them; ③ four runs.
 *
 * Same scene as uwb-sstwr, measured the other way: the same four anchors on a 3.50 m ring, the
 * same ±10 ppm crystals, DS instead of SS.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-dstwr.test.ts. `npx tsx scripts/lesson-dump.ts uwb-dstwr` prints it.
 */
import type { Scenario } from '../../model/scenario'
import type { SequenceSpec } from '../diagram'
import { J, anchor, firstUwbFinal, firstUwbPoll, firstUwbPosition, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
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
  anchorRange: '10.243 ms', tagRange: '12.192 ms', reportRest: '14–18 ms', report1: '12 ms',
  /** The distance both lanes print for anchor 1, to two decimals. */
  rangeM: '3.51 m',
} as const

/**
 * The whole round as an exchange: one Poll to four anchors, four answers in four
 * slots, one Final that settles all four, four reports back. The two
 * self-messages: the anchor holds all four times the moment the Final lands and
 * computes there, the phone has to wait for the report and computes the same number.
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
  why: '双边双向测距（double-sided two-way ranging, DS-TWR）是 IEEE 802.15.4-2024 的第二种双向测距（§10.29.1.2.3）：设备 A 发起第一次往返，设备 B 应答之后再发起第二次往返，由 A 应答。于是共有四段时间，两端各测两段：两次往返 Tround1、Tround2 与两段回复时延（reply time）Treply1、Treply2。标准给出的公式把两次往返相乘、两段回复时延相乘，两个乘积相减，再除以四段时间之和；它的注释说明，这个公式不要求两段回复时延相等：晶振（crystal）的频率偏差以百万分之几（parts per million, ppm）计，即使达到 20 ppm、两段回复时延不对称，时钟引起的误差通常也只有几皮秒。时钟误差是被抵消的，而不是被测出后修正的，时钟偏差（clock offset）一次也没有用到。四条消息可以减为三条：B 的应答同时作为第二次往返的开始（§10.29.1.2.4）。一对多时（§10.32.5），发起方广播启动消息，各响应方依次应答，发起方再广播一帧 Final，用测距测量信息（ranging measurement information, RMI）信息单元带各响应方的往返时间、用 RRTI 信息单元带各自的回复时延；每个响应方收到 Final 即可算出距离。发起方要得到距离，须在启动消息里请求，响应方才在测量报告阶段把自己的两段时间发回。本仿真器的场景请求了这份报告，所以手机与锚点（anchor）都算出距离，两者完全相同；剩下的误差只来自接收时间戳的噪声，不随等待时长增长。代价是一轮的时隙数从五个变为十个，空口占用率却几乎不变。',
  outcomes: [
    '说出双边双向测距的四段时间各由哪一端测量，以及三条消息的形式',
    '解释为什么两段回复时延不必相等，时钟误差仍能抵消',
    '说出一对多时谁先算出距离、发起方怎样也得到距离，以及多发这些消息的代价',
  ],
  needs: ['uwb-sstwr'],
  terms: [
    { term: 'DS-TWR', plain: '双边双向测距：进行两次往返，使两端的时钟误差相互抵消（§10.29.1.2.3）' },
    { term: 'Final', plain: '发起方的第三条消息，标准称为测距结束消息（ranging final message），完成第二次往返' },
    { term: 'Report', plain: '本课里锚点在测量报告阶段发回的帧，带它自己测得的两段时间；标准里只有发起方请求时才发送' },
    { term: 'RMI', plain: '测距测量信息信息单元：把回复时延、往返时间等测量发给一个或多个设备（§10.29.8.4）' },
  ],
  standard: [
    { heading: '两次往返，四段时间（§10.29.1.2.3，图 10-198）', text: '设备 A 发起第一次往返，设备 B 应答；之后 B 发起第二次往返，A 应答。A 测得 Tround1 与 Treply2，B 测得 Treply1 与 Tround2，每段都由本机计数器上的两个读数相减得到。' },
    { kind: 'formula', heading: '双边双向测距的公式（§10.29.1.2.3）', text: 'T̂prop = (Tround1·Tround2 − Treply1·Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)', note: '标准的注释：这个公式不要求两段回复时延相等；即使晶振偏差达到 20 ppm、两段回复时延不对称，时钟引起的误差通常也在几皮秒以内。分子里的每个乘积都含两端各测的一段，所以两端的速率因子在相除时消去。' },
    { heading: '三条消息（§10.29.1.2.4，图 10-199）', text: '把第一次往返的应答同时作为第二次往返的发起，四条消息就减为三条：启动消息、应答、结束消息（Final）。' },
    { heading: '一对多：一帧 Final 完成与所有响应方的交互（§10.32.5，图 10-236）', text: '发起方广播测距启动消息，其中 RRMC 信息单元的 Ranging Control Information 为 2，并选出参与的响应方。每个响应方依次应答，应答带 RRMC 信息单元（Ranging Control Information 为 3），请求第一次往返时间与 Final 的回复时延。发起方最后广播 Final：一个测距测量信息（ranging measurement information, RMI）信息单元报告各响应方的往返时间，一个 RRTI 信息单元报告各自的回复时延。每个响应方收到 Final 就有了算出飞行时间所需的全部数据；标准也说明，双边双向测距通常由响应方计算（§10.29.8.3）。' },
    { heading: '发起方要结果，须在启动消息里请求（§10.32.5，图 10-238）', text: '启动消息的 RRMC 信息单元里 Reply Time Request、Round-trip Time Request 与 TOF Request 都为 0 时，响应方不把任何测量发回。发起方请求第一段回复时延与第二次往返时间时，响应方在应答里插入 RRTI 信息单元，带第一段回复时延；在测量报告阶段再单独发一帧数据帧（data frame），用 RMI 信息单元带第二次往返时间。发起方据此也能算出飞行时间。' },
    { heading: '字段宽度（§10.29.8.1，§10.29.8.4）', text: 'RMI 信息单元的内容首部 2 字节，每个列表项里一个时间 4 字节；广播帧里每个列表项必须带地址，单播帧里只有一个不带地址的列表项。RRTI 信息单元的内容首部 1 字节，每个回复时延 4 字节；在预先约定次序的调度式测距里，地址可以省略。地址是 2 字节的短地址或 8 字节的扩展地址。' },
    { kind: 'steps', heading: '一对多双边双向测距，按标准：逐步说明（§10.32.5）', items: [
      '测距控制阶段与测距启动阶段：发起方广播启动消息，带 RRMC 信息单元（控制值 2）；控制器与发起方是同一台设备时两者可以合为一帧（§10.32.2）。',
      '测距应答阶段：每个响应方在自己的时隙里应答，带 RRMC 信息单元（控制值 3）。它为启动消息的到达与应答的发出打时间戳，得到 Treply1；发起方为应答的到达打时间戳，得到 Tround1。',
      '测距结束阶段：发起方广播 Final，带 RMI（各响应方的 Tround1）与 RRTI（Final 相对于各响应方应答的回复时延 Treply2）。',
      '每个响应方为 Final 的到达打时间戳，得到 Tround2；此时四段时间齐全，它算出飞行时间。',
      '测量报告阶段（只在发起方请求时）：响应方把发起方缺少的两段时间发回，发起方也算出飞行时间。',
    ] },
  ],
  implementation: [
    { topic: '一轮的帧', standard: '启动消息、各响应方的应答、Final，可选的测量报告（§10.32.5）', sim: '手机的 Poll（测距控制消息与启动消息合为一帧，带 ARC、RR、RDM、RRMC）、四个锚点各一帧 Response（带 RRMC）、一帧 Final（带 RMI 与 RRTI）、四个锚点各一帧 Report（带 RMI）。', kind: 'faithful' },
    { topic: 'Final 的内容', standard: 'RMI 带往返时间，RRTI 带回复时延（§10.32.5）', sim: '照此：A 个锚点时 Final 为 18 + 12A 字节，本课 66 字节。', kind: 'faithful' },
    { topic: '回报给发起方的两段时间', standard: '图 10-238：Treply1 由应答里的 RRTI 带回，Tround2 由测量报告里的 RMI 带回', sim: 'Response 不带 RRTI（14 字节）；两段时间都放在 Report 的一个 RMI 信息单元里（单播，一个列表项含回复时延与往返时间，23 字节）。用的都是标准的信息单元，交给手机的也是同样两段时间，但分配方式与图 10-238 不同。', kind: 'differs' },
    { topic: '哪一端计算', standard: '响应方收到 Final 时计算；发起方在收到请求的报告后计算（§10.32.5，§10.29.8.3）', sim: '照此：锚点在 Final 到达时算出距离，手机在每份 Report 到达时用同样四段时间再算一次。', kind: 'faithful' },
    { topic: '计算公式', standard: '§10.29.1.2.3 的公式', sim: '照此计算，没有读取时钟偏差。', kind: 'faithful' },
    { topic: '地址', standard: '短地址或扩展地址；RRTI 在约定次序时可省地址（§10.29.8.1，§10.29.8.4）', sim: '一律用 2 字节的短地址，RRTI 列表项也带地址。换成扩展地址或省去 RRTI 的地址，Final 的长度要重算。', kind: 'value' },
    { topic: '时隙安排', standard: '各阶段可以占多个时隙，具体安排由控制器决定（§10.32.2）', sim: '每帧占一个 2 ms 的时隙：A 个锚点一轮 2A + 2 个时隙，本课十个。', kind: 'choice' },
    { topic: '接收时间戳', standard: '不规定精度', sim: '每个接收时间戳加标准差 100 ps 的高斯噪声，发送时间戳没有噪声；每个结果用到三个接收时间戳。', kind: 'value' },
    { topic: '应答的发送时刻', standard: '标准未规定收发转换时间以外的抖动', sim: '每帧恰好在时隙边界发出，没有收发转换、中断与调度的抖动。真实设备上未被抵消的抖动会全部计入距离。', kind: 'choice' },
    { topic: '收发电路时延', standard: 'phyTxRmarkerOffset 与 phyRxRmarkerOffset 两个属性用于扣除计数器与天线（antenna）之间的传播时间（§10.29.1）', sim: '未实现：没有需要逐台标定的收发电路时延，而标定之后剩下的误差在双边公式里不会被抵消。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '两个半场与答案',
      jump: 1,
      steps: [
        '载入本课场景，跳到 Final 帧：它在这一轮的正中间发出，一帧同时发给四个锚点。',
        '对每个锚点，把它的四段时间分成两次往返，各按单边双向测距（single-sided two-way ranging, SS-TWR）不加修正地算一遍，再按双边公式算一遍。',
      ],
      blocks: [
        { kind: 'table', heading: '两个半场与答案', head: ['锚点', 'Treply1', '前半场', '后半场', 'DS-TWR 结果'], rows: [
          ['anchor-1', '2 ms − Tprop', '9.51 m', '−20.49 m', '3.51 m'],
          ['anchor-2', '4 ms − Tprop', '15.47 m', '−14.48 m', '3.49 m'],
          ['anchor-3', '6 ms − Tprop', '21.49 m', '−8.43 m', '3.54 m'],
          ['anchor-4', '8 ms − Tprop', '27.42 m', '−2.55 m', '3.45 m'],
        ] },
      ],
      expect: '前半场就是上一课那个未修正的估计，随时隙线性增长；后半场是它的镜像，是负值；第一行两个半场的平均是 −5.49 m，也不是答案。双边公式给出的四个结果都在 3.50 m 附近。',
      meaning: '这正是 ① 的注释：两段回复时延长短不等（锚点 1 等 2 ms，手机等 8 ms），时钟误差仍在相除时消去，不需要估计任何量。',
    },
    {
      heading: '十个时隙由哪些帧占用',
      jump: 0,
      steps: [
        '跳到 Poll 帧，依次查看这一轮的十帧：帧类型、字节数与空口时间（airtime）。',
        '把各帧的空口时间相加，与 20 ms 的轮长相比。',
      ],
      blocks: [
        { kind: 'table', heading: '十个时隙分别由哪些帧占用', head: ['帧', '数量', '字节', '单帧空口时间'], rows: [
          ['Poll', '1', '42', '217.88 µs'],
          ['Response', '4', '14', '183.01 µs'],
          ['Final', '1', '66', '242.50 µs'],
          ['Report', '4', '23', '192.24 µs'],
          ['整轮合计', '10', '256', '1 961.41 µs'],
        ] },
      ],
      expect: '整轮那一行写着 10 个时隙，到 20 ms 结束，是上一课单边一轮的两倍长；在 20 000 µs 里辐射 1 961.41 µs，占 9.81 %，上一课的单边一轮是 9.79 %。',
      meaning: '多出的 Final 与四份 Report 使时隙数与每台设备的唤醒次数翻倍，占用率几乎不变。每帧一个时隙是本仿真器的安排（②）；Report 是因为本课的场景请求了结果才发送的（①）。',
    },
    {
      heading: '两条泳道算出同一个数',
      jump: 2,
      steps: [
        '跳到「锚点算出距离」：四条锚点泳道的测距行同时出现。',
        '再看手机自己的四条测距行出现在什么时刻，把每一对读数对照。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '三条消息，外加测量报告', spec: uwbDstwrSequence(),
          caption: '一轮中实际发生的过程（日志里写作 tag-1 与 anchor-1…anchor-4）：手机用一帧 Poll 发起，四个锚点各在自己的时隙里应答，手机再用一帧 Final 完成与四个锚点的交互，最后每个锚点各发回一份 Report。锚点在 Final 到达时集齐四段时间，立即算出距离；手机要等报告，算出的是同一个数。',
        },
        { kind: 'table', heading: '锚点 1 的逐步计算', head: ['步骤', '数值'], rows: [
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
      expect: '四条锚点泳道的测距行都出现在 10.243 ms，即 Final 到达之时；手机的四条在 12.192 ms 起每 2 ms 一条，跟在每份报告之后。每一对读数完全相同。本轮结束时四个距离解出 (5.01, 3.98) m 的位置，真值 (5.00, 4.00) m；这个对称圆环的几何精度因子（geometric dilution of precision, GDOP）为 1.00，后面有专门一课讲它。',
      meaning: '锚点先算出距离是标准的安排（①）；手机能算出同一个数，是因为本课的场景请求了报告（①），报告里两段时间的放法见 ②。',
    },
    {
      heading: '时间戳噪声留下的误差',
      jump: 3,
      more: [0],
      steps: [
        '在本课场景里读四个距离与 3.50 m 之差。',
        '载入「最差晶振，±20 ppm」：两端偏差加倍，其他设置不变。再读两个半场与四个结果。',
      ],
      blocks: [
        { kind: 'table', heading: '时间戳噪声留下的', head: ['锚点', '应答时隙', '测距噪声 1σ', '本次运行的误差'], rows: [
          ['anchor-1', 'slot 1', '1.9 cm', '+1.4 cm'],
          ['anchor-2', 'slot 2', '1.8 cm', '−0.9 cm'],
          ['anchor-3', 'slot 3', '1.8 cm', '+3.7 cm'],
          ['anchor-4', 'slot 4', '1.9 cm', '−5.2 cm'],
        ] },
      ],
      expect: '1σ 一列不再随时隙增长：锚点 4 的等待是锚点 1 的四倍，得到的数值相同。换成 ±20 ppm 后，第一个锚点的两个半场变为 15.51 m 与 −44.47 m，四个结果的变化都不到 3 mm。',
      meaning: '晶振那一项被抵消到皮秒量级（①）；剩下的是本仿真器加在三个接收时间戳上的 100 ps 噪声（②），它与等待时长无关。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.2.3 与图 10-198（双边双向测距的公式与注释）、§10.29.1.2.4 与图 10-199（三条消息）、§10.32.5 与图 10-236、10-238（一对多双边双向测距，测量报告只在发起方请求时发送）、§10.32.2（各阶段）、§10.29.8.1（RRTI 信息单元）、§10.29.8.3（RRMC 信息单元，双边测距通常由响应方计算）、§10.29.8.4（RMI 信息单元）、§10.29.1（天线时延属性）。',
    '本仿真器的取值与取法：每个接收时间戳 100 ps 的噪声、16 位短地址且 RRTI 也带地址、每帧一个 2 ms 的时隙、在时隙边界准时发射、没有天线时延、Response 不带 RRTI 而由 Report 带回两段时间。2 ms 时隙通常认为来自 FiRa 的缺省配置，FiRa 规范不在核查用的语料里。',
  ],
  limits: [],
  scenario: () => uwbDstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: '最差晶振，±20 ppm', scenario: () => uwbDstwrScenario({ tag: 20, anchors: -20 }) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('Final 帧：一帧发给四个锚点', firstUwbFinal),
    J('锚点算出距离', firstAnchorRange),
    J('本轮结束时的定位', firstUwbPosition),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '锚点 4 应答前等待四个时隙，锚点 1 只等待一个，为什么两者一样准确？',
      options: [
        '公式按等待时长加权，等待越久的那次权重越小',
        '分子里每个乘积都各带两端时钟的一个因子，与等待多久无关',
        '时隙足够短，速率误差在其上造成的影响已小于噪声',
      ],
      answer: 1,
      explain: '§10.29.1.2.3 的注释：公式不要求两段回复时延相等。剩下的只有接收时间戳的噪声。',
    },
    {
      q: '锚点 1 的两个半场是 9.51 m 与 −20.49 m，答案却是 3.51 m。这说明什么？',
      options: [
        '有一次往返被破坏，公式把它丢掉了',
        '两个半场都不是距离：每个都是某一方向上未修正的单边估计，误差项远大于飞行时间，而且符号相反',
        '答案就是两个半场的平均',
      ],
      answer: 1,
      explain: '两者的平均是 −5.49 m。双边公式把两次往返相乘、两段回复时延相乘，而不是取平均。',
    },
    {
      q: '按标准，一对多双边双向测距里发起方怎样得到距离？',
      options: [
        '收到 Final 就能算出',
        '在启动消息的 RRMC 信息单元里请求，响应方在测量报告阶段把它测得的时间发回',
        '标准规定发起方永远得不到距离',
      ],
      answer: 1,
      explain: '§10.32.5：请求字段都为 0 时响应方不发回任何测量（图 10-236）；请求了才有测量报告（图 10-238）。',
    },
  ],
}
