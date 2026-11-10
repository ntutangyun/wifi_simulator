/**
 * UWB Tier 1 · M17 · Ranging sessions and positioning · From four ranges to a point.
 *
 * In the standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① what IEEE Std 802.15.4-2024 specifies — one-to-many DS-TWR, computed by the responders and
 * returned on request, and nothing at all about turning ranges into a position; ② what this
 * simulator does, which past the ranges is entirely its own: a Gauss-Newton fit of (x, y) with the
 * tag's height held, equal weights and a residual that is never written down; ③ three guided runs.
 *
 * Why the same radio does better or worse depending on where the anchors stand is the next lesson,
 * `uwb-geometry`, which loads exactly this scene and these variants.
 *
 * Every figure printed below is read back out of the lesson text and compared with a run in
 * tests/course/uwb-position.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, brick, firstUwbPoll, firstUwbPosition, firstUwbRange, firstUwbRoundEnd, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The second block's fix: the same geometry, a fresh draw of noise. */
const secondBlockFix = (r: TLRecord): boolean => r.type === 'UWB_POSITION' && r.block === 1

/** Which scene the lesson is running: the clean square, one blocked path, or a missing corner. */
export type UwbPositionVariant = 'base' | 'wall' | 'three'

/**
 * Four anchors in the corners of the 10 × 8 m lab at 2.20 m, and one phone at
 * (4, 3.5, 1.0). The anchors span 9 × 7 m — a rectangle, not a square — so no
 * point in the room sees four bearings 90° apart and GDOP has something to say
 * wherever the tag stands; the tag's own spot is in fact marginally better than
 * the room's centre (1.0488 against 1.0544). The session is the default one
 * with NLOS on, so the 'wall' variant's brick stub is actually felt; every
 * crystal is drawn rather than set, so the noise is the engine's own.
 *
 * 'wall' adds brick(2, 1.5, 2, 3), a 1.5 m stub that the tag → anchor-1 ray
 * crosses and no other tag → anchor ray does (the test checks all four).
 * 'three' deletes the anchor in the far corner.
 *
 * `uwb-geometry` calls this same builder with the same three arguments, so the
 * two lessons are one scene and one recorded timeline.
 */
export function uwbPositionScenario(variant: UwbPositionVariant = 'base'): Scenario {
  const house = oneRoom()
  const walls = variant === 'wall' ? [...house.walls, brick(2, 1.5, 2, 3)] : house.walls
  const anchors = [
    anchor('anchor-1', 'Anchor 1', 0.5, 0.5, 2.2),
    anchor('anchor-2', 'Anchor 2', 9.5, 0.5, 2.2),
    anchor('anchor-3', 'Anchor 3', 0.5, 7.5, 2.2),
    anchor('anchor-4', 'Anchor 4', 9.5, 7.5, 2.2),
  ]
  return uwbSc(
    { rooms: house.rooms, walls },
    [...(variant === 'three' ? anchors.slice(0, 3) : anchors), uwbTag('uwb-1', 'Phone', 4, 3.5, 1.0)],
    { method: 'ds', nlos: true },
  )
}

