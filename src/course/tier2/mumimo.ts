/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · dividing space instead of frequency.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md,
 * §2 M10): this half keeps the space-division idea, the measurement the router
 * has to make first, and the one rule the engine follows here — a group is
 * trimmed until the members' streams fit the router's own antennas. Which of
 * the two ways this turn takes, and what each one costs, is `mumimo-choose`.
 *
 * Two corrections that must stay:
 *  - "one round of acknowledgement settles the group" is 162 of 169 rounds in
 *    the slicing variant, not always;
 *  - the picture must not send the reader to watch a sounding exchange: this
 *    simulator never runs one, and that is said where the reader meets it.
 *
 * The scenario builder and the two variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below, and every node of the figure, is pinned in
 * tests/course/mumimo.test.ts; `tests/course/quoted-timestamps.test.ts` owns the
 * timestamps of the two quoted sends.
 */
import { type Lesson, firstData, firstBa, firstMuDl, J } from '../lessonKit'
import { mumimoScenario } from '../wifiScenes'
import type { TopologySpec } from '../diagram'

/** The Chinese name the figure gives each device of the scene. */
const DIAGRAM_NAMES: Record<string, string> = {
  ap: '路由器', 'sta-1': '手机 1', 'sta-2': '手机 2', 'sta-3': '手机 3', 'sta-4': '笔记本',
}

/**
 * The run's first MU-MIMO send, as who the router is aimed at: phones 2 and 3
 * share the spectrum, phone 1 was trimmed off the end of the list because a
 * third pair of streams does not fit four antennas. Positions are the scene's
 * own, so a device moved in the scenario moves in the figure.
 */
