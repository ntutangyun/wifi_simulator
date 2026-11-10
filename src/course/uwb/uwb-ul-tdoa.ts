/**
 * UWB Tier 2 · M14 · Other ranging modes · One blink per tag.
 *
 * The previous lesson gave the round to the anchors and left the tag listening.
 * This one turns it over again: the badge is the only thing that transmits — one
 * fourteen-octet blink of 181.218 µs per 200 ms block, carrying no times at all —
 * and the anchors are the only things that listen. The reference anchor
 * differences the four arrival stamps and solves the fix, so the position exists
 * on the infrastructure side and never reaches the badge that caused it.
 *
 * The centrepiece is the assumption the mode rests on: that the anchors agree
 * what time it is. One nanosecond of leftover calibration error per anchor is
 * 29.98 cm of pseudo-range, and because that error is drawn once and not per
 * round it is a bias — every badge in the room is pushed the same way, and no
 * number of blinks averages it away. The variant sets `syncErrorNs` to 1 and the
 * fixes go from 3.2 cm of mean error to 16.7.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). The drawn
 * offsets, the sync-error walk and the geometry are in `deeper`; the clause and
 * the model choices are in `sources`. Every number quoted below is pinned in
 * tests/course/uwb-ul-tdoa.test.ts; `npx tsx scripts/lesson-dump.ts uwb-ul-tdoa
 *` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, firstUwbBlink, firstUwbPosition, firstUwbRxTs, firstUwbTdoa, firstUwbUlRound, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Which scene the lesson runs: anchors perfectly synchronised, or 1 ns out. */
export type UwbUlTdoaVariant = 'base' | 'sync'

/**
 * The four corner anchors, in the order the infrastructure uses them. The first
 * is the reference: every difference is taken against its arrival stamp, and it
 * is the lane the records are emitted from. The corners and the heights are
 * `uwb-position`'s and `uwb-dl-tdoa`'s, so the two-way fixes and the listen-only
 * fixes measured in this room are the comparison this lesson may make.
 */
export const UL_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** Anchors on the ceiling, badges at chest height — `uwb-position`'s two planes. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0

/**
 * Where the badges stand: `uwb-dl-tdoa`'s ten spots, so the one thing that
 * differs between the two lessons is which end of the link transmits. None of
 * them is directly under an anchor, where the hyperbolic geometry would be its
 * own story.
 */
export const TAG_SPOTS: { x: number; y: number }[] = [
  { x: 4, y: 3.5 }, { x: 7, y: 6 }, { x: 2, y: 6.5 },
  { x: 5, y: 1 }, { x: 8.5, y: 3 }, { x: 1.5, y: 2.5 }, { x: 6, y: 4.5 },
  { x: 3, y: 1.5 }, { x: 9, y: 7 }, { x: 5.5, y: 7 },
]

/**
 * Four corner anchors and ten blinking badges on a UL-TDoA session with
 * everything else at its default: NLOS on, both noise knobs at their defaults,
 * and every crystal drawn rather than set — which in this mode changes nothing
 * at all, because a blink carries no times and no interval is ever measured on
 * a badge's clock.
 *
 * 'sync' sets `syncErrorNs` to 1 and changes nothing else: each anchor then
 * draws one fixed leftover calibration error of that size, once, for the whole
 * session.
 */
export function uwbUlTdoaScenario(variant: UwbUlTdoaVariant = 'base'): Scenario {
  return uwbSc(
    oneRoom(),
    [
      ...UL_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      ...TAG_SPOTS.map((p, i) => uwbTag(`badge-${i + 1}`, `Badge ${i + 1}`, p.x, p.y, TAG_Z)),
    ],
    { mode: 'ul-tdoa', nlos: true, ...(variant === 'sync' ? { syncErrorNs: 1 } : {}) },
  )
}

