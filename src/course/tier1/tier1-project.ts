/**
 * Tier 1 · project · "The brief and the plan".
 *
 * The first half of the closing exercise of Tier 1, rewritten to the
 * zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): one small
 * deterministic flat, the four quantities the learner works out with a pencil,
 * and the three variants they predict before running any of them. Every number
 * here is a PREDICTION — recomputed in tests/course/tier1-project.test.ts from
 * the engine's own functions and the Bianchi solver, never from a run.
 *
 * What the run actually does, and why it differs, is the second half:
 * `tier1-project-review`, which loads this same scene and these same variants,
 * so the recorded timeline hashes of the two ids are the same run twice.
 *
 * The scenario builder and its three variants are unchanged from the flat
 * shape, so tests/fixtures/lesson-hashes.json keeps its recorded values.
 */
import type { Scenario } from '../../model/scenario'
import { J, N, firstBackoffDraw, firstCollision, firstData, firstRetry, longApartment, node, sc, type Lesson } from '../lessonKit'

/**
 * The flat: a Wi-Fi 7 router on the study shelf, two laptops uploading flat
 * out — one on the study desk, one across the brick wall in the living room —
 * and a phone on a voice call. Everything is 20 MHz, one stream, and only the
 * 4096-QAM capability is switched on: no EDCA, no aggregation, no TXOP, so
 * every exchange is exactly one 1500-byte MSDU answered by one ACK, which is
 * the world the DCF lessons and the Bianchi model describe.
 *
 * `nearX` walks the study laptop down the flat (12 m puts it behind the brick
 * wall next to its neighbour); `third` adds a tablet beside the router;
 * `noFar` sends the living-room laptop away.
 */
export function projectFlat(opts: { nearX?: number; third?: boolean; noFar?: boolean } = {}): Scenario {
  const feats = { qam4k: true }
  const ap = node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats, 1)
  const near = node('sta-1', 'Study laptop', 'sta', opts.nearX ?? 5, 4, 'eht', 'saturated', feats, 1)
  const far = node('sta-2', 'Living-room laptop', 'sta', 14, 6, 'eht', 'saturated', feats, 1)
  const phone = node('sta-3', 'Phone (call)', 'sta', 4, 6, 'eht', 'voice', feats, 1)
  const nodes = [ap, near]
  if (!opts.noFar) nodes.push(far)
  nodes.push(phone)
  if (opts.third) nodes.push(node('sta-4', 'Tablet', 'sta', 2, 6, 'eht', 'saturated', feats, 1))
  for (const n of nodes) n.caps.widthMhz = 20
  return sc(longApartment(), nodes)
}

/**
 * The three variants, in the order both halves of the project list them. The
 * second half reuses this array rather than rebuilding it, so the two ids
 * replay to the same recorded timeline hashes, variant for variant.
 */
export const projectVariants = [
  {
    label: { en: 'The study laptop moves to the living room', zh: '书房笔记本搬进客厅' },
    scenario: () => projectFlat({ nearX: 12 }),
  },
  {
    label: { en: 'A third contender: a tablet beside the router', zh: '第三个竞争者：路由器旁的平板' },
    scenario: () => projectFlat({ third: true }),
  },
  {
    label: { en: 'The living-room laptop leaves', zh: '客厅笔记本离线' },
    scenario: () => projectFlat({ noFar: true }),
  },
]

/** The four jumps both halves of the project offer. */
export const projectJumps = [
  J('first data frame', '第一个数据帧', firstData),
  J('first collision', '第一次碰撞', firstCollision),
  J('first retry', '第一次重传', firstRetry),
  J('first backoff draw', '第一次退避抽签', firstBackoffDraw),
]

