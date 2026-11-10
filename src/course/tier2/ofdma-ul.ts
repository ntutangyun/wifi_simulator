/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · the triggered uplink.
 *
 * Re-paced 2026-09-26. The proposal split this lesson in two because it carried
 * two `steps` blocks; the controller's ruling (§8) is that it stays whole —
 * "two `steps` blocks is a tell, not a proof", and the trigger frame and the
 * round it schedules are one idea seen twice. So the tell is answered rather
 * than obeyed: the five things the trigger settles are a `list`, because a list
 * of what one frame fixes is not a procedure, and the one procedure left is the
 * engine's own order for arranging a round. §9's fallback instructions are
 * carried out with it: the power-control aside is one sentence in `sources`, and
 * the 邀请不是命令 recap is a clause on the run's own numbers.
 *
 * Three corrections that were each wrong once, and must stay:
 *  - the per-device power instruction is written into the frame and NOT acted
 *    on; the uploaders answer at their usual power, and that qualification
 *    belongs in the same breath as the claim;
 *  - what a triggered station checks before answering is the NAV, not a clear
 *    channel (mac.ts, `case 'trigger'`);
 *  - a device given a slice keeps its own stream count (`nssForPeer`).
 *
 * The scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below, and every figure in the diagram, is pinned in
 * tests/course/ofdma-ul.test.ts.
 */
import { type Lesson, oneRoom, node, sc, firstTrigger, firstMba, J } from '../lessonKit'
import type { SequenceSpec } from '../diagram'
import { selBinWidthMhz, selBins, selMemberBins } from '../../engine/selectivity'

/** The round the figure draws, in µs from the trigger frame's own start. */
export const ROUND = { trigger: 36, gap: 16, answers: 1988.8, mba: 36 }
/** When the answers start, and when the acknowledgement does. */
export const ROUND_AT = {
  answers: ROUND.trigger + ROUND.gap,
  mba: ROUND.trigger + ROUND.gap + ROUND.answers + ROUND.gap,
}

/**
 * One triggered round as an exchange: the access point's two arrows at 0 and at
 * 2057 µs are ONE frame each, naming both uploaders; the two answers start and
 * end in the same instant, side by side in frequency. Read off the constants
 * above, which the test pins against the run.
 */
export function triggeredRound(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-1', label: '上传 A' },
      { id: 'ap', label: '接入点' },
      { id: 'sta-2', label: '上传 B' },
    ],
    messages: [
      { from: 'ap', to: 'sta-1', label: '触发帧', at: '0', tone: 'accent' },
      { from: 'ap', to: 'sta-2', label: '同一帧', tone: 'accent' },
      { from: 'sta-1', to: 'ap', label: '应答 A', at: `${ROUND_AT.answers} µs` },
      { from: 'sta-2', to: 'ap', label: '同时应答' },
      { from: 'ap', to: 'sta-1', label: '一帧确认', at: `${Math.round(ROUND_AT.mba)} µs` },
      { from: 'ap', to: 'sta-2', label: '同一帧' },
    ],
  }
}

