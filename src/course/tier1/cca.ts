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
  title: '空闲信道评估：两条线，差二十分贝',
  why: '上一课里，站点（station, STA）开口之前问的第一句话是“介质（medium）忙不忙”。可这句话是怎么答出来的？射频对“忙”没有感觉，它只会拿收到的功率去比一个门限——而门限有两条：一条 −82 dBm，一条 −62 dBm，中间差二十分贝，也就是一百倍的功率。用哪一条，取决于一件和响度无关的事：这一帧的开头，本机有没有抓到。',
  outcomes: [
    '说出空闲信道评估（clear channel assessment, CCA）的两条门限各是多少、各自何时生效',
    '解释为什么“错过了前导码（preamble）”会把判忙的门槛抬高二十分贝',
    '在时间轴上找到一次判忙，并说出它是哪一种',
  ],
  terms: [
    { term: 'CCA', plain: '空闲信道评估：射频对“信道此刻忙不忙”给出的那个是非判断' },
    { term: 'preamble detection', plain: '前导检测：抓住了某一帧的开头，于是按较低的那条线判忙' },
    { term: 'energy detection', plain: '能量检测：没抓住开头，就只数空中的总功率，门槛高得多' },
  ],
  needs: ['ifs'],
  picture: [
    { heading: '“忙”不是一种感觉', text: '载波侦听（carrier sense）听上去像“听听有没有人在说话”，但射频做不了这么含糊的事。它只会做两件事：把空中的功率加起来，以及试着在某一路信号的开头认出那段固定的图案——前导码。空闲信道评估就是给这两件事各配一条门限。' },
    { heading: '第一条线：我抓住了它的开头', text: '本机正听着的时候，有一路信号的前导码到了，而且它到达本机不低于 −82 dBm，那就是忙。这条线很低，低到接近“最慢那一级还解得出来”的电平——换句话说，凡是你可能读懂的东西，你一定先判它为忙。这就是前导检测（preamble detection）。' },
    { kind: 'watch', jump: 0, heading: '去看一次前导检测判忙', text: '载入仿真，跳到第一次前导检测判忙：邻居的数据帧（data frame）在 498 µs 开口，STA-1 的侦听同刻翻成“忙”，理由写的是前导码，它手里正走着的退避（backoff）计数就地停住——那个计数本身是下一课的主题，这里只要看见它被按停。再往后，接入点（access point, AP）回它的确认帧（acknowledgement, ACK）又会让它判一次忙。' },
    { heading: '第二条线：我只剩下能量', text: '可前导码只有一次机会：它在帧的最开头，错过就没有了。本机自己正在发送时，别人开的头它一律收不到；来自另一种技术的信号，它根本认不出那段图案。这些情形下只剩一个办法——把空中的总功率加起来，跟 −62 dBm 比。这就是能量检测（energy detection, ED），比前一条线高出整整二十分贝。落在两条线中间的信号，因此命运全由“有没有抓到开头”决定：抓到了就老实等着，错过了就当它不存在，照常开口，于是踩上一次别人的发送。' },
    { kind: 'watch', jump: 1, heading: '再看一次能量判忙', text: '跳到 0 µs：两台站点同时开口，它们各自的侦听也在那一刻报忙，可理由写的是能量——那是它们自己发出去的东西。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '邻居的一帧，和两条线各自的判决',
      spec: ccaTiming(),
      caption: '邻居到达 STA-1 是 −46.01 dBm：比 −82 dBm 高 36 dB，比 −62 dBm 高 16 dB，所以两条线判出来一样长。746 到 762 µs 那 16 µs 里空口真的空着，两条线也一起回到空闲。',
    },
    { kind: 'table', heading: '两条线', head: [
      '判法', '门限', '什么时候用得上', '出处',
    ], rows: [
      ['前导检测', '−82 dBm', '这一路的开头是在本机正听着的时候到的', '§17.3.10.6'],
      ['能量检测', '−62 dBm', '其余一切：错过的开头、别的技术、堆起来的噪声', '§17.3.10.6'],
      ['两者之差', '20 dB', '一百倍的功率', '—'],
    ] },
    { kind: 'steps', heading: '射频每次重算“忙不忙”，做的就是这几步', items: [
      '本机自己正在发送时，答案直接就是“忙”，不比任何门限：无线电边说边听是做不到的。',
      '否则，把空中每一路正在进行的发射到达本机的功率加起来。别的技术在本机整个工作信道内的功率也加进这个总数。',
      '再对其中每一路单独问一句：它到本机是否不低于 −82 dBm，而且它的前导码是在本机正听着的时候到的？只要有一路同时满足这两条，就是前导检测判忙。',
      '一路也没有，就只看总功率：不低于 −62 dBm 才算忙。别的技术的信号永远只能走这一条——它的开头 Wi-Fi 读不出来。',
      '本机手里还握着任何一路正在进行的接收时，同样算忙。',
      '“忙”与“空闲”一旦翻转，射频就向媒体访问控制（medium access control, MAC）报一次，并记下理由是前导码还是能量。上一课那句“介质忙不忙”，问到底问的就是它。',
    ] },
    { heading: '本轮仿真里，每一次判忙是哪一种', text: '300 ms 里 STA-1 翻成“忙”共 1587 次：1164 次前导检测，423 次能量检测——而那 423 次没有一次是邻居造成的，每一次都是它自己正在发送。在这个房间里，凡是别人造成的忙，都是抓到开头判出来的。' },
    { heading: '为什么这里看不出两条线的差别', text: '不是那二十分贝不重要，是这个房间太小：邻居到达 −46.01 dBm，随便哪条线都判得出忙。等到两台站点隔着两堵砖墙、到达电平掉到 −82 dBm 以下，两条线就都判不出忙来——那正是“隐藏节点（hidden station）”一课的起点。' },
  ],
  deeper: [
    { heading: '前导检测不等于解得出来', text: '本轮开头两帧同时开始，接入点一帧也没锁定——记录里是两条 RX_MISS——可它的侦听在 0 µs 就报了忙，理由写的正是前导码。判忙问的只是“有没有一路够响、而且它的开头是在我听着的时候到的”，至于后面能不能把内容解出来，是另一件事。这也是为什么碰撞期间信道并不会被当成空闲。' },
    { heading: '“能量”这个理由，有时只是个默认值', text: '本机自己发送时的那 423 次，理由写的是能量。看引擎就知道：半双工那一支根本没有走门限判断，它直接置忙，并沿用了理由字段的默认值。所以别把它读成“它靠能量听见了自己”——它只是没有在听。' },
  ],
  sources: [
    'IEEE Std 802.11-2024 的 §17.3.10.6 给出 20 MHz OFDM PHY 的两条空闲信道评估门限：能检测到的有效信号按 −82 dBm，其余任何能量按 −62 dBm。',
    '本仿真器把这两个数写在 src/engine/phy.ts 的 CCA_PD_DBM 与 CCA_ED_DBM 里，判定过程在 src/engine/channel.ts 的 updateAllCca；“前导码必须在本机正听着的时候到达”这一条，是引擎里的 observed 集合，也是标准那句“能检测到的”在模型里的落法。',
    '−46.01 dBm 这个电平，以及 1164/423 这两个计数，都是本仿真器的场景，靠随机种子可以复现；两台饱和站点与 1528 字节的帧同样如此，并非取自标准正文。',
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
    '跳到第一次前导检测判忙：STA-1 在 498 µs 报忙，理由是前导码，计数就地停住，一直停到 824 µs。',
    '在 746 µs 处暂停：邻居的帧刚结束，两条线都回到空闲，可这 16 µs 里没有任何人开口——空闲不等于轮到你。',
  ],
  tryThis: [
    '在事件日志里过滤 CCA，数一数两种理由各有多少条，再随手挑一条能量的，看那一刻本机是不是正在发送。',
  ],
  quiz: [
    {
      q: '一帧到达你这里是 −70 dBm，但它的开头是在你自己正发送的时候到的。你的侦听报忙吗？',
      options: [
        '报忙：−70 dBm 高于 −82 dBm 的前导检测门限',
        '不报：开头已经错过，只能按能量算，而 −70 dBm 低于 −62 dBm',
        '报忙：任何能收到的信号都算忙',
      ],
      answer: 1,
      explain: '−82 dBm 只适用于本机确实抓到了开头的那一帧。若它开始时你正在侦听，−70 dBm 就足以把你按住。',
    },
    {
      q: '一台超宽带（ultra-wideband, UWB）设备的信号落进了 Wi-Fi 的工作信道。Wi-Fi 的侦听会拿哪条线判它？',
      options: [
        '−82 dBm 的那条：它到底也是一路真实的信号',
        '−62 dBm 的那条：Wi-Fi 读不出它的开头，所以它只能算能量',
        '两条都不用：不是 Wi-Fi 的信号一律忽略',
      ],
      answer: 1,
      explain: '前导检测认的是 Wi-Fi 自己的那段图案。别的技术进不了那一支，只能加进总功率里。',
    },
  ],
}
