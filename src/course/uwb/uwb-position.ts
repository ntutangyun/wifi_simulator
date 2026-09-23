/**
 * UWB Tier 1 · M12 · Ranging sessions and positioning · From four ranges to a point.
 *
 * The lessons before this one produced distances. This one turns them into a
 * place: four rings that never quite meet, a solver that picks the spot fitting
 * all of them least badly, and the residual it leaves behind as its own opinion
 * of the fit.
 *
 * Why the same radio does better or worse depending on where the anchors stand
 * — GDOP, the error ellipse, an obstructed path — is the next lesson,
 * `uwb-geometry`, which loads exactly this scene and these variants, so the
 * split adds no new scenario and the recorded hashes of the two ids are equal.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). Every
 * number quoted below is pinned in tests/course/uwb-position.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-position en` prints the section budgets.
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
  module: 12,
  title: { en: 'From four ranges to a point', zh: '从四个距离到一个点' },
  why: {
    en: 'A distance to an anchor is not a place. Your phone has four of them, all measured a few milliseconds apart, all a centimetre or two out, and it has to answer the only question the user asked: where am I standing? This lesson does that arithmetic, and shows how the answer tells you when to believe it.',
    zh: '到某个锚点有多远，并不等于人在哪儿。手机手里有四个这样的距离，彼此只差几毫秒测得，每一个都差着一两厘米，而它要回答的只有用户真正问的那个问题：我现在站在哪里？这一课做的就是这笔算术，并且说清这个答案本身如何告诉你该不该相信它。',
  },
  outcomes: [
    { en: 'say why four rings do not meet at a point, and what the solver does instead', zh: '说清为什么四个圆环交不到一点，以及解算器改做了什么' },
    { en: 'read a fix off the log and check it against the truth beside it', zh: '从日志里读出一次定位，并对照旁边的真值检查它' },
    { en: 'say what the fit cannot explain — the residual — and why the log never prints it', zh: '说出拟合解释不掉的那一部分（残差）是什么，以及日志为什么从不把它印出来' },
  ],
  needs: ['uwb-blocks', 'uwb-dstwr'],
  terms: [
    { term: 'trilateration', plain: {
      en: 'finding a place from distances alone: each distance is a circle, and the place is where they cross',
      zh: '只靠距离把位置找出来：每个距离是一个圆，而位置就落在这些圆相交的地方',
    } },
    { term: 'residual', plain: {
      en: 'what the best answer still cannot explain — how far the measurements miss it, once it has been chosen',
      zh: '最优答案仍然解释不掉的那部分——答案定下来之后，各个测量离它还差多少',
    } },
  ],
  picture: [
    { heading: { en: 'Four rings, one place', zh: '四个圆环，一个位置' }, text: {
      en: 'Each anchor knows exactly one thing about the phone: how far away it is. Draw a circle of that radius around the anchor and the phone is somewhere on it. Two circles cross in two places, and a third settles which. That is trilateration, and the scene draws the rings for you at the radii just measured.',
      zh: '每个锚点只知道关于这部手机的一件事：它有多远。以这个距离为半径，绕着锚点画一个圆，手机就落在这个圆上的某处。两个圆相交于两点，第三个圆则决定是哪一点。这就是 trilateration（三边定位），而场景会按刚测出的半径，把这些圆替你画出来。',
    } },
    { text: {
      en: 'They never quite meet. A centimetre of noise on each radius leaves not a crossing point but an untidy little region, and no place on the floor satisfies all four measurements at once. So the solver stops looking for a crossing: it looks for the place that fits all four least badly, and walks a trial point downhill until moving it further stops helping.',
      zh: '它们从来交不到一处。每条半径上一厘米的噪声，留下的不是一个交点，而是一小块不齐整的区域；地面上没有任何一点能同时满足四个测量。于是解算器不再去找交点：它要找的是那个对四个距离都“最不亏欠”的位置，做法是让一个试探点一路往下走，直到再挪也无益为止。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'Watch the point appear', zh: '看那个点浮出来' }, text: {
      en: 'Load the simulation and jump to the fix. At the end of the phone’s round a cross appears where the solver landed, with the four rings that produced it fading around it.',
      zh: '载入仿真，跳到定位那一行。在手机这一轮的末尾，解算器落脚的地方出现一个十字，产生它的那四个圆环则在周围慢慢淡去。',
    } },
    { heading: { en: 'The fourth ring is the check', zh: '第四个圆环是那道检查' }, text: {
      en: 'Three ranges would already give an answer. The fourth is what tells you the answer is any good. With more measurements than unknowns no point can satisfy them all, and what is left over — the residual — is the solver’s own opinion of the fit. A clean round leaves a residual under a micrometre. A range that lies leaves centimetres, and the solver knows that without being told which range lied — but no record carries the figure, so on screen nothing moves.',
      zh: '三个距离就已经能给出答案了，第四个的用处是告诉你这个答案好不好。测量比未知数多的时候，没有哪一点能把它们全部满足，剩下的那一点点——也就是残差——正是解算器对这次拟合的自我评价。干净的一轮，残差不到一微米；而只要有一条距离在说谎，残差就是几厘米——不必有人告诉解算器是哪一条在说谎，它已经知道了。可是没有任何记录带着这个数，所以屏幕上什么也不会动。',
    } },
    { heading: { en: 'Two unknowns, not three', zh: '两个未知数，不是三个' }, text: {
      en: 'Only the floor coordinates are solved for; the phone’s height is handed to the solver as something already known. That is not a simplification the standard asked for — it is what makes four ranges comfortable rather than barely enough, and it is why every anchor being near the ceiling costs so little here.',
      zh: '真正求解的只有地面上的那两个坐标；手机的高度是当作已知交给解算器的。这不是标准要求的简化——正是它让四个距离显得从容，而不是勉强够用，也正是因此，所有锚点都挂在天花板附近这件事，在这里几乎不用付什么代价。',
    } },
    { heading: { en: 'One fix, one round', zh: '一轮，一个点' }, text: {
      en: 'A fix costs a whole round. The ranges arrive one anchor at a time, and the point is only computed once the last of them is in — so the phone’s lane carries one cross at the end of each round and nothing in between. Between fixes the phone knows where it was, not where it is.',
      zh: '一次定位要花掉整整一轮。各个距离是一个锚点一个锚点陆续到齐的，而只有最后一个到手，才会算出那个点——所以手机的泳道上，每一轮的末尾有一个十字，中间什么也没有。两次定位之间，手机知道的是自己刚才在哪儿，不是现在在哪儿。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'What the solver actually minimises', zh: '解算器到底在最小化什么' }, text: {
      en: 'r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r',
      zh: 'r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r',
    }, note: {
      en: 'Anchor i’s residual at a trial point p is how much further p is from it than the measurement claims; the best place minimises the four squared residuals. The engine starts at the anchors’ centroid and stops when a step falls under 1 mm, or after 20 iterations.',
      zh: '锚点 i 在试探点 p 处的残差，就是 p 比测量所说的离它远了多少；最优位置让这四个残差的平方和最小。引擎从锚点形心出发，直到某一步小于 1 mm、或迭代满 20 次为止。',
    } },
    { text: {
      en: 'Rows carry only the horizontal part, because the height is not solved for. Fed exact distances the solver converges to within a micrometre; fed fewer than three, or anchors standing in a line, it refuses to answer at all.',
      zh: '每一行只取水平分量，因为高度并不参与求解。喂给它精确的距离，它收敛到与真值相差不足一微米；而可用的距离少于三个、或者锚点恰好排成一条直线时，它干脆拒绝作答。',
    } },
    { kind: 'formula', heading: { en: 'How noisy one range is', zh: '单次测距有多吵' }, text: {
      en: 'σ_r = c · σ_ts / √2 = 2.12 cm',
      zh: 'σ_r = c · σ_ts / √2 = 2.12 cm',
    }, note: {
      en: 'The opening lesson’s 2.1 cm of range-noise sigma is this same σ_r, at 100 ps of timestamp noise: a range carries two noisy receive counters, which add in quadrature and are then halved. It is the single-sided figure, kept as a conservative stand-in — a double-sided round scatters a little less, 1.8–1.9 cm.',
      zh: '开篇那一课引用的 2.1 cm 测距噪声，正是这里的 σ_r，对应 100 ps 的时间戳噪声：一次测距里有两个带噪声的接收计数，它们按平方和相加，随后又被折半。这是单边测距的取值，作为偏保守的替代值一直沿用；双边测距实际上散得略小一些，1.8 到 1.9 cm。',
    } },
    { kind: 'table', heading: { en: 'What the log prints at the end of a round', zh: '一轮末尾日志印出什么' }, head: [
      { en: 'Line', zh: '行' }, { en: 'It reads', zh: '写的是' },
    ], rows: [
      [{ en: 'The fix of block 0', zh: '第 0 块的定位' }, N('uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors')],
      [{ en: 'Its error, as the inspector prints it', zh: '检视面板印出的误差' }, N('0.7 cm')],
      [{ en: 'The seven fixes of the run', zh: '整段运行的七次定位' }, N('0.7, 3.3, 0.5, 2.3, 2.8, 0.5, 1.8 cm')],
    ] },
    { text: {
      en: 'One fix per block, seven of them in this run, each a whole block after the last. The error runs from half a centimetre to a little over three — a few times σ_r, which is exactly what four noisy rings should produce. The fix line prints a GDOP (the price the anchors’ own layout puts on that error) beside it; the next lesson is about nothing else.',
      zh: '每个块一次定位，本次运行共七次，每一次都比上一次晚整整一个块。误差在半厘米到三厘米出头之间——不过是 σ_r 的几倍，而这正是四个带噪声的圆环应该给出的结果。定位行里还并排印着一个 GDOP（锚点自身的摆放给这份误差开出的价码）；下一课讲的就只有它。',
    } },
    { kind: 'steps', heading: { en: 'From four ranges to one point, step by step', zh: '从四个距离到一个点，一步一步' }, items: [
      { en: 'Gather the ranges this round finished and match each to an anchor whose coordinates the tag holds. Fewer than three matched, and the round emits nothing.',
        zh: '把这一轮算完的距离收齐，逐条对上标签手里存有坐标的那个锚点。能对上的不足三条，这一轮什么也不发出。' },
      { en: 'Put the trial point at the mean of the x and of the y of those anchors — here the centre of the four corners, (5.00, 4.00) m.',
        zh: '把试探点放在这些锚点 x 的平均值与 y 的平均值上——在本场景里就是四个角的中心，(5.00, 4.00) m。' },
      { en: 'At the trial point take each anchor’s three-dimensional distance, the tag’s height held at its configured 1.00 m, and subtract the measured range: that difference is the anchor’s residual r_i.',
        zh: '在试探点上算出到每个锚点的三维距离——标签高度按配置值 1.00 m 固定不动——再减去实测的距离：这个差就是该锚点的残差 r_i。' },
      { en: 'Take the unit vector from anchor to trial point and keep its horizontal (x, y) part: that pair is the anchor’s row of J.',
        zh: '取从锚点指向试探点的单位向量，只留它的水平 (x, y) 分量：这一对数就是该锚点在 J 里的那一行。' },
      { en: 'Solve (JᵀJ) δ = −Jᵀ r and move the trial point by δ. A determinant under 1e-9 means the layout cannot fix a point, and the round ends with nothing.',
        zh: '解出 (JᵀJ) δ = −Jᵀ r，把试探点挪动 δ。行列式小于 1e-9，说明这套布局定不出点来，这一轮就空手结束。' },
      { en: 'Repeat the last three steps until δ is shorter than 1 mm, or twenty iterations have gone by.',
        zh: '把上面三步重复下去，直到 δ 短于 1 mm，或者迭代满二十次。' },
      { en: 'At the point it stopped on, build r once more: √(Σ r_i² / n) is what the fit could not explain. The record goes out as UWB_POSITION, which does not carry that figure.',
        zh: '在它停下的那个点上把 r 再算一遍：√(Σ r_i² / n) 就是拟合解释不掉的那一部分。记录以 UWB_POSITION 发出，而这个数并不在记录里。' },
      { en: 'The error in the log is the formatter’s, not the solver’s: the record carries estimate and true place side by side, and the distance between them is printed. A tag in a real room has no truth column.',
        zh: '日志里那个误差是格式化时算的，不是解算器算的：记录把估计值与真实位置并排带着，印出的是两者之间的距离。真实房间里的标签没有“真值”这一栏。' },
    ] },
    { kind: 'table', heading: { en: 'Block 0 of the run, through those steps', zh: '本次运行的第 0 块，照着这些步骤走一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'The four ranges it matched', zh: '对上的那四条距离' }, N('4.7368, 6.3831, 5.4439, 6.8922 m')],
      [{ en: 'Trial point starts at', zh: '试探点起于' }, N('(5.00, 4.00) m')],
      [{ en: 'Where the iteration stopped', zh: '迭代停在' }, N('(3.9933, 3.4981) m')],
      [{ en: 'Root mean square residual there', zh: '该处残差的均方根' }, N('1.44 cm')],
      [{ en: 'The tag’s true place', zh: '标签的真实位置' }, N('(4.00, 3.50) m')],
      [{ en: 'So the formatter prints', zh: '于是格式化后印出' }, N('error 0.01 m — 0.69 cm')],
    ] },
  ],
  deeper: [
    { heading: { en: 'Why Gauss–Newton and not something cleverer', zh: '为什么是高斯－牛顿，而不是更聪明的办法' }, text: {
      en: 'The residual is not a linear function of the position, but its gradient is cheap and well behaved: a unit vector per anchor. Gauss–Newton therefore converges in a handful of steps from the anchors’ centroid, which is always inside the convex hull and so never on the wrong side of an ambiguity. A closed-form solution exists for exactly three ranges; it is not used here, because it throws away the fourth measurement, and the fourth measurement is the whole point of the check.',
      zh: '残差并不是位置的线性函数，但它的梯度既便宜又规矩：每个锚点贡献一个单位向量。因此高斯－牛顿从锚点形心出发，几步就能收敛，而形心永远落在凸包内部，不会跑到二义解的另一侧。恰好三个距离时是有闭式解的，这里不用它，因为它会把第四个测量扔掉——而第四个测量正是那道检查的全部意义所在。',
    } },
    { heading: { en: 'What the residual is not', zh: '残差不是什么' }, text: {
      en: 'A small residual says the four measurements agree with each other, not that they are right. Move every anchor a metre east in the editor without telling the solver and the residual stays tiny while the fix is a metre out. Consistency and accuracy are different questions, and only one of them a phone can check by itself.',
      zh: '残差小，说明的是四个测量彼此一致，而不是它们正确。在编辑器里把每个锚点都往东挪一米、却不告诉解算器，残差依旧很小，而定位整整偏了一米。一致与准确是两个不同的问题，而标签自己能查的只有其中一个。',
    } },
  ],
  sources: [
    { en: 'The standard says nothing at all about how a phone turns ranges into a point: IEEE Std 802.15.4-2024 defines the ranging exchange and the timestamps, and stops there. Everything in this lesson after the ranges is the simulator’s own model.',
      zh: '标准对“标签怎样把几个距离变成一个点”只字未提：IEEE Std 802.15.4-2024 定义的是测距交互与时间戳，到此为止。本课里距离之后的一切，都是仿真器自己的模型。' },
    { en: 'The model choices, named so you can argue with them: Gauss–Newton least squares on (x, y) with the phone’s height known, a start at the anchors’ centroid, a 1 mm step threshold, at most 20 iterations, and a refusal to answer under three ranges.',
      zh: '下面这些是仿真器自己的模型取值，列出来方便你质疑：对 (x, y) 做高斯－牛顿最小二乘、标签高度视为已知、从锚点形心起步、步长阈值 1 mm、最多 20 次迭代，以及可用距离不足三个时拒绝作答。' },
    { en: 'σ_r = c · σ_ts / √2 is exact for single-sided ranging; the double-sided figure is 0.62–0.65 · c · σ_ts, and the single-sided value is kept as the documented conservative model. The 100 ps of timestamp noise it is evaluated at is itself a model choice.',
      zh: 'σ_r = c · σ_ts / √2 对单边测距是精确的；双边测距的取值是 0.62–0.65 · c · σ_ts，而模型有意沿用偏保守的单边值。它所代入的 100 ps 时间戳噪声，本身也是一个模型取值。' },
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
    J('the next block’s fix', '下一个块的定位', secondBlockFix),
  ],
  observe: [
    { en: 'One fix per block, at the end of the phone’s round. The position line names the estimate, the truth beside it and the distance between the two; across the run that distance never leaves the low centimetres.',
      zh: '每个块一次定位，落在标签那一轮的末尾。定位那一行写出估计值、紧挨着的真值，以及两者之间的距离；整段运行里，这个距离始终停在几厘米的量级。' },
    { en: 'In the scene: four amber rings at the ranges just measured, and a cross where the solver put the phone. Both fade away over one block, then the next round draws them again a centimetre or two elsewhere.',
      zh: '场景里：四圈琥珀色的环，半径是刚测出的距离；还有一个十字，标着解算器认为标签所在的位置。两者在一个块之内淡去，下一轮又在一两厘米之外重新画出。' },
    { en: 'Step through the round and watch the ranges arrive one anchor at a time. The cross appears only after the last of them: until then the phone has nothing to solve.',
      zh: '单步走过这一轮，看各个距离怎样一个锚点一个锚点地到齐。十字只在最后一个到手之后才出现：在那之前，标签手里没有可解的东西。' },
  ],
  tryThis: [
    { en: 'In the editor, move the phone a metre to one side and run again. Every ring changes radius, the cross follows it, and the error stays where it was — the fit is as good in the new place as in the old.',
      zh: '在编辑器里把手机往旁边挪一米再跑一遍。每个圆环的半径都变了，十字跟着过去，而误差还在原来的量级——换个位置，拟合得一样好。' },
  ],
  quiz: [
    {
      q: { en: 'Why does the solver not simply cross the four circles?', zh: '解算器为什么不干脆把四个圆求交？' },
      options: [
        { en: 'Crossing circles is too expensive for a phone', zh: '求圆的交点对手机来说太费算力' },
        { en: 'Noise on each radius means no point lies on all four; it takes the place that fits them least badly', zh: '每条半径上都有噪声，没有哪一点同时落在四个圆上；它取的是对四者最不亏欠的位置' },
        { en: 'Three circles already cross at a point, so the fourth is ignored', zh: '三个圆已经交于一点，第四个就被忽略了' },
      ],
      answer: 1,
      explain: { en: 'A centimetre of noise on each radius leaves a small untidy region rather than a crossing, and least squares picks one place inside it.', zh: '每条半径上一厘米的噪声，留下的是一小块不齐整的区域而不是交点，而最小二乘在其中挑出一个位置。' },
    },
    {
      q: { en: 'What does a residual of a few centimetres tell you?', zh: '几厘米的残差说明了什么？' },
      options: [
        { en: 'The fix is a few centimetres from the truth', zh: '定位与真值差了几厘米' },
        { en: 'The four measurements disagree with each other by more than noise explains', zh: '四个测量彼此对不上，而且对不上的程度超出了噪声能解释的范围' },
        { en: 'The anchors are too close together', zh: '锚点挨得太近了' },
      ],
      answer: 1,
      explain: { en: 'The residual measures agreement, not accuracy: a clean round leaves a residual too small to print, whatever the true error happens to be.', zh: '残差量的是一致性，不是准确性：一轮干净的测距，残差小到印不出来，而真实误差是多少它并不知道。' },
    },
    {
      q: { en: 'Three anchors instead of four — is there still a fix?', zh: '锚点从四个减到三个，还有定位吗？' },
      options: [
        { en: 'No: two unknowns need four measurements', zh: '没有：两个未知数需要四个测量' },
        { en: 'Yes, with one measurement to spare, so a residual is still computed', zh: '有，而且还多出一个测量，所以残差照样算得出来' },
        { en: 'Yes, but with no residual, because three ranges fit exactly', zh: '有，但没有残差，因为三个距离能被精确满足' },
      ],
      answer: 1,
      explain: { en: 'Two unknowns and three measurements leave one spare, which is what a residual is made of. Two ranges leave none, and the solver refuses.', zh: '两个未知数配三个测量，多出一个，而残差正是由这“多出的一个”构成的。只剩两个距离时一个也不多，解算器便拒绝作答。' },
    },
  ],
}
