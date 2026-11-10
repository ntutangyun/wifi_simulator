/**
 * Wi-Fi Tier 1 · M6 · The prediction against the run — first half.
 *
 * Standard-first shape (① standard → ② this simulator → ③ hands-on), converted
 * on 2026-11-11. ① is what IEEE Std 802.11-2024 says about the three places the
 * run and the model part company — what a sender can count (a missing response,
 * §10.3.2.11 / §10.3.4.3), the frozen counter (§10.3.4.3) and the EIFS after a
 * frame that was detected but not received (§10.3.3, §10.3.7 Eq. (10-7)) — and
 * that the standard gives no performance formula. The model is the previous
 * lesson's paper; ③ labels it so.
 *
 * The close-in run, where the prediction misses by a factor of five and the
 * culprit is rate control, is the second half, `rate-vs-model.ts`, which loads
 * this scene and these variants, so the two ids replay to the same recorded
 * hashes. Both halves put every station at the SAME distance from the access
 * point, so capture never happens and the access point's RX_MISS count equals
 * the RETRY count exactly; that is what makes the comparison legitimate.
 *
 * Dropped in the conversion: the 47.9 % of the old slot-clock probe (a one-off
 * patched MAC, never pinned, so no longer printed — the lesson now states only
 * the direction of that difference), and the CW = 0 tamper corner, which is
 * `edca-tamper`'s subject. Every figure printed below is read back out of the
 * text and compared with a run in tests/course/bianchi-vs-sim.test.ts.
 */
import { J, firstCollision, firstData, firstRetry, type Lesson, type LessonVariant } from '../lessonKit'
import { bianchiScenario, nLabel } from './bianchi'

/**
 * The two variants both halves of this scene list, in this order. The second half
 * reuses this array rather than rebuilding it, so the two ids replay to the same
 * recorded timeline hashes, variant for variant.
 */
export const bianchiVsSimVariants: LessonVariant[] = [
  { label: 'n = 5 在圆弧上（速率固定为 6 Mb/s）', scenario: () => bianchiScenario(5) },
  { label: nLabel(20), scenario: () => bianchiScenario(20) },
]

/** The four jumps both halves offer over that same run. */
export const bianchiVsSimJumps = [
  J('第一个数据帧', firstData),
  J('第一次碰撞', firstCollision),
  J('第一次重传', firstRetry),
  J('第一次 CW 翻倍', (r) => r.type === 'CW_CHANGE' && r.cw > 15),
]

