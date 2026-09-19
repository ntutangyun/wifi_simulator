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
 * the 2.12 cm it has had since module 11; the bearing's 2.74° at boresight is
 * worth 9.5 cm of cross-range at 2 m, 27.0 cm at 4 m and 45°, and 47.7 cm at
 * 5 m and 60° — so the error ellipse is a sliver lying *across* the line of
 * sight, growing with distance and with angle while the range error does not.
 * The last variant shows the price of two antennas: a badge directly behind
 * the anchor arrives with the phase of its own reflection in the boresight,
 * and the fix lands about 4 m away, outside the room.
 *
 * Every number quoted below is pinned in tests/course/uwb-aoa.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling.
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
  body: [
    { text: {
      en: 'One thing here comes from IEEE Std 802.15.4-2024: §10.29.1.1 lists angle of arrival among the results a ranging round may report, so an anchor may report a direction as well as a distance. The rest is the model: two antennas a half wavelength apart, a phase measurement of σ_φ = 0.15 rad, the arc sine that inverts it, its clamp, the mirror behind the anchor, and every number below — FiRa-style, not anything the standard specifies.',
      zh: '本课只有一处以 IEEE Std 802.15.4-2024 为依据：§10.29.1.1 把到达角列在一轮测距可以报出的结果里，所以锚点可以交回一个方向，而不只是一个距离。其余都是模型：相距半个波长的两根天线、σ_φ = 0.15 rad 的相位测量、把它反解回来的反正弦及其截断、锚点背后的镜像，以及下面引用的每一个数字——这些是 FiRa 风格的做法，标准本身并没有规定。',
    } },
    { heading: { en: 'Two antennas, one phase', zh: '两根天线，一个相位' }, text: {
      en: 'The anchor sits against the south wall of the 10 × 8 m lab, at (5.00, 0.50) and 2.20 m up, facing into the room. Its two receive antennas are 1.88 cm apart — half a wavelength on channel 9, whose 7 987.2 MHz carrier is 3.75 cm long. (Channel 5: λ = 4.62 cm, spacing 2.31 cm; only the ratio matters.) A wavefront off the boresight reaches the far antenna later by d·sin θ, and the receiver reads that lateness as a phase difference.',
      zh: '锚点贴着这个 10 × 8 m 实验室的南墙，位于 (5.00, 0.50)、高 2.20 m，正面朝向房间内部。它的两根接收天线相距 1.88 cm——正是信道 9 的半个波长，该信道 7 987.2 MHz 载波的波长为 3.75 cm。（信道 5：λ = 4.62 cm，间距 2.31 cm；起作用的只是两者之比。）偏离正前方到来的波前，会晚 d·sin θ 这段路程才到达较远那根天线，而接收机把这份“晚”读成相位差。',
    } },
    { kind: 'formula', heading: { en: 'The whole of the physics', zh: '全部的物理' }, text: {
      en: 'Δφ = 2π·(d/λ)·sin θ = π·sin θ   (at d = λ/2)\nθ̂ = asin(Δφ/π),  clamped to ±90°',
      zh: 'Δφ = 2π·(d/λ)·sin θ = π·sin θ   （当 d = λ/2）\nθ̂ = asin(Δφ/π)，截断在 ±90°',
    }, note: {
      en: 'Half-wavelength spacing is the widest that stays unambiguous: the whole ±90° field of view maps onto exactly one turn of phase, and nothing wraps. A badge 45° off boresight produces 2.221 rad, one 60° off 2.721 rad, and each measurement carries σ_φ = 0.15 rad ≈ 8.6° of phase noise. Noise past ±π leaves the arc sine no answer, so the argument is clamped rather than dropped and the reading lands at the edge of the field of view.',
      zh: '半波长间距是仍然无歧义的最大间距：整个 ±90° 视场恰好映射到一整圈相位，不会发生任何卷绕。偏离正前方 45° 的胸牌产生 2.221 rad，偏离 60° 的产生 2.721 rad，而每次测量都带着 σ_φ = 0.15 rad ≈ 8.6° 的相位噪声。噪声可能把读数推过 ±π，那里反正弦无解；此时截断的是自变量而不是丢弃整次测量，于是读数落在视场的边缘上。',
    } },
    { heading: { en: 'The same noise is worth more degrees off to the side', zh: '同样的噪声，越偏越值钱' }, text: {
      en: 'Invert the line and phase noise becomes angle noise: σ_θ = σ_φ/(π·cos θ). Straight ahead that is 2.74°; at 45° it is 3.87°, at 60° 5.47°, and at ±90° it diverges, because there a degree of azimuth changes no phase at all. The model clamps σ_θ itself at 45°, which it reaches at about ±86.5° off boresight and past which the linearisation describes nothing. Nowhere is this growth chosen: it falls out of sin θ flattening.',
      zh: '把这条式子反解，相位噪声就变成角度噪声：σ_θ = σ_φ/(π·cos θ)。正前方是 2.74°；45° 处 3.87°，60° 处 5.47°；到 ±90° 处发散，因为那里方位角改变一度也不改变相位。模型把 σ_θ 本身截断在 45°——偏离正前方约 ±86.5° 时才到这个值——再往后这个线性化什么也描述不了。这种增长不是谁选的：它是 sin θ 变平自己长出来的。',
    } },
    { heading: { en: 'A circle and a ray', zh: '一个圆和一条射线' }, text: {
      en: 'DS-TWR already hands the anchor the badge’s range at the end of every round, with the 2.12 cm sigma it has had since module 11. A range is a circle, a bearing is a ray, and the two meet in exactly one point — so the anchor solves the fix alone, and the answer is that polar coordinate itself. GDOP is 1.00 by construction and has nothing to say here. Compare error ellipses instead.',
      zh: 'DS-TWR 本来就在每轮结束时把胸牌的距离交给锚点，σ 仍是第 11 模块以来的 2.12 cm。距离是一个圆，方位角是一条射线，两者恰好交于一点——于是锚点独自把定位解了出来，而答案就是那个极坐标本身。GDOP 恒为 1.00，在本课里无话可说。要比就比误差椭圆。',
    } },
    { kind: 'table', heading: { en: 'Three spots, seven rounds each', zh: '三个位置，各七轮' }, head: [
      { en: 'Where the badge stands', zh: '胸牌站在哪里' }, { en: 'True bearing', zh: '真实方位角' },
      { en: 'σ_θ', zh: 'σ_θ' }, { en: 'Cross-range 1-σ', zh: '横向 1-σ' },
      { en: 'Range error', zh: '测距误差' }, { en: 'Fix error', zh: '定位误差' },
    ], rows: [
      [{ en: 'Straight ahead, 2 m', zh: '正前方 2 m' }, N('0.0°'), N('2.74°'), N('9.5 cm'), N('2.0 cm'),
        { en: '2.1–15.6 cm, mean 9.6', zh: '2.1–15.6 cm，平均 9.6' }],
      [{ en: '45° to its right, 4 m', zh: '右偏 45°，4 m' }, N('−45.0°'), N('3.87°'), N('27.0 cm'), N('2.0 cm'),
        { en: '5.8–44.5 cm, mean 26.5', zh: '5.8–44.5 cm，平均 26.5' }],
      [{ en: '60° to its right, 5 m', zh: '右偏 60°，5 m' }, N('−60.0°'), N('5.47°'), N('47.7 cm'), N('2.0 cm'),
        { en: '10.4–87.7 cm, mean 48.2', zh: '10.4–87.7 cm，平均 48.2' }],
    ] },
    { heading: { en: 'An ellipse across the line of sight', zh: '一个横躺在视线上的椭圆' }, text: {
      en: 'Read that table across, not down. The range error is the same 2 cm in all three rows — a time of flight does not care where the badge stands — while the cross-range error rh·σ_θ goes from 9.5 cm to 47.7. Nothing else is left: fix error and cross-range error are the same number twice, and the along-the-ray component of all twenty-one fixes stays inside 9 cm. The ellipse’s semi-axes are those two measurements, so its major axis is the angle’s and it is drawn a quarter turn from the bearing: 9.4 × 2.1 cm at the first fix, 25.7 × 2.1 at 45°, 43.1 × 2.1 at 60°. A sliver, across your line of sight.',
      zh: '这张表要横着读，不要竖着读。三行的测距误差都是同一个 2 cm——飞行时间并不在乎胸牌站在哪儿——而横向误差 rh·σ_θ 却从 9.5 cm 涨到 47.7。剩下的也就没什么了：定位误差和横向误差是同一个数写了两遍，二十一次定位里沿射线方向的分量没有一次超过 9 cm。椭圆的两条半轴就是那两次测量，所以它的长轴属于角度，并被画成与方位角相差四分之一圈：第一次定位时 9.4 × 2.1 cm，45° 处 25.7 × 2.1，60° 处 43.1 × 2.1。一条细长条，横在你望过去的方向上。',
    } },
    { heading: { en: 'Walk out the plan distance, not the slant', zh: '沿平面距离走，而不是斜距' }, text: {
      en: 'The bearing is horizontal — two antennas side by side say nothing about elevation — but the range is a slant distance. The anchor is at 2.20 m and the badge at 1.00 m, so at the 45° spot the radio measures 4.176 m where the plan shows 4.000. Walking the slant range out along a horizontal bearing would plant every fix 17.6 cm too far out, eight times the range’s own sigma and the same way every round — a bias, not noise. So the fix walks out √(r² − Δz²) instead, and the cross sits a little inside the range ring, which is still the slant range.',
      zh: '方位角是水平的——并排的两根天线对俯仰角一无所知——而距离是斜距。锚点在 2.20 m，胸牌在 1.00 m，所以在 45° 那个位置上，射频量到 4.176 m，而平面图上是 4.000 m。若沿水平方位角走出斜距那么远，每次定位都会被钉到远处 17.6 cm——是测距自身 σ 的八倍，而且每一轮都朝同一个方向，这是偏差而不是噪声。因此定位走出的是 √(r² − Δz²)。于是那个十字会落在测距环的内侧一点，因为环画的仍是斜距。',
    } },
    { heading: { en: 'The half it cannot see', zh: '它看不见的那一半' }, text: {
      en: 'sin(180° − θ) = sin θ. A badge behind the anchor arrives with exactly the phase of its mirror image in front, and an arc sine has nothing else to go on, so it reports the mirror. Point the anchor at its own wall and the base scene’s badge — unmoved, still 2.00 m away on the floor — is 180.0° off boresight: the fourteen bearings come back identical to before, around 0°, and the seven fixes land near (5.06, −1.47), 3.97 to 4.03 m from the badge and outside the room. The error is exactly twice the horizontal range. Deployments answer it by pointing anchors at the room — the editor’s Facing field — or with a third antenna.',
      zh: 'sin(180° − θ) = sin θ。位于锚点背后的胸牌，到达时的相位恰好等于它在正前方那个镜像的相位，而反正弦再没有别的线索，于是报出的就是那个镜像。把锚点转向它自己那面墙，基础场景里的胸牌——原地没动，平面上仍在 2.00 m 外——就成了偏离正前方 180.0°：十四个方位角与先前一模一样，都在 0° 附近，而七次定位落在 (5.06, −1.47) 一带，离胸牌 3.97 到 4.03 m，已在房间之外。误差恰好是水平距离的两倍。实际部署的应对办法是把锚点对准房间——编辑器里的“朝向”一栏——或者再加第三根天线。',
    } },
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
    { en: 'At t = 0 the badge sends its Poll; 197.636 µs later the anchor stamps the arrival and measures the phase difference on that same frame: “anc-1 AoA ← badge-1: 2.3° (true 0.0°)”. It does this on every frame from the badge, so a DS round yields two bearings — the Final’s arrives at 4.193 534 ms reading 1.8°. Seven rounds, fourteen bearings.',
      zh: 't = 0 处胸牌发出 Poll；197.636 µs 后锚点给这次到达打上时间戳，并在同一帧上测出相位差：“anc-1 AoA ← badge-1: 2.3° (true 0.0°)”。它对来自胸牌的每一帧都这么做，所以一个 DS 轮次产出两个方位角——来自 Final 的那个在 4.193 534 ms 处，读数 1.8°。七轮，十四个方位角。' },
    { en: 'Three lines land together at 4.193 534 ms: “anc-1 AoA ← badge-1: 1.8° (true 0.0°)”, “anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)”, and “anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)”. The fix takes the Final’s bearing, the one measured closest to the range it is crossed with.',
      zh: '4.193 534 ms 处有三行一起落下：“anc-1 AoA ← badge-1: 1.8° (true 0.0°)”、“anc-1 range → badge-1 (DS): 2.30 m (true 2.33 m)”，以及 “anc-1 position of badge-1 (4.94, 2.47) m, true (5.00, 2.50), error 0.07 m, GDOP 1.00, 1 anchors (AoA)”。定位用的是 Final 那个方位角——它与被交叉的那个距离测得时间最近。' },
    { en: 'Open the anchor in the inspector: two tables now. A range to the badge — 2.31 m against a true 2.33, −2.4 cm, 97 % within 0.5 ns, 7 rounds, DS-TWR — and a bearing, measured −3.7°, true 0.0°, error −3.7°, ± 2.7°, over 14 rounds. The 1-σ sits on the row, not in a header: it is σ_θ at the bearing that row last measured.',
      zh: '在检视面板里打开锚点：现在有两张表。一张是到胸牌的距离——2.31 m 对真值 2.33，误差 −2.4 cm，97 % within 0.5 ns，7 轮，DS-TWR；另一张是方位角，测得 −3.7°，真值 0.0°，误差 −3.7°，± 2.7°，共 14 轮。那个 1-σ 写在行上而不是表头：它是按那一行最后测到的方位角算出的 σ_θ。' },
    { en: 'Now open the badge. A bearing belongs to the anchor that measured it; a fix belongs to whoever it is of, so the badge’s lane holds the position: (5.13, 2.47) m against (5.00, 2.50), 13.3 cm out, GDOP 1.00, ellipse 9.4 × 2.1 cm, solved from angle of arrival. On the plan an amber bearing line runs from the anchor to the cross, inside the range ring.',
      zh: '再打开胸牌。方位角属于测出它的那个锚点，而定位属于它所指向的那一方，所以定位落在胸牌这条泳道里：(5.13, 2.47) m 对 (5.00, 2.50)，偏离 13.3 cm，GDOP 1.00，椭圆 9.4 × 2.1 cm，解算方式为到达角。平面图上有一条琥珀色的方位线从锚点连到十字，而十字落在测距环的内侧。' },
  ],
  tryThis: [
    { en: 'Load “45° at 4 m”, then “60° at 5 m”. The true bearing reads −45.0° and −60.0° exactly. The inspector’s 1-σ is σ_θ at the bearing that row happened to measure last, so it moves with every draw: here it reads ± 2.7°, ± 4.3° and ± 7.5° where the model’s σ_θ at the three spots is 2.74°, 3.87° and 5.47°. The mean fix error goes 9.6 → 26.5 → 48.2 cm while the range error stays at 2.0 cm. Watch the ellipse: 9.4 × 2.1, 25.7 × 2.1, 43.1 × 2.1 cm — the short axis never moves. Then drag the badge to (8.94, 1.19), 80° off at 4 m: σ_θ is 15.75°, six of the fourteen bearings are pinned at the −90.0° clamp, and the worst ellipse’s semi-major axis is 3.16 m.',
      zh: '载入“4 m 处 45°”，再载入“5 m 处 60°”。真实方位角恰好读作 −45.0° 与 −60.0°。检视面板里的 1-σ 是按那一行最后一次测到的方位角算出的 σ_θ，所以每抽一次样它都会变：这里读作 ± 2.7°、± 4.3° 与 ± 7.5°，而模型在这三个位置上的 σ_θ 是 2.74°、3.87° 与 5.47°。平均定位误差走 9.6 → 26.5 → 48.2 cm，而测距误差始终停在 2.0 cm。看椭圆：9.4 × 2.1、25.7 × 2.1、43.1 × 2.1 cm——短轴一动不动。然后把胸牌拖到 (8.94, 1.19)，即 4 m 处偏离 80°：σ_θ 为 15.75°，十四个方位角里有六个被钉在 −90.0° 的截断值上，最差的那个椭圆半长轴达 3.16 m。' },
    { en: 'Load “Behind the anchor”. Nothing about the badge changed — same spot, same 2.00 m on the floor — only the anchor’s Facing, 90° to −90°, so it looks at its own wall. The true bearing is 180.0°, the fourteen measured bearings are identical to the base scene’s, and the seven fixes are 396.7 to 403.0 cm out, mean 400.2 — twice the horizontal range, every round, with a confident 9.4 × 2.1 cm ellipse around a point outside the building. Put Facing back to 90° and the error returns to 2.1–15.6 cm. An ellipse says how precise a measurement is, never whether it points the right way.',
      zh: '载入“锚点背后”。胸牌那边什么也没变——同一个位置、平面上同样的 2.00 m——变的只有锚点的“朝向”，从 90° 改成 −90°，于是它望着自己那面墙。真实方位角是 180.0°，十四个测得的方位角与基础场景一模一样，而七次定位偏离 396.7 到 403.0 cm，平均 400.2——正是水平距离的两倍，每一轮都如此，还围着一个楼外的点画上了自信满满的 9.4 × 2.1 cm 椭圆。把“朝向”调回 90°，误差就回到 2.1–15.6 cm。椭圆说的是一次测量有多精密，从来不是它有没有指对方向。' },
  ],
  quiz: [
    {
      q: { en: 'The phase noise is 0.15 rad wherever the badge stands. Why is the bearing twice as uncertain at 60° off boresight as straight ahead?', zh: '不论胸牌站在哪里，相位噪声都是 0.15 rad。那为什么偏离正前方 60° 时方位角的不确定度是正前方的两倍？' },
      options: [
        { en: 'The signal is weaker off to the side, so the phase is estimated worse', zh: '偏到侧面信号更弱，相位估计也更差' },
        { en: 'Δφ goes as sin θ, which flattens towards the edge: the same phase error buys σ_φ/(π·cos θ), 2.74° ahead and 5.47° at 60°', zh: 'Δφ 正比于 sin θ，而 sin θ 越靠边越平：同样的相位误差换来 σ_φ/(π·cos θ)，正前方 2.74°，60° 处 5.47°' },
        { en: 'The antennas are further apart in wavelengths at that angle', zh: '在那个角度上，天线间距折算成波长变大了' },
      ],
      answer: 1,
      explain: { en: 'Nothing about the radio changes with angle. Near ±90° a degree of azimuth changes almost no phase, so the inverse magnifies whatever noise the phase carried.', zh: '随角度变化的东西里没有一样属于射频。在 ±90° 附近，方位角改变一度也几乎不改变相位，于是反解会把相位里的噪声放大。' },
    },
    {
      q: { en: 'At 5 m and 60° off boresight the fix is 48 cm out on average, yet the anchor’s range to that badge is right to 2 cm. Where is the error?', zh: '在 5 m、偏离 60° 处，定位平均偏离 48 cm，可锚点到那个胸牌的距离却准到 2 cm。误差在哪里？' },
      options: [
        { en: 'Across the line of sight: rh·σ_θ is 47.7 cm there, and that is the ellipse’s major axis', zh: '在垂直视线的方向上：那里的 rh·σ_θ 是 47.7 cm，而这正是椭圆的长轴' },
        { en: 'Along the line of sight, because the slant range is longer than the plan distance', zh: '在沿视线的方向上，因为斜距比平面距离长' },
        { en: 'Spread evenly, as a single-anchor fix has no preferred direction', zh: '均匀分布，因为单锚点定位没有偏好方向' },
      ],
      answer: 0,
      explain: { en: 'The two measurements are unrelated and wildly unequal, so the error has a direction: the along-ray component of all twenty-one fixes stays inside 9 cm. The slant range is corrected for before anything is walked out.', zh: '那两次测量彼此无关、大小悬殊，所以误差是有方向的：二十一次定位沿射线方向的分量都不超过 9 cm。斜距在走出去之前就已经修正过了。' },
    },
    {
      q: { en: 'In “Behind the anchor” the badge is 180° off boresight, and the anchor confidently reports about 0°. Why, and what does a deployment do about it?', zh: '在“锚点背后”里胸牌偏离正前方 180°，锚点却自信地报出大约 0°。为什么？实际部署又怎么办？' },
      options: [
        { en: 'The ±90° clamp folded the reading back; raising the clamp would fix it', zh: '是 ±90° 的截断把读数折了回来；放宽截断就能解决' },
        { en: 'Two elements cannot tell front from back — sin(180° − θ) = sin θ — so anchors are pointed at the room, or given a third antenna', zh: '两个阵元分辨不出前后——sin(180° − θ) = sin θ——所以要么把锚点对准房间，要么加上第三根天线' },
        { en: 'The range is wrong behind the anchor, and drags the bearing with it', zh: '锚点背后的距离测错了，把方位角也带偏了' },
      ],
      answer: 1,
      explain: { en: 'The range is right to 2 cm there and the clamp never fires: the phase genuinely is the mirror image’s, so no inverse could recover the truth. Facing is the cheap answer.', zh: '那里的距离准到 2 cm，截断也根本没触发：那个相位真真切切就是镜像的相位，任何反解都还原不出真值。“朝向”是便宜的答案。' },
    },
  ],
}
