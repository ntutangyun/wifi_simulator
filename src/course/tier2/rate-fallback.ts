/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · How the sender climbs and falls.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says about choosing a
 * rate: the algorithm is out of scope (§10.6.1), the only hard rule is the receiver's supported
 * set (§10.6.5.8), an attempt fails by the acknowledgment procedure (§10.3.2.11, §10.23.2.2) and
 * is retransmitted (§10.23.2.12), and there is an optional MCS feedback (§26.13; 802.11be-2024
 * §35.19). ② what the engine does — an ARF-style two-down/ten-up rule, which is the
 * simulator's choice and a 1997 paper's algorithm, not the standard's. ③ three runs.
 *
 * The scene is still `rate`'s own builder with no variant, so the line in
 * tests/fixtures/lesson-hashes.json stays a copy of `rate`'s. Every figure printed below is
 * read back out of the lesson text in tests/course/rate-fallback.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, firstData, firstRetry, J } from '../lessonKit'
import { rateScenario } from '../wifiScenes'

/**
 * This run's first excursion that drops one rung and climbs straight back, to scale: the far
 * station's attempts 461 to 475 (counting from one), drawn from the start of the fourth-last
 * frame that was still at the ceiling. (2026-11-11, after W6: the run's very first excursion now
 * goes on down to MCS 0, so it is not the one-rung picture this figure draws.) Every span is a
 * `TX_START` of the base run, taken relative to the one at 494.209 ms; the two 'muted' ones are
 * the pair that went unanswered, and the rung lane underneath is when the working rung was 2,
 * 1 and 2 again.
 *
 * The gaps are real: they are the near station's own frames and the waiting
 * between them, which is why fifteen frames of 544–780 µs span 16.7 ms.
 *
 * It replaces nothing in prose — it replaces the reader's need to take the
 * worked table on trust. The table says two failures cost a rung and ten
 * successes buy it back; the figure is that sentence drawn from the records, and
 * the one thing it adds is how long the climb takes compared with the fall.
 */
export function fallbackExcursionTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '远端站点', spans: [
        { fromUs: 0, toUs: 544 },
        { fromUs: 931, toUs: 1475 },
        { fromUs: 1665, toUs: 2209, label: '这里连续丢失两帧', tone: 'muted' },
        { fromUs: 3145, toUs: 3689, tone: 'muted' },
        { fromUs: 4419, toUs: 5199, tone: 'accent' },
        { fromUs: 5882, toUs: 6662, tone: 'accent' },
        { fromUs: 6753, toUs: 7533, tone: 'accent' },
        { fromUs: 8440, toUs: 9220, tone: 'accent' },
        { fromUs: 9392, toUs: 10172, tone: 'accent' },
        { fromUs: 10290, toUs: 11070, tone: 'accent' },
        { fromUs: 11511, toUs: 12291, tone: 'accent' },
        { fromUs: 12929, toUs: 13709, tone: 'accent' },
        { fromUs: 14069, toUs: 14849, tone: 'accent' },
        { fromUs: 15209, toUs: 15989, tone: 'accent' },
        { fromUs: 16179, toUs: 16723 },
      ] },
      { label: '级别', spans: [
        { fromUs: 0, toUs: 4419, label: 'MCS 2' },
        { fromUs: 4419, toUs: 16179, label: 'MCS 1' },
        { fromUs: 16179, toUs: 16723, label: 'MCS 2' },
      ] },
    ],
    axis: { fromUs: 0, toUs: 17000, ticks: [0, 5000, 10000, 15000], unit: 'µs（0 为跌落前那一帧的起点）' },
  }
}

