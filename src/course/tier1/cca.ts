/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · clear channel assessment: the two thresholds.
 *
 * The one lesson of the 2026-09-25 re-pacing with no parent
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M4 and
 * §7.1). The course states the −82 dBm preamble-detection floor and the −62 dBm
 * energy-detection floor in three places — `decode-thresholds`, `hidden` and
 * `tier1-project-review` — and shows them in none, because none of those scenes
 * produces a busy CCA to look at.
 *
 * So this lesson loads **`backoff`'s scene** (`sameSceneAs: 'backoff'`), where a
 * station visibly stops counting on a neighbour's frame, and takes jump
 * predicates of its own over that same run rather than a new variant: a new
 * variant would be a new recorded hash, and a new jump costs nothing (§6, "no
 * new variant anywhere"). Its fixture lines are copies of `backoff`'s.
 *
 * The procedure is `updateAllCca` in src/engine/channel.ts, in the engine's own
 * order, with `CCA_PD_DBM` and `CCA_ED_DBM` from src/engine/phy.ts. The answer
 * to the question the reader will have — which threshold applies when the radio
 * missed the preamble — is the higher one: `anyPd` requires
 * `r.observed.has(a.txId)`, so a signal whose preamble arrived while this radio
 * was transmitting can only ever hold the channel busy through raw energy.
 *
 * Every number quoted below is pinned in tests/course/cca.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, J } from '../lessonKit'

/**
 * How loud the neighbour is at STA-1 in this scene, in dBm: `buildLinkTable`
 * over the lesson's own nodes, on the 5 GHz link they default to (whose extra
 * loss is zero, so the table value is the level on the link). Typed here as the
 * figure the prose quotes and re-derived in the test.
 */
export const CCA_NEIGHBOUR_DBM = -46.01

/**
 * The neighbour's frame and its answer, with both thresholds' verdicts drawn
 * beside them. Every instant is a record of `backoff`'s base run: TX_START and
 * TX_END at 498 and 746, the access point's acknowledgement at 762 and 790, and
 * a CCA_BUSY / CCA_IDLE pair at each of those four instants.
 *
 * The two threshold lanes are the same length here, and that is the honest
 * picture rather than a redundant one: at −46.01 dBm the neighbour clears both
 * lines, by 36 dB and by 16 dB. What separates them is not this frame's level
 * but whether the radio caught its preamble — which is what the table and the
 * procedure under the figure are about. The 16 µs hole between 746 and 762 is
 * both lanes going idle at once: there is genuinely nothing on the air.
 */
export function ccaTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [
        { fromUs: 498, toUs: 746, label: '邻居的数据帧' },
        { fromUs: 762, toUs: 790, label: 'ACK' },
      ] },
      { label: '前导检测', spans: [
        { fromUs: 498, toUs: 746, label: '忙 · 高出 36 dB', tone: 'accent' },
        { fromUs: 762, toUs: 790, tone: 'accent' },
      ] },
      { label: '能量检测', spans: [
        { fromUs: 498, toUs: 746, label: '忙 · 高出 16 dB' },
        { fromUs: 762, toUs: 790 },
      ] },
    ],
    axis: { fromUs: 470, toUs: 830, ticks: [500, 600, 700, 800], unit: 'µs' },
  }
}

