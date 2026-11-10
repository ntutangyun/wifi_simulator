/**
 * Wi-Fi Tier 1 · M6 · The prediction against the run — second half.
 *
 * The close-in run, where the same two equations that were within a few per cent on the arc are
 * out by a factor of five, and the culprit is not contention. It loads `bianchi-vs-sim`'s own
 * scene and its two variants — the same builder, the same array — so the two ids replay to the
 * same recorded timeline hashes and the split costs the reader nothing.
 *
 * Standard-first shape (2026-11-11), after the lesson audit against IEEE Std 802.11-2024:
 * ① says what the standard fixes for one unicast exchange — the backoff (§10.3.3), the retry
 * limit (§10.3.4.4), the acknowledgment procedure and its timeout (§10.3.2.11), the timing
 * constants (Table 17-24), the control response rate (§10.6.6.5.2) — and, the point of the
 * lesson, that the rate-switching algorithm is outside it (§10.6.1). ② says the engine's
 * two-failures-down / ten-successes-up rule is its own choice, and that capture never fires in
 * this scene. ③ walks the diagnosis: the collision rate agrees with the model, the rate histogram
 * does not, and repricing T_s with the run's own mean data time (1723.7 µs instead of 248) puts
 * the model at 5.547 Mb/s against a measured 5.534 — 0.24 % apart, with no fitted constant.
 * The Bianchi model is a paper (IEEE JSAC 2000), never presented as the standard.
 *
 * Every figure is read back out of this file and compared with a run in
 * tests/course/rate-vs-model.test.ts.
 */
import { type Lesson } from '../lessonKit'
import { bianchiScenario } from './bianchi'
import { bianchiVsSimJumps, bianchiVsSimVariants } from './bianchi-vs-sim'

