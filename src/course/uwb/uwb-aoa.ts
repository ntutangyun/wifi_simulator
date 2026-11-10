/**
 * UWB Tier 2 · M14 · Other ranging modes · One anchor is enough.
 *
 * Every other mode in this course needs three or four anchors, because a time
 * of flight is a circle and it takes three circles to meet in a point. This
 * lesson gives the anchor a second antenna instead. The phase difference
 * between the two is a bearing, and a bearing crossed with the anchor's own
 * range meets the tag in exactly one place — one anchor, one position.
 *
 * What the lesson is really about is the shape of the error. The range keeps
 * the 2.12 cm sigma of the positioning lessons; the bearing's 2.74° at
 * boresight is worth 9.5 cm of cross-range at 2 m, 27.0 cm at 4 m and 45°, and
 * 47.7 cm at 5 m and 60° — so the error ellipse is a sliver lying *across* the
 * line of sight, growing with distance and with angle while the range error
 * does not. The last variant shows the price of two antennas: a badge directly
 * behind the anchor arrives with the phase of its own reflection in the
 * boresight, and the fix lands about 4 m away, outside the room.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the two
 * antennas and the shape of the error in plain words first, the exact angles,
 * the log lines and the ellipses after them, the clamp and the field-of-view
 * arithmetic in `deeper`, the one clause and the model's own constants in
 * `sources`. Every number quoted below is pinned in
 * tests/course/uwb-aoa.test.ts; `npx tsx scripts/lesson-dump.ts uwb-aoa`
 * prints it with its length.
 */
