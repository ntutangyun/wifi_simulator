/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · seven attempts, and the eighth that
 * never comes.
 *
 * Standard-first shape (① standard → ② this simulator → ③ hands-on), converted
 * on 2026-11-11 after the IEEE Std 802.11-2024 check of every rule it teaches:
 * the ACK timeout of §10.3.2.11, the SRC/SSRC pair and the CW series of §10.3.3,
 * the retry limit, the Retry subfield and the lifetime of §10.3.4.4, duplicate
 * detection in §10.3.2.14, and the free choice of data rate in §10.6.5.8. Every
 * node of this scene is a non-QoS (DCF) station, so ① cites the DCF clauses and
 * not EDCA's §10.23.2.
 *
 * Two findings of that check are in ② as `choice`/`differs`: the engine resets
 * its queue counter at the limit (EDCA's rule — the DCF text only resets CW),
 * and it starts every frame's lifetime clock at enqueue, which is EDCA's rule;
 * for a DCF station §10.4 starts it at the first transmission attempt.
 *
 * The first half of the old `retries-queues`, split on 2026-09-25; `queues`
 * loads this lesson's scene and both its variants unchanged
 * (`sameSceneAs: 'retries-queues'`), so the recorded timeline hashes stay
 * identical. Every figure printed below is read back out of the text and
 * compared with a run in tests/course/retries-queues.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import { J, firstRetry, hallwayHouse, node, sc, txOf, type Lesson } from '../lessonKit'

/** The scenario, with the MAC transmit-queue settings of the chosen run. */
export function retriesScenario(queue: { limit: number; lifetimeMs: number }): Scenario {
  return sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'nonht', 'idle'),
    node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
    node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
    node('sta-3', 'TV', 'sta', 1, 1, 'nonht', 'video'),
  ], { queue })
}

export const dropOf = (reason: 'retryLimit' | 'queueFull' | 'lifetime', at?: string) =>
  (r: Parameters<typeof firstRetry>[0]): boolean =>
    r.type === 'DROP' && r.reason === reason && (at === undefined || r.node === at)

/**
 * Hidden B's first frame, all seven attempts, to scale: 0, 526, 1683, 4544,
 * 6999, 13 632 and 26 940 µs, each span as long as that attempt really was, and
 * the frame behind it leaving at 27 741 µs. Every figure is a TX_START of the
 * base run and `retries-queues.test.ts` reads each one back out of this spec.
 */
export function retryFanTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '同一帧', spans: [
        { fromUs: 0, toUs: 276, label: '第一次 276 µs', tone: 'accent' },
        { fromUs: 526, toUs: 802, tone: 'accent' },
        { fromUs: 1683, toUs: 2047, tone: 'accent' },
        { fromUs: 4544, toUs: 4908, tone: 'accent' },
        { fromUs: 6999, toUs: 7531, tone: 'accent' },
        { fromUs: 13_632, toUs: 14_164, tone: 'accent' },
        { fromUs: 26_940, toUs: 27_644, label: '第七次 704 µs', tone: 'accent' },
      ] },
      { label: '下一帧', spans: [{ fromUs: 27_741, toUs: 28_445 }] },
    ],
    axis: { fromUs: 0, toUs: 28_500, ticks: [0, 7000, 14_000, 21_000], unit: 'µs' },
  }
}

