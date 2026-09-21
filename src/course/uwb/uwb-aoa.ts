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
import {
  J, N, anchor, firstUwbAoa, firstUwbAoaFix, firstUwbFinal, firstUwbPoll, firstUwbRange,
  oneRoom, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

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
  title: { en: 'One anchor is enough', zh: '一个锚点就够了' },
  why: {
    en: 'Everything so far has needed three or four anchors, because a distance alone only says the badge is somewhere on a circle. A doorway or a shop entrance often has room for one. Give that anchor a second antenna and it can say which way the badge lies as well as how far — a point on the plan, on its own.',
    zh: '到这里为止的做法都要三四个锚点，因为单一个距离只能说明胸牌落在某个圆上。可一道门、一个店铺入口，往往只够装一个锚点。给这一个锚点添上第二根天线，它就既能说出胸牌有多远，也能说出它在哪个方向——单凭自己，就能在平面图上钉出一个点。',
  },
  outcomes: [
    { en: 'say how two antennas turn a wavefront’s lateness into a bearing', zh: '说清两根天线怎样把波前“迟到”的那一点变成一个方位角' },
    { en: 'read a bearing and a one-anchor fix off the log', zh: '从日志里读出一个方位角，和一个锚点独自解出的定位' },
    { en: 'say which measurement the error belongs to, and what happens behind the anchor', zh: '说出误差属于哪一次测量，以及锚点背后会发生什么' },
  ],
  needs: ['uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'AoA', plain: {
      en: 'angle of arrival: which direction a frame came in from, reported as an angle',
      zh: '到达角：一帧信号是从哪个方向过来的，以一个角度报出',
    } },
    { term: 'phase difference', plain: {
      en: 'how far apart in its cycle one carrier is at two antennas: lateness, as an angle',
      zh: '同一载波在两根天线处相差多少周期：把“迟到”写成角度',
    } },
    { term: 'boresight', plain: {
      en: 'the direction the anchor faces; every angle it reports starts there',
      zh: '锚点正对的方向；它报出的角度都从这里量起',
    } },
    { term: 'field of view', plain: {
      en: 'the span of directions two antennas can tell apart: the half-circle in front',
      zh: '两根天线能分辨的方向范围：正前方那半圈',
    } },
  ],
  picture: [
    { heading: { en: 'Two antennas, one arrival', zh: '两根天线，一次到达' }, text: {
      en: 'A wavefront coming straight at the anchor reaches both of its receive antennas at once. One from off to the side has further to go to the far antenna and arrives a sliver later. That sliver shows up in the carrier as a phase difference, and the angle behind it is that frame’s angle of arrival, AoA.',
      zh: '正对着锚点扑过来的波前，同时到达它的两根接收天线。而从侧面来的波前，到较远那根天线要多走一段，于是晚到一丝丝。这一丝丝在载波上表现为相位差，而它背后的那个角度，就是这一帧的到达角，AoA。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Watch one arrive', zh: '看一个方位角到来' }, text: {
      en: 'Load the simulation and jump to the first bearing. It comes off the badge’s opening frame, long before the round has measured any distance, and the line names both the angle the anchor read and the truth.',
      zh: '载入仿真，跳到第一个方位角。它是从胸牌开场那一帧上量到的，比这一轮量出距离要早得多；那一行同时写着锚点读到的角度和真值。',
    } },
    { heading: { en: 'A circle and a ray', zh: '一个圆，一条射线' }, text: {
      en: 'Two-way ranging already hands this anchor a distance every round. A distance is a circle round the anchor, a bearing a ray leaving it, and the two cross in exactly one place. So the anchor needs nobody else: it solves the badge’s position by itself.',
      zh: '双向测距本来就在每轮末尾把一个距离交给这个锚点。距离是绕着它画出的圆，方位角是从它射出的一条射线，两者恰好交于一处。于是这个锚点谁也不需要：它自己就把胸牌的位置解了出来。',
    } },
    { heading: { en: 'The same noise costs more degrees off to the side', zh: '同样的噪声，越偏越贵' }, text: {
      en: 'The antennas sit half a wavelength apart, the widest spacing that still gives every direction in front its own phase; that span is the field of view. Near the boresight a degree of azimuth moves the phase a lot; near the edge it hardly moves it, because phase follows the sine of the angle and a sine flattens.',
      zh: '两根天线相距半个波长，这是仍能让正前方每个方向各有自己相位的最大间距；这段范围就是视场。靠近正前方时，方位角动一度，相位就动得明显；到了边缘，它几乎不动，因为相位跟着角度的正弦走，而正弦越往边上越平。噪声一样大，疑虑却大得多。',
    } },
    { heading: { en: 'An ellipse across the line of sight', zh: '一个横在视线上的椭圆' }, text: {
      en: 'Watch what that does to the point. The distance is as good as ever, a couple of centimetres either way, while the bearing is worth tens of centimetres sideways at the far end of a long ray. So the uncertainty is a sliver: short along your line of sight, long across it, growing with distance and angle.',
      zh: '再看这件事对那个点做了什么。距离还是老样子，前后差一两厘米；而方位角在一条长射线的远端，横着值好几十厘米。于是不确定性是一条细长条：沿你望去的方向很短，横过来很长，并随距离和角度一起长大。',
    } },
    { heading: { en: 'Walk out the floor distance, not the slant', zh: '走出平面距离，而不是斜距' }, text: {
      en: 'One correction hides in that. The bearing is a flat, floor-plan angle, while the distance is measured up to an anchor near the ceiling. Walked out flat it would plant every point slightly too far away, the same way every round — an offset, not noise. So the height comes out of it first.',
      zh: '这里面藏着一处修正。方位角是平面图上的角度，而距离量的是到天花板附近那个锚点的斜距。原样平着走出去，每次定位都会稍稍偏远，而且每轮都朝同一方向——这是固定的偏移，不是噪声。所以要先把高度扣掉。',
    } },
    { heading: { en: 'The half it cannot see', zh: '它看不见的那一半' }, text: {
      en: 'And here is where it fails. A badge behind the anchor arrives with exactly the phase its mirror image in front would produce, and an arc sine has nothing else to go on: it reports the mirror, confidently, with the same tidy ellipse around it. Face the anchor at its own wall and the badge, which has not moved, is located outside the building. Aim anchors into the room, or add an antenna.',
      zh: '而它出大错的地方正在这里。锚点背后的胸牌，其到达相位恰好等于它在正前方的镜像会给出的相位，反正弦手里再没有别的依据，于是报出那个镜像——理直气壮，周围照样画着齐整的椭圆。把锚点转去对着自己那面墙，胸牌一动没动，却被定到了楼外。办法是把锚点朝房间里装，或者加第三根天线。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'The whole of the physics', zh: '全部的物理' }, text: {
      en: 'Δφ = 2π·(d/λ)·sin θ = π·sin θ   (at d = λ/2)\nθ̂ = asin(Δφ/π),  clamped to ±90°',
      zh: 'Δφ = 2π·(d/λ)·sin θ = π·sin θ   （当 d = λ/2）\nθ̂ = asin(Δφ/π)，截断在 ±90°',
    }, note: {
      en: 'The whole field of view maps onto one turn of phase, so nothing wraps: on channel 9, antennas 1.88 cm apart under a 3.75 cm carrier. Noise can push the argument past ±π, where the arc sine has no answer, so the model clamps it.',
      zh: '整个视场恰好映射到一整圈相位，所以不会卷绕：在信道 9 上，就是 3.75 cm 载波下相距 1.88 cm 的两根天线。噪声可能把自变量推过 ±π，那里反正弦无解，于是模型把它截断。',
    } },
    { kind: 'formula', heading: { en: 'What a radian of phase is worth', zh: '一弧度相位值多少角度' }, text: {
      en: 'σ_θ = σ_φ / (π·cos θ)',
      zh: 'σ_θ = σ_φ / (π·cos θ)',
    }, note: {
      en: 'σ_φ is the model’s phase noise, 0.15 rad or about 8.6°. Straight ahead it inverts to 2.74° of bearing noise; off to the side the cosine shrinks, the quotient grows, and at the edge it diverges.',
      zh: 'σ_φ 是模型里的相位噪声，0.15 rad，约合 8.6°。正前方它反解出 2.74° 的方位角噪声；往侧面走，余弦变小、商就变大，到视场边缘处发散。',
    } },
    { kind: 'table', heading: { en: 'Three spots, seven rounds each', zh: '三个位置，各七轮' }, head: [
      { en: 'Where the badge stands', zh: '胸牌站在哪里' }, { en: 'True bearing', zh: '真实方位角' },
      { en: 'σ_θ', zh: 'σ_θ' }, { en: 'Cross-range 1-σ', zh: '横向 1-σ' },
      { en: 'Range error', zh: '测距误差' }, { en: 'Fix error', zh: '定位误差' },
      { en: 'Ellipse', zh: '椭圆' },
    ], rows: [
      [{ en: 'Straight ahead, 2 m', zh: '正前方 2 m' }, N('0.0°'), N('2.74°'), N('9.5 cm'), N('2.0 cm'),
        { en: '2.1–15.6 cm, mean 9.6', zh: '2.1–15.6 cm，平均 9.6' }, N('9.4 × 2.1 cm')],
      [{ en: '45° to its right, 4 m', zh: '右偏 45°，4 m' }, N('−45.0°'), N('3.87°'), N('27.0 cm'), N('2.0 cm'),
        { en: '5.8–44.5 cm, mean 26.5', zh: '5.8–44.5 cm，平均 26.5' }, N('25.7 × 2.1 cm')],
      [{ en: '60° to its right, 5 m', zh: '右偏 60°，5 m' }, N('−60.0°'), N('5.47°'), N('47.7 cm'), N('2.0 cm'),
        { en: '10.4–87.7 cm, mean 48.2', zh: '10.4–87.7 cm，平均 48.2' }, N('43.1 × 2.1 cm')],
    ] },
    { text: {
      en: 'Read that table across, not down. The range error is the same in all three rows, while the cross-range error rh·σ_θ grows fivefold and takes the fix error with it. The ellipse is those two measurements as semi-axes, a quarter turn from the bearing; its short axis never moves.',
      zh: '这张表要横着读，不要竖着读。三行的测距误差一模一样，而横向误差 rh·σ_θ 涨了五倍，并把定位误差一起带上去。椭圆的两条半轴就是那两次测量，与方位角相差四分之一圈；它的短轴从不移动。',
    } },
    { kind: 'table', heading: { en: 'One round of the base scene, as the log prints it', zh: '基准场景的一轮，日志怎么印' }, head: [
      { en: 'Line', zh: '行' }, { en: 'It reads', zh: '写的是' },
    ], rows: [
      [{ en: 'First bearing, at 197.636 µs', zh: '首个方位角，197.636 µs 处' },
        N('anc-1 AoA ← badge-1: 2.3° (true 0.0°)')],
      [{ en: 'Second, off the Final, at 4.193 534 ms', zh: '第二个，来自 Final，4.193 534 ms 处' },
        N('anc-1 AoA ← badge-1: 1.8° (true 0.0°)')],
      [{ en: 'The range, same microsecond', zh: '同一微秒里的距离' },
        N('anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)')],
      [{ en: 'The fix they make', zh: '两者解出的定位' },
        N('anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)')],
      [{ en: 'The badge’s row, after seven rounds', zh: '七轮之后胸牌那一行' },
        N('(5.13, 2.47) m, true (5.00, 2.50) m, 13.3 cm, GDOP 1.00, ellipse 9.4 × 2.1 cm')],
    ] },
    { text: {
      en: 'The height correction in figures: at the middle spot the radio measures 4.176 m where the plan shows 4.000. Walked out flat that would plant the point 17.6 cm too far; the fix walks out √(r² − Δz²) instead.',
      zh: '把高度修正换成数字：中间那个位置上，射频量到 4.176 m，平面图上是 4.000 m。原样平着走出去，会把点钉远 17.6 cm；定位走出的是 √(r² − Δz²)。',
    } },
    { heading: { en: 'Behind the anchor', zh: '锚点背后' }, text: {
      en: 'Facing the wall, the badge is 180.0° off boresight, and the fourteen bearings come back as the base scene’s, to every digit.',
      zh: '锚点面朝墙时，胸牌偏离正前方 180.0°，而十四个方位角与基准场景的每一位数字都相同。',
    } },
    { text: {
      en: 'The seven fixes then land near (5.06, −1.47) m, 3.97 to 4.03 m from the badge — twice the floor distance, outside the room.',
      zh: '于是七次定位落在 (5.06, −1.47) m 一带，离胸牌 3.97 到 4.03 m——正是平面距离的两倍，已在房间之外。',
    } },
  ],
  deeper: [
    { heading: { en: 'Where the clamps are, and when they bite', zh: '两处截断在哪里，何时起作用' }, text: {
      en: 'Two clamps live in this model, and neither fires anywhere the lesson sends the badge. The arc sine’s argument is clamped to ±π, so a reading pinned at ±90.0° means noise pushed the phase past a full turn. And σ_θ itself is clamped at 45°, which the formula reaches at about ±86.5° off boresight and past which the linearisation describes nothing. Drag the badge to (8.94, 1.19) — 80° off at 4 m — and both begin to matter: σ_θ is 15.75°, six of the fourteen bearings come back pinned at −90.0°, and the worst ellipse has a semi-major axis of 3.16 m.',
      zh: '这个模型里有两处截断，而本课把胸牌放的任何位置都碰不到它们。反正弦的自变量截断在 ±π，所以读数被钉在 ±90.0° 时，说明噪声把相位推过了一整圈。σ_θ 本身也截断在 45°，公式大约在偏离正前方 ±86.5° 处到达这个值，再往外这套线性化什么也描述不了。把胸牌拖到 (8.94, 1.19)——4 m 处偏 80°——两者就都开始起作用：σ_θ 是 15.75°，十四个方位角里有六个被钉在 −90.0°，最差的那个椭圆半长轴达 3.16 m。',
    } },
    { heading: { en: 'Only the ratio matters', zh: '起作用的只是比值' }, text: {
      en: 'Nothing above depends on the channel. Channel 9’s carrier is 3.75 cm with antennas 1.88 cm apart; channel 5’s are 4.62 cm and 2.31 cm. Because the spacing is always half the wavelength, the same true angle produces the same phase on either: 2.221 rad at 45° off boresight, 2.721 rad at 60°, and π at the edge of the field of view — which is exactly why nothing wraps. Behind the anchor the sine repeats, sin(180° − θ) = sin θ, and that is the mirror.',
      zh: '上面的一切都与信道无关。信道 9 的载波是 3.75 cm，天线间距 1.88 cm；信道 5 则是 4.62 cm 与 2.31 cm。由于间距永远是波长的一半，同一个真实角度在两者上产生同样的相位：偏离正前方 45° 时 2.221 rad，60° 时 2.721 rad，视场边缘处恰好是 π——这正是它从不卷绕的原因。而在锚点背后正弦会重复，sin(180° − θ) = sin θ，那就是镜像。',
    } },
    { heading: { en: 'The ± the inspector prints is not the model’s σ_θ', zh: '检视面板印出的 ± 不是模型的 σ_θ' }, text: {
      en: 'The bearing row shows σ_θ evaluated at the angle that row last happened to measure, not at the truth, so it moves with every draw: ± 2.7°, ± 4.3° and ± 7.5° at the three spots, where the model’s σ_θ at the true bearings is 2.74°, 3.87° and 5.47°. It is an honest figure about the last measurement rather than a property of the spot. The range row beside it reads 2.31 m against a true 2.33, −2.4 cm, over seven rounds of DS-TWR.',
      zh: '方位角那一行显示的，是把 σ_θ 代入该行最后一次量到的角度算出的值，而不是代入真值，所以每抽一次样都会变：三个位置上分别读作 ± 2.7°、± 4.3° 与 ± 7.5°，而模型在真实方位角处的 σ_θ 是 2.74°、3.87° 与 5.47°。它老实描述的是最后那次测量，而不是这个位置的属性。旁边那一行距离读作 2.31 m，真值 2.33，差 −2.4 cm，七轮 DS-TWR。',
    } },
    { heading: { en: 'Why the range never shows up in the fix error', zh: '为什么定位误差里看不见测距' }, text: {
      en: 'Split each fix into its component along the anchor → badge ray and its component across it. Across, the fixes are the cross-range column of the table, to within a millimetre. Along, all twenty-one of them stay inside 9 cm, under four times the range sigma — the range is doing its job, and its error is simply too small to see beside the bearing’s. It is also why GDOP is 1.00 here by construction and has nothing to say: with one anchor there is no layout to dilute anything.',
      zh: '把每次定位分解成沿“锚点→胸牌”射线的分量与垂直于它的分量。横向上，这些定位就是表里那一列横向误差，相差不到一毫米。纵向上，二十一次定位无一超过 9 cm，不到测距 σ 的四倍——测距干得好好的，只是它的误差在方位角的误差旁边小到看不见。这也是为什么这里的 GDOP 恒为 1.00、无话可说：只有一个锚点，就谈不上布局稀释什么。',
    } },
  ],
  sources: [
    { en: 'One thing here is the standard’s: §10.29.1.1 of IEEE Std 802.15.4-2024 lists angle of arrival among the results a ranging round may report, so an anchor may hand back a direction as well as a distance.',
      zh: '本课只有一处以标准为依据：IEEE Std 802.15.4-2024 的 §10.29.1.1 把到达角列在一轮测距可以报出的结果之中，所以锚点可以既交回距离，也交回方向。' },
    { en: 'Everything after that is the simulator’s own model, in the style of the FiRa profiles rather than of anything the standard specifies: two receive antennas half a wavelength apart, a phase measurement with σ_φ = 0.15 rad, the arc sine that inverts it, its ±90° clamp, the 45° clamp on σ_θ, and the mirror behind the anchor.',
      zh: '此后的一切都是仿真器自己的模型取值，风格上接近 FiRa 的各类 profile，而不是标准正文的规定：两根相距半波长的接收天线、σ_φ = 0.15 rad 的相位测量、把它反解回来的反正弦及其 ±90° 截断、σ_θ 的 45° 截断，以及锚点背后的那个镜像。' },
    { en: 'The 2.12 cm range sigma is the model constant the positioning lessons use, σ_r = c · σ_ts / √2 at 100 ps of timestamp noise. The scene’s own choices are channel 9, a double-sided session and no obstruction; with a single-sided one the anchor would hold a bearing and never compute a range to cross it with.',
      zh: '2.12 cm 的测距 σ 与定位那几课用的是同一个模型取值：σ_r = c · σ_ts / √2，代入 100 ps 的时间戳噪声。场景自己的取值是信道 9、双边测距会话与没有遮挡；若改用单边测距，锚点只会握着一个方位角，永远算不出可与之相交的距离。' },
  ],
  scenario: () => uwbAoaScenario('base'),
  variants: [
    { label: { en: '45° at 4 m', zh: '4 m 处 45°' }, scenario: () => uwbAoaScenario('off45') },
    { label: { en: '60° at 5 m', zh: '5 m 处 60°' }, scenario: () => uwbAoaScenario('off60') },
    { label: { en: 'Behind the anchor', zh: '锚点背后' }, scenario: () => uwbAoaScenario('behind') },
  ],
  jumps: [
    J('the Poll the badge opens with', '胸牌用来开场的 Poll', firstUwbPoll),
    J('the bearing the anchor takes off it', '锚点由它测出的方位角', firstUwbAoa),
    J('the Final that closes the round', '结束这一轮的 Final', firstUwbFinal),
    J('the range it completes', '它算出的距离', firstUwbRange),
    J('the fix one anchor solves', '一个锚点解出的定位', firstUwbAoaFix),
  ],
  observe: [
    { en: 'The badge opens the round; a fifth of a millisecond later the anchor stamps that frame, reads its phase, and prints a bearing with the truth beside it. It does this on every frame from the badge, so one round leaves two bearings.',
      zh: '胸牌开启这一轮；五分之一毫秒后，锚点给那一帧打上时间戳、读出相位，并印出一个方位角，旁边写着真值。它对来自胸牌的每一帧都这么做，所以一轮留下两个方位角。' },
    { en: 'Three lines land together at the end of the round: the second bearing, the range, and the position solved from the pair — always with the later bearing, measured closest in time to the range it crosses. Open the badge and the fix is in its lane, an amber bearing line running out to the cross.',
      zh: '这一轮末尾有三行一起落下：第二个方位角、那个距离，以及用这一对解出的位置——用的总是靠后那个方位角，它与被相交的距离测得的时刻最近。打开胸牌，定位就在它这条泳道里，一条琥珀色方位线伸向那个十字。' },
  ],
  tryThis: [
    { en: 'Load “45° at 4 m”, then “60° at 5 m”. Watch the ellipse stretch while its short axis stands still, and the mean fix error grow from centimetres towards half a metre while the range error does not move.',
      zh: '载入“4 m 处 45°”，再载入“5 m 处 60°”。看着椭圆一路拉长而短轴纹丝不动，平均定位误差从几厘米涨到接近半米，而测距误差一点没动。' },
    { en: 'Load “Behind the anchor”. Only the anchor’s Facing changed, so it now looks at its own wall. The bearings are the ones you just read, and the fix is outside the building. Put Facing back and the error returns to centimetres.',
      zh: '载入“锚点背后”。变的只有锚点的“朝向”，于是它现在望着自己那面墙。方位角还是你刚读过的那些，定位却跑到了楼外。把“朝向”调回去，误差就回到几厘米。' },
  ],
  quiz: [
    {
      q: { en: 'Why is a bearing more uncertain off to the side than straight ahead?', zh: '为什么偏到侧面时，方位角比正前方更不确定？' },
      options: [
        { en: 'The signal is weaker off to the side', zh: '偏到侧面信号更弱' },
        { en: 'Phase follows sin θ, which flattens: σ_φ/(π·cos θ) is 2.74° ahead and 5.47° at 60°', zh: '相位正比于 sin θ，而它越靠边越平：σ_φ/(π·cos θ) 正前方 2.74°，60° 处 5.47°' },
        { en: 'The antennas are further apart in wavelengths there', zh: '那里天线间距折算成波长变大了' },
      ],
      answer: 1,
      explain: { en: 'Near the edge of the field of view a degree of azimuth changes almost no phase, so inverting it magnifies the noise.', zh: '在视场边缘，方位角动一度也几乎不改变相位，于是反解把噪声放大了。' },
    },
    {
      q: { en: 'The far spot’s fix is 48 cm out on average, yet its range is right to 2 cm. Where is the error?', zh: '最远那个位置上定位平均偏 48 cm，它的距离却准到 2 cm。误差在哪里？' },
      options: [
        { en: 'Across the line of sight: rh·σ_θ is 47.7 cm, the ellipse’s long axis', zh: '在垂直视线的方向上：rh·σ_θ 是 47.7 cm，正是椭圆的长轴' },
        { en: 'Along it, because the slant distance is longer', zh: '在沿视线的方向上，因为斜距更长' },
        { en: 'Spread evenly, with no preferred direction', zh: '均匀分布，没有偏好方向' },
      ],
      answer: 0,
      explain: { en: 'The two measurements are unrelated and wildly unequal, so the error has a direction.', zh: '两次测量彼此无关、大小悬殊，所以误差是有方向的。' },
    },
    {
      q: { en: 'Facing its own wall, the anchor reports a badge behind it as straight ahead. Why?', zh: '面朝自己那面墙时，锚点把身后的胸牌报成在正前方。为什么？' },
      options: [
        { en: 'The ±90° clamp folded the reading back', zh: '是 ±90° 的截断把读数折了回来' },
        { en: 'A mirror image in front gives the same phase, and two antennas cannot tell the two apart', zh: '正前方的镜像会给出同样的相位，而两根天线分辨不出两者' },
        { en: 'The range is wrong behind the anchor', zh: '锚点背后的距离测错了' },
      ],
      answer: 1,
      explain: { en: 'The range is as right there as anywhere and the clamp never fires. Aim the anchor into the room, or add a third antenna.', zh: '那里的距离和别处一样准，截断也根本没触发。办法是把锚点朝房间里装，或者加第三根天线。' },
    },
  ],
}
