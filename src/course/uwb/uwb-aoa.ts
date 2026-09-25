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
 * tests/course/uwb-aoa.test.ts; `npx tsx scripts/lesson-dump.ts uwb-aoa en`
 * prints the section budgets.
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
  module: 14,
  title: '一个锚点就够了',
  why: '到这里为止的做法都要三四个锚点，因为单一个距离只能说明胸牌落在某个圆上。可一道门、一个店铺入口，往往只够装一个锚点。给这一个锚点添上第二根天线，它就既能说出胸牌有多远，也能说出它在哪个方向——单凭自己，就能在平面图上钉出一个点。',
  outcomes: [
    '说清两根天线怎样把波前“迟到”的那一点变成一个方位角',
    '从日志里读出一个方位角，和一个锚点独自解出的定位',
    '说出误差属于哪一次测量，以及锚点背后会发生什么',
  ],
  needs: ['uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'AoA', plain: '到达角：一帧信号是从哪个方向过来的，以一个角度报出' },
    { term: 'phase difference', plain: '同一载波在两根天线处相差多少周期：把“迟到”写成角度' },
    { term: 'boresight', plain: '锚点正对的方向；它报出的角度都从这里量起' },
    { term: 'field of view', plain: '两根天线能分辨的方向范围：正前方那半圈' },
  ],
  picture: [
    { heading: '两根天线，一次到达', text: '正对着锚点扑过来的波前，同时到达它的两根接收天线。而从侧面来的波前，到较远那根天线要多走一段，于是晚到一丝丝。这一丝丝在载波上表现为周期上的一点滞后，这就叫相位差；而它背后的那个角度，就是这一帧的到达角（AoA）。' },
    { heading: '模型实际做的事', text: '真实硬件有两路接收，再把两路拿来比。仿真器两路都没有：它算出一对相距半波长的天线在胸牌真实角度上会看到的相位，加上一次接收机噪声的抽样，再把这一个数反解回去。天线间距、波长与阵列，全在这一行里，别处再也找不到。' },
    { kind: 'watch', jump: 1, heading: '看一个方位角到来', text: '载入仿真，跳到第一个方位角。它是从胸牌开场那一帧上量到的，比这一轮量出距离要早得多；那一行同时写着锚点读到的角度和真值。' },
    { heading: '一个圆，一条射线', text: '双向测距本来就在每轮末尾把一个距离交给这个锚点。距离是绕着它画出的圆，方位角是从它射出的一条射线，两者恰好交于一处。于是这个锚点谁也不需要：它自己就把胸牌的位置解了出来。' },
    { heading: '同样的噪声，越偏越贵', text: '两根天线相距半个波长，这是仍能让正前方每个方向各有自己相位的最大间距；这段范围就是视场。靠近正前方时，方位角动一度，相位就动得明显；到了边缘，它几乎不动，因为相位跟着角度的正弦走，而正弦越往边上越平。噪声一样大，疑虑却大得多。' },
    { heading: '一个横在视线上的椭圆', text: '再看这件事对那个点做了什么。距离还是老样子，前后差一两厘米；而方位角在一条长射线的远端，横着值好几十厘米。于是不确定性是一条细长条：沿你望去的方向很短，横过来很长，并随距离和角度一起长大。' },
    { heading: '走出平面距离，而不是斜距', text: '这里面藏着一处修正。方位角是平面图上的角度，而距离量的是到天花板附近那个锚点的斜距。原样平着走出去，每次定位都会稍稍偏远，而且每轮都朝同一方向——这是固定的偏移，不是噪声。所以要先把高度扣掉。' },
    { heading: '它看不见的那一半', text: '而它出大错的地方正在这里。锚点背后的胸牌，其到达相位恰好等于它在正前方的镜像会给出的相位，反正弦手里再没有别的依据，于是报出那个镜像——理直气壮，周围照样画着齐整的椭圆。把锚点转去对着自己那面墙，胸牌一动没动，却被定到了楼外。办法是把锚点朝房间里装，或者加第三根天线。' },
  ],
  numbers: [
    { kind: 'formula', heading: '全部的物理', text: 'Δφ = 2π·(d/λ)·sin θ = π·sin θ   （当 d = λ/2）\nθ̂ = asin(Δφ/π)，截断在 ±90°', note: '整个视场恰好映射到一整圈相位，所以不会卷绕：在信道 9 上，就是 3.75 cm 载波下相距 1.88 cm 的两根天线。噪声可能把自变量推过 ±π，那里反正弦无解，于是模型把它截断。' },
    { kind: 'formula', heading: '一弧度相位值多少角度', text: 'σ_θ = σ_φ / (π·cos θ)', note: 'σ_φ 是模型里的相位噪声，0.15 rad，约合 8.6°。正前方它反解出 2.74° 的方位角噪声；往侧面走它就变大，到视场边缘处发散。' },
    { kind: 'table', heading: '三个位置，各七轮', head: [
      '胸牌站在哪里', '真实方位角',
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
    { text: '这张表要横着读，不要竖着读。三行的测距误差一模一样，而横向误差 rh·σ_θ 涨了五倍，并把定位误差一起带上去。椭圆的两条半轴就是那两次测量，与方位角相差四分之一圈；它的短轴从不移动。' },
    { kind: 'table', heading: '基准场景的一轮，日志怎么印', head: [
      '行', '写的是',
    ], rows: [
      ['首个方位角，197.636 µs 处',
        'anc-1 AoA ← badge-1: 2.3° (true 0.0°)'],
      ['第二个，来自 Final，4.193 534 ms 处',
        'anc-1 AoA ← badge-1: 1.8° (true 0.0°)'],
      ['同一微秒里的距离',
        'anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)'],
      ['两者解出的定位',
        'anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)'],
      ['七轮之后胸牌那一行',
        '(5.13, 2.47) m, true (5.00, 2.50) m, 13.3 cm, GDOP 1.00, ellipse 9.4 × 2.1 cm'],
    ] },
    { text: '把高度修正换成数字：中间那个位置上，射频量到 4.176 m，平面图上是 4.000 m。原样平着走出去，会把点钉远 17.6 cm。' },
    { kind: 'steps', heading: '一个方位角、一次定位，一步一步', items: [
      '胸牌用 Poll 开启一轮 DS-TWR。锚点给 RMARKER 打戳，抽出时间戳噪声，抽出载波偏差残差，最后才去量角度。',
      '它先由自己的坐标和“朝向”算出胸牌的真实方位角：本场景是 0.000°，因为胸牌正站在正前方那条线上。',
      '它算出相距 λ/2 的两根天线在这个角度上会看到的相位，π·sin θ，再加上一次接收机相位噪声的抽样，σ_φ = 0.15 rad。硬件的全部，就是这一次抽样。',
      '再反解回去：θ̂ = asin(φ/π)，截断在 ±90°。于是印出一行 UWB_AOA，旁边写着真值——胸牌每发一帧就有一行，所以一轮两行。',
      '这一轮末尾，锚点算完距离，并把它和靠后的那个方位角配成一对。距离是斜距，方位角是平面上的角，所以真正走出去的那一段是 √(r² − Δz²)。',
      '从锚点沿“朝向 + θ̂”把这一段走出去，就得到那一行定位：只用一个锚点，GDOP 按构造恒为 1.00。它的椭圆由两项组成：沿射线是距离的 2.1 cm，横过射线是这一段乘以 σ_φ/(π·cos θ̂)。',
    ] },
    { kind: 'table', heading: 'badge-1，基准场景，第 0 轮', head: [
      '步骤', '数值',
    ], rows: [
      ['胸牌的真实方位角', '0.000°'],
      ['它会产生的相位', 'π·sin 0° = 0.000 rad'],
      ['加上一次 σ_φ 抽样', '0.0984 rad'],
      ['θ̂ = asin(φ/π)', '1.796°'],
      ['这一轮算出的距离', '2.3048 m, true 2.3324'],
      ['扣掉 Δz = 1.20 m', '√(2.3048² − 1.20²) = 1.9678 m'],
      ['沿 90° + θ̂ 走出去', '(4.938, 2.467) m, true (5.000, 2.500)'],
      ['它带的那个椭圆', 'across 9.4 cm, along 2.1 cm'],
    ] },
  ],
  deeper: [
    { heading: '两处截断在哪里，何时起作用', text: '这个模型里有两处截断，而本课把胸牌放的任何位置都碰不到它们。反正弦的自变量截断在 ±π，所以读数被钉在 ±90.0° 时，说明噪声把相位推过了一整圈。σ_θ 本身也截断在 45°，公式大约在偏离正前方 ±86.5° 处到达这个值，再往外这套线性化什么也描述不了。把胸牌拖到 (8.94, 1.19)——4 m 处偏 80°——两者就都开始起作用：σ_θ 是 15.75°，十四个方位角里有六个被钉在 −90.0°，最差的那个椭圆半长轴达 3.16 m。' },
    { heading: '锚点背后', text: '锚点面朝墙时，胸牌偏离正前方 180.0°，而十四个方位角与基准场景的每一位数字都相同。' },
    { text: '于是七次定位落在 (5.06, −1.47) m 一带，离胸牌 3.97 到 4.03 m——正是平面距离的两倍，已在房间之外。' },
    { heading: '起作用的只是比值', text: '上面的一切都与信道无关。信道 9 的载波是 3.75 cm，天线间距 1.88 cm；信道 5 则是 4.62 cm 与 2.31 cm。由于间距永远是波长的一半，同一个真实角度在两者上产生同样的相位：偏离正前方 45° 时 2.221 rad，60° 时 2.721 rad，视场边缘处恰好是 π——这正是它从不卷绕的原因。而在锚点背后正弦会重复，sin(180° − θ) = sin θ，那就是镜像。' },
    { heading: '检视面板印出的 ± 不是模型的 σ_θ', text: '方位角那一行显示的，是把 σ_θ 代入该行最后一次量到的角度算出的值，而不是代入真值，所以每抽一次样都会变：三个位置上分别读作 ± 2.7°、± 4.3° 与 ± 7.5°，而模型在真实方位角处的 σ_θ 是 2.74°、3.87° 与 5.47°。它老实描述的是最后那次测量，而不是这个位置的属性。旁边那一行距离读作 2.31 m，真值 2.33，差 −2.4 cm，七轮 DS-TWR。' },
    { heading: '为什么定位误差里看不见测距', text: '把每次定位分解成沿“锚点→胸牌”射线的分量与垂直于它的分量。横向上，这些定位就是表里那一列横向误差，相差不到一毫米。纵向上，二十一次定位无一超过 9 cm，不到测距 σ 的四倍——测距干得好好的，只是它的误差在方位角的误差旁边小到看不见。这也是为什么这里的 GDOP 恒为 1.00、无话可说：只有一个锚点，就谈不上布局稀释什么。' },
  ],
  sources: [
    '本课只有一处以标准为依据：IEEE Std 802.15.4-2024 的 §10.29.1.1 把到达角列在一轮测距可以报出的结果之中，所以锚点可以既交回距离，也交回方向。',
    '此后的一切都是仿真器自己的模型取值，风格上接近 FiRa 的各类 profile，而不是标准正文的规定：两根相距半波长的接收天线、σ_φ = 0.15 rad 的相位测量、把它反解回来的反正弦及其 ±90° 截断、σ_θ 的 45° 截断，以及锚点背后的那个镜像。',
    '2.12 cm 的测距 σ 与定位那几课用的是同一个模型取值：σ_r = c · σ_ts / √2，代入 100 ps 的时间戳噪声。场景自己的取值是信道 9、双边测距会话与没有遮挡；若改用单边测距，锚点只会握着一个方位角，永远算不出可与之相交的距离。',
  ],
  scenario: () => uwbAoaScenario('base'),
  variants: [
    { label: '4 m 处 45°', scenario: () => uwbAoaScenario('off45') },
    { label: '5 m 处 60°', scenario: () => uwbAoaScenario('off60') },
    { label: '锚点背后', scenario: () => uwbAoaScenario('behind') },
  ],
  jumps: [
    J('胸牌用来开场的 Poll', firstUwbPoll),
    J('锚点由它测出的方位角', firstUwbAoa),
    J('结束这一轮的 Final', firstUwbFinal),
    J('它算出的距离', firstUwbRange),
    J('一个锚点解出的定位', firstUwbAoaFix),
  ],
  observe: [
    '胸牌开启这一轮；五分之一毫秒后，锚点给那一帧打上时间戳、读出相位，并印出一个方位角，旁边写着真值。它对来自胸牌的每一帧都这么做，所以一轮留下两个方位角。',
    '这一轮末尾有三行一起落下：第二个方位角、那个距离，以及用这一对解出的位置——用的总是靠后那个方位角，它与被相交的距离测得的时刻最近。打开胸牌，定位就在它这条泳道里，一条琥珀色方位线伸向那个十字。',
  ],
  tryThis: [
    '载入“4 m 处 45°”，再载入“5 m 处 60°”。看着椭圆一路拉长而短轴纹丝不动，平均定位误差从几厘米涨到接近半米，而测距误差一点没动。',
    '载入“锚点背后”。变的只有锚点的“朝向”，于是它现在望着自己那面墙。方位角还是你刚读过的那些，定位却跑到了楼外。把“朝向”调回去，误差就回到几厘米。',
  ],
  quiz: [
    {
      q: '为什么偏到侧面时，方位角比正前方更不确定？',
      options: [
        '偏到侧面信号更弱',
        '相位正比于 sin θ，而它越靠边越平：σ_φ/(π·cos θ) 正前方 2.74°，60° 处 5.47°',
        '那里天线间距折算成波长变大了',
      ],
      answer: 1,
      explain: '在视场边缘，方位角动一度也几乎不改变相位，于是反解把噪声放大了。',
    },
    {
      q: '最远那个位置上定位平均偏 48 cm，它的距离却准到 2 cm。误差在哪里？',
      options: [
        '在垂直视线的方向上：rh·σ_θ 是 47.7 cm，正是椭圆的长轴',
        '在沿视线的方向上，因为斜距更长',
        '均匀分布，没有偏好方向',
      ],
      answer: 0,
      explain: '两次测量彼此无关、大小悬殊，所以误差是有方向的。',
    },
    {
      q: '面朝自己那面墙时，锚点把身后的胸牌报成在正前方。为什么？',
      options: [
        '是 ±90° 的截断把读数折了回来',
        '正前方的镜像会给出同样的相位，而两根天线分辨不出两者',
        '锚点背后的距离测错了',
      ],
      answer: 1,
      explain: '那里的距离和别处一样准，截断也根本没触发。办法是把锚点朝房间里装，或者加第三根天线。',
    },
  ],
}
