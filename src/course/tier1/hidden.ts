/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · two stations deaf to each other.
 *
 * The first half of the old `hidden`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M5). The
 * parent taught two rules: why "listen first" cannot save two stations that
 * cannot hear each other, and the question-and-permission exchange that
 * repairs it. The cure is now `rts-cts`, which loads this lesson's scene
 * unchanged (`sameSceneAs: 'hidden'`).
 *
 * This half keeps the base scene, jump 0 (the first collision), the asymmetry
 * table, the door experiment and the first quiz question. RTS, CTS, the RTS
 * threshold, the six-step protected exchange, the 718 µs worked round, the
 * on/off comparison and both `deeper` notes went next door with the variant
 * they are about — the variant itself stays declared here, because the kit
 * requires both halves of a split to carry the same variant list.
 *
 * Its own procedure is new to this half and is the one its own scene shows:
 * what "idle" means to a radio (`Channel.recomputeCca` in
 * src/engine/channel.ts — a preamble at or above CCA_PD_DBM, or total power at
 * or above CCA_ED_DBM), and why neither test ever fires across two brick
 * walls. The protected exchange's procedure went whole to `rts-cts`, so
 * neither half carries half a procedure.
 *
 * The topology figure replaces 「两个房间，一条走廊」 (§5.4): who hears whom, and
 * how many walls are in the way, is a picture rather than a paragraph.
 *
 * Every number quoted below is pinned in tests/course/hidden.test.ts. The
 * scenario builder and its variant are unchanged, so the recorded timeline
 * hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 */
import type { Scenario } from '../../model/scenario'
import type { TopologySpec } from '../diagram'
import { type Lesson, hallwayHouse, node, sc, firstCollision, J } from '../lessonKit'

/**
 * The corridor house, shared with `rts-cts` so the two halves replay one
 * timeline: an access point in the hallway and one saturated legacy station in
 * each end room. `rtsThresholdBytes` is what the variant changes and nothing
 * else.
 */
export function hiddenScenario(extra: Partial<Scenario> = {}): Scenario {
  return sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
    node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
  ], extra)
}

/** The Chinese name the figure gives each device of the scene. */
const DIAGRAM_NAMES: Record<string, string> = {
  ap: '接入点', 'sta-1': 'Hidden A', 'sta-2': 'Hidden B',
}

/**
 * Who hears whom, read out of the lesson's own scenario: the ids, the roles and
 * the positions all come from `hiddenScenario()`, so a station moved in the
 * scene moves in the figure, and the test compares the two node for node.
 *
 * The dashed line is the whole lesson: the path the run refuses. Both arrows to
 * the hallway cross one wall and work; the line along the bottom crosses two and
 * arrives below the level a radio calls a signal at all, which is why neither
 * station ever freezes for the other.
 */
export function hiddenTopology(): TopologySpec {
  const nodes = hiddenScenario().nodes.map((n) => ({
    id: n.id,
    label: DIAGRAM_NAMES[n.id],
    role: n.kind === 'ap' ? ('ap' as const) : ('sta' as const),
    x: n.pos.x,
    y: n.pos.y,
  }))
  return {
    kind: 'topology',
    nodes,
    links: [
      { from: 'sta-1', to: 'ap', label: '一堵墙', tone: 'accent', both: true },
      { from: 'sta-2', to: 'ap', label: '一堵墙', tone: 'accent', both: true },
      { from: 'sta-1', to: 'sta-2', label: '两堵墙，收不到', tone: 'muted' },
    ],
  }
}

