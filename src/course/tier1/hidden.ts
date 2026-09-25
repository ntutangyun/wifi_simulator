/**
 * Wi-Fi Tier 1 · M5 · 听不见的邻居与损失 · two stations deaf to each other.
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
      { from: 'sta-1', to: 'sta-2', label: '两堵墙，听不见', tone: 'muted' },
    ],
  }
}

export const hidden: Lesson = {
  id: 'hidden',
  module: 4,
  title: '两台听不见彼此的站点',
  why: '“先听再说”这条规矩，前提是你听得见屋里每一个人。把两台站点（station, STA）放在房子的两头，接入点（access point, AP）摆在中间的走廊上：两台都能轻松够到接入点，却完全听不见对方——这就是隐藏节点（hidden station）。于是它们同时判定空口干净，两股信号在接入点处相遇、双双报废。这一课只问一件事：为什么“先听”在这里救不了任何人。',
  outcomes: [
    '说清为什么两台站点互相听不见时，“先听再说”就失灵了',
    '说出一台电台判定“忙”的两条门槛，以及这里哪一条都没被触到',
    '在时间轴上读出一次碰撞，并说出相撞的是哪两帧',
  ],
  needs: ['collisions-cw', 'nav', 'cca'],
  terms: [
    { term: 'hidden node', plain: '同一个网络里的一台站点，它发的东西你根本听不见，所以你的侦听永远报不出它' },
  ],
  picture: [
    {
      kind: 'diagram', heading: '走廊房子：谁听得见谁',
      spec: hiddenTopology(),
      caption: '接入点与两端的房间各隔一堵墙，两台站点之间隔着两堵砖墙。虚线是这一课的主角：这条路走不通，而它们共用的偏偏是同一条信道。',
    },
    { heading: '为什么“先听”救不了你', text: '两台站点都照章办事：先听，空口干净了才开口。当所有人都听得见所有人时，这就够了；在这里不够——一台的长帧才发到一半，另一台什么也没听见，断定信道是空的，于是开口。把退避（backoff）窗口开得更大也救不了：两者看不见彼此，谈何相让。' },
    { kind: 'watch', jump: 0, heading: '看两帧撞在一起', text: '载入仿真，跳到第一次碰撞。从那里往回走：两台站点谁的计数器都没有在对方的帧里冻结过，因为它们根本没有什么可听的。而能同时被两个房间听见的，只有走廊上那个接入点——下一课就借它来治这件事。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一台电台怎么判定“空闲”，以及这里为什么总是空闲', items: [
      '手里有帧的站点先等空口连续安静一个分布式帧间间隔（DCF interframe space, DIFS），再抽一个退避数，每过一个空闲时隙（slot time）减一。',
      '“忙”有两条门槛，每一刻同时判：空中有一个本电台看得见前导码（preamble）的传输，到达电平不低于 −82 dBm；或者空中所有能量加起来不低于 −62 dBm。两条都不满足，就是空闲。',
      '对面房间那一帧到这里只有 −83.4 dBm：比前导检测（preamble detection）那条线还低 1.4 dB，比能量检测（energy detection, ED）那条线低二十多分贝。于是信道读作空闲，计数器照样往下走。',
      '整场交互里它唯一听得见的，是接入点回的那个确认帧（acknowledgement, ACK），−60.6 dBm；而它来得比本该保护的那一帧还晚。',
      '于是两个计数器先后在对方的帧里归零，两个传输在接入点处重叠，两个前导码互相淹没，接入点一个都没锁上。发送方要等自己那 45 µs 的期限到期才知情。',
    ] },
    { kind: 'table', heading: '整场交互里，远端站点听得见什么', head: [
      '帧', '何时', '隔墙', '远端站点的反应',
    ], rows: [
      ['近端的 1528 字节数据帧', '1.95 – 2.31 ms', '两堵',
        '径直数了过去：106、105、……66，连之后那段间隙也数完'],
      ['接入点的 ACK', '2325 – 2353 µs', '一堵',
        '在 64 冻结，熬完 28 µs 的 ACK 和 34 µs 的等待，2387 µs 从 64 继续'],
    ] },
    { heading: '一次什么也没守住的冻结', text: '那个回答是本次交互的最后一帧，它的 Duration 是零，没有什么可预告的。片刻之后近端开始下一帧，重新“失聪”的远端又径直数了过去。300 ms 里这个房间碰撞 126 次，每一次都夹着一个数据帧（data frame），两台站点合起来只送达 45 帧。' },
  ],
  sources: [
    '“开口之前先判信道空闲”这条规矩见 IEEE Std 802.11-2024 的 §10.3.2.1 与 §10.3.4；一台站点听不见的对端（隐藏节点）正是 §10.3.2.9 里 RTS/CTS 要解决的情况。',
    'Duration 字段及其含义——从当前帧结束起算、以微秒计的一段时间——见 §9.2.4.2。',
    '−82 dBm 的前导检测门限、−62 dBm 的能量检测门限、两堵砖墙及其损耗，以及上面每一个计数和时刻，都是模型取值（src/engine/phy.ts 与 src/engine/channel.ts），靠场景的随机种子即可复现，并非取自标准正文。',
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
    '基础场景：红色的碰撞刻度就没断过——300 ms 里 126 次，而且每一次都夹着一个数据帧。',
    '两台隐藏站点谁也不会为对方冻结：没有一次冻结落在另一个房间发来的帧里。每一次冻结都是为接入点的 ACK 而停——那是对方整场交互里唯一听得见的部分。',
  ],
  tryThis: [
    '在编辑器里，给走廊的一堵墙靠上端、也就是两台站点连线经过处（y ≈ 7.2）开一扇门：射线从此只穿一堵墙，它们又能听见彼此。门开得靠下则毫无作用。',
  ],
  quiz: [
    {
      q: '为什么把竞争窗口（contention window, CW）开大解决不了隐藏节点的碰撞？',
      options: [
        '因为 CW 不能超过它的上限',
        '因为两台站点根本侦听不到彼此，等多久都照样撞进对方的帧里',
        '其实能解决，只是慢',
      ],
      answer: 1,
      explain: '退避计数器只能把“互相听得见”的站点错开。一台你听不见的站点，根本谈不上和你轮流来。',
    },
    {
      q: '远端站点判定信道空闲，是因为没有听到什么？',
      options: [
        '没有听到接入点的许可',
        '收到的电平既没到 −82 dBm 的前导检测门限，也没到 −62 dBm 的能量门限',
        '没有收到任何前导码',
      ],
      answer: 1,
      explain: '两条门槛都没被触到，“忙”这个结论就无从产生——不是它疏忽，是它真的什么都没收到。',
    },
  ],
}