export const uwbUlTdoa: Lesson = {
  id: 'uwb-ul-tdoa',
  module: 25,
  title: '每个标签发送一帧闪发',
  why: '只接收的标签（tag，也就是被定位的一端）仍然需要接收机、需要自己的时钟，还要运行一套解算。医院工牌上的胸牌，这三样都不希望具备；而在这栋楼里部署网络的一方，也更希望在屏幕上直接读出每个胸牌的位置，而不是逐个询问。那就把这条链路（link）的方向再反转一次：标签发送，楼内的基础设施接收。在这种上行形态（UL-TDoA）中，胸牌每个块只发送一帧闪发（blink）——其中不含任何时间信息，也不等待任何应答——发送完毕即关闭射频；收到它的每个锚点（anchor）在共用的时基上记录到达时刻，由参考锚点（reference anchor）相减、解出双曲线（hyperbola），位置信息保留在基础设施一侧，胸牌自身并不知道。闪发的发送时刻在两项中完全相同，相减即被消去，没有任何一段间隔是用胸牌的晶振（crystal）测量的，所以把它的晶振设到容差两端，结果完全不变。于是整个模式完全取决于锚点时钟彼此是否一致：校准后剩余的同步误差（sync error）每一纳秒约合三分之一米，而且它只随机取值一次、此后每轮重复出现，是偏差（bias）而不是噪声。同步误差达到一纳秒时，平均定位误差就从几厘米增大到十几厘米，房间里的胸牌一起朝同一方向偏移；多发闪发无法通过平均消除它，只有改进校准才能解决。代价在空口：闪发是每个标签一个时隙，一个块的时隙会用完，而只接收的那一轮无论服务多少胸牌都不多占用一帧。',
  outcomes: [
    '说清通过一帧短信号，标签付出了什么，基础设施一侧得到了什么',
    '解释这里标签的晶振（crystal）为什么完全不影响结果',
    '根据定位偏移的方式，把校准偏差（只取值一次、此后重复出现的误差）与噪声区分开',
  ],
  needs: ['uwb-dl-tdoa'],
  terms: [
    { term: 'blink', plain: '标签发送后不再跟进的一帧短信号：其中不含任何时间信息，也不等待任何应答' },
    { term: 'UL-TDoA', plain: '上行形态：由标签发送，其余全部依靠锚点共享的时钟' },
    { term: 'sync error', plain: '锚点彼此校准之后，它们的时钟之间实际仍存在的差值' },
    { term: 'bias', plain: '只取值一次、此后每一轮都同样出现的误差，无法通过平均消除' },
  ],
  picture: [
    { heading: '只发送一帧', text: '仍是上一课那个房间：锚点（anchor）位于四角，胸牌位于胸口高度。把轮次的方向再反转一次，于是只有胸牌发送。它每个块占用一个时隙，用来发送一帧闪发（blink）——一小段广播，其中不含任何时间信息——发送完毕，它的射频就关闭到下一个块。' },
    { heading: '由基础设施完成定位', text: '闪发帧没有任何应答。每个收到它的锚点，都在共用的时基上记录到达时刻。时隙结束时，参考锚点（reference anchor）用其余三个时刻各减去自己的时刻，得到三个到达时间差（time difference of arrival, TDoA），再解出与上一课相同的双曲线（hyperbola）。只由标签发送的这种做法，就是上行形态（UL-TDoA），它不向胸牌反馈任何信息：胸牌根本没有打开接收机，也没有任何一条记录返回给它。' },
    { kind: 'watch', jump: 4, heading: '观察由其他节点完成的定位', text: '载入仿真，跳到那次定位。它出现在参考锚点的泳道上，而不是胸牌的泳道上；这一行会写明它对应的是哪个胸牌。' },
    { heading: '它的晶振不再影响结果', text: '同一时基上的两个时刻相减——全部运算仅此而已。没有任何一段间隔是用胸牌的晶振测量的，所以既没有需要修正的时钟速率，也没有可用于修正的依据。闪发的发送时刻是未知的，但它在两项中完全相同，相减即被消去。最后剩下的只有接收端一侧的误差。' },
    { heading: '一切取决于锚点时钟的一致性', text: '于是整个模式如今取决于一件事：四个锚点的时钟彼此一致。它们相互做过校准，校准之后剩余的差值就是同步误差（sync error）。一纳秒的同步误差约合三分之一米，而每个时间差中都包含两个锚点各自的同步误差；这个量可以在会话中自行设置。' },
    { heading: '这是偏差，不是噪声', text: '这里的两项误差性质不同。时间戳噪声每发一帧闪发就重新随机取值一次，所以它是分散的，可以通过平均消除。而校准偏差只取值一次、此后不再改变：它是偏差（bias），每一轮都相同，并且使房间里的每个胸牌都朝同一个方向偏移。结果是所有定位整体偏移，而不是分散；只有改进校准才能解决。' },
    { heading: '发送一帧，还是只接收', text: '选择哪一种，通常不取决于精度。只接收的一方无法被计数，因为它不发送任何内容；而闪发帧是一帧标明发送者的广播——这正是资产标签所需要的，也正是佩戴者可能不希望的。只接收的那一轮，无论多少个胸牌都能同时服务；而闪发是每个标签一个时隙，一个块的时隙是会用完的。' },
  ],
  numbers: [
    { kind: 'table', heading: '一个胸牌的开销，一个块的容量', head: [
      '项目', '数值',
    ], rows: [
      ['一帧闪发', '14 B (9 + 3 + 2), 181.218 µs'],
      ['一个胸牌，一个块', '1 个 2 ms 时隙，1 帧'],
      ['十个胸牌，一个块', '1.812 180 ms, 0.906 %'],
      ['一个块的上限', '100 badges (240 000 ÷ 2 400 RSTU), 9.06 %'],
    ] },
    { kind: 'formula', heading: '全部的算术', text: 'arrival_i = t_闪发 + d(胸牌, a_i)/c + noise_i + offset_i\nΔ_i = arrival_i − arrival_参考', note: '发送时刻 t_闪发 未知，但它在两项中完全相同，相减即被消去。把十个胸牌全部设到晶振容差的两端，七十次定位的误差完全相同。唯一会变化的，是胸牌写入自身发送时间戳记录的计数值，而定位不使用它。' },
    { text: '1 ns 对应 29.98 cm 的伪距，而每个时间差中都包含两个锚点各自的同步误差；默认的 0 ns 意味着锚点完全同步，而变体把它设为 1 ns。' },
    { kind: 'table', heading: '两个场景，各七个块、各 70 次定位', head: [
      '场景', '每个时间差的 σ',
      '时间差最大误差', '定位误差',
      '误差椭圆',
    ], rows: [
      ['完美同步', '4.2 cm', '0.10 m',
        '0.2–7.7 cm，平均 3.2', '3.0–4.1 cm'],
      ['1 ns 的同步误差', '42.6 cm', '0.41 m',
        '10.4–27.9 cm，平均 16.7', '30.5–41.5 cm'],
    ] },
    { text: '那个 σ 是 √2·c·√(σ_ts² + sync²)：一次相减中有两个时间戳、两个锚点的校准偏差。两次运行中的每一个时间差、每一次定位，都落在它的 4σ 之内；误差椭圆也是按这个数画出的——所以两行之间它增大了十倍。' },
    { kind: 'table', heading: '日志输出的内容：badge-1，第 0 块', head: [
      '行', '内容',
    ], rows: [
      ['属于这个胸牌的那一轮',
        'badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs'],
      ['它在这一轮中发出的闪发',
        'badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)'],
      ['第一个时间差',
        'anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)'],
      ['由它解出的位置',
        'anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)'],
      ['七个块之后的 badge-1',
        'error 2.1 cm, GDOP 0.85, ellipse 3.2 × 1.7 cm, UL-TDoA'],
    ] },
    { kind: 'steps', heading: '一次定位：逐步说明', items: [
      '会话只给 badge-1 分配一个时隙，此外没有其他内容。它发出一帧闪发后，射频就关闭到下一个块。没有任何应答，也没有任何一条记录返回给它。',
      '收到这帧闪发的每个锚点，都为它的 RMARKER（ranging marker）打上时间戳。锚点会用自己的晶振记录一个计数值供日志显示——即日志中的那行 UWB_TS——但定位并不使用这个计数值。',
      '定位使用的是锚点公共时基（common time base）上的到达时刻：真实飞行时间，加上这台接收机的时间戳噪声，再加上这个锚点自身的校准剩余误差。有线同步已经消除了它的晶振误差。',
      '那个剩余误差来自校准，本课让它在整个会话中固定不变——本场景是 0 ns，变体里是 1 ns。这正是它属于偏差而不是噪声的原因。',
      '时隙结束时，网络汇总四个到达时刻，交给参考锚点 anchor-1。未收到闪发的锚点不参与计算；而如果 anchor-1 自身未收到，这一轮就没有任何输出。',
      'anchor-1 用其余三个到达时刻各减去自己的到达时刻。这里不需要修正速率：没有任何一段间隔是用某个晶振测量的，而闪发的未知发送时刻同时出现在两项中，相减即被消去。',
      '三行 UWB_TDOA——每一行都写明对应的是哪个胸牌——就是三条双曲线。解算器在胸牌预设的高度上求它们的交点，三条曲线使用同一个 σ，再在 anchor-1 的泳道上输出那一行定位。',
    ] },
    { kind: 'table', heading: 'badge-1，第 0 块，对 anchor-2', head: [
      '步骤', '数值',
    ], rows: [
      ['闪发从 badge-1 发出',
        '未知，但在两项中完全相同'],
      ['到 anchor-1 的真实飞行', '4.7634 m · 15.889 ns'],
      ['到 anchor-2 的真实飞行', '6.3789 m · 21.278 ns'],
      ['由几何决定的差值', '5.3886 ns · 1.6155 m'],
      ['每个锚点的校准剩余误差', '0 ns'],
      ['anchor-1 相减得到的结果', '5.3267 ns'],
      ['剩余部分：两台接收机的噪声', '−0.0619 ns · −1.86 cm'],
      ['一个时间差的 σ', '√2·c·√(0.1² + 0²) ns = 4.2 cm'],
      ['由它解出的那次定位', '(4.02, 3.46) m, true (4.00, 3.50), error 0.05 m'],
    ] },
  ],
  deeper: [
    { heading: '本场景随机生成的偏差', text: '在 1 ns 下，四次抽样得到 +0.14、−0.97、−0.34 与 −0.31 ns，于是 badge-1 相对 anchor-2 的时间差短了大约 1.15 ns——而且每一轮都短这么多。它的七次读数是 −1.18、−1.28、−1.16、−1.11、−1.12、−1.18 与 −0.99 ns，没有一次符号相反；它自己的定位偏离了 12.7 cm，而同步完好时只偏离 2.1 cm。把每个胸牌的七次定位取平均，十个胸牌全部向东偏移了 12 到 22 cm。发送再多闪发也无法通过平均消除它，只有改进校准才能解决。' },
    { heading: '逐档调节同步误差，再改变几何位置', text: '编辑器中的“锚点同步误差”一栏，只在 UL-TDoA 下可用。逐档调节它会看到：只要 σ 明显大于时间戳噪声，误差就随它线性增长。然后把它调回 1 ns，再把 badge-1 拖到 (9.8, 0.2)，即锚点矩形之外：GDOP 从 0.85 变成 3.43，椭圆从 32 cm 增大到 1.4 m，七次定位中最差的一次达到 45.3 cm。时钟引入的任何误差，都会被几何放大。' },
    { kind: 'table', heading: '逐档调节同步误差', head: [
      '同步误差', '平均定位误差', '70 次中最差',
    ], rows: [
      ['0 ns', '3.2 cm', '7.7 cm'],
      ['1 ns', '16.7 cm', '27.9 cm'],
      ['2 ns', '33.4 cm', '54.4 cm'],
      ['4 ns', '70.4 cm', '135.3 cm'],
    ] },
    { heading: '误差椭圆的可信程度', text: '它是一阶近似，而偏差并不是白噪声，所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。两个场景中，长半轴至少是七十次中最大误差的一半，最多也不过是它的几倍——一阶近似的数字，所能说明的大致也就是这些。' },
    { heading: '两种方式各占用多少空口时间', text: '只接收的那一轮，无论是三个胸牌还是三千个胸牌在接收，锚点都只占用块的 0.505 %；而十个发送闪发的胸牌，七个块中要占用 12.685 260 ms 的空口时间，每个标签一个时隙，一个块达到一百个就满了。所以四百个标签需要四个块的时隙，或者更短的时隙，或者再增加一个信道。上行形态换来的是胸牌本身的简化：不需要接收机、不需要时钟速率修正、不需要解算器。' },
  ],
  limits: [
    { kind: 'model-value', text: '那条「公共时基」在本课中是理想化的。每个锚点记录的到达时刻，就是真实 RMARKER 时刻加上这台接收机的时间戳噪声，再加上它自身的校准剩余误差——锚点自身的晶振根本不参与，所谓有线同步就是将其完全消除。而那个剩余误差只取值一次，此后在整个会话中保持不变。真实的同步残差会随温度、线缆与回程路径缓慢漂移，所以在现实中它既是偏差，也在持续变化。' },
    { kind: 'unmodelled', text: '四个到达时刻如何汇总到参考锚点，本课完全没有涉及。时隙一结束，四个到达时刻就已经交到 anchor-1，由它解算：没有任何消息经过空口，没有回程时延、没有丢包、没有带宽限制，也没有哪台锚点会延迟提交自己的时间戳。而真实的上行形态完全依赖这条回程网络——它是时延的主要来源，也是这种模式最常出故障的环节。' },
    { kind: 'model-value', text: '那个误差椭圆是把偏差当作噪声画出来的。它的 σ 把同步误差和时间戳噪声一起计入平方和，这只是一阶近似：校准误差只取值一次、每一轮重复出现，不是能被平均消除的白噪声。于是这个椭圆的大小大致正确，性质却不正确——它表示的是「定位可能偏离多远」，而不是「重复测量有 68 % 落在这里」。真实的定位引擎要把这两类误差分开报告，因为只有其中一类能通过多次测量降低。' },
    { kind: 'out-of-scope', text: '一个块容纳一百个胸牌，在这里只是时隙排程的算术结果，而不是容量。本课中闪发时隙由会话的时间表一次性排定，每个标签在每块中占用固定的一轮，所以两帧闪发永远不会发生碰撞，也没有哪个胸牌自行选择发送时刻。而真实的资产标签正是各自按自己的时钟盲发的，于是这种模式真正的容量问题是碰撞与重叠——本课一次也无法演示。' },
  ],
  sources: [
    '本课只有一处以标准正文为依据：IEEE Std 802.15.4-2024 §10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第一种——移动节点发送，一组彼此时钟同步的固定节点接收，由这些节点测得的到达时刻之差确定它的位置。上面那条说明中把胸牌设到的 ±20 ppm 晶振容差，出自 §16.4.9。',
    '其余都是模型：闪发帧的十四个字节，以及它不携带任何时间这件事；发送它的那个 2 ms 时隙；锚点的公共时基、“有线同步”的校准方式，以及每个锚点身上留下的那个固定剩余误差；还有上面引用的每一个数字。',
    '噪声取值同样是模型取值：每个接收时间戳上 100 ps 的 1σ 噪声；同步误差默认取 0 ns，那是实验室的答案，不是任何一次真实安装的答案。锚点自身的坐标同样被视为勘测完全准确。',
  ],
  scenario: () => uwbUlTdoaScenario('base'),
  variants: [
    { label: '1 ns 的同步误差', scenario: () => uwbUlTdoaScenario('sync') },
  ],
  jumps: [
    J('只属于一个胸牌的那一轮', firstUwbUlRound),
    J('它在这一轮里发出的闪发帧', firstUwbBlink),
    J('第一个为它记录时间戳的锚点', firstUwbRxTs),
    J('第一个时间差', firstUwbTdoa),
    J('基础设施解出的定位', firstUwbPosition),
  ],
  observe: [
    'badge-1 开启这个块中属于它的那一轮，在其中发出一帧闪发，然后空闲到下一个块。整段运行中每一次发送都来自某个胸牌——一共七十次，每个胸牌每块一次。',
    '跟随这帧闪发进入房间：四个到达时间戳，分别在 181.234、181.237、181.240 与 181.242 µs，顺序正是各锚点到胸牌的距离次序。首尾相差八纳秒，而确定它位置的，就只有这八纳秒。',
    '在检视面板中打开 badge-1：没有距离，只有三个到达时间差和一次定位，而它们都是在其他节点上算出的。再打开参考锚点——这些运算全部由它完成，它自己的泳道上却是空的。',
  ],
  tryThis: [
    '载入“1 ns 的同步误差”。空口上没有任何变化——仍是那些闪发、仍是那些空口时间（airtime）——但每一次定位都发生了偏移。房间中部那个胸牌的椭圆增大到 32.1 × 16.8 cm；七十次定位的平均误差，从 3.2 cm 变成 16.7。',
    '在编辑器中把锚点同步误差依次设为 0、1、2、4 ns，每次读取平均定位误差。从第一档到第二档它增加了四倍，之后随 σ 成倍增长：决定定位精度的是时钟，而不是射频。',
  ],
  quiz: [
    {
      q: '上一课只接收的胸牌必须消除自身的晶振误差。这一课中为什么不影响结果？',
      options: [
        '闪发帧太短，速率误差体现不出来',
        '没有任何一段间隔是用它的晶振测量的：相减的两个时刻都由锚点记录',
        '锚点估计出它的载波偏差并进行了修正',
      ],
      answer: 1,
      explain: '那里胸牌相减的是自己的两个到达时刻。这里每个时间戳都由锚点记录，而胸牌的发送时刻在相减时被消去。',
    },
    {
      q: '一分米的同步误差，为什么无法通过更频繁地发送来弥补？',
      options: [
        '每个锚点的校准误差只取值一次、此后重复出现：偏差无法通过平均消除',
        '增加的闪发会相互碰撞',
        '解算器只保留最近的一帧闪发',
      ],
      answer: 0,
      explain: '每一轮缩短的量都相同，十个胸牌也朝同一方向偏移。平均消除的是时间戳噪声，剩下的是时钟误差。',
    },
    {
      q: '仓库想给四百个标签定位，医院想给人身上的胸牌定位。两者各自倾向哪一种？',
      options: [
        '两者都倾向上行形态：只有它把位置保存在运营方能够读取的地方',
        '两者都倾向只接收的那一种形态：只接收的那一轮能服务任意数量的标签，而只接收的一方根本无法被计数',
        '规模倾向上行形态，因为在上行形态中由基础设施完成这些计算',
      ],
      answer: 1,
      explain: '选择上行形态的理由在于标签本身，而不在于数量：不需要接收机、不需要时钟速率修正、不需要解算器。四百个标签需要四个块的时隙。',
    },
  ],
}