export const retriesQueues: Lesson = {
  id: 'retries-queues',
  module: 4,
  title: '一帧的七次尝试',
  why: '发送方无法得知自己发出的 MSDU（MAC service data unit）是否到达，它只知道确认帧（ACK）有没有在期限之内开始。IEEE 802.11-2024 对不支持服务质量（quality of service, QoS）、使用分布式协调功能（distributed coordination function, DCF）的站点（STA）规定的做法是：期限一到仍没有应答，就判定这次发送失败，之后把同一帧再发送一次——这就是重传（retry）——帧上的重发比特（Retry bit）置 1，序列号不变，接收端据此识别重复帧；同时这一帧的短重传计数（SRC）与站点的短重传计数（SSRC）各加一，竞争窗口（CW）取序列 2^k − 1 中的下一个值，最大为 aCWmax。重传一直进行到这一帧发送成功，或者它的 SRC 达到 dot11ShortRetryLimit（缺省为 7），或者它超过生存期（MSDU lifetime）；达到任何一个上限，这一帧就被丢弃，这个上限就是重传上限（retry limit）。SSRC 达到上限时，窗口恢复为 aCWmin。决定是否放弃一帧的是这一帧自己的计数，决定窗口的是站点的计数；两者通常同步，一旦有帧因超过生存期而被丢弃，两者就不再一致。标准没有规定速率怎样随失败调整，本仿真器连续失败两次降一档，所以同一帧最后一次占用的空口时间（airtime）是第一次的两倍多。',
  outcomes: [
    '说出标准依据什么判定一次发送失败，以及失败之后哪几个量随之更新',
    '分清哪些做法照标准、哪些是本仿真器的取值与取法',
    '从日志里读出同一帧七次尝试的时刻，以及第七次之后发生了什么',
  ],
  needs: ['airtime', 'collisions-cw'],
  terms: [
    { term: 'retry', plain: '未收到应答之后，把同一帧再发送一次；帧上的重发比特置 1，以便接收端识别出这是重复帧' },
    { term: 'retry limit', plain: '同一帧最多可发送的次数，即 dot11ShortRetryLimit；达到上限后，发送方就丢弃这一帧' },
  ],
  standard: [
    { heading: '判定一次发送失败（§10.3.2.11，§17.4.4 表 17-24）', text: '发出一个要求立即确认的 MPDU（MAC protocol data unit）之后，发送方从物理层（physical layer, PHY）报告发送结束（PHY-TXEND.confirm）起等待一个 ACK 超时（ACK timeout），其长度为 aSIFSTime + aSlotTime + aRxPHYStartDelay。在此期间物理层没有报告开始接收，发送方就断定这次发送失败，并在 ACK 超时结束时启动退避（backoff）。20 MHz 的正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层三项分别为 16 µs、9 µs、20 µs，合计 45 µs。所谓失败，就是没有收到应答（§10.3.4.3）；发送方无从区分原因是碰撞还是信号太弱。' },
    { heading: '两个重传计数（§10.3.3，§10.3.4.4）', text: '站点为每个等待发送的 MSDU 维护一个短重传计数（short retry count, SRC），站点自身另有一个站点短重传计数（STA short retry count, SSRC），初值都是 0。长度不超过 dot11RTSThreshold 的帧发送失败一次，这个 MSDU 的 SRC 与 SSRC 各加一；发送成功，两者都清零。长度超过 dot11RTSThreshold 的帧另用一对长重传计数（LRC 与 SLRC）。' },
    { heading: '竞争窗口怎样变化（§10.3.3，式 (10-1)）', text: '退避计数从 [0, CW] 中均匀随机地选取。CW 的初值为 aCWmin；每次发送失败使站点的重传计数加一时，CW 取序列 2^k − 1 中的下一个值，直到 aCWmax 为止，此后保持 aCWmax。每次成功发送之后，或者 SSRC 达到 dot11ShortRetryLimit 时，CW 恢复为 aCWmin。OFDM 物理层的 aCWmin 为 15，aCWmax 为 1023（§17.4.4 表 17-24）。' },
    { heading: '重传与重复帧（§10.3.4.4，§10.3.2.14）', text: '一个 MPDU 在确认失败一次或多次之后，它的每一次重传都必须把重发比特（Retry 子字段）置 1。同一个 MSDU 的各个 MPDU 序列号相同，序列号是一个模 4096 的计数。接收端收到重发比特为 1 的帧时，在重复检测缓存里查找相同的记录，以此滤除重复帧。' },
    { heading: '放弃一帧（§10.3.4.4，§10.4，附录 C）', text: '重传一直进行到这一帧发送成功，或者它的 SRC 等于 dot11ShortRetryLimit，或者它的发送计时器超过 dot11MaxTransmitMSDULifetime；达到任何一个上限，重传即停止，这一帧被丢弃。dot11ShortRetryLimit 是一个可读写的管理变量，表示一帧在报告失败之前最多发送的次数，缺省值为 7。' },
    { heading: '速率由实现决定（§10.6.5.8）', text: '单播数据帧（data frame）可以使用接收端支持的任何速率，标准只规定不得超出接收端声明的能力，没有规定发送方怎样根据失败或成功调整速率。' },
    { kind: 'steps', heading: '一次发送失败之后，按标准：逐步说明', items: [
      '发出数据帧，从发送结束起计时一个 ACK 超时：aSIFSTime + aSlotTime + aRxPHYStartDelay（§10.3.2.11）。',
      'ACK 超时之内物理层没有报告开始接收：这次发送失败（§10.3.2.11）。',
      '这一帧的 SRC 与站点的 SSRC 各加一；CW 取序列中的下一个值，最大为 aCWmax（§10.3.3）。',
      '若 SRC 已等于 dot11ShortRetryLimit，或者生存期已到，丢弃这一帧；SSRC 达到上限时 CW 恢复为 aCWmin（§10.3.3，§10.3.4.4）。',
      '否则在 ACK 超时结束时启动退避，从 [0, CW] 中选取退避计数；退避结束后重传，重发比特置 1，序列号不变（§10.3.4.3，§10.3.4.4）。',
      '某一次发送收到确认：SRC 与 SSRC 清零，CW 恢复为 aCWmin（§10.3.3）。',
    ] },
  ],
  implementation: [
    { topic: 'ACK 超时', standard: 'aSIFSTime + aSlotTime + aRxPHYStartDelay，从发送结束起算（§10.3.2.11）', sim: '照此计算：16 + 9 + 20 = 45 µs；期限内没有开始接收，就写一条失败记录并启动退避。', kind: 'faithful' },
    { topic: '两个计数', standard: '每个 MSDU 一个 SRC，站点一个 SSRC（§10.3.3，§10.3.4.4）', sim: '每个 MSDU 一个尝试计数（日志里的 retries），每条队列（queue）一个失败计数（日志里沿用增强型分布式信道接入（enhanced distributed channel access, EDCA）的名字 QSRC）。本课的站点都是非 QoS 站点，每台只有一条队列，所以队列计数就是站点的 SSRC；任何一次成功都使它清零。', kind: 'faithful' },
    { topic: 'SSRC 达到上限时', standard: 'DCF 只规定 CW 恢复为 aCWmin，没有说 SSRC 是否清零（§10.3.3）', sim: '计数清零、CW 恢复为 15，即 EDCA 对 QSRC 的规则（§10.23.2.2）。', kind: 'choice' },
    { topic: '竞争窗口的序列', standard: '2^k − 1，从 aCWmin 到 aCWmax（§10.3.3）', sim: '每次失败 CW 变为 min(2·CW + 1, 1023)：15、31、63、127、255、511、1023。', kind: 'faithful' },
    { topic: '重发比特与序列号', standard: '重传时重发比特置 1，同一 MSDU 序列号相同（§10.3.4.4，§10.3.2.14）', sim: '照此：一个 MSDU 第一次发送时取得序列号，每次重传沿用，重发比特置 1。', kind: 'faithful' },
    { topic: '重传上限的取值', standard: 'dot11ShortRetryLimit 是可读写的管理变量，缺省 7（附录 C）', sim: '固定为 7，所有设备、所有帧长共用，不能修改。', kind: 'value' },
    { topic: '长帧的计数', standard: '超过 dot11RTSThreshold 的帧用 LRC 与 SLRC（§10.3.4.4）', sim: '没有长重传计数，所有帧都按短重传计数与 7 次的上限处理。本课场景的 RTS 门限（RTS threshold）是 3000 字节，没有一帧超过它，所以不涉及这一条。', kind: 'absent' },
    { topic: '失败之后的速率', standard: '标准未规定调整方法（§10.6.5.8）', sim: '对同一个对端连续失败两次降一档，连续成功十次升一档，且不超过按信噪比（signal-to-noise ratio, SNR）查表得到的上限。它无法区分失败来自碰撞还是信号变弱。', kind: 'choice' },
    { topic: '退避的随机数', standard: '从 [0, CW] 均匀选取，各站点的随机序列应当统计独立（§10.3.3 NOTE 1）', sim: '由场景种子生成的确定序列，同一场景每次运行结果相同；本课的链路（link）电平也不随时间变化。', kind: 'choice' },
    { topic: '生存期从何时起算', standard: '非 QoS 站点的发送计时器从第一次尝试发送时起算，上限 dot11MaxTransmitMSDULifetime，缺省 512 TU（§10.4，附录 C）', sim: '一律从入队时起算，取 500 ms，即 EDCA 的规则（§10.23.2.12.1）；所以一帧可以在一次也没有发送的情况下超过生存期。下一课详细讨论。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '同一帧的七次尝试',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次重传。Hidden A 与 Hidden B 彼此收不到对方的信号，它们发往接入点（AP）的帧经常相互重叠。',
        '跟踪 Hidden B 的第一帧：读出它每一次发送的时刻、速率与重发比特，以及每次失败之后的 CW。',
      ],
      blocks: [
        { kind: 'diagram', heading: 'Hidden B 的第一帧，七次尝试', spec: retryFanTiming(), caption: '按真实比例绘制。前三次集中在最左边，第七次在 26 940 µs；排在后面的那一帧到 27 741 µs 才开始发送。' },
        { kind: 'table', heading: '一帧的七次尝试', head: ['第几次', '发送于', '速率', '重发比特', '记录失败', '之后的 CW'], rows: [
          ['1', '0 µs', '48 Mb/s', '0', '321 µs', '31'],
          ['2', '526 µs', '48 Mb/s', '1', '847 µs', '63'],
          ['3', '1683 µs', '36 Mb/s', '1', '2092 µs', '127'],
          ['4', '4544 µs', '36 Mb/s', '1', '4953 µs', '255'],
          ['5', '6999 µs', '24 Mb/s', '1', '7576 µs', '511'],
          ['6', '13 632 µs', '24 Mb/s', '1', '14 209 µs', '1023'],
          ['7', '26 940 µs', '18 Mb/s', '1', '27 689 µs', '15'],
        ] },
      ],
      expect: '七次尝试的序列号都是 0；第一次重发比特为 0，之后都是 1。CW 从 31 逐次增大到 1023。间隔总体越来越大，但不是每次都增大：第三次与第四次之间相隔 2497 µs，第四次与第五次之间只隔 2091 µs。速率每失败两次降一档，第一次占用 276 µs，第七次占用 704 µs。',
      meaning: 'CW 的序列、重发比特与序列号都照标准（①）；退避计数是从变宽的范围里随机选取的，所以间隔不是单调增大。降档是本仿真器自己的取法（②），标准没有规定。',
    },
    {
      heading: '第七次之后',
      jump: 2,
      steps: [
        '跳到第一次因重传上限丢帧。',
        '读出同一时刻的失败记录、丢弃记录与 CW 记录，再看 Hidden B 的下一帧。',
      ],
      expect: '27 689 µs 处最后一次失败记作 “retry #id (retries=7 QSRC=7)”，紧接着一行 “DROP #id (retryLimit)”，同一时刻 CW 恢复为 15。下一帧在 27 741 µs 发出，序列号为 1，重发比特为 0。三秒内 Hidden A 送达 76 帧、因重传上限丢弃 62 帧，Hidden B 分别是 69 帧与 61 帧。',
      meaning: '这一帧的 SRC 等于 7，按 §10.3.4.4 被丢弃；SSRC 达到上限，CW 按 §10.3.3 恢复为 aCWmin（①）。计数同时清零是本仿真器的取法（②）。',
    },
    {
      heading: '两个计数不再一致',
      steps: [
        '在事件日志里找到 504 465 µs：Hidden B 在这一时刻丢弃三帧，原因是生存期超时。',
        '读出紧接着那一帧前三次失败记录中的 retries 与 QSRC，以及每次之后的 CW。',
      ],
      blocks: [
        { kind: 'table', heading: '504 465 µs 之后那一帧的前三次失败', head: ['第几次失败', 'retries（这一帧）', 'QSRC（站点）', '之后的 CW'], rows: [
          ['1', '1', '6', '1023'],
          ['2', '2', '7', '15'],
          ['3', '3', '1', '31'],
        ] },
      ],
      expect: '被丢弃的三帧中排在最前面的那一帧（序列号 17）已失败 5 次，站点的计数随之停在 5；它们因生存期被丢弃时，站点计数并不清零。下一帧（序列号 18）第一次失败时读数是 1 对 6，第二次是 2 对 7——此时 CW 恢复为 15，尽管这一帧的七次机会才用掉两次。',
      meaning: '这一帧的计数决定何时丢弃它，站点的计数决定窗口，标准只在成功时把两者一起清零（①）。生存期从入队起算是本仿真器与标准不同之处（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.2.11（ACK 超时 = aSIFSTime + aSlotTime + aRxPHYStartDelay）、§10.3.3 与式 (10-1)（SRC、SSRC、CW 序列与复位）、§10.3.4.3（失败之后的退避）、§10.3.4.4（重发比特、重传上限与生存期）、§10.3.2.14（序列号与重复检测）、§10.4（DCF 的发送计时器从第一次尝试起算）、§10.6.5.8（单播数据帧的速率）、§10.23.2.2 与 §10.23.2.12.1（EDCA 的 QSRC 与生存期）、§17.4.4 表 17-24（OFDM 物理层的 aSlotTime、aSIFSTime、aRxPHYStartDelay、aCWmin、aCWmax）、附录 C（dot11ShortRetryLimit 缺省 7，dot11MaxTransmitMSDULifetime 缺省 512 TU）。',
    '本仿真器的取值与取法：7 次的固定上限、到达上限时计数清零、连续两次失败降一档与连续十次成功升一档、由种子生成的退避序列、从入队起算的 500 ms 生存期、500 个 MSDU 的队列上限，以及隐藏节点户型与 13.2 Mb/s 的视频源。',
  ],
  limits: [],
  scenario: () => retriesScenario({ limit: 500, lifetimeMs: 500 }),
  variants: [
    {
      label: '短队列：100 个 MSDU，生存期 500 ms',
      scenario: () => retriesScenario({ limit: 100, lifetimeMs: 500 }),
    },
    {
      label: '短生存期：500 个 MSDU，生存期 100 ms',
      scenario: () => retriesScenario({ limit: 500, lifetimeMs: 100 }),
    },
  ],
  jumps: [
    J('第一次重传', firstRetry),
    J('第一次重发（Retry 位置位）', txOf((r) => r.frame.kind === 'data' && r.frame.retryFlag === true)),
    J('第一次因重传上限丢帧', dropOf('retryLimit')),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一帧已经发送了七次，仍然没有应答。按标准，它会被如何处理？',
      options: [
        '它留在队首，等待信道空闲一些',
        '它的 SRC 已等于 dot11ShortRetryLimit，重传停止，这一帧被丢弃',
        '它再以最低速率发送一次',
      ],
      answer: 1,
      explain: '§10.3.4.4：SRC 等于 dot11ShortRetryLimit 时重传停止，这一帧被丢弃。缺省值是 7。',
    },
    {
      q: '发送方依据什么判定一次发送失败？',
      options: [
        '接收端发回一个否定确认',
        'ACK 超时之内物理层没有报告开始接收',
        '发送方检测到了碰撞',
      ],
      answer: 1,
      explain: '§10.3.2.11：期限内没有开始接收就判定失败。802.11 没有否定确认，发送方也无法在发送的同时检测碰撞。',
    },
    {
      q: '哪一项是本仿真器自己的取法，而不是标准的规定？',
      options: [
        '重传时重发比特置 1',
        '连续失败两次就降一档速率',
        '每次失败 CW 取序列中的下一个值',
      ],
      answer: 1,
      explain: '§10.6.5.8 只限定速率不得超出接收端的能力，怎样随失败调整由实现决定；另外两项都是 §10.3.3 与 §10.3.4.4 的规定。',
    },
  ],
}
