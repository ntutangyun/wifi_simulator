/**
 * UWB Tier 1 · M17 · Ranging sessions and positioning · Where the anchors stand.
 *
 * In the standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① what IEEE Std 802.15.4-2024 specifies that bears on this lesson — only the ranging figure of
 * merit, its byte layout and its tables; it says nothing about anchor layout, GDOP or error
 * ellipses; ② what this simulator does: GDOP and the 1-σ ellipse from the solver's Jacobian, a
 * two-valued FoM byte that follows the wall geometry, fixed per-material NLOS delays; ③ three
 * guided runs on `uwb-position`'s scene and its two variants.
 *
 * It loads exactly the scene `uwb-position` loads — same builder, same two variants — so the
 * recorded hashes of `uwb-geometry` are `uwb-position`'s.
 *
 * Every figure printed below is read back out of the lesson text and compared with a run in
 * tests/course/uwb-geometry.test.ts.
 */
import { J, firstUwbPoll, firstUwbPosition, firstUwbRange, firstUwbRoundEnd, type Lesson } from '../lessonKit'
import { uwbPositionScenario } from './uwb-position'

export const uwbGeometry: Lesson = {
  id: 'uwb-geometry',
  module: 17,
  title: '锚点布置在哪里',
  why: '改变锚点（anchor）的位置，射频本身没有任何变化，给出的定位结果却会变好或变坏。每条距离的误差都会使定位沿“锚点指向手机”的那条线产生偏移，锚点均匀分布在四周时这些偏移相互抵消，集中在一侧时则相互叠加；这个放大倍数叫几何精度因子（geometric dilution of precision, GDOP）。IEEE 802.15.4-2024 不讨论锚点布局，GDOP 和误差椭圆都不是它的内容，而是来自卫星导航的工具，本仿真器用解算器的雅可比算出它们：定位的不确定范围是一个椭圆，锚点稀疏的方向长、密集的方向短；移除一个角上的锚点，椭圆就变大并转向。但这个倍数只由方向算出，不使用测得的距离本身：一堵墙使某条路径偏长半米，定位偏移几十厘米，GDOP 和椭圆却保持不变。标准为此提供的是品质因数（figure of merit, FoM）：接收端为每个计数值给出一个字节，说明 RMARKER（ranging marker）以多大的概率落在多宽的区间内；它怎样算出，标准没有规定。',
  outcomes: [
    '说出标准为每个计数值规定的品质因数字节，并读出一个字节的含义',
    '读懂本仿真器在定位周围画出的椭圆，并说出布局怎样改变它',
    '解释为什么一条被遮挡的路径会使定位偏移，而 GDOP 与椭圆保持不变',
  ],
  needs: ['uwb-position'],
  terms: [
    { term: 'GDOP', plain: '几何精度因子：用一个数说明锚点的布局会把测距误差放大多少倍；不是 IEEE 802.15.4 的术语，本仿真器的计算' },
    { term: 'NLOS', plain: '非视距：最先到达的那条路径是穿过了什么东西，而不是直接到达的' },
    { term: 'FoM', plain: '品质因数：接收端为每个计数值给出的一个字节，说明 RMARKER 以多大的概率落在多宽的区间内（§10.29.1.7）' },
  ],
  standard: [
    { heading: '每个计数值一个品质因数（§10.29.1.1、§10.29.1.7）', text: '支持测距的设备必须为它产生的每一个测距计数值给出一个品质因数。品质因数描述物理层（physical layer, PHY）对 RMARKER 到达天线（antenna）时刻的估计有多准确，与同一个报告里的计数值对应。' },
    { kind: 'table', heading: '品质因数字节的格式（图 10-200，表 10-146 至表 10-148）', head: ['比特', '字段', '取值'], rows: [
      ['0–2', '置信水平', '0 无品质因数；1 至 7 依次为 20 %、55 %、75 %、85 %、92 %、97 %、99 %'],
      ['3–4', '置信区间', '0 至 3 依次为 100 ps、300 ps、1 ns、3 ns'],
      ['5–6', '置信区间的倍数', '0 至 3 依次为 0.5、1.0、2.0、4.0'],
      ['7', '扩展位', '为 1 时字节按图 10-201 解释'],
    ] },
    { kind: 'steps', heading: '读一个品质因数字节，按标准：逐步说明（§10.29.1.7）', items: [
      '看第 7 位。为 1 时其余 7 位是扩展值；扩展值为 0 表示这次接收的计数值不正确，上层应改用信道探测（channel sounding）原语确定计数值，其余扩展值保留。',
      '第 7 位为 0 时，按表 10-146 从第 0–2 位读出置信水平。',
      '按表 10-147 从第 3–4 位读出置信区间，按表 10-148 从第 5–6 位读出倍数。',
      '总的置信区间等于置信区间乘以倍数；它是整个区间的宽度，不是正负值。这个字节的含义是：RMARKER 以这个置信水平落在这个区间内。',
    ] },
    { heading: '标准没有规定的', text: '标准不规定接收端怎样算出品质因数，也不规定上层怎样使用它。锚点怎样布置、几个距离合成的位置有多准，都不是 802.15.4 的内容：标准里没有 GDOP，也没有误差椭圆。' },
  ],
  implementation: [
    { topic: '品质因数的格式', standard: '图 10-200 与表 10-146 至 10-148', sim: '照格式写字节，日志与检视面板按表格译成「97 % within 0.5 ns」这样的文字。', kind: 'faithful' },
    { topic: '品质因数怎样算出', standard: '标准未规定', sim: '只有两个取值：直射路径在水平面上被墙挡住时 0x7b，否则 0x16。不读到达电平、信干噪比（signal-to-interference-plus-noise ratio, SINR），也不读这一次时间戳实际偏了多少：关掉会话的非视距（non-line-of-sight, NLOS）开关，距离误差回到厘米级，字节不变。', kind: 'choice' },
    { topic: '解算器是否用品质因数', standard: '由上层决定（§10.29.6.1）', sim: '不用：四条距离同等对待。', kind: 'choice' },
    { topic: 'GDOP 与椭圆', standard: '标准没有定义', sim: '在解算器的终止点上只由方向算出：GDOP = √trace((JᵀJ)⁻¹)，Σ = σ_r²(JᵀJ)⁻¹，σ_r 取常数 2.12 cm；椭圆在场景里放大十倍绘制，检视面板显示真实尺寸。', kind: 'choice' },
    { topic: '非视距的时延', standard: '标准未规定', sim: '每穿过一种材料，首径（first path）加一个固定时延：砖 2.0 ns、石膏板 0.5 ns、玻璃 0.2 ns，与墙的厚度、入射角都无关；是否穿墙只在水平面上判断。', kind: 'value' },
    { topic: '回波', standard: '标准未规定接收端怎样在多条路径中找首径', sim: '本课三个场景都没有摆放反射物，所以没有回波；即使有，回波也不参与测距。真实房间里直射路径完全被阻断、只剩反射路径的情形，本课不涉及。', kind: 'choice' },
    { topic: '锚点坐标', standard: '标准未规定', sim: '解算器用场景里的真实坐标，没有勘测误差，所以本课测不出「锚点坐标测错」的后果。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '三个场景，同一台射频',
      jump: 2,
      more: [0, 1],
      steps: [
        '依次载入本课场景、「一堵砖墙挡住一条路径」与「三个锚点」，各自跳到第一次定位。',
        '在检视面板里读 GDOP、椭圆和误差，对照下表。',
      ],
      blocks: [
        { kind: 'formula', heading: '几何的放大倍数', text: 'GDOP = √trace((JᵀJ)⁻¹) = 1.05      Σ = σ_r² (JᵀJ)⁻¹', note: '若四个锚点的方位角绕待测点均匀分布，GDOP 恰好是 1.00；这个房间里锚点比手机高，而且张成长方形，所以略大于 1。' },
        { kind: 'table', heading: '三个场景，同一台射频', head: ['场景', 'GDOP', '1σ 椭圆', '首次定位', '误差'], rows: [
          ['四个锚点', '1.05', '1.7 × 1.4 cm', '(3.99, 3.50) m', '0.7 cm'],
          ['一堵砖墙挡住一条路径', '1.05', '1.7 × 1.4 cm', '(4.18, 3.75) m', '30.9 cm'],
          ['三个锚点', '1.26', '2.2 × 1.5 cm', '(3.98, 3.48) m', '2.7 cm'],
        ] },
      ],
      expect: '有墙的那次定位偏了 30.9 cm，GDOP 与椭圆却与干净的那次完全相同；去掉一个锚点，GDOP 升到 1.26，椭圆变大。',
      meaning: 'GDOP 与椭圆只由方向算出（②），描述的是只含噪声的距离的散布；它们不是标准的内容（①）。',
    },
    {
      heading: '按步骤算出 GDOP',
      jump: 2,
      steps: [
        '取四个锚点到手机真实位置的方向，按下面的步骤算一遍。',
        '与检视面板显示的 GDOP 和椭圆对照；再对「三个锚点」重复。',
      ],
      blocks: [
        { kind: 'steps', heading: '本仿真器怎样算 GDOP 与椭圆：逐步说明（标准没有规定）', items: [
          '取解算器的终止点；以下每一步都只在这个点上计算。',
          '对每个锚点，取从锚点指向该点的单位向量，只保留水平 (x, y) 分量，作为 J 的一行。实测的距离不参与。',
          '累加成二乘二的 JᵀJ；行列式小于 1e-9 时无解。',
          '求逆，对角线两项相加再开平方，就是 GDOP。',
          '整个逆矩阵乘以 σ_r²（2.12 cm 的平方），两个特征值的平方根是椭圆的两条半轴，½·atan2(2Σ_xy, Σ_xx − Σ_yy) 是长轴的倾角。',
        ] },
        { kind: 'table', heading: '四个角的锚点，按上述步骤计算一遍', head: ['步骤', '数值'], rows: [
          ['anchor-1, anchor-2', '(0.7348, 0.6298) · (−0.8622, 0.4703)'],
          ['anchor-3, anchor-4', '(0.6423, −0.7341) · (−0.7964, −0.5792)'],
          ['JᵀJ', '2.3302, 0.0470, 1.4922 · det 3.4750'],
          ['(JᵀJ)⁻¹', '0.4294, −0.0135, 0.6706'],
          ['GDOP', '√(0.4294 + 0.6706) = √1.1000 = 1.0488'],
          ['Σ = σ_r²(JᵀJ)⁻¹', '1.74 × 1.39 cm，−86.8°'],
        ] },
      ],
      expect: '四个锚点时 GDOP 为 1.0488，椭圆 1.74 × 1.39 cm，长轴与 +x 轴成 −86.8°；三个锚点时长轴转到 +61.5°，指向去掉的锚点原先所在的象限。',
      meaning: '第二步之后没有一步用到实测距离（②）：一条只含噪声的距离和一条本身错误的距离给出相同的 GDOP 与椭圆。',
    },
    {
      heading: '一条路径上的一堵砖墙',
      variant: 0,
      jump: 2,
      steps: [
        '载入「一堵砖墙挡住一条路径」，读第一个块里四条距离和它们的品质因数字节。',
        '按 ① 的步骤读出两个字节的含义，再读这一块的定位。',
      ],
      blocks: [
        { kind: 'table', heading: '有墙的场景里每条距离上的字节', head: ['距离', '误差', 'FoM'], rows: [
          ['anchor-1', '57.1 cm', '0x7b — 75 % within 12 ns'],
          ['另外三条', '不到 1.4 cm', '0x16 — 97 % within 0.5 ns'],
        ] },
        { kind: 'table', heading: '两个字节，按 ① 的表格读', head: ['字节', '置信水平', '置信区间', '倍数', '总区间'], rows: [
          ['0x16', '6：97 %', '2：1 ns', '0：0.5', '0.5 ns'],
          ['0x7b', '3：75 %', '3：3 ns', '3：4.0', '12 ns'],
        ] },
        { kind: 'formula', heading: '定位偏了多少，几何允许多少', text: '砖墙 2.0 ns × 0.299792458 m/ns = 0.5996 m\n4σ 包络 = 4 × 2.12 × 1.0488 = 8.9 cm', note: '扣除噪声，定位只移动 0.316 m，即偏差的 53 %，方向背离被挡住的锚点。' },
      ],
      expect: 'anchor-1 测得 5.33 m，真值 4.76 m；这一块的定位偏了 30.9 cm，是 8.9 cm 包络的三倍半，而 GDOP 仍是 1.05。',
      meaning: '字节的格式与含义是标准的（①）；它只按几何取两个值、解算器不用它，是本仿真器的取法（②）。能发现这条错误距离的是品质因数与残差，不是 GDOP。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1（每个计数值必须有品质因数）、§10.29.1.7 与图 10-200、图 10-201、表 10-146、表 10-147、表 10-148（品质因数字节）、§10.29.6.1（由上层决定怎样使用结果）。标准没有 GDOP、误差椭圆或锚点布局的内容。',
    '本仿真器的取值与取法：GDOP 与 1σ 椭圆由解算器的雅可比与常数 σ_r 算出；品质因数只取 0x16 与 0x7b 两个值，按水平面上的墙判断；砖墙 2.0 ns、石膏板 0.5 ns、玻璃 0.2 ns 的附加时延；椭圆放大十倍绘制；锚点坐标取真值。',
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
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '砖墙让四条距离里的一条长了 0.60 m，可扣掉噪声后定位只移动了 0.316 m。为什么不是 0.60 m？',
      options: [
        '解算器按 FoM 给每条距离加权，降低了那一条的权重',
        '最小二乘无法同时满足四条：三条干净的距离抵消了那条偏长距离的一部分影响',
        '偏差被 GDOP 除了一遍',
      ],
      answer: 1,
      explain: '扣掉噪声后位移是偏差的 53 %，方向远离那个被挡住的锚点；同样扣掉噪声，它留下 21 cm 的残差。本仿真器的解算器不用品质因数。',
    },
    {
      q: '有墙的场景里定位偏了 31 cm，可 GDOP 与椭圆读出来和干净那次一样。为什么？',
      options: [
        '其实变大了，只是绘制时的放大倍数掩盖了这一变化',
        '两者都出自 JᵀJ 与一个假定的 σ_r：它们预测的是只含噪声的距离的散布',
        '这个误差仍落在它们给出的包络之内',
      ],
      answer: 1,
      explain: '它是那条 4σ 包络（4 × 2.12 × 1.0488 = 8.9 cm）的三倍半。真正指出这条距离有问题的，是它的品质因数和解算器的残差。',
    },
    {
      q: '品质因数字节 0x16 的含义是什么？',
      options: [
        '这条路径被墙挡住了',
        'RMARKER 以 97 % 的概率落在 0.5 ns 宽的区间内',
        '这次测距误差是 0x16 皮秒',
      ],
      answer: 1,
      explain: '第 0–2 位是 6，即 97 %；第 3–4 位是 2，即 1 ns；第 5–6 位是 0，即倍数 0.5；总区间 0.5 ns（表 10-146 至 10-148）。标准里没有「被挡住」这种标志。',
    },
  ],
}