export const ofdmaUl: Lesson = {
  id: 'ofdma-ul',
  module: 9,
  title: '触发帧——接入点调度上行',
  why: '同时发给多台设备，是一台电台自己就能决定的事：它知道自己要发送什么，想怎样划分信道就怎样划分。反过来，同时从多台设备接收——也就是上行（uplink, UL），即从设备指向它们共同连接的那台中心设备的方向——则是另一回事。这些设备必须在同一时刻开始发送，并占用信道中互不重叠的部分，但它们彼此都无法得知对方下一步的打算。这就需要有一方进行调度，而有资格调度的只有接入点（AP）；它用于调度的帧称为触发帧（Trigger frame）。触发帧一次规定五件事：由谁应答、各用信道的哪一部分、应答多长、用多大功率、何时开始。被指定的设备经过一小段间隔后同时应答，每个应答都被填充（padding）到同一长度，因此同时结束，接入点用一个块确认（block acknowledgement, BlockAck）就能确认整组。协商出「同时」几乎不可能，指定「同时」却很容易。功率那一项本仿真器只写入帧中，并不执行。应答的设备不再进行退避（backoff）计数，但仍会检查自己的网络分配向量（network allocation vector, NAV）：如果此刻存在一条不是这个接入点设置的预约，它就不发送。触发帧是邀请，而不是命令：两次触发交换之间没有任何调度，两台上传设备仍照常排队竞争，这段仿真里只有大约三分之一的上行字节通过触发交换传送，其余仍通过普通竞争传送，期间还发生了几次碰撞；偶尔触发帧没有得到任何应答，接入点等到超时后收回空口。一次触发交换至少需要两台有积压的设备才能组织起来，只剩一台时接入点根本不发送触发帧。',
  outcomes: [
    '说出几台设备为什么无法自行协商完成一次共享的上行发送',
    '在时间轴上读出一个触发帧，以及它所引出的那些应答',
    '说出一台设备被触发之后，哪些事不再由它决定，哪些事仍然由它决定',
  ],
  needs: ['ofdma-dl'],
  terms: [
    { term: 'uplink', plain: '从设备到接入点的方向；反方向就是下行' },
    { term: 'trigger frame', plain: '接入点发出的一个短帧，用来规定：接下来由哪些设备应答、各用哪一部分信道、应答多长、用多大发射功率' },
    { term: 'TB', plain: '基于触发：TB PPDU 是一种应答帧，设备只有在触发帧指定它应答时才可以发送' },
  ],
  picture: [
    { heading: '较难实现的方向', text: '划分信道在下行（downlink, DL）方向可行，因为每一部分都由同一台电台填充。在上行方向，各部分就要由房间不同位置的不同设备来填充。它们不共用一个时钟，彼此也难以可靠地收到对方的信号，各自只知道自己的队列（queue）。仅靠它们自己，无法得到一个共同的起始时刻，于是上行只能逐台进行——除非有一方把每台设备该做的事完整地告诉它。' },
    { kind: 'watch', jump: 0, heading: '在时间轴上观察', text: '载入仿真，跳到第一个触发帧：接入点发出的一个很短的黄块。经过一小段间隔，两台上传设备的绿块在同一时刻开始——又在同一时刻结束，值得注意的正是后一点。' },
    {
      kind: 'diagram', heading: '一次触发交换的结构', spec: triggeredRound(),
      caption: '接入点的两次发送各是一帧，每一帧同时指定两台设备。两个应答位于信道互不重叠的两部分，所以它们同时开始，又因被填充（padding）到同一长度而同时结束——正因为同时结束，一个块确认（block acknowledgement, BlockAck）就能确认整组。',
    },
    { kind: 'list', heading: '触发帧规定了哪五件事', items: [
      '由谁应答：它指定的那些设备，其余设备不得发送。',
      '在哪里应答：每台各用信道的哪一部分，使几个应答在频率上并列，而不是相互叠加。',
      '应答多长：每个应答都填充到同样的长度。',
      '用多大功率应答：每台设备都被告知如何修正自己的功率，使近处和远处的设备到达接入点时强弱相近——不过这条指令本仿真器只写入帧中，并不执行，两台上传设备仍按各自原有的功率应答。',
      '何时应答：触发帧结束后间隔一小段时间，并且在时间和频率上都与接入点对齐。',
    ] },
    { heading: '一个完全不由设备自主决定的应答', text: '返回的这一帧称为基于触发的 PPDU（trigger-based PPDU, TB PPDU）：它是唯一一种“只有被要求时才可以发送”的发送。用哪一部分信道、用哪一级调制（modulation）、发送多长、何时开始，全部由接入点决定；设备只负责填入字节。关键就在这里：要协商出“同时”几乎不可能，要指定“同时”却很容易。' },
    { heading: '设备仍保留的决定权', text: '在一次触发交换中，没有设备再进行退避（backoff）计数：这一次的发送机会已经分配好了。但设备在应答前仍要进行一项检查——它查看自己的网络分配向量（network allocation vector, NAV），如果此刻存在一条不是这个接入点设置的预约，它就不发送。而在两次触发交换之间，根本没有任何调度：还是那两台上传设备，像以前一样排队、竞争，因为接入点只在它要组织上行传输时才发送触发帧。' },
  ],
  numbers: [
    { kind: 'table', heading: '两台上传设备 100 ms 内的上行', head: [
      '项目', '次数', '上行字节',
    ], rows: [
      ['接入点发出的触发帧', '16', '—'],
      ['其中无人应答的', '2', '0'],
      ['返回的 TB PPDU', '28', '473,032'],
      ['普通竞争发送', '54', '996,756'],
    ] },
    { heading: '这是邀请，不是命令', text: '这两台设备上传的数据中，大约三分之一通过触发交换传送；其余的仍通过普通竞争传送，期间还发生了六次碰撞。另有两次，触发帧没有得到任何应答——接入点只能等到超时，再收回空口。' },
    { kind: 'steps', heading: '一次触发交换如何安排：逐步说明', items: [
      '设备有数据要上传时，会把积压情况报告给接入点；接入点记下“需要发送触发帧”，然后开始为自己竞争一次发送机会。',
      '当它赢下这一轮竞争、而自己又没有下行数据要发送时，就列出积压非空、并且与它协商过正交频分多址（orthogonal frequency-division multiple access, OFDMA）的设备。名单上不到两台时，这次就不组织触发交换。',
      '名单上只保留前四台，把子载波（sub-carrier）划分为同样数量的等分资源单元（resource unit, RU），再为整次交换规定一套格式：每台可以使用哪一级，以及每个应答占多宽——取受邀各台协商过的带宽中最小的那个。分到一个资源单元并不等于降为单流：每台仍按自己协商的空间流（spatial stream）数应答。',
      '接着为每台设备把积压换算为空口时间（airtime），上限是一个 2 ms 的应答能容纳的量，再取其中最长的那个。然后所有设备都被指定为这同一个长度，于是几个应答同时结束，一个确认就能确认整次交换。',
      '触发帧以较低的 24 Mb/s 发送，使房间里每台设备都能解调：28 字节是面向所有设备的公共信息，每指定一台设备再加 6 字节。它的 Duration 字段覆盖那段间隔、那些应答、第二段间隔和最后的确认。',
      '间隔 16 µs 后，被指定的每台设备各在分配给自己的资源单元上应答——除非此刻还有一条不是这个接入点设置的 NAV 有效。它用字节填满这个长度所能容纳的部分，其余用填充补齐。',
      '几个应答同时结束后再间隔 16 µs，接入点发送一个多站点块确认（multi-STA BlockAck）结束这次交换：32 字节，此后每多一台设备再加 8 字节。如果触发帧结束后 45 µs 仍没有任何应答开始，这次交换就没有任何结果，空口随即被收回。',
    ] },
    { kind: 'table', heading: '第一次触发交换，按步骤计算一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['有积压的设备', '2'],
      ['每台分到的子载波占比', '0.5'],
      ['一个 2 ms 的应答最多能容纳', '17,425 B'],
      ['这些字节需要多少个符号（symbol）', '143'],
      ['因此每个应答都被指定为', '44 + 13.6 × 143 = 1988.8 µs'],
      ['每个应答实际承载', '十一帧，16,894 B；余下 531 B 是填充'],
      ['触发帧', '28 + 6 × 2 = 40 B，以 24 Mb/s 发出，36 µs'],
      ['多站点块确认', '32 + 8 = 40 B, 36 µs'],
      ['整次交换', '36 + 16 + 1988.8 + 16 + 36 = 2092.8 µs，共上行 33,788 B'],
    ] },
  ],
  deeper: [
    { heading: '只有一台设备不构成一组', text: '关闭两台上传设备中一台的共享上行能力，这个房间就不再发出任何触发帧——即使为剩下的那一台也不会发送。引擎的规则很简单：一次触发交换至少要有两个成员才会被组织起来；原因在于开销——触发帧、那段间隔和那个确认的开销，都需要由多个成员分摊。' },
  ],
  limits: [
    { kind: 'model-value', text: '本课这些基于触发的上行 PPDU 使用 0.8 µs 的保护间隔——这是引擎的默认档，场景不设置 guardInterval 时即为此值。而 (2× LTF, 0.8 µs) 这个组合对 TB PPDU 并不是强制的：HE TB 的强制集是 (2×, 1.6) 与 (4×, 3.2)，EHT TB 是 (1×, 1.6)、(2×, 1.6) 与 (4×, 3.2)（§27.1.1 / §36.1.1 那两份强制支持清单）。这并不违规——(4×, 0.8) 在 EHT 侧挂在能力位 dot11EHT4xEHTLTFand0point8usecGIImplemented 上、缺省关闭，HE 侧挂在扩展范围单用户格式的支持上——但这是一个应当写明的事实：引擎发送的是一个合法但非强制的组合。这也是场景那一节只开放双倍与四倍两档的第二个理由：1.6 与 3.2 恰好是 TB PPDU 那一行的强制集。' },
    { kind: 'unmodelled', text: '接入点如何得知哪些设备有积压：它直接读取各站点的发送队列，把每台的队列深度相加（simulation.ts 的 ulBacklog）。真实的接入点只能通过站点在上行帧中携带的缓存状态报告得知，那份报告有时延，而且按区间量化，而对于一台刚有数据要发送、却还没能发出任何一帧的站点，接入点根本不知道它在等待。本课「有积压的设备 2」这一行，是一次现实中不可能做到的全知观测。' },
    { kind: 'unmodelled', text: '触发帧中那条逐台的功率修正只计入了字节数，并没有被执行，而省略它的后果比这一点本身更值得说明：引擎没有接收机增益模型，几个同时到达的资源单元强弱相差多少都不影响其中任何一个能否被解出。真实接收机只有一套自动增益控制，某一部分过强就会使所有部分的噪声地板一起抬高——这正是那个字段存在的全部理由。所以本课的这次交换是最理想的情况，而在真实网络里，功率对齐需要持续维持。' },
    { kind: 'unmodelled', text: '几个应答的对齐在这里是理想的：同一时刻开始、同一时刻结束，而且同组互不干扰（channel.ts 的 orthogonalGroup）。真实的基于触发的发送要求各站点把自己的定时对齐到不到一微秒的窗口内，并按触发帧预先校正载波频偏，做不到的那一台会干扰相邻资源单元的子载波。本仿真器里「同时」是一经指定就必然成立的事实，而不是一项需要持续维持的工程指标。' },
    { kind: 'model-value', text: '一个应答的长度被引擎限制在 2 ms（mac.ts 的 transmitTrigger 里那个 2_000_000），而「触发帧结束后 45 µs 仍没有任何应答开始即作废」使用的是引擎自己的确认超时。标准的 PPDU 上限是 5.484 ms，引擎在下行路径上使用的就是这个数（phy.ts 的 MAX_PPDU_NS），所以上行交换被人为缩短了一半以上。本课「一个 2 ms 的应答最多能容纳 17 425 B」测量的正是这个模型取值。' },
    { kind: 'model-value', text: `场景启用衰落并添加 selectivity 一节之后，频率选择性按 ${selBinWidthMhz()} MHz 一格取衰落值，而这几个同时到达的应答各自读取的是自己那一部分的格数：份额与下标写在被触发的那一帧本身，channel.ts 的 selCombine 按这一份计算格数——整条信道的格数乘以这一份、截断为整数格，起始格由排在前面的各部分的格数之和给出。按这个算法，20 MHz 上两台同时上传，每台读取 ${selBins(20)} 格中的 ${selMemberBins(20, 1 / 2)} 格；标准最小的那种 26 音调资源单元恰好就是一格。仍然超出范围的是不等分：一次交换中每台分到的份额都是一除以台数（mac.ts 的 transmitTrigger 整次交换只计算一个份额），而真实接入点可以按各台的积压分配大小不同的资源单元，于是被截掉的那一格在这里不属于任何一台。这与上面那条功率修正未被执行是两回事：那一条涉及的是各部分的强弱，这一条涉及的是各部分的宽度。` },
  ],
  sources: [
    '触发帧及其公共信息字段与每用户字段（RU 分配、目标 RSSI、上行长度、MCS）见 IEEE Std 802.11-2024 §9.3.1.22；它所征询的 HE TB PPDU 见第 27 章；“只能用于应答触发帧”这条规则见 §26.5.2。',
    '逐台的功率修正（Target RSSI）在标准里是为了让同时上来的几片强弱相近：一个接收机只有一套增益，某一部分过强会使所有部分的噪声地板一起抬高。本仿真器为这个字段计入了字节数，却不执行它——它只指定资源单元、长度、级别和带宽，两台上传设备按各自原有的功率应答，所以你看到的这次交换是最理想的情况。',
    '用一帧确认整组的多站点 BlockAck 见 §9.3.1.9.7。仿真器给它计 40 字节、36 µs，这是一个代表值，并非按用户逐项相加的结果。',
    '被触发的站点在应答前仍可能被要求先侦听介质，这由触发帧的 CS Required 字段规定（§9.3.1.22.1）；本仿真器把这一条实现为一次 NAV 检查——由这个接入点自己设置的预约不计入——并且在触发交换内部从不进行退避计数。',
    '触发帧本身用 24 Mb/s 发送，是仿真器选定的一个房间里人人都能解调的传统速率，并非标准规定的取值。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
    node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
  ]),
  jumps: [
    J('第一个触发帧', firstTrigger),
    J('第一个多站点 BlockAck', firstMba),
  ],
  observe: [
    '跳到第一个触发帧：接入点发出的 36 µs 黄块。经过一小段间隔，两个绿块在同一时刻开始，而且都长 1988.8 µs——正是触发帧指定的长度。',
    '把鼠标分别悬停在两个绿块上：长度相同，字节数也都是 16,894，但这两台上传设备与接入点的距离不同，队列也不同。这两个数都不是设备自己决定的。',
  ],
  tryThis: [
    '在帧解码器中打开这个触发帧，查看它的 Duration 字段：它覆盖了后面的应答和确认，因此不在这一组中的设备在整次交换期间都不会发送。',
    '点击“在编辑器中打开”，关闭上传设备 A 的 OFDMA 后重新载入。不会发出任何触发帧——即使为上传设备 B 也不会发送。只有成员多于一台时，这次调度才值得进行。',
  ],
  quiz: [
    {
      q: '两台设备为什么无法自行协商完成一次共享的上行发送？',
      options: [
        '它们的电台无法只在信道的一部分上发射',
        '没有任何机制能为它们提供共同的起始时刻、共同的长度和互不重叠的资源单元——而且它们也无法得知对方的打算',
        '法规禁止两台设备同时发射',
      ],
      answer: 1,
      explain: '在彼此收不到的对等设备之间，无法协商出“同时”。但它可以由所有设备都能收到的那台设备来指定，触发帧的作用正是如此。',
    },
    {
      q: '有一台上传设备排队的数据比另一台少得多。它的 TB PPDU 会是什么样的？',
      options: [
        '更短，因此整次交换结束得更早',
        '长度相同，其余部分用填充补齐——几个应答必须同时结束',
        '它根本不被允许应答',
      ],
      answer: 1,
      explain: '触发帧为所有成员指定同一个长度。同时结束，才使一个确认能确认整组，而填充所保证的正是这一点。',
    },
  ],
}