import type { NodeCfg, Scenario } from '../../model/scenario'
import { J, anchor, firstUwbAoa, firstUwbAoaFix, firstUwbFinal, firstUwbPoll, firstUwbRange, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Which spot the badge stands on, and which way the anchor faces. */
export type UwbAoaVariant = 'base' | 'off45' | 'off60' | 'behind'

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
 * Where the badge stands, as an angle off the anchor's boresight and a horizontal
 * distance. The boresight is +y and `yawDeg` counts counter-clockwise, so a badge to
 * the anchor's *right* — which is where all three of these stand, to keep them inside
 * the 10 m room — has a negative azimuth. x = 5 + r·sin θ, y = 0.5 + r·cos θ puts it
 * there exactly, which is why the records come back at −45.000° and −60.000° rather
 * than at whatever a rounded coordinate would have produced.
 */
export const SPOTS: Record<UwbAoaVariant, { offBoresightDeg: number; rangeM: number }> = {
  base: { offBoresightDeg: 0, rangeM: 2 },
  off45: { offBoresightDeg: 45, rangeM: 4 },
  off60: { offBoresightDeg: 60, rangeM: 5 },
  behind: { offBoresightDeg: 0, rangeM: 2 },
}

/** The badge's plan coordinates for a variant: the polar spot, laid out to the anchor's right. */
export function tagXY(variant: UwbAoaVariant): { x: number; y: number } {
  const { offBoresightDeg, rangeM } = SPOTS[variant]
  const rad = offBoresightDeg * (Math.PI / 180)
  return { x: ANCHOR_X + rangeM * Math.sin(rad), y: ANCHOR_Y + rangeM * Math.cos(rad) }
}

/** An anchor that knows which way it is pointing: `anchor()` plus the AoA boresight. */
function aoaAnchor(yawDeg: number): NodeCfg {
  const a = anchor('anc-1', 'Anchor', ANCHOR_X, ANCHOR_Y, ANCHOR_Z)
  return { ...a, uwb: { ...a.uwb!, yawDeg } }
}

/**
 * One anchor and one badge on a DS-TWR session with angle of arrival on, channel 9,
 * NLOS off and both crystals drawn rather than set. DS is not optional here: an SS
 * round ends at the badge and the anchor never computes a range at all, so it would
 * hold a bearing with nothing to cross it against.
 *
 * Only the badge's spot and the anchor's facing change between variants.
 */
export function uwbAoaScenario(variant: UwbAoaVariant = 'base'): Scenario {
  const p = tagXY(variant)
  return uwbSc(
    oneRoom(),
    [aoaAnchor(variant === 'behind' ? YAW_WALL : YAW_IN), uwbTag('badge-1', 'Badge 1', p.x, p.y, TAG_Z)],
    { method: 'ds', mode: 'twr', aoa: true, channel: 9, nlos: false },
  )
}

export const uwbAoa: Lesson = {
  id: 'uwb-aoa',
  module: 26,
  title: '只需一个锚点',
  why: '到目前为止的做法都需要三四个锚点（anchor），因为单个距离只能说明胸牌位于某个圆上。而一道门、一个店铺入口，往往只能安装一个锚点。给这个锚点增加第二根天线（antenna），它就既能测出胸牌的距离，也能测出胸牌的方向——仅凭自身就能在平面图上确定一个点。从侧面到来的波前到达较远那根天线时要多传播一段距离，在载波上表现为相位差（phase difference）；两根天线相距半个波长时，正前方半个圆周内的每个方向各对应唯一的相位，反解即得到到达角（AoA）。方位角确定从锚点出发的一条射线，这一轮测出的距离确定以锚点为圆心的一个圆，两者只交于一点。但这个点的误差具有方向性：距离精确到一两厘米，方位角却越偏离正前方越不准确——相位随角度的正弦变化，越靠近边缘变化越平缓，同样的噪声会造成更大的角度误差，再乘以距离，横向误差就达到几十厘米。所以误差椭圆是一个垂直于视线的细长形状，沿视线方向很短、垂直方向很长，偏离越大、距离越远就越长。还有两处需要注意：距离是到天花板上锚点的斜距，要先扣除高度差再在平面图上沿方位角延伸，否则每次定位都偏远；锚点背后的胸牌产生的相位与它在正前方的镜像位置完全相同，于是始终被定位到镜像位置，甚至楼外，而周围的误差椭圆依然规整，没有任何预警。解决办法是让锚点朝向房间内安装，或者增加第三根天线。',
  outcomes: [
    '说清两根天线如何把波前的到达时延转换为一个方位角',
    '从日志中读出一个方位角，以及单个锚点独立解出的定位',
    '说明误差来自哪一项测量，以及胸牌位于锚点背后时会发生什么',
  ],
  needs: ['uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'AoA', plain: '到达角：一帧信号的到达方向，以一个角度表示' },
    { term: 'phase difference', plain: '同一载波在两根天线处的相位之差：用角度表示的到达时延' },
    { term: 'boresight', plain: '锚点正对的方向；它报告的角度都以此为零点' },
    { term: 'field of view', plain: '两根天线能够分辨的方向范围：正前方的半个圆周' },
  ],
  picture: [
    { heading: '两根天线，一次到达', text: '正对锚点到来的波前，同时到达它的两根接收天线。而从侧面到来的波前，到达较远那根天线时要多传播一段距离，因而稍晚到达。这段时延在载波上表现为相位滞后，称为相位差（phase difference）；而与之对应的角度，就是这一帧的到达角（AoA）。' },
    { heading: '从相位差到角度', text: '真实硬件有两路接收通道，比较两路的载波相位。两根天线相距半个波长时，这个相位差等于 π 乘以到达角的正弦；测得的值中还含有接收机的噪声，再用反正弦把它换算回角度。本课把这项噪声取为固定值，这是模型取值，标准没有规定这个数。' },
    { kind: 'watch', jump: 1, heading: '观察第一个方位角', text: '载入仿真，跳到第一个方位角。它是在胸牌发起这一轮的第一帧上测得的，比这一轮测出距离的时刻早得多；那一行同时给出锚点读到的角度和真值。' },
    { heading: '一个圆，一条射线', text: '双向测距本来就在每轮末尾为这个锚点提供一个距离。距离确定以它为圆心的一个圆，方位角确定从它出发的一条射线，两者恰好交于一点。于是这个锚点无需其他锚点：它自己就能解出胸牌的位置。' },
    { heading: '同样的噪声，偏离越大越不准确', text: '两根天线相距半个波长，这是仍能使正前方每个方向各对应唯一相位的最大间距；这个方向范围就是视场（field of view）。靠近正前方时，方位角变化一度，相位变化明显；到了边缘，相位几乎不变，因为相位随角度的正弦变化，而正弦越靠近边缘越平缓。噪声大小相同，角度误差却大得多。' },
    { heading: '一个垂直于视线的椭圆', text: '再看这对定位点有什么影响。距离误差仍然只有一两厘米；而方位角误差在长射线的远端，横向可达几十厘米。于是不确定区域是一个细长形状：沿视线方向很短，垂直方向很长，并随距离和角度一起增大。' },
    { heading: '沿方位角延伸平面距离，而不是斜距', text: '这里需要一处修正。方位角是平面图上的角度，而测得的距离是到天花板附近锚点的斜距。如果直接在平面上沿方位角延伸这个斜距，每次定位都会略微偏远，而且每轮都朝同一方向——这是固定偏移，不是噪声。所以要先扣除高度差。' },
    { heading: '它无法分辨的另一半', text: '而它产生严重错误的情形正在这里。锚点背后的胸牌，其到达相位恰好等于它在正前方的镜像位置产生的相位，反正弦没有其他依据可用，于是报告那个镜像位置——周围依然画着规整的椭圆，看不出任何异常。把锚点转向它所在的那面墙，胸牌位置没有任何变化，却被定位到楼外。解决办法是让锚点朝向房间内安装，或者增加第三根天线。' },
  ],
  numbers: [
    { kind: 'formula', heading: '全部物理关系', text: 'Δφ = 2π·(d/λ)·sin θ = π·sin θ   （当 d = λ/2）\nθ̂ = asin(Δφ/π)，截断在 ±90°', note: '整个视场恰好映射到一个完整的相位周期，所以不会发生相位卷绕：在信道 9 上，就是 3.75 cm 载波下相距 1.88 cm 的两根天线。噪声可能使自变量超出 ±π，此时反正弦无解，于是模型将其截断。' },
    { kind: 'formula', heading: '一弧度相位折合多少角度', text: 'σ_θ = σ_φ / (π·cos θ)', note: 'σ_φ 是模型里的相位噪声，0.15 rad，约合 8.6°。正前方它反解出 2.74° 的方位角噪声；向侧面偏离时它随之增大，到视场边缘处发散。' },
    { kind: 'table', heading: '三个位置，各七轮', head: [
      '胸牌位置', '真实方位角',
      'σ_θ', '横向 1-σ',
      '测距误差', '定位误差',
      '椭圆',
    ], rows: [
      ['正前方 2 m', '0.0°', '2.74°', '9.5 cm', '2.0 cm',
        '2.1–15.6 cm，平均 9.6', '9.4 × 2.1 cm'],
      ['右偏 45°，4 m', '−45.0°', '3.87°', '27.0 cm', '2.0 cm',
        '5.8–44.5 cm，平均 26.5', '25.7 × 2.1 cm'],
      ['右偏 60°，5 m', '−60.0°', '5.47°', '47.7 cm', '2.0 cm',
        '10.4–87.7 cm，平均 48.2', '43.1 × 2.1 cm'],
    ] },
    { text: '这张表应横向阅读，而不是纵向阅读。三行的测距误差完全相同，而横向误差 rh·σ_θ 增大到五倍，定位误差随之增大。椭圆的两条半轴分别对应这两项测量，与方位角相差四分之一圆周；它的短轴始终不变。' },
    { kind: 'table', heading: '基准场景的一轮，日志输出的内容', head: [
      '行', '内容',
    ], rows: [
      ['首个方位角，197.636 µs 处',
        'anc-1 AoA ← badge-1: 2.3° (true 0.0°)'],
      ['第二个，来自 Final，4.193 534 ms 处',
        'anc-1 AoA ← badge-1: 1.8° (true 0.0°)'],
      ['同一微秒内的距离',
        'anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)'],
      ['由两者解出的定位',
        'anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)'],
      ['七轮之后胸牌的那一行',
        '(5.13, 2.47) m, true (5.00, 2.50) m, 13.3 cm, GDOP 1.00, ellipse 9.4 × 2.1 cm'],
    ] },
    { text: '用数字说明高度修正：在中间那个位置上，射频测得 4.176 m，平面图上是 4.000 m。如果直接在平面上延伸斜距，定位点会偏远 17.6 cm。' },
    { kind: 'steps', heading: '一个方位角、一次定位，一步一步', items: [
      '胸牌用 Poll 开启一轮双边双向测距（DS-TWR）。锚点为 RMARKER（ranging marker）打上时间戳，并在同一帧上测量角度。',
      '方位角以锚点的“朝向”为零点。胸牌的真实方位角在本场景是 0.000°，因为它正站在正前方那条线上。',
      '相距 λ/2 的两根天线在这个角度上看到的相位差是 π·sin θ，测得的值还要加上接收机的相位噪声。本课取 σ_φ = 0.15 rad，标准没有规定这个数。',
      '再反解：θ̂ = asin(φ/π)，截断在 ±90°。于是输出一行 UWB_AOA，旁边标有真值——胸牌每发送一帧就有一行，所以一轮有两行。',
      '在这一轮末尾，锚点算出距离，并把它与较晚的那个方位角配对。距离是斜距，方位角是平面上的角度，所以实际沿方位角延伸的长度是 √(r² − Δz²)。',
      '从锚点沿“朝向 + θ̂”方向延伸这一长度，就得到那一行定位：只用一个锚点，GDOP 按构造恒为 1.00。它的误差椭圆由两项组成：沿射线方向是距离的 2.1 cm，垂直于射线方向是这一长度乘以 σ_φ/(π·cos θ̂)。',
    ] },
    { kind: 'table', heading: 'badge-1，基准场景，第 0 轮', head: [
      '步骤', '数值',
    ], rows: [
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
  deeper: [
    { heading: '两处截断在哪里，何时起作用', text: '这个模型中有两处截断，而本课放置胸牌的任何位置都不会触及它们。反正弦的自变量截断在 ±π，所以读数被限定在 ±90.0° 时，说明噪声使相位超出了一个完整周期的范围。σ_θ 本身也截断在 45°，公式大约在偏离正前方 ±86.5° 处达到这个值，再往外这种线性化就失去意义。把胸牌拖到 (8.94, 1.19)——4 m 处偏 80°——两处截断就都开始起作用：σ_θ 是 15.75°，十四个方位角中有六个被限定在 −90.0°，最差的那个椭圆半长轴达 3.16 m。' },
    { heading: '锚点背后', text: '锚点面朝墙时，胸牌偏离正前方 180.0°，而十四个方位角与基准场景逐位相同。' },
    { text: '于是七次定位落在 (5.06, −1.47) m 一带，离胸牌 3.97 到 4.03 m——正是平面距离的两倍，已在房间之外。' },
    { heading: '起作用的只是间距与波长之比', text: '上面的一切都与信道无关。信道 9 的载波是 3.75 cm，天线间距 1.88 cm；信道 5 则是 4.62 cm 与 2.31 cm。由于间距始终是波长的一半，同一个真实角度在两者上产生相同的相位：偏离正前方 45° 时 2.221 rad，60° 时 2.721 rad，视场边缘处恰好是 π——这正是它从不发生相位卷绕的原因。而在锚点背后，正弦值会重复，sin(180° − θ) = sin θ，这就是镜像的来源。' },
    { heading: '检视面板显示的 ± 不是模型的 σ_θ', text: '方位角那一行显示的，是把该行最后一次测得的角度代入 σ_θ 公式算出的值，而不是代入真值，所以每次随机取值后都会变化：三个位置上分别读作 ± 2.7°、± 4.3° 与 ± 7.5°，而模型在真实方位角处的 σ_θ 是 2.74°、3.87° 与 5.47°。它准确描述的是最后那次测量，而不是这个位置的属性。旁边那一行距离读作 2.31 m，真值 2.33，差 −2.4 cm，七轮 DS-TWR。' },
    { heading: '为什么定位误差中看不出测距误差', text: '把每次定位误差分解为沿“锚点→胸牌”射线的分量与垂直于射线的分量。横向分量与表中那一列横向误差相差不到一毫米。纵向分量中，二十一次定位无一超过 9 cm，不到测距 σ 的四倍——测距本身没有问题，只是它的误差与方位角误差相比小到可以忽略。这也是为什么这里的 GDOP 恒为 1.00、不提供任何信息：只有一个锚点，就谈不上布局造成的精度稀释。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '本课的锚点并没有两路接收通道。它的方位角是这样得到的：由真实方位角算出一对半波长间距天线会测得的相位，加上噪声，再反解——没有两条接收链、没有天线相位中心标定、没有阵元互耦。本课也没有天线方向图：链路电平只由几何与墙体决定，与朝向无关。所以在「锚点背后」那个场景中，把锚点转向墙面，链路电平完全不变；而真实的双阵元阵列在背面的增益要低十几个分贝，那个镜像很可能根本无法读出。' },
    { kind: 'model-value', text: 'σ_φ = 0.15 rad 是本课固定取的一个数，在会话中无法调整，而且它不随链路质量变化。同一次接收中，时间戳的 1σ 会按信干噪比放大最多十倍，相位噪声却保持不变。于是把胸牌拖到覆盖边缘时，距离测量变差，而方位角的精度保持不变。真实的相位差估计会随信噪比一起变差，而且它取决于接收机——换一款前端，本课那三个 σ_θ 就都需要重新测量。' },
    { kind: 'unmodelled', text: '多径在这里对方位角毫无影响。本课的方位角只由真实方位角决定，不考虑链路是否被遮挡；房间里的物体即使产生回波，回波也不参与角度测量，而本课这四个场景本来就没有放置任何反射物体。于是无论是否开启遮挡、房间里有什么物体，方位角都完全相同——本课的场景直接关闭了遮挡。而室内到达角最大的误差来源正是从墙上反射过来的那一路：它带有一个与直射方向毫无关系的相位，会使读数偏离几十度，这是本课无法演示的一类失败。' },
    { kind: 'threshold', text: '两处硬截断取代了两条发散的曲线。本课把反正弦的自变量限定在 ±1，于是噪声使相位超出一个完整周期时，读数被限定为 ±90.0°；又把 σ_θ 限定在 45°。真实接收机在视场边缘并不是「读数停在边缘」，而是给出一个发散且有偏的估计，甚至根本无法判定方向。本课放置胸牌的三个位置都不会触及这两处截断，所以它们在这一课中不可见。' },
  ],
  sources: [
    '本课只有一处以标准为依据：IEEE Std 802.15.4-2024 的 §10.29.1.1 把到达角列在一轮测距可以报出的结果之中，所以锚点既可以报告距离，也可以报告方向。',
    '此外的一切都是本仿真器的模型取值，风格上接近 FiRa 的各类 profile，而不是标准正文的规定：两根相距半波长的接收天线、σ_φ = 0.15 rad 的相位测量、把它反解回来的反正弦及其 ±90° 截断、σ_θ 的 45° 截断，以及锚点背后的那个镜像。',
    '2.12 cm 的测距 σ 与定位那几课用的是同一个模型取值：σ_r = c · σ_ts / √2，代入 100 ps 的时间戳噪声。场景自己的取值是信道 9、双边测距会话与没有遮挡；若改用单边测距，锚点只有一个方位角，永远算不出可与之相交的距离。',
  ],
  scenario: () => uwbAoaScenario('base'),
  variants: [
    { label: '4 m 处 45°', scenario: () => uwbAoaScenario('off45') },
    { label: '5 m 处 60°', scenario: () => uwbAoaScenario('off60') },
    { label: '锚点背后', scenario: () => uwbAoaScenario('behind') },
  ],
  jumps: [
    J('胸牌发起这一轮的 Poll', firstUwbPoll),
    J('锚点由它测出的方位角', firstUwbAoa),
    J('结束这一轮的 Final', firstUwbFinal),
    J('它算出的距离', firstUwbRange),
    J('一个锚点解出的定位', firstUwbAoaFix),
  ],
  observe: [
    '胸牌开启这一轮；五分之一毫秒后，锚点为那一帧打上时间戳、读出相位，并输出一个方位角，旁边标有真值。它对来自胸牌的每一帧都这样处理，所以一轮产生两个方位角。',
    '在这一轮末尾同时出现三行：第二个方位角、那个距离，以及由这一对数据解出的位置——使用的总是较晚的那个方位角，它与参与相交的距离的测量时刻最接近。打开胸牌，定位就在它的泳道中，一条琥珀色方位线指向那个十字。',
  ],
  tryThis: [
    '载入“4 m 处 45°”，再载入“5 m 处 60°”。可以看到椭圆不断拉长而短轴保持不变，平均定位误差从几厘米增大到接近半米，而测距误差没有变化。',
    '载入“锚点背后”。改变的只有锚点的“朝向”，于是它现在朝向自己所在的那面墙。方位角仍是刚才读到的那些，定位却偏移到楼外。把“朝向”调回原值，误差就恢复到几厘米。',
  ],
  quiz: [
    {
      q: '为什么偏向侧面时，方位角的不确定性比正前方更大？',
      options: [
        '偏向侧面时信号更弱',
        '相位正比于 sin θ，而正弦越靠近边缘越平缓：σ_φ/(π·cos θ) 正前方 2.74°，60° 处 5.47°',
        '那里的天线间距折算成波长后变大了',
      ],
      answer: 1,
      explain: '在视场边缘，方位角变化一度也几乎不改变相位，于是反解放大了噪声。',
    },
    {
      q: '最远那个位置上定位平均偏离 48 cm，而距离误差只有 2 cm。误差在哪个方向上？',
      options: [
        '在垂直视线的方向上：rh·σ_θ 是 47.7 cm，正是椭圆的长轴',
        '在沿视线的方向上，因为斜距更长',
        '均匀分布，没有特定方向',
      ],
      answer: 0,
      explain: '两项测量彼此独立、误差大小悬殊，所以误差具有方向性。',
    },
    {
      q: '锚点朝向自己所在的那面墙时，把身后的胸牌报告为位于正前方。为什么？',
      options: [
        '是 ±90° 的截断使读数折返',
        '正前方的镜像位置会产生相同的相位，而两根天线无法区分两者',
        '锚点背后的距离测错了',
      ],
      answer: 1,
      explain: '那里的距离与其他位置一样准确，截断也根本没有触发。解决办法是让锚点朝向房间内安装，或者增加第三根天线。',
    },
  ],
}
