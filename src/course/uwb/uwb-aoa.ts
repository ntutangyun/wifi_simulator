/**
 * UWB Tier 2 · M26 · Other ranging modes · One anchor is enough.
 *
 * **Standard-first shape (2026-11-10).** ① is what IEEE Std 802.15.4-2024 says about angle of arrival:
 * that it is one of the ranging results (§10.29.1.1), how it is requested (RRMC IE, §10.29.8.3; the
 * RAOA bit of the SRRR IE in SP3 rounds, §10.32.9.9) and how it is reported (the AOA Azimuth, AOA
 * Elevation and FOM fields of the RMI IE, §10.29.8.4) — and that how it is measured, and how a
 * position is solved from a range and an angle, are outside the standard. ② is everything this
 * simulator does on top: the two-antenna phase model, its noise and its clamps, which frames are
 * measured, the anchor solving the fix itself. 2026-11-11 (W4): the SP3 report carries the bearing in
 * the RMI IE's AOA Azimuth field (until then a "RAOA" IE the standard does not define), and an SS-TWR
 * responder that sets the RRMC TOF Request field gets its range back in the initiator's RMI report
 * (audit #16) — the fifth scene runs exactly that.
 *
 * The scenes: one anchor against the south wall of the 10 × 8 m room, one badge; DS-TWR with AoA on,
 * channel 9, NLOS off. Only the badge's spot and the anchor's facing change between the first four;
 * the fifth is the base spot on SS-TWR with the responder's TOF request.
 * Every figure the lesson prints is read back by tests/course/uwb-aoa.test.ts and compared with a run.
 */