export const hidden: Lesson = {
  id: 'hidden',
  module: 4,
  title: '两台相互收不到信号的站点',
  why: '“先侦听后发送”这条规则的前提是：每台站点都能收到房间里所有其他站点的信号。把两台站点（station, STA）放在房子的两端，接入点（access point, AP）放在中间的走廊上：两台站点各隔一堵墙即可与接入点通信，彼此之间却隔着两堵墙——这就是隐藏节点（hidden station）。对面房间的数据帧（data frame）到达时，电平比前导检测（preamble detection）门限还略低，比能量检测（energy detection, ED）门限低二十多分贝，两条判忙门限都未达到，于是信道判为空闲，退避（backoff）计数照常递减，减到零就发送，恰好与对方正在发送的那一帧重叠。两路信号在接入点处重叠，两个前导码（preamble）相互干扰，接入点一帧也无法锁定，发送方要等自己的应答期限到期才得知失败。远端站点唯一能收到的，是接入点回复的确认帧（acknowledgement, ACK），它会为此短暂冻结；但这个应答到达的时间比它本应保护的那一帧还晚，而且它的 Duration 为零，无法预告任何后续传输。所以增大竞争窗口（contention window, CW）毫无作用：退避只能使能够相互收到信号的站点错开发送。这个房间里碰撞几乎持续不断，每一次都涉及一个数据帧，整轮碰撞次数接近送达帧数的三倍。两个房间都能收到其信号的，只有走廊上的接入点，下一课就利用它来解决这个问题。',
  outcomes: [
    '说明为什么两台站点相互收不到信号时，“先侦听后发送”就会失效',
    '说出一台电台判定“忙”的两条门限，以及这里为什么两条都未达到',
    '在时间轴上找出一次碰撞，并说出发生碰撞的是哪两帧',
  ],
  needs: ['collisions-cw', 'nav', 'cca'],
  terms: [
    { term: 'hidden node', plain: '同一个网络中的一台站点，本机收不到它发送的信号，因此本机的侦听永远不会因它而报忙' },
  ],
  picture: [
    {
      kind: 'diagram', heading: '走廊户型：哪些设备之间能收到信号',
      spec: hiddenTopology(),
      caption: '接入点与两端的房间各隔一堵墙，两台站点之间隔着两堵砖墙。虚线是本课的重点：这条传播路径不通，而两台站点使用的却是同一条信道。',
    },
    { heading: '“先侦听后发送”为什么在这里失效', text: '两台站点都遵守规则：先侦听，空口空闲才发送。当所有站点都能相互收到信号时，这就足够；在这里则不够——一台站点的长帧才发送到一半，另一台什么也没有收到，判定信道空闲，于是开始发送。把退避（backoff）窗口增大也没有用：两者侦听不到彼此，无法相互避让。' },
    { kind: 'watch', jump: 0, heading: '观察两帧发生碰撞', text: '载入仿真，跳到第一次碰撞。从那里向前回溯：两台站点的计数器都没有在对方的帧期间冻结过，因为它们根本收不到对方的信号。而两个房间都能收到其信号的，只有走廊上的接入点——下一课就利用它来解决这个问题。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一台电台如何判定“空闲”，以及这里为什么总是空闲', items: [
      '有帧待发的站点先等待空口连续空闲一个分布式帧间间隔（DCF interframe space, DIFS），再随机选取一个退避值，每经过一个空闲时隙（slot time）减一。',
      '“忙”有两条门限，每一时刻同时判断：空中有一路本电台检测到其前导码（preamble）的传输，且到达电平不低于 −82 dBm；或者空中所有能量之和不低于 −62 dBm。两条都不满足，就判为空闲。',
      '对面房间那一帧到达这里只有 −83.4 dBm：比前导检测（preamble detection）门限还低 1.4 dB，比能量检测（energy detection, ED）门限低二十多分贝。于是信道判为空闲，计数器照常递减。',
      '整个交互过程中它唯一能收到的，是接入点回复的确认帧（acknowledgement, ACK），−60.6 dBm；而它到达的时间比本应保护的那一帧还晚。',
      '于是两个计数器先后在对方的帧期间归零，两路传输在接入点处重叠，两个前导码相互干扰，接入点一个也没有锁定。发送方要等自己那 45 µs 的期限到期才得知失败。',
    ] },
    { kind: 'table', heading: '整个交互过程中远端站点能收到什么', head: [
      '帧', '何时', '隔墙', '远端站点的反应',
    ], rows: [
      ['近端的 1528 字节数据帧', '1.95 – 2.31 ms', '两堵',
        '计数持续递减：106、105、……66，其后那段间隔也照常计完'],
      ['接入点的 ACK', '2325 – 2353 µs', '一堵',
        '在 64 冻结，经过 28 µs 的 ACK 和 34 µs 的等待后，2387 µs 从 64 继续'],
    ] },
    { heading: '一次没有起到保护作用的冻结', text: '那个应答是本次交互的最后一帧，它的 Duration 为零，没有可预告的内容。片刻之后近端站点开始发送下一帧，远端站点重新回到收不到对方信号的状态，计数又持续递减。300 ms 内这个房间碰撞 126 次，每一次都涉及一个数据帧（data frame），两台站点合计只送达 45 帧。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '−83.4 dBm 是一个定值，只比门限低 1.4 dB：默认没有衰落，到达电平只由几何位置和墙体决定，所以「永远收不到」在这里精确成立。编辑器的「时变链路（衰落）」一节可以开启衰落，默认 4 dB 的阴影标准差足以使电平反复越过这 1.4 dB 的余量，此时两台站点会时而能收到对方、时而收不到——真实房间里的隐藏节点正是这样时有时无的。' },
    { kind: 'threshold', text: '判忙是一条硬门限：到达 −82.0 dBm 就一定判忙，−82.1 dBm 就一定不判忙（channel.ts 里对 CCA_PD_DBM 的那次比较）。真实的前导检测是一条概率曲线，门限附近是「有时检出、有时检不出」，所以「隐藏」与「不隐藏」之间并没有这样截然的分界。' },
    { kind: 'model-value', text: '墙的损耗是一张常数表：砖 12 dB、石膏板 5 dB、玻璃 3 dB，沿两点之间的直线相加，射线穿过门窗洞口时整堵墙不计（src/engine/propagation.ts）。真实的隔墙损耗随材料、厚度、频率与入射角变化，这张表是一组代表值，不是这栋房子的测量结果。' },
    { kind: 'unmodelled', text: '只计算直射路径：引擎只考虑发射端到接收端的直线，穿过几堵墙就扣除几份损耗（rxPowerDbm），没有反射、没有绕射、没有经走廊拐弯的多径分量。真实的两个房间常常借助走廊里的一次反射就能相互收到信号，所以「隔两堵砖墙就收不到」比真实房间的情况理想得多。' },
    { kind: 'out-of-scope', text: '碰撞 126 次、只送达 45 帧，只在「两台站点始终有帧待发」时成立：本场景使用的是饱和业务模型（traffic.ts 的 saturated）。真实设备的队列时常为空，两台隐藏站点同时有帧待发的机会少得多，损失也小得多——也因此更难被发现。' },
  ],
  sources: [
    '“发送之前先判断信道空闲”这条规则见 IEEE Std 802.11-2024 的 §10.3.2.1 与 §10.3.4；一台站点收不到其信号的对端（隐藏节点）正是 §10.3.2.9 里 RTS/CTS 要解决的情况。',
    'Duration 字段及其含义——从当前帧结束起算、以微秒计的一段时间——见 §9.2.4.2。',
    '−82 dBm 的前导检测门限、−62 dBm 的能量检测门限取自 IEEE Std 802.11-2024 §17.3.10.6（见「空闲信道评估」那一课）；两堵砖墙及其损耗，以及上面每一个计数和时刻，都是模型取值（src/engine/phy.ts 与 src/engine/channel.ts），可以通过场景的随机种子复现，并非取自标准正文。',
  ],
  scenario: () => hiddenScenario(),
  variants: [
    {
      label: '开启 RTS/CTS（门限 500 B）',
      scenario: () => hiddenScenario({ rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('第一次碰撞', firstCollision),
  ],
  observe: [
    '基础场景：红色的碰撞刻度几乎连续不断——300 ms 内 126 次，而且每一次都涉及一个数据帧。',
    '两台隐藏站点都不会为对方冻结：没有一次冻结发生在另一个房间发来的帧期间。每一次冻结都是因为接入点的 ACK——那是对方整个交互过程中唯一能收到的部分。',
  ],
  tryThis: [
    '在编辑器里，在走廊一侧墙体的上端、也就是两台站点连线经过处（y ≈ 7.2）开一扇门：射线此后只穿过一堵墙，它们又能收到彼此的信号。门开在靠下的位置则没有任何作用。',
  ],
  quiz: [
    {
      q: '为什么增大竞争窗口（contention window, CW）无法解决隐藏节点的碰撞？',
      options: [
        '因为 CW 不能超过它的上限',
        '因为两台站点根本侦听不到彼此，无论等待多久，仍会与对方的帧重叠',
        '其实能解决，只是较慢',
      ],
      answer: 1,
      explain: '退避计数器只能使“能够相互收到信号”的站点错开。对于一台本机收不到其信号的站点，根本无法与之轮流发送。',
    },
    {
      q: '远端站点判定信道空闲，是因为没有检测到什么？',
      options: [
        '没有收到接入点的许可',
        '收到的电平既未达到 −82 dBm 的前导检测门限，也未达到 −62 dBm 的能量门限',
        '没有收到任何前导码',
      ],
      answer: 1,
      explain: '两条门限都未达到，就不会得出“忙”的结论——不是它疏忽，而是它确实什么也没有收到。',
    },
  ],
}
