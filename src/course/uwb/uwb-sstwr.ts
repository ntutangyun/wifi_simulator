/**
 * UWB Tier 1 · M14 两个时钟 · The clock inside the reply time.
 *
 * Standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① what IEEE Std 802.15.4-2024 says about SS-TWR — §10.29.1.2.2's two formulas, the clock
 * frequency offsets eA and eB, the optional crystal characterization that yields Coffs
 * (§10.29.1.6), the ±20 ppm tolerance (§16.4.6, §16.4.9) and the one-to-many procedure of
 * §10.32.4; ② what this simulator does with each of those, faithful or not — above all that its
 * Coffs is not measured but drawn as the true offset plus 0.2 ppm of Gaussian error; ③ four runs.
 *
 * The scene is unchanged: the phone runs 10 ppm fast, every anchor 10 ppm slow, and the four
 * anchors answer in four different slots, so one round shows the same 3.50 m measured four times
 * with four different errors.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-sstwr.test.ts. `npx tsx scripts/lesson-dump.ts uwb-sstwr` prints it.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import { J, anchor, firstUwbPoll, firstUwbRange, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The fourth range of the round: the anchor that answers in slot 4. */
const fourthUwbRange = (r: TLRecord): boolean => r.type === 'UWB_RANGE' && r.peer === 'anchor-4'

/**
 * Four anchors on a 3.50 m ring around a phone at the centre of a 10 × 8 m lab,
 * every device at the same 2.20 m height so all four true distances are exactly
 * 3.50 m. The only thing that differs between the four ranges is the slot the
 * anchor answers in — which is the whole point of the scene.
 */
export function uwbSstwrScenario(ppm: { tag: number; anchors: number }): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2, ppm.anchors),
    anchor('anchor-2', 'Anchor 2', 5, 7.5, 2.2, ppm.anchors),
    anchor('anchor-3', 'Anchor 3', 1.5, 4, 2.2, ppm.anchors),
    anchor('anchor-4', 'Anchor 4', 5, 0.5, 2.2, ppm.anchors),
    uwbTag('tag-1', 'Phone', 5, 4, 2.2, ppm.tag),
  ], { method: 'ss', nlos: false })
}

/**
 * The instants of the round in microseconds, as the timeline puts them: the Poll
 * leaves at 0, each anchor answers at the top of its own 2 ms slot, and every
 * arrival is 11.675 ns of air later. Every value is read back out of the run in
 * tests/course/uwb-sstwr.test.ts, so the figure cannot drift from it.
 */
export const FIG = {
  pollTx: 0, pollTxEnd: 217.885,
  /** Slot i starts at i × 2000 µs; the answer is 190.192 µs long and lands 12 ns later. */
  slotUs: 2000, respUs: 190.192, flightUs: 0.012,
  windowUs: 8400,
  /** The raw error of each anchor's range, as the first lab's table prints it. */
  rawErrM: ['+6.01 m', '+11.97 m', '+17.99 m', '+23.92 m'],
} as const

/**
 * Tround and Treply on two clocks, and the ramp. The grey bar of each anchor
 * lane IS its reply time — from the Poll's arrival to its own answer — and the
 * four bars grow one slot at a time: the geometry is identical on all four lanes
 * and only the waiting differs. Drawn to scale, so the flight (11.675 ns) is
 * invisible beside the wait, which is exactly why the error lands on the wait.
 */
export function uwbSstwrTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '手机 tag-1', spans: [
        { label: '发 Poll', fromUs: FIG.pollTx, toUs: FIG.pollTxEnd, tone: 'accent' },
        ...[1, 2, 3, 4].map((i) => ({
          fromUs: i * FIG.slotUs + FIG.flightUs,
          toUs: i * FIG.slotUs + FIG.flightUs + FIG.respUs,
          tone: 'accent' as const,
        })),
      ] },
      ...[1, 2, 3, 4].map((i) => ({
        label: `锚点 ${i}`,
        spans: [{ label: FIG.rawErrM[i - 1], fromUs: FIG.flightUs, toUs: i * FIG.slotUs }],
      })),
    ],
    axis: { fromUs: 0, toUs: FIG.windowUs, ticks: [0, 4000, 8000], unit: 'µs' },
  }
}