export const cca: Lesson = {
  id: 'cca',
  module: 3,
  title: '空闲信道评估：两条门限，相差二十分贝',
  why: '上一课里，站点（station, STA）开始发送之前要先判断“介质（medium）是否忙”。射频本身无法感知“忙”，它只能把接收到的功率与门限比较——而门限有两条：一条 −82 dBm，一条 −62 dBm，中间差二十分贝，也就是一百倍的功率。采用哪一条，取决于一个与信号强弱无关的条件：本机是否检测到了这一帧的开头。检测到前导码（preamble），就按较低的那条判忙，这叫前导检测（preamble detection），凡是本机可能解调的信号都会先使本机判忙；错过了开头——本机自己正在发送，或者那是其他技术的信号、本机无法识别它的前导码——就只能把空中的总功率与较高的那条比较，这叫能量检测（energy detection, ED）。因此电平落在两条门限之间的信号，检测到开头就判忙并等待，错过开头就被视为不存在，本机照常发送、与它重叠。判忙也不等于能够解调：两帧同时开始时，接收端一帧也没有解出，侦听仍然报忙。这个小房间里邻居的信号远高于两条门限，凡是其他站点引起的判忙，都由前导检测判出；记为能量的那些，全部发生在本机自己正在发送时——那一分支实际上并未与门限比较，只是本机没有在接收。',
  outcomes: [
    '说出空闲信道评估（clear channel assessment, CCA）的两条门限各是多少、各自何时生效',
    '解释为什么“错过了前导码（preamble）”会使判忙的门限提高二十分贝',
    '在时间轴上找到一次判忙，并说出它是哪一种',
  ],
  terms: [
    { term: 'CCA', plain: '空闲信道评估：射频对“信道此刻是否忙”作出的二元判断' },
    { term: 'preamble detection', plain: '前导检测：检测到了某一帧的开头，因而按较低的门限判忙' },
    { term: 'energy detection', plain: '能量检测：未检测到开头，只按空中的总功率判断，门限高得多' },
  ],
  needs: ['ifs'],
  picture: [
    { heading: '“忙”是门限比较的结果', text: '载波侦听（carrier sense）这个名字容易被理解为“探听是否有人在发送”，但射频无法做这样笼统的判断。它只能做两件事：累加空中的功率，以及在某一路信号的开头识别那段固定序列——前导码。空闲信道评估为这两件事各设一条门限。' },
    { heading: '第一条门限：检测到了前导码', text: '本机处于接收状态时，某一路信号的前导码到达，且到达本机的电平不低于 −82 dBm，就判为忙。这条门限很低，接近“最低一级速率仍能解调”的电平——换句话说，凡是本机可能解调的信号，本机一定先判它为忙。这就是前导检测（preamble detection）。' },
    { kind: 'watch', jump: 0, heading: '观察一次前导检测判忙', text: '载入仿真，跳到第一次前导检测判忙：邻居的数据帧（data frame）在 498 µs 开始发送，STA-1 的侦听在同一时刻变为“忙”，记录的原因是前导码，它正在进行的退避（backoff）计数随即暂停——计数本身是下一课的主题，这里只需看到它被暂停。随后，接入点（access point, AP）给邻居回复的确认帧（acknowledgement, ACK）又使它判忙一次。' },
    { heading: '第二条门限：只能依据能量', text: '但前导码只出现一次：它位于帧的最开头，错过之后无法再检测。本机自己正在发送时，其他站点那一帧的开头一律收不到；来自另一种技术的信号，本机无法识别它的前导码。这些情形下只能累加空中的总功率，与 −62 dBm 比较。这就是能量检测（energy detection, ED），门限比前一条高出二十分贝。因此，电平落在两条门限之间的信号，判决结果完全取决于是否检测到了开头：检测到就判忙并等待；错过就视为不存在、照常发送，从而与其他站点正在进行的发送重叠。' },
    { kind: 'watch', jump: 1, heading: '再观察一次能量判忙', text: '跳到 0 µs：两台站点同时开始发送，各自的侦听也在这一时刻报忙，但记录的原因是能量——那是它们自己发出的信号。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '邻居的一帧与两条门限各自的判决',
      spec: ccaTiming(),
      caption: '邻居到达 STA-1 的电平是 −46.01 dBm：比 −82 dBm 高 36 dB，比 −62 dBm 高 16 dB，所以两条门限判出的忙时段一样长。746 到 762 µs 这 16 µs 内空口确实空闲，两条门限也同时回到空闲。',
    },
    { kind: 'table', heading: '两条门限', head: [
      '判决方式', '门限', '适用条件', '出处',
    ], rows: [
      ['前导检测', '−82 dBm', '这一路信号的开头在本机处于接收状态时到达', '§17.3.10.6'],
      ['能量检测', '−62 dBm', '其余所有情形：错过开头的信号、其他技术的信号、累积的噪声', '§17.3.10.6'],
      ['两者之差', '20 dB', '一百倍的功率', '—'],
    ] },
    { kind: 'steps', heading: '射频每次重新判定“是否忙”的步骤', items: [
      '本机自己正在发送时，结果直接为“忙”，不与任何门限比较：无线电无法同时发送和接收。',
      '否则，把空中每一路正在进行的发射到达本机的功率相加。其他技术在本机整个工作信道内的功率也计入这个总和。',
      '再逐路检查：它到达本机的电平是否不低于 −82 dBm，且它的前导码是否在本机处于接收状态时到达？只要有一路同时满足这两条，就由前导检测判忙。',
      '如果没有任何一路满足，就只看总功率：不低于 −62 dBm 才判为忙。其他技术的信号只能按这一条判定——Wi-Fi 无法识别它的开头。',
      '本机仍有任何一路接收正在进行时，同样判为忙。',
      '“忙”与“空闲”的状态一旦变化，射频就向媒体访问控制（medium access control, MAC）报告一次，并记录原因是前导码还是能量。上一课所说的“介质是否忙”，最终就是由这个判定给出的。',
    ] },
    { heading: '本轮仿真里，每一次判忙是哪一种', text: '300 ms 内 STA-1 变为“忙”共 1587 次：1164 次前导检测，423 次能量检测——而这 423 次没有一次由邻居引起，每一次都发生在它自己正在发送时。在这个房间里，凡是其他站点引起的判忙，都是检测到开头后判出的。' },
    { heading: '为什么这里看不出两条门限的差别', text: '并非这二十分贝不重要，而是这个房间太小：邻居到达 −46.01 dBm，任何一条门限都会判忙。当两台站点之间隔着两堵砖墙、到达电平降到 −82 dBm 以下时，两条门限都不会判忙——这正是“隐藏节点（hidden station）”一课的起点。' },
  ],
  deeper: [
    { heading: '前导检测不等于能够解调', text: '本轮开头两帧同时开始，接入点一帧也没有锁定——记录里是两条 RX_MISS——但它的侦听在 0 µs 就已报忙，记录的原因正是前导码。判忙只检查“是否有一路电平足够高，且它的开头在本机处于接收状态时到达”；之后能否解出内容，是另一回事。这也是碰撞期间信道不会被判为空闲的原因。' },
    { heading: '“能量”这个原因有时只是默认值', text: '本机自己发送时的那 423 次，记录的原因是能量。查看引擎代码可知：半双工那一分支根本没有进行门限判断，而是直接置忙，并沿用了原因字段的默认值。所以不要把它理解为“本机通过能量检测收到了自己的信号”——它只是没有在接收。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '判忙没有检测时延：一路发射开始的同一纳秒，所有能收到它的电台同时变为忙（updateAllCca 在发射开始的同一时刻重新计算）。标准规定的是「最多 4 µs 内报告」，所以真实设备的「忙」总会稍有延迟，谁能在别人开始发送之前先把帧发出去带有一定的偶然性；在这里它是一个纳秒级的确定事件。' },
    { kind: 'out-of-scope', text: '能量检测把同一条链路上每一路发射到达本机的功率全部相加，不考虑它占用的带宽（updateAllCca）。因此没有部分频谱重叠，没有相邻信道干扰，宽信道要求的「每 20 MHz 各判一次」也不存在。真实设备在 80 MHz 上会因为某个副信道忙而回退到 20 MHz 发送，本课的两条门限不涉及这一层。' },
    { kind: 'unmodelled', text: '这个房间里除了这一个网络，只有 UWB 会被计入那个总功率：跨技术的耦合只为共享频段的另一种技术建立了一条通路（channel.ts 的 spectrum 分支）。微波炉、蓝牙、邻居的 Wi-Fi 都不存在，而 −62 dBm 这条门限在真实环境中存在的全部理由，恰恰就是这些干扰源。' },
    { kind: 'model-value', text: '「本机正在发送 → 直接判忙」这一分支根本没有进行门限判断，原因字段沿用了它的默认值「能量」，所以那 423 次不是测量结果。真实射频在自己发送时接收链路处于关闭或完全饱和的状态，无法给出任何门限判决——这里的 423 条记录应理解为「它没有在接收」，而不是「它通过能量检测收到了自己的信号」。' },
    { kind: 'unmodelled', text: '电平不随时间变化：邻居到达 −46.01 dBm 是由几何位置与墙体计算出的定值，默认没有衰落。编辑器的「时变链路（衰落）」一节可以开启衰落，此时同一条链路的电平会在两条门限附近波动，判忙与否不再每次相同；本课的场景没有开启。' },
  ],
  sources: [
    'IEEE Std 802.11-2024 的 §17.3.10.6 给出 20 MHz OFDM PHY 的两条空闲信道评估门限：能检测到的有效信号按 −82 dBm，其余任何能量按 −62 dBm。',
    '本仿真器把这两个数写在 src/engine/phy.ts 的 CCA_PD_DBM 与 CCA_ED_DBM 里，判定过程在 src/engine/channel.ts 的 updateAllCca；“前导码必须在本机处于接收状态时到达”这一条，是引擎里的 observed 集合，也是标准中“能检测到的”这一表述在模型里的实现。',
    '−46.01 dBm 这个电平，以及 1164/423 这两个计数，都是本仿真器的场景，可以通过随机种子复现；两台饱和站点与 1528 字节的帧同样如此，并非取自标准正文。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'STA-1', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'STA-2', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一次前导检测判忙', (r) => r.type === 'CCA_BUSY' && r.cause === 'preamble' && r.node !== 'ap'),
    J('第一次能量判忙（本机正在发送）', (r) => r.type === 'CCA_BUSY' && r.cause === 'energy'),
    J('碰撞期间接入点的判忙', (r) => r.type === 'CCA_BUSY' && r.cause === 'preamble' && r.node === 'ap'),
  ],
  observe: [
    '跳到第一次前导检测判忙：STA-1 在 498 µs 报忙，原因是前导码，计数随即暂停，一直暂停到 824 µs。',
    '在 746 µs 处暂停：邻居的帧刚结束，两条门限都回到空闲，而这 16 µs 里没有任何站点在发送——信道空闲不等于轮到本机发送。',
  ],
  tryThis: [
    '在事件日志里过滤 CCA，统计两种原因各有多少条，再任选一条原因为能量的记录，查看那一时刻本机是否正在发送。',
  ],
  quiz: [
    {
      q: '一帧到达你这里是 −70 dBm，但它的开头是在你自己正发送的时候到的。你的侦听报忙吗？',
      options: [
        '报忙：−70 dBm 高于 −82 dBm 的前导检测门限',
        '不报：开头已经错过，只能按能量判断，而 −70 dBm 低于 −62 dBm',
        '报忙：任何能收到的信号都算忙',
      ],
      answer: 1,
      explain: '−82 dBm 只适用于本机确实检测到了开头的那一帧。若它开始时你正在侦听，−70 dBm 就足以使你判忙。',
    },
    {
      q: '一台超宽带（ultra-wideband, UWB）设备的信号落进了 Wi-Fi 的工作信道。Wi-Fi 的侦听会按哪条门限判断它？',
      options: [
        '−82 dBm 的那条：它毕竟也是一路真实的信号',
        '−62 dBm 的那条：Wi-Fi 无法识别它的开头，所以它只能按能量判断',
        '两条都不用：不是 Wi-Fi 的信号一律忽略',
      ],
      answer: 1,
      explain: '前导检测识别的是 Wi-Fi 自己的前导码序列。其他技术的信号不会进入这一分支，只能计入总功率。',
    },
  ],
}
