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
import { J, firstBackoffDraw, firstCollision, firstData, firstRetry, longApartment, node, sc, type Lesson } from '../lessonKit'

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
    label: '书房笔记本搬进客厅',
    scenario: () => projectFlat({ nearX: 12 }),
  },
  {
    label: '第三个竞争者：路由器旁的平板',
    scenario: () => projectFlat({ third: true }),
  },
  {
    label: '客厅笔记本离线',
    scenario: () => projectFlat({ noFar: true }),
  },
]

/** The four jumps both halves of the project offer. */
export const projectJumps = [
  J('第一个数据帧', firstData),
  J('第一次碰撞', firstCollision),
  J('第一次重传', firstRetry),
  J('第一次退避抽签', firstBackoffDraw),
]

export const tier1Project: Lesson = {
  id: 'tier1-project',
  module: 1,
  title: '项目——题面与计划',
  why: '在此之前的每一课，都是讲透一个机制，再让你看着它工作。这一课里它们一起到场：一户没人替你讲解过的房子，架子上一台路由器、两台拼命上传的笔记本、一部正在通话的手机。你的任务是在看到任何结果之前，先说出空口会发生什么——所以前半程到“计划”为止。',
  outcomes: [
    '把一张平面图，算成每台站点（STA）到达的信号，以及它能用的编码等级',
    '给一个数据帧、以及围绕它的那次交换，按微秒标价',
    '预测两台永远不缺帧的发送方多久相撞一次，以及这一对能交付多少',
    '把四个预测写成别人能拿去批改的样子',
  ],
  needs: ['frame-anatomy-bytes', 'airtime', 'ifs', 'backoff', 'nav', 'hidden', 'anomaly', 'retries-queues', 'bianchi', 'bianchi-vs-sim'],
  terms: [
    { term: 'brief', plain: '这里要回答哪些问题，以及什么才算一个回答' },
    { term: 'link budget', plain: '发出去的功率，减去距离拿走的，再减去每堵墙拿走的' },
    { term: 'margin', plain: '余量：取用某一级之前，到达的信号必须高出这一级要求的那几个分贝——这里是 3 dB，好让链路不贴着边跑' },
    { term: 'DCF', plain: '本阶段讲的那套朴素轮流接入：先等，再倒数，发一个，等一个回答' },
  ],
  picture: [
    { heading: '一户你没见过的房子', text: '路由器放在书房的架子上。两台笔记本在拼命上传——一台就在旁边的书桌上，一台在房子另一头、隔着一堵砖墙——还有一部手机正在通话。本课余下的部分是一份题面：在任何人打开仿真之前，关于这个房间要先算清哪些事。' },
    { heading: '关掉了什么，为什么要紧', text: '这里每台设备都共用一条窄信道、一条空间流，开着自己最好的编码，此外什么都没有：没有优先级分类，不把多个帧捆在一起，也没有预留的轮次。于是每次交换就是一个数据帧加一个 ACK 回答，前面还有一段等待和一次倒数——这就是本阶段讲过的那套 DCF。两台笔记本都是饱和的。这样的世界，纸笔还描述得动。四台设备都是 Wi-Fi 7，所以每帧的前导就是“数字节”那一课量到的 48 µs。' },
    { kind: 'watch', jump: 0, heading: '看房间，先别看仿真', text: '载入仿真，只读平面图：墙在哪里、四台设备在哪里、各自站在什么位置。然后就别动它了——只要你读到了结果，就再也没法诚实地预测它了。' },
    { kind: 'table', heading: '题面', head: [
      '设备', '位置', '业务',
    ], rows: [
      ['路由器', '(3, 4), 20 dBm', '只在有东西要发时才发'],
      ['书房笔记本', '(5, 4), 15 dBm', '饱和上传，1500 字节净荷'],
      ['客厅笔记本', '(14, 6), 15 dBm', '饱和上传，1500 字节净荷'],
      ['手机', '(4, 6), 15 dBm', '通话：每 20 ms 上下行各 200 字节'],
    ] },
    { heading: '进去的信号，出来的信号', text: '每条链路都有一本预算。功率从天线出发，距离拿走一份，直线上的每堵墙再拿走一份，剩下的才是到达的。只有当到达的信号满足某一级的要求之外还多出几个分贝时，才可以用这一级；多出的那几个分贝就是余量，也正是它让这架阶梯从不爬到“勉强还行”的那条边上。' },
    { kind: 'steps', heading: '要预测的四件事', items: [
      '（a）每台笔记本到达路由器时有多强，以及这趟路走下来还能用的最快等级。',
      '（b）一个数据帧在空口上多久，以及围绕它的整次交换持续多久。',
      '（c）两台饱和的发送方多久会挑中同一个时刻，以及它们合起来交付多少。',
      '（d）空口在两者之间怎么分，以及快的那台向慢的那台让出了多少。',
    ] },
    { heading: '你可以动的三件事', text: '题面附了三个变体，每个只动一件事：书房笔记本沿着房子走到墙的另一侧；一台平板加入，就摆在路由器旁；客厅笔记本直接离线。三个都要先预测，再去跑。四个答案里有两个几乎不动——知道是哪两个，就是这一课的大半。' },
  ],
  numbers: [
    { kind: 'table', heading: '（a）预测：到达了多少，买得起哪一级', head: [
      '上传设备', '距离与隔墙', '路径损耗',
      '到达电平', 'SNR', '等级',
      '再上一级',
    ], rows: [
      ['书房笔记本', '2.000 m，无墙', '55.73 dB',
        '−40.73 dBm', '53.26 dB', 'MCS 13, 172.1 Mb/s', '已是顶端'],
      ['客厅笔记本', '11.180 m，一堵砖墙', '78.15 dB',
        '−75.15 dBm', '18.84 dB', 'MCS 2, 25.8 Mb/s', '13.99 + 3 = 16.99 dB ✓ · 16.99 + 3 = 19.99 dB ✗'],
    ] },
    { heading: '一切都以它为底', text: '一条 20 MHz 信道上的噪声是 −93.99 dBm，而 SNR 就是到达电平减去这个底。只有当某一级所需的 SINR 再加 3 dB 余量仍装得下时，这一级才可以用。' },
    { kind: 'formula', heading: '（b）预测：先数符号，再算微秒', text: '符号数 = ⌈(16 + 8·L + 6) / 每符号比特数⌉        空口时间 = 前导 + 符号数 × 13.6 µs', note: 'L 是真正上到空口的东西：1500 字节净荷、24 字节 MAC 头、4 字节 FCS——合计 1528 字节。' },
    { kind: 'table', head: [
      '上传设备', '每符号比特', '符号数',
      '数据帧', '它的回答',
      '交换，以及其后的 DIFS', '若发生碰撞',
    ], rows: [
      ['书房笔记本', '2340', '⌈12246 / 2340⌉ = 6', '48 + 81.6 = 129.6 µs',
        '24 Mb/s, 28 µs', '129.6 + 16 + 28 + 34 = 207.6 µs', '208.6 µs'],
      ['客厅笔记本', '351', '⌈12246 / 351⌉ = 35', '48 + 476 = 524.0 µs',
        '12 Mb/s, 32 µs', '524.0 + 16 + 32 + 34 = 606.0 µs', '603.0 µs'],
    ] },
    { heading: '回答有它自己的速率', text: '还是“空口时间”第 5 步那条规则：ACK 用的是不超过数据帧自身参考速率的那个最高强制速率——快帧之后是 24 Mb/s，慢帧之后是 12 Mb/s。而一次碰撞付的是 ACK 超时。' },
    { kind: 'table', heading: '（c）预测：两台饱和站点', head: [
      '量', '预测',
    ], rows: [
      ['窗口、倍增、尝试', '16, 6, 7'],
      ['某时隙里发送的概率', 'τ = 0.1046'],
      ['撞上别人的概率', 'p = 10.46 %'],
      ['一次通用的交换', '(207.6 + 606.0) / 2 = 406.8 µs'],
      ['两台合计', '25.585 Mb/s'],
      ['……各自', '12.793 Mb/s'],
    ] },
    { heading: '为什么碰撞概率不看速率', text: '前两个数字与编码、帧长毫无关系：进入它们的只有竞争者个数、窗口和尝试次数。吞吐则不然；而两台抢到空口的次数相同，所以“一次通用的交换”按两者的平均定价。' },
    { kind: 'table', heading: '（d）预测：份额与代价', head: [
      '量', '预测',
    ], rows: [
      ['各自帧数', '相同'],
      ['空口占比，书房 / 客厅', '19.8 % / 80.2 %'],
      ['书房笔记本独占（交换 + 7.5 个时隙）', '12,000 比特 / 275.1 µs = 43.621 Mb/s'],
    ] },
    { kind: 'steps', heading: '你要执行的计划', items: [
      '什么都不用搭。场景出厂时就是题面描述的样子——20 MHz、单流，没有优先级分类，不捆帧，也没有预留的轮次——你只需在编辑器里核实这一点，再去信任任何读数。',
      '只看平面图，把（a）对两台上传设备各做一遍：距离、隔墙、到达电平、SNR，以及“要求加余量”仍然装得下的那一级。两个电平都写到一个分贝。',
      '从各自的等级做（b）：每符号几个比特、1528 字节要几个符号、空口时间、回答自己的速率，以及一次交换加上它后面那段等待。',
      '从两个交换时长做（c）和（d）：两个竞争者下的不动点、按两者平均定价的“通用交换”，以及每台上传设备最终占住的空口时间。',
      '到这一步才跑十秒。每台笔记本的等级与帧长，从它的第一个数据帧读；丢帧从重传记录读；成功次数和空口时间，从它自己的计数器读。',
      '写下四行——量、单位、数值，以及你要拿屏幕上哪个读数去核它——然后用同样的办法预测三个变体，且都要在跑之前写完。',
    ] },
    { kind: 'table', heading: '三个变体的预测', head: [
      '变体', '书房笔记本那条链路', '帧 / 交换',
      '碰撞概率', '交付',
    ], rows: [
      ['书房笔记本搬到客厅', '9.000 m → −72.33 dBm, 21.66 dB, MCS 3',
        '415.2 / 493.2 µs', '10.46 %', '19.350 → 9.675 + 9.675 Mb/s'],
      ['多一台平板，就在路由器旁', 'MCS 13',
        '129.6 / 207.6 µs', '17.81 %', '29.574 Mb/s'],
      ['客厅笔记本离线', 'MCS 13',
        '129.6 / 207.6 µs', '没有人可撞', '43.621 Mb/s'],
    ] },
  ],
  deeper: [
    { heading: '一个可批改的预测长什么样', text: '四件事各写成一行：量、单位、数值，以及你打算拿屏幕上的哪一样东西去对照它——一个计数、一段时长，还是一个占比。“差不多”不是预测；一个没有说明怎样才算错的数字，也不是预测。这四行只要五分钟，而后半程批改的就是它们。' },
    { heading: '为什么取两次交换的平均是对的定价', text: '不动点给出的是“每个时隙里发送的概率”，两台站点共用这一个值，所以一个成功的时隙属于谁的机会均等。于是它的期望长度就是两次交换时长的平均，碰撞也用同样的道理定价。如果两者抢到空口的比例不同，这个平均就得加权——而一旦加入第三个用着不同等级的竞争者，正是这种情况。' },
    { heading: '同一户人家，换到宽得多的信道上', text: '把信道加宽到八倍，收进来的噪声也是八倍：噪声底从 −93.99 升到 −84.96 dBm。客厅笔记本 18.84 dB 的 SNR 变成 9.81 dB；再加上 3 dB 余量，连最低一级 8.99 dB 的要求都够不着——这条链路整个跌出了阶梯。而碰撞概率和空口的分法，对带宽的变化毫无察觉。' },
  ],
  sources: [
    '本项目所跑的这套轮流接入——一个帧、一个 ACK、几段等待和一次倒数——即 IEEE Std 802.11-2024 §10.3.4 的 DCF；ACK 的速率规则（不超过数据帧参考速率的最高强制速率）见 §10.7.6。',
    'τ 与 p 背后的不动点出自 Bianchi 的《Performance analysis of the IEEE 802.11 distributed coordination function》（IEEE JSAC 18(3)，2000），代入的是本仿真器自己的窗口、倍增上限与重传上限。',
    '模型取值，列出来方便你质疑：路径损耗公式 46.7 + 30·log10(d)、砖墙 12 dB、每一级所需 SINR 之上再留 3 dB 余量，以及 20 MHz 信道 −93.99 dBm 的噪声底。这四项都是仿真器的取值，而非标准正文。',
  ],
  scenario: () => projectFlat(),
  variants: projectVariants,
  jumps: projectJumps,
  observe: [
    '跳到第一个数据帧：书房笔记本的色块是 MCS 13、长 129.6 µs，客厅笔记本的是 MCS 2、长 524.0 µs。两台站点在发出的第一帧上就选定了自己的等级。',
    '从那个色块步进到它后面的 ACK：中间的间隙是 16 µs，一个 SIFS，而回答本身是 28 µs。其后还跟着 34 µs 的等待——你刚刚定价的那次交换，就在屏幕上。',
    '跳到第一次退避抽签，读一下计数器：一个整数个时隙，而且窗口已经翻过一倍了——开局的两个帧撞在了一起。这次抽签完全不问那个帧要发多久。',
  ],
  tryThis: [
    '在载入任何东西之前先把四个预测写下来，一件一行，写明单位，以及你打算用屏幕上的哪个读数去核对。后半程就是拿这四行去对照仿真。',
    '再预测三个变体。在第一个变体里，四个量中有两个原封不动；其中一个在三个变体里都不变。先说出是哪两个，再去看上面的表。',
  ],
  quiz: [
    {
      q: '客厅笔记本的 SNR 是 18.84 dB，而 MCS 3 需要 16.99 dB。为什么预测仍然是 MCS 2？',
      options: [
        '这一代设备上没有 MCS 3 这一级',
        '取用某一级要在其要求之上留 3 dB 余量，而 16.99 + 3 超过了 18.84',
        '那堵砖墙已经被算过两次了',
      ],
      answer: 1,
      explain: '爬这架阶梯要留余量，绝不贴边：13.99 + 3 装得进 18.84，16.99 + 3 装不进。',
    },
    {
      q: '路由器旁多了一台平板。哪一个预测量变化最小？',
      options: [
        '空口占比，因为现在多了一条泳道',
        '书房笔记本的帧长与交换时长，因为它那条链路没变',
        '碰撞概率，因为它对这个房间是定死的',
      ],
      answer: 1,
      explain: '空口时间只取决于一条链路和一个帧长，两样都没变。碰撞概率反而升到 17.81 %，占比也要在三条泳道之间重新划分。',
    },
  ],
}