export const tier1Project: Lesson = {
  id: 'tier1-project',
  module: 1,
  title: {
    en: 'Project — the brief and the plan',
    zh: '项目——题面与计划',
  },
  why: {
    en: 'Every lesson so far taught one mechanism and showed it working. Here they all arrive at once, in a flat nobody has explained: a router on a shelf, two laptops uploading as hard as they can, a phone on a call. Your job is to say what the air will do before you watch it do anything, so this half stops at the plan.',
    zh: '在此之前的每一课，都是讲透一个机制，再让你看着它工作。这一课里它们一起到场：一户没人替你讲解过的房子，架子上一台路由器、两台拼命上传的笔记本、一部正在通话的手机。你的任务是在看到任何结果之前，先说出空口会发生什么——所以前半程到“计划”为止。',
  },
  outcomes: [
    { en: 'turn a floor plan into each station’s arriving signal, and the coding rung it may use', zh: '把一张平面图，算成每台站点到达的信号，以及它能用的编码等级' },
    { en: 'price one data frame and the exchange around it, in microseconds', zh: '给一个数据帧、以及围绕它的那次交换，按微秒标价' },
    { en: 'predict how often two saturated senders collide, and what the pair delivers', zh: '预测两台饱和发送方多久相撞一次，以及这一对能交付多少' },
    { en: 'write four predictions down in a form somebody else could mark', zh: '把四个预测写成别人能拿去批改的样子' },
  ],
  needs: ['frame-anatomy-bytes', 'airtime', 'ifs', 'backoff', 'nav', 'hidden', 'anomaly', 'retries-queues', 'bianchi', 'bianchi-vs-sim'],
  terms: [
    { term: 'brief', plain: {
      en: 'what has to be answered here, and what counts as an answer',
      zh: '这里要回答哪些问题，以及什么才算一个回答',
    } },
    { term: 'link budget', plain: {
      en: 'power out, minus what the distance takes, minus what each wall takes',
      zh: '发出去的功率，减去距离拿走的，再减去每堵墙拿走的',
    } },
    { term: 'margin', plain: {
      en: 'the extra decibels a station insists on before trusting a faster rung',
      zh: '站点在敢用更快的等级之前，坚持要多留的那几个分贝',
    } },
    { term: 'DCF', plain: {
      en: 'the plain take-turns access of this tier: wait, count down, send, be answered',
      zh: '本阶段讲的那套朴素轮流接入：先等，再倒数，发一个，等一个回答',
    } },
    { term: 'saturated', plain: {
      en: 'a station whose queue never empties, so the next frame is always ready',
      zh: '队列永远排不空的站点，下一个帧总是备好的',
    } },
  ],
  picture: [
    { heading: { en: 'The flat you have not seen', zh: '一户你没见过的房子' }, text: {
      en: 'A router sits on a study shelf. Two laptops upload as fast as they can — one at the desk beside it, one at the far end of the flat behind a brick wall — and a phone is on a call. The rest of this lesson is a brief: what to work out about that room before anybody opens the simulation.',
      zh: '路由器放在书房的架子上。两台笔记本在拼命上传——一台就在旁边的书桌上，一台在房子另一头、隔着一堵砖墙——还有一部手机正在通话。本课余下的部分是一份题面：在任何人打开仿真之前，关于这个房间要先算清哪些事。',
    } },
    { heading: { en: 'What is switched off, and why that matters', zh: '关掉了什么，为什么要紧' }, text: {
      en: 'Every radio here shares one narrow channel and one stream, with the best coding it owns and nothing else: no priority classes, no bundling, no reserved turns. Each exchange is therefore one data frame answered by one ACK, with a wait and a countdown in front — DCF, as this tier taught it. Both laptops are saturated: a world a pencil can still describe. All four radios are Wi-Fi 7, so each frame’s front is the 48 µs the byte-counting lesson measured.',
      zh: '这里每台设备都共用一条窄信道、一条空间流，开着自己最好的编码，此外什么都没有：没有优先级分类，不把多个帧捆在一起，也没有预留的轮次。于是每次交换就是一个数据帧加一个 ACK 回答，前面还有一段等待和一次倒数——正是本阶段讲过的 DCF。两台笔记本都是饱和的。这样的世界，纸笔还描述得动。四台设备都是 Wi-Fi 7，所以每帧的前导就是“数字节”那一课量到的 48 µs。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Look at the room, not at the run', zh: '看房间，先别看仿真' }, text: {
      en: 'Load the simulation and read the plan view: the walls, the four devices, where each one stands. Then leave it alone — once you have read a result you can no longer honestly predict it.',
      zh: '载入仿真，只读平面图：墙在哪里、四台设备在哪里、各自站在什么位置。然后就别动它了——只要你读到了结果，就再也没法诚实地预测它了。',
    } },
    { kind: 'table', heading: { en: 'The brief', zh: '题面' }, head: [
      { en: 'Device', zh: '设备' }, { en: 'Where it stands', zh: '位置' }, { en: 'What it sends', zh: '业务' },
    ], rows: [
      [{ en: 'Router', zh: '路由器' }, N('(3, 4), 20 dBm'), { en: 'only when it has something to send', zh: '只在有东西要发时才发' }],
      [{ en: 'Study laptop', zh: '书房笔记本' }, N('(5, 4), 15 dBm'), { en: 'saturated upload, 1500-byte payloads', zh: '饱和上传，1500 字节净荷' }],
      [{ en: 'Living-room laptop', zh: '客厅笔记本' }, N('(14, 6), 15 dBm'), { en: 'saturated upload, 1500-byte payloads', zh: '饱和上传，1500 字节净荷' }],
      [{ en: 'Phone', zh: '手机' }, N('(4, 6), 15 dBm'), { en: 'a call: 200 bytes every 20 ms, each way', zh: '通话：每 20 ms 上下行各 200 字节' }],
    ] },
    { heading: { en: 'Signal in, signal out', zh: '进去的信号，出来的信号' }, text: {
      en: 'Each link has a budget. Power leaves the antenna, the distance takes a share, each wall on the straight line takes another, and what is left is what arrives. A rung may be used only when that clears its requirement with a margin to spare — the ladder never climbs to the edge of what would just about work.',
      zh: '每条链路都有一本预算。功率从天线出发，距离拿走一份，直线上的每堵墙再拿走一份，剩下的才是到达的。只有当到达的信号在满足某一级的要求之外还留有余量时，才可以用这一级——这架阶梯从不爬到“勉强还行”的那条边上。',
    } },
    { kind: 'steps', heading: { en: 'Four things to predict', zh: '要预测的四件事' }, items: [
      { en: '(a) How strong each laptop arrives at the router, and the fastest rung that survives.', zh: '（a）每台笔记本到达路由器时有多强，以及这趟路走下来还能用的最快等级。' },
      { en: '(b) How long one data frame is on the air, and how long the exchange around it lasts.', zh: '（b）一个数据帧在空口上多久，以及围绕它的整次交换持续多久。' },
      { en: '(c) How often two saturated senders pick the same moment, and what they deliver together.', zh: '（c）两台饱和的发送方多久会挑中同一个时刻，以及它们合起来交付多少。' },
      { en: '(d) How the air divides, and what the fast laptop gives up to the slow one.', zh: '（d）空口在两者之间怎么分，以及快的那台向慢的那台让出了多少。' },
    ] },
    { heading: { en: 'Three things you may change', zh: '你可以动的三件事' }, text: {
      en: 'Three variants come with the brief, each moving one thing: the study laptop walks to the far side of the wall; a tablet joins beside the router; the living-room laptop leaves. Predict all three before running any. Two of the four answers barely move, and knowing which two is most of the lesson.',
      zh: '题面附了三个变体，每个只动一件事：书房笔记本沿着房子走到墙的另一侧；一台平板加入，就摆在路由器旁；客厅笔记本直接离线。三个都要先预测，再去跑。四个答案里有两个几乎不动——知道是哪两个，就是这一课的大半。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: '(a) Predicted: what arrives, and the rung it buys', zh: '（a）预测：到达了多少，买得起哪一级' }, head: [
      { en: 'Uploader', zh: '上传设备' }, { en: 'Distance, walls', zh: '距离与隔墙' }, { en: 'Path loss', zh: '路径损耗' },
      { en: 'Arrives at', zh: '到达电平' }, { en: 'SNR', zh: 'SNR' }, { en: 'Rung', zh: '等级' },
      { en: 'Next rung up', zh: '再上一级' },
    ], rows: [
      [{ en: 'Study laptop', zh: '书房笔记本' }, { en: '2.000 m, no wall', zh: '2.000 m，无墙' }, N('55.73 dB'),
        N('−40.73 dBm'), N('53.26 dB'), N('MCS 13, 172.1 Mb/s'), { en: 'already the top', zh: '已是顶端' }],
      [{ en: 'Living-room laptop', zh: '客厅笔记本' }, { en: '11.180 m, one brick wall', zh: '11.180 m，一堵砖墙' }, N('78.15 dB'),
        N('−75.15 dBm'), N('18.84 dB'), N('MCS 2, 25.8 Mb/s'), N('13.99 + 3 = 16.99 dB ✓ · 16.99 + 3 = 19.99 dB ✗')],
    ] },
    { heading: { en: 'The floor it is all measured against', zh: '一切都以它为底' }, text: {
      en: 'Noise across a 20 MHz channel is −93.99 dBm, and SNR is what arrives minus that floor. A rung is allowed when its required SINR plus 3 dB of margin fits underneath.',
      zh: '一条 20 MHz 信道上的噪声是 −93.99 dBm，而 SNR 就是到达电平减去这个底。只有当某一级所需的 SINR 再加 3 dB 余量仍装得下时，这一级才可以用。',
    } },
    { kind: 'formula', heading: { en: '(b) Predicted: symbols, then microseconds', zh: '（b）预测：先数符号，再算微秒' }, text: {
      en: 'symbols = ⌈(16 + 8·L + 6) / bits per symbol⌉        airtime = preamble + symbols × 13.6 µs',
      zh: '符号数 = ⌈(16 + 8·L + 6) / 每符号比特数⌉        空口时间 = 前导 + 符号数 × 13.6 µs',
    }, note: {
      en: 'L is what goes on the air: the 1500-byte payload, 24 bytes of MAC header and 4 of FCS — 1528 bytes.',
      zh: 'L 是真正上到空口的东西：1500 字节净荷、24 字节 MAC 头、4 字节 FCS——合计 1528 字节。',
    } },
    { kind: 'table', head: [
      { en: 'Uploader', zh: '上传设备' }, { en: 'Bits per symbol', zh: '每符号比特' }, { en: 'Symbols', zh: '符号数' },
      { en: 'Data frame', zh: '数据帧' }, { en: 'Its answer', zh: '它的回答' },
      { en: 'Exchange, and the DIFS after it', zh: '交换，以及其后的 DIFS' }, { en: 'If it collides', zh: '若发生碰撞' },
    ], rows: [
      [{ en: 'Study laptop', zh: '书房笔记本' }, N('2340'), N('⌈12246 / 2340⌉ = 6'), N('48 + 81.6 = 129.6 µs'),
        N('24 Mb/s, 28 µs'), N('129.6 + 16 + 28 + 34 = 207.6 µs'), N('208.6 µs')],
      [{ en: 'Living-room laptop', zh: '客厅笔记本' }, N('351'), N('⌈12246 / 351⌉ = 35'), N('48 + 476 = 524.0 µs'),
        N('12 Mb/s, 32 µs'), N('524.0 + 16 + 32 + 34 = 606.0 µs'), N('603.0 µs')],
    ] },
    { heading: { en: 'The answer has its own rate', zh: '回答有它自己的速率' }, text: {
      en: 'An ACK travels not at the data frame’s rate but at the fastest mandatory rate at or below it: 24 Mb/s behind the fast frame, 12 Mb/s behind the slow one. A collision pays the ACK timeout instead.',
      zh: 'ACK 并不以数据帧的速率发送。它用的是不超过该帧参考速率的最高强制速率：快帧之后是 24 Mb/s，慢帧之后是 12 Mb/s。而一次碰撞付的是 ACK 超时。',
    } },
    { kind: 'table', heading: { en: '(c) Predicted: two saturated stations', zh: '（c）预测：两台饱和站点' }, head: [
      { en: 'Quantity', zh: '量' }, { en: 'Predicted', zh: '预测' },
    ], rows: [
      [{ en: 'Window, doublings, attempts', zh: '窗口、倍增、尝试' }, N('16, 6, 7')],
      [{ en: 'Chance of sending in a slot', zh: '某时隙里发送的概率' }, N('τ = 0.1046')],
      [{ en: 'Chance of meeting another', zh: '撞上别人的概率' }, N('p = 10.46 %')],
      [{ en: 'One generic exchange', zh: '一次通用的交换' }, N('(207.6 + 606.0) / 2 = 406.8 µs')],
      [{ en: 'The two together', zh: '两台合计' }, N('25.585 Mb/s')],
      [{ en: '…and each', zh: '……各自' }, N('12.793 Mb/s')],
    ] },
    { heading: { en: 'Why the collision chance ignores rates', zh: '为什么碰撞概率不看速率' }, text: {
      en: 'The first two know nothing about coding or frame length: only the contenders, the window and the tries enter them. Throughput does, and the two win equally often, so a generic exchange costs the mean.',
      zh: '前两个数字与编码、帧长毫无关系：进入它们的只有竞争者个数、窗口和尝试次数。吞吐则不然；而两台抢到空口的次数相同，所以“一次通用的交换”按两者的平均定价。',
    } },
    { kind: 'table', heading: { en: '(d) Predicted: the share, and what it costs', zh: '（d）预测：份额与代价' }, head: [
      { en: 'Quantity', zh: '量' }, { en: 'Predicted', zh: '预测' },
    ], rows: [
      [{ en: 'Frames each', zh: '各自帧数' }, { en: 'equal', zh: '相同' }],
      [{ en: 'Airtime, study / living room', zh: '空口占比，书房 / 客厅' }, N('19.8 % / 80.2 %')],
      [{ en: 'Study laptop alone (exchange + 7.5 slots)', zh: '书房笔记本独占（交换 + 7.5 个时隙）' }, { en: '12,000 bits / 275.1 µs = 43.621 Mb/s', zh: '12,000 比特 / 275.1 µs = 43.621 Mb/s' }],
    ] },
    { kind: 'table', heading: { en: 'The three variants, predicted', zh: '三个变体的预测' }, head: [
      { en: 'Variant', zh: '变体' }, { en: 'The study laptop’s link', zh: '书房笔记本那条链路' }, { en: 'Frame / exchange', zh: '帧 / 交换' },
      { en: 'Collision chance', zh: '碰撞概率' }, { en: 'Delivered', zh: '交付' },
    ], rows: [
      [{ en: 'Study laptop to the living room', zh: '书房笔记本搬到客厅' }, N('9.000 m → −72.33 dBm, 21.66 dB, MCS 3'),
        N('415.2 / 493.2 µs'), N('10.46 %'), N('19.350 → 9.675 + 9.675 Mb/s')],
      [{ en: 'A tablet joins, beside the router', zh: '多一台平板，就在路由器旁' }, N('MCS 13'),
        N('129.6 / 207.6 µs'), N('17.81 %'), N('29.574 Mb/s')],
      [{ en: 'The living-room laptop leaves', zh: '客厅笔记本离线' }, N('MCS 13'),
        N('129.6 / 207.6 µs'), { en: 'nobody to collide with', zh: '没有人可撞' }, N('43.621 Mb/s')],
    ] },
  ],
  deeper: [
    { heading: { en: 'What a markable prediction looks like', zh: '一个可批改的预测长什么样' }, text: {
      en: 'Write each of the four as one line: the quantity, its units, the value, and the one thing on screen you will compare it against — a count, a duration, a share. "About the same" is not a prediction, and neither is a number with no stated way of being wrong. The four lines take five minutes, and they are what the second half marks you against.',
      zh: '四件事各写成一行：量、单位、数值，以及你打算拿屏幕上的哪一样东西去对照它——一个计数、一段时长，还是一个占比。“差不多”不是预测；一个没有说明怎样才算错的数字，也不是预测。这四行只要五分钟，而后半程批改的就是它们。',
    } },
    { heading: { en: 'Why the mean of two exchanges is the right price', zh: '为什么取两次交换的平均是对的定价' }, text: {
      en: 'The fixed point gives one chance of transmitting per slot, shared by both stations, so a successful slot is equally likely to belong to either. Its expected length is therefore the mean of the two exchange times, and the same argument prices a collision. If the two won the air in unequal proportions the mean would have to be weighted — which is what happens the moment a third contender joins on a different rung.',
      zh: '不动点给出的是“每个时隙里发送的概率”，两台站点共用这一个值，所以一个成功的时隙属于谁的机会均等。于是它的期望长度就是两次交换时长的平均，碰撞也用同样的道理定价。如果两者抢到空口的比例不同，这个平均就得加权——而一旦加入第三个用着不同等级的竞争者，正是这种情况。',
    } },
    { heading: { en: 'The same flat on a much wider channel', zh: '同一户人家，换到宽得多的信道上' }, text: {
      en: 'A channel eight times as wide gathers eight times the noise: the floor rises from −93.99 to −84.96 dBm. The living-room laptop’s 18.84 dB of SNR becomes 9.81 dB, which is under even the lowest rung’s 8.99 dB requirement once the 3 dB margin is added — the link falls off the ladder entirely, while the collision chance and the way airtime splits do not notice the width at all.',
      zh: '把信道加宽到八倍，收进来的噪声也是八倍：噪声底从 −93.99 升到 −84.96 dBm。客厅笔记本 18.84 dB 的 SNR 变成 9.81 dB；再加上 3 dB 余量，连最低一级 8.99 dB 的要求都够不着——这条链路整个跌出了阶梯。而碰撞概率和空口的分法，对带宽的变化毫无察觉。',
    } },
  ],
  sources: [
    { en: 'The take-turns access this project runs — one frame, one ACK, the waits and the countdown — is the DCF of §10.3.4 of IEEE Std 802.11-2024; the ACK’s rate rule (the highest mandatory rate at or below the data frame’s reference rate) is §10.7.6.',
      zh: '本项目所跑的这套轮流接入——一个帧、一个 ACK、几段等待和一次倒数——即 IEEE Std 802.11-2024 §10.3.4 的 DCF；ACK 的速率规则（不超过数据帧参考速率的最高强制速率）见 §10.7.6。' },
    { en: 'The fixed point behind τ and p is Bianchi, "Performance analysis of the IEEE 802.11 distributed coordination function", IEEE JSAC 18(3), 2000, with this simulator’s own window, doubling limit and retry limit fed into it.',
      zh: 'τ 与 p 背后的不动点出自 Bianchi 的《Performance analysis of the IEEE 802.11 distributed coordination function》（IEEE JSAC 18(3)，2000），代入的是本仿真器自己的窗口、倍增上限与重传上限。' },
    { en: 'Model choices, named so you can argue with them: the path-loss form 46.7 + 30·log10(d), 12 dB for a brick wall, the 3 dB margin above each rung’s required SINR, and the −93.99 dBm noise floor of a 20 MHz channel. All four are the simulator’s, not the standard’s.',
      zh: '模型取值，列出来方便你质疑：路径损耗公式 46.7 + 30·log10(d)、砖墙 12 dB、每一级所需 SINR 之上再留 3 dB 余量，以及 20 MHz 信道 −93.99 dBm 的噪声底。这四项都是仿真器的取值，而非标准正文。' },
  ],
  scenario: () => projectFlat(),
  variants: projectVariants,
  jumps: projectJumps,
  observe: [
    { en: 'Jump to the first data frame: the study laptop’s block is MCS 13 and 129.6 µs long, the living-room laptop’s MCS 2 and 524.0 µs. Both pick their rung on the very first frame.', zh: '跳到第一个数据帧：书房笔记本的色块是 MCS 13、长 129.6 µs，客厅笔记本的是 MCS 2、长 524.0 µs。两台站点在发出的第一帧上就选定了自己的等级。' },
    { en: 'Step from that block to the ACK behind it: the gap is 16 µs, one SIFS, and the answer is 28 µs. A 34 µs wait follows — the exchange you priced, on screen.', zh: '从那个色块步进到它后面的 ACK：中间的间隙是 16 µs，一个 SIFS，而回答本身是 28 µs。其后还跟着 34 µs 的等待——你刚刚定价的那次交换，就在屏幕上。' },
    { en: 'Jump to the first backoff draw and read the counter: a whole number of slots, and already from a doubled window, because the two opening frames collided. Nothing in the draw asks how long the frame will take.', zh: '跳到第一次退避抽签，读一下计数器：一个整数个时隙，而且窗口已经翻过一倍了——开局的两个帧撞在了一起。这次抽签完全不问那个帧要发多久。' },
  ],
  tryThis: [
    { en: 'Write the four predictions down before loading anything, one line each, with units and the screen reading you will check them against. The second half marks the run against exactly those four lines.', zh: '在载入任何东西之前先把四个预测写下来，一件一行，写明单位，以及你打算用屏幕上的哪个读数去核对。后半程就是拿这四行去对照仿真。' },
    { en: 'Now predict the three variants. Two of the four quantities come out unchanged in the first variant, and one is unchanged in all three. Name them before you look at the table.', zh: '再预测三个变体。在第一个变体里，四个量中有两个原封不动；其中一个在三个变体里都不变。先说出是哪两个，再去看上面的表。' },
  ],
  quiz: [
    {
      q: { en: 'The living-room laptop’s SNR is 18.84 dB and MCS 3 needs 16.99 dB. Why does the prediction still say MCS 2?', zh: '客厅笔记本的 SNR 是 18.84 dB，而 MCS 3 需要 16.99 dB。为什么预测仍然是 MCS 2？' },
      options: [
        { en: 'MCS 3 is not available on this radio', zh: '这一代设备上没有 MCS 3 这一级' },
        { en: 'A rung needs 3 dB of margin above its requirement, and 16.99 + 3 exceeds 18.84', zh: '取用某一级要在其要求之上留 3 dB 余量，而 16.99 + 3 超过了 18.84' },
        { en: 'The brick wall was counted twice', zh: '那堵砖墙已经被算过两次了' },
      ],
      answer: 1,
      explain: { en: 'The ladder is climbed with a margin, never to the edge: 13.99 + 3 fits under 18.84, 16.99 + 3 does not.', zh: '爬这架阶梯要留余量，绝不贴边：13.99 + 3 装得进 18.84，16.99 + 3 装不进。' },
    },
    {
      q: { en: 'A tablet joins beside the router. Which predicted quantity moves least?', zh: '路由器旁多了一台平板。哪一个预测量变化最小？' },
      options: [
        { en: 'The airtime share, with a third lane in it', zh: '空口占比，因为现在多了一条泳道' },
        { en: 'The study laptop’s frame and exchange times: its link has not changed', zh: '书房笔记本的帧长与交换时长，因为它那条链路没变' },
        { en: 'The collision chance, fixed for this room', zh: '碰撞概率，因为它对这个房间是定死的' },
      ],
      answer: 1,
      explain: { en: 'Airtime is a property of one link and one frame length, and neither moved. The collision chance rises to 17.81 %, and the shares are redrawn across three lanes.', zh: '空口时间只取决于一条链路和一个帧长，两样都没变。碰撞概率反而升到 17.81 %，占比也要在三条泳道之间重新划分。' },
    },
  ],
}