import type { NodeCfg, Scenario } from '../../model/scenario'
import { J, anchor, firstUwbAoa, firstUwbAoaFix, firstUwbFinal, firstUwbPoll, firstUwbRange, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Which spot the badge stands on, and which way the anchor faces. */
export type UwbAoaVariant = 'base' | 'off45' | 'off60' | 'behind' | 'ss'

/** The one anchor: against the room's south wall, on the ceiling. */
export const ANCHOR_X = 5
export const ANCHOR_Y = 0.5
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** Facing +y, straight into the 10 × 8 m room; `yawDeg` is counter-clockwise from +x. */
export const YAW_IN = 90
/** Facing −y, into the wall it is mounted on — the "behind the anchor" variant. */
export const YAW_WALL = -90

/**
 * Where the badge stands, as an angle off the anchor's boresight and a horizontal distance, laid out
 * to the anchor's right (a negative azimuth) so all three stay inside the room.
 */
export const SPOTS: Record<UwbAoaVariant, { offBoresightDeg: number; rangeM: number }> = {
  base: { offBoresightDeg: 0, rangeM: 2 },
  off45: { offBoresightDeg: 45, rangeM: 4 },
  off60: { offBoresightDeg: 60, rangeM: 5 },
  behind: { offBoresightDeg: 0, rangeM: 2 },
  ss: { offBoresightDeg: 0, rangeM: 2 },
}

/** The badge's plan coordinates for a variant. */
export function tagXY(variant: UwbAoaVariant): { x: number; y: number } {
  const { offBoresightDeg, rangeM } = SPOTS[variant]
  const rad = offBoresightDeg * (Math.PI / 180)
  return { x: ANCHOR_X + rangeM * Math.sin(rad), y: ANCHOR_Y + rangeM * Math.cos(rad) }
}

function aoaAnchor(yawDeg: number): NodeCfg {
  const a = anchor('anc-1', 'Anchor', ANCHOR_X, ANCHOR_Y, ANCHOR_Z)
  return { ...a, uwb: { ...a.uwb!, yawDeg } }
}

/**
 * One anchor and one badge with angle of arrival on, channel 9, NLOS off. DS-TWR, where the anchor
 * computes the range itself — except 'ss': SS-TWR, where the badge computes it and the anchor asks for
 * it back with the RRMC IE's TOF Request field (standard §10.29.8.3, §10.32.4 Figure 10-235).
 */
export function uwbAoaScenario(variant: UwbAoaVariant = 'base'): Scenario {
  const p = tagXY(variant)
  return uwbSc(
    oneRoom(),
    [aoaAnchor(variant === 'behind' ? YAW_WALL : YAW_IN), uwbTag('badge-1', 'Badge 1', p.x, p.y, TAG_Z)],
    variant === 'ss'
      ? { method: 'ss', ssTofRequest: true, mode: 'twr', aoa: true, channel: 9, nlos: false }
      : { method: 'ds', mode: 'twr', aoa: true, channel: 9, nlos: false },
  )
}

export const uwbAoa: Lesson = {
  id: 'uwb-aoa',
  module: 26,
  title: '只需一个锚点',
  why: 'IEEE 802.15.4-2024 把到达角（AoA）列为测距结果之一：请求方用 RRMC 信息单元的到达角请求位提出请求，测量方用测距测量信息（ranging measurement information, RMI）信息单元的方位角字段报告，以发送设备的正前方为零弧度；到达角怎样测量、怎样由距离和角度解算位置，标准都不规定。本仿真器给锚点（anchor）两根相距半个波长的天线（antenna），由两路载波的相位差（phase difference）反解出方位角，并让锚点把这一轮测出的距离与方位角相交，独自解出胸牌的位置——一个锚点就够了。这个点的误差有方向：按本仿真器取的噪声值，距离精确到两厘米左右，方位角却越偏离正前方越不准，再乘以距离，横向误差达到几十厘米，所以误差椭圆横在视线上。锚点背后的胸牌产生的相位与它在正前方的镜像位置相同，于是被定位到镜像位置，周围的椭圆依然规整。单边测距时距离由胸牌算出：锚点在应答帧的 RRMC 信息单元里把 TOF Request 置 1，胸牌在这一轮末尾用 RMI 信息单元的 TOF 字段把飞行时间发回，锚点同样可以独自定位。',
  outcomes: [
    '说出标准对到达角规定了什么：属于测距结果、用哪个信息单元请求、用哪些字段报告、零点在哪里，以及哪些不在标准范围内',
    '分清本仿真器的测量模型、定位算法与标准的区别，说出单边测距时锚点怎样按标准拿回距离',
    '从日志里读出一个方位角与单个锚点解出的定位，并说明误差的方向与锚点背后的镜像',
  ],
  needs: ['uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'AoA', plain: '到达角：一帧信号的到达方向，以一个角度表示' },
    { term: 'phase difference', plain: '同一载波在两根天线处的相位之差：用角度表示的到达时延' },
    { term: 'boresight', plain: '锚点正对的方向；它报告的角度都以此为零点（标准报告到达角时也以设备正前方为零弧度）' },
    { term: 'field of view', plain: '两根天线能够分辨的方向范围：对本课这种两天线阵列而言是正前方的半个圆周' },
  ],
  standard: [
    { heading: '到达角是测距结果之一（§10.29.1.1）', text: '测距设备产生的测距结果供上层计算设备间的距离，其中可以包括收发测距计数值、测距品质因数（figure of merit, FoM）、到达角（AOA）信息等。' },
    { heading: '请求到达角（§10.29.8.3，图 10-211）', text: 'RRMC 信息单元的控制位里有 AOA Azimuth Request 与 AOA Elevation Request 两位，置 1 分别表示请求方位角、俯仰角的测量。同一个信息单元还有 TOF Request 位：单边双向测距（single-sided two-way ranging, SS-TWR）中通常由发起方计算飞行时间，应答方可以在应答里带 RRMC、把 TOF Request 置 1，请求发起方把结果发回。' },
    { kind: 'table', heading: 'RMI 信息单元里与到达角有关的字段（§10.29.8.4，图 10-212、图 10-213）', head: ['字段', '长度', '含义'], rows: [
      ['AOA Azimuth Present', '1 位', '置 1 表示每个列表元素都带方位角字段'],
      ['AOA Elevation Present', '1 位', '置 1 表示每个列表元素都带俯仰角字段'],
      ['AOA FOM Present', '1 位', '置 1 表示带相应的 FOM 字段'],
      ['AOA Azimuth', '0 或 2 字节', '取正负值的整数，单位 2π/(2^16 − 1)，0 弧度为发送设备的正前方；相对列表元素地址所指的设备测得'],
      ['AOA Azimuth FOM', '0 或 1 字节', '方位角估计的可靠程度，越大越好，0 表示估计无效'],
      ['AOA Elevation', '0 或 2 字节', '取正负值的整数，单位 π/(2^16 − 1)，0 弧度为发送设备的水平面'],
      ['TOF', '0 或 4 字节', '发送设备与地址所指设备之间的飞行时间估计'],
    ] },
    { heading: 'SP3 测距里的请求（§10.32.9.9，§10.32.8.2，§10.32.8.3）', text: 'SRRR 信息单元的 RAOA 位置 1 表示要求提供方报告到达角。RAOA 是请求位，不是信息单元；SP3 测距之后，到达角在测量报告阶段由 RMI 信息单元发回。' },
    { heading: '不在标准范围内的部分（§10.29.8.4）', text: '标准不规定到达角怎样测量。要让 FOM 有意义，需要知道测量设备的到达角能力，包括天线阵列的设置；这些系统参数怎样约定与交换，不在标准范围内。由距离和角度解算位置，标准也不涉及。' },
    { kind: 'steps', heading: '请求并报告一个方位角，按标准：逐步说明', items: [
      '请求方在测距帧里带 RRMC 信息单元，AOA Azimuth Request 置 1（SP3 测距时改用 SRRR 信息单元的 RAOA 位）。',
      '被请求的设备测量到达角；方法不在标准范围内。',
      '它发出 RMI 信息单元，AOA Azimuth Present 置 1，在列表元素里填写方位角（以自己的正前方为零弧度，相对地址所指的设备），可以附带 FOM。',
      '收到的一方从这个字段读出方位角；怎样把它与距离合成位置，由上层决定。',
    ] },
  ],
  implementation: [
    { topic: '测量方法', standard: '标准未规定', sim: '锚点有两根相距半个波长的接收天线：真实方位角为 θ 时相位差 Δφ = π·sin θ，加上噪声后用 θ̂ = asin(Δφ/π) 反解。信道 9 的载波波长 3.75 cm，天线间距 1.88 cm。正前方半个圆周即视场（field of view），恰好对应一个完整的相位周期，所以不会发生相位卷绕。', kind: 'choice' },
    { topic: '相位噪声', standard: '标准未规定', sim: '固定取 σ_φ = 0.15 rad（约 8.6°），不随信噪比（signal-to-noise ratio, SNR）变化。换算到方位角是 σ_θ = σ_φ/(π·cos θ)：正前方 2.74°，偏 45° 时 3.87°，偏 60° 时 5.47°。', kind: 'value' },
    { topic: '两处截断', standard: '标准未规定', sim: '反正弦的自变量截断在 ±1，读数最大 ±90.0°；σ_θ 截断在 45°。本课三个位置都不会触及；胸牌在 4 m 处偏 80° 时，σ_θ 为 15.75°，十四个方位角中有六个被限定在 −90.0°。', kind: 'value' },
    { topic: '天线方向图与多径', standard: '标准未规定', sim: '本仿真器不模拟天线方向图，链路（link）电平与朝向无关；方位角只由几何决定，墙面反射不参与角度测量。所以锚点背后的胸牌仍然收得到，镜像总能读出。', kind: 'choice' },
    { topic: '在哪些帧上测角', standard: '标准未规定', sim: '锚点对胸牌发来的每一帧都测一次方位角。一轮双边测距有两帧（起始帧与结束帧），单边测距加飞行时间报告时也是两帧（起始帧与报告帧），所以每轮两个方位角。', kind: 'choice' },
    { topic: '方位角的零点', standard: '0 弧度为发送设备的正前方（§10.29.8.4）', sim: '以锚点的朝向为零点，与 RMI 的定义一致；胸牌在锚点右侧时方位角为负。', kind: 'faithful' },
    { topic: '本课场景里的报告', standard: 'RRMC 请求，RMI 的 AOA Azimuth 字段报告（§10.29.8.3、§10.29.8.4）', sim: '未实现：本课的场景里没有一帧携带方位角。方位角留在测得它的锚点上，由锚点自己解算位置。俯仰角与 FOM 也未实现。', kind: 'absent' },
    { topic: 'SP3 测距里的报告', standard: 'SRRR 的 RAOA 位请求，方位角放在 RMI 信息单元的到达角字段里（§10.32.9.9、§10.29.8.4）', sim: '照此：SP3 单边测距的应答方在自己的报告帧里，把方位角写进 RMI 信息单元同一个列表元素的 AOA Azimuth 字段（AOA Azimuth Present 置 1，2 字节）。俯仰角与 FOM 未实现。', kind: 'faithful' },
    { topic: '单边测距下的距离', standard: '应答方可以用 RRMC 的 TOF Request 请求飞行时间，发起方用 RMI 的 TOF 字段报告（§10.29.8.3、§10.29.8.4、§10.32.4 图 10-235）', sim: '照此：在「单边测距，请求飞行时间」场景里，锚点在应答帧的 RRMC 信息单元里把 TOF Request 置 1；胸牌在这一轮最后一个时隙广播一帧 RMI 信息单元，带锚点的飞行时间与地址，共 21 字节；飞行时间以 RCTU（ranging counter time unit）为单位，取整数。锚点由此得到距离。', kind: 'faithful' },
    { topic: '飞行时间的取整', standard: 'TOF 字段以 RCTU 为单位、取非负整数（§10.29.8.4、§10.29.1.4），取整方式标准未规定', sim: '胸牌把算出的飞行时间四舍五入到整数 RCTU（约 15.65 ps，即 4.7 mm）。', kind: 'choice' },
    { topic: '定位', standard: '标准不涉及', sim: '锚点把这一轮的距离与较晚的那个方位角配对；距离是斜距，先扣除高度差得到平面距离 √(r² − Δz²)，再从锚点沿「朝向 + θ̂」方向延伸。只用一个锚点，GDOP 恒为 1.00；误差椭圆沿射线方向是距离的 σ，垂直方向是平面距离乘以 σ_θ。', kind: 'choice' },
    { topic: '测距噪声', standard: '标准未规定', sim: '时间戳噪声 100 ps，距离的 σ = c·σ_ts/√2 = 2.12 cm，与定位各课相同。', kind: 'value' },
  ],
  labs: [
    {
      heading: '一轮里的方位角、距离与定位',
      jump: 1,
      steps: [
        '载入本课场景，跳到锚点测出的第一个方位角。',
        '向后找到这一轮结束时同一时刻出现的三行：第二个方位角、距离与定位。',
      ],
      blocks: [
        { kind: 'table', heading: '基准场景第 0 轮的日志', head: ['时刻', '内容'], rows: [
          ['202.508 µs', 'anc-1 AoA ← badge-1: 2.3° (true 0.0°)'],
          ['4.199431 ms', 'anc-1 AoA ← badge-1: 1.8° (true 0.0°)'],
          ['4.199431 ms', 'anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)'],
          ['4.199431 ms', 'anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)'],
        ] },
      ],
      expect: '胸牌发起这一轮后约 0.2 ms，锚点为第一帧测出方位角 2.3°（真值 0.0°）；这一轮结束时，第二个方位角 1.8°、距离 2.30 m 与定位 (4.94, 2.47) m 在同一时刻出现，定位误差 0.07 m，只用 1 个锚点。',
      meaning: '方位角以锚点正前方为零，与 RMI 的定义一致（①）；每帧测角、锚点自己解算位置是本仿真器的取法，这里没有一帧携带方位角（②）。',
    },
    {
      heading: '一个锚点，一次定位：逐步计算',
      jump: 4,
      steps: [
        '跳到一个锚点解出的定位，对照下表从方位角一路算到定位点。',
      ],
      blocks: [
        { kind: 'formula', heading: '两天线模型（本仿真器）', text: 'Δφ = 2π·(d/λ)·sin θ = π·sin θ   （d = λ/2）\nθ̂ = asin(Δφ/π)', note: 'd 是天线间距，λ 是载波波长。' },
        { kind: 'table', heading: 'badge-1，基准场景，第 0 轮', head: ['步骤', '数值'], rows: [
          ['胸牌的真实方位角', '0.000°'],
          ['对应的相位', 'π·sin 0° = 0.000 rad'],
          ['加上一次 σ_φ 随机取值', '0.0984 rad'],
          ['θ̂ = asin(φ/π)', '1.796°'],
          ['这一轮算出的距离', '2.3048 m, true 2.3324'],
          ['扣除 Δz = 1.20 m', '√(2.3048² − 1.20²) = 1.9678 m'],
          ['沿 90° + θ̂ 方向延伸', '(4.938, 2.467) m, true (5.000, 2.500)'],
          ['对应的误差椭圆', 'across 9.4 cm, along 2.1 cm'],
        ] },
      ],
      expect: '较晚的方位角 1.796° 与距离 2.3048 m 配对；扣除 1.20 m 的高度差后平面距离 1.9678 m，沿 90° + 1.796° 延伸得到 (4.938, 2.467) m。误差椭圆垂直于射线 9.4 cm，沿射线 2.1 cm。',
      meaning: '测量模型、配对规则、高度修正与椭圆都是本仿真器的取法（②）；标准只规定方位角怎样请求与报告（①）。',
    },
    {
      heading: '误差横在视线上',
      more: [0, 1],
      steps: [
        '依次载入本课场景、「4 m 处 45°」与「5 m 处 60°」，各运行七轮。',
        '对照下表读出方位角的 σ、横向误差、测距误差与定位误差。',
      ],
      blocks: [
        { kind: 'formula', heading: '方位角的 σ（本仿真器）', text: 'σ_θ = σ_φ / (π·cos θ)      横向 1-σ = 平面距离 × σ_θ', note: 'σ_φ = 0.15 rad。' },
        { kind: 'table', heading: '三个位置，各七轮', head: ['胸牌位置', '真实方位角', 'σ_θ', '横向 1-σ', '测距误差', '定位误差', '椭圆'], rows: [
          ['正前方 2 m', '0.0°', '2.74°', '9.5 cm', '2.0 cm', '2.1–15.6 cm，平均 9.6', '9.4 × 2.1 cm'],
          ['右偏 45°，4 m', '−45.0°', '3.87°', '27.0 cm', '2.0 cm', '5.8–44.5 cm，平均 26.5', '25.7 × 2.1 cm'],
          ['右偏 60°，5 m', '−60.0°', '5.47°', '47.7 cm', '2.0 cm', '10.4–87.7 cm，平均 48.2', '43.1 × 2.1 cm'],
        ] },
      ],
      expect: '三行的测距误差都是 2.0 cm，横向 1-σ 从 9.5 cm 增大到 47.7 cm，平均定位误差随之从 9.6 cm 增大到 48.2 cm；椭圆的短轴始终是 2.1 cm。在中间那个位置上，射频测得的斜距是 4.176 m，平面距离是 4.000 m，不扣除高度差，定位点会偏远 17.6 cm。',
      meaning: '误差的方向来自本仿真器的相位噪声模型与定位方法（②）：距离只决定沿视线的误差，方位角决定横向误差。',
    },
    {
      heading: '锚点背后的胸牌',
      variant: 2,
      steps: [
        '载入「锚点背后」：胸牌没有移动，只是锚点的朝向从 90° 改为 −90°，朝向它所在的那面墙。',
        '读出方位角的真值与读数，再看定位点落在哪里。',
      ],
      expect: '方位角的真值变为 180.0°，而十四个读数与基准场景完全相同，第一个仍是 2.3°；七次定位落在 (5.06, −1.47) m 一带，离胸牌 3.97 到 4.03 m，约为平面距离的两倍，已在房间之外。测距误差仍是 2.0 cm，周围的椭圆与基准场景相同。',
      meaning: 'sin(180° − θ) = sin θ，两根天线分不出正前方与背后（②的测量模型）；本仿真器不模拟天线方向图，所以背后的胸牌仍收得到（②）。标准没有规定测量方法，这不是标准的性质（①）。',
    },
    {
      heading: '单边测距：锚点请求飞行时间',
      variant: 3,
      steps: [
        '载入「单边测距，请求飞行时间」：胸牌与基准场景同一位置，会话改为单边测距。',
        '依次查看第 0 轮的三帧，在检视面板里打开应答帧的 RRMC 信息单元和最后一帧的 RMI 信息单元。',
        '读出锚点的距离与它解出的定位。',
      ],
      blocks: [
        { kind: 'table', heading: '第 0 轮的三帧', head: ['时隙', '发送者', '帧', '长度', '信息单元'], rows: [
          ['0', 'badge-1', 'Poll', '33 B', 'ARC、RR、RDM、RRMC'],
          ['1', 'anc-1', 'Response', '21 B', 'RRMC（TOF Request 1）、RRTI'],
          ['2', 'badge-1', '测量报告', '21 B', 'RMI（TOF Present，anc-1 的飞行时间 472 RCTU）'],
        ] },
      ],
      expect: '胸牌在第 1 号时隙收到应答后算出距离 2.21 m；第 2 号时隙它把飞行时间 472 RCTU 发给锚点，锚点随即写出同一个距离 2.21 m 和定位 (4.94, 2.36) m，误差 0.15 m。七轮的平均定位误差为 13.4 cm，双边测距的基准场景为 9.6 cm。',
      meaning: '应答方用 RRMC 的 TOF Request 请求、发起方用 RMI 的 TOF 字段报告，是标准的单边测距流程（①）；把距离与方位角相交定位是本仿真器的取法（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1（到达角属于测距结果）、§10.29.8.3 与图 10-211（RRMC 信息单元：到达角请求位、TOF 请求位；单边测距中应答方可以请求飞行时间）、§10.29.8.4 与图 10-212、图 10-213（RMI 信息单元：AOA Azimuth、AOA Elevation、FOM 与 TOF 字段，方位角以发送设备正前方为零弧度；天线阵列参数的约定不在标准范围内）、§10.32.9.9（SRRR 信息单元的 RAOA 位）、§10.32.8.2 与 §10.32.8.3（SP3 测距的测量报告阶段用 RMI 发回到达角）。标准不规定到达角的测量方法，也不涉及由距离和角度解算位置。',
    '本仿真器的取值与取法：两根相距半波长的接收天线、σ_φ = 0.15 rad、反正弦的 ±90° 截断与 σ_θ 的 45° 截断、每帧测角、较晚的方位角与距离配对、扣除高度差后定位、100 ps 的时间戳噪声（距离 σ 2.12 cm）。飞行时间四舍五入到整数 RCTU。场景：信道 9、关闭非视距，前四个场景用双边测距，第五个用单边测距并由锚点请求飞行时间（§10.32.4 与图 10-235）。',
  ],
  limits: [],
  scenario: () => uwbAoaScenario('base'),
  variants: [
    { label: '4 m 处 45°', scenario: () => uwbAoaScenario('off45') },
    { label: '5 m 处 60°', scenario: () => uwbAoaScenario('off60') },
    { label: '锚点背后', scenario: () => uwbAoaScenario('behind') },
    { label: '单边测距，请求飞行时间', scenario: () => uwbAoaScenario('ss') },
  ],
  jumps: [
    J('胸牌发起这一轮的 Poll', firstUwbPoll),
    J('锚点由它测出的方位角', firstUwbAoa),
    J('结束这一轮的 Final', firstUwbFinal),
    J('它算出的距离', firstUwbRange),
    J('一个锚点解出的定位', firstUwbAoaFix),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按标准，一个测得的方位角用什么报告？',
      options: [
        '用 RAOA 信息单元',
        '用 RMI 信息单元的 AOA Azimuth 字段，以发送设备的正前方为零弧度；RAOA 只是 SRRR 信息单元里的请求位',
        '标准没有规定到达角怎样报告',
      ],
      answer: 1,
      explain: '§10.29.8.4 定义了 AOA Azimuth 字段；RAOA 是 SRRR 信息单元里请求到达角的那一位（§10.32.9.9）。',
    },
    {
      q: '在本仿真器里，为什么偏向侧面时方位角的不确定性比正前方更大？',
      options: [
        '偏向侧面时信号更弱',
        '相位正比于 sin θ，而正弦越靠近边缘越平缓：σ_φ/(π·cos θ) 正前方 2.74°，60° 处 5.47°',
        '那里的天线间距折算成波长后变大了',
      ],
      answer: 1,
      explain: '这是本仿真器的两天线模型的性质；标准不规定测量方法。',
    },
    {
      q: '锚点朝向自己所在的那面墙时，把身后的胸牌报告为位于正前方。为什么？',
      options: [
        '是 ±90° 的截断使读数折返',
        '正前方的镜像位置产生相同的相位，两根天线无法区分两者',
        '锚点背后的距离测错了',
      ],
      answer: 1,
      explain: '那里的距离与其他位置一样准确，截断也没有触发。真实设备可以让锚点朝向房间内安装，或者增加第三根天线。',
    },
  ],
}
