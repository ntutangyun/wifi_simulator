/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · seven attempts, and the eighth that
 * never comes.
 *
 * The first half of the old `retries-queues`, split on 2026-09-25
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M5). The
 * parent stated two rules the engine follows — what happens to one frame nobody
 * answers, and what the queue behind it does — and the queue is now `queues`,
 * which loads this lesson's scene and both its variants unchanged
 * (`sameSceneAs: 'retries-queues'`).
 *
 * This half keeps jumps 0–2 (the first retry, the first frame carrying the
 * Retry bit, the first retry-limit drop), the seven-attempt table, the UI
 * walk-through and the two-counters depth. The queue, the lifetime, the drop
 * table, the three-setting comparison, the waiting times, the head-of-line
 * depth and both experiments went next door; so did the procedure's first two
 * steps, which are the queue's own (`AcQueues.enqueue` and
 * `MacSim.purgeExpired`), leaving this half the attempt-and-failure path end to
 * end from `failMsdus` in src/engine/mac.ts.
 *
 * Also cut, per §5.5: the Block Ack footnote, an aside about something the
 * simulator does not model at all.
 *
 * The timing figure is the seven attempts to scale — the whole point is that
 * they fan out — so the prose no longer has to say "each one starts later than
 * the last"; that sentence is gone from 「每一次尝试的开销都比上一次大」.
 *
 * The scene and both variants are unchanged, so the recorded timeline hashes
 * stay identical. Every number quoted below is pinned in
 * tests/course/retries-queues.test.ts.
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
 *
 * Drawn on one linear axis the fan-out IS the picture: the first three attempts
 * are crowded against the left edge and the seventh is most of the way across.
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
  why: '一帧没有收到应答，并不等于它已经丢失：发送方可以再发送一次。但“再发送一次”总是有代价的，也不能无限制地重复。发送方实际上无法得知自己的帧是否到达，它只知道确认帧（ACK）没有在期限之内开始。于是它把同一帧原样放回队首再次发送——这就是重传（retry）：序列号不变，只额外置位重发比特（Retry bit），以便接收端识别出这是重复帧。同时它把竞争窗口（CW）翻倍，退避（backoff）值的随机选取范围随之扩大，所以各次尝试之间的间隔总体越来越大；但选取仍是随机的，并不是每一次的间隔都比上一次更大。连续失败几次后，速率也逐档下降，同一帧在空中的时长增加，最后一次占用的空口时间（airtime）是第一次的两倍多。同一帧发送满七次仍没有应答，就达到了重传上限（retry limit）：这一帧被放弃，后面那一帧移到队首，窗口恢复为最小值。这正是规则在发挥作用——一条链路（link）七次都无法成功送达，七十次也不会成功。决定是否放弃的是这一帧自身的发送次数，决定窗口的是整条队列（queue）的连续失败次数；两者通常同步，一旦有帧因等待过久而被丢弃，两者就不再一致。',
  outcomes: [
    '解释发送方依据什么判定“这一帧未送达”，以及它随后更新了哪三个数',
    '读出同一帧七次尝试的时刻，并说出它们的间隔总体上为什么越来越大',
    '说明第七次之后发生了什么，以及为什么继续重发是错误的',
  ],
  needs: ['airtime', 'collisions-cw'],
  terms: [
    { term: 'retry', plain: '未收到应答之后，把同一帧再发送一次；帧上带有标记，以便接收端识别出这是重复帧' },
    { term: 'retry limit', plain: '同一帧最多可发送的次数；达到上限后，发送方就放弃这一帧' },
  ],
  picture: [
    { heading: '没有收到应答', text: '站点（STA）无法得知自己那一帧是否到达。它只知道，所等待的来自接入点（AP）的确认帧（ACK）一直没有到达。于是它把同一帧原样再发送一次——这就是重传（retry）——位置仍在队列（queue）最前面，只是置位一个比特，以便接收端区分这是重复帧还是新帧。' },
    { heading: '每一次尝试的开销都比上一次大', text: '发送方把这次没有应答视为竞争加剧的信号，于是把竞争窗口（CW）翻倍、从更大的范围中选取退避（backoff）值。帧本身往往也发送得更慢：连续失败几次之后，无线电会改用更稳健、也更慢的一档速率，帧在空中的时长增加，与其他站点的发送重叠的可能性也更大。' },
    { kind: 'watch', jump: 0, heading: '跟踪一帧', text: '载入仿真，跳到第一次重传。跟踪左边那台上传站点的某一帧：同一帧被一次又一次地发出——直到它不再出现。' },
    { heading: '七次之后，放弃这一帧', text: '任何一帧都不能无限次重传。每一帧都记录着自己已被发送的次数，而这个数的上限叫做重传上限（retry limit）——这里是七。一达到这个数，这一帧就被放弃，后面那一帧移到队首。这不是规则出了问题，而正是规则在发挥作用：一条七次都无法成功送达的链路，七十次也不会成功。' },
    { heading: '还有一种被放弃的方式', text: '帧被放弃并不只有这一种途径。一帧在队列中等待的时间超过它的生存期（MSDU lifetime），也会被丢弃——而且往往一次也没有获得发送机会。那是下一课的内容。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: 'Hidden B 的第一帧，七次尝试',
      spec: retryFanTiming(),
      caption: '同一个序列号，七个色块：前三次集中在最左边，第七次已经到了 26 940 µs。窗口逐次变宽，所以间隔总体在增大——但不是每次都增大：第三次与第四次之间相隔 2497 µs，第四次与第五次之间只隔 2091 µs。选取仍然是随机的，变宽的只是范围。排在它后面的那一帧，要到 27 741 µs 才开始发送。',
    },
    { kind: 'steps', heading: '一次失败之后发送方的处理步骤', items: [
      '队首那一帧发出后，发送方同时启动一个超时计时器：应答必须在这一帧结束后的 45 µs 之内开始——16 µs 的间隔、一个 9 µs 的时隙（slot time），再加电台报告“开始接收”所需的 20 µs。',
      '计时器到期仍没有应答，就有三个数随之更新：这一帧自身的尝试次数加一；这条队列的连续失败次数加一；竞争窗口扩大为原来的两倍再加一，最大为 1023。',
      '这一帧随后被放回队首，重新等待发送：序列号不变，只是置位了重发比特（Retry bit）——所以每一次尝试都是同一帧，而不是新的一帧。',
      '速率控制同时也在降档：失败累积到一定次数，下一次尝试就改用更慢、更稳健的一档速率，于是同一帧占用的空口时间（airtime）反而更长。',
      '当一帧的尝试次数达到重传上限七次，它就被丢弃，后面那一帧移到队首。而窗口恢复为 15，依据的是队列自身的失败次数达到七——在同一帧被反复重传时，这两件事发生在同一时刻。',
    ] },
    { kind: 'table', heading: '一帧的七次尝试', head: [
      '第几次', '发送于', '速率',
      '重发比特', '记录失败', '之后的 CW',
    ], rows: [
      ['1', '0 µs', '48 Mb/s', '0', '321 µs', '31'],
      ['2', '526 µs', '48 Mb/s', '1', '847 µs', '63'],
      ['3', '1683 µs', '36 Mb/s', '1', '2092 µs', '127'],
      ['4', '4544 µs', '36 Mb/s', '1', '4953 µs', '255'],
      ['5', '6999 µs', '24 Mb/s', '1', '7576 µs', '511'],
      ['6', '13 632 µs', '24 Mb/s', '1', '14 209 µs', '1023'],
      ['7', '26 940 µs', '18 Mb/s', '1', '27 689 µs——放弃', '15'],
    ] },
    { heading: '如何解读这张表', text: '七次尝试的序列号相同。速率每失败两次降一档，于是第一次尝试占用 276 µs 空口时间，第七次需要 704 µs。三秒内 Hidden A 送达 76 帧、因达到重传上限丢弃 62 帧，Hidden B 分别是 69 与 61——这条链路的失败很有规律。' },
  ],
  deeper: [
    { heading: '两个计数器，而不是一个', text: '“是否放弃这一帧”依据的是这一帧自身的尝试计数。“是否扩大窗口”依据的是另一个计数器：它属于队列而不是某一帧，任何一次成功都会使它复位。当同一帧被反复重传时，两者保持一致；而一旦有帧因超过生存期被丢弃，两者就不再一致：504 465 µs 处 Hidden B 一次丢弃三个旧帧，紧接着的那一帧第一次失败时读数是 retries = 1，而队列计数器已经是 6；第二次是 2 对 7——此时窗口恢复为 15，尽管这一帧的七次机会才用掉两次。' },
  ],
  limits: [
    { kind: 'model-value', text: '七这个上限在引擎中是一个常数（phy.ts 的 SHORT_RETRY_LIMIT），全场每台设备、每个接入类别、每种帧长都使用同一个七，而且这个数同时决定队列的失败计数何时使窗口恢复为 15。标准只规定 dot11ShortRetryLimit 是一个可配置的管理变量。真实驱动会按接入类别、帧长甚至链路质量设置不同的上限，语音帧和备份帧不会使用同一个值。' },
    { kind: 'unmodelled', text: '降档机制是引擎自身的两条计数规则：同一个对端连续两次失败降一档，连续十次成功升一档，且永远不超过按信噪比查表得到的上限（rate.ts 的 RateControl）。它无法区分这一次失败是碰撞还是信号变弱。真实的速率控制会依据一段时间窗内的丢包率判断，或者像 CARA 那样先发送一个短帧试探，以免把碰撞误判为衰落——引擎没有实现这两种方法中的任何一种，所以表中「每失败两次降一档」的规律整齐得不符合实际。' },
    { kind: 'unmodelled', text: '这七次尝试之所以能逐一确定时刻，是因为退避值的随机选取来自由场景种子生成的确定序列，而链路电平在默认场景中根本不随时间变化。真实的七次尝试处于七种不同的信道条件下，其中有几次必然失败，也有几次本应成功。编辑器的「时变链路（衰落）」一节可以开启电平的起伏，本课的三个场景都没有开启。' },
    { kind: 'out-of-scope', until: 'wan-rtt', text: '一次失败的代价在这里只有空口时间与窗口翻倍，因为本课这三个场景之上没有任何上层：它们的 servers 为空，于是业务源直接生成 MSDU，连一次应用层往返都无法测量。引擎本身有一层云端——「云端往返」那一课会开启它，那里 28.688 ms 的往返中只有 0.106 ms 属于空口。而即使开启这一层，仍然没有 TCP 的拥塞窗口与语音的抖动缓冲：服务器会因请求未送达而不应答，却不会因时延变长而降速。真实设备上这七次尝试往往还伴随上层的一次超时重传，一帧的丢失会经由传输层放大为数倍的代价。要回答「用户感受到了什么」，开启那一层之后只能回答一半：等待了多久可以回答，是否会降速避让则无法回答。' },
  ],
  sources: [
    '两个计数器见 IEEE Std 802.11-2024 §10.23.2.2：dot11ShortRetryLimit = 7 决定每个 MSDU 何时被丢弃，而每个接入类别一个的 QSRC 驱动 CW = min(2·CW + 1, CWmax)。802.11-2016 还有一套用于长帧的 SLRC 与 dot11LongRetryLimit = 4（超过 RTS 门限时适用），802.11-2020 已删除。',
    '重复帧检测（凭发送地址、序列号与 Retry = 1）见 §10.3.2.14；确认帧的 45 µs 期限见 §10.3.2.9。',
    '500 个 MSDU 的队列上限、500 ms 的生存期与“丢弃新到者”的策略，都是本仿真器的模型取值，沿用 ns-3 的 WifiMacQueue；随机种子、隐藏节点户型与 13.2 Mb/s 的视频源同样如此。',
  ],
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
  observe: [
    '27 689 µs 放弃那一帧时，Hidden B 在同一时刻记录丢弃与窗口复位为 15；它的下一帧序列号是 1，重发比特清零。',
    '事件日志中，最后一次失败记为 “retry #id (retries=7 QSRC=7)”，紧接着是一行 “DROP #id (retryLimit)”。',
  ],
  tryThis: [
    '在第一次重传处暂停，打开帧详情：序列号和重发比特这两行，是区分“同一帧再次发送”与“新的一帧”的唯一依据。',
  ],
  quiz: [
    {
      q: '一帧已经发送了七次，仍然没有应答。它会被如何处理？',
      options: [
        '它留在队首，等待信道空闲一些',
        '它被放弃，后面那一帧移到队首',
        '它再以最低速率发送一次',
      ],
      answer: 1,
      explain: '七就是重传上限，而后面整条队列已经为这七次尝试付出了等待的代价。',
    },
    {
      q: '第七次尝试为什么发生在 26 940 µs，而不是紧接着第六次？',
      options: [
        '接入点要求它等待',
        '每失败一次窗口就翻倍，选取的退避值也随之变大',
        '帧变长了，所以要等更久',
      ],
      answer: 1,
      explain: '窗口从 15 逐步增大到 1023，选取的时隙数随之变大；帧变长只是使每次尝试本身的开销更大。',
    },
  ],
}
