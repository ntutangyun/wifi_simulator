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
  module: 14,
  title: '每个标签一次闪发',
  why: '只听的标签（tag，也就是被定位的那一端），仍然要有接收机、要有自己的钟、还要跑一套解算。挂在医院工牌带上的胸牌，这三样一个都不想要；而给这栋楼布网的人，也宁愿在屏幕上直接读出每个胸牌在哪儿，而不是挨个去问。那就把这条链路（link）再翻一次：标签说话，楼来听。',
  outcomes: [
    '说清一帧短短的信号，标签付出什么，楼里换来什么',
    '解释这里标签的晶振（crystal）为什么完全不要紧',
    '从定位挪动的方式，把校准偏差（只抽一次、此后重复出现的误差）和噪声区分开',
  ],
  needs: ['uwb-dl-tdoa'],
  terms: [
    { term: 'blink', plain: '标签发完就不管的那一帧短信号：里面没有任何时间，也不等谁回话' },
    { term: 'UL-TDoA', plain: '上行形态：发送的是标签，其余全交给锚点那只共享的钟' },
    { term: 'sync error', plain: '锚点彼此校准过之后，它们的钟实际上还差多少' },
    { term: 'bias', plain: '只抽一次、此后每一轮都照样出现的误差，平均是去不掉的' },
  ],
  picture: [
    { heading: '一帧，然后什么也没有', text: '还是上一课那个房间：锚点（anchor）在四角，胸牌在胸口高度。把轮次再翻一次，于是只有胸牌在发送。它每个块占一个时隙，用来发一帧闪发（blink）——一小段广播，里面没有任何时间——发完，它的射频就关到下一个块。' },
    { heading: '由别人来定位', text: '闪发帧没有任何回应。每个听到它的锚点，都在大家共用的那条时基上记下到达时刻。时隙结束时，参考锚点（reference anchor）用其余三个时刻各减去自己的那个，得到三个到达时间差（time difference of arrival, TDoA），再解出和上一课一样的双曲线（hyperbola）。只有标签发送的这种做法，就是上行形态（UL-TDoA），它什么也不告诉胸牌：它根本没开接收机，也没有任何一条记录回到它那里。' },
    { kind: 'watch', jump: 4, heading: '看它发生在别人身上', text: '载入仿真，跳到那次定位。它是从参考锚点那条泳道发出的，不是胸牌那条；而这一行会写明它说的是哪个胸牌。' },
    { heading: '它的晶振不再要紧', text: '同一条时基上的两个时刻相减——全部算术就这些。没有任何一段间隔量在胸牌的晶振上，所以既没有时钟速率要修正，也没有什么可供修正。闪发离开的那一刻是未知的，但它在两项里完全相同，一减就没了。最后剩下的只有接收端那一侧。' },
    { heading: '一切都压在锚点的共识上', text: '于是整个模式如今都压在一件事上：四个锚点对“现在几点”看法一致。它们彼此做过校准，校准之后剩下的那点差距，就是同步误差（sync error）。一纳秒的同步误差约合三分之一米，而每个时间差里都装着两个锚点的份额；这个量在会话里可以自己调。' },
    { heading: '这是偏差，不是噪声', text: '这里的两项误差并不是同一类东西。时间戳噪声每发一帧闪发就重新抽一次，所以它是散的，平均得掉。而校准偏差只抽一次、此后再不改变：它是偏差（bias），每一轮都一样，并且把房间里的每个胸牌都朝同一个方向推。那是一张被扭曲的地图，而不是一团散点，只有把校准做好才治得了。' },
    { heading: '发一帧，还是只听', text: '到底要哪一种，多半不是精度问题。只听的一方数不出来，因为它什么也不发；而闪发帧是一帧写明了发送者的广播——这正是资产标签想要的，也正是戴着它的人可能不想要的。只听的那一轮，多少个胸牌都能一起伺候；而闪发是一人一个时隙，而一个块的时隙是会用完的。' },
  ],
  numbers: [
    { kind: 'table', heading: '一个胸牌花多少，一个块装得下多少', head: [
      '项目', '数值',
    ], rows: [
      ['一帧闪发', '14 B (9 + 3 + 2), 181.218 µs'],
      ['一个胸牌，一个块', '1 个 2 ms 时隙，1 帧'],
      ['十个胸牌，一个块', '1.812 180 ms, 0.906 %'],
      ['一个块的上限', '100 badges (240 000 ÷ 2 400 RSTU), 9.06 %'],
    ] },
    { kind: 'formula', heading: '全部的算术', text: 'arrival_i = t_闪发 + d(胸牌, a_i)/c + noise_i + offset_i\nΔ_i = arrival_i − arrival_参考', note: '发送时刻 t_闪发 未知，但它在两项里完全相同，一减即消。把十个胸牌全部钉到晶振容差的两端，整段运行依旧原样：每一条记录都在同一时刻、是同一类型，七十次定位的误差也一模一样。唯一会变的，是胸牌写进自己那条发送时间戳里的计数值，而这里没有谁会去读它。' },
    { text: '1 ns 就是 29.98 cm 的伪距，而每个时间差里都装着两个锚点的份额；默认的 0 ns 意味着锚点完美无缺，而变体把它设成 1 ns。' },
    { kind: 'table', heading: '两个场景，各七个块、各 70 次定位', head: [
      '场景', '每个时间差的 σ',
      '最差的时间差', '定位误差',
      '误差椭圆',
    ], rows: [
      ['完美同步', '4.2 cm', '0.10 m',
        '0.2–7.7 cm，平均 3.2', '3.0–4.1 cm'],
      ['1 ns 的同步误差', '42.6 cm', '0.41 m',
        '10.4–27.9 cm，平均 16.7', '30.5–41.5 cm'],
    ] },
    { text: '那个 σ 是 √2·c·√(σ_ts² + sync²)：一次相减里有两个时间戳、两个锚点的校准偏差。两次运行中的每一个时间差、每一次定位，都落在它的 4σ 之内；椭圆也是照这个数画的——所以两行之间它长大了十倍。' },
    { kind: 'table', heading: '日志印出什么：badge-1，第 0 块', head: [
      '行', '写的是',
    ], rows: [
      ['属于这个胸牌的那一轮',
        'badge-1 UWB round 0 of block 0 (UL-TDoA): 1 slots × 2000.0 µs'],
      ['它用掉这一轮发出的闪发',
        'badge-1 → * UWBBLINK 14 B @6.81 Mbps (181.2 µs)'],
      ['第一个时间差',
        'anchor-1 TDoA of badge-1 anchor-2 − anchor-1: 5.33 ns (true 5.39 ns)'],
      ['它喂出来的那个位置',
        'anchor-1 position of badge-1 (4.02, 3.46) m, true (4.00, 3.50), error 0.05 m, GDOP 0.85, 4 anchors (UL-TDoA)'],
      ['七个块之后的 badge-1',
        'error 2.1 cm, GDOP 0.85, ellipse 3.2 × 1.7 cm, UL-TDoA'],
    ] },
    { kind: 'steps', heading: '一次定位，一步一步', items: [
      '会话只给 badge-1 一个时隙，别的什么也没有。它发出一帧闪发，射频就关到下一个块。没有任何回应，也没有任何一条记录回到它这里。',
      '听到这帧闪发的每个锚点，都给它的 RMARKER（ranging marker）打戳。它会用自己的晶振写下一个计数值供日志显示——就是你能读到的那行 UWB_TS——但定位并不是用这个计数值算的。',
      '定位用的是锚点公共时基（common time base）上的那个到达时刻：真实飞行时间，加上这台接收机的时间戳噪声，再加上这个锚点自己的校准剩余误差。有线同步已经把它的晶振除掉了。',
      '那个剩余误差只在建网时按会话的同步误差抽过一次——本场景是 0 ns，变体里是 1 ns——此后再不重抽。这正是它是偏差而不是噪声的原因。',
      '时隙结束时，网络把四个到达时刻收齐，交给参考锚点 anchor-1。没听到闪发的锚点直接不算；而如果 anchor-1 自己没听到，这一轮就什么也不产出。',
      'anchor-1 用其余三个到达时刻各减去自己的那个。这里没有速率要修正：没有任何一段间隔量在谁的晶振上，而闪发离开的那个未知时刻同时出现在两项里，一减即消。',
      '三行 UWB_TDOA——每一行都写明它说的是哪个胸牌——就是三条双曲线。解算器在胸牌预设的高度上把它们相交，三条共用同一个 σ，再从 anchor-1 那条泳道发出那一行定位。',
    ] },
    { kind: 'table', heading: 'badge-1，第 0 块，对 anchor-2', head: [
      '步骤', '数值',
    ], rows: [
      ['闪发离开 badge-1',
        '未知，而且在两项里完全相同'],
      ['到 anchor-1 的真实飞行', '4.7634 m · 15.889 ns'],
      ['到 anchor-2 的真实飞行', '6.3789 m · 21.278 ns'],
      ['几何本身给出的那个差', '5.3886 ns · 1.6155 m'],
      ['每个锚点的校准剩余误差', '0 ns'],
      ['anchor-1 相减得到的', '5.3267 ns'],
      ['剩下的：两台接收机的噪声', '−0.0619 ns · −1.86 cm'],
      ['一个时间差的 σ', '√2·c·√(0.1² + 0²) ns = 4.2 cm'],
      ['它喂出来的那次定位', '(4.02, 3.46) m, true (4.00, 3.50), error 0.05 m'],
    ] },
  ],
  deeper: [
    { heading: '本场景抽到的那些偏差', text: '在 1 ns 下，四次抽样得到 +0.14、−0.97、−0.34 与 −0.31 ns，于是 badge-1 相对 anchor-2 的时间差短了大约 1.15 ns——而且每一轮都短这么多。它的七次读数是 −1.18、−1.28、−1.16、−1.11、−1.12、−1.18 与 −0.99 ns，一次也没有翻到另一边去；它自己的定位偏了 12.7 cm，而同步完好的那次只偏 2.1 cm。把每个胸牌的七次定位取平均，十个全都往东挪了 12 到 22 cm。发再多闪发也平均不掉它，只有更好的校准才行。' },
    { heading: '把旋钮走一遍，再走一遍几何', text: '编辑器里的“锚点同步误差”一栏，只有 UL-TDoA 下才可用。把它走一遍会看到：只要 σ 明显盖过时间戳噪声，它就是线性的。然后把它调回 1 ns，再把 badge-1 拖到 (9.8, 0.2)，即锚点矩形之外：GDOP 从 0.85 变成 3.43，椭圆从 32 cm 涨到 1.4 m，七次定位里最差的一次到 45.3 cm。时钟交出什么，几何都会把它放大。' },
    { kind: 'table', heading: '同步误差走一遍', head: [
      '同步误差', '平均定位误差', '70 次里最差',
    ], rows: [
      ['0 ns', '3.2 cm', '7.7 cm'],
      ['1 ns', '16.7 cm', '27.9 cm'],
      ['2 ns', '33.4 cm', '54.4 cm'],
      ['4 ns', '70.4 cm', '135.3 cm'],
    ] },
    { heading: '那个椭圆有多诚实', text: '它是一阶近似，而偏差并不是白噪声，所以请把它读作“定位可能偏离多远”，而不是 68 % 置信区间。两个场景里，长半轴至少有那七十次中最差误差的一半，最多也不过是它的几倍——一阶的数字，能许诺的大概也就这么多。' },
    { heading: '两条路各占多少空口', text: '只听的那一轮，不管是三个胸牌在听还是三千个，锚点都只花掉块的 0.505 %；而十个闪发的胸牌，七个块里要花掉 12.685 260 ms 的空口时间，一人一个时隙，一个块到一百个就满了。所以四百个标签需要四个块的时隙，或者更短的时隙，或者再开一个信道。上行形态换来的是胸牌本身：不用接收机、不用时钟速率修正、不用解算器。' },
  ],
  sources: [
    '本课只有一处以标准正文为依据：IEEE Std 802.15.4-2024 §10.29.1.2.5 给出了到达时间差测距的两种形态，本课讲的是第一种——移动节点发送，一组彼此时钟同步的固定节点接收，这些节点到达时刻之差就定出它在哪里。上面那条注释里把胸牌钉到的 ±20 ppm 晶振容差，出自 §16.4.9。',
    '其余都是模型：闪发帧的十四个字节，以及它不携带任何时间这件事；发送它的那个 2 ms 时隙；锚点的公共时基、“有线同步”的校准方式，以及每个锚点身上留下的那个固定剩余误差；还有上面引用的每一个数字。',
    '噪声取值同样是模型取值：每个接收时间戳上 100 ps 的 1σ 噪声；同步误差默认取 0 ns，那是实验室的答案，不是任何一次真实安装的答案。锚点自身的坐标同样被当作勘测得分毫不差。',
  ],
  scenario: () => uwbUlTdoaScenario('base'),
  variants: [
    { label: '1 ns 的同步误差', scenario: () => uwbUlTdoaScenario('sync') },
  ],
  jumps: [
    J('只属于一个胸牌的那一轮', firstUwbUlRound),
    J('它在这一轮里发出的闪发帧', firstUwbBlink),
    J('第一个给它打上时间戳的锚点', firstUwbRxTs),
    J('第一个时间差', firstUwbTdoa),
    J('基础设施解出的定位', firstUwbPosition),
  ],
  observe: [
    'badge-1 开启这个块里属于它的那一轮，用掉它发出一帧闪发，然后就闲到下一个块。整段运行里每一次发送都属于某个胸牌——一共七十次，每个胸牌每块一次。',
    '跟着这帧闪发走进房间：四个到达时间戳，分别在 181.234、181.237、181.240 与 181.242 µs，顺序正是各锚点到胸牌的距离次序。首尾相差八纳秒，而定出它位置的，就只有这八纳秒。',
    '在检视面板里打开 badge-1：没有距离，只有三个到达时间差和一次定位，而它们都是在别处算出来的。再打开参考锚点——这些算术全是它做的，它自己那条泳道却空空如也。',
  ],
  tryThis: [
    '载入“1 ns 的同步误差”。空口上什么也没变——还是那些闪发、还是那些空口时间（airtime）——可每一次定位都挪了位置。房间中部那个胸牌的椭圆胀到 32.1 × 16.8 cm；七十次定位的平均误差，从 3.2 cm 变成 16.7。',
    '在编辑器里把锚点同步误差依次走过 0、1、2、4 ns，每次读一下平均定位误差。第一步到第二步它翻了四倍，之后就随 σ 成倍增长：定位到底由什么构成，答案是时钟，不是射频。',
  ],
  quiz: [
    {
      q: '上一课只听的胸牌必须把自己的晶振除掉。这一课的为什么不要紧？',
      options: [
        '闪发帧太短，速率误差显不出来',
        '没有任何一段间隔量在它上面：相减的两个时刻都是锚点打的',
        '锚点估计出它的载波偏差并做了修正',
      ],
      answer: 1,
      explain: '那里胸牌相减的是自己的两个到达时刻。这里每个时间戳都属于锚点，而胸牌的发送时刻被减没了。',
    },
    {
      q: '一分米的同步误差，发得更勤为什么补不回来？',
      options: [
        '每个锚点的校准误差只抽一次、此后重复出现：偏差是平均不掉的',
        '多出来的闪发会互相碰撞',
        '解算器只保留最近的一帧闪发',
      ],
      answer: 0,
      explain: '每一轮短的量都一样，十个胸牌也朝同一方向挪。平均去掉的是时间戳噪声，剩下的是时钟。',
    },
    {
      q: '仓库想给四百个标签定位，医院想给人身上的胸牌定位。两者各自倾向哪一种？',
      options: [
        '两者都倾向上行形态：只有它把位置留在运营方能读到的地方',
        '两者都倾向另一边：只听的那一轮多少个都能服务，而只听的一方数都数不出来',
        '规模倾向上行形态，因为那边是基础设施在干活',
      ],
      answer: 1,
      explain: '上行形态的理由在标签本身，而不在数量：不用接收机、不用时钟速率修正、不用解算器。四百个标签需要四个块的时隙。',
    },
  ],
}
