/**
 * UWB Tier 1 · M12 · Ranging sessions and positioning · Where the anchors stand.
 *
 * The second half of the old `uwb-position`: why the same radio, with the same
 * centimetre of noise on every range, produces a better or a worse place
 * depending only on where the anchors were screwed to the wall — and what
 * happens when one range is not noisy but simply wrong.
 *
 * It loads exactly the scene `uwb-position` loads — the same builder, the same
 * two variants — so the split adds no new scenario and the recorded hashes of
 * `uwb-geometry` are `uwb-position`'s, value for value.
 *
 * Every number quoted below is pinned in tests/course/uwb-geometry.test.ts.
 */
import {
  J, N, firstUwbPoll, firstUwbPosition, firstUwbRange, firstUwbRoundEnd, type Lesson,
} from '../lessonKit'
import { uwbPositionScenario } from './uwb-position'

export const uwbGeometry: Lesson = {
  id: 'uwb-geometry',
  module: 12,
  title: { en: 'Where the anchors stand', zh: '锚点站在哪里' },
  why: {
    en: 'Nothing about the radio changes when you move the anchors, and yet the answer gets better or worse. A room fitted out by an electrician who put the anchors where the cable was easy will range just as well and locate just as badly. This lesson prices that: what a layout charges for every centimetre of range error, and what it cannot warn you about at all.',
    zh: '把锚点挪个位置，射频本身什么也没变，可给出的答案却会变好或变坏。一个由电工按“哪儿好走线就装哪儿”布置出来的房间，测距一样准，定位却一样糟。这一课要给这件事定价：一种布局要为每一厘米的测距误差收多少钱，以及它压根无法向你预警的是什么。',
  },
  outcomes: [
    { en: 'say why a layout, not the radio, decides how much a range error costs', zh: '说清决定测距误差代价的是布局，而不是射频' },
    { en: 'read the ellipse the scene draws around a fix, and say which way it points', zh: '读懂场景围着定位画出的那个椭圆，并说出它指向哪边' },
    { en: 'explain why a blocked path moves the fix while every quality figure stays put', zh: '解释为什么一条被挡住的路径会挪动定位，而屏幕上的质量指标纹丝不动' },
  ],
  needs: ['uwb-position'],
  terms: [
    { term: 'GDOP', plain: {
      en: 'geometric dilution of precision: one number saying how much the anchors’ layout multiplies a range error',
      zh: '几何精度因子：用一个数说明锚点的布局会把测距误差放大多少倍',
    } },
    { term: 'NLOS', plain: {
      en: 'non-line-of-sight: the first path to arrive went through something instead of straight across',
      zh: '非视距：最先到达的那条路径是穿过了什么东西，而不是径直过来的',
    } },
    { term: 'FoM', plain: {
      en: 'figure of merit: one byte on each range saying how sharp its first path looked',
      zh: '品质因数：附在每条距离上的一个字节，说明它的首径看上去有多干净利落',
    } },
  ],
  picture: [
    { heading: { en: 'The same radio, a different answer', zh: '同一台射频，不同的答案' }, text: {
      en: 'An error on one range pushes the fix along the line from that anchor to the phone. When the anchors are spread evenly around the phone those pushes point every which way and largely cancel; when they bunch up on one side, the pushes agree and add. That multiplier, boiled down to one number for the whole layout, is the GDOP.',
      zh: '某一条距离上的误差，会把定位沿着“该锚点指向手机”的那条线推一把。当锚点均匀地散在手机四周时，这些推力朝向各异，大体相互抵消；而当它们挤在一侧时，推力方向一致，便叠加起来。把整套布局归结成一个数的这个放大倍数，就是 GDOP。',
    } },
    { text: {
      en: 'So a fix is not equally uncertain in every direction. What the solver hands back is not a dot but an ellipse: long in the direction the anchors leave thin, short where they crowd. The scene draws it around the cross, blown up so that it is visible at all beside rings metres across, while the inspector prints its true size.',
      zh: '所以一次定位在各个方向上的不确定程度并不相同。解算器交回来的不是一个点，而是一个椭圆：锚点覆盖薄弱的方向上它长，锚点拥挤的方向上它短。场景把它画在十字周围，并且放大了画——否则在几米宽的圆环旁边根本看不见——而检视面板照实印出它的真实尺寸。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'Take one anchor away', zh: '拿走一个锚点' }, text: {
      en: 'Load “Three anchors” and compare the fix with the four-anchor run. The cross barely moves; the ellipse grows and swings round to point into the corner the missing anchor used to cover.',
      zh: '载入“三个锚点”，再和四锚点的那次运行对照。十字几乎没动；椭圆却变大了，还转了个方向，指向那个被删掉的锚点原先负责的角落。',
    } },
    { heading: { en: 'A wall in one path', zh: '一条路径上的一堵墙' }, text: {
      en: 'Now a different kind of damage. Put a brick stub between the phone and one anchor and that range comes back too long: the first path to arrive had to cross the brick, and crossing brick takes longer than crossing air. This is an NLOS path, and the other three anchors are still honest.',
      zh: '再来看另一种损伤。在手机和某个锚点之间立一小段砖墙，这条距离就会偏长：最先到达的那条路径不得不穿过砖块，而穿砖比穿空气要慢。这就是一条 NLOS 路径，而另外三个锚点依然诚实。',
    } },
    { heading: { en: 'Three honest ranges against one that lies', zh: '三条诚实的距离，对一条说谎的' }, text: {
      en: 'Least squares cannot satisfy all four, so it splits the difference. The fix slides away from the blocked anchor by roughly half the error on that one range, and the residual jumps from nothing to centimetres. The check works: something is wrong, and the fit says so without being told which range to distrust.',
      zh: '最小二乘无法同时满足四条距离，于是它取了折中。定位朝着远离那个被挡住的锚点的方向滑开，位移大约是那条距离误差的一半，而残差也从“几乎没有”跳到了几厘米。检查生效了：确实出了问题，而且不必有人告诉拟合该怀疑哪一条。',
    } },
    { heading: { en: 'What the ellipse will not tell you', zh: '椭圆不会告诉你的事' }, text: {
      en: 'And here is the expensive part: GDOP and the ellipse do not move. Both are built from directions and an assumed noise, so they describe the scatter of honest ranges and say nothing whatever about a range that is simply wrong. The residual notices, and so does the quality byte the receiver attaches to each range, which is the FoM.',
      zh: '真正昂贵的地方在这里：GDOP 和椭圆一动不动。两者都是由方向和一个假定的噪声拼出来的，因此它们描述的是诚实距离的散布，而对一条干脆就是错的距离无话可说。察觉到它的是残差，以及接收端附在每条距离上的那个品质字节，也就是 FoM。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'What the geometry charges', zh: '几何开出的价码' }, text: {
      en: 'GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹',
      zh: 'GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹',
    }, note: {
      en: 'With four anchors whose bearings are spread evenly around the point, GDOP would be exactly 1.00. This room misses that twice over: the anchors are above the phone, and they span a rectangle rather than a square.',
      zh: '若四个锚点的方位角绕待测点均匀分布，GDOP 会恰好是 1.00。这个房间在两件事上都没做到：锚点比手机高，而且它们张成的是长方形而不是正方形。',
    } },
    { kind: 'table', heading: { en: 'Three scenes, the same radio', zh: '三个场景，同一台射频' }, head: [
      { en: 'Scene', zh: '场景' }, { en: 'GDOP', zh: 'GDOP' }, { en: '1-σ ellipse', zh: '1σ 椭圆' },
      { en: 'First fix', zh: '首次定位' }, { en: 'Error', zh: '误差' },
    ], rows: [
      [{ en: 'Four anchors', zh: '四个锚点' }, N('1.05'), N('1.7 × 1.4 cm'), N('(3.99, 3.50) m'), N('0.7 cm')],
      [{ en: 'A brick wall in one path', zh: '一堵砖墙挡住一条路径' }, N('1.05'), N('1.7 × 1.4 cm'), N('(4.18, 3.75) m'), N('30.9 cm')],
      [{ en: 'Three anchors', zh: '三个锚点' }, N('1.26'), N('2.2 × 1.5 cm'), N('(3.98, 3.48) m'), N('2.7 cm')],
    ] },
    { text: {
      en: 'Four corner anchors hold this room between 1.03 and 1.26 wherever the phone stands. Delete a corner and that floor goes with it: standing directly under one of the three remaining anchors, the figure reaches 2.32.',
      zh: '只要四角都有锚点，这个房间里无论手机站在哪儿，这个数都落在 1.03 与 1.26 之间。删掉一角，这条底线也跟着没了：站在余下三个锚点中某一个的正下方时，它会达到 2.32。',
    } },
    { heading: { en: 'What one wall costs', zh: '一堵墙的代价' }, text: {
      en: 'A first path through brick arrives 2.0 ns late, which is 0.5996 m of flight.',
      zh: '穿过砖墙的首径迟到 2.0 ns，折合 0.5996 m 的飞行距离。',
    } },
    { text: {
      en: 'The blocked range reads 5.33 m against a true 4.76 m in the first block, and over seven blocks the bias averages 59.4 cm — within a third of a σ_r of the ideal figure above.',
      zh: '第一个块里，这条被挡住的距离报出 5.33 m，真值是 4.76 m；七个块平均下来，偏差是 59.4 cm——与上面那个理想值相差不到三分之一个 σ_r。',
    } },
    { heading: { en: 'What it does to the fix', zh: '它对定位做了什么' }, text: {
      en: 'The fix moves 30.9 cm, not 60. Noise-free the shift is 0.316 m, 53 % of the bias, on a bearing that points away from the blocked anchor.',
      zh: '而定位只挪了 30.9 cm，不是 60。扣掉噪声，位移是 0.316 m，即偏差的 53 %，方向背离那个被挡住的锚点。',
    } },
    { text: {
      en: 'Inside the solver it leaves a 21 cm residual where a clean round leaves a micrometre, and no record carries that figure — on screen, nothing moves. That 30.9 cm is three and a half times the 8.9 cm envelope the geometry promises.',
      zh: '在解算器内部，它留下 21 cm 的残差，而干净的一轮只留下一微米；这个数不写进任何记录——屏幕上什么也没动。那 30.9 cm 是几何所许诺的 8.9 cm 包络的三倍半。',
    } },
    { kind: 'table', heading: { en: 'The byte on each range, walled scene', zh: '有墙的场景里每条距离上的字节' }, head: [
      { en: 'Range', zh: '距离' }, { en: 'Error', zh: '误差' }, { en: 'FoM', zh: 'FoM' },
    ], rows: [
      [N('anchor-1'), N('57.1 cm'), N('0x7b — 75 % within 12 ns')],
      [{ en: 'the other three', zh: '另外三条' }, { en: 'under 1.4 cm', zh: '不到 1.4 cm' }, N('0x16 — 97 % within 0.5 ns')],
    ] },
    { text: {
      en: 'The byte reports geometry, not the delay: clear the session’s NLOS switch and the range returns to centimetres while the byte reads the same. And this solver never looks at it — all four ranges weigh alike.',
      zh: '这个字节报告的是几何，而不是那段时延：把会话的 NLOS 开关关掉，距离会回到厘米级，而字节读出来还是原样。而且本解算器根本不看它——四条距离一视同仁。',
    } },
    { kind: 'steps', heading: { en: 'How the layout gets priced, step by step', zh: '布局是怎样被定价的，一步一步' }, items: [
      { en: 'Wait for the fit of the last lesson to stop, and take the point it stopped on. Everything below is computed there and nowhere else.',
        zh: '等上一课那套拟合停下来，取它停住的那个点。以下每一步都在这个点上算，别处不算。' },
      { en: 'For each anchor used, take the unit vector from anchor to that point and keep its horizontal (x, y) part. That row holds a direction only: the measured distance has already divided itself out of it.',
        zh: '对用到的每个锚点，取从锚点指向该点的单位向量，只留水平 (x, y) 分量。这一行里只有方向：实测的距离已经在相除时约掉了。' },
      { en: 'Sum the rows into the two-by-two JᵀJ — Σuₓ², Σuₓu_y, Σu_y² — and take its determinant. Under 1e-9 there is no answer at all: those directions cannot pin a point down.',
        zh: '把各行累加成二乘二的 JᵀJ——Σuₓ²、Σuₓu_y、Σu_y²——再取它的行列式。小于 1e-9 就根本没有答案：这些方向钉不住一个点。' },
      { en: 'Invert JᵀJ. The inverse is what this layout charges for a metre of range error.',
        zh: '把 JᵀJ 求逆。这个逆矩阵就是本布局为每一米测距误差开出的价码。' },
      { en: 'Add the two diagonal entries of the inverse and take the square root. That is the GDOP the fix line prints, rounded to two places.',
        zh: '把逆矩阵对角线上的两项相加，再开平方。这就是定位那一行印出的 GDOP，保留两位小数。' },
      { en: 'Multiply the inverse by σ_r², the 2.12 cm range noise squared. The square roots of that matrix’s two eigenvalues are the ellipse’s semi-axes; ½·atan2(2Σ_xy, Σ_xx − Σ_yy) is its long axis’s angle.',
        zh: '再把整个逆矩阵乘以 σ_r²，也就是 2.12 cm 测距噪声的平方。所得矩阵两个特征值的平方根，就是椭圆的两条半轴，而 ½·atan2(2Σ_xy, Σ_xx − Σ_yy) 就是它长轴的倾角。' },
      { en: 'Notice what never entered: no step after the first read a measured range. A merely noisy range and a simply wrong one give the identical GDOP and ellipse — only the point of step 1 moves.',
        zh: '请注意什么自始至终没有进来：第一步之后，没有哪一步读过实测的距离。一条只是带噪声的距离，和一条干脆就是错的距离，给出的 GDOP 与椭圆一模一样——动的只有第一步那个点。' },
    ] },
    { kind: 'table', heading: { en: 'The four corners, run through those steps', zh: '四个角，照着这些步骤走一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [N('anchor-1, anchor-2'), N('(0.7348, 0.6298) · (−0.8622, 0.4703)')],
      [N('anchor-3, anchor-4'), N('(0.6423, −0.7341) · (−0.7964, −0.5792)')],
      [N('JᵀJ'), N('2.3302, 0.0470, 1.4922 · det 3.4750')],
      [N('(JᵀJ)⁻¹'), N('0.4294, −0.0135, 0.6706')],
      [N('GDOP'), N('√(0.4294 + 0.6706) = √1.1000 = 1.0488')],
      [N('Σ = σ_r²(JᵀJ)⁻¹'), { en: '1.74 × 1.39 cm, −86.8°', zh: '1.74 × 1.39 cm，−86.8°' }],
    ] },
  ],
  deeper: [
    { heading: { en: 'Why evenly spread anchors give exactly 1.00', zh: '为什么均匀分布的锚点恰好给出 1.00' }, text: {
      en: 'For N anchors whose bearings are spread evenly around the point, and whose Jacobian rows are full unit vectors, JᵀJ is exactly (N/2)·I, the trace of its inverse is 4/N and GDOP is 2/√N — 1.00 at four anchors. This scene reads 1.0488 for two reasons. The anchors are at 2.20 m and the phone at 1.00 m, so each row is the horizontal shadow of a slanted unit vector, only 0.968 to 0.985 long. And the anchors span 9 × 7 m, so from the phone the bearings are 64.6°, 89.4°, 95.2° and 110.8° apart. The room’s centre is no better: 1.0544 against 1.0488.',
      zh: '若 N 个锚点的方位角绕待测点均匀分布，而雅可比的每一行都是完整的单位向量，那么 JᵀJ 恰好等于 (N/2)·I，其逆的迹为 4/N，于是 GDOP = 2/√N——四个锚点时是 1.00。本场景读作 1.0488，原因有二。锚点在 2.20 m 而手机在 1.00 m，于是每一行都是斜向单位向量的水平投影，长度只有 0.968 到 0.985。此外四个锚点张成 9 × 7 m，从手机看过去，方位角间隔是 64.6°、89.4°、95.2° 与 110.8°。房间正中还要更差一点：1.0544 对 1.0488。',
    } },
    { heading: { en: 'The ellipse, axis by axis', zh: '逐轴看那个椭圆' }, text: {
      en: 'Σ = σ_r²(JᵀJ)⁻¹ scales with σ_r, so the axes are σ_r times a pure number of the geometry. With four anchors the ellipse is 1.7 × 1.4 cm, its long axis nearly north–south at −86.8° from +x, and its axis ratio 1.25; the scene draws it ten times over — a 17 cm semi-axis — while the inspector prints the true 1.7 × 1.4 cm. Drop the far corner and it grows to 2.2 × 1.5 cm, the ratio to 1.44, and the long axis swings to +61.5°, into the quadrant the anchor left empty.',
      zh: 'Σ = σ_r²(JᵀJ)⁻¹ 与 σ_r 成正比，所以两条轴都是 σ_r 乘上一个纯由几何决定的数。四个锚点时椭圆是 1.7 × 1.4 cm，长轴几乎南北向，与 +x 轴成 −86.8°，长短轴之比 1.25；场景把它放大十倍来画——长半轴 17 cm——而检视面板照实印出 1.7 × 1.4 cm。删掉远端那一角，它胀到 2.2 × 1.5 cm，比值变成 1.44，长轴摆到 +61.5°，摆进被删掉的锚点空出来的那个象限。',
    } },
    { heading: { en: 'Standing under an anchor', zh: '站在锚点正下方' }, text: {
      en: 'Drag the phone onto the anchor at (9.5, 0.5) in the three-anchor scene and GDOP reaches 2.3201. Directly beneath an anchor, that anchor’s range is blind to horizontal motion: its Jacobian row is exactly zero and drops out of JᵀJ altogether, leaving two anchors 37.9° apart to carry the fix by themselves. With all four anchors the same spot is unremarkable — 1.24, still inside the room’s band.',
      zh: '在三锚点场景里把手机拖到 (9.5, 0.5) 的锚点上，GDOP 会达到 2.3201。正站在一个锚点下方时，它的距离对水平移动毫无感觉：那一行雅可比恰好为零，整个从 JᵀJ 里掉了出去，只剩两个相隔 37.9° 的锚点独力撑着这次定位。而四个锚点都在时，同一个位置平平无奇——1.24，仍落在这个房间的区间之内。',
    } },
  ],
  sources: [
    { en: 'One thing here is the standard’s: §10.29.1.7 of IEEE Std 802.15.4-2024, with Tables 10-146, 10-147 and 10-148, defines the Figure of Merit byte — how the log tells an obstructed first path from a clean one.',
      zh: '本课只有一处以标准为依据：IEEE Std 802.15.4-2024 的 §10.29.1.7 连同表 10-146、10-147、10-148 定义了品质因数字节——日志正是靠它区分首径是被挡住的还是干净的。' },
    { en: 'GDOP and the 1-σ ellipse are the model’s own, computed from the solver’s Jacobian and an assumed σ_r; the standard says nothing about either.',
      zh: 'GDOP 与 1σ 椭圆都是仿真器自己的模型取值，由解算器的雅可比矩阵和一个假定的 σ_r 算出；标准正文对两者只字未提。' },
    { en: 'A wall’s excess delay is a model choice: 2.0 ns for brick, 0.5 ns for drywall and 0.2 ns for glass. So is the ten-times draw scale of the ellipse, which exists only so that a centimetre-sized shape is visible beside metre-sized rings.',
      zh: '墙体的额外时延是模型取值：砖墙 2.0 ns、石膏板 0.5 ns、玻璃 0.2 ns。椭圆放大十倍绘制也是模型取值，它存在的唯一理由，是让一个厘米量级的形状在米量级的圆环旁边还看得见。' },
  ],
  scenario: () => uwbPositionScenario('base'),
  variants: [
    { label: { en: 'A brick wall in one path', zh: '一堵砖墙挡住一条路径' }, scenario: () => uwbPositionScenario('wall') },
    { label: { en: 'Three anchors', zh: '三个锚点' }, scenario: () => uwbPositionScenario('three') },
  ],
  jumps: [
    J('the phone’s Poll opens the round', '手机的 Poll 开启这一轮', firstUwbPoll),
    J('the first finished range', '第一个算完的距离', firstUwbRange),
    J('the fix this block’s ranges make', '这个块的距离解出的定位', firstUwbPosition),
    J('the round ends', '这一轮结束', firstUwbRoundEnd),
  ],
  observe: [
    { en: 'Load “A brick wall in one path”. The anchor-1 range row is long by more than half a metre while the other three are within a centimetre or two, and its quality byte is the only one that differs.',
      zh: '载入“一堵砖墙挡住一条路径”。anchor-1 那一行的距离偏长了半米有余，另外三行都在一两厘米之内；而它的品质字节，是四行里唯一不一样的。' },
    { en: 'Read the fix line on that run. The point has moved about a third of a metre, yet the figures beside it are the ones the clean run printed, to the last digit.',
      zh: '再读那次运行的定位一行。点已挪了约三分之一米，可旁边的那些数字，和干净那次印出的一模一样，连最后一位都不差。' },
    { en: 'Load “Three anchors”. The line now ends in three anchors instead of four, the inspector’s ellipse is visibly bigger, and its long axis has swung towards the empty corner.',
      zh: '载入“三个锚点”。这一行现在以三个锚点结尾，不再是四个；检视面板里的椭圆明显变大，长轴也朝着空出来的那个角落摆了过去。' },
  ],
  tryThis: [
    { en: 'Drag the phone around the base scene, reading GDOP after each block: anywhere in the room it prints between 1.03 and 1.26, and even the corner at (1, 1) only reaches 1.18.',
      zh: '在基准场景里把手机拖来拖去，每个块之后看一眼 GDOP：房间里任何位置印出来都在 1.03 与 1.26 之间，连 (1, 1) 那个角落也只升到 1.18。' },
    { en: 'On “A brick wall in one path”, clear the session’s NLOS switch. The run becomes the clean one — the same seven fixes, the error back to a few centimetres — while the anchor-1 row still carries the blocked-path byte.',
      zh: '在“一堵砖墙挡住一条路径”里，把会话的 NLOS 开关关掉。这次运行会变回干净的那次——同样的七次定位，误差回到几厘米——而 anchor-1 那一行带的仍然是“被挡住的路径”那个字节。' },
  ],
  quiz: [
    {
      q: { en: 'The wall makes one range of four 0.60 m too long, yet the fix moves 0.316 m noise-free. Why not 0.60 m?', zh: '砖墙让四条距离里的一条长了 0.60 m，可扣掉噪声后定位只移动了 0.316 m。为什么不是 0.60 m？' },
      options: [
        { en: 'The solver weights each range by its FoM, which discounts that one', zh: '解算器按 FoM 给每条距离加权，把那一条压低了' },
        { en: 'Least squares cannot satisfy all four: three clean ranges pull back against the long one', zh: '最小二乘无法同时满足四条：三条干净的距离把那条偏长的拉了回来' },
        { en: 'The bias is divided by the GDOP', zh: '偏差被 GDOP 除了一遍' },
      ],
      answer: 1,
      explain: { en: 'Noise-free the shift is 53 % of the bias, away from the blocked anchor, and it leaves a 21 cm residual behind it.', zh: '扣掉噪声后位移是偏差的 53 %，方向远离那个被挡住的锚点，并在身后留下 21 cm 的残差。' },
    },
    {
      q: { en: 'The fix is 31 cm out in the walled scene, yet GDOP and the ellipse read what they read on the clean run. Why?', zh: '有墙的场景里定位偏了 31 cm，可 GDOP 与椭圆读出来和干净那次一样。为什么？' },
      options: [
        { en: 'They do grow, but the draw scale hides it', zh: '其实变大了，只是绘制时的放大倍数把它藏了起来' },
        { en: 'Both come from JᵀJ and an assumed σ_r: they predict the scatter of honest ranges', zh: '两者都出自 JᵀJ 与一个假定的 σ_r：它们预测的是诚实距离的散布' },
        { en: 'The error is still inside the envelope they promise', zh: '这个误差仍落在它们所许诺的包络之内' },
      ],
      answer: 1,
      explain: { en: 'It is three and a half times that envelope. What flags the range is its FoM and the solver’s residual.', zh: '它是那个包络的三倍半。真正给这条距离亮红灯的，是它的 FoM 和解算器的残差。' },
    },
    {
      q: { en: 'Why is GDOP close to 1 in the middle of four corner anchors?', zh: '位于四个角上锚点的中间时，GDOP 为什么接近 1？' },
      options: [
        { en: 'By definition: it is normalised at the anchors’ centroid', zh: '这是定义使然：它在锚点形心处被归一化' },
        { en: 'With bearings spread evenly the pushes cancel: four of them give exactly 1.00', zh: '方位角均匀分布时推力相互抵消：四个这样的锚点恰好给出 1.00' },
        { en: 'The four ranges are nearly equal there, so their errors cancel', zh: '那里四条距离几乎相等，误差彼此抵消了' },
      ],
      answer: 1,
      explain: { en: 'It reads a little above 1.00 here: the anchors are above the phone and span a rectangle, so no point sees four right angles.', zh: '这里它比 1.00 略高：锚点比手机高，而且张成的是长方形，房间里没有一点能看到四个直角。' },
    },
  ],
}