export const uwbPosition: Lesson = {
  id: 'uwb-position',
  module: 17,
  title: '从四个距离到一个点',
  why: '到某个锚点（anchor）有多远，并不等于人在哪儿。手机已有四个这样的距离，彼此只差几毫秒测得，每一个都带有一两厘米的误差，而它要回答的只有用户真正问的那个问题：我现在站在哪里？IEEE 802.15.4-2024 规定的是怎样测距：一个发起方可以在一轮里与多个应答方做双边双向测距（double-sided two-way ranging, DS-TWR），应答方算出距离，发起方请求时再把结果发回；怎样由几个距离算出位置，标准只字未提——它只在讲到达时间差（time difference of arrival, TDoA）时说明，每对同步节点的到达时间差把移动设备放在一条双曲面上。所以本课的解算器完全是本仿真器自己的：以每个距离为半径绕锚点画圆，带着噪声的四个圆从来交不到一点，解算器改找让四个残差（residual）的平方和最小的那个位置，只解地面上的两个坐标，手机的高度当作已知。三个距离就够定位，第四个是一道检查：拟合无法解释的残差，在干净的一轮里落在单条距离噪声的量级，一厘米上下；只要有一条距离确实有偏差，它会升至二十厘米左右。残差衡量的是四个测量彼此是否一致，不是它们是否正确，而且这个数从不写入记录。',
  outcomes: [
    '说出标准对多个应答方的测距规定了什么，以及它没有规定由距离求位置',
    '从日志里读出一次定位，并照本仿真器的解算步骤复算一遍',
    '说出残差是什么、它能发现什么、不能发现什么',
  ],
  needs: ['uwb-blocks', 'uwb-dstwr'],
  terms: [
    { term: 'trilateration', plain: '只靠距离把位置找出来：每个距离是一个圆，而位置就落在这些圆相交的地方；这不是 802.15.4 的术语' },
    { term: 'residual', plain: '最优解仍然无法解释的那部分——解确定之后，各个测量与它之间仍有多大偏差' },
  ],
  standard: [
    { heading: '标准支持的测距与定位方法（§10.29.1.1、§10.29.1.2.1）', text: '标准支持三种基于时间戳的相对定位方法：单边双向测距（single-sided two-way ranging, SS-TWR）、双边双向测距，以及用于到达时间差定位的单向测距。' },
    { kind: 'formula', heading: '双边双向测距（§10.29.1.2.3；三帧形式见 §10.29.1.2.4，图 10-199）', text: 'T̂prop = (Tround1 · Tround2 − Treply1 · Treply2) / (Tround1 + Tround2 + Treply1 + Treply2)', note: '两次往返各由一方发起；三帧形式里，应答方的应答同时结束第一次往返、开始第二次往返。这个式子不要求两次回复时间相等。' },
    { kind: 'steps', heading: '一对多的双边双向测距，按标准：逐步说明（§10.32.5，图 10-236）', items: [
      '发起方广播测距发起消息，其中的 RRMC 信息单元选出应答方。',
      '各应答方依次发出应答消息，结束第一次往返测量、开始第二次；应答消息可以按时间调度，也可以在应答阶段竞争时隙。',
      '发起方广播最后一帧（Final），用测距测量信息（ranging measurement information, RMI）信息单元报告各应答方的往返时间，用 RRTI 信息单元报告回复时间。',
      '每个应答方收到 Final 后，已有足够的信息算出自己到发起方的飞行时间。',
      '发起方在 RRMC 信息单元里请求时，应答方才把测量结果发回发起方；不请求时不发回。',
    ] },
    { heading: '谁计算，计算什么（§10.29.6.1、§10.29.1.2.5）', text: '是否参加测距、怎样得出最终的距离，都由媒体访问控制（medium access control, MAC）层以上各层负责。标准没有规定怎样把几个距离合成一个位置；它只在讲到达时间差时说明，每对彼此同步的固定节点的到达时间差把移动设备放在一个双曲面上，多对节点的双曲面相交处就是位置。' },
  ],
  implementation: [
    { topic: '测距方式', standard: '一对多双边双向测距（§10.32.5）', sim: '手机作发起方，四个锚点依次应答；Final 带 RMI 与 RRTI 信息单元，锚点各自算出距离，再按手机的请求在测量报告阶段把结果发回。', kind: 'faithful' },
    { topic: '由距离到位置', standard: '标准未规定', sim: '高斯－牛顿最小二乘：从锚点形心出发，每步解 (JᵀJ) δ = −Jᵀ r，δ 短于 1 mm 或迭代满 20 次时停止。', kind: 'choice' },
    { topic: '未知数', standard: '标准未规定', sim: '只解地面上的 (x, y)；手机的高度当作已知，用的是场景里的真值 1.00 m。锚点坐标也取真值，没有勘测误差。', kind: 'choice' },
    { topic: '何时不输出', standard: '标准未规定', sim: '能匹配到锚点坐标的距离少于三条、或 JᵀJ 的行列式小于 1e-9（锚点排成一条直线）时，这一轮不输出定位。', kind: 'value' },
    { topic: '各条距离的权重', standard: '每个计数值附一个品质因数（figure of merit, FoM），由上层使用（§10.29.1.7、§10.29.6.1）', sim: '四条距离完全等权：不按品质因数、不按到达电平加权，也不剔除异常值。', kind: 'choice' },
    { topic: '残差', standard: '标准未规定', sim: '解算器在终止点上算出 √(Σ r_i² / n)，但不写入记录，日志的 UWB_POSITION 一行没有这个数。', kind: 'choice' },
    { topic: '单条距离的噪声', standard: '标准不规定时间戳精度', sim: '画椭圆用的 σ_r = c · σ_ts / √2，σ_ts 取 100 ps，得 2.12 cm；这是单边测距的式子，双边测距也沿用这个偏保守的值。', kind: 'value' },
    { topic: '定位的时刻', standard: '标准未规定', sim: '每个测距块（ranging block）一次，在手机这一轮的末尾、最后一个距离到达之后；各块的定位彼此独立，没有平滑或运动模型。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一轮之后的一个点',
      jump: 2,
      steps: [
        '载入本课场景，单步执行第一轮，观察四个距离逐个锚点地到齐。',
        '跳到这个块的定位那一行，再读完整段运行的七次定位。',
      ],
      blocks: [
        { kind: 'table', heading: '一轮末尾日志输出什么', head: ['行', '内容'], rows: [
          ['第 0 块的定位', 'uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors'],
          ['检视面板显示的误差', '0.7 cm'],
          ['整段运行的七次定位', '0.7, 3.3, 0.5, 2.3, 2.8, 0.5, 1.8 cm'],
        ] },
      ],
      expect: '十字只在最后一个距离到达之后出现；七次定位的误差在 0.5 到 3.3 cm 之间，每个块一次。',
      meaning: '这四个距离来自一对多的双边双向测距（①）；由它们得出这个点的是本仿真器的解算器（②），标准不涉及。定位行里的误差是仿真器拿真值算的，真实设备没有这一栏。',
    },
    {
      heading: '照解算步骤复算第 0 块',
      jump: 2,
      steps: [
        '从日志里抄下第 0 块手机测得的四个距离。',
        '按下面的步骤从锚点形心出发迭代，与表里的每一行对照。',
      ],
      blocks: [
        { kind: 'formula', heading: '解算器最小化什么', text: 'r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r', note: '锚点 i 在试探点 p 处的残差，就是 p 比测量所说的离它远了多少；J 的每一行只取水平分量。' },
        { kind: 'steps', heading: '本仿真器的解算器：逐步说明（标准没有规定这一过程）', items: [
          '收集这一轮的距离，逐条匹配到存有坐标的锚点；不足三条时不输出定位。',
          '把试探点放在这些锚点 x 与 y 的平均值上，本场景是 (5.00, 4.00) m。',
          '在试探点上算出到每个锚点的三维距离（手机高度固定为 1.00 m），减去实测距离，得到残差 r_i。',
          '取从锚点指向试探点的单位向量的水平分量，作为 J 的一行。',
          '解 (JᵀJ) δ = −Jᵀ r，把试探点移动 δ；重复，直到 δ 短于 1 mm 或迭代满 20 次。',
          '在终止点上算出 √(Σ r_i² / n)，即拟合无法解释的那一部分；它不写入记录。',
        ] },
        { kind: 'table', heading: '本次运行的第 0 块，按上述步骤计算一遍', head: ['步骤', '数值'], rows: [
          ['匹配上的四条距离', '4.7368, 6.3831, 5.4439, 6.8922 m'],
          ['试探点起于', '(5.00, 4.00) m'],
          ['迭代终止于', '(3.9933, 3.4981) m'],
          ['该处残差的均方根', '1.44 cm'],
          ['手机的真实位置', '(4.00, 3.50) m'],
          ['格式化后输出', 'error 0.01 m — 0.69 cm'],
        ] },
        { kind: 'formula', heading: '单次测距的噪声有多大', text: 'σ_r = c · σ_ts / √2 = 2.12 cm' },
      ],
      expect: '迭代终止于 (3.9933, 3.4981) m，残差的均方根 1.44 cm，比单条距离的噪声 2.12 cm 还小。',
      meaning: '每一步都是本仿真器的取法（②）：起点、步长门限、迭代次数与「高度已知」都不出自标准。',
    },
    {
      heading: '残差是一道检查',
      variant: 0,
      more: [1],
      steps: [
        '依次载入本课场景、「一堵砖墙挡住一条路径」与「三个锚点」，各运行七个块。',
        '用上一组的步骤复算每个块的残差，对照下表。',
      ],
      blocks: [
        { kind: 'table', heading: '七个块的残差，三个场景', head: ['场景', '残差'], rows: [
          ['四个锚点，干净', '0.78 到 1.98 cm'],
          ['一堵砖墙挡住一条路径', '19.85 到 22.25 cm'],
          ['第 0 块：四个锚点对三个锚点', '1.44 cm 对 0.24 cm'],
        ] },
      ],
      expect: '干净的七个块都在 2.12 cm 以内；有墙的七个块升至二十厘米左右；三个锚点的残差反而比四个锚点小。',
      meaning: '残差衡量的是测量彼此是否一致：三个锚点只比两个未知数多一个测量，能互相印证的少了，残差也就小了。这个数在本仿真器里从不写入记录（②），屏幕上看不到它。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1 与 §10.29.1.2.1（三种测距与定位方法）、§10.29.1.2.3 与 §10.29.1.2.4（双边双向测距的式子，图 10-199）、§10.32.5 与图 10-236（一对多双边双向测距，由应答方计算，发起方请求时才发回）、§10.29.6.1（由上层计算）、§10.29.1.2.5（到达时间差的双曲面）、§10.29.1.7（品质因数）。标准没有规定由距离求位置。',
    '本仿真器的取值与取法：对 (x, y) 做高斯－牛顿最小二乘、标签高度与锚点坐标取真值、从锚点形心起步、步长门限 1 mm、最多 20 次迭代、行列式下限 1e-9、可用距离不足三个时不输出、四条距离等权、残差不写入记录。',
    'σ_r = c · σ_ts / √2 对单边测距是精确的；双边测距的实际散布约为 0.62–0.65 · c · σ_ts，本仿真器沿用偏保守的单边值。100 ps 的时间戳噪声本身也是本仿真器的取值。',
  ],
  limits: [],
  scenario: () => uwbPositionScenario('base'),
  variants: [
    { label: '一堵砖墙挡住一条路径', scenario: () => uwbPositionScenario('wall') },
    { label: '三个锚点', scenario: () => uwbPositionScenario('three') },
  ],
  jumps: [
    J('手机的 Poll 开启这一轮', firstUwbPoll),
    J('第一个算完的距离', firstUwbRange),
    J('这个块的距离解出的定位', firstUwbPosition),
    J('这一轮结束', firstUwbRoundEnd),
    J('下一个块的定位', secondBlockFix),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '本课的解算器为什么不干脆把四个圆求交？',
      options: [
        '求圆的交点对手机来说计算量太大',
        '每条半径上都有噪声，没有哪一点同时落在四个圆上；它取的是让四个残差平方和最小的位置',
        '三个圆已经交于一点，第四个就被忽略了',
      ],
      answer: 1,
      explain: '每条半径上一厘米的噪声，留下的是一小块不齐整的区域而不是交点，而最小二乘在其中挑出一个位置。这是本仿真器的取法，标准不规定。',
    },
    {
      q: '干净的一轮残差一厘米上下，某一轮却跳到二十厘米，这说明了什么？',
      options: [
        '定位与真值差了二十厘米',
        '四个测量彼此不一致，而且不一致的程度超出了噪声能解释的范围',
        '锚点挨得太近了',
      ],
      answer: 1,
      explain: '残差衡量的是一致性，不是准确性：一厘米上下正是四条带噪声的距离本来的样子，二十厘米不是——而这一次的真实误差有多大，它仍然不知道。',
    },
    {
      q: '按标准，一对多的双边双向测距结束时，距离由谁算出？',
      options: [
        '只由发起方算出',
        '每个应答方收到 Final 后都能算出；发起方请求时，应答方才把结果发回',
        '标准规定由定位服务器算出',
      ],
      answer: 1,
      explain: '§10.32.5：Final 带往返时间与回复时间，应答方据此算出飞行时间；RRMC 里不请求时，应答方不把测量结果发回。',
    },
  ],
}