export const rateFallback: Lesson = {
  id: 'rate-fallback',
  module: 8,
  title: '速率回退——发送端如何降级、如何恢复',
  why: 'IEEE 802.11-2024 不规定发送端怎样选择速率：§10.6.1 明确说速率切换的算法不在标准范围之内，标准只要求所用的速率或调制与编码方式（modulation and coding scheme, MCS）是接收方声明支持的，并规定了一次发送怎样判为失败：发完一帧后在 ACK 超时（ACK timeout）之内没有收到答复，这次尝试（attempt）就失败了，随后退避（backoff）并重传（retry）。本仿真器在这些规定之上采用了一条文献中的简单规则（自动速率回退，ARF）：连续两次失败降一级，连续十次成功升一级，中间任何一次相反的结果都使计数清零，每次只调整一级。所以一次跌落最快也要十帧才能回到上限，回升途中再丢一帧就会持续更久。本课场景里，使远端站点（station, STA）降到上限以下的不是信号变弱，而是碰撞：两台站点的退避计数器在同一个时隙（slot time）减到零、同时开始发送，在接入点（access point, AP）处被解出的是较强的近端那一帧。帧变长也不会使它丢得更多：十个随机种子合计，三个级别上每次尝试的失败率几乎相同，因为其他站点的退避计数器在它发帧期间不递减，一次失败在两帧发出之前就已确定。',
  outcomes: [
    '说出标准对速率选择规定了什么、没有规定什么',
    '按本仿真器的回退规则逐帧推演，说出下一帧使用哪一级',
    '从日志里读出一次失败的两种形式，并说明本场景的失败为什么与帧长无关',
  ],
  terms: [
    { term: 'ARF', plain: '自动速率回退：Kamerman 与 Monteban 1997 年论文里的规则，本仿真器采用它的一种形式——连续两次失败降一级，连续十次成功升一级；不是标准的规定' },
    { term: 'excursion', plain: '跌落：一段以低于上限的级别发送的帧，从降级那一刻起，到回到上限为止' },
  ],
  needs: ['rate', 'anomaly'],
  standard: [
    { heading: '速率切换的算法不在标准范围之内（§10.6.1）', text: '多速率物理层（physical layer, PHY）允许实现者动态切换速率以改善性能。标准明确说明：速率切换的算法不在本标准范围之内；为了互通，标准只规定所有站点都要遵守的一组规则。' },
    { heading: '个别寻址的帧可以使用哪些速率（§10.6.5.8）', text: '个别寻址的数据帧（data frame）可以使用任何速率、MCS 或 <VHT-MCS, NSS> 组合，约束只有一类：不得使用接收方在它发出的帧（支持速率元素、支持 MCS 集合字段等）中未声明支持的速率或 MCS。具体选哪一个，由发送端决定。' },
    { heading: '一次发送怎样判为失败（§10.3.2.11，§10.23.2.2）', text: '发送一个需要立即确认的 MPDU（MAC protocol data unit）之后，站点从 PHY-TXEND.confirm 起等待一个超时间隔 aSIFSTime + aSlotTime + aRxPHYStartDelay。这段时间内没有出现 PHY-RXSTART.indication，这次发送即失败；出现了，就等对应的 PHY-RXEND.indication，收到的若不是来自接收方的那个答复，同样算失败。第 17 章物理层的这三个参数是 16 µs、9 µs 与 20 µs（表 17-24）；HE 物理层在 5 GHz 上是 16 µs、9 µs 与 24 µs（表 27-61），支持多个物理层的站点取其中最大的 aRxPHYStartDelay（§6.7.4.4）。' },
    { heading: '失败之后（§10.23.2.2，§10.23.2.12）', text: '发送失败时，站点调用退避过程，之后重传；每个 MSDU（MAC service data unit）有一个帧重传计数，每失败一次加一，重传帧的 Retry 子字段置 1。退避计数器只在介质（medium）空闲满仲裁帧间间隔（arbitration interframe space, AIFS）之后的时隙边界上递减（§10.23.2.4），介质忙时不递减。' },
    { heading: '可选的 MCS 反馈（§26.13；IEEE Std 802.11be-2024 §35.19）', text: '标准提供一种可选的链路（link）自适应反馈：请求方在 HE 变体 HT Control 字段的 HLA 控制子字段里置 MRQ，请对方回报建议的 MCS；对方也可以主动回报。EHT 站点用 ELA 控制子字段做同样的事。是否使用、怎样利用这项反馈，仍由实现决定。' },
    { kind: 'steps', heading: '一次单播发送，按标准：逐步说明', items: [
      '发送端从接收方声明支持的速率或 MCS 中选一个；选哪一个，标准不规定（§10.6.1，§10.6.5.8）。',
      '发送这一帧，从发送结束起等待 aSIFSTime + aSlotTime + aRxPHYStartDelay（§10.3.2.11）。',
      '这段时间内没有检测到任何帧的开始，这次发送失败；检测到了，就接收完那一帧再判断它是不是对应的答复。',
      '失败时调用退避过程，帧重传计数加一，重传帧的 Retry 子字段置 1（§10.23.2.2，§10.23.2.12）。',
      '下一次发送用哪一级，仍由发送端自己的算法决定；它可以参考对方回报的 MCS 反馈，也可以只看成败（§26.13）。',
    ] },
  ],
  implementation: [
    { topic: '速率选择算法', standard: '不在标准范围之内（§10.6.1）', sim: '只看每次尝试的成败：连续两次失败降一级，连续十次成功升一级；一次失败使成功计数清零，一次成功使失败计数清零，升降之后两个计数都归零；每次只调整一级，不跳级，没有随机性，也不另外发帧试探更高的级别。这是 Kamerman 与 Monteban 1997 年论文里的 ARF 规则的一种形式。', kind: 'choice' },
    { topic: '两个门限', standard: '标准未规定', sim: '降级 2 次、升级 10 次，是引擎的两个常数（rate.ts 的 FAILURES_TO_STEP_DOWN 与 SUCCESSES_TO_STEP_UP）；本课的每一个测量值都取决于它们。', kind: 'value' },
    { topic: '可用的级别与上限', standard: '只能使用接收方声明支持的速率或 MCS（§10.6.5.8）', sim: '每条链路有一个上限：静态链路表的平均信噪比（signal-to-noise ratio, SNR）减去 3 dB 之后仍满足的最高一级；各级所需的信噪比由最低输入灵敏度（sensitivity）表（IEEE Std 802.11be-2024 表 36-67）减去噪声得到。工作级别从上限开始，永不超过上限；本课远端站点的上限是 MCS 2。', kind: 'choice' },
    { topic: '失败的判定', standard: '超时间隔 aSIFSTime + aSlotTime + aRxPHYStartDelay；期间检测到帧的开始，就等它接收完再判断（§10.3.2.11，§10.23.2.2）', sim: '照此判定：这两台 Wi-Fi 7 站点支持 HT、VHT、HE 物理层，aRxPHYStartDelay 取其中最大的 24 µs，超时间隔 16 + 9 + 24，共 49 µs；超时与「接收完另一帧、其中没有答复」两种失败都计入回退规则。', kind: 'faithful' },
    { topic: '失败之后', standard: '调用退避过程并重传，帧重传计数加一（§10.23.2.2，§10.23.2.12）', sim: '照此重传；本课三秒内远端站点没有一帧因达到重传上限（retry limit）而被丢弃。', kind: 'faithful' },
    { topic: '介质忙时退避不递减', standard: '只在仲裁帧间间隔之后的空闲时隙边界上递减（§10.23.2.4）', sim: '照此处理：介质一变忙计数就停在当前值，空闲满间隔之后从原值继续；本课三秒内近端站点 2,553 次冻结，全部以冻结前的数值恢复。', kind: 'faithful' },
    { topic: '两帧重叠时的接收', standard: '标准未规定接收机怎样处理两帧重叠', sim: '先在无干扰条件下检测到的前导码（preamble），只要整帧期间信干噪比（signal-to-interference-plus-noise ratio, SINR）始终满足该级的要求就被解出。本场景近端站点在接入点处强得多，所以两帧同时开始时被解出的总是近端那一帧，丢失的只有远端那一帧。', kind: 'choice' },
    { topic: 'MCS 反馈', standard: '可选的 HLA／ELA 控制子字段：请求并回报建议的 MCS（§26.13；802.11be-2024 §35.19）', sim: '未实现：发送端不请求、也不接收任何 MCS 反馈，只依据有没有收到答复。', kind: 'absent' },
    { topic: '链路电平', standard: '标准不定义信道模型', sim: '本课场景没有打开时变链路（衰落），链路电平由几何位置与墙一次性确定，三秒内保持不变，所以这里的失败全部来自碰撞，没有一次来自链路变差。编辑器的「时变链路（衰落）」一节可以打开它，「衰落」那一课就在单链路上这样做。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一次跌落与回升',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一次 ACK 超时，然后沿远端站点的泳道向后看。',
        '找到第一处连续两次没有答复、随后十帧全部收到答复的位置（约 494 ms），数一数之后要经过多少帧方块才重新变短；对照下图与下表。',
      ],
      blocks: [
        { kind: 'diagram', heading: '本轮第一次只降一级的跌落，按记录等比例绘制', spec: fallbackExcursionTiming(), caption: '远端站点在上限上连续两帧没有收到答复，下一帧就降到 MCS 1：每帧从 544.0 µs 变为 780.0 µs。此后十帧全部收到答复，它才回到上限。中间的空隙是近端站点的帧和等待时间。' },
        { kind: 'table', heading: '一次降到最低一级的逐步过程', head: ['发生了什么', '之后的级别', '此时每帧时长'], rows: [
          ['在上限上，每帧都收到答复', 'MCS 2', '544.0 µs'],
          ['连续两次尝试没有答复', 'MCS 1', '780.0 µs'],
          ['再连续两次没有答复', 'MCS 0', '1,496.0 µs'],
          ['连续十次收到答复', 'MCS 1', '780.0 µs'],
          ['再连续十次收到答复', 'MCS 2', '544.0 µs'],
        ] },
      ],
      expect: '远端站点第 463 与第 464 次尝试连续没有答复，第 465 次以 MCS 1 发送，每帧从 544.0 µs 变为 780.0 µs；此后十帧全部收到答复，第 475 次回到 MCS 2。更早的第 135 与第 136 次也连续没有答复，那一次回升途中又丢了帧，一直降到 MCS 0。单独丢一帧时，下一帧的级别不变。',
      meaning: '两次降、十次升是本仿真器的取法与取值（②），标准不规定任何速率切换算法（①）。两帧失败降掉的一级，要连续成功十帧才能恢复。',
    },
    {
      heading: '三秒内的失败率与跌落',
      steps: [
        '载入本课场景，运行三秒。',
        '按级别统计远端站点的尝试次数与其中的失败次数，再数一数它降到上限以下几次、每次持续多少帧。',
      ],
      blocks: [
        { kind: 'table', heading: '远端站点的三秒：尝试次数与其中的失败次数', head: ['级别', '尝试次数', '失败次数', '每次尝试的失败率'], rows: [
          ['MCS 2——它的上限', '2,184', '247', '11.3%'],
          ['MCS 1', '609', '64', '10.5%'],
          ['MCS 0——最低一级', '87', '15', '17.2%'],
        ] },
        { kind: 'table', heading: '同样这三秒内，以低于上限的级别发送的情况', head: ['项目', '数值'], rows: [
          ['降到上限以下的次数', '30'],
          ['其中一直降到最低一级的', '3'],
          ['这三次各持续了多少帧', '10, 34, 43'],
          ['规则允许的最短回升', '10 帧'],
        ] },
      ],
      expect: '三个级别上每次尝试的失败率是 11.3%、10.5% 与 17.2%；最低一级只有 87 次尝试，一个种子的样本太少。十个种子合计，三级的失败率是 11.9%、12.2% 与 11.2%，几乎相同，最长的帧并不是失败最多的。30 次跌落里有 3 次降到最低一级，其中一次用了规则允许的最短十帧，另外两次因为回升途中又丢了帧而持续 34、43 帧。每一次级别变化都只相差一级。',
      meaning: '帧变长不会使失败变多，因为介质忙时其他站点的退避计数器不递减（①，§10.23.2.4；② 照此实现）：一次失败取决于两个计数器会不会在同一个时隙减到零，在两帧发出之前就已确定。',
    },
    {
      heading: '一次失败的两种形式',
      jump: 2,
      steps: [
        '跳到第一次重传，看它之前那一次尝试是以 ACK 超时记录结束的，还是在接收另一帧结束时判定的。',
        '统计三秒内远端站点的全部失败与其中的 ACK 超时记录，再看近端站点有没有 ACK 超时。',
      ],
      expect: '远端站点三秒内 326 次尝试失败：229 次以一条 ACK 超时记录结束，另外 97 次是在答复应到时它正在接收另一帧，接收完毕发现其中没有给自己的答复。近端站点三秒内发出 3,884 帧，没有一次 ACK 超时；时间轴上没有任何碰撞标记。',
      meaning: '两种形式正是 §10.3.2.11 的两个分支（①）：超时之内没有检测到帧的开始，或检测到了但收到的不是答复。近端站点从不失败，是本仿真器接收机的取法（②）：两帧同时开始时，接入点解出的总是较强的那一帧。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.6.1（速率切换的算法不在标准范围之内）、§10.6.5.8（个别寻址的数据帧只能使用接收方支持的速率或 MCS）、§10.3.2.11 与 §10.23.2.2（确认过程与发送失败的定义）、§10.23.2.12（重传过程）、§10.23.2.4（退避计数器只在空闲时隙边界递减）、表 17-24（aSIFSTime 16 µs、aSlotTime 9 µs、aRxPHYStartDelay 20 µs）、表 27-61（HE 的 aRxPHYStartDelay 24 µs）、§6.7.4.4（多个物理层时取最大的 aRxPHYStartDelay）、§26.13（HLA 链路自适应）；IEEE Std 802.11be-2024：§35.19（ELA 链路自适应）、表 36-67（最低输入灵敏度）。',
    '自动速率回退出自 Kamerman 与 Monteban 1997 年的 WaveLAN-II 论文，是一篇论文里的算法，不是标准的规定。',
    '本仿真器的取值与取法：两次降一级、十次升一级、上限留 3 dB、两帧重叠时先检测到的前导码在信干噪比满足要求时被解出、不实现 MCS 反馈。本课的每一个计数都可以用场景的随机种子复现。',
  ],
  limits: [],
  scenario: () => rateScenario(),
  jumps: [
    J('第一个数据帧', firstData),
    J('第一次 ACK 超时', (r) => r.type === 'ACK_TIMEOUT'),
    J('第一次重传', firstRetry),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '远端站点的信号没有变化，但它的级别降了两级。按本仿真器的规则，发生了什么？',
      options: [
        '上限本身降了两级',
        '连续四次尝试失败——第二次失败时降一级，第四次失败时又降一级',
        '接入点为了省电，要求它降低速率',
      ],
      answer: 1,
      explain: '连续两次失败降一级，而由静态链路表确定的上限本身不会改变。降两级，就是两组连续失败，共四次。',
    },
    {
      q: '远端站点在最低一级的帧，长度几乎是它 MCS 1 帧的两倍。这两者中，哪一种每次尝试更容易失败？',
      options: [
        '最低一级的——它们在空口上停留得更久，期间会有更多退避计数器来得及减到零',
        '如果一定要比较，十个种子合计是 MCS 1 的：12.2% 对 11.2%。决定每次尝试失败率的不是帧长',
        '两者完全一样——失败只取决于有多少台站点',
      ],
      answer: 1,
      explain: '十个种子合计的数几乎相同：11.9%、12.2%、11.2%。介质忙时其他站点的退避计数器不递减，所以一次失败取决于两个计数器会不会在同一时隙减到零，与帧的长度无关。',
    },
    {
      q: '「连续两次失败降一级、连续十次成功升一级」出自哪里？',
      options: [
        'IEEE 802.11-2024 §10.6 规定的速率切换算法',
        '标准不规定速率切换算法；这是本仿真器采用的取法，出自一篇 1997 年的论文',
        'HLA 控制子字段里的 MCS 反馈',
      ],
      answer: 1,
      explain: '§10.6.1 说明速率切换的算法不在标准范围之内，标准只要求使用接收方支持的速率；本仿真器不实现 MCS 反馈。',
    },
  ],
}
