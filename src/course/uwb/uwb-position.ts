/**
 * UWB Tier 1 · M12 · Ranging sessions and positioning · From four ranges to a point.
 *
 * The four lessons before this one produced distances. This one turns them into
 * a place, and then spends its length on the two things that decide how good
 * that place is: the geometry of the anchors, which the solver prices as GDOP
 * and draws as an error ellipse, and one obstructed path, which biases a single
 * range by 0.60 m and moves the answer by half of that while every quality
 * figure on the screen goes on promising a centimetre.
 * Every number quoted below is pinned in tests/course/uwb-position.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling. The prose
 * below totals 1718 words, so there is room for six more and no more:
 * adding a sentence means deleting one.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, brick, firstUwbPoll, firstUwbPosition, firstUwbRange, firstUwbRoundEnd, oneRoom,
  uwbSc, uwbTag, type Lesson,
} from '../lessonKit'
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
  module: 12,
  title: { en: 'From four ranges to a point', zh: '从四个距离到一个点' },
  body: [
    { text: {
      en: 'One thing here comes from IEEE Std 802.15.4-2024: §10.29.1.7, with Tables 10-146, 10-147 and 10-148, defines the Figure of Merit byte — how the log tells an obstructed first path from a clean one. The standard says nothing at all about how a tag turns ranges into a point, so the rest is the model’s own: Gauss–Newton least squares on (x, y) with the tag’s height known, GDOP and the 1-σ ellipse from its Jacobian, and a wall’s excess delay of 2.0 ns for brick, 0.5 ns for drywall and 0.2 ns for glass.',
      zh: '本课只有一处以 IEEE Std 802.15.4-2024 为依据：§10.29.1.7 连同表 10-146、10-147、10-148 定义了每个接收时间戳上的品质因数（FoM）字节——日志正是靠它区分首径是被挡住的还是干净的。至于“标签怎样把几个距离变成一个点”，标准只字未提，其余内容便都是仿真器自己的模型：对 (x, y) 做高斯－牛顿最小二乘、标签的高度当作已知，GDOP 与 1σ 椭圆由雅可比矩阵算出，以及一堵墙的额外时延取砖墙 2.0 ns、石膏板 0.5 ns、玻璃 0.2 ns。',
    } },
    { heading: { en: 'Four rings, one point', zh: '四个圆环，一个点' }, text: {
      en: 'Four ranges, two unknowns. If every range were exact the circles around the anchors would cross at one point — and the scene draws them, one amber ring per anchor at the range it just measured. They never quite meet: a centimetre of noise on each radius leaves an untidy region, and the solver picks the place that fits all four least badly.',
      zh: '四个距离，两个未知数。如果每个距离都精确无误，围着锚点画出的那些圆会交于一点；场景里画的正是这些圆——每个锚点一圈琥珀色的环，半径就是它刚测出的距离。它们从来交不到一处：每条半径上一厘米的噪声，留下的不是一个点，而是一小块不齐整的区域，而解算器要挑出的，是那个对四个距离都“最不亏欠”的位置。',
    } },
    { kind: 'formula', text: {
      en: 'r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r',
      zh: 'r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r',
    }, note: {
      en: 'Anchor i’s residual at a trial point p is how much further p is from it than the measurement claims; the best fix minimises the four squared residuals. The gradient of ‖p − a_i‖ is the unit vector from anchor to p, so a Jacobian row is that unit vector: a direction, the distance divided out. One step is a 2 × 2 system. The engine starts at the anchors’ centroid and stops when a step falls under 1 mm, or after 20 iterations; on exact ranges it converges to within a micrometre. Rows carry only the horizontal part; the tag’s height is not solved for. Under three ranges, or with anchors in a line, there is no fix.',
      zh: '锚点 i 在试探点 p 处的残差，就是 p 比测量结果所说的离该锚点远了多少；最优解让这四个残差的平方和最小。‖p − a_i‖ 的梯度正是从锚点指向 p 的单位向量，所以雅可比的一行就是这个单位向量——只有方向，距离被约掉了——而一次迭代就是解一个 2 × 2 的方程组。引擎从锚点形心出发，直到某一步小于 1 mm 或迭代满 20 次为止；喂给它精确的距离，它收敛到与真值相差不足一微米。每行只取水平的 (x, y) 分量，因为标签的高度并不参与求解。若可用距离少于三个，或锚点排成一条直线，这一轮便不给定位。',
    } },
    { kind: 'formula', heading: { en: 'What the geometry alone costs', zh: '几何本身要花多少钱' }, text: {
      en: 'GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹      σ_r = c · σ_ts / √2 = 2.12 cm',
      zh: 'GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹      σ_r = c · σ_ts / √2 = 2.12 cm',
    }, note: {
      en: 'JᵀJ holds directions only, so its inverse is what the geometry charges for a metre of range error. For N anchors whose bearings are spread evenly around the point, and whose Jacobian rows are full unit vectors, JᵀJ is exactly (N/2)·I, the trace of its inverse is 4/N and GDOP is 2/√N — exactly 1.00 at four anchors. The middle of a square of anchors is the best case.',
      zh: 'JᵀJ 里只有方向，所以它的逆就是几何为每一米测距误差开出的价码。若 N 个锚点的方位角绕待测点均匀分布，而雅可比的每一行又都是完整的单位向量，那么 JᵀJ 恰好等于 (N/2)·I，其逆的迹为 4/N，于是 GDOP = 2/√N——四个锚点时正好 1.00。位于锚点正方形中央的点，就是几何上最好的情形。',
    } },
    { text: {
      en: 'Two things lift this scene to 1.05. The anchors are at 2.20 m and the tag at 1.00 m, so each Jacobian row is the horizontal shadow of a slanted unit vector, only 0.968 to 0.985 long. And the anchors span 9 × 7 m, not a square, so no point sees four right angles: from the tag the bearings are 64.6°, 89.4°, 95.2° and 110.8° apart, and the room’s centre is no better — 1.0544 against 1.0488. Neither costs much: GDOP prints between 1.03 and 1.26 everywhere in this room.',
      zh: '有两件事把本场景抬到了 1.05。锚点在 2.20 m 而标签在 1.00 m，于是雅可比的每一行都是斜向单位向量的水平投影，长度只有 0.968 到 0.985。此外四个锚点张成的是 9 × 7 m 的长方形而非正方形，因此房间里没有任何一点能看到四个直角：从标签看过去，方位角间隔是 64.6°、89.4°、95.2° 与 110.8°，而房间正中还要更差一点，1.0544 对 1.0488。两者的代价都不大：这间 10 × 8 m 房间里任何位置，GDOP 印出来都在 1.03 与 1.26 之间。',
    } },
    { heading: { en: 'The ellipse around the cross', zh: '十字上的那个椭圆' }, text: {
      en: '(JᵀJ)⁻¹ times the variance of one range is the covariance of the fix, Σ = σ_r²(JᵀJ)⁻¹. Lesson 2 fixed σ_r at c·σ_ts/√2, 2.12 cm at 100 ps — the SS-TWR figure, the model’s conservative stand-in for DS, which lesson 3 measured at 1.8–1.9 cm. Σ’s eigenvectors are the ellipse drawn around the amber cross: 1.7 × 1.4 cm, long axis nearly north–south at −86.8°. Too small to see beside a 4.76 m ring, so the scene draws it ten times over — 17 cm — while the inspector prints the true 1.7 × 1.4 cm. Seven blocks put the fix 0.5 cm to 3.3 cm from the truth, every one inside 4σ_r·GDOP = 8.9 cm.',
      zh: '把 (JᵀJ)⁻¹ 乘上单次测距的方差，得到的就是定位结果的协方差：Σ = σ_r²(JᵀJ)⁻¹。第 2 课已经定下 σ_r = c·σ_ts/√2，在 100 ps 的时间戳噪声下即 2.12 cm——这是单边测距（SS-TWR）的取值，模型把它作为双边测距偏保守的替代值沿用，而第 3 课实测双边为 1.8 到 1.9 cm。Σ 的特征向量就是场景围着琥珀色十字画出的那个椭圆：1.7 × 1.4 cm，长轴几乎南北向，与 +x 轴成 −86.8°。按真实尺寸，它在 4.76 m 的圆环旁不过一小团污迹，所以场景把它放大十倍来画——长半轴 17 cm——而检视面板在一旁老实印出 1.7 × 1.4 cm。七个块里，定位与真值相差 0.5 cm 到 3.3 cm，每一次都落在 4σ_r·GDOP = 8.9 cm 以内。',
    } },
    { kind: 'table', head: [
      { en: 'Scene', zh: '场景' }, { en: 'GDOP', zh: 'GDOP' }, { en: '1-σ ellipse', zh: '1σ 椭圆' },
      { en: 'First fix', zh: '首次定位' }, { en: 'Error', zh: '误差' },
    ], rows: [
      [{ en: 'Four anchors', zh: '四个锚点' }, N('1.05'), N('1.7 × 1.4 cm'), N('(3.99, 3.50) m'), N('0.7 cm')],
      [{ en: 'A brick wall in one path', zh: '一堵砖墙挡住一条路径' }, N('1.05'), N('1.7 × 1.4 cm'), N('(4.18, 3.75) m'), N('30.9 cm')],
      [{ en: 'Three anchors', zh: '三个锚点' }, N('1.26'), N('2.2 × 1.5 cm'), N('(3.98, 3.48) m'), N('2.7 cm')],
    ] },
    { heading: { en: 'One wall, one range, the whole fix', zh: '一堵墙，一条距离，整个定位' }, text: {
      en: 'Load “A brick wall in one path”. A 1.5 m stub of brick stands between the tag and the anchor at (0.5, 0.5), and of the four tag-to-anchor rays it obstructs only that one. A first path through brick arrives 2.0 ns late, which is 0.5996 m of flight. Lesson 3 showed where that lands: a delay on one pair’s receive stamps passes through the double-sided formula and turns up whole in that pair’s range. It does. The first block measures 5.33 m against a true 4.76 m, and over seven blocks the bias averages 59.4 cm, within a third of a σ_r of 0.5996 m.',
      zh: '载入“一堵砖墙挡住一条路径”。一段 1.5 m 长的砖墙立在标签与 (0.5, 0.5) 处的锚点之间，而在四条“标签—锚点”射线里，被它挡住的恰好只有这一条。穿过砖墙的首径迟到 2.0 ns，折合 0.5996 m 的飞行距离；这笔账落在哪里，第 3 课已经算清：加在某一对设备每个接收时间戳上的时延，会原封不动地穿过双边测距的算式，整整齐齐出现在这一对的距离里。结果正是如此。第一个块测出 5.33 m，而真值是 4.76 m；七个块平均下来偏差为 59.4 cm，与 0.5996 m 相差不到三分之一个 σ_r。',
    } },
    { text: {
      en: 'The FoM says so out loud: that range carries 0x7b, “75 % within 12 ns”, the other three 0x16, “97 % within 0.5 ns”. Two things about the byte matter. It reports geometry, not the delay — clear the session’s NLOS switch and the range returns to centimetres while the byte still reads 0x7b — and this solver never reads it: all four ranges weigh the same.',
      zh: 'FoM 把这件事直接喊了出来：这一条距离带着 0x7b，“75 % 的误差落在 12 ns 内”，另外三条带着 0x16，“97 % 的误差落在 0.5 ns 内”。关于这个字节有两点值得记住：它报告的是几何而不是那段时延——把会话的 NLOS 开关关掉，距离会回到厘米级，而 FoM 依旧读作 0x7b；以及，本解算器根本不看它，四条距离一视同仁。',
    } },
    { text: {
      en: 'What does 0.60 m of error on one range in four do to the point? Not 0.60 m. The fix lands at (4.18, 3.75) — 30.9 cm out, +0.18 m in x and +0.25 m in y, away from the blocked anchor in both. Noise-free the shift is 0.316 m, 53 % of the bias, on a bearing of 54°. Three honest ranges pull back against one that lies, and least squares splits the difference, leaving a 21 cm residual where a clean round leaves a micrometre.',
      zh: '那么，四条距离里有一条错了 0.60 m，对这个点意味着什么？不是 0.60 m。定位落在 (4.18, 3.75)——偏了 30.9 cm，x 方向 +0.18 m，y 方向 +0.25 m，两个方向都在远离那个被挡住的锚点。扣掉噪声，位移是 0.316 m，即偏差的 53 %，方位角 54°。三条诚实的距离与一条说谎的距离互相拉扯，最小二乘取了折中，于是留下 21 cm 的残差，而干净的一轮只留下一微米。',
    } },
    { text: {
      en: 'The expensive part: nothing else on screen moves. GDOP still reads 1.05 and the ellipse still 1.7 × 1.4 cm, because both are built from directions and an assumed σ_r. They describe the scatter of honest ranges; about a range that is simply wrong they say nothing — and 30.9 cm is three and a half times their 8.9 cm envelope.',
      zh: '真正昂贵的地方在于：屏幕上别的什么都没动。GDOP 依旧 1.05，椭圆依旧 1.7 × 1.4 cm，因为两者都由方向和一个假定的 σ_r 拼成。它们描述的是诚实距离的散布；对于一条干脆就是错的距离，它们无话可说——而 30.9 cm 是它们所许诺的 8.9 cm 包络的三倍半。',
    } },
    { heading: { en: 'Three anchors', zh: '三个锚点' }, text: {
      en: 'Load “Three anchors”: the corner at (9.5, 7.5) is gone. Three ranges and two unknowns leave one spare measurement, so there is still a fix and an ellipse, and the seven stay within 3.1 cm. What changes is the price: GDOP goes from 1.05 to 1.26 — a fifth more error for the same radio — the ellipse grows to 2.2 × 1.5 cm, its axis ratio from 1.25 to 1.44, and its long axis swings from −86.8° to +61.5°, into the quadrant the anchor left empty.',
      zh: '载入“三个锚点”：(9.5, 7.5) 角上的锚点没有了。三个距离配两个未知数，多出一个测量，所以定位还在，椭圆也还在，七次定位的误差都不超过 3.1 cm。变的是价码。GDOP 从 1.05 涨到 1.26——同样的射频，多两成的误差；椭圆胀到 2.2 × 1.5 cm，长短轴之比从 1.25 变成 1.44，长轴则从 −86.8° 摆到 +61.5°，摆进被删掉的锚点空出来的那个象限。',
    } },
    { text: {
      en: 'The 1.03-to-1.26 band four corner anchors held everywhere is gone with it. Drag the tag onto the anchor at (9.5, 0.5) and the three-anchor GDOP reaches 2.32: standing under an anchor makes its range blind to horizontal motion, so its Jacobian row is exactly zero and drops out of JᵀJ, leaving two anchors 37.9° apart to carry the fix.',
      zh: '四角锚点在任何位置都守得住的那条 1.03 到 1.26 的区间，也跟着一起没了。把标签拖到 (9.5, 0.5) 那个锚点上，三锚点的 GDOP 达到 2.32：站在一个锚点正下方时，它的距离对水平移动毫无感觉，于是它那一行雅可比恰好为零，整个从 JᵀJ 里掉了出去，只剩下两个相隔 37.9° 的锚点撑着这次定位。',
    } },
  ],
  scenario: () => uwbPositionScenario('base'),
  variants: [
    { label: { en: 'A brick wall in one path', zh: '一堵砖墙挡住一条路径' }, scenario: () => uwbPositionScenario('wall') },
    { label: { en: 'Three anchors', zh: '三个锚点' }, scenario: () => uwbPositionScenario('three') },
  ],
  jumps: [
    J('the tag’s Poll opens the round', '标签的 Poll 开启这一轮', firstUwbPoll),
    J('the first finished range', '第一个算完的距离', firstUwbRange),
    J('the fix this block’s ranges make', '这个块的距离解出的定位', firstUwbPosition),
    J('the round ends', '这一轮结束', firstUwbRoundEnd),
    J('the next block’s fix', '下一个块的定位', secondBlockFix),
  ],
  observe: [
    { en: 'One fix per block, at the end of the tag’s round: seven in 1.3 s. Block 0 reads “uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors”, and across the seven the error runs 0.5 cm to 3.3 cm.',
      zh: '每个块一次定位，落在标签那一轮的末尾：1.3 s 里共七次。第 0 个块写着 “uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors”，七次的误差在 0.5 cm 到 3.3 cm 之间。' },
    { en: 'In the scene: four amber rings at the measured ranges, a cross at the fix, the ellipse around it, all fading over one block. The ellipse is drawn ten times life size — 17 cm for a 1.7 cm semi-axis — while the inspector prints GDOP 1.05 and “error ellipse (1-σ) 1.7 × 1.4 cm”.',
      zh: '场景里：四圈琥珀色的环，半径是刚测出的距离；定位处一个十字；十字周围是那个椭圆——三者都在一个块内淡出。椭圆按真实尺寸的十倍绘制——1.7 cm 的半轴画成 17 cm——而检视面板印出的是 GDOP 1.05 与“误差椭圆（1-σ）1.7 × 1.4 cm”。' },
    { en: 'Load “A brick wall in one path”. The anchor-1 row reads 5.33 m against a true 4.76 m, error 57.1 cm, “75 % within 12 ns”; the other three are within 1.4 cm at “97 % within 0.5 ns”. The fix: “uwb-1 position (4.18, 3.75) m, true (4.00, 3.50), error 0.31 m, GDOP 1.05, 4 anchors” — 30.9 cm moved, GDOP and ellipse unmoved.',
      zh: '载入“一堵砖墙挡住一条路径”。anchor-1 那一行写着 5.33 m，真值 4.76 m，误差 57.1 cm，“75 % 的误差落在 12 ns 内”；另外三行误差都在 1.4 cm 以内，写着“97 % 的误差落在 0.5 ns 内”。定位那一行是 “uwb-1 position (4.18, 3.75) m, true (4.00, 3.50), error 0.31 m, GDOP 1.05, 4 anchors”——位置挪了 30.9 cm，GDOP 与椭圆纹丝未动。' },
    { en: 'Load “Three anchors”. The line ends in “3 anchors”: “uwb-1 position (3.98, 3.48) m, true (4.00, 3.50), error 0.03 m, GDOP 1.26, 3 anchors”, and the ellipse is 2.2 × 1.5 cm. Three rings, still one point: barely less accurate, a fifth less certain.',
      zh: '载入“三个锚点”。定位那一行以 “3 anchors” 结尾：“uwb-1 position (3.98, 3.48) m, true (4.00, 3.50), error 0.03 m, GDOP 1.26, 3 anchors”，椭圆则是 2.2 × 1.5 cm。三个圆环，依然一个点：精度几乎没差，把握弱了两成。' },
  ],
  tryThis: [
    { en: 'Drag the tag around the base scene in the editor, reading GDOP after each block. In the corner at (1, 1) it only reaches 1.18, at (0.6, 0.6) 1.23; anywhere in the room it prints between 1.03 and 1.26. Now load “Three anchors” and drag the tag onto the anchor at (9.5, 0.5): GDOP reaches 2.32.',
      zh: '打开编辑器，在基准场景里把标签拖来拖去，每个块之后看一眼 GDOP。拖进 (1, 1) 的角落它也只升到 1.18，到 (0.6, 0.6) 是 1.23；房间里任何位置印出来都在 1.03 与 1.26 之间。然后载入“三个锚点”，把标签拖到 (9.5, 0.5) 的锚点上：GDOP 会达到 2.32。' },
    { en: 'On “A brick wall in one path”, clear the ranging session’s NLOS switch. The run becomes the base run — the same seven fixes, error back inside 3.3 cm — while anchor-1 still reads “75 % within 12 ns”, because the FoM is geometry and the switch only idealises the delay.',
      zh: '在“一堵砖墙挡住一条路径”里，到编辑器中打开测距会话，把 NLOS 开关关掉。这次运行会变回基准运行——同样的七次定位，误差回到 3.3 cm 以内——而 anchor-1 依旧写着“75 % 的误差落在 12 ns 内”，因为 FoM 报的是几何，而这个开关只是把时延理想化。' },
  ],
  quiz: [
    {
      q: { en: 'The wall makes one range of four 0.60 m too long, yet the fix moves 0.316 m noise-free. Why not 0.60 m?', zh: '砖墙让四条距离里的一条长了 0.60 m，可扣掉噪声后定位只移动了 0.316 m。为什么不是 0.60 m？' },
      options: [
        { en: 'The solver weights each range by its FoM, and 0x7b discounts that one', zh: '解算器按 FoM 给每条距离加权，0x7b 把那一条压低了' },
        { en: 'Least squares cannot satisfy all four residuals: three clean ranges pull back against the long one', zh: '最小二乘无法同时满足四个残差：三条干净的距离把那条偏长的拉了回来' },
        { en: 'The bias is divided by the GDOP of 1.05', zh: '偏差被 1.05 的 GDOP 除了一遍' },
      ],
      answer: 1,
      explain: { en: 'Noise-free the shift is 0.316 m, 53 % of the 0.5996 m bias, away from the blocked anchor, leaving a 21 cm residual.', zh: '扣掉噪声后位移是 0.316 m，即 0.5996 m 偏差的 53 %，方向远离那个被挡住的锚点，并留下 21 cm 的残差。' },
    },
    {
      q: { en: 'The fix is 31 cm out in the walled scene, yet GDOP reads 1.05 and the ellipse 1.7 × 1.4 cm. Why?', zh: '有墙的场景里定位偏了 31 cm，可 GDOP 仍是 1.05，椭圆仍是 1.7 × 1.4 cm。为什么？' },
      options: [
        { en: 'They do grow, but the 10× draw scale hides it', zh: '其实变大了，只是十倍的绘制缩放把它藏了起来' },
        { en: 'Both come from JᵀJ and an assumed σ_r: they predict the scatter of honest ranges, not a biased one', zh: '两者都出自 JᵀJ 与一个假定的 σ_r：它们预测的是诚实距离的散布，而非带偏差的距离' },
        { en: '31 cm is still inside the 8.9 cm envelope', zh: '31 cm 仍落在 8.9 cm 的包络之内' },
      ],
      answer: 1,
      explain: { en: '30.9 cm is three and a half times that envelope. What flags the range is its FoM, 0x7b, and the solver’s residual — 21 cm instead of a micrometre.', zh: '30.9 cm 是该包络的三倍半。真正给这条距离亮红灯的，是它 0x7b 的 FoM，以及解算器的残差——21 cm，而不是一微米。' },
    },
    {
      q: { en: 'Why is GDOP close to 1 for a tag in the middle of four corner anchors?', zh: '标签位于四个角上锚点的中间时，GDOP 为什么接近 1？' },
      options: [
        { en: 'By definition: GDOP is normalised to 1 at the anchors’ centroid', zh: '这是定义使然：GDOP 在锚点形心处被归一化为 1' },
        { en: 'With bearings spread evenly JᵀJ is (N/2)·I, the trace of its inverse 4/N, and GDOP 2/√N = 1.00 at N = 4', zh: '方位角均匀分布时 JᵀJ = (N/2)·I，其逆的迹为 4/N，GDOP = 2/√N，N = 4 时正好 1.00' },
        { en: 'The four ranges are nearly equal there, so their errors cancel', zh: '那里四条距离几乎相等，误差彼此抵消了' },
      ],
      answer: 1,
      explain: { en: 'It reads 1.05 because the anchors are 1.2 m above the tag, so each Jacobian row is only 0.968 to 0.985 long, and they span 9 × 7 m, so no point sees four right angles — the room’s centre is worse, 1.0544.', zh: '它读作 1.05，是因为锚点比标签高 1.2 m，雅可比的每一行只有 0.968 到 0.985 长；而四个锚点张成 9 × 7 m，房间里没有一点能看到四个直角——房间正中反而更差，为 1.0544。' },
    },
  ],
}
