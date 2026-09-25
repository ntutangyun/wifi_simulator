/**
 * Wi-Fi Tier 1 · M5 · 听不见的邻居与损失 · seven attempts, and the eighth that
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
 * the last"; that sentence is gone from 「每一次尝试都比上一次贵」.
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
  why: '一帧没人回答，并不等于它已经丢了：发送方再发一次就是了。但“再发一次”从来不是免费的，也不可能一直发下去。这一课盯住一条老是失败的链路（link）上的一帧，看它被重来七次——窗口一次次变宽，速率一档档变低——然后在第七次之后被放弃。',
  outcomes: [
    '解释发送方凭什么断定“这一帧没到”，以及它接下来改了哪三个数',
    '读出同一帧七次尝试的时刻表，并说出它们总体上为什么越隔越远',
    '说清第七次之后发生了什么，以及为什么继续重发是错的',
  ],
  needs: ['airtime', 'collisions-cw'],
  terms: [
    { term: 'retry', plain: '没等到回答之后，把同一帧再发一次；帧上带着标记，好让接收端认出这是重复的' },
    { term: 'retry limit', plain: '同一帧最多能发几次；发满了，发送方就放弃它' },
  ],
  picture: [
    { heading: '没人回答', text: '站点（STA）听不见自己那一帧有没有到。它只知道，自己等的那个来自接入点（AP）的确认帧（ACK）一直没来。于是它把同一帧原样再发一次——这就是重传（retry）——位置仍在队列（queue）最前面，只是置上一个比特，好让接收端分得清这是重复的还是新的。' },
    { heading: '每一次尝试都比上一次贵', text: '发送方把这份沉默当成人多的信号，于是把竞争窗口（CW）翻倍、抽一个更长的退避（backoff）值。帧本身往往也发得更慢：连着失败几次之后，无线电会降到一种更结实、也更慢的发法上，帧在空中拉得更长，也就成了下一次碰撞更大的靶子。' },
    { kind: 'watch', jump: 0, heading: '盯住一帧', text: '载入仿真，跳到第一次重传。盯住左边那台上传站点的某一帧：同一帧一次、又一次地发出去——直到它不再出现。' },
    { heading: '七次之后，放手', text: '没有哪一帧可以永远重来。每一帧都记着自己已经被发过多少次，而这个数的上限叫做重传上限（retry limit）——这里是七。一到这个数，这一帧就被放弃，后面那一帧挪到队首。这不是规则出了问题，正是规则在起作用：一条七次都推不过去的链路，七十次也推不过去。' },
    { heading: '还有一种下场', text: '被放弃并不只有这一条路。一帧在队列里等得比它的生存期（MSDU lifetime）还久，也会被扔掉——而且往往一次空口都没轮上过。那是下一课的事。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: 'Hidden B 的第一帧，七次尝试',
      spec: retryFanTiming(),
      caption: '同一个序列号，七个色块：前三次挤在最左边，第七次已经到了 26 940 µs。窗口一次次变宽，所以间隔总体在拉大——但不是每次都拉大：第三到第四次之间隔了 2497 µs，第四到第五次只隔 2091 µs。抽签仍然是随机的，变宽的只是范围。排在它后面那一帧，要等到 27 741 µs 才轮得上。',
    },
    { kind: 'steps', heading: '一次失败之后，发送方做什么', items: [
      '队首那一帧发出去，发送方同时起一只钟：回答必须在这一帧结束后的 45 µs 之内开始——16 µs 的间隔、一个 9 µs 的时隙（slot time），再加电台报出“开始收了”所需的 20 µs。',
      '钟走完了还没动静，就有三个数往前走：这一帧自己的尝试次数加一；这条队列的连续失败次数加一；竞争窗口则加宽成自己的两倍再加一，最多到 1023。',
      '这一帧随后被放回队首，重新排上号发送：序列号照旧，只是带上了重发比特（Retry bit）——所以每一次尝试都是同一帧，不是新的一帧。',
      '速率控制同时也在往下退：失败累积到一定次数，下一次尝试就换一档更慢更结实的发法，于是同一帧占的空口时间（airtime）反而更长。',
      '当一帧的尝试次数达到重传上限七次，它就被丢弃，后面那一帧挪到队首。而窗口弹回 15，靠的是队列自己的失败次数数到七——在同一帧被反复捶打时，这两件事发生在同一瞬间。',
    ] },
    { kind: 'table', heading: '一帧，七次尝试', head: [
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
    { heading: '这张表怎么读', text: '七次尝试的序列号都是同一个。速率每失败两次降一档，于是第一次尝试占 276 µs 空口时间，第七次要 704 µs。三秒里 Hidden A 送达 76 帧、在重传上限上丢掉 62 帧，Hidden B 是 69 与 61——这条链路失败得很有规律。' },
  ],
  deeper: [
    { heading: '两个计数器，不是一个', text: '“是否放弃这一帧”看的是这一帧自己的尝试计数。“是否把窗口加宽”看的是另一个计数器：它属于队列而不是某一帧，任何一次成功都会让它复位。当同一帧被反复捶打时，两者步调一致；而一旦有帧因为年龄被丢掉，它们就分道扬镳：504 465 µs 处 Hidden B 一次丢掉三个老帧，紧接着那一帧第一次失败时读数是 retries = 1，而队列计数器已经是 6；第二次是 2 对 7——到这里窗口弹回 15，尽管这一帧七次机会才用掉两次。' },
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
    '27 689 µs 放弃那一帧时，Hidden B 同一瞬间记下丢弃与窗口复位为 15；它的下一帧序列号是 1，重发比特清零。',
    '事件日志里，最后一次失败写作 “retry #id (retries=7 QSRC=7)”，紧跟着一行 “DROP #id (retryLimit)”。',
  ],
  tryThis: [
    '在第一次重传处暂停，打开帧详情：序列号那一行和重发比特那一行，是分辨“同一帧又来了”与“新的一帧”的唯一依据。',
  ],
  quiz: [
    {
      q: '一帧已经发了七次，还是没有回答。它会怎么样？',
      options: [
        '它留在队首，等信道安静一些',
        '它被放弃，后面那一帧挪到队首',
        '它再以最低速率发一次',
      ],
      answer: 1,
      explain: '七就是重传上限，而后面整条队列已经为这七次尝试买了单。',
    },
    {
      q: '第七次尝试为什么发生在 26 940 µs，而不是紧挨着第六次？',
      options: [
        '接入点让它等',
        '每失败一次窗口就翻倍，抽到的退避值也跟着变长',
        '帧变长了，所以要等更久',
      ],
      answer: 1,
      explain: '窗口从 15 一路涨到 1023，抽出来的时隙数随之变大；帧变长只是让每次尝试本身更贵。',
    },
  ],
}