export const bianchiVsSim: Lesson = {
  id: 'bianchi-vs-sim',
  module: 5,
  title: '预测与实测的对照',
  why: '一个预测，只有在知道它从何处开始失效之后才真正有用。把论文模型的计算结果与实测结果并列，两者永远不会完全吻合——接下来如何处理，正是工程师与“只会套用表格的人”的区别。先要确认统计的是同一个量：按 IEEE 802.11-2024，发送方只能知道 ACK 超时（ACK timeout）之内没有收到应答，无从得知是否发生了碰撞；在圆弧上，每台站点（STA）到接入点（AP）的电平相同，接收端无法检出任何一个重叠的帧，于是重传（retry）数恰好等于碰撞数，可以直接与模型的碰撞概率比较。结果是：在没有任何拟合参数的情况下，碰撞比例都落在预测值的一成以内，吞吐量在百分之五以内；但从五台起，实测的碰撞总比预测少，偏差每次都在同一方向，所以是可以解释的。几个原因都出自标准规定、而模型没有写进去的细节：其他站点发送时，标准规定等待中的计数器停止递减，论文的链却让它在每个忙周期减一；检出了重叠的帧却没能正确接收的邻居要等待扩展帧间间隔（extended interframe space, EIFS），什么也没有检出的邻居只等待分布式帧间间隔（DCF interframe space, DIFS）；一次碰撞比一次成功早结束 15 µs。加总之后，站点较多时仍有一部分无法解释，这就是残差；如实报告它本身就是一个结果，而调整一个常数使曲线重合则不是。两台那一行的偏差符号相反：只有一台竞争者时，模型对其余站点取平均的方法无法成立。',
  outcomes: [
    '说出标准让发送方统计的是什么，以及它在什么条件下才等于模型的碰撞概率',
    '先明确正在统计的量——这就是估计量——再核对它是否就是模型真正定义的那个量',
    '列出标准规定而模型没有的几处细节，并如实报告无法解释的那一部分——残差',
  ],
  needs: ['bianchi', 'anomaly'],
  terms: [
    { term: 'capture', plain: '捕获效应（capture effect）：接收机一旦锁定某个前导码就保持锁定，只有遇到明显更强的前导码时才转而与之同步，于是较强的那一帧仍被正确接收' },
    { term: 'residual', plain: '计入已找到的所有原因之后，偏差中仍无法解释的那一部分' },
  ],
  standard: [
    { heading: '发送方能统计什么（§10.3.2.11，§10.3.4.3）', text: '发送方发出数据帧（data frame）之后等待一个 ACK 超时；期限内物理层（physical layer, PHY）没有报告开始接收，就断定发送失败。标准把失败定义为没有收到被寻址站点的控制响应帧，不区分原因：碰撞、干扰或信号太弱都是同一种失败。所以发送方能统计的是失败次数，而不是碰撞次数。' },
    { heading: '其他站点发送时（§10.3.4.3）', text: '退避（backoff）时隙（slot time）内任何时刻介质（medium）忙，这个时隙的计数不减；介质再空闲一个 DIFS（或 EIFS）再加一个 aSlotTime 之后，计数才继续递减。也就是说，整个忙周期里计数保持不变。' },
    { heading: '没能正确接收之后的等待（§10.3.3，§10.3.7 式 (10-7)）', text: '介质最近一次由忙变闲，是因为检出的一帧没有被正确接收，站点就等待 EIFS 而不是 DIFS。EIFS = aSIFSTime + AckTxTime + DIFS，AckTxTime 是以物理层最低强制速率（mandatory rate）发送一个确认帧（acknowledgement, ACK）所需的时间；在 20 MHz 的正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层上为 16 + 44 + 34 = 94 µs，而 DIFS 是 34 µs。' },
    { heading: '失败之后从何时开始退避（§10.3.4.3）', text: '发送成功时，退避从确认帧结束时开始；发送失败时，退避从 ACK 超时结束时开始。' },
    { kind: 'steps', heading: '两台站点发生碰撞之后，按标准：逐步说明', items: [
      '两台站点在同一个时隙结束退避，同时发送。',
      '发送的两台各自等待 ACK 超时；期限内没有开始接收，各自判定失败，从 ACK 超时结束时开始退避（§10.3.2.11，§10.3.4.3）。',
      '检出了其中一帧、却没能正确接收的邻居，等介质空闲 EIFS 之后才继续递减（§10.3.3）。',
      '什么也没有检出的邻居只等待 DIFS（§10.3.3）。',
      '在整个忙周期里，所有等待中的站点计数保持不变（§10.3.4.3）。',
    ] },
  ],
  implementation: [
    { topic: '失败的判据', standard: 'ACK 超时之内没有开始接收（§10.3.2.11）', sim: '照此：发送方写一条重传记录。本仿真器不计算帧校验序列（frame check sequence, FCS），接收端能否正确接收只按信干噪比（signal-to-interference-plus-noise ratio, SINR）判定。', kind: 'faithful' },
    { topic: '两帧重叠时', standard: '标准不规定接收机的判决', sim: '前导码（preamble）的信干噪比不足 4 dB 时不能检出，第二个前导码强 5 dB 以上时才转而接收它。圆弧上各站点到达接入点的电平完全相同，所以重叠的帧一个也检不出：接入点一侧记录错失，而不是接收失败，错失数与重传数完全相等。', kind: 'value' },
    { topic: '忙时停止递减', standard: '整个忙周期计数保持不变（§10.3.4.3）', sim: '照此。论文的链却在每个忙周期让计数减一，这是模型与标准的差别，不是本仿真器与标准的差别。', kind: 'faithful' },
    { topic: 'EIFS', standard: 'aSIFSTime + AckTxTime + DIFS（§10.3.7 式 (10-7)）', sim: '照此取 94 µs；检出了一帧却没能正确接收的站点下一次等待 EIFS。', kind: 'faithful' },
    { topic: '失败之后的等待', standard: '从 ACK 超时结束时开始退避（§10.3.4.3）', sim: '照此：碰撞的代价是数据帧 + 45 µs 的 ACK 超时 + DIFS，比一次成功短 15 µs。论文取数据帧 + DIFS。', kind: 'faithful' },
    { topic: '速率', standard: '标准未规定调整方法（§10.6.5.8）', sim: '没有固定速率的开关，速率控制始终在运行；圆弧把站点放在只够 6 Mb/s 的位置，速率因此不变。基准场景是一米圆上的五台站点，速率可以变化，那是下一课的内容。', kind: 'choice' },
    { topic: '时钟与传播', standard: 'aSlotTime = aCCATime + aMACProcessingDelay + aRxTxTurnaroundTime + aAirPropagationTime，其中包含空中传播时间（§10.3.7 式 (10-3)）', sim: '全场共用一个时钟，发射到达各处不需要时间，所以各站点的时隙边界完全对齐，「同一个时隙内同时发送」是一个精确的事件。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '圆弧上没有捕获',
      variant: 0,
      jump: 1,
      more: [1],
      steps: [
        '载入「n = 5 在圆弧上（速率固定为 6 Mb/s）」，跳到第一次碰撞，看接入点一侧记录的是错失还是接收失败。',
        '运行十秒，比较接入点的错失记录数与各站点的重传记录数；再对「n = 20 台站点」做一遍。',
      ],
      expect: '五台站点的圆弧上，十秒内接入点记录 1370 次错失，各站点共 1370 次重传；二十台站点是 2840 对 2840。接入点一次接收失败也没有，正确接收的帧数与它发出的确认帧数相同。',
      meaning: '标准让发送方统计的是失败（①）。只有在没有捕获、也没有其他失败原因时，失败数才等于碰撞数；这是场景布置的结果（②），换一个各站点强弱悬殊的户型就不再成立。',
    },
    {
      heading: '预测与十秒实测',
      variant: 0,
      more: [1],
      steps: [
        '按同一个方法统计四种站点数：数据帧的发送次数为尝试，重传记录数为失败，确认帧数乘以 12,000 比特再除以十秒为吞吐。2 台与 10 台的圆弧在上一课的变体里。',
        '模型的输入只取自场景与标准：n、W = 16、m = 6、L = 7，一次成功与一次碰撞按 6 Mb/s 计算。',
      ],
      blocks: [
        { kind: 'table', heading: '圆弧场景：预测与十秒实测的对照', head: ['n', '碰撞，预测', '碰撞，实测', '吞吐，预测', '吞吐，实测'], rows: [
          ['2', '10.46 %', '11.20 %', '5.169', '5.136 Mb/s'],
          ['5', '27.22 %', '25.84 %', '4.679', '4.717 Mb/s'],
          ['10', '38.92 %', '35.08 %', '4.275', '4.421 Mb/s'],
          ['20', '49.59 %', '45.83 %', '3.857', '4.027 Mb/s'],
        ] },
      ],
      expect: '每个碰撞比例都落在预测值的 10% 以内，每个吞吐量都在 5% 以内，全程没有任何拟合参数。从五台站点起，实测的碰撞总是少于预测；只有两台那一行相反，实测 11.20 %，预测 10.46 %。',
      meaning: '偏差是系统性的，所以可以解释。两台的情形里只有一台竞争者，论文把其余站点当作在每个时隙独立、以同一概率发送的假设无法成立。',
    },
    {
      heading: '同一次碰撞之后的三种等待',
      variant: 0,
      jump: 1,
      steps: [
        '在「n = 5 在圆弧上」里跳到第一次碰撞，逐个查看碰撞之后各站点的等待色块。',
        '统计十秒内等待 EIFS 的次数，并比较 EIFS 与 DIFS 的长度、一次碰撞与一次成功的长度。',
      ],
      expect: '碰撞的站点各自等待 45 µs 的 ACK 超时，检出了重叠却没能正确接收的邻居等待 94 µs 的 EIFS，什么也没有检出的邻居只等待 34 µs 的 DIFS。十秒内共有 1029 次 EIFS，每一次都使那个邻居比其他站点多等 60 µs。一次碰撞比一次成功早结束 15 µs，约占一次交互的 0.7%，二十台时对预测吞吐量的影响为 0.2%；改用论文的取值，预测反而向另一方向偏移 0.6%。',
      meaning: 'EIFS 与失败之后的等待都照标准（① ②），论文的链里没有这两种状态。忙周期内计数保持不变也是标准的规定，论文的链却在每个忙周期减一，于是模型里等待的站点更早到达零、碰撞更多——方向与实测偏低一致。',
    },
    {
      heading: '残差，以及模型不能回答的问题',
      variant: 1,
      steps: [
        '载入「n = 20 台站点」运行十秒，读出总的碰撞比例，再分别读出每台站点自己的失败比例。',
      ],
      expect: '二十台站点总的实测碰撞比例是 45.83 %，预测 49.59 %；各站点自己的比例分布在 42.9 % 到 52.1 % 之间。',
      meaning: '上面几条原因都指向实测偏低，计入之后站点较多时仍有一部分无法解释，应当如实报告为残差，而不是调整一个常数使曲线重合。模型给出的是整个网络共用的一个概率；各站点之间的离散只是同一个随机过程在有限样本上的表现，公平性、时延的长尾与饿死现象都不在这个模型的描述范围之内。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.2.11（ACK 超时与失败的判定）、§10.3.4.3（失败的定义、忙时停止递减、退避的起点）、§10.3.3（EIFS 与 DIFS 的选用）、§10.3.7 式 (10-3)、(10-6)、(10-7)（时隙、DIFS 与 EIFS）、§10.6.5.8（数据帧的速率）。',
    '模型出自论文，不是标准：G. Bianchi，IEEE JSAC 18(3):535–547，2000；有限重传形式出自 Wu 等人，INFOCOM 2002。',
    '本仿真器的取值与取法：−20 dBm 的圆弧、种子 7、十秒采样、4 dB 的前导检测门限与 5 dB 的捕获余量、共用的时钟与零传播时延。这条圆弧上每台站点到达强度相同，所以捕获在这里从不发生——能观察到捕获的是“性能异常”一课与第一阶段项目。',
  ],
  limits: [],
  scenario: () => bianchiScenario(5, { near: true }),
  variants: bianchiVsSimVariants,
  jumps: bianchiVsSimJumps,
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按标准，发送方统计的“失败”与模型的“碰撞”是什么关系？',
      options: [
        '永远相等，因为失败只可能由碰撞引起',
        '发送方只知道没有收到应答；只有在没有捕获、也没有其他失败原因时两者才相等',
        '发送方能直接检测碰撞，所以统计的就是碰撞',
      ],
      answer: 1,
      explain: '§10.3.4.3 把失败定义为没有收到控制响应帧，不区分原因。圆弧上没有捕获，十秒内接入点的 1370 次错失对应 1370 次重传；换一个各站点强弱悬殊的户型，这两个数立即不再相等。',
    },
    {
      q: '圆弧上五台及以上时，实测的碰撞比预测少。哪一项差异指向这个方向？',
      options: [
        '一帧尝试七次之后就被放弃',
        '标准在忙周期内保持计数不变，而论文的链让它在每个忙周期减一',
        '使同时开始的发送成为完全碰撞的那条前导码规则',
      ],
      answer: 1,
      explain: '重传上限（retry limit）使模型的碰撞率升高而不是降低，前导码规则恰恰使“无捕获”成立。忙时计数不变使每台等待中的站点推迟到达零。',
    },
    {
      q: '还有一部分偏差无法解释。专业的做法是什么？',
      options: [
        '调整一个常数，直到两条曲线重合',
        '如实报告残差，并列出已经解释的原因及其方向',
        '宣布仿真器有错，因为模型已经发表',
      ],
      answer: 1,
      explain: '拟合得到的常数会使这个预测失去唯一的价值。写明的残差是可复现的；修正因子不是，诉诸权威也不是。',
    },
  ],
}