export function mumimoTopology(): TopologySpec {
  const nodes = mumimoScenario(true).nodes.map((n) => ({
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
      { from: 'ap', to: 'sta-2', tone: 'accent' },
      { from: 'ap', to: 'sta-3', tone: 'accent' },
      { from: 'ap', to: 'sta-1', tone: 'muted' },
      { from: 'ap', to: 'sta-4' },
    ],
    ring: { nodes: ['ap', 'sta-2', 'sta-3'], label: '这一轮的分组' },
  }
}

export const mumimo: Lesson = {
  id: 'mumimo',
  module: 9,
  title: 'MU-MIMO——按空间而不是按频率划分',
  why: '把信道切成片，一次发送就能照顾到好几部手机，但每一片都只是整条信道的一部分，成员越多，每部手机被服务得越慢。其实还有另一种把大家塞进同一次发送的办法：它不让任何人让出带宽，改用天线（antenna）来付账——这个办法就叫作多用户 MIMO（multi-user MIMO, MU-MIMO）。这一课讲清楚它靠什么区分开几部手机，以及一个组能有多大，最后是由谁说了算。',
  outcomes: [
    '说出 MU-MIMO 切分的是什么、不切分的又是什么',
    '说出路由器为什么必须先把房间量一遍，才用得了这个办法',
    '按天线数算出这一轮的组最多装得下几部手机，并在时间轴上验证',
  ],
  needs: ['streams', 'ofdma-dl'],
  terms: [
    { term: 'MU-MIMO', plain: '在一次发送里服务多台设备的另一种办法：给每台瞄准各自的一组空间流，而不是给每台分一片信道' },
    { term: 'beamforming', plain: '用多根天线发同一个信号，彼此错开一点点，使它在某个位置叠加变强、在另一个位置互相抵消' },
    { term: 'sounding', plain: '事先的那次测量：路由器发出一段已知的图案，每台设备把自己听到的样子报回来' },
  ],
  picture: [
    { heading: '切空间，而不是切信道', text: '切片的做法，是把子载波（sub-carrier）分给每个成员一部分，于是每个成员也只拿到速率的一部分。但可以切的不止这一个维度。换成：每个成员都拿到整条信道，只是给每台瞄准不同的一组空间流（spatial stream）——这样谁也不必让出带宽，区分成员靠的是它们在哪儿，而不是它们用哪些音调。这就是 MU-MIMO。' },
    { heading: '但这要求知道每个人在哪儿', text: '同一个信号从多根天线发出去，彼此错开一点点，而这个“一点点”被挑得恰到好处：让它在某部手机处叠加，在另一部手机处互相抵消——这就是波束成形（beamforming）。要挑出这些延迟，路由器得先把房间量一遍：它发出一段已知的图案，每部手机把听到的样子报回来，这就是探测（channel sounding）。家具会挪，人会走动，量得太旧的结果，瞄准的只是手机从前待过的地方。而本仿真器一次探测也不发，也不为它收空口时间（airtime）：时间轴上没有这一步，它直接假定瞄得够准。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，在时间轴上方切到“MU-MIMO（按空间划分）”那个变体，再跳到第一个同时装着多部手机的发送。把鼠标停在那个宽蓝块上：里面只有两份，而每一份都占着整条信道。第三部手机不在里面。' },
    {
      kind: 'diagram', heading: '这一轮，路由器瞄着谁', spec: mumimoTopology(),
      caption: '本场景第一次按空间划分的发送：路由器同时瞄着手机 2 和手机 3，两份各占整条 160 MHz。虚线那部手机这一轮被裁掉了——它也要两条流，而四根天线已经被占满。被裁掉的是哪一部并不固定，看那一瞬间谁排在名单前面。',
    },
    { heading: '这里的分组为什么永远不是三个', text: '瞄准是要拿天线换的。每个成员的空间流都得由路由器自己的天线扛着，所以一个组能有多大，上限就是它的天线数：这台路由器有四根，每部手机协商到两条流，两部手机就把四根占满了。第三部还得再要六条。切片没有这道坎——三部手机各占一片都塞得下——所以空间用尽的地方，频率还走得下去。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一个按空间划分的分组是怎么攒出来的，一步一步', items: [
      '路由器赢下一轮，列出此刻队列（queue）里有东西、并且和它协商过多用户（multi-user, MU）发送的手机。名单上不到两部，它就照老路只服务一部；否则只留前四部。',
      '要按空间划分，这几部还得都协商过 MU-MIMO，而且各自队首排着的东西不能太少——至少 1,000 字节。为什么偏偏是这个量，是下一课那笔账的事。',
      '然后它从名单末尾开始一部一部地裁，直到成员协商的流数之和不超过自己的天线数：两部两流手机要四条，再加第三部就要六条。',
      '裁完后幸存者不足两部，就整组退回按频率划分。否则每个幸存者都拿到整个带宽、各用自己协商的流数，而被裁掉的那部手机则等一次属于自己的发送。',
      '整次发送的长度取最长的那个成员所需，每个成员的那一份都在同一瞬间结束。',
      '结束后隔 16 µs，一轮确认就把整组了结——但并非每次都如此：按频率划分那个变体的 169 次分组发送里，有 162 次是这样，另外七次是笔记本压着这次发送说了话。',
    ] },
    { kind: 'table', heading: '三部手机都有排队的那一轮，按天线数裁一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['队列里有东西的手机', '3'],
      ['都协商过 MU-MIMO，且队首都有 1,000 字节', '是'],
      ['三部要的流数，对比路由器的四条', '6 > 4'],
      ['裁完后的成员数', '2'],
      ['每个成员拿到的信道', '全部'],
      ['每个成员各用几条流', '2'],
      ['被裁掉的那一部', '等一次属于自己的发送'],
    ] },
    { heading: '被裁掉的那部手机接下来去哪儿了', text: '“等一次属于自己的发送”究竟是怎么个等法，值得实测而不是猜。这段仿真里的 196 次两成员发送中，被裁掉的那部手机有 122 次（62%）紧接着就拿到属于自己的单用户发送，有 65 次（33%）出现在下一次组成的配对里，还有 9 次（5%）两样都不是：路由器又先轮到了另外那两部，它只好再等一轮。' },
  ],
  deeper: [
    { heading: '两个变体真正的差别', text: '只差一个功能开关：MU-MIMO，手机和路由器上都是。“切片信道”那项能力从未被动过，因为把它关掉不会得到“更纯粹的切片”——那会得到两种多用户发送都没有的结果，比较也就无从谈起了。' },
  ],
  sources: [
    '这里的两个想法里，MU-MIMO 是更老的那个：下行 MU-MIMO 随 Wi-Fi 5（802.11ac）到来，而 Wi-Fi 6 才加入 OFDMA，并把多用户发送扩展到上行。本仿真器只为 Wi-Fi 6 和 7 模拟多用户发送。',
    '下行 MU-MIMO、它所依赖的探测流程（NDP 通告、NDP、压缩波束成形报告）以及 MU PPDU 的每用户字段，Wi-Fi 6 见 IEEE Std 802.11-2024 第 27 章，Wi-Fi 7 见第 36 章。',
    '本仿真器不真的跑探测流程，也不为它计任何开销：它假设瞄准已经完美，这是模型取值。真实的发射机还要把功率分给组内各成员，对其他成员的置零也不可能精确，所以每个成员的信号质量、连带它的速率，实际上都会有所下降。',
    '“一组最多四个成员”与 1,000 字节的门槛都是引擎自己的规定（mac.ts），并非标准正文；802.11ax/be 对成员数的限制远比这宽。',
  ],
  scenario: () => mumimoScenario(false),
  variants: [
    { label: 'OFDMA（按频率划分）', scenario: () => mumimoScenario(false) },
    { label: 'MU-MIMO（按空间划分）', scenario: () => mumimoScenario(true) },
  ],
  jumps: [
    J('第一次多用户发送', firstMuDl),
    J('第一个数据帧', firstData),
    J('第一个 BlockAck', firstBa),
  ],
  observe: [
    '在“按空间划分”那个变体里，把鼠标停在宽蓝块上：只有两份，每一份都占着整条 160 MHz、各用自己的两条流。无论房间里有几部手机，这个块都长不过两份。',
    '盯住被排除在配对之外的那部手机。多数时候紧接着就有一个属于它自己的发送；有时它出现在下一次配对里；偶尔两样都没有，它得再等一轮。被排除的是哪一部并不固定。',
  ],
  tryThis: [
    '在编辑器里加上第四部手机、第五部手机，再重新载入。按频率划分那个变体会把它们吸收进来，一组最多四个成员；而按空间划分那个变体无论你加多少部，都长不过两份——天线数是一道硬坎，队列长短改变不了它。',
  ],
  quiz: [
    {
      q: '为什么一台四天线的路由器不能用 MU-MIMO 同时服务三部两流手机？',
      options: [
        '三路瞄准的信号会在空口里互相碰撞',
        '它们的流数加起来是六条，比路由器拥有的多出一半',
        'MU-MIMO 分组永远只能有两个成员',
      ],
      answer: 1,
      explain: '每部手机协商到两条流，两部手机就用满了全部四条。分组会一直被裁到塞得下为止，这里正好落在两个——第三部手机则被单独服务。',
    },
    {
      q: '按空间划分的那次发送里，每个成员拿到多宽的信道？',
      options: [
        '一半——两个成员平分',
        '整条——成员之间分开的是空间，不是频率',
        '看它排了多少字节',
      ],
      answer: 1,
      explain: '这正是这个办法的全部意思：谁也不让出带宽，区分成员靠的是路由器往哪个方向瞄。代价记在天线上，而不是记在带宽上。',
    },
  ],
}
