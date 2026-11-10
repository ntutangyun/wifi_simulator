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
  why: '把信道划分为若干部分，一次发送就能服务多部手机，但每一部分都只是整条信道的一部分，成员越多，每部手机获得的速率越低。其实还有另一种把多台设备编入同一次发送的办法：它不要求任何成员让出带宽，而是用天线（antenna）来承担这项开销——这个办法称为多用户 MIMO（multi-user MIMO, MU-MIMO）。每个成员都得到整条信道，路由器给每部手机定向发送不同的一组空间流（spatial stream），依靠的是波束成形（beamforming）：同一个信号从几根天线以微小的时间差发出，使它在一部手机处相互叠加、在另一部手机处相互抵消。所以区分成员依靠的是它们的位置，而不是它们使用哪些音调。要实现定向发送，路由器本应先测量信道，这一步称为探测（channel sounding）；本仿真器省略了这一步，既不发送探测帧，也不为它计入空口时间（airtime），直接假定波束指向足够准确。一个组的大小受天线数限制：每个成员的空间流都要由路由器自己的天线承载，这台路由器有四根天线、每部手机两条流，两部手机就占满了，所以这里的组永远不会有三个成员。第三部手机被裁掉，多数情况下紧接着获得一次属于自己的发送。按频率划分没有这一限制，三部手机各占一部分都能容纳：空间资源用尽时，频率划分仍然可行。',
  outcomes: [
    '说出 MU-MIMO 划分的是什么、不划分的又是什么',
    '说出路由器为什么必须先测量信道，才能使用这个办法',
    '按天线数算出这一轮的组最多能容纳几部手机，并在时间轴上验证',
  ],
  needs: ['streams', 'ofdma-dl'],
  terms: [
    { term: 'MU-MIMO', plain: '在一次发送中服务多台设备的另一种办法：给每台设备定向发送各自的一组空间流，而不是给每台分配一部分信道' },
    { term: 'beamforming', plain: '用多根天线发送同一个信号，彼此有微小的时间差，使它在某个位置叠加增强、在另一个位置相互抵消' },
    { term: 'sounding', plain: '预先进行的测量：路由器发出一段已知的序列，每台设备把自己接收到的结果反馈回来' },
  ],
  picture: [
    { heading: '划分空间，而不是划分信道', text: '按频率划分的做法，是把子载波（sub-carrier）分配给每个成员一部分，于是每个成员也只得到速率的一部分。但可以划分的不止这一个维度。另一种做法是：每个成员都得到整条信道，只是给每台设备定向发送不同的一组空间流（spatial stream）——这样任何成员都不必让出带宽，区分成员依靠的是它们的位置，而不是它们使用哪些音调。这就是 MU-MIMO。' },
    { heading: '这要求预先知道每台设备的位置', text: '同一个信号从多根天线发出，彼此有微小的时间差，而这个时间差经过精确选择：使信号在某部手机处叠加，在另一部手机处相互抵消——这就是波束成形（beamforming）。要确定这些延迟，路由器必须先测量信道：它发出一段已知的序列，每部手机把自己接收到的结果反馈回来，这就是探测（channel sounding）。家具会移动，人会走动，过时的测量结果所对准的只是手机从前所在的位置。而本仿真器从不发送探测帧，也不为它计入空口时间（airtime）：时间轴上没有这一步，它直接假定波束指向足够准确。' },
    { kind: 'watch', jump: 0, heading: '在时间轴上观察', text: '载入仿真，在时间轴上方切换到“MU-MIMO（按空间划分）”那个变体，再跳到第一个同时包含多部手机的发送。把鼠标悬停在那个宽蓝块上：其中只有两份，而每一份都占用整条信道。第三部手机不在其中。' },
    {
      kind: 'diagram', heading: '这一轮，路由器的波束对准哪些手机', spec: mumimoTopology(),
      caption: '本场景第一次按空间划分的发送：路由器同时对准手机 2 和手机 3，两份各占整条 160 MHz。虚线所示的那部手机这一轮被裁掉了——它也需要两条流，而四根天线已经被占满。被裁掉的是哪一部并不固定，取决于那一时刻谁排在名单前面。',
    },
    { heading: '这里的分组为什么永远不会有三个成员', text: '定向发送的代价由天线承担。每个成员的空间流都必须由路由器自己的天线承载，所以一个组的大小受其天线数限制：这台路由器有四根天线，每部手机协商到两条流，两部手机就占满了四根。再加上第三部，就需要六条。按频率划分没有这一限制——三部手机各占一部分都能容纳——所以空间资源用尽时，频率划分仍然可行。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一个按空间划分的分组如何组建：逐步说明', items: [
      '路由器赢下一轮竞争后，列出此刻队列（queue）中有数据、并且与它协商过多用户（multi-user, MU）发送的手机。名单上不到两部时，它就按原来的单用户方式只服务一部；否则只保留前四部。',
      '要按空间划分，这几部手机还必须都协商过 MU-MIMO，而且各自队首的数据不能太少——至少 1,000 字节。为什么恰好是这个量，由下一课讲的两项开销决定。',
      '然后它从名单末尾开始逐部裁减，直到成员协商的流数之和不超过自己的天线数：两部两流手机需要四条，再加第三部就需要六条。',
      '裁减后剩余成员不足两部时，就整组退回按频率划分。否则每个剩余成员都得到整个带宽、各用自己协商的流数，而被裁掉的那部手机则等待一次属于自己的发送。',
      '整次发送的时长取所需时长最长的那个成员，每个成员的那一份都在同一时刻结束。',
      '结束后间隔 16 µs，一轮确认就完成整组的确认——但并非每次都如此：按频率划分那个变体的 169 次分组发送中，有 162 次如此，另外七次与笔记本的发送发生了碰撞。',
    ] },
    { kind: 'table', heading: '三部手机都有数据排队的那一轮，按天线数裁减一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['队列中有数据的手机', '3'],
      ['都协商过 MU-MIMO，且队首都有 1,000 字节', '是'],
      ['三部所需的流数，与路由器的四条对比', '6 > 4'],
      ['裁减后的成员数', '2'],
      ['每个成员得到的信道', '全部'],
      ['每个成员各用几条流', '2'],
      ['被裁掉的那一部', '等待一次属于自己的发送'],
    ] },
    { heading: '被裁掉的那部手机接下来的情况', text: '“等待一次属于自己的发送”具体如何等待，值得实测而不是推测。这段仿真里的 196 次两成员发送中，被裁掉的那部手机有 122 次（62%）紧接着就获得属于自己的单用户发送，有 65 次（33%）出现在下一次组成的配对中，还有 9 次（5%）两者都不是：路由器又先服务了另外两部，它只能再等一轮。' },
  ],
  deeper: [
    { heading: '两个变体真正的差别', text: '两者只差一个功能开关：MU-MIMO，手机和路由器上都是如此。OFDMA 那项能力从未改动，因为关闭它不会得到“更纯粹的按频率划分”——那会得到两种多用户发送都没有的结果，比较也就无从谈起。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '探测流程从不执行，也不计入开销（课文在读者首次遇到它的地方已经说明），而更根本的是：引擎连可用于波束对准的信息都没有——一对节点之间只有一个电平值，没有信道矩阵。所以「波束指向是否准确」在这里根本不是一个可变的量。真实的下行 MU-MIMO 要先发送 NDP 通告与 NDP，再收回压缩波束成形报告，这几帧本身就占用空口时间，而家具一移动、人一走动，测得的结果就开始过时。' },
    { kind: 'unmodelled', text: '成员之间的隔离是按定义设定的：一次 MU-MIMO 发送的各部分被标为同一个 orthogonalGroup，同组之间不计入彼此的干扰（channel.ts）。但 MU-MIMO 的成员恰恰共用同一批子载波、同一段时间，把它们分开的只有空间预编码，而预编码留下的残余泄漏才是这项技术真正的代价。于是这里两个成员各自得到与单用户时完全相同的速率，而在真实设备中，每个成员的信噪比都会因组内相互泄漏而有所下降。' },
    { kind: 'unmodelled', text: '发射功率也没有被分配：每个成员的级别来自 mcsForPeer，而那个值计算的是它单独存在时的电平。真实发射机要把同一份总功率分配给组内各成员，两个成员各得一半就是各少 3 dB，这常常足以使某个成员降一级。所以「每份都占用整条信道、各用自己的两条流」在时间轴上是成立的，在射频上则是偏乐观的。' },
    { kind: 'model-value', text: '「组内流数之和不超过接入点自己的天线数」是引擎唯一的裁剪规则（mac.ts 的 fitsStreams），一组最多四个成员也是引擎设定的数。标准另有自己的约束——压缩波束成形报告的大小、探测的周期、分组成员数的上限——而它们在这里都不存在。所以「四根天线只能服务两部两流手机」是这一条加法规则的结果，而不是某个条款的结果。' },
  ],
  sources: [
    '这里的两种方法中，MU-MIMO 出现得更早：下行 MU-MIMO 随 Wi-Fi 5（802.11ac）到来，而 Wi-Fi 6 才加入 OFDMA，并把多用户发送扩展到上行。本仿真器只为 Wi-Fi 6 和 7 模拟多用户发送。',
    '下行 MU-MIMO、它所依赖的探测流程（NDP 通告、NDP、压缩波束成形报告）以及 MU PPDU 的每用户字段，Wi-Fi 6 见 IEEE Std 802.11-2024 第 27 章，Wi-Fi 7 见第 36 章。',
    '本仿真器并不执行探测流程，也不为它计入任何开销：它假设波束对准已经完美，这是模型取值。真实的发射机还要把功率分配给组内各成员，对其他成员的置零也不可能完全精确，所以每个成员的信号质量以及相应的速率，实际上都会有所下降。',
    '“一组最多四个成员”与 1,000 字节的门限都是引擎自己的规定（mac.ts），并非标准正文；802.11ax/be 对成员数的限制远比这宽松。',
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
    '在“按空间划分”那个变体里，把鼠标悬停在宽蓝块上：只有两份，每一份都占用整条 160 MHz、各用自己的两条流。无论房间里有几部手机，这个块都不会超过两份。',
    '观察被排除在配对之外的那部手机。多数情况下紧接着就有一个属于它自己的发送；有时它出现在下一次配对中；偶尔两者都没有，它需要再等一轮。被排除的是哪一部并不固定。',
  ],
  tryThis: [
    '在编辑器中添加第四部、第五部手机，再重新载入。按频率划分那个变体会把它们纳入分组，一组最多四个成员；而按空间划分那个变体无论添加多少部，都不会超过两份——天线数是一个硬性限制，队列长短无法改变它。',
  ],
  quiz: [
    {
      q: '为什么一台四天线的路由器不能用 MU-MIMO 同时服务三部两流手机？',
      options: [
        '三路定向发送的信号会在空口中相互碰撞',
        '它们的流数加起来是六条，比路由器拥有的多出一半',
        'MU-MIMO 分组永远只能有两个成员',
      ],
      answer: 1,
      explain: '每部手机协商到两条流，两部手机就占满了全部四条。分组会一直裁减到能够容纳为止，这里恰好是两个成员——第三部手机则被单独服务。',
    },
    {
      q: '按空间划分的那次发送里，每个成员拿到多宽的信道？',
      options: [
        '一半——两个成员平分',
        '整条——成员之间分开的是空间，不是频率',
        '看它排了多少字节',
      ],
      answer: 1,
      explain: '这正是这个办法的全部含义：任何成员都不让出带宽，区分成员依靠的是路由器的波束指向。代价由天线承担，而不是由带宽承担。',
    },
  ],
}
