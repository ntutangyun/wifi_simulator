/**
 * Tier 1 · project · "The brief and the plan".
 *
 * The first half of the closing exercise of Tier 1: one small deterministic flat, the four
 * quantities the learner works out with a pencil, and the three variants they predict before
 * running any of them. Every number in the brief is a PREDICTION — recomputed in
 * tests/course/tier1-project.test.ts from the engine's own functions and the Bianchi solver.
 * What the run actually does, and why it differs, is the second half: `tier1-project-review`,
 * which loads this same scene and these same variants, so the recorded timeline hashes of the two
 * ids are the same run twice.
 *
 * Standard-first shape (2026-11-11), after the lesson audit against IEEE Std 802.11-2024 and
 * IEEE Std 802.11be-2024. ① covers the standard mechanisms the project exercises — DCF basic
 * access and backoff (§10.3.3, §10.3.4), the acknowledgment procedure and its timeout
 * (§10.3.2.11), the EHT rates of Table 36-76 and the coding rule of §36.3.13.3.3, the minimum
 * sensitivities of Table 36-67, the rate-switching algorithm being outside the standard
 * (§10.6.1), and the control response rate (§10.6.6.5.2). ② is honest about the scene and the
 * engine: EDCA is switched off so the flat runs DCF (differs); since 2026-11-11 (W6) the frame
 * length follows the standard (LDPC for MCS 13, BCC for MCS 2, the 51.2 µs EHT preamble, the
 * packet extension, the µs rounding) and the ACK timeout uses the 24 µs aRxPHYStartDelay of an
 * HT/VHT/HE STA (49 µs); the link budget, the 3 dB margin and the rung choice are the engine's
 * own. ③ keeps the project's task: read the brief, predict (a)–(d),
 * predict the three variants, and only then run.
 *
 * NO DIAGRAM, for the reason the earlier shape gave: at this flat's 11 m span the router and the
 * study laptop's boxes overlap and the arrow between them is drawn backwards.
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
  why: '在此之前的每一课，都是讲透一个机制，再让你看着它工作。这一课里这些机制同时起作用：一户事先没有讲解过的房子，架子上一台路由器、两台持续饱和上传的笔记本、一部正在通话的手机，而你要在看到任何结果之前，只凭平面图把四件事算出来。离路由器近、中间没有墙的书房笔记本信号很强，可以使用最高的编码等级；远处隔着一堵砖墙的客厅笔记本只能用很低的一级。标准只规定每一级的最低接收灵敏度（sensitivity），选哪一级留给实现；本仿真器要求到达的信号在某一级的要求之上再多出几个分贝，才用这一级，所以信号刚好达到要求的上一级也不能用。因此同样一帧，客厅那台在空口上要占用约四倍的时间。两台发送方发生碰撞的概率只取决于竞争者个数和窗口，与速率、帧长无关；两台取得发送机会的次数相同，帧数也就相同，但空口有八成被慢的那台占用，两台合计交付的只有快的那台独占信道时的六成左右。三个变体各只改变一项条件：书房笔记本搬到墙后，它的等级和帧长都变了，发生碰撞的概率却不变；加一台平板，书房笔记本的帧长不变，发生碰撞的概率却升高；客厅笔记本离线，就不再有碰撞对象，快的那台独占信道。',
  outcomes: [
    '说出这户人家用到了标准的哪些规定，以及哪些是本仿真器自己的取值',
    '根据一张平面图，算出每台站点（STA）到达的信号、它能用的编码等级，以及一个数据帧（data frame）和围绕它的那次交换各占多少微秒',
    '预测两台始终有帧待发的发送方多久发生一次碰撞，以及这一对能交付多少',
    '把四个预测写成别人可以据以批改的形式',
  ],
  needs: ['frame-anatomy-bytes', 'airtime', 'ifs', 'backoff', 'nav', 'hidden', 'anomaly', 'retries-queues', 'bianchi', 'rate-vs-model'],
  terms: [
    { term: 'brief', plain: '这里要回答哪些问题，以及什么才算一个回答' },
    { term: 'link budget', plain: '发送端的功率，减去距离造成的损耗，再减去每堵墙造成的损耗' },
    { term: 'margin', plain: '余量：本仿真器取用某一级之前，到达的信号必须高出这一级要求的那几个分贝——这里是 3 dB，使链路不在门限边缘工作' },
    { term: 'DCF', plain: '本阶段讲的基本轮流接入方式：先等待，再倒数，发送一帧，等待一个应答' },
  ],
  standard: [
    { heading: '发送的条件（§10.3.4.2，§10.3.3）', text: '在分布式协调功能（distributed coordination function, DCF）的基本接入（basic access）方式下，站点确定介质（medium）空闲达到分布式帧间间隔（DCF interframe space, DIFS）、且退避（backoff）计数为 0 时，可以发送一个 MPDU（MAC protocol data unit）。退避计数在 0 到竞争窗口（contention window, CW）之间均匀抽取，即 [0, CW]；CW 从 aCWmin 开始，每次发送失败取下一个值（2 的整数次幂减 1），到 aCWmax 为止，发送成功后回到 aCWmin。第 17 章正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层（physical layer, PHY）的 aCWmin 为 15、aCWmax 为 1023（表 17-24）；同一帧的尝试次数达到 dot11ShortRetryLimit（默认 7）——即重传上限（retry limit）——时丢弃（§10.3.4.4）。' },
    { heading: '一次交换与超时（§10.3.2.11，§10.3.7）', text: '接收方在短帧间间隔（short interframe space, SIFS）之后回一个确认帧（acknowledgement, ACK）。发送方从发送结束起等待 ACK 超时（ACK timeout），长度为 aSIFSTime + aSlotTime + aRxPHYStartDelay；超时内没有开始接收到帧，就判定失败并重新退避。DIFS = aSIFSTime + 2 × aSlotTime（式 10-6）；20 MHz 的 OFDM PHY 上 aSIFSTime 为 16 µs、时隙（slot time）aSlotTime 为 9 µs，DIFS 为 34 µs（表 17-24）。aRxPHYStartDelay 按 PHY 规定：第 17 章为 20 µs（表 17-24），HE 为 24 µs（表 27-61）。' },
    { heading: 'EHT 的速率表（802.11be 表 36-76）', text: '调制与编码方式（modulation and coding scheme, MCS）的编号与速率见表 36-76。20 MHz 信道上，资源单元（resource unit, RU）为 242 个子载波（sub-carrier）、单空间流（spatial stream）、0.8 µs 保护间隔时：EHT-MCS 13 是 4096-QAM（quadrature amplitude modulation）、码率 5/6，每个符号（symbol）2340 个数据比特，172.1 Mb/s；EHT-MCS 2 是 QPSK（quadrature phase-shift keying）、码率 3/4，每个符号 351 个数据比特，25.8 Mb/s。一个数据符号 12.8 µs，加上保护间隔共 13.6 µs。' },
    { heading: '编码方式（802.11be §36.3.13.3.3）', text: 'BCC 只用于不超过四条空间流、EHT-MCS 0 到 9 与 15、资源单元不大于 242 个子载波的情形；EHT-MCS 10 到 14 只能用 LDPC。两种编码的数据字段长度算法不同（§36.3.13）。' },
    { heading: '最低灵敏度与速率选择（802.11be 表 36-67，§10.6.1）', text: '标准为每一级规定最低接收灵敏度（sensitivity）：在这个输入电平上，4096 字节帧的误包率要低于 10%。20 MHz 时，QPSK 3/4 为 −77 dBm，16-QAM 1/2 为 −74 dBm，4096-QAM 5/6 为 −46 dBm。发送方用哪一级，标准不规定：§10.6.1 写明速率切换的算法不在标准范围之内。' },
    { heading: '确认帧的速率（§10.6.6.5.2，§17.1.1）', text: '用非 HT PPDU（PHY protocol data unit）发送的确认帧，速率取 BSSBasicRateSet 中不超过前一帧速率（对 EHT 帧是它的非 HT 参考速率，§10.6.11）的最高者；没有满足条件的速率时，取强制速率（mandatory rate）中不超过它的最高者。第 17 章 OFDM PHY 的强制速率是 6、12、24 Mb/s。' },
    { kind: 'steps', heading: '一次上传，按标准：逐步说明', items: [
      '介质空闲达到 DIFS 之后，笔记本从 [0, CW] 中抽取退避计数，每个空闲时隙减 1（§10.3.3，§10.3.4.3）。',
      '计数为 0 时，用它选定的等级发出数据帧；等级由实现选择（§10.6.1）。',
      '路由器在 SIFS 之后，按控制回应帧的速率规则回一个确认帧（§10.3.2.11，§10.6.6.5.2）。',
      'ACK 超时内没有收到确认帧：判定失败，CW 取下一个值，重新退避；尝试次数达到上限时丢弃这一帧（§10.3.4.4）。',
    ] },
    { heading: '标准不给出吞吐量公式', text: '标准不规定饱和吞吐量的计算方法。题面（c）用的不动点出自 Bianchi 的论文，是一个模型，不是标准内容。' },
  ],
  implementation: [
    { topic: '接入方式', standard: '支持服务质量（quality of service, QoS）的站点实现 HCF，其基于竞争的接入是增强型分布式信道接入（enhanced distributed channel access, EDCA）（§10.2.3.1，§10.2.3.2）；DCF 是基本接入方式（§10.3.4）', sim: '本课场景关掉了 EDCA、聚合与传输机会（transmit opportunity, TXOP），四台 Wi-Fi 7 设备都按 DCF 接入，数据帧是 24 字节帧头（MAC header）、不带 QoS 字段的普通数据帧，以便与 Bianchi 模型对照。实际的 Wi-Fi 7 设备用 EDCA 接入。', kind: 'differs' },
    { topic: '退避与重传上限', standard: 'CW 从 15 起每次失败取下一个值，到 1023 为止；最多 7 次尝试（§10.3.3，§10.3.4.4）', sim: '照此实现。', kind: 'faithful' },
    { topic: 'ACK 超时', standard: 'aSIFSTime + aSlotTime + aRxPHYStartDelay（§10.3.2.11）；aRxPHYStartDelay 取站点所支持的各 PHY 条款中最大的值（§6.7.4.4），HT、VHT、HE 都是 24 µs（表 19-25、表 21-28、表 27-61）', sim: '照此：四台都是 Wi-Fi 7 设备，ACK 超时为 16 + 9 + 24 = 49 µs。', kind: 'faithful' },
    { topic: '数据帧的时长', standard: 'EHT-MCS 13 只能用 LDPC（§36.3.13.3.3）；前导码（preamble）长度随 EHT-SIG 与 EHT-LTF 的个数变化；数据之后有包扩展（packet extension），TXTIME 取整到整微秒（§36.4.3，§6.7.6.2）', sim: '照此：一个空间流时前导码逐个字段相加为 51.2 µs；MCS 13 按 LDPC、MCS 2 按 BCC 的算法计算符号数 ⌈(16 + 8·L + N_tail) / 每符号比特数⌉（BCC 的 N_tail 为 6，LDPC 为 0）与填充（padding）因子 a；包扩展按表 36-61 取 4a µs，每个接收方声明 16 µs 的名义填充是本仿真器的取值；最后取整到整微秒。', kind: 'faithful' },
    { topic: '能用哪一级', standard: '标准只规定最低灵敏度，选级由实现决定（表 36-67，§10.6.1）', sim: '把表 36-67 的最低灵敏度换算成每一级所需的信干噪比（SINR），再要求信噪比（SNR）比它高 3 dB 余量，选满足条件的最高一级；第一帧就选定，之后由速率控制按成败升降。', kind: 'choice' },
    { topic: '路径损耗与墙', standard: '标准不涉及传播', sim: '路径损耗（path loss）取 46.7 + 30·log10(d) dB，一堵砖墙 12 dB。', kind: 'value' },
    { topic: '噪声地板', standard: '标准不规定', sim: '20 MHz 信道的噪声地板（noise floor）取 −93.99 dBm。', kind: 'value' },
    { topic: '确认帧的速率', standard: '取 BSSBasicRateSet 中、否则取强制速率中不超过前一帧参考速率的最高者（§10.6.6.5.2）', sim: '不建模 BSSBasicRateSet，直接取强制速率 6、12、24 Mb/s 中不超过数据帧非 HT 参考速率的最高者：MCS 13 之后是 24 Mb/s，MCS 2 之后是 12 Mb/s。', kind: 'value' },
    { topic: '传播时延与时钟', standard: '时隙的组成里包括空中传播时间 aAirPropagationTime（§10.3.7，图 10-25）', sim: '信号到达各处不需要时间，所有设备共用一个时钟，交换的每一段都是精确常数，所以这里能把一次交换算到 0.1 µs，真实测量做不到。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '读题面：先看平面图，不要运行',
      jump: 0,
      steps: [
        '载入本课场景，只读平面图：墙在哪里、四台设备各自位于什么位置。',
        '对照下面的题面与四个问题，按计划的顺序在纸上算完，再运行。',
      ],
      blocks: [
        { kind: 'table', heading: '题面', head: ['设备', '位置', '业务'], rows: [
          ['路由器', '(3, 4), 20 dBm', '只在有数据待发时发送'],
          ['书房笔记本', '(5, 4), 15 dBm', '饱和上传，1500 字节载荷（payload）'],
          ['客厅笔记本', '(14, 6), 15 dBm', '饱和上传，1500 字节载荷'],
          ['手机', '(4, 6), 15 dBm', '通话：每 20 ms 上行（uplink, UL）与下行（downlink, DL）各 200 字节'],
        ] },
        { kind: 'list', heading: '要预测的四件事', items: [
          '（a）每台笔记本到达路由器时有多强，以及经过这条路径之后仍可使用的最高等级。',
          '（b）一个数据帧在空口上多久，以及围绕它的整次交换持续多久。',
          '（c）两台饱和的发送方多久会在同一个时刻开始发送，以及它们合起来交付多少。',
          '（d）空口在两者之间如何分配，以及快的那台为慢的那台让出了多少。',
        ] },
        { kind: 'steps', heading: '你要执行的计划', items: [
          '先在编辑器里核实场景就是题面描述的配置：20 MHz、单流，没有优先级分类，不聚合帧，也没有预留的轮次。',
          '只看平面图，把（a）对两台上传设备各做一遍：距离、隔墙、到达电平、SNR，以及“要求加余量”仍不超过 SNR 的那一级。',
          '从各自的等级做（b）：每符号几个比特、1528 字节要几个符号、空口时间（airtime）、应答自己的速率，以及一次交换加上它后面那段等待。',
          '从两个交换时长做（c）和（d）：两个竞争者下的不动点、按两者平均算出的“通用交换”，以及每台上传设备最终占用的空口时间。',
          '到这一步才运行十秒，把每个预测写成一行：量、单位、数值，以及你要拿屏幕上哪个读数去核它。',
        ] },
      ],
      expect: '平面图上，书房笔记本离路由器 2.000 m，中间没有墙；客厅笔记本离路由器 11.180 m，中间隔一堵砖墙。四台设备都是 20 MHz、单流。',
      meaning: '场景关掉了 EDCA、聚合与 TXOP，四台设备都按 DCF 接入（②“接入方式”），所以四个问题都可以用纸笔回答。',
    },
    {
      heading: '（a）到达了多少，能用哪一级',
      steps: [
        '用路径损耗公式和砖墙的损耗算出两台笔记本的到达电平，减去噪声地板得到 SNR。',
        '逐级比较“所需 SINR + 3 dB”与 SNR，取仍不超过 SNR 的最高一级；再跳到第一个数据帧核对。',
      ],
      blocks: [
        { kind: 'table', heading: '（a）预测：到达了多少，能用哪一级', head: ['上传设备', '距离与隔墙', '路径损耗', '到达电平', 'SNR', '等级', '再上一级'], rows: [
          ['书房笔记本', '2.000 m，无墙', '55.73 dB', '−40.73 dBm', '53.26 dB', 'MCS 13, 172.1 Mb/s', '已是顶端'],
          ['客厅笔记本', '11.180 m，一堵砖墙', '78.15 dB', '−75.15 dBm', '18.84 dB', 'MCS 2, 25.8 Mb/s', '13.99 + 3 = 16.99 dB ✓ · 16.99 + 3 = 19.99 dB ✗'],
        ] },
      ],
      expect: '一条 20 MHz 信道上的噪声地板是 −93.99 dBm。书房笔记本到达 −40.73 dBm，用 MCS 13；客厅笔记本到达 −75.15 dBm、SNR 18.84 dB，用 MCS 2——两台的第一个数据帧就是这两级。',
      meaning: 'MCS 13 与 MCS 2 的调制与编码方式出自表 36-76（①）；“所需 SINR 加 3 dB 余量”是本仿真器的选级规则，路径损耗公式与砖墙损耗也是它的取值（②），标准把选级留给实现。',
    },
    {
      heading: '（b）一帧多长，一次交换多长',
      jump: 0,
      steps: [
        '按下式算出两台笔记本数据帧的符号数与空口时间，再加上 SIFS、确认帧与 DIFS。',
        '跳到第一个数据帧，从书房笔记本的色块步进到它后面的确认帧，核对间隙与长度。',
      ],
      blocks: [
        { kind: 'formula', heading: '（b）预测：先数符号，再算微秒', text: '符号数 = ⌈(16 + 8·L + N_tail) / 每符号比特数⌉        空口时间 = 前导码 + 符号数 × 13.6 µs + 包扩展，取整到整微秒', note: 'L 是实际在空口上传送的内容：1500 字节载荷（payload）、24 字节媒体访问控制（MAC）头、4 字节帧校验序列（FCS）——合计 1528 字节。16 是服务字段（SERVICE field）；N_tail 是 BCC 的 6 个尾比特（tail bits），MCS 13 只能用 LDPC，没有尾比特。前导码按 51.2 µs 计；包扩展取决于最后一个符号填到几分之几，这两帧分别是 4 µs 与 16 µs（②）。' },
        { kind: 'table', heading: '（b）预测：一帧与一次交换', head: ['上传设备', '每符号比特', '符号数', '数据帧', '它的应答', '交换，以及其后的 DIFS', '若发生碰撞'], rows: [
          ['书房笔记本', '2340', '⌈12240 / 2340⌉ = 6', '51.2 + 81.6 + 4 = 136.8，取整 137.0 µs', '24 Mb/s, 28 µs', '137.0 + 16 + 28 + 34 = 215.0 µs', '220.0 µs'],
          ['客厅笔记本', '351', '⌈12246 / 351⌉ = 35', '51.2 + 476 + 16 = 543.2，取整 544.0 µs', '12 Mb/s, 32 µs', '544.0 + 16 + 32 + 34 = 626.0 µs', '627.0 µs'],
        ] },
      ],
      expect: '书房笔记本的色块是 MCS 13、长 137.0 µs，客厅笔记本的是 MCS 2、长 544.0 µs。书房那一帧之后的间隙是 16 µs，确认帧 28 µs，其后还有 34 µs 的等待。快帧之后的确认帧是 24 Mb/s，慢帧之后是 12 Mb/s。',
      meaning: 'SIFS、DIFS、确认帧的速率规则、帧长的算法与 ACK 超时都照标准（①、②），只有包扩展所依据的名义填充是本仿真器的取值（②“数据帧的时长”）；发生碰撞时那一列按 ACK 超时取 49 µs 计。',
    },
    {
      heading: '（c）（d）两台饱和站点',
      jump: 3,
      steps: [
        '用窗口 16、倍增 6 次、最多 7 次尝试，解出两个竞争者的不动点，再按两次交换的平均算吞吐量。',
        '从两个数据帧的时长算出空口占比，以及书房笔记本独占时能交付多少。',
        '跳到第一次退避抽签，读一下它的窗口。',
      ],
      blocks: [
        { kind: 'table', heading: '（c）预测：两台饱和站点', head: ['量', '预测'], rows: [
          ['窗口、倍增、尝试', '16, 6, 7'],
          ['某个时隙里发送的概率', 'τ = 0.1046'],
          ['与对方发生碰撞的概率', 'p = 10.46 %'],
          ['一次通用的交换', '(215.0 + 626.0) / 2 = 420.5 µs'],
          ['两台合计', '24.806 Mb/s'],
          ['……各自', '12.403 Mb/s'],
        ] },
        { kind: 'table', heading: '（d）预测：份额与代价', head: ['量', '预测'], rows: [
          ['各自帧数', '相同'],
          ['空口占比，书房 / 客厅', '20.1 % / 79.9 %'],
          ['书房笔记本独占（交换 + 7.5 个时隙）', '12,000 比特 / 282.5 µs = 42.478 Mb/s'],
        ] },
      ],
      expect: '第一次退避抽签的窗口是 31：最初的两个数据帧在 0 时刻同时开始、发生碰撞，窗口已经加倍。这次抽签与帧的发送时长无关。',
      meaning: '窗口规则照标准（①“基本接入与退避”），碰撞概率只取决于竞争者个数与窗口，与速率、帧长无关；τ、p 与吞吐量出自 Bianchi 的论文模型，不是标准。',
    },
    {
      heading: '三个变体：先预测，再运行',
      more: [0, 1, 2],
      steps: [
        '对三个变体各做一遍（a）到（d），写下预测。',
        '四个量里，判断出哪两个几乎不变：书房笔记本搬到墙后，哪一项不变；加一台平板，哪一项不变。',
        '写完之后，再依次载入三个变体，把结果留到下一课批改。',
      ],
      blocks: [
        { kind: 'table', heading: '三个变体的预测', head: ['变体', '书房笔记本那条链路', '帧 / 交换', '碰撞概率', '交付'], rows: [
          ['书房笔记本搬到客厅', '9.000 m → −72.33 dBm, 21.66 dB, MCS 3', '423.0 / 501.0 µs', '10.46 %', '18.894 → 9.447 + 9.447 Mb/s'],
          ['多一台平板，就在路由器旁', 'MCS 13', '137.0 / 215.0 µs', '17.81 %', '28.638 Mb/s'],
          ['客厅笔记本离线', 'MCS 13', '137.0 / 215.0 µs', '没有碰撞对象', '42.478 Mb/s'],
        ] },
      ],
      expect: '搬到客厅后，书房笔记本改用 MCS 3，帧长 423.0 µs，碰撞概率仍是 10.46%；加一台平板，帧长仍是 137.0 µs，碰撞概率升到 17.81%；客厅笔记本离线，书房笔记本独占信道，预测 42.478 Mb/s。',
      meaning: '帧长只取决于一条链路（link）的等级（①的速率表与②的选级规则），碰撞概率只取决于竞争者个数（①的退避规则）——两者互不影响，这正是三个变体要你分开判断的两件事。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.4.2（基本接入）、§10.3.3 与 §10.3.4.3（退避）、§10.3.4.4（重传上限）、§10.3.2.11（确认过程与 ACK 超时）、§10.3.7 与式 10-6（DIFS、aAirPropagationTime）、表 17-24 与表 27-61（PHY 特性）、§10.2.3.1 与 §10.2.3.2（HCF 与 EDCA）、§10.6.1（速率切换算法不在标准范围之内）、§10.6.6.5.2 与 §17.1.1（确认帧的速率）。',
    'IEEE Std 802.11be-2024：表 36-76（242 个子载波资源单元上的 EHT-MCS）、§36.3.13.3.3（LDPC 是 EHT-MCS 10 到 14 唯一的编码方式）、表 36-67（最低接收灵敏度）。',
    'τ 与 p 背后的不动点出自 Bianchi 的《Performance analysis of the IEEE 802.11 distributed coordination function》（IEEE JSAC 18(3)，2000），是论文模型，代入的是本仿真器的窗口、倍增上限与重传上限。',
    '模型取值，列出来方便你质疑：路径损耗公式 46.7 + 30·log10(d)、砖墙 12 dB、每一级所需 SINR 之上再留 3 dB 余量，以及 20 MHz 信道 −93.99 dBm 的噪声地板。这四项都是本仿真器的取值，而非标准正文。',
  ],
  limits: [],
  scenario: () => projectFlat(),
  variants: projectVariants,
  jumps: projectJumps,
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '客厅笔记本的 SNR 是 18.84 dB，而 MCS 3 需要 16.99 dB。为什么预测仍然是 MCS 2？',
      options: [
        '这一代设备上没有 MCS 3 这一级',
        '本仿真器取用某一级要在其要求之上留 3 dB 余量，而 16.99 + 3 超过了 18.84',
        '那堵砖墙已经被算过两次了',
      ],
      answer: 1,
      explain: '本仿真器选用某一级要留余量，绝不在要求的边缘工作：13.99 + 3 不超过 18.84，16.99 + 3 超过了 18.84。标准本身不规定选级的方法。',
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
    {
      q: '题面里发生碰撞那一列用了 49 µs 的 ACK 超时。按标准，这个数从哪里来？',
      options: [
        'aSIFSTime + aSlotTime + aRxPHYStartDelay；Wi-Fi 7 设备支持 HT、VHT、HE 物理层，它们的 aRxPHYStartDelay 都是 24 µs',
        '标准直接规定 ACK 超时为 49 µs，各代相同',
        '它等于 DIFS 加 15 µs',
      ],
      answer: 0,
      explain: '§10.3.2.11 只给出式子；aRxPHYStartDelay 按 PHY 不同，§6.7.4.4 取站点所支持各条款中最大的值：只支持第 17 章的设备是 20 µs（ACK 超时 45 µs），Wi-Fi 7 设备是 24 µs。',
    },
  ],
}