export const rateVsModel: Lesson = {
  id: 'rate-vs-model',
  module: 5,
  title: '移到近处：吞吐量的损失来自速率降档',
  why: '把上一课的五台站点（station, STA）从三米的圆弧移到接入点（access point, AP）近旁，链路（link）速率立即提高到九倍，而理论计算给出的吞吐量应为 29.5 Mb/s。实测只有 5.5。接入规则没有任何一条失效，方程也没有任何错误——错的是方程中一帧的空口时间（airtime）。实测的碰撞比例与预测几乎相同，所以竞争不是原因，原因在速率。IEEE 802.11 标准只规定发送方凭确认帧（acknowledgement, ACK）是否到达判定成败，速率怎样切换则完全留给实现；本仿真器的速率控制在连续失败之后降档，而失败本身不带原因，它无法区分“与其他站点发生碰撞”和“信号变弱”。速率降得越低帧越长，帧越长越容易发生碰撞，于是再次降档。结果这条链路明明能够支持最快的一级，这一级却几乎没有被使用，三分之二的帧降到最慢的一级，一帧的平均空口时间达到模型假设值的七倍。只把方程中的帧长换成实测的平均值，其余几项不变，预测就与实测吻合，只相差千分之二左右。这不是拟合：帧长本来就是模型需要的输入，它原先使用的是一个错误的值，这里没有新增任何自由参数。',
  outcomes: [
    '说出标准对一次单播交换规定了什么、没有规定什么：成败怎样判定，速率怎样选择',
    '用两个碰撞数据判断“竞争”是否是原因，再用一张速率直方图把损失的吞吐量归因于真正的机制',
    '用实测的平均帧长替换模型中的假设值，并说明这为什么不是拟合',
  ],
  needs: ['bianchi-vs-sim', 'anomaly'],
  terms: [
    { term: 'rate control', plain: '发送方选择数据速率的算法；标准不规定它，本仿真器的算法在帧连续失败之后降到更慢、更稳健的一级' },
    { term: 'CARA', plain: '碰撞感知速率自适应：降档之前先用一个短帧试探，以免把碰撞误判为衰落；出自论文，不是标准' },
  ],
  standard: [
    { heading: '成败只凭确认帧判定（§10.3.2.11，§10.3.4.4）', text: '下文的短帧间间隔（short interframe space, SIFS）、时隙（slot time）等时间参数由物理层（physical layer, PHY）规定，参数名写作 aSIFSTime、aSlotTime。发送方发出一个需要立即确认的数据帧（data frame）后，从发送结束起等待一个 ACK 超时（ACK timeout），长度为 aSIFSTime + aSlotTime + aRxPHYStartDelay。这段时间里没有开始接收到帧，发送方就判定这次发送失败，并启动退避（backoff）过程。§10.3.4.4 列举了失败的可能原因——与其他发送相撞、信道受到干扰等——但确认过程给发送方的只有“失败”这一个结论，不附带原因。' },
    { heading: '退避与重试（§10.3.3，§10.3.4.4）', text: '退避计数在 0 到竞争窗口（contention window, CW）之间均匀抽取，即 [0, CW]。CW 的取值依次是 2 的整数次幂减 1，从 aCWmin 开始，到 aCWmax 为止：每次发送失败使重试计数加 1，CW 随之取下一个值，到 aCWmax 后保持不变；发送成功，或重试计数达到 dot11ShortRetryLimit 时，CW 回到 aCWmin。同一帧的尝试次数达到 dot11ShortRetryLimit（默认值 7，见附录 C）——这就是重传上限（retry limit）——或超过帧的生存期（MSDU lifetime）时，停止重传（retry），丢弃这一帧。' },
    { heading: '时间参数（表 17-24，式 10-6）', text: '第 17 章正交频分复用（orthogonal frequency-division multiplexing, OFDM）PHY 在 20 MHz 信道上：aSlotTime 为 9 µs，aSIFSTime 为 16 µs，aRxPHYStartDelay 为 20 µs，aCWmin 为 15，aCWmax 为 1023。分布式帧间间隔（DCF interframe space, DIFS）= aSIFSTime + 2 × aSlotTime = 34 µs；ACK 超时 = 16 + 9 + 20 = 45 µs。' },
    { heading: '速率由实现选择（§10.6.1，§10.6.5.8）', text: '§10.6.1 明确写道，执行速率切换的算法不在本标准范围之内；§10.6.5.8 规定，单播数据帧可以使用接收方支持的任何速率。什么时候降档、什么时候升档、依据什么判断，标准都没有规定。' },
    { heading: '确认帧的速率（§10.6.6.5.2，§17.1.1）', text: '用非 HT PPDU（PHY protocol data unit）发送的确认帧，速率取 BSSBasicRateSet 中不超过前一帧速率的最高者；没有满足条件的速率时，取 PHY 的强制速率（mandatory rate）中不超过前一帧速率的最高者。第 17 章 OFDM PHY 的强制速率是 6、12、24 Mb/s。' },
    { kind: 'steps', heading: '一次单播数据帧的发送，按标准：逐步说明', items: [
      '介质（medium）空闲达到 DIFS 之后，发送方从 [0, CW] 中抽取退避计数；收到的上一帧有错时，等待的是扩展帧间间隔（extended interframe space, EIFS）而不是 DIFS（§10.3.3）。',
      '每经过一个空闲的时隙，计数减 1；计数为 0 时开始发送（§10.3.4.3）。',
      '数据帧的速率由发送方的实现选择，只要接收方支持即可（§10.6.5.8）。',
      '接收方在 SIFS 之后回一个确认帧，速率按控制回应帧的规则选取（§10.3.2.11，§10.6.6.5.2）。',
      'ACK 超时内没有收到确认帧：判定失败，重试计数加 1，CW 取下一个值，重新退避（§10.3.4.4，§10.3.3）。',
      '收到确认帧，或尝试次数达到 dot11ShortRetryLimit 而丢弃这一帧：CW 回到 aCWmin（§10.3.3）。',
    ] },
    { heading: '标准不给出吞吐量公式', text: '以上是标准规定的过程。标准不规定饱和吞吐量的计算方法；本课用来预测的 Bianchi 模型出自论文，不是标准内容。' },
  ],
  implementation: [
    { topic: '退避与竞争窗口', standard: '[0, CW] 上均匀抽取；CW 从 15 起每次失败取下一个值，到 1023 为止（§10.3.3，表 17-24）', sim: '照此实现：CW 依次为 15、31、63……1023，发送成功后回到 15。', kind: 'faithful' },
    { topic: '重传上限', standard: '尝试次数达到 dot11ShortRetryLimit 或超过生存期即丢弃（§10.3.4.4）；dot11ShortRetryLimit 默认 7（附录 C）', sim: '上限取默认值 7。本课场景把帧的生存期设为 10 分钟，使五台站点在整个运行中保持饱和。', kind: 'value' },
    { topic: '时间参数', standard: 'aSlotTime 9 µs、aSIFSTime 16 µs、DIFS 34 µs、ACK 超时 45 µs（表 17-24，式 10-6，§10.3.2.11）', sim: '照此取值。', kind: 'faithful' },
    { topic: '失败的判定', standard: 'ACK 超时内没有收到确认帧即失败，不附带原因（§10.3.2.11）', sim: '照此判定：一次没有收到确认帧就是一次失败；引擎既不检查接收方是否收到了出错的帧，也不发送用于试探的短帧。', kind: 'faithful' },
    { topic: '速率选择算法', standard: '不在标准范围之内（§10.6.1）', sim: '同一个对端连续两次失败降一档，连续十次成功升一档，任何一次成功都把失败计数清零；不超过按到达电平查出的上限（rate.ts 的 RateControl）。真实驱动常用的 Minstrel 一类算法按一段时间内的实测吞吐量对候选速率排序；CARA、RRAA 这类碰撞感知方案先区分碰撞与衰落再降档。这些本仿真器都没有实现，所以这里的正反馈比采用这些算法的真实设备更强。', kind: 'choice' },
    { topic: '速率上限', standard: '标准只给出每一级的最低接收灵敏度（sensitivity）：1000 字节的帧误包率不超过 10%（§17.3.10.2，表 17-21）', sim: '到达电平比某一级的最低灵敏度高 3 dB 以上，才把这一级列入可用范围。本课近处每条链路到达 −36.215 dBm，上限为 54 Mb/s。', kind: 'choice' },
    { topic: '确认帧的速率', standard: '取 BSSBasicRateSet 中、否则取强制速率中不超过前一帧速率的最高者（§10.6.6.5.2）', sim: '不建模 BSSBasicRateSet，直接取强制速率 6、12、24 Mb/s 中不超过数据帧速率的最高者，相当于把基本速率集设为这三档。', kind: 'value' },
    { topic: '两帧重叠时的接收', standard: '标准不规定接收机怎样处理重叠的帧', sim: '后到的前导码（preamble）比正在接收的帧强 5 dB 以上才改为接收它；前导码比其余信号之和高 4 dB 才被检测到。本课五台站点到达接入点的电平完全相同（−36.215 dBm），两条门限都不会触发：十秒内接入点 1635 次“错失”，恰好对应 1635 次重传，所以重传比例就是碰撞比例。', kind: 'value' },
    { topic: '链路电平', standard: '标准不涉及信道', sim: '本课场景没有打开衰落，链路电平不随时间变化，所以这里的每一次降档都由碰撞引起。编辑器的「时变链路（衰落）」一节可以打开电平起伏，那时速率直方图就不再只反映单一原因。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '近处的五台站点：预测与实测相差五倍',
      jump: 1,
      more: [0],
      steps: [
        '载入本课场景，运行十秒，读出碰撞比例与吞吐量。',
        '再载入「n = 5 在圆弧上（速率固定为 6 Mb/s）」运行十秒，与下表对照。',
      ],
      blocks: [
        { kind: 'formula', heading: 'Bianchi 模型（论文，不是标准）', text: 'S = P_s·P_tr·L / [(1 − P_tr)·σ + P_tr·P_s·T_s + P_tr·(1 − P_s)·T_c]\nT_s = 数据帧 + SIFS + 确认帧 + DIFS        T_c = 数据帧 + ACK 超时 + DIFS', note: 'τ 与 p 由不动点解出（W = 16，m = 6，最多 7 次尝试）：n = 5 时 τ = 0.0763，p = 27.22%。模型假设每一帧都用同一个速率，T_s 中的数据帧按 54 Mb/s 的 248 µs 计。' },
        { kind: 'table', heading: '同样的五台站点移到近处', head: ['近处实测', '圆弧上', '预测'], rows: [
          ['碰撞：26.17 %', '25.84 %', '27.22 %'],
          ['吞吐：5.534 Mb/s', '4.717 Mb/s', '29.52 Mb/s'],
          ['平均帧长：1723.7 µs', '2064 µs', '按假设 248 µs'],
          ['以最慢速率发出的帧：67.7 %', '100 %', '按假设为零'],
        ] },
      ],
      expect: '近处的碰撞比例是 26.17%，预测是 27.22%，比圆弧上的 25.84% 还接近；吞吐量却只有 5.534 Mb/s，而模型给出 29.52 Mb/s，相差五倍以上。',
      meaning: '碰撞比例只由接入规则决定，本仿真器的退避与重传照标准实现（②），所以这一项与模型吻合，竞争不是原因。接入点的“错失”数等于重传数（②“两帧重叠时的接收”），这一比较才成立。',
    },
    {
      heading: '色块的长度在变：速率在降档',
      jump: 0,
      more: [0],
      steps: [
        '跳到第一个数据帧，向后查看绿色色块：开头几帧都是 248 µs，即 54 Mb/s。',
        '找到第一帧降档的帧，此后色块在 248 µs、704 µs、2064 µs 等长度之间变化。',
        '切换到圆弧变体，再看一遍色块。',
      ],
      expect: '7.661 ms 处出现第一帧降档的帧，此后速率再也没有长时间回到最快一级；最快一级 248 µs，最慢一级 2064 µs。圆弧上每个色块都是 2064 µs。',
      meaning: '降档的规则是本仿真器的取法（②“速率选择算法”），标准只规定速率由实现选择（①）。圆弧场景的电平已在最低一级，无档可降，所以模型的固定速率假设在那里成立。',
    },
    {
      heading: '一张速率直方图',
      steps: [
        '在基础场景的十秒日志里，把全部数据帧按数据速率分组计数。',
        '对照下表，找出链路支持的上限与实际用得最多的一级。',
      ],
      blocks: [
        { kind: 'table', heading: '这十秒内 6248 帧在各速率档位上的分布', head: ['数据速率', '帧数', '占比', '每帧时长'], rows: [
          ['54 Mb/s（链路的上限）', '69', '1.1 %', '248 µs'],
          ['48 Mb/s', '96', '1.5 %', '276 µs'],
          ['36 Mb/s', '163', '2.6 %', '364 µs'],
          ['24 Mb/s', '136', '2.2 %', '532 µs'],
          ['18 Mb/s', '165', '2.6 %', '704 µs'],
          ['12 Mb/s', '518', '8.3 %', '1044 µs'],
          ['9 Mb/s', '869', '13.9 %', '1384 µs'],
          ['6 Mb/s（最慢的一级）', '4232', '67.7 %', '2064 µs'],
        ] },
      ],
      expect: '这条链路的信噪比（SNR）为 57.8 dB，足以支持 54 Mb/s，但只有 1.1% 的帧使用了这一级；三分之二的帧降到了最慢的一级。',
      meaning: '链路电平不随时间变化（②“链路电平”），每一次降档都由碰撞引起。确认过程只给出“失败”，不附带原因（①），本仿真器的速率控制按失败次数降档（②），于是把碰撞当成了信号变弱。',
    },
    {
      heading: '换上实测的平均帧长，再算一次',
      steps: [
        '从日志取出全部数据帧的空口时间之和与帧数，算出平均帧长。',
        '把它代入 T_s 与 T_c，其余三项——SIFS、按 6 Mb/s 发送的 44 µs 确认帧、DIFS——不变，τ 仍取 0.0763，再算一次 S。',
      ],
      blocks: [
        { kind: 'table', heading: '只换一个输入', head: ['量', '按假设', '换上实测帧长'], rows: [
          ['数据帧的空口时间', '248 µs', '1723.7 µs'],
          ['预测吞吐量', '29.52 Mb/s', '5.547 Mb/s'],
          ['与实测 5.534 Mb/s 相差', '五倍以上', '0.24 %'],
        ] },
      ],
      expect: '实测的平均帧长是 1723.7 µs，约为模型假设的 248 µs 的七倍；换上它，模型给出 5.547 Mb/s，实测是 5.534——相差 0.24%。',
      meaning: '这不是拟合：帧长本来就是模型需要的输入，原先用的是一个错误的值，这里没有新增任何自由参数，剩下的 0.24% 才是真正的残差。五倍的差距来自本仿真器的速率控制造成的帧变长（②），接入规则本身没有偏差（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.2.11（确认过程与 ACK 超时）、§10.3.3 与 §10.3.4.3（退避）、§10.3.4.4（重传上限与丢弃）、§10.3.7 式 10-6（DIFS）、表 17-24（aSlotTime、aSIFSTime、aRxPHYStartDelay、aCWmin、aCWmax）、§10.6.1 与 §10.6.5.8（速率由实现选择）、§10.6.6.5.2 与 §17.1.1（确认帧的速率与强制速率）、§17.3.10.2 与表 17-21（最低接收灵敏度）、附录 C 的 dot11ShortRetryLimit（默认 7）。',
    'Bianchi 模型出自 G. Bianchi，《Performance analysis of the IEEE 802.11 distributed coordination function》，IEEE JSAC 18(3)，2000——论文，不是标准。碰撞感知速率方案是 CARA（Kim 等，INFOCOM 2006）与 RRAA（Wong 等，MobiCom 2006），同样是论文。',
    '本仿真器的取值与取法：两次失败降一档、十次成功升一档、3 dB 的速率余量、5 dB 的捕获（capture effect）门限与 4 dB 的前导码检测门限。15 dBm 的近处场景、种子 7、十秒采样窗口，上面每一个计数与平均值都可由场景自己的种子复现。',
  ],
  limits: [],
  scenario: () => bianchiScenario(5, { near: true }),
  variants: bianchiVsSimVariants,
  jumps: bianchiVsSimJumps,
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '近处实测只交付了预测值的约五分之一。哪一项测量能最快定位原因？',
      options: [
        '有多少帧最终被放弃了',
        '实际发出的帧在各数据速率上的分布',
        '各站点的队列（queue）深度',
      ],
      answer: 1,
      explain: '实测的碰撞比例已经与预测吻合，所以竞争不是原因。速率分布用一张直方图就揭示了机制：只有 1.1% 的帧使用了链路支持的最高速率。',
    },
    {
      q: '把 T_s 里的帧长换成实测的 1723.7 µs，预测就落到 5.547 Mb/s。为什么这不算“调整参数”？',
      options: [
        '因为还剩 0.24% 的差距，没有完全重合',
        '因为帧长本来就是模型需要的输入，而它原先使用的是一个错误的值；没有新增任何自由度',
        '因为实测值总是比假设值更可信',
      ],
      answer: 1,
      explain: '拟合会引入一个自由参数去逼近曲线；这里没有新参数，只是代入了一个本应由测量提供的输入。剩下的 0.24% 才是残差。',
    },
    {
      q: '本课的降档规则——同一对端连续两次失败降一档——出自哪里？',
      options: [
        'IEEE 802.11 标准 §10.6.1',
        '本仿真器自己的取法；标准写明速率切换的算法不在标准范围之内',
        'Bianchi 的论文',
      ],
      answer: 1,
      explain: '§10.6.1 只要求所有站点遵守速率选择的若干规则，切换算法留给实现。两次失败降档、十次成功升档是本仿真器的选择。',
    },
  ],
}