export const uwbSstwr: Lesson = {
  id: 'uwb-sstwr',
  module: 15,
  title: '应答时间是用对方的时钟测量的',
  why: '前面几课假设两台设备的时钟完全准确。IEEE 802.15.4-2024 的单边双向测距（single-sided two-way ranging, SS-TWR）由发起方测量往返时间 Tround，由响应方测量它的回复时延（reply time）Treply，两段各用本机的时钟计时，飞行时间取两者之差的一半（§10.29.1.2.2）。标准同时指出，两端晶振（crystal）都有频率偏差 eA、eB，单位是百万分之几（parts per million, ppm），它们使这一估计产生相当大的误差，并且误差随回复时延增大而增大。按标准的记号展开，剩下的误差项是回复时延的一半乘以两端的速率之差 eA − eB：两端同样偏快时这一项为零，两端相差 20 ppm、等待 2 ms 时，距离偏长约 6 m。标准给出的修正是：发起方的接收机如果能测得对端相对于本机的时钟偏差（clock offset）Coffs，就用它缩放 Treply；这项测量属于可选的晶振特性测量（§10.29.1.6），标准不规定测量方法。修正之后剩下的是回复时延的一半乘以 Coffs 自身的估计误差，所以误差仍随等待时长增大。本仿真器不测量 Coffs，而是取两端真实的速率之差，再加上标准差 0.2 ppm 的高斯误差。',
  outcomes: [
    '写出标准的两个单边双向测距公式，并说明未修正的那一个为什么随回复时延偏长',
    '根据锚点（anchor）在第几个时隙应答，预测未修正的距离偏长多少',
    '分清 Coffs 在标准里怎样得到、在本仿真器里怎样得到',
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'crystal', plain: '无线设备用于计时的石英晶体；任何两片的频率都不完全相同' },
    { term: 'ppm', plain: '百万分之几：时钟速率误差的单位' },
    { term: 'clock offset', plain: '一台设备的时钟相对于另一台的快慢，以比值表示' },
    { term: 'SS-TWR', plain: '单边双向测距：一次请求、一次应答（§10.29.1.2.2）' },
    { term: 'Coffs', plain: '标准公式里的记号：发起方接收机测得的、响应方发射机相对于本机的时钟偏差' },
  ],
  standard: [
    { heading: '两段时间，各用本机的时钟（§10.29.1.2.2，图 10-197）', text: '单边双向测距由设备 A 发起、设备 B 应答。A 测量从自己发出到收到应答的往返时间 Tround，B 测量从收到请求到发出应答的回复时延 Treply；两段时间都由各自对本机计数器上的两个读数相减得到，所有时刻都以 RMARKER（ranging marker）为准（§10.29.1.1）。飞行时间的估计是 T̂prop = ½·(Tround − Treply)。' },
    { heading: '晶振的频率偏差（§10.29.1.2.2，§16.4.6，§16.4.9）', text: '标准指出，Tround 与 Treply 由 A、B 各用本地时钟独立测量，两个时钟相对于标称频率分别有频率偏差 eA 与 eB，因此上面的估计含有相当大的误差，并且误差随回复时延增大而增大。HRP 超宽带（ultra-wideband, UWB）物理层（physical layer, PHY）的码片（chip）速率与发射中心频率的精度都要求在 ±20 ppm 之内，载波与码片时钟取自同一个参考振荡器（§16.4.6、§16.4.9）；所以两台合规设备之间的速率之差最多可达 40 ppm。' },
    {
      kind: 'formula', heading: '相减之后剩下的那一项（按 §10.29.1.2.2 的记号推出）',
      text: 'Tround  = Treply + 2·Tprop\nT̂round = (1 + eA)·Tround\nT̂reply = (1 + eB)·Treply\n(T̂round − T̂reply) / 2\n   = (1 + eA)·Tprop + ½·Treply·(eA − eB)',
      note: '带记号的两个量是两端实际读出的数。最后一行的前一项是经过缩放的飞行时间；后一项不含距离信息，只有回复时延的一半乘以 eA − eB。只有速率之差进入这一项：两端同样偏快时它为零。',
    },
    { heading: '用时钟偏差修正（§10.29.1.2.2）', text: '如果设备 A 的接收机能够测得自己与设备 B 发射机之间的相对时钟偏差 Coffs，就可以用它调整 Treply，公式变为 T̂prop = ½·(Tround − Treply·(1 − Coffs))。具备这项能力的接收机通过 MCPS-DATA.confirm 或 MCPS-DATA.indication 原语的 RangingTrackingInterval 与 RangingOffset 参数上报测得的偏差。' },
    { heading: '晶振特性测量（§10.29.1.6，§10.29.1.1）', text: '这项能力称为晶振特性测量，是可选的：实现它的设备为每一份测距报告给出测距跟踪偏差与测距跟踪区间两个值，偏差为正表示发射端的振荡器比接收端的快；跟踪区间的长度应当使上报的偏差分辨到 100 ppb（即 0.1 ppm）或更细（§10.29.1.6.3）。标准不规定怎样测量。另一条途径是由上层根据加扰时间戳序列（scrambled timestamp sequence, STS）各段起止处的接收计数值估计时钟偏差（§10.29.1.1）。' },
    { heading: '测距计数器（§10.29.1.3，§10.29.1.4）', text: '计数器的值是至少 32 位的整数，不带正负号；HRP UWB 中一个计数单位是 499.2 MHz 码片周期的 2⁻⁷，约 15.65 ps。' },
    { kind: 'steps', heading: '一对多单边双向测距，按标准：逐步说明（§10.32.4，图 10-235）', items: [
      '发起方广播测距启动消息，其中的 RRMC 信息单元把 Ranging Control Information 设为 0、Reply Time Request 设为 1，请各响应方回报回复时延（§10.29.8.3）。',
      '按时间调度时，各响应方在分配给自己的时隙里应答（§10.32.2）；控制器与发起方是同一台设备时，测距控制消息与测距启动消息可以合为一帧。',
      '每个响应方的应答单播给发起方，并带一个 RRTI 信息单元，里面是这一帧自己的回复时延（§10.29.8.1）。',
      '发起方每收到一帧应答，就有了计算到这个响应方的飞行时间所需的全部数据。',
      '响应方如果在应答里请求了结果，发起方最后广播一帧数据帧（data frame），用测距测量信息（ranging measurement information, RMI）信息单元回报这些结果。',
    ] },
  ],
  implementation: [
    { topic: '一对多的帧', standard: '启动消息带 RRMC，应答带 RRTI 与控制值为 1 的 RRMC，按时隙应答（§10.32.4，图 10-235；一对一的图 10-204 里应答只带 RRTI）', sim: '手机的 Poll 是测距控制消息与启动消息合成的一帧，42 字节，带 ARC、RR、RDM、RRMC 四个信息单元；每个锚点在自己的时隙里发 21 字节的 Response，带 RRMC 与 RRTI。本课的锚点不请求结果，所以没有最后那一帧。', kind: 'faithful' },
    { topic: '计算距离', standard: '修正公式 ½·(Tround − Treply·(1 − Coffs))（§10.29.1.2.2）', sim: '照此计算；日志的测距行同时写出不用 Coffs 的 raw 值，供对照。', kind: 'faithful' },
    { topic: '应答方得到距离', standard: '应答方可以在应答的 RRMC 信息单元里置 TOF Request，发起方在最后一帧里用 RMI 信息单元报告飞行时间（§10.29.8.3，§10.32.4 图 10-235）', sim: '照此：会话开关 ssTofRequest 打开时，锚点在 Response 的 RRMC 信息单元里置 TOF Request，手机在这一轮末尾多用一个时隙，广播一帧 RMI 信息单元，带每个锚点的飞行时间与地址（15 + 6N 字节），锚点由此得到自己的距离。本课场景没有打开它。', kind: 'faithful' },
    { topic: 'Coffs 的来源', standard: '可选的晶振特性测量，方法不规定（§10.29.1.6）；或由上层用 STS 估计（§10.29.1.1）', sim: '不测量：取两台设备设定的 ppm 之差，再加上一个高斯误差。所以这里不存在失锁，接收信号变弱时估计也不会变差。', kind: 'choice' },
    { topic: 'Coffs 的误差', standard: '只要求上报分辨到 0.1 ppm 或更细（§10.29.1.6.3），不规定估计误差', sim: '标准差取 0.2 ppm，不随接收信号的强弱变化；时间戳噪声随信干噪比（signal-to-interference-plus-noise ratio, SINR）放大，这一项却不变，所以远距离上本仿真器的修正结果偏乐观。', kind: 'value' },
    { topic: '晶振', standard: '每台 ±20 ppm（§16.4.6，§16.4.9）', sim: '每台设备一个固定的 ppm，整场不变，没有温漂、老化与相位噪声。本课的场景取手机 +10 ppm、锚点 −10 ppm，两个变体分别取 0 与 ±1 ppm。', kind: 'value' },
    { topic: '接收时间戳', standard: '不规定精度；每个计数值附一个品质因数（figure of merit, FoM，§10.29.1.7）', sim: '每个接收时间戳加标准差 100 ps 的高斯噪声。', kind: 'value' },
    { topic: '应答的发送时刻', standard: '标准未规定收发转换时间以外的抖动', sim: '锚点恰好在时隙边界发射，没有收发转换、中断与调度的抖动，所以 Treply 恰好是整数个时隙减去一次飞行时间。而 Treply 正是误差项的乘数。', kind: 'choice' },
    { topic: '时隙长度', standard: '由控制器配置（§10.32.2），标准未给出取值', sim: '2400 RSTU（ranging scheduling time unit），即 2 ms；锚点 k 在第 k 个时隙应答。', kind: 'value' },
    { topic: '测距计数器', standard: '至少 32 位，单位约 15.65 ps（§10.29.1.3，§10.29.1.4）', sim: '40 位，单位相同。', kind: 'value' },
    { topic: 'RMARKER 偏移', standard: 'phyTxRmarkerOffset 与 phyRxRmarkerOffset 两个属性用于扣除计数器与天线（antenna）之间的传播时间（§10.29.1）', sim: '未实现：时间戳直接取天线处的时刻，不存在需要逐台标定的收发电路时延。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '四个锚点，四个 raw 误差',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一条测距行。手机与每个锚点都相距 3.50 m。',
        '依次读四条测距行：修正后的距离，以及括号里的 raw 值。',
        '对照下图：每个锚点的灰条是它从收到 Poll 到发出 Response 的等待，即 Treply。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '两端的时钟，四段等待', spec: uwbSstwrTiming(),
          caption: '按比例绘制的一整轮。灰条是锚点的回复时延，由锚点自己的时钟测量，写进 Response 的 RRTI 信息单元；灰条上标注的是它在 raw 距离上造成的偏差。飞行时间只有 11.675 ns，在这个比例下看不见。',
        },
        { kind: 'table', heading: '四个锚点，四个误差', head: ['锚点', 'Treply', '公式预测的误差', 'raw 距离', 'raw 误差'], rows: [
          ['anchor-1', '2 ms − Tprop', '6.0 m', '9.51 m', '6.01 m'],
          ['anchor-2', '4 ms − Tprop', '12.0 m', '15.47 m', '11.97 m'],
          ['anchor-3', '6 ms − Tprop', '18.0 m', '21.49 m', '17.99 m'],
          ['anchor-4', '8 ms − Tprop', '24.0 m', '27.42 m', '23.92 m'],
        ] },
      ],
      expect: '四个 raw 值全都偏长，并且逐个增大：9.51、15.47、21.49、27.42 m；每多等一个时隙，raw 距离约增加 6 m。修正后的四个距离在 3.41 到 3.51 m 之间。',
      meaning: '这正是 ① 里那一项 ½·Treply·(eA − eB)：2 ms 取一半是 1 ms，乘以 20 ppm 得 20 ns，光在 20 ns 里传播约 6 m。误差是系统性的，不是随机散布。',
    },
    {
      heading: '修正之后留下的误差',
      jump: 2,
      steps: [
        '仍用本课场景，跳到第四条测距行。',
        '读出四个修正后的距离，与 3.50 m 相减。',
      ],
      blocks: [
        { kind: 'table', heading: '修正之后留下的', head: ['锚点', '回复时延', '剩余误差 1σ', '本次运行的误差'], rows: [
          ['anchor-1', '2 ms', '6.0 cm', '−5.3 cm'],
          ['anchor-2', '4 ms', '12.0 cm', '−7.8 cm'],
          ['anchor-3', '6 ms', '18.0 cm', '−9.5 cm'],
          ['anchor-4', '8 ms', '24.0 cm', '+0.5 cm'],
        ] },
      ],
      expect: '四个修正后的距离是 3.45、3.42、3.41 与 3.51 m。1σ 一列逐行增大，每多等 1 ms 增加 3.0 cm；最后一列是从这些分布中各取一个样本，所以并不逐行增大。',
      meaning: '修正把 20 ppm 的速率之差换成了本仿真器取的 0.2 ppm 估计误差（②），剩余误差仍是回复时延的一半乘以这个误差，所以仍随等待时长增大（①）。',
    },
    {
      heading: '三种晶振',
      variant: 0,
      more: [1],
      steps: [
        '载入「理想晶振」：两端的偏差都设为 0，其他设置不变。读第一条与第四条测距行的 raw 值。',
        '再载入「±1 ppm 的温补晶振」，读同样两行。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的线性增长，三种晶振', head: ['晶振', 'eA − eB', '时隙 1 的 raw 误差', '时隙 4 的 raw 误差'], rows: [
          ['理想晶振', '0 ppm', '+1.9 cm', '−6.1 cm'],
          ['温补晶振，±1 ppm', '2 ppm', '0.62 m', '2.34 m'],
          ['本场景，±10 ppm', '20 ppm', '6.01 m', '23.92 m'],
        ] },
      ],
      expect: '理想晶振时 raw 误差只有几厘米，与时隙无关；±1 ppm 时线性增长仍在，每个时隙约 0.6 m。',
      meaning: '误差项只与 eA − eB 成正比（①）：更好的晶振把误差降低一个数量级，但不能消除它。理想晶振时剩下的是本仿真器加在接收时间戳上的噪声（②）。',
    },
    {
      heading: '锚点 1 的逐步计算',
      jump: 0,
      steps: [
        '回到本课场景，跳到 Poll 帧，打开时间轴上的 UWB_TS 行：手机为 Poll 的发出打时间戳，锚点 1 为它的到达打时间戳。',
        '再找到锚点 1 发出 Response 与手机收到它的两条 UWB_TS 行。四个时间戳，两端各两个，任何一端都不拿对方的读数做减法。',
        '按下表依次相减、除以二，再乘以一个计数单位 15.65 ps 与光速。',
      ],
      blocks: [
        { kind: 'table', heading: '锚点 1 的逐步计算', head: ['步骤', '数值'], rows: [
          ['手机发出 Poll', '336 207 494 703'],
          ['它到达锚点 1', '26 381 597 885'],
          ['锚点 1 发出 Response', '26 509 391 059'],
          ['= Treply，锚点的晶振', '127 793 174'],
          ['它到达手机', '336 335 291 933'],
          ['= Tround，手机的晶振', '127 797 230'],
          ['Coffs，由本仿真器的模型给出', '−20.24 ppm'],
          ['差值除以二，不计 Coffs', '2028 · 9.51 m'],
          ['差值除以二，计入 Coffs', '734.6 · 3.45 m'],
        ] },
      ],
      expect: 'Tround 比 Treply 多 4056 个计数单位，本应只是两次飞行的时间；不计 Coffs 得 9.51 m，计入 −20.24 ppm 的 Coffs 得 3.45 m，真值 3.50 m。',
      meaning: '两个数都按标准的公式（①）算出；−20.24 ppm 是两台设备设定的 20 ppm 之差加上本仿真器的估计误差（②），不是从接收信号中测得的。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.2.2 与图 10-197（单边双向测距的两个公式，Coffs，RangingTrackingInterval 与 RangingOffset 参数）、§10.29.1.6（晶振特性测量，100 ppb）、§10.29.1.1（用 STS 估计时钟偏差，RMARKER）、§10.29.1.3 与 §10.29.1.4（测距计数器）、§10.29.1.7（品质因数）、§10.32.4 与图 10-235（一对多单边双向测距）、§10.29.8.1（RRTI 信息单元）、§10.29.8.3（RRMC 信息单元）、§16.4.6 与 §16.4.9（±20 ppm）。',
    '本仿真器的取值与取法：每个接收时间戳 100 ps 的噪声、Coffs 取真实偏差加 0.2 ppm 的高斯误差、晶振整场恒定、在时隙边界准时发射、2 ms 的测距时隙、40 位的测距计数器、没有天线时延。2 ms 时隙通常认为来自 FiRa 的缺省配置，FiRa 规范不在核查用的语料里。',
  ],
  limits: [],
  scenario: () => uwbSstwrScenario({ tag: 10, anchors: -10 }),
  variants: [
    { label: '理想晶振', scenario: () => uwbSstwrScenario({ tag: 0, anchors: 0 }) },
    { label: '±1 ppm 的温补晶振', scenario: () => uwbSstwrScenario({ tag: 1, anchors: -1 }) },
  ],
  jumps: [
    J('Poll 帧从手机发出', firstUwbPoll),
    J('第一次测距：raw 偏长 6 m', firstUwbRange),
    J('第四次测距：raw 偏长 24 m', fourthUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '锚点 1 与锚点 4 一样远，为什么后者的 raw 误差是前者的四倍？',
      options: [
        '又过了三个时隙，衰落让它的应答更弱',
        '剩下的误差项是回复时延的一半乘以两端的速率之差，而它的回复时延是前者的四倍',
        '它的计数器有四倍的时间可以漂移',
      ],
      answer: 1,
      explain: '§10.29.1.2.2 说误差随回复时延增大而增大；展开后正是 ½·Treply·(eA − eB)：同样的速率之差，乘以更长的时间。',
    },
    {
      q: '按标准，Coffs 从哪里来？',
      options: [
        '标准规定由往返时间与回复时延之差算出',
        '由接收机的可选晶振特性测量给出，或由上层用 STS 估计；标准不规定测量方法',
        '在会话建立时由响应方的数据手册交换',
      ],
      answer: 1,
      explain: '§10.29.1.6 把它列为可选能力并规定上报格式，§10.29.1.1 给出用 STS 估计的途径。本仿真器两者都不做，直接取真实偏差加 0.2 ppm 的误差。',
    },
    {
      q: '修正之后锚点 4 的距离反而最准。在时隙 4 应答是不是最好？',
      options: [
        '是：更长的回复时延让接收机有更多时间平均',
        '否：时隙 4 的剩余误差分布最宽，1σ 为 24.0 cm，锚点 1 只有 6.0 cm，这一次只是恰好落在真值附近',
        '否：精度是真实的，但它来自锚点 4 所在的位置',
      ],
      answer: 1,
      explain: '剩余误差是回复时延的一半乘以 Coffs 的估计误差，像 raw 误差一样随等待时长增大；从宽分布中抽取一个样本，结果可能落在任何位置。',
    },
  ],
}
