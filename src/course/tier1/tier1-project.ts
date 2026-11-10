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
 *
 * Re-paced 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md
 * §2 M7, §5.5, §7). It stays ONE lesson — a brief whose four questions are one
 * exercise — and it lost the wider-channel aside, which taught a scenario no
 * variant can load and which §7 rules out by name. The four questions are now a
 * `list` rather than a second `steps` block: they are four deliverables, not an
 * ordered procedure, and the lesson's one procedure is the plan the learner
 * carries out.
 *
 * NO DIAGRAM, against §4, and the reason is arithmetic rather than taste. A
 * topology figure maps the scene's x range onto about 184 viewBox units, so this
 * flat's 11 m of span gives 16.7 units per metre, while a node box is at least 40
 * units wide. The router (3, 4) and the study laptop (5, 4) are 2.0 m apart on the
 * same row, so their boxes overlap by about 6.5 units and the arrow between them
 * is drawn backwards. A faithful plan of THIS flat cannot be drawn by this
 * renderer; see the batch E report.
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
  module: 6,
  title: '项目——题面与计划',
  why: '在此之前的每一课，都是讲透一个机制，再让你看着它工作。这一课里这些机制同时起作用：一户事先没有讲解过的房子，架子上一台路由器、两台持续饱和上传的笔记本、一部正在通话的手机，而你要在看到任何结果之前，只凭平面图把四件事算出来。离路由器近、中间没有墙的书房笔记本信号很强，可以使用最高的编码等级；远处隔着一堵砖墙的客厅笔记本只能用很低的一级——到达的信号必须在某一级的要求之上再多出几个分贝，才可以用这一级，所以信号刚好达到要求的上一级也不能用。因此同样一帧，客厅那台在空口上要占用约四倍的时间。两台发送方发生碰撞的概率只取决于竞争者个数和窗口，与速率、帧长无关；两台取得发送机会的次数相同，帧数也就相同，但空口有八成被慢的那台占用，两台合计交付的只有快的那台独占信道时的六成左右。三个变体各只改变一项条件：书房笔记本搬到墙后，它的等级和帧长都变了，发生碰撞的概率却不变；加一台平板，书房笔记本的帧长不变，发生碰撞的概率却升高；客厅笔记本离线，就不再有碰撞对象，快的那台独占信道。',
  outcomes: [
    '根据一张平面图，算出每台站点（STA）到达的信号，以及它能用的编码等级',
    '算出一个数据帧（data frame）、以及围绕它的那次交换，各占多少微秒',
    '预测两台始终有帧待发的发送方多久发生一次碰撞，以及这一对能交付多少',
    '把四个预测写成别人可以据以批改的形式',
  ],
  needs: ['frame-anatomy-bytes', 'airtime', 'ifs', 'backoff', 'nav', 'hidden', 'anomaly', 'retries-queues', 'bianchi', 'rate-vs-model'],
  terms: [
    { term: 'brief', plain: '这里要回答哪些问题，以及什么才算一个回答' },
    { term: 'link budget', plain: '发送端的功率，减去距离造成的损耗，再减去每堵墙造成的损耗' },
    { term: 'margin', plain: '余量：取用某一级之前，到达的信号必须高出这一级要求的那几个分贝——这里是 3 dB，使链路不在门限边缘工作' },
    { term: 'DCF', plain: '本阶段讲的基本轮流接入方式：先等待，再倒数，发送一帧，等待一个应答' },
  ],
  picture: [
    { heading: '一户你没见过的房子', text: '一台路由器、两台持续饱和上传的笔记本、一部正在通话的手机，位置见下面那张题面表。本课余下的部分就是一份题面：在任何人打开仿真之前，关于这个房间要先算清哪些事。' },
    { heading: '关掉了什么，为什么要紧', text: '这里每台设备都共用一条窄信道、一条空间流（spatial stream），启用各自最高的编码能力，此外没有任何其他功能：没有优先级分类，不把多个帧聚合在一起，也没有预留的轮次。于是每次交换就是一个数据帧加一个作为应答的确认帧（ACK），前面还有一段等待和一次倒数——这就是本阶段讲过的那套分布式协调功能（distributed coordination function, DCF）。两台笔记本都是饱和的，这样的情形仍然可以用纸笔分析。四台设备都是 Wi-Fi 7，所以每帧的前导码（preamble）就是“数字节”那一课测得的 48 µs。' },
    { kind: 'watch', jump: 0, heading: '看房间，先别看仿真', text: '载入仿真，只读平面图：墙在哪里、四台设备各自位于什么位置。然后先不要继续操作——一旦看到了结果，就无法再做独立的预测。' },
    { kind: 'table', heading: '题面', head: [
      '设备', '位置', '业务',
    ], rows: [
      ['路由器', '(3, 4), 20 dBm', '只在有数据待发时发送'],
      ['书房笔记本', '(5, 4), 15 dBm', '饱和上传，1500 字节载荷（payload）'],
      ['客厅笔记本', '(14, 6), 15 dBm', '饱和上传，1500 字节载荷'],
      ['手机', '(4, 6), 15 dBm', '通话：每 20 ms 上行（uplink, UL）与下行（downlink, DL）各 200 字节'],
    ] },
    { heading: '发出的信号与到达的信号', text: '每条链路（link）都有一份预算：功率从天线（antenna）发出，传播距离造成一部分损耗，直线路径上的每堵墙再造成一部分损耗，剩余的才是到达的功率。而只有当到达的信号比某一级的要求还高出几个分贝时，才可以使用这一级——高出的那几个分贝就是余量。' },
    { kind: 'list', heading: '要预测的四件事', items: [
      '（a）每台笔记本到达路由器时有多强，以及经过这条路径之后仍可使用的最高等级。',
      '（b）一个数据帧在空口上多久，以及围绕它的整次交换持续多久。',
      '（c）两台饱和的发送方多久会在同一个时刻开始发送，以及它们合起来交付多少。',
      '（d）空口在两者之间如何分配，以及快的那台为慢的那台让出了多少。',
    ] },
    { heading: '可以改变的三项条件', text: '题面附了三个变体，每个只改变一项条件：书房笔记本移到墙的另一侧；加入一台平板，就放在路由器旁；客厅笔记本离线。三个都要先预测，再运行。四个答案里有两个几乎不变——判断出是哪两个，就掌握了这一课的大半。' },
  ],
  numbers: [
    { kind: 'table', heading: '（a）预测：到达了多少，能用哪一级', head: [
      '上传设备', '距离与隔墙', '路径损耗（path loss）',
      '到达电平', 'SNR', '等级',
      '再上一级',
    ], rows: [
      ['书房笔记本', '2.000 m，无墙', '55.73 dB',
        '−40.73 dBm', '53.26 dB', 'MCS 13, 172.1 Mb/s', '已是顶端'],
      ['客厅笔记本', '11.180 m，一堵砖墙', '78.15 dB',
        '−75.15 dBm', '18.84 dB', 'MCS 2, 25.8 Mb/s', '13.99 + 3 = 16.99 dB ✓ · 16.99 + 3 = 19.99 dB ✗'],
    ] },
    { heading: '一切计算的基准', text: '一条 20 MHz 信道上的噪声地板（noise floor）是 −93.99 dBm，信噪比（SNR）就是到达电平减去这个噪声地板。只有当某一级所需的信干噪比（SINR）再加 3 dB 余量仍不超过信噪比时，这一级才可以用。' },
    { kind: 'formula', heading: '（b）预测：先数符号（symbol），再算微秒', text: '符号数 = ⌈(16 + 8·L + 6) / 每符号比特数⌉        空口时间 = 前导码 + 符号数 × 13.6 µs', note: 'L 是实际在空口上传送的内容：1500 字节载荷、24 字节媒体访问控制（MAC）头、4 字节帧校验序列（FCS）——合计 1528 字节。' },
    { kind: 'table', head: [
      '上传设备', '每符号比特', '符号数',
      '数据帧', '它的应答',
      '交换，以及其后的分布式帧间间隔（DIFS）', '若发生碰撞',
    ], rows: [
      ['书房笔记本', '2340', '⌈12246 / 2340⌉ = 6', '48 + 81.6 = 129.6 µs',
        '24 Mb/s, 28 µs', '129.6 + 16 + 28 + 34 = 207.6 µs', '208.6 µs'],
      ['客厅笔记本', '351', '⌈12246 / 351⌉ = 35', '48 + 476 = 524.0 µs',
        '12 Mb/s, 32 µs', '524.0 + 16 + 32 + 34 = 606.0 µs', '603.0 µs'],
    ] },
    { heading: '应答有自己的速率', text: '还是“空口时间（airtime）”那一课第 2 步的规则：确认帧用的是不超过数据帧自身参考速率的那个最高强制速率（mandatory rate）——快帧之后是 24 Mb/s，慢帧之后是 12 Mb/s。而一次碰撞占用的是 ACK 超时（ACK timeout）。' },
    { kind: 'table', heading: '（c）预测：两台饱和站点', head: [
      '量', '预测',
    ], rows: [
      ['窗口、倍增、尝试', '16, 6, 7'],
      ['某个时隙（slot time）里发送的概率', 'τ = 0.1046'],
      ['与对方发生碰撞的概率', 'p = 10.46 %'],
      ['一次通用的交换', '(207.6 + 606.0) / 2 = 406.8 µs'],
      ['两台合计', '25.585 Mb/s'],
      ['……各自', '12.793 Mb/s'],
    ] },
    { heading: '为什么碰撞概率与速率无关', text: '前两个数字与编码、帧长毫无关系：决定它们的只有竞争者个数、窗口和尝试次数。吞吐则不然；而两台取得发送机会的次数相同，所以“一次通用的交换”按两者的平均来算。' },
    { kind: 'table', heading: '（d）预测：份额与代价', head: [
      '量', '预测',
    ], rows: [
      ['各自帧数', '相同'],
      ['空口占比，书房 / 客厅', '19.8 % / 80.2 %'],
      ['书房笔记本独占（交换 + 7.5 个时隙）', '12,000 比特 / 275.1 µs = 43.621 Mb/s'],
    ] },
    { kind: 'steps', heading: '你要执行的计划', items: [
      '无需搭建任何东西。场景默认就是题面描述的配置——20 MHz、单流，没有优先级分类，不聚合帧，也没有预留的轮次——你只需先在编辑器里核实这一点，再采信任何读数。',
      '只看平面图，把（a）对两台上传设备各做一遍：距离、隔墙、到达电平、SNR，以及“要求加余量”仍不超过 SNR 的那一级。两个电平都精确到 1 dB。',
      '从各自的等级做（b）：每符号几个比特、1528 字节要几个符号、空口时间、应答自己的速率，以及一次交换加上它后面那段等待。',
      '从两个交换时长做（c）和（d）：两个竞争者下的不动点、按两者平均算出的“通用交换”，以及每台上传设备最终占用的空口时间。',
      '到这一步才运行十秒。每台笔记本的等级与帧长，从它的第一个数据帧读；丢帧从重传（retry）记录读；成功次数和空口时间，从它自己的计数器读。',
      '写下四行——量、单位、数值，以及你要拿屏幕上哪个读数去核它——然后用同样的办法预测三个变体，且都要在运行之前写完。',
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
        '129.6 / 207.6 µs', '没有碰撞对象', '43.621 Mb/s'],
    ] },
  ],
  deeper: [
    { heading: '一个可批改的预测是什么样的', text: '四件事各写成一行：量、单位、数值，以及你打算拿屏幕上的哪一样东西去对照它——一个计数、一段时长，还是一个占比。“差不多”不是预测；一个没有说明怎样才算错的数字，也不是预测。这四行只要五分钟，而后半程批改的就是它们。' },
    { heading: '为什么取两次交换的平均是对的', text: '不动点给出的是“每个时隙里发送的概率”，两台站点共用这一个值，所以一个成功的时隙属于谁的机会均等。于是它的期望长度就是两次交换时长的平均，碰撞的时长也按同样的道理算。如果两者取得发送机会的比例不同，这个平均就要加权——而一旦加入第三个使用不同等级的竞争者，正是这种情况。' },
  ],
  limits: [
    { kind: 'model-value', text: '题面里每一个预测都建立在四个引擎取值上：路径损耗公式 46.7 + 30·log10(d)、砖墙 12 dB、每一级所需信干噪比之上再留 3 dB 余量，以及 20 MHz 下 −93.99 dBm 的噪声地板。四项都不是标准正文，换一套取值，这四个答案全都要重算。它们值得信任的理由是引擎公开了这些函数供你验算，而不是它们与真实世界一致。' },
    { kind: 'threshold', text: '按平面图算出的到达电平是一个定数：同一个位置永远给出同一个电平，于是「能用哪一级」也永远是同一个答案。真实的 2.0 m 与 11.2 m 链路在几秒内电平就会上下波动几个分贝，等级会在边界附近来回切换。默认场景没有开衰落，编辑器的「时变链路（衰落）」一节可以打开它——打开之后（a）与（b）的答案就不再是一个数，而是一个分布。' },
    { kind: 'unmodelled', text: '预测（b）把一次交互算成「帧 + SIFS + 确认 + DIFS」，而引擎里这四段都是精确常数，发射的信号到达各处不需要时间，所有设备共用一个时钟。真实设备之间有传播时延，收发转换需要时间，晶振彼此相差几十 ppm，交互的每一段都会抖动。所以这里能把一次交互算到 0.1 µs，真实测量做不到。' },
    { kind: 'out-of-scope', text: '这户房子里除了这四台设备没有任何其他设备：没有邻居的网络，没有微波炉，也没有蓝牙（引擎只为共享频段的 UWB 接了一条跨技术的线）。真实的长公寓里同一个频段上多半还有好几张别人的网，而它们首先使（c）与（d）失效——竞争者的个数根本不是你数得出来的那几台。' },
  ],
  sources: [
    '本项目运行的这套轮流接入——一个帧、一个 ACK、几段等待和一次倒数——即 IEEE Std 802.11-2024 §10.3.4 的 DCF；ACK 的速率规则（不超过数据帧参考速率的最高强制速率）见 §10.7.6。',
    'τ 与 p 背后的不动点出自 Bianchi 的《Performance analysis of the IEEE 802.11 distributed coordination function》（IEEE JSAC 18(3)，2000），代入的是本仿真器自己的窗口、倍增上限与重传上限。',
    '模型取值，列出来方便你质疑：路径损耗公式 46.7 + 30·log10(d)、砖墙 12 dB、每一级所需 SINR 之上再留 3 dB 余量，以及 20 MHz 信道 −93.99 dBm 的噪声地板。这四项都是仿真器的取值，而非标准正文。',
  ],
  scenario: () => projectFlat(),
  variants: projectVariants,
  jumps: projectJumps,
  observe: [
    '跳到第一个数据帧：书房笔记本的色块是调制与编码方式（MCS）13、长 129.6 µs，客厅笔记本的是 MCS 2、长 524.0 µs。两台站点在发出的第一帧上就选定了自己的等级。',
    '从那个色块步进到它后面的 ACK：中间的间隙是 16 µs，一个短帧间间隔（SIFS），而应答本身是 28 µs。其后还有 34 µs 的等待——你刚刚算过的那次交换就显示在屏幕上。',
    '跳到第一次退避（backoff）抽签，读一下计数器：一个整数个时隙，而且窗口已经加倍——最初的两个帧发生了碰撞。这次抽签与那个帧的发送时长完全无关。',
  ],
  tryThis: [
    '在载入任何东西之前先把四个预测写下来，一件一行，写明单位，以及你打算用屏幕上的哪个读数去核对。后半程就是拿这四行去对照仿真。',
    '再预测三个变体。在第一个变体里，四个量中有两个保持不变；其中一个在三个变体里都不变。先说出是哪两个，再去看上面的表。',
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
      explain: '选用某一级要留余量，绝不在要求的边缘工作：13.99 + 3 不超过 18.84，16.99 + 3 超过了 18.84。',
    },
    {
      q: '路由器旁多了一台平板。哪一个预测量变化最小？',
      options: [
        '空口占比，因为现在多了一条泳道',
        '书房笔记本的帧长与交换时长，因为它那条链路没变',
        '碰撞概率，因为它对这个房间是固定不变的',
      ],
      answer: 1,
      explain: '空口时间只取决于一条链路和一个帧长，两样都没变。碰撞概率反而升到 17.81 %，占比也要在三条泳道之间重新划分。',
    },
  ],
}
