/**
 * Wi-Fi Tier 1 · M2 · Channel access · Retries, drops and queues.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): what
 * happens to a frame nobody acknowledged — try again with a longer wait, then
 * give up — the line that builds up behind it, and why an old frame is worth
 * throwing away. The dense material that used to open the lesson (the two
 * counters that move on every failure, duplicate detection, the Block Ack
 * exception) lives in `deeper`; the clause numbers live in `sources`.
 *
 * The scene and both variants are unchanged, so the recorded timeline hashes
 * stay identical. Every number quoted below is pinned in
 * tests/course/retries-queues.test.ts.
 */
import type { Scenario } from '../../model/scenario'
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

const dropOf = (reason: 'retryLimit' | 'queueFull' | 'lifetime', at?: string) =>
  (r: Parameters<typeof firstRetry>[0]): boolean =>
    r.type === 'DROP' && r.reason === reason && (at === undefined || r.node === at)

export const retriesQueues: Lesson = {
  id: 'retries-queues',
  module: 4,
  title: '重传、丢帧与队列',
  why: '一帧没人回答，并不等于它已经丢了：发送方再发一次就是了。但“再发一次”从来不是免费的，也不可能一直发下去。当一帧死活发不出去、被一次次重来时，排在它后面的一切都在等。这一课我们看着一条老是失败的链路（link），和一条越排越长的队，然后问一个问题：什么时候，把一帧扔掉才是这台设备能做的最厚道的事。',
  outcomes: [
    '说出一帧被放弃的三种原因，以及每一种告诉了你什么',
    '解释为什么“再发一次”真正的代价，落在它后面那些帧身上',
    '说清为什么把缓冲区改大，一帧也不会多送到',
  ],
  needs: ['airtime', 'backoff'],
  terms: [
    { term: 'retry', plain: '没等到回答之后，把同一帧再发一次；帧上带着标记，好让接收端认出这是重复的' },
    { term: 'retry limit', plain: '同一帧最多能发几次；发满了，发送方就放弃它' },
    { term: 'queue', plain: '等着轮到自己被发出去的那一列帧，最老的排在最前面' },
    { term: 'lifetime', plain: '一帧在队列里最多能等多久；超过了，就不发了，直接扔掉' },
  ],
  picture: [
    { heading: '没人回答', text: '站点（STA）听不见自己那一帧有没有到。它只知道，自己等的那个来自接入点（AP）的确认帧（ACK）一直没来。于是它把同一帧原样再发一次——这就是重传（retry）——位置仍在队列（queue）最前面，只是置上一个比特，好让接收端分得清这是重复的还是新的。' },
    { heading: '每一次尝试都比上一次贵', text: '重传不只是“把那一帧再来一遍”。发送方把这份沉默当成人多的信号，于是把竞争窗口（CW）翻倍、抽一个更长的退避（backoff）值，结果每一次新的尝试都比上一次开始得更晚。帧本身往往也发得更慢：连着失败几次之后，无线电会降到一种更结实、也更慢的发法上，帧在空中拉得更长，也就成了下一次碰撞更大的靶子。' },
    { kind: 'watch', jump: 0, heading: '盯住一帧', text: '载入仿真，跳到第一次重传。盯住左边那台上传站点的某一帧：同一帧一次、又一次地发出去，每次尝试都比上次隔得更远——直到它不再出现。' },
    { heading: '七次之后，放手', text: '没有哪一帧可以永远重来。每一帧都记着自己已经被发过多少次，而这个数的上限叫做重传上限（retry limit）——这里是七。一到这个数，这一帧就被放弃，后面那一帧挪到队首。这不是规则出了问题，正是规则在起作用：一条七次都推不过去的链路，七十次也推不过去。' },
    { heading: '它身后的队伍', text: '上面的应用还在不停地交下新的帧，它们排成一列等着轮到自己，这就是队列。它们要等信道——也要等排在前面那一帧的每一次尝试。队首一帧发不动，后面一百帧都跟着卡住。一次重传真正的代价，从来不是它烧掉的那点空口时间（airtime），而是它塞给其余所有帧的那段等待。' },
    { heading: '过时的数据不如没有', text: '所以一帧身上除了计数，还有一只钟，而这只钟的上限叫做它的生存期（MSDU lifetime）——这里是半秒。在队列里等得比这还久，无线电里决定什么时候开口的那一部分——也就是媒体访问控制（MAC）——就把它扔掉，不再给它上空口的机会。对一个视频帧或一段语音采样来说，这么做完全正确：它本该属于的那一刻已经过去了，迟到地送达只会花掉空口时间，对谁都没有好处。' },
    { heading: '当队伍满了', text: '队列还有一个上限。队列一满，新到的帧就在门口被挡回去，根本进不了队。这是唯一一种与链路无关、只与负载有关的损失：交下来的流量超过了信道能搬走的量，只有减少流量或腾出更多空口时间才治得了。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一帧要走的流程，一步一步', items: [
      '上面交下来的一帧，排到队尾——前提是队里等着的还不到 500 帧。第 501 帧会在门口被挡回去，根本不进队。',
      '每次要组一帧发出去之前，MAC 先把队列里等过了生存期（这里是 500 ms）的帧统统扔掉。接入点扔掉的 194 帧里，有 188 帧连一次空口都没轮上过。',
      '队首那一帧发出去，发送方同时起一只钟：回答必须在这一帧结束后的 45 µs 之内开始——16 µs 的间隔、一个 9 µs 的时隙（slot time），再加电台报出“开始收了”所需的 20 µs。',
      '钟走完了还没动静，就有三个计数往前走：这一帧自己的尝试次数加一；这条队列的连续失败次数加一；竞争窗口则加宽成自己的两倍再加一，最多到 1023。',
      '这一帧随后被放回队首，重新排上号发送：序列号照旧，只是带上了重发比特（Retry bit）——所以每一次尝试都是同一帧，不是新的一帧。',
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
    { heading: '这张表怎么读', text: '七次尝试的序列号都是同一个。速率每失败两次降一档，于是第一次尝试占 276 µs 空口时间，第七次要 704 µs。排在它后面那一帧直到 27 741 µs 才发出去，序列号是新的，重发比特清零。' },
    { kind: 'table', heading: '一帧被放弃的三种原因', head: [
      '日志里写的', '什么时候触发', '它的含义',
    ], rows: [
      ['retryLimit', '同一帧的第七次尝试失败了', '链路在失败——要修的是链路'],
      ['lifetime', '它在队列里等了超过 500 ms', '数据已经过时，丢掉它是对的'],
      ['queueFull', '新帧到达时已有 500 帧在等', '过载——要么减负，要么扩容'],
    ] },
    { kind: 'table', heading: '同样的三秒，三种设置', head: [
      '运行', '门口挡回', 'AP 处过时',
      '上传被放弃', 'AP 送达',
    ], rows: [
      ['默认：500 帧、500 ms', '213', '194', '123', '2644'],
      ['短队列：100 帧', '797', '0', '123', '2644'],
      ['短生存期：100 ms', '0', '770', '40', '2644'],
    ] },
    { heading: '旋钮做不到的事', text: '三次运行里 AP 送达的都是同样的 2644 个视频帧：缓冲区变不出空口时间。短队列把损失挪到门口；短生存期把它挪到钟上，两台上传站点因此有 987 帧老死在队列里。' },
    { kind: 'table', heading: '送达的帧等了多久', head: [
      '送达时段', '平均等待，默认',
    ], rows: [
      ['0–0.5 s', '19 ms'],
      ['0.5–1 s', '149 ms'],
      ['1–1.5 s', '228 ms'],
      ['1.5–2 s', '324 ms'],
      ['2–2.5 s', '472 ms'],
      ['2.5–3 s', '472 ms'],
    ] },
  ],
  deeper: [
    { heading: '两个计数器，不是一个', text: '“是否放弃这一帧”看的是这一帧自己的尝试计数。“是否把窗口加宽”看的是另一个计数器：它属于队列而不是某一帧，任何一次成功都会让它复位。当同一帧被反复捶打时，两者步调一致；而一旦有帧因为年龄被丢掉，它们就分道扬镳：504 465 µs 处 Hidden B 一次丢掉三个老帧，紧接着那一帧第一次失败时读数是 retries = 1，而队列计数器已经是 6；第二次是 2 对 7——到这里窗口弹回 15，尽管这一帧七次机会才用掉两次。' },
    { heading: '队头阻塞', text: '那三个老帧从仿真的第一个瞬间起就在队列里了。它们本身没有任何问题。它们排在一群各自烧掉好几次尝试的前辈后面，结果是年龄上限先找到了它们，而不是信道。这就是本场景里最干净的一幅队头阻塞图景。' },
    { heading: '在块确认协议下', text: '当许多帧作为一次突发发出、并被一起确认时，发送方只重发位图报告缺失的那几块，每一块仍受自己的尝试计数与年龄上限约束。本仿真器还没有建模这件事：一个聚合帧要么整体成功、要么整体失败。第二阶段的聚合课会补上它。' },
  ],
  sources: [
    '两个计数器见 IEEE Std 802.11-2024 §10.23.2.2：dot11ShortRetryLimit = 7 决定每个 MSDU 何时被丢弃，而每个接入类别一个的 QSRC 驱动 CW = min(2·CW + 1, CWmax)。802.11-2016 还有一套用于长帧的 SLRC 与 dot11LongRetryLimit = 4（超过 RTS 门限时适用），802.11-2020 已删除。',
    '重复帧检测（凭发送地址、序列号与 Retry = 1）见 §10.3.2.14；MSDU 生存期即 dot11EDCATableMSDULifetime。',
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
    J('第一次因生存期丢帧（Hidden B）', dropOf('lifetime', 'sta-2')),
    J('第一次因队列满丢帧（AP）', dropOf('queueFull', 'ap')),
    J('AP 第一次因生存期丢帧', dropOf('lifetime', 'ap')),
  ],
  observe: [
    '27 689 µs 放弃那一帧时，Hidden B 同一瞬间记下丢弃与窗口复位为 15；它的下一帧序列号是 1，重发比特清零。',
    '选中 AP 并播放。队列计数涨了两秒，队首帧的年龄逼近 500 ms；1 963 852 µs 第一次队列满丢帧后，两种损失交替出现。',
    '跳到 Hidden B 第一次因生存期丢帧：三帧在同一瞬间被丢掉，它们从仿真开始就在队列里，一次都没发出去过。',
  ],
  tryThis: [
    '依次载入两个变体，去找 AP 第一次队列满丢帧与第一次生存期丢帧。先预测每个变体缺哪一种，以及为什么三次运行送达的都是 2644 帧。',
    '在编辑器里把 RTS 门限（RTS threshold）设为 500 B——隐藏节点（hidden station）那一课给你的解法——再重新载入。看看两台上传站点的“放弃”和 AP 的队列。',
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
      q: 'AP 的日志里满是 queueFull。诊断是什么？',
      options: [
        '到那个客户端的链路在失败',
        '这些帧已经过时',
        '交下来的流量超过了信道能搬走的量',
      ],
      answer: 2,
      explain: '到达的速度快过离开的速度。链路失败表现为 retryLimit，数据过时表现为 lifetime。',
    },
    {
      q: '你把队列从 100 帧加大到 500 帧。会有什么变化？',
      options: [
        'AP 送达的帧更多了',
        '送达的还是那 2644 帧，只是更晚，损失从门口挪到了钟上',
        '什么都不会变',
      ],
      answer: 1,
      explain: '更大的缓冲区造不出空口时间，只会让帧等得更久。默认设置下，最后一秒的平均等待是 472 ms。',
    },
  ],
}
