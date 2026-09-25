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
 * `npx tsx scripts/lesson-dump.ts uwb-position` prints it with its length.
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
  module: 12,
  title: '从四个距离到一个点',
  why: '到某个锚点有多远，并不等于人在哪儿。手机手里有四个这样的距离，彼此只差几毫秒测得，每一个都差着一两厘米，而它要回答的只有用户真正问的那个问题：我现在站在哪里？这一课做的就是这笔算术，并且说清这个答案本身如何告诉你该不该相信它。',
  outcomes: [
    '说清为什么四个圆环交不到一点，以及解算器改做了什么',
    '从日志里读出一次定位，并对照旁边的真值检查它',
    '说出拟合解释不掉的那一部分（残差）是什么，以及日志为什么从不把它印出来',
  ],
  needs: ['uwb-blocks', 'uwb-dstwr'],
  terms: [
    { term: 'trilateration', plain: '只靠距离把位置找出来：每个距离是一个圆，而位置就落在这些圆相交的地方' },
    { term: 'residual', plain: '最优答案仍然解释不掉的那部分——答案定下来之后，各个测量离它还差多少' },
  ],
  picture: [
    { heading: '四个圆环，一个位置', text: '每个锚点只知道关于这部手机的一件事：它有多远。以这个距离为半径，绕着锚点画一个圆，手机就落在这个圆上的某处。两个圆相交于两点，第三个圆则决定是哪一点。这就是 trilateration（三边定位），而场景会按刚测出的半径，把这些圆替你画出来。' },
    { text: '它们从来交不到一处。每条半径上一厘米的噪声，留下的不是一个交点，而是一小块不齐整的区域；地面上没有任何一点能同时满足四个测量。于是解算器不再去找交点：它要找的是那个对四个距离都“最不亏欠”的位置，做法是让一个试探点一路往下走，直到再挪也无益为止。' },
    { kind: 'watch', jump: 2, heading: '看那个点浮出来', text: '载入仿真，跳到定位那一行。在手机这一轮的末尾，解算器落脚的地方出现一个十字，产生它的那四个圆环则在周围慢慢淡去。' },
    { heading: '第四个圆环是那道检查', text: '三个距离就已经能给出答案了，第四个的用处是告诉你这个答案好不好。测量比未知数多的时候，没有哪一点能把它们全部满足，剩下的那一点点——也就是残差——正是解算器对这次拟合的自我评价。干净的一轮，残差不到一微米；而只要有一条距离在说谎，残差就是几厘米——不必有人告诉解算器是哪一条在说谎，它已经知道了。可是没有任何记录带着这个数，所以屏幕上什么也不会动。' },
    { heading: '两个未知数，不是三个', text: '真正求解的只有地面上的那两个坐标；手机的高度是当作已知交给解算器的。这不是标准要求的简化——正是它让四个距离显得从容，而不是勉强够用，也正是因此，所有锚点都挂在天花板附近这件事，在这里几乎不用付什么代价。' },
    { heading: '一轮，一个点', text: '一次定位要花掉整整一轮。各个距离是一个锚点一个锚点陆续到齐的，而只有最后一个到手，才会算出那个点——所以手机的泳道上，每一轮的末尾有一个十字，中间什么也没有。两次定位之间，手机知道的是自己刚才在哪儿，不是现在在哪儿。' },
  ],
  numbers: [
    { kind: 'formula', heading: '解算器到底在最小化什么', text: 'r_i = ‖p − a_i‖ − d_i      J_i = (p − a_i) / ‖p − a_i‖      (JᵀJ) δ = −Jᵀ r', note: '锚点 i 在试探点 p 处的残差，就是 p 比测量所说的离它远了多少；最优位置让这四个残差的平方和最小。引擎从锚点形心出发，直到某一步小于 1 mm、或迭代满 20 次为止。' },
    { text: '每一行只取水平分量，因为高度并不参与求解。喂给它精确的距离，它收敛到与真值相差不足一微米；而可用的距离少于三个、或者锚点恰好排成一条直线时，它干脆拒绝作答。' },
    { kind: 'formula', heading: '单次测距有多吵', text: 'σ_r = c · σ_ts / √2 = 2.12 cm', note: '开篇那一课引用的 2.1 cm 测距噪声，正是这里的 σ_r，对应 100 ps 的时间戳噪声：一次测距里有两个带噪声的接收计数，它们按平方和相加，随后又被折半。这是单边测距的取值，作为偏保守的替代值一直沿用；双边测距实际上散得略小一些，1.8 到 1.9 cm。' },
    { kind: 'table', heading: '一轮末尾日志印出什么', head: [
      '行', '写的是',
    ], rows: [
      ['第 0 块的定位', 'uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors'],
      ['检视面板印出的误差', '0.7 cm'],
      ['整段运行的七次定位', '0.7, 3.3, 0.5, 2.3, 2.8, 0.5, 1.8 cm'],
    ] },
    { text: '每个块一次定位，本次运行共七次，每一次都比上一次晚整整一个块。误差在半厘米到三厘米出头之间——不过是 σ_r 的几倍，而这正是四个带噪声的圆环应该给出的结果。定位行里还并排印着一个 GDOP（锚点自身的摆放给这份误差开出的价码）；下一课讲的就只有它。' },
    { kind: 'steps', heading: '从四个距离到一个点，一步一步', items: [
      '把这一轮算完的距离收齐，逐条对上标签手里存有坐标的那个锚点。能对上的不足三条，这一轮什么也不发出。',
      '把试探点放在这些锚点 x 的平均值与 y 的平均值上——在本场景里就是四个角的中心，(5.00, 4.00) m。',
      '在试探点上算出到每个锚点的三维距离——标签高度按配置值 1.00 m 固定不动——再减去实测的距离：这个差就是该锚点的残差 r_i。',
      '取从锚点指向试探点的单位向量，只留它的水平 (x, y) 分量：这一对数就是该锚点在 J 里的那一行。',
      '解出 (JᵀJ) δ = −Jᵀ r，把试探点挪动 δ。行列式小于 1e-9，说明这套布局定不出点来，这一轮就空手结束。',
      '把上面三步重复下去，直到 δ 短于 1 mm，或者迭代满二十次。',
      '在它停下的那个点上把 r 再算一遍：√(Σ r_i² / n) 就是拟合解释不掉的那一部分。记录以 UWB_POSITION 发出，而这个数并不在记录里。',
      '日志里那个误差是格式化时算的，不是解算器算的：记录把估计值与真实位置并排带着，印出的是两者之间的距离。真实房间里的标签没有“真值”这一栏。',
    ] },
    { kind: 'table', heading: '本次运行的第 0 块，照着这些步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['对上的那四条距离', '4.7368, 6.3831, 5.4439, 6.8922 m'],
      ['试探点起于', '(5.00, 4.00) m'],
      ['迭代停在', '(3.9933, 3.4981) m'],
      ['该处残差的均方根', '1.44 cm'],
      ['标签的真实位置', '(4.00, 3.50) m'],
      ['于是格式化后印出', 'error 0.01 m — 0.69 cm'],
    ] },
  ],
  deeper: [
    { heading: '为什么是高斯－牛顿，而不是更聪明的办法', text: '残差并不是位置的线性函数，但它的梯度既便宜又规矩：每个锚点贡献一个单位向量。因此高斯－牛顿从锚点形心出发，几步就能收敛，而形心永远落在凸包内部，不会跑到二义解的另一侧。恰好三个距离时是有闭式解的，这里不用它，因为它会把第四个测量扔掉——而第四个测量正是那道检查的全部意义所在。' },
    { heading: '残差不是什么', text: '残差小，说明的是四个测量彼此一致，而不是它们正确。在编辑器里把每个锚点都往东挪一米、却不告诉解算器，残差依旧很小，而定位整整偏了一米。一致与准确是两个不同的问题，而标签自己能查的只有其中一个。' },
  ],
  sources: [
    '标准对“标签怎样把几个距离变成一个点”只字未提：IEEE Std 802.15.4-2024 定义的是测距交互与时间戳，到此为止。本课里距离之后的一切，都是仿真器自己的模型。',
    '下面这些是仿真器自己的模型取值，列出来方便你质疑：对 (x, y) 做高斯－牛顿最小二乘、标签高度视为已知、从锚点形心起步、步长阈值 1 mm、最多 20 次迭代，以及可用距离不足三个时拒绝作答。',
    'σ_r = c · σ_ts / √2 对单边测距是精确的；双边测距的取值是 0.62–0.65 · c · σ_ts，而模型有意沿用偏保守的单边值。它所代入的 100 ps 时间戳噪声，本身也是一个模型取值。',
  ],
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
  observe: [
    '每个块一次定位，落在标签那一轮的末尾。定位那一行写出估计值、紧挨着的真值，以及两者之间的距离；整段运行里，这个距离始终停在几厘米的量级。',
    '场景里：四圈琥珀色的环，半径是刚测出的距离；还有一个十字，标着解算器认为标签所在的位置。两者在一个块之内淡去，下一轮又在一两厘米之外重新画出。',
    '单步走过这一轮，看各个距离怎样一个锚点一个锚点地到齐。十字只在最后一个到手之后才出现：在那之前，标签手里没有可解的东西。',
  ],
  tryThis: [
    '在编辑器里把手机往旁边挪一米再跑一遍。每个圆环的半径都变了，十字跟着过去，而误差还在原来的量级——换个位置，拟合得一样好。',
  ],
  quiz: [
    {
      q: '解算器为什么不干脆把四个圆求交？',
      options: [
        '求圆的交点对手机来说太费算力',
        '每条半径上都有噪声，没有哪一点同时落在四个圆上；它取的是对四者最不亏欠的位置',
        '三个圆已经交于一点，第四个就被忽略了',
      ],
      answer: 1,
      explain: '每条半径上一厘米的噪声，留下的是一小块不齐整的区域而不是交点，而最小二乘在其中挑出一个位置。',
    },
    {
      q: '几厘米的残差说明了什么？',
      options: [
        '定位与真值差了几厘米',
        '四个测量彼此对不上，而且对不上的程度超出了噪声能解释的范围',
        '锚点挨得太近了',
      ],
      answer: 1,
      explain: '残差量的是一致性，不是准确性：一轮干净的测距，残差小到印不出来，而真实误差是多少它并不知道。',
    },
    {
      q: '锚点从四个减到三个，还有定位吗？',
      options: [
        '没有：两个未知数需要四个测量',
        '有，而且还多出一个测量，所以残差照样算得出来',
        '有，但没有残差，因为三个距离能被精确满足',
      ],
      answer: 1,
      explain: '两个未知数配三个测量，多出一个，而残差正是由这“多出的一个”构成的。只剩两个距离时一个也不多，解算器便拒绝作答。',
    },
  ],
}
